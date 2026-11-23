import { describe, expect, it } from "vitest";

import {
  HOG_BRISTLE_HAIR_COUNT,
  REAL_MEDIA_TIP_IDS,
  RealMediaTipAtlasCache,
  TIP_ATLAS_BASE_SIZE,
  computeTipPairwiseDistance,
  generateRealMediaTipMask,
  mixPigmentsKubelkaMunk,
  mixPigmentsKubelkaMunkDetailed,
  sampleTipMaskBilinear,
  selectTipMipLevel,
  type RealMediaTipId,
  type RgbColor,
} from "./real-media-tip-atlas.ts";
import {
  BAKER_TILE_BYTES,
  DEFAULT_BAKER_MAX_MEMORY_BYTES,
  LayerStrokeBitmapBaker,
  compressTileRgbaRle,
  decompressTileRgbaRle,
  makeBakerTileKey,
  type PixelBounds,
} from "./layer-stroke-bitmap-baker.ts";
import {
  IncrementalDeltaStrokeBuffer,
  computeRgbaRegionDiff,
  type DeltaStrokeBrushConfig,
  type StrokePointerSample,
} from "./incremental-delta-stroke-buffer.ts";

function buildLinearSamples(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
  pressureStart = 0.4,
  pressureEnd = 0.9,
): StrokePointerSample[] {
  const samples: StrokePointerSample[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps > 0 ? i / steps : 0;
    samples.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      pressure: pressureStart + (pressureEnd - pressureStart) * t,
      timestampMs: i * 8,
    });
  }
  return samples;
}

