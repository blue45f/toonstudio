/** 실제 표시 backend와 파싱된 재질 variant를 묶는다. GLB 검증의 worker/local 실행 위치와는 별개다. */
import type { StudioMToonMaterialBackend } from "../mesh-materials/studio-mtoon-runtime-identity";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";

export type StudioBg3dMaterialBackend = StudioMToonMaterialBackend;
export interface StudioBg3dMaterialBackendRequest {
  readonly renderer?: StudioBg3dKtx2Renderer | { readonly isWebGLRenderer?: unknown; readonly isWebGPURenderer?: unknown } | null;
  readonly materialBackend?: StudioBg3dMaterialBackend;
}
export function resolveStudioBg3dMaterialBackend(request: StudioBg3dMaterialBackendRequest = {}): StudioBg3dMaterialBackend {
  const declared = request.materialBackend;
  if (declared !== undefined && declared !== "webgl" && declared !== "webgpu") throw new Error("3D 재질의 요청 backend가 올바르지 않습니다.");
  if (request.renderer === null || request.renderer === undefined) return declared ?? "webgl";
  const webgl = "isWebGLRenderer" in request.renderer && request.renderer.isWebGLRenderer === true;
  const webgpu = "isWebGPURenderer" in request.renderer && request.renderer.isWebGPURenderer === true;
  if (webgl === webgpu) throw new Error("3D 재질을 표시할 renderer backend를 명확하게 확인할 수 없습니다.");
  const actual = webgpu ? "webgpu" : "webgl";
  if (declared !== undefined && declared !== actual) throw new Error("3D 재질의 요청 backend와 실제 renderer가 다릅니다.");
  return actual;
}
export function studioBg3dModelRuntimeVariant(backend: StudioBg3dMaterialBackend): string {
  return `studio-bg3d-mtoon/1:${backend}`;
}
export function studioBg3dModelCacheKey(storageId: string, backend: StudioBg3dMaterialBackend): string {
  return JSON.stringify([storageId, studioBg3dModelRuntimeVariant(backend)]);
}

/** UI engine의 webgl2 표기는 동일한 WebGL 재질 계약을 사용한다. 레거시 raw ID는 조회하지 않는다. */
export function readStudioBg3dModelCacheEntry(
  cache: ReadonlyMap<string, StudioBg3dModelRootCacheEntry>, storageId: string, backend: StudioBg3dMaterialBackend | "webgl2" = "webgl",
): StudioBg3dModelRootCacheEntry | undefined {
  const materialBackend = backend === "webgl2" ? "webgl" : backend;
  const entry = cache.get(studioBg3dModelCacheKey(storageId, materialBackend));
  return entry?.runtimeVariant === studioBg3dModelRuntimeVariant(materialBackend) && entry.record.id === storageId ? entry : undefined;
}

function ownedModelCacheKey(storageId: string, expectedEntry: StudioBg3dModelRootCacheEntry): string | undefined {
  if (expectedEntry.record.id !== storageId) return undefined;
  const backend = (["webgl", "webgpu"] as const).find((candidate) => expectedEntry.runtimeVariant === studioBg3dModelRuntimeVariant(candidate));
  return backend === undefined ? undefined : studioBg3dModelCacheKey(storageId, backend);
}

/** dispose 전에 소유권을 읽기 전용으로 검사한다. 실패한 dispose가 cache를 먼저 지우지 않게 한다. */
export function isStudioBg3dOwnedModelCacheEntry(
  cache: ReadonlyMap<string, StudioBg3dModelRootCacheEntry>, storageId: string, expectedEntry: StudioBg3dModelRootCacheEntry,
): boolean {
  const key = ownedModelCacheKey(storageId, expectedEntry);
  return key !== undefined && cache.get(key) === expectedEntry;
}

/** rollback은 자신이 설치한 정확한 variant·객체만 지운다. 다른 요청의 새 root는 보존한다. */
export function deleteStudioBg3dOwnedModelCacheEntry(
  cache: Map<string, StudioBg3dModelRootCacheEntry>, storageId: string, expectedEntry: StudioBg3dModelRootCacheEntry,
): boolean {
  const key = ownedModelCacheKey(storageId, expectedEntry);
  return key !== undefined && isStudioBg3dOwnedModelCacheEntry(cache, storageId, expectedEntry) && cache.delete(key);
}

/** 모델 삭제는 모든 backend 캐시를 떼고 unique 소유 목록을 반환한다. dispose는 호출자가 맡는다. */
export function deleteStudioBg3dModelCacheVariants(
  cache: Map<string, StudioBg3dModelRootCacheEntry>, storageId: string,
): readonly StudioBg3dModelRootCacheEntry[] {
  const removed = new Set<StudioBg3dModelRootCacheEntry>();
  for (const [key, entry] of cache) if (entry.record.id === storageId) { cache.delete(key); removed.add(entry); }
  return [...removed];
}
