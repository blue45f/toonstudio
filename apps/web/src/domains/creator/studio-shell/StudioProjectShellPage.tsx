import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowLeftRight,
  ArrowRight, Brush,
  CheckCircle2,
  ChevronDown,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatCreatorRelativeTime } from "@/shared/lib/creator-continuity-destinations";
import { useI18n } from "@/shared/lib/i18n";
import { useSession } from "@/domains/auth/public/session/auth-session-store";

import { cn } from "@/shared/lib/utils";

import {
  STUDIO_PROJECT_SECTION_VIEWS,
  resolveStudioProjectView,
  studioProjectDefaultView,
  type StudioProjectSection as StudioProjectSectionId,
} from "../studio-project-views";
import { resolveStudioProjectViewDestination } from "../studio-project-view-destinations";
import {
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import {
  readStudioProjectDocuments,
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
} from "../studio-project-document-reader";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import { preserveStudioLaunchDensity, readStudioLaunchDensity } from "../studio-launch-mode";
import { readStudioReviewHistory } from "../studio-review-history-store";
import { StudioBeginnerQuickTipsBar } from "./guided-flow/StudioBeginnerQuickTipsBar";
import { StudioJourneyStepBar, type StudioJourneyStepId } from "./StudioJourneyStepBar";
import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import { StudioProjectDiagnosticsBridge } from "./StudioProjectDiagnosticsBridge";
import { StudioProjectStoryPlanning } from "../planning/StudioProjectStoryPlanning";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";
import {
  PRIMARY_SECTIONS,
  PROJECT_STATUS_LABELS,
  SECONDARY_SECTIONS,
  SECTION_DEFINITIONS,
  localeFromLanguage,
  projectStatusChipClasses,
  projectViewHref,
  workHref,
  type ProjectAction,
} from "./studio-project-shell-definitions";
import "./studio-illustrated-project-surfaces.css";

export type StudioProjectSection = StudioProjectSectionId;

interface ProjectHeaderFacts {
  readonly documentCount: number;
  /** 프로젝트·문서 저장 시각 중 가장 최근 값(ms). 없으면 null. */
  readonly lastSavedAt: number | null;
  /** 검토 중 세션에 열려 있는 스레드 수. */
  readonly pendingReviewCount: number;
  readonly resumeHref: string;
  /** 이어서 열 수 있는 활성 문서가 실제로 있는지. */
  readonly hasResumeDocument: boolean;
  readonly resumeSummary: string | null;
}

function readProjectHeaderFacts(
  entry: StudioProjectLibraryEntry,
  locale: "ko" | "en",
): ProjectHeaderFacts | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const documents = readStudioProjectDocuments(storage, entry.id).documents
      .filter((document) => document.status !== "trashed");
    const savedCandidates = [entry.updatedAt, ...documents.map((document) => document.updatedAt)]
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value));
    const reviewHistory = readStudioReviewHistory(storage, entry.id);
    const pendingReviewCount = reviewHistory.sessions
      .filter((session) => session.status === "in-review" || session.status === "changes-requested")
      .reduce(
        (sum, session) => sum + session.threads.filter((thread) => thread.status === "open").length,
        0,
      );
    const resume = resolveStudioProjectResumeTarget(storage, entry, locale);
    const activeDocumentCount = documents.filter((document) => document.status === "active").length;
    return {
      documentCount: activeDocumentCount,
      lastSavedAt: savedCandidates.length > 0 ? Math.max(...savedCandidates) : null,
      pendingReviewCount,
      resumeHref: resume.href,
      hasResumeDocument: activeDocumentCount > 0,
      resumeSummary: resume.summary,
    };
  } catch {
    return null;
  }
}

function projectSectionHref(projectId: string, section: StudioProjectSection): string {
  return `/studio/p/${encodeURIComponent(projectId)}/${section}`;
}

function journeyStepFromSection(section: StudioProjectSection): StudioJourneyStepId {
  if (section === "overview" || section === "story") return "start";
  if (section === "review" || section === "export") return "export";
  return "edit";
}

