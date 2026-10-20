import type * as THREE from "three";

import type { StudioBg3dMeshoptDecoder } from "./studio-bg3d-meshopt";

/**
 * 웹 bg3d 런타임 통합 모델 로더 (설계: asset-multiformat-native-support-design-20261020 §2·§5-2).
 *
 * 매니페스트 v2로 서빙되는 "신뢰 에셋"(Creator Bundle 등 배포 에셋)을 원본 포맷 그대로
 * three.js 로더로 여는 단일 진입점이다. 사용자 업로드의 저장·검증·admission 층
 * (GLB 전용, studio-bg3d-glb-validation / model-runtime-admission)과는 별개 경로이며,
 * 그 층을 우회하지 않는다 (설계 §3-1).
 *
 * 규약:
 * - 로더는 전부 `three/examples/jsm/loaders/*.js` 동적 import로 늦게 불러온다.
 * - GLTFLoader에는 기존 `loadStudioBg3dMeshoptDecoder()` 디코더를 그대로 건다.
 * - DRACO 디코더는 걸지 않는다 (설계 §2 — 미도입이 확정 정책).
 * - OBJ 직접 경로는 매니페스트로 서빙되는 신뢰 에셋 전용이다. 사용자 업로드 OBJ의
 *   정본은 Worker IR 파이프라인(studio-bg3d-obj-worker-runtime → hydrator)이며,
 *   이 모듈의 OBJLoader 직접 파싱으로 대체하지 않는다 (설계 §3-3).
 *
 * 테스트 가능성: three 패키지가 없는 환경에서도 단위 테스트가 돌도록, 실제 로더 생성은
 * 전부 `options.loaders` 팩토리 주입구 뒤에 있다. 기본 팩토리가 동적 import를 수행하고,
 * 테스트는 가짜 로더를 주입해 분기·URL 해석·포맷 판정만 검증한다. 이 모듈 자체는
 * type-only import 외에 어떤 정적 런타임 import도 하지 않는다.
 */

export const STUDIO_BG3D_MODEL_FORMATS = ["glb", "gltf", "fbx", "obj", "dae"] as const;

export type StudioBg3dModelFormat = (typeof STUDIO_BG3D_MODEL_FORMATS)[number];

const MODEL_FORMATS: ReadonlySet<string> = new Set(STUDIO_BG3D_MODEL_FORMATS);

export function isStudioBg3dModelFormat(value: unknown): value is StudioBg3dModelFormat {
  return typeof value === "string" && MODEL_FORMATS.has(value);
}

/**
 * 파일명·URL·확장자 문자열에서 포맷을 판정한다. 쿼리/프래그먼트를 떼고 마지막 확장자만
 * 본다. 판정할 수 없으면 null (호출자가 명시 포맷을 주거나 실패로 처리한다).
 */
