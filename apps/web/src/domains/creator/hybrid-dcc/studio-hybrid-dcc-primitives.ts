/**
 * 정밀 3D 모델러(Hybrid DCC)용 즉시 생성 기본 도형(Primitives), Blender 5.2 CC0 키트 메타데이터,
 * 그리고 활성 메시의 실측 바운딩 치수·위상 무결성(Manifold/Watertight) 요약 계산기.
 */

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { createStudioHybridDccIdentityTransform } from "./studio-hybrid-dcc-object-transform";
import {
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

export type StudioHybridDccStarterPrimitiveKind =
  | "cube"
  | "sphere"
  | "sculpt-sphere"
  | "cylinder"
  | "cone"
  | "torus"
  | "grid"
  | "arch";

export interface StudioHybridDccStarterPrimitiveSpec {
  readonly kind: StudioHybridDccStarterPrimitiveKind;
  readonly assetPrefix: string;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
}

export const STUDIO_HYBRID_DCC_STARTER_PRIMITIVES: readonly StudioHybridDccStarterPrimitiveSpec[] =
  Object.freeze([
    {
      kind: "cube",
      assetPrefix: "asset-cube",
      label: ["큐브", "Cube"],
      hint: ["가구·건물 블록 시작", "Box blockout"],
    },
    {
      kind: "sculpt-sphere",
      assetPrefix: "asset-sculpt-sphere",
      label: ["조형 구체", "Sculpt sphere"],
      hint: ["균일 사각면 조형 베이스", "Quad-sphere for sculpting"],
    },
    {
      kind: "sphere",
      assetPrefix: "asset-sphere",
      label: ["UV 구체", "UV sphere"],
      hint: ["둥근 소품·조명 구체", "Round props & lamps"],
    },
    {
      kind: "cylinder",
      assetPrefix: "asset-cylinder",
      label: ["원기둥", "Cylinder"],
      hint: ["기둥·컵·가로등 봉", "Pillars, cups & poles"],
    },
    {
      kind: "cone",
      assetPrefix: "asset-cone",
      label: ["원뿔", "Cone"],
      hint: ["지붕·고깔·화살표", "Roofs & tapered tips"],
    },
    {
      kind: "torus",
      assetPrefix: "asset-torus",
      label: ["토러스", "Torus"],
      hint: ["고리·손잡이·타이어", "Rings & handles"],
    },
    {
      kind: "arch",
      assetPrefix: "asset-arch",
      label: ["아치 블록", "Arch"],
      hint: ["창문·회랑·대문 아치", "Doorways & arcades"],
    },
    {
      kind: "grid",
      assetPrefix: "asset-grid",
      label: ["분할 평면", "Grid plane"],
      hint: ["바닥·지형·천 시뮬레이션", "Floor, terrain & cloth"],
    },
  ]);

export interface StudioHybridDccBlenderKitItem {
  readonly id: string;
  readonly fileName: string;
  readonly glbUrl: string;
  readonly previewUrl: string;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
  readonly triangles: number;
}

export const STUDIO_HYBRID_DCC_BLENDER_V13_KIT: readonly StudioHybridDccBlenderKitItem[] =
  Object.freeze([
    {
      id: "webtoon-sculpt-head-basemesh-v13",
      fileName: "webtoon-sculpt-head-basemesh-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-sculpt-head-basemesh-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-sculpt-head-basemesh-v13.png",
      label: ["두상 조형 베이스", "Head basemesh"],
      hint: ["캐릭터 두상·목 스컬프팅", "Stylized head & neck"],
      triangles: 1916,
    },
    {
      id: "webtoon-modular-arch-window-v13",
      fileName: "webtoon-modular-arch-window-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-modular-arch-window-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-modular-arch-window-v13.png",
      label: ["아치 창문 모듈", "Arch window"],
      hint: ["유럽풍·판타지 벽면 모듈", "Modular stone arch wall"],
      triangles: 952,
    },
    {
      id: "webtoon-spiral-stair-core-v13",
      fileName: "webtoon-spiral-stair-core-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-spiral-stair-core-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-spiral-stair-core-v13.png",
      label: ["나선 계단 코어", "Spiral stair"],
      hint: ["탑·복층 실내 계단", "Tower & loft stair"],
      triangles: 1580,
    },
    {
      id: "webtoon-street-bench-lamp-v13",
      fileName: "webtoon-street-bench-lamp-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-street-bench-lamp-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-street-bench-lamp-v13.png",
      label: ["거리 벤치·가로등", "Bench & lamp"],
      hint: ["학원물·공원 야외 세트", "Park & street prop set"],
      triangles: 948,
    },
  ]);

function vec(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

function withSmoothShading(mesh: StudioEditableMesh, smooth: boolean): StudioEditableMesh {
  return {
    ...mesh,
    faces: mesh.faces.map((face) => ({ ...face, smooth })),
  };
}

/** 극점 쏠림이 없는 균일 6면 분할 사각 구체(Quad-sphere). 조형 시작용 기본 메시. */
function buildSculptQuadSphereMesh(radius = 0.6, divisions = 6): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  const vertexByKey = new Map<string, number>();
  const faces: number[][] = [];
  const patches: readonly {
    readonly origin: readonly [number, number, number];
    readonly uAxis: readonly [number, number, number];
    readonly vAxis: readonly [number, number, number];
  }[] = [
    { origin: [-divisions, -divisions, divisions], uAxis: [2, 0, 0], vAxis: [0, 2, 0] }, // +Z
    { origin: [divisions, -divisions, -divisions], uAxis: [-2, 0, 0], vAxis: [0, 2, 0] }, // -Z
    { origin: [divisions, -divisions, divisions], uAxis: [0, 0, -2], vAxis: [0, 2, 0] }, // +X
    { origin: [-divisions, -divisions, -divisions], uAxis: [0, 0, 2], vAxis: [0, 2, 0] }, // -X
    { origin: [-divisions, divisions, divisions], uAxis: [2, 0, 0], vAxis: [0, 0, -2] }, // +Y
    { origin: [-divisions, -divisions, -divisions], uAxis: [2, 0, 0], vAxis: [0, 0, 2] }, // -Y
  ];

  const vertexIndex = (gx: number, gy: number, gz: number): number => {
    const key = `${gx}|${gy}|${gz}`;
    const existing = vertexByKey.get(key);
    if (existing !== undefined) return existing;
    const nx = gx / divisions;
    const ny = gy / divisions;
    const nz = gz / divisions;
    // 탄젠트 왜곡을 줄이는 구면 투영
    const sx = nx * Math.sqrt(Math.max(0, 1 - (ny * ny) / 2 - (nz * nz) / 2 + (ny * ny * nz * nz) / 3));
    const sy = ny * Math.sqrt(Math.max(0, 1 - (nz * nz) / 2 - (nx * nx) / 2 + (nz * nz * nx * nx) / 3));
    const sz = nz * Math.sqrt(Math.max(0, 1 - (nx * nx) / 2 - (ny * ny) / 2 + (nx * nx * ny * ny) / 3));
    const length = Math.hypot(sx, sy, sz) || 1;
    const created = positions.length;
    positions.push(vec((sx / length) * radius, (sy / length) * radius, (sz / length) * radius));
    vertexByKey.set(key, created);
    return created;
  };

  for (const patch of patches) {
    const grid = (iu: number, iv: number): number =>
      vertexIndex(
        patch.origin[0] + patch.uAxis[0] * iu + patch.vAxis[0] * iv,
        patch.origin[1] + patch.uAxis[1] * iu + patch.vAxis[1] * iv,
        patch.origin[2] + patch.uAxis[2] * iu + patch.vAxis[2] * iv,
      );
    for (let iv = 0; iv < divisions; iv += 1) {
      for (let iu = 0; iu < divisions; iu += 1) {
        faces.push([grid(iu, iv), grid(iu + 1, iv), grid(iu + 1, iv + 1), grid(iu, iv + 1)]);
      }
    }
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), true);
}

