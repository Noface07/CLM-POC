import * as pdfjsLib from "pdfjs-dist";
// Vite builds and serves the worker itself, and we hand pdf.js the live port.
//
// Pointing workerSrc at a URL leaves pdf.js to construct the worker, and when that fails
// it falls back to importing the same file dynamically. Under the dev server that import
// picks up Vite's own `?import` suffix and 404s, which surfaces as "Setting up fake
// worker failed" and takes PDF reading down with it. Handing over a port that Vite has
// already resolved removes both the guesswork and the fallback.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

import { downloadBlob } from "./zip.js";

export function b64ToBytes(b64) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return arr;
}

export function b64ToBlobUrl(b64) {
  return URL.createObjectURL(new Blob([b64ToBytes(b64)], { type: "application/pdf" }));
}

export function openPdf(b64, filename) {
  const url = b64ToBlobUrl(b64);
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function textFromBytes(bytes) {
  // Relative to the deployed base, not the domain root: on GitHub Pages the app is
  // served from a subpath, and "/standard_fonts/" would look outside it.
  const standardFontDataUrl = `${import.meta.env.BASE_URL}standard_fonts/`;
  const worker = new pdfjsLib.PDFWorker({ port: new PdfWorker() });
  const task = pdfjsLib.getDocument({ data: bytes, worker, standardFontDataUrl });
  try {
    const pdf = await task.promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return fullText;
  } finally {
    await task.destroy();
    worker.destroy();
  }
}

export async function extractPdfText(b64) {
  return textFromBytes(b64ToBytes(b64));
}

export async function extractPdfTextFromBlob(blob) {
  return textFromBytes(new Uint8Array(await blob.arrayBuffer()));
}

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_ITAL = [250,333,420,500,500,833,778,214,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function toWinAnsi(s) {
  return String(s == null ? "" : s)
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/…/g, "...")
    .replace(/ /g, " ").replace(/[•·]/g, "-")
    .replace(/£/g, "GBP ").replace(/€/g, "EUR ")
    .replace(/[^\x20-\x7E]/g, "");
}

function textWidth(text, size, bold, italic) {
  const table = italic ? W_ITAL : bold ? W_BOLD : W_REG;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    total += code >= 32 && code <= 126 ? table[code - 32] : 500;
  }
  return (total * size) / 1000;
}

function wrap(text, size, bold, maxWidth, italic) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (textWidth(candidate, size, bold, italic) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function pdfString(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56;
const BODY_W = PAGE_W - MARGIN * 2;

export function buildPdf(doc, opts = {}) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  const newPage = () => { pages.push(ops); ops = []; y = PAGE_H - MARGIN; };
  const space = (needed) => { if (y - needed < MARGIN + 30) newPage(); };

  const write = (text, { size = 10.5, bold = false, italic = false, align = "left", indent = 0, after = 6, lead = 1.45, colour } = {}) => {
    const clean = toWinAnsi(text);
    const width = BODY_W - indent;
    const font = italic ? "/F3" : bold ? "/F2" : "/F1";
    for (const line of wrap(clean, size, bold, width, italic)) {
      space(size * lead);
      let x = MARGIN + indent;
      if (align === "center") x = (PAGE_W - textWidth(line, size, bold, italic)) / 2;
      y -= size * lead;
      const open = colour ? `q ${colour} rg ` : "";
      const close = colour ? " Q" : "";
      ops.push(`${open}BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfString(line)}) Tj ET${close}`);
    }
    y -= after;
  };

  for (const block of doc.blocks || []) {
    if (block.type === "title") { write(block.text, { size: 16, bold: true, align: "center", after: 10 }); continue; }
    if (block.type === "subtitle") { write(block.text, { size: 9.5, align: "center", after: 18 }); continue; }
    if (block.type === "signature") {
      space(96);
      write(`SIGNED for and on behalf of ${block.entity}`, { size: 10.5, bold: true, after: 4 });
      if (block.signed) {
        write(block.byName, { size: 15, italic: true, indent: 24, after: 1, colour: "0.11 0.23 0.42" });
        write("SIGNED ELECTRONICALLY", { size: 6.5, indent: 24, after: 6, colour: "0.47 0.47 0.47" });
        write(`Name:  ${block.byName}`, { size: 9.5, indent: 14, after: 2 });
        write(`Title:  ${block.title || "Authorised signatory"}`, { size: 9.5, indent: 14, after: 2 });
        write(`Date:  ${block.date}`, { size: 9.5, indent: 14, after: 2 });
        write(`Method:  ${block.method || "Typed electronic signature"}`, { size: 9.5, indent: 14, after: 10 });
      } else {
        write("Signature:  ________________________________", { size: 10.5, indent: 14, after: 2 });
        write("Name:  ________________________________", { size: 9.5, indent: 14, after: 2 });
        write("Date:  ________________________________", { size: 9.5, indent: 14, after: 10 });
      }
      continue;
    }
    if (block.type === "heading") {
      space(40);
      write(block.number ? `${block.number}. ${block.text}` : block.text, { size: 11.5, bold: true, after: 6 });
      continue;
    }
    // Clause: deletions are gone from an executed document, insertions are simply text.
    const runs = block.runs || (block.text != null ? [{ t: "text", text: block.text }] : []);
    const body = runs
      .filter((r) => r.t !== "del")
      .map((r) => (r.t === "token" ? (r.value != null && r.value !== "" ? r.value : `[${r.name}]`) : r.text))
      .join("");
    const label = block.ref ? `${block.ref}${block.heading ? " " + block.heading : ""}. ` : "";
    if (!label && !body.trim()) continue;
    write(label + body, { size: 10.5, after: 8 });
  }
  pages.push(ops);

  // Assemble. Object numbering: 1 catalog, 2 pages, 3/4 fonts, then page+content pairs.
  const objects = [];
  const pageIds = pages.map((_, i) => 6 + i * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objects[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>`;

  pages.forEach((pageOps, i) => {
    const id = pageIds[i];
    const decoration = [];
    if (opts.watermark) {
      const text = toWinAnsi(opts.watermark);
      const size = 62;
      const w = textWidth(text, size, true);
      // 30° diagonal through the middle of the page.
      const cos = 0.866, sin = 0.5;
      const cx = PAGE_W / 2 - (w / 2) * cos + (size / 2) * sin;
      const cy = PAGE_H / 2 - (w / 2) * sin - (size / 2) * cos;
      decoration.push(
        `q 0.87 0.83 0.81 rg BT /F2 ${size} Tf ${cos} ${sin} ${-sin} ${cos} ${cx.toFixed(2)} ${cy.toFixed(2)} Tm (${pdfString(text)}) Tj ET Q`
      );
    }
    if (opts.footer) {
      const footer = toWinAnsi(`${opts.footer}  ·  Page ${i + 1} of ${pages.length}`.replace("·", "-"));
      decoration.push(
        `q 0.45 0.45 0.45 rg BT /F1 7.5 Tf 1 0 0 1 ${MARGIN} ${(MARGIN - 22).toFixed(2)} Tm (${pdfString(footer)}) Tj ET Q`
      );
    }
    const stream = decoration.concat(pageOps).join("\n");
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /ProcSet [/PDF /Text] >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets = [];
  const maxId = 5 + pages.length * 2;
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = out.length;
  out += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

export function downloadPdf(doc, filename, opts) {
  downloadBlob(buildPdf(doc, opts), filename);
}

export function pdfBlobUrl(doc, opts) {
  return URL.createObjectURL(buildPdf(doc, opts));
}
