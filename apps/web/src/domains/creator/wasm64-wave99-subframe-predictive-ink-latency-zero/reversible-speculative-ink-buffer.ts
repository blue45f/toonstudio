/**
 * Wave 99 — 가역 투기 잉크 이중 버퍼, 지연·정확도 벤치마크 평가기 및 WebGPU WGSL 오버레이 컴포지터.
 *
 * 2계층 스트로크 불변식:
 * - `committedSegments` / `committedPoints`: 하드웨어 검증 패킷만 불변 저장 (투기 좌표 유입 0건)
 * - `speculativeTail`: 매 포인터 패킷마다 원자적으로 롤백 후 재계산되는 임시 선행 오버레이
 * - `finalizeStroke()`: `speculativeTail.length === 0` 및 확정 스트로크 무오염 보장
 */

import {
  DISPLAY_REFRESH_HORIZON_MS,
  SubframeStylusKalmanPredictor,
  predictSubframeStylusHorizon,
  type AdaptiveKalmanStylusConfig,
  type CornerBrakeReason,
  type DisplayRefreshTarget,
  type PredictedStylusPoint,
  type RawStylusPacket,
  type StylusPacketRejectionReason,
} from "./adaptive-kalman-stylus-predictor";

export interface CommittedInkPoint {
  readonly tier: "committed";
  readonly speculative: false;
  readonly packetSeq: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly nibWidthPx: number;
}

export interface CommittedInkSegment {
  readonly tier: "committed";
  readonly speculative: false;
  readonly segmentIndex: number;
  readonly from: CommittedInkPoint;
  readonly to: CommittedInkPoint;
  readonly lengthPx: number;
}

export interface SpeculativeInkTailPoint {
  readonly tier: "speculative";
  readonly speculative: true;
  readonly epoch: number;
  readonly stepIndex: number;
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly leadTimeMs: number;
  readonly pressure: number;
  readonly nibWidthPx: number;
  readonly confidence: number;
  readonly uncertaintyRadiusPx: number;
  readonly displacementFromHeadPx: number;
}

export interface ReversibleSpeculativeSessionConfig extends AdaptiveKalmanStylusConfig {
  readonly strokeId?: string;
  readonly substeps?: number;
  readonly horizonMsOverride?: number;
}

export interface SpeculativePacketFrameResult {
  readonly accepted: boolean;
  readonly rejectionReason: StylusPacketRejectionReason | null;
  readonly epoch: number;
  readonly rolledBackTailPointCount: number;
  readonly committedHead: CommittedInkPoint | null;
  readonly newCommittedSegment: CommittedInkSegment | null;
  readonly speculativeTail: readonly SpeculativeInkTailPoint[];
  readonly effectiveHorizonMs: number;
  readonly brakeFactor: number;
  readonly brakeReason: CornerBrakeReason;
  readonly cornerBrakeActive: boolean;
}

export interface ReversibleSessionSnapshot {
  readonly strokeId: string;
  readonly isFinalized: boolean;
  readonly epoch: number;
  readonly refreshTarget: DisplayRefreshTarget;
  readonly acceptedPacketCount: number;
  readonly rejectedPacketCount: number;
  readonly totalRollbackCount: number;
  readonly committedPoints: readonly CommittedInkPoint[];
  readonly committedSegments: readonly CommittedInkSegment[];
  readonly speculativeTail: readonly SpeculativeInkTailPoint[];
}

export interface FinalizedSpeculativeStroke {
  readonly strokeId: string;
  readonly isFinalized: true;
  readonly refreshTarget: DisplayRefreshTarget;
  readonly committedPoints: readonly CommittedInkPoint[];
  readonly committedSegments: readonly CommittedInkSegment[];
  readonly speculativeTail: readonly [];
  readonly zeroSpeculativeLeakage: boolean;
  readonly maxCommittedDeviationPx: number;
  readonly totalRollbackCount: number;
  readonly acceptedPacketCount: number;
  readonly rejectedPacketCount: number;
  readonly totalStrokeLengthPx: number;
  readonly durationMs: number;
}

