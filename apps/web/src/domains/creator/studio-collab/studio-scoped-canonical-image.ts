import type { El, ImageEl } from "../studio-element-model";
import { studioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { createStudioWorkAssetInitialImageDescriptor, readBoundedStudioWorkAssetLocalImage } from "../studio-work-asset-admission";
import { uploadStudioWorkAsset } from "../studio-work-asset-client";
import { studioWorkAssetSourceUri } from "@toonstudio/contracts/studio-work-asset-contract";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { scopedStudioDrawingContinuationLocked, type StudioScopedCanvasBoundaryRef } from "./studio-scoped-drawing-boundary";

type Owner = { readonly current: { readonly locked: boolean } };
interface PendingImage { readonly id: string; source?: string; context?: StudioScopedWriteContext; completed?: boolean; inFlight?: Promise<El[]> }
const pending = new WeakMap<object, Map<string, PendingImage>>();
function row(owner: object, strokeId: string, candidate: string): PendingImage {
  let images = pending.get(owner); if (!images) { images = new Map(); pending.set(owner, images); }
  let image = images.get(strokeId); if (!image) { image = { id: candidate }; images.set(strokeId, image); }
  return image;
}

/** 제한 편집의 원본 PNG 저장 요청 ID는 성공 여부가 불명확해도 같은 stroke에서 바꾸지 않는다. */
export function scopedStudioCanonicalImageId(owner: Owner, strokeId: string, candidate: string): string {
  return owner.current.locked ? row(owner, strokeId, candidate).id : candidate;
}
export function scopedStudioCanonicalMutationLocked(owner: Owner, strokeId: string, globalLocked = false, boundary?: StudioScopedCanvasBoundaryRef): boolean {
  return scopedStudioDrawingContinuationLocked(owner, strokeId, globalLocked, boundary);
}
export function scopedStudioLivingInkReplacement(owner: Owner, elements: readonly El[], pageId: string, frameClipId?: string): string | null | undefined {
  if (!owner.current.locked) return undefined;
  const authority = studioScopedWriteAuthority(owner), target = authority?.currentTarget;
  return elements.find((element) => element.type === "image" && element.livingInkReceipt?.pageId === pageId && element.frameClipId === frameClipId
    && authority?.ownerOf("element", element.id) === target?.definition.id)?.id ?? null;
}

/** 원본 PNG bytes를 동일 실제 ID로 먼저 승인하고, stable URI를 받은 뒤에만 Y 참조를 발행한다. */
export async function admitStudioScopedCanonicalImage(owner: Owner, strokeId: string, imageId: string, elements: readonly El[]): Promise<El[]> {
  if (!owner.current.locked) return [...elements];
  const authority = studioScopedWriteAuthority(owner);
  if (!authority) throw new Error("파생 원고의 현재 담당 권한을 확인할 수 없습니다.");
  authority.assertCreationContinuation("stroke", strokeId);
  const image = elements.find((element): element is El & ImageEl => element.id === imageId && element.type === "image");
  if (!image) throw new Error("실제 파생 PNG 원본을 찾지 못했습니다.");
  const original = row(owner, strokeId, image.id);
  if (original.id !== image.id || (original.source !== undefined && original.source !== image.src)) throw new Error("확인 중인 원래 PNG 저장 내용이 있습니다. 원본 ID와 bytes를 유지한 채 저장 상태를 확인하세요.");
  if (original.inFlight) return original.inFlight;
  original.source ??= image.src; original.context ??= authority.purposeContext();
  const originalSource = original.source;
  const run = async (): Promise<El[]> => {
    const reference = { assetId: original.id, elementType: "image" as const };
    const controller = new AbortController(), body = await readBoundedStudioWorkAssetLocalImage(originalSource, controller.signal);
    const digest = sha256HexPortable(new Uint8Array(await body.arrayBuffer()));
    authority.assertCreationContinuation("stroke", strokeId);
    if (!original.completed) {
      const manifest = await uploadStudioWorkAsset(authority.workId, reference, createStudioWorkAssetInitialImageDescriptor({ ...image }), body, controller.signal, original.context);
      if (manifest.sha256 !== digest || manifest.byteSize !== body.size || manifest.mimeType !== "image/png" || body.type !== "image/png") throw new Error("저장된 파생 PNG의 원본 bytes·크기·형식 영수증이 일치하지 않습니다.");
      original.completed = true;
    }
    authority.assertCreationContinuation("stroke", strokeId);
    if (authority.ownerOf("element", image.id) === null) authority.registerDerivedCreation("stroke", strokeId, "element", image.id);
    return elements.map((element) => element.id === image.id ? { ...element, src: studioWorkAssetSourceUri(reference) } : element);
  };
  original.inFlight = run();
  try { return await original.inFlight; } finally { original.inFlight = undefined; }
}
