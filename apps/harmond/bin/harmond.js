#!/usr/bin/env node
/**
 * Harmond entry point
 */

import { createDaemon } from '../dist/index.js';

const daemon = createDaemon();
daemon.start();
console.log('Harmond started');
