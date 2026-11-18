import type { StudioWorkAssetDescriptor } from "@toonstudio/contracts/studio-work-asset-contract";
import { createHash } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { WorkVrmCutReceipt } from "@toonstudio/contracts/studio-work-vrm-cut";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { creatorWorkAssets, db } from "../../platform/database";
import { studioWorkVrmCuts } from "../../platform/database/studio-raster-asset.schema";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import type { StudioWorkAssetRepository } from "./studio-work-asset.repository";

export type StudioWorkVrmCutSeal = typeof studioWorkVrmCuts.$inferInsert;
const whereCut = (workId: string, anchorId: string) =>
  and(eq(studioWorkVrmCuts.workId, workId), eq(studioWorkVrmCuts.anchorId, anchorId));

function assertSameCut(stored: typeof studioWorkVrmCuts.$inferSelect, value: StudioWorkVrmCutSeal) {
  if (stored.sceneSha256 !== value.sceneSha256 || stored.pageId !== value.pageId ||
      stored.compositeSha256 !== value.compositeSha256 ||
      canonicalJson(stored.bundledModels) !== canonicalJson(value.bundledModels) || canonicalJson(stored.attachments) !== canonicalJson(value.attachments)) {
      throw new ConflictException("이 레이어에 이미 다른 컷이 저장됐습니다. 새 컷 레이어로 저장해 주세요.");
    }
}

/** 사용 중인 앵커에 다른 원본을 제출했을 때 private storage에 불필요한 파일을 남기지 않는다. */
export async function assertWorkVrmCutCanStage(value: StudioWorkVrmCutSeal, descriptor: StudioWorkAssetDescriptor): Promise<void> {
  const [current] = await db.select({ seal: studioWorkVrmCuts, descriptor: creatorWorkAssets.descriptor })
    .from(creatorWorkAssets).leftJoin(studioWorkVrmCuts, and(eq(studioWorkVrmCuts.workId, creatorWorkAssets.workId),
      eq(studioWorkVrmCuts.anchorId, creatorWorkAssets.assetId)))
    .where(and(eq(creatorWorkAssets.workId, value.workId), eq(creatorWorkAssets.assetId, value.anchorId)));
  if (!current) return;
  if (!current.seal || canonicalJson(current.descriptor) !== canonicalJson(descriptor)) {
    throw new ConflictException("이미 다른 레이어가 사용하고 있는 ID입니다.");
  }
  assertSameCut(current.seal, value);
}

/** 작품 잠금을 보유한 이미지·첨부 쓰기와 함께 커밋한다. 실패 시 전부 롤백된다. */
export async function sealWorkVrmCut(tx: DrizzleStudioCrdtTransaction, value: StudioWorkVrmCutSeal, newAnchor: boolean): Promise<void> {
  const [stored] = await tx.select().from(studioWorkVrmCuts).where(whereCut(value.workId, value.anchorId));
  if (stored) {
    assertSameCut(stored, value);
    return;
  }
  if (!newAnchor) throw new ConflictException("이전에 다른 이미지에 사용한 레이어 ID입니다.");
  await tx.insert(studioWorkVrmCuts).values(value);
}

export function readWorkVrmCut(repository: StudioWorkAssetRepository, actor: string, workId: string, anchorId: string): Promise<WorkVrmCutReceipt> {
  return db.transaction(async tx => {
    const [manifest] = await repository.getManifestsInTransaction(tx, actor, workId, [anchorId]);
    if (!manifest) throw new NotFoundException("작품에 저장한 VRM 컷을 찾을 수 없습니다.");
    const [row] = await tx.select().from(studioWorkVrmCuts).where(whereCut(workId, anchorId));
    if (!row) throw new NotFoundException("작품에 저장한 VRM 컷을 찾을 수 없습니다.");
    if (manifest.elementType !== "image" || manifest.sha256 !== row.compositeSha256 ||
      createHash("sha256").update(row.sceneText).digest("hex") !== row.sceneSha256) throw new Error("저장된 VRM 컷의 원본 정보가 다릅니다.");
    return { version: 1, workId, anchorId, pageId: row.pageId, sceneSha256: row.sceneSha256, compositeSha256: row.compositeSha256,
      scene: JSON.parse(row.sceneText) as Record<string, unknown>, manifest, attachments: row.attachments, bundledModels: row.bundledModels };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
