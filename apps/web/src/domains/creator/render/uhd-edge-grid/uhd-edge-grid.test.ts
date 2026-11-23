import { describe, expect, it, vi } from "vitest";

import {
  computeResponsiveHapticGrid,
  dispatchGridHapticFeedback,
  type ResponsiveGridMode,
} from "./responsive-haptic-grid";
import {
  buildPhysicalPixelSnapMatrix,
  computeUhdEdgeRenderPlan,
  hairlineStrokeWidthCss,
  measurePhysicalPixelSnapError,
  rankResidentTilesForEviction,
  snapEdgeToPhysicalPixel,
  snapRectToPhysicalPixels,
  snapStrokeCenterToPhysicalPixel,
  type ResidentTileEntry,
} from "./uhd-dpr-tile-budgeter";

const DISPLAY_PROFILES = [
  {
    name: "1080p (1x)",
    viewportCssWidth: 1920,
    viewportCssHeight: 1080,
    devicePixelRatio: 1.0,
    vramBudgetMiB: 512,
    expectedTier: "fhd-standard",
  },
  {
    name: "Windows 125% (1.25x)",
    viewportCssWidth: 1920,
    viewportCssHeight: 1080,
    devicePixelRatio: 1.25,
    vramBudgetMiB: 512,
    expectedTier: "fractional-hidpi",
  },
  {
    name: "Windows 150% (1.5x)",
    viewportCssWidth: 1920,
    viewportCssHeight: 1080,
    devicePixelRatio: 1.5,
    vramBudgetMiB: 512,
    expectedTier: "fractional-hidpi",
  },
  {
    name: "Windows 175% (1.75x)",
    viewportCssWidth: 1600,
    viewportCssHeight: 900,
    devicePixelRatio: 1.75,
    vramBudgetMiB: 512,
    expectedTier: "fractional-hidpi",
  },
  {
    name: "Retina 4K (2x)",
    viewportCssWidth: 1920,
    viewportCssHeight: 1080,
    devicePixelRatio: 2.0,
    vramBudgetMiB: 512,
    expectedTier: "uhd-4k",
  },
  {
    name: "5K Studio Display (2x)",
    viewportCssWidth: 2560,
    viewportCssHeight: 1440,
    devicePixelRatio: 2.0,
    vramBudgetMiB: 512,
    expectedTier: "uhd-5k",
  },
  {
    name: "8K UHD (3x, 1024MiB desktop)",
    viewportCssWidth: 2560,
    viewportCssHeight: 1440,
    devicePixelRatio: 3.0,
    vramBudgetMiB: 1024,
    expectedTier: "uhd-8k",
  },
  {
    name: "8K UHD constrained (3x, 512MiB)",
    viewportCssWidth: 2560,
    viewportCssHeight: 1440,
    devicePixelRatio: 3.0,
    vramBudgetMiB: 512,
    expectedTier: "uhd-8k",
  },
  {
    name: "Mobile low-memory high-DPR (256MiB)",
    viewportCssWidth: 1366,
    viewportCssHeight: 1024,
    devicePixelRatio: 3.0,
    vramBudgetMiB: 256,
    expectedTier: "mobile-constrained",
  },
  {
    name: "Mobile phone portrait (256MiB)",
    viewportCssWidth: 430,
    viewportCssHeight: 932,
    devicePixelRatio: 3.0,
    vramBudgetMiB: 256,
    expectedTier: "mobile-constrained",
  },
] as const;

