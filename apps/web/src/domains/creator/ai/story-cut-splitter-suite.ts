/**
 * Tooning Stories (TG) & Cut Splitter & TG→TD 3D Studio Interlock Engine
 *
 * Grounded in REA static/runtime analysis of https://plus.tooning.io/stories:
 * - StudioService enum (`CM`, `TG`, `TD`, `ED`, `MG`, `DV`, `TB`)
 * - 3 AI Story Agents (`webtoon`, `novel`, `movie`) + starter sample prompts
 * - Concept Builder (`TgConceptType`: `OnlyInput` | `DropDownAndInput`, `TgConceptRecommendType` 0..4, `maxConceptAddCnt`)
 * - Plot Suggestion (`ReceiveSuggestion`), 3 follow-up questions, answer evaluation (`Good` | `Bad`)
 * - Story Canvas (8,000 char limit, 3,000ms auto-save, `<cut-marker>` C#N badges, `==highlight==`, 9 fonts)
 * - Cover Image Generator (`Abstract` | `Person` | `Color`, 844×264 banner spec)
 * - Cut Splitter (`-----` delimiter, 360×640 floating splitter state, edit/reset per cut)
 * - Stories → 3D Studio Interlock (`TgToTdLinkage` / `generateCutDetails` at 5 credits/cut)
 * - 4 Export Formats (`PDF`, `Docx`, `Html` with UTF-8 BOM, `Txt` with UTF-8 BOM) & Explore (`OnlyOne` vs `Multiple` KnowHow)
 */

export type CreatorPlusStudioServiceCode = "CM" | "TG" | "TD" | "ED" | "MG" | "DV" | "TB";

export interface CreatorPlusServiceDescriptor {
  readonly code: CreatorPlusStudioServiceCode;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly routePath: string;
  readonly summaryKo: string;
}

export const CREATOR_PLUS_SERVICES: readonly CreatorPlusServiceDescriptor[] = [
  {
    code: "CM",
    nameKo: "투닝 플러스 공통 (Common & Credit)",
    nameEn: "Common Platform",
    routePath: "/",
    summaryKo: "통합 워크스페이스·크레딧·플랜(Free/Basic/Pro)·다국어(KO/EN/JA) 관리",
  },
  {
    code: "TG",
    nameKo: "투닝 스토리 (Tooning Stories)",
    nameEn: "Tooning Stories",
    routePath: "/stories",
    summaryKo: "웹툰·웹소설·영화 AI 스토리 에이전트, 설정 빌더, 컷 분할기 및 3D 스튜디오 연동",
  },
  {
    code: "TD",
    nameKo: "투닝 3D 스튜디오 (3D Studio & Asset Store)",
    nameEn: "Tooning 3D Studio",
    routePath: "/3d-studio",
    summaryKo: "21종 체형 본 슬라이더, 비대칭 표정·3×3 시선, 23종 카메라 프리셋, 웹캠 포즈 트래킹",
  },
  {
    code: "ED",
    nameKo: "투닝 에디터 (Tooning Editor)",
    nameEn: "Tooning Editor",
    routePath: "/editor",
    summaryKo: "9종 대지, 절차적 말풍선 6종·병합, 16파츠 스마트 캐릭터, 3D 마네킹·다각도 카메라",
  },
  {
    code: "MG",
    nameKo: "투닝 매직 (Tooning Magic)",
    nameEn: "Tooning Magic",
    routePath: "/editor?tab=magic",
    summaryKo: "Inhouse/Outside/MyStyle(B-LoRA) 작화 생성, 컷 자동 태깅, 5장 멀티 이미지 AI 리터치",
  },
  {
    code: "DV",
    nameKo: "디브 (Deev AI Character Chat & Lorebook)",
    nameEn: "Deev AI Chat",
    routePath: "/deev",
    summaryKo: "6단계 AI 캐릭터 제작, 키워드 로어북, 17종 챗 모드·장기 기억·대화 중 이미지 재생성",
  },
  {
    code: "TB",
    nameKo: "툰비 (ToonBe Webtoon & Novel Platform)",
    nameEn: "ToonBe Platform",
    routePath: "/toonbe",
    summaryKo: "10종 작가 크레딧 롤, 웹툰 원고 검증기(700px/5MB/50MB), 웹소설 뷰어(스크롤/탭·4폰트)",
  },
] as const;

