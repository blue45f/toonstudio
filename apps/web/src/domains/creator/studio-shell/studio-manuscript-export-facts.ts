import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { collectStudioProjectWorkspaceSnapshots } from "../save-first/studio-project-workspace-snapshots";
import { readStudioProjectDocuments, type StudioProjectDocumentEntry } from "../studio-project-document-reader";
import type { StudioExportPageFact, StudioManuscriptExportFacts } from "../studio-project-export-snapshot";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import { extractPagePreflightIssues } from "./studio-manuscript-preflight-targets";

function positiveIntOrFallback(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.max(1, Math.round(numeric));
}

function buildMetadataPages(doc: StudioProjectDocumentEntry): readonly StudioExportPageFact[] {
  const count = Math.max(1, doc.pageCount || 1);
  const perPageWidth = positiveIntOrFallback(doc.width, STUDIO_CANVAS_WIDTH);
  const totalOrSingleHeight = positiveIntOrFallback(doc.height, 1280 * count);
  const perPageHeight =
    count > 1 ? Math.max(1, Math.round(totalOrSingleHeight / count)) : totalOrSingleHeight;

  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        pageNumber: index + 1,
        id: `${doc.id}-page-${index + 1}`,
        label: `${index + 1}페이지`,
        width: perPageWidth,
        height:
          index === count - 1 && count > 1
            ? Math.max(1, totalOrSingleHeight - perPageHeight * (count - 1))
            : perPageHeight,
      }),
    ),
  );
}

/**
 * 로컬 프로젝트 문서 메타데이터에서 동기적으로 초기 내보내기 문맥을 읽는다.
 * (단위 테스트·초기 페인트 호환성 보장)
 */
export function readSyncLocalManuscriptExportFacts(
  storage: Storage,
  projectId: string,
  locale: "ko" | "en",
): StudioManuscriptExportFacts | null {
  try {
    const project = readStudioProjectLibrary(storage).projects.find(
      (item) => item.id === projectId,
    );
    const docs = readStudioProjectDocuments(storage, projectId).documents.filter(
      (doc) => doc.status !== "trashed",
    );
    const activeDoc =
      (project?.lastOpenedDocumentId
        ? docs.find((doc) => doc.id === project.lastOpenedDocumentId)
        : undefined) ??
      docs.find((doc) => doc.status === "active") ??
      docs[0] ??
      null;
    if (!activeDoc) return null;
    const resumeHref = project
      ? resolveStudioProjectResumeTarget(storage, project, locale).href
      : `/studio/p/${encodeURIComponent(projectId)}/d/${encodeURIComponent(activeDoc.id)}`;
    return Object.freeze({
      sourceAuthority: "document-metadata",
      documentId: activeDoc.id,
      documentTitle: activeDoc.title,
      localEditorHref: resumeHref,
      pages: buildMetadataPages(activeDoc),
    });
  } catch {
    return null;
  }
}

/**
 * OPFS / SQLite / 호환 스냅샷에 저장된 실제 원고 페이지 목록(`pagesList`)을 읽기 전용으로 조회해
 * 실제 캔버스 폭(`STUDIO_CANVAS_WIDTH = 720`)·페이지별 높이·페이지 제목을 반환한다.
 */
export async function loadPersistedManuscriptExportFacts(
  storage: Storage,
  projectId: string,
  locale: "ko" | "en",
  authUserId: string | null,
): Promise<StudioManuscriptExportFacts | null> {
  const syncFallback = readSyncLocalManuscriptExportFacts(storage, projectId, locale);
  if (!syncFallback) return null;

  try {
    const project = readStudioProjectLibrary(storage).projects.find(
      (item) => item.id === projectId,
    );
    const docs = readStudioProjectDocuments(storage, projectId).documents.filter(
      (doc) => doc.id === syncFallback.documentId,
    );
    if (docs.length === 0) return syncFallback;

    const snapshots = await collectStudioProjectWorkspaceSnapshots({
      storage,
      projectId,
      documents: docs,
      authUserId,
      allowGuestFallback: false,
      lastOpenedDocumentId: project?.lastOpenedDocumentId ?? syncFallback.documentId,
    });
    const activeSnapshot = snapshots.find((item) => item.documentId === syncFallback.documentId);
    const rawPages = activeSnapshot?.payload?.pagesList;
    if (!Array.isArray(rawPages) || rawPages.length === 0) {
      return syncFallback;
    }

    const pages: StudioExportPageFact[] = rawPages.map((rawPage, index) => {
      const record = rawPage && typeof rawPage === "object" ? (rawPage as Record<string, unknown>) : {};
      const id =
        typeof record.id === "string" && record.id.trim().length > 0
          ? record.id.trim()
          : `page-${index + 1}`;
      const rawName =
        typeof record.name === "string"
          ? record.name.trim()
          : typeof record.title === "string"
            ? record.title.trim()
            : "";
      const label = rawName || `${index + 1}페이지`;
      const issues = extractPagePreflightIssues(record, index + 1, id, label);
      return Object.freeze({
        pageNumber: index + 1,
        id,
        label,
        width: STUDIO_CANVAS_WIDTH,
        height: positiveIntOrFallback(record.canvasH, 1280),
        ...(issues.length > 0 ? { issues } : {}),
      });
    });

    return Object.freeze({
      sourceAuthority: "manuscript-snapshot",
      documentId: syncFallback.documentId,
      documentTitle:
        typeof activeSnapshot?.payload?.title === "string" && activeSnapshot.payload.title.trim().length > 0
          ? activeSnapshot.payload.title.trim()
          : syncFallback.documentTitle,
      localEditorHref: syncFallback.localEditorHref,
      pages: Object.freeze(pages),
    });
  } catch {
    return syncFallback;
  }
}
