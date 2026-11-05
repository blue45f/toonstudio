import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { hasStudioPreservedDrawReaderCrdt as hasPreservedReader, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY, STUDIO_PRESERVED_DRAW_METADATA_STROKE_VERSION } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import * as Y from "yjs";
import { studioBg3dSixPassWorkReceiptsCover } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-work-receipts";
import { asStudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { decodeStudioCrdtSyncChunks, decodeStudioCrdtStateVector, encodeStudioCrdtSyncChunks, encodeStudioCrdtStateVector,
  STUDIO_CRDT_PROTOCOL_VERSION, type StudioCrdtSyncRequest, type StudioCrdtSyncResponse } from "./studio-crdt-protocol";
import { STUDIO_CRDT_READER_CAPABILITIES, assertStudioCrdtSupportedReaders, requiresStudioBg3dBundleReader,
  supportsStudioCrdtReaders, type StudioCrdtReaderMetadata } from "./studio-crdt-reader-capability";
import type { StudioCrdtDocument } from "./studio-crdt-document";

const ROOT = "studio-bg3d-bundle-revisions-v1";
interface PendingReaderRequirement { readonly required: readonly string[]; readonly applying: boolean }
const receivedPendingReaders = new WeakMap<Y.Doc, PendingReaderRequirement>();
function pendingReaderRequirements(doc: Y.Doc): readonly string[] {
  const remembered = receivedPendingReaders.get(doc);
  if (doc.store.pendingStructs === null && doc.store.pendingDs === null) {
    if (!remembered?.applying) receivedPendingReaders.delete(doc);
    return [];
  }
  return remembered?.required ?? [];
}
function hasStudioPreservedDrawReaderCrdt(doc: Y.Doc): boolean {
  return hasPreservedReader(doc, (update) => Y.decodeUpdateV2(update).structs.flatMap((item) =>
    item instanceof Y.Item ? [{ key: item.parentSub, values: item.content.getContent() }] : []));
}
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
  const bg3d = registry(document).size > 0;
  const required: string[] = bg3d ? [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY] : [];
  const doc = asStudioCrdtDocumentHost(document).doc;
  if (hasStudioPreservedDrawReaderCrdt(doc) || pendingReaderRequirements(doc).includes(STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY)) required.push(STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY);
  return required.length ? { readerCapabilities: STUDIO_CRDT_READER_CAPABILITIES,
    requiredReaderCapabilities: required, ...(bg3d ? { artifactScope: scope?.() ?? "origin" } : {}) } : {};
}
export function studioCrdtPeerSyncResponse(input: { document: StudioCrdtDocument; request: StudioCrdtSyncRequest;
  workId: string; transferId: string; sequence: number; scope?: () => "origin" | "work" }): StudioCrdtSyncResponse | null {
  const meta = studioCrdtBg3dReaderMetadata(input.document, input.scope);
  if (!supportsStudioCrdtReaders(input.request, meta.requiredReaderCapabilities ?? [])) return null;
  const diff = input.document.encodeStateAsUpdate(decodeStudioCrdtStateVector(input.request.stateVector));
  const chunks = encodeStudioCrdtSyncChunks(diff);
  return { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: input.workId, requestId: input.request.requestId,
    transferId: input.transferId, chunks, chunkCount: chunks.length, totalBytes: diff.byteLength,
    serverStateVector: encodeStudioCrdtStateVector(input.document.encodeStateVector()), serverSequence: String(input.sequence), ...meta };
}
interface StudioCrdtBg3dAdmissionApplication {
  isActive: () => boolean;
  apply: () => boolean | void;
}

