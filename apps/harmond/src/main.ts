/**
 * main.ts — Standalone daemon entry point
 *
 * When harmond is run directly (e.g. `node dist/src/index.js`), this
 * module creates the daemon, starts it, and registers process signal
 * handlers for graceful shutdown.
 *
 * Separated from index.ts so the class definition can be imported
 * without side-effects in tests and libraries.
 *
 * @module main
 */

import { pathToFileURL } from 'node:url';
import { createDaemon, Harmond } from './index.js';

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;

if (isMain) {
  let daemon: Harmond;
  try {
    daemon = createDaemon();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error('Failed to initialize harmond:', message);
    process.exit(1);
  }

  const failFast = async (label: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(label, message);
    try {
      await daemon.stop();
    } catch {
      // Ignore shutdown failures during fatal exit because the process is terminating anyway.
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
      console.error('Shutdown failed:', error instanceof Error ? error.message : String(error));
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
}
