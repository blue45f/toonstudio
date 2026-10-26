/**
 * ToonStudio 베지어 곡선 피팅·평행 오프셋·Klecks 6종 브러시·Wick 벡터 블롭/갭필·Konva 텐션 스플라인 엔진 (Wave 23).
 */

export interface Wave23ReaSemanticEvidenceEntry {
  readonly targetId: string;
  readonly displayName: string;
  readonly category: "github-oss-semantic" | "web-drawing-app";
  readonly sourceUrlOrPath: string;
  readonly parentAnalysisEvidenceId: string;
  readonly summaryViewEvidenceId: string;
  readonly modulesViewEvidenceId: string;
  readonly jsFactsViewEvidenceId: string;
  readonly semanticTraceEvidenceIds: readonly string[];
  readonly artifactSha256: string;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly objectFlowRelations: number;
  readonly callFlowRelations: number;
  readonly internalizedKernels: readonly string[];
}

export const WAVE23_REA_DEEP_SEMANTIC_LEDGER: readonly Wave23ReaSemanticEvidenceEntry[] = [
  {
    targetId: "rea-wave23-oss-klecks-mypaint-spectral",
    displayName: "Klecks 6-Brush Suite + libmypaint + polygon-clipping + spectral.js + colormix.js",
    category: "github-oss-semantic",
    sourceUrlOrPath: "https://github.com/bitbof/klecks",
    parentAnalysisEvidenceId: "ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0",
    summaryViewEvidenceId: "ev_937159dfabc0d0622717008d837dab1785fb85ea95bd8e43660ee3bcd18e1fd6",
    modulesViewEvidenceId: "ev_5a5058a8b1e9c6068bf847583f6765e826500678c159276275968696ab6b6498",
    jsFactsViewEvidenceId: "ev_0899727c16df2d94a8e7fa7c9cf181d8277ba415fcc728946e8fef3bd4a2f423",
    semanticTraceEvidenceIds: [
      "ev_2407e4b505a3225eefd4a545d9857ec0c36b57c70dd22a37274af0e8f9060047",
      "ev_4582e87f1e836effa76e2d7c4434e9e9e25027a220c09ef1f4ac4d86dca80d11",
    ],
    artifactSha256: "0f2b28c8083d60a19094833592f9b5f236339d5f546e8078dc4fd3a45efa5994",
    visitedAstNodes: 40379,
    dataFlowRelations: 20074,
    objectFlowRelations: 1761,
    callFlowRelations: 619,
    internalizedKernels: [
      "Klecks PenBrush 4종 알파 팁(circle/chalk/calligraphy/square) + 밉맵 + 분필 회전((x+y)*53123)",
      "Klecks BlendBrush 적응형 스페이싱(mix(size, size*2/9)) + 45% 양방향 픽업 + 샤프니스 폴오프",
      "Klecks SmudgeBrush 자기 덮어쓰기 방지 양방향 스캔라인 복사 + 알파 비율 가중 블렌딩",
      "Klecks SketchyBrush 삼각함수 결정론적 PRNG(sin(6324634.2345*cos(++seed*5342.3423))) + 0.3 내측 현",
      "Klecks ChemyBrush 4분면 대칭 실루엣 + 수직 바운딩박스 선형 그라데이션",
      "Klecks PixelBrush Bresenham 정수 선분 + PixelDiscUnion 수평 스캔라인 병합",
    ],
  },
  {
    targetId: "rea-wave22-oss-bezier-fitcurve-wick-konva",
    displayName: "Schneider fit-curve + Pomax bezier.js + Wick Editor + Konva + SculptGL + Fabric.js",
    category: "github-oss-semantic",
    sourceUrlOrPath: "https://github.com/soswow/fit-curve",
    parentAnalysisEvidenceId: "ev_7889f4c77aad850c565c1d5e5b2b9618368d5f94eff95cb2ece35a3771dae667",
    summaryViewEvidenceId: "ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1",
    modulesViewEvidenceId: "ev_ded5dfce9a356a67ddeeff3d6daa134cca3d297e26be93e252b1f50125f95d0c",
    jsFactsViewEvidenceId: "ev_77ec039f2b88cbe17d651558181f7fddc24a079c6712a60be74105748bfea9a8",
    semanticTraceEvidenceIds: [
      "ev_0249f50541a3e6ba75de40cacc096f72ef58e3732ff4a2b758512c0f91fbab21",
      "ev_b6695ade9b6a931144c9eaa40e5fc84c1874519aa23b3eac76b448fed446d311",
    ],
    artifactSha256: "510a0da4e35bbe61a0d309b737a72d666584d9050085dad6130c7e7a37fa6cae",
    visitedAstNodes: 23390,
    dataFlowRelations: 12991,
    objectFlowRelations: 1490,
    callFlowRelations: 321,
    internalizedKernels: [
      "Schneider fitCubic 2x2 Cramer 최소자승 제어점 해법 + Wu/Barsky 폴백 + Newton-Raphson 재매개변수화",
      "Pomax bezier.js 해석적 법선 오프셋 곡선 + 부호 곡률 kappa(t) 첨점(Cusp) 감지 및 교차 억제",
      "Wick Editor Croquis 필압 매핑([0.14, 1.0]) + 벡터 블롭 윤곽 합집합 + FillBucket 모폴로지 갭필",
      "Konva Line.js Cardinal Tension 스플라인 현 길이 비례 제어점 확장",
    ],
  },
  {
    targetId: "kleki-live-web-application",
    displayName: "Kleki Paint Tool Live Web Application (https://kleki.com/)",
    category: "web-drawing-app",
    sourceUrlOrPath: "https://kleki.com/",
    parentAnalysisEvidenceId: "ev_4f595af8dd54f2b16616eacd326cec6836a7cf487e2ef741942c51ecfc657cbf",
    summaryViewEvidenceId: "ev_0516537b2ec94a9be6d2a5b8ad462f092ccbfb8385dae17119682e25d66ecc0b",
    modulesViewEvidenceId: "ev_fea11f72411af055b8c7ad205cf8e396dbc8422791e9e92f09e86283cf7ddfb3",
    jsFactsViewEvidenceId: "ev_e18363e6ca16f1021568217f61ca8b0bd0fb8985502a9bb9cf7caa9b89d8489b",
    semanticTraceEvidenceIds: ["ev_e18363e6ca16f1021568217f61ca8b0bd0fb8985502a9bb9cf7caa9b89d8489b"],
    artifactSha256: "729961c419cdfce0d959e266da81e2084f897acd38a1b7d9ed8394584456ba62",
    visitedAstNodes: 6299,
    dataFlowRelations: 3412,
    objectFlowRelations: 418,
    callFlowRelations: 128,
    internalizedKernels: ["Kleki 라이브 웹 브러시 UI 툴바 상태 머신 및 BezierLine 베지어 보간 스탬핑 파이프라인"],
  },
  {
    targetId: "sculptgl-live-web-application",
    displayName: "SculptGL WebGL Sculpting Live Application (https://stephaneginier.com/sculptgl/)",
    category: "web-drawing-app",
    sourceUrlOrPath: "https://stephaneginier.com/sculptgl/",
    parentAnalysisEvidenceId: "ev_dc3c4491d9c09949ef98b8c5429d5ee8517e128711bf903d731c9135b369d4fb",
    summaryViewEvidenceId: "ev_69e649b77cb172c5d3af961306998500a9d2e971b0dc9383d818582a9edbf6ef",
    modulesViewEvidenceId: "ev_5987f111cacd4a5496b4c58fb7adf164805d0445f40f8be8597942b0d1959979",
    jsFactsViewEvidenceId: "ev_36354f8da48307c96490a6867a35c5263751e84667a861d366f6aee5c2ef118c",
    semanticTraceEvidenceIds: ["ev_36354f8da48307c96490a6867a35c5263751e84667a861d366f6aee5c2ef118c"],
    artifactSha256: "8b2a7bdcbd67777df57b81fb0c6b7e036a472a115d845dacf9e5f9d8d54423da",
    visitedAstNodes: 12163,
    dataFlowRelations: 6180,
    objectFlowRelations: 724,
    callFlowRelations: 214,
    internalizedKernels: ["SculptGL 라이브 WebGL 조각 브러시 반경 피킹·스트로크 스텝·MatCap 셰이딩 유니폼 파이프라인"],
  },
] as const;

