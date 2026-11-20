/**
 * @file Wave 36 분광·수채·스트로크 실험 참조 커널
 *
 * 기존 소스에 기록된 REA 참조 메타데이터(원문 artifact·수치 출처는 이번 변경에서 미확인):
 * - Evidence ID: `ev_67bc361991ffe4c8e6059e8f1cd01cea35062b776097da8e2bcd7ad03c28996b`
 * - Parent Analysis Evidence ID: `ev_5d16af20476c45ab0014d93bd5736dc9a75b6eb088fa7815b702b29752992673`
 * - Root Artifact SHA-256: `50dfa5ce0f73b60934f52ce5e568c027f95ff76b20bc365105529baae3366127`
 * - 대상: 12대 경쟁 브러시 품질 엔진 전체 143개 JS/TS/GLSL 소스 파일
 *   1~6. Wave 35 6대 엔진 (David Li Paint, Pavel WebGL Fluid, Tegaki, SignaturePad, Atrament, Drauu)
 *   7. Spectral.js (`spectral.js` — 38-밴드 380~750nm 파장별 Kubelka-Munk K/S·착색력 Tinting Strength·CIE XYZ/OKLab 물리 혼색)
 *   8. 로컬 7채널 이차 안료 실험 모델(4기저 농도 + RGB 잔차, 원산지·외부 구현 호환성 미확인)
 *   9. Alejandro Campos p5.brush (`fill.js`, `stroke.js`, `wash.js`, `hatch.js` — Tyler Hobbs 다각형 수채 번짐 grow/trim/scatter + 비대칭 초가우시안 필압 곡선)
 *  10. Dulnan LazyBrush (`LazyBrush.ts`, `LazyPoint.ts` — 데드존 반경 R_lazy + 마찰 감쇠 1/(1-f)^1.75 견인줄 보정)
 *  11. Jonas Wagner SimplexNoise (`simplex-noise.ts` — F2=0.5*(√3-1), G2=(3-√3)/6, (0.5-x²-y²)⁴*70 무이음새 절차적 종이 결)
 *  12. Preet Shihn Points-on-Curve (`curve-to-bezier.ts`, `index.ts` — 장력 Catmull-Rom→3차 베지어 변환 + Seant23 평탄도 재귀 분할 + RDP)
 * - 커버리지: `relevant_files: 143`, `parsed_javascript_files: 143`, `not-examined: 0`,
 *   `visited_ast_nodes: 114706`, `data-flow: 51007`, `object-flow: 7429`, `closure: 4391`, `call-flow: 2555`
 */

import { runSpectral38BandKubelkaMunkMix } from "../pigment/spectral-38band-km";

import type { Pt as Point2D, Rgb } from "../core/types";

export {
  QUADRATIC_PIGMENT_MODEL,
  evaluateQuadraticPigmentMix,
  quadraticPigmentLatent7ToRgb,
  rgbToQuadraticPigmentLatent7,
} from "../pigment/quadratic-pigment-model";
export type { QuadraticPigmentLatent7, QuadraticPigmentMixResult } from "../pigment/quadratic-pigment-model";

export const COMPETITOR_WAVE36_12ENGINE_REA_EVIDENCE = Object.freeze({
  evidenceId: "ev_67bc361991ffe4c8e6059e8f1cd01cea35062b776097da8e2bcd7ad03c28996b",
  parentEvidenceId: "ev_5d16af20476c45ab0014d93bd5736dc9a75b702b29752992673_143files",
  canonicalParentEvidenceId: "ev_5d16af20476c45ab0014d93bd5736dc9a75b6eb088fa7815b702b29752992673",
  rootArtifactSha256: "50dfa5ce0f73b60934f52ce5e568c027f95ff76b20bc365105529baae3366127",
  evaluatedEngineCount: 12,
  relevantFiles: 143,
  parsedJavaScriptFiles: 143,
  notExaminedCount: 0,
  visitedAstNodes: 114706,
  dataFlowRelations: 51007,
  objectFlowRelations: 7429,
  closureRelations: 4391,
  callFlowRelations: 2555,
});

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

// ============================================================================
// 1. Spectral.js 38-Band (380nm–750nm) Kubelka-Munk + Tinting Strength + OKLab
// ============================================================================

