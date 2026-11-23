/**
 * 3D 표면 페인팅용 클린 매니폴드 UV 메쉬 생성기, 무결성 감사기,
 * 2D UV 시트 순수 PNG 바이너리 베이크 인코더 및 원근 소프트웨어 래스터라이저.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type RgbaColor = readonly [number, number, number, number];
export type SurfacePaintMeshPresetId = "sphere-head" | "torso-armor" | "prop-box";

export interface UvMesh3d {
  readonly id: SurfacePaintMeshPresetId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly seamWrappedU: boolean;
}

export interface UvMeshIntegrityReport {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly weldedVertexCount: number;
  readonly weldedEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly inconsistentWindingEdgeCount: number;
  readonly degenerateTriangleCount: number;
  readonly outOfRangeUvCount: number;
  readonly invalidNormalCount: number;
  readonly isCleanManifold: boolean;
}

export interface BakedUvSheetPng {
  readonly pngBytes: Uint8Array;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly checksumHex: string;
}

export interface PerspectiveCameraConfig {
  readonly distance: number;
  readonly fovDeg: number;
}

export const DEFAULT_CAMERA_CONFIG: PerspectiveCameraConfig = { distance: 2.65, fovDeg: 42 };

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-8;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function wrapUnit(value: number): number {
  const m = value % 1;
  return m < 0 ? m + 1 : m;
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= EPS) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** 모델 로컬 좌표를 Yaw(Y축) → Pitch(X축) 순으로 월드 좌표계로 회전한다. */
export function rotateVec3ByYawPitch(v: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = yawDeg * DEG_TO_RAD;
  const pitch = pitchDeg * DEG_TO_RAD;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  return { x: x1, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
}

/** 월드 좌표 벡터를 메쉬 로컬 좌표계로 역회전(Pitch^-1 → Yaw^-1)한다. */
export function inverseRotateVec3ByYawPitch(v: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = yawDeg * DEG_TO_RAD;
  const pitch = pitchDeg * DEG_TO_RAD;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const y1 = v.y * cp + v.z * sp;
  const z1 = -v.y * sp + v.z * cp;
  return { x: v.x * cy - z1 * sy, y: y1, z: v.x * sy + z1 * cy };
}

/** 정규화 뷰포트 좌표(0..1, 좌상단 원점)로부터 원근 카메라 레이를 생성한다. */
export function createPerspectiveRayFromViewport(
  normX: number,
  normY: number,
  camera: PerspectiveCameraConfig = DEFAULT_CAMERA_CONFIG,
): { readonly origin: Vec3; readonly dir: Vec3 } {
  const tanHalf = Math.tan(camera.fovDeg * 0.5 * DEG_TO_RAD);
  const ndcX = clamp01(normX) * 2 - 1;
  const ndcY = 1 - clamp01(normY) * 2;
  return {
    origin: { x: 0, y: 0, z: camera.distance },
    dir: normalizeVec3({ x: ndcX * tanHalf, y: ndcY * tanHalf, z: -1 }),
  };
}

function quantizePositionKey(x: number, y: number, z: number): string {
  const qx = Math.round(x * 1e4);
  const qy = Math.round(y * 1e4);
  const qz = Math.round(z * 1e4);
  return `${qx === 0 ? 0 : qx},${qy === 0 ? 0 : qy},${qz === 0 ? 0 : qz}`;
}

/** 위치 병합 기반 면적 가중 스무스 법선을 계산해 UV 심 경계의 음영 단절을 없앤다. */
function computeWeldedSmoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const vertexCount = positions.length / 3;
  const keyByVertex: string[] = new Array(vertexCount);
  const accum = new Map<string, [number, number, number]>();

  for (let i = 0; i < vertexCount; i += 1) {
    const k = quantizePositionKey(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0);
    keyByVertex[i] = k;
    if (!accum.has(k)) accum.set(k, [0, 0, 0]);
  }

  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] ?? 0;
    const i1 = indices[t + 1] ?? 0;
    const i2 = indices[t + 2] ?? 0;
    const ax = positions[i0 * 3] ?? 0;
    const ay = positions[i0 * 3 + 1] ?? 0;
    const az = positions[i0 * 3 + 2] ?? 0;
    const e1x = (positions[i1 * 3] ?? 0) - ax;
    const e1y = (positions[i1 * 3 + 1] ?? 0) - ay;
    const e1z = (positions[i1 * 3 + 2] ?? 0) - az;
    const e2x = (positions[i2 * 3] ?? 0) - ax;
    const e2y = (positions[i2 * 3 + 1] ?? 0) - ay;
    const e2z = (positions[i2 * 3 + 2] ?? 0) - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    for (const vi of [i0, i1, i2]) {
      const acc = accum.get(keyByVertex[vi] ?? "");
      if (acc) {
        acc[0] += nx;
        acc[1] += ny;
        acc[2] += nz;
      }
    }
  }

  const normals = new Float32Array(positions.length);
  for (let i = 0; i < vertexCount; i += 1) {
    const acc = accum.get(keyByVertex[i] ?? "");
    const len = acc ? Math.hypot(acc[0], acc[1], acc[2]) : 0;
    if (acc && len > EPS) {
      normals[i * 3] = acc[0] / len;
      normals[i * 3 + 1] = acc[1] / len;
      normals[i * 3 + 2] = acc[2] / len;
    } else {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 1;
      normals[i * 3 + 2] = 0;
    }
  }
  return normals;
}

