import type { StudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioProjectFile } from "../../studio-project-file";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasBundleImageMarker(element: unknown): boolean {
  return record(element) && (element.bg3dLtBundleReference !== undefined
    || (typeof element.src === "string" && element.src.startsWith("bg3d-lt-artifact:")));
}
export function hasStudioBg3dSixPassProjectBundles(project: StudioProjectFile): boolean {
  return project.pagesList.some((page) => page.bg3dLtBundles !== undefined || page.elements.some(hasBundleImageMarker));
}

/** 완전한 manifest 검증은 파일·아카이브의 비동기 입장에서만 지연 로드한다. */
export async function collectStudioBg3dSixPassProjectBundles(project: StudioProjectFile): Promise<readonly {
  readonly pageIndex: number; readonly pageId: string; readonly state: StudioBg3dSixPassBundleState;
}[]> {
  if (!hasStudioBg3dSixPassProjectBundles(project)) return [];
  const { parseStudioBg3dSixPassBundleState, parseStudioBg3dSixPassBundleImageReference,
    hashStudioBg3dSixPassBundleManifest, studioBg3dSixPassArtifactSourceUri } = await import("@toonstudio/contracts/studio-bg3d-six-pass-bundle");
  const { parseStudioLinked3dRenderDocument } = await import("../../studio-linked-3d-render-document");
  return project.pagesList.flatMap((page, pageIndex) => {
    if (page.bg3dLtBundles === undefined) {
      if (page.elements.some(hasBundleImageMarker)) throw new Error("6패스 묶음 레이어에 보존 manifest가 없습니다.");
      return [];
    }
    const state = parseStudioBg3dSixPassBundleState(page.bg3dLtBundles);
    if (state.bundles.some((bundle) => bundle.revisions.some((revision) => revision.pageId !== page.id))) {
      throw new Error("6패스 묶음의 보존 revision이 다른 페이지를 가리킵니다.");
    }
    const retainedElementIds = new Set(state.bundles.flatMap((bundle) =>
      bundle.revisions.flatMap((revision) => revision.layers.map((layer) => layer.elementId))));
    // 일부 레이어 삭제와 표시 편집은 허용하고, 현재 남은 source·역할·요소·revision만 정확히 결박한다.
    for (const element of page.elements) {
      if (!record(element)) continue;
      if (!hasBundleImageMarker(element) && !(typeof element.id === "string" && retainedElementIds.has(element.id))) continue;
      const reference = parseStudioBg3dSixPassBundleImageReference(element.bg3dLtBundleReference);
      const bundle = reference ? state.bundles.find((entry) => entry.bundleId === reference.bundleId) : undefined;
      const manifest = bundle?.revisions.find((entry) => entry.renderRevisionId === reference?.renderRevisionId);
      const layer = manifest?.layers.find((entry) => entry.role === reference?.role);
      if (!reference || !manifest || !layer || element.type !== "image" || element.id !== layer.elementId
        || reference.elementId !== element.id || reference.manifestHash !== hashStudioBg3dSixPassBundleManifest(manifest)
        || element.bg3dLtBundleId !== manifest.bundleId || element.bg3dLtRole !== layer.role
        || bundle?.activeRevisionId !== reference.renderRevisionId || element.bg3dLtRenderMode !== "separated"
        || element.groupId !== manifest.groupId || !Array.isArray(page.groups)
        || !page.groups.some((group) => record(group) && group.id === manifest.groupId)) {
        throw new Error("6패스 묶음 레이어의 역할·요소·revision 결박이 손상되었습니다.");
      }
      const source = layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}`
        : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash);
      if (element.src !== source) throw new Error("6패스 묶음 레이어의 source가 보존된 본문 digest와 다릅니다.");
      if (layer.role === "main-line") {
        const link = parseStudioLinked3dRenderDocument(page.linked3dRender)?.links.find((entry) => entry.bundleId === manifest.bundleId);
        if (!link || link.passRevision.revision !== manifest.linePassRevision) throw new Error("6패스 묶음과 기존 선화 index의 revision이 다릅니다.");
      }
    }
    return [{ pageIndex, pageId: page.id, state }];
  });
}
