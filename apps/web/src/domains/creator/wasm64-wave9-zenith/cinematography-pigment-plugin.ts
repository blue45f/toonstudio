/**
 * 역방향 시네마토그래피 구도·다이내믹 시메트리 코치, 이방성 종이 섬유·광물 안료 침전 커널,
 * 권한 격리형 결정론 Wasm 필터 플러그인 호스트.
 *
 * - AI 토큰 0개, 외부 서버 비용 ₩0으로 동작하는 로컬 순수 수학·시스템 엔진이다.
 * - 실루엣 무게중심·시선 광선·삼분할/황금나선/바로크·시니스터 대각선·말풍선 가림을 역산해
 *   정확히 1도 단위 카메라 롤(`integer deg`)과 크롭 사각형을 제안한다.
 * - 한지·황목·세목의 섬유 방향 확산 텐서와 광물 안료 골짜기 침전(입상화 지수·모세관 이방성)을 계산한다.
 * - Wasm 바이너리 매직·섹션·임포트 허용목록·메모리 상한·연료 예산을 검증하고 격리 실행한다.
 */

const GOLDEN_PHI = (1 + Math.sqrt(5)) * 0.5;
const GOLDEN_INV = 1 / GOLDEN_PHI;
const GOLDEN_COMP = 1 - GOLDEN_INV;
const DEG_TO_RAD = Math.PI / 180;

export type CompositionSymmetryPreset = "rule-of-thirds" | "golden-spiral" | "baroque-diagonal" | "sinister-diagonal" | "auto";
export type CinematographyMood = "calm-dialogue" | "heroic-reveal" | "tension-dutch" | "dynamic-action";

