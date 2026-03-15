// ABOUT: List unread items from Reader API with their types
// ABOUT: Run with: npx tsx scripts/list-reader-items.ts

import * as fs from 'fs';
import * as path from 'path';

// Load .dev.vars
function loadDevVars() {
  const devVarsPath = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(devVarsPath)) {
    console.error('❌ .dev.vars file not found!');
    process.exit(1);
  }

  const content = fs.readFileSync(devVarsPath, 'utf-8');
  const vars: Record<string, string> = {};

  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        vars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return vars;
}

interface ReaderItem {
  id: string;
  title: string;
  author?: string;
  source?: string;
  url: string;
  word_count?: number;
  category?: string;
  reading_progress?: number;
  created_at: string;
}

async function fetchAllUnreadItems(token: string): Promise<ReaderItem[]> {
  const allItems: ReaderItem[] = [];
  let nextCursor: string | null = null;

  console.log('📥 Fetching unread items from Reader API...\n');

  do {
    const url = nextCursor
      ? `https://readwise.io/api/v3/list/?location=new&pageCursor=${nextCursor}`
      : 'https://readwise.io/api/v3/list/?location=new';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Reader API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      results?: ReaderItem[];
      nextPageCursor?: string | null;
      count?: number;
    };

    if (data.results) {
      allItems.push(...data.results);
      console.log(`   Fetched ${data.results.length} items (${allItems.length} total)`);
    }

    nextCursor = data.nextPageCursor || null;

  } while (nextCursor);

  return allItems;
}

function categorizeByType(items: ReaderItem[]) {
  const byCategory: Record<string, ReaderItem[]> = {};

  items.forEach(item => {
    const category = item.category || 'unknown';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(item);
  });

  return byCategory;
}

function guessTypeFromURL(url: string, source?: string): string {
  const lowerURL = url.toLowerCase();
  const lowerSource = (source || '').toLowerCase();

  if (lowerURL.includes('youtube.com') || lowerURL.includes('youtu.be')) {
    return 'Video (YouTube)';
  }
  if (lowerURL.includes('.pdf') || lowerSource.includes('pdf')) {
    return 'PDF';
  }
  if (lowerURL.includes('twitter.com') || lowerURL.includes('x.com')) {
    return 'Tweet';
  }
  if (lowerURL.includes('github.com')) {
    return 'GitHub';
  }
  if (lowerSource.includes('substack') || lowerURL.includes('substack.com')) {
    return 'Newsletter (Substack)';
  }
  if (lowerSource.includes('medium') || lowerURL.includes('medium.com')) {
    return 'Article (Medium)';
  }

  return 'Article';
}

async function main() {
  const env = loadDevVars();

  if (!env.READER_API_TOKEN) {
    console.error('❌ READER_API_TOKEN not found in .dev.vars');
    process.exit(1);
  }

  try {
    const items = await fetchAllUnreadItems(env.READER_API_TOKEN);

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Found ${items.length} unread items\n`);
    console.log('='.repeat(80));

    // Categorize by Reader category if available
    const byCategory = categorizeByType(items);
    const categories = Object.keys(byCategory).sort();

    // Count by guessed type
    const typeCounts: Record<string, number> = {};
    items.forEach(item => {
      const type = guessTypeFromURL(item.url, item.source);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log('\n📈 Breakdown by Type:\n');
    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   ${type.padEnd(25)} ${count.toString().padStart(3)} items`);
      });

    console.log('\n' + '='.repeat(80));
    console.log('\n📚 Item List:\n');

    items.forEach((item, index) => {
      const type = guessTypeFromURL(item.url, item.source);
      const number = (index + 1).toString().padStart(2, ' ');
      const truncatedTitle = item.title.length > 70
        ? item.title.substring(0, 67) + '...'
        : item.title;

      console.log(`${number}. [${type}] ${truncatedTitle}`);

      if (item.author) {
        console.log(`    Author: ${item.author}`);
      }
      if (item.source) {
        console.log(`    Source: ${item.source}`);
      }
      if (item.word_count) {
        console.log(`    Length: ${item.word_count.toLocaleString()} words`);
      }
      console.log(`    URL: ${item.url}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('\n💡 Notes:');
    console.log('   - Type detection is based on URL patterns and source names');
    console.log('   - Reader API category field:');
    if (categories.length > 0) {
      categories.forEach(cat => {
        console.log(`     • ${cat}: ${byCategory[cat].length} items`);
      });
    } else {
      console.log('     (No category data available from API)');
    }

    console.log('\n✅ Ready to sync these items!');
    console.log('   Run: Terminal 1: npm run dev:consumer');
    console.log('        Terminal 2: npm run dev');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
