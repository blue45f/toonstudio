/**
 * studio-webtoon-storyboard-pipeline.ts
 *
 * 웹툰 작가 그림체 학습 데이터셋/모델(Artist Style DNA) + 지문·간단한 러프 스케치 기반 스토리보드 생성 +
 * 4막(기·승·전·결) 스토리라인·캐릭터 대사 추천 + 글로벌 K-웹툰 다국어(KO/EN/JA/ES) 식자 패키지를
 * 단일 파이프라인으로 통합 실행하는 마스터 엔진.
 *
 * 외부 유료 BYOK API 키가 없어도 로컬 결정적 엔진 및 기본 연결만으로 100% 동작하며,
 * 전문 웹툰 작가의 작화·콘티 공수 단축과 미래 웹툰 작가 지망생의 연출 학습을 동시에 지원한다.
 */

import {
  buildGlobalLocalizedDialoguePreview,
  recommendCharacterVoiceDialogueExchange,
  splitDialogueIntoWebtoonBubbles,
  type CharacterVoiceArchetype,
  type CharacterVoiceExchangeRecommendation,
  type GlobalLocalizedDialogueEntry,
} from "../lettering/studio-dialogue-suggest";
import {
  compileEpisodeArcToScript,
  evaluateStorylineCliffhangerAndPacing,
  generateEpisodeStorylineArc,
  type EpisodeStorylineArc,
  type PlotDevelopmentInput,
  type StorylineCliffhangerDiagnostic,
} from "../planning/studio-plot-development";
import {
  StudioAiEmotionBubbleMatcher,
  type EmotionBubbleRecommendation,
} from "./studio-ai-emotion-bubble-matcher";
import {
  StudioAiStoryboardDirector,
  type StoryboardArtistStyleBinding,
  type StoryboardCutPlan,
  type StoryboardDirectingResult,
  type StoryboardRoughSketchInput,
} from "./studio-ai-storyboard-director";
import {
  analyzeArtistDatasetSamples,
  auditStoryboardStyleConsistency,
  BUILTIN_ARTIST_STYLE_PRESETS,
  getArtistStyleDnaPreset,
  synthesizeLocalStyleModelPreviewDataUrl,
  type ArtistDatasetAnalysisReport,
  type ArtistStyleDnaProfile,
  type ArtistStyleTrainingSample,
  type StoryboardStyleConsistencyAudit,
} from "./studio-artist-style-dna";
import {
  analyzeFreehandRoughSketchStrokes,
  type FreehandRoughSketchAnalysis,
  type RoughSketchStroke,
} from "./studio-rough-sketch-analyzer";
import {
  buildFabulatorNarrativeChain,
  buildGenvasCharacterPoseLock,
  decomposeCutIntoProductionLayers,
  GENVAS_POSE_PRESETS,
  WEBTOON_AI_SERVICE_BENCHMARK_MATRIX,
  type CharacterRelationshipDynamicId,
  type FabulatorNarrativeChainResult,
  type GenvasCharacterPoseLockSpec,
  type GenvasPosePresetId,
  type RealDrawCutDecomposition,
  type WebtoonAiBenchmarkEntry,
} from "./studio-webtoon-industry-benchmarks";

export {
  buildFabulatorNarrativeChain,
  buildGenvasCharacterPoseLock,
  decomposeCutIntoProductionLayers,
  GENVAS_POSE_PRESETS,
  WEBTOON_AI_SERVICE_BENCHMARK_MATRIX,
  type CharacterRelationshipDynamicId,
  type FabulatorNarrativeChainResult,
  type GenvasCharacterPoseLockSpec,
  type GenvasPosePresetId,
  type RealDrawCutDecomposition,
  type WebtoonAiBenchmarkEntry,
};

