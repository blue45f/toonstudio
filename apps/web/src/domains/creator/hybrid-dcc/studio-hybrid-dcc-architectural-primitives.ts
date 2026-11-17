/**
 * 정밀 3D 모델러(Hybrid DCC)용 수밀(Watertight) 건축·구조 하프에지 프리미티브 생성기 및
 * Blender 5.2 정밀 웹툰 배경 베이 V14(6종, CC0-1.0) 카탈로그.
 *
 * 모든 생성 메시는 T-정점이 전혀 없는 닫힌 2-매니폴드(boundaryHalfEdgeCount === 0) 위상을 보장한다.
 */

import {
  createStudioEditableMeshFromPolygons,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

export interface StudioHybridDccPrecisionBgKitItem {
  readonly id: string;
  readonly fileName: string;
  readonly glbUrl: string;
  readonly previewUrl: string;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
  readonly triangles: number;
}

export const STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "modern-corner-bakery-cafe-bay-v14",
      fileName: "modern-corner-bakery-cafe-bay-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/modern-corner-bakery-cafe-bay-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/modern-corner-bakery-cafe-bay-v14.png",
      label: ["코너 베이커리·카페 통창 베이", "Corner bakery & cafe bay"],
      hint: ["다크브론즈 통창·템바 카운터·어닝", "Mullioned storefront & espresso bar"],
      triangles: 7288,
    },
    {
      id: "korean-highschool-window-corridor-bay-v14",
      fileName: "korean-highschool-window-corridor-bay-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/korean-highschool-window-corridor-bay-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/korean-highschool-window-corridor-bay-v14.png",
      label: ["고등학교 교실·복도 창측 베이", "High-school classroom bay"],
      hint: ["이중 미닫이창·복도문·라디에이터·책걸상", "Classroom windows, door & 4 desks"],
      triangles: 7708,
    },
    {
      id: "rofan-grand-vault-colonnade-bay-v14",
      fileName: "rofan-grand-vault-colonnade-bay-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/rofan-grand-vault-colonnade-bay-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/rofan-grand-vault-colonnade-bay-v14.png",
      label: ["로판 황궁 리브 볼트 회랑 베이", "Imperial vault colonnade"],
      hint: ["16골 배흘림 열주·크로스 볼트·스콘스", "Fluted columns, rib vault & sconces"],
      triangles: 12780,
    },
    {
      id: "modern-officetel-studio-loft-bay-v14",
      fileName: "modern-officetel-studio-loft-bay-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/modern-officetel-studio-loft-bay-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/modern-officetel-studio-loft-bay-v14.png",
      label: ["오피스텔·원룸 창가 코너 베이", "Modern studio apartment bay"],
      hint: ["우물천장 간접등·월넛 책장데스크·소파", "Cove LED, built-in desk & sofa"],
      triangles: 4608,
    },
    {
      id: "subway-platform-screen-door-bay-v14",
      fileName: "subway-platform-screen-door-bay-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/subway-platform-screen-door-bay-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/subway-platform-screen-door-bay-v14.png",
      label: ["지하철 승강장 스크린도어 베이", "Subway platform PSD bay"],
      hint: ["스테인리스 PSD·점자블록·도착 안내기", "Screen doors, tactile line & bench"],
      triangles: 6012,
    },
    {
      id: "rooftop-sunset-parapet-stairhouse-v14",
      fileName: "rooftop-sunset-parapet-stairhouse-v14.glb",
      glbUrl: "/studio-assets/blender-precision-bg-v14/rooftop-sunset-parapet-stairhouse-v14.glb",
      previewUrl: "/studio-assets/blender-precision-bg-v14/thumbnails/rooftop-sunset-parapet-stairhouse-v14.png",
      label: ["학교·빌딩 옥상 계단실 베이", "Rooftop stairhouse & parapet"],
      hint: ["1150mm 안전난간·방화문·사다리·실외기", "Penthouse fire-door, fence & HVAC"],
      triangles: 3644,
    },
  ]);

