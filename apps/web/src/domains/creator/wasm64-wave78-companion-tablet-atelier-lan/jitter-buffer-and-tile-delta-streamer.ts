/**
 * Wave 78 — 8ms 미만 적응형 펜 지터 버퍼·운동학 예측기 및
 * 호스트→태블릿 시선 중심(Foveated) 더티 타일 델타 스트리머.
 *
 * - 순서 뒤바뀜 재정렬, 중복 제거, 유실 구간 Catmull-Rom 큐빅 에르미트 속도 연속 보간,
 *   급격한 코너·`prefersReducedMotion`에서 `0ms`로 억제되는 `<= 8ms` 경계 전방 예측기
 * - 8K 데스크톱 GPU 캔버스에서 태블릿 뷰포트 절두체 안의 변경 `256×256` 타일만 선별해
 *   펜 커서 근접도 순으로 정렬하고, 결정론적 RGBA PackBits RLE/XOR 델타 압축으로 무손실 복원
 */

import { computeCrc32, type LanTransportHint, type PenSample } from "./lan-pairing-and-binary-pen-wire";

export const MAX_PREDICTION_LEAD_MS = 8;
export const SUB_8MS_LATENCY_BUDGET_MS = 8;
export const DEFAULT_TILE_SIZE_PX = 256;

export type CompanionTransportMode = "lan-direct" | "usb-tether-loopback" | "degraded-fallback";
export type BufferedSampleOrigin = "received" | "interpolated" | "predicted";

export interface EmittedPenSample extends PenSample {
  readonly origin: BufferedSampleOrigin;
}

export interface CompanionPenJitterBufferOptions {
  readonly maxReorderWindowSize?: number;
  readonly reorderGapReleaseAheadCount?: number;
  readonly maxGapFillCount?: number;
  readonly maxPredictionLeadMs?: number;
  readonly cornerCurvatureThresholdRad?: number;
  readonly prefersReducedMotion?: boolean;
  readonly transportHint?: LanTransportHint;
  readonly targetLatencyMs?: number;
}

export interface JitterBufferPushResult {
  readonly accepted: boolean;
  readonly status: "emitted" | "buffered-out-of-order" | "duplicate" | "late-drop";
  readonly emitted: readonly EmittedPenSample[];
  readonly interpolatedCount: number;
  readonly pendingReorderCount: number;
}

export type PredictionSuppressionReason =
  | "none"
  | "reduced-motion"
  | "sharp-corner"
  | "pen-lifted"
  | "insufficient-history";

export interface KinematicPredictionResult {
  readonly sample: EmittedPenSample | null;
  readonly appliedLeadMs: number;
  readonly cornerAngleRad: number;
  readonly suppressionReason: PredictionSuppressionReason;
}

export interface CompanionLinkTelemetry {
  readonly rttMs: number;
  readonly oneWayEstMs: number;
  readonly jitterMs: number;
  readonly droppedPacketRatio: number;
  readonly withinSub8msBudget: boolean;
  readonly activeTransportMode: CompanionTransportMode;
  readonly receivedPackets: number;
  readonly reorderedPackets: number;
  readonly duplicatePackets: number;
  readonly droppedPackets: number;
  readonly interpolatedSamples: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function catmullRomHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const chord = p2 - p1;
  const maxTangent = Math.max(Math.abs(chord) * 1.5, 1e-6);
  const m0 = clampRange(0.5 * (p2 - p0), -maxTangent, maxTangent);
  const m1 = clampRange(0.5 * (p3 - p1), -maxTangent, maxTangent);
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m1;
}

function interpolateAngleShortest(a: number, b: number, t: number): number {
  const twoPi = Math.PI * 2;
  let diff = (b - a) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  const out = (a + diff * t) % twoPi;
  return out < 0 ? out + twoPi : out;
}

