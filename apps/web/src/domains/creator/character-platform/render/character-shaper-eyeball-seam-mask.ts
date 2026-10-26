/**
 * StudioHORANG SHAPER (v1.05, Assembly-CSharp.dll) 역공학 명세 기반
 * 1) 안구 시선·하이라이트 컨트롤러 (EyeballData 0x02000028 / EyeballHighlightType 0x02000027)
 * 2) 목/바디 경계 정점 심 용접 (BodyPartsManager: FindSamePositionNeckVertices / MergeNeckBlend)
 * 3) 의상 착용 바디 피부 가림 마스크 (_MaskTex) & 액세서리 부모 본 재바인딩 (SetParentBoneByName)
 */

export const SHAPER_EYEBALL_SEAM_MASK_VERSION = 1 as const;

export type ShaperVector2 = readonly [number, number];
export type ShaperVector3 = readonly [number, number, number];

export type EyeballHighlightType = "fix" | "cam" | "light" | "world";

export type EyeballArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface ShaperEyeballData {
  readonly highlightType: EyeballHighlightType;
  readonly fixEyeballCam: boolean;
  readonly symmetryGaze: boolean;
  readonly ebhp: ShaperVector2;
  readonly eblt: ShaperVector3;
  readonly ebrt: ShaperVector3;
  readonly irisScale: number;
  readonly highlightIntensity: number;
}

export interface EyeballSceneContext {
  readonly cameraPosition: ShaperVector3;
  readonly cameraForward: ShaperVector3;
  readonly mainLightDirection: ShaperVector3;
  readonly headPosition: ShaperVector3;
  readonly headForward: ShaperVector3;
  readonly headUp: ShaperVector3;
  readonly headRight: ShaperVector3;
  readonly leftEyePosition: ShaperVector3;
  readonly rightEyePosition: ShaperVector3;
}

export interface NeckBoundaryVertex {
  readonly vertexIndex: number;
  readonly position: ShaperVector3;
  readonly normal: ShaperVector3;
}

export interface NeckSeamVertexPair {
  readonly headVertexIndex: number;
  readonly bodyVertexIndex: number;
  readonly distance: number;
}

export interface WeldedNeckSeamResult {
  readonly matchedPairs: readonly NeckSeamVertexPair[];
  readonly headVertices: readonly NeckBoundaryVertex[];
  readonly bodyVertices: readonly NeckBoundaryVertex[];
}

export type BodyMaskRegion =
  | "upperChest"
  | "lowerTorso"
  | "shoulders"
  | "upperArms"
  | "forearms"
  | "pelvis"
  | "thighs"
  | "calves"
  | "feet";

export interface CostumeEquippedSlotState {
  readonly clothTop: "none" | "sleeveless" | "shortSleeve" | "longSleeve" | "coat";
  readonly clothBottom: "none" | "shorts" | "skirt" | "longPants";
  readonly shoes: "none" | "sandals" | "ankletShoes" | "kneeBoots";
}

export interface BodyOcclusionMaskResult {
  readonly hiddenRegions: readonly BodyMaskRegion[];
  readonly visibleRegions: readonly BodyMaskRegion[];
  readonly regionVisibility: Readonly<Record<BodyMaskRegion, 0 | 1>>;
  readonly maskTextureWidth: number;
  readonly maskTextureHeight: number;
  readonly maskTexPixels: Uint8Array;
}

export interface ShaperBoneWorldTransform {
  readonly boneName: string;
  readonly worldPosition: ShaperVector3;
  readonly worldEulerDeg: ShaperVector3;
  readonly worldScale: ShaperVector3;
}

export interface ShaperAccessoryAttachment {
  readonly accessoryId: string;
  readonly parentBoneName: string;
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
}

export class ShaperEyeballSeamMaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ShaperEyeballSeamMaskError";
  }
}

const EPSILON = 1e-7;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MAX_EYE_PITCH_DEG = 25;
const MAX_EYE_YAW_DEG = 35;
const MAX_HIGHLIGHT_OFFSET = 0.35;

