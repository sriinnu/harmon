#!/usr/bin/env node
/**
 * Harmon CLI entry point
 */

import { createCLI, getDefaultEndpoint } from '../dist/index.js';

async function main() {
  const endpoint = getDefaultEndpoint();
  const token = process.env.HARMON_API_TOKEN;
  const cli = createCLI({ endpoint, token });

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'status':
    case undefined:
      const status = await cli.status();
      console.log(JSON.stringify(status, null, 2));
      break;
    case 'devices':
      const devices = await cli.devices();
      console.log(JSON.stringify(devices, null, 2));
      break;
    case 'use':
      const deviceId = args[1];
      if (!deviceId) {
        console.error('Usage: harmon use <device-id>');
        process.exit(1);
      }
      await cli.useDevice(deviceId);
      console.log('Device switched');
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available commands: status, devices, use <device-id>');
  }
}

main().catch(console.error);
