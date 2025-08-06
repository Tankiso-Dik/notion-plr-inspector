# 🕵️ Notion PLR Inspector

The **Notion PLR Inspector** is a diagnostic scanner that recursively crawls a Notion template page and extracts all the layout, visual, and metadata elements relevant for **rebranding and polishing PLR/MRR Notion products**.

This tool collects *raw structured data* only — all analysis, copywriting, and visual planning is done downstream by AI systems like `Makeover GPT`, `Product Preparer GPT`, or `OBS GPT`.

---

## 🔍 What It Does

- Connects to a Notion page using the Notion API
- Recursively walks through the page block-by-block
- Extracts:
  - Block type and nesting
  - Callouts and headings
  - Media blocks (images, videos, files)
  - Database schemas and view types
  - Column layouts, toggles, and groupings
- Outputs rich, structured JSON (and optionally Markdown)
- Designed for machine parsing — **not human readability**

---

## 📂 Project Structure

```bash
notion-plr-inspector/
├── index.js              # Entry point – runs full scan
├── notion-client.js      # Notion API wrapper
├── extractor.js          # Converts raw blocks to structured layout info
├── writer.js             # Handles file output
├── utils.js              # Optional helper functions
├── outputs/              # Where extracted files are saved
│   ├── notion_plr_extracted.json
│   ├── notion_plr_extracted.md         (optional)
│   └── db_<name>.json                  (optional)
├── .env                  # (Local only) Notion API key and default page ID
└── README.md
```

---

## 📄 Outputs

### ✅ `notion_plr_extracted.json`

* Full structured representation of the Notion template
* Includes:

  * Layout grouping (columns, nesting)
  * Block text and type
  * Media file URLs
  * Page icon & cover
  * Database schema + views
  * Metadata for downstream GPT parsing

### ✅ `db_<name>.json` *(optional)*

* One file per embedded or linked database
* Field types, view types, linked relationships

### ✅ `notion_plr_extracted.md` *(optional)*

* A flattened Markdown summary for debugging

---

## ⚙️ Configuration

### Local `.env` setup

```env
NOTION_TOKEN=secret_xxxx
PAGE_ID=your_template_id
```

> 🔐 Do not commit your `.env` file. Use GitHub Secrets or platform-specific env variables in production.

### GitHub Actions

This project includes a manual GitHub Actions workflow for running the inspector in the cloud.

1. In your repository, go to **Settings → Secrets and variables → Actions** and add a secret named `NOTION_TOKEN` containing your Notion integration token.
2. Open the **Actions** tab and select **Inspect Notion Template**.
3. Click **Run workflow**, enter the Notion page ID in the input box, and press the green **Run workflow** button.
4. After the job completes, download the `notion-output` artifact from the run's summary page.

> The workflow does not run automatically; trigger it manually whenever you need a new scan.

---

## 💡 Design Philosophy

* **Machine-first**: JSON output is meant for GPT agents, not humans
* **Insight-rich**: Layout, media, and structure must be captured in full
* **No filtering**: Inspector does not decide what's important — downstream GPTs do
* **Layout-preserving**: Closely related blocks (e.g. heading + callout) are grouped
* **Nesting-aware**: Columns, toggles, and children are retained in logical hierarchy

---

## 🛠 Future Improvements

* Add CLI flags for `--markdown-only` or `--json-only`
* Batch scanning support
* Export schema summaries to CSV or YAML

---

## 📤 License

MIT (or custom internal use only — TBD)

---

## 🙌 Built by Papermoon

This tool powers the scalable rebranding pipeline for Notion PLR templates. It’s part of a larger system that includes content generation, visual planning, and listing automation.

