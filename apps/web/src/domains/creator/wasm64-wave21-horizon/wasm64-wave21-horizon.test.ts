import { describe, expect, it } from "vitest";

import {
  auditStorefrontThumbnailLegibility,
  convertTrapMmToPixels,
  directWebtoonShortformCamera,
  downsampleRgbaAreaBox,
  evaluateCubicEasing,
  generateAssistantHandoffSpecSheet,
  oklchToRgb,
  parseHexColorToRgb,
  rgbToHex,
  rgbToOklch,
  sampleShortformCameraFrame,
  separateSpecialEditionSpotPlates,
  SPOT_PLATE_KINDS,
  STOREFRONT_THUMBNAIL_SPECS,
  synthesizeWangTilePattern,
  type CubicEasingPreset,
  type WangPatternPreset,
  type WebtoonBalloonAnchor,
  type WebtoonSourcePanel,
} from "./index";

describe("wasm64-wave21-horizon: 세로형 웹툰 9:16 숏폼 비트 동기화 카메라 연출기", () => {
  it("모든 3차 이징 프리셋이 오버슈트 없이 [0, 1] 단조 증가를 유지한다", () => {
    const presets: readonly CubicEasingPreset[] = ["cubic-in-out", "cubic-out", "cubic-in", "smooth-step"];
    for (const preset of presets) {
      expect(evaluateCubicEasing(preset, 0)).toBeCloseTo(0, 6);
      expect(evaluateCubicEasing(preset, 1)).toBeCloseTo(1, 6);
      let prev = 0;
      for (let step = 1; step <= 20; step += 1) {
        const cur = evaluateCubicEasing(preset, step / 20);
        expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(cur).toBeLessThanOrEqual(1);
        prev = cur;
      }
    }
  });

  it("말풍선 읽기 순서와 오디오 비트를 결합해 말풍선 잘림 0건의 1080×1920 카메라 플랜을 생성한다", () => {
    const panels: readonly WebtoonSourcePanel[] = [
      { panelId: "cut-1", bounds: { x: 40, y: 80, width: 1360, height: 1800 }, motionStyle: "push-in", dramaticWeight: 1.3 },
      { panelId: "cut-2", bounds: { x: 40, y: 2100, width: 1360, height: 2200 }, focalPoint: { x: 720, y: 2900 } },
      { panelId: "cut-3", bounds: { x: 40, y: 4500, width: 1360, height: 2000 }, motionStyle: "pull-out" },
    ];
    const balloons: readonly WebtoonBalloonAnchor[] = [
      { balloonId: "b-2", panelId: "cut-2", readingOrder: 2, bounds: { x: 760, y: 3150, width: 520, height: 340 }, charCount: 22 },
      { balloonId: "b-1", panelId: "cut-2", readingOrder: 1, bounds: { x: 110, y: 2260, width: 480, height: 310 }, charCount: 16 },
      { balloonId: "b-3", panelId: "cut-3", readingOrder: 3, bounds: { x: 90, y: 4700, width: 620, height: 420 }, charCount: 28 },
      { balloonId: "b-sfx", panelId: "cut-3", readingOrder: 4, bounds: { x: 820, y: 5500, width: 460, height: 280 }, isSfx: true },
    ];
    const beatsSec = [0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0, 6.6, 7.2, 7.8, 8.4, 9.0, 9.6];

    const plan = directWebtoonShortformCamera({
      stripWidthPx: 1440,
      stripHeightPx: 7200,
      panels,
      balloons,
      beatsSec,
      viewportWidthPx: 1080,
      viewportHeightPx: 1920,
      fps: 60,
      balloonSafePaddingPx: 24,
    });

    expect(plan.viewportWidthPx).toBe(1080);
    expect(plan.viewportHeightPx).toBe(1920);
    expect(plan.aspectRatio).toBeCloseTo(9 / 16, 5);
    expect(plan.clippedBalloonCount).toBe(0);
    expect(plan.beatSyncRatio).toBe(1);
    expect(plan.serverCostKrw).toBe(0);
    expect(plan.shots.length).toBe(5);

    const orderedBalloonIds = plan.shots.flatMap((s) => s.activeBalloonIds);
    expect(orderedBalloonIds).toEqual(["b-1", "b-2", "b-3", "b-sfx"]);

    const balloonMap = new Map(balloons.map((b) => [b.balloonId, b.bounds]));
    for (let si = 0; si < plan.shots.length; si += 1) {
      const shot = plan.shots[si]!;
      expect(shot.endSec).toBeGreaterThan(shot.startSec);
      const effectiveEnd = si === plan.shots.length - 1 ? shot.endSec : shot.endSec - 1e-4;
      for (let k = 0; k <= 16; k += 1) {
        const t = shot.startSec + ((effectiveEnd - shot.startSec) * k) / 16;
        const frame = sampleShortformCameraFrame(plan, t);
        expect(frame.crop.width / frame.crop.height).toBeCloseTo(9 / 16, 3);
        for (const bid of shot.activeBalloonIds) {
          const b = balloonMap.get(bid);
          expect(b).toBeDefined();
          if (b) {
            expect(frame.crop.x).toBeLessThanOrEqual(b.x + 0.1);
            expect(frame.crop.y).toBeLessThanOrEqual(b.y + 0.1);
            expect(frame.crop.x + frame.crop.width).toBeGreaterThanOrEqual(b.x + b.width - 0.1);
            expect(frame.crop.y + frame.crop.height).toBeGreaterThanOrEqual(b.y + b.height - 0.1);
          }
        }
      }
    }
  });

  it("오디오 비트가 비어 있어도 fallback BPM 격자로 안정적인 키프레임을 생성한다", () => {
    const plan = directWebtoonShortformCamera({
      stripWidthPx: 1080,
      stripHeightPx: 3840,
      panels: [],
      balloons: [{ balloonId: "solo", panelId: "panel-auto-0", readingOrder: 1, bounds: { x: 180, y: 600, width: 540, height: 320 } }],
      beatsSec: [],
      fallbackBpm: 120,
    });
    expect(plan.shots.length).toBe(1);
    expect(plan.clippedBalloonCount).toBe(0);
    expect(plan.keyframes.length).toBe(2);
    expect(plan.totalDurationSec).toBeGreaterThanOrEqual(0.5);
  });
});