export interface Rect2d { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Point2d { readonly x: number; readonly y: number }

export interface SilhouetteSubjectInput {
  readonly subjectId: string; readonly centroidX: number; readonly centroidY: number;
  readonly bounds: Rect2d; readonly visualWeight: number;
  readonly eyePoint?: Point2d;
  /** 시선 방위각(도): 0=우측, 90=하단, 180=좌측, -90=상단. */
  readonly gazeAzimuthDeg?: number; readonly isPrimary?: boolean;
}

export interface BalloonBoundsInput {
  readonly balloonId: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}

export interface CompositionCoachInput {
  readonly frameWidthPx: number; readonly frameHeightPx: number;
  readonly subjects: readonly SilhouetteSubjectInput[];
  readonly balloons?: readonly BalloonBoundsInput[];
  readonly horizonAngleDeg?: number; readonly targetPreset?: CompositionSymmetryPreset;
  readonly targetMood?: CinematographyMood; readonly maxRollAdjustDeg?: number; readonly minCropKeepRatio?: number;
}

export interface BalloonOcclusionFinding {
  readonly balloonId: string; readonly subjectId: string;
  readonly kind: "silhouette-overlap" | "gaze-ray-blocked";
  readonly overlapRatio: number; readonly rayHitDistancePx: number | null; readonly noteKo: string;
}

export interface SymmetryAxisAlignment {
  readonly preset: Exclude<CompositionSymmetryPreset, "auto">;
  readonly nearestPowerPoint: Point2d; readonly powerPointDistancePx: number;
  readonly diagonalDistancePx: number; readonly gazeTangentAlignment: number; readonly alignmentScore0To100: number;
}

export interface CropAdjustmentPlan {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly keepAreaRatio: number; readonly zoomFactor: number;
}

export interface CompositionCoachReport {
  readonly selectedSymmetry: Exclude<CompositionSymmetryPreset, "auto">;
  /** 정확히 1도 정수 단위로 양자화된 카메라 회전 보정값(도). */
  readonly recommendedRollDeltaDeg: number; readonly resultingHorizonDeg: number;
  readonly recommendedCrop: CropAdjustmentPlan; readonly visualMassCenter: Point2d;
  readonly leftRightBalanceRatio: number; readonly leadRoomRatio: number; readonly headroomRatio: number;
  readonly symmetryEvaluations: readonly SymmetryAxisAlignment[];
  readonly balloonOcclusions: readonly BalloonOcclusionFinding[];
  readonly scoreBefore0To100: number; readonly scoreAfter0To100: number;
  readonly coachingNotesKo: readonly string[];
  readonly aiTokensUsed: 0; readonly serverCostKrw: 0;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rectIntersectionArea(a: Rect2d, b: Rect2d): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ix * iy;
}

function rayAabbIntersectionDistance(ox: number, oy: number, dx: number, dy: number, rect: Rect2d): number | null {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  for (const [orig, dir, minB, maxB] of [[ox, dx, rect.x, rect.x + rect.width], [oy, dy, rect.y, rect.y + rect.height]] as const) {
    if (Math.abs(dir) < 1e-8) {
      if (orig < minB || orig > maxB) return null;
    } else {
      const a = (minB - orig) / dir;
      const b = (maxB - orig) / dir;
      tMin = Math.max(tMin, Math.min(a, b));
      tMax = Math.min(tMax, Math.max(a, b));
      if (tMin > tMax) return null;
    }
  }
  return tMax >= 0 ? Math.max(0, tMin) : null;
}

function computeSymmetryPowerPoints(
  preset: Exclude<CompositionSymmetryPreset, "auto">, w: number, h: number,
): { readonly points: readonly Point2d[]; readonly mainDiag: readonly [Point2d, Point2d] } {
  if (preset === "rule-of-thirds") {
    return {
      points: [{ x: w / 3, y: h / 3 }, { x: (2 * w) / 3, y: h / 3 }, { x: w / 3, y: (2 * h) / 3 }, { x: (2 * w) / 3, y: (2 * h) / 3 }],
      mainDiag: [{ x: 0, y: h }, { x: w, y: 0 }],
    };
  }
  if (preset === "golden-spiral") {
    return {
      points: [
        { x: w * GOLDEN_COMP, y: h * GOLDEN_COMP }, { x: w * GOLDEN_INV, y: h * GOLDEN_COMP },
        { x: w * GOLDEN_COMP, y: h * GOLDEN_INV }, { x: w * GOLDEN_INV, y: h * GOLDEN_INV },
      ],
      mainDiag: [{ x: 0, y: h }, { x: w * GOLDEN_INV, y: h * GOLDEN_COMP }],
    };
  }
  const denom = w * w + h * h;
  if (preset === "baroque-diagonal") {
    const tL = (h * h) / denom;
    const tR = (w * w) / denom;
    return { points: [{ x: tL * w, y: h * (1 - tL) }, { x: tR * w, y: h * (1 - tR) }], mainDiag: [{ x: 0, y: h }, { x: w, y: 0 }] };
  }
  const tR = (w * w) / denom;
  const tL = (h * h) / denom;
  return { points: [{ x: tR * w, y: tR * h }, { x: tL * w, y: tL * h }], mainDiag: [{ x: 0, y: 0 }, { x: w, y: h }] };
}

function evaluateSingleSymmetry(
  preset: Exclude<CompositionSymmetryPreset, "auto">, focal: Point2d, gazeAzimuthDeg: number | undefined, crop: Rect2d,
): SymmetryAxisAlignment {
  const lx = focal.x - crop.x;
  const ly = focal.y - crop.y;
  const { points, mainDiag } = computeSymmetryPowerPoints(preset, crop.width, crop.height);
  const diagLen = Math.hypot(crop.width, crop.height);
  let nearest = points[0]!;
  let minDist = Number.POSITIVE_INFINITY;
  for (const pt of points) {
    const d = Math.hypot(lx - pt.x, ly - pt.y);
    if (d < minDist) { minDist = d; nearest = pt; }
  }
  const diagDist = pointToSegmentDistance(lx, ly, mainDiag[0].x, mainDiag[0].y, mainDiag[1].x, mainDiag[1].y);
  let gazeTangentAlignment = 0.7;
  if (gazeAzimuthDeg !== undefined) {
    const gx = Math.cos(gazeAzimuthDeg * DEG_TO_RAD);
    const gy = Math.sin(gazeAzimuthDeg * DEG_TO_RAD);
    const ax = mainDiag[1].x - mainDiag[0].x;
    const ay = mainDiag[1].y - mainDiag[0].y;
    gazeTangentAlignment = Math.abs((gx * ax + gy * ay) / (Math.hypot(ax, ay) || 1));
  }
  const normPower = clamp(1 - minDist / (0.35 * diagLen), 0, 1);
  const normDiag = clamp(1 - diagDist / (0.28 * diagLen), 0, 1);
  return {
    preset,
    nearestPowerPoint: { x: crop.x + nearest.x, y: crop.y + nearest.y },
    powerPointDistancePx: Math.round(minDist * 100) / 100,
    diagonalDistancePx: Math.round(diagDist * 100) / 100,
    gazeTangentAlignment: round3(gazeTangentAlignment),
    alignmentScore0To100: Math.round((normPower * 0.58 + normDiag * 0.27 + gazeTangentAlignment * 0.15) * 1000) / 10,
  };
}

function computeLeadAndHeadroom(focal: Point2d, primaryBounds: Rect2d, gazeAzimuthDeg: number | undefined, crop: Rect2d) {
  const headroomRatio = clamp((primaryBounds.y - crop.y) / Math.max(1, crop.height), 0, 1);
  if (gazeAzimuthDeg === undefined) {
    return { leadRoomRatio: clamp(0.5 - Math.abs((focal.x - crop.x) / Math.max(1, crop.width) - 0.5), 0, 1), headroomRatio };
  }
  const dx = Math.cos(gazeAzimuthDeg * DEG_TO_RAD);
  const dy = Math.sin(gazeAzimuthDeg * DEG_TO_RAD);
  const tx = dx > 1e-6 ? (crop.x + crop.width - focal.x) / dx : dx < -1e-6 ? (crop.x - focal.x) / dx : Number.POSITIVE_INFINITY;
  const ty = dy > 1e-6 ? (crop.y + crop.height - focal.y) / dy : dy < -1e-6 ? (crop.y - focal.y) / dy : Number.POSITIVE_INFINITY;
  return { leadRoomRatio: clamp(Math.max(0, Math.min(tx, ty)) / (0.68 * (Math.hypot(crop.width, crop.height) || 1)), 0, 1), headroomRatio };
}

function inscribedRotatedCropScale(width: number, height: number, absRollDeg: number): number {
  if (absRollDeg <= 0) return 1;
  const rad = absRollDeg * DEG_TO_RAD;
  const aspect = width >= height ? width / Math.max(1, height) : height / Math.max(1, width);
  return clamp(1 / (Math.cos(rad) + aspect * Math.sin(rad)), 0.55, 1);
}

/**
 * 실루엣 무게중심·시선 광선·다이내믹 시메트리 축·말풍선 가림을 역해석하여
 * 정확히 1도 단위 카메라 롤(`integer deg`)과 안전 크롭 사각형을 산출한다.
 */
export function analyzeCinematographyComposition(input: CompositionCoachInput): CompositionCoachReport {
  const w = Math.max(16, Math.round(input.frameWidthPx));
  const h = Math.max(16, Math.round(input.frameHeightPx));
  const mood = input.targetMood ?? "calm-dialogue";
  const maxRoll = Math.max(1, Math.min(25, Math.round(input.maxRollAdjustDeg ?? 12)));
  const minKeep = clamp(input.minCropKeepRatio ?? 0.78, 0.55, 0.98);
  const horizonDeg = input.horizonAngleDeg ?? 0;
  const fallback: SilhouetteSubjectInput = {
    subjectId: "default-subject", centroidX: w * 0.5, centroidY: h * 0.5,
    bounds: { x: w * 0.35, y: h * 0.25, width: w * 0.3, height: h * 0.5 }, visualWeight: 1, isPrimary: true,
  };
  const subjects = input.subjects.length > 0 ? input.subjects : [fallback];
  const primary = subjects.find((s) => s.isPrimary) ?? subjects[0]!;
  const focal: Point2d = primary.eyePoint ?? { x: primary.centroidX, y: primary.centroidY };

  let sumW = 0; let sumX = 0; let sumY = 0; let leftTorque = 0; let rightTorque = 0;
  for (const subj of subjects) {
    const wt = Math.max(0.01, subj.visualWeight);
    sumW += wt; sumX += subj.centroidX * wt; sumY += subj.centroidY * wt;
    if (subj.centroidX < w * 0.5) leftTorque += wt * (w * 0.5 - subj.centroidX);
    else rightTorque += wt * (subj.centroidX - w * 0.5);
  }
  const visualMassCenter = { x: Math.round((sumX / sumW) * 100) / 100, y: Math.round((sumY / sumW) * 100) / 100 };
  const totalTorque = leftTorque + rightTorque;
  const leftRightBalanceRatio = totalTorque <= 1e-6 ? 1 : round3(1 - Math.abs(leftTorque - rightTorque) / totalTorque);

  const balloonOcclusions: BalloonOcclusionFinding[] = [];
  for (const balloon of input.balloons ?? []) {
    const bRect: Rect2d = { x: balloon.x, y: balloon.y, width: balloon.width, height: balloon.height };
    for (const subj of subjects) {
      const overlapRatio = rectIntersectionArea(subj.bounds, bRect) / Math.max(1, subj.bounds.width * subj.bounds.height);
      if (overlapRatio >= 0.08) {
        balloonOcclusions.push({
          balloonId: balloon.balloonId, subjectId: subj.subjectId, kind: "silhouette-overlap",
          overlapRatio: round3(overlapRatio), rayHitDistancePx: null,
          noteKo: `말풍선(${balloon.balloonId})이 인물(${subj.subjectId}) 실루엣의 ${Math.round(overlapRatio * 100)}%를 가립니다.`,
        });
      }
      if (subj.gazeAzimuthDeg !== undefined) {
        const eye = subj.eyePoint ?? { x: subj.centroidX, y: subj.centroidY };
        const hitDist = rayAabbIntersectionDistance(eye.x, eye.y, Math.cos(subj.gazeAzimuthDeg * DEG_TO_RAD), Math.sin(subj.gazeAzimuthDeg * DEG_TO_RAD), bRect);
        if (hitDist !== null && hitDist < Math.hypot(w, h) * 0.45) {
          balloonOcclusions.push({
            balloonId: balloon.balloonId, subjectId: subj.subjectId, kind: "gaze-ray-blocked",
            overlapRatio: round3(overlapRatio), rayHitDistancePx: Math.round(hitDist * 10) / 10,
            noteKo: `인물(${subj.subjectId})의 시선 진행 경로 ${Math.round(hitDist)}px 지점을 말풍선(${balloon.balloonId})이 가로막습니다.`,
          });
        }
      }
    }
  }

  const allPresets: readonly Exclude<CompositionSymmetryPreset, "auto">[] = ["rule-of-thirds", "golden-spiral", "baroque-diagonal", "sinister-diagonal"];
  const fullRect: Rect2d = { x: 0, y: 0, width: w, height: h };
  const initialEvaluations = allPresets.map((p) => evaluateSingleSymmetry(p, focal, primary.gazeAzimuthDeg, fullRect));
  let selectedSymmetry: Exclude<CompositionSymmetryPreset, "auto">;
  if (input.targetPreset && input.targetPreset !== "auto") selectedSymmetry = input.targetPreset;
  else if (mood === "tension-dutch") selectedSymmetry = "sinister-diagonal";
  else if (mood === "dynamic-action") selectedSymmetry = "baroque-diagonal";
  else if (mood === "heroic-reveal") selectedSymmetry = "golden-spiral";
  else selectedSymmetry = [...initialEvaluations].sort((a, b) => b.alignmentScore0To100 - a.alignmentScore0To100)[0]!.preset;

  let targetHorizon = 0;
  if (mood === "tension-dutch") targetHorizon = (primary.gazeAzimuthDeg !== undefined && Math.abs(primary.gazeAzimuthDeg) > 90 ? -1 : 1) * 8;
  else if (mood === "dynamic-action" && Math.abs(horizonDeg) >= 4) targetHorizon = Math.sign(horizonDeg) * Math.min(maxRoll, Math.round(Math.abs(horizonDeg)));

  let bestRollDeg = 0;
  let bestRollPenalty = Number.POSITIVE_INFINITY;
  for (let delta = -maxRoll; delta <= maxRoll; delta += 1) {
    const penalty = Math.abs(horizonDeg + delta - targetHorizon) * 2.4 + Math.abs(delta) * 0.14;
    if (penalty < bestRollPenalty) { bestRollPenalty = penalty; bestRollDeg = delta; }
  }

  const rotSafeScale = inscribedRotatedCropScale(w, h, Math.abs(bestRollDeg));
  const candidateScales = [clamp(Math.min(rotSafeScale, 0.96), minKeep, 1), clamp(Math.min(rotSafeScale, 0.88), minKeep, 1), clamp(Math.min(rotSafeScale, minKeep), minKeep, 1)];
  const scoreCompositionState = (crop: Rect2d, rollDelta: number): number => {
    const sym = evaluateSingleSymmetry(selectedSymmetry, focal, primary.gazeAzimuthDeg, crop);
    const { leadRoomRatio, headroomRatio } = computeLeadAndHeadroom(focal, primary.bounds, primary.gazeAzimuthDeg, crop);
    const headScore = clamp(1 - Math.abs(headroomRatio - (mood === "heroic-reveal" ? 0.16 : 0.12)) / 0.28, 0, 1) * 100;
    const leadScore = clamp(leadRoomRatio / 0.55, 0, 1) * 100;
    const rollScore = clamp(1 - Math.abs(horizonDeg + rollDelta - targetHorizon) / 14, 0, 1) * 100;
    return clamp(sym.alignmentScore0To100 * 0.45 + leadScore * 0.25 + headScore * 0.15 + rollScore * 0.15 - Math.min(24, balloonOcclusions.length * 8), 0, 100);
  };

  const scoreBefore = Math.round(scoreCompositionState(fullRect, 0) * 10) / 10;
  const gazeCos = primary.gazeAzimuthDeg !== undefined ? Math.cos(primary.gazeAzimuthDeg * DEG_TO_RAD) : 0;
  let bestCrop: Rect2d = fullRect;
  let bestAfterScore = -1;
  for (const scale of candidateScales) {
    const cw = Math.max(16, Math.round(w * scale));
    const ch = Math.max(16, Math.round(h * scale));
    for (const pt of computeSymmetryPowerPoints(selectedSymmetry, cw, ch).points) {
      if ((gazeCos > 0.25 && pt.x > cw * 0.52) || (gazeCos < -0.25 && pt.x < cw * 0.48)) continue;
      const candidate: Rect2d = { x: Math.round(clamp(focal.x - pt.x, 0, Math.max(0, w - cw))), y: Math.round(clamp(focal.y - pt.y, 0, Math.max(0, h - ch))), width: cw, height: ch };
      const sc = scoreCompositionState(candidate, bestRollDeg);
      if (sc > bestAfterScore) { bestAfterScore = sc; bestCrop = candidate; }
    }
  }
  if (bestAfterScore < scoreBefore && bestRollDeg === 0) { bestCrop = fullRect; bestAfterScore = scoreBefore; }

  const finalEvaluations = allPresets.map((p) => evaluateSingleSymmetry(p, focal, primary.gazeAzimuthDeg, bestCrop));
  const { leadRoomRatio, headroomRatio } = computeLeadAndHeadroom(focal, primary.bounds, primary.gazeAzimuthDeg, bestCrop);
  const coachingNotesKo: string[] = [];
  if (bestRollDeg !== 0) coachingNotesKo.push(`카메라 롤을 ${bestRollDeg > 0 ? `+${bestRollDeg}` : `${bestRollDeg}`}도 보정해 수평·대각 긴장 축을 정렬합니다.`);
  if (bestCrop.width < w || bestCrop.height < h) coachingNotesKo.push(`(${bestCrop.x}, ${bestCrop.y}) 기준 ${bestCrop.width}×${bestCrop.height}px 크롭으로 시선 여백과 ${selectedSymmetry} 교점을 맞춥니다.`);
  for (const occ of balloonOcclusions) coachingNotesKo.push(occ.noteKo);
  if (coachingNotesKo.length === 0) coachingNotesKo.push("현재 컷의 시선 여백과 대칭 교점이 안정적입니다.");

  return {
    selectedSymmetry, recommendedRollDeltaDeg: bestRollDeg,
    resultingHorizonDeg: Math.round((horizonDeg + bestRollDeg) * 100) / 100,
    recommendedCrop: {
      x: bestCrop.x, y: bestCrop.y, width: bestCrop.width, height: bestCrop.height,
      keepAreaRatio: round3((bestCrop.width * bestCrop.height) / (w * h)), zoomFactor: round3(w / bestCrop.width),
    },
    visualMassCenter, leftRightBalanceRatio, leadRoomRatio: round3(leadRoomRatio), headroomRatio: round3(headroomRatio),
    symmetryEvaluations: finalEvaluations, balloonOcclusions,
    scoreBefore0To100: scoreBefore, scoreAfter0To100: Math.round(bestAfterScore * 10) / 10,
    coachingNotesKo, aiTokensUsed: 0, serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 이방성 종이 섬유 텐서장 & 광물 안료 골짜기 침전 커널
// ============================================================================

export type PaperFiberPresetKind = "hanji" | "cold-press" | "hot-press";

export interface PaperFiberPreset {
  readonly kind: PaperFiberPresetKind; readonly labelKo: string;
  readonly anisotropyRatio: number; readonly primaryFiberAngleDeg: number;
  readonly valleyDepthUm: number; readonly capillaryAbsorbency: number;
  readonly baseSpatialFreq: number; readonly warmPaperReflectanceRgb: readonly [number, number, number];
}

export const PAPER_FIBER_PRESETS: Readonly<Record<PaperFiberPresetKind, PaperFiberPreset>> = {
  hanji: { kind: "hanji", labelKo: "전통 닥종이 한지(장섬유 이방성 결)", anisotropyRatio: 3.6, primaryFiberAngleDeg: 14, valleyDepthUm: 44, capillaryAbsorbency: 0.88, baseSpatialFreq: 0.34, warmPaperReflectanceRgb: [248, 243, 232] },
  "cold-press": { kind: "cold-press", labelKo: "수채 황목(깊은 요철·강한 입상화)", anisotropyRatio: 1.32, primaryFiberAngleDeg: 0, valleyDepthUm: 72, capillaryAbsorbency: 0.62, baseSpatialFreq: 0.26, warmPaperReflectanceRgb: [250, 248, 242] },
  "hot-press": { kind: "hot-press", labelKo: "세목 일러스트지(고밀도 평활 표면)", anisotropyRatio: 1.12, primaryFiberAngleDeg: 0, valleyDepthUm: 12, capillaryAbsorbency: 0.25, baseSpatialFreq: 0.42, warmPaperReflectanceRgb: [252, 251, 249] },
};

export interface MineralPigmentSpec {
  readonly pigmentId: string; readonly labelKo: string; readonly specificGravity: number;
  readonly flocculationAffinity: number; readonly stainingPower: number; readonly massToneRgb: readonly [number, number, number];
}

export interface PigmentSimulationInput {
  readonly width: number; readonly height: number; readonly paperKind: PaperFiberPresetKind;
  readonly pigment: MineralPigmentSpec; readonly seed?: number; readonly fiberAngleOverrideDeg?: number;
  readonly steps?: number; readonly initialWaterMask?: Float32Array; readonly initialPigmentLoad?: Float32Array;
}

export interface FiberDiffusionTensor2d { readonly dxx: number; readonly dxy: number; readonly dyy: number }

export interface PigmentGranulationResult {
  readonly width: number; readonly height: number; readonly paperKind: PaperFiberPresetKind;
  readonly fiberDiffusionTensor: FiberDiffusionTensor2d; readonly heightField: Float32Array;
  readonly valleyConcavityField: Float32Array; readonly pigmentSettledField: Float32Array;
  readonly rgbaPreview: Uint8ClampedArray; readonly granulationIndex: number; readonly measuredCapillaryAnisotropy: number;
}

function hash2dDeterministic(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix; const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
  const v00 = hash2dDeterministic(ix, iy, seed); const v10 = hash2dDeterministic(ix + 1, iy, seed);
  const v01 = hash2dDeterministic(ix, iy + 1, seed); const v11 = hash2dDeterministic(ix + 1, iy + 1, seed);
  return (v00 + (v10 - v00) * ux) * (1 - uy) + (v01 + (v11 - v01) * ux) * uy;
}

/**
 * 종이 결(한지·황목·세목)의 2×2 이방성 모세관 확산 텐서와 요철 높이장 위에
 * 무거운 광물 안료가 골짜기로 침전되는 입상화(Granulation) 과정을 계산한다.
 */
export function simulateAnisotropicPaperGranulation(input: PigmentSimulationInput): PigmentGranulationResult {
  const w = Math.max(8, Math.round(input.width));
  const h = Math.max(8, Math.round(input.height));
  const n = w * h;
  const preset = PAPER_FIBER_PRESETS[input.paperKind];
  const seed = (input.seed ?? 20260909) >>> 0;
  const angleRad = (input.fiberAngleOverrideDeg ?? preset.primaryFiberAngleDeg) * DEG_TO_RAD;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const dParallel = 0.22 * preset.capillaryAbsorbency * Math.min(2.2, Math.sqrt(preset.anisotropyRatio));
  const dPerp = dParallel / preset.anisotropyRatio;
  const fiberDiffusionTensor: FiberDiffusionTensor2d = {
    dxx: cosA * cosA * dParallel + sinA * sinA * dPerp,
    dxy: cosA * sinA * (dParallel - dPerp),
    dyy: sinA * sinA * dParallel + cosA * cosA * dPerp,
  };

  const heightField = new Float32Array(n);
  const valleyScale = preset.valleyDepthUm / 72;
  const stretchPar = preset.baseSpatialFreq / preset.anisotropyRatio;
  const stretchPerp = preset.baseSpatialFreq;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const uPar = x * cosA + y * sinA;
      const uPerp = -x * sinA + y * cosA;
      let val = 0.58 * valueNoise2d(uPar * stretchPar, uPerp * stretchPerp, seed) +
        0.28 * valueNoise2d(uPar * stretchPar * 2.1, uPerp * stretchPerp * 2.1, seed + 97);
      if (input.paperKind === "hanji") {
        val = val * 0.78 + 0.22 * valueNoise2d((x * cosA - y * sinA) * stretchPar * 1.4, (x * sinA + y * cosA) * stretchPerp * 1.1, seed + 313);
      } else {
        val += 0.14 * valueNoise2d(uPar * stretchPar * 4.0, uPerp * stretchPerp * 4.0, seed + 211);
      }
      heightField[y * w + x] = 0.5 + (val - 0.5) * valleyScale;
    }
  }

  const valleyConcavityField = new Float32Array(n);
  const signedLapField = new Float32Array(n);
  for (let y = 0; y < h; y += 1) {
    const ym = Math.max(0, y - 1); const yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x += 1) {
      const xm = Math.max(0, x - 1); const xp = Math.min(w - 1, x + 1);
      const idx = y * w + x;
      const lap = heightField[y * w + xm]! + heightField[y * w + xp]! + heightField[ym * w + x]! + heightField[yp * w + x]! - 4 * heightField[idx]!;
      signedLapField[idx] = lap;
      valleyConcavityField[idx] = Math.max(0, lap);
    }
  }

