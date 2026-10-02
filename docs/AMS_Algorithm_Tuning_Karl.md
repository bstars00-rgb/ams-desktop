# AMS 매칭 알고리즘 — 검증 결과 & 튜닝 가이드 (Karl)

> **대상:** 콘텐츠팀 Karl (매핑 노하우로 알고리즘 고도화 담당)
> **범위:** `lib/score.mjs`(점수) + `lib/recommend.mjs`(시트립 점수 결합) + `lib/settings.mjs`(설정)
> **작성일:** 2026-10-02 · 실 시트립 데이터 **37개 호텔**로 라이브 검증한 결과 포함
> 전체 시스템 구조는 `docs/AMS_Developer_Handover.docx`, 이관 정보는 `handover.md` 참고.

---

## 1. 한눈에 — 지금 알고리즘이 하는 일
각 "우리 룸(merchant)" 을 시트립 후보(master)들과 비교해 **0~100 점**을 매기고, 1순위를 추천한다. 점수는 두 단계:

1. **AMS 속성 점수** (`scoreCandidate`): 7개 속성 가중 평균
2. **시트립 Match Score와 결합** (`analyze`): 시트립이 주는 자체 점수(99 등)와 혼합

그리고 **안전 게이트**(베드/흡연 충돌)로 위험한 자동매핑을 막는다. 최종 [Mapping] 확정은 항상 사람.

### 속성·가중치 (기본값, 설정에서 변경 가능)
| 속성 | 가중치 | 비교 방법 (`lib/score.mjs`) |
|---|---|---|
| name | 25 | 토큰정렬 Levenshtein 유사도 |
| bed | 25 | 베드 정규화(EN+CN) 교집합 — `normalizeBeds` |
| type | 15 | 룸타입 분류 — `parseType` (single/double/twin/suite…) |
| grade | 10 | 등급 — `parseGrade` (standard/deluxe/premier…) |
| view | 10 | 뷰/창 — `parseView` |
| area | 10 | 면적(㎡) 근접도 — `areaScore` (±10㎡ 허용) |
| smoke | 5 | 흡연/금연 — `parseSmoke` |

`score = Σ(weightᵢ × subᵢ) / Σweightᵢ`

### 안전 게이트 & 결합 (2026-10-02 개선 반영)
- **① 흡연 게이트:** 금연↔흡연이 명확히 충돌하면 **AUTO 금지** + 점수 ×`SMOKE_PENALTY`(0.7) 로 **순위 강등**.
- **베드 게이트:** 베드 충돌이면 AUTO 금지(기존).
- **② 시트립 점수 결합:** `final = tripWeight×TripMatchScore + (1−tripWeight)×AMS` (`tripWeight` 기본 0.5). 시트립 Match Score가 없는 OTA면 자동으로 AMS만 사용.
- **밴드:** `AUTO`(≥autoThreshold & 베드OK & 흡연충돌아님) · `REVIEW`(≥reviewThreshold) · `NOMATCH`. UI는 추가로 99/95/90/80%+ 티어로 세분.

---

## 2. 라이브 검증 결과 (실 시트립, 37개 호텔)
방법: 시트립 Room Mapping에서 각 호텔 첫 미매핑 룸의 **추천 모달 데이터**(merchant + 후보 + Match Score)를 그대로 읽어, 실제 `analyze()`로 채점 → **AMS 1순위 vs 시트립 1순위** 비교.

| 배치 | 호텔 | 개선 전 | 개선 후 |
|---|---|---|---|
| Batch-1 | 20 | **15/20 (75%)** | **20/20 (100%)** |
| Batch-2 (새 호텔) | 17 | — | **15/17 (88%)**, 불일치 2건은 **둘 다 유효매치 없음**(양쪽 NOMATCH) → 기능적 17/17 |

→ 개선이 **과적합 아님**(새 호텔에서도 유지), 자동매핑 오류 0건.

### 🎯 핵심 발견 — 게이트가 "시트립의 과신 오류"를 잡는다
Batch-2에서 **시트립 자체 추천(99/98/97점)이 틀린** 케이스를 AMS 게이트가 차단:

| 호텔 | 우리 룸 | 시트립 #1 | AMS 처리 |
|---|---|---|---|
| 538797 | Standard Double **Non**-smoking | Single Room **Smoking** (99) | **NOMATCH** (✗bed ✗smk) |
| 518739 | Single Room Smoking | **Queen** Room (98, 베드 다름) | **NOMATCH** (✗bed ✗smk) |
| 517761 | Queen Double **Non**-smk | Ocean Suite **Smoking** (97) | **NOMATCH** (✗bed ✗smk) |

