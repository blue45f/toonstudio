import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createStudioBg3dHistorySnapshot, type StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import type { StudioBg3dCameraSettings, StudioBg3dModelAttachment, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { orderStudioBg3dHierarchySelectionRootsFirst } from "./studio-bg3d-template-instance";
import type { StudioBg3dAddGeneratedParts } from "./studio-bg3d-workbench-insertion";

interface GeneratedPartsRuntime {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

interface GeneratedPartsPorts {
  readonly readRuntime: () => GeneratedPartsRuntime;
  readonly readView: () => StudioBg3dCameraSettings;
  readonly canAdmitSceneNodes: (count: number) => boolean;
  readonly replace: (mutation: { readonly primitives: readonly BgPrimitive[] }) => unknown;
  readonly select: (ids: Set<string>) => void;
  readonly readAttachments?: () => ReadonlyMap<string, StudioBg3dModelAttachment>;
  readonly onPersistenceRejected?: () => void;
  readonly commitHistory: (
    primitives: readonly BgPrimitive[],
    customModels: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before: StudioBg3dHistorySnapshot,
    options: { readonly commandId: string; readonly label: string; readonly source: "menu" },
  ) => void;
}

/** 생성 묶음을 한 번에 커밋하고, 명시한 명령만 즉시 Undo 경계로 기록한다. */
export function createStudioBg3dGeneratedPartsCommand(ports: GeneratedPartsPorts): StudioBg3dAddGeneratedParts {
  return (buildParts, options = {}) => {
    const live = ports.readRuntime();
    const parts = buildParts(live.primitives.length, ports.readView());
    if (parts.length === 0 || !ports.canAdmitSceneNodes(parts.length)) return false;
    const nextPrimitives = [...live.primitives, ...parts];
    if (options.immediateHistory) {
      // 최종 UUID와 기존 외부 모델까지 포함해 저장할 수 있는지 확인한 뒤에만 history를 바꾼다.
      const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
        primitives: nextPrimitives, customModels: live.customModels, baseDocument: live.document,
        attachmentByStorageModelId: ports.readAttachments?.() ?? new Map(),
      });
      if (!adaptation.ok || adaptation.value.counts.droppedPrimitives > 0 || adaptation.value.counts.droppedCustomModels > 0
        || adaptation.value.counts.emittedPrimitives !== nextPrimitives.length
        || adaptation.value.counts.emittedCustomModels !== live.customModels.length) {
        ports.onPersistenceRejected?.();
        return false;
      }
      ports.commitHistory(nextPrimitives, live.customModels, live.document, createStudioBg3dHistorySnapshot(live), {
        commandId: "studio.bg3d.workbench.insert",
        label: options.labelKo ?? "배경 도형 배치",
        source: "menu",
      });
    }
    ports.replace({ primitives: nextPrimitives });
    ports.select(new Set(options.selectAll
      ? orderStudioBg3dHierarchySelectionRootsFirst(parts)
      : parts.slice(0, 1).map(({ id }) => id)));
    return parts;
  };
}
