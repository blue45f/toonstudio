import { describe, expect, it } from "vitest";
import {
  COMIC_SFX_LEXICON,
  SUPPORTED_SFX_LOCALES,
  VERTICAL_WRITING_LOCALES,
  applyCleanPlatePatchToPanel,
  compileMultilingualSfxVariantPack,
  extractSfxAlphaMask,
  localeSupportsVerticalWriting,
  localizeComicSfxEntry,
  measureCleanPlateErrorAgainstGroundTruth,
  reconstructCleanPlateBehindSfx,
  renderLocalizedSfxSvgOverlay,
  restoreOriginalSfxFromCleanPlatePatch,
  synthesizeLocalizedSfxVectorLayer,
  type OriginalSfxVisualEnergySpec,
  type Rect2D,
  type RgbaPanelBuffer,
  type SfxBrushTextureStyle,
  type SfxLocale,
} from "./index";

function createPanel(
  width: number,
  height: number,
  painter: (x: number, y: number) => readonly [number, number, number, number],
): RgbaPanelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = painter(x, y);
      const off = (y * width + x) * 4;
      data[off] = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = a;
    }
  }
  return { width, height, data };
}

function paintSfxOverlay(
  base: RgbaPanelBuffer,
  mask: Uint8Array,
  sfxColor: readonly [number, number, number, number] = [235, 38, 48, 255],
): RgbaPanelBuffer {
  const data = new Uint8ClampedArray(base.data);
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) > 0) {
      const off = i * 4;
      data[off] = sfxColor[0];
      data[off + 1] = sfxColor[1];
      data[off + 2] = sfxColor[2];
      data[off + 3] = sfxColor[3];
    }
  }
  return { width: base.width, height: base.height, data };
}

function createRectMask(width: number, height: number, rect: Rect2D): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x >= 0 && x < width) mask[y * width + x] = 255;
    }
  }
  return mask;
}

function pixelLuma(panel: RgbaPanelBuffer, x: number, y: number): number {
  const off = (y * panel.width + x) * 4;
  return 0.299 * (panel.data[off] ?? 0) + 0.587 * (panel.data[off + 1] ?? 0) + 0.114 * (panel.data[off + 2] ?? 0);
}