  const water = new Float32Array(n);
  const suspended = new Float32Array(n);
  const settled = new Float32Array(n);
  const cx = (w - 1) * 0.5; const cy = (h - 1) * 0.5;
  const r0 = Math.max(2.5, Math.min(w, h) * 0.22);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (input.initialWaterMask && input.initialPigmentLoad) {
        water[idx] = input.initialWaterMask[idx] ?? 0;
        suspended[idx] = input.initialPigmentLoad[idx] ?? 0;
      } else {
        const drop = clamp(1 - Math.hypot(x - cx, y - cy) / r0, 0, 1);
        water[idx] = drop > 0 ? 0.92 * drop : 0;
        suspended[idx] = drop > 0 ? 0.95 * drop : 0;
      }
    }
  }

  const steps = clamp(Math.round(input.steps ?? 18), 2, 48);
  const nextWater = new Float32Array(n);
  const nextSuspended = new Float32Array(n);
  const gravityWeight = clamp((input.pigment.specificGravity - 1.0) / 3.2, 0.02, 1.2);
  const flocWeight = 0.25 + 0.75 * clamp(input.pigment.flocculationAffinity, 0, 1);
  const settleBaseRate = 0.05 + 0.14 * gravityWeight * flocWeight;
  for (let step = 0; step < steps; step += 1) {
    for (let y = 0; y < h; y += 1) {
      const ym = Math.max(0, y - 1); const yp = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x += 1) {
        const xm = Math.max(0, x - 1); const xp = Math.min(w - 1, x + 1);
        const idx = y * w + x;
        const wC = water[idx]!;
        const wxx = water[y * w + xm]! - 2 * wC + water[y * w + xp]!;
        const wyy = water[ym * w + x]! - 2 * wC + water[yp * w + x]!;
        const wxy = (water[yp * w + xp]! - water[yp * w + xm]! - water[ym * w + xp]! + water[ym * w + xm]!) * 0.25;
        const diffW = fiberDiffusionTensor.dxx * wxx + 2 * fiberDiffusionTensor.dxy * wxy + fiberDiffusionTensor.dyy * wyy;

        const sC = suspended[idx]!;
        const sxx = suspended[y * w + xm]! - 2 * sC + suspended[y * w + xp]!;
        const syy = suspended[ym * w + x]! - 2 * sC + suspended[yp * w + x]!;
        const sxy = (suspended[yp * w + xp]! - suspended[yp * w + xm]! - suspended[ym * w + xp]! + suspended[ym * w + xm]!) * 0.25;
        const wetMobility = clamp(wC, 0, 1);
        const diffS = (0.28 + 0.72 * wetMobility) * (fiberDiffusionTensor.dxx * sxx + 2 * fiberDiffusionTensor.dxy * sxy + fiberDiffusionTensor.dyy * syy);

        // 마루(signedLap < 0)에서 이탈해 골짜기(signedLap > 0)로 수렴하는 중력·응집 드리프트
        const slopeShift = sC * wetMobility * gravityWeight * flocWeight * signedLapField[idx]! * 2.6;
        const sAdvected = Math.max(0, sC + diffS + slopeShift);
        const valleyBoost = Math.max(0.15, 1 + signedLapField[idx]! * 18 * gravityWeight * flocWeight);
        const deposit = Math.min(sAdvected, sAdvected * settleBaseRate * valleyBoost);
        nextWater[idx] = Math.max(0, (wC + diffW) * 0.968);
        nextSuspended[idx] = sAdvected - deposit;
        settled[idx] = settled[idx]! + deposit;
      }
    }
    water.set(nextWater);
    suspended.set(nextSuspended);
  }

  let varPar = 0; let varPerp = 0; let massTot = 0;
  const rgbaPreview = new Uint8ClampedArray(n * 4);
  const [pr, pg, pb] = preset.warmPaperReflectanceRgb;
  const [mr, mg, mb] = input.pigment.massToneRgb;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      const finalPigment = settled[idx]! + suspended[idx]! * (0.35 + 0.65 * input.pigment.stainingPower);
      settled[idx] = finalPigment;
      const hVal = heightField[idx]!;
      const dx = x - cx; const dy = y - cy;
      const dPar = dx * cosA + dy * sinA; const dPerp = -dx * sinA + dy * cosA;
      varPar += finalPigment * dPar * dPar; varPerp += finalPigment * dPerp * dPerp; massTot += finalPigment;

      const trans = Math.exp(-clamp(finalPigment * 1.65, 0, 4));
      const shade = 0.94 + 0.12 * (hVal - 0.5);
      const outIdx = idx * 4;
      rgbaPreview[outIdx] = Math.round(clamp((mr + (pr - mr) * trans) * shade, 0, 255));
      rgbaPreview[outIdx + 1] = Math.round(clamp((mg + (pg - mg) * trans) * shade, 0, 255));
      rgbaPreview[outIdx + 2] = Math.round(clamp((mb + (pb - mb) * trans) * shade, 0, 255));
      rgbaPreview[outIdx + 3] = 255;
    }
  }

  // 국소 3×3 평균 농도로 정규화해 붓칠 두께 감쇠와 무관한 순수 골짜기 대 마루 입상화 지수를 계측한다.
  let valleyRelSum = 0; let valleyCnt = 0; let peakRelSum = 0; let peakCnt = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = y * w + x;
      const localMean = (
        settled[(y - 1) * w + x]! + settled[(y + 1) * w + x]! +
        settled[y * w + (x - 1)]! + settled[y * w + (x + 1)]! + settled[idx]!
      ) * 0.2;
      if (localMean < 0.05) continue;
      const rel = settled[idx]! / localMean;
      if (signedLapField[idx]! > 0.015) { valleyRelSum += rel; valleyCnt += 1; }
      else if (signedLapField[idx]! < -0.015) { peakRelSum += rel; peakCnt += 1; }
    }
  }
  const meanValley = valleyCnt > 0 ? valleyRelSum / valleyCnt : 1;
  const meanPeak = peakCnt > 0 ? peakRelSum / peakCnt : 1;
  const granulationIndex = meanValley + meanPeak > 1e-6 ? Math.round(clamp((meanValley - meanPeak) / (meanValley + meanPeak), 0, 1) * 10000) / 10000 : 0;
  const measuredCapillaryAnisotropy = massTot > 1e-6 && varPerp > 1e-6 ? round3(Math.sqrt(varPar / varPerp)) : 1;
  return { width: w, height: h, paperKind: input.paperKind, fiberDiffusionTensor, heightField, valleyConcavityField, pigmentSettledField: settled, rgbaPreview, granulationIndex, measuredCapillaryAnisotropy };
}

