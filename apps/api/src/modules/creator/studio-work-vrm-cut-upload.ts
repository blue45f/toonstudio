import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, PayloadTooLargeException } from "@nestjs/common";
import { inspectStudioPngStructure } from "@toonstudio/contracts/studio-png-structure";
import { parseStudioVrmLicenseMetadata } from "@toonstudio/contracts/studio-vrm-license-metadata";
import { evaluateStudioVrmLicenseAction } from "@toonstudio/contracts/studio-vrm-license-policy";
import { studioVrmProjectArchiveActionContext } from "@toonstudio/contracts/studio-vrm-archive-rights";
import { parseStudioWorkAssetDescriptor, type StudioWorkAssetDescriptor } from "@toonstudio/contracts/studio-work-asset-contract";
import { WORK_VRM_CUT_BODY_BYTES, WORK_VRM_CUT_SCENE_BYTES, WorkVrmCutAnchorSchema, WorkVrmCutMetadataSchema,
  type WorkVrmCutAttachment } from "@toonstudio/contracts/studio-work-vrm-cut";
import { assertStudioBg3dBundlePngPixels } from "./studio-bg3d-bundle-png";
import { parseGlbJson } from "./studio-work-asset-glb";
import type { admitStudioWorkAssetPayload, AdmittedStudioWorkAssetPayload, StudioWorkAssetUploadFile } from "./studio-work-asset.service";
import type { StudioWorkVrmCutSeal } from "./studio-work-vrm-cut.store";
import { inspectWorkVrmCutScene } from "./studio-work-vrm-cut-scene";

type Part = StudioWorkAssetUploadFile & { originalname: string };
export interface WorkVrmCutFiles { scene?: Part[]; composite?: Part[]; attachments?: Part[] }
type Write = AdmittedStudioWorkAssetPayload & { assetId: string; elementType: "vrm" | "image"; descriptor: StudioWorkAssetDescriptor };
type Admit = typeof admitStudioWorkAssetPayload;

function exactFile(file: Part | undefined): Part {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size <= 0 || file.buffer.length !== file.size) {
    throw new BadRequestException("비어 있거나 끝까지 받지 못한 컷 파일입니다.");
  }
  return file;
}

function admitFile(admit: Admit, file: Part, type: Write["elementType"]): AdmittedStudioWorkAssetPayload {
  try {
    const admitted = admit(type, file.mimetype, file.buffer);
    if (type === "image") {
      if (admitted.mimeType !== "image/png" || !admitted.intrinsicImage) throw new Error("컷 이미지는 PNG로 저장해 주세요.");
      inspectStudioPngStructure(file.buffer, admitted.intrinsicImage.width, admitted.intrinsicImage.height);
      assertStudioBg3dBundlePngPixels(file.buffer);
    }
    return admitted;
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : "컷 파일의 형식이 올바르지 않습니다.");
  }
}