**→ 이것이 AMS가 시트립 점수 위에 더하는 안전 가치다.** (시트립 점수만 믿으면 흡연·베드 틀린 방을 자동매핑할 뻔.)

### 개선 과정에서 고친 버그
- `parseSmoke("No smoking")` 이 `"No"≠"non"` 이라 **흡연으로 오판** → 정답 금연룸이 충돌로 깎임. 수정(“no smoking/smoke free” 포함) 후 정답들이 AUTO로 상승.

---

## 3. Karl이 조정할 수 있는 것 (튜닝 포인트)

### A. 설정만으로 (코드 수정 없음 — 콘솔 ④ 설정 또는 `settings.json`)
| 키 | 기본 | 효과 |
|---|---|---|
| `weights.{name,bed,…}` | 25/25/15/10/10/10/5 | 속성별 중요도 |
| `autoThreshold` | 90 | 자동확정 기준 |
| `reviewThreshold` | 65 | 검토 기준 |
| `tripWeight` | 0.5 | 시트립 점수 반영 비중 (0=AMS만 … 1=시트립만) |

### B. 코드 (`lib/score.mjs`) — 매핑 노하우 반영
- **`SMOKE_PENALTY`** (0.7): 흡연 충돌 강등 강도. 낮출수록 더 강하게 강등.
- **어휘 사전**: `GRADES` / `VIEWS` / `TYPES` / `parseSmoke` / `normalizeBeds` 의 정규식.
  → 신규 시장(일본 등) 용어 추가 권장: `和洋式`, `露天浴池`, `glamping`, `kaiseki`, `floor bedding(이부자리)` 등.
- **`bedEval`**: 베드 충돌 판정 로직.
- **`areaScore`**: 면적 허용 오차(현재 `/10` = ±10㎡).

---

## 4. 데이터에서 드러난 다음 튜닝 과제 (우선순위)
1. **베드 카탈로그 차이**: 같은 방인데 시트립 카탈로그 베드가 다름(예: "Accessible" 룸이 우리=King, 마스터=Queen) → 베드 충돌로 NOMATCH 됨. **같은 이름 키워드면 베드 충돌 완화**하거나 `queen↔double` 동의 처리 검토.
2. **이름 핵심 키워드 보너스**: "Accessible", "Universal", "Dormitory" 같은 **구별 키워드**가 일치하면 가점 → 베드/등급에 눌리지 않게.
3. **점유(Occupancy) 피처 추가**: 현재 미사용. 성인/아동 정원 비교를 넣으면 가족/단독 구분에 도움.
4. **일본계 어휘 보강**: `normalizeBeds`에 `floor bedding`→이부자리, `semi-double`(이미 있음) 외 `和室/洋室` 등.
5. **`tripWeight` 미세조정**: 0.5가 강함(시트립을 많이 따름). 시트립이 틀리는 케이스가 많은 채널이면 낮추고, 신뢰 높으면 올림. 게이트가 안전망이므로 조정 여지 큼.

---

## 5. 검증 다시 돌리는 법 (회귀 테스트)
- **무인 스캔**: `npm run scan -- --from 1 --count 50 --group 1210` → `reports/scan-*.csv` 에 호텔·우리룸·추천·점수·구간·밴드·AI 결과. 설정/어휘를 바꾸고 재스캔해 밴드 분포 변화를 비교.
- **AMS vs 시트립 대조**: 추천 모달의 `Match Score` 열을 함께 뽑아 1순위 일치율을 보면 위 검증을 재현할 수 있음. (스캔 CSV에 Trip Match 열을 추가하면 자동화 가능 — 소규모 개선 과제.)
- 튜닝 1건 바꿀 때마다 **소량(10~20 호텔)으로 먼저** 확인 후 확대 권장.

---

## 6. 관련 파일
| 파일 | 내용 |
|---|---|
| `lib/score.mjs` | 점수·게이트·어휘 (Karl의 주 작업 파일) |
| `lib/recommend.mjs` | 모달 읽기 + `analyze()`(시트립 점수 결합) |
| `lib/settings.mjs` | 설정 기본값 |
| `public/index.html` | 콘솔 ④ 설정 UI (가중치·임계값·tripWeight 슬라이더) |
| `src/scan.mjs` | 무인 스캔(회귀 테스트용) |

문의/히스토리: 커밋 로그 참고 (`git log -- lib/score.mjs`). 핵심 개선 커밋: 흡연 게이트+시트립 결합 `70fa36a`.
