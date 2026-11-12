import type {
  Bg3dObjectClusterArchetypeId,
  Bg3dObjectClutterDensity,
  Bg3dObjectSurfaceTheme,
} from "./studio-bg3d-background-object-cluster";

import type { BgPrimitive } from "../studio-background-3d-metadata";

export type Bg3dV11ScenePrimitive = BgPrimitive;
export type Bg3dV11PrimitiveKind = Bg3dV11ScenePrimitive["kind"];

export type Bg3dV11UpperArchetypeId =
  | "ceiling-hvac-cassette-duct"
  | "ceiling-track-spotlight-rig"
  | "window-venetian-blind-pelmet"
  | "alley-projecting-sign-wires"
  | "classroom-ceiling-speaker-projector"
  | "hanok-rafter-choma-lantern";

export type Bg3dV11MountZone = "ceiling" | "window-head" | "upper-wall";

export type Bg3dV11RoomAnchor =
  | "north-wall"
  | "nw-corner"
  | "ceiling-center"
  | "east-window"
  | "alley-facade-upper";

export interface Bg3dV11RoomDimensions {
  width: number;
  depth: number;
  wallHeight: number;
}

export interface Bg3dV11UpperArchetypeMeta {
  id: Bg3dV11UpperArchetypeId;
  shortCode: string;
  labelKo: string;
  mountZone: Bg3dV11MountZone;
  defaultMountHeightMeters: number;
  glbAssetPath: string;
  keywords: readonly string[];
}

interface UpperPartBlueprint {
  key: string;
  nameKo: string;
  kind: Bg3dV11PrimitiveKind;
  localOffsetXZ: [number, number];
  topDropMeters: number;
  sizeMeters: [number, number, number];
  localEulerRad?: [number, number, number];
  paletteSlot: "frame" | "body" | "accent" | "glow";
  roughness: number;
  metalness: number;
  minDensity: Bg3dObjectClutterDensity;
  movableProp?: boolean;
}

export interface BuildBg3dV11UpperClusterSpec {
  archetype: Bg3dV11UpperArchetypeId;
  instanceKey?: string;
  density?: Bg3dObjectClutterDensity;
  theme?: Bg3dObjectSurfaceTheme;
  mountHeightMeters?: number;
  offsetXZ?: [number, number];
  yawDeg?: number;
}

export interface Bg3dLivedInJitterOptions {
  seed: number;
  messiness: number;
}

export interface Bg3dViewportEdgeMetrics {
  lowerBandRatio: number;
  midBandRatio: number;
  upperBandRatio: number;
  totalEdgeScore: number;
  wallBlankAreaReductionPct: number;
}

export type Bg3dHumanSnapRole =
  "seat" | "desk-hands" | "counter-rest" | "gate-pass" | "lean-wall";

export interface Bg3dHumanSnapPoint {
  id: string;
  role: Bg3dHumanSnapRole;
  labelKo: string;
  worldPosition: [number, number, number];
  forwardNormal: [number, number, number];
}

export interface AssembleBg3dV11RoomPipelineSpec {
  room: Bg3dV11RoomDimensions;
  lowerArchetype: Bg3dObjectClusterArchetypeId;
  upperArchetype?: Bg3dV11UpperArchetypeId;
  lowerAnchor?: "north-wall" | "nw-corner";
  density?: Bg3dObjectClutterDensity;
  theme?: Bg3dObjectSurfaceTheme;
  seed?: number;
  messiness?: number;
  instancePrefix?: string;
}

export interface AssembleBg3dV11RoomPipelineResult {
  lowerPrimitives: Bg3dV11ScenePrimitive[];
  upperPrimitives: Bg3dV11ScenePrimitive[];
  combinedPrimitives: Bg3dV11ScenePrimitive[];
  pairedUpperArchetype: Bg3dV11UpperArchetypeId;
  beforeUpperEdgeMetrics: Bg3dViewportEdgeMetrics;
  afterUpperEdgeMetrics: Bg3dViewportEdgeMetrics;
  humanSnapPoints: Bg3dHumanSnapPoint[];
  cutVisibilityTags: {
    allClusterTag: string;
    lowerArchetypeTag: string;
    upperZoneTag: string;
    upperArchetypeTag: string;
  };
}

