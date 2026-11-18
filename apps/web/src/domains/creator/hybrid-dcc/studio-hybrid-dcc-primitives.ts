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
import {
  buildDoorwayPortalWallMesh,
  buildFacetedGemPrismMesh,
  buildLotusPagodaLanternMesh,
  buildMoldedPlinthMesh,
  buildOctagonalPillarMesh,
  buildRibbedConservatoryDomeMesh,
  buildTurnedGobletPedestalMesh,
  buildWindowWallModuleMesh,
  STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT,
  type StudioHybridDccPrecisionBgKitItem,
} from "./studio-hybrid-dcc-architectural-primitives";
import { createStudioHybridDccIdentityTransform } from "./studio-hybrid-dcc-object-transform";
import {
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

export {
  STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT,
  type StudioHybridDccPrecisionBgKitItem,
};

export type StudioHybridDccStarterPrimitiveKind =
  | "cube"
  | "bevel-box"
  | "sculpt-sphere"
  | "gem-prism"
  | "sphere"
  | "capsule"
  | "cylinder"
  | "column"
  | "octagonal-pillar"
  | "cone"
  | "torus"
  | "arch"
  | "window-wall"
  | "doorway-frame"
  | "molded-plinth"
  | "ribbed-dome"
  | "turned-goblet"
  | "lotus-lantern"
  | "stairs"
  | "grid";

export interface StudioHybridDccStarterPrimitiveSpec {
  readonly kind: StudioHybridDccStarterPrimitiveKind;
  readonly assetPrefix: string;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
}

export const STUDIO_HYBRID_DCC_STARTER_PRIMITIVES: readonly StudioHybridDccStarterPrimitiveSpec[] =
  Object.freeze([
    { kind: "cube", assetPrefix: "asset-cube", label: ["큐브", "Cube"], hint: ["가구·건물 블록 시작", "Box blockout"] },
    { kind: "bevel-box", assetPrefix: "asset-bevel-box", label: ["챔퍼 박스", "Chamfer box"], hint: ["하이라이트 모따기 블록", "26-face chamfered solid"] },
    { kind: "sculpt-sphere", assetPrefix: "asset-sculpt-sphere", label: ["조형 구체", "Sculpt sphere"], hint: ["균일 사각면 조형 베이스", "Quad-sphere for sculpting"] },
    { kind: "gem-prism", assetPrefix: "asset-gem-prism", label: ["보석 프리즘", "Gem prism"], hint: ["브릴리언트 컷 굴절 수정체", "Brilliant-cut crystal solid"] },
    { kind: "capsule", assetPrefix: "asset-capsule", label: ["캡슐", "Capsule"], hint: ["팔다리·관절·쿠션 기본형", "Limbs, joints & bolsters"] },
    { kind: "sphere", assetPrefix: "asset-sphere", label: ["UV 구체", "UV sphere"], hint: ["둥근 소품·조명 구체", "Round props & lamps"] },
    { kind: "cylinder", assetPrefix: "asset-cylinder", label: ["원기둥", "Cylinder"], hint: ["컵·파이프·가로등 봉", "Cups, pipes & poles"] },
    { kind: "column", assetPrefix: "asset-column", label: ["플루티드 기둥", "Fluted column"], hint: ["주초·골기둥·주두 일체형", "Classical architectural pillar"] },
    { kind: "octagonal-pillar", assetPrefix: "asset-octagonal-pillar", label: ["8각 챔퍼 기둥", "Octagonal pillar"], hint: ["지하철·성당 구조 기둥", "8-sided chamfered column"] },
    { kind: "cone", assetPrefix: "asset-cone", label: ["원뿔", "Cone"], hint: ["지붕·고깔·첨탑", "Roofs & spires"] },
    { kind: "torus", assetPrefix: "asset-torus", label: ["토러스", "Torus"], hint: ["고리·손잡이·타이어", "Rings & handles"] },
    { kind: "arch", assetPrefix: "asset-arch", label: ["아치 블록", "Arch"], hint: ["창문·회랑·대문 아치", "Doorways & arcades"] },
    { kind: "window-wall", assetPrefix: "asset-window-wall", label: ["창호 개구부 벽", "Window wall"], hint: ["2.0m 창턱 내장 수밀 벽체", "Watertight window wall"] },
    { kind: "doorway-frame", assetPrefix: "asset-doorway-frame", label: ["문틀 포털 벽", "Doorway wall"], hint: ["문설주·상인방·문지방 벽체", "Watertight portal wall"] },
    { kind: "molded-plinth", assetPrefix: "asset-molded-plinth", label: ["다단 몰딩 기단", "Molded plinth"], hint: ["제단·동상·외벽 코니스 기단", "Multi-stepped plinth"] },
    { kind: "ribbed-dome", assetPrefix: "asset-ribbed-dome", label: ["리브 온실 돔", "Ribbed dome"], hint: ["12각 드럼 기단·반구형 지붕 돔", "12-rib watertight architectural dome"] },
    { kind: "turned-goblet", assetPrefix: "asset-turned-goblet", label: ["세공 성배·화병", "Turned goblet"], hint: ["로판 다과·성소 의식용 선반 기물", "Watertight lathe chalice & urn"] },
    { kind: "lotus-lantern", assetPrefix: "asset-lotus-lantern", label: ["연꽃 석등·정자 지붕", "Lotus lantern"], hint: ["8각 연화대좌·처마 옥개석 코어", "Octagonal Hanok lantern & roof"] },
    { kind: "stairs", assetPrefix: "asset-stairs", label: ["직선 계단", "Block stairs"], hint: ["실내·복층 수밀 계단 블록", "5-step watertight stair"] },
    { kind: "grid", assetPrefix: "asset-grid", label: ["분할 평면", "Grid plane"], hint: ["바닥·지형·천 시뮬레이션", "Floor, terrain & cloth"] },
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
      label: ["두상·흉상 조형 베이스", "Head & bust basemesh"],
      hint: ["서브서프 쿼드 두상·쇄골·페데스탈", "Subsurf quad head & bust"],
      triangles: 7548,
    },
    {
      id: "webtoon-modular-arch-window-v13",
      fileName: "webtoon-modular-arch-window-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-modular-arch-window-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-modular-arch-window-v13.png",
      label: ["고딕 아치 창호 모듈", "Gothic arch window"],
      hint: ["로제트 트레이서리·플루티드 석조", "Stone arch & rosette tracery"],
      triangles: 4624,
    },
    {
      id: "webtoon-spiral-stair-core-v13",
      fileName: "webtoon-spiral-stair-core-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-spiral-stair-core-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-spiral-stair-core-v13.png",
      label: ["나선 계단·황동 난간", "Spiral stair core"],
      hint: ["12단 오크 디딤판·플루티드 중심주", "12-step oak & brass stair"],
      triangles: 8620,
    },
    {
      id: "webtoon-street-bench-lamp-v13",
      fileName: "webtoon-street-bench-lamp-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-street-bench-lamp-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-street-bench-lamp-v13.png",
      label: ["거리 벤치·빅토리안 가로등", "Bench & Victorian lamp"],
      hint: ["볼류트 주철 벤치·6각 랜턴 세트", "Park bench & street lamp"],
      triangles: 4608,
    },
    {
      id: "webtoon-ornate-clocktower-gear-core-v13",
      fileName: "webtoon-ornate-clocktower-gear-core-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-ornate-clocktower-gear-core-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-ornate-clocktower-gear-core-v13.png",
      label: ["시계탑 기어·아스트롤라베", "Clockwork gear core"],
      hint: ["인볼류트 황동·적동 맞물림 기어", "Interlocking brass clockwork"],
      triangles: 5976,
    },
    {
      id: "webtoon-hanok-paljak-pavilion-bay-v13",
      fileName: "webtoon-hanok-paljak-pavilion-bay-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-hanok-paljak-pavilion-bay-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-hanok-paljak-pavilion-bay-v13.png",
      label: ["한옥 배흘림기둥·처마 정자", "Hanok pavilion bay"],
      hint: ["화강암 기단·공포·기와·한지 창호", "Traditional Korean Hanok bay"],
      triangles: 7692,
    },
    {
      id: "webtoon-creator-ergonomic-chair-desk-v13",
      fileName: "webtoon-creator-ergonomic-chair-desk-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-creator-ergonomic-chair-desk-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-creator-ergonomic-chair-desk-v13.png",
      label: ["모션데스크·인체공학 체어", "Creator desk & chair"],
      hint: ["액정 펜타블릿·모니터암·5발 체어", "Pen display & ergonomic chair"],
      triangles: 2876,
    },
    {
      id: "webtoon-fantasy-potion-apothecary-cabinet-v13",
      fileName: "webtoon-fantasy-potion-apothecary-cabinet-v13.glb",
      glbUrl: "/studio-assets/blender-modeler-kit-v13/webtoon-fantasy-potion-apothecary-cabinet-v13.glb",
      previewUrl: "/studio-assets/blender-modeler-kit-v13/thumbnails/webtoon-fantasy-potion-apothecary-cabinet-v13.png",
      label: ["연금술 포션 진열장·약재함", "Potion apothecary hutch"],
      hint: ["마호가니 약재함·천칭·엘릭서 병", "Cabinet, scale & glowing vials"],
      triangles: 4200,
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

/** 반구 캡과 원통 몸통이 연속된 닫힌 2-매니폴드 캡슐. */
function buildCapsuleMesh(radius = 0.34, halfBody = 0.30, lonSegs = 16, hemiRings = 5): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [vec(0, -halfBody - radius, 0)];
  const ringSpecs: Array<{ readonly y: number; readonly r: number }> = [];
  for (let r = 1; r <= hemiRings; r += 1) {
    const phi = -Math.PI / 2 + (r / hemiRings) * (Math.PI / 2);
    ringSpecs.push({ y: -halfBody + radius * Math.sin(phi), r: radius * Math.cos(phi) });
  }
  for (let r = 0; r < hemiRings; r += 1) {
    const phi = (r / hemiRings) * (Math.PI / 2);
    ringSpecs.push({ y: halfBody + radius * Math.sin(phi), r: radius * Math.cos(phi) });
  }
  for (const spec of ringSpecs) {
    for (let lon = 0; lon < lonSegs; lon += 1) {
      const theta = (lon * Math.PI * 2) / lonSegs;
      positions.push(vec(spec.r * Math.cos(theta), spec.y, -spec.r * Math.sin(theta)));
    }
  }
  const topPole = positions.length;
  positions.push(vec(0, halfBody + radius, 0));

  const ringIdx = (ring: number, lon: number): number => 1 + ring * lonSegs + (lon % lonSegs);
  const faces: number[][] = [];
  for (let lon = 0; lon < lonSegs; lon += 1) {
    faces.push([0, ringIdx(0, lon + 1), ringIdx(0, lon)]);
  }
  for (let ring = 0; ring < ringSpecs.length - 1; ring += 1) {
    for (let lon = 0; lon < lonSegs; lon += 1) {
      faces.push([ringIdx(ring, lon), ringIdx(ring, lon + 1), ringIdx(ring + 1, lon + 1), ringIdx(ring + 1, lon)]);
    }
  }
  const lastRing = ringSpecs.length - 1;
  for (let lon = 0; lon < lonSegs; lon += 1) {
    faces.push([ringIdx(lastRing, lon), ringIdx(lastRing, lon + 1), topPole]);
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), true);
}

/** 6주축 사각면 + 12모서리 챔퍼 사각면 + 8코너 삼각면으로 구성된 26면 수밀 챔퍼 박스. */
function buildBevelBoxMesh(halfExtent = 0.5, bevel = 0.09): StudioEditableMesh {
  const outer = halfExtent;
  const inner = Math.max(0.05, halfExtent - bevel);
  const positions: StudioMeshVec3[] = [];
  const vKey = new Map<string, number>();
  const addV = (axis: 0 | 1 | 2, signA: -1 | 1, signB: -1 | 1, signC: -1 | 1): number => {
    const k = `${axis}|${signA}|${signB}|${signC}`;
    const found = vKey.get(k);
    if (found !== undefined) return found;
    const coords: [number, number, number] = [0, 0, 0];
    coords[axis] = signA * outer;
    coords[(axis + 1) % 3] = signB * inner;
    coords[(axis + 2) % 3] = signC * inner;
    const idx = positions.length;
    positions.push(vec(coords[0], coords[1], coords[2]));
    vKey.set(k, idx);
    return idx;
  };

  const orientOutward = (loop: number[]): number[] => {
    const p0 = positions[loop[0]!]!;
    const p1 = positions[loop[1]!]!;
    const p2 = positions[loop[2]!]!;
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const dot = nx * p0.x + ny * p0.y + nz * p0.z;
    return dot >= 0 ? loop : [...loop].reverse();
  };

  const faces: number[][] = [];
  const signs: readonly (-1 | 1)[] = [-1, 1];
  // 6 axial main quads
  for (const axis of [0, 1, 2] as const) {
    for (const s of signs) {
      faces.push(orientOutward([addV(axis, s, -1, -1), addV(axis, s, 1, -1), addV(axis, s, 1, 1), addV(axis, s, -1, 1)]));
    }
  }
  // 12 edge chamfer quads (each pair of axes a, b with signs sa, sb; third axis c spans -1..+1)
  for (const axisA of [0, 1, 2] as const) {
    const axisB = ((axisA + 1) % 3) as 0 | 1 | 2;
    const vOnAxis = (primary: 0 | 1 | 2, sp: -1 | 1, other: 0 | 1 | 2, so: -1 | 1, st: -1 | 1): number => {
      if ((primary + 1) % 3 === other) return addV(primary, sp, so, st);
      return addV(primary, sp, st, so);
    };
    for (const sa of signs) {
      for (const sb of signs) {
        faces.push(orientOutward([
          vOnAxis(axisA, sa, axisB, sb, -1),
          vOnAxis(axisA, sa, axisB, sb, 1),
          vOnAxis(axisB, sb, axisA, sa, 1),
          vOnAxis(axisB, sb, axisA, sa, -1),
        ]));
      }
    }
  }
  // 8 corner triangles
  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        faces.push(orientOutward([addV(0, sx, sy, sz), addV(1, sy, sz, sx), addV(2, sz, sx, sy)]));
      }
    }
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** T-정점이 전혀 없는 순수 사각면 격자 기반 5단 수밀 직선 계단 블록. */
function buildStairsMesh(steps = 5, width = 1.0, totalHeight = 0.85, totalDepth = 1.05): StudioEditableMesh {
  const halfW = width * 0.5;
  const halfH = totalHeight * 0.5;
  const halfD = totalDepth * 0.5;
  const positions: StudioMeshVec3[] = [];
  const vMap = new Map<string, number>();
  const getV = (ix: number, iy: number, iz: number): number => {
    const key = `${ix}|${iy}|${iz}`;
    const existing = vMap.get(key);
    if (existing !== undefined) return existing;
    const x = -halfW + ix * width;
    const y = -halfH + (iy / steps) * totalHeight;
    const z = halfD - (iz / steps) * totalDepth;
    const created = positions.length;
    positions.push(vec(x, y, z));
    vMap.set(key, created);
    return created;
  };
  const occupied = (ix: number, iy: number, iz: number): boolean =>
    ix === 0 && iz >= 0 && iz < steps && iy >= 0 && iy <= iz;

  const faces: number[][] = [];
  for (let iz = 0; iz < steps; iz += 1) {
    for (let iy = 0; iy <= iz; iy += 1) {
      // -X left face (x = -halfW, outward -X)
      if (!occupied(-1, iy, iz)) faces.push([getV(0, iy, iz), getV(0, iy + 1, iz), getV(0, iy + 1, iz + 1), getV(0, iy, iz + 1)]);
      // +X right face (x = +halfW, outward +X)
      if (!occupied(1, iy, iz)) faces.push([getV(1, iy, iz + 1), getV(1, iy + 1, iz + 1), getV(1, iy + 1, iz), getV(1, iy, iz)]);
      // -Y bottom face (outward -Y)
      if (!occupied(0, iy - 1, iz)) faces.push([getV(0, iy, iz), getV(0, iy, iz + 1), getV(1, iy, iz + 1), getV(1, iy, iz)]);
      // +Y tread face (outward +Y)
      if (!occupied(0, iy + 1, iz)) faces.push([getV(0, iy + 1, iz), getV(1, iy + 1, iz), getV(1, iy + 1, iz + 1), getV(0, iy + 1, iz + 1)]);
      // +Z riser face (z decreases as iz increases, so iz boundary faces +Z)
      if (!occupied(0, iy, iz - 1)) faces.push([getV(0, iy, iz), getV(1, iy, iz), getV(1, iy + 1, iz), getV(0, iy + 1, iz)]);
      // -Z back face (iz + 1 boundary faces -Z)
      if (!occupied(0, iy, iz + 1)) faces.push([getV(1, iy, iz + 1), getV(0, iy, iz + 1), getV(0, iy + 1, iz + 1), getV(1, iy + 1, iz + 1)]);
    }
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** 주초·12골 배흘림 주신·주두가 일체로 닫힌 고전 플루티드 기둥. */
function buildClassicalColumnMesh(): StudioEditableMesh {
  const segs = 24;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number; readonly flute: number }> = [
    { y: -0.62, r: 0.34, flute: 0 },
    { y: -0.52, r: 0.34, flute: 0 },
    { y: -0.47, r: 0.29, flute: 0 },
    { y: -0.42, r: 0.23, flute: 0.016 },
    { y: -0.14, r: 0.238, flute: 0.020 },
    { y: 0.16, r: 0.228, flute: 0.018 },
    { y: 0.42, r: 0.212, flute: 0.014 },
    { y: 0.47, r: 0.245, flute: 0 },
    { y: 0.54, r: 0.33, flute: 0 },
    { y: 0.62, r: 0.33, flute: 0 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.62, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = (s * Math.PI * 2) / segs;
      const groove = s % 2 === 1 ? st.flute : 0;
      const rad = st.r - groove;
      positions.push(vec(rad * Math.cos(theta), st.y, -rad * Math.sin(theta)));
    }
  }
  const topCenter = positions.length;
  positions.push(vec(0, 0.62, 0));

  const ringIdx = (ring: number, s: number): number => 1 + ring * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) {
    faces.push([0, ringIdx(0, s + 1), ringIdx(0, s)]);
  }
  for (let ring = 0; ring < stations.length - 1; ring += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ringIdx(ring, s), ringIdx(ring, s + 1), ringIdx(ring + 1, s + 1), ringIdx(ring + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) {
    faces.push([ringIdx(last, s), ringIdx(last, s + 1), topCenter]);
  }
  return withSmoothShading(createStudioEditableMeshFromPolygons(positions, faces), true);
}

export function createStudioHybridDccStarterPrimitiveMesh(
  kind: StudioHybridDccStarterPrimitiveKind,
): StudioEditableMesh {
  switch (kind) {
    case "cube":
      return createStudioUnitCubeMesh();
    case "bevel-box":
      return buildBevelBoxMesh();
    case "sculpt-sphere":
      return buildSculptQuadSphereMesh();
    case "gem-prism":
      return buildFacetedGemPrismMesh();
    case "capsule":
      return buildCapsuleMesh();
    case "sphere":
      return buildUvSphereMesh();
    case "cylinder":
      return buildCylinderMesh();
    case "column":
      return buildClassicalColumnMesh();
    case "octagonal-pillar":
      return buildOctagonalPillarMesh();
    case "cone":
      return buildConeMesh();
    case "torus":
      return buildTorusMesh();
    case "grid":
      return buildGridMesh();
    case "arch":
      return buildArchMesh();
    case "window-wall":
      return buildWindowWallModuleMesh();
    case "doorway-frame":
      return buildDoorwayPortalWallMesh();
    case "molded-plinth":
      return buildMoldedPlinthMesh();
    case "ribbed-dome":
      return buildRibbedConservatoryDomeMesh();
    case "turned-goblet":
      return buildTurnedGobletPedestalMesh();
    case "lotus-lantern":
      return buildLotusPagodaLanternMesh();
    case "stairs":
      return buildStairsMesh();
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
