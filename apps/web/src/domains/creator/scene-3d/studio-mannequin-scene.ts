/**
 * Studio 3D 데생 인형 — Three.js 씬 계층 (v3 에코르셰·작화 보조선·무게중심 추선·관절 잠금·견갑상완 리듬 통합).
 *
 * studio-mannequin-model.ts 스펙에서 관절 그룹/프리미티브/에코르셰 메시를 만들고, 관절 클릭 선택·
 * 손/발 IK 드래그·원근/직교 카메라·오빗 컨트롤·리사이즈·캡처를 담당한다.
 *
 * 하우스 규칙 준수:
 * - 렌더링은 invalidate() 기반 on-demand 1프레임 rAF — 상시 루프가 없어 패널이 닫히면
 *   자동으로 멈추고, dispose()가 보류 중 rAF·지오메트리·머티리얼·렌더러를 전부 정리한다.
 * - 난수 호출 없이 완전 결정적(툰 그라디언트도 절차 생성 DataTexture).
 * - Three import 는 이 파일과 패널 청크 안에만 머문다(check:studio-bundle 경계).
 * - 캡처는 VRM 포저와 같은 오프스크린 렌더타깃 → Worker PNG 인코딩 파이프라인을 재사용한다.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { STUDIO_BG3D_LT_RENDER_MAX_PIXELS } from "../bg3d/studio-bg3d-lt-render";
import {
  captureStudioVrmRgba,
  encodeStudioVrmCapturePngDataUrl,
} from "../vrm/studio-vrm-raster-capture";

import { fitStudioMannequinCameraToBounds } from "./studio-mannequin-camera-framing";
import {
  resolveStudioMannequinSurfaceMode,
  type StudioMannequinSurfaceMode,
} from "./studio-mannequin-ecorche-anatomy";
import { solveStudioMannequinTwoBoneIk } from "./studio-mannequin-ik";
import {
  buildStudioMannequinSpec,
  clampStudioMannequinJointRotation,
  getStudioMannequinJointLimit,
  isStudioMannequinJointId,
  type StudioMannequinChainSpec,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  analyzeStudioMannequinBalance,
  applyStudioMannequinScapulohumeralRhythm,
  type StudioMannequinBalanceReport,
  type StudioMannequinGuideVisibility,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";
import { createStudioMannequinProOverlayController } from "./studio-mannequin-pro-overlays";
import {
  STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
  clampStudioMannequinFovDeg,
  createStudioMannequinQuadOrthoRig,
} from "./studio-mannequin-quad-view";
import {
  buildStudioMannequinJointRangeArc,
  resolveStudioMannequinOutlineMode,
  resolveStudioMannequinOutlineVisible,
  STUDIO_MANNEQUIN_OUTLINE_MODE_DEFAULT,
  type StudioMannequinOutlineMode,
} from "./studio-mannequin-readability";
import {
  resolveStudioMannequinLightingPlan,
  type StudioMannequinLightingPlan,
  type StudioMannequinLightingRig,
} from "./studio-mannequin-lighting";
import {
  createStudioMannequinSceneFigure,
  type StudioMannequinBodyMeshUserData,
  type StudioMannequinEffectorHandleUserData,
  type StudioMannequinFigureEcorcheState,
  type StudioMannequinFigureId,
  type StudioMannequinFigureMaterials,
  type StudioMannequinSceneFigure,
} from "./studio-mannequin-scene-figure";
import {
  createStudioMannequinLightingObject,
  disposeStudioMannequinLightObject,
  mountStudioMannequinLightingGroup,
  readStudioMannequinLightingSnapshot,
  replaceStudioMannequinLightingGroup,
  snapshotStudioMannequinLightingPlan,
  type StudioMannequinLightingSnapshot,
  type StudioMannequinMountedLightSnapshot,
} from "./studio-mannequin-scene-lighting";
import {
  createStudioMannequinMaterialPalette,
  createStudioMannequinToonGradientTexture,
  disposeStudioMannequinMaterialPalette,
} from "./studio-mannequin-scene-materials";

export type { StudioMannequinFigureId, StudioMannequinFigureEcorcheState } from "./studio-mannequin-scene-figure";
export {
  createStudioMannequinLightingObject,
  mountStudioMannequinLightingGroup,
  readStudioMannequinLightingSnapshot,
  replaceStudioMannequinLightingGroup,
  snapshotStudioMannequinLightingPlan,
  type StudioMannequinLightingSnapshot,
  type StudioMannequinMountedLightSnapshot,
};

export type StudioMannequinProjection = "perspective" | "orthographic";

export interface StudioMannequinCaptureResult {
  readonly pngDataUrl: string;
  /** 캡처 래스터 크기(px) — PNG 원본 치수. */
  readonly width: number;
  readonly height: number;
  /** 100% 줌에서 문서에 놓일 논리 크기(업스케일 삽입 방지). */
  readonly displayWidth?: number;
  readonly displayHeight?: number;
  /** 캡처 시점에 뷰포트에 마운트돼 있던 조명 스냅샷. */
  readonly lighting?: StudioMannequinLightingSnapshot;
}

/** 캡처 래스터와 논리 뷰 크기로 삽입 결과를 만든다(순수 함수). */
export function resolveStudioMannequinCaptureResult(input: {
  readonly pngDataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly lighting?: StudioMannequinLightingSnapshot;
}): StudioMannequinCaptureResult {
  const { pngDataUrl, width, height, displayWidth, displayHeight, lighting } = input;
  const displayValid =
    Number.isFinite(displayWidth)
    && displayWidth > 0
    && Number.isFinite(displayHeight)
    && displayHeight > 0
    && displayWidth <= width
    && displayHeight <= height;
  const lightingPart = lighting ? { lighting } : {};
  return displayValid
    ? { pngDataUrl, width, height, displayWidth, displayHeight, ...lightingPart }
    : { pngDataUrl, width, height, ...lightingPart };
}

export interface StudioMannequinSceneOptions {
  readonly container: HTMLElement;
  readonly initialSpec?: StudioMannequinSpec;
  readonly initialPose?: StudioMannequinPose;
  readonly initialOutlineMode?: StudioMannequinOutlineMode;
  readonly initialShowJointRangeArc?: boolean;
  readonly initialLightingRig?: StudioMannequinLightingRig | null;
  readonly initialSurfaceMode?: StudioMannequinSurfaceMode;
  readonly initialGuideVisibility?: Partial<StudioMannequinGuideVisibility>;
  readonly onSelectJoint?: (jointId: StudioMannequinJointId | null) => void;
  readonly onPoseEdited?: (pose: StudioMannequinPose) => void;
}

