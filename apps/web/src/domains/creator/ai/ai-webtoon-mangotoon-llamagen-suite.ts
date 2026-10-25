/**
 * ai-webtoon-mangotoon-llamagen-suite.ts
 *
 * AI 만화·인스타툰 플랫폼 내재화 엔진 (파트 2):
 * - 망고툰 (Mangotoon, https://toon.mangoboard.net/) 7대 라이브러리 탭·표정×동작 매트릭스·createContentData 스키마
 * - 라마젠 (LlamaGen AI, https://llamagen.ai/ko/features/ai-webtoon-generator) 황금비(1.618) 세로 스트립 & ComicV2 연속성 시퀀스
 * - 투닝 (Tooning, https://tooning.io/) 문장 기반 표정·포즈·배경·말풍선 자동 추천기
 */

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ============================================================================
// 2. 망고툰 (Mangotoon) 클릭·드래그 에셋 라이브러리 및 필터·블러 스키마 엔진
// ============================================================================

export type MangotoonLibraryTabId =
  | "page"
  | "title"
  | "cut"
  | "background"
  | "character"
  | "horizontal"
  | "vertical";

export type MangotoonPageCategoryId = "meme" | "layout" | "card" | "cartoon" | "webtoon";
export type MangotoonTitleCategoryId = "title" | "designText" | "soundEffect" | "textIcon";
export type MangotoonCharacterGenderBadge = "여" | "남" | "동물";

export interface MangotoonLibraryTabSpec {
  readonly id: MangotoonLibraryTabId;
  readonly label: string;
  readonly masonryColumnWidthPx: number;
  readonly description: string;
}

/**
 * 망고툰 `library.js` (`ev_50a74315bd20ceab9a71239725e1f15c2985664d06adc38ea46613baa56e9a33`)에서
 * 확인된 7개 라이브러리 탭 및 Masonry 컬럼 너비(px).
 */
export const MANGOTOON_LIBRARY_TABS: readonly MangotoonLibraryTabSpec[] = [
  {
    id: "page",
    label: "페이지 템플릿",
    masonryColumnWidthPx: 302,
    description: "밈·짤(meme), 레이아웃(layout), 카드형(card), 만화형(cartoon), 웹툰형(webtoon) 템플릿",
  },
  {
    id: "title",
    label: "타이틀·효과음",
    masonryColumnWidthPx: 272,
    description: "제목(title), 디자인텍스트(designText), 효과음(soundEffect), 텍스티콘(textIcon)",
  },
  {
    id: "cut",
    label: "컷 프레임",
    masonryColumnWidthPx: 272,
    description: "클릭·드래그 즉시 배치형 만화 컷 프레임 프리셋",
  },
  {
    id: "background",
    label: "배경 일러스트",
    masonryColumnWidthPx: 324,
    description: "일상·학교·오피스·홍보·교육 컷툰 배경 리소스",
  },
  {
    id: "character",
    label: "캐릭터 (표정×동작)",
    masonryColumnWidthPx: 420,
    description: "연령대·성별(여/남/동물) 배지 및 표정(headCount) × 포즈(bodyCount) 조합형 캐릭터",
  },
  {
    id: "horizontal",
    label: "가로 애니메이션 (16:9)",
    masonryColumnWidthPx: 330,
    description: "AI 보이스(TTS) 포함 여부 및 재생시간 배지가 포함된 16:9 모션 템플릿",
  },
  {
    id: "vertical",
    label: "세로 애니메이션 (9:16)",
    masonryColumnWidthPx: 270,
    description: "릴스·쇼츠용 AI 보이스(TTS) 및 모션 컷툰 9:16 세로형 템플릿",
  },
] as const;

export interface MangotoonCharacterAssetPreset {
  readonly id: string;
  readonly name: string;
  readonly ageGroup: string;
  readonly gender: MangotoonCharacterGenderBadge;
  readonly headCount: number; // 표정 개수
  readonly bodyCount: number; // 동작 포즈 개수
  readonly recommendedUseCase: string;
}

export const MANGOTOON_CHARACTER_PRESETS: readonly MangotoonCharacterAssetPreset[] = [
  {
    id: "mg-char-office-female",
    name: "직장인 김대리",
    ageGroup: "20~30대",
    gender: "여",
    headCount: 24,
    bodyCount: 32,
    recommendedUseCase: "홍보·사내 교육·오피스 인스타툰",
  },
  {
    id: "mg-char-student-male",
    name: "고등학생 한결",
    ageGroup: "10대",
    gender: "남",
    headCount: 20,
    bodyCount: 28,
    recommendedUseCase: "학교폭력 예방·공공 캠페인·학원물 컷툰",
  },
  {
    id: "mg-char-mascot-cat",
    name: "치즈냥이 마스코트",
    ageGroup: "전연령",
    gender: "동물",
    headCount: 18,
    bodyCount: 22,
    recommendedUseCase: "일상 공감 4컷 인스타툰·브랜드 밈·짤",
  },
] as const;

