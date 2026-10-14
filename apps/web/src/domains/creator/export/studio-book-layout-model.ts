/**
 * studio-book-layout-model.ts — 단행본(인쇄본) 조판 지면 모델 (순수 모듈)
 *
 * 웹툰 회차를 인쇄 단행본으로 만들 때의 지면 계산만 책임진다. 판형 프리셋을 고르면
 * 재단(Trim)·도련(Bleed)·안전 영역 박스를 mm→pt로 환산해 PDF 출력 단계
 * (studio-book-pdf-export.ts)가 그대로 쓸 수치를 만들고, 안전 영역을 벗어난
 * 요소를 경고로 판정한다. DOM·캔버스를 만지지 않는다.
 *
 * 단위·좌표 규약:
 * - 스펙 입력은 mm, 출력 박스는 PDF pt (1pt = 1/72in, 1in = 25.4mm), 원점은 지면 좌하단(PDF 관례).
 * - 요소 rect는 반대로 작가 좌표(재단 좌상단 원점, x→오른쪽, y→아래, mm)로 받는다 —
 *   에디터가 요소를 배치하는 좌표와 같아야 경고 위치가 곧바로 이해되기 때문이다.
 *
 * 초안(artcraft-features 트랙)과의 차이 — 실측·검증으로 고친 것:
 * - 제본(gutter) 여백이 좌/우 페이지에서 거꾸로 붙어 있던 결함을 바로잡았다. 제본은
 *   펼침의 안쪽이므로 오른쪽 페이지(홀수면)에서는 왼쪽, 왼쪽 페이지에서는 오른쪽에 붙는다.
 * - 스펙 검증이 없어 안전 여백이 판형보다 크면 음수 폭 박스가 조용히 나오던 문제를 막았다.
 */

export const MM_TO_PT = 72 / 25.4;

export type BookPageSide = "left" | "right" | "single";

export interface BookTrimSpec {
  /** 재단 폭/높이 (mm). 예: 신국판 152×225, B6 128×182. */
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  /** 도련 (mm). 보통 3. */
  readonly bleedMm: number;
  /** 안쪽(제본) 여백 추가분 (mm). 펼침에서만 쓴다. */
  readonly gutterMm: number;
  /** 안전 여백 (mm) — 본문·말풍선이 재단선에서 떨어질 최소 거리. */
  readonly safeMarginMm: number;
}

export interface PdfBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BookPageBoxes {
  /** 재단 박스 (= PDF TrimBox, 마크 여유가 없을 때 기준). */
  readonly trim: PdfBox;
  /** 도련 포함 박스 (= PDF BleedBox). */
  readonly bleed: PdfBox;
  /** 실제 페이지 크기 (= PDF MediaBox). 도련 포함 전체 — 재단 마크 여유는 빌더가 더한다. */
  readonly media: PdfBox;
  /** 안전 영역 (본문·말풍선 같은 중요 요소가 들어가야 할 자리). */
  readonly safe: PdfBox;
}

function mm(value: number): number {
  return value * MM_TO_PT;
}

/**
 * 스펙 문제 목록 — 빈 배열이면 유효하다. UI는 목록을 그대로 안내에 쓰고,
 * 계산 함수는 첫 문제로 throw 해 음수 박스 같은 조용한 깨짐을 막는다.
 */
export function validateBookTrimSpec(spec: BookTrimSpec): string[] {
  const problems: string[] = [];
  const fields: Array<[string, number]> = [
    ["재단 폭", spec.trimWidthMm],
    ["재단 높이", spec.trimHeightMm],
    ["도련", spec.bleedMm],
    ["제본 여백", spec.gutterMm],
    ["안전 여백", spec.safeMarginMm],
  ];
  for (const [label, value] of fields) {
    if (!Number.isFinite(value)) problems.push(`${label} 값이 올바르지 않아요.`);
  }
  if (problems.length > 0) return problems;
  if (spec.trimWidthMm <= 0 || spec.trimHeightMm <= 0) {
    problems.push("재단 크기는 0보다 커야 해요.");
  }
  if (spec.bleedMm < 0 || spec.bleedMm > 25) problems.push("도련은 0~25mm 사이로 지정해주세요.");
  if (spec.gutterMm < 0 || spec.gutterMm > 50) problems.push("제본 여백은 0~50mm 사이로 지정해주세요.");
  if (spec.safeMarginMm < 0) problems.push("안전 여백은 0mm 이상이어야 해요.");
  // 안전 영역은 제본 여백까지 합쳐도 재단 안에 남아야 한다.
  if (spec.safeMarginMm * 2 + spec.gutterMm >= spec.trimWidthMm) {
    problems.push("안전 여백과 제본 여백이 너무 커서 안전 영역이 남아 있지 않아요.");
  }
  if (spec.safeMarginMm * 2 >= spec.trimHeightMm) {
    problems.push("안전 여백이 너무 커서 안전 영역이 남아 있지 않아요.");
  }
  return problems;
}

function assertValidSpec(spec: BookTrimSpec): void {
  const problems = validateBookTrimSpec(spec);
  if (problems.length > 0) throw new Error(problems[0]);
}