export const STUDIO_BG3D_LOWER_ARCHETYPE_LABELS_KO: Readonly<
  Record<Bg3dObjectClusterArchetypeId, string>
> = {
  "alley-wall-utility-clutter": "골목 담벼락 설비·실외기 세트",
  "classroom-front-locker-rig": "교실 전면 교탁·사물함 세트",
  "office-creator-workstation": "오피스·작업실 모션데스크 세트",
  "convenience-patio-street-furniture": "편의점 파라솔·거리 가구 세트",
  "subway-platform-gate-bay": "지하철 승강장 개찰구 세트",
  "hospital-ward-corridor-set": "병동 복도 대기석·난간 세트",
  "hanok-jangdokdae-stone-wall": "한옥 돌담·장독대 세트",
  "fantasy-dungeon-alchemy-props": "판타지 연금술 조합대 세트",
};

export const DEFAULT_UPPER_META: Bg3dV11UpperArchetypeMeta = {
  id: "ceiling-hvac-cassette-duct",
  shortCode: "hvac",
  labelKo: "4방향 시스템 에어컨·노출 스파이럴 덕트",
  mountZone: "ceiling",
  defaultMountHeightMeters: 2.8,
  glbAssetPath: "/studio-assets/kitbash-v11/ceiling-hvac-cassette-duct.glb",
  keywords: ["천장", "에어컨", "덕트", "환기구", "공조", "hvac", "ceiling"],
};

export const STUDIO_BG3D_V11_UPPER_ARCHETYPES: readonly Bg3dV11UpperArchetypeMeta[] =
  [
    DEFAULT_UPPER_META,
    {
      id: "ceiling-track-spotlight-rig",
      shortCode: "track",
      labelKo: "천장 트랙 레일·스팟 조명 세트",
      mountZone: "ceiling",
      defaultMountHeightMeters: 2.8,
      glbAssetPath:
        "/studio-assets/kitbash-v11/ceiling-track-spotlight-rig.glb",
      keywords: [
        "조명",
        "레일등",
        "스팟",
        "천장등",
        "루버",
        "spotlight",
        "track",
      ],
    },
    {
      id: "window-venetian-blind-pelmet",
      shortCode: "blind",
      labelKo: "2400×1500 창문 커튼박스·블라인드",
      mountZone: "window-head",
      defaultMountHeightMeters: 2.35,
      glbAssetPath:
        "/studio-assets/kitbash-v11/window-venetian-blind-pelmet.glb",
      keywords: [
        "창문",
        "블라인드",
        "커튼박스",
        "창호",
        "채광",
        "window",
        "blind",
      ],
    },
    {
      id: "alley-projecting-sign-wires",
      shortCode: "sign",
      labelKo: "골목 돌출 간판·애자·전선군",
      mountZone: "upper-wall",
      defaultMountHeightMeters: 2.9,
      glbAssetPath:
        "/studio-assets/kitbash-v11/alley-projecting-sign-wires.glb",
      keywords: ["간판", "돌출간판", "전선", "네온", "골목", "상가", "sign"],
    },
    {
      id: "classroom-ceiling-speaker-projector",
      shortCode: "avrig",
      labelKo: "교실 천장 빔프로젝터·방송 스피커·형광등",
      mountZone: "ceiling",
      defaultMountHeightMeters: 2.85,
      glbAssetPath:
        "/studio-assets/kitbash-v11/classroom-ceiling-speaker-projector.glb",
      keywords: ["교실", "프로젝터", "스피커", "형광등", "학교", "projector"],
    },
    {
      id: "hanok-rafter-choma-lantern",
      shortCode: "choma",
      labelKo: "한옥 서까래 처마·추녀 사각 초롱등",
      mountZone: "ceiling",
      defaultMountHeightMeters: 2.75,
      glbAssetPath: "/studio-assets/kitbash-v11/hanok-rafter-choma-lantern.glb",
      keywords: [
        "한옥",
        "서까래",
        "처마",
        "초롱등",
        "전통",
        "hanok",
        "lantern",
      ],
    },
  ] as const;

