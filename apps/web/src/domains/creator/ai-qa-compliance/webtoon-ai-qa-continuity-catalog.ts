/**
 * 웹툰 AI 자동 검수(1~3번 모듈) 타입 · 규칙 카탈로그 · 샘플 픽스처
 *
 * - 1) 국가별(KR/JP/SEA/US)·연령등급 심의 정책 및 실제 상표권 규칙
 * - 2) 한국어 대표 맞춤법/띄어쓰기 규칙
 * - 3) 180도 시선·소품 연속성 타입 및 샘플 원고 픽스처
 */

export type ComplianceRegion = "KR" | "JP" | "SEA" | "US";
export type AgeRatingTier = "ALL" | "12+" | "15+" | "19+";
export type ComplianceCategory =
  | "violence"
  | "exposure"
  | "smoking"
  | "alcohol"
  | "self-harm"
  | "trademark-brand";
export type ComplianceSeverity = "block" | "warn" | "info";
export type ComplianceRemediationType =
  | "mosaic-layer"
  | "blur-cover"
  | "brand-parody-replace"
  | "crop-reframe"
  | "trigger-warning-card";

export interface NormalizedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComplianceBoundingHint {
  readonly label: string;
  readonly box: NormalizedBox;
}

export interface ComplianceCutInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneSummary: string;
  readonly dialogueText: string;
  readonly visualTags: readonly string[];
  readonly detectedTextInArt: readonly string[];
  readonly boundingHints?: readonly ComplianceBoundingHint[];
}

export interface ComplianceScanInput {
  readonly region: ComplianceRegion;
  readonly targetRating: AgeRatingTier;
  readonly cuts: readonly ComplianceCutInput[];
}

export interface ComplianceOverlayLayerSpec {
  readonly layerName: string;
  readonly blendMode: "normal" | "screen";
  readonly opacity: number;
  readonly pixelSizePx?: number;
  readonly box: NormalizedBox;
}

export interface ComplianceFinding {
  readonly id: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly category: ComplianceCategory;
  readonly severity: ComplianceSeverity;
  readonly ruleCode: string;
  readonly matchedToken: string;
  readonly reasonKo: string;
  readonly remediationType: ComplianceRemediationType;
  readonly remediationLabelKo: string;
  readonly suggestedReplacementText?: string;
  readonly overlayLayerSpec: ComplianceOverlayLayerSpec;
}

export interface RegionalComplianceReport {
  readonly region: ComplianceRegion;
  readonly targetRating: AgeRatingTier;
  readonly regionPolicyLabelKo: string;
  readonly verdict: "PASS" | "REVIEW" | "BLOCKED";
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly trademarkCount: number;
  readonly recommendedRatingForRegion: AgeRatingTier;
  readonly findings: readonly ComplianceFinding[];
}

export interface AppliedComplianceRemediationResult {
  readonly appliedIds: readonly string[];
  readonly remainingBlockingCount: number;
  readonly remainingWarningCount: number;
  readonly updatedVerdict: "PASS" | "REVIEW" | "BLOCKED";
  readonly generatedLayers: readonly {
    readonly findingId: string;
    readonly cutNumber: number;
    readonly layerName: string;
    readonly remediationType: ComplianceRemediationType;
    readonly replacementText?: string;
  }[];
}

export type SpeechRegister = "honorific" | "casual";
export type DetectedSpeechRegister = SpeechRegister | "neutral";

export interface CharacterSpeechContract {
  readonly speakerId: string;
  readonly speakerName: string;
  readonly listenerId: string;
  readonly listenerName: string;
  readonly expectedRegister: SpeechRegister;
  readonly relationshipNoteKo: string;
}

export interface DialogueBalloonAuditInput {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly speakerId: string;
  readonly listenerId: string;
  readonly text: string;
  readonly isMonologue?: boolean;
}

export interface KoreanSpellingIssue {
  readonly id: string;
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly originalFragment: string;
  readonly suggestedFragment: string;
  readonly category: "spelling" | "spacing";
  readonly reasonKo: string;
}

export interface SpeechRegisterViolation {
  readonly id: string;
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly speakerName: string;
  readonly listenerName: string;
  readonly expectedRegister: SpeechRegister;
  readonly detectedRegister: SpeechRegister;
  readonly originalText: string;
  readonly suggestedText: string;
  readonly reasonKo: string;
}

