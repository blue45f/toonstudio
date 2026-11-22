import { describe, expect, it } from "vitest";

import {
  calculateBookSpineThicknessMm,
  canonicalJsonStringify,
  computeMoodLightingRig,
  computePrintPageGeometry,
  detectKoreanSpeechRegister,
  detectScriptMoodProfile,
  evaluateColorGamutBatch,
  evaluateRightsBomGovernance,
  generateStoryboardFromScript,
  interpolateMoodLightingRigs,
  issueHumanCraftReceipt,
  kelvinToRgb,
  localizeScriptNuances,
  mapStoryboardToMoodLighting,
  MAX_KELVIN,
  MIN_KELVIN,
  mmToPx,
  parseScriptDocument,
  planEpisodeLocalization,
  rgbToCmykSoftProof,
  runPrintCmykBleedPreflight,
  sha256Hex,
  summarizeStrokeHistory,
  verifyBubbleLocalizationReflow,
  verifyHumanCraftReceipt,
  type OnDeviceStrokeSample,
  type RightsBomAssetInput,
  type TimelapseCheckpointFrame,
} from "./index";

const SAMPLE_WEBTOON_SCRIPT = `
S#1. 학교 옥상 - 노을
붉은 노을이 옥상 난간을 길게 물들인다.
민준(긴장): "선배, 여기까지 올라온 이유가 뭐예요?"
수아(속삭임): "두근두근... 사실 오늘 꼭 전할 말이 있어."
[효과음: 휘잉]
---
수아의 떨리는 손에 들린 오래된 반지가 빛난다.
민준(분노): "지금 장난하는 겁니까!!"
[효과음: 쾅!!]

S#2. 낡은 서재 - 심야
(어두운 달빛 사이로 비가 내린다.)
나레이션: "그날 밤의 기억은 아직도 선명하다."
민준(독백): "돌아갈 수 있다면 얼마나 좋을까..."
`.trim();

function makeValidStrokes(count = 28): OnDeviceStrokeSample[] {
  return Array.from({ length: count }, (_, idx) => ({
    strokeId: `stk-${String(idx + 1).padStart(3, "0")}`,
    timestampMs: 1_700_000_000_000 + idx * 2_200,
    durationMs: 1_450 + (idx % 5) * 180,
    pointCount: 24 + (idx % 9) * 6,
    pressureVariance: 0.045 + (idx % 4) * 0.015,
    tiltVariance: 0.03 + (idx % 3) * 0.01,
    toolKind: idx % 7 === 0 ? "eraser" : idx % 3 === 0 ? "brush" : "pen",
    layerId: idx < 14 ? "layer-ink" : "layer-color",
    isUndoReverted: idx === 5,
  }));
}

function makeValidTimelapse(totalStrokes = 28): TimelapseCheckpointFrame[] {
  return [
    { frameIndex: 0, capturedAtMs: 1_700_000_005_000, strokeCountAtFrame: 6, frameHashSha256: sha256Hex("frame-0") },
    { frameIndex: 1, capturedAtMs: 1_700_000_025_000, strokeCountAtFrame: 15, frameHashSha256: sha256Hex("frame-1") },
    { frameIndex: 2, capturedAtMs: 1_700_000_050_000, strokeCountAtFrame: 22, frameHashSha256: sha256Hex("frame-2") },
    { frameIndex: 3, capturedAtMs: 1_700_000_070_000, strokeCountAtFrame: totalStrokes, frameHashSha256: sha256Hex("frame-3") },
  ];
}