export interface Spectral38BandMixParams {
  readonly colorASrgb01: Rgb;
  readonly colorBSrgb01: Rgb;
  readonly factorA: number;
  readonly factorB: number;
  readonly tintingStrengthA?: number;
  readonly tintingStrengthB?: number;
}

export interface Spectral38BandMixResult {
  readonly mixedSrgb01: Rgb;
  readonly mixedLinearRgb01: Rgb;
  readonly oklabLCh: { readonly L: number; readonly C: number; readonly hDeg: number };
  readonly spectralReflectance38: readonly number[];
  readonly chromaPreservationDeltaC: number;
  readonly chromaPreservationGain01: number;
}

/**
 * 38밴드(380nm~750nm, 10nm 간격) 클린룸 CIE 1931 2° × D65 + Kubelka-Munk 정본 커널 위임:
 * 7원색 최소기울기 스펙트럼 반사율 R(λ)을 복원하고 KS(R) = (1 - R)² / (2R) 및 착색력·휘도
 * 가중 농도(f² · T² · Y)로 혼색한 뒤 CIE XYZ/OKLab 채도 보존 이득을 실측 계산한다.
 */
export function evaluateSpectral38BandKubelkaMunkMix(
  params: Spectral38BandMixParams,
): Spectral38BandMixResult {
  return runSpectral38BandKubelkaMunkMix(params);
}

// ============================================================================
// 3. p5.brush Tyler Hobbs Watercolor Polygon Bleed + Super-Gaussian Pressure
// ============================================================================

export interface P5BrushBleedAndPressureParams {
  readonly basePolygon: readonly Point2D[];
  readonly bleedStrength01: number;
  readonly bleedDirection: "out" | "in";
  readonly growthIterations: number;
  readonly strokeLengthPx: number;
  readonly sampleArcPosPx: number;
  readonly gaussianPeakRatioA?: number;
  readonly gaussianWidthB?: number;
  readonly gaussianShapeExponentC?: number;
  readonly minPressure01?: number;
  readonly maxPressure01?: number;
  readonly seed?: number;
}

export interface P5BrushBleedAndPressureResult {
  readonly grownVertices: readonly Point2D[];
  readonly centroid: Point2D;
  readonly polygonAreaPx2: number;
  readonly superGaussianPressure01: number;
}

/**
 * Alejandro Campos `p5.brush` (`src/fill/fill.js` FillPoly.grow & `src/stroke/stroke.js` gauss) 역공학:
 * 1) Shoelace 다각형 무게중심(_center) 계산
 * 2) 변 중점 법선(±90° + 미세 각도 섭동) 방향으로 가우시안 변위 d = g * mod 만큼 정점을 2배씩 확장하는
 *    Tyler Hobbs 수채 번짐 다각형 성장(FillPoly.grow)
 * 3) 최고점(peakPos = a*L) 전후 비대칭 반폭(1.2b vs 0.8b)을 갖는 초가우시안(Super-Gaussian) 필압 곡선:
 *    P(s) = map(1 / (1 + |(s - peakPos) / halfWidth|^(2c)), 0, 1, min, max)
 */
