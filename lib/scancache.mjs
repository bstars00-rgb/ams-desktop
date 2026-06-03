// Remembers which hotel codes were recently scanned so we don't waste time
// re-querying ones that had nothing to map (or were already mapped). Codes that
// still have unmapped rooms ("hasRooms") are never cooled down — they reappear
// until they're actually mapped. Stored locally (git-ignored).
import fs from "node:fs";
const FILE = "scan-cache.json";

export function loadCache() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
export function saveCache(c) {
  try { fs.writeFileSync(FILE, JSON.stringify(c)); } catch { /* ignore */ }
}
export function clearCache() {
  try { fs.unlinkSync(FILE); } catch { /* ignore */ }
}
export function markScanned(c, code, status) {
  c[String(code)] = { ts: Date.now(), status }; // status: "empty" | "mapped" | "hasRooms"
}
// Only "empty" and "mapped" cool down. "hasRooms" (still actionable) never does.
export function coolingDown(entry, cooldownMs, now = Date.now()) {
  if (!entry) return false;
  if (entry.status !== "empty" && entry.status !== "mapped") return false;
  return now - (entry.ts || 0) < cooldownMs;
}
