// Shared work-queue logic: read the latest mapping-list Excel, list channels,
// and extract "Unmapped" rooms for a chosen channel. Used by the CLI and the
// control-panel server.
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const DIR = "Mapping List";

export function findMappingFile() {
  if (!fs.existsSync(DIR)) return null;
  const files = fs.readdirSync(DIR).filter((f) => /\.xlsx?$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(DIR, files[0].f) : null;
}

// Parsing the big Room sheet takes seconds — cache it per file+mtime so repeated
// calls (status polling, listChannels, buildQueue) reuse the parsed rows.
let _cache = { file: null, mtime: 0, rows: null };
function readRooms(file) {
  const mtime = fs.statSync(file).mtimeMs;
  if (_cache.rows && _cache.file === file && _cache.mtime === mtime) return _cache.rows;
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const name = wb.SheetNames.find((n) => /room/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false });
  _cache = { file, mtime, rows };
  return rows;
}

function statusCount(rows, h) {
  return rows.reduce((n, r) => n + (/^(unmapped|mapped|black\s*list|x)$/i.test(String(r[h]).trim()) ? 1 : 0), 0);
}
export function listChannels(file) {
  const rows = readRooms(file);
  const headers = Object.keys(rows[0] || {});
  // A real channel column has many status-like values (filters out data flukes).
  const channels = headers.filter((h) => statusCount(rows, h) >= 20);
  return channels.map((c) => ({
    name: c,
    unmapped: rows.filter((r) => String(r[c]).trim().toLowerCase() === "unmapped").length,
  }));
}

const COLS = ["Hotel Code", "Hotel Name", "Country Name", "Region Name", "Room Code", "Room Name", "Room View", "Room Grade", "Room Type", "Bed Type", "Bed Quantity", "Min", "Max", "Room Size"];

export function buildQueue(file, channel) {
  const rows = readRooms(file);
  const unmapped = rows.filter((r) => String(r[channel]).trim().toLowerCase() === "unmapped");
  const queue = unmapped.map((r) => Object.fromEntries(COLS.map((c) => [c, String(r[c] ?? "")])));
  const codes = [...new Set(unmapped.map((r) => String(r["Hotel Code"]).trim()).filter(Boolean))];

  const csv = [COLS.join(",")].concat(queue.map((r) => COLS.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(","))).join("\r\n");
  fs.writeFileSync("queue.csv", "﻿" + csv);
  fs.writeFileSync("codes.txt", codes.join("\n"));

  return { channel, rooms: queue.length, hotels: codes.length, codes, queue };
}

export { COLS };