describe("실물 매체 128×128 팁 아틀라스 및 Kubelka-Munk 광학 혼색", () => {
  it("8종 실물 팁 마스크가 128×128 해상도·4단 밉맵·높은 쌍별 변별력을 만족한다", () => {
    const masks = REAL_MEDIA_TIP_IDS.map((tipId) => generateRealMediaTipMask(tipId));
    expect(masks).toHaveLength(8);

    for (const mask of masks) {
      expect(mask.size).toBe(TIP_ATLAS_BASE_SIZE);
      expect(mask.data.length).toBe(128 * 128);
      expect(mask.mipmaps.level128.length).toBe(128 * 128);
      expect(mask.mipmaps.level64.length).toBe(64 * 64);
      expect(mask.mipmaps.level32.length).toBe(32 * 32);
      expect(mask.mipmaps.level16.length).toBe(16 * 16);
      expect(mask.stats.coverage).toBeGreaterThan(0.08);
      expect(mask.stats.coverage).toBeLessThan(0.85);

      // 밉맵 에너지 보존 확인(128 → 16 평균 밀도 오차 1e-4 미만)
      let mean16 = 0;
      for (let i = 0; i < mask.mipmaps.level16.length; i += 1) {
        mean16 += mask.mipmaps.level16[i] ?? 0;
      }
      mean16 /= mask.mipmaps.level16.length;
      expect(Math.abs(mean16 - mask.stats.mean)).toBeLessThan(1e-4);

      expect(selectTipMipLevel(mask.mipmaps, 14).size).toBe(16);
      expect(selectTipMipLevel(mask.mipmaps, 36).size).toBe(32);
      expect(selectTipMipLevel(mask.mipmaps, 72).size).toBe(64);
      expect(selectTipMipLevel(mask.mipmaps, 120).size).toBe(128);
      expect(sampleTipMaskBilinear(mask.mipmaps, 0.5, 0.5, 64)).toBeGreaterThanOrEqual(0);
    }

    // 8종 전 쌍(28쌍)이 서로 뚜렷이 구분되어야 한다.
    let minPairDistance = 1;
    for (let i = 0; i < masks.length; i += 1) {
      for (let j = i + 1; j < masks.length; j += 1) {
        const a = masks[i];
        const b = masks[j];
        if (!a || !b) continue;
        const dist = computeTipPairwiseDistance(a.data, b.data);
        if (dist < minPairDistance) minPairDistance = dist;
        expect(dist, `${a.tipId} vs ${b.tipId}`).toBeGreaterThan(0.18);
      }
    }
    expect(minPairDistance).toBeGreaterThan(0.18);
  });

  it("각 화구 고유의 물리 특성(6B 28° 비대칭·48돈모 고랑 분산·G펜 탄성 팽창·크레파스 크럼)을 검증한다", () => {
    const graphite = generateRealMediaTipMask("graphite-pencil-6b");
    const crayon = generateRealMediaTipMask("wax-crayon-block");
    const charcoal = generateRealMediaTipMask("square-charcoal");
    const watercolor = generateRealMediaTipMask("sable-watercolor");
    const hogOil = generateRealMediaTipMask("hog-bristle-oil");
    const marker = generateRealMediaTipMask("marker-chisel-felt");
    const gpenLow = generateRealMediaTipMask("gpen-nib-elastic", { pressure: 0.12 });
    const gpenHigh = generateRealMediaTipMask("gpen-nib-elastic", { pressure: 0.96 });

    // 6B 연필심 28° 비대칭 마모면
    expect(graphite.stats.asymmetryScore).toBeGreaterThan(0.1);
    expect(Math.hypot(graphite.stats.centroidX, graphite.stats.centroidY)).toBeGreaterThan(0.08);

    // 48개 개별 돈모 다발 및 뚜렷한 붓자국 고랑 분산(균일 마커/수채 대비 압도적)
    expect(hogOil.stats.bristleCount).toBe(HOG_BRISTLE_HAIR_COUNT);
    expect(hogOil.stats.furrowVariance).toBeGreaterThan(marker.stats.furrowVariance * 4);
    expect(hogOil.stats.furrowVariance).toBeGreaterThan(watercolor.stats.furrowVariance * 4);

    // G펜 탄성 분할 펜촉: 저필압 극세선 vs 고필압 선명한 팽창
    expect(gpenHigh.stats.coverage).toBeGreaterThan(gpenLow.stats.coverage * 2.5);
    expect(gpenHigh.stats.edgeSharpness).toBeGreaterThan(0.28);

    // 압축 목탄 사각 단면 모서리 파절 비대칭
    expect(charcoal.stats.asymmetryScore).toBeGreaterThan(0.05);

    // 왁스 크레파스 외곽 분리 크럼 존재(반경 r>0.78 영역 비영 픽셀 확인)
    let outerCrumbPixels = 0;
    for (let y = 0; y < 128; y += 1) {
      const ny = ((y + 0.5) / 128) * 2 - 1;
      for (let x = 0; x < 128; x += 1) {
        const nx = ((x + 0.5) / 128) * 2 - 1;
        if (Math.hypot(nx, ny) > 0.78 && (crayon.data[y * 128 + x] ?? 0) > 0.25) {
          outerCrumbPixels += 1;
        }
      }
    }
    expect(outerCrumbPixels).toBeGreaterThan(40);
  });

  it("RealMediaTipAtlasCache가 LRU 적중 및 예산 초과 시 정확히 회수한다", () => {
    const cache = new RealMediaTipAtlasCache({ maxEntries: 8, maxBytes: 1024 * 1024 });
    cache.prewarmAll();
    const afterPrewarm = cache.getStats();
    expect(afterPrewarm.entries).toBe(8);
    expect(afterPrewarm.misses).toBe(8);

    cache.get("hog-bristle-oil");
    cache.get("sable-watercolor");
    expect(cache.getStats().hits).toBe(2);

    // 서로 다른 시드로 10개 추가 요청 시 maxEntries=8 상한을 넘지 않아야 한다.
    for (let s = 1; s <= 10; s += 1) {
      cache.get("graphite-pencil-6b", { seed: 9000 + s });
    }
    const afterEvict = cache.getStats();
    expect(afterEvict.entries).toBeLessThanOrEqual(8);
    expect(afterEvict.bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(afterEvict.evictions).toBeGreaterThanOrEqual(10);
  });

  it("Kubelka-Munk 분광 광학 혼색이 파랑+노랑에서 sRGB 선형 보간 대비 생생한 자연 초록을 생성한다", () => {
    const blueYellowPairs: readonly [string, RgbColor, RgbColor][] = [
      ["울트라마린+카드뮴옐로", { r: 16, g: 69, b: 216 }, { r: 248, g: 214, b: 18 }],
      ["프탈로블루+한사옐로", { r: 0, g: 33, b: 133 }, { r: 252, g: 211, b: 0 }],
      ["순청+순황", { r: 0, g: 40, b: 230 }, { r: 255, g: 235, b: 20 }],
      ["코발트+레몬옐로", { r: 20, g: 82, b: 205 }, { r: 250, g: 240, b: 45 }],
    ];

    for (const [label, blue, yellow] of blueYellowPairs) {
      const mix = mixPigmentsKubelkaMunkDetailed(blue, yellow, 0.5);
      const kmGreenChroma = mix.color.g - (mix.color.r + mix.color.b) * 0.5;
      const lerpGreenChroma = mix.srgbLerp.g - (mix.srgbLerp.r + mix.srgbLerp.b) * 0.5;
      // 자연 초록: G 채널이 R, B 모두보다 뚜렷하게 크고, 적·청 감법 흡수로 초록 크로마·채도가 압도적이다.
      expect(mix.color.g, `${label} G > R`).toBeGreaterThan(mix.color.r);
      expect(mix.color.g, `${label} G > B`).toBeGreaterThan(mix.color.b);
      expect(mix.kmGreenDominance, `${label} 초록 절대 우위`).toBeGreaterThanOrEqual(15);
      expect(kmGreenChroma, `${label} 초록 크로마 우위`).toBeGreaterThan(lerpGreenChroma + 20);
      expect(mix.kmSaturation, `${label} 채도 우위`).toBeGreaterThan(mix.lerpSaturation * 1.8);
    }

    // 경계 및 자기 혼색 정확도(오차 <= 1)
    const blue: RgbColor = { r: 16, g: 69, b: 216 };
    const yellow: RgbColor = { r: 248, g: 214, b: 18 };
    const red: RgbColor = { r: 215, g: 30, b: 45 };
    expect(mixPigmentsKubelkaMunk(blue, yellow, 0)).toEqual(blue);
    expect(mixPigmentsKubelkaMunk(blue, yellow, 1)).toEqual(yellow);
    const selfBlue = mixPigmentsKubelkaMunk(blue, blue, 0.5);
    expect(Math.abs(selfBlue.r - blue.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(selfBlue.g - blue.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(selfBlue.b - blue.b)).toBeLessThanOrEqual(1);

    // 빨강+노랑 → 선명한 주황, 파랑+빨강 → 보라
    const orange = mixPigmentsKubelkaMunk(red, yellow, 0.5);
    expect(orange.r).toBeGreaterThan(210);
    expect(orange.g).toBeGreaterThan(85);
    expect(orange.b).toBeLessThan(65);
    const violet = mixPigmentsKubelkaMunk(blue, red, 0.5);
    expect(violet.b).toBeGreaterThan(violet.g + 50);
    expect(violet.r).toBeGreaterThan(violet.g + 50);
  });
});

describe("O(1) 256×256 타일 비트맵 베이커 성능·메모리 상한·Undo 정합성", () => {
  it("무손실 RLE 압축/복원이 256×256 타일을 픽셀 오차 0으로 복구한다", () => {
    const tile = new Uint8ClampedArray(BAKER_TILE_BYTES);
    for (let y = 40; y < 120; y += 1) {
      for (let x = 30; x < 150; x += 1) {
        const off = (y * 256 + x) * 4;
        tile[off] = (x * 3) & 255;
        tile[off + 1] = (y * 2) & 255;
        tile[off + 2] = 180;
        tile[off + 3] = 220;
      }
    }
    const encoded = compressTileRgbaRle(tile);
    expect(encoded).not.toBeNull();
    expect((encoded?.byteLength ?? BAKER_TILE_BYTES) < BAKER_TILE_BYTES * 0.5).toBe(true);
    const decoded = new Uint8ClampedArray(BAKER_TILE_BYTES);
    if (encoded) decompressTileRgbaRle(encoded, decoded);
    expect(computeRgbaRegionDiff(tile, decoded).maxAbsDiff).toBe(0);
  });

  it("500획 커밋 이후에도 501번째 획 커밋 지연이 O(1)로 1획과 동등하며 < 2ms를 유지한다", () => {
    const atlas = new RealMediaTipAtlasCache();
    atlas.prewarmAll();
    const baker = new LayerStrokeBitmapBaker({ maxMemoryBytes: DEFAULT_BAKER_MAX_MEMORY_BYTES });
    const live = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });

    const runOneStroke = (idx: number, xOffset: number): number => {
      const tipId: RealMediaTipId = REAL_MEDIA_TIP_IDS[idx % REAL_MEDIA_TIP_IDS.length] ?? "graphite-pencil-6b";
      live.beginStroke({
        strokeId: `s-${idx}`,
        tipId,
        color: { r: 28, g: 92, b: 196 },
        radiusPx: 9,
        compositeMode: "source-over",
      });
      live.appendPoints(buildLinearSamples(xOffset, 40 + (idx % 12) * 14, xOffset + 90, 52 + (idx % 12) * 14, 10));
      return live.commitToBaker(baker, "layer-perf").commitElapsedMs;
    };

    // JIT 워밍업
    for (let w = 0; w < 10; w += 1) runOneStroke(w, 20);
    baker.invalidateLayer("layer-perf");

    // 1~20획 초반 평균 vs 501~520획 후반 평균 측정
    const earlyTimes: number[] = [];
    const lateTimes: number[] = [];
    for (let i = 0; i < 520; i += 1) {
      const ms = runOneStroke(i, 30 + (i % 6) * 260);
      if (i < 20) earlyTimes.push(ms);
      if (i >= 500) lateTimes.push(ms);
    }

    const avgEarly = earlyTimes.reduce((a, b) => a + b, 0) / earlyTimes.length;
    const avgLate = lateTimes.reduce((a, b) => a + b, 0) / lateTimes.length;
    expect(avgLate).toBeLessThan(2.0);
    // 500획이 쌓여도 커밋 시간은 O(N) 증가하지 않고 상수 배 이내여야 한다.
    expect(avgLate).toBeLessThan(Math.max(1.5, avgEarly * 2.5));
    expect(baker.getMemoryStats().budgetComplianceOk).toBe(true);
    live.dispose();
    baker.dispose();
  });

  it("엄격한 메모리 상한(2 MiB / 64 MiB)을 단 한 번도 초과하지 않고 LRU 압축·회수 및 dispose 0 bytes를 보장한다", () => {
    const tightCap = 2 * 1024 * 1024;
    const atlas = new RealMediaTipAtlasCache();
    atlas.prewarmAll();
    const baker = new LayerStrokeBitmapBaker({ maxMemoryBytes: tightCap, maxPoolBuffers: 4 });
    const live = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });

    // 24개 서로 다른 256×256 타일(비압축 6 MiB > 2 MiB 상한)에 연속 베이킹
    for (let i = 0; i < 24; i += 1) {
      const tx = i % 6;
      const ty = Math.floor(i / 6);
      const sx = tx * 256 + 48;
      const sy = ty * 256 + 48;
      live.beginStroke({
        strokeId: `cap-${i}`,
        tipId: REAL_MEDIA_TIP_IDS[i % REAL_MEDIA_TIP_IDS.length] ?? "square-charcoal",
        color: { r: 220, g: 80 + (i * 5) % 120, b: 40 },
        radiusPx: 11,
      });
      live.appendPoints(buildLinearSamples(sx, sy, sx + 110, sy + 90, 12));
      live.commitToBaker(baker, "layer-cap");

      const stats = baker.getMemoryStats();
      expect(stats.totalTrackedBytes).toBeLessThanOrEqual(tightCap);
      expect(stats.peakMemoryBytes).toBeLessThanOrEqual(tightCap);
      expect(stats.budgetComplianceOk).toBe(true);
    }

    const finalStats = baker.getMemoryStats();
    expect(finalStats.compressionCount).toBeGreaterThan(0);
    expect(finalStats.poolHits).toBeGreaterThan(0);
    expect(finalStats.budgetComplianceOk).toBe(true);

    // 압축된 초기 타일(0,0)을 다시 읽어도 무손실로 복원되어 유효 픽셀이 남아 있어야 한다.
    const restoredRegion = baker.readRegion("layer-cap", 40, 40, 120, 100);
    let nonZeroAlpha = 0;
    for (let i = 3; i < restoredRegion.length; i += 4) {
      if ((restoredRegion[i] ?? 0) > 0) nonZeroAlpha += 1;
    }
    expect(nonZeroAlpha).toBeGreaterThan(500);

    // dispose 후 누수 0 bytes
    baker.dispose();
    live.dispose();
    expect(baker.getMemoryStats().totalTrackedBytes).toBe(0);
    expect(live.getBufferStats().activeBytes).toBe(0);
    expect(live.getBufferStats().poolBytes).toBe(0);
  });

  it("Undo 시 영향받은 타일만 정밀 무효화·재베이킹하고 무관한 타일은 100% 보존한다", () => {
    const atlas = new RealMediaTipAtlasCache();
    atlas.prewarmAll();
    const baker = new LayerStrokeBitmapBaker();
    const live = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });

    interface RecordedStroke {
      readonly config: DeltaStrokeBrushConfig;
      readonly samples: readonly StrokePointerSample[];
    }
    const history = new Map<string, RecordedStroke>();

    const commitAndRecord = (config: DeltaStrokeBrushConfig, samples: readonly StrokePointerSample[]): void => {
      history.set(config.strokeId, { config, samples });
      live.beginStroke(config);
      live.appendPoints(samples);
      live.commitToBaker(baker, "layer-undo");
    };

    // 타일 (0,0)의 획 A, 타일 (3,3)의 독립 획 B
    commitAndRecord(
      { strokeId: "stroke-A", tipId: "square-charcoal", color: { r: 210, g: 50, b: 40 }, radiusPx: 12 },
      buildLinearSamples(40, 40, 140, 120, 14),
    );
    commitAndRecord(
      { strokeId: "stroke-B", tipId: "marker-chisel-felt", color: { r: 30, g: 130, b: 220 }, radiusPx: 14 },
      buildLinearSamples(800, 800, 910, 890, 14),
    );

    const regionABeforeC = baker.readRegion("layer-undo", 0, 0, 256, 256);
    const regionBBeforeC = baker.readRegion("layer-undo", 768, 768, 256, 256);

    // 타일 (0,0) 위에 겹치는 획 C 추가
    commitAndRecord(
      { strokeId: "stroke-C", tipId: "hog-bristle-oil", color: { r: 240, g: 210, b: 20 }, radiusPx: 15 },
      buildLinearSamples(35, 110, 150, 45, 16),
    );
    expect(computeRgbaRegionDiff(regionABeforeC, baker.readRegion("layer-undo", 0, 0, 256, 256)).mismatchPixels).toBeGreaterThan(200);

    // 획 C Undo → 타일 (0,0)만 무효화되고 획 A만 재베이킹, 타일 (3,3)과 획 B는 미접촉!
    const undo = baker.undoLastStroke("layer-undo", (remainingId: string, clipBounds: PixelBounds) => {
      const rec = history.get(remainingId);
      if (!rec) return;
      live.beginStroke({ ...rec.config, clipBounds });
      live.appendPoints(rec.samples);
      live.commitToBaker(baker, "layer-undo", false);
    });

    expect(undo.removedStrokeId).toBe("stroke-C");
    expect(undo.invalidatedTileKeys).toContain(makeBakerTileKey("layer-undo", 0, 0));
    expect(undo.invalidatedTileKeys).not.toContain(makeBakerTileKey("layer-undo", 3, 3));
    expect(undo.replayedStrokeIds).toEqual(["stroke-A"]);

    // 영역 A가 획 C 직전 픽셀과 0.0000 완벽 일치, 영역 B도 0.0000 보존
    expect(computeRgbaRegionDiff(regionABeforeC, baker.readRegion("layer-undo", 0, 0, 256, 256)).maxAbsDiff).toBe(0);
    expect(computeRgbaRegionDiff(regionBBeforeC, baker.readRegion("layer-undo", 768, 768, 256, 256)).maxAbsDiff).toBe(0);

    live.dispose();
    baker.dispose();
  });
});

