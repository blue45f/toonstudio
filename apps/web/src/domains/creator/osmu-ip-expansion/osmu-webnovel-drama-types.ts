/**
 * OSMU IP 확장 엔진 1부 — 웹툰 ↔ 웹소설 양방향 각색 + 웹드라마/OTT 영상화 피칭 패키저.
 *
 * 100% 무과금(₩0) 로컬 결정론적 규칙 엔진으로 외부 API 호출이나 확률적 변동을 쓰지 않는다.
 * 동일 입력에 대해 항상 바이트 단위로 동일한 원고·콘티·피치 바이블을 생성한다.
 */

export type WebnovelPlatformId = "kakaopage" | "munpia" | "naver-series";
export type NarratorPov = "third-person-limited" | "first-person";
export type WebtoonCutEmotion =
  | "tension"
  | "wonder"
  | "sorrow"
  | "determination"
  | "relief"
  | "shock";

interface WebtoonDialogueLine {
  readonly speaker: string;
  readonly line: string;
  readonly tone?: string;
}

export interface WebtoonCutInput {
  readonly cutNumber: number;
  readonly sceneHeading: string;
  readonly location: string;
  readonly timeOfDay: string;
  readonly emotion: WebtoonCutEmotion;
  readonly cameraCue: string;
  readonly backgroundDescription: string;
  readonly actionStageDirection: string;
  readonly sfx?: readonly string[];
  readonly dialogues: readonly WebtoonDialogueLine[];
  readonly narration?: string;
}

export interface WebtoonEpisodeSource {
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly genre: string;
  readonly platform: WebnovelPlatformId;
  readonly pov: NarratorPov;
  readonly protagonistName: string;
  readonly targetCharCount?: number;
  readonly cuts: readonly WebtoonCutInput[];
}

interface WebnovelPlatformSpec {
  readonly id: WebnovelPlatformId;
  readonly labelKo: string;
  readonly targetMinChars: number;
  readonly targetMaxChars: number;
  readonly recommendedChars: number;
  readonly pacingGuideKo: string;
  readonly quoteOpen: string;
  readonly quoteClose: string;
}

export interface WebnovelParagraphBlock {
  readonly index: number;
  readonly sceneHeading: string;
  readonly sourceCutNumbers: readonly number[];
  readonly kind:
    | "scene-setting"
    | "action"
    | "dialogue"
    | "inner-monologue"
    | "cliffhanger";
  readonly speaker?: string;
  readonly text: string;
}

export interface AlignedSpeakerDialogue {
  readonly cutNumber: number;
  readonly speaker: string;
  readonly tone: string;
  readonly originalLine: string;
  readonly formattedLine: string;
}

export interface WebnovelAdaptationResult {
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly chapterTitle: string;
  readonly platform: WebnovelPlatformId;
  readonly platformSpec: WebnovelPlatformSpec;
  readonly pov: NarratorPov;
  readonly openingHook: string;
  readonly endingHook: string;
  readonly paragraphs: readonly WebnovelParagraphBlock[];
  readonly fullProse: string;
  readonly charCountWithSpaces: number;
  readonly charCountWithoutSpaces: number;
  readonly meetsPlatformRange: boolean;
  readonly readingTimeMinutes: number;
  readonly dialogueRatioPercent: number;
  readonly speakerDialogueAlignment: readonly AlignedSpeakerDialogue[];
  readonly preservedCutCount: number;
  readonly preservedDialogueCount: number;
  readonly markdownExport: string;
}

export type ContiShotSize =
  | "EXTREME_WIDE"
  | "WIDE"
  | "MEDIUM"
  | "CLOSE_UP"
  | "EXTREME_CLOSE_UP"
  | "INSERT";

export interface WebtoonContiPanel {
  readonly panelNumber: number;
  readonly shotSize: ContiShotSize;
  readonly visualDirection: string;
  readonly dialogues: readonly { readonly speaker: string; readonly text: string }[];
  readonly narrations: readonly string[];
  readonly sfxSuggestions: readonly string[];
  readonly scrollBeatHeightPx: number;
}

