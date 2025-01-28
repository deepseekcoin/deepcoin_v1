#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

// Start the server using ts-node
const server = spawn('node', [
  '--loader',
  'ts-node/esm',
  '--experimental-specifier-resolution=node',
  serverPath
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TS_NODE_PROJECT: join(__dirname, '..', 'tsconfig.json')
  }
});

// Handle process termination
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});

server.on('close', (code) => {
  process.exit(code || 0);
});
