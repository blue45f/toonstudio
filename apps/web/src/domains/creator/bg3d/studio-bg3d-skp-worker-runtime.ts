/**
 * .skp 변환 런타임 — 실제 openskp 를 불러와 변환 코어를 실행한다.
 *
 * Worker 엔트리와 메인 스레드 폴백이 같은 모듈을 쓴다. openskp 는 동적 import 라 이 모듈을 불러오기
 * 전에는 번들의 lazy 청크도 받지 않는다. 동적 import 자체가 실패할 때(청크 로드 실패 등)에만 정직하게
 * "변환기를 사용할 수 없음"으로 실패하며 가짜 변환이나 조용한 건너뜀은 하지 않는다.
 */

import {
  StudioBg3dSkpConverterUnavailableError,
} from "./studio-bg3d-skp-contract";
import {
  convertStudioBg3dSkpBytes,
  isOpenSkpModuleLike,
  type OpenSkpModuleLike,
  type OpenSkpModuleLoader,
  type StudioBg3dSkpConversionOptions,
  type StudioBg3dSkpConversionOutput,
} from "./studio-bg3d-skp-conversion-core";

async function loadOpenSkpModuleDefault(): Promise<OpenSkpModuleLike> {
  let loaded: unknown;
  try {
    loaded = await import("openskp");
  } catch (error) {
    throw new StudioBg3dSkpConverterUnavailableError(undefined, { cause: error });
  }
  if (!isOpenSkpModuleLike(loaded)) {
    throw new StudioBg3dSkpConverterUnavailableError(
      "openskp 패키지의 변환 API(buildScene/toGLB)를 확인하지 못했습니다.",
      { reason: "converter-api-mismatch" },
    );
  }
  return loaded;
}

let cachedModulePromise: Promise<OpenSkpModuleLike> | null = null;

/** 실제 openskp 로더. 성공한 모듈 로드는 재사용하고, 실패한 로드는 다음 호출에서 다시 시도한다. */
export const loadStudioBg3dOpenSkpModule: OpenSkpModuleLoader = () => {
  cachedModulePromise ??= loadOpenSkpModuleDefault().catch((error: unknown) => {
    cachedModulePromise = null;
    throw error;
  });
  return cachedModulePromise;
};

/** 테스트 전용: 모듈 로더 캐시를 비운다. */
export function resetStudioBg3dSkpModuleCacheForTests(): void {
  cachedModulePromise = null;
}

export type StudioBg3dSkpRuntimeOptions =
  Omit<StudioBg3dSkpConversionOptions, "loadModule"> & { readonly loadModule?: OpenSkpModuleLoader };

/** 변환 코어를 실제 openskp(또는 주입한 로더)로 실행한다. */
export function runStudioBg3dSkpConversion(
  bytes: ArrayBuffer | Uint8Array,
  options: StudioBg3dSkpRuntimeOptions,
): Promise<StudioBg3dSkpConversionOutput> {
  return convertStudioBg3dSkpBytes(bytes, {
    ...options,
    loadModule: options.loadModule ?? loadStudioBg3dOpenSkpModule,
  });
}