export interface WebtoonSceneBreakdown {
  readonly sceneNumber: number;
  readonly heading: string;
  readonly locationHint: string;
  readonly mood: WebtoonCutEmotion;
  readonly allocatedCutCount: number;
  readonly cutStart: number;
  readonly cutEnd: number;
  readonly pacing:
    | "establishing"
    | "dialogue-exchange"
    | "tension-build"
    | "climax"
    | "cliffhanger";
  readonly panels: readonly WebtoonContiPanel[];
}

export interface WebtoonCharacterCard {
  readonly name: string;
  readonly roleHint: "주연" | "조연" | "단역";
  readonly dialogueCount: number;
  readonly firstAppearanceScene: number;
  readonly sampleQuote: string;
  readonly detectedEmotions: readonly string[];
}

export interface WebtoonOutlineFromNovelResult {
  readonly episodeTitle: string;
  readonly scenes: readonly WebtoonSceneBreakdown[];
  readonly characterCards: readonly WebtoonCharacterCard[];
  readonly totalAllocatedCuts: number;
  readonly dialogueBlocks: readonly {
    readonly sceneNumber: number;
    readonly speaker: string;
    readonly text: string;
  }[];
  readonly narrationBlocks: readonly {
    readonly sceneNumber: number;
    readonly text: string;
  }[];
  readonly roundTripCoverage: {
    readonly totalSourceDialogues: number;
    readonly extractedDialogues: number;
    readonly totalSourceParagraphs: number;
    readonly preservedTextRatioPercent: number;
  };
  readonly markdownExport: string;
}

export type DramaPlatformId = "netflix" | "tving" | "disney-plus" | "shortform-drama";
export type DramaFormatId = "ott-12ep" | "shortform-50ep";
export type BudgetTierId = "low" | "mid" | "tentpole";
export type VfxDifficultyLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "HERO_CG";

export interface DramaKeySceneInput {
  readonly sceneId: string;
  readonly title: string;
  readonly setting: string;
  readonly interiorExterior: "INT" | "EXT" | "INT/EXT";
  readonly timeOfDay: string;
  readonly actionSummary: string;
  readonly vfxElements: readonly string[];
  readonly stuntRequired: boolean;
  readonly crowdScale: "small" | "medium" | "large";
}

export interface DramaCharacterInput {
  readonly name: string;
  readonly roleType: "lead" | "co-lead" | "supporting" | "antagonist";
  readonly ageRange: string;
  readonly archetype: string;
  readonly coreDesire: string;
  readonly flaw: string;
  readonly actingKeywords: readonly string[];
  readonly chemistryNote: string;
}

export interface DramaPitchIpInput {
  readonly title: string;
  readonly genre: string;
  readonly subGenre: string;
  readonly targetPlatform: DramaPlatformId;
  readonly format: DramaFormatId;
  readonly budgetTier: BudgetTierId;
  readonly premise: string;
  readonly protagonistSummary: string;
  readonly antagonistOrConflict: string;
  readonly differentiators: readonly string[];
  readonly targetAudienceKo: string;
  readonly episodesPublished: number;
  readonly coreAppealKeywords: readonly string[];
  readonly keyScenes: readonly DramaKeySceneInput[];
  readonly characters: readonly DramaCharacterInput[];
}

export interface SeasonEpisodeArc {
  readonly episodeNumber: number;
  readonly actNumber: 1 | 2 | 3 | 4;
  readonly actLabelKo: string;
  readonly title: string;
  readonly beatSummary: string;
  readonly cliffhangerHook: string;
  readonly tensionScore: number;
  readonly estimatedRuntimeMin: number;
}

export interface SceneProductionAssessment {
  readonly sceneId: string;
  readonly title: string;
  readonly locationTag: string;
  readonly locationTier: "실내 세트" | "로케이션 촬영" | "대형 특수 로케이션";
  readonly vfxDifficulty: VfxDifficultyLevel;
  readonly vfxScore: number;
  readonly recommendedBudgetTier: BudgetTierId;
  readonly estimatedSceneCostMillionKrw: number;
  readonly shootingDays: number;
  readonly riskFlags: readonly string[];
}

export interface CastingProfileSheet {
  readonly characterName: string;
  readonly roleLabelKo: string;
  readonly ageRange: string;
  readonly archetype: string;
  readonly visualVibe: string;
  readonly actingRequirements: readonly string[];
  readonly screenTimeSharePercent: number;
  readonly chemistryWithLead: string;
  readonly auditionSidePrompt: string;
}

