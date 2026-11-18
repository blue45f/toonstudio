/**
 * CSP 원근·사다리꼴·등변사다리꼴·자유 왜곡 4점 코너핀 변환 엔진.
 *
 * Clip Studio Paint의 `editactiontransformtrapezoid`(사다리꼴), `isopodtrapezoid`(등변사다리꼴),
 * `transformfree`(자유 변형 / 원근 왜곡) 명령에 대응하는 순수 기하·래스터 모듈이다.
 * 부분 피벗 가우스 소거법(Gaussian elimination with partial pivoting) 기반 8자유도(8-DOF)
 * 호모그래피 해법, 볼록성·나비넥타이(자가교차) 사각형 가드, 역방향 양선형 RGBA 샘플러를 제공한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import type { StudioImageDataLike } from "../studio-filters";

export interface CornerPinPoint {
  readonly x: number;
  readonly y: number;
}

export type CornerPinKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

export interface CornerPinQuad {
  readonly topLeft: CornerPinPoint;
  readonly topRight: CornerPinPoint;
  readonly bottomRight: CornerPinPoint;
  readonly bottomLeft: CornerPinPoint;
}

export type CornerPinDistortMode = "free" | "trapezoid" | "isopod-trapezoid";
export type TrapezoidAxis = "horizontal" | "vertical";

export type HomographyMatrix3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export type QuadValidationFailureReason =
  | "non-finite"
  | "degenerate-area"
  | "bowtie-self-intersecting"
  | "non-convex";

export interface QuadValidationResult {
  readonly valid: boolean;
  readonly reason?: QuadValidationFailureReason;
  readonly signedArea: number;
}

export interface CornerPinTransformOptions {
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  readonly sourceQuad?: CornerPinQuad;
}

/** 주어진 이미지 해상도(픽셀 중심 0..W-1, 0..H-1)에 대응하는 항등 4점 사각형을 생성한다. */
export function createIdentityCornerPinQuad(width: number, height: number): CornerPinQuad {
  const maxX = Math.max(1, width - 1);
  const maxY = Math.max(1, height - 1);
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: maxX, y: 0 },
    bottomRight: { x: maxX, y: maxY },
    bottomLeft: { x: 0, y: maxY },
  };
}

function quadVertices(quad: CornerPinQuad): readonly [
  CornerPinPoint,
  CornerPinPoint,
  CornerPinPoint,
  CornerPinPoint,
] {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
}

function cross2d(a: CornerPinPoint, b: CornerPinPoint, c: CornerPinPoint): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function segmentsProperlyOrTouchIntersect(
  p1: CornerPinPoint,
  p2: CornerPinPoint,
  p3: CornerPinPoint,
  p4: CornerPinPoint,
): boolean {
  const d1 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
  const d2 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x);
  const d3 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d4 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/**
 * 4점 사각형이 유한하며 자가교차(나비넥타이)나 오목 꺾임이 없는 엄밀 볼록 사각형인지 검증한다.
 */
export function validateCornerPinQuad(quad: CornerPinQuad): QuadValidationResult {
  const pts = quadVertices(quad);
  for (const pt of pts) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return { valid: false, reason: "non-finite", signedArea: 0 };
    }
  }

  // 마주 보는 변끼리 교차하면 나비넥타이(figure-8) 퇴화 사각형이다.
  if (
    segmentsProperlyOrTouchIntersect(pts[0], pts[1], pts[2], pts[3]) ||
    segmentsProperlyOrTouchIntersect(pts[1], pts[2], pts[3], pts[0])
  ) {
    return { valid: false, reason: "bowtie-self-intersecting", signedArea: 0 };
  }

  let doubleArea = 0;
  for (let i = 0; i < 4; i += 1) {
    const curr = pts[i]!;
    const next = pts[(i + 1) % 4]!;
    doubleArea += curr.x * next.y - next.x * curr.y;
  }
  const signedArea = doubleArea * 0.5;

  const c0 = cross2d(pts[0], pts[1], pts[2]);
  const c1 = cross2d(pts[1], pts[2], pts[3]);
  const c2 = cross2d(pts[2], pts[3], pts[0]);
  const c3 = cross2d(pts[3], pts[0], pts[1]);

  const eps = 1e-4;
  const allPos = c0 > eps && c1 > eps && c2 > eps && c3 > eps;
  const allNeg = c0 < -eps && c1 < -eps && c2 < -eps && c3 < -eps;

  if (!allPos && !allNeg) {
    if (Math.abs(signedArea) < 0.5) {
      return { valid: false, reason: "degenerate-area", signedArea };
    }
    return { valid: false, reason: "non-convex", signedArea };
  }

  if (Math.abs(signedArea) < 0.5) {
    return { valid: false, reason: "degenerate-area", signedArea };
  }

  return { valid: true, signedArea };
}

