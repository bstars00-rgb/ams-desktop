/* Generates the AMS Desktop developer handover spec (English) as a .docx */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  ExternalHyperlink,
} = require("docx");

const CONTENT_W = 9360; // US Letter, 1" margins
const MONO = "Consolas";

// ---------- helpers ----------
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
function P(parts, opts = {}) {
  const runs = (Array.isArray(parts) ? parts : [parts]).map((x) =>
    typeof x === "string" ? new TextRun(x) : x);
  return new Paragraph({ spacing: { after: 120, line: 276 }, ...opts, children: runs });
}
const B = (t) => new TextRun({ text: t, bold: true });
const I = (t) => new TextRun({ text: t, italics: true });
const C = (t) => new TextRun({ text: t, font: MONO, size: 19 });
function bullets(items) {
  return items.map((it) => new Paragraph({
    numbering: { reference: "bul", level: 0 }, spacing: { after: 60, line: 276 },
    children: (Array.isArray(it) ? it : [it]).map((x) => (typeof x === "string" ? new TextRun(x) : x)),
  }));
}
function numbered(items, ref = "num") {
  return items.map((it) => new Paragraph({
    numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 276 },
    children: (Array.isArray(it) ? it : [it]).map((x) => (typeof x === "string" ? new TextRun(x) : x)),
  }));
}
function codeBlock(lines) {
  return lines.map((ln, i) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
    spacing: { after: i === lines.length - 1 ? 140 : 0, line: 264 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: "2F55D4", space: 6 },
    },
    indent: { left: 120 },
    children: [new TextRun({ text: ln || " ", font: MONO, size: 18 })],
  }));
}
const cell = (children, { w, head = false, fill } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: { type: ShadingType.CLEAR, fill: fill || (head ? "2F55D4" : "FFFFFF") },
  margins: { top: 60, bottom: 60, left: 110, right: 110 },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
  },
  children: (Array.isArray(children) ? children : [children]).map((x) =>
    typeof x === "string"
      ? new Paragraph({ spacing: { after: 0, line: 252 }, children: [new TextRun({ text: x, bold: head, color: head ? "FFFFFF" : "111827", size: 19 })] })
      : x),
});
function table(headers, rows, widths) {
  const w = widths || headers.map(() => Math.floor(CONTENT_W / headers.length));
  const headRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { w: w[i], head: true })) });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => {
      const isMono = typeof c === "object" && c.mono;
      const txt = typeof c === "object" ? c.t : c;
      const para = new Paragraph({ spacing: { after: 0, line: 252 }, children: [new TextRun({ text: String(txt), font: isMono ? MONO : undefined, size: isMono ? 18 : 19, color: "111827" })] });
      return cell([para], { w: w[i], fill: ri % 2 ? "F7F9FC" : "FFFFFF" });
    }),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, rows: [headRow, ...bodyRows] });
}
const link = (text, url) => new ExternalHyperlink({ children: [new TextRun({ text, style: "Hyperlink" })], link: url });
const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [new TextRun("")] });

// ---------- document body ----------
const body = [];
const push = (...x) => x.forEach((e) => (Array.isArray(e) ? body.push(...e) : body.push(e)));

// Cover
push(new Paragraph({ spacing: { before: 2400, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AMS Desktop", bold: true, size: 64, color: "2F55D4" })] }));
push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Room-Mapping Automation Platform", size: 30, color: "334155" })] }));
push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Developer Handover & Technical Specification", size: 26, bold: true })] }));
push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "OH MY HOTEL — Content / Mapping Team", size: 22, color: "64748B" })] }));
push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Version 1.0", size: 22 })] }));
push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Repository: github.com/bstars00-rgb/AMS (private)", size: 20, color: "64748B" })] }));
push(new Paragraph({ children: [new PageBreak()] }));

// TOC
push(H1("Table of Contents"));
push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }));
push(new Paragraph({ children: [new PageBreak()] }));

