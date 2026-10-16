import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { commitStudioBg3dHistoryTransition, stepStudioBg3dCommandHistory } from "./studio-bg3d-history-command-adapter";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { attachStudioBg3dEditorRecipeHost, type StudioBg3dEditorRecipeHost } from "./studio-bg3d-editor-recipe-host";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";

// 번들 환경 판정은 카탈로그(정적 자산 매니페스트)에 기대므로, 호스트 시험은 같은 규칙의 가짜로 대체한다.
vi.mock("./studio-bg3d-environment-catalog", () => ({
  isStudioBg3dEnvironmentAssetId: (id: string) => id.startsWith("ts-bg3d-"),
}));

const MATERIAL = new THREE.MeshBasicMaterial();
const HASH = `sha256:${"a".repeat(64)}` as const;
const ATTACHMENT = {
  id: "attachment-1",
  name: "모델.glb",
  mime: "model/gltf-binary",
  byteSize: 1_024,
  hash: HASH,
  rights: { status: "unknown", commercialUse: false, attributionRequired: false },
  source: "local-library",
} as unknown as StudioBg3dModelAttachment;

/** 피벗이 한쪽 모서리에 있는 1×2×1 모델: 로컬 경계는 (0,0,0)~(1,2,1). */
function cornerPivotModel(): THREE.Group {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), MATERIAL);
  mesh.position.set(0.5, 1, 0.5);
  root.add(mesh);
  return root;
}

function worldBoundsOf(model: BgCustomModelInstance, min = [0, 0, 0], max = [1, 2, 1]) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const rotated = rotateVectorEulerXyz([x * model.scale[0], y * model.scale[1], z * model.scale[2]], model.rotation);
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], rotated[axis] + model.position[axis]);
      high[axis] = Math.max(high[axis], rotated[axis] + model.position[axis]);
    }
  }
  return { min: low, max: high, center: low.map((value, axis) => (value + high[axis]) / 2) };
}

interface HostOptions {
  readonly root?: THREE.Object3D;
  readonly modelId?: string;
  readonly sceneObjects?: Map<string, THREE.Object3D>;
  readonly patch?: Partial<StudioBg3dEditorRecipeHost>;
}

function createHost(options: HostOptions = {}) {
  const modelId = options.modelId ?? "model-1";
  const session = studioBg3dModalOperationCoordinator.beginSession();
  const document = createDefaultStudioBg3dSceneDocument();
  const live = { revision: 0, primitives: [] as never[], customModels: [] as BgCustomModelInstance[], document };
  const refs = {
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  };
  const calls = { commit: vi.fn(), replace: vi.fn(), setError: vi.fn(), setSelectedIds: vi.fn(), setRefTick: vi.fn(), status: vi.fn() };
  const host = {
    open: true,
    modelRenderer: {},
    isRestoringScene: false,
    isCapturing: false,
    isUploadingModel: false,
    isBatchRenderingShots: false,
    isQuadView: false,
    applyingTemplateId: null,
    deletingModelId: null,
    physicsPhaseRef: { current: "idle" },
    physicsRuntimeSourceRef: { current: live },
    modalAssetSessionRef: { current: session },
    placementSessionRef: { current: { phase: "idle" } },
    modelRootCacheRef: { current: new Map([[modelId, { root: options.root ?? cornerPivotModel() }]]) },
    primitiveObjectsRef: { current: options.sceneObjects ?? new Map<string, THREE.Object3D>() },
    attachmentByStorageModelIdRef: { current: new Map([[modelId, ATTACHMENT]]) },
    viewportApiRef: { current: { readView: () => ({ target: [2, 0.6, 3] as const }) } },
    isModalAssetSessionCurrent: (candidate) => studioBg3dModalOperationCoordinator.isCurrent(candidate),
    canAdmitSceneNodes: vi.fn(() => true),
    cancelCustomModelPlacement: vi.fn(),
    ensureModelRootCached: vi.fn(async () => ({ id: modelId })),
    commitImmediateHistoryTransition: (primitives, customModels, nextDocument, before, commandOptions) => {
      calls.commit(primitives, customModels, nextDocument, before, commandOptions);
      commitStudioBg3dHistoryTransition(refs, {
        before: before ?? createStudioBg3dHistorySnapshot(live),
        after: createStudioBg3dHistorySnapshot({ primitives, customModels, document: nextDocument }),
        commandId: commandOptions?.commandId,
        label: commandOptions?.label,
        source: commandOptions?.source,
      });
    },
    replaceCanonicalDocumentState: (mutation) => {
      calls.replace(mutation);
      Object.assign(live, mutation, { revision: live.revision + 1 });
      return live as never;
    },
    setError: calls.setError,
    setSelectedIds: calls.setSelectedIds,
    setRefTick: calls.setRefTick,
    setSurfaceSnapStatus: calls.status,
    placeCustomModelWithRecipe: undefined as never,
    ...options.patch,
  } as StudioBg3dEditorRecipeHost;
  attachStudioBg3dEditorRecipeHost(host);
  return { host, live, refs, calls, session, modelId };
}