/** 240Hz~480Hz 펜 스트림의 순서 복원·중복 제거·에르미트 보간·경계 전방 예측 지터 버퍼. */
export class CompanionPenJitterBuffer {
  private readonly maxReorderWindowSize: number;
  private readonly reorderGapReleaseAheadCount: number;
  private readonly maxGapFillCount: number;
  private readonly maxPredictionLeadMs: number;
  private readonly cornerCurvatureThresholdRad: number;
  private prefersReducedMotion: boolean;
  private readonly transportHint: LanTransportHint;
  private readonly targetLatencyMs: number;

  private readonly pendingBySeq = new Map<number, PenSample>();
  private readonly history: EmittedPenSample[] = [];
  private nextExpectedSeq: number | null = null;
  private highestSeenSeq = -1;

  private rttMs = 2.4;
  private jitterMs = 0.35;
  private lastArrivalMs: number | null = null;
  private lastTransitDeltaMs: number | null = null;
  private lastSampleTimestampUs: number | null = null;

  private receivedPackets = 0;
  private reorderedPackets = 0;
  private duplicatePackets = 0;
  private droppedPackets = 0;
  private interpolatedSamples = 0;

  public constructor(options: CompanionPenJitterBufferOptions = {}) {
    this.maxReorderWindowSize = Math.max(4, Math.min(256, options.maxReorderWindowSize ?? 32));
    this.reorderGapReleaseAheadCount = Math.max(1, Math.min(16, options.reorderGapReleaseAheadCount ?? 3));
    this.maxGapFillCount = Math.max(1, Math.min(16, options.maxGapFillCount ?? 6));
    this.maxPredictionLeadMs = clampRange(options.maxPredictionLeadMs ?? MAX_PREDICTION_LEAD_MS, 0, MAX_PREDICTION_LEAD_MS);
    this.cornerCurvatureThresholdRad = clampRange(options.cornerCurvatureThresholdRad ?? 0.45, 0.05, Math.PI);
    this.prefersReducedMotion = options.prefersReducedMotion ?? false;
    this.transportHint = options.transportHint ?? "lan-direct";
    this.targetLatencyMs = clampRange(options.targetLatencyMs ?? SUB_8MS_LATENCY_BUDGET_MS, 1, 20);
  }

  public setPrefersReducedMotion(enabled: boolean): void {
    this.prefersReducedMotion = enabled;
  }

  /** LAN 왕복 지연(RTT) 실측치를 EWMA 필터로 반영한다. */
  public recordRttSample(measuredRttMs: number): void {
    if (!Number.isFinite(measuredRttMs) || measuredRttMs < 0) return;
    this.rttMs = this.rttMs * 0.7 + measuredRttMs * 0.3;
  }

  private updateInterArrivalJitter(sampleTimestampUs: number, receivedAtMs?: number): void {
    if (receivedAtMs === undefined || !Number.isFinite(receivedAtMs)) return;
    if (this.lastArrivalMs !== null && this.lastSampleTimestampUs !== null) {
      const transitDiff = Math.abs(receivedAtMs - this.lastArrivalMs - (sampleTimestampUs - this.lastSampleTimestampUs) / 1000);
      this.jitterMs = this.lastTransitDeltaMs !== null ? this.jitterMs + (transitDiff - this.jitterMs) / 16 : transitDiff;
      this.lastTransitDeltaMs = transitDiff;
    }
    this.lastArrivalMs = receivedAtMs;
    this.lastSampleTimestampUs = sampleTimestampUs;
  }

  private recordEmitted(sample: EmittedPenSample): void {
    this.history.push(sample);
    if (this.history.length > 8) this.history.shift();
  }

