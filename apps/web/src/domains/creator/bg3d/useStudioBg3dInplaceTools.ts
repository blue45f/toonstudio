import { useRef } from "react";
import { createScene3dInplaceController } from "../scene3d/integration/scene3d-inplace-controller";
import { Scene3dInplaceError } from "../scene3d/integration/scene3d-inplace-contract";
import type { Scene3dInplaceSelection } from "../scene3d/integration/scene3d-inplace-controller";
import type { Scene3dInplaceToolsBridge, Scene3dSelectedAssetInput } from "../scene3d/integration/scene3d-inplace-contract";
import type { StudioBg3dInplaceToolsContext } from "./studio-bg3d-inplace-tools-context";
import type { StudioBg3dModelExportProvenanceReceipt } from "./studio-bg3d-model-export-provenance";
import { getStoredBg3dModelV12 } from "./studio-bg3d-model-library-loader";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

export function readStudioBg3dInplaceSelection(
  ctx: StudioBg3dInplaceToolsContext,
): Scene3dInplaceSelection {
  const session = ctx.session;
  if (
    !ctx.ready ||
    !ctx.renderer ||
    !session ||
    !ctx.isSessionCurrent(session) ||
    ctx.isMaterialBackendCurrent?.() === false ||
    ctx.isBlocked()
  )
    throw new Scene3dInplaceError(
      "unavailable",
      "렌더링·복원·다른 변경 작업이 끝난 뒤 모델을 선택해 주세요.",
    );
  if (ctx.selectedIds.size !== 1)
    throw new Scene3dInplaceError(
      "unavailable",
      "장면에서 정적 GLB 모델 하나를 선택해 주세요.",
    );
  const id = [...ctx.selectedIds][0]!;
  const live = ctx.live.current;
  const model = live.customModels.find((value) => value.id === id);
  if (!model)
    throw new Scene3dInplaceError(
      "unsupported",
      "현재는 업로드한 정적 GLB 모델의 최적화 결과만 교체할 수 있습니다.",
    );
  const nodes = new Map(
    [...live.primitives, ...live.customModels].map((value) => [
      value.id,
      value,
    ]),
  );
  if ([...nodes.values()].some((node) => node.parentId === id))
    throw new Scene3dInplaceError(
      "unsupported",
      "자식 객체가 연결된 모델은 계층 변환 보존 검증 후 지원합니다. 현재 결과는 파일로 검토해 주세요.",
    );
  const visited = new Set<string>();
  for (
    let node:
      | { id: string; locked?: boolean; parentId?: string | null }
      | undefined = model;
    node;
    node = node.parentId ? nodes.get(node.parentId) : undefined
  ) {
    if (visited.has(node.id) || node.locked)
      throw new Scene3dInplaceError(
        "unavailable",
        "선택 모델 또는 부모가 잠겨 있습니다.",
      );
    visited.add(node.id);
  }
  const backend = resolveStudioBg3dMaterialBackend(ctx);
  const entry = readStudioBg3dModelCacheEntry(ctx.cache, model.modelId, backend);
  const attachment = ctx.attachments.get(model.modelId);
  if (
    !entry ||
    !attachment ||
    entry.record.id !== model.modelId ||
    entry.record.contentHash !== attachment.hash ||
    entry.record.byteSize !== attachment.byteSize
  )
    throw new Scene3dInplaceError(
      "unavailable",
      "모델과 원본 바이트를 먼저 불러와야 합니다.",
    );
  if (
    entry.metrics.animations ||
    entry.metrics.skins ||
    entry.metrics.morphTargets ||
    model.animation ||
    model.pose ||
    model.morph ||
    model.constraints ||
    model.materialOverride
  ) {
    throw new Scene3dInplaceError(
      "unsupported",
      "리깅·애니메이션·모프·개별 재질 수정이 없는 정적 모델만 직접 교체합니다. 다른 모델은 파일 도구로 검토해 주세요.",
    );
  }
  return {
    entityId: id,
    label: model.name ?? entry.record.name,
    sourceSha256: entry.record.contentHash,
    sourceByteLength: entry.record.byteSize,
    revisionKey: JSON.stringify([
      session.epoch,
      ctx.selectionEpoch ?? 0,
      backend,
      live.revision,
      model,
      attachment,
      entry.root.scale.toArray(),
    ]),
    // 같은 renderer/backend로 돌아와도 이전 lease의 선택은 다시 유효해지지 않는다.
    runtimeOwner: ctx.isMaterialBackendCurrent ?? ctx.renderer,
    sourceOwner: entry,
  };
}
export function createStudioBg3dInplaceToolsBridge(
  getContext: () => StudioBg3dInplaceToolsContext,
): Scene3dInplaceToolsBridge {
  const byBytes = new WeakMap<ArrayBuffer, StudioBg3dModelExportProvenanceReceipt>();
  const byInput = new WeakMap<Scene3dSelectedAssetInput, StudioBg3dModelExportProvenanceReceipt>();
  const controller = createScene3dInplaceController({
    readSelection: () => readStudioBg3dInplaceSelection(getContext()),
    readSource: async (selected, signal) => {
      const ctx = getContext();
      const backend = resolveStudioBg3dMaterialBackend(ctx);
      const renderer = ctx.renderer;
      const isMaterialBackendCurrent = ctx.isMaterialBackendCurrent;
      const assertRuntimeCurrent = () => {
        const live = getContext();
        if (isMaterialBackendCurrent?.() === false || live.renderer !== renderer ||
            resolveStudioBg3dMaterialBackend(live) !== backend ||
            (live.isMaterialBackendCurrent ?? live.renderer) !== selected.runtimeOwner) {
          throw new Scene3dInplaceError("stale", "모델 렌더링 세션이 바뀌어 원본 읽기를 중단했습니다.");
        }
      };
      assertRuntimeCurrent();
      const model = ctx.live.current.customModels.find(
        (value) => value.id === selected.entityId,
      );
      if (!model)
        throw new Scene3dInplaceError("stale", "선택 모델이 사라졌습니다.");
      const record = await getStoredBg3dModelV12(model.modelId, { signal });
      assertRuntimeCurrent();
      if (
        !record ||
        record.id !== model.modelId ||
        record.contentHash !== selected.sourceSha256 ||
        JSON.stringify(record.rights) !==
          JSON.stringify(readStudioBg3dModelCacheEntry(ctx.cache, model.modelId, backend)?.record.rights)
      )
        throw new Scene3dInplaceError("stale", "저장된 원본이 변경되었습니다.");
      const { resolveStudioBg3dModelExportProvenance } = await import("./studio-bg3d-model-export-provenance");
      assertRuntimeCurrent();
      const receipt = await resolveStudioBg3dModelExportProvenance(record, { signal, assertCurrent: assertRuntimeCurrent });
      const bytes = await record.blob.arrayBuffer();
      assertRuntimeCurrent();
      byBytes.set(bytes, receipt);
      return bytes;
    },
    prepare: async (selected, artifact, commandId, assertCurrent, signal) => {
      const { prepareStudioBg3dInplaceDerivative } = await import(
        "./studio-bg3d-inplace-storage"
      );
      assertCurrent();
      return prepareStudioBg3dInplaceDerivative(
        getContext,
        selected,
        artifact,
        commandId,
        assertCurrent,
        signal,
      );
    },
  });
  return {
    describeSelection: () => controller.describeSelection(),
    async captureSelection(signal) {
      const input = await controller.captureSelection(signal);
      const receipt = byBytes.get(input.source);
      if (!receipt) throw new Scene3dInplaceError("unavailable", "선택 원본의 출처 확인을 완료하지 못했습니다.");
      byInput.set(input, receipt); byBytes.delete(input.source);
      return input;
    },
    apply: (input, result, artifact, signal) => controller.apply(input, result, artifact, signal),
    async assertSourceFileExportAllowed(input, signal) {
      const receipt = byInput.get(input);
      if (!receipt) throw new Scene3dInplaceError("unavailable", "확인한 선택 원본에서만 파일을 저장할 수 있습니다.");
      const aborted = () => {
        if (signal?.aborted) throw new Scene3dInplaceError("cancelled", "모델 파일 저장을 취소했습니다.");
      };
      aborted();
      const { assertStudioBg3dModelExportReceiptCurrent, assertStudioBg3dModelFileExportAllowed } =
        await import("./studio-bg3d-model-export-provenance");
      aborted();
      await assertStudioBg3dModelExportReceiptCurrent(receipt);
      aborted();
      assertStudioBg3dModelFileExportAllowed(receipt);
    },
  };
}
/** Ref indirection preserves current history, renderer, locks and selection across React renders. */
export function useStudioBg3dInplaceTools(
  context: StudioBg3dInplaceToolsContext,
): Scene3dInplaceToolsBridge {
  const selection = [...context.selectedIds].sort().join("\u0000");
  const selectionFence = useRef({ key: selection, epoch: 0 });
  if (selectionFence.current.key !== selection)
    selectionFence.current = {
      key: selection,
      epoch: selectionFence.current.epoch + 1,
    };
  const latest = useRef(context);
  latest.current = { ...context, selectionEpoch: selectionFence.current.epoch };
  const bridge = useRef<Scene3dInplaceToolsBridge | null>(null);
  bridge.current ??= createStudioBg3dInplaceToolsBridge(() => latest.current);
  return bridge.current;
}