function makeCleanRightsBom(): RightsBomAssetInput[] {
  return [
    {
      assetId: "asset-bg-rooftop",
      name: "노을 학교 옥상 3D 배경",
      category: "3d-bg",
      licenseCode: "COMMERCIAL-PERPETUAL",
      commercialAllowed: true,
      derivativesAllowed: true,
      attributionRequired: false,
    },
    {
      assetId: "asset-font-dialogue",
      name: "웹툰 대화체 상업 폰트",
      category: "font",
      licenseCode: "CC-BY",
      commercialAllowed: true,
      derivativesAllowed: true,
      attributionRequired: true,
      attributionText: "Font Foundry (CC-BY 4.0)",
    },
    {
      assetId: "asset-brush-ink",
      name: "프로 G펜 브러시 팩",
      category: "brush",
      licenseCode: "COMMERCIAL-RENTAL",
      commercialAllowed: true,
      derivativesAllowed: true,
      attributionRequired: false,
      rentalStartsAtIso: "2026-01-01T00:00:00.000Z",
      rentalExpiresAtIso: "2027-06-01T00:00:00.000Z",
    },
  ];
}

describe("1. script-to-storyboard-engine (대본 → 자동 콘티)", () => {
  it("동일 대본 입력에 대해 100% 결정적인 파싱·콘티 결과를 반환한다", () => {
    const planA = generateStoryboardFromScript(SAMPLE_WEBTOON_SCRIPT, { title: "1화 · 옥상의 비밀" });
    const planB = generateStoryboardFromScript(SAMPLE_WEBTOON_SCRIPT, { title: "1화 · 옥상의 비밀" });

    expect(planA).toEqual(planB);
    expect(planA.parsed.scenes).toHaveLength(2);
    expect(planA.parsed.scenes[0]?.location).toBe("학교 옥상");
    expect(planA.parsed.scenes[0]?.timeOfDay).toBe("노을");
    expect(planA.parsed.scenes[1]?.timeOfDay).toBe("심야");
    expect(planA.parsed.cast).toEqual(["민준", "수아"]);
    expect(planA.parsed.totalSfx).toBe(2);
  });

  it("모든 컷의 세로 좌표가 빈틈·겹침 없이 연속되고, 말풍선이 안전여백 내 비겹침 불변식을 만족한다", () => {
    const plan = generateStoryboardFromScript(SAMPLE_WEBTOON_SCRIPT, {
      canvasWidthPx: 800,
      safeMarginPx: 28,
      maxDialoguesPerCut: 2,
    });

    expect(plan.cuts.length).toBeGreaterThanOrEqual(5);
    expect(plan.cuts[0]?.shotType).toBe("establishing");

    let expectedY = 0;
    for (const cut of plan.cuts) {
      expect(cut.yStartPx).toBe(expectedY);
      expect(cut.widthPx).toBe(800);
      expect(cut.heightPx).toBeGreaterThan(0);
      expect(cut.tension01).toBeGreaterThanOrEqual(0.1);
      expect(cut.tension01).toBeLessThanOrEqual(1);
      expectedY += cut.heightPx + cut.gutterAfterPx;

      for (let i = 0; i < cut.bubbles.length; i += 1) {
        const b = cut.bubbles[i];
        expect(b).toBeDefined();
        if (!b) continue;
        expect(b.x).toBeGreaterThanOrEqual(plan.safeMarginPx);
        expect(b.x + b.width).toBeLessThanOrEqual(cut.widthPx - plan.safeMarginPx);
        expect(b.y).toBeGreaterThanOrEqual(plan.safeMarginPx);
        expect(b.y + b.height).toBeLessThanOrEqual(cut.heightPx);

        for (let j = i + 1; j < cut.bubbles.length; j += 1) {
          const other = cut.bubbles[j];
          if (!other) continue;
          const overlapsX = b.x < other.x + other.width && b.x + b.width > other.x;
          const overlapsY = b.y < other.y + other.height && b.y + b.height > other.y;
          expect(overlapsX && overlapsY).toBe(false);
        }
      }
    }

    expect(plan.pacing.totalScrollHeightPx).toBe(expectedY);
    expect(plan.pacing.totalCuts).toBe(plan.cuts.length);
  });

  it("감정·지문 키워드에 따라 말풍선 형태(외침/속삭임/독백/나레이션)와 샷(인서트/스플래시)을 정확히 분류한다", () => {
    const plan = generateStoryboardFromScript(SAMPLE_WEBTOON_SCRIPT);
    const allBubbles = plan.cuts.flatMap((c) => c.bubbles);

    expect(allBubbles.some((b) => b.shape === "whisper-dashed")).toBe(true);
    expect(allBubbles.some((b) => b.shape === "shout-burst")).toBe(true);
    expect(allBubbles.some((b) => b.shape === "narration-box")).toBe(true);
    expect(allBubbles.some((b) => b.shape === "thought-cloud")).toBe(true);
    expect(plan.cuts.some((c) => c.shotType === "detail-insert" || c.shotType === "extreme-close-up")).toBe(true);
  });

  it("대사 벽·단조로운 연속 샷·호흡 여백 부족을 페이싱 경고로 탐지한다", () => {
    const longSpeech = "지금 이 순간에도 시간이 빠르게 흘러가고 있고 우리가 막지 않으면 도시 전체의 방어막과 중앙 발전소가 한꺼번에 무너져 버릴 텐데 대체 왜 아무도 자리에서 일어나 움직이지 않는 건가요!";
    const monotoneScript = [
      "S#1. 복도 - 낮",
      `영수: "${longSpeech}"`,
      "---",
      '민수: "알았어."',
      "---",
      '철수: "그래."',
      "---",
      '지혜: "가자."',
    ].join("\n");

    const parsed = parseScriptDocument(monotoneScript);
    expect(parsed.totalDialogues).toBe(4);
    const plan = generateStoryboardFromScript(monotoneScript);
    expect(plan.pacing.warnings.some((w) => w.code === "dialogue-wall")).toBe(true);
    expect(plan.pacing.warnings.some((w) => w.code === "monotone-shots")).toBe(true);
  });
});

