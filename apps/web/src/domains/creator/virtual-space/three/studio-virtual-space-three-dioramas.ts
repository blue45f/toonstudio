import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { STUDIO_THREE_SCALE, worldToThree } from "./studio-virtual-space-three-scene";

export type StudioThreeLightingPreset = "day" | "studio" | "night";

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
}

/**
 * 10개 캠퍼스 구역에 일대일 대응하는 풀 3D 건축 디오라마 에셋(`/assets/3d/environments/...`) 명세.
 * 모든 실내 구역은 북·서 L자 컷어웨이(남·동 개방) 구조로 맞춰 카메라 시야 가림을 원천 차단한다.
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
    hiddenNodeSubstrings: ["RightWall", "CeilingLight"],
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
    hiddenNodeSubstrings: ["RightWall"],
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
    hiddenNodeSubstrings: ["Fence_Right", "Parapet_Right"],
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
    hiddenNodeSubstrings: ["RightWall", "Bed_"],
  },
  {
    roomId: "beach",
    url: "/assets/3d/environments/fantasy_ruin_courtyard.glb",
    x: 1472,
    y: 1624,
    targetWidthMeters: 15.8,
    targetDepthMeters: 11.0,
    scaleY: 1.08,
    elevationMeters: -0.1,
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
  },
]);

/** 조명 프리셋별 실측 PolyHaven CC0 HDRI 환경맵(`/assets/3d/hdri/...`) 경로. */
export const STUDIO_THREE_HDRI_URLS: Readonly<Record<StudioThreeLightingPreset, string>> = Object.freeze({
  day: "/assets/3d/hdri/konigsallee_1k.hdr",
  studio: "/assets/3d/hdri/combination_room_1k.hdr",
  night: "/assets/3d/hdri/cobblestone_street_night_1k.hdr",
});

/**
 * 10개 구역의 풀 3D 건축 디오라마 GLB를 로드하여 각 구역 좌표에 정밀 배치한다.
 */
export function loadStudioThreeZoneDioramas(
  scene: THREE.Scene,
  loader: GLTFLoader,
  isDisposed: () => boolean,
): void {
  for (const spec of STUDIO_THREE_ZONE_DIORAMAS) {
    loader.load(
      spec.url,
      (gltf) => {
        if (isDisposed()) return;
        const model = gltf.scene;
        if (!model) return;

        const hiddenPatterns = spec.hiddenNodeSubstrings ?? [];
        if (hiddenPatterns.length > 0) {
          const toRemove: THREE.Object3D[] = [];
          model.traverse((child) => {
            if (!child.name) return;
            if (hiddenPatterns.some((pat) => child.name.includes(pat))) {
              toRemove.push(child);
            }
          });
          for (const node of toRemove) {
            node.removeFromParent();
          }
        }

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
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
        const rawBox = new THREE.Box3().setFromObject(model);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);

        const scaleX = spec.targetWidthMeters / Math.max(1, rawSize.x);
        const scaleZ = spec.targetDepthMeters / Math.max(1, rawSize.z);
        model.scale.set(scaleX, spec.scaleY, scaleZ);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        const wrapper = new THREE.Group();
        wrapper.name = `zone-diorama-${spec.roomId}`;
        model.position.set(
          -scaledCenter.x,
          -scaledBox.min.y + spec.elevationMeters,
          -scaledCenter.z,
        );
        wrapper.add(model);
        wrapper.position.copy(worldToThree({ x: spec.x, y: spec.y }, 0));
        if (spec.rotationY) wrapper.rotation.y = spec.rotationY;
        scene.add(wrapper);
      },
      undefined,
      () => {
        // 환경 디오라마 로드 실패 시 조용히 무시하고 기본 건축 구성을 유지한다.
      },
    );
  }
}

/**
 * Chrome 고품질 PBR 렌더링을 위한 실측 HDRI IBL 환경맵 로더 및 캐시 컨트롤러.
 */