export interface MangotoonPictureFilterState {
  readonly brightness: number;
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly definition: number;
  readonly vignette: number;
  readonly hue: number;
}

export interface MangotoonPictureContentData {
  readonly id: string;
  readonly type: "picture" | "svg" | "group" | "cut";
  readonly subtype: string;
  readonly src: string;
  readonly orgWidth: number;
  readonly orgHeight: number;
  readonly width: number;
  readonly height: number;
  readonly interactWithCharacter?: boolean;
  readonly filter?: MangotoonPictureFilterState;
  readonly blend?: {
    readonly blend: "normal" | "multiply" | "screen" | "overlay";
    readonly colors: readonly [string, string, string];
    readonly opacity: number;
  };
  readonly blurEdge?: {
    readonly directions: readonly [
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
    ];
    readonly range: number;
  };
}

/**
 * 망고툰 `library.js`의 `createContentData` 함수를 클린룸 재구현한 에셋 페이로드 생성기.
 * `maxEdge = 400` 기준 종횡비 리사이즈 및 7파라미터 필터·9방향 blurEdge 초기 상태를 생성한다.
 */
export function createMangotoonContentPayload(params: {
  readonly id: string;
  readonly contentCategory: "cut" | "title" | "props" | "icon" | "background";
  readonly src: string;
  readonly orgWidth: number;
  readonly orgHeight: number;
  readonly interactWithCharacter?: boolean;
  readonly filterOverrides?: Partial<MangotoonPictureFilterState>;
  readonly blurEdgeRange?: number;
}): MangotoonPictureContentData {
  const safeOrgW = Math.max(1, Math.round(params.orgWidth));
  const safeOrgH = Math.max(1, Math.round(params.orgHeight));
  const maxEdge = 400;
  const width =
    safeOrgW >= safeOrgH ? maxEdge : Math.max(1, Math.round((maxEdge * safeOrgW) / safeOrgH));
  const height =
    safeOrgH >= safeOrgW ? maxEdge : Math.max(1, Math.round((maxEdge * safeOrgH) / safeOrgW));

  if (params.contentCategory === "cut") {
    return {
      id: params.id,
      type: "cut",
      subtype: "cut",
      src: params.src,
      orgWidth: safeOrgW,
      orgHeight: safeOrgH,
      width,
      height,
    };
  }

  if (params.contentCategory === "title") {
    return {
      id: params.id,
      type: "group",
      subtype: "title",
      src: params.src.replace(/\.[a-z0-9]+$/iu, ".txt"),
      orgWidth: safeOrgW,
      orgHeight: safeOrgH,
      width,
      height,
    };
  }

  if (params.contentCategory === "props" || params.contentCategory === "icon") {
    return {
      id: params.id,
      type: "svg",
      subtype: params.contentCategory,
      src: params.src,
      orgWidth: safeOrgW,
      orgHeight: safeOrgH,
      width,
      height,
      interactWithCharacter:
        params.contentCategory === "props" ? Boolean(params.interactWithCharacter) : false,
    };
  }

  return {
    id: params.id,
    type: "picture",
    subtype: "background",
    src: params.src,
    orgWidth: safeOrgW,
    orgHeight: safeOrgH,
    width,
    height,
    filter: {
      brightness: params.filterOverrides?.brightness ?? 0,
      exposure: params.filterOverrides?.exposure ?? 0,
      contrast: params.filterOverrides?.contrast ?? 0,
      saturation: params.filterOverrides?.saturation ?? 0,
      definition: params.filterOverrides?.definition ?? 0,
      vignette: params.filterOverrides?.vignette ?? 0,
      hue: params.filterOverrides?.hue ?? 0,
    },
    blend: {
      blend: "normal",
      colors: ["#ffffff", "#ffffff", "#ffffff"],
      opacity: 0.3,
    },
    blurEdge: {
      directions: [false, false, false, false, false, false, false, false, false],
      range: clampRange(params.blurEdgeRange ?? 50, 0, 100),
    },
  };
}

// ============================================================================
// 3. 라마젠 (LlamaGen AI) 황금비(1.618) 세로 웹툰 스트립 & ComicV2 연속성 엔진
// ============================================================================

export type LlamaGenLayoutModeId =
  | "vertical-golden-webtoon"
  | "smart-comic-grid"
  | "smart-wide-panel-strip"
  | "three-panel"
  | "four-panel";

