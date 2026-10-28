import type { Dispatch, SetStateAction } from "react";
import type { Bg3dModelLibraryEntry } from "./studio-bg3d-model-library-loader";
import type { StudioBg3dPrimitiveEditOrchestratorHost } from "./studio-bg3d-primitive-edit-orchestrator";
import type { StudioBg3dPrimitiveEditPorts } from "./studio-bg3d-primitive-edit-ports";
import {
  captureStudioBg3dPrimitiveEditSource,
  inspectStudioBg3dPrimitiveEditSource,
  revalidateStudioBg3dPrimitiveEditSource,
} from "./studio-bg3d-primitive-edit-source";
import { isStudioBg3dWorkbenchInsertionAvailable, type StudioBg3dWorkbenchInsertionHost } from "./studio-bg3d-workbench-insertion";
import { summarizeStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-summary";

export type StudioBg3dPrimitiveEditEditorHost = Partial<StudioBg3dPrimitiveEditOrchestratorHost>
  & Omit<StudioBg3dWorkbenchInsertionHost, "modelRenderer" | "physicsRuntimeSourceRef">
  & {
    readonly captureInFlightRef?: { readonly current: boolean };
    readonly cameraLensInteractionLocked?: () => boolean;
    readonly setModelLibrary?: Dispatch<SetStateAction<Bg3dModelLibraryEntry[]>>;
  };

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("원본 면 편집의 현재 호스트를 읽을 수 없습니다.");
  return value;
}

/** 각 getter와 명령은 호출 순간의 가변 호스트를 읽는다. 렌더 시점의 함수·ref를 복사하지 않는다. */
export function createStudioBg3dPrimitiveEditHost(host: StudioBg3dPrimitiveEditEditorHost): StudioBg3dPrimitiveEditOrchestratorHost {
  return {
    get open() { return host.open === true; },
    get selectedIds() { return host.selectedIds; },
    get selectedIdsRef() { return host.selectedIdsRef; },
    get physicsRuntimeSourceRef() { return required(host.physicsRuntimeSourceRef); },
    get modalAssetSessionRef() { return required(host.modalAssetSessionRef); },
    get modelRootCacheRef() { return required(host.modelRootCacheRef); },
    get attachmentByStorageModelIdRef() { return required(host.attachmentByStorageModelIdRef); },
    get storageModelIdByAttachmentIdRef() { return required(host.storageModelIdByAttachmentIdRef); },
    get deviceQuality() { return required(host.deviceQuality); },
    get modelRenderer() { return host.modelRenderer ?? null; },
    isPrimitiveEditInteractionLocked() {
      return !isStudioBg3dWorkbenchInsertionAvailable(host) || host.captureInFlightRef?.current === true
        || host.cameraLensInteractionLocked?.() === true;
    },
    replaceCanonicalDocumentState(mutation) { return required(host.replaceCanonicalDocumentState).call(host, mutation); },
    commitImmediateHistoryTransition(...args) { required(host.commitImmediateHistoryTransition).call(host, ...args); },
    async onAssetCommitted(record) {
      const session = host.modalAssetSessionRef?.current;
      if (host.setModelLibrary) {
        const { listBg3dModelLibraryEntriesV12 } = await import("./studio-bg3d-model-library-loader");
        const entries = await listBg3dModelLibraryEntriesV12();
        if (session && host.modalAssetSessionRef?.current === session && host.open) host.setModelLibrary?.(entries);
      }
      if (session && host.modalAssetSessionRef?.current === session && host.open) await host.onAssetCommitted?.(record);
    },
  };
}

function ready(host: StudioBg3dPrimitiveEditEditorHost): boolean {
  return Boolean(host.physicsRuntimeSourceRef && host.modalAssetSessionRef && host.modelRootCacheRef
    && host.attachmentByStorageModelIdRef && host.storageModelIdByAttachmentIdRef && host.deviceQuality
    && host.replaceCanonicalDocumentState && host.commitImmediateHistoryTransition);
}

const UNAVAILABLE = "현재 장면의 원본 면 편집을 준비하지 못했습니다. 편집기를 다시 연 뒤 시도하세요.";
const CHANGED = "선택 또는 편집기 세션이 바뀌었습니다. 현재 원본에서 다시 시작하세요.";

function hasSelectedModel(host: StudioBg3dPrimitiveEditEditorHost): boolean {
  const ids = host.selectedIdsRef?.current ?? host.selectedIds;
  return Boolean(ids && host.physicsRuntimeSourceRef?.current.customModels.some(({ id }) => ids.has(id)));
}

function selectedId(host: StudioBg3dPrimitiveEditEditorHost): string | null {
  const ids = host.selectedIdsRef?.current ?? host.selectedIds;
  if (!ids || ids.size !== 1) return null;
  return ids.values().next().value ?? null;
}

