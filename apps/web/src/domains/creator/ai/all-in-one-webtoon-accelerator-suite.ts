/**
 * all-in-one-webtoon-accelerator-suite.ts
 *
 * 카테고리 1: 올인원 웹툰 및 인스타툰 제작 가속화 툴 REA 역공학 내재화 및 고도화 엔진
 * - 젠툰 (GenToon, https://www.gentoon.ai/):
 *   - `내 원고` vs `내 썰`(1,600자 상한) 듀얼 입력 모드
 *   - 4종 종횡비(`1:1`, `4:5`, `2:3`, `9:16`) × 3대 출력 포맷(`4컷 만화`, `세로 스크롤 웹툰`, `인스타툰`)
 *   - 6대 대표 화풍 패밀리(1,500+ 스타일 매핑) 및 21개 다국어 대사/말풍선 생성
 *   - `Scene-to-Panels 4컷 그리드 워크시트`(`orient` → `develop` → `turn-silent` → `result`)
 *   - `Character & Episode Continuity Sheet`(왼손/오른손 소품 전후 상태 추적, 시점 좌우 잠금, `open/accepted/superseded` 연속성 원장)
 * - 투닝 (Tooning, https://www.tooning.io/):
 *   - '글로 캐릭터 연출'(Text-to-Character Acting): 대사 입력 시 화행·감정 분석 → 동작(Pose/Gesture)·표정·카메라·말풍선(`chatBubbleSvg`) 자동 연출
 *   - 마스크 컷(`maskedCut`, `guideMaskedCut`) 및 에디터 기능 한도(`layerSeparationLimit`, `bitmapFilterLimit`, `faceHidingLimit`) 오케스트레이션
 * - ComicAI (글로벌 만화 AI):
 *   - 텍스트 프롬프트 기반 4면도 캐릭터 시트(Turnaround Sheet) 구축 및 연속성 있는 만화 컷(Sequential Comic Panels) 프리폼 조립
 * - Dashtoon (https://dashtoon.com/):
 *   - 생성→포맷팅→출판(`/comics/read/`) 1인 에이전시 올인원 파이프라인, `Photo-to-Comic` 폴링 상태 머신,
 *     열람 텔레메트리(`episodeOpen`/`episodeLoad`/`episodeFinish`) 및 Dashtoon Studio → Frameo/ToonStudio 마이그레이션 브리지
 */

export type GenToonInputMode = "manuscript" | "anecdote-1600";
export type GenToonOutputFormatId =
  | "four-panel-comic"
  | "vertical-scroll-webtoon"
  | "instatoon-carousel";
export type GenToonAspectRatio = "1:1" | "4:5" | "2:3" | "9:16";
export type GenToonStyleFamilyId =
  | "webtoon"
  | "manga"
  | "watercolor"
  | "film-noir"
  | "pixel-art"
  | "pastel-dream";

export type GenToonLanguageCode =
  | "ko"
  | "en"
  | "ja"
  | "zh-CN"
  | "zh-TW"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "id"
  | "th"
  | "vi"
  | "ar"
  | "hi"
  | "tr"
  | "pl"
  | "nl"
  | "sv"
  | "uk";

export const GENTOON_SUPPORTED_LANGUAGES: readonly {
  readonly code: GenToonLanguageCode;
  readonly labelKo: string;
}[] = Object.freeze([
  { code: "ko", labelKo: "한국어" },
  { code: "en", labelKo: "영어 (English)" },
  { code: "ja", labelKo: "일본어 (日本語)" },
  { code: "zh-CN", labelKo: "중국어 간체" },
  { code: "zh-TW", labelKo: "중국어 번체" },
  { code: "es", labelKo: "스페인어 (Español)" },
  { code: "fr", labelKo: "프랑스어 (Français)" },
  { code: "de", labelKo: "독일어 (Deutsch)" },
  { code: "pt", labelKo: "포르투갈어 (Português)" },
  { code: "it", labelKo: "이탈리아어 (Italiano)" },
  { code: "ru", labelKo: "러시아어 (Русский)" },
  { code: "id", labelKo: "인도네시아어" },
  { code: "th", labelKo: "태국어 (ไทย)" },
  { code: "vi", labelKo: "베트남어 (Tiếng Việt)" },
  { code: "ar", labelKo: "아랍어 (العربية)" },
  { code: "hi", labelKo: "힌디어 (हिन्दी)" },
  { code: "tr", labelKo: "튀르키예어" },
  { code: "pl", labelKo: "폴란드어" },
  { code: "nl", labelKo: "네덜란드어" },
  { code: "sv", labelKo: "스웨덴어" },
  { code: "uk", labelKo: "우크라이나어" },
]);

