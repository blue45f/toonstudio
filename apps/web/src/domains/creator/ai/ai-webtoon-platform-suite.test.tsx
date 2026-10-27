// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLlamaGenComicV2EpisodeSequence,
  calculateGenToonAutoCutDurationSec,
  createMangotoonContentPayload,
  estimateGenToonCreditCost,
  evaluateGenToonMerchPrintLayout,
  GENTOON_AI_MODEL_CATALOG,
  GENTOON_STICKER_SHEET_6_SLOTS,
  GENTOON_TIER_CREDITS,
  MANGOTOON_CHARACTER_PRESETS,
  MANGOTOON_LIBRARY_TABS,
  recommendTooningCutFromSentence,
  synthesizeGenToonShortFormReelTimeline,
} from "./ai-webtoon-platform-suite";
import { StudioAiWebtoonEcosystemWorkbenchPanel } from "./StudioAiWebtoonEcosystemWorkbenchPanel";
import { StudioAiWebtoonPlatformSuitePanel } from "./StudioAiWebtoonPlatformSuitePanel";

afterEach(() => {
  cleanup();
});

describe("ai-webtoon-platform-suite (GenToon · Mangotoon · LlamaGen · Tooning)", () => {
  it("GenToon 9종 AI 모델 카탈로그와 구독 티어 크레딧을 정확히 보유한다", () => {
    expect(GENTOON_AI_MODEL_CATALOG).toHaveLength(9);
    const geminiFlash = GENTOON_AI_MODEL_CATALOG.find(
      (m) => m.id === "gemini-3.1-flash-image-preview",
    );
    expect(geminiFlash?.credits).toBe(13);
    expect(geminiFlash?.costUsd).toBe(0.045);

    const gptWebtoon = GENTOON_AI_MODEL_CATALOG.find((m) => m.id === "gpt-image-2-medium");
    expect(gptWebtoon?.credits).toBe(25);
    expect(gptWebtoon?.badge).toContain("웹툰");

    expect(GENTOON_TIER_CREDITS.FREE).toBe(150);
    expect(GENTOON_TIER_CREDITS.PRO).toBe(5000);
    expect(GENTOON_TIER_CREDITS.PREMIUM).toBe(27000);
  });

  it("GenToon 모드별 컷 생성·스토리·캐릭터·릴스 내보내기 크레딧을 정확히 산출한다", () => {
    const standardCost = estimateGenToonCreditCost({
      mode: "instatoon",
      cutCount: 4,
      includeStoryScript: true,
      newCharacterCount: 1,
      includeReelExport: true,
    });
    expect(standardCost.perCutCredits).toBe(13);
    expect(standardCost.cutGenerationCredits).toBe(52);
    expect(standardCost.storyScriptCredits).toBe(1);
    expect(standardCost.characterCreationCredits).toBe(100);
    expect(standardCost.reelExportCredits).toBe(20);
    expect(standardCost.totalCredits).toBe(173);

    const proCost = estimateGenToonCreditCost({
      mode: "manga",
      cutCount: 8,
      hasFreeDailyQuota: true, // 프로 모드는 무료 일일 쿼터와 무관하게 25cr
      includeReelExport: true,
    });
    expect(proCost.perCutCredits).toBe(25);
    expect(proCost.cutGenerationCredits).toBe(200);
    expect(proCost.reelExportCredits).toBe(40);
  });

  it("GenToon 1080x1920 30fps 숏폼 릴스 타임라인 합성기가 대사 길이 비례 시간 및 39.5초 상한 스케일링을 수행한다", () => {
    const d1 = calculateGenToonAutoCutDurationSec("짧은 대사", 1);
    const d2 = calculateGenToonAutoCutDurationSec(
      "이것은 상당히 긴 인스타툰 대사로 재생 시간이 더 길게 할당됩니다.",
      2,
    );
    expect(d1).toBeGreaterThanOrEqual(1.6);
    expect(d2).toBeGreaterThan(d1);

    // 39.5초 초과 시 비례 축소 검증
    const manyCuts = Array.from({ length: 8 }, (_, idx) => ({
      cutIndex: idx + 1,
      dialogueText: "매우 긴 대사 텍스트 ".repeat(10),
      durationOverrideSec: 8.0,
    }));
    const reel = synthesizeGenToonShortFormReelTimeline({
      cuts: manyCuts,
      filterId: "sepia",
      transitionId: "slide",
      overlays: [{ text: "오버레이 제목", x: 0.5, y: 0.2, scale: 1.2, color: "#ff0055" }],
    });
    expect(reel.widthPx).toBe(1080);
    expect(reel.heightPx).toBe(1920);
    expect(reel.fps).toBe(30);
    expect(reel.totalDurationSec).toBeLessThanOrEqual(40.0);
    expect(reel.proportionalScaleFactor).toBeLessThan(1.0);
    expect(reel.cuts[0]?.kenBurnsZoom).toBe(1.06);
    expect(reel.cuts[1]?.kenBurnsZoom).toBe(1.0);
    expect(reel.cuts[2]?.kenBurnsZoom).toBe(1.04);
    expect(reel.filter.cssFilter).toContain("sepia");
  });

  it("GenToon 6분할 스티커 시트 및 머그컵 굿즈 프린트 DPI 선명도를 정확히 판정한다", () => {
    expect(GENTOON_STICKER_SHEET_6_SLOTS).toHaveLength(6);

    const sharpSheet = evaluateGenToonMerchPrintLayout({
      layoutMode: "sheet",
      sourceImageWidthPx: 2400,
      printWidthInches: 6,
      targetDpi: 300,
      placementScale: 0.85,
      bgRemoved: true,
    });
    expect(sharpSheet.slots).toHaveLength(6);
    expect(sharpSheet.sharpnessGrade).toBe("sharp");
    expect(sharpSheet.bgRemoved).toBe(true);

    const softMug = evaluateGenToonMerchPrintLayout({
      layoutMode: "mug_twin",
      sourceImageWidthPx: 400,
      printWidthInches: 8,
      targetDpi: 300,
    });
    expect(softMug.slots).toHaveLength(2);
    expect(softMug.sharpnessGrade).toBe("soft");
  });

  it("Mangotoon 7개 라이브러리 탭과 createContentData 스키마를 정확히 생성한다", () => {
    expect(MANGOTOON_LIBRARY_TABS).toHaveLength(7);
    expect(MANGOTOON_CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(3);

    const titleData = createMangotoonContentPayload({
      id: "t-1",
      contentCategory: "title",
      src: "https://toon.mangoboard.net/title-01.svg",
      orgWidth: 800,
      orgHeight: 400,
    });
    expect(titleData.type).toBe("group");
    expect(titleData.src.endsWith(".txt")).toBe(true);
    expect(titleData.width).toBe(400);
    expect(titleData.height).toBe(200);

    const propData = createMangotoonContentPayload({
      id: "p-1",
      contentCategory: "props",
      src: "https://toon.mangoboard.net/prop-coffee.svg",
      orgWidth: 300,
      orgHeight: 600,
      interactWithCharacter: true,
    });
    expect(propData.type).toBe("svg");
    expect(propData.interactWithCharacter).toBe(true);
    expect(propData.height).toBe(400);

    const bgData = createMangotoonContentPayload({
      id: "bg-1",
      contentCategory: "background",
      src: "https://toon.mangoboard.net/bg-school.png",
      orgWidth: 1200,
      orgHeight: 800,
      blurEdgeRange: 65,
    });
    expect(bgData.type).toBe("picture");
    expect(bgData.blurEdge?.directions).toHaveLength(9);
    expect(bgData.blurEdge?.range).toBe(65);
  });

  it("LlamaGen AI 황금비(1.618) 세로 스크롤 웹툰 스트립과 ComicV2 연속성 시퀀스를 생성한다", () => {
    const seq = buildLlamaGenComicV2EpisodeSequence({
      artworkId: "art-101",
      seriesTitle: "황금비 연대기",
      episodeTitle: "1화",
      scriptLines: ["첫 번째 컷 지문", "두 번째 컷 지문", "세 번째 컷 지문"],
      canvasWidthPx: 800,
    });
    expect(seq.goldenRatioConstant).toBe(1.618);
    expect(seq.panels).toHaveLength(3);
    expect(seq.checkpoint.completedPanels).toBe(3);
    expect(seq.panels[0]?.geometry.paths[0]?.lineStyle).toBe("begin");
    expect(seq.panels[0]?.geometry.paths[1]?.lineStyle).toBe("solid");
    expect(seq.panels[1]!.geometry.topLeft.y).toBeGreaterThan(
      seq.panels[0]!.geometry.topLeft.y,
    );
  });

  it("Tooning 문장 기반 캐릭터 표정·포즈·배경·말풍선을 문맥에 맞게 추천한다", () => {
    const rec = recommendTooningCutFromSentence(
      "학교 교실에서 보이스피싱 위험 문자를 절대 클릭하지 마세요!",
    );
    expect(rec.recommendedEmotion).toContain("놀람");
    expect(rec.recommendedBackground).toContain("교실");
    expect(rec.recommendedSpeechBubbleType).toBe("강조 외침");
    expect(rec.campaignPurpose).toBe("교육용 컷툰");
  });

  it("StudioAiWebtoonPlatformSuitePanel UI에서 4개 플랫폼 탭 전환 및 대본 반영이 정상 동작한다", () => {
    const onApplyScript = vi.fn();
    render(
      <StudioAiWebtoonPlatformSuitePanel
        scriptInput="1컷 테스트 대사\n2컷 테스트 대사"
        onApplyScript={onApplyScript}
      />,
    );

    expect(screen.getByTestId("gentoon-workbench-section")).toBeTruthy();
    expect(screen.getByTestId("gentoon-total-credits").textContent).toContain("크레딧");

    fireEvent.click(screen.getByTestId("ai-platform-tab-mangotoon"));
    expect(screen.getByTestId("mangotoon-workbench-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("ai-platform-tab-llamagen"));
    expect(screen.getByTestId("llamagen-workbench-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("ai-platform-tab-tooning"));
    expect(screen.getByTestId("tooning-workbench-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("apply-tooning-sentence-btn"));
    expect(onApplyScript).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("wave18-20-domain-consistency-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave18-run-sword"));
    expect(screen.getByTestId("wave18-summary-output").textContent).toBeTruthy();

    render(
      <StudioAiWebtoonEcosystemWorkbenchPanel
        scriptInput="1컷 대성당 결투 씬"
        onApplyScript={onApplyScript}
      />,
    );
    expect(screen.getByTestId("wave21-23-ecosystem-consistency-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave21-run-crater"));
    expect(screen.getByTestId("wave21-summary-output").textContent).toBeTruthy();
    expect(screen.getByTestId("wave39-41-ecosystem-domain-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave39-run-esports"));
    expect(screen.getByTestId("wave39-summary-output").textContent).toBeTruthy();

    fireEvent.click(screen.getByTestId("ecosystem-tab-cat-3-storyboard"));
    expect(screen.getByTestId("wave24-26-category34-consistency-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave24-tool-btn-tankobon"));

    fireEvent.click(screen.getByTestId("ecosystem-tab-cat-4-style-transfer"));
    expect(screen.getByTestId("wave27-29-category4-consistency-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave27-tool-btn-goreum"));
    expect(screen.getByTestId("wave30-32-category4-osmu-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave30-tool-btn-lunar"));
    expect(screen.getByTestId("wave33-35-category4-optics-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave33-tool-btn-gacha-rpg"));
    expect(screen.getByTestId("wave36-38-category4-mystery-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wave36-tool-btn-forensic-luminol"));
  });
});
