// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioSerialStudioSuitePanel } from "../StudioSerialStudioSuitePanel";
import {
  buildSerialStudioCrossAdaptationBanner,
  calculateSerialStudioCreatorSettlement,
  computeSerialStudioCoinChargeOrder,
  computeSerialStudioWeeklyCoinConsumptionMetrics,
  evaluateSerialStudioAttendanceCycle,
  evaluateSerialStudioShareRewardProgress,
  formatSerialStudioWaitFreeRemaining,
  SERIAL_STUDIO_ADMIN_MODULES,
  SERIAL_STUDIO_CREDIT_PURCHASE_PLANS,
  SERIAL_STUDIO_NOVEL_FONT_SIZES,
  SERIAL_STUDIO_NOVEL_VIEWER_THEMES,
  SERIAL_STUDIO_SETTLEMENT_BANKS,
  SERIAL_STUDIO_SHARE_EVENT_MAX_COINS,
  SERIAL_STUDIO_SUBSCRIPTION_TIERS,
  SERIAL_STUDIO_WEB_COIN_PLANS,
  resolveSerialStudioEpisodeAccess,
  shouldTriggerSerialStudioAutoLike,
  translateSerialStudioEpisodeTextBoxes,
  validateSerialStudioSettlementRegistration,
} from "../serial-platform-economy";
import {
  clampSerialStudioSpacerPanelHeight,
  computeSerialStudioCoverOrBannerCrop,
  computeSerialStudioSpacerGradientCoordinates,
  generateSerialStudioAiNovelEpisode,
  generateSerialStudioCharacterSheetCandidates,
  generateSerialStudioSceneImages,
  generateSerialStudioStyleCandidates,
  SERIAL_STUDIO_GENRES,
  SERIAL_STUDIO_OPENAI_SIZES,
  SERIAL_STUDIO_SERIAL_POLICIES,
  SERIAL_STUDIO_CREDIT_COSTS,
  SERIAL_STUDIO_STYLE_QUICK_PRESETS,
  SERIAL_STUDIO_WEEKDAYS,
  isSerialStudioEpisodeAutomaticallyFree,
  runSerialStudioSceneInpaint,
  validateAndBuildSerialStudioWorkPayload,
  validateSerialStudioAuthorName,
  validateSerialStudioNovelUploadFile,
  validateSerialStudioUploadedWebtoonImage,
} from "../serial-studio-suite";