/** 안전 여백(mm) — 면(side) 기준 좌/우 안쪽 간격. 제본 여백은 펼침의 안쪽에만 붙는다. */
export function bookSafeInsetsMm(
  spec: BookTrimSpec,
  side: BookPageSide
): { left: number; right: number; top: number; bottom: number } {
  assertValidSpec(spec);
  const gutter = side === "single" ? 0 : spec.gutterMm;
  return {
    // 오른쪽 페이지(홀수면)의 제본은 왼쪽, 왼쪽 페이지(짝수면)의 제본은 오른쪽이다.
    left: spec.safeMarginMm + (side === "right" ? gutter : 0),
    right: spec.safeMarginMm + (side === "left" ? gutter : 0),
    top: spec.safeMarginMm,
    bottom: spec.safeMarginMm,
  };
}

/** 단면 페이지의 박스 집합. 원점은 지면 좌하단(PDF 관례). */
export function computeBookPageBoxes(spec: BookTrimSpec, side: BookPageSide): BookPageBoxes {
  assertValidSpec(spec);
  const bleed = spec.bleedMm;
  const mediaW = spec.trimWidthMm + bleed * 2;
  const mediaH = spec.trimHeightMm + bleed * 2;
  const insets = bookSafeInsetsMm(spec, side);
  return {
    media: { x: 0, y: 0, width: mm(mediaW), height: mm(mediaH) },
    bleed: { x: 0, y: 0, width: mm(mediaW), height: mm(mediaH) },
    trim: { x: mm(bleed), y: mm(bleed), width: mm(spec.trimWidthMm), height: mm(spec.trimHeightMm) },
    safe: {
      x: mm(bleed + insets.left),
      // PDF 좌표는 아래에서 위로 — 위쪽 안전 여백은 높이에서 뺀 위치가 아니라 아래 여백 기준이다.
      y: mm(bleed + insets.bottom),
      width: mm(spec.trimWidthMm - insets.left - insets.right),
      height: mm(spec.trimHeightMm - insets.top - insets.bottom),
    },
  };
}

/** 펼침(스프레드) 전체 폭 — 좌우 재단 + 중앙 제본. 도련은 바깥쪽만. */
export function computeSpreadMediaBox(spec: BookTrimSpec): PdfBox {
  assertValidSpec(spec);
  const widthMm = spec.trimWidthMm * 2 + spec.bleedMm * 2;
  const heightMm = spec.trimHeightMm + spec.bleedMm * 2;
  return { x: 0, y: 0, width: mm(widthMm), height: mm(heightMm) };
}

/** 자주 쓰는 판형 프리셋. */
export const BOOK_TRIM_PRESETS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly spec: BookTrimSpec;
}> = [
  {
    id: "shingukpan",
    label: "신국판 (152×225)",
    spec: { trimWidthMm: 152, trimHeightMm: 225, bleedMm: 3, gutterMm: 5, safeMarginMm: 12 },
  },
  {
    id: "b6",
    label: "B6 (128×182)",
    spec: { trimWidthMm: 128, trimHeightMm: 182, bleedMm: 3, gutterMm: 4, safeMarginMm: 10 },
  },
  {
    id: "a5",
    label: "A5 (148×210)",
    spec: { trimWidthMm: 148, trimHeightMm: 210, bleedMm: 3, gutterMm: 5, safeMarginMm: 11 },
  },
];

/** 프리셋 id 조회 — 없으면 undefined (호출자가 기본 프리셋으로 폴백할지 정한다). */
export function findBookTrimPreset(id: string): (typeof BOOK_TRIM_PRESETS)[number] | undefined {
  return BOOK_TRIM_PRESETS.find((preset) => preset.id === id);
}

/** 0-based 페이지 인덱스 → 면. 첫 페이지는 보통 오른쪽(홀수면)이다. */
export function resolveBookPageSide(
  pageIndex: number,
  firstPageSide: "left" | "right" = "right"
): BookPageSide {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("페이지 번호가 올바르지 않아요.");
  }
  if (pageIndex % 2 === 0) return firstPageSide;
  return firstPageSide === "right" ? "left" : "right";
}

/**
 * 도련까지 포함한 페이지 캔버스 픽셀 크기 — 렌더러가 이 크기로 페이지를 만들면
 * 빌더가 확대 없이 도련 박스에 정확히 얹는다.
 */
export function bookPagePixelSize(
  spec: BookTrimSpec,
  dpi: number
): { width: number; height: number } {
  assertValidSpec(spec);
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 1200) {
    throw new Error("인쇄 해상도는 72~1200dpi 사이로 지정해주세요.");
  }
  const px = (mmValue: number): number => Math.round((mmValue * dpi) / 25.4);
  return {
    width: px(spec.trimWidthMm + spec.bleedMm * 2),
    height: px(spec.trimHeightMm + spec.bleedMm * 2),
  };
}

