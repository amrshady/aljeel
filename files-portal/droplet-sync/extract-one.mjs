/**
 * extract-one.mjs — extract a single document file to staged markdown
 *
 * Usage: node extract-one.mjs <input-path> <staging-dir> [category]
 *
 * OCR pipeline (LLM-only, no Tesseract):
 *   - Native text-extractable PDFs → pdfjs text layer
 *   - Image-only / scanned PDFs and image files → Gemini vision OCR with model chain:
 *       gemini-3-pro-preview → gemini-2.5-pro → gemini-2.5-flash
 *     (matches Mike's proven AlJeel pipeline. Gemini 3 Pro often 503s under load
 *      so 2.5 Pro is the real workhorse; 2.5 Flash is the safety net.)
 *
 * Supported: pdf, docx, xlsx, xls, eml, txt, md, csv, html, json, png, jpg, jpeg, tiff, tif, bmp, webp
 *
 * Env:
 *   GEMINI_API_KEY            — required for OCR (any non-text-extractable input)
 *   REGENT_OCR_MODELS         — comma-separated override (default Mike chain)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import { basename, join, extname } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { Buffer } from 'buffer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const OCR_MODELS = (process.env.REGENT_OCR_MODELS || 'gemini-3-pro-preview,gemini-2.5-pro,gemini-2.5-flash')
  .split(',').map(s => s.trim()).filter(Boolean);

// If pdfjs text layer is below this many chars total, treat as scanned → OCR.
const SCANNED_THRESHOLD_CHARS = 100;

const OCR_SYS_PROMPT =
  "You are an OCR engine. Transcribe ALL visible text from this scanned document into clean markdown. " +
  "Preserve page structure with '## Page N' headers where pages are distinguishable. " +
  "For each page, include every piece of visible text — party names, dates, signatures, addresses, headers, " +
  "footers, tables, and all body text — exactly as written. " +
  "For Arabic / right-to-left text, transcribe in the original script. " +
  "Do not summarize, do not infer, do not paraphrase. Output the markdown transcription only.";

const [inputPath, stagingDir, categoryArg] = process.argv.slice(2);
if (!inputPath || !stagingDir) {
  console.error('Usage: node extract-one.mjs <input-path> <staging-dir> [category]');
  process.exit(2);
}

mkdirSync(stagingDir, { recursive: true });

const category = categoryArg || inferCategory(inputPath);
let ext = inputPath.split('.').pop().toLowerCase();
const base = basename(inputPath);

// Some KB files have the wrong extension (e.g., .doc that's actually a PDF, .png that's a PDF).
// Detect the real type by magic bytes (first 8 bytes) and override ext.
function detectActualType(filePath) {
  try {
    const fd = require('fs').openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    require('fs').readSync(fd, buf, 0, 12, 0);
    require('fs').closeSync(fd);
    // PDF: starts with %PDF
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    // ZIP-based (OOXML docx/pptx/xlsx): PK\x03\x04. Keep declared ext (we need to know if it's docx vs xlsx etc).
    if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return null;
    // OLE compound file (legacy doc/xls/ppt): D0 CF 11 E0 A1 B1 1A E1. Keep declared ext to distinguish.
    if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) return null;
    // RTF: starts with {\rtf
    if (buf[0] === 0x7B && buf[1] === 0x5C && buf[2] === 0x72 && buf[3] === 0x74 && buf[4] === 0x66) return 'rtf';
    // TIFF: II*\0 or MM\0*
    if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A) || (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00)) return 'tiff';
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    // WebP: RIFF....WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
    return null;
  } catch {
    return null;
  }
}

const realType = detectActualType(inputPath);
if (realType && realType !== ext) {
  console.error(`[extract-one] declared ext .${ext} but magic bytes say ${realType} — using real type`);
  ext = realType;
}

function inferCategory(p) {
  if (p.includes('/grc/')) return 'Compliance';
  if (p.includes('/policies/')) return 'HR Policy';
  if (p.includes('/procedures/')) return 'HR Procedure';
  if (p.includes('/routing/')) return 'HR Routing';
  return 'General';
}

function safeFilename(p) {
  return basename(p).replace(/[^a-zA-Z0-9\-_.\u0600-\u06FF]/g, '_') + '.md';
}

// =====================================================
// PDF — text-layer first, OCR fallback
// =====================================================
async function extractPDF(filePath) {
  const buf = readFileSync(filePath);
  const bufCopy = Buffer.from(buf);  // preserved for OCR fallback (pdfjs detaches)

  let textLayer = '';
  try {
    const { getDocument } = await import('/usr/lib/node_modules/openclaw/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
      standardFontDataUrl: '/usr/lib/node_modules/openclaw/node_modules/pdfjs-dist/standard_fonts/',
    }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lines = [];
      let currentLine = [];
      let lastY = null;
      for (const item of content.items) {
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.length) lines.push(currentLine.join(''));
          currentLine = [];
        }
        currentLine.push(item.str);
        lastY = y;
      }
      if (currentLine.length) lines.push(currentLine.join(''));
      const pageText = lines.join('\n').trim();
      if (pageText) pages.push(`## Page ${i}\n\n${pageText}`);
    }
    textLayer = pages.join('\n\n---\n\n');
  } catch (err) {
    console.error(`[extract-one] pdfjs text-layer extraction threw: ${err.message}`);
    textLayer = '';
  }

  // Decide: text-rich → return text. Sparse → OCR via Gemini.
  if (textLayer.replace(/\s/g, '').length < SCANNED_THRESHOLD_CHARS) {
    console.error(`[extract-one] PDF sparse text layer (${textLayer.trim().length} chars) — falling back to Gemini vision OCR`);
    const ocrText = await ocrViaGemini(bufCopy, 'application/pdf', base);
    if (ocrText && ocrText.trim().length > textLayer.trim().length) {
      return ocrText;
    }
  }

  return textLayer;
}

// =====================================================
// Image — Gemini OCR directly
// =====================================================
async function extractImage(filePath) {
  const buf = readFileSync(filePath);
  const mime = mimeForExt(ext);
  console.error(`[extract-one] image OCR via Gemini (${mime}, ${buf.length} bytes)`);
  return await ocrViaGemini(buf, mime, base);
}

function mimeForExt(e) {
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'tiff' || e === 'tif') return 'image/tiff';
  if (e === 'bmp') return 'image/bmp';
  if (e === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

// =====================================================
// Gemini OCR — model chain with Files API for >18MB
// =====================================================
async function ocrViaGemini(buf, mimeType, filename) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[extract-one] GEMINI_API_KEY missing — OCR unavailable');
    return '';
  }
  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = await import('/home/clawdbot/.openclaw/workspace/node_modules/@google/genai/dist/node/index.mjs'));
  } catch (err) {
    console.error(`[extract-one] @google/genai import failed: ${err.message}`);
    return '';
  }

  const ai = new GoogleGenAI({ apiKey });

  // Transport: inline base64 for <=18MB; Files API for larger
  const INLINE_MAX = 18 * 1024 * 1024;
  let mediaPart;
  if (buf.length <= INLINE_MAX) {
    mediaPart = { inlineData: { mimeType, data: Buffer.from(buf).toString('base64') } };
  } else {
    console.error(`[extract-one] ${filename} is ${(buf.length / 1024 / 1024).toFixed(1)}MB — uploading via Files API`);
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
      const uploaded = await ai.files.upload({
        file: blob,
        config: { mimeType, displayName: filename },
      });
      if (!uploaded.uri) {
        console.error(`[extract-one] Files API upload returned no URI for ${filename}`);
        return '';
      }
      mediaPart = { fileData: { mimeType, fileUri: uploaded.uri } };
    } catch (err) {
      console.error(`[extract-one] Files API upload failed for ${filename}: ${err.message?.slice(0, 300)}`);
      return '';
    }
  }

  const contents = [{
    role: 'user',
    parts: [
      mediaPart,
      { text: 'Transcribe every page of this document to markdown. Do not summarize.' },
    ],
  }];

  for (const model of OCR_MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction: OCR_SYS_PROMPT },
      });
      const out = (resp.text ?? '').trim();
      if (out.length > 50) {
        console.error(`[extract-one] OCR succeeded via ${model}: ${out.length} chars from ${(buf.length / 1024).toFixed(0)}KB`);
        return out;
      }
      console.error(`[extract-one] ${model} returned ${out.length} chars (too short) — trying next`);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`[extract-one] ${model} failed: ${msg.slice(0, 200)}`);
    }
  }
  console.error(`[extract-one] all OCR models exhausted for ${filename}`);
  return '';
}

// =====================================================
// DOCX / XLSX / EML / text
// =====================================================
async function extractDOCX(filePath) {
  try {
    const mammoth = require('/home/clawdbot/.openclaw/workspace/node_modules/mammoth');
    const buffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    if (result.value && result.value.trim().length > 20) return result.value;
  } catch (err) {
    console.error(`[extract-one] mammoth failed (${err.message?.slice(0, 100)}), falling back to libreoffice`);
  }
  return extractViaLibreOffice(filePath);
}

// LibreOffice headless conversion to plain text — handles legacy doc, pptx, potx, dotx, odt, rtf, etc.
function extractViaLibreOffice(filePath) {
  const work = join(tmpdir(), `lo-${Date.now()}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    execFileSync('soffice', [
      '--headless',
      '--convert-to', 'txt:Text (encoded):UTF8',
      '--outdir', work,
      filePath,
    ], {
      stdio: 'pipe',
      timeout: 90_000,
      env: { ...process.env, HOME: work },
      cwd: work,  // soffice's startup script does cd $(pwd); must be a writable dir
    });
    const baseNoExt = basename(filePath, extname(filePath));
    const txtPath = join(work, `${baseNoExt}.txt`);
    if (existsSync(txtPath)) return readFileSync(txtPath, 'utf8');
    const fallback = readdirSync(work).find(f => f.endsWith('.txt'));
    if (fallback) return readFileSync(join(work, fallback), 'utf8');
    return '';
  } catch (err) {
    console.error(`[extract-one] libreoffice failed: ${err.message?.slice(0, 200)}`);
    return '';
  } finally {
    try {
      for (const f of readdirSync(work)) { try { unlinkSync(join(work, f)); } catch {} }
      rmdirSync(work);
    } catch {}
  }
}

// For Office formats that often contain image-heavy slides/templates (pptx, potx, dotx).
// First try LO text extract; if sparse, render to PDF via LO and OCR with Gemini.
async function extractOfficeDoc(filePath) {
  const text = extractViaLibreOffice(filePath);
  if (text && text.trim().length > 20) return text;
  console.error(`[extract-one] LO extract sparse for ${basename(filePath)} — rendering to PDF + OCR`);
  const pdfPath = renderViaLibreOffice(filePath, 'pdf');
  if (!pdfPath) return '';
  try {
    const buf = readFileSync(pdfPath);
    return await ocrViaGemini(buf, 'application/pdf', basename(filePath));
  } finally {
    try { unlinkSync(pdfPath); } catch {}
    try { rmdirSync(join(tmpdir(), basename(pdfPath, '.pdf'))); } catch {}
  }
}

function renderViaLibreOffice(filePath, format) {
  const work = join(tmpdir(), `lo-render-${Date.now()}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    execFileSync('soffice', [
      '--headless', '--convert-to', format, '--outdir', work, filePath,
    ], {
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, HOME: work },
      cwd: work,
    });
    const baseNoExt = basename(filePath, extname(filePath));
    const outPath = join(work, `${baseNoExt}.${format}`);
    if (existsSync(outPath)) return outPath;
    const fb = readdirSync(work).find(f => f.endsWith(`.${format}`));
    return fb ? join(work, fb) : null;
  } catch (err) {
    console.error(`[extract-one] LO render to ${format} failed: ${err.message?.slice(0, 200)}`);
    return null;
  }
}

function extractXLSX(filePath) {
  const XLSX = require('/home/clawdbot/.openclaw/workspace/node_modules/xlsx');
  const workbook = XLSX.readFile(filePath);
  const out = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim().length > 0) {
      out.push(`## Sheet: ${sheetName}\n\n\`\`\`\n${csv}\n\`\`\``);
    }
  }
  return out.join('\n\n');
}

function extractEML(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const body = raw.replace(/Content-Transfer-Encoding: base64[\s\S]*?(?=--|\Z)/g, '[binary attachment removed]');
  return `# Email\n\n${body.slice(0, 50000)}`;
}

function extractText(filePath) {
  return readFileSync(filePath, 'utf8');
}

// =====================================================
// MAIN
// =====================================================
async function main() {
  let content = '';
  try {
    if (ext === 'pdf') content = await extractPDF(inputPath);
    else if (ext === 'docx') content = await extractDOCX(inputPath);
    else if (['doc', 'rtf', 'odt', 'dotx', 'dot'].includes(ext)) content = extractViaLibreOffice(inputPath);
    else if (ext === 'xlsx' || ext === 'xls') {
      try { content = extractXLSX(inputPath); }
      catch (err) {
        console.error(`[extract-one] SheetJS failed (${err.message?.slice(0, 100)}), falling back to libreoffice`);
        content = extractViaLibreOffice(inputPath);
      }
    }
    else if (['pptx', 'ppt', 'potx', 'pot', 'odp'].includes(ext)) content = await extractOfficeDoc(inputPath);
    else if (ext === 'eml') content = extractEML(inputPath);
    else if (['png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'webp'].includes(ext)) {
      const ocrText = await extractImage(inputPath);
      content = ocrText ? `## OCR\n\n${ocrText}` : '';
    }
    else if (['txt', 'md', 'csv', 'html', 'json', 'log'].includes(ext)) content = extractText(inputPath);
    else {
      // Unknown ext — try LibreOffice as last resort, then Gemini OCR if it's binary
      console.error(`[extract-one] unknown ext .${ext}, attempting libreoffice fallback`);
      content = extractViaLibreOffice(inputPath);
      if (!content || content.trim().length < 20) {
        console.error(`unsupported extension: .${ext}`);
        process.exit(3);
      }
    }
  } catch (err) {
    console.error(`extraction error: ${err.message}`);
    process.exit(4);
  }

  // Sanitize: strip control characters except whitespace, and invalid UTF-8 sequences.
  // PDF text extraction sometimes leaks binary bytes that break openclaw wiki ingest's UTF-8 check.
  content = content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // strip control bytes (keep \t \n \r)
    .replace(/\uFFFD/g, '?');  // strip Unicode replacement char
  // Final UTF-8 round-trip: encode to bytes, decode with replace on invalid, drops broken sequences
  content = Buffer.from(content, 'utf8').toString('utf8');

  if (!content || content.trim().length < 20) {
    console.error('minimal content extracted (<20 chars)');
    process.exit(5);
  }

  const stagedPath = `${stagingDir}/${safeFilename(inputPath)}`;
  const md = `---
title: "${base.replace(/"/g, '\\"')}"
category: "${category}"
source: "${inputPath}"
extractedAt: "${new Date().toISOString()}"
---

# ${base}

> **Category:** ${category}
> **Source:** \`${inputPath}\`

${content}
`;
  writeFileSync(stagedPath, md, 'utf8');
  console.log(stagedPath);
}

main();
