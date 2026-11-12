import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";

import { SITE_NAVIGATION_ITEMS, siteNavigationGroupForPath, type SiteNavigationItem } from "./site-navigation";
import { isDiscoverPurposeRoute, isPublicCreativeRoute } from "./site-public-routes";

const PURPOSE_HREFS = ["/studio", "/discover", "/market", "/my"] as const;
export type SiteMobilePurposeHref = (typeof PURPOSE_HREFS)[number];

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

function target(id: "studio" | "explore" | "market" | "me"): SiteMobilePurposeHref {
  const canonical = canonicalSitePath(SITE_NAVIGATION_ITEMS[id].href);
  const href = PURPOSE_HREFS.find((entry) => entry === canonical);
  if (!href) throw new Error(`모바일 정본 목적지가 변경되었습니다: ${id}`);
  return href;
}

const WORK = target("studio");
const READ = target("explore");
const MATERIALS = target("market");
const ACCOUNT = target("me");

/** 계정 모듈 중 정본 내비 항목에 없는 경로만 보완한다. */
const ACCOUNT_MODULES = ["/account", "/me", "/messages", "/membership/usage"] as const;

/** 모바일의 현재 목적지를 고를 뿐 접근 권한·프로젝트 식별자·PC 구역은 바꾸지 않는다. */
export function siteMobilePurposeHref(input: string): SiteMobilePurposeHref | null {
  const path = canonicalSitePath(input);
  // 메타데이터가 정본 authority를 먼저 조회하므로 접근/작업 문맥의 기존 분류를 따른다.
  const metadata = resolveSiteRouteMetadata(path);
  if (matches(path, "/about") || metadata.product === "docs" || metadata.purpose === "trust") return null;

  const group = siteNavigationGroupForPath(path);
  const entry = group?.items.reduce<SiteNavigationItem | null>((best, item) => (
    matches(path, item.href) && (!best || item.href.length > best.href.length) ? item : best
  ), null);

  // 서재는 계정 설정이 아니라 작품 감상으로 돌아가는 목적지다.
  if (entry?.id === SITE_NAVIGATION_ITEMS.library.id) return READ;
  if ([SITE_NAVIGATION_ITEMS.me, SITE_NAVIGATION_ITEMS.settings, SITE_NAVIGATION_ITEMS.notifications]
    .some((item) => matches(path, item.href)) || ACCOUNT_MODULES.some((prefix) => matches(path, prefix))) return ACCOUNT;

  if (entry?.id === SITE_NAVIGATION_ITEMS.market.id || entry?.id === SITE_NAVIGATION_ITEMS.research.id) return MATERIALS;
  if (path !== SITE_NAVIGATION_ITEMS.make.href && matches(path, SITE_NAVIGATION_ITEMS.make.href)
    && isPublicCreativeRoute(path)) return READ;
  if (group?.id === "create" || group?.id === "publish"
    || entry?.id === SITE_NAVIGATION_ITEMS.workspaceHome.id || entry?.id === SITE_NAVIGATION_ITEMS.workspaceTeam.id
    || path === "/publish" || (metadata.product === "studio" && metadata.purpose === "create")) return WORK;

  // /create 자체는 작업 시작이고 기존 /create/:id 별칭은 공개 작품이다.
  if (isDiscoverPurposeRoute(path) || group?.id === "discover"
    || entry?.id === SITE_NAVIGATION_ITEMS.gallery.id
    || path === "/read/spatial" || matches(path, "/lists")) return READ;

  return null;
}
