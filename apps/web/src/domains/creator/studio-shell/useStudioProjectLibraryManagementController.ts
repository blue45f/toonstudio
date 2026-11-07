import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";

import { removeStudioSaveProfilesBulk } from "../save-first/studio-save-profile-bulk";
import type { StudioSaveProfile } from "../save-first/studio-save-profile";
import { chooseStudioProjectPackageSaveTarget, studioProjectPackageFileName, writeStudioProjectPackageToTarget } from "../save-first/studio-project-package";
import { readStudioSubmissions } from "../save-first/studio-submission-store";
import { ensureInitialStudioProjectDocument, readStudioProjectDocuments, studioProjectDocumentStorageKey } from "../studio-project-document-store";
import { removeStudioExactResumeContext } from "../studio-exact-resume-context";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import { activateStudioProjectsBulk, archiveStudioProjectsBulk, permanentlyDeleteStudioProjectsBulk, restoreStudioProjectsBulk, trashStudioProjectsBulk, type StudioProjectBulkMutationResult } from "../studio-project-library-bulk";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { resolveStudioProjectLibraryManagementView, sortStudioProjectLibraryProjects, studioProjectIsTemporaryWork, studioProjectLibraryLocale, studioProjectLibrarySearchText, type StudioProjectLibrarySortMode } from "./studio-project-library-management-model";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";
import { useStudioSaveProfiles } from "./useStudioSaveProfiles";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("useStudioProjectLibraryManagementController", ko, en);

export interface StudioProjectLibraryNoticeState {
  readonly message: string;
  readonly actionLabel?: string;
  readonly action?: () => void;
  readonly actionHref?: string;
}

export interface StudioProjectLibraryDeleteRequest {
  readonly ids: readonly string[];
  readonly source: "selected" | "all" | "single";
}