export interface WebtoonStoryboardMasterInput {
  /** 작가가 직접 작성한 대본/지문. 비어 있으면 `storylineInput`으로 4막 대본을 자동 생성한다. */
  readonly scriptText?: string;
  /** 스토리라인·대사 자동 생성 및 추천용 플롯 시드 입력. */
  readonly storylineInput?: Partial<PlotDevelopmentInput>;
  /** 캐릭터 말투 아키타입 (대사 티키타카 추천용). */
  readonly voiceArchetype?: CharacterVoiceArchetype;
  /** 오노마AI 페뷸레이터형 캐릭터 관계성 텐션 설정. */
  readonly relationshipDynamic?: CharacterRelationshipDynamicId;
  /** 라이언로켓 젠버스형 웹툰 포즈 프리셋 ID. */
  readonly posePresetId?: GenvasPosePresetId;
  readonly protagonistName?: string;
  readonly partnerName?: string;
  /** 작가가 학습 데이터로 제공한 원고/일러스트 샘플 목록. */
  readonly artistTrainingSamples?: readonly ArtistStyleTrainingSample[];
  /** 직접 지정한 작가 그림체 모델 바인딩. */
  readonly artistStyle?: StoryboardArtistStyleBinding | null;
  /** 내장 K-웹툰 화풍 프리셋 ID (`preset-k-romance-fine`, `preset-k-action-ink` 등). */
  readonly artistPresetId?: string;
  /** 컷별 자유 드로잉 러프 스케치 스트로크 배열. */
  readonly freehandSketchStrokesByCut?: readonly (readonly RoughSketchStroke[])[];
  /** 컷별 구조화된 간단한 스케치 입력. */
  readonly roughSketches?: readonly (StoryboardRoughSketchInput | null | undefined)[];
  /** 대표 스케치 의도. */
  readonly defaultSketch?: StoryboardRoughSketchInput | null;
  /** 창작자 숙련도 모드 (`pro`: 전문 웹툰 작가, `aspiring`: 예비/지망생 작가). */
  readonly creatorLevel?: "pro" | "aspiring";
  /** 글로벌 K-콘텐츠 타깃 로케일. */
  readonly targetLocale?: "ko" | "en" | "ja" | "es";
}

export interface EnrichedStoryboardCutSpec {
  readonly cutPlan: StoryboardCutPlan;
  readonly sketchAnalysis: FreehandRoughSketchAnalysis | null;
  readonly emotionBubble: EmotionBubbleRecommendation;
  readonly mobileBubbles: readonly string[];
  readonly localizedDialogues: readonly GlobalLocalizedDialogueEntry[];
  readonly cutWireframeDataUrl: string;
  readonly stylePreviewDataUrl: string;
  /** 리얼드로우(RealDraw) 벤치마크: 4레이어(3D배경/밑색/명암/선화) 및 카메라 초점거리 분해 사양. */
  readonly productionLayers: RealDrawCutDecomposition;
}

export interface CreatorEcosystemImpactReport {
  readonly creatorLevel: "pro" | "aspiring";
  /** 기존 수작업 콘티·식자 대비 예상 절감 시간(분). */
  readonly estimatedTimeSavedMinutes: number;
  /** 전문 작가용 작화·어시스턴트 협업 가이드. */
  readonly proProductionGuide: string;
  /** 예비 웹툰 작가 지망생용 단계별 연출 학습 로드맵. */
  readonly aspiringCreatorCurriculum: readonly string[];
  /** 글로벌 K-웹툰 플랫폼(네이버웹툰 글로벌·라인망가·픽코마·타파스) 규격 적합 점수 (0..100). */
  readonly globalKContentPlatformScore: number;
  readonly supportedGlobalPlatforms: readonly string[];
}

export interface WebtoonStoryboardMasterOutput {
  readonly resolvedArtistStyle: StoryboardArtistStyleBinding;
  readonly artistStyleDna: ArtistStyleDnaProfile;
  readonly datasetAnalysis: ArtistDatasetAnalysisReport | null;
  readonly storylineArc: EpisodeStorylineArc;
  readonly cliffhangerDiagnostic: StorylineCliffhangerDiagnostic;
  readonly dialogueExchange: CharacterVoiceExchangeRecommendation;
  /** 오노마AI 페뷸레이터 & 투툰 벤치마크: 5단계 서사 빌드업 체인. */
  readonly fabulatorNarrativeChain: FabulatorNarrativeChainResult;
  /** 라이언로켓 젠버스 벤치마크: 소량(10장) 캐릭터·화풍 고정 + 포즈 제어 + 클린 학습 인증. */
  readonly genvasCharacterPoseLock: GenvasCharacterPoseLockSpec;
  readonly directingResult: StoryboardDirectingResult;
  readonly styleConsistencyAudit: StoryboardStyleConsistencyAudit;
  readonly enrichedCuts: readonly EnrichedStoryboardCutSpec[];
  readonly creatorEcosystemReport: CreatorEcosystemImpactReport;
  readonly benchmarkMatrix: readonly WebtoonAiBenchmarkEntry[];
}

