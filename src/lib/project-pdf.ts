import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, ProjectHistory } from "@/lib/types";

type PdfFont = { bytes: Buffer; cmap: Map<number, number>; widths: number[] };
const u16 = (b: Buffer, o: number) => b.readUInt16BE(o);
const i16 = (b: Buffer, o: number) => b.readInt16BE(o);
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o);

function readPdfFont(): PdfFont {
  const bytes = readFileSync(join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"));
  const tables = new Map<string, number>();
  for (let i = 0; i < u16(bytes, 4); i += 1) { const o = 12 + i * 16; tables.set(bytes.toString("ascii", o, o + 4), u32(bytes, o + 8)); }
  const head = tables.get("head"); const hhea = tables.get("hhea"); const hmtx = tables.get("hmtx"); const maxp = tables.get("maxp"); const cmapTable = tables.get("cmap");
  if (head === undefined || hhea === undefined || hmtx === undefined || maxp === undefined || cmapTable === undefined) throw new Error("Bundled PDF font is incomplete.");
  const units = u16(bytes, head + 18); const metricCount = u16(bytes, hhea + 34); const glyphCount = u16(bytes, maxp + 4); const widths: number[] = []; let advance = 0;
  for (let i = 0; i < glyphCount; i += 1) { if (i < metricCount) advance = u16(bytes, hmtx + i * 4); widths.push(Math.round(advance / units * 1000)); }
  const cmap = new Map<number, number>(); let selected = -1;
  for (let i = 0; i < u16(bytes, cmapTable + 2); i += 1) { const o = cmapTable + 4 + i * 8; const platform = u16(bytes, o); const encoding = u16(bytes, o + 2); const table = cmapTable + u32(bytes, o + 4); if (platform === 3 && encoding === 10) { selected = table; break; } if (selected < 0 && platform === 3 && encoding === 1) selected = table; }
  if (selected < 0) throw new Error("Bundled PDF font has no Unicode cmap.");
  if (u16(bytes, selected) === 12) { for (let i = 0; i < u32(bytes, selected + 12); i += 1) { const o = selected + 16 + i * 12; const start = u32(bytes, o); const end = u32(bytes, o + 4); const gid = u32(bytes, o + 8); for (let code = start; code <= end && code <= 0x10ffff; code += 1) cmap.set(code, gid + code - start); } }
  else { const segments = u16(bytes, selected + 6) / 2; const ends = selected + 14; const starts = ends + segments * 2 + 2; const deltas = starts + segments * 2; const ranges = deltas + segments * 2; for (let s = 0; s < segments; s += 1) { const end = u16(bytes, ends + s * 2); const start = u16(bytes, starts + s * 2); const delta = i16(bytes, deltas + s * 2); const range = u16(bytes, ranges + s * 2); for (let code = start; code <= end && code !== 0xffff; code += 1) { const address = ranges + s * 2 + range + (code - start) * 2; const gid = range === 0 ? (code + delta) & 0xffff : u16(bytes, address) ? (u16(bytes, address) + delta) & 0xffff : 0; cmap.set(code, gid); } } }
  return { bytes, cmap, widths };
}
const pdfFont = readPdfFont();

function pdfText(value: string) {
  return `<${[...value].map((character) => (pdfFont.cmap.get(character.codePointAt(0) ?? 0xfffd) ?? pdfFont.cmap.get(0xfffd) ?? 0).toString(16).padStart(4, "0")).join("")}>`;
}

function wrapText(value: string, maxWidth = 46800) {
  const widthOf = (text: string) => [...text].reduce((sum, character) => sum + (pdfFont.widths[pdfFont.cmap.get(character.codePointAt(0) ?? 0xfffd) ?? 0] ?? 600), 0);
  const output: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { output.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (widthOf(word) > maxWidth) { if (line) output.push(line); let chunk = ""; for (const character of word) { if (chunk && widthOf(`${chunk}${character}`) > maxWidth) { output.push(chunk); chunk = character; } else chunk += character; } if (chunk) output.push(chunk); line = ""; }
      else if (line && widthOf(`${line} ${word}`) > maxWidth) { output.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) output.push(line);
  }
  return output;
}

function pageContent(lines: string[], pageNumber: number, pageCount: number) {
  const pageLabel = `NEXORA / PAGE ${pageNumber} OF ${pageCount}`;
  const operations = [
    "q",
    "1 0.298 0.263 rg",
    "72 754 468 1.5 re",
    "f",
    "Q",
    "BT",
    "/F1 9 Tf",
    "0.35 0.35 0.35 rg",
    "72 768 Td",
    `${pdfText("NEXORA / PROJECT EXPORT")} Tj`,
    "ET",
    "BT",
    "/F1 10 Tf",
    "0 0 0 rg",
    "72 728 Td",
  ];
  lines.forEach((line, index) => {
    if (index > 0) operations.push("0 -16 Td");
    operations.push(`${pdfText(line)} Tj`);
  });
  operations.push("ET");
  operations.push("BT", "/F1 9 Tf", "0.35 0.35 0.35 rg", "72 34 Td", `${pdfText(pageLabel)} Tj`, "ET");
  return operations.join("\n");
}

export function buildProjectPdf(project: Project, history: ProjectHistory) {
  const lines = [
    "NEXORA / PROJECT EXPORT",
    project.title,
    `Client: ${project.client}`,
    `Status: ${project.status}${project.archived ? " (archived)" : ""}`,
    `Version: ${project.version ?? 1}`,
    `Updated: ${project.updatedAt}`,
    "",
    "BRIEF",
    project.brief,
    "",
    "ANALYSIS",
    `Audience: ${project.analysis.audience}`,
    ...project.analysis.goals.map((item) => `Goal: ${item}`),
    ...project.analysis.pages.map((item) => `Page: ${item}`),
    "",
    "SCOPE",
    ...project.scope.deliverables.map((item) => `Deliverable: ${item}`),
    ...project.scope.included.map((item) => `Included: ${item}`),
    ...project.scope.excluded.map((item) => `Excluded: ${item}`),
    ...project.scope.milestones.map((item) => `Milestone: ${item.name} / ${item.timing} — ${item.detail}`),
    `Revision rounds: ${project.scope.revisions}`,
    "",
    "RESPONSE HISTORY",
    ...(history.responses.length ? history.responses.map((item) => `${item.action}: ${item.name} / ${item.createdAt} — ${item.comment}`) : ["No responses yet."]),
    "",
    "CHANGE REQUESTS",
    ...(history.changeRequests.length ? history.changeRequests.flatMap((request) => [
      `${request.status}: ${request.title} / ${request.requesterName}`,
      request.details,
      ...request.proposals.map((proposal) => `Proposal v${proposal.version}: ${proposal.title} / ${proposal.status} / ${proposal.currency} ${proposal.priceAdjustment.toFixed(2)}`),
    ]) : ["No change requests yet."]),
  ];
  const wrappedLines = lines.flatMap((line) => wrapText(line));
  const sectionHeadings = new Set(["BRIEF", "ANALYSIS", "SCOPE", "RESPONSE HISTORY", "CHANGE REQUESTS"]);
  const pageLines: string[][] = [];
  const maxBodyLines = 42;
  let currentPage: string[] = [];
  for (const line of wrappedLines) {
    if (sectionHeadings.has(line) && currentPage.length > maxBodyLines - 3) {
      pageLines.push(currentPage);
      currentPage = [];
    }
    if (currentPage.length >= maxBodyLines) {
      pageLines.push(currentPage);
      currentPage = [];
    }
    currentPage.push(line);
  }
  if (currentPage.length) pageLines.push(currentPage);
  const usedGlyphs = new Map<number, string>();
  const pageLabels = pageLines.map((_, index) => `NEXORA / PAGE ${index + 1} OF ${pageLines.length}`);
  for (const line of [...wrappedLines, "NEXORA / PROJECT EXPORT", ...pageLabels]) for (const character of line) {
    const glyph = pdfFont.cmap.get(character.codePointAt(0) ?? 0xfffd) ?? pdfFont.cmap.get(0xfffd) ?? 0;
    if (!usedGlyphs.has(glyph)) usedGlyphs.set(glyph, character);
  }
  const glyphIds = [...usedGlyphs.keys()];
  const unicodeHex = (value: string) => Buffer.from(value, "utf16le").swap16().toString("hex");
  const bfcharBlocks: string[] = [];
  for (let index = 0; index < glyphIds.length; index += 100) {
    const block = glyphIds.slice(index, index + 100);
    bfcharBlocks.push(`${block.length} beginbfchar\n${block.map((glyph) => `<${glyph.toString(16).padStart(4, "0")}> <${unicodeHex(usedGlyphs.get(glyph) ?? "?")}>`).join("\n")}\nendbfchar`);
  }
  const toUnicode = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def\n/CMapName /NexoraUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n${bfcharBlocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const fontFileId = add(`<< /Length ${pdfFont.bytes.length} /Length1 ${pdfFont.bytes.length} >>\nstream\n${pdfFont.bytes.toString("binary")}\nendstream`);
  const descriptorId = add(`<< /Type /FontDescriptor /FontName /GeistRegular /Flags 32 /FontBBox [0 -250 1200 1000] /ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 /FontFile2 ${fontFileId} 0 R >>`);
  const widthValues = glyphIds.map((glyph) => `${glyph} [${pdfFont.widths[glyph] ?? 600}]`).join(" ");
  const cidId = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GeistRegular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 600 /W [${widthValues}] /CIDToGIDMap /Identity >>`);
  const cmapId = add(`<< /Length ${Buffer.byteLength(toUnicode, "binary")} >>\nstream\n${toUnicode}\nendstream`);
  const fontId = add(`<< /Type /Font /Subtype /Type0 /BaseFont /GeistRegular /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${cmapId} 0 R >>`);
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  pageLines.forEach((linesForPage) => {
    contentIds.push(add(""));
    pageIds.push(add(""));
  });
  const pagesId = add("");
  pageLines.forEach((linesForPage, index) => {
    const content = pageContent(linesForPage, index + 1, pageLines.length);
    objects[contentIds[index] - 1] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
    objects[pageIds[index] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let output = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "binary"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(output, "binary");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return Buffer.from(output, "binary");
}