/** Blender 5.3 아티잔 아틀리에 V15(8종, CC0-1.0) — 웹툰 남녀 두상 조형·아스트롤라베·온실 가제보·이젤·황실 다과상·마도서 제단·아이돌 마이크. */
export const STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-stylized-protagonist-bust-v15",
      fileName: "webtoon-stylized-protagonist-bust-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-stylized-protagonist-bust-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-stylized-protagonist-bust-v15.png",
      label: ["스타일라이즈 여주인공 흉상", "Stylized heroine bust"],
      hint: ["7.5등신 두상 조형·홍채·레이어드 헤어", "Heroine bust with jewel iris & bangs"],
      triangles: 25024,
    },
    {
      id: "webtoon-male-lead-hunter-bust-v15",
      fileName: "webtoon-male-lead-hunter-bust-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-male-lead-hunter-bust-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-male-lead-hunter-bust-v15.png",
      label: ["판타지 헌터 남주인공 흉상", "Hunter male-lead bust"],
      hint: ["8등신 샤프 턱선·하이칼라 코트·견장", "Sharp jawline, high-collar coat & clasp"],
      triangles: 21436,
    },
    {
      id: "webtoon-celestial-ink-astrolabe-turntable-v15",
      fileName: "webtoon-celestial-ink-astrolabe-turntable-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-celestial-ink-astrolabe-turntable-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-celestial-ink-astrolabe-turntable-v15.png",
      label: ["천상 먹빛 아스트롤라베", "Celestial ink astrolabe"],
      hint: ["삼중 황동 짐벌 링·먹빛 성좌판·회전대", "Triple brass gimbal rings & ink dial"],
      triangles: 9856,
    },
    {
      id: "webtoon-royal-conservatory-dome-gazebo-v15",
      fileName: "webtoon-royal-conservatory-dome-gazebo-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-royal-conservatory-dome-gazebo-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-royal-conservatory-dome-gazebo-v15.png",
      label: ["로열 온실 돔 가제보", "Royal conservatory gazebo"],
      hint: ["유리 리브 돔·청동 아치·석조 기단", "Ribbed glass dome, arches & plinth"],
      triangles: 12528,
    },
    {
      id: "webtoon-artisan-drafting-easel-lamp-v15",
      fileName: "webtoon-artisan-drafting-easel-lamp-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-artisan-drafting-easel-lamp-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-artisan-drafting-easel-lamp-v15.png",
      label: ["아티잔 제도 이젤·작업등", "Artisan drafting easel & lamp"],
      hint: ["원목 H-이젤·관절 황동 램프·원고지", "Oak H-frame easel & articulated lamp"],
      triangles: 2780,
    },
    {
      id: "webtoon-rofan-imperial-tea-carriage-table-v15",
      fileName: "webtoon-rofan-imperial-tea-carriage-table-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-rofan-imperial-tea-carriage-table-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-rofan-imperial-tea-carriage-table-v15.png",
      label: ["로판 황실 티파티 다과 테이블", "Imperial tea-party table"],
      hint: ["3단 애프터눈 티 스탠드·백자 티팟·찻잔", "3-tier gilded stand, teapot & teacups"],
      triangles: 5524,
    },
    {
      id: "webtoon-arcane-grimoire-magic-circle-pedestal-v15",
      fileName: "webtoon-arcane-grimoire-magic-circle-pedestal-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-arcane-grimoire-magic-circle-pedestal-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-arcane-grimoire-magic-circle-pedestal-v15.png",
      label: ["아케인 마도서·마법진 성소 제단", "Arcane grimoire pedestal"],
      hint: ["8각 룬 석조 제단·펼친 마도서·마나 수정", "Octagonal rune altar, open tome & crystals"],
      triangles: 5120,
    },
    {
      id: "webtoon-kpop-stage-crown-mic-stand-v15",
      fileName: "webtoon-kpop-stage-crown-mic-stand-v15.glb",
      glbUrl: "/studio-assets/blender-artisan-v15/webtoon-kpop-stage-crown-mic-stand-v15.glb",
      previewUrl: "/studio-assets/blender-artisan-v15/thumbnails/webtoon-kpop-stage-crown-mic-stand-v15.png",
      label: ["아이돌 크라운 스탠드 마이크", "K-pop crown stage mic stand"],
      hint: ["크라운 스타 가드·네온 링 베이스·리본", "Star-crown mic capsule & stage ring base"],
      triangles: 3788,
    },
  ]);

