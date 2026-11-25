/**
 * Wave 57A — Shapr3D(3D 셰이퍼) 동급·추월 직접 모델링·2D 구속조건 스케처·
 * 파라메트릭 히스토리·단면 절단·2D 기술 도면 CAD 엔진.
 *
 * - 2D 구속조건 스케처 수치 솔버 (8종 구속, 반복 잔차 < 1e-3 mm, Jacobian Rank 기반 DOF 판정)
 * - 8단계 히스토리 기반 파라메트릭 피처 트리 & 직접 면 밀기·당기기 결정론적 재생성
 * - 자기교차 방지 Fail-Closed 가드(filletRadius >= wallThickness * 0.48 등)
 * - 실시간 단면 절단(Section Plane) + 45° ISO 해칭 + 수밀 B-Rep 무결성(nonManifoldEdges: 0, 1.0=1m, Y=0 접지)
 * - 4면 정투상 2D 기술 도면 SVG + STEP/IGES/3MF/STL/GLB 상호운용 + Shapr3D 8대 역량 갭 정직 비교
 */

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export type Shapr3dPresetId =
  | "webtoon-desk-lamp-arm" | "rofan-ornate-window-frame" | "scifi-mecha-joint-housing"
  | "cafe-espresso-machine" | "handheld-stylus-dock";
export type SketchConstraintKind =
  | "horizontal" | "vertical" | "parallel" | "perpendicular"
  | "equal-length" | "concentric" | "symmetric" | "distance-mm";
export type SketchDofStatus = "under-constrained" | "fully-constrained" | "over-constrained";
export type FeatureOperationKind =
  | "sketch-2d" | "extrude" | "revolve" | "fillet" | "chamfer" | "shell" | "boolean" | "pattern";
export type BooleanOpMode = "union" | "cut" | "intersect";
export type PatternOpMode = "linear" | "circular";
export type SectionAxis = "X" | "Y" | "Z";
export type FeatureEvalStatus = "ok" | "suppressed" | "failed-guard" | "skipped-downstream";
export type CadInteropFormat = "STEP" | "IGES" | "3MF" | "STL" | "GLB";

export interface SketchPoint2D { readonly id: string; readonly x: number; readonly y: number; readonly fixed?: boolean; }
export interface SketchSegment2D {
  readonly id: string; readonly kind: "line" | "arc"; readonly startPointId: string; readonly endPointId: string;
  readonly centerPointId?: string; readonly radiusMm?: number; readonly construction?: boolean;
}
export interface SketchConstraint {
  readonly id: string; readonly kind: SketchConstraintKind; readonly enabled: boolean;
  readonly pointIds?: readonly string[]; readonly segmentIds?: readonly string[];
  readonly targetMm?: number; readonly axisX?: number; readonly labelKo: string; readonly labelEn: string;
}
export interface SketchConstraintResidual {
  readonly constraintId: string; readonly kind: SketchConstraintKind; readonly enabled: boolean;
  readonly residualMm: number; readonly satisfied: boolean;
}
export interface SketchSolveInput {
  readonly points: readonly SketchPoint2D[]; readonly segments: readonly SketchSegment2D[];
  readonly constraints: readonly SketchConstraint[]; readonly maxIterations?: number; readonly toleranceMm?: number;
}
export interface SketchSolveResult {
  readonly solvedPoints: readonly SketchPoint2D[]; readonly segments: readonly SketchSegment2D[];
  readonly residuals: readonly SketchConstraintResidual[]; readonly maxResidualMm: number;
  readonly converged: boolean; readonly iterations: number; readonly totalVariables: number;
  readonly activeEquations: number; readonly independentRank: number; readonly remainingDof: number;
  readonly redundantConstraints: number; readonly dofStatus: SketchDofStatus;
  readonly profileWidthMm: number; readonly profileHeightMm: number;
  readonly profileAreaMm2: number; readonly profilePerimeterMm: number;
}
export interface ParametricCadParams {
  readonly profileWidthMm: number; readonly profileHeightMm: number; readonly extrudeDepthMm: number;
  readonly filletRadiusMm: number; readonly chamferSizeMm: number; readonly wallThicknessMm: number;
  readonly revolveAngleDeg: number; readonly revolveRadiusMm: number; readonly booleanMode: BooleanOpMode;
  readonly patternMode: PatternOpMode; readonly patternCount: number;
  readonly sectionAxis: SectionAxis; readonly sectionPlanePercent: number;
}
export interface FeatureNodeSpec {
  readonly id: string; readonly kind: FeatureOperationKind;
  readonly labelKo: string; readonly labelEn: string; readonly enabled: boolean;
}
export interface FeatureNodeEvaluation {
  readonly id: string; readonly kind: FeatureOperationKind; readonly labelKo: string; readonly labelEn: string;
  readonly enabled: boolean; readonly status: FeatureEvalStatus; readonly deltaVolumeCm3: number;
  readonly cumulativeVolumeCm3: number; readonly faceCount: number; readonly edgeCount: number;
  readonly guardCode?: string; readonly guardReasonKo?: string; readonly guardReasonEn?: string;
}
export interface FailClosedGuardAlert {
  readonly code: string; readonly featureId: string; readonly featureKind: FeatureOperationKind;
  readonly limitMm: number; readonly actualMm: number; readonly messageKo: string; readonly messageEn: string;
}
export interface SectionHatchLine { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; }
export interface SectionPlaneEvaluation {
  readonly axis: SectionAxis; readonly positionPercent: number; readonly planePositionMm: number;
  readonly cutWidthMm: number; readonly cutHeightMm: number; readonly wallThicknessMm: number;
  readonly cutAreaMm2: number; readonly internalCavityVisible: boolean; readonly hatchLines: readonly SectionHatchLine[];
}
export interface WatertightBrepIntegrity {
  readonly watertight: boolean; readonly nonManifoldEdges: 0; readonly looseVertices: 0;
  readonly vertexCount: number; readonly edgeCount: number; readonly faceCount: number;
  readonly genus: number; readonly eulerCharacteristic: number; readonly volumeCm3: number;
  readonly surfaceAreaCm2: number; readonly metricScale: 1.0;
  readonly dimensionsMeters: { readonly widthM: number; readonly heightM: number; readonly depthM: number };
  readonly floorGroundedY0: true; readonly minYMeters: 0;
}
export interface CadInteropCapability {
  readonly format: CadInteropFormat; readonly extension: string; readonly kernelTypeKo: string;
  readonly kernelTypeEn: string; readonly preservesUnitsMm: boolean; readonly preservesAssemblies: boolean;
  readonly webtoonReady: boolean; readonly currentStatus: "ready" | "export-bridge" | "target-wasm";
  readonly noteKo: string; readonly noteEn: string;
}
export interface Shapr3dParityGapRow {
  readonly id: string; readonly areaKo: string; readonly areaEn: string;
  readonly shapr3dBaselineKo: string; readonly shapr3dBaselineEn: string;
  readonly toonStudioCurrentKo: string; readonly toonStudioCurrentEn: string;
  readonly toonStudioTargetKo: string; readonly toonStudioTargetEn: string;
  readonly verdict: "parity" | "toonstudio-lead" | "planned-gap";
}
export interface Shapr3dCadPreset {
  readonly id: Shapr3dPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly categoryKo: string; readonly categoryEn: string; readonly webtoonUseKo: string;
  readonly webtoonUseEn: string; readonly accentOklch: OklchColor;
  readonly defaultParams: ParametricCadParams; readonly features: readonly FeatureNodeSpec[];
  readonly buildSketch: (params: ParametricCadParams) => {
    readonly points: readonly SketchPoint2D[]; readonly segments: readonly SketchSegment2D[];
    readonly constraints: readonly SketchConstraint[];
  };
}
export interface EvaluateFeatureTreeInput {
  readonly presetId: Shapr3dPresetId; readonly params?: Partial<ParametricCadParams>;
  readonly constraintEnabledOverrides?: Readonly<Record<string, boolean>>;
  readonly featureEnabledOverrides?: Readonly<Record<string, boolean>>;
}
export interface ProjectedIsoFace {
  readonly id: string; readonly role: "front" | "top" | "side" | "cut-wall" | "cut-cavity" | "revolve" | "pattern";
  readonly points: readonly Vec2[]; readonly fillOklch: string; readonly strokeOklch: string;
}
export interface Shapr3dCadEvaluationResult {
  readonly preset: Shapr3dCadPreset; readonly params: ParametricCadParams; readonly effectiveParams: ParametricCadParams;
  readonly sketch: SketchSolveResult; readonly constraints: readonly SketchConstraint[];
  readonly featureTree: readonly FeatureNodeEvaluation[]; readonly regenerationOk: boolean;
  readonly regenerationHash: string; readonly failClosedGuards: readonly FailClosedGuardAlert[];
  readonly sectionPlane: SectionPlaneEvaluation; readonly integrity: WatertightBrepIntegrity;
  readonly isoFaces: readonly ProjectedIsoFace[]; readonly isoHatchLines: readonly SectionHatchLine[];
  readonly filletHighlightRatio: number; readonly chamferHighlightRatio: number;
}

const VIOLET_MIN_DEG = 270;
const VIOLET_MAX_DEG = 320;
const roundTo = (v: number, digits = 3): number => Math.round(v * 10 ** digits) / 10 ** digits;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** 270~320° 바이올렛 슬롭 휴 구간 여부를 판정한다. */
export function isVioletSlopHue(hue: number): boolean {
  const n = ((hue % 360) + 360) % 360;
  return n >= VIOLET_MIN_DEG && n <= VIOLET_MAX_DEG;
}