interface ClosedLoftRing {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly v: number;
  readonly frontBulge?: number;
}

/** 비퇴화 극점 팬과 닫힌 둘레 링으로 완전 수밀 매니폴드 회전 메쉬를 생성한다. */
function buildClosedLoftUvMesh(
  id: SurfacePaintMeshPresetId,
  nameKo: string,
  nameEn: string,
  radialSegments: number,
  topPoleY: number,
  topPoleV: number,
  bottomPoleY: number,
  bottomPoleV: number,
  rings: readonly ClosedLoftRing[],
): UvMesh3d {
  const segs = Math.max(8, Math.floor(radialSegments));
  const posList: number[] = [];
  const uvList: number[] = [];
  const idxList: number[] = [];

  const pushVertex = (x: number, y: number, z: number, u: number, v: number): number => {
    const index = posList.length / 3;
    posList.push(x, y, z);
    uvList.push(clamp01(u), clamp01(v));
    return index;
  };

  const ringStarts: number[] = [];
  for (const ring of rings) {
    ringStarts.push(posList.length / 3);
    const bulge = ring.frontBulge ?? 0;
    let firstX = 0;
    let firstY = ring.y;
    let firstZ = 0;

    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      if (i === segs) {
        pushVertex(firstX, firstY, firstZ, 1, ring.v);
        continue;
      }
      const theta = (u - 0.5) * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const frontFactor = cosT > 0 ? cosT * cosT : 0;
      const x = sinT * ring.rx;
      const z = cosT * (ring.rz + bulge * frontFactor);
      if (i === 0) {
        firstX = x;
        firstY = ring.y;
        firstZ = z;
      }
      pushVertex(x, ring.y, z, u, ring.v);
    }
  }

  const firstRingStart = ringStarts[0] ?? 0;
  for (let i = 0; i < segs; i += 1) {
    const poleIdx = pushVertex(0, topPoleY, 0, (i + 0.5) / segs, topPoleV);
    idxList.push(poleIdx, firstRingStart + i, firstRingStart + i + 1);
  }

  for (let r = 0; r < ringStarts.length - 1; r += 1) {
    const upper = ringStarts[r] ?? 0;
    const lower = ringStarts[r + 1] ?? 0;
    for (let i = 0; i < segs; i += 1) {
      const a = upper + i;
      const b = lower + i;
      const c = lower + i + 1;
      const d = upper + i + 1;
      idxList.push(a, b, c, a, c, d);
    }
  }

  const lastRingStart = ringStarts[ringStarts.length - 1] ?? 0;
  for (let i = 0; i < segs; i += 1) {
    const poleIdx = pushVertex(0, bottomPoleY, 0, (i + 0.5) / segs, bottomPoleV);
    idxList.push(poleIdx, lastRingStart + i + 1, lastRingStart + i);
  }

  const positions = new Float32Array(posList);
  const uvs = new Float32Array(uvList);
  const indices = new Uint32Array(idxList);
  const normals = computeWeldedSmoothNormals(positions, indices);

  return {
    id,
    nameKo,
    nameEn,
    positions,
    normals,
    uvs,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    seamWrappedU: true,
  };
}

