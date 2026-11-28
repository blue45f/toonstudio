import { describe, expect, it } from "vitest";
import {
  EMOTICON_PLATFORM_SPECS,
  MERCH_PRODUCT_TEMPLATES,
  buildAcrylicStandeeTabGeometry,
  buildCollectiblePhotocardSpec,
  buildIpMerchReleasePackManifest,
  computeExactEuclideanDistanceField,
  computeExactSignedDistanceField,
  convertSrgbToCmyk,
  evaluateCmykPrintReadiness,
  extractCharacterCutoutAlpha,
  generateStickerDieCutContour,
  generateWhiteUnderbasePlate,
  mmToPx,
  renderMerchProductionSvg,
  synthesizeSeamlessEmoticonLoop,
  type EmoticonMotionPreset,
  type MerchRightsBomAsset,
} from "./index";

function createCircleRgba(
  width: number, height: number, cx: number, cy: number, radius: number,
  fill: readonly [number, number, number, number], bg: readonly [number, number, number, number] = [0, 0, 0, 0],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const col = Math.hypot(x - cx, y - cy) <= radius ? fill : bg;
      rgba[p] = col[0]; rgba[p + 1] = col[1]; rgba[p + 2] = col[2]; rgba[p + 3] = col[3];
    }
  }
  return rgba;
}

function createCharacterWithEarsMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const cx = width * 0.5; const cy = height * 0.56;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inHead = Math.hypot(x - cx, y - cy) <= 22;
      const inLeftEar = x >= cx - 18 && x <= cx - 8 && y >= cy - 36 && y <= cy - 14;
      const inRightEar = x >= cx + 8 && x <= cx + 18 && y >= cy - 36 && y <= cy - 14;
      const inBody = x >= cx - 15 && x <= cx + 15 && y >= cy + 16 && y <= cy + 34;
      if (inHead || inLeftEar || inRightEar || inBody) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function createVerifiedBom(): readonly MerchRightsBomAsset[] {
  return [
    { assetId: "char-hero-01", assetName: "주인공 SD 일러스트", assetKind: "character-art", licenseStatus: "verified-commercial", licenseHolder: "Studio Alpha", commercialMerchAllowed: true },
    { assetId: "font-title-02", assetName: "상업용 타이틀 서체", assetKind: "font", licenseStatus: "verified-commercial", licenseHolder: "Foundry KR", commercialMerchAllowed: true },
  ];
}

describe("Wave 85 — 알파 매트 분리 및 정밀 2D Meijster EDT", () => {
  it("사전 키잉(prekeyed-alpha) RGBA에서 캐릭터 실루엣과 경계 박스를 정확히 분리한다", () => {
    const rgba = createCircleRgba(96, 96, 48, 48, 20, [210, 75, 95, 255]);
    const cutout = extractCharacterCutoutAlpha({ width: 96, height: 96, rgba });
    expect(cutout.detectedMode).toBe("prekeyed-alpha");
    expect(cutout.backgroundColor).toBeNull();
    expect(cutout.foregroundPixelCount).toBeGreaterThan(1200);
    expect(cutout.artworkBounds?.minX).toBe(28);
    expect(cutout.artworkBounds?.maxX).toBe(68);
  });

  it("단색 배경 플러드필 키잉 시 캐릭터 내부 흰색(눈·셔츠)을 보존하고 외곽 프린지 색을 정화한다", () => {
    const w = 64; const h = 64;
    const rgba = createCircleRgba(w, h, 32, 32, 18, [30, 40, 80, 255], [255, 255, 255, 255]);
    for (let y = 28; y <= 36; y += 1) {
      for (let x = 28; x <= 36; x += 1) {
        const p = (y * w + x) * 4;
        rgba[p] = 255; rgba[p + 1] = 255; rgba[p + 2] = 255; rgba[p + 3] = 255;
      }
    }
    const fringeIdx = (32 * w + 50) * 4;
    rgba[fringeIdx] = 215; rgba[fringeIdx + 1] = 218; rgba[fringeIdx + 2] = 225; rgba[fringeIdx + 3] = 255;

    const cutout = extractCharacterCutoutAlpha({ width: w, height: h, rgba });
    expect(cutout.detectedMode).toBe("solid-bg-floodfill");
    expect(cutout.backgroundColor).toEqual([255, 255, 255]);
    expect(cutout.binaryMask[0]).toBe(0);
    expect(cutout.binaryMask[32 * w + 32]).toBe(1);
    expect(cutout.alphaMask[32 * w + 32]).toBe(255);
    expect(cutout.fringePixelCount).toBeGreaterThanOrEqual(1);
    expect(cutout.decontaminatedRgba[fringeIdx]!).toBeLessThan(215);
  });

  it("Meijster 2-패스 정밀 EDT가 브루트포스 유클리드 거리와 1e-5 이내로 일치한다", () => {
    const w = 24; const h = 20;
    const mask = new Uint8Array(w * h);
    const features: readonly (readonly [number, number])[] = [[4, 5], [17, 13], [11, 16]];
    for (const [fx, fy] of features) mask[fy * w + fx] = 1;

    const edt = computeExactEuclideanDistanceField(mask, w, h, 1);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const brute = Math.min(...features.map(([fx, fy]) => Math.hypot(x - fx, y - fy)));
        expect(Math.abs((edt[y * w + x] ?? 0) - brute)).toBeLessThan(1e-5);
      }
    }
  });

  it("부호 거리장(SDF)은 전경 내부에서 음수, 외부에서 양수를 반환한다", () => {
    const w = 32; const h = 32; const mask = new Uint8Array(w * h);
    for (let y = 10; y <= 22; y += 1) for (let x = 10; x <= 22; x += 1) mask[y * w + x] = 1;
    const sdf = computeExactSignedDistanceField(mask, w, h);
    expect(sdf[16 * w + 16]).toBeLessThan(0);
    expect(sdf[0]).toBeGreaterThan(0);
  });
});