  /** 펜 패킷을 투입해 순서 복원·중복 제거·결손 보간 결과를 반환한다. */
  public pushSample(sample: PenSample, receivedAtMs?: number): JitterBufferPushResult {
    this.updateInterArrivalJitter(sample.timestampUs, receivedAtMs);
    if (this.nextExpectedSeq === null) {
      this.receivedPackets += 1;
      this.highestSeenSeq = sample.sequence;
      this.nextExpectedSeq = sample.sequence + 1;
      const emitted: EmittedPenSample = { ...sample, origin: "received" };
      this.recordEmitted(emitted);
      return { accepted: true, status: "emitted", emitted: [emitted], interpolatedCount: 0, pendingReorderCount: 0 };
    }
    if (sample.sequence < this.nextExpectedSeq) {
      this.duplicatePackets += 1;
      return { accepted: false, status: "late-drop", emitted: [], interpolatedCount: 0, pendingReorderCount: this.pendingBySeq.size };
    }
    if (this.pendingBySeq.has(sample.sequence)) {
      this.duplicatePackets += 1;
      return { accepted: false, status: "duplicate", emitted: [], interpolatedCount: 0, pendingReorderCount: this.pendingBySeq.size };
    }

    this.receivedPackets += 1;
    if (sample.sequence < this.highestSeenSeq) this.reorderedPackets += 1;
    else this.highestSeenSeq = sample.sequence;
    this.pendingBySeq.set(sample.sequence, sample);

    const emitted: EmittedPenSample[] = [];
    let interpolatedCount = 0;
    while (this.pendingBySeq.size > this.maxReorderWindowSize) {
      const overflow = this.releaseNextGapAndContiguous();
      if (overflow.emitted.length === 0) break;
      for (const item of overflow.emitted) emitted.push(item);
      interpolatedCount += overflow.interpolatedCount;
    }
    this.drainContiguous(emitted);
    while (this.pendingBySeq.size >= this.reorderGapReleaseAheadCount) {
      const gapDrain = this.releaseNextGapAndContiguous();
      if (gapDrain.emitted.length === 0) break;
      for (const item of gapDrain.emitted) emitted.push(item);
      interpolatedCount += gapDrain.interpolatedCount;
    }

    return {
      accepted: true,
      status: emitted.length > 0 ? "emitted" : "buffered-out-of-order",
      emitted,
      interpolatedCount,
      pendingReorderCount: this.pendingBySeq.size,
    };
  }

  /** 대기 중인 재정렬 버퍼를 강제 플러시해 결손 구간을 보간하고 방출한다. */
  public flushPendingWithGapInterpolation(): { readonly emitted: readonly EmittedPenSample[]; readonly interpolatedCount: number } {
    const emitted: EmittedPenSample[] = [];
    let interpolatedCount = 0;
    this.drainContiguous(emitted);
    while (this.pendingBySeq.size > 0) {
      const step = this.releaseNextGapAndContiguous();
      if (step.emitted.length === 0) break;
      for (const item of step.emitted) emitted.push(item);
      interpolatedCount += step.interpolatedCount;
    }
    return { emitted, interpolatedCount };
  }

  private drainContiguous(out: EmittedPenSample[]): void {
    while (this.nextExpectedSeq !== null && this.pendingBySeq.has(this.nextExpectedSeq)) {
      const seq = this.nextExpectedSeq;
      const next = this.pendingBySeq.get(seq);
      this.pendingBySeq.delete(seq);
      if (next) {
        const emitted: EmittedPenSample = { ...next, origin: "received" };
        this.recordEmitted(emitted);
        out.push(emitted);
      }
      this.nextExpectedSeq = seq + 1;
    }
  }

  private findSmallestPendingSeq(): number | null {
    let minSeq: number | null = null;
    this.pendingBySeq.forEach((_sample, seq) => {
      if (minSeq === null || seq < minSeq) minSeq = seq;
    });
    return minSeq;
  }

