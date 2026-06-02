import fs from "node:fs";
const FILE = "settings.json";
const DEFAULTS = {
  autoThreshold: 90,
  reviewThreshold: 65,
  weights: { name: 25, bed: 25, type: 15, grade: 10, view: 10, area: 10, smoke: 5 },
};
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  fs.writeFileSync(FILE, JSON.stringify({ ...DEFAULTS, ...s }, null, 2));
}