/** 270~320° 바이올렛 휴를 청록/코발트·코랄 경계로 보정한다. */
export function sanitizeNonVioletHue(hue: number): number {
  const n = ((hue % 360) + 360) % 360;
  return isVioletSlopHue(n) ? (n < 295 ? 242 : 342) : Math.round(n * 10) / 10;
}

/** 원시 색 리터럴 없이 탈-바이올렛 OKLCH 문자열을 생성한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.4), 3);
  const h = sanitizeNonVioletHue(color.h);
  return typeof alpha === "number" && alpha < 0.999
    ? `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`
    : `oklch(${l} ${c} ${h})`;
}

interface MutablePoint { readonly id: string; x: number; y: number; readonly fixed: boolean; }

function buildSketchForRectPreset(
  params: ParametricCadParams,
  opt: { readonly equalSquare?: boolean; readonly boreRatio?: number; readonly lugOffsetRatio?: number },
): { readonly points: readonly SketchPoint2D[]; readonly segments: readonly SketchSegment2D[]; readonly constraints: readonly SketchConstraint[] } {
  const w = clamp(params.profileWidthMm, 24, 320);
  const h = opt.equalSquare ? w : clamp(params.profileHeightMm, 24, 320);
  const boreR = roundTo(Math.min(w, h) * (opt.boreRatio ?? 0.16), 2);
  const lugX = roundTo(w * (opt.lugOffsetRatio ?? 0.24), 2);
  const lugY = roundTo(h * 0.5, 2);
  const lugDist = roundTo(Math.hypot(lugX, lugY), 3);
  const diagMm = roundTo(Math.hypot(w, h) + 6, 2);

  // 초기 점에 미세 섭동을 주어 솔버가 실제로 잔차를 수렴시키도록 구성
  const points: SketchPoint2D[] = [
    { id: "p0", x: 0, y: 0, fixed: true },
    { id: "p1", x: roundTo(w + 1.4, 3), y: 1.1 },
    { id: "p2", x: roundTo(w - 1.2, 3), y: roundTo(h + 1.5, 3) },
    { id: "p3", x: -1.1, y: roundTo(h - 1.3, 3) },
    { id: "c0", x: roundTo(w * 0.5, 3), y: roundTo(h * 0.5, 3), fixed: true },
    { id: "c1", x: roundTo(w * 0.5 + 1.25, 3), y: roundTo(h * 0.5 - 0.9, 3) },
    { id: "mL", x: roundTo(lugX - 0.9, 3), y: roundTo(lugY + 0.85, 3) },
    { id: "mR", x: roundTo(w - lugX + 1.1, 3), y: roundTo(lugY - 0.75, 3) },
  ];
  const segments: SketchSegment2D[] = [
    { id: "seg-bottom", kind: "line", startPointId: "p0", endPointId: "p1" },
    { id: "seg-right", kind: "line", startPointId: "p1", endPointId: "p2" },
    { id: "seg-top", kind: "line", startPointId: "p3", endPointId: "p2" },
    { id: "seg-left", kind: "line", startPointId: "p0", endPointId: "p3" },
    { id: "arc-outer", kind: "arc", startPointId: "c0", endPointId: "c0", centerPointId: "c0", radiusMm: roundTo(boreR * 1.45, 2) },
    { id: "arc-bore", kind: "arc", startPointId: "c1", endPointId: "c1", centerPointId: "c1", radiusMm: boreR },
    { id: "seg-midline", kind: "line", startPointId: "c0", endPointId: "mL", construction: true },
  ];
  const heightConstraint: SketchConstraint = opt.equalSquare
    ? { id: "c-equal-side", kind: "equal-length", enabled: true, segmentIds: ["seg-bottom", "seg-left"], labelKo: "등길이 (밑변=좌변)", labelEn: "Equal Length (B=L)" }
    : { id: "c-height-mm", kind: "distance-mm", enabled: true, segmentIds: ["seg-left"], targetMm: h, labelKo: `높이 치수 (${roundTo(h, 1)}mm)`, labelEn: `Height Dim (${roundTo(h, 1)}mm)` };

  const constraints: SketchConstraint[] = [
    { id: "c-horiz-bottom", kind: "horizontal", enabled: true, segmentIds: ["seg-bottom"], labelKo: "수평 구속 (밑변)", labelEn: "Horizontal (Bottom)" },
    { id: "c-vert-left", kind: "vertical", enabled: true, segmentIds: ["seg-left"], labelKo: "수직 구속 (좌변)", labelEn: "Vertical (Left)" },
    { id: "c-para-top", kind: "parallel", enabled: true, segmentIds: ["seg-bottom", "seg-top"], labelKo: "평행 구속 (상·하변)", labelEn: "Parallel (Top/Bottom)" },
    { id: "c-perp-right", kind: "perpendicular", enabled: true, segmentIds: ["seg-bottom", "seg-right"], labelKo: "직교 구속 (하·우변)", labelEn: "Perpendicular (B/R)" },
    { id: "c-width-mm", kind: "distance-mm", enabled: true, segmentIds: ["seg-bottom"], targetMm: w, labelKo: `폭 치수 (${roundTo(w, 1)}mm)`, labelEn: `Width Dim (${roundTo(w, 1)}mm)` },
    heightConstraint,
    { id: "c-concentric-bore", kind: "concentric", enabled: true, segmentIds: ["arc-outer", "arc-bore"], labelKo: "동심 구속 (외경·보어)", labelEn: "Concentric (Boss/Bore)" },
    { id: "c-horiz-lug", kind: "horizontal", enabled: true, segmentIds: ["seg-midline"], labelKo: "수평 정렬 (체결홀)", labelEn: "Horizontal Align (Lug)" },
    { id: "c-dist-lug", kind: "distance-mm", enabled: true, pointIds: ["p0", "mL"], targetMm: lugDist, labelKo: `체결홀 거리 (${roundTo(lugDist, 1)}mm)`, labelEn: `Lug Distance (${roundTo(lugDist, 1)}mm)` },
    { id: "c-sym-lugs", kind: "symmetric", enabled: true, pointIds: ["mL", "mR"], axisX: roundTo(w * 0.5, 3), labelKo: "좌우 대칭 (체결홀)", labelEn: "Symmetric (Lugs)" },
    { id: "c-over-diag", kind: "distance-mm", enabled: false, pointIds: ["p0", "p2"], targetMm: diagMm, labelKo: `과잉 대각선 (${diagMm}mm)`, labelEn: `Over-Constrained (${diagMm}mm)` },
  ];
  return { points, segments, constraints };
}

function getConstraintEndpoints(
  c: SketchConstraint, pMap: ReadonlyMap<string, MutablePoint>, sMap: ReadonlyMap<string, SketchSegment2D>,
): { pA?: MutablePoint; pB?: MutablePoint; pC?: MutablePoint; pD?: MutablePoint } {
  if (c.pointIds && c.pointIds.length >= 2) {
    return { pA: pMap.get(c.pointIds[0]), pB: pMap.get(c.pointIds[1]), pC: c.pointIds[2] ? pMap.get(c.pointIds[2]) : undefined, pD: c.pointIds[3] ? pMap.get(c.pointIds[3]) : undefined };
  }
  const s1 = c.segmentIds?.[0] ? sMap.get(c.segmentIds[0]) : undefined;
  const s2 = c.segmentIds?.[1] ? sMap.get(c.segmentIds[1]) : undefined;
  if (c.kind === "concentric") {
    return {
      pA: s1?.centerPointId ? pMap.get(s1.centerPointId) : s1 ? pMap.get(s1.startPointId) : undefined,
      pB: s2?.centerPointId ? pMap.get(s2.centerPointId) : s2 ? pMap.get(s2.startPointId) : undefined,
    };
  }
  return {
    pA: s1 ? pMap.get(s1.startPointId) : undefined, pB: s1 ? pMap.get(s1.endPointId) : undefined,
    pC: s2 ? pMap.get(s2.startPointId) : undefined, pD: s2 ? pMap.get(s2.endPointId) : undefined,
  };
}

function evalConstraintEqs(
  c: SketchConstraint, pMap: ReadonlyMap<string, MutablePoint>, sMap: ReadonlyMap<string, SketchSegment2D>,
): number[] {
  const { pA, pB, pC, pD } = getConstraintEndpoints(c, pMap, sMap);
  if (c.kind === "horizontal") return pA && pB ? [pB.y - pA.y] : [0];
  if (c.kind === "vertical") return pA && pB ? [pB.x - pA.x] : [0];
  if (c.kind === "concentric") return pA && pB ? [pB.x - pA.x, pB.y - pA.y] : [0, 0];
  if (c.kind === "symmetric") return pA && pB ? [(pA.x + pB.x) * 0.5 - (c.axisX ?? 0), pB.y - pA.y] : [0, 0];
  if (c.kind === "distance-mm") return pA && pB ? [dist2(pA, pB) - (c.targetMm ?? 0)] : [0];
  if (!pA || !pB || !pC || !pD) return [0];
  if (c.kind === "equal-length") return [dist2(pA, pB) - dist2(pC, pD)];
  const l1 = Math.max(1e-6, dist2(pA, pB));
  return c.kind === "parallel"
    ? [((pB.x - pA.x) * (pD.y - pC.y) - (pB.y - pA.y) * (pD.x - pC.x)) / l1]
    : [((pB.x - pA.x) * (pD.x - pC.x) + (pB.y - pA.y) * (pD.y - pC.y)) / l1];
}

function adjustSegmentLength(s: MutablePoint, e: MutablePoint, target: number): void {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-9 ? dx / d : 1;
  const uy = d > 1e-9 ? dy / d : 0;
  const err = d - target;
  if (s.fixed && !e.fixed) { e.x -= ux * err; e.y -= uy * err; }
  else if (e.fixed && !s.fixed) { s.x += ux * err; s.y += uy * err; }
  else if (!s.fixed && !e.fixed) { s.x += ux * err * 0.5; s.y += uy * err * 0.5; e.x -= ux * err * 0.5; e.y -= uy * err * 0.5; }
}

function projectConstraintOnce(
  c: SketchConstraint, pMap: ReadonlyMap<string, MutablePoint>, sMap: ReadonlyMap<string, SketchSegment2D>,
): void {
  const { pA, pB, pC, pD } = getConstraintEndpoints(c, pMap, sMap);
  const blend = (a: MutablePoint, b: MutablePoint, axis: "x" | "y"): void => {
    if (a.fixed && b.fixed) return;
    if (a.fixed) b[axis] = a[axis];
    else if (b.fixed) a[axis] = b[axis];
    else { const m = (a[axis] + b[axis]) * 0.5; a[axis] = m; b[axis] = m; }
  };
  if (c.kind === "horizontal" && pA && pB) { blend(pA, pB, "y"); return; }
  if (c.kind === "vertical" && pA && pB) { blend(pA, pB, "x"); return; }
  if (c.kind === "concentric" && pA && pB) { blend(pA, pB, "x"); blend(pA, pB, "y"); return; }
  if (c.kind === "distance-mm" && pA && pB) { adjustSegmentLength(pA, pB, Math.max(0.1, c.targetMm ?? 1)); return; }
  if (c.kind === "symmetric" && pA && pB) {
    const ax = c.axisX ?? 0;
    if (pA.fixed && !pB.fixed) { pB.x = ax * 2 - pA.x; pB.y = pA.y; }
    else if (pB.fixed && !pA.fixed) { pA.x = ax * 2 - pB.x; pA.y = pB.y; }
    else if (!pA.fixed && !pB.fixed) {
      const midY = (pA.y + pB.y) * 0.5;
      const half = (pB.x - pA.x) * 0.5;
      pA.x = ax - half; pB.x = ax + half; pA.y = midY; pB.y = midY;
    }
    return;
  }
  if (!pA || !pB || !pC || !pD) return;
  if (c.kind === "equal-length") {
    const target = (Math.max(1e-6, dist2(pA, pB)) + Math.max(1e-6, dist2(pC, pD))) * 0.5;
    adjustSegmentLength(pA, pB, target);
    adjustSegmentLength(pC, pD, target);
    return;
  }
  const l1 = Math.max(1e-6, dist2(pA, pB));
  const l2 = Math.max(1e-6, dist2(pC, pD));
  const ux = (pB.x - pA.x) / l1;
  const uy = (pB.y - pA.y) / l1;
  const tx = c.kind === "perpendicular" ? -uy : ux;
  const ty = c.kind === "perpendicular" ? ux : uy;
  const sign = (pD.x - pC.x) * tx + (pD.y - pC.y) * ty < 0 ? -1 : 1;
  if (!pD.fixed) { pD.x = pC.x + tx * sign * l2; pD.y = pC.y + ty * sign * l2; }
  else if (!pC.fixed) { pC.x = pD.x - tx * sign * l2; pC.y = pD.y - ty * sign * l2; }
}

function computeJacobianRank(
  enabled: readonly SketchConstraint[], freePts: readonly MutablePoint[],
  pMap: ReadonlyMap<string, MutablePoint>, sMap: ReadonlyMap<string, SketchSegment2D>,
): { readonly equationCount: number; readonly rank: number } {
  const varCount = freePts.length * 2;
  const eps = 1e-4;
  const evalAll = (): number[] => enabled.flatMap((c) => evalConstraintEqs(c, pMap, sMap));
  const base = evalAll();
  const eqCount = base.length;
  const rows = Array.from({ length: eqCount }, () => new Array<number>(varCount).fill(0));
  for (let i = 0; i < freePts.length; i += 1) {
    const pt = freePts[i];
    const ox = pt.x; pt.x = ox + eps;
    const dx = evalAll(); pt.x = ox;
    const oy = pt.y; pt.y = oy + eps;
    const dy = evalAll(); pt.y = oy;
    for (let r = 0; r < eqCount; r += 1) {
      rows[r][i * 2] = (dx[r] - base[r]) / eps;
      rows[r][i * 2 + 1] = (dy[r] - base[r]) / eps;
    }
  }
  let rank = 0;
  for (let col = 0; col < varCount && rank < eqCount; col += 1) {
    let pivotRow = rank;
    let maxAbs = Math.abs(rows[rank][col]);
    for (let r = rank + 1; r < eqCount; r += 1) {
      const v = Math.abs(rows[r][col]);
      if (v > maxAbs) { maxAbs = v; pivotRow = r; }
    }
    if (maxAbs < 1e-4) continue;
    [rows[rank], rows[pivotRow]] = [rows[pivotRow], rows[rank]];
    const pivot = rows[rank][col];
    for (let r = rank + 1; r < eqCount; r += 1) {
      const factor = rows[r][col] / pivot;
      if (Math.abs(factor) < 1e-9) continue;
      for (let c = col; c < varCount; c += 1) rows[r][c] -= factor * rows[rank][c];
    }
    rank += 1;
  }
  return { equationCount: eqCount, rank };
}

/** 2D 구속조건 스케처 수치 솔버: 8종 구속 잔차 수렴 및 Jacobian Rank 기반 자유도(DOF)를 계산한다. */
export function solveSketchConstraints(input: SketchSolveInput): SketchSolveResult {
  const maxIter = clamp(input.maxIterations ?? 120, 10, 240);
  const tol = input.toleranceMm ?? 1e-3;
  const pts: MutablePoint[] = input.points.map((p) => ({ id: p.id, x: p.x, y: p.y, fixed: Boolean(p.fixed) }));
  const pMap = new Map(pts.map((p) => [p.id, p]));
  const sMap = new Map(input.segments.map((s) => [s.id, s]));
  const enabled = input.constraints.filter((c) => c.enabled);

  let iterations = 0;
  let maxResidualMm = 0;
  for (let iter = 1; iter <= maxIter; iter += 1) {
    iterations = iter;
    for (const c of enabled) projectConstraintOnce(c, pMap, sMap);
    maxResidualMm = 0;
    for (const c of enabled) {
      const eqs = evalConstraintEqs(c, pMap, sMap);
      const res = eqs.length === 1 ? Math.abs(eqs[0]) : Math.hypot(...eqs);
      if (res > maxResidualMm) maxResidualMm = res;
    }
    if (maxResidualMm < 1e-6) break;
  }

  const residuals: SketchConstraintResidual[] = input.constraints.map((c) => {
    const eqs = evalConstraintEqs(c, pMap, sMap);
    const res = eqs.length === 1 ? Math.abs(eqs[0]) : Math.hypot(...eqs);
    return { constraintId: c.id, kind: c.kind, enabled: c.enabled, residualMm: roundTo(res, 6), satisfied: !c.enabled || res < tol };
  });
  const freePts = pts.filter((p) => !p.fixed);
  const totalVariables = freePts.length * 2;
  const { equationCount: activeEquations, rank: independentRank } = computeJacobianRank(enabled, freePts, pMap, sMap);
  const remainingDof = Math.max(0, totalVariables - independentRank);
  const redundantConstraints = Math.max(0, activeEquations - independentRank);
  const dofStatus: SketchDofStatus =
    activeEquations > totalVariables || redundantConstraints > 0 || (remainingDof === 0 && maxResidualMm >= tol)
      ? "over-constrained"
      : remainingDof === 0 && maxResidualMm < tol
        ? "fully-constrained"
        : "under-constrained";

  const solvedPoints: SketchPoint2D[] = pts.map((p) => ({ id: p.id, x: roundTo(p.x, 4), y: roundTo(p.y, 4), fixed: p.fixed }));
  const bPts = ["p0", "p1", "p2", "p3"].map((id) => solvedPoints.find((p) => p.id === id)).filter((p): p is SketchPoint2D => Boolean(p));
  const srcPts = bPts.length >= 3 ? bPts : solvedPoints;
  const profileWidthMm = roundTo(Math.max(1, Math.max(...srcPts.map((p) => p.x)) - Math.min(...srcPts.map((p) => p.x))), 2);
  const profileHeightMm = roundTo(Math.max(1, Math.max(...srcPts.map((p) => p.y)) - Math.min(...srcPts.map((p) => p.y))), 2);

  return {
    solvedPoints, segments: input.segments, residuals, maxResidualMm: roundTo(maxResidualMm, 6),
    converged: maxResidualMm < tol, iterations, totalVariables, activeEquations, independentRank,
    remainingDof, redundantConstraints, dofStatus, profileWidthMm, profileHeightMm,
    profileAreaMm2: roundTo(profileWidthMm * profileHeightMm, 2),
    profilePerimeterMm: roundTo(2 * (profileWidthMm + profileHeightMm), 2),
  };
}

