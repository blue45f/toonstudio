/**
 * studio-bg3d-rich-scene-presets.ts
 *
 * 3D 배경 단조로움을 해소하는 6종 고밀도 웹툰 배경 세트 & 프로시저럴 환경 디테일 생성기.
 * - 실제 Three.js `Group`/`BufferGeometry`로 건축 본체·창틀 몰딩·천장 조명 기구·액자/간판·식물/가로수·난간·반사 지면·분위기 입자를 생성
 * - 원클릭 디테일 밀도(`basic` 기본 / `rich` 풍성 / `ultra` 극강) 지원
 * - 모든 생성 지오메트리는 미터법(`1.0=1m`), 바닥 접지(`Y=0`), 매니폴드 무결성(비다양체 0, 퇴화 면 0) 및 `try/finally` GPU 해제 제공
 */

import * as THREE from "three";

import {
  createOklchThreeColor,
  disposeObject3DResources,
  validateObject3DManifoldAndGrounding,
  type DisposedGpuResourceCounts,
  type OklchColorSpec,
} from "./studio-bg3d-geometry-manifold-utils";
import {
  getRichWebtoonScenePreset,
  RICH_SCENE_DENSITY_OPTIONS,
  RICH_WEBTOON_SCENE_PRESETS,
  type RichSceneDensityOption,
  type RichSceneDensityTier,
  type RichWebtoonSceneBuildResult,
  type RichWebtoonSceneLayerSummary,
  type RichWebtoonScenePresetId,
  type RichWebtoonScenePresetMeta,
  type StageFurnitureAnchor,
  type StageFurnitureAnchorKind,
} from "./studio-bg3d-rich-scene-presets-catalog";

export {
  getRichWebtoonScenePreset,
  RICH_SCENE_DENSITY_OPTIONS,
  RICH_WEBTOON_SCENE_PRESETS,
  type RichSceneDensityOption,
  type RichSceneDensityTier,
  type RichWebtoonSceneBuildResult,
  type RichWebtoonSceneLayerSummary,
  type RichWebtoonScenePresetId,
  type RichWebtoonScenePresetMeta,
  type StageFurnitureAnchor,
  type StageFurnitureAnchorKind,
};

interface SceneBuilderContext {
  readonly root: THREE.Group;
  readonly layers: {
    readonly architecture: THREE.Group;
    readonly moldings: THREE.Group;
    readonly lighting: THREE.Group;
    readonly signageFrames: THREE.Group;
    readonly foliage: THREE.Group;
    readonly railings: THREE.Group;
    readonly groundReflection: THREE.Group;
    readonly particles: THREE.Group;
  };
  readonly densityLevel: 1 | 2 | 3;
  readonly particleCount: number;
  readonly materials: Map<string, THREE.MeshStandardMaterial>;
}

function getOrCreateMaterial(
  ctx: SceneBuilderContext,
  key: string,
  color: OklchColorSpec,
  options: {
    readonly roughness?: number;
    readonly metalness?: number;
    readonly emissive?: OklchColorSpec;
    readonly emissiveIntensity?: number;
  } = {},
): THREE.MeshStandardMaterial {
  const existing = ctx.materials.get(key);
  if (existing) return existing;
  const mat = new THREE.MeshStandardMaterial({
    color: createOklchThreeColor(color),
    roughness: options.roughness ?? 0.62,
    metalness: options.metalness ?? 0.08,
    ...(options.emissive
      ? {
          emissive: createOklchThreeColor(options.emissive),
          emissiveIntensity: options.emissiveIntensity ?? 1.2,
        }
      : {}),
  });
  mat.name = `mat:${key}`;
  ctx.materials.set(key, mat);
  return mat;
}

