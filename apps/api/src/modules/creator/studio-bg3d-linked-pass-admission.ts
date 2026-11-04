import { extractStudioLinked3dPassAssetRequirements, type CreatorWorkLinked3dJsonEnvelope,
  type StudioLinked3dPassNativeAdmission } from "@toonstudio/contracts/studio-linked-3d-pass-asset-fence";
import { parseStudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { assertStudioBg3dRestDocumentInTransaction } from "./studio-bg3d-bundle-rest-gate";
import type { StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 봉인 원본·reader·최신 CRDT registry를 같은 잠금 안에서 먼저 검증한 뒤 중복 legacy PNG만 제외한다. */
export async function extractStudioBg3dLinkedPassRequirementsInTransaction(transaction: StudioBg3dBundleTransaction,
  workId: string, envelope: CreatorWorkLinked3dJsonEnvelope, readerCapabilities: readonly string[], previousDocument?: unknown) {
  await assertStudioBg3dRestDocumentInTransaction(transaction, workId, envelope.doc, readerCapabilities, previousDocument);
  const admissions: StudioLinked3dPassNativeAdmission[] = [];
  if (record(envelope.doc) && Array.isArray(envelope.doc.pagesList)) for (const page of envelope.doc.pagesList) {
    if (!record(page) || page.bg3dLtBundles === undefined || !Array.isArray(page.elements)) continue;
    const manifests = parseStudioBg3dSixPassBundleState(page.bg3dLtBundles).bundles.flatMap((bundle) => bundle.revisions);
    for (const image of page.elements) {
      if (!record(image) || image.type !== "image") continue;
      const ref = parseStudioBg3dSixPassBundleImageReference(image.bg3dLtBundleReference);
      if (!ref || ref.role !== "main-line") continue;
      const manifest = manifests.find((value) => value.bundleId === ref.bundleId && value.renderRevisionId === ref.renderRevisionId);
      const layer = manifest?.layers.find((value) => value.role === "main-line");
      // 앞선 검사에서 같은 작품의 봉인 manifest와 결박했다. marker 자체를 예외 근거로 쓰지 않는다.
      if (!manifest || !layer) throw new Error("검증한 6패스 main-line 원본이 없습니다.");
      admissions.push({ pageId: manifest.pageId, bundleId: manifest.bundleId, elementId: layer.elementId,
        contentHash: layer.artifact.contentHash, byteSize: layer.artifact.byteSize, width: layer.artifact.width, height: layer.artifact.height });
    }
  }
  return extractStudioLinked3dPassAssetRequirements(envelope, admissions);
}