export const CREATOR_PLUS_CREDIT_COSTS = {
  TG_PROMPT: 3,
  TG_SPLIT_CUT: 3,
  TG_EXPORT_TO_TD_PER_CUT: 5,
  MG_TXT_TO_IMG: 5,
  MG_IMG_TO_IMG: 5,
  MG_MY_STYLE_LORA_TRAIN: 100,
  MG_AI_RETOUCH: 5,
  ED_MULTI_ANGLE_CAMERA: 5,
  ED_VOICE_TTS: 2,
} as const;

export type TgAgentCategory = "webtoon" | "novel" | "movie";

export type TgConceptType = "OnlyInput" | "DropDownAndInput";

export type TgConceptRecommendType =
  | "NotRecommend"
  | "Recommend"
  | "GenderRecommend"
  | "MaleRecommend"
  | "FemaleRecommend";

export type TgCoverImageType = "Abstract" | "Person" | "Color";

export type TgFileType = "PDF" | "Docx" | "Html" | "Txt";

export type TgExploreShareType = "OnlyOne" | "Multiple";

export type TgAnswerFeedback = "Good" | "Bad" | null;

export interface TgStarterPromptSample {
  readonly id: string;
  readonly agentCategory: TgAgentCategory;
  readonly titleKo: string;
  readonly genreKo: string;
  readonly promptText: string;
}

export const TG_STARTER_PROMPT_SAMPLES: readonly TgStarterPromptSample[] = [
  {
    id: "tg-starter-webtoon-1",
    agentCategory: "webtoon",
    titleKo: "회귀한 황녀의 계약 결혼",
    genreKo: "로맨스 판타지",
    promptText:
      "가문을 멸망시킨 배신자에게 복수하기 위해 5년 전으로 회귀한 황녀가 북부 대공에게 계약 결혼을 제안하는 1화 오프닝 스토리를 써줘.",
  },
  {
    id: "tg-starter-webtoon-2",
    agentCategory: "webtoon",
    titleKo: "F급 헌터의 히든 던전 각성",
    genreKo: "현대 판타지 / 액션",
    promptText:
      "만년 F급 채굴꾼이 붕괴된 지하철 던전에서 고대 군주의 유물을 흡수하고 첫 각성 스킬을 발현하는 긴박한 도입부를 작성해줘.",
  },
  {
    id: "tg-starter-novel-1",
    agentCategory: "novel",
    titleKo: "폐쇄된 연구소의 마지막 기록",
    genreKo: "SF 스릴러",
    promptText:
      "심해 3,000m 기지에서 정체불명의 신호가 수신된 직후 연구원들의 기억이 하루씩 어긋나기 시작하는 웹소설 1장 본문을 작성해줘.",
  },
  {
    id: "tg-starter-movie-1",
    agentCategory: "movie",
    titleKo: "비 내리는 네온 골목의 추격전",
    genreKo: "범죄 느와르",
    promptText:
      "사라진 증거칩을 되찾기 위해 은퇴한 형사가 빗속 옥상과 야시장을 가로지르며 용의자를 추격하는 시네마틱 시나리오를 써줘.",
  },
] as const;

export interface TgConceptFieldSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly conceptType: TgConceptType;
  readonly recommendType: TgConceptRecommendType;
  readonly maxConceptAddCnt: number;
  readonly dropdownOptions?: readonly string[];
  readonly recommendations: {
    readonly general: readonly string[];
    readonly male?: readonly string[];
    readonly female?: readonly string[];
  };
}

