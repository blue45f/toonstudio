/**
 * ViewportPane의 순수 상호작용 로직: 관절 라벨, 핸들 필터, 관절 드래그 계산, HUD 문구.
 * React·DOM·Babylon을 모른다 — 엔진이 보고한 카메라(`ViewportCameraInfo`)·스켈레톤·핸들만 받는다.
 *
 * 관절 드래그 규약: 핸들은 본의 월드 원점이고, 핸들을 끌면 그 본의 **부모 관절**(피벗)이 시선 둘레로 돈다
 * (손 핸들을 끌면 아래팔이, 팔꿈치 핸들을 끌면 위팔이 돈다). 부모가 없는 루트(hips)는 자기 원점 둘레로 돈다.
 * 포인터 시작·현재 픽셀을 "피벗을 지나 시선에 수직인 평면"으로 역투영한 두 점이 `dragJointDetailed`의 from/to다.
 * 스켈레톤은 엔진의 포즈 프레임 스켈레톤(`render/pose-skeleton`)이라 절차·패키지 소스 모두 같은 식으로 계산된다.
 */
import { dragJointDetailed } from "../../../animation/joint-drag";
import { computeWorldTransforms, indexBones } from "../../../animation/skeleton-fk";
import { FINGER_BONE_NAMES, isHumanoidBoneName } from "../../../contracts";
import { unprojectToViewPlane } from "../../../render/viewport-math";

import type { HumanoidBoneName, HudSample, JointDragHandle, Pose, SkeletonData, Vec3 } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";

// ---------------------------------------------------------------- 라벨

const SIDE_LABELS_KO = { left: "왼쪽", right: "오른쪽" } as const;
const BODY_LABELS_KO: Readonly<Record<string, string>> = {
  hips: "골반",
  spine: "척추",
  chest: "가슴",
  upperChest: "상흉부",
  neck: "목",
  head: "머리",
  jaw: "턱",
  Eye: "눈",
  Shoulder: "어깨",
  UpperArm: "위팔",
  LowerArm: "아래팔",
  Hand: "손",
  UpperLeg: "허벅지",
  LowerLeg: "종아리",
  Foot: "발",
  Toes: "발가락",
};
const FINGER_LABELS_KO: Readonly<Record<string, string>> = { Thumb: "엄지", Index: "검지", Middle: "중지", Ring: "약지", Little: "소지" };
const SEGMENT_LABELS_KO: Readonly<Record<string, string>> = { Metacarpal: "중수", Proximal: "1마디", Intermediate: "2마디", Distal: "끝마디" };

