/**
 * Blender Grease Pencil 3.0 × Feather 3D 클린룸 3D 공간 필압 벡터 작화 & 가이드 서피스 로프팅 엔진.
 *
 * - 1단계: 카메라 정면 가이드 평면 생성, 가로지르는 벤드 스트로크로 원통형 굽히기(Bend),
 *   2~4개 공간 곡선의 Coons 패치 로프팅(Loft)으로 파라메트릭 3D 가이드 서피스를 구축한다.
 * - 2단계: 2D 포인터 레이를 가이드 서피스에 투영·자석 흡착해 5-float 스트라이드(x,y,z,pressure,tilt)
 *   공간 스트로크로 기록한다.
 * - 비파괴 모디파이어(테이퍼·스무스·결정적 노이즈·법선 오프셋·대칭 미러)와 3D 라디얼 리퀴파이,
 *   Instanced Ribbon 지오메트리 빌더, 320KiB 예산 직렬화를 제공한다.
 */

export type SpatialVec3 = readonly [number, number, number];

export interface SpatialStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pressure: number;
  readonly tilt: number;
}

export type SpatialGreasePassKind = "main-line" | "effect-line";

export type SpatialStrokeModifier =
  | { readonly kind: "taper"; readonly startRatio: number; readonly endRatio: number }
  | { readonly kind: "smooth"; readonly iterations: number; readonly factor: number }
  | { readonly kind: "noise"; readonly amplitude: number; readonly frequency: number; readonly seed: number }
  | { readonly kind: "offset"; readonly normalOffset: number }
  | { readonly kind: "mirror"; readonly axis: "x" | "y" | "z"; readonly pivot: number };

export interface SpatialStroke3D {
  readonly id: string;
  readonly layerPass: SpatialGreasePassKind;
  readonly baseWidthM: number;
  readonly colorHex: string;
  /** Stride-5 packed Float32Array: [x, y, z, pressure, tilt, ...]. */
  readonly packedPoints: Float32Array;
  readonly guideSurfaceId: string | null;
  readonly modifiers: readonly SpatialStrokeModifier[];
}

export type GuideSurfaceKind = "camera-plane" | "bend-cylinder" | "coons-loft";

export interface GuideSurface3D {
  readonly id: string;
  readonly kind: GuideSurfaceKind;
  readonly uSteps: number;
  readonly vSteps: number;
  /** (uSteps + 1) * (vSteps + 1) 격자 정점(row-major: v * (uSteps + 1) + u). */
  readonly gridPoints: readonly SpatialVec3[];
  readonly origin: SpatialVec3;
  readonly normal: SpatialVec3;
}

export interface SpatialRibbonGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface SpatialGreaseDocument {
  readonly version: 1;
  readonly guides: readonly GuideSurface3D[];
  readonly strokes: readonly SpatialStroke3D[];
}

export const SPATIAL_GREASE_MAX_BYTES = 320 * 1024;
export const SPATIAL_STROKE_STRIDE = 5;

