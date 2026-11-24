import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ConflictException } from "@nestjs/common";
import { creatorAssetLicenseOf, isCreatorAssetLicenseId } from "@toonstudio/contracts/creator-asset-contract";
import { parseStudioBundleSourceCredit, studioBundleCreditMatchesSource } from "@toonstudio/contracts/studio-bundle-source-credit";
import { parseStudioWorkAssetSourceUri } from "@toonstudio/contracts/studio-work-asset-contract";
import { WorkVrmCutAnchorSchema } from "@toonstudio/contracts/studio-work-vrm-cut";
import { hashStudioBg3dSixPassBundleManifest, hashStudioBg3dSixPassCanonicalJson, parseStudioBg3dSixPassBundleState,
  type StudioBg3dSixPassWorkVrmCut } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { isStudioVrmProjectArchiveUseContextReceipt, studioVrmProjectArchiveActionContext } from "@toonstudio/contracts/studio-vrm-archive-rights";
import { parsePanelImportRights } from "@toonstudio/contracts/panel-import-rights";
import { BLOCKED_WORK_VRM_MODELS } from "@toonstudio/contracts/studio-work-vrm-cut-bundled";
import { parseStudioVrmLicenseMetadata } from "@toonstudio/contracts/studio-vrm-license-metadata";
import { evaluateStudioVrmLicenseAction } from "@toonstudio/contracts/studio-vrm-license-policy";
import { GLB_METADATA_PREFIX_LIMIT, parseAdmittedGlbJsonPrefix } from "../../creator/studio-work-asset-glb";
import { pinnedShareCapture } from "../pinned-share/pinned-share-storage";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function blocked(): never {
  throw new ConflictException({ code: "studio_review_delivery_material_rights",
    message: "원고에 사용한 소재의 사용권과 출처 표기를 확인하고 수정본을 다시 승인해 주세요." });
}
function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function checkVrm(sceneValue: unknown, referencedModels: Set<string>) {
  const model = record(record(sceneValue)?.model);
  if (model?.source === "bundled" && BLOCKED_WORK_VRM_MODELS.some((item) => item.id === model.id)) blocked();
  if (model?.source === "attachment") {
    if (typeof model.hash !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(model.hash)) return blocked();
    referencedModels.add(model.hash.slice(7));
  }
}

function checkBackground(sceneValue: unknown, referencedModels: Set<string>) {
  const scene = record(sceneValue);
  if (!scene || !Array.isArray(scene.nodes)) return blocked();
  const linked = record(record(record(scene.pinnedVersionedCut)?.source)?.linkedVrm);
  if (Array.isArray(linked?.characters)) {
    for (const actor of linked.characters) checkVrm(record(actor)?.vrmScene, referencedModels);
  }
  const attachments = new Map<string, Record<string, unknown>>();
  for (const item of Array.isArray(scene.attachments) ? scene.attachments : []) {
    const attachment = record(item);
    if (typeof attachment?.id === "string") attachments.set(attachment.id, attachment);
  }
  for (const value of scene.nodes) {
    const node = record(value);
    if (node?.kind !== "model") continue;
    const attachment = typeof node.attachmentId === "string" ? attachments.get(node.attachmentId) : undefined;
    const rights = record(attachment?.rights);
    if (!rights || (rights.status !== "owned" && rights.status !== "licensed" && rights.status !== "public-domain")
      || rights.commercialUse !== true || typeof rights.attributionRequired !== "boolean"
      || (rights.attributionRequired && !hasText(rights.attribution))) blocked();
  }
}

type CutReference = { pageId: string; anchorId: string; pinned?: StudioBg3dSixPassWorkVrmCut; castHash?: string };
type MaterialReferences = { models: Set<string>; cuts: CutReference[]; images: Map<string, string> };

function linkedCast(scene: unknown) {
  return record(record(record(scene)?.pinnedVersionedCut)?.source)?.linkedVrm;
}