describe("Ggumtoon AI Creation Studio Engine (ggumtoon-studio-suite)", () => {
  it("validates author handle and work registration draft with 3:1 banner and 5:7 cover crop math", () => {
    expect(validateSerialStudioAuthorName("연재작가01", ["기존작가"]).valid).toBe(true);
    expect(validateSerialStudioAuthorName("A").valid).toBe(false);
    expect(validateSerialStudioAuthorName("기존작가", ["기존작가"]).status).toBe("taken");

    expect(SERIAL_STUDIO_GENRES).toHaveLength(10);
    expect(SERIAL_STUDIO_WEEKDAYS).toHaveLength(7);
    expect(SERIAL_STUDIO_SERIAL_POLICIES.map((p) => p.creatorSharePercent)).toEqual([40, 60, 80]);

    const bannerCrop = computeSerialStudioCoverOrBannerCrop({
      role: "banner",
      mediaWidth: 1200,
      mediaHeight: 800,
      panX: 0,
      panY: 0,
      zoom: 1,
    });
    expect(bannerCrop.width).toBe(1200);
    expect(bannerCrop.height).toBe(400);
    expect(bannerCrop.aspectRatio).toBe("3:1");

    const coverCrop = computeSerialStudioCoverOrBannerCrop({
      role: "cover",
      mediaWidth: 1000,
      mediaHeight: 1400,
      panX: 0,
      panY: 0,
      zoom: 1,
    });
    expect(coverCrop.aspectRatio).toBe("5:7");

    const draftCheck = validateAndBuildSerialStudioWorkPayload({
      type: "webtoon",
      title: "회귀한 황녀의 별빛 검술",
      genres: ["로맨스", "판타지"],
      serialType: "twice_weekly",
      serialDays: ["수", "토"],
      viewMode: "scroll",
      description: "운명을 바꾸는 회귀 로맨스 판타지 대서사시",
      agreeAdPromotion: true,
      agreeOperationPolicy: true,
    });
    expect(draftCheck.valid).toBe(true);
    expect(draftCheck.payload?.serial_day).toBe("수,토");
  });

  it("generates 3 style candidates (3 credits / 1 credit regen) and auto-detects character definitions", () => {
    expect(SERIAL_STUDIO_STYLE_QUICK_PRESETS).toHaveLength(5);
    expect(SERIAL_STUDIO_CREDIT_COSTS.style_generate_initial).toBe(3);
    expect(SERIAL_STUDIO_CREDIT_COSTS.style_regenerate).toBe(1);

    const styleRes = generateSerialStudioStyleCandidates({
      workId: "work-1",
      genre: "로맨스",
      prompt: "화려한 황궁 회랑의 황녀와 북부 대공 청년",
      currentCredits: 20,
    });
    expect(styleRes.ok).toBe(true);
    if (styleRes.ok) {
      expect(styleRes.creditsUsed).toBe(3);
      expect(styleRes.images).toHaveLength(3);
      expect(styleRes.detectedCharacters).toHaveLength(2);
    }

    const regenRes = generateSerialStudioStyleCandidates({
      workId: "work-1",
      genre: "로맨스",
      prompt: "화려한 황궁 회랑의 황녀",
      currentCredits: 17,
      isRegeneration: true,
    });
    expect(regenRes.ok).toBe(true);
    if (regenRes.ok) {
      expect(regenRes.creditsUsed).toBe(1);
    }
  });

  it("generates 3 character sheet candidates, scenes (normal 3 / highlight 5 credits), and inpaint 3 candidates (3 credits)", () => {
    const charRes = generateSerialStudioCharacterSheetCandidates({
      workId: "work-1",
      name: "강하준",
      appearancePrompt: "은발에 검푸른 제복을 입은 북부 대공",
      currentCredits: 20,
    });
    expect(charRes.ok).toBe(true);
    if (charRes.ok) {
      expect(charRes.creditsUsed).toBe(9);
      expect(charRes.imageUrls).toHaveLength(3);
    }

    expect(SERIAL_STUDIO_OPENAI_SIZES.map((s) => s.id)).toEqual([
      "1024x1536",
      "1024x1024",
      "1536x1024",
    ]);

    const normalScene = generateSerialStudioSceneImages({
      scene: {
        id: "scene-1",
        prompt: "달빛 아래 검을 뽑아드는 강하준",
        mode: "normal",
        size: "1024x1536",
        textMode: "no_text",
        selectedCharacterIds: ["char-1"],
        autoReferenceEnabled: true,
        customReferenceImageB64: null,
        candidateImages: null,
        selectedImageIndex: null,
        savedSceneId: null,
        confirmedImageUrl: null,
        savedBubbles: [],
        textPanel: null,
      },
      workTitle: "별빛 검술",
      workGenre: "판타지",
      isCuttoon: false,
      lastConfirmedImageUrl: "https://cdn.toonstudio.local/prev.webp",
      currentCredits: 20,
    });
    expect(normalScene.ok).toBe(true);
    if (normalScene.ok) {
      expect(normalScene.creditsUsed).toBe(3);
      expect(normalScene.images).toHaveLength(3);
      expect(normalScene.effectiveReferenceSource).toBe("previous_scene_url");
    }

    const highlightCuttoon = generateSerialStudioSceneImages({
      scene: {
        id: "scene-2",
        prompt: "붉은 마법진이 폭발하는 클라이맥스 결투",
        mode: "highlight",
        size: "1024x1536",
        textMode: "with_text",
        selectedCharacterIds: ["char-1"],
        autoReferenceEnabled: false,
        customReferenceImageB64: null,
        candidateImages: null,
        selectedImageIndex: null,
        savedSceneId: null,
        confirmedImageUrl: null,
        savedBubbles: [],
        textPanel: null,
      },
      workTitle: "별빛 검술",
      workGenre: "판타지",
      isCuttoon: true,
      lastConfirmedImageUrl: null,
      currentCredits: 20,
    });
    expect(highlightCuttoon.ok).toBe(true);
    if (highlightCuttoon.ok) {
      expect(highlightCuttoon.creditsUsed).toBe(5);
      expect(highlightCuttoon.effectiveSize).toBe("1024x1024");
      expect(highlightCuttoon.images).toHaveLength(1);
    }

    const inpaint = runSerialStudioSceneInpaint({
      sceneId: "scene-1",
      baseImageUrl: "https://cdn.toonstudio.local/prev.webp",
      editPrompt: "검 끝에 푸른 오러 광채 추가",
      size: "1024x1536",
      currentCredits: 10,
    });
    expect(inpaint.ok).toBe(true);
    if (inpaint.ok) {
      expect(inpaint.creditsUsed).toBe(3);
      expect(inpaint.inpaintedImages).toHaveLength(3);
    }
  });

  it("clamps spacer textPanel height (80~2000px), computes gradient trigonometry, and enforces episode/upload rules", () => {
    expect(clampSerialStudioSpacerPanelHeight(20)).toBe(80);
    expect(clampSerialStudioSpacerPanelHeight(2450)).toBe(2000);
    expect(clampSerialStudioSpacerPanelHeight(437)).toBe(437);

    const endpoints = computeSerialStudioSpacerGradientCoordinates(600, 400, {
      angle: 180,
      colorStart: "#000000",
      colorStop: "#ffffff",
    });
    expect(endpoints.x0).toBeCloseTo(300, 1);
    expect(endpoints.y1).toBeGreaterThan(endpoints.y0);

    expect(isSerialStudioEpisodeAutomaticallyFree(1, "webtoon")).toBe(true);
    expect(isSerialStudioEpisodeAutomaticallyFree(3, "webtoon")).toBe(true);
    expect(isSerialStudioEpisodeAutomaticallyFree(4, "webtoon")).toBe(false);
    expect(isSerialStudioEpisodeAutomaticallyFree(1, "novel")).toBe(true);
    expect(isSerialStudioEpisodeAutomaticallyFree(2, "novel")).toBe(false);

    expect(
      validateSerialStudioUploadedWebtoonImage({
        fileName: "cut-01.png",
        naturalWidth: 800,
        naturalHeight: 900,
      }).valid,
    ).toBe(false);

    expect(
      validateSerialStudioUploadedWebtoonImage({
        fileName: "cut-01.png",
        naturalWidth: 800,
        naturalHeight: 1536,
      }).valid,
    ).toBe(true);

    const docxValid = validateSerialStudioNovelUploadFile({
      fileName: "ep1.docx",
      byteSize: 1024 * 500,
      extractedText: "가".repeat(6000),
    });
    expect(docxValid.valid).toBe(true);
    if (docxValid.valid) {
      expect(docxValid.isWithinRecommendedLength).toBe(true);
    }

    const pdfInvalid = validateSerialStudioNovelUploadFile({
      fileName: "ep1.pdf",
      byteSize: 1024,
      extractedText: "본문",
    });
    expect(pdfInvalid.valid).toBe(false);

    const novelGen = generateSerialStudioAiNovelEpisode({
      workTitle: "회귀 황녀의 첫 무도회",
      genre: "로맨스",
      plotSummary: "황태자와의 첫 대면과 숨겨진 성검의 각성",
      currentCredits: 10,
    });
    expect(novelGen.ok).toBe(true);
    if (novelGen.ok) {
      expect(novelGen.creditsUsed).toBe(3);
      expect(novelGen.generatedText).toContain("회귀 황녀의 첫 무도회");
    }
  });
});

