/**
 * 프로젝트 story 뷰에 기획 무드보드를 실제로 장착하는 연결 컴포넌트.
 *
 * - 데이터: studio-moodboard 저장소 (프로젝트별 localStorage, 프로젝트 단위 저장).
 * - 호스트는 projectId 만 넘기면 된다. 이미지 해석 카탈로그(imageCatalog)는
 *   개인/프로젝트 에셋 목록을 가진 호스트가 선택으로 공급한다 — 없으면
 *   URL 참조 카드만 해석되고, 에셋 참조 카드는 사유와 함께 표시된다.
 * - 깨진 저장본은 조용히 덮지 않는다: 사유를 보여주고, 사용자가 직접
 *   "새 무드보드로 시작하기"를 눌렀을 때만 기본 보드로 교체·저장한다.
 */
import { useEffect, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import { StudioMoodboardPanel } from "./StudioMoodboardPanel";
import {
  STUDIO_MOODBOARD_UPDATED_EVENT,
  createDefaultStudioProjectMoodboard,
  readStudioProjectMoodboard,
  saveStudioProjectMoodboard,
  type Moodboard,
  type MoodboardAssetCatalogEntry,
} from "./studio-moodboard";

export interface StudioProjectMoodboardProps {
  readonly projectId: string;
  readonly imageCatalog?: readonly MoodboardAssetCatalogEntry[];
}

type LoadState =
  | { readonly kind: "ready"; readonly board: Moodboard }
  | { readonly kind: "broken"; readonly reason: string }
  | { readonly kind: "unavailable" };

function loadMoodboard(projectId: string): LoadState {
  if (typeof window === "undefined") return { kind: "unavailable" };
  try {
    const stored = readStudioProjectMoodboard(window.localStorage, projectId);
    if (stored === null) {
      const initial = createDefaultStudioProjectMoodboard(projectId);
      return { kind: "ready", board: saveStudioProjectMoodboard(window.localStorage, initial) };
    }
    if (!stored.ok) return { kind: "broken", reason: stored.reason };
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

export function StudioProjectMoodboard({ projectId, imageCatalog }: StudioProjectMoodboardProps) {
  const [state, setState] = useState<LoadState>(() => loadMoodboard(projectId));

  useEffect(() => {
    setState(loadMoodboard(projectId));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = loadMoodboard(projectId);
      if (next.kind === "ready") setState(next);
    };
    window.addEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STUDIO_MOODBOARD_UPDATED_EVENT, onUpdated);
  }, [projectId]);

  if (state.kind === "unavailable") return null;

  if (state.kind === "broken") {
    const restart = () => {
      try {
        const initial = createDefaultStudioProjectMoodboard(projectId);
        setState({
          kind: "ready",
          board: saveStudioProjectMoodboard(window.localStorage, initial, window),
        });
      } catch {
        // 저장 실패 시 사유 화면을 유지한다.
      }
    };
    return (
      <section aria-label="기획 무드보드">
        <h2>기획 무드보드</h2>
        <p role="alert">저장된 무드보드를 열 수 없어요. {state.reason}</p>
        <button type="button" onClick={restart}>
          새 무드보드로 시작하기
        </button>
      </section>
    );
  }

  const handleBoardChange = (next: Moodboard) => {
    try {
      setState({
        kind: "ready",
        board: saveStudioProjectMoodboard(window.localStorage, next, window),
      });
    } catch {
      // 저장 실패 시 화면의 보드는 그대로 남는다. 다음 변경에서 다시 시도할 수 있다.
    }
  };

  return (
    <StudioMoodboardPanel
      board={state.board}
      onBoardChange={handleBoardChange}
      imageCatalog={imageCatalog}
    />
  );
}