/** Blender 5.3 뤼미에르 아틀리에 V16(6종, CC0-1.0) — 오픈PBR 분산 크리스탈 성소·귀족 티아라 흉상·나선 대도서관·파리 파티세리 카트·천체 오러리·달빛 한옥 연꽃 정자. */
export const STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-aristocrat-tiara-bust-v16",
      fileName: "webtoon-aristocrat-tiara-bust-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-aristocrat-tiara-bust-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-aristocrat-tiara-bust-v16.png",
      label: ["로판 귀족 티아라 여주인공 흉상", "Aristocrat tiara heroine bust"],
      hint: ["오픈PBR 루비 티아라·벨벳 드레스·두상", "Ruby tiara, velvet bodice & bust"],
      triangles: 26256,
    },
    {
      id: "webtoon-crystal-prism-sanctum-altar-v16",
      fileName: "webtoon-crystal-prism-sanctum-altar-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-crystal-prism-sanctum-altar-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-crystal-prism-sanctum-altar-v16.png",
      label: ["크리스탈 프리즘 성소 제단", "Crystal prism sanctum altar"],
      hint: ["분산 굴절 수정 모놀리스·할로 링·기단", "Dispersion crystal spire & halo rings"],
      triangles: 7548,
    },
    {
      id: "webtoon-grand-spiral-library-rotunda-v16",
      fileName: "webtoon-grand-spiral-library-rotunda-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-grand-spiral-library-rotunda-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-grand-spiral-library-rotunda-v16.png",
      label: ["나선 대도서관 로툰다 서가", "Grand spiral library rotunda"],
      hint: ["2층 월넛 아치 서가·나선 계단·황동 난간", "2-tier walnut rotunda & spiral stair"],
      triangles: 22496,
    },
    {
      id: "webtoon-parisian-patisserie-display-cart-v16",
      fileName: "webtoon-parisian-patisserie-display-cart-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-parisian-patisserie-display-cart-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-parisian-patisserie-display-cart-v16.png",
      label: ["파리지앵 파티세리 디저트 카트", "Parisian patisserie display cart"],
      hint: ["투명 유리 쇼케이스·스트라이프 캐노피·마카롱", "Glass vitrine, striped awning & pastries"],
      triangles: 7980,
    },
    {
      id: "webtoon-celestial-chrono-orrery-clock-v16",
      fileName: "webtoon-celestial-chrono-orrery-clock-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-celestial-chrono-orrery-clock-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-celestial-chrono-orrery-clock-v16.png",
      label: ["천체 크로노 오러리 시계탑 코어", "Celestial chrono orrery clock"],
      hint: ["삼중 황동 아밀러리 링·태양구·기어", "Armillary brass rings, sun core & gears"],
      triangles: 9532,
    },
    {
      id: "webtoon-moonlight-hanok-lotus-lantern-pavilion-v16",
      fileName: "webtoon-moonlight-hanok-lotus-lantern-pavilion-v16.glb",
      glbUrl: "/studio-assets/blender-lumiere-v16/webtoon-moonlight-hanok-lotus-lantern-pavilion-v16.glb",
      previewUrl: "/studio-assets/blender-lumiere-v16/thumbnails/webtoon-moonlight-hanok-lotus-lantern-pavilion-v16.png",
      label: ["달빛 한옥 연꽃 등롱 정자", "Moonlight Hanok lotus pavilion"],
      hint: ["화강암 기단·배흘림기둥·팔작 처마·연꽃등", "Granite plinth, Hanok eaves & lotus lanterns"],
      triangles: 7620,
    },
  ]);

