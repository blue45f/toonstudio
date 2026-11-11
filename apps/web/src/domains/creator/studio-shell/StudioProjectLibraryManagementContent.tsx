import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { FolderOpen } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { studioLibraryRecentWork } from "./studio-library-recent-work";
import {
  StudioProjectLibraryCard,
  StudioProjectLibraryRecoveryRow,
} from "./StudioProjectLibraryManagementUi";
import { StudioExampleProjectBanner } from "../workspace/StudioExampleProjectBanner";
import { StudioSampleManuscriptCard } from "../workspace/StudioSampleManuscriptCard";
import { StudioWorkspaceLibraryEmptyState } from "../workspace/StudioWorkspaceLibraryEmptyState";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryManagementContent", ko, en);

const INITIAL_SECTION_PROJECT_COUNT = 12;
const SECTION_PROJECT_STEP = 24;

export function StudioProjectLibraryManagementContent({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const {
    locale, authUserId, view, library, profiles, query, setQuery, selectedIds, setSelection,
    busyProjectId, setSaveTarget, setDeleteRequest,
    visibleProjects, temporaryProjects, savedProjects, archiveProjects,
    trashProjects, restoreProjects, duplicateProject, savePackage,
    projectOverviewHref, projectResumeTarget,
  } = controller;
  const [visibleTemporaryCount, setVisibleTemporaryCount] = useState(INITIAL_SECTION_PROJECT_COUNT);
  const [visibleSavedCount, setVisibleSavedCount] = useState(INITIAL_SECTION_PROJECT_COUNT);
  const [visibleRecoveryCount, setVisibleRecoveryCount] = useState(INITIAL_SECTION_PROJECT_COUNT * 2);

  const temporaryGridRef = useRef<HTMLDivElement>(null);
  const savedGridRef = useRef<HTMLDivElement>(null);
  const recoveryListRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{ list: HTMLElement | null; index: number; trigger: HTMLButtonElement } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    // 마지막 확장에서 버튼이 제거돼도, 중간 확장에서 새 카드가 앞에 생겨도 읽던 위치를 잃지 않는다.
    if (pending.trigger.isConnected && document.activeElement !== pending.trigger) return;
    pending.list?.querySelectorAll<HTMLButtonElement>('[data-studio-selection-checkbox="true"]')[pending.index]?.focus();
  }, [visibleTemporaryCount, visibleSavedCount, visibleRecoveryCount]);

  useEffect(() => {
    setVisibleTemporaryCount(INITIAL_SECTION_PROJECT_COUNT);
    setVisibleSavedCount(INITIAL_SECTION_PROJECT_COUNT);
    setVisibleRecoveryCount(INITIAL_SECTION_PROJECT_COUNT * 2);
  }, [view, query]);

  const mostRecentProjectId = view === "active"
    ? studioLibraryRecentWork(visibleProjects, projectResumeTarget)[0]?.id ?? null
    : null;

  const shownTemporaryProjects = temporaryProjects.slice(0, visibleTemporaryCount);
  const shownSavedProjects = savedProjects.slice(0, visibleSavedCount);
  const shownRecoveryProjects = visibleProjects.slice(0, visibleRecoveryCount);

  const renderProjectCard = (project: StudioProjectLibraryEntry, temporary: boolean) => {
    const profile = profiles.profileFor(project.id);
    const resumeTarget = projectResumeTarget(project);
    const checked = selectedIds.has(project.id);
    const localFileSaved = profile.bindings.some((binding) => (
      binding.provider === "local-file" && binding.syncState === "synced"
    ));
    return (
      <StudioProjectLibraryCard
        key={project.id}
        project={project}
        profile={profile}
        locale={locale}
        authUserId={authUserId}
        checked={checked}
        temporary={temporary}
        isMostRecent={mostRecentProjectId === project.id}
        localFileSaved={localFileSaved}
        busy={busyProjectId !== null}
        continueHref={resumeTarget.href}
        resumeSummary={resumeTarget.summary}
        resumeExact={resumeTarget.exact}
        overviewHref={projectOverviewHref(project)}
        storageHref={`/studio?view=storage&project=${encodeURIComponent(project.id)}`}
        onToggle={() => setSelection(project.id, !checked)}
        onTouch={() => { library.touch(project.id, resumeTarget.documentId); }}
        onOpenSave={() => setSaveTarget(project)}
        onSavePackage={() => { void savePackage(project); }}
        onDuplicate={() => duplicateProject(project)}
        onArchive={() => archiveProjects([project.id])}
        onTrash={() => trashProjects([project.id])}
      />
    );
  };

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
          <StudioWorkspaceLibraryEmptyState />
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
                    className={buttonClass({ size: "sm", className: "min-h-11" })}
                  >
                    {bi("검색어 지우기", "Clear search")}
                  </button>
                  <Link href="/studio/new" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                    {bi("새 작업 시작", "Start new work")}
                  </Link>
                  <Link href="/studio/import" className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11" })}>
                    {bi(".toonstudio 파일 열기", "Open .toonstudio file")}
                  </Link>
                </>
              ) : view === "archived" ? (
                <>
                  <Link href="/studio" className={buttonClass({ size: "sm", className: "min-h-11" })}>
                    {bi("내 작업으로 돌아가기", "Back to My work")}
                  </Link>
                  <Link href="/studio/new" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                    {bi("새 작업 시작", "Start new work")}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/studio" className={buttonClass({ size: "sm", className: "min-h-11" })}>
                    {bi("내 작업으로 돌아가기", "Back to My work")}
                  </Link>
                  <Link href="/studio/import" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                    {bi("백업 파일 열기", "Open backup file")}
                  </Link>
                </>
              )}
            </div>
          </section>
        )
      ) : view === "active" ? (
        <div className="mt-6 space-y-8" data-studio-project-sections="true">
          {temporaryProjects.length > 0 ? (
            <section aria-labelledby="temporary-work-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="temporary-work-title" className="text-xl font-black text-fg">
                    {bi("임시 작업", "Temporary work")}
                    <span className="ml-2 text-sm font-bold text-fg-3">{temporaryProjects.length}</span>
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {bi("저장 위치를 아직 지정하지 않은 작업입니다. 원고를 열어 실제 저장 상태를 확인하세요.", "These projects have no chosen save destination. Open a manuscript to check its current save status.")}
                  </p>
                </div>
              </div>
              <div ref={temporaryGridRef} data-studio-project-grid="temporary" className="mt-4 grid gap-3.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shownTemporaryProjects.map((project) => renderProjectCard(project, true))}
              </div>
              {temporaryProjects.length > shownTemporaryProjects.length ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    data-studio-load-more="temporary"
                    onClick={(event) => {
                      if (event.detail === 0) pendingFocus.current = { list: temporaryGridRef.current, index: shownTemporaryProjects.length, trigger: event.currentTarget };
                      setVisibleTemporaryCount((count) => count + SECTION_PROJECT_STEP);
                    }}
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                  >
                    {formatI18nTemplate(
                      String(bi("임시 작업 더 보기 ({value0}개 남음)", "Show more temporary work ({value0} left)")),
                      { value0: temporaryProjects.length - shownTemporaryProjects.length },
                    )}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {savedProjects.length > 0 ? (
            <section aria-labelledby="saved-projects-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="saved-projects-title" className="text-xl font-black text-fg">
                    {bi("프로젝트", "Projects")}
                    <span className="ml-2 text-sm font-bold text-fg-3">{savedProjects.length}</span>
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {bi("저장 설정이 있는 프로젝트입니다. 실제 저장 위치와 완료 시각은 원고에서 확인하세요.", "These projects have save settings. Check the manuscript for the actual destination and completed save time.")}
                  </p>
                </div>
                <Link href="/studio/import" className="inline-flex min-h-11 items-center text-xs font-bold text-accent underline underline-offset-4">
                  {bi(".toonstudio 파일 열기", "Open .toonstudio file")}
                </Link>
              </div>
              <div ref={savedGridRef} data-studio-project-grid="saved" className="mt-4 grid gap-3.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shownSavedProjects.map((project) => renderProjectCard(project, false))}
              </div>
              {savedProjects.length > shownSavedProjects.length ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    data-studio-load-more="saved"
                    onClick={(event) => {
                      if (event.detail === 0) pendingFocus.current = { list: savedGridRef.current, index: shownSavedProjects.length, trigger: event.currentTarget };
                      setVisibleSavedCount((count) => count + SECTION_PROJECT_STEP);
                    }}
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                  >
                    {formatI18nTemplate(
                      String(bi("프로젝트 더 보기 ({value0}개 남음)", "Show more projects ({value0} left)")),
                      { value0: savedProjects.length - shownSavedProjects.length },
                    )}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
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
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
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

      {/* 시딩과 마운트 조건은 유지하고, 예제 안내만 실제 작업 목록 뒤에 둔다. */}
      {view === "active" && !query ? <StudioExampleProjectBanner /> : null}
      {view === "active" && !query ? <StudioSampleManuscriptCard /> : null}

      <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-fg-3">
        {bi("임시 자동저장, 정식 저장, 백업, 내보내기와 게시를 분리해 관리합니다. 휴지통의 완전 삭제만 되돌릴 수 없습니다.", "Temporary autosave, explicit save, backup, export and publishing are managed separately. Only permanent deletion from Trash cannot be undone.")}
      </footer>
    </>
  );
}