export function evaluateP5BrushWatercolorPolygonBleedAndGaussianPressure(
  params: P5BrushBleedAndPressureParams,
): P5BrushBleedAndPressureResult {
  const bleed = clamp01(params.bleedStrength01);
  const iters = clamp(Math.round(params.growthIterations), 1, 4);
  let verts: Point2D[] = params.basePolygon.map((p) => ({ x: p.x, y: p.y }));
  let mods: number[] = verts.map((_, i) => (i % 3 === 0 ? 0.45 : 1.0) * bleed);
  const sign = params.bleedDirection === "out" ? -1 : 1;
  let state = (params.seed ?? 20261027) >>> 0;
  const nextRand01 = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  for (let step = 0; step < iters; step += 1) {
    const nextVerts: Point2D[] = [];
    const nextMods: number[] = [];
    const n = verts.length;
    for (let i = 0; i < n; i += 1) {
      const cv = verts[i]!;
      const nv = verts[(i + 1) % n]!;
      const mi = mods[i]!;
      nextVerts.push(cv);
      nextMods.push(mi);

      const sideX = nv.x - cv.x;
      const sideY = nv.y - cv.y;
      const jitterRad = ((nextRand01() * 2 - 1) * 5 * Math.PI) / 180;
      const rotRad = sign * (Math.PI / 2) + jitterRad;
      const c = Math.cos(rotRad);
      const s = Math.sin(rotRad);
      const dirX = c * sideX + s * sideY;
      const dirY = c * sideY - s * sideX;

      const gaussSample = 0.5 + (nextRand01() + nextRand01() - 1) * 0.2;
      const d = gaussSample * (0.65 + nextRand01() * 0.7) * mi;
      nextVerts.push({
        x: Number((cv.x + sideX * 0.5 + dirX * d).toFixed(3)),
        y: Number((cv.y + sideY * 0.5 + dirY * d).toFixed(3)),
      });
      nextMods.push(Math.max(0.02, mi + (nextRand01() - 0.5) * 0.04));
    }
    verts = nextVerts;
    mods = nextMods;
  }

  // Shoelace area & centroid (_center in fill.js)
  let area2 = 0;
  let cx6 = 0;
  let cy6 = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx6 += (a.x + b.x) * cross;
    cy6 += (a.y + b.y) * cross;
  }
  const area = 0.5 * area2;
  const centroid: Point2D =
    Math.abs(area) > 1e-5
      ? { x: Number((cx6 / (6 * area)).toFixed(3)), y: Number((cy6 / (6 * area)).toFixed(3)) }
      : { x: verts[0]?.x ?? 0, y: verts[0]?.y ?? 0 };

  // Super-Gaussian stroke pressure (gauss in stroke.js)
  const L = Math.max(1, params.strokeLengthPx);
  const sPos = clamp(params.sampleArcPosPx, 0, L);
  const a = clamp(params.gaussianPeakRatioA ?? 0.45, 0.1, 0.9);
  const b = clamp(params.gaussianWidthB ?? 0.65, 0.15, 1.2);
  const cExp = clamp(params.gaussianShapeExponentC ?? 3.2, 1.0, 6.0);
  const minP = clamp01(params.minPressure01 ?? 0.18);
  const maxP = clamp01(params.maxPressure01 ?? 0.96);

  const peakPos = a * L;
  const halfWidth = Math.max(1e-4, (sPos < peakPos ? b * 1.2 : b * 0.8) * (L / 2));
  const rawGauss = 1 / (1 + Math.abs((sPos - peakPos) / halfWidth) ** (2 * cExp));
  const superGaussianPressure01 = Number((minP + rawGauss * (maxP - minP)).toFixed(4));

  return {
    grownVertices: verts,
    centroid,
    polygonAreaPx2: Number(Math.abs(area).toFixed(2)),
    superGaussianPressure01,
  };
}

// ============================================================================
// 4. Dulnan LazyBrush Dead-Zone Friction + Simplex Noise + Flatness Bézier
// ============================================================================

export interface LazySimplexBezierParams {
  readonly brushPoint: Point2D;
  readonly pointerPoint: Point2D;
  readonly lazyRadiusPx: number;
  readonly friction01: number;
  readonly sampleCoord: Point2D;
  readonly curveControlPoints: readonly [Point2D, Point2D, Point2D, Point2D];
  readonly flatnessTolerance: number;
}

export interface LazySimplexBezierResult {
  readonly updatedBrushPoint: Point2D;
  readonly pointerToBrushDistancePx: number;
  readonly pointerToBrushAngleRad: number;
  readonly hasMovedOutsideDeadZone: boolean;
  readonly simplexNoiseMinus1To1: number;
  readonly seant23CubicFlatness: number;
  readonly subdividedCurvePoints: readonly Point2D[];
}

const SQRT3 = Math.sqrt(3.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;
const GRAD2: readonly [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [1, 0], [-1, 0],
  [0, 1], [0, -1], [0, 1], [0, -1],
];

export function evaluateSimplexNoise2D(x: number, y: number, seed = 1337): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s) | 0;
  const j = Math.floor(y + s) | 0;
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const hashCorner = (ci: number, cj: number): [number, number] => {
    const h = (Math.imul(ci ^ seed, 374761393) + Math.imul(cj ^ (seed >>> 3), 668265263)) >>> 0;
    return GRAD2[h % 12]!;
  };

  let n0 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const [gx, gy] = hashCorner(i, j);
    t0 *= t0;
    n0 = t0 * t0 * (gx * x0 + gy * y0);
  }
  let n1 = 0;
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const [gx, gy] = hashCorner(i + i1, j + j1);
    t1 *= t1;
    n1 = t1 * t1 * (gx * x1 + gy * y1);
  }
  let n2 = 0;
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const [gx, gy] = hashCorner(i + 1, j + 1);
    t2 *= t2;
    n2 = t2 * t2 * (gx * x2 + gy * y2);
  }
  return clamp(70.0 * (n0 + n1 + n2), -1, 1);
}

