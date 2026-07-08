# AMS Desktop — 프로젝트 이관 문서 (Handover)

> **이관 방향:** OPS 계정 (Claude Code) → **CEO Office 계정**
> **대상:** 이 프로젝트 폴더(`ams-desktop`) 단일 프로젝트만 해당. 다른 폴더/프로젝트와 무관.
> **작성일:** 2026-07-08
> **문서 목적:** CEO Office 계정 담당자가 이 프로젝트를 처음 보더라도 바로 이해하고 이어서 개발·운영할 수 있도록 현재 상태를 정리.
>
> 더 자세한 기술 명세는 `docs/AMS_Developer_Handover.docx`(영문 개발 명세서)를 참고하세요. 본 문서는 이관용 요약본입니다.

---

## 1. 프로젝트명
**AMS Desktop** (AI Mapping System — 로컬 객실 매핑 자동화 도구)

- Git 원격 저장소: `https://github.com/bstars00-rgb/ams-desktop.git` (**private**)
- 현재 브랜치: `main` (working tree clean, 원격과 동기화됨)
- ⚠️ 참고: `docs/` 안의 Word 명세서 본문에는 저장소명이 `AMS`로 표기된 곳이 있음 → 실제는 **`ams-desktop`** 임 (아래 "누락/확인 필요 항목" 참조).

## 2. 프로젝트 목적
OTA 채널(우선 대상: **Trip.com / Ctrip**) 간 **동일 객실타입 매핑을 자동화**하여, 콘텐츠·매핑팀의 반복 수작업을 줄이고 오매핑(→ 오부킹)을 예방한다.
- 공급사 룸과 채널 마스터룸은 명칭·속성이 달라 수작업 매핑이 느리고 오류가 잦음.
- AMS는 "호텔코드 입력 → 미매핑 룸 조회 → 알고리즘 점수화 → 추천 → (선택) AI 외부검증 → 사람 확정"을 자동화한다.
- **핵심 원칙:** 로컬 전용(백엔드/DB 없음), 사람이 최종 확정(안전장치), PC별 암호화 자격증명.

## 3. 현재 진행 상태
**프로토타입 개발 완료 · 정상 작동 중.**
- 웹 콘솔(대시보드) 기반 도구가 동작하며 실제 시트립 스캔·추천·매핑준비까지 검증됨.
- 최근까지 진행: 점수 구간 세분화, 티어 필터/정렬, AI 외부검증(병렬·묶음·비용/속도 최적화), 최종 [Mapping] 자동확정 옵션, 한/영·다크모드, 사용량·비용 카드.
- 콘텐츠팀 **Karl** 인계용 영문 명세서 + 대표이사 보고서 작성 완료(`docs/`).

## 4. 주요 기능
- **자동 로그인 세션 재사용 + 스캔:** 시트립에서 호텔코드별 미매핑 룸 자동 조회·수집(`runBatch`).
- **AMS 점수화:** 이름·베드·타입·등급·뷰·면적·금연 7개 속성 가중 점수(0~100).
- **점수 구간(티어) + 처리 정책:** 99/95/90/80%+ 등 구간별 액션(99% 즉시 매핑, 95% AI검증 후 등).
- **베드 게이트:** 베드 충돌은 점수와 무관하게 "검토" 강제(오매핑 방지).
- **전체 컬럼 비교:** 우리 룸 vs 후보의 모든 속성 한 화면 비교.
- **AI 외부검증(선택):** 웹·속성 기반 동일여부 자동 판정(신뢰도↑). 스캔과 병렬, 80%+만·묶음 검증으로 비용/요청 절감.
- **매핑 실행:** "맵핑 시작"이 시트립에 후보 선택 → 최종 [Mapping]은 사람(기본) 또는 자동확정 옵션. 99%+ 일괄 준비 워커.
- **로컬 암호화 금고:** 자격증명·AI키를 AES-256-GCM으로 PC에 저장.
- **운영 편의:** 한/영, 다크모드, 재검색 쿨다운 캐시, 사용량·추정비용 카드, 감사 로그.

