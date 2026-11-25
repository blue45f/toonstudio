import type {
  ControlTriggerKind, DigitizerCalibrationSnapshot, HidDigitizerReportEncodeInput,
  ImportConfigErrorCode, ImportDigitizerConfigResult, ParsedHidDigitizerReport,
  PressureCurvePresetId, ProDigitizerProfileId, RawPointerSample, ShortcutBinding, StudioBindingActionId,
} from "./pro-digitizer-engine";

export const MAX_DIGITIZER_JSON_CHARS = 1048576;
export const MAX_POINTER_SAMPLES = 4096;
const MAX_SAMPLE_COORDINATE = 10000000;
const MAX_SAMPLE_TIME = Number.MAX_SAFE_INTEGER;
export interface DigitizerVocabulary {
  readonly schema: string;
  readonly profiles: readonly ProDigitizerProfileId[];
  readonly curves: readonly PressureCurvePresetId[];
  readonly triggers: readonly ControlTriggerKind[];
  readonly actions: readonly StudioBindingActionId[];
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.some(item => item === value);
}
function unit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
function failure(errorCode: ImportConfigErrorCode, messageKo: string, messageEn: string): ImportDigitizerConfigResult {
  return { ok: false, errorCode, messageKo, messageEn };
}

/** import와 export가 같은 유한값·목록·ID 계약을 사용하며 지원 문자열을 잘라내지 않는다. */
export function validateDigitizerConfig(parsed: unknown, rules: DigitizerVocabulary): ImportDigitizerConfigResult {
  if (!record(parsed) || parsed.schema !== rules.schema) return failure("INVALID_SCHEMA", "지원하지 않는 디지타이저 스키마입니다.", "Unsupported digitizer schema.");
  if (!member(rules.profiles, parsed.profileId)) return failure("INVALID_PROFILE_ID", "알 수 없는 하드웨어 프로필 ID입니다.", "Unknown hardware profileId.");
  const rc = parsed.curve;
  if (!record(rc) || !member(rules.curves, rc.presetId) || !record(rc.p1) || !record(rc.p2)
    || !unit(rc.p1.x) || !unit(rc.p1.y) || !unit(rc.p2.x) || !unit(rc.p2.y)
    || !unit(rc.deadzoneMin) || !unit(rc.saturationMax) || !unit(rc.outputMin) || !unit(rc.outputMax)
    || rc.deadzoneMin >= rc.saturationMax || rc.outputMin >= rc.outputMax) {
    return failure("INVALID_CURVE", "필압 베지어 곡선 제어점 또는 데드존 범위가 유효하지 않습니다.", "Invalid pressure curve control points or deadzone.");
  }
  if (!unit(parsed.smoothingStrength) || typeof parsed.enablePrediction !== "boolean") return failure("INVALID_SETTINGS", "지터 억제 강도 또는 예측 설정이 잘못되었습니다.", "Invalid smoothingStrength or enablePrediction flag.");
  if (!Array.isArray(parsed.bindings) || parsed.bindings.length > 128) return failure("INVALID_BINDINGS", "바인딩은 최대 128개입니다.", "At most 128 bindings are supported.");
  const bindings: ShortcutBinding[] = [];
  const ids = new Set<string>();
  let characters = 0;
  for (const item of parsed.bindings) {
    if (!record(item) || !text(item.id, 256) || !item.id.trim() || ids.has(item.id)
      || !member(rules.triggers, item.triggerKind) || !text(item.triggerCode, 256) || !item.triggerCode.trim()
      || !text(item.triggerLabelKo, 10000) || !text(item.triggerLabelEn, 10000)
      || !member(rules.actions, item.actionId) || typeof item.enabled !== "boolean") {
      return failure("INVALID_BINDINGS", "바인딩 ID·문자열·동작 또는 목록이 유효하지 않습니다.", "Invalid binding ID, text, action, or list.");
    }
    ids.add(item.id);
    characters += item.id.length + item.triggerCode.length + item.triggerLabelKo.length + item.triggerLabelEn.length;
    if (characters > MAX_DIGITIZER_JSON_CHARS / 2) return failure("INVALID_BINDINGS", "바인딩 텍스트가 예제 한도를 초과했습니다.", "Binding text exceeds the example limit.");
    bindings.push({ id: item.id, triggerKind: item.triggerKind, triggerCode: item.triggerCode,
      triggerLabelKo: item.triggerLabelKo, triggerLabelEn: item.triggerLabelEn, actionId: item.actionId, enabled: item.enabled });
  }
  const config: DigitizerCalibrationSnapshot = {
    profileId: parsed.profileId,
    curve: { presetId: rc.presetId, p1: { x: rc.p1.x, y: rc.p1.y }, p2: { x: rc.p2.x, y: rc.p2.y },
      deadzoneMin: rc.deadzoneMin, saturationMax: rc.saturationMax, outputMin: rc.outputMin, outputMax: rc.outputMax },
    smoothingStrength: parsed.smoothingStrength, enablePrediction: parsed.enablePrediction, bindings,
  };
  return { ok: true, config };
}

