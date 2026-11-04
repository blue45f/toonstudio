import * as Y from "yjs";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { asStudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { STUDIO_BG3D_BUNDLE_REVISIONS_ROOT } from "./studio-crdt-bg3d-bundle-refs";
import { STUDIO_CRDT_ORIGIN_LOCAL } from "./studio-crdt-protocol";

/** 그림자 문서의 완전한 전이를 검증한 뒤 한 Y 업데이트로 기존 문서에 반영한다. */
export function applyStudioBg3dBundlePublication<T>(document: StudioCrdtDocument,
  pages: readonly { bg3dLtBundles?: unknown }[], apply: (shadow: StudioCrdtDocument) => T): { result: T } | null {
  const doc = asStudioCrdtDocumentHost(document).doc;
  if (!pages.some((page) => page.bg3dLtBundles) && !doc.getMap(STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).size) return null;
  const shadow = new StudioCrdtDocument(Y.encodeStateAsUpdate(doc));
  try {
    const shadowDoc = asStudioCrdtDocumentHost(shadow).doc, vector = Y.encodeStateVector(shadowDoc);
    const result = apply(shadow), update = Y.encodeStateAsUpdate(shadowDoc, vector);
    if (update.byteLength > 48 * 1024 - 1024) throw new Error("6패스 원고 전이 전체가 CRDT 메시지 예산을 초과했습니다.");
    Y.applyUpdate(doc, update, STUDIO_CRDT_ORIGIN_LOCAL);
    return { result };
  } finally { shadow.destroy(); }
}