/** 2인 구도의 상대 인형 — 스펙·포즈와 주인공 로컬 프레임 기준 배치(위치·요). */
export interface StudioMannequinScenePartner {
  readonly spec: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  readonly offset: StudioMannequinVec3;
  readonly yawRad: number;
}

/** 상대 인형을 뷰포트에서 직접 다듬을 때의 알림(2인 구도 훅이 구독한다). */
export interface StudioMannequinScenePartnerListener {
  readonly onPoseEdited?: (pose: StudioMannequinPose) => void;
  readonly onSelectJoint?: (jointId: StudioMannequinJointId | null) => void;
  readonly onActiveFigureChange?: (figure: StudioMannequinFigureId) => void;
}

export interface StudioMannequinSceneHandle {
  setBodySpec(spec: StudioMannequinSpec): void;
  setPose(pose: StudioMannequinPose): void;
  getPose(): StudioMannequinPose;
  setJointRotation(jointId: StudioMannequinJointId, rotation: StudioMannequinVec3): void;
  getJointRotation(jointId: StudioMannequinJointId): StudioMannequinVec3;
  selectJoint(jointId: StudioMannequinJointId | null): void;
  setMaterialStyle(style: StudioMannequinMaterialStyle): void;
  getMaterialStyle(): StudioMannequinMaterialStyle;
  setOutlineMode(mode: StudioMannequinOutlineMode): void;
  getOutlineMode(): StudioMannequinOutlineMode;
  setShowJointRangeArc(show: boolean): void;
  getShowJointRangeArc(): boolean;
  setLightingRig(rig: StudioMannequinLightingRig | null): void;
  getLightingRig(): StudioMannequinLightingRig | null;
  getLightingPlan(): StudioMannequinLightingPlan;
  getLightingSnapshot(): StudioMannequinLightingSnapshot;
  setCameraPreset(preset: "front" | "side" | "back" | "top" | "high" | "low"): void;
  setProjection(projection: StudioMannequinProjection): void;
  getProjection(): StudioMannequinProjection;
  resetCamera(): void;
  resize(width: number, height: number): void;
  invalidate(): void;
  captureDataUrl(
    scale: number,
    options?: { signal?: AbortSignal },
  ): Promise<StudioMannequinCaptureResult>;
  // ── 2인 구도(선택 기능) ──
  setPartner?(partner: StudioMannequinScenePartner | null): void;
  setActiveFigure?(figure: StudioMannequinFigureId): void;
  setPartnerListener?(listener: StudioMannequinScenePartnerListener | null): void;
  frameAll?(): void;
  // ── v3 에코르셰·프로 키네마틱스·작화 보조선(선택 기능 — 기존 테스트 스텁 하위 호환) ──
  setSurfaceMode?(mode: StudioMannequinSurfaceMode): void;
  getSurfaceMode?(): StudioMannequinSurfaceMode;
  setEcorcheState?(next: Partial<StudioMannequinFigureEcorcheState>): void;
  getEcorcheState?(): StudioMannequinFigureEcorcheState;
  setGuideVisibility?(visibility: Partial<StudioMannequinGuideVisibility>): void;
  getGuideVisibility?(): StudioMannequinGuideVisibility;
  setJointLocks?(locks: StudioMannequinJointLockMap): void;
  getJointLocks?(): StudioMannequinJointLockMap;
  setScapulohumeralRhythm?(enabled: boolean): void;
  getBalanceReport?(): StudioMannequinBalanceReport;
  setQuadView?(enabled: boolean): void;
  getQuadView?(): boolean;
  setCameraFovDeg?(fovDeg: number): void;
  getCameraFovDeg?(): number;
  getCameraWorldPosition?(): StudioMannequinVec3;
  dispose(): void;
}

export type StudioMannequinCameraPreset =
  | "home"
  | "front"
  | "side"
  | "back"
  | "top"
  | "high"
  | "low";

export interface StudioMannequinCameraFrame {
  readonly target: StudioMannequinVec3;
  readonly position: StudioMannequinVec3;
}

const CAMERA_REFERENCE_HEIGHT_M = 1.65;
const CAMERA_REFERENCE_OFFSETS: Readonly<Record<StudioMannequinCameraPreset, StudioMannequinVec3>> = {
  home: [1.55, 0.53, 3.1],
  front: [0, 0.18, 3.4],
  side: [3.4, 0.18, 0],
  back: [0, 0.18, -3.4],
  top: [0, 2.88, 0.01],
  high: [1.8, 2.28, 2.6],
  low: [1.4, -0.72, 2.8],
};

export interface StudioMannequinCameraPresetUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
  readonly icon: "home" | "user" | "users" | "video" | "arrow-down-to-line" | "arrow-up-from-line" | "arrow-down-from-line";
}

/** 카메라 앵글 프리셋 UI 메타데이터(ko/en, 아이콘+한줄설명+툴팁). */
export const STUDIO_MANNEQUIN_CAMERA_PRESET_UI: Readonly<
  Record<StudioMannequinCameraPreset, StudioMannequinCameraPresetUi>
> = Object.freeze({
  home: Object.freeze({
    labelKo: "기본",
    labelEn: "Home",
    descriptionKo: "전신을 한눈에 담는 시작 시점.",
    descriptionEn: "Default view framing the whole figure.",
    tooltipKo: "기본 — 전신이 들어오는 시작 카메라로 되돌립니다.",
    tooltipEn: "Home — return to the default full-figure camera.",
    icon: "home",
  }),
  front: Object.freeze({
    labelKo: "정면",
    labelEn: "Front",
    descriptionKo: "얼굴·표정·의상 앞면을 확인하는 정면 샷.",
    descriptionEn: "Straight-on shot for face, expression and outfit.",
    tooltipKo: "정면 — 캐릭터 정면에서 바라보는 앵글. 표정·의상 확인용.",
    tooltipEn: "Front — camera straight ahead. Best for faces and outfits.",
    icon: "user",
  }),
  side: Object.freeze({
    labelKo: "측면",
    labelEn: "Side",
    descriptionKo: "옆모습 실루엣과 자세 균형을 보는 측면 샷.",
    descriptionEn: "Profile shot for silhouette and pose balance.",
    tooltipKo: "측면 — 옆에서 본 실루엣. 자세 균형과 옆선 확인용.",
    tooltipEn: "Side — profile view for silhouette and pose balance.",
    icon: "users",
  }),
  back: Object.freeze({
    labelKo: "후면",
    labelEn: "Back",
    descriptionKo: "등·뒷모습 디테일을 확인하는 후면 샷.",
    descriptionEn: "Rear shot for back and costume-back details.",
    tooltipKo: "후면 — 뒤에서 바라보는 앵글. 등·뒷모습 확인용.",
    tooltipEn: "Back — view from behind. Check back details.",
    icon: "video",
  }),
  top: Object.freeze({
    labelKo: "탑뷰",
    labelEn: "Top",
    descriptionKo: "위에서 수직으로 내려다보는 배치 확인용.",
    descriptionEn: "Straight-down view for layout checks.",
    tooltipKo: "탑뷰 — 위에서 수직으로 내려다봅니다. 배치·동선 확인용.",
    tooltipEn: "Top — straight down. For layout and staging checks.",
    icon: "arrow-down-to-line",
  }),
  high: Object.freeze({
    labelKo: "하이앵글",
    labelEn: "High angle",
    descriptionKo: "위에서 내려다봐 작고 위축된 인상을 주는 앵글.",
    descriptionEn: "Looking down — makes the subject feel small.",
    tooltipKo: "하이앵글 — 위에서 내려다보는 부감. 위축·고립감 연출.",
    tooltipEn: "High angle — looking down. Lonely or vulnerable mood.",
    icon: "arrow-down-from-line",
  }),
  low: Object.freeze({
    labelKo: "로우앵글",
    labelEn: "Low angle",
    descriptionKo: "아래에서 올려다봐 웅장하고 강한 인상을 주는 앵글.",
    descriptionEn: "Looking up — makes the subject feel heroic.",
    tooltipKo: "로우앵글 — 아래에서 올려다보는 앙각. 위압감·영웅감 연출.",
    tooltipEn: "Low angle — looking up. Heroic, imposing mood.",
    icon: "arrow-up-from-line",
  }),
});

