/**
 * ZBrush IMM 3분할 커브 키트배싱 & Sculpt Face Set(PolyGroups) 격리 엔진 (클린룸 구현).
 *
 * - Face Sets / PolyGroups: 면 단위 정수 ID(Int32Array), 결정적 OKLCH 파스텔 팔레트 토큰,
 *   브러시 페인트, 연결 셸 자동 구획, 법선 이면각 구획, 격리/스컬프트 마스크/재질 분리
 * - IMM Tri-Part Curve Brush: Start/Mid/End 3파츠 메시 키트를 Catmull-Rom +
 *   Parallel Transport(Bishop) 프레임으로 꼬임 없이 배치(표면 스냅 + 반경 테이퍼 + 용접)
 */

export const HYBRID_IMM_POLYGROUPS_SCHEMA_VERSION = 1 as const;

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface IndexedTriMesh { readonly positions: Float32Array; readonly indices: Uint32Array; }
export interface OklchColorToken { readonly l: number; readonly c: number; readonly h: number; }

export interface FaceSetState {
  readonly faceCount: number;
  readonly groupIds: Int32Array;
  readonly hiddenGroups: Set<number>;
  nextGroupId: number;
}

export interface ImmMeshPart {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ImmTriPartKit {
  readonly id: string; readonly name: string;
  readonly startCap: ImmMeshPart; readonly midTile: ImmMeshPart; readonly endCap: ImmMeshPart;
}

export interface ImmCurvePlacementOptions {
  readonly controlPoints: readonly Vec3[];
  readonly surfaceNormals?: readonly Vec3[];
  readonly snapTargetMesh?: IndexedTriMesh;
  readonly radiusScale?: number;
  readonly taperCurve?: (t: number) => number;
  readonly weldTolerance?: number;
  readonly repeatCount?: number;
}

export interface ImmGeneratedMeshResult {
  readonly mesh: IndexedTriMesh;
  readonly faceSetState: FaceSetState;
  readonly totalArcLength: number;
  readonly midRepeatCount: number;
  readonly weldedVertexCount: number;
  readonly frameCount: number;
}

interface CurveFrame {
  readonly position: Vec3; readonly tangent: Vec3; readonly normal: Vec3; readonly binormal: Vec3;
  readonly arcLength: number;
}

const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const vDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vCross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const vLen = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const vNormalize = (a: Vec3, fb: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 => {
  const len = vLen(a);
  return len > 1e-8 ? { x: a.x / len, y: a.y / len, z: a.z / len } : fb;
};

/** Face Set ID에 대해 결정적인 OKLCH 파스텔 오버레이 색상 토큰을 생성한다. */
export function getFaceSetOklchColor(groupId: number): OklchColorToken {
  const id = Math.max(1, Math.floor(Math.abs(groupId)));
  const hue = (id * 137.50776405) % 360;
  const lightness = 0.74 + ((id % 3) - 1) * 0.04;
  return { l: Number(lightness.toFixed(3)), c: 0.115, h: Number(hue.toFixed(2)) };
}

export function createFaceSetState(faceCount: number): FaceSetState {
  const safeCount = Math.max(0, Math.floor(faceCount));
  const groupIds = new Int32Array(safeCount).fill(1);
  return { faceCount: safeCount, groupIds, hiddenGroups: new Set<number>(), nextGroupId: 2 };
}

export function paintFaceSet(state: FaceSetState, faceIndices: readonly number[], groupId?: number): number {
  const targetId = groupId !== undefined && groupId >= 1 ? Math.floor(groupId) : state.nextGroupId;
  if (targetId >= state.nextGroupId) state.nextGroupId = targetId + 1;
  for (let i = 0; i < faceIndices.length; i += 1) {
    const fi = faceIndices[i]!;
    if (fi >= 0 && fi < state.faceCount) state.groupIds[fi] = targetId;
  }
  return targetId;
}

function buildFaceAdjacency(mesh: IndexedTriMesh): number[][] {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const adj: number[][] = Array.from({ length: faceCount }, () => []);
  const edgeToFaces = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = mesh.indices[f * 3]!; const i1 = mesh.indices[f * 3 + 1]!; const i2 = mesh.indices[f * 3 + 2]!;
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let list = edgeToFaces.get(key);
      if (!list) { list = []; edgeToFaces.set(key, list); }
      for (let k = 0; k < list.length; k += 1) {
        const other = list[k]!;
        adj[f]!.push(other);
        adj[other]!.push(f);
      }
      list.push(f);
    }
  }
  return adj;
}