// 1. Introduction
push(H1("1. Introduction & Purpose"));
push(P([B("AMS (AI Mapping System)"), new TextRun(" is a local desktop tool that helps the content team map the same hotel room type across OTA channels (starting with Trip.com / Ctrip). Suppliers send us room lists whose names and attributes differ from the channel's master catalogue; mapping them by hand is slow and a wrong mapping causes wrong-room bookings.")]));
push(P("AMS automates the repetitive part — log in, enter the hotel code, read the unmapped rooms, score every channel candidate with the AMS algorithm, and surface the best match — while keeping a human in control of the final confirmation."));
push(P([B("Design principles:")]));
push(bullets([
  [B("Local, no backend. "), new TextRun("Everything runs on the operator's laptop. There is no server, database, or login service. Credentials and logs never leave the machine.")],
  [B("Human-in-the-loop. "), new TextRun("The algorithm recommends; the operator confirms. The final [Mapping] click can be manual or (opt-in) automated.")],
  [B("Per-operator setup. "), new TextRun("Each team member installs it on their own laptop and protects it with their own master password.")],
  [B("Bilingual & themeable. "), new TextRun("Korean / English and light / dark, switchable at runtime.")],
]));

// 2. Functional overview
push(H1("2. What AMS Does (Functional Overview)"));
push(P("The operator works through a single-page console. The end-to-end flow is:"));
push(numbered([
  [B("Vault unlock. "), new TextRun("Operator enters a master password that decrypts the local credential vault.")],
  [B("Work queue. "), new TextRun("AMS reads the latest mapping-list Excel, lets the operator pick a channel (e.g. Ctrip KR), and extracts the list of unmapped hotel codes + rooms into "), C("queue.csv"), new TextRun(" / "), C("codes.txt"), new TextRun(".")],
  [B("Open browser. "), new TextRun("AMS launches a Playwright-controlled Chromium; the operator logs into Trip.com Connect, selects the group, and opens the Room Mapping screen.")],
  [B("Auto scan. "), new TextRun("For each hotel code, AMS enters it, reads the unmapped rooms, opens each room's recommendation modal, scores the candidates, and collects results into a dashboard.")],
  [B("AI verification (optional). "), new TextRun("In parallel, AI double-checks high-score rooms (batched, rate-limited) and flags conflicts.")],
  [B("Review & map. "), new TextRun("Results are sorted by score and grouped into tiers. The operator filters (e.g. 99%+), reviews the full-column comparison, and clicks Prepare Mapping — which selects the candidate in Trip.com. The final [Mapping] confirm is manual by default, or automatic if the operator opts in.")],
]));

// 3. Architecture
push(H1("3. Architecture Overview"));
push(P("AMS is a small Node.js program that serves a single HTML page to the operator's browser and drives a second, automated browser via Playwright. There are three moving parts:"));
push(table(
  ["Component", "Runs as", "Responsibility"],
  [
    ["Control server", { t: "server.mjs (Node http)", mono: true }, "Serves the console UI, exposes a local JSON API, holds in-memory session state, orchestrates scans."],
    ["Console UI", { t: "public/index.html", mono: true }, "Single-page app (vanilla JS). Talks to the local API at localhost:5234. i18n + theming."],
    ["Automation browser", "Playwright Chromium", "A real, visible browser the operator logs into; AMS reads/clicks the Trip.com pages through it."],
  ],
  [1900, 3000, 4460]
));
push(spacer());
push(P([B("Two browsers, on purpose: "), new TextRun("the console runs in the operator's normal browser; the automation runs in a separate Chromium so AMS can read the Trip.com DOM and bypass cross-origin limits. A third, hidden (headless) Chromium is used only for AI web research so it never disrupts the operator's mapping window.")]));
push(P([B("Data flow: "), C("Excel"), new TextRun(" → "), C("queuelib"), new TextRun(" → "), C("codes.txt"), new TextRun(" → "), C("ctrip"), new TextRun(" (Playwright) → "), C("recommend.analyze"), new TextRun(" + "), C("score"), new TextRun(" → "), C("state.batch.results"), new TextRun(" → polled by the UI → operator action → "), C("ctrip.prepareMapping"), new TextRun(".")]));