function resolveProjectActionHref(
  section: StudioProjectSection,
  actionItem: ProjectAction,
  projectId: string,
  headerFacts: ProjectHeaderFacts | null,
): string {
  const defaultHref = actionItem.href(projectId);
  if (
    section === "export" &&
    headerFacts?.hasResumeDocument &&
    defaultHref === workHref(projectId, "publish")
  ) {
    return headerFacts.resumeHref;
  }
  return defaultHref;
}

function InvalidProject() {
  const bt = useBilingual("StudioProjectShellPage.InvalidProject");
  return (
    <Container size="wide" className="py-10">
      <section className="rounded-3xl border border-line bg-card p-6" role="alert">
        <h1 className="text-xl font-bold text-fg">
          {bt("프로젝트를 찾을 수 없어요.", "Project not found.")}
        </h1>
        <p className="mt-2 text-sm text-fg-3">
          {bt("저장된 작업은 변경하지 않았습니다. 내 작업에서 프로젝트를 다시 선택하세요.", "No saved work was changed. Choose the project again from My work.")}
        </p>
        <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
          {bt("내 작업으로", "Go to My work")}
        </Link>
      </section>
    </Container>
  );
}

export function StudioProjectShellPage({ section }: { readonly section: StudioProjectSection }) {
  const bt = useBilingual("StudioProjectShellPage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const { data: session } = useSession();
  const authUserId = session?.user?.id ?? null;
  const definition = SECTION_DEFINITIONS[section];
  const SectionIcon = definition.icon;
  const displayProjectId = useMemo(() => {
    try {
      return decodeURIComponent(projectId);
    } catch {
      return projectId;
    }
  }, [projectId]);
  const viewResolution = useMemo(() => {
    try {
      return resolveStudioProjectView(displayProjectId, section, location.search);
    } catch {
      return null;
    }
  }, [displayProjectId, location.search, section]);
  const selectedView = viewResolution?.view ?? studioProjectDefaultView(section);
  const destination = useMemo(() => {
    try {
      return resolveStudioProjectViewDestination(displayProjectId, section, selectedView);
    } catch {
      return null;
    }
  }, [displayProjectId, section, selectedView]);

  const [libraryRevision, setLibraryRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setLibraryRevision((value) => value + 1);
    window.addEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, refresh);
    window.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, refresh);
      window.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
    };
  }, []);

  const projectEntry = useMemo(() => {
    void libraryRevision;
    if (typeof window === "undefined") return null;
    try {
      return readStudioProjectLibrary(window.localStorage).projects.find(
        (candidate) => candidate.id === displayProjectId,
      ) ?? null;
    } catch {
      return null;
    }
  }, [displayProjectId, libraryRevision]);

  const projectTitle = projectEntry && projectEntry.title.trim()
    ? projectEntry.title
    : displayProjectId;

  const headerFacts = useMemo(() => {
    void libraryRevision;
    if (!projectEntry) return null;
    return readProjectHeaderFacts(projectEntry, locale);
  }, [libraryRevision, locale, projectEntry]);

  const recentProjects = useMemo(() => {
    void libraryRevision;
    if (typeof window === "undefined") return [];
    try {
      return readStudioProjectLibrary(window.localStorage).projects
        .filter((project) => project.status === "active" && project.id !== displayProjectId)
        .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt))
        .slice(0, 5);
    } catch {
      return [];
    }
  }, [displayProjectId, libraryRevision]);

  useDocumentTitle(`${bt(definition.label.ko, definition.label.en)} · ToonStudio`);

  if (!projectId || !viewResolution || !destination) return <InvalidProject />;
  if (viewResolution.changed) return <Navigate to={viewResolution.canonicalHref} replace />;

  const sectionViews = STUDIO_PROJECT_SECTION_VIEWS[section];
  const primaryAction = definition.actions[0] ?? null;
  const secondaryActions = definition.actions.slice(1);
  const PrimaryActionIcon = primaryAction?.icon ?? SectionIcon;
  const secondaryNavigationActive = section === "assets" || section === "settings";
  const launchHref = (href: string) => preserveStudioLaunchDensity(href, location.search);
  const focusedScript = section === "story" && selectedView === "script"
    && readStudioLaunchDensity(location.search) === "focus";
  if (focusedScript) {
    const fullParams = new URLSearchParams(location.search);
    fullParams.set("uiMode", "full");
    const [continuePath, continueSearch = ""] = launchHref(headerFacts?.hasResumeDocument ? headerFacts.resumeHref : workHref(displayProjectId)).split("?", 2);
    const continueParams = new URLSearchParams(continueSearch);
    continueParams.set("startTool", "draw");
    return (
      <Container size="wide" className="py-4 sm:py-6">
        <header data-studio-project-shell="focused-script" className="rounded-2xl border border-line bg-card p-4 sm:p-5">
          <Link href="/studio" className="inline-flex min-h-11 items-center text-sm font-semibold text-fg-2 hover:text-accent">{bt("내 작업으로", "Back to My work")}</Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-fg-2">{projectTitle}</p>
              <h1 className="mt-1 text-2xl font-black text-fg">{bt("대본 확인하고 이어 그리기", "Review your script and keep drawing")}</h1>
            </div>
            <Link
              href={`${continuePath}?${continueParams.toString()}`}
              data-studio-project-header-continue="true"
              className={buttonClass({ size: "lg", className: "gap-2" })}
            >
              <Brush size={17} aria-hidden="true" />{bt("이어서 그리기", "Continue drawing")}
            </Link>
          </div>
          <details className="mt-3 rounded-xl border border-line bg-panel/40">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("프로젝트 메뉴", "Project menu")}</summary>
            <nav aria-label={bt("프로젝트 주요 단계", "Main project stages")} className="flex flex-wrap gap-2 border-t border-line p-2">
              {PRIMARY_SECTIONS.map((id) => <Link key={id} href={launchHref(projectSectionHref(displayProjectId, id))} aria-current={id === section ? "page" : undefined} className={buttonClass({ variant: "quiet", className: "min-h-11" })}>{bt(SECTION_DEFINITIONS[id].label.ko, SECTION_DEFINITIONS[id].label.en)}</Link>)}
            </nav>
            <Link className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-accent" href={`${projectSectionHref(displayProjectId, "story")}?${fullParams.toString()}`}>{bt("전체 기획 도구 보기", "Show all planning tools")}</Link>
          </details>
        </header>
        <StudioProjectDiagnosticsBridge projectId={displayProjectId} />
      </Container>
    );
  }

  return (
    <Container
      size="wide"
      className="py-4 sm:py-6 lg:py-8"
      data-studio-illustrated-surface="project"
      data-studio-project-shell="simple"
    >
      <CampusObjectSource objects={[
        {
          id: displayProjectId,
          title: displayProjectId,
          href: `/studio/p/${encodeURIComponent(displayProjectId)}/overview`,
          kind: "project",
          exposure: "private",
        },
        {
          id: `${displayProjectId}.review`,
          title: `${displayProjectId} · Review`,
          href: `/studio/p/${encodeURIComponent(displayProjectId)}/review`,
          kind: "review",
          exposure: "private",
        },
      ]} />
      <header
        className="rounded-2xl border border-line bg-panel/65 p-4 shadow-sm sm:p-6"
        data-studio-project-simple-header="true"
      >
        <nav
          aria-label={bt("현재 위치", "Current location")}
          className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-fg-3"
        >
          <Link href="/studio" className="shrink-0 font-semibold hover:text-accent">
            {bt("내 작업", "My work")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={launchHref(projectSectionHref(displayProjectId, "overview"))}
            className="min-w-0 max-w-56 truncate font-semibold hover:text-accent"
            title={projectTitle}
          >
            {projectTitle}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="shrink-0">{bt(definition.label.ko, definition.label.en)}</span>
        </nav>
        <div
          className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4"
          data-studio-project-header-band="true"
        >
          <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-panel sm:w-[4.5rem]">
            {projectEntry ? (
              <StudioProjectCardThumbnail
                variant="cover"
                authUserId={authUserId}
                locale={locale}
                project={projectEntry}
              />
            ) : (
              <div
                className="grid h-full place-items-center bg-gradient-to-br from-accent-soft to-panel px-1 text-center"
                aria-hidden="true"
              >
                <span className="line-clamp-3 text-[0.65rem] font-black leading-tight text-accent">
                  {projectTitle}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-44 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <strong className="min-w-0 max-w-full truncate text-lg font-black tracking-tight text-fg sm:text-xl">
                {projectTitle}
              </strong>
              {projectEntry ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold",
                    projectStatusChipClasses(projectEntry.status),
                  )}
                  data-studio-project-status-chip={projectEntry.status}
                >
                  {bt(
                    PROJECT_STATUS_LABELS[projectEntry.status].ko,
                    PROJECT_STATUS_LABELS[projectEntry.status].en,
                  )}
                </span>
              ) : null}
            </div>
            {headerFacts ? (
              <ul
                className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3"
                aria-label={bt("프로젝트 핵심 지표", "Project key metrics")}
                data-studio-project-header-metrics="true"
              >
                <li>{bt(`원고 ${headerFacts.documentCount}개`, `${headerFacts.documentCount} manuscripts`)}</li>
                {headerFacts.lastSavedAt !== null ? (
                  <li>
                    {bt(
                      `최근 저장 ${formatCreatorRelativeTime(headerFacts.lastSavedAt, locale)}`,
                      `Saved ${formatCreatorRelativeTime(headerFacts.lastSavedAt, locale)}`,
                    )}
                  </li>
                ) : null}
                <li>{bt(`검토 대기 ${headerFacts.pendingReviewCount}건`, `${headerFacts.pendingReviewCount} awaiting review`)}</li>
              </ul>
            ) : null}
          </div>
          {headerFacts?.hasResumeDocument ? (
            <Link
              href={launchHref(headerFacts.resumeHref)}
              data-studio-project-header-continue="true"
              title={headerFacts.resumeSummary ?? undefined}
              className={buttonClass({ size: "lg", className: "shrink-0 gap-2" })}
            >
              <Brush size={17} aria-hidden="true" />
              {bt("이어서 그리기", "Continue drawing")}
            </Link>
          ) : (
            <Link
              href={launchHref(workHref(displayProjectId))}
              data-studio-project-header-continue="true"
              className={buttonClass({ size: "lg", className: "shrink-0 gap-2" })}
            >
              <Brush size={17} aria-hidden="true" />
              {bt("원고 열기", "Open manuscript")}
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
              <SectionIcon size={14} aria-hidden="true" />
              {bt(definition.label.ko, definition.label.en)}
            </span>
            <h1 className="mt-3 text-pretty text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bt(definition.title.ko, definition.title.en)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
              {bt(definition.description.ko, definition.description.en)}
            </p>
            <p className="mt-2 truncate text-xs text-fg-3">
              {bt("프로젝트", "Project")} · {displayProjectId}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentProjects.length > 0 ? (
              <details className="group relative" data-studio-project-switcher="true">
                <summary
                  className={buttonClass({ size: "lg", variant: "outline", className: "cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden" })}
                  aria-label={bt("최근 프로젝트로 전환", "Switch to a recent project")}
                >
                  <ArrowLeftRight size={17} aria-hidden="true" />
                  <span>{bt("프로젝트 전환", "Switch project")}</span>
                  <ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-card shadow-xl">
                  <p className="border-b border-line px-4 py-2.5 text-xs font-bold text-fg-3">
                    {bt("최근 프로젝트", "Recent projects")}
                  </p>
                  <nav
                    aria-label={bt("최근 프로젝트", "Recent projects")}
                    className="max-h-72 overflow-y-auto p-1.5"
                  >
                    {recentProjects.map((project) => (
                      <Link
                        key={project.id}
                        href={projectSectionHref(project.id, section)}
                        onClick={(event) => {
                          const panel = event.currentTarget.closest("details");
                          if (panel) panel.open = false;
                        }}
                        className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <span className="min-w-0 flex-1 truncate">{project.title}</span>
                      </Link>
                    ))}
                  </nav>
                  <div className="border-t border-line p-1.5">
                    <Link
                      href="/studio"
                      onClick={(event) => {
                        const panel = event.currentTarget.closest("details");
                        if (panel) panel.open = false;
                      }}
                      className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-accent transition-colors hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <span className="min-w-0 flex-1 truncate">{bt("모든 작업 보기", "View all work")}</span>
                      <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </details>
            ) : null}
            <Link
              href={`/studio/p/${encodeURIComponent(displayProjectId)}/space`}
              className={buttonClass({ size: "lg", variant: "quiet", className: "gap-2 text-fg" })}
              data-studio-enter-virtual-space="true"
            >
              <Users size={17} aria-hidden="true" />
              {bt("팀 공간", "Team space")}
            </Link>
          </div>
        </div>
      </header>

      <StudioJourneyStepBar
        currentStep={journeyStepFromSection(section)}
        startHref={launchHref(projectSectionHref(displayProjectId, "story"))}
        editHref={launchHref(headerFacts?.hasResumeDocument ? headerFacts.resumeHref : workHref(displayProjectId))}
        exportHref={launchHref(projectSectionHref(displayProjectId, "export"))}
        className="mt-4"
      />

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <nav
          aria-label={bt("프로젝트 주요 단계", "Main project stages")}
          className="overflow-x-auto rounded-2xl border border-line bg-card p-1.5"
          data-studio-project-primary-navigation="true"
        >
          <div className="flex min-w-max gap-1">
            {PRIMARY_SECTIONS.map((id) => {
              const active = id === section;
              return (
                <Link
                  key={id}
                  href={launchHref(projectSectionHref(displayProjectId, id))}
                  aria-current={active ? "page" : undefined}
                  data-studio-project-primary-section={id}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors",
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {bt(SECTION_DEFINITIONS[id].label.ko, SECTION_DEFINITIONS[id].label.en)}
                </Link>
              );
            })}
          </div>
        </nav>

        <details
          open={secondaryNavigationActive || undefined}
          className={cn(
            "group rounded-2xl border bg-card p-1.5",
            secondaryNavigationActive ? "border-accent/55" : "border-line",
          )}
          data-studio-project-secondary-navigation="true"
        >
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg lg:min-w-40">
            <span className="inline-flex items-center gap-2">
              <MoreHorizontal size={16} aria-hidden="true" />
              {bt("소재·설정", "Assets & settings")}
            </span>
            <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-1 grid gap-1 border-t border-line pt-1">
            {SECONDARY_SECTIONS.map((id) => {
              const active = id === section;
              const Icon = SECTION_DEFINITIONS[id].icon;
              return (
                <Link
                  key={id}
                  href={launchHref(projectSectionHref(displayProjectId, id))}
                  aria-current={active ? "page" : undefined}
                  data-studio-project-secondary-section={id}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                    active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  {bt(SECTION_DEFINITIONS[id].label.ko, SECTION_DEFINITIONS[id].label.en)}
                </Link>
              );
            })}
          </div>
        </details>
      </div>

      <details
        className="group mt-3 rounded-2xl border border-line bg-card"
        data-studio-project-view-picker="true"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5">
          <span className="text-xs font-semibold text-fg-3">
            {bt("현재 화면", "Current view")}
          </span>
          <strong className="min-w-0 flex-1 truncate text-sm text-fg">
            {bt(destination.labelKo, destination.labelEn)}
          </strong>
          <span className="text-xs text-fg-3">
            {bt("화면 바꾸기", "Change view")}
          </span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <nav
          aria-label={bt(`${definition.label.ko} 세부 화면`, `${definition.label.en} views`)}
          className="grid gap-1 border-t border-line p-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {sectionViews.map((view) => {
            const active = view === selectedView;
            const viewLabel = resolveStudioProjectViewDestination(displayProjectId, section, view);
            return (
              <Link
                key={view}
                href={projectViewHref(displayProjectId, section, view, location.search)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {bt(viewLabel.labelKo, viewLabel.labelEn)}
              </Link>
            );
          })}
        </nav>
      </details>

      <section
        data-studio-project-view={selectedView}
        className="mt-4 rounded-2xl border border-accent/25 bg-accent-soft/20 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold text-accent">
              {bt("현재 화면", "Current view")}
            </p>
            <h2 className="mt-1 text-lg font-black text-fg">
              {bt(destination.labelKo, destination.labelEn)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {bt(destination.descriptionKo, destination.descriptionEn)}
            </p>
          </div>
          {destination.href ? (
            <Link
              href={launchHref(destination.href)}
              className={buttonClass({ variant: "outline", className: "shrink-0 gap-2" })}
            >
              {bt(destination.ctaKo, destination.ctaEn)}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <span className="rounded-full border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2">
              {bt(destination.ctaKo, destination.ctaEn)}
            </span>
          )}
        </div>
      </section>

      {section === "story" && (selectedView === "episodes" || selectedView === "characters" || selectedView === "world" || selectedView === "timeline") ? (
        <div
          className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5"
          data-studio-project-planning={selectedView}
        >
          <StudioProjectStoryPlanning projectId={displayProjectId} view={selectedView} />
        </div>
      ) : null}

      <StudioProjectDiagnosticsBridge projectId={displayProjectId} />

      {primaryAction ? (
        <section className="mt-5" aria-labelledby="project-next-action">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <SectionIcon size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-fg-3">{bt("추천", "Recommended")}</p>
              <h2 id="project-next-action" className="text-lg font-black text-fg">
                {bt("다음 작업", "Next action")}
              </h2>
            </div>
          </div>
          <Link
            href={launchHref(
              resolveProjectActionHref(section, primaryAction, displayProjectId, headerFacts),
            )}
            data-studio-project-primary-action="true"
            className="group mt-3 flex min-h-28 items-center gap-4 rounded-2xl border border-accent/35 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-raised hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:p-5"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <PrimaryActionIcon size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-base text-fg">
                {bt(primaryAction.title.ko, primaryAction.title.en)}
              </strong>
              <span className="mt-1 block text-sm leading-6 text-fg-3">
                {bt(primaryAction.description.ko, primaryAction.description.en)}
              </span>
            </span>
            <ArrowRight
              size={18}
              className="shrink-0 text-accent transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>

          {secondaryActions.length > 0 ? (
            <details
              className="group mt-3 rounded-2xl border border-line bg-card"
              data-studio-project-more-actions="true"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-fg-2 hover:text-fg">
                <span>{bt(`다른 작업 ${secondaryActions.length}개`, `${secondaryActions.length} more actions`)}</span>
                <ChevronDown
                  size={16}
                  className="transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="grid gap-1 border-t border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
                {secondaryActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.title.ko}
                      href={launchHref(
                        resolveProjectActionHref(section, item, displayProjectId, headerFacts),
                      )}
                      className="group flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:text-accent">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm text-fg">
                          {bt(item.title.ko, item.title.en)}
                        </strong>
                        <span className="mt-0.5 line-clamp-1 block text-xs text-fg-3">
                          {bt(item.description.ko, item.description.en)}
                        </span>
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      <details
        className="group mt-4 rounded-2xl border border-line bg-panel/45"
        data-studio-project-health="true"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5">
          <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-fg">
              {bt("프로젝트 상태", "Project status")}
            </strong>
            <span className="block text-xs text-fg-3">
              {bt("저장, 검토와 배포 준비를 필요할 때 확인하세요.", "Check saving, review and delivery readiness when needed.")}
            </span>
          </span>
          <ChevronDown
            size={16}
            className="transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-line p-2">
          <StudioProjectReadinessPanel
            projectId={displayProjectId}
            locale={locale}
            compact={section !== "overview"}
          />
        </div>
      </details>

      <StudioBeginnerQuickTipsBar />
    </Container>
  );
}