describe("Wave 85 — 칼선(Die-Cut) 윤곽 추출 및 초크 화이트 언더베이스", () => {
  it("귀 돌출 실루엣에서도 닫히고 자기교차 없는 칼선과 아트워크 안전 이격거리를 보장한다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const contour = generateStickerDieCutContour(mask, 128, 128, { dpi: 300, offsetMm: 2.5 });
    expect(contour.closed).toBe(true);
    expect(contour.selfIntersecting).toBe(false);
    expect(contour.points.length).toBeGreaterThanOrEqual(12);
    expect(contour.clearanceSafe).toBe(true);
    expect(contour.minClearanceToArtworkPx).toBeGreaterThanOrEqual(contour.offsetPx - 1.5);
    expect(contour.svgPathD.startsWith("M ")).toBe(true);
    expect(contour.svgPathD.endsWith(" Z")).toBe(true);
  });

  it("칼선 여백(offsetMm)을 2.5mm에서 4.0mm로 늘리면 면적·둘레·이격거리가 단조 증가한다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const small = generateStickerDieCutContour(mask, 128, 128, { dpi: 300, offsetMm: 2.5 });
    const large = generateStickerDieCutContour(mask, 128, 128, { dpi: 300, offsetMm: 4.0 });
    expect(large.offsetPx).toBeGreaterThan(small.offsetPx);
    expect(large.areaPx2).toBeGreaterThan(small.areaPx2);
    expect(large.perimeterPx).toBeGreaterThan(small.perimeterPx);
    expect(large.minClearanceToArtworkPx).toBeGreaterThan(small.minClearanceToArtworkPx);
  });

  it("근접한 두 캐릭터 파츠를 단일 폐곡선 키스컷 칼선으로 매끄럽게 병합한다", () => {
    const w = 120; const h = 100; const mask = new Uint8Array(w * h);
    for (let y = 35; y <= 65; y += 1) {
      for (let x = 28; x <= 48; x += 1) mask[y * w + x] = 1;
      for (let x = 60; x <= 80; x += 1) mask[y * w + x] = 1;
    }
    const contour = generateStickerDieCutContour(mask, w, h, { dpi: 300, offsetMm: 2.5 });
    expect(contour.closed).toBe(true);
    expect(contour.selfIntersecting).toBe(false);
    expect(contour.boundsPx.minX).toBeLessThan(28);
    expect(contour.boundsPx.maxX).toBeGreaterThan(80);
  });

  it("초크 화이트 언더베이스(chokePx=2)는 외부 누출 0px이며 무초크보다 픽셀 수가 엄격히 적다", () => {
    const w = 96; const h = 96; const mask = createCharacterWithEarsMask(w, h);
    const unchoked = generateWhiteUnderbasePlate(mask, w, h, { chokePx: 0 });
    const choked1 = generateWhiteUnderbasePlate(mask, w, h, { chokePx: 1 });
    const choked2 = generateWhiteUnderbasePlate(mask, w, h, { chokePx: 2 });

    expect(choked2.leakedOutsideArtworkPixels).toBe(0);
    expect(choked2.underbasePixelCount).toBeGreaterThan(0);
    expect(choked2.underbasePixelCount).toBeLessThan(choked1.underbasePixelCount);
    expect(choked1.underbasePixelCount).toBeLessThan(unchoked.underbasePixelCount);
    for (let i = 0; i < w * h; i += 1) {
      if (choked2.underbaseMask[i] === 1) expect(mask[i]).toBe(1);
    }
    expect(choked2.contours.length).toBeGreaterThanOrEqual(1);
    expect(choked2.svgPathD.includes("M ")).toBe(true);
  });

  it("빈 전경 마스크로 칼선 생성을 시도하면 명확한 한글 오류를 던진다", () => {
    expect(() => generateStickerDieCutContour(new Uint8Array(32 * 32), 32, 32)).toThrow("전경 픽셀");
  });
});

