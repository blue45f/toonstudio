import { parseStudioBg3dSixPassBundleImageReference, studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { hasStudioBg3dSixPassImageMarker } from "./studio-bg3d-six-pass-persistence-markers";
import { studioBg3dSixPassManifestHash } from "./studio-bg3d-six-pass-manifest-hash";
import type { PageState } from "../../../studio-page-state";

const REASON = "6패스 원본의 그룹·역할·픽셀을 직접 교체할 수 없습니다. 3D 재캡처나 원본을 유지한 정적 복사본을 사용해 주세요.";
/** 본문 입장은 별도 권위가 담당한다. 동기 편집에서는 불변 metadata 결박만 검사한다. */
export function studioBg3dSixPassEditReason(before: PageState | undefined, next: PageState): string | null {
  const remaining = new Map(next.elements.map((element) => [element.id, element]));
  for (const element of before?.elements ?? []) {
    if (hasStudioBg3dSixPassImageMarker(element) && remaining.has(element.id) && !hasStudioBg3dSixPassImageMarker(remaining.get(element.id))) return REASON;
  }
  try {
    const hashes = new Map<object, string>();
    for (const element of next.elements) {
      if (!hasStudioBg3dSixPassImageMarker(element)) continue;
      if (element.type !== "image") return REASON;
      const ref = parseStudioBg3dSixPassBundleImageReference(element.bg3dLtBundleReference);
      const bundle = ref && next.bg3dLtBundles?.bundles.find((entry) => entry.bundleId === ref.bundleId);
      const manifest = bundle?.revisions.find((entry) => entry.renderRevisionId === ref?.renderRevisionId);
      const layer = manifest?.layers.find((entry) => entry.role === ref?.role);
      if (!ref || !manifest || !layer || manifest.pageId !== next.id || bundle?.activeRevisionId !== ref.renderRevisionId
        || element.id !== ref.elementId || element.id !== layer.elementId || element.bg3dLtBundleId !== ref.bundleId || element.bg3dLtRole !== ref.role
        || element.bg3dLtRenderMode !== "separated" || element.groupId !== manifest.groupId || !next.groups?.some((group) => group.id === manifest.groupId)) return REASON;
      const hash = hashes.get(manifest) ?? studioBg3dSixPassManifestHash(manifest);
      hashes.set(manifest, hash);
      if (hash !== ref.manifestHash || element.src !== (ref.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash))) return REASON;
    }
    return null;
  } catch { return REASON; }
}
