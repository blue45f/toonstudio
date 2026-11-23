/**
 * 멀티 디바이스 주변기기 입력 오케스트레이터.
 *
 * - 디지타이저/스타일러스 필압 커브(light/balanced/heavy + 감마)·배럴 회전·기울기 음영·사이드 버튼 3단 매핑
 * - 마우스 속도 기반 자동 필압 테이퍼 + 자기 보정, 맥북 트랙패드 Force Touch·0° 자석 스냅,
 *   아이패드/터치스크린 2지 Undo·3지 Redo·롱프레스 스포이드 제스처 해석기
 * - TourBox/Loupedeck WebHID, 조이콘/게임패드, WebMIDI 노브, USB 풋페달 해석기
 */

import {
  FOOT_PEDAL_MAPPINGS,
  GAMEPAD_LEFT_HAND_MAPPINGS,
  PEN_SIDE_BUTTON_ACTION_LABELS,
  PEN_SIDE_BUTTON_PRESETS,
  STYLUS_PRESSURE_PRESETS,
  WEBHID_CONTROLLER_PRESETS,
  WEBMIDI_CC_BINDINGS,
  type FootPedalBinding,
  type FootPedalSlot,
  type GamepadLeftHandBinding,
  type PenSideButtonActionId,
  type PenSideButtonMapping,
  type PenSideButtonPreset,
  type PenSideButtonSlot,
  type PressureCurvePresetId,
  type StylusPressureCurveConfig,
  type WebHidControlBinding,
  type WebHidControllerPreset,
  type WebHidControllerPresetId,
  type WebMidiKnobBinding,
} from "./peripheral-presets-catalog";
import {
  appendSpatialRibbonPoint,
  createArSmartGlassTracingState,
  createWebXrDirectorSession,
  createWebcamQuickHudAdapter,
  detectBrowserHardwareAndNextGenCapabilities,
  setWebXrDirectorMode,
  updateArTracingState,
  type ArSmartGlassTracingState,
  type BrowserHardwareCapabilityItem,
  type BrowserHardwareCapabilityReport,
  type BrowserHardwareProbeEnv,
  type HardwareCapabilityStatus,
  type SpatialRibbonPoint,
  type WebXrDirectorSessionState,
  type WebXrSessionMode,
  type WebcamQuickHudAdapter,
  type WebcamQuickHudSignal,
  type WebcamQuickHudState,
} from "./peripheral-spatial-and-capabilities";

