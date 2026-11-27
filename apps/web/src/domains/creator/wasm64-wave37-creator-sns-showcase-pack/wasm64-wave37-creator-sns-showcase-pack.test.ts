import { describe, expect, it } from "vitest";

import {
  applySpoilerSafeRegionBlur,
  buildCreatorShowcaseAttribution,
  composeBeforeAfterSplitCard,
  CREATOR_SHOWCASE_UTM_MEDIUM,
  DEFAULT_DIVIDER_RGBA,
  DEFAULT_VERTICAL_9X16_HUD_INSETS,
  formatRightsBomAttributionLine,
  INSTAGRAM_CAROUSEL_CLASSIC_MAX_SLIDES,
  INSTAGRAM_CAROUSEL_EXTENDED_MAX_SLIDES,
  MIN_WATERMARK_WCAG_CONTRAST,
  planSnsShowcaseExport,
  selectMilestoneTimelapseFrames,
  stampCreatorSignatureAndRightsFooter,
  type ProcessStrokeSnapshot,
  type RgbaColor,
  type ShowcaseSemanticRegion,
} from "./index";

import { shareTargetUrl } from "@/shared/lib/share";

function makeSolidRgba(width: number, height: number, color: RgbaColor): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    buf[off] = color.r;
    buf[off + 1] = color.g;
    buf[off + 2] = color.b;
    buf[off + 3] = color.a;
  }
  return buf;
}

