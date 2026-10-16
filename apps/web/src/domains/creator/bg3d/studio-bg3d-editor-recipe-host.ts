"use no memo";

import {
  StudioBg3dThreeOperationError,
  createBgCustomModelInstance,
  type BgCustomModelInstance,
} from "../studio-background-3d-model";
import { readStudioBg3dObjectWorldBounds } from "./studio-bg3d-camera-application";
import { createStudioBg3dHistorySnapshot, type StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { isStudioBg3dEnvironmentAssetId } from "./studio-bg3d-environment-catalog";
import {
  StudioBg3dModelPlacementAdmissionError,
  assertStudioBg3dModelAttachmentAdmission,
} from "./studio-bg3d-model-placement-admission";
import {
  StudioBg3dStaleModalOperationError,
  studioBg3dModalOperationCoordinator,
  type StudioBg3dModalSession,
} from "./studio-bg3d-modal-operation-coordinator";
import { isStudioBg3dPhysicsTransientPhase, type StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS } from "./studio-bg3d-scene-document-types";
import { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";
import { probeStudioBg3dNearestWall } from "./studio-bg3d-wall-probe";
import {
  STUDIO_BG3D_ASSET_PLACEMENT_RECIPES,
  isStudioBg3dAssetPlacementRecipeId,
  planStudioBg3dAssetPlacement,
  type StudioBg3dPlacementBounds,
} from "./studio-bg3d-asset-placement-recipes";

import type * as THREE from "three";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

/** 벽을 찾을 때 광선을 쏘는 높이의 상한(바닥 위, 미터). 모델 키의 절반과 이 값 중 작은 쪽을 쓴다. */
const WALL_PROBE_MAX_HEIGHT_METERS = 1.2;
const WALL_PROBE_MIN_HEIGHT_METERS = 0.1;

const COMMAND_ID = "bg3d.asset.place-recipe";

/** 편집기가 들고 있는 상태 중 이 호스트가 읽는 것만 적는다. 모듈 의존은 호스트 백에 두지 않는다. */
export interface StudioBg3dEditorRecipeHost {
  readonly open: boolean;
  readonly modelRenderer: unknown;
  readonly isRestoringScene: boolean;
  readonly isCapturing: boolean;
  readonly isUploadingModel: boolean;
  readonly isBatchRenderingShots: boolean;
  readonly isQuadView: boolean;
  readonly applyingTemplateId: string | null;
  readonly deletingModelId: string | null;
  readonly physicsPhaseRef: { readonly current: StudioBg3dPhysicsPhase };
  readonly physicsRuntimeSourceRef: StudioBg3dCanonicalDocumentState["liveSceneRef"];
  readonly modalAssetSessionRef: { readonly current: StudioBg3dModalSession | null };
  readonly placementSessionRef: { readonly current: { readonly phase: string } };
  readonly modelRootCacheRef: { readonly current: ReadonlyMap<string, { readonly root: THREE.Object3D }> };
  readonly primitiveObjectsRef: { readonly current: ReadonlyMap<string, THREE.Object3D> };
  readonly attachmentByStorageModelIdRef: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
  readonly viewportApiRef: {
    readonly current: { readonly readView: () => { readonly target: readonly [number, number, number] } } | null;
  };
  readonly isModalAssetSessionCurrent: (session: StudioBg3dModalSession) => boolean;
  readonly canAdmitSceneNodes: (additionalNodeCount: number) => boolean;
  readonly cancelCustomModelPlacement: (message?: string) => void;
  readonly ensureModelRootCached: (
    modelId: string,
    session: StudioBg3dModalSession,
    isOperationCurrent: () => boolean,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly commitImmediateHistoryTransition: (
    primitives: StudioBg3dCanonicalDocumentState["primitives"],
    customModels: readonly BgCustomModelInstance[],
    document: StudioBg3dCanonicalDocumentState["sceneBaseDocument"],
    before?: StudioBg3dHistorySnapshot,
    options?: { readonly commandId?: string; readonly label?: string; readonly source?: "menu" },
  ) => void;
  readonly replaceCanonicalDocumentState: StudioBg3dCanonicalDocumentState["replaceCanonicalDocumentState"];
  readonly setError: (error: string | null) => void;
  readonly setSelectedIds: (ids: Set<string>) => void;
  readonly setRefTick: (update: (revision: number) => number) => void;
  readonly setSurfaceSnapStatus: (status: { readonly tone: "info" | "error" | "success"; readonly message: string }) => void;
  /** 카드의 "배치 방식"이 부른다. 장면을 바꿨으면 true, 바꾸지 않았으면 false. */
  placeCustomModelWithRecipe: (modelId: string, recipe: string) => Promise<boolean>;
}

class RecipePlacementUnavailableError extends Error {
  constructor(readonly code: "model-unavailable" | "model-bounds-unavailable") {
    super(code);
    this.name = "RecipePlacementUnavailableError";
  }
}

function unionWorldBounds(objects: Iterable<THREE.Object3D>): StudioBg3dPlacementBounds | null {
  let min: [number, number, number] | null = null;
  let max: [number, number, number] | null = null;
  for (const object of objects) {
    const bounds = readStudioBg3dObjectWorldBounds(object, { visibleOnly: true });
    if (!bounds) continue;
    min = min
      ? [Math.min(min[0], bounds.min[0]), Math.min(min[1], bounds.min[1]), Math.min(min[2], bounds.min[2])]
      : [...bounds.min];
    max = max
      ? [Math.max(max[0], bounds.max[0]), Math.max(max[1], bounds.max[1]), Math.max(max[2], bounds.max[2])]
      : [...bounds.max];
  }
  return min && max ? { min, max } : null;
}

function failureMessage(failure: unknown): string {
  if (failure instanceof StudioBg3dThreeOperationError || failure instanceof StudioBg3dModelPlacementAdmissionError) {
    return failure.message;
  }
  if (failure instanceof RecipePlacementUnavailableError) {
    return "3D 모델의 경계를 확인하지 못해 배치하지 않았습니다. 모델이 화면에 나타난 뒤 다시 시도해 주세요.";
  }
  return "3D 모델의 원본·경계와 무결성을 확인하지 못해 배치하지 않았습니다.";
}

/**
 * 소재 카드에서 배치 방식 하나를 골라 한 번에 장면에 놓는다. 포인터로 위치를 정하는 기존 배치(addCustomModelToScene)와
 * 달리 미리보기 없이 한 번에 반영하며, 편집 이력에는 명령 하나로 들어가 실행 취소 한 번으로 되돌아간다.
 *
 * 계획(planStudioBg3dAssetPlacement)이 실패하면 장면·이력·선택을 아무것도 바꾸지 않고 사유만 알린다.
 */
export function attachStudioBg3dEditorRecipeHost(h: StudioBg3dEditorRecipeHost): void {
  h.placeCustomModelWithRecipe = async (modelId: string, recipe: string): Promise<boolean> => {
    if (!isStudioBg3dSceneEditReady(h)) return false;
    if (typeof modelId !== "string" || modelId.length === 0 || !isStudioBg3dAssetPlacementRecipeId(recipe)) {
      h.setError("배치 방식이 올바르지 않습니다. 목록에서 배치 방식을 다시 골라 주세요.");
      return false;
    }
    const recipeId = recipe;
    const definition = STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.find(({ id }) => id === recipeId);
    if (!definition || (isStudioBg3dEnvironmentAssetId(modelId) && !definition.appliesToEnvironment)) {
      h.setError("이 소재에는 쓸 수 없는 배치 방식입니다. 다른 배치 방식을 골라 주세요.");
      return false;
    }
    const session = h.modalAssetSessionRef.current;
    if (!session || !h.isModalAssetSessionCurrent(session)) return false;
    if (
      h.isCapturing || h.isRestoringScene || h.isUploadingModel || h.isBatchRenderingShots || h.isQuadView ||
      h.applyingTemplateId !== null || h.deletingModelId !== null ||
      isStudioBg3dPhysicsTransientPhase(h.physicsPhaseRef.current)
    ) return false;
    if (h.placementSessionRef.current.phase === "preview") h.cancelCustomModelPlacement();
    if (!h.canAdmitSceneNodes(1)) return false;
    h.setError(null);

    let placed = false;
    try {
      await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async (lease) => {
          lease.throwIfRevoked();
          const record = await h.ensureModelRootCached(modelId, session, lease.isCurrent, lease.signal);
          lease.throwIfRevoked();
          const root = h.modelRootCacheRef.current.get(modelId)?.root;
          if (!record || !root) throw new RecipePlacementUnavailableError("model-unavailable");
          root.updateWorldMatrix(true, true);
          const bounds = readStudioBg3dObjectWorldBounds(root);
          if (!bounds) throw new RecipePlacementUnavailableError("model-bounds-unavailable");
          return { localBounds: { min: bounds.min, max: bounds.max } satisfies StudioBg3dPlacementBounds };
        },
        ({ localBounds }) => {
          // 장면 변경은 직렬로 실행되므로 이 시점의 라이브 장면이 곧 반영 대상이다.
          const runtime = h.physicsRuntimeSourceRef.current;
          if (!h.canAdmitSceneNodes(1)) return;
          const attachment = h.attachmentByStorageModelIdRef.current.get(modelId);
          if (!attachment) {
            h.setError("배치할 3D 모델의 장면 연결 정보를 확인할 수 없어 장면을 변경하지 않았습니다.");
            return;
          }
          assertStudioBg3dModelAttachmentAdmission({
            models: runtime.customModels,
            attachments: h.attachmentByStorageModelIdRef.current,
            candidateAttachments: [attachment],
            maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
            maximumCumulativeBytes: runtime.document.budgets.complexity.maxModelBytes,
          });

          const target = h.viewportApiRef.current?.readView().target;
          const dropPoint: readonly [number, number] = target && Number.isFinite(target[0]) && Number.isFinite(target[2])
            ? [target[0], target[2]]
            : [0, 0];
          const sceneObjects = [...h.primitiveObjectsRef.current.values()];
          const groundY = 0;
          const wall = recipeId === "wall"
            ? probeStudioBg3dNearestWall(sceneObjects, [
              dropPoint[0],
              groundY + Math.min(
                WALL_PROBE_MAX_HEIGHT_METERS,
                Math.max(WALL_PROBE_MIN_HEIGHT_METERS, (localBounds.max[1] - localBounds.min[1]) / 2),
              ),
              dropPoint[1],
            ])
            : null;

          const seed = createBgCustomModelInstance(modelId, runtime.customModels.length);
          const plan = planStudioBg3dAssetPlacement({
            recipe: recipeId,
            localBounds,
            seed: { position: seed.position, rotation: seed.rotation, scale: seed.scale },
            dropPoint,
            groundY,
            sceneBounds: recipeId === "scene-center" ? unionWorldBounds(sceneObjects) : null,
            wall,
          });
          if (!plan.ok) {
            // 장면·이력·선택을 건드리지 않고 사유만 알린다.
            h.setError(plan.reason);
            return;
          }

          const next: BgCustomModelInstance = {
            ...seed,
            position: [plan.position[0], plan.position[1], plan.position[2]],
            rotation: [plan.rotation[0], plan.rotation[1], plan.rotation[2]],
            scale: [plan.scale[0], plan.scale[1], plan.scale[2]],
          };
          const nextCustomModels = [...runtime.customModels, next];
          const before = createStudioBg3dHistorySnapshot({
            primitives: runtime.primitives,
            customModels: runtime.customModels,
            document: runtime.document,
          });
          h.commitImmediateHistoryTransition(runtime.primitives, nextCustomModels, runtime.document, before, {
            commandId: COMMAND_ID,
            label: `Place asset (${recipeId})`,
            source: "menu",
          });
          h.replaceCanonicalDocumentState({ customModels: nextCustomModels });
          h.setSelectedIds(new Set([next.id]));
          h.setRefTick((revision) => revision + 1);
          h.setSurfaceSnapStatus({
            tone: "success",
            message: `${definition.label} 방식으로 모델을 배치했습니다. 실행 취소로 되돌릴 수 있습니다.`,
          });
          h.setError(null);
          placed = true;
        },
      );
    } catch (failure) {
      if (!h.isModalAssetSessionCurrent(session) || failure instanceof StudioBg3dStaleModalOperationError) return false;
      h.setError(failureMessage(failure));
      return false;
    }
    return placed;
  };
}
