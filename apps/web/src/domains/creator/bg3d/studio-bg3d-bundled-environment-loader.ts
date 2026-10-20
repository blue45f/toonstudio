import type * as THREE from "three";

import {
  getStudioBg3dEnvironmentAsset,
  type StudioBg3dEnvironmentAsset,
} from "./studio-bg3d-environment-catalog";

const GLB_HEADER_BYTES = 12;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;

export type StudioBg3dBundledEnvironmentLoadFailureCode =
  | "unknown-asset"
  | "fetch-unavailable"
  | "request-failed"
  | "unexpected-response"
  | "byte-size-mismatch"
  | "invalid-glb"
  | "aborted";

export class StudioBg3dBundledEnvironmentLoadError extends Error {
  readonly code: StudioBg3dBundledEnvironmentLoadFailureCode;

  constructor(code: StudioBg3dBundledEnvironmentLoadFailureCode) {
    super(`Studio BG3D bundled environment load failed: ${code}.`);
    this.name = "StudioBg3dBundledEnvironmentLoadError";
    this.code = code;
  }
}

export interface StudioBg3dBundledEnvironmentSource {
  readonly asset: StudioBg3dEnvironmentAsset;
  readonly bytes: Uint8Array;
  readonly mimeType: "model/gltf-binary";
}

type EnvironmentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "headers" | "arrayBuffer">>;

const DEFAULT_MIME = "model/gltf-binary" as const;
const sourcePromiseByAssetId = new Map<string, Promise<StudioBg3dBundledEnvironmentSource>>();

/** Releases deployment bytes after downstream SHA/structure validation succeeds or fails. */
export function releaseStudioBg3dBundledEnvironmentSource(assetId: string): void {
  sourcePromiseByAssetId.delete(assetId);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new StudioBg3dBundledEnvironmentLoadError("aborted");
}

function inspectGlbHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < GLB_HEADER_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === GLB_MAGIC
    && view.getUint32(4, true) === GLB_VERSION
    && view.getUint32(8, true) === bytes.byteLength;
}

async function fetchEnvironmentSource(
  asset: StudioBg3dEnvironmentAsset,
  fetcher: EnvironmentFetch,
): Promise<StudioBg3dBundledEnvironmentSource> {
  let response: Awaited<ReturnType<EnvironmentFetch>>;
  try {
    response = await fetcher(asset.url, {
      cache: "force-cache",
      credentials: "same-origin",
    });
  } catch {
    throw new StudioBg3dBundledEnvironmentLoadError("request-failed");
  }
  if (!response.ok) throw new StudioBg3dBundledEnvironmentLoadError("request-failed");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new StudioBg3dBundledEnvironmentLoadError("unexpected-response");
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength !== asset.byteSize) {
      throw new StudioBg3dBundledEnvironmentLoadError("byte-size-mismatch");
    }
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    throw new StudioBg3dBundledEnvironmentLoadError("request-failed");
  }
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== asset.byteSize) {
    throw new StudioBg3dBundledEnvironmentLoadError("byte-size-mismatch");
  }
  const bytes = new Uint8Array(buffer.slice(0));
  if (!inspectGlbHeader(bytes)) {
    throw new StudioBg3dBundledEnvironmentLoadError("invalid-glb");
  }
  return Object.freeze({ asset, bytes, mimeType: DEFAULT_MIME });
}

/**
 * Fetches only deployment bytes. SHA-256, structure, budget, and renderer admission remain owned
 * by the existing BG3D model-library/GLTF runtime. Default requests are coalesced and retryable;
 * every consumer receives a defensive byte copy so it cannot mutate the cached authority.
 */
