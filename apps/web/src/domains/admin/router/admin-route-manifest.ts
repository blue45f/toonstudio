import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";

export const ADMIN_ROUTE_IDS = [
  "overview",
  "traffic",
  "members",
  "reports",
  "community",
  "plans",
  "revenue",
  "supporters",
  "creatorSupport",
  "campaigns",
  "inquiries",
  "promos",
  "announcements",
  "ops",
  "security",
  "audit",
] as const;

export type AdminRouteId = (typeof ADMIN_ROUTE_IDS)[number];

export type AdminRouteIconId =
  | "activity"
  | "announcement"
  | "audit"
  | "community"
  | "funding"
  | "members"
  | "operations"
  | "overview"
  | "plans"
  | "promotions"
  | "reports"
  | "revenue"
  | "security";

export interface AdminRouteDescriptor {
  readonly id: AdminRouteId;
  readonly path: string;
  readonly labelKey: string;
  readonly icon: AdminRouteIconId;
  readonly keywords: readonly string[];
}

export const ADMIN_ROUTES: readonly AdminRouteDescriptor[] = [
  { id: "overview", path: "/admin/overview", labelKey: "admin.tabs.dashboard", icon: "overview", keywords: ["dashboard", "운영 홈", "overview"] },
  { id: "traffic", path: "/admin/analytics/traffic", labelKey: "admin.tabs.traffic", icon: "activity", keywords: ["analytics", "traffic", "트래픽"] },
  { id: "members", path: "/admin/users/members", labelKey: "admin.splitRoutes.members", icon: "members", keywords: ["member", "user", "회원"] },
  { id: "reports", path: "/admin/trust/cases", labelKey: "admin.tabs.reports", icon: "reports", keywords: ["report", "case", "신고", "심의"] },
  { id: "community", path: "/admin/trust/community", labelKey: "admin.splitRoutes.community", icon: "community", keywords: ["community", "moderation", "커뮤니티"] },
  { id: "plans", path: "/admin/monetization/plans", labelKey: "admin.tabs.plans", icon: "plans", keywords: ["plan", "pricing", "플랜", "요금제"] },
  { id: "revenue", path: "/admin/monetization/revenue", labelKey: "admin.tabs.revenue", icon: "revenue", keywords: ["revenue", "settlement", "정산"] },
  { id: "supporters", path: "/admin/monetization/supporters", labelKey: "admin.tabs.supporters", icon: "funding", keywords: ["support", "operating cost", "후원", "운영비"] },
  { id: "creatorSupport", path: "/admin/monetization/creator-support", labelKey: "admin.tabs.creatorSupport", icon: "funding", keywords: ["student", "amateur", "creator support", "학생", "아마추어", "창작자 지원"] },
  { id: "campaigns", path: "/admin/monetization/funding", labelKey: "admin.tabs.campaigns", icon: "funding", keywords: ["campaign", "funding", "후원"] },
  { id: "inquiries", path: "/admin/growth/inquiries", labelKey: "admin.tabs.inquiries", icon: "funding", keywords: ["inquiry", "IR", "partnership", "sponsor", "투자", "제휴", "후원"] },
  { id: "promos", path: "/admin/growth/promotions", labelKey: "admin.tabs.promos", icon: "promotions", keywords: ["promotion", "coupon", "프로모션"] },
  { id: "announcements", path: "/admin/engagement/announcements", labelKey: "admin.tabs.announcements", icon: "announcement", keywords: ["announcement", "notice", "공지"] },
  { id: "ops", path: "/admin/platform/operations", labelKey: "admin.tabs.ops", icon: "operations", keywords: ["operations", "health", "운영", "시스템"] },
  { id: "security", path: "/admin/security/access", labelKey: "admin.tabs.security", icon: "security", keywords: ["security", "access", "보안"] },
  { id: "audit", path: "/admin/security/audit", labelKey: "admin.tabs.audit", icon: "audit", keywords: ["audit", "history", "감사"] },
] as const;

export type AdminNavigationGroupId =
  | "overview"
  | "users-trust"
  | "monetization"
  | "growth"
  | "platform-security";

export interface AdminNavigationGroup {
  readonly id: AdminNavigationGroupId;
  readonly routeIds: readonly AdminRouteId[];
}

export const ADMIN_NAVIGATION_GROUPS: readonly AdminNavigationGroup[] = [
  { id: "overview", routeIds: ["overview", "traffic"] },
  { id: "users-trust", routeIds: ["members", "reports", "community"] },
  { id: "monetization", routeIds: ["plans", "revenue", "supporters", "creatorSupport", "campaigns"] },
  { id: "growth", routeIds: ["inquiries", "promos", "announcements"] },
  { id: "platform-security", routeIds: ["ops", "security", "audit"] },
] as const;

