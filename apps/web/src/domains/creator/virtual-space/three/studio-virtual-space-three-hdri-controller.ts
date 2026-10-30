import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export type StudioThreeLightingPreset = "day" | "studio" | "night";

/** 기존 PolyHaven CC0 1K 원본과 세 preset을 그대로 유지한다. */
export const STUDIO_THREE_HDRI_URLS: Readonly<Record<StudioThreeLightingPreset, string>> = Object.freeze({
  day: "/assets/3d/hdri/konigsallee_1k.hdr",
  studio: "/assets/3d/hdri/combination_room_1k.hdr",
  night: "/assets/3d/hdri/cobblestone_street_night_1k.hdr",
});

export interface StudioThreeHdriController {
  readonly applyPreset: (preset: StudioThreeLightingPreset) => void;
  /** 활성 환경을 바꾸지 않고 동일 preset의 공유 캐시를 준비한다. 실패는 호출자에게 전달한다. */
  readonly preparePreset: (preset: StudioThreeLightingPreset) => Promise<void>;
  readonly getRenderTargets: () => readonly THREE.RenderTarget[];
  /** dispose 후에도 실제로 끝나지 않은 요청은 완료 시점까지 포함한다. */
  readonly getPendingCount: () => number;
  readonly getFailureCount: () => number;
  readonly whenIdle: () => Promise<void>;
  readonly dispose: () => void;
}

export interface StudioThreeHdriDependencies {
  readonly load: (url: string) => Promise<THREE.Texture>;
  readonly createGenerator: () => Pick<THREE.PMREMGenerator, "compileEquirectangularShader" | "fromEquirectangular" | "dispose">;
  readonly onError?: (url: string, error: unknown) => void;
}

/** 실 GPU factory다. 각 변환 후 PMREM의 임시 target·geometry·material을 반드시 해제한다. */
export function createStudioThreeHdriController(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isDisposed: () => boolean,
  onError?: (url: string, error: unknown) => void,
): StudioThreeHdriController {
  const loader = new RGBELoader();
  return createStudioThreeHdriLifecycle(scene, isDisposed, {
    load: (url) => loader.loadAsync(url),
    createGenerator: () => new THREE.PMREMGenerator(renderer),
    onError,
  });
}

/** 비동기 수명과 RenderTarget 소유권을 GPU context 없이도 같은 경로로 검증한다. */
export function createStudioThreeHdriLifecycle(
  scene: THREE.Scene,
  isDisposed: () => boolean,
  dependencies: StudioThreeHdriDependencies,
): StudioThreeHdriController {
  const cache = new Map<StudioThreeLightingPreset, THREE.WebGLRenderTarget>();
  const pending = new Map<StudioThreeLightingPreset, Promise<void>>();
  let activePreset: StudioThreeLightingPreset | null = null;
  let disposed = false, failureCount = 0;
  const stopped = () => disposed || isDisposed();
  const cancelled = () => new DOMException("HDRI 준비가 종료됐습니다.", "AbortError");

  const convert = (hdr: THREE.Texture, preset: StudioThreeLightingPreset) => {
    let output: THREE.WebGLRenderTarget | undefined;
    let retained = false;
    const failures: unknown[] = [];
    try {
      if (stopped()) throw cancelled();
      const generator = dependencies.createGenerator();
      try {
        generator.compileEquirectangularShader();
        output = generator.fromEquirectangular(hdr);
      } catch (error) { failures.push(error); }
      try { generator.dispose(); } catch (error) { failures.push(error); }
      if (stopped()) throw cancelled();
    } catch (error) { failures.push(error); }
    try { hdr.dispose(); } catch (error) { failures.push(error); }
    if (!failures.length && stopped()) failures.push(cancelled());
    if (!failures.length && output) {
      cache.set(preset, output);
      retained = true;
    }
    if (output && !retained) {
      try { output.dispose(); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "HDRI 준비와 자원 해제에 실패했습니다.");
  };

  const preparePreset = (preset: StudioThreeLightingPreset): Promise<void> => {
    if (stopped()) return Promise.reject(cancelled());
    if (cache.has(preset)) return Promise.resolve();
    const existing = pending.get(preset);
    if (existing) return existing;
    const task: Promise<void> = Promise.resolve().then(() => {
      if (stopped()) throw cancelled();
      return dependencies.load(STUDIO_THREE_HDRI_URLS[preset]);
    }).then((hdr) => convert(hdr, preset)).catch((error: unknown) => {
      if (!stopped()) {
        failureCount += 1;
        dependencies.onError?.(STUDIO_THREE_HDRI_URLS[preset], error);
      }
      throw error;
    }).finally(() => {
      if (pending.get(preset) === task) pending.delete(preset);
    });
    pending.set(preset, task);
    return task;
  };
  const install = (preset: StudioThreeLightingPreset) => {
    const target = cache.get(preset);
    if (stopped() || activePreset !== preset || !target) return;
    scene.environment = target.texture;
    scene.environmentIntensity = preset === "day" ? 0.56 : preset === "studio" ? 0.64 : 0.42;
  };
  return {
    preparePreset,
    applyPreset(preset) {
      if (stopped()) return;
      activePreset = preset;
      if (cache.has(preset)) { install(preset); return; }
      void preparePreset(preset).then(() => install(preset), () => {
        // 실패는 onError·getFailureCount로 관측하고 기존 환경·직접 조명을 보존한다.
      });
    },
    getRenderTargets: () => [...new Set(cache.values())],
    getPendingCount: () => pending.size,
    getFailureCount: () => failureCount,
    async whenIdle() { while (pending.size) await Promise.allSettled([...pending.values()]); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if ([...cache.values()].some((target) => target.texture === scene.environment)) scene.environment = null;
      const targets = new Set(cache.values());
      cache.clear();
      const failures: unknown[] = [];
      for (const target of targets) {
        try { target.dispose(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "HDRI 출력 target 해제에 실패했습니다.");
    },
  };
}
