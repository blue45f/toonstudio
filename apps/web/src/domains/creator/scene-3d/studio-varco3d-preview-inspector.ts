/**
 * Studio 3D 에셋 프리뷰 & 뷰포트 인스펙터 — VARCO 3D (`MyAssetViewerPage` / `PBRViewer`) 역공학 및 고도화 모듈.
 *
 * `https://3d.varco.ai/myAssets/:taskId` 뷰포트의 핵심 기능·디자인·UI/UX 장점을 ToonStudio 3D 씬/캐릭터/배경 뷰포트에
 * 이식하고 웹툰 제작 워크플로에 맞게 확장한 순수 상태·수식·접근성 계약 모듈입니다.
 *
 * 역공학 반영 핵심 기능:
 * 1. **4-그룹 플로팅 뷰포트 HUD (`ViewModeSelector` & `useViewModeControls`)**:
 *    - 그룹 1 (맵 채널 인스펙터, 단축키 `M` + 숫자키 `1`~`5`):
 *      `baseColor`(`B`), `normal`(`N`), `roughness`(`R`), `metallic`(`M`), `occlusion`(`O`)
 *      및 ORM 텍스처 채널 마스크(`channelMask`) / sRGB 변환 셰이더 유니폼 계산
 *    - 그룹 2 (표면 셰이딩 모드):
 *      `texture`(`T`, Matcap 클레이 ↔ 텍스처 전환), `normalMap`(`N`, 노말 스케일 `[1, -1]` ↔ `[0, 0]`),
 *      `pbr`(`P`, ORM 스칼라 활성화), `celToon`(`L`, ToonStudio 웹툰 3단 셀 셰이딩 확장)
 *    - 그룹 3 (메시 & 리그 오버레이 토글):
 *      `wireframe`(`W`, 삼각형/쿼드 토폴로지 오버레이), `uvSeam`(`U`, `0.999` 깊이 바이어스 UV 심 라인),
 *      `vertexColor`(폴리곤 오프셋 `-1` 버텍스 컬러 검사), `bone`(`S`, 스켈레톤 본 계층 시각화)
 *    - 그룹 4 (라이팅 팝오버, 360° `LightingRotationDial`, 4종 HDRI 환경 & 카메라/전체화면/스크린샷):
 *      24틱(15° 간격) 360° 조명 회전 다이얼(포인터 수평 드래그 + 방향키/Shift/Home/End 슬라이더),
 *      Matcap 법선 Y축 회전 행렬(`enableMatcapLightingRotation`),
 *      4종 HDRI 환경(`studio_small`, `daylight`, `venice_sunset`, `lebombo`),
 *      전체 화면(`F`, 카메라 거리 `0.85x` 줌 및 바닥 그리드 투명도 `0.3 → 0` 자동 연동),
 *      애니메이션 재생/일시정지(`Space`) 및 카메라 트래킹(`C`)
 * 2. **바운딩 박스 정규화(`normalizeAsset`) & 바닥 중앙 피벗(`pivotToBottom`) 계산기**:
 *    - 메쉬 중심을 원점 `(0, 0, 0)`으로 맞춘 뒤 바닥(`min.y`)이 `y = 0`에 닿도록 `+(max.y - min.y) / 2` 보정
 * 3. **ViewHelper 6축 오리엔테이션 기즈모(`+x`, `+y`, `+z`, `-x`, `-y`, `-z`) & 스튜디오 6-모드 스위처**:
 *    - `edit`(원본/편집/3D 비교), `remesh`(Triangle/Quad 리메시), `pbr`, `animate`, `export`, `bridge`(DCC 원클릭 전송)
 * 4. **Modern Web Guidance (`html`) 접근성 준수**:
 *    - 포커스 가능한 하위 요소를 가진 비표시 팝오버에 `aria-hidden="true"`를 쓰지 않고 `inert` + `popover="auto"`를 적용
 *    - 장식용 프리뷰 `<img>`는 `alt=""`, 장식용 다이얼 `<svg>`는 `aria-hidden="true"`, 모든 액션 버튼은 `type="button"` 고정
 */

export interface StudioMannequinVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** PBR 개별 맵 채널 프리뷰 모드 (`null`이면 일반/클레이 셰이딩). */
export type StudioVarco3dMapPreviewMode = "baseColor" | "normal" | "roughness" | "metallic" | "occlusion";

/** 뷰포트 토글 가능한 셰이딩·오버레이·화면 모드 키. */
export type StudioVarco3dViewToggleKey =
  | "texture"
  | "normalMap"
  | "pbr"
  | "celToon"
  | "wireframe"
  | "uvSeam"
  | "vertexColor"
  | "bone"
  | "fullScreen";

/** VARCO 3D 4종 HDRI 환경 맵 ID. */
export type StudioVarco3dEnvironmentId = "studio_small" | "daylight" | "venice_sunset" | "lebombo";

