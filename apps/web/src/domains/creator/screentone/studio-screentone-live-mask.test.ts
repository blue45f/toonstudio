import { describe, expect, it } from "vitest";

import {
  analyzeLiveScreentoneMoire,
  createLiveScreentoneMaskLayer,
  LIVE_SCREENTONE_SPOT_SHAPES,
  renderLiveScreentoneToRgba,
  resetLiveScreentoneMaskEdits,
  updateLiveScreentoneParams,
} from "./studio-screentone-live-mask";

function rectSelection(width = 64, height = 64) {
  return {
    kind: "rect" as const,
    x: 0,
    y: 0,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
  };
}

describe("studio-screentone-live-mask", () => {
  it("SDF 4종 망점(원/마름모/정사각형/별)을 모아레 억제 안티에일리어싱으로 렌더링한다", () => {
    const coverages: number[] = [];

    for (const spotShape of LIVE_SCREENTONE_SPOT_SHAPES) {
      const tone = createLiveScreentoneMaskLayer({
        selection: rectSelection(64, 64),
        params: { kind: "dot", lines: 24, density: 40, angle: 45 },
        spotShape,
        moireSuppression: true,
      });

      const out = renderLiveScreentoneToRgba(tone, { zoomScale: 0.5 });
      expect(out.data.length).toBe(64 * 64 * 4);
      expect(out.meanCoverage).toBeGreaterThan(0.15);
      expect(out.meanCoverage).toBeLessThan(0.75);
      expect(out.moire.recommendedRosetteAngleDeg).toBe(45);
      coverages.push(out.meanCoverage);
    }

    // 4종 망점 모두 유효한 커버리지 산출
    expect(coverages).toHaveLength(4);
  });

  it("사목(Sand/Mezzotint) 노이즈 톤을 결정론적으로 렌더링하고 인쇄용 1비트 2치화를 지원한다", () => {
    const tone = createLiveScreentoneMaskLayer({
      selection: rectSelection(48, 48),
      params: { kind: "sand", density: 35, seed: 77 },
      sandGrainScale: 2,
      sandSoftness: 0.2,
    });

    const outA = renderLiveScreentoneToRgba(tone);
    const outB = renderLiveScreentoneToRgba(tone);
    expect(outA.data).toEqual(outB.data);
    expect(outA.meanCoverage).toBeGreaterThan(0.2);
    expect(outA.meanCoverage).toBeLessThan(0.55);

    const binary = renderLiveScreentoneToRgba(tone, { binaryThreshold: 0.5 });
    for (let i = 3; i < binary.data.length; i += 4) {
      expect(binary.data[i] === 0 || binary.data[i] === 255).toBe(true);
    }
  });

  it("비파괴 파라미터 변경 시 기존 케즈리 마스크가 보존되며 초기화로 원복된다", () => {
    const tone = createLiveScreentoneMaskLayer({
      selection: rectSelection(32, 32),
      params: { kind: "dot", lines: 20, density: 50, angle: 45 },
      spotShape: "circle",
    });

    // 좌측 상단 영역을 수동으로 깎아둔 상태 시뮬레이션
    const scrapedMask = new Float32Array(tone.scrapeMask);
    for (let i = 0; i < 128; i += 1) scrapedMask[i] = 0;
    const scraped = { ...tone, scrapeMask: scrapedMask };

    const updated = updateLiveScreentoneParams(scraped, {
      spotShape: "star",
      layer: { lines: 36, angle: 15 },
    });
    expect(updated.spotShape).toBe("star");
    expect(updated.layer.lines).toBe(36);
    expect(updated.scrapeMask[0]).toBe(0);

    const rendered = renderLiveScreentoneToRgba(updated);
    expect(rendered.scrapedPixelCount).toBe(128);
    expect(rendered.data[3]).toBe(0); // 깎인 픽셀은 완전 투명

    const moire = analyzeLiveScreentoneMoire(updated, 0.25);
    expect(moire.aliasingRisk).toBeGreaterThan(0);

    const restored = resetLiveScreentoneMaskEdits(updated);
    expect(restored.scrapeMask[0]).toBe(1);
  });
});