describe("wasm64-wave21-horizon: 모바일 스토어 120×120·160×210 썸네일 가독성 감사기", () => {
  it("면적 적분 리샘플러가 좌우 반분 원화를 정확히 평균화하고 규격 크기를 지킨다", () => {
    const srcW = 240, srcH = 240;
    const src = new Uint8ClampedArray(srcW * srcH * 4);
    for (let y = 0; y < srcH; y += 1) {
      for (let x = 0; x < srcW; x += 1) {
        const idx = (y * srcW + x) * 4;
        const val = x < 120 ? 0 : 255;
        src[idx] = val;
        src[idx + 1] = val;
        src[idx + 2] = val;
        src[idx + 3] = 255;
      }
    }
    const down = downsampleRgbaAreaBox(src, srcW, srcH, 120, 120, { linearLightIntegration: false });
    expect(down.widthPx).toBe(120);
    expect(down.heightPx).toBe(120);
    expect(down.rgba[0]).toBe(0);
    expect(down.rgba[(60 * 120 + 119) * 4]).toBe(255);
  });

  it("대비가 선명한 표지는 통과시키고 저대비·고복잡도 표지는 구체적 한글 개선안을 반환한다", () => {
    const w = 320, h = 420;
    const goodCover = new Uint8ClampedArray(w * h * 4);
    const noisyBadCover = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const nx = x / w, ny = y / h;
        const inFocal = nx >= 0.26 && nx <= 0.74 && ny >= 0.14 && ny <= 0.56;
        const inTitle = nx >= 0.12 && nx <= 0.88 && ny >= 0.70 && ny <= 0.92;

        if (inTitle) {
          const isGlyphStroke = ((Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0) && ny >= 0.74 && ny <= 0.88;
          goodCover[idx] = isGlyphStroke ? 252 : 18;
          goodCover[idx + 1] = isGlyphStroke ? 250 : 22;
          goodCover[idx + 2] = isGlyphStroke ? 245 : 30;
        } else if (inFocal) {
          const faceHighlight = Math.hypot(nx - 0.5, ny - 0.34) < 0.16;
          goodCover[idx] = faceHighlight ? 250 : 215;
          goodCover[idx + 1] = faceHighlight ? 210 : 120;
          goodCover[idx + 2] = faceHighlight ? 185 : 95;
        } else {
          goodCover[idx] = 34;
          goodCover[idx + 1] = 44;
          goodCover[idx + 2] = 58;
        }
        goodCover[idx + 3] = 255;

        if (inTitle) {
          const faintGlyph = (x + y) % 5 === 0;
          noisyBadCover[idx] = faintGlyph ? 132 : 122;
          noisyBadCover[idx + 1] = faintGlyph ? 132 : 122;
          noisyBadCover[idx + 2] = faintGlyph ? 134 : 124;
        } else if (inFocal) {
          noisyBadCover[idx] = 126;
          noisyBadCover[idx + 1] = 126;
          noisyBadCover[idx + 2] = 126;
        } else {
          const checker = (Math.floor(x / 6) ^ Math.floor(y / 6)) & 1;
          const v = checker === 0 ? 12 : 245;
          noisyBadCover[idx] = v;
          noisyBadCover[idx + 1] = 255 - v;
          noisyBadCover[idx + 2] = v;
        }
        noisyBadCover[idx + 3] = 255;
      }
    }

    const goodAudit = auditStorefrontThumbnailLegibility({
      sourceWidth: w,
      sourceHeight: h,
      rgba: goodCover,
      titleForegroundRgb: [252, 250, 245],
    });
    expect(goodAudit.variants.map((v) => v.targetId)).toEqual(STOREFRONT_THUMBNAIL_SPECS.map((s) => s.id));
    expect(goodAudit.variants[0]?.widthPx).toBe(120);
    expect(goodAudit.variants[1]?.widthPx).toBe(160);
    expect(goodAudit.variants[1]?.heightPx).toBe(210);
    expect(goodAudit.overallPass).toBe(true);
    for (const v of goodAudit.variants) {
      expect(v.titleWcagContrastRatio).toBeGreaterThan(6);
      expect(v.titleMichelsonContrast).toBeGreaterThan(0.7);
      expect(v.faceFocalSaliencyRatio).toBeGreaterThan(1.2);
      expect(v.silhouetteClutterScore).toBeLessThan(0.35);
    }

    const badAudit = auditStorefrontThumbnailLegibility({
      sourceWidth: w,
      sourceHeight: h,
      rgba: noisyBadCover,
      titleRegion: { x: 0.12, y: 0.70, width: 0.76, height: 0.22 },
    });
    expect(badAudit.overallPass).toBe(false);
    expect(badAudit.recommendationsKo.length).toBeGreaterThanOrEqual(2);
    expect(badAudit.variants[0]?.titleWcagContrastRatio).toBeLessThan(1.5);
    expect(badAudit.variants[0]?.silhouetteClutterScore).toBeGreaterThan(0.55);
    expect(badAudit.serverCostKrw).toBe(0);
  });
});