// 4. Tech stack
push(H1("4. Technology Stack"));
push(table(
  ["Area", "Choice", "Notes"],
  [
    ["Runtime", "Node.js 18+ (ES modules)", "package.json type:module; files are .mjs."],
    ["HTTP server", "Node built-in http", "No Express. ~25 JSON endpoints. Port 5234."],
    ["Browser automation", "Playwright (chromium)", "Drives Trip.com's Element-UI / Vue SPA."],
    ["Excel parsing", "xlsx (SheetJS)", "Reads the mapping-list workbook."],
    ["Crypto", "Node crypto (AES-256-GCM + scrypt)", "Encrypted credential vault."],
    ["Front end", "Vanilla HTML/CSS/JS", "One file, no build step. CSS variables for theming, data-i18n for translation."],
    ["AI", "Anthropic Claude or OpenAI REST", "Optional; keyed per operator, stored in the vault."],
  ],
  [1700, 3100, 4560]
));

// 5. Repo structure
push(H1("5. Repository Structure"));
push(table(
  ["Path", "Purpose"],
  [
    [{ t: "server.mjs", mono: true }, "Control server: API endpoints, session state, scan orchestration (runBatch)."],
    [{ t: "public/index.html", mono: true }, "The entire console UI + client-side logic (HTML, CSS, JS, i18n)."],
    [{ t: "lib/vault.mjs", mono: true }, "Encrypted credential vault (save/load/delete)."],
    [{ t: "lib/settings.mjs", mono: true }, "Load/save settings.json with defaults."],
    [{ t: "lib/queuelib.mjs", mono: true }, "Read Excel, list channels, build the unmapped work queue (cached)."],
    [{ t: "lib/ctrip.mjs", mono: true }, "Trip.com adapter: query, read rooms, open modal, prepare/confirm mapping."],
    [{ t: "lib/recommend.mjs", mono: true }, "Read the mapping modal tables and run analyze() over candidates."],
    [{ t: "lib/score.mjs", mono: true }, "The AMS scoring algorithm (features, weights, bands, bed gate)."],
    [{ t: "lib/ai.mjs", mono: true }, "AI client: callAI, batch verify, web research, rate-limit + retry."],
    [{ t: "lib/usage.mjs", mono: true }, "Track AI tokens spent and estimate cost."],
    [{ t: "lib/scancache.mjs", mono: true }, "Cooldown cache so empty/mapped codes are skipped for N days."],
    [{ t: "lib/audit.mjs", mono: true }, "Append-only audit log of operator actions."],
    [{ t: "START.bat / SETUP.bat", mono: true }, "Windows launchers (run / one-time install)."],
    [{ t: "Mapping List/*.xlsx", mono: true }, "Input: the latest mapping-list workbook (git-ignored)."],
  ],
  [2600, 6760]
));
push(spacer());
push(P([B("Git-ignored, machine-local files "), new TextRun("(created at runtime, never committed): "), C("vault.enc"), new TextRun(", "), C("settings.json"), new TextRun(", "), C("scan-cache.json"), new TextRun(", "), C("ai-usage.json"), new TextRun(", "), C("audit.log"), new TextRun(", "), C("queue.csv"), new TextRun(", "), C("codes.txt"), new TextRun(", "), C("auth/"), new TextRun(", "), C("reports/"), new TextRun(", "), C("Mapping List/"), new TextRun(".")]));

// 6. Getting started
push(H1("6. Getting Started (Developers)"));
push(H2("6.1 Prerequisites"));
push(bullets([
  [B("Node.js 18 or newer "), link("(nodejs.org)", "https://nodejs.org"), new TextRun(".")],
  "Windows (the launchers are .bat; the code itself is cross-platform).",
  "The latest mapping-list Excel placed in the Mapping List/ folder.",
]));
push(H2("6.2 Install & run"));
push(codeBlock([
  "git clone https://github.com/bstars00-rgb/AMS.git",
  "cd AMS            # (or the ams-desktop folder)",
  "npm install",
  "npx playwright install chromium",
  "npm start         # or double-click START.bat",
  "# → opens http://localhost:5234 in your browser",
]));
push(P([new TextRun("On Windows the team can just double-click "), C("SETUP.bat"), new TextRun(" once (installs dependencies + the browser), then "), C("START.bat"), new TextRun(" each time. "), C("START.bat"), new TextRun(" auto-opens the console.")]));
push(H2("6.3 First run"));
push(P("The lock screen detects there is no vault yet and switches to “Create master password”. After creating it, add a vendor (Trip.com login URL + id + pw) in the left sidebar, build the work queue, open the browser, and scan."));

