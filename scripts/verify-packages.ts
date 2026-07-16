#!/usr/bin/env node
/**
 * I verify that each packed workspace tarball includes the entrypoints its own
 * manifest declares, so CI catches broken publish surfaces before release.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const PACKAGE_DIRS = [
  'apps/harmond',
  'apps/harmon-cli',
  'packages/harmon-spotify',
  'packages/harmon-apple',
  'packages/harmon-youtube',
  'packages/harmon-logger',
  'packages/harmon-core',
  'packages/harmon-crypto',
  'packages/harmon-protocol',
  'packages/harmon-flow',
  'packages/harmon-store',
] as const;

type Manifest = {
  bin?: Record<string, unknown>;
  exports?: Record<string, unknown>;
  main?: string;
  name: string;
  scripts?: Record<string, unknown>;
  types?: string;
  version: string;
};

type ProfileEntrypoint = {
  args?: string[];
  command?: string;
  path?: string;
};

type Profile = {
  entrypoints?: Record<string, ProfileEntrypoint | undefined>;
};

/**
 * I normalize manifest paths into the root-relative tarball format `pnpm pack`
 * emits for this workspace.
 */
function normalizePackPath(filePath: string): string {
  return filePath.replace(/^\.\/+/u, '');
}

/**
 * I normalize a path that is declared relative to a subdirectory inside the
 * package, such as `.chitragupta-ecosystem/.profile.json`.
 */
function normalizePackPathFrom(baseDir: string, filePath: string): string {
  return normalizePackPath(path.posix.normalize(path.posix.join(baseDir, filePath)));
}

/**
 * I read JSON manifests with a typed fallback instead of trusting raw `unknown`.
 */
function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

/**
 * I collect the manifest entrypoints that must exist inside the packed tarball.
 */
