#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const res = spawnSync('bun', ['--version'], { stdio: 'ignore' });
if (res.error || res.status !== 0) {
  console.error('\n[relay-server] Bun is required for the dev server (bun --hot).');
  console.error('Install Bun and try again:');
  console.error('  curl -fsSL https://bun.sh/install | bash');
  console.error('Then restart your shell and run: pnpm -C examples/relay-server dev\n');
  process.exit(1);
}

