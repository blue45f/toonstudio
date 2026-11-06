import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { studioSpaceEmoteById } from "../studio-virtual-space-emote-catalog";
import { studioEmoteDefinition, type StudioEmoteKind } from "../studio-virtual-space-emotes";
import type { StudioVirtualSpacePoint, StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import { userStatusBadge } from "../studio-virtual-space-user-status";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { STUDIO_THREE_SCALE, worldToThree } from "./studio-virtual-space-three-scene";
import { disposeStudioThreeOwnedModel } from "./studio-virtual-space-three-asset-loader";
import { studioThreeFillLightIntensity } from "./studio-virtual-space-three-motion";
import { StudioThreePendingLoads, type StudioThreePendingController } from "./studio-virtual-space-three-runtime-policy";

import type { StudioThreeLightingPreset } from "./studio-virtual-space-three-hdri-controller";

export { createStudioThreeHdriController, STUDIO_THREE_HDRI_URLS } from "./studio-virtual-space-three-hdri-controller";
export type { StudioThreeLightingPreset } from "./studio-virtual-space-three-hdri-controller";

export interface StudioThreeLocalBoxFilter {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface StudioThreeZoneDioramaSpec {
  readonly roomId: string;
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly targetWidthMeters: number;
  readonly targetDepthMeters: number;
  readonly scaleY: number;
  readonly elevationMeters: number;
  readonly rotationY?: number;
  readonly hiddenNodeSubstrings?: readonly string[];
  readonly clearLocalBoxes?: readonly StudioThreeLocalBoxFilter[];
}

/**
 * 10개 캠퍼스 구역에 일대일 대응하는 풀 3D 건축 디오라마 에셋(`/assets/3d/environments/...`) 명세.
 * 모든 실내 구역은 북·서 L자 컷어웨이(남·동 개방) 구조 및 중앙 동선 클리어런스로 맞춰 카메라 시야 가림을 원천 차단한다.
 */
export const STUDIO_THREE_ZONE_DIORAMAS: readonly StudioThreeZoneDioramaSpec[] = Object.freeze([
  {
    roomId: "skyport",
    url: "/assets/3d/environments/expansion-v1/independent_bookshop.glb",
    x: 448,
    y: 416,
    targetWidthMeters: 19.2,
    targetDepthMeters: 17.2,
    scaleY: 1.18,
    elevationMeters: -0.14,
    hiddenNodeSubstrings: [
      "Bookshop_Shopfront_Glass",
      "Refined_BookshopReadingChair",
      "Bookshop_CounterLamp",
      "RefinedSurface_Ink_blue",
      "RefinedSurface_Ink blue",
    ],
    clearLocalBoxes: [
      { minX: -4.2, maxX: 4.2, minY: 0.14, maxY: 4.0, minZ: -2.2, maxZ: 4.2 },
    ],
  },
  {
    roomId: "personal-atelier",
    url: "/assets/3d/environments/classroom_art_studio.glb",
    x: 1216,
    y: 416,
    targetWidthMeters: 19.2,
    targetDepthMeters: 17.2,
    scaleY: 1.16,
    elevationMeters: -0.09,
    hiddenNodeSubstrings: [
      "RightWall",
      "CeilingLight",
      "Sculpture_",
      "Easel_5_",
      "Easel_6_",
      "Easel_7_",
      "Easel_8_",
      "Canvas_5_",
      "Canvas_6_",
      "Canvas_7_",
      "Canvas_8_",
      "Stool_5_",
      "Stool_6_",
      "Stool_7_",
      "Stool_8_",
    ],
  },
  {
    roomId: "story-lab",
    url: "/assets/3d/environments/expansion-v1/library_reading_room.glb",
    x: 1984,
    y: 416,
    targetWidthMeters: 19.2,
    targetDepthMeters: 17.2,
    scaleY: 1.14,
    elevationMeters: -0.14,
    hiddenNodeSubstrings: ["Refined_ReadingChair", "Refined_LibraryPlant"],
  },
  {
    roomId: "creator-cafe",
    url: "/assets/3d/environments/stylized_cafe_interior.glb",
    x: 2688,
    y: 416,
    targetWidthMeters: 15.4,
    targetDepthMeters: 17.2,
    scaleY: 1.18,
    elevationMeters: -0.09,
    hiddenNodeSubstrings: [
      "RightWall",
      "CafeTable_2_",
      "CafeChair_2_",
      "CafeTable_4_",
      "CafeChair_4_",
    ],
  },
  {
    roomId: "team-meeting",
    url: "/assets/3d/environments/expansion-v1/science_research_laboratory.glb",
    x: 448,
    y: 1088,
    targetWidthMeters: 19.2,
    targetDepthMeters: 15.2,
    scaleY: 1.16,
    elevationMeters: -0.14,
    hiddenNodeSubstrings: [
      "Lab_BackBench",
      "RefinedSurface_Sage",
      "RefinedSurface_Steel",
      "RefinedSurface_Porcelain",
      "RefinedSurface_Glass",
    ],
    clearLocalBoxes: [
      { minX: -4.8, maxX: 3.6, minY: 0.16, maxY: 3.6, minZ: -3.78, maxZ: 2.5 },
    ],
  },
  {
    roomId: "creator-plaza",
    url: "/assets/3d/environments/expansion-v1/park_garden_pavilion.glb",
    x: 1472,
    y: 1088,
    targetWidthMeters: 28.0,
    targetDepthMeters: 15.2,
    scaleY: 1.22,
    elevationMeters: -0.14,
  },
  {
    roomId: "event-stage",
    url: "/assets/3d/environments/korean_school_rooftop.glb",
    x: 2560,
    y: 1088,
    targetWidthMeters: 23.2,
    targetDepthMeters: 15.2,
    scaleY: 1.12,
    elevationMeters: -0.12,
    hiddenNodeSubstrings: [
      "Fence_Right",
      "Parapet_Right",
      "ParapetRight",
      "ParapetFront",
      "HVAC",
      "SolarPanel",
      "WaterTank",
      "Stairwell_",
      "RoofSafetyZone",
      "SchoolName_",
      "RoofCourt_",
    ],
  },
  {
    roomId: "arcade",
    url: "/assets/3d/environments/compact_apartment_interior.glb",
    x: 448,
    y: 1632,
    targetWidthMeters: 19.2,
    targetDepthMeters: 9.6,
    scaleY: 1.18,
    elevationMeters: -0.09,
    hiddenNodeSubstrings: [
      "RightWall",
      "Bed_",
      "Kitchen_",
      "Sofa_",
      "CoffeeTable_",
      "Dining",
      "Media_",
    ],
  },
  {
    roomId: "beach",
    url: "/assets/3d/environments/fantasy_ruin_courtyard.glb",
    x: 1472,
    y: 1624,
    targetWidthMeters: 15.8,
    targetDepthMeters: 11.0,
    scaleY: 0.96,
    elevationMeters: -0.1,
    hiddenNodeSubstrings: [
      "Arch_",
      "Column_",
      "Vine_",
      "Fountain_",
      "Wildflower",
      "RubbleStone",
    ],
  },
  {
    roomId: "review-gallery",
    url: "/assets/3d/environments/expansion-v1/fashion_boutique.glb",
    x: 2560,
    y: 1632,
    targetWidthMeters: 23.2,
    targetDepthMeters: 9.6,
    scaleY: 1.16,
    elevationMeters: -0.14,
    hiddenNodeSubstrings: [
      "Fashion_fabric",
      "Fashion fabric",
      "Upholstery",
      "Black_metal",
      "Black metal",
      "Limestone",
    ],
    clearLocalBoxes: [
      { minX: -6.0, maxX: 3.5, minY: 0.16, maxY: 3.2, minZ: -3.2, maxZ: 3.8 },
    ],
  },
]);


function filterMeshGeometryByLocalBoxes(
  mesh: THREE.Mesh,
  boxes: readonly StudioThreeLocalBoxFilter[],
): void {
  const combinedName = `${mesh.name} ${mesh.parent?.name ?? ""}`;
  if (/Floor|Ivory plaster|Garden leaf|Garden_leaf|Garden grass|Garden_grass|Garden soil|Garden_soil|Limestone|Cube\.001|^Cube\b/i.test(combinedName)) return;
  const geom = mesh.geometry;
  const pos = geom.getAttribute("position");
  if (!pos) return;
  const inAnyBox = (idx: number): boolean => {
    const x = pos.getX(idx);
    const y = pos.getY(idx);
    const z = pos.getZ(idx);
    return boxes.some(
      (b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ,
    );
  };
  const indexAttr = geom.getIndex();
  if (indexAttr) {
    const kept: number[] = [];
    for (let i = 0; i + 2 < indexAttr.count; i += 3) {
      const a = indexAttr.getX(i);
      const b = indexAttr.getX(i + 1);
      const c = indexAttr.getX(i + 2);
      if (inAnyBox(a) || inAnyBox(b) || inAnyBox(c)) continue;
      kept.push(a, b, c);
    }
    if (kept.length === 0) {
      mesh.visible = false;
    } else if (kept.length !== indexAttr.count) {
      const cloned = geom.clone();
      cloned.setIndex(kept);
      cloned.computeBoundingSphere();
      mesh.geometry = cloned;
    }
  }
}

/**
 * 10개 구역의 풀 3D 건축 디오라마 GLB를 로드하여 각 구역 좌표에 정밀 배치한다.
 */
function dioramaExcluded(node: THREE.Object3D, excluded: ReadonlySet<THREE.Object3D>): boolean {
  let ancestor: THREE.Object3D | null = node;
  while (ancestor) { if (excluded.has(ancestor)) return true; ancestor = ancestor.parent; }
  return false;
}

function dioramaBounds(model: THREE.Object3D, excluded: ReadonlySet<THREE.Object3D>): THREE.Box3 {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), local = new THREE.Box3();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (dioramaExcluded(node, excluded)) return;
    let box: THREE.Box3 | null;
    if (node instanceof THREE.SkinnedMesh || node instanceof THREE.InstancedMesh) {
      node.computeBoundingBox(); box = node.boundingBox;
    } else {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box = node.geometry.boundingBox;
    }
    if (box) bounds.union(local.copy(box).applyMatrix4(node.matrixWorld));
  });
  return bounds;
}

