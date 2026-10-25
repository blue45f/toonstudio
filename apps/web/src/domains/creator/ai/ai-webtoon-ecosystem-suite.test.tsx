// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildComicAiCharacterSheetAndPanels,
  GENTOON_STYLE_FAMILIES,
  GENTOON_SUPPORTED_LANGUAGES,
  runDashtoonAgencyPublishPipeline,
  runGenToonStoryToComicPipeline,
  runTooningTextToCharacterActing,
} from "./all-in-one-webtoon-accelerator-suite";
import {
  runAidStudioPipeline,
  runClipStudioPaintAiAssist,
  runNaverWebtoonAiHintPainter,
} from "./pro-drawing-coloring-assist-suite";
import {
  buildMidjourneyStableDiffusionConceptPlan,
  buildPhotoshopFireflyGenerativePlan,
  REA_WEBTOON_ECOSYSTEM_12_TOOLS,
  runCanvaInstatoonCarouselPipeline,
  runFilmoraMediaToWebtoonPipeline,
  runLlamaGenWebtoonStoryboardDraft,
} from "./storyboard-style-transfer-suite";
import { StudioAiWebtoonEcosystemWorkbenchPanel } from "./StudioAiWebtoonEcosystemWorkbenchPanel";

describe("4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 REA 역공학 내재화 통합 검증", () => {
  it("카테고리 1: 젠툰(GenToon) 내 썰 1,600자 상한, 21개 다국어, 4컷 워크시트 및 왼손/오른손 소품 연속성 시트를 생성한다", () => {
    expect(GENTOON_SUPPORTED_LANGUAGES).toHaveLength(21);
    expect(GENTOON_STYLE_FAMILIES).toHaveLength(6);

    const longAnecdote = "비 오는 날 우산을 건넸다. ".repeat(200);
    const res = runGenToonStoryToComicPipeline({
      rawText: longAnecdote,
      inputMode: "anecdote-1600",
      outputFormat: "instatoon-carousel",
      styleFamilyId: "pastel-dream",
      languageCode: "ja",
      protagonistName: "소윤",
      primaryPropName: "파란 우산",
    });

    expect(res.wasClampedTo1600).toBe(true);
    expect(res.charCount).toBe(1600);
    expect(res.aspectRatio).toBe("4:5");
    expect(res.language.code).toBe("ja");
    expect(res.worksheetPanels).toHaveLength(4);
    expect(res.worksheetPanels.map((p) => p.beatRole)).toEqual([
      "orient",
      "develop",
      "turn-silent",
      "result",
    ]);
    expect(res.worksheetPanels[2]?.isSilentReactionBeat).toBe(true);
    expect(res.continuitySheet.handPropContinuityLedger.leftHandBefore).toBe("파란 우산");
    expect(res.continuitySheet.handPropContinuityLedger.leftHandAfter).toBe("파란 우산");
    expect(res.continuitySheet.handPropContinuityLedger.propTeleportationDetected).toBe(false);
    expect(res.continuitySheet.exportReadabilityChecklist.noHandPropTeleportation).toBe(true);
  });

  it("카테고리 1: 투닝(Tooning) 글로 캐릭터 연출, ComicAI 4면도 시트, Dashtoon 출판 및 Frameo 마이그레이션을 수행한다", () => {
    const tooning = runTooningTextToCharacterActing(
      "주은: 잠깐만! 거기 누구야?!\n레온: 당장 멈춰!\n[독백] 심장이 빠르게 뛰었다.",
    );
    expect(tooning.beats).toHaveLength(3);
    expect(tooning.beats[0]?.speechAct).toBe("exclamation");
    expect(tooning.beats[0]?.chatBubbleSvg.bubbleShape).toBe("spiky-shout");
    expect(tooning.beats[2]?.speechAct).toBe("monologue");
    expect(tooning.beats[2]?.chatBubbleSvg.bubbleShape).toBe("cloud-thought");
    expect(tooning.editorFeatureQuota.layerSeparationLimit).toBe(100);

    const comicAi = buildComicAiCharacterSheetAndPanels({
      characterName: "아린",
      appearancePrompt: "white bob hair, golden eyes, mage robe",
    });
    expect(comicAi.characterSheet.turnaroundViews).toHaveLength(4);
    expect(comicAi.sequentialPanels).toHaveLength(4);
    expect(comicAi.sequentialPanels[0]?.compositePrompt).toContain("아린");

    const dashtoon = runDashtoonAgencyPublishPipeline({
      episodeTitle: "Episode 01 Awakening",
      panelCount: 10,
    });
    expect(dashtoon.photoToComicJob.submitEndpoint).toBe("/api/v2/ai-apps/photo-to-comic");
    expect(dashtoon.publicationManifest.readerRoute).toBe("/comics/read/episode-01-awakening");
    expect(dashtoon.studioMigrationBridge.partnerBridgeTarget).toContain("Frameo");
  });

  it("카테고리 2: 에이드(AiD 3.1) 4단계 파이프라인·10장 캐릭터 시트·PSD 내보내기, 네이버 AI 페인터 힌트 채색, 클립스튜디오 보조를 검증한다", () => {
    const aid = runAidStudioPipeline({
      activeStage: "04-background",
      characterName: "엘리아",
      creationMode: "trait-synthesis",
      selectedRegionsCount: 3,
    });
    expect(aid.brushCanvasSpec.canvasWidthPx).toBe(2048);
    expect(aid.brushCanvasSpec.brushSizePx).toBe(12);
    expect(aid.brushCanvasSpec.lineStabilizationPercent).toBe(35);
    expect(aid.characterSheet.views).toHaveLength(5);
    expect(aid.characterSheet.totalSheetCount).toBe(10);
    expect(aid.uploadChecklist.allPassed).toBe(true);
    expect(aid.psdExportManifest.clipStudioPaintCompatible).toBe(true);
    expect(aid.psdExportManifest.layers).toHaveLength(5);

    const painter = runNaverWebtoonAiHintPainter();
    expect(painter.hintPoints.length).toBeGreaterThanOrEqual(4);
    expect(painter.diffusedRegions).toHaveLength(painter.hintPoints.length);
    expect(painter.previewSvgDataUrl).toContain("data:image/svg+xml;utf8,");
    expect(painter.edgeAwarenessScore).toBeGreaterThanOrEqual(90);

    const csp = runClipStudioPaintAiAssist({ screentoneLpi: 85, poseFovDeg: 45 });
    expect(csp.poseScannerRig.detectedJointsCount).toBe(28);
    expect(csp.backgroundLtConversion.screentoneFrequencyLpi).toBe(85);
    expect(csp.fourStepProWorkflow).toHaveLength(4);
  });

  it("카테고리 3 & 4: LlamaGen AI, 미드저니/SD, 포토샵 Firefly, 원더쉐어 필모라, 캔바 AI 및 12대 툴 레지스트리를 검증한다", () => {
    expect(REA_WEBTOON_ECOSYSTEM_12_TOOLS).toHaveLength(12);

    const llamagen = runLlamaGenWebtoonStoryboardDraft({
      format: "Webtoon",
      activeLayout: "Layout2",
    });
    expect(llamagen.pageShape).toBe("portrait");
    expect(llamagen.activeLayout).toBe("Layout2");
    expect(llamagen.panels).toHaveLength(4);
    expect(llamagen.revisionSyncSpec.debounceMs).toBe(500);
    expect(llamagen.supportedImportFormats.comicEditor).toContain("CBZ");

    const mjSd = buildMidjourneyStableDiffusionConceptPlan({
      genreEra: "사이버펑크 네오서울",
      locksCostume: false,
    });
    expect(mjSd.midjourneyParams.crefWeightCw).toBe(25);
    expect(mjSd.midjourneyV6Command).toContain("--cw 25");
    expect(mjSd.colorMoodboardPalette).toHaveLength(5);

    const fireflyExpand = buildPhotoshopFireflyGenerativePlan({
      mode: "generative-expand-vertical",
    });
    const fireflyRemove = buildPhotoshopFireflyGenerativePlan({
      mode: "object-removal-cleanplate",
    });
    const fireflyCostume = buildPhotoshopFireflyGenerativePlan({
      mode: "costume-prop-partial-edit",
    });
    expect(fireflyExpand.operationMode).toBe("generative-expand-vertical");
    expect(fireflyRemove.operationMode).toBe("object-removal-cleanplate");
    expect(fireflyCostume.operationMode).toBe("costume-prop-partial-edit");

    const filmora = runFilmoraMediaToWebtoonPipeline({
      filterPresetId: "sketch-me-ink-lineart",
      durationSec: 15,
    });
    expect(filmora.selectedFilterPreset.id).toBe("sketch-me-ink-lineart");
    expect(filmora.convertedPanels).toHaveLength(4);
    expect(filmora.keyframeExtractionSpec.temporalFlickerSuppressionScore).toBeGreaterThanOrEqual(90);

    const canva = runCanvaInstatoonCarouselPipeline({
      topicTitle: "자취생 요리 도전기",
      slideCount: 8,
    });
    expect(canva.slides).toHaveLength(8);
    expect(canva.backgroundRemoverSpec.alphaCutoutReady).toBe(true);
  });

  it("StudioAiWebtoonEcosystemWorkbenchPanel UI에서 4대 카테고리 탭 전환 및 대본 반영 콜백이 정상 작동한다", () => {
    const onApplyScript = vi.fn();
    render(
      <StudioAiWebtoonEcosystemWorkbenchPanel
        scriptInput="주은: 오늘이 바로 결전의 날이야."
        storyGenre="로맨스 판타지"
        onApplyScript={onApplyScript}
      />,
    );

    expect(screen.getByTestId("rea-ecosystem-tool-count-badge").textContent).toContain(
      "4대 카테고리 · 12개 AI 보조 어플 완비",
    );

    // 카테고리 1 기본 표시 및 젠툰 대본 반영 버튼 클릭
    expect(screen.getByTestId("ecosystem-panel-cat-1")).toBeDefined();
    fireEvent.click(screen.getByTestId("apply-gentoon-worksheet-script-btn"));
    expect(onApplyScript).toHaveBeenCalledTimes(1);

    // 카테고리 2 탭 전환
    fireEvent.click(screen.getByTestId("ecosystem-tab-cat-2-pro-drawing"));
    expect(screen.getByTestId("ecosystem-panel-cat-2")).toBeDefined();
    fireEvent.click(screen.getByTestId("naver-painter-warm-sunset-preset-btn"));

    // 카테고리 3 탭 전환
    fireEvent.click(screen.getByTestId("ecosystem-tab-cat-3-storyboard"));
    expect(screen.getByTestId("ecosystem-panel-cat-3")).toBeDefined();
    expect(screen.getByTestId("midjourney-v6-command-code").textContent).toContain("--cref");

    // 카테고리 4 탭 전환
    fireEvent.click(screen.getByTestId("ecosystem-tab-cat-4-style-transfer"));
    expect(screen.getByTestId("ecosystem-panel-cat-4")).toBeDefined();
    fireEvent.click(screen.getByTestId("canva-carousel-10-slides-btn"));
  });
});
