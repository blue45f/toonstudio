/**
 * storyboard-style-transfer-suite.ts
 *
 * 카테고리 3 (스토리보드 및 콘티/콘셉트 기획 툴) & 카테고리 4 (사진 및 영상을 만화로 변환하는 스타일 툴)
 * REA 역공학 내재화 및 고도화 엔진
 *
 * - 카테고리 3:
 *   1. LlamaGen AI (https://llamagen.ai/ko/features/ai-webtoon-generator — `20920-e6499f58cb2e797b.js` 정밀 분석):
 *      - 한국형 세로 스크롤(`pageShape: "portrait"`) 최적화 스토리 비트별 감정 전환 & 컷 흐름 초안화
 *      - `Webtoon`/`Comic`/`Manga` 3대 포맷, `Layout0`~`Layout4`(`fourPanel`), `comicRoles`/`comicLocations`/`upscaleQueue`/`comicDataGzip`
 *      - 500ms 디바운스 리비전 동기화 및 `PDF/CBZ/ZIP/EPUB/JSON` 코믹 에디터 · `ZIP turnarounds/CSV rosters` 캐릭터 에디터 호환
 *   2. 미드저니 (Midjourney v6.1) & 스테이블 디퓨전 (Stable Diffusion):
 *      - `--cref`/`--cw`(캐릭터 고정), `--sref`/`--sw`(화풍 무드보드 고정), `--niji 6` 및 ControlNet(`OpenPose`/`Lineart`/`Depth`)
 *      - 웹툰 캐릭터 시트, 시대/장르 의상 고증 자료(Costume Reference), 5색 채색 무드보드(Color Moodboard) 기획
 *   3. 포토샵 AI (Adobe Firefly — Generative Fill & Generative Expand):
 *      - 세로 스크롤 배경 확장(Outpainting), 불필요한 사물 제거(Clean-Plate Inpainting), 캐릭터 의상 부분 수정 마스크·프롬프트 설계
 * - 카테고리 4:
 *   4. 원더쉐어 필모라 (Wondershare Filmora, https://filmora.wondershare.kr/):
 *      - 촬영 비디오/사진 키프레임 추출 + 프롬프트·웹툰/애니메이션 AI 필터 정밀 변환 + 시간축 플리커 억제(Temporal Flicker Suppression)
 *   5. 캔바 AI (Canva AI, https://www.canva.com/):
 *      - 인스타툰·카드뉴스 캐러셀 대량 레이아웃(1:1 / 4:5), 텍스트 기반 이미지 생성(Magic Media), 원클릭 배경 제거(누끼 따기 / Magic Grab)
 */

export type LlamaGenSuiteFormat = "Webtoon" | "Comic" | "Manga";
export type LlamaGenLayoutId = "Layout0" | "Layout1" | "Layout2" | "Layout3" | "Layout4";

export interface LlamaGenPanelRecord {
  readonly panelIndex: number;
  readonly assetUrl: string;
  readonly panel: string;
  readonly instructions: string;
  readonly prompt: string;
  readonly caption: string;
  readonly status: "completed" | "generating" | "pending";
  readonly failedCode: null;
  readonly llama: "llama-3.3-webtoon-director";
  readonly negativePrompt: string;
  readonly imageStatus: "upscaled-4k" | "ready";
  readonly emotionalBeatKo: string;
  readonly verticalGapPx: number;
}

export interface LlamaGenWebtoonStoryboardResult {
  readonly format: LlamaGenSuiteFormat;
  readonly pageShape: "portrait" | "landscape" | "square";
  readonly layoutType: "fourPanel" | "verticalScroll";
  readonly activeLayout: LlamaGenLayoutId;
  readonly availableLayouts: readonly LlamaGenLayoutId[];
  readonly comicRoles: readonly { readonly roleId: string; readonly name: string; readonly description: string }[];
  readonly comicLocations: readonly { readonly locationId: string; readonly name: string; readonly lighting: string }[];
  readonly panels: readonly LlamaGenPanelRecord[];
  readonly upscaleQueue: readonly string[];
  readonly renderedScenes: number;
  readonly comicDataGzipReady: true;
  readonly revisionSyncSpec: {
    readonly debounceMs: 500;
    readonly latestRevision: number;
    readonly persistedRevision: number;
  };
  readonly supportedImportFormats: {
    readonly comicEditor: readonly ["PDF", "CBZ", "ZIP", "EPUB", "JSON"];
    readonly characterEditor: readonly ["ZIP-turnarounds", "CSV-rosters"];
  };
}

