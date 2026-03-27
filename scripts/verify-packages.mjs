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
];

/**
 * I normalize manifest paths into the `tar -tzf` package-root format.
 *
 * @param {string} filePath
 * @returns {string}
 */
function normalizePackPath(filePath) {
  return `package/${filePath.replace(/^\.\//, '')}`;
}

/**
 * I collect the manifest entrypoints that must exist inside the packed tarball.
 *
 * @param {string} packageDir
 * @returns {string[]}
 */
function collectExpectedPackFiles(packageDir) {
  const manifestPath = path.join(REPO_ROOT, packageDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expected = new Set();

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

  return Array.from(expected).sort();
}

/**
 * I pack one workspace package into a temporary directory and return the tarball path.
 *
 * @param {string} packageDir
 * @param {string} tempDir
 * @returns {string}
 */
function packWorkspacePackage(packageDir, tempDir) {
  execFileSync('pnpm', ['--dir', packageDir, 'pack', '--pack-destination', tempDir], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });

  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, packageDir, 'package.json'), 'utf8'));
  return path.join(tempDir, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);
}

/**
 * I list tarball files without unpacking them into the workspace.
 *
 * @param {string} tarballPath
 * @returns {Set<string>}
 */
function listTarballFiles(tarballPath) {
  const output = execFileSync('tar', ['-tzf', tarballPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return new Set(output.split('\n').map((line) => line.trim()).filter(Boolean));
}

/**
 * I make sure packed manifests no longer expose workspace protocol dependencies.
 *
 * @param {string} tarballPath
 */
function assertNoWorkspaceProtocols(tarballPath) {
  const packedManifest = execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (packedManifest.includes('workspace:*')) {
    throw new Error(`Packed manifest still contains workspace protocol references: ${tarballPath}`);
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
  }

  console.log(`Verified packed publish surfaces for ${PACKAGE_DIRS.length} workspace packages.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
