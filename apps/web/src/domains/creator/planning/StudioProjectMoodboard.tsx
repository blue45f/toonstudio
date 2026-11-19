import { useEffect, useEffectEvent, useRef, useState } from "react";
import "./StudioProjectMoodboard.css";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import { StudioMoodboardCheckpointPanel } from "./StudioMoodboardCheckpointPanel";
import { StudioMoodboardPanel } from "./StudioMoodboardPanel";
import {
  STUDIO_MOODBOARD_UPDATED_EVENT,
  createDefaultStudioProjectMoodboard,
  readStudioProjectMoodboard,
  saveStudioProjectMoodboard,
  serializeMoodboard,
  studioMoodboardStorageKey,
  type Moodboard,
  type MoodboardAssetCatalogEntry,
} from "./studio-moodboard";

export interface StudioProjectMoodboardProps {
  readonly projectId: string;
  readonly imageCatalog?: readonly MoodboardAssetCatalogEntry[];
}

type LoadState =
  | { readonly kind: "ready"; readonly board: Moodboard }
  | { readonly kind: "broken"; readonly reason: string; readonly damaged?: string }
  | { readonly kind: "unavailable" };

function loadMoodboard(projectId: string): LoadState {
  if (typeof window === "undefined") return { kind: "unavailable" };
  try {
    const stored = readStudioProjectMoodboard(window.localStorage, projectId);
    if (stored === null) {
      const initial = createDefaultStudioProjectMoodboard(projectId);
      return { kind: "ready", board: saveStudioProjectMoodboard(window.localStorage, initial) };
    }
    if (!stored.ok) return { kind: "broken", reason: stored.reason, damaged: window.localStorage.getItem(studioMoodboardStorageKey(projectId)) ?? undefined };
    // projectId 가 비어 있는 구 저장본은 현재 프로젝트 보드로 귀속시켜 저장한다.
    const board = stored.board.projectId
      ? stored.board
      : saveStudioProjectMoodboard(
          window.localStorage,
          { ...stored.board, projectId },
        );
    return { kind: "ready", board };
  } catch (error) {
    return {
      kind: "broken",
      reason: error instanceof Error ? error.message : r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.loadFailed", "무드보드를 불러올 수 없어요."),
    };
  }
}

export function StudioProjectMoodboard(props: StudioProjectMoodboardProps) {
  return <ProjectBoardSession key={props.projectId} {...props} />;
}

const HISTORY_LIMIT = 30;

