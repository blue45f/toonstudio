/**
 * CSP 톤 무늬 이동(Move tone pattern, var 543) 및 톤 영역 표시(View > Show tone area, viewtonearea*) 워크플로.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 회전 스크린 격자 주기 P = dpi / lpi 계산 및 유클리드 모듈로 [0, P) 위상 래핑으로
 *   장거리 드래그에도 부동소수점 정밀도 손실 없이 망점 위상을 유지한다.
 * - 페이지 내 스크린톤·하프톤·패턴 요소를 수집해 반투명 QA 틴트 오버레이 기술자를 만들고,
 *   겹치는 두 톤의 LPI·각도 충돌(모아레 위험)을 사전에 감지한다.
 */

import type { El } from "../studio-element-model";
import type { HalftonePattern } from "../studio-halftone";

export interface StudioTonePatternState {
  /** 망점 선수 (Lines Per Inch, 5..200, 기본 60). */
  readonly lpi: number;
  /** 기준 인쇄 해상도 (Dots Per Inch, 72..2400, 기본 600). */
  readonly dpi: number;
  /** 스크린 회전 각도 (도, 0..180, 기본 45). */
  readonly angleDeg: number;
  /** 망점 농도 (0..100%, 기본 30). */
  readonly densityPercent: number;
  readonly pattern: HalftonePattern;
  /** 회전 격자 u축 위상 오프셋 (0 <= patternOffsetX < periodPx). */
  readonly patternOffsetX: number;
  /** 회전 격자 v축 위상 오프셋 (0 <= patternOffsetY < periodPx). */
  readonly patternOffsetY: number;
  /** 단일 망점 셀 주기(px = dpi / lpi). */
  readonly periodPx: number;
}

export interface StudioToneAreaOverlayOptions {
  readonly enabled?: boolean;
  /** QA 오버레이 강조 색상(#RRGGBB, 기본 "#00b4ff" 시안). */
  readonly tintHex?: string;
  /** QA 오버레이 불투명도(0.05..0.9, 기본 0.35). */
  readonly opacity?: number;
  /** 모아레 위험 각도 차이 임계값(도, 기본 15°). */
  readonly moireAngleThresholdDeg?: number;
}

export interface StudioToneAreaRegionDescriptor {
  readonly elementId: string;
  readonly sourceKind: "screentone-image" | "halftone-image" | "pattern-draw";
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly clipFrameId?: string;
  readonly lpi: number;
  readonly angleDeg: number;
  readonly tintHex: string;
  readonly tintOpacity: number;
  readonly tintRgba: string;
  readonly label: string;
}

export interface StudioToneMoireWarning {
  readonly firstElementId: string;
  readonly secondElementId: string;
  readonly reason: "angle-too-close" | "lpi-mismatch-overlap";
  readonly message: string;
}

export interface StudioToneAreaQaOverlayPlan {
  readonly enabled: boolean;
  readonly tintHex: string;
  readonly opacity: number;
  readonly regions: readonly StudioToneAreaRegionDescriptor[];
  readonly moireWarnings: readonly StudioToneMoireWarning[];
}