/** 120–200cm 체형을 같은 화면 여유로 담는 결정적 카메라 프레임. */
export function resolveStudioMannequinCameraFrame(
  heightM: number,
  preset: StudioMannequinCameraPreset = "home",
): StudioMannequinCameraFrame {
  const safeHeight = Number.isFinite(heightM)
    ? Math.min(3, Math.max(0.5, heightM))
    : CAMERA_REFERENCE_HEIGHT_M;
  const scale = safeHeight / CAMERA_REFERENCE_HEIGHT_M;
  const target: StudioMannequinVec3 = [0, safeHeight / 2, 0];
  const offset = CAMERA_REFERENCE_OFFSETS[preset];
  return {
    target,
    position: [
      target[0] + offset[0] * scale,
      target[1] + offset[1] * scale,
      target[2] + offset[2] * scale,
    ],
  };
}

const CAPTURE_PNG_TIMEOUT_MS = 20_000;
const MIN_CAPTURE_SCALE = 0.5;
const MAX_CAPTURE_SCALE = 3;

/** 환경광(IBL) 세기 기본값 — 켜져 있되 과노출되지 않는 범위(0 초과 1 이하). */
export const STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT = 0.85;
/** 환경광 세기 상한. */
export const STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX = 1;

export function resolveStudioMannequinEnvironmentIntensity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT;
  }
  return Math.min(STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX, Math.max(0, value));
}