function vec(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

function withSmooth(mesh: StudioEditableMesh, smooth: boolean): StudioEditableMesh {
  return {
    ...mesh,
    faces: mesh.faces.map((face) => ({ ...face, smooth })),
  };
}

/**
 * 3D 직교 복셀 격자로부터 T-정점이 전혀 없는 닫힌 2-매니폴드 사각면 솔리드를 합성한다.
 * 창호 벽체(genus 1)나 문틀 포털 벽체처럼 개구부가 뚫린 건축 부재를 수학적 수밀 상태로 만든다.
 */
function buildVoxelGridManifoldMesh(
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
  isSolid: (ix: number, iy: number, iz: number) => boolean,
): StudioEditableMesh {
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const nz = zs.length - 1;
  const positions: StudioMeshVec3[] = [];
  const vMap = new Map<string, number>();

  const getV = (ix: number, iy: number, iz: number): number => {
    const key = `${ix}|${iy}|${iz}`;
    const existing = vMap.get(key);
    if (existing !== undefined) return existing;
    const created = positions.length;
    positions.push(vec(xs[ix]!, ys[iy]!, zs[iz]!));
    vMap.set(key, created);
    return created;
  };

  const occupied = (ix: number, iy: number, iz: number): boolean => {
    if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) return false;
    return isSolid(ix, iy, iz);
  };

  const faces: number[][] = [];
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        if (!occupied(ix, iy, iz)) continue;
        // -X face (outward normal -X)
        if (!occupied(ix - 1, iy, iz)) {
          faces.push([getV(ix, iy, iz), getV(ix, iy, iz + 1), getV(ix, iy + 1, iz + 1), getV(ix, iy + 1, iz)]);
        }
        // +X face (outward normal +X)
        if (!occupied(ix + 1, iy, iz)) {
          faces.push([getV(ix + 1, iy, iz + 1), getV(ix + 1, iy, iz), getV(ix + 1, iy + 1, iz), getV(ix + 1, iy + 1, iz + 1)]);
        }
        // -Y face (outward normal -Y)
        if (!occupied(ix, iy - 1, iz)) {
          faces.push([getV(ix, iy, iz), getV(ix + 1, iy, iz), getV(ix + 1, iy, iz + 1), getV(ix, iy, iz + 1)]);
        }
        // +Y face (outward normal +Y)
        if (!occupied(ix, iy + 1, iz)) {
          faces.push([getV(ix, iy + 1, iz + 1), getV(ix + 1, iy + 1, iz + 1), getV(ix + 1, iy + 1, iz), getV(ix, iy + 1, iz)]);
        }
        // -Z face (outward normal -Z)
        if (!occupied(ix, iy, iz - 1)) {
          faces.push([getV(ix + 1, iy, iz), getV(ix, iy, iz), getV(ix, iy + 1, iz), getV(ix + 1, iy + 1, iz)]);
        }
        // +Z face (outward normal +Z)
        if (!occupied(ix, iy, iz + 1)) {
          faces.push([getV(ix, iy, iz + 1), getV(ix + 1, iy, iz + 1), getV(ix + 1, iy + 1, iz + 1), getV(ix, iy + 1, iz + 1)]);
        }
      }
    }
  }
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** 1. 창호 개구부 벽 모듈 (2.0m × 1.6m × 0.24m, 중앙 창호 개구부 + 창턱 단차, Genus-1 수밀 사각면). */
export function buildWindowWallModuleMesh(): StudioEditableMesh {
  const xs = [-1.0, -0.56, 0.56, 1.0];
  const ys = [-0.8, -0.28, 0.48, 0.8];
  const zs = [-0.12, 0.12];
  return buildVoxelGridManifoldMesh(xs, ys, zs, (ix, iy) => !(ix === 1 && iy === 1));
}

/** 2. 문틀 포털 벽 모듈 (2.0m × 1.9m × 0.24m, 하부 문지방 실 + 좌우 문설주 + 상인방, 수밀 사각면). */
export function buildDoorwayPortalWallMesh(): StudioEditableMesh {
  const xs = [-1.0, -0.48, 0.48, 1.0];
  const ys = [-0.95, -0.85, 0.62, 0.95];
  const zs = [-0.12, 0.12];
  return buildVoxelGridManifoldMesh(xs, ys, zs, (ix, iy) => !(ix === 1 && iy === 1));
}