function buildUvSphereMesh(radius = 0.55, lonSegs = 16, latSegs = 10): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [vec(0, -radius, 0)];
  for (let lat = 1; lat < latSegs; lat += 1) {
    const phi = -Math.PI / 2 + (lat * Math.PI) / latSegs;
    const ringRadius = radius * Math.cos(phi);
    const y = radius * Math.sin(phi);
    for (let lon = 0; lon < lonSegs; lon += 1) {
      const theta = (lon * Math.PI * 2) / lonSegs;
      positions.push(vec(ringRadius * Math.cos(theta), y, -ringRadius * Math.sin(theta)));
    }
  }
  const topPole = positions.length;
  positions.push(vec(0, radius, 0));

  const ringIndex = (lat: number, lon: number): number => 1 + (lat - 1) * lonSegs + (lon % lonSegs);
  const faces: number[][] = [];
  for (let lon = 0; lon < lonSegs; lon += 1) {
    faces.push([0, ringIndex(1, lon + 1), ringIndex(1, lon)]);
  }
  for (let lat = 1; lat < latSegs - 1; lat += 1) {
    for (let lon = 0; lon < lonSegs; lon += 1) {
      faces.push([
        ringIndex(lat, lon),
        ringIndex(lat, lon + 1),
        ringIndex(lat + 1, lon + 1),
        ringIndex(lat + 1, lon),
      ]);
    }
  }
  const lastLat = latSegs - 1;
  for (let lon = 0; lon < lonSegs; lon += 1) {
    faces.push([ringIndex(lastLat, lon), ringIndex(lastLat, lon + 1), topPole]);
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), true);
}

