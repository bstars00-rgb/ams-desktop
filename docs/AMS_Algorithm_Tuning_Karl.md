# AMS Matching Algorithm — Validation & Tuning Guide (Karl)

> **For:** Karl (content team) — owner of algorithm tuning with mapping domain knowledge
> **Scope:** `lib/score.mjs` (scoring) + `lib/recommend.mjs` (Trip score blend) + `lib/settings.mjs` (config)
> **Date:** 2026-10-02 · includes a live validation on **37 real Trip.com hotels**
> For the full system design see `docs/AMS_Developer_Handover.docx`; for handover context see `handover.md`.

---

## 1. What the algorithm does, in one page
Each "our room (merchant)" is compared against Trip.com's candidate rooms (master) and scored **0–100**; the top candidate is recommended. Scoring has two stages:

1. **AMS attribute score** (`scoreCandidate`): a weighted average of 7 attributes.
2. **Blend with Trip's Match Score** (`analyze`): mix in Trip's own score (e.g. 99).

Two **safety gates** (bed / smoke conflicts) block risky auto-mapping. The final [Mapping] click is always a human.

### Attributes & weights (defaults — changeable in settings)
| Attribute | Weight | How compared (`lib/score.mjs`) |
|---|---|---|
| name | 25 | token-sorted Levenshtein similarity |
| bed | 25 | normalized bed types (EN+CN) intersection — `normalizeBeds` |
| type | 15 | room type class — `parseType` (single/double/twin/suite…) |
| grade | 10 | grade — `parseGrade` (standard/deluxe/premier…) |
| view | 10 | view/window — `parseView` |
| area | 10 | size (㎡) closeness — `areaScore` (±10㎡ tolerance) |
| smoke | 5 | smoking/non-smoking — `parseSmoke` |

`score = Σ(weightᵢ × subᵢ) / Σweightᵢ`

### Safety gates & blend (added 2026-10-02)
- **① Smoking gate:** if smoking vs non-smoking clearly conflict, **never AUTO**, and the score is multiplied by `SMOKE_PENALTY` (0.7) to **demote it in ranking**.
- **Bed gate:** a bed conflict blocks AUTO (existing).
- **② Trip score blend:** `final = tripWeight × TripMatchScore + (1 − tripWeight) × AMS` (`tripWeight` default 0.5). For OTAs without a Trip Match Score, it automatically falls back to pure AMS.
- **Bands:** `AUTO` (≥ autoThreshold & bed OK & no smoke conflict) · `REVIEW` (≥ reviewThreshold) · `NOMATCH`. The UI further buckets into 99/95/90/80%+ tiers.

---

## 2. Live validation (37 real Trip.com hotels)
Method: for each hotel's first unmapped room, read the **recommendation modal** data (merchant + candidates + Match Score) directly from Trip.com, run it through the real `analyze()`, and compare **AMS #1 vs Trip #1**.

| Batch | Hotels | Before | After |
|---|---|---|---|
| Batch-1 | 20 | **15/20 (75%)** | **20/20 (100%)** |
| Batch-2 (fresh hotels) | 17 | — | **15/17 (88%)**; the 2 misses are both **no-valid-match** hotels (both say NOMATCH) → functionally 17/17 |

→ The improvement **generalizes** (holds on unseen hotels), with **zero wrong auto-maps**.

### 🎯 Key finding — the gates catch Trip's own over-confident errors
In Batch-2, several of Trip's own recommendations (scored 99/98/97) were wrong, and the AMS gates blocked them:

| Hotel | Our room | Trip #1 | AMS result |
|---|---|---|---|
| 538797 | Standard Double **Non**-smoking | Single Room **Smoking** (99) | **NOMATCH** (✗bed ✗smoke) |
| 518739 | Single Room Smoking | **Queen** Room (98, different bed) | **NOMATCH** (✗bed ✗smoke) |
| 517761 | Queen Double **Non**-smoking | Ocean Suite **Smoking** (97) | **NOMATCH** (✗bed ✗smoke) |

**→ This is the safety value AMS adds on top of Trip's score.** Trusting Trip's score alone would have auto-mapped rooms with the wrong smoking/bed.

### Bug fixed during the work
- `parseSmoke("No smoking")` was mis-read as *smoking* (because `"No" ≠ "non"`), so correct non-smoking rooms were penalized. Fixed (now matches `no smoking` / `smoke free`); correct picks then rose to AUTO.

---

## 3. What you can tune

### A. Settings only (no code — console ④ Settings or `settings.json`)
| Key | Default | Effect |
|---|---|---|
| `weights.{name,bed,…}` | 25/25/15/10/10/10/5 | per-attribute importance |
| `autoThreshold` | 90 | AUTO cutoff |
| `reviewThreshold` | 65 | REVIEW cutoff |
| `tripWeight` | 0.5 | how much to trust Trip's Match Score (0 = AMS only … 1 = Trip only) |

### B. Code (`lib/score.mjs`) — apply mapping know-how
- **`SMOKE_PENALTY`** (0.7): how hard a smoke conflict is demoted (lower = harsher).
- **Vocabularies**: regexes in `GRADES` / `VIEWS` / `TYPES` / `parseSmoke` / `normalizeBeds`.
  → Recommended: add new-market terms (Japan): `和洋式` (Japanese-Western), `露天浴池` (open-air bath), `glamping`, `kaiseki`, `floor bedding`, etc.
- **`bedEval`**: bed-conflict logic.
- **`areaScore`**: size tolerance (currently `/10` = ±10㎡).

---

## 4. Next tuning tasks surfaced by the data (priority order)
1. **Bed catalog differences**: the same room can list a different bed in Trip's catalog (e.g. an "Accessible" room is King for us but Queen in the master) → flagged as a bed conflict → NOMATCH. Consider **softening the bed conflict when a distinctive name keyword matches**, or treating `queen ↔ double` as compatible.
2. **Name keyword bonus**: reward matches on distinctive keywords like "Accessible", "Universal", "Dormitory" so they aren't buried by bed/grade.
3. **Add Occupancy as a feature**: currently unused. Comparing adult/child capacity helps family vs single-use.
4. **Strengthen Japan vocabulary**: e.g. `floor bedding` → futon in `normalizeBeds`, `和室/洋室`.
5. **Tune `tripWeight`**: 0.5 is strong (follows Trip closely). Lower it for channels where Trip is often wrong, raise it where Trip is reliable — the gates act as a safety net, so there is room to adjust.

---

## 5. How to re-run the validation (regression)
- **Unattended scan**: `npm run scan -- --from 1 --count 50 --group 1210` → `reports/scan-*.csv` with hotel · our room · pick · score · tier · band · AI result. Change settings/vocab and re-scan to compare the band distribution.
- **AMS vs Trip check**: also capture the modal's `Match Score` column to reproduce the #1 agreement rate above. (Adding a Trip-Match column to the scan CSV would automate this — a small improvement task.)
- Validate each change on a **small set (10–20 hotels) first**, then scale up.

---

## 6. Files to know
| File | Content |
|---|---|
| `lib/score.mjs` | scoring · gates · vocabularies (your main file) |
| `lib/recommend.mjs` | modal reader + `analyze()` (Trip score blend) |
| `lib/settings.mjs` | default settings |
| `public/index.html` | console ④ Settings UI (weights · thresholds · tripWeight) |
| `src/scan.mjs` | unattended scan (for regression testing) |

History: see the git log (`git log -- lib/score.mjs`). Key improvement commit: smoking gate + Trip blend `70fa36a`.
