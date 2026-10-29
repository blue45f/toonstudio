import * as THREE from "three";

import type { StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { buildStudioThreeWorldArchitecture, type StudioThreeWorldArchitecture } from "../studio-virtual-space-three-world-layout";
import { disposeStudioThreeSurfaceNodes } from "../studio-virtual-space-three-surface-art";
import { prepareVirtualThreeThemeModels, type VirtualThreeStagedSourceInput, type VirtualThreeThemeModelStage } from "./virtual-three-theme-model-stage";
import { assertVirtualThreeRendererCapacity } from "./virtual-three-renderer-inventory";
import type { VirtualThreeTheme, VirtualThreeThemeId, VirtualThreeThemePreviewState } from "./virtual-three-theme-types";

interface ThemeStage {
  readonly epoch: number;
  readonly theme: VirtualThreeTheme;
  readonly scene: THREE.Scene;
  readonly architecture: StudioThreeWorldArchitecture;
  readonly abort: AbortController;
  models: VirtualThreeThemeModelStage | null;
  ready: boolean;
  released: boolean;
}
export interface VirtualThreeThemeLifecycleDependencies {
  readonly buildArchitecture: typeof buildStudioThreeWorldArchitecture;
  readonly prepareModels: typeof prepareVirtualThreeThemeModels;
  readonly assertCapacity: (staged: THREE.Scene, sources: readonly VirtualThreeStagedSourceInput[]) => unknown;
  readonly compile: (staged: THREE.Scene) => Promise<unknown>;
  readonly prepareEnvironment: (theme: VirtualThreeTheme, signal: AbortSignal) => Promise<void>;
}
export interface VirtualThreeThemeController {
  readonly select: (theme: VirtualThreeTheme) => void;
  readonly getArchitecture: () => StudioThreeWorldArchitecture | null;
  readonly update: (deltaSeconds: number) => void;
  readonly dispose: () => void;
  /** 지연 응답·취소 회귀와 호스트 종료 검증에서 실제 준비 파이프라인 종료를 기다린다. */
  readonly whenIdle: () => Promise<void>;
}

export interface VirtualThreeThemeLifecycleOptions {
  readonly scene: THREE.Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly isDisposed: () => boolean;
  readonly onPreviewChange?: (id: VirtualThreeThemeId, state: VirtualThreeThemePreviewState) => void;
  readonly onCommitted?: (theme: VirtualThreeTheme) => void;
  readonly onAssetError?: (url: string, kind: "texture" | "model") => void;
  /** HUD의 수동 조명까지 포함한 현재 표시 상태를 commit 실패 시 정확히 복원한다. */
  readonly captureCommitState?: () => () => void;
  readonly waitForCoreAssets?: () => Promise<void>;
  readonly getPendingCoreAssetCount?: () => number;
}

/** 실제 renderer를 감싼다. GLTF·resource 검증은 동일한 수명 제어기를 통과한다. */
export function createVirtualThreeThemeController(options: VirtualThreeThemeLifecycleOptions & {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.Camera;
  readonly getRenderTargets?: () => readonly THREE.RenderTarget[];
  readonly getPendingEnvironmentCount?: () => number;
  readonly prepareEnvironment?: (theme: VirtualThreeTheme) => Promise<void>;
  readonly waitForEnvironment?: () => Promise<void>;
}): VirtualThreeThemeController {
  return createVirtualThreeThemeLifecycle(options, {
    buildArchitecture: buildStudioThreeWorldArchitecture,
    prepareModels: prepareVirtualThreeThemeModels,
    assertCapacity: (stagedScene, sourceInputs) => {
      if (options.getPendingEnvironmentCount?.()) throw new Error("환경광 자원이 준비 중이어서 3D 자원 상한을 확정할 수 없습니다.");
      return assertVirtualThreeRendererCapacity({ ...options, activeScene: options.scene, stagedScene, sourceInputs, renderTargets: options.getRenderTargets?.() });
    },
    compile: (staged) => options.renderer.compileAsync(staged, options.camera, options.scene),
    prepareEnvironment: async (theme, signal) => {
      await awaitEnvironment(options.prepareEnvironment?.(theme) ?? Promise.resolve(), signal);
      await awaitEnvironment(options.waitForEnvironment?.() ?? Promise.resolve(), signal);
    },
  });
}

/** 공유 환경광 준비를 중단하지 않고 해당 테마 세대의 대기만 취소한다. */
function awaitEnvironment(task: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new DOMException("3D 환경광 준비 대기가 취소됐습니다.", "AbortError")); };
    task.then(() => { signal.removeEventListener("abort", abort); resolve(); }, (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** 카메라·배우·presence를 다시 만들지 않고 독립 3D 표면과 모델만 원자적으로 교체한다. */
export function createVirtualThreeThemeLifecycle(options: VirtualThreeThemeLifecycleOptions, dependencies: VirtualThreeThemeLifecycleDependencies): VirtualThreeThemeController {
  let disposed = false, epoch = 0;
  let active: ThemeStage | null = null, preparing: ThemeStage | null = null;
  let desired: { readonly theme: VirtualThreeTheme; readonly epoch: number } | null = null;
  let job: Promise<void> | null = null;
  let resourceCleanupFailed = false;
  const stopped = () => disposed || options.isDisposed();
  const publish = (id: VirtualThreeThemeId, state: VirtualThreeThemePreviewState) => {
    if (!stopped()) options.onPreviewChange?.(id, state);
  };
  const latchCleanupFailure = (themeId: VirtualThreeThemeId) => {
    resourceCleanupFailed = true;
    if (desired) publish(desired.theme.id, { status: "error" });
    desired = null;
    options.onAssetError?.(themeId, "model");
  };
  const current = (stage: ThemeStage) => !stopped() && stage.epoch === epoch && !stage.abort.signal.aborted;
  const release = (stage: ThemeStage) => {
    if (stage.released) return;
    stage.released = true;
    stage.abort.abort();
    stage.scene.removeFromParent();
    const failures: unknown[] = [];
    try { stage.models?.dispose(); } catch (error) { failures.push(error); }
    try { stage.architecture.dispose(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "3D 테마 무대 해제에 실패했습니다.");
  };
  const inputs = (stage: ThemeStage, pending?: readonly VirtualThreeStagedSourceInput[]) => {
    const withLease = (item: ThemeStage, sources: readonly VirtualThreeStagedSourceInput[]) => sources.map((source) => ({ ...source, id: `${item.epoch}:${source.id}` }));
    return [
      ...(active && active !== stage ? withLease(active, active.models?.sourceInputs ?? []) : []),
      ...withLease(stage, pending ?? stage.models?.sourceInputs ?? []),
    ];
  };
  const checkCapacity = (stage: ThemeStage, pending?: readonly VirtualThreeStagedSourceInput[]) => {
    if (options.getPendingCoreAssetCount?.()) throw new Error("기존 3D 장비·캐릭터가 준비 중이어서 자원 상한을 확정할 수 없습니다.");
    return dependencies.assertCapacity(stage.scene, inputs(stage, pending));
  };
  const commit = (stage: ThemeStage) => {
    const previous = active;
    if (previous !== stage) {
      let restoreCommitState: (() => void) | undefined;
      // 같은 동기 작업 안에서 교체하고 조명 callback 실패 시 이전 무대·조명으로 복구한다.
      try {
        restoreCommitState = options.captureCommitState?.();
        options.scene.add(stage.scene);
        active = stage;
        options.onCommitted?.(stage.theme);
        previous?.scene.removeFromParent();
      } catch (error) {
        const failures: unknown[] = [error];
        active = previous;
        try { stage.scene.removeFromParent(); } catch (rollbackError) { failures.push(rollbackError); }
        if (previous) {
          try {
            if (previous.scene.parent !== options.scene) options.scene.add(previous.scene);
            if (restoreCommitState) restoreCommitState();
            else options.onCommitted?.(previous.theme);
          } catch (rollbackError) { failures.push(rollbackError); }
        } else if (restoreCommitState) {
          try { restoreCommitState(); } catch (rollbackError) { failures.push(rollbackError); }
        }
        if (failures.length > 1) throw new AggregateError(failures, "3D 테마 commit과 이전 조명 복구에 실패했습니다.", { cause: error });
        throw error;
      }
      if (previous) {
        try { release(previous); }
        catch {
          // 실제 commit은 유지하되 자원 정리가 실패한 뒤 새 준비를 계속 쌓지 않는다.
          latchCleanupFailure(previous.theme.id);
        }
      }
    }
  };
  const prepare = async (request: { readonly theme: VirtualThreeTheme; readonly epoch: number }) => {
    const scene = new THREE.Scene();
    scene.name = `virtual-three-theme-${request.theme.id}`;
    let stage: ThemeStage | null = null;
    try {
      const abort = new AbortController();
      stage = { ...request, scene, abort, architecture: dependencies.buildArchitecture(scene, options.manifest, request.theme), models: null, ready: false, released: false };
      preparing = stage;
      // 첫 진입에는 기존 baseline을 즉시 놓아 추가 데이터 준비 중에도 이동·대화를 유지한다.
      if (!active && request.theme.kind === "preserved-baseline") commit(stage);
      const ownStage = stage;
      await dependencies.prepareEnvironment(request.theme, abort.signal);
      if (!current(stage)) return;
      await awaitEnvironment(options.waitForCoreAssets?.() ?? Promise.resolve(), abort.signal);
      if (!current(stage)) return;
      await stage.architecture.loadDeferredArt((url) => options.onAssetError?.(url, "texture"), undefined, abort.signal);
      if (!current(stage)) return;
      if (request.theme.kind === "asset-recipe") stage.models = await dependencies.prepareModels({
        scene, occupiedScene: options.scene, manifest: options.manifest, theme: request.theme, signal: abort.signal,
        onAssetError: options.onAssetError,
        onBeforeDecode: (sources) => checkCapacity(ownStage, sources),
        onProgress(loaded, total) { if (current(ownStage)) publish(request.theme.id, { status: "loading", loaded, total }); },
      });
      if (!current(stage)) return;
      stage.models?.assertCurrent();
      // 기존 baseline의 첫 진입을 새 예산으로 막지 않는다. 추가 테마는 구·신 동시 상주량으로 판정한다.
      if (active !== stage) {
        checkCapacity(stage);
        await dependencies.compile(scene);
        if (!current(stage)) return;
        await awaitEnvironment(options.waitForCoreAssets?.() ?? Promise.resolve(), abort.signal);
        if (!current(stage)) return;
        stage.models?.assertCurrent();
        checkCapacity(stage);
      }
      if (!current(stage)) return;
      commit(stage);
      stage.ready = true;
      if (current(stage)) publish(request.theme.id, { status: "ready" });
    } catch {
      if (stage && current(stage)) publish(request.theme.id, { status: "error" });
      else if (!stage && request.epoch === epoch) publish(request.theme.id, { status: "error" });
    } finally {
      if (stage && active !== stage) {
        try { release(stage); } catch { latchCleanupFailure(request.theme.id); }
      } else if (!stage) {
        // architecture 생성 도중 실패해 반환 계약을 얻지 못한 부분 노드도 소유권을 닫는다.
        try { disposeStudioThreeSurfaceNodes([...scene.children]); } catch { latchCleanupFailure(request.theme.id); }
      }
      if (preparing === stage) preparing = null;
    }
  };
  const pump = async () => {
    while (desired && !stopped() && !resourceCleanupFailed) {
      const request = desired;
      desired = null;
      // parse·compile 종료 후 다음 세대를 시작해 취소된 GPU 준비 작업의 중복을 막는다.
      await prepare(request);
    }
  };
  const start = () => {
    if (job) return;
    job = pump().finally(() => { job = null; if (desired && !stopped() && !resourceCleanupFailed) start(); });
  };
  return {
    select(theme) {
      if (stopped()) return;
      if (resourceCleanupFailed) { publish(theme.id, { status: "error" }); return; }
      epoch += 1;
      preparing?.abort.abort();
      publish(theme.id, { status: "loading", loaded: 0, total: theme.kind === "asset-recipe" ? theme.modelAssetIds.length : 0 });
      desired = { theme, epoch };
      start();
    },
    getArchitecture: () => active?.architecture ?? null,
    update(delta) { active?.models?.update(delta); },
    async whenIdle() { while (job) await job; },
    dispose() {
      if (disposed) return;
      disposed = true; epoch += 1; desired = null;
      preparing?.abort.abort();
      const previous = active;
      active = null;
      if (previous) release(previous);
      // parse 중인 결과는 prepare의 finally가 받아서 해제한다.
    },
  };
}