/** 1. 클린 매니폴드 두상(UV 구형 헤드) 메쉬를 생성한다. */
export function buildUvSphereHeadMesh(lonSegments = 24, latSegments = 16): UvMesh3d {
  const lat = Math.max(6, Math.floor(latSegments));
  const rings: ClosedLoftRing[] = [];
  for (let j = 1; j < lat; j += 1) {
    const v = j / lat;
    const phi = v * Math.PI;
    const yNorm = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const jawTaper = yNorm < 0 ? 1 - 0.16 * yNorm * yNorm : 1;
    const depthTaper = yNorm < 0 ? 1 - 0.08 * -yNorm : 1;
    rings.push({
      y: yNorm * 0.78,
      rx: sinPhi * 0.62 * jawTaper,
      rz: sinPhi * 0.68 * depthTaper,
      v,
      frontBulge: sinPhi * 0.03,
    });
  }
  return buildClosedLoftUvMesh("sphere-head", "3D 두상 (UV 헤드)", "3D Head (UV Sphere)", lonSegments, 0.78, 0, -0.78, 1, rings);
}

/** 2. 클린 매니폴드 상체 아머(흉갑 토르소) 메쉬를 생성한다. */
export function buildUvTorsoArmorMesh(radialSegments = 24): UvMesh3d {
  const rings: readonly ClosedLoftRing[] = [
    { y: 0.68, rx: 0.28, rz: 0.23, v: 0.12, frontBulge: 0.01 },
    { y: 0.56, rx: 0.64, rz: 0.34, v: 0.22, frontBulge: 0.04 },
    { y: 0.36, rx: 0.72, rz: 0.42, v: 0.35, frontBulge: 0.09 },
    { y: 0.12, rx: 0.63, rz: 0.38, v: 0.49, frontBulge: 0.06 },
    { y: -0.18, rx: 0.48, rz: 0.31, v: 0.66, frontBulge: 0.02 },
    { y: -0.52, rx: 0.58, rz: 0.36, v: 0.82, frontBulge: 0.03 },
    { y: -0.70, rx: 0.44, rz: 0.29, v: 0.90, frontBulge: 0.01 },
  ];
  return buildClosedLoftUvMesh("torso-armor", "상체 아머 (흉갑)", "Torso Armor", radialSegments, 0.72, 0.02, -0.74, 0.98, rings);
}

interface BoxFaceSpec {
  readonly normal: Vec3;
  readonly right: Vec3;
  readonly down: Vec3;
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

const PROP_BOX_FACES: readonly BoxFaceSpec[] = [
  { normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, down: { x: 0, y: -1, z: 0 }, uMin: 0.02, uMax: 0.31, vMin: 0.02, vMax: 0.48 },
  { normal: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 }, down: { x: 0, y: -1, z: 0 }, uMin: 0.35, uMax: 0.65, vMin: 0.02, vMax: 0.48 },
  { normal: { x: 0, y: 0, z: -1 }, right: { x: -1, y: 0, z: 0 }, down: { x: 0, y: -1, z: 0 }, uMin: 0.69, uMax: 0.98, vMin: 0.02, vMax: 0.48 },
  { normal: { x: -1, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 }, down: { x: 0, y: -1, z: 0 }, uMin: 0.02, uMax: 0.31, vMin: 0.52, vMax: 0.98 },
  { normal: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 0, z: 1 }, uMin: 0.35, uMax: 0.65, vMin: 0.52, vMax: 0.98 },
  { normal: { x: 0, y: -1, z: 0 }, right: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 0, z: -1 }, uMin: 0.69, uMax: 0.98, vMin: 0.52, vMax: 0.98 },
];