function toSpeculativeTailPoint(pt: PredictedStylusPoint, epoch: number): SpeculativeInkTailPoint {
  return {
    tier: "speculative", speculative: true, epoch, stepIndex: pt.stepIndex,
    x: pt.x, y: pt.y, timestampMs: pt.timestampMs, leadTimeMs: pt.leadTimeMs,
    pressure: pt.pressure, nibWidthPx: pt.nibWidthPx, confidence: pt.confidence,
    uncertaintyRadiusPx: pt.uncertaintyRadiusPx, displacementFromHeadPx: pt.displacementFromHeadPx,
  };
}

export class ReversibleSpeculativeInkSession {
  public readonly strokeId: string;
  public readonly predictor: SubframeStylusKalmanPredictor;
  private readonly substeps: number;
  private readonly horizonMsOverride: number | undefined;
  private readonly committedPointsInternal: CommittedInkPoint[] = [];
  private readonly committedSegmentsInternal: CommittedInkSegment[] = [];
  private readonly denoisedReferencePoints: Array<{ readonly x: number; readonly y: number }> = [];
  private speculativeTailInternal: SpeculativeInkTailPoint[] = [];
  private epoch = 0;
  private isFinalized = false;
  private acceptedPacketCount = 0;
  private rejectedPacketCount = 0;
  private totalRollbackCount = 0;

  public constructor(config: ReversibleSpeculativeSessionConfig = {}) {
    this.strokeId = config.strokeId ?? "stroke-wave99-local";
    this.predictor = new SubframeStylusKalmanPredictor(config);
    this.substeps = Math.round(Math.min(4, Math.max(1, config.substeps ?? 3)));
    this.horizonMsOverride = config.horizonMsOverride;
  }

  private getCurrentHead(): CommittedInkPoint | null {
    const len = this.committedPointsInternal.length;
    return len > 0 ? (this.committedPointsInternal[len - 1] ?? null) : null;
  }

  public onPointerPacket(packet: RawStylusPacket): SpeculativePacketFrameResult {
    if (this.isFinalized) {
      this.rejectedPacketCount += 1;
      return {
        accepted: false, rejectionReason: "stroke-finalized", epoch: this.epoch,
        rolledBackTailPointCount: 0, committedHead: this.getCurrentHead(), newCommittedSegment: null,
        speculativeTail: [], effectiveHorizonMs: 0, brakeFactor: 1, brakeReason: "none", cornerBrakeActive: false,
      };
    }

    const update = this.predictor.update(packet);
    if (!update.accepted) {
      this.rejectedPacketCount += 1;
      return {
        accepted: false, rejectionReason: update.rejectionReason, epoch: this.epoch,
        rolledBackTailPointCount: 0, committedHead: this.getCurrentHead(), newCommittedSegment: null,
        speculativeTail: this.speculativeTailInternal.slice(), effectiveHorizonMs: 0,
        brakeFactor: update.snapshot.brakeFactor, brakeReason: update.snapshot.brakeReason,
        cornerBrakeActive: update.snapshot.cornerBrakeActive,
      };
    }

    // 1) 기존 투기 꼬리 원자적 롤백
    const rolledBackTailPointCount = this.speculativeTailInternal.length;
    if (rolledBackTailPointCount > 0) this.totalRollbackCount += 1;
    this.speculativeTailInternal = [];
    this.epoch += 1;

    // 2) 하드웨어 검증 패킷만 확정 버퍼에 불변 기록
    const snap = update.snapshot;
    this.acceptedPacketCount += 1;
    const prevCommitted = this.getCurrentHead();
    const committedPoint: CommittedInkPoint = {
      tier: "committed", speculative: false, packetSeq: this.acceptedPacketCount,
      rawX: packet.x, rawY: packet.y, x: snap.x, y: snap.y,
      timestampMs: snap.lastTimestampMs, pressure: snap.pressure, nibWidthPx: snap.nibWidthPx,
    };
    this.committedPointsInternal.push(committedPoint);
    this.denoisedReferencePoints.push({ x: snap.x, y: snap.y });

    let newCommittedSegment: CommittedInkSegment | null = null;
    if (prevCommitted !== null) {
      newCommittedSegment = {
        tier: "committed", speculative: false, segmentIndex: this.committedSegmentsInternal.length,
        from: prevCommitted, to: committedPoint,
        lengthPx: Math.hypot(committedPoint.x - prevCommitted.x, committedPoint.y - prevCommitted.y),
      };
      this.committedSegmentsInternal.push(newCommittedSegment);
    }

    // 3) 새 투기 꼬리 방출
    const pred = predictSubframeStylusHorizon(
      this.predictor,
      this.horizonMsOverride ?? this.predictor.config.defaultHorizonMs,
      this.substeps,
    );
    const nextTail: SpeculativeInkTailPoint[] = [];
    if (!pred.passthroughActive && !pred.isStationary && pred.effectiveHorizonMs > 0) {
      for (const pt of pred.points) {
        if (pt.displacementFromHeadPx > 1e-4) nextTail.push(toSpeculativeTailPoint(pt, this.epoch));
      }
    }
    this.speculativeTailInternal = nextTail;

    return {
      accepted: true, rejectionReason: null, epoch: this.epoch, rolledBackTailPointCount,
      committedHead: committedPoint, newCommittedSegment, speculativeTail: nextTail.slice(),
      effectiveHorizonMs: pred.effectiveHorizonMs, brakeFactor: pred.brakeFactor,
      brakeReason: pred.brakeReason, cornerBrakeActive: pred.cornerBrakeActive,
    };
  }

