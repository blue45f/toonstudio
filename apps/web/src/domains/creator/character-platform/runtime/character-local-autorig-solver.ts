/**
 * 오프라인 커스텀 메시 원클릭 오토리거 (AccuRIG · Make-It-Animatable 클린룸 구현).
 *
 * - 높이 슬라이스 단면 + 대칭축 분석으로 24개 랜드마크 자동 추정 & X-미러 보정
 * - 정확히 55개 VRM 1.0 / Mixamo 호환 휴머노이드 본 계층 및 역바인드 행렬 생성
 * - 복셀화 지오데식 열확산(Geodesic Voxel Heat Diffusion) 스키닝으로
 *   좌/우 허벅지·팔/몸통 간 유클리드 웨이트 번짐 차단(상위 4본 정규화)
 * - 분리된 연결 셸(갑옷 견갑·모자·안경 등) 강체 액세서리 본 마스킹(100% 단일 본 결속)
 */

export const LOCAL_AUTORIG_SCHEMA_VERSION = 1 as const;
export const HUMANOID_RIG_BONE_COUNT = 55 as const;

export interface RigVec3 { readonly x: number; readonly y: number; readonly z: number; }
export interface StaticRigSourceMesh { readonly positions: Float32Array; readonly indices: Uint32Array; }

export type HumanoidLandmarkKey =
  | "hips" | "spine" | "chest" | "neck" | "chin" | "headTop"
  | "leftClavicle" | "leftShoulder" | "leftElbow" | "leftWrist" | "leftHandTip"
  | "rightClavicle" | "rightShoulder" | "rightElbow" | "rightWrist" | "rightHandTip"
  | "leftHip" | "leftKnee" | "leftAnkle" | "leftToe"
  | "rightHip" | "rightKnee" | "rightAnkle" | "rightToe";

export type HumanoidLandmarkMap = Record<HumanoidLandmarkKey, RigVec3>;

/** 정확히 55개 VRM 1.0 표준 휴머노이드 본 목록(코어 25 + 양손 30지절 = 55). */
export const HUMANOID_55_BONE_NAMES = [
  "hips", "spine", "chest", "upperChest", "neck", "head", "leftEye", "rightEye", "jaw",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
] as const;

export type Humanoid55BoneName = (typeof HUMANOID_55_BONE_NAMES)[number];

export interface HumanoidBoneNode {
  readonly index: number; readonly name: Humanoid55BoneName; readonly parentIndex: number;
  readonly headWorld: RigVec3; readonly tailWorld: RigVec3; readonly localOffset: RigVec3; readonly length: number;
}

export interface Humanoid55Skeleton {
  readonly bones: readonly HumanoidBoneNode[];
  readonly inverseBindMatrices: Float32Array;
  readonly symmetryPlaneX: number; readonly heightMeters: number;
}

export interface ConnectedMeshShell {
  readonly shellId: number; readonly vertexIndices: readonly number[]; readonly vertexCount: number;
  readonly centroid: RigVec3; readonly isPrimaryBody: boolean;
}

export interface RigidAccessoryBindingSpec { readonly shellId: number; readonly boneIndex?: number; }

export interface AutoRigSkinWeights {
  readonly joints: Uint16Array; readonly weights: Float32Array;
  readonly voxelResolution: number; readonly occupiedVoxelCount: number;
  readonly rigidShellBindings: readonly { readonly shellId: number; readonly boneIndex: number }[];
}

export interface LocalAutoRigOptions {
  readonly landmarkOverrides?: Partial<HumanoidLandmarkMap>;
  readonly voxelResolution?: number; readonly heatIterations?: number;
  readonly autoRigidAccessories?: boolean;
  readonly explicitRigidBindings?: readonly RigidAccessoryBindingSpec[];
}

export interface LocalAutoRigResult {
  readonly symmetryPlaneX: number; readonly landmarks: HumanoidLandmarkMap;
  readonly skeleton: Humanoid55Skeleton; readonly shells: readonly ConnectedMeshShell[];
  readonly skinning: AutoRigSkinWeights;
}