  private releaseNextGapAndContiguous(): { readonly emitted: EmittedPenSample[]; readonly interpolatedCount: number } {
    const out: EmittedPenSample[] = [];
    let interpolatedCount = 0;
    if (this.nextExpectedSeq === null) return { emitted: out, interpolatedCount };
    const nextAvailableSeq = this.findSmallestPendingSeq();
    if (nextAvailableSeq === null) return { emitted: out, interpolatedCount };

    const gapCount = nextAvailableSeq - this.nextExpectedSeq;
    const nextSample = this.pendingBySeq.get(nextAvailableSeq);
    if (gapCount > 0 && nextSample) {
      this.droppedPackets += gapCount;
      const prev1 = this.history.length >= 1 ? this.history[this.history.length - 1] : undefined;
      const prev0 = this.history.length >= 2 ? this.history[this.history.length - 2] : prev1;
      const nextAfter = this.pendingBySeq.get(nextAvailableSeq + 1) ?? nextSample;
      if (prev1 && prev0 && gapCount <= this.maxGapFillCount) {
        for (let step = 1; step <= gapCount; step += 1) {
          const t = step / (gapCount + 1);
          const synthesized = this.synthesizeHermiteSample(this.nextExpectedSeq + step - 1, prev0, prev1, nextSample, nextAfter, t);
          this.recordEmitted(synthesized);
          out.push(synthesized);
          this.interpolatedSamples += 1;
          interpolatedCount += 1;
        }
      }
      this.nextExpectedSeq = nextAvailableSeq;
    }
    this.drainContiguous(out);
    return { emitted: out, interpolatedCount };
  }

  private synthesizeHermiteSample(sequence: number, p0: PenSample, p1: PenSample, p2: PenSample, p3: PenSample, t: number): EmittedPenSample {
    return {
      sequence,
      timestampUs: Math.round(p1.timestampUs + (p2.timestampUs - p1.timestampUs) * t),
      xNorm: clampUnit(catmullRomHermite(p0.xNorm, p1.xNorm, p2.xNorm, p3.xNorm, t)),
      yNorm: clampUnit(catmullRomHermite(p0.yNorm, p1.yNorm, p2.yNorm, p3.yNorm, t)),
      pressure: clampUnit(catmullRomHermite(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t)),
      altitudeRad: clampRange(p1.altitudeRad + (p2.altitudeRad - p1.altitudeRad) * t, -Math.PI / 2, Math.PI / 2),
      azimuthRad: interpolateAngleShortest(p1.azimuthRad, p2.azimuthRad, t),
      barrelRoll: clampRange(p1.barrelRoll + (p2.barrelRoll - p1.barrelRoll) * t, -Math.PI, Math.PI),
      hoverHeight: clampUnit(p1.hoverHeight + (p2.hoverHeight - p1.hoverHeight) * t),
      flags: { ...p1.flags, predicted: false },
      origin: "interpolated",
    };
  }