describe("wasm64-wave21-horizon: 비주기 2색·4방향 왕 타일 심리스 원단·패턴 합성기", () => {
  it("기모노·체크·벽돌·수풀 4종 프리셋 모두 격자 경계 픽셀 오차 0과 비주기 다양성을 달성한다", () => {
    const presets: readonly WangPatternPreset[] = ["kimono", "plaid", "brick", "foliage"];
    for (const preset of presets) {
      const result = synthesizeWangTilePattern({
        widthPx: 160,
        heightPx: 160,
        tileSizePx: 32,
        preset,
        seed: 777123,
      });
      expect(result.widthPx).toBe(160);
      expect(result.heightPx).toBe(160);
      expect(result.gridCols).toBe(5);
      expect(result.gridRows).toBe(5);
      expect(result.seamEdgeMismatchCount).toBe(0);
      expect(result.maxSeamPixelDelta).toBe(0);
      expect(result.aperiodicDiversityRatio).toBeGreaterThan(0.5);
      expect(result.serverCostKrw).toBe(0);

      const row0 = [...result.tileGridIds.slice(0, 5)].join(",");
      const row1 = [...result.tileGridIds.slice(5, 10)].join(",");
      expect(row0).not.toBe(row1);
    }
  });

  it("사용자 시드 패치 입력과 시드 결정론(동일 시드 완전 일치)을 보장한다", () => {
    const seedPatch0 = new Uint8Array(8 * 8 * 4).fill(210);
    const seedPatch1 = new Uint8Array(8 * 8 * 4).fill(60);
    const a = synthesizeWangTilePattern({
      widthPx: 96,
      heightPx: 96,
      tileSizePx: 24,
      seed: 42,
      seedTile0Rgba: seedPatch0,
      seedTile1Rgba: seedPatch1,
      seedTileSizePx: 8,
    });
    const b = synthesizeWangTilePattern({
      widthPx: 96,
      heightPx: 96,
      tileSizePx: 24,
      seed: 42,
      seedTile0Rgba: seedPatch0,
      seedTile1Rgba: seedPatch1,
      seedTileSizePx: 8,
    });
    const c = synthesizeWangTilePattern({ widthPx: 96, heightPx: 96, tileSizePx: 24, seed: 9999 });

    expect(a.seamEdgeMismatchCount).toBe(0);
    expect(a.maxSeamPixelDelta).toBe(0);
    expect([...a.rgba]).toEqual([...b.rgba]);
    expect([...a.tileGridIds]).not.toEqual([...c.tileGridIds]);
  });
});

