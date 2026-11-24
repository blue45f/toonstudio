/**
 * 런타임 카나리 헬스 · SLO 자동 롤백 평가기 (`evaluateCanaryReleaseHealth`).
 *
 * - 프레임 드롭률 · p95 프레임 시간 · WebGL 셰이더 컴파일 실패율 · WASM 메모리 폴트 ·
 *   HTTP 5xx 오류 예산 소진율 · 관측 표본 정족수를 엄격한 SLO 임계값과 대조한다.
 * - 결정론적 `"promote" | "hold" | "rollback"` 판정과 정확한 트리거 사유 목록을 반환한다.
 */

export type CanaryReleaseDecision = "promote" | "hold" | "rollback";
export type CanaryTriggerSeverity = "hold" | "rollback";
export type CanaryMetricKey =
  | "sample-quorum"
  | "frame-drop-rate"
  | "p95-frame-time"
  | "webgl-shader-compile"
  | "wasm-memory-fault"
  | "http-error-budget";

export interface CanaryTelemetrySnapshot {
  readonly releaseVersion: string;
  readonly canaryTrafficPct: number;
  readonly observationWindowSec: number;
  readonly sampleCount: number;
  /** 전체 렌더 프레임 중 드롭 프레임 비율 (0..1). */
  readonly frameDropRate: number;
  /** p95 프레임 시간 (ms). */
  readonly p95FrameTimeMs: number;
  readonly webglShaderCompileAttempts: number;
  readonly webglShaderCompileFailures: number;
  readonly wasmMemoryFaultCount: number;
  readonly httpRequestCount: number;
  readonly http5xxCount: number;
  /** 윈도우 허용 5xx 오류 예산 비율 (기본 0.001 = 99.9% 가용성 SLO). */
  readonly httpErrorBudgetAllowanceRate?: number;
  /** 대조군(stable) 기준선 프레임 드롭률 (선택). */
  readonly baselineFrameDropRate?: number;
}

export interface CanarySloThresholds {
  readonly minSampleCount: number;
  readonly minObservationWindowSec: number;
  readonly frameDropHoldRate: number;
  readonly frameDropRollbackRate: number;
  readonly frameDropBaselineMultiplierRollback: number;
  readonly p95FrameTimeHoldMs: number;
  readonly p95FrameTimeRollbackMs: number;
  readonly shaderFailureHoldRate: number;
  readonly shaderFailureRollbackRate: number;
  readonly wasmFaultHoldCount: number;
  readonly wasmFaultRollbackCount: number;
  readonly wasmFaultRollbackRate: number;
  readonly http5xxHoldRate: number;
  readonly http5xxRollbackRate: number;
  readonly errorBudgetBurnHold: number;
  readonly errorBudgetBurnRollback: number;
}

export const DEFAULT_CANARY_SLO_THRESHOLDS: CanarySloThresholds = Object.freeze({
  minSampleCount: 500,
  minObservationWindowSec: 300,
  frameDropHoldRate: 0.015,
  frameDropRollbackRate: 0.04,
  frameDropBaselineMultiplierRollback: 2.5,
  p95FrameTimeHoldMs: 16.67,
  p95FrameTimeRollbackMs: 24.0,
  shaderFailureHoldRate: 0.002,
  shaderFailureRollbackRate: 0.01,
  wasmFaultHoldCount: 1,
  wasmFaultRollbackCount: 3,
  wasmFaultRollbackRate: 0.001,
  http5xxHoldRate: 0.003,
  http5xxRollbackRate: 0.01,
  errorBudgetBurnHold: 2.0,
  errorBudgetBurnRollback: 6.0,
});

