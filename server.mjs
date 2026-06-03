// AMS Desktop — local control panel. Runs ONLY on this PC (localhost).
// Start with `npm start`; it opens the dashboard in your browser.
import http from "node:http";
import fs from "node:fs";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { vaultExists, loadVault, saveVault, emptyVault, deleteVault } from "./lib/vault.mjs";
import { findMappingFile, listChannels, buildQueue } from "./lib/queuelib.mjs";
import { loadSettings, saveSettings } from "./lib/settings.mjs";
import { loadCache, saveCache, clearCache, markScanned, coolingDown } from "./lib/scancache.mjs";
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
async function runBatch(limit, offset = 0) {
  if (!fs.existsSync("codes.txt")) { state.batch = { running: false, error: "codes.txt 없음 — ② 작업 큐를 먼저 만드세요." }; return; }
  const allCodes = fs.readFileSync("codes.txt", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const s = loadSettings();
  const cooldownMs = Math.max(0, Number(s.cooldownDays) || 0) * 86400000;
  const cache = loadCache();
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
  state.batch = { running: true, total: limit, done: 0, skipped: 0, current: "", results: [], error: null };
  // Persist the (now logged-in) session so future runs skip the manual login.
  await state.context.storageState({ path: state._sessionFile }).catch(() => {});
  console.log(`[batch] start — up to ${limit} fresh hotel(s) from #${offset + 1} (cooldown ${s.cooldownDays}d)`);
  let scanned = 0;
  for (let ci = offset; ci < allCodes.length && scanned < limit; ci++) {
    const code = allCodes[ci];
    // Skip codes recently scanned with no actionable result (or already mapped).
    if (coolingDown(cache[code], cooldownMs)) { state.batch.skipped += 1; continue; }
    if (!state.page || state.page.isClosed()) {
      state.batch.results.push({ code, error: "에이전트 브라우저가 닫혔습니다 — ③ 브라우저 열기 → 로그인 → 그룹선택 → Room Mapping 화면을 띄운 뒤 다시 스캔하세요. (스캔 중에는 그 창을 닫지 마세요)" });
      break;
    }
    scanned += 1;
    state.batch.current = `${code} (조회 중…)`;
    let hadBest = false, hardError = false;
    try {
      console.log(`[batch] hotel ${code}: query`);
      await ctrip.query(state.page, code);
      const rooms = await ctrip.unmappedRooms(state.page);
      console.log(`[batch] hotel ${code}: ${rooms.length} unmapped room(s)`);
      if (!rooms.length) state.batch.results.push({ code, note: "미매핑 룸 없음" });
      for (let i = 0; i < rooms.length; i++) {
        state.batch.current = `${code} · 룸 ${i + 1}/${rooms.length}`;
        try {
          await ctrip.openModal(state.page, i);
          const tables = await readPage(state.page);
          console.log(`[batch]   room ${i + 1}/${rooms.length} "${rooms[i].nameEN}" master=${!!tables.master}`);
          if (tables.master) {
            const { merchant, candidates, cols } = analyze(tables, s.weights, s.autoThreshold, s.reviewThreshold);
            const best = candidates[0];
            if (best) {
              state.batch.results.push({ code, hotelName: hotelNames[code] || "", roomCode: rooms[i].roomCode, basicRoomId: rooms[i].basicRoomId, roomIndex: i, room: rooms[i].nameEN || merchant.name, merchant, best, candidates: candidates.slice(0, 5), cols });
              hadBest = true;
              audit({ operator: state.operator, client: state.activeClient?.name, action: "BATCH_RECOMMEND", code, room: rooms[i].nameEN, recommendedName: best?.name, score: best?.score, band: best?.band });
            } else {
              state.batch.results.push({ code, room: rooms[i].nameEN, note: "시트립 추천 후보 없음" });
            }
          } else {
            state.batch.results.push({ code, room: rooms[i].nameEN, note: "추천 표를 못 읽음" });
          }
        } catch (e) { console.log(`[batch]   room ${i + 1} ERROR: ${e?.message || e}`); }
        finally { await ctrip.closeModal(state.page).catch(() => {}); }
      }
    } catch (e) {
      const msg = String(e?.message || e);
      hardError = true;
      console.log(`[batch] hotel ${code} ERROR: ${msg}`);
      if (/closed/.test(msg)) { state.batch.results.push({ code, error: "스캔 도중 에이전트 브라우저 창이 닫혔습니다 — 그 창을 닫지 말고 다시 스캔하세요." }); break; }
      state.batch.results.push({ code, error: msg });
    }
    // Cache the outcome: actionable -> "hasRooms" (never cools); nothing to do ->
    // "empty" (cools down). Don't cache hard errors, so they retry next run.
    if (!hardError) { markScanned(cache, code, hadBest ? "hasRooms" : "empty"); saveCache(cache); }
    state.batch.done += 1;
  }
  state.batch.running = false;
  console.log(`[batch] done — ${state.batch.results.filter((r) => r.best).length} recommendation(s), ${state.batch.skipped} skipped by cooldown`);
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

// A separate, hidden (headless) browser just for AI research — so it never
// pops tabs in the user's working Room Mapping window.
async function researchContext() {
  if (state.researchCtx) return state.researchCtx;
  state.researchBrowser = await chromium.launch({ headless: true });
  state.researchCtx = await state.researchBrowser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  return state.researchCtx;
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
        clients: state.vault ? state.vault.clients.map((c) => ({ name: c.name, url: c.url, id: c.id || "" })) : [], // id shown for editing; pw never sent
        mappingFile: file ? path.basename(file) : null,
        channels: file ? listChannels(file) : [],
        queue: state.queue,
        settings: loadSettings(),
        cacheCount: Object.keys(loadCache()).length,
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
        const r = await aiResearchRoom(await researchContext(), state.vault.ai, { hotel, room, ourAttrs, candidateAttrs });
        audit({ operator: state.operator, client: state.activeClient?.name, action: "AI_RESEARCH", hotel, room, verdict: r.same_room, confidence: r.confidence });
        return json(res, 200, { ok: true, result: r });
      } catch (e) {
        return json(res, 502, { error: String(e?.message || e) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/map/prepare") {
      if (!state.page) return json(res, 400, { error: "먼저 ③ 브라우저 열기" });
      if (state.batch?.running) return json(res, 400, { error: "자동 스캔 중에는 매핑 준비를 할 수 없습니다 — 스캔이 끝난 뒤 시도하세요." });
      const { code, basicRoomId, roomIndex, masterId, masterName } = await body(req);
      if (!code || masterId == null) return json(res, 400, { error: "code/masterId 필요" });
      try {
        const r = await ctrip.prepareMapping(state.page, { code, basicRoomId, roomIndex, masterId });
        // Cool this hotel down — we assume the human will complete the [Mapping].
        const c = loadCache(); markScanned(c, code, "mapped"); saveCache(c);
        audit({ operator: state.operator, client: state.activeClient?.name, action: "MAP_PREPARE", code, basicRoomId, masterId, masterName });
        return json(res, 200, { ok: true, ...r });
      } catch (e) {
        return json(res, 502, { error: String(e?.message || e) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/cache/clear") {
      clearCache();
      audit({ operator: state.operator, action: "CACHE_CLEAR" });
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/batch/start") {
      if (!state.page) return json(res, 400, { error: "먼저 브라우저 열기" });
      if (state.batch?.running) return json(res, 400, { error: "이미 실행 중" });
      const { limit, offset } = await body(req);
      runBatch(Math.max(1, Math.min(Number(limit) || 1, 50)), Math.max(0, Number(offset) || 0)); // background (not awaited)
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/unlock") {
      const { master, operator } = await body(req);
      if (!master || String(master).length < 4) return json(res, 400, { ok: false, error: "마스터 비밀번호는 4자 이상이어야 합니다." });
      const existed = vaultExists();
      try {
        const data = existed ? loadVault(master) : emptyVault();
        if (!existed) saveVault(master, data);
        state.master = master; state.vault = data; state.operator = operator || "";
        audit({ operator: state.operator, action: existed ? "UNLOCK" : "VAULT_CREATE" });
        return json(res, 200, { ok: true, created: !existed, clients: data.clients.map((c) => ({ name: c.name, url: c.url })) });
      } catch { return json(res, 401, { ok: false, error: "마스터 비밀번호가 틀렸습니다." }); }
    }
    if (req.method === "POST" && url.pathname === "/api/master/change") {
      if (!state.vault) return json(res, 401, { error: "먼저 잠금 해제하세요." });
      const { oldMaster, newMaster } = await body(req);
      if (oldMaster !== state.master) return json(res, 401, { error: "현재 비밀번호가 틀렸습니다." });
      if (!newMaster || String(newMaster).length < 4) return json(res, 400, { error: "새 비밀번호는 4자 이상이어야 합니다." });
      saveVault(newMaster, state.vault); state.master = newMaster;
      audit({ operator: state.operator, action: "MASTER_CHANGE" });
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/vault/reset") {
      // Forgot-password path: only allowed while locked. Deletes the vault.
      if (state.vault) return json(res, 400, { error: "이미 잠금 해제됨 — 비밀번호 변경은 ④ 설정에서 하세요." });
      deleteVault();
      audit({ action: "VAULT_RESET" });
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/lock") {
      audit({ operator: state.operator, action: "LOCK" });
      state.vault = null; state.master = null; state.operator = "";
      return json(res, 200, { ok: true });
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
    if (req.method === "POST" && url.pathname === "/api/client/update") {
      if (!state.vault) return json(res, 401, { error: "locked" });
      const { master, origName, name, url: u, id, pw } = await body(req);
      if (master !== state.master) return json(res, 401, { error: "콘솔 비밀번호가 틀렸습니다." });
      const c = state.vault.clients.find((x) => x.name === origName);
      if (!c) return json(res, 404, { error: "고객을 찾을 수 없습니다." });
      if (name && name !== origName && state.vault.clients.some((x) => x.name.toLowerCase() === name.toLowerCase())) return json(res, 400, { error: "같은 이름이 이미 있습니다." });
      if (name) c.name = name;
      if (u !== undefined) c.url = u;
      if (id !== undefined) c.id = id;
      if (pw) c.pw = pw; // change password only when a new one is provided
      saveVault(state.master, state.vault);
      if (state.activeClient?.name === origName) state.activeClient.name = c.name;
      audit({ operator: state.operator, action: "CLIENT_UPDATE", client: c.name });
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/client/delete") {
      if (!state.vault) return json(res, 401, { error: "locked" });
      const { master, name } = await body(req);
      if (master !== state.master) return json(res, 401, { error: "콘솔 비밀번호가 틀렸습니다." });
      const before = state.vault.clients.length;
      state.vault.clients = state.vault.clients.filter((x) => x.name !== name);
      if (state.vault.clients.length === before) return json(res, 404, { error: "고객을 찾을 수 없습니다." });
      saveVault(state.master, state.vault);
      audit({ operator: state.operator, action: "CLIENT_DELETE", client: name });
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

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n⚠ 포트 ${PORT}가 이미 사용 중입니다 — 다른 창에서 서버가 이미 켜져 있어요.`);
    console.error(`   해결: 모든 cmd 창을 닫고 START.bat을 한 번만 실행하거나,`);
    console.error(`        브라우저에서 http://localhost:${PORT} 로 그냥 사용하세요.\n`);
    process.exit(1);
  }
  console.error(e);
});

server.listen(PORT, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\nAMS Desktop control panel → ${link}`);
  exec(`start "" ${link}`); // open the dashboard in the default browser (Windows)
});