const BODY_REGION_UV_BOXES: Readonly<
  Record<BodyMaskRegion, { readonly uMin: number; readonly uMax: number; readonly vMin: number; readonly vMax: number }>
> = {
  upperChest: { uMin: 0.25, uMax: 0.75, vMin: 0.72, vMax: 0.88 },
  lowerTorso: { uMin: 0.25, uMax: 0.75, vMin: 0.54, vMax: 0.72 },
  shoulders: { uMin: 0.05, uMax: 0.95, vMin: 0.88, vMax: 0.98 },
  upperArms: { uMin: 0.0, uMax: 0.25, vMin: 0.68, vMax: 0.88 },
  forearms: { uMin: 0.75, uMax: 1.0, vMin: 0.68, vMax: 0.88 },
  pelvis: { uMin: 0.25, uMax: 0.75, vMin: 0.42, vMax: 0.54 },
  thighs: { uMin: 0.15, uMax: 0.85, vMin: 0.26, vMax: 0.42 },
  calves: { uMin: 0.15, uMax: 0.85, vMin: 0.1, vMax: 0.26 },
  feet: { uMin: 0.15, uMax: 0.85, vMin: 0.0, vMax: 0.1 },
};

const ALL_BODY_MASK_REGIONS: readonly BodyMaskRegion[] = [
  "upperChest", "lowerTorso", "shoulders", "upperArms", "forearms", "pelvis", "thighs", "calves", "feet",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sub3(a: ShaperVector3, b: ShaperVector3): ShaperVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot3(a: ShaperVector3, b: ShaperVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length3(v: ShaperVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: ShaperVector3, fallback: ShaperVector3 = [0, 0, 1]): ShaperVector3 {
  const len = length3(v);
  return len > EPSILON ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
}

function lerp3(a: ShaperVector3, b: ShaperVector3, t: number): ShaperVector3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function wrapAngleDeg(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : Number(wrapped.toFixed(6));
}

/**
 * 하이라이트 모드 4종(`fix`, `cam`, `light`, `world`)에 따른 안구 하이라이트 오프셋(`ebhp`)을 계산한다.
 */
export function computeEyeballHighlightOffset(
  eyeball: Pick<ShaperEyeballData, "highlightType" | "ebhp">,
  scene: EyeballSceneContext,
): ShaperVector2 {
  if (eyeball.highlightType === "fix") {
    return [
      clamp(eyeball.ebhp[0], -MAX_HIGHLIGHT_OFFSET, MAX_HIGHLIGHT_OFFSET),
      clamp(eyeball.ebhp[1], -MAX_HIGHLIGHT_OFFSET, MAX_HIGHLIGHT_OFFSET),
    ];
  }

  const headRight = normalize3(scene.headRight, [1, 0, 0]);
  const headUp = normalize3(scene.headUp, [0, 1, 0]);

  let referenceDir: ShaperVector3;
  if (eyeball.highlightType === "cam") {
    referenceDir = normalize3(sub3(scene.cameraPosition, scene.headPosition), [0, 0, 1]);
  } else if (eyeball.highlightType === "light") {
    referenceDir = normalize3(
      [-scene.mainLightDirection[0], -scene.mainLightDirection[1], -scene.mainLightDirection[2]],
      [0, 1, 1],
    );
  } else {
    // world: 월드 고정 천정/전방 기준 벡터와 헤드 로컬 축의 상대 투영
    referenceDir = normalize3([0.15, 0.75, 0.64]);
  }

  const uOffset = clamp(dot3(referenceDir, headRight) * 0.25, -MAX_HIGHLIGHT_OFFSET, MAX_HIGHLIGHT_OFFSET);
  const vOffset = clamp(dot3(referenceDir, headUp) * 0.25, -MAX_HIGHLIGHT_OFFSET, MAX_HIGHLIGHT_OFFSET);

  return [Number(uOffset.toFixed(6)), Number(vOffset.toFixed(6))];
}

/**
 * `[F10]` 카메라 응시 잠금(`fixEyeballCam`)을 토글한다.
 */
export function toggleEyeballCameraLock(eyeball: ShaperEyeballData): {
  readonly eyeball: ShaperEyeballData;
  readonly statusMessage: string;
} {
  const nextLocked = !eyeball.fixEyeballCam;
  return {
    eyeball: {
      ...eyeball,
      fixEyeballCam: nextLocked,
    },
    statusMessage: nextLocked
      ? "카메라 응시 고정 [F10] 켜짐"
      : "카메라 응시 고정 [F10] 꺼짐",
  };
}

function computeSingleEyeLookAtAngles(
  eyePosition: ShaperVector3,
  targetPosition: ShaperVector3,
  scene: EyeballSceneContext,
): ShaperVector3 {
  const dir = normalize3(sub3(targetPosition, eyePosition), scene.headForward);
  const right = normalize3(scene.headRight, [1, 0, 0]);
  const up = normalize3(scene.headUp, [0, 1, 0]);
  const forward = normalize3(scene.headForward, [0, 0, 1]);

  const localX = dot3(dir, right);
  const localY = dot3(dir, up);
  const localZ = Math.max(EPSILON, dot3(dir, forward));

  const pitchDeg = clamp(-Math.atan2(localY, localZ) * RAD_TO_DEG, -MAX_EYE_PITCH_DEG, MAX_EYE_PITCH_DEG);
  const yawDeg = clamp(Math.atan2(localX, localZ) * RAD_TO_DEG, -MAX_EYE_YAW_DEG, MAX_EYE_YAW_DEG);

  return [Number(pitchDeg.toFixed(5)), Number(yawDeg.toFixed(5)), 0];
}

/**
 * 카메라 위치 및 광원 문맥에 따라 안구 회전각(`eblt`, `ebrt`)과 하이라이트 오프셋(`ebhp`)을 갱신한다.
 */
export function updateEyeballCameraGaze(
  eyeball: ShaperEyeballData,
  scene: EyeballSceneContext,
): ShaperEyeballData {
  const ebhp = computeEyeballHighlightOffset(eyeball, scene);
  if (!eyeball.fixEyeballCam) {
    return {
      ...eyeball,
      ebhp,
    };
  }

  const eblt = computeSingleEyeLookAtAngles(scene.leftEyePosition, scene.cameraPosition, scene);
  const ebrt = computeSingleEyeLookAtAngles(scene.rightEyePosition, scene.cameraPosition, scene);

  return {
    ...eyeball,
    ebhp,
    eblt,
    ebrt,
  };
}

/**
 * `[Shift]+[Arrow]` 입력에 따른 안구 미세 회전을 적용한다 (대칭/비대칭 모드 지원).
 */
export function nudgeEyeballRotationByArrow(
  eyeball: ShaperEyeballData,
  input: {
    readonly key: EyeballArrowKey;
    readonly shiftKey: boolean;
    readonly targetEye?: "both" | "left" | "right";
    readonly mirrorHorizontalInSymmetry?: boolean;
  },
): ShaperEyeballData {
  const stepDeg = input.shiftKey ? 0.5 : 2.0;
  let deltaPitch = 0;
  let deltaYaw = 0;

  switch (input.key) {
    case "ArrowUp":
      deltaPitch = -stepDeg;
      break;
    case "ArrowDown":
      deltaPitch = stepDeg;
      break;
    case "ArrowLeft":
      deltaYaw = -stepDeg;
      break;
    case "ArrowRight":
      deltaYaw = stepDeg;
      break;
  }

  const target = eyeball.symmetryGaze ? "both" : (input.targetEye ?? "both");
  const mirrorYaw = eyeball.symmetryGaze && (input.mirrorHorizontalInSymmetry ?? false);

  const applyDelta = (angles: ShaperVector3, yawSign: number): ShaperVector3 => [
    clamp(Number((angles[0] + deltaPitch).toFixed(5)), -MAX_EYE_PITCH_DEG, MAX_EYE_PITCH_DEG),
    clamp(
      Number((angles[1] + deltaYaw * yawSign).toFixed(5)),
      -MAX_EYE_YAW_DEG,
      MAX_EYE_YAW_DEG,
    ),
    angles[2],
  ];

  const nextLeft =
    target === "both" || target === "left" ? applyDelta(eyeball.eblt, 1) : eyeball.eblt;
  const nextRight =
    target === "both" || target === "right"
      ? applyDelta(eyeball.ebrt, mirrorYaw ? -1 : 1)
      : eyeball.ebrt;

  return {
    ...eyeball,
    eblt: nextLeft,
    ebrt: nextRight,
  };
}

/**
 * Shaper `BodyPartsManager.FindSamePositionNeckVertices`:
 * 머리(`head`)와 목/바디(`body`) 경계 정점 배열에서 거리 임계값(`epsilon`) 이내의 동일 위치 정점 쌍을 찾는다.
 */
export function findSamePositionNeckVertices(
  headBoundaryVertices: readonly NeckBoundaryVertex[],
  bodyBoundaryVertices: readonly NeckBoundaryVertex[],
  epsilon = 0.002,
): readonly NeckSeamVertexPair[] {
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new ShaperEyeballSeamMaskError(
      "INVALID_SEAM_EPSILON",
      "Seam matching epsilon must be a positive finite number.",
    );
  }

  const matchedBodyIndices = new Set<number>();
  const pairs: NeckSeamVertexPair[] = [];

  for (let hIdx = 0; hIdx < headBoundaryVertices.length; hIdx += 1) {
    const headVert = headBoundaryVertices[hIdx]!;
    let bestBodyArrayIdx = -1;
    let bestDistance = epsilon;

    for (let bIdx = 0; bIdx < bodyBoundaryVertices.length; bIdx += 1) {
      if (matchedBodyIndices.has(bIdx)) continue;
      const bodyVert = bodyBoundaryVertices[bIdx]!;
      const dist = length3(sub3(headVert.position, bodyVert.position));
      if (dist <= bestDistance) {
        bestDistance = dist;
        bestBodyArrayIdx = bIdx;
      }
    }

    if (bestBodyArrayIdx >= 0) {
      matchedBodyIndices.add(bestBodyArrayIdx);
      const bodyVert = bodyBoundaryVertices[bestBodyArrayIdx]!;
      pairs.push({
        headVertexIndex: headVert.vertexIndex,
        bodyVertexIndex: bodyVert.vertexIndex,
        distance: Number(bestDistance.toFixed(7)),
      });
    }
  }

  return pairs;
}

/**
 * Shaper `BodyPartsManager.MergeNeckBlend`:
 * 매칭된 목/바디 경계 정점 쌍의 위치와 법선을 블렌딩 용접하여 서브디비전/모프 시 경계 벌어짐을 방지한다.
 */
export function weldNeckSeamVertices(input: {
  readonly headVertices: readonly NeckBoundaryVertex[];
  readonly bodyVertices: readonly NeckBoundaryVertex[];
  readonly epsilon?: number;
  readonly blendWeight?: number;
}): WeldedNeckSeamResult {
  const epsilon = input.epsilon ?? 0.002;
  const blendWeight = clamp(input.blendWeight ?? 0.5, 0, 1);
  const matchedPairs = findSamePositionNeckVertices(
    input.headVertices,
    input.bodyVertices,
    epsilon,
  );

  const headMap = new Map<number, NeckBoundaryVertex>(
    input.headVertices.map((v) => [v.vertexIndex, v]),
  );
  const bodyMap = new Map<number, NeckBoundaryVertex>(
    input.bodyVertices.map((v) => [v.vertexIndex, v]),
  );

  for (const pair of matchedPairs) {
    const hVert = headMap.get(pair.headVertexIndex);
    const bVert = bodyMap.get(pair.bodyVertexIndex);
    if (!hVert || !bVert) continue;

    const weldedPos = lerp3(hVert.position, bVert.position, blendWeight);
    const weldedNormal = normalize3(lerp3(hVert.normal, bVert.normal, blendWeight), [0, 1, 0]);

    headMap.set(pair.headVertexIndex, {
      ...hVert,
      position: weldedPos,
      normal: weldedNormal,
    });
    bodyMap.set(pair.bodyVertexIndex, {
      ...bVert,
      position: weldedPos,
      normal: weldedNormal,
    });
  }

  return {
    matchedPairs,
    headVertices: input.headVertices.map((v) => headMap.get(v.vertexIndex) ?? v),
    bodyVertices: input.bodyVertices.map((v) => bodyMap.get(v.vertexIndex) ?? v),
  };
}

/**
 * Shaper `CostumeManager` 바디 피부 가림 마스크(`_MaskTex`) 계산:
 * 착용한 상의(`clothTop`), 하의(`clothBottom`), 신발(`shoes`) 조합에 따라
 * 의상 밖으로 뚫고 나올 수 있는 바디 부위를 마스킹(0=숨김, 255=표시)한다.
 */
export function computeBodyOcclusionMask(
  equipped: CostumeEquippedSlotState,
  gridResolution = 16,
): BodyOcclusionMaskResult {
  if (!Number.isInteger(gridResolution) || gridResolution < 4 || gridResolution > 256) {
    throw new ShaperEyeballSeamMaskError(
      "INVALID_MASK_RESOLUTION",
      "gridResolution must be an integer between 4 and 256.",
    );
  }

  const hiddenSet = new Set<BodyMaskRegion>();

  switch (equipped.clothTop) {
    case "sleeveless":
      hiddenSet.add("upperChest");
      hiddenSet.add("lowerTorso");
      break;
    case "shortSleeve":
      hiddenSet.add("upperChest");
      hiddenSet.add("lowerTorso");
      hiddenSet.add("shoulders");
      hiddenSet.add("upperArms");
      break;
    case "longSleeve":
      hiddenSet.add("upperChest");
      hiddenSet.add("lowerTorso");
      hiddenSet.add("shoulders");
      hiddenSet.add("upperArms");
      hiddenSet.add("forearms");
      break;
    case "coat":
      hiddenSet.add("upperChest");
      hiddenSet.add("lowerTorso");
      hiddenSet.add("shoulders");
      hiddenSet.add("upperArms");
      hiddenSet.add("forearms");
      hiddenSet.add("pelvis");
      break;
    case "none":
      break;
  }

  switch (equipped.clothBottom) {
    case "shorts":
    case "skirt":
      hiddenSet.add("pelvis");
      hiddenSet.add("thighs");
      break;
    case "longPants":
      hiddenSet.add("pelvis");
      hiddenSet.add("thighs");
      hiddenSet.add("calves");
      break;
    case "none":
      break;
  }

  switch (equipped.shoes) {
    case "sandals":
      break;
    case "ankletShoes":
      hiddenSet.add("feet");
      break;
    case "kneeBoots":
      hiddenSet.add("feet");
      hiddenSet.add("calves");
      break;
    case "none":
      break;
  }

  const regionVisibility = {} as Record<BodyMaskRegion, 0 | 1>;
  const hiddenRegions: BodyMaskRegion[] = [];
  const visibleRegions: BodyMaskRegion[] = [];

  for (const region of ALL_BODY_MASK_REGIONS) {
    if (hiddenSet.has(region)) {
      regionVisibility[region] = 0;
      hiddenRegions.push(region);
    } else {
      regionVisibility[region] = 1;
      visibleRegions.push(region);
    }
  }

  const maskTexPixels = new Uint8Array(gridResolution * gridResolution);
  maskTexPixels.fill(255);

  for (const region of hiddenRegions) {
    const box = BODY_REGION_UV_BOXES[region];
    const xStart = clamp(Math.floor(box.uMin * gridResolution), 0, gridResolution - 1);
    const xEnd = clamp(Math.ceil(box.uMax * gridResolution), 0, gridResolution);
    const yStart = clamp(Math.floor(box.vMin * gridResolution), 0, gridResolution - 1);
    const yEnd = clamp(Math.ceil(box.vMax * gridResolution), 0, gridResolution);

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        maskTexPixels[y * gridResolution + x] = 0;
      }
    }
  }

  return {
    hiddenRegions,
    visibleRegions,
    regionVisibility,
    maskTextureWidth: gridResolution,
    maskTextureHeight: gridResolution,
    maskTexPixels,
  };
}