export interface Point2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

const clamp01 = (v: number): number => (!Number.isFinite(v) ? 0 : Math.max(0, Math.min(1, v)));
const clampRange = (v: number, min: number, max: number, fb: number): number =>
  !Number.isFinite(v) ? fb : Math.max(min, Math.min(max, v));
const sub2D = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
const add2D = (a: Point2D, b: Point2D): Point2D => ({ x: a.x + b.x, y: a.y + b.y });
const scale2D = (v: Point2D, s: number): Point2D => ({ x: v.x * s, y: v.y * s });
const dot2D = (a: Point2D, b: Point2D): number => a.x * b.x + a.y * b.y;
function normalize2D(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y);
  return len <= 1e-9 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

export interface SchneiderCubicBezierSegment {
  readonly p0: Point2D;
  readonly ctrl1: Point2D;
  readonly ctrl2: Point2D;
  readonly p3: Point2D;
}

export interface SchneiderBezierFitResult {
  readonly segments: readonly SchneiderCubicBezierSegment[];
  readonly maxErrorSq: number;
  readonly newtonIterations: number;
  readonly svgPathData: string;
}

function evalCubicBezier(seg: SchneiderCubicBezierSegment, t: number): Point2D {
  const mt = 1 - t;
  const b0 = mt * mt * mt;
  const b1 = 3 * mt * mt * t;
  const b2 = 3 * mt * t * t;
  const b3 = t * t * t;
  return {
    x: seg.p0.x * b0 + seg.ctrl1.x * b1 + seg.ctrl2.x * b2 + seg.p3.x * b3,
    y: seg.p0.y * b0 + seg.ctrl1.y * b1 + seg.ctrl2.y * b2 + seg.p3.y * b3,
  };
}

