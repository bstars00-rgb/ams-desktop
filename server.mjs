// AMS Desktop — local control panel. Runs ONLY on this PC (localhost).
// Start with `npm start`; it opens the dashboard in your browser.
import http from "node:http";
import fs from "node:fs";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { vaultExists, loadVault, saveVault, emptyVault } from "./lib/vault.mjs";
import { findMappingFile, listChannels, buildQueue } from "./lib/queuelib.mjs";
import { loadSettings, saveSettings } from "./lib/settings.mjs";
import { readPage, analyze, highlight, dumpPage } from "./lib/recommend.mjs";
import * as ctrip from "./lib/ctrip.mjs";
import { aiResearchRoom } from "./lib/ai.mjs";
import { audit } from "./lib/audit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5234;

const state = {
  master: null,
  vault: null, // { clients: [...] }
  operator: "",
  browser: null,
  context: null,
  page: null,
  activeClient: null,
  queue: null, // { channel, rooms, hotels }
  results: [], // recommendation history this session
  batch: null, // { running, total, done, current, results:[] }
};

// Auto-scan: for each hotel code in codes.txt, Query → open each unmapped room's
// modal → AMS recommend → collect. Never clicks the final "Mapping" (human decides).
async function runBatch(limit) {
  if (!fs.existsSync("codes.txt")) { state.batch = { running: false, error: "codes.txt 없음 — ② 작업 큐를 먼저 만드세요." }; return; }
  const codes = fs.readFileSync("codes.txt", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, limit);
  const s = loadSettings();
  // code -> hotel name (from queue.csv) for research links
  const hotelNames = {};
  try {
    if (fs.existsSync("queue.csv")) {
      const lines = fs.readFileSync("queue.csv", "utf8").replace(/^﻿/, "").split(/\r?\n/);
      const hdr = (lines[0] || "").split('","').map((x) => x.replace(/^"|"$/g, ""));
      const ci = hdr.indexOf("Hotel Code"), ni = hdr.indexOf("Hotel Name");
      for (const ln of lines.slice(1)) { const c = ln.split('","').map((x) => x.replace(/^"|"$/g, "")); if (c[ci]) hotelNames[c[ci]] = c[ni]; }
    }
  } catch { /* ignore */ }
  state.batch = { running: true, total: codes.length, done: 0, current: "", results: [], error: null };
  for (const code of codes) {
    state.batch.current = code;
    try {
      await ctrip.query(state.page, code);
      const rooms = await ctrip.unmappedRooms(state.page);
      for (let i = 0; i < rooms.length; i++) {
        try {
          await ctrip.openModal(state.page, i);
          const tables = await readPage(state.page);
          if (tables.master) {
            const { merchant, candidates } = analyze(tables, s.weights, s.autoThreshold, s.reviewThreshold);
            const best = candidates[0];
            state.batch.results.push({ code, hotelName: hotelNames[code] || "", roomCode: rooms[i].roomCode, room: rooms[i].nameEN || merchant.name, merchant, best, candidates: candidates.slice(0, 5) });
            audit({ operator: state.operator, client: state.activeClient?.name, action: "BATCH_RECOMMEND", code, room: rooms[i].nameEN, recommendedName: best?.name, score: best?.score, band: best?.band });
          }
        } catch { /* skip this room */ }
        finally { await ctrip.closeModal(state.page).catch(() => {}); }
      }
    } catch (e) { state.batch.results.push({ code, error: String(e?.message || e) }); }
    state.batch.done += 1;
  }
  state.batch.running = false;
}

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