/** 3. 다단 몰딩 기단·코니스 블록 (4각 단면 다단 챔퍼 프로파일 회전체, χ=2 수밀). */
export function buildMoldedPlinthMesh(): StudioEditableMesh {
  const stations: ReadonlyArray<{ readonly y: number; readonly half: number }> = [
    { y: -0.52, half: 0.68 },
    { y: -0.38, half: 0.68 },
    { y: -0.30, half: 0.56 },
    { y: -0.24, half: 0.50 },
    { y: 0.24, half: 0.50 },
    { y: 0.31, half: 0.58 },
    { y: 0.40, half: 0.66 },
    { y: 0.52, half: 0.66 },
  ];
  const corners: ReadonlyArray<readonly [number, number]> = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const positions: StudioMeshVec3[] = [];
  for (const st of stations) {
    for (const [sx, sz] of corners) {
      positions.push(vec(sx * st.half, st.y, sz * st.half));
    }
  }
  const ring = (r: number, c: number): number => r * 4 + (c % 4);
  const faces: number[][] = [];
  // Bottom cap (-Y outward)
  faces.push([ring(0, 3), ring(0, 2), ring(0, 1), ring(0, 0)]);
  // Molded side quad strips
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      faces.push([ring(r, c), ring(r, c + 1), ring(r + 1, c + 1), ring(r + 1, c)]);
    }
  }
  // Top cap (+Y outward)
  const top = stations.length - 1;
  faces.push([ring(top, 0), ring(top, 1), ring(top, 2), ring(top, 3)]);
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** 4. 8각 챔퍼 구조 기둥 (8각 기단·챔퍼 주신·주두 일체형, χ=2 수밀). */
export function buildOctagonalPillarMesh(): StudioEditableMesh {
  const segs = 8;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number }> = [
    { y: -0.68, r: 0.36 },
    { y: -0.52, r: 0.36 },
    { y: -0.44, r: 0.27 },
    { y: 0.44, r: 0.25 },
    { y: 0.52, r: 0.34 },
    { y: 0.68, r: 0.34 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.68, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = ((s + 0.5) * Math.PI * 2) / segs;
      positions.push(vec(st.r * Math.cos(theta), st.y, -st.r * Math.sin(theta)));
    }
  }
  const topPole = positions.length;
  positions.push(vec(0, 0.68, 0));

  const ring = (r: number, s: number): number => 1 + r * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) {
    faces.push([0, ring(0, s + 1), ring(0, s)]);
  }
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) {
    faces.push([ring(last, s), ring(last, s + 1), topPole]);
  }
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** 5. 리브 온실 돔 (12각 몰딩 드럼 기단 + 반구형 리브 돔, χ=2 수밀). */
export function buildRibbedConservatoryDomeMesh(): StudioEditableMesh {
  const segs = 12;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number }> = [
    { y: -0.46, r: 0.64 },
    { y: -0.34, r: 0.64 },
    { y: -0.28, r: 0.58 },
    { y: -0.10, r: 0.58 },
    { y: 0.08, r: 0.54 },
    { y: 0.24, r: 0.44 },
    { y: 0.37, r: 0.29 },
    { y: 0.45, r: 0.13 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.46, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = (s * Math.PI * 2) / segs;
      const rib = st.y > -0.10 && s % 2 === 0 ? 1.035 : 1.0;
      positions.push(vec(st.r * rib * Math.cos(theta), st.y, -st.r * rib * Math.sin(theta)));
    }
  }
  const topPole = positions.length;
  positions.push(vec(0, 0.50, 0));
  const ring = (r: number, s: number): number => 1 + r * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) faces.push([0, ring(0, s + 1), ring(0, s)]);
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) faces.push([ring(last, s), ring(last, s + 1), topPole]);
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), true);
}