/** 3. 클린 매니폴드 6면 아틀라스 소품 박스 메쉬를 생성한다. */
export function buildUvPropBoxMesh(subdivisions = 4): UvMesh3d {
  const sub = Math.max(1, Math.floor(subdivisions));
  const half = 0.62;
  const posList: number[] = [];
  const normList: number[] = [];
  const uvList: number[] = [];
  const idxList: number[] = [];

  for (const face of PROP_BOX_FACES) {
    const baseVertex = posList.length / 3;
    for (let ty = 0; ty <= sub; ty += 1) {
      const tv = ty / sub;
      const dy = (tv * 2 - 1) * half;
      for (let tx = 0; tx <= sub; tx += 1) {
        const tu = tx / sub;
        const dx = (tu * 2 - 1) * half;
        posList.push(
          face.normal.x * half + face.right.x * dx + face.down.x * dy,
          face.normal.y * half + face.right.y * dx + face.down.y * dy,
          face.normal.z * half + face.right.z * dx + face.down.z * dy,
        );
        normList.push(face.normal.x, face.normal.y, face.normal.z);
        uvList.push(face.uMin + (face.uMax - face.uMin) * tu, face.vMin + (face.vMax - face.vMin) * tv);
      }
    }
    const stride = sub + 1;
    for (let ty = 0; ty < sub; ty += 1) {
      for (let tx = 0; tx < sub; tx += 1) {
        const a = baseVertex + ty * stride + tx;
        const b = baseVertex + (ty + 1) * stride + tx;
        const c = baseVertex + (ty + 1) * stride + (tx + 1);
        const d = baseVertex + ty * stride + (tx + 1);
        idxList.push(a, b, c, a, c, d);
      }
    }
  }

  return {
    id: "prop-box",
    nameKo: "소품 박스 (6면 UV)",
    nameEn: "Prop Box (6-Face UV)",
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    uvs: new Float32Array(uvList),
    indices: new Uint32Array(idxList),
    vertexCount: posList.length / 3,
    triangleCount: idxList.length / 3,
    seamWrappedU: false,
  };
}

export function buildSurfacePaintMeshPreset(presetId: SurfacePaintMeshPresetId): UvMesh3d {
  if (presetId === "torso-armor") return buildUvTorsoArmorMesh();
  if (presetId === "prop-box") return buildUvPropBoxMesh();
  return buildUvSphereHeadMesh();
}