/** 스튜디오 우측 작업 모드 스위처 (`modeSelector`). */
export type StudioVarco3dStudioMode = "edit" | "remesh" | "pbr" | "animate" | "export" | "bridge";

/** DCC 브리지 원클릭 전송 대상 앱. */
export type StudioVarco3dBridgeTarget = "blender" | "unreal" | "unity" | "3dsmax" | "maya" | "slicer";

/** 토폴로지 면 타입 (`triangle`: 1K~1M, `quad`: 1K~100K). */
export type StudioVarco3dFaceTopology = "triangle" | "quad";

/** ViewHelper 6축 카메라 스냅 방향. */
export type StudioVarco3dAxisOrientation = "+x" | "+y" | "+z" | "-x" | "-y" | "-z";

export interface StudioVarco3dShortcutSpec {
  readonly code: string;
  readonly label: string;
}

export interface StudioVarco3dEnvironmentPreset {
  readonly id: StudioVarco3dEnvironmentId;
  readonly labelEn: string;
  readonly labelKo: string;
  readonly previewPath: string;
  readonly swatchGradientStops: readonly [string, string, string];
  readonly defaultIntensity: number;
}

export interface StudioVarco3dMapChannelMeta {
  readonly mode: StudioVarco3dMapPreviewMode;
  readonly shortLabel: "B" | "N" | "R" | "M" | "O";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortcut: StudioVarco3dShortcutSpec;
  /** ORM 텍스처 내적 마스크 (`[0,0,0]`이면 RGB 원색 그대로 출력). */
  readonly channelMask: readonly [number, number, number];
  /** 단일 채널 그레이스케일 추출 여부 (`step(0.5, r+g+b)`). */
  readonly useSingleChannel: boolean;
  /** 선형 텍스처를 sRGB로 인코딩할지 여부. */
  readonly encodeSrgb: boolean;
  /** 참조할 소스 텍스처 슬롯. */
  readonly textureSlot: "baseColor" | "normal" | "orm";
}

export interface StudioVarco3dViewportPolicy {
  readonly modes: Readonly<Record<StudioVarco3dViewToggleKey, boolean>>;
  readonly mapPreview: Readonly<Record<StudioVarco3dMapPreviewMode, boolean>>;
}

export interface StudioVarco3dViewportHudState {
  readonly isTextureOn: boolean;
  readonly isNormalMapOn: boolean;
  readonly isPbrOn: boolean;
  readonly isCelToonOn: boolean;
  readonly isWireframeOn: boolean;
  readonly isUvSeamOn: boolean;
  readonly isVertexColorOn: boolean;
  readonly isBoneOn: boolean;
  readonly isFullScreenOn: boolean;
  readonly mapPreviewMode: StudioVarco3dMapPreviewMode | null;
  readonly preferredMapPreviewMode: StudioVarco3dMapPreviewMode | null;
  /** 조명 Y축 회전 각도(rad, `0` ~ `2π`). */
  readonly lightingRotationRad: number;
  readonly isLightingAutoRotateOn: boolean;
  readonly isLightingBackgroundOn: boolean;
  readonly isLightingPopoverOpen: boolean;
  readonly environmentId: StudioVarco3dEnvironmentId;
  readonly isAnimationPaused: boolean;
  readonly isCameraTrackingOn: boolean;
  readonly faceTopology: StudioVarco3dFaceTopology;
  readonly studioMode: StudioVarco3dStudioMode;
  readonly pivotToBottom: boolean;
}

/** VARCO 3D 기본 카메라 위치 `(0, 0.5, 3.3)` 및 타깃 `(0, 0.5, 0)`. */
export const STUDIO_VARCO3D_DEFAULT_CAMERA_POS: Readonly<StudioMannequinVec3> = Object.freeze({ x: 0, y: 0.5, z: 3.3 });
export const STUDIO_VARCO3D_DEFAULT_LOOK_AT: Readonly<StudioMannequinVec3> = Object.freeze({ x: 0, y: 0.5, z: 0 });

/** 전체 화면 진입 시 카메라 거리 배율 (`0.85`). */
export const STUDIO_VARCO3D_FULLSCREEN_DISTANCE_SCALE = 0.85 as const;

/** 바닥 그리드 기본 불투명도 (`0.3`, 전체화면/환경배경 활성 시 `0`). */
export const STUDIO_VARCO3D_GRID_DEFAULT_OPACITY = 0.3 as const;

/** 조명 자동 회전 1회전 주기(초). */
export const STUDIO_VARCO3D_LIGHTING_AUTO_ROTATE_DURATION_SECONDS = 12 as const;

/** `LightingRotationDial` 24개 눈금 각도 (`0°`, `15°`, ..., `345°`). */
export const STUDIO_VARCO3D_LIGHTING_DIAL_TICK_ANGLES: readonly number[] = Object.freeze(
  Array.from({ length: 24 }, (_, index) => index * 15),
);