export function loadStudioThreeZoneDioramas(
  scene: THREE.Scene,
  loader: GLTFLoader,
  isDisposed: () => boolean,
  onAssetError?: (url: string) => void,
): StudioThreePendingController & { readonly dispose: () => void } {
  const pending = new StudioThreePendingLoads();
  const owned = new Set<{ readonly root: THREE.Group; readonly orphaned: Set<THREE.BufferGeometry> }>();
  let stopped = false;
  const release = (record: { readonly root: THREE.Group; readonly orphaned: Set<THREE.BufferGeometry> }) => {
    record.root.removeFromParent();
    const current = new Set<THREE.BufferGeometry>(), failures: unknown[] = [];
    record.root.traverse((node) => { if (node instanceof THREE.Mesh) current.add(node.geometry); });
    try { disposeStudioThreeOwnedModel(record.root); } catch (error) { failures.push(error); }
    for (const geometry of record.orphaned) if (!current.has(geometry)) {
      try { geometry.dispose(); } catch (error) { failures.push(error); }
    }
    record.root.clear();
    if (failures.length) throw new AggregateError(failures, "디오라마 자원 해제에 실패했습니다.");
  };
  for (const spec of STUDIO_THREE_ZONE_DIORAMAS) {
    const finish = pending.begin();
    const accept = (gltf: GLTF) => {
      const model = gltf.scene;
      if (isDisposed() || stopped) { disposeStudioThreeOwnedModel(model); return; }
      const wrapper = new THREE.Group();
      wrapper.name = `zone-diorama-${spec.roomId}`;
      wrapper.add(model);
      const record = { root: wrapper, orphaned: new Set<THREE.BufferGeometry>() };
      owned.add(record);
      try {
        const hiddenPatterns = spec.hiddenNodeSubstrings ?? [];
        const excluded = new Set<THREE.Object3D>();
        if (hiddenPatterns.length > 0) {
          model.traverse((child) => {
            if (!child.name) return;
            if (hiddenPatterns.some((pat) => child.name.includes(pat))) {
              child.visible = false;
              excluded.add(child);
            }
          });
        }

        const clearBoxes = spec.clearLocalBoxes ?? [];
        model.traverse((child) => {
          if (dioramaExcluded(child, excluded)) return;
          if (child instanceof THREE.Mesh) {
            if (clearBoxes.length > 0) {
              const previous = child.geometry;
              filterMeshGeometryByLocalBoxes(child, clearBoxes);
              if (previous !== child.geometry) record.orphaned.add(previous);
            }
            child.castShadow = true;
            child.receiveShadow = true;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of materials) {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.envMapIntensity = 1.15;
                mat.needsUpdate = true;
              }
            }
          }
        });

        model.updateMatrixWorld(true);
        const rawBox = dioramaBounds(model, excluded);
        if (rawBox.isEmpty()) throw new Error("디오라마에 표시할 geometry가 없습니다.");
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);

        const scaleX = spec.targetWidthMeters / Math.max(1, rawSize.x);
        const scaleZ = spec.targetDepthMeters / Math.max(1, rawSize.z);
        model.scale.set(scaleX, spec.scaleY, scaleZ);
        model.updateMatrixWorld(true);

        const scaledBox = dioramaBounds(model, excluded);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        model.position.set(
          -scaledCenter.x,
          -scaledBox.min.y + spec.elevationMeters,
          -scaledCenter.z,
        );
        wrapper.position.copy(worldToThree({ x: spec.x, y: spec.y }, 0));
        if (spec.rotationY) wrapper.rotation.y = spec.rotationY;
        scene.add(wrapper);
      } catch (error) {
        owned.delete(record);
        try { release(record); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "디오라마 준비와 해제에 실패했습니다.", { cause: cleanupError }); }
        throw error;
      }
    };
    try {
      loader.load(spec.url, (gltf) => {
        try { accept(gltf); } finally { finish(); }
      }, undefined, () => {
        // 오류를 보고하고 기본 건축 구성을 유지한다. 자동 재시도는 하지 않는다.
        finish();
        if (!stopped && !isDisposed()) onAssetError?.(spec.url);
      });
    } catch (error) { finish(); throw error; }
  }
  return {
    getPendingCount: () => pending.getPendingCount(),
    getPendingRevision: () => pending.getPendingRevision(),
    whenIdle: () => pending.whenIdle(),
    dispose() {
      if (stopped) return;
      stopped = true;
      const records = [...owned], failures: unknown[] = [];
      owned.clear();
      for (const record of records) { try { release(record); } catch (error) { failures.push(error); } }
      if (failures.length) throw new AggregateError(failures, "디오라마 전체 해제에 실패했습니다.");
    },
  };
}