## 5. 기술 스택
| 영역 | 사용 기술 |
|---|---|
| 런타임 | Node.js (ES Modules, `.mjs`). 개발 PC 검증: Node **v24.14.1**, npm 11.11.0. 권장 최소 **Node 18+** |
| HTTP 서버 | Node 내장 `http` (Express 없음). 포트 **5234** |
| 브라우저 자동화 | **Playwright** (chromium) — 시트립 Vue/Element-UI SPA 조작 |
| 엑셀 파싱 | **xlsx (SheetJS)** |
| 암호화 | Node `crypto` (AES-256-GCM + scrypt) |
| 프런트엔드 | 순수 HTML/CSS/JS 단일 파일(`public/index.html`), 빌드 없음. CSS 변수 테마 + `data-i18n` 다국어 |
| AI(선택) | Anthropic **Claude** 또는 **OpenAI** REST |
| 문서 생성 | `docx` (npm, **package.json 미포함** — 아래 참조) |

## 6. 폴더 구조
```
ams-desktop/
├─ server.mjs              # 컨트롤 서버 (API + 세션상태 + 스캔 오케스트레이션 runBatch)
├─ public/index.html       # 콘솔 UI 전체 (HTML/CSS/JS/i18n) — 빌드 없음
├─ lib/                    # 백엔드 모듈
│  ├─ vault.mjs            # 암호화 금고(save/load/delete)
│  ├─ settings.mjs         # settings.json 로드/저장(+기본값)
│  ├─ queuelib.mjs         # 엑셀 읽기·채널 목록·작업큐 생성(캐시)
│  ├─ ctrip.mjs            # 시트립 어댑터(조회/룸읽기/모달/매핑준비·확정)
│  ├─ recommend.mjs        # 모달 표 읽기 + analyze()
│  ├─ score.mjs            # AMS 점수 알고리즘(피처·가중치·밴드·베드게이트)
│  ├─ ai.mjs              # AI 클라이언트(callAI·묶음검증·웹리서치·rate limit)
│  ├─ usage.mjs           # AI 토큰·추정비용 집계
│  ├─ scancache.mjs       # 코드별 쿨다운 캐시
│  ├─ audit.mjs           # 감사 로그(append-only)
│  └─ prompt.mjs          # (레거시 CLI용) 콘솔 입력 헬퍼
├─ src/                    # ⚠ 레거시 CLI (초기 버전) — vault.mjs / queue.mjs / run.mjs
├─ docs/                   # 인계 문서 (아래 참조)
├─ START.bat / SETUP.bat   # Windows 실행/최초설치 런처
├─ README.md               # ⚠ 구버전(CLI) 흐름 위주 — 최신화 필요
├─ package.json / package-lock.json
└─ (런타임 생성·git-ignored 로컬 파일: 아래 10·15장 참조)
```
`docs/` 내용:
- `AMS_Developer_Handover.docx` — 영문 개발 기술 명세서(가장 상세)
- `AMS_대표이사_보고서.docx` — 한국어 CEO 보고서
- `Teams_보고메시지.txt` — 팀즈 공지 메시지
- `gen_spec.cjs`, `gen_ceo.cjs` — 위 Word 문서 재생성 스크립트

