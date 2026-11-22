/**
 * 태블릿 펜 지연 실측 및 OS별 120Hz/240Hz Coalesced Pointer 자동 튜너.
 *
 * - `getCoalescedEvents()` 타임스탬프 Δt 중앙값과 P95 지터를 순수 메모리 슬라이딩 윈도로 계측해
 *   60Hz / 90Hz / 120Hz / 240Hz 기기 프로파일을 자동 판별한다.
 * - OS별 입력 파이프라인(iPadOS · Android · Windows Ink · macOS) 특성과 실측 지터를 반영해
 *   Catmull-Rom 예측 보간 창(`0~6ms`)을 자동 추천한다.
 * - 탭 복귀·슬립 직후 비정상 `Δt > 200ms` 스파이크를 `maxClampMs = 24ms`로 차단하고,
 *   `touch-gesture-model`의 손바닥 접촉 크기·활성 펜 시간창 팜 리젝션 가드를 통합한다.
 * - 네트워크·브라우저 저장소에 의존하지 않는 ₩0 순수 로컬 런타임 모듈이다.
 */
import {
  PALM_CONTACT_MAX_AREA_PX2,
  PALM_CONTACT_MAX_DIAMETER_PX,
  PALM_REJECTION_WINDOW_MS,
  isPalmContactSize,
  shouldRejectPalmTouch,
  type TouchSample,
} from "./touch-gesture-model";

export const PEN_CADENCE_TIERS = [60, 90, 120, 240] as const;
export type PenCadenceTier = (typeof PEN_CADENCE_TIERS)[number];
export type PenCadenceProfileId = `${PenCadenceTier}hz`;

export const PEN_OS_FAMILIES = ["ipados", "android", "windows", "macos", "unknown"] as const;
export type PenOsFamily = (typeof PEN_OS_FAMILIES)[number];
export type PenOsSelection = "auto" | PenOsFamily;

export type PenCadenceCalibrationState = "idle" | "collecting" | "locked";
export type PenCadenceHealthTone = "neutral" | "info" | "good" | "warn" | "bad";
export type PenRejectionReason =
  | "accepted" | "palm-contact-size" | "palm-pen-window" | "non-pen-pointer" | "invalid-timestamp";

/** 탭 복귀·슬립 스파이크 판정(200ms)·최대 클램프(24ms)·Catmull-Rom 예측(0~6ms) 상수. */
export const PEN_SPIKE_THRESHOLD_MS = 200;
export const PEN_DELTA_MAX_CLAMP_MS = 24;
export const PEN_PREDICTION_MIN_MS = 0;
export const PEN_PREDICTION_MAX_MS = 6;
export const PEN_CADENCE_MIN_SAMPLES = 8;
export const PEN_CADENCE_DEFAULT_WINDOW_SIZE = 96;
export const PEN_CATMULL_ROM_MAX_EXTRAPOLATION_PX = 24;

export interface PenOsEnvironmentHint {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly maxTouchPoints?: number;
}

export interface PenOsTuningPolicy {
  readonly os: PenOsFamily;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly preferPointerRawUpdate: boolean;
  readonly predictionScale: number;
  readonly jitterCautionMs: number;
  readonly summaryKo: string;
}

export interface PenPointerSampleInput {
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly timeStamp: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pressure?: number;
  readonly isPrimary?: boolean;
}

export interface CoalescedPointerEventLike extends PenPointerSampleInput {
  readonly getCoalescedEvents?: () => readonly PenPointerSampleInput[];
}

export interface PenDeltaClampResult {
  readonly rawDeltaMs: number;
  readonly clampedDeltaMs: number;
  readonly spikeDetected: boolean;
  readonly clamped: boolean;
}

export interface PenPalmGuardResult {
  readonly rejected: boolean;
  readonly isPalm: boolean;
  readonly reason: PenRejectionReason;
}

export interface PenPoint2D { readonly x: number; readonly y: number; readonly t: number; }