  /**
   * 최근 궤적의 속도와 감쇠 가속도로 `<= 8ms` 전방 펜 위치를 예측한다.
   * `prefersReducedMotion`이거나 급격한 코너에서는 오버슈트 방지를 위해 `0ms`로 억제한다.
   */
  public predictNextSample(requestedLeadMs: number): KinematicPredictionResult {
    const latest = this.history.length >= 1 ? this.history[this.history.length - 1] : undefined;
    if (!latest) return { sample: null, appliedLeadMs: 0, cornerAngleRad: 0, suppressionReason: "insufficient-history" };
    if (!latest.flags.penDown) return { sample: { ...latest, origin: "predicted" }, appliedLeadMs: 0, cornerAngleRad: 0, suppressionReason: "pen-lifted" };
    if (this.prefersReducedMotion) {
      return { sample: { ...latest, flags: { ...latest.flags, predicted: false }, origin: "predicted" }, appliedLeadMs: 0, cornerAngleRad: 0, suppressionReason: "reduced-motion" };
    }
    const prev = this.history.length >= 2 ? this.history[this.history.length - 2] : undefined;
    if (!prev) return { sample: { ...latest, origin: "predicted" }, appliedLeadMs: 0, cornerAngleRad: 0, suppressionReason: "insufficient-history" };

    const dtCurrMs = Math.max(0.25, (latest.timestampUs - prev.timestampUs) / 1000);
    const vxCurr = (latest.xNorm - prev.xNorm) / dtCurrMs;
    const vyCurr = (latest.yNorm - prev.yNorm) / dtCurrMs;
    let cornerAngleRad = 0;
    let ax = 0;
    let ay = 0;

    const prev2 = this.history.length >= 3 ? this.history[this.history.length - 3] : undefined;
    if (prev2) {
      const dtPrevMs = Math.max(0.25, (prev.timestampUs - prev2.timestampUs) / 1000);
      const vxPrev = (prev.xNorm - prev2.xNorm) / dtPrevMs;
      const vyPrev = (prev.yNorm - prev2.yNorm) / dtPrevMs;
      const magPrev = Math.hypot(vxPrev, vyPrev);
      const magCurr = Math.hypot(vxCurr, vyCurr);
      if (magPrev > 1e-6 && magCurr > 1e-6) {
        cornerAngleRad = Math.acos(clampRange((vxPrev * vxCurr + vyPrev * vyCurr) / (magPrev * magCurr), -1, 1));
      }
      const avgDt = 0.5 * (dtPrevMs + dtCurrMs);
      ax = (vxCurr - vxPrev) / avgDt;
      ay = (vyCurr - vyPrev) / avgDt;
    }

    if (cornerAngleRad > this.cornerCurvatureThresholdRad) {
      return { sample: { ...latest, flags: { ...latest.flags, predicted: false }, origin: "predicted" }, appliedLeadMs: 0, cornerAngleRad, suppressionReason: "sharp-corner" };
    }

    const appliedLeadMs = clampRange(requestedLeadMs, 0, Math.min(MAX_PREDICTION_LEAD_MS, this.maxPredictionLeadMs));
    const predX = clampUnit(latest.xNorm + vxCurr * appliedLeadMs + 0.175 * ax * appliedLeadMs * appliedLeadMs);
    const predY = clampUnit(latest.yNorm + vyCurr * appliedLeadMs + 0.175 * ay * appliedLeadMs * appliedLeadMs);
    const predPressure = clampUnit(latest.pressure + ((latest.pressure - prev.pressure) / dtCurrMs) * appliedLeadMs * 0.5);

    return {
      sample: {
        ...latest,
        timestampUs: latest.timestampUs + Math.round(appliedLeadMs * 1000),
        xNorm: predX,
        yNorm: predY,
        pressure: predPressure,
        flags: { ...latest.flags, predicted: appliedLeadMs > 0 },
        origin: "predicted",
      },
      appliedLeadMs,
      cornerAngleRad,
      suppressionReason: "none",
    };
  }

  /** 실시간 LAN 지연·지터·손실률·전송 모드 텔레메트리를 반환한다. */
  public getTelemetry(): CompanionLinkTelemetry {
    const oneWayEstMs = this.rttMs / 2;
    const droppedPacketRatio = this.droppedPackets / Math.max(1, this.receivedPackets + this.droppedPackets);
    const withinSub8msBudget = oneWayEstMs + this.jitterMs <= this.targetLatencyMs && droppedPacketRatio <= 0.05;
    const activeTransportMode: CompanionTransportMode =
      !withinSub8msBudget || droppedPacketRatio >= 0.1
        ? "degraded-fallback"
        : this.transportHint === "usb-tether-loopback"
          ? "usb-tether-loopback"
          : "lan-direct";

    return {
      rttMs: this.rttMs,
      oneWayEstMs,
      jitterMs: this.jitterMs,
      droppedPacketRatio,
      withinSub8msBudget,
      activeTransportMode,
      receivedPackets: this.receivedPackets,
      reorderedPackets: this.reorderedPackets,
      duplicatePackets: this.duplicatePackets,
      droppedPackets: this.droppedPackets,
      interpolatedSamples: this.interpolatedSamples,
    };
  }
}

export interface TabletViewportFrustum {
  readonly viewportX: number;
  readonly viewportY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly zoom: number;
  readonly cursorCanvasX: number;
  readonly cursorCanvasY: number;
}

export interface HostDirtyTileInput {
  readonly tileX: number;
  readonly tileY: number;
  readonly revision: number;
  readonly baseRevision: number | null;
  readonly currentRgba: Uint8Array;
  readonly previousRgba?: Uint8Array;
}

export type TileDeltaEncodingMode = "rle-raw" | "rle-xor-delta";

