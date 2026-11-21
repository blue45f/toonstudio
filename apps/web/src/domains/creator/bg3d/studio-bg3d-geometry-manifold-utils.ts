/**
 * studio-bg3d-geometry-manifold-utils.ts
 *
 * 3D 배경·캐릭터·고급 모델링 연산기가 공유하는 순수 Three.js 지오메트리·매니폴드·OKLCH·GPU 해제 유틸리티.
 * - 원시 HEX 없이 OKLCH(L, C, H) → Linear sRGB `THREE.Color` 변환
 * - 공간 정점 용접 기반 실측 매니폴드 무결성 검사(비다양체 0, 퇴화 면 0, 바닥 Y=0 접지, 체적 m³)
 * - `try/finally` 보장 GPU 지오메트리·머티리얼·텍스처 해제
 */

import * as THREE from "three";

export interface OklchColorSpec {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface GeometryManifoldReport {
  readonly rawVertexCount: number;
  readonly uniqueVertexCount: number;
  readonly triangleCount: number;
  readonly edgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly degenerateTriangleCount: number;
  readonly isManifold: boolean;
  readonly isWatertightSolid: boolean;
  readonly signedVolumeCubicMeters: number;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly sizeMeters: readonly [number, number, number];
  readonly isGroundedAtY0: boolean;
}

export interface SceneManifoldReport {
  readonly meshCount: number;
  readonly pointsCount: number;
  readonly totalVertices: number;
  readonly totalTriangles: number;
  readonly nonManifoldEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly degenerateTriangleCount: number;
  readonly isManifold: boolean;
  readonly isWatertight: boolean;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly sizeMeters: readonly [number, number, number];
  readonly isGroundedAtY0: boolean;
}

export interface WeldedIndexedMesh {
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly triangles: readonly (readonly [number, number, number])[];
}

export interface DisposedGpuResourceCounts {
  readonly disposedGeometries: number;
  readonly disposedMaterials: number;
  readonly disposedTextures: number;
}

const DEGENERATE_AREA_SQ_EPSILON = 1e-18;
const GROUND_TOLERANCE_METERS = 2e-3;
const WELD_PRECISION_DEFAULT = 1e4;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round4(value: number): number {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * OKLCH(L: 0~1, C: 0~0.4, H: 0~360도)를 Linear sRGB [r, g, b]로 변환한다.
 * Björn Ottosson OKLab 역행렬을 그대로 적용해 하드코딩 HEX 없이 지각 균일 색상을 생성한다.
 */
export function oklchToLinearRgb(l: number, c: number, hDeg: number): readonly [number, number, number] {
  const safeL = clamp01(l);
  const safeC = Math.max(0, Number.isFinite(c) ? c : 0);
  const hRad = ((Number.isFinite(hDeg) ? hDeg : 0) * Math.PI) / 180;
  const a = safeC * Math.cos(hRad);
  const b = safeC * Math.sin(hRad);

  const lPrime = safeL + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = safeL - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = safeL - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return Object.freeze([clamp01(r), clamp01(g), clamp01(bl)] as const);
}

/**
 * OKLCH 색상 스펙으로부터 `THREE.Color` 인스턴스를 생성한다.
 */
export function createOklchThreeColor(spec: OklchColorSpec): THREE.Color {
  const [r, g, b] = oklchToLinearRgb(spec.l, spec.c, spec.h);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

/**
 * CSS/SVG 출력용 OKLCH 문자열을 생성한다.
 */
export function oklchToCssString(spec: OklchColorSpec, alpha?: number): string {
  const l = round4(clamp01(spec.l));
  const c = round4(Math.max(0, Number.isFinite(spec.c) ? spec.c : 0));
  const h = round4(((Number.isFinite(spec.h) ? spec.h : 0) % 360 + 360) % 360);
  if (alpha !== undefined && Number.isFinite(alpha) && alpha < 1) {
    return `oklch(${l} ${c} ${h} / ${round4(clamp01(alpha))})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

/**
 * `THREE.Color`의 Linear RGB를 근사 OKLCH 문자열로 직렬화한다(SVG 패스 출력 등 원시 HEX 방지용).
 */
export function threeColorToOklchCss(color: THREE.Color, alpha = 1): string {
  const r = clamp01(color.r);
  const g = clamp01(color.g);
  const b = clamp01(color.b);

  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const okC = Math.hypot(okA, okB);
  const okH = okC < 1e-6 ? 0 : (Math.atan2(okB, okA) * 180) / Math.PI;
  return oklchToCssString({ l: okL, c: okC, h: okH }, alpha);
}

/**
 * `THREE.BufferGeometry`의 분할 노멀/UV 정점을 공간 좌표 기준으로 용접해
 * 위상 연산과 매니폴드 검증에 사용할 인덱싱 메시를 추출한다.
 */
export function weldBufferGeometryVertices(
  geometry: THREE.BufferGeometry,
  precision = WELD_PRECISION_DEFAULT,
): WeldedIndexedMesh {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr || posAttr.count === 0) {
    return Object.freeze({ vertices: Object.freeze([]), triangles: Object.freeze([]) });
  }

  const keyToIndex = new Map<string, number>();
  const vertices: Array<readonly [number, number, number]> = [];
  const rawToWelded = new Int32Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i += 1) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      rawToWelded[i] = -1;
      continue;
    }
    const qx = Math.round(x * precision);
    const qy = Math.round(y * precision);
    const qz = Math.round(z * precision);
    const key = `${qx}:${qy}:${qz}`;
    let idx = keyToIndex.get(key);
    if (idx === undefined) {
      idx = vertices.length;
      keyToIndex.set(key, idx);
      vertices.push(Object.freeze([x, y, z] as const));
    }
    rawToWelded[i] = idx;
  }

  const indexAttr = geometry.getIndex();
  const triTotal = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
  const triangles: Array<readonly [number, number, number]> = [];

  for (let t = 0; t < triTotal; t += 1) {
    const r0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const r1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const r2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    const a = rawToWelded[r0] ?? -1;
    const b = rawToWelded[r1] ?? -1;
    const c = rawToWelded[r2] ?? -1;
    triangles.push(Object.freeze([a, b, c] as const));
  }

  return Object.freeze({
    vertices: Object.freeze(vertices),
    triangles: Object.freeze(triangles),
  });
}

/**
 * 정점·삼각형 배열로부터 법선·바운딩박스가 계산된 `THREE.BufferGeometry`를 생성한다.
 */
export function buildBufferGeometryFromIndexedMesh(
  vertices: readonly (readonly [number, number, number])[],
  triangles: readonly (readonly [number, number, number])[],
  options: { readonly computeSmoothNormals?: boolean } = {},
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const computeSmooth = options.computeSmoothNormals ?? true;

  if (computeSmooth) {
    const positions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i += 1) {
      const v = vertices[i]!;
      positions[i * 3] = v[0];
      positions[i * 3 + 1] = v[1];
      positions[i * 3 + 2] = v[2];
    }
    const indices = new Uint32Array(triangles.length * 3);
    for (let t = 0; t < triangles.length; t += 1) {
      const tri = triangles[t]!;
      indices[t * 3] = tri[0];
      indices[t * 3 + 1] = tri[1];
      indices[t * 3 + 2] = tri[2];
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  } else {
    const positions = new Float32Array(triangles.length * 9);
    for (let t = 0; t < triangles.length; t += 1) {
      const [i0, i1, i2] = triangles[t]!;
      const v0 = vertices[i0]!;
      const v1 = vertices[i1]!;
      const v2 = vertices[i2]!;
      const offset = t * 9;
      positions[offset] = v0[0];
      positions[offset + 1] = v0[1];
      positions[offset + 2] = v0[2];
      positions[offset + 3] = v1[0];
      positions[offset + 4] = v1[1];
      positions[offset + 5] = v1[2];
      positions[offset + 6] = v2[0];
      positions[offset + 7] = v2[1];
      positions[offset + 8] = v2[2];
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 단일 `THREE.BufferGeometry`의 매니폴드 무결성·퇴화 면·바닥 접지·체적을 실측 검증한다.
 */
export function validateBufferGeometryManifold(
  geometry: THREE.BufferGeometry,
  precision = WELD_PRECISION_DEFAULT,
): GeometryManifoldReport {
  const posAttr = geometry.getAttribute("position");
  const rawVertexCount = posAttr ? posAttr.count : 0;
  const welded = weldBufferGeometryVertices(geometry, precision);

  let degenerateTriangleCount = 0;
  let signedVolumeSix = 0;
  const undirectedCounts = new Map<string, number>();
  const directedCounts = new Map<string, number>();

  for (const [a, b, c] of welded.triangles) {
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || c === a) {
      degenerateTriangleCount += 1;
      continue;
    }
    const va = welded.vertices[a]!;
    const vb = welded.vertices[b]!;
    const vc = welded.vertices[c]!;

    const abx = vb[0] - va[0];
    const aby = vb[1] - va[1];
    const abz = vb[2] - va[2];
    const acx = vc[0] - va[0];
    const acy = vc[1] - va[1];
    const acz = vc[2] - va[2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const areaSq4 = cx * cx + cy * cy + cz * cz;
    if (!Number.isFinite(areaSq4) || areaSq4 <= DEGENERATE_AREA_SQ_EPSILON) {
      degenerateTriangleCount += 1;
      continue;
    }

    const crossBCx = vb[1] * vc[2] - vb[2] * vc[1];
    const crossBCy = vb[2] * vc[0] - vb[0] * vc[2];
    const crossBCz = vb[0] * vc[1] - vb[1] * vc[0];
    signedVolumeSix += va[0] * crossBCx + va[1] * crossBCy + va[2] * crossBCz;

    const pairs: readonly (readonly [number, number])[] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [u, v] of pairs) {
      const uKey = u < v ? `${u}:${v}` : `${v}:${u}`;
      undirectedCounts.set(uKey, (undirectedCounts.get(uKey) ?? 0) + 1);
      const dKey = `${u}->${v}`;
      directedCounts.set(dKey, (directedCounts.get(dKey) ?? 0) + 1);
    }
  }

  let nonManifoldEdgeCount = 0;
  let boundaryEdgeCount = 0;
  for (const count of undirectedCounts.values()) {
    if (count > 2) nonManifoldEdgeCount += 1;
    else if (count === 1) boundaryEdgeCount += 1;
  }
  for (const count of directedCounts.values()) {
    if (count > 1) nonManifoldEdgeCount += 1;
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const minVec: readonly [number, number, number] = box && !box.isEmpty()
    ? [round4(box.min.x), round4(box.min.y), round4(box.min.z)]
    : [0, 0, 0];
  const maxVec: readonly [number, number, number] = box && !box.isEmpty()
    ? [round4(box.max.x), round4(box.max.y), round4(box.max.z)]
    : [0, 0, 0];
  const sizeVec: readonly [number, number, number] = [
    round4(Math.max(0, maxVec[0] - minVec[0])),
    round4(Math.max(0, maxVec[1] - minVec[1])),
    round4(Math.max(0, maxVec[2] - minVec[2])),
  ];

  const validTriangles = welded.triangles.length - degenerateTriangleCount;
  const isManifold = validTriangles > 0 && nonManifoldEdgeCount === 0 && degenerateTriangleCount === 0;
  const isWatertightSolid = isManifold && boundaryEdgeCount === 0;

  return Object.freeze({
    rawVertexCount,
    uniqueVertexCount: welded.vertices.length,
    triangleCount: welded.triangles.length,
    edgeCount: undirectedCounts.size,
    nonManifoldEdgeCount,
    boundaryEdgeCount,
    degenerateTriangleCount,
    isManifold,
    isWatertightSolid,
    signedVolumeCubicMeters: round4(Math.abs(signedVolumeSix) / 6),
    boundsMin: Object.freeze(minVec),
    boundsMax: Object.freeze(maxVec),
    sizeMeters: Object.freeze(sizeVec),
    isGroundedAtY0: Math.abs(minVec[1]) <= GROUND_TOLERANCE_METERS,
  });
}

/**
 * `THREE.Object3D` 트리 전체의 매니폴드 무결성과 바닥(Y=0) 접지 여부를 합산 검증한다.
 */
export function validateObject3DManifoldAndGrounding(root: THREE.Object3D): SceneManifoldReport {
  root.updateMatrixWorld(true);
  let meshCount = 0;
  let pointsCount = 0;
  let totalVertices = 0;
  let totalTriangles = 0;
  let nonManifoldEdgeCount = 0;
  let boundaryEdgeCount = 0;
  let degenerateTriangleCount = 0;
  const meshBounds = new THREE.Box3();
  const childBox = new THREE.Box3();
  let hasMeshBounds = false;

  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.geometry instanceof THREE.BufferGeometry) {
      meshCount += 1;
      const report = validateBufferGeometryManifold(node.geometry);
      totalVertices += report.uniqueVertexCount;
      totalTriangles += report.triangleCount;
      nonManifoldEdgeCount += report.nonManifoldEdgeCount;
      boundaryEdgeCount += report.boundaryEdgeCount;
      degenerateTriangleCount += report.degenerateTriangleCount;

      childBox.setFromObject(node);
      if (!childBox.isEmpty()) {
        if (!hasMeshBounds) {
          meshBounds.copy(childBox);
          hasMeshBounds = true;
        } else {
          meshBounds.union(childBox);
        }
      }
    } else if (node instanceof THREE.Points && node.geometry instanceof THREE.BufferGeometry) {
      const pos = node.geometry.getAttribute("position");
      pointsCount += pos ? pos.count : 0;
    }
  });

  const boundsMin: readonly [number, number, number] = hasMeshBounds
    ? [round4(meshBounds.min.x), round4(meshBounds.min.y), round4(meshBounds.min.z)]
    : [0, 0, 0];
  const boundsMax: readonly [number, number, number] = hasMeshBounds
    ? [round4(meshBounds.max.x), round4(meshBounds.max.y), round4(meshBounds.max.z)]
    : [0, 0, 0];
  const sizeMeters: readonly [number, number, number] = [
    round4(Math.max(0, boundsMax[0] - boundsMin[0])),
    round4(Math.max(0, boundsMax[1] - boundsMin[1])),
    round4(Math.max(0, boundsMax[2] - boundsMin[2])),
  ];

  const isManifold = meshCount > 0 && nonManifoldEdgeCount === 0 && degenerateTriangleCount === 0;
  const isWatertight = isManifold && boundaryEdgeCount === 0;

  return Object.freeze({
    meshCount,
    pointsCount,
    totalVertices,
    totalTriangles,
    nonManifoldEdgeCount,
    boundaryEdgeCount,
    degenerateTriangleCount,
    isManifold,
    isWatertight,
    boundsMin: Object.freeze(boundsMin),
    boundsMax: Object.freeze(boundsMax),
    sizeMeters: Object.freeze(sizeMeters),
    isGroundedAtY0: hasMeshBounds && Math.abs(boundsMin[1]) <= GROUND_TOLERANCE_METERS,
  });
}

/**
 * 지오메트리의 바닥 최솟값을 Y=0에 정확히 맞춘다.
 */
export function groundBufferGeometryToY0(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? 0;
  if (!Number.isFinite(minY) || Math.abs(minY) <= 1e-6) return 0;
  const deltaY = -minY;
  geometry.translate(0, deltaY, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return round4(deltaY);
}

/**
 * `THREE.Object3D` 그룹의 월드 바운딩 최솟값을 지정 바닥 높이(`floorY`, 기본 0m)에 정확히 접지시킨다.
 */
export function groundObject3DToFloorY(object: THREE.Object3D, floorY = 0): number {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty() || !Number.isFinite(box.min.y)) return 0;
  const deltaY = floorY - box.min.y;
  object.position.y += deltaY;
  object.updateMatrixWorld(true);
  return round4(deltaY);
}

function collectMaterialTextures(material: THREE.Material, out: Set<THREE.Texture>): void {
  const candidates = material as unknown as Record<string, unknown>;
  for (const value of Object.values(candidates)) {
    if (value instanceof THREE.Texture) {
      out.add(value);
    }
  }
}

/**
 * `THREE.Object3D` 하위 모든 지오메트리·머티리얼·텍스처를 `try/finally`로 안전 해제한다.
 */
export function disposeObject3DResources(root: THREE.Object3D | null | undefined): DisposedGpuResourceCounts {
  if (!root) {
    return Object.freeze({ disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0 });
  }
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  let disposedTextures = 0;
  let disposedMaterials = 0;
  let disposedGeometries = 0;

  try {
    root.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) {
        if (node.geometry instanceof THREE.BufferGeometry) {
          geometries.add(node.geometry);
        }
        const mat = node.material;
        if (Array.isArray(mat)) {
          for (const item of mat) {
            if (item instanceof THREE.Material) {
              materials.add(item);
              collectMaterialTextures(item, textures);
            }
          }
        } else if (mat instanceof THREE.Material) {
          materials.add(mat);
          collectMaterialTextures(mat, textures);
        }
      }
    });
  } finally {
    try {
      for (const texture of textures) {
        texture.dispose();
        disposedTextures += 1;
      }
    } finally {
      try {
        for (const material of materials) {
          material.dispose();
          disposedMaterials += 1;
        }
      } finally {
        for (const geometry of geometries) {
          geometry.dispose();
          disposedGeometries += 1;
        }
      }
    }
    geometries.clear();
    materials.clear();
    textures.clear();
  }

  return Object.freeze({
    disposedGeometries,
    disposedMaterials,
    disposedTextures,
  });
}

/**
 * 단순 2D 다각형(CCW 권장)을 귀 자르기(Ear-Clipping)로 삼각분할해 정점 인덱스 삼각형 목록을 반환한다.
 */
export function triangulatePolygon2DEarClip(
  points: readonly (readonly [number, number])[],
): readonly (readonly [number, number, number])[] {
  const n = points.length;
  if (n < 3) return Object.freeze([]);
  if (n === 3) return Object.freeze([Object.freeze([0, 1, 2] as const)]);

  let signedArea2 = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    signedArea2 += a[0] * b[1] - b[0] * a[1];
  }
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) indices.push(signedArea2 >= 0 ? i : n - 1 - i);

  const cross2 = (
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
  ): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  const pointInTri = (
    p: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
  ): boolean => {
    const c1 = cross2(a, b, p);
    const c2 = cross2(b, c, p);
    const c3 = cross2(c, a, p);
    return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
  };

  const result: Array<readonly [number, number, number]> = [];
  let guard = n * n + 16;

  while (indices.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    const len = indices.length;
    for (let i = 0; i < len; i += 1) {
      const iPrev = indices[(i - 1 + len) % len]!;
      const iCurr = indices[i]!;
      const iNext = indices[(i + 1) % len]!;
      const pPrev = points[iPrev]!;
      const pCurr = points[iCurr]!;
      const pNext = points[iNext]!;
      if (cross2(pPrev, pCurr, pNext) <= 1e-10) continue;

      let containsOther = false;
      for (let j = 0; j < len; j += 1) {
        const idx = indices[j]!;
        if (idx === iPrev || idx === iCurr || idx === iNext) continue;
        if (pointInTri(points[idx]!, pPrev, pCurr, pNext)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      result.push(Object.freeze([iPrev, iCurr, iNext] as const));
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }

  if (indices.length === 3) {
    result.push(Object.freeze([indices[0]!, indices[1]!, indices[2]!] as const));
  } else if (indices.length > 3) {
    // 비볼록 퇴화 경계 폴백: 팬 분할
    for (let i = 1; i < indices.length - 1; i += 1) {
      result.push(Object.freeze([indices[0]!, indices[i]!, indices[i + 1]!] as const));
    }
  }

  return signedArea2 >= 0
    ? Object.freeze(result)
    : Object.freeze(result.map(([a, b, c]) => Object.freeze([a, c, b] as const)));
}

/**
 * Möller–Trumbore 레이-삼각형 교차 패리티 검사로 3D 점이 닫힌 메시 내부에 있는지 판정한다.
 */
export function isPointInsideWeldedMesh(
  point: readonly [number, number, number],
  mesh: WeldedIndexedMesh,
): boolean {
  const dx = 0.917311;
  const dy = 0.271937;
  const dz = 0.291183;
  const px = point[0];
  const py = point[1];
  const pz = point[2];
  let hits = 0;

  for (const [i0, i1, i2] of mesh.triangles) {
    if (i0 < 0 || i1 < 0 || i2 < 0) continue;
    const v0 = mesh.vertices[i0]!;
    const v1 = mesh.vertices[i1]!;
    const v2 = mesh.vertices[i2]!;

    const e1x = v1[0] - v0[0];
    const e1y = v1[1] - v0[1];
    const e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0];
    const e2y = v2[1] - v0[1];
    const e2z = v2[2] - v0[2];

    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < 1e-10) continue;

    const f = 1 / a;
    const sx = px - v0[0];
    const sy = py - v0[1];
    const sz = pz - v0[2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;

    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = f * (dx * qx + dy * qy + dz * qz);
    if (v < 0 || u + v > 1) continue;

    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    if (t > 1e-7) hits += 1;
  }
  return (hits & 1) === 1;
}
