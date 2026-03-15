// ABOUT: Test script to verify Reader and Perplexity API access
// ABOUT: Run with: npx tsx scripts/test-api-access.ts

import * as fs from 'fs';
import * as path from 'path';

// Load .dev.vars
function loadDevVars() {
  const devVarsPath = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(devVarsPath)) {
    console.error('❌ .dev.vars file not found!');
    console.error('   Create .dev.vars in project root with API keys');
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

const env = loadDevVars();

console.log('🧪 Testing API Access\n');
console.log('=' .repeat(50));

// Test 1: Reader API
async function testReaderAPI() {
  console.log('\n📚 Testing Reader API...');

  if (!env.READER_API_TOKEN) {
    console.error('❌ READER_API_TOKEN not found in .dev.vars');
    return false;
  }

  console.log('   Token found:', env.READER_API_TOKEN.substring(0, 10) + '...');

  try {
    const response = await fetch(
      'https://readwise.io/api/v3/list/?location=new&pageSize=1',
      {
        method: 'GET',
        headers: {
          'Authorization': `Token ${env.READER_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ Reader API failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('   Response:', text.substring(0, 200));
      return false;
    }

    const data = await response.json() as { results?: any[]; count?: number };
    console.log('✅ Reader API access OK');
    console.log(`   Total unread items: ${data.count || 0}`);
    if (data.results && data.results.length > 0) {
      console.log(`   Sample item: "${data.results[0].title}"`);
    }
    return true;

  } catch (error) {
    console.error('❌ Reader API error:', error instanceof Error ? error.message : error);
    return false;
  }
}

// Test 2: Perplexity API
async function testPerplexityAPI() {
  console.log('\n🤖 Testing Perplexity API...');

  if (!env.PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not found in .dev.vars');
    return false;
  }

  console.log('   Key found:', env.PERPLEXITY_API_KEY.substring(0, 10) + '...');

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: 'Say "API test successful" and nothing else.',
          },
        ],
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      console.error(`❌ Perplexity API failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('   Response:', text.substring(0, 200));
      return false;
    }

    const data = await response.json() as {
      model?: string;
      usage?: { total_tokens: number };
      choices?: Array<{ message: { content: string } }>;
    };

    console.log('✅ Perplexity API access OK');
    console.log(`   Model: ${data.model}`);
    console.log(`   Token usage: ${data.usage?.total_tokens || 'N/A'} tokens`);
    if (data.choices && data.choices[0]?.message?.content) {
      console.log(`   Response: "${data.choices[0].message.content.trim()}"`);
    }
    return true;

  } catch (error) {
    console.error('❌ Perplexity API error:', error instanceof Error ? error.message : error);
    return false;
  }
}

// Run tests
async function main() {
  const readerOK = await testReaderAPI();
  const perplexityOK = await testPerplexityAPI();

  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results:');
  console.log(`   Reader API:     ${readerOK ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Perplexity API: ${perplexityOK ? '✅ PASS' : '❌ FAIL'}`);

  if (readerOK && perplexityOK) {
    console.log('\n🎉 All API access tests passed!');
    console.log('   You can now run the app:');
    console.log('   Terminal 1: npm run dev:consumer');
    console.log('   Terminal 2: npm run dev');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check:');
    if (!readerOK) {
      console.log('   - Reader token is valid: https://readwise.io/access_token');
      console.log('   - Token copied correctly to .dev.vars');
    }
    if (!perplexityOK) {
      console.log('   - Perplexity key is valid: https://www.perplexity.ai/settings/api');
      console.log('   - Key starts with "pplx-"');
      console.log('   - Key copied correctly to .dev.vars');
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
