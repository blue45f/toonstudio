import { describe, expect, it } from "vitest";
import {
  auditZeroEagerBundleInvariant,
  computeLatencyPercentiles,
  computeTelemetryGovernanceFingerprint,
  createSample100EngineTelemetryScenario,
  detectColdStartOutliers,
  escapeSvgXml,
  planDualPoolMemoryGovernance,
  planFrameBudgetWarmupWaves,
  renderStudioTelemetryGovernorSvg,
  resolveDeviceMemoryBudget,
  runStudio100EngineTelemetryGovernor,
  sha256TelemetryHex,
  summarizeTelemetryGovernorKo,
  type StudioEngineTelemetryEntry,
} from "./index";

const MIB = 1024 * 1024;
const BASE_NOW_MS = 1795800000000;

function makeEntry(
  overrides: Partial<StudioEngineTelemetryEntry> & { engineId: string },
): StudioEngineTelemetryEntry {
  return {
    waveNumber: 100,
    category: "ink-brush",
    coldStartMs: 6.0,
    warmInvokeMs: 1.0,
    wasmHeapBytes: 10 * MIB,
    vramBytes: 8 * MIB,
    eagerBundleBytes: 0,
    priorityTier: "standard",
    lastUsedMs: BASE_NOW_MS - 60000,
    pinned: false,
    dependencies: [],
    ...overrides,
  };
}