describe("Wave 85 — 표준 굿즈 템플릿, 키링·스탠드·포토카드 기하 및 CMYK TAC", () => {
  it("MERCH_PRODUCT_TEMPLATES 5종 상품이 한국·글로벌 표준 치수 및 인쇄 스펙을 만족한다", () => {
    expect(MERCH_PRODUCT_TEMPLATES["diecut-vinyl-sticker"].maxWidthMm).toBe(60);
    expect(MERCH_PRODUCT_TEMPLATES["diecut-vinyl-sticker"].dieCutOffsetMm).toBe(2.5);
    expect(MERCH_PRODUCT_TEMPLATES["diecut-vinyl-sticker"].bleedMm).toBe(2.0);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-keyring-charm"].maxWidthMm).toBe(55);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-keyring-charm"].maxHeightMm).toBe(70);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-keyring-charm"].dieCutOffsetMm).toBe(3.5);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-keyring-charm"].keyringHoleSpec?.diameterMm).toBe(3.2);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-keyring-charm"].requiresWhiteUnderbase).toBe(true);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].maxWidthMm).toBe(100);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].maxHeightMm).toBe(140);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].standeeTabSpec?.widthMm).toBe(28);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].standeeTabSpec?.heightMm).toBe(4);
    expect(MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].standeeTabSpec?.slotToleranceMm).toBe(0.15);
    expect(MERCH_PRODUCT_TEMPLATES["collectible-photocard"].maxWidthMm).toBe(55);
    expect(MERCH_PRODUCT_TEMPLATES["collectible-photocard"].maxHeightMm).toBe(85);
    expect(MERCH_PRODUCT_TEMPLATES["collectible-photocard"].cornerRadiusMm).toBe(3);
    expect(MERCH_PRODUCT_TEMPLATES["collectible-photocard"].bleedMm).toBe(2);
    expect(MERCH_PRODUCT_TEMPLATES["messenger-emoticon-pack"].colorMode).toBe("sRGB+Alpha");
  });

  it("아크릴 키링 옵션은 3.2mm 상단 타공 홀을 캐릭터 아트워크 바깥 안전 지대에 배치한다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const contour = generateStickerDieCutContour(mask, 128, 128, {
      dpi: 300, offsetMm: 3.5, includeKeyringHole: true, keyringHoleDiameterMm: 3.2,
    });
    expect(contour.keyringHole?.diameterMm).toBe(3.2);
    expect(contour.keyringHole?.wallThicknessMm).toBeGreaterThanOrEqual(2.2);
    expect(contour.keyringHole?.clearanceToArtworkPx).toBeGreaterThan(contour.offsetPx * 0.8);
    expect(contour.keyringHole?.cyPx).toBeLessThan(contour.boundsPx.minY);
  });

  it("아크릴 스탠드 하단 끼움 탭(28×4mm, 공차 ±0.15mm)이 칼선 하단에 정확히 정렬된다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const contour = generateStickerDieCutContour(mask, 128, 128, { dpi: 300, offsetMm: 3.5 });
    const tab = buildAcrylicStandeeTabGeometry(contour.boundsPx, 300);
    expect(tab.widthMm).toBe(28);
    expect(tab.heightMm).toBe(4);
    expect(tab.slotToleranceMm).toBe(0.15);
    expect(tab.matchingBaseSlotWidthMm).toBe(28.15);
    expect(tab.matchingBaseSlotDepthMm).toBe(3.15);
    expect(tab.yPx).toBe(contour.boundsPx.maxY);
    expect(Math.abs(tab.widthPx - mmToPx(28, 300))).toBeLessThan(0.1);
    expect(Math.abs(tab.heightPx - mmToPx(4, 300))).toBeLessThan(0.1);
  });

  it("컬렉터블 포토카드 규격은 55×85mm 재단선, R3mm 모서리, 2mm 도련(59×89mm) 및 홀로그램 박 경로를 생성한다", () => {
    const pc = buildCollectiblePhotocardSpec({ dpi: 300, includeBackSide: true, includeHoloFoilMask: true });
    expect([pc.trimWidthMm, pc.trimHeightMm, pc.cornerRadiusMm, pc.bleedMm]).toEqual([55, 85, 3, 2]);
    expect([pc.totalBleedWidthMm, pc.totalBleedHeightMm]).toEqual([59, 89]);
    expect(pc.trimRoundedPathD.includes("A ")).toBe(true);
    expect(pc.holoFoilRegionPathD).not.toBeNull();
  });

  it("CMYK 분판은 짙은 검정에서도 총잉크량(TAC) 300% 상한을 초과하지 않도록 클램프한다", () => {
    const black = convertSrgbToCmyk(0, 0, 0, 300);
    expect(black.totalInkPercent).toBeLessThanOrEqual(300.01);
    expect(black.k).toBeGreaterThanOrEqual(70);

    const report = evaluateCmykPrintReadiness(createCircleRgba(48, 48, 24, 24, 16, [5, 8, 12, 255]), 300);
    expect(report.passed).toBe(true);
    expect(report.peakClampedTacPercent).toBeLessThanOrEqual(300.01);
  });
});

