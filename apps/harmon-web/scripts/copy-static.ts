/**
 * I copy the static web shell into the built web app directory.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceDir = resolve('static');
const targetDir = resolve('dist');

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

cpSync(sourceDir, targetDir, { recursive: true });
