// index.js (final version — outputs only, with deep recursive scan)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client } from '@notionhq/client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// --- Simple retry/backoff helpers to be resilient to 429s ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withBackoff(fn, { maxRetries = 5, baseDelayMs = 300 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.code;
      const isRateLimit = status === 429 || error?.message?.includes('Rate limit');
      if (!isRateLimit || attempt >= maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
      attempt += 1;
    }
  }
}

const output = {
  titles: { pages: {}, databases: {} },
  databases: [],
  pageContent: [],
  media: { imageBlocks: [] },
};

// Graph edges collected during traversal for downstream graph.json
const graphEdges = {
  parentChild: [], // { fromPageId, toPageId }
  pageDatabase: [], // { pageId, databaseId }
  databaseRelations: [], // { fromDatabaseId, toDatabaseId, property }
};

// Track processed entities to avoid duplicates
const processedDatabaseIds = new Set();

// --- Scan configuration (CLI/env) and counters ---
const scanConfig = {
  concurrency: 3,
  includeRowValues: false,
  includeComments: false,
  maxBlocks: 0, // 0 = unlimited
  blocksFetchedCount: 0,
};

// Helper: list all child blocks with pagination (start_cursor + has_more)
async function listAllBlocks(blockId, pageSize = 100) {
  const all = [];
  let cursor = undefined;
  do {
    const resp = await withBackoff(() =>
      notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: pageSize })
    );
    const chunk = resp.results || [];
    all.push(...chunk);
    scanConfig.blocksFetchedCount += chunk.length;
    if (scanConfig.maxBlocks > 0 && scanConfig.blocksFetchedCount >= scanConfig.maxBlocks) {
      break;
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return all;
}

