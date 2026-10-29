import * as Y from "yjs";
import { materializeStudioAuthoringFromCrdt, readStudioCrdtScopedRecords, type StudioCrdtAuthoringMaterializeInput } from "@toonstudio/contracts/studio-crdt-authoring";
import { readStudioCrdtRasterDocument, STUDIO_CRDT_RASTER_ROOT_NAMES } from "@toonstudio/contracts/studio-crdt-raster-document-contract";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";
import { loadStudioScopedCrdtReferenceSources } from "./studio-scoped-crdt-reference-sources";
import { snapshotStudioScopedOpaqueRoots } from "./studio-scoped-crdt-opaque";
import { loadStudioCrdtDocumentInTransaction, type DrizzleStudioCrdtTransaction, type StudioCrdtHydrationState } from "./studio-crdt.repository";
import { projectStudioScopedAuthoringDocument, scopedEntityKey, scopedRecord, StudioScopedWriteDeniedError,
  type StudioScopedDocumentState, type StudioScopedEntityState } from "./studio-scoped-write-effects";

/** 지연된 인과 변경은 다음 사용자의 쓰기에 섞어 승인하지 않는다. */
export function assertStudioScopedCrdtResolved(doc: Y.Doc): void {
  if (doc.store.pendingStructs !== null || doc.store.pendingDs !== null) throw new StudioScopedWriteDeniedError("unresolved");
  if (!hasValidStudioCrdtRootSchema(doc)) throw new StudioScopedWriteDeniedError("ambiguous");
}

export function hydrateStudioScopedCrdtDocument(current: StudioCrdtHydrationState): Y.Doc {
  const doc = new Y.Doc();
  try {
    if (current.snapshot) Y.applyUpdate(doc, current.snapshot.snapshot, "scoped-durable-snapshot");
    for (const update of current.updates) Y.applyUpdate(doc, update.payload, "scoped-durable-update");
    assertStudioScopedCrdtResolved(doc);
    return doc;
  } catch (error) { doc.destroy(); throw error; }
}

