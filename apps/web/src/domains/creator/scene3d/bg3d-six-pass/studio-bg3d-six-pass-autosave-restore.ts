import type { StudioAutosavePayload } from "../../studio-autosave";
import { parseStudioProjectFile } from "../../studio-project-file";
import { verifyStudioBg3dSixPassProjectNativeBodies } from "./studio-bg3d-six-pass-project-archive";
import { acquireStudioBg3dSixPassBundleProductAuthority } from "./studio-bg3d-six-pass-bundle-product-authority";
import { acquireStudioLinked3dPassProductAuthority } from "../../studio-linked-3d-pass-product-authority";
import { collectStudioLinked3dPassProjectArchiveReferences } from "../../studio-linked-3d-pass-project-archive";
import { inspectStudioLinked3dPassPng } from "../../studio-linked-3d-pass-transaction";
import { sha256HexPortable } from "../../studio-sha256";

/** 복구 후보는 보존하되 원고 교체 전에 retained 전체 본문과 기존 선화 권위를 각각 검증한다. */
export async function verifyStudioBg3dSixPassAutosaveRestore(payload: StudioAutosavePayload): Promise<void> {
  const project = parseStudioProjectFile({ ...payload, title: payload.title ?? "" });
  await verifyStudioBg3dSixPassProjectNativeBodies(project, await acquireStudioBg3dSixPassBundleProductAuthority());
  const references = collectStudioLinked3dPassProjectArchiveReferences(project);
  if (!references.length) return;
  const lineAuthority = await acquireStudioLinked3dPassProductAuthority();
  for (const reference of references) {
    const bytes = await lineAuthority.get(reference.contentHash, { verify: true });
    const png = bytes ? inspectStudioLinked3dPassPng(bytes) : null;
    if (!bytes || bytes.byteLength !== reference.byteSize || !png || png.width !== reference.width || png.height !== reference.height
      || `sha256:${sha256HexPortable(bytes)}` !== reference.contentHash) throw new Error("복구할 기존 3D 선화 본문의 영수증이 일치하지 않습니다.");
  }
}