afterEach(() => vi.restoreAllMocks());

describe("attachStudioBg3dEditorRecipeHost — 성공 경로", () => {
  it("바닥에 놓기: 피벗이 모서리인 모델도 경계 아래면이 바닥에, 경계 중심이 카메라 대상 X/Z 에 놓이고 선택된다", async () => {
    const { host, live, calls, modelId } = createHost();
    await expect(host.placeCustomModelWithRecipe(modelId, "floor")).resolves.toBe(true);

    expect(live.customModels).toHaveLength(1);
    const [placed] = live.customModels;
    expect(placed.modelId).toBe(modelId);
    const bounds = worldBoundsOf(placed);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
    expect(bounds.center[0]).toBeCloseTo(2, 9);
    expect(bounds.center[2]).toBeCloseTo(3, 9);
    expect(calls.setSelectedIds).toHaveBeenCalledWith(new Set([placed.id]));
    expect(calls.setRefTick).toHaveBeenCalledOnce();
    expect(calls.status).toHaveBeenCalledWith(expect.objectContaining({ tone: "success", message: expect.stringContaining("바닥에 놓기") }));
    expect(calls.setError).toHaveBeenLastCalledWith(null);
    expect(host.ensureModelRootCached).toHaveBeenCalledOnce();
  });

  it("기존 편집 이력에 명령 하나로 들어가 실행 취소 한 번으로 되돌아가고 다시 실행할 수 있다", async () => {
    const { host, live, refs, calls, modelId } = createHost();
    await host.placeCustomModelWithRecipe(modelId, "floor");

    expect(calls.commit).toHaveBeenCalledOnce();
    const [, committedModels, , before, options] = calls.commit.mock.calls[0] as [unknown, BgCustomModelInstance[], unknown, { customModels: unknown[] }, Record<string, unknown>];
    expect(committedModels).toHaveLength(1);
    expect(before.customModels).toEqual([]);
    expect(options).toMatchObject({ commandId: "bg3d.asset.place-recipe", source: "menu" });

    const undo = stepStudioBg3dCommandHistory(refs, "undo");
    expect(undo?.status).toBe("applied");
    expect(undo?.state.customModels).toEqual([]);
    live.customModels = [...(undo?.state.customModels ?? [])];
    expect(live.customModels).toHaveLength(0);

    const redo = stepStudioBg3dCommandHistory(refs, "redo");
    expect(redo?.state.customModels).toHaveLength(1);
    expect(stepStudioBg3dCommandHistory(refs, "undo")?.status).toBe("applied");
    expect(stepStudioBg3dCommandHistory(refs, "undo")?.status).toBe("empty");
  });

  it("사람 키에 맞춤: 높이를 1.7m 로 맞춰 바닥에 놓는다", async () => {
    const { host, live, modelId } = createHost();
    await host.placeCustomModelWithRecipe(modelId, "human-scale");
    const bounds = worldBoundsOf(live.customModels[0]);
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(1.7, 9);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
  });

  it("장면 중앙 정렬: 기존 오브젝트가 모인 장면의 가운데에 놓는다", async () => {
    const left = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), MATERIAL);
    left.position.set(-6, 1, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), MATERIAL);
    right.position.set(2, 1, 8);
    const { host, live, modelId } = createHost({ sceneObjects: new Map([["a", left], ["b", right]]) });
    await host.placeCustomModelWithRecipe(modelId, "scene-center");
    const bounds = worldBoundsOf(live.customModels[0]);
    expect(bounds.center[0]).toBeCloseTo(-2, 5);
    expect(bounds.center[2]).toBeCloseTo(4, 5);
  });

  it("벽에 붙이기: 가까운 벽을 찾아 뒷면을 붙이고 정면을 방 안쪽으로 돌린다", async () => {
    const back = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 0.2), MATERIAL);
    back.position.set(0, 1.5, -5);
    const { host, live, modelId } = createHost({ sceneObjects: new Map([["wall", back]]) });
    await expect(host.placeCustomModelWithRecipe(modelId, "wall")).resolves.toBe(true);
    const placed = live.customModels[0];
    const bounds = worldBoundsOf(placed);
    expect(bounds.min[2]).toBeCloseTo(-4.9 + 0.005, 4);
    const front = rotateVectorEulerXyz([0, 0, 1], placed.rotation);
    expect(front[2]).toBeCloseTo(1, 9);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
  });
});