// 3. 권한 격리형 결정론 Wasm 샌드박스 플러그인 호스트
export type SandboxHostCapability = "prng" | "fuel-meter";
export interface WasmSandboxPolicy {
  readonly maxBinaryBytes: number; readonly maxMemoryPages: number; readonly fuelBudget: number;
  readonly allowedCapabilities: readonly SandboxHostCapability[]; readonly allowMemoryGrow?: boolean; readonly allowStartSection?: boolean;
}
export interface WasmImportDescriptor { readonly moduleName: string; readonly fieldName: string; readonly kindCode: number }
export interface WasmValidationIssue {
  readonly code: "invalid-magic-or-version" | "binary-too-large" | "malformed-section" | "forbidden-import" | "unbounded-memory" | "memory-cap-exceeded" | "forbidden-start-section" | "forbidden-memory-grow-opcode" | "static-fuel-exceeded";
  readonly detailKo: string;
}
export interface WasmBinaryInspectionReport {
  readonly valid: boolean; readonly byteLength: number; readonly sectionIds: readonly number[];
  readonly imports: readonly WasmImportDescriptor[]; readonly exports: readonly string[];
  readonly declaredInitialPages: number; readonly declaredMaxPages: number | null;
  readonly staticInstructionBytes: number; readonly issues: readonly WasmValidationIssue[];
}
export interface WasmPixelFilterRunInput {
  readonly wasmBytes: Uint8Array; readonly rgbaInput: Uint8ClampedArray;
  readonly width: number; readonly height: number; readonly seedU32: number;
  readonly param0?: number; readonly exportFunctionName?: string;
}
export interface WasmPixelFilterRunResult {
  readonly ok: boolean; readonly rgbaOutput: Uint8ClampedArray | null;
  readonly fuelUsed: number; readonly prngCalls: number; readonly rejectionReason?: string;
}

