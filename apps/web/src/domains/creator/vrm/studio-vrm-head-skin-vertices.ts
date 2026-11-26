import { classifyMeshName } from "./studio-vrm-costume";

import type { Mesh } from "three";

export interface StudioVrmHeadSkinVertices {
  readonly count: number;
  /** 전체 정점이 순서대로 쓰이면 생략한다. */
  readonly indices?: readonly number[];
}

/** 그리기 범위에 포함된 비헤어 프리미티브의 정점만 한 번씩 돌려준다. */
export function getStudioVrmHeadSkinVertices(mesh: Mesh): StudioVrmHeadSkinVertices {
  const { geometry, material } = mesh;
  const position = geometry.getAttribute("position");
  if (!position || classifyMeshName(mesh.name).protected === "hair") return { count: 0 };

  const slots = Array.isArray(material) ? material : [material];
  const isSurface = slots.map((slot) => Boolean(slot) && classifyMeshName(slot.name).protected !== "hair");
  if (!isSurface.some(Boolean)) return { count: 0 };

  const index = geometry.getIndex();
  const total = index?.count ?? position.count;
  const drawStart = Math.max(0, geometry.drawRange.start);
  const drawEnd = Math.min(total, geometry.drawRange.start + geometry.drawRange.count);
  if (drawStart >= drawEnd) return { count: 0 };
  if (!Array.isArray(material) && !index && drawStart === 0 && drawEnd === position.count) {
    return { count: position.count };
  }

  const seen = new Uint8Array(position.count);
  const indices: number[] = [];
  const collectRange = (start: number, end: number) => {
    const stop = Math.min(drawEnd, end);
    for (let offset = Math.max(drawStart, start); offset < stop; offset += 1) {
      const vertex = index ? index.getX(offset) : offset;
      if (seen[vertex]) continue;
      seen[vertex] = 1;
      indices.push(vertex);
    }
  };

  if (Array.isArray(material)) {
    for (const group of geometry.groups) {
      if (isSurface[group.materialIndex ?? 0]) collectRange(group.start, group.start + group.count);
    }
  } else {
    collectRange(drawStart, drawEnd);
  }

  return { count: indices.length, indices };
}
