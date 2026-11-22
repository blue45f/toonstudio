import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioResourceLeakGuard,
  resetStudioResourceLeakGuardForTest,
  type StudioImageBitmapLike,
  type StudioOffscreenCanvasLike,
} from "./studio-resource-leak-guard";
import { DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS, downloadBlob } from "../export/studio-export";
import { collectStudioLiveLongSessionDiagnostics } from "../live/studio-live-long-session-diagnostics";

const MIB = 1024 * 1024;

describe("studio-resource-leak-guard", () => {
  it("ObjectURL·OffscreenCanvas·ImageBitmap의 추정 바이트와 정상 해제를 정확히 추적한다", () => {
    let now = 10_000;
    const revokedUrls: string[] = [];
    const guard = new StudioResourceLeakGuard({
      now: () => now,
      revokeObjectUrl: (url) => revokedUrls.push(url),
    });

    const urlId = guard.trackObjectUrl("blob:export-1", {
      owner: "export:download",
      label: "ep01.png",
      estimatedBytes: 2 * MIB,
    });
    const canvas: StudioOffscreenCanvasLike = { width: 1024, height: 1024 };
    const canvasId = guard.trackOffscreenCanvas(canvas, {
      owner: "export:tile",
      label: "tile-0",
    });
    const bitmapClose = vi.fn();
    const bitmap: StudioImageBitmapLike = { width: 512, height: 512, close: bitmapClose };
    const bitmapId = guard.trackImageBitmap(bitmap, {
      owner: "asset:thumb",
      label: "thumb-0",
    });

    const mid = guard.inspect(now);
    expect(mid.status).toBe("ok");
    expect(mid.activeCount).toBe(3);
    expect(mid.totalEstimatedBytes).toBe(2 * MIB + 1024 * 1024 * 4 + 512 * 512 * 4);
    expect(mid.byKind["object-url"].count).toBe(1);
    expect(mid.byKind["offscreen-canvas"].count).toBe(1);
    expect(mid.byKind["image-bitmap"].count).toBe(1);

    expect(guard.release(urlId)).toBe(true);
    expect(guard.release(urlId)).toBe(false); // 멱등성: 중복 해제는 안전하게 무시
    expect(revokedUrls).toEqual(["blob:export-1"]);

    expect(guard.release(canvasId)).toBe(true);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);

    expect(guard.release(bitmapId)).toBe(true);
    expect(bitmapClose).toHaveBeenCalledOnce();

    now += 500;
    const after = guard.inspect(now);
    expect(after.activeCount).toBe(0);
    expect(after.totalEstimatedBytes).toBe(0);
    expect(after.totalCreatedCount).toBe(3);
    expect(after.totalReleasedCount).toBe(3);
  });

  it("생존 한도를 초과한 비고정 리소스를 경고하고 sweep 시 자동 회수하며 pinned 리소스는 보존한다", () => {
    let now = 50_000;
    const revokedUrls: string[] = [];
    const guard = new StudioResourceLeakGuard({
      now: () => now,
      revokeObjectUrl: (url) => revokedUrls.push(url),
      defaultMaxLifetimeMsByKind: {
        "object-url": 30_000,
        "image-bitmap": 20_000,
      },
    });

    guard.trackObjectUrl("blob:transient", {
      owner: "export:download",
      estimatedBytes: 4 * MIB,
    });
    guard.trackObjectUrl("blob:pinned-preview", {
      owner: "anchor-preview",
      estimatedBytes: 1 * MIB,
      pinned: true,
    });
    const bitmapClose = vi.fn();
    guard.trackImageBitmap(
      { width: 1000, height: 1000, close: bitmapClose },
      { owner: "asset:decode" },
    );

    now += 35_000;
    const inspected = guard.inspect(now);
    expect(inspected.status).toBe("warning");
    expect(inspected.staleEntries).toHaveLength(3);
    expect(inspected.warnings.some((w) => w.code === "stale-resource")).toBe(true);

    const swept = guard.sweep({ nowMs: now });
    expect(swept.reclaimedIds).toHaveLength(2);
    expect(revokedUrls).toEqual(["blob:transient"]);
    expect(bitmapClose).toHaveBeenCalledOnce();
    // pinned 미리보기 URL은 자동 회수되지 않고 유지됨
    expect(swept.report.activeCount).toBe(1);
    expect(swept.report.totalAutoReclaimedCount).toBe(2);
  });

  it("누적 바이트 상한 초과 시 오래된 비고정 리소스를 자동 정리하고 장시간 진단 상태를 critical/degraded로 연동한다", () => {
    let now = 100_000;
    const revokedUrls: string[] = [];
    const guard = new StudioResourceLeakGuard({
      now: () => now,
      warnTotalBytes: 8 * MIB,
      maxTotalBytes: 12 * MIB,
      autoReclaimOnThreshold: true,
      revokeObjectUrl: (url) => revokedUrls.push(url),
    });

    guard.trackObjectUrl("blob:old-1", { owner: "export", estimatedBytes: 6 * MIB });
    now += 1_000;
    guard.trackObjectUrl("blob:old-2", { owner: "export", estimatedBytes: 5 * MIB });
    now += 1_000;
    // 6 + 5 + 5 = 16MB > 12MB -> 가장 오래된 old-1 자동 회수 후 10MB 유지(경고 구간)
    guard.trackObjectUrl("blob:new-3", { owner: "export", estimatedBytes: 5 * MIB });

    expect(revokedUrls).toEqual(["blob:old-1"]);
    const report = guard.inspect(now);
    expect(report.totalEstimatedBytes).toBe(10 * MIB);
    expect(report.status).toBe("warning");
    expect(report.warnings.some((w) => w.code === "byte-budget-warning")).toBe(true);

    // pinned 대용량 리소스로 상한 초과 시 자동 회수 불가 -> critical 및 장시간 협업 진단 degraded 연동
    const strictGuard = new StudioResourceLeakGuard({
      now: () => now,
      warnTotalBytes: 4 * MIB,
      maxTotalBytes: 8 * MIB,
      autoReclaimOnThreshold: false,
      revokeObjectUrl: () => undefined,
    });
    strictGuard.trackObjectUrl("blob:huge-pinned", {
      owner: "canvas:buffer",
      estimatedBytes: 16 * MIB,
      pinned: true,
    });

    const diag = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: 1,
      outboxQueueSize: 0,
      heapUsedMb: 120,
      now: () => now,
      resourceLeakGuard: strictGuard,
    });
    expect(diag.trackedResources.status).toBe("critical");
    expect(diag.trackedResources.activeCount).toBe(1);
    expect(diag.status).toBe("degraded");
  });

  it("스코프 트래커와 오류 격리(disposer 예외)를 안전하게 처리한다", () => {
    const guard = new StudioResourceLeakGuard({
      revokeObjectUrl: () => {
        throw new Error("revoke failed");
      },
    });
    const scope = guard.createScopedTracker("export:job-42");
    const canvas: StudioOffscreenCanvasLike = { width: 256, height: 256 };
    scope.trackOffscreenCanvas(canvas);
    scope.trackObjectUrl("blob:faulty", { estimatedBytes: 1024 });

    expect(guard.inspect().activeCount).toBe(2);
    expect(() => scope.disposeAll()).not.toThrow();
    expect(guard.inspect().activeCount).toBe(0);
    expect(canvas.width).toBe(0);
  });

  describe("studio-export downloadBlob 연동", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      resetStudioResourceLeakGuardForTest();
    });

    it("downloadBlob이 생성한 임시 ObjectURL을 레지스트리에 등록하고 지연 해제 시 정리한다", () => {
      vi.useFakeTimers();
      const revoked: string[] = [];
      const guard = resetStudioResourceLeakGuardForTest({
        revokeObjectUrl: (url) => revoked.push(url),
      });
      const click = vi.fn();
      const remove = vi.fn();
      const appendChild = vi.fn();
      const fakeLink = { href: "", download: "", rel: "", style: { display: "" }, click, remove };

      vi.stubGlobal("document", {
        body: { appendChild },
        createElement: () => fakeLink,
      });
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:studio-download-test");

      const blob = new Blob([new Uint8Array(4096)], { type: "image/png" });
      downloadBlob(blob, "episode-01.png");

      expect(click).toHaveBeenCalledOnce();
      expect(guard.inspect().activeCount).toBe(1);
      expect(guard.inspect().totalEstimatedBytes).toBe(4096);

      vi.advanceTimersByTime(DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS);
      expect(revoked).toEqual(["blob:studio-download-test"]);
      expect(guard.inspect().activeCount).toBe(0);
      expect(guard.inspect().totalReleasedCount).toBe(1);
    });
  });
});