/** 환경 맵 ID 목록 (VARCO 3D `LightingPopover` 순서). */
export const STUDIO_VARCO3D_ENVIRONMENT_IDS: readonly StudioVarco3dEnvironmentId[] = Object.freeze([
  "lebombo",
  "venice_sunset",
  "studio_small",
  "daylight",
]);

/** 4종 HDRI 환경 프리셋 카탈로그. */
export const STUDIO_VARCO3D_ENVIRONMENTS: Readonly<
  Record<StudioVarco3dEnvironmentId, StudioVarco3dEnvironmentPreset>
> = Object.freeze({
  lebombo: Object.freeze({
    id: "lebombo",
    labelEn: "Interior",
    labelKo: "실내 (Interior)",
    previewPath: "/environment-previews/lebombo.png",
    swatchGradientStops: Object.freeze(["#F5F0E7", "#D4B68D", "#6A4B3C"] as const),
    defaultIntensity: 1.0,
  }),
  venice_sunset: Object.freeze({
    id: "venice_sunset",
    labelEn: "Sunset",
    labelKo: "석양 (Sunset)",
    previewPath: "/environment-previews/venice_sunset.png",
    swatchGradientStops: Object.freeze(["#76A9D5", "#D98B5F", "#31586C"] as const),
    defaultIntensity: 1.05,
  }),
  studio_small: Object.freeze({
    id: "studio_small",
    labelEn: "Studio",
    labelKo: "스튜디오 (Studio)",
    previewPath: "/environment-previews/studio_small.png",
    swatchGradientStops: Object.freeze(["#F2F5F6", "#6F7A82", "#12181F"] as const),
    defaultIntensity: 1.15,
  }),
  daylight: Object.freeze({
    id: "daylight",
    labelEn: "Daylight",
    labelKo: "주광 (Daylight)",
    previewPath: "/environment-previews/daylight.png",
    swatchGradientStops: Object.freeze(["#E8F3FC", "#7FAEDC", "#3A6D9E"] as const),
    defaultIntensity: 1.2,
  }),
});

/** 뷰 모드 단축키 매핑 (`VIEW_MODE_SHORTCUTS` + 웹툰 셀 셰이딩 `KeyL`). */
export const STUDIO_VARCO3D_VIEW_SHORTCUTS: Readonly<
  Record<StudioVarco3dViewToggleKey, StudioVarco3dShortcutSpec | null>
> = Object.freeze({
  texture: Object.freeze({ code: "KeyT", label: "T" }),
  normalMap: Object.freeze({ code: "KeyN", label: "N" }),
  pbr: Object.freeze({ code: "KeyP", label: "P" }),
  celToon: Object.freeze({ code: "KeyL", label: "L" }),
  wireframe: Object.freeze({ code: "KeyW", label: "W" }),
  uvSeam: Object.freeze({ code: "KeyU", label: "U" }),
  vertexColor: null,
  bone: Object.freeze({ code: "KeyS", label: "S" }),
  fullScreen: Object.freeze({ code: "KeyF", label: "F" }),
});

/** 맵 인스펙터 토글 단축키 (`KeyM`). */
export const STUDIO_VARCO3D_MAPS_TOGGLE_SHORTCUT: Readonly<StudioVarco3dShortcutSpec> = Object.freeze({
  code: "KeyM",
  label: "M",
});

/** 애니메이션 & 카메라 트래킹 단축키 (`ANIMATION_CONTROL_SHORTCUTS`). */
export const STUDIO_VARCO3D_ANIMATION_SHORTCUTS = Object.freeze({
  playPause: Object.freeze({ code: "Space", label: "Space" }),
  cameraTracking: Object.freeze({ code: "KeyC", label: "C" }),
});

/** PBR 맵 채널 인스펙터 메타데이터 및 `setRawMapPreviewUniforms` 셰이더 마스크 규격. */
export const STUDIO_VARCO3D_MAP_CHANNELS: Readonly<
  Record<StudioVarco3dMapPreviewMode, StudioVarco3dMapChannelMeta>
