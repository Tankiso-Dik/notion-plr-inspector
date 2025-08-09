#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUTPUTS = path.join(ROOT, 'outputs');
const HISTORY = path.join(ROOT, 'history');

function readJSON(p) {
  try {
    const t = fs.readFileSync(p, 'utf8');
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function listSnapshots(rootDir) {
  try {
    return fs.readdirSync(rootDir).filter((d) => /\d{8}_\d{6}/.test(d)).sort();
  } catch {
    return [];
  }
}

function unifiedDiff(a, b, filename) {
  if (a === b) return '';
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const diffs = [];
  // naive LCS-based diff is overkill; do a simple line-by-line walk
  const max = Math.max(aLines.length, bLines.length);
  diffs.push(`--- a/${filename}`);
  diffs.push(`+++ b/${filename}`);
  for (let i = 0; i < max; i++) {
    const al = aLines[i] ?? '';
    const bl = bLines[i] ?? '';
    if (al !== bl) {
      diffs.push(`@@ -${i + 1} +${i + 1} @@`);
      if (al) diffs.push(`-${al}`);
      if (bl) diffs.push(`+${bl}`);
    }
  }
  return diffs.join('\n');
}

// Sanitize JSON/text to reduce noisy diffs
function sanitizeTextForDiff(text, filename) {
  // Try JSON-aware scrubbing first
  try {
    const data = JSON.parse(text);
    const scrub = (v) => {
      if (v == null) return v;
      if (Array.isArray(v)) return v.map(scrub);
      if (typeof v === 'object') {
        const out = {};
        for (const [k, val] of Object.entries(v)) {
          if (k === 'expiry_time' || k === 'finishedAt') continue; // drop volatile timestamps
          out[k] = scrub(val);
        }
        return out;
      }
      if (typeof v === 'string') {
        // Strip query params from URLs (signed URLs, cache busters)
        if (/^https?:\/\//.test(v) && v.includes('?')) return v.replace(/\?.*$/, '');
        return v;
      }
      return v;
    };
    const sanitized = scrub(data);
    return JSON.stringify(sanitized, null, 2);
  } catch {
    // Fallback line-based scrub: remove URL query strings
    return text
      .split('\n')
      .map((line) => line.replace(/(https?:\/\/\S+?)\?.*/, '$1'))
      .join('\n');
  }
}

function snap() {
  const metaPath = path.join(OUTPUTS, 'scan_meta.json');
  const meta = readJSON(metaPath);
  if (!meta || !meta.snapshotKey) {
    console.error('No scan_meta.json found. Run npm run scan first.');
    process.exit(1);
  }
  const key = meta.snapshotKey;
  const histRoot = path.join(HISTORY, key);
  const ts = timestamp();
  const tsDir = path.join(histRoot, ts);
  ensureDir(tsDir);
  const files = listJsonFiles(OUTPUTS);
  for (const f of files) {
    try {
      const src = path.join(OUTPUTS, f);
      const dst = path.join(tsDir, f);
      fs.writeFileSync(dst, fs.readFileSync(src));
    } catch {}
  }
  console.log(`Snapshot: ${key}/${ts}`);
}

function diff() {
  const metaPath = path.join(OUTPUTS, 'scan_meta.json');
  const meta = readJSON(metaPath);
  if (!meta || !meta.snapshotKey) {
    console.error('No scan_meta.json found. Run npm run scan first.');
    process.exit(1);
  }
  const key = meta.snapshotKey;
  const histRoot = path.join(HISTORY, key);
  const snaps = listSnapshots(histRoot);
  if (snaps.length < 2) {
    console.log('No changes (need at least two snapshots).');
    process.exit(0);
  }
  const aDir = path.join(histRoot, snaps[snaps.length - 2]);
  const bDir = path.join(histRoot, snaps[snaps.length - 1]);
  const aFiles = new Set(listJsonFiles(aDir));
  const bFiles = new Set(listJsonFiles(bDir));
  const all = Array.from(new Set([...aFiles, ...bFiles])).sort();
  let any = false;
  for (const f of all) {
    const aPath = path.join(aDir, f);
    const bPath = path.join(bDir, f);
    const aRaw = fs.existsSync(aPath) ? fs.readFileSync(aPath, 'utf8') : '';
    const bRaw = fs.existsSync(bPath) ? fs.readFileSync(bPath, 'utf8') : '';
    if (!fs.existsSync(aPath)) {
      any = true;
      console.log(`\n[+] ${f} added`);
      continue;
    }
    if (!fs.existsSync(bPath)) {
      any = true;
      console.log(`\n[-] ${f} removed`);
      continue;
    }
    const aText = sanitizeTextForDiff(aRaw, f);
    const bText = sanitizeTextForDiff(bRaw, f);
    if (aText !== bText) {
      any = true;
      console.log(`\n# ${f}`);
      console.log(unifiedDiff(aText, bText, f));
    }
  }
  if (!any) console.log('No changes');
}

function listCmd() {
  const metaPath = path.join(OUTPUTS, 'scan_meta.json');
  const meta = readJSON(metaPath);
  if (!meta || !meta.snapshotKey) {
    console.error('No scan_meta.json found. Run npm run scan first.');
    process.exit(1);
  }
  const key = meta.snapshotKey;
  const histRoot = path.join(HISTORY, key);
  const snaps = listSnapshots(histRoot);
  console.log(key);
  snaps.forEach(s => console.log(s));
}

const sub = process.argv[2];
if (sub === 'snap') snap();
else if (sub === 'diff') diff();
else if (sub === 'list') listCmd();
else {
  console.error('Usage: node scripts/history.mjs <snap|diff|list>');
  process.exit(2);
}