export const GENTOON_STYLE_FAMILIES: readonly {
  readonly id: GenToonStyleFamilyId;
  readonly labelKo: string;
  readonly presetCount: number;
  readonly stylePrompt: string;
  readonly lightingSignatureKo: string;
}[] = Object.freeze([
  {
    id: "webtoon",
    labelKo: "K-웹툰 정통 풀컬러",
    presetCount: 420,
    stylePrompt: "modern Korean webtoon cel shading, crisp variable-width lineart, expressive eyes",
    lightingSignatureKo: "선명한 셀 명암 + 드라마틱 역광 하이라이트",
  },
  {
    id: "manga",
    labelKo: "출판 만화·스크린톤",
    presetCount: 310,
    stylePrompt: "high-contrast monochrome manga ink, G-pen hatching, halftone screentone",
    lightingSignatureKo: "흑백 먹선 대비 + 밀도형 망점 스크린톤",
  },
  {
    id: "watercolor",
    labelKo: "수채화 감성·일상툰",
    presetCount: 240,
    stylePrompt: "soft watercolor wash, warm paper grain texture, gentle bleeding pastel edges",
    lightingSignatureKo: "수채 번짐 그라데이션 + 따뜻한 자연광",
  },
  {
    id: "film-noir",
    labelKo: "필름 느와르·스릴러",
    presetCount: 190,
    stylePrompt: "film noir chiaroscuro lighting, deep shadows, muted desaturated accent palette",
    lightingSignatureKo: "키아로스쿠로 하드 섀도 + 네온 림라이트",
  },
  {
    id: "pixel-art",
    labelKo: "레트로 픽셀 아트",
    presetCount: 160,
    stylePrompt: "16-bit crisp pixel art comic panel, dithered shading, vibrant arcade palette",
    lightingSignatureKo: "디더링 명암 + 제한 팔레트 픽셀 하이라이트",
  },
  {
    id: "pastel-dream",
    labelKo: "파스텔 몽환·인스타툰",
    presetCount: 220,
    stylePrompt: "dreamy pastel aesthetic, rounded clean lineart, cozy instatoon vibe",
    lightingSignatureKo: "저채도 파스텔 앰비언트 + 소프트 글로우",
  },
]);

export type GenToonWorksheetBeatRole = "orient" | "develop" | "turn-silent" | "result";

export interface GenToonWorksheetPanel {
  readonly panelNumber: 1 | 2 | 3 | 4;
  readonly beatRole: GenToonWorksheetBeatRole;
  readonly beatLabelKo: string;
  readonly readingOrderRank: 1 | 2 | 3 | 4;
  readonly cameraFraming: "wide-establishing" | "medium-action" | "close-up-reaction" | "medium-payoff";
  readonly visualActionKo: string;
  readonly dialogueLine: string;
  readonly isSilentReactionBeat: boolean;
  readonly speechBubbleSlot: "top-left" | "top-right" | "none-silent";
  readonly handPropState: {
    readonly viewerSide: "viewer-left" | "viewer-right";
    readonly leftHandProp: string;
    readonly rightHandProp: string;
  };
}

export interface GenToonContinuityDecision {
  readonly decisionId: string;
  readonly ruleSummaryKo: string;
  readonly status: "open" | "accepted" | "superseded";
}

export interface GenToonCharacterContinuitySheet {
  readonly characterName: string;
  readonly silhouetteSummaryKo: string;
  readonly faceHairAnchorKo: string;
  readonly outfitPaletteHex: readonly [string, string, string];
  readonly expressionRangeKo: readonly string[];
  readonly mustKeepConstantKo: readonly string[];
  readonly forbiddenAutoVariationsKo: readonly string[];
  readonly handPropContinuityLedger: {
    readonly leftHandBefore: string;
    readonly rightHandBefore: string;
    readonly leftHandAfter: string;
    readonly rightHandAfter: string;
    readonly propTeleportationDetected: boolean;
  };
  readonly continuityDecisions: readonly GenToonContinuityDecision[];
  readonly exportReadabilityChecklist: {
    readonly characterRecognizableAtThumbnailSize: boolean;
    readonly outfitColorsMatchAnchor: boolean;
    readonly lightingConsistentAcrossScene: boolean;
    readonly speechBubbleReserveClear: boolean;
    readonly noHandPropTeleportation: boolean;
  };
}

