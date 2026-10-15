/**
 * 내 이야기 질문형 인터뷰의 세션 상태 — 순수 리듀서와 선택자.
 *
 * 화면은 이 모듈의 상태만 그리고, 저장(my-story-session-store)과 초안 계산(my-story-draft)은
 * 이 상태를 입력으로 받는다. 시각(`at`)은 호출자가 넣어 리듀서가 결정적으로 유지된다.
 *
 * 규칙
 * - 질문은 한 번에 하나씩 보여 주고 이전/다음/건너뛰기로 오간다. 건너뛴 칸은 빈 답변이며
 *   초안에서 빈칸으로 남는다(채우지 않는다).
 * - 답변을 바꾸면 그 칸에서 만든 AI 나레이션 채택본은 풀린다. 사용자가 보지 않은 새 답변과
 *   과거 AI 문장이 어긋난 채 남지 않게 하기 위해서다.
 * - 템플릿이 지원하지 않는 컷 수·톤은 템플릿 기본값으로 돌린다.
 */

import {
  MY_STORY_ANSWER_MAX_LENGTH,
  MY_STORY_TITLE_MAX_LENGTH,
  type MyStoryCutCount,
  type MyStoryQuestion,
  type MyStorySlotId,
  type MyStoryTemplate,
  type MyStoryTemplateId,
  type MyStoryToneId,
} from "./my-story-model";
import { myStoryTemplateById, resolveMyStoryCutCount, resolveMyStoryToneId } from "./my-story-templates";
import { cleanMyStoryAnswer, clampMyStoryText } from "./my-story-text";

export type MyStoryStage = "pick" | "ask" | "review";

/** AI 채택본 한 건의 최대 글자 수 — 나레이션 상자 한도(최대 44자)보다 넉넉한 안전 상한이다. */
export const MY_STORY_NARRATION_OVERRIDE_MAX_LENGTH = 120;

export interface MyStorySession {
  readonly schemaVersion: 1;
  readonly stage: MyStoryStage;
  readonly templateId: MyStoryTemplateId | null;
  /** 질문 목록 안의 현재 위치(0부터). stage가 ask일 때 의미가 있다. */
  readonly step: number;
  readonly answers: Readonly<Partial<Record<MyStorySlotId, string>>>;
  readonly cutCount: MyStoryCutCount;
  readonly toneId: MyStoryToneId;
  /** 작품 제목. 빈 문자열이면 템플릿 기본 제목을 쓴다. */
  readonly title: string;
  /** 사용자가 직접 채택한 AI 나레이션. 나레이션 칸(slot)별로 하나씩. */
  readonly narrationOverrides: Readonly<Partial<Record<MyStorySlotId, string>>>;
  readonly updatedAt: string;
}

export type MyStoryAction =
  | { readonly type: "restore"; readonly session: MyStorySession }
  | { readonly type: "start"; readonly templateId: MyStoryTemplateId; readonly at: string }
  | { readonly type: "answer"; readonly slot: MyStorySlotId; readonly text: string; readonly at: string }
  | { readonly type: "next"; readonly at: string }
  | { readonly type: "prev"; readonly at: string }
  | { readonly type: "goto"; readonly step: number; readonly at: string }
  | { readonly type: "review"; readonly at: string }
  | { readonly type: "back-to-pick"; readonly at: string }
  | { readonly type: "set-cut-count"; readonly cutCount: MyStoryCutCount; readonly at: string }
  | { readonly type: "set-tone"; readonly toneId: MyStoryToneId; readonly at: string }
  | { readonly type: "set-title"; readonly title: string; readonly at: string }
  | { readonly type: "adopt-narration"; readonly slot: MyStorySlotId; readonly text: string; readonly at: string }
  | { readonly type: "clear-narration"; readonly slot: MyStorySlotId; readonly at: string }
  | { readonly type: "reset"; readonly at: string };

export function createMyStorySession(at: string): MyStorySession {
  return Object.freeze({
    schemaVersion: 1,
    stage: "pick",
    templateId: null,
    step: 0,
    answers: Object.freeze({}),
    cutCount: 4,
    toneId: "warm-memory",
    title: "",
    narrationOverrides: Object.freeze({}),
    updatedAt: at,
  });
}

function templateOf(session: MyStorySession): MyStoryTemplate | null {
  return myStoryTemplateById(session.templateId);
}

function clampStep(template: MyStoryTemplate, step: number): number {
  const last = Math.max(0, template.questions.length - 1);
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), last);
}

type SlotTexts = Readonly<Partial<Record<MyStorySlotId, string>>>;

function without(record: SlotTexts, slot: MyStorySlotId): SlotTexts {
  const next: Partial<Record<MyStorySlotId, string>> = { ...record };
  delete next[slot];
  return Object.freeze(next);
}

function withSlot(record: SlotTexts, slot: MyStorySlotId, value: string): SlotTexts {
  const next: Partial<Record<MyStorySlotId, string>> = { ...record };
  next[slot] = value;
  return Object.freeze(next);
}

