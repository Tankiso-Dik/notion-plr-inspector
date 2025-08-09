You’re right—my bad on the extra commands. Thanks for the `package.json`. Here’s a **drop‑in README** that matches your actual scripts exactly and adds a clear workflow + examples. You can paste this over `README.md`.

---

# 🕵️ Notion PLR Inspector

Minimal, machine‑first scanner for Notion templates. It crawls a Notion **page or database**, extracts structure + metadata, and writes **structured JSON** for downstream AI (e.g., *Makeover GPT*).

* Recurses child pages/blocks
* Extracts database schemas, formulas, media
* Emits normalized JSON views + a simple graph
* Supports per‑template **history snapshots & diffs**

---

## What it outputs (in `outputs/`)

* `notion_plr_extracted.json` – legacy full tree (blocks + titles + media)
* `pages.json` – normalized pages view (`schemaVersion`, metadata, block counts)
* `databases.json` – normalized DB schemas (options, relations, rollups)
* `media.json` – flat image list
* `graph.json` – nodes/edges (pages, dbs, relations)
* `formulas.json` – `{ schemaVersion, formulas: { … } }`
* `formulas_audit.md` – human‑readable formulas
* `scan_meta.json` – run metadata + `snapshotKey` for history

> History snapshots live in top‑level `history/` (recommended to add to `.gitignore`).

---

## Setup

1. Install

```bash
npm install
```

2. `.env`

```env
NOTION_TOKEN=secret_xxxxx
PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # 32‑hex or dashed UUID
```

3. Share access in Notion
   Invite your integration to the **root page** and any **child databases**.

---

## Run & flags

Base run:

```bash
npm run scan
```

Optional flags (append after `--`):

* `--pageId=<id>` (page **or** database id; DB roots are handled)
* `--concurrency=<int>` (default 3)
* `--includeRowValues` (paginate relation/rollup values, resolve a few related titles)
* `--includeComments` (writes `outputs/comments.json` if permitted)
* `--maxBlocks=<int>` (0 = unlimited)

Examples:

```bash
npm run scan -- --concurrency=4
npm run scan -- --pageId="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" --includeRowValues
```

---

## Workflow (fast loop)

1. **Scan**

```bash
npm run scan
```

2. **Dump everything** (hand off to Makeover GPT)

```bash
npm run scan:dump
```

3. **Snapshot state** (per template)

```bash
npm run history:snap
```

4. **Change in Notion → rescan → diff**

```bash
npm run scan
npm run history
```

5. **Quick counts**

```bash
npm run summary
```

6. **Clear outputs**

```bash
npm run clear
```

---

## Command reference (matches your package.json)

* **`npm run scan`** – Run inspector, write JSONs to `outputs/`.
* **`npm run scan:dump`** – Run scan, then print every file in `outputs/`.
* **`npm run extracted`** – Pretty‑print `notion_plr_extracted.json`.
* **`npm run summary`** – Print `{ pages, dbs, images, nodes, edges }`.
* **`npm run clear`** – Delete files in `outputs/` (history is untouched).
* **`npm run what-id -- <id>`** – Tell if `<id>` is PAGE or DATABASE; if DB has a page parent, print it.
* **`npm run history:snap`** – Snapshot current `outputs/*.json` to `history/<snapshotKey>/<timestamp>/`.
* **`npm run history:diff`** – Unified diff of the **last two** snapshots for this template.
* **`npm run history:list`** – List snapshots for this template.
* **`npm run history`** – Convenience: `snap → diff → list`.

---

## Example outputs

**`npm run summary`**

```bash
{ pages: 1, dbs: 4, images: 0, nodes: 5, edges: 4 }
```

**`npm run history`**

```
Snapshot: food-preparation/20250809_202714
# pages.json
--- a/pages.json
+++ b/pages.json
@@ ...
No other changes
food-preparation
20250809_202703
20250809_202714
```

**`scan_meta.json` (shape)**

```json
{
  "schemaVersion": "1.0.0",
  "snapshotKey": "food-preparation",
  "rootType": "page",
  "pageId": "24a803b590cc8087af19f99d2dc84e73",
  "databaseId": null,
  "title": "Food Preparation",
  "finishedAt": "2025-08-09T17:27:14.106Z"
}
```

---

## How scanning behaves

* **Root detection**
  Page ID → traverse the page.
  Database ID → record schema; if it has a **page parent**, continue traversal from that page; if not, write DB outputs only.

* **Traversal**
  Full pagination of child blocks; safe concurrency; supports synced blocks & tables.

* **Databases**
  Schema includes select/multi‑select/status options, relation targets, rollup config.
  `--includeRowValues` paginates large property values and resolves a few related titles.

* **Graph**
  Nodes (pages, databases) + edges (parent/child, page→DB, DB↔DB relations).

---

## Troubleshooting

* **401/403:** token invalid or integration not invited → share the page/DB with your integration.
* **404 / object\_not\_found:** wrong workspace or not shared.
* **Invalid UUID:** pass 32‑hex or dashed UUID (don’t include angle brackets).
* **DB root error:** supported—use `--pageId=<databaseId>`; scanner will log “Root type: database …”.

---

## Notes

* All JSONs include `"schemaVersion": "1.0.0"`.
* Recommend `.gitignore` includes:

  ```
  .env
  outputs/
  history/
  ```
* Outputs are **for machines**—Makeover GPT can read them directly.

---

## License

MIT (or internal—your choice).

---

If you want, I can also give you a tiny shell one‑liner to overwrite `README.md` with this content.



Alright, here’s the **tiny README cheatsheet** you can tack onto the bottom of your existing README so you (or future-you) know exactly what each Replit Workflow button does:

---

## 🖱️ Replit Workflow Buttons Cheatsheet

| Button                | What It Does                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Sync from GitHub**  | Pulls latest changes from GitHub and overwrites your Replit files. Resets + cleans local state.                        |
| **Scan**              | Runs the inspector on the `PAGE_ID` in `.env` and saves results to `outputs/`.                                         |
| **Scan + Dump**       | Runs a scan **and** prints the contents of all files in `outputs/` for quick review or GPT copy-paste.                 |
| **History**           | Takes a snapshot of the current scan, diffs against the previous snapshot for this template, then lists all snapshots. |
| **Summary**           | Shows counts of pages, databases, images, and graph nodes/edges.                                                       |
| **Clear Outputs**     | Deletes all files in `outputs/` so the next scan starts clean.                                                         |
| **Scan (Row Values)** | Same as Scan, but also fetches raw row values for databases.                                                           |
| **Scan (Comments)**   | Same as Scan, but also includes Notion comments in the output.                                                         |
| **What ID?**          | Checks and prints details for a specific Notion page/database ID (edit the ID in the command before running).          |

---

Do you want me to **also merge this into your README right now** so you don’t have to copy-paste it manually later? That way it’s always in sync with the buttons you just added.