function toVec3(value: StudioMannequinVec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

export interface StudioMannequinPointerRotationInput {
  readonly jointId: StudioMannequinJointId;
  readonly startRotation: StudioMannequinVec3;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly twistMode?: boolean;
  readonly fine?: boolean;
}

export function resolveStudioMannequinPointerRotation(
  input: StudioMannequinPointerRotationInput,
): StudioMannequinVec3 {
  const width = Number.isFinite(input.viewportWidth) ? Math.max(1, input.viewportWidth) : 1;
  const height = Number.isFinite(input.viewportHeight) ? Math.max(1, input.viewportHeight) : 1;
  const span = Math.max(180, Math.min(width, height));
  const rate = (Math.PI / span) * (input.fine ? 0.28 : 1);
  const deltaX = Number.isFinite(input.deltaX) ? input.deltaX : 0;
  const deltaY = Number.isFinite(input.deltaY) ? input.deltaY : 0;
  const start = input.startRotation.map((value) => Number.isFinite(value) ? value : 0) as [number, number, number];
  const next: StudioMannequinVec3 = input.twistMode
    ? [start[0] - deltaY * rate, start[1] + deltaX * rate, start[2]]
    : [start[0] - deltaY * rate, start[1], start[2] + deltaX * rate];
  return clampStudioMannequinJointRotation(input.jointId, next);
}

function figureIdOf(object: THREE.Object3D): StudioMannequinFigureId {
  const userData = object.userData as Partial<StudioMannequinBodyMeshUserData>;
  return userData.studioMannequinFigureId === "partner" ? "partner" : "lead";
}

function cameraPresetDirection(preset: StudioMannequinCameraPreset): StudioMannequinVec3 {
  const frame = resolveStudioMannequinCameraFrame(CAMERA_REFERENCE_HEIGHT_M, preset);
  return [
    frame.position[0] - frame.target[0],
    frame.position[1] - frame.target[1],
    frame.position[2] - frame.target[2],
  ];
}

export function createStudioMannequinScene(
  options: StudioMannequinSceneOptions,
): StudioMannequinSceneHandle {
  const { container } = options;
  let spec = options.initialSpec ?? buildStudioMannequinSpec(undefined);
  let disposed = false;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const initialWidth = Math.max(1, container.clientWidth || 1);
  const initialHeight = Math.max(1, container.clientHeight || 1);
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  let currentLightingRig: StudioMannequinLightingRig | null =
    options.initialLightingRig ?? null;
  let currentLightingPlan = resolveStudioMannequinLightingPlan(currentLightingRig);
  const lightingGroup = mountStudioMannequinLightingGroup(currentLightingPlan);
  renderer.shadowMap.enabled = currentLightingPlan.shadowsEnabled;
  scene.add(lightingGroup);

  const helpers = new THREE.Group();
  const grid = new THREE.GridHelper(4, 20, 0x766c5d, 0x3d3831);
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.48;
  const shadowCatcherGeometry = new THREE.PlaneGeometry(4.5, 4.5);
  const shadowCatcherMaterial = new THREE.ShadowMaterial({ color: 0x241d18, opacity: 0.22 });
  const shadowCatcher = new THREE.Mesh(shadowCatcherGeometry, shadowCatcherMaterial);
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.002;
  shadowCatcher.receiveShadow = true;
  helpers.add(grid, shadowCatcher);
  scene.add(helpers);

  const gradientMap = createStudioMannequinToonGradientTexture();
  let currentMaterialStyle: StudioMannequinMaterialStyle = "wood";
  let materialPalette = createStudioMannequinMaterialPalette(currentMaterialStyle, gradientMap);
  const selectedMaterial = new THREE.MeshToonMaterial({ color: 0xe0925c, gradientMap });
  const handleMaterial = new THREE.MeshBasicMaterial({
    color: 0xe0925c,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const handleGeometry = new THREE.SphereGeometry(1, 20, 14);
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x241f1a,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.82,
  });
  let outlineMode: StudioMannequinOutlineMode = resolveStudioMannequinOutlineMode(
    options.initialOutlineMode ?? STUDIO_MANNEQUIN_OUTLINE_MODE_DEFAULT,
  );
  let showJointRangeArc = options.initialShowJointRangeArc ?? true;
  let jointLocks: StudioMannequinJointLockMap = {};
  let scapulohumeralRhythmEnabled = true;

  const figureMaterials: StudioMannequinFigureMaterials = {
    palette: () => materialPalette,
    selected: selectedMaterial,
    handle: handleMaterial,
    handleGeometry,
    outline: outlineMaterial,
    outlineVisible: (role) => resolveStudioMannequinOutlineVisible({
      mode: outlineMode,
      style: currentMaterialStyle,
      role,
    }),
  };

  const rangeArcGroup = new THREE.Group();
  rangeArcGroup.name = "studio-mannequin-joint-range-arc";
  rangeArcGroup.visible = false;
  const rangeArcLineMaterial = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const rangeArcLimitMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const rangeArcMarkerMaterial = new THREE.MeshBasicMaterial({
    color: 0xe0925c,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const rangeArcMarkerGeometry = new THREE.SphereGeometry(1, 14, 10);
  let rangeArcLine: THREE.Line | null = null;
  let rangeArcLimitDots: THREE.Mesh[] = [];
  let rangeArcMarker: THREE.Mesh | null = null;
  let rangeArcBuiltKey: string | null = null;
  scene.add(rangeArcGroup);

  let currentPose = normalizeStudioMannequinPose(
    options.initialPose ?? createStudioMannequinRestPose(),
  );
  const lead = createStudioMannequinSceneFigure({
    id: "lead",
    spec,
    pose: currentPose,
    materials: figureMaterials,
    initialEcorcheState: {
      surfaceMode: resolveStudioMannequinSurfaceMode(options.initialSurfaceMode ?? "ecorche"),
    },
  });
  scene.add(lead.root);

  // v3 작화 보조선(Loomis 두상·흉곽/골반 축·단축 등고선) & 무게중심(CoM) 추선 컨트롤러
  const proOverlays = createStudioMannequinProOverlayController(
    options.initialGuideVisibility ?? STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  );
  scene.add(proOverlays.rootGroup);
  proOverlays.rebuildFigureGuides(spec, lead.joints());
  proOverlays.syncBalanceOverlay(spec, currentPose);

  let partner: StudioMannequinSceneFigure | null = null;
  let partnerListener: StudioMannequinScenePartnerListener | null = null;
  let activeFigureId: StudioMannequinFigureId = "lead";
  let selectedJointId: StudioMannequinJointId | null = null;

  function figureById(id: StudioMannequinFigureId): StudioMannequinSceneFigure | null {
    return id === "partner" ? partner : lead;
  }

  function activeFigure(): StudioMannequinSceneFigure {
    return figureById(activeFigureId) ?? lead;
  }

  function allFigures(): StudioMannequinSceneFigure[] {
    return partner ? [lead, partner] : [lead];
  }

  function applySelectionTint(): void {
    lead.setSelection(activeFigureId === "lead" ? selectedJointId : null);
    partner?.setSelection(activeFigureId === "partner" ? selectedJointId : null);
  }

  function applyHandleVisibility(): void {
    lead.setHandlesVisible(activeFigureId === "lead");
    partner?.setHandlesVisible(activeFigureId === "partner");
  }

  function applyPoseToGraph(pose: StudioMannequinPose): void {
    lead.applyPose(pose);
    proOverlays.syncBalanceOverlay(spec, pose);
  }

  function applyOutlineVisibility(): void {
    for (const figure of allFigures()) figure.refreshOutlines();
  }

  function notifySelection(figureId: StudioMannequinFigureId, jointId: StudioMannequinJointId | null): void {
    if (figureId === "partner") partnerListener?.onSelectJoint?.(jointId);
    else options.onSelectJoint?.(jointId);
  }

  function setActiveFigureInternal(next: StudioMannequinFigureId, notify: boolean): void {
    const resolved = next === "partner" && partner ? "partner" : "lead";
    if (resolved === activeFigureId) return;
    const previous = activeFigureId;
    activeFigureId = resolved;
    selectedJointId = null;
    applySelectionTint();
    applyHandleVisibility();
    clearJointRangeArc();
    if (notify) {
      notifySelection(previous, null);
      partnerListener?.onActiveFigureChange?.(resolved);
    }
    invalidate();
  }

  let viewWidth = initialWidth;
  let viewHeight = initialHeight;
  let projection: StudioMannequinProjection = "perspective";
  let quadViewEnabled = false;
  const quadOrthoRig = createStudioMannequinQuadOrthoRig();
  const perspectiveCamera = new THREE.PerspectiveCamera(
    STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
    viewWidth / viewHeight,
    0.05,
    60,
  );
  const initialCameraFrame = resolveStudioMannequinCameraFrame(spec.heightM);
  const cameraTarget = toVec3(initialCameraFrame.target);
  perspectiveCamera.position.copy(toVec3(initialCameraFrame.position));
  const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);
  orthographicCamera.position.copy(toVec3(initialCameraFrame.position));
  let activeCamera: THREE.Camera = perspectiveCamera;
  let controls: OrbitControls | null = null;

  function updateOrthographicFrustum(): void {
    const distance = orthographicCamera.position.distanceTo(cameraTarget);
    const halfHeight = Math.max(
      0.2,
      distance * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)),
    );
    const halfWidth = halfHeight * (viewWidth / viewHeight);
    orthographicCamera.left = -halfWidth;
    orthographicCamera.right = halfWidth;
    orthographicCamera.top = halfHeight;
    orthographicCamera.bottom = -halfHeight;
    orthographicCamera.updateProjectionMatrix();
  }

  function attachControls(): void {
    controls?.dispose();
    controls = new OrbitControls(activeCamera, renderer.domElement);
    controls.target.copy(cameraTarget);
    controls.enableDamping = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.96;
    controls.addEventListener("change", () => {
      if (projection === "orthographic") updateOrthographicFrustum();
      invalidate();
    });
    controls.update();
  }

  function frameFigures(direction?: StudioMannequinVec3): void {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const figure of allFigures()) {
      for (const mesh of figure.bodyMeshes()) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const current = activeCamera.position.clone().sub(cameraTarget);
    const viewDirection: StudioMannequinVec3 = direction
      ?? (current.lengthSq() > 1e-9 ? [current.x, current.y, current.z] : cameraPresetDirection("home"));
    const frame = fitStudioMannequinCameraToBounds({
      bounds: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] },
      viewDirection,
      fovDeg: perspectiveCamera.fov,
      aspect: viewWidth / viewHeight,
      minDistance: controls?.minDistance ?? 0.5,
    });
    cameraTarget.copy(toVec3(frame.target));
    for (const camera of [perspectiveCamera, orthographicCamera]) {
      camera.position.copy(toVec3(frame.position));
      camera.lookAt(cameraTarget);
    }
    controls?.target.copy(cameraTarget);
    controls?.update();
    updateOrthographicFrustum();
  }

  let pendingFrame = 0;

  function renderNow(): void {
    if (disposed) return;
    syncJointRangeArc();
    proOverlays.syncBalanceOverlay(spec, lead.readPose());
    if (quadViewEnabled) {
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      for (const figure of allFigures()) {
        for (const mesh of figure.bodyMeshes()) bounds.expandByObject(mesh);
      }
      quadOrthoRig.renderQuadView({
        renderer,
        scene,
        mainCamera: activeCamera,
        bounds,
        viewWidth,
        viewHeight,
      });
      return;
    }
    renderer.render(scene, activeCamera);
  }

  function invalidate(): void {
    if (disposed || pendingFrame !== 0) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      renderNow();
    });
  }

  function clearJointRangeArc(): void {
    for (const dot of rangeArcLimitDots) dot.removeFromParent();
    rangeArcLimitDots = [];
    if (rangeArcLine) {
      rangeArcLine.removeFromParent();
      rangeArcLine.geometry.dispose();
      rangeArcLine = null;
    }
    rangeArcMarker?.removeFromParent();
    rangeArcMarker = null;
    rangeArcBuiltKey = null;
    rangeArcGroup.visible = false;
  }

  function syncJointRangeArc(): void {
    if (!showJointRangeArc || !selectedJointId) {
      if (rangeArcBuiltKey !== null) clearJointRangeArc();
      rangeArcGroup.visible = false;
      return;
    }
    const figure = activeFigure();
    const jointGroup = figure.joints().get(selectedJointId);
    if (!jointGroup) {
      clearJointRangeArc();
      return;
    }
    const arc = buildStudioMannequinJointRangeArc({
      jointId: selectedJointId,
      currentRotation: [jointGroup.rotation.x, jointGroup.rotation.y, jointGroup.rotation.z],
    });
    if (!arc) {
      clearJointRangeArc();
      return;
    }
    const radius = figure.spec().headUnit * 0.85;
    const key = `${figure.id}:${arc.jointId}:${arc.axis}`;
    if (rangeArcBuiltKey !== key) {
      clearJointRangeArc();
      rangeArcBuiltKey = key;
      const positions = new Float32Array(arc.points.length * 3);
      arc.points.forEach((point, index) => {
        positions[index * 3] = point[0] * radius;
        positions[index * 3 + 1] = point[1] * radius;
        positions[index * 3 + 2] = point[2] * radius;
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      rangeArcLine = new THREE.Line(geometry, rangeArcLineMaterial);
      rangeArcLine.renderOrder = 11;
      rangeArcGroup.add(rangeArcLine);
      for (const endPoint of [arc.points[0], arc.points[arc.points.length - 1]]) {
        if (!endPoint) continue;
        const dot = new THREE.Mesh(rangeArcMarkerGeometry, rangeArcLimitMaterial);
        dot.scale.setScalar(radius * 0.07);
        dot.position.set(endPoint[0] * radius, endPoint[1] * radius, endPoint[2] * radius);
        dot.renderOrder = 11;
        rangeArcGroup.add(dot);
        rangeArcLimitDots.push(dot);
      }
      rangeArcMarker = new THREE.Mesh(rangeArcMarkerGeometry, rangeArcMarkerMaterial);
      rangeArcMarker.scale.setScalar(radius * 0.1);
      rangeArcMarker.renderOrder = 12;
      rangeArcGroup.add(rangeArcMarker);
    }
    jointGroup.getWorldPosition(rangeArcGroup.position);
    const parent = jointGroup.parent;
    if (parent) parent.getWorldQuaternion(rangeArcGroup.quaternion);
    else rangeArcGroup.quaternion.identity();
    if (rangeArcMarker && arc.currentPoint) {
      rangeArcMarker.position.set(
        arc.currentPoint[0] * radius,
        arc.currentPoint[1] * radius,
        arc.currentPoint[2] * radius,
      );
    }
    const arcColor = arc.limitState === "at-limit"
      ? 0xef4444
      : arc.limitState === "near-limit"
        ? 0xf59e0b
        : 0x38bdf8;
    rangeArcLineMaterial.color.setHex(arcColor);
    rangeArcLimitMaterial.color.setHex(arcColor);
    rangeArcGroup.visible = true;
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  let draggingChain: StudioMannequinChainSpec | null = null;
  let draggingFigureId: StudioMannequinFigureId = "lead";
  let dragPointerId: number | null = null;
  let dragStartPose: StudioMannequinPose | null = null;
  let directDrag: {
    pointerId: number;
    figureId: StudioMannequinFigureId;
    jointId: StudioMannequinJointId;
    startClientX: number;
    startClientY: number;
    startRotation: StudioMannequinVec3;
    twistMode: boolean;
    didMove: boolean;
  } | null = null;

  function updatePointerNdc(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  function allBodyMeshes(): THREE.Mesh[] {
    return allFigures().flatMap((figure) => [...figure.bodyMeshes()]);
  }

  function syncFigureRhythmAndBulge(figure: StudioMannequinSceneFigure): void {
    const activeLocks = figure.id === "lead" ? jointLocks : {};
    let read = figure.readPose();
    if (scapulohumeralRhythmEnabled) {
      read = applyStudioMannequinScapulohumeralRhythm(read, activeLocks, 1);
    }
    figure.applyPose(read);
  }

  function solveChainToward(
    figure: StudioMannequinSceneFigure,
    chain: StudioMannequinChainSpec,
    worldTarget: THREE.Vector3,
  ): void {
    const activeLocks = figure.id === "lead" ? jointLocks : {};
    if (activeLocks[chain.rootJointId] && activeLocks[chain.midJointId]) return;

    const figureJoints = figure.joints();
    const upperJoint = figureJoints.get(chain.rootJointId);
    const midJoint = figureJoints.get(chain.midJointId);
    const parent = upperJoint?.parent;
    if (!upperJoint || !midJoint || !parent) return;

    parent.updateWorldMatrix(true, false);
    const parentInverse = parent.matrixWorld.clone().invert();
    const rootLocal = upperJoint.position.clone();
    const targetLocal = worldTarget.clone().applyMatrix4(parentInverse);

    midJoint.updateWorldMatrix(true, false);
    const midLocal = new THREE.Vector3()
      .setFromMatrixPosition(midJoint.matrixWorld)
      .applyMatrix4(parentInverse);
    const axis = targetLocal.clone().sub(rootLocal);
    const midOffset = midLocal.clone().sub(rootLocal);
    const bendLever = axis.lengthSq() > 1e-12
      ? midOffset.clone().sub(axis.clone().multiplyScalar(midOffset.dot(axis) / axis.lengthSq()))
      : midOffset;
    const chainScale = chain.upperLength + chain.lowerLength;
    const pole = bendLever.lengthSq() > (chainScale * 0.02) ** 2
      ? midLocal
      : rootLocal.clone().add(toVec3(chain.poleHint).multiplyScalar(chainScale));

    const upperLimit = getStudioMannequinJointLimit(chain.rootJointId);
    const lowerLimit = getStudioMannequinJointLimit(chain.midJointId);
    const solved = solveStudioMannequinTwoBoneIk(
      {
        root: [rootLocal.x, rootLocal.y, rootLocal.z],
        target: [targetLocal.x, targetLocal.y, targetLocal.z],
        pole: [pole.x, pole.y, pole.z],
        upperLength: chain.upperLength,
        lowerLength: chain.lowerLength,
        hingeSign: chain.hingeSign,
      },
      {
        upper: { x: upperLimit.x, y: upperLimit.y, z: upperLimit.z },
        lower: { x: lowerLimit.x, y: lowerLimit.y, z: lowerLimit.z },
      },
    );

    if (!activeLocks[chain.rootJointId]) upperJoint.rotation.set(...solved.upperEuler);
    if (!activeLocks[chain.midJointId]) midJoint.rotation.set(...solved.lowerEuler);
    syncFigureRhythmAndBulge(figure);
  }

  function commitFigurePose(figureId: StudioMannequinFigureId): void {
    if (figureId === "partner") {
      if (partner) partnerListener?.onPoseEdited?.(partner.readPose());
      return;
    }
    currentPose = lead.readPose();
    options.onPoseEdited?.(currentPose);
  }

  function handlePointerDown(event: PointerEvent): void {
    if (disposed || event.button !== 0 || !event.isPrimary || directDrag || draggingChain) return;
    updatePointerNdc(event);
    raycaster.setFromCamera(pointerNdc, activeCamera);

    const handleHits = raycaster.intersectObjects([...activeFigure().effectorHandles()], false);
    const handleHit = handleHits[0];
    if (handleHit) {
      const chainId = (handleHit.object.userData as StudioMannequinEffectorHandleUserData)
        .studioMannequinChainId;
      draggingFigureId = activeFigureId;
      draggingChain = activeFigure().spec().chains[chainId];
      dragPointerId = event.pointerId;
      dragStartPose = activeFigure().readPose();
      const cameraDirection = new THREE.Vector3();
      activeCamera.getWorldDirection(cameraDirection);
      const handleWorld = new THREE.Vector3();
      handleHit.object.getWorldPosition(handleWorld);
      dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, handleWorld);
      if (controls) controls.enabled = false;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const bodyHits = raycaster.intersectObjects(allBodyMeshes(), false);
    const bodyHit = bodyHits[0];
    const jointId = bodyHit
      ? (bodyHit.object.userData as StudioMannequinBodyMeshUserData).studioMannequinJointId
      : null;
    if (bodyHit && isStudioMannequinJointId(jointId)) {
      setActiveFigureInternal(figureIdOf(bodyHit.object), true);
      selectedJointId = jointId;
      applySelectionTint();
      notifySelection(activeFigureId, jointId);
      const isLocked = activeFigureId === "lead" && jointLocks[jointId] === true;
      const group = activeFigure().joints().get(jointId);
      if (group && !isLocked) {
        directDrag = {
          pointerId: event.pointerId,
          figureId: activeFigureId,
          jointId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startRotation: [group.rotation.x, group.rotation.y, group.rotation.z],
          twistMode: event.altKey,
          didMove: false,
        };
        if (controls) controls.enabled = false;
        renderer.domElement.style.cursor = "grabbing";
        renderer.domElement.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
      invalidate();
      return;
    }
    selectedJointId = null;
    applySelectionTint();
    invalidate();
    notifySelection(activeFigureId, null);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (disposed) return;
    if (directDrag && event.pointerId === directDrag.pointerId) {
      const deltaX = event.clientX - directDrag.startClientX;
      const deltaY = event.clientY - directDrag.startClientY;
      if (!directDrag.didMove && Math.hypot(deltaX, deltaY) < 3) return;
      const figure = figureById(directDrag.figureId);
      const group = figure?.joints().get(directDrag.jointId);
      if (!figure || !group) return;
      const rotation = resolveStudioMannequinPointerRotation({
        jointId: directDrag.jointId,
        startRotation: directDrag.startRotation,
        deltaX,
        deltaY,
        viewportWidth: viewWidth,
        viewportHeight: viewHeight,
        twistMode: directDrag.twistMode,
        fine: event.shiftKey,
      });
      directDrag.didMove = true;
      group.rotation.set(rotation[0], rotation[1], rotation[2]);
      if (directDrag.jointId === "leftUpperArm" || directDrag.jointId === "rightUpperArm") {
        syncFigureRhythmAndBulge(figure);
      } else {
        figure.applyPose(figure.readPose());
      }
      invalidate();
      event.preventDefault();
      return;
    }
    if (!draggingChain || event.pointerId !== dragPointerId) return;
    const figure = figureById(draggingFigureId);
    if (!figure) return;
    updatePointerNdc(event);
    raycaster.setFromCamera(pointerNdc, activeCamera);
    if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
    solveChainToward(figure, draggingChain, dragPoint);
    invalidate();
    event.preventDefault();
  }

  function finishPointerInteraction(event: PointerEvent, cancelled = false): void {
    if (directDrag && event.pointerId === directDrag.pointerId) {
      const session = directDrag;
      directDrag = null;
      const group = figureById(session.figureId)?.joints().get(session.jointId);
      if (cancelled && group) {
        group.rotation.set(...session.startRotation);
        invalidate();
      } else if (session.didMove) {
        commitFigurePose(session.figureId);
      }
      if (controls) controls.enabled = true;
      renderer.domElement.style.cursor = "grab";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (!draggingChain || event.pointerId !== dragPointerId) return;
    const startPose = dragStartPose;
    const figureId = draggingFigureId;
    draggingChain = null;
    dragPointerId = null;
    dragStartPose = null;
    if (controls) controls.enabled = true;
    renderer.domElement.style.cursor = "grab";
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (cancelled && startPose) {
      if (figureId === "partner") {
        partner?.applyPose(startPose);
      } else {
        currentPose = startPose;
        applyPoseToGraph(currentPose);
      }
      invalidate();
      return;
    }
    commitFigurePose(figureId);
  }

  function handlePointerUp(event: PointerEvent): void {
    finishPointerInteraction(event, false);
  }

  function handlePointerCancel(event: PointerEvent): void {
    finishPointerInteraction(event, true);
  }

  function handleLostPointerCapture(event: PointerEvent): void {
    finishPointerInteraction(event, true);
  }

  function handleDoubleClick(event: MouseEvent): void {
    if (disposed) return;
    updatePointerNdc(event as PointerEvent);
    raycaster.setFromCamera(pointerNdc, activeCamera);
    const bodyHit = raycaster.intersectObjects(allBodyMeshes(), false)[0];
    const jointId = bodyHit
      ? (bodyHit.object.userData as StudioMannequinBodyMeshUserData).studioMannequinJointId
      : null;
    if (!bodyHit || !isStudioMannequinJointId(jointId)) return;
    setActiveFigureInternal(figureIdOf(bodyHit.object), true);
    const figure = activeFigure();
    const group = figure.joints().get(jointId);
    if (!group) return;
    const worldTarget = group.getWorldPosition(new THREE.Vector3());
    const offset = activeCamera.position.clone().sub(cameraTarget);
    const minimumDistance = Math.max(figure.spec().headUnit * 2.2, 0.28);
    offset.setLength(Math.max(minimumDistance, offset.length() * 0.58));
    cameraTarget.copy(worldTarget);
    activeCamera.position.copy(cameraTarget).add(offset);
    activeCamera.lookAt(cameraTarget);
    controls?.target.copy(cameraTarget);
    controls?.update();
    if (projection === "orthographic") updateOrthographicFrustum();
    selectedJointId = jointId;
    applySelectionTint();
    notifySelection(activeFigureId, jointId);
    invalidate();
    event.preventDefault();
  }

  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove, { passive: false });
  renderer.domElement.addEventListener("pointerup", handlePointerUp, { passive: true });
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel, { passive: true });
  renderer.domElement.addEventListener("lostpointercapture", handleLostPointerCapture, { passive: true });
  renderer.domElement.addEventListener("dblclick", handleDoubleClick);

  function clampCaptureDimensions(scale: number): { width: number; height: number } {
    const safeScale = Math.min(MAX_CAPTURE_SCALE, Math.max(MIN_CAPTURE_SCALE, scale));
    const pixelRatio = renderer.getPixelRatio();
    let width = Math.max(1, Math.round(viewWidth * pixelRatio * safeScale));
    let height = Math.max(1, Math.round(viewHeight * pixelRatio * safeScale));
    if (width * height > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
      const shrink = Math.sqrt(STUDIO_BG3D_LT_RENDER_MAX_PIXELS / (width * height));
      width = Math.max(1, Math.floor(width * shrink));
      height = Math.max(1, Math.floor(height * shrink));
    }
    return { width, height };
  }

  async function captureDataUrl(
    scale: number,
    captureOptions: { signal?: AbortSignal } = {},
  ): Promise<StudioMannequinCaptureResult> {
    if (disposed) throw new Error("이미 정리된 3D 데생 인형 씬입니다.");
    const { width, height } = clampCaptureDimensions(scale);
    const displayWidth = viewWidth;
    const displayHeight = viewHeight;
    const lighting = readStudioMannequinLightingSnapshot(lightingGroup);

    const previousSelection = selectedJointId;
    selectedJointId = null;
    applySelectionTint();
    helpers.visible = false;
    rangeArcGroup.visible = false;
    proOverlays.setCaptureHidden(true);
    for (const figure of allFigures()) figure.setHandlesVisible(false);
    let rgba: Uint8ClampedArray;
    try {
      rgba = captureStudioVrmRgba(renderer, scene, activeCamera, { width, height });
    } finally {
      helpers.visible = true;
      proOverlays.setCaptureHidden(false);
      applyHandleVisibility();
      selectedJointId = previousSelection;
      applySelectionTint();
      invalidate();
    }

    const pngDataUrl = await encodeStudioVrmCapturePngDataUrl(
      rgba,
      { width, height },
      { signal: captureOptions.signal, timeoutMs: CAPTURE_PNG_TIMEOUT_MS },
    );
    return resolveStudioMannequinCaptureResult({
      pngDataUrl,
      width,
      height,
      displayWidth,
      displayHeight,
      lighting,
    });
  }

  function applyLightingRig(rig: StudioMannequinLightingRig | null): void {
    currentLightingRig = rig;
    const plan = resolveStudioMannequinLightingPlan(rig);
    const shadowsToggled = plan.shadowsEnabled !== currentLightingPlan.shadowsEnabled;
    currentLightingPlan = plan;
    replaceStudioMannequinLightingGroup(lightingGroup, plan);
    renderer.shadowMap.enabled = plan.shadowsEnabled;
    if (shadowsToggled) {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.needsUpdate = true;
      });
    }
    invalidate();
  }

  function applyPartner(next: StudioMannequinScenePartner | null): void {
    if (!next) {
      if (!partner) return;
      if (activeFigureId === "partner") setActiveFigureInternal("lead", true);
      partner.dispose();
      partner = null;
      frameFigures();
      invalidate();
      return;
    }
    const pose = normalizeStudioMannequinPose(next.pose);
    const isNew = partner === null;
    if (!partner) {
      partner = createStudioMannequinSceneFigure({
        id: "partner",
        spec: next.spec,
        pose,
        materials: figureMaterials,
        initialEcorcheState: { surfaceMode: lead.getEcorcheState().surfaceMode },
      });
      scene.add(partner.root);
    } else if (partner.spec() !== next.spec) {
      partner.rebuild(next.spec, pose);
    } else {
      partner.applyPose(pose);
    }
    partner.setPlacement(next.offset, next.yawRad);
    applySelectionTint();
    applyHandleVisibility();
    if (isNew) frameFigures();
    invalidate();
  }

  applyHandleVisibility();
  attachControls();
  frameFigures(cameraPresetDirection("home"));
  renderNow();

  return {
    setBodySpec(nextSpec) {
      if (disposed) return;
      spec = nextSpec;
      lead.rebuild(spec, currentPose);
      proOverlays.rebuildFigureGuides(spec, lead.joints());
      proOverlays.syncBalanceOverlay(spec, currentPose);
      applySelectionTint();
      applyHandleVisibility();
      frameFigures();
      invalidate();
    },
    setPose(posePatch) {
      if (disposed) return;
      currentPose = normalizeStudioMannequinPose(posePatch);
      applyPoseToGraph(currentPose);
      invalidate();
    },
    getPose() {
      return disposed ? currentPose : lead.readPose();
    },
    setJointRotation(jointId, rotation) {
      if (disposed || jointLocks[jointId]) return;
      const group = lead.joints().get(jointId);
      if (!group) return;
      const clamped = clampStudioMannequinJointRotation(jointId, rotation);
      group.rotation.set(clamped[0], clamped[1], clamped[2]);
      if (jointId === "leftUpperArm" || jointId === "rightUpperArm") {
        syncFigureRhythmAndBulge(lead);
      } else {
        lead.applyPose(lead.readPose());
      }
      currentPose = lead.readPose();
      proOverlays.syncBalanceOverlay(spec, currentPose);
      invalidate();
    },
    getJointRotation(jointId) {
      const group = lead.joints().get(jointId);
      if (!group) return [0, 0, 0];
      return [group.rotation.x, group.rotation.y, group.rotation.z];
    },
    selectJoint(jointId) {
      if (disposed) return;
      if (jointId && activeFigureId !== "lead") setActiveFigureInternal("lead", true);
      selectedJointId = jointId;
      applySelectionTint();
      invalidate();
    },
    setMaterialStyle(style) {
      if (disposed) return;
      currentMaterialStyle = style;
      const previousPalette = materialPalette;
      materialPalette = createStudioMannequinMaterialPalette(style, gradientMap);
      for (const figure of allFigures()) figure.refreshMaterials();
      disposeStudioMannequinMaterialPalette(previousPalette);
      applyOutlineVisibility();
      invalidate();
    },
    getMaterialStyle() {
      return currentMaterialStyle;
    },
    setOutlineMode(mode) {
      if (disposed) return;
      outlineMode = resolveStudioMannequinOutlineMode(mode);
      applyOutlineVisibility();
      invalidate();
    },
    getOutlineMode() {
      return outlineMode;
    },
    setShowJointRangeArc(show) {
      if (disposed) return;
      showJointRangeArc = show === true;
      if (!showJointRangeArc) clearJointRangeArc();
      invalidate();
    },
    getShowJointRangeArc() {
      return showJointRangeArc;
    },
    setLightingRig(rig) {
      if (disposed) return;
      applyLightingRig(rig);
    },
    getLightingRig() {
      return currentLightingRig;
    },
    getLightingPlan() {
      return currentLightingPlan;
    },
    getLightingSnapshot() {
      return readStudioMannequinLightingSnapshot(lightingGroup);
    },
    setCameraPreset(preset) {
      if (disposed) return;
      frameFigures(cameraPresetDirection(preset));
      invalidate();
    },
    setProjection(nextProjection) {
      if (disposed || nextProjection === projection) return;
      projection = nextProjection;
      const previousCamera = activeCamera;
      activeCamera = projection === "perspective" ? perspectiveCamera : orthographicCamera;
      activeCamera.position.copy(previousCamera.position);
      activeCamera.lookAt(cameraTarget);
      if (projection === "orthographic") updateOrthographicFrustum();
      attachControls();
      invalidate();
    },
    getProjection() {
      return projection;
    },
    resetCamera() {
      if (disposed) return;
      frameFigures(cameraPresetDirection("home"));
      invalidate();
    },
    resize(width, height) {
      if (disposed) return;
      viewWidth = Math.max(1, Math.floor(width));
      viewHeight = Math.max(1, Math.floor(height));
      renderer.setSize(viewWidth, viewHeight, false);
      perspectiveCamera.aspect = viewWidth / viewHeight;
      perspectiveCamera.updateProjectionMatrix();
      updateOrthographicFrustum();
      invalidate();
    },
    invalidate,
    captureDataUrl,
    setPartner(next) {
      if (disposed) return;
      applyPartner(next);
    },
    setActiveFigure(figure) {
      if (disposed) return;
      setActiveFigureInternal(figure, true);
    },
    setPartnerListener(listener) {
      partnerListener = listener;
    },
    frameAll() {
      if (disposed) return;
      frameFigures();
      invalidate();
    },
    setSurfaceMode(mode) {
      if (disposed) return;
      lead.setEcorcheState({ surfaceMode: mode }, currentPose);
      partner?.setEcorcheState({ surfaceMode: mode }, partner.readPose());
      proOverlays.rebuildFigureGuides(spec, lead.joints());
      applySelectionTint();
      applyHandleVisibility();
      invalidate();
    },
    getSurfaceMode() {
      return lead.getEcorcheState().surfaceMode;
    },
    setEcorcheState(next) {
      if (disposed) return;
      lead.setEcorcheState(next, currentPose);
      proOverlays.rebuildFigureGuides(spec, lead.joints());
      applySelectionTint();
      applyHandleVisibility();
      invalidate();
    },
    getEcorcheState() {
      return lead.getEcorcheState();
    },
    setGuideVisibility(next) {
      if (disposed) return;
      proOverlays.setVisibility(next);
      invalidate();
    },
    getGuideVisibility() {
      return proOverlays.getVisibility();
    },
    setJointLocks(locks) {
      jointLocks = locks;
    },
    getJointLocks() {
      return jointLocks;
    },
    setScapulohumeralRhythm(enabled) {
      scapulohumeralRhythmEnabled = enabled === true;
    },
    getBalanceReport() {
      return analyzeStudioMannequinBalance(spec, lead.readPose());
    },
    setQuadView(enabled) {
      if (disposed) return;
      quadViewEnabled = enabled === true;
      invalidate();
    },
    getQuadView() {
      return quadViewEnabled;
    },
    setCameraFovDeg(fovDeg) {
      if (disposed) return;
      const nextFov = clampStudioMannequinFovDeg(fovDeg);
      if (Math.abs(perspectiveCamera.fov - nextFov) < 1e-3) return;
      perspectiveCamera.fov = nextFov;
      perspectiveCamera.updateProjectionMatrix();
      frameFigures();
      invalidate();
    },
    getCameraFovDeg() {
      return perspectiveCamera.fov;
    },
    getCameraWorldPosition() {
      return [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pendingFrame !== 0) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
      }
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      controls?.dispose();
      controls = null;
      partnerListener = null;
      proOverlays.dispose();
      for (const child of [...lightingGroup.children]) {
        disposeStudioMannequinLightObject(child);
      }
      lightingGroup.removeFromParent();
      for (const figure of allFigures()) figure.dispose();
      partner = null;
      clearJointRangeArc();
      rangeArcLineMaterial.dispose();
      rangeArcLimitMaterial.dispose();
      rangeArcMarkerMaterial.dispose();
      rangeArcMarkerGeometry.dispose();
      handleGeometry.dispose();
      disposeStudioMannequinMaterialPalette(materialPalette);
      selectedMaterial.dispose();
      handleMaterial.dispose();
      outlineMaterial.dispose();
      gradientMap.dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
      shadowCatcherGeometry.dispose();
      shadowCatcherMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
