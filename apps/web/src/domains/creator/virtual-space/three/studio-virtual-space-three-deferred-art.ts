import * as THREE from "three";

import type { StudioThreeMural } from "./studio-virtual-space-three-surface-art";

export type StudioThreeArtTextureLoader = (url: string, signal?: AbortSignal) => Promise<THREE.Texture>;
export interface StudioThreeDeferredArtLoader {
  readonly load: (onAssetError?: (url: string) => void, loadTexture?: StudioThreeArtTextureLoader, signal?: AbortSignal) => Promise<void>;
  readonly dispose: () => void;
}
const cancelled = () => new DOMException("3D 표면 아트 준비가 취소됐습니다.", "AbortError");

/** 모든 아트가 준비된 뒤만 성공한다. 기본 TextureLoader의 늦은 응답도 이 소유권 안에서 해제한다. */
export function createStudioThreeDeferredArtLoader(murals: readonly StudioThreeMural[]): StudioThreeDeferredArtLoader {
  let disposed = false;
  let promise: Promise<void> | undefined;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let stop: ((error: Error) => void) | undefined;
  const released = new Set<THREE.Texture>();
  const attached = new Map<StudioThreeMural, { texture: THREE.Texture; color: THREE.Color }>();
  const release = (texture: THREE.Texture) => {
    if (!released.has(texture)) { released.add(texture); texture.dispose(); }
  };
  const resetAttached = (state: "error" | "cancelled" | "disposed") => {
    for (const [mural, entry] of attached) {
      if (mural.artwork.material.map === entry.texture) {
        mural.artwork.material.map = null;
        mural.artwork.material.color.copy(entry.color);
        mural.artwork.material.needsUpdate = true;
      }
      release(entry.texture);
      mural.group.userData.assetState = state;
    }
    attached.clear();
  };
  return {
    load(onAssetError, loadTexture, signal) {
      if (disposed || signal?.aborted) return Promise.reject(cancelled());
      if (promise) return promise;
      if (murals.length === 0) { promise = Promise.resolve(); return promise; }
      if (!loadTexture && typeof document === "undefined") return Promise.reject(new Error("3D 표면 아트를 읽을 이미지 로더가 없습니다."));
      const load: StudioThreeArtTextureLoader = loadTexture ?? ((url: string) => new THREE.TextureLoader().loadAsync(url));
      promise = new Promise<void>((resolve, reject) => {
        let settled = false;
        let inactive = false;
        let remaining = murals.length;
        const onAbort = () => fail(cancelled());
        const cleanup = () => {
          if (timer !== undefined) { globalThis.clearTimeout(timer); timer = undefined; }
          signal?.removeEventListener("abort", onAbort);
          stop = undefined;
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true; inactive = true; cleanup();
          resetAttached(error.name === "AbortError" ? "cancelled" : "error");
          reject(error);
        };
        stop = fail;
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) { fail(cancelled()); return; }
        timer = globalThis.setTimeout(() => {
          timer = undefined;
          for (const mural of murals) {
            void Promise.resolve().then(() => {
              if (inactive || disposed) throw cancelled();
              return load(mural.url, signal);
            }).then((texture) => {
              if (inactive || disposed) { release(texture); return; }
              attached.set(mural, { texture, color: mural.artwork.material.color.clone() });
              texture.colorSpace = THREE.SRGBColorSpace;
              mural.artwork.material.map = texture;
              mural.artwork.material.color.setHex(0xffffff);
              mural.artwork.material.needsUpdate = true;
              mural.group.userData.assetState = "ready";
              remaining -= 1;
              if (remaining === 0) { settled = true; cleanup(); resolve(); }
            }).catch((error: unknown) => {
              if (inactive || disposed) return;
              mural.group.userData.assetState = "error";
              let failure = error instanceof Error ? error : new Error("3D 표면 아트를 읽지 못했습니다.");
              try { onAssetError?.(mural.url); }
              catch (reportError) { failure = new Error("3D 표면 아트 오류를 알리지 못했습니다.", { cause: reportError }); }
              fail(failure);
            });
          }
        }, 0);
      });
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop?.(cancelled());
      if (timer !== undefined) { globalThis.clearTimeout(timer); timer = undefined; }
      resetAttached("disposed");
    },
  };
}
