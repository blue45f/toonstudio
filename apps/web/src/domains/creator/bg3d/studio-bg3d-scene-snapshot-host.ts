"use no memo";
import { useEffect, useRef, useState } from "react";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import {
  applyOrDeferStudioBg3dHistoryCamera,
  collectStudioBg3dEffectivelyVisibleEntityIds,
  createStudioBg3dHistorySnapshot,
  type StudioBg3dCameraSettings,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-editor-runtime-bindings";
import {
  STUDIO_BG3D_SCENE_SNAPSHOT_MAX,
  appendStudioBg3dSceneSnapshot,
  createStudioBg3dSceneSnapshot,
  duplicateStudioBg3dSceneSnapshot,
  planStudioBg3dSceneSnapshotRestore,
  removeStudioBg3dSceneSnapshot,
  summarizeStudioBg3dSceneState,
  type StudioBg3dSceneSettingsSnapshot,
} from "./studio-bg3d-scene-snapshot";
import type { StudioBg3dSceneSnapshotPorts } from "./studio-bg3d-scene-snapshot-ports";
import type { StudioBg3dCanonicalDocumentMutation } from "./useStudioBg3dCanonicalDocumentState";

export interface StudioBg3dSceneSnapshotHostBag {
  readonly modalAssetSessionRef?: { readonly current: unknown };
  readonly viewportApiRef?: {
    readonly current: {
      readonly readView: () => StudioBg3dCameraSettings;
      readonly applyView: (camera: StudioBg3dCameraSettings) => boolean;
    } | null;
  };
  readonly pendingInitialCameraRef: { current: StudioBg3dCameraSettings | null };
  readonly attachmentByStorageModelIdRef: {
    readonly current: ReadonlyMap<string, StudioBg3dModelAttachment>;
  };
  readonly sceneBaseDocument: StudioBg3dSceneDocument;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly cameraLensInteractionLocked: () => boolean;
  readonly finishCameraLensGesture: () => void;
  readonly readCurrentCanonicalSceneForShot: () => StudioBg3dSceneDocument | null;
  readonly commitImmediateHistoryTransition: (
    nextPrimitives: readonly BgPrimitive[],
    nextCustomModels: readonly BgCustomModelInstance[],
    nextDocument: StudioBg3dSceneDocument,
    beforeSnapshot: unknown,
    options?: {
      readonly preserveBeforeCamera?: boolean;
      readonly commandId?: string;
      readonly label?: string;
      readonly source?: "inspector" | "menu" | "viewport" | "shortcut";
    },
  ) => void;
  readonly replaceCanonicalDocumentState?: (
    mutation: StudioBg3dCanonicalDocumentMutation,
  ) => unknown;
  readonly setPrimitives: (next: BgPrimitive[]) => void;
  readonly setCustomModels: (next: BgCustomModelInstance[]) => void;
  readonly setSceneBaseDocument: (next: StudioBg3dSceneDocument) => void;
  readonly setSelectedIds: (
    updater: (current: ReadonlySet<string>) => Set<string>,
  ) => void;
  readonly setViewportHinted: (hinted: boolean) => void;
  readonly setError: (message: string | null) => void;
}

export function useStudioBg3dSceneSnapshotPorts(
  host: StudioBg3dSceneSnapshotHostBag,
): StudioBg3dSceneSnapshotPorts {
  const [snapshots, setSnapshots] = useState<
    readonly StudioBg3dSceneSettingsSnapshot[]
  >(() => Object.freeze([]));
  const [notice, setNotice] = useState<string | null>(null);
  const activeModalSession = host.modalAssetSessionRef?.current ?? null;
  const lastSessionRef = useRef<unknown>(activeModalSession);

  useEffect(() => {
    if (lastSessionRef.current !== activeModalSession) {
      lastSessionRef.current = activeModalSession;
      setSnapshots(Object.freeze([]));
      setNotice(null);
    }
  }, [activeModalSession]);

  const liveCamera =
    host.viewportApiRef?.current?.readView() ?? host.sceneBaseDocument.camera;
  const liveSummary = summarizeStudioBg3dSceneState({
    camera: liveCamera,
    lighting: host.sceneBaseDocument.lighting,
    background: host.sceneBaseDocument.background,
    render: host.sceneBaseDocument.render,
    primitives: host.primitives,
    customModels: host.customModels,
  });
  const disabled = host.cameraLensInteractionLocked();

  return {
    liveSummary,
    snapshots: snapshots.map((entry) => ({
      id: entry.id,
      name: entry.name,
      summary: summarizeStudioBg3dSceneState(entry),
      isClone: entry.clonedFromId !== undefined,
    })),
    maxSnapshots: STUDIO_BG3D_SCENE_SNAPSHOT_MAX,
    disabled,
    notice,
    onCaptureSnapshot: () => {
      if (host.cameraLensInteractionLocked()) return;
      host.finishCameraLensGesture();
      const canonical = host.readCurrentCanonicalSceneForShot();
      if (!canonical) return;
      const captured = createStudioBg3dSceneSnapshot(
        {
          document: canonical,
          primitives: host.primitives,
          customModels: host.customModels,
        },
        { existingCount: snapshots.length },
      );
      setSnapshots((prev) => appendStudioBg3dSceneSnapshot(prev, captured));
      host.setError(null);
      setNotice(
        `"${captured.name}"에 현재 카메라·조명·가구/오브젝트 배치를 저장했습니다.`,
      );
    },
    onDuplicateSnapshot: (id: string) => {
      if (host.cameraLensInteractionLocked()) return;
      let duplicated = false;
      setSnapshots((prev) => {
        const next = duplicateStudioBg3dSceneSnapshot(prev, id);
        if (!next) return prev;
        duplicated = true;
        return next;
      });
      setNotice(
        duplicated
          ? "스냅샷 복제본을 생성했습니다. 재배치 뒤 복제본으로 안전하게 되돌릴 수 있습니다."
          : `씬 스냅샷은 최대 ${STUDIO_BG3D_SCENE_SNAPSHOT_MAX}개까지 보관할 수 있습니다.`,
      );
    },
    onRestoreSnapshot: (id: string) => {
      if (host.cameraLensInteractionLocked()) return;
      host.finishCameraLensGesture();
      const target = snapshots.find((entry) => entry.id === id);
      const beforeDocument =
        host.readCurrentCanonicalSceneForShot() ?? host.sceneBaseDocument;
      const plan = planStudioBg3dSceneSnapshotRestore({
        snapshot: target,
        currentDocument: beforeDocument,
        attachmentByStorageModelId: host.attachmentByStorageModelIdRef.current,
      });
      if (!plan.ok) {
        const reasonMessage =
          plan.reason === "missing-model-attachment"
            ? "스냅샷에 포함된 GLB 모델 자산이 삭제되어 현재 씬을 손상 없이 그대로 유지했습니다."
            : "스냅샷 데이터가 현재 장면 예산과 맞지 않아 현재 씬을 그대로 유지했습니다.";
        setNotice(reasonMessage);
        host.setError(reasonMessage);
        return;
      }
      host.commitImmediateHistoryTransition(
        plan.primitives,
        plan.customModels,
        plan.document,
        createStudioBg3dHistorySnapshot({
          primitives: [...host.primitives],
          customModels: [...host.customModels],
          document: beforeDocument,
        }),
        {
          preserveBeforeCamera: true,
          commandId: "studio.bg3d.scene-snapshot.restore",
          label: "씬 스냅샷 복원",
          source: "inspector",
        },
      );
      if (host.replaceCanonicalDocumentState) {
        host.replaceCanonicalDocumentState({
          primitives: plan.primitives,
          customModels: plan.customModels,
          document: plan.document,
        });
      } else {
        host.setPrimitives(plan.primitives);
        host.setCustomModels(plan.customModels);
        host.setSceneBaseDocument(plan.document);
      }
      applyOrDeferStudioBg3dHistoryCamera(
        host.viewportApiRef?.current ?? null,
        host.pendingInitialCameraRef,
        plan.document.camera,
      );
      const visibleIds = collectStudioBg3dEffectivelyVisibleEntityIds(
        plan.document.nodes,
      );
      host.setSelectedIds(
        (current) =>
          new Set([...current].filter((nodeId) => visibleIds.has(nodeId))),
      );
      host.setViewportHinted(true);
      host.setError(null);
      setNotice(
        `"${target?.name ?? "스냅샷"}"의 카메라·조명·가구 배치를 손상 없이 복원했습니다.`,
      );
    },
    onDeleteSnapshot: (id: string) => {
      if (host.cameraLensInteractionLocked()) return;
      setSnapshots((prev) => removeStudioBg3dSceneSnapshot(prev, id));
      setNotice("선택한 씬 스냅샷을 삭제했습니다.");
    },
  };
}
