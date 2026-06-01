// AMS room-scoring (EN + CN), with Area (평수) and Smoke (흡연).

export function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9一-鿿가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

export function similarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = na.split(" ").sort().join(" ");
  const sb = nb.split(" ").sort().join(" ");
  return 1 - levenshtein(sa, sb) / Math.max(sa.length, sb.length);
}

// Scans the whole string and collects EVERY bed type present (EN + CN).
export function normalizeBeds(raw) {
  if (!raw) return [];
  const s = norm(raw).replace(/beds?/g, " ");
  const set = new Set();
  if (/大床/.test(s)) set.add("king");
  if (/双人床|雙人床/.test(s)) set.add("double");
  if (/双床|雙床|两张单人|兩張單人/.test(s)) set.add("single");
  if (/单人床|單人床|单床/.test(s)) set.add("single");
  if (/semi[\s-]?double/.test(s)) set.add("semidouble");
  if (/\bking\b/.test(s)) set.add("king");
  if (/\bqueen\b/.test(s)) set.add("queen");
  if (/\bdouble\b/.test(s)) set.add("double");
  if (/\bsingle\b|\btwin\b/.test(s)) set.add("single");
  if (/\bsofa\b/.test(s)) set.add("sofa");
  if (/\bbunk\b/.test(s)) set.add("bunk");
  return [...set];
}

const GRADES = [["suite", /\bsuites?\b|套房/], ["executive", /\bexecutive\b|行政/], ["premier", /\bpremier\b/], ["premium", /\bpremium\b|豪华|豪華/], ["deluxe", /\bdeluxe\b|高级|高級/], ["superior", /\bsuperior\b|优享|優享|乔禾/], ["family", /\bfamily\b|家庭/], ["standard", /\bstandard\b|标准|標準/]];
const VIEWS = [["ocean", /\bocean\b|海景/], ["sea", /\bsea\b|海/], ["garden", /\bgarden\b|花园|花園/], ["city", /\bcity\b|城景|市景/], ["mountain", /\bmountain\b|山景/], ["river", /\briver\b|江景/], ["pool", /\bpool\b/]];
const TYPES = [["suite", /\bsuites?\b|套房/], ["twin", /\btwin\b|双床|雙床/], ["triple", /\btriple\b|三人/], ["double", /\bdouble\b|大床|双人|雙人/], ["single", /\bsingle\b|单人|單人/], ["family", /\bfamily\b|家庭/]];

function first(table, s) { for (const [label, re] of table) if (re.test(s)) return label; return ""; }
export const parseGrade = (t) => first(GRADES, norm(t));
export const parseView = (t) => first(VIEWS, norm(t));
export const parseType = (t) => first(TYPES, norm(t));
export function parseSmoke(t) {
  const s = norm(t);
  if (/non[\s-]?smoking|无烟|無煙|禁烟|禁煙/.test(s)) return "non";
  if (/\bsmoking\b|可吸烟|可吸煙|吸烟/.test(s)) return "yes";
  return "";
}
function parseArea(t) { const m = String(t || "").match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : NaN; }

function cat(a, b) { if (!a || !b) return 0.5; return a === b ? 1 : 0; }
function bedEval(a, b) {
  const both = a.length && b.length;
  if (!both) return { score: 0.5, conflict: false, verified: false };
  const setB = new Set(b);
  const common = a.filter((x) => setB.has(x)).length;
  if (!common) return { score: 0, conflict: true, verified: false };
  return { score: common / Math.min(a.length, b.length), conflict: false, verified: true };
}
function areaScore(a, b) {
  const x = parseArea(a), y = parseArea(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0.5;
  return Math.max(0, 1 - Math.abs(x - y) / 10);
}

export function scoreCandidate(merchant, cand, weights) {
  const bedE = bedEval(normalizeBeds(`${merchant.bed} ${merchant.name}`), normalizeBeds(`${cand.bed} ${cand.name}`));
  const parts = {
    name: Math.round(similarity(merchant.name, cand.name) * 100),
    bed: Math.round(bedE.score * 100),
    type: Math.round(cat(parseType(merchant.name), parseType(cand.name)) * 100),
    grade: Math.round(cat(parseGrade(merchant.name), parseGrade(cand.name)) * 100),
    view: Math.round(cat(parseView(`${merchant.name} ${merchant.view}`), parseView(`${cand.name} ${cand.view}`)) * 100),
    area: Math.round(areaScore(merchant.area, cand.area) * 100),
    smoke: Math.round(cat(parseSmoke(merchant.smoke), parseSmoke(cand.smoke)) * 100),
  };
  const w = weights;
  const total = w.name + w.bed + w.type + w.grade + w.view + w.area + w.smoke || 1;
  const score = Math.round((w.name * parts.name + w.bed * parts.bed + w.type * parts.type + w.grade * parts.grade + w.view * parts.view + w.area * parts.area + w.smoke * parts.smoke) / total);
  return { score, parts, bedConflict: bedE.conflict, bedVerified: bedE.verified };
}

export function band(score, bedVerified, auto, review) {
  if (score >= auto && bedVerified) return "AUTO";
  if (score >= review) return "REVIEW";
  return "NOMATCH";
}

export const DEFAULT_WEIGHTS = { name: 25, bed: 25, type: 15, grade: 10, view: 10, area: 10, smoke: 5 };
