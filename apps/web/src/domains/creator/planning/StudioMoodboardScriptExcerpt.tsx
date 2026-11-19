import { useEffect, useRef, useState } from "react";
import type { StudioStoryChapter } from "../studio-story-adaptation";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import { readDeviceMoodboard } from "./studio-moodboard-device-store";
import { deriveEpisodePlanDraftFromMoodboard } from "./studio-moodboard-web-collect";

async function readExcerpt(projectId: string, from: string, to: string): Promise<string | null> {
  const current = await readDeviceMoodboard(projectId);
  if (current?.kind === "broken") throw Error(current.reason);
  if (!current || !current.board.connections?.some(edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) return null;
  return deriveEpisodePlanDraftFromMoodboard(current.board, [from, to]).synopsis || null;
}

export function StudioMoodboardScriptExcerpt({ projectId, from, to, chapter, onAppend }: {
  projectId: string; from: string; to: string; chapter: StudioStoryChapter; onAppend: (body: string) => boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const version = useRef(0);
  const checking = useRef(false);
  useEffect(() => {
    const id = ++version.current;
    setLoading(true);
    setFailed(false);
    setText(null);
    setNotice("");
    readExcerpt(projectId, from, to).then(value => {
      if (version.current === id) { setText(value); setLoading(false); }
    }).catch(() => { if (version.current === id) { setFailed(true); setLoading(false); } });
    return () => { version.current = id + 1; };
  }, [projectId, from, to, attempt]);
  const appended = text && (chapter.body === text || chapter.body.endsWith(`\n\n${text}`));
  const next = text ? (chapter.body ? `${chapter.body}\n\n${text}` : text) : "";
  const latest = useRef({ chapter, onAppend });
  useEffect(() => { latest.current = { chapter, onAppend }; }, [chapter, onAppend]);
  const reason = loading ? r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.checkingCards", "카드 연결을 확인하는 중…") : failed ? r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.loadFailed", "무드보드를 불러올 수 없어요.") : !text ? "이 작품에서 카드 연결을 찾을 수 없어요. 아이디어 보드에서 다시 선택해 주세요."
    : chapter.status === "locked" ? "확정한 회차예요. 초안 회차를 선택한 뒤 추가해 주세요."
    : appended ? "이 회차 끝에 카드 내용이 있습니다."
    : next.length > 120000 ? "대본 글자 수를 초과해요. 다른 회차를 선택해 주세요." : "";
  return <section aria-label="아이디어 보드에서 가져온 카드" className="my-3 rounded-xl border border-line bg-panel p-3">
    <h3 className="text-sm font-semibold">연결한 카드에서 가져오기</h3>
    {text && <p className="my-2 whitespace-pre-wrap break-words text-sm">{text}</p>}
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" disabled={Boolean(reason)} onClick={async () => {
      if (checking.current) return;
      checking.current = true;
      const id = version.current;
      let current: string | null;
      try { current = await readExcerpt(projectId, from, to); }
      catch { if (version.current === id) setFailed(true); return; }
      finally { checking.current = false; }
      if (version.current !== id) return;
      if (current !== text) {
        setText(current);
        setNotice(current ? "보드가 바뀌었어요. 새 내용을 확인한 뒤 다시 추가해 주세요." : "");
      } else if (current && !reason && latest.current.chapter === chapter) {
        setNotice(latest.current.onAppend(next) ? "선택한 회차 끝에 두 카드의 내용을 추가했어요." : "대본 저장본이 달라졌거나 저장소를 읽을 수 없어요. 대본을 다시 열어 주세요.");
      }
    }}>이 회차 대본 끝에 추가</button>
    {failed && <button type="button" className="min-h-11 px-3" onClick={() => setAttempt(n => n + 1)}>{r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.retryCards", "카드 다시 확인")}</button>}
    <p role={failed ? "alert" : "status"} className="mt-1 text-sm text-fg-2">{reason || notice}</p>
  </section>;
}