async function ensureBrowser(client) {
  if (state.browser) return;
  fs.mkdirSync("auth", { recursive: true });
  const sessionFile = `auth/${client.name.replace(/[^a-z0-9]/gi, "_")}.json`;
  state.browser = await chromium.launch({ headless: false });
  state.context = await state.browser.newContext(fs.existsSync(sessionFile) ? { storageState: sessionFile } : {});
  state.page = await state.context.newPage();
  state.activeClient = client;
  state._sessionFile = sessionFile;
  await state.page.goto(client.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  // best-effort auto login
  try {
    const pw = state.page.locator('input[type="password"]').first();
    if (await pw.isVisible({ timeout: 4000 }).catch(() => false)) {
      await state.page.locator('input[type="email"], input[type="text"]:not([type="password"])').first().fill(client.id).catch(() => {});
      await pw.fill(client.pw).catch(() => {});
      await state.page.getByRole("button", { name: /log\s?in|sign\s?in|登录|登錄|로그인/i }).first().click({ timeout: 3000 }).catch(() => {});
      await state.page.waitForTimeout(1500);
    }
  } catch { /* manual */ }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "public/index.html")));
    }
    if (url.pathname === "/api/status") {
      const file = findMappingFile();
      return json(res, 200, {
        vaultExists: vaultExists(),
        unlocked: !!state.vault,
        operator: state.operator,
        clients: state.vault ? state.vault.clients.map((c) => ({ name: c.name, url: c.url })) : [],
        mappingFile: file ? path.basename(file) : null,
        channels: file ? listChannels(file) : [],
        queue: state.queue,
        settings: loadSettings(),
        browserOpen: !!state.browser,
        activeClient: state.activeClient?.name ?? null,
        results: state.results.slice(-50),
        batch: state.batch,
        aiConfigured: !!state.vault?.ai?.key,
        aiProvider: state.vault?.ai?.provider ?? "openai",
      });
    }
    if (req.method === "POST" && url.pathname === "/api/ai/key") {
      if (!state.vault) return json(res, 401, { error: "locked" });
      const { provider, key, model } = await body(req);
      state.vault.ai = { provider: provider || "openai", key: key || "", model: model || "" };
      saveVault(state.master, state.vault);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/ai/research") {
      if (!state.vault?.ai?.key) return json(res, 400, { error: "AI 키를 먼저 설정하세요 (④ 설정)" });
      if (!state.context) return json(res, 400, { error: "먼저 브라우저 열기" });
      const { hotel, room, ourAttrs, candidateAttrs } = await body(req);
      try {
        const r = await aiResearchRoom(state.context, state.vault.ai, { hotel, room, ourAttrs, candidateAttrs });
        audit({ operator: state.operator, client: state.activeClient?.name, action: "AI_RESEARCH", hotel, room, verdict: r.same_room, confidence: r.confidence });
        return json(res, 200, { ok: true, result: r });
      } catch (e) {
        return json(res, 502, { error: String(e?.message || e) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/batch/start") {
      if (!state.page) return json(res, 400, { error: "먼저 브라우저 열기" });
      if (state.batch?.running) return json(res, 400, { error: "이미 실행 중" });
      const { limit } = await body(req);
      runBatch(Math.max(1, Math.min(Number(limit) || 1, 50))); // background (not awaited)
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/unlock") {
      const { master, operator } = await body(req);
      try {
        const data = vaultExists() ? loadVault(master) : emptyVault();
        if (!vaultExists()) saveVault(master, data);
        state.master = master; state.vault = data; state.operator = operator || "";
        return json(res, 200, { ok: true, clients: data.clients.map((c) => ({ name: c.name, url: c.url })) });
      } catch { return json(res, 401, { ok: false, error: "wrong master password" }); }
    }
    if (req.method === "POST" && url.pathname === "/api/client") {
      if (!state.vault) return json(res, 401, { error: "locked" });
      const { name, url: u, id, pw } = await body(req);
      if (!name || !u) return json(res, 400, { error: "name and url required" });
      if (state.vault.clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) return json(res, 400, { error: "exists" });
      state.vault.clients.push({ name, url: u, id: id || "", pw: pw || "" });
      saveVault(state.master, state.vault);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/queue") {
      const { channel } = await body(req);
      const file = findMappingFile();
      if (!file) return json(res, 400, { error: "no mapping list found" });
      const r = buildQueue(file, channel);
      state.queue = { channel: r.channel, rooms: r.rooms, hotels: r.hotels };
      return json(res, 200, { ...state.queue, preview: r.queue.slice(0, 30) });
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      saveSettings(await body(req));
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/browser/open") {
      if (!state.vault) return json(res, 401, { error: "locked" });
      const { client: name } = await body(req);
      const client = state.vault.clients.find((c) => c.name === name);
      if (!client) return json(res, 400, { error: "client not found" });
      await ensureBrowser(client);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/dump") {
      if (!state.page) return json(res, 400, { error: "open the browser first" });
      fs.mkdirSync("reports", { recursive: true });
      const f = `reports/page-${Date.now()}.html`;
      await fs.promises.writeFile(f, await state.page.content());
      await state.page.screenshot({ path: f.replace(/\.html$/, ".png"), fullPage: true }).catch(() => {});
      return json(res, 200, { ok: true, file: f });
    }
    if (req.method === "POST" && url.pathname === "/api/recommend") {
      if (!state.page) return json(res, 400, { error: "open the browser first" });
      const s = loadSettings();
      await state.context.storageState({ path: state._sessionFile }).catch(() => {});
      const tables = await readPage(state.page);
      if (!tables.master) { await dumpPage(state.page); return json(res, 200, { ok: false, error: "no_table", saved: "reports/page.html" }); }
      const { merchant, candidates } = analyze(tables, s.weights, s.autoThreshold, s.reviewThreshold);
      const best = candidates[0];
      await highlight(state.page, best?.id, best?.score);
      const rec = { ts: new Date().toISOString(), client: state.activeClient?.name, operator: state.operator, merchant: merchant.name, best: best?.name, bestId: best?.id, score: best?.score, band: best?.band, candidates: candidates.slice(0, 5) };
      state.results.push(rec);
      audit({ operator: state.operator, client: state.activeClient?.name, action: "RECOMMEND", merchant: merchant.name, recommendedId: best?.id, score: best?.score, band: best?.band });
      return json(res, 200, { ok: true, rec });
    }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\nAMS Desktop control panel → ${link}`);
  exec(`start "" ${link}`); // open the dashboard in the default browser (Windows)
});
