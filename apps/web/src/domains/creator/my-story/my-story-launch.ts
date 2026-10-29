import { createMyStorySession, myStoryInterviewReducer, type MyStorySession } from "./my-story-interview";
import type { MyStoryTemplateId } from "./my-story-model";

/** 입력한 아이디어는 제목으로 바꾸거나 새 내용을 만들지 않고 첫 질문의 답변으로 보존한다. */
export function createMyStoryLaunchSession(
  templateId: MyStoryTemplateId | null,
  idea: string,
  at: string,
): MyStorySession {
  const text = idea.trim();
  const selected = text ? "free-story" : templateId;
  const empty = createMyStorySession(at);
  if (!selected) return empty;
  const started = myStoryInterviewReducer(empty, { type: "start", templateId: selected, at });
  return text
    ? myStoryInterviewReducer(started, { type: "answer", slot: "event", text, at })
    : started;
}
