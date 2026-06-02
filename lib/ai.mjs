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

export async function callAI({ provider, key, model }, system, user) {
  if (!key) throw new Error("AI key not set");
  if (provider === "claude") {
    const useModel = await resolveClaudeModel(key, model);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: useModel, max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
    });
    if (!resp.ok) throw new Error(`Claude ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const j = await resp.json();
    return j.content?.[0]?.text ?? "";
  }
  // default: OpenAI
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || "gpt-4o-mini", temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// Best-effort: find a hotel's official site & room info via a research browser
// tab, then have the AI extract structured room attributes and a verdict.
export async function aiResearchRoom(context, ai, { hotel, room, ourAttrs, candidateAttrs }) {
  const rp = await context.newPage();
  let pageText = "", sourceUrl = "";
  try {
    // DuckDuckGo HTML endpoint — automation-friendly (no consent wall / bot block).
    await rp.goto("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(`${hotel} ${room} room`), { waitUntil: "domcontentloaded", timeout: 20000 });
    // First organic result; DDG wraps the real URL in a ?uddg= redirect param.
    const href = await rp.evaluate(() => {
      const a = document.querySelector("a.result__a") || [...document.querySelectorAll("a")].find((x) => /uddg=/.test(x.href));
      if (!a) return "";
      const m = a.href.match(/[?&]uddg=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : a.href;
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