export function useStudioProjectLibraryManagementController() {
  useBilingualI18nRevision();
  const [searchParams] = useSearchParams();
  const { data: session } = useSession();
  const language = useI18n((state) => state.lang);
  const authUserId = session?.user?.id ?? null;
  const locale = studioProjectLibraryLocale(language);
  const view = resolveStudioProjectLibraryManagementView(searchParams.get("view"));
  const status = view === "archived" ? "archived" : view === "trash" ? "trashed" : "active";
  const library = useStudioProjectLibrary(locale, status);
  const profiles = useStudioSaveProfiles();
  const [query, setQuery] = useState("");
  const clearQuery = useCallback(() => setQuery(""), []);
  const [sort, setSort] = useState<StudioProjectLibrarySortMode>("recent");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<StudioProjectLibraryNoticeState | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<StudioProjectLibraryEntry | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<StudioProjectLibraryDeleteRequest | null>(null);

  const listedProjects = library.projects;
  const viewCounts = useMemo(() => {
    const projects = library.state?.projects ?? [];
    return {
      active: projects.filter((project) => project.status === "active").length,
      archived: projects.filter((project) => project.status === "archived").length,
      trash: projects.filter((project) => project.status === "trashed").length,
    } as const;
  }, [library.state]);
  const searchIndexByProjectId = useMemo(() => {
    const index = new Map<string, string>();
    for (const project of listedProjects) {
      index.set(project.id, studioProjectLibrarySearchText(project, locale));
    }
    return index;
  }, [listedProjects, locale]);

  const visibleProjects = useMemo(() => {
    const normalized = query.normalize("NFC").trim().toLocaleLowerCase();
    const tokens = normalized ? normalized.split(/\s+/u).filter(Boolean) : [];
    const filtered = tokens.length > 0
      ? listedProjects.filter((project) => {
          const haystack = searchIndexByProjectId.get(project.id) ?? studioProjectLibrarySearchText(project, locale);
          return tokens.every((token) => haystack.includes(token));
        })
      : listedProjects;
    return sortStudioProjectLibraryProjects(filtered, sort);
  }, [listedProjects, locale, query, searchIndexByProjectId, sort]);

  const profileFor = profiles.profileFor;
  const temporaryProjectIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const project of listedProjects) {
      if (studioProjectIsTemporaryWork(profileFor(project.id))) {
        ids.add(project.id);
      }
    }
    return ids;
  }, [listedProjects, profileFor]);
  const temporaryProjects = useMemo(() => view === "active"
    ? visibleProjects.filter((project) => temporaryProjectIdSet.has(project.id))
    : [], [temporaryProjectIdSet, view, visibleProjects]);
  const savedProjects = useMemo(() => view === "active"
    ? visibleProjects.filter((project) => !temporaryProjectIdSet.has(project.id))
    : visibleProjects, [temporaryProjectIdSet, view, visibleProjects]);

  const selectedProjects = useMemo(
    () => listedProjects.filter((project) => selectedIds.has(project.id)),
    [listedProjects, selectedIds],
  );
  const allVisibleSelected = visibleProjects.length > 0
    && visibleProjects.every((project) => selectedIds.has(project.id));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [view, query]);

  useEffect(() => {
    if (!saveTarget && !deleteRequest && selectedIds.size === 0) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (saveTarget || deleteRequest) {
        setSaveTarget(null);
        setDeleteRequest(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.value.length > 0) return;
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteRequest, saveTarget, selectedIds.size]);

  const setSelection = useCallback((projectId: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }, []);

  const toggleVisibleSelection = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleProjects.map((project) => project.id)));
  };

  const showBulkResult = (
    result: StudioProjectBulkMutationResult,
    successMessage: string,
    undo?: () => void,
  ) => {
    setSelectedIds(new Set());
    if (result.affectedIds.length === 0) {
      setNotice({
        message: bi("변경할 수 있는 프로젝트가 없습니다.", "There are no eligible projects to change."),
      });
      return;
    }
    setNotice({
      message: successMessage,
      actionLabel: undo ? (bi("실행 취소", "Undo")) : undefined,
      action: undo,
    });
  };

  const archiveProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    try {
      const result = archiveStudioProjectsBulk(window.localStorage, ids, { target: window });
      const undoArchive = () => {
        try {
          const undone = activateStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
          setNotice({
            message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 내 작업으로 되돌렸습니다.", "Returned {value0} project(s) to My work.")), { value0: undone.affectedIds.length }),
          });
        } catch {
          library.reload();
          profiles.reload();
          setNotice({
            message: bi("보관 취소를 저장하지 못했습니다. 현재 목록을 다시 불러왔으니 확인 후 다시 시도하세요.", "Could not undo archiving. Reloaded the current list—please check and try again."),
            actionLabel: bi("다시 시도", "Try again"),
            action: undoArchive,
          });
        }
      };
      showBulkResult(
        result,
        formatI18nTemplate(String(bi("{value0}개 프로젝트를 보관함으로 옮겼습니다.", "Archived {value0} project(s).")), { value0: result.affectedIds.length }),
        undoArchive,
      );
    } catch {
      library.reload();
      profiles.reload();
      setNotice({
        message: bi("프로젝트를 보관함으로 옮기지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도하세요.", "Could not archive the project(s). Check browser storage and try again."),
        actionLabel: bi("다시 시도", "Try again"),
        action: () => archiveProjects(ids),
      });
    }
  };

  const trashProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    try {
      const result = trashStudioProjectsBulk(window.localStorage, ids, { target: window });
      const undoTrash = () => {
        try {
          const undone = restoreStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
          setNotice({
            message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 원래 위치로 복구했습니다.", "Restored {value0} project(s) to their previous location.")), { value0: undone.affectedIds.length }),
          });
        } catch {
          library.reload();
          profiles.reload();
          setNotice({
            message: bi("휴지통 이동 취소를 저장하지 못했습니다. 현재 목록을 다시 불러왔으니 확인 후 다시 시도하세요.", "Could not undo moving to Trash. Reloaded the current list—please check and try again."),
            actionLabel: bi("다시 시도", "Try again"),
            action: undoTrash,
          });
        }
      };
      showBulkResult(
        result,
        formatI18nTemplate(String(bi("{value0}개 프로젝트를 휴지통으로 옮겼습니다.", "Moved {value0} project(s) to Trash.")), { value0: result.affectedIds.length }),
        undoTrash,
      );
    } catch {
      library.reload();
      profiles.reload();
      setNotice({
        message: bi("프로젝트를 휴지통으로 옮기지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도하세요.", "Could not move the project(s) to Trash. Check browser storage and try again."),
        actionLabel: bi("다시 시도", "Try again"),
        action: () => trashProjects(ids),
      });
    }
  };

  const restoreProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    try {
      const result = view === "archived"
        ? activateStudioProjectsBulk(window.localStorage, ids, { target: window })
        : restoreStudioProjectsBulk(window.localStorage, ids, { target: window });
      const undoRestore = () => {
        try {
          const undone = view === "archived"
            ? archiveStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window })
            : trashStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
          setNotice({
            message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 이전 위치로 되돌렸습니다.", "Moved {value0} project(s) back.")), { value0: undone.affectedIds.length }),
          });
        } catch {
          library.reload();
          profiles.reload();
          setNotice({
            message: bi("복구 취소를 저장하지 못했습니다. 현재 목록을 다시 불러왔으니 확인 후 다시 시도하세요.", "Could not undo restore. Reloaded the current list—please check and try again."),
            actionLabel: bi("다시 시도", "Try again"),
            action: undoRestore,
          });
        }
      };
      showBulkResult(
        result,
        formatI18nTemplate(String(bi("{value0}개 프로젝트를 복구했습니다.", "Restored {value0} project(s).")), { value0: result.affectedIds.length }),
        undoRestore,
      );
    } catch {
      library.reload();
      profiles.reload();
      setNotice({
        message: bi("프로젝트를 복구하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도하세요.", "Could not restore the project(s). Check browser storage and try again."),
        actionLabel: bi("다시 시도", "Try again"),
        action: () => restoreProjects(ids),
      });
    }
  };

  const permanentlyDeleteProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    try {
      const result = permanentlyDeleteStudioProjectsBulk(window.localStorage, ids, { target: window });
      if (result.affectedIds.length > 0) {
        removeStudioSaveProfilesBulk(window.localStorage, result.affectedIds, { target: window });
        for (const projectId of result.affectedIds) {
          const documents = readStudioProjectDocuments(window.localStorage, projectId).documents;
          for (const document of documents) {
            removeStudioExactResumeContext(window.localStorage, projectId, document.id);
          }
          window.localStorage.removeItem(studioProjectDocumentStorageKey(projectId));
        }
      }
      setDeleteRequest(null);
      setSelectedIds(new Set());
      setNotice({
        message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 완전히 삭제했습니다.", "Permanently deleted {value0} project(s).")), { value0: result.affectedIds.length }),
      });
    } catch {
      setDeleteRequest(null);
      library.reload();
      profiles.reload();
      setNotice({
        message: bi("프로젝트를 완전히 삭제하지 못했습니다. 목록을 다시 불러왔으니 확인 후 다시 시도하세요.", "Could not permanently delete the project(s). Reloaded the list—please check and try again."),
        actionLabel: bi("다시 시도", "Try again"),
        action: () => permanentlyDeleteProjects(ids),
      });
    }
  };

  const duplicateProject = (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined") return;
    try {
      const duplicate = library.duplicate(project.id);
      if (!duplicate) {
        library.reload();
        profiles.reload();
        setNotice({
          message: bi("프로젝트 복사본을 만들지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도하세요.", "Could not create a project copy. Check browser storage and try again."),
          actionLabel: bi("다시 시도", "Try again"),
          action: () => duplicateProject(project),
        });
        return;
      }
      ensureInitialStudioProjectDocument(window.localStorage, {
        projectId: duplicate.id,
        projectTitle: duplicate.title,
        projectKind: duplicate.kind,
        templateId: duplicate.templateId,
        target: window,
      });
      profiles.ensure(duplicate.id, {
        provider: "browser",
        autoSave: true,
        createVersions: true,
      });
      setNotice({
        message: formatI18nTemplate(String(bi("“{value0}”의 임시 복사본을 만들었습니다.", "Created a temporary copy of “{value0}”.")), { value0: project.title }),
      });
    } catch {
      library.reload();
      profiles.reload();
      setNotice({
        message: bi("프로젝트 복사본을 만들지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도하세요.", "Could not create a project copy. Check browser storage and try again."),
        actionLabel: bi("다시 시도", "Try again"),
        action: () => duplicateProject(project),
      });
    }
  };

  const createPackage = async (project: StudioProjectLibraryEntry, profile: StudioSaveProfile) => {
    const submissions = typeof window === "undefined"
      ? []
      : readStudioSubmissions(window.localStorage).submissions;
    const documents = readStudioProjectDocuments(window.localStorage, project.id).documents;
    // 작업공간 스냅샷(OPFS·SQLite) 수집기는 실제 저장 시점에만 불러와 작품 홈 첫 화면을 가볍게 유지한다.
    const { buildStudioProjectPackageWithWorkspace } = await import(
      "../save-first/studio-project-package-with-workspace"
    );
    return (await buildStudioProjectPackageWithWorkspace({
      storage: window.localStorage,
      project,
      documents,
      profile,
      submissions: submissions.filter((submission) => submission.projectId === project.id),
      authUserId,
    })).packageResult;
  };

  const savePackage = async (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined" || busyProjectId) return;
    setBusyProjectId(project.id);
    try {
      const target = await chooseStudioProjectPackageSaveTarget(
        studioProjectPackageFileName(project.title),
        window,
        `project-package:${project.id}`,
      );
      const profile = profiles.ensure(project.id) ?? profiles.profileFor(project.id);
      const result = await createPackage(project, profile);
      const method = await writeStudioProjectPackageToTarget(result, target);
      profiles.addProvider(project.id, "local-file");
      const saved = profiles.recordSave(project.id) ?? profile;
      profiles.markSynced(project.id, "local-file:backup", {
        remotePath: result.fileName,
        byteLength: result.blob.size,
        revision: saved.revision,
      });
      setSaveTarget(null);
      setNotice({
        message: method === "file-picker"
          ? formatI18nTemplate(String(bi("“{value0}”을 선택한 파일·동기화 폴더에 저장했습니다.", "Saved “{value0}” to the selected file or synced folder.")), { value0: project.title })
          : formatI18nTemplate(String(bi("“{value0}” 프로젝트 파일을 다운로드했습니다.", "Downloaded the “{value0}” project file.")), { value0: project.title }),
        actionLabel: bi("저장한 파일 열기·복원", "Open or restore saved file"),
        actionHref: "/studio/import",
      });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setSaveTarget(null);
        setNotice({
          message: bi("프로젝트 파일을 저장하지 못했습니다. 임시 자동저장본은 그대로 유지됩니다.", "The project file could not be saved. The temporary autosave remains intact."),
          actionLabel: bi("다시 시도", "Try again"),
          action: () => { void savePackage(project); },
        });
      }
    } finally {
      setBusyProjectId(null);
    }
  };

  const projectOverviewHref = (project: StudioProjectLibraryEntry) => (
    `/studio/p/${encodeURIComponent(project.id)}/overview`
  );

  const resumeTargetCache = useMemo(() => {
    void listedProjects;
    void locale;
    return new Map<string, ReturnType<typeof resolveStudioProjectResumeTarget>>();
  }, [listedProjects, locale]);

  const projectResumeTarget = useCallback((project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined") {
      return {
        href: `/studio/p/${encodeURIComponent(project.id)}/overview`,
        documentId: project.lastOpenedDocumentId,
        summary: null,
        exact: false,
      };
    }
    const cacheKey = `${project.id}:${project.lastOpenedDocumentId ?? ""}:${project.updatedAt}:${project.lastOpenedAt}`;
    const cached = resumeTargetCache.get(cacheKey);
    if (cached) return cached;
    const resolved = resolveStudioProjectResumeTarget(window.localStorage, project, locale === "ko" ? "ko" : "en");
    resumeTargetCache.set(cacheKey, resolved);
    return resolved;
  }, [locale, resumeTargetCache]);
  const continueProjectHref = useCallback((project: StudioProjectLibraryEntry): string => (
    projectResumeTarget(project).href
  ), [projectResumeTarget]);
  return {
    locale,
    authUserId,
    view,
    library,
    profiles,
    query,
    setQuery,
    clearQuery,
    sort,
    setSort,
    selectedIds,
    setSelection,
    setSelectedIds,
    notice,
    setNotice,
    busyProjectId,
    saveTarget,
    setSaveTarget,
    deleteRequest,
    setDeleteRequest,
    listedProjects,
    viewCounts,
    visibleProjects,
    temporaryProjects,
    savedProjects,
    selectedProjects,
    allVisibleSelected,
    toggleVisibleSelection,
    archiveProjects,
    trashProjects,
    restoreProjects,
    permanentlyDeleteProjects,
    duplicateProject,
    savePackage,
    projectOverviewHref,
    projectResumeTarget,
    continueProjectHref,
  };
}

export type StudioProjectLibraryManagementController = ReturnType<
  typeof useStudioProjectLibraryManagementController
>;
