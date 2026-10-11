/**
 * 가상스튜디오 무대 엔진 결정 (재개발 5단계 — 구 클라이언트 대체).
 *
 * 5단계부터 기본 무대는 Godot다. 클래식(구 웹) 무대는 삭제하지 않고
 * 폴백으로 동결한다: `?engine=classic`으로 언제든 되돌릴 수 있고,
 * 클래식 화면의 전환 배너로 Godot에 다시 들어올 수 있다.
 *
 * 게스트 예외: 프로젝트 공간의 비로그인 게스트는 기본값이 클래식이다.
 * 게스트 프레즌스 티켓 발급은 서버에 생겼고(DESIGN.md §14) 명시 진입
 * (`?engine=godot`)에서는 검증된 초대 자격으로 Godot에 접속할 수 있다.
 * 다만 기본값 반전은 재판정과 함께 내릴 별도 판단으로 남겨 두어,
 * 검증된 초대 동선(클래식)의 기본값을 이 리졸버에서는 아직 바꾸지
 * 않는다 (DESIGN.md §12·§14).
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
  if (context.personal || context.signedIn) return "godot";
  return "classic";
}