export interface LlamaGenPathVertex {
  readonly lineStyle: "begin" | "solid";
  readonly color: string;
  readonly lineType: "straight";
  readonly point: { readonly x: number; readonly y: number };
}

export interface LlamaGenPanelGeometry {
  readonly panelIndex: number;
  readonly type: "rect";
  readonly topLeft: { readonly x: number; readonly y: number };
  readonly bottomRight: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly paths: readonly [
    LlamaGenPathVertex,
    LlamaGenPathVertex,
    LlamaGenPathVertex,
    LlamaGenPathVertex,
  ];
}

export interface LlamaGenComicV2PanelSpec {
  readonly panel: number;
  readonly assetUrl: string;
  readonly instructions: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly caption: string;
  readonly status: "ready" | "generating" | "completed";
  readonly failedCode: 0;
  readonly llama: string;
  readonly geometry: LlamaGenPanelGeometry;
}

export interface LlamaGenComicV2EpisodeSequence {
  readonly artworkId: string;
  readonly seriesTitle: string;
  readonly episodeTitle: string;
  readonly layoutMode: LlamaGenLayoutModeId;
  readonly preset: string;
  readonly goldenRatioConstant: 1.618;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly comicRoles: readonly string[];
  readonly comicLocations: readonly string[];
  readonly checkpoint: {
    readonly latestRevision: number;
    readonly persistedRevision: number;
    readonly completedPanels: number;
    readonly reviewedPanels: number;
    readonly totalPanels: number;
  };
  readonly panels: readonly LlamaGenComicV2PanelSpec[];
}

/**
 * LlamaGen AI chunk 25338(`p = function(t, e, l, i, o, y = 1.618)`)에서 역공학한
 * 황금비(`1.618`) 세로 웹툰 스트립 및 멀티패널 기하학·ComicV2 연속성 시퀀스 생성기.
 */
export function buildLlamaGenComicV2EpisodeSequence(params: {
  readonly artworkId: string;
  readonly seriesTitle: string;
  readonly episodeTitle: string;
  readonly scriptLines: readonly string[];
  readonly layoutMode?: LlamaGenLayoutModeId;
  readonly canvasWidthPx?: number;
  readonly borderPaddingPx?: number;
  readonly gutterPx?: number;
  readonly comicRoles?: readonly string[];
  readonly comicLocations?: readonly string[];
}): LlamaGenComicV2EpisodeSequence {
  const goldenRatio = 1.618 as const;
  const width = Math.max(320, Math.round(params.canvasWidthPx ?? 800));
  const border = Math.max(0, Math.round(params.borderPaddingPx ?? 16));
  const gutter = Math.max(0, Math.round(params.gutterPx ?? 24));
  const layoutMode: LlamaGenLayoutModeId = params.layoutMode ?? "vertical-golden-webtoon";

  const cleanLines = params.scriptLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const effectiveLines =
    cleanLines.length > 0
      ? cleanLines
      : [
          "1컷: 서울 도심의 비 내리는 밤거리 전경, 네온사인이 젖은 아스팔트에 반사된다.",
          "2컷: 주인공이 우산을 접으며 골목 안쪽의 비밀 공방 문을 바라본다.",
          "3컷: 공방 문이 열리며 따뜻한 호박색 조명과 함께 조력자가 등장한다.",
          "4컷: 두 사람이 마주 서서 봉인된 의뢰서를 펼치는 클로즈업 컷.",
        ];

  const panelHeight = Math.round(width / goldenRatio);
  const strideY = panelHeight + 2 * border + gutter;
  const totalHeight = Math.max(
    panelHeight + 2 * border,
    effectiveLines.length * strideY - gutter,
  );

  const roles =
    params.comicRoles && params.comicRoles.length > 0
      ? params.comicRoles
      : ["주인공(일관성 시드 고정)", "조력자(서브 캐릭터)"];
  const locations =
    params.comicLocations && params.comicLocations.length > 0
      ? params.comicLocations
      : ["네온사인 밤거리", "비밀 공방 내부"];

  const panels: LlamaGenComicV2PanelSpec[] = effectiveLines.map((line, index) => {
    const offsetY = index * strideY;
    const topLeft = { x: border / 2, y: border / 2 + offsetY };
    const topRight = { x: width - border / 2, y: border / 2 + offsetY };
    const bottomRight = { x: width - border / 2, y: panelHeight + 1.5 * border + offsetY };
    const bottomLeft = { x: border / 2, y: panelHeight + 1.5 * border + offsetY };

    const activeRole = roles[index % roles.length]!;
    const activeLocation = locations[index % locations.length]!;

    return {
      panel: index,
      assetUrl: `llamagen://comic-v2/${params.artworkId}/panel-${index + 1}`,
      instructions: `${activeRole} · ${activeLocation} 연속성 유지`,
      prompt: `[Korean Webtoon Vertical Scroll, ${activeRole}, ${activeLocation}] ${line}`,
      negativePrompt: "inconsistent face, extra fingers, deformed limbs, watermark, blurry lineart",
      caption: line,
      status: "completed",
      failedCode: 0,
      llama: "comic-v2-continuity-engine",
      geometry: {
        panelIndex: index,
        type: "rect",
        topLeft,
        bottomRight,
        width: Math.round(bottomRight.x - topLeft.x),
        height: Math.round(bottomRight.y - topLeft.y),
        paths: [
          { lineStyle: "begin", color: "#000000", lineType: "straight", point: topLeft },
          { lineStyle: "solid", color: "#000000", lineType: "straight", point: topRight },
          { lineStyle: "solid", color: "#000000", lineType: "straight", point: bottomRight },
          { lineStyle: "solid", color: "#000000", lineType: "straight", point: bottomLeft },
        ],
      },
    };
  });

  return {
    artworkId: params.artworkId,
    seriesTitle: params.seriesTitle,
    episodeTitle: params.episodeTitle,
    layoutMode,
    preset: "comicBookStyle",
    goldenRatioConstant: goldenRatio,
    canvasWidthPx: width,
    canvasHeightPx: totalHeight,
    comicRoles: roles,
    comicLocations: locations,
    checkpoint: {
      latestRevision: 1,
      persistedRevision: 1,
      completedPanels: panels.length,
      reviewedPanels: panels.length,
      totalPanels: panels.length,
    },
    panels,
  };
}