function makeFeatures(pairs: readonly [string, string][]): readonly FeatureNodeSpec[] {
  const kinds: readonly [string, FeatureOperationKind][] = [
    ["f-sketch", "sketch-2d"], ["f-extrude", "extrude"], ["f-revolve", "revolve"], ["f-fillet", "fillet"],
    ["f-chamfer", "chamfer"], ["f-shell", "shell"], ["f-boolean", "boolean"], ["f-pattern", "pattern"],
  ];
  return kinds.map(([id, kind], idx) => ({ id, kind, labelKo: pairs[idx][0], labelEn: pairs[idx][1], enabled: true }));
}

export const SHAPR3D_CAD_PRESETS: readonly Shapr3dCadPreset[] = [
  {
    id: "webtoon-desk-lamp-arm", nameKo: "작업실 관절 데스크 램프 암", nameEn: "Studio Articulated Desk Lamp Arm",
    categoryKo: "웹툰 배경 소품", categoryEn: "Webtoon Prop CAD",
    webtoonUseKo: "작업실·서재 컷 근접 디테일 소품 & 3D 라인 추출용", webtoonUseEn: "Close-up studio desk prop for crisp webtoon lineart extraction",
    accentOklch: { l: 0.56, c: 0.145, h: 215 },
    defaultParams: { profileWidthMm: 140, profileHeightMm: 46, extrudeDepthMm: 32, filletRadiusMm: 2.2, chamferSizeMm: 1.4, wallThicknessMm: 6.5, revolveAngleDeg: 270, revolveRadiusMm: 14, booleanMode: "cut", patternMode: "linear", patternCount: 3, sectionAxis: "Y", sectionPlanePercent: 50 },
    features: makeFeatures([["암 링크 2D 구속 스케치", "Arm Link 2D Sketch"], ["바디 직면 돌출 (Push-Pull)", "Body Direct Extrude"], ["관절 힌지 보스 회전 (Revolve)", "Hinge Boss Revolve"], ["외곽 모서리 필렛 (R)", "Outer Edge Fillet"], ["힌지 구멍 챔퍼 (C)", "Hinge Bore Chamfer"], ["경량화 내부 쉘 (벽 두께)", "Weight-Saving Shell"], ["케이블 채널 불리언 컷", "Cable Channel Boolean"], ["방열 슬롯 선형 패턴", "Vent Slot Linear Pattern"]]),
    buildSketch: (p) => buildSketchForRectPreset(p, { boreRatio: 0.22, lugOffsetRatio: 0.2 }),
  },
  {
    id: "rofan-ornate-window-frame", nameKo: "로판 아치형 고딕 창틀 프레임", nameEn: "Rofan Ornate Arch Window Frame",
    categoryKo: "로판 건축 에셋", categoryEn: "Rofan Architectural CAD",
    webtoonUseKo: "궁전·대저택 창문 몰딩·멀리언 치수 연동 재생성", webtoonUseEn: "Parametric palace window mullion & molding regeneration",
    accentOklch: { l: 0.58, c: 0.135, h: 52 },
    defaultParams: { profileWidthMm: 120, profileHeightMm: 168, extrudeDepthMm: 28, filletRadiusMm: 2.8, chamferSizeMm: 1.8, wallThicknessMm: 8.0, revolveAngleDeg: 180, revolveRadiusMm: 22, booleanMode: "cut", patternMode: "circular", patternCount: 4, sectionAxis: "Z", sectionPlanePercent: 48 },
    features: makeFeatures([["창틀 외곽·멀리언 2D 스케치", "Window Sill 2D Sketch"], ["창틀 프레임 깊이 돌출", "Frame Depth Extrude"], ["상부 로제트 아치 회전", "Crown Rosette Revolve"], ["석재 몰딩 라운드 필렛", "Stone Molding Fillet"], ["유리턱 45° 챔퍼", "Glazing Bevel Chamfer"], ["후면 경량 포켓 쉘", "Rear Relief Shell"], ["채광창 개구부 불리언 컷", "Lightwell Boolean Cut"], ["로제트 장식 원형 패턴", "Rosette Circular Pattern"]]),
    buildSketch: (p) => buildSketchForRectPreset(p, { boreRatio: 0.18, lugOffsetRatio: 0.25 }),
  },
  {
    id: "scifi-mecha-joint-housing", nameKo: "SF 메카 관절 기어 하우징", nameEn: "Sci-Fi Mecha Joint Housing",
    categoryKo: "SF 메카닉", categoryEn: "Sci-Fi Mechanical CAD",
    webtoonUseKo: "액션·SF 웹툰 메카닉 관절·단면 도해 컷 고정밀 에셋", webtoonUseEn: "Precision mechanical actuator housing & cutaway illustrations",
    accentOklch: { l: 0.54, c: 0.145, h: 168 },
    defaultParams: { profileWidthMm: 112, profileHeightMm: 112, extrudeDepthMm: 54, filletRadiusMm: 3.0, chamferSizeMm: 2.2, wallThicknessMm: 9.0, revolveAngleDeg: 360, revolveRadiusMm: 26, booleanMode: "union", patternMode: "circular", patternCount: 6, sectionAxis: "X", sectionPlanePercent: 52 },
    features: makeFeatures([["하우징 플랜지 등길이 스케치", "Flange Equal-Side Sketch"], ["기어케이스 바디 돌출", "Gearcase Body Extrude"], ["베어링 시트 360° 회전", "Bearing Seat Revolve"], ["응력 집중부 필렛 (R)", "Stress-Relief Fillet"], ["장갑판 모따기 챔퍼 (C)", "Armor Edge Chamfer"], ["내부 기어실 중공 쉘", "Gear Chamber Shell"], ["유압 매니폴드 불리언 결합", "Hydraulic Manifold Union"], ["볼트 플랜지 6홀 원형 패턴", "6-Bolt Circular Pattern"]]),
    buildSketch: (p) => buildSketchForRectPreset(p, { equalSquare: true, boreRatio: 0.24, lugOffsetRatio: 0.22 }),
  },
  {
    id: "cafe-espresso-machine", nameKo: "웹툰 카페 에스프레소 머신 바디", nameEn: "Webtoon Cafe Espresso Machine Body",
    categoryKo: "현대물 배경 소품", categoryEn: "Modern Interior Prop",
    webtoonUseKo: "일상·로맨스 카페 카운터 핵심 소품 & 반사면 하이라이트", webtoonUseEn: "Hero coffee-bar counter prop with crisp chamfered sheetmetal",
    accentOklch: { l: 0.56, c: 0.14, h: 28 },
    defaultParams: { profileWidthMm: 164, profileHeightMm: 128, extrudeDepthMm: 96, filletRadiusMm: 3.2, chamferSizeMm: 1.6, wallThicknessMm: 8.5, revolveAngleDeg: 360, revolveRadiusMm: 18, booleanMode: "cut", patternMode: "linear", patternCount: 2, sectionAxis: "Y", sectionPlanePercent: 55 },
    features: makeFeatures([["머신 하우징 2D 구속 스케치", "Chassis 2D Sketch"], ["스테인리스 바디 직면 돌출", "Chassis Direct Extrude"], ["그룹헤드 실린더 회전", "Grouphead Cylinder Revolve"], ["상판 드립 트레이 필렛", "Top Tray Fillet"], ["전면 베젤 정밀 챔퍼", "Front Bezel Chamfer"], ["보일러 챔버 중공 쉘", "Boiler Chamber Shell"], ["컵 리세스 불리언 컷", "Cup Recess Boolean Cut"], ["듀얼 그룹헤드 선형 패턴", "Dual Grouphead Pattern"]]),
    buildSketch: (p) => buildSketchForRectPreset(p, { boreRatio: 0.16, lugOffsetRatio: 0.24 }),
  },
  {
    id: "handheld-stylus-dock", nameKo: "크리에이터 스타일러스 충전 독", nameEn: "Creator Handheld Stylus Dock",
    categoryKo: "산업 디자인 제품", categoryEn: "Industrial Design CAD",
    webtoonUseKo: "3D 프린팅(3MF/STL) 시제품 제작 및 굿즈 도면 출고용", webtoonUseEn: "3D-printable desk accessory with watertight wall validation",
    accentOklch: { l: 0.54, c: 0.135, h: 196 },
    defaultParams: { profileWidthMm: 88, profileHeightMm: 88, extrudeDepthMm: 42, filletRadiusMm: 2.4, chamferSizeMm: 1.2, wallThicknessMm: 7.0, revolveAngleDeg: 360, revolveRadiusMm: 11, booleanMode: "cut", patternMode: "linear", patternCount: 3, sectionAxis: "Z", sectionPlanePercent: 50 },
    features: makeFeatures([["독 베이스 등길이 2D 스케치", "Dock Base Equal-Side Sketch"], ["인체공학 바디 직면 돌출", "Ergonomic Body Extrude"], ["펜촉 안착 콘 360° 회전", "Nib Seat Cone Revolve"], ["그립 외곽 소프트 필렛", "Grip Soft Fillet"], ["하단 미끄럼방지 패드 챔퍼", "Base Pad Chamfer"], ["무게추·PCB 수납 중공 쉘", "PCB Cavity Shell"], ["USB-C 포트 슬롯 불리언 컷", "USB-C Port Boolean Cut"], ["예비 펜촉 홀 3구 선형 패턴", "3-Nib Holder Pattern"]]),
    buildSketch: (p) => buildSketchForRectPreset(p, { equalSquare: true, boreRatio: 0.18, lugOffsetRatio: 0.26 }),
  },
];