export interface StudioThreeChromePostPipeline {
  readonly render: () => void;
  readonly setSize: (width: number, height: number) => void;
  readonly setBloomStrength: (strength: number) => void;
  readonly dispose: () => void;
}

/**
 * Chrome 전용 하드웨어 MSAA + ACES Filmic 톤매핑 + sRGB 색공간 단일 패스 렌더 파이프라인을 구성한다.
 */
export function createStudioThreeChromePostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): StudioThreeChromePostPipeline {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setSize(width, height);
  return {
    render: () => {
      renderer.render(scene, camera);
    },
    setSize: (w, h) => {
      renderer.setSize(w, h);
    },
    setBloomStrength: (strength) => {
      renderer.toneMappingExposure = strength > 0.2 ? 0.9 : 0.96;
    },
    dispose: () => {},
  };
}

/** 디오라마 룸 경계 외곽의 깔끔한 플린스(Plinth) 치수 계산 보조. */
export function computeZonePlinthTransform(tiles: {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}): {
  readonly cx: number;
  readonly cz: number;
  readonly zw: number;
  readonly zh: number;
} {
  const zx = tiles.column * 64 * STUDIO_THREE_SCALE;
  const zz = tiles.row * 64 * STUDIO_THREE_SCALE;
  const zw = tiles.width * 64 * STUDIO_THREE_SCALE;
  const zh = tiles.height * 64 * STUDIO_THREE_SCALE;
  return { cx: zx + zw / 2, cz: zz + zh / 2, zw, zh };
}