describe("wasm64-wave37-creator-sns-showcase-pack", () => {
  it("1. 인스타그램 4:5 캐러셀 분할 시 절단선에 걸친 말풍선과 캐릭터 얼굴을 가로지르지 않는다", () => {
    const regions: ShowcaseSemanticRegion[] = [
      { regionId: "face-1", kind: "character-face", x: 320, y: 1_260, width: 360, height: 220 },
      { regionId: "balloon-1", kind: "speech-balloon", x: 180, y: 2_480, width: 520, height: 210 },
      { regionId: "face-2", kind: "character-face", x: 260, y: 3_620, width: 400, height: 260 },
    ];
    const plan = planSnsShowcaseExport({
      preset: "instagram-carousel-4x5",
      sourceWidthPx: 1_080,
      sourceHeightPx: 4_500,
      regions,
      share: { title: "달빛 공방 12화", workUrl: "/works/moonlight-ep12" },
    });

    expect(plan.zeroProtectedSlices).toBe(true);
    expect(plan.slides.length).toBeGreaterThanOrEqual(3);
    for (const slide of plan.slides) {
      expect(slide.outputWidthPx).toBe(1_080);
      expect(slide.outputHeightPx).toBe(1_350);
      expect(slide.slicedProtectedRegionIds).toEqual([]);
    }
    expect(plan.slides[0]?.sourceRect.height).toBeLessThanOrEqual(1_248);
    expect(plan.slides[0]?.adjustedForBalloonOrFaceSafety).toBe(true);
  });

  it("2. 연쇄적으로 겹친 말풍선·얼굴 구간에서도 2차 안전 절단선을 찾아 무절단을 유지한다", () => {
    const regions: ShowcaseSemanticRegion[] = [
      { regionId: "balloon-low", kind: "speech-balloon", x: 140, y: 1_270, width: 480, height: 180 },
      { regionId: "face-above", kind: "character-face", x: 240, y: 1_110, width: 320, height: 190 },
    ];
    const plan = planSnsShowcaseExport({
      preset: "instagram-carousel-4x5",
      sourceWidthPx: 1_080,
      sourceHeightPx: 3_000,
      regions,
      share: { title: "연쇄 컷 테스트", workUrl: "/works/cascade" },
    });

    expect(plan.zeroProtectedSlices).toBe(true);
    expect(plan.slides[0]?.sourceRect.height).toBeLessThanOrEqual(1_098);
    expect(plan.slides[1]?.containedRegionIds).toEqual(expect.arrayContaining(["face-above", "balloon-low"]));
  });

  it("3. 컷 사이 자연 여백(panelGuttersY)이 절단선 부근에 있으면 여백 위치에 우선 스냅한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "instagram-carousel-4x5",
      sourceWidthPx: 1_080,
      sourceHeightPx: 2_700,
      panelGuttersY: [1_220, 2_440],
      share: { title: "여백 스냅", workUrl: "/works/gutter-snap" },
    });

    expect(plan.slides[0]?.sourceRect.height).toBe(1_220);
    expect(plan.slides[0]?.adjustedForBalloonOrFaceSafety).toBe(true);
  });

  it("4. 인스타그램 캐러셀 클래식 10장 제한과 확장 20장 옵션을 모두 지원하고 잔여 높이를 보고한다", () => {
    const plan10 = planSnsShowcaseExport({
      preset: "instagram-carousel-4x5",
      sourceWidthPx: 1_080,
      sourceHeightPx: 20_000,
      share: { title: "장편 에피소드", workUrl: "/works/long-ep" },
    });
    expect(plan10.totalSlides).toBe(INSTAGRAM_CAROUSEL_CLASSIC_MAX_SLIDES);
    expect(plan10.truncatedRemainingHeightPx).toBeGreaterThan(0);

    const plan20 = planSnsShowcaseExport({
      preset: "instagram-carousel-4x5",
      sourceWidthPx: 1_080,
      sourceHeightPx: 20_000,
      carouselMaxSlides: INSTAGRAM_CAROUSEL_EXTENDED_MAX_SLIDES,
      share: { title: "장편 에피소드 확장", workUrl: "/works/long-ep" },
    });
    expect(plan20.totalSlides).toBeGreaterThan(10);
    expect(plan20.totalSlides).toBeLessThanOrEqual(20);
    expect(plan20.truncatedRemainingHeightPx).toBe(0);
  });

  it("5. X(트위터) 16:9 단일 쇼케이스는 최고 주목도 캐릭터 얼굴 중심으로 1600x900 스마트 크롭한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "x-single-16x9",
      sourceWidthPx: 1_600,
      sourceHeightPx: 4_800,
      regions: [
        { regionId: "prop-bg", kind: "key-prop", x: 200, y: 400, width: 300, height: 200, salienceWeight: 0.5 },
        { regionId: "hero-face", kind: "character-face", x: 520, y: 2_900, width: 420, height: 380, salienceWeight: 3.0 },
      ],
      share: { title: "하이라이트 컷", workUrl: "/works/hero-cut" },
    });

    const slide = plan.slides[0];
    expect(plan.totalSlides).toBe(1);
    expect(slide?.outputWidthPx).toBe(1_600);
    expect(slide?.outputHeightPx).toBe(900);
    expect(slide?.sourceRect.height).toBe(900);
    expect(slide?.containedRegionIds).toContain("hero-face");
    expect(slide?.slicedProtectedRegionIds).toEqual([]);
  });

  it("6. X 4분할(x-quad-4up) 프리셋은 에피소드 4개 서사 구간의 앵커를 각각 1600x900 타일로 추출한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "x-quad-4up",
      sourceWidthPx: 1_600,
      sourceHeightPx: 8_000,
      regions: [
        { regionId: "beat-1", kind: "character-face", x: 500, y: 600, width: 320, height: 300 },
        { regionId: "beat-2", kind: "speech-balloon", x: 400, y: 2_700, width: 450, height: 240 },
        { regionId: "beat-3", kind: "character-face", x: 550, y: 4_800, width: 360, height: 320 },
        { regionId: "beat-4", kind: "character-face", x: 480, y: 6_900, width: 380, height: 340 },
      ],
      share: { title: "4컷 요약", workUrl: "/works/quad-preview" },
    });

    expect(plan.totalSlides).toBe(4);
    expect(plan.slides.map((s) => s.containedRegionIds[0])).toEqual(["beat-1", "beat-2", "beat-3", "beat-4"]);
    expect(plan.zeroProtectedSlices).toBe(true);
  });

  it("7. 카카오톡 와이드(800x400) 및 카카오·네이버 정방형(800x800) 피드 카드를 정확히 프레이밍한다", () => {
    const regions: ShowcaseSemanticRegion[] = [
      { regionId: "main-face", kind: "character-face", x: 250, y: 920, width: 280, height: 260, salienceWeight: 2 },
    ];
    const kakaoWide = planSnsShowcaseExport({
      preset: "kakao-wide-800x400",
      sourceWidthPx: 800,
      sourceHeightPx: 2_400,
      regions,
      share: { title: "카카오 카드", workUrl: "/works/kakao-card" },
    });
    expect(kakaoWide.slides[0]?.outputWidthPx).toBe(800);
    expect(kakaoWide.slides[0]?.outputHeightPx).toBe(400);
    expect(kakaoWide.slides[0]?.containedRegionIds).toContain("main-face");

    const naverSquare = planSnsShowcaseExport({
      preset: "kakao-naver-square-800x800",
      sourceWidthPx: 800,
      sourceHeightPx: 2_400,
      regions,
      share: { title: "네이버 카드", workUrl: "/works/naver-card" },
    });
    expect(naverSquare.slides[0]?.outputWidthPx).toBe(800);
    expect(naverSquare.slides[0]?.outputHeightPx).toBe(800);
    expect(naverSquare.slides[0]?.containedRegionIds).toContain("main-face");
  });

  it("8. 가로형 와이드 일러스트 원본에서도 포컬 앵커 좌우 스냅 크롭을 정확히 계산한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "kakao-naver-square-800x800",
      sourceWidthPx: 2_400,
      sourceHeightPx: 800,
      regions: [{ regionId: "right-hero", kind: "character-face", x: 1_900, y: 200, width: 340, height: 340 }],
      share: { title: "와이드 일러스트", workUrl: "/works/wide-illust" },
    });

    expect(plan.slides[0]?.sourceRect.width).toBe(800);
    expect(plan.slides[0]?.sourceRect.x).toBeGreaterThanOrEqual(1_600);
    expect(plan.slides[0]?.containedRegionIds).toContain("right-hero");
  });

  it("9. 9:16 숏폼에서 우측·하단 HUD 가림 영역에 말풍선이 침범하면 안전 영역 안으로 자동 리프레임한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "tiktok-reels-shorts-9x16",
      sourceWidthPx: 1_080,
      sourceHeightPx: 1_920,
      regions: [{ regionId: "bottom-balloon", kind: "speech-balloon", x: 640, y: 1_680, width: 400, height: 180 }],
      share: { title: "릴스 티저", workUrl: "/works/reels-teaser" },
    });

    const audit = plan.slides[0]?.hudSafeZoneAudit;
    expect(audit?.intrudingRegionIdsBeforeReframe).toEqual(["bottom-balloon"]);
    expect(audit?.autoReframedToSafeZone).toBe(true);
    expect(audit?.intrudingRegionIdsAfterReframe).toEqual([]);
    expect(audit?.minClearancePx).toBeGreaterThanOrEqual(0);
    expect(plan.slides[0]?.letterboxPadding.bottomPx).toBeGreaterThanOrEqual(DEFAULT_VERTICAL_9X16_HUD_INSETS.bottomPx);
  });

  it("10. 9:16 숏폼에서 모든 대사·얼굴이 안전 영역 안에 있으면 불필요한 축소 없이 풀블리드를 유지한다", () => {
    const plan = planSnsShowcaseExport({
      preset: "tiktok-reels-shorts-9x16",
      sourceWidthPx: 1_080,
      sourceHeightPx: 1_920,
      regions: [{ regionId: "center-face", kind: "character-face", x: 240, y: 420, width: 420, height: 460 }],
      share: { title: "안전 구도 릴스", workUrl: "/works/safe-reels" },
    });

    expect(plan.slides[0]?.hudSafeZoneAudit?.autoReframedToSafeZone).toBe(false);
    expect(plan.slides[0]?.contentPlacementRect).toEqual({ x: 0, y: 0, width: 1_080, height: 1_920 });
  });

  it("11. ShareChannel·SharePayload 호환 UTM(utm_medium=creator_showcase) 메타데이터를 정확히 생성한다", () => {
    const attr = buildCreatorShowcaseAttribution({
      preset: "x-single-16x9",
      share: {
        title: "  별빛 연대기   1화 ",
        workUrl: "/works/starlight-1",
        text: "작화 과정 공개!",
        origin: "https://www.toonstudio.cloud",
      },
      navigatorLike: null,
    });

    const parsed = new URL(attr.attributedUrl);
    expect(attr.channel).toBe("x");
    expect(parsed.searchParams.get("utm_source")).toBe("x");
    expect(parsed.searchParams.get("utm_medium")).toBe(CREATOR_SHOWCASE_UTM_MEDIUM);
    expect(parsed.searchParams.get("utm_content")).toBe("x-single-16x9");
    expect(attr.sharePayload.title).toBe("별빛 연대기 1화");
    expect(shareTargetUrl("x", attr.sharePayload)).toContain("twitter.com/intent/tweet");
  });

  it("12. Web Share API navigator.canShare({ files }) 지원 여부에 따라 권장 공유 모드를 분기한다", () => {
    const mockFile = new File([new Uint8Array([137, 80, 78, 71])], "slide-01.png", { type: "image/png" });

    const withFileShare = buildCreatorShowcaseAttribution({
      preset: "instagram-carousel-4x5",
      share: { title: "캐러셀 공유", workUrl: "https://www.toonstudio.cloud/works/1" },
      candidateShareFiles: [mockFile],
      navigatorLike: { share: async () => undefined, canShare: (d) => Array.isArray(d?.files) && d.files.length > 0 },
    });
    expect(withFileShare.canShareFiles).toBe(true);
    expect(withFileShare.recommendedShareMode).toBe("web-share-files");

    const urlOnlyShare = buildCreatorShowcaseAttribution({
      preset: "instagram-carousel-4x5",
      share: { title: "링크만 지원", workUrl: "https://www.toonstudio.cloud/works/1" },
      candidateShareFiles: [mockFile],
      navigatorLike: { share: async () => undefined, canShare: (d) => !d?.files && Boolean(d?.url) },
    });
    expect(urlOnlyShare.canShareFiles).toBe(false);
    expect(urlOnlyShare.recommendedShareMode).toBe("web-share-url");

    const fallback = buildCreatorShowcaseAttribution({
      preset: "instagram-carousel-4x5",
      share: { title: "데스크톱 폴백", workUrl: "https://www.toonstudio.cloud/works/1" },
      candidateShareFiles: [mockFile],
      navigatorLike: null,
    });
    expect(fallback.recommendedShareMode).toBe("download-and-copy-link");
  });

  it("13. 수직(vertical) 비포/애프터 분할 카드는 좌측 선화·중앙 경계선·우측 완성화 픽셀을 정확히 합성한다", () => {
    const before = makeSolidRgba(80, 40, { r: 240, g: 240, b: 245, a: 255 });
    const after = makeSolidRgba(80, 40, { r: 30, g: 110, b: 190, a: 255 });
    const card = composeBeforeAfterSplitCard({
      width: 80,
      height: 40,
      beforeRgba: before,
      afterRgba: after,
      beforeStage: "lineart",
      afterStage: "final-color",
      splitMode: "vertical",
      splitRatio: 0.5,
      dividerThicknessPx: 2,
      renderStageBadges: false,
    });

    expect(card.splitXAtTop).toBe(40);
    expect(card.splitXAtBottom).toBe(40);
    expect(card.beforePixelCount + card.dividerPixelCount + card.afterPixelCount).toBe(80 * 40);
    expect(Array.from(card.outputRgba.slice((20 * 80 + 10) * 4, (20 * 80 + 10) * 4 + 4))).toEqual([240, 240, 245, 255]);
    expect(Array.from(card.outputRgba.slice((20 * 80 + 40) * 4, (20 * 80 + 40) * 4 + 4))).toEqual([
      DEFAULT_DIVIDER_RGBA.r,
      DEFAULT_DIVIDER_RGBA.g,
      DEFAULT_DIVIDER_RGBA.b,
      255,
    ]);
    expect(Array.from(card.outputRgba.slice((20 * 80 + 70) * 4, (20 * 80 + 70) * 4 + 4))).toEqual([30, 110, 190, 255]);
  });

  it("14. 사선(diagonal) 비포/애프터 와이프는 상·하단 경계 X좌표 기울기와 좌상·우하 단계 배지를 함께 스탬핑한다", () => {
    const before = makeSolidRgba(160, 120, { r: 235, g: 232, b: 224, a: 255 });
    const after = makeSolidRgba(160, 120, { r: 42, g: 88, b: 68, a: 255 });
    const card = composeBeforeAfterSplitCard({
      width: 160,
      height: 120,
      beforeRgba: before,
      afterRgba: after,
      beforeStage: "sketch",
      afterStage: "final-color",
      splitMode: "diagonal",
      diagonalTiltDeg: 18,
      renderStageBadges: true,
    });

    expect(card.splitXAtTop).toBeGreaterThan(card.splitXAtMidY);
    expect(card.splitXAtBottom).toBeLessThan(card.splitXAtMidY);
    expect(card.beforeBadgeRect).not.toBeNull();
    expect(card.afterBadgeRect).not.toBeNull();
    expect(card.outputRgba[(2 * 160 + 86) * 4]).toBe(235);
    expect(card.outputRgba[(117 * 160 + 72) * 4]).toBe(42);
  });

  it("15. 휴지기와 스트로크 편차가 극심한 기록에서도 15초 120BPM 메이킹 릴 4단계 시간을 균형 배분한다", () => {
    const snapshots: ProcessStrokeSnapshot[] = [
      ...Array.from({ length: 3 }, (_, i) => ({ frameId: `rough-${i}`, timestampMs: i * 2_000, stage: "sketch" as const, strokeCount: 10 + i * 8 })),
      ...Array.from({ length: 60 }, (_, i) => ({ frameId: `line-${i}`, timestampMs: 7_200_000 + i * 30_000, stage: "lineart" as const, strokeCount: 50 + i * 25 })),
      ...Array.from({ length: 4 }, (_, i) => ({ frameId: `flat-${i}`, timestampMs: 9_500_000 + i * 10_000, stage: "flat" as const, strokeCount: 1_600 + i * 12 })),
      ...Array.from({ length: 40 }, (_, i) => ({ frameId: `final-${i}`, timestampMs: 11_000_000 + i * 45_000, stage: "final-color" as const, strokeCount: 1_700 + i * 30 })),
    ];

    const reel = selectMilestoneTimelapseFrames({ snapshots, reelDurationSec: 15, bpm: 120 });
    expect(reel.totalReelDurationMs).toBe(15_000);
    expect(reel.beatIntervalMs).toBe(500);
    expect(reel.selectedFrames.length).toBe(30);
    expect(reel.allTransitionsBeatSynced).toBe(true);
    expect(reel.maxStageShareDeviation).toBeLessThanOrEqual(0.05);
    expect(reel.selectedFrames.reduce((acc, f) => acc + f.screenDurationMs, 0)).toBe(15_000);
    expect(reel.stageAllocations.map((s) => s.stage)).toEqual(["rough", "lineart", "flat", "final"]);
    for (const alloc of reel.stageAllocations) {
      expect(alloc.allocatedDurationMs).toBeGreaterThanOrEqual(2_500);
    }
    expect(reel.selectedFrames.at(-1)?.sourceFrameId).toBe("final-39");
  });

  it("16. 역순으로 뒤섞인 스냅샷 입력도 타임스탬프 순으로 정렬해 각 단계의 마지막 마일스톤을 보존한다", () => {
    const reel = selectMilestoneTimelapseFrames({
      snapshots: [
        { frameId: "final-done", timestampMs: 9_000, stage: "final-color", strokeCount: 500 },
        { frameId: "rough-start", timestampMs: 1_000, stage: "rough", strokeCount: 15 },
        { frameId: "line-mid", timestampMs: 4_000, stage: "lineart", strokeCount: 220 },
      ],
      reelDurationSec: 6,
      bpm: 120,
      beatsPerCut: 2,
    });

    expect(reel.selectedFrames.length).toBe(6);
    const terminals = reel.selectedFrames.filter((f) => f.isStageTerminalMilestone).map((f) => f.sourceFrameId);
    expect(terminals).toEqual(["rough-start", "line-mid", "final-done"]);
  });

  it("17. 스포일러 가우시안 박스 블러는 지정된 말풍선 내부 고주파 대비만 낮추고 외부 원화를 100% 보존한다", () => {
    const width = 96;
    const height = 96;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const ink = (x + y) % 2 === 0 ? 15 : 245;
        source[off] = ink;
        source[off + 1] = ink;
        source[off + 2] = ink;
        source[off + 3] = 255;
      }
    }

    const res = applySpoilerSafeRegionBlur({
      width,
      height,
      sourceRgba: source,
      spoilerRegions: [
        { regionId: "twist-balloon", kind: "dialogue-balloon", x: 24, y: 24, width: 48, height: 48, blurMode: "gaussian-box", blurRadiusPx: 8, featherPx: 5 },
      ],
    });

    expect(res.blurredRegionCount).toBe(1);
    expect(res.untouchedOutsidePixelCount).toBe(width * height - 48 * 48);
    expect(res.regionMetrics[0]?.detailReductionRatio).toBeGreaterThan(0.85);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x < 24 || x >= 72 || y < 24 || y >= 72) {
          const off = (y * width + x) * 4;
          expect(res.outputRgba[off]).toBe(source[off]);
        }
      }
    }
  });

  it("18. 모자이크-가우시안 복합 스포일러 마스킹은 반전 연출 컷의 세밀한 윤곽을 강하게 뭉갠다", () => {
    const width = 80;
    const height = 80;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const val = i % 3 === 0 ? 10 : 250;
      source[i * 4] = val;
      source[i * 4 + 1] = 255 - val;
      source[i * 4 + 2] = val;
      source[i * 4 + 3] = 255;
    }

    const res = applySpoilerSafeRegionBlur({
      width,
      height,
      sourceRgba: source,
      spoilerRegions: [
        { regionId: "villain-twist", kind: "plot-twist", x: 16, y: 16, width: 48, height: 48, blurMode: "mosaic-gaussian", mosaicBlockPx: 8, blurRadiusPx: 6 },
      ],
    });

    expect(res.regionMetrics[0]?.detailReductionRatio).toBeGreaterThan(0.8);
    expect(res.untouchedOutsidePixelCount).toBe(width * height - 48 * 48);
  });

  it("19. 밝은 원고 배경 코너에서는 어두운 먹색 잉크(dark-on-light)로 작가 서명을 찍어 WCAG 4.5:1 이상을 확보한다", () => {
    const lightCanvas = makeSolidRgba(200, 140, { r: 248, g: 246, b: 240, a: 255 });
    const res = stampCreatorSignatureAndRightsFooter({
      width: 200,
      height: 140,
      sourceRgba: lightCanvas,
      creatorHandle: "haneul_art",
      corner: "bottom-right",
    });

    expect(res.normalizedHandle).toBe("@haneul_art");
    expect(res.inkScheme).toBe("dark-on-light");
    expect(res.sampledBgLuminance).toBeGreaterThan(0.85);
    expect(res.inkContrastRatio).toBeGreaterThanOrEqual(MIN_WATERMARK_WCAG_CONTRAST);
    expect(res.signaturePixelCount).toBeGreaterThan(20);
    expect(res.footerAttached).toBe(false);
  });

  it("20. 어두운 야경 컷 코너에서는 밝은 상아색 잉크(light-on-dark)로 자동 반전하고 한글 핸들도 정상 스탬핑한다", () => {
    const darkCanvas = makeSolidRgba(200, 140, { r: 14, g: 18, b: 28, a: 255 });
    const res = stampCreatorSignatureAndRightsFooter({
      width: 200,
      height: 140,
      sourceRgba: darkCanvas,
      creatorHandle: "@하늘공방",
      corner: "top-left",
    });

    expect(res.normalizedHandle).toBe("@하늘공방");
    expect(res.inkScheme).toBe("light-on-dark");
    expect(res.sampledBgLuminance).toBeLessThan(0.05);
    expect(res.inkContrastRatio).toBeGreaterThanOrEqual(12);
    expect(res.signaturePixelCount).toBeGreaterThan(20);
  });

  it("21. CC-BY 에셋이 포함되면 Rights BOM 출처 표시줄을 하단에 부착하고 하단 서명과 겹치지 않게 배치한다", () => {
    const canvas = makeSolidRgba(320, 180, { r: 230, g: 232, b: 236, a: 255 });
    const res = stampCreatorSignatureAndRightsFooter({
      width: 320,
      height: 180,
      sourceRgba: canvas,
      creatorHandle: "@studio_miso",
      corner: "bottom-right",
      rightsBomAssets: [
        { assetId: "bg-castle", title: "Old Castle Hall", creatorName: "AtelierB", licenseId: "CC-BY-4.0" },
        { assetId: "bg-castle", title: "Old Castle Hall", creatorName: "AtelierB", licenseId: "CC-BY-4.0" },
        { assetId: "brush-own", title: "G-Pen Custom", licenseId: "creator-owned" },
      ],
    });

    expect(res.footerAttached).toBe(true);
    expect(res.attributionAssetCount).toBe(1);
    expect(res.attributionLine).toBe("Rights BOM · CC-BY: Old Castle Hall (AtelierB)");
    expect(res.signatureRect.y + res.signatureRect.height).toBeLessThanOrEqual(res.footerRect?.y ?? 0);
  });

  it("22. creator-owned 및 CC0-1.0 에셋만 있는 경우에는 불필요한 Rights BOM 푸터를 생략한다", () => {
    const formatted = formatRightsBomAttributionLine([
      { assetId: "a1", title: "My Ink Brush", licenseId: "creator-owned" },
      { assetId: "a2", title: "Public Paper Noise", licenseId: "CC0-1.0" },
    ]);
    expect(formatted).toEqual({ line: null, count: 0 });
  });

  it("23. 다수의 CC-BY 에셋이 있을 때 최대 글자 수 예산 안에서 +N 요약 표기를 생성하고 extend-canvas 모드를 지원한다", () => {
    const canvas = makeSolidRgba(260, 140, { r: 40, g: 44, b: 52, a: 255 });
    const res = stampCreatorSignatureAndRightsFooter({
      width: 260,
      height: 140,
      sourceRgba: canvas,
      creatorHandle: "@toon_maker",
      footerPlacement: "extend-canvas",
      maxAttributionChars: 58,
      rightsBomAssets: [
        { assetId: "c1", title: " Baroque Tea Cup ", creatorName: "PropLab", licenseId: "CC-BY-4.0" },
        { assetId: "c2", title: "Gothic Window", creatorName: "MeshWorks", licenseId: "CC-BY-SA-4.0" },
        { assetId: "c3", title: "Rain Ambience", creatorName: "FoleyBox", licenseId: "CC-BY-3.0" },
      ],
    });

    expect(res.footerAttached).toBe(true);
    expect(res.attributionAssetCount).toBe(3);
    expect(res.attributionLine).toContain("+2");
    expect(res.outputHeight).toBeGreaterThan(140);
    expect(res.footerRect?.y).toBe(140);
  });

  it("24. 잘못된 해상도나 부족한 RGBA 버퍼 입력에 대해 명확한 RangeError를 던진다", () => {
    expect(() => planSnsShowcaseExport({ preset: "x-single-16x9", sourceWidthPx: 0, sourceHeightPx: 900, share: { title: "err", workUrl: "/" } })).toThrow(RangeError);
    expect(() =>
      composeBeforeAfterSplitCard({
        width: 10,
        height: 10,
        beforeRgba: new Uint8ClampedArray(20),
        afterRgba: new Uint8ClampedArray(400),
        beforeStage: "sketch",
        afterStage: "final-color",
        splitMode: "vertical",
      }),
    ).toThrow(RangeError);
    expect(() => selectMilestoneTimelapseFrames({ snapshots: [] })).toThrow(RangeError);
    expect(() => applySpoilerSafeRegionBlur({ width: 20, height: 20, sourceRgba: new Uint8ClampedArray(100), spoilerRegions: [] })).toThrow(RangeError);
  });
});
