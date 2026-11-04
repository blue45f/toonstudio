import type { MutableRefObject } from "react";
import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtSceneGraphRuntime } from "./StudioLiveCollaborationProvider";
import type { StudioCrdtSceneGraphFrontier, StudioCrdtSceneGraphChangedIds } from "./studio-crdt-history";
import { STUDIO_CRDT_ORIGIN_LOCAL } from "./studio-crdt-protocol";
import * as offline from "../offline-branch/studio-offline-host-integration";
import { readyStudioWorkAssetImageSources } from "../studio-legacy-editor-runtime-helpers";
import type { PageState } from "../studio-page-state";
import type { El } from "../studio-element-model";

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
    const reconciled = offline.reconcileStudioOfflineCrdtFrontier({ runtime, document: input.document,
      reportError: input.reportError, currentHistory, currentIndex, frontier, changedIds, forceOfflineProjection,
      referenceSources: sources });
    if (reconciled) {
      input.revisionRef.current += 1;
      input.accessRef.current = { ...input.accessRef.current, documentGeneration: input.accessRef.current.documentGeneration + 1 };
      input.pagesHistoryRef.current = reconciled.history; input.pagesHiRef.current = currentIndex;
      input.rebase(reconciled.currentPages, currentIndex, "remote CRDT reconciliation"); input.setHistory(reconciled.history);
    }
    input.setReconciled(input.document);
  };
  const applyFrontier = (frontier: StudioCrdtSceneGraphFrontier, changedIds: StudioCrdtSceneGraphChangedIds | null,
    forceOfflineProjection = false) => {
    const generation = ++hydrationGeneration;
    if (!frontier.pages.some((page) => page.bg3dLtBundleReferences)) {
      applyResolved(frontier, changedIds, forceOfflineProjection); return;
    }
    void import("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration").then(({ hydrateStudioBg3dSixPassFrontier }) =>
      hydrateStudioBg3dSixPassFrontier(frontier, input.workId, input.pagesHistoryRef.current[input.pagesHiRef.current] ?? [])).then((hydrated) => {
      if (active && generation === hydrationGeneration) applyResolved(hydrated.frontier, changedIds, forceOfflineProjection, hydrated.sources);
    }).catch((error: unknown) => {
      if (active && generation === hydrationGeneration) input.reportError(error instanceof Error ? error.message : "6패스 묶음 복원에 실패했습니다.");
    });
  };
  applyFrontier(offline.studioOfflineDocumentFrontier(input.document), null);
  const unsubscribeDocument = offline.subscribeStudioOfflineDocumentFrontier(input.document, STUDIO_CRDT_ORIGIN_LOCAL, applyFrontier);
  const unsubscribeOffline = subscribedRuntime?.offlineBranch?.subscribeProjection(() => {
    applyFrontier(offline.studioOfflineDocumentFrontier(input.document), null, true);
  });
  return () => {
    active = false; hydrationGeneration += 1; unsubscribeDocument(); unsubscribeOffline?.();
    if (pageSnapshots.get(input.document) === readPages) pageSnapshots.delete(input.document);
  };
}