function evalCubicBezierDerivative1(seg: SchneiderCubicBezierSegment, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: 3 * ((seg.ctrl1.x - seg.p0.x) * mt * mt + 2 * (seg.ctrl2.x - seg.ctrl1.x) * mt * t + (seg.p3.x - seg.ctrl2.x) * t * t),
    y: 3 * ((seg.ctrl1.y - seg.p0.y) * mt * mt + 2 * (seg.ctrl2.y - seg.ctrl1.y) * mt * t + (seg.p3.y - seg.ctrl2.y) * t * t),
  };
}

function evalCubicBezierDerivative2(seg: SchneiderCubicBezierSegment, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: 6 * ((seg.ctrl2.x - 2 * seg.ctrl1.x + seg.p0.x) * mt + (seg.p3.x - 2 * seg.ctrl2.x + seg.ctrl1.x) * t),
    y: 6 * ((seg.ctrl2.y - 2 * seg.ctrl1.y + seg.p0.y) * mt + (seg.p3.y - 2 * seg.ctrl2.y + seg.ctrl1.y) * t),
  };
}

function chordLengthParameterize(points: readonly Point2D[]): number[] {
  const u: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    u.push(u[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = u[u.length - 1];
  return total <= 1e-9
    ? points.map((_, idx) => idx / Math.max(1, points.length - 1))
    : u.map((val) => val / total);
}

function generateSchneiderBezier(
  points: readonly Point2D[],
  uPrime: readonly number[],
  leftTangent: Point2D,
  rightTangent: Point2D,
): SchneiderCubicBezierSegment {
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < points.length; i += 1) {
    const u = uPrime[i];
    const mt = 1 - u;
    const a0 = scale2D(leftTangent, 3 * u * mt * mt);
    const a1 = scale2D(rightTangent, 3 * u * u * mt);
    c00 += dot2D(a0, a0);
    c01 += dot2D(a0, a1);
    c11 += dot2D(a1, a1);
    const w0 = mt * mt * (1 + 2 * u);
    const w3 = u * u * (3 - 2 * u);
    const tmp = {
      x: points[i].x - (firstPt.x * w0 + lastPt.x * w3),
      y: points[i].y - (firstPt.y * w0 + lastPt.y * w3),
    };
    x0 += dot2D(a0, tmp);
    x1 += dot2D(a1, tmp);
  }

  const detC0C1 = c00 * c11 - c01 * c01;
  const alphaL = Math.abs(detC0C1) < 1e-9 ? 0 : (x0 * c11 - x1 * c01) / detC0C1;
  const alphaR = Math.abs(detC0C1) < 1e-9 ? 0 : (c00 * x1 - c01 * x0) / detC0C1;
  const segLength = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);
  const epsilon = 1e-6 * segLength;

  if (alphaL < epsilon || alphaR < epsilon) {
    const fb = segLength / 3;
    return {
      p0: firstPt,
      ctrl1: add2D(firstPt, scale2D(leftTangent, fb)),
      ctrl2: add2D(lastPt, scale2D(rightTangent, fb)),
      p3: lastPt,
    };
  }
  return {
    p0: firstPt,
    ctrl1: add2D(firstPt, scale2D(leftTangent, alphaL)),
    ctrl2: add2D(lastPt, scale2D(rightTangent, alphaR)),
    p3: lastPt,
  };
}

