import { describe, expect, it } from "vitest";

import {
  STUDIO_LOCAL_TILE_MAX_CANVAS_DIM,
  executeLocalTiledExportPlan,
  planStudioLocalTileExport,
} from "./studio-local-tile-export-planner";
import { StudioResourceLeakGuard } from "../render/studio-resource-leak-guard";

const MIB = 1024 * 1024;

describe("studio-local-tile-export-planner", () => {
  it("1600×20000px 고해상도 세로 웹툰 원고를 무간극·무중복 타일과 워커 상한 내로 계획한다", () => {
    const plan = planStudioLocalTileExport({
      width: 1600,
      height: 20_000,
      requestedFormat: "png",
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      contentProfile: "flat-cel-webtoon",
    });

    expect(plan.outputWidth).toBe(1600);
    expect(plan.outputHeight).toBe(20_000);
    expect(plan.requiresChunkedExport).toBe(true);
    expect(plan.tileColumns).toBe(1);
    expect(plan.tileRows).toBeGreaterThanOrEqual(8);
    expect(plan.workerConcurrency).toBeGreaterThanOrEqual(2);
    expect(plan.workerConcurrency).toBeLessThanOrEqual(plan.maxHardwareWorkers);
    expect(plan.peakConcurrentWorkingBytes).toBeLessThanOrEqual(plan.memoryBudgetBytes);

    // 전체 세로 20,000px를 빈틈·겹침 없이 100% 커버하는지 검증
    let coveredHeight = 0;
    for (const tile of plan.tiles) {
      expect(tile.x).toBe(0);
      expect(tile.width).toBe(1600);
      expect(tile.y).toBe(coveredHeight);
      expect(tile.height).toBeGreaterThan(0);
      expect(tile.height).toBeLessThanOrEqual(STUDIO_LOCAL_TILE_MAX_CANVAS_DIM);
      coveredHeight += tile.height;
    }
    expect(coveredHeight).toBe(20_000);

    // PNG vs WebP 대역폭 추정치 비교 및 적응형 WebP 추천 검증
    expect(plan.pngVsWebp.pngBytes).toBeGreaterThan(plan.pngVsWebp.webpLossyBytes);
    expect(plan.pngVsWebp.webpLossySavingsPercent).toBeGreaterThan(40);
    expect(plan.recommendation.recommendedFormat).toBe("webp");
    expect(plan.recommendation.bandwidthSavingsBytes).toBeGreaterThan(0);
    expect(plan.pngVsWebp.summaryKo).toContain("PNG");
    expect(plan.pngVsWebp.summaryKo).toContain("WebP");
  });

  it("저메모리 모바일 환경에서는 타일 높이를 자동 축소하고 워커 동시성을 메모리 예산 안으로 제한한다", () => {
    const budget = 32 * MIB;
    const plan = planStudioLocalTileExport({
      width: 2400,
      height: 24_000,
      hardwareConcurrency: 8,
      memoryBudgetBytes: budget,
      targetSliceHeightPx: 4096,
    });

    expect(plan.maxTileWorkingBytes).toBeLessThanOrEqual(budget);
    expect(plan.peakConcurrentWorkingBytes).toBeLessThanOrEqual(budget);
    expect(plan.workerConcurrency).toBe(1);
    expect(plan.memoryGuardStatus).toBe("clamped-to-single-worker");
    expect(plan.guardSummaryKo).toContain("워커 1개");
  });

  it("투명 배경 요청 시 JPG를 비적격 처리하고 투명 지원 포맷(WebP/PNG)만 추천한다", () => {
    const plan = planStudioLocalTileExport({
      width: 1200,
      height: 1600,
      transparent: true,
      requestedFormat: "png",
      contentProfile: "painterly-gradient",
    });

    const jpg = plan.estimates.find((item) => item.format === "jpg");
    expect(jpg?.eligible).toBe(false);
    expect(jpg?.ineligibleReasonKo).toContain("투명");
    expect(plan.recommendation.recommendedFormat).toBe("webp");
    expect(plan.recommendation.reasonKo).toContain("투명 배경");
  });

  it("선화·스크린톤 원고는 무손실 포맷을 우선하고, 플랫폼 JPG 전용 규격은 엄격히 준수한다", () => {
    const lineartPlan = planStudioLocalTileExport({
      width: 1200,
      height: 4800,
      contentProfile: "lineart-screentone",
      requestedFormat: "png",
    });
    expect(lineartPlan.recommendation.recommendedMode).toBe("lossless");

    const naverPlan = planStudioLocalTileExport({
      width: 690,
      height: 12_800,
      platformAllowedFormats: ["jpg"],
      platformMaxFileBytes: 5 * MIB,
      requestedFormat: "png",
    });
    expect(naverPlan.recommendation.recommendedFormat).toBe("jpg");
    expect(naverPlan.estimates.filter((e) => e.eligible).map((e) => e.format)).toEqual(["jpg"]);
  });

  it("executeLocalTiledExportPlan은 workerConcurrency 상한을 넘기지 않고 순서를 보존하며 누수 가드를 정리한다", async () => {
    const plan = planStudioLocalTileExport({
      width: 1600,
      height: 12_800,
      hardwareConcurrency: 4,
      deviceMemoryGb: 8,
      targetSliceHeightPx: 1600,
    });
    expect(plan.tiles.length).toBe(8);
    expect(plan.workerConcurrency).toBe(3);

    let now = 10_000;
    const guard = new StudioResourceLeakGuard({
      now: () => now,
      defaultMaxLifetimeMsByKind: { "offscreen-canvas": 100 },
    });

    const progressEvents: string[] = [];
    const result = await executeLocalTiledExportPlan(
      plan,
      async (tile) => {
        // 일부 타일에서 해제 누락된 임시 캔버스를 시뮬레이션
        if (tile.index === 0) {
          guard.trackOffscreenCanvas({ width: tile.width, height: tile.height }, {
            owner: "export:tile-worker",
            label: tile.id,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 4));
        now += 50;
        return {
          byteLength: tile.width * 2,
          payload: tile.id,
        };
      },
      {
        resourceGuard: guard,
        onProgress: ({ lastTileId }) => progressEvents.push(lastTileId),
      },
    );

    expect(result.tiles).toHaveLength(8);
    expect(result.tiles.map((t) => t.tileId)).toEqual(plan.tiles.map((t) => t.id));
    expect(result.maxObservedConcurrency).toBeLessThanOrEqual(plan.workerConcurrency);
    expect(result.maxObservedConcurrency).toBeGreaterThanOrEqual(2);
    expect(result.totalEncodedBytes).toBe(8 * 1600 * 2);
    expect(progressEvents).toHaveLength(8);
    // 종료 sweep이 만료된 임시 캔버스를 자동 회수했는지 검증
    expect(result.leakReport?.totalAutoReclaimedCount).toBe(1);
    expect(result.leakReport?.activeCount).toBe(0);
  });

  it("AbortSignal로 중단 시 오류를 던지고 리소스 가드 sweep을 실행한다", async () => {
    const plan = planStudioLocalTileExport({
      width: 1600,
      height: 10_240,
      targetSliceHeightPx: 2560,
      hardwareConcurrency: 2,
    });
    const controller = new AbortController();
    controller.abort();

    let now = 1_000;
    const guard = new StudioResourceLeakGuard({
      now: () => now,
      defaultMaxLifetimeMsByKind: { "object-url": 10 },
      revokeObjectUrl: () => undefined,
    });
    guard.trackObjectUrl("blob:stale", { owner: "export:test", estimatedBytes: 1024 });
    now += 50;

    await expect(
      executeLocalTiledExportPlan(
        plan,
        async (tile) => ({ byteLength: 100, payload: tile.id }),
        { signal: controller.signal, resourceGuard: guard },
      ),
    ).rejects.toThrow("중단");

    expect(guard.inspect(now).activeCount).toBe(0);
    expect(guard.inspect(now).totalAutoReclaimedCount).toBe(1);
  });
});
