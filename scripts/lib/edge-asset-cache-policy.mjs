/**
 * Cloudflare R2 / Edge 불변 해시 에셋 최장기 캐시 정책 검증 가드.
 *
 * - 해시 지문이 포함된 불변 3D·텍스처·JS·CSS 에셋(`*.glb`, `*.ktx2`, `*.webp`, `assets/*-[hash].*`)은
 *   `public, max-age=31536000, immutable` 적용을 강제한다.
 * - 비-해시 HTML·매니페스트·서비스워커(`index.html`, `manifest.json`, `sw.js` 등)는
 *   `no-cache` 또는 `must-revalidate`(및 `max-age <= 0`, `immutable` 금지)를 강제한다.
 * - Cloudflare Pages/Workers Static Assets `_headers` 파일의 `! Header` 제거 지시문까지 해석한다.
 */

export const ONE_YEAR_MAX_AGE_SECONDS = 31_536_000;
export const IMMUTABLE_EDGE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATED_ENTRYPOINT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export const IMMUTABLE_3D_AND_TEXTURE_EXTENSIONS = new Set([
  "glb",
  "gltf",
  "ktx2",
  "webp",
  "vrm",
  "hdr",
  "basis",
  "bin",
]);

export const IMMUTABLE_WEB_BUNDLE_EXTENSIONS = new Set([
  "js",
  "mjs",
  "css",
  "wasm",
  "woff2",
  "woff",
  "avif",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "onnx",
]);

export const ALL_IMMUTABLE_CANDIDATE_EXTENSIONS = new Set([
  ...IMMUTABLE_3D_AND_TEXTURE_EXTENSIONS,
  ...IMMUTABLE_WEB_BUNDLE_EXTENSIONS,
]);

export const REVALIDATED_BASENAMES = new Set([
  "index.html",
  "manifest.json",
  "manifest.webmanifest",
  "site.webmanifest",
  "asset-manifest.json",
  "theme-packs.json",
  "sw.js",
]);