describe("Wave 160 지연 백분위 프로파일러 (computeLatencyPercentiles)", () => {
  it("1..100 표본에서 정확한 p50/p90/p95/p99/mean/stddev/jitterCv를 계산한다", () => {
    const stats = computeLatencyPercentiles(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(stats.sampleCount).toBe(100);
    expect(stats.min).toBe(1);
    expect(stats.p50).toBe(50.5);
    expect(stats.p90).toBe(90.1);
    expect(stats.p95).toBe(95.05);
    expect(stats.p99).toBe(99.01);
    expect(stats.max).toBe(100);
    expect(stats.mean).toBe(50.5);
    expect(stats.stddev).toBeCloseTo(28.8661, 3);
    expect(stats.jitterCv).toBeCloseTo(28.8661 / 50.5, 3);
  });

  it("정렬되지 않은 소규모 표본을 원본 변경 없이 선형 보간한다", () => {
    const raw = [50, 10, 40, 20, 30];
    const snapshot = raw.slice();
    const stats = computeLatencyPercentiles(raw);
    expect(raw).toEqual(snapshot);
    expect(stats.p50).toBe(30);
    expect(stats.p90).toBe(46);
    expect(stats.p95).toBe(48);
    expect(stats.p99).toBe(49.6);
  });

  it("빈 배열에서 NaN이나 Infinity 없이 0 통계를 반환한다", () => {
    const stats = computeLatencyPercentiles([]);
    expect(stats).toEqual({
      sampleCount: 0,
      min: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      jitterCv: 0,
    });
  });

  it("단일 원소 표본에서 모든 백분위가 같고 표준편차·지터 CV는 0이다", () => {
    const stats = computeLatencyPercentiles([12.5]);
    expect(stats.sampleCount).toBe(1);
    expect(stats.min).toBe(12.5);
    expect(stats.p50).toBe(12.5);
    expect(stats.p95).toBe(12.5);
    expect(stats.p99).toBe(12.5);
    expect(stats.max).toBe(12.5);
    expect(stats.stddev).toBe(0);
    expect(stats.jitterCv).toBe(0);
  });

  it("전부 0인 표본에서 0 나눗셈 없이 jitterCv 0을 유지한다", () => {
    const stats = computeLatencyPercentiles([0, 0, 0, 0]);
    expect(stats.mean).toBe(0);
    expect(stats.jitterCv).toBe(0);
    expect(Number.isFinite(stats.jitterCv)).toBe(true);
  });

  it("NaN·Infinity를 제외하고 음수 지연은 0으로 보정한다", () => {
    const stats = computeLatencyPercentiles([Number.NaN, Number.POSITIVE_INFINITY, -5, 10, 20]);
    expect(stats.sampleCount).toBe(3);
    expect(stats.min).toBe(0);
    expect(stats.p50).toBe(10);
    expect(stats.max).toBe(20);
  });

  it("편향 분포에서도 min <= p50 <= p90 <= p95 <= p99 <= max 단조성을 보장한다", () => {
    const s = computeLatencyPercentiles([2, 2.5, 3, 3.2, 4, 4.1, 5, 5.5, 9, 18, 95, 240]);
    expect(s.min).toBeLessThanOrEqual(s.p50);
    expect(s.p50).toBeLessThanOrEqual(s.p90);
    expect(s.p90).toBeLessThanOrEqual(s.p95);
    expect(s.p95).toBeLessThanOrEqual(s.p99);
    expect(s.p99).toBeLessThanOrEqual(s.max);
  });
});

describe("Wave 160 제로 초기 번들 불변성 감사기 (auditZeroEagerBundleInvariant)", () => {
  it("103종 지연 로딩 샘플 시나리오가 0 B(0.0 KiB)로 통과한다", () => {
    const audit = auditZeroEagerBundleInvariant(createSample100EngineTelemetryScenario().entries);
    expect(audit.compliant).toBe(true);
    expect(audit.totalEngineCount).toBe(103);
    expect(audit.leakingEngineCount).toBe(0);
    expect(audit.totalEagerLeakBytes).toBe(0);
    expect(audit.totalEagerLeakKib).toBe(0);
    expect(audit.offendingEngineIds).toEqual([]);
  });

  it("엔진 1종만 128 B를 초기 번들에 누수해도 즉시 실패하며 정확한 ID와 바이트를 지목한다", () => {
    const scenario = createSample100EngineTelemetryScenario();
    const mutated = scenario.entries.map((entry, idx) =>
      idx === 42 ? { ...entry, eagerBundleBytes: 128 } : entry,
    );
    const leakedId = scenario.entries[42]?.engineId ?? "";
    const audit = auditZeroEagerBundleInvariant(mutated);
    expect(audit.compliant).toBe(false);
    expect(audit.leakingEngineCount).toBe(1);
    expect(audit.totalEagerLeakBytes).toBe(128);
    expect(audit.totalEagerLeakKib).toBe(0.125);
    expect(audit.offendingEngineIds).toEqual([leakedId]);
  });

  it("복수 누수 엔진을 누수 크기 내림차순·ID 오름차순으로 정렬한다", () => {
    const entries = [
      makeEntry({ engineId: "eng-b", eagerBundleBytes: 512 }),
      makeEntry({ engineId: "eng-a", eagerBundleBytes: 512 }),
      makeEntry({ engineId: "eng-c", eagerBundleBytes: 2048 }),
      makeEntry({ engineId: "eng-clean", eagerBundleBytes: 0 }),
    ];
    const audit = auditZeroEagerBundleInvariant(entries);
    expect(audit.compliant).toBe(false);
    expect(audit.totalEagerLeakBytes).toBe(3072);
    expect(audit.totalEagerLeakKib).toBe(3);
    expect(audit.offendingEngineIds).toEqual(["eng-c", "eng-a", "eng-b"]);
  });

  it("명시적 허용 바이트 상한(maxAllowedBytes)을 존중한다", () => {
    const entries = [makeEntry({ engineId: "eng-a", eagerBundleBytes: 256 })];
    expect(auditZeroEagerBundleInvariant(entries, 0).compliant).toBe(false);
    expect(auditZeroEagerBundleInvariant(entries, 256).compliant).toBe(true);
  });

  it("빈 엔진 목록은 누수 0건으로 통과한다", () => {
    const audit = auditZeroEagerBundleInvariant([]);
    expect(audit.compliant).toBe(true);
    expect(audit.totalEngineCount).toBe(0);
    expect(audit.totalEagerLeakBytes).toBe(0);
  });
});

describe("Wave 160 로버스트 MAD 이상치 탐지기 (detectColdStartOutliers)", () => {
  it("3~12ms 정상 엔진 100종 사이 주입된 250ms 스파이크만 정확히 탐지한다", () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ engineId: `fast-${String(i).padStart(3, "0")}`, coldStartMs: 3 + (i % 10) }),
    );
    entries.push(makeEntry({ engineId: "spike-250ms", coldStartMs: 250 }));

    const report = detectColdStartOutliers(entries);
    expect(report.zeroMadFallbackUsed).toBe(false);
    expect(report.outliers).toHaveLength(1);
    expect(report.outliers[0]?.engineId).toBe("spike-250ms");
    expect(report.outliers[0]?.severity).toBe("critical");
    expect(report.outliers[0]?.modifiedZScore).toBeGreaterThan(20);
  });

  it("복수 스파이크에서 warn과 critical 심각도를 정확히 구분한다", () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      makeEntry({ engineId: `norm-${i}`, coldStartMs: 6 + (i % 5) }),
    );
    entries.push(makeEntry({ engineId: "warn-spike", coldStartMs: 15 }));
    entries.push(makeEntry({ engineId: "crit-spike", coldStartMs: 40 }));

    const report = detectColdStartOutliers(entries);
    expect(report.outliers.map((o) => o.engineId)).toEqual(["crit-spike", "warn-spike"]);
    expect(report.outliers[0]?.severity).toBe("critical");
    expect(report.outliers[1]?.severity).toBe("warn");
  });

  it("모든 엔진이 동일한 균일 분포(MAD=0, MeanAD=0)에서 NaN 없이 0건을 반환한다", () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ engineId: `uniform-${i}`, coldStartMs: 8 }),
    );
    const report = detectColdStartOutliers(entries);
    expect(report.madMs).toBe(0);
    expect(report.zeroMadFallbackUsed).toBe(true);
    expect(report.outliers).toEqual([]);
  });

  it("과반수가 동일값(MAD=0)이어도 MeanAD 폴백으로 250ms 단일 스파이크를 포착한다", () => {
    const entries = Array.from({ length: 60 }, (_, i) =>
      makeEntry({ engineId: `flat-${i}`, coldStartMs: 5 }),
    );
    entries.push(makeEntry({ engineId: "flat-spike", coldStartMs: 250 }));

    const report = detectColdStartOutliers(entries);
    expect(report.madMs).toBe(0);
    expect(report.zeroMadFallbackUsed).toBe(true);
    expect(report.outliers.map((o) => o.engineId)).toEqual(["flat-spike"]);
  });

  it("중앙값보다 훨씬 빠른 초저지연 엔진은 회귀 스파이크로 오탐하지 않는다", () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ engineId: `base-${i}`, coldStartMs: 10 + (i % 3) }),
    );
    entries.push(makeEntry({ engineId: "ultra-fast", coldStartMs: 0.2 }));
    expect(detectColdStartOutliers(entries).outliers).toEqual([]);
  });

  it("빈 입력에서 안전하게 0 통계를 반환한다", () => {
    const report = detectColdStartOutliers([]);
    expect(report.medianMs).toBe(0);
    expect(report.madMs).toBe(0);
    expect(report.outliers).toEqual([]);
  });
});

