import { sql } from "drizzle-orm";
import type * as Y from "yjs";
import type { StudioCrdtAuthoringMaterializeInput } from "@toonstudio/contracts/studio-crdt-authoring";
import { StudioWorkAssetDescriptorSchema, studioWorkAssetSourceUri } from "@toonstudio/contracts/studio-work-asset-contract";
import { snapshotStudioWorkAssetReferences } from "./studio-crdt-root-schema";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { scopedRecord, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";

/** 새 참조의 원본은 업로드 시 검증·고정한 서버 descriptor다. 클라이언트 후보 원고를 before에 복제하지 않는다. */
export async function loadStudioScopedCrdtReferenceSources(transaction: DrizzleStudioCrdtTransaction, workId: string,
  baseline: unknown, documents: readonly Y.Doc[]): Promise<NonNullable<StudioCrdtAuthoringMaterializeInput["referenceSources"]>> {
  const present = new Set<string>(), pages = scopedRecord(baseline)?.pagesList;
  if (!Array.isArray(pages)) throw new StudioScopedWriteDeniedError("ambiguous");
  for (const page of pages) {
    const elements = scopedRecord(page)?.elements;
    if (!Array.isArray(elements)) throw new StudioScopedWriteDeniedError("ambiguous");
    for (const element of elements) { const id = scopedRecord(element)?.id; if (typeof id === "string") present.add(id); }
  }
  const wanted = new Map(documents.flatMap((doc) => [...snapshotStudioWorkAssetReferences(doc).admittedReferences.values()])
    .filter((reference) => !present.has(reference.assetId)).map((reference) => [reference.assetId, reference]));
  if (!wanted.size) return new Map();
  const rows = await transaction.execute<{ assetId: string; elementType: string; descriptor: unknown }>(sql`
    SELECT "assetId","elementType",descriptor FROM creator_work_asset
    WHERE "workId"=${workId} AND "assetId"=ANY(${[...wanted.keys()]}::text[]) FOR SHARE`);
  const result = new Map<string, { readonly id: string; readonly type: string; readonly src: string }>();
  for (const row of rows.rows) {
    const descriptor = StudioWorkAssetDescriptorSchema.parse(row.descriptor), expected = wanted.get(row.assetId);
    if (!expected || row.elementType !== expected.elementType || descriptor.element.id !== row.assetId
      || descriptor.element.type !== row.elementType || result.has(row.assetId)) throw new StudioScopedWriteDeniedError("ambiguous");
    result.set(row.assetId, { ...descriptor.element, src: studioWorkAssetSourceUri(expected) });
  }
  if (result.size !== wanted.size) throw new StudioScopedWriteDeniedError("ambiguous");
  return result;
}
