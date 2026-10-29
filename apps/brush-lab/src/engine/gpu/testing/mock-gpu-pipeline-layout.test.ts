import { describe, expect, it } from "vitest";

import { createMockGpu } from "./mock-gpu-device";

describe("모의 pipeline handle의 render bundle 레이아웃 계약", () => {
  it.each(["explicit", "auto"] as const)("%s 레이아웃 label을 핸들·기록자에 동일하게 보존하고 bundle에서 소비한다", (mode) => {
    const gpu = createMockGpu();
    const layout = mode === "explicit"
      ? gpu.device.createPipelineLayout({ label: "bundle-layout", bindGroupLayouts: [] })
      : "auto";
    const module = gpu.device.createShaderModule({ label: "bundle-shader", code: "" });
    const pipeline = gpu.device.createRenderPipeline({
      label: "bundle-pipeline",
      layout,
      vertex: { module, entryPoint: "vertex_main" },
      fragment: { module, entryPoint: "fragment_main", targets: [{ format: "rgba8unorm" }] },
    });
    const expectedLabel = mode === "explicit" ? "bundle-layout" : null;
    expect(pipeline).toHaveProperty("layoutLabel", expectedLabel);
    expect(gpu.pipelines[0]).toMatchObject({ label: "bundle-pipeline", layoutLabel: expectedLabel });

    const encoder = gpu.device.createRenderBundleEncoder({ label: "layout-bundle", colorFormats: ["rgba8unorm"] });
    encoder.setPipeline(pipeline);
    encoder.draw(3);
    encoder.finish();
    expect(gpu.renderBundles).toHaveLength(1);
    expect(gpu.renderBundles[0]?.draws).toEqual([
      { entryPoint: "fragment_main", vertexCount: 3, instanceCount: 1, pass: 0 },
    ]);
  });
});