describe("Wave 160 프레임 예산 위상 정렬 워밍업 플래너 (planFrameBudgetWarmupWaves)", () => {
  it("다단계 의존성 DAG의 선행 순서를 엄격히 보장한다", () => {
    const entries = [
      makeEntry({ engineId: "leaf", coldStartMs: 4, dependencies: ["mid-a", "mid-b"] }),
      makeEntry({ engineId: "mid-b", coldStartMs: 5, dependencies: ["root"] }),
      makeEntry({ engineId: "mid-a", coldStartMs: 4, dependencies: ["root"] }),
      makeEntry({ engineId: "root", coldStartMs: 5, dependencies: [] }),
    ];
    const plan = planFrameBudgetWarmupWaves(entries, { frameBudgetMs: 16.67, maxConcurrency: 4 });
    expect(plan.hasCycle).toBe(false);
    expect(plan.totalScheduledEngines).toBe(4);
    const pos = new Map<string, number>(plan.topologicalOrder.map((id, idx) => [id, idx]));
    expect(pos.get("root") ?? 99).toBeLessThan(pos.get("mid-a") ?? -1);
    expect(pos.get("root") ?? 99).toBeLessThan(pos.get("mid-b") ?? -1);
    expect(pos.get("mid-a") ?? 99).toBeLessThan(pos.get("leaf") ?? -1);
    expect(pos.get("mid-b") ?? 99).toBeLessThan(pos.get("leaf") ?? -1);
  });

  it("어느 병렬 배치에서도 설정된 maxConcurrency를 초과하지 않는다", () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      makeEntry({ engineId: `indep-${i}`, coldStartMs: 5 }),
    );
    const plan = planFrameBudgetWarmupWaves(entries, { frameBudgetMs: 16.67, maxConcurrency: 3 });
    expect(plan.totalScheduledEngines).toBe(12);
    for (const wave of plan.waves) {
      expect(wave.peakConcurrency).toBeLessThanOrEqual(3);
      for (const batch of wave.batches) {
        expect(batch.length).toBeLessThanOrEqual(3);
      }
      expect(wave.estimatedFrameMs).toBeLessThanOrEqual(16.67);
    }
  });

  it("16.67ms 프레임 예산을 넘으면 다음 프레임 슬라이스로 분할 배치한다", () => {
    const entries = [
      makeEntry({ engineId: "a", coldStartMs: 10 }),
      makeEntry({ engineId: "b", coldStartMs: 10 }),
      makeEntry({ engineId: "c", coldStartMs: 10, dependencies: ["a"] }),
      makeEntry({ engineId: "d", coldStartMs: 10, dependencies: ["b"] }),
    ];
    const plan = planFrameBudgetWarmupWaves(entries, { frameBudgetMs: 16.67, maxConcurrency: 2 });
    expect(plan.totalFrames).toBe(2);
    expect(plan.waves[0]?.estimatedFrameMs).toBeLessThanOrEqual(16.67);
    expect(plan.waves[1]?.estimatedFrameMs).toBeLessThanOrEqual(16.67);
  });

  it("120Hz(8.33ms) 같은 커스텀 프레임 예산을 정확히 적용한다", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ engineId: `e-${i}`, coldStartMs: 5 }),
    );
    const plan = planFrameBudgetWarmupWaves(entries, { frameBudgetMs: 8.33, maxConcurrency: 2 });
    expect(plan.frameBudgetMs).toBe(8.33);
    expect(plan.totalFrames).toBe(3);
    for (const wave of plan.waves) {
      expect(wave.estimatedFrameMs).toBeLessThanOrEqual(8.33);
      expect(wave.exceedsFrameBudget).toBe(false);
    }
  });

  it("3노드 순환 의존성 그래프를 결정적으로 감지해 cycleEngineIds에 보고한다", () => {
    const entries = [
      makeEntry({ engineId: "ok-root", dependencies: [] }),
      makeEntry({ engineId: "cyc-a", dependencies: ["cyc-c"] }),
      makeEntry({ engineId: "cyc-b", dependencies: ["cyc-a"] }),
      makeEntry({ engineId: "cyc-c", dependencies: ["cyc-b"] }),
    ];
    const plan = planFrameBudgetWarmupWaves(entries);
    expect(plan.hasCycle).toBe(true);
    expect(plan.cycleEngineIds).toEqual(["cyc-a", "cyc-b", "cyc-c"]);
    expect(plan.totalScheduledEngines).toBe(1);
    expect(plan.topologicalOrder).toEqual(["ok-root"]);
  });

  it("순환 핵심 노드와 순환으로 차단된 하류 노드 및 자기 루프를 구분한다", () => {
    const entries = [
      makeEntry({ engineId: "loop-a", dependencies: ["loop-b"] }),
      makeEntry({ engineId: "loop-b", dependencies: ["loop-a"] }),
      makeEntry({ engineId: "downstream", dependencies: ["loop-a"] }),
      makeEntry({ engineId: "self-loop", dependencies: ["self-loop"] }),
    ];
    const plan = planFrameBudgetWarmupWaves(entries);
    expect(plan.hasCycle).toBe(true);
    expect(plan.cycleEngineIds).toEqual(["loop-a", "loop-b", "self-loop"]);
    expect(plan.blockedByCycleEngineIds).toEqual(["downstream"]);
  });

  it("프레임 예산 초과 단일 엔진은 단독 프레임으로 전진하며 미등록 의존성을 보고한다", () => {
    const entries = [
      makeEntry({ engineId: "heavy-engine", coldStartMs: 24, dependencies: ["ghost-dep"] }),
    ];
    const plan = planFrameBudgetWarmupWaves(entries, { frameBudgetMs: 16.67 });
    expect(plan.totalScheduledEngines).toBe(1);
    expect(plan.waves[0]?.exceedsFrameBudget).toBe(true);
    expect(plan.waves[0]?.estimatedFrameMs).toBe(24);
    expect(plan.missingDependencyRefs).toEqual([
      { engineId: "heavy-engine", missingDependencyId: "ghost-dep" },
    ]);
  });
});

