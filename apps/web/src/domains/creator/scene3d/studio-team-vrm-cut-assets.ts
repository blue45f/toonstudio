import { WORK_VRM_CUT_MAX_ATTACHMENTS } from "@toonstudio/contracts/studio-work-vrm-cut";
import { STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE } from "@toonstudio/contracts/studio-work-asset-contract";

import { inspectVrmGlbBytes, getStoredVrmModelByHash, hashVrmBlob, selectableSampleVrmUrl } from "../vrm/vrm-library";
import { createStudioVrmTexturePaintArtifact, type StudioVrmTexturePaintArtifact } from "../vrm/studio-vrm-texture-paint-artifact";
import { getStudioVrmTexturePaintLibraryArtifact } from "../vrm/studio-vrm-texture-paint-library";
import { createStudioVrmProjectArchiveUseContextReceipt, evaluateStudioVrmLicenseAuthority, inspectStudioVrmLicenseAuthority,
  prepareStudioVrmProjectArchiveAttestation, studioVrmProjectArchiveActionContext, type StudioVrmProjectArchiveAttestationPlan,
  type StudioVrmProjectArchiveUseContextInput, type StudioVrmProjectArchiveUseContextReceipt } from "../vrm/studio-vrm-license-product-gate";
import type { StudioVrmAttachmentModel, StudioVrmSurfacePaintTexture } from "../vrm/studio-vrm-scene-document";
import type { StudioScene3dCutLinkedVrm } from "./studio-scene3d-shot-versions";

export type TeamCutAsset = { kind: "vrm"; model: StudioVrmAttachmentModel } | { kind: "image"; paint: StudioVrmSurfacePaintTexture };
export type TeamCutConsent = (plan: Extract<StudioVrmProjectArchiveAttestationPlan, { ok: true }>) => Promise<StudioVrmProjectArchiveUseContextInput | null>;
export interface TeamCutCharacterRuntime { readonly teamCutResources?: StudioTeamVrmCutResources }

export function teamCutAssetPlan(cast: StudioScene3dCutLinkedVrm) {
  const plan = new Map<string, TeamCutAsset>();
  function add(hash: string, size: number, asset: TeamCutAsset) {
    if (size > STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE[asset.kind]) throw new Error("팀 컷 파일 한도를 넘었습니다. VRM은 12MiB, 채색 PNG는 8MiB까지 저장할 수 있습니다.");
    const existing = plan.get(hash);
    if (existing) {
      if (existing.kind !== asset.kind || (existing.kind === "vrm" ? existing.model.byteSize : existing.paint.byteSize) !== size
        || (existing.kind === "image" && asset.kind === "image" && (existing.paint.width !== asset.paint.width || existing.paint.height !== asset.paint.height))) {
        throw new Error("같은 해시를 가리키는 VRM 파일의 크기 또는 형식이 다릅니다.");
      }
      return;
    }
    plan.set(hash, asset);
  }
  for (const { vrmScene } of cast.characters) {
    const { model } = vrmScene;
    if (model.source === "bundled") {
      if (!selectableSampleVrmUrl(model.id)) throw new Error("팀 컷에서 열 수 없는 동봉 VRM입니다.");
    } else add(model.hash, model.byteSize, { kind: "vrm", model });
    for (const paint of vrmScene.surfacePaint.textures) {
      if (paint.textureSlot !== "baseColor") throw new Error("팀 컷은 기본색 채색만 저장할 수 있습니다. 다른 재질 채널이 있는 원본은 로컬 원고에 보관해 주세요.");
      add(paint.hash, paint.byteSize, { kind: "image", paint });
    }
  }
  if (plan.size > WORK_VRM_CUT_MAX_ATTACHMENTS) throw new Error("팀 컷 하나에는 서로 다른 모델·채색 파일을 12개까지 담을 수 있습니다.");
  return plan;
}

/** 원격으로 받은 파일은 편집 세션에서만 살아 있다. 개인 모델 목록과 기기 채색 원장에 복사하지 않는다. */
export interface StudioTeamVrmCutResources {
  readonly blobs: ReadonlyMap<string, Blob>;
  readonly paints: ReadonlyMap<string, StudioVrmTexturePaintArtifact>;
  readonly bundled?: ReadonlyMap<string, Blob>;
}