export interface CompanionEncodedTileDelta {
  readonly tileKey: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly revision: number;
  readonly baseRevision: number | null;
  readonly encodingMode: TileDeltaEncodingMode;
  readonly cursorDistancePx: number;
  readonly encodedPayload: Uint8Array;
  readonly rawByteLength: number;
  readonly payloadCrc32: number;
}

export interface PlanCompanionTileDeltaRequest {
  readonly frameId: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSize?: number;
  readonly viewport: TabletViewportFrustum;
  readonly dirtyTiles: readonly HostDirtyTileInput[];
  readonly maxBytesPerFrame: number;
  readonly targetLatencyMs?: number;
  readonly linkBandwidthMbps?: number;
}

export interface CompanionTileDeltaFrame {
  readonly frameId: number;
  readonly tileSize: number;
  readonly streamedTiles: readonly CompanionEncodedTileDelta[];
  readonly deferredTileKeys: readonly string[];
  readonly culledOutsideFrustumCount: number;
  readonly totalEncodedBytes: number;
  readonly totalRawBytes: number;
  readonly compressionRatio: number;
  readonly estimatedTransferMs: number;
  readonly withinSub8msBudget: boolean;
}

export interface ApplyCompanionTileDeltaResult {
  readonly ok: boolean;
  readonly appliedTileKeys: readonly string[];
  readonly rejectedTileKeys: readonly string[];
  readonly rejectionReasons: readonly string[];
}

export interface TabletTileBufferEntry {
  readonly revision: number;
  readonly rgba: Uint8Array;
}

export function formatTileKey(tileX: number, tileY: number): string {
  return `${tileX}:${tileY}`;
}

function pixelsEqualAt(buf: Uint8Array, pixelA: number, pixelB: number): boolean {
  const oa = pixelA * 4;
  const ob = pixelB * 4;
  return buf[oa] === buf[ob] && buf[oa + 1] === buf[ob + 1] && buf[oa + 2] === buf[ob + 2] && buf[oa + 3] === buf[ob + 3];
}

/** 4바이트 RGBA 픽셀 단위 결정론적 PackBits RLE 압축. */
export function compressRgbaPackBits(rgba: Uint8Array): Uint8Array {
  if (rgba.byteLength % 4 !== 0) throw new RangeError("RGBA 버퍼 길이는 4의 배수여야 합니다.");
  const pixelCount = rgba.byteLength / 4;
  const out: number[] = [];
  let i = 0;
  while (i < pixelCount) {
    let runLen = 1;
    while (i + runLen < pixelCount && runLen < 128 && pixelsEqualAt(rgba, i, i + runLen)) runLen += 1;
    if (runLen >= 2) {
      const off = i * 4;
      out.push(0x80 | (runLen - 1), rgba[off] ?? 0, rgba[off + 1] ?? 0, rgba[off + 2] ?? 0, rgba[off + 3] ?? 0);
      i += runLen;
    } else {
      const literalStart = i;
      let litLen = 1;
      i += 1;
      while (i < pixelCount && litLen < 128 && !(i + 1 < pixelCount && pixelsEqualAt(rgba, i, i + 1))) {
        litLen += 1;
        i += 1;
      }
      out.push(litLen - 1);
      for (let b = literalStart * 4; b < (literalStart + litLen) * 4; b += 1) out.push(rgba[b] ?? 0);
    }
  }
  return new Uint8Array(out);
}

