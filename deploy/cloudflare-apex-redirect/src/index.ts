export const CANONICAL_ORIGIN = "https://www.toonstudio.cloud";

const REDIRECT_CACHE_CONTROL = "public, max-age=3600";
const STRICT_TRANSPORT_SECURITY =
  "max-age=63072000; includeSubDomains; preload";

/**
 * 요청 경로의 선행 슬래시·백슬래시를 하나로 줄인다.
 * `//evil.example` 같은 경로를 `new URL(경로, 기준)` 에 넘기면 scheme-relative URL 로 해석돼
 * 정본 출처 대신 `https://evil.example` 로 리다이렉트된다(열린 리다이렉트).
 */
function normalizeLeadingSlashes(pathname: string): string {
  return `/${pathname.replace(/^[/\\]+/u, "")}`;
}

export function canonicalRedirect(request: Request): Response {
  const source = new URL(request.url);
  // 경로를 문자열로 이어 붙여 다시 해석하지 않고 setter 로만 채운다 — 호스트는 바뀔 수 없다.
  const target = new URL(CANONICAL_ORIGIN);
  target.pathname = normalizeLeadingSlashes(source.pathname);
  target.search = source.search;

  return new Response(null, {
    status: 308,
    headers: {
      "cache-control": REDIRECT_CACHE_CONTROL,
      location: target.href,
      "referrer-policy": "strict-origin-when-cross-origin",
      "strict-transport-security": STRICT_TRANSPORT_SECURITY,
      "x-content-type-options": "nosniff",
      "x-toonstudio-canonical-origin": CANONICAL_ORIGIN,
    },
  });
}

export default {
  fetch(request: Request): Response {
    return canonicalRedirect(request);
  },
};