function readUleb128(bytes: Uint8Array, startOffset: number): { readonly value: number; readonly nextOffset: number } | null {
  let result = 0; let shift = 0; let pos = startOffset;
  while (pos < bytes.length && shift < 35) {
    const byte = bytes[pos]!; pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result >>> 0, nextOffset: pos };
    shift += 7;
  }
  return null;
}

function readUtf8Name(bytes: Uint8Array, offset: number, endLimit: number): { readonly text: string; readonly nextOffset: number } | null {
  const lenParsed = readUleb128(bytes, offset);
  if (!lenParsed || lenParsed.nextOffset + lenParsed.value > endLimit) return null;
  const end = lenParsed.nextOffset + lenParsed.value;
  return { text: new TextDecoder("utf-8").decode(bytes.subarray(lenParsed.nextOffset, end)), nextOffset: end };
}

/**
 * Wasm 바이너리의 매직·섹션·임포트 허용목록·메모리 페이지 상한·금지 명령어를 정적 검증한다.
 */
export function inspectAndValidateWasmPluginBinary(wasmBytes: Uint8Array, policy: WasmSandboxPolicy): WasmBinaryInspectionReport {
  const issues: WasmValidationIssue[] = [];
  const sectionIds: number[] = []; const imports: WasmImportDescriptor[] = []; const exports: string[] = [];
  let declaredInitialPages = 0; let declaredMaxPages: number | null = null; let staticInstructionBytes = 0;

  if (wasmBytes.byteLength > policy.maxBinaryBytes) {
    issues.push({ code: "binary-too-large", detailKo: `플러그인 크기(${wasmBytes.byteLength}B)가 상한(${policy.maxBinaryBytes}B)을 초과했습니다.` });
  }
  const okHeader = wasmBytes.byteLength >= 8 &&
    wasmBytes[0] === 0x00 && wasmBytes[1] === 0x61 && wasmBytes[2] === 0x73 && wasmBytes[3] === 0x6d &&
    wasmBytes[4] === 0x01 && wasmBytes[5] === 0x00 && wasmBytes[6] === 0x00 && wasmBytes[7] === 0x00;
  if (!okHeader) {
    issues.push({ code: "invalid-magic-or-version", detailKo: "유효한 WebAssembly v1 매직 헤더(0x00 61 73 6d)가 아닙니다." });
    return { valid: false, byteLength: wasmBytes.byteLength, sectionIds, imports, exports, declaredInitialPages, declaredMaxPages, staticInstructionBytes, issues };
  }

  const allowedCapSet = new Set(policy.allowedCapabilities);
  let pos = 8;
  while (pos < wasmBytes.byteLength) {
    const sectionId = wasmBytes[pos]!; pos += 1;
    const sizeInfo = readUleb128(wasmBytes, pos);
    if (!sizeInfo || sectionId > 12 || sizeInfo.nextOffset + sizeInfo.value > wasmBytes.byteLength) {
      issues.push({ code: "malformed-section", detailKo: "손상되거나 경계를 벗어난 Wasm 섹션 헤더가 감지되었습니다." }); break;
    }
    const secStart = sizeInfo.nextOffset; const secEnd = secStart + sizeInfo.value;
    sectionIds.push(sectionId);
    if (sectionId === 2) {
      const cntInfo = readUleb128(wasmBytes, secStart);
      if (!cntInfo) issues.push({ code: "malformed-section", detailKo: "임포트 개수를 읽을 수 없습니다." });
      else {
        let cur = cntInfo.nextOffset;
        for (let i = 0; i < cntInfo.value; i += 1) {
          const modName = readUtf8Name(wasmBytes, cur, secEnd);
          const fldName = modName ? readUtf8Name(wasmBytes, modName.nextOffset, secEnd) : null;
          if (!modName || !fldName || fldName.nextOffset >= secEnd) { issues.push({ code: "malformed-section", detailKo: "임포트 이름이 손상되었습니다." }); break; }
          const kindCode = wasmBytes[fldName.nextOffset]!; cur = fldName.nextOffset + 1;
          if (kindCode === 0x00) {
            const typeIdx = readUleb128(wasmBytes, cur); if (!typeIdx) break; cur = typeIdx.nextOffset;
          } else if (kindCode === 0x02) {
            const flag = wasmBytes[cur]!; const ini = readUleb128(wasmBytes, cur + 1); if (!ini) break;
            cur = ini.nextOffset; declaredInitialPages = Math.max(declaredInitialPages, ini.value);
            if ((flag & 0x01) !== 0) { const mx = readUleb128(wasmBytes, cur); if (!mx) break; cur = mx.nextOffset; declaredMaxPages = mx.value; }
          } else { issues.push({ code: "forbidden-import", detailKo: `허용되지 않은 임포트 종류(kind=${kindCode})입니다.` }); break; }
          imports.push({ moduleName: modName.text, fieldName: fldName.text, kindCode });
          const okPrng = modName.text === "sandbox_env" && (fldName.text === "rand_u32" || fldName.text === "rand_f32") && allowedCapSet.has("prng");
          const okFuel = modName.text === "sandbox_env" && fldName.text === "consume_fuel" && allowedCapSet.has("fuel-meter");
          if (!okPrng && !okFuel) issues.push({ code: "forbidden-import", detailKo: `권한 허용목록 밖의 외부 임포트(${modName.text}.${fldName.text})가 차단되었습니다.` });
        }
      }
    } else if (sectionId === 5) {
      const cntInfo = readUleb128(wasmBytes, secStart);
      if (cntInfo && cntInfo.value > 0 && cntInfo.nextOffset < secEnd) {
        const limitFlags = wasmBytes[cntInfo.nextOffset]!;
        const ini = readUleb128(wasmBytes, cntInfo.nextOffset + 1);
        if (ini) {
          declaredInitialPages = ini.value;
          if (ini.value > policy.maxMemoryPages) issues.push({ code: "memory-cap-exceeded", detailKo: `초기 메모리(${ini.value}p)가 상한(${policy.maxMemoryPages}p)을 초과했습니다.` });
          if ((limitFlags & 0x01) === 0) issues.push({ code: "unbounded-memory", detailKo: "최대 페이지 상한 없는 비제한 메모리는 금지됩니다." });
          else {
            const mx = readUleb128(wasmBytes, ini.nextOffset);
            if (mx) { declaredMaxPages = mx.value; if (mx.value > policy.maxMemoryPages) issues.push({ code: "memory-cap-exceeded", detailKo: `최대 메모리(${mx.value}p)가 상한(${policy.maxMemoryPages}p)을 초과했습니다.` }); }
          }
        }
      }
    } else if (sectionId === 7) {
      const cntInfo = readUleb128(wasmBytes, secStart);
      if (cntInfo) {
        let cur = cntInfo.nextOffset;
        for (let i = 0; i < cntInfo.value; i += 1) {
          const expName = readUtf8Name(wasmBytes, cur, secEnd); if (!expName || expName.nextOffset >= secEnd) break;
          exports.push(expName.text);
          const idxInfo = readUleb128(wasmBytes, expName.nextOffset + 1); if (!idxInfo) break; cur = idxInfo.nextOffset;
        }
      }
    } else if (sectionId === 8 && !policy.allowStartSection) {
      issues.push({ code: "forbidden-start-section", detailKo: "호출 전 임의 실행을 유발하는 Wasm start 섹션은 차단됩니다." });
    } else if (sectionId === 10) {
      staticInstructionBytes = sizeInfo.value;
      if (!policy.allowMemoryGrow) {
        for (let k = secStart; k + 1 < secEnd; k += 1) {
          if (wasmBytes[k] === 0x40 && wasmBytes[k + 1] === 0x00) { issues.push({ code: "forbidden-memory-grow-opcode", detailKo: "런타임 메모리 확장 명령(memory.grow)이 차단되었습니다." }); break; }
        }
      }
      if (staticInstructionBytes > policy.fuelBudget) issues.push({ code: "static-fuel-exceeded", detailKo: `코드 크기(${staticInstructionBytes}B)가 연료 예산(${policy.fuelBudget})을 초과했습니다.` });
    }
    pos = secEnd;
  }
  return { valid: issues.length === 0, byteLength: wasmBytes.byteLength, sectionIds, imports, exports, declaredInitialPages, declaredMaxPages, staticInstructionBytes, issues };
}

