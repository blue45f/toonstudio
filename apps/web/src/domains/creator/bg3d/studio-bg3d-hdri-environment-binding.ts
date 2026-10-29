import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import type { WebGPURenderer } from "three/webgpu";

import { claimStudioBg3dEnvironmentSlots } from "./studio-bg3d-environment-slot-owner";
import { createStudioBg3dHdriPmrem } from "./studio-bg3d-hdri-pmrem";

export interface StudioBg3dHdriEnvironmentMountOptions {
  /** 로컬로 서빙되는 .hdr URL. */
  readonly url: string;
  readonly intensity: number;
  readonly rotationDegrees: number;
  readonly useAsBackground: boolean;
  /** 현재 요청의 적용 또는 실패가 확정되면 한 번 호출한다. 폐기된 요청은 게시하지 않는다. */
  readonly onSettled?: (applied: boolean) => void;
}

export type StudioBg3dHdriEnvironmentStatus =
  | "loading" | "preparing" | "applied" | "superseded" | "failed" | "disposed";

export interface StudioBg3dHdriEnvironmentDiagnostic {
  readonly phase: "load" | "prepare" | "install" | "update" | "observer" | "cleanup";
  readonly code:
    | "load-failed" | "pmrem-failed" | "slot-install-failed" | "slot-update-failed"
    | "observer-failed" | "owner-release-failed" | "source-dispose-failed"
    | "target-dispose-failed" | "generator-dispose-failed";
  readonly error: unknown;
}

export interface StudioBg3dHdriEnvironmentSnapshot {
  readonly status: StudioBg3dHdriEnvironmentStatus;
  readonly diagnostics: readonly StudioBg3dHdriEnvironmentDiagnostic[];
}

export interface StudioBg3dHdriEnvironmentBinding {
  /** 현재 세대가 실제 commit됐으면 true다. observer·cleanup 오류는 별도 진단으로 남는다. */
  readonly ready: Promise<boolean>;
  readonly texture: THREE.Texture | null;
  readonly getSnapshot: () => StudioBg3dHdriEnvironmentSnapshot;
  readonly setRotation: (rotationDegrees: number) => void;
  readonly setIntensity: (intensity: number) => void;
  readonly dispose: () => void;
}

function rotation(rotationDegrees: number): THREE.Euler {
  const wrapped = rotationDegrees % 360;
  return new THREE.Euler(0, THREE.MathUtils.degToRad(wrapped < 0 ? wrapped + 360 : wrapped), 0);
}

/**
 * scene slot은 공통 owner가 복원하고, HDR source·PMREM target·generator만 이 binding이 소유한다.
 * 비동기 준비가 끝날 때까지 입력 HDR을 유지하며, 늦은 결과는 현재 세대에 게시하지 않는다.
 */