export interface PenCadenceRecommendation {
  readonly profileId: PenCadenceProfileId;
  readonly tierHz: PenCadenceTier;
  readonly predictionWindowMs: number;
  readonly maxClampMs: number;
  readonly preferPointerRawUpdate: boolean;
  readonly healthTone: PenCadenceHealthTone;
  readonly rationaleKo: string;
}

export interface PenCadenceSnapshot {
  readonly calibrationState: PenCadenceCalibrationState;
  readonly osFamily: PenOsFamily;
  readonly osSelection: PenOsSelection;
  readonly osPolicy: PenOsTuningPolicy;
  readonly sampleCount: number;
  readonly totalAcceptedSamples: number;
  readonly coalescedBatchAverage: number;
  readonly coalescedSupported: boolean;
  readonly medianDeltaMs: number | null;
  readonly p95DeltaMs: number | null;
  readonly p95JitterMs: number | null;
  readonly measuredHz: number | null;
  readonly detectedTierHz: PenCadenceTier;
  readonly detectedProfileId: PenCadenceProfileId;
  readonly recommendedPredictionWindowMs: number;
  readonly maxClampMs: number;
  readonly spikeThresholdMs: number;
  readonly spikeClampedCount: number;
  readonly lastSpikeRawMs: number | null;
  readonly palmRejectedCount: number;
  readonly lastPalmRejectReason: Exclude<PenRejectionReason, "accepted"> | null;
  readonly zeroDeltaCount: number;
  readonly recommendation: PenCadenceRecommendation;
}

export interface PenCadenceIngestResult {
  readonly processedCount: number;
  readonly acceptedCount: number;
  readonly coalescedCount: number;
  readonly palmRejectedCount: number;
  readonly nonPenIgnoredCount: number;
  readonly spikeClampedCount: number;
  readonly lastEffectiveDeltaMs: number | null;
  readonly lastSpikeRawMs: number | null;
  readonly predictedPoint: PenPoint2D | null;
  readonly snapshot: PenCadenceSnapshot;
}

export interface CoalescedPointerCadenceProfilerOptions {
  readonly windowSize?: number;
  readonly minSamplesToLock?: number;
  readonly spikeThresholdMs?: number;
  readonly maxClampMs?: number;
  readonly palmWindowMs?: number;
  readonly palmMaxDiameterPx?: number;
  readonly palmMaxAreaPx2?: number;
  readonly osOverride?: PenOsSelection;
  readonly envHint?: PenOsEnvironmentHint;
}

const OS_POLICIES: Readonly<Record<PenOsFamily, PenOsTuningPolicy>> = Object.freeze({
  ipados: Object.freeze({ os: "ipados", labelKo: "iPadOS · Apple Pencil", shortLabelKo: "iPadOS", preferPointerRawUpdate: false, predictionScale: 0.85, jitterCautionMs: 2.4, summaryKo: "ProMotion 120/240Hz 병합 이벤트 우선 · 과예측 억제 계수 적용" }),
  android: Object.freeze({ os: "android", labelKo: "Android · S-Pen / USI", shortLabelKo: "Android", preferPointerRawUpdate: true, predictionScale: 1.0, jitterCautionMs: 3.2, summaryKo: "pointerrawupdate + Coalesced 병행 · 합성기 지연 보정 적용" }),
  windows: Object.freeze({ os: "windows", labelKo: "Windows Ink · 디지타이저", shortLabelKo: "Windows", preferPointerRawUpdate: true, predictionScale: 0.95, jitterCautionMs: 3.5, summaryKo: "Windows Ink 고주사율 병합 수집 · 무선 펜 지터 감쇠 적용" }),
  macos: Object.freeze({ os: "macos", labelKo: "macOS · 펜 태블릿 / Sidecar", shortLabelKo: "macOS", preferPointerRawUpdate: false, predictionScale: 0.9, jitterCautionMs: 2.8, summaryKo: "Coalesced 표본 기반 안정 보간 · Sidecar/Wacom 변동 대응" }),
  unknown: Object.freeze({ os: "unknown", labelKo: "표준 포인터 환경", shortLabelKo: "표준", preferPointerRawUpdate: false, predictionScale: 0.9, jitterCautionMs: 3.0, summaryKo: "기기 실측 Δt 중앙값과 P95 지터에 맞춰 예측 창을 자동 조절" }),
});