function seant23Flatness(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): number {
  let ux = 3 * p2.x - 2 * p1.x - p4.x;
  ux *= ux;
  let uy = 3 * p2.y - 2 * p1.y - p4.y;
  uy *= uy;
  let vx = 3 * p3.x - 2 * p4.x - p1.x;
  vx *= vx;
  let vy = 3 * p3.y - 2 * p4.y - p1.y;
  vy *= vy;
  if (ux < vx) ux = vx;
  if (uy < vy) uy = vy;
  return ux + uy;
}

function subdivideBezierByFlatness(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
  tolerance: number,
  out: Point2D[],
  depth = 0,
): void {
  if (depth >= 6 || seant23Flatness(p1, p2, p3, p4) < tolerance) {
    if (out.length === 0) out.push(p1);
    out.push(p4);
    return;
  }
  const lerpPt = (a: Point2D, b: Point2D): Point2D => ({
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  });
  const q1 = lerpPt(p1, p2);
  const q2 = lerpPt(p2, p3);
  const q3 = lerpPt(p3, p4);
  const r1 = lerpPt(q1, q2);
  const r2 = lerpPt(q2, q3);
  const red = lerpPt(r1, r2);
  subdivideBezierByFlatness(p1, q1, r1, red, tolerance, out, depth + 1);
  subdivideBezierByFlatness(red, r2, q3, p4, tolerance, out, depth + 1);
}

/**
 * Dulnan `lazy-brush` + Jonas Wagner `simplex-noise` + Preet Shihn `points-on-curve` 통합 역공학 커널:
 * 1) LazyBrush 데드존(distance - radius > 0) 판정 및 마찰 감쇠 이동:
 *    step = (distance - radius) / (1 / (1 - friction)^1.75)
 * 2) 2D Simplex Gradient Noise (F2/G2 정삼각 심플렉스 격자 + (0.5-r²)⁴*70 감쇠)
 * 3) Seant23 3차 베지어 평탄도(flatness = max(ux,vx) + max(uy,vy)) 기반 적응형 De Casteljau 분할
 */
export function evaluateLazySimplexAndFlatnessBezier(
  params: LazySimplexBezierParams,
): LazySimplexBezierResult {
  const dx = params.pointerPoint.x - params.brushPoint.x;
  const dy = params.pointerPoint.y - params.brushPoint.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const radius = Math.max(0, params.lazyRadiusPx);
  const isOutside = Math.round((distance - radius) * 10) / 10 > 0;
  const friction = clamp(params.friction01, 0, 0.95);

  let updatedBrushPoint: Point2D = { ...params.brushPoint };
  if (isOutside) {
    const distanceToMove =
      friction > 0
        ? (distance - radius) / (1 / (1 - friction) ** 1.75)
        : distance - radius;
    const angleRotated = angle + Math.PI / 2;
    updatedBrushPoint = {
      x: Number((params.brushPoint.x + Math.sin(angleRotated) * distanceToMove).toFixed(3)),
      y: Number((params.brushPoint.y - Math.cos(angleRotated) * distanceToMove).toFixed(3)),
    };
  }

  const simplexNoiseMinus1To1 = Number(
    evaluateSimplexNoise2D(params.sampleCoord.x, params.sampleCoord.y).toFixed(4),
  );

  const [p1, p2, p3, p4] = params.curveControlPoints;
  const flatness = Number(seant23Flatness(p1, p2, p3, p4).toFixed(3));
  const subdivided: Point2D[] = [];
  subdivideBezierByFlatness(p1, p2, p3, p4, Math.max(0.05, params.flatnessTolerance), subdivided);

  return {
    updatedBrushPoint,
    pointerToBrushDistancePx: Number(distance.toFixed(3)),
    pointerToBrushAngleRad: Number(angle.toFixed(4)),
    hasMovedOutsideDeadZone: isOutside,
    simplexNoiseMinus1To1,
    seant23CubicFlatness: flatness,
    subdividedCurvePoints: subdivided,
  };
}
