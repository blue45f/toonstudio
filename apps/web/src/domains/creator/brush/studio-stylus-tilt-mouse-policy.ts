/**
 * 필압·기울기 곡선 및 마우스 대체 동작(속도 감응·양끝 테이퍼·고정 두께) 순수 정책 및 로컬 스토어.
 *
 * 스타일러스 하드웨어가 있는 경우 기울기 각도(0°~85°)를 비선형 곡선으로 매핑해 브러시 번짐 배율과
 * 잉크 흐름을 제어하고, 마우스 입력(압력/기울기 미지원)에서는 인과적 속도 기반 가상 필압 또는
 * 양끝 테이퍼 대체 동작을 일관되게 제공한다.
 */

import {
  DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  normalizeHardwareStylusPacket,
  studioStylusPressureProfileMap,
  type StudioStylusPressureProfile,
} from "./studio-stylus-pressure-profile";

export const STUDIO_STYLUS_TILT_MOUSE_POLICY_VERSION = 1 as const;
export const STUDIO_STYLUS_TILT_MOUSE_STORAGE_KEY =
  "toonstudio:stylus-tilt-mouse-policy:v1";

export type StudioStylusTiltPresetId = "linear" | "pencil-shade" | "calligraphy";
export type StudioMousePressureFallbackMode = "velocity" | "taper-ends" | "fixed";

export interface StudioStylusTiltMousePolicy {
  readonly version: typeof STUDIO_STYLUS_TILT_MOUSE_POLICY_VERSION;
  readonly tiltEnabled: boolean;
  readonly tiltPresetId: StudioStylusTiltPresetId;
  readonly tiltDeadZoneDeg: number;
  readonly tiltSaturationDeg: number;
  readonly tiltExponent: number;
  readonly maxTiltBroadening: number;
  readonly mouseFallbackMode: StudioMousePressureFallbackMode;
  readonly mouseSensitivity: number;
  readonly mouseNominalPressure: number;
}

export const DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY: StudioStylusTiltMousePolicy =
  Object.freeze({
    version: STUDIO_STYLUS_TILT_MOUSE_POLICY_VERSION,
    tiltEnabled: true,
    tiltPresetId: "linear",
    tiltDeadZoneDeg: 15,
    tiltSaturationDeg: 80,
    tiltExponent: 1,
    maxTiltBroadening: 2.35,
    mouseFallbackMode: "velocity",
    mouseSensitivity: 0.65,
    mouseNominalPressure: 0.72,
  });

const TILT_PRESETS: Readonly<
  Record<
    StudioStylusTiltPresetId,
    Pick<
      StudioStylusTiltMousePolicy,
      "tiltPresetId" | "tiltDeadZoneDeg" | "tiltSaturationDeg" | "tiltExponent" | "maxTiltBroadening"
    >
  >
> = Object.freeze({
  linear: Object.freeze({
    tiltPresetId: "linear",
    tiltDeadZoneDeg: 15,
    tiltSaturationDeg: 80,
    tiltExponent: 1,
    maxTiltBroadening: 2.35,
  }),
  "pencil-shade": Object.freeze({
    tiltPresetId: "pencil-shade",
    tiltDeadZoneDeg: 10,
    tiltSaturationDeg: 72,
    tiltExponent: 0.68,
    maxTiltBroadening: 2.8,
  }),
  calligraphy: Object.freeze({
    tiltPresetId: "calligraphy",
    tiltDeadZoneDeg: 20,
    tiltSaturationDeg: 82,
    tiltExponent: 1.55,
    maxTiltBroadening: 2.1,
  }),
});

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function normalizeStudioStylusTiltMousePolicy(
  raw: unknown,
): StudioStylusTiltMousePolicy {
  const src =
    raw && typeof raw === "object"
      ? (raw as Partial<StudioStylusTiltMousePolicy>)
      : {};
  const defaults = DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
  const tiltPresetId: StudioStylusTiltPresetId =
    src.tiltPresetId === "pencil-shade" || src.tiltPresetId === "calligraphy"
      ? src.tiltPresetId
      : "linear";
  const mouseFallbackMode: StudioMousePressureFallbackMode =
    src.mouseFallbackMode === "taper-ends" || src.mouseFallbackMode === "fixed"
      ? src.mouseFallbackMode
      : "velocity";
  const tiltDeadZoneDeg = Number(
    clamp(finiteOr(src.tiltDeadZoneDeg, defaults.tiltDeadZoneDeg), 0, 45).toFixed(1),
  );
  const tiltSaturationDeg = Number(
    clamp(
      finiteOr(src.tiltSaturationDeg, defaults.tiltSaturationDeg),
      Math.max(35, tiltDeadZoneDeg + 10),
      88,
    ).toFixed(1),
  );
  return Object.freeze({
    version: STUDIO_STYLUS_TILT_MOUSE_POLICY_VERSION,
    tiltEnabled: src.tiltEnabled !== false,
    tiltPresetId,
    tiltDeadZoneDeg,
    tiltSaturationDeg,
    tiltExponent: Number(
      clamp(finiteOr(src.tiltExponent, defaults.tiltExponent), 0.35, 2.6).toFixed(2),
    ),
    maxTiltBroadening: Number(
      clamp(finiteOr(src.maxTiltBroadening, defaults.maxTiltBroadening), 1, 3).toFixed(2),
    ),
    mouseFallbackMode,
    mouseSensitivity: Number(
      clamp01(finiteOr(src.mouseSensitivity, defaults.mouseSensitivity)).toFixed(2),
    ),
    mouseNominalPressure: Number(
      clamp(finiteOr(src.mouseNominalPressure, defaults.mouseNominalPressure), 0.15, 1).toFixed(2),
    ),
  });
}

