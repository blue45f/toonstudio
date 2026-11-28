/**
 * Wave 121 — 웹툰 주름 능선(Tension Fold Ridge) 추출기 및 히어로 정지컷 포즈 베이커.
 * WebGPU WGSL XPBD 컴퓨트 솔버 빌더·검증기는 `./xpbd-cloth-wgsl-shader`에서 재수출한다.
 */

import {
  CLOTH_HAIR_PRESETS,
  createXpbdClothHairState,
  sampleWindField,
  stepXpbdClothHair,
  type ClothHairPresetId,
  type SimulateXpbdClothOptions,
  type Vec2,
  type XpbdClothHairState,
} from "./xpbd-cloth-hair-wind-solver";

export {
  buildXpbdClothHairWgsl,
  validateXpbdClothHairWgsl,
  type XpbdClothHairWgslArtifact,
  type XpbdWgslBindingDescriptor,
  type XpbdWgslValidationReport,
} from "./xpbd-cloth-wgsl-shader";

export type ClothFoldRidgeKind = "pipe-fold" | "drape-fold" | "wind-flutter-crest";

export interface ClothFoldRidge {
  readonly id: string;
  readonly kind: ClothFoldRidgeKind;
  readonly points: readonly Vec2[];
  readonly compressionStrain: number;
  readonly bendingAngleRad: number;
  readonly intensity: number;
  readonly strokeWidthPx: number;
  /** 주름 능선에서 그림자(음영) 방향을 가리키는 단위 벡터 */
  readonly shadingNormal: Vec2;
}

export interface ClothFoldRidgeSet {
  readonly ridges: readonly ClothFoldRidge[];
  readonly countsByKind: Readonly<Record<ClothFoldRidgeKind, number>>;
  readonly maxCompressionStrain: number;
  readonly maxBendingAngleRad: number;
  readonly dominantFlowVector: Vec2;
}

export interface WindStreamline {
  readonly id: string;
  readonly points: readonly Vec2[];
  readonly tipAngleRad: number;
  readonly speedMagnitude: number;
}

export interface HeroWebtoonFreezeFrameBake {
  readonly presetId: ClothHairPresetId;
  readonly presetLabelKo: string;
  readonly title: string;
  readonly bakedFrameIndex: number;
  readonly totalSimulatedSteps: number;
  readonly silhouetteSweepRatio: number;
  readonly maxStretchErrorRatio: number;
  readonly colliderPenetrationCount: number;
  readonly traceReady: boolean;
  readonly state: XpbdClothHairState;
  readonly outerContourPolyline: readonly Vec2[];
  readonly foldRidges: ClothFoldRidgeSet;
  readonly windStreamlines: readonly WindStreamline[];
}

export interface BakeHeroFreezeFrameOptions extends SimulateXpbdClothOptions {
  readonly title?: string;
  /** true(기본)이면 후반 구간에서 실루엣 동세 확장도가 가장 큰 관통 0건 프레임을 선택 */
  readonly selectPeakDramaFrame?: boolean;
  /** 주름 음영 방향 계산에 사용하는 키라이트 입사 단위 벡터 (기본 좌상단) */
  readonly keyLightDirection?: Vec2;
  /** 바람장 유선 화살표 개수 (기본 7) */
  readonly streamlineCount?: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function normalize2d(x: number, y: number, fallbackX = 0, fallbackY = 1): Vec2 {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < 1e-6) {
    return { x: fallbackX, y: fallbackY };
  }
  return { x: x / len, y: y / len };
}

function computeShadingNormalForPolyline(points: readonly Vec2[], keyLight: Vec2): Vec2 {
  if (points.length < 2) return { x: 0.6, y: 0.8 };
  const first = points[0];
  const last = points[points.length - 1];
  const tangent = normalize2d(last.x - first.x, last.y - first.y, 0, 1);
  const perpA = { x: -tangent.y, y: tangent.x };
  const perpB = { x: tangent.y, y: -tangent.x };
  const shadowDir = normalize2d(-keyLight.x, -keyLight.y, 0.6, 0.8);
  const dotA = perpA.x * shadowDir.x + perpA.y * shadowDir.y;
  return dotA >= 0 ? perpA : perpB;
}

function computeTripleAngle(a: Vec2, mid: Vec2, b: Vec2): number {
  const v1x = mid.x - a.x;
  const v1y = mid.y - a.y;
  const v2x = b.x - mid.x;
  const v2y = b.y - mid.y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-6 || l2 < 1e-6) return 0;
  return Math.acos(clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1));
}

