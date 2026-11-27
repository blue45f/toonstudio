import * as THREE from "three";

import type { StudioVrmAuthoredHairInstance } from "./studio-vrm-authored-hair-geometry";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

/** 모델에 맞춘 매듭부터 땋은 마디를 좌우 교대로 포갠다. 길이와 굵기를 따로 조절해도 마디 사이가 끊기지 않는다. */
export function fitStudioVrmBraidLinks(instances: StudioVrmAuthoredHairInstance[], fit: StudioVrmHeadFit): void {
  const ties = instances.filter(({ part }) => part.role === "bun" && /^braid(?:-left|-right)?-tie$/.test(part.id));
  for (const tie of ties) {
    const prefix = tie.part.id.slice(0, -3) + "seg-";
    const links = instances.filter(({ part }) => part.role === "braid" && part.id.startsWith(prefix));
    const first = links[0];
    if (!first) continue;
    const root = new THREE.Vector3().setFromMatrixPosition(tie.matrix);
    const length = 2 * (tie.part.position[1] - first.part.position[1]) * links.length * fit.radiusY / 0.46;
    const step = length / links.length;
    const side = Math.sign(tie.part.position[0]) * fit.frontSign;
    const twist = side || fit.frontSign;
    const startWidth = first.part.scale[0] * fit.radiusX / 0.56;
    const forward = fit.frontSign;
    const joint = (index: number) => {
      const t = index / links.length;
      const swing = index === 0 ? 0 : twist * (index % 2 === 0 ? -1 : 1) * startWidth * 0.48 * (1 - 0.5 * t);
      const lower = THREE.MathUtils.smoothstep(t, 0, 0.76);
      return new THREE.Vector3(root.x + swing + side * 0.12 * fit.radiusX * Math.sin(t * Math.PI),
        root.y - index * step, root.z - forward * lower * fit.radiusZ * (side ? 0.88 : 0.46));
    };
    let start = root;
    for (let i = 0; i < links.length; i++) {
      const link = links[i]!;
      const end = joint(i + 1);
      const center = start.clone().lerp(end, 0.5);
      const axis = start.clone().sub(end);
      const radius = link.part.scale[0] * fit.radiusX / 0.56;
      const extent = axis.length() * 0.56 + radius * 0.34;
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
      link.matrix.compose(center, rotation, new THREE.Vector3(radius, extent, radius * 0.88));
      start = end;
    }
  }
}