export interface ProjectedOverlayItem {
  readonly id: string;
  readonly targetId?: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly kind: "self" | "peer" | "npc" | "zone" | "workstation";
  readonly x: number;
  readonly y: number;
  readonly accent?: string;
  readonly active?: boolean;
}

export const WORKSTATION_ACTION_BADGES: Readonly<
  Record<string, { readonly ko: string; readonly en: string; readonly color: string }>
> = Object.freeze({
  assistant: { ko: "AI 도우미", en: "AI Assistant", color: "#3b82f6" },
  canvas: { ko: "원고 캔버스", en: "Canvas", color: "#8b5cf6" },
  story: { ko: "스토리·콘티", en: "Story", color: "#06b6d4" },
  live: { ko: "라이브 협업", en: "Live", color: "#10b981" },
  review: { ko: "피드백 리뷰", en: "Review", color: "#a855f7" },
  assets: { ko: "에셋 아카이브", en: "Assets", color: "#f59e0b" },
  community: { ko: "라운지", en: "Lounge", color: "#ec4899" },
  comic: { ko: "플레이", en: "Arcade", color: "#38bdf8" },
});

export const DUPLICATE_ARCADE_IDS: ReadonlySet<string> = new Set([
  "campus-arcade-cabinet-2",
  "campus-arcade-cabinet-3",
  "campus-arcade-cabinet-4",
]);

