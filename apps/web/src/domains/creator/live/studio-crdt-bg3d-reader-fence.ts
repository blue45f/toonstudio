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
/** 일반 획 경로는 동기식으로 통과한다. 기능 문서는 shadow와 native 영수증을 먼저 검증한다. */
export function prepareStudioCrdtBg3dReaderAdmission(document: StudioCrdtDocument, bytes: Uint8Array,
  meta: StudioCrdtReaderMetadata, workId: string, authoritative: boolean): Promise<void> | null {
  assertStudioCrdtSupportedReaders(meta);
  const before = registry(document);
  const candidateFeature = before.size > 0 || requiresStudioBg3dBundleReader(meta)
    || new TextDecoder().decode(bytes).includes(ROOT) || new TextDecoder().decode(bytes).includes("bg3dLtBundleReference");
  if (!candidateFeature) return null;
  if (!requiresStudioBg3dBundleReader(meta)) throw new Error("6패스 문서는 구 reader의 동기화와 변경을 받을 수 없습니다.");
  const scope = meta.artifactScope ?? (authoritative ? "work" : null);
  if (!scope || (scope === "origin" && authoritative)) throw new Error("6패스 본문의 기기·작품 권위 범위를 확인하지 못했습니다.");
  const vector = document.getStateVectorBase64();
  const immutable = new Map(before.entries());
  return (async () => {
    const [{ StudioCrdtDocument: Candidate }, { hydrateStudioBg3dSixPassFrontier }] = await Promise.all([
      import("./studio-crdt-document"), import("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration"),
    ]);
    const shadow = new Candidate(document.encodeStateAsUpdate());
    try {
      shadow.applyUpdate(bytes);
      const retained = registry(shadow);
      for (const [key, value] of immutable) if (retained.get(key) !== value) throw new Error("봉인된 6패스 revision을 지우거나 교체할 수 없습니다.");
      await hydrateStudioBg3dSixPassFrontier({ pages: shadow.getPages(true), sceneElements: shadow.getSceneElements({ includeDeleted: true }),
        strokes: shadow.getStrokes({ includeDeleted: true }), layerGroups: shadow.getLayerGroups({ includeDeleted: true }) }, scope === "work" ? workId : null);
      if (document.getStateVectorBase64() !== vector) throw new Error("원고가 바뀌어 6패스 동기화 적용을 멈췄습니다.");
    } finally { shadow.destroy(); }
  })();
}
export function prepareStudioCrdtBg3dSyncAdmission(document: StudioCrdtDocument, response: StudioCrdtSyncResponse,
  workId: string, authoritative: boolean): Promise<void> | null {
  return prepareStudioCrdtBg3dReaderAdmission(document, decodeStudioCrdtSyncChunks(response.chunks, response.totalBytes), response, workId, authoritative);
}

export function studioCrdtBg3dPublishedRequest<T extends object>(document: StudioCrdtDocument, request: T,
  scope?: () => "origin" | "work"): T & StudioCrdtReaderMetadata {
  const meta = studioCrdtBg3dReaderMetadata(document, scope);
  return requiresStudioBg3dBundleReader(meta) ? { ...request, ...meta } : request;
}
