// ABOUT: Check which items have content available (especially videos)
// ABOUT: Run with: npx tsx scripts/check-video-content.ts

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
  html_content?: string;
  created_at: string;
}

async function fetchItemsWithContent(token: string): Promise<ReaderItem[]> {
  const allItems: ReaderItem[] = [];
  let nextCursor: string | null = null;

  console.log('📥 Fetching items with content from Reader API...\n');

  do {
    const url = nextCursor
      ? `https://readwise.io/api/v3/list/?location=new&withHtmlContent=true&pageCursor=${nextCursor}`
      : 'https://readwise.io/api/v3/list/?location=new&withHtmlContent=true';

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
    };

    if (data.results) {
      allItems.push(...data.results);
      console.log(`   Fetched ${data.results.length} items (${allItems.length} total)`);
    }

    nextCursor = data.nextPageCursor || null;

  } while (nextCursor);

  return allItems;
}

function analyzeContent(item: ReaderItem): {
  hasContent: boolean;
  contentLength: number;
  meetsMinimum: boolean;
  firstChars: string;
  status: string;
} {
  const html_content = item.html_content || '';
  const hasContent = html_content.length > 0;
  const contentLength = html_content.length;
  const meetsMinimum = contentLength >= 100; // Our validation threshold
  const firstChars = html_content.substring(0, 200).replace(/\n/g, ' ').replace(/<[^>]+>/g, '');

  let status = '';
  if (!hasContent) {
    status = '❌ NO CONTENT';
  } else if (!meetsMinimum) {
    status = '⚠️  TOO SHORT (<100 chars)';
  } else if (contentLength > 30000) {
    status = '⚠️  WILL TRUNCATE (>30k chars)';
  } else {
    status = '✅ OK';
  }

  return { hasContent, contentLength, meetsMinimum, firstChars, status };
}

async function main() {
  const env = loadDevVars();

  if (!env.READER_API_TOKEN) {
    console.error('❌ READER_API_TOKEN not found in .dev.vars');
    process.exit(1);
  }

  try {
    const items = await fetchItemsWithContent(env.READER_API_TOKEN);

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Content Analysis for ${items.length} items\n`);
    console.log('='.repeat(80));

    // Separate by category
    const byCategory: Record<string, ReaderItem[]> = {};
    items.forEach(item => {
      const cat = item.category || 'unknown';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    });

    // Analyze all items
    const analyses = items.map(item => ({
      item,
      analysis: analyzeContent(item),
    }));

    // Summary stats
    const withContent = analyses.filter(a => a.analysis.hasContent);
    const meetsMinimum = analyses.filter(a => a.analysis.meetsMinimum);
    const willTruncate = analyses.filter(a => a.analysis.contentLength > 30000);
    const tooShort = analyses.filter(a => a.analysis.hasContent && !a.analysis.meetsMinimum);
    const noContent = analyses.filter(a => !a.analysis.hasContent);

    console.log('\n📈 Summary:\n');
    console.log(`   Total items:           ${items.length}`);
    console.log(`   ✅ Have content:       ${withContent.length}`);
    console.log(`   ✅ Will process:       ${meetsMinimum.length} (≥100 chars)`);
    console.log(`   ⚠️  Will truncate:     ${willTruncate.length} (>30k chars)`);
    console.log(`   ⚠️  Too short:         ${tooShort.length} (<100 chars)`);
    console.log(`   ❌ No content:         ${noContent.length}`);

    // Breakdown by category
    console.log('\n📂 By Category:\n');
    Object.entries(byCategory).forEach(([cat, items]) => {
      const catAnalyses = items.map(item => analyzeContent(item));
      const catOk = catAnalyses.filter(a => a.meetsMinimum).length;
      const catFail = items.length - catOk;

      console.log(`   ${cat.padEnd(12)} ${items.length.toString().padStart(2)} items → ${catOk} will process, ${catFail} will fail`);
    });

    // Show videos in detail
    if (byCategory.video) {
      console.log('\n' + '='.repeat(80));
      console.log('\n🎥 VIDEO ITEMS (Detailed):\n');

      byCategory.video.forEach((item, index) => {
        const analysis = analyzeContent(item);
        const truncatedTitle = item.title.length > 60
          ? item.title.substring(0, 57) + '...'
          : item.title;

        console.log(`${(index + 1).toString().padStart(2)}. ${analysis.status} ${truncatedTitle}`);
        console.log(`    Category: ${item.category}`);
        console.log(`    Source: ${item.source || 'N/A'}`);
        console.log(`    Content length: ${analysis.contentLength.toLocaleString()} characters`);

        if (analysis.hasContent && analysis.firstChars) {
          console.log(`    Preview: ${analysis.firstChars}...`);
        } else {
          console.log(`    Preview: (No content available)`);
        }
        console.log('');
      });
    }

    // Show items that will fail
    if (noContent.length > 0 || tooShort.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('\n⚠️  ITEMS THAT WILL FAIL SUMMARY GENERATION:\n');

      [...noContent, ...tooShort].forEach((a, index) => {
        const item = a.item;
        const truncatedTitle = item.title.length > 60
          ? item.title.substring(0, 57) + '...'
          : item.title;

        console.log(`${(index + 1).toString().padStart(2)}. ${a.analysis.status} ${truncatedTitle}`);
        console.log(`    Category: ${item.category || 'unknown'}`);
        console.log(`    Content: ${a.analysis.contentLength} chars`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('\n💡 What This Means:\n');
    console.log(`   • ${meetsMinimum.length} items will generate AI summaries successfully`);
    console.log(`   • ${noContent.length + tooShort.length} items will fail (no content or too short)`);
    if (willTruncate.length > 0) {
      console.log(`   • ${willTruncate.length} items will be truncated (>30k chars → 30k chars)`);
    }

    console.log('\n🎯 Recommendation:');
    if (byCategory.video && noContent.some(a => a.item.category === 'video')) {
      console.log('   • Some videos have no transcripts in Reader API');
      console.log('   • Consider adding YouTube transcript fetching (Phase 5 enhancement)');
    }
    console.log('   • Proceed with sync - working items will get summaries');
    console.log('   • Failed items can be retried later (Phase 5 will add retry UI)');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