function buildCylinderMesh(radius = 0.45, halfHeight = 0.55, segs = 16): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  for (let s = 0; s < segs; s += 1) {
    const theta = (s * Math.PI * 2) / segs;
    positions.push(vec(radius * Math.cos(theta), -halfHeight, -radius * Math.sin(theta)));
  }
  for (let s = 0; s < segs; s += 1) {
    const theta = (s * Math.PI * 2) / segs;
    positions.push(vec(radius * Math.cos(theta), halfHeight, -radius * Math.sin(theta)));
  }
  const bottom = (s: number): number => s % segs;
  const top = (s: number): number => segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) {
    faces.push([bottom(s), bottom(s + 1), top(s + 1), top(s)]);
  }
  faces.push(Array.from({ length: segs }, (_, s) => top(s)));
  faces.push(Array.from({ length: segs }, (_, s) => bottom(segs - 1 - s)));
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

function buildConeMesh(radius = 0.5, halfHeight = 0.55, segs = 16): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  for (let s = 0; s < segs; s += 1) {
    const theta = (s * Math.PI * 2) / segs;
    positions.push(vec(radius * Math.cos(theta), -halfHeight, -radius * Math.sin(theta)));
  }
  const apex = positions.length;
  positions.push(vec(0, halfHeight, 0));
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) {
    faces.push([s, (s + 1) % segs, apex]);
  }
  faces.push(Array.from({ length: segs }, (_, s) => segs - 1 - s));
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

function buildTorusMesh(majorRadius = 0.5, minorRadius = 0.18, majorSegs = 16, minorSegs = 10): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  for (let i = 0; i < majorSegs; i += 1) {
    const u = (i * Math.PI * 2) / majorSegs;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    for (let j = 0; j < minorSegs; j += 1) {
      const v = (j * Math.PI * 2) / minorSegs;
      const ring = majorRadius + minorRadius * Math.cos(v);
      positions.push(vec(ring * cosU, minorRadius * Math.sin(v), -ring * sinU));
    }
  }
  const idx = (i: number, j: number): number => (i % majorSegs) * minorSegs + (j % minorSegs);
  const faces: number[][] = [];
  for (let i = 0; i < majorSegs; i += 1) {
    for (let j = 0; j < minorSegs; j += 1) {
      faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
    }
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), true);
}

