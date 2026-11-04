import { and, eq, inArray } from "drizzle-orm";
import { assertStudioLinked3dPassAssetRows, extractStudioLinked3dPassAssetRequirements,
  type CreatorWorkLinked3dJsonEnvelope, type StudioLinked3dPassAssetRequirement, type StudioLinked3dPassAssetRow } from "@toonstudio/contracts/studio-linked-3d-pass-asset-fence";
import { creatorWorkAssets } from "../../platform/database";
import type { StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";

/** payload 없이 같은 transaction의 불변 legacy PNG 행만 조회한다. */
export async function readStudioLinkedPassAssetRows(transaction: Pick<StudioBg3dBundleTransaction, "select">,
  workId: string, assetIds: readonly string[]): Promise<readonly StudioLinked3dPassAssetRow[]> {
  if (!assetIds.length) return [];
  return transaction.select({ workId: creatorWorkAssets.workId, assetId: creatorWorkAssets.assetId,
    elementType: creatorWorkAssets.elementType, mimeType: creatorWorkAssets.mimeType, descriptor: creatorWorkAssets.descriptor,
    byteSize: creatorWorkAssets.byteSize, sha256: creatorWorkAssets.sha256, intrinsicWidth: creatorWorkAssets.intrinsicWidth,
    intrinsicHeight: creatorWorkAssets.intrinsicHeight, decodedRgbaBytes: creatorWorkAssets.decodedRgbaBytes })
    .from(creatorWorkAssets).where(and(eq(creatorWorkAssets.workId, workId), inArray(creatorWorkAssets.assetId, [...new Set(assetIds)])))
    .orderBy(creatorWorkAssets.assetId);
}

/** 실제 DB unit은 검증된 native 입장 함수를 제공하며, 기존 unit의 기본값은 엄격한 legacy 계약이다. */
export async function assertStudioLinkedPassUnitAssets(input: {
  readonly workId: string; readonly envelope: CreatorWorkLinked3dJsonEnvelope; readonly features: readonly string[];
  readonly extract?: (workId: string, envelope: CreatorWorkLinked3dJsonEnvelope, features: readonly string[]) => Promise<readonly StudioLinked3dPassAssetRequirement[]>;
  readonly read: (workId: string, assetIds: readonly string[]) => Promise<readonly StudioLinked3dPassAssetRow[]>;
}): Promise<void> {
  const requirements = input.extract ? await input.extract(input.workId, input.envelope, input.features)
    : extractStudioLinked3dPassAssetRequirements(input.envelope);
  if (requirements.length) assertStudioLinked3dPassAssetRows({ workId: input.workId, requirements,
    rows: await input.read(input.workId, requirements.map(({ assetId }) => assetId)) });
}
