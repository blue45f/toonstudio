/**
 * 클립스튜디오 페인트 5.1.5 고급 지우개 플래너 (자 스냅 지우개 · 다중 레이어 지우기 · 소프트/거친/다이나믹 프로파일).
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `Eraser > Hard (var=16), Soft (var=17), Kneaded (var=595), Rough (var=18), Dynamic (var=791),
 *   Vector (var=173), Multiple layers (var=283), Snap eraser (var=539)`,
 *   `BrushEnableSnap`, `BrushEraseAllLayer`, `BrushVectorEraserType`, `BrushVectorEraserReferAllLayer`.
 * - `UXEditImageTool.todb` (`ev_cfaed54c8ba0a6cdf0681a71160f0c4b7eb01f5fae8bf3c26fe2daeecc3be110`).
 */

import type { DrawEl } from "../studio-element-model";

export type StudioEraserResponseProfileId =
  | "hard"
  | "soft"
  | "kneaded"
  | "rough"
  | "dynamic";

export type StudioMultiLayerEraseScope =
  | "active-only"
  | "selected-layers"
  | "all-visible-unlocked";

export interface StudioAdvancedEraserSettings {
  readonly profile: StudioEraserResponseProfileId;
  /** 자·특수자·원근자에 지우개 궤적을 스냅할지 여부 (`BrushEnableSnap`). */
  readonly snapToRulers: boolean;
  /** 여러 레이어를 한 번의 지우개 획으로 동시에 지울 범위 (`BrushEraseAllLayer`). */
  readonly multiLayerScope: StudioMultiLayerEraseScope;
  /** 참조 레이어로 지정된 레이어는 다중 지우기에서 보호할지 여부. */
  readonly protectReferenceLayers: boolean;
}

export interface StudioEraserProfileSpec {
  readonly id: StudioEraserResponseProfileId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly hardness: number;
  readonly baseStrength: number;
  readonly grainContrast: number;
  readonly speedSizeBoost: number;
}

export interface StudioErasableLayerCandidate {
  readonly id: string;
  readonly kind: "raster" | "vector" | "text" | "frame" | "adjustment" | "group";
  readonly visible: boolean;
  readonly locked: boolean;
  readonly isActive: boolean;
  readonly isSelected: boolean;
  readonly isReference?: boolean;
}

export const STUDIO_ERASER_PROFILES: Readonly<Record<StudioEraserResponseProfileId, StudioEraserProfileSpec>> =
  Object.freeze({
    hard: {
      id: "hard",
      labelKo: "딱딱한 지우개",
      descriptionKo: "경계가 선명하게 100% 지워집니다",
      hardness: 0.96,
      baseStrength: 1,
      grainContrast: 0,
      speedSizeBoost: 0,
    },
    soft: {
      id: "soft",
      labelKo: "부드러운 지우개",
      descriptionKo: "가장자리가 자연스럽게 번지듯 지워집니다",
      hardness: 0.25,
      baseStrength: 0.82,
      grainContrast: 0,
      speedSizeBoost: 0,
    },
    kneaded: {
      id: "kneaded",
      labelKo: "떡지우개",
      descriptionKo: "흑연·연필 농도를 38%씩 부드럽게 걷어냅니다",
      hardness: 0.45,
      baseStrength: 0.38,
      grainContrast: 0.25,
      speedSizeBoost: 0,
    },
    rough: {
      id: "rough",
      labelKo: "거친 지우개",
      descriptionKo: "종이 결 입자를 남기며 거칠게 지웁니다",
      hardness: 0.8,
      baseStrength: 0.9,
      grainContrast: 0.72,
      speedSizeBoost: 0,
    },
    dynamic: {
      id: "dynamic",
      labelKo: "다이나믹 지우개",
      descriptionKo: "빠르게 문지를수록 지우개 폭이 넓어집니다",
      hardness: 0.88,
      baseStrength: 1,
      grainContrast: 0,
      speedSizeBoost: 1.65,
    },
  });

export const DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS: StudioAdvancedEraserSettings = Object.freeze({
  profile: "hard",
  snapToRulers: false,
  multiLayerScope: "active-only",
  protectReferenceLayers: true,
});