export const TG_CONCEPT_FIELD_SPECS: readonly TgConceptFieldSpec[] = [
  {
    id: "genre-tone",
    labelKo: "장르 및 분위기",
    conceptType: "DropDownAndInput",
    recommendType: "Recommend",
    maxConceptAddCnt: 1,
    dropdownOptions: ["로맨스 판타지", "현대 액션", "학원 드라마", "스릴러/미스터리", "무협/사극", "일상 개그"],
    recommendations: {
      general: [
        "긴장감 넘치는 배틀과 빠른 전개",
        "설레는 감정선과 궁중 암투",
        "어둡고 치밀한 심리 추리극",
      ],
    },
  },
  {
    id: "worldbuilding",
    labelKo: "세계관 및 시대 배경",
    conceptType: "OnlyInput",
    recommendType: "Recommend",
    maxConceptAddCnt: 2,
    recommendations: {
      general: [
        "마법 공학이 발달한 제국 수도와 북부 설원 성채",
        "게이트 출현 이후 헌터 길드가 지배하는 근미래 서울",
        "비밀 동아리가 숨겨진 명문 기숙 고등학교",
      ],
    },
  },
  {
    id: "character-profile",
    labelKo: "등장인물 설정",
    conceptType: "DropDownAndInput",
    recommendType: "GenderRecommend",
    maxConceptAddCnt: 6,
    dropdownOptions: ["주인공(남)", "주인공(여)", "조력자", "적대자/빌런", "라이벌"],
    recommendations: {
      general: ["겉은 냉소적이지만 동료를 끝까지 지키는 전략가"],
      male: [
        "강하준 (24세) — 흑발 적안의 북부 대공, 감정을 숨긴 완벽주의 검술가",
        "이도현 (19세) — 각성 전엔 무력했으나 그림자 제어 능력을 얻은 소년",
      ],
      female: [
        "엘레나 (21세) — 은발 금안의 회귀 황녀, 명석한 기억력으로 미래를 설계",
        "한서윤 (27세) — S급 길드 수석 분석관, 차분한 독설가",
      ],
    },
  },
  {
    id: "core-incident",
    labelKo: "핵심 사건 및 갈등",
    conceptType: "OnlyInput",
    recommendType: "Recommend",
    maxConceptAddCnt: 3,
    recommendations: {
      general: [
        "가문의 봉인 유물이 도난당하며 내부 배신자를 색출해야 하는 상황",
        "정체를 숨긴 채 원수의 파트너로 잠입 임무를 수행",
        "제한 시간 24시간 안에 붕괴하는 던전 코어를 정화",
      ],
    },
  },
] as const;

export interface TgConceptEntryInstance {
  readonly instanceId: string;
  readonly fieldId: string;
  readonly selectedOption?: string;
  readonly inputText: string;
  readonly genderHint?: "male" | "female" | "neutral";
}

export interface TgCoverImageConfig {
  readonly coverType: TgCoverImageType;
  readonly presetId: string;
  readonly titleOverlay: string;
  readonly widthPx: 844;
  readonly heightPx: 264;
  readonly accentHex: string;
}

export const TG_COVER_IMAGE_PRESETS: readonly TgCoverImageConfig[] = [
  {
    coverType: "Abstract",
    presetId: "abstract-aurora",
    titleOverlay: "오로라 네온 그라데이션 배너",
    widthPx: 844,
    heightPx: 264,
    accentHex: "#6366f1",
  },
  {
    coverType: "Person",
    presetId: "person-silhouette-duo",
    titleOverlay: "주인공 듀오 실루엣 일러스트 배너",
    widthPx: 844,
    heightPx: 264,
    accentHex: "#ec4899",
  },
  {
    coverType: "Color",
    presetId: "color-midnight-gold",
    titleOverlay: "미드나잇 골드 솔리드 배너",
    widthPx: 844,
    heightPx: 264,
    accentHex: "#f59e0b",
  },
] as const;