export interface DramaPitchPackage {
  readonly onePageProposal: {
    readonly title: string;
    readonly platformId: DramaPlatformId;
    readonly platformLabelKo: string;
    readonly formatId: DramaFormatId;
    readonly formatLabelKo: string;
    readonly episodeCount: number;
    readonly runtimePerEpisodeMin: number;
    readonly logline: string;
    readonly targetAudience: {
      readonly primary: string;
      readonly secondary: string;
      readonly platformFitReason: string;
    };
    readonly differentiators: readonly string[];
    readonly hookStatement: string;
    readonly comparablePositioning: string;
  };
  readonly seasonArc: readonly SeasonEpisodeArc[];
  readonly sceneProductionMatrix: readonly SceneProductionAssessment[];
  readonly budgetSummary: {
    readonly selectedTier: BudgetTierId;
    readonly tierLabelKo: string;
    readonly perEpisodeMillionKrw: number;
    readonly totalSeasonMillionKrw: number;
    readonly vfxBudgetSharePercent: number;
    readonly locationBudgetSharePercent: number;
    readonly castAndCrewSharePercent: number;
    readonly highestSceneVfx: VfxDifficultyLevel;
    readonly tierFitAssessment: "적정" | "예산 상향 권고" | "여유";
    readonly recommendationNote: string;
  };
  readonly castingProfiles: readonly CastingProfileSheet[];
  readonly jsonExport: string;
  readonly markdownExport: string;
}

export const WEBNOVEL_PLATFORM_SPECS: Readonly<Record<WebnovelPlatformId, WebnovelPlatformSpec>> =
  Object.freeze({
    kakaopage: {
      id: "kakaopage",
      labelKo: "카카오페이지 (모바일 속도형)",
      targetMinChars: 4500,
      targetMaxChars: 5500,
      recommendedChars: 5000,
      pacingGuideKo: "짧은 단문 호흡 · 3줄 이내 문단 전환 · 강한 회차 엔딩 훅",
      quoteOpen: "“",
      quoteClose: "”",
    },
    munpia: {
      id: "munpia",
      labelKo: "문피아 (장르 몰입형)",
      targetMinChars: 4600,
      targetMaxChars: 5500,
      recommendedChars: 5150,
      pacingGuideKo: "세계관 설정 밀도 강화 · 액션/전술 묘사 강조 · 묵직한 대사 호흡",
      quoteOpen: "“",
      quoteClose: "”",
    },
    "naver-series": {
      id: "naver-series",
      labelKo: "네이버시리즈 (감정선·대중형)",
      targetMinChars: 4500,
      targetMaxChars: 5400,
      recommendedChars: 4950,
      pacingGuideKo: "인물 감정선·관계 텐션 중심 · 시각적 장면 전환 · 선명한 대화 대비",
      quoteOpen: "“",
      quoteClose: "”",
    },
  });

export const DRAMA_BUDGET_TIER_SPECS: Readonly<
  Record<
    BudgetTierId,
    {
      readonly labelKo: string;
      readonly ottPerEpisodeMillionKrw: number;
      readonly shortformPerEpisodeMillionKrw: number;
      readonly maxRecommendedVfxScore: number;
    }
  >
> = Object.freeze({
  low: {
    labelKo: "저예산 인디·숏폼",
    ottPerEpisodeMillionKrw: 450,
    shortformPerEpisodeMillionKrw: 18,
    maxRecommendedVfxScore: 35,
  },
  mid: {
    labelKo: "중예산 스탠다드 OTT",
    ottPerEpisodeMillionKrw: 1450,
    shortformPerEpisodeMillionKrw: 42,
    maxRecommendedVfxScore: 68,
  },
  tentpole: {
    labelKo: "텐트폴 글로벌 블록버스터",
    ottPerEpisodeMillionKrw: 3800,
    shortformPerEpisodeMillionKrw: 95,
    maxRecommendedVfxScore: 100,
  },
});