export function normalizeStudioAdvancedEraserSettings(
  input?: Partial<StudioAdvancedEraserSettings> | null,
): StudioAdvancedEraserSettings {
  if (!input) return DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS;
  const profiles: readonly StudioEraserResponseProfileId[] = [
    "hard",
    "soft",
    "kneaded",
    "rough",
    "dynamic",
  ];
  const scopes: readonly StudioMultiLayerEraseScope[] = [
    "active-only",
    "selected-layers",
    "all-visible-unlocked",
  ];
  return {
    profile: profiles.includes(input.profile as StudioEraserResponseProfileId)
      ? (input.profile as StudioEraserResponseProfileId)
      : "hard",
    snapToRulers: Boolean(input.snapToRulers),
    multiLayerScope: scopes.includes(input.multiLayerScope as StudioMultiLayerEraseScope)
      ? (input.multiLayerScope as StudioMultiLayerEraseScope)
      : "active-only",
    protectReferenceLayers: input.protectReferenceLayers ?? true,
  };
}

/** 현재 드로잉 모드와 지우개 설정을 바탕으로 자/원근자 스냅 허용 여부를 판정한다. */
export function shouldSnapStrokeToRuler(
  mode: "pen" | "eraser" | string,
  eraserSettings?: Partial<StudioAdvancedEraserSettings> | null,
): boolean {
  if (mode !== "eraser") return true;
  return normalizeStudioAdvancedEraserSettings(eraserSettings).snapToRulers;
}

/**
 * 다중 레이어 지우기(`Multiple layers` 지우개) 실행 시 한 번의 트랜잭션으로 지워야 할
 * 안전한 대상 레이어(래스터·벡터만, 잠금/숨김/텍스트/프레임/보조 보호 레이어 제외) 목록을 반환한다.
 */
export function resolveMultiLayerEraseTargets(
  layers: readonly StudioErasableLayerCandidate[],
  rawSettings?: Partial<StudioAdvancedEraserSettings> | null,
): StudioErasableLayerCandidate[] {
  const settings = normalizeStudioAdvancedEraserSettings(rawSettings);
  return layers.filter((layer) => {
    if (layer.kind !== "raster" && layer.kind !== "vector") return false;
    if (!layer.visible || layer.locked) return false;
    if (settings.multiLayerScope === "active-only") {
      return layer.isActive;
    }
    if (settings.protectReferenceLayers && layer.isReference && !layer.isActive) {
      return false;
    }
    if (settings.multiLayerScope === "selected-layers") {
      return layer.isSelected || layer.isActive;
    }
    return true;
  });
}

/** 다이나믹 지우개 등 프로파일별 유효 반경과 농도 계수를 산출한다. */
export function evaluateEraserStampResponse(
  baseWidthPx: number,
  pressure: number,
  speedNormalized: number,
  profileId: StudioEraserResponseProfileId,
): { readonly widthPx: number; readonly eraseAlpha: number; readonly hardness: number } {
  const spec = STUDIO_ERASER_PROFILES[profileId];
  const p = Math.min(1, Math.max(0.05, Number.isFinite(pressure) ? pressure : 0.7));
  const v = Math.min(1, Math.max(0, Number.isFinite(speedNormalized) ? speedNormalized : 0));
  const speedScale = 1 + spec.speedSizeBoost * v;
  const widthPx = Math.max(1, baseWidthPx * (0.45 + 0.55 * p) * speedScale);
  const eraseAlpha = Math.min(1, Math.max(0.02, spec.baseStrength * p));
  return {
    widthPx,
    eraseAlpha,
    hardness: spec.hardness,
  };
}

// ---------------------------------------------------------------------------
// CSP 벡터 교차점까지 지우기 (`EraseVectorCross`, `BrushVectorEraserType`)
// 근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
// ---------------------------------------------------------------------------

export interface VectorEraserCircle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface EraseVectorUpToIntersectionResult {
  readonly hit: boolean;
  readonly remainingStrokes: DrawEl[];
  readonly intersectionCount: number;
}

