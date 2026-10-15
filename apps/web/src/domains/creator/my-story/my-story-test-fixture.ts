/**
 * 내 이야기 테스트 공용 픽스처 — 테스트 파일만 import 한다.
 * 이야기 내용은 테스트 안에서만 쓰는 임의의 문장이며 제품 화면의 기본값이 아니다.
 */

import {
  createMyStorySession,
  myStoryInterviewReducer,
  type MyStorySession,
} from "./my-story-interview";
import { type MyStorySlotId, type MyStoryTemplateId } from "./my-story-model";
import { myStoryTemplateById } from "./my-story-templates";
import type { MyStorySessionStorage } from "./my-story-session-store";

export const FIXTURE_AT = "2026-10-15T09:00:00.000Z";

/** 메모리 저장소 — getItem/setItem/removeItem만 가진 가장 작은 Storage 대역. */
export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): MyStorySessionStorage & {
  readonly entries: Map<string, string>;
} {
  const entries = new Map<string, string>(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

/** 칸마다 서로 다른 한 문장. 따옴표 대사를 넣어 말풍선 추출도 함께 검증한다. */
export const FIXTURE_ANSWERS: Readonly<Record<MyStorySlotId, string>> = {
  who: "나와 동생",
  when: "열두 살 여름",
  where: "외갓집 마당",
  event: "수돗가에서 수박을 나눠 먹었다. 동생이 “이거 내 거야” 하고 웃었다.",
  turn: "할머니가 “많이 먹어라” 하며 웃으셨다",
  feeling: "배부르고 든든했다",
  ending: "방학이 끝나 집으로 돌아왔다",
  message: "그날의 수박 맛을 잊지 말자",
};

/** 템플릿의 모든 질문에 FIXTURE_ANSWERS를 채운 검토 단계 세션. */
export function fullSession(
  templateId: MyStoryTemplateId,
  options: { readonly cutCount?: 4 | 8; readonly answers?: Partial<Record<MyStorySlotId, string>> } = {},
): MyStorySession {
  const template = myStoryTemplateById(templateId);
  if (!template) throw new Error(`unknown template: ${templateId}`);
  let session = myStoryInterviewReducer(createMyStorySession(FIXTURE_AT), {
    type: "start",
    templateId,
    at: FIXTURE_AT,
  });
  for (const question of template.questions) {
    const text = options.answers?.[question.slot] ?? FIXTURE_ANSWERS[question.slot];
    session = myStoryInterviewReducer(session, { type: "answer", slot: question.slot, text, at: FIXTURE_AT });
  }
  if (options.cutCount) {
    session = myStoryInterviewReducer(session, { type: "set-cut-count", cutCount: options.cutCount, at: FIXTURE_AT });
  }
  return myStoryInterviewReducer(session, { type: "review", at: FIXTURE_AT });
}

/** 주제만 고르고 아무것도 답하지 않은 검토 단계 세션(전부 빈칸). */
export function emptySession(templateId: MyStoryTemplateId): MyStorySession {
  const started = myStoryInterviewReducer(createMyStorySession(FIXTURE_AT), {
    type: "start",
    templateId,
    at: FIXTURE_AT,
  });
  return myStoryInterviewReducer(started, { type: "review", at: FIXTURE_AT });
}
