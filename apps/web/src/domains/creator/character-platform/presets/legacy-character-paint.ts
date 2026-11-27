import { PART_ROLES, paintStateSchemaV3 } from "@toonstudio/studio-project-model/character-kit";

import { createStudioVrmTexturePaintArtifact, STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_LIMITS } from "../../vrm/studio-vrm-texture-paint-artifact";
import { MAX_LEGACY_RECIPE_BYTES } from "./legacy-character-appearance";

export interface LegacyPaintImage {
  readonly part: string;
  readonly slot: number | null;
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly pngBase64: string;
}

export function readLegacyPaintImages(source: unknown): readonly LegacyPaintImage[] {
  if (!source || typeof source !== "object" || !("layers" in source) || !Array.isArray(source.layers)
    || source.layers.length > PART_ROLES.length
    || ("sublayers" in source && (!Array.isArray(source.sublayers) || source.sublayers.length > PART_ROLES.length))) {
    throw new Error("invalid-paint");
  }
  const paint = paintStateSchemaV3.parse(source);
  const images: LegacyPaintImage[] = paint.layers.map((layer) => ({ ...layer, slot: null, visible: true, opacity: 1 }));
  for (const part of paint.sublayers ?? []) {
    for (const index of part.order) {
      const slot = part.slots[index];
      if (slot.pngBase64) images.push({
        part: part.part, width: part.width, height: part.height, slot: index,
        opacity: slot.opacity, visible: slot.visible, pngBase64: slot.pngBase64,
      });
    }
  }
  return images;
}

export async function openLegacyPaintImage(image: LegacyPaintImage, signal?: AbortSignal): Promise<Blob> {
  const limits = STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_LIMITS;
  if (image.width > limits.maxWidth || image.height > limits.maxHeight || image.pngBase64.length > MAX_LEGACY_RECIPE_BYTES) {
    throw new Error("paint-too-large");
  }
  const binary = atob(image.pngBase64);
  const source = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) source[i] = binary.charCodeAt(i);
  const artifact = await createStudioVrmTexturePaintArtifact({
    bindingKey: "legacy-paint", source, expectedWidth: image.width, expectedHeight: image.height,
  }, { signal });
  return artifact.archiveEntry.data;
}