// Tiny concurrency pool to manage recursive work
async function runWithConcurrency(limit, thunks) {
  if (limit <= 1) {
    // Sequential fallback
    const out = [];
    for (const t of thunks) out.push(await t());
    return out;
  }
  const executing = new Set();
  const results = [];
  for (const thunk of thunks) {
    const p = Promise.resolve().then(thunk);
    results.push(p);
    executing.add(p);
    const remove = () => executing.delete(p);
    p.then(remove, remove);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Detect whether an ID is a page or a database
async function detectRootType(id) {
  try {
    const page = await withBackoff(() => notion.pages.retrieve({ page_id: id }));
    return { type: 'page', page };
  } catch (e1) {
    try {
      const database = await withBackoff(() => notion.databases.retrieve({ database_id: id }));
      const title = database.title?.[0]?.plain_text || 'Untitled';
      return { type: 'database', database, title, parent: database.parent };
    } catch (e2) {
      // Prefer the last error for messaging
      const status = e2?.status ?? e2?.code;
      return { type: 'unknown', error: e2, status };
    }
  }
}

// Helpers to normalize icon/cover URLs
function extractIcon(icon) {
  if (!icon) return null;
  if (icon.type === 'emoji') return { emoji: icon.emoji };
  if (icon.type === 'external') return { url: icon.external?.url || null };
  if (icon.type === 'file') return { url: icon.file?.url || null };
  return null;
}

function extractCover(cover) {
  if (!cover) return null;
  if (cover.type === 'external') return { url: cover.external?.url || null };
  if (cover.type === 'file') return { url: cover.file?.url || null };
  return null;
}

function extractText(property) {
  if (!property) return '';
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return property[property.type].map(t => t.plain_text).join('');
    case 'select':
      return property.select?.name || '';
    case 'multi_select':
      return property.multi_select.map(s => s.name).join(', ');
    case 'date':
      return property.date?.start || '';
    case 'number':
      return property.number?.toString() || '';
    case 'checkbox':
      return property.checkbox ? '✅' : '❌';
    case 'url':
      return property.url || '';
    case 'email':
      return property.email || '';
    case 'status':
      return property.status?.name || '';
    case 'relation':
      return property.relation.map(r => r.id).join(', ');
    default:
      return { type: property.type, supported: false };
  }
}

// Helper: consistently extract a page title from a Page object
function getPageTitle(page) {
  try {
    const titleProp = Object.values(page.properties || {}).find(p => p?.type === 'title');
    const title = titleProp?.title?.[0]?.plain_text || 'Untitled';
    return title;
  } catch {
    return 'Untitled';
  }
}

// Helper: normalize rich_text arrays
function normalizeRichText(arr) {
  return (arr || []).map(rt => ({
    plain_text: rt.plain_text,
    href: rt.href || null,
    annotations: {
      bold: !!rt.annotations?.bold,
      italic: !!rt.annotations?.italic,
      code: !!rt.annotations?.code,
      color: rt.annotations?.color && rt.annotations.color !== 'default' ? rt.annotations.color : undefined,
    },
  }));
}

async function inspectDatabase(dbId, location = 'Root') {
  try {
    if (processedDatabaseIds.has(dbId)) return;
    const db = await withBackoff(() => notion.databases.retrieve({ database_id: dbId }));
    const dbTitle = db.title?.[0]?.plain_text || 'Untitled';

    output.titles.databases[dbId] = {
      title: dbTitle,
      id: dbId,
      icon: db.icon,
      cover: db.cover,
      last_edited_time: db.last_edited_time,
      parentLocations: [location],
    };

    const properties = Object.entries(db.properties).map(([key, val]) => {
      const prop = { name: key, type: val.type };
      if (val.type === 'formula') {
        prop.expression = val.formula?.expression ?? '';
      } else if (val.type === 'select') {
        prop.options = (val.select?.options || []).map((o) => ({ name: o.name, color: o.color }));
      } else if (val.type === 'multi_select') {
        prop.options = (val.multi_select?.options || []).map((o) => ({ name: o.name, color: o.color }));
      } else if (val.type === 'status') {
        prop.options = (val.status?.options || []).map((o) => ({ id: o.id, name: o.name, color: o.color }));
      } else if (val.type === 'relation') {
        const rel = val.relation || {};
        prop.relation = {
          database_id: rel.database_id || null,
          type: rel.type || null,
          // Not all versions provide these; include if present
          synced_property_name: rel.synced_property_name || null,
          target_property_name: rel.property_name || rel.target_property_name || null,
          dual_property: rel.dual_property || null,
        };
        if (prop.relation.database_id) {
          graphEdges.databaseRelations.push({
            fromDatabaseId: dbId,
            toDatabaseId: prop.relation.database_id,
            property: key,
          });
        }
      } else if (val.type === 'rollup') {
        const roll = val.rollup || {};
        prop.rollup = {
          relation_property_name: roll.relation_property_name || null,
          rollup_property_name: roll.rollup_property_name || null,
          function: roll.function || null,
        };
      }
      return prop;
    });

    let sampleRows = [];
    if (scanConfig.includeRowValues) {
      const rows = await withBackoff(() => notion.databases.query({ database_id: dbId, page_size: 3 }));

      async function fetchFullPropertyValue(pageId, propertyId, current) {
        // If property indicates has_more, page through until complete
        if (!current?.has_more) return current;
        let cursor = current.next_cursor;
        let aggregated = Array.isArray(current?.results) ? [...current.results] : [];
        while (cursor) {
          const resp = await withBackoff(() =>
            notion.pages.properties.retrieve({ page_id: pageId, property_id: propertyId, start_cursor: cursor })
          );
          const items = resp.results || [];
          aggregated.push(...items);
          cursor = resp.has_more ? resp.next_cursor : undefined;
        }
        return { ...current, results: aggregated, has_more: false, next_cursor: undefined };
      }

      async function resolveRelationTitles(relationArray) {
        const items = (relationArray || []).slice(0, 5);
        const limit = Math.min(3, scanConfig.concurrency || 3);
        const tasks = items.map(rel => async () => {
          try {
            const p = await withBackoff(() => notion.pages.retrieve({ page_id: rel.id }));
            const t = getPageTitle(p);
            return { id: rel.id, title: t };
          } catch {
            return { id: rel.id, title: null };
          }
        });
        const results = await runWithConcurrency(limit, tasks);
        return results;
      }

      sampleRows = await Promise.all(
        rows.results.map(async row => {
          const rowTitle = extractText(Object.values(row.properties).find(p => p.type === 'title'));
          const properties = {};
          const relationTitles = {};
          for (const [k, v] of Object.entries(row.properties)) {
            let value = v;
            if (v?.has_more && v?.id) {
              value = await fetchFullPropertyValue(row.id, v.id, v);
            }
            properties[k] = extractText(value);
            if (v?.type === 'relation') {
              relationTitles[k] = await resolveRelationTitles(v.relation);
            }
          }
          return { rowTitle, rowId: row.id, properties, relationTitles };
        })
      );
    }

    output.databases.push({ title: dbTitle, id: dbId, properties, sampleRows, parentLocations: [location] });
    processedDatabaseIds.add(dbId);
  } catch (err) {
    console.log(`❌ Failed DB: ${err.message}`);
  }
}

async function inspectBlock(blockId, indent = 0, parentType = 'page', location = 'Root', parentPageId = null) {
  const blocks = await listAllBlocks(blockId);
  const children = [];
  const recursionTasks = [];
  for (const block of blocks) {
    const type = block.type;
    const data = {
      blockId: block.id,
      type,
      depth: indent,
      parentType,
      location,
      last_edited_time: block.last_edited_time,
    };
    // Capture common rich_text where present
    const rich = block[type]?.rich_text;
    if (Array.isArray(rich)) {
      data.rich_text = normalizeRichText(rich);
    }
    if (type === 'child_database') {
      await inspectDatabase(block.id, location);
      data.database_id = block.id;
      if (parentPageId) {
        graphEdges.pageDatabase.push({ pageId: parentPageId, databaseId: block.id });
      }
    } else if (type === 'child_page') {
      const page = await withBackoff(() => notion.pages.retrieve({ page_id: block.id }));
      const pageTitle = page.properties.title?.title?.[0]?.plain_text || 'Untitled Page';

      output.titles.pages[block.id] = {
        title: pageTitle,
        id: block.id,
        icon: page.icon,
        cover: page.cover,
        last_edited_time: page.last_edited_time,
        parentLocations: [location],
      };

      data.page_id = block.id;
      data.page_title = pageTitle;

      // Graph edge: parent page -> child page
      if (parentPageId) {
        graphEdges.parentChild.push({ fromPageId: parentPageId, toPageId: block.id });
      }

      // 🔁 RECURSIVELY inspect child page content (concurrency-controlled)
      recursionTasks.push(async () => {
        data.children = await inspectBlock(
          block.id,
          indent + 1,
          'page',
          `${location} → ${pageTitle}`,
          block.id
        );
      });
    } else if (type === 'image') {
      const url = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
      const caption = block.image.caption?.map(t => t.plain_text).join('');
      data.url = url;
      data.caption = caption;
      data.parent_page_id = parentPageId;
      output.media.imageBlocks.push(data);
      // Also capture caption rich text if available
      if (Array.isArray(block.image?.caption)) {
        data.caption_rich_text = normalizeRichText(block.image.caption);
      }
    } else if (type === 'table') {
      const t = block.table;
      data.table = {
        width: t?.table_width ?? null,
        has_column_header: !!t?.has_column_header,
        has_row_header: !!t?.has_row_header,
      };
      recursionTasks.push(async () => {
        const rows = await listAllBlocks(block.id);
        data.rows = rows
          .filter(r => r.type === 'table_row')
          .map(r => (r.table_row?.cells || []).map(cell => (cell || []).map(rt => rt.plain_text).join('')));
      });
    } else if (type === 'synced_block') {
      const sb = block.synced_block;
      if (sb?.synced_from && sb.synced_from?.block_id) {
        data.synced_ref = { type: 'synced_ref', original_block_id: sb.synced_from.block_id };
      } else {
        // Original synced block: recurse into its children
        recursionTasks.push(async () => {
          data.children = await inspectBlock(block.id, indent + 1, parentType, location, parentPageId);
        });
      }
    } else if (block.has_children) {
      // Generic container blocks: recurse into children
      recursionTasks.push(async () => {
        data.children = await inspectBlock(block.id, indent + 1, parentType, location, parentPageId);
      });
    }
    children.push(data);
  }
  // Run all scheduled recursions with a small concurrency pool
  await runWithConcurrency(scanConfig.concurrency, recursionTasks);
  return children;
}

function generateFormulaFiles(outPath) {
  const formulaAudit = [];
  const formulasJson = {};

  for (const db of output.databases) {
    const dbName = db.title;
    const dbFormulas = {};
    const auditEntries = [];
    for (const prop of db.properties) {
      if (prop.type === 'formula' && prop.expression) {
        dbFormulas[prop.name] = prop.expression;
        auditEntries.push({ field: prop.name, code: prop.expression });
      }
    }
    if (auditEntries.length > 0) {
      formulasJson[dbName] = dbFormulas;
      formulaAudit.push({ database: dbName, formulas: auditEntries });
    }
  }

  const schemaVersion = '1.0.0';
  fs.writeFileSync(
    path.join(outPath, 'formulas.json'),
    JSON.stringify({ schemaVersion, formulas: formulasJson }, null, 2)
  );

  let auditMd = '## 🧠 Formula Audit\n\n';
  for (const entry of formulaAudit) {
    auditMd += `- database: ${entry.database}\n`;
    for (const f of entry.formulas) {
      auditMd += `  - field: ${f.field}\n`;
      auditMd += `    - code: |\n`;
      f.code.split('\n').forEach(line => {
        auditMd += `        ${line}\n`;
      });
      auditMd += '\n';
    }
  }
  fs.writeFileSync(path.join(outPath, 'formulas_audit.md'), auditMd);
}

// --- New: Normalized machine-friendly outputs ---
function writeNormalizedOutputs(outPath, rootPageId, rootTitle) {
  const schemaVersion = '1.0.0';

  // Build pages array with breadcrumbs, depth, icon/cover URLs, and block counts
  // (removed unused temp structures)

  function countBlocksForPage(pageNode) {
    // pageNode here is the data object of a child_page or the synthetic root page container
    const counts = {
      headings: 0,
      callouts: 0,
      toggles: 0,
      columns: 0,
      bulleted_list_items: 0,
      numbered_list_items: 0,
      dividers: 0,
      images: 0,
      child_page: 0,
      child_database: 0,
    };

    function walk(blocks) {
      for (const b of blocks || []) {
        const t = b.type;
        if (!t) continue;
        if (t.startsWith('heading_')) counts.headings += 1;
        else if (t === 'callout') counts.callouts += 1;
        else if (t === 'toggle') counts.toggles += 1;
        else if (t === 'column' || t === 'column_list') counts.columns += 1;
        else if (t === 'bulleted_list_item') counts.bulleted_list_items += 1;
        else if (t === 'numbered_list_item') counts.numbered_list_items += 1;
        else if (t === 'divider') counts.dividers += 1;
        else if (t === 'image') counts.images += 1;
        else if (t === 'child_page') counts.child_page += 1;
        else if (t === 'child_database') counts.child_database += 1;
        if (Array.isArray(b.children) && b.children.length > 0) {
          walk(b.children);
        }
      }
    }

    walk(pageNode.children || []);
    return counts;
  }

  // Build a synthetic page tree for the root, mirroring output.pageContent structure
  const syntheticRoot = {
    page_id: rootPageId,
    page_title: rootTitle,
    depth: 0,
    location: rootTitle,
    children: output.pageContent,
  };

  // Index child_page nodes by id to measure their depth/breadcrumb
  const pageNodes = { [rootPageId]: syntheticRoot };
  (function indexPages(blocks) {
    for (const b of blocks || []) {
      if (b.type === 'child_page') {
        pageNodes[b.page_id] = b;
      }
      if (Array.isArray(b.children)) indexPages(b.children);
    }
  })(output.pageContent);

  // Assemble pages array
  const pages = Object.entries(output.titles.pages).map(([id, meta]) => {
    const node = pageNodes[id] || { depth: 0, location: meta.parentLocations?.[0] || 'Root' };
    const counts = countBlocksForPage(node);
    const iconObj = extractIcon(meta.icon);
    const coverObj = extractCover(meta.cover);
    const breadcrumbText = (node.location || '').split(' → ').filter(Boolean);
    return {
      id,
      title: meta.title,
      icon: iconObj,
      cover: coverObj,
      last_edited: meta.last_edited_time,
      breadcrumb: breadcrumbText,
      depth: node.depth ?? 0,
      counts,
    };
  });

  // Assemble databases array
  const databases = output.databases.map((db) => {
    const titleMeta = output.titles.databases[db.id] || {};
    return {
      id: db.id,
      title: db.title,
      parentPath: (titleMeta.parentLocations?.[0] || db.parentLocations?.[0] || 'Root'),
      properties: db.properties,
      sampleRows: db.sampleRows,
    };
  });

  // Assemble media array
  const media = output.media.imageBlocks.map((img) => ({
    block_id: img.blockId,
    parent_page_id: img.parent_page_id || null,
    parent_path: img.location,
    url: img.url,
    caption: img.caption || '',
    last_edited: img.last_edited_time,
  }));

  // Assemble graph
  const nodes = [
    ...Object.entries(output.titles.pages).map(([id, meta]) => ({ id, label: meta.title, type: 'page' })),
    ...Object.entries(output.titles.databases).map(([id, meta]) => ({ id, label: meta.title, type: 'database' })),
  ];
  const edges = [
    ...graphEdges.parentChild.map((e) => ({ from: e.fromPageId, to: e.toPageId, type: 'parent_child' })),
    ...graphEdges.pageDatabase.map((e) => ({ from: e.pageId, to: e.databaseId, type: 'page_database' })),
    ...graphEdges.databaseRelations.map((e) => ({ from: e.fromDatabaseId, to: e.toDatabaseId, type: 'database_relation', property: e.property })),
  ];

  // Write files with schemaVersion root key
  fs.writeFileSync(
    path.join(outPath, 'pages.json'),
    JSON.stringify({ schemaVersion, pages }, null, 2)
  );
  fs.writeFileSync(
    path.join(outPath, 'databases.json'),
    JSON.stringify({ schemaVersion, databases }, null, 2)
  );
  fs.writeFileSync(
    path.join(outPath, 'media.json'),
    JSON.stringify({ schemaVersion, images: media }, null, 2)
  );
  fs.writeFileSync(
    path.join(outPath, 'graph.json'),
    JSON.stringify({ schemaVersion, nodes, edges }, null, 2)
  );
}

(async () => {
  const argv = yargs(hideBin(process.argv)).options({
    pageId: { alias: 'p', type: 'string' },
    concurrency: { alias: 'c', type: 'number' },
    includeRowValues: { type: 'boolean' },
    includeComments: { type: 'boolean' },
    maxBlocks: { type: 'number' },
  }).parse();

  // Determine PAGE_ID source and value
  let pageId = argv.pageId;
  if (pageId) {
    console.log('Using PAGE_ID from CLI');
  } else if (process.env.PAGE_ID) {
    // Best-effort detection whether PAGE_ID came from .env
    try {
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf8');
        const line = envText.split(/\r?\n/).find(l => l.trim().startsWith('PAGE_ID='));
        const fileVal = line ? line.split('=')[1]?.trim() : '';
        if (fileVal && fileVal === process.env.PAGE_ID) {
          console.log('Using PAGE_ID from .env');
        } else {
          console.log('Using PAGE_ID from environment');
        }
      } else {
        console.log('Using PAGE_ID from environment');
      }
    } catch {
      console.log('Using PAGE_ID from environment');
    }
    pageId = process.env.PAGE_ID;
  } else {
    console.error('No PAGE_ID set');
    return;
  }

  // Validate PAGE_ID format before any calls/IO
  const dashedUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const compactHex = /^[0-9a-fA-F]{32}$/;
  const placeholderIds = new Set([
    'YOUR_RICH_TEMPLATE_PAGE_ID',
    'your_template_id',
    'YOUR_PAGE_ID',
    'PAGE_ID',
    'INSERT_PAGE_ID',
  ]);
  if (placeholderIds.has(pageId) || !(dashedUuid.test(pageId) || compactHex.test(pageId))) {
    console.error('Invalid PAGE_ID. Provide a valid Notion page ID (UUID with dashes or 32-char hex).');
    return;
  }

  const maskPageId = (id) => {
    if (!id || id.length < 9) return '********';
    return `****${id.slice(4, -4)}****`;
  };
  console.log(`PAGE_ID in use: ${maskPageId(pageId)}`);

  // Detect root type BEFORE touching outputs directory
  const detected = await detectRootType(pageId);
  if (detected.type === 'unknown') {
    const status = detected.status;
    if (status === 401 || status === 403) {
      console.error('Failed to retrieve ID: Integration lacks access or token invalid');
    } else if (status === 404) {
      console.error('Failed to retrieve ID: ID not found or no access');
    } else {
      console.error(`Failed to retrieve ID: ${detected.error?.message || detected.error}`);
    }
    return;
  }

  // Now it is safe to clear outputs directory
  const outPath = path.join(__dirname, 'outputs');
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });

  // Apply scan flags (CLI > env > defaults)
  scanConfig.concurrency = Number.isFinite(argv.concurrency) && argv.concurrency > 0 ? Math.floor(argv.concurrency) : (Number.isFinite(Number(process.env.CONCURRENCY)) && Number(process.env.CONCURRENCY) > 0 ? Math.floor(Number(process.env.CONCURRENCY)) : scanConfig.concurrency);
  scanConfig.includeRowValues = typeof argv.includeRowValues === 'boolean' ? argv.includeRowValues : (process.env.INCLUDE_ROW_VALUES === 'true' ? true : scanConfig.includeRowValues);
  scanConfig.includeComments = typeof argv.includeComments === 'boolean' ? argv.includeComments : (process.env.INCLUDE_COMMENTS === 'true' ? true : scanConfig.includeComments);
  scanConfig.maxBlocks = Number.isFinite(argv.maxBlocks) && argv.maxBlocks >= 0 ? Math.floor(argv.maxBlocks) : (Number.isFinite(Number(process.env.MAX_BLOCKS)) && Number(process.env.MAX_BLOCKS) >= 0 ? Math.floor(Number(process.env.MAX_BLOCKS)) : scanConfig.maxBlocks);

  let rootTitle = 'Untitled';
  let traversalStartPageId = null;

  if (detected.type === 'page') {
    const rootPage = detected.page;
    rootTitle = getPageTitle(rootPage);
    console.log(`Root type: page — ${rootTitle}`);
    output.titles.pages[pageId] = {
      title: rootTitle,
      id: pageId,
      icon: rootPage.icon,
      cover: rootPage.cover,
      last_edited_time: rootPage.last_edited_time,
      parentLocations: ['Root'],
    };
    traversalStartPageId = pageId;
  } else if (detected.type === 'database') {
    const db = detected.database;
    const dbTitle = detected.title;
    console.log(`Root type: database — ${dbTitle}`);
    // Ensure database is recorded in normalized outputs later
    await inspectDatabase(db.id, 'Root');
    // If parent is a page, continue traversal from that page so pages/media/graph still work
    if (db.parent?.type === 'page_id' && db.parent.page_id) {
      traversalStartPageId = db.parent.page_id;
      // We also want to capture that parent page metadata
      try {
      const parentPage = await withBackoff(() => notion.pages.retrieve({ page_id: traversalStartPageId }));
      const parentTitle = getPageTitle(parentPage);
        output.titles.pages[traversalStartPageId] = {
          title: parentTitle,
          id: traversalStartPageId,
          icon: parentPage.icon,
          cover: parentPage.cover,
          last_edited_time: parentPage.last_edited_time,
          parentLocations: ['Root'],
        };
      } catch (e) {
        // If we cannot fetch parent page, skip traversal safely
        traversalStartPageId = null;
      }
    }
  }

  if (traversalStartPageId) {
    // Determine title for traversal root if we just computed it via parent page fetch
    if (detected.type === 'page') {
      // already have rootTitle
    } else {
      const parentMeta = output.titles.pages[traversalStartPageId];
      rootTitle = parentMeta?.title || rootTitle;
    }
    output.pageContent = await inspectBlock(traversalStartPageId, 0, 'page', rootTitle, traversalStartPageId);
  } else {
    // No traversal possible (database without page parent)
    output.pageContent = [];
  }

  fs.writeFileSync(
    path.join(outPath, 'notion_plr_extracted.json'),
    JSON.stringify({ schemaVersion: '1.0.0', ...output }, null, 2)
  );
  generateFormulaFiles(outPath);
  writeNormalizedOutputs(outPath, pageId, rootTitle);
  // Optional comments collection for root page (minimal fields)
  if (scanConfig.includeComments) {
    try {
      const commentsResp = await withBackoff(() => notion.comments.list({ block_id: pageId }));
      const topLevel = (commentsResp?.results || []).map(c => ({ id: c.id, created_time: c.created_time, rich_text: (c.rich_text || []).map(rt => ({ plain_text: rt.plain_text, href: rt.href || null })) }));
      fs.writeFileSync(
        path.join(outPath, 'comments.json'),
        JSON.stringify({ schemaVersion: '1.0.0', comments: topLevel }, null, 2)
      );
    } catch {
      // Swallow comment retrieval errors silently; non-critical
    }
  }
  const pageCount = Object.keys(output.titles.pages).length;
  const dbCount = output.databases.length;
  const imageCount = output.media.imageBlocks.length;
  const conc = scanConfig.concurrency;
  const incRows = scanConfig.includeRowValues;
  const incComments = scanConfig.includeComments;
  const totalBlocks = scanConfig.blocksFetchedCount;
  console.log(
    `✅ Done. Files saved to /outputs — pages: ${pageCount}, databases: ${dbCount}, images: ${imageCount}. Pagination: enabled; schemaVersion added to formulas.json and notion_plr_extracted.json; concurrency=${conc}; includeRowValues=${incRows}; includeComments=${incComments}; totalBlocks=${totalBlocks}`
  );
})();