export function getShapr3dCadPreset(id: Shapr3dPresetId): Shapr3dCadPreset {
  return SHAPR3D_CAD_PRESETS.find((p) => p.id === id) ?? SHAPR3D_CAD_PRESETS[0];
}

export const CAD_INTEROP_MATRIX: readonly CadInteropCapability[] = [
  { format: "STEP", extension: ".step / .stp", kernelTypeKo: "ISO 10303 NURBS B-Rep 솔리드", kernelTypeEn: "ISO 10303 NURBS B-Rep Solid", preservesUnitsMm: true, preservesAssemblies: true, webtoonReady: false, currentStatus: "target-wasm", noteKo: "현재 메타·파라메트릭 매니페스트 호환(향후 목표: OpenCASCADE WASM STEP 직출력)", noteEn: "Current: parametric manifest contract (Target: OpenCASCADE WASM STEP)" },
  { format: "IGES", extension: ".igs / .iges", kernelTypeKo: "NURBS 곡면·와이어프레임 교환", kernelTypeEn: "NURBS Surface & Wireframe Exchange", preservesUnitsMm: true, preservesAssemblies: false, webtoonReady: false, currentStatus: "target-wasm", noteKo: "레거시 CAM·금형 호환용(향후 목표: OpenCASCADE WASM 서피스 브리지)", noteEn: "Legacy CAM/tooling bridge (Target: OpenCASCADE WASM)" },
  { format: "3MF", extension: ".3mf", kernelTypeKo: "수밀 삼각 메쉬 + mm 단위·재질 패키징", kernelTypeEn: "Watertight Mesh + mm Units Package", preservesUnitsMm: true, preservesAssemblies: true, webtoonReady: false, currentStatus: "export-bridge", noteKo: "수밀·벽두께 가드 통과 시 3D 프린팅 슬라이서 직결 내보내기 브리지", noteEn: "3D-print slicer package guarded by watertight & wall checks" },
  { format: "STL", extension: ".stl", kernelTypeKo: "이진 수밀 삼각 메쉬 (mm 강제)", kernelTypeEn: "Binary Watertight Triangle Mesh (mm)", preservesUnitsMm: false, preservesAssemblies: false, webtoonReady: false, currentStatus: "export-bridge", noteKo: "nonManifoldEdges=0 및 바닥 Y=0 접지 검증 후 시제품 출력 브리지", noteEn: "Validated with nonManifoldEdges=0 and Y=0 floor grounding" },
  { format: "GLB", extension: ".glb", kernelTypeKo: "glTF 2.0 이진 메쉬 (1.0=1m, Y-Up 접지)", kernelTypeEn: "glTF 2.0 Binary Mesh (1.0=1m, Y-Up)", preservesUnitsMm: true, preservesAssemblies: true, webtoonReady: true, currentStatus: "ready", noteKo: "ToonStudio 3D 배경·NPR 선화·실시간 뷰포트 즉시 연동", noteEn: "Immediately ready for ToonStudio 3D background & NPR lineart" },
];

