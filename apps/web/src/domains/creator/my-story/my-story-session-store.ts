/**
 * 내 이야기 인터뷰 임시저장 — 이 기기의 브라우저 저장소(localStorage)에만 쓴다.
 *
 * 서버로 보내지 않는다. 읽기/쓰기는 절대 throw 하지 않고(사생활 보호 모드·용량 초과·접근 차단에서도
 * 화면이 멈추지 않게) 실패를 값으로 돌려준다. 저장본은 신뢰하지 않는다 — 형식이 깨졌거나 구버전이면
 * 조용히 버리고, 알려진 칸·길이로만 복원한다.
 */

import {
  isMyStoryCutCount,
  isMyStoryTemplateId,
  isMyStoryToneId,
  MY_STORY_SLOT_IDS,
  type MyStorySlotId,
} from "./my-story-model";
import {
  createMyStorySession,
  normalizeMyStorySession,
  type MyStorySession,
  type MyStoryStage,
} from "./my-story-interview";

export const MY_STORY_SESSION_STORAGE_KEY = "toonstudio:my-story-session:v1";

export interface MyStorySessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStage(value: unknown): value is MyStoryStage {
  return value === "pick" || value === "ask" || value === "review";
}

function slotTexts(value: unknown): Partial<Record<MyStorySlotId, string>> {
  const out: Partial<Record<MyStorySlotId, string>> = {};
  if (!isRecord(value)) return out;
  for (const slot of MY_STORY_SLOT_IDS) {
    const text = value[slot];
    if (typeof text === "string") out[slot] = text;
  }
  return out;
}

export function serializeMyStorySession(session: MyStorySession): string {
  return JSON.stringify(session);
}

/** 저장 문자열 → 세션. 깨졌거나 알 수 없는 버전·템플릿이면 null. */
export function parseMyStorySession(raw: string | null | undefined): MyStorySession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isMyStoryTemplateId(parsed.templateId)) {
    return null;
  }
  const updatedAt = typeof parsed.updatedAt === "string" && Number.isFinite(Date.parse(parsed.updatedAt))
    ? parsed.updatedAt
    : new Date(0).toISOString();
  const base = createMyStorySession(updatedAt);
  // 알려진 필드만 옮긴 뒤 normalize가 템플릿 범위(질문 칸·컷 수·톤·길이)로 다시 맞춘다.
  return normalizeMyStorySession({
    ...base,
    stage: isStage(parsed.stage) ? parsed.stage : "ask",
    templateId: parsed.templateId,
    step: typeof parsed.step === "number" ? parsed.step : 0,
    answers: slotTexts(parsed.answers),
    cutCount: isMyStoryCutCount(parsed.cutCount) ? parsed.cutCount : base.cutCount,
    toneId: isMyStoryToneId(parsed.toneId) ? parsed.toneId : base.toneId,
    title: typeof parsed.title === "string" ? parsed.title : "",
    narrationOverrides: slotTexts(parsed.narrationOverrides),
  });
}

export function readMyStorySession(storage: MyStorySessionStorage | null): MyStorySession | null {
  if (!storage) return null;
  try {
    return parseMyStorySession(storage.getItem(MY_STORY_SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 저장에 성공하면 true. 용량 초과·접근 차단 등은 false로 알려 화면이 안내하게 한다. */
export function writeMyStorySession(
  storage: MyStorySessionStorage | null,
  session: MyStorySession,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MY_STORY_SESSION_STORAGE_KEY, serializeMyStorySession(session));
    return true;
  } catch {
    return false;
  }
}

export function clearMyStorySession(storage: MyStorySessionStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(MY_STORY_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
