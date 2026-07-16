/**
 * bundle.ts — Bundle the Harmon CLI into a standalone single-file distribution
 *
 * Uses esbuild to resolve all workspace dependencies (harmon-protocol, etc.)
 * into a single JS file that can be published to npm and installed globally
 * without the monorepo.
 *
 * Run after `tsc` so that `dist/index.js` exists for the bin entry to resolve.
 *
 *   pnpm build          # tsc  -> dist/index.js + dist/index.d.ts
 *   pnpm build:bundle   # esbuild -> dist/bin/harmon.js (standalone)
 */

import { build, type Plugin } from 'esbuild';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const pkg = JSON.parse(
  readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'),
);

/**
 * esbuild plugin that strips shebang lines from entry points so the
 * banner option can add exactly one clean shebang to the output.
 *
 * Also replaces the runtime `readFileSync(…/package.json)` version
 * lookup with a build-time constant so the bundle doesn't need
 * package.json on disk at runtime.
 */
const cliPlugin: Plugin = {
  name: 'harmon-cli-bundle',
  setup(b) {
    // Strip shebangs so the banner produces exactly one
    b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      let source = readFileSync(args.path, 'utf8');
      let modified = false;

      // Strip duplicate shebang
      if (source.startsWith('#!')) {
        source = source.replace(/^#!.*\n/, '');
        modified = true;
      }

      // Replace the runtime package.json version read with a constant.
      // Original code:
      //   const packageVersion =
      //     JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '0.0.0';
      const versionPattern =
        /JSON\.parse\(readFileSync\(new URL\(['"]\.\.\/package\.json['"],\s*import\.meta\.url\),\s*['"]utf8['"]\)\)\.version\s*\|\|\s*['"]0\.0\.0['"]/;
      if (versionPattern.test(source)) {
        source = source.replace(versionPattern, JSON.stringify(pkg.version));
        modified = true;
      }

      return modified
        ? { contents: source, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
        : undefined;
    });
  },
};

async function bundle() {
  // 1. Bundle the TypeScript SDK (src/index.ts)
  //    Keep commander external — CLI consumers who import the SDK programmatically
  //    already have it, and it avoids duplicating the dep in the binary bundle below.
  await build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    external: ['commander'],
    sourcemap: true,
    banner: { js: '// @ts-nocheck\n' },
  });

  // 2. Bundle the CLI binary (bin/harmon.js + bin/listen.js + bin/runtime.js)
  //    This produces a single self-contained file that can run without
  //    node_modules. Everything is inlined, including commander.
  await build({
    entryPoints: ['bin/harmon.js'],
    outfile: 'dist/bin/harmon.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    external: ['commander'],  // Keep as runtime dep — it's CJS and available from npm
    plugins: [cliPlugin],
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node\n' },
  });

  // 3. Bundle the daemon binary (bin/harmond.js → dist/bin/harmond.js)
  //    Bundles ALL dependencies including CJS packages. The banner includes
  //    a createRequire shim so CJS modules work in the ESM bundle.
  await build({
    entryPoints: ['bin/harmond.js'],
    outfile: 'dist/bin/harmond.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    external: [
      // libsql uses platform-specific native binaries — keep entire tree external
      '@libsql/client',
      '@libsql/*',
      'libsql',
    ],
    plugins: [cliPlugin],
    sourcemap: false,
    banner: {
      js: [
        '#!/usr/bin/env node',
        'import { createRequire } from "node:module";',
        'const require = createRequire(import.meta.url);',
      ].join('\n'),
    },
  });

  // 4. Bundle the MCP server binary (bin/harmon-mcp.js → dist/bin/harmon-mcp.js)
  await build({
    entryPoints: ['bin/harmon-mcp.js'],
    outfile: 'dist/bin/harmon-mcp.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    external: [
      '@libsql/client',
      '@libsql/*',
      'libsql',
    ],
    plugins: [cliPlugin],
    sourcemap: false,
    banner: {
      js: [
        '#!/usr/bin/env node',
        'import { createRequire } from "node:module";',
        'const require = createRequire(import.meta.url);',
      ].join('\n'),
    },
  });

  // 5. Ship the web player: copy harmon-web's build into dist/web so the
  //    bundled daemon can serve it at /app (see harmond/src/web-app.ts).
  const webDist = path.resolve(pkgRoot, '../harmon-web/dist');
  if (existsSync(path.join(webDist, 'index.html'))) {
    cpSync(webDist, path.join(pkgRoot, 'dist/web'), { recursive: true });
    console.log('Copied web player into dist/web');
  } else if (process.env.CI) {
    // A release build silently missing the advertised /app UI is worse than
    // a failed build.
    throw new Error('harmon-web dist not found — refusing to bundle without the /app UI in CI');
  } else {
    console.warn('harmon-web dist not found — package will ship without /app UI');
  }

  console.log(`Bundled @sriinnu/harmon v${pkg.version} (CLI + daemon + MCP + web)`);
}

bundle().catch((err: unknown) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