describe("Wave 85 — 24fps 심리스 이모티콘 루프 합성 및 플랫폼 규격 검증", () => {
  const presets: readonly EmoticonMotionPreset[] = [
    "bounce-cheer", "sparkle-wink", "rage-shake", "heart-float", "sweat-panic", "bow-thanks",
  ];

  it("모든 6종 활성 이모티콘 모션 프리셋이 24fps에서 정확한 C1 주기 닫힘(|start - end| < 1e-6)을 만족한다", () => {
    for (const preset of presets) {
      const res = synthesizeSeamlessEmoticonLoop({ platform: "kakaotalk", preset, frameCount: 24, fps: 24 });
      expect(res.frames.length).toBe(24);
      expect(res.closureAudit.isC1Closed).toBe(true);
      expect(res.closureAudit.maxPositionDeltaPx).toBeLessThan(1e-6);
      expect(res.closureAudit.maxScaleDelta).toBeLessThan(1e-6);
      expect(res.closureAudit.maxRotationDeltaDeg).toBeLessThan(1e-6);
      expect(res.closureAudit.maxVelocityDelta).toBeLessThan(1e-6);
      expect(res.platformCompliance.passed).toBe(true);
    }
  });

  it("카카오톡(360×360)·라인(370×320)·디스코드(320×320) 플랫폼 해상도와 용량·여백 규격을 준수한다", () => {
    const kakao = synthesizeSeamlessEmoticonLoop({ platform: "kakaotalk", preset: "bounce-cheer" });
    const line = synthesizeSeamlessEmoticonLoop({ platform: "line", preset: "heart-float" });
    const discord = synthesizeSeamlessEmoticonLoop({ platform: "discord", preset: "sparkle-wink" });
    expect([kakao.widthPx, kakao.heightPx]).toEqual([360, 360]);
    expect([line.widthPx, line.heightPx]).toEqual([370, 320]);
    expect([discord.widthPx, discord.heightPx]).toEqual([320, 320]);
    expect([kakao.fps, line.fps, discord.fps]).toEqual([24, 24, 24]);
    expect(EMOTICON_PLATFORM_SPECS.line.maxFileSizeKb).toBe(300);
    expect(EMOTICON_PLATFORM_SPECS.discord.maxFileSizeKb).toBe(512);
    expect(kakao.platformCompliance.passed && line.platformCompliance.passed && discord.platformCompliance.passed).toBe(true);
  });

  it("prefersReducedMotion=true 시 저자극 폴백(gentle-fade-pulse)으로 전환되어 흔들림과 회전이 0이 된다", () => {
    const calm = synthesizeSeamlessEmoticonLoop({ platform: "kakaotalk", preset: "rage-shake", prefersReducedMotion: true });
    expect(calm.effectivePreset).toBe("gentle-fade-pulse");
    expect(calm.motionMetrics.maxShakePx).toBe(0);
    expect(calm.motionMetrics.maxTranslateXPx).toBe(0);
    expect(calm.motionMetrics.maxTranslateYPx).toBe(0);
    expect(calm.motionMetrics.maxRotationDeg).toBe(0);
    expect(calm.closureAudit.isC1Closed).toBe(true);
  });

  it("원본 투명 여백이 빠듯할 때 모션 진폭을 자동 제한해 플랫폼 최소 10px 투명 여백을 보호한다", () => {
    const tight = synthesizeSeamlessEmoticonLoop({ platform: "line", preset: "bounce-cheer", baseTransparentPaddingPx: 12 });
    expect(tight.motionMetrics.amplitudeClampedForPadding).toBe(true);
    expect(tight.motionMetrics.effectiveMinPaddingPx).toBeGreaterThanOrEqual(10);
    expect(tight.platformCompliance.passed).toBe(true);
  });

  it("라인(LINE) 300KB 용량 제한을 초과하는 고프레임 구성에서는 플랫폼 규격 위반을 감지한다", () => {
    const oversized = synthesizeSeamlessEmoticonLoop({
      platform: "line", preset: "sparkle-wink", frameCount: 72, estimatedBytesPerFrameKb: 10,
    });
    expect(oversized.platformCompliance.passed).toBe(false);
    expect(oversized.platformCompliance.estimatedFileSizeKb).toBeGreaterThan(300);
    expect(oversized.platformCompliance.violationsKo.some((v) => v.includes("용량"))).toBe(true);
  });
});

