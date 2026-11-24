import { VerifiedSceneLinkError } from "./studio-bg3d-verified-scene-error";
import {
  createStudioBg3dModelAttachment,
  importVerifiedBg3dModelsAtomicallyV12,
  resolveBg3dModelHashV12,
} from "./studio-bg3d-model-library-loader";
import { createStudioBg3dVerifiedLocalScene, type StudioBg3dVerifiedLocalScene } from "./studio-bg3d-verified-local-scenes";
import type { Bg3dTemplateLibraryEntry } from "./studio-bg3d-template-library-loader";

export async function linkStudioBg3dVerifiedScene(
  scene: StudioBg3dVerifiedLocalScene, file: File | null, signal?: AbortSignal,
): Promise<Bg3dTemplateLibraryEntry> {
  signal?.throwIfAborted();
  if (file) {
    if (file.size !== scene.byteSize) throw new VerifiedSceneLinkError("size");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    const hash = "sha256:" + Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== scene.hash) throw new VerifiedSceneLinkError("hash");
  }
  signal?.throwIfAborted();
  let { record } = await resolveBg3dModelHashV12(scene.hash, { source: "local-library", signal });
  if (!record && file) {
    const [imported] = await importVerifiedBg3dModelsAtomicallyV12([{
      file, expectedSha256: scene.hash,
      rights: { status: "unknown", commercialUse: false, attributionRequired: Boolean(scene.attributionText),
        ...(scene.attributionText ? { attribution: scene.attributionText } : {}) },
      ingress: { kind: "user-file", modelFileExport: "unknown" },
    }], { executionBackend: "worker", signal });
    record = imported ?? null;
  }
  if (!record) throw new VerifiedSceneLinkError("missing");
  if (scene.attributionText) {
    const words = (value: string) => " " + value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
    const actual = words(record.rights.attribution ?? "");
    const complete = scene.attributionText.split(/[,;]/u).every(part => actual.includes(words(part)));
    if (!record.rights.attributionRequired || !complete) {
      throw new VerifiedSceneLinkError("credit", scene.attributionText);
    }
  }
  const attachment = await createStudioBg3dModelAttachment(record, {
    source: "local-library", attachmentId: "verified-attachment-" + scene.hash.slice(7, 39),
  });
  signal?.throwIfAborted();
  const document = createStudioBg3dVerifiedLocalScene(scene, attachment);
  if (!document) throw new VerifiedSceneLinkError("integrity");
  return { id: scene.id, name: scene.name, document, commercialUse: attachment.rights.commercialUse, createdAt: 0 };
}
