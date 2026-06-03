import fs from "node:fs";
const FILE = "settings.json";
const DEFAULTS = {
  autoThreshold: 90,
  reviewThreshold: 65,
  cooldownDays: 7, // skip re-scanning empty/mapped hotel codes for this many days
  aiRpm: 4, // AI requests per minute cap (free tier is often 5/min → keep ≤5)
  weights: { name: 25, bed: 25, type: 15, grade: 10, view: 10, area: 10, smoke: 5 },
};
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  // Merge over the CURRENT saved settings (not just DEFAULTS) so callers can
  // update one field without wiping the others.
  fs.writeFileSync(FILE, JSON.stringify({ ...loadSettings(), ...s }, null, 2));
}