function clamp01Local(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sliceStrokeArcSpan(
  stroke: DrawEl,
  cum: readonly number[],
  sStart: number,
  sEnd: number,
  nextId: string,
): DrawEl | null {
  const n = Math.floor(stroke.points.length / 2);
  const totalLen = cum[n - 1] ?? 0;
  const lo = Math.max(0, sStart);
  const hi = Math.min(totalLen, sEnd);
  if (hi - lo <= 1e-3 || n < 2) return null;

  const basePrs = Array.from({ length: n }, (_, i) => {
    const p = stroke.pressures?.[i];
    return typeof p === "number" && Number.isFinite(p) ? clamp01Local(p) : 0.5;
  });

  const sampleAtS = (targetS: number): { x: number; y: number; p: number } => {
    for (let i = 0; i < n - 1; i++) {
      const a0 = cum[i]!;
      const a1 = cum[i + 1]!;
      if (targetS <= a1 || i === n - 2) {
        const seg = a1 - a0;
        const t = seg > 1e-9 ? clamp01Local((targetS - a0) / seg) : 0;
        return {
          x: stroke.points[i * 2]! + (stroke.points[(i + 1) * 2]! - stroke.points[i * 2]!) * t,
          y: stroke.points[i * 2 + 1]! + (stroke.points[(i + 1) * 2 + 1]! - stroke.points[i * 2 + 1]!) * t,
          p: basePrs[i]! + (basePrs[i + 1]! - basePrs[i]!) * t,
        };
      }
    }
    return {
      x: stroke.points[(n - 1) * 2]!,
      y: stroke.points[(n - 1) * 2 + 1]!,
      p: basePrs[n - 1]!,
    };
  };

  const outPts: number[] = [];
  const outPrs: number[] = [];
  const startSample = sampleAtS(lo);
  outPts.push(startSample.x, startSample.y);
  outPrs.push(startSample.p);

  for (let i = 0; i < n; i++) {
    const s = cum[i]!;
    if (s > lo + 1e-4 && s < hi - 1e-4) {
      outPts.push(stroke.points[i * 2]!, stroke.points[i * 2 + 1]!);
      outPrs.push(basePrs[i]!);
    }
  }

  const endSample = sampleAtS(hi);
  outPts.push(endSample.x, endSample.y);
  outPrs.push(endSample.p);

  if (Math.floor(outPts.length / 2) < 2) return null;
  return {
    ...stroke,
    id: nextId,
    points: outPts,
    pressures: stroke.pressures ? outPrs : undefined,
  };
}

/**
 * 벡터 지우개 `교차점까지 삭제(Erase up to intersection)` 실행.
 * 지우개 원에 닿은 대상 획에서 그 지점을 감싸는 양쪽 가장 가까운 선분 교차점 사이 구간만 잘라내며,
 * 교차점이 하나도 없는 독립 획은 통째로 제거한다.
 */
export function eraseVectorStrokeUpToIntersection(
  targetStroke: DrawEl,
  allVisibleStrokes: readonly Pick<DrawEl, "id" | "points" | "mode">[],
  eraserCircle: VectorEraserCircle,
): EraseVectorUpToIntersectionResult {
  const n = Math.floor(targetStroke.points.length / 2);
  const safeRadius = Math.max(0.5, Number.isFinite(eraserCircle.radius) ? eraserCircle.radius : 4);
  if (n < 2 || !Number.isFinite(eraserCircle.x) || !Number.isFinite(eraserCircle.y)) {
    return { hit: false, remainingStrokes: [targetStroke], intersectionCount: 0 };
  }

  const cum = new Array<number>(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] =
      cum[i - 1]! +
      Math.hypot(
        targetStroke.points[i * 2]! - targetStroke.points[(i - 1) * 2]!,
        targetStroke.points[i * 2 + 1]! - targetStroke.points[(i - 1) * 2 + 1]!,
      );
  }
  const totalLen = cum[n - 1] ?? 0;
  if (totalLen <= 1e-6) {
    return { hit: false, remainingStrokes: [targetStroke], intersectionCount: 0 };
  }

  // 1) 지우개 원 히트 판정 및 최단 호길이 위치 hitS 산출
  const hitThreshold = safeRadius + Math.max(0, (targetStroke.strokeWidth ?? 2) * 0.5);
  let bestDist = Infinity;
  let hitS = 0;
  for (let i = 0; i < n - 1; i++) {
    const x0 = targetStroke.points[i * 2]!;
    const y0 = targetStroke.points[i * 2 + 1]!;
    const x1 = targetStroke.points[(i + 1) * 2]!;
    const y1 = targetStroke.points[(i + 1) * 2 + 1]!;
    const vx = x1 - x0;
    const vy = y1 - y0;
    const lenSq = vx * vx + vy * vy;
    const t = lenSq > 1e-12
      ? clamp01Local(((eraserCircle.x - x0) * vx + (eraserCircle.y - y0) * vy) / lenSq)
      : 0;
    const px = x0 + vx * t;
    const py = y0 + vy * t;
    const d = Math.hypot(eraserCircle.x - px, eraserCircle.y - py);
    if (d < bestDist) {
      bestDist = d;
      hitS = cum[i]! + (cum[i + 1]! - cum[i]!) * t;
    }
  }

  if (bestDist > hitThreshold) {
    return { hit: false, remainingStrokes: [targetStroke], intersectionCount: 0 };
  }

  // 2) 모든 가시 벡터 획(자기 교차 포함)과의 정밀 선분 교차 호길이 수집
  const rawCrossings: number[] = [];
  for (const other of allVisibleStrokes) {
    if (other.mode === "eraser") continue;
    const m = Math.floor(other.points.length / 2);
    if (m < 2) continue;
    const isSelf = other.id === targetStroke.id;

    for (let i = 0; i < n - 1; i++) {
      const ax = targetStroke.points[i * 2]!;
      const ay = targetStroke.points[i * 2 + 1]!;
      const bx = targetStroke.points[(i + 1) * 2]!;
      const by = targetStroke.points[(i + 1) * 2 + 1]!;
      const rX = bx - ax;
      const rY = by - ay;

      for (let j = 0; j < m - 1; j++) {
        if (isSelf && Math.abs(i - j) <= 1) continue;
        const cx = other.points[j * 2]!;
        const cy = other.points[j * 2 + 1]!;
        const dx = other.points[(j + 1) * 2]!;
        const dy = other.points[(j + 1) * 2 + 1]!;
        const sX = dx - cx;
        const sY = dy - cy;

        const denom = rX * sY - rY * sX;
        if (Math.abs(denom) <= 1e-9) continue;
        const qpx = cx - ax;
        const qpy = cy - ay;
        const u = (qpx * sY - qpy * sX) / denom;
        const v = (qpx * rY - qpy * rX) / denom;
        if (u >= -1e-6 && u <= 1 + 1e-6 && v >= -1e-6 && v <= 1 + 1e-6) {
          const crossS = cum[i]! + (cum[i + 1]! - cum[i]!) * clamp01Local(u);
          if (crossS > 1e-3 && crossS < totalLen - 1e-3) {
            rawCrossings.push(crossS);
          }
        }
      }
    }
  }

  rawCrossings.sort((a, b) => a - b);
  const crossings: number[] = [];
  for (const s of rawCrossings) {
    if (crossings.length === 0 || s - crossings[crossings.length - 1]! > 0.25) {
      crossings.push(s);
    }
  }

  if (crossings.length === 0) {
    return { hit: true, remainingStrokes: [], intersectionCount: 0 };
  }

  let leftCut = 0;
  let rightCut = totalLen;
  for (const s of crossings) {
    if (s <= hitS) leftCut = s;
    if (s > hitS && rightCut === totalLen) rightCut = s;
  }

  const remaining: DrawEl[] = [];
  const leftPart = sliceStrokeArcSpan(targetStroke, cum, 0, leftCut, `${targetStroke.id}:cross-a`);
  const rightPart = sliceStrokeArcSpan(targetStroke, cum, rightCut, totalLen, `${targetStroke.id}:cross-b`);
  if (leftPart && rightPart) {
    remaining.push(leftPart, rightPart);
  } else if (leftPart) {
    remaining.push({ ...leftPart, id: targetStroke.id });
  } else if (rightPart) {
    remaining.push({ ...rightPart, id: targetStroke.id });
  }

  return {
    hit: true,
    remainingStrokes: remaining,
    intersectionCount: crossings.length,
  };
}
