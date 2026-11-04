import { z } from "zod";
import { rememberStudioBg3dSixPassWorkReceipt } from "../../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-work-receipts";
import { getStudioBg3dSixPassBundleArtifacts, hashStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleReceipt,
  serializeStudioBg3dSixPassBundleManifest, verifyStudioBg3dSixPassArtifactBytes,
  verifyStudioBg3dSixPassBundleReceipt, verifyStudioBg3dSixPassBundleSceneBytes,
  STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES, STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES,
  STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, parseStudioBg3dSixPassBundleState,
  type StudioBg3dSixPassBundleManifest, type StudioBg3dSixPassBundleState,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { api, apiPath } from "@/platform/api";
import { appendStudioScopedAssetContext } from "../../studio-collab/studio-scoped-asset-context";
import { readBoundedStudioAssetResponse } from "../../studio-bounded-asset-response";
import { STUDIO_BG3D_SIX_PASS_MANIFEST_MIME, studioBg3dSixPassRetainedTip, type StudioBg3dSixPassPreparedBundle } from "./studio-bg3d-six-pass-bundle-transaction";
import type { StudioCrdtBg3dBundleRevisionReference } from "../../live/studio-crdt-bg3d-bundle-refs";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import type { StudioLinked3dPassCasAuthority } from "../../studio-linked-3d-pass-transaction";
import type { El } from "../../studio-element-model";
import { parseStudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import { decodeStudioBg3dSixPassPng } from "./studio-bg3d-six-pass-png-decode";

const ROLES = ["scene", "color", "tone", "shadow", "depth", "texture-line", "main-line"] as const;
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const responseSchema = z.object({ version: z.literal(1), workId: z.string(), state: z.enum(["prepared", "sealed"]),
  manifest: z.unknown(), manifestHash: hash, sealedAt: z.string().nullable(), receipt: z.unknown(),
  uploadedRoles: z.array(z.enum(ROLES)).max(7) }).strict();
const downloadSchema = z.object({ manifestHash: hash, role: z.enum(ROLES), contentHash: hash,
  signedRead: z.object({ url: z.url(), expiresAtEpochMs: z.number().int().positive() }).strict() }).strict();
export const StudioBg3dSixPassRemoteCapabilitiesSchema = z.object({ enabled: z.boolean(), readerCapability: z.literal("bg3d-sixpass-bundle.v1"),
  maximumPngBytes: z.literal(64 * 1024 * 1024), maximumPngTotalBytes: z.literal(384 * 1024 * 1024), maximumSceneBytes: z.literal(320 * 1024),
  fileMaxBytes: z.number().int().nonnegative(), remainingStorageBytes: z.number().int().nonnegative(), remainingDailyUploadBytes: z.number().int().nonnegative() }).strict();
function path(workId: string, manifest: Pick<StudioBg3dSixPassBundleManifest, "bundleId" | "renderRevisionId">): string {
  return `/creator/works/${encodeURIComponent(workId)}/bg3d-bundles/${encodeURIComponent(manifest.bundleId)}/revisions/${encodeURIComponent(manifest.renderRevisionId)}`;
}
function exactResponse(value: unknown, workId: string, manifest: StudioBg3dSixPassBundleManifest) {
  const response = responseSchema.parse(value), parsed = parseStudioBg3dSixPassBundleManifest(response.manifest);
  if (response.workId !== workId || hashStudioBg3dSixPassBundleManifest(parsed) !== hashStudioBg3dSixPassBundleManifest(manifest)
    || response.manifestHash !== hashStudioBg3dSixPassBundleManifest(manifest)
    || new Set(response.uploadedRoles).size !== response.uploadedRoles.length) throw new Error("6패스 저장 응답이 요청한 작품·원본과 다릅니다.");
  if (response.state === "sealed") {
    verifyStudioBg3dSixPassBundleReceipt(response.receipt, manifest, workId);
    if (response.uploadedRoles.length !== 7 || !response.sealedAt) throw new Error("봉인한 6패스의 일곱 원본 영수증이 없습니다.");
  } else if (response.receipt !== null || response.sealedAt !== null) throw new Error("준비 중인 6패스에 봉인 영수증이 있습니다.");
  return response;
}
export async function getStudioBg3dSixPassRemoteCapabilities(workId: string) {
  const response = await api.raw.get(apiPath(`/creator/works/${encodeURIComponent(workId)}/bg3d-bundles/capabilities`));
  return StudioBg3dSixPassRemoteCapabilitiesSchema.parse(await response.json<unknown>());
}

/** 업로드 응답을 잃으면 자동 재전송하지 않는다. 호출자가 같은 revision을 명시적으로 재개한다. */
export async function sealStudioBg3dSixPassRemoteBundle(input: { readonly workId: string; readonly prepared: Pick<StudioBg3dSixPassPreparedBundle, "manifest">;
  readonly authority: StudioOpfsAssetStore; readonly writeContext?: StudioScopedWriteContext }) {
  const manifest = parseStudioBg3dSixPassBundleManifest(input.prepared.manifest), base = path(input.workId, manifest);
  const response = await api.raw.put(apiPath(base), { json: { manifest, ...(input.writeContext ? { writeContext: input.writeContext } : {}) }, retry: 0 });
  let record = exactResponse(await response.json<unknown>(), input.workId, manifest);
  if (record.state === "sealed") { rememberStudioBg3dSixPassWorkReceipt(input.workId, record.manifestHash); return parseStudioBg3dSixPassBundleReceipt(record.receipt); }
  for (const { role, artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
    const bytes = await input.authority.get(artifact.contentHash, { verify: true });
    if (!bytes) throw new Error(`6패스 ${role}의 영속 원본이 없습니다.`);
    if (role === "scene") verifyStudioBg3dSixPassBundleSceneBytes(manifest, bytes);
    else verifyStudioBg3dSixPassArtifactBytes(artifact, bytes);
    if (record.uploadedRoles.includes(role)) continue;
    const form = new FormData(); appendStudioScopedAssetContext(form, input.writeContext);
    form.append("file", new Blob([Uint8Array.from(bytes)], { type: artifact.mimeType }), `${role}.${role === "scene" ? "json" : "png"}`);
    const uploaded = await api.raw.put(apiPath(`${base}/artifacts/${role}`), { body: form, retry: 0 });
    record = exactResponse(await uploaded.json<unknown>(), input.workId, manifest);
    if (!record.uploadedRoles.includes(role)) throw new Error("6패스 업로드 응답에 해당 원본이 없습니다.");
  }
  const sealed = await api.raw.put(apiPath(`${base}/seal`), { json: input.writeContext ? { writeContext: input.writeContext } : {}, retry: 0 });
  record = exactResponse(await sealed.json<unknown>(), input.workId, manifest);
  if (record.state !== "sealed") throw new Error("6패스 원본을 모두 봉인하지 못했습니다.");
  rememberStudioBg3dSixPassWorkReceipt(input.workId, record.manifestHash);
  return parseStudioBg3dSixPassBundleReceipt(record.receipt);
}

/** 권한 확인된 짧은 서명 주소를 한 역할씩 읽고 검증하며, 완성 manifest를 마지막에 노출한다. */
export async function hydrateStudioBg3dSixPassRemoteBundle(input: { readonly workId: string;
  readonly reference: StudioCrdtBg3dBundleRevisionReference; readonly authority: StudioOpfsAssetStore }): Promise<void> {
  const base = path(input.workId, input.reference), response = await api.raw.get(apiPath(base));
  const raw = responseSchema.parse(await response.json<unknown>()), manifest = parseStudioBg3dSixPassBundleManifest(raw.manifest);
  const record = exactResponse(raw, input.workId, manifest), ref = input.reference;
  if (record.state !== "sealed" || manifest.pageId !== ref.pageId || manifest.bundleId !== ref.bundleId
    || manifest.renderRevisionId !== ref.renderRevisionId || manifest.parentRevisionId !== ref.parentRevisionId
    || record.manifestHash !== ref.manifestHash) throw new Error("6패스 원격 봉인이 문서 참조와 다릅니다.");
  for (const { role, artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
    let bytes = await input.authority.get(artifact.contentHash, { verify: true });
    if (!bytes) {
      const signedResponse = await api.raw.get(apiPath(`${base}/artifacts/${role}`));
      const signed = downloadSchema.parse(await signedResponse.json<unknown>()), url = new URL(signed.signedRead.url);
      const remaining = signed.signedRead.expiresAtEpochMs - Date.now();
      if (signed.manifestHash !== ref.manifestHash || signed.role !== role || signed.contentHash !== artifact.contentHash
        || url.protocol !== "https:" || url.username || url.password || remaining <= 0 || remaining > 120_000) throw new Error("6패스 원본 읽기 영수증이 올바르지 않습니다.");
      const content = await fetch(url, { credentials: "omit", cache: "no-store", redirect: "error" });
      if (!content.ok || content.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== artifact.mimeType) throw new Error("6패스 비공개 원본을 읽지 못했습니다.");
      bytes = await readBoundedStudioAssetResponse(content, artifact.byteSize, role === "scene" ? STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES : STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES);
    }
    if (role === "scene") verifyStudioBg3dSixPassBundleSceneBytes(manifest, bytes);
    else verifyStudioBg3dSixPassArtifactBytes(artifact, bytes);
    const stored = await input.authority.put(bytes, { mime: artifact.mimeType });
    if (stored.ref.hash !== artifact.contentHash) throw new Error("복원한 6패스 CAS hash가 원본과 다릅니다.");
  }
  const stored = await input.authority.put(new TextEncoder().encode(serializeStudioBg3dSixPassBundleManifest(manifest)), { mime: STUDIO_BG3D_SIX_PASS_MANIFEST_MIME });
  if (stored.ref.hash !== ref.manifestHash) throw new Error("복원한 6패스 manifest hash가 다릅니다.");
  rememberStudioBg3dSixPassWorkReceipt(input.workId, ref.manifestHash);
}

const chainSchema = z.object({ version: z.literal(1), workId: z.string(), bundleId: z.string(),
  sealedTipRevisionId: z.string().nullable(), revisions: z.array(z.unknown()) }).strict();
/** 다음 명시적 적용에서만 미게시 봉인 이력을 복구한다. active·화면·owner는 여기서 변경하지 않는다. */
export async function recoverStudioBg3dSixPassRemoteBundleState(input: {
  readonly workId: string; readonly pageId: string; readonly bundleId: string; readonly groupId: string;
  readonly previousState?: StudioBg3dSixPassBundleState; readonly elements: readonly El[];
  readonly authority: StudioOpfsAssetStore; readonly lineAuthority: StudioLinked3dPassCasAuthority;
}): Promise<{ readonly state: StudioBg3dSixPassBundleState | undefined; readonly restoredManifests: readonly StudioBg3dSixPassBundleManifest[] }> {
  const response = await api.raw.get(apiPath(`/creator/works/${encodeURIComponent(input.workId)}/bg3d-bundles/${encodeURIComponent(input.bundleId)}/sealed-chain`), { retry: 0 });
  const chain = chainSchema.parse(await response.json<unknown>());
  if (chain.workId !== input.workId || chain.bundleId !== input.bundleId) throw new Error("복구할 6패스 이력이 다른 작품·묶음을 가리킵니다.");
  const previous = input.previousState ? parseStudioBg3dSixPassBundleState(input.previousState) : undefined;
  const before = previous?.bundles.find(({ bundleId }) => bundleId === input.bundleId);
  if (!chain.revisions.length) {
    if (chain.sealedTipRevisionId !== null || before) throw new Error("이 원고의 보존된 6패스가 서버 봉인 이력에 없습니다.");
    return { state: input.previousState, restoredManifests: [] };
  }
  const remote = parseStudioBg3dSixPassBundleState({ contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundles: [{ bundleId: input.bundleId, activeRevisionId: null, revisions: chain.revisions }] }).bundles[0];
  if (!remote) throw new Error("복구할 6패스 이력이 없습니다.");
  const tip = studioBg3dSixPassRetainedTip(remote.revisions);
  if (!tip || tip.renderRevisionId !== chain.sealedTipRevisionId || tip.pageId !== input.pageId || tip.groupId !== input.groupId) throw new Error("6패스 복구 이력의 마지막 원본·페이지·그룹이 현재 원고와 다릅니다.");
  const byId = new Map(remote.revisions.map((manifest) => [manifest.renderRevisionId, manifest]));
  for (const manifest of before?.revisions ?? []) {
    const sealed = byId.get(manifest.renderRevisionId);
    if (!sealed || hashStudioBg3dSixPassBundleManifest(sealed) !== hashStudioBg3dSixPassBundleManifest(manifest)) throw new Error("로컬 6패스 보존 원본과 서버의 불변 이력이 다릅니다.");
  }
  const roleIds = new Map(tip.layers.map((layer) => [layer.role, layer.elementId]));
  for (const element of input.elements) {
    const ownsBundle = element.type === "image" && element.bg3dLtBundleId === input.bundleId;
    if (ownsBundle && (element.type !== "image" || element.groupId !== tip.groupId || !element.bg3dLtRole
      || roleIds.get(element.bg3dLtRole) !== element.id)) throw new Error("복구할 6패스의 레이어·그룹 식별자가 현재 배경과 다릅니다.");
    if (!ownsBundle && tip.layers.some(({ elementId }) => elementId === element.id)) throw new Error("복구할 6패스 요소 ID가 다른 원고 요소와 충돌합니다.");
  }
  const known = new Set(before?.revisions.map(({ renderRevisionId }) => renderRevisionId));
  const restoredManifests = remote.revisions.filter(({ renderRevisionId }) => !known.has(renderRevisionId));
  if (!restoredManifests.length) return { state: input.previousState, restoredManifests };
  const state = parseStudioBg3dSixPassBundleState({ ...(previous ?? remoteStateEnvelope()),
    bundles: [...(previous?.bundles ?? []).filter(({ bundleId }) => bundleId !== input.bundleId),
      { ...remote, activeRevisionId: before?.activeRevisionId ?? null }] });
  for (const manifest of restoredManifests) {
    await hydrateStudioBg3dSixPassRemoteBundle({ workId: input.workId, authority: input.authority, reference: { version: 1,
      pageId: manifest.pageId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
      parentRevisionId: manifest.parentRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) } });
    for (const { role, artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
      const bytes = await input.authority.get(artifact.contentHash, { verify: true });
      if (!bytes) throw new Error("복구할 6패스 원본이 누락되었습니다.");
      if (role === "scene") {
        if (!parseStudioBg3dSceneDocument(new TextDecoder("utf-8", { fatal: true }).decode(bytes))) throw new Error("복구할 6패스의 장면을 읽을 수 없습니다.");
      } else {
        if (!("width" in artifact)) throw new Error("복구할 6패스 PNG 크기가 없습니다.");
        await decodeStudioBg3dSixPassPng(bytes, artifact.width, artifact.height);
        if (role === "main-line") {
          const stored = await input.lineAuthority.put(bytes, { mime: "image/png" });
          if (stored.ref.hash !== artifact.contentHash || !await input.lineAuthority.get(artifact.contentHash, { verify: true })) throw new Error("복구할 6패스 주선화의 CAS 검증이 실패했습니다.");
        }
      }
    }
  }
  return { state, restoredManifests };
}
function remoteStateEnvelope() {
  return { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5 };
}