export function prepareWorkVrmCutUpload(input: {
  workId: string; anchorId: string; metadataJson: string; files?: WorkVrmCutFiles; admit: Admit;
}): { writes: Write[]; seal: StudioWorkVrmCutSeal } {
  const { workId, anchorId, files, admit } = input;
  if (!WorkVrmCutAnchorSchema.safeParse(anchorId).success) throw new BadRequestException("컷 레이어 ID가 올바르지 않습니다.");
  let raw: unknown;
  try { raw = JSON.parse(input.metadataJson); } catch { throw new BadRequestException("컷 저장 정보가 올바르지 않습니다."); }
  const result = WorkVrmCutMetadataSchema.safeParse(raw);
  if (!result.success) throw new BadRequestException("컷 저장 정보나 이용 조건 확인값이 올바르지 않습니다.");
  const metadata = result.data;
  let descriptor: StudioWorkAssetDescriptor;
  try { descriptor = parseStudioWorkAssetDescriptor(metadata.descriptor, { assetId: anchorId, elementType: "image" }); }
  catch { throw new BadRequestException("컷 이미지의 레이어 정보가 올바르지 않습니다."); }
  if (files?.scene?.length !== 1 || files.composite?.length !== 1) throw new BadRequestException("컷 장면과 합성 이미지가 각각 하나씩 필요합니다.");
  const sceneFile = exactFile(files.scene[0]), compositeFile = exactFile(files.composite[0]);
  const extras = (files.attachments ?? []).map(exactFile);
  if (sceneFile.size > WORK_VRM_CUT_SCENE_BYTES || sceneFile.size + compositeFile.size +
    extras.reduce((total, f) => total + f.size, 0) > WORK_VRM_CUT_BODY_BYTES) throw new PayloadTooLargeException("컷 저장 용량을 초과했습니다.");
  if (createHash("sha256").update(sceneFile.buffer).digest("hex") !== metadata.sceneSha256) throw new BadRequestException("컷 장면 파일이 바뀌었습니다.");
  let sceneText: string, scene: unknown;
  try {
    sceneText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sceneFile.buffer);
    scene = JSON.parse(sceneText);
  } catch { throw new BadRequestException("컷 장면 파일을 읽을 수 없습니다."); }
  // GET의 JSON 본문을 다시 직렬화해도 같은 SHA-256로 확인할 수 있어야 한다.
  if (JSON.stringify(scene) !== sceneText) throw new BadRequestException("컷 장면은 편집기가 내보낸 JSON 형식으로 저장해 주세요.");
  const required = inspectWorkVrmCutScene(scene, workId, metadata);
  const byHash = new Map(extras.map(file => [file.originalname, file]));
  if (byHash.size !== extras.length || extras.length !== required.length) throw new BadRequestException("컷 원본 파일이 중복되었거나 빠졌습니다.");
  const composite = admitFile(admit, compositeFile, "image");
  if (composite.sha256 !== metadata.compositeSha256) throw new BadRequestException("합성 이미지 해시가 다릅니다.");
  const writes: Write[] = [{ ...composite, descriptor, assetId: anchorId, elementType: "image" }];
  const attachments: WorkVrmCutAttachment[] = [];
  for (const { sha256, byteSize, elementType, assetId, width, height, painted } of required) {
    const file = byHash.get(sha256);
    if (!file || file.size !== byteSize) throw new BadRequestException("원본 파일이 없거나 크기가 다릅니다.");
    const payload = admitFile(admit, file, elementType);
    if (payload.sha256 !== sha256 || payload.intrinsicImage?.width !== width || payload.intrinsicImage?.height !== height) {
      throw new BadRequestException("컷에 고정한 원본과 업로드한 파일이 다릅니다.");
    }
    if (elementType === "vrm") {
      const license = parseStudioVrmLicenseMetadata(parseGlbJson(file.buffer));
      if (!license.ok || !metadata.rights) throw new ForbiddenException("업로드 모델의 원본 이용 조건과 팀 제공 동의를 확인해 주세요.");
      const context = studioVrmProjectArchiveActionContext(metadata.rights, license.receipt);
      if (!evaluateStudioVrmLicenseAction(license.receipt, "project-archive-redistribution",
        { ...context, containsModifiedModel: Boolean(painted) }).authorized) throw new ForbiddenException("모델의 이용 조건으로 이 컷을 팀에 제공할 수 없습니다.");
    }
    const asset = { sha256, byteSize, elementType, assetId };
    attachments.push(asset);
    writes.push({ ...payload, assetId, elementType, descriptor: { version: 1,
      element: { id: assetId, type: elementType, x: 0, y: 0, rotation: 0, width: width ?? 1, height: height ?? 1 } } });
  }
  return { writes, seal: { workId, anchorId, pageId: metadata.pageId, sceneText, sceneSha256: metadata.sceneSha256,
    compositeSha256: composite.sha256, bundledModels: [...metadata.bundledModels].sort((a, b) => a.id.localeCompare(b.id)),
    attachments, rights: metadata.rights ?? null } };
}
