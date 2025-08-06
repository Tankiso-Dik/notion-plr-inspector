import 'dotenv/config';
import { Client } from '@notionhq/client';

const apiKey = process.env.NOTION_API_KEY;
const pageId = process.env.PAGE_ID;

if (!apiKey || !pageId) {
  console.error(
    'NOTION_API_KEY and PAGE_ID must be set in environment variables'
  );
  process.exit(1);
}

const notion = new Client({ auth: apiKey });

async function main() {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
    console.log('Page title:', title);
  } catch (error) {
    if (error.status === 404 || error.code === 'object_not_found') {
      console.error('Page not found. Check PAGE_ID.');
    } else if (error.status === 401 || error.status === 403) {
      console.error('Unauthorized. Check NOTION_API_KEY permissions.');
    } else {
      console.error('Error retrieving page:', error.message);
    }
    process.exit(1);
  }
}

main();
