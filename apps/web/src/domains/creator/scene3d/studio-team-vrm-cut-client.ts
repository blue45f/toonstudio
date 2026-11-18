import { isWorkVrmCutActorScene } from "@toonstudio/contracts/studio-work-vrm-cut-scene-shape";
import { WorkVrmCutAnchorSchema, WorkVrmCutMetadataSchema, WORK_VRM_CUT_BODY_BYTES, WORK_VRM_CUT_SCENE_BYTES,
  type WorkVrmCutReceipt, type WorkVrmCutAttachment } from "@toonstudio/contracts/studio-work-vrm-cut";
import { workVrmCutBundledDigest } from "@toonstudio/contracts/studio-work-vrm-cut-bundled";
import { StudioWorkAssetManifestSchema, serializeStudioWorkAssetDescriptorCanonical, type StudioWorkAssetDescriptor } from "@toonstudio/contracts/studio-work-asset-contract";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { api, apiPath, isHttpError, toApiError } from "@/platform/api";
import { parseStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { appendStudioScopedAssetContext } from "../studio-collab/studio-scoped-asset-context";
import { studioTeamCutVrmDocumentScope } from "../studio-shared-3d-scene-runtime";
import { downloadStudioWorkAsset, StudioWorkAssetRequestError } from "../studio-work-asset-client";
import { readBoundedStudioWorkAssetLocalImage } from "../studio-work-asset-admission";
import { hashVrmBlob, selectableSampleVrmUrl, MAX_VRM_UPLOAD_BYTES } from "../vrm/vrm-library";
import { collectTeamCutUploadFiles, teamCutAssetPlan, verifyTeamCutFiles, type StudioTeamVrmCutResources, type TeamCutConsent } from "./studio-team-vrm-cut-assets";
import type { StudioScene3dCutLinkedVrm } from "./studio-scene3d-shot-versions";

export interface TeamCutScope { readonly workId: string; readonly pageId: string; readonly anchorId: string }
function path(scope: TeamCutScope) {
  WorkVrmCutAnchorSchema.parse(scope.anchorId);
  return apiPath(`/creator/works/${encodeURIComponent(scope.workId)}/vrm-cuts/${encodeURIComponent(scope.anchorId)}`);
}
function verifiedCast(scene: StudioBg3dSceneDocument, scope: TeamCutScope) {
  const source = scene.pinnedVersionedCut?.source;
  const cast = source?.linkedVrm;
  if (!cast || cast.documentScope !== studioTeamCutVrmDocumentScope(scope.workId, scope.pageId) || scene.output.sixPassLt)
    throw new Error("현재 작품·페이지에서 열 수 있는 고정 VRM 컬러 컷이 아닙니다.");
  const plan = teamCutAssetPlan(cast);
  if (!cast.characters.every(actor => isWorkVrmCutActorScene(actor.vrmScene)))
    throw new Error("캐릭터의 포즈·조명·채색 정보를 확인할 수 없습니다. 원고에서 해당 캐릭터를 다시 열어 주세요.");
  if (source.scene.assets.length || [scene, source.legacyBg3d].some(background =>
    background && (background.attachments.length || background.nodes.some(node => node.kind !== "primitive"))))
    throw new Error("팀 VRM 컷에는 기본 도형 배경을 사용할 수 있습니다. 가져온 배경 모델은 개인 원고에 보관해 주세요.");
  return { cast, plan };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function digest(blob: Blob) { return (await hashVrmBlob(blob)).slice(7); }

async function bundledFiles(cast: StudioScene3dCutLinkedVrm, signal: AbortSignal) {
  const files = new Map<string, Blob>(), ids = new Set(cast.characters.flatMap(({ vrmScene }) => vrmScene.model.source === "bundled" ? [vrmScene.model.id] : []));
  const metadata = [];
  for (const id of [...ids].sort()) {
    const url = selectableSampleVrmUrl(id), expected = workVrmCutBundledDigest(id);
    if (!url || !expected) throw new Error("작품 저장을 지원하지 않는 동봉 VRM입니다.");
    const response = await fetch(url, { signal, redirect: "error", credentials: "same-origin" });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_VRM_UPLOAD_BYTES) throw new Error("동봉 VRM 원본을 불러올 수 없습니다.");
    const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_VRM_UPLOAD_BYTES) { await reader.cancel(); throw new Error("동봉 VRM 원본의 크기가 한도를 넘었습니다."); }
        chunks.push(Uint8Array.from(value).buffer);
      }
    } finally { reader.releaseLock(); }
    const blob = new Blob(chunks, { type: "model/gltf-binary" });
    if (await digest(blob) !== expected) throw new Error("동봉 모델이 컷을 저장한 버전과 다릅니다. 원래 버전을 복구한 뒤 다시 열어 주세요.");
    files.set(id, blob); metadata.push({ id, sha256: expected });
  }
  return { files, metadata };
}

