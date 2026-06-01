// Pick a client from the vault → open their mapping system → log in (best-effort
// auto-fill, manual fallback, session reused) → read the mapping page → print the
// AMS recommendation and highlight it. NEVER clicks "Mapping" — you confirm.
import fs from "node:fs";
import { chromium } from "playwright";
import { vaultExists, loadVault } from "../lib/vault.mjs";
import { ask, askSecret } from "../lib/prompt.mjs";
import { readPage, analyze, highlight, dumpPage } from "../lib/recommend.mjs";
import { DEFAULT_WEIGHTS } from "../lib/score.mjs";
import { audit } from "../lib/audit.mjs";

const AUTO = 90, REVIEW = 65;

if (!vaultExists()) { console.error("No vault. Run:  npm run vault add"); process.exit(1); }
const operator = (await ask("Your name (for the audit log): ")) || "unknown";
const master = await askSecret("Master password: ");
let data;
try { data = loadVault(master); } catch { console.error("❌ Wrong master password."); process.exit(1); }
if (!data.clients.length) { console.error("Vault is empty. Run:  npm run vault add"); process.exit(1); }

console.log("\nClients:");
data.clients.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}`));
const answer = (await ask("\nWhich client? (number or name) ")).trim();
const n = Number(answer);
const client = Number.isInteger(n) && n >= 1 && n <= data.clients.length
  ? data.clients[n - 1]
  : data.clients.find((c) => c.name.toLowerCase() === answer.toLowerCase());
if (!client) { console.error("Invalid selection — type the number (e.g. 1) or the exact name."); process.exit(1); }

fs.mkdirSync("auth", { recursive: true });
const sessionFile = `auth/${client.name.replace(/[^a-z0-9]/gi, "_")}.json`;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext(fs.existsSync(sessionFile) ? { storageState: sessionFile } : {});
const page = await context.newPage();
await page.goto(client.url, { waitUntil: "domcontentloaded" }).catch(() => {});

// Best-effort auto login (works on simple email+password forms; otherwise log in manually)
try {
  const pwInput = page.locator('input[type="password"]').first();
  if (await pwInput.isVisible({ timeout: 4000 }).catch(() => false)) {
    const userInput = page.locator('input[type="email"], input[type="text"]:not([type="password"])').first();
    await userInput.fill(client.id).catch(() => {});
    await pwInput.fill(client.pw).catch(() => {});
    await page.getByRole("button", { name: /log\s?in|sign\s?in|登录|登錄|로그인/i }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
} catch { /* manual fallback below */ }

console.log("\n👉 If you are not logged in yet, log in manually in the browser.");
console.log("   Then navigate to a room's mapping page (where 'Recommended Master Rooms' shows).");
await ask("   Press ENTER to analyze… ");

await context.storageState({ path: sessionFile }); // keep session for next time

const tables = await readPage(page);
if (!tables.master) {
  console.error("\n⚠ Could not find the 'Recommended Master Rooms' table.");
  await dumpPage(page);
  console.error("  Saved reports/page.png and reports/page.html — share page.html to tune the reader.");
  audit({ operator, client: client.name, action: "READ_FAILED" });
  await ask("\n  Press ENTER to exit… ");
  await browser.close();
  process.exit(0);
}

const { merchant, candidates } = analyze(tables, DEFAULT_WEIGHTS, AUTO, REVIEW);
const best = candidates[0];

console.log(`\n──────── AMS recommendation (${client.name}) ────────`);
console.log(`Merchant room: "${merchant.name}"  bed=${merchant.bed || "?"} area=${merchant.area || "?"} smoke=${merchant.smoke || "?"}`);
candidates.forEach((c, i) => console.log(`  ${i === 0 ? "★" : " "} ${String(c.score).padStart(3)}% [${c.band}]  "${c.name}" (${c.id})  bed=${c.bed}${c.bedConflict ? "  ⚠bed-conflict" : ""}`));
console.log(`\n★ Recommended: "${best?.name}" (${best?.id}) — ${best?.score}% [${best?.band}]`);
console.log(`⚠ The tool does NOT click. Review the highlighted row and click "Mapping" yourself.`);

await highlight(page, best?.id, best?.score);

audit({
  operator, client: client.name, action: "RECOMMEND",
  merchant: merchant.name, recommendedId: best?.id, recommendedName: best?.name,
  score: best?.score, band: best?.band,
});

await ask("\n  Make your final click in the browser, then press ENTER to close… ");
await browser.close();
console.log("Logged to audit.log.");
