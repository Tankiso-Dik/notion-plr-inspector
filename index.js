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

const output = {
  titles: { pages: {}, databases: {} },
  databases: [],
  pageContent: [],
  media: { imageBlocks: [] },
};

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

async function inspectDatabase(dbId, indent = 0, location = 'Root') {
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
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
      if (val.type === 'formula') prop.expression = val.formula.expression;
      return prop;
    });

    const rows = await notion.databases.query({ database_id: dbId, page_size: 3 });
    const sampleRows = await Promise.all(
      rows.results.map(async row => {
        const rowTitle = extractText(Object.values(row.properties).find(p => p.type === 'title'));
        const properties = {};
        for (const [k, v] of Object.entries(row.properties)) {
          properties[k] = extractText(v);
        }
        return { rowTitle, rowId: row.id, properties };
      })
    );

    output.databases.push({ title: dbTitle, id: dbId, properties, sampleRows });
  } catch (err) {
    console.log(`❌ Failed DB: ${err.message}`);
  }
}

async function inspectBlock(blockId, indent = 0, parentType = 'page', location = 'Root') {
  const blocks = await notion.blocks.children.list({ block_id: blockId });
  const children = [];
  for (const block of blocks.results) {
    const type = block.type;
    const data = {
      blockId: block.id,
      type,
      depth: indent,
      parentType,
      location,
      last_edited_time: block.last_edited_time,
    };
    if (type === 'child_database') {
      await inspectDatabase(block.id, indent + 1, location);
      data.database_id = block.id;
    } else if (type === 'child_page') {
      const page = await notion.pages.retrieve({ page_id: block.id });
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

      // 🔁 RECURSIVELY inspect child page content
      data.children = await inspectBlock(block.id, indent + 1, 'page', `${location} → ${pageTitle}`);
    } else if (type === 'image') {
      const url = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
      const caption = block.image.caption?.map(t => t.plain_text).join('');
      data.url = url;
      data.caption = caption;
      output.media.imageBlocks.push(data);
    }
    children.push(data);
  }
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

  fs.writeFileSync(path.join(outPath, 'formulas.json'), JSON.stringify(formulasJson, null, 2));

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

(async () => {
  const argv = yargs(hideBin(process.argv)).options({
    pageId: { alias: 'p', type: 'string', default: process.env.PAGE_ID },
  }).parse();

  const { pageId } = argv;
  if (!pageId) return console.error('❌ No Page ID');

  const outPath = path.join(__dirname, 'outputs');
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });

  const rootPage = await notion.pages.retrieve({ page_id: pageId });
  const rootTitle = rootPage.properties.title?.title?.[0]?.plain_text || 'Untitled';
  output.titles.pages[pageId] = {
    title: rootTitle,
    id: pageId,
    icon: rootPage.icon,
    cover: rootPage.cover,
    last_edited_time: rootPage.last_edited_time,
    parentLocations: ['Root'],
  };

  output.pageContent = await inspectBlock(pageId, 0, 'page', rootTitle);

  fs.writeFileSync(path.join(outPath, 'notion_plr_extracted.json'), JSON.stringify(output, null, 2));
  generateFormulaFiles(outPath);

  console.log('✅ Done. Files saved to /outputs');
})();