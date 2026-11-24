/**
 * 3D 실루엣·크리즈 벡터 잉크 투영용 절차적 다양체(Manifold) 3D 테스트 메시 프리셋.
 * - 인물 흉상(Hero Bust), 아치 배경(Architectural Arch), 검 소품(Katana Prop)
 * - 모든 프리셋은 정확한 외향 법선(outward normal)과 엣지 인접 테이블을 갖춘 수밀(watertight) 다양체 삼각 메시다.
 */

import type {
  IndexedTriangleMesh,
  MeshBounds,
  MeshEdgeRecord,
  MeshManifoldStats,
  MeshPresetId,
  TriangleIndices,
  Vec3,
} from "./types";

const EPSILON = 1e-8;

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= EPSILON) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function rotatePointEuler(p: Vec3, rotXRad: number, rotYRad: number, rotZRad: number): Vec3 {
  let { x, y, z } = p;
  if (rotXRad !== 0) {
    const cx = Math.cos(rotXRad);
    const sx = Math.sin(rotXRad);
    const ny = y * cx - z * sx;
    const nz = y * sx + z * cx;
    y = ny;
    z = nz;
  }
  if (rotYRad !== 0) {
    const cy = Math.cos(rotYRad);
    const sy = Math.sin(rotYRad);
    const nx = x * cy + z * sy;
    const nz = -x * sy + z * cy;
    x = nx;
    z = nz;
  }
  if (rotZRad !== 0) {
    const cz = Math.cos(rotZRad);
    const sz = Math.sin(rotZRad);
    const nx = x * cz - y * sz;
    const ny = x * sz + y * cz;
    x = nx;
    y = ny;
  }
  return { x, y, z };
}

interface MutableMeshBuilder {
  readonly vertices: Vec3[];
  readonly triangles: TriangleIndices[];
}

function createBuilder(): MutableMeshBuilder {
  return { vertices: [], triangles: [] };
}

/** 닫힌 셸의 부호 있는 부피가 양수가 되도록 와인딩(CCW 외향)을 보정해 추가한다. */
function commitClosedShell(
  builder: MutableMeshBuilder,
  localVertices: readonly Vec3[],
  localTriangles: readonly TriangleIndices[],
): void {
  let signedVolume6 = 0;
  for (const [i0, i1, i2] of localTriangles) {
    const a = localVertices[i0];
    const b = localVertices[i1];
    const c = localVertices[i2];
    if (!a || !b || !c) continue;
    signedVolume6 += dot3(a, cross3(b, c));
  }
  const flip = signedVolume6 < 0;
  const baseOffset = builder.vertices.length;
  for (const v of localVertices) {
    builder.vertices.push(v);
  }
  for (const [i0, i1, i2] of localTriangles) {
    if (flip) {
      builder.triangles.push([baseOffset + i0, baseOffset + i2, baseOffset + i1]);
    } else {
      builder.triangles.push([baseOffset + i0, baseOffset + i1, baseOffset + i2]);
    }
  }
}

/** 8정점·12삼각형 수밀 직육면체(또는 테이퍼 프리즘) 셸 추가. */
function appendTaperedBox(
  builder: MutableMeshBuilder,
  options: {
    readonly center: Vec3;
    readonly bottomHalf: readonly [number, number];
    readonly topHalf: readonly [number, number];
    readonly halfHeight: number;
    readonly rotRad?: readonly [number, number, number];
  },
): void {
  const [bx, bz] = options.bottomHalf;
  const [tx, tz] = options.topHalf;
  const hy = options.halfHeight;
  const [rx, ry, rz] = options.rotRad ?? [0, 0, 0];

  const raw: Vec3[] = [
    vec3(-bx, -hy, -bz),
    vec3(bx, -hy, -bz),
    vec3(bx, -hy, bz),
    vec3(-bx, -hy, bz),
    vec3(-tx, hy, -tz),
    vec3(tx, hy, -tz),
    vec3(tx, hy, tz),
    vec3(-tx, hy, tz),
  ];

  const verts = raw.map((pt) => add3(rotatePointEuler(pt, rx, ry, rz), options.center));
  const tris: TriangleIndices[] = [
    // 하단 (-Y)
    [0, 1, 2],
    [0, 2, 3],
    // 상단 (+Y)
    [4, 6, 5],
    [4, 7, 6],
    // 앞면 (+Z)
    [3, 2, 6],
    [3, 6, 7],
    // 뒷면 (-Z)
    [1, 0, 4],
    [1, 4, 5],
    // 우측 (+X)
    [2, 1, 5],
    [2, 5, 6],
    // 좌측 (-X)
    [0, 3, 7],
    [0, 7, 4],
  ];
  commitClosedShell(builder, verts, tris);
}