## 7. 주요 파일 설명
| 파일 | 역할 |
|---|---|
| `server.mjs` | 로컬 API(약 25개 엔드포인트) 제공, 세션상태(`state`) 보유, `runBatch()`로 스캔 진행. 콘솔 HTML을 no-store로 서빙. |
| `public/index.html` | 콘솔 전체(잠금화면·사이드바·작업뷰·설정뷰). `refresh()`가 `/api/status` 폴링, `renderBatch/showCompare`가 결과 렌더. i18n/테마 내장. |
| `lib/score.mjs` | 매칭 알고리즘 본체. 가중치·밴드(AUTO/REVIEW/NO-MATCH)·베드검증. |
| `lib/ctrip.mjs` | **채널별 자동화 계층.** 다른 OTA 추가 시 이 형태로 새 어댑터 작성. |
| `lib/vault.mjs` | AES-256-GCM 암호화 자격증명 저장소(`vault.enc`). 마스터비번은 저장 안 함. |
| `lib/ai.mjs` | AI 호출·묶음검증·웹리서치 + 분당 요청 제한(`setAiRpm`)·429 재시도. |
| `START.bat` | 더블클릭 실행 → `node server.mjs` → 브라우저에서 콘솔 자동 오픈. |
| `SETUP.bat` | 최초 1회: `npm install` + `npx playwright install chromium`. |

## 8. 실행 방법
**기본(권장) — 웹 콘솔:**
```bash
cd ams-desktop
npm install
npx playwright install chromium
npm start          # 또는 START.bat 더블클릭
#  → http://localhost:5234 자동 오픈
```
최초 실행 시 잠금화면이 "마스터 비밀번호 만들기"로 전환됨 → 비번 생성 → 사이드바에서 업체(시트립 로그인) 추가 → `Mapping List/`에 최신 엑셀 넣기 → 작업 큐 → 브라우저 열기(수동 로그인·그룹선택·Room Mapping) → 자동 스캔.

**참고(레거시 CLI):** `npm run vault` / `npm run queue` / `npm run run` (→ `src/*.mjs`). 초기 버전 흐름이며 현재는 웹 콘솔이 주 사용 경로.

## 9. 환경변수 / 설정값
- **환경변수(.env) 사용 안 함.** (AI 키·자격증명은 `.env`가 아니라 **암호화 금고**에 저장.)
- 설정은 `settings.json`(git-ignored, 콘솔 ④ 설정에서 편집). 기본값:

| 키 | 기본값 | 의미 |
|---|---|---|
| `autoThreshold` | 90 | 점수 ≥ → AUTO 밴드 |
| `reviewThreshold` | 65 | 점수 ≥ → REVIEW (미만 NO-MATCH) |
| `weights` | name25 bed25 type15 grade10 view10 area10 smoke5 | 속성별 가중치 |
| `cooldownDays` | 7 | 빈/매핑 코드 재검색 쿨다운(일) |
| `aiRpm` | 4 | AI 분당 요청 제한(무료티어 5/분 대응) |
| `aiMinScore` | 80 | 이 점수 이상만 AI 검증 |
| `aiBatchSize` | 8 | 1회 호출당 검증 룸 수 |

## 10. 외부 서비스 연동 정보
- **Trip.com Connect (connect.trip.com):** Playwright로 조작. 로그인·그룹선택(1210 Ohmyhotel=KR/JP/월드, 1311 Ohmyhotelvn=베트남)·Room Mapping은 **사람이 먼저** 화면을 띄워야 함(어댑터는 goto로 이동하지 않고 열린 페이지 재사용).
- **AI API (선택):** Claude(`api.anthropic.com`) 또는 OpenAI(`api.openai.com`). 키는 **운영자별**로 콘솔에서 입력 → 금고에 암호화 저장.
- **DuckDuckGo:** AI 웹 리서치 시 검색용(숨겨진 headless 브라우저).

## 11. 데이터베이스 / Supabase / GitHub / API 연동 여부
| 항목 | 여부 |
|---|---|
| 데이터베이스 / Supabase | **없음** (백엔드·DB 미사용, 상태는 로컬 파일) |
| GitHub | **연동됨** — private repo `bstars00-rgb/ams-desktop`, HTTPS 원격 |
| 외부 API | **Claude/OpenAI (선택)**, Trip.com은 API 아닌 브라우저 자동화 |
| 인증/서버 | 없음 (localhost 바인딩, 업로드 없음) |

