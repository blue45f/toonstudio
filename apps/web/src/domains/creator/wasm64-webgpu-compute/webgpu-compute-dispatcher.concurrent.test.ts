import { describe, expect, it, vi } from "vitest";

import {
  GPU_BUFFER_USAGE,
  StudioWebGpuComputeDispatcher,
  type ComputeDispatchRequest,
  type ComputeGpuBindGroupLayoutLike,
  type ComputeGpuBindGroupLike,
  type ComputeGpuDeviceLike,
  type ComputeGpuPipelineLike,
} from "./webgpu-compute-dispatcher";

function gpuHarness() {
  let finishCompilation: () => void = () => undefined;
  const compileGate = new Promise<void>((resolve) => { finishCompilation = resolve; });
  const layouts = new WeakMap<ComputeGpuBindGroupLike, ComputeGpuBindGroupLayoutLike>();
  let pipelineSequence = 0;
  const createPipeline = vi.fn(async (): Promise<ComputeGpuPipelineLike> => {
    const layout = { label: `독립 자동 레이아웃 ${++pipelineSequence}` };
    await compileGate;
    return { getBindGroupLayout: () => layout };
  });
  const submit = vi.fn();
  const device: ComputeGpuDeviceLike = {
    queue: { writeBuffer() {}, submit },
    createShaderModule: () => ({}),
    createBuffer: (descriptor) => ({ ...descriptor, destroy() {} }),
    createComputePipelineAsync: createPipeline,
    createBindGroup: (descriptor) => {
      const bindGroup = { label: descriptor.label };
      layouts.set(bindGroup, descriptor.layout);
      return bindGroup;
    },
    createCommandEncoder: () => ({
      beginComputePass: () => {
        let activePipeline: ComputeGpuPipelineLike | undefined;
        return {
          setPipeline(pipeline) { activePipeline = pipeline; },
          setBindGroup(_index, bindGroup) {
            if (layouts.get(bindGroup) !== activePipeline?.getBindGroupLayout(0)) {
              throw new Error("다른 자동 파이프라인의 바인드 그룹입니다.");
            }
          },
          dispatchWorkgroups() {}, end() {},
        };
      },
      finish: () => ({}),
    }),
  };
  return { device, createPipeline, finishCompilation, submit };
}

describe("동일 WebGPU 커널의 비동기 컴파일 병합", () => {
  it("동시 디스패치가 같은 자동 레이아웃과 재사용 버퍼를 안전하게 공유한다", async () => {
    const harness = gpuHarness();
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device });
    const input = dispatcher.acquireBuffer(256, GPU_BUFFER_USAGE.STORAGE);
    const output = dispatcher.acquireBuffer(256, GPU_BUFFER_USAGE.STORAGE);
    const request: ComputeDispatchRequest = {
      kernelId: "separable-gaussian-blur", width: 16, height: 16, uniformData: new Uint32Array(8),
      storageBindings: [{ binding: 1, buffer: input }, { binding: 2, buffer: output }],
    };
    const first = dispatcher.dispatchKernel(request);
    const second = dispatcher.dispatchKernel(request);
    harness.finishCompilation();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.executedOnGpu)).toEqual([true, true]);
    expect(results[1]?.bindGroupCacheHit).toBe(true);
    expect(harness.createPipeline).toHaveBeenCalledTimes(1);
    expect(harness.submit).toHaveBeenCalledTimes(2);
    dispatcher.dispose();
  });

  it("실패한 진행 중 컴파일을 제거해 다음 요청이 다시 시도할 수 있다", async () => {
    const harness = gpuHarness();
    harness.createPipeline.mockRejectedValueOnce(new Error("컴파일 실패"));
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device });
    const first = dispatcher.getOrCreatePipeline("separable-gaussian-blur");
    const second = dispatcher.getOrCreatePipeline("separable-gaussian-blur");
    harness.finishCompilation();
    const failed = await Promise.allSettled([first, second]);
    expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    await expect(dispatcher.getOrCreatePipeline("separable-gaussian-blur")).resolves.toBeDefined();
    expect(harness.createPipeline).toHaveBeenCalledTimes(2);
    dispatcher.dispose();
  });

  it.each(["dispose", "lost"] as const)("%s 뒤 완료된 컴파일은 캐시를 다시 채우지 않는다", async (end) => {
    const harness = gpuHarness();
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device });
    const first = dispatcher.getOrCreatePipeline("separable-gaussian-blur");
    const second = dispatcher.getOrCreatePipeline("separable-gaussian-blur");
    if (end === "dispose") dispatcher.dispose();
    else dispatcher.markDeviceLost();
    harness.finishCompilation();
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(dispatcher.getStats().pipelineCount).toBe(0);
    dispatcher.dispose();
  });

  it("서로 다른 커널은 별개의 파이프라인으로 컴파일한다", async () => {
    const harness = gpuHarness();
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device });
    const first = dispatcher.getOrCreatePipeline("separable-gaussian-blur");
    const second = dispatcher.getOrCreatePipeline("lt-gbuffer-contour");
    harness.finishCompilation();
    const [a, b] = await Promise.all([first, second]);
    expect(a).not.toBe(b);
    expect(harness.createPipeline).toHaveBeenCalledTimes(2);
    expect(dispatcher.getStats().pipelineCount).toBe(2);
    dispatcher.dispose();
  });
});
