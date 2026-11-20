/**
 * Blender Geometry Nodes 커브 기반 웹툰 배경 제너레이터 & 필드 엔진 (클린룸 구현).
 *
 * - 핵심 커브/필드 노드 4종: resampleCurve, curveToMesh(수밀 단면 스윕),
 *   evaluateField(position/normal/index/curveFactor/seededNoise/math),
 *   instanceCollectionOnPoints(InstancedMesh용 Float32Array 4x4 행렬 배치)
 * - 웹툰 배경 원클릭 레시피 6종:
 *   fence(펜스/울타리), powerline(전봇대·현수선 전선), arch(아치·쐐기돌),
 *   stairs(곡선/직선 계단·난간), bookshelf(책장 도서 자동 채우기), street-trees(가로수·가로등)
 * - 결정적 시드 기반 경량 JSON 직렬화 및 미터 단위(1.0 = 1m) 바닥 접지 유지
 */

export const GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION = 1 as const;

export interface CurveVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CurveVec2 {
  readonly x: number;
  readonly y: number;
}

export interface ResampledCurvePoint {
  readonly index: number;
  readonly factor: number;
  readonly arcLength: number;
  readonly position: CurveVec3;
  readonly tangent: CurveVec3;
  readonly normal: CurveVec3;
  readonly binormal: CurveVec3;
}

export type GeoFieldSpec =
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "index" }
  | { readonly kind: "curveFactor" }
  | { readonly kind: "positionAxis"; readonly axis: "x" | "y" | "z" }
  | { readonly kind: "normalAxis"; readonly axis: "x" | "y" | "z" }
  | { readonly kind: "seededNoise"; readonly seed: number; readonly frequency: number }
  | {
      readonly kind: "math";
      readonly op: "add" | "mul" | "sin" | "remap";
      readonly a: GeoFieldSpec;
      readonly b?: GeoFieldSpec;
      readonly outMin?: number;
      readonly outMax?: number;
    };

export interface SweptMeshGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

export interface InstancedAssetBatch {
  readonly assetId: string;
  readonly count: number;
  /** 열 우선(column-major) 4x4 TRS 행렬 배열 (길이 = count * 16, Three.js InstancedMesh 호환). */
  readonly matrices: Float32Array;
}

export type WebtoonCurveRecipeKind =
  | "fence"
  | "powerline"
  | "arch"
  | "stairs"
  | "bookshelf"
  | "street-trees";

export interface WebtoonCurveRecipeSpec {
  readonly version: typeof GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION;
  readonly kind: WebtoonCurveRecipeKind;
  readonly seed: number;
  readonly controlPoints: readonly CurveVec3[];
  readonly closed?: boolean;
  /** 기본 간격(미터). */
  readonly spacingMeters: number;
  /** 주요 구조물 높이(미터). */
  readonly heightMeters: number;
  /** 폭 또는 반경(미터). */
  readonly widthMeters: number;
  /** 레시피별 보조 계수(전선 처짐, 아치 첨두도, 계단 단수 등). */
  readonly detailRatio?: number;
}

export interface WebtoonCurveRecipeOutput {
  readonly kind: WebtoonCurveRecipeKind;
  readonly seed: number;
  readonly sampleCount: number;
  readonly totalLengthMeters: number;
  readonly sweptMesh: SweptMeshGeometry;
  readonly instanceBatches: readonly InstancedAssetBatch[];
  readonly drawCallCount: number;
}

