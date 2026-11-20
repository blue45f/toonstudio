/**
 * VRoid Studio 클린룸 — 절차적 헤어 가이드 케이지(Guide Dome), 4종 3D 단면 프로파일,
 * 루트-팁 커브 그래프 및 UV0.v 단조 정렬 메시 생성기.
 *
 * - 두개골 타원 가이드 케이지(Guide Dome) 위 2D/3D 스트로크 투영 및 대칭 복제
 * - 4종 단면 프로파일: `diamond`(각진 애니 가닥), `oval`(부드러운 볼륨), `ribbon`(납작 리본), `crescent`(오목 초승달)
 * - 루트→팁 너비·두께·비틀림(twist) 커브 그래프 평가
 * - Bishop 평행이동 프레임(Frenet 급반전 없음) 스윕 + `UV0.v` (`0` 뿌리 → `1` 끝단) 엄격 단조 증가 보장
 */

export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];

export const HAIR_CROSS_SECTION_PROFILES = Object.freeze([
  "diamond",
  "oval",
  "ribbon",
  "crescent",
] as const);

export type HairCrossSectionProfile = (typeof HAIR_CROSS_SECTION_PROFILES)[number];

export interface HairGuideDomeCage {
  readonly centerM: Vec3Tuple;
  /** X(좌우), Y(상하), Z(앞뒤) 반경(m). */
  readonly radiiM: Vec3Tuple;
  /** 두피 기준 케이지 부풀림 오프셋(m). */
  readonly offsetM: number;
  /** 가이드 케이지 위도·경도 격자 해상도. */
  readonly latRings: number;
  readonly lonSegments: number;
}

export interface HairCurveControlPoint {
  /** 정규화 위치 `t` (`0` 뿌리 ~ `1` 끝단). */
  readonly t: number;
  readonly value: number;
}

export interface HairRootTipCurveGraph {
  readonly widthPoints: readonly HairCurveControlPoint[];
  readonly thicknessPoints: readonly HairCurveControlPoint[];
  readonly twistRadPoints: readonly HairCurveControlPoint[];
}

export interface HairGuideStrandSpec {
  readonly id: string;
  readonly profile: HairCrossSectionProfile;
  /** 가이드 케이지 표면 위 `(azimuthRad, elevationRad)` 또는 3D 제어점 목록. */
  readonly spinePoints: readonly Vec3Tuple[];
  readonly baseWidthM: number;
  readonly baseThicknessM: number;
  /** 스파인 길이 방향 세분화 세그먼트 수. */
  readonly lengthSegments: number;
  readonly curveGraph: HairRootTipCurveGraph;
}

export interface GeneratedHairStrandMesh {
  readonly strandId: string;
  readonly profile: HairCrossSectionProfile;
  readonly ringCount: number;
  readonly ringVertexCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly uvVStrictlyMonotonic: boolean;
}

const EPS = 1e-8;

export const DEFAULT_HAIR_GUIDE_DOME_CAGE: HairGuideDomeCage = Object.freeze({
  centerM: [0, 1.59, -0.005] as const,
  radiiM: [0.092, 0.112, 0.104] as const,
  offsetM: 0.012,
  latRings: 8,
  lonSegments: 16,
});

