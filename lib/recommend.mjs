// Reads the mapping page (generic <table> reader), scores candidates, and can
// highlight the recommended row. No clicking — recommendation only.
import fs from "node:fs";
import { scoreCandidate, band } from "./score.mjs";

const idx = (headers, ...keys) => headers.findIndex((h) => keys.some((k) => h.toLowerCase().includes(k)));

export async function readPage(page) {
  // Reads the Trip.com "Mapping Info" modal (Element UI). The modal holds two
  // el-tables: the merchant room (header starts "BasicRoom ID") and the
  // recommended candidates (header starts "Master BasicRoom ID" + "Match Score").
  // Candidate rows have a leading radio-select cell, so they're 1 wider than the
  // header — we right-align them. Falls back to generic tables for other sites.
  const tables = await page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const tableData = (t) => {
      const hw = t.querySelector(".el-table__header-wrapper");
      const bw = t.querySelector(".el-table__body-wrapper");
      const headers = [...(hw ? hw.querySelectorAll("th") : [])].map((th) => clean(th.innerText)).filter(Boolean);
      let rows = [...(bw ? bw.querySelectorAll("tbody > tr") : [])].map((tr) => [...tr.querySelectorAll("td")].map((td) => clean(td.innerText)));
      rows = rows.map((r) => (r.length > headers.length ? r.slice(r.length - headers.length) : r));
      return { headers, rows };
    };
    const dialogs = [...document.querySelectorAll(".el-dialog__wrapper")];
    if (dialogs.length) {
      // Element UI site (Trip.com): only read when a modal is actually open.
      const open = dialogs.find((d) => !/display:\s*none/.test(d.getAttribute("style") || ""));
      if (!open) return [];
      return [...open.querySelectorAll(".el-table")].map(tableData).filter((t) => t.headers.length);
    }
    // Generic fallback (plain tables / other OTAs)
    const out = [];
    for (const t of document.querySelectorAll("table")) {
      const trs = [...t.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("th,td")].map((c) => clean(c.innerText)));
      if (trs.length > 1) out.push({ headers: trs[0], rows: trs.slice(1) });
    }
    return out;
  });
  let master = null, merchant = null;
  for (const t of tables) {
    const h0 = (t.headers[0] || "").toLowerCase();
    const hs = t.headers.join(" ").toLowerCase();
    const body = t.rows.filter((r) => r.some((c) => c));
    if (/master/.test(h0) || /standard room|mapping information|分数|recommended/.test(hs)) master = { headers: t.headers, body };
    else if (/basicroom id|merchant room|match result/.test(h0) || /merchant room|match result/.test(hs)) merchant = { headers: t.headers, body };
  }
  return { master, merchant };
}

export function analyze({ master, merchant }, weights, auto, review) {
  let m = { name: "", bed: "", view: "", area: "", smoke: "", occ: "" };
  if (merchant && merchant.body[0]) {
    const h = merchant.headers, r = merchant.body[0];
    m = {
      name: r[idx(h, "name")] ?? "",
      bed: r[idx(h, "bed")] ?? "",
      view: r[idx(h, "window", "view")] ?? "",
      area: r[idx(h, "area")] ?? "",
      smoke: r[idx(h, "smoke")] ?? "",
      occ: r[idx(h, "occupancy")] ?? "",
    };
  }
  const h = master.headers;
  const col = { id: idx(h, "standard room", "room id", "id"), name: idx(h, "name"), bed: idx(h, "bed"), win: idx(h, "window", "view"), area: idx(h, "area"), smoke: idx(h, "smoke"), occ: idx(h, "occupancy") };
  const candidates = master.body.map((r) => {
    const cand = { id: r[col.id] ?? "", name: r[col.name] ?? "", bed: r[col.bed] ?? "", view: r[col.win] ?? "", area: r[col.area] ?? "", smoke: r[col.smoke] ?? "", occ: r[col.occ] ?? "" };
    const s = scoreCandidate(m, cand, weights);
    return { ...cand, ...s, band: band(s.score, s.bedVerified, auto, review), row: r };
  }).sort((a, b) => b.score - a.score);
  // cols carries the FULL native Trip.com columns so the UI can show every column.
  const cols = {
    merchantHeaders: (merchant && merchant.headers) || [],
    merchantRow: (merchant && merchant.body && merchant.body[0]) || [],
    masterHeaders: master.headers || [],
  };
  return { merchant: m, candidates, cols };
}

export async function highlight(page, id, score) {
  if (!id) return;
  await page.evaluate(({ id, score }) => {
    for (const tr of document.querySelectorAll("table tr")) {
      if (tr.innerText.includes(id)) {
        tr.style.outline = "3px solid #2f55d4";
        tr.style.background = "#eef3ff";
        const tag = document.createElement("span");
        tag.textContent = ` ◀ AMS 추천 ${score}%`;
        tag.style.cssText = "color:#2f55d4;font-weight:700;white-space:nowrap";
        (tr.querySelector("td,th") || tr).appendChild(tag);
        tr.scrollIntoView({ block: "center" });
        break;
      }
    }
  }, { id, score }).catch(() => {});
}

export async function dumpPage(page) {
  fs.mkdirSync("reports", { recursive: true });
  await page.screenshot({ path: "reports/page.png", fullPage: true }).catch(() => {});
  await fs.promises.writeFile("reports/page.html", await page.content()).catch(() => {});
}