/** 스펙 한 줄 요약 — 상태 표시·파일 안내 공용. */
export function describeBookTrimSpec(spec: BookTrimSpec): string {
  return (
    `${spec.trimWidthMm}×${spec.trimHeightMm}mm · 도련 ${spec.bleedMm}mm · ` +
    `안전 여백 ${spec.safeMarginMm}mm`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 안전 영역 검사 — 요소(작가 좌표, 재단 좌상단 원점·mm)가 안전 영역을 벗어나면 경고.
// ─────────────────────────────────────────────────────────────────────────────

export interface BookElementRectMm {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type BookElementKind = "text" | "balloon" | "image" | "art" | "other";

export interface BookLayoutElement {
  readonly id: string;
  /** 사용자 표시 이름 — 없으면 id를 안내에 쓴다. */
  readonly label?: string;
  /**
   * art = 면 전체를 채우는 배경 그림. 안전 영역이 아니라 도련 도달 여부로 판정한다.
   * 그 외 종류는 중요 요소로 보고 안전 영역을 벗어나면 경고한다.
   */
  readonly kind?: BookElementKind;
  readonly rect: BookElementRectMm;
}

export type BookSafeAreaWarningCode = "outside-safe" | "outside-trim" | "bleed-gap";

export interface BookSafeAreaWarning {
  readonly elementId: string;
  readonly label: string;
  readonly code: BookSafeAreaWarningCode;
  readonly message: string;
  /** 가장 크게 벗어난 양(mm, 소수 1자리). */
  readonly overflowMm: number;
}

const EPS_MM = 0.05;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 한 페이지의 요소들을 안전 영역과 대조한다.
 * - 중요 요소(text·balloon·image·other)가 안전 박스를 벗어나면 outside-safe.
 * - 재단 자체를 완전히 벗어나면 outside-trim (종이에 찍히지 않는다).
 * - 배경 그림(art)이 재단선에 닿는데 도련 끝까지 닿지 않으면 bleed-gap —
 *   재단 오차만큼 흰 테두리가 생길 수 있는 자리다.
 */
export function checkBookPageElements(
  spec: BookTrimSpec,
  side: BookPageSide,
  elements: readonly BookLayoutElement[]
): BookSafeAreaWarning[] {
  assertValidSpec(spec);
  const insets = bookSafeInsetsMm(spec, side);
  const safeLeft = insets.left;
  const safeRight = spec.trimWidthMm - insets.right;
  const safeTop = insets.top;
  const safeBottom = spec.trimHeightMm - insets.bottom;
  const bleed = spec.bleedMm;
  const warnings: BookSafeAreaWarning[] = [];

  for (const element of elements) {
    const label = element.label?.trim() || element.id;
    const { x, y, width, height } = element.rect;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      warnings.push({
        elementId: element.id,
        label,
        code: "outside-trim",
        message: `「${label}」의 크기가 올바르지 않아 인쇄 위치를 확인할 수 없어요.`,
        overflowMm: 0,
      });
      continue;
    }
    const right = x + width;
    const bottom = y + height;
    // 재단과 전혀 겹치지 않으면 종이에 아무것도 찍히지 않는다.
    if (right <= 0 || bottom <= 0 || x >= spec.trimWidthMm || y >= spec.trimHeightMm) {
      warnings.push({
        elementId: element.id,
        label,
        code: "outside-trim",
        message: `「${label}」이 재단 영역 밖에 있어 인쇄되지 않아요.`,
        overflowMm: round1(
          Math.max(-right, -bottom, x - spec.trimWidthMm, y - spec.trimHeightMm, 0)
        ),
      });
      continue;
    }
    if (element.kind === "art") {
      // 닿은 변마다 도련 끝(-bleed / trim+bleed)까지 닿았는지 본다.
      const gaps: number[] = [];
      if (x <= EPS_MM) gaps.push(x + bleed);
      if (y <= EPS_MM) gaps.push(y + bleed);
      if (right >= spec.trimWidthMm - EPS_MM) gaps.push(bleed - (right - spec.trimWidthMm));
      if (bottom >= spec.trimHeightMm - EPS_MM) gaps.push(bleed - (bottom - spec.trimHeightMm));
      const worstGap = gaps.length > 0 ? Math.max(...gaps) : 0;
      if (worstGap > EPS_MM) {
        warnings.push({
          elementId: element.id,
          label,
          code: "bleed-gap",
          message:
            `「${label}」이 재단선에 닿지만 도련(${bleed}mm) 끝까지 닿지 않아 ` +
            `재단 오차만큼 흰 테두리가 생길 수 있어요.`,
          overflowMm: round1(worstGap),
        });
      }
      continue;
    }
    const overflow = Math.max(
      safeLeft - x,
      right - safeRight,
      safeTop - y,
      bottom - safeBottom,
      0
    );
    if (overflow > EPS_MM) {
      warnings.push({
        elementId: element.id,
        label,
        code: "outside-safe",
        message:
          `「${label}」이 안전 영역을 ${round1(overflow)}mm 벗어났어요 — ` +
          `재단·제본 과정에서 잘리거나 읽기 어려워질 수 있어요.`,
        overflowMm: round1(overflow),
      });
    }
  }
  return warnings;
}