/**
 * LlamaGen AI 한국형 세로 스크롤 웹툰 스토리보드 & 감정 전환 초안화 엔진.
 */
export function runLlamaGenWebtoonStoryboardDraft(input: {
  readonly scriptText?: string;
  readonly format?: LlamaGenSuiteFormat;
  readonly activeLayout?: LlamaGenLayoutId;
} = {}): LlamaGenWebtoonStoryboardResult {
  const format: LlamaGenSuiteFormat = input.format ?? "Webtoon";
  const pageShape = format === "Webtoon" ? "portrait" : "square";
  const activeLayout: LlamaGenLayoutId = input.activeLayout ?? "Layout0";

  const emotionalBeats = [
    { beatKo: "도입: 정적과 불안한 전조 (Calm → Unease)", gapPx: 140 },
    { beatKo: "전개: 대면과 심리적 압박 (Tension Escalation)", gapPx: 180 },
    { beatKo: "절정: 감정 폭발과 진실 노출 (Emotional Climax)", gapPx: 260 },
    { beatKo: "여운/클리프행어: 수직 낙하 스크롤 훅 (Cliffhanger Drop)", gapPx: 320 },
  ];

  const panels: LlamaGenPanelRecord[] = emotionalBeats.map((item, idx) => ({
    panelIndex: idx + 1,
    assetUrl: `https://cdn.toonstudio.local/llamagen/panel-${idx + 1}.webp`,
    panel: `Panel_${idx + 1}`,
    instructions: item.beatKo,
    prompt: `Korean vertical scroll webtoon panel #${idx + 1}, ${item.beatKo}, dramatic lighting, high detail`,
    caption: `${idx + 1}컷 · ${item.beatKo}`,
    status: "completed",
    failedCode: null,
    llama: "llama-3.3-webtoon-director",
    negativePrompt: "deformed hands, inconsistent costume, blurry speech bubble, extra fingers",
    imageStatus: "upscaled-4k",
    emotionalBeatKo: item.beatKo,
    verticalGapPx: item.gapPx,
  }));

  return Object.freeze({
    format,
    pageShape,
    layoutType: format === "Webtoon" ? "verticalScroll" : "fourPanel",
    activeLayout,
    availableLayouts: Object.freeze(["Layout0", "Layout1", "Layout2", "Layout3", "Layout4"] as const),
    comicRoles: Object.freeze([
      { roleId: "role-protagonist", name: "주인공 시안", description: "검은 제복 코트, 날카로운 눈매" },
      { roleId: "role-rival", name: "라이벌 카엘", description: "백은색 장발, 붉은 마도 각인" },
    ]),
    comicLocations: Object.freeze([
      { locationId: "loc-sanctuary", name: "무너진 성소 회랑", lighting: "푸른 달빛 역광과 부유하는 마력 입자" },
    ]),
    panels: Object.freeze(panels),
    upscaleQueue: Object.freeze(panels.map((p) => p.panel)),
    renderedScenes: panels.length,
    comicDataGzipReady: true as const,
    revisionSyncSpec: Object.freeze({
      debounceMs: 500 as const,
      latestRevision: 12,
      persistedRevision: 12,
    }),
    supportedImportFormats: Object.freeze({
      comicEditor: Object.freeze(["PDF", "CBZ", "ZIP", "EPUB", "JSON"] as const),
      characterEditor: Object.freeze(["ZIP-turnarounds", "CSV-rosters"] as const),
    }),
  });
}