function checkPage(page: unknown, materials: MaterialReferences) {
  const savedPage = record(page);
  const elements = savedPage?.elements;
  if (!Array.isArray(elements)) return blocked();
  const teamAnchors = new Set<string>();
  if (savedPage?.bg3dLtBundles !== undefined) {
    let state;
    try { state = parseStudioBg3dSixPassBundleState(savedPage.bg3dLtBundles); } catch { return blocked(); }
    const byId = new Map(elements.map(record).map((element) => [element?.id, element]));
    for (const bundle of state.bundles) {
      const manifest = bundle.revisions.find((revision) => revision.renderRevisionId === bundle.activeRevisionId);
      if (manifest?.version !== 2) continue;
      const anchor = byId.get(manifest.anchorElementId);
      const reference = record(anchor?.bg3dLtBundleReference);
      const cast = linkedCast(anchor?.bg3dScene);
      if (manifest.pageId !== savedPage.id || !reference || reference.elementId !== anchor?.id || reference.role !== "main-line"
        || reference.bundleId !== manifest.bundleId || reference.renderRevisionId !== manifest.renderRevisionId
        || reference.manifestHash !== hashStudioBg3dSixPassBundleManifest(manifest) || !cast) return blocked();
      const cut = { pageId: manifest.pageId, anchorId: manifest.workVrmCut.anchorId, pinned: manifest.workVrmCut,
        castHash: hashStudioBg3dSixPassCanonicalJson(cast) };
      teamAnchors.add(manifest.anchorElementId);
      materials.cuts.push(cut);
    }
  }
  for (const item of elements) {
    const element = record(item);
    if (!element) continue;
    const id = typeof element.id === "string" ? element.id : undefined;
    const source = element.type === "image" ? element.src : element.type === "frame" ? element.bg : undefined;
    const uri = typeof source === "string" ? parseStudioWorkAssetSourceUri(source) : null;
    if (element.bundleSourceCredit !== undefined) {
      const credit = parseStudioBundleSourceCredit(element.bundleSourceCredit);
      if (!credit || typeof source !== "string" || !studioBundleCreditMatchesSource(credit, source, id)) return blocked();
      if (uri) {
        const prior = materials.images.get(uri.assetId);
        if (prior && prior !== credit.contentHash) return blocked();
        materials.images.set(uri.assetId, credit.contentHash);
      }
    }
    if (uri?.elementType === "image" && WorkVrmCutAnchorSchema.safeParse(uri.assetId).success) {
      if (typeof savedPage?.id !== "string") return blocked();
      materials.cuts.push({ pageId: savedPage.id, anchorId: uri.assetId });
    }
    if (element.communityAssetCredit !== undefined) {
      const credit = record(element.communityAssetCredit);
      if (!credit || !isCreatorAssetLicenseId(credit.licenseId)) return blocked();
      const license = creatorAssetLicenseOf(credit.licenseId);
      if (!license.commercialUse || credit.commercialUse !== true
        || ((license.attributionRequired || credit.attributionRequired) && !hasText(credit.attributionText) && !hasText(credit.authorName))) blocked();
    }
    if (element.stockImageCredit !== undefined) {
      const stock = record(element.stockImageCredit);
      if (!stock || !hasText(stock.photographerName) || !hasText(stock.photographerProfileUrl) || !hasText(stock.unsplashPhotoPageUrl)) blocked();
    }
    if (element.sourceRights !== undefined && !parsePanelImportRights(element.sourceRights)) blocked();
    if (element.vrmScene !== undefined) checkVrm(element.vrmScene, materials.models);
    if (element.bg3dScene !== undefined) {
      // 팀 6패스의 배우는 봉인 장면과 대조한 뒤 그 컷의 권리 확인 기록으로 판정한다.
      checkBackground(element.bg3dScene, id && teamAnchors.has(id) ? new Set<string>() : materials.models);
    }
  }
}

/** 검수에 고정한 원고의 소재 기록이 전달자의 권리 확인 진술과 충돌하면 출고를 막는다. */
export function assertReviewDeliveryMaterialRights(snapshot: unknown): MaterialReferences {
  const doc = record(snapshot);
  if (!doc || !Array.isArray(doc.pagesList)) return blocked();
  const references: MaterialReferences = { models: new Set(), cuts: [], images: new Map() };
  for (const page of doc.pagesList) checkPage(page, references);
  if (doc.master && doc.pagesList.some((page) => record(page)?.hideMaster !== true)) checkPage(doc.master, references);
  return references;
}

