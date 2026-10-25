/**
 * blankcomic-canva-medibang-suite.ts
 *
 * 전문 드로잉/편집 프로그램 및 레이아웃·템플릿 만화 빌더 4대 플랫폼 REA 역공학 내재화 엔진:
 * 1. BlankComic (https://blankcomic.com/ko · /editor) — `ev_b8d56892d3587ff0e4960bfde94f4574d077238e582c821307a23ad1ab401039`, `ev_3ec33f998f149d30c43627474ddc2b0f911a5721db412443d7efd952b05b2a8f`
 *    - 30종 패널 레이아웃 템플릿, 12종 다각형·곡선 패널 도형, 6종 말풍선(`speech`, `thought`, `shout`, `whisper`, `narration`, `caption`)
 *    - 6종 페이지 규격(`US Comic`, `A4`, `Manga`, `Square`, `Webtoon`, `Custom`) 및 인쇄 재단선(Trim)·여백(Bleed)·안전 영역(Safe Area) 계산기
 *    - 5종 내보내기(`PNG`, `JPG`, `PDF`, `SVG`, `.blank`) 및 `.blank` 프로젝트 직렬화/역직렬화 코덱
 * 2. 클립스튜디오 페인트 v5.1.5 (Clip Studio Paint, `/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app` & `/kr/comics-manga/`) — `ev_a17ead8ed3475ba765556bf231b0b05197320b98fafa2e3b36baf55318692b16`, `ev_6bcb35a4ed91dae8e4c599f83d1aacc131cdde7280a4e8b8082abc0d3d6ff6cc`
 *    - `Info.plist` 기반 15대 네이티브 문서·3D·브러시·색상·익스포저시트 포맷 레지스트리 (`.clip`, `.cmc`, `.csnf`, `.cs3c`, `.cs3o`, `.cs3s`, `.pep`, `.c2fr`, `.c2fc`, `.sut`, `.sutg`, `.laf`, `.cls`, `.xdts`)
 *    - 스마트폰 표시 영역(Viewport) 비율 프리뷰 및 세로 스크롤 웹툰 자동 분할 내보내기(Slice Export) 계산기
 *    - 레이어 망점 스크린톤(Halftone Screentone LPI·각도·도트 형상) 변환 계산기
 * 3. 메디방 페인트 & 팔레타 (MediBang Paint / Paletta, https://medibangpaint.com/ko/) — `ev_1fc3d4a13b1911569b4dfb62b316fc1dec6364e50f60f7892001946f4eb949ca`
 *    - 클라우드 팀 공동 작업 페이지 잠금(Page Lock)·버전 충돌 검증기 및 스캔 선화 추출·멀티터치 제스처 바인딩
 * 4. 캔바 만화 메이커 (Canva Comic Maker, https://www.canva.com/ko_kr/create/comic-strips/) — `ev_eb4a93a1ce2082e739e9f50d2b11248322c847544500179f8ed28f071a16e1c8`
 *    - 4컷 만화·인스타툰 스트립 템플릿 및 말풍선·한글 웹툰 타이포그래피 페어링 프리셋
 */

// ============================================================================
// 1. BlankComic 12종 패널 도형 · 6종 말풍선 · 30종 템플릿 · 인쇄 가이드 · .blank 코덱
// ============================================================================

export type BlankComicPagePresetId =
  | "us-comic"
  | "a4"
  | "manga-b4"
  | "square-instatoon"
  | "webtoon-vertical"
  | "custom";

export type BlankComicPanelShapeId =
  | "rectangle"
  | "rounded"
  | "ellipse"
  | "diamond"
  | "star"
  | "hexagon"
  | "slanted-left"
  | "slanted-right"
  | "trapezoid"
  | "parallelogram"
  | "burst"
  | "cloud-frame";

export type BlankComicBubbleTypeId =
  | "speech"
  | "thought"
  | "shout"
  | "whisper"
  | "narration"
  | "caption";

export type BlankComicExportFormatId = "PNG" | "JPG" | "PDF" | "SVG" | "BLANK";

