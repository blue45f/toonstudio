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
  it("destroy 계측은 실제 receiver·인수·반환값을 원래 함수에 한 번씩 전달한다", () => {
    const diagnostics = createPresentationDeviceDiagnostics(Promise.resolve({ reason: "destroyed", message: "observed" }));
    const calls: { receiver: unknown; args: unknown[] }[] = [];
    const result = { nativeResult: true };
    const device = {
      destroy(this: unknown, ...args: unknown[]): unknown {
        calls.push({ receiver: this, args });
        return result;
      },
    };
    diagnostics.instrumentDestroy(device);
    diagnostics.observe("before-present", readyOwner);
    const argument = { preserved: true };
    const alternateReceiver = { other: true };

    expect(device.destroy(argument, 7)).toBe(result);
    expect(Reflect.apply(device.destroy, alternateReceiver, [argument])).toBe(result);
    expect(Reflect.apply(device.destroy, undefined, [])).toBe(result);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.receiver).toBe(device);
    expect(calls[0]?.args).toEqual([argument, 7]);
    expect(calls[0]?.args[0]).toBe(argument);
    expect(calls[1]?.receiver).toBe(alternateReceiver);
    expect(calls[1]?.args[0]).toBe(argument);
    expect(calls[2]?.receiver).toBeUndefined();
    expect(calls[2]?.args).toEqual([]);
    expect(diagnostics.snapshot().destroyCalls).toEqual([0, 1, 2].map(() => ({
      phase: "before-present", intentionalDestroyRequested: false, stack: expect.stringContaining("GPUDevice.destroy called"),
    })));
  });

  it("destroy 원래 예외를 삼키거나 바꾸지 않고 호출 직전 단계만 기록한다", () => {
    const diagnostics = createPresentationDeviceDiagnostics(Promise.resolve({ reason: "destroyed", message: "observed" }));
    const failure = new TypeError("native destroy receiver failure");
    let calls = 0;
    const device = { destroy(): never { calls += 1; throw failure; } };
    diagnostics.instrumentDestroy(device);
    diagnostics.observe("after-readback", readyOwner);
    let thrown: unknown;
    try { device.destroy(); } catch (error) { thrown = error; }

    expect(thrown).toBe(failure);
    expect(calls).toBe(1);
    expect(diagnostics.snapshot().destroyCalls).toEqual([{
      phase: "after-readback", intentionalDestroyRequested: false, stack: expect.any(String),
    }]);
  });

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
    const device = { destroy() { return undefined; } };
    diagnostics.instrumentDestroy(device);
    diagnostics.markIntentionalDestroy({ ...readyOwner, status: "disposed" });
    device.destroy();
    await diagnostics.whenLossObserved;
    expect(diagnostics.snapshot().destroyCalls).toEqual([{
      phase: "intentional-destroy", intentionalDestroyRequested: true, stack: expect.any(String),
    }]);
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
