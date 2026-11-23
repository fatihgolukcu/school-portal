// Run on a trusted job runner with pg_dump, tar and Node 22. Secrets are only
// environment variables; neither command arguments nor logs contain credentials.
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { backupKey, encryptArchive, decryptArchive, fileHash } from './backup-crypto.mjs';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`CONFIG_${name}`);
  return value;
};
function command(executable, args, env = process.env) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    // Tool errors may include connection information: report a code, never stderr.
    child.stderr.resume();
    child.on('error', () => reject(new Error('BACKUP_TOOL_UNAVAILABLE')));
    child.on('close', (code) =>
      code === 0 ? accept() : reject(new Error('BACKUP_EXPORT_FAILED')),
    );
  });
}
async function responseJson(response, stage) {
  if (!response.ok) throw new Error(`${stage}_HTTP_${response.status}`);
  return response.json();
}
async function driveToken() {
  return (
    await responseJson(
      await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        body: new URLSearchParams({
          client_id: required('GOOGLE_CLIENT_ID'),
          client_secret: required('GOOGLE_CLIENT_SECRET'),
          refresh_token: required('GOOGLE_REFRESH_TOKEN'),
          grant_type: 'refresh_token',
        }),
      }),
      'OAUTH',
    )
  ).access_token;
}
async function uploadToDrive(file, token, scope, checksum) {
  const name = `school-portal-${new Date().toISOString().replaceAll(':', '-')}.tar.gz.spenc`;
  const size = (await stat(file)).size;
  const metadata = {
    name,
    parents: [required('BACKUP_DRIVE_FOLDER_ID')],
    appProperties: { application: 'school-portal-backup-v1', scope, sha256: checksum },
  };
  const start = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!start.ok || !start.headers.get('location'))
    throw new Error(`DRIVE_START_HTTP_${start.status}`);
  const target = new URL(start.headers.get('location'));
  if (target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com')
    throw new Error('DRIVE_UPLOAD_TARGET_INVALID');
  const uploaded = await responseJson(
    await fetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
      body: Readable.toWeb(createReadStream(file)),
      duplex: 'half',
      signal: AbortSignal.timeout(1800000),
    }),
    'DRIVE_UPLOAD',
  );
  if (
    !uploaded.id ||
    Number(uploaded.size) !== size ||
    uploaded.md5Checksum !== (await fileHash(file, 'md5'))
  )
    throw new Error('DRIVE_CHECKSUM_MISMATCH');
  return uploaded;
}
async function prune(token, scope, newestId) {
  const folder = required('BACKUP_DRIVE_FOLDER_ID');
  if (!/^[a-zA-Z0-9_-]+$/.test(folder)) throw new Error('DRIVE_FOLDER_INVALID');
  let page;
  const files = [];
  do {
    const params = new URLSearchParams({
      q: `'${folder}' in parents and trashed=false and appProperties has { key='application' and value='school-portal-backup-v1' } and appProperties has { key='scope' and value='${scope}' }`,
      fields: 'nextPageToken,files(id,createdTime,appProperties)',
      pageSize: '1000',
      orderBy: 'createdTime desc',
    });
    if (page) params.set('pageToken', page);
    const result = await responseJson(
      await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      }),
      'DRIVE_LIST',
    );
    files.push(...result.files);
    page = result.nextPageToken;
  } while (page);
  // Retain the newest successful artifact even if listing is eventually consistent.
  const keep = new Set([newestId]);
  const daily = new Set();
  const weekly = new Set();
  for (const file of files) {
    const day = file.createdTime.slice(0, 10);
    if (!daily.has(day) && daily.size < 14) {
      daily.add(day);
      keep.add(file.id);
    }
    const week = Math.floor(
      (new Date(file.createdTime).getTime() - Date.UTC(1970, 0, 5)) / 604800000,
    );
    if (!weekly.has(week) && weekly.size < 8) {
      weekly.add(week);
      keep.add(file.id);
    }
  }
  for (const file of files.filter((f) => !keep.has(f.id))) {
    // Trash only this app's artifacts in this project's folder; never permanently
    // delete files or act on an arbitrary caller-supplied Drive ID.
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error(`DRIVE_RETENTION_HTTP_${response.status}`);
  }
}
async function backupObjects(db, directory) {
  const objects = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from('learning_materials')
      .select('id,object_key,status')
      .not('object_key', 'is', null)
      .in('status', ['ready', 'archived'])
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error('MATERIAL_MANIFEST_FAILED');
    for (const material of data) {
      const { data: file, error: downloadError } = await db.storage
        .from('learning-materials')
        .download(material.object_key);
      if (downloadError || !file) throw new Error('MATERIAL_DOWNLOAD_FAILED');
      if (file.size !== Number(material.file_size)) throw new Error('MATERIAL_SIZE_MISMATCH');
      // Use our generated ID as the filesystem name, never an untrusted object path.
      if (!/^[0-9a-f-]{36}$/i.test(material.id)) throw new Error('MATERIAL_ID_INVALID');
      const output = join(directory, `${material.id}.bin`);
      await writeFile(output, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
      objects.push({
        id: material.id,
        key: material.object_key,
        file: `objects/${material.id}.bin`,
        size: file.size,
        sha256: await fileHash(output),
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return objects;
}
async function failureAlert(code) {
  if (!process.env.BACKUP_ALERT_EMAIL || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    return;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [process.env.BACKUP_ALERT_EMAIL],
      subject: 'School Portal backup needs attention',
      text: `Backup did not finish successfully (${code}). Check the trusted job runner. No school record data is included in this alert.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('BACKUP_ALERT_FAILED');
}

let directory;
let db;
let runId;
try {
  const key = backupKey();
  const projectUrl = required('SUPABASE_URL');
  const scope = new URL(projectUrl).hostname.replace(/[^a-zA-Z0-9_-]/g, '-');
  db = createClient(projectUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: run, error: runError } = await db
    .from('backup_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (runError) throw new Error('BACKUP_STATUS_START_FAILED');
  runId = run.id;
  const database = new URL(required('BACKUP_DATABASE_URL'));
  if (!['postgres:', 'postgresql:'].includes(database.protocol))
    throw new Error('DATABASE_URL_INVALID');
  directory = await mkdtemp(join(tmpdir(), 'school-portal-backup-'));
  await mkdir(join(directory, 'objects'), { mode: 0o700 });
  const dump = join(directory, 'database.dump');
  const exportEnv = {
    ...process.env,
    PGHOST: database.hostname,
    PGPORT: database.port || '5432',
    PGUSER: decodeURIComponent(database.username),
    PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: database.pathname.slice(1),
    PGSSLMODE: database.searchParams.get('sslmode') || 'require',
  };
  const exportArgs = [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--schema=public',
    '--schema=auth',
    '--schema=storage',
    `--file=${process.env.PG_DUMP_DOCKER_IMAGE ? '/backup/database.dump' : dump}`,
  ];
  if (process.env.PG_DUMP_DOCKER_IMAGE) {
    await command(
      'docker',
      [
        'run',
        '--rm',
        ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE'].flatMap(
          (name) => ['-e', name],
        ),
        '-v',
        `${directory}:/backup`,
        process.env.PG_DUMP_DOCKER_IMAGE,
        'pg_dump',
        ...exportArgs,
      ],
      exportEnv,
    );
  } else await command(process.env.PG_DUMP_BIN || 'pg_dump', exportArgs, exportEnv);
  const objects = await backupObjects(db, join(directory, 'objects'));
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      format: 1,
      created_at: new Date().toISOString(),
      project: scope,
      app_revision: process.env.BACKUP_APP_REVISION || process.env.GITHUB_SHA || null,
      database_sha256: await fileHash(dump),
      objects,
      notes:
        'Restore only into an isolated Supabase project; apply role grants/settings from migrations. Incomplete uploads are excluded. Immutable object backup may be a superset of the dump snapshot.',
    }),
    { mode: 0o600 },
  );
  const archive = join(directory, 'school.tar.gz');
  await command('tar', [
    '-czf',
    archive,
    '-C',
    directory,
    'database.dump',
    'manifest.json',
    'objects',
  ]);
  const encrypted = join(directory, 'school.spenc');
  await encryptArchive(archive, encrypted, key);
  const decrypted = join(directory, 'roundtrip.tar.gz');
  await decryptArchive(encrypted, decrypted, key);
  if ((await fileHash(archive)) !== (await fileHash(decrypted)))
    throw new Error('LOCAL_ROUNDTRIP_FAILED');
  const sha256 = await fileHash(encrypted);
  const token = await driveToken();
  const uploaded = await uploadToDrive(encrypted, token, scope, sha256);
  const { error: statusError } = await db
    .from('backup_runs')
    .update({
      status: 'verified',
      finished_at: new Date().toISOString(),
      drive_file_id: uploaded.id,
      sha256,
      object_count: objects.length,
    })
    .eq('id', runId);
  if (statusError) throw new Error('BACKUP_STATUS_FINISH_FAILED');
  await prune(token, scope, uploaded.id);
  console.log('Encrypted database and material backup uploaded and checksum verified.');
} catch (cause) {
  const code = /^[A-Z0-9_]+$/.test(cause.message || '') ? cause.message : 'BACKUP_FAILED';
  if (db && runId)
    await db
      .from('backup_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), failure_code: code })
      .eq('id', runId)
      .then(() => {})
      .catch(() => {});
  await failureAlert(code).catch(() => {
    console.error('Backup failure alert could not be delivered.');
  });
  console.error(code);
  process.exitCode = 1;
} finally {
  if (directory) {
    const target = resolve(directory);
    const root = resolve(tmpdir());
    if (dirname(target) !== root || !target.split(/[\\/]/).at(-1).startsWith('school-portal-backup-'))
      throw new Error('BACKUP_CLEANUP_PATH_INVALID');
    await rm(target, { recursive: true, force: true });
  }
}