const BASE_PREDICTION_MS_BY_TIER: Readonly<Record<PenCadenceTier, number>> = Object.freeze({ 240: 1.8, 120: 3.2, 90: 4.4, 60: 5.6 });

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;
const positiveOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const sampleCoord = (a: number | undefined, b: number | undefined): number =>
  typeof a === "number" && Number.isFinite(a) ? a : typeof b === "number" && Number.isFinite(b) ? b : 0;

function readAmbientEnvHint(): PenOsEnvironmentHint {
  const nav = (globalThis as {
    navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number };
  }).navigator;
  if (!nav) return {};
  return {
    userAgent: typeof nav.userAgent === "string" ? nav.userAgent : undefined,
    platform: typeof nav.platform === "string" ? nav.platform : undefined,
    maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : undefined,
  };
}

/** User-Agent·플랫폼·터치 포인트 힌트로 태블릿 OS 계열을 판별한다. */
export function detectPenOsFamily(hint?: PenOsEnvironmentHint): PenOsFamily {
  const resolved = hint ?? readAmbientEnvHint();
  const ua = (resolved.userAgent ?? "").toLowerCase();
  const platform = (resolved.platform ?? "").toLowerCase();
  const touchPoints = Number.isFinite(resolved.maxTouchPoints) ? (resolved.maxTouchPoints ?? 0) : 0;
  if (ua.includes("ipad") || ua.includes("iphone") || ua.includes("ipod") || ((ua.includes("macintosh") || platform.includes("mac")) && touchPoints > 1)) return "ipados";
  if (ua.includes("android")) return "android";
  if (ua.includes("windows") || platform.startsWith("win")) return "windows";
  if (ua.includes("macintosh") || ua.includes("mac os") || platform.includes("mac")) return "macos";
  return "unknown";
}

export const getPenOsTuningPolicy = (os: PenOsFamily): PenOsTuningPolicy => OS_POLICIES[os];

/** 히든 디테일(#005): 탭 복귀·슬립 직후 비정상 `Δt > 200ms` 스파이크를 `maxClampMs = 24ms`로 차단한다. */
export function clampPenDeltaMs(
  rawDeltaMs: number,
  options?: { readonly spikeThresholdMs?: number; readonly maxClampMs?: number },
): PenDeltaClampResult {
  const spikeThresholdMs = positiveOr(options?.spikeThresholdMs, PEN_SPIKE_THRESHOLD_MS);
  const maxClampMs = positiveOr(options?.maxClampMs, PEN_DELTA_MAX_CLAMP_MS);
  if (!Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) return { rawDeltaMs, clampedDeltaMs: 0, spikeDetected: false, clamped: false };
  if (rawDeltaMs > spikeThresholdMs) return { rawDeltaMs, clampedDeltaMs: maxClampMs, spikeDetected: true, clamped: true };
  if (rawDeltaMs > maxClampMs) return { rawDeltaMs, clampedDeltaMs: maxClampMs, spikeDetected: false, clamped: true };
  return { rawDeltaMs, clampedDeltaMs: rawDeltaMs, spikeDetected: false, clamped: false };
}