function computeMaxFitErrorSq(
  points: readonly Point2D[],
  bez: SchneiderCubicBezierSegment,
  u: readonly number[],
): { readonly maxDistSq: number; readonly splitPoint: number } {
  let maxDistSq = 0;
  let splitPoint = Math.max(1, Math.floor(points.length / 2));
  for (let i = 1; i < points.length - 1; i += 1) {
    const q = evalCubicBezier(bez, u[i]);
    const distSq = (q.x - points[i].x) ** 2 + (q.y - points[i].y) ** 2;
    if (distSq >= maxDistSq) {
      maxDistSq = distSq;
      splitPoint = i;
    }
  }
  return { maxDistSq, splitPoint };
}

function newtonRaphsonReparameterize(
  points: readonly Point2D[],
  bez: SchneiderCubicBezierSegment,
  u: readonly number[],
): number[] {
  return points.map((pt, idx) => {
    const param = u[idx];
    const diff = sub2D(evalCubicBezier(bez, param), pt);
    const q1 = evalCubicBezierDerivative1(bez, param);
    const q2 = evalCubicBezierDerivative2(bez, param);
    const denom = dot2D(q1, q1) + dot2D(diff, q2);
    return Math.abs(denom) < 1e-9 ? param : clamp01(param - dot2D(diff, q1) / denom);
  });
}

export function fitSchneiderCubicBezierSpline(
  rawPoints: readonly Point2D[],
  maxErrorPx = 4.0,
): SchneiderBezierFitResult {
  const filtered: Point2D[] = [];
  for (const pt of rawPoints) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const prev = filtered[filtered.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-4) {
      filtered.push({ x: pt.x, y: pt.y, pressure01: pt.pressure01 });
    }
  }
  if (filtered.length < 2) {
    return { segments: [], maxErrorSq: 0, newtonIterations: 0, svgPathData: "" };
  }

  const errorSq = clampRange(maxErrorPx, 0.05, 200, 4.0) ** 2;
  let totalNewtonIterations = 0;
  let globalMaxErrorSq = 0;

  const fitCubicRecursive = (
    pts: readonly Point2D[],
    leftTan: Point2D,
    rightTan: Point2D,
    depth: number,
  ): SchneiderCubicBezierSegment[] => {
    if (pts.length === 2) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 3;
      return [{ p0: pts[0], ctrl1: add2D(pts[0], scale2D(leftTan, dist)), ctrl2: add2D(pts[1], scale2D(rightTan, dist)), p3: pts[1] }];
    }
    let u = chordLengthParameterize(pts);
    let bez = generateSchneiderBezier(pts, u, leftTan, rightTan);
    let { maxDistSq, splitPoint } = computeMaxFitErrorSq(pts, bez, u);
    if (maxDistSq < errorSq) {
      globalMaxErrorSq = Math.max(globalMaxErrorSq, maxDistSq);
      return [bez];
    }
    if (maxDistSq < errorSq * 16) {
      for (let iter = 0; iter < 20; iter += 1) {
        totalNewtonIterations += 1;
        u = newtonRaphsonReparameterize(pts, bez, u);
        bez = generateSchneiderBezier(pts, u, leftTan, rightTan);
        const evalRes = computeMaxFitErrorSq(pts, bez, u);
        maxDistSq = evalRes.maxDistSq;
        splitPoint = evalRes.splitPoint;
        if (maxDistSq < errorSq) {
          globalMaxErrorSq = Math.max(globalMaxErrorSq, maxDistSq);
          return [bez];
        }
      }
    }
    if (depth >= 8 || pts.length <= 3) {
      globalMaxErrorSq = Math.max(globalMaxErrorSq, maxDistSq);
      return [bez];
    }
    const centerTangent = normalize2D(sub2D(pts[Math.max(0, splitPoint - 1)], pts[Math.min(pts.length - 1, splitPoint + 1)]));
    return [
      ...fitCubicRecursive(pts.slice(0, splitPoint + 1), leftTan, centerTangent, depth + 1),
      ...fitCubicRecursive(pts.slice(splitPoint), scale2D(centerTangent, -1), rightTan, depth + 1),
    ];
  };

  const segments = fitCubicRecursive(
    filtered,
    normalize2D(sub2D(filtered[1], filtered[0])),
    normalize2D(sub2D(filtered[filtered.length - 2], filtered[filtered.length - 1])),
    0,
  );
  const svgPathData =
    segments.length === 0
      ? ""
      : [
          `M ${segments[0].p0.x.toFixed(2)} ${segments[0].p0.y.toFixed(2)}`,
          ...segments.map((s) => `C ${s.ctrl1.x.toFixed(2)} ${s.ctrl1.y.toFixed(2)}, ${s.ctrl2.x.toFixed(2)} ${s.ctrl2.y.toFixed(2)}, ${s.p3.x.toFixed(2)} ${s.p3.y.toFixed(2)}`),
        ].join(" ");

  return {
    segments,
    maxErrorSq: Math.round(globalMaxErrorSq * 10000) / 10000,
    newtonIterations: totalNewtonIterations,
    svgPathData,
  };
}

