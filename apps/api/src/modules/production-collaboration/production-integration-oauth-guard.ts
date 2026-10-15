import { ForbiddenException } from "@nestjs/common";

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

/**
 * 앱 내부 이동 경로에 쿼리를 덧붙인다. 저장된 상태 행의 값도 호출마다 다시 검증해, 정규화 뒤
 * 스킴 상대 URL이 되는 값이 콜백 응답으로 나가지 못하게 한다. 검증에 실패하면 /production 으로 보낸다.
 */
export function appendProductionRedirectQuery(
  path: string,
  values: Record<string, string>,
): string {
  const safePath = normalizeProductionRedirectPath(path) ?? PRODUCTION_REDIRECT_ROOT;
  const url = new URL(safePath, REDIRECT_PROBE_ORIGIN);
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * 콜백을 연 브라우저의 검증된 세션 사용자가 연결을 시작한 사용자와 같을 때만 통과시킨다
 * (SameSite=Lax 쿠키는 Google 에서 돌아오는 최상위 GET 이동에 실려 온다). 이 바인딩이 없으면
 * 공격자가 자기 프로젝트용 state 로 만든 동의 URL을 피해자가 완료하는 것만으로 피해자의 Google
 * 자격증명(calendar·gmail.compose·drive.file)이 공격자 프로젝트에 연결된다.
 */
export function assertGoogleCallbackViewer(
  viewerUserId: string | undefined,
  startedByUserId: string,
): void {
  if (viewerUserId && viewerUserId === startedByUserId) return;
  throw new ForbiddenException(
    "Google 연결은 시작한 계정으로 로그인한 브라우저에서만 완료할 수 있습니다. 다시 로그인한 뒤 연결을 새로 시작해 주세요.",
  );
}