/** 위치 병합 기반 비매니폴드 에지·퇴화 삼각형·UV [0,1] 경계·법선 무결성을 감사한다. */
export function auditUvMeshIntegrity(mesh: UvMesh3d): UvMeshIntegrityReport {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;

  let outOfRangeUvCount = 0;
  let invalidNormalCount = 0;
  const weldedIdByVertex = new Int32Array(vertexCount);
  const posKeyToWeldedId = new Map<string, number>();

  for (let i = 0; i < vertexCount; i += 1) {
    const u = mesh.uvs[i * 2] ?? Number.NaN;
    const v = mesh.uvs[i * 2 + 1] ?? Number.NaN;
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) outOfRangeUvCount += 1;
    const nLen = Math.hypot(mesh.normals[i * 3] ?? 0, mesh.normals[i * 3 + 1] ?? 0, mesh.normals[i * 3 + 2] ?? 0);
    if (!Number.isFinite(nLen) || Math.abs(nLen - 1) > 1e-2) invalidNormalCount += 1;

    const key = quantizePositionKey(mesh.positions[i * 3] ?? 0, mesh.positions[i * 3 + 1] ?? 0, mesh.positions[i * 3 + 2] ?? 0);
    const existing = posKeyToWeldedId.get(key);
    if (existing !== undefined) {
      weldedIdByVertex[i] = existing;
    } else {
      const nextId = posKeyToWeldedId.size;
      posKeyToWeldedId.set(key, nextId);
      weldedIdByVertex[i] = nextId;
    }
  }

  let degenerateTriangleCount = 0;
  const edgeStats = new Map<string, { forward: number; backward: number }>();

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3] ?? 0;
    const i1 = mesh.indices[t * 3 + 1] ?? 0;
    const i2 = mesh.indices[t * 3 + 2] ?? 0;
    const w0 = weldedIdByVertex[i0] ?? -1;
    const w1 = weldedIdByVertex[i1] ?? -1;
    const w2 = weldedIdByVertex[i2] ?? -1;

    const e1x = (mesh.positions[i1 * 3] ?? 0) - (mesh.positions[i0 * 3] ?? 0);
    const e1y = (mesh.positions[i1 * 3 + 1] ?? 0) - (mesh.positions[i0 * 3 + 1] ?? 0);
    const e1z = (mesh.positions[i1 * 3 + 2] ?? 0) - (mesh.positions[i0 * 3 + 2] ?? 0);
    const e2x = (mesh.positions[i2 * 3] ?? 0) - (mesh.positions[i0 * 3] ?? 0);
    const e2y = (mesh.positions[i2 * 3 + 1] ?? 0) - (mesh.positions[i0 * 3 + 1] ?? 0);
    const e2z = (mesh.positions[i2 * 3 + 2] ?? 0) - (mesh.positions[i0 * 3 + 2] ?? 0);
    const area2 = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);

    if (w0 === w1 || w1 === w2 || w2 === w0 || !Number.isFinite(area2) || area2 <= 1e-8) {
      degenerateTriangleCount += 1;
      continue;
    }

    for (const [a, b] of [
      [w0, w1],
      [w1, w2],
      [w2, w0],
    ] as const) {
      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      let stat = edgeStats.get(edgeKey);
      if (!stat) {
        stat = { forward: 0, backward: 0 };
        edgeStats.set(edgeKey, stat);
      }
      if (a < b) stat.forward += 1;
      else stat.backward += 1;
    }
  }

  let nonManifoldEdgeCount = 0;
  let boundaryEdgeCount = 0;
  let inconsistentWindingEdgeCount = 0;

  for (const stat of edgeStats.values()) {
    const total = stat.forward + stat.backward;
    if (total > 2) nonManifoldEdgeCount += 1;
    else if (total === 1) boundaryEdgeCount += 1;
    else if (total === 2 && (stat.forward !== 1 || stat.backward !== 1)) inconsistentWindingEdgeCount += 1;
  }

  return {
    vertexCount,
    triangleCount,
    weldedVertexCount: posKeyToWeldedId.size,
    weldedEdgeCount: edgeStats.size,
    nonManifoldEdgeCount,
    boundaryEdgeCount,
    inconsistentWindingEdgeCount,
    degenerateTriangleCount,
    outOfRangeUvCount,
    invalidNormalCount,
    isCleanManifold:
      nonManifoldEdgeCount === 0 &&
      boundaryEdgeCount === 0 &&
      inconsistentWindingEdgeCount === 0 &&
      degenerateTriangleCount === 0 &&
      outOfRangeUvCount === 0 &&
      invalidNormalCount === 0,
  };
}