export function detectStudioBg3dModelFormat(value: string | null | undefined): StudioBg3dModelFormat | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const pathOnly = value.split(/[?#]/u, 1)[0] ?? "";
  const match = /\.([a-z0-9]+)$/iu.exec(pathOnly.trim());
  if (!match) return null;
  const extension = match[1]!.toLowerCase();
  return isStudioBg3dModelFormat(extension) ? extension : null;
}

/* ── 로더 구조 타입 (three 인스턴스를 만들지 않고도 가짜 로더를 주입할 수 있게 최소 형태만 선언) ── */

export interface StudioBg3dGltfLoaderLike {
  setMeshoptDecoder?: (decoder: StudioBg3dMeshoptDecoder) => unknown;
  loadAsync: (url: string) => Promise<{ readonly scene: THREE.Object3D }>;
  parseAsync: (
    data: ArrayBuffer | string,
    path: string,
  ) => Promise<{ readonly scene: THREE.Object3D }>;
}

export interface StudioBg3dFbxLoaderLike {
  loadAsync: (url: string) => Promise<THREE.Object3D>;
  parse: (data: ArrayBuffer, path: string) => THREE.Object3D;
}

export interface StudioBg3dMtlCreatorLike {
  preload: () => void;
}

export interface StudioBg3dObjLoaderLike {
  setMaterials?: (materials: StudioBg3dMtlCreatorLike) => unknown;
  loadAsync: (url: string) => Promise<THREE.Object3D>;
  parse: (text: string) => THREE.Object3D;
}

export interface StudioBg3dMtlLoaderLike {
  loadAsync: (url: string) => Promise<StudioBg3dMtlCreatorLike>;
  parse: (text: string, path: string) => StudioBg3dMtlCreatorLike;
}

export interface StudioBg3dColladaLoaderLike {
  loadAsync: (url: string) => Promise<{ readonly scene: THREE.Object3D }>;
  parse: (text: string, path: string) => { readonly scene: THREE.Object3D };
}

export interface StudioBg3dLoadingManagerLike {
  setURLModifier?: (modifier: (url: string) => string) => void;
}

/** 로더 팩토리 주입구. 기본값은 전부 동적 import 기반 실제 three 로더다. */
export interface StudioBg3dModelLoaderFactories {
  readonly createLoadingManager?: () =>
    | StudioBg3dLoadingManagerLike
    | Promise<StudioBg3dLoadingManagerLike>;
  readonly createGLTFLoader?: (
    manager: StudioBg3dLoadingManagerLike | undefined,
  ) => StudioBg3dGltfLoaderLike | Promise<StudioBg3dGltfLoaderLike>;
  readonly createFBXLoader?: (
    manager: StudioBg3dLoadingManagerLike | undefined,
  ) => StudioBg3dFbxLoaderLike | Promise<StudioBg3dFbxLoaderLike>;
  readonly createOBJLoader?: (
    manager: StudioBg3dLoadingManagerLike | undefined,
  ) => StudioBg3dObjLoaderLike | Promise<StudioBg3dObjLoaderLike>;
  readonly createMTLLoader?: (
    manager: StudioBg3dLoadingManagerLike | undefined,
  ) => StudioBg3dMtlLoaderLike | Promise<StudioBg3dMtlLoaderLike>;
  readonly createColladaLoader?: (
    manager: StudioBg3dLoadingManagerLike | undefined,
  ) => StudioBg3dColladaLoaderLike | Promise<StudioBg3dColladaLoaderLike>;
}

export type StudioBg3dModelLoadInput =
  | {
      readonly url: string;
      readonly format?: StudioBg3dModelFormat;
      readonly baseUrl?: string;
    }
  | {
      readonly data: ArrayBuffer | Uint8Array | string;
      readonly format?: StudioBg3dModelFormat;
      /** 다파일 gltf의 의존 파일 해석 기준 경로. 로더의 resourcePath와 URL modifier 기준이 된다. */
      readonly baseUrl?: string;
      /** 포맷을 확장자로 판정할 때 쓸 원본 파일명 (format이 없을 때만 사용). */
      readonly name?: string;
    };

export interface StudioBg3dModelLoadOptions {
  /** input.format보다 우선하는 명시 포맷. */
  readonly format?: StudioBg3dModelFormat;
  /** 의존 파일(.bin·텍스처·.mtl 등) 상대 참조를 붙일 기준 URL. input.baseUrl보다 우선한다. */
  readonly baseUrl?: string;
  /**
   * 의존 파일 상대 경로를 실제 서빙 URL로 바꾸는 콜백. baseUrl 결합보다 우선한다.
   * 매니페스트 v2 디스크립터의 resolveDependency가 이 자리로 들어온다.
   */
  readonly resolveDependency?: (relativePath: string) => string | null | undefined;
  readonly loaders?: StudioBg3dModelLoaderFactories;
  /** Meshopt 디코더 로더 주입구. 기본값은 기존 loadStudioBg3dMeshoptDecoder 동적 import. */
  readonly loadMeshoptDecoder?: () => Promise<StudioBg3dMeshoptDecoder>;
  /** 이미 준비된 Meshopt 디코더. 있으면 loadMeshoptDecoder를 부르지 않는다. */
  readonly meshoptDecoder?: StudioBg3dMeshoptDecoder;
  /** OBJ와 함께 쓸 MTL의 URL. mtlText가 있으면 그쪽이 우선한다. */
  readonly mtlUrl?: string;
  /** OBJ와 함께 쓸 MTL 원문 텍스트 (data 입력 경로용). */
  readonly mtlText?: string;
  readonly signal?: AbortSignal;
}

/* ── URL 해석 ─────────────────────────────────────────────────────────────── */

const ABSOLUTE_OR_SCHEME_URL = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|\/)/u;

/** baseUrl + 상대 경로를 "."·".." 구간까지 정규화해 결합한다 (서빙 폴더 구조 보존용). */
export function joinStudioBg3dModelUrl(baseUrl: string, relativePath: string): string {
  if (ABSOLUTE_OR_SCHEME_URL.test(relativePath)) return relativePath;
  const joined = baseUrl.endsWith("/") ? baseUrl + relativePath : `${baseUrl}/${relativePath}`;
  const schemePrefix = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//u.exec(joined)?.[0] ?? "";
  const rest = joined.slice(schemePrefix.length);
  const anchored = rest.startsWith("/");
  const segments: string[] = [];
  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
      else if (!anchored && schemePrefix.length === 0) segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  return schemePrefix + (anchored ? "/" : "") + segments.join("/");
}