export interface KoreanGrammarRegisterReport {
  readonly totalBalloonsAudited: number;
  readonly spellingIssues: readonly KoreanSpellingIssue[];
  readonly registerViolations: readonly SpeechRegisterViolation[];
  readonly correctedTextByBalloonId: Readonly<Record<string, string>>;
  readonly consistencyScore: number;
}

export type GazeDirection = "left" | "right" | "camera" | "up" | "down";
export type PropHandSide = "left" | "right" | "both" | "holstered";

export interface CutCharacterProp {
  readonly propId: string;
  readonly propName: string;
  readonly hand: PropHandSide;
  readonly transferActionDeclared?: boolean;
}

export interface CutCharacterPose {
  readonly characterId: string;
  readonly characterName: string;
  readonly screenXNorm: number;
  readonly gazeDirection: GazeDirection;
  readonly talkingToCharacterId?: string;
  readonly props?: readonly CutCharacterProp[];
}

export interface ContinuityCutInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly cameraAxisResetDeclared?: boolean;
  readonly characters: readonly CutCharacterPose[];
}

export interface EyelineContinuityIssue {
  readonly id: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly previousCutNumber?: number;
  readonly sceneId: string;
  readonly kind: "EYELINE_MISALIGNED_SAME_CUT" | "AXIS_180_VIOLATION";
  readonly severity: "block" | "warn";
  readonly participantsKo: string;
  readonly reasonKo: string;
  readonly fixSuggestionKo: string;
}

export interface PropContinuityIssue {
  readonly id: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly previousCutNumber: number;
  readonly sceneId: string;
  readonly characterName: string;
  readonly propName: string;
  readonly previousHand: "left" | "right";
  readonly currentHand: "left" | "right";
  readonly severity: "block" | "warn";
  readonly reasonKo: string;
  readonly fixSuggestionKo: string;
}

export interface ContinuityAuditReport {
  readonly totalCutsChecked: number;
  readonly eyelineIssues: readonly EyelineContinuityIssue[];
  readonly propIssues: readonly PropContinuityIssue[];
  readonly continuityScore: number;
  readonly verdict: "PASS" | "WARN" | "BLOCKED";
}

export const COMPLIANCE_REGION_POLICIES: Readonly<
  Record<ComplianceRegion, { readonly labelKo: string; readonly regulatorKo: string; readonly summaryKo: string }>
> = {
  KR: {
    labelKo: "한국 (KR · 방통위/네이버·카카오)",
    regulatorKo: "방송통신심의위원회 · 국내 연재 기준",
    summaryKo: "전체/12/15/19세 등급별 폭력·노출·흡연·음주·자해 및 상표권 사전 차단",
  },
  JP: {
    labelKo: "일본 (JP · 픽코마/라인망가)",
    regulatorKo: "픽코마 · 일본 심의 가이드라인",
    summaryKo: "미성년 흡연·음주 엄격 차단, 과도한 혈흔·노출 시 백광/모자이크 가림 필수",
  },
  SEA: {
    labelKo: "동남아 (SEA · 인니/태국/베트남)",
    regulatorKo: "동남아 보수 문화권 연재 심의",
    summaryKo: "신체 노출·음주·흡연 기준을 한국 대비 1단계 이상 보수적으로 적용",
  },
  US: {
    labelKo: "북미·글로벌 (US · WEBTOON Global)",
    regulatorKo: "WEBTOON Global 콘텐츠·상표권 정책",
    summaryKo: "자해 트리거 경고·극단적 폭력 제한 및 실제 상표 로고 침해 엄격 차단",
  },
};

export interface TrademarkRule {
  readonly canonical: string;
  readonly patterns: readonly RegExp[];
  readonly parodySuggestion: string;
  readonly alsoAlcohol?: boolean;
}