// 7. Runtime flow
push(H1("7. Runtime Flow (Detailed)"));
push(P([B("runBatch(limit, offset, autoAI) "), new TextRun("in "), C("server.mjs"), new TextRun(" is the heart of the scan. Per hotel code it:")]));
push(numbered([
  [new TextRun("Skips the code if it is in cooldown ("), C("scancache.coolingDown"), new TextRun(").")],
  [C("ctrip.query(page, code)"), new TextRun(" — type the code, click Query, wait for rows.")],
  [C("ctrip.unmappedRooms(page)"), new TextRun(" — read the Pre-Mapping table.")],
  [new TextRun("For each room: "), C("ctrip.openModal"), new TextRun(" → "), C("recommend.readPage"), new TextRun(" → "), C("recommend.analyze"), new TextRun(" → push a result with the best candidate + all candidates + full columns.")],
  [new TextRun("If AI is on and score ≥ aiMinScore, buffer the room; flush in batches via "), C("ai.aiVerifyBatch"), new TextRun(".")],
  [new TextRun("Mark the code in the cooldown cache (hasRooms / empty).")],
]));
push(P([new TextRun("The UI polls "), C("/api/status"), new TextRun(" every 2s while a scan (or AI verification) is running and re-renders the results table.")]));

// 8. Algorithm
push(H1("8. The AMS Matching Algorithm"));
push(P([new TextRun("Implemented in "), C("lib/score.mjs"), new TextRun(". Each channel candidate is scored 0–100 as a weighted average of seven feature sub-scores comparing the merchant (our) room to the candidate.")]));
push(H2("8.1 Feature sub-scores & default weights"));
push(table(
  ["Feature", "Weight", "How it is compared"],
  [
    ["name", "25", "Token-sorted Levenshtein similarity of room names."],
    ["bed", "25", "Normalized bed types (EN + CN tokens). Drives the bed gate."],
    ["type", "15", "Room type category (single/double/twin/suite…) parsed from the name."],
    ["grade", "10", "Room grade (standard/deluxe/premier/suite…)."],
    ["view", "10", "View/window (sea/garden/city/none…)."],
    ["area", "10", "Room size (㎡) closeness."],
    ["smoke", "5", "Smoking vs non-smoking."],
  ],
  [1900, 1100, 6360]
));
push(spacer());
push(P([B("score "), new TextRun("= round( Σ (weightᵢ × subscoreᵢ) / Σ weightᵢ ). Weights are configurable in Settings and recalculated on the next scan.")]));
push(H2("8.2 Bed gate (safety rule)"));
push(P([new TextRun("Bed type is the highest-risk attribute. "), C("scoreCandidate"), new TextRun(" returns "), C("bedVerified"), new TextRun(" / "), C("bedConflict"), new TextRun(". A candidate with a bed conflict can never be “Auto” and is forced to Review regardless of its numeric score. This reflects the CEO feedback that “score ≠ probability” and that a bed mismatch must block auto-confirmation.")]));
push(H2("8.3 Bands & tiers"));
push(P([new TextRun("Two thresholds (defaults: auto 90, review 65) classify a candidate into "), C("AUTO / REVIEW / NO-MATCH"), new TextRun(" via "), C("band()"), new TextRun(". The UI additionally buckets the score into finer tiers for operator decisions:")]));
push(table(
  ["Tier", "Processing policy (default)"],
  [
    ["99%+", "Start mapping immediately (bed OK)."],
    ["95%+", "Start after AI verification passes; if AI says mismatch → review."],
    ["90%+", "Human review (open the comparison)."],
    ["80–89%", "Hold (caution) — candidate is weak."],
    ["65–79%", "Hold."],
    ["<65%", "Manual mapping."],
    ["Bed conflict", "Force review regardless of score."],
  ],
  [1700, 7660]
));