describe("Wave 77: Clean-Plate 배경 복원 및 비파괴 SFX 마스킹", () => {
  it("마스크 바깥 모든 픽셀이 100% 비트 일치해야 한다 (mutatedOutsideMaskPixels === 0)", () => {
    const cleanBg = createPanel(72, 56, (x, y) => [Math.round(80 + x * 2), Math.round(120 + y * 1.8), 210, 255]);
    const mask = new Uint8Array(72 * 56);
    for (let y = 0; y < 56; y += 1) {
      for (let x = 0; x < 72; x += 1) {
        if ((x - 30) * (x - 30) + (y - 26) * (y - 26) <= 64 || (x >= 42 && x <= 56 && Math.abs(y - (x - 16)) <= 2)) {
          mask[y * 72 + x] = 255;
        }
      }
    }
    const occluded = paintSfxOverlay(cleanBg, mask, [255, 220, 20, 255]);
    const result = reconstructCleanPlateBehindSfx(occluded, mask);

    expect(result.metrics.mutatedOutsideMaskPixels).toBe(0);
    expect(result.metrics.maskedPixelCount).toBeGreaterThan(150);
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 0) {
        const off = i * 4;
        expect(result.restoredPanel.data[off]).toBe(occluded.data[off]);
        expect(result.restoredPanel.data[off + 1]).toBe(occluded.data[off + 1]);
        expect(result.restoredPanel.data[off + 2]).toBe(occluded.data[off + 2]);
        expect(result.restoredPanel.data[off + 3]).toBe(occluded.data[off + 3]);
      }
    }
  });

  it("선형 2D 배경 그라데이션을 가린 SFX 뒤에서 MAE < 12로 복원한다", () => {
    const cleanBg = createPanel(80, 64, (x, y) => [
      Math.round(40 + (x / 79) * 180),
      Math.round(60 + (y / 63) * 150),
      Math.round(190 - (x / 79) * 90),
      255,
    ]);
    const mask = createRectMask(80, 64, { x: 26, y: 20, width: 24, height: 18 });
    const result = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask), mask);
    const err = measureCleanPlateErrorAgainstGroundTruth(result.restoredPanel, cleanBg, mask);

    expect(result.metrics.mutatedOutsideMaskPixels).toBe(0);
    expect(err.mae).toBeLessThan(12);
    expect(err.psnr).toBeGreaterThan(30);
  });

  it("완만한 이차/방사형 그라데이션에서도 이중조화 곡률 연속으로 MAE < 12를 유지한다", () => {
    const cleanBg = createPanel(76, 64, (x, y) => {
      const r2 = Math.min(1, ((x - 38) / 38) ** 2 + ((y - 32) / 32) ** 2);
      const val = Math.round(235 - r2 * 95);
      return [val, Math.round(val * 0.92), Math.round(240 - r2 * 45), 255];
    });
    const mask = createRectMask(76, 64, { x: 30, y: 24, width: 16, height: 14 });
    const result = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask, [20, 20, 240, 255]), mask);
    const err = measureCleanPlateErrorAgainstGroundTruth(result.restoredPanel, cleanBg, mask);

    expect(err.mae).toBeLessThan(12);
    expect(result.metrics.mutatedOutsideMaskPixels).toBe(0);
  });

  it("마스크를 가로지르는 어두운 수평 만화 칸 경계선을 번짐 없이 연속 복원한다", () => {
    const cleanBg = createPanel(80, 60, (_x, y) => (y === 30 || y === 31 ? [18, 18, 22, 255] : [242, 240, 234, 255]));
    const mask = createRectMask(80, 60, { x: 28, y: 22, width: 22, height: 18 });
    const result = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask), mask);

    expect(result.metrics.mutatedOutsideMaskPixels).toBe(0);
    expect(result.metrics.detectedLineBridges).toBeGreaterThanOrEqual(1);
    const lineMidLuma = (pixelLuma(result.restoredPanel, 39, 30) + pixelLuma(result.restoredPanel, 39, 31)) / 2;
    expect(lineMidLuma).toBeLessThan(75);
    expect(pixelLuma(result.restoredPanel, 39, 25)).toBeGreaterThan(210);
    expect(pixelLuma(result.restoredPanel, 39, 36)).toBeGreaterThan(210);
    expect(measureCleanPlateErrorAgainstGroundTruth(result.restoredPanel, cleanBg, mask).mae).toBeLessThan(18);
  });

  it("마스크를 수직으로 관통하는 어두운 만화 칸 선화를 연속 복원한다", () => {
    const cleanBg = createPanel(64, 80, (x, _y) => (x === 32 || x === 33 ? [16, 16, 20, 255] : [236, 238, 242, 255]));
    const mask = createRectMask(64, 80, { x: 24, y: 30, width: 18, height: 20 });
    const result = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask, [255, 190, 20, 255]), mask);

    expect(result.metrics.detectedLineBridges).toBeGreaterThanOrEqual(1);
    expect(pixelLuma(result.restoredPanel, 32, 40)).toBeLessThan(75);
    expect(pixelLuma(result.restoredPanel, 27, 40)).toBeGreaterThan(205);
    expect(pixelLuma(result.restoredPanel, 38, 40)).toBeGreaterThan(205);
  });

  it("대각선 속도선/배경 선화가 마스크를 통과할 때도 접선 방향으로 이어 복원한다", () => {
    const cleanBg = createPanel(72, 72, (x, y) => (Math.abs(x - y) <= 1 ? [22, 24, 28, 255] : [244, 242, 238, 255]));
    const mask = createRectMask(72, 72, { x: 28, y: 28, width: 14, height: 14 });
    const result = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask, [220, 35, 90, 255]), mask);

    expect(result.metrics.detectedLineBridges).toBeGreaterThanOrEqual(1);
    expect(pixelLuma(result.restoredPanel, 35, 35)).toBeLessThan(110);
    expect(pixelLuma(result.restoredPanel, 39, 30)).toBeGreaterThan(200);
    expect(result.metrics.mutatedOutsideMaskPixels).toBe(0);
  });

  it("주기적 스크린톤 도트 배경에서 패치 매칭 보정을 활성화해 질감을 복원한다", () => {
    const cleanBg = createPanel(72, 64, (x, y) => {
      const v = x % 4 === 1 && y % 4 === 1 ? 72 : 236;
      return [v, v, v, 255];
    });
    const mask = createRectMask(72, 64, { x: 28, y: 24, width: 12, height: 12 });
    const res = reconstructCleanPlateBehindSfx(paintSfxOverlay(cleanBg, mask), mask, {
      enableScreentonePatchMatch: true,
      patchRadiusPx: 2,
      searchRadiusPx: 10,
    });

    expect(res.metrics.screentonePatchesApplied).toBeGreaterThan(0);
    expect(res.metrics.mutatedOutsideMaskPixels).toBe(0);
    let minL = 255;
    let maxL = 0;
    for (let y = 24; y < 36; y += 1) {
      for (let x = 28; x < 40; x += 1) {
        const l = pixelLuma(res.restoredPanel, x, y);
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
    }
    expect(maxL - minL).toBeGreaterThan(90);
  });

  it("원본 한국어 백업 패치로 복원하면 비트 단위 무손실(psnr === Infinity, diffPixels === 0)을 보장한다", () => {
    const cleanBg = createPanel(64, 48, (x, y) => [100 + x, 140 + y, 190, 255]);
    const mask = createRectMask(64, 48, { x: 18, y: 12, width: 22, height: 16 });
    const originalKo = paintSfxOverlay(cleanBg, mask, [225, 25, 40, 255]);

    const { restoredPanel, patch } = reconstructCleanPlateBehindSfx(originalKo, mask);
    expect(measureCleanPlateErrorAgainstGroundTruth(restoredPanel, originalKo).diffPixels).toBeGreaterThan(0);

    const recoveredKo = restoreOriginalSfxFromCleanPlatePatch(restoredPanel, patch);
    const parity = measureCleanPlateErrorAgainstGroundTruth(recoveredKo, originalKo);
    expect(parity.diffPixels).toBe(0);
    expect(parity.psnr).toBe(Number.POSITIVE_INFINITY);
    expect(parity.maxChannelError).toBe(0);
  });

  it("저장된 CleanPlatePatch를 원본 패널에 재적용하면 직접 복원 결과와 비트 일치한다", () => {
    const bg = createPanel(60, 48, (x, y) => [210 - x, 190 - y, 220, 255]);
    const mask = createRectMask(60, 48, { x: 20, y: 14, width: 16, height: 14 });
    const original = paintSfxOverlay(bg, mask, [250, 60, 30, 255]);

    const { restoredPanel, patch } = reconstructCleanPlateBehindSfx(original, mask);
    const parity = measureCleanPlateErrorAgainstGroundTruth(applyCleanPlatePatchToPanel(original, patch), restoredPanel);
    expect(parity.diffPixels).toBe(0);
    expect(parity.psnr).toBe(Number.POSITIVE_INFINITY);
  });

  it("다각형 ROI 내 고채도/고대비 한국어 SFX를 자동 마스킹해 컷아웃을 분리한다", () => {
    const bg = createPanel(64, 48, () => [240, 238, 232, 255]);
    const glyphMask = createRectMask(64, 48, { x: 22, y: 16, width: 18, height: 12 });
    const extracted = extractSfxAlphaMask(paintSfxOverlay(bg, glyphMask, [228, 32, 42, 255]), {
      boundingPolygon: [{ x: 18, y: 12 }, { x: 46, y: 12 }, { x: 46, y: 34 }, { x: 18, y: 34 }],
    });

    expect(extracted.maskedPixelCount).toBe(18 * 12);
    expect(extracted.bounds).toEqual({ x: 22, y: 16, width: 18, height: 12 });
    expect(extracted.sfxCutoutRgba.length).toBe(18 * 12 * 4);
  });

  it("빈 마스크와 잘못된 버퍼 길이를 안전하게 처리한다", () => {
    const panel = createPanel(32, 24, () => [200, 200, 200, 255]);
    const emptyRes = reconstructCleanPlateBehindSfx(panel, new Uint8Array(32 * 24));
    expect(emptyRes.metrics.maskedPixelCount).toBe(0);
    expect(emptyRes.metrics.mutatedOutsideMaskPixels).toBe(0);

    expect(() =>
      reconstructCleanPlateBehindSfx({ width: 10, height: 10, data: new Uint8ClampedArray(12) }, new Uint8Array(100)),
    ).toThrow(RangeError);
  });
});