export function applyStudioStylusTiltPreset(
  policy: StudioStylusTiltMousePolicy,
  presetId: StudioStylusTiltPresetId,
): StudioStylusTiltMousePolicy {
  const preset = TILT_PRESETS[presetId] ?? TILT_PRESETS.linear;
  return normalizeStudioStylusTiltMousePolicy({
    ...policy,
    ...preset,
    tiltEnabled: true,
  });
}

export function isStudioStylusTiltMousePolicyDefault(
  policy: StudioStylusTiltMousePolicy,
): boolean {
  const d = DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
  return (
    policy.tiltEnabled === d.tiltEnabled &&
    policy.tiltPresetId === d.tiltPresetId &&
    policy.tiltDeadZoneDeg === d.tiltDeadZoneDeg &&
    policy.tiltSaturationDeg === d.tiltSaturationDeg &&
    policy.tiltExponent === d.tiltExponent &&
    policy.maxTiltBroadening === d.maxTiltBroadening &&
    policy.mouseFallbackMode === d.mouseFallbackMode &&
    policy.mouseSensitivity === d.mouseSensitivity &&
    policy.mouseNominalPressure === d.mouseNominalPressure
  );
}

export interface StudioTiltCurveEvaluation {
  readonly normalizedTilt: number;
  readonly curvedTilt: number;
  readonly broadeningFactor: number;
  readonly inkFlowScale: number;
}

export function evaluateStudioStylusTiltCurve(
  tiltMagnitudeDeg: number,
  policy: StudioStylusTiltMousePolicy = DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY,
): StudioTiltCurveEvaluation {
  if (!policy.tiltEnabled) {
    return Object.freeze({
      normalizedTilt: 0,
      curvedTilt: 0,
      broadeningFactor: 1,
      inkFlowScale: 1,
    });
  }
  const safeDeg = clamp(finiteOr(tiltMagnitudeDeg, 0), 0, 89);
  const span = Math.max(8, policy.tiltSaturationDeg - policy.tiltDeadZoneDeg);
  const normalizedTilt = clamp01((safeDeg - policy.tiltDeadZoneDeg) / span);
  const curvedTilt = clamp01(Math.pow(normalizedTilt, policy.tiltExponent));
  const broadeningFactor = 1 + curvedTilt * Math.max(0, policy.maxTiltBroadening - 1);
  const inkFlowScale = clamp(1 - curvedTilt * 0.28, 0.45, 1);
  return Object.freeze({
    normalizedTilt: Number(normalizedTilt.toFixed(4)),
    curvedTilt: Number(curvedTilt.toFixed(4)),
    broadeningFactor: Number(broadeningFactor.toFixed(4)),
    inkFlowScale: Number(inkFlowScale.toFixed(4)),
  });
}

