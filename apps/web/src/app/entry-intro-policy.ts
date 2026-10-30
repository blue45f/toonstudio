import { resolveStudioRoute } from "@/domains/creator/studio-router/studio-route-manifest";
import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";

/**
 * 진입 인트로를 띄울 라우트인지 판정한다. (구 app-shell-splash의 대체)
 *
 * 작품 시작 화면은 선택 항목을 바로 보여 준다. 전용 작업공간과 몰입형 표면은
 * 자체 진입 연출을 사용하므로, 일반 사이트 화면에서만 브랜드 인트로를 재생한다.
 */
const DIRECT_ENTRY_PATHS: ReadonlySet<string> = new Set([
  "/create",
  "/my",
  "/me",
  "/membership/usage",
  "/market/library",
  "/market/publish",
  "/market/manage",
  "/market/seller",
  "/market/wishlist",
  "/team",
  "/home",
  "/hub",
  "/studio/space",
  "/onboarding/character",
]);

// 입력·보안·협업 화면은 새 세션이어도 내용을 즉시 보여 준다.
// 공개 소개 페이지(/membership·/market 등)의 연출은 유지한다.
const DIRECT_ENTRY_PREFIXES = ["/settings", "/auth", "/account", "/messages", "/notifications", "/production"] as const;

export function shouldShowEntryIntro(pathname: string, search = ""): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  if (DIRECT_ENTRY_PATHS.has(normalized)) return false;
  if (DIRECT_ENTRY_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return false;
  if (normalized.startsWith("/team/")) return false;
  if (/^\/studio\/p\/[^/]+\/space$/u.test(normalized)) return false;
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return resolveStudioRoute({ pathname, search }).kind === "publish";
  }
  return true;
}