function rotateVectorByEulerZYX(vec: ShaperVector3, eulerDeg: ShaperVector3): ShaperVector3 {
  const rx = eulerDeg[0] * DEG_TO_RAD;
  const ry = eulerDeg[1] * DEG_TO_RAD;
  const rz = eulerDeg[2] * DEG_TO_RAD;

  // X rotation
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = vec[1] * cosX - vec[2] * sinX;
  const z1 = vec[1] * sinX + vec[2] * cosX;
  const x1 = vec[0];

  // Y rotation
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x2 = x1 * cosY + z1 * sinY;
  const z2 = -x1 * sinY + z1 * cosY;
  const y2 = y1;

  // Z rotation
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x3 = x2 * cosZ - y2 * sinZ;
  const y3 = x2 * sinZ + y2 * cosZ;
  const z3 = z2;

  return [x3, y3, z3];
}

function inverseRotateVectorByEulerZYX(vec: ShaperVector3, eulerDeg: ShaperVector3): ShaperVector3 {
  const rx = -eulerDeg[0] * DEG_TO_RAD;
  const ry = -eulerDeg[1] * DEG_TO_RAD;
  const rz = -eulerDeg[2] * DEG_TO_RAD;

  // Inverse Z
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x1 = vec[0] * cosZ - vec[1] * sinZ;
  const y1 = vec[0] * sinZ + vec[1] * cosZ;
  const z1 = vec[2];

  // Inverse Y
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x2 = x1 * cosY + z1 * sinY;
  const z2 = -x1 * sinY + z1 * cosY;
  const y2 = y1;

  // Inverse X
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y3 = y2 * cosX - z2 * sinX;
  const z3 = y2 * sinX + z2 * cosX;
  const x3 = x2;

  return [x3, y3, z3];
}

