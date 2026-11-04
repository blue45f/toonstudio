import type { El } from "../../studio-element-model";
import type { LayerGroup } from "../../studio-layers";

export function preserveStudioBg3dSixPassArtistLayers(next: readonly El[], before: readonly El[], bundleId: string): El[] {
  const byId = new Map(before.map((element) => [element.id, element]));
  return next.map((element) => {
    if (element.type !== "image" || element.bg3dLtBundleId !== bundleId) return element;
    const original = byId.get(element.id);
    const current = original?.type === "image" ? { ...element, name: original.name } : element;
    return current;
  });
}
export function preserveStudioBg3dSixPassArtistGroups(next: readonly LayerGroup[], before: readonly LayerGroup[], groupId: string): LayerGroup[] {
  const original = before.find((group) => group.id === groupId);
  return next.map((group) => group.id === groupId && original ? { ...group, name: original.name } : group);
}
