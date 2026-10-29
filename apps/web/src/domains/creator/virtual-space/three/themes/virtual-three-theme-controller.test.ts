import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../../studio-virtual-space-world-manifest";
import type { StudioThreeWorldArchitecture } from "../studio-virtual-space-three-world-layout";
import { DEFAULT_VIRTUAL_THREE_THEME, findVirtualThreeTheme } from "./virtual-three-theme-catalog";
import { createVirtualThreeThemeLifecycle, type VirtualThreeThemeLifecycleDependencies, type VirtualThreeThemeLifecycleOptions } from "./virtual-three-theme-controller";
import type { VirtualThreeThemeModelStage } from "./virtual-three-theme-model-stage";
import type { VirtualThreeAssetRecipeTheme } from "./virtual-three-theme-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function recipe(id: string): VirtualThreeAssetRecipeTheme {
  const theme = findVirtualThreeTheme(id);
  if (!theme || theme.kind !== "asset-recipe") throw new Error(`테마 fixture가 없습니다: ${id}`);
  return theme;
}
function model(scene: THREE.Scene, assertCurrent = vi.fn()): VirtualThreeThemeModelStage {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  scene.add(cube);
  return {
    sourceInputs: [{ id: "same-source", blobBytes: 10, bufferCopyBytes: 10, decodedGeometryBytes: 12, decodedImageBytes: 0 }],
    assertCurrent, update: vi.fn(), dispose: vi.fn(() => {
      cube.removeFromParent(); cube.geometry.dispose(); cube.material.dispose();
    }),
  };
}
function fixture(overrides: Partial<VirtualThreeThemeLifecycleDependencies> = {}, callbacks: Partial<VirtualThreeThemeLifecycleOptions> = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const actor = new THREE.Group(); actor.name = "self";
  scene.add(camera, actor);
  const architectures: StudioThreeWorldArchitecture[] = [];
  const preview = vi.fn(), committed = vi.fn();
  const dependencies: VirtualThreeThemeLifecycleDependencies = {
    buildArchitecture(target) {
      const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial());
      target.add(floorMesh);
      let disposed = false;
      const architecture: StudioThreeWorldArchitecture = {
        floorMesh, workstationRings: [], waterMeshes: [], loadDeferredArt: async () => undefined,
        dispose: vi.fn(() => {
          if (disposed) return;
          disposed = true; floorMesh.removeFromParent(); floorMesh.geometry.dispose(); floorMesh.material.dispose();
        }),
      };
      architectures.push(architecture);
      return architecture;
    },
    prepareModels: async ({ scene: target }) => model(target),
    assertCapacity: vi.fn(), compile: vi.fn(async () => undefined), prepareEnvironment: async () => undefined, ...overrides,
  };
  const controller = createVirtualThreeThemeLifecycle({ ...callbacks, scene, manifest: DEFAULT_STUDIO_WORLD_MANIFEST,
    isDisposed: () => false, onPreviewChange: preview, onCommitted(theme) { committed(theme); callbacks.onCommitted?.(theme); } }, dependencies);
  return { scene, camera, actor, architectures, preview, committed, dependencies, controller };
}

