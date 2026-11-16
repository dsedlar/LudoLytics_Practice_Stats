// ---------------------------------------------------------------------------
// Practice-plan importer
// ---------------------------------------------------------------------------
// Reads a VES practice-plan .docx and extracts the two squads (name + players
// with jersey numbers), the full roster, the date and the start time, so the
// coach can set up a practice in seconds. The result always goes through a
// confirmation screen — we never trust a document parse blindly.
//
// The plan is built as one big Word table, so we work off the flat list of all
// table rows rather than trying to group nested tables.
// ---------------------------------------------------------------------------
import JSZip from "jszip";

export interface PlanPlayer {
  jersey: string;
  name: string;
}
export interface PlanSquad {
  name: string;
  players: PlanPlayer[];
}
export interface ParsedPlan {
  date?: string; // raw, e.g. "11/09/2026"
  time?: string; // raw, e.g. "7:00 PM"
  squads: PlanSquad[];
  roster: PlanPlayer[];
  warnings: string[];
}

// --- tiny XML helpers (work in both browser and Node, no DOM needed) --------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/’/g, "'");
}

/** Concatenate all <w:t> runs inside a chunk of document XML into plain text. */
function runText(xml: string): string {
  const parts = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  const text = parts.map((p) => p.replace(/<[^>]+>/g, "")).join("");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

/** Every table row in the document, as arrays of cell strings (flat). */
function allRows(xml: string): string[][] {
  const trMatches = xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  return trMatches.map((tr) => {
    const tcMatches = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    return tcMatches.map((tc) => runText(tc));
  });
}

function fullText(xml: string): string {
  const paras = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  return paras.map((p) => runText(p)).join("\n");
}

const isJersey = (s: string) => /^\d{1,2}$/.test(s.trim());
const isName = (s: string) =>
  /[A-Za-z]/.test(s) && !/^name$/i.test(s.trim()) && !/team$/i.test(s.trim());
const cleanSquadName = (s: string) => s.replace(/\s*team\s*$/i, "").trim();

/** Core parser: takes the raw word/document.xml string. */
export function parsePlanXml(documentXml: string): ParsedPlan {
  const warnings: string[] = [];
  const text = fullText(documentXml);
  const rows = allRows(documentXml);

  const dateMatch = text.match(/Date:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
  const timeMatch = text.match(/Time:\s*([0-9]{1,2}:[0-9]{2}\s*[AP]M)/i);

  // --- squads -------------------------------------------------------------
  // Primary: find the single-cell "TEAMS" marker row; the next row holds the
  // two squad names, then 4-cell rows: [jerseyA, nameA, jerseyB, nameB].
  // Fallback: a row with two cells that both end in "TEAM".
  const squads: PlanSquad[] = [];
  let headerIdx = rows.findIndex(
    (r) => r.length === 1 && /^teams$/i.test(r[0].trim()),
  );
  if (headerIdx !== -1) headerIdx += 1; // the row after the "TEAMS" marker
  if (headerIdx === -1 || !rows[headerIdx]) {
    headerIdx = rows.findIndex(
      (r) => r.length >= 2 && r.filter((c) => /team$/i.test(c.trim())).length >= 2,
    );
  }

  if (headerIdx !== -1 && rows[headerIdx]) {
    const hdr = rows[headerIdx];
    const nameA = cleanSquadName(hdr[0] || "") || "Squad A";
    const nameB = cleanSquadName(hdr[1] || "") || "Squad B";
    const a: PlanPlayer[] = [];
    const b: PlanPlayer[] = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const c = rows[r];
      // stop at the next section (e.g. single-cell "NOT PRACTICING" header)
      if (c.length < 4) break;
      const leftOk = isName(c[1]);
      const rightOk = isName(c[3]);
      if (!leftOk && !rightOk) break;
      if (leftOk) a.push({ jersey: isJersey(c[0]) ? c[0].trim() : "", name: c[1].trim() });
      if (rightOk) b.push({ jersey: isJersey(c[2]) ? c[2].trim() : "", name: c[3].trim() });
    }
    squads.push({ name: nameA, players: a }, { name: nameB, players: b });
  }

  if (squads.length < 2 || squads.every((s) => s.players.length === 0)) {
    warnings.push("Could not read the two squads from the plan — assign them manually.");
  }

  // --- full roster: the "TEAM CHART" header (# | NAME | ...), 5+ columns -----
  const roster: PlanPlayer[] = [];
  const rosterHdr = rows.findIndex(
    (r) => r.length >= 5 && r[0].trim() === "#" && /^name$/i.test((r[1] || "").trim()),
  );
  if (rosterHdr !== -1) {
    for (let r = rosterHdr + 1; r < rows.length; r++) {
      const c = rows[r];
      if (c.length < 2) break;
      const name = (c[1] || "").trim();
      if (!isName(name)) continue; // skip blank roster slots
      roster.push({ jersey: isJersey(c[0]) ? c[0].trim() : "", name });
    }
  }

  return { date: dateMatch?.[1], time: timeMatch?.[1], squads, roster, warnings };
}

/** Read a .docx File and parse it. Uses JSZip. */
export async function parsePlanDocxFile(file: File): Promise<ParsedPlan> {
  const zip = await JSZip.loadAsync(file);
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) {
    return { squads: [], roster: [], warnings: ["Not a valid .docx file."] };
  }
  const xml = await docEntry.async("string");
  return parsePlanXml(xml);
}