describe("UHD Edge DPR Tile Budgeter", () => {
  it("snaps edges, 1px hairline stroke centers, and tile rects to physical pixels with < 1e-6 error across integer and fractional DPRs", () => {
    const dprs = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0] as const;
    const sampleCoords = [-137.33, -0.37, 0.1, 12.42, 99.99, 512.73, 1919.61, 3840.29];

    for (const dpr of dprs) {
      const hairline = hairlineStrokeWidthCss(dpr);
      expect(Math.abs(hairline * dpr - 1)).toBeLessThan(1e-6);

      for (const coord of sampleCoords) {
        const snappedEdge = snapEdgeToPhysicalPixel(coord, dpr);
        expect(measurePhysicalPixelSnapError(snappedEdge, dpr)).toBeLessThan(1e-6);

        // 홀수 1px 물리 선의 중심은 k + 0.5 물리 픽셀에 떨어져 양 가장자리가 정확히 정수 픽셀에 정렬된다
        const snappedCenter = snapStrokeCenterToPhysicalPixel(coord, dpr, 1);
        const leftEdgePhysical = (snappedCenter - hairline * 0.5) * dpr;
        const rightEdgePhysical = (snappedCenter + hairline * 0.5) * dpr;
        expect(Math.abs(leftEdgePhysical - Math.round(leftEdgePhysical))).toBeLessThan(1e-6);
        expect(Math.abs(rightEdgePhysical - Math.round(rightEdgePhysical))).toBeLessThan(1e-6);
      }

      // 인접 사각형 2개가 비정수 DPR에서도 틈새·겹침 없이 맞물린다
      const leftRect = snapRectToPhysicalPixels({ x: 10.3, y: 20.7, width: 100.4, height: 64.9 }, dpr);
      const rightRect = snapRectToPhysicalPixels(
        { x: 10.3 + 100.4, y: 20.7, width: 100.4, height: 64.9 },
        dpr,
      );
      expect(leftRect.physicalX + leftRect.physicalWidth).toBe(rightRect.physicalX);
      expect(Math.abs(leftRect.x + leftRect.width - rightRect.x)).toBeLessThan(1e-6);

      // 스냅 행렬의 위상 보정(tx/ty) 적용 시 원점이 정수 물리 픽셀에 정렬된다
      const matrix = buildPhysicalPixelSnapMatrix(dpr, 37.3, 19.7);
      const alignedOriginX = 37.3 * matrix.a + matrix.tx;
      const alignedOriginY = 19.7 * matrix.d + matrix.ty;
      expect(Math.abs(alignedOriginX - Math.round(alignedOriginX))).toBeLessThan(1e-6);
      expect(Math.abs(alignedOriginY - Math.round(alignedOriginY))).toBeLessThan(1e-6);
      expect(matrix.isFractionalDpr).toBe(dpr !== Math.round(dpr));
    }
  });

  it("never exceeds VRAM budget across 1080p, 125~175%, 4K, 5K, 8K, and 256MiB mobile profiles", () => {
    for (const profile of DISPLAY_PROFILES) {
      const plan = computeUhdEdgeRenderPlan({
        viewportCssWidth: profile.viewportCssWidth,
        viewportCssHeight: profile.viewportCssHeight,
        devicePixelRatio: profile.devicePixelRatio,
        zoom: 1.0,
        panVelocityX: 420,
        panVelocityY: 120,
        vramBudgetMiB: profile.vramBudgetMiB,
        tileSizePx: 256,
      });

      expect(plan.displayTier, profile.name).toBe(profile.expectedTier);
      expect(plan.memory.withinBudget, profile.name).toBe(true);
      expect(plan.memory.totalEstimatedVramMiB, profile.name).toBeLessThanOrEqual(profile.vramBudgetMiB + 1e-6);
      expect(plan.effectiveBackingDpr, profile.name).toBeLessThanOrEqual(profile.devicePixelRatio);
      expect(plan.effectiveBackingDpr, profile.name).toBeGreaterThan(0);

      // 플랜의 effectiveBackingDpr로 계산한 헤어라인도 물리 픽셀 오차 < 1e-6
      expect(Math.abs(plan.hairlineStrokeWidthCss * plan.effectiveBackingDpr - 1)).toBeLessThan(1e-6);
    }

    // 8K(3x)가 512MiB 예산에서는 반드시 DPR을 적응 클램프해 VRAM 상한을 지킨다
    const uhd8kTight = computeUhdEdgeRenderPlan({
      viewportCssWidth: 2560,
      viewportCssHeight: 1440,
      devicePixelRatio: 3.0,
      zoom: 1.0,
      panVelocityX: 0,
      panVelocityY: 0,
      vramBudgetMiB: 512,
      tileSizePx: 256,
    });
    expect(uhd8kTight.dprClamped).toBe(true);
    expect(uhd8kTight.clampReason).toBe("vram-budget");
    expect(uhd8kTight.effectiveBackingDpr).toBeLessThan(3.0);
    expect(uhd8kTight.memory.totalEstimatedVramMiB).toBeLessThanOrEqual(512);

    // 모바일 256MiB 고해상도 태블릿에서도 모바일 메모리 가드로 DPR 클램프
    const mobileTablet = computeUhdEdgeRenderPlan({
      viewportCssWidth: 1366,
      viewportCssHeight: 1024,
      devicePixelRatio: 3.0,
      zoom: 1.0,
      panVelocityX: 0,
      panVelocityY: 0,
      vramBudgetMiB: 256,
      tileSizePx: 256,
    });
    expect(mobileTablet.dprClamped).toBe(true);
    expect(mobileTablet.clampReason).toBe("mobile-memory-guard");
    expect(mobileTablet.memory.totalEstimatedVramMiB).toBeLessThanOrEqual(256);
  });

  it("prioritizes leading-edge 1-ring/2-ring tiles along pan velocity vector and evicts trailing tiles first", () => {
    // +X 고속 패닝 (우측으로 이동)
    const fastRightPan = computeUhdEdgeRenderPlan({
      viewportCssWidth: 1920,
      viewportCssHeight: 1080,
      devicePixelRatio: 1.5,
      zoom: 1.5,
      panVelocityX: 720,
      panVelocityY: 0,
      vramBudgetMiB: 512,
      tileSizePx: 256,
    });

    expect(fastRightPan.activePrefetchRings).toBe(2);
    expect(fastRightPan.panDirectionX).toBeCloseTo(1, 3);
    expect(fastRightPan.prefetchTiles.length).toBeGreaterThan(0);

    // 최상위 프리페치 타일은 뷰포트 우측 전방(maxTileX + 1)에 위치해야 한다
    const topPrefetch = fastRightPan.prefetchTiles[0]!;
    expect(topPrefetch.ring).toBe(1);
    expect(topPrefetch.tileX).toBe(fastRightPan.visibleBounds.maxTileX + 1);
    expect(topPrefetch.directionalAlignment).toBeGreaterThan(0.5);

    // 2-링 타일은 전방 방향(+X)에만 집중 배치된다
    const ring2Tiles = fastRightPan.prefetchTiles.filter((tile) => tile.ring === 2);
    expect(ring2Tiles.length).toBeGreaterThan(0);
    for (const tile of ring2Tiles) {
      expect(tile.directionalAlignment).toBeGreaterThanOrEqual(0.15);
    }

    // 퇴거 큐 최우선 타일은 진행 반대 방향(좌측 뒤쪽) 타일이어야 한다
    const firstEvict = fastRightPan.evictionQueue[0]!;
    expect(firstEvict.tileX).toBeLessThanOrEqual(fastRightPan.visibleBounds.minTileX);
    expect(firstEvict.evictionPriority).toBeGreaterThan(topPrefetch.evictionPriority);

    // rankResidentTilesForEviction: 가시 타일과 pinned 타일을 보호하고 뒤쪽 타일부터 회수
    const resident: ResidentTileEntry[] = [
      { key: "visible", tileX: fastRightPan.visibleBounds.minTileX, tileY: fastRightPan.visibleBounds.minTileY, lastUsedFrame: 1 },
      { key: "pinned-back", tileX: fastRightPan.visibleBounds.minTileX - 2, tileY: 2, lastUsedFrame: 1, pinned: true },
      { key: "trailing-far", tileX: fastRightPan.visibleBounds.minTileX - 2, tileY: 2, lastUsedFrame: 50 },
      { key: "leading-near", tileX: fastRightPan.visibleBounds.maxTileX + 1, tileY: 2, lastUsedFrame: 10 },
    ];
    const ranked = rankResidentTilesForEviction(resident, fastRightPan);
    expect(ranked.map((t) => t.key)).toEqual(["trailing-far", "leading-near"]);
  });

  it("defends safely against NaN, negative, and extreme inputs", () => {
    const plan = computeUhdEdgeRenderPlan({
      viewportCssWidth: Number.NaN,
      viewportCssHeight: -500,
      devicePixelRatio: Number.POSITIVE_INFINITY,
      zoom: -1,
      panVelocityX: Number.NaN,
      panVelocityY: Number.NEGATIVE_INFINITY,
      vramBudgetMiB: 32,
      tileSizePx: 12,
    });
    expect(Number.isFinite(plan.effectiveBackingDpr)).toBe(true);
    expect(Number.isFinite(plan.memory.totalEstimatedVramMiB)).toBe(true);
    expect(plan.memory.withinBudget).toBe(true);
    expect(plan.memory.totalEstimatedVramMiB).toBeLessThanOrEqual(plan.memory.vramBudgetMiB + 1e-6);
  });
});

