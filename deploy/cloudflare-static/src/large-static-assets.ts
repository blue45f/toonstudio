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
  /**
   * 교차 출처 CORS를 열지 않고, 브라우저가 보낸 `Sec-Fetch-Site`가 동일 출처
   * (`same-origin`)가 아니면 R2에 닿기 전에 403으로 거부하는 경로.
   * 독립 파일 재배포 제한이 있는 구매 번들 에셋(bundle-v2, 권리 원장이 allow한 팩)에 쓴다.
   * 브라우저 경유 핫링크·임베드 억제책일 뿐이다: 헤더를 생략하거나 위조하는 클라이언트
   * (curl·서버 간 호출·이 헤더가 없는 구형 브라우저)는 막지 못하며, 접근 통제도 법적 허락도 아니다.
   * 이 Worker는 권리 원장을 읽지 않는다 — 어떤 팩을 올릴지는 배포 플래너(원장 게이트)가 정하고,
   * Worker는 R2에 올라간 객체를 이 가드로만 제한한다. 권리를 철회(allow → hold)해도 이미 올라간
   * 객체는 R2에서 삭제하기 전까지 계속 서빙된다.
   */
  readonly sameOriginOnly?: boolean;
}

/**
 * Creator Bundle bundle-v2 트리 (bg3d 테마 팩 GLB + 배포 인덱스).
 * 실물은 Static Assets가 아니라 R2에만 있고 Worker가 바인딩으로 서빙한다.
 * 배포 절차와 객체 규칙(sha256 키, 권리 원장이 allow한 팩만)은
 * scripts/plan-creator-bundle-deploy.mjs가 정본이다. 커밋된
 * deploy/cloudflare-static/bundle-v2-deploy-manifest.json은 원장 이전 기록(원본 경로 키)이라
 * 다시 산출하기 전까지 참고용이며, 그 키로는 아무것도 서빙되지 않는다.
 *
 * GLB는 소문자 sha256 hex 64자 키(`<sha256>.glb`)만 서빙한다. 원본 폴더·파일명이 든 옛 경로형 키로
 * 올라간 객체가 R2에 있더라도 Worker가 내주지 않는다 (경로형 URL은 이 파이프라인에 매칭되지 않는다).
 */
export const CLOUDFLARE_BUNDLE_V2_PATH_PREFIX = "/assets/studio/bundle-v2/";
export const CLOUDFLARE_BUNDLE_V2_INDEX_PATH = "/assets/studio/bundle-v2/manifest.json";
export const CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL =
  "public, max-age=300, s-maxage=0";
const BUNDLE_V2_GLB_PATH_PATTERN =
  /^\/assets\/studio\/bundle-v2\/[a-f0-9]{64}\.glb$/u;

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
      sameOriginOnly: true,
    };
  }
  if (BUNDLE_V2_GLB_PATH_PATTERN.test(pathname)) {
    return { contentType: "model/gltf-binary", sameOriginOnly: true };
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
  // 서빙 경로가 곧 R2 키다. bundle-v2는 고정 인덱스 경로와 소문자 hex 키뿐이라 디코드할 조각이 없다.
  return pathname.replace(/^\/+/, "");
}

export function cloudflareLargeAssetSidecarPath(
  pathname: string,
  encoding: CloudflareLargeAssetEncoding,
): string {
  return `${pathname}.${encoding === "br" ? "br" : "gz"}`;
}

/**
 * `sameOriginOnly` 경로의 요청 허용 여부. `Sec-Fetch-Site`는 브라우저만 붙이고
 * 페이지 스크립트는 바꿀 수 없는 헤더다. 헤더가 없으면 허용한다 — 그래서 curl·서버 간 호출뿐
 * 아니라 이 헤더를 보내지 않는 구형 브라우저도 이 가드로는 막지 못한다. 헤더가 있으면
 * `same-origin`만 통과시킨다 (`same-site`·`cross-site`·`none`·알 수 없는 값은 거부).
 */
export function cloudflareSameOriginOnlyAllows(headers: Pick<Headers, "get">): boolean {
  const site = headers.get("sec-fetch-site");
  return site === null || site.trim().toLowerCase() === "same-origin";
}

/*
 * R2 대형 에셋 서빙의 조건부·범위 요청 판정. 게이트웨이 라우팅과 무관한 순수
 * 함수라 대형 파일 배달 모듈에 둔다.
 */
export function matchesIfNoneMatch(request: Request, httpEtag: string): boolean {
  const raw = request.headers.get("if-none-match");
  if (!raw) return false;
  const target = httpEtag.startsWith("W/") ? httpEtag.slice(2) : httpEtag;
  return raw.split(",").some((candidate) => {
    const value = candidate.trim();
    if (value === "*") return true;
    return (value.startsWith("W/") ? value.slice(2) : value) === target;
  });
}

export function r2RangeHeaders(request: Request): Headers | undefined {
  const range = request.headers.get("range");
  return range ? new Headers({ range }) : undefined;
}

export function matchesIfRange(request: Request, httpEtag: string): boolean {
  const raw = request.headers.get("if-range")?.trim();
  if (!raw) return true;
  if (raw.startsWith("W/") || !raw.startsWith('"')) return false;
  return raw === httpEtag;
}