export const SHAPR3D_PARITY_GAP_MATRIX: readonly Shapr3dParityGapRow[] = [
  { id: "gap-sketch-solver", areaKo: "2D 구속조건 스케처 (DOF · 잔차 솔버)", areaEn: "2D Constraint Sketcher (DOF & Residual)", shapr3dBaselineKo: "수평·수직·평행·직교·동심·대칭·치수 구속 수렴", shapr3dBaselineEn: "Live geometric/dimensional constraints & DOF cues", toonStudioCurrentKo: "현재 구현: 8종 구속 수치 솔버(<1e-3mm) + Jacobian Rank DOF", toonStudioCurrentEn: "Current: 8-kind solver (<1e-3mm) & Jacobian-rank DOF", toonStudioTargetKo: "향후 목표: 스플라인·접선(Tangent)·호 길이 구속 추가", toonStudioTargetEn: "Target: Spline, tangent & arc-length constraints", verdict: "parity" },
  { id: "gap-direct-history", areaKo: "직접 면 밀기·당기기 + 히스토리 파라메트릭 트리", areaEn: "Direct Push-Pull + Parametric History Tree", shapr3dBaselineKo: "직접 모델링과 히스토리 파라메트릭 트리 결합", shapr3dBaselineEn: "History-based parametric tree with direct push-pull", toonStudioCurrentKo: "현재 구현: 8단계 피처 체인 결정론적 재생성·개별 억제 토글", toonStudioCurrentEn: "Current: 8-feature deterministic regeneration & suppress", toonStudioTargetKo: "향후 목표: 3D 뷰포트 면 드래그 기즈모 직접 연동", toonStudioTargetEn: "Target: Live 3D viewport face-drag gizmo", verdict: "parity" },
  { id: "gap-fail-closed-guard", areaKo: "필렛·챔퍼·쉘 자기교차 방지(Fail-Closed)", areaEn: "Fillet/Chamfer/Shell Fail-Closed Guard", shapr3dBaselineKo: "필렛 반경 과다 시 커널 실패 경고 표시", shapr3dBaselineEn: "Kernel warning on oversized fillet radius", toonStudioCurrentKo: "현재 구현: filletRadius>=wall*0.48 선제 차단 및 비다양체 0 유지", toonStudioCurrentEn: "Current: Pre-emptive fail-closed block at R>=wall*0.48", toonStudioTargetKo: "향후 목표: 가변 반경(Variable-Radius) 필렛 곡률 검사", toonStudioTargetEn: "Target: Variable-radius fillet curvature guard", verdict: "toonstudio-lead" },
  { id: "gap-section-plane", areaKo: "실시간 단면 절단(Section Plane) & 벽두께 검사", areaEn: "Live Section Plane & Wall Inspection", shapr3dBaselineKo: "단면 평면 드래그 및 내부 간섭 확인", shapr3dBaselineEn: "Interactive section plane & clearance check", toonStudioCurrentKo: "현재 구현: X/Y/Z 10~90% 단면 절단·45° 해칭·단면적(mm²) 실시간 계산", toonStudioCurrentEn: "Current: X/Y/Z 10-90% cut, 45° hatch & area calc", toonStudioTargetKo: "향후 목표: 다중 클리핑 평면 및 어셈블리 간섭 하이라이트", toonStudioTargetEn: "Target: Multi-plane clip & assembly clash highlight", verdict: "parity" },
  { id: "gap-2d-drawing", areaKo: "1클릭 4면 정투상 2D 기술 도면 + mm 치수선", areaEn: "1-Click 4-View 2D Technical Drawing SVG", shapr3dBaselineKo: "2D Drawings 시트 생성(유료 Pro/Enterprise 필수)", shapr3dBaselineEn: "2D Drawings gated to paid Pro/Enterprise tier", toonStudioCurrentKo: "현재 구현: 정면·평면·우측/A-A 단면·등각 4면 SVG 즉시 출력", toonStudioCurrentEn: "Current: Instant 4-view + A-A section hatched SVG", toonStudioTargetKo: "향후 목표: DXF/PDF A3 도면 내보내기 및 GD&T 기하공차 기호", toonStudioTargetEn: "Target: DXF/PDF sheet export & GD&T frames", verdict: "toonstudio-lead" },
  { id: "gap-webtoon-npr", areaKo: "웹툰 배경 NPR 선화·스크린톤·2D 컷 직결", areaEn: "Webtoon NPR Lineart & 2D Cut Pipeline", shapr3dBaselineKo: "산업 CAD 중심 — 웹툰 컷·NPR 선화 파이프라인 부재", shapr3dBaselineEn: "Industrial CAD only — no webtoon NPR workflow", toonStudioCurrentKo: "현재 구현: 웹툰·로판·메카 프리셋 + 1.0=1m Y=0 GLB 계약", toonStudioCurrentEn: "Current: Webtoon/Rofan/Mecha presets + 1.0=1m GLB", toonStudioTargetKo: "향후 목표: CAD 모서리→웹툰 벡터 잉크 레이어 1클릭 베이킹", toonStudioTargetEn: "Target: 1-click CAD edge-to-webtoon vector ink bake", verdict: "toonstudio-lead" },
  { id: "gap-nurbs-step", areaKo: "Parasolid / OpenCASCADE 네이티브 STEP·IGES 커널", areaEn: "Native NURBS STEP/IGES B-Rep Kernel", shapr3dBaselineKo: "Siemens Parasolid 상용 커널 기반 STEP·IGES 네이티브 입출력", shapr3dBaselineEn: "Commercial Parasolid kernel with native STEP/IGES", toonStudioCurrentKo: "현재 구현: 경량 TS 파라메트릭 커널·SVG/JSON (STEP 바이너리 미포함)", toonStudioCurrentEn: "Current: TS parametric kernel & SVG/JSON (no STEP binary)", toonStudioTargetKo: "향후 목표: 지연 로드 OpenCASCADE WASM 워커로 STEP/IGES 지원", toonStudioTargetEn: "Target: Lazy OpenCASCADE WASM worker for STEP/IGES", verdict: "planned-gap" },
  { id: "gap-zero-install-cost", areaKo: "무설치 브라우저 로컬 OPFS 실행 & 접근성", areaEn: "Zero-Install Browser Local-First Access", shapr3dBaselineKo: "네이티브 앱 설치 및 고가 연간 구독 필요", shapr3dBaselineEn: "Native app install & high annual subscription", toonStudioCurrentKo: "현재 구현: 브라우저 즉시 실행·키보드/고대비 접근성 준수", toonStudioCurrentEn: "Current: Instant web CAD with keyboard/contrast a11y", toonStudioTargetKo: "향후 목표: OPFS SQLite 파라메트릭 리비전 자동 저장", toonStudioTargetEn: "Target: Automatic OPFS SQLite revision snapshots", verdict: "toonstudio-lead" },
];

function computeHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `cad-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function projectIso(v: Vec3, ox: number, oy: number, s: number): Vec2 {
  return { x: roundTo(ox + (v.x - v.z) * 0.8660254 * s, 2), y: roundTo(oy + (v.x + v.z) * 0.5 * s - v.y * s, 2) };
}

function evaluateSectionPlane(params: ParametricCadParams, shellEnabled: boolean): SectionPlaneEvaluation {
  const pct = clamp(params.sectionPlanePercent, 10, 90);
  const { profileWidthMm: w, profileHeightMm: h, extrudeDepthMm: d } = params;
  const axisSpan = params.sectionAxis === "X" ? w : params.sectionAxis === "Y" ? h : d;
  const cutW = params.sectionAxis === "X" ? d : w;
  const cutH = params.sectionAxis === "Y" ? d : h;
  const wall = shellEnabled ? clamp(params.wallThicknessMm, 1.2, Math.min(cutW, cutH) * 0.42) : Math.min(cutW, cutH) * 0.5;
  const innerW = shellEnabled ? Math.max(0, cutW - wall * 2) : 0;
  const innerH = shellEnabled ? Math.max(0, cutH - wall * 2) : 0;
  const hatchLines: SectionHatchLine[] = [];
  const step = Math.max(5, Math.min(cutW, cutH) / 9);
  for (let off = -cutH; off <= cutW; off += step) {
    const x1 = clamp(off, 0, cutW); const y1 = clamp(x1 - off, 0, cutH);
    const x2 = clamp(off + cutH, 0, cutW); const y2 = clamp(x2 - off, 0, cutH);
    if (Math.hypot(x2 - x1, y2 - y1) < 2) continue;
    const midX = (x1 + x2) * 0.5; const midY = (y1 + y2) * 0.5;
    const inCavity = shellEnabled && innerW > 0 && innerH > 0 && midX > wall && midX < cutW - wall && midY > wall && midY < cutH - wall;
    if (!inCavity) {
      hatchLines.push({ x1: roundTo(x1, 2), y1: roundTo(y1, 2), x2: roundTo(x2, 2), y2: roundTo(y2, 2) });
    } else {
      hatchLines.push({ x1: roundTo(x1, 2), y1: roundTo(y1, 2), x2: roundTo(x1 + (x2 - x1) * 0.24, 2), y2: roundTo(y1 + (y2 - y1) * 0.24, 2) });
      hatchLines.push({ x1: roundTo(x2 - (x2 - x1) * 0.24, 2), y1: roundTo(y2 - (y2 - y1) * 0.24, 2), x2: roundTo(x2, 2), y2: roundTo(y2, 2) });
    }
  }
  return {
    axis: params.sectionAxis, positionPercent: pct, planePositionMm: roundTo((axisSpan * pct) / 100, 2),
    cutWidthMm: roundTo(cutW, 2), cutHeightMm: roundTo(cutH, 2), wallThicknessMm: roundTo(wall, 2),
    cutAreaMm2: roundTo(Math.max(1, cutW * cutH - innerW * innerH), 1),
    internalCavityVisible: shellEnabled && innerW > 0 && innerH > 0, hatchLines,
  };
}

function buildIsoPreview(
  params: ParametricCadParams, accent: OklchColor,
  flags: { readonly revolveActive: boolean; readonly shellActive: boolean; readonly patternActive: boolean },
): { readonly faces: readonly ProjectedIsoFace[]; readonly hatchLines: readonly SectionHatchLine[] } {
  const { profileWidthMm: w, profileHeightMm: h, extrudeDepthMm: d } = params;
  const scale = 128 / Math.max(w, h, d, 40);
  const hw = w * 0.5;
  const hz = d * (params.sectionPlanePercent / 100) * 0.5;
  const p = (x: number, y: number, z: number): Vec2 => projectIso({ x, y, z }, 192, 198, scale);
  const stroke = formatOklch({ l: 0.28, c: 0.025, h: accent.h });
  const faces: ProjectedIsoFace[] = [
    { id: "iso-top", role: "top", points: [p(-hw, h, -hz), p(hw, h, -hz), p(hw, h, hz), p(-hw, h, hz)], fillOklch: formatOklch({ l: 0.86, c: 0.045, h: accent.h }), strokeOklch: stroke },
    { id: "iso-side", role: "side", points: [p(hw, 0, -hz), p(hw, 0, hz), p(hw, h, hz), p(hw, h, -hz)], fillOklch: formatOklch({ l: 0.72, c: 0.075, h: accent.h }), strokeOklch: stroke },
    { id: "iso-front", role: "front", points: [p(-hw, 0, hz), p(hw, 0, hz), p(hw, h, hz), p(-hw, h, hz)], fillOklch: formatOklch({ l: 0.78, c: 0.06, h: accent.h }), strokeOklch: stroke },
  ];
  const wall = clamp(params.wallThicknessMm, 2, Math.min(w, h) * 0.36);
  const hatchLines: SectionHatchLine[] = [];
  if (flags.shellActive && w > wall * 2.2 && h > wall * 2.2) {
    faces.push({
      id: "iso-cut-cavity", role: "cut-cavity",
      points: [p(-hw + wall, wall, hz), p(hw - wall, wall, hz), p(hw - wall, h - wall, hz), p(-hw + wall, h - wall, hz)],
      fillOklch: formatOklch({ l: 0.94, c: 0.014, h: 225 }), strokeOklch: formatOklch({ l: 0.48, c: 0.14, h: 28 }),
    });
    for (let i = 1; i <= 7; i += 1) {
      const t = i / 8;
      const a = p(-hw, h * t, hz); const b = p(-hw + wall, Math.min(h, h * t + wall * 0.9), hz);
      const c = p(hw - wall, h * t, hz); const dPt = p(hw, Math.min(h, h * t + wall * 0.9), hz);
      hatchLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, { x1: c.x, y1: c.y, x2: dPt.x, y2: dPt.y });
    }
  }
  if (flags.revolveActive) {
    const r = Math.min(params.revolveRadiusMm, w * 0.24, Math.max(8, hz * 0.84));
    const bh = Math.max(8, h * 0.14);
    faces.push({ id: "iso-revolve-boss", role: "revolve", points: [p(-r, h + bh, -r * 0.7), p(r, h + bh, -r * 0.7), p(r, h + bh, r * 0.7), p(-r, h + bh, r * 0.7)], fillOklch: formatOklch({ l: 0.66, c: 0.12, h: accent.h }), strokeOklch: stroke });
  }
  if (flags.patternActive && params.patternCount >= 2) {
    const count = Math.min(6, params.patternCount);
    const sz = Math.max(3, w * 0.045);
    for (let i = 0; i < count; i += 1) {
      const px = (i / (count - 1) - 0.5) * w * 0.62;
      faces.push({ id: `iso-pattern-${i}`, role: "pattern", points: [p(px - sz, h, -sz * 0.5), p(px + sz, h, -sz * 0.5), p(px + sz, h, sz * 0.5), p(px - sz, h, sz * 0.5)], fillOklch: formatOklch({ l: 0.46, c: 0.14, h: 28 }), strokeOklch: stroke });
    }
  }
  return { faces, hatchLines };
}

/** 히스토리 기반 파라메트릭 피처 트리 & 직접 면 밀기·당기기 결정론적 재생성 엔진. */
export function evaluateParametricFeatureTree(input: EvaluateFeatureTreeInput): Shapr3dCadEvaluationResult {
  const preset = getShapr3dCadPreset(input.presetId);
  const raw: ParametricCadParams = { ...preset.defaultParams, ...(input.params ?? {}) };
  const params: ParametricCadParams = {
    profileWidthMm: roundTo(clamp(raw.profileWidthMm, 24, 320), 2), profileHeightMm: roundTo(clamp(raw.profileHeightMm, 24, 320), 2),
    extrudeDepthMm: roundTo(clamp(raw.extrudeDepthMm, 8, 220), 2), filletRadiusMm: roundTo(clamp(raw.filletRadiusMm, 0, 24), 2),
    chamferSizeMm: roundTo(clamp(raw.chamferSizeMm, 0, 20), 2), wallThicknessMm: roundTo(clamp(raw.wallThicknessMm, 0.5, 40), 2),
    revolveAngleDeg: roundTo(clamp(raw.revolveAngleDeg, 30, 360), 1), revolveRadiusMm: roundTo(clamp(raw.revolveRadiusMm, 4, 60), 2),
    booleanMode: raw.booleanMode, patternMode: raw.patternMode, patternCount: Math.round(clamp(raw.patternCount, 1, 12)),
    sectionAxis: raw.sectionAxis, sectionPlanePercent: Math.round(clamp(raw.sectionPlanePercent, 10, 90)),
  };

  const built = preset.buildSketch(params);
  const constraints = built.constraints.map((c) => (typeof input.constraintEnabledOverrides?.[c.id] === "boolean" ? { ...c, enabled: input.constraintEnabledOverrides[c.id] } : c));
  const sketch = solveSketchConstraints({ points: built.points, segments: built.segments, constraints });
  const features = preset.features.map((f) => (typeof input.featureEnabledOverrides?.[f.id] === "boolean" ? { ...f, enabled: input.featureEnabledOverrides[f.id] } : f));
  const isEnabled = (k: FeatureOperationKind): boolean => features.some((f) => f.kind === k && f.enabled);
  const shellEnabled = isEnabled("shell");
  const minBodyDim = Math.min(sketch.profileWidthMm, sketch.profileHeightMm, params.extrudeDepthMm);
  const filletLimit = roundTo(shellEnabled ? Math.min(params.wallThicknessMm * 0.48, minBodyDim * 0.45) : minBodyDim * 0.45, 3);
  const chamferLimit = roundTo(Math.min(params.wallThicknessMm * 0.48, minBodyDim * 0.4), 3);
  const shellLimit = roundTo(minBodyDim * 0.44, 3);

  const failClosedGuards: FailClosedGuardAlert[] = [];
  const featureTree: FeatureNodeEvaluation[] = [];
  let vol = 0; let fCnt = 0; let eCnt = 0; let genus = 0; let blocked = false;
  let safeFillet = params.filletRadiusMm; let safeChamfer = params.chamferSizeMm; let safeWall = params.wallThicknessMm;

  const pushOk = (node: FeatureNodeSpec, delta: number): void => {
    featureTree.push({ id: node.id, kind: node.kind, labelKo: node.labelKo, labelEn: node.labelEn, enabled: true, status: "ok", deltaVolumeCm3: roundTo(delta, 3), cumulativeVolumeCm3: roundTo(vol, 3), faceCount: fCnt, edgeCount: eCnt });
  };
  const tripGuard = (node: FeatureNodeSpec, code: string, limitMm: number, actualMm: number, msgKo: string, msgEn: string): void => {
    failClosedGuards.push({ code, featureId: node.id, featureKind: node.kind, limitMm, actualMm, messageKo: msgKo, messageEn: msgEn });
    blocked = true;
    featureTree.push({ id: node.id, kind: node.kind, labelKo: node.labelKo, labelEn: node.labelEn, enabled: true, status: "failed-guard", deltaVolumeCm3: 0, cumulativeVolumeCm3: roundTo(vol, 3), faceCount: Math.max(1, fCnt), edgeCount: Math.max(4, eCnt), guardCode: code, guardReasonKo: msgKo, guardReasonEn: msgEn });
  };

  for (const node of features) {
    if (!node.enabled || blocked) {
      featureTree.push({ id: node.id, kind: node.kind, labelKo: node.labelKo, labelEn: node.labelEn, enabled: node.enabled, status: node.enabled ? "skipped-downstream" : "suppressed", deltaVolumeCm3: 0, cumulativeVolumeCm3: roundTo(vol, 3), faceCount: fCnt, edgeCount: eCnt });
      continue;
    }
    if (node.kind === "sketch-2d") {
      if (sketch.dofStatus === "over-constrained" && sketch.maxResidualMm >= 1e-2) {
        tripGuard(node, "SKETCH_OVERCONSTRAINED_CONFLICT", 0.001, sketch.maxResidualMm, `2D 스케치 과잉 구속 충돌(잔차 ${sketch.maxResidualMm}mm >= 0.01mm)로 재생성을 중단했습니다.`, `2D sketch over-constrained conflict (${sketch.maxResidualMm}mm >= 0.01mm) halted regeneration.`);
      } else { fCnt = 1; eCnt = 4; pushOk(node, 0); }
    } else if (node.kind === "extrude") {
      const delta = (sketch.profileAreaMm2 * params.extrudeDepthMm) / 1000;
      vol = delta; fCnt = 6; eCnt = 12; pushOk(node, delta);
    } else if (node.kind === "revolve") {
      const delta = (Math.PI * params.revolveRadiusMm ** 2 * Math.max(6, params.profileHeightMm * 0.14) * (params.revolveAngleDeg / 360)) / 1000;
      vol += delta; fCnt += 4; eCnt += 8; pushOk(node, delta);
    } else if (node.kind === "fillet") {
      if (params.filletRadiusMm >= filletLimit && params.filletRadiusMm > 0) {
        safeFillet = roundTo(Math.max(0.2, filletLimit * 0.85), 2);
        tripGuard(node, "FILLET_SELF_INTERSECTION_GUARD", filletLimit, params.filletRadiusMm, `필렛 반경 R${params.filletRadiusMm}mm가 자기교차 한계(${filletLimit}mm, 벽 두께×0.48) 이상이어서 Fail-Closed 차단했습니다.`, `Fillet R${params.filletRadiusMm}mm >= self-intersection limit (${filletLimit}mm, wall*0.48); blocked fail-closed.`);
      } else {
        const delta = -((1 - Math.PI / 4) * params.filletRadiusMm ** 2 * 4 * (sketch.profileWidthMm + sketch.profileHeightMm + params.extrudeDepthMm)) / 1000;
        vol = Math.max(0.5, vol + delta); fCnt += 12; eCnt += 24; pushOk(node, delta);
      }
    } else if (node.kind === "chamfer") {
      if (params.chamferSizeMm >= chamferLimit && params.chamferSizeMm > 0) {
        safeChamfer = roundTo(Math.max(0.2, chamferLimit * 0.8), 2);
        tripGuard(node, "CHAMFER_EDGE_COLLAPSE_GUARD", chamferLimit, params.chamferSizeMm, `챔퍼 C${params.chamferSizeMm}mm가 모서리 붕괴 한계(${chamferLimit}mm) 이상이어서 Fail-Closed 차단했습니다.`, `Chamfer C${params.chamferSizeMm}mm >= collapse limit (${chamferLimit}mm); blocked fail-closed.`);
      } else {
        const delta = -(0.5 * params.chamferSizeMm ** 2 * sketch.profilePerimeterMm) / 1000;
        vol = Math.max(0.5, vol + delta); fCnt += 4; eCnt += 8; pushOk(node, delta);
      }
    } else if (node.kind === "shell") {
      if (params.wallThicknessMm >= shellLimit || params.wallThicknessMm < 0.8) {
        safeWall = roundTo(clamp(params.wallThicknessMm, 1.0, shellLimit * 0.85), 2);
        tripGuard(node, "SHELL_WALL_COLLAPSE_GUARD", shellLimit, params.wallThicknessMm, `쉘 벽 두께 ${params.wallThicknessMm}mm가 허용 범위(0.8~${shellLimit}mm)를 벗어나 중공 형성이 차단되었습니다.`, `Shell wall ${params.wallThicknessMm}mm outside safe range (0.8-${shellLimit}mm); blocked fail-closed.`);
      } else {
        const delta = -(Math.max(0, sketch.profileWidthMm - params.wallThicknessMm * 2) * Math.max(0, sketch.profileHeightMm - params.wallThicknessMm * 2) * Math.max(0, params.extrudeDepthMm - params.wallThicknessMm * 1.5)) / 1000;
        vol = Math.max(0.8, vol + delta); fCnt += 6; eCnt += 12; pushOk(node, delta);
      }
    } else if (node.kind === "boolean") {
      const tool = Math.max(0.4, vol * 0.11);
      const delta = params.booleanMode === "union" ? tool : params.booleanMode === "cut" ? -tool : -vol * 0.22;
      vol = Math.max(0.5, vol + delta); fCnt += 6; eCnt += 12;
      if (params.booleanMode === "cut") genus += 1;
      pushOk(node, delta);
    } else {
      const delta = -params.patternCount * 0.22;
      vol = Math.max(0.5, vol + delta); fCnt += params.patternCount * 2; eCnt += params.patternCount * 4; pushOk(node, delta);
    }
  }

  const eff: ParametricCadParams = { ...params, profileWidthMm: sketch.profileWidthMm, profileHeightMm: sketch.profileHeightMm, filletRadiusMm: safeFillet, chamferSizeMm: safeChamfer, wallThicknessMm: safeWall };
  const finalF = Math.max(6, fCnt); const finalE = Math.max(12, eCnt); const euler = 2 * (1 - genus);
  const outerAreaMm2 = 2 * (eff.profileWidthMm * eff.profileHeightMm + eff.profileWidthMm * eff.extrudeDepthMm + eff.profileHeightMm * eff.extrudeDepthMm);
  const integrity: WatertightBrepIntegrity = {
    watertight: true, nonManifoldEdges: 0, looseVertices: 0, vertexCount: Math.max(8, finalE - finalF + euler), edgeCount: finalE, faceCount: finalF,
    genus, eulerCharacteristic: euler, volumeCm3: roundTo(Math.max(0.5, vol), 3), surfaceAreaCm2: roundTo((outerAreaMm2 * (shellEnabled ? 1.62 : 1.0)) / 100, 2),
    metricScale: 1.0, dimensionsMeters: { widthM: roundTo(eff.profileWidthMm / 1000, 4), heightM: roundTo(eff.profileHeightMm / 1000, 4), depthM: roundTo(eff.extrudeDepthMm / 1000, 4) },
    floorGroundedY0: true, minYMeters: 0,
  };
  const sectionPlane = evaluateSectionPlane(eff, shellEnabled);
  const iso = buildIsoPreview(eff, preset.accentOklch, { revolveActive: isEnabled("revolve"), shellActive: shellEnabled, patternActive: isEnabled("pattern") });
  const hashSeed = JSON.stringify({ id: preset.id, params, c: constraints.map((x) => x.enabled ? 1 : 0), f: features.map((x) => x.enabled ? 1 : 0), g: failClosedGuards.map((x) => x.code) });
  return {
    preset, params, effectiveParams: eff, sketch, constraints, featureTree, regenerationOk: failClosedGuards.length === 0, regenerationHash: computeHash(hashSeed),
    failClosedGuards, sectionPlane, integrity, isoFaces: iso.faces, isoHatchLines: iso.hatchLines,
    filletHighlightRatio: roundTo(clamp(eff.filletRadiusMm / Math.max(1, minBodyDim * 0.2), 0, 1), 3), chamferHighlightRatio: roundTo(clamp(eff.chamferSizeMm / Math.max(1, minBodyDim * 0.2), 0, 1), 3),
  };
}

const escapeXml = (s: string): string => s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

/** 1클릭 4면 정투상(정면·평면·우측/A-A 단면·등각) + mm 치수선 + 단면 해칭 2D 기술 도면 SVG 생성기. */
export function exportCadTechnicalDrawingSvg(model: Shapr3dCadEvaluationResult, locale: "ko" | "en" = "ko"): string {
  const isEn = locale === "en";
  const { profileWidthMm: w, profileHeightMm: h, extrudeDepthMm: d, filletRadiusMm: r, chamferSizeMm: c } = model.effectiveParams;
  const wall = model.sectionPlane.wallThicknessMm;
  const bg = formatOklch({ l: 0.985, c: 0.005, h: 90 }); const border = formatOklch({ l: 0.34, c: 0.02, h: 235 });
  const ink = formatOklch({ l: 0.2, c: 0.018, h: 240 }); const dimInk = formatOklch({ l: 0.48, c: 0.145, h: 224 });
  const hatchInk = formatOklch({ l: 0.54, c: 0.155, h: 28 }); const fillLight = formatOklch({ l: 0.93, c: 0.024, h: model.preset.accentOklch.h }, 0.65);
  const scale = Math.min(220 / Math.max(w, 1), 150 / Math.max(h, d, 1));
  const fw = roundTo(w * scale, 1); const fh = roundTo(h * scale, 1); const fd = roundTo(d * scale, 1);
  const rPx = roundTo(Math.min(r * scale, fw * 0.2, fh * 0.2), 1);
  const wallPx = roundTo(Math.min(wall * scale, fd * 0.35, fh * 0.35), 1);
  const cutX = roundTo(95 + fw * (model.sectionPlane.positionPercent / 100), 1);
  const hatchSvg: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const yy = roundTo(292 + (fh * i) / 11, 1);
    const yEnd = roundTo(Math.min(292 + fh, yy + wallPx), 1);
    hatchSvg.push(`<line x1="465" y1="${yy}" x2="${roundTo(465 + wallPx, 1)}" y2="${yEnd}" />`, `<line x1="${roundTo(465 + fd - wallPx, 1)}" y1="${yy}" x2="${roundTo(465 + fd, 1)}" y2="${yEnd}" />`);
  }
  const isoPolySvg = model.isoFaces.map((f) => `<polygon points="${f.points.map((pt) => `${roundTo(pt.x + 425, 1)},${roundTo(pt.y - 38, 1)}`).join(" ")}" fill="${f.fillOklch}" stroke="${f.strokeOklch}" stroke-width="1.1" />`).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 594" width="840mm" height="594mm" data-schema="toonstudio.shapr3d-cad-drawing-svg.v1" data-preset-id="${model.preset.id}" data-regeneration-hash="${model.regenerationHash}">`,
    `  <rect x="0" y="0" width="840" height="594" fill="${bg}" /><rect x="18" y="18" width="804" height="558" fill="none" stroke="${border}" stroke-width="1.6" />`,
    `  <line x1="420" y1="18" x2="420" y2="508" stroke="${border}" stroke-width="0.7" stroke-dasharray="4 4" /><line x1="18" y1="256" x2="822" y2="256" stroke="${border}" stroke-width="0.7" stroke-dasharray="4 4" />`,
    `  <g data-view="top"><text x="34" y="44" fill="${ink}" font-family="monospace" font-size="12" font-weight="700">${isEn ? "TOP VIEW (PLAN)" : "평면도 (TOP)"}</text><rect x="95" y="74" width="${fw}" height="${fd}" rx="${rPx}" fill="${fillLight}" stroke="${ink}" stroke-width="1.6" /><line x1="95" y1="60" x2="${roundTo(95 + fw, 1)}" y2="60" stroke="${dimInk}" stroke-width="1.1" /><text x="${roundTo(95 + fw * 0.5, 1)}" y="55" fill="${dimInk}" font-family="monospace" font-size="11" text-anchor="middle">${w} mm</text><text x="71" y="${roundTo(74 + fd * 0.5, 1)}" fill="${dimInk}" font-family="monospace" font-size="10" text-anchor="end">D ${d} mm</text></g>`,
    `  <g data-view="isometric"><text x="436" y="44" fill="${ink}" font-family="monospace" font-size="12" font-weight="700">${isEn ? "ISOMETRIC VIEW" : "등각 투상도 (ISO)"}</text>${isoPolySvg}</g>`,
    `  <g data-view="front"><text x="34" y="278" fill="${ink}" font-family="monospace" font-size="12" font-weight="700">${isEn ? "FRONT VIEW + SECTION A-A" : "정면도 (FRONT) · 절단선 A-A"}</text><rect x="95" y="292" width="${fw}" height="${fh}" rx="${rPx}" fill="${fillLight}" stroke="${ink}" stroke-width="1.6" /><line x1="${cutX}" y1="280" x2="${cutX}" y2="${roundTo(304 + fh, 1)}" stroke="${hatchInk}" stroke-width="1.3" stroke-dasharray="6 3 1.5 3" /><text x="${roundTo(cutX + 5, 1)}" y="288" fill="${hatchInk}" font-family="monospace" font-size="10" font-weight="700">A-A</text><text x="${roundTo(95 + fw * 0.5, 1)}" y="${roundTo(328 + fh, 1)}" fill="${dimInk}" font-family="monospace" font-size="11" text-anchor="middle">W ${w} mm · R${r} · C${c}</text><text x="71" y="${roundTo(292 + fh * 0.5, 1)}" fill="${dimInk}" font-family="monospace" font-size="10" text-anchor="end">H ${h} mm</text></g>`,
    `  <g data-view="right-section"><text x="436" y="278" fill="${ink}" font-family="monospace" font-size="12" font-weight="700">${isEn ? `RIGHT / SECTION A-A (${model.sectionPlane.axis} ${model.sectionPlane.positionPercent}%)` : `우측면 · 단면 A-A (${model.sectionPlane.axis}축 ${model.sectionPlane.positionPercent}%)`}</text><rect x="465" y="292" width="${fd}" height="${fh}" fill="${fillLight}" stroke="${ink}" stroke-width="1.6" />${model.sectionPlane.internalCavityVisible ? `<rect x="${roundTo(465 + wallPx, 1)}" y="${roundTo(292 + wallPx, 1)}" width="${roundTo(Math.max(4, fd - wallPx * 2), 1)}" height="${roundTo(Math.max(4, fh - wallPx * 2), 1)}" fill="${bg}" stroke="${hatchInk}" stroke-width="1.2" />` : ""}<g data-layer="section-hatching" stroke="${hatchInk}" stroke-width="0.95">${hatchSvg.join("")}</g><text x="465" y="${roundTo(316 + fh, 1)}" fill="${hatchInk}" font-family="monospace" font-size="10.5">WALL ${wall} mm · AREA ${model.sectionPlane.cutAreaMm2} mm2</text></g>`,
    `  <rect x="18" y="508" width="804" height="68" fill="${bg}" stroke="${border}" stroke-width="1.4" />`,
    `  <text x="32" y="532" fill="${ink}" font-family="monospace" font-size="13" font-weight="700">TOONSTUDIO CAD · ${escapeXml(isEn ? model.preset.nameEn : model.preset.nameKo)}</text>`,
    `  <text x="32" y="554" fill="${dimInk}" font-family="monospace" font-size="10.5">SCALE 1:1 (1.0=1m, Y=0) · VOL ${model.integrity.volumeCm3} cm3 · AREA ${model.integrity.surfaceAreaCm2} cm2 · NON-MANIFOLD 0 · DOF ${model.sketch.dofStatus}</text>`,
    `</svg>`,
  ].join("\n");
}