describe("2. script-mood-lighting-engine (무드·시간대 → Kelvin · 3D↔2D 림라이트)", () => {
  it("새벽·노을·긴장·회상·로맨스·야간 6대 키워드를 정확한 무드와 2700K~8500K 범위로 매핑한다", () => {
    const cases: readonly [string, string, number, number][] = [
      ["새벽 안개가 깔린 골목", "dawn", 3700, 4500],
      ["붉은 노을 지는 옥상", "sunset", 2700, 3200],
      ["살기가 감도는 긴장된 대치", "tension", 6400, 7200],
      ["그날의 기억을 떠올리는 회상 장면", "flashback", 3300, 3900],
      ["벚꽃이 흩날리는 로맨스 고백", "romance", 3100, 3700],
      ["달빛이 비추는 심야 야간 도로", "night", 7600, 8500],
    ];

    for (const [text, expectedMood, minK, maxK] of cases) {
      const rig = computeMoodLightingRig(text);
      expect(rig.primaryMood).toBe(expectedMood);
      expect(rig.kelvin).toBeGreaterThanOrEqual(minK);
      expect(rig.kelvin).toBeLessThanOrEqual(maxK);

      // 3D 주광·림라이트 벡터와 2D 투영 림라이트 법선이 단위벡터 불변식을 만족한다.
      const keyLen = Math.hypot(rig.keyLight.direction3D.x, rig.keyLight.direction3D.y, rig.keyLight.direction3D.z);
      const rimLen = Math.hypot(rig.rimLight3dTo2d.direction3D.x, rig.rimLight3dTo2d.direction3D.y, rig.rimLight3dTo2d.direction3D.z);
      const rim2dLen = Math.hypot(rig.rimLight3dTo2d.projectedNormal2D.x, rig.rimLight3dTo2d.projectedNormal2D.y);
      expect(keyLen).toBeCloseTo(1, 2);
      expect(rimLen).toBeCloseTo(1, 2);
      expect(rim2dLen).toBeCloseTo(1, 2);
    }
  });

  it("kelvinToRgb는 2700K~8500K 클램프를 유지하고 색온도 상승 시 R/B 비율이 단조 감소한다", () => {
    expect(kelvinToRgb(1000)).toEqual(kelvinToRgb(MIN_KELVIN));
    expect(kelvinToRgb(14000)).toEqual(kelvinToRgb(MAX_KELVIN));

    const temperatures = [2700, 3500, 4500, 5600, 6800, 8500];
    let prevRatio = Number.POSITIVE_INFINITY;
    for (const k of temperatures) {
      const rgb = kelvinToRgb(k);
      const ratio = rgb.r / Math.max(1, rgb.b);
      expect(ratio).toBeLessThanOrEqual(prevRatio + 1e-6);
      prevRatio = ratio;
    }
    expect(kelvinToRgb(2700).r).toBeGreaterThan(kelvinToRgb(2700).b);
    expect(kelvinToRgb(8500).b).toBeGreaterThan(kelvinToRgb(8500).r);
  });

  it("복합 무드 가중치 합은 1.0이며, 리그 보간과 스토리보드 일괄 매핑이 연속적으로 동작한다", () => {
    const blend = detectScriptMoodProfile("노을 지는 옥상에서의 긴장된 대치");
    expect(blend.contributions.length).toBe(2);
    const weightSum = blend.contributions.reduce((sum, entry) => sum + entry.weight, 0);
    expect(weightSum).toBeCloseTo(1, 3);

    const sunsetRig = computeMoodLightingRig("노을", "sunset");
    const nightRig = computeMoodLightingRig("야간", "night");
    const midRig = interpolateMoodLightingRigs(sunsetRig, nightRig, 0.5);
    expect(midRig.kelvin).toBeGreaterThan(sunsetRig.kelvin);
    expect(midRig.kelvin).toBeLessThan(nightRig.kelvin);

    const plan = generateStoryboardFromScript(SAMPLE_WEBTOON_SCRIPT);
    const mapped = mapStoryboardToMoodLighting(plan);
    expect(mapped).toHaveLength(plan.cuts.length);
    expect(mapped[0]?.kelvinDeltaFromPrev).toBe(0);
    expect(mapped.some((entry) => entry.rig.primaryMood === "sunset")).toBe(true);
    expect(mapped.some((entry) => entry.rig.primaryMood === "night")).toBe(true);
  });
});

