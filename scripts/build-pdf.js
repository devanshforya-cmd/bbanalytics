const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function markdownToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeContent = '';
  let inTable = false;
  let tableHeaderParsed = false;
  let inList = false;
  let listType = 'ul';

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineFormat(text) {
    let t = text;
    // Inline code
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold italic
    t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Inline math $...$
    t = t.replace(/\$([^$]+)\$/g, '<span class="math font-mono">$1</span>');
    return t;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre class="code-block language-${codeBlockLang}"><code>${escapeHtml(codeContent.trimEnd())}</code></pre>\n`;
        inCodeBlock = false;
        codeContent = '';
        codeBlockLang = '';
      } else {
        if (inList) { html += `</${listType}>\n`; inList = false; }
        if (inTable) { html += '</tbody></table></div>\n'; inTable = false; }
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      const cells = line.split('|').map(c => c.trim()).slice(1, -1);
      
      // Separator row (e.g. |---|:---:|---|)
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderParsed = true;
        html += '<div class="table-container"><table>\n<thead><tr>\n';
        cells.forEach(cell => {
          html += `<th>${inlineFormat(cell)}</th>\n`;
        });
        html += '</tr></thead>\n<tbody>\n';
      } else {
        html += '<tr>\n';
        cells.forEach(cell => {
          html += `<td>${inlineFormat(cell)}</td>\n`;
        });
        html += '</tr>\n';
      }
      continue;
    } else if (inTable) {
      html += '</tbody></table></div>\n';
      inTable = false;
    }

    // Blockquotes
    if (line.trim().startsWith('>')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      const quoteText = line.trim().replace(/^>\s?/, '');
      html += `<blockquote>${inlineFormat(quoteText)}</blockquote>\n`;
      continue;
    }

    // Horizontal Rules
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      html += '<hr />\n';
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      html += `<h1 id="${encodeURIComponent(line.slice(2).trim())}">${inlineFormat(line.slice(2))}</h1>\n`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      html += `<h2 id="${encodeURIComponent(line.slice(3).trim())}">${inlineFormat(line.slice(3))}</h2>\n`;
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      html += `<h3 id="${encodeURIComponent(line.slice(4).trim())}">${inlineFormat(line.slice(4))}</h3>\n`;
      continue;
    }
    if (line.startsWith('#### ')) {
      if (inList) { html += `</${listType}>\n`; inList = false; }
      html += `<h4 id="${encodeURIComponent(line.slice(5).trim())}">${inlineFormat(line.slice(5))}</h4>\n`;
      continue;
    }

    // Lists
    const ulMatch = line.match(/^(\s*)([-*])\s+(.+)$/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

    if (ulMatch || olMatch) {
      const isOl = !!olMatch;
      const targetListType = isOl ? 'ol' : 'ul';
      const itemContent = isOl ? olMatch[3] : ulMatch[3];

      if (!inList || listType !== targetListType) {
        if (inList) html += `</${listType}>\n`;
        inList = true;
        listType = targetListType;
        html += `<${listType}>\n`;
      }
      html += `<li>${inlineFormat(itemContent)}</li>\n`;
      continue;
    } else if (inList) {
      html += `</${listType}>\n`;
      inList = false;
    }

    // Display Math $$...$$
    if (line.trim().startsWith('$$') && line.trim().endsWith('$$')) {
      const math = line.trim().slice(2, -2).trim();
      html += `<div class="math-display">${math}</div>\n`;
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      continue;
    }

    // Regular paragraphs
    html += `<p>${inlineFormat(line)}</p>\n`;
  }

  if (inTable) html += '</tbody></table></div>\n';
  if (inList) html += `</${listType}>\n`;

  return html;
}

const mdPath = path.join(__dirname, '../docs/SYSTEM_GUIDE.md');
const htmlPath = path.join(__dirname, '../docs/SYSTEM_GUIDE.html');
const pdfPath = path.join(__dirname, '../docs/Brand_Bucket_Command_Center_Master_Guide.pdf');

if (!fs.existsSync(mdPath)) {
  console.error('File not found:', mdPath);
  process.exit(1);
}

const mdContent = fs.readFileSync(mdPath, 'utf8');
const bodyHtml = markdownToHtml(mdContent);

const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Brand Bucket Command Center — Master System & Operations Reference Manual</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
      @bottom-right {
        content: counter(page);
      }
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    .cover-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%);
      color: #ffffff;
      padding: 32px 28px;
      border-radius: 12px;
      margin-bottom: 28px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12);
      page-break-after: avoid;
    }

    .cover-header h1 {
      color: #ffffff !important;
      font-size: 20pt !important;
      margin: 0 0 10px 0 !important;
      padding: 0 !important;
      border-bottom: none !important;
      letter-spacing: -0.5px;
    }

    .cover-header p {
      margin: 4px 0;
      font-size: 10pt;
      color: #cbd5e1;
    }

    .badge-bar {
      margin-top: 14px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(255, 255, 255, 0.15);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    h1, h2, h3, h4 {
      color: #0f172a;
      font-weight: 700;
      page-break-after: avoid;
    }

    h1 {
      font-size: 16pt;
      margin-top: 28px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
      color: #1e1b4b;
    }

    h2 {
      font-size: 13pt;
      margin-top: 24px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      color: #2563eb;
    }

    h3 {
      font-size: 11pt;
      margin-top: 18px;
      margin-bottom: 6px;
      color: #334155;
    }

    h4 {
      font-size: 10pt;
      margin-top: 14px;
      margin-bottom: 4px;
      color: #475569;
    }

    p {
      margin-top: 0;
      margin-bottom: 10px;
      color: #334155;
    }

    blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      font-size: 9.5pt;
      color: #475569;
      page-break-inside: avoid;
    }

    blockquote strong {
      color: #0f172a;
    }

    /* Tables */
    .table-container {
      width: 100%;
      margin: 14px 0;
      page-break-inside: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      text-align: left;
    }

    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    /* Lists */
    ul, ol {
      margin: 6px 0 12px 18px;
      padding: 0;
      color: #334155;
    }

    li {
      margin-bottom: 4px;
    }

    /* Code & Pre */
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: #0369a1;
      border: 1px solid #e2e8f0;
    }

    pre.code-block {
      background: #0f172a;
      color: #e2e8f0;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 8pt;
      line-height: 1.45;
      overflow-x: auto;
      margin: 12px 0;
      page-break-inside: avoid;
    }

    pre.code-block code {
      background: transparent;
      padding: 0;
      color: inherit;
      border: none;
    }

    /* Math */
    .math {
      background: #fdf4ff;
      border: 1px solid #f0abfc;
      color: #86198f;
      padding: 1px 4px;
      border-radius: 4px;
      font-size: 8.5pt;
    }

    .math-display {
      background: #fdf4ff;
      border-left: 4px solid #c026d3;
      padding: 8px 12px;
      margin: 10px 0;
      font-family: ui-monospace, monospace;
      font-size: 9pt;
      color: #701a75;
      page-break-inside: avoid;
    }

    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }

    .print-footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <div class="cover-header">
    <h1>Brand Bucket Command Center</h1>
    <p><strong>Master Architecture, Operational Engines & Specifications Manual</strong></p>
    <p>Version 2.0.0 (Production Enterprise Edition) &bull; Primary Territory: Nepal</p>
    <div class="badge-bar">
      <span class="badge">Next.js 14 App Router</span>
      <span class="badge">TypeScript</span>
      <span class="badge">Bikram Sambat BS 2083</span>
      <span class="badge">Supabase DB</span>
      <span class="badge">Catalog-Driven Extractor</span>
      <span class="badge">Smart Selling Assist</span>
      <span class="badge">Karma Score 0-100</span>
    </div>
  </div>

  ${bodyHtml}

  <div class="print-footer">
    <span>Brand Bucket Command Center &bull; Confidential &amp; Proprietary</span>
    <span>Generated for Devansh Agarwal &bull; September 2026</span>
  </div>

</body>
</html>
`;

fs.writeFileSync(htmlPath, completeHtml, 'utf8');
console.log('Generated HTML at:', htmlPath);

// Execute Chrome to export PDF
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (fs.existsSync(chromeBinary)) {
  console.log('Rendering PDF via Headless Chrome...');
  const cmd = `"${chromeBinary}" --headless=new --disable-gpu --no-sandbox --disable-crash-reporter --user-data-dir=/tmp/chrome_pdf_tmp --print-to-pdf="${pdfPath}" --no-pdf-header-footer "${htmlPath}"`;
  execSync(cmd);
  console.log('Successfully generated PDF at:', pdfPath);
  const stats = fs.statSync(pdfPath);
  console.log(`PDF File Size: ${(stats.size / 1024).toFixed(1)} KB`);
} else {
  console.warn('Chrome binary not found at standard macOS location.');
}
