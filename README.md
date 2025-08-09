# 🕵️ Notion PLR Inspector

The **Notion PLR Inspector** is a minimalist diagnostic scanner for Notion templates. It recursively crawls a Notion page and extracts structured data for **rebranding and polishing PLR/MRR Notion products**.

This tool is designed for downstream AI systems like `Makeover GPT`, `Product Preparer GPT`, or `OBS GPT`. It produces **raw structured JSON only**, not human-facing reports.

---

## 🔍 What It Does

* Connects to a Notion page using the Notion API
* Recursively walks through all blocks, including nested `child_page` blocks
* Extracts:

  * Page metadata (icon, cover, title, last edited)
  * Block type and nesting (column lists, toggles, callouts, etc.)
  * Media blocks (images, files)
  * Database schemas and views
  * All formulas from all discovered databases
* Outputs to a single location: `outputs/`

---

## 📂 Project Structure

```bash
notion-plr-inspector/
├── index.js              # Entry point – runs full scan
├── outputs/              # Final extracted files
│   ├── notion_plr_extracted.json
│   ├── formulas.json
│   ├── formulas_audit.md
│   ├── pages.json        # schemaVersion + normalized pages view
│   ├── databases.json    # schemaVersion + normalized DB schemas
│   ├── media.json        # schemaVersion + flat image list
│   └── graph.json        # schemaVersion + nodes/edges graph
├── scripts/
│   └── what-id.mjs       # Helper to detect if an ID is a page or database
├── .env                  # (Local only) Notion API key and default page ID
└── README.md
```

---

## 📄 Outputs

### ✅ `notion_plr_extracted.json`

* Full structured representation of the Notion template
* Includes:

  * Layout nesting
  * Block text and type
  * Page icon & cover
  * Database schemas

### ✅ `formulas.json`

* A machine-parseable JSON of all formulas across all detected databases
* Useful for validating logic, branding formulas, and cloning to other templates

### ✅ `formulas_audit.md`

* A Markdown-formatted audit log showing all formulas in human-readable form
* Used by Makeover GPT for step-by-step validation and QA

---

## ⚙️ Running the Scanner

### Local Setup

1. Clone the repo
2. Add your Notion integration token and default page ID to `.env`:

```env
NOTION_TOKEN=secret_xxxx
PAGE_ID=your_template_id
```

> 🔐 Do not commit `.env` to version control

3. Run the scan:

```bash
# Basic (uses PAGE_ID from CLI or .env)
npm run scan -- --pageId=<page_or_database_id>

# Control concurrency and pagination
npm run scan -- --pageId=<id> --concurrency=3 --maxBlocks=0

# Include database row values (up to 3 rows per DB) and relation titles
npm run scan -- --pageId=<id> --includeRowValues

# Include top-level comments on the root page (writes outputs/comments.json)
npm run scan -- --pageId=<id> --includeComments

# You can also set env vars instead of flags:
# CONCURRENCY=5 INCLUDE_ROW_VALUES=true INCLUDE_COMMENTS=true MAX_BLOCKS=100 npm run scan -- --pageId=<id>
```

### Identify what an ID refers to

```bash
# Prints whether the ID is a PAGE or DATABASE, and database parent if available
npm run what-id -- <page_or_database_id>
```

### GitHub Actions (Manual)

1. Add `NOTION_TOKEN` as a secret in your GitHub repo
2. Trigger the "Inspect Notion Template" workflow manually
3. Download the output artifact when the job completes

---

## 💡 Design Philosophy

* **Minimalist**: Only one main file, no plugin system, no bloat
* **Machine-first**: Output is for GPTs, not humans
* **Recursively Deep**: All child pages and nested databases are inspected
* **Formula-Aware**: Full formula audit and extraction
* **Predictable Output**: Always generates the same files in the same place

---

## 📤 License

MIT (or internal use only — TBD)

---

## 🙌 Built by Papermoon

This tool is the backbone of a scalable Notion template rebranding system built by Sybil @ Papermoon.