export const RECOMMENDED_UPPER_PAIRING_BY_ARCHETYPE: Readonly<
  Record<Bg3dObjectClusterArchetypeId, Bg3dV11UpperArchetypeId>
> = {
  "alley-wall-utility-clutter": "alley-projecting-sign-wires",
  "classroom-front-locker-rig": "classroom-ceiling-speaker-projector",
  "office-creator-workstation": "window-venetian-blind-pelmet",
  "convenience-patio-street-furniture": "ceiling-track-spotlight-rig",
  "subway-platform-gate-bay": "ceiling-hvac-cassette-duct",
  "hospital-ward-corridor-set": "ceiling-hvac-cassette-duct",
  "hanok-jangdokdae-stone-wall": "hanok-rafter-choma-lantern",
  "fantasy-dungeon-alchemy-props": "ceiling-track-spotlight-rig",
};

export const THEME_PALETTES: Record<
  Bg3dObjectSurfaceTheme,
  Record<"frame" | "body" | "accent" | "glow", string>
> = {
  "daylight-neutral": {
    frame: "#475569",
    body: "#cbd5e1",
    accent: "#64748b",
    glow: "#f8fafc",
  },
  "weathered-urban": {
    frame: "#334155",
    body: "#94a3b8",
    accent: "#78716c",
    glow: "#fde68a",
  },
  "night-glow": {
    frame: "#1e293b",
    body: "#475569",
    accent: "#38bdf8",
    glow: "#fef08a",
  },
  "warm-wood": {
    frame: "#5c4033",
    body: "#a47551",
    accent: "#7c583c",
    glow: "#fde68a",
  },
};

export const DENSITY_RANK: Record<Bg3dObjectClutterDensity, number> = {
  essential: 1,
  detailed: 2,
  "lived-in": 3,
};

export const UPPER_BLUEPRINTS: Record<
  Bg3dV11UpperArchetypeId,
  readonly UpperPartBlueprint[]