export async function loadStudioBg3dBundledEnvironmentSource(
  assetId: string,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: EnvironmentFetch;
  } = {},
): Promise<StudioBg3dBundledEnvironmentSource> {
  throwIfAborted(options.signal);
  const asset = getStudioBg3dEnvironmentAsset(assetId);
  if (!asset) throw new StudioBg3dBundledEnvironmentLoadError("unknown-asset");
  const injectedFetcher = options.fetcher;
  const defaultFetch = globalThis.fetch;
  if (!injectedFetcher && typeof defaultFetch !== "function") {
    throw new StudioBg3dBundledEnvironmentLoadError("fetch-unavailable");
  }
  const fetcher: EnvironmentFetch = injectedFetcher
    ?? ((input, init) => defaultFetch.call(globalThis, input, init));
  let pending: Promise<StudioBg3dBundledEnvironmentSource>;
  if (injectedFetcher) {
    pending = fetchEnvironmentSource(asset, fetcher);
  } else {
    const existing = sourcePromiseByAssetId.get(asset.id);
    if (existing) pending = existing;
    else {
      pending = fetchEnvironmentSource(asset, fetcher);
      sourcePromiseByAssetId.set(asset.id, pending);
      void pending.catch(() => {
        if (sourcePromiseByAssetId.get(asset.id) === pending) {
          sourcePromiseByAssetId.delete(asset.id);
        }
      });
    }
  }
  const source = await pending;
  throwIfAborted(options.signal);
  return Object.freeze({
    asset: source.asset,
    bytes: Uint8Array.from(source.bytes),
    mimeType: DEFAULT_MIME,
  });
}

/* ── 매니페스트 v2 디스크립터 기반 다포맷 환경 로드 (신규 경로) ─────────────────────
   위쪽의 기존 경로는 카탈로그 GLB 바이트를 fetch해 검증 파이프라인(model-library →
   검증 → admission)으로 넘기는 전용 경로이며 여기서 한 줄도 바꾸지 않는다.
   아래 신규 경로는 매니페스트 v2 소비 모듈(studio-bundle-manifest-v2.ts)이 만든
   로드 디스크립터를 통합 로더(studio-bg3d-model-loader.ts)로 여는 별도 경로다.
   디스크립터 타입을 이 파일이 자체 선언하는 이유: 매니페스트 모듈을 여기서 import하면
   소비 모듈 ↔ 로더 모듈 간 순환이 생길 수 있어, 구조적으로 호환되는 최소 형태만
   선언하고 실제 디스크립터 객체를 그대로 받는다 (structural typing). */

/** 매니페스트 v2 로드 디스크립터와 구조 호환되는 최소 형태 (자체 선언). */
export interface StudioBg3dBundledEnvironmentModelDescriptor {
  readonly format: "glb" | "gltf" | "fbx" | "obj" | "dae";
  readonly primaryUrl: string;
  readonly baseUrl?: string;
  readonly resolveDependency?: (relativePath: string) => string | null | undefined;
}

export interface StudioBg3dBundledEnvironmentModelOptions {
  readonly signal?: AbortSignal;
  /** OBJ 디스크립터와 함께 서빙되는 MTL의 URL. */
  readonly mtlUrl?: string;
}

/**
 * 매니페스트 v2 디스크립터가 가리키는 환경 모델을 통합 로더로 열어 Object3D 루트를
 * 반환한다. 기존 GLB 검증 경로와 달리 이 경로는 매니페스트가 서빙하는 신뢰 에셋 전용
 * 이며, 바이트 검증·admission을 거치지 않는다 (설계 §3-1의 경계 — 사용자 업로드에는
 * 이 경로를 쓰지 않는다). blend 같은 런타임 불가 포맷은 디스크립터 타입 단계에서
 * 이미 걸러지므로 여기로 들어오지 않는다.
 */
export async function loadStudioBg3dBundledEnvironmentModelFromDescriptor(
  descriptor: StudioBg3dBundledEnvironmentModelDescriptor,
  options: StudioBg3dBundledEnvironmentModelOptions = {},
): Promise<THREE.Object3D> {
  throwIfAborted(options.signal);
  const { loadStudioBg3dModelByFormat } = await import("./studio-bg3d-model-loader");
  const root = await loadStudioBg3dModelByFormat(
    { url: descriptor.primaryUrl, format: descriptor.format },
    {
      baseUrl: descriptor.baseUrl,
      resolveDependency: descriptor.resolveDependency,
      mtlUrl: options.mtlUrl,
      signal: options.signal,
    },
  );
  throwIfAborted(options.signal);
  return root;
}
