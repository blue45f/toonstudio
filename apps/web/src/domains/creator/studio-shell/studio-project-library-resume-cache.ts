import { STUDIO_EXACT_RESUME_UPDATED_EVENT, studioExactResumeStorageKey, type StudioExactResumeStorage } from "../studio-exact-resume-context";
import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, studioProjectDocumentStorageKey } from "../studio-project-document-reader";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { resolveStudioProjectResumeTarget, type StudioProjectResumeTarget } from "../studio-project-resume-target";

/** 마운트된 목록의 읽기 캐시다. 문서·이어하기 저장소를 정본으로 유지한다. */
export function createStudioProjectLibraryResumeCache({
  projects, locale, readStorage, host,
}: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly locale: "ko" | "en";
  readonly readStorage: () => StudioExactResumeStorage;
  readonly host?: Window;
}) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const documentKeys = new Map(projects.map((project) => [studioProjectDocumentStorageKey(project.id), project.id]));
  const cache = new Map<string, StudioProjectResumeTarget>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let detach: (() => void) | undefined;

  const invalidate = (ids?: ReadonlySet<string>) => {
    let changed = false;
    for (const id of cache.keys()) {
      if (!ids || ids.has(id)) { cache.delete(id); changed = true; }
    }
    if (!changed) return;
    revision += 1;
    for (const listener of listeners) listener();
  };
  const eventProjects = (event: Event): ReadonlySet<string> | undefined => {
    const detail: unknown = (event as CustomEvent).detail;
    if (!detail || typeof detail !== "object" || !("projectId" in detail)) return undefined;
    return new Set(typeof detail.projectId === "string" && byId.has(detail.projectId) ? [detail.projectId] : []);
  };
  const watch = () => {
    if (!host) return () => {};
    let active = true;
    let queued = false;
    let allPending = false;
    const pending = new Set<string>();
    const onDocuments = (event: Event) => invalidate(eventProjects(event));
    const onResume = (event: Event) => {
      const ids = eventProjects(event);
      if (!ids) allPending = true;
      else for (const id of ids) pending.add(id);
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (active) invalidate(allPending ? undefined : pending);
        allPending = false;
        pending.clear();
      });
    };
    const onStorage = (event: StorageEvent) => {
      try { if (event.storageArea !== readStorage()) return; } catch { /* 접근 변경도 다음 읽기에서 안전하게 처리한다. */ }
      if (event.key === null) { invalidate(); return; }
      const projectId = documentKeys.get(event.key);
      if (projectId) { invalidate(new Set([projectId])); return; }
      for (const [id, target] of cache) {
        const documentId = target.documentId ?? byId.get(id)?.lastOpenedDocumentId;
        if (documentId && event.key === studioExactResumeStorageKey(id, documentId)) {
          invalidate(new Set([id]));
          return;
        }
      }
    };
    const onReturn = () => invalidate();
    const onVisible = () => { if (host.document.visibilityState === "visible") invalidate(); };
    host.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, onDocuments);
    host.addEventListener(STUDIO_EXACT_RESUME_UPDATED_EVENT, onResume);
    host.addEventListener("storage", onStorage);
    host.addEventListener("focus", onReturn);
    host.addEventListener("pageshow", onReturn);
    host.document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      host.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, onDocuments);
      host.removeEventListener(STUDIO_EXACT_RESUME_UPDATED_EVENT, onResume);
      host.removeEventListener("storage", onStorage);
      host.removeEventListener("focus", onReturn);
      host.removeEventListener("pageshow", onReturn);
      host.document.removeEventListener("visibilitychange", onVisible);
    };
  };

  return {
    resolve: (project: StudioProjectLibraryEntry): StudioProjectResumeTarget => {
      const cached = cache.get(project.id);
      if (cached) return cached;
      let target: StudioProjectResumeTarget;
      try {
        target = resolveStudioProjectResumeTarget(readStorage(), project, locale);
      } catch {
        target = { href: `/studio/p/${encodeURIComponent(project.id)}/overview`, documentId: project.lastOpenedDocumentId, summary: null, exact: false };
      }
      cache.set(project.id, target);
      return target;
    },
    getSnapshot: () => revision,
    getServerSnapshot: () => 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        detach = watch();
        invalidate(); // 렌더와 구독 사이에 바뀐 저장소도 다시 읽는다.
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { detach?.(); detach = undefined; }
      };
    },
  };
}