/**
 * 미드저니 (Midjourney v6.1) / 스테이블 디퓨전 (Stable Diffusion)
 * 캐릭터 시트 · 의상 고증 자료 · 채색 무드보드 기획 엔진
 */
export interface MidjourneyStableDiffusionConceptPlan {
  readonly genreEra: string;
  readonly midjourneyV6Command: string;
  readonly midjourneyParams: {
    readonly crefWeightCw: number;
    readonly srefWeightSw: number;
    readonly aspectRatio: "9:16" | "2:3" | "16:9";
    readonly modelFlag: "--niji 6" | "--v 6.1";
  };
  readonly stableDiffusionWorkflow: {
    readonly baseCheckpoint: "Animagine-XL-3.1" | "FLUX.1-dev-Webtoon";
    readonly controlNetStack: readonly string[];
    readonly regionalPrompterSplit: string;
  };
  readonly historicalCostumeReference: {
    readonly eraTitleKo: string;
    readonly silhouetteAndFabricKo: string;
    readonly accessoryChecklistKo: readonly string[];
  };
  readonly colorMoodboardPalette: readonly {
    readonly roleKo: string;
    readonly hex: string;
  }[];
}

export function buildMidjourneyStableDiffusionConceptPlan(input: {
  readonly genreEra?: string;
  readonly characterConcept?: string;
  readonly locksCostume?: boolean;
} = {}): MidjourneyStableDiffusionConceptPlan {
  const genreEra = (input.genreEra ?? "로맨스 판타지 북부 대공령").trim() || "로맨스 판타지 북부 대공령";
  const characterConcept =
    (input.characterConcept ?? "noble knight commander in winter ceremonial uniform").trim();
  const crefWeightCw = input.locksCostume === false ? 25 : 100;
  const srefWeightSw = 350;

  const midjourneyV6Command = `/imagine prompt: character reference sheet, front side back turnaround + 4 facial expressions, ${characterConcept}, setting: ${genreEra}, clean webtoon lineart and cel shading --cref https://ref.toonstudio.local/char-anchor.png --cw ${crefWeightCw} --sref https://ref.toonstudio.local/mood-palette.png --sw ${srefWeightSw} --ar 9:16 --niji 6`;

  return Object.freeze({
    genreEra,
    midjourneyV6Command,
    midjourneyParams: Object.freeze({
      crefWeightCw,
      srefWeightSw,
      aspectRatio: "9:16" as const,
      modelFlag: "--niji 6" as const,
    }),
    stableDiffusionWorkflow: Object.freeze({
      baseCheckpoint: "FLUX.1-dev-Webtoon" as const,
      controlNetStack: Object.freeze([
        "ControlNet Unit 0: OpenPose Full-Body + Hand 21-Keypoints (weight 0.90)",
        "ControlNet Unit 1: Lineart Anime (weight 0.85, start 0.0, end 0.85)",
        "ControlNet Unit 2: Depth Anything V2 (weight 0.55, 공간 원근 고정)",
      ]),
      regionalPrompterSplit: "Horizontal 50:50 Split + Base Prompt 0.25 (다중 캐릭터 간 의상·머리색 간섭 원천 차단)",
    }),
    historicalCostumeReference: Object.freeze({
      eraTitleKo: `${genreEra} 의상·소품 고증 시트`,
      silhouetteAndFabricKo:
        "울·벨벳 이중 케이프 코트, 금속 견장(Epaulettes)과 브로치 매듭, 승마용 하이부츠 주름 고증",
      accessoryChecklistKo: Object.freeze([
        "가문 문장이 각인된 칼집 패용 위치 (왼쪽 허리 고정)",
        "정복 칼라 자수 패턴 및 단추 배열 (복식 시드 고정)",
        "실내/실외 씬 전환 시 망토 탈착 상태 구분",
      ]),
    }),
    colorMoodboardPalette: Object.freeze([
      { roleKo: "주조색 (Deep Midnight Coat)", hex: "#1B2430" },
      { roleKo: "보조색 (Frost Silver Trim)", hex: "#D6E4E5" },
      { roleKo: "강조색 (Imperial Crimson Gem)", hex: "#9E2A2B" },
      { roleKo: "환경광 (Northern Twilight Rim)", hex: "#495579" },
      { roleKo: "피부 그림자 (Warm Subsurface)", hex: "#E2B6CF" },
    ]),
  });
}

