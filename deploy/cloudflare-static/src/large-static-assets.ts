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

/**
 * R2로 옮긴 대용량 바이너리 미디어(2026-10-23). Static Assets 무료 한도(배포당 파일 20,000개)를
 * 넘지 않게, 3D 모델·캐릭터·텍스처를 R2에 두고 Worker가 같은 경로로 서빙한다. 서빙 경로가 곧 R2
 * 키라 앱 코드·CSP·DNS는 바뀌지 않는다. JSON 매니페스트·라이선스 텍스트는 경로별 헤더 규칙이 있어
 * Static Assets에 남는다. R2에 객체가 없으면 Static Assets로 폴백한다(단계 이관·롤백 안전망).
 */
export const CLOUDFLARE_R2_MEDIA_PREFIXES = [
  "/assets/studio/cc0-20260906/",
  "/assets/virtual-studio/",
  "/assets/3d/",
  "/vrm/",
] as const;
const R2_MEDIA_CONTENT_TYPES: Readonly<Record<string, string>> = {
  glb: "model/gltf-binary",
  vrm: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  hdr: "image/vnd.radiance",
  ogg: "audio/ogg",
};
/** Static Assets 시절 `/assets/*`·`/vrm/*` 헤더 규칙과 같은 캐시 정책(엣지 캐시를 막지 않는다). */
export const CLOUDFLARE_R2_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
// 인코딩이 필요 없는 경로만 R2로 보낸다(이관 대상 7,159개 전부 해당). 그 밖의 문자는 Static Assets가 처리한다.
const R2_MEDIA_SAFE_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]+$/u;

/** `.assetsignore`에 더해 Static Assets 업로드에서 빼는 패턴. R2 동기화가 끝난 뒤에만 배포된다. */
export const CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS = CLOUDFLARE_R2_MEDIA_PREFIXES.flatMap(
  (prefix) => Object.keys(R2_MEDIA_CONTENT_TYPES).map((extension) => `${prefix.slice(1)}**/*.${extension}`),
);

export const CLOUDFLARE_LARGE_ASSET_ENCODINGS = ["br", "gzip"] as const;
export type CloudflareLargeAssetEncoding =
  (typeof CLOUDFLARE_LARGE_ASSET_ENCODINGS)[number];

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface R2ObjectBinding {
  readonly size: number;
  readonly httpEtag: string;
  readonly range?: { readonly offset: number; readonly length: number };
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ObjectBodyBinding extends R2ObjectBinding {
  readonly body: ReadableStream<Uint8Array>;
}

export interface R2BucketBinding {
  get(
    key: string,
    options?: { readonly range?: Headers },
  ): Promise<R2ObjectBodyBinding | null>;
  head(key: string): Promise<R2ObjectBinding | null>;
}

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
  /** R2에 없으면 Static Assets로 폴백하는 미디어 경로(`CLOUDFLARE_R2_MEDIA_PREFIXES`). */
  readonly staticFallback?: boolean;
  /**
   * Static Assets의 `/assets/*` 규칙처럼 교차 출처 읽기를 열지 않는다: CORS 헤더 없이
   * `Cross-Origin-Resource-Policy: same-origin`을 붙인다. 라이선스 팩이 섞인 미디어를
   * R2로 옮겨도 핫링크 억제 수준이 그대로 유지된다.
   */
  readonly sameOriginResource?: boolean;
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
  return cloudflareR2MediaDescriptor(pathname);
}

export function cloudflareR2MediaDescriptor(
  pathname: string,
): CloudflareLargeAssetDescriptor | null {
  if (!R2_MEDIA_SAFE_PATH_PATTERN.test(pathname) || pathname.includes("/../") || pathname.includes("//")) {
    return null;
  }
  if (!CLOUDFLARE_R2_MEDIA_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  const contentType = R2_MEDIA_CONTENT_TYPES[pathname.slice(pathname.lastIndexOf(".") + 1).toLowerCase()];
  if (!contentType) return null;
  return {
    contentType,
    cacheControl: CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
    staticFallback: true,
    sameOriginResource: pathname.startsWith("/assets/"),
  };
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
  // R2 미디어 이관 대상은 Static Assets에 올라가지 않으니 압축 사본도 만들지 않는다.
  // 단 25 MiB를 넘어 이관 전부터 명시 등록된 경로(모듈러 벤치)는 기존 계약대로 사본을 둔다.
  if (pathname !== MODULAR_STREET_SEATING_PATH && cloudflareR2MediaDescriptor(pathname)) return false;
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

/**
 * R2 객체 응답 헤더. 대형 에셋은 교차 출처 읽기를 열고(CORS), 동일 출처 리소스(미디어 `/assets/*`)는
 * Static Assets 규칙처럼 `Cross-Origin-Resource-Policy: same-origin`으로 닫는다. 구매 번들
 * (`sameOriginOnly`)은 CORS 없이 `Vary: Sec-Fetch-Site`만 붙인다.
 */
export function r2AssetResponseHeaders(
  object: R2ObjectBinding,
  descriptor: CloudflareLargeAssetDescriptor,
  partial: boolean,
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", descriptor.contentType);
  headers.set("cache-control", descriptor.cacheControl ?? CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  if (descriptor.sameOriginOnly) {
    headers.append("vary", "Sec-Fetch-Site");
  } else if (descriptor.sameOriginResource) {
    headers.set("cross-origin-resource-policy", "same-origin");
    headers.set("cross-origin-embedder-policy", "credentialless");
  } else {
    headers.set("access-control-allow-origin", "*");
    headers.set(
      "access-control-expose-headers",
      "Accept-Ranges, Content-Length, Content-Range, ETag",
    );
  }
  headers.set("x-toonstudio-large-asset-source", "r2");
  if (partial && object.range) {
    const end = object.range.offset + object.range.length - 1;
    headers.set(
      "content-range",
      `bytes ${object.range.offset}-${end}/${object.size}`,
    );
    headers.set("content-length", String(object.range.length));
  } else {
    headers.delete("content-range");
    headers.set("content-length", String(object.size));
  }
  return headers;
}

/**
 * R2에 아직 없는 미디어를 Static Assets로 돌린다. Static Assets의 SPA 폴백(HTML 200)은 미디어 자리에서
 * 로더를 깨뜨리므로(2026-10-13 wasm 사고와 같은 실패 모드) 404로 바꾼다.
 */
export async function staticMediaFallback(
  request: Request,
  assets: AssetsBinding,
): Promise<Response> {
  const response = await assets.fetch(request);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("text/html")) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return response;
}