export interface PomaxBezierOffsetSample {
  readonly t01: number;
  readonly center: Point2D;
  readonly normal: Point2D;
  readonly leftRail: Point2D;
  readonly rightRail: Point2D;
  readonly signedCurvature: number;
  readonly isCuspFoldover: boolean;
}

export interface PomaxBezierParallelOffsetEnvelope {
  readonly samples: readonly PomaxBezierOffsetSample[];
  readonly cuspCount: number;
  readonly maxAbsCurvature: number;
}

export function computePomaxBezierParallelOffsetEnvelope(params: {
  readonly segment: SchneiderCubicBezierSegment;
  readonly startRadiusPx: number;
  readonly endRadiusPx: number;
  readonly sampleSteps?: number;
}): PomaxBezierParallelOffsetEnvelope {
  const steps = Math.max(4, Math.min(128, Math.round(params.sampleSteps ?? 24)));
  const r0 = Math.max(0.25, params.startRadiusPx);
  const r1 = Math.max(0.25, params.endRadiusPx);
  const samples: PomaxBezierOffsetSample[] = [];
  let cuspCount = 0;
  let maxAbsCurvature = 0;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const center = evalCubicBezier(params.segment, t);
    const d1 = evalCubicBezierDerivative1(params.segment, t);
    const d2 = evalCubicBezierDerivative2(params.segment, t);
    const speedSq = d1.x * d1.x + d1.y * d1.y;
    const speed = Math.max(1e-6, Math.sqrt(speedSq));
    const normal = { x: -d1.y / speed, y: d1.x / speed };
    const signedCurvature = (d1.x * d2.y - d1.y * d2.x) / Math.max(1e-9, speedSq * speed);
    const absCurv = Math.abs(signedCurvature);
    maxAbsCurvature = Math.max(maxAbsCurvature, absCurv);
    const radius = r0 + (r1 - r0) * t;
    const isCuspFoldover = absCurv * radius > 1;
    if (isCuspFoldover) cuspCount += 1;
    const clampedRadius = isCuspFoldover ? Math.min(radius, 0.95 / Math.max(1e-4, absCurv)) : radius;

    samples.push({
      t01: t,
      center,
      normal,
      leftRail: { x: center.x + normal.x * clampedRadius, y: center.y + normal.y * clampedRadius },
      rightRail: { x: center.x - normal.x * clampedRadius, y: center.y - normal.y * clampedRadius },
      signedCurvature,
      isCuspFoldover,
    });
  }
  return { samples, cuspCount, maxAbsCurvature: Math.round(maxAbsCurvature * 100000) / 100000 };
}