/** 동일 세그먼트 수의 닫힌 링 시퀀스를 양 끝 극점으로 봉합해 수밀 로프트 셸을 생성한다. */
function appendClosedLoft(
  builder: MutableMeshBuilder,
  rings: readonly (readonly Vec3[])[],
  options?: { readonly bottomCapOffset?: Vec3; readonly topCapOffset?: Vec3 },
): void {
  if (rings.length < 2) return;
  const firstRing = rings[0];
  const lastRing = rings[rings.length - 1];
  if (!firstRing || !lastRing || firstRing.length < 3) return;
  const segCount = firstRing.length;

  const centroidOf = (ring: readonly Vec3[]): Vec3 => {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
      sz += p.z;
    }
    const inv = 1 / ring.length;
    return { x: sx * inv, y: sy * inv, z: sz * inv };
  };

  const verts: Vec3[] = [];
  const tris: TriangleIndices[] = [];

  const bottomPole = add3(centroidOf(firstRing), options?.bottomCapOffset ?? vec3(0, 0, 0));
  const bottomIdx = 0;
  verts.push(bottomPole);

  const ringBaseOffset = 1;
  for (const ring of rings) {
    for (let s = 0; s < segCount; s += 1) {
      const pt = ring[s];
      if (pt) verts.push(pt);
    }
  }

  const topPole = add3(centroidOf(lastRing), options?.topCapOffset ?? vec3(0, 0, 0));
  const topIdx = verts.length;
  verts.push(topPole);

  const ringVertex = (r: number, s: number): number => ringBaseOffset + r * segCount + (s % segCount);

  // 하단 캡
  for (let s = 0; s < segCount; s += 1) {
    const next = (s + 1) % segCount;
    tris.push([bottomIdx, ringVertex(0, next), ringVertex(0, s)]);
  }

  // 측면 스트립
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let s = 0; s < segCount; s += 1) {
      const next = (s + 1) % segCount;
      const a = ringVertex(r, s);
      const b = ringVertex(r, next);
      const c = ringVertex(r + 1, next);
      const d = ringVertex(r + 1, s);
      tris.push([a, b, c]);
      tris.push([a, c, d]);
    }
  }

  // 상단 캡
  const lastRingIdx = rings.length - 1;
  for (let s = 0; s < segCount; s += 1) {
    const next = (s + 1) % segCount;
    tris.push([topIdx, ringVertex(lastRingIdx, s), ringVertex(lastRingIdx, next)]);
  }

  commitClosedShell(builder, verts, tris);
}

interface EdgeAccumulator {
  readonly v0: number;
  readonly v1: number;
  readonly faces: number[];
}