/** 첨부 모델은 이 작품에서 해시가 같은 원본의 임베드 이용조건을 확인한다. */
export function assertReviewDeliveryVrmLicense(bytes: Buffer, sealedRights?: unknown): void {
  let metadata: unknown;
  try { metadata = parseAdmittedGlbJsonPrefix(bytes); } catch { return blocked(); }
  const result = parseStudioVrmLicenseMetadata(metadata);
  if (!result.ok) return blocked();
  const receipt = result.receipt;
  const context = isStudioVrmProjectArchiveUseContextReceipt(sealedRights)
    ? studioVrmProjectArchiveActionContext(sealedRights, receipt) : {};
  const policy = evaluateStudioVrmLicenseAction(receipt, "commercial-publish", {
    ...context, avatarActorBasis: receipt.avatarPermission === "everyone" ? "other" : context.avatarActorBasis,
  });
  // 작품 납품에는 발행 주체가 개인이라는 기록이 없다. 팀 제공 동의만으로 개인 전용 모델을 승인할 수 없다.
  if (!policy.reasons.some(({ code }) => code === "commercial-use-allowed")
    || !policy.reasons.some(({ code }) => code === "avatar-permission-allowed")
    || policy.reasons.some(({ code, effect }) => effect === "restriction" && code.endsWith("-use-prohibited"))) blocked();
}

export async function verifyReviewDeliveryMaterialReferences(client: PoolClient, workId: string, references: MaterialReferences): Promise<void> {
  for (const [assetId, hash] of references.images) {
    const row = await client.query(`SELECT 1 FROM creator_work_asset WHERE "workId"=$1 AND "assetId"=$2 AND "elementType"='image' AND sha256=$3`,
      [workId, assetId, hash.slice(7)]);
    if (!row.rowCount) return blocked();
  }
  const modelUses = new Map<string, unknown[]>(Array.from(references.models, (digest) => [digest, [undefined]]));
  for (const cut of references.cuts) {
    const result = await client.query<{ sceneText: string; sceneSha256: string; compositeSha256: string; rights: unknown }>(
      `SELECT cut."sceneText",cut."sceneSha256",cut."compositeSha256",cut.rights FROM studio_work_vrm_cut cut
       JOIN creator_work_asset image ON image."workId"=cut."workId" AND image."assetId"=cut."anchorId"
        AND image."elementType"='image' AND image.sha256=cut."compositeSha256"
       WHERE cut."workId"=$1 AND cut."pageId"=$2 AND cut."anchorId"=$3`, [workId, cut.pageId, cut.anchorId]);
    const row = result.rows[0];
    if (!row || createHash("sha256").update(row.sceneText).digest("hex") !== row.sceneSha256 ||
      (cut.pinned && (cut.pinned.sceneSha256 !== row.sceneSha256 || cut.pinned.compositeSha256 !== row.compositeSha256))) return blocked();
    let scene: unknown;
    try { scene = JSON.parse(row.sceneText); } catch { return blocked(); }
    const cast = linkedCast(scene);
    if (!cast || (cut.castHash && hashStudioBg3dSixPassCanonicalJson(cast) !== cut.castHash)) return blocked();
    const models = new Set<string>();
    checkBackground(scene, models);
    for (const digest of models) {
      const uses = modelUses.get(digest);
      if (uses) uses.push(row.rights);
      else modelUses.set(digest, [row.rights]);
    }
  }
  for (const [digest, rights] of modelUses) {
    const row = await client.query<{ payload: Buffer }>(
      `SELECT substring(payload from 1 for $3::integer) AS payload FROM creator_work_asset WHERE "workId"=$1 AND "elementType"='vrm' AND sha256=$2 LIMIT 1`,
      [workId, digest, GLB_METADATA_PREFIX_LIMIT]);
    const payload = row.rows[0]?.payload;
    if (!payload) return blocked();
    for (const use of rights) assertReviewDeliveryVrmLicense(payload, use);
  }
}

export async function captureWithDeliveryRights(client: PoolClient, subject: Parameters<typeof pinnedShareCapture>[1]) {
  let references: MaterialReferences | undefined;
  const capture = await pinnedShareCapture(client, subject, (snapshot) => { references = assertReviewDeliveryMaterialRights(snapshot); });
  if (!references) return blocked();
  await verifyReviewDeliveryMaterialReferences(client, subject.workId, references);
  return capture;
}