/** 볼록·비교차 사각형 여부 불리언 단축 판정. */
export function isConvexNonBowtieQuad(quad: CornerPinQuad): boolean {
  return validateCornerPinQuad(quad).valid;
}

/**
 * 부분 피벗 가우스 소거법으로 `srcQuad -> dstQuad` 8-DOF 사영 행렬 H (h22 = 1)를 정확히 푼다.
 */
export function solveHomography8Dof(
  srcQuad: CornerPinQuad,
  dstQuad: CornerPinQuad,
): HomographyMatrix3x3 | null {
  if (!isConvexNonBowtieQuad(srcQuad) || !isConvexNonBowtieQuad(dstQuad)) {
    return null;
  }

  const srcPts = quadVertices(srcQuad);
  const dstPts = quadVertices(dstQuad);

  // 8x9 확대행렬 [A | b]
  const aug: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = srcPts[i]!.x;
    const y = srcPts[i]!.y;
    const u = dstPts[i]!.x;
    const v = dstPts[i]!.y;
    aug.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    aug.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  const n = 8;
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const candidate = Math.abs(aug[r]![col]!);
      if (candidate > maxAbs) {
        maxAbs = candidate;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-10) return null;

    if (pivotRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }

    const pivotVal = aug[col]![col]!;
    for (let r = col + 1; r < n; r += 1) {
      const factor = aug[r]![col]! / pivotVal;
      if (factor === 0) continue;
      aug[r]![col] = 0;
      for (let c = col + 1; c <= n; c += 1) {
        aug[r]![c] = aug[r]![c]! - factor * aug[col]![c]!;
      }
    }
  }

  const sol = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = aug[r]![n]!;
    for (let c = r + 1; c < n; c += 1) {
      sum -= aug[r]![c]! * sol[c]!;
    }
    const diag = aug[r]![r]!;
    if (Math.abs(diag) < 1e-10) return null;
    sol[r] = sum / diag;
  }

  return [
    sol[0]!, sol[1]!, sol[2]!,
    sol[3]!, sol[4]!, sol[5]!,
    sol[6]!, sol[7]!, 1,
  ];
}

/** 3x3 호모그래피 행렬로 단일 2D 좌표를 사영한다. */
export function projectPointHomography(
  matrix: HomographyMatrix3x3,
  pt: CornerPinPoint,
): CornerPinPoint | null {
  const denom = matrix[6] * pt.x + matrix[7] * pt.y + matrix[8];
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
  return {
    x: (matrix[0] * pt.x + matrix[1] * pt.y + matrix[2]) / denom,
    y: (matrix[3] * pt.x + matrix[4] * pt.y + matrix[5]) / denom,
  };
}

/**
 * 사다리꼴 변형(`editactiontransformtrapezoid`): 한 꼭짓점 이동 시 마주 보는 평행축을 유지한다.
 */
export function constrainTrapezoidQuad(
  quad: CornerPinQuad,
  corner: CornerPinKey,
  nextPoint: CornerPinPoint,
  axis: TrapezoidAxis = "horizontal",
): CornerPinQuad {
  if (axis === "horizontal") {
    switch (corner) {
      case "topLeft":
        return { ...quad, topLeft: nextPoint, topRight: { x: quad.topRight.x, y: nextPoint.y } };
      case "topRight":
        return { ...quad, topRight: nextPoint, topLeft: { x: quad.topLeft.x, y: nextPoint.y } };
      case "bottomRight":
        return { ...quad, bottomRight: nextPoint, bottomLeft: { x: quad.bottomLeft.x, y: nextPoint.y } };
      case "bottomLeft":
        return { ...quad, bottomLeft: nextPoint, bottomRight: { x: quad.bottomRight.x, y: nextPoint.y } };
    }
  }
  switch (corner) {
    case "topLeft":
      return { ...quad, topLeft: nextPoint, bottomLeft: { x: nextPoint.x, y: quad.bottomLeft.y } };
    case "bottomLeft":
      return { ...quad, bottomLeft: nextPoint, topLeft: { x: nextPoint.x, y: quad.topLeft.y } };
    case "topRight":
      return { ...quad, topRight: nextPoint, bottomRight: { x: nextPoint.x, y: quad.bottomRight.y } };
    case "bottomRight":
      return { ...quad, bottomRight: nextPoint, topRight: { x: nextPoint.x, y: quad.topRight.y } };
  }
}

