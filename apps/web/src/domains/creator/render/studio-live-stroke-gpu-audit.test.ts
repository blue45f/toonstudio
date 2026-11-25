import { describe, expect, it, vi } from "vitest";

import { createStudioLiveStrokeGpuAudit } from "./studio-live-stroke-gpu-audit";

import type { StudioGpuFrameReceipt } from "./studio-webgpu-frame-contract";

function receipt(requestId: string): StudioGpuFrameReceipt {
  return {
    requestId,
    fingerprint: `fingerprint:${requestId}`,
    backend: "webgpu",
    complete: true,
    strokeCount: 1,
    dabCount: 1,
    physicalWidth: 64,
    physicalHeight: 64,
  };
}

describe("Studio live-stroke shared GPU surface authority", () => {
  it("펜을 뗀 뒤 같은 획의 확인된 픽셀을 유지하고 다음 획의 표면 교체 시 숨긴다", () => {
    const setPinnedPresentationVisible = vi.fn();
    const currentSurfaceRequest = { current: null as string | null };
    const audit = createStudioLiveStrokeGpuAudit({
      gpuCanvasShadowVisibleRef: { current: false },
      gpuLiveAcceptedRequestIdRef: currentSurfaceRequest,
      gpuLiveInkPinnedRef: { current: true },
      gpuPinReceiptWatchdogRef: { current: null },
      liveDraftLayerRef: { current: { drawScene: vi.fn() } } as never,
      liveStrokeBackendAuditActiveIdRef: { current: null },
      liveStrokeBackendAuditEarlyGpuReceiptsRef: { current: new Map() },
      liveStrokeBackendAuditGpuOwnersRef: { current: new Map() },
      liveStrokeBackendAuditSessionsRef: { current: new Map() },
      pendingGpuDrawAuthoritiesRef: { current: [] },
      pendingGpuStrokesRef: { current: [] },
      onSelectedEngineUnavailable: vi.fn(),
      setWebGpuAuthority: vi.fn(),
      webGpuCanvasHandleRef: {
        current: { setPinnedPresentationVisible } as never,
      },
    });

    expect(audit.beginLiveStrokeBackendAudit("stroke-a", "webgpu")).toBe(true);
    expect(audit.prepareLiveStrokeGpuSubmission("stroke-a")).toBe(true);
    expect(audit.registerLiveStrokeGpuRequest("stroke-a", "frame:a")).toBe(true);
    currentSurfaceRequest.current = "frame:a";
    audit.beginGpuPinnedReceiptEpoch("frame:a");
    expect(audit.receiveLiveStrokeGpuAuditReceipt(receipt("frame:a"))).toMatchObject({
      status: "accepted",
      strokeId: "stroke-a",
    });
    expect(audit.gpuPinReceiptWatchdog().receipt("frame:a")).toBe(true);
    audit.applyLiveStrokeBackendPresentationEffects();
    expect(setPinnedPresentationVisible).toHaveBeenLastCalledWith(true);

    expect(audit.prepareLiveStrokeGpuSubmission("stroke-a", "append")).toBe(true);
    expect(audit.registerLiveStrokeGpuRequest("stroke-a", "frame:a-tail", "append")).toBe(true);
    currentSurfaceRequest.current = "frame:a-tail";
    audit.armGpuPinnedRequestWatchdog("frame:a-tail");
    expect(audit.sealLiveStrokeBackendAudit("stroke-a")).toBe(true);
    audit.applyLiveStrokeBackendPresentationEffects();
    expect(audit.gpuPinReceiptWatchdog().hasExactReceipt("frame:a-tail")).toBe(false);
    expect(setPinnedPresentationVisible).toHaveBeenLastCalledWith(true);

    expect(audit.beginLiveStrokeBackendAudit("stroke-b", "webgpu")).toBe(true);
    expect(audit.prepareLiveStrokeGpuSubmission("stroke-b")).toBe(true);
    expect(currentSurfaceRequest.current).toBeNull();
    expect(setPinnedPresentationVisible).toHaveBeenLastCalledWith(false);

    expect(audit.registerLiveStrokeGpuRequest("stroke-b", "frame:b")).toBe(true);
    currentSurfaceRequest.current = "frame:b";
    audit.armGpuPinnedRequestWatchdog("frame:b");
    audit.applyLiveStrokeBackendPresentationEffects();

    // A's receipt described the pixels that B has already overwritten. Only B's exact receipt may
    // reopen this shared canvas, so registration alone must leave it hidden.
    expect(setPinnedPresentationVisible).toHaveBeenLastCalledWith(false);
    audit.cancelAllLiveStrokeBackendAudits();
    audit.cancelGpuPinnedRequestWatchdog();
  });
});
