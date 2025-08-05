import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

test('selects the most recent scan directory', async () => {
  const scansDir = path.join(repoRoot, 'scans');

  await fs.mkdir(scansDir, { recursive: true });

  const olderDir = path.join(scansDir, 'older');
  const newerDir = path.join(scansDir, 'newer');

  await fs.mkdir(olderDir);
  await fs.mkdir(newerDir);

  const oldTime = new Date(0); // Epoch
  const newTime = new Date(1000); // Slightly newer

  await fs.utimes(olderDir, oldTime, oldTime);
  await fs.utimes(newerDir, newTime, newTime);

  try {
    const { stdout } = await execFileAsync('node', ['get-latest-scan-dir.js'], {
      cwd: repoRoot,
    });

    assert.equal(stdout.trim(), 'newer');
  } finally {
    await fs.rm(scansDir, { recursive: true, force: true });
  }
});