describe("3. print-cmyk-bleed-preflight (CMYK 소프트 프루핑 · 3mm 도련 · 책등 산출)", () => {
  it("네온 RGB 원색은 CMYK 색역 이탈로 검출하고, 인쇄 친화 톤은 색역 내로 판정한다", () => {
    const neonGreen = rgbToCmykSoftProof({ r: 0, g: 255, b: 0 }, "japan-color-2001-coated");
    const neonCyan = rgbToCmykSoftProof({ r: 0, g: 255, b: 255 }, "japan-color-2001-coated");
    const neonMagenta = rgbToCmykSoftProof({ r: 255, g: 0, b: 255 }, "japan-color-2001-coated");
    const warmPaper = rgbToCmykSoftProof({ r: 245, g: 242, b: 234 }, "japan-color-2001-coated");
    const earthBrown = rgbToCmykSoftProof({ r: 122, g: 94, b: 74 }, "japan-color-2001-coated");

    expect(neonGreen.isOutOfGamut).toBe(true);
    expect(neonCyan.isOutOfGamut).toBe(true);
    expect(neonMagenta.isOutOfGamut).toBe(true);
    expect(neonGreen.deltaE76).toBeGreaterThan(20);
    expect(neonGreen.warningKo).toContain("색역 이탈");

    expect(warmPaper.isOutOfGamut).toBe(false);
    expect(earthBrown.isOutOfGamut).toBe(false);

    // 리치 블랙 TAC가 프로파일 한도를 절대 초과하지 않는다.
    const deepBlackUncoated = rgbToCmykSoftProof({ r: 4, g: 4, b: 4 }, "uncoated-book");
    expect(deepBlackUncoated.cmyk.tacPercent).toBeLessThanOrEqual(260);
    expect(deepBlackUncoated.isTacExceeded).toBe(true);

    const batch = evaluateColorGamutBatch(
      [{ r: 0, g: 255, b: 0 }, { r: 245, g: 242, b: 234 }],
      "japan-color-2001-coated",
    );
    expect(batch.outOfGamutCount).toBe(1);
    expect(batch.outOfGamutRatio).toBe(0.5);
  });

  it("3mm 도련·8개 재단선·안전여백·300DPI 픽셀 치수 및 책등 두께 단조 증가 불변식을 만족한다", () => {
    const geom = computePrintPageGeometry({ formatId: "a5", bleedMm: 3, dpi: 300 });
    expect(geom.trimBoxMm).toEqual({ xMm: 3, yMm: 3, widthMm: 148, heightMm: 210 });
    expect(geom.bleedBoxMm).toEqual({ xMm: 0, yMm: 0, widthMm: 154, heightMm: 216 });
    expect(geom.cropMarksMm).toHaveLength(8);
    expect(geom.trimWidthPx).toBe(mmToPx(148, 300));
    expect(geom.bleedWidthPx).toBe(mmToPx(154, 300));

    const thinBook = calculateBookSpineThicknessMm({
      interiorPageCount: 160, paperStock: "white-uncoated", interiorGsm: 100, bindingType: "perfect-bound",
    });
    const thickBook = calculateBookSpineThicknessMm({
      interiorPageCount: 320, paperStock: "white-uncoated", interiorGsm: 100, bindingType: "perfect-bound",
    });
    const heavyPaperBook = calculateBookSpineThicknessMm({
      interiorPageCount: 160, paperStock: "white-uncoated", interiorGsm: 150, bindingType: "perfect-bound",
    });
    const hardcoverBook = calculateBookSpineThicknessMm({
      interiorPageCount: 160, paperStock: "white-uncoated", interiorGsm: 100, bindingType: "hardcover",
    });
    const saddleBook = calculateBookSpineThicknessMm({
      interiorPageCount: 32, paperStock: "art-coated", interiorGsm: 100, bindingType: "saddle-stitch",
    });

    expect(thickBook.spineWidthMm).toBeGreaterThan(thinBook.spineWidthMm);
    expect(heavyPaperBook.spineWidthMm).toBeGreaterThan(thinBook.spineWidthMm);
    expect(hardcoverBook.spineWidthMm).toBeGreaterThan(thinBook.spineWidthMm);
    expect(thinBook.spineWidthMm).toBeGreaterThan(saddleBook.spineWidthMm);
    expect(saddleBook.spineTypographySafe).toBe(false);
    expect(thinBook.spineTypographySafe).toBe(true);

    const coverWithWings = calculateBookSpineThicknessMm({
      interiorPageCount: 200,
      paperStock: "cream-novel",
      interiorGsm: 100,
      bindingType: "perfect-bound",
      trimWidthMm: 152,
      trimHeightMm: 225,
      bleedMm: 3,
      wingWidthMm: 80,
    });
    expect(coverWithWings.fullCoverSpreadWidthMm).toBeCloseTo(
      3 * 2 + 80 * 2 + 152 * 2 + coverWithWings.spineWidthMm,
      2,
    );
    expect(coverWithWings.fullCoverSpreadHeightMm).toBe(231);
  });

  it("인쇄 프리플라이트가 정상 원고는 PASS, 저해상도/도련부족/비4배수/안전여백 이탈은 BLOCK 판정한다", () => {
    const passReport = runPrintCmykBleedPreflight({
      formatId: "shin-gukpan",
      bleedMm: 3,
      dpi: 300,
      profileId: "japan-color-2001-coated",
      colorSamples: [{ r: 240, g: 232, b: 220 }, { r: 112, g: 88, b: 70 }],
      criticalElements: [{ id: "bubble-1", label: "표지 제목", boxMm: { xMm: 25, yMm: 25, widthMm: 80, heightMm: 30 } }],
      spineInput: { interiorPageCount: 208, paperStock: "white-uncoated", interiorGsm: 100, bindingType: "perfect-bound" },
    });
    expect(passReport.verdict).toBe("PASS");
    expect(passReport.issues).toHaveLength(0);

    const blockReport = runPrintCmykBleedPreflight({
      formatId: "a5",
      bleedMm: 1,
      dpi: 150,
      profileId: "uncoated-book",
      colorSamples: [{ r: 0, g: 255, b: 0 }, { r: 0, g: 255, b: 255 }],
      criticalElements: [{ id: "edge-text", label: "재단선 침범 대사", boxMm: { xMm: 0.5, yMm: 2, widthMm: 50, heightMm: 20 } }],
      spineInput: { interiorPageCount: 102, paperStock: "art-coated", interiorGsm: 90, bindingType: "perfect-bound" },
    });
    expect(blockReport.verdict).toBe("BLOCK");
    const codes = blockReport.issues.map((issue) => issue.code);
    expect(codes).toContain("LOW_DPI");
    expect(codes).toContain("INSUFFICIENT_BLEED");
    expect(codes).toContain("OUT_OF_GAMUT_COLORS");
    expect(codes).toContain("SAFE_MARGIN_VIOLATION");
    expect(codes).toContain("PAGE_SIGNATURE_MISMATCH");
  });
});