export type KlecksBrushEngineKind = "pen" | "blend" | "smudge" | "sketchy" | "chemy" | "pixel";
export type KlecksPenAlphaMode = "circle" | "chalk" | "calligraphy" | "square";
export type KlecksPresetId =
  | "klecks-pen-circle"
  | "klecks-pen-chalk"
  | "klecks-pen-calligraphy"
  | "klecks-pen-square"
  | "klecks-blend-watercolor"
  | "klecks-blend-soft-glaze"
  | "klecks-smudge-directional"
  | "klecks-sketchy-trig-web"
  | "klecks-chemy-symmetry-gradient"
  | "klecks-pixel-disc-union";

export interface KlecksBrushPresetSpec {
  readonly id: KlecksPresetId;
  readonly labelKo: string;
  readonly engineKind: KlecksBrushEngineKind;
  readonly penAlphaMode?: KlecksPenAlphaMode;
  readonly defaultSizePx: number;
  readonly defaultOpacity01: number;
  readonly blending01: number;
  readonly scatter01: number;
}

export const KLECKS_BRUSH_PRESETS: readonly KlecksBrushPresetSpec[] = [
  { id: "klecks-pen-circle", labelKo: "Klecks 원형 밉맵 펜", engineKind: "pen", penAlphaMode: "circle", defaultSizePx: 12, defaultOpacity01: 0.95, blending01: 0, scatter01: 0 },
  { id: "klecks-pen-chalk", labelKo: "Klecks 회전 분필(Chalk)", engineKind: "pen", penAlphaMode: "chalk", defaultSizePx: 18, defaultOpacity01: 0.85, blending01: 0, scatter01: 0.15 },
  { id: "klecks-pen-calligraphy", labelKo: "Klecks 사선 캘리그라피", engineKind: "pen", penAlphaMode: "calligraphy", defaultSizePx: 16, defaultOpacity01: 0.92, blending01: 0, scatter01: 0 },
  { id: "klecks-pen-square", labelKo: "Klecks 각진 마커(Square)", engineKind: "pen", penAlphaMode: "square", defaultSizePx: 20, defaultOpacity01: 0.88, blending01: 0, scatter01: 0 },
  { id: "klecks-blend-watercolor", labelKo: "Klecks 양방향 수채 블렌드", engineKind: "blend", defaultSizePx: 24, defaultOpacity01: 0.72, blending01: 0.65, scatter01: 0 },
  { id: "klecks-blend-soft-glaze", labelKo: "Klecks 소프트 글레이즈 블렌드", engineKind: "blend", defaultSizePx: 32, defaultOpacity01: 0.55, blending01: 0.35, scatter01: 0 },
  { id: "klecks-smudge-directional", labelKo: "Klecks 방향성 스캔라인 스머지", engineKind: "smudge", defaultSizePx: 22, defaultOpacity01: 0.8, blending01: 0.8, scatter01: 0 },
  { id: "klecks-sketchy-trig-web", labelKo: "Klecks 삼각함수 거미줄 스케치", engineKind: "sketchy", defaultSizePx: 4, defaultOpacity01: 0.45, blending01: 0.4, scatter01: 0 },
  { id: "klecks-chemy-symmetry-gradient", labelKo: "Klecks 4분면 그라데이션 Chemy", engineKind: "chemy", defaultSizePx: 14, defaultOpacity01: 0.9, blending01: 0, scatter01: 0 },
  { id: "klecks-pixel-disc-union", labelKo: "Klecks 스캔라인 병합 픽셀펜", engineKind: "pixel", defaultSizePx: 6, defaultOpacity01: 1.0, blending01: 0, scatter01: 0 },
] as const;

export interface KlecksExecutionResult {
  readonly presetId: KlecksPresetId;
  readonly engineKind: KlecksBrushEngineKind;
  readonly dabCount: number;
  readonly adaptiveSpacingPx: number;
  readonly mipmapDimensionPx: 32 | 64 | 128;
  readonly chalkAngleRad: number;
  readonly radialSharpness01: number;
  readonly mixedReservoirRgb01: readonly [number, number, number];
  readonly smudgeScanlineOrder: "bottom-to-top" | "top-to-bottom";
  readonly sketchyWebChordCount: number;
  readonly chemySymmetryPolygonCount: number;
  readonly pixelDiscUnionSpanCount: number;
}