function addBox(
  parent: THREE.Group,
  name: string,
  size: readonly [number, number, number],
  bottomCenter: readonly [number, number, number],
  material: THREE.Material,
  options: { readonly rotationY?: number; readonly receiveShadow?: boolean; readonly castShadow?: boolean } = {},
): THREE.Mesh {
  const w = Math.max(0.004, size[0]);
  const h = Math.max(0.004, size[1]);
  const d = Math.max(0.004, size[2]);
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(bottomCenter[0], Math.max(0, bottomCenter[1]) + h * 0.5, bottomCenter[2]);
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Group,
  name: string,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  bottomCenter: readonly [number, number, number],
  material: THREE.Material,
  radialSegments = 12,
): THREE.Mesh {
  const rTop = Math.max(0.004, radiusTop);
  const rBot = Math.max(0.004, radiusBottom);
  const h = Math.max(0.006, height);
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, Math.max(6, radialSegments), 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(bottomCenter[0], Math.max(0, bottomCenter[1]) + h * 0.5, bottomCenter[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addIcoCanopy(
  parent: THREE.Group,
  name: string,
  radius: number,
  bottomCenter: readonly [number, number, number],
  material: THREE.Material,
  detail = 1,
): THREE.Mesh {
  const r = Math.max(0.04, radius);
  const geo = new THREE.IcosahedronGeometry(r, detail);
  geo.computeBoundingBox();
  const minY = geo.boundingBox?.min.y ?? -r;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(bottomCenter[0], Math.max(0, bottomCenter[1]) - minY, bottomCenter[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWindowMullionFrame(
  ctx: SceneBuilderContext,
  prefix: string,
  centerBottom: readonly [number, number, number],
  width: number,
  height: number,
  depth: number,
  frameMat: THREE.Material,
  glassMat: THREE.Material,
  rotationY = 0,
): void {
  const frameGroup = new THREE.Group();
  frameGroup.name = `${prefix}:window`;
  frameGroup.position.set(centerBottom[0], Math.max(0, centerBottom[1]), centerBottom[2]);
  frameGroup.rotation.y = rotationY;

  const t = 0.06;
  addBox(frameGroup, `${prefix}:sill`, [width + 0.1, t, depth + 0.06], [0, 0, 0], frameMat);
  addBox(frameGroup, `${prefix}:head`, [width + 0.1, t, depth + 0.06], [0, height - t, 0], frameMat);
  addBox(frameGroup, `${prefix}:left-jamb`, [t, height, depth], [-width * 0.5 + t * 0.5, 0, 0], frameMat);
  addBox(frameGroup, `${prefix}:right-jamb`, [t, height, depth], [width * 0.5 - t * 0.5, 0, 0], frameMat);
  addBox(frameGroup, `${prefix}:pane`, [width - t * 2, height - t * 2, Math.max(0.015, depth * 0.3)], [0, t, 0], glassMat, { castShadow: false });

  if (ctx.densityLevel >= 2) {
    addBox(frameGroup, `${prefix}:mullion-v`, [t * 0.65, height - t * 2, depth * 0.85], [0, t, 0], frameMat);
    addBox(frameGroup, `${prefix}:mullion-h`, [width - t * 2, t * 0.65, depth * 0.85], [0, height * 0.5, 0], frameMat);
  }
  if (ctx.densityLevel >= 3) {
    addBox(frameGroup, `${prefix}:mullion-v-l`, [t * 0.5, height - t * 2, depth * 0.75], [-width * 0.25, t, 0], frameMat);
    addBox(frameGroup, `${prefix}:mullion-v-r`, [t * 0.5, height - t * 2, depth * 0.75], [width * 0.25, t, 0], frameMat);
  }
  ctx.layers.moldings.add(frameGroup);
}

function addRailingSpan(
  ctx: SceneBuilderContext,
  prefix: string,
  startXZ: readonly [number, number],
  endXZ: readonly [number, number],
  heightM: number,
  railMat: THREE.Material,
): void {
  const dx = endXZ[0] - startXZ[0];
  const dz = endXZ[1] - startXZ[1];
  const span = Math.hypot(dx, dz);
  if (span < 0.2) return;
  const yaw = Math.atan2(dx, dz);
  const midX = (startXZ[0] + endXZ[0]) * 0.5;
  const midZ = (startXZ[1] + endXZ[1]) * 0.5;

  const railGroup = new THREE.Group();
  railGroup.name = `${prefix}:railing`;
  railGroup.position.set(midX, 0, midZ);
  railGroup.rotation.y = yaw;

  addBox(railGroup, `${prefix}:top-rail`, [0.06, 0.05, span], [0, heightM - 0.05, 0], railMat);
  addBox(railGroup, `${prefix}:mid-rail`, [0.04, 0.035, span], [0, heightM * 0.5, 0], railMat);
  addBox(railGroup, `${prefix}:base-curb`, [0.08, 0.06, span], [0, 0, 0], railMat);

  const postCount = ctx.densityLevel === 1 ? 3 : ctx.densityLevel === 2 ? 6 : 10;
  for (let i = 0; i < postCount; i += 1) {
    const t = i / (postCount - 1);
    const localZ = -span * 0.5 + t * span;
    addCylinder(railGroup, `${prefix}:post-${i}`, 0.022, 0.025, heightM - 0.04, [0, 0.02, localZ], railMat, 8);
  }
  ctx.layers.railings.add(railGroup);
}

function addPottedPlantOrTree(
  ctx: SceneBuilderContext,
  prefix: string,
  posXZ: readonly [number, number],
  scale: number,
  potMat: THREE.Material,
  barkMat: THREE.Material,
  leafMat: THREE.Material,
): void {
  const potH = 0.42 * scale;
  addCylinder(ctx.layers.foliage, `${prefix}:pot`, 0.22 * scale, 0.16 * scale, potH, [posXZ[0], 0, posXZ[1]], potMat, 10);
  addCylinder(ctx.layers.foliage, `${prefix}:trunk`, 0.035 * scale, 0.05 * scale, 0.85 * scale, [posXZ[0], potH * 0.85, posXZ[1]], barkMat, 8);
  addIcoCanopy(ctx.layers.foliage, `${prefix}:canopy-main`, 0.34 * scale, [posXZ[0], potH + 0.52 * scale, posXZ[1]], leafMat, 1);

  if (ctx.densityLevel >= 2) {
    addIcoCanopy(ctx.layers.foliage, `${prefix}:canopy-side-a`, 0.24 * scale, [posXZ[0] - 0.18 * scale, potH + 0.44 * scale, posXZ[1] + 0.12 * scale], leafMat, 1);
    addIcoCanopy(ctx.layers.foliage, `${prefix}:canopy-side-b`, 0.22 * scale, [posXZ[0] + 0.16 * scale, potH + 0.58 * scale, posXZ[1] - 0.1 * scale], leafMat, 1);
  }
  if (ctx.densityLevel >= 3) {
    addIcoCanopy(ctx.layers.foliage, `${prefix}:canopy-crown`, 0.2 * scale, [posXZ[0], potH + 0.92 * scale, posXZ[1]], leafMat, 1);
  }
}

function addFramedSignOrArt(
  ctx: SceneBuilderContext,
  prefix: string,
  bottomCenter: readonly [number, number, number],
  size: readonly [number, number, number],
  frameMat: THREE.Material,
  faceMat: THREE.Material,
  rotationY = 0,
): void {
  const g = new THREE.Group();
  g.name = `${prefix}:frame`;
  g.position.set(bottomCenter[0], Math.max(0, bottomCenter[1]), bottomCenter[2]);
  g.rotation.y = rotationY;
  addBox(g, `${prefix}:backing`, size, [0, 0, 0], frameMat);
  addBox(
    g,
    `${prefix}:surface`,
    [Math.max(0.04, size[0] - 0.08), Math.max(0.04, size[1] - 0.08), Math.max(0.012, size[2] * 0.4)],
    [0, 0.04, size[2] * 0.45],
    faceMat,
  );
  ctx.layers.signageFrames.add(g);
}

function addPendantFixture(
  ctx: SceneBuilderContext,
  prefix: string,
  posXZ: readonly [number, number],
  ceilingY: number,
  dropM: number,
  metalMat: THREE.Material,
  glowMat: THREE.Material,
): void {
  const lampBottomY = Math.max(2.0, ceilingY - dropM);
  addCylinder(ctx.layers.lighting, `${prefix}:rod`, 0.012, 0.012, Math.max(0.15, dropM - 0.18), [posXZ[0], lampBottomY + 0.18, posXZ[1]], metalMat, 8);
  addCylinder(ctx.layers.lighting, `${prefix}:shade`, 0.08, 0.24, 0.18, [posXZ[0], lampBottomY, posXZ[1]], metalMat, 12);
  addIcoCanopy(ctx.layers.lighting, `${prefix}:bulb`, 0.075, [posXZ[0], lampBottomY + 0.02, posXZ[1]], glowMat, 1);
}

function addAtmosphereParticles(
  ctx: SceneBuilderContext,
  seed: number,
  footprint: readonly [number, number, number],
  color: OklchColorSpec,
  pointSize: number,
): void {
  const count = ctx.particleCount;
  const positions = new Float32Array(count * 3);
  let state = seed >>> 0;
  const nextRand = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const [w, h, d] = footprint;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (nextRand() - 0.5) * w * 0.88;
    positions[i * 3 + 1] = 0.25 + nextRand() * Math.max(1.5, h - 0.4);
    positions[i * 3 + 2] = (nextRand() - 0.5) * d * 0.88;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mat = new THREE.PointsMaterial({
    color: createOklchThreeColor(color),
    size: pointSize,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  mat.name = "mat:atmosphere-particles";
  const points = new THREE.Points(geo, mat);
  points.name = "atmosphere-particles";
  ctx.layers.particles.add(points);
}

function buildGroundSlab(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta, color: OklchColorSpec): void {
  const [w, , d] = preset.footprintMeters;
  const floorMat = getOrCreateMaterial(ctx, "ground-reflective", color, {
    roughness: preset.groundRoughness,
    metalness: preset.groundMetalness,
  });
  addBox(ctx.layers.groundReflection, "ground-slab", [w, 0.008, d], [0, 0, 0], floorMat, {
    castShadow: false,
    receiveShadow: true,
  });
}

function populateSeoulNeonAlley(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.2, c: 0.02, h: 255 });
  const facadeMat = getOrCreateMaterial(ctx, "alley-concrete", { l: 0.34, c: 0.025, h: 250 }, { roughness: 0.76 });
  const trimMat = getOrCreateMaterial(ctx, "alley-trim", { l: 0.24, c: 0.02, h: 240 }, { roughness: 0.5, metalness: 0.4 });
  const glassMat = getOrCreateMaterial(ctx, "alley-glass", { l: 0.52, c: 0.07, h: 220 }, { roughness: 0.14, metalness: 0.3 });
  const neonPink = getOrCreateMaterial(ctx, "neon-pink", { l: 0.74, c: 0.24, h: 350 }, { emissive: { l: 0.72, c: 0.24, h: 350 }, emissiveIntensity: 1.8 });
  const neonCyan = getOrCreateMaterial(ctx, "neon-cyan", { l: 0.78, c: 0.18, h: 205 }, { emissive: { l: 0.76, c: 0.18, h: 205 }, emissiveIntensity: 1.7 });
  const neonAmber = getOrCreateMaterial(ctx, "neon-amber", { l: 0.82, c: 0.17, h: 75 }, { emissive: { l: 0.8, c: 0.17, h: 75 }, emissiveIntensity: 1.5 });
  const leafMat = getOrCreateMaterial(ctx, "alley-leaf", { l: 0.42, c: 0.1, h: 145 }, { roughness: 0.7 });
  const woodMat = getOrCreateMaterial(ctx, "alley-wood", { l: 0.44, c: 0.08, h: 55 }, { roughness: 0.65 });

  // 좌·우 상가 건물 본체 + 보도 연석
  addBox(ctx.layers.architecture, "alley-building-left", [1.8, 5.1, 13.4], [-4.0, 0, 0], facadeMat);
  addBox(ctx.layers.architecture, "alley-building-right", [1.8, 4.9, 13.4], [4.0, 0, 0], facadeMat);
  addBox(ctx.layers.groundReflection, "alley-curb-left", [0.45, 0.12, 13.2], [-2.9, 0, 0], trimMat);
  addBox(ctx.layers.groundReflection, "alley-curb-right", [0.45, 0.12, 13.2], [2.9, 0, 0], trimMat);
  // 포차 벤치 (착석 앵커)
  addBox(ctx.layers.architecture, "alley-bench-seat", [0.46, 0.45, 1.4], [-2.4, 0, -0.6], woodMat);

  // 창틀 몰딩
  for (const z of [-4.0, -0.8, 2.4]) {
    addWindowMullionFrame(ctx, `alley-win-l-${z}`, [-3.05, 1.2, z], 1.5, 1.4, 0.12, trimMat, glassMat, Math.PI * 0.5);
    addWindowMullionFrame(ctx, `alley-win-r-${z}`, [3.05, 1.2, z], 1.5, 1.4, 0.12, trimMat, glassMat, -Math.PI * 0.5);
  }
  // 세로 네온 간판 + 천장 가로등/네온 튜브
  const signPositions = ctx.densityLevel === 1 ? [-2.2, 1.6] : ctx.densityLevel === 2 ? [-4.4, -1.6, 1.2, 3.8] : [-5.2, -3.2, -1.2, 0.8, 2.8, 4.8];
  signPositions.forEach((z, idx) => {
    const faceMat = idx % 3 === 0 ? neonPink : idx % 3 === 1 ? neonCyan : neonAmber;
    const side = idx % 2 === 0 ? -1 : 1;
    addFramedSignOrArt(ctx, `alley-neon-${idx}`, [side * 2.82, 2.1 + (idx % 2) * 0.5, z], [0.22, 1.35, 0.62], trimMat, faceMat, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
    addPendantFixture(ctx, `alley-lamp-${idx}`, [side * 2.1, z], 4.4, 0.6, trimMat, faceMat);
  });

  // 난간 & 화분 가로수
  addRailingSpan(ctx, "alley-rail-east", [2.65, -4.6], [2.65, 1.6], 1.0, trimMat);
  addPottedPlantOrTree(ctx, "alley-planter-1", [-2.65, 3.6], 0.9, trimMat, woodMat, leafMat);
  if (ctx.densityLevel >= 2) {
    addPottedPlantOrTree(ctx, "alley-planter-2", [2.65, 3.8], 0.85, trimMat, woodMat, leafMat);
    addCylinder(ctx.layers.lighting, "alley-utility-pole", 0.1, 0.13, 5.2, [-2.75, 0, -5.2], trimMat, 10);
  }
  if (ctx.densityLevel >= 3) {
    addBox(ctx.layers.architecture, "alley-ac-unit-1", [0.75, 0.58, 0.34], [-2.95, 2.7, -3.2], trimMat);
    addBox(ctx.layers.architecture, "alley-ac-unit-2", [0.75, 0.58, 0.34], [2.95, 2.5, 0.4], trimMat);
  }
  addAtmosphereParticles(ctx, 101, preset.footprintMeters, { l: 0.84, c: 0.14, h: 215 }, 0.055);
}

function populateSunlitAtelierCafe(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.62, c: 0.075, h: 68 });
  const plasterMat = getOrCreateMaterial(ctx, "cafe-plaster", { l: 0.92, c: 0.02, h: 82 }, { roughness: 0.82 });
  const oakMat = getOrCreateMaterial(ctx, "cafe-oak", { l: 0.54, c: 0.085, h: 62 }, { roughness: 0.55 });
  const brassMat = getOrCreateMaterial(ctx, "cafe-brass", { l: 0.72, c: 0.12, h: 85 }, { roughness: 0.25, metalness: 0.78 });
  const glassMat = getOrCreateMaterial(ctx, "cafe-glass", { l: 0.85, c: 0.04, h: 210 }, { roughness: 0.08, metalness: 0.18 });
  const warmGlow = getOrCreateMaterial(ctx, "cafe-glow", { l: 0.94, c: 0.09, h: 85 }, { emissive: { l: 0.9, c: 0.11, h: 80 }, emissiveIntensity: 1.4 });
  const canvasMat = getOrCreateMaterial(ctx, "cafe-art", { l: 0.74, c: 0.09, h: 35 }, { roughness: 0.7 });
  const potMat = getOrCreateMaterial(ctx, "cafe-terracotta", { l: 0.58, c: 0.11, h: 42 }, { roughness: 0.72 });
  const leafMat = getOrCreateMaterial(ctx, "cafe-leaf", { l: 0.5, c: 0.12, h: 142 }, { roughness: 0.66 });

  // 카페 벽체 + 에스프레소 바 카운터 + 창가 테이블·체어
  addBox(ctx.layers.architecture, "cafe-wall-back", [9.8, 3.6, 0.24], [0, 0, -4.3], plasterMat);
  addBox(ctx.layers.architecture, "cafe-wall-left", [0.24, 3.6, 8.8], [-4.8, 0, 0], plasterMat);
  addBox(ctx.layers.architecture, "cafe-counter", [3.6, 1.02, 0.85], [1.6, 0, -2.9], oakMat);
  addBox(ctx.layers.architecture, "cafe-espresso-machine", [0.68, 0.44, 0.42], [1.9, 1.02, -2.9], brassMat);
  // 창가 테이블 & 착석 의자
  addBox(ctx.layers.architecture, "cafe-table-top", [0.95, 0.05, 0.95], [-2.1, 0.71, -1.4], oakMat);
  addCylinder(ctx.layers.architecture, "cafe-table-leg", 0.045, 0.055, 0.71, [-2.1, 0, -1.4], brassMat, 10);
  addBox(ctx.layers.architecture, "cafe-chair-seat", [0.46, 0.46, 0.46], [-2.1, 0, -0.5], oakMat);

  // 대형 격자 창틀 & 천장 코니스 몰딩
  addWindowMullionFrame(ctx, "cafe-french-win-1", [-4.65, 0.6, -1.8], 2.4, 2.3, 0.14, oakMat, glassMat, Math.PI * 0.5);
  addWindowMullionFrame(ctx, "cafe-french-win-2", [-4.65, 0.6, 1.6], 2.4, 2.3, 0.14, oakMat, glassMat, Math.PI * 0.5);
  addBox(ctx.layers.moldings, "cafe-crown-molding", [9.6, 0.14, 0.16], [0, 3.46, -4.12], oakMat);

  // 황동 펜던트 조명
  const pendantXs = ctx.densityLevel === 1 ? [-1.5, 1.5] : ctx.densityLevel === 2 ? [-2.4, 0, 2.2] : [-3.0, -1.2, 0.6, 2.4];
  pendantXs.forEach((x, idx) => addPendantFixture(ctx, `cafe-pendant-${idx}`, [x, -1.6 + (idx % 2) * 1.4], 3.7, 0.95, brassMat, warmGlow));

  // 벽면 액자 + 식물 + 테라스 난간
  addFramedSignOrArt(ctx, "cafe-art-1", [-1.6, 1.55, -4.14], [0.95, 1.15, 0.05], oakMat, canvasMat, 0);
  if (ctx.densityLevel >= 2) {
    addFramedSignOrArt(ctx, "cafe-menu-board", [1.6, 1.75, -4.14], [1.6, 0.85, 0.05], brassMat, oakMat, 0);
  }
  addPottedPlantOrTree(ctx, "cafe-plant-1", [-3.8, -3.5], 1.1, potMat, oakMat, leafMat);
  if (ctx.densityLevel >= 2) addPottedPlantOrTree(ctx, "cafe-plant-2", [3.9, 1.8], 0.95, potMat, oakMat, leafMat);
  if (ctx.densityLevel >= 3) addPottedPlantOrTree(ctx, "cafe-plant-3", [-3.7, 3.2], 0.85, potMat, oakMat, leafMat);
  addRailingSpan(ctx, "cafe-terrace-rail", [2.9, -3.4], [2.9, 1.2], 1.02, brassMat);
  addAtmosphereParticles(ctx, 202, preset.footprintMeters, { l: 0.95, c: 0.08, h: 86 }, 0.045);
}

function populateRofanImperialBanquet(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.88, c: 0.018, h: 80 });
  const marbleMat = getOrCreateMaterial(ctx, "palace-marble", { l: 0.91, c: 0.015, h: 85 }, { roughness: 0.18, metalness: 0.14 });
  const goldMat = getOrCreateMaterial(ctx, "palace-gold", { l: 0.78, c: 0.15, h: 85 }, { roughness: 0.22, metalness: 0.85 });
  const velvetMat = getOrCreateMaterial(ctx, "palace-velvet", { l: 0.36, c: 0.16, h: 20 }, { roughness: 0.85 });
  const crystalGlow = getOrCreateMaterial(ctx, "palace-crystal", { l: 0.96, c: 0.07, h: 88 }, { emissive: { l: 0.92, c: 0.1, h: 85 }, emissiveIntensity: 1.6 });
  const glassMat = getOrCreateMaterial(ctx, "palace-stained", { l: 0.74, c: 0.12, h: 255 }, { roughness: 0.12, metalness: 0.25 });
  const leafMat = getOrCreateMaterial(ctx, "palace-laurel", { l: 0.46, c: 0.11, h: 145 }, { roughness: 0.65 });

  // 레드 카펫 러너 + 연회 단상 + 연회 의자
  addBox(ctx.layers.groundReflection, "palace-carpet", [2.6, 0.014, 14.4], [0, 0.008, 0], velvetMat, { castShadow: false });
  addBox(ctx.layers.architecture, "palace-wall-back", [13.6, 6.4, 0.36], [0, 0, -7.6], marbleMat);
  addBox(ctx.layers.architecture, "palace-dais", [4.4, 0.24, 2.4], [0, 0, -5.8], marbleMat);
  addBox(ctx.layers.architecture, "palace-chair", [0.58, 0.48, 0.56], [-2.8, 0, -1.6], velvetMat);

  // 대열주 기둥 + 주두/주초
  const colZs = ctx.densityLevel === 1 ? [-4.2, 1.4] : [-5.6, -2.0, 1.6, 5.2];
  for (const z of colZs) {
    for (const side of [-1, 1] as const) {
      addBox(ctx.layers.architecture, `palace-plinth-${side}-${z}`, [0.76, 0.42, 0.76], [side * 5.2, 0, z], marbleMat);
      addCylinder(ctx.layers.architecture, `palace-column-${side}-${z}`, 0.26, 0.3, 5.4, [side * 5.2, 0.42, z], marbleMat, 14);
      addBox(ctx.layers.moldings, `palace-capital-${side}-${z}`, [0.82, 0.28, 0.82], [side * 5.2, 5.82, z], goldMat);
    }
  }

  // 대성당급 격자 창틀 + 금장 초상화 액자
  addWindowMullionFrame(ctx, "palace-win-center", [0, 1.2, -7.35], 3.2, 4.2, 0.18, goldMat, glassMat, 0);
  addFramedSignOrArt(ctx, "palace-portrait-left", [-3.6, 1.9, -7.38], [1.4, 2.0, 0.08], goldMat, velvetMat, 0);
  addFramedSignOrArt(ctx, "palace-portrait-right", [3.6, 1.9, -7.38], [1.4, 2.0, 0.08], goldMat, velvetMat, 0);

  // 다층 크리스털 샹들리에
  const tiers = ctx.densityLevel === 1 ? 1 : ctx.densityLevel === 2 ? 2 : 3;
  addCylinder(ctx.layers.lighting, "palace-chandelier-chain", 0.03, 0.03, 1.6, [0, 4.9, -1.2], goldMat, 8);
  for (let t = 0; t < tiers; t += 1) {
    const r = 1.25 - t * 0.32;
    const y = 4.2 + t * 0.42;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 18), goldMat);
    torus.name = `palace-chandelier-ring-${t}`;
    torus.rotation.x = Math.PI * 0.5;
    torus.position.set(0, y, -1.2);
    ctx.layers.lighting.add(torus);
    for (let b = 0; b < 6; b += 1) {
      const ang = (b / 6) * Math.PI * 2;
      addIcoCanopy(ctx.layers.lighting, `palace-crystal-${t}-${b}`, 0.08, [Math.cos(ang) * r, y - 0.14, -1.2 + Math.sin(ang) * r], crystalGlow, 0);
    }
  }

  // 대리석 난간 & 월계수 화분
  addRailingSpan(ctx, "palace-balcony-rail", [3.6, -5.2], [3.6, 1.8], 1.05, marbleMat);
  addPottedPlantOrTree(ctx, "palace-urn-l", [-4.1, 4.2], 1.15, goldMat, marbleMat, leafMat);
  addPottedPlantOrTree(ctx, "palace-urn-r", [4.1, 4.2], 1.15, goldMat, marbleMat, leafMat);
  addAtmosphereParticles(ctx, 303, preset.footprintMeters, { l: 0.92, c: 0.14, h: 86 }, 0.05);
}

function populateAcademySunsetRooftop(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.64, c: 0.018, h: 75 });
  const concreteMat = getOrCreateMaterial(ctx, "roof-concrete", { l: 0.72, c: 0.02, h: 75 }, { roughness: 0.82 });
  const fenceMat = getOrCreateMaterial(ctx, "roof-steel", { l: 0.44, c: 0.02, h: 245 }, { roughness: 0.36, metalness: 0.72 });
  const woodMat = getOrCreateMaterial(ctx, "roof-wood", { l: 0.52, c: 0.08, h: 58 }, { roughness: 0.68 });
  const glassMat = getOrCreateMaterial(ctx, "roof-glass", { l: 0.76, c: 0.07, h: 48 }, { roughness: 0.12, metalness: 0.25 });
  const lampGlow = getOrCreateMaterial(ctx, "roof-lamp", { l: 0.9, c: 0.14, h: 68 }, { emissive: { l: 0.86, c: 0.16, h: 62 }, emissiveIntensity: 1.3 });
  const signMat = getOrCreateMaterial(ctx, "roof-sign", { l: 0.58, c: 0.17, h: 28 }, { roughness: 0.55 });
  const leafMat = getOrCreateMaterial(ctx, "roof-leaf", { l: 0.48, c: 0.11, h: 140 }, { roughness: 0.7 });

  // 옥탑 계단실 + 물탱크 + 벤치
  addBox(ctx.layers.architecture, "roof-penthouse", [3.6, 3.1, 3.2], [-3.6, 0, -2.8], concreteMat);
  addBox(ctx.layers.architecture, "roof-door", [1.0, 2.08, 0.12], [-1.82, 0, -2.6], fenceMat);
  addBox(ctx.layers.architecture, "roof-bench", [1.6, 0.44, 0.48], [-2.2, 0, -1.0], woodMat);
  addCylinder(ctx.layers.architecture, "roof-water-tank", 0.9, 0.9, 1.85, [3.8, 0.45, -3.1], fenceMat, 14);
  addBox(ctx.layers.architecture, "roof-tank-stand", [1.6, 0.45, 1.6], [3.8, 0, -3.1], concreteMat);

  // 옥탑 창틀 + 출입 주의 표지판 + 옥탑 외등
  addWindowMullionFrame(ctx, "roof-penthouse-win", [-3.6, 1.4, -1.16], 1.4, 0.95, 0.12, fenceMat, glassMat, 0);
  addFramedSignOrArt(ctx, "roof-safety-sign", [-1.76, 1.55, -1.5], [0.55, 0.42, 0.04], fenceMat, signMat, Math.PI * 0.5);
  addPendantFixture(ctx, "roof-entry-light", [-1.3, -2.5], 3.1, 0.35, fenceMat, lampGlow);

  // 3면 철제 안전펜스 난간 + 화분 플랜터
  addRailingSpan(ctx, "roof-fence-north", [-5.4, -4.2], [5.4, -4.2], 1.15, fenceMat);
  addRailingSpan(ctx, "roof-fence-east", [5.4, -4.2], [5.4, 4.2], 1.15, fenceMat);
  if (ctx.densityLevel >= 2) {
    addRailingSpan(ctx, "roof-fence-west", [-5.4, -0.6], [-5.4, 4.2], 1.15, fenceMat);
  }
  addPottedPlantOrTree(ctx, "roof-planter-1", [3.2, 2.2], 0.92, concreteMat, woodMat, leafMat);
  if (ctx.densityLevel >= 3) {
    addPottedPlantOrTree(ctx, "roof-planter-2", [-4.0, 2.5], 0.88, concreteMat, woodMat, leafMat);
    addBox(ctx.layers.architecture, "roof-hvac-duct", [1.2, 0.65, 0.8], [1.8, 0, -3.4], fenceMat);
  }
  addAtmosphereParticles(ctx, 404, preset.footprintMeters, { l: 0.84, c: 0.16, h: 35 }, 0.055);
}