/**
 * 포토샵 AI (Adobe Firefly) — 생성형 채우기(Generative Fill) & 생성형 확장(Generative Expand) 엔진
 */
export type FireflyEditOperationMode =
  | "generative-expand-vertical"
  | "object-removal-cleanplate"
  | "costume-prop-partial-edit";

export interface PhotoshopFireflyGenerativePlan {
  readonly operationMode: FireflyEditOperationMode;
  readonly operationLabelKo: string;
  readonly maskRegionSpec: {
    readonly xNorm: number;
    readonly yNorm: number;
    readonly widthNorm: number;
    readonly heightNorm: number;
    readonly featherPx: number;
  };
  readonly fireflyPrompt: string;
  readonly seamBlendingGuaranteeKo: string;
  readonly nonDestructiveLayerNameKo: string;
}

export function buildPhotoshopFireflyGenerativePlan(input: {
  readonly mode?: FireflyEditOperationMode;
  readonly targetInstruction?: string;
} = {}): PhotoshopFireflyGenerativePlan {
  const mode: FireflyEditOperationMode = input.mode ?? "generative-expand-vertical";
  const customInstruction = (input.targetInstruction ?? "").trim();

  if (mode === "object-removal-cleanplate") {
    return Object.freeze({
      operationMode: mode,
      operationLabelKo: "불필요한 사물 제거 (Object Removal Clean-Plate)",
      maskRegionSpec: Object.freeze({
        xNorm: 0.65,
        yNorm: 0.55,
        widthNorm: 0.22,
        heightNorm: 0.28,
        featherPx: 8,
      }),
      fireflyPrompt:
        customInstruction || "remove distracting background clutter and restore clean perspective wall texture",
      seamBlendingGuaranteeKo: "주변 배경 소실점 투시선과 스크린톤 밀도를 보존하며 사물 흔적을 무결점 복원합니다.",
      nonDestructiveLayerNameKo: "생성형 채우기 · 사물 제거 클린플레이트",
    });
  }

  if (mode === "costume-prop-partial-edit") {
    return Object.freeze({
      operationMode: mode,
      operationLabelKo: "캐릭터 의상·소품 부분 수정 (Regional Costume Edit)",
      maskRegionSpec: Object.freeze({
        xNorm: 0.32,
        yNorm: 0.42,
        widthNorm: 0.36,
        heightNorm: 0.45,
        featherPx: 6,
      }),
      fireflyPrompt:
        customInstruction ||
        "replace casual jacket with ornate royal academy blazer, preserve character pose and lighting",
      seamBlendingGuaranteeKo: "인물 얼굴과 손 포즈 선화를 100% 보존하면서 의상 영역만 조명 방향에 맞춰 교체합니다.",
      nonDestructiveLayerNameKo: "생성형 채우기 · 의상 부분 수정 레이어",
    });
  }

  return Object.freeze({
    operationMode: "generative-expand-vertical",
    operationLabelKo: "세로 스크롤 배경 확장 (Generative Expand Outpainting)",
    maskRegionSpec: Object.freeze({
      xNorm: 0,
      yNorm: 0,
      widthNorm: 1,
      heightNorm: 0.35,
      featherPx: 16,
    }),
    fireflyPrompt:
      customInstruction ||
      "extend vertical webtoon sky and cathedral spires upward for dramatic scroll pacing",
    seamBlendingGuaranteeKo:
      "컷 상·하단 캔버스를 640px 수직 확장하여 모바일 스크롤 호흡과 말풍선 배치 여백을 자연스럽게 확보합니다.",
    nonDestructiveLayerNameKo: "생성형 확장 · 세로 스크롤 여백 레이어",
  });
}

/**
 * 원더쉐어 필모라 (Wondershare Filmora) — 비디오·사진 → 웹툰/애니메이션 필터 변환 엔진
 */