/**
 * 컷별 카메라 구도·지평선·피사체 실루엣·말풍선 안전 영역을 직관적으로 보여주는
 * 스토리보드 와이어프레임 SVG Data URL을 결정적으로 렌더링한다.
 */
export function renderStoryboardCutWireframeDataUrl(
  cut: StoryboardCutPlan,
  sketchAnalysis: FreehandRoughSketchAnalysis | null = null,
): string {
  const width = 360;
  const height = Math.round(240 * Math.min(1.8, Math.max(0.85, cut.panelHeightRatio)));
  const horizonY = Math.round(
    height * (sketchAnalysis?.roughSketchInput.horizonRatio ?? (cut.cameraAngle === "low-angle" ? 0.76 : cut.cameraAngle === "high-angle" ? 0.28 : 0.52)),
  );
  const bubbleHeight = Math.round(height * (cut.reserveDialogueAreaRatio ?? 0.16));
  const subX = Math.round(width * (sketchAnalysis?.roughSketchInput.focalX ?? 0.5));
  const subY = Math.round(height * (sketchAnalysis?.roughSketchInput.focalY ?? 0.54));
  const subRadius =
    cut.shotScale === "extreme-close-up"
      ? 72
      : cut.shotScale === "close-up"
        ? 56
        : cut.shotScale === "full-shot" || cut.shotScale === "long-shot"
          ? 34
          : 46;

  const safeShot = `${cut.shotScale} · ${cut.cameraAngle}`.replace(/[<>&"']/gu, "");
  const safeSfx = (cut.suggestedSfx ?? "").replace(/[<>&"']/gu, "");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#0f172a" stroke="#334155" stroke-width="2" rx="10"/>`,
    `<rect x="12" y="10" width="${width - 24}" height="${Math.max(28, bubbleHeight)}" rx="14" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    `<line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4"/>`,
    `<circle cx="${subX}" cy="${subY}" r="${subRadius}" fill="#312e81" fill-opacity="0.55" stroke="#a855f7" stroke-width="2.5"/>`,
    `<text x="20" y="28" fill="#e2e8f0" font-family="sans-serif" font-size="12" font-weight="bold">CUT #${cut.cutNumber} [${safeShot}]</text>`,
    safeSfx
      ? `<text x="${width - 20}" y="${height - 16}" text-anchor="end" fill="#f43f5e" font-family="sans-serif" font-size="14" font-weight="bold">SFX: ${safeSfx}</text>`
      : "",
    `</svg>`,
  ].join("");

  const encoded =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, "utf8").toString("base64");

  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * 작가 그림체 모델 + 스토리라인/대사 추천 + 지문/스케치 기반 스토리보드 생성 + 글로벌 K-웹툰 현지화 검수를
 * 한 번에 수행하는 통합 마스터 파이프라인.
 */
export function runWebtoonStoryboardMasterPipeline(
  input: WebtoonStoryboardMasterInput = {},
): WebtoonStoryboardMasterOutput {
  const creatorLevel = input.creatorLevel ?? "aspiring";
  const targetLocale = input.targetLocale ?? "ko";

  // 1. 작가 그림체 학습 데이터셋 분석 또는 프리셋/바인딩 결정
  const datasetAnalysis =
    input.artistTrainingSamples && input.artistTrainingSamples.length > 0
      ? analyzeArtistDatasetSamples(input.artistTrainingSamples, {
          artistLabel: input.artistStyle?.artistLabel,
          triggerWord: input.artistStyle?.triggerWord,
          modelId: input.artistStyle?.modelId,
        })
      : null;

  const presetDescriptor = input.artistPresetId
    ? getArtistStyleDnaPreset(input.artistPresetId)
    : undefined;

  const resolvedArtistStyle: StoryboardArtistStyleBinding =
    input.artistStyle ??
    datasetAnalysis?.synthesizedStyleBinding ??
    (presetDescriptor
      ? BUILTIN_ARTIST_STYLE_PRESETS.find((p) => p.artistLabel === presetDescriptor.name) ??
        BUILTIN_ARTIST_STYLE_PRESETS[0]!
      : BUILTIN_ARTIST_STYLE_PRESETS[0]!);

  // 2. 4막(기·승·전·결) 스토리라인 아크 및 클리프행어 진단
  const storylineSeed: PlotDevelopmentInput = {
    genre: input.storylineInput?.genre ?? "판타지",
    coreConflict: input.storylineInput?.coreConflict ?? "봉인된 기억의 각성과 세계의 균열",
    turningPoints: input.storylineInput?.turningPoints ?? ["도입", "촉발", "위기", "결전"],
    ...(input.storylineInput?.logline ? { logline: input.storylineInput.logline } : {}),
    ...(input.storylineInput?.cliffhanger ? { cliffhanger: input.storylineInput.cliffhanger } : {}),
  };
  const storylineArc = generateEpisodeStorylineArc(storylineSeed, {
    protagonistName: input.protagonistName ?? "주인공",
    partnerName: input.partnerName ?? "조력자",
  });
  const cliffhangerDiagnostic = evaluateStorylineCliffhangerAndPacing(storylineArc);

  // 3. 캐릭터 말투 기반 대사·독백·효과음(SFX) 교차 추천 + 페뷸레이터 5단계 내러티브 체인 + 젠버스 캐릭터·포즈 고정
  const dialogueExchange = recommendCharacterVoiceDialogueExchange({
    situationText: storylineArc.coreConflict,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
    archetype: input.voiceArchetype ?? "cold-strategist",
  });

  const fabulatorNarrativeChain = buildFabulatorNarrativeChain({
    genre: storylineArc.genre,
    coreConflict: storylineArc.coreConflict,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
    relationshipDynamic: input.relationshipDynamic ?? "fated-rivals",
  });

  const genvasCharacterPoseLock = buildGenvasCharacterPoseLock({
    artistStyle: resolvedArtistStyle,
    posePresetId: input.posePresetId,
    sampleCount: input.artistTrainingSamples?.length ?? 10,
    protagonistName: input.protagonistName,
  });

  // 4. 자유 드로잉 스케치 스트로크 분석 및 컷별 스케치 의도 병합
  const freehandAnalyses: (FreehandRoughSketchAnalysis | null)[] = (
    input.freehandSketchStrokesByCut ?? []
  ).map((strokes) =>
    strokes && strokes.length > 0 ? analyzeFreehandRoughSketchStrokes(strokes) : null,
  );

  const mergedSketches: (StoryboardRoughSketchInput | null | undefined)[] = [];
  const maxSketchLen = Math.max(
    freehandAnalyses.length,
    input.roughSketches?.length ?? 0,
  );
  for (let i = 0; i < maxSketchLen; i++) {
    mergedSketches.push(
      input.roughSketches?.[i] ?? freehandAnalyses[i]?.roughSketchInput ?? null,
    );
  }

  // 5. 지문 + 스케치 + 작가 그림체 모델 결합 스토리보드 디렉팅
  const effectiveScript =
    input.scriptText && input.scriptText.trim().length > 0
      ? input.scriptText
      : compileEpisodeArcToScript(storylineArc);

  const director = new StudioAiStoryboardDirector();
  const directingResult = director.direct(effectiveScript, {
    sketches: mergedSketches.length > 0 ? mergedSketches : undefined,
    defaultSketch: input.defaultSketch ?? null,
    artistStyle: resolvedArtistStyle,
    creatorLevel,
    targetLocale,
  });

  // 6. 전 컷 화풍 일관성 감사
  const styleConsistencyAudit = auditStoryboardStyleConsistency(directingResult, {
    genre: storylineArc.genre,
  });
  const artistStyleDna = styleConsistencyAudit.dnaProfile!;

  // 7. 컷별 말풍선 감정 매칭 · 모바일 말풍선 분할 · 다국어 현지화 식자 · 와이어프레임/스타일 프리뷰 · 리얼드로우 4레이어 분해
  const bubbleMatcher = new StudioAiEmotionBubbleMatcher();
  const enrichedCuts: EnrichedStoryboardCutSpec[] = directingResult.cuts.map((cut, idx) => {
    const lineText = cut.dialogue ?? cut.narration ?? cut.summary;
    const emotionBubble = bubbleMatcher.match(lineText);
    const mobileBubbles = splitDialogueIntoWebtoonBubbles(lineText);
    const localizedDialogues = buildGlobalLocalizedDialoguePreview(lineText, {
      speaker: cut.speaker,
      emotion: cut.emotion,
    });
    const sketchAnalysis = freehandAnalyses[idx] ?? null;
    const cutWireframeDataUrl = renderStoryboardCutWireframeDataUrl(cut, sketchAnalysis);
    const stylePreview = synthesizeLocalStyleModelPreviewDataUrl({
      artistLabel: resolvedArtistStyle.artistLabel,
      triggerWord: resolvedArtistStyle.triggerWord,
      prompt: cut.stageDirection || cut.summary,
      lineWeight: resolvedArtistStyle.lineWeight,
      shadingMode: resolvedArtistStyle.shadingMode,
      paletteMood: resolvedArtistStyle.paletteMood,
    });
    const productionLayers = decomposeCutIntoProductionLayers(cut, resolvedArtistStyle);

    return Object.freeze({
      cutPlan: cut,
      sketchAnalysis,
      emotionBubble,
      mobileBubbles,
      localizedDialogues,
      cutWireframeDataUrl,
      stylePreviewDataUrl: stylePreview.dataUrl,
      productionLayers,
    });
  });

  // 8. 전문 작가 & 미래 웹툰 작가 지망생 저변 확대 및 글로벌 K-콘텐츠 리포트 산출
  const estimatedTimeSavedMinutes = Math.max(15, directingResult.totalCuts * 18);
  const globalKContentPlatformScore = Math.min(
    100,
    Math.round(
      (directingResult.globalKWebtoonReadiness?.verticalScrollRhythmScore ?? 90) * 0.4 +
        styleConsistencyAudit.consistencyScore * 0.3 +
        cliffhangerDiagnostic.hookPowerScore * 0.3,
    ),
  );

  const creatorEcosystemReport: CreatorEcosystemImpactReport = Object.freeze({
    creatorLevel,
    estimatedTimeSavedMinutes,
    proProductionGuide:
      `[${resolvedArtistStyle.artistLabel}] 화풍 DNA(${artistStyleDna.summaryKo}) 및 캐릭터 고정 시드(${genvasCharacterPoseLock.characterIdentityToken})가 ` +
      `전 컷(${directingResult.totalCuts}컷)에 일관 바인딩되어 콘티·선화·밑색·명암 4레이어 분업 및 글로벌 식자 공수를 약 ${estimatedTimeSavedMinutes}분 단축합니다.`,
    aspiringCreatorCurriculum: Object.freeze([
      "1단계 (구도·스케치): 간단한 도형·실루엣과 동세선만으로 샷 스케일(CU/FS)과 카메라 앵글을 설계합니다.",
      "2단계 (스토리라인·호흡): 기·승·전·결 4막 텐션 곡선과 회차 엔딩 클리프행어 직전 180px 스크롤 여백 원리를 익힙니다.",
      "3단계 (대사·말풍선): 모바일 1말풍선 28자 이내 분할과 감정별 말풍선 외곽선(외침·속삭임·독백)을 매칭합니다.",
      "4단계 (글로벌 K-웹툰): 영어·일본어·스페인어 번역 팽창률(최대 1.42배)을 고려해 말풍선 안전 여백을 확보합니다.",
    ]),
    globalKContentPlatformScore,
    supportedGlobalPlatforms: Object.freeze([
      "NAVER WEBTOON Global (EN/ES)",
      "LINE Manga & Piccoma (JA)",
      "Tapas & Manta (North America)",
      "Kakaopage & Webtoon Standard Scroll (KO)",
    ]),
  });

  return Object.freeze({
    resolvedArtistStyle,
    artistStyleDna,
    datasetAnalysis,
    storylineArc,
    cliffhangerDiagnostic,
    dialogueExchange,
    fabulatorNarrativeChain,
    genvasCharacterPoseLock,
    directingResult,
    styleConsistencyAudit,
    enrichedCuts: Object.freeze(enrichedCuts),
    creatorEcosystemReport,
    benchmarkMatrix: WEBTOON_AI_SERVICE_BENCHMARK_MATRIX,
  });
}

export interface GlobalKWebtoonPlatformSpec {
  readonly platformId: "naver-webtoon-global" | "line-manga-piccoma" | "tapas-manta";
  readonly platformLabel: string;
  readonly targetLocales: readonly ("ko" | "en" | "ja" | "es")[];
  readonly recommendedWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly typesettingRule: string;
}

export interface GlobalKWebtoonExportBundle {
  readonly artistModelSummary: string;
  readonly totalCuts: number;
  readonly platformSpecs: readonly GlobalKWebtoonPlatformSpec[];
  readonly productionSheetMarkdown: string;
}

export const GLOBAL_K_WEBTOON_PLATFORM_SPECS: readonly GlobalKWebtoonPlatformSpec[] = Object.freeze([
  {
    platformId: "naver-webtoon-global",
    platformLabel: "NAVER WEBTOON Global (KO/EN/ES)",
    targetLocales: Object.freeze(["ko", "en", "es"] as const),
    recommendedWidthPx: 800,
    maxSliceHeightPx: 1280,
    typesettingRule: "가로쓰기 중앙 정렬 · 영문/스페인어 번역 시 말풍선 가로폭 35~42% 여유 확보",
  },
  {
    platformId: "line-manga-piccoma",
    platformLabel: "LINE Manga & Piccoma (JA)",
    targetLocales: Object.freeze(["ja"] as const),
    recommendedWidthPx: 800,
    maxSliceHeightPx: 1280,
    typesettingRule: "일본어 세로쓰기(타테구미) 겸용 세로 타원형 말풍선 여백 확보",
  },
  {
    platformId: "tapas-manta",
    platformLabel: "Tapas & Manta (North America)",
    targetLocales: Object.freeze(["en"] as const),
    recommendedWidthPx: 940,
    maxSliceHeightPx: 1280,
    typesettingRule: "북미 모바일 가독성 기준 1말풍선 22단어 이내 · 효과음(SFX) 병기 권장",
  },
]);

/**
 * 마스터 파이프라인 실행 결과를 전문 작화팀·어시스턴트·글로벌 번역 식자팀에 즉시 전달할 수 있는
 * K-웹툰 통합 프로덕션 시트(`GlobalKWebtoonExportBundle`)로 직렬화한다.
 */
export function buildGlobalKWebtoonExportBundle(
  output: WebtoonStoryboardMasterOutput,
): GlobalKWebtoonExportBundle {
  const { resolvedArtistStyle, artistStyleDna, storylineArc, cliffhangerDiagnostic, enrichedCuts } =
    output;
  const artistModelSummary = `${resolvedArtistStyle.artistLabel} (${resolvedArtistStyle.triggerWord}) · ${artistStyleDna.summaryKo}`;

  const cutLines = enrichedCuts.map((item) => {
    const cut = item.cutPlan;
    const enEntry = item.localizedDialogues.find((d) => d.locale === "en");
    const jaEntry = item.localizedDialogues.find((d) => d.locale === "ja");
    return [
      `### CUT #${cut.cutNumber} [${cut.shotScale} / ${cut.cameraAngle}] (감정: ${cut.emotion}, 말풍선: ${item.emotionBubble.recommendedBubbleShape})`,
      `- 지문/요약: ${cut.summary}`,
      `- 화풍 프롬프트: ${cut.artistStylePrompt ?? cut.backgroundPrompt}`,
      `- EN 식자: ${enEntry?.localizedText ?? "-"}`,
      `- JA 식자: ${jaEntry?.localizedText ?? "-"}`,
    ].join("\n");
  });

  const productionSheetMarkdown = [
    `# 글로벌 K-웹툰 프로덕션 스토리보드 시트 (${storylineArc.genre})`,
    `- 작가 그림체 모델: ${artistModelSummary}`,
    `- 4막 페이싱: ${storylineArc.pacingSummary}`,
    `- 클리프행어 훅 강도: ${cliffhangerDiagnostic.hookPowerScore}점 / 스크롤 유지율: ${cliffhangerDiagnostic.scrollRetentionScore}점`,
    "",
    ...cutLines,
  ].join("\n");

  return Object.freeze({
    artistModelSummary,
    totalCuts: enrichedCuts.length,
    platformSpecs: GLOBAL_K_WEBTOON_PLATFORM_SPECS,
    productionSheetMarkdown,
  });
}

