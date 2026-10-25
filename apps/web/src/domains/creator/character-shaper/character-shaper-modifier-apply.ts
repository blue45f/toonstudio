/**
 * Character Shaper — SHAPER v1.05 모디파이어 기반 파츠/포즈/카메라 프리셋 적용 엔진.
 *
 * `Assembly-CSharp.dll` (`DataLoader.LoadPartPresetData`, `BoneManager`, `user_strings`
 * `0x700001e3..0x700012af`)에서 역공학으로 확인된 키보드 조합 프리셋 적용 규칙을
 * 순수 함수 및 불변 상태 전이 계약으로 구현한다.
 */

import type {
  ShaperBoneTransform,
  ShaperCameraTransform,
  ShaperEyeballData,
  ShaperLinePointPreset,
  ShaperLinePreset,
  ShaperNativePresetDocument,
  ShaperVector3,
} from "./character-shaper-native-preset-codec";

export const SHAPER_MODIFIER_LABELS = {
  omitPresetLines: "펜선 제외하고 불러오기 [Alt]+[Click]",
  preserveTargetLines: "적용 대상의 펜선 유지하기 [Shift]+[Click]",
  mirrorPose: "포즈를 대칭으로 가져옵니다 [Alt]+[Click]",
  excludeCamera: "카메라 각도를 제외하고 포즈만 가져옵니다 [Shift]+[Click]",
  cameraOnly: "포즈를 제외하고 카메라 각도만 가져옵니다 [Ctrl]+[Click]",
} as const;

export interface ShaperPartPresetModifiers {
  /** `[Alt]+[Click]` — 프리셋에 저장된 3D 펜선을 제외하고 메쉬/헤어/안구 변형만 적용. */
  readonly omitPresetLines?: boolean;
  /** `[Shift]+[Click]` — 대상 파츠에 이미 그려진 기존 서피스 펜선을 삭제하지 않고 보존(재투영). */
  readonly preserveTargetLines?: boolean;
}

export type ShaperHandPoseApplyMode = "both" | "leftOnly" | "rightOnly" | "mirrorHands";

export interface ShaperPosePresetModifiers {
  /** `[Alt]+[Click]` — 좌/우 본, 심(seam), 안구 회전을 스왑하고 X축 대칭 반전하여 적용. */
  readonly mirrorPose?: boolean;
  /** `[Shift]+[Click]` — 현재 뷰포트 카메라를 유지하고 본 포즈만 적용. */
  readonly excludeCamera?: boolean;
  /** `[Ctrl]+[Click]` — 현재 본 포즈를 유지하고 프리셋의 카메라 각도/화각만 적용. */
  readonly cameraOnly?: boolean;
  /** 손 포즈(`handPose`) 전용 적용 범위 (`both` | `leftOnly` | `rightOnly` | `mirrorHands`). */
  readonly handMode?: ShaperHandPoseApplyMode;
}

export interface ShaperAppliedSurfaceLine extends ShaperLinePreset {
  readonly source: "target-preserved" | "preset";
  readonly reprojectedToNewMesh: boolean;
}

export interface ShaperPartPresetApplyResult {
  readonly document: ShaperNativePresetDocument;
  readonly appliedLines: readonly ShaperAppliedSurfaceLine[];
  readonly preservedTargetLineCount: number;
  readonly importedPresetLineCount: number;
  readonly reprojectedLineCount: number;
  readonly activeDescriptions: readonly string[];
}

export interface ShaperPoseSceneState {
  readonly bones: readonly ShaperBoneTransform[];
  readonly camera: ShaperCameraTransform | null;
  readonly seams?: {
    readonly center?: ShaperVector3;
    readonly left?: ShaperVector3;
    readonly right?: ShaperVector3;
  };
  readonly eyeball?: ShaperEyeballData | null;
}

export interface ShaperPosePresetApplyResult {
  readonly state: ShaperPoseSceneState;
  readonly appliedBoneCount: number;
  readonly cameraUpdated: boolean;
  readonly mirrored: boolean;
  readonly handMode: ShaperHandPoseApplyMode;
  readonly activeDescriptions: readonly string[];
}