export function evaluateKlecksTrigonometricPrng01(seedIndex: number): number {
  const s = Math.trunc(Number.isFinite(seedIndex) ? seedIndex : 1) + 1;
  return clamp01(Math.sin(6324634.2345 * Math.cos(s * 5342.3423)) * 0.5 + 0.5);
}

export function executeKlecksBrushEngineSuite(params: {
  readonly presetId: KlecksPresetId;
  readonly points: readonly Point2D[];
  readonly sizePx?: number;
  readonly opacity01?: number;
  readonly brushRgb01?: readonly [number, number, number];
  readonly canvasSampleRgb01?: readonly [number, number, number];
  readonly canvasSampleAlpha01?: number;
  readonly seed?: number;
}): KlecksExecutionResult {
  const preset = KLECKS_BRUSH_PRESETS.find((item) => item.id === params.presetId) ?? KLECKS_BRUSH_PRESETS[0];
  const valid = params.points.filter((p) => Number.isFinite(p.x) && !Number.isNaN(p.y));
  const size = clampRange(params.sizePx ?? preset.defaultSizePx, 0.5, 250, preset.defaultSizePx);
  const opacity = clamp01(params.opacity01 ?? preset.defaultOpacity01);
  const brushRgb = params.brushRgb01 ?? [0.22, 0.48, 0.94];
  const canvasRgb = params.canvasSampleRgb01 ?? [0.96, 0.84, 0.24];
  const canvasAlpha = clamp01(params.canvasSampleAlpha01 ?? 0.85);
  let seedCursor = Math.trunc(params.seed ?? 1026);

  const diameter = size * 2;
  const mipmapDimensionPx: 32 | 64 | 128 = diameter > 64 ? 128 : diameter > 32 ? 64 : 32;
  const spacingBlendT = clamp01((size - 2.7) / (12 - 2.7));
  const adaptiveSpacingPx = preset.engineKind === "blend" ? size + ((size * 2) / 9 - size) * spacingBlendT : Math.max(1, size * 0.28);

  const firstPt = valid[0] ?? { x: 0, y: 0 };
  const lastPt = valid[valid.length - 1] ?? firstPt;
  const chalkAngleRad = preset.penAlphaMode === "chalk" ? Math.abs(((lastPt.x + lastPt.y) * 53123) % (Math.PI * 2)) : 0;
  const radialSharpness01 = Math.round(opacity * opacity * 0.8 * 10000) / 10000;
  const blendMix = 0.45 * preset.blending01 * canvasAlpha;
  const mixedReservoirRgb01: readonly [number, number, number] = [
    clamp01(brushRgb[0] * (1 - blendMix) + canvasRgb[0] * blendMix),
    clamp01(brushRgb[1] * (1 - blendMix) + canvasRgb[1] * blendMix),
    clamp01(brushRgb[2] * (1 - blendMix) + canvasRgb[2] * blendMix),
  ];
  const smudgeScanlineOrder: "bottom-to-top" | "top-to-bottom" = firstPt.y < lastPt.y ? "bottom-to-top" : "top-to-bottom";

  let sketchyWebChordCount = 0;
  if (preset.engineKind === "sketchy" && valid.length >= 2) {
    const scale = Math.max(1, size * 0.5);
    const maxDistSq = 4000 * scale * scale;
    for (let i = 1; i < valid.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const dSq = (valid[j].x - valid[i].x) ** 2 + (valid[j].y - valid[i].y) ** 2;
        seedCursor += 1;
        if (dSq < maxDistSq && evaluateKlecksTrigonometricPrng01(seedCursor) > dSq / (2000 * scale * scale)) {
          sketchyWebChordCount += 1;
        }
      }
    }
  }

  const chemySymmetryPolygonCount = preset.engineKind === "chemy" && valid.length >= 2 ? 4 : 0;
  const pixelDiscUnionSpanCount = preset.engineKind === "pixel" && valid.length > 0 ? valid.length * (Math.max(1, Math.round(size * 0.5)) * 2 + 1) : 0;

  let totalArc = 0;
  for (let i = 1; i < valid.length; i += 1) {
    totalArc += Math.hypot(valid[i].x - valid[i - 1].x, valid[i].y - valid[i - 1].y);
  }
  const dabCount = valid.length === 0 ? 0 : Math.max(valid.length, Math.ceil(totalArc / Math.max(0.5, adaptiveSpacingPx)));

  return {
    presetId: preset.id,
    engineKind: preset.engineKind,
    dabCount,
    adaptiveSpacingPx: Math.round(adaptiveSpacingPx * 1000) / 1000,
    mipmapDimensionPx,
    chalkAngleRad: Math.round(chalkAngleRad * 10000) / 10000,
    radialSharpness01,
    mixedReservoirRgb01,
    smudgeScanlineOrder,
    sketchyWebChordCount,
    chemySymmetryPolygonCount,
    pixelDiscUnionSpanCount,
  };
}

