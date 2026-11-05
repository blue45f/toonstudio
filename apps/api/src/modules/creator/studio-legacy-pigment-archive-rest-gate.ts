import { eq } from "drizzle-orm";
import { materializeStudioAuthoringFromCrdt, readStudioCrdtScopedRecords } from "@toonstudio/contracts/studio-crdt-authoring";
import { creatorWorks } from "../../platform/database";
import { loadStudioCrdtDocumentInTransaction, type DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { hydrateStudioScopedCrdtDocument } from "./studio-scoped-crdt-authority";
import { loadStudioScopedCrdtReferenceSources } from "./studio-scoped-crdt-reference-sources";
import { assertStudioLegacyPigmentArchiveTransition, assertStudioLegacyPigmentArchiveBaselineProjection,
  assertStudioLegacyPigmentArchiveReader, studioLegacyPigmentArchiveSourceAuthority,
  hasStudioLegacyPigmentArchives } from "./studio-legacy-pigment-archive-admission";
import { hasStudioCrdtLegacyPigmentArchives } from "./studio-legacy-pigment-archive-crdt-admission";

/** 호출자는 작품 advisory/행 잠금과 CAS 권한을 이미 검사한다. 캐시 밖의 최신 durable 원본을 비교한다. */
export async function assertStudioLegacyPigmentArchiveRestDocumentInTransaction(
  transaction: DrizzleStudioCrdtTransaction, workId: string, candidate: unknown, lockedBaseline?: unknown,
  readerCapabilities: readonly string[] = [], trustedRevisionRestore = false,
): Promise<void> {
  const baseline = lockedBaseline === undefined
    ? (await transaction.select({ document: creatorWorks.doc }).from(creatorWorks).where(eq(creatorWorks.id, workId)).limit(1))[0]?.document
    : lockedBaseline;
  const doc = hydrateStudioScopedCrdtDocument(await loadStudioCrdtDocumentInTransaction(transaction, workId));
  try {
    if (!hasStudioLegacyPigmentArchives(baseline) && !hasStudioLegacyPigmentArchives(candidate)
      && !hasStudioCrdtLegacyPigmentArchives(doc)) return;
    const source = baseline ?? { pagesList: [] };
    const referenceSources = await loadStudioScopedCrdtReferenceSources(transaction, workId, source, [doc]);
    const authoritative = materializeStudioAuthoringFromCrdt({ baseline: source, doc, referenceSources });
    assertStudioLegacyPigmentArchiveReader(source, readerCapabilities);
    assertStudioLegacyPigmentArchiveReader(authoritative, readerCapabilities);
    if (trustedRevisionRestore) {
      // 호출자가 같은 transaction에서 읽은 동일 작품 revision만 이 명시 복원 경로를 사용한다.
      assertStudioLegacyPigmentArchiveTransition(undefined, candidate);
      return;
    }
    assertStudioLegacyPigmentArchiveBaselineProjection(source, authoritative,
      readStudioCrdtScopedRecords({ baseline: source, doc, referenceSources }));
    assertStudioLegacyPigmentArchiveTransition(studioLegacyPigmentArchiveSourceAuthority(source, authoritative, candidate), candidate);
  } finally { doc.destroy(); }
}