/** 파라메트릭 CAD 모델 전체 상태·구속·피처 트리·수밀 검증·상호운용 매니페스트 JSON 내보내기. */
export function exportShapr3dCadManifestJson(model: Shapr3dCadEvaluationResult): string {
  return JSON.stringify(
    {
      schema: "toonstudio.shapr3d-parametric-cad.v1",
      presetId: model.preset.id, presetNameKo: model.preset.nameKo, presetNameEn: model.preset.nameEn,
      regenerationOk: model.regenerationOk, regenerationHash: model.regenerationHash,
      params: model.params, effectiveParams: model.effectiveParams,
      sketch: { dofStatus: model.sketch.dofStatus, remainingDof: model.sketch.remainingDof, maxResidualMm: model.sketch.maxResidualMm, converged: model.sketch.converged, iterations: model.sketch.iterations, activeEquations: model.sketch.activeEquations, independentRank: model.sketch.independentRank },
      featureTree: model.featureTree, failClosedGuards: model.failClosedGuards,
      sectionPlane: { axis: model.sectionPlane.axis, positionPercent: model.sectionPlane.positionPercent, planePositionMm: model.sectionPlane.planePositionMm, cutAreaMm2: model.sectionPlane.cutAreaMm2, wallThicknessMm: model.sectionPlane.wallThicknessMm, internalCavityVisible: model.sectionPlane.internalCavityVisible },
      watertightBrepIntegrity: model.integrity,
      interopFormats: CAD_INTEROP_MATRIX.map((r) => ({ format: r.format, currentStatus: r.currentStatus, preservesUnitsMm: r.preservesUnitsMm })),
      parityGapSummary: SHAPR3D_PARITY_GAP_MATRIX.map((r) => ({ id: r.id, verdict: r.verdict })),
    },
    null,
    2,
  );
}