function modelPreparationScope(host: StudioBg3dPrimitiveEditEditorHost) {
  const id = selectedId(host);
  const runtime = host.physicsRuntimeSourceRef?.current;
  const model = runtime?.customModels.find((value) => value.id === id);
  const cached = model ? host.modelRootCacheRef?.current.get(model.modelId) : undefined;
  return { id, modelJson: JSON.stringify(model), nodeJson: JSON.stringify(runtime?.document.nodes.find((node) => node.id === id)),
    cache: cached, root: cached?.root, recordId: cached?.record.id, recordHash: cached?.record.contentHash,
    normalizationScale: cached?.normalizationScale };
}

export function createStudioBg3dPrimitiveEditHostPorts(host: StudioBg3dPrimitiveEditEditorHost): StudioBg3dPrimitiveEditPorts {
  const live = createStudioBg3dPrimitiveEditHost(host);
  const modelSelected = hasSelectedModel(host);
  const primitiveEditSelection = ready(host) ? (modelSelected
    ? { ...summarizeStudioBg3dAuthoredModelEditSource(live), sourceType: "authored-model" as const }
    : { ...inspectStudioBg3dPrimitiveEditSource(live), sourceType: "primitive" as const })
    : { nodeId: null, name: "", blockedReason: UNAVAILABLE };
  return {
    primitiveEditSelection,
    onBeginPrimitiveEdit: async (requestSignal) => {
      if (!ready(host) || requestSignal?.aborted) return { ok: false, messageKo: UNAVAILABLE };
      if (hasSelectedModel(host)) {
        const scope = modelPreparationScope(host);
        const session = host.modalAssetSessionRef?.current;
        const signal = requestSignal ?? new AbortController().signal;
        try {
          const source = await import("./studio-bg3d-authored-model-edit-source");
          const latest = modelPreparationScope(host);
          if (!ready(host) || signal.aborted || latest.id !== scope.id || latest.modelJson !== scope.modelJson
            || latest.nodeJson !== scope.nodeJson || latest.cache !== scope.cache || latest.root !== scope.root
            || latest.recordId !== scope.recordId || latest.recordHash !== scope.recordHash
            || latest.normalizationScale !== scope.normalizationScale || host.modalAssetSessionRef?.current !== session) {
            return { ok: false, messageKo: CHANGED };
          }
          const captured = await source.captureStudioBg3dAuthoredModelEditSource(live, signal);
          if (!captured.ok) return captured;
          const { createStudioBg3dAuthoredModelEditWorkspace } = await import("./studio-bg3d-authored-model-edit-workspace");
          if (!ready(host) || signal.aborted) return { ok: false, messageKo: CHANGED };
          const current = source.revalidateStudioBg3dAuthoredModelEditSource(live, captured.snapshot);
          if (!current.ok) return current;
          const result = createStudioBg3dAuthoredModelEditWorkspace(captured.snapshot);
          return result.ok ? { ok: true, context: result.value } : result;
        } catch { return { ok: false, messageKo: "보관된 원본 메시를 여는 중 오류가 발생했습니다. 다시 시도하세요." }; }
      }
      const source = captureStudioBg3dPrimitiveEditSource(live);
      if (!source.ok) return source;
      try {
        const { createStudioBg3dPrimitiveEditWorkspace } = await import("./studio-bg3d-primitive-edit-workspace");
        if (!ready(host) || requestSignal?.aborted) return { ok: false, messageKo: UNAVAILABLE };
        const current = revalidateStudioBg3dPrimitiveEditSource(live, source.snapshot);
        if (!current.ok) return current;
        const result = createStudioBg3dPrimitiveEditWorkspace(source.snapshot);
        return result.ok ? { ok: true, context: result.value } : result;
      } catch { return { ok: false, messageKo: UNAVAILABLE }; }
    },
    onApplyPrimitiveEdit: async (context, workspace, signal) => {
      if (!ready(host) || signal.aborted) return { ok: false, messageKo: UNAVAILABLE };
      try {
        if (context.kind === "authored-model") {
          const { applyStudioBg3dAuthoredModelEditWorkspace } = await import("./studio-bg3d-authored-model-edit-orchestrator");
          if (!ready(host)) return { ok: false, messageKo: UNAVAILABLE };
          return await applyStudioBg3dAuthoredModelEditWorkspace(live, context, workspace, signal);
        }
        const { applyStudioBg3dPrimitiveEditWorkspace } = await import("./studio-bg3d-primitive-edit-orchestrator");
        if (!ready(host)) return { ok: false, messageKo: UNAVAILABLE };
        return await applyStudioBg3dPrimitiveEditWorkspace(live, context, workspace, signal);
      } catch { return { ok: false, messageKo: "면 편집 결과를 반영하지 못했습니다. 원본과 모델 목록을 확인한 뒤 다시 시도하세요." }; }
    },
  };
}
