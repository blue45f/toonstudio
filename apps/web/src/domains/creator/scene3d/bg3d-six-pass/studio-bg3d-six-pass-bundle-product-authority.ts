import { createStudioOpfsAssetStore, type StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import { createStudioOpfsNativeFileSystem, type StudioOpfsStorageManagerLike } from "../../studio-opfs-filesystem";

export const STUDIO_BG3D_SIX_PASS_BUNDLE_CAS_ROOT = "toonstudio-bg3d-sixpass-bundles-v1";
const INDEX_LOCK = "toonstudio-bg3d-sixpass-bundles-v1:index";

interface BundleLocks {
  request<T>(name: string, options: { readonly mode: "exclusive" }, task: () => Promise<T>): Promise<T>;
}

let pending: Promise<StudioOpfsAssetStore> | null = null;

/** 실제 본문은 기존 CAS로 보관하고, 동일 기기 탭의 색인 쓰기는 Web Locks로 직렬화한다. */
export function acquireStudioBg3dSixPassBundleProductAuthority(): Promise<StudioOpfsAssetStore> {
  pending ??= (async () => {
    const navigatorValue = globalThis.navigator as Navigator & { readonly locks?: BundleLocks };
    const manager = navigatorValue?.storage as StudioOpfsStorageManagerLike | undefined;
    const locks = navigatorValue?.locks;
    if (!locks || !manager || typeof manager.getDirectory !== "function") {
      throw new Error("6패스 묶음을 안전하게 보관하려면 OPFS와 Web Locks가 필요합니다.");
    }
    const estimate = typeof manager.estimate === "function" ? manager.estimate.bind(manager) : null;
    const store = createStudioOpfsAssetStore({
      freshReads: true,
      fs: createStudioOpfsNativeFileSystem(manager, STUDIO_BG3D_SIX_PASS_BUNDLE_CAS_ROOT),
      estimator: estimate ? { estimate } : null,
      mutationRunExclusive: <T>(task: () => Promise<T>) => locks.request(INDEX_LOCK, { mode: "exclusive" }, task),
    });
    await store.list();
    return store;
  })().catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

export async function runStudioBg3dSixPassBundleMutationExclusive<T>(scope: string, task: () => Promise<T>): Promise<T> {
  if (!scope || scope.trim() !== scope || scope.length > 512 || /\p{Cc}/u.test(scope)) {
    throw new Error("6패스 묶음의 문서 범위가 올바르지 않습니다.");
  }
  const navigatorValue = globalThis.navigator as Navigator & { readonly locks?: BundleLocks };
  if (!navigatorValue?.locks) throw new Error("6패스 묶음 문서 전이에 Web Locks가 필요합니다.");
  return navigatorValue.locks.request(`toonstudio-bg3d-sixpass-bundles-v1:document:${encodeURIComponent(scope)}`,
    { mode: "exclusive" }, task);
}
