/* CEO report (Korean) for AMS prototype — .docx */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber,
} = require("docx");

const CONTENT_W = 9360;
const KFONT = "Malgun Gothic";

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
function P(parts, opts = {}) {
  const runs = (Array.isArray(parts) ? parts : [parts]).map((x) => (typeof x === "string" ? new TextRun(x) : x));
  return new Paragraph({ spacing: { after: 120, line: 288 }, ...opts, children: runs });
}
const B = (t) => new TextRun({ text: t, bold: true });
function bullets(items) {
  return items.map((it) => new Paragraph({
    numbering: { reference: "bul", level: 0 }, spacing: { after: 70, line: 282 },
    children: (Array.isArray(it) ? it : [it]).map((x) => (typeof x === "string" ? new TextRun(x) : x)),
  }));
}
const cell = (text, { w, head = false, fill, bold = false } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: { type: ShadingType.CLEAR, fill: fill || (head ? "2F55D4" : "FFFFFF") },
  margins: { top: 70, bottom: 70, left: 120, right: 120 },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CCD3DE" },
  },
  children: [new Paragraph({ spacing: { after: 0, line: 264 }, children: [new TextRun({ text: text, bold: head || bold, color: head ? "FFFFFF" : "111827", size: 20 })] })],
});
function table(headers, rows, widths) {
  const w = widths || headers.map(() => Math.floor(CONTENT_W / headers.length));
  const head = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { w: w[i], head: true })) });
  const bodyRows = rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(String(c), { w: w[i], fill: ri % 2 ? "F7F9FC" : "FFFFFF", bold: i === 0 })) }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w, rows: [head, ...bodyRows] });
}
const spacer = () => new Paragraph({ spacing: { after: 40 }, children: [new TextRun("")] });

const body = [];
const push = (...x) => x.forEach((e) => (Array.isArray(e) ? body.push(...e) : body.push(e)));

// Title block
push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "대표이사 보고", size: 22, color: "64748B", bold: true })] }));
push(new Paragraph({ spacing: { after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "2F55D4", space: 6 } }, children: [new TextRun({ text: "AMS (AI 매핑 시스템) 프로토타입 개발 보고", size: 38, bold: true, color: "1E293B" })] }));
push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "OTA 채널 간 객실 매핑 자동화 · 프로토타입 완료 및 인계", size: 22, color: "475569" })] }));
push(table(
  ["항목", "내용"],
  [
    ["보고 부서", "콘텐츠 · 매핑팀"],
    ["대상 시스템", "AMS Desktop (로컬 전용, 시트립 우선 적용)"],
    ["상태", "프로토타입 개발 완료 · 현재 작동 중"],
    ["저장소", "GitHub Private (bstars00-rgb/AMS)"],
  ],
  [2200, 7160]
));
push(spacer());

// 1. 요약
push(H1("1. 요약 (Executive Summary)"));
push(bullets([
  "OTA 채널 간 동일 객실타입 매핑을 자동화하는 AMS 프로토타입을 개발하여 현재 정상 작동 중입니다.",
  "시트립(Trip.com) 기준으로 ‘호텔코드 입력 → 미매핑 룸 조회 → AMS 알고리즘 점수화 → 추천’까지 자동 수행합니다.",
  [B("AI 외부검증"), new TextRun("을 추가하여 매핑 신뢰도를 높였습니다(잘못된 매핑을 사전 차단).")],
  "최종 매핑 확정은 사람이 통제하도록 설계하여 오매핑 리스크를 관리합니다.",
  "프로토타입 코드를 영문 기술 명세서로 문서화하여 콘텐츠팀 Karl에게 인계 완료, 매핑 노하우를 반영해 고도화 예정입니다.",
]));

// 2. 배경
push(H1("2. 배경 및 목적"));
push(bullets([
  "공급사 룸과 채널 마스터룸은 명칭·속성이 달라 수작업 매핑이 느리고, 오매핑 시 오부킹(잘못된 객실 판매)이 발생합니다.",
  "반복 작업을 자동화하고 사람이 검수하는 구조로 정확도와 속도를 동시에 확보하는 것이 목표입니다.",
]));

