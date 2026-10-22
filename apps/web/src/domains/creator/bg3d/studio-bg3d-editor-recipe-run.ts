"use no memo";

/**
 * 소재 카드의 배치 방식 한 번 실행하기 — 실제 본문.
 *
 * 이 모듈은 three·배치 계획·벽 탐지를 끌어오므로 편집기 정적 그래프에 넣지 않는다. 가볍게 붙는 호스트
 * (studio-bg3d-editor-recipe-host)가 처음 눌렀을 때만 동적으로 불러온다.
 *
 * 의존성 주입: 이 모듈은 편집기 활성화 그래프에 이미 있는 모듈(편집 이력 스냅샷, 장면 변경 조정자, 첨부 한도 검사, 준비·물리
 * 판정, 기존 배치 계산 등)을 값으로 가져오지 않는다. 지연 모듈이 그런 모듈을 값으로 가져오면 번들러가 그 모듈을 활성화 본체
 * 청크에서 떼어 별도 공유 청크로 만들어 활성화 청크 수 상한을 넘긴다. 필요한 값은 가벼운 접합부가 정적으로 가져와 실행할 때
 * `deps` 인자로 넘긴다(여기서는 타입만 가져온다).
 *
 * 모든 실패·막힘은 오류 줄(역할 없음)이 아니라 상태 줄(setSurfaceSnapStatus, role=status)로 알린다. 성공과 같은 길이라
 * 화면 읽기 프로그램에도 전달된다. 문구는 해요체이고 실패에는 다음 행동이 있다(문구 가드 시험이 직접 검사한다).
 */

import {
  StudioBg3dThreeOperationError,
  createBgCustomModelInstance,
  type BgCustomModelInstance,
} from "../studio-background-3d-model";
import {
  STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE,
  STUDIO_BG3D_ASSET_PLACEMENT_RECIPES,
  isStudioBg3dAssetPlacementRecipeId,
} from "./studio-bg3d-asset-placement-catalog";
import { createStudioBg3dAssetPlacementPlanner } from "./studio-bg3d-asset-placement-recipes";
import { readStudioBg3dObjectWorldBounds } from "./studio-bg3d-camera-application";
import { isStudioBg3dEnvironmentAssetId } from "./studio-bg3d-environment-catalog";
import { probeStudioBg3dNearestWall } from "./studio-bg3d-wall-probe";