/** Authoring 변환과 원시 권한 검사는 구분하며 미상 root는 실제 Item 상태로 비교한다. */
export function projectStudioScopedCrdtAuthority(doc: Y.Doc, baseline: unknown, referenceSources?: StudioCrdtAuthoringMaterializeInput["referenceSources"]): {
  readonly state: StudioScopedDocumentState; readonly authoringDocument: unknown;
} {
  assertStudioScopedCrdtResolved(doc);
  const authoringDocument = materializeStudioAuthoringFromCrdt({ baseline, doc, referenceSources });
  const projected = projectStudioScopedAuthoringDocument(authoringDocument);
  const entities = new Map(projected.entities), pages = new Map(projected.pageProperties);
  const surfaceReferences = new Map([...projected.surfaceReferences].map(([id, references]) => [id, [...references]]));
  const raw = new Map<string, Record<string, unknown>>(), unassignedSurfaces = new Map<string, unknown>();
  const putRaw = (key: string, name: string, value: unknown) => {
    const current = raw.get(key) ?? {}; current[name] = value; raw.set(key, current);
  };
  for (const record of readStudioCrdtScopedRecords({ baseline, doc, referenceSources })) {
    const key = scopedEntityKey(record.kind, record.id, record.pageId), visible = entities.get(key);
    entities.set(key, { ...record, value: visible?.value ?? record.value });
    putRaw(key, "record", record.raw);
  }
  const referencesIn = (value: unknown, owner: string): void => {
    if (Array.isArray(value)) { for (const child of value) referencesIn(child, owner); return; }
    const object = scopedRecord(value); if (!object) return;
    for (const [name, child] of Object.entries(object)) {
      if ((name === "surfaceId" || name.endsWith("SurfaceId")) && typeof child === "string") {
        const references = surfaceReferences.get(child) ?? []; if (!references.includes(owner)) references.push(owner); surfaceReferences.set(child, references);
      } else referencesIn(child, owner);
    }
  };
  // 삭제된 실제 consumer도 보존해야 복원 전후에 surface가 전역·객체 사이를 이동하지 않는다.
  for (const [key, entity] of entities) referencesIn(entity.value, key);
  const pageRaw = (pageId: string, name: string, value: unknown) => {
    if (!pages.has(pageId)) pages.set(pageId, { deleted: true });
    putRaw(`page:${pageId}`, name, value);
  };
  for (const [name, root] of doc.share) {
    if (name === "strokes" || name === "scene-elements" || name === "layer-groups" || name === "studio-pages"
      || name.startsWith("scene-element:") || name.startsWith("layer-group:")) continue;
    if (name.startsWith("studio-page:")) {
      const pageId = decodeURIComponent(name.slice("studio-page:".length));
      pageRaw(pageId, "record", root.toJSON()); continue;
    }
    if (name === "stroke-order" && root instanceof Y.Array) {
      const perEntity = new Map<string, unknown[]>();
      for (const item of root.toArray()) {
        if (!(item instanceof Y.Map)) throw new StudioScopedWriteDeniedError("ambiguous");
        const kind = item.has("strokeId") ? "stroke" : "element", id = item.get("strokeId") ?? item.get("elementId");
        if (typeof id !== "string") throw new StudioScopedWriteDeniedError("ambiguous");
        const key = scopedEntityKey(kind, id), list = perEntity.get(key) ?? []; list.push(item.toJSON()); perEntity.set(key, list);
      }
      for (const [key, entries] of perEntity) putRaw(key, "order", entries);
      continue;
    }
    if (name === "page-order" && root instanceof Y.Array) {
      const perPage = new Map<string, unknown[]>();
      for (const item of root.toArray()) {
        if (!(item instanceof Y.Map) || typeof item.get("pageId") !== "string") throw new StudioScopedWriteDeniedError("ambiguous");
        const id = String(item.get("pageId")), list = perPage.get(id) ?? []; list.push(item.toJSON()); perPage.set(id, list);
      }
      for (const [id, entries] of perPage) pageRaw(id, "order", entries);
      continue;
    }
    if ((name === "studio-deletion-ops" || name === "studio-deletion-acks") && root instanceof Y.Map) {
      for (const [operationId, encoded] of root) {
        if (typeof encoded !== "string") throw new StudioScopedWriteDeniedError("ambiguous");
        const target: unknown = JSON.parse(encoded);
        if (!Array.isArray(target) || typeof target[1] !== "string") throw new StudioScopedWriteDeniedError("ambiguous");
        const key = target[0] === "page" ? `page:${target[1]}`
          : scopedEntityKey(target[0] === "scene" ? "element" : target[0] === "group" ? "group" : "stroke",
            target[0] === "group" ? String(target[2]) : target[1], target[0] === "group" ? target[1] : undefined);
        putRaw(key, `${name}:${operationId}`, encoded);
      }
      continue;
    }
    if ((STUDIO_CRDT_RASTER_ROOT_NAMES as readonly string[]).includes(name)) continue;
    // 무관한 runtime/3D/향후 root는 아래의 안전한 opaque Item entries로 비교한다.
  }
  for (const [key, value] of raw) {
    if (key.startsWith("page:")) {
      const id = key.slice(5);
      pages.set(id, { authoring: projected.pageProperties.get(id), raw: value });
    } else {
      const entity = entities.get(key);
      if (!entity) throw new StudioScopedWriteDeniedError("ambiguous");
      entities.set(key, { ...entity, raw: value });
    }
  }
  const raster = readStudioCrdtRasterDocument(doc);
  for (const [id, surface] of raster.surfaces) {
    const references = surfaceReferences.get(id) ?? [];
    const consumers = references.map((key) => entities.get(key));
    const first = consumers[0];
    if (!first || consumers.some((entity) => !entity || entity.pageId !== first.pageId || entity.layerId !== first.layerId)) {
      unassignedSurfaces.set(id, { surface, log: raster.logs.get(id), checkpoints: raster.checkpoints.filter((entry) => entry.surface.surfaceId === id) });
      continue;
    }
    const log = raster.logs.get(id);
    if (log?.operations.some((operation) => operation.pageId !== first.pageId || operation.layerId !== first.layerId)) throw new StudioScopedWriteDeniedError("ambiguous");
    const value: StudioScopedEntityState = { kind: "surface", id, pageId: first.pageId, layerId: first.layerId,
      value: { ...surface }, raw: { surface, log, checkpoints: raster.checkpoints.filter((entry) => entry.surface.surfaceId === id) } };
    entities.set(scopedEntityKey("surface", id), value);
  }
  return { authoringDocument, state: { ...projected, entities, pageProperties: pages, surfaceReferences,
    globalProperties: { authoring: projected.globalProperties, raw: { opaqueRoots: snapshotStudioScopedOpaqueRoots(doc),
      unassignedSurfaces: [...unassignedSurfaces].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0) } } } };
}

/** 호출자가 공통 advisory/work 잠금을 잡은 동일 transaction에서만 사용한다. */
export async function loadStudioScopedCrdtAuthority(transaction: DrizzleStudioCrdtTransaction, workId: string, baseline: unknown) {
  const current = await loadStudioCrdtDocumentInTransaction(transaction, workId), doc = hydrateStudioScopedCrdtDocument(current);
  try {
    const references = await loadStudioScopedCrdtReferenceSources(transaction, workId, baseline, [doc]);
    const authority = projectStudioScopedCrdtAuthority(doc, baseline, references);
    const serverSequence = current.updates.at(-1)?.sequence ?? current.snapshot?.compactedSequence ?? 0n;
    return { ...authority, serverSequence };
  } finally { doc.destroy(); }
}