describe("Wave 160 듀얼 풀 메모리 예산 거버너 (memory-budget-governor)", () => {
  it("4개 기기 등급 프리셋의 WASM64·VRAM 예산이 계단식으로 확장된다", () => {
    const m = resolveDeviceMemoryBudget("mobile-4gb");
    const t = resolveDeviceMemoryBudget("tablet-8gb");
    const d = resolveDeviceMemoryBudget("desktop-16gb");
    const w = resolveDeviceMemoryBudget("workstation-32gb");
    expect(m.wasmHeapBudgetBytes).toBeLessThan(t.wasmHeapBudgetBytes);
    expect(t.wasmHeapBudgetBytes).toBeLessThan(d.wasmHeapBudgetBytes);
    expect(d.wasmHeapBudgetBytes).toBeLessThan(w.wasmHeapBudgetBytes);
    expect(m.vramBudgetBytes).toBeLessThan(t.vramBudgetBytes);
    expect(t.vramBudgetBytes).toBeLessThan(d.vramBudgetBytes);
    expect(d.vramBudgetBytes).toBeLessThan(w.vramBudgetBytes);
  });

  it("두 풀 모두 목표 수위(75%) 이하이면 0건 조치로 유지한다", () => {
    const entries = [
      makeEntry({ engineId: "a", wasmHeapBytes: 50 * MIB, vramBytes: 40 * MIB }),
      makeEntry({ engineId: "b", wasmHeapBytes: 40 * MIB, vramBytes: 30 * MIB }),
    ];
    const plan = planDualPoolMemoryGovernance(entries, { deviceTier: "mobile-4gb", nowMs: BASE_NOW_MS });
    expect(plan.before.pressureLevel).toBe("healthy");
    expect(plan.actions).toEqual([]);
    expect(plan.budgetSatisfied).toBe(true);
    expect(plan.cannotSatisfyBudget).toBe(false);
  });

  it("VRAM 단독 압력은 모듈 언로드 없이 evict-vram-cache만으로 해소한다", () => {
    const entries = [
      makeEntry({ engineId: "vram-1", wasmHeapBytes: 20 * MIB, vramBytes: 120 * MIB, lastUsedMs: BASE_NOW_MS - 300000 }),
      makeEntry({ engineId: "vram-2", wasmHeapBytes: 20 * MIB, vramBytes: 120 * MIB, lastUsedMs: BASE_NOW_MS - 120000 }),
    ];
    const plan = planDualPoolMemoryGovernance(entries, { deviceTier: "mobile-4gb", nowMs: BASE_NOW_MS });
    expect(plan.budgetSatisfied).toBe(true);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.every((a) => a.action === "evict-vram-cache")).toBe(true);
    expect(plan.after.vramUtilizationRatio).toBeLessThanOrEqual(0.75);
    expect(plan.totalReclaimedWasmHeapBytes).toBe(0);
  });

  it("WASM64 단독 압력은 언로드 전에 demote-wasm-snapshot으로 우선 해소한다", () => {
    const entries = [
      makeEntry({ engineId: "wasm-1", wasmHeapBytes: 180 * MIB, vramBytes: 20 * MIB, lastUsedMs: BASE_NOW_MS - 600000 }),
      makeEntry({ engineId: "wasm-2", wasmHeapBytes: 160 * MIB, vramBytes: 20 * MIB, lastUsedMs: BASE_NOW_MS - 30000 }),
    ];
    const plan = planDualPoolMemoryGovernance(entries, { deviceTier: "mobile-4gb", nowMs: BASE_NOW_MS });
    expect(plan.budgetSatisfied).toBe(true);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.every((a) => a.action === "demote-wasm-snapshot")).toBe(true);
    expect(plan.after.wasmHeapUtilizationRatio).toBeLessThanOrEqual(0.75);
  });

  it("mobile-4gb 95% 초과 긴급 압력에서도 pinned·critical 엔진을 100% 보호하며 75% 이하로 복구한다", () => {
    const scenario = createSample100EngineTelemetryScenario({ deviceTier: "mobile-4gb" });
    const plan = planDualPoolMemoryGovernance(scenario.entries, { deviceTier: "mobile-4gb", nowMs: scenario.nowMs });
    expect(plan.before.pressureLevel).toBe("emergency");
    expect(plan.budgetSatisfied).toBe(true);
    expect(plan.cannotSatisfyBudget).toBe(false);
    expect(plan.after.wasmHeapUtilizationRatio).toBeLessThanOrEqual(0.75);
    expect(plan.after.vramUtilizationRatio).toBeLessThanOrEqual(0.75);

    const protectedSet = new Set<string>(plan.protectedEngineIds);
    expect(protectedSet.size).toBe(6);
    for (const action of plan.actions) {
      expect(protectedSet.has(action.engineId)).toBe(false);
    }
  });

  it("오래 미사용한 background 엔진을 최근 사용한 high 엔진보다 먼저 강등한다", () => {
    const entries = [
      makeEntry({ engineId: "recent-high", priorityTier: "high", wasmHeapBytes: 180 * MIB, vramBytes: 10 * MIB, lastUsedMs: BASE_NOW_MS - 1000, coldStartMs: 12 }),
      makeEntry({ engineId: "stale-bg", priorityTier: "background", wasmHeapBytes: 180 * MIB, vramBytes: 10 * MIB, lastUsedMs: BASE_NOW_MS - 3600000, coldStartMs: 5 }),
    ];
    const plan = planDualPoolMemoryGovernance(entries, { deviceTier: "mobile-4gb", nowMs: BASE_NOW_MS });
    expect(plan.actions[0]?.engineId).toBe("stale-bg");
  });

  it("회수 전후 바이트 보존 법칙(before - reclaimed === after)을 정확히 만족한다", () => {
    const scenario = createSample100EngineTelemetryScenario({ deviceTier: "tablet-8gb" });
    const plan = planDualPoolMemoryGovernance(scenario.entries, { deviceTier: "tablet-8gb", nowMs: scenario.nowMs });
    expect(plan.before.wasmHeapBytes - plan.totalReclaimedWasmHeapBytes).toBe(plan.after.wasmHeapBytes);
    expect(plan.before.vramBytes - plan.totalReclaimedVramBytes).toBe(plan.after.vramBytes);
  });

  it("pinned/critical 상주량만으로 예산 초과 시 cannotSatisfyBudget: true와 한글 복구 권고를 출력한다", () => {
    const entries = [
      makeEntry({ engineId: "pin-giant-a", priorityTier: "critical", pinned: true, wasmHeapBytes: 220 * MIB, vramBytes: 150 * MIB }),
      makeEntry({ engineId: "pin-giant-b", priorityTier: "high", pinned: true, wasmHeapBytes: 150 * MIB, vramBytes: 120 * MIB }),
      makeEntry({ engineId: "evictable-c", wasmHeapBytes: 40 * MIB, vramBytes: 30 * MIB }),
    ];
    const plan = planDualPoolMemoryGovernance(entries, { deviceTier: "mobile-4gb", nowMs: BASE_NOW_MS });
    expect(plan.budgetSatisfied).toBe(false);
    expect(plan.cannotSatisfyBudget).toBe(true);
    expect(plan.actions.every((a) => a.engineId === "evictable-c")).toBe(true);
    expect(plan.recoveryRecommendationsKo.length).toBeGreaterThanOrEqual(2);
    expect(plan.recoveryRecommendationsKo.join(" ")).toContain("pin-giant-a");
  });

  it("targetUtilizationRatio와 예산 오버라이드를 정확히 반영한다", () => {
    const entries = [makeEntry({ engineId: "e1", wasmHeapBytes: 80 * MIB, vramBytes: 80 * MIB })];
    const plan = planDualPoolMemoryGovernance(entries, {
      deviceTier: "desktop-16gb",
      targetUtilizationRatio: 0.5,
      wasmHeapBudgetBytesOverride: 100 * MIB,
      vramBudgetBytesOverride: 100 * MIB,
      nowMs: BASE_NOW_MS,
    });
    expect(plan.targetUtilizationRatio).toBe(0.5);
    expect(plan.after.wasmHeapUtilizationRatio).toBeLessThanOrEqual(0.5);
    expect(plan.after.vramUtilizationRatio).toBeLessThanOrEqual(0.5);
  });

  it("입력 배열 순서를 뒤섞어도 완전히 동일한 결정적 조치 계획을 산출한다", () => {
    const scenario = createSample100EngineTelemetryScenario({ deviceTier: "mobile-4gb" });
    const planA = planDualPoolMemoryGovernance(scenario.entries, { deviceTier: "mobile-4gb", nowMs: scenario.nowMs });
    const planB = planDualPoolMemoryGovernance(scenario.entries.slice().reverse(), { deviceTier: "mobile-4gb", nowMs: scenario.nowMs });
    expect(planB.actions).toEqual(planA.actions);
    expect(planB.after).toEqual(planA.after);
  });
});