export function resolveShaperPartModifierFromInput(input: {
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}): ShaperPartPresetModifiers {
  return {
    omitPresetLines: Boolean(input.altKey),
    preserveTargetLines: Boolean(input.shiftKey),
  };
}

export function resolveShaperPoseModifierFromInput(input: {
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly handMode?: ShaperHandPoseApplyMode;
}): ShaperPosePresetModifiers {
  const cameraOnly = Boolean(input.ctrlKey || input.metaKey);
  return {
    mirrorPose: Boolean(input.altKey),
    excludeCamera: cameraOnly ? false : Boolean(input.shiftKey),
    cameraOnly,
    handMode: input.handMode ?? "both",
  };
}

function reprojectLineToTargetMesh(
  line: ShaperLinePreset,
  newBaseMeshId: string | null,
): ShaperAppliedSurfaceLine {
  const points: ShaperLinePointPreset[] = line.points.map((pt) => ({
    ...pt,
    partBaseMeshId: newBaseMeshId ?? pt.partBaseMeshId,
  }));
  return {
    ...line,
    points,
    source: "target-preserved",
    reprojectedToNewMesh: true,
  };
}

/**
 * 파츠 프리셋(`head`, `eyes`, `nose`, `mouth`, `ears`, `neck`, `hair`, `body`, `clothTop`, `clothBottom`, `shoes`, `acc`)을
 * Shaper 키보드 모디파이어 규칙(`[Alt]`, `[Shift]`, `[Alt]+[Shift]`)에 따라 대상 파츠 상태에 적용한다.
 */
export function applyShaperPartPresetWithModifiers(
  targetDoc: ShaperNativePresetDocument,
  presetDoc: ShaperNativePresetDocument,
  modifiers: ShaperPartPresetModifiers = {},
): ShaperPartPresetApplyResult {
  const omitPresetLines = Boolean(modifiers.omitPresetLines);
  const preserveTargetLines = Boolean(modifiers.preserveTargetLines);
  const activeDescriptions: string[] = [];

  if (omitPresetLines) {
    activeDescriptions.push(SHAPER_MODIFIER_LABELS.omitPresetLines);
  }
  if (preserveTargetLines) {
    activeDescriptions.push(SHAPER_MODIFIER_LABELS.preserveTargetLines);
  }

  const preservedLines: ShaperAppliedSurfaceLine[] = preserveTargetLines
    ? targetDoc.lines.map((line) => reprojectLineToTargetMesh(line, presetDoc.baseMeshId ?? targetDoc.baseMeshId))
    : [];

  const importedLines: ShaperAppliedSurfaceLine[] = omitPresetLines
    ? []
    : presetDoc.lines.map((line) => ({
        ...line,
        source: "preset" as const,
        reprojectedToNewMesh: false,
      }));

  const appliedLines = [...preservedLines, ...importedLines];
  const mergedRawLines: ShaperLinePreset[] = appliedLines.map(
    ({ source: _source, reprojectedToNewMesh: _reprojected, ...raw }) => raw,
  );

  const mergedDocument: ShaperNativePresetDocument = {
    ...presetDoc,
    partType: presetDoc.partType,
    baseMeshId: presetDoc.baseMeshId ?? targetDoc.baseMeshId,
    lines: mergedRawLines,
  };

  return {
    document: mergedDocument,
    appliedLines,
    preservedTargetLineCount: preservedLines.length,
    importedPresetLineCount: importedLines.length,
    reprojectedLineCount: preservedLines.length,
    activeDescriptions,
  };
}

export function swapLeftRightBoneName(boneName: string): string {
  if (/Left/u.test(boneName)) return boneName.replace(/Left/gu, "Right");
  if (/Right/u.test(boneName)) return boneName.replace(/Right/gu, "Left");
  if (/left/u.test(boneName)) return boneName.replace(/left/gu, "right");
  if (/right/u.test(boneName)) return boneName.replace(/right/gu, "left");
  if (/([_.-])L($|[_.-])/u.test(boneName)) return boneName.replace(/([_.-])L($|[_.-])/u, "$1R$2");
  if (/([_.-])R($|[_.-])/u.test(boneName)) return boneName.replace(/([_.-])R($|[_.-])/u, "$1L$2");
  if (/^L([A-Z])/u.test(boneName)) return boneName.replace(/^L([A-Z])/u, "R$1");
  if (/^R([A-Z])/u.test(boneName)) return boneName.replace(/^R([A-Z])/u, "L$1");
  if (boneName === "L") return "R";
  if (boneName === "R") return "L";
  return boneName;
}