export {
  FOOT_PEDAL_MAPPINGS,
  GAMEPAD_LEFT_HAND_MAPPINGS,
  PEN_SIDE_BUTTON_ACTION_LABELS,
  PEN_SIDE_BUTTON_PRESETS,
  STYLUS_PRESSURE_PRESETS,
  WEBHID_CONTROLLER_PRESETS,
  WEBMIDI_CC_BINDINGS,
  appendSpatialRibbonPoint,
  createArSmartGlassTracingState,
  createWebXrDirectorSession,
  createWebcamQuickHudAdapter,
  detectBrowserHardwareAndNextGenCapabilities,
  setWebXrDirectorMode,
  updateArTracingState,
};
export type {
  ArSmartGlassTracingState,
  BrowserHardwareCapabilityItem,
  BrowserHardwareCapabilityReport,
  BrowserHardwareProbeEnv,
  FootPedalBinding,
  FootPedalSlot,
  GamepadLeftHandBinding,
  HardwareCapabilityStatus,
  PenSideButtonActionId,
  PenSideButtonMapping,
  PenSideButtonPreset,
  PenSideButtonSlot,
  PressureCurvePresetId,
  SpatialRibbonPoint,
  StylusPressureCurveConfig,
  WebHidControlBinding,
  WebHidControllerPreset,
  WebHidControllerPresetId,
  WebMidiKnobBinding,
  WebXrDirectorSessionState,
  WebXrSessionMode,
  WebcamQuickHudAdapter,
  WebcamQuickHudSignal,
  WebcamQuickHudState,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface StylusPressureResult {
  readonly rawPressure: number;
  readonly calibratedPressure: number;
  readonly strokeWidthFactor: number;
  readonly opacityFactor: number;
}

/** 디지타이저/스타일러스 필압 커브(light/balanced/heavy + 감마)를 적용해 선 굵기·불투명도를 계산한다. */
export function evaluateStylusPressureCurve(
  rawPressure: number,
  config: StylusPressureCurveConfig = STYLUS_PRESSURE_PRESETS.balanced,
): StylusPressureResult {
  const safeRaw = clamp(rawPressure, 0, 1);
  const deadzone = clamp(config.deadzone, 0, 0.25);
  const gamma = clamp(config.gamma, 0.35, 2.5);
  const minOutput = clamp(config.minOutput, 0, 0.4);
  const maxOutput = clamp(config.maxOutput, Math.max(0.5, minOutput + 0.1), 1);

  if (safeRaw <= deadzone) {
    return Object.freeze({
      rawPressure: safeRaw,
      calibratedPressure: 0,
      strokeWidthFactor: roundTo(minOutput, 3),
      opacityFactor: roundTo(Math.max(0.15, minOutput), 3),
    });
  }

  const normalized = (safeRaw - deadzone) / Math.max(0.001, 1 - deadzone);
  const curved = normalized ** gamma;
  const calibratedPressure = clamp(minOutput + curved * (maxOutput - minOutput), 0, 1);

  return Object.freeze({
    rawPressure: roundTo(safeRaw, 3),
    calibratedPressure: roundTo(calibratedPressure, 3),
    strokeWidthFactor: roundTo(0.2 + calibratedPressure * 1.15, 3),
    opacityFactor: roundTo(0.3 + calibratedPressure * 0.7, 3),
  });
}

export interface BarrelTwistResult {
  readonly normalizedAngleDeg: number;
  readonly effectiveNibAngleDeg: number;
  readonly calligraphyAspect: number;
}

/** 스타일러스 배럴 회전(twist, 0~359°)을 정규화하고 캘리그래피 납작 펜촉 종횡비를 계산한다. */
export function evaluateBarrelTwist(twistDeg: number, baseAngleDeg: number = 0): BarrelTwistResult {
  const safeTwist = Number.isFinite(twistDeg) ? ((twistDeg % 360) + 360) % 360 : 0;
  const safeBase = Number.isFinite(baseAngleDeg) ? baseAngleDeg : 0;
  const effectiveNibAngleDeg = (((safeTwist + safeBase) % 360) + 360) % 360;
  const rad = (effectiveNibAngleDeg * Math.PI) / 180;
  const calligraphyAspect = roundTo(0.38 + Math.abs(Math.sin(rad)) * 0.62, 3);
  return Object.freeze({
    normalizedAngleDeg: roundTo(safeTwist, 1),
    effectiveNibAngleDeg: roundTo(effectiveNibAngleDeg, 1),
    calligraphyAspect,
  });
}

export interface StylusTiltShadingResult {
  readonly tiltMagnitude: number;
  readonly azimuthDeg: number;
  readonly shadingWidthMultiplier: number;
  readonly grainIntensity: number;
  readonly isBroadsideShading: boolean;
}

/** 스타일러스 X/Y 기울기(-90~90°)로부터 연필·목탄 측면 눕힘 음영 계수와 종이 입자 강도를 산출한다. */
export function evaluateStylusTiltShading(tiltXDeg: number, tiltYDeg: number): StylusTiltShadingResult {
  const tx = clamp(tiltXDeg, -90, 90);
  const ty = clamp(tiltYDeg, -90, 90);
  const tiltMagnitude = clamp(Math.hypot(tx, ty) / 70, 0, 1);
  const azimuthRad = Math.atan2(ty, tx);
  const azimuthDeg = (((azimuthRad * 180) / Math.PI) + 360) % 360;
  const shadingWidthMultiplier = roundTo(1 + tiltMagnitude ** 1.35 * 1.8, 3);
  const grainIntensity = roundTo(0.15 + tiltMagnitude * 0.85, 3);
  return Object.freeze({
    tiltMagnitude: roundTo(tiltMagnitude, 3),
    azimuthDeg: roundTo(azimuthDeg, 1),
    shadingWidthMultiplier,
    grainIntensity,
    isBroadsideShading: tiltMagnitude >= 0.45,
  });
}

/** 펜 사이드 버튼 3단(하단·상단·테일 더블탭) 슬롯의 매핑 액션을 반환한다. */
export function resolvePenSideButtonAction(
  slot: PenSideButtonSlot,
  presetId: PenSideButtonPreset["id"] = "webtoon-ink",
): { readonly slot: PenSideButtonSlot; readonly actionId: PenSideButtonActionId; readonly labelKo: string } {
  const preset = PEN_SIDE_BUTTON_PRESETS[presetId];
  const actionId = preset.slots[slot];
  return Object.freeze({
    slot,
    actionId,
    labelKo: PEN_SIDE_BUTTON_ACTION_LABELS[actionId],
  });
}

export interface MouseVelocityTaperInput {
  readonly speedPxPerSec: number;
  readonly strokeProgress?: number;
  readonly magneticStabilizer?: number;
  readonly minWeight?: number;
  readonly maxWeight?: number;
}

export interface MouseVelocityTaperResult {
  readonly syntheticPressure: number;
  readonly taperWidthFactor: number;
  readonly magneticSmoothingAlpha: number;
  readonly phaseKo: string;
}

/** 마우스 이동 속도 기반 자동 필압 테이퍼 + 자기 보정(손떨림 안정화) 계수를 계산한다. */
export function computeMouseVelocityTaper(input: MouseVelocityTaperInput): MouseVelocityTaperResult {
  const speed = clamp(input.speedPxPerSec, 0, 4_000);
  const progress = clamp(input.strokeProgress ?? 0.5, 0, 1);
  const stabilizer = clamp(input.magneticStabilizer ?? 0.55, 0, 1);
  const minWeight = clamp(input.minWeight ?? 0.18, 0.05, 0.6);
  const maxWeight = clamp(input.maxWeight ?? 1.0, minWeight + 0.1, 1.3);

  const speedFactor = 1 / (1 + (speed / 720) ** 1.35);
  const endTaper =
    progress < 0.12
      ? 0.55 + (progress / 0.12) * 0.45
      : progress > 0.82
        ? 1 - ((progress - 0.82) / 0.18) * 0.72
        : 1;
  const syntheticPressure = clamp(minWeight + speedFactor * endTaper * (maxWeight - minWeight), minWeight, maxWeight);
  const magneticSmoothingAlpha = clamp(1 - stabilizer * (0.35 + 0.45 * speedFactor), 0.12, 0.95);
  const phaseKo =
    speed >= 1_200
      ? "고속 튕김 테이퍼 (날렵한 선 끝)"
      : speed <= 260
        ? "저속 정밀 자기 보정 (안정 선화)"
        : "표준 속도 자동 강약 보정";

  return Object.freeze({
    syntheticPressure: roundTo(syntheticPressure, 3),
    taperWidthFactor: roundTo(0.28 + syntheticPressure * 0.95, 3),
    magneticSmoothingAlpha: roundTo(magneticSmoothingAlpha, 3),
    phaseKo,
  });
}

export interface MagneticRotationSnapResult {
  readonly inputAngleDeg: number;
  readonly snappedAngleDeg: number;
  readonly didSnap: boolean;
  readonly detentLabelKo: string;
}

const MAGNETIC_CARDINAL_ANGLES = [0, 90, 180, 270] as const;

/** 트랙패드·핀치 회전 각도를 0°/90°/180°/270° 자석 구간(기본 ±6°)에 부드럽게 흡착한다. */
export function snapRotationWithMagnet(
  angleDeg: number,
  snapWindowDeg: number = 6,
): MagneticRotationSnapResult {
  const normalized = Number.isFinite(angleDeg) ? ((angleDeg % 360) + 360) % 360 : 0;
  const windowDeg = clamp(snapWindowDeg, 1, 20);
  for (const target of MAGNETIC_CARDINAL_ANGLES) {
    const distance = Math.min(Math.abs(normalized - target), 360 - Math.abs(normalized - target));
    if (distance <= windowDeg) {
      return Object.freeze({
        inputAngleDeg: roundTo(normalized, 1),
        snappedAngleDeg: target,
        didSnap: true,
        detentLabelKo: `${target}° 자석 스냅 고정`,
      });
    }
  }
  return Object.freeze({
    inputAngleDeg: roundTo(normalized, 1),
    snappedAngleDeg: roundTo(normalized, 1),
    didSnap: false,
    detentLabelKo: `${roundTo(normalized, 1)}° 자유 회전`,
  });
}

export interface TrackpadGestureInput {
  readonly pinchScale?: number;
  readonly rotationDeg?: number;
  readonly forceLevel?: number;
  readonly snapWindowDeg?: number;
}

export interface TrackpadGestureResult {
  readonly zoomMultiplier: number;
  readonly rotation: MagneticRotationSnapResult;
  readonly forceTouchTriggered: boolean;
  readonly forceActionId: "quick-eyedropper" | "none";
  readonly summaryKo: string;
}

/** 맥북 트랙패드 Force Touch(깊은 클릭 ≥ 0.72)와 핀치 줌·0° 자석 스냅을 동시에 해석한다. */
export function interpretTrackpadGesture(input: TrackpadGestureInput): TrackpadGestureResult {
  const zoomMultiplier = roundTo(clamp(input.pinchScale ?? 1, 0.25, 8), 3);
  const rotation = snapRotationWithMagnet(input.rotationDeg ?? 0, input.snapWindowDeg ?? 6);
  const forceLevel = clamp(input.forceLevel ?? 0, 0, 3);
  const forceTouchTriggered = forceLevel >= 0.72;
  const forceActionId = forceTouchTriggered ? "quick-eyedropper" : "none";
  const summaryKo = forceTouchTriggered
    ? `Force Touch 감지 · 퀵 스포이드 호출 · ${rotation.detentLabelKo}`
    : `줌 ${Math.round(zoomMultiplier * 100)}% · ${rotation.detentLabelKo}`;

  return Object.freeze({
    zoomMultiplier,
    rotation,
    forceTouchTriggered,
    forceActionId,
    summaryKo,
  });
}

export type TouchscreenGestureActionId =
  | "undo"
  | "redo"
  | "eyedropper"
  | "toggle-focus-hud"
  | "palm-rejected"
  | "none";

export interface TouchscreenGestureInput {
  readonly fingerCount: number;
  readonly durationMs: number;
  readonly moveDistancePx: number;
  readonly maxContactDiameterPx?: number;
}

export interface TouchscreenGestureResult {
  readonly action: TouchscreenGestureActionId;
  readonly labelKo: string;
}

/** 아이패드/터치스크린 2지 Undo·3지 Redo·1지 롱프레스 스포이드·4지 집중 토글·팜 리젝션 해석기. */
export function interpretTouchscreenGesture(input: TouchscreenGestureInput): TouchscreenGestureResult {
  if (typeof input.maxContactDiameterPx === "number" && input.maxContactDiameterPx >= 28) {
    return Object.freeze({ action: "palm-rejected", labelKo: "손바닥 오터치 차단 (팜 리젝션)" });
  }
  const fingers = Math.max(0, Math.round(input.fingerCount));
  const duration = Math.max(0, input.durationMs);
  const move = Math.max(0, input.moveDistancePx);

  if (move > 12) {
    return Object.freeze({ action: "none", labelKo: "팬·줌 이동 제스처" });
  }
  if (fingers === 1 && duration >= 420) {
    return Object.freeze({ action: "eyedropper", labelKo: "1지 롱프레스 → 스포이드 색 추출" });
  }
  if (duration <= 320) {
    if (fingers === 2) return Object.freeze({ action: "undo", labelKo: "2지 탭 → 실행 취소 (Undo)" });
    if (fingers === 3) return Object.freeze({ action: "redo", labelKo: "3지 탭 → 다시 실행 (Redo)" });
    if (fingers === 4) return Object.freeze({ action: "toggle-focus-hud", labelKo: "4지 탭 → 집중 캔버스 토글" });
  }
  return Object.freeze({ action: "none", labelKo: "대기 중" });
}

/** TourBox / Loupedeck WebHID 프리셋에서 컨트롤 ID에 해당하는 스튜디오 명령을 해석한다. */
export function resolveWebHidPresetCommand(
  presetId: WebHidControllerPresetId,
  controlId: string,
): WebHidControlBinding | null {
  const preset = WEBHID_CONTROLLER_PRESETS[presetId];
  return preset.bindings.find((item) => item.controlId === controlId) ?? null;
}

export interface GamepadSnapshotInput {
  readonly axisX?: number;
  readonly axisY?: number;
  readonly pressedButtons?: readonly string[];
  readonly deadzone?: number;
}

export interface GamepadInterpretedCommand {
  readonly brushSizeDeltaPx: number;
  readonly zoomDeltaPercent: number;
  readonly triggeredActions: readonly string[];
  readonly summaryKo: string;
}

/** 조이콘/게임패드 왼손 단축키 디바이스의 아날로그 스틱·트리거 입력을 스튜디오 명령으로 변환한다. */
export function interpretGamepadSnapshot(input: GamepadSnapshotInput): GamepadInterpretedCommand {
  const deadzone = clamp(input.deadzone ?? 0.18, 0.05, 0.5);
  const rawX = clamp(input.axisX ?? 0, -1, 1);
  const rawY = clamp(input.axisY ?? 0, -1, 1);
  const brushSizeDeltaPx = Math.abs(rawX) > deadzone ? Math.round(rawX * 8) : 0;
  const zoomDeltaPercent = Math.abs(rawY) > deadzone ? Math.round(-rawY * 15) : 0;
  const pressedSet = new Set(input.pressedButtons ?? []);
  const triggeredActions = GAMEPAD_LEFT_HAND_MAPPINGS.filter((item) => pressedSet.has(item.inputKey)).map(
    (item) => item.actionId,
  );
  const summaryKo =
    triggeredActions.length > 0
      ? `게임패드 실행: ${triggeredActions.join(", ")}`
      : brushSizeDeltaPx !== 0 || zoomDeltaPercent !== 0
        ? `스틱 조절 · 브러시 ${brushSizeDeltaPx >= 0 ? "+" : ""}${brushSizeDeltaPx}px · 줌 ${zoomDeltaPercent >= 0 ? "+" : ""}${zoomDeltaPercent}%`
        : "게임패드 중립 대기";

  return Object.freeze({
    brushSizeDeltaPx,
    zoomDeltaPercent,
    triggeredActions: Object.freeze(triggeredActions),
    summaryKo,
  });
}

export interface MidiControlChangeResult {
  readonly binding: WebMidiKnobBinding;
  readonly rawValue: number;
  readonly mappedValue: number;
  readonly formattedLabelKo: string;
}

/** WebMIDI 컨트롤 체인지(CC 0~127) 값을 바인딩된 브러시/회전/수분 파라미터 값으로 변환한다. */
export function interpretMidiControlChange(
  ccNumber: number,
  rawValue0to127: number,
  bindings: readonly WebMidiKnobBinding[] = WEBMIDI_CC_BINDINGS,
): MidiControlChangeResult | null {
  const binding = bindings.find((item) => item.ccNumber === ccNumber);
  if (!binding) return null;
  const safeRaw = Math.round(clamp(rawValue0to127, 0, 127));
  const ratio = safeRaw / 127;
  const mappedValue = Math.round(binding.minValue + ratio * (binding.maxValue - binding.minValue));
  return Object.freeze({
    binding,
    rawValue: safeRaw,
    mappedValue,
    formattedLabelKo: `${binding.targetLabelKo} ${mappedValue}${binding.unit}`,
  });
}

/** USB 3단 풋페달(좌/중/우) 밟힘·뗌 상태를 스튜디오 액션으로 해석한다. */
export function resolveFootPedalEvent(
  slot: FootPedalSlot,
  pressed: boolean,
  voiceMode: boolean = false,
): { readonly slot: FootPedalSlot; readonly active: boolean; readonly actionId: string; readonly labelKo: string } {
  const base = FOOT_PEDAL_MAPPINGS[slot];
  const actionId = slot === "right" && voiceMode ? "voice-bubble-toggle" : base.actionId;
  const labelKo =
    slot === "right" && voiceMode
      ? pressed
        ? "우측 페달 · 음성 말풍선 녹음 시작"
        : "우측 페달 · 음성 말풍선 녹음 종료"
      : `${base.labelKo} · ${base.actionLabelKo} (${pressed ? "작동" : "해제"})`;
  return Object.freeze({ slot, active: pressed, actionId, labelKo });
}