function ProjectBoardSession({ projectId, imageCatalog }: StudioProjectMoodboardProps) {
  const [state, setState] = useState<LoadState>(() => loadMoodboard(projectId));
  const [history, setHistory] = useState<{ past: Moodboard[]; future: Moodboard[] }>({ past: [], future: [] });
  const [saveError, setSaveError] = useState<"unavailable" | "changed" | null>(null);
  const lastSaved = useRef(state.kind === "ready" ? serializeMoodboard(state.board) : null);
  const writing = useRef(false);

  function loadSavedState(next: LoadState) {
    lastSaved.current = next.kind === "ready" ? serializeMoodboard(next.board) : null;
    setState(next);
    setHistory({ past: [], future: [] });
    setSaveError(null);
  }

  const refreshFromStorage = useEffectEvent(() => {
    if (writing.current) return;
    const next = loadMoodboard(projectId);
    if (next.kind === "ready" && serializeMoodboard(next.board) === lastSaved.current) return;
    if (saveError) setSaveError("changed");
    else loadSavedState(next);
  });

  useEffect(() => {
    const updated = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.projectId === projectId) refreshFromStorage();
    };
    const stored = (event: StorageEvent) => {
      if (event.key === null || event.key === studioMoodboardStorageKey(projectId)) refreshFromStorage();
    };
    window.addEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, updated);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, updated);
      window.removeEventListener("storage", stored);
    };
  }, [projectId]);

  function persist(board: Moodboard) {
    writing.current = true;
    try {
      const current = readStudioProjectMoodboard(window.localStorage, projectId);
      if (current?.ok !== true || serializeMoodboard(current.board) !== lastSaved.current) {
        setSaveError("changed");
        return false;
      }
      const saved = saveStudioProjectMoodboard(window.localStorage, board, window);
      lastSaved.current = serializeMoodboard(saved);
      setSaveError(null);
      return true;
    } catch {
      setSaveError("unavailable");
      return false;
    } finally {
      writing.current = false;
    }
  }

  if (state.kind === "unavailable") return null;
  if (state.kind === "broken") {
    const restore = (replacement: Moodboard) => {
      try {
        const storage = window.localStorage;
        const key = studioMoodboardStorageKey(projectId);
        if (state.damaged !== undefined) {
          if (storage.getItem(key) !== state.damaged) {
            loadSavedState(loadMoodboard(projectId));
            return false;
          }
          // 복구 시 손상된 원문도 프로젝트별로 보존한다.
          storage.setItem(key + ":damaged:" + crypto.randomUUID(), state.damaged);
        } else if (storage.getItem(key) !== null) {
          loadSavedState(loadMoodboard(projectId));
          return false;
        }
        loadSavedState({ kind: "ready", board: saveStudioProjectMoodboard(storage, replacement, window) });
        return true;
      } catch {
        setState({ ...state, reason: "원래 보드를 보존하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요." });
        return false;
      }
    };
    return <section aria-label="기획 무드보드" className="studio-project-moodboard">
      <h2>기획 무드보드</h2><p role="alert">{state.reason}</p>
      <button type="button" onClick={() => loadSavedState(loadMoodboard(projectId))}>보드 다시 불러오기</button>
      <StudioMoodboardCheckpointPanel projectId={projectId} onRestore={restore}/>
      <button type="button" onClick={() => restore(createDefaultStudioProjectMoodboard(projectId))}>새 무드보드로 시작하기</button>
    </section>;
  }

  function change(next: Moodboard, past: Moodboard[], future: Moodboard[]) {
    setState({ kind: "ready", board: next });
    setHistory({ past: past.slice(-HISTORY_LIMIT), future: future.slice(-HISTORY_LIMIT) });
    persist(next);
  }

  const board = state.board;
  const previous = history.past.at(-1);
  const following = history.future.at(-1);
  return <div className="studio-project-moodboard">
    <div className="studio-project-moodboard-actions" role="group" aria-label="보드 변경 기록">
      <button type="button" disabled={!previous} onClick={() => previous && change(previous, history.past.slice(0, -1), [...history.future, board])}>실행 취소</button>
      <button type="button" disabled={!following} onClick={() => following && change(following, [...history.past, board], history.future.slice(0, -1))}>다시 실행</button>
      {!saveError && <span role="status">이 기기에 저장됨</span>}
    </div>
    {saveError && <div role="alert">
      {saveError === "changed"
        ? <>다른 탭에서 보드가 바뀌었어요. 지금 화면의 수정 내용은 저장되지 않았습니다. <button type="button" onClick={() => loadSavedState(loadMoodboard(projectId))}>내 변경을 버리고 저장본 열기</button></>
        : <>저장 공간이나 브라우저 설정을 확인해 주세요. 수정한 카드는 이 탭에 남아 있어요. <button type="button" onClick={() => persist(board)}>다시 저장</button></>}
    </div>}
    {!saveError && <StudioMoodboardCheckpointPanel projectId={projectId} board={board} onRestore={snapshot => {
      if (!persist(snapshot)) return false;
      setHistory({ past: [...history.past, board].slice(-HISTORY_LIMIT), future: [] });
      setState({ kind: "ready", board: snapshot });
      return true;
    }}/>}
    <StudioMoodboardPanel board={board} imageCatalog={imageCatalog} scriptProjectId={saveError ? undefined : projectId} profileProjectId={saveError ? undefined : projectId}
      onBoardChange={next => change(next, [...history.past, board], [])} />
  </div>;
}