/**
 * Shaper `SetParentBoneByName` 구현:
 * 액세서리의 부모 본을 변경할 때 월드 트랜스폼(위치·회전·스케일)이 그대로 유지되도록
 * 새 부모 본 기준 로컬 오프셋(`px/py/pz`, `rx/ry/rz`, `sx/sy/sz`)을 재계산한다.
 */
export function rebindAccessoryParentBone(
  accessory: ShaperAccessoryAttachment,
  currentParentBone: ShaperBoneWorldTransform,
  nextParentBone: ShaperBoneWorldTransform,
): ShaperAccessoryAttachment {
  if (!nextParentBone.boneName.trim()) {
    throw new ShaperEyeballSeamMaskError(
      "INVALID_BONE_NAME",
      "nextParentBone.boneName must be a non-empty string.",
    );
  }
  if (
    nextParentBone.worldScale.some((s) => !Number.isFinite(s) || Math.abs(s) <= EPSILON)
    || currentParentBone.worldScale.some((s) => !Number.isFinite(s) || Math.abs(s) <= EPSILON)
  ) {
    throw new ShaperEyeballSeamMaskError(
      "INVALID_BONE_SCALE",
      "Bone worldScale components must be non-zero finite numbers.",
    );
  }

  // 1. 현재 부모 본 기준 액세서리의 월드 트랜스폼 복원
  const scaledOffset: ShaperVector3 = [
    accessory.px * currentParentBone.worldScale[0],
    accessory.py * currentParentBone.worldScale[1],
    accessory.pz * currentParentBone.worldScale[2],
  ];
  const rotatedOffset = rotateVectorByEulerZYX(scaledOffset, currentParentBone.worldEulerDeg);
  const worldPosition: ShaperVector3 = [
    currentParentBone.worldPosition[0] + rotatedOffset[0],
    currentParentBone.worldPosition[1] + rotatedOffset[1],
    currentParentBone.worldPosition[2] + rotatedOffset[2],
  ];
  const worldEulerDeg: ShaperVector3 = [
    currentParentBone.worldEulerDeg[0] + accessory.rx,
    currentParentBone.worldEulerDeg[1] + accessory.ry,
    currentParentBone.worldEulerDeg[2] + accessory.rz,
  ];
  const worldScale: ShaperVector3 = [
    currentParentBone.worldScale[0] * accessory.sx,
    currentParentBone.worldScale[1] * accessory.sy,
    currentParentBone.worldScale[2] * accessory.sz,
  ];

  // 2. 새 부모 본의 역변환을 적용하여 새 로컬 오프셋 산출
  const deltaWorldPos = sub3(worldPosition, nextParentBone.worldPosition);
  const unrotatedLocalPos = inverseRotateVectorByEulerZYX(
    deltaWorldPos,
    nextParentBone.worldEulerDeg,
  );
  const nextLocalPos: ShaperVector3 = [
    Number((unrotatedLocalPos[0] / nextParentBone.worldScale[0]).toFixed(6)),
    Number((unrotatedLocalPos[1] / nextParentBone.worldScale[1]).toFixed(6)),
    Number((unrotatedLocalPos[2] / nextParentBone.worldScale[2]).toFixed(6)),
  ];

  const nextLocalRot: ShaperVector3 = [
    wrapAngleDeg(worldEulerDeg[0] - nextParentBone.worldEulerDeg[0]),
    wrapAngleDeg(worldEulerDeg[1] - nextParentBone.worldEulerDeg[1]),
    wrapAngleDeg(worldEulerDeg[2] - nextParentBone.worldEulerDeg[2]),
  ];

  const nextLocalScale: ShaperVector3 = [
    Number((worldScale[0] / nextParentBone.worldScale[0]).toFixed(6)),
    Number((worldScale[1] / nextParentBone.worldScale[1]).toFixed(6)),
    Number((worldScale[2] / nextParentBone.worldScale[2]).toFixed(6)),
  ];

  return {
    accessoryId: accessory.accessoryId, parentBoneName: nextParentBone.boneName,
    px: nextLocalPos[0], py: nextLocalPos[1], pz: nextLocalPos[2],
    rx: nextLocalRot[0], ry: nextLocalRot[1], rz: nextLocalRot[2],
    sx: nextLocalScale[0], sy: nextLocalScale[1], sz: nextLocalScale[2],
  };
}