describe("4. human-craft-and-license-governance (직접 작화 검증 배지 · SHA-256 변조 탐지 · Rights BOM)", () => {
  it("FIPS 180-4 SHA-256 표준 테스트 벡터와 키 순서 무관 정규화 직렬화가 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );

    expect(canonicalJsonStringify({ b: 2, a: { y: 1, x: 0 } })).toBe(
      canonicalJsonStringify({ a: { x: 0, y: 1 }, b: 2 }),
    );
  });

  it("정상 온디바이스 작화 이력·타임랩스·상업 Rights BOM에 직접 작화 검증 배지를 발급하고 단일 변조를 즉시 탐지한다", () => {
    const strokes = makeValidStrokes(28);
    const timelapseFrames = makeValidTimelapse(28);
    const rightsBomAssets = makeCleanRightsBom();

    const receipt = issueHumanCraftReceipt({
      workId: "work-001",
      episodeId: "ep-012",
      creatorHandle: "@studio_kim",
      issuedAtIso: "2026-11-22T06:00:00.000Z",
      strokes,
      timelapseFrames,
      rightsBomAssets,
    });

    expect(receipt.badgeStatus).toBe("verified-human-craft");
    expect(receipt.badgeLabelKo).toBe("직접 작화 검증 배지");
    expect(receipt.badgeLabelEn).toBe("Verified Human Craft");
    expect(receipt.rightsBomSummary.commercialPublishReady).toBe(true);
    expect(receipt.rightsBomSummary.requiredAttributions).toEqual(["Font Foundry (CC-BY 4.0)"]);

    const cleanVerify = verifyHumanCraftReceipt(receipt, { strokes, timelapseFrames, rightsBomAssets });
    expect(cleanVerify.valid).toBe(true);
    expect(cleanVerify.tamperReasons).toHaveLength(0);

    // 영수증 본문 1글자 변조 탐지
    const tamperedReceipt = { ...receipt, creatorHandle: "@impostor" };
    const tamperResult = verifyHumanCraftReceipt(tamperedReceipt);
    expect(tamperResult.valid).toBe(false);
    expect(tamperResult.tamperReasons[0]).toContain("RECEIPT_DIGEST_MISMATCH");

    // 원본 스트로크 1개 변조 탐지
    const mutatedStrokes = strokes.map((s, idx) => (idx === 10 ? { ...s, pointCount: s.pointCount + 1 } : s));
    expect(summarizeStrokeHistory(mutatedStrokes).strokeChainSha256).not.toBe(receipt.strokeSummary.strokeChainSha256);
    const liveTamper = verifyHumanCraftReceipt(receipt, { strokes: mutatedStrokes });
    expect(liveTamper.valid).toBe(false);
    expect(liveTamper.tamperReasons[0]).toContain("STROKE_CHAIN_MISMATCH");
  });

  it("대여 만료·만료 임박·비상업 자산 및 미고지 생성형 레이어를 정확히 태깅하고 배지 발급을 차단한다", () => {
    const bom = evaluateRightsBomGovernance(
      [
        {
          assetId: "a-expired",
          name: "만료 배경 팩",
          category: "3d-bg",
          licenseCode: "COMMERCIAL-RENTAL",
          commercialAllowed: true,
          derivativesAllowed: true,
          attributionRequired: false,
          rentalExpiresAtIso: "2026-11-01T00:00:00.000Z",
        },
        {
          assetId: "a-soon",
          name: "임박 브러시 팩",
          category: "brush",
          licenseCode: "COMMERCIAL-RENTAL",
          commercialAllowed: true,
          derivativesAllowed: false,
          attributionRequired: false,
          rentalExpiresAtIso: "2026-11-28T00:00:00.000Z",
        },
        {
          assetId: "a-nc",
          name: "비상업 텍스처",
          category: "texture",
          licenseCode: "CC-BY-NC",
          commercialAllowed: false,
          derivativesAllowed: true,
          attributionRequired: true,
        },
      ],
      "2026-11-22T00:00:00.000Z",
    );

    expect(bom.commercialPublishReady).toBe(false);
    expect(bom.blockingAssetIds).toEqual(["a-expired", "a-nc"]);
    expect(bom.expiringSoonAssetIds).toEqual(["a-soon"]);
    expect(bom.assets.find((a) => a.assetId === "a-expired")?.tags).toContain("RENTAL_EXPIRED_BLOCK");
    expect(bom.assets.find((a) => a.assetId === "a-soon")?.tags).toContain("RENTAL_EXPIRING_SOON");
    expect(bom.assets.find((a) => a.assetId === "a-soon")?.tags).toContain("NO_DERIVATIVES_WARN");
    expect(bom.assets.find((a) => a.assetId === "a-nc")?.tags).toContain("NON_COMMERCIAL_BLOCK");

    const blockedReceipt = issueHumanCraftReceipt({
      workId: "work-002",
      episodeId: "ep-001",
      creatorHandle: "@studio_kim",
      issuedAtIso: "2026-11-22T00:00:00.000Z",
      strokes: makeValidStrokes(28),
      timelapseFrames: makeValidTimelapse(28),
      rightsBomAssets: makeCleanRightsBom(),
      hasUnattributedGenerativeLayer: true,
    });
    expect(blockedReceipt.badgeStatus).toBe("unverified");
  });
});

