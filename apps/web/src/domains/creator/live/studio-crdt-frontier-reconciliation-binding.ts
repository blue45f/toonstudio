import type { MutableRefObject } from "react";
import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtSceneGraphRuntime } from "./StudioLiveCollaborationProvider";
import type { StudioCrdtSceneGraphFrontier, StudioCrdtSceneGraphChangedIds } from "./studio-crdt-history";
import { STUDIO_CRDT_ORIGIN_LOCAL } from "./studio-crdt-protocol";
import * as offline from "../offline-branch/studio-offline-host-integration";
import { readyStudioWorkAssetImageSources } from "../studio-legacy-editor-runtime-helpers";
import type { PageState } from "../studio-page-state";
import type { El } from "../studio-element-model";
import { rebaseStudioCrdtPendingScenePropertyHistory } from "./studio-crdt-pending-frontier-history";

export { studioBg3dSixPassEditReason as admitNativePageMutation } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-edit-guard";

const pageSnapshots = new WeakMap<StudioCrdtDocument, () => readonly PageState[]>();
/** 원고 command와 같은 history 권위의 현재 pages를 지연 로드된 검증 경로에 제공한다. */
export function readStudioCrdtBoundPageSnapshot(document: StudioCrdtDocument): readonly PageState[] | null {
  return pageSnapshots.get(document)?.() ?? null;
}