## 12. 완료된 작업
- 로컬 전용 아키텍처 + 컨트롤 서버 + 콘솔 UI.
- 암호화 금고(멀티 업체, 마스터비번 생성/변경/초기화, 콘솔비번 게이트).
- 엑셀 작업큐 추출(채널 선택, 캐시로 속도 개선).
- 시트립 자동 스캔(조회→룸→모달→추천) 및 안정화(no-goto, 행 대기, 캐시 쿨다운).
- AMS 알고리즘(7속성·가중치·밴드·베드게이트), 점수 구간 세분화 + 티어 필터/정렬.
- 전체 컬럼 비교표.
- AI 외부검증: 스캔 병렬, 80%+만, 묶음(batch) 검증, 분당제한+429 재시도, 사용량·추정비용 카드.
- 매핑 준비(라디오 자동선택) + 99%+ 일괄 워커 + 최종 [Mapping] 자동확정 옵션.
- 한/영 i18n + 다크모드(설정 localStorage 저장), 브라우저 no-store 캐시.
- 문서: 영문 개발 명세서, 한국어 CEO 보고서, Teams 메시지.

## 13. 미완료 작업
- 공식 **Self-mapping API**(hotelInfoSearch/masterRoomInfoSearch) 연동(파트너 인증·스키마 필요) — 브라우저 자동화 대체 후보.
- **타 OTA 어댑터**(Agoda/Elong/Alitrip 등) 미구현(시트립만 있음).
- **결과 엑셀 내보내기** 미구현.
- **그룹 자동 전환**(1210/1311) 미구현(현재 수동).
- 최종 [Mapping] 자동확정 버튼 선택자 **실기기 검증 미완**(1건 검증 후 확대 권장).
- README/문서 최신화 미완(아래 참조).

## 14. CEO Office 계정에서 이어서 해야 할 다음 작업
1. **저장소 접근 이전:** CEO Office 계정에 private repo `bstars00-rgb/ams-desktop` **접근/소유권 이전** 또는 write 권한 부여. (또는 새 조직 저장소로 이전.)
2. **로컬 세팅:** 새 PC에서 clone → `npm install` → `npx playwright install chromium` → `npm start`.
3. **자격증명 재설정:** 새 마스터 비밀번호 생성, 업체(시트립) 로그인·AI 키를 **새로 입력**(기존 `vault.enc`/`auth/`는 OPS 운영자 것이므로 이전 금지).
4. **동작 검증:** 자동 스캔 1회 + AI 검증 1건 + 매핑준비 1건으로 파이프라인 확인.
5. **문서 정정:** 문서 내 저장소명 `AMS`→`ams-desktop`, README 최신화(웹 콘솔 흐름 반영).
6. **로드맵 진행:** 결과 엑셀 내보내기 → 그룹 자동전환 → 타 OTA 어댑터 → (검토) 공식 Self-mapping API.
7. **Karl 인수인계 연계:** 콘텐츠팀 Karl이 매핑 노하우 반영해 알고리즘(`lib/score.mjs` 어휘/가중치) 고도화.

## 15. 이관 시 주의사항 및 리스크
- 🔐 **자격증명 이전 금지:** `vault.enc`, `auth/`는 **OPS 운영자의 시트립 로그인/세션**을 담고 있음. 새 계정으로 **복사하지 말고**, 새 PC에서 새로 생성할 것. (레포에는 애초에 git-ignored라 포함 안 됨.)
- 💳 **AI 비용:** Claude/OpenAI API는 **구독료와 별개로 토큰 과금**. 콘솔 사용량 카드로 추정치 확인, 공급자 콘솔에서 **월 지출 한도** 설정 권장. AI를 끄면 매칭은 무료로 동작.
- 🧩 **시트립 화면 의존성:** 어댑터 선택자는 시트립 DOM에 의존 → 시트립 UI 변경 시 `lib/ctrip.mjs` 수정 필요. 디버그용 `/api/dump`로 현재 HTML 저장 가능.
- 🌐 **로그인/그룹 선행:** 스캔 전 사람이 로그인·그룹선택·Room Mapping 화면을 띄워야 함(자동화가 세션을 리셋하지 않도록 설계됨).
- ⚖️ **약관:** 파트너 포털 자동화는 제약이 있을 수 있음 → 정당 계정·적정 볼륨·가능하면 공식 API 우선.
- 🪟 **플랫폼:** 런처는 Windows `.bat`. 코드 자체는 크로스플랫폼이나, 팀 운영은 Windows 전제.

