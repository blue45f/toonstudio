/**
 * Tooning 3D Studio (TD) & 3D Asset Store (3dasset.tooning.io) Complete Engine
 *
 * Grounded in REA static/runtime analysis of https://plus.tooning.io/3d-studio and https://3dasset.tooning.io/kr:
 * - Hierarchy: `TdWork -> TdScene -> TdCut` (`storyboardContent` max 200 chars, `cutPrompt`, `SceneObject -> CutObject`)
 * - 8 `TdObjectType`s: `Character`, `Background`, `Element` (10 primitives), `Camera`, `Light` (3 types), `CustomElement`, `GlobalCustomElement`, `Group`
 * - 5-Tab Character Inspector:
 *   1. `Style`: 7 `TdStylePresetType` part slots (`HairFront`, `HairSide`, `HairBack`, `SetOutfit`, `Top`, `Bottom`, `Shoes`), multi-slot colors, `isKeepMainColor`, `applyCharacterStyleToScene`
 *   2. `Body Type`: 21 bone transform sliders (`-100..+100`)
 *   3. `Action`: `Motion` (`0..100` `playTime` scrubber), `Pose`, `Hand`, `isPreserveCustomPose`, MediaPipe Pose/Hand retargeter (`LANDMARK_Z_SCALE = 0.2`, `TORSO_HEMISPHERE_THRESHOLD = 0.2`, Slerp `0.5`)
 *   4. `Expression`: Symmetric & Asymmetric 5-region (`leftEyebrow`, `rightEyebrow`, `leftEye`, `rightEye`, `mouth`) + 9-direction 3×3 Gaze Grid (`isDirectionLink`)
 *   5. `Bookmark`: Saved character presets with pose 516 thumbnail metadata
 * - 23 Camera Composition Presets (`ShotSize` 7, `Angle` 5, `Position` 8, `Lens` 3)
 * - Image-to-3D task pipeline, Scene Templates (`Background`, `Character`, `Both` with slot mapping), and 3D Asset Store (`씬`, `공간`, `요소`, `포즈`, `기타`)
 */

export type TdObjectType =
  | "Character"
  | "Background"
  | "Element"
  | "Camera"
  | "Light"
  | "CustomElement"
  | "GlobalCustomElement"
  | "Group";

export type TdElementPrimitiveType =
  | "Box"
  | "Capsule"
  | "Circle"
  | "Cone"
  | "Cylinder"
  | "Plane"
  | "Sphere"
  | "Tetrahedron"
  | "Torus"
  | "Custom";

export const TD_ELEMENT_PRIMITIVES: readonly TdElementPrimitiveType[] = [
  "Box",
  "Capsule",
  "Circle",
  "Cone",
  "Cylinder",
  "Plane",
  "Sphere",
  "Tetrahedron",
  "Torus",
  "Custom",
] as const;

export type TdLightType = "Spot" | "Directional" | "Ambient";

export type TdStylePresetType =
  | "HairFront"
  | "HairSide"
  | "HairBack"
  | "SetOutfit"
  | "Top"
  | "Bottom"
  | "Shoes";

export const TD_STYLE_PART_CATEGORIES: readonly {
  readonly type: TdStylePresetType;
  readonly labelKo: string;
}[] = [
  { type: "HairFront", labelKo: "앞머리" },
  { type: "HairSide", labelKo: "옆머리" },
  { type: "HairBack", labelKo: "뒷머리" },
  { type: "SetOutfit", labelKo: "세트 의상" },
  { type: "Top", labelKo: "상의" },
  { type: "Bottom", labelKo: "하의" },
  { type: "Shoes", labelKo: "신발" },
] as const;

export type TdBoneSliderKey =
  | "headSize"
  | "neckLength"
  | "neckThickness"
  | "shoulderWidth"
  | "torsoThickness"
  | "torsoLength"
  | "bustSize"
  | "upperArmThickness"
  | "upperArmLength"
  | "lowerArmThickness"
  | "lowerArmLength"
  | "fingerThickness"
  | "handSize"
  | "pelvisWidth"
  | "hipSize"
  | "thighThickness"
  | "thighLength"
  | "calfThickness"
  | "calfLength"
  | "footLength"
  | "footThickness";