/** 히든 디테일(#005): 손바닥 오입력(접촉 크기 + 스타일러스 활성 시간창) 및 비-펜 포인터를 차단한다. */
export function evaluatePenPalmGuard(
  sample: PenPointerSampleInput,
  lastPenTimestampMs: number | null,
  options?: { readonly palmWindowMs?: number; readonly palmMaxDiameterPx?: number; readonly palmMaxAreaPx2?: number },
): PenPalmGuardResult {
  if (typeof sample.timeStamp !== "number" || !Number.isFinite(sample.timeStamp)) {
    return { rejected: true, isPalm: false, reason: "invalid-timestamp" };
  }
  if (sample.pointerType === "pen") return { rejected: false, isPalm: false, reason: "accepted" };
  if (sample.pointerType === "touch") {
    const touchSample: TouchSample = {
      pointerId: typeof sample.pointerId === "number" ? sample.pointerId : 0,
      x: sampleCoord(sample.clientX, sample.x),
      y: sampleCoord(sample.clientY, sample.y),
      t: sample.timeStamp,
      pointerType: "touch",
      width: sample.width,
      height: sample.height,
    };
    if (isPalmContactSize(touchSample, options?.palmMaxDiameterPx ?? PALM_CONTACT_MAX_DIAMETER_PX, options?.palmMaxAreaPx2 ?? PALM_CONTACT_MAX_AREA_PX2)) {
      return { rejected: true, isPalm: true, reason: "palm-contact-size" };
    }
    if (shouldRejectPalmTouch(touchSample, lastPenTimestampMs, options?.palmWindowMs ?? PALM_REJECTION_WINDOW_MS)) {
      return { rejected: true, isPalm: true, reason: "palm-pen-window" };
    }
  }
  return { rejected: true, isPalm: false, reason: "non-pen-pointer" };
}

/** `PointerEvent.getCoalescedEvents()`를 방어적으로 읽어 병합 표본 배열을 반환한다. */
export function extractCoalescedPointerSamples(event: CoalescedPointerEventLike): {
  readonly samples: readonly PenPointerSampleInput[];
  readonly fromCoalescedApi: boolean;
} {
  if (typeof event.getCoalescedEvents === "function") {
    try {
      const raw = event.getCoalescedEvents();
      if (Array.isArray(raw) && raw.length > 0) {
        const valid = raw.filter(
          (item): item is PenPointerSampleInput => Boolean(item) && typeof item === "object" && typeof item.timeStamp === "number",
        );
        if (valid.length > 0) return { samples: valid, fromCoalescedApi: true };
      }
    } catch {
      // 일부 WebView 폴리필 예외 시 원본 이벤트로 안전 폴백한다.
    }
  }
  return { samples: [event], fromCoalescedApi: false };
}

