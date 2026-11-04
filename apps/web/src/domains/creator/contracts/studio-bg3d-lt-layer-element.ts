import type { StudioBg3dLtImageElementLike, StudioBg3dLtLayerRole, StudioBg3dLtPageElementLike, StudioBg3dLtRenderMode } from "../bg3d/studio-bg3d-lt-layer-plan";
import type { StudioBg3dLtLayerPresentation } from "../scene-3d/studio-3d-insert-contract";

interface NormalizedRaster extends StudioBg3dLtLayerPresentation { readonly role: StudioBg3dLtLayerRole; readonly pngDataUrl: string; }
interface CommonGeometry { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rotation: number; readonly flipped: boolean; readonly flippedY: boolean; readonly skewX: number; readonly skewY: number; }

function setOptionalTransform(
  record: Record<string, unknown>,
  key: "flipped" | "flippedY" | "skewX" | "skewY",
  value: boolean | number,
  identity: boolean | number
): void {
  if (value === identity) {
    Reflect.deleteProperty(record, key);
  } else {
    record[key] = value;
  }
}

export function makeStudioBg3dLtLayerElement<
  TElement extends StudioBg3dLtPageElementLike,
  TScene,
>(
  base: TElement & StudioBg3dLtImageElementLike<TScene>,
  layer: NormalizedRaster,
  elementId: string,
  bundleId: string,
  groupId: string,
  mode: StudioBg3dLtRenderMode,
  geometry: CommonGeometry,
  anchorRole: StudioBg3dLtLayerRole,
  scene: TScene,
  layerName: string,
  applyPresentation: boolean
): TElement {
  const next = { ...base } as unknown as Record<string, unknown>;
  Reflect.deleteProperty(next, "bg3dScene");
  next.id = elementId;
  next.type = "image";
  next.src = layer.pngDataUrl;
  next.x = geometry.x;
  next.y = geometry.y;
  next.width = geometry.width;
  next.height = geometry.height;
  next.rotation = geometry.rotation;
  setOptionalTransform(next, "flipped", geometry.flipped, false);
  setOptionalTransform(next, "flippedY", geometry.flippedY, false);
  setOptionalTransform(next, "skewX", geometry.skewX, 0);
  setOptionalTransform(next, "skewY", geometry.skewY, 0);
  next.groupId = groupId;
  next.name = layerName;
  next.layerRole = layer.role === "color" ? "color" : ["tone", "shadow", "depth"].includes(layer.role) ? "tone" : "lineart";
  next.bg3dLtBundleId = bundleId;
  next.bg3dLtRole = layer.role;
  next.bg3dLtRenderMode = mode;
  if (applyPresentation && layer.blendMode !== undefined) next.blendMode = layer.blendMode;
  if (applyPresentation && layer.opacity !== undefined) next.opacity = layer.opacity;
  if (applyPresentation && layer.visible !== undefined) next.hidden = !layer.visible;
  if (layer.role === anchorRole) next.bg3dScene = scene;
  return next as unknown as TElement;
}