function computeFaceNormals(mesh: IndexedTriMesh): Vec3[] {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const normals: Vec3[] = new Array(faceCount);
  const p = mesh.positions;
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = mesh.indices[f * 3]! * 3; const i1 = mesh.indices[f * 3 + 1]! * 3; const i2 = mesh.indices[f * 3 + 2]! * 3;
    const a: Vec3 = { x: p[i0]!, y: p[i0 + 1]!, z: p[i0 + 2]! };
    const b: Vec3 = { x: p[i1]!, y: p[i1 + 1]!, z: p[i1 + 2]! };
    const c: Vec3 = { x: p[i2]!, y: p[i2 + 1]!, z: p[i2 + 2]! };
    normals[f] = vNormalize(vCross(vSub(b, a), vSub(c, a)));
  }
  return normals;
}

/** 연결 셸별 자동 Face Set 구획(Auto Groups). */
export function autoFaceSetsByConnectivity(mesh: IndexedTriMesh): FaceSetState {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const state = createFaceSetState(faceCount);
  const adj = buildFaceAdjacency(mesh);
  const visited = new Uint8Array(faceCount);
  let currentGroup = 0;
  for (let start = 0; start < faceCount; start += 1) {
    if (visited[start] === 1) continue;
    currentGroup += 1;
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const f = stack.pop()!;
      state.groupIds[f] = currentGroup;
      for (const n of adj[f]!) {
        if (visited[n] === 0) { visited[n] = 1; stack.push(n); }
      }
    }
  }
  state.nextGroupId = currentGroup + 1;
  return state;
}

/** 인접 면 법선 이면각 임계값 기준 자동 Face Set 구획(Auto Groups by Angle). */
export function autoFaceSetsByNormalAngle(mesh: IndexedTriMesh, angleThresholdDeg = 35): FaceSetState {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const state = createFaceSetState(faceCount);
  const adj = buildFaceAdjacency(mesh);
  const normals = computeFaceNormals(mesh);
  const minDot = Math.cos((Math.max(1, Math.min(179, angleThresholdDeg)) * Math.PI) / 180);
  const visited = new Uint8Array(faceCount);
  let currentGroup = 0;
  for (let start = 0; start < faceCount; start += 1) {
    if (visited[start] === 1) continue;
    currentGroup += 1;
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const f = stack.pop()!;
      state.groupIds[f] = currentGroup;
      const nf = normals[f]!;
      for (const n of adj[f]!) {
        if (visited[n] === 0 && vDot(nf, normals[n]!) >= minDot) { visited[n] = 1; stack.push(n); }
      }
    }
  }
  state.nextGroupId = currentGroup + 1;
  return state;
}

export function isolateFaceSet(state: FaceSetState, targetGroupId: number): number {
  state.hiddenGroups.clear();
  for (let i = 0; i < state.faceCount; i += 1) {
    const gid = state.groupIds[i]!;
    if (gid !== targetGroupId) state.hiddenGroups.add(gid);
  }
  return state.hiddenGroups.size;
}

export function showAllFaceSets(state: FaceSetState): void { state.hiddenGroups.clear(); }

