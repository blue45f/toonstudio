import { describe, expect, it } from "vitest";

import {
  createLiveScreentoneMaskLayer,
  renderLiveScreentoneToRgba,
} from "./studio-screentone-live-mask";
import {
  applyScreentoneScrapeStroke,
  resampleScrapeStroke,
  SCREENTONE_SCRAPE_PRESETS,
} from "./studio-screentone-scrape-brush";

function makeBaseLayer(size = 64) {
  return createLiveScreentoneMaskLayer({
    selection: {
      kind: "rect",
      x: 0,
      y: 0,
      width: size,
      height: size,
      canvasWidth: size,
      canvasHeight: size,
    },
    params: { kind: "dot", lines: 24, density: 50, angle: 45 },
    spotShape: "circle",
  });
}

describe("studio-screentone-scrape-brush", () => {
  it("스트로크를 스페이싱에 맞춰 보간하고 4종 케즈리 프리셋으로 비파괴 깎기를 수행한다", () => {
    const resampled = resampleScrapeStroke(
      [
        { x: 10, y: 10, pressure: 0.4 },
        { x: 50, y: 10, pressure: 1.0 },
      ],
      8,
    );
    expect(resampled.length).toBeGreaterThanOrEqual(6);
    expect(resampled[resampled.length - 1]!.x).toBe(50);

    const base = makeBaseLayer(64);
    const beforeRender = renderLiveScreentoneToRgba(base);

    for (const preset of SCREENTONE_SCRAPE_PRESETS) {
      const result = applyScreentoneScrapeStroke(
        base,
        [
          { x: 16, y: 32, pressure: 0.9 },
          { x: 48, y: 32, pressure: 0.9 },
        ],
        preset.settings,
      );

      expect(result.dabCount).toBeGreaterThan(1);
      expect(result.affectedPixels).toBeGreaterThan(0);
      expect(result.dirtyRect).not.toBeNull();
      // 원본 불변성 유지
      expect(base.scrapeMask[32 * 64 + 32]).toBe(1);

      const afterRender = renderLiveScreentoneToRgba(result.layer);
      expect(afterRender.meanCoverage).toBeLessThan(beforeRender.meanCoverage);
    }
  });

  it("복원(restore)과 농도 덧칠(darken) 모드가 기대대로 마스크와 농도 오프셋을 갱신한다", () => {
    const base = makeBaseLayer(48);
    const gauze = SCREENTONE_SCRAPE_PRESETS[0]!.settings;

    const scraped = applyScreentoneScrapeStroke(
      base,
      [{ x: 24, y: 24, pressure: 1 }],
      { ...gauze, radiusPx: 14, strength: 0.9 },
    );
    const centerIdx = 24 * 48 + 24;
    expect(scraped.layer.scrapeMask[centerIdx]!).toBeLessThan(0.5);

    const restored = applyScreentoneScrapeStroke(
      scraped.layer,
      [{ x: 24, y: 24, pressure: 1 }],
      { ...gauze, mode: "restore", radiusPx: 14, strength: 0.95 },
    );
    expect(restored.layer.scrapeMask[centerIdx]!).toBeGreaterThan(
      scraped.layer.scrapeMask[centerIdx]!,
    );

    const darkened = applyScreentoneScrapeStroke(
      base,
      [{ x: 24, y: 24, pressure: 1 }],
      { ...gauze, mode: "darken", radiusPx: 12, strength: 0.8 },
    );
    expect(darkened.layer.densityBias[centerIdx]!).toBeGreaterThan(0.1);
  });
});
