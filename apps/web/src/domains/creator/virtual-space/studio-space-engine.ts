/**
 * 가상스튜디오 무대 엔진 결정 (재개발 5단계 — 구 클라이언트 대체).
 *
 * 기본 무대는 전 진입에서 Godot다. 클래식(구 웹) 무대는 삭제하지 않고
 * 폴백으로 동결한다: `?engine=classic`으로 언제든 되돌릴 수 있고,
 * 클래식 화면의 전환 배너로 Godot에 다시 들어올 수 있다.
 *
 * 게스트 기본값 전환 (DESIGN.md §15): 5단계에서는 프로젝트 공간의
 * 비로그인 게스트만 서버 계약(프레즌스 티켓 발급 불가) 때문에 클래식
 * 기본값을 유지했다. 게스트 티켓 계약이 생기고(DESIGN.md §14) 초대
 * 자격 게스트의 Godot 접속·프레즌스가 실증된 뒤, 제거 전제 조건 ③
 * (전환된 상태로 재판정 재확인)을 실행하기 위해 게스트 기본값도
 * Godot로 뒤집는다. 클래식 코드·배너는 재판정 판정 전까지 그대로 둔다.
 */
export type StudioSpaceEngine = "godot" | "classic";

export interface StudioSpaceEngineContext {
  /** 계정 세션이 확정됐는가 (세션 로딩 중이면 false로 본다). */
  readonly signedIn: boolean;
  /** 개인 공간인가 — 양쪽 무대 모두 솔로라 Godot 기본값이 의미 동등하다. */
  readonly personal: boolean;
}

export function resolveStudioSpaceEngine(
  search: string,
  context: StudioSpaceEngineContext,
): StudioSpaceEngine {
  const explicit = new URLSearchParams(search).get("engine");
  if (explicit === "godot") return "godot";
  if (explicit === "classic") return "classic";
  // 기본값은 로그인·개인·게스트를 가리지 않고 Godot다 (§15 전환).
  // context는 호출 계약(진입 종류의 명시)을 위해 유지한다.
  void context;
  return "godot";
}
