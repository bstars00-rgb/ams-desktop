// Headless, unattended terminal scan.
//
// Reuses the saved login session (auth/<client>.json), sweeps hotel codes from
// codes.txt, scores candidates with the AMS algorithm, optionally AI-verifies the
// high-score ones in batches, and writes a results file (JSON + CSV).
//
// It does the heavy "scan + score + AI" part unattended; a human still confirms
// the final [Mapping] later in the web console. It never clicks Mapping.
//
// Usage:
//   node src/scan.mjs [--client NAME] [--from N] [--count N] [--ai]
//                     [--headful] [--operator NAME] [--out BASEPATH]
//   --from is 1-based (1 = first code in codes.txt). Defaults: from 1, count 50.
//   --ai     also runs AI batch verification on candidates >= settings.aiMinScore
//   --headful  show the browser (recommended for the FIRST run to verify session)
//
// Prereq: a valid session for the client. If the session is expired or the Ctrip
// group (1210/1311) isn't selected, refresh it once in the web console (headful),
// then run this headless.
import fs from "node:fs";
import { chromium } from "playwright";
import { vaultExists, loadVault } from "../lib/vault.mjs";
import { askSecret } from "../lib/prompt.mjs";
import * as ctrip from "../lib/ctrip.mjs";
import { readPage, analyze } from "../lib/recommend.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { loadCache, saveCache, markScanned, coolingDown } from "../lib/scancache.mjs";
import { aiVerifyBatch, setAiRpm } from "../lib/ai.mjs";
import { audit } from "../lib/audit.mjs";

const ROOMMAPPING_URL = "https://connect.trip.com/roomMapping"; // Trip.com only (per the ctrip adapter)

// ---- args ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt = (n, def) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; };
const from = Math.max(1, Number(opt("from", 1)) || 1);
const count = Math.max(1, Number(opt("count", 50)) || 50);
const offset = from - 1;
const useAI = flag("ai");
const headless = !flag("headful");
const operator = opt("operator", "headless-cli");

const tier = (s) => { s = Number(s) || 0; return s >= 99 ? "99%+" : s >= 95 ? "95%+" : s >= 90 ? "90%+" : s >= 80 ? "80%+" : s >= 65 ? "65%+" : "<65%"; };

function loadHotelNames() {
  const m = {};
  try {
    if (fs.existsSync("queue.csv")) {
      const lines = fs.readFileSync("queue.csv", "utf8").replace(/^﻿/, "").split(/\r?\n/);
      const hdr = (lines[0] || "").split(",").map((x) => x.replace(/^"|"$/g, "").trim());
      const ci = hdr.indexOf("Hotel Code"), ni = hdr.indexOf("Hotel Name");
      for (const ln of lines.slice(1)) { const c = ln.split('","').map((x) => x.replace(/^"|"$/g, "")); if (c[ci]) m[c[ci]] = c[ni]; }
    }
  } catch { /* ignore */ }
  return m;
}

// ---- preflight ----
if (!fs.existsSync("codes.txt")) { console.error("❌ codes.txt 없음 — 콘솔 ② 작업 큐를 먼저 만들거나 `npm run queue` 를 실행하세요."); process.exit(1); }
if (!vaultExists()) { console.error("❌ 금고 없음 — 먼저 콘솔에서 마스터 비밀번호를 만들고 업체를 등록하세요."); process.exit(1); }

const master = await askSecret("Master password: ");
let data;
try { data = loadVault(master); } catch { console.error("❌ 마스터 비밀번호가 틀렸습니다."); process.exit(1); }
if (!data.clients.length) { console.error("❌ 금고에 등록된 업체가 없습니다."); process.exit(1); }

const wantClient = opt("client", null);
const client = wantClient
  ? data.clients.find((c) => c.name.toLowerCase() === wantClient.toLowerCase())
  : data.clients[0];
