import { materializeStudioAuthoringFromCrdt, readStudioCrdtScopedRecords } from "@toonstudio/contracts/studio-crdt-authoring";
import * as Y from "yjs";
import { assertStudioLegacyPigmentArchiveTransition, assertStudioLegacyPigmentArchiveCrdtRecords,
  assertStudioLegacyPigmentArchiveBaselineProjection, studioLegacyPigmentArchiveSourceAuthority,
  studioLegacyPigmentArchiveRecordDocument, hasStudioLegacyPigmentArchives } from "./studio-legacy-pigment-archive-admission";
import { loadStudioScopedCrdtReferenceSources } from "./studio-scoped-crdt-reference-sources";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";

export function hasStudioCrdtLegacyPigmentArchives(doc: Y.Doc): boolean {
  const strokes = doc.share.get("strokes");
  if (!(strokes instanceof Y.Map)) return false;
  for (const value of strokes.values()) {
    if (!(value instanceof Y.Map)) continue;
    const extensions = value.get("extensions");
    if (extensions instanceof Y.Map ? extensions.has("legacyPigmentArchive")
      : extensions && typeof extensions === "object" && Object.hasOwn(extensions, "legacyPigmentArchive")) return true;
  }
  return false;
}

/** 잠근 작품의 기존 baseline을 재사용한다. 일반 획 추가에는 DB 조회나 Authoring 투영을 늘리지 않는다. */
export async function assertStudioLegacyPigmentArchiveCrdtAdmission(input: {
  readonly workId: string; readonly baseline: unknown; readonly before: Y.Doc; readonly after: Y.Doc;
  readonly transaction?: DrizzleStudioCrdtTransaction;
}): Promise<void> {
  if (!hasStudioLegacyPigmentArchives(input.baseline) && !hasStudioCrdtLegacyPigmentArchives(input.before)
    && !hasStudioCrdtLegacyPigmentArchives(input.after)) return;
  const baseline = input.baseline ?? { pagesList: [] };
  const references = input.transaction
    ? await loadStudioScopedCrdtReferenceSources(input.transaction, input.workId, baseline, [input.before, input.after]) : undefined;
  const before = materializeStudioAuthoringFromCrdt({ baseline, doc: input.before, referenceSources: references });
  const after = materializeStudioAuthoringFromCrdt({ baseline, doc: input.after, referenceSources: references });
  const beforeRecords = readStudioCrdtScopedRecords({ baseline, doc: input.before, referenceSources: references });
  const afterRecords = readStudioCrdtScopedRecords({ baseline, doc: input.after, referenceSources: references });
  // baseline-only 원본이 구 reader 초기화로 사라지는 경우도 새 Y 전이와 별도로 막는다.
  assertStudioLegacyPigmentArchiveBaselineProjection(baseline, before, beforeRecords);
  const sourceAuthority = studioLegacyPigmentArchiveSourceAuthority(baseline, before, studioLegacyPigmentArchiveRecordDocument(afterRecords));
  assertStudioLegacyPigmentArchiveCrdtRecords(sourceAuthority, beforeRecords, afterRecords);
  assertStudioLegacyPigmentArchiveTransition(sourceAuthority, after);
}