/**
 * 베이크된 XPBD 격자에서 인접 압축률(compression strain)과 굽힘 각도를 분석해
 * 웹툰 펜선 주름 능선(`pipe-fold`, `drape-fold`, `wind-flutter-crest`)과 음영 방향 벡터를 추출한다.
 */
export function extractClothTensionFoldRidges(
  state: XpbdClothHairState,
  keyLightDirection: Vec2 = { x: -0.6, y: -0.8 },
): ClothFoldRidgeSet {
  const { rows, cols, particles } = state;
  const keyLight = normalize2d(keyLightDirection.x, keyLightDirection.y, -0.6, -0.8);
  const at = (r: number, c: number): (typeof particles)[number] => particles[r * cols + c];

  const ridges: ClothFoldRidge[] = [];
  let maxCompressionStrain = 0;
  let maxBendingAngleRad = 0;

  interface ColumnFoldScore {
    readonly col: number;
    readonly avgCompression: number;
    readonly avgBend: number;
    readonly score: number;
  }
  const colScores: ColumnFoldScore[] = [];
  for (let c = 0; c < cols; c += 1) {
    let compSum = 0;
    let compCount = 0;
    let bendSum = 0;
    let bendCount = 0;
    for (let r = 1; r < rows; r += 1) {
      const p = at(r, c);
      if (c > 0) {
        const left = at(r, c - 1);
        const restW = Math.hypot(p.restX - left.restX, p.restY - left.restY);
        const currW = Math.hypot(p.x - left.x, p.y - left.y);
        compSum += restW > 1e-6 ? Math.max(0, (restW - currW) / restW) : 0;
        compCount += 1;
      }
      if (c + 1 < cols) {
        const right = at(r, c + 1);
        const restW = Math.hypot(right.restX - p.restX, right.restY - p.restY);
        const currW = Math.hypot(right.x - p.x, right.y - p.y);
        compSum += restW > 1e-6 ? Math.max(0, (restW - currW) / restW) : 0;
        compCount += 1;
      }
      if (r + 1 < rows) {
        bendSum += computeTripleAngle(at(r - 1, c), p, at(r + 1, c));
        bendCount += 1;
      }
    }
    const avgCompression = compCount > 0 ? compSum / compCount : 0;
    const avgBend = bendCount > 0 ? bendSum / bendCount : 0;
    if (avgCompression > maxCompressionStrain) maxCompressionStrain = avgCompression;
    if (avgBend > maxBendingAngleRad) maxBendingAngleRad = avgBend;
    colScores.push({ col: c, avgCompression, avgBend, score: avgCompression * 2.2 + avgBend * 0.7 });
  }

  colScores.sort((a, b) => b.score - a.score || a.col - b.col);
  const pipeTargetCount = Math.max(2, Math.min(4, Math.ceil(cols * 0.5)));
  for (let i = 0; i < Math.min(pipeTargetCount, colScores.length); i += 1) {
    const item = colScores[i];
    const startRow = Math.min(1, rows - 2);
    const pts: Vec2[] = [];
    for (let r = startRow; r < rows; r += 1) {
      const p = at(r, item.col);
      pts.push({ x: p.x, y: p.y });
    }
    if (pts.length >= 2) {
      const intensity = clamp(0.35 + item.avgCompression * 1.9 + item.avgBend * 0.55, 0.25, 1);
      ridges.push({
        id: `pipe-fold-c${item.col}`,
        kind: "pipe-fold",
        points: pts,
        compressionStrain: item.avgCompression,
        bendingAngleRad: item.avgBend,
        intensity,
        strokeWidthPx: Number((1.15 + intensity * 1.65).toFixed(2)),
        shadingNormal: computeShadingNormalForPolyline(pts, keyLight),
      });
    }
  }

  const drapeStartRow = Math.max(2, Math.floor(rows * 0.28));
  const drapeEndRow = Math.max(drapeStartRow + 1, Math.floor(rows * 0.78));
  const drapeStep = Math.max(2, Math.floor((drapeEndRow - drapeStartRow) / 3));
  let drapeIdx = 0;
  for (let r = drapeStartRow; r <= drapeEndRow && drapeIdx < 3; r += drapeStep) {
    const pts: Vec2[] = [];
    let rowBendSum = 0;
    let rowBendCount = 0;
    let rowCompSum = 0;
    for (let c = 0; c < cols; c += 1) {
      const p = at(r, c);
      pts.push({ x: p.x, y: p.y });
      if (c > 0 && c + 1 < cols) {
        rowBendSum += computeTripleAngle(at(r, c - 1), p, at(r, c + 1));
        rowBendCount += 1;
      }
      if (r > 0) {
        const up = at(r - 1, c);
        const restV = Math.hypot(p.restX - up.restX, p.restY - up.restY);
        const currV = Math.hypot(p.x - up.x, p.y - up.y);
        rowCompSum += restV > 1e-6 ? Math.max(0, (restV - currV) / restV) : 0;
      }
    }
    const avgBend = rowBendCount > 0 ? rowBendSum / rowBendCount : 0;
    const avgComp = cols > 0 ? rowCompSum / cols : 0;
    if (avgComp > maxCompressionStrain) maxCompressionStrain = avgComp;
    if (avgBend > maxBendingAngleRad) maxBendingAngleRad = avgBend;
    if (pts.length >= 2) {
      const intensity = clamp(0.3 + avgBend * 0.9 + avgComp * 1.6, 0.22, 0.95);
      ridges.push({
        id: `drape-fold-r${r}`,
        kind: "drape-fold",
        points: pts,
        compressionStrain: avgComp,
        bendingAngleRad: avgBend,
        intensity,
        strokeWidthPx: Number((1.05 + intensity * 1.45).toFixed(2)),
        shadingNormal: computeShadingNormalForPolyline(pts, keyLight),
      });
      drapeIdx += 1;
    }
  }

  const flutterRows = [Math.max(2, rows - 3), Math.max(2, rows - 1)];
  for (let fIdx = 0; fIdx < flutterRows.length; fIdx += 1) {
    const r = flutterRows[fIdx];
    const pts: Vec2[] = [];
    let crestBendSum = 0;
    let crestBendCount = 0;
    let crestCompSum = 0;
    for (let c = 0; c < cols; c += 1) {
      const p = at(r, c);
      pts.push({ x: p.x, y: p.y });
      if (r > 0 && r + 1 < rows) {
        crestBendSum += computeTripleAngle(at(r - 1, c), p, at(r + 1, c));
        crestBendCount += 1;
      } else if (r > 1) {
        crestBendSum += computeTripleAngle(at(r - 2, c), at(r - 1, c), p);
        crestBendCount += 1;
      }
      if (c > 0) {
        const left = at(r, c - 1);
        const restW = Math.hypot(p.restX - left.restX, p.restY - left.restY);
        const currW = Math.hypot(p.x - left.x, p.y - left.y);
        crestCompSum += restW > 1e-6 ? Math.max(0, (restW - currW) / restW) : 0;
      }
    }
    const avgBend = crestBendCount > 0 ? crestBendSum / crestBendCount : 0;
    const avgComp = cols > 1 ? crestCompSum / (cols - 1) : 0;
    if (avgComp > maxCompressionStrain) maxCompressionStrain = avgComp;
    if (avgBend > maxBendingAngleRad) maxBendingAngleRad = avgBend;
    if (pts.length >= 2) {
      const intensity = clamp(0.42 + avgBend * 0.95 + avgComp * 1.5, 0.3, 1);
      ridges.push({
        id: `wind-flutter-crest-r${r}`,
        kind: "wind-flutter-crest",
        points: pts,
        compressionStrain: avgComp,
        bendingAngleRad: avgBend,
        intensity,
        strokeWidthPx: Number((1.2 + intensity * 1.75).toFixed(2)),
        shadingNormal: computeShadingNormalForPolyline(pts, keyLight),
      });
    }
  }

  const countsByKind: Record<ClothFoldRidgeKind, number> = {
    "pipe-fold": 0,
    "drape-fold": 0,
    "wind-flutter-crest": 0,
  };
  for (let i = 0; i < ridges.length; i += 1) {
    countsByKind[ridges[i].kind] += 1;
  }

  const dominantFlowVector = normalize2d(state.metrics.tailDisplacement.x, state.metrics.tailDisplacement.y, 1, 0);

  return {
    ridges,
    countsByKind,
    maxCompressionStrain,
    maxBendingAngleRad,
    dominantFlowVector,
  };
}