export function mountStudioBg3dHdriEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | WebGPURenderer,
  options: StudioBg3dHdriEnvironmentMountOptions,
): StudioBg3dHdriEnvironmentBinding {
  const owner = claimStudioBg3dEnvironmentSlots(scene, {
    environment: true, background: options.useAsBackground,
  });
  const diagnostics: StudioBg3dHdriEnvironmentDiagnostic[] = [];
  let status: StudioBg3dHdriEnvironmentStatus = "loading";
  let disposed = false;
  let applied = false;
  let preparing = true;
  let notified = false;
  let ownerReleased = false;
  let source: THREE.DataTexture | null = null;
  let target: THREE.RenderTarget | null = null;
  let disposeGenerator: (() => void) | null = null;
  let intensity = options.intensity;
  let rotationDegrees = options.rotationDegrees;

  const diagnostic = (
    phase: StudioBg3dHdriEnvironmentDiagnostic["phase"],
    code: StudioBg3dHdriEnvironmentDiagnostic["code"],
    error: unknown,
  ) => { diagnostics.push(Object.freeze({ phase, code, error })); };
  const cleanup = (code: StudioBg3dHdriEnvironmentDiagnostic["code"], action: () => void) => {
    try { action(); } catch (error) { diagnostic("cleanup", code, error); }
  };
  const isCurrent = () => !disposed && owner.isCurrent();
  const releaseOwner = () => {
    if (ownerReleased) return;
    ownerReleased = true;
    const retireValues: THREE.Texture[] = [];
    if (target) retireValues.push(target.texture);
    if (source) retireValues.push(source);
    cleanup("owner-release-failed", () => owner.dispose({ retireValues }));
  };
  const releaseSource = () => {
    const owned = source;
    source = null;
    if (owned) cleanup("source-dispose-failed", () => owned.dispose());
  };
  const releaseTarget = () => {
    const owned = target;
    target = null;
    if (owned) cleanup("target-dispose-failed", () => owned.dispose());
  };
  const releaseGenerator = () => {
    const owned = disposeGenerator;
    disposeGenerator = null;
    if (owned) cleanup("generator-dispose-failed", owned);
  };
  const releaseCandidate = () => {
    // scene이 개인 자원을 더는 참조하지 않게 한 다음 모든 자기 자원의 정리를 시도한다.
    releaseOwner();
    releaseTarget();
    releaseSource();
    releaseGenerator();
  };
  const superseded = () => { if (!disposed) status = "superseded"; };
  const notify = (result: boolean) => {
    if (notified || disposed) return;
    notified = true;
    try { options.onSettled?.(result); }
    catch (error) { diagnostic("observer", "observer-failed", error); }
  };

  const ready = (async (): Promise<boolean> => {
    let phase: "load" | "prepare" | "install" = "load";
    try {
      const loader = new RGBELoader();
      loader.setDataType(THREE.HalfFloatType);
      source = await loader.loadAsync(options.url);
      if (!isCurrent()) { superseded(); return false; }
      // loader의 기본 UVMapping 대신 구면 배경·환경광의 등거리 해석을 명시한다.
      source.mapping = THREE.EquirectangularReflectionMapping;

      status = "preparing";
      phase = "prepare";
      // factory는 실패 시 자기 미반환 target/generator를 정리한다. 입력 HDR은 여기서 소유한다.
      const prepared = await createStudioBg3dHdriPmrem(renderer, source, { isCurrent });
      target = prepared.target;
      disposeGenerator = () => prepared.disposeGenerator();
      if (!isCurrent()) { superseded(); return false; }

      phase = "install";
      const environment = { value: target.texture, intensity, rotation: rotation(rotationDegrees) };
      const installed = options.useAsBackground
        ? owner.install({ environment, background: { value: source, intensity, rotation: rotation(rotationDegrees) } })
        : owner.install({ environment });
      if (!installed) { superseded(); return false; }
      applied = true;
      status = "applied";
    } catch (error) {
      diagnostic(phase, phase === "load" ? "load-failed" : phase === "prepare" ? "pmrem-failed" : "slot-install-failed", error);
      if (!disposed) {
        status = owner.isCurrent() ? "failed" : "superseded";
        // 정리 이벤트가 새 요청을 시작하기 전에 현재 실패를 확정·통지한다.
        if (status === "failed") notify(false);
      }
    } finally {
      // WebGPU queue 완료를 포함한 factory settle 전에는 source를 해제하지 않는다.
      preparing = false;
      if (!applied || disposed) releaseCandidate();
      else {
        if (!options.useAsBackground) releaseSource();
        releaseGenerator();
      }
    }

    if (applied) {
      // cleanup의 사용자 이벤트가 새 세대를 설치했더라도 오래된 성공 알림은 게시하지 않는다.
      if (!isCurrent()) { superseded(); releaseCandidate(); return false; }
      notify(true);
      // observer가 새 요청을 시작하거나 해제하면 ready도 더는 현재 성공을 반환하지 않는다.
      if (!isCurrent()) { superseded(); releaseCandidate(); return false; }
      return true;
    }
    return false;
  })();

  const update = (values: { readonly intensity?: number; readonly rotation?: THREE.Euler }) => {
    if (!applied || !isCurrent()) return;
    try {
      const environmentUpdated = owner.update("environment", values);
      const backgroundUpdated = !options.useAsBackground || owner.update("background", values);
      if (!environmentUpdated || !backgroundUpdated) {
        diagnostic("update", "slot-update-failed", new Error("현재 HDRI slot의 표시값을 갱신하지 못했습니다."));
      }
    } catch (error) { diagnostic("update", "slot-update-failed", error); }
  };

  return Object.freeze({
    ready,
    get texture() { return applied && isCurrent() ? target?.texture ?? null : null; },
    getSnapshot: (): StudioBg3dHdriEnvironmentSnapshot => Object.freeze({
      status: status === "applied" && !owner.isCurrent() ? "superseded" : status,
      diagnostics: Object.freeze([...diagnostics]),
    }),
    setRotation: (value: number) => {
      if (disposed) return;
      rotationDegrees = value;
      update({ rotation: rotation(value) });
    },
    setIntensity: (value: number) => {
      if (disposed) return;
      intensity = value;
      update({ intensity: value });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      status = "disposed";
      releaseOwner();
      // GPU가 읽는 source의 실제 수명은 ready의 finally가 마무리한다.
      if (!preparing) releaseCandidate();
      applied = false;
    },
  });
}