function populateCyberSubwayPlatform(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.3, c: 0.025, h: 250 });
  const steelMat = getOrCreateMaterial(ctx, "subway-steel", { l: 0.42, c: 0.03, h: 245 }, { roughness: 0.32, metalness: 0.78 });
  const yellowTactile = getOrCreateMaterial(ctx, "subway-tactile", { l: 0.82, c: 0.17, h: 90 }, { roughness: 0.58 });
  const cyanLed = getOrCreateMaterial(ctx, "subway-cyan", { l: 0.8, c: 0.17, h: 205 }, { emissive: { l: 0.78, c: 0.18, h: 205 }, emissiveIntensity: 1.7 });
  const glassMat = getOrCreateMaterial(ctx, "subway-glass", { l: 0.62, c: 0.06, h: 220 }, { roughness: 0.1, metalness: 0.3 });
  const leafMat = getOrCreateMaterial(ctx, "subway-moss", { l: 0.48, c: 0.12, h: 155 }, { roughness: 0.68 });
  const darkTrim = getOrCreateMaterial(ctx, "subway-dark", { l: 0.22, c: 0.02, h: 255 }, { roughness: 0.45, metalness: 0.6 });

  // 노란 점자 안전블록 + 천장 보 + H빔 기둥 + 벤치
  addBox(ctx.layers.groundReflection, "subway-tactile-strip", [0.42, 0.012, 15.2], [2.4, 0.008, 0], yellowTactile, { castShadow: false });
  addBox(ctx.layers.architecture, "subway-ceiling", [10.6, 0.24, 15.6], [0, 3.9, 0], darkTrim);
  addBox(ctx.layers.architecture, "subway-bench", [0.54, 0.45, 2.2], [-1.4, 0, -0.4], steelMat);

  const pillarZs = ctx.densityLevel === 1 ? [-4.0, 2.0] : [-5.6, -1.8, 2.0, 5.8];
  for (const z of pillarZs) {
    addBox(ctx.layers.architecture, `subway-pillar-${z}`, [0.46, 3.9, 0.46], [-2.8, 0, z], steelMat);
    addFramedSignOrArt(ctx, `subway-route-sign-${z}`, [-2.52, 2.1, z], [0.08, 0.75, 1.3], darkTrim, cyanLed, 0);
    addPendantFixture(ctx, `subway-led-${z}`, [0.2, z], 3.9, 0.35, darkTrim, cyanLed);
  }
  // 스크린도어 창틀 & 안전 난간
  addWindowMullionFrame(ctx, "subway-psd-1", [3.1, 0.05, -2.4], 3.4, 2.6, 0.14, steelMat, glassMat, Math.PI * 0.5);
  addWindowMullionFrame(ctx, "subway-psd-2", [3.1, 0.05, 2.4], 3.4, 2.6, 0.14, steelMat, glassMat, Math.PI * 0.5);
  addRailingSpan(ctx, "subway-psd-guard", [2.95, -5.8], [2.95, 5.8], 1.04, steelMat);
  addPottedPlantOrTree(ctx, "subway-planter", [-3.6, 4.2], 0.85, darkTrim, steelMat, leafMat);
  addAtmosphereParticles(ctx, 505, preset.footprintMeters, { l: 0.82, c: 0.16, h: 205 }, 0.05);
}

