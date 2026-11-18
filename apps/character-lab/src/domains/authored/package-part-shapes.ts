import { PART_SCOPES, parseAuthoredHairMeshName, parseShapeMorphName } from "../../contracts";

import type { CharacterPackageManifest, CustomCapabilities } from "../../contracts";

export function packagePartShapes(manifest: CharacterPackageManifest, hairLod = 0): CustomCapabilities["shapes"] {
  const shapes: Partial<Record<(typeof PART_SCOPES)[number], string[]>> = {};
  const roles = manifest.characterLab?.meshRoles;
  for (const [mesh, targets] of Object.entries(manifest.characterLab?.partMorphTargets ?? {})) {
    const scope = PART_SCOPES.find((name) => name === roles?.[mesh]);
    if (!scope) continue;
    const lod = scope === "hair" ? parseAuthoredHairMeshName(mesh.replace(/_Outline$/u, ""))?.lod : undefined;
    if (lod !== undefined && lod !== hairLod) continue;
    for (const target of targets) {
      const parsed = parseShapeMorphName(target);
      // 양방향 슬라이더에는 현재 메시가 양·음 변형을 모두 갖춘 항목만 표시한다.
      if (!parsed || parsed.sign !== "+" || !targets.includes(`shape:${parsed.name}:-`)) continue;
      const names = shapes[scope] ??= [];
      if (!names.includes(parsed.name)) names.push(parsed.name);
    }
  }
  return shapes;
}
