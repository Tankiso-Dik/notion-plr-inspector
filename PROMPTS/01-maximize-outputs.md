Refactor `index.js` to maximize structured, machine‑readable outputs for downstream processing (Makeover GPT). Keep writing `outputs/notion_plr_extracted.json` for backward compatibility, but also generate additional normalized files in `outputs/` if helpful: `pages.json`, `databases.json`, `media.json`, `graph.json`. Add a `"schemaVersion": "1.0.0"` root key to new JSONs.

Requirements:
- Pages: id, title, icon/cover (URLs if available), last_edited, parent path/breadcrumb, depth, and counts of block types (headings, callouts, toggles, columns, bulleted/numbered lists, dividers, images, child_page, child_database).
- Databases: id, title, parent path, properties with kind; include for select/multi-select the option list; for relations: target database id + property; for rollups: relation prop + target prop + function; include up to 3 sample rows (existing cap).
- Formulas: keep expressions as today, but also include where they live (db id/name → property name). If other properties reference the formula (e.g., rollups), include that map if detectable.
- Media: flat list of image blocks with block id, parent page id/path, URL, caption, last_edited; do not download files.
- Graph: nodes (pages, databases) and edges for parent→child, page→db (child_database), db↔db via relation properties; include node labels (title) and types; IDs should match Notion.

Behavior:
- Maintain current CLI UX: `npm run scan`.
- Keep requests efficient and resilient (handle 429s with small backoff).
- Minimal deps (prefer none).
- Print a short summary at the end: counts for pages, DBs, image blocks.

Deliverables:
1) Proposed plan + risks.
2) Minimal diff for `index.js` (and any small helpers in same file).
3) New write steps for additional JSON files in `outputs/` with stable shapes and clear keys.
