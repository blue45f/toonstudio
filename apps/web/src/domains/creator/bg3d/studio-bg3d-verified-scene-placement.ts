import type { StudioBg3dModelAttachment, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

/** 같은 기기 파일이 이미 원고에 있으면 첨부의 변환 정책과 메타데이터를 보존한다. 배치 직전 정본과 권리도 대조한다. */
export function reuseVerifiedSceneAttachmentId(
  document: StudioBg3dSceneDocument, current: ReadonlyMap<string, StudioBg3dModelAttachment>,
): StudioBg3dSceneDocument {
  const [source] = document.attachments;
  if (!source || document.attachments.length !== 1) return document;
  const existing = Array.from(current.values()).find(item =>
    item.source === "local-library" && item.hash === source.hash && item.byteSize === source.byteSize && item.mime === source.mime);
  if (!existing) return document;
  return {
    ...document,
    attachments: [existing],
    nodes: document.nodes.map(node => node.kind === "model" && node.attachmentId === source.id
      ? { ...node, attachmentId: existing.id } : node),
  };
}
