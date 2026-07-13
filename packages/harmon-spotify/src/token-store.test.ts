import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, writeJson } from './token-store.js';

const SECRET = 'this-is-a-test-secret-of-32-chars!!';

describe('token-store', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'harmon-token-store-'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('round-trips tokens through the encrypted envelope when a secret is set', async () => {
    vi.stubEnv('HARMON_ENCRYPTION_SECRET', SECRET);
    const filePath = path.join(dir, 'tokens.json');
    const tokens = { accessToken: 'secret-token', expiresAt: 1234 };

    await writeJson(filePath, tokens);

    const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as { encrypted?: boolean; data?: string };
    expect(onDisk.encrypted).toBe(true);
    expect(typeof onDisk.data).toBe('string');
    expect(onDisk.data).not.toContain('secret-token');

    await expect(readJson(filePath)).resolves.toEqual(tokens);
  });

  it('still reads legacy plaintext files when a secret is set', async () => {
    vi.stubEnv('HARMON_ENCRYPTION_SECRET', SECRET);
    const filePath = path.join(dir, 'legacy.json');
    const tokens = { accessToken: 'legacy-token' };
    await writeFile(filePath, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');

    await expect(readJson(filePath)).resolves.toEqual(tokens);
  });

  it('writes plaintext (with a warning) when no secret is configured', async () => {
    vi.stubEnv('HARMON_ENCRYPTION_SECRET', '');
    const filePath = path.join(dir, 'plain.json');
    const tokens = { accessToken: 'plain-token' };

    await writeJson(filePath, tokens);

    const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
    expect(onDisk).toEqual(tokens);
    await expect(readJson(filePath)).resolves.toEqual(tokens);
  });

  it('refuses to read an encrypted file without the secret', async () => {
    vi.stubEnv('HARMON_ENCRYPTION_SECRET', SECRET);
    const filePath = path.join(dir, 'locked.json');
    await writeJson(filePath, { accessToken: 'locked-token' });

    vi.stubEnv('HARMON_ENCRYPTION_SECRET', '');
    await expect(readJson(filePath)).rejects.toThrow('encrypted at rest');
  });

  it('returns null for missing files and removes files on null writes', async () => {
    const filePath = path.join(dir, 'missing.json');
    await expect(readJson(filePath)).resolves.toBeNull();

    await writeJson(filePath, { accessToken: 'x' });
    await writeJson(filePath, null);
    await expect(readJson(filePath)).resolves.toBeNull();
  });
});