> = Object.freeze({
  baseColor: Object.freeze({
    mode: "baseColor",
    shortLabel: "B",
    labelKo: "베이스 컬러",
    labelEn: "Base Color",
    shortcut: Object.freeze({ code: "Digit1", label: "1" }),
    channelMask: Object.freeze([0, 0, 0] as const),
    useSingleChannel: false,
    encodeSrgb: true,
    textureSlot: "baseColor",
  }),
  normal: Object.freeze({
    mode: "normal",
    shortLabel: "N",
    labelKo: "노말",
    labelEn: "Normal",
    shortcut: Object.freeze({ code: "Digit2", label: "2" }),
    channelMask: Object.freeze([0, 0, 0] as const),
    useSingleChannel: false,
    encodeSrgb: false,
    textureSlot: "normal",
  }),
  roughness: Object.freeze({
    mode: "roughness",
    shortLabel: "R",
    labelKo: "러프니스",
    labelEn: "Roughness",
    shortcut: Object.freeze({ code: "Digit3", label: "3" }),
    channelMask: Object.freeze([0, 1, 0] as const),
    useSingleChannel: true,
    encodeSrgb: false,
    textureSlot: "orm",
  }),
  metallic: Object.freeze({
    mode: "metallic",
    shortLabel: "M",
    labelKo: "메탈릭",
    labelEn: "Metallic",
    shortcut: Object.freeze({ code: "Digit4", label: "4" }),
    channelMask: Object.freeze([0, 0, 1] as const),
    useSingleChannel: true,
    encodeSrgb: false,
    textureSlot: "orm",
  }),
  occlusion: Object.freeze({
    mode: "occlusion",
    shortLabel: "O",
    labelKo: "오클루전",
    labelEn: "Occlusion",
    shortcut: Object.freeze({ code: "Digit5", label: "5" }),
    channelMask: Object.freeze([1, 0, 0] as const),
    useSingleChannel: true,
    encodeSrgb: false,
    textureSlot: "orm",
  }),
});

/** ViewHelper 3축 대표 색상 (`#ff4c67`, `#2bd67a`, `#1c83ff`). */
export const STUDIO_VARCO3D_AXIS_COLORS = Object.freeze({
  x: "#ff4c67",
  y: "#2bd67a",
  z: "#1c83ff",
});

/** 하단 뷰포트 네비게이션 가이드 (`viewportGuide`). */
export const STUDIO_VARCO3D_VIEWPORT_GUIDE = Object.freeze([
  Object.freeze({ action: "zoom", labelKo: "확대/축소", labelEn: "Zoom", gestureKo: "마우스 휠 / 두 손가락 핀치" }),
  Object.freeze({ action: "rotate", labelKo: "회전", labelEn: "Rotate", gestureKo: "좌클릭 드래그 / 한 손가락 드래그" }),
  Object.freeze({ action: "pan", labelKo: "이동", labelEn: "Pan", gestureKo: "우클릭 드래그 / Shift+좌클릭" }),
]);

/** 기본 뷰포트 정책을 생성합니다. */
export function createStudioVarco3dViewportPolicy(options?: {
  readonly hasBaseColorMap?: boolean;
  readonly hasNormalMap?: boolean;
  readonly hasOrmMap?: boolean;
  readonly hasVertexColors?: boolean;
  readonly hasBones?: boolean;
}): StudioVarco3dViewportPolicy {
  const hasBaseColor = options?.hasBaseColorMap ?? true;
  const hasNormal = options?.hasNormalMap ?? true;
  const hasOrm = options?.hasOrmMap ?? true;
  const hasVertexColors = options?.hasVertexColors ?? false;
  const hasBones = options?.hasBones ?? false;

  return Object.freeze({
    modes: Object.freeze({
      texture: hasBaseColor,
      normalMap: hasNormal,
      pbr: hasOrm,
      celToon: true,
      wireframe: true,
      uvSeam: true,
      vertexColor: hasVertexColors,
      bone: hasBones,
      fullScreen: true,
    }),
    mapPreview: Object.freeze({
      baseColor: hasBaseColor,
      normal: hasNormal,
      roughness: hasOrm,
      metallic: hasOrm,
      occlusion: hasOrm,
    }),
  });
}

/** 정책에서 활성화된 맵 프리뷰 채널 목록을 순서대로 반환합니다. */
export function getAvailableVarco3dMapPreviewModes(
  mapPolicy: Readonly<Record<StudioVarco3dMapPreviewMode, boolean>>,
): readonly StudioVarco3dMapPreviewMode[] {
  const order: readonly StudioVarco3dMapPreviewMode[] = ["baseColor", "normal", "roughness", "metallic", "occlusion"];
  return Object.freeze(order.filter((mode) => mapPolicy[mode]));
}