/**
 * 로더가 요청한 의존 파일 URL을 실제 서빙 URL로 바꾼다.
 * 절대 URL·스킴 URL·절대 경로는 그대로 두고, 상대 참조만 resolveDependency → baseUrl
 * 결합 순으로 해석한다. LoadingManager.setURLModifier에 그대로 걸 수 있는 형태다.
 */
export function resolveStudioBg3dModelDependencyUrl(
  url: string,
  options: {
    readonly baseUrl?: string;
    readonly resolveDependency?: (relativePath: string) => string | null | undefined;
  } = {},
): string {
  if (!url || ABSOLUTE_OR_SCHEME_URL.test(url)) return url;
  const relativePath = url.replace(/^\.\//u, "");
  if (options.resolveDependency) {
    const resolved = options.resolveDependency(relativePath);
    if (typeof resolved === "string" && resolved.length > 0) return resolved;
  }
  if (options.baseUrl) return joinStudioBg3dModelUrl(options.baseUrl, relativePath);
  return url;
}

/* ── 기본 팩토리 (동적 import) ─────────────────────────────────────────────── */

async function defaultCreateLoadingManager(): Promise<StudioBg3dLoadingManagerLike> {
  const { LoadingManager } = await import("three");
  return new LoadingManager() as StudioBg3dLoadingManagerLike;
}

async function defaultLoadMeshoptDecoder(): Promise<StudioBg3dMeshoptDecoder> {
  const { loadStudioBg3dMeshoptDecoder } = await import("./studio-bg3d-meshopt");
  return loadStudioBg3dMeshoptDecoder();
}

const DEFAULT_FACTORIES: Required<StudioBg3dModelLoaderFactories> = {
  createLoadingManager: defaultCreateLoadingManager,
  createGLTFLoader: async (manager) => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    return new GLTFLoader(manager as never) as unknown as StudioBg3dGltfLoaderLike;
  },
  createFBXLoader: async (manager) => {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    return new FBXLoader(manager as never) as unknown as StudioBg3dFbxLoaderLike;
  },
  createOBJLoader: async (manager) => {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return new OBJLoader(manager as never) as unknown as StudioBg3dObjLoaderLike;
  },
  createMTLLoader: async (manager) => {
    const { MTLLoader } = await import("three/examples/jsm/loaders/MTLLoader.js");
    return new MTLLoader(manager as never) as unknown as StudioBg3dMtlLoaderLike;
  },
  createColladaLoader: async (manager) => {
    const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
    return new ColladaLoader(manager as never) as unknown as StudioBg3dColladaLoaderLike;
  },
};

/* ── 내부 헬퍼 ────────────────────────────────────────────────────────────── */

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Studio BG3D model load aborted.");
  error.name = "AbortError";
  throw error;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array | string): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (typeof data === "string") {
    const encoded = new TextEncoder().encode(data);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function toText(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === "string") return data;
  return new TextDecoder().decode(data);
}

function resolveFormat(
  input: StudioBg3dModelLoadInput,
  options: StudioBg3dModelLoadOptions,
): StudioBg3dModelFormat {
  const explicit = options.format ?? input.format;
  if (explicit !== undefined) {
    if (!isStudioBg3dModelFormat(explicit)) {
      throw new TypeError(`지원하지 않는 3D 모델 포맷입니다: ${String(explicit)}`);
    }
    return explicit;
  }
  const detected = "url" in input
    ? detectStudioBg3dModelFormat(input.url)
    : detectStudioBg3dModelFormat(input.name);
  if (!detected) {
    throw new TypeError("3D 모델 포맷을 판정할 수 없습니다. format을 명시해 주세요.");
  }
  return detected;
}

async function prepareManager(
  input: StudioBg3dModelLoadInput,
  options: StudioBg3dModelLoadOptions,
  factories: StudioBg3dModelLoaderFactories,
): Promise<StudioBg3dLoadingManagerLike | undefined> {
  const baseUrl = options.baseUrl ?? input.baseUrl;
  const needsManager = Boolean(
    baseUrl || options.resolveDependency || factories.createLoadingManager,
  );
  if (!needsManager) return undefined;
  const manager = await (factories.createLoadingManager ?? DEFAULT_FACTORIES.createLoadingManager)();
  if (manager && typeof manager.setURLModifier === "function"
    && (baseUrl || options.resolveDependency)) {
    manager.setURLModifier((url) => resolveStudioBg3dModelDependencyUrl(url, {
      baseUrl,
      resolveDependency: options.resolveDependency,
    }));
  }
  return manager;
}