export function buildSculptMaskFromFaceSet(mesh: IndexedTriMesh, state: FaceSetState, activeGroupId: number): Float32Array {
  const mask = new Float32Array(Math.floor(mesh.positions.length / 3)).fill(1);
  for (let f = 0; f < state.faceCount; f += 1) {
    if (state.groupIds[f] !== activeGroupId) continue;
    mask[mesh.indices[f * 3]!] = 0;
    mask[mesh.indices[f * 3 + 1]!] = 0;
    mask[mesh.indices[f * 3 + 2]!] = 0;
  }
  return mask;
}

export function splitMeshByFaceSets(mesh: IndexedTriMesh, state: FaceSetState): Map<number, IndexedTriMesh> {
  const facesByGroup = new Map<number, number[]>();
  for (let f = 0; f < state.faceCount; f += 1) {
    const gid = state.groupIds[f]!;
    let list = facesByGroup.get(gid);
    if (!list) { list = []; facesByGroup.set(gid, list); }
    list.push(f);
  }
  const out = new Map<number, IndexedTriMesh>();
  for (const [gid, faces] of facesByGroup.entries()) {
    const remap = new Map<number, number>();
    const posList: number[] = [];
    const idxList: number[] = [];
    for (const f of faces) {
      for (let k = 0; k < 3; k += 1) {
        const oldIdx = mesh.indices[f * 3 + k]!;
        let newIdx = remap.get(oldIdx);
        if (newIdx === undefined) {
          newIdx = posList.length / 3;
          remap.set(oldIdx, newIdx);
          posList.push(mesh.positions[oldIdx * 3]!, mesh.positions[oldIdx * 3 + 1]!, mesh.positions[oldIdx * 3 + 2]!);
        }
        idxList.push(newIdx);
      }
    }
    out.set(gid, { positions: new Float32Array(posList), indices: new Uint32Array(idxList) });
  }
  return out;
}

function projectPointToMeshSurface(point: Vec3, mesh: IndexedTriMesh): { readonly point: Vec3; readonly normal: Vec3 } {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const pos = mesh.positions;
  let bestDistSq = Infinity;
  let bestPoint = point;
  let bestNormal: Vec3 = { x: 0, y: 1, z: 0 };
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = mesh.indices[f * 3]! * 3; const i1 = mesh.indices[f * 3 + 1]! * 3; const i2 = mesh.indices[f * 3 + 2]! * 3;
    const a: Vec3 = { x: pos[i0]!, y: pos[i0 + 1]!, z: pos[i0 + 2]! };
    const b: Vec3 = { x: pos[i1]!, y: pos[i1 + 1]!, z: pos[i1 + 2]! };
    const c: Vec3 = { x: pos[i2]!, y: pos[i2 + 1]!, z: pos[i2 + 2]! };
    const ab = vSub(b, a); const ac = vSub(c, a);
    const n = vNormalize(vCross(ab, ac));
    const proj = vSub(point, vScale(n, vDot(vSub(point, a), n)));
    const d00 = vDot(ab, ab); const d01 = vDot(ab, ac); const d11 = vDot(ac, ac);
    const ap = vSub(proj, a); const d20 = vDot(ap, ab); const d21 = vDot(ap, ac);
    const denom = d00 * d11 - d01 * d01;
    let u = Math.abs(denom) > 1e-10 ? (d11 * d20 - d01 * d21) / denom : 0;
    let v = Math.abs(denom) > 1e-10 ? (d00 * d21 - d01 * d20) / denom : 0;
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1 - u, v));
    const clamped = vAdd(a, vAdd(vScale(ab, u), vScale(ac, v)));
    const diff = vSub(point, clamped);
    const distSq = vDot(diff, diff);
    if (distSq < bestDistSq) { bestDistSq = distSq; bestPoint = clamped; bestNormal = n; }
  }
  return { point: bestPoint, normal: bestNormal };
}

function evalCatmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t; const t3 = t2 * t;
  const f = (v0: number, v1: number, v2: number, v3: number): number =>
    0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