export interface ShaperThreeZoneSeamAnchors {
  readonly left: ShaperVector3;
  readonly center: ShaperVector3;
  readonly right: ShaperVector3;
}

export interface ShaperThreeZoneSeamAlignmentResult {
  readonly alignedVertices: readonly NeckBoundaryVertex[];
  readonly zoneDeltas: ShaperThreeZoneSeamAnchors;
  readonly zoneCounts: { readonly left: number; readonly center: number; readonly right: number };
}

/**
 * `HeadPartsManager::SmoothNormals` (`0x060001f0..0x060001f3`) 명세:
 * X축 임계값(`X < -0.5` 좌측, `-0.5 <= X <= 0.5` 중앙, `X > 0.5` 우측) 기준 3구역 심 무게중심을
 * 목표 앵커(`seam_L`, `seam_C`, `seam_R`)에 정렬한다.
 */
export function alignThreeZoneHeadSeamCentroids(
  vertices: readonly NeckBoundaryVertex[],
  anchors: ShaperThreeZoneSeamAnchors,
  xThreshold = 0.5,
): ShaperThreeZoneSeamAlignmentResult {
  const buckets: Record<"left" | "center" | "right", NeckBoundaryVertex[]> = { left: [], center: [], right: [] };
  for (const v of vertices) {
    if (v.position[0] < -xThreshold) buckets.left.push(v);
    else if (v.position[0] > xThreshold) buckets.right.push(v);
    else buckets.center.push(v);
  }
  const computeDelta = (list: readonly NeckBoundaryVertex[], target: ShaperVector3): ShaperVector3 => {
    if (list.length === 0) return [0, 0, 0];
    let sx = 0, sy = 0, sz = 0;
    for (const item of list) { sx += item.position[0]; sy += item.position[1]; sz += item.position[2]; }
    const n = list.length;
    return [Number((target[0] - sx / n).toFixed(6)), Number((target[1] - sy / n).toFixed(6)), Number((target[2] - sz / n).toFixed(6))];
  };
  const zoneDeltas: ShaperThreeZoneSeamAnchors = {
    left: computeDelta(buckets.left, anchors.left),
    center: computeDelta(buckets.center, anchors.center),
    right: computeDelta(buckets.right, anchors.right),
  };
  const alignedVertices = vertices.map((v) => {
    const d = v.position[0] < -xThreshold ? zoneDeltas.left : v.position[0] > xThreshold ? zoneDeltas.right : zoneDeltas.center;
    return {
      ...v,
      position: [Number((v.position[0] + d[0]).toFixed(6)), Number((v.position[1] + d[1]).toFixed(6)), Number((v.position[2] + d[2]).toFixed(6))] as const,
    };
  });
  return {
    alignedVertices, zoneDeltas,
    zoneCounts: { left: buckets.left.length, center: buckets.center.length, right: buckets.right.length },
  };
}

