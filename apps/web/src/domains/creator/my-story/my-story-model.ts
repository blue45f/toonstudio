/**
 * 내 이야기 → 웹툰 시작 동선의 순수 데이터 모델.
 *
 * 이 모듈은 타입과 정적 카탈로그(질문 칸·컷 역할·톤 프리셋)만 소유한다. 화면·저장소·네트워크를
 * 만지지 않으며, 주제 템플릿 팩(my-story-templates.ts)과 인터뷰/초안 로직이 이 계약을 공유한다.
 *
 * 설계 규칙
 * - 이야기의 내용은 전부 사용자의 답변에서만 온다. 이 모듈의 문구는 "질문", "컷 역할 이름",
 *   "연출 힌트"처럼 틀(frame)일 뿐이며 사실·인물·사건을 대신 만들지 않는다.
 * - 입력칸 예시(example)는 placeholder 전용이다. 답변으로 저장하거나 초안에 섞지 않는다.
 * - 이웃 템플릿 카탈로그(studio-template-catalog.ts)의 관례대로 사용자 문구는 `…Ko`/`…En` 쌍이다.
 */

import type { StudioStoryBeatKind } from "../studio-storyboard-planner";

export type MyStoryLocale = "ko" | "en";

/** 인터뷰 질문이 채우는 칸. 템플릿마다 6~8개를 골라 쓰며 초안은 칸 단위로 답변을 컷에 배치한다. */
export const MY_STORY_SLOT_IDS = [
  "who",
  "when",
  "where",
  "event",
  "turn",
  "feeling",
  "ending",
  "message",
] as const;

export type MyStorySlotId = (typeof MY_STORY_SLOT_IDS)[number];

export function isMyStorySlotId(value: unknown): value is MyStorySlotId {
  return typeof value === "string" && (MY_STORY_SLOT_IDS as readonly string[]).includes(value);
}

/** 답변 한 칸의 최대 글자 수. 컷 한 장에 들어갈 분량을 넘기지 않도록 입력 단계에서 제한한다. */
export const MY_STORY_ANSWER_MAX_LENGTH = 300;
/** 작품 제목 최대 글자 수 — 스튜디오 새 작품 양식의 제목 한도와 같은 크기다. */
export const MY_STORY_TITLE_MAX_LENGTH = 80;

export interface MyStoryQuestion {
  readonly slot: MyStorySlotId;
  /** 진행 목록·빈칸 안내에 쓰는 짧은 이름. */
  readonly labelKo: string;
  readonly labelEn: string;
  /** 사용자에게 던지는 질문 문장. */
  readonly promptKo: string;
  readonly promptEn: string;
  /** 입력칸 예시(placeholder). 답변으로 저장되지 않는다. */
  readonly exampleKo: string;
  readonly exampleEn: string;
}

/** 컷이 맡는 역할. 샷 힌트와 스토리 비트 종류(대본→콘티 계획의 입력)를 함께 정한다. */
export const MY_STORY_CUT_ROLE_IDS = [
  "open",
  "place",
  "cast",
  "event",
  "moment",
  "feeling",
  "aftermath",
  "closing",
  "situation",
  "risk",
  "rule",
  "result",
] as const;

export type MyStoryCutRoleId = (typeof MY_STORY_CUT_ROLE_IDS)[number];

export interface MyStoryCutRole {
  readonly id: MyStoryCutRoleId;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 기존 콘티 플래너(studio-storyboard-planner)가 샷 크기·카메라·여백을 정하는 입력. */
  readonly beat: StudioStoryBeatKind;
  readonly shotKo: string;
  readonly shotEn: string;
}

/**
 * 컷 한 장의 정의 — 어떤 답변을 요약으로 모으고(from), 어느 답변을 나레이션(narrate)·
 * 말풍선(say) 후보로 올릴지만 선언한다. 문장은 만들지 않는다.
 */
export interface MyStoryCutDef {
  readonly role: MyStoryCutRoleId;
  readonly from: readonly MyStorySlotId[];
  readonly narrate: MyStorySlotId | null;
  readonly say: MyStorySlotId | null;
}

export type MyStoryCutCount = 4 | 8;

export function isMyStoryCutCount(value: unknown): value is MyStoryCutCount {
  return value === 4 || value === 8;
}

export const MY_STORY_TEMPLATE_IDS = [
  "retrospective",
  "family",
  "neighborhood",
  "career",
  "safety",
  "finance",
] as const;

export type MyStoryTemplateId = (typeof MY_STORY_TEMPLATE_IDS)[number];