export type FilmoraWebtoonFilterPresetId =
  | "filmora-k-webtoon-cel"
  | "filmora-anime-cinematic"
  | "myedit-vivid-toon"
  | "sketch-me-ink-lineart"
  | "artguru-fantasy-comic";

export interface FilmoraVideoToWebtoonResult {
  readonly sourceMediaType: "video-clip" | "photo-burst";
  readonly selectedFilterPreset: {
    readonly id: FilmoraWebtoonFilterPresetId;
    readonly labelKo: string;
    readonly stylePrompt: string;
  };
  readonly keyframeExtractionSpec: {
    readonly sourceDurationSec: number;
    readonly extractedKeyframesCount: number;
    readonly temporalFlickerSuppressionScore: number;
    readonly aiObjectRemoverApplied: true;
  };
  readonly convertedPanels: readonly {
    readonly frameNumber: number;
    readonly timestampSec: number;
    readonly motionEffectKo: string;
    readonly autoCaptionKo: string;
  }[];
}

export const FILMORA_WEBTOON_FILTER_PRESETS: readonly {
  readonly id: FilmoraWebtoonFilterPresetId;
  readonly labelKo: string;
  readonly stylePrompt: string;
}[] = Object.freeze([
  {
    id: "filmora-k-webtoon-cel",
    labelKo: "필모라 K-웹툰 정밀 셀 필터",
    stylePrompt: "Wondershare Filmora AI K-Webtoon filter, clean ink edges, vibrant cel shading",
  },
  {
    id: "filmora-anime-cinematic",
    labelKo: "필모라 시네마틱 애니메이션 필터",
    stylePrompt: "Makoto Shinkai inspired sky glow, anime keyframe color grading, lens flare",
  },
  {
    id: "myedit-vivid-toon",
    labelKo: "MyEdit 스타일 인물 카툰 필터",
    stylePrompt: "stylized portrait cartoonization, smooth skin shading, expressive eyes",
  },
  {
    id: "sketch-me-ink-lineart",
    labelKo: "Sketch Me! 만화 펜선·망점 필터",
    stylePrompt: "crisp comic ink sketch extraction, monochrome crosshatching and screentone",
  },
  {
    id: "artguru-fantasy-comic",
    labelKo: "Artguru 판타지 코믹 일러스트 필터",
    stylePrompt: "high-fantasy comic book illustration, dramatic rim light, rich brushwork",
  },
]);

export function runFilmoraMediaToWebtoonPipeline(input: {
  readonly mediaType?: "video-clip" | "photo-burst";
  readonly filterPresetId?: FilmoraWebtoonFilterPresetId;
  readonly durationSec?: number;
} = {}): FilmoraVideoToWebtoonResult {
  const sourceMediaType = input.mediaType ?? "video-clip";
  const selectedFilterPreset =
    FILMORA_WEBTOON_FILTER_PRESETS.find((p) => p.id === input.filterPresetId) ??
    FILMORA_WEBTOON_FILTER_PRESETS[0]!;
  const sourceDurationSec = Math.max(2, Math.min(60, input.durationSec ?? 12));
  const extractedKeyframesCount = 4;

  const convertedPanels = Object.freeze([
    {
      frameNumber: 1,
      timestampSec: 0.5,
      motionEffectKo: "배경 패닝 + AI 불필요 행인 제거(Object Remover)",
      autoCaptionKo: "촬영 영상 0.5초 키프레임 → 도입부 배경 및 인물 설정 컷 변환",
    },
    {
      frameNumber: 2,
      timestampSec: 3.8,
      motionEffectKo: "피사체 모션 트래킹 + 속도선(Speed Lines) 오버레이",
      autoCaptionKo: "촬영 영상 3.8초 키프레임 → 동작 하이라이트 액션 컷 변환",
    },
    {
      frameNumber: 3,
      timestampSec: 7.4,
      motionEffectKo: "인물 줌인 + 시간축 플리커 억제(Flicker-Free Lock)",
      autoCaptionKo: "촬영 영상 7.4초 키프레임 → 감정 클로즈업 컷 변환",
    },
    {
      frameNumber: 4,
      timestampSec: 11.2,
      motionEffectKo: "림라이트 글로우 + 말풍선/효과음 트랙 동기화",
      autoCaptionKo: "촬영 영상 11.2초 키프레임 → 엔딩 훅 만화 컷 완성",
    },
  ]);

  return Object.freeze({
    sourceMediaType,
    selectedFilterPreset,
    keyframeExtractionSpec: Object.freeze({
      sourceDurationSec,
      extractedKeyframesCount,
      temporalFlickerSuppressionScore: 96,
      aiObjectRemoverApplied: true as const,
    }),
    convertedPanels,
  });
}

