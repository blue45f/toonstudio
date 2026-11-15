import { useEffect, useRef, type MutableRefObject } from "react";

import { selectionShapeForIds } from "../studio-group-selection";

export interface StudioPerSurfaceSelectionContinuityInput {
  readonly documentScopeKey: string;
  readonly activePageId: string;
  readonly masterEditMode: boolean;
  readonly pagesHi: number;
  readonly selectedId: string | null;
  readonly marqueeIds: readonly string[];
  readonly activeElementsRef: { readonly current: readonly { readonly id: string }[] };
  readonly pendingStrokeCommitsRef: {
    readonly current: {
      readonly pageId: string;
      readonly strokes: readonly { readonly id: string }[];
    } | null;
  };
  readonly selectedIdRef: MutableRefObject<string | null>;
  readonly marqueeIdsRef: MutableRefObject<string[]>;
  readonly activeGroupIdRef: MutableRefObject<string | null>;
  readonly setSelectedId: (next: string | null) => void;
  readonly setMarqueeIds: (next: string[]) => void;
  readonly setActiveGroupId: (next: string | null) => void;
}

interface SurfaceSelectionMemoryState {
  scopeKey: string;
  committedSurfaceKey: string | null;
  bySurface: Map<string, readonly string[]>;
}

function resolveSurfaceKey(activePageId: string, masterEditMode: boolean): string {
  return masterEditMode ? "__master__" : activePageId;
}

function buildSurvivesPredicate(
  activePageId: string,
  masterEditMode: boolean,
  activeElements: readonly { readonly id: string }[],
  pendingBatch: {
    readonly pageId: string;
    readonly strokes: readonly { readonly id: string }[];
  } | null,
): (id: string) => boolean {
  const activeIds = new Set(activeElements.map((element) => element.id));
  const pendingIds =
    !masterEditMode && pendingBatch?.pageId === activePageId
      ? new Set(pendingBatch.strokes.map((stroke) => stroke.id))
      : null;
  return (id: string) => activeIds.has(id) || pendingIds?.has(id) === true;
}

function syncSurfaceSelectionRefs(
  selectedIdRef: MutableRefObject<string | null>,
  marqueeIdsRef: MutableRefObject<string[]>,
  selectedId: string | null,
  marqueeIds: string[],
): void {
  selectedIdRef.current = selectedId;
  marqueeIdsRef.current = marqueeIds;
}

function clearSurfaceActiveGroupRef(activeGroupIdRef: MutableRefObject<string | null>): void {
  activeGroupIdRef.current = null;
}

/**
 * 작업면(컷/페이지·마스터)이 바뀌거나 요소가 제거될 때 유효한 선택 모양을 수렴시키되,
 * 다른 컷/공정을 다녀온 뒤 원래 컷으로 복귀하면 직전 활성 레이어 선택을 복원한다.
 * 문서 스코프(`documentScopeKey`)가 바뀌면 기억 저장소를 비워 새 문서로의 상태 누출을 막는다.
 */
export function useStudioPerSurfaceSelectionContinuity(
  input: StudioPerSurfaceSelectionContinuityInput,
): void {
  const {
    documentScopeKey,
    activePageId,
    masterEditMode,
    pagesHi,
    selectedId,
    marqueeIds,
    activeElementsRef,
    pendingStrokeCommitsRef,
    selectedIdRef,
    marqueeIdsRef,
    activeGroupIdRef,
    setSelectedId,
    setMarqueeIds,
    setActiveGroupId,
  } = input;

  const memoryRef = useRef<SurfaceSelectionMemoryState>({
    scopeKey: documentScopeKey,
    committedSurfaceKey: null,
    bySurface: new Map(),
  });

  useEffect(() => {
    if (memoryRef.current.scopeKey !== documentScopeKey) {
      memoryRef.current = {
        scopeKey: documentScopeKey,
        committedSurfaceKey: null,
        bySurface: new Map(),
      };
    }
    const surfaceKey = resolveSurfaceKey(activePageId, masterEditMode);
    const survives = buildSurvivesPredicate(
      activePageId,
      masterEditMode,
      activeElementsRef.current,
      pendingStrokeCommitsRef.current,
    );
    const surfaceChanged =
      memoryRef.current.committedSurfaceKey !== null
      && memoryRef.current.committedSurfaceKey !== surfaceKey;

    const survivingSelectedId =
      selectedIdRef.current && survives(selectedIdRef.current)
        ? selectedIdRef.current
        : null;
    const survivingMarqueeIds = marqueeIdsRef.current.filter(survives);
    const incomingIds = survivingSelectedId
      ? [survivingSelectedId]
      : survivingMarqueeIds;

    const candidateIds =
      incomingIds.length === 0 && surfaceChanged
        ? (memoryRef.current.bySurface.get(surfaceKey) ?? []).filter(survives)
        : incomingIds;

    const nextShape = selectionShapeForIds(candidateIds);
    memoryRef.current.committedSurfaceKey = surfaceKey;
    memoryRef.current.bySurface.set(
      surfaceKey,
      nextShape.selectedId ? [nextShape.selectedId] : [...nextShape.marqueeIds],
    );

    if (
      nextShape.selectedId !== selectedIdRef.current
      || nextShape.marqueeIds.length !== marqueeIdsRef.current.length
      || nextShape.marqueeIds.some((id, idx) => id !== marqueeIdsRef.current[idx])
    ) {
      syncSurfaceSelectionRefs(
        selectedIdRef,
        marqueeIdsRef,
        nextShape.selectedId,
        nextShape.marqueeIds,
      );
      setSelectedId(nextShape.selectedId);
      setMarqueeIds(nextShape.marqueeIds);
    }

    clearSurfaceActiveGroupRef(activeGroupIdRef);
    setActiveGroupId(null);
  }, [
    activeElementsRef,
    activeGroupIdRef,
    activePageId,
    documentScopeKey,
    marqueeIdsRef,
    masterEditMode,
    pagesHi,
    pendingStrokeCommitsRef,
    selectedIdRef,
    setActiveGroupId,
    setMarqueeIds,
    setSelectedId,
  ]);

  useEffect(() => {
    if (memoryRef.current.scopeKey !== documentScopeKey) return;
    const surfaceKey = resolveSurfaceKey(activePageId, masterEditMode);
    if (memoryRef.current.committedSurfaceKey !== surfaceKey) return;

    const survives = buildSurvivesPredicate(
      activePageId,
      masterEditMode,
      activeElementsRef.current,
      pendingStrokeCommitsRef.current,
    );
    const currentSelected =
      selectedIdRef.current && survives(selectedIdRef.current)
        ? selectedIdRef.current
        : null;
    const currentMarquee = marqueeIdsRef.current.filter(survives);
    const remembered = currentSelected ? [currentSelected] : currentMarquee;
    memoryRef.current.bySurface.set(surfaceKey, remembered);
  }, [
    activeElementsRef,
    activePageId,
    documentScopeKey,
    marqueeIds,
    marqueeIdsRef,
    masterEditMode,
    pendingStrokeCommitsRef,
    selectedId,
    selectedIdRef,
  ]);
}