export function detectBoneSide(boneName: string): "left" | "right" | "center" {
  if (/left|([_.-])l($|[_.-])|^L[A-Z]|^L$/iu.test(boneName)) return "left";
  if (/right|([_.-])r($|[_.-])|^R[A-Z]|^R$/iu.test(boneName)) return "right";
  return "center";
}

function negZeroSafe(n: number): number {
  return Object.is(n, -0) || n === 0 ? 0 : n;
}

export function mirrorPositionX(v: ShaperVector3): ShaperVector3 {
  return {
    x: negZeroSafe(-v.x),
    y: v.y,
    z: v.z,
  };
}

export function mirrorEulerRotationX(rot: ShaperVector3): ShaperVector3 {
  return {
    x: rot.x,
    y: negZeroSafe(-rot.y),
    z: negZeroSafe(-rot.z),
  };
}

export function mirrorBoneTransformList(
  bones: readonly ShaperBoneTransform[],
): readonly ShaperBoneTransform[] {
  return bones.map((bone) => ({
    boneName: swapLeftRightBoneName(bone.boneName),
    ...(bone.position ? { position: mirrorPositionX(bone.position) } : {}),
    ...(bone.rotation ? { rotation: mirrorEulerRotationX(bone.rotation) } : {}),
    ...(bone.scale ? { scale: { ...bone.scale } } : {}),
  }));
}

function mirrorSeams(
  seams: {
    readonly center?: ShaperVector3;
    readonly left?: ShaperVector3;
    readonly right?: ShaperVector3;
  } | undefined,
): {
  readonly center?: ShaperVector3;
  readonly left?: ShaperVector3;
  readonly right?: ShaperVector3;
} | undefined {
  if (!seams) return undefined;
  return {
    ...(seams.center ? { center: mirrorPositionX(seams.center) } : {}),
    ...(seams.right ? { left: mirrorPositionX(seams.right) } : {}),
    ...(seams.left ? { right: mirrorPositionX(seams.left) } : {}),
  };
}

function mirrorEyeball(eyeball: ShaperEyeballData | null | undefined): ShaperEyeballData | null | undefined {
  if (!eyeball) return eyeball;
  return {
    ...eyeball,
    ...(eyeball.rightEyeRotation
      ? { leftEyeRotation: mirrorEulerRotationX(eyeball.rightEyeRotation) }
      : {}),
    ...(eyeball.leftEyeRotation
      ? { rightEyeRotation: mirrorEulerRotationX(eyeball.leftEyeRotation) }
      : {}),
    ...(eyeball.highlightPosition
      ? {
          highlightPosition: {
            x: negZeroSafe(-eyeball.highlightPosition.x),
            y: eyeball.highlightPosition.y,
          },
        }
      : {}),
  };
}

function mirrorCamera(camera: ShaperCameraTransform): ShaperCameraTransform {
  return {
    ...(camera.position ? { position: mirrorPositionX(camera.position) } : {}),
    ...(camera.rotation ? { rotation: mirrorEulerRotationX(camera.rotation) } : {}),
    ...(camera.fov !== undefined ? { fov: camera.fov } : {}),
  };
}

function mergeBonesBySide(
  currentBones: readonly ShaperBoneTransform[],
  incomingBones: readonly ShaperBoneTransform[],
  sideFilter: "left" | "right" | "both",
): readonly ShaperBoneTransform[] {
  if (sideFilter === "both") {
    const incomingMap = new Map(incomingBones.map((b) => [b.boneName, b]));
    const updated = currentBones.map((existing) => incomingMap.get(existing.boneName) ?? existing);
    const existingNames = new Set(currentBones.map((b) => b.boneName));
    for (const incoming of incomingBones) {
      if (!existingNames.has(incoming.boneName)) {
        updated.push(incoming);
      }
    }
    return updated;
  }

  const filteredIncoming = incomingBones.filter((b) => detectBoneSide(b.boneName) === sideFilter);
  const incomingMap = new Map(filteredIncoming.map((b) => [b.boneName, b]));
  const updated = currentBones.map((existing) => incomingMap.get(existing.boneName) ?? existing);
  const existingNames = new Set(currentBones.map((b) => b.boneName));
  for (const incoming of filteredIncoming) {
    if (!existingNames.has(incoming.boneName)) {
      updated.push(incoming);
    }
  }
  return updated;
}

