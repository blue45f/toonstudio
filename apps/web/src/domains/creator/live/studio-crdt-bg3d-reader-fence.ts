import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { studioBg3dSixPassWorkReceiptsCover } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-work-receipts";
import { asStudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { decodeStudioCrdtSyncChunks, decodeStudioCrdtStateVector, encodeStudioCrdtSyncChunks, encodeStudioCrdtStateVector,
  STUDIO_CRDT_PROTOCOL_VERSION, type StudioCrdtSyncRequest, type StudioCrdtSyncResponse } from "./studio-crdt-protocol";
import { STUDIO_CRDT_READER_CAPABILITIES, assertStudioCrdtSupportedReaders, requiresStudioBg3dBundleReader,
  supportsStudioCrdtReaders, type StudioCrdtReaderMetadata } from "./studio-crdt-reader-capability";
import type { StudioCrdtDocument } from "./studio-crdt-document";

const ROOT = "studio-bg3d-bundle-revisions-v1";
function registry(document: StudioCrdtDocument) { return asStudioCrdtDocumentHost(document).doc.getMap<string>(ROOT); }
export function studioCrdtBg3dBundleArtifactScope(document: StudioCrdtDocument, workId: string): "origin" | "work" {
  const hashes = [...registry(document).values()].map((raw) => {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("manifestHash" in value) || typeof value.manifestHash !== "string") throw new Error("6패스 참조가 손상되었습니다.");
    return value.manifestHash;
  });
  return hashes.length && studioBg3dSixPassWorkReceiptsCover(workId, hashes) ? "work" : "origin";
}
export function studioCrdtBg3dReaderMetadata(document: StudioCrdtDocument, scope?: () => "origin" | "work"): StudioCrdtReaderMetadata {
  return registry(document).size ? { readerCapabilities: STUDIO_CRDT_READER_CAPABILITIES,
    requiredReaderCapabilities: [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY], artifactScope: scope?.() ?? "origin" } : {};
}
export function studioCrdtPeerSyncResponse(input: { document: StudioCrdtDocument; request: StudioCrdtSyncRequest;
  workId: string; transferId: string; sequence: number; scope?: () => "origin" | "work" }): StudioCrdtSyncResponse | null {
  const meta = studioCrdtBg3dReaderMetadata(input.document, input.scope);
  if (requiresStudioBg3dBundleReader(meta) && !supportsStudioCrdtReaders(input.request)) return null;
  const diff = input.document.encodeStateAsUpdate(decodeStudioCrdtStateVector(input.request.stateVector));
  const chunks = encodeStudioCrdtSyncChunks(diff);
  return { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: input.workId, requestId: input.request.requestId,
    transferId: input.transferId, chunks, chunkCount: chunks.length, totalBytes: diff.byteLength,
    serverStateVector: encodeStudioCrdtStateVector(input.document.encodeStateVector()), serverSequence: String(input.sequence), ...meta };
}
interface StudioCrdtBg3dAdmissionApplication {
  isActive: () => boolean;
  apply: () => void;
}

/** 일반 획은 동기 적용한다. 6패스는 최신 shadow 검증과 실제 적용 사이에 비동기 틈을 두지 않는다. */
export function applyStudioCrdtBg3dReaderUpdate(document: StudioCrdtDocument, bytes: Uint8Array,
  meta: StudioCrdtReaderMetadata, workId: string, authoritative: boolean,
  application: StudioCrdtBg3dAdmissionApplication): Promise<void> | null {
  if (!application.isActive()) return null;
  assertStudioCrdtSupportedReaders(meta);
  const candidateFeature = registry(document).size > 0 || requiresStudioBg3dBundleReader(meta)
    || new TextDecoder().decode(bytes).includes(ROOT) || new TextDecoder().decode(bytes).includes("bg3dLtBundleReference");
  if (!candidateFeature) { application.apply(); return null; }
  if (!requiresStudioBg3dBundleReader(meta)) throw new Error("6패스 문서는 구 reader의 동기화와 변경을 받을 수 없습니다.");
  const scope = meta.artifactScope ?? (authoritative ? "work" : null);
  if (!scope || (scope === "origin" && authoritative)) throw new Error("6패스 본문의 기기·작품 권위 범위를 확인하지 못했습니다.");
  return (async () => {
    const [{ StudioCrdtDocument: Candidate }, { hydrateStudioBg3dSixPassFrontier }] = await Promise.all([
      import("./studio-crdt-document"), import("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration"),
    ]);
    if (!application.isActive()) return;
    const host = asStudioCrdtDocumentHost(document);
    let revision = 0;
    // state vector가 증가하지 않는 Yjs 삭제도 재검증 사유에 포함한다.
    const invalidate = () => { revision += 1; };
    host.doc.on("update", invalidate);
    try {
      while (application.isActive()) {
        const before = revision;
        const immutable = new Map(registry(document).entries());
        const shadow = new Candidate(document.encodeStateAsUpdate());
        try {
          try {
            shadow.applyUpdate(bytes);
            const retained = registry(shadow);
            for (const [key, value] of immutable) if (retained.get(key) !== value) throw new Error("봉인된 6패스 revision을 지우거나 교체할 수 없습니다.");
            await hydrateStudioBg3dSixPassFrontier({ pages: shadow.getPages(true), sceneElements: shadow.getSceneElements({ includeDeleted: true }),
              strokes: shadow.getStrokes({ includeDeleted: true }), layerGroups: shadow.getLayerGroups({ includeDeleted: true }) }, scope === "work" ? workId : null);
          } catch (error) {
            if (!application.isActive()) return;
            if (revision !== before) continue;
            throw error;
          }
          if (!application.isActive()) return;
          if (revision !== before) continue;
          application.apply();
          return;
        } finally { shadow.destroy(); }
      }
    } finally { host.doc.off("update", invalidate); }
  })();
}
export function applyStudioCrdtBg3dSyncResponse(document: StudioCrdtDocument, response: StudioCrdtSyncResponse,
  workId: string, authoritative: boolean, application: StudioCrdtBg3dAdmissionApplication): Promise<void> | null {
  return applyStudioCrdtBg3dReaderUpdate(document, decodeStudioCrdtSyncChunks(response.chunks, response.totalBytes), response, workId, authoritative, application);
}

export function studioCrdtBg3dPublishedRequest<T extends object>(document: StudioCrdtDocument, request: T,
  scope?: () => "origin" | "work"): T & StudioCrdtReaderMetadata {
  const meta = studioCrdtBg3dReaderMetadata(document, scope);
  return requiresStudioBg3dBundleReader(meta) ? { ...request, ...meta } : request;
}