async function applyMeshoptDecoder(
  loader: StudioBg3dGltfLoaderLike,
  options: StudioBg3dModelLoadOptions,
): Promise<void> {
  if (typeof loader.setMeshoptDecoder !== "function") return;
  const decoder = options.meshoptDecoder
    ?? await (options.loadMeshoptDecoder ?? defaultLoadMeshoptDecoder)();
  loader.setMeshoptDecoder(decoder);
}

/* ── 진입점 ───────────────────────────────────────────────────────────────── */

/**
 * 포맷별 three.js 로더로 모델을 열어 THREE.Object3D 루트를 반환한다.
 * glTF는 .scene, FBX·OBJ는 로더가 만든 루트, DAE는 .scene을 반환한다 (레거시
 * loadBg3dCustomModelFromBlob의 반환 형태와 동일). 애니메이션 클립은 FBX·DAE처럼
 * 루트에 붙는 포맷은 root.animations로, glTF는 이 진입점이 장면만 반환하므로
 * 필요하면 GLTFLoader를 직접 써야 한다 (레거시 경로도 클립을 버렸다).
 */
export async function loadStudioBg3dModelByFormat(
  input: StudioBg3dModelLoadInput,
  options: StudioBg3dModelLoadOptions = {},
): Promise<THREE.Object3D> {
  throwIfAborted(options.signal);
  const format = resolveFormat(input, options);
  const factories = options.loaders ?? {};
  const manager = await prepareManager(input, options, factories);
  const baseUrl = options.baseUrl ?? input.baseUrl;
  // GLTFLoader.parseAsync·FBXLoader.parse·ColladaLoader.parse의 resourcePath는
  // 의존 파일 상대 참조의 기준 경로다. 매니저 URL modifier와 함께 이중으로 건다.
  const resourcePath = baseUrl ?? "";
  throwIfAborted(options.signal);

  if (format === "glb" || format === "gltf") {
    const loader = await (factories.createGLTFLoader ?? DEFAULT_FACTORIES.createGLTFLoader)(manager);
    await applyMeshoptDecoder(loader, options);
    throwIfAborted(options.signal);
    if ("url" in input) {
      const gltf = await loader.loadAsync(input.url);
      throwIfAborted(options.signal);
      return gltf.scene;
    }
    const data = typeof input.data === "string" ? input.data : toArrayBuffer(input.data);
    const gltf = await loader.parseAsync(data, resourcePath);
    throwIfAborted(options.signal);
    return gltf.scene;
  }

  if (format === "fbx") {
    const loader = await (factories.createFBXLoader ?? DEFAULT_FACTORIES.createFBXLoader)(manager);
    throwIfAborted(options.signal);
    if ("url" in input) {
      const root = await loader.loadAsync(input.url);
      throwIfAborted(options.signal);
      return root;
    }
    const root = loader.parse(toArrayBuffer(input.data), resourcePath);
    throwIfAborted(options.signal);
    return root;
  }

  if (format === "obj") {
    // 신뢰 에셋 전용 직접 경로 (파일 머리 주석 참조). MTL은 mtlText/mtlUrl이 있을 때만
    // MTLLoader로 해석해 붙인다 — 없으면 재질 없는 OBJ로 열고, 폴백 재질 같은 후처리는
    // 호출자(레거시 래퍼 등)가 맡는다.
    const objLoader = await (factories.createOBJLoader ?? DEFAULT_FACTORIES.createOBJLoader)(manager);
    if (typeof objLoader.setMaterials === "function"
      && (options.mtlText !== undefined || options.mtlUrl !== undefined)) {
      const mtlLoader = await (factories.createMTLLoader ?? DEFAULT_FACTORIES.createMTLLoader)(manager);
      const creator = options.mtlText !== undefined
        ? mtlLoader.parse(options.mtlText, resourcePath)
        : await mtlLoader.loadAsync(options.mtlUrl!);
      creator.preload();
      objLoader.setMaterials(creator);
    }
    throwIfAborted(options.signal);
    if ("url" in input) {
      const root = await objLoader.loadAsync(input.url);
      throwIfAborted(options.signal);
      return root;
    }
    const root = objLoader.parse(toText(input.data));
    throwIfAborted(options.signal);
    return root;
  }

  // format === "dae"
  const loader = await (factories.createColladaLoader ?? DEFAULT_FACTORIES.createColladaLoader)(manager);
  throwIfAborted(options.signal);
  if ("url" in input) {
    const collada = await loader.loadAsync(input.url);
    throwIfAborted(options.signal);
    return collada.scene;
  }
  const collada = loader.parse(toText(input.data), resourcePath);
  throwIfAborted(options.signal);
  return collada.scene;
}