/** 관절 핸들 라벨(한글). 알 수 없는 본은 이름 그대로. */
export function jointLabelKo(bone: string): string {
  const direct = BODY_LABELS_KO[bone];
  if (direct) return direct;
  const sided = /^(left|right)([A-Z][A-Za-z]*)$/u.exec(bone);
  if (!sided) return bone;
  const side = SIDE_LABELS_KO[sided[1] as "left" | "right"];
  const rest = sided[2] ?? "";
  const body = BODY_LABELS_KO[rest];
  if (body) return `${side} ${body}`;
  const finger = /^(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/u.exec(rest);
  if (finger) return `${side} ${FINGER_LABELS_KO[finger[1] as string]} ${SEGMENT_LABELS_KO[finger[2] as string]}`;
  return bone;
}

// ---------------------------------------------------------------- 핸들 필터

const FINGER_SET: ReadonlySet<string> = new Set(FINGER_BONE_NAMES);
/** 시선 둘레 회전이 의미 없는 본(눈·턱)은 핸들을 만들지 않는다 */
const NO_HANDLE: ReadonlySet<string> = new Set(["leftEye", "rightEye", "jaw"]);

export interface HandleFilter {
  readonly fingers: boolean;
}

export function isFingerBone(bone: string): boolean {
  return FINGER_SET.has(bone);
}

/** 표시할 핸들: 눈·턱 제외, 손가락은 옵션. */
export function visibleHandles(handles: readonly JointDragHandle[], filter: HandleFilter): readonly JointDragHandle[] {
  return handles.filter((handle) => !NO_HANDLE.has(handle.bone) && (filter.fingers || !FINGER_SET.has(handle.bone)));
}

/** 핸들 목록의 변화 감지용 키(렌더 픽셀을 소수 첫째 자리까지, 본 순서 포함). 같으면 React 상태를 갱신하지 않는다. */
export function handlesKey(handles: readonly JointDragHandle[]): string {
  return handles.map((handle) => `${handle.bone}:${handle.screen[0].toFixed(1)},${handle.screen[1].toFixed(1)}`).join("|");
}

// ---------------------------------------------------------------- 관절 드래그

export interface DragPivot {
  /** 실제로 회전하는 본(핸들 본의 부모, 루트면 자기 자신) */
  readonly pivotBone: HumanoidBoneName;
  /** 피벗의 월드 원점(현재 포즈 기준 FK) */
  readonly pivotWorld: Vec3;
}

/**
 * 핸들 본에서 드래그 피벗을 정한다. 스켈레톤에서 부모 사슬을 거슬러 처음 만나는 휴머노이드 본이 피벗이다
 * (보조 본은 건너뛴다). 휴머노이드 본이 아니거나 스켈레톤에 없으면 null.
 */
export function resolveDragPivot(skeleton: SkeletonData, pose: Pose, handleBone: HumanoidBoneName): DragPivot | null {
  const byName = indexBones(skeleton);
  const handle = byName.get(handleBone);
  if (!handle) return null;
  let pivot = handle.parent !== null ? byName.get(handle.parent) : undefined;
  while (pivot && !isHumanoidBoneName(pivot.name)) pivot = pivot.parent !== null ? byName.get(pivot.parent) : undefined;
  const pivotName = pivot?.name ?? handleBone;
  if (!isHumanoidBoneName(pivotName)) return null;
  const world = computeWorldTransforms(skeleton, pose).get(pivotName);
  if (!world) return null;
  return { pivotBone: pivotName, pivotWorld: world.position };
}

export interface JointDragInput {
  readonly skeleton: SkeletonData;
  /** 드래그 시작 시점의 적용 중 포즈(플랜 boneRotations) */
  readonly startPose: Pose;
  readonly pivot: DragPivot;
  readonly camera: ViewportCameraInfo;
  readonly startPixel: readonly [number, number];
  readonly currentPixel: readonly [number, number];
}

export interface JointDragOutcome {
  readonly pose: Pose;
  readonly pivotBone: HumanoidBoneName;
  /** 화면 평면에서 요청된 회전각(도) */
  readonly requestedDeg: number;
  /** 관절 제한으로 요청과 달라졌는지 */
  readonly clamped: boolean;
}

/**
 * 시작 포즈에서 포인터 이동량만큼 피벗을 돌린 결과. 매번 시작 포즈에서 계산하므로 오차가 누적되지 않는다.
 * 역투영이 불가능하면(피벗이 카메라 뒤쪽·시선과 평행) null.
 */
export function computeJointDrag(input: JointDragInput): JointDragOutcome | null {
  const { camera, pivot } = input;
  const from = unprojectToViewPlane(camera, input.startPixel[0], input.startPixel[1], pivot.pivotWorld);
  const to = unprojectToViewPlane(camera, input.currentPixel[0], input.currentPixel[1], pivot.pivotWorld);
  if (!from || !to) return null;
  const result = dragJointDetailed(input.startPose, input.skeleton, pivot.pivotBone, from, to, { position: camera.position, forward: camera.forward });
  return { pose: result.pose, pivotBone: pivot.pivotBone, requestedDeg: result.requestedDeg, clamped: result.clamped };
}

// ---------------------------------------------------------------- HUD

export interface HudRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}

/** HUD 표 행(한글). GPU 시간이 없으면 미지원이라고 적는다(빈 값으로 숨기지 않는다). */
export function hudRows(sample: HudSample): readonly HudRow[] {
  return [
    { key: "frame", label: "프레임", value: formatMs(sample.frameMs) },
    { key: "p95", label: "프레임 p95", value: formatMs(sample.frameMsP95) },
    { key: "gpu", label: "GPU 시간", value: sample.gpuFrameMs === null ? "미지원" : formatMs(sample.gpuFrameMs) },
    { key: "draw", label: "드로 콜", value: String(sample.drawCalls) },
    { key: "meshes", label: "활성 메시", value: String(sample.activeMeshes) },
    { key: "tris", label: "삼각형", value: sample.triangles.toLocaleString("ko-KR") },
    { key: "backend", label: "backend", value: sample.backend },
    { key: "adapter", label: "어댑터", value: sample.adapterLabel },
    { key: "physics", label: "물리", value: sample.physicsProvider },
    { key: "shading", label: "셰이딩", value: sample.shadingMode === "toon" ? "툰" : "PBR" },
  ];
}

// ---------------------------------------------------------------- SHAPER 단축키·프리셋 수식키