/**
 * 포즈(`pose`) 및 손 포즈(`handPose`) 프리셋을 Shaper 키보드 모디파이어 규칙
 * (`[Alt]` 좌우 대칭, `[Shift]` 카메라 제외, `[Ctrl]` 카메라만 적용, 손 포즈 좌/우 선택)에 따라 적용한다.
 */
export function applyShaperPosePresetWithModifiers(
  currentState: ShaperPoseSceneState,
  presetDoc: ShaperNativePresetDocument,
  modifiers: ShaperPosePresetModifiers = {},
): ShaperPosePresetApplyResult {
  const handMode: ShaperHandPoseApplyMode = modifiers.handMode ?? "both";
  const mirrorRequested = Boolean(modifiers.mirrorPose) || handMode === "mirrorHands";
  const cameraOnly = Boolean(modifiers.cameraOnly);
  const excludeCamera = cameraOnly ? false : Boolean(modifiers.excludeCamera);

  const activeDescriptions: string[] = [];
  if (mirrorRequested) activeDescriptions.push(SHAPER_MODIFIER_LABELS.mirrorPose);
  if (excludeCamera) activeDescriptions.push(SHAPER_MODIFIER_LABELS.excludeCamera);
  if (cameraOnly) activeDescriptions.push(SHAPER_MODIFIER_LABELS.cameraOnly);

  if (cameraOnly) {
    const nextCamera = presetDoc.camera
      ? mirrorRequested
        ? mirrorCamera(presetDoc.camera)
        : presetDoc.camera
      : currentState.camera;
    return {
      state: {
        ...currentState,
        camera: nextCamera,
      },
      appliedBoneCount: 0,
      cameraUpdated: presetDoc.camera !== null,
      mirrored: mirrorRequested,
      handMode,
      activeDescriptions,
    };
  }

  const candidateBones = mirrorRequested
    ? mirrorBoneTransformList(presetDoc.bones)
    : presetDoc.bones;

  const sideFilter: "left" | "right" | "both" =
    presetDoc.partType === "handPose"
      ? handMode === "leftOnly"
        ? "left"
        : handMode === "rightOnly"
          ? "right"
          : "both"
      : "both";

  const nextBones = mergeBonesBySide(currentState.bones, candidateBones, sideFilter);
  const appliedBoneCount =
    sideFilter === "both"
      ? candidateBones.length
      : candidateBones.filter((b) => detectBoneSide(b.boneName) === sideFilter).length;

  const hasPresetSeams =
    Boolean(presetDoc.seams.center) ||
    Boolean(presetDoc.seams.left) ||
    Boolean(presetDoc.seams.right);
  const nextSeams = hasPresetSeams
    ? mirrorRequested
      ? mirrorSeams(presetDoc.seams)
      : presetDoc.seams
    : currentState.seams;

  const nextEyeball = presetDoc.eyeball
    ? mirrorRequested
      ? mirrorEyeball(presetDoc.eyeball)
      : presetDoc.eyeball
    : currentState.eyeball;

  const shouldUpdateCamera = !excludeCamera && presetDoc.camera !== null;
  const nextCamera = shouldUpdateCamera && presetDoc.camera
    ? mirrorRequested
      ? mirrorCamera(presetDoc.camera)
      : presetDoc.camera
    : currentState.camera;

  return {
    state: {
      bones: nextBones,
      camera: nextCamera,
      ...(nextSeams !== undefined ? { seams: nextSeams } : {}),
      ...(nextEyeball !== undefined ? { eyeball: nextEyeball } : {}),
    },
    appliedBoneCount,
    cameraUpdated: shouldUpdateCamera,
    mirrored: mirrorRequested,
    handMode,
    activeDescriptions,
  };
}