/**
 * `LightManager::UpdateLightColor` (`0x06000210`) 명세:
 * 3차(Cubic) MatCap 램프 `125 * (1 - w)^3` 강도와 정규화 게인을 계산한다.
 */
export function computeShaperCubicMatCapIntensity(weight: number): {
  readonly clampedWeight: number;
  readonly normalizedGain: number;
  readonly rawIntensity: number;
} {
  const clampedWeight = clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  const inv = 1 - clampedWeight;
  const normalizedGain = Number((inv * inv * inv).toFixed(6));
  return {
    clampedWeight,
    normalizedGain,
    rawIntensity: Number((125 * normalizedGain).toFixed(6)),
  };
}

/**
 * `CustomToonOutline.shader` 명세:
 * 비등방성 외곽선 스케일(`1.5 × 0.3 = 0.45`) 및 정점 컬러 채널(`G` 곡률 가중치, `B` 심 억제)을 반영한
 * 법선 돌출 오프셋을 계산한다.
 */
export function computeShaperAnisotropicOutlineOffset(input: {
  readonly normal: ShaperVector3;
  readonly outlineThickness: number;
  readonly curvatureWeightG?: number;
  readonly seamSuppressionB?: number;
}): { readonly offset: ShaperVector3; readonly effectiveScale: number } {
  const unitNormal = normalize3(input.normal, [0, 0, 1]);
  const gWeight = clamp(input.curvatureWeightG ?? 1, 0, 1);
  const bSuppress = clamp(input.seamSuppressionB ?? 1, 0, 1);
  const effectiveScale = Number((Math.max(0, input.outlineThickness) * 1.5 * 0.3 * gWeight * bSuppress).toFixed(6));
  return {
    offset: [
      Number((unitNormal[0] * effectiveScale).toFixed(6)),
      Number((unitNormal[1] * effectiveScale).toFixed(6)),
      Number((unitNormal[2] * effectiveScale).toFixed(6)),
    ],
    effectiveScale,
  };
}