describe("attachStudioBg3dEditorRecipeHost — 실패해도 장면을 망가뜨리지 않는다", () => {
  function expectUntouched(context: ReturnType<typeof createHost>, message?: RegExp) {
    expect(context.live.customModels).toEqual([]);
    expect(context.calls.commit).not.toHaveBeenCalled();
    expect(context.calls.replace).not.toHaveBeenCalled();
    expect(context.calls.setSelectedIds).not.toHaveBeenCalled();
    expect(context.calls.setRefTick).not.toHaveBeenCalled();
    expect(context.refs.historyCommandTimelineRef.current).toBeNull();
    if (message) expect(context.calls.setError).toHaveBeenLastCalledWith(expect.stringMatching(message));
  }

  it("경계가 비어 있는 모델(크기 0)은 배치하지 않고 이유를 알린다", async () => {
    const context = createHost({ root: new THREE.Group() });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context, /경계를 확인하지 못해/u);
  });

  it("좌표가 NaN 인 모델은 배치하지 않는다", async () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, MATERIAL));
    const context = createHost({ root });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "human-scale")).resolves.toBe(false);
    expectUntouched(context, /경계를 확인하지 못해/u);
  });

  it("높이가 0인 납작한 모델은 계획 단계에서 거부한다", async () => {
    const root = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), MATERIAL);
    root.add(plane);
    const context = createHost({ root });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context, /크기가 0/u);
  });

  it("붙일 벽이 없으면 벽에 붙이기를 거부한다", async () => {
    const context = createHost();
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "wall")).resolves.toBe(false);
    expectUntouched(context, /벽을 찾지 못/u);
  });

  it("번들 환경에는 크기를 바꾸거나 벽에 붙이는 방식을 쓰지 않고 모델 준비도 시작하지 않는다", async () => {
    const context = createHost({ modelId: "ts-bg3d-classroom-v1" });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "wall")).resolves.toBe(false);
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "human-scale")).resolves.toBe(false);
    expectUntouched(context, /쓸 수 없는 배치 방식/u);
    expect(context.host.ensureModelRootCached).not.toHaveBeenCalled();
  });

  it("번들 환경도 바닥에 놓기·장면 중앙은 쓸 수 있다", async () => {
    const context = createHost({ modelId: "ts-bg3d-classroom-v1" });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(true);
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "scene-center")).resolves.toBe(true);
    expect(context.live.customModels).toHaveLength(2);
  });

  it("알 수 없는 배치 방식 이름은 받지 않는다", async () => {
    const context = createHost();
    for (const recipe of ["", "diagonal", "FLOOR", "__proto__"]) {
      await expect(context.host.placeCustomModelWithRecipe(context.modelId, recipe)).resolves.toBe(false);
    }
    expectUntouched(context, /배치 방식이 올바르지 않/u);
  });

  it("다른 작업이 진행 중이거나 물리 미리보기 중이면 아무것도 하지 않는다", async () => {
    for (const patch of [
      { isUploadingModel: true },
      { isCapturing: true },
      { isRestoringScene: true },
      { isQuadView: true },
      { deletingModelId: "other" },
      { applyingTemplateId: "template" },
      { physicsPhaseRef: { current: "running" as const } },
      { open: false },
    ] satisfies Partial<StudioBg3dEditorRecipeHost>[]) {
      const context = createHost({ patch });
      await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
      expectUntouched(context);
      expect(context.host.ensureModelRootCached).not.toHaveBeenCalled();
    }
  });

  it("장면 노드 한도를 넘으면 장면을 바꾸지 않는다", async () => {
    const context = createHost({ patch: { canAdmitSceneNodes: vi.fn(() => false) } });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context);
  });

  it("장면 연결 정보가 없으면 배치하지 않는다", async () => {
    const context = createHost();
    (context.host.attachmentByStorageModelIdRef as { current: Map<string, StudioBg3dModelAttachment> }).current.clear();
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context, /연결 정보를 확인할 수 없어/u);
  });

  it("모델 준비가 실패하면 일반 안내만 남기고 장면은 그대로다", async () => {
    const context = createHost({ patch: { ensureModelRootCached: vi.fn(async () => { throw new Error("raw internal detail"); }) } });
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context, /무결성을 확인하지 못해/u);
    expect(context.calls.setError).not.toHaveBeenCalledWith(expect.stringContaining("raw internal detail"));
  });

  it("편집 세션이 도중에 바뀌면 조용히 중단하고 장면을 바꾸지 않는다", async () => {
    const context = createHost();
    const ensure = vi.fn(async () => {
      studioBg3dModalOperationCoordinator.endSession(context.session);
      return { id: context.modelId };
    });
    (context.host as { ensureModelRootCached: unknown }).ensureModelRootCached = ensure;
    await expect(context.host.placeCustomModelWithRecipe(context.modelId, "floor")).resolves.toBe(false);
    expectUntouched(context);
  });

  it("진행 중인 포인터 배치 미리보기는 먼저 취소한다", async () => {
    const context = createHost({ patch: { placementSessionRef: { current: { phase: "preview" } } } });
    await context.host.placeCustomModelWithRecipe(context.modelId, "floor");
    expect(context.host.cancelCustomModelPlacement).toHaveBeenCalledOnce();
  });
});