const vLerp = (a: RigVec3, b: RigVec3, t: number): RigVec3 => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});
const vDist = (a: RigVec3, b: RigVec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function computeMeshBounds(positions: Float32Array) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!; const y = positions[i + 1]!; const z = positions[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** 높이 슬라이스 단면 통계로 휴머노이드 24개 랜드마크와 대칭축을 자동 추정한다. */
export function estimateHumanoidLandmarks(mesh: StaticRigSourceMesh): {
  readonly symmetryPlaneX: number; readonly landmarks: HumanoidLandmarkMap; readonly heightMeters: number;
} {
  const vCount = Math.floor(mesh.positions.length / 3);
  if (vCount < 4) throw new Error("오토리깅을 수행하려면 최소 4개 이상의 정점이 필요합니다.");
  const b = computeMeshBounds(mesh.positions);
  const height = Math.max(0.1, b.maxY - b.minY);
  const depth = Math.max(0.05, b.maxZ - b.minZ);
  let sumX = 0; let sumZ = 0;
  for (let i = 0; i < vCount; i += 1) { sumX += mesh.positions[i * 3]!; sumZ += mesh.positions[i * 3 + 2]!; }
  const symX = sumX / vCount; const midZ = sumZ / vCount;

  const sliceSpanX = (r0: number, r1: number, fb: number): number => {
    const y0 = b.minY + height * r0; const y1 = b.minY + height * r1;
    let maxAbs = 0; let hits = 0;
    for (let i = 0; i < vCount; i += 1) {
      const y = mesh.positions[i * 3 + 1]!;
      if (y >= y0 && y <= y1) { maxAbs = Math.max(maxAbs, Math.abs(mesh.positions[i * 3]! - symX)); hits += 1; }
    }
    return hits > 0 && maxAbs > 0.01 ? maxAbs : fb;
  };

  const armReach = Math.max(height * 0.24, sliceSpanX(0.68, 0.84, height * 0.36));
  const shoulderHalf = Math.min(armReach * 0.45, Math.max(height * 0.09, sliceSpanX(0.77, 0.83, height * 0.12) * 0.38));
  const hipHalf = Math.max(height * 0.055, Math.min(height * 0.12, sliceSpanX(0.46, 0.56, height * 0.08) * 0.55));
  const yAt = (r: number): number => b.minY + height * r;

  return {
    symmetryPlaneX: symX,
    heightMeters: height,
    landmarks: {
      hips: { x: symX, y: yAt(0.52), z: midZ },
      spine: { x: symX, y: yAt(0.60), z: midZ },
      chest: { x: symX, y: yAt(0.73), z: midZ },
      neck: { x: symX, y: yAt(0.83), z: midZ },
      chin: { x: symX, y: yAt(0.87), z: midZ + depth * 0.18 },
      headTop: { x: symX, y: b.maxY, z: midZ },
      leftClavicle: { x: symX + shoulderHalf * 0.45, y: yAt(0.81), z: midZ },
      leftShoulder: { x: symX + shoulderHalf, y: yAt(0.80), z: midZ },
      leftElbow: { x: symX + shoulderHalf + (armReach - shoulderHalf) * 0.46, y: yAt(0.76), z: midZ - depth * 0.04 },
      leftWrist: { x: symX + armReach * 0.88, y: yAt(0.73), z: midZ },
      leftHandTip: { x: symX + armReach, y: yAt(0.72), z: midZ },
      rightClavicle: { x: symX - shoulderHalf * 0.45, y: yAt(0.81), z: midZ },
      rightShoulder: { x: symX - shoulderHalf, y: yAt(0.80), z: midZ },
      rightElbow: { x: symX - shoulderHalf - (armReach - shoulderHalf) * 0.46, y: yAt(0.76), z: midZ - depth * 0.04 },
      rightWrist: { x: symX - armReach * 0.88, y: yAt(0.73), z: midZ },
      rightHandTip: { x: symX - armReach, y: yAt(0.72), z: midZ },
      leftHip: { x: symX + hipHalf, y: yAt(0.50), z: midZ },
      leftKnee: { x: symX + hipHalf, y: yAt(0.28), z: midZ + depth * 0.04 },
      leftAnkle: { x: symX + hipHalf, y: yAt(0.06), z: midZ },
      leftToe: { x: symX + hipHalf, y: b.minY, z: midZ + depth * 0.32 },
      rightHip: { x: symX - hipHalf, y: yAt(0.50), z: midZ },
      rightKnee: { x: symX - hipHalf, y: yAt(0.28), z: midZ + depth * 0.04 },
      rightAnkle: { x: symX - hipHalf, y: yAt(0.06), z: midZ },
      rightToe: { x: symX - hipHalf, y: b.minY, z: midZ + depth * 0.32 },
    },
  };
}

const MIRROR_LANDMARK_PAIRS: Readonly<Partial<Record<HumanoidLandmarkKey, HumanoidLandmarkKey>>> = {
  leftClavicle: "rightClavicle", rightClavicle: "leftClavicle", leftShoulder: "rightShoulder", rightShoulder: "leftShoulder",
  leftElbow: "rightElbow", rightElbow: "leftElbow", leftWrist: "rightWrist", rightWrist: "leftWrist",
  leftHandTip: "rightHandTip", rightHandTip: "leftHandTip", leftHip: "rightHip", rightHip: "leftHip",
  leftKnee: "rightKnee", rightKnee: "leftKnee", leftAnkle: "rightAnkle", rightAnkle: "leftAnkle",
  leftToe: "rightToe", rightToe: "leftToe",
};

/** 랜드마크 미세 보정 시 X축 미러 대칭을 자동 동기화한다. */
export function applySymmetricLandmarkEdit(
  landmarks: HumanoidLandmarkMap, key: HumanoidLandmarkKey, nextPos: RigVec3, symmetryPlaneX: number, mirrorEnabled = true,
): HumanoidLandmarkMap {
  const updated: HumanoidLandmarkMap = { ...landmarks, [key]: nextPos };
  const partner = MIRROR_LANDMARK_PAIRS[key];
  if (mirrorEnabled && partner) {
    updated[partner] = { x: symmetryPlaneX * 2 - nextPos.x, y: nextPos.y, z: nextPos.z };
  }
  return updated;
}

/** 24개 랜드마크로부터 정확히 55본 VRM 1.0 휴머노이드 스켈레톤 및 역바인드 행렬을 생성한다. */
export function buildHumanoid55Skeleton(lm: HumanoidLandmarkMap, symmetryPlaneX: number, heightMeters: number): Humanoid55Skeleton {
  const upperChest = vLerp(lm.chest, lm.neck, 0.45);
  const head = vLerp(lm.neck, lm.headTop, 0.25);
  const eyeY = lm.neck.y + (lm.headTop.y - lm.neck.y) * 0.56;
  const eyeHalfX = Math.max(0.02, heightMeters * 0.022);
  const lEye: RigVec3 = { x: symmetryPlaneX + eyeHalfX, y: eyeY, z: lm.chin.z };
  const rEye: RigVec3 = { x: symmetryPlaneX - eyeHalfX, y: eyeY, z: lm.chin.z };

  const specs: { readonly name: Humanoid55BoneName; readonly parent: Humanoid55BoneName | null; readonly head: RigVec3; readonly tail: RigVec3 }[] = [
    { name: "hips", parent: null, head: lm.hips, tail: lm.spine },
    { name: "spine", parent: "hips", head: lm.spine, tail: lm.chest },
    { name: "chest", parent: "spine", head: lm.chest, tail: upperChest },
    { name: "upperChest", parent: "chest", head: upperChest, tail: lm.neck },
    { name: "neck", parent: "upperChest", head: lm.neck, tail: head },
    { name: "head", parent: "neck", head, tail: lm.headTop },
    { name: "leftEye", parent: "head", head: lEye, tail: { x: lEye.x, y: lEye.y, z: lEye.z + 0.03 } },
    { name: "rightEye", parent: "head", head: rEye, tail: { x: rEye.x, y: rEye.y, z: rEye.z + 0.03 } },
    { name: "jaw", parent: "head", head: vLerp(head, lm.chin, 0.6), tail: lm.chin },
    { name: "leftShoulder", parent: "upperChest", head: lm.leftClavicle, tail: lm.leftShoulder },
    { name: "leftUpperArm", parent: "leftShoulder", head: lm.leftShoulder, tail: lm.leftElbow },
    { name: "leftLowerArm", parent: "leftUpperArm", head: lm.leftElbow, tail: lm.leftWrist },
    { name: "leftHand", parent: "leftLowerArm", head: lm.leftWrist, tail: lm.leftHandTip },
    { name: "rightShoulder", parent: "upperChest", head: lm.rightClavicle, tail: lm.rightShoulder },
    { name: "rightUpperArm", parent: "rightShoulder", head: lm.rightShoulder, tail: lm.rightElbow },
    { name: "rightLowerArm", parent: "rightUpperArm", head: lm.rightElbow, tail: lm.rightWrist },
    { name: "rightHand", parent: "rightLowerArm", head: lm.rightWrist, tail: lm.rightHandTip },
    { name: "leftUpperLeg", parent: "hips", head: lm.leftHip, tail: lm.leftKnee },
    { name: "leftLowerLeg", parent: "leftUpperLeg", head: lm.leftKnee, tail: lm.leftAnkle },
    { name: "leftFoot", parent: "leftLowerLeg", head: lm.leftAnkle, tail: lm.leftToe },
    { name: "leftToes", parent: "leftFoot", head: lm.leftToe, tail: { x: lm.leftToe.x, y: lm.leftToe.y, z: lm.leftToe.z + 0.04 } },
    { name: "rightUpperLeg", parent: "hips", head: lm.rightHip, tail: lm.rightKnee },
    { name: "rightLowerLeg", parent: "rightUpperLeg", head: lm.rightKnee, tail: lm.rightAnkle },
    { name: "rightFoot", parent: "rightLowerLeg", head: lm.rightAnkle, tail: lm.rightToe },
    { name: "rightToes", parent: "rightFoot", head: lm.rightToe, tail: { x: lm.rightToe.x, y: lm.rightToe.y, z: lm.rightToe.z + 0.04 } },
  ];

  const appendFingers = (side: "left" | "right", wrist: RigVec3, tip: RigVec3): void => {
    const handParent: Humanoid55BoneName = side === "left" ? "leftHand" : "rightHand";
    const handLen = Math.max(0.06, vDist(wrist, tip));
    const dirX = tip.x >= wrist.x ? 1 : -1;
    const layout: readonly { readonly zOff: number; readonly sc: number; readonly names: readonly [Humanoid55BoneName, Humanoid55BoneName, Humanoid55BoneName] }[] =
      side === "left"
        ? [
            { zOff: 0.28, sc: 0.72, names: ["leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal"] },
            { zOff: 0.16, sc: 0.95, names: ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"] },
            { zOff: 0.04, sc: 1.0, names: ["leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal"] },
            { zOff: -0.08, sc: 0.92, names: ["leftRingProximal", "leftRingIntermediate", "leftRingDistal"] },
            { zOff: -0.2, sc: 0.78, names: ["leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"] },
          ]
        : [
            { zOff: 0.28, sc: 0.72, names: ["rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal"] },
            { zOff: 0.16, sc: 0.95, names: ["rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal"] },
            { zOff: 0.04, sc: 1.0, names: ["rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal"] },
            { zOff: -0.08, sc: 0.92, names: ["rightRingProximal", "rightRingIntermediate", "rightRingDistal"] },
            { zOff: -0.2, sc: 0.78, names: ["rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal"] },
          ];
    for (const f of layout) {
      const base: RigVec3 = { x: wrist.x + dirX * handLen * 0.42, y: wrist.y, z: wrist.z + handLen * f.zOff };
      const seg = (handLen * 0.58 * f.sc) / 3;
      const p1: RigVec3 = { x: base.x + dirX * seg, y: base.y, z: base.z };
      const p2: RigVec3 = { x: base.x + dirX * seg * 2, y: base.y, z: base.z };
      const p3: RigVec3 = { x: base.x + dirX * seg * 3, y: base.y, z: base.z };
      specs.push(
        { name: f.names[0], parent: handParent, head: base, tail: p1 },
        { name: f.names[1], parent: f.names[0], head: p1, tail: p2 },
        { name: f.names[2], parent: f.names[1], head: p2, tail: p3 },
      );
    }
  };
  appendFingers("left", lm.leftWrist, lm.leftHandTip);
  appendFingers("right", lm.rightWrist, lm.rightHandTip);

  const indexByName = new Map(specs.map((s, idx) => [s.name, idx]));
  const bones: HumanoidBoneNode[] = [];
  const inverseBindMatrices = new Float32Array(HUMANOID_RIG_BONE_COUNT * 16);
  for (let i = 0; i < specs.length; i += 1) {
    const s = specs[i]!;
    const parentIndex = s.parent ? (indexByName.get(s.parent) ?? -1) : -1;
    const pHead = parentIndex >= 0 ? specs[parentIndex]!.head : { x: 0, y: 0, z: 0 };
    bones.push({
      index: i, name: s.name, parentIndex, headWorld: s.head, tailWorld: s.tail,
      localOffset: { x: s.head.x - pHead.x, y: s.head.y - pHead.y, z: s.head.z - pHead.z },
      length: Math.max(1e-4, vDist(s.head, s.tail)),
    });
    const off = i * 16;
    inverseBindMatrices[off] = 1; inverseBindMatrices[off + 5] = 1; inverseBindMatrices[off + 10] = 1;
    inverseBindMatrices[off + 12] = -s.head.x; inverseBindMatrices[off + 13] = -s.head.y; inverseBindMatrices[off + 14] = -s.head.z;
    inverseBindMatrices[off + 15] = 1;
  }
  return { bones, inverseBindMatrices, symmetryPlaneX, heightMeters };
}

/** 정점-삼각형 연결성 BFS로 독립 메시 셸(주체 본체 vs 분리 액세서리)을 클러스터링한다. */
export function detectConnectedShells(mesh: StaticRigSourceMesh): readonly ConnectedMeshShell[] {
  const vCount = Math.floor(mesh.positions.length / 3);
  const adj: number[][] = Array.from({ length: vCount }, () => []);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]!; const b = mesh.indices[t + 1]!; const c = mesh.indices[t + 2]!;
    adj[a]!.push(b, c); adj[b]!.push(a, c); adj[c]!.push(a, b);
  }
  const visited = new Uint8Array(vCount);
  const rawShells: { vertices: number[]; centroid: RigVec3 }[] = [];
  for (let start = 0; start < vCount; start += 1) {
    if (visited[start] === 1) continue;
    const queue = [start]; visited[start] = 1;
    const verts: number[] = []; let sx = 0; let sy = 0; let sz = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const v = queue[head]!;
      verts.push(v);
      sx += mesh.positions[v * 3]!; sy += mesh.positions[v * 3 + 1]!; sz += mesh.positions[v * 3 + 2]!;
      for (const nb of adj[v]!) { if (visited[nb] === 0) { visited[nb] = 1; queue.push(nb); } }
    }
    rawShells.push({ vertices: verts, centroid: { x: sx / verts.length, y: sy / verts.length, z: sz / verts.length } });
  }
  rawShells.sort((a, b) => b.vertices.length - a.vertices.length);
  return rawShells.map((s, idx) => ({ shellId: idx, vertexIndices: s.vertices, vertexCount: s.vertices.length, centroid: s.centroid, isPrimaryBody: idx === 0 }));
}