describe("Wave 160 FIPS 180-4 SHA-256 및 지문 결정성 (telemetry-report-and-svg)", () => {
  it('FIPS 180-4 표준 벡터 "" 해시와 정확히 일치한다', () => {
    expect(sha256TelemetryHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('FIPS 180-4 표준 벡터 "abc" 해시와 정확히 일치한다', () => {
    expect(sha256TelemetryHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("멀티 블록 표준 벡터와 한글 UTF-8 문자열을 정확히 해시한다", () => {
    expect(sha256TelemetryHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256TelemetryHex("툰스튜디오-웨이브160-텔레메트리")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("엔진 순서가 달라져도 동일한 거버넌스 SHA-256 지문을 생성한다", () => {
    const scenario = createSample100EngineTelemetryScenario();
    const repA = runStudio100EngineTelemetryGovernor(scenario);
    const repB = runStudio100EngineTelemetryGovernor({
      ...scenario,
      entries: scenario.entries.slice().reverse(),
    });
    expect(repA.fingerprintSha256).toBe(repB.fingerprintSha256);
    expect(repA.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("단일 엔진 지표가 1ms만 바뀌어도 거버넌스 지문이 즉시 달라진다", () => {
    const scenario = createSample100EngineTelemetryScenario();
    const repA = runStudio100EngineTelemetryGovernor(scenario);
    const repB = runStudio100EngineTelemetryGovernor({
      ...scenario,
      entries: scenario.entries.map((entry, idx) =>
        idx === 10 ? { ...entry, coldStartMs: entry.coldStartMs + 1 } : entry,
      ),
    });
    expect(repA.fingerprintSha256).not.toBe(repB.fingerprintSha256);

    const directHash = computeTelemetryGovernanceFingerprint({
      scenarioName: repA.scenarioName,
      status: repA.status,
      entries: scenario.entries,
      coldStartPercentiles: repA.coldStartPercentiles,
      warmInvokePercentiles: repA.warmInvokePercentiles,
      eagerBundleAudit: repA.eagerBundleAudit,
      coldStartOutliers: repA.coldStartOutliers,
      warmupPlan: repA.warmupPlan,
      memoryGovernance: repA.memoryGovernance,
      slaCompliance: repA.slaCompliance,
    });
    expect(directHash).toBe(repA.fingerprintSha256);
  });
});

describe("Wave 160 순수 OKLCH SVG 대시보드 및 한국어 QA 요약", () => {
  it("SVG가 <svg와 oklch(를 포함하고 원시 hex·rgb·hsl 색상을 전혀 쓰지 않는다", () => {
    const svg = runStudio100EngineTelemetryGovernor(createSample100EngineTelemetryScenario()).dashboardSvg;
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg.toLowerCase()).not.toContain("rgb(");
    expect(svg.toLowerCase()).not.toContain("hsl(");
  });

  it("빈 시나리오나 극단값에서도 SVG에 NaN이나 Infinity가 나타나지 않는다", () => {
    const report = runStudio100EngineTelemetryGovernor({
      deviceTier: "mobile-4gb",
      entries: [],
      scenarioName: "빈 시나리오 점검",
    });
    expect(report.dashboardSvg).not.toContain("NaN");
    expect(report.dashboardSvg).not.toContain("Infinity");
  });

  it("시나리오 이름의 특수문자를 XML 엔티티로 안전하게 이스케이프한다", () => {
    const unsafeName = `Hub <script> & "test" 'quote'`;
    const escaped = escapeSvgXml(unsafeName);
    expect(escaped).toBe("Hub &lt;script&gt; &amp; &quot;test&quot; &apos;quote&apos;");
    const report = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ scenarioName: unsafeName }),
    );
    expect(report.dashboardSvg).toContain(escaped);
    expect(report.dashboardSvg).not.toContain("<script>");
  });

  it("PASS/WARN/FAIL 한국어 QA 요약이 자연스러운 한글로 판정과 근거를 전달한다", () => {
    const passReport = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ deviceTier: "desktop-16gb" }),
    );
    const warnReport = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ deviceTier: "mobile-4gb" }),
    );
    const leaked = createSample100EngineTelemetryScenario();
    const failReport = runStudio100EngineTelemetryGovernor({
      ...leaked,
      entries: leaked.entries.map((e, idx) => (idx === 0 ? { ...e, eagerBundleBytes: 256 } : e)),
    });

    expect(passReport.summaryKo).toContain("[PASS (정상)]");
    expect(warnReport.summaryKo).toContain("[WARN (주의)]");
    expect(failReport.summaryKo).toContain("[FAIL (차단)]");
    expect(passReport.summaryKo).not.toContain("가능하게 합니다");
    expect(passReport.summaryKo).not.toContain("제공합니다");
    expect(summarizeTelemetryGovernorKo(passReport)).toBe(passReport.summaryKo);
  });

  it("SVG가 0.0 KiB 준수 배지와 누수 KiB 경고 배지를 정확히 전환한다", () => {
    const clean = runStudio100EngineTelemetryGovernor(createSample100EngineTelemetryScenario());
    expect(clean.dashboardSvg).toContain("0.0 KiB 준수");

    const base = createSample100EngineTelemetryScenario();
    const leaky = runStudio100EngineTelemetryGovernor({
      ...base,
      entries: base.entries.map((e, i) => (i === 5 ? { ...e, eagerBundleBytes: 2048 } : e)),
    });
    expect(renderStudioTelemetryGovernorSvg(leaky)).toContain("2.0 KiB 누수 (1종)");
  });
});

describe("Wave 160 통합 103종 엔진 오케스트레이터 (runStudio100EngineTelemetryGovernor)", () => {
  it("기본 103종 시나리오(Wave 37~164)가 desktop-16gb에서 0.0 KiB 누수·PASS로 완료된다", () => {
    const report = runStudio100EngineTelemetryGovernor(createSample100EngineTelemetryScenario());
    expect(report.engineCount).toBe(103);
    expect(report.waveRange).toEqual({ minWave: 37, maxWave: 164 });
    expect(report.status).toBe("PASS");
    expect(report.eagerBundleAudit.compliant).toBe(true);
    expect(report.eagerBundleAudit.totalEagerLeakBytes).toBe(0);
    expect(report.warmupPlan.hasCycle).toBe(false);
    expect(report.warmupPlan.totalScheduledEngines).toBe(103);
    expect(report.memoryGovernance.budgetSatisfied).toBe(true);
    expect(report.slaCompliance.violationsKo).toEqual([]);
  });

  it("103종 시나리오를 mobile-4gb에서 실행하면 보호 6종을 유지하며 75% 이하로 회수한다", () => {
    const report = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ deviceTier: "mobile-4gb" }),
    );
    expect(report.status).toBe("WARN");
    expect(report.memoryGovernance.budgetSatisfied).toBe(true);
    expect(report.memoryGovernance.cannotSatisfyBudget).toBe(false);
    expect(report.memoryGovernance.protectedEngineIds).toHaveLength(6);
    expect(report.memoryGovernance.after.wasmHeapUtilizationRatio).toBeLessThanOrEqual(0.75);
    expect(report.memoryGovernance.after.vramUtilizationRatio).toBeLessThanOrEqual(0.75);
  });

  it("103종 시나리오가 tablet-8gb와 workstation-32gb에서도 유효한 거버넌스 계획을 만든다", () => {
    const tablet = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ deviceTier: "tablet-8gb" }),
    );
    const workstation = runStudio100EngineTelemetryGovernor(
      createSample100EngineTelemetryScenario({ deviceTier: "workstation-32gb" }),
    );
    expect(tablet.memoryGovernance.budgetSatisfied).toBe(true);
    expect(tablet.memoryGovernance.actions.length).toBeGreaterThan(0);
    expect(workstation.status).toBe("PASS");
    expect(workstation.memoryGovernance.actions).toHaveLength(0);
  });

  it("103종 중 1종에 128 B 초기 번들 누수가 생기면 통합 판정이 FAIL로 전환된다", () => {
    const scenario = createSample100EngineTelemetryScenario();
    const report = runStudio100EngineTelemetryGovernor({
      ...scenario,
      entries: scenario.entries.map((entry, idx) =>
        idx === 77 ? { ...entry, eagerBundleBytes: 128 } : entry,
      ),
    });
    expect(report.status).toBe("FAIL");
    expect(report.slaCompliance.zeroEagerBundlePass).toBe(false);
    expect(report.slaCompliance.violationsKo.join(" ")).toContain("128 B");
  });

  it("순환 의존성 또는 고정 엔진 OOM이 발생하면 통합 판정이 FAIL과 복구 안내를 출력한다", () => {
    const cyclicReport = runStudio100EngineTelemetryGovernor({
      deviceTier: "desktop-16gb",
      entries: [
        makeEntry({ engineId: "c1", dependencies: ["c2"] }),
        makeEntry({ engineId: "c2", dependencies: ["c1"] }),
      ],
    });
    expect(cyclicReport.status).toBe("FAIL");
    expect(cyclicReport.slaCompliance.warmupAcyclicPass).toBe(false);

    const oomReport = runStudio100EngineTelemetryGovernor({
      deviceTier: "mobile-4gb",
      entries: [
        makeEntry({ engineId: "critical-oom", priorityTier: "critical", pinned: true, wasmHeapBytes: 360 * MIB, vramBytes: 240 * MIB }),
      ],
    });
    expect(oomReport.status).toBe("FAIL");
    expect(oomReport.slaCompliance.memoryBudgetPass).toBe(false);
    expect(oomReport.memoryGovernance.cannotSatisfyBudget).toBe(true);
    expect(oomReport.summaryKo).toContain("복구 안내");
  });
});