/** PackBits RGBA RLE 압축 버퍼를 정확한 픽셀 바이트로 복원한다. */
export function decompressRgbaPackBits(encoded: Uint8Array, expectedByteLength: number): Uint8Array | null {
  if (expectedByteLength % 4 !== 0) return null;
  const out = new Uint8Array(expectedByteLength);
  let src = 0;
  let dst = 0;
  while (src < encoded.byteLength && dst < expectedByteLength) {
    const header = encoded[src++] ?? 0;
    if ((header & 0x80) !== 0) {
      const count = (header & 0x7f) + 1;
      if (src + 4 > encoded.byteLength || dst + count * 4 > expectedByteLength) return null;
      const r = encoded[src] ?? 0; const g = encoded[src + 1] ?? 0;
      const b = encoded[src + 2] ?? 0; const a = encoded[src + 3] ?? 0;
      src += 4;
      for (let k = 0; k < count; k += 1) {
        out[dst++] = r; out[dst++] = g; out[dst++] = b; out[dst++] = a;
      }
    } else {
      const byteLen = (header + 1) * 4;
      if (src + byteLen > encoded.byteLength || dst + byteLen > expectedByteLength) return null;
      out.set(encoded.subarray(src, src + byteLen), dst);
      src += byteLen;
      dst += byteLen;
    }
  }
  return src === encoded.byteLength && dst === expectedByteLength ? out : null;
}

function xorRgbaBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength);
  for (let i = 0; i < a.byteLength; i += 1) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

function tileIntersectsFrustum(tileX: number, tileY: number, tileSize: number, viewport: TabletViewportFrustum): boolean {
  const x0 = tileX * tileSize;
  const y0 = tileY * tileSize;
  const zoom = Math.max(0.05, viewport.zoom);
  const vx1 = viewport.viewportX + viewport.viewportWidth / zoom;
  const vy1 = viewport.viewportY + viewport.viewportHeight / zoom;
  return x0 + tileSize > viewport.viewportX && x0 < vx1 && y0 + tileSize > viewport.viewportY && y0 < vy1;
}

/** 8K 캔버스에서 태블릿 절두체 안의 더티 타일을 커서 근접도 순 + 프레임 바이트 예산으로 패킹한다. */
export function planCompanionTileDeltaFrame(request: PlanCompanionTileDeltaRequest): CompanionTileDeltaFrame {
  const tileSize = Math.max(16, Math.min(512, request.tileSize ?? DEFAULT_TILE_SIZE_PX));
  const expectedTileBytes = tileSize * tileSize * 4;
  const targetLatencyMs = clampRange(request.targetLatencyMs ?? SUB_8MS_LATENCY_BUDGET_MS, 1, 33);
  const linkBandwidthMbps = Math.max(10, request.linkBandwidthMbps ?? 600);
  const bandwidthBudgetBytes = Math.floor(((linkBandwidthMbps * 1_000_000) / 8) * (targetLatencyMs / 1000));
  const effectiveByteBudget = Math.max(1, Math.min(request.maxBytesPerFrame, bandwidthBudgetBytes));

  let culledOutsideFrustumCount = 0;
  const visible: Array<{ readonly tile: HostDirtyTileInput; readonly distancePx: number }> = [];

  for (const tile of request.dirtyTiles) {
    if (tile.tileX < 0 || tile.tileY < 0 || tile.tileX * tileSize >= request.canvasWidth || tile.tileY * tileSize >= request.canvasHeight) continue;
    if (tile.currentRgba.byteLength !== expectedTileBytes) {
      throw new RangeError(`타일 RGBA 크기(${tile.currentRgba.byteLength})가 ${expectedTileBytes}바이트와 다릅니다.`);
    }
    if (!tileIntersectsFrustum(tile.tileX, tile.tileY, tileSize, request.viewport)) {
      culledOutsideFrustumCount += 1;
      continue;
    }
    const distancePx = Math.hypot((tile.tileX + 0.5) * tileSize - request.viewport.cursorCanvasX, (tile.tileY + 0.5) * tileSize - request.viewport.cursorCanvasY);
    visible.push({ tile, distancePx });
  }

  visible.sort((a, b) => {
    if (Math.abs(a.distancePx - b.distancePx) > 1e-6) return a.distancePx - b.distancePx;
    return a.tile.tileY !== b.tile.tileY ? a.tile.tileY - b.tile.tileY : a.tile.tileX - b.tile.tileX;
  });

  const streamedTiles: CompanionEncodedTileDelta[] = [];
  const deferredTileKeys: string[] = [];
  let totalEncodedBytes = 0;
  let totalRawBytes = 0;

  for (const { tile, distancePx } of visible) {
    const tileKey = formatTileKey(tile.tileX, tile.tileY);
    const rawEncoded = compressRgbaPackBits(tile.currentRgba);
    let encodingMode: TileDeltaEncodingMode = "rle-raw";
    let bestPayload = rawEncoded;
    let baseRevision: number | null = null;

    if (tile.previousRgba && tile.previousRgba.byteLength === expectedTileBytes && tile.baseRevision !== null) {
      const xorEncoded = compressRgbaPackBits(xorRgbaBuffers(tile.currentRgba, tile.previousRgba));
      if (xorEncoded.byteLength <= rawEncoded.byteLength) {
        encodingMode = "rle-xor-delta";
        bestPayload = xorEncoded;
        baseRevision = tile.baseRevision;
      }
    }

    const projectedBytes = totalEncodedBytes + bestPayload.byteLength + 24;
    if (projectedBytes > effectiveByteBudget) {
      deferredTileKeys.push(tileKey);
      continue;
    }

    totalEncodedBytes = projectedBytes;
    totalRawBytes += expectedTileBytes;
    streamedTiles.push({
      tileKey,
      tileX: tile.tileX,
      tileY: tile.tileY,
      revision: tile.revision,
      baseRevision,
      encodingMode,
      cursorDistancePx: distancePx,
      encodedPayload: bestPayload,
      rawByteLength: expectedTileBytes,
      payloadCrc32: computeCrc32(bestPayload),
    });
  }

  const estimatedTransferMs = (totalEncodedBytes * 8) / (linkBandwidthMbps * 1000);
  return {
    frameId: request.frameId,
    tileSize,
    streamedTiles,
    deferredTileKeys,
    culledOutsideFrustumCount,
    totalEncodedBytes,
    totalRawBytes,
    compressionRatio: totalEncodedBytes > 0 ? totalRawBytes / totalEncodedBytes : 1,
    estimatedTransferMs,
    withinSub8msBudget: estimatedTransferMs <= targetLatencyMs,
  };
}