describe("Ggumtoon Platform Economy, Viewer & Settlement Engine (ggumtoon-platform-economy)", () => {
  it("calculates Web Coin first-charge 10% bonus, credit plans, and subscription plans", () => {
    expect(SERIAL_STUDIO_WEB_COIN_PLANS).toHaveLength(4);
    expect(SERIAL_STUDIO_CREDIT_PURCHASE_PLANS).toHaveLength(4);
    expect(SERIAL_STUDIO_SUBSCRIPTION_TIERS).toHaveLength(3);

    const firstCharge = computeSerialStudioCoinChargeOrder({
      plan: SERIAL_STUDIO_WEB_COIN_PLANS[0]!,
      hasNeverCharged: true,
      payMethod: "KAKAOPAY",
    });
    expect(firstCharge.baseCoins).toBe(10);
    expect(firstCharge.bonusCoins).toBe(1);
    expect(firstCharge.totalCoinsGranted).toBe(11);

    const repeatCharge = computeSerialStudioCoinChargeOrder({
      plan: SERIAL_STUDIO_WEB_COIN_PLANS[0]!,
      hasNeverCharged: false,
      payMethod: "CARD",
    });
    expect(repeatCharge.bonusCoins).toBe(0);
    expect(repeatCharge.totalCoinsGranted).toBe(10);
  });

  it("handles 10-day attendance check (days 3, 6, 9, 10 -> 4 free coins) and Kakao share 15-coin cap", () => {
    const day3 = evaluateSerialStudioAttendanceCycle(3);
    expect(day3.coinsEarnedToday).toBe(1);
    expect(day3.totalCoinsFromCycle).toBe(1);

    const day10 = evaluateSerialStudioAttendanceCycle(10);
    expect(day10.coinsEarnedToday).toBe(1);
    expect(day10.totalCoinsFromCycle).toBe(4);

    const shareProgress = evaluateSerialStudioShareRewardProgress(20, "work-1", "ep-4");
    expect(shareProgress.rewardedCoins).toBe(SERIAL_STUDIO_SHARE_EVENT_MAX_COINS);
    expect(shareProgress.isMaxReached).toBe(true);
  });

  it("evaluates Wait-Free countdown, episode access priority, Auto-Like at 3 paid episodes, and viewer/translation helpers", () => {
    const nowMs = Date.now();
    const waitCountdown = formatSerialStudioWaitFreeRemaining(
      new Date(nowMs + 125 * 60000).toISOString(),
      nowMs,
      "ko",
    );
    expect(waitCountdown.claimable).toBe(false);
    expect(waitCountdown.label).toContain("2시간 5분 후 다음 화 무료");

    const epFree = resolveSerialStudioEpisodeAccess({
      episodeIndexZeroBased: 1,
      isEpisodeFreeFlag: true,
      isChallengeWork: false,
      isAuthorOwner: false,
      isAlreadyRead: false,
      userCoinBalance: 0,
      waitFreeApplicable: false,
      waitFreeClaimable: false,
    });
    expect(epFree.access).toBe("free_first_three");

    const epWaitFree = resolveSerialStudioEpisodeAccess({
      episodeIndexZeroBased: 4,
      isEpisodeFreeFlag: false,
      isChallengeWork: false,
      isAuthorOwner: false,
      isAlreadyRead: false,
      userCoinBalance: 5,
      waitFreeApplicable: true,
      waitFreeClaimable: true,
    });
    expect(epWaitFree.access).toBe("wait_free_claimable");

    const autoLike2 = shouldTriggerSerialStudioAutoLike({
      alreadyLiked: false,
      alreadyAutoLikedInSession: false,
      paidReadEpisodeIds: ["ep-4"],
      currentEpisodeId: "ep-5",
    });
    expect(autoLike2.triggerAutoLike).toBe(false);

    const autoLike3 = shouldTriggerSerialStudioAutoLike({
      alreadyLiked: false,
      alreadyAutoLikedInSession: false,
      paidReadEpisodeIds: ["ep-4", "ep-5"],
      currentEpisodeId: "ep-6",
    });
    expect(autoLike3.triggerAutoLike).toBe(true);

    expect(SERIAL_STUDIO_NOVEL_VIEWER_THEMES).toHaveLength(3);
    expect(SERIAL_STUDIO_NOVEL_FONT_SIZES).toEqual({ sm: 14, md: 17, lg: 20 });

    const translated = translateSerialStudioEpisodeTextBoxes([
      { id: "tb-1", y: 20, align: "center", fontSize: 17, text: "여기서 물러설 수 없다!" },
    ]);
    expect(translated[0]?.text_en).toContain("[EN]");

    const banner = buildSerialStudioCrossAdaptationBanner({
      currentWorkType: "novel",
      relatedWorkId: "w-1",
      relatedTitle: "별빛 검술",
    });
    expect(banner.badgeText).toContain("웹툰으로도 만나보세요");
  });

  it("calculates creator settlement with 40/60/80% share, 3.3% withholding tax, and paid-coin-only rule", () => {
    expect(SERIAL_STUDIO_SETTLEMENT_BANKS).toHaveLength(14);
    expect(SERIAL_STUDIO_ADMIN_MODULES).toHaveLength(16);

    const stmt = calculateSerialStudioCreatorSettlement({
      paidCoinsRead: 1000,
      freeMarketingCoinsRead: 350,
      serialType: "regular",
      isBusiness: false,
      appChannelRatio: 0,
      coinUnitPriceKrw: 100,
    });
    expect(stmt.grossPaidRevenueKrw).toBe(100000);
    expect(stmt.excludedFreeMarketingCoins).toBe(350);
    expect(stmt.creatorGrossShareKrw).toBe(60000);
    expect(stmt.withholdingTaxKrw).toBe(1980);
    expect(stmt.finalPayoutKrw).toBe(58020);

    const validApp = validateSerialStudioSettlementRegistration({
      realName: "홍길동",
      bankName: "카카오뱅크",
      accountNumber: "3333-01-2345678",
      accountHolder: "홍길동",
      isBusiness: false,
      agreedPrivacyCollection: true,
    });
    expect(validApp.valid).toBe(true);

    const metrics = computeSerialStudioWeeklyCoinConsumptionMetrics({
      weeklyUsedPaidCoins: 1200,
      weeklyUsedFreeCoins: 300,
      weeklyChargedPaidCoins: 2000,
    });
    expect(metrics.totalUsedCoins).toBe(1500);
    expect(metrics.consumptionRatePercent).toBe(75);
  });
});

