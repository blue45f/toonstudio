import type { StudioBg3dSkpSceneSource, StudioBg3dSkpSceneSourceParseResult } from "./studio-bg3d-skp-scene-source";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

export interface StudioBg3dSkpSourceSelection {
  readonly scopeKey: string | null;
  readonly modelName: string;
  readonly blockedReason: string | null;
}

export type StudioBg3dSkpSourceReadResult =
  | { readonly ok: true; readonly value: StudioBg3dSkpSceneSource }
  | { readonly ok: false; readonly code: "selection-unavailable" | "selection-changed" | "model-loading" | "invalid-source" | "budget-exceeded" | "read-failed"; readonly messageKo: string };

export type StudioBg3dReadSkpSceneSource = () => Promise<StudioBg3dSkpSourceReadResult>;

interface LoadedRoot {
  readonly userData: unknown;
  readonly children: readonly LoadedRoot[];
}

/** 문서 변경 명령 없이 실제 선택·공식 런타임 참조·로드된 자산의 출처만 읽는다. */
export interface StudioBg3dSkpSourceReadHost {
  readonly open?: boolean;
  readonly modelRenderer?: unknown;
  readonly materialBackend?: StudioBg3dMaterialBackend;
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly selectedIds?: ReadonlySet<string>;
  /** 실제 편집기의 가변 선택 참조를 우선해 오래된 렌더의 selectedIds를 읽지 않는다. */
  readonly selectedIdsRef?: { readonly current: ReadonlySet<string> };
  readonly physicsRuntimeSourceRef?: { readonly current: {
    readonly customModels: readonly { readonly id: string; readonly modelId: string; readonly name?: string }[];
    readonly primitives?: readonly { readonly id: string }[];
  } };
  readonly modelRootCacheRef?: { readonly current: ReadonlyMap<string, { readonly root: LoadedRoot; readonly runtimeVariant: string; readonly record: { readonly id: string } }> };
}

interface ReaderModule {
  readStudioBg3dSkpSceneSource(root: LoadedRoot | undefined): StudioBg3dSkpSceneSourceParseResult;
}

interface ReadOptions {
  /** 시험에서도 실제 reader를 사용하되 모듈 준비 시점을 제어할 수 있다. 제품의 기본 경로는 클릭 시 import다. */
  readonly loadReader?: () => Promise<ReaderModule>;
}

type FailureCode = Extract<StudioBg3dSkpSourceReadResult, { readonly ok: false }>["code"];
interface SelectionTarget { readonly scopeKey: string; readonly modelName: string; readonly storageId: string }

function failure(code: FailureCode, messageKo: string): StudioBg3dSkpSourceReadResult { return { ok: false, code, messageKo }; }

function resolveTarget(host: StudioBg3dSkpSourceReadHost): SelectionTarget | null {
  const ids = host.selectedIdsRef?.current ?? host.selectedIds;
  const source = host.physicsRuntimeSourceRef?.current;
  if (host.open !== true || !source || !ids || ids.size !== 1) return null;
  const selectedId = ids.values().next().value;
  if (typeof selectedId !== "string" || selectedId.length === 0) return null;
  const matches = source.customModels.filter(({ id }) => id === selectedId);
  const model = matches[0];
  if (matches.length !== 1 || !model || typeof model.modelId !== "string" || model.modelId.length === 0
    || source.primitives?.some(({ id }) => id === selectedId)) return null;
  return { scopeKey: JSON.stringify([model.id, model.modelId]), storageId: model.modelId,
    modelName: typeof model.name === "string" && model.name.trim() ? model.name : "선택한 3D 모델" };
}

/** 선택이 유효해도 자산 캐시가 준비되지 않았으면 현재 로딩 상태를 표시한다. 잠금은 읽기를 막지 않는다. */
export function inspectStudioBg3dSkpSourceSelection(host: StudioBg3dSkpSourceReadHost): StudioBg3dSkpSourceSelection {
  try {
    const target = resolveTarget(host);
    if (!target) return { scopeKey: null, modelName: "", blockedReason: "원본 정보를 볼 3D 모델을 하나만 선택하세요." };
    return { scopeKey: target.scopeKey, modelName: target.modelName,
      blockedReason: host.isMaterialBackendCurrent?.() !== false && host.modelRootCacheRef
        && readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, target.storageId, resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }))?.root ? null : "모델을 불러오는 중입니다. 준비된 뒤 다시 확인하세요." };
  } catch {
    return { scopeKey: null, modelName: "", blockedReason: "현재 모델 정보를 읽지 못했습니다. 다시 확인하세요." };
  }
}

/** 지연 로딩 전후 최신 instance/storage 선택을 확인한다. 문서·기록·선택에는 쓰지 않는다. */
export function createStudioBg3dSkpSourceReaderFromHost(host: StudioBg3dSkpSourceReadHost, options: ReadOptions = {}): StudioBg3dReadSkpSceneSource {
  return async () => {
    let initial: SelectionTarget | null = null;
    const renderer = host.modelRenderer, isMaterialBackendCurrent = host.isMaterialBackendCurrent;
    let backend: StudioBg3dMaterialBackend;
    const sameSelection = () => {
      try { return isMaterialBackendCurrent?.() !== false && host.modelRenderer === renderer && resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) === backend
        && initial !== null && resolveTarget(host)?.scopeKey === initial.scopeKey; } catch { return false; }
    };
    try {
      backend = resolveStudioBg3dMaterialBackend({ renderer, materialBackend: host.materialBackend });
      initial = resolveTarget(host);
      if (!initial) return failure("selection-unavailable", "원본 정보를 볼 3D 모델을 하나만 선택하세요.");
      const initialEntry = host.modelRootCacheRef ? readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, initial.storageId, backend) : undefined;
      if (isMaterialBackendCurrent?.() === false || !initialEntry?.root) return failure("model-loading", "모델을 불러오는 중입니다. 준비된 뒤 다시 확인하세요.");
      const reader = await (options.loadReader?.() ?? import("./studio-bg3d-skp-scene-provenance"));
      if (!sameSelection()) return failure("selection-changed", "모델 선택이 바뀌었습니다. 현재 모델의 원본 정보를 다시 확인하세요.");
      const currentEntry = host.modelRootCacheRef ? readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, initial.storageId, backend) : undefined;
      const root = currentEntry?.root;
      if (!root) return failure("model-loading", "모델을 불러오는 중입니다. 준비된 뒤 다시 확인하세요.");
      const result = reader.readStudioBg3dSkpSceneSource(root);
      if (!sameSelection()) return failure("selection-changed", "모델 선택이 바뀌었습니다. 현재 모델의 원본 정보를 다시 확인하세요.");
      if (!result.ok) return result.code === "budget-exceeded"
        ? failure("budget-exceeded", "원본 장면 정보가 읽기 한도를 넘었습니다. 이 모델의 정보를 안전하게 표시할 수 없습니다.")
        : failure("invalid-source", "저장된 원본 장면 정보가 올바르지 않습니다. 모델을 다시 가져와 확인하세요.");
      // legacy/unavailable도 reader의 상태를 그대로 전달한다. 새 available 상태를 추정하지 않는다.
      return result;
    } catch {
      return initial === null || sameSelection()
        ? failure("read-failed", "원본 장면 정보를 읽지 못했습니다. 다시 확인하세요.")
        : failure("selection-changed", "모델 선택이 바뀌었습니다. 현재 모델의 원본 정보를 다시 확인하세요.");
    }
  };
}