function populateModernWebtoonOffice(ctx: SceneBuilderContext, preset: RichWebtoonScenePresetMeta): void {
  buildGroundSlab(ctx, preset, { l: 0.78, c: 0.028, h: 78 });
  const wallMat = getOrCreateMaterial(ctx, "office-wall", { l: 0.94, c: 0.01, h: 80 }, { roughness: 0.8 });
  const deskMat = getOrCreateMaterial(ctx, "office-desk", { l: 0.66, c: 0.055, h: 68 }, { roughness: 0.48 });
  const aluMat = getOrCreateMaterial(ctx, "office-alu", { l: 0.58, c: 0.018, h: 240 }, { roughness: 0.28, metalness: 0.76 });
  const screenGlow = getOrCreateMaterial(ctx, "office-screen", { l: 0.82, c: 0.1, h: 225 }, { emissive: { l: 0.75, c: 0.11, h: 225 }, emissiveIntensity: 0.9 });
  const glassMat = getOrCreateMaterial(ctx, "office-glass", { l: 0.86, c: 0.03, h: 215 }, { roughness: 0.08, metalness: 0.18 });
  const chairMat = getOrCreateMaterial(ctx, "office-chair", { l: 0.34, c: 0.03, h: 255 }, { roughness: 0.72 });
  const lightGlow = getOrCreateMaterial(ctx, "office-led", { l: 0.97, c: 0.02, h: 95 }, { emissive: { l: 0.95, c: 0.02, h: 95 }, emissiveIntensity: 1.35 });
  const leafMat = getOrCreateMaterial(ctx, "office-leaf", { l: 0.48, c: 0.11, h: 145 }, { roughness: 0.66 });

  // 사무실 벽체 + 액정타블렛 워크스테이션 + 작업 의자
  addBox(ctx.layers.architecture, "office-wall-back", [10.8, 3.4, 0.22], [0, 0, -4.8], wallMat);
  addBox(ctx.layers.architecture, "office-desk-main", [1.8, 0.06, 0.88], [-2.0, 0.72, -1.6], deskMat);
  addBox(ctx.layers.architecture, "office-desk-leg-l", [0.06, 0.72, 0.78], [-2.8, 0, -1.6], aluMat);
  addBox(ctx.layers.architecture, "office-desk-leg-r", [0.06, 0.72, 0.78], [-1.2, 0, -1.6], aluMat);
  addBox(ctx.layers.architecture, "office-pen-display", [0.64, 0.4, 0.06], [-2.0, 0.78, -1.65], screenGlow);
  addBox(ctx.layers.architecture, "office-chair", [0.52, 0.46, 0.52], [-2.0, 0, -0.8], chairMat);

  // 유리 파티션 창틀 몰딩 + 스토리보드 액자 + 천장 조명 배플
  addWindowMullionFrame(ctx, "office-glass-partition", [0, 0.2, -4.64], 4.2, 2.6, 0.1, aluMat, glassMat, 0);
  addFramedSignOrArt(ctx, "office-storyboard-1", [-3.5, 1.55, -4.66], [1.4, 0.95, 0.05], aluMat, screenGlow, 0);
  if (ctx.densityLevel >= 2) {
    addFramedSignOrArt(ctx, "office-storyboard-2", [3.4, 1.55, -4.66], [1.4, 0.95, 0.05], aluMat, deskMat, 0);
  }
  const baffleZs = ctx.densityLevel === 1 ? [-1.4, 1.6] : ctx.densityLevel === 2 ? [-2.6, 0, 2.6] : [-3.2, -1.1, 1.1, 3.2];
  baffleZs.forEach((z, idx) => addPendantFixture(ctx, `office-baffle-${idx}`, [0, z], 3.55, 0.45, aluMat, lightGlow));

  // 복도 유리 난간 & 실내 수목
  addRailingSpan(ctx, "office-corridor-rail", [3.3, -3.6], [3.3, 2.8], 1.02, aluMat);
  addPottedPlantOrTree(ctx, "office-tree-1", [3.9, -3.8], 1.15, wallMat, deskMat, leafMat);
  if (ctx.densityLevel >= 2) addPottedPlantOrTree(ctx, "office-tree-2", [-4.2, 2.4], 0.95, wallMat, deskMat, leafMat);
  if (ctx.densityLevel >= 3) {
    addBox(ctx.layers.architecture, "office-bookshelf", [1.5, 2.1, 0.42], [-4.2, 0, -2.6], deskMat);
  }
  addAtmosphereParticles(ctx, 606, preset.footprintMeters, { l: 0.92, c: 0.03, h: 215 }, 0.04);
}