export const TG_SUPPORTED_FONTS = [
  "Pretendard",
  "나눔고딕",
  "나눔명조",
  "나눔스퀘어네오",
  "나눔바른고딕",
  "마루부리",
  "GmarketSans",
  "고운바탕",
  "카페24써라운드",
] as const;

export type TgSupportedFont = (typeof TG_SUPPORTED_FONTS)[number];

export const TG_CANVAS_MAX_CHARS = 8000;
export const TG_AUTOSAVE_DEBOUNCE_MS = 3000;
export const TG_FLOATING_SPLITTER_DIMENSIONS = { widthPx: 360, heightPx: 640 } as const;

export interface TgSplitCutItem {
  readonly cutIndex: number;
  readonly markerCode: string; // e.g. "C#1"
  readonly description: string;
  readonly originalDescription: string;
  readonly isModified: boolean;
}

export interface TgLinkedTdCutSpec {
  readonly cutNumber: number;
  readonly markerCode: string;
  readonly storyboardContent: string; // max 200 chars for TD cut
  readonly cutPrompt: string;
  readonly characterNames: readonly string[];
  readonly backgroundPreset: string;
  readonly recommendedPose: string;
  readonly recommendedExpression: string;
  readonly cameraShotSize:
    | "ExtremeCloseUp"
    | "CloseUpShot"
    | "BustShot"
    | "WaistShot"
    | "KneeShot"
    | "FullShot"
    | "LongShot";
  readonly cameraAngle:
    | "BirdEyesAngle"
    | "HighAngle"
    | "EyeLevelAngle"
    | "LowAngle"
    | "WormsEyeAngle";
  readonly cameraPosition:
    | "Front"
    | "FrontLeft"
    | "LeftSide"
    | "BackLeft"
    | "Back"
    | "BackRight"
    | "RightSide"
    | "FrontRight";
  readonly cameraLens: "Telephoto" | "Standard" | "WideAngle";
  readonly lightingPreset: "Spot" | "Directional" | "Ambient";
  readonly creditCost: number;
}

export interface TgToTdExportPackage {
  readonly storyId: string;
  readonly storyTitle: string;
  readonly deepLinkUrl: string;
  readonly totalCuts: number;
  readonly totalCreditCost: number;
  readonly cuts: readonly TgLinkedTdCutSpec[];
}

export interface TgExportedFilePayload {
  readonly fileType: TgFileType;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: string;
  readonly byteLength: number;
  readonly hasUtf8Bom: boolean;
}

export interface TgExplorePublishedWork {
  readonly exploreId: string;
  readonly title: string;
  readonly shareType: TgExploreShareType;
  readonly agentCategory: TgAgentCategory;
  readonly concepts: readonly TgConceptEntryInstance[];
  readonly canvasText: string;
  readonly knowHowPrompts: readonly string[];
  readonly coverConfig: TgCoverImageConfig;
}

/**
 * Resolves concept recommendation text by field and optional gender hint.
 */
export function recommendTgConceptValue(
  fieldId: string,
  genderHint: "male" | "female" | "neutral" = "neutral",
  seedIndex = 0,
): string {
  const spec = TG_CONCEPT_FIELD_SPECS.find((item) => item.id === fieldId);
  if (!spec) return "";
  if (spec.recommendType === "NotRecommend") return "";

  let pool = spec.recommendations.general;
  if (
    (spec.recommendType === "GenderRecommend" || spec.recommendType === "MaleRecommend") &&
    genderHint === "male" &&
    spec.recommendations.male?.length
  ) {
    pool = spec.recommendations.male;
  } else if (
    (spec.recommendType === "GenderRecommend" || spec.recommendType === "FemaleRecommend") &&
    genderHint === "female" &&
    spec.recommendations.female?.length
  ) {
    pool = spec.recommendations.female;
  }
  if (pool.length === 0) return "";
  return pool[Math.abs(seedIndex) % pool.length] ?? pool[0]!;
}

/**
 * Adds a concept instance while enforcing `maxConceptAddCnt` per concept field.
 */