export async function verifyTeamCutFiles(cast: StudioScene3dCutLinkedVrm,
  read: (hash: string, entry: TeamCutAsset) => Promise<Blob>, signal: AbortSignal) {
  const blobs = new Map<string, Blob>(), paints = new Map<string, StudioVrmTexturePaintArtifact>();
  const models = [];
  for (const [hash, entry] of teamCutAssetPlan(cast)) {
    signal.throwIfAborted();
    const blob = await read(hash, entry);
    if (blob.size !== (entry.kind === "vrm" ? entry.model.byteSize : entry.paint.byteSize)) throw new Error("VRM 컷 원본 파일의 크기가 저장 기록과 다릅니다.");
    if (entry.kind === "vrm") {
      if (await hashVrmBlob(blob) !== hash) throw new Error("VRM 컷의 모델 해시를 확인하지 못했습니다.");
      const inspected = inspectVrmGlbBytes(await blob.arrayBuffer());
      models.push({ authority: inspectStudioVrmLicenseAuthority(inspected.json), painted: cast.characters.some(({ vrmScene }) =>
        vrmScene.model.source === "attachment" && vrmScene.model.hash === hash && vrmScene.surfacePaint.textures.length > 0) });
    } else {
      const artifact = await createStudioVrmTexturePaintArtifact({ source: blob, bindingKey: entry.paint.bindingKey,
        expectedWidth: entry.paint.width, expectedHeight: entry.paint.height }, { signal });
      if (artifact.metadata.contentHash !== hash) throw new Error("VRM 컷의 채색 PNG 해시를 확인하지 못했습니다.");
      paints.set(hash, artifact);
    }
    blobs.set(hash, blob);
  }
  signal.throwIfAborted();
  return { resources: { blobs, paints } satisfies StudioTeamVrmCutResources, models };
}

export async function collectTeamCutUploadFiles(cast: StudioScene3dCutLinkedVrm, consent: TeamCutConsent,
  signal: AbortSignal, remote?: StudioTeamVrmCutResources) {
  const checked = await verifyTeamCutFiles(cast, async (hash, entry) => {
    const cached = remote?.blobs.get(hash);
    if (cached) return cached;
    if (entry.kind === "image") return (await getStudioVrmTexturePaintLibraryArtifact(hash, { signal })).archiveEntry.data;
    const local = await getStoredVrmModelByHash(hash);
    if (!local) throw new Error("고정 컷의 VRM 원본을 기기에서 찾을 수 없습니다. 원본 아카이브를 열어 주세요.");
    return local.blob;
  }, signal);
  let rights: StudioVrmProjectArchiveUseContextReceipt | undefined;
  if (checked.models.length) {
    const plan = prepareStudioVrmProjectArchiveAttestation(checked.models.map(model => model.authority));
    if (!plan.ok) throw new Error(plan.message);
    const answer = await consent(plan);
    signal.throwIfAborted();
    if (!answer) throw new Error("VRM 팀 공유를 취소했습니다.");
    if (!plan.permittedActorBases.some(basis => basis === answer.avatarPermissionBasis)
      || JSON.stringify(plan.exactAttributionTexts) !== JSON.stringify(answer.confirmedAttributionTexts)) throw new Error("확인한 VRM 크레딧과 원본 파일의 고지가 다릅니다.");
    rights = createStudioVrmProjectArchiveUseContextReceipt(answer);
    for (const { authority: model, painted } of checked.models) {
      if (model.status !== "verified") throw new Error("VRM의 재배포 권리를 확인할 수 없습니다.");
      const allowed = evaluateStudioVrmLicenseAuthority(model, "project-archive-redistribution", { ...studioVrmProjectArchiveActionContext(rights, model.receipt), containsModifiedModel: painted });
      if (!allowed.authorized) throw new Error(allowed.reasons.map(reason => reason.message).join(" "));
    }
  }
  return { resources: checked.resources, rights };
}
