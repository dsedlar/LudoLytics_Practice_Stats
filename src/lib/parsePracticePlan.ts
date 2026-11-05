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

/** Browser entry point: read a .docx File and parse it. Uses JSZip. */
export async function parsePlanFile(file: File): Promise<ParsedPlan> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) {
    return { squads: [], roster: [], warnings: ["Not a valid .docx file."] };
  }
  const xml = await docEntry.async("string");
  return parsePlanXml(xml);
}