/**
 * 등변사다리꼴 변형(`isopodtrapezoid`): 중심축 기준 좌우(또는 상하) 대칭으로 꼭짓점을 함께 오므리거나 벌린다.
 */
export function constrainIsopodTrapezoidQuad(
  quad: CornerPinQuad,
  corner: CornerPinKey,
  nextPoint: CornerPinPoint,
  axis: TrapezoidAxis = "horizontal",
): CornerPinQuad {
  const minHalfSpan = 2;
  if (axis === "horizontal") {
    if (corner === "topLeft" || corner === "topRight") {
      const midX = (quad.topLeft.x + quad.topRight.x) * 0.5;
      const halfSpan = Math.max(
        minHalfSpan,
        corner === "topLeft" ? midX - nextPoint.x : nextPoint.x - midX,
      );
      const clampedY = Math.min(nextPoint.y, Math.min(quad.bottomLeft.y, quad.bottomRight.y) - 2);
      return {
        ...quad,
        topLeft: { x: midX - halfSpan, y: clampedY },
        topRight: { x: midX + halfSpan, y: clampedY },
      };
    }
    const midX = (quad.bottomLeft.x + quad.bottomRight.x) * 0.5;
    const halfSpan = Math.max(
      minHalfSpan,
      corner === "bottomLeft" ? midX - nextPoint.x : nextPoint.x - midX,
    );
    const clampedY = Math.max(nextPoint.y, Math.max(quad.topLeft.y, quad.topRight.y) + 2);
    return {
      ...quad,
      bottomLeft: { x: midX - halfSpan, y: clampedY },
      bottomRight: { x: midX + halfSpan, y: clampedY },
    };
  }

  if (corner === "topLeft" || corner === "bottomLeft") {
    const midY = (quad.topLeft.y + quad.bottomLeft.y) * 0.5;
    const halfSpan = Math.max(
      minHalfSpan,
      corner === "topLeft" ? midY - nextPoint.y : nextPoint.y - midY,
    );
    const clampedX = Math.min(nextPoint.x, Math.min(quad.topRight.x, quad.bottomRight.x) - 2);
    return {
      ...quad,
      topLeft: { x: clampedX, y: midY - halfSpan },
      bottomLeft: { x: clampedX, y: midY + halfSpan },
    };
  }
  const midY = (quad.topRight.y + quad.bottomRight.y) * 0.5;
  const halfSpan = Math.max(
    minHalfSpan,
    corner === "topRight" ? midY - nextPoint.y : nextPoint.y - midY,
  );
  const clampedX = Math.max(nextPoint.x, Math.max(quad.topLeft.x, quad.bottomLeft.x) + 2);
  return {
    ...quad,
    topRight: { x: clampedX, y: midY - halfSpan },
    bottomRight: { x: clampedX, y: midY + halfSpan },
  };
}

function pointInsideConvexQuad(pt: CornerPinPoint, quad: CornerPinQuad): boolean {
  const v = quadVertices(quad);
  const c0 = cross2d(v[0], v[1], pt);
  const c1 = cross2d(v[1], v[2], pt);
  const c2 = cross2d(v[2], v[3], pt);
  const c3 = cross2d(v[3], v[0], pt);
  const tol = -1e-5;
  return (
    (c0 >= tol && c1 >= tol && c2 >= tol && c3 >= tol) ||
    (c0 <= -tol && c1 <= -tol && c2 <= -tol && c3 <= -tol)
  );
}