describe("Wave 85 — 플로터용 레이어드 SVG 출력 및 Rights BOM 상업 출고 게이트", () => {
  it("아크릴 키링 SVG는 3대 표준 레이어와 3.2mm 키링 홀을 포함하며 NaN 좌표가 0건이다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const dieCutContour = generateStickerDieCutContour(mask, 128, 128, {
      dpi: 300, offsetMm: 3.5, includeKeyringHole: true, keyringHoleDiameterMm: 3.2,
    });
    const whiteUnderbase = generateWhiteUnderbasePlate(mask, 128, 128, { chokePx: 2 });
    const rendered = renderMerchProductionSvg({
      title: "별빛 마법사 키링", productType: "acrylic-keyring-charm",
      artworkWidthPx: 128, artworkHeightPx: 128, dieCutContour, whiteUnderbase,
    });
    expect(rendered.hasFiniteCoordinatesOnly).toBe(true);
    expect(rendered.layers).toEqual(["Artwork_CMYK", "Spot_White_Underbase", "CutContour"]);
    expect(rendered.svg).toContain('id="Artwork_CMYK"');
    expect(rendered.svg).toContain('id="Spot_White_Underbase"');
    expect(rendered.svg).toContain('id="CutContour"');
    expect(rendered.svg).toContain('id="Keyring_Outer_Lug"');
    expect(rendered.svg).toContain('id="Keyring_Hole_Cut"');
    expect(rendered.svg).toContain('data-diameter-mm="3.20"');
    expect(rendered.svg).not.toContain("NaN");
  });

  it("아크릴 스탠드 SVG는 하단 28×4mm 끼움 탭을 CutContour 레이어에 포함한다", () => {
    const mask = createCharacterWithEarsMask(128, 128);
    const dieCutContour = generateStickerDieCutContour(mask, 128, 128, { dpi: 300, offsetMm: 3.5 });
    const whiteUnderbase = generateWhiteUnderbasePlate(mask, 128, 128, { chokePx: 2 });
    const standeeTab = buildAcrylicStandeeTabGeometry(dieCutContour.boundsPx, 300);
    const rendered = renderMerchProductionSvg({
      title: "별빛 마법사 스탠드", productType: "acrylic-standee-set",
      artworkWidthPx: 128, artworkHeightPx: 128, dieCutContour, whiteUnderbase, standeeTab,
    });
    expect(rendered.hasFiniteCoordinatesOnly).toBe(true);
    expect(rendered.svg).toContain('id="Standee_Bottom_Tab"');
    expect(rendered.svg).toContain('data-tab-width-mm="28.00"');
    expect(rendered.svg).toContain('data-tab-height-mm="4.00"');
    expect(rendered.svg).toContain('data-slot-tolerance-mm="0.15"');
  });

  it("포토카드 SVG는 55×85mm 라운드 재단선과 홀로그램 박 마스크를 NaN 없이 출력한다", () => {
    const pc = buildCollectiblePhotocardSpec({ dpi: 300, includeHoloFoilMask: true });
    const rendered = renderMerchProductionSvg({
      title: "한정판 포토카드", productType: "collectible-photocard",
      artworkWidthPx: pc.trimWidthPx, artworkHeightPx: pc.trimHeightPx, photocardSpec: pc,
    });
    expect(rendered.hasFiniteCoordinatesOnly).toBe(true);
    expect([rendered.widthMm, rendered.heightMm]).toEqual([59, 89]);
    expect(rendered.svg).toContain('id="Artwork_CMYK"');
    expect(rendered.svg).toContain('id="Spot_White_Underbase"');
    expect(rendered.svg).toContain('id="CutContour"');
    expect(rendered.svg).toContain('id="Photocard_Trim_Rounded"');
    expect(rendered.svg).toContain('id="Spot_Holo_Foil"');
  });

  it("Rights BOM에 미검증 또는 비상업 에셋이 포함되면 상업 굿즈 출고를 즉시 차단한다", () => {
    const mask = createCharacterWithEarsMask(96, 96);
    const dieCutContour = generateStickerDieCutContour(mask, 96, 96, { dpi: 300, offsetMm: 2.5 });
    const productionSvg = renderMerchProductionSvg({
      title: "차단 테스트 스티커", productType: "diecut-vinyl-sticker",
      artworkWidthPx: 96, artworkHeightPx: 96, dieCutContour,
    });
    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-STK-001",
      productType: "diecut-vinyl-sticker", generatedAtIso: "2026-11-28T03:30:00.000Z",
      rightsBomAssets: [
        ...createVerifiedBom(),
        { assetId: "brush-unverified-99", assetName: "출처 미확인 브러시", assetKind: "brush-texture", licenseStatus: "unverified", licenseHolder: "Unknown", commercialMerchAllowed: false },
      ],
      dieCutContour, productionSvg,
    });
    expect(manifest.exportStatus).toBe("blocked-rights-bom");
    expect(manifest.commercialExportAllowed).toBe(false);
    expect(manifest.productionArtifactLocked).toBe(true);
    expect(manifest.rightsBomAudit.blockedAssetIds).toEqual(["brush-unverified-99"]);
    expect(manifest.deliverables.svgFilename).toBeNull();
  });

  it("Rights BOM이 비어 있으면 상업 출고를 차단한다", () => {
    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-EMPTY-000",
      productType: "diecut-vinyl-sticker", rightsBomAssets: [],
    });
    expect(manifest.exportStatus).toBe("blocked-rights-bom");
    expect(manifest.commercialExportAllowed).toBe(false);
  });

  it("전체 엔드투엔드 파이프라인(알파 분리→칼선→화이트 백킹→CMYK→SVG→이모티콘→검증 BOM)이 출고 승인을 통과한다", () => {
    const rgba = createCircleRgba(128, 128, 64, 64, 28, [45, 90, 175, 255]);
    const cutout = extractCharacterCutoutAlpha({ width: 128, height: 128, rgba });
    const dieCutContour = generateStickerDieCutContour(cutout.binaryMask, 128, 128, {
      dpi: 300, offsetMm: 3.5, includeKeyringHole: true, keyringHoleDiameterMm: 3.2,
    });
    const whiteUnderbase = generateWhiteUnderbasePlate(cutout.binaryMask, 128, 128, { chokePx: 2 });
    const cmykReport = evaluateCmykPrintReadiness(cutout.decontaminatedRgba, 300);
    const productionSvg = renderMerchProductionSvg({
      title: "별빛 아카데미 아린 키링", productType: "acrylic-keyring-charm",
      artworkWidthPx: 128, artworkHeightPx: 128, dieCutContour, whiteUnderbase, cmykReport,
    });
    const emoticonLoop = synthesizeSeamlessEmoticonLoop({ platform: "kakaotalk", preset: "sparkle-wink", frameCount: 24, fps: 24 });

    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-AKR-2026-01",
      productType: "acrylic-keyring-charm", generatedAtIso: "2026-11-28T03:30:00.000Z",
      rightsBomAssets: createVerifiedBom(), dieCutContour, whiteUnderbase, cmykReport, productionSvg, emoticonLoop,
    });
    expect(manifest.exportStatus).toBe("ready-for-production");
    expect(manifest.commercialExportAllowed).toBe(true);
    expect(manifest.productionArtifactLocked).toBe(false);
    expect(manifest.blockingIssuesKo).toEqual([]);
    expect(manifest.deliverables.svgFilename).toContain("acrylic-keyring-charm-300dpi.svg");
    expect(manifest.deliverables.whiteUnderbaseChokePx).toBe(2);
    expect(manifest.deliverables.emoticonFrameCount).toBe(24);
  });

  it("아크릴 키링에서 필수 화이트 언더베이스가 누락되면 프리플라이트 차단 상태로 판정한다", () => {
    const mask = createCharacterWithEarsMask(96, 96);
    const dieCutContour = generateStickerDieCutContour(mask, 96, 96, { dpi: 300, offsetMm: 3.5, includeKeyringHole: true });
    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-AKR-MISSING-WHITE",
      productType: "acrylic-keyring-charm", rightsBomAssets: createVerifiedBom(), dieCutContour, whiteUnderbase: null,
    });
    expect(manifest.exportStatus).toBe("blocked-preflight");
    expect(manifest.commercialExportAllowed).toBe(false);
    expect(manifest.blockingIssuesKo.some((m) => m.includes("화이트"))).toBe(true);
  });

  it("해상도가 150 DPI로 기준(300 DPI) 미달이면 인쇄 상품 프리플라이트가 출고를 차단한다", () => {
    const mask = createCharacterWithEarsMask(96, 96);
    const dieCutContour = generateStickerDieCutContour(mask, 96, 96, { dpi: 150, offsetMm: 2.5 });
    const productionSvg = renderMerchProductionSvg({
      title: "저해상도 스티커", productType: "diecut-vinyl-sticker", dpi: 150,
      artworkWidthPx: 96, artworkHeightPx: 96, dieCutContour,
    });
    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-LOW-DPI",
      productType: "diecut-vinyl-sticker", rightsBomAssets: createVerifiedBom(), dieCutContour, productionSvg,
    });
    expect(manifest.exportStatus).toBe("blocked-preflight");
    expect(manifest.commercialExportAllowed).toBe(false);
    expect(manifest.blockingIssuesKo.some((m) => m.includes("300 DPI"))).toBe(true);
  });

  it("이모티콘 팩 단독 출고 시 인쇄 DPI 제약 없이 24fps 루프·Rights BOM 통과만으로 출고 승인된다", () => {
    const emoticonLoop = synthesizeSeamlessEmoticonLoop({ platform: "discord", preset: "bow-thanks", frameCount: 24, fps: 24 });
    const manifest = buildIpMerchReleasePackManifest({
      ipTitle: "별빛 아카데미", characterName: "아린", skuCode: "SKU-EMO-DC-01",
      productType: "messenger-emoticon-pack", rightsBomAssets: createVerifiedBom(), emoticonLoop,
    });
    expect(manifest.exportStatus).toBe("ready-for-production");
    expect(manifest.commercialExportAllowed).toBe(true);
    expect(manifest.deliverables.emoticonPlatform).toBe("discord");
    expect(manifest.deliverables.emoticonFrameCount).toBe(24);
  });
});