export function addTgConceptInstance(
  current: readonly TgConceptEntryInstance[],
  nextEntry: Omit<TgConceptEntryInstance, "instanceId">,
): {
  readonly entries: readonly TgConceptEntryInstance[];
  readonly added: boolean;
  readonly reasonKo?: string;
} {
  const spec = TG_CONCEPT_FIELD_SPECS.find((item) => item.id === nextEntry.fieldId);
  const maxAllowed = spec?.maxConceptAddCnt ?? 5;
  const currentFieldCount = current.filter((item) => item.fieldId === nextEntry.fieldId).length;
  if (currentFieldCount >= maxAllowed) {
    return {
      entries: current,
      added: false,
      reasonKo: `'${spec?.labelKo ?? nextEntry.fieldId}' 항목은 최대 ${maxAllowed}개까지 추가할 수 있습니다.`,
    };
  }
  const instanceId = `${nextEntry.fieldId}-${currentFieldCount + 1}`;
  return {
    entries: [...current, { ...nextEntry, instanceId }],
    added: true,
  };
}

/**
 * Compiles structured concept instances into a Tooning Stories system prompt block.
 */
export function compileTgConceptsToPrompt(
  agentCategory: TgAgentCategory,
  concepts: readonly TgConceptEntryInstance[],
): string {
  const agentLabel =
    agentCategory === "webtoon" ? "웹툰" : agentCategory === "novel" ? "웹소설" : "영화 시나리오";
  const lines = concepts
    .filter((c) => c.inputText.trim().length > 0)
    .map((c) => {
      const spec = TG_CONCEPT_FIELD_SPECS.find((s) => s.id === c.fieldId);
      const prefix = c.selectedOption ? `[${c.selectedOption}] ` : "";
      return `- ${spec?.labelKo ?? c.fieldId}: ${prefix}${c.inputText.trim()}`;
    });
  return [
    `[투닝 스토리 ${agentLabel} 에이전트 설정]`,
    ...(lines.length > 0 ? lines : ["- 기본 자유 창작 모드"]),
  ].join("\n");
}

/**
 * Generates plot suggestion (`ReceiveSuggestion`) and 3 contextual follow-up questions.
 */