/** 역방향 양선형 RGBA 샘플러. 정수 격자 정확 히트 시 원본 바이트를 무손실 보존한다. */
export function sampleInverseBilinearRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  out: Uint8ClampedArray,
  outOffset: number,
): void {
  if (sx < -1e-5 || sy < -1e-5 || sx > width - 1 + 1e-5 || sy > height - 1 + 1e-5) {
    return;
  }
  const clampedX = Math.min(width - 1, Math.max(0, sx));
  const clampedY = Math.min(height - 1, Math.max(0, sy));
  const rx = Math.round(clampedX);
  const ry = Math.round(clampedY);

  if (Math.abs(clampedX - rx) < 1e-6 && Math.abs(clampedY - ry) < 1e-6) {
    const exactIdx = (ry * width + rx) * 4;
    out[outOffset] = data[exactIdx]!;
    out[outOffset + 1] = data[exactIdx + 1]!;
    out[outOffset + 2] = data[exactIdx + 2]!;
    out[outOffset + 3] = data[exactIdx + 3]!;
    return;
  }

  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const a00 = data[i00 + 3]!;
  const a10 = data[i10 + 3]!;
  const a01 = data[i01 + 3]!;
  const a11 = data[i11 + 3]!;
  const outAlpha = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;

  if (outAlpha <= 0.001) {
    out[outOffset + 3] = 0;
    return;
  }

  // 프리멀티플라이드 알파 보간으로 투명 경계 검은 테두리 번짐을 방지한다.
  const premulW00 = w00 * a00;
  const premulW10 = w10 * a10;
  const premulW01 = w01 * a01;
  const premulW11 = w11 * a11;

  out[outOffset] = Math.round(
    (data[i00]! * premulW00 + data[i10]! * premulW10 + data[i01]! * premulW01 + data[i11]! * premulW11) / outAlpha,
  );
  out[outOffset + 1] = Math.round(
    (data[i00 + 1]! * premulW00 + data[i10 + 1]! * premulW10 + data[i01 + 1]! * premulW01 + data[i11 + 1]! * premulW11) / outAlpha,
  );
  out[outOffset + 2] = Math.round(
    (data[i00 + 2]! * premulW00 + data[i10 + 2]! * premulW10 + data[i01 + 2]! * premulW01 + data[i11 + 2]! * premulW11) / outAlpha,
  );
  out[outOffset + 3] = Math.round(outAlpha);
}

/**
 * 4점 코너핀 사각형(`dstQuad`)으로 입력 RGBA 이미지를 역방향 사영·양선형 샘플링한다.
 * 볼록하지 않거나 자가교차하는 `dstQuad`는 명시적 예외를 던져 깨진 픽셀 출력을 차단한다.
 */
export function applyCornerPinTransform(
  source: StudioImageDataLike,
  dstQuad: CornerPinQuad,
  options: CornerPinTransformOptions = {},
): StudioImageDataLike {
  const { width, height, data } = source;
  const outW = Math.max(1, Math.trunc(options.outputWidth ?? width));
  const outH = Math.max(1, Math.trunc(options.outputHeight ?? height));
  const out = new Uint8ClampedArray(outW * outH * 4);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width: outW, height: outH, data: out };
  }

  const srcQuad = options.sourceQuad ?? createIdentityCornerPinQuad(width, height);
  const validation = validateCornerPinQuad(dstQuad);
  if (!validation.valid) {
    throw new Error(`유효하지 않은 원근 사각형입니다: ${validation.reason ?? "invalid"}`);
  }

  // 역방향 샘플링: 목적지 픽셀 (u, v) -> 원본 좌표 (x, y) 호모그래피를 직접 푼다.
  const invH = solveHomography8Dof(dstQuad, srcQuad);
  if (!invH) {
    throw new Error("원근 호모그래피 행렬이 특이(singular) 상태입니다.");
  }

  const pts = quadVertices(dstQuad);
  const minU = Math.max(0, Math.floor(Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x)));
  const maxU = Math.min(outW - 1, Math.ceil(Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x)));
  const minV = Math.max(0, Math.floor(Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y)));
  const maxV = Math.min(outH - 1, Math.ceil(Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y)));

  for (let v = minV; v <= maxV; v += 1) {
    for (let u = minU; u <= maxU; u += 1) {
      const dstPt = { x: u, y: v };
      if (!pointInsideConvexQuad(dstPt, dstQuad)) continue;
      const srcPt = projectPointHomography(invH, dstPt);
      if (!srcPt) continue;
      sampleInverseBilinearRgba(data, width, height, srcPt.x, srcPt.y, out, (v * outW + u) * 4);
    }
  }

  return { width: outW, height: outH, data: out };
}
