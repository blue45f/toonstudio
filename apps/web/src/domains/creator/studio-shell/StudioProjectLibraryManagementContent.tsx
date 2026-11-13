import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ChevronDown, FolderOpen } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { STUDIO_START_GATEWAY_HREF } from "../studio-start-entry";
import { studioLibraryRecentWork } from "./studio-library-recent-work";
import {
  StudioProjectLibraryRecoveryRow, StudioProjectSelectionCheckbox,
} from "./StudioProjectLibraryManagementUi";
import { StudioProjectLibraryCardActions, StudioProjectLibraryCompactCard } from "./StudioProjectLibraryCompactCard";
import { StudioProjectLibraryResumeCard } from "./StudioProjectLibraryResumeCard";
import { StudioProjectLibraryFastStartStrip } from "./StudioProjectLibraryFastStartStrip";
import { STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS, STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS, studioProjectLibraryManagementViewHref } from "./studio-project-library-management-model";
import { StudioExampleProjectBanner } from "../workspace/StudioExampleProjectBanner";
import { StudioSampleManuscriptCard } from "../workspace/StudioSampleManuscriptCard";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryManagementContent", ko, en);

const INITIAL_SECTION_PROJECT_COUNT = 24;
const SECTION_PROJECT_STEP = 24;