function drawLineRgba(rgba: Uint8ClampedArray, size: number, x0: number, y0: number, x1: number, y1: number, color: RgbaColor): void {
  const steps = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  const sa = color[3] / 255;
  for (let s = 0; s <= steps; s += 1) {
    const x = clamp(Math.round(x0 + ((x1 - x0) * s) / steps), 0, size - 1);
    const y = clamp(Math.round(y0 + ((y1 - y0) * s) / steps), 0, size - 1);
    const off = (y * size + x) * 4;
    rgba[off] = Math.round((rgba[off] ?? 0) * (1 - sa) + color[0] * sa);
    rgba[off + 1] = Math.round((rgba[off + 1] ?? 0) * (1 - sa) + color[1] * sa);
    rgba[off + 2] = Math.round((rgba[off + 2] ?? 0) * (1 - sa) + color[2] * sa);
    rgba[off + 3] = 255;
  }
}

/** 베이크된 2D UV 시트 위에 선택적으로 UV 와이어프레임 에지를 합성한다. */
export function renderUvWireframeOverlayRgba(baseRgba: Uint8ClampedArray, texSize: number, mesh: UvMesh3d): Uint8ClampedArray {
  const out = new Uint8ClampedArray(baseRgba);
  const wire: RgbaColor = [42, 64, 96, 92];
  const maxPx = texSize - 1;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t] ?? 0;
    const i1 = mesh.indices[t + 1] ?? 0;
    const i2 = mesh.indices[t + 2] ?? 0;
    const u0 = (mesh.uvs[i0 * 2] ?? 0) * maxPx;
    const v0 = (mesh.uvs[i0 * 2 + 1] ?? 0) * maxPx;
    const u1 = (mesh.uvs[i1 * 2] ?? 0) * maxPx;
    const v1 = (mesh.uvs[i1 * 2 + 1] ?? 0) * maxPx;
    const u2 = (mesh.uvs[i2 * 2] ?? 0) * maxPx;
    const v2 = (mesh.uvs[i2 * 2 + 1] ?? 0) * maxPx;
    drawLineRgba(out, texSize, u0, v0, u1, v1, wire);
    drawLineRgba(out, texSize, u1, v1, u2, v2, wire);
    drawLineRgba(out, texSize, u2, v2, u0, v0, wire);
  }
  return out;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = (CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32Bytes(bytes: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    s1 = (s1 + (bytes[i] ?? 0)) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32Bytes(out.subarray(4, 8 + data.length)), false);
  return out;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const triple = (b0 << 16) | ((has1 ? (bytes[i + 1] ?? 0) : 0) << 8) | (has2 ? (bytes[i + 2] ?? 0) : 0);
    parts.push(
      BASE64_CHARS[(triple >>> 18) & 63] ?? "A",
      BASE64_CHARS[(triple >>> 12) & 63] ?? "A",
      has1 ? (BASE64_CHARS[(triple >>> 6) & 63] ?? "A") : "=",
      has2 ? (BASE64_CHARS[triple & 63] ?? "A") : "=",
    );
  }
  return parts.join("");
}