export interface TdBoneSliderSpec {
  readonly key: TdBoneSliderKey;
  readonly labelKo: string;
  readonly groupKo: "머리·목" | "상체" | "팔·손" | "하체·발";
  readonly min: -100;
  readonly max: 100;
  readonly defaultValue: 0;
}

export const TD_BONE_SLIDER_SPECS: readonly TdBoneSliderSpec[] = [
  { key: "headSize", labelKo: "머리 크기", groupKo: "머리·목", min: -100, max: 100, defaultValue: 0 },
  { key: "neckLength", labelKo: "목 길이", groupKo: "머리·목", min: -100, max: 100, defaultValue: 0 },
  { key: "neckThickness", labelKo: "목 두께", groupKo: "머리·목", min: -100, max: 100, defaultValue: 0 },
  { key: "shoulderWidth", labelKo: "어깨 너비", groupKo: "상체", min: -100, max: 100, defaultValue: 0 },
  { key: "torsoThickness", labelKo: "상체 두께", groupKo: "상체", min: -100, max: 100, defaultValue: 0 },
  { key: "torsoLength", labelKo: "상체 길이", groupKo: "상체", min: -100, max: 100, defaultValue: 0 },
  { key: "bustSize", labelKo: "가슴 크기", groupKo: "상체", min: -100, max: 100, defaultValue: 0 },
  { key: "upperArmThickness", labelKo: "윗팔 두께", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "upperArmLength", labelKo: "윗팔 길이", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "lowerArmThickness", labelKo: "아랫팔 두께", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "lowerArmLength", labelKo: "아랫팔 길이", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "fingerThickness", labelKo: "손가락 두께", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "handSize", labelKo: "손 크기", groupKo: "팔·손", min: -100, max: 100, defaultValue: 0 },
  { key: "pelvisWidth", labelKo: "골반 너비", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "hipSize", labelKo: "엉덩이 크기", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "thighThickness", labelKo: "허벅지 두께", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "thighLength", labelKo: "허벅지 길이", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "calfThickness", labelKo: "종아리 두께", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "calfLength", labelKo: "종아리 길이", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "footLength", labelKo: "발 길이", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
  { key: "footThickness", labelKo: "발 두께", groupKo: "하체·발", min: -100, max: 100, defaultValue: 0 },
] as const;

export type TdBodyBoneValues = Readonly<Record<TdBoneSliderKey, number>>;

export function createDefaultTdBodyBoneValues(): TdBodyBoneValues {
  return {
    headSize: 0,
    neckLength: 0,
    neckThickness: 0,
    shoulderWidth: 0,
    torsoThickness: 0,
    torsoLength: 0,
    bustSize: 0,
    upperArmThickness: 0,
    upperArmLength: 0,
    lowerArmThickness: 0,
    lowerArmLength: 0,
    fingerThickness: 0,
    handSize: 0,
    pelvisWidth: 0,
    hipSize: 0,
    thighThickness: 0,
    thighLength: 0,
    calfThickness: 0,
    calfLength: 0,
    footLength: 0,
    footThickness: 0,
  };
}

export function clampTdBoneValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function evaluateTdBoneScaleMultipliers(
  bones: TdBodyBoneValues,
): Readonly<Record<TdBoneSliderKey, number>> {
  const result = {} as Record<TdBoneSliderKey, number>;
  for (const spec of TD_BONE_SLIDER_SPECS) {
    const clamped = clampTdBoneValue(bones[spec.key]);
    result[spec.key] = Number((1 + clamped * 0.0035).toFixed(4));
  }
  return result;
}

export type TdAnimationType = "Motion" | "Pose" | "Hand";

export const TD_MEDIAPIPE_RETARGET_CONFIG = {
  LANDMARK_Z_SCALE: 0.2,
  TORSO_HEMISPHERE_THRESHOLD: 0.2,
  QUATERNION_SLERP_FACTOR: 0.5,
} as const;

export interface TdActionControlState {
  readonly animationType: TdAnimationType;
  readonly presetId: string;
  readonly playTimePercent: number; // 0..100 timeline scrubber to freeze frame
  readonly isPreserveCustomPose: boolean;
  readonly webcamTrackingActive: boolean;
}

export type TdGazeDirection =
  | "UpLeft"
  | "Up"
  | "UpRight"
  | "Left"
  | "Center"
  | "Right"
  | "DownLeft"
  | "Down"
  | "DownRight";

export const TD_GAZE_GRID_3X3: readonly {
  readonly direction: TdGazeDirection;
  readonly labelKo: string;
  readonly yawDeg: number;
  readonly pitchDeg: number;
}[] = [
  { direction: "UpLeft", labelKo: "좌상(↖)", yawDeg: -18, pitchDeg: 14 },
  { direction: "Up", labelKo: "상(↑)", yawDeg: 0, pitchDeg: 16 },
  { direction: "UpRight", labelKo: "우상(↗)", yawDeg: 18, pitchDeg: 14 },
  { direction: "Left", labelKo: "좌(←)", yawDeg: -22, pitchDeg: 0 },
  { direction: "Center", labelKo: "정면(●)", yawDeg: 0, pitchDeg: 0 },
  { direction: "Right", labelKo: "우(→)", yawDeg: 22, pitchDeg: 0 },
  { direction: "DownLeft", labelKo: "좌하(↙)", yawDeg: -18, pitchDeg: -14 },
  { direction: "Down", labelKo: "하(↓)", yawDeg: 0, pitchDeg: -16 },
  { direction: "DownRight", labelKo: "우하(↘)", yawDeg: 18, pitchDeg: -14 },
] as const;

export interface TdFacialExpressionState {
  readonly isAsymmetric: boolean;
  readonly leftEyebrowPreset: string;
  readonly leftEyebrowIntensity: number; // 0..100
  readonly rightEyebrowPreset: string;
  readonly rightEyebrowIntensity: number; // 0..100
  readonly leftEyePreset: string;
  readonly leftEyeIntensity: number; // 0..100
  readonly rightEyePreset: string;
  readonly rightEyeIntensity: number; // 0..100
  readonly mouthPreset: string;
  readonly mouthIntensity: number; // 0..100
  readonly isDirectionLink: boolean;
  readonly leftEyeGaze: TdGazeDirection;
  readonly rightEyeGaze: TdGazeDirection;
}

export function setTdEyeGazeDirection(
  state: TdFacialExpressionState,
  eye: "left" | "right",
  direction: TdGazeDirection,
): TdFacialExpressionState {
  if (state.isDirectionLink) {
    return {
      ...state,
      leftEyeGaze: direction,
      rightEyeGaze: direction,
    };
  }
  return eye === "left"
    ? { ...state, leftEyeGaze: direction }
    : { ...state, rightEyeGaze: direction };
}

export function syncTdSymmetricExpression(
  state: TdFacialExpressionState,
  region: "eyebrow" | "eye" | "mouth",
  preset: string,
  intensity: number,
): TdFacialExpressionState {
  const clamped = Math.max(0, Math.min(100, Math.round(intensity)));
  if (region === "eyebrow") {
    return {
      ...state,
      leftEyebrowPreset: preset,
      leftEyebrowIntensity: clamped,
      rightEyebrowPreset: preset,
      rightEyebrowIntensity: clamped,
    };
  }
  if (region === "eye") {
    return {
      ...state,
      leftEyePreset: preset,
      leftEyeIntensity: clamped,
      rightEyePreset: preset,
      rightEyeIntensity: clamped,
    };
  }
  return {
    ...state,
    mouthPreset: preset,
    mouthIntensity: clamped,
  };
}

export interface TdStylePartSlotConfig {
  readonly partType: TdStylePresetType;
  readonly presetId: string;
  readonly mainColorHex: string;
  readonly subColorHex: string;
  readonly isKeepMainColor: boolean;
}

export function updateTdStylePartPreset(
  slot: TdStylePartSlotConfig,
  nextPresetId: string,
  defaultPresetMainColorHex = "#3b82f6",
): TdStylePartSlotConfig {
  return {
    ...slot,
    presetId: nextPresetId,
    mainColorHex: slot.isKeepMainColor ? slot.mainColorHex : defaultPresetMainColorHex,
  };
}

export interface TdCharacterBookmark {
  readonly bookmarkId: string;
  readonly name: string;
  readonly thumbnailPoseId: 516;
  readonly styleParts: readonly TdStylePartSlotConfig[];
  readonly bodyBones: TdBodyBoneValues;
}

// 23 Camera Composition Presets (`TdCompositionType`: ShotSize 7, Angle 5, Position 8, Lens 3)
export type TdShotSizePreset =
  | "ExtremeCloseUp"
  | "CloseUpShot"
  | "BustShot"
  | "KneeShot"
  | "WaistShot"
  | "FullShot"
  | "LongShot";

export type TdCameraAnglePreset =
  | "BirdEyesAngle"
  | "HighAngle"
  | "EyeLevelAngle"
  | "LowAngle"
  | "WormsEyeAngle";

export type TdCameraPositionPreset =
  | "Front"
  | "FrontLeft"
  | "LeftSide"
  | "BackLeft"
  | "Back"
  | "BackRight"
  | "RightSide"
  | "FrontRight";

export type TdCameraLensPreset = "Telephoto" | "Standard" | "WideAngle";

export const TD_SHOT_SIZE_SPECS: readonly {
  readonly id: TdShotSizePreset;
  readonly labelKo: string;
  readonly distanceMultiplier: number;
  readonly targetYOffsetRatio: number;
}[] = [
  { id: "ExtremeCloseUp", labelKo: "익스트림 클로즈업 (ECU)", distanceMultiplier: 0.5, targetYOffsetRatio: 0.42 },
  { id: "CloseUpShot", labelKo: "클로즈업 샷 (CU)", distanceMultiplier: 0.8, targetYOffsetRatio: 0.38 },
  { id: "BustShot", labelKo: "바스트 샷 (BS)", distanceMultiplier: 1.0, targetYOffsetRatio: 0.28 },
  { id: "WaistShot", labelKo: "웨이스트 샷 (WS)", distanceMultiplier: 1.2, targetYOffsetRatio: 0.18 },
  { id: "KneeShot", labelKo: "니 샷 (KS)", distanceMultiplier: 1.0, targetYOffsetRatio: 0.1 },
  { id: "FullShot", labelKo: "풀 샷 (FS)", distanceMultiplier: 1.2, targetYOffsetRatio: 0.0 },
  { id: "LongShot", labelKo: "롱 샷 (LS)", distanceMultiplier: 2.5, targetYOffsetRatio: 0.0 },
] as const;

export const TD_CAMERA_ANGLE_SPECS: readonly {
  readonly id: TdCameraAnglePreset;
  readonly labelKo: string;
  readonly elevationDeg: number;
}[] = [
  { id: "BirdEyesAngle", labelKo: "버드아이 앵글 (-60°)", elevationDeg: -60 },
  { id: "HighAngle", labelKo: "하이 앵글 (-35°)", elevationDeg: -35 },
  { id: "EyeLevelAngle", labelKo: "아이레벨 (0°)", elevationDeg: 0 },
  { id: "LowAngle", labelKo: "로우 앵글 (+25°)", elevationDeg: 25 },
  { id: "WormsEyeAngle", labelKo: "웜즈아이 앵글 (+60°)", elevationDeg: 60 },
] as const;

export const TD_CAMERA_POSITION_SPECS: readonly {
  readonly id: TdCameraPositionPreset;
  readonly labelKo: string;
  readonly azimuthDeg: number;
}[] = [
  { id: "Front", labelKo: "정면 (0°)", azimuthDeg: 0 },
  { id: "FrontLeft", labelKo: "좌전방 (30°)", azimuthDeg: 30 },
  { id: "LeftSide", labelKo: "좌측면 (90°)", azimuthDeg: 90 },
  { id: "BackLeft", labelKo: "좌후방 (135°)", azimuthDeg: 135 },
  { id: "Back", labelKo: "후면 (180°)", azimuthDeg: 180 },
  { id: "BackRight", labelKo: "우후방 (225°)", azimuthDeg: 225 },
  { id: "RightSide", labelKo: "우측면 (270°)", azimuthDeg: 270 },
  { id: "FrontRight", labelKo: "우전방 (330°)", azimuthDeg: 330 },
] as const;

export const TD_CAMERA_LENS_SPECS: readonly {
  readonly id: TdCameraLensPreset;
  readonly labelKo: string;
  readonly fovDeg: number;
}[] = [
  { id: "Telephoto", labelKo: "망원 렌즈 (FOV 7°)", fovDeg: 7 },
  { id: "Standard", labelKo: "표준 렌즈 (FOV 40°)", fovDeg: 40 },
  { id: "WideAngle", labelKo: "광각 렌즈 (FOV 100°)", fovDeg: 100 },
] as const;

export interface TdCameraCompositionTransform {
  readonly shotSize: TdShotSizePreset;
  readonly angle: TdCameraAnglePreset;
  readonly position: TdCameraPositionPreset;
  readonly lens: TdCameraLensPreset;
  readonly fovDeg: number;
  readonly cameraPositionWorld: readonly [number, number, number];
  readonly lookAtTargetWorld: readonly [number, number, number];
  readonly isLocked: boolean;
}

/**
 * Computes exact 3D world-space camera coordinates and FOV from the 23 Tooning 3D Studio camera composition presets.
 */
export function computeTdCameraCompositionTransform(params: {
  readonly shotSize: TdShotSizePreset;
  readonly angle: TdCameraAnglePreset;
  readonly position: TdCameraPositionPreset;
  readonly lens: TdCameraLensPreset;
  readonly characterHeightM?: number;
  readonly isLocked?: boolean;
}): TdCameraCompositionTransform {
  const heightM = params.characterHeightM ?? 1.7;
  const shotSpec =
    TD_SHOT_SIZE_SPECS.find((s) => s.id === params.shotSize) ?? TD_SHOT_SIZE_SPECS[2]!;
  const angleSpec =
    TD_CAMERA_ANGLE_SPECS.find((a) => a.id === params.angle) ?? TD_CAMERA_ANGLE_SPECS[2]!;
  const posSpec =
    TD_CAMERA_POSITION_SPECS.find((p) => p.id === params.position) ?? TD_CAMERA_POSITION_SPECS[0]!;
  const lensSpec =
    TD_CAMERA_LENS_SPECS.find((l) => l.id === params.lens) ?? TD_CAMERA_LENS_SPECS[1]!;

  // Base radius scales inversely with tan(fov/2) so Telephoto (7 deg) pulls camera back to preserve framing
  const stdHalfRad = (20 * Math.PI) / 180;
  const lensHalfRad = ((lensSpec.fovDeg / 2) * Math.PI) / 180;
  const lensDistanceCompensation = Math.tan(stdHalfRad) / Math.max(0.05, Math.tan(lensHalfRad));
  const radius = 2.4 * shotSpec.distanceMultiplier * lensDistanceCompensation;

  // Negative elevationDeg in Tooning means Bird's-Eye / High Angle (camera ABOVE looking down)
  const pitchRad = (-angleSpec.elevationDeg * Math.PI) / 180;
  const yawRad = (posSpec.azimuthDeg * Math.PI) / 180;

  const targetY = Number((heightM * (0.5 + shotSpec.targetYOffsetRatio)).toFixed(3));
  const camX = Number((radius * Math.cos(pitchRad) * Math.sin(yawRad)).toFixed(3));
  const camY = Number((targetY + radius * Math.sin(pitchRad)).toFixed(3));
  const camZ = Number((radius * Math.cos(pitchRad) * Math.cos(yawRad)).toFixed(3));

  return {
    shotSize: params.shotSize,
    angle: params.angle,
    position: params.position,
    lens: params.lens,
    fovDeg: lensSpec.fovDeg,
    cameraPositionWorld: [camX, camY, camZ],
    lookAtTargetWorld: [0, targetY, 0],
    isLocked: params.isLocked ?? false,
  };
}

// 3D Asset Store (`3dasset.tooning.io/kr`) & Scene Templates
export type Tooning3DAssetCategory = "씬" | "공간" | "요소" | "포즈" | "기타";

export interface Tooning3DAssetStoreItem {
  readonly assetId: string;
  readonly category: Tooning3DAssetCategory;
  readonly titleKo: string;
  readonly tagsKo: readonly string[];
  readonly objectCount: number;
  readonly isFree: boolean;
}

export const TOONING_3D_ASSET_STORE_CATALOG: readonly Tooning3DAssetStoreItem[] = [
  {
    assetId: "td-asset-scene-palace-banquet",
    category: "씬",
    titleKo: "황실 연회장 대립 씬 (캐릭터 2인 + 샹들리에 조명)",
    tagsKo: ["로판", "황궁", "연회장"],
    objectCount: 14,
    isFree: true,
  },
  {
    assetId: "td-asset-space-classroom-sunset",
    category: "공간",
    titleKo: "노을 지는 고등학교 교실 & 복도",
    tagsKo: ["학원물", "교실", "일상"],
    objectCount: 28,
    isFree: true,
  },
  {
    assetId: "td-asset-element-fantasy-weapons",
    category: "요소",
    titleKo: "성검·마법봉·고대서 소품 팩",
    tagsKo: ["판타지", "무기", "소품"],
    objectCount: 6,
    isFree: true,
  },
  {
    assetId: "td-asset-pose-duel-dynamic",
    category: "포즈",
    titleKo: "검술 공방전 2인 액션 포즈 세트",
    tagsKo: ["액션", "전투", "포즈"],
    objectCount: 2,
    isFree: true,
  },
  {
    assetId: "td-asset-etc-weather-rig",
    category: "기타",
    titleKo: "빗줄기·안개·역광 디렉셔널 라이트 리그",
    tagsKo: ["조명", "날씨", "연출"],
    objectCount: 4,
    isFree: true,
  },
] as const;

export type TdSceneTemplateApplyScope = "Background" | "Character" | "Both";

export interface TdCutCharacterSlotOverride {
  readonly characterId: string;
  readonly characterName: string;
  readonly styleParts: readonly TdStylePartSlotConfig[];
  readonly bodyBones: TdBodyBoneValues;
  readonly action: TdActionControlState;
  readonly expression: TdFacialExpressionState;
}

export interface TdCutRecord {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly storyboardContent: string; // max 200 chars
  readonly cutPrompt: string;
  readonly aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  readonly camera: TdCameraCompositionTransform;
  readonly lightType: TdLightType;
  readonly shadowMapSize: 4096 | 2048;
  readonly characters: readonly TdCutCharacterSlotOverride[];
}

/**
 * Applies a character's style slots across every cut in the current 3D Scene (`applyCharacterStyleToScene`).
 */
export function applyTdCharacterStyleAcrossSceneCuts(
  cuts: readonly TdCutRecord[],
  characterId: string,
  newStyleParts: readonly TdStylePartSlotConfig[],
): readonly TdCutRecord[] {
  return cuts.map((cut) => ({
    ...cut,
    characters: cut.characters.map((ch) =>
      ch.characterId === characterId ? { ...ch, styleParts: newStyleParts } : ch,
    ),
  }));
}

/**
 * Applies a Scene Template (`Background`, `Character`, or `Both`) with character slot mapping (`TemplateChar1 -> CutCharA`).
 */
export function applyTdSceneTemplateWithCharacterMapping(params: {
  readonly cut: TdCutRecord;
  readonly scope: TdSceneTemplateApplyScope;
  readonly templatePoseId: string;
  readonly templateCamera: TdCameraCompositionTransform;
  readonly slotMap: Readonly<Record<string, string>>; // templateSlotId -> characterId
}): TdCutRecord {
  const mappedCharIds = new Set(Object.values(params.slotMap));
  const updatedCharacters =
    params.scope === "Background"
      ? params.cut.characters
      : params.cut.characters.map((ch) =>
          mappedCharIds.has(ch.characterId)
            ? {
                ...ch,
                action: {
                  ...ch.action,
                  presetId: params.templatePoseId,
                },
              }
            : ch,
        );

  return {
    ...params.cut,
    camera: params.scope === "Character" ? params.cut.camera : params.templateCamera,
    characters: updatedCharacters,
  };
}