/** CRDT 수신과 자산 준비가 기존 원격 이력 재조정 한 번으로 이어지도록 묶는다. */
export function bindStudioCrdtFrontierReconciliation<Access extends { documentGeneration: number }>(input: {
  document: StudioCrdtDocument;
  runtimeRef: MutableRefObject<StudioCrdtSceneGraphRuntime | null>;
  mountedRef: MutableRefObject<boolean>;
  pagesHistoryRef: MutableRefObject<PageState[][]>;
  pagesHiRef: MutableRefObject<number>;
  revisionRef: MutableRefObject<number>;
  accessRef: MutableRefObject<Access>;
  hydrator: { readySources(): ReadonlyMap<string, { type: string }> };
  workId: string | null;
  reportError(message: string): void;
  rebase(pages: PageState[], index: number, reason: string): void;
  setHistory(history: PageState[][]): void;
  setReconciled(document: StudioCrdtDocument): void;
}): () => void {
  const subscribedRuntime = input.runtimeRef.current;
  let active = true, hydrationGeneration = 0;
  let pendingChangedIds: StudioCrdtSceneGraphChangedIds | null | undefined;
  let pendingOfflineProjection = false;
  const handledPropertyIds = new Set<string>();
  const pendingStructuralSceneIds = new Set<string>();
  let localRevision = 0, initialReconciled = false;
  let observedFrontier = offline.studioOfflineDocumentFrontier(input.document);
  const readPages = () => input.pagesHistoryRef.current[input.pagesHiRef.current] ?? [];
  pageSnapshots.set(input.document, readPages);
  const applyResolved = (frontier: StudioCrdtSceneGraphFrontier, changedIds: StudioCrdtSceneGraphChangedIds | null,
    forceOfflineProjection: boolean, bundleSources: ReadonlyMap<string, El> = new Map()) => {
    const runtime = input.runtimeRef.current;
    if (!active || !input.mountedRef.current || !runtime || runtime !== subscribedRuntime) return;
    const currentHistory = input.pagesHistoryRef.current;
    const currentIndex = Math.max(0, Math.min(input.pagesHiRef.current, Math.max(0, currentHistory.length - 1)));
    const sources = readyStudioWorkAssetImageSources(input.hydrator);
    for (const [id, element] of bundleSources) sources.set(id, element);
    const currentOnly = changedIds !== null && handledPropertyIds.size > 0 && changedIds.strokeIds.size === 0
      && changedIds.sceneElementIds.size === 0 && changedIds.pageIds.size === 0 && changedIds.layerGroupIds.size === 0;
    const reconciled = offline.reconcileStudioOfflineCrdtFrontier({ runtime, document: input.document,
      reportError: input.reportError, currentHistory: currentOnly ? [currentHistory[currentIndex] ?? []] : currentHistory,
      currentIndex: currentOnly ? 0 : currentIndex, frontier, changedIds: currentOnly ? null : changedIds, forceOfflineProjection,
      referenceSources: sources });
    if (reconciled) {
      input.revisionRef.current += 1;
      input.accessRef.current = { ...input.accessRef.current, documentGeneration: input.accessRef.current.documentGeneration + 1 };
      const history = currentOnly ? currentHistory.map((pages, index) => index === currentIndex ? reconciled.currentPages : pages) : reconciled.history;
      input.pagesHistoryRef.current = history; input.pagesHiRef.current = currentIndex;
      input.rebase(reconciled.currentPages, currentIndex, "remote CRDT reconciliation"); input.setHistory(history);
    }
    input.setReconciled(input.document);
  };
  const applyPending = (frontier: StudioCrdtSceneGraphFrontier, sources?: ReadonlyMap<string, El>) => {
    const generation = hydrationGeneration;
    const changedIds = pendingChangedIds == null ? null : { ...pendingChangedIds,
      sceneElementIds: new Set([...pendingChangedIds.sceneElementIds].filter((id) => !handledPropertyIds.has(id))) };
    const forceOfflineProjection = pendingOfflineProjection;
    applyResolved(frontier, changedIds, forceOfflineProjection, sources);
    if (generation === hydrationGeneration) {
      pendingChangedIds = undefined; pendingOfflineProjection = false; handledPropertyIds.clear();
      pendingStructuralSceneIds.clear(); initialReconciled = true;
    }
  };
  const applyFrontier = (frontier: StudioCrdtSceneGraphFrontier, changedIds: StudioCrdtSceneGraphChangedIds | null,
    forceOfflineProjection = false) => {
    // 표시를 생략한 frontier의 변경도 모든 undo/redo snapshot에 반영한다. null은 최초 전체 복원이다.
    pendingChangedIds = pendingChangedIds === null || changedIds === null ? null : {
      strokeIds: new Set([...(pendingChangedIds?.strokeIds ?? []), ...changedIds.strokeIds]),
      sceneElementIds: new Set([...(pendingChangedIds?.sceneElementIds ?? []), ...changedIds.sceneElementIds]),
      pageIds: new Set([...(pendingChangedIds?.pageIds ?? []), ...changedIds.pageIds]),
      layerGroupIds: new Set([...(pendingChangedIds?.layerGroupIds ?? []), ...changedIds.layerGroupIds]),
    };
    pendingOfflineProjection ||= forceOfflineProjection;
    const generation = ++hydrationGeneration;
    const revision = localRevision;
    if (!frontier.pages.some((page) => page.bg3dLtBundleReferences)) {
      applyPending(frontier); return;
    }
    void import("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration").then(({ hydrateStudioBg3dSixPassFrontier }) =>
      hydrateStudioBg3dSixPassFrontier(frontier, input.workId, input.pagesHistoryRef.current[input.pagesHiRef.current] ?? [])).then((hydrated) => {
      if (!active || generation !== hydrationGeneration) return;
      if (revision !== localRevision) {
        applyFrontier(offline.studioOfflineDocumentFrontier(input.document), {
          strokeIds: new Set(), sceneElementIds: new Set(), pageIds: new Set(), layerGroupIds: new Set(),
        });
        return;
      }
      applyPending(hydrated.frontier, hydrated.sources);
    }).catch((error: unknown) => {
      if (active && generation === hydrationGeneration) input.reportError(error instanceof Error ? error.message : "6패스 묶음 복원에 실패했습니다.");
    });
  };
  applyFrontier(observedFrontier, null);
  const unsubscribeLocal = input.document.subscribeChanges((change) => {
    localRevision += 1;
    observedFrontier = { ...observedFrontier, sceneElements: change.snapshot.sceneElements };
  }, { includeOrigin: (origin) => origin === STUDIO_CRDT_ORIGIN_LOCAL,
    includeChange: ({ changedStrokeIds, changedSceneElementIds, changedPageIds, changedLayerGroupIds }) =>
      changedStrokeIds.size > 0 || changedSceneElementIds.size > 0 || changedPageIds.size > 0 || changedLayerGroupIds.size > 0,
    snapshotFields: ["sceneElements"] as const });
  const unsubscribeDocument = offline.subscribeStudioOfflineDocumentFrontier(input.document, STUDIO_CRDT_ORIGIN_LOCAL, (frontier, changedIds) => {
    if (!active || !input.mountedRef.current || input.runtimeRef.current !== subscribedRuntime) return;
    const before = observedFrontier;
    observedFrontier = frontier;
    if (initialReconciled && frontier.pages.some((page) => page.bg3dLtBundleReferences)) {
      const rebased = rebaseStudioCrdtPendingScenePropertyHistory({ history: input.pagesHistoryRef.current,
        before, after: frontier, changedSceneElementIds: changedIds.sceneElementIds });
      for (const id of changedIds.sceneElementIds) {
        handledPropertyIds.delete(id);
        if (!rebased.handledSceneElementIds.has(id)) pendingStructuralSceneIds.add(id);
      }
      for (const id of rebased.handledSceneElementIds) if (!pendingStructuralSceneIds.has(id)) handledPropertyIds.add(id);
      if (rebased.changed) {
        const index = input.pagesHiRef.current;
        input.pagesHistoryRef.current = rebased.history;
        input.revisionRef.current += 1;
        input.accessRef.current = { ...input.accessRef.current, documentGeneration: input.accessRef.current.documentGeneration + 1 };
        input.rebase(rebased.history[index] ?? [], index, "remote CRDT property reconciliation"); input.setHistory(rebased.history);
      }
    }
    applyFrontier(observedFrontier === frontier ? frontier : offline.studioOfflineDocumentFrontier(input.document), changedIds);
  });
  const unsubscribeOffline = subscribedRuntime?.offlineBranch?.subscribeProjection(() => {
    applyFrontier(offline.studioOfflineDocumentFrontier(input.document), null, true);
  });
  return () => {
    active = false; hydrationGeneration += 1; unsubscribeDocument(); unsubscribeLocal(); unsubscribeOffline?.();
    if (pageSnapshots.get(input.document) === readPages) pageSnapshots.delete(input.document);
  };
}