/** 순수 브라우저 로컬 PNG 바이너리 인코더(RFC 2083 · zlib stored blocks)로 2D UV 시트 PNG를 생성한다. */
export function exportBakedUvSheetPng(
  compositedRgba: Uint8ClampedArray,
  texSize: number,
  options: { readonly meshForWireframe?: UvMesh3d } = {},
): BakedUvSheetPng {
  const size = Math.max(2, Math.floor(texSize));
  const sourceRgba = options.meshForWireframe
    ? renderUvWireframeOverlayRgba(compositedRgba, size, options.meshForWireframe)
    : compositedRgba;

  const rowStride = 1 + size * 4;
  const raw = new Uint8Array(rowStride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * rowStride] = 0;
    raw.set(sourceRgba.subarray(y * size * 4, (y + 1) * size * 4), y * rowStride + 1);
  }

  const maxBlock = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / maxBlock));
  const zlibData = new Uint8Array(2 + raw.length + blockCount * 5 + 4);
  zlibData[0] = 0x78;
  zlibData[1] = 0x01;
  let zPos = 2;

  for (let offset = 0; offset < raw.length; offset += maxBlock) {
    const chunkLen = Math.min(maxBlock, raw.length - offset);
    const nlen = ~chunkLen & 0xffff;
    zlibData[zPos] = offset + chunkLen >= raw.length ? 1 : 0;
    zlibData[zPos + 1] = chunkLen & 0xff;
    zlibData[zPos + 2] = (chunkLen >>> 8) & 0xff;
    zlibData[zPos + 3] = nlen & 0xff;
    zlibData[zPos + 4] = (nlen >>> 8) & 0xff;
    zPos += 5;
    zlibData.set(raw.subarray(offset, offset + chunkLen), zPos);
    zPos += chunkLen;
  }
  new DataView(zlibData.buffer).setUint32(zPos, adler32Bytes(raw), false);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size, false);
  ihdrView.setUint32(4, size, false);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    buildPngChunk("IHDR", ihdr),
    buildPngChunk("IDAT", zlibData),
    buildPngChunk("IEND", new Uint8Array(0)),
  ];
  const pngBytes = new Uint8Array(parts.reduce((acc, part) => acc + part.length, 0));
  let p = 0;
  for (const part of parts) {
    pngBytes.set(part, p);
    p += part.length;
  }

  return {
    pngBytes,
    dataUrl: `data:image/png;base64,${encodeBytesToBase64(pngBytes)}`,
    width: size,
    height: size,
    byteLength: pngBytes.length,
    checksumHex: crc32Bytes(pngBytes).toString(16).padStart(8, "0"),
  };
}

