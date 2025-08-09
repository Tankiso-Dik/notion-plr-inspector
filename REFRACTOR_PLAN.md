
### 2) Create the refactor guide (for Cursor to follow)
```bash
cat > REFACTOR_PLAN.md <<'EOF'
# Refactor Plan — Notion PLR Inspector

## Goals
- Full pagination for block children and page property values.
- Richer DB property details (relations/rollups/status/selects).
- Optional: comments, styling hints, table blocks, synced blocks.
- Safe parallelism with backoff; preserve existing outputs + add fields only.

## Tasks
1) Pagination helper
   - `listAllBlocks(block_id, pageSize=100)` loops with start_cursor until done.
2) Concurrency
   - Small pool (3–5) for fetching children of blocks with has_children=true.
3) DB property deepening
   - Schema: include select/multi-select options, status, relation.database_id/dual_property, rollup targets+function.
   - Sample rows: if a property has `has_more`, use `pages.properties.retrieve` until complete.
   - For relation values, optionally resolve first ~5 related page titles (if accessible).
4) Rich text styling (minimal)
   - Emit plain_text + href + annotations {bold, italic, code, color≠default}.
5) Synced & table blocks
   - Synced: if original (synced_from=null) → crawl; if duplicate → record reference only.
   - Table: capture width/header flags and table_row cells (plain_text per cell).
6) Optional comments
   - If `--includeComments`, `notion.comments.list({ block_id: rootPageId })`, store author/time/plain_text.
7) Schema versioning
   - Keep `"schemaVersion":"1.0.0"`; bump only if breaking shapes.
8) Cleanup
   - Remove any leftover unused vars/params from health check.

## Acceptance
- Same files still in `outputs/`.
- New data only augments; no breaking renames.
- Summary prints total blocks fetched; handles 403/404/429 gracefully.
EOF
