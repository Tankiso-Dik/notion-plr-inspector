#!/usr/bin/env node
import 'dotenv/config';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withBackoff(fn, { maxRetries = 5, baseDelayMs = 300 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.code;
      const isRateLimit = status === 429 || error?.message?.includes('Rate limit');
      if (!isRateLimit || attempt >= maxRetries) throw error;
      await sleep(baseDelayMs * Math.pow(2, attempt++));
    }
  }
}

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
      const status = e2?.status ?? e2?.code;
      return { type: 'unknown', error: e2, status };
    }
  }
}

async function main() {
  const id = process.argv.slice(2).find(a => !a.startsWith('-'));
  if (!id) {
    console.error('Usage: npm run what-id -- <id>');
    process.exit(2);
  }
  const res = await detectRootType(id);
  if (res.type === 'page') {
    console.log('Type: PAGE');
    process.exit(0);
  }
  if (res.type === 'database') {
    console.log('Type: DATABASE');
    console.log(`Title: ${res.title}`);
    if (res.parent?.type === 'page_id' && res.parent.page_id) {
      console.log(`Parent page: ${res.parent.page_id}`);
    }
    process.exit(0);
  }
  const status = res.status;
  if (status === 401 || status === 403) {
    console.error('Integration lacks access or token invalid');
  } else if (status === 404) {
    console.error('ID not found or no access');
  } else {
    console.error(res.error?.message || res.error || 'Unknown error');
  }
  process.exit(1);
}

main();