// 9. Modules
push(H1("9. Backend Modules Reference"));
push(table(
  ["Module / export", "Purpose"],
  [
    [{ t: "vault: saveVault/loadVault/deleteVault", mono: true }, "AES-256-GCM + scrypt encrypted store of vendor logins + AI config."],
    [{ t: "settings: loadSettings/saveSettings", mono: true }, "settings.json with defaults; save merges over current."],
    [{ t: "queuelib: findMappingFile/listChannels/buildQueue", mono: true }, "Finds newest Excel, lists channel columns, extracts unmapped rooms (parsed workbook cached by mtime)."],
    [{ t: "score: scoreCandidate/band/normalizeBeds/…", mono: true }, "The matching algorithm and attribute parsers."],
    [{ t: "recommend: readPage/analyze/highlight/dumpPage", mono: true }, "Reads the Element-UI modal tables and produces merchant + ranked candidates with full columns."],
    [{ t: "ctrip: query/unmappedRooms/openModal/prepareMapping/confirmMapping", mono: true }, "The Trip.com automation adapter (the per-OTA layer)."],
    [{ t: "ai: callAI/aiVerifyBatch/aiResearchRoom/setAiRpm", mono: true }, "AI client with rate-limit, retry, batch verify, and web research."],
    [{ t: "usage: recordUsage/loadUsage/resetUsage", mono: true }, "Token + estimated-cost tracker."],
    [{ t: "scancache: loadCache/markScanned/coolingDown/clearCache", mono: true }, "Per-code cooldown so empty/mapped codes are skipped."],
    [{ t: "audit: audit(entry)", mono: true }, "Append-only JSONL action log (audit.log)."],
  ],
  [4300, 5060]
));

// 10. API
push(H1("10. HTTP API Reference"));
push(P([new TextRun("All endpoints are JSON over "), C("http://localhost:5234"), new TextRun(". Unless noted, they require the vault to be unlocked (server holds it in memory).")]));
push(table(
  ["Method  Path", "Body → Result"],
  [
    [{ t: "GET /api/status", mono: true }, "→ full state snapshot (unlocked, clients, channels, queue, settings, batch, aiUsage, cacheCount). Polled by the UI."],
    [{ t: "POST /api/unlock", mono: true }, "{master, operator} → unlock or create the vault."],
    [{ t: "POST /api/lock", mono: true }, "→ clear in-memory vault."],
    [{ t: "POST /api/master/change", mono: true }, "{oldMaster, newMaster} → re-encrypt vault."],
    [{ t: "POST /api/vault/reset", mono: true }, "→ delete vault.enc (forgot-password; only while locked)."],
    [{ t: "POST /api/client[/update|/delete|/get]", mono: true }, "Manage vendor credentials. update/delete require the console (master) password; get returns id+pw for one vendor."],
    [{ t: "POST /api/queue", mono: true }, "{channel} → build queue.csv + codes.txt, return preview."],
    [{ t: "POST /api/browser/open", mono: true }, "{client} → launch the automation browser at the vendor URL."],
    [{ t: "POST /api/batch/start", mono: true }, "{limit, offset, autoAI} → start a background scan (runBatch)."],
    [{ t: "POST /api/map/prepare", mono: true }, "{code, basicRoomId, roomIndex, masterId, autoConfirm} → select the candidate in Trip.com (and optionally click [Mapping])."],
    [{ t: "POST /api/recommend", mono: true }, "→ score whatever modal is currently open (manual mode)."],
    [{ t: "POST /api/ai/key", mono: true }, "{provider, key, model} → store AI config in the vault."],
    [{ t: "POST /api/ai/research", mono: true }, "{hotel, room, ourAttrs, candidateAttrs} → deep per-room web verification."],
    [{ t: "POST /api/ai/usage/reset", mono: true }, "→ reset the token/cost counter."],
    [{ t: "POST /api/settings", mono: true }, "Partial settings object → merge + save."],
    [{ t: "POST /api/cache/clear", mono: true }, "→ clear the cooldown cache."],
    [{ t: "POST /api/dump", mono: true }, "→ save the current page HTML/screenshot to reports/ (debug)."],
  ],
  [3200, 6160]
));