---

## 16. 누락 / 확인 필요 항목 (체크리스트)
> 실제 파일 수정은 하지 않았음 — 아래는 CEO Office 계정에서 확인/보완할 항목.

- [ ] **README.md 최신화** — 현재 README는 초기 **CLI 흐름**만 설명. 주 사용 경로인 **웹 콘솔(`npm start` / 대시보드)** 을 반영 필요.
- [ ] **문서 내 저장소명 정정** — `docs/*.docx`에 `bstars00-rgb/AMS`로 표기된 곳 → 실제 `bstars00-rgb/ams-desktop`.
- [ ] **`docx` 의존성 명시** — 문서 재생성 스크립트(`docs/gen_*.cjs`)는 `docx` 패키지가 필요하나 **package.json에 없음**(과거 `--no-save` 설치). devDependencies 추가 또는 재생성 시 `npm i -D docx` 안내 필요.
- [ ] **`.env.example` / 설정 안내** — 환경변수는 없지만, "AI 키·자격증명은 금고에 저장"임을 신규 담당자용으로 명문화(README에) 권장.
- [ ] **샘플 데이터/스키마** — `Mapping List/*.xlsx`는 실데이터라 git-ignored. 신규 계정은 자체 엑셀 필요 → **엑셀 컬럼 규격(호텔코드/룸명/베드/뷰/등급/면적/채널상태 열)** 문서화 권장.
- [ ] **LICENSE / 소유권 문구** — 라이선스 파일 없음. 조직 정책에 맞게 추가 검토.
- [ ] **저장소 접근 이전** — CEO Office 계정으로 repo 소유/권한 이전(핵심 이관 액션).
- [ ] **자동확정 최종버튼 검증** — `ctrip.confirmMapping` 선택자를 실제 시트립 모달에서 1건 검증.

## 17. 정리 필요 항목 (삭제하지 않고 표시만)
> 아래는 **삭제하지 않았고**, CEO Office 계정에서 정리 여부 판단할 항목.

- **로컬 런타임 파일(민감/재생성 가능, git-ignored):** `vault.enc`, `auth/`, `audit.log`, `reports/`, `queue.csv`, `codes.txt`, `scan-cache.json`, `ai-usage.json`, `Mapping List/`.
  - → 새 계정/PC로 이전 시 **복사 대상 아님**(특히 `vault.enc`·`auth/`는 OPS 운영자 자격증명). 새로 생성됨.
- **`node_modules/`** (git-ignored, 대용량) — 이전하지 말고 새 PC에서 `npm install`.
- **`reports/`** 디버그 덤프 — 필요 시 비워도 무방.
- **`src/` (레거시 CLI)** — 현재 주 경로 아님. 유지/제거는 CEO Office 판단(참고용으로 남겨둠).
- **Word 임시 잠금파일(`~$*.docx`)** — 현재 없음(문서를 Word로 열면 일시 생성될 수 있음, 커밋 금지).

---

### 부록: 빠른 시작 (CEO Office 담당자용 3줄)
```bash
git clone https://github.com/bstars00-rgb/ams-desktop.git && cd ams-desktop
npm install && npx playwright install chromium
npm start        # http://localhost:5234 → 마스터 비밀번호 생성 후 사용
```
자세한 아키텍처·모듈·API·알고리즘은 `docs/AMS_Developer_Handover.docx` 참조.