describe("5. global-localization-nuance (4개국 문화적 뉘앙스 치환 · 확장률 · 세로쓰기 리플로우)", () => {
  it("한·영·일·스페인어 호칭·존댓말·의성어(SFX) 치환과 사용자 용어집 우선순위가 정확히 동작한다", () => {
    expect(detectKoreanSpeechRegister("감사합니다.")).toBe("formal");
    expect(detectKoreanSpeechRegister("죄송해요.")).toBe("polite");
    expect(detectKoreanSpeechRegister("잠깐만 기다려.")).toBe("casual");

    const enCasual = localizeScriptNuances("선배, 잠깐만! 두근두근", {
      targetLocale: "en",
      register: "casual",
      listenerName: "Jisu",
    });
    expect(enCasual.localizedText).toBe("Jisu, Hold on a second! BA-DUMP");
    expect(enCasual.substitutions.map((s) => s.category)).toEqual(
      expect.arrayContaining(["honorific", "register-phrase", "sfx"]),
    );

    const enManga = localizeScriptNuances("선배!", {
      targetLocale: "en",
      preserveMangaHonorificsInEnglish: true,
    });
    expect(enManga.localizedText).toBe("Senpai!");

    const jaPolite = localizeScriptNuances("선배, 죄송해요. 쾅!", {
      targetLocale: "ja",
      register: "polite",
    });
    expect(jaPolite.localizedText).toBe("先輩, すみません. ドォン!");
    expect(jaPolite.targetRegisterHint).toContain("丁寧語");

    const esFormal = localizeScriptNuances("선생님, 죄송해요. 번쩍!", {
      targetLocale: "es",
      register: "formal",
    });
    expect(esFormal.localizedText).toBe("profesor, Le pido disculpas. ¡DESTELLO!!");
    expect(esFormal.targetRegisterHint).toContain("usted");

    // 사용자 커스텀 용어집이 기본 용어집보다 우선 적용된다.
    const custom = localizeScriptNuances("선배, 쾅!", {
      targetLocale: "en",
      customGlossary: [
        {
          id: "custom-sunbae",
          sourceKo: "선배",
          category: "honorific",
          translations: { ko: "선배", en: "Captain", ja: "隊長", es: "Capitán" },
          culturalNoteKo: "작품 전용 계급 호칭",
        },
      ],
    });
    expect(custom.localizedText).toBe("Captain, BOOM!");
  });

  it("영어/스페인어 가로 확장률 및 오버플로 판정과 일본어 세로쓰기(vertical-rl) 단수·타테추요코를 검증한다", () => {
    const esOverflow = verifyBubbleLocalizationReflow(
      "잠깐만요!",
      "¡Por favor, espere un momento antes de abrir esa puerta prohibida!",
      "es",
      { widthPx: 150, heightPx: 90, fontSizePx: 18, minReadableFontSizePx: 11 },
    );
    expect(esOverflow.writingMode).toBe("horizontal-tb");
    expect(esOverflow.actualExpansionRatio).toBeGreaterThan(2);
    expect(["expand-bubble", "overflow-block"]).toContain(esOverflow.status);
    expect(esOverflow.recommendedHeightPx).toBeGreaterThan(90);

    const enTighten = verifyBubbleLocalizationReflow(
      "여기야!",
      "Over here, hurry up right now!",
      "en",
      { widthPx: 155, heightPx: 88, fontSizePx: 18, minReadableFontSizePx: 11 },
    );
    expect(["tighten-font", "expand-bubble", "fits"]).toContain(enTighten.status);
    expect(enTighten.recommendedFontSizePx).toBeGreaterThanOrEqual(11);

    const jaVertical = verifyBubbleLocalizationReflow(
      "24시간 기다렸어!!",
      "24時間ずっと待っていたんだよ!!本当に心配したんだからね?!",
      "ja",
      { widthPx: 110, heightPx: 180, fontSizePx: 18 },
    );
    expect(jaVertical.writingMode).toBe("vertical-rl");
    expect(jaVertical.tateChuYokoTokens).toEqual(expect.arrayContaining(["24", "!!", "?!"]));
    expect(jaVertical.lineOrColumnCount).toBeGreaterThanOrEqual(2);

    const episodeReport = planEpisodeLocalization(
      [
        {
          bubbleId: "b-1",
          speaker: "민준",
          listenerName: "Sora",
          sourceKoText: "선배, 잠깐만! 두근두근",
          geometry: { widthPx: 220, heightPx: 130, fontSizePx: 16 },
        },
        {
          bubbleId: "b-2",
          speaker: "수아",
          sourceKoText: "감사합니다!",
          geometry: { widthPx: 220, heightPx: 120, fontSizePx: 16 },
        },
      ],
      { targetLocale: "es", register: "polite" },
    );
    expect(episodeReport.totalBubbles).toBe(2);
    expect(episodeReport.meanExpansionRatio).toBeGreaterThan(0.8);
    expect(episodeReport.bubbles[0]?.localization.localizedText).toContain("TUM-TUM");
  });
});
