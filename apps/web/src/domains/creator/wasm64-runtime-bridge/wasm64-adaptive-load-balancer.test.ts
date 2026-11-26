import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_TASK_KINDS,
  FRAME_BUDGET_120HZ_MS,
  FRAME_BUDGET_60HZ_MS,
  Wasm64AdaptiveLoadBalancer,
  createWasm64AdaptiveLoadBalancer,
  type HardwareCapabilityProfile,
} from "./wasm64-adaptive-load-balancer";

const FULL_CAPABILITIES: HardwareCapabilityProfile = {
  webnnNpu: true,
  webgpuCompute: true,
  wasmRelaxedSimd: true,
  wasmSimd128: true,
  gpuDeviceLost: false,
};

describe("Wasm64AdaptiveLoadBalancer", () => {
  it("전체 하드웨어 프로파일에서 5개 작업 유형을 최적 이기종 가속기로 라우팅한다", () => {
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_120HZ_MS,
      capabilities: FULL_CAPABILITIES,
      now: () => 1_000,
    });

    expect(balancer.route("small-tile-filter")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "optimal-affinity",
      downgraded: false,
      avoidedFrameDrop: false,
    });
    expect(balancer.route("8k-full-filter")).toMatchObject({
      accelerator: "webgpu-compute",
      reason: "optimal-affinity",
      downgraded: false,
    });
    expect(balancer.route("3d-lt-contour")).toMatchObject({
      accelerator: "webgpu-compute",
      reason: "optimal-affinity",
    });
    expect(balancer.route("ai-lineart-upscale")).toMatchObject({
      accelerator: "webnn-npu",
      reason: "optimal-affinity",
    });
    expect(balancer.route("brush-stamp")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "optimal-affinity",
    });

    const telemetry = balancer.getTelemetry();
    expect(telemetry.routeDecisions).toBe(5);
    expect(telemetry.thermalDowngrades).toBe(0);
    expect(telemetry.frameDropAvoidedCount).toBe(0);
    expect(telemetry.budgetMs).toBe(FRAME_BUDGET_120HZ_MS);
    expect(telemetry.routeCountsByAccelerator["webnn-npu"]).toBe(1);
    expect(telemetry.routeCountsByAccelerator["webgpu-compute"]).toBe(2);
    expect(telemetry.routeCountsByAccelerator["wasm-relaxed-simd"]).toBe(2);
  });

  it("하드웨어 기능이 비활성화되면 지원 계층(SIMD128 → JS 폴백)으로 안전하게 폴백한다", () => {
    const simdOnly = new Wasm64AdaptiveLoadBalancer({
      capabilities: {
        webnnNpu: false,
        webgpuCompute: false,
        wasmRelaxedSimd: false,
        wasmSimd128: true,
      },
    });
    for (const task of ADAPTIVE_TASK_KINDS) {
      const decision = simdOnly.route(task);
      expect(decision.accelerator).toBe("wasm-simd128");
      expect(decision.reason).toBe("capability-fallback");
      expect(decision.downgraded).toBe(false);
    }

    const jsOnly = new Wasm64AdaptiveLoadBalancer({
      capabilities: {
        webnnNpu: false,
        webgpuCompute: false,
        wasmRelaxedSimd: false,
        wasmSimd128: false,
      },
    });
    expect(jsOnly.route("ai-lineart-upscale").accelerator).toBe("js-fallback");
    expect(jsOnly.route("brush-stamp").accelerator).toBe("js-fallback");
  });

  it("실행 중 경합(in-flight·busy ratio)이 있는 가속기를 피해 비경합 최속 가속기로 우회한다", () => {
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_60HZ_MS,
      capabilities: FULL_CAPABILITIES,
      now: () => 2_000,
    });

    balancer.acquire("webgpu-compute");
    const offloaded = balancer.route("3d-lt-contour");
    expect(offloaded.accelerator).toBe("wasm-relaxed-simd");
    expect(offloaded.reason).toBe("contention-offload");
    expect(offloaded.downgraded).toBe(true);
    expect(offloaded.avoidedFrameDrop).toBe(true);

    // 경합 해제 즉시 다시 최적 가속기 활용
    balancer.release("webgpu-compute");
    balancer.release("webgpu-compute"); // 0 미만으로 내려가지 않음
    expect(balancer.route("3d-lt-contour")).toMatchObject({
      accelerator: "webgpu-compute",
      reason: "optimal-affinity",
    });

    // CPU 포화 시 small-tile-filter가 비경합 WebGPU로 오프로드
    balancer.recordFrame({ frameMs: 6.0, cpuBusyRatio: 0.93, gpuBusyRatio: 0.2 });
    const cpuOffload = balancer.route("small-tile-filter");
    expect(cpuOffload.accelerator).toBe("webgpu-compute");
    expect(cpuOffload.reason).toBe("contention-offload");

    // 모든 가속기가 경합 중이어도 예외 없이 최소 부하 가속기로 라우팅
    const saturated = balancer.route("8k-full-filter", {
      contendingAccelerators: ["webgpu-compute", "wasm-relaxed-simd", "wasm-simd128"],
    });
    expect(saturated.reason).toBe("contention-offload");
    expect(saturated.accelerator).toBe("webgpu-compute");
    expect(balancer.getTelemetry().frameDropAvoidedCount).toBe(3);
  });

  it("열 압박·메모리 압박·GPU 디바이스 유실 시 0-프레임 지연으로 즉시 강등한다", () => {
    let clockMs = 10_000;
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_120HZ_MS,
      capabilities: FULL_CAPABILITIES,
      now: () => clockMs,
    });

    expect(balancer.route("8k-full-filter").accelerator).toBe("webgpu-compute");

    // serious 열 압박: WebGPU 즉시 차단, WebNN NPU는 유지
    balancer.updatePressure({ thermal: "serious" });
    const thermal8k = balancer.route("8k-full-filter");
    expect(thermal8k.accelerator).toBe("wasm-relaxed-simd");
    expect(thermal8k.reason).toBe("thermal-downgrade");
    expect(thermal8k.avoidedFrameDrop).toBe(true);
    expect(balancer.route("ai-lineart-upscale").accelerator).toBe("webnn-npu");

    // critical 열 압박: WebGPU + WebNN 모두 즉시 차단
    balancer.updatePressure({ thermal: "critical" });
    const thermalAi = balancer.route("ai-lineart-upscale");
    expect(thermalAi.accelerator).toBe("wasm-relaxed-simd");
    expect(thermalAi.reason).toBe("thermal-downgrade");
    expect(balancer.getTelemetry().thermalDowngrades).toBe(2);

    // 열 해소 후 GPU 디바이스 유실 발생 시 즉시 강등
    balancer.updatePressure({ thermal: "nominal", gpuDeviceLost: true });
    const lost = balancer.route("3d-lt-contour");
    expect(lost.accelerator).toBe("wasm-relaxed-simd");
    expect(lost.reason).toBe("gpu-device-lost");

    // 메모리 압박(moderate -> 8K만 GPU 회피, critical -> GPU+NPU 회피)
    balancer.updatePressure({ gpuDeviceLost: false, memory: "moderate" });
    expect(balancer.route("8k-full-filter")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "memory-pressure-downgrade",
    });
    balancer.updatePressure({ memory: "critical" });
    expect(balancer.route("ai-lineart-upscale")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "memory-pressure-downgrade",
    });
    clockMs += 100;
    expect(balancer.getTelemetry().frameDropAvoidedCount).toBe(5);
  });

  it("프레임 드롭 스파이크 즉시 강등 후 히스테리시스로 스래싱 없이 안정 복귀한다", () => {
    let clockMs = 5_000;
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_120HZ_MS,
      capabilities: FULL_CAPABILITIES,
      hysteresisUpgradeFrames: 6,
      hysteresisCooldownMs: 500,
      now: () => clockMs,
    });

    // 정상 120Hz 프레임 안정화
    for (let i = 0; i < 6; i += 1) {
      clockMs += 8;
      balancer.recordFrame({ frameMs: 5.0, accelerator: "webgpu-compute" });
    }
    expect(balancer.route("8k-full-filter").accelerator).toBe("webgpu-compute");

    // 단일 프레임 스파이크(14.8ms > 8.33 * 1.35) 발생 -> 즉시 강등
    clockMs += 15;
    balancer.recordFrame({ frameMs: 14.8, accelerator: "webgpu-compute" });
    const spiked = balancer.route("8k-full-filter");
    expect(spiked.accelerator).toBe("wasm-relaxed-simd");
    expect(spiked.reason).toBe("frame-spike-downgrade");
    expect(spiked.avoidedFrameDrop).toBe(true);

    // 스파이크/정상 교대 진동 20프레임 동안 단 1회도 GPU로 스래싱하지 않음
    const decisionsDuringOscillation: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      clockMs += 20;
      balancer.recordFrame({
        frameMs: i % 2 === 0 ? 4.5 : 13.5,
        accelerator: "webgpu-compute",
      });
      decisionsDuringOscillation.push(balancer.route("8k-full-filter").accelerator);
    }
    expect(decisionsDuringOscillation.every((acc) => acc === "wasm-relaxed-simd")).toBe(true);

    // 짧은 정상 프레임(쿨다운 미충족)에서는 히스테리시스 유지
    balancer.updatePressure({ thermal: "nominal" });
    for (let i = 0; i < 4; i += 1) {
      clockMs += 8;
      balancer.recordFrame({ frameMs: 4.0 });
    }
    expect(balancer.route("8k-full-filter").accelerator).toBe("wasm-relaxed-simd");

    // 쿨다운(500ms) + 연속 정상 프레임(6회) + EMA 회복 후 원활히 승격
    for (let i = 0; i < 12; i += 1) {
      clockMs += 60;
      balancer.recordFrame({ frameMs: 4.0 });
    }
    const recovered = balancer.route("8k-full-filter");
    expect(recovered.accelerator).toBe("webgpu-compute");
    expect(recovered.reason).toBe("optimal-affinity");
  });

  it("롤링 EMA·P95 텔레메트리 정확도와 60Hz→120Hz 예산 전환, 잘못된 입력 무시, reset을 검증한다", () => {
    let clockMs = 1_000;
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_60HZ_MS,
      windowSize: 20,
      capabilities: FULL_CAPABILITIES,
      now: () => clockMs,
    });

    // 1..20ms 20개 샘플 입력 -> P95는 19번째 값(19ms)
    for (let ms = 1; ms <= 20; ms += 1) {
      clockMs += 16;
      balancer.recordFrame(ms);
    }
    // 비정상 입력은 무시
    balancer.recordFrame(Number.NaN);
    balancer.recordFrame(-3);
    balancer.recordFrame(Number.POSITIVE_INFINITY);

    const beforeBudgetSwitch = balancer.getTelemetry();
    expect(beforeBudgetSwitch.sampleCount).toBe(20);
    expect(beforeBudgetSwitch.p95FrameMs).toBe(19);
    expect(beforeBudgetSwitch.emaFrameMs).toBeGreaterThan(10);

    // 60Hz -> 120Hz 예산 전환 시 현재 EMA가 120Hz 예산을 초과하므로 즉시 강등 경로 진입
    balancer.setFrameBudget(FRAME_BUDGET_120HZ_MS);
    const after120Hz = balancer.route("3d-lt-contour");
    expect(after120Hz.budgetMs).toBe(FRAME_BUDGET_120HZ_MS);
    expect(after120Hz.accelerator).toBe("wasm-relaxed-simd");
    expect(after120Hz.reason).toBe("frame-spike-downgrade");

    // reset 후 모든 카운터와 텔레메트리 초기화
    balancer.reset();
    const cleared = balancer.getTelemetry();
    expect(cleared.routeDecisions).toBe(0);
    expect(cleared.thermalDowngrades).toBe(0);
    expect(cleared.p95FrameMs).toBe(0);
    expect(cleared.frameDropAvoidedCount).toBe(0);
    expect(cleared.sampleCount).toBe(0);
    expect(cleared.emaFrameMs).toBe(0);
  });

  it("열 압박 해제 직후 쿨다운·연속 프레임 충족 전에는 hysteresis-hold로 승격을 지연한다", () => {
    let clockMs = 1_000;
    const balancer = createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_120HZ_MS,
      capabilities: FULL_CAPABILITIES,
      hysteresisUpgradeFrames: 4,
      hysteresisCooldownMs: 400,
      now: () => clockMs,
    });

    balancer.updatePressure({ thermal: "serious" });
    expect(balancer.route("8k-full-filter")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "thermal-downgrade",
    });

    // 열이 즉시 nominal로 돌아와도 2프레임/100ms만 경과하면 hysteresis-hold 유지
    balancer.updatePressure({ thermal: "nominal" });
    clockMs += 50;
    balancer.recordFrame(4.2);
    clockMs += 50;
    balancer.recordFrame(4.1);
    expect(balancer.route("8k-full-filter")).toMatchObject({
      accelerator: "wasm-relaxed-simd",
      reason: "hysteresis-hold",
    });

    // 쿨다운과 연속 4프레임 모두 충족하면 다시 webgpu-compute로 복귀
    clockMs += 200;
    balancer.recordFrame(4.0);
    clockMs += 200;
    balancer.recordFrame(4.0);
    expect(balancer.route("8k-full-filter")).toMatchObject({
      accelerator: "webgpu-compute",
      reason: "optimal-affinity",
    });
  });
});
