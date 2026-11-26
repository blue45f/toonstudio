/**
 * 모바일·태블릿 열/배터리 적응형 프레임 페이서, A/B 이중 저널 즉시 복구기, 제로-트러스트 비추출 키 볼트.
 *
 * - `ThermalBatteryAdaptivePacer`: 롤링 프레임 시간 드리프트(선형 회귀 기울기)와 배터리/저전력
 *   신호로 발열 스로틀링을 조기 예측하고 `ultra-120hz → balanced-90hz → cool-60hz → battery-saver-45hz`
 *   단계로 VRS 타일 비율 · SVT 밉 바이어스 · XPBD 서브스텝을 협조 제어한다.
 * - `DualJournalSessionRestorer`: FNV-1a 헤더/페이로드 체크섬과 커밋 센티넬을 포함한 A/B 원자적
 *   이중 저널 바이너리 스냅샷으로 50ms 미만 크래시·새로고침 즉시 복구를 보장한다.
 * - `ZeroTrustKeyVault`: `./zero-trust-key-vault`에서 WebCrypto `extractable: false` 래퍼를 재공개한다.
 */

import {
  ZeroTrustKeyVault,
  type EncryptedVaultEnvelope,
  type VaultKeyAuditRecord,
} from "./zero-trust-key-vault";

export { ZeroTrustKeyVault, type EncryptedVaultEnvelope, type VaultKeyAuditRecord };

export type ThermalQualityProfileId =
  | "ultra-120hz"
  | "balanced-90hz"
  | "cool-60hz"
  | "battery-saver-45hz";

export type VrsShadingRate = "1x1" | "2x1" | "2x2" | "4x2";
export type DeviceThermalState = "nominal" | "fair" | "serious" | "critical";

export interface ThermalQualityProfile {
  readonly id: ThermalQualityProfileId;
  readonly tierIndex: number;
  readonly targetFps: number;
  readonly frameBudgetMs: number;
  readonly vrsTileRate: VrsShadingRate;
  readonly svtMipBias: number;
  readonly xpbdSubsteps: number;
  readonly particleDensityScale: number;
  readonly postProcessEnabled: boolean;
}

export const THERMAL_QUALITY_PROFILE_ORDER: readonly ThermalQualityProfileId[] = [
  "ultra-120hz",
  "balanced-90hz",
  "cool-60hz",
  "battery-saver-45hz",
];

export const THERMAL_QUALITY_PROFILES: Readonly<
  Record<ThermalQualityProfileId, ThermalQualityProfile>
> = {
  "ultra-120hz": {
    id: "ultra-120hz",
    tierIndex: 0,
    targetFps: 120,
    frameBudgetMs: 8.33,
    vrsTileRate: "1x1",
    svtMipBias: 0,
    xpbdSubsteps: 8,
    particleDensityScale: 1,
    postProcessEnabled: true,
  },
  "balanced-90hz": {
    id: "balanced-90hz",
    tierIndex: 1,
    targetFps: 90,
    frameBudgetMs: 11.11,
    vrsTileRate: "2x1",
    svtMipBias: 0.5,
    xpbdSubsteps: 6,
    particleDensityScale: 0.8,
    postProcessEnabled: true,
  },
  "cool-60hz": {
    id: "cool-60hz",
    tierIndex: 2,
    targetFps: 60,
    frameBudgetMs: 16.67,
    vrsTileRate: "2x2",
    svtMipBias: 1,
    xpbdSubsteps: 4,
    particleDensityScale: 0.55,
    postProcessEnabled: true,
  },
  "battery-saver-45hz": {
    id: "battery-saver-45hz",
    tierIndex: 3,
    targetFps: 45,
    frameBudgetMs: 22.22,
    vrsTileRate: "4x2",
    svtMipBias: 1.75,
    xpbdSubsteps: 2,
    particleDensityScale: 0.3,
    postProcessEnabled: false,
  },
};

export interface FrameTelemetrySample {
  readonly frameTimeMs: number;
  readonly batteryLevel?: number;
  readonly charging?: boolean;
  readonly lowPowerMode?: boolean;
  readonly thermalState?: DeviceThermalState;
}

