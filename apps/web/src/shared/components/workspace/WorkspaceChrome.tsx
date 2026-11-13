import { HelpCircle, Settings, UserRound } from "lucide-react";
import { Suspense, useContext, type ReactNode } from "react";
import { WorkspaceAccountContext } from "./workspace-account-context";
import Link from "@/shared/navigation/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";
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
  return <Link href={href} className="workspace-brand">
    <ToonStudioMark className="workspace-brand-mark" />
    <strong><ToonStudioWordmark />{compact ? null : <small>STORY COMES TO LIFE</small>}</strong>
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
  return <aside className="workspace-sidebar" data-slot="workspace-sidebar">
    <p className="workspace-sidebar-caption" aria-hidden="true">WORKSPACE</p>
    <Suspense fallback={<WorkspaceNavigation activeId={activeId} context={context} />}>
      <WorkspaceMenuNavigation activeId={activeId} context={context} />
    </Suspense>
    {children}
    <nav className="workspace-support-nav" aria-label={korean ? "도움과 환경 설정" : "Help and preferences"}>
      <Link href="/help"><HelpCircle size={18} aria-hidden="true" /><span>{siteNavigationText(SITE_NAVIGATION_ITEMS.help.label, korean ? "ko" : "en")}</span></Link>
      <Link href="/settings"><Settings size={18} aria-hidden="true" /><span>{siteNavigationText(SITE_NAVIGATION_ITEMS.settings.label, korean ? "ko" : "en")}</span></Link>
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
    {account ?? <Link href="/my" aria-label={korean ? "내 프로필" : "My profile"}><UserRound size={20} aria-hidden="true" /></Link>}
  </>;
}
