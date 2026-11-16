import { describe, expect, it } from "vitest";

import { createPresentationDeviceDiagnostics } from "./studio-engine-presentation-browser-diagnostics";

import type { StudioEngineWebGpuPresentationSurfaceStats } from "../../apps/web/src/domains/creator/render/studio-engine-webgpu-presentation-surface";

const readyOwner: StudioEngineWebGpuPresentationSurfaceStats = {
  status: "ready", configured: true, deviceEpoch: 1,
  presentationEpoch: 1, resizeEpoch: 1, viewportEpoch: 1, flipEpoch: 1, workSurfaceEpoch: 1,
  lastAcceptedRequestSequence: 1, lastPresentedRequestSequence: 0,
  frameActive: true, producerWriteInFlight: false, presentationInFlight: false,
  contentInitialized: true, contentGeneration: 1, contentFingerprint: `sha256:${"1".repeat(64)}`,
  surfaceTextureAllocations: 1, presentations: 0,
};
const lostOwner: StudioEngineWebGpuPresentationSurfaceStats = {
  ...readyOwner, status: "device-lost", configured: false, deviceEpoch: 2,
  frameActive: false, contentInitialized: false, contentFingerprint: null,
};

describe("presentation 실제 device loss 관찰", () => {
  it("lost promise와 두 생산 callback의 원인·발생 단계를 독립적으로 보존한다", async () => {
    const info: GPUDeviceLostInfo = { reason: "unknown", message: "GPU process reset during presentation" };
    const lost = Promise.resolve(info);
    const diagnostics = createPresentationDeviceDiagnostics(lost);
    const callbacks = lost.then(value => {
      diagnostics.onOwnerDeviceLost(value);
      diagnostics.onProducerDeviceLost(value);
    });
    diagnostics.observe("before-readback", readyOwner);
    diagnostics.observe("after-readback", readyOwner);
    diagnostics.observe("before-present", readyOwner);
    await Promise.all([diagnostics.whenLossObserved, callbacks]);
    diagnostics.observe("after-present", lostOwner);

    const report = diagnostics.snapshot();
    expect(report.losses).toEqual(["device.lost", "presentation-owner", "textured-runtime"].map(observer => ({
      observer, phase: "before-present", intentionalDestroyRequested: false,
      reason: "unknown", message: info.message,
    })));
    expect(report.observations.map(entry => [entry.phase, entry.owner.status, entry.owner.deviceEpoch])).toEqual([
      ["before-readback", "ready", 1], ["after-readback", "ready", 1],
      ["before-present", "ready", 1], ["after-present", "device-lost", 2],
    ]);
    expect(report.promiseErrors).toEqual([]);
  });

  it("readback 중의 예상치 못한 loss를 나중의 의도적 destroy로 다시 분류하지 않는다", async () => {
    const diagnostics = createPresentationDeviceDiagnostics(Promise.resolve({ reason: "unknown", message: "readback loss" }));
    const mutableOwner = { ...readyOwner };
    diagnostics.observe("before-readback", mutableOwner);
    mutableOwner.deviceEpoch = 2;
    await diagnostics.whenLossObserved;
    diagnostics.observe("after-readback", lostOwner);
    const beforeDestroy = diagnostics.snapshot();
    diagnostics.markIntentionalDestroy(lostOwner);

    expect(beforeDestroy.phase).toBe("after-readback");
    expect(beforeDestroy.observations[0]?.owner.deviceEpoch).toBe(1);
    expect(diagnostics.snapshot().losses).toEqual([{
      observer: "device.lost", phase: "before-readback", intentionalDestroyRequested: false,
      reason: "unknown", message: "readback loss",
    }]);
    expect(beforeDestroy.observations).toHaveLength(2);
    expect(diagnostics.snapshot().observations).toHaveLength(3);
  });

  it("마지막 명시적 destroy에 따른 loss를 초기 실패와 구별한다", async () => {
    const diagnostics = createPresentationDeviceDiagnostics(Promise.resolve({ reason: "destroyed", message: "explicit destroy" }));
    diagnostics.markIntentionalDestroy({ ...readyOwner, status: "disposed" });
    await diagnostics.whenLossObserved;
    expect(diagnostics.snapshot().losses).toEqual([{
      observer: "device.lost", phase: "intentional-destroy", intentionalDestroyRequested: true,
      reason: "destroyed", message: "explicit destroy",
    }]);
  });

  it("관찰 promise 거부를 진단에 남기고 새 unhandled rejection을 만들지 않는다", async () => {
    const diagnostics = createPresentationDeviceDiagnostics(Promise.reject(new Error("lost observation rejected")));
    diagnostics.observe("before-present", readyOwner);
    await expect(diagnostics.whenLossObserved).resolves.toBeUndefined();
    expect(diagnostics.snapshot().losses).toEqual([]);
    expect(diagnostics.snapshot().promiseErrors).toEqual([{
      phase: "before-present", message: "lost observation rejected",
    }]);
  });
});
