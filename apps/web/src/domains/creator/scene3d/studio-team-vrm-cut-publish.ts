import { studioWorkAssetSourceUri } from "@toonstudio/contracts/studio-work-asset-contract";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { serializeStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { CANVAS_W } from "../studio-assets";
import { createCanvasImageElement } from "../studio-image-placement";
import type { ImageEl } from "../studio-element-model";
import { createStudioWorkAssetInitialImageDescriptor, readBoundedStudioWorkAssetLocalImage } from "../studio-work-asset-admission";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";
import { requestStudioVrmProjectArchiveUseContext } from "../vrm/StudioVrmProjectArchiveAttestationHost";
import { writeTeamVrmCut } from "./studio-team-vrm-cut-client";

const pending = new WeakMap<object, Map<string, Promise<boolean>>>();

async function sha256(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
}

/** 탭이 닫힌 뒤에도 동일한 제출이 같은 서버 영수증을 찾도록 UUIDv8의 payload를 콘텐츠 해시로 채운다. */
export async function teamVrmCutAnchorId(workId: string, pageId: string, parentId: string | undefined,
  placement: Pick<ImageEl, "x" | "y" | "width" | "height" | "rotation">, scene: string, composite: Blob) {
  const text = new TextEncoder();
  const [sourceHash, compositeHash] = await Promise.all([sha256(text.encode(scene)), composite.arrayBuffer().then(sha256)]);
  const hex = await sha256(text.encode(JSON.stringify(["studio-work-vrm-cut-anchor:v1", workId, pageId, parentId ?? null,
    placement.x, placement.y, placement.width, placement.height, placement.rotation, sourceHash, compositeHash])));
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `vrmcut-${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function publishTeamVrmCutLayer(input: {
  workId: string; pageId: string; session: object; canvasHeight: number; result: StudioBackground3DInsertResult;
  current(): boolean; existing(id: string): { type: string; src?: string } | undefined;
  add(image: ImageEl): boolean; writeContext?: StudioScopedWriteContext; previous?: ImageEl;
}) {
  const { result, previous } = input;
  const cut = result.bg3dScene.pinnedVersionedCut;
  if (result.magicFilterMask || !cut?.source.linkedVrm) throw new Error("팀 VRM 컷은 고정한 컬러 장면만 저장할 수 있습니다.");
  const source = serializeStudioBg3dSceneDocument(result.bg3dScene);
  if (!source) throw new Error("팀 컷 원본을 읽을 수 없습니다.");
  const signal = result.cutWorkSignal ?? new AbortController().signal;
  const png = await readBoundedStudioWorkAssetLocalImage(result.compositePngDataUrl, signal);
  const placed = createCanvasImageElement({ id: "", src: result.compositePngDataUrl, canvasWidth: CANVAS_W, canvasHeight: input.canvasHeight,
    sourceWidth: result.width, sourceHeight: result.height });
  const placement = previous ? { ...placed, x: previous.x, y: previous.y, width: previous.width,
    height: Math.max(1, Math.round(previous.width * result.height / result.width)), rotation: previous.rotation } : placed;
  const anchorId = await teamVrmCutAnchorId(input.workId, input.pageId, previous?.id, placement, source, png);
  const inFlight = pending.get(input.session) ?? new Map<string, Promise<boolean>>();
  const active = inFlight.get(anchorId);
  if (active) return active;
  pending.set(input.session, inFlight);
  async function publish() {
    const image = { ...placement, id: anchorId, name: `3D 컷 · ${cut?.name}` };
    const descriptor = createStudioWorkAssetInitialImageDescriptor(image);
    await writeTeamVrmCut({ workId: input.workId, pageId: input.pageId, anchorId }, { scene: result.bg3dScene, composite: result.compositePngDataUrl, descriptor,
      current: input.current, resources: result.cutWorkResources, writeContext: input.writeContext,
      consent: plan => requestStudioVrmProjectArchiveUseContext({ ...plan, destination: "team-cut" }) }, signal);
    signal.throwIfAborted();
    if (!input.current()) throw new Error("작품 또는 편집 권한이 변경되어 이전 원고에 레이어를 추가하지 않았습니다.");
    const src = studioWorkAssetSourceUri({ elementType: "image", assetId: anchorId });
    const existing = input.existing(anchorId);
    if (!existing) return input.add({ ...image, src });
    if (existing.type !== "image" || existing.src !== src) throw new Error("다른 레이어가 같은 식별자를 사용합니다. 원고를 다시 열어 주세요.");
    return true;
  }
  const operation = publish();
  inFlight.set(anchorId, operation);
  try { return await operation; } finally { inFlight.delete(anchorId); }
}
