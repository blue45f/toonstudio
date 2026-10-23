import { describe, expect, it } from "vitest";

import { recommendCharacterVoiceDialogueExchange } from "../lettering/studio-dialogue-suggest";
import {
  evaluateStorylineCliffhangerAndPacing,
  generateEpisodeStorylineArc,
} from "../planning/studio-plot-development";
import { analyzeArtistDatasetSamples } from "./studio-artist-style-dna";
import { ROUGH_SKETCH_STROKE_TEMPLATES } from "./studio-rough-sketch-analyzer";
import {
  buildFabulatorNarrativeChain,
  buildGenvasCharacterPoseLock,
  buildGlobalKWebtoonExportBundle,
  decomposeCutIntoProductionLayers,
  renderStoryboardCutWireframeDataUrl,
  runWebtoonStoryboardMasterPipeline,
  WEBTOON_AI_SERVICE_BENCHMARK_MATRIX,
} from "./studio-webtoon-storyboard-pipeline";

describe("studio-webtoon-storyboard-pipeline (200%+ 고도화 통합 검증)", () => {
  it("작가가 제공한 학습 데이터셋 샘플에서 화풍 DNA(선화·채색·색감)와 트리거 캡션·준비도 점수를 정확히 추론한다", () => {
    const report = analyzeArtistDatasetSamples(
      [
        {
          id: "sample-1",
          width: 1024,
          height: 1024,
          shotType: "close-up",
          lineDensity: 0.82,
          shadingContrast: 0.78,
          colorSaturation: 0.35,
          caption: "intensity in eyes",
        },
        {
          id: "sample-2",
          width: 1024,
          height: 1360,
          shotType: "full-body",
          lineDensity: 0.75,
          shadingContrast: 0.8,
          colorSaturation: 0.4,
        },
        {
          id: "sample-3",
          width: 832,
          height: 1216,
          shotType: "action",
          lineDensity: 0.85,
          shadingContrast: 0.76,
          colorSaturation: 0.42,
        },
        {
          id: "sample-4",
          width: 1024,
          height: 1024,
          shotType: "bust",
          lineDensity: 0.78,
          shadingContrast: 0.75,
          colorSaturation: 0.38,
        },
      ],
      {
        artistLabel: "다크판타지 해칭 작가",
        triggerWord: "dark_hatch_master",
      },
    );

    expect(report.sampleCount).toBe(4);
    expect(report.readinessScore).toBeGreaterThanOrEqual(75);
    expect(report.inferredTraits.lineWeight).toBe("bold");
    expect(report.inferredTraits.shadingMode).toBe("hatching");
    expect(report.inferredTraits.paletteMood).toBe("noir");
    expect(report.shotCoverage.hasCloseUp).toBe(true);
    expect(report.shotCoverage.hasFullBody).toBe(true);
    expect(report.autoCaptions[0]?.caption).toContain("dark_hatch_master");
    expect(report.dnaProfile.triggerWord).toBe("dark_hatch_master");
  });

  it("캐릭터 말투 아키타입별 멀티 턴 대사·독백·효과음(SFX) 교차 추천과 말풍선 분할을 생성한다", () => {
    const coldExchange = recommendCharacterVoiceDialogueExchange({
      situationText: "옥상 위의 비밀 회동",
      protagonistName: "강현",
      partnerName: "세라",
      archetype: "cold-strategist",
    });
    expect(coldExchange.speechEndingStyle).toBe("해체/반말");
    expect(coldExchange.beats).toHaveLength(3);
    expect(coldExchange.beats[0]?.speaker).toBe("강현");
    expect(coldExchange.beats[0]?.suggestedSfx).toBe("스르륵");
    expect(coldExchange.scriptBlock).toContain("강현:");

    const nobleExchange = recommendCharacterVoiceDialogueExchange({
      situationText: "황궁 연회장의 탄핵",
      protagonistName: "아델리아",
      partnerName: "황태자",
      archetype: "noble-formal",
    });
    expect(nobleExchange.speechEndingStyle).toBe("하십시오/격식체");
    expect(nobleExchange.beats[0]?.mobileBubbles.length).toBeGreaterThanOrEqual(1);
  });

  it("4막(기·승·전·결) 스토리라인 아크의 클리프행어 훅 강도와 스크롤 유지율을 진단한다", () => {
    const arc = generateEpisodeStorylineArc({
      genre: "액션",
      coreConflict: "봉인된 마검의 각성",
      turningPoints: ["도입", "촉발", "위기", "결전"],
      cliffhanger: "검 끝에서 검은 불꽃이 치솟으며 진실이 드러난다",
    });
    const diag = evaluateStorylineCliffhangerAndPacing(arc);

    expect(diag.hookPowerScore).toBeGreaterThanOrEqual(80);
    expect(diag.scrollRetentionScore).toBeGreaterThanOrEqual(75);
    expect(diag.tensionContrastDelta).toBeGreaterThan(0);
    expect(diag.plotDoctorNotes.length).toBeGreaterThanOrEqual(2);
  });

  it("작가 학습 샘플 + 자유 드로잉 스케치 + 스토리라인/대사 추천 + 글로벌 K-콘텐츠 다국어 식자를 단일 파이프라인으로 통합 실행한다", () => {
    const output = runWebtoonStoryboardMasterPipeline({
      storylineInput: {
        genre: "판타지",
        coreConflict: "차원의 문이 열리고 감춰진 배신자가 드러난다",
        cliffhanger: "가장 믿었던 동료의 눈동자가 붉게 물든다",
      },
      protagonistName: "시우",
      partnerName: "하린",
      voiceArchetype: "passionate-hero",
      artistTrainingSamples: [
        {
          id: "s-1",
          width: 1024,
          height: 1024,
          shotType: "close-up",
          lineDensity: 0.3,
          shadingContrast: 0.35,
          colorSaturation: 0.45,
        },
        {
          id: "s-2",
          width: 1024,
          height: 1280,
          shotType: "full-body",
          lineDensity: 0.32,
          shadingContrast: 0.38,
          colorSaturation: 0.48,
        },
      ],
      freehandSketchStrokesByCut: [
        ROUGH_SKETCH_STROKE_TEMPLATES[0]!.strokes,
        ROUGH_SKETCH_STROKE_TEMPLATES[1]!.strokes,
      ],
      creatorLevel: "aspiring",
      targetLocale: "en",
    });

    expect(output.datasetAnalysis).not.toBeNull();
    expect(output.resolvedArtistStyle.lineWeight).toBe("fine");
    expect(output.storylineArc.acts).toHaveLength(4);
    expect(output.directingResult.totalCuts).toBeGreaterThanOrEqual(8);
    expect(output.enrichedCuts.length).toBe(output.directingResult.totalCuts);

    const firstCut = output.enrichedCuts[0]!;
    expect(firstCut.sketchAnalysis?.detectedPresetId).toBe("diagonal-action");
    expect(firstCut.cutWireframeDataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
    expect(firstCut.stylePreviewDataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
    expect(firstCut.localizedDialogues.map((d) => d.locale)).toEqual(["ko", "en", "ja", "es"]);
    expect(firstCut.emotionBubble.recommendedBubbleShape).toBeTruthy();

    expect(output.creatorEcosystemReport.estimatedTimeSavedMinutes).toBeGreaterThanOrEqual(100);
    expect(output.creatorEcosystemReport.aspiringCreatorCurriculum).toHaveLength(4);
    expect(output.creatorEcosystemReport.globalKContentPlatformScore).toBeGreaterThanOrEqual(80);
  });

  it("컷 와이어프레임 SVG Data URL 렌더러와 글로벌 K-웹툰 프로덕션 번들이 유효한 규격을 생성한다", () => {
    const output = runWebtoonStoryboardMasterPipeline({
      scriptText: '[익스트림 클로즈업] 시우: "절대 물러서지 않아!!"',
      artistPresetId: "k-action-sharp",
    });
    const cut = output.directingResult.cuts[0]!;
    const wireframeUrl = renderStoryboardCutWireframeDataUrl(cut);
    expect(wireframeUrl).toMatch(/^data:image\/svg\+xml;base64,/u);

    const bundle = buildGlobalKWebtoonExportBundle(output);
    expect(bundle.totalCuts).toBe(1);
    expect(bundle.platformSpecs.map((p) => p.platformId)).toEqual([
      "naver-webtoon-global",
      "line-manga-piccoma",
      "tapas-manta",
    ]);
    expect(bundle.productionSheetMarkdown).toContain("# 글로벌 K-웹툰 프로덕션 스토리보드 시트");
    expect(bundle.productionSheetMarkdown).toContain("EN 식자:");
  });

  it("젠버스(Genvas)·페뷸레이터(Fabulator)·리얼드로우(RealDraw) 벤치마크 엔진이 5단계 서사 체인·포즈 고정·4레이어 분해를 수행한다", () => {
    const chain = buildFabulatorNarrativeChain({
      genre: "로맨스판타지",
      coreConflict: "황실의 금기된 계약 결혼과 반역의 그림자",
      protagonistName: "아델리아",
      partnerName: "카시안",
      relationshipDynamic: "contract-allies",
    });
    expect(chain.stages).toHaveLength(5);
    expect(chain.worldviewPillars).toHaveLength(3);
    expect(chain.episodeTreatmentBeats).toHaveLength(4);
    expect(chain.readyToDirectScript).toContain("계약서 제3조");

    const output = runWebtoonStoryboardMasterPipeline({
      scriptText: chain.readyToDirectScript,
      relationshipDynamic: "contract-allies",
      posePresetId: "pose-lookback-closeup",
      protagonistName: "아델리아",
      partnerName: "카시안",
    });

    expect(output.genvasCharacterPoseLock.posePreset.id).toBe("pose-lookback-closeup");
    expect(output.genvasCharacterPoseLock.copyrightProvenanceBadge.status).toBe(
      "verified-artist-opt-in",
    );
    expect(output.genvasCharacterPoseLock.copyrightProvenanceBadge.commercialUseCleared).toBe(true);
    expect(output.benchmarkMatrix).toEqual(WEBTOON_AI_SERVICE_BENCHMARK_MATRIX);

    const directPoseLock = buildGenvasCharacterPoseLock(
      output.resolvedArtistStyle,
      "pose-lookback-closeup",
      12,
    );
    expect(directPoseLock.fewShotTrainingTargetCount).toBe(10);
    expect(directPoseLock.copyrightProvenanceBadge.status).toBe("verified-artist-opt-in");

    const firstCutLayers = decomposeCutIntoProductionLayers(
      output.directingResult.cuts[0]!,
      output.resolvedArtistStyle,
    );
    expect(firstCutLayers.layers).toHaveLength(4);
    expect([18, 28, 50, 85]).toContain(firstCutLayers.lensFocalLengthMm);
    expect(output.enrichedCuts[0]!.productionLayers.layers).toHaveLength(4);
  });
});