export function generateTgPlotSuggestionAndQuestions(
  agentCategory: TgAgentCategory,
  canvasText: string,
  concepts: readonly TgConceptEntryInstance[],
): {
  readonly plotSuggestion: string;
  readonly followUpQuestions: readonly [string, string, string];
  readonly creditCost: number;
} {
  const charConcept = concepts.find((c) => c.fieldId === "character-profile")?.inputText ?? "주인공";
  const shortChar = charConcept.split(/[—(-]/u)[0]?.trim() || "주인공";
  const hasClimax = /배신|추격|폭발|각성|비밀/u.test(canvasText);

  const plotSuggestion = hasClimax
    ? `${shortChar} 앞에 숨겨진 진실의 단서가 드러나지만, 가장 신뢰하던 동료가 예상치 못한 선택을 하며 클리프행어로 전환됩니다.`
    : `${shortChar}이(가) 첫 번째 시련을 돌파한 직후, 사건의 배후에 있는 인물의 정체가 암시되며 긴장감이 고조됩니다.`;

  const modeNoun =
    agentCategory === "webtoon" ? "웹툰 컷" : agentCategory === "novel" ? "웹소설 챕터" : "영화 씬";

  return {
    plotSuggestion,
    followUpQuestions: [
      `${shortChar}의 내면 독백과 감정선이 돋보이도록 다음 ${modeNoun} 대사를 확장해 줄래?`,
      `적대자와의 대립 구도가 극대화되도록 반전 클리프행어를 추가해 줄래?`,
      `배경 묘사와 시간대(조명·날씨) 연출 지문을 더 구체적으로 보강해 줄래?`,
    ],
    creditCost: CREATOR_PLUS_CREDIT_COSTS.TG_PROMPT,
  };
}

/**
 * Processes Story Canvas text: enforces 8,000 char ceiling, extracts `<cut-marker>` / `[C#N]` tags and `==highlight==` spans.
 */
export function processTgStoryCanvas(rawText: string): {
  readonly normalizedText: string;
  readonly charCount: number;
  readonly isOverLimit: boolean;
  readonly cutMarkers: readonly string[];
  readonly highlights: readonly string[];
  readonly htmlPreview: string;
} {
  const charCount = rawText.length;
  const isOverLimit = charCount > TG_CANVAS_MAX_CHARS;
  const normalizedText = isOverLimit ? rawText.slice(0, TG_CANVAS_MAX_CHARS) : rawText;

  const cutMarkers: string[] = [];
  const markerRegex = /(?:\[C#(\d+)\]|<cut-marker[^>]*data-cut-index="(\d+)"[^>]*>C#\d+<\/cut-marker>)/gu;
  for (const match of normalizedText.matchAll(markerRegex)) {
    const num = match[1] ?? match[2];
    if (num) cutMarkers.push(`C#${num}`);
  }

  const highlights: string[] = [];
  for (const match of normalizedText.matchAll(/==([^=\n]+)==/gu)) {
    if (match[1]) highlights.push(match[1].trim());
  }

  const escaped = normalizedText
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");

  const htmlPreview = escaped
    .replace(
      /\[C#(\d+)\]/gu,
      '<cut-marker data-cut-index="$1" class="tg-cut-badge">C#$1</cut-marker>',
    )
    .replace(/==([^=\n]+)==/gu, "<mark>$1</mark>");

  return {
    normalizedText,
    charCount,
    isOverLimit,
    cutMarkers,
    highlights,
    htmlPreview,
  };
}

/**
 * Splits Story Canvas text into discrete webtoon cuts (`-----` delimiter or double-newline blocks)
 * and injects `[C#1]`, `[C#2]` markers synchronized with the floating Cut Splitter (`360x640`).
 */
export function splitTgStoryIntoCuts(storyText: string): {
  readonly cuts: readonly TgSplitCutItem[];
  readonly markedCanvasText: string;
  readonly creditCost: number;
} {
  const cleaned = storyText.replace(/\[C#\d+\]\s*/gu, "").trim();
  if (!cleaned) {
    return { cuts: [], markedCanvasText: "", creditCost: 0 };
  }

  const rawBlocks = cleaned.includes("-----")
    ? cleaned.split(/\n*-----+\n*/gu)
    : cleaned.split(/\n{2,}/gu);

  const nonEmptyBlocks = rawBlocks.map((b) => b.trim()).filter((b) => b.length > 0);
  const cuts: TgSplitCutItem[] = nonEmptyBlocks.map((block, index) => {
    const cutIndex = index + 1;
    return {
      cutIndex,
      markerCode: `C#${cutIndex}`,
      description: block,
      originalDescription: block,
      isModified: false,
    };
  });

  const markedCanvasText = cuts.map((c) => `[${c.markerCode}] ${c.description}`).join("\n-----\n");

  return {
    cuts,
    markedCanvasText,
    creditCost: CREATOR_PLUS_CREDIT_COSTS.TG_SPLIT_CUT,
  };
}

export function updateTgSplitCutDescription(
  cuts: readonly TgSplitCutItem[],
  cutIndex: number,
  nextDescription: string,
): readonly TgSplitCutItem[] {
  return cuts.map((item) =>
    item.cutIndex === cutIndex
      ? {
          ...item,
          description: nextDescription,
          isModified: nextDescription.trim() !== item.originalDescription.trim(),
        }
      : item,
  );
}

export function resetTgSplitCutDescription(
  cuts: readonly TgSplitCutItem[],
  cutIndex: number,
): readonly TgSplitCutItem[] {
  return cuts.map((item) =>
    item.cutIndex === cutIndex
      ? {
          ...item,
          description: item.originalDescription,
          isModified: false,
        }
      : item,
  );
}

/**
 * `TgToTdLinkage` (`exportToTd` / `generateCutDetails`):
 * Converts split story cuts into 3D Studio (`TD`) scene/cut specifications (`5 credits * cutCount`)
 * with automatic camera composition (23 presets), pose, expression, and lighting mapping.
 */
export function buildTgToTdExportPackage(
  storyId: string,
  storyTitle: string,
  cuts: readonly TgSplitCutItem[],
): TgToTdExportPackage {
  const tdCuts: TgLinkedTdCutSpec[] = cuts.map((cut) => {
    const text = cut.description;
    const storyboardContent = text.slice(0, 200);

    const isCloseUp = /눈빛|표정|속삭|눈물|미소|얼굴|클라이맥스/u.test(text);
    const isWide = /전경|성채|도시|거리|던전|광장|풍경/u.test(text);
    const isAction = /달려|공격|검|충돌|추격|폭발|도약/u.test(text);
    const isHighAngle = /내려다|절망|쓰러|무릎/u.test(text);

    const cameraShotSize: TgLinkedTdCutSpec["cameraShotSize"] = isCloseUp
      ? "CloseUpShot"
      : isWide
        ? "LongShot"
        : isAction
          ? "FullShot"
          : "BustShot";

    const cameraAngle: TgLinkedTdCutSpec["cameraAngle"] = isAction
      ? "LowAngle"
      : isHighAngle
        ? "HighAngle"
        : "EyeLevelAngle";

    const cameraPosition: TgLinkedTdCutSpec["cameraPosition"] = isCloseUp
      ? "Front"
      : isAction
        ? "FrontLeft"
        : "FrontRight";

    const cameraLens: TgLinkedTdCutSpec["cameraLens"] = isWide
      ? "WideAngle"
      : isCloseUp
        ? "Telephoto"
        : "Standard";

    const recommendedExpression = /분노|소리치|외치|노려/u.test(text)
      ? "rage-furious"
      : /눈물|울음|슬픔/u.test(text)
        ? "cry-grief"
        : /미소|웃음|기쁨/u.test(text)
          ? "joy-radiant"
          : /놀라|충격|경악/u.test(text)
            ? "shock-aghast"
            : "determination-heroic";

    const recommendedPose = isAction
      ? "action-sprint-slash"
      : isCloseUp
        ? "standing-dramatic-talk"
        : "standing-idle-natural";

    const lightingPreset: TgLinkedTdCutSpec["lightingPreset"] = /밤|어둠|그림자|지하/u.test(text)
      ? "Spot"
      : isWide
        ? "Directional"
        : "Ambient";

    const speakerMatches = Array.from(text.matchAll(/([가-힣A-Za-z]{2,8})\s*[:：]/gu)).map(
      (m) => m[1]!,
    );
    const characterNames = speakerMatches.length > 0 ? Array.from(new Set(speakerMatches)) : ["주인공"];

    return {
      cutNumber: cut.cutIndex,
      markerCode: cut.markerCode,
      storyboardContent,
      cutPrompt: `[3D Cut ${cut.markerCode}] ${cameraShotSize}, ${cameraAngle}, ${recommendedPose}, ${recommendedExpression} — ${storyboardContent}`,
      characterNames,
      backgroundPreset: isWide ? "citadel-plaza-3d" : "modern-room-3d",
      recommendedPose,
      recommendedExpression,
      cameraShotSize,
      cameraAngle,
      cameraPosition,
      cameraLens,
      lightingPreset,
      creditCost: CREATOR_PLUS_CREDIT_COSTS.TG_EXPORT_TO_TD_PER_CUT,
    };
  });

  const cleanId = encodeURIComponent(storyId.trim() || "story-default");
  return {
    storyId: storyId.trim() || "story-default",
    storyTitle: storyTitle.trim() || "무제 스토리",
    deepLinkUrl: `/3d-studio?storyId=${cleanId}`,
    totalCuts: tdCuts.length,
    totalCreditCost: tdCuts.length * CREATOR_PLUS_CREDIT_COSTS.TG_EXPORT_TO_TD_PER_CUT,
    cuts: tdCuts,
  };
}

/**
 * Exports Story Canvas document in 1 of the 4 Tooning Stories formats (`PDF`, `Docx`, `Html`, `Txt`).
 * Matches Tooning's UTF-8 BOM (`\uFEFF`) behavior for `Html` and `Txt`.
 */
export function exportTgStoryDocument(
  title: string,
  canvasText: string,
  fileType: TgFileType,
  font: TgSupportedFont = "Pretendard",
): TgExportedFilePayload {
  const safeTitle = (title.trim() || "tooning-story").replace(/[\\/:*?"<>|]/gu, "_");
  const processed = processTgStoryCanvas(canvasText);
  const pack = (ext: string, mimeType: string, content: string, hasUtf8Bom: boolean): TgExportedFilePayload => ({
    fileType,
    fileName: `${safeTitle}.${ext}`,
    mimeType,
    content,
    byteLength: new TextEncoder().encode(content).byteLength,
    hasUtf8Bom,
  });

  switch (fileType) {
    case "Html":
      return pack(
        "html",
        "text/html;charset=utf-8",
        `\uFEFF<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:'${font}',sans-serif;line-height:1.75;padding:24px;}</style></head><body><h1>${safeTitle}</h1><div>${processed.htmlPreview.replace(/\n/gu, "<br/>")}</div></body></html>`,
        true,
      );
    case "Txt":
      return pack("txt", "text/plain;charset=utf-8", `\uFEFF${safeTitle}\n\n${processed.normalizedText}`, true);
    case "Docx":
      return pack(
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${safeTitle}</w:t></w:r></w:p><w:p><w:r><w:t>${processed.normalizedText}</w:t></w:r></w:p></w:body></w:document>`,
        false,
      );
    case "PDF":
    default:
      return {
        ...pack(
          "pdf",
          "application/pdf",
          `%PDF-1.7\n% Tooning Stories Export (${font})\n% Title: ${safeTitle}\n${processed.normalizedText}\n%%EOF`,
          false,
        ),
        fileType: "PDF",
      };
  }
}

/**
 * Explore & KnowHow: Publishes a story (`OnlyOne` Canvas only vs `Multiple` Canvas + KnowHow prompt log)
 * or clones ("이 설정으로 새로 만들기" / `리메이크하기`) an existing Explore work's concepts.
 */
export function publishTgStoryToExplore(params: {
  readonly exploreId: string;
  readonly title: string;
  readonly shareType: TgExploreShareType;
  readonly agentCategory: TgAgentCategory;
  readonly concepts: readonly TgConceptEntryInstance[];
  readonly canvasText: string;
  readonly promptHistory: readonly string[];
  readonly coverConfig?: TgCoverImageConfig;
}): TgExplorePublishedWork {
  return {
    exploreId: params.exploreId,
    title: params.title.trim() || "무제 스토리",
    shareType: params.shareType,
    agentCategory: params.agentCategory,
    concepts: params.concepts,
    canvasText: params.canvasText,
    knowHowPrompts: params.shareType === "Multiple" ? [...params.promptHistory] : [],
    coverConfig: params.coverConfig ?? TG_COVER_IMAGE_PRESETS[0]!,
  };
}

export function cloneTgExploreWorkConcepts(work: TgExplorePublishedWork): {
  readonly agentCategory: TgAgentCategory;
  readonly clonedConcepts: readonly TgConceptEntryInstance[];
  readonly systemInstruction: string;
} {
  const clonedConcepts = work.concepts.map((c, idx) => ({
    ...c,
    instanceId: `remake-${c.fieldId}-${idx + 1}`,
  }));
  return {
    agentCategory: work.agentCategory,
    clonedConcepts,
    systemInstruction: compileTgConceptsToPrompt(work.agentCategory, clonedConcepts),
  };
}