function countMeshes(group: THREE.Group): number {
  let count = 0;
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) count += 1;
  });
  return count;
}

/**
 * 지정한 6종 고밀도 웹툰 배경 세트와 디테일 밀도(`basic` | `rich` | `ultra`)로
 * 실제 Three.js 씬 그룹을 생성하고 실측 매니폴드 검증 결과 및 GPU 해제 함수를 반환한다.
 */
export function buildRichWebtoonScenePreset(
  presetId: RichWebtoonScenePresetId,
  density: RichSceneDensityTier = "rich",
): RichWebtoonSceneBuildResult {
  const preset = getRichWebtoonScenePreset(presetId) ?? RICH_WEBTOON_SCENE_PRESETS[0]!;
  const densityOption =
    RICH_SCENE_DENSITY_OPTIONS.find((item) => item.id === density) ?? RICH_SCENE_DENSITY_OPTIONS[1]!;

  const root = new THREE.Group();
  root.name = `bg3d-rich-scene:${preset.id}:${densityOption.id}`;

  const makeLayer = (name: string): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    return g;
  };

  const ctx: SceneBuilderContext = {
    root,
    layers: {
      architecture: makeLayer("layer:architecture"),
      moldings: makeLayer("layer:moldings"),
      lighting: makeLayer("layer:lighting"),
      signageFrames: makeLayer("layer:signage-frames"),
      foliage: makeLayer("layer:foliage"),
      railings: makeLayer("layer:railings"),
      groundReflection: makeLayer("layer:ground-reflection"),
      particles: makeLayer("layer:particles"),
    },
    densityLevel: densityOption.detailMultiplier as 1 | 2 | 3,
    particleCount: densityOption.particleCount,
    materials: new Map(),
  };

  switch (preset.id) {
    case "seoul-neon-alley":
      populateSeoulNeonAlley(ctx, preset);
      break;
    case "sunlit-atelier-cafe":
      populateSunlitAtelierCafe(ctx, preset);
      break;
    case "rofan-imperial-banquet":
      populateRofanImperialBanquet(ctx, preset);
      break;
    case "academy-sunset-rooftop":
      populateAcademySunsetRooftop(ctx, preset);
      break;
    case "cyber-subway-platform":
      populateCyberSubwayPlatform(ctx, preset);
      break;
    case "modern-webtoon-office":
      populateModernWebtoonOffice(ctx, preset);
      break;
  }

  const metrics = validateObject3DManifoldAndGrounding(root);
  const layerSummary: RichWebtoonSceneLayerSummary = Object.freeze({
    architectureMeshes: countMeshes(ctx.layers.architecture),
    moldingMeshes: countMeshes(ctx.layers.moldings),
    lightingMeshes: countMeshes(ctx.layers.lighting),
    signageFrameMeshes: countMeshes(ctx.layers.signageFrames),
    foliageMeshes: countMeshes(ctx.layers.foliage),
    railingMeshes: countMeshes(ctx.layers.railings),
    groundReflectionMeshes: countMeshes(ctx.layers.groundReflection),
    atmosphereParticles: metrics.pointsCount,
  });

  let disposed = false;
  const dispose = (): DisposedGpuResourceCounts => {
    if (disposed) {
      return Object.freeze({ disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0 });
    }
    disposed = true;
    try {
      return disposeObject3DResources(root);
    } finally {
      ctx.materials.clear();
      root.clear();
    }
  };

  return Object.freeze({
    preset,
    density: densityOption.id,
    group: root,
    recommendedAtmosphereId: preset.recommendedAtmosphereId,
    furnitureAnchors: preset.furnitureAnchors,
    layerSummary,
    metrics,
    dispose,
  });
}
