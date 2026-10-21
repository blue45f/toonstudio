/**
 * check-vello-gpu-result.mjs 단위 테스트 (Node 내장 test runner).
 * 실행: node --test scripts/check-vello-gpu-result.test.mjs
 * 픽스처 모양은 실제 결과 JSON 2건에서 가져왔다:
 *  - 레포 커밋본(2026-09-23, wgpu 29 세대 forkTrack) → STALE
 *  - VM 실행본(2026-10-21, wgpu 30 세대·deviceType Cpu) → CPU_FALLBACK
 */
import assert from "node:assert/strict";

// 루트 Vitest 스위트와 node --test 양쪽에서 도는 이중 모드 (기존 scripts 테스트 관행).
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  CURRENT_FORK_TRACK,
  evaluateVelloGpuResult,
} from "./check-vello-gpu-result.mjs";

const parity = {
  adoption: { adoptedFlag: true, sameDeviceObject: true },
  l4TextureSharing: { bindingAccepted: true, validationError: null },
  hybridSparseStrip: { bindingAccepted: true, validationError: null, maxFuzzyMismatchPct: 0 },
  pixelParityVsL0Lane: { equal: true, detail: null },
  exchangeCost: [
    { size: 256, exchangeSpeedupVsL0: 0.81 },
    { size: 512, exchangeSpeedupVsL0: 0.73 },
    { size: 1024, exchangeSpeedupVsL0: 0.51 },
  ],
};

const currentTrack = {
  vendor: "crates/vendor/wgpu-toon (crates.io wgpu 30.0.1 + TOON-PATCH 0001, feature `toon-fabric`)",
  upstreamCrateSha256: CURRENT_FORK_TRACK.upstreamCrateSha256,
};

function resultWith(overrides) {
  return {
    measuredAt: "2026-10-21T00:00:00.000Z",
    browser: { launch: "playwright chromium headless shell (metal, unsafe-webgpu)", version: "156.0.8078.4" },
    adapter: { backend: "BrowserWebGpu", deviceType: "IntegratedGpu", name: "", driver: "", driverInfo: "" },
    forkTrack: currentTrack,
    ...parity,
    ...overrides,
  };
}

describe("evaluateVelloGpuResult", () => {
  it("실 GPU + 현행 핀 + 패리티 통과면 REAL_GPU다", () => {
    const evaluation = evaluateVelloGpuResult(resultWith({}));
    assert.equal(evaluation.verdict, "REAL_GPU");
    assert.equal(evaluation.ok, true);
  });

  it("패리티가 통과해도 deviceType=Cpu면 CPU_FALLBACK이고 원인 후보 코드를 낸다", () => {
    const evaluation = evaluateVelloGpuResult(resultWith({
      adapter: { backend: "BrowserWebGpu", deviceType: "Cpu", name: "", driver: "", driverInfo: "" },
    }));
    assert.equal(evaluation.verdict, "CPU_FALLBACK");
    assert.equal(evaluation.ok, false);
    assert.deepEqual(evaluation.cpuFallbackCauses, ["C-1", "C-2", "C-3", "C-4", "C-5"]);
  });

  it("레포 커밋본처럼 forkTrack이 wgpu 29 세대면 STALE이다 (잰 대상이 낡음)", () => {
    const evaluation = evaluateVelloGpuResult(resultWith({
      forkTrack: {
        vendor: "crates/vendor/wgpu-toon (crates.io wgpu 29.0.4 + TOON-PATCH 0001, feature `toon-fabric`)",
        upstreamCrateSha256: "76e8840e1ba2881d4cbb18d2147627a56af426ff064c0401eb0c8410c6325d07",
      },
    }));
    assert.equal(evaluation.verdict, "STALE");
  });

  it("패리티 게이트가 깨지면 PARITY_FAILED다", () => {
    const evaluation = evaluateVelloGpuResult(resultWith({
      pixelParityVsL0Lane: { equal: false, detail: "byte 12 200 vs 201 @256" },
    }));
    assert.equal(evaluation.verdict, "PARITY_FAILED");
  });

  it("교환 비용이 L0보다 나빠도(0.51 등) 판정은 흔들리지 않는다 — 기록 항목일 뿐이다", () => {
    const evaluation = evaluateVelloGpuResult(resultWith({}));
    assert.equal(evaluation.ok, true);
    const row = evaluation.checks.find((check) => check.id === "shape.exchange-cost-rows");
    assert.equal(row.ok, true);
  });

  it("필수 필드가 없으면 INCOMPLETE다", () => {
    assert.equal(evaluateVelloGpuResult({}).verdict, "INCOMPLETE");
    assert.equal(evaluateVelloGpuResult(null).verdict, "INCOMPLETE");
  });
});
