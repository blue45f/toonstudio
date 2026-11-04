import { parseStudioBg3dSixPassBundleImageReference, parseStudioBg3dSixPassArtifactSourceUri,
  isStudioBg3dSixPassImageBlendMode } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

export const STUDIO_CRDT_BG3D_IMAGE_KEYS = ["blendMode", "src", "bg3dLtBundleReference", "bg3dLtBundleId", "bg3dLtRole", "bg3dLtRenderMode"] as const;
export function validateStudioCrdtBg3dImageReference(props: Record<string, unknown>): boolean {
  if (!Object.hasOwn(props, "bg3dLtBundleReference")) {
    if (STUDIO_CRDT_BG3D_IMAGE_KEYS.some((key) => Object.hasOwn(props, key))) throw new Error("6패스 이미지 참조가 누락되었습니다.");
    return false;
  }
  const ref = parseStudioBg3dSixPassBundleImageReference(props.bg3dLtBundleReference);
  if (!ref || props.elementType !== "image" || props.bg3dLtBundleId !== ref.bundleId
    || props.bg3dLtRole !== ref.role || props.bg3dLtRenderMode !== "separated" || typeof props.src !== "string") {
    throw new Error("6패스 이미지의 역할·묶음 참조가 올바르지 않습니다.");
  }
  const hash = ref.role === "main-line" && /^studio-opfs-cas:sha256:[a-f0-9]{64}$/u.test(props.src)
    ? props.src.slice("studio-opfs-cas:".length) : parseStudioBg3dSixPassArtifactSourceUri(props.src);
  if (!hash || (ref.role !== "main-line" && !props.src.startsWith("bg3d-lt-artifact://"))) throw new Error("6패스 이미지 본문 locator가 올바르지 않습니다.");
  if (props.blendMode !== undefined && !isStudioBg3dSixPassImageBlendMode(props.blendMode)) throw new Error("6패스 합성 모드가 지원되지 않습니다.");
  return true;
}