export const SAMPLE_WEBTOON_EPISODE: WebtoonEpisodeSource = Object.freeze<WebtoonEpisodeSource>({
  seriesTitle: "시간의 대장간",
  episodeNumber: 1,
  episodeTitle: "멈춘 시계탑의 첫 번째 계약",
  genre: "어반 판타지 미스터리",
  platform: "kakaopage",
  pov: "third-person-limited",
  protagonistName: "서진우",
  targetCharCount: 5000,
  cuts: [
    {
      cutNumber: 1,
      sceneHeading: "폐역 시계탑 외경",
      location: "구 서울역 낡은 시계탑 옥상",
      timeOfDay: "비 내리는 자정",
      emotion: "tension",
      cameraCue: "하이 앵글 롱샷",
      backgroundDescription:
        "네온 불빛이 젖은 아스팔트 위로 번지고, 십 년째 멈춰 있던 거대한 시계 바늘 위로 빗방울이 부서졌다.",
      actionStageDirection:
        "서진우가 젖은 코트 깃을 세우며 난간 끝에 서서 시계 문자판의 금 간 틈을 응시한다.",
      sfx: ["후두둑", "우르릉"],
      dialogues: [
        {
          speaker: "서진우",
          line: "열두 시를 넘겼는데도 초침이 움직이질 않아. 이번에도 시간 틈이 열렸군.",
          tone: "냉정",
        },
      ],
      narration: "사람들은 이 시계탑을 철거 예정지라고 불렀지만, 내 눈에는 도심 한복판의 균열로 보였다.",
    },
    {
      cutNumber: 2,
      sceneHeading: "시계탑 내부 톱니방",
      location: "시계탑 내부 거대 톱니바퀴 공간",
      timeOfDay: "자정 직후",
      emotion: "wonder",
      cameraCue: "로우 앵글 광각",
      backgroundDescription:
        "녹슨 황동 톱니바퀴 사이로 푸른 불꽃 같은 시간 입자가 거꾸로 떠올라 허공을 채웠다.",
      actionStageDirection:
        "한서연이 오래된 회중시계를 들어 올려 톱니 중심축에 맞추자 숨겨진 화로가 붉게 깨어난다.",
      sfx: ["철컥", "위이잉"],
      dialogues: [
        {
          speaker: "한서연",
          line: "늦었어요, 진우 씨. 화로 온도가 떨어지면 잃어버린 사흘을 다시 벼려낼 수 없어요.",
          tone: "다급",
        },
        {
          speaker: "서진우",
          line: "대가부터 확인하지. 이번 계약에서 깎아내야 할 기억은 누구의 것이지?",
          tone: "결연",
        },
      ],
      narration: "시간을 되돌리는 대장간에는 언제나 같은 무게의 기억이 연료로 필요했다.",
    },
    {
      cutNumber: 3,
      sceneHeading: "화로의 그림자 대치",
      location: "시간의 대장간 중앙 모루 앞",
      timeOfDay: "새벽 1시",
      emotion: "shock",
      cameraCue: "익스트림 클로즈업",
      backgroundDescription:
        "달궈진 모루 위 쇳조각에 서울 도심 지도와 내일 날짜의 속보 헤드라인이 불빛으로 새겨졌다.",
      actionStageDirection:
        "강태오가 철문을 걷어차고 들어서며 검은 봉인서를 모루 위로 던진다.",
      sfx: ["콰앙!", "치이익"],
      dialogues: [
        {
          speaker: "강태오",
          line: "그 화로 당장 꺼라. 네가 되살리려는 사흘 뒤에 도시 전체가 멈추게 돼.",
          tone: "분노",
        },
        {
          speaker: "한서연",
          line: "거짓말이에요! 멈춘 건 도시가 아니라 당신이 감춘 그날 밤의 진실이잖아요!",
          tone: "경악",
        },
      ],
      narration: "모루 위 쇳조각이 갈라지며 붉은 불꽃 속에서 두 번째 계약자의 이름이 떠올랐다.",
    },
  ],
});