// ============================================================================
// 4. 투닝 (Tooning) 문장 기반 표정·포즈·배경 교육/홍보 컷툰 자동 추천기
// ============================================================================

export interface TooningSentenceRecommendation {
  readonly sentence: string;
  readonly recommendedEmotion: string;
  readonly recommendedPose: string;
  readonly recommendedBackground: string;
  readonly recommendedSpeechBubbleType: "일반 대화" | "강조 외침" | "속마음 구름" | "설명 내레이션";
  readonly campaignPurpose: "교육용 컷툰" | "공공·홍보 컷툰" | "브랜드 인스타툰";
}

/**
 * 투닝(Tooning) 핵심 워크플로인 '문장 입력 → 캐릭터 표정·포즈·배경·말풍선 자동 추천' 엔진.
 */
export function recommendTooningCutFromSentence(
  sentence: string,
): TooningSentenceRecommendation {
  const clean = sentence.trim() || "오늘부터 시작하는 알기 쉬운 보안 캠페인 안내입니다!";

  let recommendedEmotion = "밝은 미소 (기본)";
  let recommendedPose = "정면 안내 손짓 포즈";
  let recommendedBackground = "현대 오피스·교실 브리핑 배경";
  let recommendedSpeechBubbleType: TooningSentenceRecommendation["recommendedSpeechBubbleType"] =
    "일반 대화";
  let campaignPurpose: TooningSentenceRecommendation["campaignPurpose"] = "교육용 컷툰";

  if (/주의|위험|경고|조심|절대|긴급|!/u.test(clean)) {
    recommendedEmotion = "놀람·경계 표정";
    recommendedPose = "양손 정지·강조 제스처";
    recommendedSpeechBubbleType = "강조 외침";
  } else if (/고민|생각|어쩌지|글쎄|음\.\.\./u.test(clean)) {
    recommendedEmotion = "고민·생각에 잠긴 표정";
    recommendedPose = "턱을 괴고 생각하는 포즈";
    recommendedSpeechBubbleType = "속마음 구름";
  }

  if (/학교|교실|학생|수업|선생님/u.test(clean)) {
    recommendedBackground = "고등학교 교실·칠판 배경";
    campaignPurpose = "교육용 컷툰";
  } else if (/할인|이벤트|출시|혜택|홍보|브랜드/u.test(clean)) {
    recommendedBackground = "팝업 스토어·프로모션 스튜디오 배경";
    campaignPurpose = "공공·홍보 컷툰";
  } else if (/일상|퇴근|카페|주말|공감/u.test(clean)) {
    recommendedBackground = "아늑한 카페·자취방 배경";
    campaignPurpose = "브랜드 인스타툰";
  }

  return {
    sentence: clean,
    recommendedEmotion,
    recommendedPose,
    recommendedBackground,
    recommendedSpeechBubbleType,
    campaignPurpose,
  };
}