/** 일반 획은 동기 적용한다. 6패스는 최신 shadow 검증과 실제 적용 사이에 비동기 틈을 두지 않는다. */
export function applyStudioCrdtBg3dReaderUpdate(document: StudioCrdtDocument, bytes: Uint8Array,
  meta: StudioCrdtReaderMetadata, workId: string, authoritative: boolean,
  application: StudioCrdtBg3dAdmissionApplication): Promise<void> | null {
  if (!application.isActive()) return null;
  assertStudioCrdtSupportedReaders(meta);
  const host = asStudioCrdtDocumentHost(document);
  const requiresPreserved = meta.requiredReaderCapabilities?.includes(STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY) === true;
  const assertPendingReaders = () => {
    const required = pendingReaderRequirements(host.doc);
    if (!authoritative && !supportsStudioCrdtReaders(meta, required)) throw new Error("획의 보존된 편집 정보를 지원하는 reader 동기화가 필요합니다.");
  };
  assertPendingReaders();
  const applyWithReaderRequirements = () => {
    if (!application.isActive()) return;
    assertPendingReaders();
    const retained = pendingReaderRequirements(host.doc), previous = receivedPendingReaders.get(host.doc);
    const required = [...new Set([...retained, ...(requiresPreserved ? [STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY] : [])])];
    if (!required.length) { application.apply(); return; }
    const pendingStructs = host.doc.store.pendingStructs?.update, pendingDs = host.doc.store.pendingDs;
    const incoming = { required, applying: true };
    // Yjs update 구독자가 apply 안에서 재전파해도 검증한 요구 메타를 잃지 않는다.
    receivedPendingReaders.set(host.doc, incoming);
    try {
      const applied = application.apply();
      if (receivedPendingReaders.get(host.doc) === incoming) {
        if (applied === false) { if (previous) receivedPendingReaders.set(host.doc, previous); else receivedPendingReaders.delete(host.doc); }
        else if (host.doc.store.pendingStructs !== null || host.doc.store.pendingDs !== null) receivedPendingReaders.set(host.doc, { required, applying: false });
        else receivedPendingReaders.delete(host.doc);
      }
    } catch (error) {
      if (receivedPendingReaders.get(host.doc) === incoming) {
        // 관측자 예외는 이미 반영된 Yjs pending을 되돌리지 않는다. 중복 merge도 배열 참조는 교체한다.
        const pendingChanged = host.doc.store.pendingStructs?.update !== pendingStructs || host.doc.store.pendingDs !== pendingDs;
        if (pendingChanged && (host.doc.store.pendingStructs !== null || host.doc.store.pendingDs !== null)) receivedPendingReaders.set(host.doc, { required, applying: false });
        else if (previous) receivedPendingReaders.set(host.doc, previous); else receivedPendingReaders.delete(host.doc);
      }
      throw error;
    }
  };
  const assertPreservedReader = (candidate: Y.Doc) => {
    if ((requiresPreserved || hasStudioPreservedDrawReaderCrdt(candidate))
      && (!requiresPreserved || !authoritative && !supportsStudioCrdtReaders(meta, meta.requiredReaderCapabilities ?? []))) {
      throw new Error("획의 보존된 편집 정보를 지원하는 reader 동기화가 필요합니다.");
    }
  };
  // 부모 key가 생략된 Yjs 증분과 아직 causal하게 풀리지 않은 기록도 최신 원본을 합친 뒤 판정한다.
  const candidatePreserved = requiresPreserved || hasStudioPreservedDrawReaderCrdt(host.doc) || host.doc.store.pendingStructs !== null
    || Y.decodeUpdate(bytes).structs.some((item) => item instanceof Y.Item
      && (item.parentSub === "payloadVersion" || item.parentSub === null)
      && item.content.getContent().includes(STUDIO_PRESERVED_DRAW_METADATA_STROKE_VERSION));
  if (candidatePreserved) {
    const shadow = new Y.Doc();
    try {
      Y.applyUpdate(shadow, Y.encodeStateAsUpdate(host.doc)); Y.applyUpdate(shadow, bytes);
      assertPreservedReader(shadow);
    } finally { shadow.destroy(); }
  }
  const candidateFeature = registry(document).size > 0 || requiresStudioBg3dBundleReader(meta)
    || new TextDecoder().decode(bytes).includes(ROOT) || new TextDecoder().decode(bytes).includes("bg3dLtBundleReference");
  if (!candidateFeature) { applyWithReaderRequirements(); return null; }
  if (!requiresStudioBg3dBundleReader(meta)) throw new Error("6패스 문서는 구 reader의 동기화와 변경을 받을 수 없습니다.");
  const scope = meta.artifactScope ?? (authoritative ? "work" : null);
  if (!scope || (scope === "origin" && authoritative)) throw new Error("6패스 본문의 기기·작품 권위 범위를 확인하지 못했습니다.");
  return (async () => {
    const [{ StudioCrdtDocument: Candidate }, { hydrateStudioBg3dSixPassFrontier }] = await Promise.all([
      import("./studio-crdt-document"), import("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration"),
    ]);
    if (!application.isActive()) return;
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
            assertPreservedReader(asStudioCrdtDocumentHost(shadow).doc);
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
          applyWithReaderRequirements();
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
  return meta.requiredReaderCapabilities?.length ? { ...request, ...meta } : request;
}