export interface CanaryTriggerReason {
  readonly code: string;
  readonly metric: CanaryMetricKey;
  readonly severity: CanaryTriggerSeverity;
  readonly observed: number;
  readonly threshold: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface CanaryDerivedMetrics {
  readonly shaderCompileFailureRate: number;
  readonly wasmMemoryFaultRate: number;
  readonly http5xxRate: number;
  readonly errorBudgetBurnRate: number;
  readonly remainingErrorBudgetPct: number;
}

export interface CanaryHealthEvaluation {
  readonly releaseVersion: string;
  readonly decision: CanaryReleaseDecision;
  readonly severity: "healthy" | "warning" | "critical";
  readonly healthScore: number;
  readonly derivedMetrics: CanaryDerivedMetrics;
  readonly triggers: readonly CanaryTriggerReason[];
  readonly recommendedActionKo: string;
  readonly recommendedActionEn: string;
}

/**
 * 카나리 런타임 텔레메트리를 SLO 임계값과 대조해 `"promote" | "hold" | "rollback"` 판정을 내린다.
 */
export function evaluateCanaryReleaseHealth(
  snapshot: CanaryTelemetrySnapshot,
  customThresholds?: Partial<CanarySloThresholds>,
): CanaryHealthEvaluation {
  const slo: CanarySloThresholds = {
    ...DEFAULT_CANARY_SLO_THRESHOLDS,
    ...customThresholds,
  };

  const safeSamples = Math.max(0, Math.floor(snapshot.sampleCount));
  const safeShaderAttempts = Math.max(0, Math.floor(snapshot.webglShaderCompileAttempts));
  const safeShaderFailures = Math.max(0, Math.floor(snapshot.webglShaderCompileFailures));
  const safeWasmFaults = Math.max(0, Math.floor(snapshot.wasmMemoryFaultCount));
  const safeHttpReqs = Math.max(0, Math.floor(snapshot.httpRequestCount));
  const safeHttp5xx = Math.max(0, Math.floor(snapshot.http5xxCount));

  const shaderCompileFailureRate =
    safeShaderAttempts > 0 ? safeShaderFailures / safeShaderAttempts : 0;
  const wasmMemoryFaultRate =
    safeSamples > 0 ? safeWasmFaults / safeSamples : safeWasmFaults > 0 ? 1 : 0;
  const http5xxRate = safeHttpReqs > 0 ? safeHttp5xx / safeHttpReqs : 0;
  const allowanceRate = Math.max(1e-5, snapshot.httpErrorBudgetAllowanceRate ?? 0.001);
  const errorBudgetBurnRate = http5xxRate / allowanceRate;
  const remainingErrorBudgetPct = Number(
    Math.max(
      0,
      Math.min(100, (1 - http5xxRate / Math.max(allowanceRate, slo.http5xxRollbackRate)) * 100),
    ).toFixed(1),
  );

  const triggers: CanaryTriggerReason[] = [];
  let penalty = 0;

  // 1) 프레임 드롭률
  const baselineDrop = snapshot.baselineFrameDropRate;
  const exceedsBaselineMultiplier =
    typeof baselineDrop === "number" &&
    baselineDrop > 0 &&
    snapshot.frameDropRate >= baselineDrop * slo.frameDropBaselineMultiplierRollback &&
    snapshot.frameDropRate >= slo.frameDropHoldRate;

  if (snapshot.frameDropRate >= slo.frameDropRollbackRate || exceedsBaselineMultiplier) {
    triggers.push({
      code: "FRAME_DROP_SLO_BREACH",
      metric: "frame-drop-rate",
      severity: "rollback",
      observed: snapshot.frameDropRate,
      threshold: slo.frameDropRollbackRate,
      summaryKo: `프레임 드롭률 ${(snapshot.frameDropRate * 100).toFixed(2)}%가 롤백 임계치(${(slo.frameDropRollbackRate * 100).toFixed(1)}%)를 초과했습니다.`,
      summaryEn: `Frame drop rate ${(snapshot.frameDropRate * 100).toFixed(2)}% exceeded rollback threshold (${(slo.frameDropRollbackRate * 100).toFixed(1)}%).`,
    });
    penalty += 38;
  } else if (snapshot.frameDropRate >= slo.frameDropHoldRate) {
    triggers.push({
      code: "FRAME_DROP_ELEVATED",
      metric: "frame-drop-rate",
      severity: "hold",
      observed: snapshot.frameDropRate,
      threshold: slo.frameDropHoldRate,
      summaryKo: `프레임 드롭률 ${(snapshot.frameDropRate * 100).toFixed(2)}%가 보류 기준(${(slo.frameDropHoldRate * 100).toFixed(1)}%) 이상입니다.`,
      summaryEn: `Frame drop rate ${(snapshot.frameDropRate * 100).toFixed(2)}% reached hold threshold (${(slo.frameDropHoldRate * 100).toFixed(1)}%).`,
    });
    penalty += 16;
  }

  // 2) p95 프레임 시간
  if (snapshot.p95FrameTimeMs >= slo.p95FrameTimeRollbackMs) {
    triggers.push({
      code: "P95_FRAME_TIME_BREACH",
      metric: "p95-frame-time",
      severity: "rollback",
      observed: snapshot.p95FrameTimeMs,
      threshold: slo.p95FrameTimeRollbackMs,
      summaryKo: `p95 프레임 시간 ${snapshot.p95FrameTimeMs.toFixed(2)}ms가 한계치(${slo.p95FrameTimeRollbackMs.toFixed(2)}ms)를 초과했습니다.`,
      summaryEn: `p95 frame time ${snapshot.p95FrameTimeMs.toFixed(2)}ms exceeded rollback limit (${slo.p95FrameTimeRollbackMs.toFixed(2)}ms).`,
    });
    penalty += 30;
  } else if (snapshot.p95FrameTimeMs > slo.p95FrameTimeHoldMs) {
    triggers.push({
      code: "P95_FRAME_TIME_WARNING",
      metric: "p95-frame-time",
      severity: "hold",
      observed: snapshot.p95FrameTimeMs,
      threshold: slo.p95FrameTimeHoldMs,
      summaryKo: `p95 프레임 시간 ${snapshot.p95FrameTimeMs.toFixed(2)}ms가 60fps 목표(${slo.p95FrameTimeHoldMs.toFixed(2)}ms)를 웃돕니다.`,
      summaryEn: `p95 frame time ${snapshot.p95FrameTimeMs.toFixed(2)}ms exceeded 60fps target (${slo.p95FrameTimeHoldMs.toFixed(2)}ms).`,
    });
    penalty += 14;
  }

  // 3) WebGL/WGSL 셰이더 컴파일 실패율
  if (shaderCompileFailureRate >= slo.shaderFailureRollbackRate) {
    triggers.push({
      code: "WEBGL_SHADER_COMPILE_FAILURE_SPIKE",
      metric: "webgl-shader-compile",
      severity: "rollback",
      observed: shaderCompileFailureRate,
      threshold: slo.shaderFailureRollbackRate,
      summaryKo: `WebGL 셰이더 컴파일 실패율 ${(shaderCompileFailureRate * 100).toFixed(2)}% (${safeShaderFailures}/${safeShaderAttempts})로 즉시 롤백이 필요합니다.`,
      summaryEn: `WebGL shader compile failure rate ${(shaderCompileFailureRate * 100).toFixed(2)}% (${safeShaderFailures}/${safeShaderAttempts}) triggered rollback.`,
    });
    penalty += 42;
  } else if (shaderCompileFailureRate >= slo.shaderFailureHoldRate) {
    triggers.push({
      code: "WEBGL_SHADER_COMPILE_WARNING",
      metric: "webgl-shader-compile",
      severity: "hold",
      observed: shaderCompileFailureRate,
      threshold: slo.shaderFailureHoldRate,
      summaryKo: `WebGL 셰이더 컴파일 실패율 ${(shaderCompileFailureRate * 100).toFixed(2)}%가 경고 임계치를 넘었습니다.`,
      summaryEn: `WebGL shader compile failure rate ${(shaderCompileFailureRate * 100).toFixed(2)}% exceeded warning limit.`,
    });
    penalty += 18;
  }

  // 4) WASM 선형 메모리 폴트
  if (
    safeWasmFaults >= slo.wasmFaultRollbackCount ||
    (safeWasmFaults > 0 && wasmMemoryFaultRate >= slo.wasmFaultRollbackRate)
  ) {
    triggers.push({
      code: "WASM_LINEAR_MEMORY_FAULT",
      metric: "wasm-memory-fault",
      severity: "rollback",
      observed: safeWasmFaults,
      threshold: slo.wasmFaultRollbackCount,
      summaryKo: `WASM 메모리 폴트 ${safeWasmFaults}건(비율 ${(wasmMemoryFaultRate * 100).toFixed(3)}%)이 감지되어 즉시 롤백합니다.`,
      summaryEn: `Detected ${safeWasmFaults} WASM memory fault(s) (rate ${(wasmMemoryFaultRate * 100).toFixed(3)}%), triggering rollback.`,
    });
    penalty += 45;
  } else if (safeWasmFaults >= slo.wasmFaultHoldCount) {
    triggers.push({
      code: "WASM_MEMORY_FAULT_ISOLATED",
      metric: "wasm-memory-fault",
      severity: "hold",
      observed: safeWasmFaults,
      threshold: slo.wasmFaultHoldCount,
      summaryKo: `단발성 WASM 메모리 폴트 ${safeWasmFaults}건이 기록되어 승격을 보류하고 추적합니다.`,
      summaryEn: `Recorded ${safeWasmFaults} isolated WASM memory fault(s); holding promotion.`,
    });
    penalty += 20;
  }

  // 5) HTTP 5xx 오류 예산 소진율
  if (http5xxRate >= slo.http5xxRollbackRate || errorBudgetBurnRate >= slo.errorBudgetBurnRollback) {
    triggers.push({
      code: "HTTP_ERROR_BUDGET_BURN_BREACH",
      metric: "http-error-budget",
      severity: "rollback",
      observed: errorBudgetBurnRate,
      threshold: slo.errorBudgetBurnRollback,
      summaryKo: `HTTP 5xx 오류율 ${(http5xxRate * 100).toFixed(2)}%(예산 소진율 ${errorBudgetBurnRate.toFixed(1)}x)가 롤백 한도를 넘었습니다.`,
      summaryEn: `HTTP 5xx rate ${(http5xxRate * 100).toFixed(2)}% (${errorBudgetBurnRate.toFixed(1)}x error budget burn) breached rollback limit.`,
    });
    penalty += 40;
  } else if (http5xxRate >= slo.http5xxHoldRate || errorBudgetBurnRate >= slo.errorBudgetBurnHold) {
    triggers.push({
      code: "HTTP_ERROR_BUDGET_BURN_ELEVATED",
      metric: "http-error-budget",
      severity: "hold",
      observed: errorBudgetBurnRate,
      threshold: slo.errorBudgetBurnHold,
      summaryKo: `HTTP 5xx 오류 예산 소진율 ${errorBudgetBurnRate.toFixed(1)}x가 주의 기준(${slo.errorBudgetBurnHold.toFixed(1)}x)을 넘었습니다.`,
      summaryEn: `HTTP error budget burn rate ${errorBudgetBurnRate.toFixed(1)}x exceeded hold threshold (${slo.errorBudgetBurnHold.toFixed(1)}x).`,
    });
    penalty += 15;
  }

  // 6) 최소 표본/관측 시간 정족수 검사
  if (safeSamples < slo.minSampleCount || snapshot.observationWindowSec < slo.minObservationWindowSec) {
    triggers.push({
      code: "CANARY_OBSERVATION_QUORUM_PENDING",
      metric: "sample-quorum",
      severity: "hold",
      observed: safeSamples,
      threshold: slo.minSampleCount,
      summaryKo: `관측 표본(${safeSamples}/${slo.minSampleCount}) 또는 관측 시간(${snapshot.observationWindowSec}s/${slo.minObservationWindowSec}s)이 승격 정족수 미만입니다.`,
      summaryEn: `Observation samples (${safeSamples}/${slo.minSampleCount}) or window (${snapshot.observationWindowSec}s/${slo.minObservationWindowSec}s) below promotion quorum.`,
    });
    penalty += 10;
  }

  const hasRollback = triggers.some((t) => t.severity === "rollback");
  const hasHold = triggers.some((t) => t.severity === "hold");
  const decision: CanaryReleaseDecision = hasRollback ? "rollback" : hasHold ? "hold" : "promote";
  const severity: "healthy" | "warning" | "critical" = hasRollback
    ? "critical"
    : hasHold
      ? "warning"
      : "healthy";
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));

  const recommendedActionKo =
    decision === "rollback"
      ? `즉시 직전 안정 SHA로 트래픽을 100% 복구하고 ${triggers.filter((t) => t.severity === "rollback").length}건의 SLO 위반 원인을 차단하세요.`
      : decision === "hold"
        ? `카나리 트래픽(${snapshot.canaryTrafficPct}%)을 동결한 채 추가 표본과 경보 지표를 관찰하세요.`
        : `모든 GPU·WASM·HTTP SLO가 정상 범위입니다. ${snapshot.releaseVersion}을 전체 트래픽으로 승격할 수 있습니다.`;

  const recommendedActionEn =
    decision === "rollback"
      ? `Immediately route 100% traffic back to the prior stable SHA and mitigate ${triggers.filter((t) => t.severity === "rollback").length} critical SLO breach(es).`
      : decision === "hold"
        ? `Freeze canary traffic at ${snapshot.canaryTrafficPct}% until hold warnings and quorum clear.`
        : `All GPU, WASM, and HTTP SLOs are healthy. Safe to promote ${snapshot.releaseVersion}.`;

  return {
    releaseVersion: snapshot.releaseVersion,
    decision,
    severity,
    healthScore,
    derivedMetrics: {
      shaderCompileFailureRate,
      wasmMemoryFaultRate,
      http5xxRate,
      errorBudgetBurnRate: Number(errorBudgetBurnRate.toFixed(2)),
      remainingErrorBudgetPct,
    },
    triggers,
    recommendedActionKo,
    recommendedActionEn,
  };
}