function vSub(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vAdd(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vScale(a: CurveVec3, s: number): CurveVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function vDot(a: CurveVec3, b: CurveVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vCross(a: CurveVec3, b: CurveVec3): CurveVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vLen(a: CurveVec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function vNorm(a: CurveVec3, fallback: CurveVec3 = { x: 0, y: 1, z: 0 }): CurveVec3 {
  const len = vLen(a);
  return len > 1e-8 ? { x: a.x / len, y: a.y / len, z: a.z / len } : fallback;
}

/** 결정적 시드 PRNG(Mulberry32 계열 해시) -> [0, 1). */
export function seededUnitHash(seed: number, index: number, salt = 0): number {
  let h =
    Math.imul(seed | 0, 1597334677) ^
    Math.imul(index | 0, 3812015801) ^
    Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 3D 폴리라인 커브를 등간격 개수 또는 미터 길이 기준으로 리샘플링하고 Parallel Transport 프레임을 구성한다. */
export function resampleCurve(
  controlPoints: readonly CurveVec3[],
  mode: "count" | "length",
  value: number,
  closed = false,
): readonly ResampledCurvePoint[] {
  if (controlPoints.length < 2) {
    throw new Error("커브 리샘플링에는 최소 2개의 제어점이 필요합니다.");
  }
  const source: CurveVec3[] = closed ? [...controlPoints, controlPoints[0]!] : [...controlPoints];
  const cumLen: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < source.length; i += 1) {
    totalLen += vLen(vSub(source[i]!, source[i - 1]!));
    cumLen.push(totalLen);
  }
  if (totalLen < 1e-6) {
    throw new Error("커브 총 길이가 0에 가까워 리샘플링할 수 없습니다.");
  }

  const targetCount =
    mode === "count"
      ? Math.max(2, Math.floor(value))
      : Math.max(2, Math.ceil(totalLen / Math.max(0.05, value)) + 1);

  const samplePos = (s: number): CurveVec3 => {
    const clamped = Math.max(0, Math.min(totalLen, s));
    let seg = 0;
    while (seg < cumLen.length - 2 && cumLen[seg + 1]! < clamped) seg += 1;
    const s0 = cumLen[seg]!;
    const s1 = cumLen[seg + 1]!;
    const t = s1 > s0 ? (clamped - s0) / (s1 - s0) : 0;
    const p0 = source[seg]!;
    const p1 = source[seg + 1]!;
    return {
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      z: p0.z + (p1.z - p0.z) * t,
    };
  };

  const positions: CurveVec3[] = [];
  const arcs: number[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const factor = closed ? i / targetCount : i / (targetCount - 1);
    const arc = factor * totalLen;
    positions.push(samplePos(arc));
    arcs.push(arc);
  }

  const out: ResampledCurvePoint[] = [];
  let prevTangent = vNorm(vSub(positions[1]!, positions[0]!), { x: 0, y: 0, z: 1 });
  const initUp = Math.abs(prevTangent.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let prevNormal = vNorm(vSub(initUp, vScale(prevTangent, vDot(initUp, prevTangent))));

  for (let i = 0; i < targetCount; i += 1) {
    const prevIdx = i === 0 ? (closed ? targetCount - 1 : 0) : i - 1;
    const nextIdx = i === targetCount - 1 ? (closed ? 0 : targetCount - 1) : i + 1;
    const tangent = vNorm(vSub(positions[nextIdx]!, positions[prevIdx]!), prevTangent);

    let normal = prevNormal;
    if (i > 0) {
      const axis = vCross(prevTangent, tangent);
      const axisLen = vLen(axis);
      if (axisLen > 1e-6) {
        const k = vScale(axis, 1 / axisLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, vDot(prevTangent, tangent))));
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        normal = vAdd(
          vAdd(vScale(prevNormal, c), vScale(vCross(k, prevNormal), s)),
          vScale(k, vDot(k, prevNormal) * (1 - c)),
        );
      }
      normal = vNorm(vSub(normal, vScale(tangent, vDot(normal, tangent))), prevNormal);
    }
    const binormal = vNorm(vCross(tangent, normal));
    out.push({
      index: i,
      factor: targetCount > 1 ? i / (targetCount - 1) : 0,
      arcLength: arcs[i]!,
      position: positions[i]!,
      tangent,
      normal,
      binormal,
    });
    prevTangent = tangent;
    prevNormal = normal;
  }

  return out;
}

/** 커브 샘플 도메인 위에서 지연 평가(Lazy) 필드를 스칼라 Float32Array로 계산한다. */
export function evaluateField(
  samples: readonly ResampledCurvePoint[],
  spec: GeoFieldSpec,
): Float32Array {
  const out = new Float32Array(samples.length);
  if (spec.kind === "constant") {
    out.fill(spec.value);
    return out;
  }
  if (spec.kind === "index") {
    for (let i = 0; i < samples.length; i += 1) out[i] = samples[i]!.index;
    return out;
  }
  if (spec.kind === "curveFactor") {
    for (let i = 0; i < samples.length; i += 1) out[i] = samples[i]!.factor;
    return out;
  }
  if (spec.kind === "positionAxis") {
    for (let i = 0; i < samples.length; i += 1) out[i] = samples[i]!.position[spec.axis];
    return out;
  }
  if (spec.kind === "normalAxis") {
    for (let i = 0; i < samples.length; i += 1) out[i] = samples[i]!.normal[spec.axis];
    return out;
  }
  if (spec.kind === "seededNoise") {
    for (let i = 0; i < samples.length; i += 1) {
      const p = samples[i]!;
      const bucket = Math.floor(p.arcLength * spec.frequency);
      const frac = p.arcLength * spec.frequency - bucket;
      const n0 = seededUnitHash(spec.seed, bucket, 11);
      const n1 = seededUnitHash(spec.seed, bucket + 1, 11);
      const s = frac * frac * (3 - 2 * frac);
      out[i] = n0 + (n1 - n0) * s;
    }
    return out;
  }

  const aArr = evaluateField(samples, spec.a);
  const bArr = spec.b ? evaluateField(samples, spec.b) : null;
  for (let i = 0; i < samples.length; i += 1) {
    const av = aArr[i]!;
    const bv = bArr ? bArr[i]! : 0;
    if (spec.op === "add") out[i] = av + bv;
    else if (spec.op === "mul") out[i] = av * bv;
    else if (spec.op === "sin") out[i] = Math.sin(av);
    else {
      const min = spec.outMin ?? 0;
      const max = spec.outMax ?? 1;
      out[i] = min + (max - min) * av;
    }
  }
  return out;
}

/** 원형 2D 단면 프로파일 링을 생성한다. */
export function createCircleProfile(radius: number, sides = 8): readonly CurveVec2[] {
  const safeSides = Math.max(3, Math.floor(sides));
  const ring: CurveVec2[] = [];
  for (let i = 0; i < safeSides; i += 1) {
    const a = (i / safeSides) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return ring;
}

/** 2D 단면을 커브 프레임을 따라 스윕해 수밀(닫힌 캡 포함 가능) 삼각 메시를 생성한다. */
export function curveToMesh(
  samples: readonly ResampledCurvePoint[],
  profileRing: readonly CurveVec2[],
  options: {
    readonly closedCurve?: boolean;
    readonly fillCaps?: boolean;
    readonly radiusScaleField?: GeoFieldSpec;
  } = {},
): SweptMeshGeometry {
  const ringLen = profileRing.length;
  const sampleLen = samples.length;
  if (sampleLen < 2 || ringLen < 3) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
    };
  }

  const scales = options.radiusScaleField
    ? evaluateField(samples, options.radiusScaleField)
    : new Float32Array(sampleLen).fill(1);
  const fillCaps = Boolean(options.fillCaps) && !options.closedCurve;

  const posList: number[] = [];
  const normList: number[] = [];
  const idxList: number[] = [];

  for (let i = 0; i < sampleLen; i += 1) {
    const pt = samples[i]!;
    const rScale = Math.max(0.05, scales[i]!);
    for (let j = 0; j < ringLen; j += 1) {
      const prof = profileRing[j]!;
      const dx = pt.binormal.x * prof.x * rScale + pt.normal.x * prof.y * rScale;
      const dy = pt.binormal.y * prof.x * rScale + pt.normal.y * prof.y * rScale;
      const dz = pt.binormal.z * prof.x * rScale + pt.normal.z * prof.y * rScale;
      posList.push(pt.position.x + dx, pt.position.y + dy, pt.position.z + dz);
      const n = vNorm({ x: dx, y: dy, z: dz }, pt.normal);
      normList.push(n.x, n.y, n.z);
    }
  }

  const segCount = options.closedCurve ? sampleLen : sampleLen - 1;
  for (let s = 0; s < segCount; s += 1) {
    const r0 = s * ringLen;
    const r1 = ((s + 1) % sampleLen) * ringLen;
    for (let j = 0; j < ringLen; j += 1) {
      const jNext = (j + 1) % ringLen;
      const a = r0 + j;
      const b = r0 + jNext;
      const c = r1 + jNext;
      const d = r1 + j;
      idxList.push(a, b, c, a, c, d);
    }
  }

  if (fillCaps) {
    // 시작 캡 중심 정점
    const startCenterIdx = posList.length / 3;
    const first = samples[0]!;
    posList.push(first.position.x, first.position.y, first.position.z);
    normList.push(-first.tangent.x, -first.tangent.y, -first.tangent.z);
    for (let j = 0; j < ringLen; j += 1) {
      const jNext = (j + 1) % ringLen;
      idxList.push(startCenterIdx, jNext, j);
    }

    // 끝 캡 중심 정점
    const endCenterIdx = posList.length / 3;
    const last = samples[sampleLen - 1]!;
    const lastRing = (sampleLen - 1) * ringLen;
    posList.push(last.position.x, last.position.y, last.position.z);
    normList.push(last.tangent.x, last.tangent.y, last.tangent.z);
    for (let j = 0; j < ringLen; j += 1) {
      const jNext = (j + 1) % ringLen;
      idxList.push(endCenterIdx, lastRing + j, lastRing + jNext);
    }
  }

  return {
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    indices: new Uint32Array(idxList),
  };
}

function mergeSweptMeshes(meshes: readonly SweptMeshGeometry[]): SweptMeshGeometry {
  let totalPos = 0;
  let totalIdx = 0;
  for (const m of meshes) {
    totalPos += m.positions.length;
    totalIdx += m.indices.length;
  }
  const positions = new Float32Array(totalPos);
  const normals = new Float32Array(totalPos);
  const indices = new Uint32Array(totalIdx);
  let posOff = 0;
  let idxOff = 0;
  let vBase = 0;

  for (const m of meshes) {
    positions.set(m.positions, posOff);
    normals.set(m.normals, posOff);
    for (let i = 0; i < m.indices.length; i += 1) {
      indices[idxOff + i] = m.indices[i]! + vBase;
    }
    posOff += m.positions.length;
    idxOff += m.indices.length;
    vBase += m.positions.length / 3;
  }
  return { positions, normals, indices };
}

/** 열 우선(column-major) 4x4 기저+위치+스케일 행렬을 dst 버퍼에 기록한다. */
function writeBasisMatrix4(
  dst: Float32Array,
  offset: number,
  xAxis: CurveVec3,
  yAxis: CurveVec3,
  zAxis: CurveVec3,
  pos: CurveVec3,
  sx: number,
  sy: number,
  sz: number,
): void {
  dst[offset + 0] = xAxis.x * sx;
  dst[offset + 1] = xAxis.y * sx;
  dst[offset + 2] = xAxis.z * sx;
  dst[offset + 3] = 0;

  dst[offset + 4] = yAxis.x * sy;
  dst[offset + 5] = yAxis.y * sy;
  dst[offset + 6] = yAxis.z * sy;
  dst[offset + 7] = 0;

  dst[offset + 8] = zAxis.x * sz;
  dst[offset + 9] = zAxis.y * sz;
  dst[offset + 10] = zAxis.z * sz;
  dst[offset + 11] = 0;

  dst[offset + 12] = pos.x;
  dst[offset + 13] = pos.y;
  dst[offset + 14] = pos.z;
  dst[offset + 15] = 1;
}

/** 커브 샘플 포인트에 에셋 컬렉션을 결정적 시드로 인스턴싱한다(Three.js InstancedMesh 배치). */
export function instanceCollectionOnPoints(
  samples: readonly ResampledCurvePoint[],
  assetIds: readonly string[],
  options: {
    readonly seed: number;
    readonly baseScale?: CurveVec3;
    readonly scaleJitter?: number;
    readonly yawJitterRad?: number;
    readonly keepVerticalUp?: boolean;
    readonly offsetY?: number;
  },
): readonly InstancedAssetBatch[] {
  if (samples.length === 0 || assetIds.length === 0) return [];
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < samples.length; i += 1) {
    const pick = Math.floor(seededUnitHash(options.seed, i, 31) * assetIds.length) % assetIds.length;
    const assetId = assetIds[pick]!;
    let list = buckets.get(assetId);
    if (!list) {
      list = [];
      buckets.set(assetId, list);
    }
    list.push(i);
  }

  const baseScale = options.baseScale ?? { x: 1, y: 1, z: 1 };
  const sJitter = Math.max(0, options.scaleJitter ?? 0);
  const yawJitter = Math.max(0, options.yawJitterRad ?? 0);
  const offsetY = options.offsetY ?? 0;
  const batches: InstancedAssetBatch[] = [];

  for (const [assetId, indices] of buckets.entries()) {
    const matrices = new Float32Array(indices.length * 16);
    for (let k = 0; k < indices.length; k += 1) {
      const idx = indices[k]!;
      const pt = samples[idx]!;
      const jScale = 1 + (seededUnitHash(options.seed, idx, 53) * 2 - 1) * sJitter;
      const yaw = (seededUnitHash(options.seed, idx, 71) * 2 - 1) * yawJitter;

      let up: CurveVec3 = options.keepVerticalUp ? { x: 0, y: 1, z: 0 } : pt.normal;
      let fwd: CurveVec3 = options.keepVerticalUp
        ? vNorm({ x: pt.tangent.x, y: 0, z: pt.tangent.z }, { x: 0, y: 0, z: 1 })
        : pt.tangent;
      let right = vNorm(vCross(up, fwd), { x: 1, y: 0, z: 0 });
      fwd = vNorm(vCross(right, up), fwd);
      up = vNorm(up);

      if (Math.abs(yaw) > 1e-5) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const r2 = vAdd(vScale(right, c), vScale(fwd, s));
        const f2 = vAdd(vScale(fwd, c), vScale(right, -s));
        right = r2;
        fwd = f2;
      }

      writeBasisMatrix4(
        matrices,
        k * 16,
        right,
        up,
        fwd,
        { x: pt.position.x, y: pt.position.y + offsetY, z: pt.position.z },
        baseScale.x * jScale,
        baseScale.y * jScale,
        baseScale.z * jScale,
      );
    }
    batches.push({ assetId, count: indices.length, matrices });
  }
  return batches;
}

