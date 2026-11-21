import { describe, expect, it } from "vitest";

import { StudioWetPaperLbmWebGpuRuntime } from "./studio-wet-paper-lbm-webgpu-runtime";

describe("StudioWetPaperLbmWebGpuRuntime", () => {
  it("WebGPU 미지원 시 cpu-fallback, 가용 시 워크그룹 디스패치 및 device-lost 시 fail-closed로 전환한다", () => {
    const fallback = new StudioWetPaperLbmWebGpuRuntime(null, { width: 64, height: 64 });
    expect(fallback.getStatus()).toBe("cpu-fallback");
    expect(fallback.step().dispatchedWorkgroups).toBe(0);

    const mockDevice = {} as GPUDevice;
    const gpu = new StudioWetPaperLbmWebGpuRuntime(mockDevice, { width: 64, height: 64 });
    expect(gpu.getStatus()).toBe("ready");
    expect(gpu.getEntryPoint()).toBe("wet_paper_lbm_step");
    expect(gpu.getShaderSource()).toContain("@compute @workgroup_size(64)");
    const step1 = gpu.step();
    expect(step1.dispatchedWorkgroups).toBe(64);
    expect(step1.stepIndex).toBe(1);
    gpu.markDeviceLost();
    expect(gpu.step().status).toBe("device-lost");
    gpu.dispose();
  });
});