export function isMyStoryTemplateId(value: unknown): value is MyStoryTemplateId {
  return typeof value === "string" && (MY_STORY_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * 주제 이름 — 시작 페이지 카드의 주제 링크와 템플릿 팩이 같은 문구를 쓰도록 가벼운 모델에 둔다.
 * (질문·골격 같은 무거운 데이터는 my-story-templates에만 있어 시작 페이지가 끌고 오지 않는다.)
 */
export const MY_STORY_TOPIC_TITLES: Readonly<Record<MyStoryTemplateId, { readonly ko: string; readonly en: string }>> =
  Object.freeze({
    retrospective: { ko: "회고", en: "Looking back" },
    family: { ko: "가족", en: "Family" },
    neighborhood: { ko: "동네", en: "Neighborhood" },
    career: { ko: "경력", en: "Career" },
    safety: { ko: "안전 수칙", en: "Safety rules" },
    finance: { ko: "금융 상식", en: "Money basics" },
  });

export const MY_STORY_TONE_IDS = [
  "warm-memory",
  "steady-record",
  "friendly-neighbor",
  "clear-guide",
  "calm-caution",
] as const;

export type MyStoryToneId = (typeof MY_STORY_TONE_IDS)[number];

export function isMyStoryToneId(value: unknown): value is MyStoryToneId {
  return typeof value === "string" && (MY_STORY_TONE_IDS as readonly string[]).includes(value);
}

/** 톤 프리셋 — 나레이션 말투 안내와 AI 보강 프롬프트의 문체 지시에 쓴다. 색을 칠하지 않는다. */
export interface MyStoryTone {
  readonly id: MyStoryToneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 나레이션 문체 설명. 사용자 문장을 바꾸지 않고 AI 보강 때만 지시로 쓴다. */
  readonly voiceKo: string;
  readonly voiceEn: string;
}

export interface MyStoryNarrationDefaults {
  /** 나레이션 상자를 컷의 어느 쪽에 둘지(대본 메모로 전달되는 기본값). */
  readonly position: "top" | "bottom";
  /** 나레이션 한 상자의 최대 글자 수. 넘치는 답변은 다음 상자 후보로 이어진다. */
  readonly maxChars: number;
}

export interface MyStoryBalloonDefaults {
  readonly kind: "dialogue" | "thought";
  readonly maxChars: number;
}

export interface MyStoryTemplate {
  readonly id: MyStoryTemplateId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly defaultTitleKo: string;
  readonly defaultTitleEn: string;
  readonly tags: readonly string[];
  /** 질문 세트(6~8문항). 배열 순서가 질문 순서다. */
  readonly questions: readonly MyStoryQuestion[];
  /** 지원하는 컷 수. 첫 항목이 기본값이다. */
  readonly cutCounts: readonly MyStoryCutCount[];
  /** 컷 구조 골격. cutCounts에 있는 값마다 하나씩 있다. */
  readonly skeletons: Readonly<Record<MyStoryCutCount, readonly MyStoryCutDef[] | null>>;
  /** 고를 수 있는 톤. 첫 항목이 기본값이다. */
  readonly toneIds: readonly MyStoryToneId[];
  readonly narration: MyStoryNarrationDefaults;
  readonly balloon: MyStoryBalloonDefaults;
  /** 안전·금융처럼 사실 확인 책임이 사용자에게 있는 주제의 주의 문구. */
  readonly cautionKo?: string;
  readonly cautionEn?: string;
}

export const MY_STORY_CUT_ROLES: Readonly<Record<MyStoryCutRoleId, MyStoryCutRole>> = Object.freeze({
  open: {
    id: "open",
    labelKo: "도입",
    labelEn: "Opening",
    beat: "setup",
    shotKo: "때와 분위기를 넓게 보여 주는 첫 컷",
    shotEn: "A wide first panel that sets the time and mood.",
  },
  place: {
    id: "place",
    labelKo: "장소",
    labelEn: "Place",
    beat: "setup",
    shotKo: "장소 전체가 한눈에 보이는 와이드 컷",
    shotEn: "A wide panel that shows the whole place.",
  },
  cast: {
    id: "cast",
    labelKo: "등장",
    labelEn: "Cast",
    beat: "setup",
    shotKo: "인물을 한 화면에 또렷하게 세우는 컷",
    shotEn: "A panel that introduces the people clearly.",
  },
  event: {
    id: "event",
    labelKo: "사건",
    labelEn: "Event",
    beat: "action",
    shotKo: "무슨 일인지 보이는 중간 거리 컷",
    shotEn: "A mid-distance panel that shows what happened.",
  },
  moment: {
    id: "moment",
    labelKo: "결정적 순간",
    labelEn: "Key moment",
    beat: "dialogue",
    shotKo: "표정과 손짓이 보이는 가까운 컷",
    shotEn: "A closer panel with expressions and gestures.",
  },
  feeling: {
    id: "feeling",
    labelKo: "마음",
    labelEn: "Feeling",
    beat: "reaction",
    shotKo: "표정 클로즈업, 글은 줄이고 여백을 남기는 컷",
    shotEn: "A close-up of the face; fewer words, more space.",
  },
  aftermath: {
    id: "aftermath",
    labelKo: "그 뒤",
    labelEn: "Afterwards",
    beat: "transition",
    shotKo: "시간이 흐른 느낌을 주는 넓은 컷",
    shotEn: "A wide panel that feels like time has passed.",
  },
  closing: {
    id: "closing",
    labelKo: "한 줄",
    labelEn: "Closing line",
    beat: "reveal",
    shotKo: "여백을 두고 한 줄을 크게 놓는 마지막 컷",
    shotEn: "A final panel with space around one large line.",
  },
  situation: {
    id: "situation",
    labelKo: "상황",
    labelEn: "Situation",
    beat: "setup",
    shotKo: "누가 어디서 겪는 일인지 보여 주는 컷",
    shotEn: "Shows who is where, and what the situation is.",
  },
  risk: {
    id: "risk",
    labelKo: "위험한 순간",
    labelEn: "Risky moment",
    beat: "action",
    shotKo: "위험이 드러나는 순간을 크게 보여 주는 컷",
    shotEn: "A panel that makes the risky moment large.",
  },
  rule: {
    id: "rule",
    labelKo: "올바른 행동",
    labelEn: "What to do",
    beat: "reveal",
    shotKo: "해야 할 행동이 눈에 띄는 컷",
    shotEn: "A panel where the right action stands out.",
  },
  result: {
    id: "result",
    labelKo: "결과",
    labelEn: "Result",
    beat: "transition",
    shotKo: "결과와 한 줄을 함께 보여 주는 컷",
    shotEn: "Shows the outcome together with the one-line takeaway.",
  },
});

export const MY_STORY_TONES: Readonly<Record<MyStoryToneId, MyStoryTone>> = Object.freeze({
  "warm-memory": {
    id: "warm-memory",
    labelKo: "따뜻한 회상",
    labelEn: "Warm memory",
    descriptionKo: "지난 시간을 천천히 떠올리는 따뜻한 분위기",
    descriptionEn: "A warm, unhurried look back.",
    voiceKo: "~했다, ~였다 같은 담담한 회고체",
    voiceEn: "Plain past-tense reminiscence",
  },
  "steady-record": {
    id: "steady-record",
    labelKo: "담담한 기록",
    labelEn: "Steady record",
    descriptionKo: "사실을 차분히 적어 가는 분위기",
    descriptionEn: "Calmly noting down what happened.",
    voiceKo: "꾸밈없이 사실을 적는 기록체",
    voiceEn: "Unadorned, factual notes",
  },
  "friendly-neighbor": {
    id: "friendly-neighbor",
    labelKo: "정겨운 이웃",
    labelEn: "Friendly neighbors",
    descriptionKo: "이웃에게 말하듯 정겨운 분위기",
    descriptionEn: "Speaking to a neighbor, warm and easy.",
    voiceKo: "말하듯 편안한 구어체",
    voiceEn: "Relaxed spoken style",
  },
  "clear-guide": {
    id: "clear-guide",
    labelKo: "또렷한 안내",
    labelEn: "Clear guide",
    descriptionKo: "핵심을 짧고 또렷하게 전하는 분위기",
    descriptionEn: "Short, clear and to the point.",
    voiceKo: "짧고 분명한 안내체",
    voiceEn: "Short, clear instructions",
  },
  "calm-caution": {
    id: "calm-caution",
    labelKo: "차분한 경고",
    labelEn: "Calm caution",
    descriptionKo: "겁을 주지 않고 차분히 조심시키는 분위기",
    descriptionEn: "Cautioning without scaring.",
    voiceKo: "차분하게 주의를 건네는 말투",
    voiceEn: "Calm, non-alarming warnings",
  },
});

/** 어디서든 로케일에 맞는 문구를 고르는 얇은 도우미 — 컴포넌트 밖 순수 모듈용. */
export function pickMyStoryText(locale: MyStoryLocale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}
