import { useState } from "react";
import type { StudioStoryChapter } from "../studio-story-adaptation";
import { readStudioProjectMoodboard } from "./studio-moodboard";
import { deriveEpisodePlanDraftFromMoodboard } from "./studio-moodboard-web-collect";

function readExcerpt(projectId: string, from: string, to: string): string | null {
  try {
    const current = readStudioProjectMoodboard(window.localStorage, projectId);
    if (!current?.ok || !current.board.connections?.some(edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) return null;
    return deriveEpisodePlanDraftFromMoodboard(current.board, [from, to]).synopsis || null;
  } catch {
    return null;
  }
}

export function StudioMoodboardScriptExcerpt({ projectId, from, to, chapter, onAppend }: {
  projectId: string; from: string; to: string; chapter: StudioStoryChapter; onAppend: (body: string) => boolean;
}) {
  const [text, setText] = useState(() => readExcerpt(projectId, from, to));
  const [notice, setNotice] = useState("");
  const appended = text && (chapter.body === text || chapter.body.endsWith(`\n\n${text}`));
  const next = text ? (chapter.body ? `${chapter.body}\n\n${text}` : text) : "";
  const reason = !text ? "이 작품에서 카드 연결을 찾을 수 없어요. 아이디어 보드에서 다시 선택해 주세요."
    : chapter.status === "locked" ? "확정한 회차예요. 초안 회차를 선택한 뒤 추가해 주세요."
    : appended ? "이 회차 끝에 카드 내용이 있습니다."
    : next.length > 120000 ? "대본 글자 수를 초과해요. 다른 회차를 선택해 주세요." : "";
  return <section aria-label="아이디어 보드에서 가져온 카드" className="my-3 rounded-xl border border-line bg-panel p-3">
    <h3 className="text-sm font-semibold">연결한 카드에서 가져오기</h3>
    {text && <p className="my-2 whitespace-pre-wrap break-words text-sm">{text}</p>}
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={Boolean(reason)} onClick={() => {
      const current = readExcerpt(projectId, from, to);
      if (current !== text) {
        setText(current);
        setNotice(current ? "보드가 바뀌었어요. 새 내용을 확인한 뒤 다시 추가해 주세요." : "");
      } else if (current && !reason) {
        setNotice(onAppend(next) ? "선택한 회차 끝에 두 카드의 내용을 추가했어요." : "대본 저장본이 달라졌거나 저장소를 읽을 수 없어요. 대본을 다시 열어 주세요.");
      }
    }}>이 회차 대본 끝에 추가</button>
    <p role="status" className="mt-1 text-sm text-fg-2">{reason || notice}</p>
  </section>;
}
