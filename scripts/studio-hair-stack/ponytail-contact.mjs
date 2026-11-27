import { Vector3 } from "three";

import { createStudioVrmAuthoredHairGeometry } from "../../apps/web/src/domains/creator/vrm/studio-vrm-authored-hair-geometry";
import { buildAvatarForgeHairParts } from "../../apps/web/src/domains/creator/vrm/studio-vrm-avatar-forge";
import { avatarForgeHairInstance, expandAvatarForgeHairPartsForRender } from "../../apps/web/src/domains/creator/vrm/studio-vrm-avatar-forge-hair-object";

/** Read the mounted head-local surface. Templates identify vertex ranges and never supply positions. */
export function measurePonytailContact(mergedGeometry, state, fit) {
  if (state.hair.style !== "ponytail") return null;
  const parts = expandAvatarForgeHairPartsForRender(buildAvatarForgeHairParts(state), state.hair);
  const knot = parts.find((part) => part.id === "pony-root");
  const positions = mergedGeometry.getAttribute("position");
  const uv = mergedGeometry.getAttribute("uv");
  if (!knot || !positions || positions.itemSize !== 3 || !uv || uv.itemSize !== 2 || uv.count !== positions.count) {
    throw new Error("Cannot identify the mounted ponytail mesh and its knot");
  }

  const toKnot = avatarForgeHairInstance(knot, fit).matrix.clone().invert();
  const point = new Vector3();
  let offset = 0;
  let rootVertices = 0;
  let insideKnot = 0;
  let nearestRadius = Infinity;
  let farthestRadius = 0;
  for (const part of parts) {
    const template = createStudioVrmAuthoredHairGeometry(part);
    try {
      const count = template.getAttribute("position").count;
      const expectedUv = template.getAttribute("uv");
      if (!expectedUv || expectedUv.count !== count || offset + count > positions.count) {
        throw new Error(`Ponytail vertex layout differs at ${part.id}`);
      }
      for (let i = 0; i < count; i++) {
        const index = offset + i;
        const v = uv.getY(index);
        if (uv.getX(index) !== expectedUv.getX(i) || v !== expectedUv.getY(i)) {
          throw new Error(`Ponytail UV layout differs at ${part.id} vertex ${i}`);
        }
        if (part.id !== "pony-tail" || v !== 0) continue;
        const radius = point.fromBufferAttribute(positions, index).applyMatrix4(toKnot).length();
        if (!Number.isFinite(radius)) throw new Error("Non-finite mounted ponytail root");
        rootVertices++;
        if (radius < 1) insideKnot++;
        nearestRadius = Math.min(nearestRadius, radius);
        farthestRadius = Math.max(farthestRadius, radius);
      }
      offset += count;
    } finally {
      template.dispose();
    }
  }
  if (offset !== positions.count || !rootVertices) throw new Error("Incomplete mounted ponytail root range");
  return { rootVertices, insideKnot, nearestRadius, farthestRadius };
}
