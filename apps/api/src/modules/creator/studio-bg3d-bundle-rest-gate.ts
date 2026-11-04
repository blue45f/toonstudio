import { eq } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import { parseStudioBg3dSixPassBundleState, hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { hasStudioBg3dRetainedBundlesInTransaction } from "./studio-bg3d-bundle.repository";
import { loadStudioCrdtDocumentInTransaction } from "./studio-crdt.repository";
import { hydrateStudioScopedCrdtDocument } from "./studio-scoped-crdt-authority";
import { creatorWorks } from "../../platform/database";
import type { StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";
import { assertStudioBg3dBundleJsonDocumentInTransaction, snapshotStudioCrdtBg3dBundles } from "./studio-crdt-bg3d-bundle";

/** 호출자가 이미 취득한 작품 advisory/행 잠금 안에서 reader와 봉인 원본을 함께 검증한다. */
export async function assertStudioBg3dRestDocumentInTransaction(transaction: StudioBg3dBundleTransaction,
  workId: string, document: unknown, features: readonly string[], previousDocument?: unknown): Promise<void> {
  const previous = previousDocument === undefined
    ? (await transaction.select({ document: creatorWorks.doc }).from(creatorWorks).where(eq(creatorWorks.id, workId)).limit(1))[0]?.document
    : previousDocument;
  const candidate = document === undefined ? previous : document;
  await assertStudioBg3dBundleJsonDocumentInTransaction(transaction, workId, candidate, features, previous);
  await assertStudioBg3dCommittedRegistryInTransaction(transaction, workId, candidate);
}

/** 최초 CRDT 게시 후 REST baseline이 비어 있어도 실제 commit된 registry를 잃지 않는다. */
async function assertStudioBg3dCommittedRegistryInTransaction(transaction: StudioBg3dBundleTransaction, workId: string, document: unknown): Promise<void> {
  if (!await hasStudioBg3dRetainedBundlesInTransaction(transaction, workId)) return;
  const doc = hydrateStudioScopedCrdtDocument(await loadStudioCrdtDocumentInTransaction(transaction, workId));
  try {
    const committed = snapshotStudioCrdtBg3dBundles(doc);
    if (!committed.revisions.size) return;
    const incoming = new Map<string, string>();
    const project = document && typeof document === "object" && !Array.isArray(document) ? document as Record<string, unknown> : null;
    const pages = Array.isArray(project?.pagesList) ? project.pagesList : [];
    for (const value of pages) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const page = value as Record<string, unknown>;
      if (page.bg3dLtBundles === undefined) continue;
      if (typeof page.id !== "string" || !Array.isArray(page.elements)) throw new ConflictException({ code: "studio_bg3d_committed_registry_required", message: "6패스 보존 원본은 실제 원고 페이지에 결박해야 합니다." });
      const state = parseStudioBg3dSixPassBundleState(page.bg3dLtBundles);
      for (const bundle of state.bundles) for (const manifest of bundle.revisions) {
        if (manifest.pageId !== page.id) throw new ConflictException({ code: "studio_bg3d_committed_registry_required", message: "6패스 보존 원본이 다른 페이지를 가리킵니다." });
        incoming.set(JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]), hashStudioBg3dSixPassBundleManifest(manifest));
      }
    }
    for (const [key, { ref }] of committed.revisions) if (incoming.get(key) !== ref.manifestHash) {
      throw new ConflictException({ code: "studio_bg3d_committed_registry_required",
        message: "이미 팀 원고에 게시한 6패스 원본이 저장 문서에 없습니다. 최신 원고를 동기화한 뒤 다시 저장해 주세요." });
    }
  } finally { doc.destroy(); }
}
