import { useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { readStudioStorySceneSources } from "./studio-story-scene-source";

type Props = {
  body: string;
  locked: boolean;
  onAppend: (body: string) => boolean;
  onSelect: (start: number, end: number) => void;
};
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg";

export function StudioStorySceneOutline({ body, locked, onAppend, onSelect }: Props) {
  const bt = useBilingual("StudioStorySceneOutline");
  const [title, setTitle] = useState("");
  const [action, setAction] = useState("");
  const [notice, setNotice] = useState("");
  const { headings, scenes } = useMemo(() => readStudioStorySceneSources(body), [body]);
  const sceneNumbers = new Set(headings.map(scene => scene.number));
  const nextNumber = headings.reduce((max, scene) => Math.max(max, scene.number ?? 0), 0) + 1;
  let count = nextNumber <= 9999 ? nextNumber : 1;
  while (sceneNumbers.has(count)) count += 1;
  const heading = bt(`장면 ${count} — ${title.trim()}`, `Scene ${count} — ${title.trim()}`);
  const next = (body ? body + (body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n") : "") + heading + "\n" + action.trim();
  const newHeadings = useMemo(() => readStudioStorySceneSources(action).headings.length, [action]);
  const tooLarge = next.length > 120_000 || scenes.length + 1 + newHeadings > 64;
  return <details className="mt-3 rounded-xl border border-line">
    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-fg">{bt("장면 구성", "Scene outline")}</summary>
    <div className="space-y-3 border-t border-line p-3">
      {headings.length > 0 && <ol aria-label={bt("대본의 장면 순서", "Scenes in the script")} className="space-y-1">
        {headings.map(scene => <li key={scene.start}><button type="button" className="min-h-11 max-w-full rounded px-2 text-left text-sm text-accent underline"
          onClick={() => onSelect(scene.start, scene.end)}>{scene.heading}</button></li>)}
      </ol>}
      <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        if (locked || tooLarge || !title.trim() || !action.trim()) return;
        if (!onAppend(next)) { setNotice(bt("대본 저장본이 달라졌어요. 작성한 내용을 복사한 뒤 회차를 다시 열어 주세요.", "The saved script changed. Copy your input and reopen the chapter.")); return; }
        setTitle(""); setAction(""); setNotice(bt("이 회차의 대본 끝에 장면을 추가했어요.", "Scene appended to this chapter’s script."));
      }}>
        <label className="block text-sm text-fg">{bt("장면 제목 또는 장소·시간", "Scene heading or location and time")}
          <input value={title} disabled={locked} maxLength={180} className={fieldClass} onChange={e => { setTitle(e.target.value); setNotice(""); }} /></label>
        <label className="block text-sm text-fg">{bt("행동·대사·연출 메모", "Action, dialogue and direction")}
          <textarea value={action} disabled={locked} maxLength={120_000} rows={3} className={fieldClass} onChange={e => { setAction(e.target.value); setNotice(""); }} /></label>
        <button type="submit" className={buttonClass({ variant: "outline" })} disabled={locked || tooLarge || !title.trim() || !action.trim()}>{bt("대본 끝에 장면 추가", "Append scene to script")}</button>
        {locked ? <p className="text-xs text-fg-2">{bt("확정된 회차입니다.", "This chapter is locked.")}</p> : tooLarge && <p role="status">{bt("한 회차에는 장면 64개, 대본 12만 자까지 담을 수 있어요.", "A chapter can hold 64 scenes and 120,000 script characters.")}</p>}
        {notice && <p role="status" className="text-sm text-fg-2">{notice}</p>}
      </form>
    </div>
  </details>;
}
