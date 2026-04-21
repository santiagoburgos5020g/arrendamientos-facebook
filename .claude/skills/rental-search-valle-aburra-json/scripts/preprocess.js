#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { files: [], dateFilter: 'cualquier_fecha', output: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--files' && argv[i + 1]) {
      args.files = argv[++i].split(',').map(f => f.trim());
    } else if (argv[i] === '--date-filter' && argv[i + 1]) {
      args.dateFilter = argv[++i];
    } else if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

function getDateCutoff(dateFilter) {
  if (!dateFilter || dateFilter === 'cualquier_fecha') return null;

  const now = new Date();
  const cutoffs = {
    'ultimas_24h': 1,
    'ultimos_3_dias': 3,
    'ultima_semana': 7,
    'ultimas_2_semanas': 14,
    'ultimo_mes': 30,
    'ultimos_2_meses': 60
  };

  const days = cutoffs[dateFilter];
  if (!days) return null;

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff;
}

function extractOcrText(ocrRaw) {
  if (!ocrRaw || typeof ocrRaw !== 'string') return null;

  const textSaysMatch = ocrRaw.match(/text that says ['"](.+?)['"]\s*$/i);
  if (textSaysMatch) {
    return textSaysMatch[1];
  }

  const textMatch = ocrRaw.match(/text that says ['"](.+)['"]/i);
  if (textMatch) {
    return textMatch[1];
  }

  const pureDescriptions = [
    /^May be an image of .+ and indoors$/i,
    /^May be an image of .+ and outdoors$/i,
    /^No photo description available\.?$/i,
    /^May be an image of \d+ people?$/i,
    /^May be a closeup/i,
    /^May be an image of (bedroom|living room|kitchen|bathroom|sliding door|range hood|wall|furniture)/i
  ];

  for (const pattern of pureDescriptions) {
    if (pattern.test(ocrRaw) && !ocrRaw.includes('text that says')) {
      return null;
    }
  }

  if (ocrRaw.startsWith('May be an image of') && !ocrRaw.includes('text')) {
    return null;
  }

  return ocrRaw;
}

function processPost(rawPost, index) {
  const text = rawPost.text || '';

  const ocrTexts = [];
  if (rawPost.attachments && Array.isArray(rawPost.attachments)) {
    for (const attachment of rawPost.attachments) {
      if (attachment.ocrText) {
        const extracted = extractOcrText(attachment.ocrText);
        if (extracted) {
          ocrTexts.push(extracted);
        }
      }
    }
  }

  if (!text.trim() && ocrTexts.length === 0) {
    return null;
  }

  return {
    index,
    text: text.trim(),
    ocrTexts,
    url: rawPost.url || '',
    time: rawPost.time || '',
    groupTitle: rawPost.groupTitle || '',
    userName: rawPost.user?.name || ''
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.files.length === 0) {
    console.error('Error: --files argument is required');
    process.exit(1);
  }
  if (!args.output) {
    console.error('Error: --output argument is required');
    process.exit(1);
  }

  let allPosts = [];
  let filesProcessed = 0;

  for (const filePath of args.files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const posts = Array.isArray(parsed) ? parsed : [parsed];
      allPosts = allPosts.concat(posts);
      filesProcessed++;
    } catch (err) {
      console.error(`Warning: Could not process ${filePath}: ${err.message}`);
    }
  }

  if (filesProcessed === 0) {
    console.error('Error: No files could be processed');
    process.exit(1);
  }

  const totalRawPosts = allPosts.length;

  const seenUrls = new Set();
  const dedupedPosts = [];
  for (const post of allPosts) {
    const url = post.url || '';
    if (url && seenUrls.has(url)) continue;
    if (url) seenUrls.add(url);
    dedupedPosts.push(post);
  }
  const afterDedup = dedupedPosts.length;

  const processed = [];
  let globalIndex = 0;
  for (const rawPost of dedupedPosts) {
    const result = processPost(rawPost, globalIndex);
    if (result) {
      processed.push(result);
    }
    globalIndex++;
  }
  const afterEmptyRemoval = processed.length;

  const dateCutoff = getDateCutoff(args.dateFilter);
  let finalPosts = processed;
  if (dateCutoff) {
    finalPosts = processed.filter(post => {
      if (!post.time) return true;
      try {
        const postDate = new Date(post.time);
        return postDate >= dateCutoff;
      } catch {
        return true;
      }
    });
  }
  const afterDateFilter = finalPosts.length;

  finalPosts = finalPosts.map((post, i) => ({ ...post, index: i }));

  const output = {
    metadata: {
      totalRawPosts,
      afterDedup,
      afterEmptyRemoval,
      afterDateFilter,
      preprocessedAt: new Date().toISOString()
    },
    posts: finalPosts
  };

  const outputDir = path.dirname(args.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(args.output, JSON.stringify(output, null, 2), 'utf-8');

  console.log(JSON.stringify(output.metadata));
}

main();
