/**
 * I persist auth state JSON on disk, encrypting it at rest with
 * @sriinnu/harmon-crypto whenever HARMON_ENCRYPTION_SECRET is configured.
 *
 * On disk the value is either legacy plaintext JSON or an envelope of the
 * shape `{ encrypted: true, data: '<ciphertext>' }`. Reads accept both, so
 * legacy plaintext files keep loading; if a secret is configured, the file is
 * re-encrypted on the next write.
 */

import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createEncryptor, type Encryptor } from '@sriinnu/harmon-crypto';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface EncryptedEnvelope {
  encrypted: true;
  data: string;
}

const MIN_SECRET_LENGTH = 32;
let warnedPlaintext = false;
let warnedInvalidSecret = false;

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EncryptedEnvelope).encrypted === true &&
    typeof (value as EncryptedEnvelope).data === 'string'
  );
}

/**
 * I resolve an encryptor from HARMON_ENCRYPTION_SECRET, treating an invalid
 * (too short) secret as unset after warning once.
 */
function resolveEncryptor(): Encryptor | null {
  const secret = process.env.HARMON_ENCRYPTION_SECRET;
  if (!secret) {
    return null;
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    if (!warnedInvalidSecret) {
      warnedInvalidSecret = true;
      console.error(`HARMON_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters; storing tokens unencrypted.`);
    }
    return null;
  }
  return createEncryptor({ secret });
}

/**
 * I load JSON state from disk when it exists, decrypting encrypted envelopes
 * and passing legacy plaintext files through unchanged.
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!isEncryptedEnvelope(parsed)) {
    return parsed as T;
  }

  const encryptor = resolveEncryptor();
  if (!encryptor) {
    throw new Error(
      `${path.basename(filePath)} is encrypted at rest. Set HARMON_ENCRYPTION_SECRET to the secret it was encrypted with.`
    );
  }
  try {
    return JSON.parse(encryptor.decrypt(parsed.data)) as T;
  } finally {
    encryptor.destroy();
  }
}

/**
 * I persist JSON state (encrypted when a secret is configured) and remove the
 * file when the value is null.
 */
export async function writeJson(filePath: string, value: JsonValue | null): Promise<void> {
  await mkdir(path.dirname(filePath), { mode: 0o700, recursive: true });
  if (value == null) {
    await rm(filePath, { force: true });
    return;
  }

  const encryptor = resolveEncryptor();
  let serialized: string;
  if (encryptor) {
    try {
      const envelope: EncryptedEnvelope = { encrypted: true, data: encryptor.encrypt(JSON.stringify(value)) };
      serialized = JSON.stringify(envelope, null, 2);
    } finally {
      encryptor.destroy();
    }
  } else {
    if (!warnedPlaintext) {
      warnedPlaintext = true;
      console.error('Tokens are stored unencrypted; set HARMON_ENCRYPTION_SECRET (32+ chars) to encrypt them at rest.');
    }
    serialized = JSON.stringify(value, null, 2);
  }

  await writeFile(filePath, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(filePath, 0o600);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === 'object' && 'code' in error;
}