function pointToSegmentDistSq3(p: RigVec3, a: RigVec3, b: RigVec3): number {
  const abx = b.x - a.x; const aby = b.y - a.y; const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t = lenSq > 1e-10 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq)) : 0;
  return (p.x - (a.x + abx * t)) ** 2 + (p.y - (a.y + aby * t)) ** 2 + (p.z - (a.z + abz * t)) ** 2;
}

function findNearestBoneIndex(point: RigVec3, skeleton: Humanoid55Skeleton): number {
  let bestIdx = 0; let bestDistSq = Infinity;
  for (let b = 0; b < skeleton.bones.length; b += 1) {
    const bone = skeleton.bones[b]!;
    const dSq = pointToSegmentDistSq3(point, bone.headWorld, bone.tailWorld);
    if (dSq < bestDistSq) { bestDistSq = dSq; bestIdx = b; }
  }
  return bestIdx;
}

/**
 * 복셀 지오데식 열확산(Geodesic Voxel Heat Binding) 스키닝 가중치를 계산한다.
 * 점유 복셀 내부 6-이웃 연결과 감쇠 열방정식으로 좌/우 사지 간 웨이트 번짐을 차단한다.
 */
export function computeGeodesicVoxelSkinWeights(
  mesh: StaticRigSourceMesh,
  skeleton: Humanoid55Skeleton,
  shells: readonly ConnectedMeshShell[],
  options: { readonly voxelResolution?: number; readonly heatIterations?: number; readonly autoRigidAccessories?: boolean; readonly explicitRigidBindings?: readonly RigidAccessoryBindingSpec[] } = {},
): AutoRigSkinWeights {
  const res = Math.max(12, Math.min(64, Math.floor(options.voxelResolution ?? 24)));
  const heatIters = Math.max(4, Math.min(48, Math.floor(options.heatIterations ?? 16)));
  const b = computeMeshBounds(mesh.positions);
  const pad = Math.max(0.02, skeleton.heightMeters * 0.03);
  const minX = b.minX - pad; const minY = b.minY - pad; const minZ = b.minZ - pad;
  const spanX = Math.max(1e-4, b.maxX - b.minX + pad * 2);
  const spanY = Math.max(1e-4, b.maxY - b.minY + pad * 2);
  const spanZ = Math.max(1e-4, b.maxZ - b.minZ + pad * 2);

  const totalVoxels = res * res * res;
  const occupied = new Uint8Array(totalVoxels);
  const toCoord = (x: number, y: number, z: number): [number, number, number] => [
    Math.max(0, Math.min(res - 1, Math.floor(((x - minX) / spanX) * res))),
    Math.max(0, Math.min(res - 1, Math.floor(((y - minY) / spanY) * res))),
    Math.max(0, Math.min(res - 1, Math.floor(((z - minZ) / spanZ) * res))),
  ];
  const voxelIdx = (vx: number, vy: number, vz: number): number => (vz * res + vy) * res + vx;

  for (let t = 0; t < Math.floor(mesh.indices.length / 3); t += 1) {
    const i0 = mesh.indices[t * 3]! * 3; const i1 = mesh.indices[t * 3 + 1]! * 3; const i2 = mesh.indices[t * 3 + 2]! * 3;
    const ax = mesh.positions[i0]!; const ay = mesh.positions[i0 + 1]!; const az = mesh.positions[i0 + 2]!;
    const bx = mesh.positions[i1]!; const by = mesh.positions[i1 + 1]!; const bz = mesh.positions[i1 + 2]!;
    const cx = mesh.positions[i2]!; const cy = mesh.positions[i2 + 1]!; const cz = mesh.positions[i2 + 2]!;
    const pts = [
      [ax, ay, az], [bx, by, bz], [cx, cy, cz],
      [(ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5],
      [(bx + cx) * 0.5, (by + cy) * 0.5, (bz + cz) * 0.5],
      [(cx + ax) * 0.5, (cy + ay) * 0.5, (cz + az) * 0.5],
      [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
    ] as const;
    for (const pt of pts) {
      const [vx, vy, vz] = toCoord(pt[0], pt[1], pt[2]);
      occupied[voxelIdx(vx, vy, vz)] = 1;
    }
  }

  const activeVoxels: number[] = [];
  const activeIndexOf = new Int32Array(totalVoxels).fill(-1);
  for (let i = 0; i < totalVoxels; i += 1) {
    if (occupied[i] === 1) { activeIndexOf[i] = activeVoxels.length; activeVoxels.push(i); }
  }

  const boneCount = skeleton.bones.length;
  const activeN = Math.max(1, activeVoxels.length);
  const heatCurr = new Float32Array(activeN * boneCount);
  const heatNext = new Float32Array(activeN * boneCount);
  const seedBone = new Int16Array(activeN);
  const boneSide = new Int8Array(boneCount);
  for (let bi = 0; bi < boneCount; bi += 1) {
    const nm = skeleton.bones[bi]!.name;
    boneSide[bi] = nm.startsWith("left") ? 1 : nm.startsWith("right") ? -1 : 0;
  }

  const voxelSide = new Int8Array(activeN);
  for (let a = 0; a < activeVoxels.length; a += 1) {
    const idx = activeVoxels[a]!;
    const vx = idx % res; const vy = Math.floor(idx / res) % res; const vz = Math.floor(idx / (res * res));
    const center: RigVec3 = {
      x: minX + ((vx + 0.5) / res) * spanX,
      y: minY + ((vy + 0.5) / res) * spanY,
      z: minZ + ((vz + 0.5) / res) * spanZ,
    };
    const nearest = findNearestBoneIndex(center, skeleton);
    seedBone[a] = nearest;
    heatCurr[a * boneCount + nearest] = 1.0;
    const dxSym = center.x - skeleton.symmetryPlaneX;
    voxelSide[a] = dxSym > 0.025 ? 1 : dxSym < -0.025 ? -1 : 0;
  }

  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  for (let iter = 0; iter < heatIters; iter += 1) {
    for (let a = 0; a < activeVoxels.length; a += 1) {
      const idx = activeVoxels[a]!;
      const vx = idx % res; const vy = Math.floor(idx / res) % res; const vz = Math.floor(idx / (res * res));
      const neighbors: number[] = [];
      for (const [dx, dy, dz] of dirs) {
        const nx = vx + dx; const ny = vy + dy; const nz = vz + dz;
        if (nx < 0 || nx >= res || ny < 0 || ny >= res || nz < 0 || nz >= res) continue;
        const nAct = activeIndexOf[voxelIdx(nx, ny, nz)]!;
        if (nAct >= 0) neighbors.push(nAct);
      }
      const dstBase = a * boneCount;
      const anchor = seedBone[a]!;
      const vSide = voxelSide[a]!;
      if (neighbors.length === 0) {
        for (let bi = 0; bi < boneCount; bi += 1) heatNext[dstBase + bi] = heatCurr[dstBase + bi]!;
        continue;
      }
      const invN = 1 / neighbors.length;
      for (let bi = 0; bi < boneCount; bi += 1) {
        // 좌/우 사지 본의 반대편 반공간 침투를 구조적으로 감쇠 차단
        if (vSide !== 0 && boneSide[bi] !== 0 && vSide !== boneSide[bi]) {
          heatNext[dstBase + bi] = 0;
          continue;
        }
        let nbSum = 0;
        for (let k = 0; k < neighbors.length; k += 1) nbSum += heatCurr[neighbors[k]! * boneCount + bi]!;
        heatNext[dstBase + bi] = heatCurr[dstBase + bi]! * 0.2 + nbSum * invN * 0.35 + (bi === anchor ? 0.45 : 0);
      }
    }
    heatCurr.set(heatNext);
  }

  const vCount = Math.floor(mesh.positions.length / 3);
  const joints = new Uint16Array(vCount * 4);
  const weights = new Float32Array(vCount * 4);
  for (let v = 0; v < vCount; v += 1) {
    const pt: RigVec3 = { x: mesh.positions[v * 3]!, y: mesh.positions[v * 3 + 1]!, z: mesh.positions[v * 3 + 2]! };
    const [vx, vy, vz] = toCoord(pt.x, pt.y, pt.z);
    const actIdx = activeIndexOf[voxelIdx(vx, vy, vz)]!;
    if (actIdx < 0) { joints[v * 4] = findNearestBoneIndex(pt, skeleton); weights[v * 4] = 1; continue; }

    const base = actIdx * boneCount;
    const topJ = [0, 0, 0, 0]; const topW = [0, 0, 0, 0];
    for (let bi = 0; bi < boneCount; bi += 1) {
      const w = heatCurr[base + bi]!;
      if (w <= topW[3]!) continue;
      let slot = 3;
      while (slot > 0 && w > topW[slot - 1]!) { topW[slot] = topW[slot - 1]!; topJ[slot] = topJ[slot - 1]!; slot -= 1; }
      topW[slot] = w; topJ[slot] = bi;
    }
    const sum = topW[0]! + topW[1]! + topW[2]! + topW[3]!;
    if (sum > 1e-8) {
      for (let k = 0; k < 4; k += 1) { joints[v * 4 + k] = topJ[k]!; weights[v * 4 + k] = topW[k]! / sum; }
    } else {
      joints[v * 4] = findNearestBoneIndex(pt, skeleton); weights[v * 4] = 1;
    }
  }

  const rigidMap = new Map<number, number>();
  if (options.autoRigidAccessories) {
    for (const sh of shells) { if (!sh.isPrimaryBody) rigidMap.set(sh.shellId, findNearestBoneIndex(sh.centroid, skeleton)); }
  }
  for (const spec of options.explicitRigidBindings ?? []) {
    const sh = shells.find((s) => s.shellId === spec.shellId);
    if (!sh) continue;
    rigidMap.set(spec.shellId, spec.boneIndex !== undefined ? Math.max(0, Math.min(boneCount - 1, Math.floor(spec.boneIndex))) : findNearestBoneIndex(sh.centroid, skeleton));
  }

  const rigidShellBindings: { readonly shellId: number; readonly boneIndex: number }[] = [];
  for (const [shellId, boneIndex] of rigidMap.entries()) {
    const sh = shells.find((s) => s.shellId === shellId);
    if (!sh) continue;
    for (const v of sh.vertexIndices) {
      joints[v * 4] = boneIndex; joints[v * 4 + 1] = 0; joints[v * 4 + 2] = 0; joints[v * 4 + 3] = 0;
      weights[v * 4] = 1; weights[v * 4 + 1] = 0; weights[v * 4 + 2] = 0; weights[v * 4 + 3] = 0;
    }
    rigidShellBindings.push({ shellId, boneIndex });
  }

  return { joints, weights, voxelResolution: res, occupiedVoxelCount: activeVoxels.length, rigidShellBindings };
}

/** 정적 휴머노이드 메시에서 랜드마크 -> 55본 스켈레톤 -> 지오데식 히트 웨이트 -> 강체 마스킹까지 일괄 실행한다. */
export function solveLocalHumanoidAutoRig(mesh: StaticRigSourceMesh, options: LocalAutoRigOptions = {}): LocalAutoRigResult {
  const est = estimateHumanoidLandmarks(mesh);
  const landmarks: HumanoidLandmarkMap = { ...est.landmarks, ...(options.landmarkOverrides ?? {}) };
  const skeleton = buildHumanoid55Skeleton(landmarks, est.symmetryPlaneX, est.heightMeters);
  const shells = detectConnectedShells(mesh);
  const skinning = computeGeodesicVoxelSkinWeights(mesh, skeleton, shells, options);
  return { symmetryPlaneX: est.symmetryPlaneX, landmarks, skeleton, shells, skinning };
}
