// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  advanceInteractiveMissionStep,
  approveReaderGoodsProposalByCreator,
  buildCrossMediaTransformPlan,
  buildGameAssetExportManifest,
  calculateBomRoyaltySplit,
  calculateReaderGoodsProposalSettlement,
  createInteractiveMissionProgress,
  createLiveMarketTryOnSession,
  createReaderGoodsProposal,
  CROSS_MEDIA_DIRECTION_CATALOG,
  DEFAULT_BOM_ROYALTY_CONTRIBUTORS,
  DEFAULT_IP_RIGHTS_BOM,
  evaluateBountyFundingProgress,
  MARKET_BOUNTY_PRESETS,
  pledgeToAssetBounty,
  READER_GOODS_PROPOSAL_PRESETS,
  resolveContextualGuideHint,
  searchInteractiveShortcutGuide,
  simulateShortcutOrGestureAction,
  STUDIO_INTERACTIVE_MISSIONS,
  StudioIpMarketAndInteractiveGuideHub,
  tickLiveMarketTryOnSession,
  unlockLiveMarketTryOnPurchase,
  updateTryOnCompareView,
  validatePodGoodsPrintSpec,
  voteReaderGoodsProposal,
  type CrossMediaTransformDirection,
  type GameEngineTarget,
} from "./index";

afterEach(() => {
  cleanup();
});

const REQUIRED_SPRITE_FILES = [
  "emblem-guide-map.webp",
  "emblem-market.webp",
  "emblem-community.webp",
  "tech-remotion.webp",
  "tool-bg3d.webp",
] as const;

describe("양방향 IP·게임 변환 엔진 (ip-game-transformer-engine)", () => {
  it("6방향 양방향 IP 변환 계획을 모두 생성하고 수작업 대비 절감 시간을 계산한다", () => {
    const directions: readonly CrossMediaTransformDirection[] = [
      "webtoon-to-novel",
      "novel-to-webtoon",
      "webtoon-to-drama-previz",
      "webtoon-to-remotion-anime",
      "webtoon-to-game-assets",
      "webtoon-to-visual-novel-playable",
    ];
    expect(CROSS_MEDIA_DIRECTION_CATALOG).toHaveLength(6);

    for (const direction of directions) {
      const plan = buildCrossMediaTransformPlan({
        projectTitle: "옥상 위의 시간표",
        direction,
        sourceEpisodeCount: 5,
        panelCountPerEpisode: 60,
        characterCount: 4,
      });
      expect(plan.direction).toBe(direction);
      expect(plan.stages).toHaveLength(3);
      expect(plan.panelCountTotal).toBe(300);
      expect(plan.estimatedMinutesSaved).toBeGreaterThan(0);
      expect(plan.deliverables.length).toBeGreaterThanOrEqual(3);
      if (direction === "webtoon-to-visual-novel-playable") {
        expect(plan.visualNovelGraph).not.toBeNull();
        expect(plan.visualNovelGraph?.standingExpressionSlots).toHaveLength(8);
        expect(plan.gameManifest).not.toBeNull();
      }
      if (direction === "webtoon-to-game-assets") {
        expect(plan.gameManifest).not.toBeNull();
      }
    }
  });

  it("4대 게임 엔진(Unity/Unreal/Godot/Phaser)별 LOD 3단계·4/8방향 아틀라스·Ink/Yarn/Unity 대사 JSON·Rights BOM을 검증한다", () => {
    const engines: readonly GameEngineTarget[] = ["unity", "unreal", "godot", "phaser"];
    for (const engine of engines) {
      const manifest = buildGameAssetExportManifest({
        assetId: `hero-${engine}`,
        assetName: "주인공 캐릭터",
        targetEngine: engine,
        baseTriangleCount: 20000,
        spriteDirections: engine === "phaser" ? 4 : 8,
        animationClipCount: 6,
        dialogueFormat:
          engine === "unity" ? "unity-localization" : engine === "unreal" ? "yarn" : "ink",
        rightsBom: DEFAULT_IP_RIGHTS_BOM,
      });
      expect(manifest.lodTiers).toHaveLength(3);
      expect(manifest.lodTiers[0].triangleCount).toBeGreaterThan(manifest.lodTiers[1].triangleCount);
      expect(manifest.lodTiers[1].triangleCount).toBeGreaterThan(manifest.lodTiers[2].triangleCount);
      expect(manifest.spriteAtlasSpec.directions).toBe(engine === "phaser" ? 4 : 8);
      expect(manifest.spriteAtlasSpec.directionOrder).toHaveLength(engine === "phaser" ? 4 : 8);
      expect(() => JSON.parse(manifest.dialogueBundle.samplePayloadJson)).not.toThrow();
      expect(manifest.rightsBomAudit.commercialSafe).toBe(true);
      expect(manifest.rightsBomAudit.attributionCredits.length).toBeGreaterThan(0);
    }

    const blocked = buildGameAssetExportManifest({
      assetId: "blocked-pack",
      assetName: "제한 에셋",
      targetEngine: "unity",
      rightsBom: [
        {
          id: "nc-1",
          assetTitle: "비상업 모델",
          category: "3d-model",
          licenseScope: "non-commercial",
          attributionRequired: true,
          redistributableInBinary: false,
          authorName: "외부 작가",
        },
      ],
    });
    expect(blocked.rightsBomAudit.commercialSafe).toBe(false);
    expect(blocked.rightsBomAudit.status).toBe("blocked");
    expect(blocked.rightsBomAudit.blockedEntries).toHaveLength(1);
  });
});

