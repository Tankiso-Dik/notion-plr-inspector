import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('get-latest-scan-dir selects most recent directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
  try {
    const scriptSrc = path.resolve('get-latest-scan-dir.js');
    const scriptDest = path.join(tmpDir, 'get-latest-scan-dir.js');
    fs.copyFileSync(scriptSrc, scriptDest);

    const scansDir = path.join(tmpDir, 'scans');
    fs.mkdirSync(scansDir);

    const oldDir = path.join(scansDir, 'old');
    const newDir = path.join(scansDir, 'new');
    fs.mkdirSync(oldDir);
    fs.mkdirSync(newDir);

    const oldTime = new Date(0);
    const newTime = new Date();
    fs.utimesSync(oldDir, oldTime, oldTime);
    fs.utimesSync(newDir, newTime, newTime);

    const output = execFileSync(process.execPath, [scriptDest], {
      encoding: 'utf8',
    }).trim();

    assert.strictEqual(output, 'new');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