function smoothstep01(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export function evaluateStudioMousePressureFallback(input: {
  readonly velocityPxPerMs?: number;
  readonly strokeProgress01?: number;
  readonly policy?: StudioStylusTiltMousePolicy;
}): number {
  const policy = input.policy ?? DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
  const nominal = policy.mouseNominalPressure;
  if (policy.mouseFallbackMode === "fixed") {
    return nominal;
  }
  if (policy.mouseFallbackMode === "taper-ends") {
    const p = clamp01(finiteOr(input.strokeProgress01, 0.5));
    const entry = smoothstep01(p / 0.2);
    const exit = smoothstep01((1 - p) / 0.2);
    const envelope = Math.min(entry, exit);
    const floor = clamp(nominal * (1 - policy.mouseSensitivity * 0.8), 0.08, nominal);
    return Number(clamp01(floor + (nominal - floor) * envelope).toFixed(4));
  }
  const velocity = Math.max(0, finiteOr(input.velocityPxPerMs, 0));
  const velocityRatio = clamp01(velocity / 1.8);
  const attenuated = nominal * (1 - policy.mouseSensitivity * 0.82 * velocityRatio);
  return Number(clamp(attenuated, 0.12, 1).toFixed(4));
}

export interface StudioLiveStylusSampleEvaluation {
  readonly pointerSource: "hardware-stylus" | "mouse-fallback";
  readonly rawPressure: number;
  readonly mappedPressure: number;
  readonly tiltDeg: number;
  readonly broadeningFactor: number;
  readonly velocityPxPerMs: number;
}

export function evaluateStudioLiveStylusOrMouseSample(input: {
  readonly rawEvent: unknown;
  readonly velocityPxPerMs?: number;
  readonly strokeProgress01?: number;
  readonly pressureProfile?: StudioStylusPressureProfile;
  readonly tiltMousePolicy?: StudioStylusTiltMousePolicy;
}): StudioLiveStylusSampleEvaluation {
  const packet = normalizeHardwareStylusPacket(input.rawEvent);
  const pressureProfile = input.pressureProfile ?? DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
  const tiltMousePolicy = input.tiltMousePolicy ?? DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
  const velocity = Math.max(0, finiteOr(input.velocityPxPerMs, 0));
  const hasHardware =
    packet.pointerType === "pen" ||
    (packet.pointerType === "touch" && packet.pressure !== 0.5 && packet.pressure > 0);
  const rawPressure = hasHardware
    ? packet.pressure
    : evaluateStudioMousePressureFallback({
        velocityPxPerMs: velocity,
        strokeProgress01: input.strokeProgress01,
        policy: tiltMousePolicy,
      });
  const mappedPressure = studioStylusPressureProfileMap(rawPressure, pressureProfile);
  const tiltEval = hasHardware
    ? evaluateStudioStylusTiltCurve(packet.tiltMagnitudeDeg, tiltMousePolicy)
    : { broadeningFactor: 1 };
  return Object.freeze({
    pointerSource: hasHardware ? "hardware-stylus" : "mouse-fallback",
    rawPressure: Number(rawPressure.toFixed(4)),
    mappedPressure: Number(mappedPressure.toFixed(4)),
    tiltDeg: hasHardware ? packet.tiltMagnitudeDeg : 0,
    broadeningFactor: tiltEval.broadeningFactor,
    velocityPxPerMs: Number(velocity.toFixed(3)),
  });
}

let activePolicy: StudioStylusTiltMousePolicy = DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
let hydrated = false;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(STUDIO_STYLUS_TILT_MOUSE_STORAGE_KEY);
    if (raw) activePolicy = normalizeStudioStylusTiltMousePolicy(JSON.parse(raw));
  } catch {
    activePolicy = DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
  }
}

function emit(next: StudioStylusTiltMousePolicy): void {
  activePolicy = next;
  for (const listener of listeners) listener();
}

export function getStudioStylusTiltMousePolicySnapshot(): StudioStylusTiltMousePolicy {
  ensureHydrated();
  return activePolicy;
}

export function getStudioStylusTiltMousePolicyServerSnapshot(): StudioStylusTiltMousePolicy {
  return DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY;
}

export function setStudioStylusTiltMousePolicy(
  value: unknown,
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusTiltMousePolicy {
  const next = normalizeStudioStylusTiltMousePolicy(value);
  if (options.persist !== false) {
    try {
      storage()?.setItem(STUDIO_STYLUS_TILT_MOUSE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 로컬 스토리지 불가 시 메모리 상태만 유지한다.
    }
  }
  hydrated = true;
  emit(next);
  return next;
}

export function resetStudioStylusTiltMousePolicy(
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusTiltMousePolicy {
  if (options.persist !== false) {
    try {
      storage()?.removeItem(STUDIO_STYLUS_TILT_MOUSE_STORAGE_KEY);
    } catch {
      // 로컬 스토리지 불가 시 메모리 초기화만 수행한다.
    }
  }
  hydrated = true;
  emit(DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY);
  return activePolicy;
}

export function subscribeStudioStylusTiltMousePolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