function buildOuterContourPolyline(state: XpbdClothHairState): readonly Vec2[] {
  const { rows, cols, particles } = state;
  const at = (r: number, c: number): Vec2 => {
    const p = particles[r * cols + c];
    return { x: p.x, y: p.y };
  };
  const contour: Vec2[] = [];
  for (let c = 0; c < cols; c += 1) contour.push(at(0, c));
  for (let r = 1; r < rows; r += 1) contour.push(at(r, cols - 1));
  for (let c = cols - 2; c >= 0; c -= 1) contour.push(at(rows - 1, c));
  for (let r = rows - 2; r >= 0; r -= 1) contour.push(at(r, 0));
  return contour;
}

function buildWindStreamlines(state: XpbdClothHairState, count: number): readonly WindStreamline[] {
  const safeCount = Math.max(3, Math.min(12, Math.trunc(count)));
  const lines: WindStreamline[] = [];
  const startYMin = 95;
  const startYMax = Math.max(220, state.viewportHeight - 130);
  const windRight = state.wind.windVector.x >= 0;
  const seedX = windRight ? 64 : state.viewportWidth - 64;

  for (let i = 0; i < safeCount; i += 1) {
    const t = safeCount > 1 ? i / (safeCount - 1) : 0.5;
    let x = seedX;
    let y = startYMin + t * (startYMax - startYMin);
    const points: Vec2[] = [{ x, y }];
    let lastDirX = windRight ? 1 : -1;
    let lastDirY = 0;
    let speedSum = 0;

    for (let seg = 0; seg < 6; seg += 1) {
      const sample = sampleWindField(state.wind, x, y, state.timeSec);
      speedSum += Math.hypot(sample.x, sample.y);
      const dir = normalize2d(sample.x, sample.y, windRight ? 1 : -1, 0);
      lastDirX = dir.x;
      lastDirY = dir.y;
      x = clamp(x + dir.x * 26, 20, state.viewportWidth - 20);
      y = clamp(y + dir.y * 26, 20, state.viewportHeight - 20);
      points.push({ x, y });
    }
    lines.push({
      id: `wind-stream-${i + 1}`,
      points,
      tipAngleRad: Math.atan2(lastDirY, lastDirX),
      speedMagnitude: speedSum / 6,
    });
  }
  return lines;
}