/** 인덱싱된 삼각 메시의 법선·중심·엣지 인접 테이블·다양체 통계를 계산한다. */
export function buildIndexedTriangleMesh(spec: {
  readonly id: MeshPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultCamera: IndexedTriangleMesh["defaultCamera"];
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly TriangleIndices[];
}): IndexedTriangleMesh {
  const faceNormals: Vec3[] = [];
  const faceCentroids: Vec3[] = [];

  for (const [i0, i1, i2] of spec.triangles) {
    const a = spec.vertices[i0];
    const b = spec.vertices[i1];
    const c = spec.vertices[i2];
    if (!a || !b || !c) {
      faceNormals.push(vec3(0, 1, 0));
      faceCentroids.push(vec3(0, 0, 0));
      continue;
    }
    const n = normalize3(cross3(sub3(b, a), sub3(c, a)));
    faceNormals.push(n);
    faceCentroids.push(scale3(add3(add3(a, b), c), 1 / 3));
  }

  const edgeMap = new Map<string, EdgeAccumulator>();
  const registerEdge = (u: number, v: number, faceIndex: number): void => {
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const key = `${lo}:${hi}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.faces.push(faceIndex);
    } else {
      edgeMap.set(key, { v0: lo, v1: hi, faces: [faceIndex] });
    }
  };

  for (let f = 0; f < spec.triangles.length; f += 1) {
    const tri = spec.triangles[f];
    if (!tri) continue;
    registerEdge(tri[0], tri[1], f);
    registerEdge(tri[1], tri[2], f);
    registerEdge(tri[2], tri[0], f);
  }

  const edges: MeshEdgeRecord[] = [];
  let nonManifoldEdgeCount = 0;
  let boundaryEdgeCount = 0;

  for (const [edgeKey, acc] of edgeMap.entries()) {
    const faceA = acc.faces[0] ?? 0;
    const faceB = acc.faces.length >= 2 ? (acc.faces[1] ?? null) : null;
    if (acc.faces.length === 1) {
      boundaryEdgeCount += 1;
    } else if (acc.faces.length > 2) {
      nonManifoldEdgeCount += 1;
    }

    const nA = faceNormals[faceA] ?? vec3(0, 1, 0);
    let dihedralAngleDeg = 180;
    let averageNormal = nA;

    if (faceB !== null) {
      const nB = faceNormals[faceB] ?? vec3(0, 1, 0);
      const clampedDot = Math.max(-1, Math.min(1, dot3(nA, nB)));
      dihedralAngleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
      averageNormal = normalize3(add3(nA, nB));
    }

    edges.push({
      edgeKey,
      v0: acc.v0,
      v1: acc.v1,
      faceA,
      faceB,
      dihedralAngleDeg,
      averageNormal,
    });
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const v of spec.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  const center = vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
  let maxRadiusSq = 0;
  for (const v of spec.vertices) {
    const d = sub3(v, center);
    const rSq = dot3(d, d);
    if (rSq > maxRadiusSq) maxRadiusSq = rSq;
  }

  const bounds: MeshBounds = {
    min: vec3(minX, minY, minZ),
    max: vec3(maxX, maxY, maxZ),
    center,
    radius: Math.sqrt(maxRadiusSq),
  };

  const manifoldStats: MeshManifoldStats = {
    vertexCount: spec.vertices.length,
    triangleCount: spec.triangles.length,
    edgeCount: edges.length,
    nonManifoldEdgeCount,
    boundaryEdgeCount,
    isWatertightManifold: nonManifoldEdgeCount === 0 && boundaryEdgeCount === 0 && edges.length > 0,
  };

  return {
    id: spec.id,
    labelKo: spec.labelKo,
    labelEn: spec.labelEn,
    descriptionKo: spec.descriptionKo,
    descriptionEn: spec.descriptionEn,
    defaultCamera: spec.defaultCamera,
    vertices: spec.vertices,
    triangles: spec.triangles,
    faceNormals,
    faceCentroids,
    edges,
    bounds,
    manifoldStats,
  };
}

/** ① 인물 흉상(Hero Bust) — 턱선·코 능선·하이칼라 깃·앞머리 가닥 크리즈가 살아 있는 웹툰 캐릭터 흉상. */
export function createHeroBustMesh(): IndexedTriangleMesh {
  const builder = createBuilder();

  // 1) 상반신·어깨·하이칼라 깃(16각 로프트)
  const torsoSegs = 16;
  const torsoSlices: readonly {
    readonly y: number;
    readonly rx: number;
    readonly rz: number;
    readonly collarFlare?: number;
  }[] = [
    { y: -0.78, rx: 0.42, rz: 0.28 },
    { y: -0.68, rx: 0.46, rz: 0.30 },
    { y: -0.44, rx: 0.66, rz: 0.33 },
    { y: -0.24, rx: 0.72, rz: 0.34 },
    { y: -0.14, rx: 0.56, rz: 0.30 },
    { y: -0.05, rx: 0.34, rz: 0.28, collarFlare: 0.08 },
    { y: 0.09, rx: 0.31, rz: 0.27, collarFlare: 0.10 },
  ];

  const torsoRings: Vec3[][] = torsoSlices.map((slice) => {
    const ring: Vec3[] = [];
    for (let s = 0; s < torsoSegs; s += 1) {
      const angle = (s / torsoSegs) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const collarLift = slice.collarFlare ? (sinA < 0 ? slice.collarFlare : -slice.collarFlare * 0.45) : 0;
      const chestSlope = slice.y > -0.5 && slice.y < -0.1 && sinA > 0.3 ? 0.05 : 0;
      ring.push(vec3(cosA * slice.rx, slice.y + collarLift, sinA * (slice.rz + chestSlope)));
    }
    return ring;
  });
  appendClosedLoft(builder, torsoRings, { bottomCapOffset: vec3(0, -0.02, 0), topCapOffset: vec3(0, -0.04, 0) });

  // 2) 목 & 조각된 두상(웹툰 턱선·광대·코 능선 포함 16각 로프트)
  const headSegs = 16;
  const headSlices: readonly {
    readonly y: number;
    readonly rx: number;
    readonly rz: number;
    readonly zShift: number;
    readonly jawPinch: number;
    readonly noseBump: number;
  }[] = [
    { y: 0.02, rx: 0.16, rz: 0.16, zShift: -0.01, jawPinch: 0, noseBump: 0 },
    { y: 0.16, rx: 0.15, rz: 0.15, zShift: 0.0, jawPinch: 0, noseBump: 0 },
    { y: 0.23, rx: 0.18, rz: 0.22, zShift: 0.04, jawPinch: 0.24, noseBump: 0 },
    { y: 0.34, rx: 0.28, rz: 0.30, zShift: 0.03, jawPinch: 0.14, noseBump: 0.02 },
    { y: 0.48, rx: 0.33, rz: 0.35, zShift: 0.02, jawPinch: 0.04, noseBump: 0.07 },
    { y: 0.62, rx: 0.35, rz: 0.37, zShift: 0.01, jawPinch: 0, noseBump: 0.04 },
    { y: 0.76, rx: 0.34, rz: 0.37, zShift: -0.01, jawPinch: 0, noseBump: 0 },
    { y: 0.88, rx: 0.27, rz: 0.30, zShift: -0.02, jawPinch: 0, noseBump: 0 },
  ];

  const headRings: Vec3[][] = headSlices.map((slice) => {
    const ring: Vec3[] = [];
    for (let s = 0; s < headSegs; s += 1) {
      // angle = 0 -> +X, PI/2 -> +Z(정면)
      const angle = (s / headSegs) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const frontWeight = Math.max(0, sinA);
      const noseRidge = slice.noseBump * Math.pow(frontWeight, 6);
      const chinTaper = slice.jawPinch > 0 && sinA > 0 ? 1 - slice.jawPinch * (1 - frontWeight) : 1;
      const x = cosA * slice.rx * chinTaper;
      const z = sinA * slice.rz + slice.zShift + noseRidge;
      ring.push(vec3(x, slice.y, z));
    }
    return ring;
  });
  appendClosedLoft(builder, headRings, { topCapOffset: vec3(0, 0.05, -0.01) });

  // 3) 웹툰 헤어 앞머리·측면 가닥 3개 (날카로운 크리즈 엣지 형성)
  const hairLocks: readonly {
    readonly base: Vec3;
    readonly mid: Vec3;
    readonly tip: Vec3;
    readonly width: number;
    readonly depth: number;
  }[] = [
    {
      base: vec3(0.02, 0.87, 0.16),
      mid: vec3(-0.07, 0.73, 0.39),
      tip: vec3(-0.14, 0.52, 0.40),
      width: 0.11,
      depth: 0.055,
    },
    {
      base: vec3(0.15, 0.83, 0.12),
      mid: vec3(0.24, 0.65, 0.31),
      tip: vec3(0.28, 0.42, 0.27),
      width: 0.095,
      depth: 0.05,
    },
    {
      base: vec3(-0.18, 0.82, 0.06),
      mid: vec3(-0.31, 0.62, 0.22),
      tip: vec3(-0.33, 0.36, 0.18),
      width: 0.1,
      depth: 0.052,
    },
  ];

  for (const lock of hairLocks) {
    const makeHairRing = (center: Vec3, scaleW: number, scaleD: number): Vec3[] => [
      vec3(center.x - lock.width * scaleW, center.y, center.z),
      vec3(center.x, center.y, center.z + lock.depth * scaleD),
      vec3(center.x + lock.width * scaleW, center.y, center.z),
      vec3(center.x, center.y, center.z - lock.depth * scaleD),
    ];
    appendClosedLoft(
      builder,
      [
        makeHairRing(lock.base, 1.0, 1.0),
        makeHairRing(lock.mid, 0.82, 0.85),
        makeHairRing(lock.tip, 0.24, 0.28),
      ],
      { topCapOffset: vec3(0, -0.05, 0.01) },
    );
  }

  return buildIndexedTriangleMesh({
    id: "hero-bust",
    labelKo: "인물 흉상",
    labelEn: "Hero Bust",
    descriptionKo: "턱선·코 능선·하이칼라 깃과 앞머리 볼륨 크리즈를 갖춘 웹툰 캐릭터 흉상 메시",
    descriptionEn: "Stylized webtoon hero bust with jawline, nose bridge, high collar, and faceted hair locks.",
    defaultCamera: {
      yawDeg: 24,
      pitchDeg: 6,
      distance: 3.15,
      fovDeg: 38,
      target: vec3(0, 0.08, 0),
    },
    vertices: builder.vertices,
    triangles: builder.triangles,
  });
}

/** ② 아치 배경(Architectural Arch) — 기둥·주두·아치 보우소아·키스톤·코니스로 구성된 건축 투시 메시. */
export function createArchitecturalArchMesh(): IndexedTriangleMesh {
  const builder = createBuilder();

  // 하단 2단 석재 기단
  appendTaperedBox(builder, {
    center: vec3(0, -0.92, 0),
    bottomHalf: [1.14, 0.44],
    topHalf: [1.10, 0.42],
    halfHeight: 0.08,
  });
  appendTaperedBox(builder, {
    center: vec3(0, -0.78, 0),
    bottomHalf: [1.02, 0.36],
    topHalf: [1.00, 0.35],
    halfHeight: 0.06,
  });

  // 좌·우 기둥(주춧돌 + 8각 기둥 몸통 + 주두)
  for (const side of [-1, 1] as const) {
    const cx = side * 0.72;
    appendTaperedBox(builder, {
      center: vec3(cx, -0.64, 0),
      bottomHalf: [0.24, 0.26],
      topHalf: [0.20, 0.22],
      halfHeight: 0.08,
    });

    const shaftRings: Vec3[][] = [];
    const shaftY = [-0.56, 0.22];
    for (const y of shaftY) {
      const ring: Vec3[] = [];
      for (let s = 0; s < 8; s += 1) {
        const a = (s / 8) * Math.PI * 2 + Math.PI / 8;
        ring.push(vec3(cx + Math.cos(a) * 0.17, y, Math.sin(a) * 0.17));
      }
      shaftRings.push(ring);
    }
    appendClosedLoft(builder, shaftRings);

    appendTaperedBox(builder, {
      center: vec3(cx, 0.30, 0),
      bottomHalf: [0.20, 0.21],
      topHalf: [0.25, 0.26],
      halfHeight: 0.08,
    });
  }

  // 아치 본체(반원형 스위프 로프트, 6각 면취 단면)
  const archCenterY = 0.36;
  const archRadius = 0.72;
  const archSteps = 12;
  const archHalfThickness = 0.13;
  const archHalfDepth = 0.18;
  const archBevel = 0.035;

  const archRings: Vec3[][] = [];
  for (let i = 0; i <= archSteps; i += 1) {
    const theta = Math.PI - (i / archSteps) * Math.PI; // PI(좌) -> 0(우)
    const dirX = Math.cos(theta);
    const dirY = Math.sin(theta);
    const ringCenter = vec3(dirX * archRadius, archCenterY + dirY * archRadius, 0);

    // 반지름 방향(dirX, dirY)과 깊이 방향(Z)으로 6각 면취 프로파일 생성
    const localProfile: readonly [number, number][] = [
      [-archHalfThickness, -(archHalfDepth - archBevel)],
      [-archHalfThickness + archBevel, -archHalfDepth],
      [archHalfThickness - archBevel, -archHalfDepth],
      [archHalfThickness, -(archHalfDepth - archBevel)],
      [archHalfThickness, archHalfDepth - archBevel],
      [archHalfThickness - archBevel, archHalfDepth],
      [-archHalfThickness + archBevel, archHalfDepth],
      [-archHalfThickness, archHalfDepth - archBevel],
    ];
    const ring: Vec3[] = localProfile.map(([radialOff, zOff]) =>
      vec3(ringCenter.x + dirX * radialOff, ringCenter.y + dirY * radialOff, zOff),
    );
    archRings.push(ring);
  }
  appendClosedLoft(builder, archRings);

  // 아치 정상 키스톤 블록
  appendTaperedBox(builder, {
    center: vec3(0, archCenterY + archRadius + 0.02, 0),
    bottomHalf: [0.12, 0.22],
    topHalf: [0.18, 0.24],
    halfHeight: 0.17,
  });

  // 상단 엔태블러처·코니스 처마
  appendTaperedBox(builder, {
    center: vec3(0, 1.24, 0),
    bottomHalf: [1.04, 0.25],
    topHalf: [1.14, 0.30],
    halfHeight: 0.08,
  });

  return buildIndexedTriangleMesh({
    id: "architectural-arch",
    labelKo: "아치 배경",
    labelEn: "Architectural Arch",
    descriptionKo: "팔각 석주·면취 아치 보우소아·키스톤·코니스로 구성한 웹툰 건축 배경 메시",
    descriptionEn: "Classical stone archway with octagonal columns, beveled arch sweep, keystone, and cornice.",
    defaultCamera: {
      yawDeg: -26,
      pitchDeg: 9,
      distance: 4.15,
      fovDeg: 40,
      target: vec3(0, 0.14, 0),
    },
    vertices: builder.vertices,
    triangles: builder.triangles,
  });
}

/** ③ 검 소품(Katana Prop) — 시노기 능선과 휘어짐(Sori)·츠바·츠카가 뚜렷한 일본도 소품 메시. */
export function createKatanaPropMesh(): IndexedTriangleMesh {
  const builder = createBuilder();

  const tiltX = 0.08;
  const tiltY = 0.18;
  const tiltZ = -0.62;
  const transformKatana = (p: Vec3): Vec3 => rotatePointEuler(p, tiltX, tiltY, tiltZ);

  // 1) 휘어진 검신(Nagasa) — 시노기(Shinogi) 6각 단면으로 칼등·능선·날 크리즈 형성
  const bladeRings: Vec3[][] = [];
  const bladeStations = 11;
  for (let i = 0; i <= bladeStations; i += 1) {
    const u = i / bladeStations;
    const y = -0.14 + u * 1.48; // 츠바 바로 위부터 칼끝까지
    const soriX = -0.14 * u * u; // 자연스러운 칼 휘어짐
    const tipTaper = u > 0.82 ? 1 - ((u - 0.82) / 0.18) * 0.78 : 1 - u * 0.16;
    const chord = 0.095 * tipTaper;
    const thick = 0.026 * (1 - u * 0.45);
    const shinogiPos = -chord * 0.18;

    const profile: Vec3[] = [
      vec3(soriX - chord * 0.52, y, 0), // 칼등(Mune) 중앙 능선
      vec3(soriX + shinogiPos, y, thick), // 전면 시노기 능선
      vec3(soriX + chord * 0.56, y, thick * 0.12), // 칼날(Ha)
      vec3(soriX + shinogiPos, y, -thick), // 후면 시노기 능선
    ];
    bladeRings.push(profile.map(transformKatana));
  }
  appendClosedLoft(builder, bladeRings, {
    topCapOffset: transformKatana(vec3(-0.02, 0.09, 0)),
  });

  // 2) 하바키(Habaki) 칼목 고정구
  const habakiRings: Vec3[][] = [-0.21, -0.12].map((y) => {
    const profile: Vec3[] = [
      vec3(-0.062, y, -0.036),
      vec3(0.064, y, -0.032),
      vec3(0.064, y, 0.032),
      vec3(-0.062, y, 0.036),
    ];
    return profile.map(transformKatana);
  });
  appendClosedLoft(builder, habakiRings);

  // 3) 츠바(Tsuba) 팔각 면취 코등이
  const tsubaSegs = 8;
  const tsubaSlices: readonly { readonly y: number; readonly rx: number; readonly rz: number }[] = [
    { y: -0.255, rx: 0.14, rz: 0.11 },
    { y: -0.24, rx: 0.175, rz: 0.14 },
    { y: -0.22, rx: 0.175, rz: 0.14 },
    { y: -0.205, rx: 0.14, rz: 0.11 },
  ];
  const tsubaRings: Vec3[][] = tsubaSlices.map((slice) => {
    const ring: Vec3[] = [];
    for (let s = 0; s < tsubaSegs; s += 1) {
      const a = (s / tsubaSegs) * Math.PI * 2 + Math.PI / 8;
      ring.push(transformKatana(vec3(Math.cos(a) * slice.rx, slice.y, Math.sin(a) * slice.rz)));
    }
    return ring;
  });
  appendClosedLoft(builder, tsubaRings);

  // 4) 츠카(Tsuka) 손잡이 & 카시라(Kashira) 끝장식 — 츠카이토 감김 리듬 굴곡
  const handleRings: Vec3[][] = [];
  const handleSteps = 9;
  for (let i = 0; i <= handleSteps; i += 1) {
    const u = i / handleSteps;
    const y = -0.84 + u * 0.59;
    const curveX = -0.035 * (1 - u) * (1 - u);
    const wrapRipple = i > 0 && i < handleSteps ? (i % 2 === 0 ? 1.07 : 0.94) : 1.04;
    const rx = 0.056 * wrapRipple;
    const rz = 0.038 * wrapRipple;
    const ring: Vec3[] = [];
    for (let s = 0; s < 6; s += 1) {
      const a = (s / 6) * Math.PI * 2;
      ring.push(transformKatana(vec3(curveX + Math.cos(a) * rx, y, Math.sin(a) * rz)));
    }
    handleRings.push(ring);
  }
  appendClosedLoft(builder, handleRings, {
    bottomCapOffset: transformKatana(vec3(0, -0.025, 0)),
  });

  return buildIndexedTriangleMesh({
    id: "katana-prop",
    labelKo: "검 소품",
    labelEn: "Katana Prop",
    descriptionKo: "시노기 칼등 능선·휘어진 칼날·팔각 츠바·손잡이 감김 크리즈를 갖춘 액션 소품 메시",
    descriptionEn: "Curved katana with central shinogi ridge, beveled octagonal tsuba guard, and wrapped hilt.",
    defaultCamera: {
      yawDeg: 18,
      pitchDeg: 10,
      distance: 3.15,
      fovDeg: 38,
      target: vec3(0.12, 0.14, 0),
    },
    vertices: builder.vertices,
    triangles: builder.triangles,
  });
}

export const MESH_PRESET_IDS: readonly MeshPresetId[] = [
  "hero-bust",
  "architectural-arch",
  "katana-prop",
];

/** 프리셋 ID로 절차적 3D 다양체 메시를 생성한다. */
export function createMeshPreset(id: MeshPresetId): IndexedTriangleMesh {
  switch (id) {
    case "hero-bust":
      return createHeroBustMesh();
    case "architectural-arch":
      return createArchitecturalArchMesh();
    case "katana-prop":
      return createKatanaPropMesh();
  }
}