export interface ThermalPacerOptions {
  readonly initialProfileId?: ThermalQualityProfileId;
  readonly windowSize?: number;
  readonly stepDownStreakRequired?: number;
  readonly stepUpStreakRequired?: number;
}

export interface FramePacerDirective {
  readonly profileId: ThermalQualityProfileId;
  readonly previousProfileId: ThermalQualityProfileId;
  readonly transitioned: boolean;
  readonly direction: "steady" | "step-down" | "step-up";
  readonly predictedThrottling: boolean;
  readonly thermalPressureScore: number;
  readonly rollingMeanFrameMs: number;
  readonly rollingP95FrameMs: number;
  readonly driftMsPerFrame: number;
  readonly targetFps: number;
  readonly vrsTileRate: VrsShadingRate;
  readonly svtMipBias: number;
  readonly xpbdSubsteps: number;
  readonly postProcessEnabled: boolean;
  readonly reasonKo: string;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function computeLinearSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return Math.abs(denom) < 1e-9 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/** 롤링 프레임 드리프트와 발열/배터리 신호로 품질 프로파일(VRS·SVT·XPBD)을 조절하는 적응형 페이서. */
export class ThermalBatteryAdaptivePacer {
  private readonly windowSize: number;
  private readonly stepDownStreakRequired: number;
  private readonly stepUpStreakRequired: number;
  private readonly frameWindow: number[] = [];
  private tierIndex: number;
  private stressStreak = 0;
  private calmStreak = 0;
  private totalTransitions = 0;

  constructor(options?: ThermalPacerOptions) {
    this.windowSize = Math.max(6, options?.windowSize ?? 16);
    this.stepDownStreakRequired = Math.max(1, options?.stepDownStreakRequired ?? 3);
    this.stepUpStreakRequired = Math.max(4, options?.stepUpStreakRequired ?? 12);
    this.tierIndex = THERMAL_QUALITY_PROFILES[options?.initialProfileId ?? "ultra-120hz"].tierIndex;
  }

  public getCurrentProfile(): ThermalQualityProfile {
    return THERMAL_QUALITY_PROFILES[THERMAL_QUALITY_PROFILE_ORDER[this.tierIndex]];
  }

  public getTransitionCount(): number {
    return this.totalTransitions;
  }