/** 기본 뷰포트 HUD 상태를 생성합니다. */
export function createStudioVarco3dViewportHudState(
  overrides?: Partial<StudioVarco3dViewportHudState>,
): StudioVarco3dViewportHudState {
  return Object.freeze({
    isTextureOn: overrides?.isTextureOn ?? true,
    isNormalMapOn: overrides?.isNormalMapOn ?? true,
    isPbrOn: overrides?.isPbrOn ?? true,
    isCelToonOn: overrides?.isCelToonOn ?? false,
    isWireframeOn: overrides?.isWireframeOn ?? false,
    isUvSeamOn: overrides?.isUvSeamOn ?? false,
    isVertexColorOn: overrides?.isVertexColorOn ?? false,
    isBoneOn: overrides?.isBoneOn ?? false,
    isFullScreenOn: overrides?.isFullScreenOn ?? false,
    mapPreviewMode: overrides?.mapPreviewMode ?? null,
    preferredMapPreviewMode: overrides?.preferredMapPreviewMode ?? null,
    lightingRotationRad: normalizeLightingRotationRad(overrides?.lightingRotationRad ?? 0),
    isLightingAutoRotateOn: overrides?.isLightingAutoRotateOn ?? false,
    isLightingBackgroundOn: overrides?.isLightingBackgroundOn ?? false,
    isLightingPopoverOpen: overrides?.isLightingPopoverOpen ?? false,
    environmentId: overrides?.environmentId ?? "studio_small",
    isAnimationPaused: overrides?.isAnimationPaused ?? false,
    isCameraTrackingOn: overrides?.isCameraTrackingOn ?? false,
    faceTopology: overrides?.faceTopology ?? "triangle",
    studioMode: overrides?.studioMode ?? "edit",
    pivotToBottom: overrides?.pivotToBottom ?? true,
  });
}

/** 라디안 각도를 `0 ~ 359` 정수 도(degree)로 정규화합니다 (`LightingRotationDial` 수식). */
export function lightingRadToDialDeg(rotationRad: number): number {
  if (!Number.isFinite(rotationRad)) return 0;
  return ((Math.round((rotationRad * 180) / Math.PI) % 360) + 360) % 360;
}

/** 정수/실수 도(degree)를 정규화된 라디안(`[0, 2π)`)으로 변환합니다. */
export function lightingDialDegToRad(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const normalizedDeg = ((Math.round(deg) % 360) + 360) % 360;
  return (normalizedDeg * Math.PI) / 180;
}

/** 임의의 라디안 값을 `[0, 2π)` 범위로 정규화합니다. */
export function normalizeLightingRotationRad(rotationRad: number): number {
  return lightingDialDegToRad(lightingRadToDialDeg(rotationRad));
}

/**
 * `LightingRotationDial` 포인터 드래그(`startDeg + deltaClientX`)를 적용합니다.
 * VARCO 3D `LightingPopover` 동작과 동일하게, 사용자가 다이얼을 직접 드래그하면
 * `isLightingAutoRotateOn`이 자동으로 `false`로 전환됩니다.
 */
export function applyVarco3dLightingDialDrag(
  state: StudioVarco3dViewportHudState,
  startDeg: number,
  deltaClientX: number,
): StudioVarco3dViewportHudState {
  return Object.freeze({
    ...state,
    lightingRotationRad: lightingDialDegToRad(startDeg + deltaClientX),
    isLightingAutoRotateOn: false,
  });
}

/**
 * `LightingRotationDial` 키보드 조작(`ArrowRight`, `ArrowUp`, `ArrowLeft`, `ArrowDown`, `Home`, `End`)을 처리합니다.
 * `Shift` 키를 누른 상태면 `15°`, 아니면 `5°` 단위로 회전합니다.
 */
export function applyVarco3dLightingDialKeyDown(
  state: StudioVarco3dViewportHudState,
  key: string,
  shiftKey = false,
): StudioVarco3dViewportHudState {
  const currentDeg = lightingRadToDialDeg(state.lightingRotationRad);
  const step = shiftKey ? 15 : 5;
  let nextDeg: number | null = null;

  if (key === "ArrowRight" || key === "ArrowUp") nextDeg = currentDeg + step;
  else if (key === "ArrowLeft" || key === "ArrowDown") nextDeg = currentDeg - step;
  else if (key === "Home") nextDeg = 0;
  else if (key === "End") nextDeg = 359;

  if (nextDeg === null) return state;

  return Object.freeze({
    ...state,
    lightingRotationRad: lightingDialDegToRad(nextDeg),
    isLightingAutoRotateOn: false,
  });
}

/** 뷰 모드 토글을 수행합니다 (`useViewModeControls` 규칙). */
export function toggleStudioVarco3dViewMode(
  state: StudioVarco3dViewportHudState,
  policy: StudioVarco3dViewportPolicy,
  key: StudioVarco3dViewToggleKey,
): StudioVarco3dViewportHudState {
  if (!policy.modes[key]) return state;
  switch (key) {
    case "texture":
      return Object.freeze({ ...state, isTextureOn: !state.isTextureOn });
    case "normalMap":
      return Object.freeze({ ...state, isNormalMapOn: !state.isNormalMapOn });
    case "pbr":
      return Object.freeze({ ...state, isPbrOn: !state.isPbrOn });
    case "celToon":
      return Object.freeze({ ...state, isCelToonOn: !state.isCelToonOn });
    case "wireframe":
      return Object.freeze({ ...state, isWireframeOn: !state.isWireframeOn });
    case "uvSeam":
      return Object.freeze({ ...state, isUvSeamOn: !state.isUvSeamOn });
    case "vertexColor":
      return Object.freeze({ ...state, isVertexColorOn: !state.isVertexColorOn });
    case "bone":
      return Object.freeze({ ...state, isBoneOn: !state.isBoneOn });
    case "fullScreen":
      return Object.freeze({ ...state, isFullScreenOn: !state.isFullScreenOn });
  }
}