describe("3D 테마 준비와 실제 무대 commit", () => {
  it("기존 baseline을 즉시 보여 주고 테마 교체 중 카메라와 배우를 보존한다", async () => {
    const started = deferred<void>(), finish = deferred<void>();
    const f = fixture({ prepareModels: async ({ scene }) => { started.resolve(); await finish.promise; return model(scene); } });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME);
    const baseline = f.controller.getArchitecture();
    expect(baseline).toBe(f.architectures[0]);
    await f.controller.whenIdle();
    f.controller.select(recipe("parkbotanical"));
    await started.promise;
    expect(f.controller.getArchitecture()).toBe(baseline);
    expect(f.scene.children).toContain(f.camera);
    expect(f.scene.children).toContain(f.actor);
    expect(f.preview).not.toHaveBeenCalledWith("parkbotanical", { status: "ready" });
    finish.resolve(); await f.controller.whenIdle();
    expect(f.controller.getArchitecture()).toBe(f.architectures[1]);
    expect(f.architectures[0]?.dispose).toHaveBeenCalledOnce();
    expect(f.preview).toHaveBeenLastCalledWith("parkbotanical", { status: "ready" });
    expect(f.scene.children.filter((node) => node instanceof THREE.Scene)).toHaveLength(1);
    expect(f.scene.children).toContain(f.camera);
    expect(f.scene.children).toContain(f.actor);
    f.controller.dispose();
  });

  it("decode 전 누적 예산 실패는 이전 무대를 유지하고 새 조명/ready를 발행하지 않는다", async () => {
    const f = fixture({
      assertCapacity: () => { throw new Error("budget"); },
      prepareModels: async ({ onBeforeDecode, scene }) => {
        onBeforeDecode?.([{ id: "next", blobBytes: 10, bufferCopyBytes: 10, decodedGeometryBytes: 500, decodedImageBytes: 0, pendingDecode: true }]);
        return model(scene);
      },
    });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const baseline = f.controller.getArchitecture();
    f.controller.select(recipe("sflab")); await f.controller.whenIdle();
    expect(f.controller.getArchitecture()).toBe(baseline);
    expect(f.committed).toHaveBeenCalledTimes(1);
    expect(f.preview).toHaveBeenLastCalledWith("sflab", { status: "error" });
    expect(f.dependencies.compile).not.toHaveBeenCalled();
    expect(f.architectures[1]?.dispose).toHaveBeenCalledOnce();
    f.controller.dispose();
  });

  it("취소된 지연 모델을 해제한 다음 최신 요청 하나만 commit한다", async () => {
    const started = deferred<void>(), finish = deferred<void>();
    const staleDisposed = vi.fn();
    const f = fixture({ prepareModels: async ({ scene, theme }) => {
      if (theme.id === "parkbotanical") {
        started.resolve(); await finish.promise;
        const value = model(scene);
        return { ...value, dispose() { value.dispose(); staleDisposed(); } };
      }
      return model(scene);
    } });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    f.controller.select(recipe("parkbotanical")); await started.promise;
    f.controller.select(recipe("sflab"));
    f.controller.select(recipe("cafefood"));
    finish.resolve(); await f.controller.whenIdle();
    expect(staleDisposed).toHaveBeenCalledOnce();
    expect(f.committed.mock.calls.map(([theme]) => theme.id)).toEqual(["creator-campus", "cafefood"]);
    expect(f.preview).not.toHaveBeenCalledWith("parkbotanical", { status: "ready" });
    expect(f.preview).toHaveBeenLastCalledWith("cafefood", { status: "ready" });
    f.controller.dispose();
  });

  it("compile 중 출처가 바뀌면 최종 재검사에서 거부하고 모델을 해제한다", async () => {
    let changed = false;
    const dispose = vi.fn();
    const f = fixture({ compile: async () => { changed = true; }, prepareModels: async ({ scene }) => {
      const value = model(scene, vi.fn(() => { if (changed) throw new Error("stale source"); }));
      return { ...value, dispose() { value.dispose(); dispose(); } };
    } });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const baseline = f.controller.getArchitecture();
    f.controller.select(recipe("fantasyguild")); await f.controller.whenIdle();
    expect(f.controller.getArchitecture()).toBe(baseline);
    expect(f.preview).toHaveBeenLastCalledWith("fantasyguild", { status: "error" });
    expect(dispose).toHaveBeenCalledOnce();
    f.controller.dispose();
  });

  it("서로 다른 세대의 같은 소스는 독립 lease로 구·신 peak에 모두 포함한다", async () => {
    const f = fixture();
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    f.controller.select(recipe("parkbotanical")); await f.controller.whenIdle();
    f.controller.select(recipe("sflab")); await f.controller.whenIdle();
    const assertCapacity = vi.mocked(f.dependencies.assertCapacity);
    const last = assertCapacity.mock.calls.at(-1)?.[1];
    expect(last).toHaveLength(2);
    expect(new Set(last?.map((source) => source.id)).size).toBe(2);
    expect(last?.map((source) => source.blobBytes)).toEqual([10, 10]);
    f.controller.dispose();
  });

  it("종료 뒤 도착한 모델은 commit/상태 발행 없이 해제한다", async () => {
    const started = deferred<void>(), finish = deferred<void>();
    const disposed = vi.fn();
    const f = fixture({ prepareModels: async ({ scene }) => {
      started.resolve(); await finish.promise;
      const value = model(scene); return { ...value, dispose() { value.dispose(); disposed(); } };
    } });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    f.controller.select(recipe("parkbotanical")); await started.promise;
    f.controller.dispose();
    const published = f.preview.mock.calls.length;
    finish.resolve(); await f.controller.whenIdle();
    expect(disposed).toHaveBeenCalledOnce();
    expect(f.preview).toHaveBeenCalledTimes(published);
    expect(f.controller.getArchitecture()).toBeNull();
    expect(f.scene.children).toEqual([f.camera, f.actor]);
  });

  it("commit 조명 callback 실패는 실제 HUD 상태와 이전 무대를 복원하고 새 자원을 해제한다", async () => {
    let displayedLight = "initial";
    const restored = vi.fn();
    const f = fixture({}, {
      captureCommitState() { const previous = displayedLight; return () => { displayedLight = previous; restored(); }; },
      onCommitted(theme) {
        displayedLight = theme.id;
        if (theme.id === "parkbotanical") throw new Error("lighting commit failed");
      },
    });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const previous = f.controller.getArchitecture();
    displayedLight = "manual-night-override";
    f.controller.select(recipe("parkbotanical")); await f.controller.whenIdle();
    expect(displayedLight).toBe("manual-night-override");
    expect(restored).toHaveBeenCalledOnce();
    expect(f.controller.getArchitecture()).toBe(previous);
    expect(f.architectures[0]?.dispose).not.toHaveBeenCalled();
    expect(f.architectures[1]?.dispose).toHaveBeenCalledOnce();
    expect(f.scene.children.filter((node) => node instanceof THREE.Scene)).toHaveLength(1);
    expect(f.preview).toHaveBeenLastCalledWith("parkbotanical", { status: "error" });
    f.controller.dispose();
  });

  it("교체 완료 후 이전 자원 해제 실패는 실제 표시를 유지하되 새 준비를 더 쌓지 않는다", async () => {
    const onAssetError = vi.fn();
    const f = fixture({}, { onAssetError });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const previous = f.architectures[0];
    if (!previous) throw new Error("baseline이 없습니다.");
    const release = previous.dispose;
    vi.spyOn(previous, "dispose").mockImplementation(() => { release(); throw new Error("resource cleanup failed"); });
    f.controller.select(recipe("parkbotanical")); await f.controller.whenIdle();
    expect(f.controller.getArchitecture()).toBe(f.architectures[1]);
    expect(f.preview).toHaveBeenLastCalledWith("parkbotanical", { status: "ready" });
    expect(onAssetError).toHaveBeenCalledWith("creator-campus", "model");
    f.controller.select(recipe("sflab")); await f.controller.whenIdle();
    expect(f.architectures).toHaveLength(2);
    expect(f.controller.getArchitecture()).toBe(f.architectures[1]);
    expect(f.preview).toHaveBeenLastCalledWith("sflab", { status: "error" });
    f.controller.dispose();
  });

  it("아직 불러오는 core 장비가 있으면 decode 전에 대기하고 완성된 장면을 계수한다", async () => {
    let corePending = false;
    const started = deferred<void>(), idle = deferred<void>();
    const prepareModels = vi.fn<VirtualThreeThemeLifecycleDependencies["prepareModels"]>(async ({ scene }) => model(scene));
    const f = fixture({ prepareModels }, {
      getPendingCoreAssetCount: () => corePending ? 1 : 0,
      async waitForCoreAssets() { if (corePending) { started.resolve(); await idle.promise; } },
    });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const previous = f.controller.getArchitecture();
    corePending = true;
    f.controller.select(recipe("parkbotanical")); await started.promise;
    expect(prepareModels).not.toHaveBeenCalled();
    expect(f.controller.getArchitecture()).toBe(previous);
    corePending = false; idle.resolve(); await f.controller.whenIdle();
    expect(prepareModels).toHaveBeenCalledOnce();
    expect(prepareModels.mock.calls[0]?.[0].occupiedScene).toBe(f.scene);
    expect(f.preview).toHaveBeenLastCalledWith("parkbotanical", { status: "ready" });
    f.controller.dispose();
  });

  it("취소 stage 정리가 실패하면 이미 대기 중인 다음 세대도 시작하지 않는다", async () => {
    const started = deferred<void>(), finish = deferred<void>(), onAssetError = vi.fn();
    const prepareModels = vi.fn<VirtualThreeThemeLifecycleDependencies["prepareModels"]>(async ({ scene }) => {
      started.resolve(); await finish.promise;
      const value = model(scene);
      return { ...value, dispose() { value.dispose(); throw new Error("cancelled stage cleanup failed"); } };
    });
    const f = fixture({ prepareModels }, { onAssetError });
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const previous = f.controller.getArchitecture();
    f.controller.select(recipe("parkbotanical")); await started.promise;
    f.controller.select(recipe("sflab"));
    finish.resolve(); await f.controller.whenIdle();
    expect(prepareModels).toHaveBeenCalledOnce();
    expect(f.architectures).toHaveLength(2);
    expect(f.controller.getArchitecture()).toBe(previous);
    expect(f.preview).toHaveBeenLastCalledWith("sflab", { status: "error" });
    expect(onAssetError).toHaveBeenCalledWith("parkbotanical", "model");
    f.controller.select(recipe("cafefood")); await f.controller.whenIdle();
    expect(prepareModels).toHaveBeenCalledOnce();
    expect(f.preview).toHaveBeenLastCalledWith("cafefood", { status: "error" });
    f.controller.dispose();
  });

  it("architecture 생성 도중의 부분 geometry·material도 해제하고 이전 무대를 유지한다", async () => {
    const f = fixture();
    f.controller.select(DEFAULT_VIRTUAL_THREE_THEME); await f.controller.whenIdle();
    const previous = f.controller.getArchitecture();
    const partial = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const geometryDisposed = vi.spyOn(partial.geometry, "dispose"), materialDisposed = vi.spyOn(partial.material, "dispose");
    vi.spyOn(f.dependencies, "buildArchitecture").mockImplementation((scene) => { scene.add(partial); throw new Error("partial architecture failure"); });
    f.controller.select(recipe("parkbotanical")); await f.controller.whenIdle();
    expect(f.controller.getArchitecture()).toBe(previous);
    expect(partial.parent).toBeNull();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(f.preview).toHaveBeenLastCalledWith("parkbotanical", { status: "error" });
    f.controller.dispose();
  });
});
