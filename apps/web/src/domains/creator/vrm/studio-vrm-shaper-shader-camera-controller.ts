/**
 * studio-vrm-shaper-shader-camera-controller.ts
 *
 * SHAPER (`com.StudioHORANG.SHAPER` v1.05, `Assembly-CSharp.dll`
 * SHA-256: `cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d`)
 * 역공학 증거에 기반한 1) 툰/모델링(MatCap) 듀얼 셰이더·조명/그림자 경계 단축키 컨트롤러 및
 * 2) 3-DCC(Unity / Blender / 3ds Max) 카메라 내비게이션 스타일 엔진.
 *
 * 역공학 근거 메타데이터 토큰:
 * - `MaterialData` (`0x02000045`): `hC`, `sC`, `ssC`, `ssL`, `ssW`, `rsC`, `rsL`, `rsW`, `olC`, `olT`, `olP`, `lAX`, `lAY`
 * - `SettingManager` (`0x02000054`): `toonShade`, `modelingShade`, `simpleDisableInlineMatCapShader`, `rotateSpeed`, `moveSpeed`, `zoomSpeed`
 * - `InputStyle` (`0x02000053`): `"unity"` | `"blender"` | `"max"`
 * - `CameraManager` (`0x0200001c`): 뷰포트 Orbit/Pan/Zoom 및 `[F5]` 카메라 리셋
 */

export const SHAPER_RE_EVIDENCE_METADATA = {
  assemblySha256: "cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d",
  materialDataToken: "0x02000045",
  settingManagerToken: "0x02000054",
  inputStyleToken: "0x02000053",
  cameraManagerToken: "0x0200001c",
} as const;

export type ShaperShaderMode = "toon" | "modeling-matcap";

export type ShaperLightSourceMode = "front" | "scene-directional";

export type ShaperInputStyle = "unity" | "blender" | "max";

export type ShaperCameraActionKind = "orbit" | "pan" | "zoom" | "none";

export interface ShaperRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * `MaterialData` (`0x02000045`) 필드 정합 모델.
 * - `hC`: 헤어 기본색 (Hair Color)
 * - `sC`: 피부 기본색 (Skin Color)
 * - `ssC`: 툰 그림자 색 (Shadow Shade Color)
 * - `ssL`: 툰 그림자 경계 위치 (Shadow Shade Location, `0..1`)
 * - `ssW`: 툰 그림자 블러 폭 (Shadow Shade Width, `0..1`)
 * - `rsC`: 반사광/림라이트 색 (Reflection/Rim Shade Color)
 * - `rsL`: 반사광/림라이트 경계 위치 (Reflection/Rim Shade Location, `0..1`)
 * - `rsW`: 반사광/림라이트 블러 폭 (Reflection/Rim Shade Width, `0..1`)
 * - `olC`: 외곽선 색 (Outline Color)
 * - `olT`: 외곽선 두께 (Outline Thickness, `0..5`)
 * - `olP`: 외곽선 강도 (Outline Power, `0..1`)
 * - `lAX`: 씬 디렉셔널 라이트 X축 피치 각도 (`-89..89` deg)
 * - `lAY`: 씬 디렉셔널 라이트 Y축 요 각도 (`-180..180` deg)
 */
export interface ShaperMaterialData {
  readonly hC: ShaperRgbColor;
  readonly sC: ShaperRgbColor;
  readonly ssC: ShaperRgbColor;
  readonly ssL: number;
  readonly ssW: number;
  readonly rsC: ShaperRgbColor;
  readonly rsL: number;
  readonly rsW: number;
  readonly olC: ShaperRgbColor;
  readonly olT: number;
  readonly olP: number;
  readonly lAX: number;
  readonly lAY: number;
}

export interface ShaperShaderPipelineState {
  readonly shaderMode: ShaperShaderMode;
  readonly lightSourceMode: ShaperLightSourceMode;
  readonly material: ShaperMaterialData;
}

export interface ShaperRampStepParams {
  readonly threshold: number;
  readonly featherWidth: number;
  readonly lowerEdge: number;
  readonly upperEdge: number;
}