export const DEFAULT_STUDIO_TONE_PATTERN_STATE: StudioTonePatternState = Object.freeze({
  lpi: 60,
  dpi: 600,
  angleDeg: 45,
  densityPercent: 30,
  pattern: "circle",
  patternOffsetX: 0,
  patternOffsetY: 0,
  periodPx: 10,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 음수 입력에서도 항상 [0, period) 범위를 반환하는 유클리드 모듈로. */
export function wrapTonePeriodOffset(offsetPx: number, periodPx: number): number {
  const safePeriod = Math.max(0.5, Number.isFinite(periodPx) ? periodPx : 10);
  if (!Number.isFinite(offsetPx)) return 0;
  const mod = ((offsetPx % safePeriod) + safePeriod) % safePeriod;
  // 부동소수점 경계(예: 9.999999999999998 -> 10 -> 0) 안정화
  return Math.abs(mod - safePeriod) < 1e-9 ? 0 : Math.round(mod * 10000) / 10000;
}

/** 목표 DPI와 망점 선수(LPI)로부터 망점 격자 1주기 픽셀 길이를 계산한다. */
export function computeToneCellPeriodPx(lpi: number, dpi = 600): number {
  const safeLpi = clamp(lpi, 5, 200);
  const safeDpi = clamp(dpi, 72, 2400);
  return Math.round((safeDpi / safeLpi) * 10000) / 10000;
}

export function normalizeTonePatternState(
  raw: Partial<StudioTonePatternState> | null | undefined,
): StudioTonePatternState {
  const src = raw ?? {};
  const lpi = clamp(src.lpi ?? DEFAULT_STUDIO_TONE_PATTERN_STATE.lpi, 5, 200);
  const dpi = clamp(src.dpi ?? DEFAULT_STUDIO_TONE_PATTERN_STATE.dpi, 72, 2400);
  const angleDeg = ((clamp(src.angleDeg ?? 45, -360, 360) % 180) + 180) % 180;
  const densityPercent = clamp(src.densityPercent ?? 30, 0, 100);
  const pattern: HalftonePattern = src.pattern ?? "circle";
  const periodPx = computeToneCellPeriodPx(lpi, dpi);

  return {
    lpi,
    dpi,
    angleDeg,
    densityPercent,
    pattern,
    patternOffsetX: wrapTonePeriodOffset(src.patternOffsetX ?? 0, periodPx),
    patternOffsetY: wrapTonePeriodOffset(src.patternOffsetY ?? 0, periodPx),
    periodPx,
  };
}

/**
 * CSP Move tone pattern (var 543) — 캔버스 드래그 변위(deltaCanvasX, deltaCanvasY)를
 * 회전된 스크린 격자 축(u, v)으로 정사영한 뒤 주기 [0, periodPx)로 래핑한다.
 */
export function moveTonePatternOffset(
  state: StudioTonePatternState,
  deltaCanvasX: number,
  deltaCanvasY: number,
): StudioTonePatternState {
  const normalized = normalizeTonePatternState(state);
  const rad = (normalized.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const du = deltaCanvasX * cos + deltaCanvasY * sin;
  const dv = -deltaCanvasX * sin + deltaCanvasY * cos;

  return {
    ...normalized,
    patternOffsetX: wrapTonePeriodOffset(normalized.patternOffsetX + du, normalized.periodPx),
    patternOffsetY: wrapTonePeriodOffset(normalized.patternOffsetY + dv, normalized.periodPx),
  };
}

/** 여러 톤 레이어의 위상·선수·각도를 기준 톤에 동기화해 겹침 모아레를 제거한다. */
export function alignTonePatternsToMaster(
  master: StudioTonePatternState,
  targets: readonly StudioTonePatternState[],
): StudioTonePatternState[] {
  const cleanMaster = normalizeTonePatternState(master);
  return targets.map((target) => ({
    ...normalizeTonePatternState(target),
    lpi: cleanMaster.lpi,
    dpi: cleanMaster.dpi,
    angleDeg: cleanMaster.angleDeg,
    periodPx: cleanMaster.periodPx,
    patternOffsetX: cleanMaster.patternOffsetX,
    patternOffsetY: cleanMaster.patternOffsetY,
  }));
}

function parseHexToRgb(hex: string): readonly [number, number, number] {
  const cleaned = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{6}$/u.test(cleaned)) {
    return [
      Number.parseInt(cleaned.slice(0, 2), 16),
      Number.parseInt(cleaned.slice(2, 4), 16),
      Number.parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return [0, 180, 255];
}

function rectsOverlap(
  a: StudioToneAreaRegionDescriptor["bounds"],
  b: StudioToneAreaRegionDescriptor["bounds"],
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function shortestAngleDiffDeg(a: number, b: number): number {
  // 원형 망점 격자는 90° 대칭 주기를 갖는다.
  const diff = Math.abs(a - b) % 90;
  return Math.min(diff, 90 - diff);
}

/**
 * CSP View > Show tone area (viewtonearea*) — 페이지 요소 중 톤이 활성화된 영역을 추출하고
 * 반투명 QA 오버레이 기술자 및 모아레 충돌 경고를 반환한다.
 */
export function buildToneAreaQaOverlayPlan(
  elements: readonly El[],
  options: StudioToneAreaOverlayOptions = {},
): StudioToneAreaQaOverlayPlan {
  const enabled = options.enabled ?? true;
  const tintHex = options.tintHex ?? "#00b4ff";
  const opacity = clamp(options.opacity ?? 0.35, 0.05, 0.9);
  const [r, g, b] = parseHexToRgb(tintHex);
  const tintRgba = `rgba(${r}, ${g}, ${b}, ${Math.round(opacity * 100) / 100})`;

  if (!enabled) {
    return {
      enabled: false,
      tintHex,
      opacity,
      regions: [],
      moireWarnings: [],
    };
  }

  const regions: StudioToneAreaRegionDescriptor[] = [];

  for (const el of elements) {
    if (el.hidden) continue;

    if (el.type === "image") {
      const hasHalftone = el.halftone !== undefined && el.halftone.strength > 0;
      const hasScreentone = el.screentone === true;
      if (!hasHalftone && !hasScreentone) continue;

      const dotSize = el.halftone?.dotSize ?? 10;
      const estimatedLpi = Math.round(600 / Math.max(2, dotSize));
      const angleDeg = el.halftone ? (45 + el.halftone.angle) % 180 : 45;
      regions.push({
        elementId: el.id,
        sourceKind: hasHalftone ? "halftone-image" : "screentone-image",
        bounds: { x: el.x, y: el.y, width: el.width, height: el.height },
        ...(el.frameClipId ? { clipFrameId: el.frameClipId } : {}),
        lpi: estimatedLpi,
        angleDeg,
        tintHex,
        tintOpacity: opacity,
        tintRgba,
        label: `${estimatedLpi}LPI · ${Math.round(angleDeg)}°`,
      });
    } else if (el.type === "draw" && el.pattern !== undefined && el.points.length >= 4) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < el.points.length; i += 2) {
        const px = el.points[i]!;
        const py = el.points[i + 1]!;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) continue;
      const scale = Math.max(0.25, el.pattern.scale ?? 1);
      const lpi = Math.round(60 / scale);
      const rawPatternAngle =
        "angle" in el.pattern && typeof el.pattern.angle === "number"
          ? el.pattern.angle
          : "rotation" in el.pattern && typeof el.pattern.rotation === "number"
            ? el.pattern.rotation
            : 45;
      const angleDeg = ((rawPatternAngle % 180) + 180) % 180;
      regions.push({
        elementId: el.id,
        sourceKind: "pattern-draw",
        bounds: {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        },
        ...(el.frameClipId ? { clipFrameId: el.frameClipId } : {}),
        lpi,
        angleDeg,
        tintHex,
        tintOpacity: opacity,
        tintRgba,
        label: `패턴 톤 ${lpi}LPI · ${Math.round(angleDeg)}°`,
      });
    }
  }

  const angleThreshold = clamp(options.moireAngleThresholdDeg ?? 15, 1, 44);
  const moireWarnings: StudioToneMoireWarning[] = [];

  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const first = regions[i]!;
      const second = regions[j]!;
      if (!rectsOverlap(first.bounds, second.bounds)) continue;
      const angDiff = shortestAngleDiffDeg(first.angleDeg, second.angleDeg);
      if (angDiff > 0.5 && angDiff < angleThreshold) {
        moireWarnings.push({
          firstElementId: first.elementId,
          secondElementId: second.elementId,
          reason: "angle-too-close",
          message: `겹치는 톤(${first.elementId}, ${second.elementId})의 망점 각도 차이가 ${angDiff.toFixed(1)}°로 좁아 모아레가 발생할 수 있습니다.`,
        });
      } else if (angDiff <= 0.5 && Math.abs(first.lpi - second.lpi) >= 3) {
        moireWarnings.push({
          firstElementId: first.elementId,
          secondElementId: second.elementId,
          reason: "lpi-mismatch-overlap",
          message: `동일 각도로 겹친 두 톤의 선수(${first.lpi}LPI vs ${second.lpi}LPI)가 달라 간섭 무늬가 생길 수 있습니다.`,
        });
      }
    }
  }

  return {
    enabled: true,
    tintHex,
    opacity,
    regions,
    moireWarnings,
  };
}

/** 톤 마스크(0..255)가 칠해진 픽셀 위에 비파괴 QA 틴트 색상을 합성한 사본 버퍼를 반환한다. */
export function applyToneAreaQaTintToRgba(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  toneMask: Uint8Array,
  options: StudioToneAreaOverlayOptions = {},
): Uint8Array {
  const out = new Uint8Array(sourceRgba);
  if (options.enabled === false) return out;
  const [tr, tg, tb] = parseHexToRgb(options.tintHex ?? "#00b4ff");
  const baseOpacity = clamp(options.opacity ?? 0.35, 0.05, 0.9);
  const pixelCount = Math.min(Math.floor(out.length / 4), toneMask.length);

  for (let p = 0; p < pixelCount; p += 1) {
    const maskVal = toneMask[p]!;
    if (maskVal === 0) continue;
    const alpha = (maskVal / 255) * baseOpacity;
    const idx = p * 4;
    out[idx] = Math.round(out[idx]! * (1 - alpha) + tr * alpha);
    out[idx + 1] = Math.round(out[idx + 1]! * (1 - alpha) + tg * alpha);
    out[idx + 2] = Math.round(out[idx + 2]! * (1 - alpha) + tb * alpha);
    out[idx + 3] = Math.max(out[idx + 3]!, Math.round(alpha * 255));
  }
  return out;
}