> = {
  "ceiling-hvac-cassette-duct": [
    {
      key: "cassette-panel",
      nameKo: "시스템 에어컨 루버 패널",
      kind: "box",
      localOffsetXZ: [0, 0],
      topDropMeters: 0,
      sizeMeters: [0.95, 0.08, 0.95],
      paletteSlot: "body",
      roughness: 0.45,
      metalness: 0.15,
      minDensity: "essential",
    },
    {
      key: "cassette-intake",
      nameKo: "중앙 흡입 그릴",
      kind: "box",
      localOffsetXZ: [0, 0],
      topDropMeters: 0.075,
      sizeMeters: [0.58, 0.025, 0.58],
      paletteSlot: "frame",
      roughness: 0.55,
      metalness: 0.25,
      minDensity: "essential",
    },
    {
      key: "spiral-duct-main",
      nameKo: "노출 원형 스파이럴 덕트",
      kind: "cylinder",
      localOffsetXZ: [0.92, -0.32],
      topDropMeters: 0.12,
      sizeMeters: [0.32, 1.85, 0.32],
      localEulerRad: [0, 0, Math.PI / 2],
      paletteSlot: "accent",
      roughness: 0.32,
      metalness: 0.68,
      minDensity: "detailed",
    },
    {
      key: "diffuser-disc",
      nameKo: "원형 급기 디퓨저",
      kind: "cylinder",
      localOffsetXZ: [1.55, -0.32],
      topDropMeters: 0.42,
      sizeMeters: [0.36, 0.06, 0.36],
      paletteSlot: "glow",
      roughness: 0.4,
      metalness: 0.2,
      minDensity: "lived-in",
      movableProp: true,
    },
  ],
  "ceiling-track-spotlight-rig": [
    {
      key: "track-bar",
      nameKo: "천장 직부 트랙 레일",
      kind: "box",
      localOffsetXZ: [0, 0],
      topDropMeters: 0,
      sizeMeters: [2.1, 0.045, 0.07],
      paletteSlot: "frame",
      roughness: 0.38,
      metalness: 0.62,
      minDensity: "essential",
    },
    {
      key: "spot-left",
      nameKo: "좌측 원통 스팟 헤드",
      kind: "cylinder",
      localOffsetXZ: [-0.68, 0],
      topDropMeters: 0.05,
      sizeMeters: [0.11, 0.2, 0.11],
      localEulerRad: [0.32, 0, 0],
      paletteSlot: "accent",
      roughness: 0.35,
      metalness: 0.55,
      minDensity: "essential",
      movableProp: true,
    },
    {
      key: "spot-mid",
      nameKo: "중앙 원통 스팟 헤드",
      kind: "cylinder",
      localOffsetXZ: [0, 0],
      topDropMeters: 0.05,
      sizeMeters: [0.11, 0.2, 0.11],
      localEulerRad: [-0.24, 0.12, 0],
      paletteSlot: "accent",
      roughness: 0.35,
      metalness: 0.55,
      minDensity: "detailed",
      movableProp: true,
    },
    {
      key: "spot-right",
      nameKo: "우측 원통 스팟 헤드",
      kind: "cylinder",
      localOffsetXZ: [0.68, 0],
      topDropMeters: 0.05,
      sizeMeters: [0.11, 0.2, 0.11],
      localEulerRad: [0.28, -0.18, 0],
      paletteSlot: "glow",
      roughness: 0.28,
      metalness: 0.45,
      minDensity: "lived-in",
      movableProp: true,
    },
  ],
  "window-venetian-blind-pelmet": [
    {
      key: "pelmet-box",
      nameKo: "상부 커튼박스 몰딩",
      kind: "box",
      localOffsetXZ: [0, 0],
      topDropMeters: 0,
      sizeMeters: [2.44, 0.14, 0.18],
      paletteSlot: "frame",
      roughness: 0.5,
      metalness: 0.12,
      minDensity: "essential",
    },
    {
      key: "window-top-mullion",
      nameKo: "2400 창호 상부 프레임",
      kind: "box",
      localOffsetXZ: [0, -0.06],
      topDropMeters: 0.14,
      sizeMeters: [2.4, 0.06, 0.09],
      paletteSlot: "accent",
      roughness: 0.42,
      metalness: 0.35,
      minDensity: "essential",
    },
    {
      key: "blind-slat-upper",
      nameKo: "1500 높이 베네시안 블라인드 슬랫군",
      kind: "box",
      localOffsetXZ: [0, 0.02],
      topDropMeters: 0.2,
      sizeMeters: [2.32, 1.3, 0.035],
      paletteSlot: "body",
      roughness: 0.58,
      metalness: 0.08,
      minDensity: "essential",
    },
    {
      key: "blind-wand-cord",
      nameKo: "블라인드 조절 봉·하단 바",
      kind: "cylinder",
      localOffsetXZ: [1.08, 0.05],
      topDropMeters: 0.2,
      sizeMeters: [0.025, 0.85, 0.025],
      paletteSlot: "glow",
      roughness: 0.4,
      metalness: 0.25,
      minDensity: "lived-in",
      movableProp: true,
    },
  ],
  "alley-projecting-sign-wires": [
    {
      key: "wall-bracket-upper",
      nameKo: "외벽 철제 고정 브래킷",
      kind: "box",
      localOffsetXZ: [0, -0.35],
      topDropMeters: 0.06,
      sizeMeters: [0.12, 0.92, 0.45],
      paletteSlot: "frame",
      roughness: 0.65,
      metalness: 0.58,
      minDensity: "essential",
    },
    {
      key: "sign-cabinet",
      nameKo: "돌출 사각 네온 간판 함체",
      kind: "box",
      localOffsetXZ: [0, 0.18],
      topDropMeters: 0.02,
      sizeMeters: [0.22, 1.05, 0.68],
      paletteSlot: "glow",
      roughness: 0.35,
      metalness: 0.2,
      minDensity: "essential",
    },
    {
      key: "ceramic-insulator-bar",
      nameKo: "외벽 애자 완철",
      kind: "box",
      localOffsetXZ: [0.55, -0.42],
      topDropMeters: 0.14,
      sizeMeters: [0.65, 0.07, 0.09],
      paletteSlot: "accent",
      roughness: 0.52,
      metalness: 0.48,
      minDensity: "detailed",
    },
    {
      key: "overhead-feeder-cable",
      nameKo: "인입 전선 케이블 번들",
      kind: "cylinder",
      localOffsetXZ: [0.85, -0.28],
      topDropMeters: 0.22,
      sizeMeters: [0.035, 1.65, 0.035],
      localEulerRad: [0.12, 0, 1.42],
      paletteSlot: "frame",
      roughness: 0.72,
      metalness: 0.15,
      minDensity: "lived-in",
      movableProp: true,
    },
  ],
  "classroom-ceiling-speaker-projector": [
    {
      key: "louver-lamp-bar",
      nameKo: "교실 2등용 루버 형광등",
      kind: "box",
      localOffsetXZ: [0, 0],
      topDropMeters: 0,
      sizeMeters: [1.28, 0.07, 0.32],
      paletteSlot: "glow",
      roughness: 0.34,
      metalness: 0.22,
      minDensity: "essential",
    },
    {
      key: "projector-mast",
      nameKo: "천장 빔프로젝터 브래킷 봉",
      kind: "cylinder",
      localOffsetXZ: [0, 0.62],
      topDropMeters: 0,
      sizeMeters: [0.055, 0.34, 0.055],
      paletteSlot: "frame",
      roughness: 0.44,
      metalness: 0.6,
      minDensity: "essential",
    },
    {
      key: "projector-body",
      nameKo: "교실 단초점 빔프로젝터 본체",
      kind: "box",
      localOffsetXZ: [0, 0.62],
      topDropMeters: 0.34,
      sizeMeters: [0.36, 0.12, 0.28],
      paletteSlot: "body",
      roughness: 0.42,
      metalness: 0.18,
      minDensity: "essential",
    },
    {
      key: "pa-wall-speaker",
      nameKo: "상단 학내 방송 스피커",
      kind: "box",
      localOffsetXZ: [-0.95, -0.35],
      topDropMeters: 0.18,
      sizeMeters: [0.24, 0.32, 0.16],
      localEulerRad: [0.22, 0.15, 0],
      paletteSlot: "accent",
      roughness: 0.56,
      metalness: 0.14,
      minDensity: "essential",
    },
  ],
  "hanok-rafter-choma-lantern": [
    {
      key: "dori-beam",
      nameKo: "처마 도리 목재 보",
      kind: "box",
      localOffsetXZ: [0, -0.25],
      topDropMeters: 0,
      sizeMeters: [2.2, 0.18, 0.2],
      paletteSlot: "frame",
      roughness: 0.72,
      metalness: 0.04,
      minDensity: "essential",
    },
    {
      key: "seokkarae-left",
      nameKo: "좌측 원형 서까래",
      kind: "cylinder",
      localOffsetXZ: [-0.65, 0.12],
      topDropMeters: 0.08,
      sizeMeters: [0.13, 0.95, 0.13],
      localEulerRad: [1.32, 0, 0],
      paletteSlot: "body",
      roughness: 0.68,
      metalness: 0.05,
      minDensity: "essential",
    },
    {
      key: "seokkarae-right",
      nameKo: "우측 원형 서까래",
      kind: "cylinder",
      localOffsetXZ: [0.65, 0.12],
      topDropMeters: 0.08,
      sizeMeters: [0.13, 0.95, 0.13],
      localEulerRad: [1.32, 0, 0],
      paletteSlot: "body",
      roughness: 0.68,
      metalness: 0.05,
      minDensity: "detailed",
    },
    {
      key: "choma-lantern",
      nameKo: "추녀 사각 한지 초롱등",
      kind: "box",
      localOffsetXZ: [0, 0.42],
      topDropMeters: 0.28,
      sizeMeters: [0.24, 0.36, 0.24],
      paletteSlot: "glow",
      roughness: 0.6,
      metalness: 0.08,
      minDensity: "lived-in",
      movableProp: true,
    },
  ],
};