export interface ShaperModifierKeys {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

export type ShaperPresetCategory = "part" | "pose";

export interface ShaperPresetClickPolicy {
  /** 파츠/의상 프리셋 적용 시 기존에 그려둔 3D 펜선을 삭제하지 않고 유지할지 (Shift+클릭) */
  readonly keepExistingLines: boolean;
  /** 파츠 프리셋에 내장된 펜선(linePresets) 로드를 건너뛸지 (Alt+클릭) */
  readonly skipPresetLines: boolean;
  /** 포즈 프리셋 적용 시 카메라 위치/화각(FOV) 변경을 건너뛰고 현재 카메라를 유지할지 (Shift+클릭) */
  readonly keepCameraOnPose: boolean;
  /** 포즈 프리셋을 좌/우 대칭(symmetryControlPoint)으로 반전 적용할지 (Alt+클릭) */
  readonly mirrorPose: boolean;
  /** 포즈 프리셋에서 본 회전은 건너뛰고 카메라만 적용할지 (Ctrl+클릭) */
  readonly cameraOnlySkipBones: boolean;
}

/**
 * SHAPER HeadPartsManager::ApplyHeadPart(0x060001f3)의 프리셋 클릭 수식키(Shift/Alt/Ctrl) 정책:
 * - 파츠(part): Shift=기존 펜선 유지, Alt=프리셋 펜선 제외
 * - 포즈(pose): Shift=카메라 유지(포즈만 적용), Alt=좌우 대칭 포즈 반전, Ctrl=카메라만 적용(본 스킵)
 */
export function resolveShaperPresetClickModifiers(
  modifiers: ShaperModifierKeys,
  category: ShaperPresetCategory,
): ShaperPresetClickPolicy {
  const shift = Boolean(modifiers.shift);
  const alt = Boolean(modifiers.alt);
  const ctrl = Boolean(modifiers.ctrl);
  if (category === "pose") {
    return {
      keepExistingLines: true,
      skipPresetLines: false,
      keepCameraOnPose: shift,
      mirrorPose: alt,
      cameraOnlySkipBones: ctrl,
    };
  }
  return {
    keepExistingLines: shift,
    skipPresetLines: alt,
    keepCameraOnPose: false,
    mirrorPose: false,
    cameraOnlySkipBones: false,
  };
}

export type ShaperViewportShortcutAction =
  | {
      readonly kind: "camera-view";
      readonly view: "front" | "left" | "bottom" | "top";
      readonly pivotYAnglesDeg: Vec3;
      readonly pivotXAnglesDeg: Vec3;
    }
  | { readonly kind: "gizmo-mode"; readonly mode: 0 | 1 | 2 | 3 }
  | { readonly kind: "toggle-grid" }
  | { readonly kind: "front-light" }
  | { readonly kind: "toggle-eyeball-cam-lock" }
  | { readonly kind: "reset-camera" }
  | { readonly kind: "rotate-eyeballs"; readonly deltaEulerDeg: Vec3 }
  | { readonly kind: "adjust-shade-line"; readonly deltaShadePos: number }
  | { readonly kind: "rotate-scene-light"; readonly deltaEulerDeg: Vec3 };

/**
 * SHAPER UIManager::LateUpdate(0x06000338) 및 EyeballData::Update(0x06000193)의 뷰포트 단축키 해독기:
 * - F / L / B / T: 정면 / 좌측면 / 하단 / 상단 직교 카메라 뷰 정렬
 * - Q / W / E / R: 기즈모 모드 0..3 전환, G: 그리드 토글
 * - F12: 조명 정면 정렬(SetFrontLight), F10: 안구 카메라 시선 고정(fixEyeballCam), F5: 카메라 리셋
 * - Shift + 방향키: 안구(eyeballL/R) 100 deg/s 회전
 * - Alt + 좌/우 방향키: 툰 음영 경계선(shadeLineSlider) 1.0/s 조절
 * - 일반 방향키: 씬 조명(sceneLightAngles) 100 deg/s 회전
 */
export function resolveShaperViewportKeyShortcut(
  key: string,
  modifiers: ShaperModifierKeys = {},
  deltaTimeSec = 1 / 60,
): ShaperViewportShortcutAction | null {
  const shift = Boolean(modifiers.shift);
  const alt = Boolean(modifiers.alt);
  const dt = Math.max(0, deltaTimeSec);
  const angularStep = 100 * dt;

  switch (key) {
    case "f":
    case "F":
      return { kind: "camera-view", view: "front", pivotYAnglesDeg: [0, 0, 0], pivotXAnglesDeg: [0, 0, 0] };
    case "l":
    case "L":
      return { kind: "camera-view", view: "left", pivotYAnglesDeg: [0, 90, 0], pivotXAnglesDeg: [0, 0, 0] };
    case "b":
    case "B":
      return { kind: "camera-view", view: "bottom", pivotYAnglesDeg: [0, 0, 0], pivotXAnglesDeg: [90, 0, 0] };
    case "t":
    case "T":
      return { kind: "camera-view", view: "top", pivotYAnglesDeg: [0, 0, 0], pivotXAnglesDeg: [-90, 0, 0] };
    case "q":
    case "Q":
      return { kind: "gizmo-mode", mode: 0 };
    case "w":
    case "W":
      return { kind: "gizmo-mode", mode: 1 };
    case "e":
    case "E":
      return { kind: "gizmo-mode", mode: 2 };
    case "r":
    case "R":
      return { kind: "gizmo-mode", mode: 3 };
    case "g":
    case "G":
      return { kind: "toggle-grid" };
    case "F12":
      return { kind: "front-light" };
    case "F10":
      return { kind: "toggle-eyeball-cam-lock" };
    case "F5":
      return { kind: "reset-camera" };
    case "ArrowUp":
      if (shift) return { kind: "rotate-eyeballs", deltaEulerDeg: [-angularStep, 0, 0] };
      if (!alt) return { kind: "rotate-scene-light", deltaEulerDeg: [angularStep, 0, 0] };
      return null;
    case "ArrowDown":
      if (shift) return { kind: "rotate-eyeballs", deltaEulerDeg: [angularStep, 0, 0] };
      if (!alt) return { kind: "rotate-scene-light", deltaEulerDeg: [-angularStep, 0, 0] };
      return null;
    case "ArrowLeft":
      if (shift) return { kind: "rotate-eyeballs", deltaEulerDeg: [0, angularStep, 0] };
      if (alt) return { kind: "adjust-shade-line", deltaShadePos: -dt };
      return { kind: "rotate-scene-light", deltaEulerDeg: [0, angularStep, 0] };
    case "ArrowRight":
      if (shift) return { kind: "rotate-eyeballs", deltaEulerDeg: [0, -angularStep, 0] };
      if (alt) return { kind: "adjust-shade-line", deltaShadePos: dt };
      return { kind: "rotate-scene-light", deltaEulerDeg: [0, -angularStep, 0] };
    default:
      return null;
  }
}

export type ShaperCameraInputStyle = "unity" | "blender" | "max";
export type ShaperMouseButton = 0 | 1 | 2;
export type ShaperCameraNavigationAction = "pan" | "orbit" | "zoom";

/**
 * SHAPER SettingManager::inputStyle (0=unity, 1=blender, 2=max) 및
 * UIManager::LateUpdate (0x06000338) 3-스타일 카메라 마우스 조작 상태머신 역공학 내재화:
 * - `unity`: MMB = pan, Alt+LMB = orbit, Alt+RMB = zoom
 * - `blender`: MMB = orbit, Shift+MMB = pan, Ctrl+MMB = zoom
 * - `max`: MMB = pan, Alt+MMB = orbit, Ctrl+Alt+MMB = zoom
 */
export function resolveShaperCameraInputAction(options: {
  readonly style: ShaperCameraInputStyle;
  readonly button: ShaperMouseButton;
  readonly modifiers?: ShaperModifierKeys;
}): ShaperCameraNavigationAction | null {
  const { style, button, modifiers = {} } = options;
  const shift = Boolean(modifiers.shift);
  const alt = Boolean(modifiers.alt);
  const ctrl = Boolean(modifiers.ctrl);

  if (style === "unity") {
    if (button === 2 && !shift && !alt && !ctrl) return "pan";
    if (button === 0 && alt) return "orbit";
    if (button === 1 && alt) return "zoom";
    return null;
  }

  if (style === "blender") {
    if (button !== 2) return null;
    if (shift) return "pan";
    if (ctrl) return "zoom";
    return "orbit";
  }

  // style === "max"
  if (button !== 2) return null;
  if (ctrl && alt) return "zoom";
  if (alt) return "orbit";
  return "pan";
}

export interface ShaperTrackpadTwoFingerState {
  readonly gestureMode: "orbit" | "zoom";
  readonly moveDelta: readonly [number, number];
  readonly zoomDelta: number;
  readonly orbitInputDelta: readonly [number, number];
  readonly zoomInputDelta: number;
  readonly nextCamPivotZ: number;
  readonly orthographicSize: number;
}

/**
 * SHAPER UITrackpad::Update (0x06000597) 2-손가락 트랙패드/터치 제스처 판별기 역공학 내재화:
 * - 두 손가락 중점 변위 `moveDelta = prevMid - curMid`와 손가락 간 거리 변화 `zoomDelta = prevDist - curDist`를 계산한다.
 * - 잠금 전 초기 프레임에서 `(|moveDelta.x| + |moveDelta.y|) * 0.5 > |zoomDelta|`이면 `"orbit"`, 아니면 `"zoom"` 모드로 잠근다.
 * - 회전 시 `-0.25 * moveDelta`를 적용하고, 줌 시 `+0.25 * zoomDelta`를 적용하며 `camPivotZ <= 2` 클램프 및
 *   직교 투영 크기 `orthographicSize = 15 - (60 - z) * 0.25`를 갱신한다.
 */
export function classifyShaperTrackpadTwoFingerGesture(options: {
  readonly prevTouch0: readonly [number, number];
  readonly prevTouch1: readonly [number, number];
  readonly curTouch0: readonly [number, number];
  readonly curTouch1: readonly [number, number];
  readonly camPivotZ?: number;
  readonly lockedMode?: "orbit" | "zoom";
}): ShaperTrackpadTwoFingerState {
  const {
    prevTouch0,
    prevTouch1,
    curTouch0,
    curTouch1,
    camPivotZ = -3,
    lockedMode,
  } = options;

  const prevMidX = (prevTouch0[0] + prevTouch1[0]) * 0.5;
  const prevMidY = (prevTouch0[1] + prevTouch1[1]) * 0.5;
  const curMidX = (curTouch0[0] + curTouch1[0]) * 0.5;
  const curMidY = (curTouch0[1] + curTouch1[1]) * 0.5;

  const moveDeltaX = prevMidX - curMidX;
  const moveDeltaY = prevMidY - curMidY;

  const prevDist = Math.hypot(prevTouch0[0] - prevTouch1[0], prevTouch0[1] - prevTouch1[1]);
  const curDist = Math.hypot(curTouch0[0] - curTouch1[0], curTouch0[1] - curTouch1[1]);
  const zoomDelta = prevDist - curDist;

  const gestureMode: "orbit" | "zoom" =
    lockedMode ??
    ((Math.abs(moveDeltaX) + Math.abs(moveDeltaY)) * 0.5 > Math.abs(zoomDelta)
      ? "orbit"
      : "zoom");

  const orbitInputDelta: readonly [number, number] =
    gestureMode === "orbit" ? [moveDeltaX * -0.25, moveDeltaY * -0.25] : [0, 0];
  const zoomInputDelta = gestureMode === "zoom" ? zoomDelta * 0.25 : 0;
  const nextCamPivotZ = Math.min(2, camPivotZ + zoomInputDelta);
  const orthographicSize = 15 - (60 - nextCamPivotZ) * 0.25;

  return {
    gestureMode,
    moveDelta: [moveDeltaX, moveDeltaY],
    zoomDelta,
    orbitInputDelta,
    zoomInputDelta,
    nextCamPivotZ,
    orthographicSize,
  };
}

/**
 * SHAPER PivotManager::FixMaxValue (0x06000285) 역공학 내재화:
 * 기즈모 레이캐스트 델타 폭주를 방지하기 위해 값을 `[-maxAbs, +maxAbs]` 범위로 클램프한다.
 */
export function clampShaperGizmoDelta(value: number, maxAbs: number): number {
  const limit = Math.abs(maxAbs);
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
}

/**
 * SHAPER PivotManager::AlignMouseCastPlanes (0x06000280) 역공학 내재화:
 * 기즈모 드래그 축(`x` | `y` | `z`)에 따라 마우스 레이캐스트 평면이 카메라를 바라보도록 월드 오일러 각도를 정렬한다.
 */
export function resolveShaperGizmoCastPlaneEuler(
  axis: "x" | "y" | "z",
  cameraEulerDeg: Vec3,
): Vec3 {
  if (axis === "x") return [cameraEulerDeg[0], 0, 0];
  if (axis === "y") return [0, cameraEulerDeg[1], 0];
  return [0, 0, cameraEulerDeg[2]];
}

export interface ShaperPartThumbnailFramingInput {
  readonly tabIndex: number;
  readonly headRootPosition?: Vec3;
  readonly partCenterOffset?: Vec3;
  readonly partMinPos?: Vec3;
  readonly partMaxPos?: Vec3;
  readonly controlBoneRootPosition?: Vec3;
  readonly boundsCenter?: Vec3;
  readonly boundsSize?: Vec3;
  readonly handTargetPosition?: Vec3;
  readonly includePoseCam?: boolean;
  readonly activeCameraPivotPosition?: Vec3;
  readonly activeCameraPivotYawDeg?: number;
  readonly activeCameraPivotPitchDeg?: number;
  readonly activeCameraFovDeg?: number;
  readonly activeCameraDistance?: number;
}

export interface ShaperPartThumbnailCameraFrame {
  readonly pivotPosition: Vec3;
  readonly pivotYawDeg: number;
  readonly pivotPitchDeg: number;
  readonly fovDeg: number;
  readonly distance: number;
}

/**
 * SHAPER HeadPartsManager::CreatePartThumTex (0x060001f4) 역공학 내재화:
 * 파츠 카테고리 탭(`0..13`)별로 썸네일 캡처 카메라의 피벗 중심점, Yaw(`25°`), Pitch(`0°`), FOV(`20°`) 및
 * 바운딩 크기에 비례하는 카메라 거리를 자동 계산한다.
 */
export function computeShaperPartThumbnailCameraFrame(
  input: ShaperPartThumbnailFramingInput,
): ShaperPartThumbnailCameraFrame {
  const {
    tabIndex,
    headRootPosition = [0, 1.5, 0],
    partCenterOffset = [0, 0, 0],
    partMinPos = [-0.5, -0.5, -0.5],
    partMaxPos = [0.5, 0.5, 0.5],
    controlBoneRootPosition = [0, 0.9, 0],
    boundsCenter = [0, 1.0, 0],
    boundsSize = [1, 1, 1],
    handTargetPosition = [-0.4, 1.0, 0],
    includePoseCam = false,
    activeCameraPivotPosition = [0, 1.0, 0],
    activeCameraPivotYawDeg = 0,
    activeCameraPivotPitchDeg = 0,
    activeCameraFovDeg = 30,
    activeCameraDistance = 120,
  } = input;

  if (tabIndex === 12 && includePoseCam) {
    return {
      pivotPosition: [...activeCameraPivotPosition] as Vec3,
      pivotYawDeg: activeCameraPivotYawDeg,
      pivotPitchDeg: activeCameraPivotPitchDeg,
      fovDeg: activeCameraFovDeg,
      distance: activeCameraDistance,
    };
  }

  const pivotYawDeg = 25;
  const pivotPitchDeg = 0;
  const fovDeg = 20;

  if (tabIndex >= 0 && tabIndex < 6) {
    const pivotPosition: Vec3 = [
      headRootPosition[0] + partCenterOffset[0],
      headRootPosition[1] + partCenterOffset[1],
      headRootPosition[2] + partCenterOffset[2],
    ];
    const spanX = partMaxPos[0] - partMinPos[0];
    const spanY = partMaxPos[1] - partMinPos[1];
    const span = Math.max(spanX, spanY) * 3;
    return {
      pivotPosition,
      pivotYawDeg,
      pivotPitchDeg,
      fovDeg,
      distance: 5 + span,
    };
  }

  if (tabIndex === 6) {
    return {
      pivotPosition: [...headRootPosition] as Vec3,
      pivotYawDeg,
      pivotPitchDeg,
      fovDeg,
      distance: 75,
    };
  }

  if (tabIndex === 7 || tabIndex === 12) {
    return {
      pivotPosition: [...controlBoneRootPosition] as Vec3,
      pivotYawDeg,
      pivotPitchDeg,
      fovDeg,
      distance: 600,
    };
  }

  if (tabIndex >= 8 && tabIndex <= 10) {
    const maxExtent = Math.max(boundsSize[0], boundsSize[1], boundsSize[2]);
    return {
      pivotPosition: [...boundsCenter] as Vec3,
      pivotYawDeg,
      pivotPitchDeg,
      fovDeg,
      distance: maxExtent * 3,
    };
  }

  if (tabIndex === 11) {
    const maxExtent = Math.max(boundsSize[0], boundsSize[1], boundsSize[2]);
    return {
      pivotPosition: [...boundsCenter] as Vec3,
      pivotYawDeg,
      pivotPitchDeg,
      fovDeg,
      distance: maxExtent * 4,
    };
  }

  return {
    pivotPosition: [...handTargetPosition] as Vec3,
    pivotYawDeg,
    pivotPitchDeg,
    fovDeg,
    distance: 70,
  };
}

export type ShaperHistoryType =
  | "selectControlPoints"
  | "selectHairControlPoints"
  | "selectPoseControlPoints"
  | "selectBodyControlPoints"
  | "selectCostumeTransform"
  | "createLine"
  | "removeLine"
  | "createHair"
  | "removeHair"
  | "changeInputField"
  | "changeDropdown"
  | "changeToggle"
  | "changeColor"
  | "changePart";

export const SHAPER_HISTORY_TYPE_ORDER: readonly ShaperHistoryType[] = [
  "selectControlPoints",
  "selectHairControlPoints",
  "selectPoseControlPoints",
  "selectBodyControlPoints",
  "selectCostumeTransform",
  "createLine",
  "removeLine",
  "createHair",
  "removeHair",
  "changeInputField",
  "changeDropdown",
  "changeToggle",
  "changeColor",
  "changePart",
];

export interface ShaperHistoryEntry<TPayload = unknown> {
  readonly type: ShaperHistoryType;
  readonly payload: TPayload;
}

export interface ShaperHistoryStack<TPayload = unknown> {
  readonly entries: readonly ShaperHistoryEntry<TPayload>[];
  readonly curPos: number;
}

export interface ShaperHistoryStepResult<TPayload = unknown> {
  readonly stack: ShaperHistoryStack<TPayload>;
  readonly appliedEntry: ShaperHistoryEntry<TPayload> | null;
}

/**
 * SHAPER HistoryManager::AddHistory (0x06000206) 역공학 내재화:
 * `curPos < entries.length - 1`인 상태에서 새 히스토리가 기록되면
 * `RemoveRange(curPos + 1, count - 1 - curPos)`로 Redo 꼬리를 잘라낸 뒤 새 항목을 추가하고 `curPos`를 갱신한다.
 */
export function pushShaperHistoryEntry<TPayload>(
  stack: ShaperHistoryStack<TPayload>,
  entry: ShaperHistoryEntry<TPayload>,
): ShaperHistoryStack<TPayload> {
  const truncated =
    stack.curPos < stack.entries.length - 1
      ? stack.entries.slice(0, Math.max(0, stack.curPos + 1))
      : [...stack.entries];
  truncated.push(entry);
  return {
    entries: truncated,
    curPos: truncated.length - 1,
  };
}

/**
 * SHAPER HistoryManager::MoveHistoryPos (0x06000208) 역공학 내재화:
 * `delta`(`-1` Undo, `+1` Redo)만큼 히스토리 커서를 이동하고, 유효 범위(`[0, entries.length - 1]`)로 클램프한 뒤
 * 실제로 커서가 이동했을 때만 복원 대상 히스토리 엔트리를 반환한다.
 */
export function stepShaperHistoryCursor<TPayload>(
  stack: ShaperHistoryStack<TPayload>,
  delta: -1 | 1,
): ShaperHistoryStepResult<TPayload> {
  if (stack.entries.length === 0) {
    return { stack, appliedEntry: null };
  }
  const nextPos = Math.max(0, Math.min(stack.entries.length - 1, stack.curPos + delta));
  if (nextPos === stack.curPos) {
    return { stack, appliedEntry: null };
  }
  return {
    stack: {
      entries: stack.entries,
      curPos: nextPos,
    },
    appliedEntry: stack.entries[nextPos] ?? null,
  };
}

const HANGUL_CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;
const HANGUL_JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;
const HANGUL_JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;
const COMPOUND_JUNG: Readonly<Record<string, string>> = {
  "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ",
  "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ",
};
const COMPOUND_JONG: Readonly<Record<string, string>> = {
  "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ",
  "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄹㅅ".replace("ㄹㅅ", "ㄽ"),
  "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ",
};
const SPLIT_JONG: Readonly<Record<string, readonly [string, string]>> = {
  "ㄳ": ["ㄱ", "ㅅ"], "ㄵ": ["ㄴ", "ㅈ"], "ㄶ": ["ㄴ", "ㅎ"],
  "ㄺ": ["ㄹ", "ㄱ"], "ㄻ": ["ㄹ", "ㅁ"], "ㄼ": ["ㄹ", "ㅂ"],
  "ㄽ": ["ㄹ", "ㅅ"], "ㄾ": ["ㄹ", "ㅌ"], "ㄿ": ["ㄹ", "ㅍ"],
  "ㅀ": ["ㄹ", "ㅎ"], "ㅄ": ["ㅂ", "ㅅ"],
};

function mergeHangulSyllable(cho: string, jung: string, jong = ""): string {
  const choIdx = HANGUL_CHO.indexOf(cho as (typeof HANGUL_CHO)[number]);
  const jungIdx = HANGUL_JUNG.indexOf(jung as (typeof HANGUL_JUNG)[number]);
  const jongIdx = HANGUL_JONG.indexOf(jong as (typeof HANGUL_JONG)[number]);
  if (choIdx < 0 || jungIdx < 0 || jongIdx < 0) return `${cho}${jung}${jong}`;
  return String.fromCharCode(0xac00 + (choIdx * 21 + jungIdx) * 28 + jongIdx);
}

/**
 * SHAPER UIInputFieldFixKorean::Merge (0x060002f7) 및 TryTypingCharsCombine (0x060002fb) 역공학 내재화:
 * 자모 입력 시퀀스를 초성·중성·종성 오토마타(`0xAC00 + (cho * 21 + jung) * 28 + jong`),
 * 복합 모음(`ㅘ, ㅙ, ㅚ, ㅝ, ㅞ, ㅟ, ㅢ`), 겹받침(`ㄳ, ㄵ, ㄶ, ㄺ, ㄻ, ㄼ, ㄽ, ㄾ, ㄿ, ㅀ, ㅄ`) 및 연음 종성분리 규칙으로 조합한다.
 */
export function composeShaperHangulJamo(jamoSequence: readonly string[]): string {
  const out: string[] = [];
  let cho = "";
  let jung = "";
  let jong = "";
  const flush = (): void => {
    if (cho && jung) out.push(mergeHangulSyllable(cho, jung, jong));
    else if (cho || jung) out.push(cho || jung);
    cho = "";
    jung = "";
    jong = "";
  };
  for (const ch of jamoSequence) {
    const isC = HANGUL_CHO.includes(ch as (typeof HANGUL_CHO)[number]);
    const isV = HANGUL_JUNG.includes(ch as (typeof HANGUL_JUNG)[number]);
    if (!isC && !isV) {
      flush();
      out.push(ch);
    } else if (isC) {
      if (!cho) cho = ch;
      else if (!jung) { flush(); cho = ch; }
      else if (!jong && HANGUL_JONG.includes(ch as (typeof HANGUL_JONG)[number])) jong = ch;
      else if (jong && COMPOUND_JONG[`${jong}${ch}`] !== undefined) jong = COMPOUND_JONG[`${jong}${ch}`];
      else { flush(); cho = ch; }
    } else if (!cho) {
      if (jung && COMPOUND_JUNG[`${jung}${ch}`] !== undefined) jung = COMPOUND_JUNG[`${jung}${ch}`];
      else { flush(); jung = ch; }
    } else if (!jung) {
      jung = ch;
    } else if (!jong) {
      if (COMPOUND_JUNG[`${jung}${ch}`] !== undefined) jung = COMPOUND_JUNG[`${jung}${ch}`];
      else { flush(); jung = ch; }
    } else {
      const split = SPLIT_JONG[jong];
      out.push(mergeHangulSyllable(cho, jung, split ? split[0] : ""));
      cho = split ? split[1] : jong;
      jung = ch;
      jong = "";
    }
  }
  flush();
  return out.join("");
}

/**
 * SHAPER UIManager::SetHeadPartTab (0x06000315) 역공학 내재화:
 * 파츠 탭(`0..13`) 전환 시 현재 툴 모드가 해당 파츠 카테고리의 유효 범위를 벗어나면 기본 툴 모드로 자동 전환한다.
 */
export function resolveShaperToolModeForPartTab(partTabIndex: number, currentToolMode: number): number {
  if (partTabIndex >= 0 && partTabIndex <= 5) {
    return currentToolMode >= 0 && currentToolMode <= 2 ? currentToolMode : 0;
  }
  if (partTabIndex === 6) {
    return currentToolMode >= 3 && currentToolMode <= 5 ? currentToolMode : 3;
  }
  if (partTabIndex === 7) return 9;
  if (partTabIndex >= 8 && partTabIndex <= 11) return 10;
  if (partTabIndex === 12 || partTabIndex === 13) return 11;
  return currentToolMode;
}

/**
 * SHAPER ColorPalettePicker0::FixPickerPos (0x06000127) 역공학 내재화:
 * 컬러 피커 핸들의 `anchoredPosition`을 패널 가장자리에서 `4px` 안쪽 구간(`[4, size - 4]`)으로 클램프한다.
 */
export function clampShaperColorPickerHandle(
  pos: readonly [number, number],
  sizeDelta: readonly [number, number],
  marginPx = 4,
): readonly [number, number] {
  const clampAxis = (v: number, s: number): number =>
    Math.max(marginPx, Math.min(Math.max(marginPx, s - marginPx), v));
  return [clampAxis(pos[0], sizeDelta[0]), clampAxis(pos[1], sizeDelta[1])];
}