export const ADMIN_ROUTE_BY_ID = Object.fromEntries(
  ADMIN_ROUTES.map((route) => [route.id, route]),
) as Record<AdminRouteId, AdminRouteDescriptor>;

const LEGACY_TAB_ROUTE: Readonly<Record<string, AdminRouteId>> = {
  dashboard: "overview",
  traffic: "traffic",
  plans: "plans",
  revenue: "revenue",
  supporters: "supporters",
  campaigns: "campaigns",
  promos: "promos",
  announcements: "announcements",
  reports: "reports",
  security: "security",
  audit: "audit",
  ops: "ops",
};

function normalizePathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return trimTrailingSlashes(pathname) || "/";
}

function appendLocation(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function resolveAdminRoute(pathname: string): AdminRouteDescriptor | null {
  const normalized = normalizePathname(pathname);
  return ADMIN_ROUTES.find((route) => route.path === normalized) ?? null;
}

export function adminPathFromLegacyTab(tab: string | null | undefined): string {
  const routeId = tab ? LEGACY_TAB_ROUTE[tab] : undefined;
  return ADMIN_ROUTE_BY_ID[routeId ?? "overview"].path;
}

export function resolveAdminRedirectHref(
  pathname: string,
  search = "",
  hash = "",
): string | null {
  const normalized = normalizePathname(pathname);
  const params = new URLSearchParams(search);

  if (normalized === "/admin") {
    const destination = adminPathFromLegacyTab(params.get("tab"));
    params.delete("tab");
    const nextSearch = params.toString();
    return appendLocation(destination, nextSearch ? `?${nextSearch}` : "", hash);
  }

  if (normalized === "/admin/members") {
    return appendLocation(ADMIN_ROUTE_BY_ID.members.path, search, hash);
  }
  if (normalized === "/admin/community") {
    return appendLocation(ADMIN_ROUTE_BY_ID.community.path, search, hash);
  }
  if (normalized === "/admin/integrations") {
    return appendLocation(ADMIN_ROUTE_BY_ID.ops.path, search, hash || "#integrations");
  }

  const modernRoute = resolveAdminRoute(normalized);
  if (modernRoute && normalized !== pathname) {
    return appendLocation(modernRoute.path, search, hash);
  }
  return null;
}

const SHELL_KO = {
  breadcrumbRoot: "관리자",
  closeCommandPalette: "명령 팔레트 닫기",
  closeNavigation: "관리자 메뉴 닫기",
  collapseSidebar: "사이드바 접기",
  downloadFailed: "다운로드 실패",
  expandSidebar: "사이드바 펼치기",
  exportMembersSuccess: "회원 CSV를 내려받았습니다.",
  exportRevenueSuccess: "정산 CSV를 내려받았습니다.",
  groups: {
    overview: "운영 현황",
    "users-trust": "회원·신뢰",
    monetization: "수익화",
    growth: "성장·소통",
    "platform-security": "플랫폼·보안",
  },
  loading: "관리자 화면을 불러오는 중",
  navigation: "관리자 메뉴",
  openNavigation: "관리자 메뉴 열기",
  openPublicSite: "공개 사이트 열기",
  publicSite: "사이트",
  roles: {
    admin: "관리자",
    creator: "창작자",
    operator: "운영자",
    user: "회원",
  },
  workspace: "운영 워크스페이스",
} as const;

const SHELL_EN = {
  breadcrumbRoot: "Admin",
  closeCommandPalette: "Close command palette",
  closeNavigation: "Close admin navigation",
  collapseSidebar: "Collapse sidebar",
  downloadFailed: "Download failed",
  expandSidebar: "Expand sidebar",
  exportMembersSuccess: "Member CSV downloaded.",
  exportRevenueSuccess: "Revenue CSV downloaded.",
  groups: {
    overview: "Operations overview",
    "users-trust": "Users & trust",
    monetization: "Monetization",
    growth: "Growth & engagement",
    "platform-security": "Platform & security",
  },
  loading: "Loading admin workspace",
  navigation: "Admin navigation",
  openNavigation: "Open admin navigation",
  openPublicSite: "Open public site",
  publicSite: "Site",
  roles: {
    admin: "Admin",
    creator: "Creator",
    operator: "Operator",
    user: "Member",
  },
  workspace: "Operations workspace",
} as const;

export type AdminShellCopy = typeof SHELL_KO;

export function getAdminShellCopy(locale: string): AdminShellCopy {
  return locale.toLowerCase().startsWith("ko")
    ? SHELL_KO
    : (SHELL_EN as unknown as AdminShellCopy);
}
