import type { StudioProjectDefinition } from "./studio-project-definition";
import {
  createStudioProjectDocument,
  ensureInitialStudioProjectDocument,
  reconcileInitialStudioProjectDocumentOnCreateRetry,
  studioProjectDocumentHref,
  type StudioDocumentKind,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
  type StudioProjectDocumentStorage,
} from "./studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  reconcileStudioProjectOnCreateRetry,
  trashStudioProject,
  type StudioProjectKind,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryEventTarget,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-store";

export interface StudioProjectCreationStorage
  extends StudioProjectLibraryStorage,
    StudioProjectDocumentStorage {}

export type StudioProjectCreationTarget = StudioProjectLibraryEventTarget;

export interface StudioInitialDocumentInput {
  readonly title?: string;
  readonly kind?: StudioDocumentKind;
  readonly defaultWorkspace?: StudioDocumentWorkspace;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly pageCount?: number;
}

export interface CreateStudioProjectWithDocumentInput {
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly templateId?: string | null;
  readonly description?: string;
  readonly primaryLocale?: string;
  readonly createdAt?: string;
  readonly definition?: StudioProjectDefinition | null;
  readonly document?: StudioInitialDocumentInput;
}

export interface StudioProjectCreationResult {
  readonly project: StudioProjectLibraryEntry;
  readonly document: StudioProjectDocumentEntry;
  readonly href: string;
}

function rollbackProject(
  storage: StudioProjectCreationStorage,
  projectId: string,
  target?: StudioProjectCreationTarget,
): void {
  try {
    trashStudioProject(storage, projectId, { target });
    permanentlyDeleteStudioProject(storage, projectId, { target });
  } catch {
    // A recoverable project entry is safer than hiding a partial creation failure.
  }
}

/**
 * Creates one project and one usable initial document as a single user action.
 * The project entry is rolled back when document initialization fails.
 */
export function createStudioProjectWithInitialDocument(
  storage: StudioProjectCreationStorage,
  input: CreateStudioProjectWithDocumentInput,
  target?: StudioProjectCreationTarget,
): StudioProjectCreationResult {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const project = createStudioProject(storage, {
    title: input.title,
    kind: input.kind,
    templateId: input.templateId,
    description: input.description,
    primaryLocale: input.primaryLocale,
    definition: input.definition,
    createdAt,
  }, { target });

  try {
    const document = input.document?.kind
      ? createStudioProjectDocument(storage, project.id, {
        title: input.document.title ?? `${project.title} 작업 문서`,
        kind: input.document.kind,
        defaultWorkspace: input.document.defaultWorkspace,
        width: input.document.width,
        height: input.document.height,
        pageCount: input.document.pageCount,
        createdAt,
      }, { target })
      : ensureInitialStudioProjectDocument(storage, {
        projectId: project.id,
        projectTitle: project.title,
        projectKind: project.kind,
        templateId: input.templateId,
        createdAt,
        target,
      });

    const openedProject = markStudioProjectOpened(
      storage,
      project.id,
      document.id,
      { at: createdAt, target },
    );
    return Object.freeze({
      project: openedProject,
      document,
      href: studioProjectDocumentHref(document),
    });
  } catch (error) {
    rollbackProject(storage, project.id, target);
    throw error;
  }
}

/**
 * 동일 히스토리 세션에서 뒤로 가기 후 재시도할 때 기존 생성 작품을 제자리 갱신·재사용하고,
 * 첫 생성이거나 이전 작품이 삭제된 경우에만 새 작품을 만든다.
 */
export function reuseOrCreateStudioProjectWithInitialDocument(
  storage: StudioProjectCreationStorage,
  existingReceipt: { readonly projectId: string; readonly documentId: string } | null,
  input: CreateStudioProjectWithDocumentInput,
  target?: StudioProjectCreationTarget,
): StudioProjectCreationResult {
  if (existingReceipt) {
    const now = input.createdAt ?? new Date().toISOString();
    const reconciledProject = reconcileStudioProjectOnCreateRetry(storage, existingReceipt.projectId, {
      title: input.title,
      kind: input.kind,
      templateId: input.templateId,
      description: input.description,
      primaryLocale: input.primaryLocale,
      definition: input.definition,
    }, { at: now, target });
    if (reconciledProject) {
      const reconciledDocument = input.document?.kind
        ? reconcileInitialStudioProjectDocumentOnCreateRetry(
          storage,
          reconciledProject.id,
          existingReceipt.documentId,
          {
            title: input.document.title ?? `${reconciledProject.title} 작업 문서`,
            kind: input.document.kind,
            defaultWorkspace: input.document.defaultWorkspace,
            width: input.document.width,
            height: input.document.height,
            pageCount: input.document.pageCount,
          },
          { at: now, target },
        )
        : ensureInitialStudioProjectDocument(storage, {
          projectId: reconciledProject.id,
          projectTitle: reconciledProject.title,
          projectKind: reconciledProject.kind,
          templateId: input.templateId,
          createdAt: now,
          target,
        });
      if (reconciledDocument) {
        const openedProject = markStudioProjectOpened(
          storage,
          reconciledProject.id,
          reconciledDocument.id,
          { at: now, target },
        );
        return Object.freeze({
          project: openedProject,
          document: reconciledDocument,
          href: studioProjectDocumentHref(reconciledDocument),
        });
      }
    }
  }
  return createStudioProjectWithInitialDocument(storage, input, target);
}