describe("StudioSerialStudioSuitePanel UI Integration", () => {
  it("renders all 4 Ggumtoon tabs and executes interactive workflows", () => {
    const onApplyScript = vi.fn();
    render(
      <StudioSerialStudioSuitePanel
        scriptInput="주인공 강하준: 검은 코트의 검사"
        onApplyScript={onApplyScript}
      />,
    );

    expect(screen.getByTestId("studio-ggumtoon-suite-panel")).toBeDefined();

    // Tab 1: Style & Character
    fireEvent.click(screen.getByTestId("ggumtoon-generate-style-btn"));
    expect(screen.getByTestId("ggumtoon-detected-characters-summary")).toBeDefined();

    fireEvent.click(screen.getByTestId("ggumtoon-create-charsheet-btn"));
    expect(screen.getByTestId("ggumtoon-charsheet-results")).toBeDefined();

    // Tab 2: Scene & Inpaint & Spacer Cut
    fireEvent.click(screen.getByTestId("ggumtoon-tab-SCENE_INPAINT"));
    fireEvent.click(screen.getByTestId("ggumtoon-scene-mode-highlight"));
    fireEvent.click(screen.getByTestId("ggumtoon-generate-scene-btn"));
    expect(screen.getByTestId("ggumtoon-scene-generated-summary")).toBeDefined();

    fireEvent.click(screen.getByTestId("ggumtoon-run-inpaint-btn"));
    expect(screen.getByTestId("ggumtoon-inpaint-results-summary")).toBeDefined();
    expect(screen.getByTestId("ggumtoon-spacer-clamped-height")).toBeDefined();

    // Tab 3: Novel & Episode Upload
    fireEvent.click(screen.getByTestId("ggumtoon-tab-NOVEL_UPLOAD"));
    fireEvent.click(screen.getByTestId("ggumtoon-generate-novel-btn"));
    expect(onApplyScript).toHaveBeenCalled();

    // Tab 4: Platform Economy & Settlement
    fireEvent.click(screen.getByTestId("ggumtoon-tab-PLATFORM_ECONOMY"));
    expect(screen.getByTestId("ggumtoon-platform-subpanel")).toBeDefined();
    fireEvent.click(screen.getByTestId("ggumtoon-attendance-check-btn"));
    fireEvent.click(screen.getByTestId("ggumtoon-share-click-btn"));
    expect(screen.getByTestId("ggumtoon-settlement-result")).toBeDefined();
  });
});