// 11. Frontend
push(H1("11. Front End (public/index.html)"));
push(P("One self-contained file: HTML structure, CSS (with theme variables), and the client JS. No build step. Key concepts a developer must know:"));
push(bullets([
  [B("App shell. "), new TextRun("A full-screen lock screen ("), C("#lockScreen"), new TextRun(") and the unlocked app ("), C("#app"), new TextRun(": left "), C("#nav"), new TextRun(" sidebar + "), C("#content"), new TextRun("). Visibility is toggled by the "), C(".hide"), new TextRun(" class — which uses "), C("!important"), new TextRun(" so it overrides ID display rules.")],
  [B("Views. "), C("showView('work'|'settings')"), new TextRun(" toggles the two main views; the sidebar is the menu.")],
  [B("refresh(). "), new TextRun("Fetches "), C("/api/status"), new TextRun(", stores it in the global "), C("ST"), new TextRun(", and re-renders everything. Re-polls while a scan / AI is running.")],
  [B("i18n. "), new TextRun("Dictionary "), C("I18N.ko / I18N.en"), new TextRun("; static text tagged with "), C("data-i18n"), new TextRun(" / "), C("data-i18n-ph"), new TextRun("; dynamic strings use "), C("t('key')"), new TextRun(". Language persists in localStorage.")],
  [B("Theme. "), new TextRun("CSS custom properties; "), C("data-theme=\"dark\""), new TextRun(" on the root overrides them. Persists in localStorage.")],
  [B("Results. "), C("renderBatch"), new TextRun(" → filter chips ("), C("renderFilterChips"), new TextRun(") + "), C("renderBatchTable"), new TextRun(" (sorted by score). "), C("showCompare(i)"), new TextRun(" renders the full-column comparison + AI box.")],
]));
push(P([B("Caching note: "), new TextRun("the server sends "), C("Cache-Control: no-store"), new TextRun(" for the HTML so the browser always loads the latest UI after a code change.")]));

// 12. Trip.com automation
push(H1("12. Trip.com Automation (lib/ctrip.mjs)"));
push(P("Trip.com Connect is a Vue + Element-UI single-page app. The adapter drives it through Playwright. Important realities:"));
push(bullets([
  [B("Manual prerequisites. "), new TextRun("The operator must log in, switch group (1210 Ohmyhotel = KR/JP/worldwide, 1311 Ohmyhotelvn = Vietnam) and open Room Mapping. The adapter does NOT navigate (a full goto resets the SPA session) — it reuses the open page.")],
  [B("Element-UI tables. "), new TextRun("Header and body live in separate tables ("), C(".el-table__header-wrapper th"), new TextRun(" vs "), C(".el-table__body-wrapper tbody tr"), new TextRun("). The reader matches tables by header text.")],
  [B("Query waits for rows. "), new TextRun("The empty table shows “No Data” by default, so the code waits specifically for rows to appear (not for “No Data”).")],
  [B("Mapping. "), C("prepareMapping"), new TextRun(" re-queries the hotel, opens the room modal, selects the candidate radio, and highlights it green. "), C("confirmMapping"), new TextRun(" (opt-in) clicks the modal's final confirm button.")],
  [B("Fragility. "), new TextRun("Selectors depend on Trip.com's DOM; if Trip.com changes its markup the adapter may need updating. "), C("/api/dump"), new TextRun(" saves the live HTML to reports/ for debugging.")],
]));