/** 태블릿 측 타일 캐시에 호스트 델타 프레임을 CRC-32 검증 후 무손실 복원한다. */
export function applyCompanionTileDeltaFrame(
  tabletTiles: Map<string, TabletTileBufferEntry>,
  frame: CompanionTileDeltaFrame,
): ApplyCompanionTileDeltaResult {
  const expectedTileBytes = frame.tileSize * frame.tileSize * 4;
  const appliedTileKeys: string[] = [];
  const rejectedTileKeys: string[] = [];
  const rejectionReasons: string[] = [];

  for (const delta of frame.streamedTiles) {
    if (computeCrc32(delta.encodedPayload) !== delta.payloadCrc32) {
      rejectedTileKeys.push(delta.tileKey);
      rejectionReasons.push(`${delta.tileKey}: 타일 델타 CRC-32 불일치`);
      continue;
    }
    const decoded = decompressRgbaPackBits(delta.encodedPayload, expectedTileBytes);
    if (!decoded) {
      rejectedTileKeys.push(delta.tileKey);
      rejectionReasons.push(`${delta.tileKey}: RLE 압축 해제 실패`);
      continue;
    }
    if (delta.encodingMode === "rle-raw") {
      tabletTiles.set(delta.tileKey, { revision: delta.revision, rgba: decoded });
      appliedTileKeys.push(delta.tileKey);
      continue;
    }
    const existing = tabletTiles.get(delta.tileKey);
    if (!existing || delta.baseRevision === null || existing.revision !== delta.baseRevision) {
      rejectedTileKeys.push(delta.tileKey);
      rejectionReasons.push(`${delta.tileKey}: XOR 델타 기준 리비전 불일치`);
      continue;
    }
    tabletTiles.set(delta.tileKey, { revision: delta.revision, rgba: xorRgbaBuffers(existing.rgba, decoded) });
    appliedTileKeys.push(delta.tileKey);
  }

  return { ok: rejectedTileKeys.length === 0, appliedTileKeys, rejectedTileKeys, rejectionReasons };
}