/** 6. 선반 세공 성배·화병 기단 (12각 발판·밸러스터 스템·오목 보울 회전체, χ=2 수밀). */
export function buildTurnedGobletPedestalMesh(): StudioEditableMesh {
  const segs = 12;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number }> = [
    { y: -0.50, r: 0.30 },
    { y: -0.44, r: 0.30 },
    { y: -0.38, r: 0.12 },
    { y: -0.18, r: 0.085 },
    { y: -0.08, r: 0.135 },
    { y: 0.02, r: 0.095 },
    { y: 0.18, r: 0.28 },
    { y: 0.42, r: 0.35 },
    { y: 0.48, r: 0.37 },
    { y: 0.44, r: 0.31 },
    { y: 0.20, r: 0.22 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.50, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = (s * Math.PI * 2) / segs;
      positions.push(vec(st.r * Math.cos(theta), st.y, -st.r * Math.sin(theta)));
    }
  }
  const innerWellPole = positions.length;
  positions.push(vec(0, 0.12, 0));
  const ring = (r: number, s: number): number => 1 + r * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) faces.push([0, ring(0, s + 1), ring(0, s)]);
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) faces.push([ring(last, s), ring(last, s + 1), innerWellPole]);
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), true);
}

/** 7. 브릴리언트 컷 보석 프리즘 (16분할 크라운 베젤·거들·파빌리온 큘릿 일체형, χ=2 수밀). */
export function buildFacetedGemPrismMesh(): StudioEditableMesh {
  const segs = 16;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number; readonly star: number }> = [
    { y: -0.24, r: 0.28, star: 1.0 },
    { y: 0.04, r: 0.54, star: 1.0 },
    { y: 0.11, r: 0.54, star: 1.0 },
    { y: 0.27, r: 0.43, star: 0.92 },
    { y: 0.38, r: 0.26, star: 1.0 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.48, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = (s * Math.PI * 2) / segs;
      const rad = st.r * (s % 2 === 1 ? st.star : 1.0);
      positions.push(vec(rad * Math.cos(theta), st.y, -rad * Math.sin(theta)));
    }
  }
  const tablePole = positions.length;
  positions.push(vec(0, 0.38, 0));
  const ring = (r: number, s: number): number => 1 + r * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) faces.push([0, ring(0, s + 1), ring(0, s)]);
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) faces.push([ring(last, s), ring(last, s + 1), tablePole]);
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), false);
}

/** 8. 8각 연꽃 석등·정자 지붕 코어 (연화대좌·8각 화사석·처마 옥개석·보주 일체형, χ=2 수밀). */
export function buildLotusPagodaLanternMesh(): StudioEditableMesh {
  const segs = 8;
  const stations: ReadonlyArray<{ readonly y: number; readonly r: number }> = [
    { y: -0.56, r: 0.40 },
    { y: -0.44, r: 0.43 },
    { y: -0.34, r: 0.26 },
    { y: 0.10, r: 0.25 },
    { y: 0.15, r: 0.54 },
    { y: 0.21, r: 0.50 },
    { y: 0.36, r: 0.24 },
    { y: 0.48, r: 0.09 },
  ];
  const positions: StudioMeshVec3[] = [vec(0, -0.56, 0)];
  for (const st of stations) {
    for (let s = 0; s < segs; s += 1) {
      const theta = ((s + 0.5) * Math.PI * 2) / segs;
      positions.push(vec(st.r * Math.cos(theta), st.y, -st.r * Math.sin(theta)));
    }
  }
  const finialPole = positions.length;
  positions.push(vec(0, 0.60, 0));
  const ring = (r: number, s: number): number => 1 + r * segs + (s % segs);
  const faces: number[][] = [];
  for (let s = 0; s < segs; s += 1) faces.push([0, ring(0, s + 1), ring(0, s)]);
  for (let r = 0; r < stations.length - 1; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      faces.push([ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)]);
    }
  }
  const last = stations.length - 1;
  for (let s = 0; s < segs; s += 1) faces.push([ring(last, s), ring(last, s + 1), finialPole]);
  return withSmooth(createStudioEditableMeshFromPolygons(positions, faces), false);
}