export const SAMPLE_DRAMA_PITCH_INPUT: DramaPitchIpInput = Object.freeze<DramaPitchIpInput>({
  title: "시간의 대장간",
  genre: "어반 판타지",
  subGenre: "타임 미스터리 스릴러",
  targetPlatform: "netflix",
  format: "ott-12ep",
  budgetTier: "mid",
  premise: "서울 도심 멈춘 시계탑 지하에서 기억을 태워 잃어버린 시간을 벼려내는 비밀 대장간 이야기.",
  protagonistSummary: "기억 감정이 가능한 몰락한 시계 장인 서진우",
  antagonistOrConflict: "시간 균열을 독점해 재난을 은폐하려는 시간국 감찰관 강태오",
  differentiators: [
    "한국 근현대 서울역·구도심 건축을 판타지 대장간으로 재해석한 고유 시각 미술",
    "매 화 ‘되돌린 시간 = 태워야 할 기억’이라는 명확한 등가교환 딜레마",
    "웹툰 120화 완결 서사를 4막 12부작(또는 50부작 숏폼)으로 밀도 있게 압축",
  ],
  targetAudienceKo: "2030 장르물 코어 시청층 및 웹툰 원작 팬덤",
  episodesPublished: 120,
  coreAppealKeywords: ["시간역전", "등가교환", "도심판타지", "반전스릴러"],
  keyScenes: [
    {
      sceneId: "S01",
      title: "자정 빗속 시계탑 균열 각성",
      setting: "구 서울역 시계탑 옥상",
      interiorExterior: "EXT",
      timeOfDay: "야간·우천",
      actionSummary: "빗방울이 허공에 정지하고 시계 문자판에서 푸른 시간 입자가 역류한다.",
      vfxElements: ["정지 빗방울 시뮬레이션", "시간 입자 역류 CG"],
      stuntRequired: false,
      crowdScale: "small",
    },
    {
      sceneId: "S02",
      title: "지하 톱니 대장간 첫 단조",
      setting: "시계탑 지하 거대 톱니 화로실",
      interiorExterior: "INT",
      timeOfDay: "심야",
      actionSummary: "기억의 파편을 화로에 넣자 모루 위에서 사라진 사흘의 영상이 쇠로 벼려진다.",
      vfxElements: ["기억 불꽃 셰이더", "홀로그램 각인"],
      stuntRequired: false,
      crowdScale: "small",
    },
    {
      sceneId: "S03",
      title: "광화문 시간 정지 추격전",
      setting: "광화문 대로 한복판",
      interiorExterior: "EXT",
      timeOfDay: "야간",
      actionSummary: "수백 명의 행인이 멈춘 도로 사이로 진우와 태오가 와이어 격투를 벌인다.",
      vfxElements: ["군중 타임프리즈 합성", "공간 왜곡 충격파", "도심 세트 확장"],
      stuntRequired: true,
      crowdScale: "large",
    },
  ],
  characters: [
    {
      name: "서진우",
      roleType: "lead",
      ageRange: "30대 초반",
      archetype: "냉철한 상처 입은 장인",
      coreDesire: "사라진 동생의 마지막 사흘을 복원하는 것",
      flaw: "타인의 기억을 대가로 삼는 죄책감 때문에 결정적 순간 흔들린다",
      actingKeywords: ["절제된 눈빛", "저음 대사", "정밀한 손동작"],
      chemistryNote: "한서연과의 불신에서 시작해 목숨을 맡기는 파트너십으로 성장",
    },
    {
      name: "한서연",
      roleType: "co-lead",
      ageRange: "20대 후반",
      archetype: "집요한 진실 추적자",
      coreDesire: "조작된 사고 기록의 진실을 세상에 밝히는 것",
      flaw: "진실을 위해서라면 자신의 기억까지 무모하게 내건다",
      actingKeywords: ["빠른 딕션", "감정 폭발", "강단 있는 태도"],
      chemistryNote: "진우의 이성적 통제를 깨뜨리며 서사의 추진력을 만든다",
    },
    {
      name: "강태오",
      roleType: "antagonist",
      ageRange: "40대 초반",
      archetype: "질서를 맹신하는 냉혈 감찰관",
      coreDesire: "시간 붕괴를 막기 위해 모든 사적 개입을 영구 봉인하는 것",
      flaw: "통제를 명분으로 과거 자신의 과오까지 함께 은폐한다",
      actingKeywords: ["위압적 카리스마", "완벽한 슈트 핏", "액션 소화"],
      chemistryNote: "진우의 과거 스승이자 정반대 신념의 거울상",
    },
  ],
});