/**
 * Browser entry point: read a practice-plan File and parse it, picking the
 * right reader by file type. We accept the VES plan as either a Word doc
 * (.docx) or a PDF export (.pdf) — coaches print/share whichever they have.
 */
export async function parsePlanFile(file: File): Promise<ParsedPlan> {
  const isPdf =
    /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  return isPdf ? parsePlanPdfFile(file) : parsePlanDocxFile(file);
}

// ---------------------------------------------------------------------------
// PDF reader
// ---------------------------------------------------------------------------
// A PDF has no table structure — just text fragments with (x, y) positions —
// so we rebuild the layout: cluster fragments into rows by y, sort each row by
// x, then read the TEAMS and NOT PRACTICING blocks (which sit in the right-hand
// column) off those positions. Works directly against the VES plan template.

export interface PlanTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}
interface PlanRow {
  y: number;
  items: PlanTextItem[];
}

/** Cluster positioned text fragments into rows (top→bottom), each sorted L→R. */
function toRows(items: PlanTextItem[]): PlanRow[] {
  const sorted = [...items]
    .filter((i) => i.str && i.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PlanRow[] = [];
  for (const it of sorted) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (!row) {
      row = { y: it.y, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

/** Join x-sorted fragments into text, inserting a space only across real gaps. */
function joinItems(items: PlanTextItem[]): string {
  let out = "";
  let prevEnd = -Infinity;
  for (const it of items) {
    if (out && it.x - prevEnd > 2) out += " ";
    out += it.str;
    prevEnd = it.x + (it.w || 0);
  }
  return decodeEntities(out).replace(/\s+/g, " ").trim();
}

/** Read a "jersey + name" cell from a column's fragments. */
function parseCell(items: PlanTextItem[]): PlanPlayer | null {
  if (!items.length) return null;
  let jersey = "";
  let rest = items;
  if (isJersey(items[0].str)) {
    jersey = items[0].str.trim();
    rest = items.slice(1);
  }
  const name = joinItems(rest);
  if (!isName(name)) return null;
  return { jersey, name };
}

/** Core PDF parser: takes the per-page positioned fragments (page 1 is used). */
export function parsePlanFromItems(pages: PlanTextItem[][]): ParsedPlan {
  const warnings: string[] = [];
  const rows = toRows(pages[0] || []);

  // --- date / time: the "Date: … | Time: …" line is split into kerned runs,
  // so glue the whole row together before matching.
  let date: string | undefined;
  let time: string | undefined;
  for (const r of rows) {
    const concat = r.items.map((i) => i.str).join("");
    const dm = concat.match(/Date:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
    if (dm) date = dm[1];
    const tm = concat.match(/Time\s*:?\s*([0-9]{1,2}):([0-9]{2})\s*([AP]M)/i);
    if (tm) time = `${tm[1]}:${tm[2]} ${tm[3].toUpperCase()}`;
  }

  // --- squads: find the GREY TEAM / GARNET TEAM header, then read the rows
  // beneath it, splitting each at the midpoint between the two columns.
  let greyX: number | null = null;
  let garnetX: number | null = null;
  let headerY = -Infinity;
  for (const r of rows) {
    for (const it of r.items) {
      const t = it.str.trim();
      if (/^grey team$/i.test(t)) { greyX = it.x; headerY = r.y; }
      if (/^garnet team$/i.test(t)) garnetX = it.x;
    }
    if (greyX != null && garnetX != null) break;
  }

  const npRow = rows.find((r) => r.items.some((i) => /not\s*practicing/i.test(i.str)));
  const squads: PlanSquad[] = [];
  if (greyX != null && garnetX != null) {
    const teamsLeft = greyX - 45;
    const midX = (greyX + garnetX) / 2;
    const npY = npRow ? npRow.y : -Infinity;
    const grey: PlanPlayer[] = [];
    const garnet: PlanPlayer[] = [];
    for (const r of rows) {
      if (r.y >= headerY) continue; // header and everything above it
      if (r.y <= npY) continue; // NOT PRACTICING block and below
      const ti = r.items.filter((i) => i.x >= teamsLeft);
      if (!ti.length) continue;
      const pl = parseCell(ti.filter((i) => i.x < midX));
      if (pl) grey.push(pl);
      const pr = parseCell(ti.filter((i) => i.x >= midX));
      if (pr) garnet.push(pr);
    }
    squads.push({ name: "Grey", players: grey }, { name: "Garnet", players: garnet });
  }

  if (squads.length < 2 || squads.every((s) => s.players.length === 0)) {
    warnings.push("Could not read the two squads from the plan — assign them manually.");
  }

  // --- not practicing: the "# / NAME / REASON" table. Assign each fragment to
  // the nearest header column so a long reason doesn't bleed into the name.
  const roster: PlanPlayer[] = [];
  if (npRow) {
    const below = rows.filter((r) => r.y < npRow.y);
    const hdr = below.find(
      (r) =>
        r.items.some((i) => /^name$/i.test(i.str.trim())) &&
        r.items.some((i) => /^reason$/i.test(i.str.trim())),
    );
    if (hdr) {
      const nameX = hdr.items.find((i) => /^name$/i.test(i.str.trim()))!.x;
      const reasonX = hdr.items.find((i) => /^reason$/i.test(i.str.trim()))!.x;
      const hashItem = hdr.items.find((i) => i.str.trim() === "#");
      const hashX = hashItem ? hashItem.x : (greyX ?? nameX) - 20;
      const teamsLeft = hashX - 20;
      // The grade checklist ("☐ 5 – Elite…") sits just below; stop before it.
      const stop = below.find(
        (r) => r.y < hdr.y && r.items.some((i) => /practice grade|grade \(check/i.test(i.str)),
      );
      const stopY = stop ? stop.y : -Infinity;
      for (const r of below) {
        if (r.y >= hdr.y || r.y <= stopY) continue;
        const ti = r.items.filter((i) => i.x >= teamsLeft);
        if (!ti.length) continue;
        const jerseyItem = ti.find(
          (i) => isJersey(i.str) && Math.abs(i.x - hashX) < Math.abs(i.x - nameX),
        );
        if (!jerseyItem) continue;
        const nameItems = ti.filter(
          (i) => i !== jerseyItem && Math.abs(i.x - nameX) <= Math.abs(i.x - reasonX),
        );
        const name = joinItems(nameItems);
        if (!isName(name)) continue;
        roster.push({ jersey: jerseyItem.str.trim(), name });
      }
    }
  }

  return { date, time, squads, roster, warnings };
}

/** Browser entry point: read a .pdf File and parse it. Uses pdf.js (lazy). */
export async function parsePlanPdfFile(file: File): Promise<ParsedPlan> {
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves this to a hashed asset URL for the worker.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PlanTextItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PlanTextItem[] = [];
    for (const i of content.items) {
      if (!("str" in i)) continue; // skip TextMarkedContent markers
      items.push({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 });
    }
    pages.push(items);
  }
  return parsePlanFromItems(pages);
}