/** 조명 프리셋 전환 시 씬 배경·안개·직사광·보조광·노출값을 동기화한다. */
export function applyStudioLightingPresetToScene(
  preset: StudioThreeLightingPreset,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hemiLight: THREE.HemisphereLight,
  dirLight: THREE.DirectionalLight,
  postPipeline: StudioThreeChromePostPipeline,
  fillLight?: THREE.DirectionalLight,
): void {
  const bgHex = preset === "night" ? 0x0f172a : preset === "studio" ? 0x1e293b : 0xdbe4ef;
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.FogExp2(bgHex, preset === "night" ? 0.012 : 0.0085);
  hemiLight.color.setHex(preset === "night" ? 0x93c5fd : 0xffffff);
  hemiLight.groundColor.setHex(preset === "night" ? 0x1e1b4b : 0x94a3b8);
  hemiLight.intensity = preset === "night" ? 0.56 : preset === "studio" ? 0.74 : 0.8;
  dirLight.color.setHex(preset === "night" ? 0xc4b5fd : preset === "studio" ? 0xf8fafc : 0xfffbeb);
  dirLight.intensity = preset === "night" ? 0.76 : preset === "studio" ? 0.98 : 1.08;
  if (fillLight) {
    fillLight.intensity = studioThreeFillLightIntensity(preset);
  }
  renderer.toneMappingExposure = preset === "night" ? 0.9 : preset === "studio" ? 0.95 : 0.96;
  postPipeline.setBloomStrength(preset === "night" ? 0.28 : 0.16);
}

/** 2D 투영 배지들의 화면 겹침을 3-패스 반발력으로 해소한다. */
export function resolveOverlayCollisions(items: ProjectedOverlayItem[]): readonly ProjectedOverlayItem[] {
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i]!;
        const b = items[j]!;
        if (Math.abs(a.x - b.x) < 148 && Math.abs(a.y - b.y) < 32) {
          const overlap = 32 - Math.abs(a.y - b.y);
          const [upperIdx, lowerIdx] = a.y <= b.y ? [i, j] : [j, i];
          items[upperIdx] = { ...items[upperIdx]!, y: items[upperIdx]!.y - overlap * 0.65 };
          items[lowerIdx] = { ...items[lowerIdx]!, y: items[lowerIdx]!.y + overlap * 0.35 };
        }
      }
    }
  }
  return items;
}

/** 3D 오버레이 배지 종류별 인라인 스타일을 반환한다. */
export function getOverlayBadgeStyle(
  item: ProjectedOverlayItem,
  isInteractive: boolean,
): Record<string, string | number> {
  return {
    position: "absolute",
    left: `${item.x}px`,
    top: `${item.y}px`,
    transform: "translate(-50%, -100%)",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: item.kind === "zone" || item.kind === "workstation" ? "4px 10px" : "3px 9px",
    borderRadius: item.kind === "zone" ? "10px" : "999px",
    pointerEvents: isInteractive ? "auto" : "none",
    cursor: isInteractive ? "pointer" : "default",
    background:
      item.kind === "self" || (item.kind === "workstation" && item.active)
        ? "rgba(30, 27, 75, 0.92)"
        : "rgba(15, 23, 42, 0.84)",
    border:
      item.kind === "zone"
        ? "1px solid rgba(56, 189, 248, 0.55)"
        : item.kind === "self" || item.kind === "peer"
          ? `1px solid ${item.accent ?? "rgba(129, 140, 248, 0.75)"}`
          : item.kind === "workstation"
            ? `1px solid ${item.active ? "#38bdf8" : item.accent ?? "rgba(148, 163, 184, 0.45)"}`
            : item.active
              ? "1px solid rgba(167, 139, 250, 0.85)"
              : "1px solid rgba(148, 163, 184, 0.35)",
    color: "#f8fafc",
    fontSize: item.kind === "zone" ? "11.5px" : "11px",
    fontWeight: 800,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    boxShadow: item.active
      ? "0 0 0 2px rgba(56, 189, 248, 0.28), 0 8px 20px rgba(15, 23, 42, 0.38)"
      : "0 6px 18px rgba(15, 23, 42, 0.32)",
    backdropFilter: "blur(8px)",
  };
}

