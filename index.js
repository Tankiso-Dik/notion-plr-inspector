require('dotenv').config();
const fs = require('fs');
const { Client } = require('@notionhq/client');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbTitleCache = {};
const output = {
  summary: {
    topHeadings: [],
    firstParagraph: null,
  },
  relationships: [],
  content: [],
  flatBlocks: [],
};

async function inspectDatabase(dbId, indent = 0) {
  try {
    const prefix = ' '.repeat(indent * 2);
    const db = await notion.databases.retrieve({ database_id: dbId });
    const dbTitle = db.title?.[0]?.plain_text || 'Untitled';
    dbTitleCache[dbId] = dbTitle;

    console.log(`${prefix}📋 DB Title: ${dbTitle}`);
    console.log(`${prefix}🔑 DB ID: ${dbId}`);

    const properties = await Promise.all(Object.entries(db.properties).map(async ([key, val]) => {
      const propDetails = { name: key, type: val.type };
      if (val.type === 'formula') {
        propDetails.expression = val.formula.expression;
      }
      if (val.type === 'relation') {
        propDetails.relation_id = val.relation.database_id;
      }
      if (val.type === 'rollup') {
        propDetails.rollup = {
          relation_id: val.rollup.relation_property_id,
          property_name: val.rollup.rollup_property_name,
          function: val.rollup.function,
        };
      }
      return propDetails;
    }));

    const rows = await notion.databases.query({ database_id: dbId, page_size: 3 });
    const parsedRows = await Promise.all(rows.results.map(async (row) => {
      const rowContent = {
        rowTitle: extractText(row.properties.Name || Object.values(row.properties).find(p => p.type === 'title')),
        properties: {},
        blocks: await inspectBlock(row.id, indent + 2, 'database row'),
      };
      for (const [k, v] of Object.entries(row.properties)) {
        const val = extractText(v);
        rowContent.properties[k] = typeof val === 'object' ? val : val;
      }
      rowContent.blocksText = rowContent.blocks
        .map(b => (b.text ? `- ${b.text}` : ''))
        .filter(Boolean)
        .join('\n');
      return rowContent;
    }));

    output.content.push({
      type: 'database',
      title: dbTitle,
      id: dbId,
      properties,
      sampleRows: parsedRows,
    });

  } catch (err) {
    console.log(`${' '.repeat(indent * 2)}❌ Failed to retrieve DB: ${err.message}`);
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
    default:
      return { type: property.type, supported: false };
  }
}

function cleanRichText(textArray) {
  return textArray.map(t => {
    if (t.type === 'text') return t.plain_text;
    if (t.type === 'mention') return '[Mention]';
    if (t.type === 'equation') return `[Equation: ${t.expression}]`;
    return '[Other]';
  }).join(' ');
}

async function inspectBlock(blockId, indent = 0, parentType = 'page') {
  const blocks = await notion.blocks.children.list({ block_id: blockId });
  const children = [];

  for (const block of blocks.results) {
    const prefix = ' '.repeat(indent * 2);
    const type = block.type;
    let blockOutput = { type };
    let content = '';

    switch (type) {
      case 'child_database':
        await inspectDatabase(block.id, indent + 1);
        const title = dbTitleCache[block.id] || null;
        blockOutput.title = title;
        blockOutput.id = block.id;
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
        content = cleanRichText(block[type].rich_text);
        console.log(`${prefix}📝 ${type.toUpperCase()}: ${content}`);
        blockOutput.text = content;
        break;

      default:
        console.log(`${prefix}- ${type}`);
        break;
    }

    if (block.has_children) {
      blockOutput.blocks = await inspectBlock(block.id, indent + 1, parentType);
    }

    if (content) {
        output.flatBlocks.push({ type, text: content, depth: indent, parentType });
    }

    if (parentType !== 'page') {
      children.push(blockOutput);
    } else {
      output.content.push(blockOutput);
    }
  }
  return children;
}

function generateSummaries() {
  output.summary.totalDatabases = output.content.filter(b => b.type === 'database').length;
  output.summary.totalBlocks = output.content.length;
  output.summary.generatedAt = new Date().toISOString();

  if (!output.summary.firstParagraph) {
    const para = output.flatBlocks.find(b => b.type === 'paragraph' && b.text?.trim());
    if (para) output.summary.firstParagraph = para.text;
  }

  output.flatBlocks.forEach(b => {
    if (b.type?.startsWith('heading_')) {
      const level = Number(b.type.split('_')[1]);
      output.summary.topHeadings.push({ text: b.text, level });
    }
  });

  if (output.summary.topHeadings.length === 0) {
    const pseudoHeadings = output.flatBlocks
      .filter(b => b.type === 'callout' && b.parentType === 'page')
      .map((b, i) => ({ text: b.text, level: i === 0 ? 1 : 2 }));
    output.summary.topHeadings.push(...pseudoHeadings);
  }
}

function generateRelationshipSummary() {
  const relationships = [];
  const summary = [];

  output.content.forEach(item => {
    if (item.type === 'database') {
      item.properties.forEach(prop => {
        if (prop.type === 'relation') {
          const toDbTitle = dbTitleCache[prop.relation_id] || 'Unknown Database';
          relationships.push({
            from: item.title,
            property: prop.name,
            to: toDbTitle,
            type: 'relation',
          });
          summary.push(`${item.title} are linked to ${toDbTitle} via the '${prop.name}' property.`);
        }
      });
    }
  });
  output.relationships = relationships;
  output.summary.relationshipSummary = summary;
}

function determineTemplateType() {
    const hasGoalDb = output.content.some(b => b.type === 'database' && b.title?.toLowerCase().includes('goal'));
    const hasTaskRelation = output.relationships.some(r => r.to.toLowerCase().includes('task'));
    if (hasGoalDb && hasTaskRelation) {
        output.templateType = 'goal-tracker';
    }
}

(async () => {
  const argv = yargs(hideBin(process.argv)).option('pageId', {
    alias: 'p',
    type: 'string',
    description: 'The Notion page ID to scan',
    default: process.env.PAGE_ID,
  }).argv;

  const pageId = argv.pageId;
  if (!pageId) {
    console.error('❌ Error: No Page ID provided. Use --pageId or set PAGE_ID in .env');
    return;
  }

  console.log(`🕵️ Starting recursive scan on Notion page: ${pageId}\n`);
  await inspectBlock(pageId);
  
  generateRelationshipSummary();
  generateSummaries();
  determineTemplateType();

  console.log('\n✅ Scan complete.');

  fs.writeFileSync('notion_plr_extracted.json', JSON.stringify(output, null, 2));
  console.log('📄 Results saved to notion_plr_extracted.json');
})();