export function StudioProjectLibraryManagementContent({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const {
    locale, authUserId, view, library, profiles, query, setQuery, selectedIds, setSelectedIds, setSelection, viewCounts,
    busyProjectId, setSaveTarget, setDeleteRequest,
    visibleProjects, temporaryProjects, archiveProjects,
    trashProjects, restoreProjects, duplicateProject, savePackage,
    projectOverviewHref, projectResumeTarget,
  } = controller;
  const [visibleActiveCount, setVisibleActiveCount] = useState(INITIAL_SECTION_PROJECT_COUNT);
  const [visibleRecoveryCount, setVisibleRecoveryCount] = useState(INITIAL_SECTION_PROJECT_COUNT);
  const [selectionMode, setSelectionMode] = useState(false);
  const selectionVisible = selectionMode || selectedIds.size > 0;

  const mutationTrigger = useRef<Element | null>(null);
  const activeGridRef = useRef<HTMLDivElement>(null);
  const recoveryListRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{ list: HTMLElement | null; index: number; trigger: HTMLButtonElement } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    // 마지막 확장에서 버튼이 제거돼도, 중간 확장에서 새 카드가 앞에 생겨도 읽던 위치를 잃지 않는다.
    if (pending.trigger.isConnected && document.activeElement !== pending.trigger) return;
    pending.list?.querySelectorAll<HTMLElement>(selectionVisible || view !== "active"
      ? '[data-studio-selection-checkbox="true"]' : '[data-studio-card-continue="true"]')[pending.index]?.focus();
  }, [selectionVisible, view, visibleActiveCount, visibleRecoveryCount]);

  useLayoutEffect(() => {
    const trigger = mutationTrigger.current;
    mutationTrigger.current = null;
    if (trigger && !trigger.isConnected && document.activeElement === document.body) {
      document.querySelector<HTMLElement>('[data-studio-library-notice="true"]')?.focus();
    }
  }, [visibleProjects]);

  const mutateProject = (action: () => void) => {
    mutationTrigger.current = document.activeElement;
    action();
  };

  useEffect(() => {
    setVisibleActiveCount(INITIAL_SECTION_PROJECT_COUNT);
    setVisibleRecoveryCount(INITIAL_SECTION_PROJECT_COUNT);
  }, [view, query]);

  const recentProject = view === "active" && !query.trim()
    ? studioLibraryRecentWork(visibleProjects, projectResumeTarget)[0] ?? null
    : null;
  const otherProjects = visibleProjects.filter((project) => project.id !== recentProject?.id);
  const shownProjects = otherProjects.slice(0, visibleActiveCount - (recentProject ? 1 : 0));
  const shownRecoveryProjects = visibleProjects.slice(0, visibleRecoveryCount);
  const temporaryIds = new Set(temporaryProjects.map((project) => project.id));

  const projectCardProps = (project: StudioProjectLibraryEntry): ComponentProps<typeof StudioProjectLibraryCompactCard> => {
    const profile = profiles.profileFor(project.id);
    const resumeTarget = projectResumeTarget(project);
    const checked = selectedIds.has(project.id);
    return {
      project, profile, locale, authUserId, checked, temporary: temporaryIds.has(project.id),
      isMostRecent: recentProject?.id === project.id, selectionVisible,
      localFileSaved: profile.bindings.some((binding) => binding.provider === "local-file" && binding.syncState === "synced"),
      busy: busyProjectId !== null, continueHref: resumeTarget.href,
      resumeSummary: resumeTarget.summary, resumeExact: resumeTarget.exact,
      overviewHref: projectOverviewHref(project),
      storageHref: `/studio?view=storage&project=${encodeURIComponent(project.id)}`,
      onToggle: () => setSelection(project.id, !checked),
      onTouch: () => { library.touch(project.id, resumeTarget.documentId); },
      onOpenSave: () => setSaveTarget(project),
      onSavePackage: () => { void savePackage(project); },
      onDuplicate: () => mutateProject(() => duplicateProject(project)),
      onArchive: () => mutateProject(() => archiveProjects([project.id])),
      onTrash: () => mutateProject(() => trashProjects([project.id])),
    };
  };
  const recentProps = recentProject ? projectCardProps(recentProject) : null;

  const renderRecoveryRow = (project: StudioProjectLibraryEntry) => {
    const checked = selectedIds.has(project.id);
    return (
      <StudioProjectLibraryRecoveryRow
        key={project.id}
        project={project}
        locale={locale}
        view={view}
        checked={checked}
        onToggle={() => setSelection(project.id, !checked)}
        onRestore={() => restoreProjects([project.id])}
        onTrash={() => trashProjects([project.id])}
        onDelete={() => setDeleteRequest({ ids: [project.id], source: "single" })}
      />
    );
  };

  return (
    <>
      {visibleProjects.length === 0 ? (
        view === "active" && !query ? (
          null
        ) : (
          <section
            data-studio-empty-state={query ? "search" : view}
            className="mt-5 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-12 text-center sm:py-14"
          >
            <FolderOpen size={24} className="mx-auto text-fg-3" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-black text-fg">
              {query
                ? bi("검색 결과가 없습니다", "No matching projects")
                : bi("표시할 작업이 없습니다", "No work to show")}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-3">
              {query
                ? bi("검색어를 바꾸거나 필터를 초기화해 보세요.", "Try another search or clear the filters.")
                : view === "archived"
                  ? bi("보관한 프로젝트가 없습니다. 진행 중인 작업을 정리할 때 보관함으로 옮겨 두면 이곳에서 언제든 복원할 수 있습니다.", "There are no archived projects. Move active work here whenever you want to tidy up and restore it later.")
                  : bi("휴지통이 비어 있습니다. 삭제한 작업은 완전 삭제 전까지 이곳에서 복원할 수 있습니다.", "Trash is empty. Deleted work stays here until you permanently remove it.")}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {query ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      document.querySelector<HTMLInputElement>('[data-studio-library-search-input="true"]')?.focus();
                    }}
                    className={buttonClass({ size: "sm", className: "min-h-12" })}
                  >
                    {bi("검색어 지우기", "Clear search")}
                  </button>
                  <Link href={STUDIO_START_GATEWAY_HREF} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-12" })}>
                    {bi("새 작업 시작", "Start new work")}
                  </Link>
                  <Link href="/studio/import" className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-12" })}>
                    {bi(".toonstudio 파일 열기", "Open .toonstudio file")}
                  </Link>
                </>
              ) : view === "archived" ? (
                <>
                  <Link href="/studio" className={buttonClass({ size: "sm", className: "min-h-12" })}>
                    {bi("내 작업으로 돌아가기", "Back to My work")}
                  </Link>
                  <Link href={STUDIO_START_GATEWAY_HREF} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-12" })}>
                    {bi("새 작업 시작", "Start new work")}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/studio" className={buttonClass({ size: "sm", className: "min-h-12" })}>
                    {bi("내 작업으로 돌아가기", "Back to My work")}
                  </Link>
                  <Link href="/studio/import" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-12" })}>
                    {bi("백업 파일 열기", "Open backup file")}
                  </Link>
                </>
              )}
            </div>
          </section>
        )
      ) : view === "active" ? (
        <div className="studio-library-workspace" data-studio-project-sections="true" data-has-recent-work={Boolean(recentProps)}>
          {recentProps ? <StudioProjectLibraryResumeCard key={recentProps.project.id}
            project={recentProps.project} profile={recentProps.profile} authUserId={authUserId}
            locale={locale} resumeHref={recentProps.continueHref} resumeSummary={recentProps.resumeSummary}
            overviewHref={recentProps.overviewHref} onResume={recentProps.onTouch} checked={recentProps.checked}
            selection={selectionVisible ? <StudioProjectSelectionCheckbox checked={recentProps.checked}
              label={formatI18nTemplate(String(bi("{value0} 선택", "Select {value0}")), { value0: recentProps.project.title })}
              onChange={recentProps.onToggle} /> : null}
            management={<StudioProjectLibraryCardActions {...recentProps} />}
          /> : null}
          <section className="studio-library-other-work" aria-labelledby="studio-library-work-list-title">
            <div className="studio-library-work-list-heading">
              <h2 id="studio-library-work-list-title">{recentProps ? bi("다른 작업", "Other work") : bi("작업 목록", "Work list")}</h2>
              <button type="button" aria-pressed={selectionVisible} onClick={() => {
                if (selectionVisible) { setSelectionMode(false); setSelectedIds(new Set()); }
                else setSelectionMode(true);
              }}>{selectionVisible ? bi("선택 마치기", "Finish selecting") : bi("작품 선택", "Select work")}</button>
            </div>
            <div ref={activeGridRef} data-studio-project-grid="active" className="studio-library-compact-grid">
              {shownProjects.map((project) => <StudioProjectLibraryCompactCard key={project.id} {...projectCardProps(project)} />)}
            </div>
            {otherProjects.length === 0 ? <p className="studio-library-list-empty">{bi("다른 작업을 시작하면 이곳에 모여요.", "Your other work will appear here.")}</p> : null}
            {otherProjects.length > shownProjects.length ? (
              <button type="button" data-studio-load-more="active" className="studio-library-load-more"
                onClick={(event) => {
                  if (event.detail === 0) pendingFocus.current = { list: activeGridRef.current, index: shownProjects.length, trigger: event.currentTarget };
                  setVisibleActiveCount((count) => count + SECTION_PROJECT_STEP);
                }}>
                {formatI18nTemplate(String(bi("작업 더 보기 ({value0}개 남음)", "Show more work ({value0} left)")), { value0: otherProjects.length - shownProjects.length })}
              </button>
            ) : null}
          </section>
        </div>
      ) : (
        <section ref={recoveryListRef} className="mt-5 space-y-3" data-studio-recovery-list={view}>
          {shownRecoveryProjects.map(renderRecoveryRow)}
          {visibleProjects.length > shownRecoveryProjects.length ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                data-studio-load-more="recovery"
                onClick={(event) => {
                  if (event.detail === 0) pendingFocus.current = { list: recoveryListRef.current, index: shownRecoveryProjects.length, trigger: event.currentTarget };
                  setVisibleRecoveryCount((count) => count + SECTION_PROJECT_STEP);
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-12" })}
              >
                {formatI18nTemplate(
                  String(bi("목록 더 보기 ({value0}개 남음)", "Show more items ({value0} left)")),
                  { value0: visibleProjects.length - shownRecoveryProjects.length },
                )}
              </button>
            </div>
          ) : null}
        </section>
      )}

      <div className="studio-library-secondary-tools">
        {view === "active" ? <details className="studio-library-view-management rounded-xl border border-line bg-card">
          <summary>{bi("작품 관리·가져오기", "Manage and import work")}</summary>
          <nav className="studio-library-management-links" aria-label={bi("내 작업 보기", "My work views")}>
            {(["active", "archived", "trash"] as const).map((candidate) => <Link key={candidate}
              href={studioProjectLibraryManagementViewHref(candidate)} aria-current={candidate === view ? "page" : undefined}>
              {bi(STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate].ko, STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate].en)}
              <span>{viewCounts[candidate]}</span>
            </Link>)}
            <Link href="/studio/import">{bi("파일에서 작업 열기", "Open work from file")}</Link>
          </nav>
        </details> : null}
        {view === "active" && !query.trim() ? <details className="studio-library-alternative-starts group rounded-xl border border-line bg-card" data-studio-other-starts="true">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {bi("다른 작업 시작", "Start something else")}
              <ChevronDown size={16} aria-hidden="true" className="group-open:rotate-180" />
            </summary>
            <StudioProjectLibraryFastStartStrip className="px-3 pb-3" />
          </details> : null}
        <details className="studio-library-auxiliary-management rounded-xl border border-line bg-card">
          <summary className="min-h-12 cursor-pointer rounded-xl px-3 py-3 text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {bi("저장·내보내기·제작 관리", "Save, export and production")}
          </summary>
          <div className="px-3 pb-3">
            <p className="mb-2 text-xs leading-5 text-fg-2 sm:hidden">
              {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).en)}
            </p>
            {view === "active" ? <div className="mb-3 space-y-1 text-xs leading-5 text-fg-2">
              <p><strong>{bi("임시 작업", "Temporary work")}</strong> — <span>{bi("저장 위치를 아직 지정하지 않은 작업입니다. 원고를 열어 실제 저장 상태를 확인하세요.", "These projects have no chosen save destination. Open a manuscript to check its current save status.")}</span></p>
              <p><strong>{bi("프로젝트", "Projects")}</strong> — <span>{bi("저장 설정이 있는 프로젝트입니다. 실제 저장 위치와 완료 시각은 원고에서 확인하세요.", "These projects have save settings. Check the manuscript for the actual destination and completed save time.")}</span></p>
            </div> : null}
            <nav className="flex flex-wrap items-center gap-1" aria-label={bi("저장과 배포", "Storage and distribution")}>
              <Link href="/studio/recovery" className="inline-flex min-h-12 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
                {bi("작업 복구", "Recover work")}
              </Link>
              <Link href="/studio/import" className="inline-flex min-h-12 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
                {bi(".toonstudio 파일 열기", "Open .toonstudio file")}
              </Link>
              <Link href="/studio?view=storage" className="inline-flex min-h-12 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
                {bi("저장·백업", "Save & backup")}
              </Link>
              <Link href="/studio?view=exports" className="inline-flex min-h-12 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
                {bi("내보내기", "Export")}
              </Link>
              <Link href="/studio?view=publications" className="inline-flex min-h-12 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
                {bi("게시", "Publishing")}
              </Link>
            </nav>
            <Link href="/production" className={buttonClass({ variant: "quiet", className: "min-h-12 whitespace-normal" })}>
              {bi("제작 관리", "Production management")}
            </Link>
            <p className="mt-3 text-xs leading-5 text-fg-3">
              {bi("임시 자동저장, 정식 저장, 백업, 내보내기와 게시를 분리해 관리합니다. 휴지통의 완전 삭제만 되돌릴 수 없습니다.", "Temporary autosave, explicit save, backup, export and publishing are managed separately. Only permanent deletion from Trash cannot be undone.")}
            </p>
          </div>
        </details>
      </div>

      {/* 접힌 안내도 마운트를 유지해 시딩과 진행 상태를 보존한다. 오류·복구 안내는 접지 않는다. */}
      {view === "active" && !query ? <StudioExampleProjectBanner compact /> : null}
      {view === "active" && !query ? <StudioSampleManuscriptCard compact /> : null}
    </>
  );
}
