/**
 * Pure mesh export adapters — STL ASCII, OBJ, PLY ASCII from editable half-edge.
 * Complements import adapters; loss-report friendly (no materials/rig).
 */

import {
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { readStudioMeshFaceLoops } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";
import { STUDIO_NATIVE_OBJ_MAX_POLYGON_WORK, studioNativeObjPolygonLoops } from "../hybrid-dcc/native-import/studio-hybrid-dcc-native-obj-polygons";
import { sha256HexPortable } from "../studio-sha256";

export const STUDIO_MESH_EXPORT_ADAPTERS_REVISION = 1 as const;

export type StudioMeshExportFormat = "stl" | "obj" | "ply";

export type StudioMeshExportResult = {
  readonly format: StudioMeshExportFormat;
  readonly text: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly contentHash: `sha256:${string}`;
};

function soupStats(mesh: StudioEditableMesh) {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  return {
    soup,
    vertexCount: soup.positions.length / 3,
    triangleCount: soup.indices.length / 3,
  };
}

function finish(
  format: StudioMeshExportFormat,
  text: string,
  vertexCount: number,
  triangleCount: number,
): StudioMeshExportResult {
  return {
    format,
    text,
    vertexCount,
    triangleCount,
    contentHash: `sha256:${sha256HexPortable(new TextEncoder().encode(text))}`,
  };
}

export function exportStudioMeshStlAscii(
  mesh: StudioEditableMesh,
  solidName = "toonstudio",
): StudioMeshExportResult {
  const { soup, vertexCount, triangleCount } = soupStats(mesh);
  const lines = [`solid ${solidName}`];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const ia = soup.indices[t]!;
    const ib = soup.indices[t + 1]!;
    const ic = soup.indices[t + 2]!;
    const ax = soup.positions[ia * 3]!;
    const ay = soup.positions[ia * 3 + 1]!;
    const az = soup.positions[ia * 3 + 2]!;
    const bx = soup.positions[ib * 3]!;
    const by = soup.positions[ib * 3 + 1]!;
    const bz = soup.positions[ib * 3 + 2]!;
    const cx = soup.positions[ic * 3]!;
    const cy = soup.positions[ic * 3 + 1]!;
    const cz = soup.positions[ic * 3 + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    lines.push(` facet normal ${nx} ${ny} ${nz}`);
    lines.push("  outer loop");
    lines.push(`   vertex ${ax} ${ay} ${az}`);
    lines.push(`   vertex ${bx} ${by} ${bz}`);
    lines.push(`   vertex ${cx} ${cy} ${cz}`);
    lines.push("  endloop");
    lines.push(" endfacet");
  }
  lines.push(`endsolid ${solidName}`);
  return finish("stl", lines.join("\n"), vertexCount, triangleCount);
}

/** 편집기가 원본 다각면을 읽을 수 있는지 확인하면서 실제 가져오기와 같은 작업량을 센다. */
function readableObjPolygonWork(points: readonly (readonly [number, number, number])[], available: number): number | null {
  let work = 0;
  try {
    studioNativeObjPolygonLoops(points, {
      spend(amount = 1) {
        work += amount;
        if (work > available) throw new RangeError("OBJ 다각면을 다시 열 때 필요한 작업량이 한도를 넘었습니다.");
      },
    });
    return work;
  } catch {
    return null;
  }
}

export function exportStudioMeshObj(
  mesh: StudioEditableMesh,
  objectName = "mesh",
): StudioMeshExportResult {
  const faces = readStudioMeshFaceLoops(mesh);
  if (!faces) throw new Error("OBJ로 저장할 메시의 면 순환이 올바르지 않습니다.");
  const lines = [`# ToonStudio OBJ export`, `o ${objectName}`];
  const verticesById = new Map(mesh.vertices.map(({ id, position }, index) => [
    id, { number: index + 1, point: [position.x, position.y, position.z] as const },
  ] as const));
  for (const { position } of mesh.vertices) {
    lines.push(`v ${position.x} ${position.y} ${position.z}`);
  }
  const uvCorners = mesh.uvLayer?.corners;
  if (uvCorners && uvCorners.length !== mesh.halfEdges.length) {
    throw new Error("OBJ로 저장할 메시의 UV 코너 수가 면 위상과 다릅니다.");
  }
  for (const [index, corner] of (uvCorners ?? []).entries()) {
    if (corner?.halfEdgeId !== index || !Number.isFinite(corner.u) || !Number.isFinite(corner.v)) {
      throw new Error("OBJ로 저장할 메시의 UV 코너가 올바르지 않습니다.");
    }
    lines.push(`vt ${corner.u} ${corner.v}`);
  }
  let previousSmooth = false;
  const triangleCount = faces.reduce((count, face) => count + face.vertexIds.length - 2, 0);
  // 뒤쪽 면을 모두 삼각형으로 읽는 데 필요한 작업량(삼각형당 3×3)은 미리 남긴다.
  let spareWork = STUDIO_NATIVE_OBJ_MAX_POLYGON_WORK - triangleCount * 9;
  for (const face of faces) {
    if (face.smooth !== previousSmooth) {
      lines.push(face.smooth ? "s 1" : "s off");
      previousSmooth = face.smooth;
    }
    const vertices = face.vertexIds.map((vertexId) => {
      const vertex = verticesById.get(vertexId);
      if (vertex === undefined) throw new Error("OBJ로 저장할 면의 정점이 없습니다.");
      return vertex;
    });
    const corners = vertices.map(({ number }, index) => {
      if (!uvCorners) return String(number);
      const edgeId = face.halfEdgeIds[index];
      if (edgeId === undefined || !uvCorners[edgeId]) {
        throw new Error("OBJ로 저장할 면의 UV 코너가 없습니다.");
      }
      return `${number}/${edgeId + 1}`;
    });
    const fanWork = (corners.length - 2) * 9;
    const work = corners.length === 3 ? fanWork : readableObjPolygonWork(
      vertices.map(({ point }) => point), spareWork + fanWork,
    );
    if (work !== null) {
      lines.push(`f ${corners.join(" ")}`);
      spareWork += fanWork - work;
    } else {
      // 비평면 n각형·처리 예산 밖의 면은 기존 렌더 fan으로 쓰고 각 삼각형에도 원본 UV 코너를 연결한다.
      for (let index = 1; index + 1 < corners.length; index += 1) {
        lines.push(`f ${corners[0]} ${corners[index]} ${corners[index + 1]}`);
      }
    }
  }
  return finish("obj", lines.join("\n"), mesh.vertices.length, triangleCount);
}

export function exportStudioMeshPlyAscii(mesh: StudioEditableMesh): StudioMeshExportResult {
  const { soup, vertexCount, triangleCount } = soupStats(mesh);
  const lines = [
    "ply",
    "format ascii 1.0",
    `element vertex ${vertexCount}`,
    "property float x",
    "property float y",
    "property float z",
    `element face ${triangleCount}`,
    "property list uchar int vertex_indices",
    "end_header",
  ];
  for (let i = 0; i < soup.positions.length; i += 3) {
    lines.push(
      `${soup.positions[i]!} ${soup.positions[i + 1]!} ${soup.positions[i + 2]!}`,
    );
  }
  for (let t = 0; t < soup.indices.length; t += 3) {
    lines.push(
      `3 ${soup.indices[t]!} ${soup.indices[t + 1]!} ${soup.indices[t + 2]!}`,
    );
  }
  return finish("ply", lines.join("\n"), vertexCount, triangleCount);
}

export function exportStudioMeshByFormat(
  mesh: StudioEditableMesh,
  format: StudioMeshExportFormat,
): StudioMeshExportResult {
  if (format === "stl") return exportStudioMeshStlAscii(mesh);
  if (format === "obj") return exportStudioMeshObj(mesh);
  return exportStudioMeshPlyAscii(mesh);
}