export interface CanaryPresetScenario {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly telemetry: CanaryTelemetrySnapshot;
}

/** UI 시뮬레이터·테스트용 카나리 배포 프리셋 5종. */
export const CANARY_TELEMETRY_PRESETS: readonly CanaryPresetScenario[] = Object.freeze([
  {
    id: "healthy-promote",
    labelKo: "정상 카나리 (승격 가능)",
    labelEn: "Healthy Canary (Promote)",
    telemetry: {
      releaseVersion: "v36.4.0-rc1",
      canaryTrafficPct: 10,
      observationWindowSec: 900,
      sampleCount: 4200,
      frameDropRate: 0.004,
      p95FrameTimeMs: 11.8,
      webglShaderCompileAttempts: 1850,
      webglShaderCompileFailures: 0,
      wasmMemoryFaultCount: 0,
      httpRequestCount: 28000,
      http5xxCount: 8,
      httpErrorBudgetAllowanceRate: 0.001,
      baselineFrameDropRate: 0.005,
    },
  },
  {
    id: "quorum-hold",
    labelKo: "표본 부족·경미한 프레임 지연 (보류)",
    labelEn: "Quorum & Mild Frame Lag (Hold)",
    telemetry: {
      releaseVersion: "v36.4.0-rc2",
      canaryTrafficPct: 5,
      observationWindowSec: 180,
      sampleCount: 320,
      frameDropRate: 0.018,
      p95FrameTimeMs: 17.4,
      webglShaderCompileAttempts: 420,
      webglShaderCompileFailures: 1,
      wasmMemoryFaultCount: 0,
      httpRequestCount: 2400,
      http5xxCount: 4,
      httpErrorBudgetAllowanceRate: 0.001,
      baselineFrameDropRate: 0.009,
    },
  },
  {
    id: "shader-compile-rollback",
    labelKo: "WebGL 셰이더 컴파일 실패 급증 (롤백)",
    labelEn: "WebGL Shader Failure Spike (Rollback)",
    telemetry: {
      releaseVersion: "v36.4.0-rc3",
      canaryTrafficPct: 10,
      observationWindowSec: 420,
      sampleCount: 1600,
      frameDropRate: 0.022,
      p95FrameTimeMs: 18.9,
      webglShaderCompileAttempts: 1200,
      webglShaderCompileFailures: 29,
      wasmMemoryFaultCount: 0,
      httpRequestCount: 9200,
      http5xxCount: 5,
      httpErrorBudgetAllowanceRate: 0.001,
    },
  },
  {
    id: "wasm-fault-rollback",
    labelKo: "WASM 메모리 폴트·프레임 드롭 (롤백)",
    labelEn: "WASM Memory Fault & Drops (Rollback)",
    telemetry: {
      releaseVersion: "v36.4.0-rc4",
      canaryTrafficPct: 15,
      observationWindowSec: 540,
      sampleCount: 2100,
      frameDropRate: 0.056,
      p95FrameTimeMs: 27.4,
      webglShaderCompileAttempts: 900,
      webglShaderCompileFailures: 1,
      wasmMemoryFaultCount: 5,
      httpRequestCount: 11000,
      http5xxCount: 9,
      httpErrorBudgetAllowanceRate: 0.001,
    },
  },
  {
    id: "http-budget-rollback",
    labelKo: "HTTP 5xx 오류 예산 소진 초과 (롤백)",
    labelEn: "HTTP 5xx Error Budget Burn (Rollback)",
    telemetry: {
      releaseVersion: "v36.4.0-rc5",
      canaryTrafficPct: 10,
      observationWindowSec: 600,
      sampleCount: 3100,
      frameDropRate: 0.007,
      p95FrameTimeMs: 13.1,
      webglShaderCompileAttempts: 1400,
      webglShaderCompileFailures: 0,
      wasmMemoryFaultCount: 0,
      httpRequestCount: 15000,
      http5xxCount: 142,
      httpErrorBudgetAllowanceRate: 0.001,
    },
  },
]);