async function verifyReceipt(value: unknown, scope: TeamCutScope) {
  if (!record(value) || value.version !== 1 || value.workId !== scope.workId || value.pageId !== scope.pageId || value.anchorId !== scope.anchorId
    || typeof value.sceneSha256 !== "string" || !record(value.scene) || !Array.isArray(value.attachments) || !Array.isArray(value.bundledModels)) throw new Error("팀 컷 영수증이 요청한 작품·페이지·레이어와 다릅니다.");
  const raw = JSON.stringify(value.scene), blob = new Blob([raw]);
  if (blob.size > WORK_VRM_CUT_SCENE_BYTES || await digest(blob) !== value.sceneSha256) throw new Error("팀 컷 원본 문서의 해시가 영수증과 다릅니다.");
  const scene = parseStudioBg3dSceneDocument(raw);
  if (!scene) throw new Error("팀 컷 원본 문서를 읽을 수 없습니다.");
  const { cast, plan } = verifiedCast(scene, scope);
  const manifest = StudioWorkAssetManifestSchema.parse(value.manifest);
  if (manifest.assetId !== scope.anchorId || manifest.elementType !== "image" || manifest.sha256 !== value.compositeSha256 || value.attachments.length !== plan.size) throw new Error("팀 컷의 합성 이미지 또는 첨부 목록을 확인할 수 없습니다.");
  const attachments = new Map<string, WorkVrmCutAttachment>();
  for (const entry of value.attachments) {
    if (!record(entry) || typeof entry.sha256 !== "string" || typeof entry.assetId !== "string") throw new Error("팀 컷 첨부 기록이 올바르지 않습니다.");
    const hash = `sha256:${entry.sha256}`, planned = plan.get(hash);
    if (!planned || typeof entry.byteSize !== "number" || attachments.has(hash) || entry.elementType !== planned.kind || entry.assetId !== `vrmcut-asset-${planned.kind}-${entry.sha256}` || entry.byteSize !== (planned.kind === "vrm" ? planned.model.byteSize : planned.paint.byteSize)) throw new Error("원본 모델·채색과 팀 파일 목록이 일치하지 않습니다.");
    attachments.set(hash, { sha256: entry.sha256, assetId: entry.assetId, elementType: planned.kind, byteSize: entry.byteSize });
  }
  const expectedBundled = [...new Set(cast.characters.flatMap(c => c.vrmScene.model.source === "bundled" ? [c.vrmScene.model.id] : []))].sort();
  const bundled = new Map<string, string>();
  for (const entry of value.bundledModels) {
    if (!record(entry) || typeof entry.id !== "string" || typeof entry.sha256 !== "string" || bundled.has(entry.id) || workVrmCutBundledDigest(entry.id) !== entry.sha256) throw new Error("동봉 모델의 배포 버전이 바뀌었습니다. 원본을 확인하기 전에는 팀 컷을 편집할 수 없습니다.");
    bundled.set(entry.id, entry.sha256);
  }
  if (JSON.stringify([...bundled.keys()].sort()) !== JSON.stringify(expectedBundled)) throw new Error("팀 컷의 동봉 모델 목록이 다릅니다.");
  return { scene, cast, manifest, attachments, sceneSha256: value.sceneSha256 };
}

export class TeamVrmCutAccessError extends Error {}
async function teamCutError(cause: unknown, fallback: string) {
  const status = isHttpError(cause) ? cause.response.status : cause instanceof StudioWorkAssetRequestError ? cause.status : undefined;
  if (status === 401 || status === 403 || status === 404) return new TeamVrmCutAccessError("작품의 원본 컷을 열 수 없습니다. 로그인과 팀 참여 상태를 확인하고 원고에서 컷을 다시 선택해 주세요.");
  if (status === 409) return new Error("이 레이어에 이미 다른 컷이 저장되어 있습니다. 원고에서 현재 컷을 확인한 뒤 새 레이어에 저장해 주세요.");
  if (isHttpError(cause) && (status === 400 || status === 422)) {
    const body: unknown = await cause.response.clone().json().catch(() => null);
    if (record(body) && typeof body.message === "string" && body.message.length <= 400) return new Error(body.message);
  }
  return toApiError(cause, fallback);
}