/** 오름차순 정렬 배열에서 선형 보간 백분위수(0~1)를 계산한다. */
export function computeSortedPercentile(sorted: readonly number[], percentile01: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const pos = clampNumber(percentile01, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? loVal;
  return lo === hi ? loVal : loVal + (hiVal - loVal) * (pos - lo);
}

/** Δt 중앙값(ms)에서 60Hz / 90Hz / 120Hz / 240Hz 기기 주사율 티어를 판별한다. */
export function classifyPenCadenceTier(medianDeltaMs: number): PenCadenceTier {
  if (!Number.isFinite(medianDeltaMs) || medianDeltaMs <= 0) return 60;
  const hz = 1000 / medianDeltaMs;
  if (hz >= 180) return 240;
  if (hz >= 105) return 120;
  if (hz >= 75) return 90;
  return 60;
}

/** 주사율 티어·중앙값 Δt·P95 지터·OS 정책을 종합해 Catmull-Rom 예측 보간 창(`0~6ms`)을 계산한다. */
export function computeCatmullRomPredictionWindowMs(params: {
  readonly tierHz: PenCadenceTier;
  readonly medianDeltaMs: number;
  readonly p95JitterMs: number;
  readonly osFamily: PenOsFamily;
  readonly calibrationState: PenCadenceCalibrationState;
}): number {
  if (params.calibrationState === "idle") return PEN_PREDICTION_MIN_MS;
  const policy = getPenOsTuningPolicy(params.osFamily);
  const baseWindow = BASE_PREDICTION_MS_BY_TIER[params.tierHz] * policy.predictionScale;
  const jitterRatio = Math.max(0, params.p95JitterMs) / Math.max(params.medianDeltaMs, 1);
  const ratioStability =
    jitterRatio <= 0.12 ? 1 : jitterRatio >= 0.65 ? 0 : 1 - (jitterRatio - 0.12) / 0.53;
  const absStability =
    params.p95JitterMs <= policy.jitterCautionMs
      ? 1
      : params.p95JitterMs >= policy.jitterCautionMs * 2.6
        ? 0
        : 1 - (params.p95JitterMs - policy.jitterCautionMs) / (policy.jitterCautionMs * 1.6);
  return roundToTenth(
    clampNumber(baseWindow * Math.min(ratioStability, absStability), PEN_PREDICTION_MIN_MS, PEN_PREDICTION_MAX_MS),
  );
}

/** 최근 2~4개 확정 펜 좌표로 제한된 Centripetal Catmull-Rom 예측 좌표를 계산한다. */
export function predictCatmullRomPoint(
  history: readonly PenPoint2D[],
  predictionWindowMs: number,
  options?: { readonly maxClampMs?: number; readonly maxExtrapolationPx?: number },
): PenPoint2D | null {
  const p3 = history[history.length - 1];
  if (!p3) return null;
  const safeWindow = clampNumber(predictionWindowMs, PEN_PREDICTION_MIN_MS, PEN_PREDICTION_MAX_MS);
  const p2 = history[history.length - 2];
  if (safeWindow <= 0 || !p2) return p3;

  const clamped = clampPenDeltaMs(p3.t - p2.t, { maxClampMs: options?.maxClampMs ?? PEN_DELTA_MAX_CLAMP_MS });
  if (clamped.spikeDetected || clamped.clampedDeltaMs <= 0) return p3;

  const u = Math.min(0.75, safeWindow / Math.max(0.5, clamped.clampedDeltaMs));
  let dx = (p3.x - p2.x) * u;
  let dy = (p3.y - p2.y) * u;
  if (history.length >= 4) {
    const p0 = history[history.length - 4];
    const p1 = history[history.length - 3];
    if (p0 && p1) {
      const accX = (p3.x - p2.x - (p2.x - p1.x)) * 0.35 + (p2.x - p1.x - (p1.x - p0.x)) * 0.1;
      const accY = (p3.y - p2.y - (p2.y - p1.y)) * 0.35 + (p2.y - p1.y - (p1.y - p0.y)) * 0.1;
      dx = (p3.x - p2.x) * u + 0.5 * accX * u * u;
      dy = (p3.y - p2.y) * u + 0.5 * accY * u * u;
    }
  }
  const maxPx = options?.maxExtrapolationPx ?? PEN_CATMULL_ROM_MAX_EXTRAPOLATION_PX;
  const distance = Math.hypot(dx, dy);
  if (distance > maxPx && distance > 0) {
    dx *= maxPx / distance;
    dy *= maxPx / distance;
  }
  return { x: p3.x + dx, y: p3.y + dy, t: p3.t + safeWindow };
}

function buildRecommendation(
  calibrationState: PenCadenceCalibrationState,
  tierHz: PenCadenceTier,
  medianDeltaMs: number | null,
  p95JitterMs: number | null,
  osPolicy: PenOsTuningPolicy,
  predictionWindowMs: number,
  maxClampMs: number,
  spikeThresholdMs: number,
): PenCadenceRecommendation {
  const base = {
    profileId: `${tierHz}hz` as PenCadenceProfileId,
    tierHz,
    maxClampMs,
    preferPointerRawUpdate: osPolicy.preferPointerRawUpdate,
  };
  if (calibrationState === "idle") {
    return Object.freeze({
      ...base,
      predictionWindowMs: 0,
      healthTone: "neutral" as const,
      rationaleKo: `펜으로 1회 그으면 주사율과 지터를 실측합니다. ${spikeThresholdMs}ms 초과 스파이크는 ${maxClampMs}ms로 차단합니다.`,
    });
  }
  if (calibrationState === "collecting") {
    return Object.freeze({
      ...base,
      predictionWindowMs,
      healthTone: "info" as const,
      rationaleKo: `표본 수집 중 · 임시 ${tierHz}Hz 기준 Catmull-Rom ${predictionWindowMs.toFixed(1)}ms 적용`,
    });
  }
  const jitter = p95JitterMs ?? 0;
  const jitterRatio = jitter / Math.max(medianDeltaMs ?? 1000 / tierHz, 1);
  let healthTone: PenCadenceHealthTone = "good";
  let rationaleKo = `${tierHz}Hz 안정 감지 · Catmull-Rom 예측 ${predictionWindowMs.toFixed(1)}ms 권장 (${osPolicy.shortLabelKo})`;
  if (predictionWindowMs <= 0.1 || jitterRatio >= 0.55) {
    healthTone = "bad";
    rationaleKo = `${tierHz}Hz 지터 높음(P95 ${jitter.toFixed(1)}ms) · 선 튐 방지를 위해 예측 보간을 0.0ms로 낮췄습니다.`;
  } else if (jitterRatio >= 0.25 || jitter > osPolicy.jitterCautionMs) {
    healthTone = "warn";
    rationaleKo = `${tierHz}Hz 지터 주의(P95 ${jitter.toFixed(1)}ms) · 예측 창을 ${predictionWindowMs.toFixed(1)}ms로 보수 조정했습니다.`;
  }
  return Object.freeze({ ...base, predictionWindowMs, healthTone, rationaleKo });
}

interface ProfilerCounters {
  lastPenTimestampMs: number | null;
  totalAcceptedSamples: number;
  coalescedEventCalls: number;
  coalescedSamplesSum: number;
  coalescedSupported: boolean;
  spikeClampedCount: number;
  lastSpikeRawMs: number | null;
  palmRejectedCount: number;
  lastPalmRejectReason: Exclude<PenRejectionReason, "accepted"> | null;
  zeroDeltaCount: number;
}

const initialCounters = (): ProfilerCounters => ({
  lastPenTimestampMs: null, totalAcceptedSamples: 0, coalescedEventCalls: 0,
  coalescedSamplesSum: 0, coalescedSupported: false, spikeClampedCount: 0,
  lastSpikeRawMs: null, palmRejectedCount: 0, lastPalmRejectReason: null, zeroDeltaCount: 0,
});

/**
 * OS별 60/90/120/240Hz Coalesced Pointer 주사율·지터 실측 및 Catmull-Rom 예측 창 자동 튜너.
 * 순수 메모리로만 동작하며 `useSyncExternalStore` 호환 스냅샷/구독 계약을 제공한다.
 */
export class CoalescedPointerCadenceProfiler {
  private readonly cfg: {
    readonly windowSize: number;
    readonly minSamplesToLock: number;
    readonly spikeThresholdMs: number;
    readonly maxClampMs: number;
    readonly palmWindowMs: number;
    readonly palmMaxDiameterPx: number;
    readonly palmMaxAreaPx2: number;
    readonly detectedOsFamily: PenOsFamily;
  };
  private osSelection: PenOsSelection;
  private readonly deltas: number[] = [];
  private readonly pointHistory: PenPoint2D[] = [];
  private counters: ProfilerCounters = initialCounters();
  private readonly listeners = new Set<() => void>();
  private cachedSnapshot: PenCadenceSnapshot;

  constructor(options: CoalescedPointerCadenceProfilerOptions = {}) {
    const windowSize = clampNumber(Math.round(options.windowSize ?? PEN_CADENCE_DEFAULT_WINDOW_SIZE), 16, 512);
    this.cfg = {
      windowSize,
      minSamplesToLock: clampNumber(Math.round(options.minSamplesToLock ?? PEN_CADENCE_MIN_SAMPLES), 3, windowSize),
      spikeThresholdMs: positiveOr(options.spikeThresholdMs, PEN_SPIKE_THRESHOLD_MS),
      maxClampMs: positiveOr(options.maxClampMs, PEN_DELTA_MAX_CLAMP_MS),
      palmWindowMs: options.palmWindowMs ?? PALM_REJECTION_WINDOW_MS,
      palmMaxDiameterPx: options.palmMaxDiameterPx ?? PALM_CONTACT_MAX_DIAMETER_PX,
      palmMaxAreaPx2: options.palmMaxAreaPx2 ?? PALM_CONTACT_MAX_AREA_PX2,
      detectedOsFamily: detectPenOsFamily(options.envHint),
    };
    this.osSelection = options.osOverride ?? "auto";
    this.cachedSnapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PenCadenceSnapshot => this.cachedSnapshot;

  setOsSelection(selection: PenOsSelection): PenCadenceSnapshot {
    if (this.osSelection === selection) return this.cachedSnapshot;
    this.osSelection = selection;
    return this.commitAndNotify();
  }

  /** 탭 비활성화·포인터 업 경계를 기록해 다음 스트로크에서 과거 좌표로 보간하지 않게 한다. */
  markResumeBoundary(): void {
    this.pointHistory.length = 0;
    this.counters.lastPenTimestampMs = null;
  }

  reset(): PenCadenceSnapshot {
    this.deltas.length = 0;
    this.pointHistory.length = 0;
    this.counters = initialCounters();
    return this.commitAndNotify();
  }

  ingestEvent(event: CoalescedPointerEventLike): PenCadenceIngestResult {
    const extracted = extractCoalescedPointerSamples(event);
    return this.ingestSamples(extracted.samples, extracted.fromCoalescedApi);
  }

  ingestSamples(samples: readonly PenPointerSampleInput[], fromCoalescedApi = false): PenCadenceIngestResult {
    let acceptedCount = 0;
    let palmRejectedInBatch = 0;
    let nonPenIgnoredInBatch = 0;
    let spikeClampedInBatch = 0;
    let lastEffectiveDeltaMs: number | null = null;
    let batchLastSpikeRawMs: number | null = null;
    let mutated = false;

    if (fromCoalescedApi && samples.length > 0) {
      this.counters.coalescedSupported = true;
      this.counters.coalescedEventCalls += 1;
      this.counters.coalescedSamplesSum += samples.length;
      mutated = true;
    }

    for (const sample of samples) {
      const guard = evaluatePenPalmGuard(sample, this.counters.lastPenTimestampMs, this.cfg);
      if (guard.rejected) {
        if (guard.isPalm && guard.reason !== "accepted") {
          this.counters.palmRejectedCount += 1;
          this.counters.lastPalmRejectReason = guard.reason;
          palmRejectedInBatch += 1;
          mutated = true;
        } else {
          nonPenIgnoredInBatch += 1;
        }
        continue;
      }

      acceptedCount += 1;
      this.counters.totalAcceptedSamples += 1;
      mutated = true;

      if (this.counters.lastPenTimestampMs !== null) {
        const rawDelta = sample.timeStamp - this.counters.lastPenTimestampMs;
        if (rawDelta <= 0) {
          this.counters.zeroDeltaCount += 1;
        } else {
          const clamped = clampPenDeltaMs(rawDelta, this.cfg);
          lastEffectiveDeltaMs = clamped.clampedDeltaMs;
          if (clamped.spikeDetected) {
            this.counters.spikeClampedCount += 1;
            this.counters.lastSpikeRawMs = rawDelta;
            batchLastSpikeRawMs = rawDelta;
            spikeClampedInBatch += 1;
            this.pointHistory.length = 0;
          } else {
            this.deltas.push(rawDelta);
            if (this.deltas.length > this.cfg.windowSize) this.deltas.shift();
          }
        }
      }

      this.counters.lastPenTimestampMs = sample.timeStamp;
      this.pointHistory.push({
        x: sampleCoord(sample.clientX, sample.x),
        y: sampleCoord(sample.clientY, sample.y),
        t: sample.timeStamp,
      });
      if (this.pointHistory.length > 4) this.pointHistory.shift();
    }

    const snapshot = mutated ? this.commitAndNotify() : this.cachedSnapshot;
    const predictedPoint =
      acceptedCount > 0 && spikeClampedInBatch === 0
        ? predictCatmullRomPoint(this.pointHistory, snapshot.recommendedPredictionWindowMs, this.cfg)
        : this.pointHistory[this.pointHistory.length - 1] ?? null;

    return {
      processedCount: samples.length,
      acceptedCount,
      coalescedCount: fromCoalescedApi ? samples.length : 0,
      palmRejectedCount: palmRejectedInBatch,
      nonPenIgnoredCount: nonPenIgnoredInBatch,
      spikeClampedCount: spikeClampedInBatch,
      lastEffectiveDeltaMs,
      lastSpikeRawMs: batchLastSpikeRawMs,
      predictedPoint,
      snapshot,
    };
  }

  private commitAndNotify(): PenCadenceSnapshot {
    this.cachedSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
    return this.cachedSnapshot;
  }

  private buildSnapshot(): PenCadenceSnapshot {
    const osFamily: PenOsFamily = this.osSelection === "auto" ? this.cfg.detectedOsFamily : this.osSelection;
    const osPolicy = getPenOsTuningPolicy(osFamily);
    const sampleCount = this.deltas.length;
    const calibrationState: PenCadenceCalibrationState =
      sampleCount === 0 ? "idle" : sampleCount < this.cfg.minSamplesToLock ? "collecting" : "locked";

    let medianDeltaMs: number | null = null;
    let p95DeltaMs: number | null = null;
    let p95JitterMs: number | null = null;
    let measuredHz: number | null = null;
    let detectedTierHz: PenCadenceTier = 60;
    if (sampleCount > 0) {
      const sorted = [...this.deltas].sort((a, b) => a - b);
      const rawMedian = computeSortedPercentile(sorted, 0.5);
      const deviations = sorted.map((d) => Math.abs(d - rawMedian)).sort((a, b) => a - b);
      medianDeltaMs = roundToTenth(rawMedian);
      p95DeltaMs = roundToTenth(computeSortedPercentile(sorted, 0.95));
      p95JitterMs = roundToTenth(computeSortedPercentile(deviations, 0.95));
      measuredHz = rawMedian > 0 ? roundToTenth(1000 / rawMedian) : null;
      detectedTierHz = classifyPenCadenceTier(rawMedian);
    }
    const recommendedPredictionWindowMs = computeCatmullRomPredictionWindowMs({
      tierHz: detectedTierHz, medianDeltaMs: medianDeltaMs ?? 1000 / detectedTierHz,
      p95JitterMs: p95JitterMs ?? 0, osFamily, calibrationState,
    });
    const recommendation = buildRecommendation(
      calibrationState, detectedTierHz, medianDeltaMs, p95JitterMs, osPolicy,
      recommendedPredictionWindowMs, this.cfg.maxClampMs, this.cfg.spikeThresholdMs,
    );
    const c = this.counters;
    return Object.freeze({
      calibrationState, osFamily, osSelection: this.osSelection, osPolicy, sampleCount,
      totalAcceptedSamples: c.totalAcceptedSamples,
      coalescedBatchAverage: c.coalescedEventCalls > 0 ? roundToTenth(c.coalescedSamplesSum / c.coalescedEventCalls) : 0,
      coalescedSupported: c.coalescedSupported,
      medianDeltaMs, p95DeltaMs, p95JitterMs, measuredHz, detectedTierHz,
      detectedProfileId: `${detectedTierHz}hz` as PenCadenceProfileId,
      recommendedPredictionWindowMs, maxClampMs: this.cfg.maxClampMs, spikeThresholdMs: this.cfg.spikeThresholdMs,
      spikeClampedCount: c.spikeClampedCount, lastSpikeRawMs: c.lastSpikeRawMs,
      palmRejectedCount: c.palmRejectedCount, lastPalmRejectReason: c.lastPalmRejectReason,
      zeroDeltaCount: c.zeroDeltaCount, recommendation,
    });
  }
}

let sharedPenCadenceProfiler: CoalescedPointerCadenceProfiler | null = null;
/** 스튜디오 전역에서 공유하는 순수 메모리 펜 주사율 프로파일러 싱글턴을 반환한다. */
export function getSharedPenCadenceProfiler(): CoalescedPointerCadenceProfiler {
  sharedPenCadenceProfiler ??= new CoalescedPointerCadenceProfiler();
  return sharedPenCadenceProfiler;
}
/** 테스트 격리용 순수 메모리 싱글턴 초기화 헬퍼. */
export function resetSharedPenCadenceProfilerForTests(): void {
  sharedPenCadenceProfiler?.reset();
  sharedPenCadenceProfiler = null;
}
