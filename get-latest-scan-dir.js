
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scansDir = path.join(__dirname, 'scans');

try {
  if (!fs.existsSync(scansDir)) {
    // No scans directory, so no latest.
    process.exit(0);
  }

  const directories = fs.readdirSync(scansDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => ({
      name: dirent.name,
      time: fs.statSync(path.join(scansDir, dirent.name)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  if (directories.length > 0) {
    process.stdout.write(directories[0].name);
  }
} catch (error) {
  console.error('Error getting latest scan directory:', error);
  process.exit(1);
}