class SandboxFuelExhaustedError extends Error {
  constructor() { super("Wasm 플러그인 연료 예산을 초과하여 즉시 중단했습니다."); }
}

/** 결정론 PRNG(`Mulberry32`)와 연료 계량기만 선택 주입하여 순수 픽셀 필터 Wasm을 격리 실행한다. */
export class DeterministicWasmPluginHost {
  private readonly policy: WasmSandboxPolicy;
  constructor(policy: WasmSandboxPolicy) { this.policy = policy; }

  async runPixelFilter(input: WasmPixelFilterRunInput): Promise<WasmPixelFilterRunResult> {
    const inspection = inspectAndValidateWasmPluginBinary(input.wasmBytes, this.policy);
    if (!inspection.valid) return { ok: false, rgbaOutput: null, fuelUsed: 0, prngCalls: 0, rejectionReason: inspection.issues.map((i) => `${i.code}: ${i.detailKo}`).join(" | ") };
    const pixelCount = Math.max(0, Math.round(input.width) * Math.round(input.height));
    const byteLen = pixelCount * 4;
    const requiredPages = Math.max(1, Math.ceil(byteLen / 65536));
    if (requiredPages > this.policy.maxMemoryPages || requiredPages > inspection.declaredInitialPages) {
      return { ok: false, rgbaOutput: null, fuelUsed: 0, prngCalls: 0, rejectionReason: "memory-cap-exceeded: 입력 이미지 크기가 플러그인 메모리 한도를 초과했습니다." };
    }
    let fuelUsed = inspection.staticInstructionBytes + pixelCount;
    if (fuelUsed > this.policy.fuelBudget) return { ok: false, rgbaOutput: null, fuelUsed, prngCalls: 0, rejectionReason: "fuel-exhausted: 정적+픽셀 연료 예산 초과로 실행을 차단했습니다." };

    let state = input.seedU32 >>> 0; let prngCalls = 0;
    const nextRandU32 = (): number => {
      prngCalls += 1; fuelUsed += 1;
      if (fuelUsed > this.policy.fuelBudget) throw new SandboxFuelExhaustedError();
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
    const importObject: WebAssembly.Imports = {
      sandbox_env: {
        rand_u32: () => nextRandU32() | 0, rand_f32: () => nextRandU32() / 4294967296,
        consume_fuel: (ticks: number) => { fuelUsed += Math.max(0, ticks | 0); if (fuelUsed > this.policy.fuelBudget) throw new SandboxFuelExhaustedError(); },
      },
    };
    try {
      const wasmCopy = new Uint8Array(input.wasmBytes.byteLength); wasmCopy.set(input.wasmBytes);
      const instantiated = await WebAssembly.instantiate(wasmCopy, importObject);
      const exportsObj = instantiated.instance.exports;
      const mem = exportsObj["memory"]; const fnName = input.exportFunctionName ?? "apply_filter"; const fn = exportsObj[fnName];
      if (!(mem instanceof WebAssembly.Memory) || typeof fn !== "function") {
        return { ok: false, rgbaOutput: null, fuelUsed, prngCalls, rejectionReason: `missing-export: memory 또는 ${fnName} 익스포트가 없습니다.` };
      }
      new Uint8Array(mem.buffer).set(input.rgbaInput.subarray(0, byteLen), 0);
      (fn as (ptr: number, count: number, param: number) => number)(0, pixelCount, (input.param0 ?? 0) | 0);
      const out = new Uint8ClampedArray(byteLen); out.set(new Uint8Array(mem.buffer, 0, byteLen));
      return { ok: true, rgbaOutput: out, fuelUsed, prngCalls };
    } catch (err) {
      const reason = err instanceof SandboxFuelExhaustedError ? `fuel-exhausted: ${err.message}` : `runtime-trap: ${err instanceof Error ? err.message : String(err)}`;
      return { ok: false, rgbaOutput: null, fuelUsed, prngCalls, rejectionReason: reason };
    }
  }
}

/**
 * 결정론 픽셀 그레인/밝기 변조 표준 Wasm 바이너리(`apply_filter`) 생성기.
 */
export function buildDeterministicGrainFilterWasmBinary(initialPages = 1, maxPages = 2): Uint8Array {
  const typePayload = [3, 0x60, 1, 0x7f, 0, 0x60, 0, 1, 0x7f, 0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7f];
  const enc = (s: string): number[] => [s.length, ...Array.from(s, (ch) => ch.charCodeAt(0))];
  const importPayload = [2, ...enc("sandbox_env"), ...enc("consume_fuel"), 0x00, 0x00, ...enc("sandbox_env"), ...enc("rand_u32"), 0x00, 0x01];
  const expPayload = [2, ...enc("memory"), 0x02, 0x00, ...enc("apply_filter"), 0x00, 0x02];
  const body = [
    1, 3, 0x7f, 0x20, 1, 0x10, 0, 0x03, 0x40, 0x20, 3, 0x20, 1, 0x49, 0x04, 0x40,
    0x20, 0, 0x20, 3, 0x41, 2, 0x74, 0x6a, 0x21, 4, 0x20, 4, 0x20, 4, 0x2d, 0x00, 0x00,
    0x20, 2, 0x6a, 0x10, 1, 0x41, 3, 0x71, 0x41, 1, 0x6b, 0x6a,
    0x22, 5, 0x41, 0, 0x48, 0x04, 0x7f, 0x41, 0, 0x05, 0x20, 5, 0x0b,
    0x22, 5, 0x41, 0xff, 0x01, 0x4a, 0x04, 0x7f, 0x41, 0xff, 0x01, 0x05, 0x20, 5, 0x0b,
    0x3a, 0x00, 0x00, 0x20, 3, 0x41, 1, 0x6a, 0x21, 3, 0x0c, 1, 0x0b, 0x0b, 0x20, 3, 0x0b,
  ];
  const codePayload = [1, body.length, ...body];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, typePayload.length, ...typePayload,
    0x02, importPayload.length, ...importPayload,
    0x03, 2, 1, 0x02,
    0x05, 4, 1, 0x01, initialPages & 0x7f, maxPages & 0x7f,
    0x07, expPayload.length, ...expPayload,
    0x0a, codePayload.length, ...codePayload,
  ]);
}