export function createStudioThreeHdriController(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isDisposed: () => boolean,
): {
  readonly applyPreset: (preset: StudioThreeLightingPreset) => void;
  readonly dispose: () => void;
} {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const rgbeLoader = new RGBELoader();
  const envCache = new Map<StudioThreeLightingPreset, THREE.Texture>();
  let activePreset: StudioThreeLightingPreset = "day";

  const applyEnvTexture = (tex: THREE.Texture, preset: StudioThreeLightingPreset) => {
    if (isDisposed() || activePreset !== preset) return;
    scene.environment = tex;
    scene.environmentIntensity = preset === "day" ? 0.88 : preset === "studio" ? 0.95 : 0.62;
  };

  const applyPreset = (preset: StudioThreeLightingPreset) => {
    activePreset = preset;
    const cached = envCache.get(preset);
    if (cached) {
      applyEnvTexture(cached, preset);
      return;
    }
    const url = STUDIO_THREE_HDRI_URLS[preset];
    rgbeLoader.load(
      url,
      (hdrEquirect) => {
        if (isDisposed()) {
          hdrEquirect.dispose();
          return;
        }
        const envMap = pmremGenerator.fromEquirectangular(hdrEquirect).texture;
        hdrEquirect.dispose();
        envCache.set(preset, envMap);
        applyEnvTexture(envMap, preset);
      },
      undefined,
      () => {
        // HDRI 로드 실패 시 기본 디렉셔널/헤미스피어 조명을 유지한다.
      },
    );
  };

  const dispose = () => {
    scene.environment = null;
    for (const tex of envCache.values()) {
      tex.dispose();
    }
    envCache.clear();
    pmremGenerator.dispose();
  };

  return { applyPreset, dispose };
}

export interface StudioThreeChromePostPipeline {
  readonly render: () => void;
  readonly setSize: (width: number, height: number) => void;
  readonly setBloomStrength: (strength: number) => void;
  readonly dispose: () => void;
}

/**
 * Chrome 전용 고품질 MSAA 4x + HalfFloat + ACES Filmic + UnrealBloom 후처리 파이프라인을 구성한다.
 */
export function createStudioThreeChromePostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): StudioThreeChromePostPipeline {
  try {
    const pixelRatio = renderer.getPixelRatio();
    const rtWidth = Math.max(1, Math.floor(width * pixelRatio));
    const rtHeight = Math.max(1, Math.floor(height * pixelRatio));
    const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(renderer, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.16,
      0.42,
      0.9,
    );
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    return {
      render: () => {
        composer.render();
      },
      setSize: (w, h) => {
        composer.setSize(w, h);
      },
      setBloomStrength: (strength) => {
        bloomPass.strength = strength;
      },
      dispose: () => {
        composer.dispose();
        renderTarget.dispose();
      },
    };
  } catch {
    return {
      render: () => {
        renderer.render(scene, camera);
      },
      setSize: () => {},
      setBloomStrength: () => {},
      dispose: () => {},
    };
  }
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

/** 조명 프리셋 전환 시 씬 배경·안개·직사광·노출값을 동기화한다. */
export function applyStudioLightingPresetToScene(
  preset: StudioThreeLightingPreset,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hemiLight: THREE.HemisphereLight,
  dirLight: THREE.DirectionalLight,
  postPipeline: StudioThreeChromePostPipeline,
): void {
  const bgHex = preset === "night" ? 0x0f172a : preset === "studio" ? 0x1e293b : 0xdbe4ef;
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.FogExp2(bgHex, preset === "night" ? 0.012 : 0.0085);
  hemiLight.color.setHex(preset === "night" ? 0x93c5fd : 0xffffff);
  hemiLight.groundColor.setHex(preset === "night" ? 0x1e1b4b : 0x94a3b8);
  hemiLight.intensity = preset === "night" ? 0.68 : preset === "studio" ? 0.92 : 1.04;
  dirLight.color.setHex(preset === "night" ? 0xc4b5fd : preset === "studio" ? 0xf8fafc : 0xfffbeb);
  dirLight.intensity = preset === "night" ? 0.88 : preset === "studio" ? 1.24 : 1.42;
  renderer.toneMappingExposure = preset === "night" ? 0.96 : preset === "studio" ? 1.06 : 1.1;
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
        : item.kind === "self"
          ? "1px solid rgba(129, 140, 248, 0.75)"
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