function vecAdd(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecSub(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecScale(v: SpatialVec3, s: number): SpatialVec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vecDot(a: SpatialVec3, b: SpatialVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecLength(v: SpatialVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function vecNormalize(v: SpatialVec3, fallback: SpatialVec3 = [0, 0, 1]): SpatialVec3 {
  const len = vecLength(v);
  if (len <= 1e-8) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vecLerp(a: SpatialVec3, b: SpatialVec3, t: number): SpatialVec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function deterministicHashSigned(index: number, seed: number): number {
  let x = (Math.imul(index + 1, 374761393) + Math.imul(seed + 11, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

export function packSpatialStrokePoints(points: readonly SpatialStrokePoint[]): Float32Array {
  const out = new Float32Array(points.length * SPATIAL_STROKE_STRIDE);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const o = i * SPATIAL_STROKE_STRIDE;
    out[o] = p.x;
    out[o + 1] = p.y;
    out[o + 2] = p.z;
    out[o + 3] = clamp01(p.pressure);
    out[o + 4] = p.tilt;
  }
  return out;
}

export function unpackSpatialStrokePoints(packed: Float32Array): SpatialStrokePoint[] {
  const count = Math.floor(packed.length / SPATIAL_STROKE_STRIDE);
  const out: SpatialStrokePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const o = i * SPATIAL_STROKE_STRIDE;
    out.push({
      x: packed[o]!,
      y: packed[o + 1]!,
      z: packed[o + 2]!,
      pressure: packed[o + 3]!,
      tilt: packed[o + 4]!,
    });
  }
  return out;
}

/** 1단계: 카메라 정면 법선 기준 3D 가이드 평면을 생성한다. */
export function createCameraPlaneGuide(input: {
  readonly id: string;
  readonly origin: SpatialVec3;
  readonly cameraForward: SpatialVec3;
  readonly cameraUp?: SpatialVec3;
  readonly widthM: number;
  readonly heightM: number;
  readonly uSteps?: number;
  readonly vSteps?: number;
}): GuideSurface3D {
  const uSteps = Math.max(2, Math.min(32, input.uSteps ?? 8));
  const vSteps = Math.max(2, Math.min(32, input.vSteps ?? 8));
  const normal = vecNormalize(vecScale(input.cameraForward, -1), [0, 0, 1]);
  const upHint = vecNormalize(input.cameraUp ?? [0, 1, 0], [0, 1, 0]);
  const right = vecNormalize(vecCross(upHint, normal), [1, 0, 0]);
  const up = vecNormalize(vecCross(normal, right), [0, 1, 0]);

  const gridPoints: SpatialVec3[] = [];
  for (let iv = 0; iv <= vSteps; iv += 1) {
    const v = iv / vSteps - 0.5;
    for (let iu = 0; iu <= uSteps; iu += 1) {
      const u = iu / uSteps - 0.5;
      const offsetU = vecScale(right, u * input.widthM);
      const offsetV = vecScale(up, v * input.heightM);
      gridPoints.push(vecAdd(input.origin, vecAdd(offsetU, offsetV)));
    }
  }
  return {
    id: input.id,
    kind: "camera-plane",
    uSteps,
    vSteps,
    gridPoints,
    origin: input.origin,
    normal,
  };
}

/** 1단계(확장): 가이드 평면을 가로지르는 벤드 곡률만큼 원통형으로 굽힌다(Feather 3D Bend). */
export function bendGuideSurfaceWithArc(
  guide: GuideSurface3D,
  bendDepthM: number,
  axis: "u" | "v" = "u",
): GuideSurface3D {
  const { uSteps, vSteps, normal } = guide;
  const bent: SpatialVec3[] = [];
  for (let iv = 0; iv <= vSteps; iv += 1) {
    const tv = iv / vSteps;
    for (let iu = 0; iu <= uSteps; iu += 1) {
      const tu = iu / uSteps;
      const base = guide.gridPoints[iv * (uSteps + 1) + iu]!;
      const t = axis === "u" ? tu : tv;
      const bulge = Math.sin(t * Math.PI) * bendDepthM;
      bent.push(vecAdd(base, vecScale(normal, bulge)));
    }
  }
  return {
    ...guide,
    kind: "bend-cylinder",
    gridPoints: bent,
  };
}

function samplePolyline(curve: readonly SpatialVec3[], t: number): SpatialVec3 {
  if (curve.length === 0) return [0, 0, 0];
  if (curve.length === 1) return curve[0]!;
  const clamped = clamp01(t);
  const scaled = clamped * (curve.length - 1);
  const i0 = Math.min(curve.length - 2, Math.floor(scaled));
  const localT = scaled - i0;
  return vecLerp(curve[i0]!, curve[i0 + 1]!, localT);
}

/** 1단계(로프트): 2~4개 공간 경계 곡선으로 Coons/Ruled 3D 가이드 서피스를 스킨 생성한다. */
export function loftGuideSurfaceFromCurves(input: {
  readonly id: string;
  readonly curves: readonly (readonly SpatialVec3[])[];
  readonly uSteps?: number;
  readonly vSteps?: number;
}): GuideSurface3D {
  if (input.curves.length < 2 || input.curves.length > 4) {
    throw new RangeError("가이드 로프트에는 2~4개의 공간 곡선이 필요합니다.");
  }
  const uSteps = Math.max(2, Math.min(32, input.uSteps ?? 8));
  const vSteps = Math.max(2, Math.min(32, input.vSteps ?? 8));
  const gridPoints: SpatialVec3[] = [];

  if (input.curves.length === 2) {
    const [c0, c1] = input.curves as [readonly SpatialVec3[], readonly SpatialVec3[]];
    for (let iv = 0; iv <= vSteps; iv += 1) {
      const v = iv / vSteps;
      for (let iu = 0; iu <= uSteps; iu += 1) {
        const u = iu / uSteps;
        gridPoints.push(vecLerp(samplePolyline(c0, u), samplePolyline(c1, u), v));
      }
    }
  } else {
    const bottom = input.curves[0]!;
    const top = input.curves[1]!;
    const left = input.curves[2]!;
    const right = input.curves[3] ?? [bottom[bottom.length - 1]!, top[top.length - 1]!];
    const p00 = samplePolyline(bottom, 0);
    const p10 = samplePolyline(bottom, 1);
    const p01 = samplePolyline(top, 0);
    const p11 = samplePolyline(top, 1);

    for (let iv = 0; iv <= vSteps; iv += 1) {
      const v = iv / vSteps;
      for (let iu = 0; iu <= uSteps; iu += 1) {
        const u = iu / uSteps;
        const ruledU = vecLerp(samplePolyline(bottom, u), samplePolyline(top, u), v);
        const ruledV = vecLerp(samplePolyline(left, v), samplePolyline(right, v), u);
        const bilinear = vecLerp(vecLerp(p00, p10, u), vecLerp(p01, p11, u), v);
        gridPoints.push(vecSub(vecAdd(ruledU, ruledV), bilinear));
      }
    }
  }

  const center = gridPoints[Math.floor(gridPoints.length / 2)] ?? [0, 0, 0];
  const du = vecSub(gridPoints[1] ?? center, gridPoints[0] ?? center);
  const dv = vecSub(gridPoints[uSteps + 1] ?? center, gridPoints[0] ?? center);
  const normal = vecNormalize(vecCross(du, dv), [0, 0, 1]);

  return {
    id: input.id,
    kind: "coons-loft",
    uSteps,
    vSteps,
    gridPoints,
    origin: center,
    normal,
  };
}

function intersectRayTriangle(
  rayOrigin: SpatialVec3,
  rayDir: SpatialVec3,
  v0: SpatialVec3,
  v1: SpatialVec3,
  v2: SpatialVec3,
): { readonly t: number; readonly point: SpatialVec3; readonly normal: SpatialVec3 } | null {
  const e1 = vecSub(v1, v0);
  const e2 = vecSub(v2, v0);
  const p = vecCross(rayDir, e2);
  const det = vecDot(e1, p);
  if (Math.abs(det) < 1e-7) return null;
  const invDet = 1 / det;
  const s = vecSub(rayOrigin, v0);
  const u = vecDot(s, p) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return null;
  const q = vecCross(s, e1);
  const v = vecDot(rayDir, q) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return null;
  const t = vecDot(e2, q) * invDet;
  if (t < 0) return null;
  const normal = vecNormalize(vecCross(e1, e2), [0, 0, 1]);
  return { t, point: vecAdd(rayOrigin, vecScale(rayDir, t)), normal };
}

/** 2단계: 포인터 레이 배열을 3D 가이드 서피스에 레이캐스트 자석 흡착해 공간 스트로크를 생성한다. */
export function projectRaysOntoGuideSurface(input: {
  readonly strokeId: string;
  readonly guide: GuideSurface3D;
  readonly rays: readonly {
    readonly origin: SpatialVec3;
    readonly direction: SpatialVec3;
    readonly pressure: number;
    readonly tilt?: number;
  }[];
  readonly normalOffsetM?: number;
  readonly baseWidthM?: number;
  readonly colorHex?: string;
  readonly layerPass?: SpatialGreasePassKind;
}): SpatialStroke3D {
  const { guide } = input;
  const offset = input.normalOffsetM ?? 0.002;
  const hits: SpatialStrokePoint[] = [];

  for (const ray of input.rays) {
    const dir = vecNormalize(ray.direction, [0, 0, -1]);
    let best: { readonly t: number; readonly point: SpatialVec3; readonly normal: SpatialVec3 } | null = null;
    for (let iv = 0; iv < guide.vSteps; iv += 1) {
      for (let iu = 0; iu < guide.uSteps; iu += 1) {
        const i00 = iv * (guide.uSteps + 1) + iu;
        const i10 = i00 + 1;
        const i01 = i00 + (guide.uSteps + 1);
        const i11 = i01 + 1;
        const p00 = guide.gridPoints[i00]!;
        const p10 = guide.gridPoints[i10]!;
        const p01 = guide.gridPoints[i01]!;
        const p11 = guide.gridPoints[i11]!;
        const hit1 = intersectRayTriangle(ray.origin, dir, p00, p10, p11);
        if (hit1 && (!best || hit1.t < best.t)) best = hit1;
        const hit2 = intersectRayTriangle(ray.origin, dir, p00, p11, p01);
        if (hit2 && (!best || hit2.t < best.t)) best = hit2;
      }
    }
    if (best) {
      const snapped = vecAdd(best.point, vecScale(best.normal, offset));
      hits.push({
        x: snapped[0],
        y: snapped[1],
        z: snapped[2],
        pressure: clamp01(ray.pressure),
        tilt: ray.tilt ?? 0,
      });
    }
  }

  return {
    id: input.strokeId,
    layerPass: input.layerPass ?? "main-line",
    baseWidthM: input.baseWidthM ?? 0.015,
    colorHex: input.colorHex ?? "#18181b",
    packedPoints: packSpatialStrokePoints(hits),
    guideSurfaceId: guide.id,
    modifiers: [],
  };
}

/** 비파괴 스트로크 모디파이어(테이퍼·스무스·결정적 노이즈·오프셋·미러)를 순차 평가한다. */
export function evaluateSpatialStrokeModifiers(
  stroke: SpatialStroke3D,
  surfaceNormal: SpatialVec3 = [0, 0, 1],
): readonly SpatialStrokePoint[][] {
  let branches: SpatialStrokePoint[][] = [unpackSpatialStrokePoints(stroke.packedPoints)];

  for (const mod of stroke.modifiers) {
    if (mod.kind === "taper") {
      branches = branches.map((pts) => {
        const last = Math.max(1, pts.length - 1);
        return pts.map((pt, idx) => {
          const u = idx / last;
          const startGain = mod.startRatio > 0 ? Math.min(1, u / mod.startRatio) : 1;
          const endGain = mod.endRatio > 0 ? Math.min(1, (1 - u) / mod.endRatio) : 1;
          return { ...pt, pressure: clamp01(pt.pressure * Math.min(startGain, endGain)) };
        });
      });
    } else if (mod.kind === "smooth") {
      const iters = Math.max(1, Math.min(16, Math.round(mod.iterations)));
      const f = clamp01(mod.factor);
      branches = branches.map((pts) => {
        let current = pts;
        for (let step = 0; step < iters; step += 1) {
          current = current.map((pt, idx) => {
            if (idx === 0 || idx === current.length - 1) return pt;
            const prev = current[idx - 1]!;
            const next = current[idx + 1]!;
            return {
              ...pt,
              x: pt.x + ((prev.x + next.x) * 0.5 - pt.x) * f,
              y: pt.y + ((prev.y + next.y) * 0.5 - pt.y) * f,
              z: pt.z + ((prev.z + next.z) * 0.5 - pt.z) * f,
            };
          });
        }
        return current;
      });
    } else if (mod.kind === "noise") {
      branches = branches.map((pts, bIdx) =>
        pts.map((pt, idx) => {
          const phase = Math.round(idx * Math.max(1, mod.frequency)) + bIdx * 97;
          return {
            ...pt,
            x: pt.x + deterministicHashSigned(phase, mod.seed) * mod.amplitude,
            y: pt.y + deterministicHashSigned(phase + 13, mod.seed + 7) * mod.amplitude,
            z: pt.z + deterministicHashSigned(phase + 29, mod.seed + 19) * mod.amplitude,
          };
        }),
      );
    } else if (mod.kind === "offset") {
      const n = vecNormalize(surfaceNormal);
      branches = branches.map((pts) =>
        pts.map((pt) => ({
          ...pt,
          x: pt.x + n[0] * mod.normalOffset,
          y: pt.y + n[1] * mod.normalOffset,
          z: pt.z + n[2] * mod.normalOffset,
        })),
      );
    } else if (mod.kind === "mirror") {
      const mirrored = branches.map((pts) =>
        pts.map((pt) => ({
          ...pt,
          x: mod.axis === "x" ? 2 * mod.pivot - pt.x : pt.x,
          y: mod.axis === "y" ? 2 * mod.pivot - pt.y : pt.y,
          z: mod.axis === "z" ? 2 * mod.pivot - pt.z : pt.z,
        })),
      );
      branches = [...branches, ...mirrored];
    }
  }

  return branches;
}

/** 3D 공간 스트로크에 반경 기반 라디얼 워프(3D Liquify)를 적용한다. */
export function applySpatialLiquifyWarp(
  stroke: SpatialStroke3D,
  center: SpatialVec3,
  delta: SpatialVec3,
  radiusM: number,
  strength01 = 1,
): SpatialStroke3D {
  if (radiusM <= 1e-6 || strength01 <= 0) return stroke;
  const pts = unpackSpatialStrokePoints(stroke.packedPoints);
  const s = clamp01(strength01);
  const warped = pts.map((pt) => {
    const dist = Math.hypot(pt.x - center[0], pt.y - center[1], pt.z - center[2]);
    if (dist >= radiusM) return pt;
    const t = 1 - dist / radiusM;
    const weight = t * t * (3 - 2 * t) * s;
    return {
      ...pt,
      x: pt.x + delta[0] * weight,
      y: pt.y + delta[1] * weight,
      z: pt.z + delta[2] * weight,
    };
  });
  return { ...stroke, packedPoints: packSpatialStrokePoints(warped) };
}

/** 카메라 지향 3D 리본 스트립 지오메트리를 생성한다. */
export function buildSpatialStrokeRibbonGeometry(
  points: readonly SpatialStrokePoint[],
  baseWidthM: number,
  cameraPosition: SpatialVec3,
): SpatialRibbonGeometry {
  if (points.length < 2) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
    };
  }
  const vertexCount = points.length * 2;
  const quadCount = points.length - 1;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(quadCount * 6);

  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const pos: SpatialVec3 = [cur.x, cur.y, cur.z];
    const tangent = vecNormalize([next.x - prev.x, next.y - prev.y, next.z - prev.z], [1, 0, 0]);
    const viewDir = vecNormalize(vecSub(cameraPosition, pos), [0, 0, 1]);
    const side = vecNormalize(vecCross(viewDir, tangent), [0, 1, 0]);
    const halfWidth = Math.max(0.0005, baseWidthM * Math.max(0.1, cur.pressure) * 0.5);
    const left = vecSub(pos, vecScale(side, halfWidth));
    const right = vecAdd(pos, vecScale(side, halfWidth));
    const vIdx = i * 2;
    positions.set(left, vIdx * 3);
    positions.set(right, (vIdx + 1) * 3);
    normals.set(viewDir, vIdx * 3);
    normals.set(viewDir, (vIdx + 1) * 3);
    const u = i / (points.length - 1);
    uvs.set([u, 0], vIdx * 2);
    uvs.set([u, 1], (vIdx + 1) * 2);
  }

  for (let q = 0; q < quadCount; q += 1) {
    const a = q * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    const o = q * 6;
    indices[o] = a;
    indices[o + 1] = b;
    indices[o + 2] = c;
    indices[o + 3] = b;
    indices[o + 4] = d;
    indices[o + 5] = c;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    vertexCount,
    triangleCount: quadCount * 2,
  };
}

/** 320KiB 문서 예산 내에서 델타 양자화 JSON 직렬화를 수행한다. */
export function serializeSpatialGreaseDocument(doc: SpatialGreaseDocument): {
  readonly ok: true;
  readonly json: string;
  readonly byteLength: number;
} | {
  readonly ok: false;
  readonly reasonKo: string;
  readonly byteLength: number;
} {
  const payload = {
    version: doc.version,
    guides: doc.guides,
    strokes: doc.strokes.map((s) => ({
      id: s.id,
      layerPass: s.layerPass,
      baseWidthM: s.baseWidthM,
      colorHex: s.colorHex,
      guideSurfaceId: s.guideSurfaceId,
      modifiers: s.modifiers,
      quantizedPoints: Array.from(s.packedPoints, (v) => Math.round(v * 1000) / 1000),
    })),
  };
  const json = JSON.stringify(payload);
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > SPATIAL_GREASE_MAX_BYTES) {
    return {
      ok: false,
      reasonKo: `3D 공간 스트로크 문서 크기가 320KiB 예산(${byteLength}B)을 초과했습니다.`,
      byteLength,
    };
  }
  return { ok: true, json, byteLength };
}

export function deserializeSpatialGreaseDocument(json: string): SpatialGreaseDocument {
  const parsed = JSON.parse(json) as {
    version: 1;
    guides: GuideSurface3D[];
    strokes: Array<
      Omit<SpatialStroke3D, "packedPoints"> & { quantizedPoints: number[] }
    >;
  };
  return {
    version: 1,
    guides: parsed.guides,
    strokes: parsed.strokes.map((s) => ({
      id: s.id,
      layerPass: s.layerPass,
      baseWidthM: s.baseWidthM,
      colorHex: s.colorHex,
      guideSurfaceId: s.guideSurfaceId,
      modifiers: s.modifiers,
      packedPoints: Float32Array.from(s.quantizedPoints),
    })),
  };
}