function buildGridMesh(size = 1.6, divisions = 4): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  const half = size * 0.5;
  const step = size / divisions;
  for (let iz = 0; iz <= divisions; iz += 1) {
    for (let ix = 0; ix <= divisions; ix += 1) {
      positions.push(vec(-half + ix * step, 0, -half + iz * step));
    }
  }
  const idx = (ix: number, iz: number): number => iz * (divisions + 1) + ix;
  const faces: number[][] = [];
  for (let iz = 0; iz < divisions; iz += 1) {
    for (let ix = 0; ix < divisions; ix += 1) {
      faces.push([idx(ix, iz), idx(ix, iz + 1), idx(ix + 1, iz + 1), idx(ix + 1, iz)]);
    }
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

function buildArchMesh(archSegs = 8): StudioEditableMesh {
  const innerRadius = 0.34;
  const outerRadius = 0.58;
  const baseY = -0.55;
  const springY = 0.1;
  const halfDepth = 0.18;
  const stations: Array<{ readonly inX: number; readonly inY: number; readonly outX: number; readonly outY: number }> = [
    { inX: -innerRadius, inY: baseY, outX: -outerRadius, outY: baseY },
  ];
  for (let k = 0; k <= archSegs; k += 1) {
    const angle = Math.PI * (1 - k / archSegs);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    stations.push({
      inX: innerRadius * cosA,
      inY: springY + innerRadius * sinA,
      outX: outerRadius * cosA,
      outY: springY + outerRadius * sinA,
    });
  }
  stations.push({ inX: innerRadius, inY: baseY, outX: outerRadius, outY: baseY });

  const positions: StudioMeshVec3[] = [];
  for (const station of stations) {
    positions.push(
      vec(station.inX, station.inY, halfDepth),
      vec(station.outX, station.outY, halfDepth),
      vec(station.inX, station.inY, -halfDepth),
      vec(station.outX, station.outY, -halfDepth),
    );
  }
  const innerFront = (k: number): number => k * 4;
  const outerFront = (k: number): number => k * 4 + 1;
  const innerBack = (k: number): number => k * 4 + 2;
  const outerBack = (k: number): number => k * 4 + 3;
  const last = stations.length - 1;
  const faces: number[][] = [];
  for (let k = 0; k < last; k += 1) {
    faces.push(
      [outerFront(k), innerFront(k), innerFront(k + 1), outerFront(k + 1)],
      [outerBack(k), outerBack(k + 1), innerBack(k + 1), innerBack(k)],
      [outerFront(k), outerFront(k + 1), outerBack(k + 1), outerBack(k)],
      [innerFront(k), innerBack(k), innerBack(k + 1), innerFront(k + 1)],
    );
  }
  faces.push(
    [outerFront(0), outerBack(0), innerBack(0), innerFront(0)],
    [innerFront(last), innerBack(last), outerBack(last), outerFront(last)],
  );
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

export function createStudioHybridDccStarterPrimitiveMesh(
  kind: StudioHybridDccStarterPrimitiveKind,
): StudioEditableMesh {
  switch (kind) {
    case "cube":
      return createStudioUnitCubeMesh();
    case "sculpt-sphere":
      return buildSculptQuadSphereMesh();
    case "sphere":
      return buildUvSphereMesh();
    case "cylinder":
      return buildCylinderMesh();
    case "cone":
      return buildConeMesh();
    case "torus":
      return buildTorusMesh();
    case "grid":
      return buildGridMesh();
    case "arch":
      return buildArchMesh();
  }
}

function nextStarterAssetId(ws: StudioHybridDccWorkspace, prefix: string): string {
  const records = ws.session.state.geometry.records;
  if (!Object.hasOwn(records, prefix)) return prefix;
  let seq = 2;
  while (Object.hasOwn(records, `${prefix}-${seq}`)) seq += 1;
  return `${prefix}-${seq}`;
}

export function workspaceAddStarterPrimitive(
  ws: StudioHybridDccWorkspace,
  kind: StudioHybridDccStarterPrimitiveKind,
  assetId?: string,
): StudioHybridDccWorkspace {
  if (kind === "cube") return workspaceAddUnitCube(ws, assetId);
  const spec = STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.find((entry) => entry.kind === kind);
  const prefix = spec?.assetPrefix ?? `asset-${kind}`;
  const resolvedId = assetId ?? nextStarterAssetId(ws, prefix);
  const existingCount = assetId === undefined ? Object.keys(ws.session.state.geometry.records).length : 0;
  const baseTransform = createStudioHybridDccIdentityTransform();
  const mesh = createStudioHybridDccStarterPrimitiveMesh(kind);
  const session = hybridDccRegisterAsset(
    ws.session,
    resolvedId,
    mesh,
    {
      source: "primitive",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    },
    existingCount === 0
      ? baseTransform
      : {
          ...baseTransform,
          position: [existingCount * 1.35, 0, 0],
        },
  );
  return {
    ...synchronizeWorkspaceGeometryAuthority(ws, session),
    activeAssetId: resolvedId,
  };
}

export interface StudioHybridDccMeshQualitySummary {
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly halfEdgeCount: number;
  readonly triangleEstimate: number;
  readonly boundaryHalfEdgeCount: number;
  readonly isWatertight: boolean;
  readonly hasUv: boolean;
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
}

export function computeStudioHybridDccMeshQualitySummary(
  mesh: StudioEditableMesh,
): StudioHybridDccMeshQualitySummary {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const vertex of mesh.vertices) {
    const { x, y, z } = vertex.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const hasVertices = mesh.vertices.length > 0 && Number.isFinite(minX);
  let boundaryHalfEdgeCount = 0;
  let faceHalfEdgeCount = 0;
  for (const halfEdge of mesh.halfEdges) {
    if (halfEdge.twin < 0) boundaryHalfEdgeCount += 1;
    if (halfEdge.face >= 0) faceHalfEdgeCount += 1;
  }
  const triangleEstimate = Math.max(0, faceHalfEdgeCount - mesh.faces.length * 2);
  return {
    vertexCount: mesh.vertices.length,
    faceCount: mesh.faces.length,
    halfEdgeCount: mesh.halfEdges.length,
    triangleEstimate,
    boundaryHalfEdgeCount,
    isWatertight: mesh.faces.length > 0 && boundaryHalfEdgeCount === 0,
    hasUv: Boolean(mesh.uvLayer),
    dimensions: {
      width: hasVertices ? Math.max(0, maxX - minX) : 0,
      height: hasVertices ? Math.max(0, maxY - minY) : 0,
      depth: hasVertices ? Math.max(0, maxZ - minZ) : 0,
    },
  };
}