function buildParallelTransportFrames(
  controlPoints: readonly Vec3[], subdivisions: number, snapMesh?: IndexedTriMesh, surfaceNormals?: readonly Vec3[],
): CurveFrame[] {
  const pts: Vec3[] = [];
  const normHints: (Vec3 | null)[] = [];
  const segCount = controlPoints.length - 1;
  for (let s = 0; s < segCount; s += 1) {
    const p0 = controlPoints[Math.max(0, s - 1)]!; const p1 = controlPoints[s]!;
    const p2 = controlPoints[s + 1]!; const p3 = controlPoints[Math.min(controlPoints.length - 1, s + 2)]!;
    const steps = s === segCount - 1 ? subdivisions + 1 : subdivisions;
    for (let k = 0; k < steps; k += 1) {
      const t = k / subdivisions;
      let pt = evalCatmullRom(p0, p1, p2, p3, t);
      let hint: Vec3 | null = null;
      if (snapMesh && snapMesh.indices.length >= 3) {
        const snapped = projectPointToMeshSurface(pt, snapMesh);
        pt = snapped.point; hint = snapped.normal;
      } else if (surfaceNormals && surfaceNormals.length === controlPoints.length) {
        hint = vNormalize(vAdd(vScale(surfaceNormals[s]!, 1 - t), vScale(surfaceNormals[s + 1]!, t)));
      }
      pts.push(pt); normHints.push(hint);
    }
  }

  const frames: CurveFrame[] = [];
  let arcLength = 0;
  let prevTangent = vNormalize(vSub(pts[1]!, pts[0]!), { x: 0, y: 0, z: 1 });
  const initUp = normHints[0] ?? (Math.abs(prevTangent.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
  let prevNormal = vNormalize(vSub(initUp, vScale(prevTangent, vDot(initUp, prevTangent))));

  for (let i = 0; i < pts.length; i += 1) {
    const pos = pts[i]!;
    if (i > 0) arcLength += vLen(vSub(pos, pts[i - 1]!));
    const tangent = i === 0 ? prevTangent : i === pts.length - 1
      ? vNormalize(vSub(pos, pts[i - 1]!), prevTangent) : vNormalize(vSub(pts[i + 1]!, pts[i - 1]!), prevTangent);

    let normal = prevNormal;
    if (i > 0) {
      const axis = vCross(prevTangent, tangent);
      const axisLen = vLen(axis);
      if (axisLen > 1e-6) {
        const k = vScale(axis, 1 / axisLen);
        const ang = Math.acos(Math.max(-1, Math.min(1, vDot(prevTangent, tangent))));
        const c = Math.cos(ang); const s = Math.sin(ang);
        normal = vAdd(vAdd(vScale(prevNormal, c), vScale(vCross(k, prevNormal), s)), vScale(k, vDot(k, prevNormal) * (1 - c)));
      }
      const hint = normHints[i];
      normal = hint
        ? vNormalize(vAdd(vScale(normal, 0.35), vScale(vNormalize(vSub(hint, vScale(tangent, vDot(hint, tangent))), normal), 0.65)), normal)
        : vNormalize(vSub(normal, vScale(tangent, vDot(normal, tangent))), prevNormal);
    }
    frames.push({ position: pos, tangent, normal, binormal: vNormalize(vCross(tangent, normal)), arcLength });
    prevTangent = tangent; prevNormal = normal;
  }
  return frames;
}

function sampleFrameAtArc(frames: readonly CurveFrame[], s: number): CurveFrame {
  const total = frames[frames.length - 1]!.arcLength;
  const clampedS = Math.max(0, Math.min(total, s));
  let lo = 0; let hi = frames.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (frames[mid]!.arcLength <= clampedS) lo = mid; else hi = mid; }
  const f0 = frames[lo]!; const f1 = frames[hi]!;
  const t = Math.max(0, Math.min(1, (clampedS - f0.arcLength) / Math.max(1e-8, f1.arcLength - f0.arcLength)));
  const tangent = vNormalize(vAdd(vScale(f0.tangent, 1 - t), vScale(f1.tangent, t)), f0.tangent);
  const rawN = vAdd(vScale(f0.normal, 1 - t), vScale(f1.normal, t));
  const normal = vNormalize(vSub(rawN, vScale(tangent, vDot(rawN, tangent))), f0.normal);
  return { position: vAdd(vScale(f0.position, 1 - t), vScale(f1.position, t)), tangent, normal, binormal: vNormalize(vCross(tangent, normal)), arcLength: clampedS };
}

/** 3분할 IMM 키트를 커브를 따라 변형 배치하고 경계 용접 및 Face Set 태그를 생성한다. */
export function generateImmCurveMesh(kit: ImmTriPartKit, options: ImmCurvePlacementOptions): ImmGeneratedMeshResult {
  if (options.controlPoints.length < 2) throw new Error("IMM 커브 배치는 최소 2개 이상의 제어점이 필요합니다.");
  const radiusScale = Math.max(0.01, options.radiusScale ?? 1.0);
  const taperCurve = options.taperCurve ?? (() => 1.0);
  const weldTol = Math.max(0, options.weldTolerance ?? 0);
  const frames = buildParallelTransportFrames(options.controlPoints, 12, options.snapTargetMesh, options.surfaceNormals);
  const totalLen = frames[frames.length - 1]!.arcLength;
  if (totalLen < 1e-5) throw new Error("IMM 커브의 총 길이가 0에 가까워 배치할 수 없습니다.");

  const startBaseLen = Math.max(1e-4, (kit.startCap.maxZ - kit.startCap.minZ) * radiusScale);
  const midBaseLen = Math.max(1e-4, (kit.midTile.maxZ - kit.midTile.minZ) * radiusScale);
  const endBaseLen = Math.max(1e-4, (kit.endCap.maxZ - kit.endCap.minZ) * radiusScale);
  const capBudget = startBaseLen + endBaseLen;

  let midRepeatCount: number;
  let sStartLen = startBaseLen;
  let sEndLen = endBaseLen;
  let sMidLen = midBaseLen;

  if (options.repeatCount !== undefined) {
    midRepeatCount = Math.max(0, Math.floor(options.repeatCount));
    const fitScale = totalLen / (startBaseLen + endBaseLen + midRepeatCount * midBaseLen);
    sStartLen = startBaseLen * fitScale; sEndLen = endBaseLen * fitScale; sMidLen = midBaseLen * fitScale;
  } else if (totalLen <= capBudget) {
    const fitScale = totalLen / capBudget;
    sStartLen = startBaseLen * fitScale; sEndLen = endBaseLen * fitScale; midRepeatCount = 0;
  } else {
    const midRoom = totalLen - capBudget;
    midRepeatCount = Math.max(1, Math.round(midRoom / midBaseLen));
    sMidLen = midRoom / midRepeatCount;
  }

  const outPositions: number[] = [];
  const outIndices: number[] = [];
  const faceGroupList: number[] = [];

  const appendPart = (part: ImmMeshPart, arcStart: number, arcSpan: number, groupId: number): void => {
    const baseVertex = outPositions.length / 3;
    const zSpan = Math.max(1e-6, part.maxZ - part.minZ);
    for (let i = 0; i < part.positions.length / 3; i += 1) {
      const lx = part.positions[i * 3]! * radiusScale;
      const ly = part.positions[i * 3 + 1]! * radiusScale;
      const arcS = arcStart + ((part.positions[i * 3 + 2]! - part.minZ) / zSpan) * arcSpan;
      const taper = Math.max(0.05, taperCurve(Math.max(0, Math.min(1, arcS / totalLen))));
      const frame = sampleFrameAtArc(frames, arcS);
      outPositions.push(
        frame.position.x + frame.binormal.x * lx * taper + frame.normal.x * ly * taper,
        frame.position.y + frame.binormal.y * lx * taper + frame.normal.y * ly * taper,
        frame.position.z + frame.binormal.z * lx * taper + frame.normal.z * ly * taper,
      );
    }
    for (let t = 0; t < part.indices.length; t += 3) {
      outIndices.push(baseVertex + part.indices[t]!, baseVertex + part.indices[t + 1]!, baseVertex + part.indices[t + 2]!);
      faceGroupList.push(groupId);
    }
  };

  let cursor = 0;
  appendPart(kit.startCap, cursor, sStartLen, 1); cursor += sStartLen;
  for (let m = 0; m < midRepeatCount; m += 1) { appendPart(kit.midTile, cursor, sMidLen, 2); cursor += sMidLen; }
  appendPart(kit.endCap, cursor, sEndLen, 3);

  let weldedVertexCount = 0;
  let finalPositions = new Float32Array(outPositions);
  let finalIndices = new Uint32Array(outIndices);
  if (weldTol > 0) {
    const invTol = 1 / weldTol;
    const cellMap = new Map<string, number>();
    const newPos: number[] = [];
    const oldToNew = new Uint32Array(finalPositions.length / 3);
    for (let v = 0; v < finalPositions.length / 3; v += 1) {
      const x = finalPositions[v * 3]!; const y = finalPositions[v * 3 + 1]!; const z = finalPositions[v * 3 + 2]!;
      const key = `${Math.round(x * invTol)}:${Math.round(y * invTol)}:${Math.round(z * invTol)}`;
      const existing = cellMap.get(key);
      if (existing !== undefined) { oldToNew[v] = existing; weldedVertexCount += 1; }
      else { const idx = newPos.length / 3; cellMap.set(key, idx); oldToNew[v] = idx; newPos.push(x, y, z); }
    }
    finalPositions = new Float32Array(newPos);
    finalIndices = Uint32Array.from(finalIndices, (old) => oldToNew[old]!);
  }

  const faceSetState = createFaceSetState(faceGroupList.length);
  for (let f = 0; f < faceGroupList.length; f += 1) faceSetState.groupIds[f] = faceGroupList[f]!;
  faceSetState.nextGroupId = 4;

  return { mesh: { positions: finalPositions, indices: finalIndices }, faceSetState, totalArcLength: totalLen, midRepeatCount, weldedVertexCount, frameCount: frames.length };
}

function makeBoxPart(halfW: number, halfH: number, minZ: number, maxZ: number): ImmMeshPart {
  return {
    positions: new Float32Array([
      -halfW, -halfH, minZ, halfW, -halfH, minZ, halfW, halfH, minZ, -halfW, halfH, minZ,
      -halfW, -halfH, maxZ, halfW, -halfH, maxZ, halfW, halfH, maxZ, -halfW, halfH, maxZ,
    ]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
    minZ, maxZ,
  };
}

export function createBuiltInImmKit(preset: "chain-link" | "zipper-teeth" | "belt-rivet"): ImmTriPartKit {
  if (preset === "zipper-teeth") {
    return { id: "imm-zipper-teeth", name: "지퍼 슬라이더·치형 3분할 키트", startCap: makeBoxPart(0.035, 0.02, 0, 0.08), midTile: makeBoxPart(0.022, 0.012, 0, 0.05), endCap: makeBoxPart(0.03, 0.016, 0, 0.06) };
  }
  if (preset === "belt-rivet") {
    return { id: "imm-belt-rivet", name: "벨트 버클·리벳 3분할 키트", startCap: makeBoxPart(0.06, 0.025, 0, 0.12), midTile: makeBoxPart(0.045, 0.014, 0, 0.1), endCap: makeBoxPart(0.035, 0.012, 0, 0.09) };
  }
  return { id: "imm-chain-link", name: "체인 링크 3분할 키트", startCap: makeBoxPart(0.04, 0.04, 0, 0.1), midTile: makeBoxPart(0.03, 0.03, 0, 0.12), endCap: makeBoxPart(0.04, 0.04, 0, 0.1) };
}