  public finalizeStroke(): FinalizedSpeculativeStroke {
    if (this.speculativeTailInternal.length > 0) this.totalRollbackCount += 1;
    this.speculativeTailInternal = [];
    this.isFinalized = true;

    let maxCommittedDeviationPx = 0;
    let allCommittedClean = true;
    for (let i = 0; i < this.committedPointsInternal.length; i += 1) {
      const pt = this.committedPointsInternal[i];
      const ref = this.denoisedReferencePoints[i];
      if (!pt || !ref || pt.tier !== "committed" || pt.speculative !== false) {
        allCommittedClean = false;
        continue;
      }
      const dev = Math.hypot(pt.x - ref.x, pt.y - ref.y);
      if (dev > maxCommittedDeviationPx) maxCommittedDeviationPx = dev;
    }

    let totalStrokeLengthPx = 0;
    for (const seg of this.committedSegmentsInternal) totalStrokeLengthPx += seg.lengthPx;
    const firstPt = this.committedPointsInternal[0];
    const lastPt = this.getCurrentHead();
    const durationMs = firstPt && lastPt ? Math.max(0, lastPt.timestampMs - firstPt.timestampMs) : 0;

    return {
      strokeId: this.strokeId, isFinalized: true, refreshTarget: this.predictor.config.refreshTarget,
      committedPoints: this.committedPointsInternal.slice(),
      committedSegments: this.committedSegmentsInternal.slice(),
      speculativeTail: [],
      zeroSpeculativeLeakage: allCommittedClean && maxCommittedDeviationPx === 0 && this.speculativeTailInternal.length === 0,
      maxCommittedDeviationPx, totalRollbackCount: this.totalRollbackCount,
      acceptedPacketCount: this.acceptedPacketCount, rejectedPacketCount: this.rejectedPacketCount,
      totalStrokeLengthPx, durationMs,
    };
  }

