/**
 * 6종 장르 팩 공유 계약, 시맨틱 OKLCH 팔레트 토큰 빌더 및 4종 원클릭 추천 프리셋.
 *
 * 모든 팔레트 토큰은 ToonStudio 시맨틱 CSS 변수(`var(--color-...)`)만 사용한다.
 */

import type {
  BilingualLine,
  CharacterPaletteToken,
  CharacterRelationType,
  CharacterRoleId,
  IdeaPromptPreset,
  SpeechRegisterId,
  StoryActId,
  TimeOfDayId,
  WebtoonGenreId,
} from "./idea-to-episode-types";

export interface GenreCharacterSeed {
  readonly idSuffix: string;
  readonly role: CharacterRoleId;
  readonly name: BilingualLine;
  readonly appearanceAnchors: readonly BilingualLine[];
  readonly lockedOutfitId: string;
  readonly lockedOutfitLabel: BilingualLine;
  readonly signaturePaletteTokens: readonly CharacterPaletteToken[];
  readonly speechRegister: SpeechRegisterId;
  readonly speechRegisterRule: BilingualLine;
  readonly propsInventory: readonly BilingualLine[];
  readonly relationToIndex: readonly {
    readonly targetIdx: number;
    readonly relationType: CharacterRelationType;
    readonly summary: BilingualLine;
  }[];
}

export interface GenreBg3dPreset {
  readonly presetId: string;
  readonly label: BilingualLine;
  readonly lightingMood: BilingualLine;
}

export interface GenreOstProfile {
  readonly baseBpm: number;
  readonly keysByAct: Readonly<Record<StoryActId, string>>;
  readonly calmInstruments: readonly BilingualLine[];
  readonly tensionInstruments: readonly BilingualLine[];
  readonly climaxInstruments: readonly BilingualLine[];
}

export interface WebtoonGenreSpec {
  readonly id: WebtoonGenreId;
  readonly label: BilingualLine;
  readonly tagline: BilingualLine;
  readonly defaultLogline: BilingualLine;
  readonly titlePrefix: BilingualLine;
  readonly timeProgression: readonly TimeOfDayId[];
  readonly characters: readonly [GenreCharacterSeed, GenreCharacterSeed, GenreCharacterSeed];
  readonly bg3dPresets: readonly GenreBg3dPreset[];
  readonly sfxPool: Readonly<Record<StoryActId, readonly BilingualLine[]>>;
  readonly actDialogues: Readonly<Record<StoryActId, readonly BilingualLine[]>>;
  readonly beatTitles: Readonly<Record<StoryActId, BilingualLine>>;
  readonly hookQuestion: BilingualLine;
  readonly ost: GenreOstProfile;
}

export const SPEECH_REGISTER_LABELS: Readonly<Record<SpeechRegisterId, BilingualLine>> = {
  formal: { ko: "존댓말", en: "Formal" },
  casual: { ko: "반말", en: "Casual" },
  archaic: { ko: "고어체", en: "Archaic" },
};

export const STORY_ACT_LABELS: Readonly<Record<StoryActId, BilingualLine>> = {
  setup: { ko: "기 · 도입", en: "Act I · Setup" },
  development: { ko: "승 · 전개", en: "Act II · Rising" },
  turn: { ko: "전 · 반전", en: "Act III · Turn" },
  climax: { ko: "결 · 절정", en: "Act IV · Climax" },
  cliffhanger: { ko: "엔딩 클리프행어", en: "Cliffhanger Hook" },
};

export const TIME_OF_DAY_LABELS: Readonly<Record<TimeOfDayId, BilingualLine>> = {
  dawn: { ko: "새벽", en: "Dawn" },
  morning: { ko: "오전", en: "Morning" },
  noon: { ko: "정오", en: "Noon" },
  dusk: { ko: "황혼", en: "Dusk" },
  night: { ko: "밤", en: "Night" },
  midnight: { ko: "자정", en: "Midnight" },
};

export const PAL = {
  accent: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "accent",
    cssVar: "var(--color-accent)",
    role: { ko, en },
  }),
  cool: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "cool",
    cssVar: "var(--color-cool)",
    role: { ko, en },
  }),
  good: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "good",
    cssVar: "var(--color-good)",
    role: { ko, en },
  }),
  warn: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "warn",
    cssVar: "var(--color-warn)",
    role: { ko, en },
  }),
  bad: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "bad",
    cssVar: "var(--color-bad)",
    role: { ko, en },
  }),
  raised: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "raised",
    cssVar: "var(--color-raised)",
    role: { ko, en },
  }),
  fgMuted: (ko: string, en: string): CharacterPaletteToken => ({
    swatchId: "fg-muted",
    cssVar: "var(--color-fg-2)",
    role: { ko, en },
  }),
};

export const IDEA_PROMPT_PRESETS: readonly IdeaPromptPreset[] = [
  {
    id: "rofan-empress-clock",
    genre: "romance-fantasy",
    lengthId: "prologue-12",
    chipLabel: { ko: "로판 · 회귀 황녀의 태엽시계", en: "Rofan · Regressed Empress Clock" },
    logline: {
      ko: "처형 직전 3년 전으로 회귀한 공녀가 황실의 금지된 태엽시계를 훔쳐 판을 뒤집는다.",
      en: "A duchess regresses three years before execution and steals the imperial clockwork seal.",
    },
  },
  {
    id: "hunter-subway-dungeon",
    genre: "modern-fantasy",
    lengthId: "full-24",
    chipLabel: { ko: "현대판타지 · 막차 지하철 S급 각성", en: "Modern Fantasy · Last-Train Awakening" },
    logline: {
      ko: "서울 2호선 막차에 열린 검은 균열 속에서 퇴사 직전 직장인이 유일한 시간 각성자가 된다.",
      en: "Inside a dark rift on Seoul Line 2, an office worker awakens as the sole time-bender.",
    },
  },
  {
    id: "murim-broken-blade",
    genre: "murim",
    lengthId: "prologue-12",
    chipLabel: { ko: "무협 · 폐관 검객의 녹슨 도", en: "Murim · Hermit Swordsman's Rust Blade" },
    logline: {
      ko: "문파에서 쫓겨난 말단 사제가 녹슨 철검 한 자루로 천마교 암살단의 계략을 꺾는다.",
      en: "An exiled junior disciple stops a nocturnal cult ambush with one rusted iron saber.",
    },
  },
  {
    id: "noir-rain-witness",
    genre: "action-noir",
    lengthId: "shorts-4",
    chipLabel: { ko: "액션느와르 · 빗속 항만의 마지막 증인", en: "Action Noir · Rain Harbor Witness" },
    logline: {
      ko: "비 내리는 부산 부두에서 기억을 지운 전직 해결사가 장부가 담긴 라이터를 되찾는다.",
      en: "At a rain-soaked dock, a retired fixer fights to reclaim an encrypted brass lighter.",
    },
  },
] as const;
