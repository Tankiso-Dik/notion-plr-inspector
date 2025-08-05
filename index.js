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
  summary: {
    totalDatabases: 0,
    totalBlocks: 0,
    topHeadings: [],
    firstParagraph: null,
    relationshipSummary: [],
  },
  titles: {
    pages: {},
    databases: {},
  },
  databases: [],
  pageContent: [], // New: to store nested block trees for pages
  media: {
    imageBlocks: [],
  },
};

async function inspectDatabase(dbId, indent = 0, location = 'Root') {
  const prefix = ' '.repeat(indent * 2);
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const dbTitle = db.title?.[0]?.plain_text || 'Untitled';

    console.log(`${prefix}📋 DB: ${dbTitle} (ID: ${dbId})`);

    // Update or create database entry in titles map
    if (!output.titles.databases[dbId]) {
      output.titles.databases[dbId] = {
        title: dbTitle,
        id: dbId,
        icon: db.icon,
        cover: db.cover,
        last_edited_time: db.last_edited_time,
        parentLocations: [],
      };
    }
    if (!output.titles.databases[dbId].parentLocations.includes(location)) {
      output.titles.databases[dbId].parentLocations.push(location);
    }

    const properties = Object.entries(db.properties).map(([key, val]) => {
      const propDetails = { name: key, type: val.type };
      if (val.type === 'formula') propDetails.expression = val.formula.expression;
      if (val.type === 'relation') propDetails.relation_id = val.relation.database_id;
      if (val.type === 'rollup') {
        propDetails.rollup = {
          relation_property_id: val.rollup.relation_property_id,
          rollup_property_name: val.rollup.rollup_property_name,
          function: val.rollup.function,
        };
      }
      if (val.type === 'select' || val.type === 'multi_select') {
        propDetails.options = val[val.type].options.map(opt => opt.name);
      }
      if (val.type === 'status') {
        propDetails.options = val[val.type].options.map(opt => opt.name);
      }
      return propDetails;
    });

    const rows = await notion.databases.query({ database_id: dbId, page_size: 3 });
    const parsedRows = await Promise.all(rows.results.map(async (row) => {
      const rowTitle = extractText(Object.values(row.properties).find(p => p.type === 'title'));
      const newLocation = `${location} → ${dbTitle} → row: ${rowTitle || 'Untitled Row'}`;
      const rowContent = {
        rowTitle,
        rowId: row.id,
        properties: {},
        blocks: await inspectBlock(row.id, indent + 2, 'database row', newLocation, row.id), // Pass row.id as parent_block_id
      };
      for (const [k, v] of Object.entries(row.properties)) {
        rowContent.properties[k] = extractText(v);
      }
      return rowContent;
    }));

    output.databases.push({
      title: dbTitle,
      id: dbId,
      properties,
      sampleRows: parsedRows,
      parentLocations: output.titles.databases[dbId].parentLocations, // Reference the accumulated locations
    });

  } catch (err) {
    console.log(`${prefix}❌ Failed to retrieve DB: ${err.message}`);
  }
}

