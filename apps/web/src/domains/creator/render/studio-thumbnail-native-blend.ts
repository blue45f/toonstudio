import { parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

export const STUDIO_THUMBNAIL_CSS_BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"] as const;
export type StudioThumbnailCssBlendMode = (typeof STUDIO_THUMBNAIL_CSS_BLEND_MODES)[number];
export interface StudioThumbnailNativeBlend {
  readonly mode: string;
  readonly css: StudioThumbnailCssBlendMode | null;
}
const cssModes: ReadonlySet<string> = new Set(STUDIO_THUMBNAIL_CSS_BLEND_MODES);
/** 일반 이미지의 기존 근사는 유지하고, 검증된 새 6패스 멤버만 SVG 합성으로 옮긴다. */
export function studioThumbnailNativeBlend(element: unknown): StudioThumbnailNativeBlend | null {
  if (!element || typeof element !== "object" || Array.isArray(element)) return null;
  const value = element as Record<string, unknown>;
  const ref = parseStudioBg3dSixPassBundleImageReference(value.bg3dLtBundleReference);
  if (!ref || value.id !== ref.elementId || value.type !== "image" || value.bg3dLtBundleId !== ref.bundleId
    || value.bg3dLtRole !== ref.role || value.bg3dLtRenderMode !== "separated") return null;
  const mode = typeof value.blendMode === "string" ? value.blendMode : "normal";
  // source-over와 CSS normal은 같은 기본 합성이다. 다른 Porter-Duff 모드는 근사하지 않는다.
  const css = mode === "source-over" ? "normal" : cssModes.has(mode) ? mode as StudioThumbnailCssBlendMode : null;
  return { mode, css };
}
export function studioThumbnailNativeBlends(elements: readonly unknown[]): ReadonlyMap<string, StudioThumbnailNativeBlend> {
  const blends = new Map<string, StudioThumbnailNativeBlend>();
  for (const element of elements) {
    const blend = studioThumbnailNativeBlend(element);
    if (blend && element && typeof element === "object" && "id" in element && typeof element.id === "string") blends.set(element.id, blend);
  }
  return blends;
}
