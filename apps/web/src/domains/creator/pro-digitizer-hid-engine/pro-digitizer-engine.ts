/**
 * Wave 46B — 클린룸 프로 디지타이저·와콤·애플펜슬 프로·S펜·트랙패드 범용 입력 엔진.
 *
 * - 유료 소프트웨어 라이선스·DRM 우회나 사유 바이너리 역공학 없이 공개 표준 규격
 *   (W3C Pointer Events Level 3, USB HID Digitizer Usage Page 0x0D, Force Touch/Trackpad 멀티터치)만으로 동작한다.
 * - 순수 TypeScript 결정론적 연산(Web Storage · private Map store · BigInt 리터럴 · raw color 0건).
 */

import { assertHidEncodeInput, assertHidProjection, assertPointerBatch, MAX_DIGITIZER_JSON_CHARS, validateDigitizerConfig } from "./digitizer-input-contract";

export const DIGITIZER_CONFIG_SCHEMA_VERSION = "toonstudio.pro-digitizer-hid-engine.v1" as const;
export const USB_HID_USAGE_PAGE_DIGITIZER = 0x0d as const;
export const USB_HID_STANDARD_PEN_REPORT_ID = 0x02 as const;
export const USB_HID_STANDARD_REPORT_MIN_BYTES = 16 as const;
export const USB_HID_LOGICAL_COORD_MAX = 32767 as const;
export const USB_HID_DEFAULT_PRESSURE_MAX = 16383 as const;

export const USB_HID_DIGITIZER_USAGES = {
  inRange: 0x32, tipPressure: 0x30, invert: 0x3c, xTilt: 0x3d, yTilt: 0x3e,
  twist: 0x41, tipSwitch: 0x42, barrelSwitch: 0x44, eraser: 0x45,
  secondaryBarrelSwitch: 0x5a, dialGenericDesktop: 0x37,
} as const;

export const PRO_DIGITIZER_IDS = [
  "wacom-pro-pen-3", "wacom-art-pen-barrel", "apple-pencil-pro",
  "galaxy-spen-ble", "huion-pw600", "xppen-x3-pro", "macbook-force-trackpad",
] as const;
export type ProDigitizerProfileId = (typeof PRO_DIGITIZER_IDS)[number];
export type DigitizerFormFactor = "pen-tablet" | "pen-display" | "tablet-stylus" | "force-trackpad";

export const PRESSURE_CURVE_PRESET_IDS = [
  "soft-sketch", "linear-reference", "firm-gpen-ink", "heavy-calligraphy", "custom-bezier",
] as const;
export type PressureCurvePresetId = (typeof PRESSURE_CURVE_PRESET_IDS)[number];

export const CONTROL_TRIGGER_KINDS = [
  "express-key", "dial", "squeeze", "air-action", "trackpad-gesture", "pen-button",
] as const;
export type ControlTriggerKind = (typeof CONTROL_TRIGGER_KINDS)[number];

export const STUDIO_BINDING_ACTION_IDS = [
  "brush-size-up", "brush-size-down", "toggle-eraser", "undo", "redo",
  "pan-canvas", "rotate-canvas-cw", "rotate-canvas-ccw", "zoom-in", "zoom-out",
  "radial-quick-menu", "eyedropper", "next-layer", "prev-layer", "toggle-symmetry-ruler", "none",
] as const;
export type StudioBindingActionId = (typeof STUDIO_BINDING_ACTION_IDS)[number];

export interface DigitizerHardwareCapabilities {
  readonly altitudeAzimuth: boolean; readonly barrelRoll: boolean; readonly tangentialPressure: boolean;
  readonly hover: boolean; readonly squeeze: boolean; readonly airAction: boolean;
  readonly expressKeys: boolean; readonly dial: boolean; readonly trackpadGestures: boolean;
}

