# 🔍 Notion PLR Inspector

Welcome to **Notion PLR Inspector** — a tiny but mighty 🔧 toolkit for grabbing everything you'd want to know about a Notion template **without** adding any opinions or analysis.

---

## ✨ What It Does

- 🧠 **Extracts structure** — page titles, block types, column layouts, and nested groups  
- 🎨 **Captures visuals** — icons, covers, media URLs  
- 🗄️ **Maps databases** — fields, formulas, relations, and view types  
- 📝 **Outputs machine-friendly files** — JSON (always) and Markdown (optional)

All you get is **pure data**, ready for other GPTs or automation tools to transform, rebrand, or narrate.

---

## 🚀 Quick Start (GitHub Actions)

1. Go to **Actions → Inspect Notion Template → Run workflow**
2. Enter the Notion page ID you want to scan
3. Wait for the job to finish, then download the `notion-output` artifact  
   (Inside you'll find `notion_plr_extracted.json` and any optional extras)

> Make sure you’ve set a `NOTION_API_KEY` secret in your repository settings.

---

## 📂 Output Preview

```
outputs/
├── notion_plr_extracted.json   # Full structured snapshot
├── notion_plr_extracted.md     # Optional human-readable outline
└── db_<name>.json              # Optional database schema dumps
```

---

## 🛠️ Local Development

```bash
npm install
NOTION_API_KEY=secret_xxx NOTION_PAGE_ID=yyy node index.js
```

---

Happy inspecting! 🕵️‍♀️
