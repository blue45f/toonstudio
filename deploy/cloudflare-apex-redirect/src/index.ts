export const CANONICAL_ORIGIN = "https://www.toonstudio.cloud";

const REDIRECT_CACHE_CONTROL = "public, max-age=3600";
const STRICT_TRANSPORT_SECURITY =
  "max-age=63072000; includeSubDomains; preload";

export function canonicalRedirect(request: Request): Response {
  const source = new URL(request.url);
  // 경로 문자열을 기준 URL에 상대 해석시키면 `//host/..` 가 권한부로 읽혀 정본 Origin을 벗어난다
  // (오픈 리다이렉트). 접속 권한부는 고정 상수로만 만들고, 사용자 입력은 pathname/search
  // setter로만 넣는다. setter는 `//`·역슬래시·인코딩된 구분자를 모두 경로 데이터로 취급한다.
  const target = new URL(CANONICAL_ORIGIN);
  target.pathname = source.pathname;
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
