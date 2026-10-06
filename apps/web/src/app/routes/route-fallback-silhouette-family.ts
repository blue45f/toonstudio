/** 라우트 진입 스켈레톤의 실루엣 변형 결정 로직(컴포넌트 아님). */

export type RouteSilhouetteFamily = "virtual-space" | "studio-home" | "learn";

/** 경로가 속한 실루엣 화면군. 어느 군에도 속하지 않으면 null(일반 카드 스켈레톤 유지). */
export function routeSilhouetteFamily(pathname: string): RouteSilhouetteFamily | null {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (path === "/studio/space" || /^\/studio\/p\/[^/]+\/space(?:\/.*)?$/u.test(path)) {
    return "virtual-space";
  }
  if (path === "/home") return "studio-home";
  if (path === "/learn" || path.startsWith("/learn/")) return "learn";
  return null;
}
