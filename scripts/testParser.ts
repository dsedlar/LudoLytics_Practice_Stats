// Quick validation of the practice-plan parser against a real .docx.
// Run: npm run test:parser -- <path-to-plan.docx>
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parsePlanXml } from "../src/lib/parsePracticePlan";

const path =
  process.argv[2] ||
  "/root/.claude/uploads/040f9c3e-314f-5e16-becf-e0a88da97b9c/9e04c57c-1_111126_Practice_Plan.docx";

const buf = readFileSync(path);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");
const plan = parsePlanXml(xml);

console.log("Date:", plan.date, "| Time:", plan.time);
console.log("Warnings:", plan.warnings);
for (const s of plan.squads) {
  console.log(`\n${s.name} (${s.players.length}):`);
  for (const p of s.players) console.log(`  #${p.jersey}  ${p.name}`);
}
console.log(`\nFull roster (${plan.roster.length}):`);
for (const p of plan.roster) console.log(`  #${p.jersey}  ${p.name}`);