export interface ProDigitizerProfile {
  readonly id: ProDigitizerProfileId; readonly vendor: string;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly formFactor: DigitizerFormFactor; readonly openStandards: readonly string[];
  readonly pressureLevels: number; readonly initialActivationForceG: number;
  readonly nominalReportRateHz: number; readonly maxTiltDeg: number; readonly hoverHeightMm: number;
  readonly recommendedCurvePreset: Exclude<PressureCurvePresetId, "custom-bezier">;
  readonly capabilities: DigitizerHardwareCapabilities;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface HardwareCapabilityMatrixRow {
  readonly profileId: ProDigitizerProfileId; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly pressureLevels: number; readonly nominalReportRateHz: number;
  readonly maxTiltDeg: number; readonly hoverHeightMm: number;
  readonly capabilities: DigitizerHardwareCapabilities;
}

export interface PressureBezierPoint { readonly x: number; readonly y: number; }

export interface PressureCurveConfig {
  readonly presetId: PressureCurvePresetId;
  readonly p1: PressureBezierPoint; readonly p2: PressureBezierPoint;
  readonly deadzoneMin: number; readonly saturationMax: number;
  readonly outputMin: number; readonly outputMax: number;
}

export interface PressureCurvePresetSpec extends PressureCurveConfig {
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface RawPointerSample {
  readonly x: number; readonly y: number; readonly timestampMs: number; readonly pressure: number;
  readonly tiltX?: number; readonly tiltY?: number;
  readonly altitudeAngle?: number; readonly azimuthAngle?: number;
  readonly twist?: number; readonly tangentialPressure?: number;
  readonly isPredicted?: boolean; readonly pointerType?: "pen" | "touch" | "mouse";
}

export interface NormalizePointerBatchOptions {
  readonly profileId: ProDigitizerProfileId; readonly curve: PressureCurveConfig;
  readonly smoothingStrength?: number; readonly enablePrediction?: boolean;
}

export interface NormalizedPointerSample {
  readonly rawX: number; readonly rawY: number; readonly x: number; readonly y: number;
  readonly timestampMs: number; readonly deltaMs: number;
  readonly rawPressure: number; readonly calibratedPressure: number;
  readonly altitudeRad: number; readonly azimuthRad: number;
  readonly tiltMagnitude: number; readonly tiltShadingFactor: number;
  readonly barrelRollDeg: number; readonly barrelRollNative: boolean;
  readonly tangentialPressure: number; readonly velocityPxPerSec: number;
  readonly isPredicted: boolean; readonly pointerType: "pen" | "touch" | "mouse";
}

export interface NormalizedPointerBatchMetrics {
  readonly inputCount: number; readonly coalescedCount: number;
  readonly predictedCount: number; readonly droppedPredictedCount: number;
  readonly effectiveReportRateHz: number; readonly jitterReductionPct: number;
  readonly predictedLatencyGainMs: number; readonly averageCalibratedPressure: number;
  readonly averageTiltShadingFactor: number; readonly lastBarrelRollDeg: number;
}

export interface NormalizedPointerBatchResult {
  readonly profileId: ProDigitizerProfileId;
  readonly samples: readonly NormalizedPointerSample[];
  readonly metrics: NormalizedPointerBatchMetrics;
}

export type HidReportParseErrorCode =
  | "INVALID_BUFFER_TYPE" | "BUFFER_TOO_SHORT" | "UNSUPPORTED_REPORT_ID"
  | "COORDINATE_OUT_OF_RANGE" | "PRESSURE_OUT_OF_RANGE" | "INVALID_TILT_RANGE" | "INVALID_TWIST_RANGE";

export interface HidDigitizerFlags {
  readonly tipSwitch: boolean; readonly barrelSwitch: boolean; readonly secondaryBarrelSwitch: boolean;
  readonly eraser: boolean; readonly invert: boolean; readonly inRange: boolean; readonly rawBitfield: number;
}

export interface ParsedHidDigitizerReport {
  readonly usagePage: typeof USB_HID_USAGE_PAGE_DIGITIZER;
  readonly reportId: typeof USB_HID_STANDARD_PEN_REPORT_ID;
  readonly byteLength: number; readonly flags: HidDigitizerFlags;
  readonly x: number; readonly y: number; readonly xNorm: number; readonly yNorm: number;
  readonly tipPressure: number; readonly logicalPressureMax: number; readonly pressureNorm: number;
  readonly tiltXDeg: number; readonly tiltYDeg: number;
  readonly altitudeRad: number; readonly azimuthRad: number;
  readonly twistDeg: number; readonly dialDelta: number;
  readonly expressKeyMask: number; readonly activeExpressKeys: readonly number[];
}

export type HidDigitizerParseResult =
  | { readonly ok: true; readonly report: ParsedHidDigitizerReport }
  | { readonly ok: false; readonly errorCode: HidReportParseErrorCode; readonly messageKo: string; readonly messageEn: string };

export interface HidDigitizerReportEncodeInput {
  readonly reportId?: number;
  readonly tipSwitch?: boolean; readonly barrelSwitch?: boolean; readonly secondaryBarrelSwitch?: boolean;
  readonly eraser?: boolean; readonly invert?: boolean; readonly inRange?: boolean;
  readonly x: number; readonly y: number; readonly tipPressure: number;
  readonly logicalPressureMax?: number; readonly tiltXDeg?: number; readonly tiltYDeg?: number;
  readonly twistDeg?: number; readonly dialDelta?: number; readonly expressKeyMask?: number;
}

export interface StudioBindingActionSpec {
  readonly id: StudioBindingActionId; readonly labelKo: string; readonly labelEn: string;
  readonly category: "brush" | "canvas" | "history" | "navigation" | "none";
}

export interface ShortcutBinding {
  readonly id: string; readonly triggerKind: ControlTriggerKind; readonly triggerCode: string;
  readonly triggerLabelKo: string; readonly triggerLabelEn: string;
  readonly actionId: StudioBindingActionId; readonly enabled: boolean;
}

export interface DigitizerCalibrationSnapshot {
  readonly profileId: ProDigitizerProfileId; readonly curve: PressureCurveConfig;
  readonly smoothingStrength: number; readonly enablePrediction: boolean;
  readonly bindings: readonly ShortcutBinding[];
}

export type ImportConfigErrorCode =
  | "INVALID_JSON" | "INVALID_SCHEMA" | "INVALID_PROFILE_ID"
  | "INVALID_CURVE" | "INVALID_SETTINGS" | "INVALID_BINDINGS";

export type ImportDigitizerConfigResult =
  | { readonly ok: true; readonly config: DigitizerCalibrationSnapshot }
  | { readonly ok: false; readonly errorCode: ImportConfigErrorCode; readonly messageKo: string; readonly messageEn: string };

const DEFAULT_PROFILE: ProDigitizerProfile = {
  id: "wacom-pro-pen-3", vendor: "Wacom",
  labelKo: "Wacom Intuos Pro / Cintiq Pro · Pro Pen 3", labelEn: "Wacom Intuos Pro / Cintiq Pro · Pro Pen 3",
  shortLabelKo: "Wacom Pro Pen 3", shortLabelEn: "Wacom Pro Pen 3",
  formFactor: "pen-display", openStandards: ["W3C Pointer Events Level 3", "USB HID Digitizer Page 0x0D"],
  pressureLevels: 8192, initialActivationForceG: 1, nominalReportRateHz: 300, maxTiltDeg: 60, hoverHeightMm: 10,
  recommendedCurvePreset: "firm-gpen-ink",
  capabilities: { altitudeAzimuth: true, barrelRoll: false, tangentialPressure: false, hover: true, squeeze: false, airAction: false, expressKeys: true, dial: true, trackpadGestures: false },
  summaryKo: "8,192단계 필압·±60° 기울기·3버튼 사이드 스위치와 익스프레스키·다이얼 조합에 맞춘 표준 펜선 프로필",
  summaryEn: "8,192-level pressure, ±60° tilt, 3 side switches paired with ExpressKeys and rotary dial.",
};

export const PRO_DIGITIZER_PROFILES: readonly ProDigitizerProfile[] = [
  DEFAULT_PROFILE,
  {
    id: "wacom-art-pen-barrel", vendor: "Wacom",
    labelKo: "Wacom Art Pen / Airbrush (배럴 회전·휠)", labelEn: "Wacom Art Pen / Airbrush (Barrel Roll & Wheel)",
    shortLabelKo: "Wacom Art Pen", shortLabelEn: "Wacom Art Pen",
    formFactor: "pen-tablet", openStandards: ["W3C Pointer Events Level 3 (twist/tangentialPressure)", "USB HID Digitizer Page 0x0D"],
    pressureLevels: 8192, initialActivationForceG: 1, nominalReportRateHz: 240, maxTiltDeg: 60, hoverHeightMm: 10,
    recommendedCurvePreset: "heavy-calligraphy",
    capabilities: { altitudeAzimuth: true, barrelRoll: true, tangentialPressure: true, hover: true, squeeze: false, airAction: false, expressKeys: true, dial: true, trackpadGestures: false },
    summaryKo: "360° 배럴 회전(twist)과 에어브러시 핑거 휠(tangentialPressure)로 납작붓·칼리그래피 각도를 직접 제어",
    summaryEn: "360° barrel twist and airbrush finger-wheel tangential pressure for flat brushes and calligraphy.",
  },
  {
    id: "apple-pencil-pro", vendor: "Apple",
    labelKo: "Apple Pencil Pro (스퀴즈·배럴 롤·호버)", labelEn: "Apple Pencil Pro (Squeeze, Barrel Roll, Hover)",
    shortLabelKo: "Apple Pencil Pro", shortLabelEn: "Apple Pencil Pro",
    formFactor: "tablet-stylus", openStandards: ["W3C Pointer Events Level 3 (altitudeAngle/azimuthAngle/twist)", "Coalesced & Predicted Events"],
    pressureLevels: 4096, initialActivationForceG: 2, nominalReportRateHz: 240, maxTiltDeg: 65, hoverHeightMm: 12,
    recommendedCurvePreset: "soft-sketch",
    capabilities: { altitudeAzimuth: true, barrelRoll: true, tangentialPressure: false, hover: true, squeeze: true, airAction: false, expressKeys: false, dial: false, trackpadGestures: false },
    summaryKo: "자이로 기반 360° 배럴 롤, 12mm 호버 미리보기, 스퀴즈 퀵 팔레트 제스처를 지원하는 iPad 프로필",
    summaryEn: "Gyroscope 360° barrel roll, 12 mm hover preview, and squeeze palette gesture profile for iPad.",
  },
  {
    id: "galaxy-spen-ble", vendor: "Samsung",
    labelKo: "Galaxy S-Pen BLE (에어액션·저지연 호버)", labelEn: "Galaxy S-Pen BLE (Air Action & Hover)",
    shortLabelKo: "Galaxy S-Pen", shortLabelEn: "Galaxy S-Pen",
    formFactor: "tablet-stylus", openStandards: ["W3C Pointer Events Level 3", "Standard Air Action Key/Gesture Mapping"],
    pressureLevels: 4096, initialActivationForceG: 3, nominalReportRateHz: 240, maxTiltDeg: 60, hoverHeightMm: 14,
    recommendedCurvePreset: "soft-sketch",
    capabilities: { altitudeAzimuth: true, barrelRoll: false, tangentialPressure: false, hover: true, squeeze: false, airAction: true, expressKeys: false, dial: false, trackpadGestures: false },
    summaryKo: "14mm EMR 호버와 BLE 에어액션(스냅·원형 제스처)을 실행 취소·레이어 전환에 연결하는 모바일 프로필",
    summaryEn: "14 mm EMR hover and BLE Air Actions mapped to undo, brush sizing, and layer switching.",
  },
  {
    id: "huion-pw600", vendor: "Huion",
    labelKo: "Huion PenTech 4.0 PW600 (16,384 필압)", labelEn: "Huion PenTech 4.0 PW600 (16,384 Levels)",
    shortLabelKo: "Huion PW600", shortLabelEn: "Huion PW600",
    formFactor: "pen-display", openStandards: ["W3C Pointer Events Level 3", "USB HID Digitizer Page 0x0D"],
    pressureLevels: 16384, initialActivationForceG: 2, nominalReportRateHz: 300, maxTiltDeg: 60, hoverHeightMm: 10,
    recommendedCurvePreset: "firm-gpen-ink",
    capabilities: { altitudeAzimuth: true, barrelRoll: false, tangentialPressure: false, hover: true, squeeze: false, airAction: false, expressKeys: true, dial: true, trackpadGestures: false },
    summaryKo: "16,384단계 미세 필압 분해능과 300Hz 리포트율, 키다이얼 단축키 매핑을 활용하는 액정 타블렛 프로필",
    summaryEn: "16,384-level fine pressure quantization at 300 Hz with Keydial and ExpressKey bindings.",
  },
  {
    id: "xppen-x3-pro", vendor: "XP-Pen",
    labelKo: "XP-Pen X3 Pro Smart Chip (16,384 · 500Hz)", labelEn: "XP-Pen X3 Pro Smart Chip (16,384 · 500Hz)",
    shortLabelKo: "XP-Pen X3 Pro", shortLabelEn: "XP-Pen X3 Pro",
    formFactor: "pen-display", openStandards: ["W3C Pointer Events Level 3", "USB HID Digitizer Page 0x0D"],
    pressureLevels: 16384, initialActivationForceG: 3, nominalReportRateHz: 500, maxTiltDeg: 60, hoverHeightMm: 10,
    recommendedCurvePreset: "linear-reference",
    capabilities: { altitudeAzimuth: true, barrelRoll: false, tangentialPressure: false, hover: true, squeeze: false, airAction: false, expressKeys: true, dial: true, trackpadGestures: false },
    summaryKo: "16,384단계 스마트 칩 필압·최대 500Hz 고속 샘플링과 ACK05 휠 리모트 제어를 반영한 프로필",
    summaryEn: "16,384-level smart chip pressure up to 500 Hz coalesced rate with ACK05 dial remote mapping.",
  },
  {
    id: "macbook-force-trackpad", vendor: "Apple",
    labelKo: "MacBook Force Touch / Precision Trackpad", labelEn: "MacBook Force Touch / Precision Trackpad",
    shortLabelKo: "Force 트랙패드", shortLabelEn: "Force Trackpad",
    formFactor: "force-trackpad", openStandards: ["W3C Pointer Events Level 3", "Force Touch / Precision Multi-Touch Gestures"],
    pressureLevels: 4096, initialActivationForceG: 15, nominalReportRateHz: 240, maxTiltDeg: 0, hoverHeightMm: 0,
    recommendedCurvePreset: "soft-sketch",
    capabilities: { altitudeAzimuth: false, barrelRoll: false, tangentialPressure: true, hover: false, squeeze: false, airAction: false, expressKeys: false, dial: true, trackpadGestures: true },
    summaryKo: "별도 펜 없이도 감압 포스 클릭·두 손가락 회전/핀치·세 손가락 스와이프로 스케치·캔버스 내비게이션 수행",
    summaryEn: "Pen-free Force Click pressure modulation with two-finger rotate/pinch and three-finger navigation.",
  },
];

const LINEAR_PRESET: PressureCurvePresetSpec = {
  presetId: "linear-reference", labelKo: "표준 선형 기준", labelEn: "Linear Reference",
  summaryKo: "하드웨어 원시 필압을 왜곡 없이 1:1로 전달하는 기준 곡선", summaryEn: "Unmodified 1:1 linear response.",
  p1: { x: 0.3333, y: 0.3333 }, p2: { x: 0.6667, y: 0.6667 }, deadzoneMin: 0.0, saturationMax: 1.0, outputMin: 0.0, outputMax: 1.0,
};

export const PRESSURE_CURVE_PRESETS: readonly PressureCurvePresetSpec[] = [
  { presetId: "soft-sketch", labelKo: "소프트 스케치", labelEn: "Soft Sketch", summaryKo: "약한 필압에서도 선이 부드럽게 올라와 연필·러프 스케치에 적합", summaryEn: "Lifts stroke weight gently under light pressure.", p1: { x: 0.18, y: 0.42 }, p2: { x: 0.56, y: 0.88 }, deadzoneMin: 0.01, saturationMax: 0.96, outputMin: 0.0, outputMax: 1.0 },
  LINEAR_PRESET,
  { presetId: "firm-gpen-ink", labelKo: "탄력 G펜 펜선", labelEn: "Firm G-Pen Ink", summaryKo: "초반 미세 떨림을 누르고 중후반 필압에서 강약을 또렷하게 살리는 펜선 곡선", summaryEn: "Suppresses light micro-touches for crisp ink swells.", p1: { x: 0.46, y: 0.16 }, p2: { x: 0.78, y: 0.74 }, deadzoneMin: 0.03, saturationMax: 0.98, outputMin: 0.0, outputMax: 1.0 },
  { presetId: "heavy-calligraphy", labelKo: "묵직한 붓·서예", labelEn: "Heavy Calligraphy", summaryKo: "강한 필압에서만 굵기가 깊게 퍼져 힘 있는 먹선과 효과선에 적합", summaryEn: "Holds fine hairlines until heavy force triggers bold ink spread.", p1: { x: 0.62, y: 0.12 }, p2: { x: 0.88, y: 0.52 }, deadzoneMin: 0.04, saturationMax: 1.0, outputMin: 0.0, outputMax: 1.0 },
  { presetId: "custom-bezier", labelKo: "사용자 지정 베지어", labelEn: "Custom Bézier", summaryKo: "P1·P2 제어점과 데드존을 직접 조절해 손힘에 맞춘 전용 필압 곡선", summaryEn: "Manually tuned P1/P2 handles and deadzone.", p1: { x: 0.28, y: 0.22 }, p2: { x: 0.72, y: 0.82 }, deadzoneMin: 0.02, saturationMax: 0.98, outputMin: 0.0, outputMax: 1.0 },
];

export const STUDIO_BINDING_ACTIONS: readonly StudioBindingActionSpec[] = [
  { id: "brush-size-up", labelKo: "브러시 크기 키우기", labelEn: "Brush Size Up", category: "brush" },
  { id: "brush-size-down", labelKo: "브러시 크기 줄이기", labelEn: "Brush Size Down", category: "brush" },
  { id: "toggle-eraser", labelKo: "지우개 전환", labelEn: "Toggle Eraser", category: "brush" },
  { id: "eyedropper", labelKo: "스포이트(색 추출)", labelEn: "Eyedropper", category: "brush" },
  { id: "radial-quick-menu", labelKo: "방사형 퀵 메뉴", labelEn: "Radial Quick Menu", category: "brush" },
  { id: "undo", labelKo: "실행 취소 (Undo)", labelEn: "Undo", category: "history" },
  { id: "redo", labelKo: "다시 실행 (Redo)", labelEn: "Redo", category: "history" },
  { id: "pan-canvas", labelKo: "캔버스 이동 (손바닥)", labelEn: "Pan Canvas", category: "canvas" },
  { id: "rotate-canvas-cw", labelKo: "캔버스 시계 회전", labelEn: "Rotate Canvas CW", category: "canvas" },
  { id: "rotate-canvas-ccw", labelKo: "캔버스 반시계 회전", labelEn: "Rotate Canvas CCW", category: "canvas" },
  { id: "zoom-in", labelKo: "캔버스 확대", labelEn: "Zoom In", category: "canvas" },
  { id: "zoom-out", labelKo: "캔버스 축소", labelEn: "Zoom Out", category: "canvas" },
  { id: "next-layer", labelKo: "위 레이어 선택", labelEn: "Select Upper Layer", category: "navigation" },
  { id: "prev-layer", labelKo: "아래 레이어 선택", labelEn: "Select Lower Layer", category: "navigation" },
  { id: "toggle-symmetry-ruler", labelKo: "대칭 자 토글", labelEn: "Toggle Symmetry Ruler", category: "navigation" },
  { id: "none", labelKo: "동작 없음", labelEn: "Unassigned", category: "none" },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function normalizeAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const wrapped = ((angleDeg % 360) + 360) % 360;
  return wrapped === 360 ? 0 : roundTo(wrapped, 2);
}

export function getProDigitizerProfile(id: ProDigitizerProfileId): ProDigitizerProfile {
  return PRO_DIGITIZER_PROFILES.find((item) => item.id === id) ?? DEFAULT_PROFILE;
}

export function buildHardwareCapabilityMatrix(): readonly HardwareCapabilityMatrixRow[] {
  return PRO_DIGITIZER_PROFILES.map((p) => ({
    profileId: p.id, shortLabelKo: p.shortLabelKo, shortLabelEn: p.shortLabelEn,
    pressureLevels: p.pressureLevels, nominalReportRateHz: p.nominalReportRateHz,
    maxTiltDeg: p.maxTiltDeg, hoverHeightMm: p.hoverHeightMm, capabilities: { ...p.capabilities },
  }));
}

export function getPressureCurvePreset(presetId: PressureCurvePresetId): PressureCurvePresetSpec {
  return PRESSURE_CURVE_PRESETS.find((item) => item.presetId === presetId) ?? LINEAR_PRESET;
}

export function createPressureCurveFromPreset(
  presetId: PressureCurvePresetId,
  override?: Partial<Omit<PressureCurveConfig, "presetId">>,
): PressureCurveConfig {
  const preset = getPressureCurvePreset(presetId);
  const deadzoneMin = clamp(override?.deadzoneMin ?? preset.deadzoneMin, 0, 0.4);
  const saturationMax = clamp(override?.saturationMax ?? preset.saturationMax, Math.max(0.5, deadzoneMin + 0.1), 1);
  const outputMin = clamp(override?.outputMin ?? preset.outputMin, 0, 0.5);
  const outputMax = clamp(override?.outputMax ?? preset.outputMax, Math.max(0.5, outputMin + 0.1), 1);
  return {
    presetId,
    p1: { x: clamp(override?.p1?.x ?? preset.p1.x, 0, 1), y: clamp(override?.p1?.y ?? preset.p1.y, 0, 1) },
    p2: { x: clamp(override?.p2?.x ?? preset.p2.x, 0, 1), y: clamp(override?.p2?.y ?? preset.p2.y, 0, 1) },
    deadzoneMin, saturationMax, outputMin, outputMax,
  };
}

function cubicBezierCoord(t: number, c1: number, c2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * c1 + 3 * inv * t * t * c2 + t * t * t;
}

function cubicBezierDerivative(t: number, c1: number, c2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * c1 + 6 * inv * t * (c2 - c1) + 3 * t * t * (1 - c2);
}

/** 3차 베지어 필압 곡선 평가기 (Newton-Raphson + 이분법 폴백, 오차 < 1e-6). */
export function evaluatePressureCurve(rawPressure: number, curve: PressureCurveConfig): number {
  const safeRaw = clamp(rawPressure, 0, 1);
  const deadzone = clamp(curve.deadzoneMin, 0, 0.45);
  const saturation = clamp(curve.saturationMax, deadzone + 0.05, 1);
  const outMin = clamp(curve.outputMin, 0, 0.5);
  const outMax = clamp(curve.outputMax, outMin + 0.05, 1);
  if (safeRaw <= deadzone) return outMin;
  if (safeRaw >= saturation) return outMax;

  const targetX = (safeRaw - deadzone) / (saturation - deadzone);
  const x1 = clamp(curve.p1.x, 0, 1);
  const y1 = clamp(curve.p1.y, 0, 1);
  const x2 = clamp(curve.p2.x, 0, 1);
  const y2 = clamp(curve.p2.y, 0, 1);

  let t = targetX;
  for (let i = 0; i < 8; i += 1) {
    const err = cubicBezierCoord(t, x1, x2) - targetX;
    if (Math.abs(err) < 1e-6) break;
    const slope = cubicBezierDerivative(t, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    t = clamp(t - err / slope, 0, 1);
  }
  if (Math.abs(cubicBezierCoord(t, x1, x2) - targetX) > 1e-5) {
    let lo = 0;
    let hi = 1;
    t = targetX;
    for (let i = 0; i < 20; i += 1) {
      const val = cubicBezierCoord(t, x1, x2);
      if (Math.abs(val - targetX) < 1e-6) break;
      if (val < targetX) lo = t;
      else hi = t;
      t = (lo + hi) * 0.5;
    }
  }
  const mappedY = clamp(cubicBezierCoord(t, y1, y2), 0, 1);
  return clamp(outMin + mappedY * (outMax - outMin), 0, 1);
}

export function samplePressureCurvePoints(curve: PressureCurveConfig, segments = 32): readonly PressureBezierPoint[] {
  if (!Number.isFinite(segments)) throw new RangeError("곡선 샘플 수는 유한값이어야 합니다.");
  const count = Math.max(4, Math.min(128, Math.round(segments)));
  const points: PressureBezierPoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    const x = i / count;
    points.push({ x: roundTo(x, 4), y: roundTo(evaluatePressureCurve(x, curve), 4) });
  }
  return points;
}

/** W3C Pointer Events Level 3 공식으로 tiltX/tiltY(도)를 구면 좌표 altitude/azimuth(라디안)로 변환한다. */
export function tiltDegreesToSpherical(
  tiltXDeg: number,
  tiltYDeg: number,
): { readonly altitudeRad: number; readonly azimuthRad: number } {
  const cx = clamp(tiltXDeg, -89.5, 89.5);
  const cy = clamp(tiltYDeg, -89.5, 89.5);
  if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) return { altitudeRad: Math.PI / 2, azimuthRad: 0 };
  const tanX = Math.tan((cx * Math.PI) / 180);
  const tanY = Math.tan((cy * Math.PI) / 180);
  const altitudeRad = Math.atan(1 / Math.hypot(tanX, tanY));
  let azimuthRad = Math.atan2(tanY, tanX);
  if (azimuthRad < 0) azimuthRad += Math.PI * 2;
  return { altitudeRad, azimuthRad };
}

function computeMeanSecondDifference(points: readonly { readonly x: number; readonly y: number }[]): number {
  if (points.length < 3) return 0;
  let total = 0;
  let count = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!prev || !curr || !next) continue;
    total += Math.hypot(next.x - 2 * curr.x + prev.x, next.y - 2 * curr.y + prev.y);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function resolveSpherical(sample: RawPointerSample): { readonly altitudeRad: number; readonly azimuthRad: number } {
  if (sample.altitudeAngle !== undefined && Number.isFinite(sample.altitudeAngle)) {
    const rawAz = sample.azimuthAngle !== undefined && Number.isFinite(sample.azimuthAngle) ? sample.azimuthAngle : 0;
    return { altitudeRad: clamp(sample.altitudeAngle, 0, Math.PI / 2), azimuthRad: ((rawAz % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) };
  }
  return tiltDegreesToSpherical(sample.tiltX ?? 0, sample.tiltY ?? 0);
}

/** 240~500Hz Coalesced/Predicted 포인터 샘플 정규화(지터 억제·틸트 셰이딩 계수·배럴 회전 산출). */
export function normalizePointerSampleBatch(
  rawSamples: readonly RawPointerSample[], options: NormalizePointerBatchOptions,
): NormalizedPointerBatchResult {
  assertPointerBatch(rawSamples);
  const profile = getProDigitizerProfile(options.profileId);
  const smoothing = clamp(options.smoothingStrength ?? 0.35, 0, 1);
  const enablePrediction = options.enablePrediction ?? true;
  if (rawSamples.length === 0) {
    return {
      profileId: profile.id, samples: [],
      metrics: {
        inputCount: 0, coalescedCount: 0, predictedCount: 0, droppedPredictedCount: 0,
        effectiveReportRateHz: 0, jitterReductionPct: 0, predictedLatencyGainMs: 0,
        averageCalibratedPressure: 0, averageTiltShadingFactor: 0, lastBarrelRollDeg: 0,
      },
    };
  }

  const normalized: NormalizedPointerSample[] = [];
  const rawCoords: { readonly x: number; readonly y: number }[] = [];
  const smoothCoords: { readonly x: number; readonly y: number }[] = [];
  const positiveDeltasMs: number[] = [];
  let hasFilter = false;
  let filtX = 0; let filtY = 0; let predX = 0; let predY = 0;
  let lastCoalescedTs: number | null = null; let lastPredictedTs: number | null = null; let prevTs: number | null = null;
  let droppedPredictedCount = 0; let coalescedCount = 0; let predictedCount = 0;

  for (const sample of rawSamples) {
    const isPredicted = Boolean(sample.isPredicted);
    if (isPredicted && !enablePrediction) { droppedPredictedCount += 1; continue; }
    const rawX = Number.isFinite(sample.x) ? sample.x : 0;
    const rawY = Number.isFinite(sample.y) ? sample.y : 0;
    const ts: number = Number.isFinite(sample.timestampMs) ? sample.timestampMs : (prevTs ?? 0);
    const deltaMs = prevTs === null ? 0 : Math.max(0, ts - prevTs);
    let outX: number; let outY: number; let velocityPxPerSec = 0;

    if (!isPredicted) {
      if (!hasFilter) { filtX = rawX; filtY = rawY; hasFilter = true; } else {
        const dist = Math.hypot(rawX - filtX, rawY - filtY);
        velocityPxPerSec = deltaMs > 0 ? (dist / deltaMs) * 1000 : 0;
        const minAlpha = 1 - smoothing * 0.82;
        const alpha = smoothing === 0 ? 1 : clamp(minAlpha + (1 - minAlpha) * clamp(velocityPxPerSec / 1800, 0, 1) * 0.65, 0.14, 1);
        filtX += (rawX - filtX) * alpha; filtY += (rawY - filtY) * alpha;
      }
      outX = filtX; outY = filtY; predX = filtX; predY = filtY;
      if (lastCoalescedTs !== null && ts > lastCoalescedTs) positiveDeltasMs.push(ts - lastCoalescedTs);
      lastCoalescedTs = ts; coalescedCount += 1;
      rawCoords.push({ x: rawX, y: rawY }); smoothCoords.push({ x: outX, y: outY });
    } else {
      const bx = hasFilter ? predX : rawX; const by = hasFilter ? predY : rawY;
      velocityPxPerSec = deltaMs > 0 ? (Math.hypot(rawX - bx, rawY - by) / deltaMs) * 1000 : 0;
      const pAlpha = smoothing === 0 ? 1 : clamp(1 - smoothing * 0.45, 0.45, 1);
      predX = bx + (rawX - bx) * pAlpha; predY = by + (rawY - by) * pAlpha;
      outX = predX; outY = predY; lastPredictedTs = ts; predictedCount += 1;
    }
    prevTs = ts;

    const rawPressure = clamp(sample.pressure, 0, 1);
    const { altitudeRad, azimuthRad } = resolveSpherical(sample);
    const tiltDeg = clamp(90 - (altitudeRad * 180) / Math.PI, 0, 90);
    const tiltShadingFactor = profile.capabilities.altitudeAzimuth && profile.maxTiltDeg > 0
      ? roundTo(clamp((tiltDeg - 10) / Math.max(15, profile.maxTiltDeg - 10), 0, 1), 4) : 0;
    const roundedVelocity = roundTo(velocityPxPerSec, 1);
    if (!Number.isFinite(velocityPxPerSec) || !Number.isFinite(roundedVelocity)) throw new RangeError("샘플 시각 차의 속도를 유한 수치로 표현할 수 없습니다.");

    normalized.push({
      rawX: roundTo(rawX, 3), rawY: roundTo(rawY, 3), x: roundTo(outX, 3), y: roundTo(outY, 3),
      timestampMs: roundTo(ts, 3), deltaMs: roundTo(deltaMs, 3),
      rawPressure: roundTo(rawPressure, 4), calibratedPressure: roundTo(evaluatePressureCurve(rawPressure, options.curve), 4),
      altitudeRad: roundTo(altitudeRad, 4), azimuthRad: roundTo(azimuthRad, 4),
      tiltMagnitude: roundTo(clamp(tiltDeg / 90, 0, 1), 4), tiltShadingFactor,
      barrelRollDeg: sample.twist !== undefined ? normalizeAngleDeg(sample.twist) : 0,
      barrelRollNative: profile.capabilities.barrelRoll,
      tangentialPressure: roundTo(clamp(sample.tangentialPressure ?? 0, -1, 1), 4),
      velocityPxPerSec: roundedVelocity, isPredicted,
      pointerType: sample.pointerType ?? (profile.formFactor === "force-trackpad" ? "touch" : "pen"),
    });
  }

  const avgDelta = positiveDeltasMs.length > 0 ? positiveDeltasMs.reduce((s, v) => s + v, 0) / positiveDeltasMs.length : 0;
  const reportRate = avgDelta > 0 ? 1000 / avgDelta : 0;
  const effectiveReportRateHz = roundTo(reportRate, 1);
  if (!Number.isFinite(reportRate) || !Number.isFinite(effectiveReportRateHz)) throw new RangeError("샘플 시각 차의 리포트율을 유한 수치로 표현할 수 없습니다.");
  const rawJitter = computeMeanSecondDifference(rawCoords);
  const smoothJitter = computeMeanSecondDifference(smoothCoords);
  const lastSample = normalized[normalized.length - 1];
  return {
    profileId: profile.id, samples: normalized,
    metrics: {
      inputCount: rawSamples.length, coalescedCount, predictedCount, droppedPredictedCount,
      effectiveReportRateHz,
      jitterReductionPct: smoothing === 0 || rawJitter < 1e-6 ? 0 : roundTo(clamp(((rawJitter - smoothJitter) / rawJitter) * 100, 0, 100), 1),
      predictedLatencyGainMs: lastCoalescedTs !== null && lastPredictedTs !== null && lastPredictedTs > lastCoalescedTs ? roundTo(lastPredictedTs - lastCoalescedTs, 2) : 0,
      averageCalibratedPressure: normalized.length > 0 ? roundTo(normalized.reduce((s, v) => s + v.calibratedPressure, 0) / normalized.length, 4) : 0,
      averageTiltShadingFactor: normalized.length > 0 ? roundTo(normalized.reduce((s, v) => s + v.tiltShadingFactor, 0) / normalized.length, 4) : 0,
      lastBarrelRollDeg: lastSample?.barrelRollDeg ?? 0,
    },
  };
}

function readUint16LE(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8);
}

function readInt8(buffer: Uint8Array, offset: number): number {
  const value = buffer[offset] ?? 0;
  return value >= 128 ? value - 256 : value;
}

function failHid(errorCode: HidReportParseErrorCode, messageKo: string, messageEn: string): HidDigitizerParseResult {
  return { ok: false, errorCode, messageKo, messageEn };
}

/** 클린룸 USB HID Digitizer (Usage Page 0x0D) 표준 16바이트 입력 리포트 파서 (fail-closed, BigInt 미사용). */
export function parseStandardHidDigitizerReport(buffer: unknown): HidDigitizerParseResult {
  if (!(buffer instanceof Uint8Array)) return failHid("INVALID_BUFFER_TYPE", "HID 리포트 입력은 Uint8Array 버퍼여야 합니다.", "HID report input must be a Uint8Array.");
  if (buffer.byteLength < USB_HID_STANDARD_REPORT_MIN_BYTES) return failHid("BUFFER_TOO_SHORT", `표준 HID 0x0D 리포트는 최소 ${USB_HID_STANDARD_REPORT_MIN_BYTES}바이트가 필요합니다 (수신: ${buffer.byteLength}바이트).`, `Standard HID 0x0D report requires >= ${USB_HID_STANDARD_REPORT_MIN_BYTES} bytes (received ${buffer.byteLength}).`);
  const reportId = buffer[0] ?? 0;
  if (reportId !== USB_HID_STANDARD_PEN_REPORT_ID) {
    const hexId = `0x${reportId.toString(16).padStart(2, "0")}`;
    return failHid("UNSUPPORTED_REPORT_ID", `지원하지 않는 HID Report ID입니다 (기대: 0x02, 수신: ${hexId}).`, `Unsupported HID Report ID (expected 0x02, received ${hexId}).`);
  }
  const rawBitfield = buffer[1] ?? 0;
  const x = readUint16LE(buffer, 2);
  const y = readUint16LE(buffer, 4);
  if (x > USB_HID_LOGICAL_COORD_MAX || y > USB_HID_LOGICAL_COORD_MAX) return failHid("COORDINATE_OUT_OF_RANGE", `HID 좌표가 논리 상한(${USB_HID_LOGICAL_COORD_MAX})을 초과했습니다 (X=${x}, Y=${y}).`, `HID coordinates exceed logical max ${USB_HID_LOGICAL_COORD_MAX} (X=${x}, Y=${y}).`);
  const tipPressure = readUint16LE(buffer, 6);
  const encodedMax = readUint16LE(buffer, 14);
  const logicalPressureMax = encodedMax === 0 ? USB_HID_DEFAULT_PRESSURE_MAX : encodedMax;
  if (logicalPressureMax < 255 || tipPressure > logicalPressureMax) return failHid("PRESSURE_OUT_OF_RANGE", `필압 값(${tipPressure})이 논리 최대값(${logicalPressureMax}) 범위를 벗어났습니다.`, `Tip pressure (${tipPressure}) exceeds [0..${logicalPressureMax}].`);
  const tiltXDeg = readInt8(buffer, 8);
  const tiltYDeg = readInt8(buffer, 9);
  if (tiltXDeg < -90 || tiltXDeg > 90 || tiltYDeg < -90 || tiltYDeg > 90) return failHid("INVALID_TILT_RANGE", `기울기 값이 ±90° 범위를 벗어났습니다 (TiltX=${tiltXDeg}°, TiltY=${tiltYDeg}°).`, `Tilt exceeds ±90° (TiltX=${tiltXDeg}°, TiltY=${tiltYDeg}°).`);
  const rawTwist = readUint16LE(buffer, 10);
  if (rawTwist > 360) return failHid("INVALID_TWIST_RANGE", `배럴 회전(Twist) 값이 0~360° 범위를 벗어났습니다 (수신: ${rawTwist}°).`, `Barrel twist exceeds 0..360° (received ${rawTwist}°).`);
  const dialDelta = readInt8(buffer, 12);
  const expressKeyMask = buffer[13] ?? 0;
  const activeExpressKeys: number[] = [];
  for (let bit = 0; bit < 8; bit += 1) { if ((expressKeyMask & (1 << bit)) !== 0) activeExpressKeys.push(bit + 1); }
  const { altitudeRad, azimuthRad } = tiltDegreesToSpherical(tiltXDeg, tiltYDeg);
  return {
    ok: true,
    report: {
      usagePage: USB_HID_USAGE_PAGE_DIGITIZER, reportId: USB_HID_STANDARD_PEN_REPORT_ID, byteLength: buffer.byteLength,
      flags: {
        tipSwitch: (rawBitfield & 0x01) !== 0, barrelSwitch: (rawBitfield & 0x02) !== 0,
        secondaryBarrelSwitch: (rawBitfield & 0x04) !== 0, eraser: (rawBitfield & 0x08) !== 0,
        invert: (rawBitfield & 0x10) !== 0, inRange: (rawBitfield & 0x20) !== 0, rawBitfield,
      },
      x, y, xNorm: roundTo(x / USB_HID_LOGICAL_COORD_MAX, 5), yNorm: roundTo(y / USB_HID_LOGICAL_COORD_MAX, 5),
      tipPressure, logicalPressureMax, pressureNorm: roundTo(tipPressure / logicalPressureMax, 5),
      tiltXDeg, tiltYDeg, altitudeRad: roundTo(altitudeRad, 4), azimuthRad: roundTo(azimuthRad, 4),
      twistDeg: rawTwist === 360 ? 0 : rawTwist, dialDelta, expressKeyMask, activeExpressKeys,
    },
  };
}

/** 공개 usage 용어를 사용한 합성 16바이트 예제다. 실제 장치의 report descriptor를 해석하지 않는다. */
export function encodeStandardHidDigitizerReport(input: HidDigitizerReportEncodeInput): Uint8Array {
  assertHidEncodeInput(input);
  const bytes = new Uint8Array(USB_HID_STANDARD_REPORT_MIN_BYTES);
  bytes[0] = (input.reportId ?? USB_HID_STANDARD_PEN_REPORT_ID) & 0xff;
  bytes[1] = (input.tipSwitch ? 0x01 : 0) | (input.barrelSwitch ? 0x02 : 0) | (input.secondaryBarrelSwitch ? 0x04 : 0)
    | (input.eraser ? 0x08 : 0) | (input.invert ? 0x10 : 0) | ((input.inRange ?? true) ? 0x20 : 0);
  const writeU16 = (offset: number, val: number): void => {
    const v = Math.max(0, Math.min(65535, Math.round(val)));
    bytes[offset] = v & 0xff; bytes[offset + 1] = (v >> 8) & 0xff;
  };
  const writeI8 = (offset: number, val: number): void => {
    const v = Math.max(-128, Math.min(127, Math.round(val)));
    bytes[offset] = v < 0 ? v + 256 : v;
  };
  writeU16(2, input.x); writeU16(4, input.y); writeU16(6, input.tipPressure);
  writeI8(8, input.tiltXDeg ?? 0); writeI8(9, input.tiltYDeg ?? 0);
  writeU16(10, input.twistDeg ?? 0); writeI8(12, input.dialDelta ?? 0);
  bytes[13] = Math.max(0, Math.min(255, Math.round(input.expressKeyMask ?? 0)));
  writeU16(14, input.logicalPressureMax ?? USB_HID_DEFAULT_PRESSURE_MAX);
  return bytes;
}

export function hidReportToRawPointerSample(
  report: ParsedHidDigitizerReport, viewportWidthPx: number, viewportHeightPx: number, timestampMs: number,
): RawPointerSample {
  assertHidProjection(report, viewportWidthPx, viewportHeightPx, timestampMs);
  return {
    x: roundTo(report.xNorm * Math.max(1, viewportWidthPx), 2),
    y: roundTo(report.yNorm * Math.max(1, viewportHeightPx), 2),
    timestampMs, pressure: report.flags.tipSwitch ? report.pressureNorm : 0,
    tiltX: report.tiltXDeg, tiltY: report.tiltYDeg,
    altitudeAngle: report.altitudeRad, azimuthAngle: report.azimuthRad,
    twist: report.twistDeg, isPredicted: false, pointerType: "pen",
  };
}

export function isTriggerSupportedByProfile(profileId: ProDigitizerProfileId, triggerKind: ControlTriggerKind): boolean {
  const { capabilities } = getProDigitizerProfile(profileId);
  if (triggerKind === "express-key") return capabilities.expressKeys;
  if (triggerKind === "dial") return capabilities.dial;
  if (triggerKind === "squeeze") return capabilities.squeeze;
  if (triggerKind === "air-action") return capabilities.airAction;
  if (triggerKind === "trackpad-gesture") return capabilities.trackpadGestures;
  return profileId !== "macbook-force-trackpad";
}

export function createDefaultShortcutBindings(profileId: ProDigitizerProfileId): readonly ShortcutBinding[] {
  const mk = (
    id: string, triggerKind: ControlTriggerKind, triggerCode: string,
    triggerLabelKo: string, triggerLabelEn: string, actionId: StudioBindingActionId,
  ): ShortcutBinding => ({
    id, triggerKind, triggerCode, triggerLabelKo, triggerLabelEn, actionId,
    enabled: isTriggerSupportedByProfile(profileId, triggerKind),
  });
  return [
    mk("bind-ek1", "express-key", "EK1", "익스프레스키 1", "ExpressKey 1", "undo"),
    mk("bind-ek2", "express-key", "EK2", "익스프레스키 2", "ExpressKey 2", "toggle-eraser"),
    mk("bind-dial-cw", "dial", "DIAL_CW", "다이얼 시계 방향", "Dial Clockwise", "brush-size-up"),
    mk("bind-dial-ccw", "dial", "DIAL_CCW", "다이얼 반시계 방향", "Dial Counter-CW", "brush-size-down"),
    mk("bind-squeeze", "squeeze", "SQUEEZE_SHORT", "애플펜슬 스퀴즈", "Pencil Pro Squeeze", "radial-quick-menu"),
    mk("bind-air-action", "air-action", "AIR_FLICK_LEFT", "S펜 에어액션 좌측 스냅", "S-Pen Air Flick Left", "undo"),
    mk("bind-trackpad-force", "trackpad-gesture", "TP_FORCE_CLICK", "트랙패드 포스 클릭", "Trackpad Force Click", "eyedropper"),
    mk("bind-trackpad-rotate", "trackpad-gesture", "TP_TWO_FINGER_ROTATE", "트랙패드 두 손가락 회전", "Trackpad 2-Finger Rotate", "rotate-canvas-cw"),
    mk("bind-pen-side-1", "pen-button", "PEN_SIDE_1", "펜 사이드 버튼 1", "Pen Side Switch 1", "pan-canvas"),
  ];
}

export function updateShortcutBinding(
  bindings: readonly ShortcutBinding[], bindingId: string,
  patch: Partial<Pick<ShortcutBinding, "actionId" | "enabled">>,
): readonly ShortcutBinding[] {
  return bindings.map((item) => (item.id === bindingId ? { ...item, ...patch } : item));
}

export function createSimulatedTestStroke(profileId: ProDigitizerProfileId): readonly RawPointerSample[] {
  const profile = getProDigitizerProfile(profileId);
  const stepMs = 1000 / profile.nominalReportRateHz;
  const samples: RawPointerSample[] = [];
  const pointerType = profile.formFactor === "force-trackpad" ? "touch" : "pen";
  for (let i = 0; i < 20; i += 1) {
    const u = i / 19;
    samples.push({
      x: roundTo(24 + u * 272 + (i % 2 === 0 ? 1.8 : -1.8), 2),
      y: roundTo(78 + Math.sin(u * Math.PI * 1.5) * 36 + (i % 3 === 0 ? -1.4 : 1.4), 2),
      timestampMs: roundTo(1000 + i * stepMs, 3),
      pressure: roundTo(clamp(0.12 + Math.sin(u * Math.PI) * 0.82, 0.05, 0.98), 4),
      tiltX: profile.maxTiltDeg > 0 ? Math.round((u - 0.3) * Math.min(48, profile.maxTiltDeg)) : 0,
      tiltY: profile.maxTiltDeg > 0 ? Math.round(Math.cos(u * Math.PI) * 28) : 0,
      twist: profile.capabilities.barrelRoll ? Math.round(u * 270) : 0,
      tangentialPressure: profile.capabilities.tangentialPressure ? roundTo(u * 0.75, 3) : 0,
      isPredicted: false, pointerType,
    });
  }
  const last = samples[samples.length - 1];
  if (last) {
    for (let p = 1; p <= 2; p += 1) {
      samples.push({
        x: roundTo(last.x + p * 8.5, 2), y: roundTo(last.y - p * 2.2, 2),
        timestampMs: roundTo(last.timestampMs + p * 4.5, 3),
        pressure: roundTo(Math.max(0.08, last.pressure - p * 0.06), 4),
        tiltX: last.tiltX, tiltY: last.tiltY,
        twist: profile.capabilities.barrelRoll ? normalizeAngleDeg((last.twist ?? 0) + p * 12) : 0,
        tangentialPressure: last.tangentialPressure, isPredicted: true, pointerType,
      });
    }
  }
  return samples;
}

const CONFIG_RULES = { schema: DIGITIZER_CONFIG_SCHEMA_VERSION, profiles: PRO_DIGITIZER_IDS,
  curves: PRESSURE_CURVE_PRESET_IDS, triggers: CONTROL_TRIGGER_KINDS, actions: STUDIO_BINDING_ACTION_IDS };

export function exportDigitizerConfigJson(snapshot: DigitizerCalibrationSnapshot): string {
  const result = validateDigitizerConfig({ schema: DIGITIZER_CONFIG_SCHEMA_VERSION, ...snapshot }, CONFIG_RULES);
  if (!result.ok) throw new TypeError(result.messageKo);
  const config = result.config;
  const profile = getProDigitizerProfile(config.profileId);
  const json = JSON.stringify({ schema: DIGITIZER_CONFIG_SCHEMA_VERSION, standards: profile.openStandards, ...config,
    provenance: { dataSourceKind: "example", hardwareVerified: false, deviceConnected: false,
      latencyMeasured: false, packetLayout: "synthetic-16-byte", cleanRoomStandardOnly: true,
      hidUsagePageHex: "0x0D", noteKo: "정적 프로필·곡선·합성 패킷 예제입니다. 실제 장치 호환·압력 단계·지연·인증을 검증하지 않습니다." },
  }, null, 2);
  if (json.length > MAX_DIGITIZER_JSON_CHARS) throw new RangeError("JSON 예제 한도를 초과했습니다. 원문을 줄이거나 잘라내지 않습니다.");
  return json;
}

/** JSON 문법과 지원 모델을 검증한다. 실패한 원문을 자르거나 기본값으로 교체하지 않는다. */
export function importDigitizerConfigJson(rawJson: string): ImportDigitizerConfigResult {
  if (typeof rawJson !== "string" || rawJson.length > MAX_DIGITIZER_JSON_CHARS) return {
    ok: false, errorCode: "INVALID_JSON", messageKo: "JSON 예제는 최대 1048576자입니다.", messageEn: "JSON is limited to 1048576 characters.",
  };
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch { return { ok: false, errorCode: "INVALID_JSON", messageKo: "JSON 문법을 해석할 수 없습니다.", messageEn: "Malformed JSON payload." }; }
  return validateDigitizerConfig(parsed, CONFIG_RULES);
}
