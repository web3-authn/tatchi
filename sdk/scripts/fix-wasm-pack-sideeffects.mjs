#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasUnsupportedSideEffectsGlobs(sideEffects) {
  if (!Array.isArray(sideEffects)) return false;
  return sideEffects.some((value) => {
    return (
      typeof value === 'string' &&
      value.startsWith('./snippets/') &&
      value.includes('*')
    );
  });
}

async function fixPkgDir(pkgDir) {
  const packageJsonPath = path.join(pkgDir, 'package.json');
  if (!(await fileExists(packageJsonPath))) return;

  const raw = await fs.readFile(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!hasUnsupportedSideEffectsGlobs(parsed.sideEffects)) return;

  const snippetsDir = path.join(pkgDir, 'snippets');
  if (!(await fileExists(snippetsDir))) {
    parsed.sideEffects = false;
    await fs.writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
    return;
  }

  const files = await listFilesRecursively(snippetsDir);
  const sideEffectFiles = Array.from(
    new Set(
      files
        .map((absoluteFile) => {
          const rel = path.relative(pkgDir, absoluteFile);
          const relPosix = toPosixPath(rel);
          if (!relPosix.startsWith('snippets/')) return null;
          return `./${relPosix}`;
        })
        .filter(Boolean)
    )
  ).sort();

  parsed.sideEffects = sideEffectFiles.length > 0 ? sideEffectFiles : false;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function main() {
  const pkgDirs = process.argv.slice(2);
  if (pkgDirs.length === 0) {
    console.error('Usage: fix-wasm-pack-sideeffects.mjs <pkgDir...>');
    process.exit(1);
  }

  for (const pkgDir of pkgDirs) {
    await fixPkgDir(pkgDir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

