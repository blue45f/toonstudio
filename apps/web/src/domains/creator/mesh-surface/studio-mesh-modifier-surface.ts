/** soup 생성 순서와 원본 코너의 명시적 대응으로 면·crease 속성을 보존한다. */
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioMeshModifier } from "../mesh-modifiers/studio-mesh-modifier-types";

export interface StudioModifierSurfaceCorner { readonly vertexCrease: number; readonly edgeCrease: number }
export interface StudioModifierTriangleSurface {
  readonly materialSlot: number;
  readonly smooth: boolean;
  readonly corners: readonly [StudioModifierSurfaceCorner, StudioModifierSurfaceCorner, StudioModifierSurfaceCorner];
}

export function studioModifierSurfaceFan(
  surface: Pick<StudioModifierTriangleSurface, "materialSlot" | "smooth">,
  corners: readonly StudioModifierSurfaceCorner[],
  ids: readonly [number, number, number],
): StudioModifierTriangleSurface {
  const projected = ids.map((id, index) => {
    const value = corners[id]; if (!value) throw new Error("변형의 원본 속성 코너가 없습니다.");
    return { vertexCrease: value.vertexCrease, edgeCrease: (id + 1) % corners.length === ids[(index + 1) % 3] ? value.edgeCrease : 0 };
  });
  const [a, b, c] = projected; if (!a || !b || !c) throw new Error("변형의 삼각형 속성이 없습니다.");
  return { materialSlot: surface.materialSlot, smooth: surface.smooth, corners: [a, b, c] };
}

export function reverseStudioModifierSurface(surface: StudioModifierTriangleSurface): StudioModifierTriangleSurface {
  const [a, b, c] = surface.corners;
  return { ...surface, corners: [
    { vertexCrease: a.vertexCrease, edgeCrease: c.edgeCrease },
    { vertexCrease: c.vertexCrease, edgeCrease: b.edgeCrease },
    { vertexCrease: b.vertexCrease, edgeCrease: a.edgeCrease },
  ] };
}

/** 기존 clip의 prev→current 분기·t를 그대로 사용하고 새 절단 경계의 crease는 0으로 둔다. */
export function clipStudioModifierTriangleSurface(
  triangle: readonly (readonly number[])[], axis: number, surface: StudioModifierTriangleSurface,
): readonly StudioModifierSurfaceCorner[] {
  const corners: StudioModifierSurfaceCorner[] = [];
  for (let index = 0; index < triangle.length; index += 1) {
    const previous = (index + triangle.length - 1) % triangle.length;
    const currentDistance = triangle[index]?.[axis] ?? 0, previousDistance = triangle[previous]?.[axis] ?? 0;
    const currentInside = currentDistance >= 0, previousInside = previousDistance >= 0;
    const a = surface.corners[previous], b = surface.corners[index];
    if (!a || !b) throw new Error("대칭 절단의 원본 속성 코너가 없습니다.");
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance, t = denominator === 0 ? 0 : previousDistance / denominator;
      corners.push({ vertexCrease: t === 0 ? a.vertexCrease : t === 1 ? b.vertexCrease : 0,
        edgeCrease: currentInside ? a.edgeCrease : 0 });
    }
    if (currentInside) corners.push(b);
  }
  return corners;
}

/** shell은 원본 면 속성을, rim은 그 경계를 소유한 원본 면 속성을 상속한다. */
export function solidifyStudioModifierSurfaces(
  surfaces: readonly StudioModifierTriangleSurface[], indices: Uint32Array,
  boundary: readonly { readonly a: number; readonly b: number }[],
): readonly StudioModifierTriangleSurface[] {
  const output: StudioModifierTriangleSurface[] = [];
  const edges = new Map<string, { readonly surface: StudioModifierTriangleSurface; readonly a: StudioModifierSurfaceCorner; readonly b: StudioModifierSurfaceCorner }>();
  for (const [index, surface] of surfaces.entries()) {
    output.push(surface, reverseStudioModifierSurface(surface));
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) edges.set(`${indices[index * 3 + a]}|${indices[index * 3 + b]}`, { surface, a: surface.corners[a], b: surface.corners[b] });
  }
  for (const edge of boundary) {
    const source = edges.get(`${edge.a}|${edge.b}`); if (!source) throw new Error("두께 rim의 원본 면 속성을 확인할 수 없습니다.");
    const crease = source.a.edgeCrease;
    const corners = [
      { vertexCrease: source.a.vertexCrease, edgeCrease: 0 }, { vertexCrease: source.a.vertexCrease, edgeCrease: crease },
      { vertexCrease: source.b.vertexCrease, edgeCrease: 0 }, { vertexCrease: source.b.vertexCrease, edgeCrease: crease },
    ];
    output.push(studioModifierSurfaceFan(source.surface, corners, [0, 1, 2]), studioModifierSurfaceFan(source.surface, corners, [0, 2, 3]));
  }
  return output;
}

export function applyStudioModifierSurfaceAttributes(mesh: StudioEditableMesh, indices: Uint32Array, surfaces: readonly StudioModifierTriangleSurface[]): StudioEditableMesh {
  if (surfaces.length !== mesh.faces.length || indices.length !== surfaces.length * 3) throw new Error("생성 면과 원본 속성 대응 수가 다릅니다.");
  const vertexCreases = new Map<number, number>();
  const halfEdges = mesh.halfEdges.map((edge, index) => {
    const surface = surfaces[Math.floor(index / 3)], corner = surface?.corners[index % 3];
    const previous = mesh.halfEdges[edge.prev], vertexId = previous?.vertex;
    if (!corner || vertexId === undefined || vertexId !== indices[index]) throw new Error("생성 코너의 속성 provenance가 다릅니다.");
    const old = vertexCreases.get(vertexId);
    if (old !== undefined && old !== corner.vertexCrease) throw new Error("합쳐진 정점의 서로 다른 crease 속성을 보존할 수 없습니다.");
    vertexCreases.set(vertexId, corner.vertexCrease);
    return edge.crease === corner.edgeCrease ? edge : { ...edge, crease: corner.edgeCrease };
  });
  return { ...mesh,
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: vertexCreases.get(vertex.id) ?? vertex.crease })), halfEdges,
    faces: mesh.faces.map((face) => {
      const source = surfaces[face.id]; if (!source || !Number.isSafeInteger(source.materialSlot) || source.materialSlot < 0 || typeof source.smooth !== "boolean") throw new Error("생성 면의 재질·음영 속성이 올바르지 않습니다.");
      return { ...face, materialSlot: source.materialSlot, smooth: source.smooth };
    }),
  };
}

/** 무UV 모델도 속성 전파의 배열·Map·코너 할당을 기존 누적 예산에 청구한다. */
export function studioModifierSurfaceBudget(mesh: StudioEditableMesh, indexCount: number, modifier: StudioMeshModifier): { readonly bytes: number; readonly workUnits: number } | undefined {
  const copies = modifier.kind === "array" ? modifier.count : modifier.kind === "mirror" ? modifier.bisect ? 4 : 2
    : modifier.kind === "solidify" && modifier.thickness !== 0 ? 4 : modifier.kind === "simple-deform" ? 1 : modifier.kind === "subdivision" ? 4 ** modifier.levels : undefined;
  if (copies === undefined) return undefined;
  return { bytes: indexCount * (64 + copies * 96) + mesh.vertices.length * 32,
    workUnits: mesh.halfEdges.length * 2 + indexCount * (6 + copies * 6) };
}