/** 합성된 4층 텍스처를 3D 메쉬에 매핑하고 3점 스튜디오 광원으로 원근 프리뷰를 소프트웨어 래스터라이징한다. */
export function rasterizeTexturedMeshPreview(
  mesh: UvMesh3d,
  compositedRgba: Uint8ClampedArray,
  texSize: number,
  viewportSize: number,
  yawDeg: number,
  pitchDeg: number,
  camera: PerspectiveCameraConfig = DEFAULT_CAMERA_CONFIG,
): Uint8ClampedArray {
  const vp = Math.max(32, Math.floor(viewportSize));
  const out = new Uint8ClampedArray(vp * vp * 4);
  const zBuf = new Float32Array(vp * vp);
  zBuf.fill(Number.POSITIVE_INFINITY);

  const tanHalf = Math.tan(camera.fovDeg * 0.5 * DEG_TO_RAD);
  const vCount = mesh.vertexCount;
  const projX = new Float32Array(vCount);
  const projY = new Float32Array(vCount);
  const projZ = new Float32Array(vCount);
  const worldNx = new Float32Array(vCount);
  const worldNy = new Float32Array(vCount);
  const worldNz = new Float32Array(vCount);

  for (let i = 0; i < vCount; i += 1) {
    const wp = rotateVec3ByYawPitch(
      { x: mesh.positions[i * 3] ?? 0, y: mesh.positions[i * 3 + 1] ?? 0, z: mesh.positions[i * 3 + 2] ?? 0 },
      yawDeg,
      pitchDeg,
    );
    const wn = rotateVec3ByYawPitch(
      { x: mesh.normals[i * 3] ?? 0, y: mesh.normals[i * 3 + 1] ?? 0, z: mesh.normals[i * 3 + 2] ?? 0 },
      yawDeg,
      pitchDeg,
    );
    const vz = Math.max(0.1, camera.distance - wp.z);
    projX[i] = ((wp.x / (vz * tanHalf)) * 0.5 + 0.5) * vp;
    projY[i] = (0.5 - (wp.y / (vz * tanHalf)) * 0.5) * vp;
    projZ[i] = vz;
    worldNx[i] = wn.x;
    worldNy[i] = wn.y;
    worldNz[i] = wn.z;
  }

  const keyLight = normalizeVec3({ x: -0.45, y: 0.62, z: 0.78 });
  const rimLight = normalizeVec3({ x: 0.72, y: 0.35, z: -0.45 });
  const maxTex = texSize - 1;

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t] ?? 0;
    const i1 = mesh.indices[t + 1] ?? 0;
    const i2 = mesh.indices[t + 2] ?? 0;

    const x0 = projX[i0] ?? 0;
    const y0 = projY[i0] ?? 0;
    const x1 = projX[i1] ?? 0;
    const y1 = projY[i1] ?? 0;
    const x2 = projX[i2] ?? 0;
    const y2 = projY[i2] ?? 0;

    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (area >= -1e-4) continue;
    const invArea = 1 / area;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(vp - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(vp - 1, Math.ceil(Math.max(y0, y1, y2)));

    const z0 = projZ[i0] ?? 1;
    const z1 = projZ[i1] ?? 1;
    const z2 = projZ[i2] ?? 1;
    const u0 = mesh.uvs[i0 * 2] ?? 0;
    const v0 = mesh.uvs[i0 * 2 + 1] ?? 0;
    const u1 = mesh.uvs[i1 * 2] ?? 0;
    const v1 = mesh.uvs[i1 * 2 + 1] ?? 0;
    const u2 = mesh.uvs[i2 * 2] ?? 0;
    const v2 = mesh.uvs[i2 * 2 + 1] ?? 0;

    for (let py = minY; py <= maxY; py += 1) {
      const sy = py + 0.5;
      for (let px = minX; px <= maxX; px += 1) {
        const sx = px + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (y1 - sy) * (x2 - sx)) * invArea;
        const w1 = ((x2 - sx) * (y0 - sy) - (y2 - sy) * (x0 - sx)) * invArea;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;

        const depth = w0 * z0 + w1 * z1 + w2 * z2;
        const pixIdx = py * vp + px;
        if (depth >= (zBuf[pixIdx] ?? Number.POSITIVE_INFINITY)) continue;
        zBuf[pixIdx] = depth;

        const tx = clamp(Math.round(clamp01(w0 * u0 + w1 * u1 + w2 * u2) * maxTex), 0, maxTex);
        const ty = clamp(Math.round(clamp01(w0 * v0 + w1 * v1 + w2 * v2) * maxTex), 0, maxTex);
        const tOff = (ty * texSize + tx) * 4;

        const nx = w0 * (worldNx[i0] ?? 0) + w1 * (worldNx[i1] ?? 0) + w2 * (worldNx[i2] ?? 0);
        const ny = w0 * (worldNy[i0] ?? 0) + w1 * (worldNy[i1] ?? 0) + w2 * (worldNy[i2] ?? 0);
        const nz = w0 * (worldNz[i0] ?? 0) + w1 * (worldNz[i1] ?? 0) + w2 * (worldNz[i2] ?? 0);
        const nLen = Math.hypot(nx, ny, nz) || 1;
        const unx = nx / nLen;
        const uny = ny / nLen;
        const unz = nz / nLen;

        const key = Math.max(0, unx * keyLight.x + uny * keyLight.y + unz * keyLight.z);
        const rim = Math.max(0, unx * rimLight.x + uny * rimLight.y + unz * rimLight.z) * (1 - Math.max(0, unz));
        const lit = 0.44 + 0.56 * key + 0.24 * rim;

        const outOff = pixIdx * 4;
        out[outOff] = clamp(Math.round((compositedRgba[tOff] ?? 210) * lit), 0, 255);
        out[outOff + 1] = clamp(Math.round((compositedRgba[tOff + 1] ?? 210) * lit), 0, 255);
        out[outOff + 2] = clamp(Math.round((compositedRgba[tOff + 2] ?? 210) * lit + rim * 18), 0, 255);
        out[outOff + 3] = 255;
      }
    }
  }
  return out;
}
