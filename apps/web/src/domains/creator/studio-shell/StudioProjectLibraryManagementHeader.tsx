import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Archive, ChevronDown, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { STUDIO_START_GATEWAY_HREF } from "../studio-start-entry";
import { StudioProjectLibraryResumeCard } from "./StudioProjectLibraryResumeCard";
import { StudioProjectLibraryFastStartStrip } from "./StudioProjectLibraryFastStartStrip";
import { STUDIO_LIBRARY_SECTION_ID } from "./studio-creator-lobby-model";
import { studioLibraryRecentWork } from "./studio-library-recent-work";
import { STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS, STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS, studioProjectLibraryManagementViewHref, type StudioProjectLibrarySortMode } from "./studio-project-library-management-model";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryManagementHeader", ko, en);

export function StudioProjectLibraryManagementHeader({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const {
    locale: _locale, authUserId, view, library, profiles, query, setQuery, sort, setSort,
    setSelectedIds, notice, setNotice, setDeleteRequest, listedProjects,
    viewCounts, visibleProjects, selectedProjects, allVisibleSelected,
    toggleVisibleSelection, archiveProjects, trashProjects, restoreProjects,
    projectOverviewHref, projectResumeTarget,
  } = controller;
  const hasSearchQuery = query.trim().length > 0;
  const recentProject = view === "active" && !hasSearchQuery
    ? studioLibraryRecentWork(listedProjects, projectResumeTarget)[0] ?? null
    : null;
  const recentResumeTarget = recentProject ? projectResumeTarget(recentProject) : null;
  const entryActions = (
    <div className="studio-library-entry-actions" data-studio-primary-entry-actions="true">
      <Link href={view === "active" ? STUDIO_START_GATEWAY_HREF : "/studio/new"}
        data-studio-library-primary-action={recentProject ? undefined : "new"}
        className={buttonClass({ variant: recentProject ? "outline" : "solid", className: "min-h-12 min-w-0 gap-2 whitespace-normal rounded-xl px-4" })}>
        <Plus size={16} aria-hidden="true" />
        {bi("새 작업", "New work")}
      </Link>
      <Link href="/studio/import" className={buttonClass({ variant: "quiet", className: "min-h-12 min-w-0 whitespace-normal rounded-xl px-3 text-fg-2" })}>
        {bi("파일 가져오기", "Import files")}
      </Link>
    </div>
  );
  const selectionTools = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-semibold text-fg-3">
        <span className="sr-only">{bi("정렬", "Sort")}</span>
        <select
          value={sort}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => setSort(event.target.value as StudioProjectLibrarySortMode)}
          className="min-h-[44px] rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg outline-none focus:border-accent"
        >
          <option value="recent">{bi("최근 작업순", "Recently opened")}</option>
          <option value="name">{bi("이름순", "Name")}</option>
          <option value="created">{bi("최근 생성순", "Recently created")}</option>
        </select>
      </label>
      <button
        type="button"
        disabled={visibleProjects.length === 0}
        onClick={toggleVisibleSelection}
        className={buttonClass({ variant: "outline", size: "sm", className: "min-h-[44px]" })}
      >
        {allVisibleSelected
          ? bi("선택 해제", "Clear selection")
          : formatI18nTemplate(String(bi("전체 선택 ({value0})", "Select all ({value0})")), { value0: visibleProjects.length })}
      </button>
    </div>
  );
  return (
    <section
      id={STUDIO_LIBRARY_SECTION_ID}
      tabIndex={-1}
      data-studio-library-toolbar="true"
      aria-label={bi("프로젝트 라이브러리 도구", "Project library tools")}
      className="studio-library-mobile-home scroll-mt-4 focus:outline-none"
    >
      <header className="flex flex-col gap-3 border-b border-line pb-4 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[view]).en)}
          </h1>
          <p className="mt-1 text-sm leading-5 text-fg-2">
            {view === "active" && !hasSearchQuery && !recentProject
              ? listedProjects.length > 0
                ? bi("개인 작업은 아직 없습니다. 아래 예제를 열어 체험할 수 있어요.", "You have no personal work yet. Try an example below.")
                : bi("새 작업을 시작하거나 원고 파일을 가져오세요.", "Start new work or import a manuscript file.")
              : view === "active"
                ? bi("작업을 이어 하거나 목록에서 원고를 찾으세요.", "Continue your work or find a manuscript below.")
                : bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).en)}
          </p>
        </div>
      </header>

      {recentProject && recentResumeTarget ? (
        <div className="mt-3">
          <StudioProjectLibraryResumeCard
            project={recentProject}
            profile={profiles.profileFor(recentProject.id)}
            authUserId={authUserId}
            locale={_locale}
            resumeHref={recentResumeTarget.href}
            overviewHref={projectOverviewHref(recentProject)}
            onResume={() => { library.touch(recentProject.id, recentResumeTarget.documentId); }}
          />
        </div>
      ) : null}

      {entryActions}

      <div className="mt-3">
        <nav className="overflow-x-auto" aria-label={bi("내 작업 보기", "My work views")}>
          <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
            {(["active", "archived", "trash"] as const).map((candidate) => (
              <Link
                key={candidate}
                href={studioProjectLibraryManagementViewHref(candidate)}
                aria-current={candidate === view ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold",
                  candidate === view
                    ? "bg-accent text-on-accent"
                    : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate]).en)}
                <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[0.62rem]">
                  {viewCounts[candidate]}
                </span>
              </Link>
            ))}
          </div>
        </nav>

      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/20 px-3 py-2 text-sm font-semibold text-fg">
          <span>{notice.message}</span>
          <span className="flex items-center gap-3">
            {notice.action ? (
              <button type="button" onClick={notice.action} className="inline-flex min-h-11 items-center text-xs font-black text-accent underline underline-offset-4">
                {notice.actionLabel}
              </button>
            ) : null}
            {notice.actionHref && notice.actionLabel ? (
              <Link href={notice.actionHref} className="inline-flex min-h-11 items-center text-xs font-black text-accent underline underline-offset-4">
                {notice.actionLabel}
              </Link>
            ) : null}
            <button type="button" onClick={() => setNotice(null)} className="min-h-11 text-xs underline underline-offset-4">
              {bi("닫기", "Dismiss")}
            </button>
          </span>
        </div>
      ) : null}

      {library.error || profiles.error ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">
          <span className="min-w-0 break-words">{library.error ?? profiles.error}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                library.reload();
                profiles.reload();
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-black text-danger hover:bg-danger-soft/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <RotateCcw size={14} aria-hidden="true" />
              {bi("다시 시도", "Try again")}
            </button>
            <Link
              href="/studio/import"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-danger/30 px-3 text-xs font-bold text-danger hover:bg-danger-soft/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {bi("파일에서 열기", "Open from file")}
            </Link>
            <Link
              href="/studio/new"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-danger/30 px-3 text-xs font-bold text-danger hover:bg-danger-soft/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {bi("새 작업 시작", "Start new work")}
            </Link>
          </div>
        </div>
      ) : null}

      <section data-studio-project-search-row="true" className="studio-library-search-row mt-3" aria-label={bi("프로젝트 찾기와 선택", "Find and select projects")}>
        <div className="studio-library-search-controls">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-xl">
            <label className="relative block min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
              <span className="sr-only">{bi("프로젝트 검색", "Search projects")}</span>
              <input
                value={query}
                data-studio-library-search-input="true"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape" && query.length > 0) {
                    event.stopPropagation();
                    setQuery("");
                    return;
                  }
                  if (event.key === "Enter" && visibleProjects.length > 0) {
                    event.preventDefault();
                    document
                      .querySelector<HTMLElement>('[data-studio-project-card="true"] a[data-studio-card-continue="true"]')
                      ?.focus();
                  }
                }}
                placeholder={bi("제목·종류·설명 검색", "Search title, type or description")}
                className="min-h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm text-fg outline-none focus:border-accent"
              />
            </label>
            {query.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 shrink-0" })}
              >
                {bi("검색어 지우기", "Clear search")}
              </button>
            ) : null}
          </div>
          {view === "active" ? (
            <details className="studio-library-list-options">
              <summary>{bi("정렬·선택", "Sort & select")}</summary>
              {selectionTools}
            </details>
          ) : selectionTools}
        </div>
      </section>

      <div className="studio-library-secondary-tools">
        {view === "active" && !hasSearchQuery ? <details className="studio-library-alternative-starts group rounded-xl border border-line bg-card" data-studio-other-starts="true">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {bi("다른 작업 시작", "Start something else")}
              <ChevronDown size={16} aria-hidden="true" className="group-open:rotate-180" />
            </summary>
            <StudioProjectLibraryFastStartStrip className="px-3 pb-3" />
          </details> : null}
      <details className="studio-library-auxiliary-management rounded-xl border border-line bg-card">
        <summary className="min-h-11 cursor-pointer rounded-xl px-3 py-3 text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {bi("저장·내보내기·제작 관리", "Save, export and production")}
        </summary>
        <div className="px-3 pb-3">
          <p className="mb-2 text-xs leading-5 text-fg-2 sm:hidden">
            {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).en)}
          </p>
        <nav className="flex flex-wrap items-center gap-1" aria-label={bi("저장과 배포", "Storage and distribution")}>
          <Link href="/studio/recovery" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("작업 복구", "Recover work")}
          </Link>
          <Link href="/studio/import" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi(".toonstudio 파일 열기", "Open .toonstudio file")}
          </Link>
          <Link href="/studio?view=storage" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("저장·백업", "Save & backup")}
          </Link>
          <Link href="/studio?view=exports" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("내보내기", "Export")}
          </Link>
          <Link href="/studio?view=publications" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("게시", "Publishing")}
          </Link>
        </nav>
          <Link href="/production" className={buttonClass({ variant: "quiet", className: "min-h-11 whitespace-normal" })}>
            {bi("제작 관리", "Production management")}
          </Link>
        </div>
      </details>
      </div>

      {selectedProjects.length > 0 ? (
        <section className="sticky top-3 z-30 mt-3 rounded-2xl border border-accent/35 bg-card/95 p-3 shadow-lg backdrop-blur" aria-label={bi("선택 작업", "Selection actions")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-fg">
                {formatI18nTemplate(String(bi("{value0}개 선택", "{value0} selected")), { value0: selectedProjects.length })}
              </p>
              <p className="mt-0.5 text-[0.68rem] text-fg-3">
                {bi("검색 결과 전체 선택과 개별 선택을 함께 사용할 수 있습니다.", "Combine select-all results with individual selection.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {view === "active" ? (
                <>
                  <button type="button" onClick={() => archiveProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
                    <Archive size={14} aria-hidden="true" />{bi("선택 보관", "Archive selected")}
                  </button>
                  <button type="button" onClick={() => trashProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 삭제", "Trash selected")}
                  </button>
                </>
              ) : view === "archived" ? (
                <>
                  <button type="button" onClick={() => restoreProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
                    <RotateCcw size={14} aria-hidden="true" />{bi("선택 복원", "Restore selected")}
                  </button>
                  <button type="button" onClick={() => trashProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 삭제", "Trash selected")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => restoreProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
                    <RotateCcw size={14} aria-hidden="true" />{bi("선택 복원", "Restore selected")}
                  </button>
                  <button type="button" onClick={() => setDeleteRequest({ ids: selectedProjects.map((project) => project.id), source: "selected" })} className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 완전 삭제", "Delete selected")}
                  </button>
                </>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11" })}>
                {bi("선택 해제", "Clear")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {view !== "active" && listedProjects.length > 0 ? (
        <section className="mt-3 flex flex-wrap justify-end gap-2" aria-label={bi("전체 작업", "All-project actions")}>
          <button
            type="button"
            onClick={() => restoreProjects(listedProjects.map((project) => project.id))}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {view === "trash"
              ? bi("전체 복원", "Restore all")
              : bi("전체 복원", "Restore all")}
          </button>
          {view === "trash" ? (
            <button
              type="button"
              onClick={() => setDeleteRequest({ ids: listedProjects.map((project) => project.id), source: "all" })}
              className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-danger" })}
            >
              <Trash2 size={14} aria-hidden="true" />
              {bi("휴지통 비우기", "Empty Trash")}
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
