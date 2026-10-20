/**
 * 가상스튜디오 무대 엔진 결정 (2D 기본 + 3D 전환).
 *
 * 기본 무대는 전 진입에서 클래식(2D)이다. Unity(3D) 무대는
 * `?engine=unity`으로 언제든 전환할 수 있고, 클래식 화면의 전환
 * 배너로 Unity에 들어갈 수 있다. Unity 임베드에서는 반대로
 * `?engine=classic` 고정으로 2D로 복귀한다.
 *
 * 2026-10-13 저장소 소유자 결정으로 기본값을 3D에서 클래식으로
 * 되돌렸다. 3D 무대 코드는 그대로 유지되며 파라미터 하나로 전환된다.
 *
 * 2026-10-20 저장소 소유자 결정으로 3D 무대 엔진을 Godot에서 Unity로
 * 교체했다. 기존 `?engine=godot` 링크는 별칭으로 받아 같은 Unity
 * 무대로 연결한다 (저장된 링크·북마크 보존).
 */
export type StudioSpaceEngine = "unity" | "classic";

export interface StudioSpaceEngineContext {
  /** 계정 세션이 확정됐는가 (세션 로딩 중이면 false로 본다). */
  readonly signedIn: boolean;
  /** 개인 공간인가 — 양쪽 무대 모두 솔로라 3D 기본값이 의미 동등하다. */
  readonly personal: boolean;
}

export function resolveStudioSpaceEngine(
  search: string,
  context: StudioSpaceEngineContext,
): StudioSpaceEngine {
  const explicit = new URLSearchParams(search).get("engine");
  if (explicit === "unity") return "unity";
  // 엔진 교체 전 링크(?engine=godot)는 새 무대의 별칭으로 수용한다.
  if (explicit === "godot") return "unity";
  if (explicit === "classic") return "classic";
  // 기본값은 로그인·개인·게스트를 가리지 않고 클래식(2D)이다.
  // context는 호출 계약(진입 종류의 명시)을 위해 유지한다.
  void context;
  return "classic";
}
