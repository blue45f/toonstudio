import { DISCOVER_PURPOSE_PREFIXES, isPublicCreativeRoute } from "@/shared/components/site-public-routes";

import { BETA_OPEN_EVENT } from "./event-catalog";

/** 영상 재생기와 챕터 목록을 가리면 시청 흐름이 끊기므로 홍보영상 페이지에는 띄우지 않는다. */
const MEDIA_PAGES = new Set(["/product-tour", "/brand-film"]);

/**
 * 레일·그리드·보드가 주인공인 탐색 표면. 큰 카드(30rem, 접이식 혜택 목록 포함)가
 * 뜨면 마지막 레일과 그리드 하단이 가려지므로(discover D-5), 이 표면들에서는
 * 한 줄 축소형 배너로만 알린다. 발견 목적 접두사는 내비게이션 분류와 같은
 * 정본(DISCOVER_PURPOSE_PREFIXES)을 재사용하고, 마켓·쇼케이스 그리드를 더한다.
 */
const COMPACT_SURFACE_PREFIXES: readonly string[] = [
  ...DISCOVER_PURPOSE_PREFIXES,
  "/market",
  "/showcase",
];

export type BetaOpenEventGateVariant = "full" | "compact";

function normalizePathname(pathname: string): string {
  return pathname.toLowerCase().replace(/\/+$/u, "") || "/";
}

function matchesSurfacePrefix(normalized: string, prefix: string): boolean {
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

/**
 * The public root is the product's orientation screen. Keep first-visit promotion
 * available on discovery pages without covering the primary service explanation.
 */
export function betaOpenEventGateEligible(pathname: string): boolean {
  if (!BETA_OPEN_EVENT.firstVisitExposure) return false;
  const normalized = normalizePathname(pathname);
  if (normalized === "/" || normalized === "/events" || normalized.startsWith("/events/")) return false;
  if (MEDIA_PAGES.has(normalized)) return false;
  return isPublicCreativeRoute(normalized);
}

/**
 * 표면별 게이트 변형. 노출 대상이 아니면 null, 레일형 탐색 표면이면 "compact"
 * (한 줄 배너 — 제목·CTA·닫기만 있어 콘텐츠 하단을 가리지 않는다),
 * 그 밖의 콘텐츠형 표면이면 "full"(기존 카드)이다.
 */
export function betaOpenEventGateVariant(pathname: string): BetaOpenEventGateVariant | null {
  if (!betaOpenEventGateEligible(pathname)) return null;
  const normalized = normalizePathname(pathname);
  return COMPACT_SURFACE_PREFIXES.some((prefix) => matchesSurfacePrefix(normalized, prefix))
    ? "compact"
    : "full";
}