if (!client) { console.error(`❌ 업체 '${wantClient}' 를 금고에서 찾지 못했습니다. (등록: ${data.clients.map((c) => c.name).join(", ")})`); process.exit(1); }

fs.mkdirSync("auth", { recursive: true });
const sessionFile = `auth/${client.name.replace(/[^a-z0-9]/gi, "_")}.json`;
if (!fs.existsSync(sessionFile)) {
  console.error(`❌ 저장된 세션 없음 (${sessionFile}). 먼저 콘솔(헤드풀)에서 ${client.name} 로그인·그룹선택 후 다시 실행하세요.`);
  process.exit(1);
}

console.log(`\n▶ 무인 스캔 시작 — 업체: ${client.name} · 코드 #${from}~#${from + count - 1} · AI: ${useAI ? "ON" : "OFF"} · ${headless ? "headless" : "headful"}`);

const browser = await chromium.launch({ headless });
const context = await browser.newContext({ storageState: sessionFile });
const page = await context.newPage();

// Go to Room Mapping (the CLI must navigate itself — no human). Verify we are
// logged in and the form is present.
async function onRoomMapping() {
  await page.goto(ROOMMAPPING_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  return page.locator('input[name="hotel-code"]').first().isVisible({ timeout: 8000 }).catch(() => false);
}
let ready = await onRoomMapping();
if (!ready) {
  // one best-effort auto-login, then retry
  console.log("… 세션으로 바로 못 들어감 — 자동 로그인 시도");
  await page.goto(client.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  try {
    const pw = page.locator('input[type="password"]').first();
    if (await pw.isVisible({ timeout: 4000 }).catch(() => false)) {
      await page.locator('input[type="email"], input[type="text"]:not([type="password"])').first().fill(client.id).catch(() => {});
      await pw.fill(client.pw).catch(() => {});
      await page.getByRole("button", { name: /log\s?in|sign\s?in|登录|登錄|로그인/i }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  } catch { /* ignore */ }
  ready = await onRoomMapping();
}
if (!ready) {
  console.error("\n❌ Room Mapping 화면에 접근하지 못했습니다 (세션 만료 또는 그룹 미선택).");
  console.error("   → 먼저 콘솔(헤드풀)에서 로그인 → 그룹 선택(1210/1311) → Room Mapping 을 띄워 세션을 갱신한 뒤 다시 실행하세요.");
  await context.storageState({ path: sessionFile }).catch(() => {});
  await browser.close();
  process.exit(2);
}

// ---- scan loop (mirrors server runBatch, standalone) ----
const s = loadSettings();
const cooldownMs = Math.max(0, Number(s.cooldownDays) || 0) * 86400000;
const cache = loadCache();
const hotelNames = loadHotelNames();
const allCodes = fs.readFileSync("codes.txt", "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

const results = [];
let scanned = 0, skipped = 0, totalRooms = 0;
for (let ci = offset; ci < allCodes.length && scanned < count; ci++) {
  const code = allCodes[ci];
  if (coolingDown(cache[code], cooldownMs)) { skipped++; continue; }
  scanned++;
  process.stdout.write(`[${scanned}/${count}] ${code} … `);
  let hadBest = false;
  try {
    await ctrip.query(page, code);
    const rooms = await ctrip.unmappedRooms(page);
    totalRooms += rooms.length;
    process.stdout.write(`${rooms.length} room(s)`);
    for (let i = 0; i < rooms.length; i++) {
      try {
        await ctrip.openModal(page, i);
        const tables = await readPage(page);
        if (tables.master) {
          const { merchant, candidates } = analyze(tables, s.weights, s.autoThreshold, s.reviewThreshold);
          const best = candidates[0];
          if (best) { results.push({ code, hotelName: hotelNames[code] || "", roomCode: rooms[i].roomCode, basicRoomId: rooms[i].basicRoomId, room: rooms[i].nameEN || merchant.name, merchant, best, candidates: candidates.slice(0, 5) }); hadBest = true; }
        }
      } catch (e) { process.stdout.write(` [room${i + 1} err]`); }
      finally { await ctrip.closeModal(page).catch(() => {}); }
    }
    process.stdout.write("\n");
  } catch (e) {
    const msg = String(e?.message || e);
    process.stdout.write(`ERROR: ${msg}\n`);
    if (/closed/.test(msg)) break;
  }
  markScanned(cache, code, hadBest ? "hasRooms" : "empty");
  saveCache(cache);
}

// ---- optional AI batch verification (>= aiMinScore, aiBatchSize per call) ----
if (useAI && data.ai?.key && results.length) {
  setAiRpm(s.aiRpm);
  const minScore = Number(s.aiMinScore) || 80;
  const batchSize = Math.max(1, Number(s.aiBatchSize) || 8);
  const targets = results.filter((r) => (Number(r.best.score) || 0) >= minScore);
  console.log(`\n🤖 AI 검증: ${targets.length}건 (점수≥${minScore}, 묶음 ${batchSize}, ${s.aiRpm}/분)`);
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const items = batch.map((r) => ({ hotel: r.hotelName || r.code, room: r.room, our: r.merchant, cand: r.best }));
    try { const v = await aiVerifyBatch(data.ai, items); batch.forEach((r, n) => (r.ai = v[n])); }
    catch (e) { batch.forEach((r) => (r.ai = { error: String(e?.message || e) })); }
    process.stdout.write(`   ${Math.min(i + batchSize, targets.length)}/${targets.length}\n`);
  }
} else if (useAI && !data.ai?.key) {
  console.log("\n⚠ --ai 지정됐지만 금고에 AI 키가 없습니다 — AI 검증 건너뜀.");
}

// ---- write results ----
fs.mkdirSync("reports", { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const base = opt("out", `reports/scan-${client.name.replace(/[^a-z0-9]/gi, "_")}-${stamp}`);
fs.writeFileSync(base + ".json", JSON.stringify({ client: client.name, scannedAt: new Date().toISOString(), range: { from, count }, scanned, skipped, recommendations: results.length, results }, null, 2));

const csvCols = ["code", "hotelName", "roomCode", "room", "bestId", "bestName", "score", "band", "tier", "bed", "ai_same_room", "ai_confidence"];
const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
const csvRows = results
  .slice().sort((a, b) => (Number(b.best.score) || 0) - (Number(a.best.score) || 0))
  .map((r) => [r.code, r.hotelName, r.roomCode, r.room, r.best.id, r.best.name, r.best.score, r.best.band, tier(r.best.score), r.best.bedVerified === false ? "conflict" : "ok", r.ai?.same_room || "", r.ai?.confidence || ""]);
fs.writeFileSync(base + ".csv", "﻿" + [csvCols.join(",")].concat(csvRows.map((r) => r.map(esc).join(","))).join("\r\n"));

// ---- wrap up ----
await context.storageState({ path: sessionFile }).catch(() => {}); // refresh the saved session
audit({ operator, client: client.name, action: "HEADLESS_SCAN", scanned, skipped, recommendations: results.length });

const buckets = { "99%+": 0, "95%+": 0, "90%+": 0, "80%+": 0, "65%+": 0, "<65%": 0 };
results.forEach((r) => buckets[tier(r.best.score)]++);
console.log(`\n✅ 완료 — 스캔 ${scanned} · 건너뜀(쿨다운) ${skipped} · 추천 ${results.length}`);
console.log(`   구간: ${Object.entries(buckets).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ") || "(없음)"}`);
if (scanned > 0 && totalRooms === 0) console.log("   ⚠ 모든 코드가 0룸 — 세션/그룹(1210·1311) 상태를 콘솔에서 확인하세요.");
console.log(`   저장: ${base}.json  /  ${base}.csv`);
console.log("   → 콘솔에서 결과를 검토하고 최종 [Mapping] 확정은 사람이 하세요.");

await browser.close();