/**
 * 맵 프리뷰 인스펙터(`KeyM`)를 토글합니다.
 * 이미 맵 프리뷰가 켜져 있으면 `null`로 끄고, 꺼져 있으면 `preferredMapPreviewMode` 또는 첫 번째 지원 채널을 켭니다.
 */
export function toggleStudioVarco3dMapPreview(
  state: StudioVarco3dViewportHudState,
  policy: StudioVarco3dViewportPolicy,
): StudioVarco3dViewportHudState {
  const firstAvailable = getAvailableVarco3dMapPreviewModes(policy.mapPreview)[0];
  if (!firstAvailable) return state;
  if (state.mapPreviewMode !== null) {
    return Object.freeze({ ...state, mapPreviewMode: null });
  }
  const preferred =
    state.preferredMapPreviewMode && policy.mapPreview[state.preferredMapPreviewMode]
      ? state.preferredMapPreviewMode
      : firstAvailable;
  return Object.freeze({ ...state, mapPreviewMode: preferred, preferredMapPreviewMode: preferred });
}

/** 특정 맵 프리뷰 채널을 선택합니다 (`Digit1`~`Digit5` 또는 세그먼트 버튼 클릭). */
export function selectStudioVarco3dMapPreviewMode(
  state: StudioVarco3dViewportHudState,
  policy: StudioVarco3dViewportPolicy,
  mode: StudioVarco3dMapPreviewMode | null,
): StudioVarco3dViewportHudState {
  if (mode === null) return Object.freeze({ ...state, mapPreviewMode: null });
  if (!policy.mapPreview[mode]) return state;
  return Object.freeze({ ...state, mapPreviewMode: mode, preferredMapPreviewMode: mode });
}

/**
 * 뷰포트 단축키(`KeyM`, `Digit1`~`Digit5`, `KeyT`, `KeyN`, `KeyP`, `KeyL`, `KeyW`, `KeyU`, `KeyS`, `KeyF`, `Space`, `KeyC`)를
 * VARCO 3D `useViewModeControls` & `useAnimationControls` 우선순위 규칙에 따라 처리합니다.
 */
export function dispatchStudioVarco3dViewportShortcut(
  state: StudioVarco3dViewportHudState,
  policy: StudioVarco3dViewportPolicy,
  code: string,
  options?: { readonly animationEnabled?: boolean },
): StudioVarco3dViewportHudState {
  if (code === STUDIO_VARCO3D_MAPS_TOGGLE_SHORTCUT.code) {
    return toggleStudioVarco3dMapPreview(state, policy);
  }
  if (state.mapPreviewMode !== null) {
    for (const meta of Object.values(STUDIO_VARCO3D_MAP_CHANNELS)) {
      if (code === meta.shortcut.code && policy.mapPreview[meta.mode]) {
        return selectStudioVarco3dMapPreviewMode(state, policy, meta.mode);
      }
    }
  } else {
    if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.texture?.code) return toggleStudioVarco3dViewMode(state, policy, "texture");
    if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.normalMap?.code) return toggleStudioVarco3dViewMode(state, policy, "normalMap");
    if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.pbr?.code) return toggleStudioVarco3dViewMode(state, policy, "pbr");
    if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.celToon?.code) return toggleStudioVarco3dViewMode(state, policy, "celToon");
  }

  if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.wireframe?.code) return toggleStudioVarco3dViewMode(state, policy, "wireframe");
  if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.uvSeam?.code) return toggleStudioVarco3dViewMode(state, policy, "uvSeam");
  if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.bone?.code) return toggleStudioVarco3dViewMode(state, policy, "bone");
  if (code === STUDIO_VARCO3D_VIEW_SHORTCUTS.fullScreen?.code) return toggleStudioVarco3dViewMode(state, policy, "fullScreen");

  if (options?.animationEnabled) {
    if (code === STUDIO_VARCO3D_ANIMATION_SHORTCUTS.playPause.code) {
      return Object.freeze({ ...state, isAnimationPaused: !state.isAnimationPaused });
    }
    if (code === STUDIO_VARCO3D_ANIMATION_SHORTCUTS.cameraTracking.code) {
      return Object.freeze({ ...state, isCameraTrackingOn: !state.isCameraTrackingOn });
    }
  }
  return state;
}

export interface StudioVarco3dResolvedMaterialUniforms {
  readonly pipeline: "raw-map" | "matcap-clay" | "standard-pbr" | "webtoon-cel";
  readonly normalScale: readonly [number, number];
  readonly aoMapIntensity: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly matcapLightingRotationVec2: readonly [number, number];
  readonly matcapNormalRotationMat3: readonly [number, number, number, number, number, number, number, number, number];
  readonly rawMapChannel: StudioVarco3dMapChannelMeta | null;
}

function cleanZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

/**
 * 현재 뷰포트 HUD 상태로부터 Three.js / Babylon.js 재질 유니폼과 파이프라인 모드를 계산합니다.
 */
export function resolveStudioVarco3dMaterialUniforms(
  state: StudioVarco3dViewportHudState,
  options?: { readonly hasOrmTexture?: boolean },
): StudioVarco3dResolvedMaterialUniforms {
  const cosR = cleanZero(Number(Math.cos(state.lightingRotationRad).toFixed(6)));
  const sinR = cleanZero(Number(Math.sin(state.lightingRotationRad).toFixed(6)));
  const matcapNormalRotationMat3 = Object.freeze([cosR, 0, sinR, 0, 1, 0, cleanZero(-sinR), 0, cosR] as const);
  const normalScale: readonly [number, number] = state.isNormalMapOn ? Object.freeze([1, -1]) : Object.freeze([0, 0]);
  const pbrActive = (options?.hasOrmTexture ?? true) && state.isPbrOn;

  if (state.mapPreviewMode !== null) {
    return Object.freeze({
      pipeline: "raw-map",
      normalScale,
      aoMapIntensity: 0,
      metalness: 0,
      roughness: 1,
      matcapLightingRotationVec2: Object.freeze([cosR, sinR] as const),
      matcapNormalRotationMat3,
      rawMapChannel: STUDIO_VARCO3D_MAP_CHANNELS[state.mapPreviewMode],
    });
  }

  const pipeline = !state.isTextureOn ? "matcap-clay" : state.isCelToonOn ? "webtoon-cel" : "standard-pbr";
  return Object.freeze({
    pipeline,
    normalScale,
    aoMapIntensity: pbrActive ? 1 : 0,
    metalness: pbrActive ? 1 : 0,
    roughness: pbrActive ? 1 : 0.5,
    matcapLightingRotationVec2: Object.freeze([cosR, sinR] as const),
    matcapNormalRotationMat3,
    rawMapChannel: null,
  });
}

/**
 * 전체 화면 및 환경 배경 여부에 따른 바닥 그리드 목표 불투명도(`syncGridOpacity`)와 카메라 프레이밍을 계산합니다.
 */
export function resolveStudioVarco3dCameraAndGrid(
  state: StudioVarco3dViewportHudState,
  baseCameraPos: StudioMannequinVec3 = STUDIO_VARCO3D_DEFAULT_CAMERA_POS,
  lookAt: StudioMannequinVec3 = STUDIO_VARCO3D_DEFAULT_LOOK_AT,
): {
  readonly gridTargetOpacity: number;
  readonly viewHelperVisible: boolean;
  readonly cameraPosition: StudioMannequinVec3;
  readonly lookAt: StudioMannequinVec3;
} {
  const hideGrid = state.isFullScreenOn || state.isLightingBackgroundOn;
  const scale = state.isFullScreenOn ? STUDIO_VARCO3D_FULLSCREEN_DISTANCE_SCALE : 1;
  return Object.freeze({
    gridTargetOpacity: hideGrid ? 0 : STUDIO_VARCO3D_GRID_DEFAULT_OPACITY,
    viewHelperVisible: !state.isFullScreenOn,
    cameraPosition: Object.freeze({
      x: cleanZero(Number((lookAt.x + (baseCameraPos.x - lookAt.x) * scale).toFixed(4))),
      y: cleanZero(Number((lookAt.y + (baseCameraPos.y - lookAt.y) * scale).toFixed(4))),
      z: cleanZero(Number((lookAt.z + (baseCameraPos.z - lookAt.z) * scale).toFixed(4))),
    }),
    lookAt: Object.freeze({ ...lookAt }),
  });
}

/**
 * 바운딩 박스(`[min, max]`)로부터 에셋 정규화 오프셋(`normalizeAsset` / `pivotToBottom`)을 계산합니다.
 */
export function computeVarco3dAssetNormalization(
  boundsMin: StudioMannequinVec3,
  boundsMax: StudioMannequinVec3,
  pivotToBottom = true,
): {
  readonly center: StudioMannequinVec3;
  readonly size: StudioMannequinVec3;
  readonly translationOffset: StudioMannequinVec3;
} {
  const sizeX = Math.max(0, boundsMax.x - boundsMin.x);
  const sizeY = Math.max(0, boundsMax.y - boundsMin.y);
  const sizeZ = Math.max(0, boundsMax.z - boundsMin.z);
  const centerX = cleanZero((boundsMin.x + boundsMax.x) / 2);
  const centerY = cleanZero((boundsMin.y + boundsMax.y) / 2);
  const centerZ = cleanZero((boundsMin.z + boundsMax.z) / 2);

  return Object.freeze({
    center: Object.freeze({ x: centerX, y: centerY, z: centerZ }),
    size: Object.freeze({ x: sizeX, y: sizeY, z: sizeZ }),
    translationOffset: Object.freeze({
      x: cleanZero(-centerX),
      y: cleanZero(pivotToBottom ? -centerY + sizeY / 2 : -centerY),
      z: cleanZero(-centerZ),
    }),
  });
}