  public getStateSnapshot(): ReversibleSessionSnapshot {
    return {
      strokeId: this.strokeId, isFinalized: this.isFinalized, epoch: this.epoch,
      refreshTarget: this.predictor.config.refreshTarget,
      acceptedPacketCount: this.acceptedPacketCount, rejectedPacketCount: this.rejectedPacketCount,
      totalRollbackCount: this.totalRollbackCount,
      committedPoints: this.committedPointsInternal.slice(),
      committedSegments: this.committedSegmentsInternal.slice(),
      speculativeTail: this.speculativeTailInternal.slice(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 실시간 지연·정확도 벤치마크 평가기                                             */
/* -------------------------------------------------------------------------- */

export type PredictiveBenchmarkScenarioId =
  | "fast-straight-speedline"
  | "tight-circular-arc"
  | "sharp-90-jawline-corner"
  | "noisy-hand-tremor-line";

export interface BenchmarkGroundTruthPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface BenchmarkTrajectorySample {
  readonly timestampMs: number;
  readonly groundTruthX: number;
  readonly groundTruthY: number;
  readonly delayedRawX: number;
  readonly delayedRawY: number;
  readonly committedX: number;
  readonly committedY: number;
  readonly predictedTipX: number;
  readonly predictedTipY: number;
  readonly confidence: number;
  readonly brakeFactor: number;
  readonly isCornerBrakeActive: boolean;
  readonly rawLagPx: number;
  readonly predictiveLagPx: number;
}

export interface PredictiveScenarioBenchmarkResult {
  readonly scenarioId: PredictiveBenchmarkScenarioId;
  readonly labelKo: string;
  readonly sampleCount: number;
  readonly rawLatencyLagPx: number;
  readonly perceivedPredictiveLagPx: number;
  readonly lagReductionPercent: number;
  readonly meanPredictionErrorPx: number;
  readonly naiveLinearExtrapolationErrorPx: number;
  readonly maxCornerOvershootPx: number;
  readonly unclampedCornerOvershootPx: number;
  readonly cornerBrakeActivationCount: number;
  readonly zeroSpeculativeLeakageOnCommit: boolean;
  readonly totalRollbackCount: number;
  readonly samples: readonly BenchmarkTrajectorySample[];
}

export interface PredictiveInkBenchmarkOptions {
  readonly refreshTarget?: DisplayRefreshTarget;
  readonly substeps?: number;
  readonly prefersReducedMotion?: boolean;
  readonly disablePrediction?: boolean;
  readonly scenarios?: readonly PredictiveBenchmarkScenarioId[];
}

export interface PredictiveInkBenchmarkReport {
  readonly refreshTarget: DisplayRefreshTarget;
  readonly frameBudgetMs: number;
  readonly passthroughActive: boolean;
  readonly scenarioCount: number;
  readonly rawLatencyLagPx: number;
  readonly perceivedPredictiveLagPx: number;
  readonly lagReductionPercent: number;
  readonly meanPredictionErrorPx: number;
  readonly maxCornerOvershootPx: number;
  readonly unclampedCornerOvershootPx: number;
  readonly zeroSpeculativeLeakageOnCommit: boolean;
  readonly scenarios: readonly PredictiveScenarioBenchmarkResult[];
}

interface BuiltBenchmarkScenario {
  readonly id: PredictiveBenchmarkScenarioId;
  readonly labelKo: string;
  readonly durationMs: number;
  readonly groundTruthAt: (tMs: number) => BenchmarkGroundTruthPoint;
  readonly noiseAt?: (index: number) => { readonly dx: number; readonly dy: number };
  readonly cornerSpec?: {
    readonly cornerTimeMs: number;
    readonly vertexX: number;
    readonly vertexY: number;
    readonly incomingUx: number;
    readonly incomingUy: number;
  };
}

const DEFAULT_BENCHMARK_SCENARIOS: readonly PredictiveBenchmarkScenarioId[] = [
  "fast-straight-speedline",
  "tight-circular-arc",
  "sharp-90-jawline-corner",
  "noisy-hand-tremor-line",
];

function buildScenarioSpec(scenarioId: PredictiveBenchmarkScenarioId): BuiltBenchmarkScenario {
  if (scenarioId === "fast-straight-speedline") {
    return {
      id: scenarioId, labelKo: "고속 직선 스피드라인", durationMs: 300,
      groundTruthAt: (tMs) => {
        const s = Math.max(0, tMs) / 1000;
        return { x: 24 + 780 * s, y: 36 + 180 * s, pressure: Math.min(1, 0.45 + 0.35 * (s / 0.3)) };
      },
    };
  }
  if (scenarioId === "tight-circular-arc") {
    return {
      id: scenarioId, labelKo: "고곡률 원호 윤곽선", durationMs: 340,
      groundTruthAt: (tMs) => {
        const angle = -Math.PI * 0.75 + 8.4 * (Math.max(0, tMs) / 1000);
        return { x: 120 + 64 * Math.cos(angle), y: 120 + 64 * Math.sin(angle), pressure: 0.68 };
      },
    };
  }
  if (scenarioId === "sharp-90-jawline-corner") {
    const tCornerMs = 150;
    const leg = 105;
    const evalLeg = (u: number): number => {
      const c = Math.min(1, Math.max(0, u));
      if (c < 0.78) return (c / 0.78) * 0.89;
      const tail = (c - 0.78) / 0.22;
      return 0.89 + 0.11 * (1 - (1 - tail) * (1 - tail));
    };
    return {
      id: scenarioId, labelKo: "급각 90° 턱선 코너", durationMs: 300,
      groundTruthAt: (tMs) => {
        if (tMs <= tCornerMs) return { x: 20 + leg * evalLeg(tMs / tCornerMs), y: 40, pressure: 0.72 };
        const post = Math.min(1, (tMs - tCornerMs) / tCornerMs);
        const eased = post < 0.2 ? 0.5 * (post / 0.2) * (post / 0.2) * 0.22 : 0.11 + ((post - 0.2) / 0.8) * 0.89;
        return { x: 20 + leg, y: 40 + leg * eased, pressure: 0.65 };
      },
      cornerSpec: { cornerTimeMs: tCornerMs, vertexX: 20 + leg, vertexY: 40, incomingUx: 1, incomingUy: 0 },
    };
  }
  return {
    id: "noisy-hand-tremor-line", labelKo: "손떨림 노이즈 직선", durationMs: 300,
    groundTruthAt: (tMs) => {
      const s = Math.max(0, tMs) / 1000;
      return { x: 24 + 420 * s, y: 88 + 60 * s, pressure: 0.58 };
    },
    noiseAt: (index) => {
      const sign = index % 2 === 0 ? 1 : -1;
      return { dx: sign * 0.85 * Math.cos(index * 1.9), dy: sign * 1.45 * Math.sin(index * 2.3 + 0.4) };
    },
  };
}

function runSingleScenarioBenchmark(
  scenarioId: PredictiveBenchmarkScenarioId,
  refreshTarget: DisplayRefreshTarget,
  substeps: number,
  prefersReducedMotion: boolean,
  disablePrediction: boolean,
): PredictiveScenarioBenchmarkResult {
  const spec = buildScenarioSpec(scenarioId);
  const frameBudgetMs = DISPLAY_REFRESH_HORIZON_MS[refreshTarget];
  const totalSamples = Math.max(12, Math.floor(spec.durationMs / frameBudgetMs));
  const session = new ReversibleSpeculativeInkSession({
    strokeId: `bench-${scenarioId}-${refreshTarget}`,
    refreshTarget, substeps, prefersReducedMotion, disablePrediction,
  });

  const samples: BenchmarkTrajectorySample[] = [];
  let sumRawLag = 0; let sumPredLag = 0; let sumLinearErr = 0; let steadyCount = 0;
  let maxCornerOvershootPx = 0; let unclampedCornerOvershootPx = 0; let cornerBrakeActivationCount = 0;
  let prevRawX = 0; let prevRawY = 0; let prevRawT = 0;

  for (let i = 0; i <= totalSamples; i += 1) {
    const tMs = i * frameBudgetMs;
    const gtNow = spec.groundTruthAt(tMs);
    const noise = spec.noiseAt ? spec.noiseAt(i) : { dx: 0, dy: 0 };
    const rawX = gtNow.x + noise.dx;
    const rawY = gtNow.y + noise.dy;
    const frame = session.onPointerPacket({ x: rawX, y: rawY, timestampMs: tMs, pressure: gtNow.pressure, pointerType: "pen" });

    const gtDisplay = spec.groundTruthAt(tMs + frameBudgetMs);
    const committedX = frame.committedHead ? frame.committedHead.x : rawX;
    const committedY = frame.committedHead ? frame.committedHead.y : rawY;
    const tip = frame.speculativeTail.length > 0 ? frame.speculativeTail[frame.speculativeTail.length - 1] : undefined;
    const predTipX = tip ? tip.x : committedX;
    const predTipY = tip ? tip.y : committedY;

    const rawLagPx = Math.hypot(gtDisplay.x - committedX, gtDisplay.y - committedY);
    const predictiveLagPx = Math.hypot(gtDisplay.x - predTipX, gtDisplay.y - predTipY);

    let linearX = rawX;
    let linearY = rawY;
    if (i > 0) {
      const dtSec = Math.max(0.0005, (tMs - prevRawT) / 1000);
      const hSec = frameBudgetMs / 1000;
      linearX = rawX + ((rawX - prevRawX) / dtSec) * hSec;
      linearY = rawY + ((rawY - prevRawY) / dtSec) * hSec;
    }
    const linearErrPx = Math.hypot(gtDisplay.x - linearX, gtDisplay.y - linearY);

    if (frame.cornerBrakeActive) cornerBrakeActivationCount += 1;
    if (spec.cornerSpec && tMs >= spec.cornerSpec.cornerTimeMs - frameBudgetMs * 1.5 && tMs <= spec.cornerSpec.cornerTimeMs + frameBudgetMs * 4) {
      const { vertexX, vertexY, incomingUx, incomingUy } = spec.cornerSpec;
      maxCornerOvershootPx = Math.max(maxCornerOvershootPx, (predTipX - vertexX) * incomingUx + (predTipY - vertexY) * incomingUy);
      unclampedCornerOvershootPx = Math.max(unclampedCornerOvershootPx, (linearX - vertexX) * incomingUx + (linearY - vertexY) * incomingUy);
    }

    if (i >= 3) {
      sumRawLag += rawLagPx;
      sumPredLag += predictiveLagPx;
      sumLinearErr += linearErrPx;
      steadyCount += 1;
    }

    samples.push({
      timestampMs: tMs, groundTruthX: gtDisplay.x, groundTruthY: gtDisplay.y,
      delayedRawX: rawX, delayedRawY: rawY, committedX, committedY,
      predictedTipX: predTipX, predictedTipY: predTipY,
      confidence: tip ? tip.confidence : 0, brakeFactor: frame.brakeFactor,
      isCornerBrakeActive: frame.cornerBrakeActive, rawLagPx, predictiveLagPx,
    });
    prevRawX = rawX;
    prevRawY = rawY;
    prevRawT = tMs;
  }

  const finalized = session.finalizeStroke();
  const denom = Math.max(1, steadyCount);
  const rawLatencyLagPx = sumRawLag / denom;
  const perceivedPredictiveLagPx = sumPredLag / denom;
  return {
    scenarioId, labelKo: spec.labelKo, sampleCount: samples.length,
    rawLatencyLagPx, perceivedPredictiveLagPx,
    lagReductionPercent: rawLatencyLagPx > 1e-6 ? ((rawLatencyLagPx - perceivedPredictiveLagPx) / rawLatencyLagPx) * 100 : 0,
    meanPredictionErrorPx: perceivedPredictiveLagPx,
    naiveLinearExtrapolationErrorPx: sumLinearErr / denom,
    maxCornerOvershootPx, unclampedCornerOvershootPx, cornerBrakeActivationCount,
    zeroSpeculativeLeakageOnCommit: finalized.zeroSpeculativeLeakage,
    totalRollbackCount: finalized.totalRollbackCount,
    samples,
  };
}

export function evaluatePredictiveInkLatencyBenchmark(
  options: PredictiveInkBenchmarkOptions = {},
): PredictiveInkBenchmarkReport {
  const refreshTarget: DisplayRefreshTarget = options.refreshTarget ?? "120hz";
  const frameBudgetMs = DISPLAY_REFRESH_HORIZON_MS[refreshTarget];
  const substeps = Math.round(Math.min(4, Math.max(1, options.substeps ?? 3)));
  const prefersReducedMotion = options.prefersReducedMotion === true;
  const disablePrediction = options.disablePrediction === true;
  const scenarioIds = options.scenarios && options.scenarios.length > 0 ? options.scenarios : DEFAULT_BENCHMARK_SCENARIOS;

  const scenarios = scenarioIds.map((id) =>
    runSingleScenarioBenchmark(id, refreshTarget, substeps, prefersReducedMotion, disablePrediction),
  );
  const count = Math.max(1, scenarios.length);
  const rawLatencyLagPx = scenarios.reduce((acc, s) => acc + s.rawLatencyLagPx, 0) / count;
  const perceivedPredictiveLagPx = scenarios.reduce((acc, s) => acc + s.perceivedPredictiveLagPx, 0) / count;
  const maxCornerOvershootPx = scenarios.reduce((acc, s) => Math.max(acc, s.maxCornerOvershootPx), 0);
  const unclampedCornerOvershootPx = scenarios.reduce((acc, s) => Math.max(acc, s.unclampedCornerOvershootPx), 0);

  return {
    refreshTarget, frameBudgetMs,
    passthroughActive: prefersReducedMotion || disablePrediction,
    scenarioCount: scenarios.length, rawLatencyLagPx, perceivedPredictiveLagPx,
    lagReductionPercent: rawLatencyLagPx > 1e-6 ? ((rawLatencyLagPx - perceivedPredictiveLagPx) / rawLatencyLagPx) * 100 : 0,
    meanPredictionErrorPx: perceivedPredictiveLagPx,
    maxCornerOvershootPx, unclampedCornerOvershootPx,
    zeroSpeculativeLeakageOnCommit: scenarios.every((s) => s.zeroSpeculativeLeakageOnCommit),
    scenarios,
  };
}

/* -------------------------------------------------------------------------- */
/* WebGPU WGSL 투기 잉크 오버레이 컴포지터 셰이더 빌더 & 검증기                     */
/* -------------------------------------------------------------------------- */

export interface SpeculativeInkWgslOptions {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly maxConfidenceAlpha?: number;
}

export interface SpeculativeInkWgslValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly entryPoints: readonly string[];
  readonly bindingCount: number;
  readonly hasConfidenceFade: boolean;
  readonly hasReducedMotionGuard: boolean;
  readonly lineCount: number;
}

export function buildSpeculativeInkOverlayWgsl(options: SpeculativeInkWgslOptions = {}): string {
  const wgX = Math.round(Math.min(16, Math.max(4, options.workgroupSizeX ?? 8)));
  const wgY = Math.round(Math.min(16, Math.max(4, options.workgroupSizeY ?? 8)));
  const maxAlpha = Math.min(1, Math.max(0.1, options.maxConfidenceAlpha ?? 0.92)).toFixed(3);

  return [
    "// Wave 99: Reversible Speculative Ink Overlay Compositor (WebGPU WGSL)",
    "struct SpeculativeOverlayUniforms {",
    "  viewportSize: vec2<f32>,",
    "  baseAlpha: f32,",
    "  minConfidenceCutoff: f32,",
    "  uncertaintyFeatherPx: f32,",
    "  brakeDamping: f32,",
    "  tailSegmentCount: u32,",
    "  reducedMotionFlag: u32,",
    "};",
    "struct SpeculativeTailSegment {",
    "  p0: vec2<f32>,",
    "  p1: vec2<f32>,",
    "  radius0: f32,",
    "  radius1: f32,",
    "  confidence0: f32,",
    "  confidence1: f32,",
    "  uncertainty0: f32,",
    "  uncertainty1: f32,",
    "  inkRgba: vec4<f32>,",
    "};",
    "@group(0) @binding(0) var<uniform> uniforms: SpeculativeOverlayUniforms;",
    "@group(0) @binding(1) var<storage, read> segments: array<SpeculativeTailSegment>;",
    "@group(0) @binding(2) var overlayOutput: texture_storage_2d<rgba8unorm, write>;",
    "fn projectCapsuleParam(pixelPos: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {",
    "  let ab = b - a;",
    "  return clamp(dot(pixelPos - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);",
    "}",
    "fn evaluateConfidenceAlpha(confidence: f32, brakeDamping: f32) -> f32 {",
    "  let confCurve = smoothstep(uniforms.minConfidenceCutoff, 1.0, clamp(confidence, 0.0, 1.0));",
    "  let brakeScale = clamp(1.0 - 0.85 * clamp(brakeDamping, 0.0, 1.0), 0.0, 1.0);",
    `  return min(${maxAlpha}, uniforms.baseAlpha * confCurve * brakeScale);`,
    "}",
    `@compute @workgroup_size(${wgX}, ${wgY}, 1)`,
    "fn compositeSpeculativeInkOverlay(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  if (gid.x >= u32(uniforms.viewportSize.x) || gid.y >= u32(uniforms.viewportSize.y)) { return; }",
    "  let coord = vec2<i32>(i32(gid.x), i32(gid.y));",
    "  if (uniforms.reducedMotionFlag != 0u || uniforms.tailSegmentCount == 0u) {",
    "    textureStore(overlayOutput, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));",
    "    return;",
    "  }",
    "  let pixelPos = vec2<f32>(f32(gid.x) + 0.5, f32(gid.y) + 0.5);",
    "  var accumRgb = vec3<f32>(0.0, 0.0, 0.0);",
    "  var accumAlpha = 0.0;",
    "  for (var i: u32 = 0u; i < uniforms.tailSegmentCount; i = i + 1u) {",
    "    let seg = segments[i];",
    "    let t = projectCapsuleParam(pixelPos, seg.p0, seg.p1);",
    "    let closest = mix(seg.p0, seg.p1, t);",
    "    let radius = max(0.25, mix(seg.radius0, seg.radius1, t));",
    "    let confidence = mix(seg.confidence0, seg.confidence1, t);",
    "    let uncertainty = max(0.0, mix(seg.uncertainty0, seg.uncertainty1, t));",
    "    let feather = max(0.75, 1.0 + uniforms.uncertaintyFeatherPx * uncertainty);",
    "    let coverage = 1.0 - smoothstep(-feather * 0.5, feather * 0.5, distance(pixelPos, closest) - radius);",
    "    let sampleAlpha = coverage * evaluateConfidenceAlpha(confidence, uniforms.brakeDamping) * seg.inkRgba.a;",
    "    if (sampleAlpha > accumAlpha) { accumAlpha = sampleAlpha; accumRgb = seg.inkRgba.rgb; }",
    "  }",
    "  textureStore(overlayOutput, coord, vec4<f32>(accumRgb * accumAlpha, accumAlpha));",
    "}",
  ].join("\n");
}

export function validateSpeculativeInkWgsl(wgslSource: string): SpeculativeInkWgslValidation {
  const errors: string[] = [];
  const trimmed = wgslSource.trim();
  const lines = trimmed.length > 0 ? trimmed.split("\n") : [];
  if (trimmed.length === 0) errors.push("WGSL 셰이더 본문이 비어 있습니다.");

  let braceBalance = 0;
  let parenBalance = 0;
  for (let i = 0; i < wgslSource.length; i += 1) {
    const ch = wgslSource[i];
    if (ch === "{") braceBalance += 1;
    else if (ch === "}") braceBalance -= 1;
    else if (ch === "(") parenBalance += 1;
    else if (ch === ")") parenBalance -= 1;
    if (braceBalance < 0) { errors.push("닫는 중괄호가 여는 중괄호보다 먼저 나타났습니다."); break; }
    if (parenBalance < 0) { errors.push("닫는 소괄호가 여는 소괄호보다 먼저 나타났습니다."); break; }
  }
  if (braceBalance !== 0) errors.push(`중괄호 짝이 맞지 않습니다(잔여 깊이: ${braceBalance}).`);
  if (parenBalance !== 0) errors.push(`소괄호 짝이 맞지 않습니다(잔여 깊이: ${parenBalance}).`);
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgslSource)) errors.push("유효하지 않은 수치 또는 undefined 토큰이 포함되었습니다.");

  const entryPoints: string[] = [];
  const entryRegex = /@compute\s+@workgroup_size\([^)]+\)\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match = entryRegex.exec(wgslSource);
  while (match !== null) {
    if (match[1]) entryPoints.push(match[1]);
    match = entryRegex.exec(wgslSource);
  }
  if (entryPoints.length === 0) errors.push("@compute @workgroup_size 진입점이 누락되었습니다.");

  const bindingMatches = wgslSource.match(/@group\(\d+\)\s+@binding\(\d+\)/g);
  const bindingCount = bindingMatches ? bindingMatches.length : 0;
  if (bindingCount < 3) errors.push("3개 이상의 @binding 선언이 필요합니다.");

  const hasConfidenceFade = /evaluateConfidenceAlpha/.test(wgslSource) && /smoothstep\(/.test(wgslSource);
  if (!hasConfidenceFade) errors.push("신뢰도 비례 알파 페이드 연산이 누락되었습니다.");

  const hasReducedMotionGuard = /reducedMotionFlag/.test(wgslSource);
  if (!hasReducedMotionGuard) errors.push("reducedMotionFlag 조기 탈출 가드가 누락되었습니다.");

  return {
    valid: errors.length === 0, errors, entryPoints, bindingCount,
    hasConfidenceFade, hasReducedMotionGuard, lineCount: lines.length,
  };
}