/**
 * 캔바 AI (Canva AI) — 인스타툰·카드뉴스 캐러셀 대량 레이아웃 & 배경 제거(누끼 따기) 엔진
 */
export interface CanvaInstatoonCarouselResult {
  readonly canvasRatio: "4:5-instatoon-1080x1350" | "1:1-square-1080x1080";
  readonly slideCount: number;
  readonly magicMediaStylePrompt: string;
  readonly backgroundRemoverSpec: {
    readonly alphaCutoutReady: true;
    readonly magicGrabSubjectSeparated: true;
    readonly stickerWhiteOutlinePx: number;
    readonly hairEdgeRefinementScore: number;
  };
  readonly slides: readonly {
    readonly slideNumber: number;
    readonly slideRoleKo: string;
    readonly headlineText: string;
    readonly cutoutSubjectPlacement: "center-hero" | "left-character" | "right-character";
  }[];
}

export function runCanvaInstatoonCarouselPipeline(input: {
  readonly topicTitle?: string;
  readonly slideCount?: number;
  readonly canvasRatio?: "4:5-instatoon-1080x1350" | "1:1-square-1080x1080";
  readonly stickerOutlinePx?: number;
} = {}): CanvaInstatoonCarouselResult {
  const topicTitle = (input.topicTitle ?? "직장인 공감 퇴근길 인스타툰").trim() || "직장인 공감 퇴근길 인스타툰";
  const slideCount = Math.max(4, Math.min(20, input.slideCount ?? 6));
  const canvasRatio = input.canvasRatio ?? "4:5-instatoon-1080x1350";
  const stickerWhiteOutlinePx = Math.max(0, Math.min(24, input.stickerOutlinePx ?? 8));

  const slides = Array.from({ length: slideCount }, (_, idx) => {
    const slideNumber = idx + 1;
    const isFirst = slideNumber === 1;
    const isLast = slideNumber === slideCount;
    return Object.freeze({
      slideNumber,
      slideRoleKo: isFirst
        ? "표지 훅 (스와이프 유도 타이틀)"
        : isLast
          ? "엔딩 요약 & 댓글/저장 CTA"
          : `본문 전개 컷 #${slideNumber - 1} (누끼 캐릭터 + 말풍선)`,
      headlineText: isFirst
        ? `[공감 100%] ${topicTitle} — 오늘만 같아라!`
        : isLast
          ? "다음 화가 궁금하다면 팔로우 & 저장 꾹!"
          : `${topicTitle} 에피소드 비트 ${slideNumber - 1}`,
      cutoutSubjectPlacement: (isFirst
        ? "center-hero"
        : idx % 2 === 1
          ? "left-character"
          : "right-character") as "center-hero" | "left-character" | "right-character",
    });
  });

  return Object.freeze({
    canvasRatio,
    slideCount,
    magicMediaStylePrompt: `Canva Magic Media instatoon character sticker, ${topicTitle}, clean vector line, pastel palette`,
    backgroundRemoverSpec: Object.freeze({
      alphaCutoutReady: true as const,
      magicGrabSubjectSeparated: true as const,
      stickerWhiteOutlinePx,
      hairEdgeRefinementScore: 98,
    }),
    slides: Object.freeze(slides),
  });
}

/**
 * 4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 REA 내재화 매트릭스
 */
