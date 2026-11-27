/**
 * Wave 49: 375px 모바일 실화면 가독성·대비·컷 경계 침범·슬라이스 절단선 충돌 감사기.
 *
 * - 모바일 표준 폭(`375px`) 축소 배율 기준으로 모든 말풍선 대사의 실측 렌더링 폰트 크기를 계산해
 *   `11.5px` 미만은 경고(`warn`), `9.5px` 미만은 출고 차단(`block`)으로 판정한다.
 * - 말풍선-컷 프레임 경계 침범, WCAG 2.1 명도 대비(`>= 4.5:1`), 슬라이스 절단선 걸림 여부를
 *   전수 검사하고 `suggestedFontPx`, `safeSliceY`, `suggestedTextColor` 자동 보정값을 제시한다.
 */

export const DEFAULT_MOBILE_VIEWPORT_WIDTH_PX = 375 as const;
export const MOBILE_FONT_WARN_THRESHOLD_PX = 11.5 as const;
export const MOBILE_FONT_BLOCK_THRESHOLD_PX = 9.5 as const;
export const DEFAULT_TARGET_MOBILE_FONT_PX = 12.0 as const;
export const WCAG_AA_MIN_CONTRAST_RATIO = 4.5 as const;

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelCutFrame {
  readonly cutId: string;
  readonly bounds: RectBounds;
}

export interface SpeechBubbleAuditTarget {
  readonly bubbleId: string;
  readonly cutId?: string;
  readonly textPreview: string;
  readonly fontSizePx: number;
  readonly bounds: RectBounds;
  readonly textBounds?: RectBounds;
  readonly textColor: RgbColor;
  readonly backgroundColor: RgbColor;
  readonly allowPanelBleed?: boolean;
}

export interface MobileReadabilityAuditInput {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly mobileViewportWidthPx?: number;
  readonly targetMobileFontPx?: number;
  readonly minContrastRatio?: number;
  readonly panelFrames: readonly PanelCutFrame[];
  readonly bubbles: readonly SpeechBubbleAuditTarget[];
  readonly sliceYPositions: readonly number[];
  readonly seamAvoidPaddingPx?: number;
  readonly maxSliceHeightPx?: number;
}

export type MobileAuditSeverity = "block" | "warn";
export type MobileAuditIssueCode =
  | "mobile-font-blocked"
  | "mobile-font-warning"
  | "bubble-cut-boundary-intrusion"
  | "dialogue-contrast-low"
  | "slice-seam-cuts-bubble";

export interface MobileAuditIssue {
  readonly code: MobileAuditIssueCode;
  readonly severity: MobileAuditSeverity;
  readonly bubbleId: string;
  readonly messageKo: string;
  readonly suggestedFontPx?: number;
  readonly safeSliceY?: number;
  readonly suggestedTextColor?: RgbColor;
}

export interface BoundaryIntrusionSides {
  readonly leftPx: number;
  readonly rightPx: number;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly maxIntrusionPx: number;
}

export interface BubbleReadabilityMetric {
  readonly bubbleId: string;
  readonly cutId: string | null;
  readonly canvasFontPx: number;
  readonly effectiveMobilePx: number;
  readonly fontStatus: "pass" | "warn" | "block";
  readonly suggestedFontPx: number | null;
  readonly contrastRatio: number;
  readonly wcagPass: boolean;
  readonly suggestedTextColor: RgbColor | null;
  readonly boundaryIntrusion: BoundaryIntrusionSides | null;
  readonly collidingSliceYs: readonly number[];
}

export interface SliceSeamFixSuggestion {
  readonly originalSliceY: number;
  readonly safeSliceY: number | null;
  readonly deltaPx: number | null;
  readonly collidingBubbleIds: readonly string[];
  readonly reasonKo: string;
}

export interface MobileReadabilityAuditReport {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly mobileViewportWidthPx: number;
  readonly scaleRatio: number;
  readonly canShip: boolean;
  readonly blockCount: number;
  readonly warningCount: number;
  readonly bubbleMetrics: readonly BubbleReadabilityMetric[];
  readonly seamFixes: readonly SliceSeamFixSuggestion[];
  readonly issues: readonly MobileAuditIssue[];
  readonly summaryKo: string;
}

const DARK_INK_FALLBACK: RgbColor = { r: 18, g: 20, b: 24 };
const LIGHT_INK_FALLBACK: RgbColor = { r: 250, g: 250, b: 252 };