describe("O(Δ) 증분 스트로크 라이브 버퍼 === 커밋 타일 픽셀 오차 0.0000 패리티", () => {
  it("빈 캔버스·겹칠·Kubelka-Munk 습식 혼색·지우개 전 모드에서 Live === Committed 오차 0.0000을 증명한다", () => {
    const atlas = new RealMediaTipAtlasCache();
    atlas.prewarmAll();
    const baker = new LayerStrokeBitmapBaker();
    const live = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });

    // 1) 밑칠: 카드뮴 옐로 수채 바탕
    const baseSamples = buildLinearSamples(60, 120, 340, 120, 32, 0.75, 0.85);
    live.beginStroke({
      strokeId: "base-yellow",
      tipId: "sable-watercolor",
      color: { r: 248, g: 214, b: 18 },
      radiusPx: 22,
      opacity: 0.92,
      compositeMode: "kubelka-munk",
      wetMixStrength: 0.9,
    });
    // 포인터 이벤트를 4포인트 델타 청크로 순차 전달
    for (let i = 0; i < baseSamples.length; i += 4) {
      live.appendPoints(baseSamples.slice(i, i + 4));
    }
    const basePreview = live.composePreviewRegion(baker, "layer-parity", 20, 60, 360, 140);
    const baseCommit = live.commitToBaker(baker, "layer-parity");
    expect(baseCommit.reRasterizedDabs).toBe(0);
    const baseCommitted = baker.readRegion("layer-parity", 20, 60, 360, 140);
    const baseDiff = computeRgbaRegionDiff(basePreview, baseCommitted);
    expect(baseDiff.maxAbsDiff).toBe(0);
    expect(baseDiff.rmse).toBe(0);

    // 2) 교차 겹칠: 울트라마린 블루 수채 붓으로 노랑 위를 통과(Kubelka-Munk 초록 혼색 + 0.0000 패리티!)
    const crossSamples = buildLinearSamples(190, 40, 210, 210, 28, 0.6, 0.9);
    live.beginStroke({
      strokeId: "wet-blue-over-yellow",
      tipId: "sable-watercolor",
      color: { r: 16, g: 69, b: 216 },
      radiusPx: 20,
      opacity: 0.72,
      compositeMode: "kubelka-munk",
      wetMixStrength: 0.95,
    });
    for (let i = 0; i < crossSamples.length; i += 3) {
      live.appendPoints(crossSamples.slice(i, i + 3));
    }
    const wetPreview = live.composePreviewRegion(baker, "layer-parity", 20, 20, 360, 220);
    const wetCommit = live.commitToBaker(baker, "layer-parity");
    expect(wetCommit.reRasterizedDabs).toBe(0);
    const wetCommitted = baker.readRegion("layer-parity", 20, 20, 360, 220);
    const wetDiff = computeRgbaRegionDiff(wetPreview, wetCommitted);
    expect(wetDiff.maxAbsDiff).toBe(0);
    expect(wetDiff.rmse).toBe(0);
    expect(wetDiff.mismatchPixels).toBe(0);

    // 교차점(200, 120)은 파랑+노랑 Kubelka-Munk 광학 혼색으로 초록(G > R, G > B)이 되어야 한다.
    const [ir, ig, ib, ia] = baker.readPixel("layer-parity", 200, 120);
    expect(ia).toBeGreaterThan(120);
    expect(ig).toBeGreaterThan(ir + 15);
    expect(ig).toBeGreaterThan(ib + 15);

    // 3) 지우개 모드 패리티 검증
    live.beginStroke({
      strokeId: "erase-pass",
      tipId: "gpen-nib-elastic",
      color: { r: 0, g: 0, b: 0 },
      radiusPx: 14,
      opacity: 0.9,
      compositeMode: "erase",
    });
    live.appendPoints(buildLinearSamples(150, 90, 260, 150, 18, 0.85, 0.85));
    const erasePreview = live.composePreviewRegion(baker, "layer-parity", 20, 20, 360, 220);
    live.commitToBaker(baker, "layer-parity");
    const eraseCommitted = baker.readRegion("layer-parity", 20, 20, 360, 220);
    expect(computeRgbaRegionDiff(erasePreview, eraseCommitted).maxAbsDiff).toBe(0);

    live.dispose();
    baker.dispose();
  });

  it("델타 청크 분할 불변성(1점씩 전달 === 일괄 전달) 및 장거리 2,000px O(Δ) 스탬핑을 검증한다", () => {
    const atlas = new RealMediaTipAtlasCache();
    atlas.prewarmAll();
    const samples = buildLinearSamples(24, 64, 2024, 144, 200, 0.3, 0.95);
    const cfg: DeltaStrokeBrushConfig = {
      strokeId: "chunk-test",
      tipId: "hog-bristle-oil",
      color: { r: 35, g: 112, b: 78 },
      radiusPx: 12,
      compositeMode: "source-over",
      seed: 777,
    };

    const bakerBatch = new LayerStrokeBitmapBaker();
    const liveBatch = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
    liveBatch.beginStroke(cfg);
    liveBatch.appendPoints(samples);
    liveBatch.commitToBaker(bakerBatch, "L");

    const bakerChunked = new LayerStrokeBitmapBaker();
    const liveChunked = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
    liveChunked.beginStroke(cfg);
    const earlyChunkMs: number[] = [];
    const lateChunkMs: number[] = [];
    for (let i = 0; i < samples.length; i += 2) {
      const res = liveChunked.appendPoints(samples.slice(i, i + 2));
      if (i >= 10 && i < 50) earlyChunkMs.push(res.elapsedMs);
      if (i >= 160) lateChunkMs.push(res.elapsedMs);
    }
    liveChunked.commitToBaker(bakerChunked, "L");

    // 1) 일괄 전달 vs 2포인트씩 델타 증분 전달의 픽셀 오차 = 0.0000
    const diff = computeRgbaRegionDiff(
      bakerBatch.readRegion("L", 0, 20, 2060, 160),
      bakerChunked.readRegion("L", 0, 20, 2060, 160),
    );
    expect(diff.maxAbsDiff).toBe(0);
    expect(diff.mismatchPixels).toBe(0);

    // 2) O(Δ) 검증: 후반 델타 청크 시간이 초반 대비 선형 증가(O(N))하지 않는다.
    const earlyAvg = earlyChunkMs.reduce((a, b) => a + b, 0) / earlyChunkMs.length;
    const lateAvg = lateChunkMs.reduce((a, b) => a + b, 0) / lateChunkMs.length;
    expect(lateAvg).toBeLessThan(Math.max(1.5, earlyAvg * 2.5));

    liveBatch.dispose();
    liveChunked.dispose();
    bakerBatch.dispose();
    bakerChunked.dispose();
  });
});
