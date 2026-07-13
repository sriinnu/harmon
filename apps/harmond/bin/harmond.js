#!/usr/bin/env node
/**
 * Harmond entry point — with signal handling and proper error propagation
 */

// Load ./.env from the working directory before the daemon module is
// imported (some module-level constants read process.env at load time).
// Already-exported variables take precedence; a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env present
}

// Secrets still missing after env + .env fall back to the macOS Keychain
// (service "harmon", account = variable name).
const { loadKeychainSecrets } = await import('./keychain-env.js');
loadKeychainSecrets();

const { createDaemon } = await import('../dist/src/index.js');

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
    // I ignore shutdown failures during fatal exit because the process is terminating anyway.
  }
  process.exit(1);
};

daemon.start().then(() => {
  console.log('Harmond started');
}).catch((err) => {
  void failFast('Failed to start harmond:', err);
});

// Graceful shutdown on signals
const shutdown = async () => {
  console.log('\nShutting down...');
  try {
    await daemon.stop();
    process.exit(0);
  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Catch unhandled rejections
process.on('uncaughtException', (error) => {
  void failFast('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  void failFast('Unhandled rejection:', reason);
});