export interface ParticipantOverlayRealtimeExtras {
  readonly reactionId?: string | null;
  readonly chatBubbleText?: string | null;
  readonly chatTyping?: boolean;
}

/** 참가자(본인·동료)의 상태·이모트·말풍선·집중모드를 3D 배지용 텍스트와 강조 색상으로 변환한다. */
export function formatParticipantOverlayBadge(
  state: StudioVirtualSpacePresenceState,
  isEn: boolean,
  fallbackKo: string,
  fallbackEn: string,
  extras?: ParticipantOverlayRealtimeExtras,
): { readonly sublabel: string; readonly accent: string } {
  const accent =
    state.userStatus === "in-meeting" || state.userStatus === "presenting"
      ? "#ef4444"
      : state.userStatus === "focusing" || state.activity === "focused"
        ? "#a855f7"
        : state.userStatus === "away" || state.userStatus === "break" || state.activity === "away"
          ? "#f59e0b"
          : state.activity === "reviewing"
            ? "#06b6d4"
            : "#10b981";

  const trimmedBubble = extras?.chatBubbleText?.trim() || state.bubble?.trim();
  if (trimmedBubble) {
    return { sublabel: `💬 ${trimmedBubble}`, accent };
  }
  if (extras?.chatTyping || state.typing) {
    return { sublabel: isEn ? "💬 Typing..." : "💬 입력 중...", accent };
  }
  const activeEmote = extras?.reactionId ?? state.emote;
  if (activeEmote) {
    const emoteDef = studioEmoteDefinition(activeEmote as StudioEmoteKind);
    if (emoteDef) {
      return { sublabel: `${emoteDef.icon} ${isEn ? emoteDef.labelEn : emoteDef.labelKo}`, accent };
    }
    const catalogEmote = studioSpaceEmoteById(activeEmote);
    if (catalogEmote) {
      return { sublabel: `${catalogEmote.glyph} ${isEn ? catalogEmote.labelEn : catalogEmote.labelKo}`, accent };
    }
  }
  if (state.userStatus) {
    const badge = userStatusBadge(state.userStatus);
    return { sublabel: `${badge.emoji} ${isEn ? badge.en : badge.ko}`, accent };
  }
  if (state.activity === "focused") {
    return { sublabel: isEn ? "🎯 Focusing" : "🎯 집중 작업", accent };
  }
  if (state.activity === "reviewing") {
    return { sublabel: isEn ? "🔍 Reviewing" : "🔍 원고 검수 중", accent };
  }
  if (state.activity === "away") {
    return { sublabel: isEn ? "🟡 Away" : "🟡 자리 비움", accent };
  }
  return { sublabel: isEn ? fallbackEn : fallbackKo, accent };
}

/** 3D 바닥 클릭 지점이 워크스테이션 또는 NPC 반경 내인지 판별하여 자동 상호작용 대상을 반환한다. */
export function findClickedWorldTarget(
  point: StudioVirtualSpacePoint,
  interactions: StudioVirtualSpaceWorldManifest["interactions"],
  npcs: readonly { readonly id: string; readonly point: StudioVirtualSpacePoint }[],
): { readonly kind: "workstation" | "npc"; readonly id: string } | null {
  let closestWorkstation: { id: string; dist: number } | null = null;
  for (const item of interactions) {
    if (DUPLICATE_ARCADE_IDS.has(item.id)) continue;
    const dist = Math.hypot(item.point.x - point.x, item.point.y - point.y);
    if (dist <= Math.max(item.radius, 64) && (!closestWorkstation || dist < closestWorkstation.dist)) {
      closestWorkstation = { id: item.id, dist };
    }
  }
  if (closestWorkstation) {
    return { kind: "workstation", id: closestWorkstation.id };
  }
  let closestNpc: { id: string; dist: number } | null = null;
  for (const npc of npcs) {
    const dist = Math.hypot(npc.point.x - point.x, npc.point.y - point.y);
    if (dist <= 68 && (!closestNpc || dist < closestNpc.dist)) {
      closestNpc = { id: npc.id, dist };
    }
  }
  if (closestNpc) {
    return { kind: "npc", id: closestNpc.id };
  }
  return null;
}