const DASH_HASH_PATTERN = /(?:^|\/)[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/u;
const DOT_HASH_PATTERN = /(?:^|\/)[^/]+\.[a-f0-9]{8,}\.[a-z0-9]+$/iu;
const SHA256_FILENAME_PATTERN = /(?:^|\/)[a-f0-9]{64}\.[a-z0-9]+$/iu;
const ASSETS_VITE_HASH_PATTERN = /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/u;

export function normalizeAssetPathname(rawPath) {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    throw new Error("에셋 경로는 비어 있지 않은 문자열이어야 합니다.");
  }
  const withoutHash = rawPath.trim().split("#", 1)[0] ?? "";
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "";
  if (withoutQuery.startsWith("http://") || withoutQuery.startsWith("https://")) {
    return new URL(withoutQuery).pathname;
  }
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

export function extractExtension(pathname) {
  const normalized = normalizeAssetPathname(pathname);
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return "";
  return basename.slice(dotIndex + 1).toLowerCase();
}

function extractRawBasename(pathname) {
  const normalized = normalizeAssetPathname(pathname);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function extractBasename(pathname) {
  return extractRawBasename(pathname).toLowerCase();
}

function isLikelyHashToken(suffix, allowMixedCaseBase64) {
  if (suffix.length >= 8 && /^[a-f0-9]+$/iu.test(suffix)) return true;
  if (suffix.length >= 6 && /[0-9]/u.test(suffix) && /^[A-Za-z0-9_-]+$/u.test(suffix)) return true;
  if (
    allowMixedCaseBase64
    && suffix.length >= 8
    && /[A-Z]/u.test(suffix)
    && /[a-z]/u.test(suffix)
    && /^[A-Za-z0-9_-]+$/u.test(suffix)
  ) {
    return true;
  }
  return false;
}

/**
 * 경로에 콘텐츠 해시 지문(`-[hash].ext`, `.[hex].ext`, 64자리 SHA-256 파일명)이 포함돼 있는지 판별한다.
 */
export function hasContentHashFingerprint(rawPath) {
  const pathname = normalizeAssetPathname(rawPath);
  const ext = extractExtension(pathname);
  if (!ext) return false;
  if (SHA256_FILENAME_PATTERN.test(pathname)) return true;
  if (DOT_HASH_PATTERN.test(pathname)) return true;

  const rawBasename = extractRawBasename(pathname);
  const stem = rawBasename.slice(0, -(ext.length + 1));
  const dashIndex = stem.lastIndexOf("-");
  const suffix = dashIndex >= 0 ? stem.slice(dashIndex + 1) : "";

  if (ASSETS_VITE_HASH_PATTERN.test(pathname)) {
    return isLikelyHashToken(suffix, true);
  }
  if (DASH_HASH_PATTERN.test(pathname)) {
    return isLikelyHashToken(suffix, false);
  }
  return false;
}

/**
 * 경로를 캐시 정책 등급으로 분류한다.
 * - `immutable-hashed-asset`: 해시 지문 포함 불변 3D·텍스처·JS·CSS·WASM 에셋
 * - `revalidated-entrypoint`: 비-해시 HTML, 매니페스트, 서비스워커, 루트 문서
 * - `unhashed-static-asset`: 해시 지문 없는 일반 정적 에셋
 */
export function classifyEdgeAssetPath(rawPath) {
  const pathname = normalizeAssetPathname(rawPath);
  const basename = extractBasename(pathname);
  const ext = extractExtension(pathname);
  const hashed = hasContentHashFingerprint(pathname);

  if (pathname === "/" || ext === "html" || ext === "htm" || ext === "webmanifest") {
    return "revalidated-entrypoint";
  }
  if (!hashed && REVALIDATED_BASENAMES.has(basename)) {
    return "revalidated-entrypoint";
  }
  if (!hashed && ext === "json" && basename.includes("manifest")) {
    return "revalidated-entrypoint";
  }
  if (hashed && ALL_IMMUTABLE_CANDIDATE_EXTENSIONS.has(ext)) {
    return "immutable-hashed-asset";
  }
  return "unhashed-static-asset";
}

/**
 * RFC 9111 `Cache-Control` 헤더 값을 정규화·파싱한다.
 */
export function parseCacheControl(headerValue) {
  if (typeof headerValue !== "string" || headerValue.trim().length === 0) {
    return {
      present: false,
      raw: "",
      directives: new Map(),
      maxAge: null,
      sMaxAge: null,
      hasPublic: false,
      hasPrivate: false,
      hasImmutable: false,
      hasNoCache: false,
      hasNoStore: false,
      hasMustRevalidate: false,
      invalidTokens: [],
    };
  }

  const directives = new Map();
  const invalidTokens = [];
  const rawTokens = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const token of rawTokens) {
    const eqIndex = token.indexOf("=");
    if (eqIndex === -1) {
      directives.set(token.toLowerCase(), true);
      continue;
    }
    const key = token.slice(0, eqIndex).trim().toLowerCase();
    const rawVal = token.slice(eqIndex + 1).trim().replace(/^"|"$/gu, "");
    if (!key || rawVal.length === 0) {
      invalidTokens.push(token);
      continue;
    }
    directives.set(key, rawVal);
  }

  const parseNonNegativeInt = (key) => {
    const raw = directives.get(key);
    if (raw === undefined || raw === true) return null;
    if (!/^\d+$/u.test(raw)) {
      invalidTokens.push(`${key}=${raw}`);
      return Number.NaN;
    }
    return Number.parseInt(raw, 10);
  };

  return {
    present: true,
    raw: headerValue.trim(),
    directives,
    maxAge: parseNonNegativeInt("max-age"),
    sMaxAge: parseNonNegativeInt("s-maxage"),
    hasPublic: directives.has("public"),
    hasPrivate: directives.has("private"),
    hasImmutable: directives.has("immutable"),
    hasNoCache: directives.has("no-cache"),
    hasNoStore: directives.has("no-store"),
    hasMustRevalidate: directives.has("must-revalidate"),
    invalidTokens,
  };
}

function makeIssue(code, pathname, messageKo, cacheControl) {
  return {
    code,
    pathname,
    messageKo,
    cacheControl: cacheControl ?? null,
  };
}

/**
 * 단일 에셋 경로와 `Cache-Control` 헤더가 Cloudflare R2/Edge 캐시 정책을 만족하는지 검증한다.
 */
export function validateAssetCacheHeader(rawPath, cacheControl, options = {}) {
  const pathname = normalizeAssetPathname(rawPath);
  const classification = classifyEdgeAssetPath(pathname);
  const parsed = parseCacheControl(cacheControl);
  const issues = [];
  const minImmutableMaxAge = options.minImmutableMaxAgeSeconds ?? ONE_YEAR_MAX_AGE_SECONDS;
  const allowUnhashedImmutablePrefixes = options.allowUnhashedImmutablePrefixes ?? [];

  if (parsed.invalidTokens.length > 0) {
    issues.push(
      makeIssue(
        "CACHE_CONTROL_MALFORMED",
        pathname,
        `Cache-Control 구문이 잘못되었습니다: ${parsed.invalidTokens.join(", ")}`,
        cacheControl,
      ),
    );
  }

  if (classification === "immutable-hashed-asset") {
    if (!parsed.present) {
      issues.push(
        makeIssue(
          "CACHE_CONTROL_MISSING",
          pathname,
          `해시 지문 불변 에셋(${pathname})에 Cache-Control 헤더가 없습니다. '${IMMUTABLE_EDGE_CACHE_CONTROL}'을 적용하세요.`,
          cacheControl,
        ),
      );
      return { ok: false, pathname, classification, parsed, issues };
    }
    if (!parsed.hasPublic) {
      issues.push(
        makeIssue(
          "IMMUTABLE_ASSET_MISSING_PUBLIC",
          pathname,
          `불변 에셋(${pathname})은 공유 엣지 캐시를 위해 'public' 지시문이 필요합니다.`,
          cacheControl,
        ),
      );
    }
    if (parsed.maxAge === null || Number.isNaN(parsed.maxAge) || parsed.maxAge < minImmutableMaxAge) {
      issues.push(
        makeIssue(
          "IMMUTABLE_ASSET_SHORT_MAX_AGE",
          pathname,
          `불변 에셋(${pathname})의 max-age는 최소 ${minImmutableMaxAge}초(1년) 이상이어야 합니다.`,
          cacheControl,
        ),
      );
    }
    if (!parsed.hasImmutable) {
      issues.push(
        makeIssue(
          "IMMUTABLE_ASSET_MISSING_IMMUTABLE",
          pathname,
          `불변 에셋(${pathname})에 'immutable' 지시문이 누락되었습니다.`,
          cacheControl,
        ),
      );
    }
    if (parsed.hasPrivate || parsed.hasNoCache || parsed.hasNoStore || parsed.hasMustRevalidate) {
      issues.push(
        makeIssue(
          "IMMUTABLE_ASSET_FORBIDDEN_DIRECTIVE",
          pathname,
          `불변 에셋(${pathname})에 장기 캐시를 무력화하는 지시문(private/no-cache/no-store/must-revalidate)이 섞여 있습니다.`,
          cacheControl,
        ),
      );
    }
    if (options.forbidEdgeBypassSMaxAge && parsed.sMaxAge === 0) {
      issues.push(
        makeIssue(
          "IMMUTABLE_ASSET_EDGE_BYPASS",
          pathname,
          `불변 에셋(${pathname})에 's-maxage=0'이 설정되어 Cloudflare Edge 캐시가 우회됩니다.`,
          cacheControl,
        ),
      );
    }
  } else if (classification === "revalidated-entrypoint") {
    if (!parsed.present) {
      issues.push(
        makeIssue(
          "REVALIDATED_ASSET_MISSING_HEADER",
          pathname,
          `비-해시 진입점/매니페스트(${pathname})에 Cache-Control 헤더가 없습니다. 'no-cache' 또는 'public, max-age=0, must-revalidate'를 지정하세요.`,
          cacheControl,
        ),
      );
      return { ok: false, pathname, classification, parsed, issues };
    }
    if (parsed.hasImmutable) {
      issues.push(
        makeIssue(
          "REVALIDATED_ASSET_FORBIDS_IMMUTABLE",
          pathname,
          `비-해시 HTML/매니페스트(${pathname})에는 'immutable'을 지정할 수 없습니다.`,
          cacheControl,
        ),
      );
    }
    if (parsed.maxAge !== null && !Number.isNaN(parsed.maxAge) && parsed.maxAge > 0) {
      issues.push(
        makeIssue(
          "REVALIDATED_ASSET_NONZERO_MAX_AGE",
          pathname,
          `비-해시 HTML/매니페스트(${pathname})의 max-age는 0이어야 합니다(현재 max-age=${parsed.maxAge}).`,
          cacheControl,
        ),
      );
    }
    if (!parsed.hasNoCache && !parsed.hasMustRevalidate && !parsed.hasNoStore) {
      issues.push(
        makeIssue(
          "REVALIDATED_ASSET_MISSING_REVALIDATION",
          pathname,
          `비-해시 HTML/매니페스트(${pathname})에는 'no-cache' 또는 'must-revalidate' 재검증 지시문이 필수입니다.`,
          cacheControl,
        ),
      );
    }
  } else if (parsed.present && parsed.hasImmutable) {
    const allowedByPrefix = allowUnhashedImmutablePrefixes.some((prefix) =>
      pathname.startsWith(prefix),
    );
    if (!allowedByPrefix) {
      issues.push(
        makeIssue(
          "UNHASHED_ASSET_FORBIDS_IMMUTABLE",
          pathname,
          `콘텐츠 해시 지문이 없는 경로(${pathname})에 'immutable'을 적용하면 갱신 후 구버전 캐시가 고착됩니다.`,
          cacheControl,
        ),
      );
    }
  }

  return {
    ok: issues.length === 0,
    pathname,
    classification,
    parsed,
    issues,
  };
}

/**
 * Cloudflare `_headers` 파일 텍스트를 규칙 배열로 파싱한다(`! Header` 제거 지시문 지원).
 */
export function parseCloudflareHeaders(headersText) {
  const rules = [];
  let currentRule = null;

  for (const rawLine of headersText.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!/^\s/u.test(rawLine) && trimmed.startsWith("/")) {
      currentRule = { pattern: trimmed, operations: [] };
      rules.push(currentRule);
      continue;
    }
    if (!currentRule) continue;

    if (trimmed.startsWith("!")) {
      const removedName = trimmed.slice(1).trim().toLowerCase();
      if (removedName) {
        currentRule.operations.push({ kind: "remove", key: removedName });
      }
      continue;
    }
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
      const value = trimmed.slice(colonIndex + 1).trim();
      currentRule.operations.push({ kind: "append", key, value });
    }
  }

  return rules;
}

