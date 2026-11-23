import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const header = Buffer.from('WKBACKUP1');
export function backupKey() {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_KEY_INVALID');
  return key;
}
export async function fileHash(file, algorithm = 'sha256') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function encryptArchive(input, output, key = backupKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const handle = await open(output, 'wx', 0o600);
  await handle.write(Buffer.concat([header, nonce]));
  await handle.close();
  await pipeline(
    createReadStream(input),
    cipher,
    createWriteStream(output, { flags: 'a', mode: 0o600 }),
  );
  await appendFile(output, cipher.getAuthTag());
}
export async function decryptArchive(input, output, key = backupKey()) {
  const size = (await stat(input)).size;
  if (size < header.length + 12 + 16) throw new Error('BACKUP_FORMAT_INVALID');
  const file = await open(input, 'r');
  const prefix = Buffer.alloc(header.length + 12);
  await file.read(prefix, 0, prefix.length, 0);
  const tag = Buffer.alloc(16);
  await file.read(tag, 0, tag.length, size - 16);
  await file.close();
  if (!prefix.subarray(0, header.length).equals(header)) throw new Error('BACKUP_FORMAT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, prefix.subarray(header.length));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(input, { start: prefix.length, end: size - 17 }),
    decipher,
    createWriteStream(output, { flags: 'wx', mode: 0o600 }),
  );
}