describe("마켓 30초 시착·BOM 공동 로열티·바운티·POD·독자 역제안 엔진 (market-tryon-bounty-engine)", () => {
  it("30초 무료 시착 타이머 만료·전/후 비교 전환·원클릭 구매 잠금 해제를 정확히 처리한다", () => {
    const started = createLiveMarketTryOnSession({
      sessionId: "tryon-test-1",
      assetId: "rooftop-3d",
      assetTitleKo: "노을 옥상 3D",
      priceKrw: 28000,
      durationSeconds: 30,
      startedAtMs: 1_000,
    });
    expect(started.status).toBe("active");
    expect(started.watermarkVisible).toBe(true);
    expect(started.remainingSeconds).toBe(30);

    const mid = tickLiveMarketTryOnSession(started, 12);
    expect(mid.remainingSeconds).toBe(18);
    expect(mid.status).toBe("active");

    const compared = updateTryOnCompareView(mid, "split", 0.72);
    expect(compared.splitRatio).toBe(0.72);

    const expired = tickLiveMarketTryOnSession(compared, 25);
    expect(expired.status).toBe("expired");
    expect(expired.remainingSeconds).toBe(0);
    expect(expired.compareMode).toBe("before");

    const unlocked = unlockLiveMarketTryOnPurchase(expired, "rcpt-999");
    expect(unlocked.status).toBe("unlocked-purchased");
    expect(unlocked.watermarkVisible).toBe(false);
    expect(unlocked.watermarkOpacity).toBe(0);
    expect(unlocked.unlockedRightsBomId).toContain("rcpt-999");
    expect(tickLiveMarketTryOnSession(unlocked, 60).status).toBe("unlocked-purchased");
  });

  it("권리 BOM 공동 로열티 분배가 균등 3분할 및 임의 가중치에서도 합계 100%(10,000 bps)와 원화 합계를 불변 보장한다", () => {
    const equalThree = calculateBomRoyaltySplit({
      grossSaleKrw: 100_000,
      platformFeePercent: 10,
      contributors: [
        { id: "a", displayName: "A", role: "original-3d", roleLabelKo: "3D", weight: 1 },
        { id: "b", displayName: "B", role: "shader-material", roleLabelKo: "셰이더", weight: 1 },
        { id: "c", displayName: "C", role: "font-typography", roleLabelKo: "폰트", weight: 1 },
      ],
    });
    expect(equalThree.invariantVerified).toBe(true);
    expect(equalThree.totalShareBasisPoints).toBe(10_000);
    expect(equalThree.totalSharePercent).toBe(100);
    expect(equalThree.totalAllocatedKrw).toBe(equalThree.netCreatorPoolKrw);

    const trickyAmount = calculateBomRoyaltySplit({
      grossSaleKrw: 333_333,
      platformFeePercent: 10,
      contributors: DEFAULT_BOM_ROYALTY_CONTRIBUTORS,
    });
    expect(trickyAmount.invariantVerified).toBe(true);
    expect(trickyAmount.totalShareBasisPoints).toBe(10_000);
    expect(trickyAmount.totalAllocatedKrw).toBe(trickyAmount.netCreatorPoolKrw);
  });

  it("에셋 바운티 후원 달성 및 POD 굿즈 CMYK/3mm 재단선 규격 검증을 통과·실패 모두 판정한다", () => {
    const firstBounty = MARKET_BOUNTY_PRESETS[0];
    expect(firstBounty).toBeDefined();
    if (!firstBounty) return;
    const funded = pledgeToAssetBounty(firstBounty, 250_000);
    const evalResult = evaluateBountyFundingProgress(funded);
    expect(evalResult.isFullyFunded).toBe(true);
    expect(evalResult.progressPercent).toBe(100);
    expect(funded.status).toBe("funded");

    const passPod = validatePodGoodsPrintSpec({
      productType: "acrylic-stand",
      trimWidthMm: 100,
      trimHeightMm: 148,
      bleedMm: 3,
      safeMarginMm: 3,
      dpi: 300,
      colorProfile: "CMYK-FOGRA39",
      totalInkCoveragePercent: 280,
      hasCutContourLayer: true,
      rightsBomCommercialClear: true,
    });
    expect(passPod.passed).toBe(true);
    expect(passPod.status).toBe("print-ready");
    expect(passPod.bleedBoxWidthMm).toBe(106);

    const failPod = validatePodGoodsPrintSpec({
      productType: "acrylic-stand",
      trimWidthMm: 100,
      trimHeightMm: 148,
      bleedMm: 1,
      safeMarginMm: 2,
      dpi: 150,
      colorProfile: "sRGB",
      totalInkCoveragePercent: 340,
      hasCutContourLayer: false,
      rightsBomCommercialClear: true,
    });
    expect(failPod.passed).toBe(false);
    expect(failPod.status).toBe("needs-fix");
    expect(failPod.nextFixesKo.length).toBeGreaterThanOrEqual(5);
  });

  it("독자 역제안 굿즈(ReaderGoodsProposal) 팬 투표 목표 달성 → 작가 1클릭 승인 → 로열티 100% 정산을 검증한다", () => {
    const created = createReaderGoodsProposal({
      id: "rgp-custom-keyring",
      proposerHandle: "@webtoon_collector",
      episodeNumber: 18,
      cutReference: "EP.18 #44 빗속 질주 명장면 컷",
      productKind: "keyring",
      titleKo: "빗속 질주 투명 아크릴 키링",
      mockupNoteKo: "투명 아크릴 양면 인쇄 + 3mm 칼선 여백",
      voteGoal: 50,
      unitPriceKrw: 14_000,
      estimatedOrderQty: 300,
      proposerRoyaltyPercent: 4,
    });
    expect(created.status).toBe("voting");

    const earlyAttempt = approveReaderGoodsProposalByCreator(created, "2026-11-23T12:25:00Z");
    expect(earlyAttempt.approved).toBe(false);

    const reached = voteReaderGoodsProposal(created, 49);
    expect(reached.voteCount).toBe(50);
    expect(reached.status).toBe("goal-reached");

    const approved = approveReaderGoodsProposalByCreator(reached, "2026-11-23T12:26:00Z");
    expect(approved.approved).toBe(true);
    expect(approved.proposal.status).toBe("creator-approved");
    expect(approved.proposal.creatorApprovedAtIso).toBe("2026-11-23T12:26:00Z");

    const settlement = calculateReaderGoodsProposalSettlement(approved.proposal);
    expect(settlement.invariantVerified).toBe(true);
    expect(settlement.proposerRoyaltyKrw).toBeGreaterThan(0);
    expect(settlement.totalAllocatedNetKrw).toBe(settlement.netProfitKrw);
    expect(READER_GOODS_PROPOSAL_PRESETS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("30초 인터랙티브 미션·맥락 힌트·단축키 시뮬레이터 (interactive-guide-mission-engine)", () => {
  it("5대 30초 체험 미션(각 3단계)과 맥락 인식 단일 힌트(딱 1개) 반환 계약을 검증한다", () => {
    expect(STUDIO_INTERACTIVE_MISSIONS).toHaveLength(5);
    for (const mission of STUDIO_INTERACTIVE_MISSIONS) {
      expect(mission.steps).toHaveLength(3);
      expect(mission.totalDurationSeconds).toBe(30);
    }

    let progress = createInteractiveMissionProgress("beginner-first-cut");
    expect(progress.completionPercent).toBe(0);
    progress = advanceInteractiveMissionStep(progress);
    expect(progress.completionPercent).toBe(33);
    progress = advanceInteractiveMissionStep(progress);
    expect(progress.completionPercent).toBe(67);
    progress = advanceInteractiveMissionStep(progress);
    expect(progress.isComplete).toBe(true);
    expect(progress.completionPercent).toBe(100);

    const bg3dHint = resolveContextualGuideHint({ currentPage: "bg3d-stage" });
    expect(bg3dHint).not.toBeNull();
    expect(bg3dHint?.missionId).toBe("bg3d-stage-placement");
    expect(bg3dHint?.stepOrder).toBe(1);

    const bg3dSteps =
      STUDIO_INTERACTIVE_MISSIONS.find((m) => m.id === "bg3d-stage-placement")?.steps.map((s) => s.id) ?? [];
    expect(
      resolveContextualGuideHint({
        currentPage: "bg3d-stage",
        completedStepIds: bg3dSteps,
      }),
    ).toBeNull();
  });

  it("단축키·제스처 실시간 검색과 즉시 시연 피드백을 반환한다", () => {
    const touchUndo = searchInteractiveShortcutGuide("2지", "touch-ipad");
    expect(touchUndo.length).toBeGreaterThanOrEqual(1);
    expect(touchUndo[0]?.id).toBe("sc-undo-2finger");

    const watchHits = searchInteractiveShortcutGuide("워치", "wearable-tv");
    expect(watchHits.some((item) => item.id === "sc-watch-crown-brush")).toBe(true);

    const feedback = simulateShortcutOrGestureAction("sc-undo-2finger", "touch");
    expect(feedback?.executedBindingLabel).toContain("두 손가락");
  });
});

describe("StudioIpMarketAndInteractiveGuideHub UI 및 스프라이트·정적 위생 계약", () => {
  it("필수 생성 스프라이트 5종이 실제 디스크에 유효한 WebP 파일로 존재한다", () => {
    const baseDir = resolve(process.cwd(), "apps/web/public/assets/studio/vibrant-sprites");
    for (const fileName of REQUIRED_SPRITE_FILES) {
      const bytes = readFileSync(resolve(baseDir, fileName));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("3개 컬러 탭 전환·30초 시착 잠금 해제·독자 역제안 승인·30초 미션 완주·단축키 시연 UI가 정상 동작한다", () => {
    const onStatusNotice = vi.fn();
    render(<StudioIpMarketAndInteractiveGuideHub onStatusNotice={onStatusNotice} />);

    const hub = screen.getByTestId("studio-ip-market-guide-hub");
    expect(hub.getAttribute("data-active-tab")).toBe("ip-game");

    // 5종 필수 스프라이트 DOM 존재 확인
    const imgs = Array.from(hub.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
    for (const sprite of REQUIRED_SPRITE_FILES) {
      expect(imgs.some((src) => src.endsWith(sprite))).toBe(true);
    }

    // 탭 1: 비주얼 노벨 전환 확인
    fireEvent.click(screen.getByRole("button", { name: /웹툰 → 비주얼 노벨/u }));
    expect(screen.getByText(/비주얼 노벨 24씬/u)).toBeTruthy();

    // 탭 2: 마켓 시착·로열티 + 독자 역제안 굿즈 확인
    fireEvent.click(screen.getByRole("tab", { name: /마켓 시착·로열티/u }));
    expect(screen.getByTestId("market-tryon-bounty-panel")).toBeTruthy();
    expect(screen.getByTestId("tryon-watermark-badge")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "원클릭 구매 잠금 해제" }));
    expect(screen.getByTestId("tryon-unlocked-badge")).toBeTruthy();

    const rooftopProposal = screen.getByTestId("reader-proposal-rgp-rooftop-acrylic");
    fireEvent.click(within(rooftopProposal).getByRole("button", { name: "작가 1클릭 승인" }));
    expect(within(rooftopProposal).getByText("작가 1클릭 승인 완료 · 제작 예약")).toBeTruthy();

    // 탭 3: 30초 인터랙티브 가이드 + 단축키 시뮬레이터 확인
    fireEvent.click(screen.getByRole("tab", { name: /30초 인터랙티브 가이드/u }));
    expect(screen.getByTestId("interactive-guide-mission-panel")).toBeTruthy();
    expect(screen.getByTestId("contextual-single-coachmark")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 단계 바로 실행" }));
    expect(
      within(screen.getByTestId("interactive-guide-mission-panel")).getByText(/33% · 남은 약/u),
    ).toBeTruthy();

    const simButtons = screen.getAllByRole("button", { name: "지금 시연" });
    expect(simButtons.length).toBeGreaterThan(0);
    if (simButtons[0]) fireEvent.click(simButtons[0]);
    expect(screen.getByTestId("shortcut-simulation-banner")).toBeTruthy();
    expect(onStatusNotice).toHaveBeenCalled();
  });

  it("신규 폴더 내 TSX 원시 색상 및 브라우저 저장소 직접 호출이 0건이고 전 파일 600줄 이하를 지킨다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/ip-market-guide-hub");
    const tsxFiles = [
      "StudioIpMarketAndInteractiveGuideHub.tsx",
      "IpGameTransformTabPanel.tsx",
      "MarketTryOnBountyTabPanel.tsx",
      "ReaderGoodsProposalCard.tsx",
      "InteractiveGuideMissionTabPanel.tsx",
    ];
    const allFiles = [
      ...tsxFiles,
      "ip-game-transformer-catalog.ts",
      "ip-game-transformer-engine.ts",
      "market-tryon-bounty-catalog.ts",
      "market-tryon-bounty-engine.ts",
      "interactive-guide-mission-catalog.ts",
      "interactive-guide-mission-engine.ts",
      "ip-market-guide-hub.css",
      "index.ts",
    ];

    for (const file of tsxFiles) {
      const source = readFileSync(resolve(dir, file), "utf8");
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source).not.toMatch(/\brgba?\(/u);
    }

    for (const file of allFiles) {
      const source = readFileSync(resolve(dir, file), "utf8");
      const lines = source.split("\n").length;
      expect(lines).toBeLessThanOrEqual(600);
      expect(source).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    }
  });
});