describe("wasm64-wave21-horizon: 어시스턴트 채색 인계용 컬러키·광원 지정서 생성기", () => {
  it("정규식 없는 HEX 파서와 OKLCH 왕복 변환이 색상 정확도를 유지한다", () => {
    const sampleHex = rgbToHex(232, 184, 156);
    const parsed = parseHexColorToRgb(sampleHex);
    expect(parsed).toEqual([232, 184, 156]);
    expect(parseHexColorToRgb("invalid-hex", [10, 20, 30])).toEqual([10, 20, 30]);

    const oklch = rgbToOklch(parsed[0], parsed[1], parsed[2]);
    const roundtrip = oklchToRgb(oklch.l, oklch.c, oklch.hDeg);
    expect(Math.abs(roundtrip[0] - 232)).toBeLessThanOrEqual(2);
    expect(Math.abs(roundtrip[1] - 184)).toBeLessThanOrEqual(2);
    expect(Math.abs(roundtrip[2] - 156)).toBeLessThanOrEqual(2);
  });

  it("캐릭터 부위별 스와치 쌍, 잠금 선화 규칙, 주광원 화살표 벡터를 결정론적으로 패키징한다", () => {
    const specA = generateAssistantHandoffSpecSheet({
      projectId: "proj-moonlight-blade",
      episodeNumber: 18,
      sceneTitleKo: "옥상 노을 대치 씬",
      primaryLight: { azimuthDeg: 315, elevationDeg: 35, colorTempKelvin: 3400, intensity: 1.15 },
      characters: [
        {
          characterId: "char-seohyun",
          characterNameKo: "서현",
          regions: [
            { regionId: "skin", regionLabelKo: "피부", baseHex: rgbToHex(244, 212, 194), materialFinish: "skin" },
            { regionId: "hair", regionLabelKo: "머리카락", baseHex: rgbToHex(42, 48, 68), materialFinish: "hair-aniso" },
            { regionId: "brooch", regionLabelKo: "금속 브로치", baseHex: rgbToHex(212, 174, 82), materialFinish: "metal" },
          ],
        },
      ],
    });
    const specB = generateAssistantHandoffSpecSheet({
      projectId: "proj-moonlight-blade",
      episodeNumber: 18,
      sceneTitleKo: "옥상 노을 대치 씬",
      primaryLight: { azimuthDeg: 315, elevationDeg: 35, colorTempKelvin: 3400, intensity: 1.15 },
      characters: [
        {
          characterId: "char-seohyun",
          characterNameKo: "서현",
          regions: [
            { regionId: "skin", regionLabelKo: "피부", baseHex: rgbToHex(244, 212, 194), materialFinish: "skin" },
            { regionId: "hair", regionLabelKo: "머리카락", baseHex: rgbToHex(42, 48, 68), materialFinish: "hair-aniso" },
            { regionId: "brooch", regionLabelKo: "금속 브로치", baseHex: rgbToHex(212, 174, 82), materialFinish: "metal" },
          ],
        },
      ],
    });

    expect(specA.specDigestHex).toBe(specB.specDigestHex);
    expect(specA.handoffMarkdownKo).toBe(specB.handoffMarkdownKo);
    expect(specA.primaryLightArrow.directionSummaryKo).toContain("좌상단 주광");

    const v3 = specA.primaryLightArrow.lightUnitVector3D;
    expect(Math.hypot(v3.x, v3.y, v3.z)).toBeCloseTo(1, 3);
    expect(specA.primaryLightArrow.compassArrow2D.shadowCastVector.x).toBeGreaterThan(0);
    expect(specA.primaryLightArrow.compassArrow2D.shadowCastVector.y).toBeGreaterThan(0);

    const regions = specA.characterSwatches[0]?.regions ?? [];
    expect(regions.length).toBe(3);
    for (const r of regions) {
      expect(r.shadowDeltaL).toBeLessThan(0);
      expect(r.highlightDeltaL).toBeGreaterThan(0);
    }

    const mainInkRule = specA.lockedInkLayerRules.find((r) => r.layerRole === "vector-main-ink");
    expect(mainInkRule?.locked).toBe(true);
    expect(specA.serverCostKrw).toBe(0);
  });
});

