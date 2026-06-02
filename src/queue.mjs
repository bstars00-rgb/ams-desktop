// CLI wrapper for the work-queue builder.
import { ask } from "../lib/prompt.mjs";
import { findMappingFile, listChannels, buildQueue } from "../lib/queuelib.mjs";

const file = findMappingFile();
if (!file) { console.error('❌ Put the mapping-list Excel in a "Mapping List" folder.'); process.exit(1); }
console.log(`Using: ${file}`);

const channels = listChannels(file);
console.log("\nChannels:");
channels.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}  (${c.unmapped} unmapped rooms)`));

const pick = (await ask("\nWhich channel? (number or name) ")).trim();
const n = Number(pick);
const ch = Number.isInteger(n) && n >= 1 && n <= channels.length ? channels[n - 1].name : channels.find((c) => c.name.toLowerCase() === pick.toLowerCase())?.name;
if (!ch) { console.error("Invalid channel."); process.exit(1); }

const r = buildQueue(file, ch);
console.log(`\n✅ "${ch}": ${r.rooms} unmapped rooms across ${r.hotels} hotels`);
console.log(`   → queue.csv  +  codes.txt (${r.hotels} hotel codes)`);
