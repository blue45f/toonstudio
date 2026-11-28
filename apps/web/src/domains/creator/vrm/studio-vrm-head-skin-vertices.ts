import { classifyMeshName } from "./studio-vrm-costume";

import type { Mesh } from "three";

export interface StudioVrmHeadSkinVertices {
  readonly count: number;
  /** 전체 정점이 순서대로 쓰이면 생략한다. */
  readonly indices?: readonly number[];
  /** 선택한 표면의 정점인지 원래 정점 번호로 바로 조회할 때 쓴다. */
  readonly membership?: Uint8Array;
}

/** 그리기 범위에 포함된 얼굴 또는 원본 머리카락 프리미티브의 정점만 한 번씩 돌려준다. */
function readDrawnHeadVertices(mesh: Mesh, surface: "skin" | "hair", collectIndices: boolean): StudioVrmHeadSkinVertices {
  const { geometry, material } = mesh;
  const position = geometry.getAttribute("position");
  const hairMesh = classifyMeshName(mesh.name).protected === "hair";
  if (!position || (hairMesh && surface === "skin")) return { count: 0 };

  const slots = Array.isArray(material) ? material : [material];
  const isSurface = slots.map((slot) => Boolean(slot)
    && (hairMesh || classifyMeshName(slot.name).protected === "hair") === (surface === "hair"));
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
  let count = 0;
  const indices: number[] | undefined = collectIndices ? [] : undefined;
  const collectRange = (start: number, end: number) => {
    const stop = Math.min(drawEnd, end);
    for (let offset = Math.max(drawStart, start); offset < stop; offset += 1) {
      const vertex = index ? index.getX(offset) : offset;
      if (seen[vertex]) continue;
      seen[vertex] = 1;
      count++;
      indices?.push(vertex);
    }
  };

  if (Array.isArray(material)) {
    for (const group of geometry.groups) {
      if (isSurface[group.materialIndex ?? 0]) collectRange(group.start, group.start + group.count);
    }
  } else {
    collectRange(drawStart, drawEnd);
  }

  return { count, indices, membership: seen };
}

export function getStudioVrmHeadSkinVertices(mesh: Mesh): StudioVrmHeadSkinVertices {
  return readDrawnHeadVertices(mesh, "skin", true);
}

/** 이미 예산 간격으로 읽는 두상 측정에는 전체 정점 번호 배열을 추가 할당하지 않는다. */
export function getStudioVrmHeadSurfaceMembership(mesh: Mesh, surface: "skin" | "hair"): StudioVrmHeadSkinVertices {
  return readDrawnHeadVertices(mesh, surface, false);
}