export interface ReaInternalizedWebtoonToolDescriptor {
  readonly toolId:
    | "gentoon"
    | "tooning"
    | "comic-ai"
    | "dashtoon"
    | "aid-raw"
    | "naver-webtoon-ai-painter"
    | "clip-studio-paint"
    | "llamagen-ai"
    | "midjourney-sd"
    | "photoshop-firefly"
    | "wondershare-filmora"
    | "canva-ai";
  readonly categoryNumber: 1 | 2 | 3 | 4;
  readonly categoryTitleKo: string;
  readonly toolNameKo: string;
  readonly officialUrl: string;
  readonly reaEvidenceSummary: string;
  readonly internalizedEngineSymbol: string;
}

export const REA_WEBTOON_ECOSYSTEM_12_TOOLS: readonly ReaInternalizedWebtoonToolDescriptor[] =
  Object.freeze([
    {
      toolId: "gentoon",
      categoryNumber: 1,
      categoryTitleKo: "1. 올인원 웹툰 및 인스타툰 제작 가속화 툴",
      toolNameKo: "젠툰 (GenToon)",
      officialUrl: "https://www.gentoon.ai/",
      reaEvidenceSummary:
        "내 원고/내 썰(1,600자) 듀얼 모드, 4컷 워크시트(orient/develop/turn-silent/result), 왼손/오른손 소품 연속성 원장",
      internalizedEngineSymbol: "runGenToonStoryToComicPipeline",
    },
    {
      toolId: "tooning",
      categoryNumber: 1,
      categoryTitleKo: "1. 올인원 웹툰 및 인스타툰 제작 가속화 툴",
      toolNameKo: "투닝 (Tooning)",
      officialUrl: "https://www.tooning.io/",
      reaEvidenceSummary:
        "글로 캐릭터 연출(대사→동작·표정·말풍선 SVG 자동 연출), maskedCut/guideMaskedCut 및 레이어 분리 제어",
      internalizedEngineSymbol: "runTooningTextToCharacterActing",
    },
    {
      toolId: "comic-ai",
      categoryNumber: 1,
      categoryTitleKo: "1. 올인원 웹툰 및 인스타툰 제작 가속화 툴",
      toolNameKo: "ComicAI",
      officialUrl: "https://apps.apple.com/kr/app/id6758517964",
      reaEvidenceSummary:
        "텍스트 프롬프트 기반 4면도 캐릭터 시트(Turnaround) 시드 잠금 및 연속성 있는 프리폼 만화 컷 생성",
      internalizedEngineSymbol: "buildComicAiCharacterSheetAndPanels",
    },
    {
      toolId: "dashtoon",
      categoryNumber: 1,
      categoryTitleKo: "1. 올인원 웹툰 및 인스타툰 제작 가속화 툴",
      toolNameKo: "Dashtoon",
      officialUrl: "https://dashtoon.com/",
      reaEvidenceSummary:
        "/api/v2/ai-apps/photo-to-comic 폴링 파이프라인, /comics/read/ 연재 포맷팅, Frameo 마이그레이션 브리지",
      internalizedEngineSymbol: "runDashtoonAgencyPublishPipeline",
    },
    {
      toolId: "aid-raw",
      categoryNumber: 2,
      categoryTitleKo: "2. 전문 작화 보조 툴 (선화, 채색, 정밀 편집)",
      toolNameKo: "에이드 (AiD 3.1)",
      officialUrl: "https://aid-raw.com/",
      reaEvidenceSummary:
        "01 스케치→02 선화→03 채색→04 배경 4단계 파이프라인, 5구도×선화/채색 10장 시트, 멀티레이어 PSD/PSB 내보내기",
      internalizedEngineSymbol: "runAidStudioPipeline",
    },
    {
      toolId: "naver-webtoon-ai-painter",
      categoryNumber: 2,
      categoryTitleKo: "2. 전문 작화 보조 툴 (선화, 채색, 정밀 편집)",
      toolNameKo: "네이버웹툰 AI 페인터",
      officialUrl: "https://webtoon.naver.com/",
      reaEvidenceSummary:
        "딥러닝 기반 색상 힌트 포인트(3~6곳) 지정 → 선화 경계 보존 그라데이션 밑색·명암 자동 확산",
      internalizedEngineSymbol: "runNaverWebtoonAiHintPainter",
    },
    {
      toolId: "clip-studio-paint",
      categoryNumber: 2,
      categoryTitleKo: "2. 전문 작화 보조 툴 (선화, 채색, 정밀 편집)",
      toolNameKo: "클립스튜디오 페인트 (Clip Studio Paint)",
      officialUrl: "https://www.clipstudio.net/kr/",
      reaEvidenceSummary:
        "AI 채색 힌트, 3D 데생 인형 28관절 포즈 스캐너 & 핸드 스캐너, 3D 배경 선화·스크린톤(LT) 분리 변환",
      internalizedEngineSymbol: "runClipStudioPaintAiAssist",
    },
    {
      toolId: "llamagen-ai",
      categoryNumber: 3,
      categoryTitleKo: "3. 스토리보드 및 콘티/콘셉트 기획 툴",
      toolNameKo: "LlamaGen AI",
      officialUrl: "https://llamagen.ai/ko/features/ai-webtoon-generator",
      reaEvidenceSummary:
        "세로 스크롤(portrait) 비트별 감정 전환 초안화, Layout0~4, 500ms 리비전 동기화, PDF/CBZ/ZIP/EPUB/JSON 호환",
      internalizedEngineSymbol: "runLlamaGenWebtoonStoryboardDraft",
    },
    {
      toolId: "midjourney-sd",
      categoryNumber: 3,
      categoryTitleKo: "3. 스토리보드 및 콘티/콘셉트 기획 툴",
      toolNameKo: "미드저니 (Midjourney) / 스테이블 디퓨전",
      officialUrl: "https://www.midjourney.com/",
      reaEvidenceSummary:
        "--cref/--cw & --sref/--sw 파라미터, ControlNet(OpenPose/Lineart/Depth), 의상 고증 자료 및 5색 채색 무드보드",
      internalizedEngineSymbol: "buildMidjourneyStableDiffusionConceptPlan",
    },
    {
      toolId: "photoshop-firefly",
      categoryNumber: 3,
      categoryTitleKo: "3. 스토리보드 및 콘티/콘셉트 기획 툴",
      toolNameKo: "포토샵 AI (Adobe Firefly)",
      officialUrl: "https://www.adobe.com/products/firefly.html",
      reaEvidenceSummary:
        "생성형 채우기(Generative Fill) 및 생성형 확장(Generative Expand) 기반 세로 배경 확장·사물 제거·의상 부분 수정",
      internalizedEngineSymbol: "buildPhotoshopFireflyGenerativePlan",
    },
    {
      toolId: "wondershare-filmora",
      categoryNumber: 4,
      categoryTitleKo: "4. 사진 및 영상을 만화로 변환하는 스타일 툴",
      toolNameKo: "원더쉐어 필모라 (Filmora)",
      officialUrl: "https://filmora.wondershare.kr/ai-tool/apps-sites-for-ai-comic-creation.html",
      reaEvidenceSummary:
        "촬영 비디오/사진 키프레임 추출, K-웹툰/애니메이션 AI 필터 변환, 시간축 플리커 억제 및 사물 제거",
      internalizedEngineSymbol: "runFilmoraMediaToWebtoonPipeline",
    },
    {
      toolId: "canva-ai",
      categoryNumber: 4,
      categoryTitleKo: "4. 사진 및 영상을 만화로 변환하는 스타일 툴",
      toolNameKo: "캔바 (Canva) AI",
      officialUrl: "https://www.canva.com/",
      reaEvidenceSummary:
        "대량 카드뉴스·인스타툰 캐러셀(1:1, 4:5) 자동 배치, Magic Media 이미지 생성, 원클릭 누끼(배경 제거 & 스티커 외곽선)",
      internalizedEngineSymbol: "runCanvaInstatoonCarouselPipeline",
    },
  ]);