export interface BlankComicPagePresetSpec {
  readonly id: BlankComicPagePresetId;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi: number;
  readonly bleedMarginPx: number;
  readonly safeMarginPx: number;
  readonly isPrintOriented: boolean;
}

export const BLANKCOMIC_PAGE_PRESETS: readonly BlankComicPagePresetSpec[] = [
  {
    id: "us-comic",
    label: "US Comic (6.625×10.25 in)",
    widthPx: 1988,
    heightPx: 3075,
    dpi: 300,
    bleedMarginPx: 38,
    safeMarginPx: 75,
    isPrintOriented: true,
  },
  {
    id: "a4",
    label: "A4 국제 규격 (210×297 mm)",
    widthPx: 2480,
    heightPx: 3508,
    dpi: 300,
    bleedMarginPx: 35,
    safeMarginPx: 82,
    isPrintOriented: true,
  },
  {
    id: "manga-b4",
    label: "일본·한국 출판 만화 B4",
    widthPx: 2953,
    heightPx: 4169,
    dpi: 300,
    bleedMarginPx: 59,
    safeMarginPx: 118,
    isPrintOriented: true,
  },
  {
    id: "square-instatoon",
    label: "인스타툰 정방형 (1080×1080)",
    widthPx: 1080,
    heightPx: 1080,
    dpi: 72,
    bleedMarginPx: 0,
    safeMarginPx: 48,
    isPrintOriented: false,
  },
  {
    id: "webtoon-vertical",
    label: "웹툰 세로 스크롤 (800×4000)",
    widthPx: 800,
    heightPx: 4000,
    dpi: 72,
    bleedMarginPx: 0,
    safeMarginPx: 32,
    isPrintOriented: false,
  },
  {
    id: "custom",
    label: "사용자 정의 캔버스",
    widthPx: 1600,
    heightPx: 2400,
    dpi: 300,
    bleedMarginPx: 30,
    safeMarginPx: 60,
    isPrintOriented: true,
  },
] as const;

export interface BlankComicPrintGuideRects {
  readonly presetId: BlankComicPagePresetId;
  readonly bleedCanvasRect: { readonly x: 0; readonly y: 0; readonly w: number; readonly h: number };
  readonly trimLineRect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly safeAreaRect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

/**
 * BlankComic 페이지 규격에 따른 인쇄 재단선(Trim)·여백(Bleed)·안전 영역(Safe Area) 계산기.
 */
export function calculateBlankComicPrintGuides(
  presetId: BlankComicPagePresetId,
  customDimensions?: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly bleedMarginPx?: number;
    readonly safeMarginPx?: number;
  },
): BlankComicPrintGuideRects {
  const base =
    BLANKCOMIC_PAGE_PRESETS.find((p) => p.id === presetId) ?? BLANKCOMIC_PAGE_PRESETS[0]!;
  const w = Math.max(200, Math.round(customDimensions?.widthPx ?? base.widthPx));
  const h = Math.max(200, Math.round(customDimensions?.heightPx ?? base.heightPx));
  const bleed = Math.max(0, Math.round(customDimensions?.bleedMarginPx ?? base.bleedMarginPx));
  const safe = Math.max(bleed, Math.round(customDimensions?.safeMarginPx ?? base.safeMarginPx));

  return {
    presetId,
    bleedCanvasRect: { x: 0, y: 0, w, h },
    trimLineRect: {
      x: bleed,
      y: bleed,
      w: Math.max(10, w - bleed * 2),
      h: Math.max(10, h - bleed * 2),
    },
    safeAreaRect: {
      x: safe,
      y: safe,
      w: Math.max(10, w - safe * 2),
      h: Math.max(10, h - safe * 2),
    },
  };
}

export interface BlankComicPanelShapeSpec {
  readonly id: BlankComicPanelShapeId;
  readonly label: string;
  readonly category: "geometric" | "slanted" | "expressive";
}

