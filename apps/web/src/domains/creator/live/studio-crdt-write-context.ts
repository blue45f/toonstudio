import type { StudioScopedEntityKind } from "@toonstudio/contracts/studio-scoped-write";
import type { StudioScopedCrdtPublisher } from "../studio-collab/studio-scoped-write-authority";
import type { StudioCrdtDocument } from "./studio-crdt-document";

/** 전체 편집자의 비매핑 변경은 문맥 없이 유지하고 보호 변경만 실제 grant를 싣는다. */
export function captureStudioCrdtWriteContext(publisher: StudioScopedCrdtPublisher | null, canEdit: boolean, document: StudioCrdtDocument) {
  const present = (kind: StudioScopedEntityKind, id: string, pageId: string, restoration: boolean) => kind === "stroke"
    ? document.getStroke(id, !restoration) !== null : kind === "element" ? document.getSceneElement(id, !restoration) !== null
      : kind === "group" ? document.getLayerGroup(pageId, id, !restoration) !== null : document.getRasterOperationLog(id) !== null;
  return canEdit ? publisher?.captureFullEditWriteContext?.(present) : publisher?.captureWriteContext(present);
}