/** 화면 예제의 샘플 지원 범위를 넘으면 원본을 변환하거나 부분 계산하지 않는다. */
export function assertPointerBatch(samples: readonly RawPointerSample[]): void {
  if (!Array.isArray(samples) || samples.length > MAX_POINTER_SAMPLES) throw new RangeError("포인터 예제는 최대 4096샘플입니다.");
  for (const sample of samples) {
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.timestampMs)
      || Math.abs(sample.x) > MAX_SAMPLE_COORDINATE || Math.abs(sample.y) > MAX_SAMPLE_COORDINATE
      || Math.abs(sample.timestampMs) > MAX_SAMPLE_TIME || !Number.isFinite(sample.pressure)) throw new RangeError("포인터 좌표·시각·필압이 유한 지원 범위를 벗어났습니다.");
    for (const value of [sample.tiltX, sample.tiltY, sample.altitudeAngle, sample.azimuthAngle, sample.twist, sample.tangentialPressure]) {
      if (value !== undefined && !Number.isFinite(value)) throw new RangeError("포인터 방향·회전 수치는 유한값이어야 합니다.");
    }
    if ((sample.isPredicted !== undefined && typeof sample.isPredicted !== "boolean")
      || (sample.pointerType !== undefined && !["pen", "touch", "mouse"].includes(sample.pointerType))) throw new TypeError("지원하지 않는 포인터 샘플 메타데이터입니다.");
  }
}

export function assertHidEncodeInput(input: HidDigitizerReportEncodeInput): void {
  for (const value of [input.x, input.y, input.tipPressure]) if (!Number.isFinite(value)) throw new RangeError("HID 예제 입력은 유한값이어야 합니다.");
  for (const key of ["reportId", "logicalPressureMax", "tiltXDeg", "tiltYDeg", "twistDeg", "dialDelta", "expressKeyMask"] as const) {
    if (input[key] !== undefined && !Number.isFinite(input[key])) throw new RangeError("HID 예제 옵션은 유한값이어야 합니다.");
  }
  for (const key of ["tipSwitch", "barrelSwitch", "secondaryBarrelSwitch", "eraser", "invert", "inRange"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") throw new TypeError("HID 예제 플래그는 boolean이어야 합니다.");
  }
}

export function assertHidProjection(report: ParsedHidDigitizerReport, width: number, height: number, time: number): void {
  if (!Number.isFinite(width) || width <= 0 || width > MAX_SAMPLE_COORDINATE || !Number.isFinite(height) || height <= 0
    || height > MAX_SAMPLE_COORDINATE || !Number.isFinite(time) || Math.abs(time) > MAX_SAMPLE_TIME
    || !unit(report.xNorm) || !unit(report.yNorm) || !unit(report.pressureNorm) || typeof report.flags.tipSwitch !== "boolean"
    || ![report.tiltXDeg, report.tiltYDeg, report.altitudeRad, report.azimuthRad, report.twistDeg].every(Number.isFinite)) throw new RangeError("HID 예제 투영 메타데이터가 유효하지 않습니다.");
}