export interface ShaperShaderUniforms {
  readonly shaderVariant: "toonShade" | "simpleDisableInlineMatCapShader";
  readonly matCapEnabled: boolean;
  readonly inlineOutlineDisabled: boolean;
  readonly lightSourceMode: ShaperLightSourceMode;
  readonly lightDirection: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly hairColor: ShaperRgbColor;
  readonly skinColor: ShaperRgbColor;
  readonly shadowColor: ShaperRgbColor;
  readonly shadowRamp: ShaperRampStepParams;
  readonly rimLight: ShaperRampStepParams & {
    readonly color: ShaperRgbColor;
    readonly active: boolean;
  };
  readonly outline: {
    readonly color: ShaperRgbColor;
    readonly effectiveThickness: number;
    readonly power: number;
  };
}

export interface ShaperKeyboardShortcutEvent {
  readonly key: string;
  readonly code?: string;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

export interface ShaperLightingShortcutOptions {
  readonly angleStepDeg?: number;
  readonly shadowLocationStep?: number;
  readonly shadowWidthStep?: number;
  readonly rimStep?: number;
}

export type ShaperShortcutCommand =
  | "toggle-shader-mode"
  | "toggle-light-source-mode"
  | "rotate-light-angle"
  | "adjust-shadow-boundary"
  | "adjust-shadow-feather-and-rim"
  | null;

export interface ShaperLightingShortcutResult {
  readonly state: ShaperShaderPipelineState;
  readonly handled: boolean;
  readonly command: ShaperShortcutCommand;
}

export interface ShaperCameraSpeedConfig {
  readonly rotateSpeed: number;
  readonly moveSpeed: number;
  readonly zoomSpeed: number;
}

export interface ShaperPointerInputEvent {
  readonly button: number;
  readonly buttons?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly wheelDeltaY?: number;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

export interface ShaperCameraPointerResolution {
  readonly action: ShaperCameraActionKind;
  readonly inputStyle: ShaperInputStyle;
  readonly effectiveSpeed: number;
  readonly yawDeltaDeg: number;
  readonly pitchDeltaDeg: number;
  readonly panDeltaX: number;
  readonly panDeltaY: number;
  readonly zoomDelta: number;
}

export interface ShaperCameraViewState {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distance: number;
  readonly target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly fovDeg: number;
}

export const DEFAULT_SHAPER_CAMERA_SPEEDS: ShaperCameraSpeedConfig = {
  rotateSpeed: 0.35,
  moveSpeed: 0.012,
  zoomSpeed: 0.15,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round6(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function wrapAngleDeg180(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  let wrapped = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && angleDeg > 0) {
    wrapped = 180;
  }
  return round6(wrapped);
}

export function sanitizeShaperRgbColor(color: ShaperRgbColor): ShaperRgbColor {
  return {
    r: round6(clamp01(color.r)),
    g: round6(clamp01(color.g)),
    b: round6(clamp01(color.b)),
  };
}

export function createDefaultShaperMaterialData(
  overrides: Partial<ShaperMaterialData> = {},
): ShaperMaterialData {
  return {
    hC: sanitizeShaperRgbColor(overrides.hC ?? { r: 0.22, g: 0.18, b: 0.16 }),
    sC: sanitizeShaperRgbColor(overrides.sC ?? { r: 0.98, g: 0.9, b: 0.85 }),
    ssC: sanitizeShaperRgbColor(overrides.ssC ?? { r: 0.82, g: 0.68, b: 0.64 }),
    ssL: round6(clamp01(overrides.ssL ?? 0.5)),
    ssW: round6(clamp01(overrides.ssW ?? 0.08)),
    rsC: sanitizeShaperRgbColor(overrides.rsC ?? { r: 1, g: 0.96, b: 0.92 }),
    rsL: round6(clamp01(overrides.rsL ?? 0.78)),
    rsW: round6(clamp01(overrides.rsW ?? 0.06)),
    olC: sanitizeShaperRgbColor(overrides.olC ?? { r: 0.15, g: 0.11, b: 0.1 }),
    olT: round6(clamp(overrides.olT ?? 1.2, 0, 5)),
    olP: round6(clamp01(overrides.olP ?? 0.85)),
    lAX: round6(clamp(overrides.lAX ?? 22, -89, 89)),
    lAY: wrapAngleDeg180(overrides.lAY ?? -30),
  };
}

export function createDefaultShaperShaderPipelineState(
  overrides: Partial<ShaperShaderPipelineState> = {},
): ShaperShaderPipelineState {
  return {
    shaderMode: overrides.shaderMode ?? "toon",
    lightSourceMode: overrides.lightSourceMode ?? "scene-directional",
    material: createDefaultShaperMaterialData(overrides.material),
  };
}

/**
 * `[Space]` 단축키: 툰 셰이더(`toonShade`) ↔ 모델링 MatCap 셰이더(`modelingShade` / `simpleDisableInlineMatCapShader`) 즉시 토글.
 */
export function toggleShaperShaderMode(
  state: ShaperShaderPipelineState,
): ShaperShaderPipelineState {
  return {
    ...state,
    shaderMode: state.shaderMode === "toon" ? "modeling-matcap" : "toon",
  };
}

/**
 * `[F12]` 단축키: 정면광(`"front"`) ↔ 씬 디렉셔널 라이트(`"scene-directional"`) 즉시 토글.
 */
export function toggleShaperLightSourceMode(
  state: ShaperShaderPipelineState,
): ShaperShaderPipelineState {
  return {
    ...state,
    lightSourceMode:
      state.lightSourceMode === "front" ? "scene-directional" : "front",
  };
}

/**
 * SHAPER 뷰포트 조명·셰이더 키보드 단축키 적용:
 * - `[Space]`: `toon` ↔ `modeling-matcap` 토글
 * - `[F12]`: `front` ↔ `scene-directional` 토글
 * - `[ArrowUp/Down/Left/Right]`: 씬 조명 각도(`lAX`, `lAY`) 회전
 * - `[Alt] + [ArrowLeft/Right]`: 툰 그림자 경계 위치(`ssL`, `0..1`) 미세 조절
 * - `[Shift] + [Alt] + [ArrowLeft/Right]`: 그림자 블러 폭(`ssW`) 및 반사광/림라이트(`rsL`, `rsW`) 조절
 * - `[Shift] + [Alt] + [ArrowUp/Down]`: 반사광/림라이트 경계(`rsL`) 및 색상(`rsC`) 밝기 미세 조절
 */
export function applyShaperLightingShortcut(
  state: ShaperShaderPipelineState,
  event: ShaperKeyboardShortcutEvent,
  options: ShaperLightingShortcutOptions = {},
): ShaperLightingShortcutResult {
  const angleStepDeg = clamp(options.angleStepDeg ?? 5, 0.25, 45);
  const shadowLocationStep = clamp(options.shadowLocationStep ?? 0.025, 0.001, 0.25);
  const shadowWidthStep = clamp(options.shadowWidthStep ?? 0.015, 0.001, 0.25);
  const rimStep = clamp(options.rimStep ?? 0.02, 0.001, 0.25);

  if (event.ctrlKey || event.metaKey) {
    return { state, handled: false, command: null };
  }

  if (event.key === " " || event.code === "Space") {
    return {
      state: toggleShaperShaderMode(state),
      handled: true,
      command: "toggle-shader-mode",
    };
  }

  if (event.key === "F12" || event.code === "F12") {
    return {
      state: toggleShaperLightSourceMode(state),
      handled: true,
      command: "toggle-light-source-mode",
    };
  }

  const isLeft = event.key === "ArrowLeft" || event.code === "ArrowLeft";
  const isRight = event.key === "ArrowRight" || event.code === "ArrowRight";
  const isUp = event.key === "ArrowUp" || event.code === "ArrowUp";
  const isDown = event.key === "ArrowDown" || event.code === "ArrowDown";

  if (!isLeft && !isRight && !isUp && !isDown) {
    return { state, handled: false, command: null };
  }

  const horizontalSign = isRight ? 1 : isLeft ? -1 : 0;
  const verticalSign = isUp ? 1 : isDown ? -1 : 0;

  // [Shift] + [Alt] + 방향키: 그림자 블러 폭(ssW) 및 반사광/림라이트(rsL, rsW, rsC) 조절
  if (event.altKey && event.shiftKey) {
    const nextMaterial: ShaperMaterialData = {
      ...state.material,
      ssW: round6(clamp01(state.material.ssW + horizontalSign * shadowWidthStep)),
      rsW: round6(clamp01(state.material.rsW + horizontalSign * rimStep)),
      rsL: round6(
        clamp01(
          state.material.rsL +
            horizontalSign * (rimStep * 0.5) +
            verticalSign * rimStep,
        ),
      ),
      rsC:
        verticalSign !== 0
          ? sanitizeShaperRgbColor({
              r: state.material.rsC.r + verticalSign * (rimStep * 0.5),
              g: state.material.rsC.g + verticalSign * (rimStep * 0.5),
              b: state.material.rsC.b + verticalSign * (rimStep * 0.5),
            })
          : state.material.rsC,
    };
    return {
      state: { ...state, material: nextMaterial },
      handled: true,
      command: "adjust-shadow-feather-and-rim",
    };
  }

  // [Alt] + [ArrowLeft/Right]: 툰 그림자 경계 위치(ssL, 0..1) 미세 조절
  if (event.altKey && horizontalSign !== 0) {
    const nextMaterial: ShaperMaterialData = {
      ...state.material,
      ssL: round6(clamp01(state.material.ssL + horizontalSign * shadowLocationStep)),
    };
    return {
      state: { ...state, material: nextMaterial },
      handled: true,
      command: "adjust-shadow-boundary",
    };
  }

  if (event.altKey) {
    return { state, handled: false, command: null };
  }

  // 일반 방향키: 씬 조명 각도(lAX, lAY) 회전
  const nextMaterial: ShaperMaterialData = {
    ...state.material,
    lAX: round6(clamp(state.material.lAX + verticalSign * angleStepDeg, -89, 89)),
    lAY: wrapAngleDeg180(state.material.lAY + horizontalSign * angleStepDeg),
  };

  return {
    state: {
      ...state,
      lightSourceMode: "scene-directional",
      material: nextMaterial,
    },
    handled: true,
    command: "rotate-light-angle",
  };
}

function buildRampStep(location: number, width: number): ShaperRampStepParams {
  const threshold = round6(clamp01(location));
  const featherWidth = round6(clamp01(width));
  const halfWidth = featherWidth * 0.5;
  return {
    threshold,
    featherWidth,
    lowerEdge: round6(clamp01(threshold - halfWidth)),
    upperEdge: round6(clamp01(threshold + halfWidth)),
  };
}

/**
 * `MaterialData` (`0x02000045`) 및 셰이더/조명 상태로부터 정규화된 3D 라이트 방향 벡터와
 * 툰 램프 스텝·외곽선 유니폼을 계산한다.
 */
export function computeShaperShaderUniforms(
  state: ShaperShaderPipelineState,
): ShaperShaderUniforms {
  const { material, shaderMode, lightSourceMode } = state;
  const isMatCap = shaderMode === "modeling-matcap";

  let lightDirection = { x: 0, y: 0, z: 1 };
  if (lightSourceMode === "scene-directional" && !isMatCap) {
    const pitchRad = (clamp(material.lAX, -89, 89) * Math.PI) / 180;
    const yawRad = (wrapAngleDeg180(material.lAY) * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);
    const rawX = Math.sin(yawRad) * cosPitch;
    const rawY = Math.sin(pitchRad);
    const rawZ = Math.cos(yawRad) * cosPitch;
    const length = Math.hypot(rawX, rawY, rawZ) || 1;
    lightDirection = {
      x: round6(rawX / length),
      y: round6(rawY / length),
      z: round6(rawZ / length),
    };
  }

  const shadowRamp = buildRampStep(material.ssL, material.ssW);
  const rimRamp = buildRampStep(material.rsL, material.rsW);
  const rimLuminance =
    material.rsC.r * 0.2126 + material.rsC.g * 0.7152 + material.rsC.b * 0.0722;

  return {
    shaderVariant: isMatCap ? "simpleDisableInlineMatCapShader" : "toonShade",
    matCapEnabled: isMatCap,
    inlineOutlineDisabled: isMatCap,
    lightSourceMode,
    lightDirection,
    hairColor: sanitizeShaperRgbColor(material.hC),
    skinColor: sanitizeShaperRgbColor(material.sC),
    shadowColor: sanitizeShaperRgbColor(material.ssC),
    shadowRamp,
    rimLight: {
      ...rimRamp,
      color: sanitizeShaperRgbColor(material.rsC),
      active: !isMatCap && rimLuminance > 0.01 && material.rsW > 0,
    },
    outline: {
      color: sanitizeShaperRgbColor(material.olC),
      effectiveThickness: isMatCap
        ? 0
        : round6(clamp(material.olT, 0, 5) * clamp01(material.olP)),
      power: round6(clamp01(material.olP)),
    },
  };
}

/**
 * 3-DCC (`InputStyle` `0x02000053`: `"unity"` | `"blender"` | `"max"`) 마우스/포인터 액션 판정:
 * - `unity`: 우클릭 또는 Alt+좌클릭 Orbit, 휠클릭 Pan, 휠 스크롤 또는 Alt+우클릭 Zoom
 * - `blender`: 휠클릭 Orbit, Shift+휠클릭 Pan, Ctrl+휠클릭 또는 휠 스크롤 Zoom
 * - `max` (3ds Max): Alt+휠클릭 Orbit, 휠클릭 Pan, Ctrl+Alt+휠클릭 또는 휠 스크롤 Zoom
 */
export function resolveShaperCameraPointerAction(
  inputStyle: ShaperInputStyle,
  event: ShaperPointerInputEvent,
  speeds: Partial<ShaperCameraSpeedConfig> = {},
): ShaperCameraPointerResolution {
  const rotateSpeed = clamp(
    speeds.rotateSpeed ?? DEFAULT_SHAPER_CAMERA_SPEEDS.rotateSpeed,
    0.01,
    5,
  );
  const moveSpeed = clamp(
    speeds.moveSpeed ?? DEFAULT_SHAPER_CAMERA_SPEEDS.moveSpeed,
    0.0005,
    1,
  );
  const zoomSpeed = clamp(
    speeds.zoomSpeed ?? DEFAULT_SHAPER_CAMERA_SPEEDS.zoomSpeed,
    0.01,
    5,
  );

  const deltaX = Number.isFinite(event.deltaX) ? (event.deltaX ?? 0) : 0;
  const deltaY = Number.isFinite(event.deltaY) ? (event.deltaY ?? 0) : 0;
  const wheelDeltaY = Number.isFinite(event.wheelDeltaY) ? (event.wheelDeltaY ?? 0) : 0;
  const alt = Boolean(event.altKey);
  const shift = Boolean(event.shiftKey);
  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);

  // 모든 DCC 프리셋에서 마우스 휠 스크롤은 즉시 줌으로 처리
  if (wheelDeltaY !== 0) {
    return {
      action: "zoom",
      inputStyle,
      effectiveSpeed: zoomSpeed,
      yawDeltaDeg: 0,
      pitchDeltaDeg: 0,
      panDeltaX: 0,
      panDeltaY: 0,
      zoomDelta: round6((-wheelDeltaY / 120) * zoomSpeed),
    };
  }

  let action: ShaperCameraActionKind = "none";

  if (inputStyle === "unity") {
    if (alt && event.button === 2) {
      action = "zoom";
    } else if (event.button === 2 || (alt && event.button === 0)) {
      action = "orbit";
    } else if (event.button === 1) {
      action = "pan";
    }
  } else if (inputStyle === "blender") {
    if (event.button === 1) {
      if (ctrlOrMeta) {
        action = "zoom";
      } else if (shift) {
        action = "pan";
      } else {
        action = "orbit";
      }
    }
  } else if (inputStyle === "max") {
    if (event.button === 1) {
      if (ctrlOrMeta && alt) {
        action = "zoom";
      } else if (alt) {
        action = "orbit";
      } else {
        action = "pan";
      }
    }
  }

  if (action === "orbit") {
    return {
      action: "orbit",
      inputStyle,
      effectiveSpeed: rotateSpeed,
      yawDeltaDeg: round6(deltaX * rotateSpeed),
      pitchDeltaDeg: round6(-deltaY * rotateSpeed),
      panDeltaX: 0,
      panDeltaY: 0,
      zoomDelta: 0,
    };
  }

  if (action === "pan") {
    return {
      action: "pan",
      inputStyle,
      effectiveSpeed: moveSpeed,
      yawDeltaDeg: 0,
      pitchDeltaDeg: 0,
      panDeltaX: round6(-deltaX * moveSpeed),
      panDeltaY: round6(deltaY * moveSpeed),
      zoomDelta: 0,
    };
  }

  if (action === "zoom") {
    const dragScalar = deltaY !== 0 ? -deltaY : deltaX;
    return {
      action: "zoom",
      inputStyle,
      effectiveSpeed: zoomSpeed,
      yawDeltaDeg: 0,
      pitchDeltaDeg: 0,
      panDeltaX: 0,
      panDeltaY: 0,
      zoomDelta: round6(dragScalar * zoomSpeed * 0.1),
    };
  }

  return {
    action: "none",
    inputStyle,
    effectiveSpeed: 0,
    yawDeltaDeg: 0,
    pitchDeltaDeg: 0,
    panDeltaX: 0,
    panDeltaY: 0,
    zoomDelta: 0,
  };
}

export function createDefaultShaperCameraViewState(
  overrides: Partial<ShaperCameraViewState> = {},
): ShaperCameraViewState {
  return {
    yawDeg: wrapAngleDeg180(overrides.yawDeg ?? 0),
    pitchDeg: round6(clamp(overrides.pitchDeg ?? 8, -85, 85)),
    distance: round6(clamp(overrides.distance ?? 2.6, 0.35, 25)),
    target: {
      x: round6(overrides.target?.x ?? 0),
      y: round6(overrides.target?.y ?? 1.35),
      z: round6(overrides.target?.z ?? 0),
    },
    fovDeg: round6(clamp(overrides.fovDeg ?? 32, 10, 90)),
  };
}

/**
 * `[F5]` 카메라 뷰 리셋 (`CameraManager` `0x0200001c`).
 */
export function resetShaperCameraView(
  _current?: ShaperCameraViewState,
  preset: Partial<ShaperCameraViewState> = {},
): ShaperCameraViewState {
  return createDefaultShaperCameraViewState(preset);
}

export function applyShaperCameraPointerDelta(
  view: ShaperCameraViewState,
  inputStyle: ShaperInputStyle,
  event: ShaperPointerInputEvent,
  speeds: Partial<ShaperCameraSpeedConfig> = {},
): ShaperCameraViewState {
  const resolved = resolveShaperCameraPointerAction(inputStyle, event, speeds);
  if (resolved.action === "none") {
    return view;
  }

  if (resolved.action === "orbit") {
    return {
      ...view,
      yawDeg: wrapAngleDeg180(view.yawDeg + resolved.yawDeltaDeg),
      pitchDeg: round6(clamp(view.pitchDeg + resolved.pitchDeltaDeg, -85, 85)),
    };
  }

  if (resolved.action === "pan") {
    return {
      ...view,
      target: {
        x: round6(view.target.x + resolved.panDeltaX),
        y: round6(view.target.y + resolved.panDeltaY),
        z: view.target.z,
      },
    };
  }

  return {
    ...view,
    distance: round6(clamp(view.distance - resolved.zoomDelta, 0.35, 25)),
  };
}
