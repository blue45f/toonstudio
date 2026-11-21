import { Suspense, lazy, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import "./StudioProjectMoodboard.css";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import { loadDeviceMoodboard, writeDeviceMoodboard, MoodboardChanged, type DeviceBoard } from "./studio-moodboard-device-store";
import { StudioMoodboardCheckpointPanel } from "./StudioMoodboardCheckpointPanel";
import { StudioMoodboardPanel } from "./StudioMoodboardPanel";
import {
  STUDIO_MOODBOARD_UPDATED_EVENT,
  createDefaultStudioProjectMoodboard,
  type Moodboard,
  type MoodboardAssetCatalogEntry,
} from "./studio-moodboard";
import {
  createSpatialStoryBoardDocument,
  type SpatialStoryBoardDocument,
} from "./studio-spatial-story-board-canvas";

const LazyPlotrSpatialBoardView = lazy(() =>
  import("./plotr/PlotrSpatialBoardView").then((m) => ({
    default: m.PlotrSpatialBoardView,
  })),
);

function seedSpatialFromMoodboard(board: Moodboard): SpatialStoryBoardDocument {
  const base = createSpatialStoryBoardDocument(board.title || "작품 공간 스토리보드");
  const cards = Object.values(board.cards);
  const nodes = cards.map((card, idx) => ({
    id: `mb-${card.id}`,
    boardId: base.rootBoardId,
    kind:
      card.kind === "image" || card.kind === "sketch"
        ? ("reference-image" as const)
        : ("sticky" as const),
    titleKo: (card.text || card.kind).slice(0, 28) || `카드 ${idx + 1}`,
    bodyKo: card.text || "무드보드에서 가져온 카드",
    x: 36 + (idx % 3) * 252,
    y: 44 + Math.floor(idx / 3) * 140,
    width: 220,
    height: 110,
    tags: [card.kind],
  }));
  const arrows = (board.connections ?? []).map((conn, idx) => ({
    id: `mbarr-${idx}`,
    boardId: base.rootBoardId,
    fromNodeId: `mb-${conn.from}`,
    toNodeId: `mb-${conn.to}`,
    labelKo: "연결",
    curveOffsetPx: -14,
  }));
  return { ...base, nodes, arrows };
}

export interface StudioProjectMoodboardProps {
  readonly projectId: string;
  readonly imageCatalog?: readonly MoodboardAssetCatalogEntry[];
}

type LoadState = DeviceBoard | { kind: "loading" } | { kind: "unavailable"; reason: string };

export function StudioProjectMoodboard(props: StudioProjectMoodboardProps) {
  return <ProjectBoardSession key={props.projectId} {...props} />;
}

const HISTORY_LIMIT = 30;

function ProjectBoardSession({ projectId, imageCatalog }: StudioProjectMoodboardProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [history, setHistory] = useState<{ past: Moodboard[]; future: Moodboard[] }>({ past: [], future: [] });
  const [saveError, setSaveError] = useState<"unavailable" | "changed" | null>(null);
  const [saving, setSaving] = useState(false);
  const [boardSurfaceMode, setBoardSurfaceMode] = useState<"columns" | "spatial">("columns");
  const [customSpatialDoc, setCustomSpatialDoc] = useState<SpatialStoryBoardDocument | null>(null);
  const readyBoard = state.kind === "ready" ? state.board : null;
  const seededSpatialDoc = useMemo(
    () => (readyBoard ? seedSpatialFromMoodboard(readyBoard) : null),
    [readyBoard],
  );
  const lastSaved = useRef("");
  const epoch = useRef(0);
  const pending = useRef(0);
  const queue = useRef(Promise.resolve(true));
  const alive = useRef(false);
  const events = useRef<BroadcastChannel | null>(null);

  async function reload(external = false) {
    if (external && (pending.current || saveError)) return;
    const ticket = ++epoch.current;
    try {
      const next = await loadDeviceMoodboard(projectId);
      if (!alive.current || epoch.current !== ticket || (external && next.raw === lastSaved.current)) return;
      lastSaved.current = next.raw;
      setState(next);
      setHistory({ past: [], future: [] });
      setSaveError(null);
    } catch {
      if (alive.current && epoch.current === ticket && !external) setState({ kind: "unavailable",
        reason: r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.loadFailed", "무드보드를 불러올 수 없어요.") });
    }
  }

  const refresh = useEffectEvent((external: boolean) => { void reload(external); });
  useEffect(() => {
    alive.current = true;
    refresh(false);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(STUDIO_MOODBOARD_UPDATED_EVENT);
    events.current = channel;
    if (channel) channel.onmessage = event => { if (event.data === projectId) refresh(true); };
    const updated = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.projectId === projectId) refresh(true);
    };
    window.addEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, updated);
    return () => {
      alive.current = false;
      window.removeEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, updated);
      channel?.close();
      events.current = null;
    };
  }, [projectId]);

  function persist(board: Moodboard, preserveDamaged = false) {
    ++epoch.current;
    ++pending.current;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      try {
        lastSaved.current = await writeDeviceMoodboard(projectId, board, lastSaved.current, preserveDamaged);
        window.dispatchEvent(new CustomEvent(STUDIO_MOODBOARD_UPDATED_EVENT, { detail: board }));
        events.current?.postMessage(projectId);
        if (alive.current) setSaveError(null);
        return true;
      } catch (error) {
        if (alive.current) setSaveError(error instanceof MoodboardChanged ? "changed" : "unavailable");
        return false;
      } finally {
        --pending.current;
        if (!pending.current && alive.current) setSaving(false);
      }
    });
    return queue.current;
  }

  if (state.kind === "loading") return <p role="status" className="p-3">{r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.opening", "아이디어 보드를 여는 중…")}</p>;
  if (state.kind === "broken" || state.kind === "unavailable") {
    const restore = async (replacement: Moodboard) => {
      if (state.kind !== "broken" || pending.current) return false;
      if (!await persist(replacement, true)) return false;
      if (alive.current) await reload();
      return true;
    };
    const title = r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.boardName", "아이디어 보드");
    return <section aria-label={title} className="studio-project-moodboard">
      <h2>{title}</h2><p role="alert">{state.reason}</p>
      <button type="button" onClick={() => void reload()}>보드 다시 불러오기</button>
      {saveError && <p role="alert">{saveError === "changed" ? r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.backupChanged", "저장본이 바뀌었어요. 다시 불러와 확인해 주세요.") : r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.backupFailed", "원래 보드를 보존하지 못했어요. 저장 공간을 확인해 주세요.")}</p>}
      {state.kind === "broken" && <StudioMoodboardCheckpointPanel projectId={projectId} onRestore={restore}/>}
      {state.kind === "broken" && <button type="button" disabled={saving} onClick={() => void restore(createDefaultStudioProjectMoodboard(projectId))}>새 무드보드로 시작하기</button>}
    </section>;
  }

  function change(next: Moodboard, past: Moodboard[], future: Moodboard[]) {
    setState({ kind: "ready", board: next, raw: lastSaved.current });
    setHistory({ past: past.slice(-HISTORY_LIMIT), future: future.slice(-HISTORY_LIMIT) });
    return persist(next);
  }

  const board = state.board;
  const spatialDoc = customSpatialDoc ?? seededSpatialDoc ?? seedSpatialFromMoodboard(board);
  const previous = history.past.at(-1);
  const following = history.future.at(-1);
  const tools = <>
    <div className="studio-project-moodboard-actions" role="group" aria-label="보드 변경 기록">
      <button type="button" disabled={!previous} onClick={() => previous && change(previous, history.past.slice(0, -1), [...history.future, board])}>실행 취소</button>
      <button type="button" disabled={!following} onClick={() => following && change(following, [...history.past, board], history.future.slice(0, -1))}>다시 실행</button>
      <button
        type="button"
        data-testid="moodboard-toggle-spatial-view"
        aria-pressed={boardSurfaceMode === "spatial"}
        onClick={() => setBoardSurfaceMode((mode) => (mode === "columns" ? "spatial" : "columns"))}
      >
        {boardSurfaceMode === "spatial" ? "열 보드로 보기" : "자유 공간 보드로 보기"}
      </button>
      {!saveError && <span role="status">{saving ? r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.localSaving", "저장 중…") : r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.localSaved", "이 기기에 저장됨")}</span>}
    </div>
    {saveError && <div role="alert">
      {saveError === "changed"
        ? <>다른 탭에서 보드가 바뀌었어요. 지금 화면의 수정 내용은 저장되지 않았습니다. <button type="button" onClick={() => void reload()}>내 변경을 버리고 저장본 열기</button></>
        : <>저장 공간이나 브라우저 설정을 확인해 주세요. 수정한 카드는 이 탭에 남아 있어요. <button type="button" onClick={() => persist(board)}>다시 저장</button></>}
    </div>}
    {!saveError && <StudioMoodboardCheckpointPanel projectId={projectId} board={board} onRestore={snapshot =>
      change(snapshot, [...history.past, board], [])
    }/>}
  </>;
  return <div className="studio-project-moodboard">
    {boardSurfaceMode === "spatial" ? (
      <div className="space-y-3">
        {tools}
        <Suspense fallback={<p role="status" className="p-3">자유 공간 보드를 여는 중…</p>}>
          <LazyPlotrSpatialBoardView document={spatialDoc} onChange={setCustomSpatialDoc} />
        </Suspense>
      </div>
    ) : (
      <StudioMoodboardPanel tools={tools} board={board} imageCatalog={imageCatalog} scriptProjectId={saveError ? undefined : projectId} profileProjectId={saveError ? undefined : projectId}
        onBoardChange={next => change(next, [...history.past, board], [])} />
    )}
  </div>;
}
