import {
  parseStudioLinked3dRenderDocument,
  validateStudioLinked3dRenderDocumentAgainstPage,
  validateStudioLinked3dReservedPageState,
} from "./studio-linked-3d-render-document";
import { migrateStudioShared3dStageCollectionDocument } from "./studio-shared-3d-stage-collection";
import {
  resolveStudioLinked3dError,
  resolveStudioLinked3dSaveProjectionText,
} from "./status-i18n/studio-producer-error-i18n-linked3d";

import type { El } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

export interface NormalizeStudioLinked3dSaveProjectionInput {
  readonly pagesList: readonly PageState[];
  readonly master?: { readonly elements: readonly El[] };
}

/**
 * Canonicalizes and cross-validates linked 3D references before a project crosses a persistence
 * boundary. The result remains the caller's original page array when no normalization is needed.
 */
export function normalizeStudioLinked3dSaveProjection({
  pagesList,
  master,
}: NormalizeStudioLinked3dSaveProjectionInput): PageState[] {
  if (master) {
    const reservedMasterState = validateStudioLinked3dReservedPageState({
      value: undefined,
      elements: master.elements,
    });
    if (!reservedMasterState.ok) {
      throw new Error(resolveStudioLinked3dSaveProjectionText("masterReservedUnsavable"));
    }
  }

  let pagesChanged = false;
  const normalizedPages = pagesList.map((page) => {
    const shared3dStage = page.shared3dStage === undefined
      ? undefined
      : migrateStudioShared3dStageCollectionDocument(page.shared3dStage);
    if (page.shared3dStage !== undefined && !shared3dStage) {
      throw new Error(resolveStudioLinked3dSaveProjectionText("sharedStageCorrupt"));
    }
    const linked3dRender = page.linked3dRender === undefined
      ? undefined
      : parseStudioLinked3dRenderDocument(page.linked3dRender);
    if (page.linked3dRender !== undefined && !linked3dRender) {
      throw new Error(resolveStudioLinked3dSaveProjectionText("renderIndexCorrupt"));
    }
    const reservedState = validateStudioLinked3dReservedPageState({
      value: linked3dRender,
      elements: page.elements,
    });
    if (!reservedState.ok) {
      // 집계자 예외 (A4 D4 R17 설계 §6.3): throw 문구가 표시 계약이라 합성 지점에서 해석한다. ko 합성은 전환 전과 글자 단위 동일하다.
      throw new Error(`${resolveStudioLinked3dSaveProjectionText("reservedStatePrefix")} ${resolveStudioLinked3dError(reservedState)}`);
    }
    if (linked3dRender) {
      const validation = validateStudioLinked3dRenderDocumentAgainstPage({
        value: linked3dRender,
        elements: page.elements,
        shared3dStage: shared3dStage ?? undefined,
      });
      if (!validation.ok) {
        throw new Error(`${resolveStudioLinked3dSaveProjectionText("authorityPrefix")} ${resolveStudioLinked3dError(validation)}`);
      }
    }
    if (shared3dStage === undefined && linked3dRender === undefined) return page;
    pagesChanged = true;
    return {
      ...page,
      ...(shared3dStage ? { shared3dStage } : {}),
      ...(linked3dRender ? { linked3dRender } : {}),
    };
  });

  return pagesChanged ? normalizedPages : pagesList as PageState[];
}