/** 웹툰 배경 커브 레시피(펜스/전선/아치/계단/책장/가로수)를 결정적으로 생성한다. */
export function generateWebtoonCurveRecipe(spec: WebtoonCurveRecipeSpec): WebtoonCurveRecipeOutput {
  const spacing = Math.max(0.15, spec.spacingMeters);
  const height = Math.max(0.2, spec.heightMeters);
  const width = Math.max(0.05, spec.widthMeters);
  const detail = spec.detailRatio ?? 0.5;

  const baseSamples = resampleCurve(spec.controlPoints, "length", spacing, Boolean(spec.closed));
  const totalLen = baseSamples[baseSamples.length - 1]!.arcLength;
  const sweptParts: SweptMeshGeometry[] = [];
  let batches: readonly InstancedAssetBatch[];

  if (spec.kind === "fence") {
    // 상/하 수평 레일 2줄 스윕 + 기둥/살대 인스턴스 배치
    const railProfile = createCircleProfile(Math.max(0.02, width * 0.15), 6);
    for (const hFrac of [0.35, 0.82]) {
      const elevated = baseSamples.map((s) => ({
        ...s,
        position: { x: s.position.x, y: s.position.y + height * hFrac, z: s.position.z },
      }));
      sweptParts.push(curveToMesh(elevated, railProfile, { closedCurve: spec.closed, fillCaps: true }));
    }
    const postBatches = instanceCollectionOnPoints(baseSamples, ["fence-post"], {
      seed: spec.seed,
      baseScale: { x: width * 0.35, y: height, z: width * 0.35 },
      keepVerticalUp: true,
    });
    const slatSamples = resampleCurve(spec.controlPoints, "length", Math.max(0.12, spacing * 0.33), Boolean(spec.closed));
    const slatBatches = instanceCollectionOnPoints(slatSamples, ["fence-picket"], {
      seed: spec.seed + 7,
      baseScale: { x: width * 0.12, y: height * 0.92, z: width * 0.25 },
      keepVerticalUp: true,
    });
    batches = [...postBatches, ...slatBatches];
  } else if (spec.kind === "powerline") {
    // 전봇대 인스턴스 + 인접 전봇대 사이 물리적 현수선(Catenary) 처짐 케이블 2가닥 스윕
    batches = instanceCollectionOnPoints(baseSamples, ["utility-pole"], {
      seed: spec.seed,
      baseScale: { x: width, y: height, z: width },
      keepVerticalUp: true,
    });
    const wireProfile = createCircleProfile(0.018, 5);
    const sagAmount = Math.max(0.15, spacing * (0.04 + detail * 0.08));
    for (let i = 0; i < baseSamples.length - 1; i += 1) {
      const p0 = baseSamples[i]!;
      const p1 = baseSamples[i + 1]!;
      for (const side of [-1, 1]) {
        const wirePts: CurveVec3[] = [];
        const segSteps = 8;
        for (let k = 0; k <= segSteps; k += 1) {
          const t = k / segSteps;
          // 포물선/현수선 근사: 4t(1-t)
          const sag = 4 * t * (1 - t) * sagAmount;
          const x = p0.position.x + (p1.position.x - p0.position.x) * t + p0.binormal.x * side * width * 0.7;
          const y = p0.position.y + (p1.position.y - p0.position.y) * t + height * 0.92 - sag;
          const z = p0.position.z + (p1.position.z - p0.position.z) * t + p0.binormal.z * side * width * 0.7;
          wirePts.push({ x, y, z });
        }
        const wireSamples = resampleCurve(wirePts, "count", segSteps + 1, false);
        sweptParts.push(curveToMesh(wireSamples, wireProfile, { fillCaps: true }));
      }
    }
  } else if (spec.kind === "arch") {
    // 시작점~끝점 사이 아치 곡선 생성 + 아치 리브 스윕 + 쐐기돌 인스턴싱
    const pStart = spec.controlPoints[0]!;
    const pEnd = spec.controlPoints[spec.controlPoints.length - 1]!;
    const archSteps = Math.max(8, Math.round(totalLen / Math.max(0.2, spacing)));
    const archPts: CurveVec3[] = [];
    for (let i = 0; i <= archSteps; i += 1) {
      const t = i / archSteps;
      const theta = t * Math.PI;
      // detail > 0.5 일수록 고딕 첨두(pointed) 아치 형태 강조
      const lift = Math.pow(Math.sin(theta), 1 + (detail - 0.5) * 0.6) * height;
      archPts.push({
        x: pStart.x + (pEnd.x - pStart.x) * t,
        y: pStart.y + (pEnd.y - pStart.y) * t + lift,
        z: pStart.z + (pEnd.z - pStart.z) * t,
      });
    }
    const archSamples = resampleCurve(archPts, "count", archSteps + 1, false);
    sweptParts.push(curveToMesh(archSamples, createCircleProfile(width * 0.25, 8), { fillCaps: true }));
    batches = instanceCollectionOnPoints(archSamples, ["arch-voussoir-stone"], {
      seed: spec.seed,
      baseScale: { x: width, y: width * 0.7, z: spacing * 0.85 },
      keepVerticalUp: false,
    });
  } else if (spec.kind === "stairs") {
    // 커브를 따라 상승하는 계단 디딤판 인스턴스 + 좌/우 난간 핸드레일 스윕
    const stepCount = Math.max(3, Math.round(totalLen / Math.max(0.24, spacing)));
    const rawSamples = resampleCurve(spec.controlPoints, "count", stepCount, false);
    const stairSamples: ResampledCurvePoint[] = rawSamples.map((s, idx) => ({
      ...s,
      position: {
        x: s.position.x,
        y: s.position.y + (idx / Math.max(1, stepCount - 1)) * height,
        z: s.position.z,
      },
    }));
    const railProfile = createCircleProfile(0.032, 6);
    for (const side of [-0.5, 0.5]) {
      const railSamples = stairSamples.map((s) => ({
        ...s,
        position: {
          x: s.position.x + s.binormal.x * width * side,
          y: s.position.y + 0.92,
          z: s.position.z + s.binormal.z * width * side,
        },
      }));
      sweptParts.push(curveToMesh(railSamples, railProfile, { fillCaps: true }));
    }
    batches = instanceCollectionOnPoints(stairSamples, ["stair-tread"], {
      seed: spec.seed,
      baseScale: { x: width, y: height / stepCount, z: totalLen / stepCount },
      keepVerticalUp: true,
    });
  } else if (spec.kind === "bookshelf") {
    // 선반 프레임 스윕 + 결정적 크기·기울기 지터로 도서 3종 컬렉션 자동 채우기
    const shelfProfile = createCircleProfile(0.03, 4);
    sweptParts.push(curveToMesh(baseSamples, shelfProfile, { fillCaps: true }));
    const bookSamples = resampleCurve(spec.controlPoints, "length", Math.max(0.04, spacing * 0.25), false);
    batches = instanceCollectionOnPoints(bookSamples, ["book-tall", "book-medium", "book-pocket"], {
      seed: spec.seed,
      baseScale: { x: 0.035, y: height * 0.24, z: width * 0.75 },
      scaleJitter: 0.18,
      yawJitterRad: 0.08,
      keepVerticalUp: true,
      offsetY: 0.03,
    });
  } else {
    // street-trees: 가로수 & 가로등 교대 배치
    batches = instanceCollectionOnPoints(baseSamples, ["street-tree-a", "street-tree-b", "street-lamp"], {
      seed: spec.seed,
      baseScale: { x: width, y: height, z: width },
      scaleJitter: 0.15,
      yawJitterRad: Math.PI,
      keepVerticalUp: true,
    });
  }

  const sweptMesh = mergeSweptMeshes(sweptParts);
  const drawCallCount = (sweptMesh.indices.length > 0 ? 1 : 0) + batches.length;

  return {
    kind: spec.kind,
    seed: spec.seed,
    sampleCount: baseSamples.length,
    totalLengthMeters: totalLen,
    sweptMesh,
    instanceBatches: batches,
    drawCallCount,
  };
}

/** 레시피를 경량 JSON 문자열로 직렬화한다. */
export function serializeCurveRecipe(spec: WebtoonCurveRecipeSpec): string {
  return JSON.stringify(spec);
}

/** 경량 JSON 문자열을 검증하며 레시피 객체로 복원한다. */
export function deserializeCurveRecipe(json: string): WebtoonCurveRecipeSpec {
  const parsed = JSON.parse(json) as Partial<WebtoonCurveRecipeSpec>;
  if (
    !parsed ||
    parsed.version !== GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION ||
    !Array.isArray(parsed.controlPoints) ||
    parsed.controlPoints.length < 2
  ) {
    throw new Error("유효하지 않은 웹툰 커브 레시피 JSON 형식입니다.");
  }
  return parsed as WebtoonCurveRecipeSpec;
}
