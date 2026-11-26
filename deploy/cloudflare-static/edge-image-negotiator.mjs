/**
 * 엣지 동적 이미지 포맷 협상(AVIF/WebP) + DPR·폭 버킷 정규화 + `Vary: Accept` 캐시 안전 모듈.
 *
 * 유료 이미지 변환 없이 사전 인코딩된 R2/Static 변형(`.avif` → `.webp` → 원본)을 RFC 9110 `Accept`
 * 품질 가중치(`q=`)에 따라 선택하고, 고정 폭 버킷으로 캐시 키 폭증(DDoS)을 차단하며 원본 폴백을 보장한다.
 */

export const IMAGE_FORMATS = Object.freeze({ AVIF: "avif", WEBP: "webp", ORIGINAL: "original" });
export const IMAGE_WIDTH_BUCKETS = Object.freeze([320, 640, 960, 1280, 1920]);
export const IMAGE_DPR_MIN = 1;
export const IMAGE_DPR_MAX = 3;
export const IMAGE_FORMAT_HEADER = "X-ToonStudio-Image-Format";
export const IMAGE_BUCKET_HEADER = "X-ToonStudio-Image-Bucket";
export const IMMUTABLE_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_IMAGE_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

const MAX_ACCEPT_HEADER_LENGTH = 16384;
const MAX_ACCEPT_ENTRIES = 128;
const MAX_PATHNAME_LENGTH = 1024;
const ALLOWED_METHODS = Object.freeze(new Set(["GET", "HEAD"]));
const PASSTHROUGH_HEADERS = Object.freeze(["accept", "if-none-match", "if-modified-since", "range", "if-range", "sec-fetch-site"]);
const IMAGE_CONTENT_TYPES = Object.freeze({ avif: "image/avif", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" });
const PRIVATE_CACHE_TOKENS = Object.freeze(new Set(["private", "no-store", "no-cache"]));

/** RFC 9110 §12.4.2 qvalue(최대 5자)를 선형 검사해 ReDoS 가능성을 원천 차단한다. */
function parseQValue(raw) {
  if (raw.length === 0 || raw.length > 5) return null;
  if (raw === "1" || raw === "1." || raw === "1.0" || raw === "1.00" || raw === "1.000") return 1;
  if (raw === "0" || raw === "0.") return 0;
  return raw.length >= 3 && raw.startsWith("0.") && /^[0-9]{1,3}$/u.test(raw.slice(2)) ? Number(raw) : null;
}

function splitHeaderRespectingQuotes(input, delimiterCode, maxParts) {
  const parts = [];
  let start = 0;
  let inQuotes = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return null;
    if (inQuotes) {
      if (escaped) escaped = false;
      else if (code === 92) escaped = true;
      else if (code === 34) inQuotes = false;
    } else if (code === 34) {
      inQuotes = true;
    } else if (code === delimiterCode) {
      parts.push(input.slice(start, i));
      if (parts.length >= maxParts) return null;
      start = i + 1;
    }
  }
  return inQuotes ? null : [...parts, input.slice(start)];
}

function parseOrderedModernFormats(acceptHeader) {
  if (typeof acceptHeader !== "string" || acceptHeader.length === 0 || acceptHeader.length > MAX_ACCEPT_HEADER_LENGTH) return [];
  const entries = splitHeaderRespectingQuotes(acceptHeader, 44, MAX_ACCEPT_ENTRIES);
  if (!entries) return [];

  const weights = { avif: 0, webp: 0 };
  const excluded = { avif: false, webp: false };
  for (const rawEntry of entries) {
    const segments = splitHeaderRespectingQuotes(rawEntry, 59, 16);
    if (!segments) continue;
    const mediaType = segments[0].trim().toLowerCase();
    const format = mediaType === "image/avif" ? IMAGE_FORMATS.AVIF : mediaType === "image/webp" ? IMAGE_FORMATS.WEBP : null;
    if (!format) continue;

    let q = 1;
    let sawQ = false;
    let invalid = false;
    for (let i = 1; i < segments.length; i += 1) {
      const param = segments[i].trim();
      const eq = param.indexOf("=");
      if (param.length === 0 || eq <= 0) { invalid = true; break; }
      if (param.slice(0, eq).trim().toLowerCase() !== "q") continue;
      const parsedQ = sawQ ? null : parseQValue(param.slice(eq + 1).trim());
      if (parsedQ === null) { invalid = true; break; }
      q = parsedQ;
      sawQ = true;
    }
    if (invalid) continue;
    if (q === 0) excluded[format] = true;
    else if (q > weights[format]) weights[format] = q;
  }

  const avif = excluded.avif ? 0 : weights.avif;
  const webp = excluded.webp ? 0 : weights.webp;
  if (avif > 0 && webp > 0) return avif >= webp ? [IMAGE_FORMATS.AVIF, IMAGE_FORMATS.WEBP] : [IMAGE_FORMATS.WEBP, IMAGE_FORMATS.AVIF];
  return avif > 0 ? [IMAGE_FORMATS.AVIF] : webp > 0 ? [IMAGE_FORMATS.WEBP] : [];
}

/** RFC 9110 `Accept` 품질 가중치(`q=`)를 엄격 파싱해 `avif` > `webp` > `original` 순으로 선택한다. */
export function negotiateImageFormat(acceptHeader) {
  return parseOrderedModernFormats(acceptHeader)[0] ?? IMAGE_FORMATS.ORIGINAL;
}

function parseFiniteNumber(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** DPR을 `1..3`으로 클램프하고 요청 폭을 `[320, 640, 960, 1280, 1920]` 안전 버킷으로 사상한다. */
export function normalizeImageWidthBucket(rawWidth, rawDpr = IMAGE_DPR_MIN) {
  const width = parseFiniteNumber(rawWidth);
  if (width === null || width <= 0) return null;
  const parsedDpr = parseFiniteNumber(rawDpr);
  const clampedDpr = parsedDpr === null || parsedDpr < IMAGE_DPR_MIN ? IMAGE_DPR_MIN : Math.min(IMAGE_DPR_MAX, parsedDpr);
  const effectiveWidth = width * clampedDpr;
  return IMAGE_WIDTH_BUCKETS.find((bucket) => effectiveWidth <= bucket) ?? IMAGE_WIDTH_BUCKETS[IMAGE_WIDTH_BUCKETS.length - 1];
}

/** Vite/SHA-256 콘텐츠 해시가 포함된 정적 에셋 경로인지 판별한다. */
export function isContentHashedAssetPath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return false;
  const fileName = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  const stem = fileName.slice(0, dotIndex);
  if (stem.length >= 16 && stem.length <= 64 && /^[0-9a-f]+$/iu.test(stem)) return true;
  const sep = Math.max(stem.lastIndexOf("-"), stem.lastIndexOf("."), stem.lastIndexOf("_"));
  const token = sep > 0 ? stem.slice(sep + 1) : "";
  if (token.length < 8 || token.length > 64) return false;
  if (/^[0-9a-f]+$/iu.test(token)) return true;
  return token.length <= 16 && /^[A-Za-z0-9_-]+$/u.test(token) && /\d/u.test(token) && /[A-Za-z]/u.test(token);
}

function sanitizeAssetPathname(rawPathname) {
  if (typeof rawPathname !== "string" || rawPathname.length === 0 || rawPathname.length > MAX_PATHNAME_LENGTH) return null;
  const normalized = rawPathname.startsWith("/") ? rawPathname : `/${rawPathname}`;
  if (normalized.includes("//") || normalized.includes("\\") || normalized.includes("?") || normalized.includes("#")) return null;
  for (let i = 0; i < normalized.length; i += 1) {
    const c = normalized.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  const lower = normalized.toLowerCase();
  if (lower.includes("%2e") || lower.includes("%2f") || lower.includes("%5c") || lower.includes("%00")) return null;
  return normalized.split("/").slice(1).some((s) => s === "" || s === "." || s === "..") ? null : normalized;
}

function makeCandidate(pathname, format, bucket, contentType, isOriginal, vary, cacheControl) {
  return Object.freeze({
    pathname, key: pathname.slice(1), format, bucket, contentType, isOriginal,
    headers: Object.freeze({
      "Cache-Control": cacheControl,
      [IMAGE_FORMAT_HEADER]: format,
      [IMAGE_BUCKET_HEADER]: bucket === null ? IMAGE_FORMATS.ORIGINAL : String(bucket),
      ...(vary ? { Vary: vary } : {}),
      ...(contentType ? { "Content-Type": contentType } : {}),
    }),
  });
}

function freezePlan(pathname, negotiable, preferredFormat, widthBucket, contentHashed, vary, cacheControl, headers, candidates) {
  return Object.freeze({
    pathname, negotiable, preferredFormat, widthBucket, contentHashed, vary, cacheControl,
    headers: Object.freeze(headers), candidates: Object.freeze(candidates),
  });
}

/** R2/Static 이미지 변형 후보 목록(`.avif` → `.webp` → 원본)과 표준 `Vary: Accept`/캐시 헤더를 생성한다. */
export function buildNegotiatedAssetCandidates(pathname, acceptHeader, dpr, width) {
  const safePath = sanitizeAssetPathname(pathname);
  if (!safePath) return freezePlan(null, false, IMAGE_FORMATS.ORIGINAL, null, false, null, "no-store", { "Cache-Control": "no-store" }, []);

  const dotIndex = safePath.lastIndexOf(".");
  const ext = dotIndex > safePath.lastIndexOf("/") ? safePath.slice(dotIndex + 1).toLowerCase() : "";
  const originalType = Object.hasOwn(IMAGE_CONTENT_TYPES, ext) ? IMAGE_CONTENT_TYPES[ext] : null;
  const contentHashed = isContentHashedAssetPath(safePath);
  const cacheControl = contentHashed ? IMMUTABLE_IMAGE_CACHE_CONTROL : REVALIDATE_IMAGE_CACHE_CONTROL;
  if (!originalType) {
    const only = makeCandidate(safePath, IMAGE_FORMATS.ORIGINAL, null, null, true, null, cacheControl);
    return freezePlan(safePath, false, IMAGE_FORMATS.ORIGINAL, null, contentHashed, null, cacheControl, only.headers, [only]);
  }

  const orderedFormats = parseOrderedModernFormats(acceptHeader);
  const preferredFormat = orderedFormats[0] ?? IMAGE_FORMATS.ORIGINAL;
  const widthBucket = normalizeImageWidthBucket(width, dpr);
  const stem = safePath.slice(0, dotIndex);
  const vary = "Accept";
  const seen = new Set();
  const candidates = [];
  const push = (variantPath, format, bucket, contentType, isOriginal) => {
    if (seen.has(variantPath)) return;
    seen.add(variantPath);
    candidates.push(makeCandidate(variantPath, format, bucket, contentType, isOriginal, vary, cacheControl));
  };

  if (widthBucket !== null) {
    for (const fmt of orderedFormats) push(`${stem}.w${widthBucket}.${fmt}`, fmt, widthBucket, IMAGE_CONTENT_TYPES[fmt], false);
    if (orderedFormats.length === 0) push(`${stem}.w${widthBucket}.${ext}`, IMAGE_FORMATS.ORIGINAL, widthBucket, originalType, false);
  }
  for (const fmt of orderedFormats) {
    if (fmt === ext) break;
    push(`${stem}.${fmt}`, fmt, null, IMAGE_CONTENT_TYPES[fmt], false);
  }
  push(safePath, IMAGE_FORMATS.ORIGINAL, null, originalType, true);

  return freezePlan(safePath, true, preferredFormat, widthBucket, contentHashed, vary, cacheControl, {
    Vary: vary, "Cache-Control": cacheControl,
    [IMAGE_FORMAT_HEADER]: preferredFormat,
    [IMAGE_BUCKET_HEADER]: widthBucket === null ? IMAGE_FORMATS.ORIGINAL : String(widthBucket),
  }, candidates);
}

function mergeVaryHeader(existingVary, requiredToken) {
  if (!existingVary) return requiredToken;
  const seen = new Set();
  const tokens = [];
  const target = requiredToken.toLowerCase();
  for (const raw of existingVary.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    if (token === "*") return "*";
    const lower = token.toLowerCase();
    if (!seen.has(lower)) { seen.add(lower); tokens.push(lower === target ? requiredToken : token); }
  }
  if (!seen.has(target)) tokens.push(requiredToken);
  return tokens.join(", ");
}

function noStoreResponse(status, extraHeaders = {}) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

async function cancelBodySafely(response) {
  try { await response?.body?.cancel(); } catch { /* 폴백 차단을 막기 위해 본문 취소 오류는 무시한다. */ }
}

function decorateCandidateResponse(response, candidate, plan, method) {
  const headers = new Headers(response.headers);
  if (plan.vary) headers.set("Vary", mergeVaryHeader(headers.get("Vary"), plan.vary));
  const isSuccess = response.status === 200 || response.status === 206 || response.status === 304;
  const isPrivate = (headers.get("Cache-Control") ?? "").split(",").some((p) => PRIVATE_CACHE_TOKENS.has(p.trim().toLowerCase()));
  if (!isSuccess) headers.set("Cache-Control", "no-store");
  else if (!isPrivate) headers.set("Cache-Control", plan.cacheControl);
  if (response.status !== 304 && candidate.contentType) {
    const currentType = headers.get("content-type")?.trim().toLowerCase() ?? "";
    if (!candidate.isOriginal || currentType === "" || currentType === "application/octet-stream") {
      headers.set("Content-Type", candidate.contentType);
    }
  }
  headers.set(IMAGE_FORMAT_HEADER, candidate.format);
  headers.set(IMAGE_BUCKET_HEADER, candidate.bucket === null ? IMAGE_FORMATS.ORIGINAL : String(candidate.bucket));
  const omitBody = method === "HEAD" || response.status === 304;
  if (omitBody && response.body) void cancelBodySafely(response);
  return new Response(omitBody ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

/** 협상된 이미지 변형을 순차 조회하고 미존재·SPA HTML 폴백 시 원본 에셋으로 무중단 폴백한다. */
export async function serveNegotiatedStaticImage(request, fetchVariantFn) {
  if (typeof fetchVariantFn !== "function") throw new TypeError("fetchVariantFn must be a function");
  if (!request || typeof request.url !== "string" || !request.headers) return noStoreResponse(400);
  const method = String(request.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return noStoreResponse(405, { Allow: "GET, HEAD" });
  let parsedUrl;
  try { parsedUrl = new URL(request.url); } catch { return noStoreResponse(400); }
  const schemeEnd = request.url.indexOf("://");
  const rawPathStart = schemeEnd >= 0 ? request.url.indexOf("/", schemeEnd + 3) : -1;
  const rawPathTail = rawPathStart >= 0 ? request.url.slice(rawPathStart) : parsedUrl.pathname;
  const rawPathname = rawPathTail.split(/[?#]/u, 1)[0];

  const width = parsedUrl.searchParams.get("w") ?? parsedUrl.searchParams.get("width");
  const plan = buildNegotiatedAssetCandidates(rawPathname, request.headers.get("accept"), parsedUrl.searchParams.get("dpr"), width);
  if (plan.candidates.length === 0) return noStoreResponse(400);

  const reqHeaders = new Headers(
    PASSTHROUGH_HEADERS.flatMap((n) => (request.headers.get(n) === null ? [] : [[n, request.headers.get(n)]])),
  );
  for (const candidate of plan.candidates) {
    const variantRequest = new Request(new URL(candidate.pathname, parsedUrl.origin).toString(), {
      method, headers: new Headers(reqHeaders), signal: request.signal,
    });
    let response;
    try { response = await fetchVariantFn(candidate, variantRequest); } catch {
      if (candidate.isOriginal) return noStoreResponse(502, plan.vary ? { Vary: plan.vary } : {});
      continue;
    }
    if (!response) continue;
    const type = response.headers.get("content-type")?.trim().toLowerCase() ?? "";
    const isHtmlTrap = response.status !== 304 && (type.startsWith("text/html") || type.startsWith("application/xhtml+xml"));
    const isHit = response.status === 200 || response.status === 206 || response.status === 304;
    if (isHit && !isHtmlTrap) return decorateCandidateResponse(response, candidate, plan, method);
    if (!candidate.isOriginal || isHtmlTrap) { await cancelBodySafely(response); continue; }
    return decorateCandidateResponse(response, candidate, plan, method);
  }
  return noStoreResponse(404, {
    ...(plan.vary ? { Vary: plan.vary } : {}),
    [IMAGE_FORMAT_HEADER]: IMAGE_FORMATS.ORIGINAL, [IMAGE_BUCKET_HEADER]: IMAGE_FORMATS.ORIGINAL,
  });
}
