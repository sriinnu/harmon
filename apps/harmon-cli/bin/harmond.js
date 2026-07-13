#!/usr/bin/env node
/**
 * harmond — Standalone daemon entry point for the bundled distribution.
 *
 * This file is bundled by esbuild into dist/bin/harmond.js alongside
 * the CLI binary. It imports the daemon class from the harmond package,
 * starts it, and registers signal handlers for graceful shutdown.
 *
 * Usage:
 *   harmond                     # Start with env vars
 *   npx @sriinnu/harmon harmond # Via npx
 */

// Load ./.env before the daemon module is imported (module-level constants
// read process.env at load time); exported variables take precedence.
try {
  process.loadEnvFile();
} catch {
  // no .env present
}

// Secrets still missing after env + .env fall back to the macOS Keychain
// (service "harmon", account = variable name).
const { loadKeychainSecrets } = await import('./keychain-env.js');
loadKeychainSecrets();

const { createDaemon } = await import('../../../apps/harmond/src/index.ts');

let daemon;
try {
  daemon = createDaemon();
} catch (error) {
  console.error('Failed to initialize harmond:', error instanceof Error ? error.message : error);
  process.exit(1);
}

const failFast = async (label, error) => {
  console.error(label, error instanceof Error ? error.message : error);
  try {
    await daemon.stop();
  } catch {
    // Ignore shutdown failures during fatal exit.
  }
  process.exit(1);
};

daemon.start().then(() => {
  console.log('Harmond listening');
}).catch((err) => {
  void failFast('Failed to start:', err);
});

const shutdown = async () => {
  try {
    await daemon.stop();
    process.exit(0);
  } catch (error) {
    console.error('Shutdown failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  void failFast('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  void failFast('Unhandled rejection:', reason);
});
