import type { StudioScopedEntityKind } from "@toonstudio/contracts/studio-scoped-write";
import type { StudioScopedCrdtPublisher } from "../studio-collab/studio-scoped-write-authority";
import type { StudioCrdtDocument } from "./studio-crdt-document";

/** 현재 room의 살아있는 로컬 CRDT와 flush 경계를 연결하고 문서 교체 시 모두 해제한다. */
export function bindStudioCrdtWriteBoundary(publisher: StudioScopedCrdtPublisher | null, document: StudioCrdtDocument, flush: () => void): (() => void) | undefined {
  if (!publisher) return undefined;
  const unbindFlush = publisher.bindFlushBoundary(flush), unbindPresence = publisher.bindEntityPresence?.((kind, id, pageId) => {
    if (kind === "surface") return document.getRasterOperationLog(id) !== null;
    const record = kind === "stroke" ? document.getStroke(id) : kind === "element" ? document.getSceneElement(id) : document.getLayerGroup(pageId, id);
    return record !== null && record.pageId === pageId;
  });
  return () => { unbindPresence?.(); unbindFlush(); };
}

/** 전체 편집자의 비매핑 변경은 문맥 없이 유지하고 보호 변경만 실제 grant를 싣는다. */
export function captureStudioCrdtWriteContext(publisher: StudioScopedCrdtPublisher | null, canEdit: boolean, document: StudioCrdtDocument) {
  const present = (kind: StudioScopedEntityKind, id: string, pageId: string, restoration: boolean) => kind === "stroke"
    ? document.getStroke(id, !restoration) !== null : kind === "element" ? document.getSceneElement(id, !restoration) !== null
      : kind === "group" ? document.getLayerGroup(pageId, id, !restoration) !== null : document.getRasterOperationLog(id) !== null;
  return canEdit ? publisher?.captureFullEditWriteContext?.(present) : publisher?.captureWriteContext(present);
}