function cloudflarePatternMatches(pattern, pathname) {
  const escaped = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "u").test(pathname);
}

/**
 * Cloudflare `_headers` 규칙 목록을 순서대로 평가하여 특정 경로의 유효 응답 헤더를 산출한다.
 */
export function resolveCloudflareHeadersForPath(rules, rawPath) {
  const pathname = normalizeAssetPathname(rawPath);
  const headerValues = new Map();

  for (const rule of rules) {
    if (!cloudflarePatternMatches(rule.pattern, pathname)) continue;
    for (const op of rule.operations) {
      if (op.kind === "remove") {
        headerValues.delete(op.key);
      } else {
        const existing = headerValues.get(op.key);
        headerValues.set(op.key, existing ? `${existing}, ${op.value}` : op.value);
      }
    }
  }

  return Object.fromEntries(headerValues.entries());
}

/**
 * R2/Edge 에셋 목록(`[{ path, cacheControl }]`)을 일괄 검증한다.
 */
export function validateEdgeAssetCacheManifest(entries, options = {}) {
  const results = [];
  const violations = [];
  let immutableCount = 0;
  let revalidatedCount = 0;
  let unhashedCount = 0;

  for (const entry of entries) {
    const result = validateAssetCacheHeader(entry.path, entry.cacheControl, options);
    results.push(result);
    if (result.classification === "immutable-hashed-asset") immutableCount += 1;
    else if (result.classification === "revalidated-entrypoint") revalidatedCount += 1;
    else unhashedCount += 1;
    if (!result.ok) {
      violations.push(...result.issues);
    }
  }

  return {
    ok: violations.length === 0,
    checkedCount: results.length,
    counts: {
      immutableHashed: immutableCount,
      revalidatedEntrypoint: revalidatedCount,
      unhashedStatic: unhashedCount,
    },
    violations,
    results,
  };
}

/**
 * Cloudflare `_headers` 문서에 대해 대표 경로 집합의 최종 Cache-Control 정책을 검증한다.
 */
export function validateCloudflareHeadersPolicy(headersText, samplePaths, options = {}) {
  const rules = parseCloudflareHeaders(headersText);
  const entries = samplePaths.map((pathname) => {
    const resolved = resolveCloudflareHeadersForPath(rules, pathname);
    return {
      path: pathname,
      cacheControl: resolved["cache-control"] ?? "",
    };
  });
  return validateEdgeAssetCacheManifest(entries, options);
}
