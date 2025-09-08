#!/usr/bin/env node
import { spawn } from 'node:child_process';

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
  p.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
  return p;
}

// Start TypeScript compiler in watch mode
const tsc = run('pnpm', ['run', 'build:watch']);

// Once dist exists, start node with --watch; immediately starting is fine as --watch waits for changes
const node = run('node', ['--watch', 'dist/index.js']);

function shutdown() {
  try { tsc.kill(); } catch {}
  try { node.kill(); } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

