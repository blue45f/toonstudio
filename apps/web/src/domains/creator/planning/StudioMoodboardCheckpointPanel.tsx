import { useEffect, useRef, useState } from "react";
import { serializeMoodboard, type Moodboard } from "./studio-moodboard";
import { getMoodboardCheckpointStore, readMoodboardCheckpoint, writeMoodboardCheckpoint, type MoodboardCheckpoint } from "./studio-moodboard-checkpoint";

interface Props {
  projectId: string;
  board?: Moodboard;
  onRestore: (saved: Moodboard) => Promise<boolean>;
}

const control = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
export function StudioMoodboardCheckpointPanel(props: Props) {
  const [opened, setOpened] = useState(false);
  return <details className="my-2 rounded-lg border border-line px-3" onToggle={e => setOpened(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">보드 복구본</summary>
    {opened && <CheckpointActions {...props}/>}
  </details>;
}

function CheckpointActions({ projectId, board, onRestore }: Props) {
  const [entry, setEntry] = useState<MoodboardCheckpoint | null>(null);
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    getMoodboardCheckpointStore(generation > 0).then(store => readMoodboardCheckpoint(store, projectId)).then(saved => {
      if (alive) { setEntry(saved); setState("ready"); setNotice(""); }
    }).catch(() => {
      if (alive) { setState("error"); setNotice("이 기기의 복구본을 읽을 수 없어요. 다른 편집 탭을 닫은 뒤 다시 시도해 주세요."); }
    });
    return () => { alive = false; };
  }, [generation, projectId]);

  async function save() {
    if (!board || inFlight.current || state !== "ready") return;
    inFlight.current = true;
    setState("saving");
    try {
      const store = await getMoodboardCheckpointStore();
      setEntry(await writeMoodboardCheckpoint(store, projectId, board, entry));
      setState("ready");
      setNotice("복구본을 이 기기에 저장했어요.");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error && error.message.startsWith("다른 창") ? error.message : "복구본을 저장하지 못했어요. 현재 보드는 그대로예요.");
    } finally { inFlight.current = false; }
  }

  const same = entry && board && serializeMoodboard(entry.board) === serializeMoodboard(board);
  return <div className="mb-3 space-y-2">
    {state === "loading" && <p role="status">복구본을 불러오는 중…</p>}
    {state === "ready" && !entry && <p className="text-sm text-fg-2">장면 구성을 바꾸기 전에 현재 카드와 연결을 보관하세요.</p>}
    {entry && <p className="text-sm text-fg-2"><time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleString("ko-KR")}</time> · 카드 {Object.keys(entry.board.cards).length}장 · 연결 {entry.board.connections?.length ?? 0}개</p>}
    <div className="flex flex-wrap gap-2">
      {board && <button type="button" className={control} disabled={state !== "ready" || Boolean(same) || !Object.keys(board.cards).length} onClick={() => void save()}>
        {entry ? "현재 보드로 복구본 교체" : "현재 보드를 복구본으로 저장"}
      </button>}
      {entry && <button type="button" className={control} disabled={state !== "ready" || Boolean(same)} onClick={async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setState("saving");
        const restored = await onRestore(entry.board);
        inFlight.current = false;
        setState("ready");
        setNotice(restored ? "저장한 카드와 연결을 복원했어요." : "현재 보드를 확인한 뒤 다시 시도해 주세요.");
      }}>이 복구본으로 되돌리기</button>}
      {state === "error" && <button type="button" className={control} onClick={() => { setState("loading"); setGeneration(n => n + 1); }}>복구본 다시 불러오기</button>}
    </div>
    {notice && <p role={state === "error" ? "alert" : "status"} className="text-sm">{notice}</p>}
  </div>;
}