describe("Wave 77: 7개 로케일 SFX 사전 및 브러시 질감 벡터 합성기", () => {
  it("정통 웹툰 의성어 사전이 18종 이상이며 모든 항목이 7개 로케일 번역을 보유한다", () => {
    expect(COMIC_SFX_LEXICON.length).toBeGreaterThanOrEqual(18);
    expect(SUPPORTED_SFX_LOCALES).toEqual(["ko", "ja", "en", "fr", "es", "zh-Hant", "th"]);
    for (const entry of COMIC_SFX_LEXICON) {
      for (const locale of SUPPORTED_SFX_LOCALES) {
        expect(entry.translations[locale].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("대표 효과음(폭발·심장·질주·지진·폭우·섬광·금속)을 7개 로케일로 정확히 매핑한다", () => {
    expect(localizeComicSfxEntry("콰과광", "en").localizedText).toBe("BOOM");
    expect(localizeComicSfxEntry("콰과광", "ja").localizedText).toBe("ドゴォン");
    expect(localizeComicSfxEntry("콰과광", "fr").localizedText).toBe("BOUM");
    expect(localizeComicSfxEntry("콰과광", "es").localizedText).toBe("¡BUM!");
    expect(localizeComicSfxEntry("콰과광", "zh-Hant").localizedText).toBe("轟隆隆");
    expect(localizeComicSfxEntry("콰과광", "th").localizedText).toBe("ตูมมม!");
    expect(localizeComicSfxEntry("두근두근", "ja").localizedText).toBe("ドキドキ");
    expect(localizeComicSfxEntry("두근두근", "en").localizedText).toBe("BA-DUMP");
    expect(localizeComicSfxEntry("휙", "ja").localizedText).toBe("シュッ");
    expect(localizeComicSfxEntry("휙", "en").localizedText).toBe("WHOOSH");
    expect(localizeComicSfxEntry("우르릉", "ja").localizedText).toBe("ゴゴゴ");
    expect(localizeComicSfxEntry("우르릉", "en").localizedText).toBe("RUMBLE");
    expect(localizeComicSfxEntry("쏴아아", "ja").localizedText).toBe("ザーッ");
    expect(localizeComicSfxEntry("쏴아아", "en").localizedText).toBe("POUR");
    expect(localizeComicSfxEntry("번쩍", "ja").localizedText).toBe("ピカッ");
    expect(localizeComicSfxEntry("철컥", "en").localizedText).toBe("CLICK");
  });

  it("유의 별칭과 부분 어근 입력도 해당 카테고리로 매칭한다", () => {
    const aliasMatch = localizeComicSfxEntry("콩닥콩닥", "ja");
    expect(aliasMatch.categoryId).toBe("heartbeat");
    expect(aliasMatch.matchKind).toBe("alias");
    expect(aliasMatch.localizedText).toBe("ドキドキ");

    const fuzzyMatch = localizeComicSfxEntry("초대형콰광!!", "en");
    expect(fuzzyMatch.categoryId).toBe("impact-explosion");
    expect(fuzzyMatch.matchKind).toBe("fuzzy-root");
    expect(fuzzyMatch.localizedText).toBe("BOOM");
  });

  it("사전에 없는 창작 커스텀 한국어 SFX를 7개 로케일로 결정론적 음차 폴백한다", () => {
    for (const locale of SUPPORTED_SFX_LOCALES) {
      const first = localizeComicSfxEntry("크아아악", locale);
      const second = localizeComicSfxEntry("크아아악", locale);
      expect(first.matchKind).toBe("transliterated-fallback");
      expect(first.localizedText.length).toBeGreaterThan(0);
      expect(first.localizedText).toBe(second.localizedText);
    }
    expect(localizeComicSfxEntry("뽀용", "en").localizedText).toBe("PPOYONG");
    expect(localizeComicSfxEntry("뽀용", "es").localizedText).toBe("¡PPOYONG!");
  });

  it("세로쓰기(vertical-rl)는 ko/ja/zh-Hant에서 유지하고 en/fr/es/th는 가로쓰기로 자동 정규화한다", () => {
    const baseSpec: OriginalSfxVisualEnergySpec = {
      sourceKoText: "우르릉",
      originalBounds: { x: 40, y: 30, width: 64, height: 180 },
      safeEnvelope: { x: 10, y: 10, width: 320, height: 240 },
      protectedSpeechBalloons: [],
      requestedWritingMode: "vertical-rl",
      preferredFontSizePx: 36,
    };

    for (const locale of VERTICAL_WRITING_LOCALES) {
      expect(localeSupportsVerticalWriting(locale)).toBe(true);
      const layer = synthesizeLocalizedSfxVectorLayer(baseSpec, locale);
      expect(layer.resolvedWritingMode).toBe("vertical-rl");
      expect(layer.writingModeNormalized).toBe(false);
      expect(layer.clippedGlyphCount).toBe(0);
      expect(layer.fitsSafeEnvelope).toBe(true);
    }
    for (const locale of ["en", "fr", "es", "th"] as readonly SfxLocale[]) {
      expect(localeSupportsVerticalWriting(locale)).toBe(false);
      const layer = synthesizeLocalizedSfxVectorLayer(baseSpec, locale);
      expect(layer.resolvedWritingMode).toBe("horizontal-tb");
      expect(layer.writingModeNormalized).toBe(true);
      expect(layer.clippedGlyphCount).toBe(0);
      expect(layer.fitsSafeEnvelope).toBe(true);
    }
  });

  it("보호 말풍선 영역이 원작 위치와 겹쳐도 겹침 면적 0(balloonOverlapAreaPx === 0)으로 회피 배치한다", () => {
    const spec: OriginalSfxVisualEnergySpec = {
      sourceKoText: "콰과광",
      originalBounds: { x: 100, y: 80, width: 120, height: 60 },
      safeEnvelope: { x: 20, y: 20, width: 360, height: 260 },
      protectedSpeechBalloons: [
        { x: 90, y: 65, width: 150, height: 95 },
        { x: 250, y: 25, width: 120, height: 110 },
      ],
      balloonClearancePx: 6,
      tiltAngleDeg: -14,
      arcCurvature: 0.35,
    };
    for (const locale of SUPPORTED_SFX_LOCALES) {
      const layer = synthesizeLocalizedSfxVectorLayer(spec, locale);
      expect(layer.balloonOverlapAreaPx).toBe(0);
      expect(layer.fitsSafeEnvelope).toBe(true);
      expect(layer.clippedGlyphCount).toBe(0);
    }
  });

  it("5종 브러시 질감 스타일과 기울기·아크·할로·필압 프로파일을 보존한다", () => {
    const styles: readonly SfxBrushTextureStyle[] = [
      "dry-brush-impact", "tremble-horror", "soft-romance-glow", "speed-slash-ink", "metallic-clang",
    ];
    for (const brushStyle of styles) {
      const layer = synthesizeLocalizedSfxVectorLayer(
        {
          sourceKoText: "찌릿",
          originalBounds: { x: 50, y: 50, width: 140, height: 70 },
          safeEnvelope: { x: 10, y: 10, width: 300, height: 200 },
          protectedSpeechBalloons: [],
          brushStyle,
          tiltAngleDeg: 16,
          slantShearDeg: -12,
          arcCurvature: -0.4,
          outlineHaloThicknessPx: 5,
          strokeWeightProfile: { startScale: 0.8, peakScale: 1.3, endScale: 0.85 },
        },
        "en",
      );
      expect(layer.brushStyle).toBe(brushStyle);
      expect(layer.tiltAngleDeg).toBe(16);
      expect(layer.slantShearDeg).toBe(-12);
      expect(layer.arcPath.curvature).toBe(-0.4);
      expect(layer.brushStrokePaths.length).toBeGreaterThanOrEqual(2);
      for (const stroke of layer.brushStrokePaths) {
        for (const pt of stroke.points) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    }
  });

  it("좁은 안전 경계와 긴 다국어 문자열에서도 NaN 없이 안전하게 축소 배치한다", () => {
    const layer = synthesizeLocalizedSfxVectorLayer(
      {
        sourceKoText: "번쩍",
        originalBounds: { x: 10, y: 10, width: 48, height: 24 },
        safeEnvelope: { x: 8, y: 8, width: 64, height: 32 },
        protectedSpeechBalloons: [],
        preferredFontSizePx: 48,
      },
      "es",
    );
    expect(layer.fitsSafeEnvelope).toBe(true);
    expect(layer.glyphs.length).toBeGreaterThan(0);
    for (const g of layer.glyphs) {
      expect(Number.isFinite(g.centerX) && Number.isFinite(g.centerY) && Number.isFinite(g.fontSizePx)).toBe(true);
    }
  });
});

describe("Wave 77: 다국어 SFX 변형 번들 컴파일러 및 SVG 오버레이 익스포터", () => {
  it("renderLocalizedSfxSvgOverlay가 XML 이스케이프와 클린플레이트 좌표를 포함한 유효 SVG를 출력한다", () => {
    const layer = synthesizeLocalizedSfxVectorLayer(
      {
        sourceKoText: "콰과광",
        originalBounds: { x: 60, y: 40, width: 120, height: 60 },
        safeEnvelope: { x: 10, y: 10, width: 320, height: 200 },
        protectedSpeechBalloons: [],
        brushStyle: "dry-brush-impact",
      },
      "es",
    );
    const rendered = renderLocalizedSfxSvgOverlay(layer, {
      panelWidth: 340,
      panelHeight: 220,
      cleanPlateBounds: { x: 58, y: 38, width: 124, height: 64 },
    });

    expect(rendered.hasInvalidCoordinates).toBe(false);
    expect(rendered.svgMarkup).toContain("<svg xmlns=\"http://www.w3.org/2000/svg\"");
    expect(rendered.svgMarkup).toContain("viewBox=\"0 0 340 220\"");
    expect(rendered.svgMarkup).toContain("data-layer=\"clean-plate-patch\"");
    expect(rendered.svgMarkup).toContain("data-layer=\"sfx-brush-accents\"");
    expect(rendered.svgMarkup).toContain("data-layer=\"sfx-glyphs\"");
    expect(rendered.svgMarkup).not.toContain("NaN");
    expect(rendered.svgMarkup).not.toContain("Infinity");
    expect(rendered.vectorPathCount).toBeGreaterThanOrEqual(2);
    expect(rendered.byteLength).toBeGreaterThan(200);
  });

  it("세로쓰기 일본어 SVG 오버레이에 writing-mode='vertical-rl'을 기록한다", () => {
    const layer = synthesizeLocalizedSfxVectorLayer(
      {
        sourceKoText: "두근두근",
        originalBounds: { x: 40, y: 20, width: 52, height: 150 },
        safeEnvelope: { x: 10, y: 10, width: 220, height: 220 },
        protectedSpeechBalloons: [],
        requestedWritingMode: "vertical-rl",
      },
      "ja",
    );
    const svg = renderLocalizedSfxSvgOverlay(layer, { panelWidth: 240, panelHeight: 240 });
    expect(svg.writingMode).toBe("vertical-rl");
    expect(svg.svgMarkup).toContain("writing-mode=\"vertical-rl\"");
    expect(svg.hasInvalidCoordinates).toBe(false);
  });

  it("원스톱 파이프라인으로 7개 로케일 번들·SVG·Rights BOM·원본 한국어 복귀까지 일괄 검증한다", () => {
    const cleanBg = createPanel(120, 96, (x, y) =>
      y === 48 ? [20, 20, 24, 255] : [Math.round(180 + (x / 119) * 55), Math.round(195 + (y / 95) * 45), 235, 255],
    );
    const sfxMask = createRectMask(120, 96, { x: 38, y: 36, width: 32, height: 22 });
    const koreanPanel = paintSfxOverlay(cleanBg, sfxMask, [230, 30, 40, 255]);
    const cleanResult = reconstructCleanPlateBehindSfx(koreanPanel, sfxMask);
    expect(cleanResult.metrics.mutatedOutsideMaskPixels).toBe(0);

    const pack = compileMultilingualSfxVariantPack({
      packId: "ep01-cut04-sfx-01",
      panelWidth: 120,
      panelHeight: 96,
      cleanPlatePatch: cleanResult.patch,
      visualSpec: {
        sourceKoText: "콰과광",
        originalBounds: cleanResult.patch.bounds,
        safeEnvelope: { x: 6, y: 6, width: 108, height: 84 },
        protectedSpeechBalloons: [{ x: 4, y: 4, width: 34, height: 34 }],
        requestedWritingMode: "vertical-rl",
        tiltAngleDeg: -10,
        arcCurvature: 0.25,
      },
    });

    expect(pack.variants.length).toBe(7);
    expect(pack.summary.allClearForExport).toBe(true);
    expect(pack.summary.zeroBalloonOverlapVerified).toBe(true);
    expect(pack.summary.zeroInvalidCoordinatesVerified).toBe(true);
    expect(pack.summary.cleanPlateBitExactOutsideMask).toBe(true);
    expect(pack.cleanPlateDigestHex).toMatch(/^[0-9a-f]{16}$/u);
    expect(pack.rightsBom.exportClearanceStatus).toBe("cleared");
    expect(pack.rightsBom.fontEntries.length).toBe(7);
    for (const v of pack.variants) {
      expect(v.balloonOverlapAreaPx).toBe(0);
      expect(v.svgOverlay.hasInvalidCoordinates).toBe(false);
      expect(v.svgOverlay.svgMarkup).not.toContain("NaN");
    }

    const restoredKo = restoreOriginalSfxFromCleanPlatePatch(cleanResult.restoredPanel, cleanResult.patch);
    const parity = measureCleanPlateErrorAgainstGroundTruth(restoredKo, koreanPanel);
    expect(parity.diffPixels).toBe(0);
    expect(parity.psnr).toBe(Number.POSITIVE_INFINITY);
  });

  it("상업 미검증 커스텀 폰트가 주입되면 Rights BOM이 review-required로 내보내기를 차단한다", () => {
    const panel = createPanel(48, 40, () => [240, 240, 240, 255]);
    const mask = createRectMask(48, 40, { x: 14, y: 12, width: 16, height: 12 });
    const cleanResult = reconstructCleanPlateBehindSfx(paintSfxOverlay(panel, mask), mask);

    const pack = compileMultilingualSfxVariantPack({
      packId: "ep01-cut05-rights-gate",
      panelWidth: 48,
      panelHeight: 40,
      cleanPlatePatch: cleanResult.patch,
      targetLocales: ["ko", "en"],
      visualSpec: {
        sourceKoText: "휙",
        originalBounds: cleanResult.patch.bounds,
        safeEnvelope: { x: 4, y: 4, width: 40, height: 32 },
        protectedSpeechBalloons: [],
      },
      fontRightsOverrides: {
        en: {
          locale: "en",
          fontFamily: "PersonalOnlyComicDisplay",
          spdxLicenseId: "LicenseRef-Personal-NonCommercial",
          commercialUseCleared: false,
          attributionNotice: "비상업 개인용 라이선스",
        },
      },
    });

    expect(pack.rightsBom.exportClearanceStatus).toBe("review-required");
    expect(pack.summary.allClearForExport).toBe(false);
    expect(pack.rightsBom.blockingReasons[0]).toContain("PersonalOnlyComicDisplay");
  });

  it("동일 입력에 대해 Clean-Plate 다이제스트와 7개 로케일 변형이 100% 결정론적으로 재현된다", () => {
    const bg = createPanel(56, 48, (x, y) => [120 + x, 140 + y, 200, 255]);
    const mask = createRectMask(56, 48, { x: 16, y: 14, width: 18, height: 14 });
    const occluded = paintSfxOverlay(bg, mask);
    const runOnce = () => {
      const clean = reconstructCleanPlateBehindSfx(occluded, mask);
      return compileMultilingualSfxVariantPack({
        packId: "deterministic-pack",
        panelWidth: 56,
        panelHeight: 48,
        cleanPlatePatch: clean.patch,
        visualSpec: {
          sourceKoText: "반짝",
          originalBounds: clean.patch.bounds,
          safeEnvelope: { x: 4, y: 4, width: 48, height: 40 },
          protectedSpeechBalloons: [],
        },
      });
    };
    const packA = runOnce();
    const packB = runOnce();
    expect(packA.cleanPlateDigestHex).toBe(packB.cleanPlateDigestHex);
    expect(packA.variants.map((v) => v.svgOverlay.svgMarkup)).toEqual(packB.variants.map((v) => v.svgOverlay.svgMarkup));
  });

  it("태국어 결합 모음/성조 클러스터를 깨뜨리지 않고 글리프 단위로 안전하게 배치한다", () => {
    const layer = synthesizeLocalizedSfxVectorLayer(
      {
        sourceKoText: "찌릿",
        originalBounds: { x: 40, y: 30, width: 120, height: 50 },
        safeEnvelope: { x: 10, y: 10, width: 260, height: 140 },
        protectedSpeechBalloons: [],
      },
      "th",
    );
    expect(layer.localizedText).toBe("เปรี๊ยะ!");
    expect(layer.glyphs.map((g) => g.character).join("")).toBe("เปรี๊ยะ!");
    expect(layer.glyphs.length).toBeLessThan(layer.localizedText.length);
    expect(layer.fitsSafeEnvelope).toBe(true);
  });
});
