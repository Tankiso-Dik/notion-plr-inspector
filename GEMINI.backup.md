# GEMINI.md

## 🔍 Purpose

This document defines how Gemini CLI (or any auditing LLM agent) should verify the integrity and structure of the Notion PLR Inspector repo after modifications or refactoring.

Use it as a checklist for code audits, regression prevention, and GPT-based self-evaluation.

---

## ✅ Required Files

The following files must exist:

* `index.js` — Main scanner logic (all-in-one)
* `.env.example` — Env sample for local dev
* `outputs/` — The only output directory
* `README.md` — Must match current logic and file outputs
* `GEMINI.md` — This audit reference

---

## 🧪 Output Files (inside `outputs/`)

Gemini should verify the presence and format of the following files after a scan run:

* `notion_plr_extracted.json`

  * Includes: block types, nesting, media, page icons/covers, database schemas
* `formulas.json`

  * JSON-formatted logic from all detected databases
* `formulas_audit.md`

  * Human-readable version of all formulas with database/page context

No other files (like `CHECKLIST_DATA_DUMP.md`, `notion_plr_extracted.md`, or `db_<name>.json`) should exist or be referenced.

---

## 🔐 `.env` Format

```env
NOTION_TOKEN=secret_xxxx
PAGE_ID=your_template_id
```

Gemini should ensure `.gitignore` excludes `.env` and `outputs/`.

---

## 📁 Folder Structure Expectations

```bash
notion-plr-inspector/
├── index.js
├── outputs/
│   ├── notion_plr_extracted.json
│   ├── formulas.json
│   └── formulas_audit.md
├── .env (local only)
├── .env.example
├── README.md
└── GEMINI.md
```

No `scans/`, `test/`, `writer.js`, `notion-client.js`, or `extractor.js` should exist. These are legacy artifacts and must be removed.

---

## 🧼 Lint + Scripts Check

Gemini may also verify:

* `package.json` includes:

  ```json
  "scripts": {
    "scan": "node index.js"
  }
  ```
* No unused scripts like `run.sh`, `verify-notion.js`, or `get-latest-scan-dir.js`

---

## 📌 Summary of Audit Goals

| Checkpoint                     | Status |
| ------------------------------ | ------ |
| `index.js` exists              | ✅      |
| All output files in `outputs/` | ✅      |
| No `scans/` folder             | ✅      |
| README matches logic           | ✅      |
| Formula files generated        | ✅      |
| `.gitignore` is correct        | ✅      |
| No legacy scripts or tests     | ✅      |

---

## 👁️ Usage

Use Gemini CLI to:

1. Run a scan: `npm run scan`
2. Check for correct output files
3. Confirm repo cleanliness and file consistency
4. Reject any accidental reintroductions of bloat, redundancy, or dead code

---

## 🙌 Maintained by Papermoon

This system should remain simple, auditable, and ready for integration into a broader AI-powered PLR product pipeline.
