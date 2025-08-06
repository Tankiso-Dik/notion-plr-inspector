import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url'; // Needed for __dirname in ESM

// Promisify execFile for async/await usage
const execFileAsync = promisify(execFile);

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('get-latest-scan-dir selects the most recent scan directory', async () => {
  let tmpDir; // Declare tmpDir outside try to ensure it's accessible in finally

  try {
    // Create a temporary directory for isolated testing
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-test-'));

    // Define the source path of the script to be tested. The implementation
    // lives one directory up from this test file, so resolve it relative to
    // the repository root.
    const scriptSrc = path.resolve(__dirname, '../get-latest-scan-dir.js');
    // Define the destination path within the temporary directory
    const scriptDest = path.join(tmpDir, 'get-latest-scan-dir.js');

    // Copy the script to the temporary directory to ensure the test runs against a clean copy
    await fs.copyFile(scriptSrc, scriptDest);

    // Create the 'scans' directory inside the temporary directory
    const scansDir = path.join(tmpDir, 'scans');
    await fs.mkdir(scansDir, { recursive: true });

    // Create two subdirectories for testing: 'old' and 'new'
    const oldDir = path.join(scansDir, 'old');
    const newDir = path.join(scansDir, 'new');

    await fs.mkdir(oldDir);
    await fs.mkdir(newDir);

    // Set the modification times to ensure 'newDir' is more recent
    const oldTime = new Date(0); // Epoch
    const newTime = new Date(); // Current time

    await fs.utimes(oldDir, oldTime, oldTime);
    await fs.utimes(newDir, newTime, newTime);

    // Execute the script using 'node' from within the temporary directory
    // This ensures the script looks for 'scans' relative to its own location
    const { stdout } = await execFileAsync(process.execPath, [scriptDest], {
      cwd: tmpDir, // Set current working directory to the temporary directory
      encoding: 'utf8',
    });

    // Assert that the script outputs the name of the 'new' directory
    assert.strictEqual(stdout.trim(), 'new');

  } finally {
    // Clean up the temporary directory and all its contents
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
});
