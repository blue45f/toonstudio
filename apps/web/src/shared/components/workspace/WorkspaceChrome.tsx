import { HelpCircle, Settings, UserRound } from "lucide-react";
import { Suspense, useContext, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { WorkspaceAccountContext } from "./workspace-account-context";
import Link from "@/shared/navigation/router-link";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useI18n } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { CampusControls } from "../spatial-campus/CampusControls";
import { ToonStudioMark } from "../toonstudio-mark";
import { ToonStudioWordmark } from "../toonstudio-brand";
import type { WorkspaceNavigationContext } from "./workspace-navigation-model";
import { SITE_NAVIGATION_ITEMS, siteNavigationText } from "../site-navigation";

const WorkspaceMenuNavigation = lazyRetry(
  () => import("./WorkspaceMenuNavigation").then(
    (module) => ({ default: module.WorkspaceMenuNavigation }),
    // 선택 메뉴를 받을 수 없어도 기존 목적지와 음악 진입은 유지한다.
    () => ({ default: WorkspaceNavigation }),
  ),
  "WorkspaceMenuNavigation",
);

export function WorkspaceBrand({
  href = "/home",
  compact = false,
}: {
  readonly href?: string;
  readonly compact?: boolean;
}) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const destination = href.split(/[?#]/u)[0] === "/studio"
    ? (korean ? "내 프로젝트" : "My projects")
    : (korean ? "홈" : "home");
  return <Link href={href} className="workspace-brand" data-compact={compact || undefined}>
    <ToonStudioMark className="workspace-brand-mark" />
    <strong><ToonStudioWordmark /></strong>
    <span className="sr-only">{destination}</span>
  </Link>;
}

/** Only navigation lives here. Selection, permissions and document state stay with their owners. */
export function WorkspaceSidebar({ activeId, context, children }: {
  readonly activeId?: string;
  readonly context?: WorkspaceNavigationContext;
  readonly children?: ReactNode;
}) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const { pathname } = useLocation();
  const mobile = useMediaQuery("(max-width: 767px)");
  const path = canonicalSitePath(pathname);
  const helpCurrent = path === "/help" || path.startsWith("/help/");
  const settingsCurrent = path === "/settings" || path.startsWith("/settings/");
  // 데스크톱·태블릿 좌측 레일은 하단에 도움말·설정 직접 진입을 함께 보여주므로 해당 경로에서는
  // 보조 내비만 현재 위치로 강조하고 주 메뉴의 전체 메뉴 중복 강조는 해제한다(모바일 하단 5탭은 그대로 유지).
  const resolvedActiveId = !mobile && activeId === undefined && (helpCurrent || settingsCurrent)
    ? ""
    : activeId;
  return <aside className="workspace-sidebar" data-slot="workspace-sidebar">
    <Suspense fallback={<WorkspaceNavigation activeId={resolvedActiveId} context={context} />}>
      <WorkspaceMenuNavigation activeId={resolvedActiveId} context={context} />
    </Suspense>
    {children}
    <nav className="workspace-support-nav" aria-label={korean ? "도움과 환경 설정" : "Help and preferences"}>
      <Link href="/help" aria-current={helpCurrent ? "page" : undefined}><HelpCircle size={17} strokeWidth={1.6} aria-hidden="true" /><span>{siteNavigationText(SITE_NAVIGATION_ITEMS.help.label, korean ? "ko" : "en")}</span></Link>
      <Link href="/settings" aria-current={settingsCurrent ? "page" : undefined}><Settings size={17} strokeWidth={1.6} aria-hidden="true" /><span>{siteNavigationText(SITE_NAVIGATION_ITEMS.settings.label, korean ? "ko" : "en")}</span></Link>
    </nav>
  </aside>;
}

export function WorkspaceAccountAction({
  showCampusControls = true,
}: {
  readonly showCampusControls?: boolean;
} = {}) {
  const account = useContext(WorkspaceAccountContext);
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  return <>
    {showCampusControls ? <CampusControls compact /> : null}
    {account ?? <Link href="/my" aria-label={korean ? "내 프로필" : "My profile"}><UserRound size={18} strokeWidth={1.6} aria-hidden="true" /></Link>}
  </>;
}