export async function readTeamVrmCutReceipt(scope: TeamCutScope, signal: AbortSignal) {
  try {
    const res = await api.raw.get(path(scope), { signal, cache: "no-store" });
    return await verifyReceipt(await res.json<unknown>(), scope);
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw await teamCutError(cause, "팀 컷을 읽을 권한과 네트워크 연결을 확인해 주세요.");
  }
}

export async function readTeamVrmCut(scope: TeamCutScope, signal: AbortSignal) {
  try {
    const data = await readTeamVrmCutReceipt(scope, signal);
    const bundled = await bundledFiles(data.cast, signal);
    const checked = await verifyTeamCutFiles(data.cast, async hash => {
      const reference = data.attachments.get(hash);
      if (!reference) throw new Error("팀 컷 원본 파일이 없습니다.");
      const result = await downloadStudioWorkAsset(scope.workId, reference, signal);
      if (result.manifest.sha256 !== reference.sha256) throw new Error("다른 팀 파일이 반환됐습니다.");
      return result.blob;
    }, signal);
    signal.throwIfAborted();
    return { scene: data.scene, sceneSha256: data.sceneSha256, compositeSha256: data.manifest.sha256, resources: { ...checked.resources, bundled: bundled.files } };
  } catch (cause) { if (signal.aborted || cause instanceof TeamVrmCutAccessError) throw cause; throw await teamCutError(cause, "팀 컷을 읽을 권한과 네트워크 연결을 확인해 주세요."); }
}

export async function writeTeamVrmCut(scope: TeamCutScope, input: {
  scene: StudioBg3dSceneDocument; composite: string; descriptor: StudioWorkAssetDescriptor; consent: TeamCutConsent;
  resources?: StudioTeamVrmCutResources; current(): boolean; writeContext?: StudioScopedWriteContext;
}, signal: AbortSignal) {
  const { cast } = verifiedCast(input.scene, scope), raw = serializeStudioBg3dSceneDocument(input.scene);
  if (!raw) throw new Error("팀 컷 원본을 직렬화할 수 없습니다.");
  const scene = new Blob([raw], { type: "application/json" });
  const composite = await readBoundedStudioWorkAssetLocalImage(input.composite, signal);
  const { rights, resources } = await collectTeamCutUploadFiles(cast, input.consent, signal, input.resources);
  if (scene.size > WORK_VRM_CUT_SCENE_BYTES || [...resources.blobs.values()].reduce((sum, b) => sum + b.size, scene.size + composite.size) > WORK_VRM_CUT_BODY_BYTES)
    throw new Error("팀 컷 저장 한도(원본 문서 2MiB, 전체 32MiB)를 넘었습니다.");
  const bundled = await bundledFiles(cast, signal);
  const metadata = WorkVrmCutMetadataSchema.parse({ version: 1, pageId: scope.pageId, descriptor: input.descriptor,
    sceneSha256: await digest(scene), compositeSha256: await digest(composite), bundledModels: bundled.metadata, rights });
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata)); form.set("scene", scene, "scene.json"); form.set("composite", composite, "composite.png");
  for (const [hash, blob] of resources.blobs) form.append("attachments", blob, hash.slice(7));
  appendStudioScopedAssetContext(form, input.writeContext);
  if (!input.current()) throw new Error("작품·페이지 또는 편집 권한이 바뀌어 팀 컷 저장을 중단했습니다.");
  try {
    const res = await api.raw.put(path(scope), { body: form, signal, retry: 0 });
    const data = await verifyReceipt(await res.json<WorkVrmCutReceipt>(), scope);
    if (data.sceneSha256 !== metadata.sceneSha256 || data.manifest.sha256 !== metadata.compositeSha256
      || serializeStudioWorkAssetDescriptorCanonical(data.manifest.descriptor) !== serializeStudioWorkAssetDescriptorCanonical(input.descriptor)) throw new Error("팀 컷 서버 영수증과 요청한 원본이 다릅니다.");
    return data.manifest;
  } catch (cause) { if (signal.aborted) throw cause; throw await teamCutError(cause, "팀 컷을 저장하지 못했습니다. 권한과 네트워크 연결을 확인한 뒤 다시 시도하세요."); }
}
