/** GLB의 일반·검증된 소비자가 같은 backend용 MToon parser를 지연 생성한다. */
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { resolveStudioBg3dMaterialBackend, type StudioBg3dMaterialBackendRequest } from "./studio-bg3d-model-material-variant";
import type { StudioBg3dKtx2Renderer, StudioBg3dKtx2RendererRuntime } from "./studio-bg3d-ktx2-renderer-runtime";

export interface CreateStudioBg3dGltfLoaderOptions extends StudioBg3dMaterialBackendRequest {
  /** 기본 경로에서는 실제 LoadingManager만 허용한다. 가짜 로더는 기존 factory 주입구를 사용한다. */
  readonly manager?: unknown;
}
export async function createStudioBg3dGltfLoader(options: CreateStudioBg3dGltfLoaderOptions = {}): Promise<GLTFLoader> {
  const backend = resolveStudioBg3dMaterialBackend(options);
  const [{ GLTFLoader: Loader }, { LoadingManager }, { MToonMaterialLoaderPlugin }, materialType] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three"),
    import("@pixiv/three-vrm"),
    backend === "webgpu"
      ? import("./studio-bg3d-three-webgpu-entry").then(({ MToonNodeMaterial }) => MToonNodeMaterial)
      : import("../mesh-materials/studio-mtoon-webgl-runtime").then(({ StudioMToonMaterial }) => StudioMToonMaterial),
  ]);
  if (options.manager !== undefined && !(options.manager instanceof LoadingManager)) throw new Error("3D 로더의 LoadingManager가 올바르지 않습니다.");
  const loader = new Loader(options.manager);
  loader.register((parser) => new MToonMaterialLoaderPlugin(parser, { materialType }));
  return loader;
}

type VerifiedLoaderResult =
  | { readonly ok: true; readonly loader: GLTFLoader; readonly ktx2Runtime: StudioBg3dKtx2RendererRuntime | null }
  | { readonly ok: false; readonly code: "renderer-unavailable" | "ktx2-renderer-unavailable" | "ktx2-runtime-unavailable" };

/** 필수 KTX2 초기화와 실패 정리 순서는 기존 검증된 loader 계약을 유지한다. */
export async function prepareVerifiedStudioBg3dGltfLoader(options: StudioBg3dMaterialBackendRequest & {
  readonly renderer?: StudioBg3dKtx2Renderer | null;
  readonly requiresBasisTextures: boolean;
}): Promise<VerifiedLoaderResult> {
  const renderer = options.renderer;
  if (options.requiresBasisTextures && !renderer) return { ok: false, code: "ktx2-renderer-unavailable" };
  let runtime: StudioBg3dKtx2RendererRuntime | null = null;
  const disposeRuntime = (): boolean => {
    const owned = runtime; runtime = null;
    if (!owned) return true;
    try { owned.dispose(); return true; } catch { return false; }
  };
  try {
    const base = Promise.all([createStudioBg3dGltfLoader(options), import("./studio-bg3d-meshopt").then(({ loadStudioBg3dMeshoptDecoder }) => loadStudioBg3dMeshoptDecoder())]);
    const ktx2 = options.requiresBasisTextures && renderer
      ? import("./studio-bg3d-ktx2-renderer-runtime").then(({ createStudioBg3dKtx2RendererRuntime }) => createStudioBg3dKtx2RendererRuntime({ renderer }))
      : Promise.resolve(null);
    const [baseResult, ktx2Result] = await Promise.allSettled([base, ktx2]);
    if (ktx2Result.status === "fulfilled") runtime = ktx2Result.value;
    if (baseResult.status === "rejected") { disposeRuntime(); return { ok: false, code: "renderer-unavailable" }; }
    if (ktx2Result.status === "rejected") {
      const reason = ktx2Result.reason;
      return { ok: false, code: reason && typeof reason === "object" && "code" in reason && reason.code === "renderer-unavailable" ? "ktx2-renderer-unavailable" : "ktx2-runtime-unavailable" };
    }
    const [loader, decoder] = baseResult.value;
    loader.setMeshoptDecoder(decoder);
    if (runtime) loader.setKTX2Loader(runtime.loader);
    return { ok: true, loader, ktx2Runtime: runtime };
  } catch {
    disposeRuntime();
    return { ok: false, code: "renderer-unavailable" };
  }
}
