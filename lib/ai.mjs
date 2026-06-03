import { recordUsage } from "./usage.mjs";
// Minimal AI client (OpenAI or Claude). The key is supplied by the caller
// (kept in the encrypted vault) and never logged.
// Pick a model the account actually has (auto-resolves naming differences).
let _claudeModelCache = null;
async function resolveClaudeModel(key, override) {
  if (override) return override;
  if (_claudeModelCache) return _claudeModelCache;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (r.ok) {
      const ids = ((await r.json()).data || []).map((m) => m.id);
      _claudeModelCache = ids.find((id) => /haiku/i.test(id)) || ids.find((id) => /sonnet/i.test(id)) || ids[0];
    }
  } catch { /* ignore */ }
  return _claudeModelCache || "claude-3-5-haiku-20241022";
}

// ---- rate limiting ----
// Spaces requests so we stay under the org's per-minute limit (free tier is often
// only 5/min). Each call reserves the next time-slot; concurrent callers queue.
let _minInterval = 15000; // ms between requests (~4/min, safely under 5/min)
let _nextSlot = 0;
export function setAiRpm(rpm) { _minInterval = Math.ceil(60000 / Math.max(1, Number(rpm) || 4)); }
async function rateGate() {
  const now = Date.now();
  const slot = Math.max(now, _nextSlot);
  _nextSlot = slot + _minInterval;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
// fetch with rate gate + automatic retry on 429 (respects Retry-After).
async function rateFetch(url, opts, label) {
  for (let attempt = 0; ; attempt++) {
    await rateGate();
    const resp = await fetch(url, opts);
    if (resp.status === 429 && attempt < 3) {
      const ra = Number(resp.headers.get("retry-after")) || 20;
      await new Promise((r) => setTimeout(r, (ra + 1) * 1000));
      continue;
    }
    if (!resp.ok) throw new Error(`${label} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return resp.json();
  }
}

export async function callAI({ provider, key, model }, system, user, maxTokens = 700) {
  if (!key) throw new Error("AI key not set");
  if (provider === "claude") {
    const useModel = await resolveClaudeModel(key, model);
    const j = await rateFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: useModel, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    }, "Claude");
    recordUsage({ model: useModel, input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 });
    return j.content?.[0]?.text ?? "";
  }
  // default: OpenAI
  const j = await rateFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || "gpt-4o-mini", temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  }, "OpenAI");
  recordUsage({ model: model || "gpt-4o-mini", input: j.usage?.prompt_tokens || 0, output: j.usage?.completion_tokens || 0 });
  return j.choices?.[0]?.message?.content ?? "";
}

// Batch verification: compare MANY (our-room vs channel-candidate) pairs in ONE
// API call. No web research — pure attribute comparison (cheap + few requests, so
// it stays under tight rate limits). Returns one verdict per item, in order.
export async function aiVerifyBatch(ai, items) {
  if (!items.length) return [];
  const system = "You verify hotel room-type mappings. For EACH item, judge whether our room and the channel candidate are the SAME room type, using bed type, occupancy, area, view, smoking and name. Reply with ONLY a compact JSON array, one object per item, in order.";
  const body = items.map((it, n) => `#${n} hotel="${it.hotel}"\n our=${JSON.stringify(it.our)}\n cand=${JSON.stringify(it.cand)}`).join("\n");
  const user = `${body}\n\nReturn JSON array (same order):\n[{"i":0,"same_room":"yes|no|unsure","confidence":"high|medium|low","key_differences":"","recommended_action":""}]`;
  const text = await callAI(ai, system, user, Math.min(4000, 200 + items.length * 120));
  let arr = [];
  try { arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? text); } catch { /* keep [] */ }
  return items.map((_, n) => {
    const v = (Array.isArray(arr) && (arr.find((x) => Number(x.i) === n) || arr[n])) || {};
    return { same_room: v.same_room || "unsure", confidence: v.confidence || "", key_differences: v.key_differences || "", recommended_action: v.recommended_action || "", mode: "attrs" };
  });
}

// Best-effort: find a hotel's official site & room info via a research browser
// tab, then have the AI extract structured room attributes and a verdict.
export async function aiResearchRoom(context, ai, { hotel, room, ourAttrs, candidateAttrs }) {
  const rp = await context.newPage();
  let pageText = "", sourceUrl = "";
  try {
    // DuckDuckGo HTML endpoint — automation-friendly (no consent wall / bot block).
    await rp.goto("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(`${hotel} ${room} room`), { waitUntil: "domcontentloaded", timeout: 20000 });
    // First ORGANIC result (skip sponsored/ad links). DDG wraps the real URL in
    // a ?uddg= redirect; ads use y.js / bing.com/aclick and live in .result--ad.
    const href = await rp.evaluate(() => {
      const decode = (h) => { const m = h.match(/[?&]uddg=([^&]+)/); return m ? decodeURIComponent(m[1]) : h; };
      for (const a of document.querySelectorAll("a.result__a")) {
        if (a.closest(".result--ad") || /[?&/]y\.js|ad_domain|ad_provider|bing\.com\/aclick/.test(a.href)) continue;
        const u = decode(a.href);
        if (/^https?:\/\//.test(u) && !/duckduckgo\.com|bing\.com\/aclick/.test(u)) return u;
      }
      return "";
    }).catch(() => "");
    if (href && /^https?:\/\//.test(href)) {
      sourceUrl = href;
      await rp.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      pageText = (await rp.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 6000);
    }
  } catch (e) { console.log(`[ai] research error: ${e?.message || e}`); }
  finally { await rp.close().catch(() => {}); }
  console.log(`[ai] research: source="${sourceUrl || "(none)"}" textLen=${pageText.length}`);

  const system = "You verify hotel room mappings. Use ONLY the provided web text. Reply in compact JSON.";
  const user = `Hotel: ${hotel}
Room to verify: "${room}"
Our room attributes: ${JSON.stringify(ourAttrs)}
Channel candidate: ${JSON.stringify(candidateAttrs)}

Web page text (may be partial):
"""${pageText || "(no page text found)"}"""

Return JSON:
{"extracted":{"bed":"","occupancy":"","size_sqm":"","view":"","smoking":""},
 "same_room":"yes|no|unsure","confidence":"high|medium|low",
 "key_differences":"","recommended_action":""}`;
  const text = await callAI(ai, system, user);
  let parsed = null;
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text); } catch { /* keep raw */ }
  return { sourceUrl, raw: text, ...parsed };
}
