/**
 * 프로젝트 공간 초대 게스트의 실시간 신원 규약.
 *
 * 잼 룸 게스트(`studio-live-jam-scope`)와 달리 프로젝트 공간 게스트는
 * 초대 자격(워크스페이스 초대 토큰 또는 서버 발급 입장코드)을 서버가
 * 검증한 경우에만 프레즌스 티켓을 받는다. 신원 자체는 자격이 아니라
 * 게스트 세션에서 온다: 웹 셸이 발급한 16자 게스트 세션 ID를
 * `guest:` 접두사와 결합한 것이 룸 안에서의 actor ID다.
 *
 * 세션 ID 문자 집합은 웹 게스트 세션(`SESSION_ID`)과 동일하게
 * `[A-Za-z0-9_-]{16}`으로 고정한다. 표시 이름 같은 임의 문자열은
 * 신원 키에 넣지 않는다 — 한글 표시 이름이 ASCII 전용 검증에 걸려
 * 프레즌스 전체가 거부된 전례(멱등 키 솔트 교체)가 있기 때문이다.
 */
export const STUDIO_LIVE_PROJECT_GUEST_SESSION_ID_PATTERN =
  /^[A-Za-z0-9_-]{16}$/u;

export function isStudioLiveProjectGuestSessionId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    STUDIO_LIVE_PROJECT_GUEST_SESSION_ID_PATTERN.test(value)
  );
}

export function studioRealtimeProjectGuestActorId(
  guestSessionId: string,
): string {
  return `guest:${guestSessionId}`;
}

/**
 * 프로젝트 게스트 actor ID인가. 잼 게스트 actor(`guest:<uuid>`)는
 * 세션 ID 형식이 달라 여기서 걸러진다 — 두 게스트 체계의 신원이
 * 서로의 인가 분기로 새지 않게 하기 위해서다.
 */
export function isStudioRealtimeProjectGuestActorId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("guest:") &&
    isStudioLiveProjectGuestSessionId(value.slice("guest:".length))
  );
}