describe("wasm64-wave21-horizon: 단행본 특별판 별색 박(Spot-Gold·Spot-Silver)·UV-Gloss·CMYK 분판기", () => {
  it("300 DPI와 600 DPI에서 ±0.1mm 트래핑 반경을 정밀 환산하고 녹아웃·오버프린트를 정확히 분리한다", () => {
    expect(convertTrapMmToPixels(0.1, 300)).toBeCloseTo(1.1811, 3);
    expect(convertTrapMmToPixels(0.1, 600)).toBeCloseTo(2.3622, 3);

    const w = 48, h = 48;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 28;
      rgba[i * 4 + 1] = 44;
      rgba[i * 4 + 2] = 92;
      rgba[i * 4 + 3] = 255;
    }

    const goldMask = new Uint8Array(w * h);
    const silverMask = new Uint8Array(w * h);
    const uvMask = new Uint8Array(w * h);
    let rawGoldCount = 0;
    let rawUvCount = 0;

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (x >= 8 && x < 20 && y >= 8 && y < 20) {
          goldMask[p] = 255;
          rawGoldCount += 1;
        }
        if (x >= 26 && x < 34 && y >= 8 && y < 16) {
          silverMask[p] = 255;
        }
        if (x >= 12 && x < 36 && y >= 28 && y < 42) {
          uvMask[p] = 255;
          rawUvCount += 1;
        }
      }
    }

    const sep300 = separateSpecialEditionSpotPlates({
      widthPx: w,
      heightPx: h,
      rgba,
      dpi: 300,
      defaultFoilTrapMm: 0.1,
      defaultUvTrapMm: -0.1,
      maxTacPercent: 280,
      spotMasks: { "Spot-Gold": goldMask, "Spot-Silver": silverMask, "UV-Gloss": uvMask },
    });
    const sep600 = separateSpecialEditionSpotPlates({
      widthPx: w,
      heightPx: h,
      rgba,
      dpi: 600,
      defaultFoilTrapMm: 0.1,
      defaultUvTrapMm: -0.1,
      maxTacPercent: 280,
      spotMasks: { "Spot-Gold": goldMask, "Spot-Silver": silverMask, "UV-Gloss": uvMask },
    });

    expect(sep300.spotPlates.map((p) => p.plateName)).toEqual([...SPOT_PLATE_KINDS]);
    const gold300 = sep300.spotPlates.find((p) => p.plateName === "Spot-Gold");
    const gold600 = sep600.spotPlates.find((p) => p.plateName === "Spot-Gold");
    const uv300 = sep300.spotPlates.find((p) => p.plateName === "UV-Gloss");
    const uv600 = sep600.spotPlates.find((p) => p.plateName === "UV-Gloss");

    expect(gold300?.trapMode).toBe("spread");
    expect(gold300?.overprint).toBe(false);
    expect(gold300?.activePixelCount).toBeGreaterThan(rawGoldCount);
    expect(gold600?.activePixelCount ?? 0).toBeGreaterThan(gold300?.activePixelCount ?? 0);

    expect(uv300?.trapMode).toBe("choke");
    expect(uv300?.overprint).toBe(true);
    expect(uv300?.activePixelCount).toBeLessThan(rawUvCount);
    expect(uv600?.activePixelCount ?? 0).toBeLessThan(uv300?.activePixelCount ?? 0);

    for (const plate of sep300.spotPlates) {
      for (const byteVal of plate.monochromeMask) {
        expect(byteVal === 0 || byteVal === 255).toBe(true);
      }
    }

    // 금박 중심부는 CMYK 녹아웃(0) 처리되고, UV-Gloss 중심부는 오버프린트로 CMYK 잉크가 보존된다.
    const goldCenterIdx = 14 * w + 14;
    expect(sep300.cmykPlates.cyan[goldCenterIdx]).toBe(0);
    expect(sep300.cmykPlates.magenta[goldCenterIdx]).toBe(0);
    expect(sep300.cmykPlates.yellow[goldCenterIdx]).toBe(0);
    expect(sep300.cmykPlates.black[goldCenterIdx]).toBe(0);

    const uvCenterIdx = 35 * w + 24;
    expect((sep300.cmykPlates.cyan[uvCenterIdx] ?? 0) + (sep300.cmykPlates.black[uvCenterIdx] ?? 0)).toBeGreaterThan(100);
    expect(sep300.cmykPlates.maxObservedTacPercent).toBeLessThanOrEqual(280.5);
    expect(sep300.serverCostKrw).toBe(0);
  });
});