// 13. AI
push(H1("13. AI Integration (lib/ai.mjs)"));
push(P("AI is optional and keyed per operator (stored in the vault). It supports Anthropic Claude and OpenAI. Two modes:"));
push(bullets([
  [B("Batch attribute verify "), new TextRun("("), C("aiVerifyBatch"), new TextRun("): during a scan, rooms with score ≥ "), C("aiMinScore"), new TextRun(" are buffered and verified "), B("many per single API call"), new TextRun(" (default 8). Cheap, few requests.")],
  [B("Deep web research "), new TextRun("("), C("aiResearchRoom"), new TextRun("): the per-room 🤖 button searches the web (DuckDuckGo) for the hotel/room, extracts the page, and asks the AI to compare — runs in a hidden headless browser.")],
]));
push(H2("13.1 Cost & rate limits"));
push(bullets([
  [B("Separate billing. "), new TextRun("API usage is billed per token, separate from any Claude.ai / ChatGPT subscription. Check the real balance in the provider console; AMS shows an "), B("estimated"), new TextRun(" cost card from tokens it actually spent ("), C("lib/usage.mjs"), new TextRun(").")],
  [B("Rate limiting. "), C("setAiRpm"), new TextRun(" spaces requests under the org limit (free tier is often 5/min; default 4). "), C("rateFetch"), new TextRun(" auto-retries on HTTP 429 with Retry-After backoff.")],
  [B("To go faster. "), new TextRun("Raise the Anthropic usage tier (add credits) and increase the RPM setting.")],
]));

// 14. Storage
push(H1("14. Data & Storage"));
push(P("All state is plain files in the project folder, all git-ignored:"));
push(table(
  ["File", "Contents", "Sensitivity"],
  [
    [{ t: "vault.enc", mono: true }, "Encrypted vendor logins + AI key.", "Secret (encrypted)."],
    [{ t: "settings.json", mono: true }, "Thresholds, weights, AI RPM/min-score/batch, cooldown.", "Low."],
    [{ t: "scan-cache.json", mono: true }, "Per-code last scan time + status (cooldown).", "Low."],
    [{ t: "ai-usage.json", mono: true }, "Token totals + estimated cost.", "Low."],
    [{ t: "audit.log", mono: true }, "JSONL of operator actions (unlock, map, etc.).", "Medium."],
    [{ t: "queue.csv / codes.txt", mono: true }, "Current work queue + unique hotel codes.", "Low."],
    [{ t: "auth/*.json", mono: true }, "Playwright storage state (logged-in session).", "Sensitive."],
    [{ t: "reports/*", mono: true }, "Debug HTML / screenshots.", "Low."],
  ],
  [2200, 5160, 2000]
));

// 15. Security
push(H1("15. Security Model"));
push(bullets([
  [B("Encrypted vault. "), new TextRun("Vendor passwords + AI key are stored only inside "), C("vault.enc"), new TextRun(" (AES-256-GCM, key derived from the master password via scrypt). The master password is never stored.")],
  [B("Edit/delete gate. "), new TextRun("Changing or deleting a vendor requires re-entering the master (console) password, verified server-side.")],
  [B("Local only. "), new TextRun("The server binds to localhost; nothing is uploaded. The repo is private.")],
  [B("Never echo secrets. "), new TextRun("Passwords/API keys are only entered in the console and stored encrypted; they are never printed to logs or shared in chat.")],
  [B("Human confirm. "), new TextRun("The final mapping confirmation is manual by default; auto-confirm is an explicit opt-in with a warning.")],
]));

// 16. Settings
push(H1("16. Configuration Reference (settings.json)"));
push(table(
  ["Key", "Default", "Meaning"],
  [
    ["autoThreshold", "90", "Score ≥ → AUTO band."],
    ["reviewThreshold", "65", "Score ≥ → REVIEW band (else NO-MATCH)."],
    ["weights", "name25 bed25 type15 grade10 view10 area10 smoke5", "Per-feature scoring weights."],
    ["cooldownDays", "7", "Skip empty/mapped codes for this many days."],
    ["aiRpm", "4", "Max AI requests/minute (stay under org limit)."],
    ["aiMinScore", "80", "Only AI-verify candidates at/above this score."],
    ["aiBatchSize", "8", "Rooms verified per single AI call."],
  ],
  [1900, 2200, 5260]
));