  public recordFrame(sample: FrameTelemetrySample): FramePacerDirective {
    const previousProfile = this.getCurrentProfile();
    const safeFrameMs =
      Number.isFinite(sample.frameTimeMs) && sample.frameTimeMs > 0
        ? Math.max(0.5, sample.frameTimeMs)
        : previousProfile.frameBudgetMs;
    this.frameWindow.push(safeFrameMs);
    if (this.frameWindow.length > this.windowSize) this.frameWindow.shift();

    let sum = 0;
    for (let i = 0; i < this.frameWindow.length; i += 1) sum += this.frameWindow[i];
    const rollingMeanFrameMs = sum / this.frameWindow.length;
    const sorted = this.frameWindow.slice().sort((a, b) => a - b);
    const rollingP95FrameMs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const driftMsPerFrame = computeLinearSlope(this.frameWindow);

    const budgetRatio = rollingP95FrameMs / previousProfile.frameBudgetMs;
    const overshootPressure = clamp01((budgetRatio - 0.85) / 0.55);
    const driftPressure = clamp01((driftMsPerFrame - 0.08) / 0.45);

    const charging = sample.charging ?? true;
    const batteryLevel =
      typeof sample.batteryLevel === "number" && Number.isFinite(sample.batteryLevel)
        ? clamp01(sample.batteryLevel)
        : 1;
    let batteryPressure = sample.lowPowerMode ? 0.72 : 0;
    if (!charging && batteryLevel <= 0.25) {
      batteryPressure = Math.max(batteryPressure, clamp01((0.28 - batteryLevel) / 0.22));
    }
    const osThermalPressure =
      sample.thermalState === "critical"
        ? 1
        : sample.thermalState === "serious"
          ? 0.75
          : sample.thermalState === "fair"
            ? 0.35
            : 0;

    const thermalPressureScore = round3(
      clamp01(overshootPressure * 0.48 + driftPressure * 0.27 + Math.max(batteryPressure, osThermalPressure) * 0.45),
    );
    const predictedThrottling =
      thermalPressureScore >= 0.52 ||
      (driftMsPerFrame >= 0.22 && budgetRatio >= 0.92) ||
      sample.thermalState === "serious" ||
      sample.thermalState === "critical";

    const maxAllowedTierForPower =
      sample.thermalState === "critical" || (sample.lowPowerMode && !charging && batteryLevel <= 0.15)
        ? 3
        : sample.lowPowerMode || (!charging && batteryLevel <= 0.2)
          ? 2
          : 0;

    let direction: "steady" | "step-down" | "step-up" = "steady";
    let reasonKo = "열·프레임 예산이 안정 범위 안에 있어 현재 프로파일을 유지합니다.";

    if (predictedThrottling || this.tierIndex < maxAllowedTierForPower) {
      this.stressStreak += 1;
      this.calmStreak = 0;
      const shouldDrop = sample.thermalState === "critical" || this.stressStreak >= this.stepDownStreakRequired;
      if (shouldDrop && this.tierIndex < THERMAL_QUALITY_PROFILE_ORDER.length - 1) {
        this.tierIndex += 1;
        this.stressStreak = 0;
        this.totalTransitions += 1;
        direction = "step-down";
        reasonKo = `프레임 드리프트(+${round3(driftMsPerFrame)}ms/frame) 및 열 압력(${thermalPressureScore}) 감지로 품질 프로파일을 한 단계 하향합니다.`;
      } else if (predictedThrottling) {
        reasonKo = "발열 스로틀링 조짐을 관찰 중이며 히스테리시스 확인 후 단계 하향을 준비합니다.";
      }
    } else if (thermalPressureScore <= 0.22 && budgetRatio <= 0.72 && driftMsPerFrame <= 0.05) {
      this.calmStreak += 1;
      this.stressStreak = 0;
      if (this.calmStreak >= this.stepUpStreakRequired && this.tierIndex > maxAllowedTierForPower) {
        this.tierIndex -= 1;
        this.calmStreak = 0;
        this.totalTransitions += 1;
        direction = "step-up";
        reasonKo = "연속 안정 프레임과 냉각 여유가 확인되어 품질 프로파일을 한 단계 복구합니다.";
      }
    } else {
      this.stressStreak = Math.max(0, this.stressStreak - 1);
      this.calmStreak = 0;
    }

    const active = this.getCurrentProfile();
    return {
      profileId: active.id,
      previousProfileId: previousProfile.id,
      transitioned: active.id !== previousProfile.id,
      direction,
      predictedThrottling,
      thermalPressureScore,
      rollingMeanFrameMs: round3(rollingMeanFrameMs),
      rollingP95FrameMs: round3(rollingP95FrameMs),
      driftMsPerFrame: round3(driftMsPerFrame),
      targetFps: active.targetFps,
      vrsTileRate: active.vrsTileRate,
      svtMipBias: active.svtMipBias,
      xpbdSubsteps: active.xpbdSubsteps,
      postProcessEnabled: active.postProcessEnabled,
      reasonKo,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Dual-Journaled Instant Session Snapshot Restore (A/B Atomic + FNV-1a)      */
/* -------------------------------------------------------------------------- */

export type JournalSlotId = "A" | "B";

export interface DualJournalStorageAdapter {
  readSlot(slot: JournalSlotId): Uint8Array | null;
  writeSlot(slot: JournalSlotId, bytes: Uint8Array): void;
  clearSlot(slot: JournalSlotId): void;
}

export class InMemoryDualJournalStorage implements DualJournalStorageAdapter {
  private slotA: Uint8Array | null = null;
  private slotB: Uint8Array | null = null;

  public readSlot(slot: JournalSlotId): Uint8Array | null {
    const src = slot === "A" ? this.slotA : this.slotB;
    return src ? src.slice() : null;
  }

  public writeSlot(slot: JournalSlotId, bytes: Uint8Array): void {
    const copy = bytes.slice();
    if (slot === "A") this.slotA = copy;
    else this.slotB = copy;
  }

  public clearSlot(slot: JournalSlotId): void {
    if (slot === "A") this.slotA = null;
    else this.slotB = null;
  }
}

export interface JournalCommitReceipt {
  readonly slot: JournalSlotId;
  readonly sequenceNumber: number;
  readonly savedAtMs: number;
  readonly totalBytes: number;
  readonly payloadChecksumHex: string;
}

export interface JournalSlotInspection {
  readonly slot: JournalSlotId;
  readonly valid: boolean;
  readonly sequenceNumber: number | null;
  readonly savedAtMs: number | null;
  readonly payloadChecksumHex: string | null;
  readonly failureReason: string | null;
}

export interface SessionRestoreResult<TState> {
  readonly restored: boolean;
  readonly state: TState | null;
  readonly restoredSlot: JournalSlotId | null;
  readonly sequenceNumber: number | null;
  readonly savedAtMs: number | null;
  readonly recoveredFromFallback: boolean;
  readonly corruptedSlots: readonly JournalSlotId[];
  readonly slotInspections: readonly JournalSlotInspection[];
  readonly restoreDurationMs: number;
}

const JOURNAL_MAGIC = 0x54534a31; // "TSJ1"
const JOURNAL_SENTINEL = 0x454e4421; // "END!"
const JOURNAL_VERSION = 1;
const JOURNAL_HEADER_BYTES = 32;
const JOURNAL_TRAILER_BYTES = 4;

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function computeFnv1a32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let hash = 0x811c9dc5;
  for (let i = start; i < end; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** A/B 원자적 이중 저널 바이너리 스냅샷과 FNV-1a 검증으로 50ms 미만 즉시 복구를 수행한다. */
export class DualJournalSessionRestorer<TState> {
  private readonly storage: DualJournalStorageAdapter;
  private lastWrittenSlot: JournalSlotId | null = null;
  private nextSequenceNumber = 1;

  constructor(storage?: DualJournalStorageAdapter) {
    this.storage = storage ?? new InMemoryDualJournalStorage();
    const bootA = this.decodeFrame("A", this.storage.readSlot("A"));
    const bootB = this.decodeFrame("B", this.storage.readSlot("B"));
    const validFrames = [bootA, bootB].filter((f) => f.valid && f.sequenceNumber !== null);
    if (validFrames.length > 0) {
      validFrames.sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0));
      this.lastWrittenSlot = validFrames[0].slot;
      this.nextSequenceNumber = (validFrames[0].sequenceNumber ?? 0) + 1;
    }
  }

  public commitSnapshot(state: TState, savedAtMs = Date.now()): JournalCommitReceipt {
    const targetSlot: JournalSlotId = this.lastWrittenSlot === "A" ? "B" : "A";
    const sequenceNumber = this.nextSequenceNumber;
    const payloadBytes = UTF8_ENCODER.encode(JSON.stringify(state));
    const frame = new Uint8Array(JOURNAL_HEADER_BYTES + payloadBytes.length + JOURNAL_TRAILER_BYTES);
    const view = new DataView(frame.buffer);

    view.setUint32(0, JOURNAL_MAGIC, false);
    view.setUint16(4, JOURNAL_VERSION, true);
    view.setUint16(6, targetSlot === "B" ? 1 : 0, true);
    view.setUint32(8, sequenceNumber, true);
    view.setFloat64(12, savedAtMs, true);
    view.setUint32(20, payloadBytes.length, true);
    view.setUint32(24, computeFnv1a32(frame, 0, 24), true);

    const payloadChecksum = computeFnv1a32(payloadBytes);
    view.setUint32(28, payloadChecksum, true);
    frame.set(payloadBytes, JOURNAL_HEADER_BYTES);
    view.setUint32(JOURNAL_HEADER_BYTES + payloadBytes.length, JOURNAL_SENTINEL, false);

    this.storage.writeSlot(targetSlot, frame);
    this.lastWrittenSlot = targetSlot;
    this.nextSequenceNumber += 1;

    return {
      slot: targetSlot,
      sequenceNumber,
      savedAtMs,
      totalBytes: frame.length,
      payloadChecksumHex: payloadChecksum.toString(16).padStart(8, "0"),
    };
  }

  public restoreLatestValidSnapshot(): SessionRestoreResult<TState> {
    const start = nowMs();
    const frameA = this.decodeFrame("A", this.storage.readSlot("A"));
    const frameB = this.decodeFrame("B", this.storage.readSlot("B"));
    const inspections: JournalSlotInspection[] = [frameA.inspection, frameB.inspection];
    const corruptedSlots: JournalSlotId[] = [];
    if (!frameA.valid && frameA.inspection.failureReason !== "empty-slot") corruptedSlots.push("A");
    if (!frameB.valid && frameB.inspection.failureReason !== "empty-slot") corruptedSlots.push("B");

    const candidates = [frameA, frameB].filter((item) => item.valid && item.state !== null);
    if (candidates.length === 0) {
      return {
        restored: false,
        state: null,
        restoredSlot: null,
        sequenceNumber: null,
        savedAtMs: null,
        recoveredFromFallback: false,
        corruptedSlots,
        slotInspections: inspections,
        restoreDurationMs: round3(Math.max(0, nowMs() - start)),
      };
    }

    candidates.sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0));
    const winner = candidates[0];
    this.lastWrittenSlot = winner.slot;
    this.nextSequenceNumber = (winner.sequenceNumber ?? 0) + 1;

    return {
      restored: true,
      state: winner.state,
      restoredSlot: winner.slot,
      sequenceNumber: winner.sequenceNumber,
      savedAtMs: winner.savedAtMs,
      recoveredFromFallback: corruptedSlots.length > 0,
      corruptedSlots,
      slotInspections: inspections,
      restoreDurationMs: round3(Math.max(0, nowMs() - start)),
    };
  }