export const TRADEMARK_RULES: readonly TrademarkRule[] = [
  { canonical: "스타벅스", patterns: [/스타벅스/iu, /\bstarbucks\b/iu], parodySuggestion: "별빛카페 / 스타빈스" },
  { canonical: "코카콜라", patterns: [/코카\s?콜라/iu, /\bcoca[\s-]?cola\b/iu], parodySuggestion: "코코소다 / 레드콜라" },
  { canonical: "나이키", patterns: [/나이키/iu, /\bnike\b/iu], parodySuggestion: "스피드런 / V-런" },
  { canonical: "애플 아이폰", patterns: [/아이폰/iu, /\biphone\b/iu, /\bapple\s*logo\b/iu, /애플\s*로고/iu], parodySuggestion: "피치폰 / 스튜디오폰" },
  { canonical: "맥도날드", patterns: [/맥도날드/iu, /\bmcdonald'?s?\b/iu], parodySuggestion: "골든버거 / W버거" },
  { canonical: "구찌", patterns: [/구찌/iu, /\bgucci\b/iu], parodySuggestion: "루체 / 구치오" },
  { canonical: "샤넬", patterns: [/샤넬/iu, /\bchanel\b/iu], parodySuggestion: "메종 클레르" },
  { canonical: "삼성 갤럭시", patterns: [/갤럭시\s?s\d+/iu, /삼성\s*로고/iu, /\bsamsung\b/iu], parodySuggestion: "스텔라폰 / 네오S" },
  { canonical: "카카오톡", patterns: [/카카오톡/iu, /\bkakaotalk\b/iu], parodySuggestion: "톡톡 메신저" },
  { canonical: "편의점 상표(GS25/CU/세븐일레븐)", patterns: [/\bgs25\b/iu, /세븐일레븐/iu, /\b7-eleven\b/iu, /cu\s*편의점/iu], parodySuggestion: "24시 블루마트" },
  { canonical: "참이슬/진로/카스", patterns: [/참이슬/iu, /진로\s*소주/iu, /카스\s*맥주/iu], parodySuggestion: "맑은이슬 / 골드라거", alsoAlcohol: true },
];

export interface ContentSignalRule {
  readonly category: Exclude<ComplianceCategory, "trademark-brand">;
  readonly intensity: "low" | "medium" | "high";
  readonly patterns: readonly RegExp[];
  readonly labelKo: string;
}

export const CONTENT_SIGNAL_RULES: readonly ContentSignalRule[] = [
  { category: "self-harm", intensity: "high", patterns: [/자해/iu, /손목.{0,6}긋/iu, /극단적\s*선택/iu, /투신/iu, /self[\s-]?harm/iu, /suicide/iu], labelKo: "자해·극단적 선택 묘사" },
  { category: "violence", intensity: "high", patterns: [/절단/iu, /선혈\s*낭자/iu, /유혈/iu, /과다\s*출혈/iu, /고어/iu, /gore/iu, /dismember/iu, /흉기\s*찌름/iu], labelKo: "고수위 유혈·흉기 폭력" },
  { category: "violence", intensity: "medium", patterns: [/피\s*흘림/iu, /혈흔/iu, /칼부림/iu, /구타/iu, /blood/iu, /knife\s*attack/iu], labelKo: "중수위 폭력·혈흔 묘사" },
  { category: "exposure", intensity: "high", patterns: [/전신\s*노출/iu, /나체/iu, /속옷\s*노출/iu, /과도한\s*노출/iu, /nudity/iu, /lingerie\s*closeup/iu], labelKo: "직접 신체·속옷 노출" },
  { category: "exposure", intensity: "medium", patterns: [/수영복\s*클로즈업/iu, /가슴골/iu, /허벅지\s*강조/iu, /cleavage/iu, /swimsuit\s*closeup/iu], labelKo: "부분 신체 강조 노출" },
  { category: "smoking", intensity: "high", patterns: [/미성년\s*흡연/iu, /교복.{0,6}담배/iu, /underage\s*smoking/iu], labelKo: "미성년 흡연 묘사" },
  { category: "smoking", intensity: "medium", patterns: [/담배/iu, /흡연/iu, /전자담배/iu, /라이터.{0,6}불/iu, /cigarette/iu, /smoking/iu, /vape/iu], labelKo: "흡연·담배 연기 노출" },
  { category: "alcohol", intensity: "high", patterns: [/미성년\s*음주/iu, /교복.{0,6}술/iu, /폭음/iu, /underage\s*drinking/iu], labelKo: "미성년 음주·과음 묘사" },
  { category: "alcohol", intensity: "medium", patterns: [/소주병/iu, /맥주캔/iu, /음주/iu, /술잔/iu, /술병/iu, /alcohol/iu, /beer\s*can/iu, /soju/iu], labelKo: "음주·주류 용기 노출" },
];

export interface SpellingRule {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly category: "spelling" | "spacing";
  readonly reasonKo: string;
}

export const KOREAN_SPELLING_RULES: readonly SpellingRule[] = [
  { pattern: /안되요/gu, replacement: "안 돼요", category: "spelling", reasonKo: "'안 되어(요)'의 준말은 '안 돼요'이며 부사 '안' 뒤는 띄어 씁니다." },
  { pattern: /되요/gu, replacement: "돼요", category: "spelling", reasonKo: "'되어요'의 준말은 '돼요'로 표기합니다." },
  { pattern: /안되서/gu, replacement: "안 돼서", category: "spelling", reasonKo: "'되어서'의 준말은 '돼서'로 표기합니다." },
  { pattern: /(?<![안못])되서/gu, replacement: "돼서", category: "spelling", reasonKo: "'되어서'의 준말은 '돼서'입니다." },
  { pattern: /몇일/gu, replacement: "며칠", category: "spelling", reasonKo: "표준어 규정에 따라 '며칠'로 표기합니다." },
  { pattern: /어떻해/gu, replacement: "어떡해", category: "spelling", reasonKo: "'어떻게 해'의 준말은 '어떡해'입니다." },
  { pattern: /금새/gu, replacement: "금세", category: "spelling", reasonKo: "'금시에'의 준말은 '금세'입니다." },
  { pattern: /어의없/gu, replacement: "어이없", category: "spelling", reasonKo: "표준 표기는 '어이없다'입니다." },
  { pattern: /역활/gu, replacement: "역할", category: "spelling", reasonKo: "표준 표기는 '역할'입니다." },
  { pattern: /오랫만/gu, replacement: "오랜만", category: "spelling", reasonKo: "'오래간만'의 준말은 '오랜만'입니다." },
  { pattern: /일찍히/gu, replacement: "일찍이", category: "spelling", reasonKo: "부사 파생 접미사 '-이'가 붙어 '일찍이'로 씁니다." },
  { pattern: /설레임/gu, replacement: "설렘", category: "spelling", reasonKo: "기본형 '설레다'의 명사형은 '설렘'입니다." },
  { pattern: /왠일/gu, replacement: "웬일", category: "spelling", reasonKo: "'어찌 된 일'의 뜻은 관형사 '웬'을 써서 '웬일'로 표기합니다." },
  { pattern: /웬지/gu, replacement: "왠지", category: "spelling", reasonKo: "'왜인지'의 준말은 '왠지'로 표기합니다." },
  { pattern: /할께/gu, replacement: "할게", category: "spelling", reasonKo: "의지·약속 어미는 '-(으)ㄹ게'로 표기합니다." },
  { pattern: /갈께/gu, replacement: "갈게", category: "spelling", reasonKo: "의지·약속 어미는 '-(으)ㄹ게'로 표기합니다." },
  { pattern: /볼께/gu, replacement: "볼게", category: "spelling", reasonKo: "의지·약속 어미는 '-(으)ㄹ게'로 표기합니다." },
  { pattern: /줄께/gu, replacement: "줄게", category: "spelling", reasonKo: "의지·약속 어미는 '-(으)ㄹ게'로 표기합니다." },
  { pattern: /할수있/gu, replacement: "할 수 있", category: "spacing", reasonKo: "의존명사 '수'는 앞말과 띄어 씁니다." },
  { pattern: /할수없/gu, replacement: "할 수 없", category: "spacing", reasonKo: "의존명사 '수'는 앞말과 띄어 씁니다." },
  { pattern: /볼수없/gu, replacement: "볼 수 없", category: "spacing", reasonKo: "의존명사 '수'는 앞말과 띄어 씁니다." },
  { pattern: /인것같/gu, replacement: "인 것 같", category: "spacing", reasonKo: "의존명사 '것'은 앞말과 띄어 씁니다." },
  { pattern: /하는거야/gu, replacement: "하는 거야", category: "spacing", reasonKo: "의존명사 '거(것)'는 앞말과 띄어 씁니다." },
];

export const SAMPLE_COMPLIANCE_CUTS: readonly ComplianceCutInput[] = [
  {
    cutId: "cut-04",
    cutNumber: 4,
    sceneSummary: "비 오는 골목 편의점 앞에서 담배를 피우며 대화하는 장면",
    dialogueText: "잠깐만 기다려.",
    visualTags: ["담배", "야간 골목"],
    detectedTextInArt: ["스타벅스", "GS25"],
    boundingHints: [
      { label: "스타벅스", box: { x: 0.62, y: 0.14, width: 0.24, height: 0.16 } },
      { label: "담배", box: { x: 0.36, y: 0.48, width: 0.14, height: 0.12 } },
    ],
  },
  {
    cutId: "cut-09",
    cutNumber: 9,
    sceneSummary: "포장마차에서 소주병과 술잔을 두고 대치하는 주인공",
    dialogueText: "이번 계약은 여기서 끝냅시다.",
    visualTags: ["소주병", "술잔"],
    detectedTextInArt: ["참이슬"],
    boundingHints: [{ label: "참이슬", box: { x: 0.44, y: 0.66, width: 0.16, height: 0.2 } }],
  },
  {
    cutId: "cut-14",
    cutNumber: 14,
    sceneSummary: "옥상 결투 직후 어깨에 혈흔이 묻은 상태",
    dialogueText: "아직 안 끝났어.",
    visualTags: ["혈흔", "옥상"],
    detectedTextInArt: [],
  },
];

export const SAMPLE_SPEECH_CONTRACTS: readonly CharacterSpeechContract[] = [
  {
    speakerId: "char-seoyeon",
    speakerName: "한서연(신입 형사)",
    listenerId: "char-chief",
    listenerName: "박 반장",
    expectedRegister: "honorific",
    relationshipNoteKo: "부하 → 상사 (존댓말 고정)",
  },
  {
    speakerId: "char-minjun",
    speakerName: "이민준",
    listenerId: "char-seoyeon",
    listenerName: "한서연",
    expectedRegister: "casual",
    relationshipNoteKo: "동기·소꿉친구 (반말 고정)",
  },
];

export const SAMPLE_DIALOGUE_BALLOONS: readonly DialogueBalloonAuditInput[] = [
  { balloonId: "b-01", cutNumber: 5, speakerId: "char-seoyeon", listenerId: "char-chief", text: "반장님, 몇일 전 현장 자료는 지금 정리하면 되요?" },
  { balloonId: "b-02", cutNumber: 8, speakerId: "char-seoyeon", listenerId: "char-chief", text: "알았어, 지금 바로 갈께!" },
  { balloonId: "b-03", cutNumber: 11, speakerId: "char-minjun", listenerId: "char-seoyeon", text: "서연아, 어의없게 할수없다고 하지 말고 같이 가세요." },
  { balloonId: "b-04", cutNumber: 12, speakerId: "char-seoyeon", listenerId: "char-chief", text: "이상하다… 분명 여기 있었는데.", isMonologue: true },
];

export const SAMPLE_CONTINUITY_CUTS: readonly ContinuityCutInput[] = [
  {
    cutId: "cut-10",
    cutNumber: 10,
    sceneId: "scene-rooftop",
    characters: [
      {
        characterId: "char-seoyeon",
        characterName: "한서연",
        screenXNorm: 0.25,
        gazeDirection: "right",
        talkingToCharacterId: "char-villain",
        props: [{ propId: "prop-sword", propName: "은빛 단검", hand: "right" }],
      },
      {
        characterId: "char-villain",
        characterName: "강도윤",
        screenXNorm: 0.76,
        gazeDirection: "left",
        talkingToCharacterId: "char-seoyeon",
      },
    ],
  },
  {
    cutId: "cut-11",
    cutNumber: 11,
    sceneId: "scene-rooftop",
    characters: [
      {
        characterId: "char-villain",
        characterName: "강도윤",
        screenXNorm: 0.5,
        gazeDirection: "right",
        talkingToCharacterId: "char-seoyeon",
      },
    ],
  },
  {
    cutId: "cut-12",
    cutNumber: 12,
    sceneId: "scene-rooftop",
    characters: [
      {
        characterId: "char-seoyeon",
        characterName: "한서연",
        screenXNorm: 0.3,
        gazeDirection: "right",
        talkingToCharacterId: "char-villain",
        props: [{ propId: "prop-sword", propName: "은빛 단검", hand: "left" }],
      },
    ],
  },
];