// 17. Extending
push(H1("17. How to Extend"));
push(H2("17.1 Add a new OTA channel adapter"));
push(P([new TextRun("The Trip.com logic is isolated in "), C("lib/ctrip.mjs"), new TextRun(". To support another OTA (Agoda, Elong, Alitrip…), create a sibling adapter exposing the same shape:")]));
push(codeBlock([
  "// lib/<ota>.mjs",
  "export async function query(page, code) { /* enter code, run search */ }",
  "export async function unmappedRooms(page) { /* return [{basicRoomId, roomCode, nameEN}] */ }",
  "export async function openModal(page, i) { /* open i-th room's candidate modal */ }",
  "export async function closeModal(page) { /* close it */ }",
  "export async function prepareMapping(page, opts) { /* select candidate; opt confirm */ }",
]));
push(P([new TextRun("Then make "), C("readPage"), new TextRun(" recognise that OTA's tables (it already falls back to generic "), C("<table>"), new TextRun(" parsing), and let the server pick the adapter based on the active client. The scoring, dashboard, tiers and AI layers are channel-agnostic and need no change.")]));
push(H2("17.2 Tune the algorithm"));
push(P([new TextRun("Adjust weights/thresholds in Settings (no code change), or edit the parsers/synonym lists in "), C("lib/score.mjs"), new TextRun(" (bed normalization, grade/view/type vocabularies) to improve matching for new markets.")]));

// 18. Deployment
push(H1("18. Team Distribution"));
push(P("AMS is not a website — it runs on each laptop. To onboard a team member:"));
push(numbered([
  "Install Node.js; clone the private repo (or download the ZIP).",
  [C("npm install"), new TextRun(" then "), C("npx playwright install chromium"), new TextRun(" (or run SETUP.bat once).")],
  [C("START.bat"), new TextRun(" → the console opens automatically.")],
  "Create a master password, add the vendor login, drop the latest mapping-list Excel into Mapping List/.",
]));
push(P([B("Source control: "), new TextRun("the repo is "), C("github.com/bstars00-rgb/AMS"), new TextRun(" (private). All secrets/state are git-ignored, so the repo only contains code. Grant the team write access on GitHub to let them develop and manage it.")]));

// 19. Limitations & roadmap
push(H1("19. Known Limitations & Roadmap"));
push(bullets([
  "Trip.com selectors can break if Trip.com changes its markup — keep the adapter updated (use /api/dump to capture the new DOM).",
  "Group switching is manual today (operator selects 1210/1311) — could be automated by capturing the Switch-group modal.",
  "confirmMapping's final-button selector is best-effort; verify on one item before bulk auto-confirm.",
  "AI batch verify compares attributes only (no web) for cost reasons; deep web verification stays per-room (🤖).",
  "Official Trip.com Self-mapping API (hotelInfoSearch / masterRoomInfoSearch) exists and could replace browser automation later — it needs partner auth + schema work.",
  "Only Trip.com is implemented; other OTA adapters are future work.",
  "No automated export yet (results live in the dashboard) — an Excel export is a natural next feature.",
]));

// 20. Glossary
push(H1("20. Glossary"));
push(table(
  ["Term", "Meaning"],
  [
    ["Merchant room", "Our (supplier) room that needs mapping."],
    ["Master / candidate room", "The OTA's catalogue room we map onto."],
    ["BasicRoom ID", "Trip.com's internal room identifier."],
    ["Band", "AUTO / REVIEW / NO-MATCH classification."],
    ["Tier", "Finer score bucket (99%+, 95%+, …) driving the action."],
    ["Bed gate", "Rule: a bed conflict forces Review (no auto)."],
    ["Vault", "Encrypted local store of vendor credentials."],
    ["Operator", "The team member running AMS (name in the audit log)."],
    ["Cooldown", "Period during which an empty/mapped code is skipped."],
  ],
  [2400, 6960]
));

push(spacer());
push(P([I("End of document. Generated for the OH MY HOTEL content/mapping team handover. Keep this file with the repository ("), C("docs/"), I(").")]));

// ---------- assemble ----------
const doc = new Document({
  creator: "AMS",
  title: "AMS Desktop — Developer Handover & Technical Specification",
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "1E293B" },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: "2F55D4" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "334155" },
        paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
      { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "AMS Desktop — Developer Handover", size: 16, color: "94A3B8" })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 4 } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], children: [new TextRun({ text: "OH MY HOTEL · Confidential", size: 16, color: "94A3B8" }), new TextRun({ text: "\tPage ", size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
    children: body,
  }],
});

const out = path.join(__dirname, "AMS_Developer_Handover.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("WROTE", out, buf.length, "bytes"); });