/** 템플릿 질문 칸에 해당하지 않는 답변·채택본을 걸러 낸 새 세션을 만든다(복원 시 정규화에도 쓴다). */
export function normalizeMyStorySession(session: MyStorySession): MyStorySession {
  const template = templateOf(session);
  if (!template) return createMyStorySession(session.updatedAt);
  const slots = new Set(template.questions.map((question) => question.slot));
  const answers: Partial<Record<MyStorySlotId, string>> = {};
  for (const slot of slots) {
    const value = session.answers[slot];
    if (typeof value === "string" && value.trim()) {
      answers[slot] = clampMyStoryText(value, MY_STORY_ANSWER_MAX_LENGTH);
    }
  }
  const overrides: Partial<Record<MyStorySlotId, string>> = {};
  for (const slot of slots) {
    const value = session.narrationOverrides[slot];
    // 답변이 없는 칸의 채택본은 의미가 없으므로 버린다.
    if (typeof value === "string" && value.trim() && answers[slot]) {
      overrides[slot] = clampMyStoryText(value.trim(), MY_STORY_NARRATION_OVERRIDE_MAX_LENGTH);
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    stage: session.stage,
    templateId: template.id,
    step: clampStep(template, session.step),
    answers: Object.freeze(answers),
    cutCount: resolveMyStoryCutCount(template, session.cutCount),
    toneId: resolveMyStoryToneId(template, session.toneId),
    title: clampMyStoryText(session.title, MY_STORY_TITLE_MAX_LENGTH),
    narrationOverrides: Object.freeze(overrides),
    updatedAt: session.updatedAt,
  });
}

/** 주제를 이미 고른 세션에만 의미가 있는 액션(시작·복원·초기화는 주제 없이도 동작하므로 제외). */
type MyStoryTemplateAction = Exclude<MyStoryAction, { readonly type: "restore" | "reset" | "start" }>;

function reduceWithTemplate(session: MyStorySession, action: MyStoryTemplateAction): MyStorySession {
  const template = templateOf(session);
  if (!template) return session;
  const touch = (patch: Partial<MyStorySession>): MyStorySession =>
    Object.freeze({ ...session, ...patch, updatedAt: action.at });

  switch (action.type) {
    case "answer": {
      if (!template.questions.some((question) => question.slot === action.slot)) return session;
      const text = clampMyStoryText(action.text, MY_STORY_ANSWER_MAX_LENGTH);
      return touch({
        answers: text.trim() ? withSlot(session.answers, action.slot, text) : without(session.answers, action.slot),
        narrationOverrides: without(session.narrationOverrides, action.slot),
      });
    }
    case "next": {
      if (session.stage !== "ask") return session;
      if (session.step >= template.questions.length - 1) return touch({ stage: "review" });
      return touch({ step: session.step + 1 });
    }
    case "prev": {
      if (session.stage === "review") return touch({ stage: "ask", step: clampStep(template, template.questions.length - 1) });
      if (session.stage !== "ask" || session.step <= 0) return session;
      return touch({ step: session.step - 1 });
    }
    case "goto":
      return touch({ stage: "ask", step: clampStep(template, action.step) });
    case "review":
      return touch({ stage: "review" });
    case "back-to-pick":
      return touch({ stage: "pick" });
    case "set-cut-count":
      return touch({ cutCount: resolveMyStoryCutCount(template, action.cutCount) });
    case "set-tone":
      return touch({ toneId: resolveMyStoryToneId(template, action.toneId) });
    case "set-title":
      return touch({ title: clampMyStoryText(action.title, MY_STORY_TITLE_MAX_LENGTH) });
    case "adopt-narration": {
      const text = clampMyStoryText(action.text.trim(), MY_STORY_NARRATION_OVERRIDE_MAX_LENGTH);
      if (!text || !session.answers[action.slot]) return session;
      return touch({ narrationOverrides: withSlot(session.narrationOverrides, action.slot, text) });
    }
    case "clear-narration":
      return touch({ narrationOverrides: without(session.narrationOverrides, action.slot) });
  }
}

export function myStoryInterviewReducer(
  session: MyStorySession,
  action: MyStoryAction,
): MyStorySession {
  switch (action.type) {
    case "restore":
      return normalizeMyStorySession(action.session);
    case "reset":
      return createMyStorySession(action.at);
    case "start": {
      const template = myStoryTemplateById(action.templateId);
      if (!template) return session;
      return Object.freeze({
        schemaVersion: 1,
        stage: "ask",
        templateId: template.id,
        step: 0,
        answers: Object.freeze({}),
        cutCount: resolveMyStoryCutCount(template, undefined),
        toneId: resolveMyStoryToneId(template, undefined),
        title: "",
        narrationOverrides: Object.freeze({}),
        updatedAt: action.at,
      });
    }
    default:
      return reduceWithTemplate(session, action);
  }
}

// ── 선택자 ────────────────────────────────────────────────────────────

export function myStoryQuestionAt(session: MyStorySession): MyStoryQuestion | null {
  const template = templateOf(session);
  return template?.questions[clampStep(template, session.step)] ?? null;
}

export function myStoryAnswerFor(session: MyStorySession, slot: MyStorySlotId): string {
  return session.answers[slot] ?? "";
}

/** 비어 있지 않게 답한 질문 수(공백만 있는 답변은 세지 않는다). */
export function myStoryAnsweredCount(session: MyStorySession): number {
  const template = templateOf(session);
  if (!template) return 0;
  return template.questions.filter((question) => cleanMyStoryAnswer(session.answers[question.slot] ?? "")).length;
}

export interface MyStoryProgress {
  /** 현재 질문 번호(1부터). */
  readonly index: number;
  readonly total: number;
  readonly answered: number;
  /** 답한 비율(0~100). 진행 막대는 "몇 번째 질문"이 아니라 "얼마나 답했나"를 보여 준다. */
  readonly percent: number;
}

export function myStoryProgress(session: MyStorySession): MyStoryProgress {
  const template = templateOf(session);
  const total = template?.questions.length ?? 0;
  const answered = myStoryAnsweredCount(session);
  return {
    index: template ? clampStep(template, session.step) + 1 : 0,
    total,
    answered,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
  };
}

/** 이어 쓸 만한 진행이 있는가 — 주제를 골랐고 답을 하나라도 적었을 때만 "이어 쓰기"를 권한다. */
export function myStoryHasProgress(session: MyStorySession): boolean {
  return session.templateId !== null && myStoryAnsweredCount(session) > 0;
}
