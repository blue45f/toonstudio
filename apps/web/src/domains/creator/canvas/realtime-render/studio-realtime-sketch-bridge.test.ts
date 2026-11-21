import { describe, expect, it } from "vitest";

import {
  StudioRealtimeSketchBridge,
  computeRealtimeInputDigest,
  resolveEffectiveSeed,
  type RealtimeSketchInputFrame,
} from "./studio-realtime-sketch-bridge";

function makeFrame(
  checksum: string,
  prompt = "수채화 골목 스케치",
  cameraHash?: string,
): RealtimeSketchInputFrame {
  return {
    sourceKind: cameraHash ? "hybrid-2d-3d" : "sketch-2d",
    prompt,
    tiles: [
      { tileX: 0, tileY: 0, width: 256, height: 256, contentChecksum: checksum },
      { tileX: 1, tileY: 0, width: 256, height: 256, contentChecksum: "tile-static" },
    ],
    ...(cameraHash
      ? {
          viewport3d: {
            cameraHash,
            depthChecksum: `depth-${cameraHash}`,
            width: 512,
            height: 512,
          },
        }
      : {}),
  };
}

describe("studio-realtime-sketch-bridge", () => {
  it("연결이 끊긴 상태에서는 가짜 결과를 생성하지 않고 정직한 안내를 반환한다", () => {
    const bridge = new StudioRealtimeSketchBridge({
      providerStatus: "disconnected",
    });
    const outcome = bridge.submitFrame(makeFrame("stroke-1"), 1000);
    expect(outcome.accepted).toBe(false);
    if (!outcome.accepted) {
      expect(outcome.reason).toBe("provider-disconnected");
      expect(outcome.guidanceKo).toContain("연결");
    }
    expect(bridge.pollDispatch(2000)).toBeNull();
  });

  it("고정 시드 잠금 시 연속 스트로크에도 동일 시드를 유지하고 잠금 해제 시 결정적 시드를 파생한다", () => {
    const lockedBridge = new StudioRealtimeSketchBridge({
      constantSeed: 55123,
      seedLocked: true,
      baseDebounceMs: 100,
    });
    lockedBridge.submitFrame(makeFrame("stroke-a"), 1000);
    const req1 = lockedBridge.pollDispatch(1100);
    expect(req1?.effectiveSeed).toBe(55123);
    lockedBridge.receiveRenderResult({
      requestId: req1!.requestId,
      frameDigest: req1!.frameDigest,
      effectiveSeed: req1!.effectiveSeed,
      previewAssetRef: "ghost://frame-1",
      width: 512,
      height: 512,
      completedAtMs: 1180,
    });

    lockedBridge.submitFrame(makeFrame("stroke-b"), 1200);
    const req2 = lockedBridge.pollDispatch(1400);
    expect(req2?.effectiveSeed).toBe(55123);

    const freeSeedA = resolveEffectiveSeed(
      { constantSeed: 55123, seedLocked: false },
      "abcd1234",
      1,
    );
    const freeSeedB = resolveEffectiveSeed(
      { constantSeed: 55123, seedLocked: false },
      "abcd1234",
      2,
    );
    expect(freeSeedA).not.toBe(freeSeedB);
    expect(
      resolveEffectiveSeed({ constantSeed: 55123, seedLocked: false }, "abcd1234", 1),
    ).toBe(freeSeedA);
  });

  it("단일 인플라이트 취소와 최신 프레임 우선 큐가 구프레임을 안전하게 드롭한다", () => {
    const bridge = new StudioRealtimeSketchBridge({
      baseDebounceMs: 100,
      minDebounceMs: 60,
      maxDebounceMs: 300,
    });

    const s1 = bridge.submitFrame(makeFrame("s1"), 1000);
    expect(s1.accepted).toBe(true);
    // 디바운스 전 동일 입력은 건너뛴다.
    const dup = bridge.submitFrame(makeFrame("s1"), 1020);
    expect(dup.accepted).toBe(false);
    if (!dup.accepted) expect(dup.reason).toBe("unchanged");

    // 디바운스 전 새 스트로크가 들어오면 대기 프레임을 대체한다.
    const s2 = bridge.submitFrame(makeFrame("s2"), 1050);
    expect(s2.accepted).toBe(true);
    if (s2.accepted) expect(s2.supersededPending).toBe(true);

    const reqA = bridge.pollDispatch(1150);
    expect(reqA).not.toBeNull();
    expect(reqA?.dirtyTileKeys).toEqual(["0:0"]);

    // 인플라이트 실행 중 새 3D 카메라 프레임이 오면 기존 요청 취소를 알린다.
    const s3 = bridge.submitFrame(makeFrame("s3", "노을 교실", "cam-45deg"), 1180);
    expect(s3.accepted).toBe(true);
    if (s3.accepted) {
      expect(s3.cancelInFlightRequestId).toBe(reqA!.requestId);
    }

    // 뒤늦게 도착한 취소 요청 결과는 고스트 프리뷰에 적용되지 않는다.
    const lateApply = bridge.receiveRenderResult({
      requestId: reqA!.requestId,
      frameDigest: reqA!.frameDigest,
      effectiveSeed: reqA!.effectiveSeed,
      previewAssetRef: "ghost://stale",
      width: 512,
      height: 512,
      completedAtMs: 1250,
    });
    expect(lateApply.applied).toBe(false);
    expect(bridge.getTelemetry(1250).ghostPreview.status).toBe("empty");

    const reqB = bridge.pollDispatch(1300);
    expect(reqB).not.toBeNull();
    const okApply = bridge.receiveRenderResult({
      requestId: reqB!.requestId,
      frameDigest: reqB!.frameDigest,
      effectiveSeed: reqB!.effectiveSeed,
      previewAssetRef: "ghost://fresh-3d",
      width: 512,
      height: 512,
      completedAtMs: 1460,
    });
    expect(okApply.applied).toBe(true);

    // 명시적 승인 전까지는 previewing 상태이며 확정 시 원본 비파괴 새 레이어 초안을 반환한다.
    const committed = bridge.commitGhostPreviewToNewLayer(1500, "교실 채색 고스트");
    expect(committed).not.toBeNull();
    expect(committed?.insertMode).toBe("new-layer-above");
    expect(committed?.overwritesOriginal).toBe(false);
    expect(committed?.previewAssetRef).toBe("ghost://fresh-3d");
    expect(bridge.getTelemetry(1500).ghostPreview.status).toBe("committed");
  });

  it("BYOK 모드에서 분당 크레딧 예산 상한을 초과하면 요청을 차단한다", () => {
    const bridge = new StudioRealtimeSketchBridge({
      providerStatus: "byok-ready",
      maxCreditsPerMinute: 2,
      creditsPerFrame: 1,
      baseDebounceMs: 60,
    });

    bridge.submitFrame(makeFrame("c1"), 1000);
    const r1 = bridge.pollDispatch(1060);
    expect(r1?.estimatedCredits).toBe(1);
    bridge.receiveRenderResult({
      requestId: r1!.requestId,
      frameDigest: r1!.frameDigest,
      effectiveSeed: r1!.effectiveSeed,
      previewAssetRef: "ghost://c1",
      width: 512,
      height: 512,
      completedAtMs: 1120,
    });

    bridge.submitFrame(makeFrame("c2"), 2000);
    const r2 = bridge.pollDispatch(2060);
    expect(r2?.estimatedCredits).toBe(1);
    bridge.receiveRenderResult({
      requestId: r2!.requestId,
      frameDigest: r2!.frameDigest,
      effectiveSeed: r2!.effectiveSeed,
      previewAssetRef: "ghost://c2",
      width: 512,
      height: 512,
      completedAtMs: 2120,
    });

    const blocked = bridge.submitFrame(makeFrame("c3"), 3000);
    expect(blocked.accepted).toBe(false);
    if (!blocked.accepted) {
      expect(blocked.reason).toBe("budget-exceeded");
    }

    // 60초 윈도우 경과 후 예산이 회복된다.
    const recovered = bridge.submitFrame(makeFrame("c3"), 63_000);
    expect(recovered.accepted).toBe(true);
    expect(computeRealtimeInputDigest(makeFrame("c3"), bridge.getConfig()).length).toBe(16);
  });
});
