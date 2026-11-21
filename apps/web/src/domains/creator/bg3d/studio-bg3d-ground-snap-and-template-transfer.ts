/**
 * BG3D 즉시 지면 접지(단축키 X), 워크→컷 카메라 적용(단축키 S),
 * 그리고 3D 템플릿 로드 시 내 캐릭터 외형(mesh/hair/outfit/color)을 100% 유지한 채
 * 포즈·표정·시선·월드 좌표만 전이하는 리타게팅 엔진.
 */

export type StagingVec3 = readonly [number, number, number];
export type StagingQuat = readonly [number, number, number, number];

export type Bg3dStagingShortcutAction = "ground-snap" | "apply-work-to-cut-camera";

export interface Bg3dShortcutKeyEventLike {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly isEditableTarget?: boolean;
}

/**
 * BG3D 뷰포트 단축키를 해석한다.
 * - `X`: 선택 캐릭터/소품 즉시 지면 접지
 * - `S`: 현재 워크 카메라를 활성 컷 카메라에 적용
 * 텍스트 입력 중이거나 Ctrl/Meta/Alt 조합 키가 눌린 경우 가로채지 않는다.
 */
export function resolveBg3dStagingShortcut(
  event: Bg3dShortcutKeyEventLike,
): Bg3dStagingShortcutAction | null {
  if (event.isEditableTarget || event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const normalized = event.key.trim().toLowerCase();
  if (normalized === "x" && !event.shiftKey) return "ground-snap";
  if (normalized === "s" && !event.shiftKey) return "apply-work-to-cut-camera";
  return null;
}

// ---------------------------------------------------------------------------
// 1) 단축키 X — 스키닝 AABB / 바닥 레이캐스트 즉시 지면 접지
// ---------------------------------------------------------------------------

export interface GroundSnapBoundsLike {
  readonly min: StagingVec3;
  readonly max: StagingVec3;
}

export interface GroundSnapInput {
  readonly currentPosition: StagingVec3;
  /** 스키닝 변형이 반영된 월드 AABB(최우선 측정 근거). */
  readonly skinnedWorldBounds?: GroundSnapBoundsLike | null;
  /** 발 본 월드 Y 좌표 목록(스키닝 AABB가 없을 때 대체 근거). */
  readonly footBoneWorldYs?: readonly number[];
  /** 발 본에서 신발 밑창까지의 수직 두께(m). 기본값 0.08m. */
  readonly soleThicknessM?: number;
  /** 바닥 지형/계단/옥상 슬래브를 향한 하향 레이캐스트 콜백. */
  readonly raycastGroundY?: (x: number, z: number, fromY: number) => number | null;
  /** 레이캐스트 적중이 없을 때 사용할 기본 지면 높이(m). 기본값 0. */
  readonly defaultGroundY?: number;
  /** 원치 않는 천장 적중을 피하기 위한 레이 시작 높이 여유(m). 기본값 0.5m. */
  readonly rayStartOffsetM?: number;
}

export interface GroundSnapResult {
  readonly previousPosition: StagingVec3;
  readonly nextPosition: StagingVec3;
  readonly deltaY: number;
  readonly targetGroundY: number;
  readonly measuredMinYBefore: number;
  readonly groundSource: "raycast" | "default-plane";
  readonly boundsSource: "skinned-aabb" | "foot-bones" | "origin-fallback";
  readonly snapped: boolean;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * 스키닝 AABB 최하단(또는 발 본 + 밑창 오프셋)과 하향 레이캐스트 지면 높이를 비교해
 * 캐릭터·소품이 바닥에 0mm 틈으로 접지되도록 수직 이동량을 계산한다.
 */
export function computeGroundSnapTransform(input: GroundSnapInput): GroundSnapResult {
  const [x, y, z] = input.currentPosition;
  const defaultGroundY = Number.isFinite(input.defaultGroundY) ? (input.defaultGroundY as number) : 0;
  const soleThickness = Number.isFinite(input.soleThicknessM) ? Math.max(0, input.soleThicknessM as number) : 0.08;
  const rayOffset = Number.isFinite(input.rayStartOffsetM) ? Math.max(0.05, input.rayStartOffsetM as number) : 0.5;

  let measuredMinY = y;
  let boundsSource: GroundSnapResult["boundsSource"] = "origin-fallback";

  if (
    input.skinnedWorldBounds
    && Number.isFinite(input.skinnedWorldBounds.min[1])
    && Number.isFinite(input.skinnedWorldBounds.max[1])
    && input.skinnedWorldBounds.max[1] >= input.skinnedWorldBounds.min[1]
  ) {
    measuredMinY = input.skinnedWorldBounds.min[1];
    boundsSource = "skinned-aabb";
  } else if (input.footBoneWorldYs && input.footBoneWorldYs.length > 0) {
    const validYs = input.footBoneWorldYs.filter(Number.isFinite);
    if (validYs.length > 0) {
      measuredMinY = Math.min(...validYs) - soleThickness;
      boundsSource = "foot-bones";
    }
  }

  let targetGroundY = defaultGroundY;
  let groundSource: GroundSnapResult["groundSource"] = "default-plane";
  if (input.raycastGroundY) {
    const rayStartY = Math.max(y, measuredMinY) + rayOffset;
    const hitY = input.raycastGroundY(x, z, rayStartY);
    if (typeof hitY === "number" && Number.isFinite(hitY)) {
      targetGroundY = hitY;
      groundSource = "raycast";
    }
  }

  const deltaY = round4(targetGroundY - measuredMinY);
  const nextY = round4(y + deltaY);

  return {
    previousPosition: [x, y, z],
    nextPosition: [x, nextY, z],
    deltaY,
    targetGroundY: round4(targetGroundY),
    measuredMinYBefore: round4(measuredMinY),
    groundSource,
    boundsSource,
    snapped: Math.abs(deltaY) > 1e-6,
  };
}

// ---------------------------------------------------------------------------
// 2) 단축키 S — 워크 카메라 → 활성 컷 카메라 적용
// ---------------------------------------------------------------------------

export interface StudioBg3dCameraPoseState {
  readonly position: StagingVec3;
  readonly target: StagingVec3;
  readonly fovDegrees: number;
  readonly focalLengthMm?: number;
  readonly rollDeg?: number;
  readonly near?: number;
  readonly far?: number;
}

export interface WorkToCutCameraTransferResult {
  readonly cutId: string;
  readonly previousCutCamera: StudioBg3dCameraPoseState;
  readonly nextCutCamera: StudioBg3dCameraPoseState;
  readonly focalLengthMm: number;
  readonly summaryKo: string;
}

const SENSOR_HEIGHT_MM = 24;

export function verticalFovToFocalLengthMm(fovDegrees: number): number {
  const clampedFov = Math.max(5, Math.min(140, Number.isFinite(fovDegrees) ? fovDegrees : 45));
  const rad = (clampedFov * Math.PI) / 180;
  return Math.round((SENSOR_HEIGHT_MM / (2 * Math.tan(rad / 2))) * 10) / 10;
}

export function applyWorkCameraToCutCamera(input: {
  readonly cutId: string;
  readonly workCamera: StudioBg3dCameraPoseState;
  readonly currentCutCamera: StudioBg3dCameraPoseState;
}): WorkToCutCameraTransferResult {
  const fovDegrees = Math.max(5, Math.min(140, input.workCamera.fovDegrees));
  const focalLengthMm = input.workCamera.focalLengthMm ?? verticalFovToFocalLengthMm(fovDegrees);

  const nextCutCamera: StudioBg3dCameraPoseState = {
    position: [...input.workCamera.position],
    target: [...input.workCamera.target],
    fovDegrees,
    focalLengthMm,
    rollDeg: input.workCamera.rollDeg ?? 0,
    near: input.workCamera.near ?? input.currentCutCamera.near ?? 0.05,
    far: input.workCamera.far ?? input.currentCutCamera.far ?? 250,
  };

  return {
    cutId: input.cutId,
    previousCutCamera: {
      ...input.currentCutCamera,
      position: [...input.currentCutCamera.position],
      target: [...input.currentCutCamera.target],
    },
    nextCutCamera,
    focalLengthMm,
    summaryKo: `워크 카메라(${focalLengthMm}mm)를 컷 "${input.cutId}"에 적용했습니다.`,
  };
}

// ---------------------------------------------------------------------------
// 3) 3D 템플릿 로드 시 외형 보존 + 포즈·표정·시선·월드 좌표 전이
// ---------------------------------------------------------------------------

export interface CharacterAppearanceIdentity {
  readonly characterId: string;
  readonly displayName: string;
  readonly assetUrl: string;
  readonly hairPresetId: string;
  readonly outfitSlots: Readonly<Record<string, string | null>>;
  readonly colors: Readonly<Record<string, string>>;
  readonly bodyProportions?: Readonly<Record<string, number>>;
  readonly materialOverrides?: Readonly<Record<string, unknown>>;
  /** 캐릭터 기본 신장(m). 미지정 시 1.65m. */
  readonly heightM?: number;
  /** 골반(Hips) 기본 높이(m). 앉기/무릎꿇기 리타게팅 스케일에 사용. */
  readonly restHipsHeightM?: number;
  /** 타깃 리그가 지원하는 휴머노이드 본 목록(미지정 시 모든 본 허용). */
  readonly supportedBones?: readonly string[];
}

export interface CharacterPerformanceState {
  readonly worldPosition: StagingVec3;
  readonly worldRotationEulerDeg: StagingVec3;
  /** 휴머노이드 정규화 본 회전(쿼터니언 [x,y,z,w] 또는 오일러 도 [x,y,z]). */
  readonly boneRotations: Readonly<Record<string, StagingQuat | StagingVec3>>;
  /** 루트 Hips 로컬 이동 오프셋(m). 앉기·웅크리기 높이 반영. */
  readonly hipsTranslationM?: StagingVec3;
  /** 표정 블렌드 가중치(0..1). VRM 0.x 별칭은 1.0 표준으로 자동 정규화. */
  readonly expressionWeights: Readonly<Record<string, number>>;
  readonly lookAt?: {
    readonly mode: "target" | "angles" | "camera";
    readonly targetWorldPosition?: StagingVec3;
    readonly yawDeg?: number;
    readonly pitchDeg?: number;
  };
  readonly handPose?: {
    readonly leftPresetId: string | null;
    readonly rightPresetId: string | null;
  };
}

export interface CharacterInstanceRecord {
  readonly appearance: CharacterAppearanceIdentity;
  readonly performance: CharacterPerformanceState;
}

export interface TemplateActorSlotSpec {
  readonly slotId: string;
  readonly labelKo: string;
  /** 템플릿 제작 기준 액터의 신장(m). */
  readonly referenceHeightM?: number;
  /** 템플릿 제작 기준 액터의 골반 높이(m). */
  readonly referenceHipsHeightM?: number;
  readonly performance: CharacterPerformanceState;
}

export interface TemplateTransferOptions {
  readonly transferWorldTransform?: boolean;
  readonly transferPose?: boolean;
  readonly transferExpression?: boolean;
  readonly transferLookAt?: boolean;
  readonly transferHandPose?: boolean;
  /** 캐릭터 키 차이에 맞춰 Hips 수직 오프셋을 비례 보정할지 여부. 기본값 true. */
  readonly retargetHipsByHeight?: boolean;
  /** 전이 후 지면 높이에 자동 스냅할지 여부. 기본값 true. */
  readonly snapToGroundAfterTransfer?: boolean;
  readonly raycastGroundY?: (x: number, z: number, fromY: number) => number | null;
}

export interface TemplateTransferResult {
  readonly character: CharacterInstanceRecord;
  readonly preservedAppearanceKeys: readonly string[];
  readonly transferredChannels: readonly string[];
  readonly skippedBones: readonly string[];
  readonly remappedExpressions: Readonly<Record<string, string>>;
  readonly hipsHeightScaleApplied: number;
  readonly groundSnap: GroundSnapResult | null;
}

/** VRM 0.x 레거시 표정 키 → VRM 1.0 정규 키 매핑(`vrm-avatar-authoring` 규약). */
const VRM0_TO_VRM1_EXPRESSION_MAP: Readonly<Record<string, string>> = Object.freeze({
  a: "aa",
  i: "ih",
  u: "ou",
  e: "ee",
  o: "oh",
  joy: "happy",
  fun: "relaxed",
  sorrow: "sad",
  blink_l: "blinkLeft",
  blink_r: "blinkRight",
});

function normalizeExpressionWeights(
  weights: Readonly<Record<string, number>>,
): { readonly normalized: Record<string, number>; readonly remapped: Record<string, string> } {
  const normalized: Record<string, number> = {};
  const remapped: Record<string, string> = {};

  for (const [rawKey, rawVal] of Object.entries(weights)) {
    if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) continue;
    const clamped = Math.max(0, Math.min(1, rawVal));
    const lower = rawKey.toLowerCase();
    const mappedKey = VRM0_TO_VRM1_EXPRESSION_MAP[lower] ?? rawKey;
    if (mappedKey !== rawKey) {
      remapped[rawKey] = mappedKey;
    }
    normalized[mappedKey] = Math.max(normalized[mappedKey] ?? 0, clamped);
  }

  return { normalized, remapped };
}

/**
 * 3D 컷 템플릿의 액터 슬롯에서 포즈·표정·시선·손포즈·월드 좌표만 추출해
 * 사용자의 기존 캐릭터에 전이한다. 사용자의 외형(`appearance`: 메시·헤어·의상·색상·체형)은
 * 한 바이트도 변경하지 않고 그대로 보존한다.
 */
export function transferTemplateStagingToCharacter(
  userCharacter: CharacterInstanceRecord,
  templateSlot: TemplateActorSlotSpec,
  options: TemplateTransferOptions = {},
): TemplateTransferResult {
  const transferWorldTransform = options.transferWorldTransform ?? true;
  const transferPose = options.transferPose ?? true;
  const transferExpression = options.transferExpression ?? true;
  const transferLookAt = options.transferLookAt ?? true;
  const transferHandPose = options.transferHandPose ?? true;
  const retargetHipsByHeight = options.retargetHipsByHeight ?? true;
  const snapToGroundAfterTransfer = options.snapToGroundAfterTransfer ?? true;

  const transferredChannels: string[] = [];
  const skippedBones: string[] = [];
  let remappedExpressions: Record<string, string> = {};

  // 1) 외형은 불변 깊은 복사로 100% 보존
  const preservedAppearance: CharacterAppearanceIdentity = {
    ...userCharacter.appearance,
    outfitSlots: { ...userCharacter.appearance.outfitSlots },
    colors: { ...userCharacter.appearance.colors },
    ...(userCharacter.appearance.bodyProportions
      ? { bodyProportions: { ...userCharacter.appearance.bodyProportions } }
      : {}),
    ...(userCharacter.appearance.materialOverrides
      ? { materialOverrides: { ...userCharacter.appearance.materialOverrides } }
      : {}),
  };

  // 2) 월드 위치/회전 전이
  let nextWorldPosition: StagingVec3 = transferWorldTransform
    ? [...templateSlot.performance.worldPosition]
    : [...userCharacter.performance.worldPosition];
  const nextWorldRotation: StagingVec3 = transferWorldTransform
    ? [...templateSlot.performance.worldRotationEulerDeg]
    : [...userCharacter.performance.worldRotationEulerDeg];
  if (transferWorldTransform) transferredChannels.push("worldTransform");

  // 3) 본 포즈 및 신장 비례 Hips 오프셋 리타게팅
  const userHipsH = userCharacter.appearance.restHipsHeightM
    ?? ((userCharacter.appearance.heightM ?? 1.65) * 0.53);
  const templateHipsH = templateSlot.referenceHipsHeightM
    ?? ((templateSlot.referenceHeightM ?? 1.65) * 0.53);
  const hipsHeightScale = retargetHipsByHeight && templateHipsH > 0.1
    ? round4(userHipsH / templateHipsH)
    : 1;

  let nextBoneRotations: Record<string, StagingQuat | StagingVec3> = {
    ...userCharacter.performance.boneRotations,
  };
  let nextHipsTranslation = userCharacter.performance.hipsTranslationM;

  if (transferPose) {
    const allowedBones = userCharacter.appearance.supportedBones
      ? new Set(userCharacter.appearance.supportedBones)
      : null;
    nextBoneRotations = {};
    for (const [boneName, rot] of Object.entries(templateSlot.performance.boneRotations)) {
      if (allowedBones && !allowedBones.has(boneName)) {
        skippedBones.push(boneName);
        continue;
      }
      nextBoneRotations[boneName] = [...rot] as StagingQuat | StagingVec3;
    }
    if (templateSlot.performance.hipsTranslationM) {
      const [hx, hy, hz] = templateSlot.performance.hipsTranslationM;
      nextHipsTranslation = [
        round4(hx * hipsHeightScale),
        round4(hy * hipsHeightScale),
        round4(hz * hipsHeightScale),
      ];
    }
    transferredChannels.push("pose");
  }

  // 4) 표정 전이 (VRM 0.x → 1.0 자동 정규화)
  let nextExpressionWeights: Record<string, number> = {
    ...userCharacter.performance.expressionWeights,
  };
  if (transferExpression) {
    const normalized = normalizeExpressionWeights(templateSlot.performance.expressionWeights);
    nextExpressionWeights = normalized.normalized;
    remappedExpressions = normalized.remapped;
    transferredChannels.push("expression");
  }

  // 5) 시선(LookAt) 및 손 포즈 전이
  const nextLookAt = transferLookAt && templateSlot.performance.lookAt
    ? {
        ...templateSlot.performance.lookAt,
        ...(templateSlot.performance.lookAt.targetWorldPosition
          ? { targetWorldPosition: [...templateSlot.performance.lookAt.targetWorldPosition] as StagingVec3 }
          : {}),
      }
    : userCharacter.performance.lookAt;
  if (transferLookAt && templateSlot.performance.lookAt) transferredChannels.push("lookAt");

  const nextHandPose = transferHandPose && templateSlot.performance.handPose
    ? { ...templateSlot.performance.handPose }
    : userCharacter.performance.handPose;
  if (transferHandPose && templateSlot.performance.handPose) transferredChannels.push("handPose");

  // 6) 전이 후 자동 지면 접지 보정
  let groundSnap: GroundSnapResult | null = null;
  if (transferWorldTransform && snapToGroundAfterTransfer) {
    groundSnap = computeGroundSnapTransform({
      currentPosition: nextWorldPosition,
      raycastGroundY: options.raycastGroundY,
      defaultGroundY: 0,
    });
    nextWorldPosition = groundSnap.nextPosition;
  }

  return {
    character: {
      appearance: preservedAppearance,
      performance: {
        worldPosition: nextWorldPosition,
        worldRotationEulerDeg: nextWorldRotation,
        boneRotations: nextBoneRotations,
        ...(nextHipsTranslation ? { hipsTranslationM: nextHipsTranslation } : {}),
        expressionWeights: nextExpressionWeights,
        ...(nextLookAt ? { lookAt: nextLookAt } : {}),
        ...(nextHandPose ? { handPose: nextHandPose } : {}),
      },
    },
    preservedAppearanceKeys: [
      "characterId",
      "assetUrl",
      "hairPresetId",
      "outfitSlots",
      "colors",
      "bodyProportions",
      "materialOverrides",
    ],
    transferredChannels,
    skippedBones,
    remappedExpressions,
    hipsHeightScaleApplied: hipsHeightScale,
    groundSnap,
  };
}
