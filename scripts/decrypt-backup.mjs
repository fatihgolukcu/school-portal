import { mkdtemp, copyFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { decryptArchive } from './backup-crypto.mjs';

// Decryption only: never connects to, resets or overwrites any database.
let staging;
try {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error('Usage: node scripts/decrypt-backup.mjs INPUT.spenc OUTPUT.tar.gz');
  const destination = resolve(output);
  let exists = false;
  try {
    await access(destination);
    exists = true;
  } catch {}
  if (exists) throw new Error('Output already exists; choose a new recovery path.');
  staging = await mkdtemp(join(tmpdir(), 'school-portal-decrypt-'));
  const temporary = join(staging, 'verified.tar.gz');
  await decryptArchive(resolve(input), temporary);
  // Authentication succeeds before any plaintext is handed to the operator.
  await copyFile(temporary, destination, constants.COPYFILE_EXCL);
  console.log('Authenticated archive decrypted. Follow the isolated restore runbook.');
} catch {
  console.error('Decryption failed. Check the key, input file and unused output path.');
  process.exitCode = 1;
} finally {
  if (
    staging &&
    dirname(resolve(staging)) === resolve(tmpdir()) &&
    resolve(staging).split(/[\\/]/).at(-1).startsWith('school-portal-decrypt-')
  )
    await rm(staging, { recursive: true, force: true });
}