function srgbToRelativeLuminance(color: RgbColor): number {
  const toLinear = (raw: number): number => {
    const s = (Number.isFinite(raw) ? Math.min(255, Math.max(0, raw)) : 0) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

/** WCAG 2.1 상대 휘도 공식으로 전경·배경 명도 대비율(1.0~21.0)을 산출한다. */
export function computeWcagContrastRatio(foreground: RgbColor, background: RgbColor): number {
  const l1 = srgbToRelativeLuminance(foreground);
  const l2 = srgbToRelativeLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 배경색에 대해 더 높은 WCAG 대비를 확보하는 권장 대사 색상을 고른다. */
export function suggestAccessibleTextColor(background: RgbColor): RgbColor {
  return computeWcagContrastRatio(DARK_INK_FALLBACK, background) >=
    computeWcagContrastRatio(LIGHT_INK_FALLBACK, background)
    ? DARK_INK_FALLBACK
    : LIGHT_INK_FALLBACK;
}

/** 캔버스 폰트 크기를 모바일 실화면(`375px` 기본) 축소 배율 기준 픽셀로 환산한다. */
export function computeEffectiveMobileFontPx(
  canvasFontPx: number,
  canvasWidthPx: number,
  mobileViewportWidthPx: number = DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
): number {
  if (!Number.isFinite(canvasFontPx) || canvasFontPx <= 0) return 0;
  if (!Number.isFinite(canvasWidthPx) || canvasWidthPx <= 0) return 0;
  const viewport =
    Number.isFinite(mobileViewportWidthPx) && mobileViewportWidthPx > 0
      ? mobileViewportWidthPx
      : DEFAULT_MOBILE_VIEWPORT_WIDTH_PX;
  return canvasFontPx * (viewport / canvasWidthPx);
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveAssociatedPanel(
  bubble: SpeechBubbleAuditTarget,
  panels: readonly PanelCutFrame[],
): PanelCutFrame | null {
  if (bubble.cutId) {
    const matched = panels.find((panel) => panel.cutId === bubble.cutId);
    if (matched) return matched;
  }
  let bestPanel: PanelCutFrame | null = null;
  let bestArea = 0;
  for (const panel of panels) {
    const a = bubble.bounds;
    const b = panel.bounds;
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const area = overlapX * overlapY;
    if (area > bestArea) {
      bestArea = area;
      bestPanel = panel;
    }
  }
  return bestPanel;
}

function measureIntrusion(inner: RectBounds, panel: RectBounds): BoundaryIntrusionSides {
  const leftPx = Math.max(0, panel.x - inner.x);
  const rightPx = Math.max(0, inner.x + inner.width - (panel.x + panel.width));
  const topPx = Math.max(0, panel.y - inner.y);
  const bottomPx = Math.max(0, inner.y + inner.height - (panel.y + panel.height));
  return {
    leftPx: roundTwo(leftPx), rightPx: roundTwo(rightPx),
    topPx: roundTwo(topPx), bottomPx: roundTwo(bottomPx),
    maxIntrusionPx: roundTwo(Math.max(leftPx, rightPx, topPx, bottomPx)),
  };
}

function findSafeSliceY(
  originalY: number,
  prevSliceY: number,
  nextSliceY: number,
  canvasHeightPx: number,
  bubbles: readonly SpeechBubbleAuditTarget[],
  paddingPx: number,
  maxSliceHeightPx: number | undefined,
): number | null {
  const minAllowed = Math.max(1, Math.floor(prevSliceY) + 1);
  const upperFromMax = maxSliceHeightPx && maxSliceHeightPx > 0
    ? Math.floor(prevSliceY + maxSliceHeightPx)
    : canvasHeightPx - 1;
  const maxAllowed = Math.min(canvasHeightPx - 1, Math.ceil(nextSliceY) - 1, upperFromMax);
  if (minAllowed > maxAllowed) return null;

  const blocked = bubbles.map((b) => ({
    top: b.bounds.y - paddingPx, bottom: b.bounds.y + b.bounds.height + paddingPx,
  }));
  const isSafe = (y: number): boolean =>
    y >= minAllowed && y <= maxAllowed && blocked.every((iv) => y <= iv.top || y >= iv.bottom);

  const candidates = new Set<number>([minAllowed, maxAllowed]);
  for (const iv of blocked) {
    const above = Math.floor(iv.top);
    const below = Math.ceil(iv.bottom);
    if (above >= minAllowed && above <= maxAllowed) candidates.add(above);
    if (below >= minAllowed && below <= maxAllowed) candidates.add(below);
  }

  let bestY: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const y of candidates) {
    if (!isSafe(y)) continue;
    const dist = Math.abs(y - originalY);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = y;
    }
  }
  return bestY;
}

/** 375px 모바일 가독성, WCAG 명도 대비, 컷 경계 침범, 슬라이스 절단선 충돌을 전수 감사한다. */
export function auditMobileReadabilityAndCutSeams(
  input: MobileReadabilityAuditInput,
): MobileReadabilityAuditReport {
  const mobileViewportWidthPx =
    input.mobileViewportWidthPx && input.mobileViewportWidthPx > 0
      ? input.mobileViewportWidthPx
      : DEFAULT_MOBILE_VIEWPORT_WIDTH_PX;
  const canvasWidthPx = Math.max(1, input.canvasWidthPx);
  const canvasHeightPx = Math.max(1, input.canvasHeightPx);
  const scaleRatio = mobileViewportWidthPx / canvasWidthPx;
  const targetMobileFontPx = Math.max(
    MOBILE_FONT_WARN_THRESHOLD_PX,
    input.targetMobileFontPx ?? DEFAULT_TARGET_MOBILE_FONT_PX,
  );
  const minContrastRatio = input.minContrastRatio ?? WCAG_AA_MIN_CONTRAST_RATIO;
  const seamAvoidPaddingPx = Math.max(0, input.seamAvoidPaddingPx ?? 8);

  const sortedSlices = [...input.sliceYPositions]
    .filter((y) => Number.isFinite(y) && y > 0 && y < canvasHeightPx)
    .sort((a, b) => a - b);

  const issues: MobileAuditIssue[] = [];
  const bubbleMetrics: BubbleReadabilityMetric[] = [];
  const seamFixByY = new Map<number, SliceSeamFixSuggestion>();

  for (let i = 0; i < sortedSlices.length; i += 1) {
    const sliceY = sortedSlices[i];
    if (sliceY === undefined) continue;
    const colliding = input.bubbles.filter(
      (b) => sliceY > b.bounds.y && sliceY < b.bounds.y + b.bounds.height,
    );
    if (colliding.length === 0) continue;

    const prevY = i > 0 ? (sortedSlices[i - 1] ?? 0) : 0;
    const nextY = sortedSlices[i + 1] ?? canvasHeightPx;
    const safeSliceY = findSafeSliceY(
      sliceY, prevY, nextY, canvasHeightPx, input.bubbles, seamAvoidPaddingPx, input.maxSliceHeightPx,
    );
    seamFixByY.set(sliceY, {
      originalSliceY: sliceY,
      safeSliceY,
      deltaPx: safeSliceY !== null ? safeSliceY - sliceY : null,
      collidingBubbleIds: colliding.map((b) => b.bubbleId),
      reasonKo: safeSliceY !== null
        ? `절단선(${sliceY}px)이 말풍선 ${colliding.length}개와 겹쳐 ${safeSliceY}px로 이동을 권장합니다.`
        : `절단선(${sliceY}px) 근처에 빈 구간이 없어 말풍선 배치 조정이 필요합니다.`,
    });
  }

  for (const bubble of input.bubbles) {
    const effectiveMobilePx = roundTwo(
      computeEffectiveMobileFontPx(bubble.fontSizePx, canvasWidthPx, mobileViewportWidthPx),
    );
    const suggestedFontPx = effectiveMobilePx < MOBILE_FONT_WARN_THRESHOLD_PX
      ? Math.ceil(targetMobileFontPx / scaleRatio)
      : null;

    let fontStatus: "pass" | "warn" | "block" = "pass";
    if (effectiveMobilePx < MOBILE_FONT_BLOCK_THRESHOLD_PX) {
      fontStatus = "block";
      issues.push({
        code: "mobile-font-blocked", severity: "block", bubbleId: bubble.bubbleId,
        suggestedFontPx: suggestedFontPx ?? undefined,
        messageKo: `모바일(${mobileViewportWidthPx}px) 실측 글자 크기가 ${effectiveMobilePx}px로 차단 기준(${MOBILE_FONT_BLOCK_THRESHOLD_PX}px) 미만입니다. 원고 글꼴을 ${suggestedFontPx}px 이상으로 키우세요.`,
      });
    } else if (effectiveMobilePx < MOBILE_FONT_WARN_THRESHOLD_PX) {
      fontStatus = "warn";
      issues.push({
        code: "mobile-font-warning", severity: "warn", bubbleId: bubble.bubbleId,
        suggestedFontPx: suggestedFontPx ?? undefined,
        messageKo: `모바일(${mobileViewportWidthPx}px) 실측 글자 크기가 ${effectiveMobilePx}px로 권장 하한(${MOBILE_FONT_WARN_THRESHOLD_PX}px) 미만입니다. ${suggestedFontPx}px 이상을 권장합니다.`,
      });
    }

    const contrastRatio = roundTwo(computeWcagContrastRatio(bubble.textColor, bubble.backgroundColor));
    const wcagPass = contrastRatio >= minContrastRatio;
    const suggestedTextColor = wcagPass ? null : suggestAccessibleTextColor(bubble.backgroundColor);
    if (!wcagPass) {
      issues.push({
        code: "dialogue-contrast-low", severity: "block", bubbleId: bubble.bubbleId,
        suggestedTextColor: suggestedTextColor ?? undefined,
        messageKo: `대사 명도 대비가 ${contrastRatio}:1로 WCAG 기준(${minContrastRatio}:1)에 미달합니다.`,
      });
    }

    let boundaryIntrusion: BoundaryIntrusionSides | null = null;
    const panel = resolveAssociatedPanel(bubble, input.panelFrames);
    if (panel && !bubble.allowPanelBleed) {
      const outer = measureIntrusion(bubble.bounds, panel.bounds);
      if (outer.maxIntrusionPx > 0) {
        boundaryIntrusion = outer;
        const inner = bubble.textBounds ? measureIntrusion(bubble.textBounds, panel.bounds) : outer;
        const severity: MobileAuditSeverity = inner.maxIntrusionPx > 0 ? "block" : "warn";
        issues.push({
          code: "bubble-cut-boundary-intrusion", severity, bubbleId: bubble.bubbleId,
          messageKo: severity === "block"
            ? `말풍선 대사 영역이 컷(${panel.cutId}) 경계를 최대 ${inner.maxIntrusionPx}px 벗어났습니다.`
            : `말풍선 외곽이 컷(${panel.cutId}) 경계를 최대 ${outer.maxIntrusionPx}px 침범했습니다.`,
        });
      }
    }

    const collidingSliceYs: number[] = [];
    for (const sliceY of sortedSlices) {
      if (sliceY > bubble.bounds.y && sliceY < bubble.bounds.y + bubble.bounds.height) {
        collidingSliceYs.push(sliceY);
        const fix = seamFixByY.get(sliceY);
        issues.push({
          code: "slice-seam-cuts-bubble", severity: "block", bubbleId: bubble.bubbleId,
          safeSliceY: fix?.safeSliceY ?? undefined,
          messageKo: fix && fix.safeSliceY !== null
            ? `슬라이스 절단선(${sliceY}px)이 말풍선을 가로지릅니다. 절단선을 ${fix.safeSliceY}px로 옮기세요.`
            : `슬라이스 절단선(${sliceY}px)이 말풍선을 가로지릅니다. 말풍선 위치를 조정하세요.`,
        });
      }
    }

    bubbleMetrics.push({
      bubbleId: bubble.bubbleId, cutId: panel?.cutId ?? bubble.cutId ?? null,
      canvasFontPx: bubble.fontSizePx, effectiveMobilePx, fontStatus, suggestedFontPx,
      contrastRatio, wcagPass, suggestedTextColor, boundaryIntrusion, collidingSliceYs,
    });
  }

  const blockCount = issues.filter((i) => i.severity === "block").length;
  const warningCount = issues.length - blockCount;
  const canShip = blockCount === 0;
  return {
    canvasWidthPx, canvasHeightPx, mobileViewportWidthPx,
    scaleRatio: roundTwo(scaleRatio * 1000) / 1000,
    canShip, blockCount, warningCount, bubbleMetrics,
    seamFixes: [...seamFixByY.values()], issues,
    summaryKo: canShip
      ? warningCount === 0
        ? `말풍선 ${input.bubbles.length}개 전수 통과 — 모바일 가독성과 절단선 모두 안전합니다.`
        : `출고 가능 (경고 ${warningCount}건) — 권장 폰트 크기 또는 여백을 점검해 주세요.`
      : `출고 차단 ${blockCount}건·경고 ${warningCount}건 — 제시된 권장 폰트와 안전 절단선으로 보정하세요.`,
  };
}
