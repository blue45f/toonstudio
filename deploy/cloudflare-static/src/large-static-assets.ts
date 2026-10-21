export const CLOUDFLARE_STATIC_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CLOUDFLARE_R2_LARGE_ASSET_BUCKET = "toonspectrum-public-assets";
export const CLOUDFLARE_R2_LARGE_ASSET_BINDING = "LARGE_ASSETS";
export const CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable, s-maxage=0";

export const CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS = [
  "assets/opencascade.wasm-*.wasm",
  "assets/ort-wasm-simd-threaded.jsep-*.wasm",
  "assets/ort-wasm-simd-threaded.asyncify-*.wasm",
  "assets/tag2pix-*.onnx",
  "assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
  "brand/toonstudio-product-tour.mp4",
] as const;

export const CLOUDFLARE_LARGE_ASSET_ENCODINGS = ["br", "gzip"] as const;
export type CloudflareLargeAssetEncoding =
  (typeof CLOUDFLARE_LARGE_ASSET_ENCODINGS)[number];

export interface CloudflareLargeAssetDescriptor {
  readonly contentType: string;
  /**
   * 경로별 캐시 정책이 기본(immutable 1년)과 다를 때만 지정한다.
   * bundle-v2 배포 인덱스는 재배포 판정 신호라 짧게 둔다.
   */
  readonly cacheControl?: string;
}

/**
 * Creator Bundle bundle-v2 트리 (bg3d 테마 팩 GLB + 배포 인덱스).
 * 실물은 Static Assets가 아니라 R2에만 있고 Worker가 바인딩으로 서빙한다.
 * 배포 절차와 객체 목록은 scripts/plan-creator-bundle-deploy.mjs와
 * deploy/cloudflare-static/bundle-v2-deploy-manifest.json이 정본이다.
 */
export const CLOUDFLARE_BUNDLE_V2_PATH_PREFIX = "/assets/studio/bundle-v2/";
export const CLOUDFLARE_BUNDLE_V2_INDEX_PATH = "/assets/studio/bundle-v2/manifest.json";
export const CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL =
  "public, max-age=300, s-maxage=0";
const BUNDLE_V2_GLB_PATH_PATTERN =
  /^\/assets\/studio\/bundle-v2\/.+\.glb$/u;

const MODULAR_STREET_SEATING_PATH =
  "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb";
const PRODUCT_TOUR_PATH = "/brand/toonstudio-product-tour.mp4";
const OPENCASCADE_PATH_PATTERN =
  /^\/assets\/opencascade\.wasm-[A-Za-z0-9_-]+\.wasm$/u;
const ORT_JSEP_WASM_PATH_PATTERN =
  /^\/assets\/ort-wasm-simd-threaded\.jsep-[A-Za-z0-9_-]+\.wasm$/u;
const ORT_ASYNCIFY_WASM_PATH_PATTERN =
  /^\/assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u;
const TAG2PIX_MODEL_PATH_PATTERN = /^\/assets\/tag2pix-[A-Za-z0-9_-]+\.onnx$/u;

export function cloudflareLargeAssetDescriptor(
  pathname: string,
): CloudflareLargeAssetDescriptor | null {
  if (pathname === MODULAR_STREET_SEATING_PATH) {
    return { contentType: "model/gltf-binary" };
  }
  if (pathname === PRODUCT_TOUR_PATH) {
    return { contentType: "video/mp4" };
  }
  if (OPENCASCADE_PATH_PATTERN.test(pathname)) {
    return { contentType: "application/wasm" };
  }
  if (ORT_JSEP_WASM_PATH_PATTERN.test(pathname) || ORT_ASYNCIFY_WASM_PATH_PATTERN.test(pathname)) {
    return { contentType: "application/wasm" };
  }
  if (TAG2PIX_MODEL_PATH_PATTERN.test(pathname)) {
    return { contentType: "application/octet-stream" };
  }
  if (pathname === CLOUDFLARE_BUNDLE_V2_INDEX_PATH) {
    return {
      contentType: "application/json",
      cacheControl: CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL,
    };
  }
  if (BUNDLE_V2_GLB_PATH_PATTERN.test(pathname)) {
    return { contentType: "model/gltf-binary" };
  }
  return null;
}

export function isCloudflareOversizedAssetPath(pathname: string): boolean {
  return cloudflareLargeAssetDescriptor(pathname) !== null;
}

export function supportsCloudflareStaticSidecar(pathname: string): boolean {
  // Tag2Pix is a 79 MB ONNX graph whose Brotli sidecar is still ~73 MB, so a
  // compressed Static Assets copy cannot exist. R2 is its only authority, the
  // same arrangement the product tour video already uses.
  if (TAG2PIX_MODEL_PATH_PATTERN.test(pathname)) return false;
  // bundle-v2도 R2가 유일한 원본이다. dist에 우연히 섞여도 sidecar를 만들지
  // 않는다 (배포는 plan-creator-bundle-deploy.mjs 경로로만 한다).
  if (pathname.startsWith(CLOUDFLARE_BUNDLE_V2_PATH_PREFIX)) return false;
  return pathname !== PRODUCT_TOUR_PATH && isCloudflareOversizedAssetPath(pathname);
}

export function cloudflareLargeAssetKey(pathname: string): string | null {
  if (!cloudflareLargeAssetDescriptor(pathname)) return null;
  const key = pathname.replace(/^\/+/, "");
  if (!pathname.startsWith(CLOUDFLARE_BUNDLE_V2_PATH_PREFIX)) return key;
  // bundle-v2 파일명에는 공백·`+`·`&`가 있어 요청 URL에서는 퍼센트 인코딩돼
  // 도착한다. R2 키는 업로드 시 쓴 디코드된 원문 경로와 같아야 하므로
  // 조각마다 디코드한다. 깨진 인코딩이나 디코드 후 경로 탈출은 키 없음으로
  // 거부한다 (서빙 측은 R2 miss → LARGE_ASSET_UNAVAILABLE로 정직하게 실패).
  const segments: string[] = [];
  for (const segment of key.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === "" || decoded === "." || decoded === ".." || decoded.includes("/")) {
      return null;
    }
    segments.push(decoded);
  }
  return segments.join("/");
}

export function cloudflareLargeAssetSidecarPath(
  pathname: string,
  encoding: CloudflareLargeAssetEncoding,
): string {
  return `${pathname}.${encoding === "br" ? "br" : "gz"}`;
}