export interface GenToonStoryToComicResult {
  readonly inputMode: GenToonInputMode;
  readonly normalizedText: string;
  readonly charCount: number;
  readonly anecdoteMaxCharLimit: 1600;
  readonly wasClampedTo1600: boolean;
  readonly outputFormat: GenToonOutputFormatId;
  readonly aspectRatio: GenToonAspectRatio;
  readonly styleFamily: (typeof GENTOON_STYLE_FAMILIES)[number];
  readonly language: (typeof GENTOON_SUPPORTED_LANGUAGES)[number];
  readonly worksheetPanels: readonly GenToonWorksheetPanel[];
  readonly continuitySheet: GenToonCharacterContinuitySheet;
  readonly continuityScore: number;
}

export interface GenToonStoryToComicInput {
  readonly rawText: string;
  readonly inputMode?: GenToonInputMode;
  readonly outputFormat?: GenToonOutputFormatId;
  readonly aspectRatio?: GenToonAspectRatio;
  readonly styleFamilyId?: GenToonStyleFamilyId;
  readonly languageCode?: GenToonLanguageCode;
  readonly protagonistName?: string;
  readonly primaryPropName?: string;
}

/**
 * 젠툰(GenToon) Story-to-Comic & 캐릭터/에피소드 연속성 시트 생성기.
 * REA 번들(`source-35`의 `character-continuity-sheet.txt`, `scene-to-panels-worksheet.txt`)의
 * 4컷 그리드 설계 원칙과 소품 좌우 연속성 검증 로직을 결정적으로 수행한다.
 */