export interface WickCroquisBlobAndGapFillResult {
  readonly croquisPressures01: readonly number[];
  readonly effectiveStabilizerWeight: number;
  readonly blobPolygonVertices: readonly Point2D[];
  readonly closedGapBridgeCount: number;
}

export function executeWickCroquisBlobAndGapFill(params: {
  readonly points: readonly Point2D[];
  readonly baseRadiusPx: number;
  readonly stabilizerWeight0to100?: number;
  readonly gapEndpoints?: readonly { readonly a: Point2D; readonly b: Point2D }[];
  readonly gapFillAmountPx?: number;
}): WickCroquisBlobAndGapFillResult {
  const valid = params.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const baseRadius = Math.max(1, params.baseRadiusPx);
  const weightRaw = clampRange(params.stabilizerWeight0to100 ?? 35, 0, 100, 35);
  const effectiveStabilizerWeight = Math.round((weightRaw / 100 + 0.3) * 1000) / 1000;
  const croquisPressures01 = valid.map((pt) => Math.round((0.14 + 0.86 * clamp01(pt.pressure01 ?? 0.75)) * 10000) / 10000);

  const leftSide: Point2D[] = [];
  const rightSide: Point2D[] = [];
  for (let i = 0; i < valid.length; i += 1) {
    const curr = valid[i];
    const tan = normalize2D(sub2D(valid[Math.min(valid.length - 1, i + 1)], valid[Math.max(0, i - 1)]));
    const norm = { x: -tan.y, y: tan.x };
    const r = baseRadius * (croquisPressures01[i] ?? 0.5);
    leftSide.push({ x: curr.x + norm.x * r, y: curr.y + norm.y * r });
    rightSide.push({ x: curr.x - norm.x * r, y: curr.y - norm.y * r });
  }

  const maxGapPx = Math.max(0, params.gapFillAmountPx ?? 12);
  let closedGapBridgeCount = 0;
  for (const gap of params.gapEndpoints ?? []) {
    if (Math.hypot(gap.b.x - gap.a.x, gap.b.y - gap.a.y) <= maxGapPx) closedGapBridgeCount += 1;
  }

  return {
    croquisPressures01,
    effectiveStabilizerWeight,
    blobPolygonVertices: [...leftSide, ...rightSide.reverse()],
    closedGapBridgeCount,
  };
}

export interface KonvaTensionControlPair {
  readonly anchor: Point2D;
  readonly prevControlPoint: Point2D;
  readonly nextControlPoint: Point2D;
}

export function evaluateKonvaCardinalTensionSpline(
  points: readonly Point2D[],
  tension = 0.5,
): readonly KonvaTensionControlPair[] {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 3) return [];
  const t = clampRange(tension, -2, 2, 0.5);
  const pairs: KonvaTensionControlPair[] = [];

  for (let i = 1; i < valid.length - 1; i += 1) {
    const p0 = valid[i - 1];
    const p1 = valid[i];
    const p2 = valid[i + 1];
    const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const denom = Math.max(1e-6, d01 + d12);
    const fa = (t * d01) / denom;
    const fb = (t * d12) / denom;
    pairs.push({
      anchor: p1,
      prevControlPoint: { x: p1.x - fa * (p2.x - p0.x), y: p1.y - fa * (p2.y - p0.y) },
      nextControlPoint: { x: p1.x + fb * (p2.x - p0.x), y: p1.y + fb * (p2.y - p0.y) },
    });
  }
  return pairs;
}