describe("Responsive Haptic Grid Engine", () => {
  const ZOOM_SWEEP = [0.25, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 1.8, 2.0, 3.0, 4.0, 6.0, 8.0] as const;
  const GRID_MODES: readonly ResponsiveGridMode[] = [
    "metric",
    "webtoon-gutter",
    "rule-of-thirds",
    "golden-ratio",
  ];

  it("guarantees >= 18px minimum spacing across 25%–800% zoom and all 4 grid modes without visual overcrowding", () => {
    for (const mode of GRID_MODES) {
      for (const zoom of ZOOM_SWEEP) {
        for (const dpr of [1.0, 1.25, 1.5, 2.0, 3.0] as const) {
          const grid = computeResponsiveHapticGrid({
            zoom,
            viewportWidth: 1440,
            viewportHeight: 900,
            mode,
            pointerX: 200,
            pointerY: 200,
            previousAxisKey: null,
            devicePixelRatio: dpr,
          });

          if (grid.minObservedSpacingPx !== null) {
            expect(
              grid.minObservedSpacingPx,
              `mode=${mode} zoom=${zoom} dpr=${dpr}`,
            ).toBeGreaterThanOrEqual(18 - 1e-4);
          }

          for (let i = 1; i < grid.verticalLines.length; i += 1) {
            const gap = grid.verticalLines[i]!.positionPx - grid.verticalLines[i - 1]!.positionPx;
            expect(gap, `V gap mode=${mode} zoom=${zoom} dpr=${dpr}`).toBeGreaterThanOrEqual(18 - 1e-4);
          }
          for (let i = 1; i < grid.horizontalLines.length; i += 1) {
            const gap = grid.horizontalLines[i]!.positionPx - grid.horizontalLines[i - 1]!.positionPx;
            expect(gap, `H gap mode=${mode} zoom=${zoom} dpr=${dpr}`).toBeGreaterThanOrEqual(18 - 1e-4);
          }
        }
      }
    }

    // 메트릭 모드에서 줌이 커질수록 월드 스텝이 자동 세분화된다
    const z25 = computeResponsiveHapticGrid({
      zoom: 0.25,
      viewportWidth: 1200,
      viewportHeight: 800,
      mode: "metric",
      pointerX: 10,
      pointerY: 10,
    });
    const z100 = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 1200,
      viewportHeight: 800,
      mode: "metric",
      pointerX: 10,
      pointerY: 10,
    });
    const z800 = computeResponsiveHapticGrid({
      zoom: 8.0,
      viewportWidth: 1200,
      viewportHeight: 800,
      mode: "metric",
      pointerX: 10,
      pointerY: 10,
    });
    expect(z25.minorWorldStep).toBeGreaterThan(z100.minorWorldStep);
    expect(z100.minorWorldStep).toBeGreaterThan(z800.minorWorldStep);
    expect(z800.subdivisionLevel).toBeGreaterThan(z25.subdivisionLevel);
  });

  it("performs magnetic snap within ±6px and triggers throttled haptic feedback on axis crossings and intersections", () => {
    const baseline = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: 10,
      pointerY: 10,
      previousAxisKey: null,
      devicePixelRatio: 2.0,
    });
    expect(baseline.snap.isSnapped).toBe(false);
    expect(baseline.haptic.triggerHaptic).toBe(false);
    expect(baseline.haptic.patternMs).toEqual([]);

    const firstThirdX = baseline.verticalLines[0]!;
    const firstThirdY = baseline.horizontalLines[0]!;

    // ±6px 임계 바깥(6.5px)은 스냅되지 않음
    const outside = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx + 6.5,
      pointerY: 100,
      previousAxisKey: null,
      devicePixelRatio: 2.0,
    });
    expect(outside.snap.didSnapX).toBe(false);
    expect(outside.haptic.triggerHaptic).toBe(false);

    // ±6px 임계 내부(+5px) 진입 시 자석 스냅 + 햅틱 1회 트리거
    const enteredX = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx + 5,
      pointerY: 100,
      previousAxisKey: null,
      devicePixelRatio: 2.0,
      nowMs: 1000,
      lastHapticTimestampMs: null,
    });
    expect(enteredX.snap.didSnapX).toBe(true);
    expect(enteredX.snap.snappedX).toBe(firstThirdX.positionPx);
    expect(enteredX.haptic.triggerHaptic).toBe(true);
    expect(enteredX.haptic.patternMs.length).toBeGreaterThan(0);
    expect(enteredX.haptic.axisLabel).toContain("Third 1/3");

    // 동일 축에 머물러 있으면 중복 햅틱이 발화하지 않는다
    const stayedX = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx + 2,
      pointerY: 105,
      previousAxisKey: enteredX.snap.axisKey,
      devicePixelRatio: 2.0,
      nowMs: 1200,
      lastHapticTimestampMs: enteredX.haptic.nextHapticTimestampMs,
    });
    expect(stayedX.snap.didSnapX).toBe(true);
    expect(stayedX.haptic.triggerHaptic).toBe(false);
    expect(stayedX.haptic.patternMs).toEqual([]);

    // 스로틀 윈도우(40ms) 이내에 교차점 진입 시 스로틀 차단
    const throttledCross = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx + 1,
      pointerY: firstThirdY.positionPx - 2,
      previousAxisKey: enteredX.snap.axisKey,
      devicePixelRatio: 2.0,
      nowMs: 1020,
      lastHapticTimestampMs: 1000,
      hapticThrottleMs: 40,
    });
    expect(throttledCross.snap.isIntersection).toBe(true);
    expect(throttledCross.haptic.throttled).toBe(true);
    expect(throttledCross.haptic.triggerHaptic).toBe(false);

    // 스로틀 윈도우 경과 후 교차점 진입 시 이중 펄스 햅틱 발화
    const intersection = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx + 1,
      pointerY: firstThirdY.positionPx - 2,
      previousAxisKey: enteredX.snap.axisKey,
      devicePixelRatio: 2.0,
      nowMs: 1100,
      lastHapticTimestampMs: 1000,
      hapticThrottleMs: 40,
    });
    expect(intersection.snap.isIntersection).toBe(true);
    expect(intersection.haptic.triggerHaptic).toBe(true);
    expect(intersection.haptic.patternMs).toHaveLength(3);
    expect(intersection.haptic.axisLabel).toContain("x");

    // reducedMotion=true면 스냅은 유지하되 햅틱만 차단
    const reduced = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 900,
      viewportHeight: 600,
      mode: "rule-of-thirds",
      pointerX: firstThirdX.positionPx,
      pointerY: firstThirdY.positionPx,
      previousAxisKey: null,
      reducedMotion: true,
    });
    expect(reduced.snap.isIntersection).toBe(true);
    expect(reduced.haptic.triggerHaptic).toBe(false);
    expect(reduced.haptic.patternMs).toEqual([]);

    // dispatchGridHapticFeedback 안전 송출 검증
    const vibrate = vi.fn(() => true);
    expect(dispatchGridHapticFeedback(intersection.haptic, { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([...intersection.haptic.patternMs]);
    expect(dispatchGridHapticFeedback(reduced.haptic, { vibrate })).toBe(false);
  });

  it("produces golden-ratio and webtoon-gutter landmarks with zero Korean characters in neutral axis labels", () => {
    const golden = computeResponsiveHapticGrid({
      zoom: 2.0,
      viewportWidth: 1000,
      viewportHeight: 1000,
      mode: "golden-ratio",
      pointerX: 382,
      pointerY: 618,
    });
    expect(golden.snap.isIntersection).toBe(true);
    expect(golden.haptic.axisLabel).toContain("Phi");
    expect(golden.haptic.axisLabel).not.toMatch(/[\uAC00-\uD7A3]/u);

    const webtoon = computeResponsiveHapticGrid({
      zoom: 1.0,
      viewportWidth: 800,
      viewportHeight: 1280,
      mode: "webtoon-gutter",
      pointerX: 400,
      pointerY: 640,
    });
    expect(webtoon.snap.didSnapX).toBe(true);
    expect(webtoon.snap.matchedVerticalLine?.label).toBe("Spine 50%");
    expect(webtoon.snap.didSnapY).toBe(true);
    expect(webtoon.haptic.axisLabel).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});