  private decodeFrame(
    slot: JournalSlotId,
    raw: Uint8Array | null,
  ): {
    readonly slot: JournalSlotId;
    readonly valid: boolean;
    readonly state: TState | null;
    readonly sequenceNumber: number | null;
    readonly savedAtMs: number | null;
    readonly inspection: JournalSlotInspection;
  } {
    const fail = (reason: string): {
      readonly slot: JournalSlotId;
      readonly valid: false;
      readonly state: null;
      readonly sequenceNumber: null;
      readonly savedAtMs: null;
      readonly inspection: JournalSlotInspection;
    } => ({
      slot,
      valid: false,
      state: null,
      sequenceNumber: null,
      savedAtMs: null,
      inspection: { slot, valid: false, sequenceNumber: null, savedAtMs: null, payloadChecksumHex: null, failureReason: reason },
    });

    if (!raw || raw.length === 0) return fail("empty-slot");
    if (raw.length < JOURNAL_HEADER_BYTES + JOURNAL_TRAILER_BYTES) return fail("truncated-frame");

    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    if (view.getUint32(0, false) !== JOURNAL_MAGIC) return fail("invalid-magic");
    if (view.getUint16(4, true) !== JOURNAL_VERSION) return fail("unsupported-version");

    const sequenceNumber = view.getUint32(8, true);
    const savedAtMs = view.getFloat64(12, true);
    const payloadLength = view.getUint32(20, true);
    const storedHeaderHash = view.getUint32(24, true);
    const storedPayloadHash = view.getUint32(28, true);

    if (raw.length !== JOURNAL_HEADER_BYTES + payloadLength + JOURNAL_TRAILER_BYTES) return fail("payload-length-mismatch");
    if (computeFnv1a32(raw, 0, 24) !== storedHeaderHash) return fail("header-checksum-mismatch");

    const trailerOffset = JOURNAL_HEADER_BYTES + payloadLength;
    if (view.getUint32(trailerOffset, false) !== JOURNAL_SENTINEL) return fail("missing-commit-sentinel");

    const payloadBytes = raw.subarray(JOURNAL_HEADER_BYTES, trailerOffset);
    const computedPayloadHash = computeFnv1a32(payloadBytes);
    if (computedPayloadHash !== storedPayloadHash) return fail("payload-checksum-mismatch");

    try {
      const parsed = JSON.parse(UTF8_DECODER.decode(payloadBytes)) as TState;
      return {
        slot,
        valid: true,
        state: parsed,
        sequenceNumber,
        savedAtMs,
        inspection: {
          slot,
          valid: true,
          sequenceNumber,
          savedAtMs,
          payloadChecksumHex: computedPayloadHash.toString(16).padStart(8, "0"),
          failureReason: null,
        },
      };
    } catch {
      return fail("json-parse-failed");
    }
  }
}