/**
 * 다중 스텝 XPBD 시뮬레이션을 수행하고, 실루엣 동세 확장도·충돌 0건·신축 오차·주름 능선을 종합해
 * 즉시 웹툰 펜선 트레이싱 가능한 히어로 정지컷 베이크 스냅샷을 생성한다.
 */
export function bakeHeroWebtoonFreezeFrame(
  presetId: ClothHairPresetId,
  options: BakeHeroFreezeFrameOptions = {},
): HeroWebtoonFreezeFrameBake {
  const spec = CLOTH_HAIR_PRESETS[presetId];
  const totalSteps = clamp(Math.trunc(options.steps ?? 28), 4, 200);
  const selectPeak = options.selectPeakDramaFrame ?? true;
  const windowStart = Math.max(1, Math.floor(totalSteps * 0.6));

  let current = createXpbdClothHairState(presetId, options);
  let bestState = current;
  let bestFrameIndex = 0;
  let bestScore = -Infinity;

  for (let step = 1; step <= totalSteps; step += 1) {
    current = stepXpbdClothHair(current, {
      dt: options.dt,
      substeps: options.substeps,
      solverIterations: options.solverIterations,
    });
    if (!selectPeak) {
      bestState = current;
      bestFrameIndex = step;
    } else if (step >= windowStart) {
      const valid =
        current.metrics.colliderPenetrationCount === 0 &&
        current.metrics.nonFiniteCount === 0 &&
        current.metrics.maxStretchErrorRatio < 0.02;
      const score =
        (valid ? 100 : 0) +
        current.metrics.silhouetteSweepRatio * 10 +
        current.metrics.tailDisplacement.magnitude * 0.015;
      if (score > bestScore) {
        bestScore = score;
        bestState = current;
        bestFrameIndex = step;
      }
    }
  }

  const foldRidges = extractClothTensionFoldRidges(bestState, options.keyLightDirection);
  const outerContourPolyline = buildOuterContourPolyline(bestState);
  const windStreamlines = buildWindStreamlines(bestState, options.streamlineCount ?? 7);
  const traceReady =
    bestState.metrics.colliderPenetrationCount === 0 &&
    bestState.metrics.maxStretchErrorRatio < 0.02 &&
    bestState.metrics.nonFiniteCount === 0 &&
    foldRidges.ridges.length > 0;

  return {
    presetId,
    presetLabelKo: spec.labelKo,
    title: options.title ?? `Wave 121 ${spec.labelKo} 바람장 정지컷 베이크`,
    bakedFrameIndex: bestFrameIndex,
    totalSimulatedSteps: totalSteps,
    silhouetteSweepRatio: bestState.metrics.silhouetteSweepRatio,
    maxStretchErrorRatio: bestState.metrics.maxStretchErrorRatio,
    colliderPenetrationCount: bestState.metrics.colliderPenetrationCount,
    traceReady,
    state: bestState,
    outerContourPolyline,
    foldRidges,
    windStreamlines,
  };
}