/** ViewHelper 6축 클릭(`+x`, `+y`, `+z`, `-x`, `-y`, `-z`)에 대한 목표 카메라 위치를 계산합니다. */
export function resolveVarco3dAxisSnapCameraPosition(
  axis: StudioVarco3dAxisOrientation,
  radius: number,
  target: StudioMannequinVec3 = STUDIO_VARCO3D_DEFAULT_LOOK_AT,
): StudioMannequinVec3 {
  const safeRadius = Math.max(0.1, Number.isFinite(radius) ? radius : 3.3);
  switch (axis) {
    case "+x":
      return Object.freeze({ x: target.x + safeRadius, y: target.y, z: target.z });
    case "-x":
      return Object.freeze({ x: target.x - safeRadius, y: target.y, z: target.z });
    case "+y":
      return Object.freeze({ x: target.x, y: target.y + safeRadius, z: target.z });
    case "-y":
      return Object.freeze({ x: target.x, y: target.y - safeRadius, z: target.z });
    case "+z":
      return Object.freeze({ x: target.x, y: target.y, z: target.z + safeRadius });
    case "-z":
      return Object.freeze({ x: target.x, y: target.y, z: target.z - safeRadius });
  }
}

export interface StudioVarco3dLightingPopoverAccessibilityProps {
  readonly popover: "auto";
  readonly inert: boolean;
  readonly dialButtonProps: {
    readonly type: "button";
    readonly role: "slider";
    readonly "aria-label": string;
    readonly "aria-valuemin": 0;
    readonly "aria-valuemax": 359;
    readonly "aria-valuenow": number;
    readonly "aria-valuetext": string;
  };
  readonly previewImageProps: {
    readonly src: string;
    readonly alt: "";
    readonly draggable: false;
  };
  readonly dialRingSvgProps: {
    readonly "aria-hidden": "true";
  };
}

/**
 * `LightingPopover` 및 `LightingRotationDial`의 표준 HTML/ARIA 접근성 속성 계약을 생성합니다 (`modern-web-guidance` `html`).
 */
export function buildStudioVarco3dLightingPopoverA11yProps(
  state: StudioVarco3dViewportHudState,
): StudioVarco3dLightingPopoverAccessibilityProps {
  const deg = lightingRadToDialDeg(state.lightingRotationRad);
  const env = STUDIO_VARCO3D_ENVIRONMENTS[state.environmentId];
  return Object.freeze({
    popover: "auto",
    inert: !state.isLightingPopoverOpen,
    dialButtonProps: Object.freeze({
      type: "button",
      role: "slider",
      "aria-label": `${env.labelKo} 조명 회전`,
      "aria-valuemin": 0,
      "aria-valuemax": 359,
      "aria-valuenow": deg,
      "aria-valuetext": `${deg}°`,
    }),
    previewImageProps: Object.freeze({ src: env.previewPath, alt: "", draggable: false }),
    dialRingSvgProps: Object.freeze({ "aria-hidden": "true" }),
  });
}

export interface StudioVarco3dDccBridgePayload {
  readonly targetApp: StudioVarco3dBridgeTarget;
  readonly assetId: string;
  readonly format: "glb" | "fbx" | "obj";
  readonly pivotToBottom: boolean;
  readonly faceTopology: StudioVarco3dFaceTopology;
  readonly environmentId: StudioVarco3dEnvironmentId;
  readonly lightingRotationDeg: number;
}

/** DCC 브리지(`blender`, `unreal`, `unity`, `3dsmax`, `maya`, `slicer`) 원클릭 전송 페이로드를 조립합니다. */
export function buildStudioVarco3dDccBridgePayload(
  state: StudioVarco3dViewportHudState,
  assetId: string,
  targetApp: StudioVarco3dBridgeTarget,
): StudioVarco3dDccBridgePayload {
  const format =
    targetApp === "slicer"
      ? "obj"
      : targetApp === "unreal" || targetApp === "unity" || targetApp === "3dsmax" || targetApp === "maya"
        ? "fbx"
        : "glb";
  return Object.freeze({
    targetApp,
    assetId: assetId.trim() || "untitled-varco3d-asset",
    format,
    pivotToBottom: state.pivotToBottom,
    faceTopology: state.faceTopology,
    environmentId: state.environmentId,
    lightingRotationDeg: lightingRadToDialDeg(state.lightingRotationRad),
  });
}