export const DEFAULT_HAIR_ROOT_TIP_CURVE: HairRootTipCurveGraph = Object.freeze({
  widthPoints: Object.freeze([
    { t: 0, value: 0.85 },
    { t: 0.25, value: 1.0 },
    { t: 0.72, value: 0.72 },
    { t: 1, value: 0.06 },
  ]),
  thicknessPoints: Object.freeze([
    { t: 0, value: 0.9 },
    { t: 0.35, value: 1.0 },
    { t: 0.8, value: 0.65 },
    { t: 1, value: 0.08 },
  ]),
  twistRadPoints: Object.freeze([
    { t: 0, value: 0 },
    { t: 0.5, value: 0.08 },
    { t: 1, value: 0.18 },
  ]),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sub3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple = [0, 1, 0]): Vec3Tuple {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len <= EPS) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** 타원 가이드 케이지 표면 위 `(azimuthRad, elevationRad)` 좌표와 외향 법선을 샘플링한다. */
export function sampleGuideDomeSurface(
  cage: HairGuideDomeCage,
  azimuthRad: number,
  elevationRad: number,
): { readonly position: Vec3Tuple; readonly normal: Vec3Tuple } {
  const rx = Math.max(0.03, cage.radiiM[0] + cage.offsetM);
  const ry = Math.max(0.03, cage.radiiM[1] + cage.offsetM);
  const rz = Math.max(0.03, cage.radiiM[2] + cage.offsetM);
  const cosEl = Math.cos(elevationRad);
  const sinEl = Math.sin(elevationRad);
  const sinAz = Math.sin(azimuthRad);
  const cosAz = Math.cos(azimuthRad);

  const lx = cosEl * sinAz * rx;
  const ly = sinEl * ry;
  const lz = cosEl * cosAz * rz;

  const normal = normalize3([lx / (rx * rx), ly / (ry * ry), lz / (rz * rz)], [0, 1, 0]);
  return {
    position: [cage.centerM[0] + lx, cage.centerM[1] + ly, cage.centerM[2] + lz],
    normal,
  };
}

/** 임의 3D 입력 점을 가이드 케이지 타원면 위로 정확히 투영한다. */
export function projectPointOntoGuideDome(
  cage: HairGuideDomeCage,
  point: Vec3Tuple,
): Vec3Tuple {
  const rx = Math.max(0.03, cage.radiiM[0] + cage.offsetM);
  const ry = Math.max(0.03, cage.radiiM[1] + cage.offsetM);
  const rz = Math.max(0.03, cage.radiiM[2] + cage.offsetM);
  const nx = (point[0] - cage.centerM[0]) / rx;
  const ny = (point[1] - cage.centerM[1]) / ry;
  const nz = (point[2] - cage.centerM[2]) / rz;
  const radialLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (radialLen <= EPS) {
    return [cage.centerM[0], cage.centerM[1] + ry, cage.centerM[2]];
  }
  const inv = 1 / radialLen;
  return [
    cage.centerM[0] + nx * inv * rx,
    cage.centerM[1] + ny * inv * ry,
    cage.centerM[2] + nz * inv * rz,
  ];
}

/** 가이드 케이지 위도/경도 와이어프레임 정점 그리드를 생성한다. */
export function buildGuideDomeWireframeGrid(cage: HairGuideDomeCage): {
  readonly latPolylines: readonly (readonly Vec3Tuple[])[];
  readonly lonPolylines: readonly (readonly Vec3Tuple[])[];
} {
  const rings = Math.max(3, Math.floor(cage.latRings));
  const segs = Math.max(6, Math.floor(cage.lonSegments));
  const latPolylines: Vec3Tuple[][] = [];
  const lonPolylines: Vec3Tuple[][] = [];

  for (let r = 0; r < rings; r += 1) {
    const el = -Math.PI * 0.28 + (r / (rings - 1)) * (Math.PI * 0.75);
    const line: Vec3Tuple[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const az = (s / segs) * Math.PI * 2;
      line.push(sampleGuideDomeSurface(cage, az, el).position);
    }
    latPolylines.push(line);
  }

  for (let s = 0; s < segs; s += 1) {
    const az = (s / segs) * Math.PI * 2;
    const line: Vec3Tuple[] = [];
    for (let r = 0; r < rings; r += 1) {
      const el = -Math.PI * 0.28 + (r / (rings - 1)) * (Math.PI * 0.75);
      line.push(sampleGuideDomeSurface(cage, az, el).position);
    }
    lonPolylines.push(line);
  }

  return { latPolylines, lonPolylines };
}

/** 4종 헤어 3D 단면 프로파일의 정규화 2D 윤곽 `(uWidth, vThickness)`와 `UV0.u` 좌표를 반환한다. */
export function getHairCrossSectionContour(
  profile: HairCrossSectionProfile,
): { readonly points: readonly Vec2Tuple[]; readonly uCoords: readonly number[] } {
  if (profile === "diamond") {
    return {
      points: [
        [-0.5, 0],
        [0, 0.5],
        [0.5, 0],
        [0, -0.42],
        [-0.5, 0],
      ],
      uCoords: [0, 0.25, 0.5, 0.75, 1],
    };
  }
  if (profile === "ribbon") {
    return {
      points: [
        [-0.5, -0.06],
        [-0.18, 0.08],
        [0.18, 0.08],
        [0.5, -0.06],
        [0, -0.1],
        [-0.5, -0.06],
      ],
      uCoords: [0, 0.2, 0.4, 0.6, 0.8, 1],
    };
  }
  if (profile === "crescent") {
    return {
      points: [
        [-0.5, -0.2],
        [-0.25, 0.34],
        [0, 0.5],
        [0.25, 0.34],
        [0.5, -0.2],
        [0, 0.06],
        [-0.5, -0.2],
      ],
      uCoords: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
    };
  }
  // oval (8-segment smooth volume)
  const segs = 8;
  const points: Vec2Tuple[] = [];
  const uCoords: number[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const theta = (i / segs) * Math.PI * 2;
    points.push([Math.cos(theta) * 0.5, Math.sin(theta) * 0.42]);
    uCoords.push(i / segs);
  }
  return { points, uCoords };
}

/** 제어점 커브 그래프를 정렬·스무스스텝 보간하여 `t in [0, 1]` 값을 평가한다. */
export function evaluateCurveGraph(
  points: readonly HairCurveControlPoint[],
  t: number,
  fallbackValue = 1,
): number {
  if (points.length === 0) return fallbackValue;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const ct = clamp(t, 0, 1);
  if (ct <= sorted[0].t) return sorted[0].value;
  if (ct >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const p0 = sorted[i];
    const p1 = sorted[i + 1];
    if (ct >= p0.t && ct <= p1.t) {
      const span = Math.max(EPS, p1.t - p0.t);
      const u = clamp((ct - p0.t) / span, 0, 1);
      const smooth = u * u * (3 - 2 * u);
      return p0.value + (p1.value - p0.value) * smooth;
    }
  }
  return sorted[sorted.length - 1].value;
}

function resampleSpineCatmullRom(
  controlPoints: readonly Vec3Tuple[],
  segments: number,
): Vec3Tuple[] {
  if (controlPoints.length === 0) return [[0, 0, 0], [0, -0.1, 0]];
  if (controlPoints.length === 1) {
    const p = controlPoints[0];
    return [p, [p[0], p[1] - 0.1, p[2]]];
  }

  const out: Vec3Tuple[] = [];
  const n = controlPoints.length;
  for (let s = 0; s <= segments; s += 1) {
    const scaled = (s / segments) * (n - 1);
    const idx = Math.min(n - 2, Math.floor(scaled));
    const u = scaled - idx;
    const p0 = controlPoints[Math.max(0, idx - 1)];
    const p1 = controlPoints[idx];
    const p2 = controlPoints[Math.min(n - 1, idx + 1)];
    const p3 = controlPoints[Math.min(n - 1, idx + 2)];

    const u2 = u * u;
    const u3 = u2 * u;
    const catmull = (v0: number, v1: number, v2: number, v3: number) => 0.5 * (
      2 * v1
      + (-v0 + v2) * u
      + (2 * v0 - 5 * v1 + 4 * v2 - v3) * u2
      + (-v0 + 3 * v1 - 3 * v2 + v3) * u3
    );
    out.push([
      catmull(p0[0], p1[0], p2[0], p3[0]),
      catmull(p0[1], p1[1], p2[1], p3[1]),
      catmull(p0[2], p1[2], p2[2], p3[2]),
    ]);
  }
  return out;
}

/**
 * 단일 헤어 가닥의 3D 메시를 생성한다.
 * - Bishop 평행이동 프레임으로 단면 꼬임 방지
 * - 모든 링의 `UV0.v`가 `0 → 1`로 엄격 단조 증가함을 자체 검증
 */
export function generateGroomStrandMesh(
  spec: HairGuideStrandSpec,
  cage: HairGuideDomeCage = DEFAULT_HAIR_GUIDE_DOME_CAGE,
): GeneratedHairStrandMesh {
  const lengthSegments = Math.max(2, Math.floor(spec.lengthSegments));
  const spine = resampleSpineCatmullRom(spec.spinePoints, lengthSegments);
  const contour = getHairCrossSectionContour(spec.profile);
  const ringCount = spine.length;
  const ringVerts = contour.points.length;

  const vertexCount = ringCount * ringVerts;
  const quadCount = (ringCount - 1) * (ringVerts - 1);
  const triangleCount = quadCount * 2;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(triangleCount * 3);

  // 초기 Bishop 프레임: 케이지 중심에서 뿌리로 향하는 방사 법선을 기준 Normal로 설정
  let tangent = normalize3(sub3(spine[1], spine[0]), [0, -1, 0]);
  const radialOut = normalize3(sub3(spine[0], cage.centerM), [0, 0, 1]);
  let normal = normalize3(
    sub3(radialOut, [
      tangent[0] * dot3(radialOut, tangent),
      tangent[1] * dot3(radialOut, tangent),
      tangent[2] * dot3(radialOut, tangent),
    ]),
    Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0],
  );
  let binormal = normalize3(cross3(tangent, normal), [1, 0, 0]);

  let prevV = -1;
  let uvVStrictlyMonotonic = true;

  for (let r = 0; r < ringCount; r += 1) {
    const t = r / (ringCount - 1);
    if (t <= prevV) {
      uvVStrictlyMonotonic = false;
    }
    prevV = t;

    const prevP = spine[Math.max(0, r - 1)];
    const nextP = spine[Math.min(ringCount - 1, r + 1)];
    const nextTangent = normalize3(sub3(nextP, prevP), tangent);

    // Bishop 평행이동: 이전 normal을 새 tangent 직교 평면에 투영
    const proj = dot3(normal, nextTangent);
    normal = normalize3(
      [
        normal[0] - nextTangent[0] * proj,
        normal[1] - nextTangent[1] * proj,
        normal[2] - nextTangent[2] * proj,
      ],
      normal,
    );
    tangent = nextTangent;
    binormal = normalize3(cross3(tangent, normal), binormal);

    const width = Math.max(0.0005, spec.baseWidthM * evaluateCurveGraph(spec.curveGraph.widthPoints, t, 1));
    const thickness = Math.max(0.0004, spec.baseThicknessM * evaluateCurveGraph(spec.curveGraph.thicknessPoints, t, 1));
    const twistRad = evaluateCurveGraph(spec.curveGraph.twistRadPoints, t, 0);
    const cosTw = Math.cos(twistRad);
    const sinTw = Math.sin(twistRad);

    const twistedBinormal: Vec3Tuple = [
      binormal[0] * cosTw + normal[0] * sinTw,
      binormal[1] * cosTw + normal[1] * sinTw,
      binormal[2] * cosTw + normal[2] * sinTw,
    ];
    const twistedNormal: Vec3Tuple = [
      -binormal[0] * sinTw + normal[0] * cosTw,
      -binormal[1] * sinTw + normal[1] * cosTw,
      -binormal[2] * sinTw + normal[2] * cosTw,
    ];

    const center = spine[r];
    for (let c = 0; c < ringVerts; c += 1) {
      const [cx, cy] = contour.points[c];
      const offset: Vec3Tuple = [
        twistedBinormal[0] * (cx * width) + twistedNormal[0] * (cy * thickness),
        twistedBinormal[1] * (cx * width) + twistedNormal[1] * (cy * thickness),
        twistedBinormal[2] * (cx * width) + twistedNormal[2] * (cy * thickness),
      ];
      const worldP = add3(center, offset);
      const vertN = normalize3(offset, twistedNormal);

      const vIndex = r * ringVerts + c;
      positions[vIndex * 3] = worldP[0];
      positions[vIndex * 3 + 1] = worldP[1];
      positions[vIndex * 3 + 2] = worldP[2];
      normals[vIndex * 3] = vertN[0];
      normals[vIndex * 3 + 1] = vertN[1];
      normals[vIndex * 3 + 2] = vertN[2];
      uvs[vIndex * 2] = contour.uCoords[c];
      uvs[vIndex * 2 + 1] = t;
    }
  }

  let outIdx = 0;
  for (let r = 0; r < ringCount - 1; r += 1) {
    const rowA = r * ringVerts;
    const rowB = (r + 1) * ringVerts;
    for (let c = 0; c < ringVerts - 1; c += 1) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      indices[outIdx] = a;
      indices[outIdx + 1] = d;
      indices[outIdx + 2] = b;
      indices[outIdx + 3] = b;
      indices[outIdx + 4] = d;
      indices[outIdx + 5] = e;
      outIdx += 6;
    }
  }

  return {
    strandId: spec.id,
    profile: spec.profile,
    ringCount,
    ringVertexCount: ringVerts,
    vertexCount,
    triangleCount,
    positions,
    normals,
    uvs,
    indices,
    uvVStrictlyMonotonic,
  };
}
