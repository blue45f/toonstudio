const REDIRECT_PROBE_ORIGIN = "https://toonstudio.invalid";

/** 제작 워크스페이스 OAuth 연동이 끝난 뒤 돌아올 수 있는 앱 내부 경로의 뿌리. */
export const PRODUCTION_REDIRECT_ROOT = "/production";

const MAXIMUM_REDIRECT_PATH_LENGTH = 512;

// 역슬래시는 URL 파서가 `/`로 취급하고, 제어문자는 헤더·로그 분할에 쓰일 수 있다.
function containsForbiddenRedirectCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f || character === "\\") return true;
  }
  return false;
}

/**
 * 콜백이 303으로 돌려보낼 앱 내부 경로를 정규화한다.
 *
 * 문자열 검사(`^/production`)만으로는 `/production/..//evil.example` 같은 값이 통과한 뒤
 * `new URL()` 의 점 세그먼트 정규화에서 `//evil.example` 이 되어 스킴 상대 URL(외부 이동)로
 * 읽힌다. 따라서 정규화한 결과가 여전히 /production 하위인지를 기준으로 판정하고,
 * 통과한 경우에만 `pathname + search` 정규형을 돌려준다(해시는 버린다). 실패하면 null.
 */
export function normalizeProductionRedirectPath(value: string): string | null {
  if (value.length === 0 || value.length > MAXIMUM_REDIRECT_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (containsForbiddenRedirectCharacter(value)) return null;
  let url: URL;
  try {
    url = new URL(value, REDIRECT_PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== REDIRECT_PROBE_ORIGIN) return null;
  const { pathname } = url;
  if (
    pathname !== PRODUCTION_REDIRECT_ROOT
    && !pathname.startsWith(`${PRODUCTION_REDIRECT_ROOT}/`)
  ) {
    return null;
  }
  return `${pathname}${url.search}`;
}
