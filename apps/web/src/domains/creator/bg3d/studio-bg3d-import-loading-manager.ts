import { importError, throwIfAborted } from "./studio-bg3d-model-import-shared";

import type { LoadingManager } from "three";

export interface StudioBg3dTrackedLoadingManager {
  readonly manager: LoadingManager;
  waitForIdle(signal?: AbortSignal): Promise<void>;
}

/** URL 해석 단계의 동기 예외도 Three의 선택적 텍스처 실패에 묻히지 않게 보관한다. */
export async function createStudioBg3dTrackedLoadingManager(
  resolver: { readonly urlForUri: (uri: string) => string },
): Promise<StudioBg3dTrackedLoadingManager> {
  const { LoadingManager: Manager } = await import("three");
  const manager = new Manager();
  let started = false;
  let settled = false;
  let failure: { readonly reason: unknown } | undefined;
  let settle: (() => void) | undefined;
  let idle: Promise<void> = Promise.resolve();
  const rememberFailure = (reason: unknown): void => {
    failure ??= { reason };
    settled = true;
    settle?.();
  };
  const assertNoFailure = (): void => { if (failure) throw failure.reason; };
  manager.setURLModifier((uri) => {
    try {
      return resolver.urlForUri(uri);
    } catch (error) {
      rememberFailure(error);
      throw error;
    }
  });
  manager.onStart = () => {
    started = true;
    settled = false;
    idle = new Promise<void>((resolve) => { settle = resolve; });
  };
  manager.onLoad = () => { settled = true; settle?.(); };
  manager.onError = () => { rememberFailure(importError("missing-resource")); };
  return {
    manager,
    async waitForIdle(signal) {
      throwIfAborted(signal);
      await Promise.resolve();
      throwIfAborted(signal);
      assertNoFailure();
      if (!started || settled) return;
      await new Promise<void>((resolve, reject) => {
        const handleAbort = (): void => {
          signal?.removeEventListener("abort", handleAbort);
          reject(importError("aborted"));
        };
        signal?.addEventListener("abort", handleAbort, { once: true });
        if (signal?.aborted) handleAbort();
        void idle.then(() => {
          signal?.removeEventListener("abort", handleAbort);
          resolve();
        });
      });
      throwIfAborted(signal);
      assertNoFailure();
    },
  };
}
