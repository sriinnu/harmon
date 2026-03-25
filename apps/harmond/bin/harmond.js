#!/usr/bin/env node
/**
 * Harmond entry point — with signal handling and proper error propagation
 */

import { createDaemon } from '../dist/index.js';

const daemon = createDaemon();

daemon.start().then(() => {
  console.log('Harmond started');
}).catch((err) => {
  console.error('Failed to start harmond:', err.message || err);
  process.exit(1);
});

// Graceful shutdown on signals
const shutdown = async () => {
  console.log('\nShutting down...');
  try {
    await daemon.stop();
  } catch (err) {
    console.error('Shutdown error:', err);
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Catch unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