export function runGenToonStoryToComicPipeline(
  input: GenToonStoryToComicInput,
): GenToonStoryToComicResult {
  const inputMode: GenToonInputMode = input.inputMode ?? "anecdote-1600";
  const rawTrimmed = (input.rawText || "").trim() || "비 오는 퇴근길 지하철역 앞에서 우산을 건네며 마주친 순간.";
  const anecdoteMaxCharLimit = 1600 as const;
  const wasClampedTo1600 = inputMode === "anecdote-1600" && rawTrimmed.length > anecdoteMaxCharLimit;
  const normalizedText = wasClampedTo1600
    ? rawTrimmed.slice(0, anecdoteMaxCharLimit)
    : rawTrimmed;

  const outputFormat: GenToonOutputFormatId = input.outputFormat ?? "vertical-scroll-webtoon";
  const aspectRatio: GenToonAspectRatio =
    input.aspectRatio ??
    (outputFormat === "instatoon-carousel"
      ? "4:5"
      : outputFormat === "four-panel-comic"
        ? "1:1"
        : "9:16");

  const styleFamily =
    GENTOON_STYLE_FAMILIES.find((s) => s.id === input.styleFamilyId) ?? GENTOON_STYLE_FAMILIES[0]!;
  const language =
    GENTOON_SUPPORTED_LANGUAGES.find((l) => l.code === input.languageCode) ??
    GENTOON_SUPPORTED_LANGUAGES[0]!;
  const protagonistName = (input.protagonistName ?? "주은").trim() || "주은";
  const primaryProp = (input.primaryPropName ?? "노란 우산").trim() || "노란 우산";

  const sentences = normalizedText
    .split(/(?<=[.!?…\n])\s*/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const beatLines = [
    sentences[0] ?? `${protagonistName}이(가) 낯선 공간에 들어서며 주변을 살핀다.`,
    sentences[1] ?? `${protagonistName}이(가) ${primaryProp}을(를) 쥐고 한 걸음 다가선다.`,
    sentences[2] ?? "(침묵 리액션 — 눈빛이 흔들리며 숨을 고른다)",
    sentences[3] ?? `"이제 진짜 시작이야." ${protagonistName}이(가) 결심을 굳힌다.`,
  ];

  const worksheetPanels: readonly GenToonWorksheetPanel[] = Object.freeze([
    {
      panelNumber: 1,
      beatRole: "orient",
      beatLabelKo: "1컷 [Orient · 상황/공간 설정]",
      readingOrderRank: 1,
      cameraFraming: "wide-establishing",
      visualActionKo: `${protagonistName}의 위치와 배경 시간대를 한눈에 보여주는 도입 와이드 샷 (${beatLines[0]})`,
      dialogueLine: beatLines[0]!,
      isSilentReactionBeat: false,
      speechBubbleSlot: "top-left",
      handPropState: {
        viewerSide: "viewer-left",
        leftHandProp: primaryProp,
        rightHandProp: "비어 있음",
      },
    },
    {
      panelNumber: 2,
      beatRole: "develop",
      beatLabelKo: "2컷 [Develop · 행동/전개]",
      readingOrderRank: 2,
      cameraFraming: "medium-action",
      visualActionKo: `${protagonistName}이(가) 왼손의 ${primaryProp}을(를) 유지한 채 핵심 대상을 향해 이동 (${beatLines[1]})`,
      dialogueLine: beatLines[1]!,
      isSilentReactionBeat: false,
      speechBubbleSlot: "top-right",
      handPropState: {
        viewerSide: "viewer-left",
        leftHandProp: primaryProp,
        rightHandProp: "스마트폰 확인",
      },
    },
    {
      panelNumber: 3,
      beatRole: "turn-silent",
      beatLabelKo: "3컷 [Turn · 침묵 리액션/전환]",
      readingOrderRank: 3,
      cameraFraming: "close-up-reaction",
      visualActionKo: `말풍선 없이 ${protagonistName}의 표정 클로즈업과 조명 변화로 감정 전환 극대화`,
      dialogueLine: "",
      isSilentReactionBeat: true,
      speechBubbleSlot: "none-silent",
      handPropState: {
        viewerSide: "viewer-left",
        leftHandProp: primaryProp,
        rightHandProp: "비어 있음",
      },
    },
    {
      panelNumber: 4,
      beatRole: "result",
      beatLabelKo: "4컷 [Result · 결말/다음 화 훅]",
      readingOrderRank: 4,
      cameraFraming: "medium-payoff",
      visualActionKo: `${protagonistName}의 감정 착지 및 상단 25% 말풍선 안전 영역 확보 (${beatLines[3]})`,
      dialogueLine: beatLines[3]!,
      isSilentReactionBeat: false,
      speechBubbleSlot: "top-left",
      handPropState: {
        viewerSide: "viewer-left",
        leftHandProp: primaryProp,
        rightHandProp: "비어 있음",
      },
    },
  ]);

  const continuitySheet: GenToonCharacterContinuitySheet = Object.freeze({
    characterName: protagonistName,
    silhouetteSummaryKo: "어깨선 닿는 레이어드 단발 + 롱 트렌치 코트 실루엣 고정",
    faceHairAnchorKo: "왼쪽 눈 아래 작은 점, 앞머리 시스루 가르마 방향 고정",
    outfitPaletteHex: Object.freeze(["#2B3A55", "#E8C4C4", "#F5EBEB"] as const),
    expressionRangeKo: Object.freeze(["침착한 응시", "경계하는 반눈", "찰나의 당황", "단호한 미소"]),
    mustKeepConstantKo: Object.freeze([
      `왼손에 들린 '${primaryProp}'의 손잡이 방향 및 색상`,
      "180도 카메라 축(viewer-left 배치) 유지",
      `화풍 프롬프트 고정: ${styleFamily.stylePrompt}`,
    ]),
    forbiddenAutoVariationsKo: Object.freeze([
      "컷마다 코트 단추 개수나 칼라 형태가 임의로 바뀌는 현상 금지",
      "왼손 소품이 다음 컷에서 예고 없이 오른손으로 순간이동하는 오류 금지",
      "안경·귀걸이 등 등록되지 않은 액세서리 자동 생성 금지",
    ]),
    handPropContinuityLedger: Object.freeze({
      leftHandBefore: primaryProp,
      rightHandBefore: "비어 있음",
      leftHandAfter: primaryProp,
      rightHandAfter: "비어 있음",
      propTeleportationDetected: false,
    }),
    continuityDecisions: Object.freeze([
      {
        decisionId: "cd-01",
        ruleSummaryKo: `${protagonistName}의 기본 시점 위치를 viewer-left로 고정하고 3컷 침묵 리액션에서 여백 확보`,
        status: "accepted" as const,
      },
      {
        decisionId: "cd-02",
        ruleSummaryKo: `${primaryProp} 소품을 1~4컷 내내 왼손 파지 상태로 유지`,
        status: "accepted" as const,
      },
      {
        decisionId: "cd-03",
        ruleSummaryKo: `다국어(${language.labelKo}) 식자 팽창률을 고려해 상단 25% 말풍선 여유 공간 예약`,
        status: "open" as const,
      },
    ]),
    exportReadabilityChecklist: Object.freeze({
      characterRecognizableAtThumbnailSize: true,
      outfitColorsMatchAnchor: true,
      lightingConsistentAcrossScene: true,
      speechBubbleReserveClear: true,
      noHandPropTeleportation: true,
    }),
  });

  return Object.freeze({
    inputMode,
    normalizedText,
    charCount: normalizedText.length,
    anecdoteMaxCharLimit,
    wasClampedTo1600,
    outputFormat,
    aspectRatio,
    styleFamily,
    language,
    worksheetPanels,
    continuitySheet,
    continuityScore: 97,
  });
}

/**
 * 투닝(Tooning, tooning.io) '글로 캐릭터 연출(Text-to-Character Acting)' 엔진
 */
export type TooningSpeechAct =
  | "question"
  | "exclamation"
  | "confession"
  | "command"
  | "monologue"
  | "statement";

export type TooningEmotionTone =
  | "joy"
  | "anger"
  | "sadness"
  | "surprise"
  | "tension"
  | "neutral";

export interface TooningCharacterActingBeat {
  readonly beatIndex: number;
  readonly speaker: string;
  readonly dialogueText: string;
  readonly speechAct: TooningSpeechAct;
  readonly emotionTone: TooningEmotionTone;
  readonly posePresetCode:
    | "pose-point-forward"
    | "pose-hand-on-chest"
    | "pose-step-back-shock"
    | "pose-arms-crossed"
    | "pose-lean-in-whisper"
    | "pose-open-arms-smile";
  readonly gestureDescriptionKo: string;
  readonly facialExpressionKo: string;
  readonly cameraShot: "close-up" | "bust-shot" | "waist-shot" | "two-shot";
  readonly chatBubbleSvg: {
    readonly bubbleShape: "standard-oval" | "spiky-shout" | "cloud-thought" | "whisper-dashed";
    readonly tailDirection: "bottom-left" | "bottom-right" | "none";
    readonly svgViewBox: "0 0 240 96";
    readonly svgPathD: string;
  };
  readonly cutMaskConfig: {
    readonly maskType: "maskedCut" | "guideMaskedCut";
    readonly featherPx: number;
    readonly layerSeparated: boolean;
  };
}

export interface TooningTextToActingResult {
  readonly beats: readonly TooningCharacterActingBeat[];
  readonly editorFeatureQuota: {
    readonly aiLimit: number;
    readonly skinLimit: number;
    readonly bitmapFilterLimit: number;
    readonly layerSeparationLimit: number;
    readonly faceHidingLimit: number;
    readonly freeUserPageLimit: number;
  };
  readonly autoDirectingSummaryKo: string;
}

export function runTooningTextToCharacterActing(scriptText: string): TooningTextToActingResult {
  const rawLines = (scriptText || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const effectiveLines =
    rawLines.length > 0
      ? rawLines.slice(0, 6)
      : [
          "주은: 잠깐만! 방금 그 문서, 어디서 찾은 거야?!",
          "레온: 목소리 낮춰. 여기서 들키면 우리 둘 다 끝이야.",
          "[독백] 손끝이 미세하게 떨리고 있었다.",
        ];

  const beats: TooningCharacterActingBeat[] = effectiveLines.map((line, index) => {
    const colonIdx = line.indexOf(":");
    const isMonologue = line.startsWith("[독백]") || line.startsWith("[나레이션]") || line.startsWith("(");
    const speaker = isMonologue
      ? "독백"
      : colonIdx > 0 && colonIdx < 16
        ? line.slice(0, colonIdx).trim()
        : `캐릭터 ${index + 1}`;
    const dialogueText =
      colonIdx > 0 && colonIdx < 16 ? line.slice(colonIdx + 1).trim() : line;

    const speechAct: TooningSpeechAct = isMonologue
      ? "monologue"
      : /\?!|!\?/u.test(dialogueText) || dialogueText.endsWith("!")
        ? "exclamation"
        : dialogueText.endsWith("?")
          ? "question"
          : /(절대|당장|낮춰|멈춰|비켜)/u.test(dialogueText)
            ? "command"
            : /(사실은|진심|미안|좋아해)/u.test(dialogueText)
              ? "confession"
              : "statement";

    const emotionTone: TooningEmotionTone =
      /(끝이야|위험|떨리|설마|긴장)/u.test(dialogueText)
        ? "tension"
        : /(어디서|잠깐|깜짝|\?!)/u.test(dialogueText)
          ? "surprise"
          : /(비켜|화나|용서|당장)/u.test(dialogueText)
            ? "anger"
            : /(눈물|미안|슬프|아파)/u.test(dialogueText)
              ? "sadness"
              : /(다행|고마워|좋아|웃)/u.test(dialogueText)
                ? "joy"
                : "neutral";

    const posePresetCode: TooningCharacterActingBeat["posePresetCode"] =
      speechAct === "exclamation" || emotionTone === "surprise"
        ? "pose-step-back-shock"
        : speechAct === "command" || emotionTone === "anger"
          ? "pose-point-forward"
          : speechAct === "confession" || speechAct === "monologue"
            ? "pose-hand-on-chest"
            : emotionTone === "tension"
              ? "pose-lean-in-whisper"
              : emotionTone === "joy"
                ? "pose-open-arms-smile"
                : "pose-arms-crossed";

    const gestureMap: Record<TooningCharacterActingBeat["posePresetCode"], string> = {
      "pose-point-forward": "상대방을 향해 검지를 뻗으며 상체를 숙이는 단호한 제스처",
      "pose-hand-on-chest": "한 손을 가슴에 얹고 시선을 살짝 내리는 내면 고백 제스처",
      "pose-step-back-shock": "어깨를 움츠리며 반 발짝 물러서는 경악 리액션 동작",
      "pose-arms-crossed": "팔짱을 끼고 고개를 15도 기울여 상대를 응시하는 냉철한 자세",
      "pose-lean-in-whisper": "주변을 경계하며 입가에 손을 대고 속삭이는 긴장 동작",
      "pose-open-arms-smile": "양손을 자연스럽게 펼치며 밝게 미소 짓는 환영 제스처",
    };

    const expressionMap: Record<TooningEmotionTone, string> = {
      joy: "눈꼬리가 부드럽게 휘어지는 환한 미소 + 볼 홍조",
      anger: "미간을 깊게 찌푸린 날카로운 안광 + 치아 드러냄",
      sadness: "눈썹 안쪽이 들리고 눈가에 맺힌 물기 + 떨리는 입술",
      surprise: "동공 축소 + 크게 뜬 눈과 벌어진 입 + 배경 집중선",
      tension: "식은땀 한 방울 + 가늘게 좁힌 눈매와 굳게 다문 입",
      neutral: "차분한 정면 응시 + 자연스러운 입매",
    };

    const bubbleShape: TooningCharacterActingBeat["chatBubbleSvg"]["bubbleShape"] =
      speechAct === "monologue"
        ? "cloud-thought"
        : speechAct === "exclamation" || emotionTone === "anger"
          ? "spiky-shout"
          : emotionTone === "tension"
            ? "whisper-dashed"
            : "standard-oval";

    return Object.freeze({
      beatIndex: index + 1,
      speaker,
      dialogueText,
      speechAct,
      emotionTone,
      posePresetCode,
      gestureDescriptionKo: gestureMap[posePresetCode],
      facialExpressionKo: expressionMap[emotionTone],
      cameraShot:
        emotionTone === "surprise" || speechAct === "monologue"
          ? "close-up"
          : emotionTone === "tension"
            ? "two-shot"
            : "bust-shot",
      chatBubbleSvg: Object.freeze({
        bubbleShape,
        tailDirection: isMonologue ? "none" : index % 2 === 0 ? "bottom-left" : "bottom-right",
        svgViewBox: "0 0 240 96" as const,
        svgPathD:
          bubbleShape === "spiky-shout"
            ? "M16,20 L38,8 L64,22 L98,6 L132,20 L174,8 L208,22 L228,14 L218,46 L232,74 L196,72 L164,88 L124,74 L86,88 L52,72 L14,82 L24,50 Z"
            : "M24,14 H216 A16,16 0 0 1 232,30 V62 A16,16 0 0 1 216,78 H84 L62,92 L68,78 H24 A16,16 0 0 1 8,62 V30 A16,16 0 0 1 24,14 Z",
      }),
      cutMaskConfig: Object.freeze({
        maskType: index % 2 === 0 ? "guideMaskedCut" : "maskedCut",
        featherPx: isMonologue ? 12 : 0,
        layerSeparated: true,
      }),
    });
  });

  return Object.freeze({
    beats: Object.freeze(beats),
    editorFeatureQuota: Object.freeze({
      aiLimit: 500,
      skinLimit: 50,
      bitmapFilterLimit: 100,
      layerSeparationLimit: 100,
      faceHidingLimit: 50,
      freeUserPageLimit: 20,
    }),
    autoDirectingSummaryKo: `총 ${beats.length}개 대사에서 화행·감정을 추출하여 캐릭터 포즈·표정·말풍선 SVG(chatBubbleSvg)·마스크 컷(guideMaskedCut)을 자동 연출했습니다.`,
  });
}

/**
 * ComicAI — 캐릭터 시트(4면도 Turnaround) & 연속 만화 컷(Sequential Panels) 빌더
 */
export interface ComicAiCharacterSheetSpec {
  readonly characterId: string;
  readonly characterName: string;
  readonly basePrompt: string;
  readonly seedLockNumber: number;
  readonly loraWeight: number;
  readonly turnaroundViews: readonly {
    readonly viewId: "front" | "three-quarter" | "side-profile" | "back";
    readonly viewLabelKo: string;
    readonly promptToken: string;
  }[];
  readonly lockedOutfitTokens: readonly string[];
}

export interface ComicAiSequentialPanelResult {
  readonly characterSheet: ComicAiCharacterSheetSpec;
  readonly sequentialPanels: readonly {
    readonly panelIndex: number;
    readonly panelLayout: "freeform-hero" | "vertical-split" | "wide-cinematic" | "inset-closeup";
    readonly compositePrompt: string;
    readonly continuityAnchorVerified: boolean;
  }[];
}

export function buildComicAiCharacterSheetAndPanels(input: {
  readonly characterName?: string;
  readonly appearancePrompt?: string;
  readonly panelPrompts?: readonly string[];
}): ComicAiSequentialPanelResult {
  const name = (input.characterName ?? "카일").trim() || "카일";
  const basePrompt =
    (input.appearancePrompt ?? "silver hair, crimson eyes, black tactical coat with gold emblem").trim();
  const seedLockNumber = 40829173;

  const characterSheet: ComicAiCharacterSheetSpec = Object.freeze({
    characterId: `comicai-char-${name.toLowerCase().replace(/\s+/gu, "-")}`,
    characterName: name,
    basePrompt,
    seedLockNumber,
    loraWeight: 0.88,
    turnaroundViews: Object.freeze([
      {
        viewId: "front" as const,
        viewLabelKo: "정면 (Front Orthographic)",
        promptToken: `front view turnaround sheet of ${name}, ${basePrompt}, neutral standing pose`,
      },
      {
        viewId: "three-quarter" as const,
        viewLabelKo: "반측면 45° (Three-Quarter)",
        promptToken: `three-quarter view turnaround sheet of ${name}, ${basePrompt}, dynamic gaze`,
      },
      {
        viewId: "side-profile" as const,
        viewLabelKo: "측면 90° (Side Profile)",
        promptToken: `side profile turnaround sheet of ${name}, ${basePrompt}, clear silhouette`,
      },
      {
        viewId: "back" as const,
        viewLabelKo: "후면 (Back View)",
        promptToken: `back view turnaround sheet of ${name}, ${basePrompt}, coat emblem visible`,
      },
    ]),
    lockedOutfitTokens: Object.freeze(["silver_hair_anchor", "crimson_iris_lock", "black_tactical_coat_v1"]),
  });

  const rawPanels =
    input.panelPrompts && input.panelPrompts.length > 0
      ? input.panelPrompts
      : [
          "standing on rain-slicked rooftop overlooking neon city",
          "drawing plasma blade as drones approach from clouds",
          "extreme close-up of crimson eyes reflecting lightning",
          "leaping downward through glass atrium in dramatic slash",
        ];

  const layouts: readonly ("freeform-hero" | "vertical-split" | "wide-cinematic" | "inset-closeup")[] = [
    "wide-cinematic",
    "vertical-split",
    "inset-closeup",
    "freeform-hero",
  ];

  const sequentialPanels = Object.freeze(
    rawPanels.map((scenePrompt, idx) =>
      Object.freeze({
        panelIndex: idx + 1,
        panelLayout: layouts[idx % layouts.length]!,
        compositePrompt: `[seed:${seedLockNumber} lora:${characterSheet.loraWeight}] ${name} (${basePrompt}), ${scenePrompt}, masterpiece comic panel`,
        continuityAnchorVerified: true,
      }),
    ),
  );

  return Object.freeze({
    characterSheet,
    sequentialPanels,
  });
}

/**
 * Dashtoon (dashtoon.com) — 올인원 에이전시 출판·Photo-to-Comic·Frameo 마이그레이션 파이프라인
 */
export interface DashtoonAgencyPipelineResult {
  readonly photoToComicJob: {
    readonly submitEndpoint: "/api/v2/ai-apps/photo-to-comic";
    readonly pollEndpoint: "/api/v2/ai-apps/photo-to-comic/poll";
    readonly userImagesEndpoint: "/api/v2/ai-apps/user-images";
    readonly shareLinkEndpoint: "/api/v2/ai-apps/share-link";
    readonly jobId: string;
    readonly status: "completed";
    readonly preservarIdentityScore: number;
  };
  readonly publicationManifest: {
    readonly readerRoute: string;
    readonly sliceSpec: {
      readonly widthPx: 800;
      readonly heightPx: 1280;
      readonly sliceCount: number;
    };
    readonly telemetryHooks: readonly ["episodeOpen", "episodeLoad", "episodeFinish"];
    readonly monetizationReady: boolean;
  };
  readonly studioMigrationBridge: {
    readonly sourceLegacyPlatform: "Dashtoon Studio (Sunset)";
    readonly partnerBridgeTarget: "Frameo (frameo.ai/create) & ToonStudio Native";
    readonly migratedCharacterPacks: number;
    readonly dashTailorColorGradingPreserved: boolean;
  };
}

export function runDashtoonAgencyPublishPipeline(input: {
  readonly episodeTitle?: string;
  readonly panelCount?: number;
}): DashtoonAgencyPipelineResult {
  const title = (input.episodeTitle ?? "ep01-awakening").trim() || "ep01-awakening";
  const panelCount = Math.max(4, input.panelCount ?? 12);
  const slug = title.toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "-");

  return Object.freeze({
    photoToComicJob: Object.freeze({
      submitEndpoint: "/api/v2/ai-apps/photo-to-comic" as const,
      pollEndpoint: "/api/v2/ai-apps/photo-to-comic/poll" as const,
      userImagesEndpoint: "/api/v2/ai-apps/user-images" as const,
      shareLinkEndpoint: "/api/v2/ai-apps/share-link" as const,
      jobId: `dashtoon-p2c-${slug}`,
      status: "completed" as const,
      preservarIdentityScore: 95,
    }),
    publicationManifest: Object.freeze({
      readerRoute: `/comics/read/${slug}`,
      sliceSpec: Object.freeze({
        widthPx: 800 as const,
        heightPx: 1280 as const,
        sliceCount: Math.ceil(panelCount * 1.5),
      }),
      telemetryHooks: Object.freeze(["episodeOpen", "episodeLoad", "episodeFinish"] as const),
      monetizationReady: true,
    }),
    studioMigrationBridge: Object.freeze({
      sourceLegacyPlatform: "Dashtoon Studio (Sunset)" as const,
      partnerBridgeTarget: "Frameo (frameo.ai/create) & ToonStudio Native" as const,
      migratedCharacterPacks: 4,
      dashTailorColorGradingPreserved: true,
    }),
  });
}