// 3. 개발 결과
push(H1("3. 개발 결과 (주요 기능)"));
push(table(
  ["기능", "내용"],
  [
    ["자동 로그인·스캔", "시트립에서 호텔코드별 미매핑 룸을 자동 조회·수집"],
    ["AMS 점수화", "이름·베드·타입·등급·뷰·면적·금연 7개 속성 가중 점수(0~100)"],
    ["점수 구간 세분화", "99/95/90/80%+ 티어별 처리 정책(99% 즉시, 95% AI검증 후 등)"],
    ["베드 게이트", "베드 충돌 건은 점수와 무관하게 ‘검토’로 강제(오매핑 방지)"],
    ["AI 외부검증", "웹·속성 기반으로 동일여부를 자동 판정하여 신뢰도 향상"],
    ["전체 컬럼 비교", "우리 룸 vs 추천 후보의 모든 속성을 한 화면에서 비교"],
    ["사람/자동 확정", "최종 매핑은 사람 확정이 기본, 옵션으로 자동 확정 가능"],
    ["로컬·암호화 금고", "로그인 정보는 각 PC에 암호화 저장, 외부 유출 없음"],
    ["한/영 · 다크모드", "팀 전원이 쓰기 쉽도록 언어·테마 지원"],
  ],
  [2600, 6760]
));

// 4. 핵심 성과
push(H1("4. 핵심 성과"));
push(bullets([
  [B("신뢰도 향상: "), new TextRun("AI 외부검증으로 ‘점수=확신’이 아닌 한계를 보완하여, 흡연·베드 충돌 등 잘못된 매핑을 자동으로 적발·차단합니다.")],
  [B("처리 효율: "), new TextRun("호텔코드 단위 일괄 스캔과 99% 건 일괄 매핑 준비로 반복 작업 시간을 크게 단축합니다.")],
  [B("안전성: "), new TextRun("최종 확정은 사람이 통제(또는 명시적 옵션으로 자동), 모든 작업은 감사 로그에 기록됩니다.")],
]));

// 5. 비용
push(H1("5. 비용 안내 (중요)"));
push(P([B("⚠ AI 외부검증은 Claude API(또는 OpenAI)를 사용합니다. Claude 구독료와 별개로 사용량(토큰) 기반 비용이 별도로 청구될 수 있습니다.")]));
push(bullets([
  [B("절감 장치 적용: "), new TextRun("① 80% 이상 건만 검증 ② 여러 건을 묶어 1회 호출(batch) ③ 분당 호출 제한 ④ 도구 내 사용량·추정 비용 실시간 표시.")],
  [B("비용 0 운용도 가능: "), new TextRun("AI 검증을 끄면 점수·추천·매핑 기능은 그대로 작동하며 비용이 발생하지 않습니다(핵심 매칭은 무료·로컬).")],
  [B("실제 청구 확인: "), new TextRun("공급자 콘솔에서 잔액·청구를 확인하고, 월 지출 한도를 설정해 통제할 수 있습니다.")],
]));

// 6. 향후 계획
push(H1("6. 향후 계획"));
push(table(
  ["단계", "내용", "담당"],
  [
    ["인계 (완료)", "프로토타입 코드 영문 기술 명세서화 + Karl에게 인계", "매핑팀 → Karl"],
    ["고도화", "매핑 노하우(날리지) 반영하여 알고리즘·정확도 개선", "Karl"],
    ["확장", "타 OTA(Agoda/Elong 등) 어댑터, 결과 엑셀 내보내기", "콘텐츠팀"],
    ["재보고", "진척 사항 빠른 시일 내 재보고", "매핑팀"],
  ],
  [1800, 5560, 2000]
));

// 7. 유의사항
push(H1("7. 유의사항 / 리스크"));
push(bullets([
  "시트립 화면(웹) 구조가 변경되면 자동화 점검·수정이 필요합니다.",
  "자동 확정 기능은 옵션이며, 초기에는 1건 검증 후 점진적으로 확대 적용을 권장합니다.",
  "공식 Self-mapping API 연동 시 자동화 안정성을 더 높일 수 있어 후속 검토 대상입니다.",
]));

push(spacer());
push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 6 } }, spacing: { before: 120 }, children: [new TextRun({ text: "본 보고서는 내부 보고용입니다. (OH MY HOTEL · Confidential)", italics: true, size: 18, color: "94A3B8" })] }));

const doc = new Document({
  styles: {
    default: { document: { run: { font: KFONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 27, bold: true, font: KFONT, color: "1E40AF" },
        paragraph: { spacing: { before: 300, after: 140 }, outlineLevel: 0 } },
    ],
  },
  numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], children: [new TextRun({ text: "AMS 프로토타입 개발 보고 · OH MY HOTEL", size: 16, color: "94A3B8", font: KFONT }), new TextRun({ text: "\t", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
    children: body,
  }],
});

const out = path.join(__dirname, "AMS_대표이사_보고서.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("WROTE", out, buf.length); });