function collectExpectedPackFiles(packageDir: string): string[] {
  const manifestPath = path.join(REPO_ROOT, packageDir, 'package.json');
  const manifest = readJsonFile<Manifest>(manifestPath);
  const expected = new Set<string>();

  if (typeof manifest.main === 'string') {
    expected.add(normalizePackPath(manifest.main));
  }
  if (typeof manifest.types === 'string') {
    expected.add(normalizePackPath(manifest.types));
  }
  if (manifest.exports && typeof manifest.exports === 'object') {
    for (const value of Object.values(manifest.exports)) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      for (const target of Object.values(value)) {
        if (typeof target === 'string' && target.startsWith('./')) {
          expected.add(normalizePackPath(target));
        }
      }
    }
  }
  if (manifest.bin && typeof manifest.bin === 'object') {
    for (const target of Object.values(manifest.bin)) {
      if (typeof target === 'string') {
        expected.add(normalizePackPath(target));
      }
    }
  }
  if (manifest.scripts && typeof manifest.scripts === 'object') {
    for (const script of Object.values(manifest.scripts)) {
      for (const target of collectNodeScriptTargets(script)) {
        expected.add(normalizePackPath(target));
      }
    }
  }

  const profilePath = path.join(REPO_ROOT, packageDir, '.chitragupta-ecosystem', '.profile.json');
  try {
    const profile = readJsonFile<Profile>(profilePath);
    if (typeof profile.entrypoints?.module?.path === 'string') {
      expected.add(normalizePackPathFrom('.chitragupta-ecosystem', profile.entrypoints.module.path));
    }

    for (const entrypoint of Object.values(profile.entrypoints ?? {})) {
      if (!entrypoint || typeof entrypoint !== 'object') {
        continue;
      }

      if (entrypoint.command === 'node' && Array.isArray(entrypoint.args)) {
        for (const target of entrypoint.args.flatMap((arg) => collectNodeScriptTargets(arg))) {
          expected.add(normalizePackPath(target));
        }
      }

      if ((entrypoint.command === 'npm' || entrypoint.command === 'pnpm') && Array.isArray(entrypoint.args)) {
        const [verb, scriptName] = entrypoint.args;
        if (verb === 'run' && typeof scriptName === 'string') {
          for (const target of collectNodeScriptTargets(manifest.scripts?.[scriptName])) {
            expected.add(normalizePackPath(target));
          }
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return Array.from(expected).sort();
}

/**
 * I extract node entrypoint paths from simple package scripts so auth and MCP
 * launchers are verified the same way as manifest `main` and `bin` targets.
 */
function collectNodeScriptTargets(script: unknown): string[] {
  if (typeof script !== 'string') {
    return [];
  }

  const match = script.match(/(?:^|\s)node(?:\s+--[^\s]+)*\s+(\.\/[^\s]+)/u);
  return match ? [match[1]] : [];
}

/**
 * I pack one workspace package into a temporary directory and return the tarball path.
 */
function packWorkspacePackage(packageDir: string, tempDir: string): string {
  execFileSync('pnpm', ['--dir', packageDir, 'pack', '--pack-destination', tempDir], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });

  const manifest = readJsonFile<Manifest>(path.join(REPO_ROOT, packageDir, 'package.json'));
  return path.join(tempDir, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);
}

/**
 * I list tarball files without unpacking them into the workspace.
 */
function listTarballFiles(tarballPath: string): Set<string> {
  const output = execFileSync('tar', ['-tzf', tarballPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return new Set(
    output
      .split('\n')
      .map((line) => line.trim().replace(/^package\//u, ''))
      .filter(Boolean),
  );
}

/**
 * I make sure packed manifests no longer expose workspace protocol dependencies.
 */
function assertNoWorkspaceProtocols(tarballPath: string): void {
  let packedManifest = '';
  const manifestCandidates = ['package.json', 'package/package.json'];

  for (const manifestPath of manifestCandidates) {
    try {
      packedManifest = execFileSync('tar', ['-xOf', tarballPath, manifestPath], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      break;
    } catch {
      // I try both common tarball layouts before failing the publish check.
    }
  }

  if (!packedManifest) {
    throw new Error(`Packed manifest could not be read from tarball: ${tarballPath}`);
  }

  if (packedManifest.includes('workspace:*')) {
    throw new Error(`Packed manifest still contains workspace protocol references: ${tarballPath}`);
  }
}

/**
 * I fail the publish check if built test artifacts leak into the tarball.
 */
function assertNoCompiledTestArtifacts(tarballFiles: Set<string>, packageDir: string): void {
  for (const file of tarballFiles) {
    if (/^dist\/.*\.(test|spec)\.(d\.)?[cm]?[jt]s$/u.test(file)) {
      throw new Error(`${packageDir} tarball includes compiled test artifact ${file}`);
    }
  }
}

/**
 * I fail the release gate if legacy scope or repo branding leaks back into the
 * workspace after the namespace migration.
 */
function assertNoLegacyBranding(): void {
  // git grep instead of rg: available everywhere (incl. CI runners) and
  // scoped to tracked files, which excludes node_modules/dist/coverage.
  try {
    const output = execFileSync('git', [
      'grep',
      '-nE',
      '@athena/|athena/harmon',
      '--',
      ':!pnpm-lock.yaml',
      ':!scripts/verify-packages.ts',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (output.trim()) {
      throw new Error(`Workspace still contains legacy @athena branding or athena/harmon repo references:\n${output}`);
    }
    return;
  } catch (error) {
    // git grep exits 1 when nothing matches — that is the success case.
    const exitCode = (error as NodeJS.ErrnoException & { status?: number }).status;
    if (exitCode === 1) {
      return;
    }
    throw error;
  }
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'harmon-pack-verify-'));

try {
  for (const packageDir of PACKAGE_DIRS) {
    const tarballPath = packWorkspacePackage(packageDir, tempDir);
    const tarballFiles = listTarballFiles(tarballPath);

    for (const expectedFile of collectExpectedPackFiles(packageDir)) {
      if (!tarballFiles.has(expectedFile)) {
        throw new Error(`${packageDir} tarball is missing declared entrypoint ${expectedFile}`);
      }
    }

    assertNoWorkspaceProtocols(tarballPath);
    assertNoCompiledTestArtifacts(tarballFiles, packageDir);
  }

  assertNoLegacyBranding();

  console.log(`Verified packed publish surfaces for ${PACKAGE_DIRS.length} workspace packages.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