import type * as THREE from "three";
import type { StudioBg3dAssetPlacementMath, StudioBg3dPlacementBounds } from "./studio-bg3d-asset-placement-recipes";
import type { createStudioBg3dHistorySnapshot, StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import type {
  StudioBg3dModelPlacementAdmissionError,
  assertStudioBg3dModelAttachmentAdmission,
} from "./studio-bg3d-model-placement-admission";
import type {
  StudioBg3dModalSession,
  StudioBg3dStaleModalOperationError,
  studioBg3dModalOperationCoordinator,
} from "./studio-bg3d-modal-operation-coordinator";
import type { StudioBg3dPhysicsPhase, isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";
import type { StudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

/** 벽을 찾을 때 광선을 쏘는 높이의 상한(바닥 위, 미터). 모델 키의 절반과 이 값 중 작은 쪽을 쓴다. */
const WALL_PROBE_MAX_HEIGHT_METERS = 1.2;
const WALL_PROBE_MIN_HEIGHT_METERS = 0.1;

const COMMAND_ID = "bg3d.asset.place-recipe";

/**
 * 활성화 그래프의 모듈이 가진 값을 실행 때 받는다. 접합부(studio-bg3d-editor-recipe-host)가 정적으로 가져와 채운다.
 * 형식은 원래 함수·클래스의 타입을 그대로 따른다.
 */
export interface StudioBg3dRecipeRunDeps {
  readonly isSceneEditReady: typeof isStudioBg3dSceneEditReady;
  readonly isPhysicsTransientPhase: typeof isStudioBg3dPhysicsTransientPhase;
  readonly createHistorySnapshot: typeof createStudioBg3dHistorySnapshot;
  readonly modalCoordinator: typeof studioBg3dModalOperationCoordinator;
  readonly StaleModalOperationError: typeof StudioBg3dStaleModalOperationError;
  readonly PlacementAdmissionError: typeof StudioBg3dModelPlacementAdmissionError;
  readonly assertAttachmentAdmission: typeof assertStudioBg3dModelAttachmentAdmission;
  /** 장면 문서가 허용하는 모델 첨부 수의 상한. */
  readonly maxAttachments: number;
  /** 배치 계획이 쓰는 기존 계산(studio-bg3d-placement-recipe, studio-bg3d-object-ops). */
  readonly placementMath: StudioBg3dAssetPlacementMath;
}

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

/** 배치를 시작하지 못한 이유별 안내. 모두 해요체이고 다음에 무엇을 하면 되는지 담는다. */
export const STUDIO_BG3D_RECIPE_BUSY_MESSAGES = Object.freeze({
  notReady: "3D 장면을 아직 준비하고 있어요. 장면이 화면에 보이면 다시 눌러 주세요.",
  sessionChanged: "편집 화면이 바뀌어서 배치하지 않았어요. 3D 배경 편집기를 다시 열어 눌러 주세요.",
  capturing: "촬영하는 중이라 지금은 배치할 수 없어요. 촬영이 끝난 뒤에 다시 눌러 주세요.",
  restoringScene: "장면을 복원하는 중이라 지금은 배치할 수 없어요. 복원이 끝난 뒤에 다시 눌러 주세요.",
  uploadingModel: "모델을 가져오는 중이라 지금은 배치할 수 없어요. 가져오기가 끝난 뒤에 다시 눌러 주세요.",
  batchRendering: "여러 컷을 렌더링하는 중이라 지금은 배치할 수 없어요. 렌더링이 끝난 뒤에 다시 눌러 주세요.",
  quadView: "4분할 보기에서는 배치할 수 없어요. 한 화면 보기로 바꾼 뒤에 다시 눌러 주세요.",
  applyingTemplate: "템플릿을 적용하는 중이라 지금은 배치할 수 없어요. 적용이 끝난 뒤에 다시 눌러 주세요.",
  deletingModel: "모델을 지우는 중이라 지금은 배치할 수 없어요. 지우기가 끝난 뒤에 다시 눌러 주세요.",
  physicsBusy: "물리 시뮬레이션이 움직이는 중이라 지금은 배치할 수 없어요. 멈춘 뒤에 다시 눌러 주세요.",
  nodeLimit: "장면에 둘 수 있는 오브젝트 수에 닿아서 배치하지 않았어요. 필요 없는 오브젝트를 지운 뒤에 다시 눌러 주세요.",
} as const);

export const STUDIO_BG3D_RECIPE_ENVIRONMENT_UNSUPPORTED_MESSAGE =
  "이 소재에는 쓸 수 없는 배치 방식이에요. 다른 배치 방식을 골라 주세요.";
export const STUDIO_BG3D_RECIPE_ATTACHMENT_MISSING_MESSAGE =
  "배치할 3D 모델의 장면 연결 정보를 확인하지 못해서 장면을 바꾸지 않았어요. 모델을 라이브러리에서 다시 골라 주세요.";
export const STUDIO_BG3D_RECIPE_BOUNDS_UNAVAILABLE_MESSAGE =
  "3D 모델의 경계를 확인하지 못해서 배치하지 않았어요. 모델이 화면에 나타난 뒤에 다시 시도해 주세요.";
export const STUDIO_BG3D_RECIPE_VERIFY_FAILED_MESSAGE =
  "3D 모델의 원본·경계와 무결성을 확인하지 못해서 배치하지 않았어요. 모델을 다시 가져온 뒤에 다시 시도해 주세요.";

/** 배치에 성공했을 때의 안내. 실행 취소로 되돌릴 수 있다는 점을 함께 알린다. */
export function describeStudioBg3dRecipePlacedMessage(recipeLabel: string): string {
  return `${recipeLabel} 방식으로 모델을 배치했어요. 실행 취소로 되돌릴 수 있어요.`;
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

function failureMessage(failure: unknown, deps: StudioBg3dRecipeRunDeps): string {
  if (failure instanceof StudioBg3dThreeOperationError || failure instanceof deps.PlacementAdmissionError) {
    return failure.message;
  }
  if (failure instanceof RecipePlacementUnavailableError) return STUDIO_BG3D_RECIPE_BOUNDS_UNAVAILABLE_MESSAGE;
  return STUDIO_BG3D_RECIPE_VERIFY_FAILED_MESSAGE;
}

/** 지금 장면을 건드리면 안 되는 이유를 하나 고른다(없으면 null). 순서가 안내 우선순위다. */
function busyReason(h: StudioBg3dEditorRecipeHost, deps: StudioBg3dRecipeRunDeps): string | null {
  if (h.isCapturing) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.capturing;
  if (h.isRestoringScene) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.restoringScene;
  if (h.isUploadingModel) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.uploadingModel;
  if (h.isBatchRenderingShots) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.batchRendering;
  if (h.isQuadView) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.quadView;
  if (h.applyingTemplateId !== null) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.applyingTemplate;
  if (h.deletingModelId !== null) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.deletingModel;
  if (deps.isPhysicsTransientPhase(h.physicsPhaseRef.current)) return STUDIO_BG3D_RECIPE_BUSY_MESSAGES.physicsBusy;
  return null;
}

/**
 * 소재 카드에서 배치 방식 하나를 골라 한 번에 장면에 놓는다. 포인터로 위치를 정하는 기존 배치(addCustomModelToScene)와
 * 달리 미리보기 없이 한 번에 반영하며, 편집 이력에는 명령 하나로 들어가 실행 취소 한 번으로 되돌아간다.
 *
 * 계획(planStudioBg3dAssetPlacement)이 실패하면 장면·이력·선택을 아무것도 바꾸지 않고 사유만 상태 줄로 알린다.
 * 막힌 이유(바쁨·준비 안 됨 등)도 조용히 돌아서지 않고 한 줄 안내를 낸다. 장면을 바꿨으면 true.
 */
export async function placeStudioBg3dModelWithRecipe(
  h: StudioBg3dEditorRecipeHost,
  modelId: string,
  recipe: string,
  deps: StudioBg3dRecipeRunDeps,
): Promise<boolean> {
  const notify = (tone: "info" | "error" | "success", message: string): void => {
    h.setSurfaceSnapStatus({ tone, message });
  };
  const planPlacement = createStudioBg3dAssetPlacementPlanner(deps.placementMath);
  if (!deps.isSceneEditReady(h)) {
    notify("info", STUDIO_BG3D_RECIPE_BUSY_MESSAGES.notReady);
    return false;
  }
  if (typeof modelId !== "string" || modelId.length === 0 || !isStudioBg3dAssetPlacementRecipeId(recipe)) {
    notify("error", STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE);
    return false;
  }
  const recipeId = recipe;
  const definition = STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.find(({ id }) => id === recipeId);
  if (!definition || (isStudioBg3dEnvironmentAssetId(modelId) && !definition.appliesToEnvironment)) {
    notify("error", STUDIO_BG3D_RECIPE_ENVIRONMENT_UNSUPPORTED_MESSAGE);
    return false;
  }
  const session = h.modalAssetSessionRef.current;
  if (!session || !h.isModalAssetSessionCurrent(session)) {
    notify("info", STUDIO_BG3D_RECIPE_BUSY_MESSAGES.sessionChanged);
    return false;
  }
  const busy = busyReason(h, deps);
  if (busy) {
    notify("info", busy);
    return false;
  }
  if (h.placementSessionRef.current.phase === "preview") h.cancelCustomModelPlacement();
  if (!h.canAdmitSceneNodes(1)) {
    notify("error", STUDIO_BG3D_RECIPE_BUSY_MESSAGES.nodeLimit);
    return false;
  }
  h.setError(null);

  let placed = false;
  try {
    await deps.modalCoordinator.runSceneMutation(
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
        if (!h.canAdmitSceneNodes(1)) {
          notify("error", STUDIO_BG3D_RECIPE_BUSY_MESSAGES.nodeLimit);
          return;
        }
        const attachment = h.attachmentByStorageModelIdRef.current.get(modelId);
        if (!attachment) {
          notify("error", STUDIO_BG3D_RECIPE_ATTACHMENT_MISSING_MESSAGE);
          return;
        }
        deps.assertAttachmentAdmission({
          models: runtime.customModels,
          attachments: h.attachmentByStorageModelIdRef.current,
          candidateAttachments: [attachment],
          maximumAttachments: deps.maxAttachments,
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
        const plan = planPlacement({
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
          notify("error", plan.reason);
          return;
        }

        const next: BgCustomModelInstance = {
          ...seed,
          position: [plan.position[0], plan.position[1], plan.position[2]],
          rotation: [plan.rotation[0], plan.rotation[1], plan.rotation[2]],
          scale: [plan.scale[0], plan.scale[1], plan.scale[2]],
        };
        const nextCustomModels = [...runtime.customModels, next];
        const before = deps.createHistorySnapshot({
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
        notify("success", describeStudioBg3dRecipePlacedMessage(definition.label));
        h.setError(null);
        placed = true;
      },
    );
  } catch (failure) {
    if (!h.isModalAssetSessionCurrent(session) || failure instanceof deps.StaleModalOperationError) return false;
    notify("error", failureMessage(failure, deps));
    return false;
  }
  return placed;
}