export const BLANKCOMIC_12_PANEL_SHAPES: readonly BlankComicPanelShapeSpec[] = [
  { id: "rectangle", label: "기본 직사각형", category: "geometric" },
  { id: "rounded", label: "둥근 모서리", category: "geometric" },
  { id: "ellipse", label: "원형·타원", category: "geometric" },
  { id: "diamond", label: "마름모(다이아몬드)", category: "geometric" },
  { id: "star", label: "5각 별형 강조컷", category: "expressive" },
  { id: "hexagon", label: "육각형(허니콤)", category: "geometric" },
  { id: "slanted-left", label: "좌경사 사선컷", category: "slanted" },
  { id: "slanted-right", label: "우경사 사선컷", category: "slanted" },
  { id: "trapezoid", label: "사다리꼴 다이나믹컷", category: "slanted" },
  { id: "parallelogram", label: "평행사변형 속도컷", category: "slanted" },
  { id: "burst", label: "폭발 스파이크컷", category: "expressive" },
  { id: "cloud-frame", label: "회상 구름 프레임", category: "expressive" },
] as const;

/**
 * BlankComic 12종 패널 도형을 지정된 사각형(`x, y, w, h`) 내부의 SVG `<path d="...">` 문자열로 생성한다.
 */
export function buildBlankComicPanelShapeSvgPath(
  shapeId: BlankComicPanelShapeId,
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): string {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (shapeId) {
    case "rounded": {
      const r = Math.min(20, w * 0.12, h * 0.12);
      return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case "diamond":
      return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;
    case "hexagon": {
      const dx = w * 0.25;
      return `M ${x + dx} ${y} L ${x + w - dx} ${y} L ${x + w} ${cy} L ${x + w - dx} ${y + h} L ${x + dx} ${y + h} L ${x} ${cy} Z`;
    }
    case "slanted-left": {
      const slant = h * 0.12;
      return `M ${x} ${y + slant} L ${x + w} ${y} L ${x + w} ${y + h - slant} L ${x} ${y + h} Z`;
    }
    case "slanted-right": {
      const slant = h * 0.12;
      return `M ${x} ${y} L ${x + w} ${y + slant} L ${x + w} ${y + h} L ${x} ${y + h - slant} Z`;
    }
    case "trapezoid": {
      const inset = w * 0.14;
      return `M ${x + inset} ${y} L ${x + w - inset} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }
    case "parallelogram": {
      const skew = w * 0.15;
      return `M ${x + skew} ${y} L ${x + w} ${y} L ${x + w - skew} ${y + h} L ${x} ${y + h} Z`;
    }
    case "star": {
      const pts: string[] = [];
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.42;
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.round((cx + Math.cos(angle) * r) * 10) / 10;
        const py = Math.round((cy + Math.sin(angle) * r) * 10) / 10;
        pts.push(`${i === 0 ? "M" : "L"} ${px} ${py}`);
      }
      return `${pts.join(" ")} Z`;
    }
    case "burst": {
      const pts: string[] = [];
      const spikes = 16;
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < spikes; i += 1) {
        const angle = (Math.PI * 2 * i) / spikes;
        const factor = i % 2 === 0 ? 1.0 : 0.78;
        const px = Math.round((cx + Math.cos(angle) * rx * factor) * 10) / 10;
        const py = Math.round((cy + Math.sin(angle) * ry * factor) * 10) / 10;
        pts.push(`${i === 0 ? "M" : "L"} ${px} ${py}`);
      }
      return `${pts.join(" ")} Z`;
    }
    case "cloud-frame": {
      const inset = Math.min(w, h) * 0.08;
      return `M ${x + inset} ${y + inset} Q ${cx} ${y - inset} ${x + w - inset} ${y + inset} Q ${x + w + inset} ${cy} ${x + w - inset} ${y + h - inset} Q ${cx} ${y + h + inset} ${x + inset} ${y + h - inset} Q ${x - inset} ${cy} ${x + inset} ${y + inset} Z`;
    }
    case "rectangle":
    default:
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
}

export interface BlankComicBubbleTypeSpec {
  readonly id: BlankComicBubbleTypeId;
  readonly label: string;
  readonly strokeStyle: "solid" | "dashed" | "spiky" | "double-box";
  readonly hasTail: boolean;
}

export const BLANKCOMIC_6_BUBBLE_TYPES: readonly BlankComicBubbleTypeSpec[] = [
  { id: "speech", label: "말하기 (일반 대화)", strokeStyle: "solid", hasTail: true },
  { id: "thought", label: "생각 (구름 속마음)", strokeStyle: "solid", hasTail: true },
  { id: "shout", label: "외침 (강조 비명)", strokeStyle: "spiky", hasTail: true },
  { id: "whisper", label: "속삭임 (점선 소곤)", strokeStyle: "dashed", hasTail: true },
  { id: "narration", label: "내레이션 (상황 해설)", strokeStyle: "solid", hasTail: false },
  { id: "caption", label: "캡션 (시간·장소 자막)", strokeStyle: "double-box", hasTail: false },
] as const;

export interface BlankComicTemplateSpec {
  readonly templateNumber: number;
  readonly id: string;
  readonly label: string;
  readonly panelCount: number;
  readonly normalizedPanels: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly shape: BlankComicPanelShapeId;
  }[];
}

/**
 * BlankComic 30종 만화·인스타툰·웹툰 패널 템플릿 카탈로그 생성기.
 */
export const BLANKCOMIC_30_PANEL_TEMPLATES: readonly BlankComicTemplateSpec[] = Array.from(
  { length: 30 },
  (_, idx) => {
    const num = idx + 1;
    const rows = (idx % 4) + 1;
    const cols = ((idx >> 2) % 3) + 1;
    const panels: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly shape: BlankComicPanelShapeId;
    }[] = [];

    const cellW = Math.round((1 / cols) * 1000) / 1000;
    const cellH = Math.round((1 / rows) * 1000) / 1000;
    const shapeCycle: readonly BlankComicPanelShapeId[] = [
      "rectangle",
      "rounded",
      "slanted-left",
      "slanted-right",
      "trapezoid",
    ];

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        panels.push({
          x: Math.round(c * cellW * 1000) / 1000,
          y: Math.round(r * cellH * 1000) / 1000,
          w: cellW,
          h: cellH,
          shape: idx < 6 ? "rectangle" : shapeCycle[(idx + r + c) % shapeCycle.length]!,
        });
      }
    }

    return {
      templateNumber: num,
      id: `blankcomic-tpl-${String(num).padStart(2, "0")}`,
      label: `템플릿 #${num} (${rows}행×${cols}열 · ${panels.length}컷)`,
      panelCount: panels.length,
      normalizedPanels: panels,
    };
  },
);

export interface BlankComicProjectDocument {
  readonly format: "blankcomic-project";
  readonly extension: ".blank";
  readonly version: "1.0.0";
  readonly pagePresetId: BlankComicPagePresetId;
  readonly templateId: string;
  readonly panels: readonly {
    readonly id: string;
    readonly shape: BlankComicPanelShapeId;
    readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  }[];
  readonly bubbles: readonly {
    readonly id: string;
    readonly type: BlankComicBubbleTypeId;
    readonly text: string;
  }[];
}

/**
 * BlankComic `.blank` 프로젝트 포맷 직렬화 및 역직렬화 코덱.
 */
export function serializeBlankComicProject(doc: BlankComicProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseBlankComicProject(rawJson: string): BlankComicProjectDocument | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<BlankComicProjectDocument>;
    if (
      parsed.format !== "blankcomic-project" ||
      parsed.extension !== ".blank" ||
      !Array.isArray(parsed.panels) ||
      !Array.isArray(parsed.bubbles)
    ) {
      return null;
    }
    return {
      format: "blankcomic-project",
      extension: ".blank",
      version: "1.0.0",
      pagePresetId: parsed.pagePresetId ?? "a4",
      templateId: parsed.templateId ?? "blankcomic-tpl-01",
      panels: parsed.panels,
      bubbles: parsed.bubbles,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// 2. 클립스튜디오 페인트 v5.1.5 네이티브 포맷 · 스마트폰 뷰 영역 · 망점 스크린톤 엔진
// ============================================================================

export interface CspV5NativeFormatSpec {
  readonly extension: `.${string}`;
  readonly roleName: string;
  readonly category: "canvas" | "management" | "3d-asset" | "tool-action" | "animation";
  readonly description: string;
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Info.plist`
 * (`ev_a17ead8ed3475ba765556bf231b0b05197320b98fafa2e3b36baf55318692b16`)에서 추출한
 * 클립스튜디오 페인트 v5.1.5 15대 핵심 네이티브 파일 확장자 규격.
 */
export const CSP_V5_NATIVE_DOCUMENT_FORMATS: readonly CspV5NativeFormatSpec[] = [
  {
    extension: ".clip",
    roleName: "CLIP STUDIO FORMAT",
    category: "canvas",
    description: "벡터 레이어·말풍선·컷 프레임·3D 레이어를 보존하는 표준 캔버스 포맷",
  },
  {
    extension: ".lip",
    roleName: "CLIP STUDIO PAINT Document (Legacy)",
    category: "canvas",
    description: "초기 클립스튜디오 캔버스 호환 문서 포맷",
  },
  {
    extension: ".cmc",
    roleName: "Page Management File",
    category: "management",
    description: "출판 만화·단행본 다중 페이지 및 제본(3D Bookbinding) 총괄 관리 파일",
  },
  {
    extension: ".csnf",
    roleName: "Name (Storyboard) File",
    category: "management",
    description: "만화·웹툰 네임(콘티) 및 대사 스토리 에디터 연동 파일",
  },
  {
    extension: ".cs3c",
    roleName: "3D Character Material",
    category: "3d-asset",
    description: "관절·체형·표정 조작이 가능한 3D 캐릭터·인체 데생 인형 소재",
  },
  {
    extension: ".cs3o",
    roleName: "3D Object Material",
    category: "3d-asset",
    description: "가동 파츠·조명·카메라 프리셋이 포함된 웹툰 3D 소품·배경 오브젝트",
  },
  {
    extension: ".cs3s",
    roleName: "3D Stage Scene",
    category: "3d-asset",
    description: "다중 3D 배경과 캐릭터 배치를 통합 저장한 3D 스테이지 씬",
  },
  {
    extension: ".pep",
    roleName: "Pose File",
    category: "3d-asset",
    description: "3D 데생 인형 전신·손가락 액션 포즈 데이터",
  },
  {
    extension: ".c2fr",
    roleName: "Character Coordinate File",
    category: "3d-asset",
    description: "캐릭터 의상·체형 코디네이트 프리셋",
  },
  {
    extension: ".c2fc",
    roleName: "Character Face/Body Preset",
    category: "3d-asset",
    description: "캐릭터 얼굴·바디 비례 커스터마이즈 데이터",
  },
  {
    extension: ".sut",
    roleName: "Sub Tool Material",
    category: "tool-action",
    description: "펜·브러시·효과선·말풍선 보조 도구(Sub Tool) 패키지",
  },
  {
    extension: ".sutg",
    roleName: "Sub Tool Group",
    category: "tool-action",
    description: "복수의 브러시·보조 도구를 묶은 서브툴 그룹",
  },
  {
    extension: ".laf",
    roleName: "Auto Action Set",
    category: "tool-action",
    description: "선화 추출·명암 분리·웹툰 후보정 자동화 오토액션 세트",
  },
  {
    extension: ".cls",
    roleName: "Color Set Palette",
    category: "tool-action",
    description: "캐릭터 지정색·웹툰 화풍 컬러 팔레트 세트",
  },
  {
    extension: ".xdts",
    roleName: "Exchange Digital TimeSheet",
    category: "animation",
    description: "디지털 애니메이션 타임시트·익스포저시트 교환 포맷",
  },
] as const;

export interface CspWebtoonViewportAndSlicePlan {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly smartphoneAspectRatio: "9:16" | "9:19.5" | "9:20";
  readonly smartphoneViewportHeightPx: number;
  readonly smartphoneScreenCount: number;
  readonly sliceHeightPx: number;
  readonly slices: readonly {
    readonly sliceIndex: number;
    readonly yStartPx: number;
    readonly yEndPx: number;
    readonly heightPx: number;
    readonly fileName: string;
  }[];
}

/**
 * 클립스튜디오 웹툰 전용 기능인 '스마트폰 표시 영역(View Area) 프리뷰' 및
 * '세로 스크롤 캔버스 균등 분할 내보내기(Sliced Export)' 계산기.
 */
export function calculateCspWebtoonSmartphoneViewportAndSlices(params: {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly smartphoneAspectRatio?: "9:16" | "9:19.5" | "9:20";
  readonly sliceMaxHeightPx?: number;
  readonly episodePrefix?: string;
}): CspWebtoonViewportAndSlicePlan {
  const width = Math.max(320, Math.round(params.canvasWidthPx));
  const height = Math.max(640, Math.round(params.canvasHeightPx));
  const ratio = params.smartphoneAspectRatio ?? "9:19.5";
  const ratioMultiplier = ratio === "9:16" ? 16 / 9 : ratio === "9:20" ? 20 / 9 : 19.5 / 9;

  const smartphoneViewportHeightPx = Math.round(width * ratioMultiplier);
  const smartphoneScreenCount =
    Math.round((height / Math.max(1, smartphoneViewportHeightPx)) * 10) / 10;

  const sliceHeightPx = Math.max(400, Math.round(params.sliceMaxHeightPx ?? 1280));
  const totalSlices = Math.ceil(height / sliceHeightPx);
  const prefix = (params.episodePrefix ?? "episode_01").trim() || "episode_01";

  const slices = Array.from({ length: totalSlices }, (_, idx) => {
    const yStartPx = idx * sliceHeightPx;
    const yEndPx = Math.min(height, (idx + 1) * sliceHeightPx);
    return {
      sliceIndex: idx + 1,
      yStartPx,
      yEndPx,
      heightPx: yEndPx - yStartPx,
      fileName: `${prefix}_slice_${String(idx + 1).padStart(3, "0")}.png`,
    };
  });

  return {
    canvasWidthPx: width,
    canvasHeightPx: height,
    smartphoneAspectRatio: ratio,
    smartphoneViewportHeightPx,
    smartphoneScreenCount,
    sliceHeightPx,
    slices,
  };
}

export type CspScreentoneDotShape = "circle" | "line" | "cross" | "noise";

export interface CspHalftoneScreentoneSpec {
  readonly lpi: number; // 선 수 (Lines Per Inch, 30 ~ 85)
  readonly densityPercent: number; // 농도 (5 ~ 95%)
  readonly angleDeg: number; // 각도 (기본 45°)
  readonly dotShape: CspScreentoneDotShape;
  readonly dotPitchPxAt300Dpi: number;
  readonly dotRadiusPxAt300Dpi: number;
}

/**
 * 클립스튜디오·메디방 페인트의 레이어 망점 스크린톤(Halftone Screentone) 변환 계산기.
 */
export function convertLayerToHalftoneScreentone(params: {
  readonly lpi?: number;
  readonly densityPercent?: number;
  readonly angleDeg?: number;
  readonly dotShape?: CspScreentoneDotShape;
}): CspHalftoneScreentoneSpec {
  const lpi = Math.min(85, Math.max(25, Math.round(params.lpi ?? 60)));
  const densityPercent = Math.min(95, Math.max(5, Math.round(params.densityPercent ?? 35)));
  const angleDeg = Math.min(180, Math.max(0, Math.round(params.angleDeg ?? 45)));
  const dotShape: CspScreentoneDotShape = params.dotShape ?? "circle";

  const dotPitchPxAt300Dpi = Math.round((300 / lpi) * 100) / 100;
  const areaFraction = densityPercent / 100;
  const dotRadiusPxAt300Dpi =
    Math.round(Math.sqrt((dotPitchPxAt300Dpi * dotPitchPxAt300Dpi * areaFraction) / Math.PI) * 100) /
    100;

  return {
    lpi,
    densityPercent,
    angleDeg,
    dotShape,
    dotPitchPxAt300Dpi,
    dotRadiusPxAt300Dpi,
  };
}

// ============================================================================
// 3. 메디방 페인트 & 팔레타 (MediBang Paint / Paletta) 클라우드 협업 & 제스처 엔진
// ============================================================================

export interface MediBangPalettaGestureSpec {
  readonly id: string;
  readonly gesture: string;
  readonly actionLabel: string;
}

export const MEDIBANG_PALETTA_GESTURE_SHORTCUTS: readonly MediBangPalettaGestureSpec[] = [
  { id: "two-finger-tap", gesture: "두 손가락 탭", actionLabel: "실행 취소 (Undo)" },
  { id: "three-finger-tap", gesture: "세 손가락 탭", actionLabel: "다시 실행 (Redo)" },
  { id: "three-finger-swipe", gesture: "세 손가락 스와이프", actionLabel: "팔레타 퀵 메뉴 호출" },
  { id: "one-finger-long-press", gesture: "한 손가락 길게 누르기", actionLabel: "스포이드 색상 추출" },
] as const;

export function evaluateMediBangCloudTeamPageLock(params: {
  readonly pageNumber: number;
  readonly currentUserId: string;
  readonly lockedByUserId: string | null;
  readonly localRevision: number;
  readonly cloudRevision: number;
}): {
  readonly canEdit: boolean;
  readonly conflictDetected: boolean;
  readonly statusMessage: string;
} {
  const conflictDetected = params.localRevision < params.cloudRevision;
  if (params.lockedByUserId && params.lockedByUserId !== params.currentUserId) {
    return {
      canEdit: false,
      conflictDetected,
      statusMessage: `${params.pageNumber}페이지는 팀원(${params.lockedByUserId})이 편집 잠금 중입니다.`,
    };
  }
  if (conflictDetected) {
    return {
      canEdit: false,
      conflictDetected: true,
      statusMessage: `클라우드 최신 버전(v${params.cloudRevision})이 존재합니다. 동기화 후 편집하세요.`,
    };
  }
  return {
    canEdit: true,
    conflictDetected: false,
    statusMessage: `${params.pageNumber}페이지 편집 가능 (Cloud v${params.cloudRevision})`,
  };
}

// ============================================================================
// 4. 캔바 (Canva) 만화 메이커 4컷·인스타툰 템플릿 & 타이포그래피 페어링 프리셋
// ============================================================================

export interface CanvaComicStripTemplateSpec {
  readonly id: string;
  readonly title: string;
  readonly stripFormat: "4-cut-grid" | "4-cut-horizontal" | "card-carousel" | "vertical-cuttoon";
  readonly canvasSizePx: readonly [number, number];
  readonly recommendedTitleFont: string;
  readonly recommendedDialogueFont: string;
  readonly stickerPackTheme: string;
}

export const CANVA_COMIC_STRIP_TEMPLATES: readonly CanvaComicStripTemplateSpec[] = [
  {
    id: "canva-4cut-daily-pastel",
    title: "파스텔 일상 공감 4컷 인스타툰",
    stripFormat: "4-cut-grid",
    canvasSizePx: [1080, 1080],
    recommendedTitleFont: "카페24 써라운드 (Cafe24 Ssurround)",
    recommendedDialogueFont: "나눔스퀘어라운드 (NanumSquareRound)",
    stickerPackTheme: "감정 이모티콘·말풍선 꼬리 스티커 팩",
  },
  {
    id: "canva-4cut-brand-promo",
    title: "브랜드 캠페인 카드형 만화 스트립",
    stripFormat: "card-carousel",
    canvasSizePx: [1080, 1350],
    recommendedTitleFont: "지마켓 산스 Bold (Gmarket Sans)",
    recommendedDialogueFont: "프리텐다드 Medium (Pretendard)",
    stickerPackTheme: "강조 폭발 배지·화살표·효과음 그래픽 팩",
  },
  {
    id: "canva-4cut-edu-strip",
    title: "학교·공공기관 가로 4컷 네비게이션 만화",
    stripFormat: "4-cut-horizontal",
    canvasSizePx: [1920, 640],
    recommendedTitleFont: "에스코어 드림 Heavy (S-Core Dream)",
    recommendedDialogueFont: "고운돋움 (Gowun Dodum)",
    stickerPackTheme: "칠판·체크리스트·말풍선 캡션 팩",
  },
] as const;