function extractText(property) {
  if (!property) return '';
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return cleanRichText(property[property.type]);
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

function cleanRichText(textArray) {
  return textArray.map(t => t.plain_text).join('');
}

async function inspectBlock(blockId, indent = 0, parentType = 'page', location = 'Root', parent_block_id = null) {
  const blocks = await notion.blocks.children.list({ block_id: blockId });
  const children = [];

  for (const block of blocks.results) {
    const prefix = ' '.repeat(indent * 2);
    const type = block.type;
    let blockData = {
      blockId: block.id,
      type,
      depth: indent,
      parentType,
      location,
      parent_block_id: parent_block_id,
      last_edited_time: block.last_edited_time,
    };

    switch (type) {
      case 'child_database':
        console.log(`${prefix}📋 Child DB: ${block.id}`);
        await inspectDatabase(block.id, indent + 1, location);
        blockData.database_id = block.id;
        break;

      case 'child_page':
        const page = await notion.pages.retrieve({ page_id: block.id });
        const pageTitle = page.properties.title?.title?.[0]?.plain_text || 'Untitled Page';
        console.log(`${prefix}📄 Child Page: ${pageTitle}`);

        // Update or create page entry in titles map
        if (!output.titles.pages[block.id]) {
          output.titles.pages[block.id] = {
            title: pageTitle,
            id: block.id,
            icon: page.icon,
            cover: page.cover,
            last_edited_time: page.last_edited_time,
            parentLocations: [],
          };
        }
        if (!output.titles.pages[block.id].parentLocations.includes(location)) {
          output.titles.pages[block.id].parentLocations.push(location);
        }

        blockData.page_id = block.id;
        blockData.page_title = pageTitle;
        blockData.icon = page.icon;
        blockData.cover = page.cover;
        blockData.children = await inspectBlock(block.id, indent + 1, 'page', `${location} → ${pageTitle}`, block.id);
        break;

      case 'image':
        const url = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
        const caption = cleanRichText(block.image.caption);
        console.log(`${prefix}🖼️ IMAGE: ${url}`);
        output.media.imageBlocks.push({ ...blockData, url, caption });
        blockData.url = url;
        blockData.caption = caption;
        break;

      case 'paragraph':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'callout':
      case 'bulleted_list_item':
      case 'numbered_list_item':
      case 'to_do':
      case 'toggle':
        const textContent = cleanRichText(block[type].rich_text);
        console.log(`${prefix}📝 ${type.toUpperCase()}: ${textContent}`);
        blockData.text = textContent;
        if (block.has_children) {
          blockData.children = await inspectBlock(block.id, indent + 1, type, location, block.id);
        }
        break;

      default:
        console.log(`${prefix}- ${type}`);
        if (block.has_children) {
          blockData.children = await inspectBlock(block.id, indent + 1, type, location, block.id);
        }
        break;
    }
    children.push(blockData);
  }
  return children;
}

function generateSummaries() {
  output.summary.totalDatabases = Object.keys(output.titles.databases).length;
  output.summary.totalBlocks = output.pageContent.length; // This will be a rough count, as it's nested

  // Flatten blocks to get first paragraph and top headings for summary
  const allFlatBlocks = [];
  function flattenAndCollect(blocks) {
    blocks.forEach(block => {
      if (block.text) allFlatBlocks.push(block);
      if (block.children) flattenAndCollect(block.children);
    });
  }
  flattenAndCollect(output.pageContent);
  output.databases.forEach(db => db.sampleRows.forEach(row => flattenAndCollect(row.blocks)));

  const firstPara = allFlatBlocks.find(b => b.type === 'paragraph' && b.text?.trim());
  if (firstPara) {
    output.summary.firstParagraph = firstPara.text;
  }

  output.summary.topHeadings = allFlatBlocks
    .filter(b => b.type === 'heading_1' && b.text?.trim())
    .map(h => h.text);

  const relationships = [];
  Object.values(output.databases).forEach(db => {
    db.properties.forEach(prop => {
      if (prop.type === 'relation') {
        const toDb = output.titles.databases[prop.relation_id];
        if (toDb) {
          relationships.push(`${db.title} → linked to ${toDb.title} via '${prop.name}'`);
        }
      }
    });
  });
  output.summary.relationshipSummary = relationships;
}

function formatBlockTree(blocks, indentLevel = 0) {
  let markdown = '';
  const indent = '  '.repeat(indentLevel);

  blocks.forEach(block => {
    markdown += `${indent}- **Type:** ${block.type.replace(/_/g, ' ').toUpperCase()}\n`;
    markdown += `${indent}  **Block ID:** ${block.blockId}\n`;
    if (block.text) markdown += `${indent}  **Text:** ${block.text}\n`;
    if (block.url) markdown += `${indent}  **URL:** ${block.url}\n`;
    if (block.caption) markdown += `${indent}  **Caption:** ${block.caption}\n`;
    markdown += `${indent}  **Depth:** ${block.depth}\n`;
    markdown += `${indent}  **Parent Type:** ${block.parentType}\n`;
    if (block.parent_block_id) markdown += `${indent}  **Parent Block ID:** ${block.parent_block_id}\n`;
    markdown += `${indent}  **Location:** ${block.location}\n`;
    markdown += `${indent}  **Last Edited:** ${block.last_edited_time}\n`;

    if (block.type === 'child_page' && block.page_id) {
      markdown += `${indent}  **Child Page ID:** ${block.page_id}\n`;
      markdown += `${indent}  **Child Page Title:** ${block.page_title}\n`;
      if (block.icon) markdown += `${indent}  **Icon:** ${JSON.stringify(block.icon)}\n`;
      if (block.cover) markdown += `${indent}  **Cover:** ${JSON.stringify(block.cover)}\n`;
    }
    if (block.type === 'child_database' && block.database_id) {
      markdown += `${indent}  **Child Database ID:** ${block.database_id}\n`;
    }

    if (block.children && block.children.length > 0) {
      markdown += `${indent}  **Children:**\n`;
      markdown += formatBlockTree(block.children, indentLevel + 1);
    }
    markdown += `\n`;
  });
  return markdown;
}

function generateChecklist(outPath) {
  let checklist = '# Notion PLR Data Dump Checklist\n\n';

  // 1. Pages Overview
  checklist += '## ✅ Pages Overview\n';
  Object.values(output.titles.pages).forEach(page => {
    checklist += `### Page: ${page.title} (ID: ${page.id})\n`;
    if (page.icon) checklist += `  - **Icon:** ${JSON.stringify(page.icon)}\n`;
    if (page.cover) checklist += `  - **Cover:** ${JSON.stringify(page.cover)}\n`;
    if (page.last_edited_time) checklist += `  - **Last Edited:** ${page.last_edited_time}\n`;
    if (page.parentLocations && page.parentLocations.length > 0) {
      checklist += `  - **Parent Locations:**\n`;
      page.parentLocations.forEach(loc => checklist += `    - ${loc}\n`);
    }
    checklist += `\n`;

    // Top-level blocks for this page
    const pageBlocks = output.pageContent.filter(b => b.location === page.title && b.parentType === 'page');
    if (pageBlocks.length > 0) {
      checklist += `#### Top-Level Blocks:\n`;
      checklist += formatBlockTree(pageBlocks, 0);
    }
    checklist += `---\n\n`;
  });

  // 2. Databases Overview
  checklist += '## ✅ Databases Overview\n';
  Object.values(output.databases).forEach(db => {
    checklist += `### Database: ${db.title} (ID: ${db.id})\n`;
    if (db.parentLocations && db.parentLocations.length > 0) {
      checklist += `  - **Embedded In (Parent Locations):**\n`;
      db.parentLocations.forEach(loc => checklist += `    - ${loc}\n`);
    }
    if (db.icon) checklist += `  - **Icon:** ${JSON.stringify(db.icon)}\n`;
    if (db.cover) checklist += `  - **Cover:** ${JSON.stringify(db.cover)}\n`;
    if (db.last_edited_time) checklist += `  - **Last Edited:** ${db.last_edited_time}\n`;
    checklist += `\n`;

    checklist += `#### Properties:\n`;
    db.properties.forEach(prop => {
      checklist += `  - **Name:** ${prop.name}\n`;
      checklist += `    **Type:** ${prop.type}\n`;
      if (prop.expression) checklist += `    **Expression:** 
${prop.expression}
`;
      if (prop.relation_id) {
        const relatedDb = output.titles.databases[prop.relation_id];
        checklist += `    **Relation ID:** ${prop.relation_id}\n`;
        if (relatedDb) checklist += `    **Relates to DB:** ${relatedDb.title}\n`;
      }
      if (prop.rollup) {
        checklist += `    **Rollup Property Name:** ${prop.rollup.rollup_property_name}\n`;
        checklist += `    **Rollup Function:** ${prop.rollup.function}\n`;
        const relatedDbForRollup = output.titles.databases[prop.rollup.relation_property_id];
        if (relatedDbForRollup) checklist += `    **Rollup Relation DB:** ${relatedDbForRollup.title}\n`;
      }
      if (prop.options && prop.options.length > 0) {
        checklist += `    **Options:** ${prop.options.join(', ')}\n`;
      }
      checklist += `\n`;
    });

    checklist += `#### Sample Rows:\n`;
    db.sampleRows.forEach(row => {
      checklist += `  - **Row Title:** ${row.rowTitle || 'Untitled Row'}\n`;
      checklist += `    **Row ID:** ${row.rowId}\n`;
      checklist += `\n`;

      checklist += `##### Row Properties (Extracted Text):\n`;
      for (const key in row.properties) {
        checklist += `  - **${key}:** ${JSON.stringify(row.properties[key])}\n`;
      }
      checklist += `\n`;

      if (row.blocks && row.blocks.length > 0) {
        checklist += `##### Blocks within Row (Hierarchical):\n`;
        checklist += formatBlockTree(row.blocks, 0);
      }
      checklist += `---\n\n`; // Separator between rows
    });
    checklist += `===\n\n`; // Major separator between databases
  });

  // 4. Relations and Rollups Map
  checklist += '## ✅ Relations and Rollups Map\n';
  Object.values(output.databases).forEach(db => {
    db.properties.filter(p => p.type === 'relation' || p.type === 'rollup').forEach(prop => {
      if (prop.type === 'relation') {
        const relatedDb = output.titles.databases[prop.relation_id];
        if (relatedDb) {
          checklist += `- ${db.title} → ${prop.name} → ${relatedDb.title}\n`;
        }
      } else if (prop.type === 'rollup') {
        const relatedDbForRollup = output.titles.databases[prop.rollup.relation_property_id];
        if (relatedDbForRollup) {
          checklist += `- ${db.title} → (rolling up ${prop.rollup.rollup_property_name} from ${relatedDbForRollup.title} using ${prop.rollup.function})\n`;
        }
      }
    });
  });
  checklist += `---\n\n`;

  fs.writeFileSync(path.join(outPath, 'CHECKLIST_DATA_DUMP.md'), checklist);
}

(async () => {
  const argv = yargs(hideBin(process.argv)).options({
    pageId: { alias: 'p', type: 'string', description: 'Notion page ID', default: process.env.PAGE_ID },
    templateName: { alias: 't', type: 'string', description: 'Folder name for output', default: 'default-template' },
  }).parse();

  const { pageId, templateName } = argv;
  const outPath = path.join(__dirname, 'scans', templateName);
  fs.mkdirSync(outPath, { recursive: true });

  if (!pageId) {
    console.error('❌ Error: No Page ID provided via --pageId or .env');
    return;
  }

  console.log(`🕵️ Starting deep scan on Notion page: ${pageId}\n`);
  const rootPage = await notion.pages.retrieve({ page_id: pageId });
  const rootTitle = rootPage.properties.title?.title?.[0]?.plain_text || 'Untitled';

  // Initialize root page entry in titles map
  output.titles.pages[pageId] = {
    title: rootTitle,
    id: pageId,
    icon: rootPage.icon,
    cover: rootPage.cover,
    last_edited_time: rootPage.last_edited_time,
    parentLocations: ['Root'], // Root page has itself as parent location
  };

  output.pageContent = await inspectBlock(pageId, 0, 'page', rootTitle, null); // Pass null as parent_block_id for root blocks

  generateSummaries();

  const jsonPath = path.join(outPath, 'notion_plr_extracted.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Deep scan complete. Rich JSON saved to ${jsonPath}`);

  generateChecklist(outPath);
  console.log(`✅ Data dump checklist saved to ${path.join(outPath, 'CHECKLIST_DATA_DUMP.md')}`);
})();
