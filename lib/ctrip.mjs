// Trip.com (Ctrip) Connect adapter — drives the roomMapping page:
// enter hotel code → Query → read unmapped (Pre-Mapping) rooms → open each
// room's "Mapping Info" modal (so the reader can recommend) → close.
// It does NOT click the final "Mapping" button — that stays a human decision.
const ROOMMAPPING_URL = "https://connect.trip.com/roomMapping";

export async function query(page, code) {
  // Do NOT navigate — a full goto resets the SPA's group/session state and the
  // page gets stuck loading. Reuse the page the user already has open on the
  // Room Mapping screen (with the group selected). The SPA updates in place.
  const input = page.locator('input[name="hotel-code"]').first();
  try { await input.waitFor({ timeout: 8000 }); }
  catch { throw new Error("Room Mapping 화면이 아닙니다 — Mapping center → Room Mapping 으로 이동(그룹 선택) 후 스캔하세요."); }
  await input.click().catch(() => {});
  await input.fill(String(code));
  console.log(`[ctrip] hotel-code = "${await input.inputValue().catch(() => "")}"`);
  // Click the blue "Query" button (Enter fallback).
  let clicked = false;
  try { await page.locator("button.btn-blue", { hasText: "Query" }).first().click({ timeout: 4000 }); clicked = true; }
  catch { await input.press("Enter").catch(() => {}); }
  // Let the request fire & the table re-render, THEN settle on rows OR "No Data".
  // (Reading immediately would catch the pre-existing empty "No Data" state.)
  await page.waitForTimeout(1200);
  try {
    await page.waitForFunction(() => {
      const t = [...document.querySelectorAll(".el-table")].find((x) => {
        const hs = [...x.querySelectorAll(".el-table__header-wrapper th")].map((th) => th.innerText).join(" ").toLowerCase();
        return hs.includes("basicroom id") && hs.includes("toolbar") && !hs.includes("master");
      });
      if (!t) return false;
      const rows = t.querySelectorAll(".el-table__body-wrapper tbody > tr").length;
      return rows > 0 || /no data/i.test(t.innerText);
    }, { timeout: 9000 });
  } catch { /* slow/closed */ }
  const rows = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".el-table")].find((x) => {
      const hs = [...x.querySelectorAll(".el-table__header-wrapper th")].map((th) => th.innerText).join(" ").toLowerCase();
      return hs.includes("basicroom id") && hs.includes("toolbar") && !hs.includes("master");
    });
    return t ? t.querySelectorAll(".el-table__body-wrapper tbody > tr").length : -1;
  }).catch(() => -1);
  console.log(`[ctrip] query clicked=${clicked}, rows=${rows}`);
}

// Read the Pre-Mapping (unmapped) rooms currently shown.
export async function unmappedRooms(page) {
  return await page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const tbl = [...document.querySelectorAll(".el-table")].find((t) => {
      const hs = [...t.querySelectorAll(".el-table__header-wrapper th")].map((th) => clean(th.innerText)).join(" ").toLowerCase();
      return hs.includes("basicroom id") && hs.includes("toolbar") && !hs.includes("master");
    });
    if (!tbl) return [];
    const bw = tbl.querySelector(".el-table__body-wrapper");
    return [...(bw ? bw.querySelectorAll("tbody > tr") : [])]
      .map((tr) => {
        const c = [...tr.querySelectorAll("td")].map((td) => clean(td.innerText));
        return { basicRoomId: c[0], roomCode: c[1], nameEN: c[2] };
      })
      .filter((r) => r.basicRoomId);
  });
}

// Open the i-th unmapped room's mapping modal (clicks its "SubmitMapping").
export async function openModal(page, i) {
  const btn = page.getByText("SubmitMapping", { exact: true }).nth(i);
  await btn.click({ timeout: 6000 });
  // wait until a visible dialog shows a candidate ("Master ...") table with rows
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll(".el-dialog__wrapper")].find((x) => !/display:\s*none/.test(x.getAttribute("style") || ""));
    if (!d) return false;
    return [...d.querySelectorAll(".el-table")].some((t) => {
      const masterHdr = [...t.querySelectorAll(".el-table__header-wrapper th")].some((th) => /master/i.test(th.innerText));
      const rows = t.querySelectorAll(".el-table__body-wrapper tbody > tr").length;
      return masterHdr && rows > 0;
    });
  }, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(400);
}

export async function closeModal(page) {
  const x = page.locator('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog__headerbtn').first();
  await x.click({ timeout: 3000 }).catch(async () => { await page.keyboard.press("Escape").catch(() => {}); });
  await page.waitForTimeout(400);
}
