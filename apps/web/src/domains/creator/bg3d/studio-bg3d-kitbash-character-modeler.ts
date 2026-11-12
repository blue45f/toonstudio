/**
 * 파라메트릭 3D 배경 오브젝트 킷배시 모델러 & 3D 캐릭터 조형·실루엣 블록아웃 엔진
 * + `@generate-fresh-ideas` 5-Lens 모델링 아이디어 리믹서.
 *
 * 2~5개 도형 수준의 단조로운 배경 블록아웃 문제를 해결하기 위해:
 * 1) 경간(bay)·층수·디테일 밀도(멀리언·어닝·간판·옥상 설비·가로 소품)·몰딩 베벨을 조합해
 *    18~60+ 파츠의 고밀도 배경 오브젝트를 결정론적으로 합성하고,
 * 2) 등신대(4.5~8.5등신)·체형·헤어 볼륨·의상 실루엣·콘트라포스토/액션 포즈·장착 소품을 조합해
 *    24~36 파츠의 다관절 3D 캐릭터 조형 블록아웃을 바닥(y=0) 정렬로 즉시 생성한다.
 */

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { FreshIdeaLensRemix } from "./studio-bg3d-fresh-ideas-verify-ai";

export type KitbashBackgroundArchetypeId =
  | "korean-commercial-facade"
  | "hanok-courtyard-pavilion"
  | "urban-alley-utility-set"
  | "modern-school-hallway-bay"
  | "fantasy-awakening-sanctum"
  | "cyberpunk-holo-arcade";

export type KitbashDetailDensity = "clean" | "rich" | "cluttered";
export type KitbashPaletteMood = "daylight-warm" | "night-neon" | "ancient-stone" | "pastel-campus";

export interface ParametricBackgroundKitbashSpec {
  readonly archetype: KitbashBackgroundArchetypeId;
  readonly bayCount: number;
  readonly floorCount: number;
  readonly detailDensity: KitbashDetailDensity;
  readonly bevelTrimAccent: boolean;
  readonly paletteMood: KitbashPaletteMood;
}

export interface ParametricBackgroundKitbashResult {
  readonly archetype: KitbashBackgroundArchetypeId;
  readonly labelKo: string;
  readonly primitives: readonly BgPrimitive[];
  readonly subAssemblyCount: number;
  readonly silhouetteContrastScore: number;
  readonly summaryKo: string;
}

export type CharacterModelingBuildId =
  | "slender-romance"
  | "balanced-webtoon"
  | "heroic-muscular"
  | "compact-chibi";

export type CharacterModelingHairId =
  | "short-layered"
  | "long-flowing"
  | "high-ponytail"
  | "hooded-cloak";

export type CharacterModelingOutfitId =
  | "school-blazer"
  | "noir-longcoat"
  | "knight-pauldrons"
  | "street-hoodie";

export type CharacterModelingPoseId =
  | "contrapposto-idle"
  | "action-dash"
  | "sword-guard"
  | "heroic-landing"
  | "desk-seated";

export type CharacterModelingPropId =
  | "none"
  | "rune-greatsword"
  | "arcane-staff"
  | "smartphone"
  | "grimoire-book";

export interface ParametricCharacterModelingSpec {
  readonly headRatio: number;
  readonly build: CharacterModelingBuildId;
  readonly hair: CharacterModelingHairId;
  readonly outfit: CharacterModelingOutfitId;
  readonly pose: CharacterModelingPoseId;
  readonly handProp: CharacterModelingPropId;
}

export interface ParametricCharacterModelingResult {
  readonly labelKo: string;
  readonly totalHeightMeters: number;
  readonly effectiveHeadRatio: number;
  readonly primitives: readonly BgPrimitive[];
  readonly anatomyGroupCount: number;
  readonly summaryKo: string;
}

export const KITBASH_BACKGROUND_ARCHETYPES: readonly {
  readonly id: KitbashBackgroundArchetypeId;
  readonly labelKo: string;
  readonly descriptionKo: string;
}[] = Object.freeze([
  {
    id: "korean-commercial-facade",
    labelKo: "한국형 상가·편의점 파사드",
    descriptionKo: "간판·어닝·통유리 멀리언·옥상 물탱크/실외기가 결합된 다층 스트리트 상가",
  },
  {
    id: "hanok-courtyard-pavilion",
    labelKo: "전통 한옥 행랑·누각 모듈",
    descriptionKo: "석조 기단·배흘림 기둥·우물마루 난간·겹처마 팔작지붕·석등 정원",
  },
  {
    id: "urban-alley-utility-set",
    labelKo: "뒷골목 전신주·배관·간판 세트",
    descriptionKo: "전신주·주상 변압기·돌출 네온 간판·실외기 랙·배관 매니폴드 클러스터",
  },
  {
    id: "modern-school-hallway-bay",
    labelKo: "학원물 복도 창호·사물함 베이",
    descriptionKo: "연속 복도 창틀·교실 미닫이문·학생 사물함 열·게시판 모듈",
  },
  {
    id: "fantasy-awakening-sanctum",
    labelKo: "판타지 각성 신전·룬 포털",
    descriptionKo: "다단 팔각 제단·오벨리스크 열주·이중 마법진 링·부유 크리스탈·성화대",
  },
  {
    id: "cyberpunk-holo-arcade",
    labelKo: "사이버펑크 홀로그램 아케이드",
    descriptionKo: "네온 갠트리 브리지·홀로그램 투영 타워·냉각 덕트·아케이드 부스",
  },
]);

interface MoodColors {
  readonly wall: string;
  readonly trim: string;
  readonly glass: string;
  readonly accent: string;
  readonly glow: string;
  readonly ground: string;
}

const MOOD_PALETTES: Readonly<Record<KitbashPaletteMood, MoodColors>> = Object.freeze({
  "daylight-warm": {
    wall: "#e7dfd3",
    trim: "#334155",
    glass: "#bae6fd",
    accent: "#0284c7",
    glow: "#f59e0b",
    ground: "#94a3b8",
  },
  "night-neon": {
    wall: "#1e293b",
    trim: "#0f172a",
    glass: "#38bdf8",
    accent: "#ec4899",
    glow: "#22d3ee",
    ground: "#334155",
  },
  "ancient-stone": {
    wall: "#d6d3d1",
    trim: "#57534e",
    glass: "#a8a29e",
    accent: "#7c2d12",
    glow: "#fbbf24",
    ground: "#78716c",
  },
  "pastel-campus": {
    wall: "#f5efe6",
    trim: "#64748b",
    glass: "#bfdbfe",
    accent: "#3b82f6",
    glow: "#fde047",
    ground: "#cbd5e1",
  },
});

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mkPrim(
  id: string,
  name: string,
  kind: BgPrimitiveKind,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  color: string,
  tag: string,
  rotation: readonly [number, number, number] = [0, 0, 0],
): BgPrimitive {
  return {
    id,
    name,
    kind,
    position: [round3(position[0]), round3(position[1]), round3(position[2])],
    rotation: [round3(rotation[0]), round3(rotation[1]), round3(rotation[2])],
    scale: [round3(scale[0]), round3(scale[1]), round3(scale[2])],
    color,
    tags: [tag],
  };
}

/**
 * 1. 파라메트릭 배경 오브젝트 킷배시 조형기.
 */
export function buildParametricBackgroundKitbashPrimitives(
  rawSpec: ParametricBackgroundKitbashSpec,
): ParametricBackgroundKitbashResult {
  const bays = clamp(Math.round(rawSpec.bayCount), 2, 6);
  const floors = clamp(Math.round(rawSpec.floorCount), 1, 5);
  const pal = MOOD_PALETTES[rawSpec.paletteMood];
  const densityLevel = rawSpec.detailDensity === "cluttered" ? 3 : rawSpec.detailDensity === "rich" ? 2 : 1;
  const tag = `Kitbash_${rawSpec.archetype}`;
  const out: BgPrimitive[] = [];
  let seq = 1;
  const nextId = (prefix: string) => `kb-${prefix}-${seq++}`;

  const archMeta = KITBASH_BACKGROUND_ARCHETYPES.find((a) => a.id === rawSpec.archetype) ?? KITBASH_BACKGROUND_ARCHETYPES[0]!;

  if (rawSpec.archetype === "korean-commercial-facade" || rawSpec.archetype === "modern-school-hallway-bay") {
    const bayWidth = 1.85;
    const floorHeight = 2.6;
    const totalW = bays * bayWidth;
    const totalH = floors * floorHeight;
    const depth = rawSpec.archetype === "modern-school-hallway-bay" ? 1.8 : 2.6;

    out.push(mkPrim(nextId("plinth"), "Base_Sidewalk_Deck", "box", [0, 0.06, 0.35], [totalW + 0.6, 0.12, depth + 0.9], pal.ground, tag));
    out.push(mkPrim(nextId("core"), "Facade_Main_Mass", "box", [0, 0.12 + totalH * 0.5, 0], [totalW, totalH, depth], pal.wall, tag));
    out.push(mkPrim(nextId("parapet"), "Roof_Parapet_Cap", "box", [0, 0.18 + totalH, 0], [totalW + 0.24, 0.16, depth + 0.24], pal.trim, tag));

    for (let f = 0; f < floors; f++) {
      const yBase = 0.12 + f * floorHeight;
      if (rawSpec.bevelTrimAccent) {
        out.push(mkPrim(nextId("cornice"), `Floor_${f + 1}_Cornice`, "box", [0, yBase + floorHeight - 0.08, depth * 0.5 + 0.06], [totalW + 0.14, 0.12, 0.14], pal.trim, tag));
      }
      for (let b = 0; b < bays; b++) {
        const bx = (b - (bays - 1) * 0.5) * bayWidth;
        const isDoorBay = f === 0 && b === bays - 1;
        out.push(
          mkPrim(
            nextId("pane"),
            isDoorBay ? "Entrance_AutoDoor" : `Window_F${f + 1}_B${b + 1}`,
            "box",
            [bx, yBase + (isDoorBay ? 1.05 : 1.38), depth * 0.5 + 0.03],
            [bayWidth * 0.76, isDoorBay ? 2.05 : 1.36, 0.05],
            pal.glass,
            tag,
          ),
        );
        // 기본 밀도에서도 출입구를 구별할 수 있도록 좌우 문설주와 문턱을 유지한다.
        if (isDoorBay) {
          for (const side of [-1, 1]) {
            out.push(mkPrim(nextId("doorjamb"), `Entrance_Jamb_${side < 0 ? "L" : "R"}`, "box", [bx + side * bayWidth * 0.4, yBase + 1.05, depth * 0.5 + 0.06], [0.08, 2.1, 0.12], pal.trim, tag));
          }
          out.push(mkPrim(nextId("threshold"), "Entrance_Threshold", "box", [bx, yBase + 0.025, depth * 0.5 + 0.08], [bayWidth * 0.84, 0.05, 0.2], pal.trim, tag));
        }
        if (densityLevel >= 2) {
          out.push(mkPrim(nextId("mullion"), `Mullion_F${f + 1}_B${b + 1}`, "box", [bx - bayWidth * 0.38, yBase + 1.3, depth * 0.5 + 0.06], [0.07, floorHeight * 0.86, 0.09], pal.trim, tag));
        }
        if (f === 0 && rawSpec.archetype === "korean-commercial-facade") {
          out.push(mkPrim(nextId("sign"), `Store_Sign_B${b + 1}`, "box", [bx, yBase + floorHeight - 0.34, depth * 0.5 + 0.14], [bayWidth * 0.88, 0.38, 0.12], b % 2 === 0 ? pal.accent : pal.glow, tag));
          if (!isDoorBay && densityLevel >= 2) {
            out.push(mkPrim(nextId("awning"), `Store_Awning_B${b + 1}`, "box", [bx, yBase + 2.02, depth * 0.5 + 0.34], [bayWidth * 0.84, 0.08, 0.58], pal.accent, tag, [0.24, 0, 0]));
          }
        }
        if (f === 0 && rawSpec.archetype === "modern-school-hallway-bay" && densityLevel >= 2 && !isDoorBay) {
          out.push(mkPrim(nextId("locker"), `Hallway_Locker_B${b + 1}`, "box", [bx, 0.68, depth * 0.5 + 0.26], [bayWidth * 0.72, 1.12, 0.38], pal.accent, tag));
        }
      }
    }

    if (densityLevel >= 2) {
      out.push(mkPrim(nextId("watertank"), "Rooftop_WaterTank", "cylinder", [totalW * 0.28, 0.26 + totalH + 0.68, -0.25], [1.25, 1.35, 1.25], pal.accent, tag));
      out.push(mkPrim(nextId("hvac"), "Rooftop_HVAC_Unit", "box", [-totalW * 0.26, 0.26 + totalH + 0.36, 0.2], [0.92, 0.68, 0.55], pal.wall, tag));
    }
    if (densityLevel >= 3) {
      out.push(mkPrim(nextId("projsign"), "Vertical_Projecting_Sign", "box", [totalW * 0.5 + 0.32, Math.min(totalH, 3.6), depth * 0.35], [0.48, 1.85, 0.14], pal.glow, tag));
      out.push(mkPrim(nextId("sidepipe"), "Exterior_Riser_Pipe", "cylinder", [-totalW * 0.5 - 0.08, 0.12 + totalH * 0.5, depth * 0.25], [0.16, totalH * 0.94, 0.16], pal.trim, tag));
    }
  } else if (rawSpec.archetype === "hanok-courtyard-pavilion") {
    const spanW = bays * 1.65;
    const spanD = 3.2 + (floors - 1) * 0.45;
    out.push(mkPrim(nextId("stonebase"), "Hanok_Stone_Stylobate", "box", [0, 0.24, 0], [spanW + 0.7, 0.48, spanD + 0.7], pal.ground, tag));
    out.push(mkPrim(nextId("step1"), "Hanok_Front_Step_1", "box", [0, 0.14, spanD * 0.5 + 0.55], [1.35, 0.28, 0.42], pal.wall, tag));
    out.push(mkPrim(nextId("maru"), "Hanok_Wood_Maru", "box", [0, 0.54, 0], [spanW + 0.2, 0.12, spanD + 0.2], "#8c5a32", tag));

    for (let b = 0; b <= bays; b++) {
      const px = (b - bays * 0.5) * 1.62;
      for (const pz of [-spanD * 0.46, spanD * 0.46]) {
        out.push(mkPrim(nextId("col"), `Entasis_Pillar_${b}_${pz > 0 ? "F" : "B"}`, "cylinder", [px, 1.65, pz], [0.38, 2.15, 0.38], pal.accent, tag));
        if (rawSpec.bevelTrimAccent) {
          out.push(mkPrim(nextId("plinth"), `Pillar_StoneBase_${b}`, "cylinder", [px, 0.64, pz], [0.52, 0.14, 0.52], pal.ground, tag));
        }
      }
    }
    if (densityLevel >= 2) {
      out.push(mkPrim(nextId("railL"), "Balustrade_Left", "box", [-spanW * 0.48, 0.82, 0], [0.08, 0.42, spanD * 0.88], "#6b3e26", tag));
      out.push(mkPrim(nextId("railR"), "Balustrade_Right", "box", [spanW * 0.48, 0.82, 0], [0.08, 0.42, spanD * 0.88], "#6b3e26", tag));
      out.push(mkPrim(nextId("screen"), "Lattice_Changho_Wall", "box", [0, 1.58, -spanD * 0.35], [spanW * 0.78, 1.85, 0.08], pal.wall, tag));
    }
    out.push(mkPrim(nextId("eave"), "Dancheong_Eave_Beam", "box", [0, 2.78, 0], [spanW + 0.55, 0.2, spanD + 0.55], "#3f624d", tag));
    out.push(
      mkPrim(
        nextId("roof"),
        "Paljak_Giwa_Roof",
        "triangularPrism",
        [0, 3.35, 0],
        [spanD + 1.15, spanW + 1.25, 1.55],
        pal.trim,
        tag,
        [-Math.PI / 2, 0, Math.PI / 2],
      ),
    );
    out.push(mkPrim(nextId("ridge"), "Yongmaru_Ridge_Beam", "box", [0, 3.92, 0], [spanW + 0.6, 0.14, 0.18], "#1e293b", tag));
    if (densityLevel >= 3) {
      for (const sx of [-1, 1]) {
        out.push(mkPrim(nextId("lantern"), `Courtyard_Lantern_${sx > 0 ? "R" : "L"}`, "box", [sx * (spanW * 0.42), 0.46, spanD * 0.5 + 0.95], [0.42, 0.92, 0.42], pal.ground, tag));
        out.push(mkPrim(nextId("lanternGlow"), `Courtyard_Lantern_Glow_${sx > 0 ? "R" : "L"}`, "sphere", [sx * (spanW * 0.42), 0.78, spanD * 0.5 + 0.95], [0.24, 0.24, 0.24], pal.glow, tag));
      }
    }
  } else if (rawSpec.archetype === "fantasy-awakening-sanctum") {
    const radius = 1.6 + bays * 0.38;
    out.push(mkPrim(nextId("dais1"), "Sanctum_Hex_Dais_1", "hexPrism", [0, 0.16, 0], [radius * 2, 0.32, radius * 2], pal.ground, tag));
    out.push(mkPrim(nextId("dais2"), "Sanctum_Hex_Dais_2", "hexPrism", [0, 0.42, 0], [radius * 1.48, 0.24, radius * 1.48], pal.wall, tag));
    out.push(mkPrim(nextId("dais3"), "Sanctum_Altar_Core", "hexPrism", [0, 0.68, 0], [radius * 0.95, 0.28, radius * 0.95], pal.trim, tag));

    for (let i = 0; i < bays + 2; i++) {
      const ang = (i / (bays + 2)) * Math.PI * 2;
      const px = Math.cos(ang) * (radius * 0.82);
      const pz = Math.sin(ang) * (radius * 0.82);
      out.push(mkPrim(nextId("obelisk"), `Runic_Obelisk_${i + 1}`, "pyramid", [px, 0.32 + floors * 0.42, pz], [0.48, 1.4 + floors * 0.52, 0.48], pal.wall, tag, [0, -ang, 0]));
      if (rawSpec.bevelTrimAccent || densityLevel >= 2) {
        out.push(mkPrim(nextId("orb"), `Runic_Crown_Orb_${i + 1}`, "sphere", [px, 1.18 + floors * 0.72, pz], [0.24, 0.24, 0.24], pal.glow, tag));
      }
    }
    const portalY = 2.05 + floors * 0.25;
    out.push(mkPrim(nextId("ringOuter"), "Portal_Outer_Ring", "torus", [0, portalY, 0], [2.35, 2.35, 0.38], pal.accent, tag));
    out.push(mkPrim(nextId("ringInner"), "Portal_Inner_Astrolabe", "torus", [0, portalY, 0], [1.65, 1.65, 0.28], pal.glow, tag, [0.38, 0.42, 0]));
    out.push(mkPrim(nextId("crystalUp"), "Mana_Core_Upper", "cone", [0, portalY + 0.28, 0], [0.62, 0.62, 0.62], pal.glass, tag));
    out.push(mkPrim(nextId("crystalDn"), "Mana_Core_Lower", "cone", [0, portalY - 0.28, 0], [0.62, 0.62, 0.62], pal.glass, tag, [Math.PI, 0, 0]));
    if (densityLevel >= 3) {
      for (const sx of [-1, 1]) {
        out.push(mkPrim(nextId("brazier"), `Sanctum_Brazier_${sx > 0 ? "R" : "L"}`, "cylinder", [sx * (radius * 0.55), 0.62, radius * 0.72], [0.45, 0.62, 0.45], pal.accent, tag));
        out.push(mkPrim(nextId("flame"), `Sanctum_Flame_${sx > 0 ? "R" : "L"}`, "cone", [sx * (radius * 0.55), 1.08, radius * 0.72], [0.34, 0.44, 0.34], pal.glow, tag));
      }
    }
  } else {
    // urban-alley-utility-set / cyberpunk-holo-arcade
    const spanW = bays * 1.75;
    const wallH = 2.4 + floors * 1.35;
    out.push(mkPrim(nextId("asphalt"), "Alley_Ground_Slab", "box", [0, 0.06, 0], [spanW + 1.2, 0.12, 4.4], pal.ground, tag));
    out.push(mkPrim(nextId("wallL"), "Alley_Wall_Left", "box", [-spanW * 0.46, wallH * 0.5, -0.4], [0.95, wallH, 3.6], pal.wall, tag));
    out.push(mkPrim(nextId("wallR"), "Alley_Wall_Right", "box", [spanW * 0.46, wallH * 0.46, 0.2], [0.95, wallH * 0.92, 3.4], pal.trim, tag));
    out.push(mkPrim(nextId("pole"), "Utility_Main_Pole", "cylinder", [-spanW * 0.28, 2.35, 1.35], [0.46, 4.6, 0.46], "#94a3b8", tag));
    out.push(mkPrim(nextId("xformer"), "Pole_Transformer_Drum", "cylinder", [-spanW * 0.2, 3.15, 1.15], [0.62, 0.68, 0.62], "#475569", tag));
    out.push(mkPrim(nextId("crossarm"), "Pole_Crossarm", "box", [-spanW * 0.28, 4.15, 1.35], [1.32, 0.09, 0.09], "#334155", tag));

    for (let b = 0; b < bays; b++) {
      const zOff = (b - (bays - 1) * 0.5) * (2.6 / Math.max(1, bays - 1));
      out.push(mkPrim(nextId("neonL"), `Neon_Sign_L_${b + 1}`, "box", [-spanW * 0.46 + 0.68, 2.15 + (b % 2) * 0.75, zOff], [0.42, 0.92, 0.12], b % 2 === 0 ? pal.accent : pal.glow, tag));
      if (densityLevel >= 2) {
        out.push(mkPrim(nextId("hvacR"), `Wall_HVAC_R_${b + 1}`, "box", [spanW * 0.46 - 0.62, 1.45 + b * 0.55, zOff], [0.32, 0.58, 0.66], "#cbd5e1", tag));
        out.push(mkPrim(nextId("fanR"), `Wall_HVAC_Fan_${b + 1}`, "torus", [spanW * 0.46 - 0.79, 1.45 + b * 0.55, zOff], [0.36, 0.36, 0.16], "#1e293b", tag, [0, Math.PI / 2, 0]));
      }
    }
    if (rawSpec.archetype === "cyberpunk-holo-arcade" || densityLevel >= 2) {
      out.push(mkPrim(nextId("gantry"), "Overhead_Pipe_Gantry", "tube", [0, wallH * 0.72, -0.35], [spanW * 0.65, 0.35, 0.65], pal.accent, tag, [0, 0, Math.PI / 2]));
      out.push(mkPrim(nextId("holoRing"), "Holo_ Emblem_Torus", "torus", [0, wallH * 0.68, -0.65], [1.45, 1.45, 0.28], pal.glow, tag));
    }
    if (densityLevel >= 3) {
      out.push(mkPrim(nextId("kiosk"), "Street_Vending_Kiosk", "box", [spanW * 0.24, 0.98, 1.25], [0.88, 1.84, 0.62], pal.accent, tag));
      out.push(mkPrim(nextId("drum"), "Alley_Utility_Barrel", "cylinder", [-spanW * 0.26, 0.48, -1.15], [0.85, 0.88, 0.85], "#ca8a04", tag));
    }
  }

  const silhouetteContrastScore = clamp(
    Math.round(74 + out.length * 0.65 + (rawSpec.bevelTrimAccent ? 5 : 0)),
    75,
    99,
  );

  return {
    archetype: rawSpec.archetype,
    labelKo: archMeta.labelKo,
    primitives: out,
    subAssemblyCount: out.length,
    silhouetteContrastScore,
    summaryKo: `${archMeta.labelKo} (${bays}경간 × ${floors}층 · ${rawSpec.detailDensity}) → ${out.length}개 조형 파츠 (실루엣 점수 ${silhouetteContrastScore}점)`,
  };
}

/**
 * 2. 파라메트릭 3D 캐릭터 아나토미·의상·포즈 조형 생성기 (`BgPrimitive[]`, y=0 바닥 접지).
 */
export function buildParametricCharacterModelingPrimitives(
  rawSpec: ParametricCharacterModelingSpec,
): ParametricCharacterModelingResult {
  const ratio = clamp(rawSpec.headRatio, 4.5, 8.5);
  const headH = rawSpec.build === "compact-chibi" ? 0.28 : 0.225;
  const totalHeight = round3(headH * ratio);
  const tag = "Character_Kitbash_Sculpt";

  const widthMul =
    rawSpec.build === "heroic-muscular"
      ? 1.24
      : rawSpec.build === "slender-romance"
        ? 0.88
        : rawSpec.build === "compact-chibi"
          ? 1.06
          : 1.0;

  const skinHex = "#f1d3c2";
  const hairHex =
    rawSpec.hair === "long-flowing"
      ? "#312e81"
      : rawSpec.hair === "high-ponytail"
        ? "#7c2d12"
        : rawSpec.hair === "hooded-cloak"
          ? "#1e293b"
          : "#27272a";

  const outfitPrimary =
    rawSpec.outfit === "noir-longcoat"
      ? "#1e293b"
      : rawSpec.outfit === "knight-pauldrons"
        ? "#94a3b8"
        : rawSpec.outfit === "street-hoodie"
          ? "#0284c7"
          : "#1d4ed8";
  const outfitSecondary =
    rawSpec.outfit === "knight-pauldrons" ? "#d97706" : "#334155";

  const legLen = totalHeight * 0.47;
  const torsoLen = totalHeight * 0.30;
  const neckLen = totalHeight * 0.05;
  const seatedDrop = rawSpec.pose === "desk-seated" ? legLen * 0.36 : rawSpec.pose === "heroic-landing" ? legLen * 0.22 : 0;
  const pelvisY = Math.max(0.28, legLen - seatedDrop);
  const waistY = pelvisY + torsoLen * 0.34;
  const chestY = pelvisY + torsoLen * 0.76;
  const neckY = pelvisY + torsoLen + neckLen * 0.5;
  const headY = pelvisY + torsoLen + neckLen + headH * 0.52;
  const shoulderHalfX = 0.19 * widthMul;
  const hipHalfX = 0.105 * widthMul;

  const torsoLeanX =
    rawSpec.pose === "action-dash"
      ? 0.28
      : rawSpec.pose === "heroic-landing"
        ? 0.34
        : rawSpec.pose === "sword-guard"
          ? 0.12
          : 0.03;

  const out: BgPrimitive[] = [];
  let seq = 1;
  const cid = (part: string) => `char-kb-${part}-${seq++}`;

  // 발·정강이·무릎·허벅지 (좌/우 비대칭 포즈 지원)
  for (const side of [-1, 1] as const) {
    const tagSide = side < 0 ? "L" : "R";
    const strideZ =
      rawSpec.pose === "action-dash"
        ? side * 0.22
        : rawSpec.pose === "sword-guard"
          ? side * 0.14
          : rawSpec.pose === "contrapposto-idle" && side > 0
            ? 0.05
            : 0;
    const footX = side * (hipHalfX + (rawSpec.pose === "sword-guard" ? 0.05 : 0.015));

    out.push(mkPrim(cid(`foot_${tagSide}`), `Shoe_Foot_${tagSide}`, "box", [footX, 0.055, strideZ + 0.05], [0.095 * widthMul, 0.11, 0.23], "#1e293b", tag));
    out.push(mkPrim(cid(`shin_${tagSide}`), `Lower_Leg_${tagSide}`, "capsule", [footX, pelvisY * 0.30, strideZ * 0.7], [0.22 * widthMul, pelvisY * 0.42, 0.22 * widthMul], outfitSecondary, tag, [strideZ * 0.45, 0, 0]));
    out.push(mkPrim(cid(`knee_${tagSide}`), `Knee_Joint_${tagSide}`, "sphere", [footX, pelvisY * 0.53, strideZ * 0.5], [0.14 * widthMul, 0.14 * widthMul, 0.14 * widthMul], outfitSecondary, tag));
    out.push(mkPrim(cid(`thigh_${tagSide}`), `Upper_Thigh_${tagSide}`, "capsule", [side * hipHalfX, pelvisY * 0.78, strideZ * 0.25], [0.27 * widthMul, pelvisY * 0.44, 0.27 * widthMul], outfitSecondary, tag, [-strideZ * 0.35, 0, 0]));
  }

  // 골반·허리·흉곽·목·두상·턱선
  out.push(mkPrim(cid("pelvis"), "Anatomy_Pelvis_Block", "box", [0, pelvisY, 0], [hipHalfX * 2.4, torsoLen * 0.28, 0.18 * widthMul], outfitSecondary, tag));
  out.push(mkPrim(cid("waist"), "Anatomy_Waist_Core", "cylinder", [0, waistY, 0], [0.42 * widthMul, torsoLen * 0.34, 0.32 * widthMul], outfitPrimary, tag, [torsoLeanX * 0.5, 0, 0]));
  out.push(mkPrim(cid("ribcage"), "Anatomy_Ribcage_Chest", "capsule", [0, chestY, torsoLeanX * 0.08], [0.58 * widthMul, torsoLen * 0.42, 0.40 * widthMul], outfitPrimary, tag, [torsoLeanX, 0, 0]));
  out.push(mkPrim(cid("neck"), "Anatomy_Neck_Cylinder", "cylinder", [0, neckY, torsoLeanX * 0.12], [0.18, neckLen * 1.4, 0.18], skinHex, tag));
  out.push(mkPrim(cid("cranium"), "Stylized_Head_Cranium", "sphere", [0, headY, torsoLeanX * 0.14], [headH * 0.92, headH * 1.02, headH * 0.98], skinHex, tag));
  out.push(mkPrim(cid("jaw"), "Stylized_Jaw_Chin", "cone", [0, headY - headH * 0.34, torsoLeanX * 0.14 + headH * 0.12], [headH * 0.72, headH * 0.52, headH * 0.72], skinHex, tag, [Math.PI - 0.16, 0, 0]));

  // 헤어 실루엣 조형
  out.push(mkPrim(cid("hair_crown"), "Hair_Crown_Volume", "sphere", [0, headY + headH * 0.16, torsoLeanX * 0.12 - 0.01], [headH * 1.04, headH * 0.92, headH * 1.08], hairHex, tag));
  if (rawSpec.hair === "long-flowing") {
    out.push(mkPrim(cid("hair_back"), "Hair_Long_Flow", "cone", [0, headY - headH * 0.95, -0.11], [headH * 1.15, headH * 1.95, headH * 0.65], hairHex, tag, [0.18, 0, 0]));
  } else if (rawSpec.hair === "high-ponytail") {
    out.push(mkPrim(cid("hair_tail"), "Hair_Action_Ponytail", "cone", [0, headY + headH * 0.05, -0.22], [headH * 0.58, headH * 1.45, headH * 0.58], hairHex, tag, [-0.85, 0, 0]));
  } else if (rawSpec.hair === "hooded-cloak") {
    out.push(mkPrim(cid("hood_shell"), "Cloak_Hood_Cowl", "hemisphere", [0, headY + headH * 0.04, torsoLeanX * 0.12], [headH * 1.32, headH * 1.25, headH * 1.32], outfitPrimary, tag));
  }

  // 의상 실루엣 디테일 (롱코트 자락 / 기사 견장 / 블레이저 라펠)
  if (rawSpec.outfit === "noir-longcoat") {
    out.push(mkPrim(cid("coat_skirt"), "Noir_Longcoat_Tail", "cone", [0, pelvisY * 0.74, -0.04], [0.68 * widthMul, legLen * 0.72, 0.52 * widthMul], outfitPrimary, tag));
    out.push(mkPrim(cid("coat_collar"), "Noir_High_Collar", "tube", [0, neckY, torsoLeanX * 0.10], [0.36 * widthMul, 0.14, 0.34 * widthMul], outfitPrimary, tag));
  } else if (rawSpec.outfit === "knight-pauldrons") {
    for (const sx of [-1, 1] as const) {
      out.push(mkPrim(cid(`pauldron_${sx < 0 ? "L" : "R"}`), `Knight_Pauldron_${sx < 0 ? "L" : "R"}`, "hemisphere", [sx * (shoulderHalfX + 0.05), chestY + 0.08, 0], [0.24 * widthMul, 0.18, 0.24 * widthMul], outfitSecondary, tag, [0, 0, -sx * 0.35]));
    }
    out.push(mkPrim(cid("chest_crest"), "Knight_Cuirass_Plate", "hexPrism", [0, chestY + 0.02, 0.10], [0.28 * widthMul, 0.24, 0.08], outfitSecondary, tag, [Math.PI / 2, 0, 0]));
  }

  // 좌·우 어깨·상완·전완·손 + 장착 소품
  const armLen = totalHeight * 0.34;
  for (const side of [-1, 1] as const) {
    const tagSide = side < 0 ? "L" : "R";
    const sx = side * shoulderHalfX;
    const isPropHand = side > 0 && rawSpec.handProp !== "none";
    const armPitch =
      isPropHand
        ? -0.78
        : rawSpec.pose === "action-dash"
          ? side * 0.52
          : rawSpec.pose === "sword-guard"
            ? -0.62
            : -0.08;
    const handZ = isPropHand ? 0.24 : armPitch < -0.3 ? 0.18 : 0.03;
    const handY = isPropHand ? chestY - 0.05 : waistY - 0.06;

    out.push(mkPrim(cid(`deltoid_${tagSide}`), `Deltoid_Shoulder_${tagSide}`, "sphere", [sx, chestY + 0.05, 0], [0.16 * widthMul, 0.16 * widthMul, 0.16 * widthMul], outfitPrimary, tag));
    out.push(mkPrim(cid(`upperarm_${tagSide}`), `Upper_Arm_${tagSide}`, "capsule", [sx * 1.08, chestY - armLen * 0.24, handZ * 0.35], [0.18 * widthMul, armLen * 0.42, 0.18 * widthMul], outfitPrimary, tag, [armPitch * 0.6, 0, -side * 0.12]));
    out.push(mkPrim(cid(`forearm_${tagSide}`), `Forearm_${tagSide}`, "capsule", [sx * 1.12, (chestY + handY) * 0.5 - 0.06, handZ * 0.72], [0.15 * widthMul, armLen * 0.38, 0.15 * widthMul], skinHex, tag, [armPitch, 0, -side * 0.08]));
    out.push(mkPrim(cid(`hand_${tagSide}`), `Stylized_Hand_${tagSide}`, "sphere", [sx * 1.12, handY, handZ], [0.09, 0.11, 0.09], skinHex, tag));

    if (isPropHand) {
      if (rawSpec.handProp === "rune-greatsword") {
        out.push(mkPrim(cid("prop_hilt"), "Greatsword_Crossguard", "box", [sx * 1.12, handY + 0.08, handZ + 0.08], [0.28, 0.05, 0.06], "#d97706", tag, [0.35, 0, -0.18]));
        out.push(mkPrim(cid("prop_blade"), "Greatsword_Rune_Blade", "box", [sx * 1.02, handY + 0.62, handZ + 0.32], [0.09, 1.08, 0.03], "#38bdf8", tag, [0.35, 0, -0.18]));
      } else if (rawSpec.handProp === "arcane-staff") {
        out.push(mkPrim(cid("prop_shaft"), "Arcane_Staff_Shaft", "cylinder", [sx * 1.18, totalHeight * 0.52, handZ + 0.06], [0.10, totalHeight * 0.96, 0.10], "#78350f", tag));
        out.push(mkPrim(cid("prop_orb"), "Arcane_Staff_Crystal", "sphere", [sx * 1.18, totalHeight * 1.02, handZ + 0.06], [0.22, 0.22, 0.22], "#22d3ee", tag));
      } else if (rawSpec.handProp === "smartphone") {
        out.push(mkPrim(cid("prop_phone"), "Modern_Smartphone", "box", [sx * 0.96, handY + 0.06, handZ + 0.08], [0.08, 0.15, 0.015], "#38bdf8", tag, [-0.45, 0.2, 0]));
      } else if (rawSpec.handProp === "grimoire-book") {
        out.push(mkPrim(cid("prop_book"), "Rune_Grimoire_Book", "box", [sx * 0.98, handY + 0.04, handZ + 0.10], [0.22, 0.06, 0.28], "#7c2d12", tag, [-0.25, 0.2, 0]));
      }
    }
  }

  return {
    labelKo: `${ratio.toFixed(1)}등신 캐릭터 조형 (${rawSpec.outfit} · ${rawSpec.pose})`,
    totalHeightMeters: totalHeight,
    effectiveHeadRatio: round3(ratio),
    primitives: out,
    anatomyGroupCount: 6,
    summaryKo: `${ratio.toFixed(1)}등신 (전고 ${totalHeight}m · ${rawSpec.build}) → ${out.length}개 다관절 아나토미·의상 파츠`,
  };
}

/**
 * 3. `@generate-fresh-ideas` 5-Lens 배경 킷배시 & 캐릭터 조형 리믹스 생성기.
 */
export function generateKitbashCharacterModelingFreshIdeas(
  bgResult: ParametricBackgroundKitbashResult,
  charResult: ParametricCharacterModelingResult,
): {
  readonly headerKo: string;
  readonly remixes: readonly FreshIdeaLensRemix[];
} {
  const headerKo = `💡 Remix: ${bgResult.labelKo} × ${charResult.effectiveHeadRatio}등신 캐릭터 조형 고도화 · Sources used: ToonStudio Kitbash V9 & Blender 5.2`;

  const remixes: readonly FreshIdeaLensRemix[] = Object.freeze([
    {
      id: "contrarian-take",
      badgeKo: "1. 🔥 CONTRARIAN TAKE",
      lensTitle: "배경이 단조로워 보이는 진짜 원인은 폴리곤 개수가 아니라 '중경·근경 생활 소품 레이어(Secondary Silhouette)'의 부재입니다.",
      pitchKo: `거대 박스 건물 1개 대신 ${bgResult.subAssemblyCount}개 모듈형 파사드·어닝·설비 파츠로 화면 밀도를 바꾸는 역발상`,
      angleKo: `많은 3D 배경 툴이 고해상도 텍스처 한 장으로 단조로움을 가리려 하지만, 웹툰 LT(선화 추출) 공정에서는 텍스처가 사라지고 외곽선만 남습니다. 간판 돌출부·창틀 멀리언·옥상 실외기처럼 실루엣이 꺾이는 조형 파츠(${bgResult.subAssemblyCount}개)를 배치해야 선화 변환 직후에도 작가의 손그림 같은 밀도가 살아납니다.`,
    },
    {
      id: "personal-story-hook",
      badgeKo: "2. 📖 PERSONAL STORY HOOK",
      lensTitle: `매주 반복되는 편의점·골목길 설정 컷에서 '빈 상자 배경'을 덧그리느라 밤새우던 루틴을 끊어낸 과정`,
      pitchKo: "단순 3D 블록 위에 창문과 전신주를 일일이 펜선으로 채우던 마감 병목을 파라메트릭 킷배시로 해결한 전환점",
      angleKo: `(1) Setup: 회차마다 등장하는 일상 상가·복도 배경에 기본 도형 3개짜리 블록만 놓으니 원고가 휑해 보임 → (2) Friction: 결국 3D 위에 어닝·전신주·인체 비례 가이드를 손으로 다시 그리느라 3D 도입 효과가 반감됨 → (3) Lesson: 경간·층수·설비 밀도를 즉시 조합하는 ${bgResult.labelKo}와 ${charResult.effectiveHeadRatio}등신 캐릭터 블록아웃(${charResult.primitives.length}파츠)을 함께 세워 구도와 선화 밀도를 한 번에 확보.`,
    },
    {
      id: "data-evidence-angle",
      badgeKo: "3. 📊 DATA / EVIDENCE ANGLE",
      lensTitle: `단일 프리셋 평균 3.8파츠 → 킷배시 ${bgResult.subAssemblyCount}파츠 확장 및 ${charResult.totalHeightMeters}m 인체 스케일 정합성 검증`,
      pitchKo: "추상적인 '디테일 업'이 아닌 조형 파츠 밀도와 실루엣 대비 점수로 확인하는 모델링 고도화 지표",
      angleKo: `기존 저밀도 소품(간판 2파츠·쓰레기통 2파츠·고층빌딩 3파츠) 대비 14종 신규 복합 프리셋(10~14파츠)과 Blender 5.2 CC0 V9 GLB 6종, 파라메트릭 조형기(${bgResult.subAssemblyCount}파츠, 실루엣 점수 ${bgResult.silhouetteContrastScore}점)를 결합했습니다. 여기에 전고 ${charResult.totalHeightMeters}m(${charResult.effectiveHeadRatio}등신) 캐릭터 아나토미 ${charResult.primitives.length}파츠를 바닥(y=0) 기준으로 동기화해 문틀·난간·카운터와의 비례 오차를 원천 차단합니다.`,
    },
    {
      id: "practical-playbook",
      badgeKo: "4. ✅ PRACTICAL PLAYBOOK",
      lensTitle: "단조로운 3D 배경 컷을 3분 만에 출판급 원고 밀도로 끌어올리는 4단계 조형 플레이북",
      pitchKo: "배경 파사드 조형 → 근경 설비 킷배시 → 등신대 캐릭터 배치 → LT 선화 동기화 실전 순서",
      angleKo: "지금 열린 3D 배경 편집기와 스페셜리스트 워크벤치에서 바로 실행할 수 있는 단계별 가이드입니다:",
      actionableStepsKo: [
        `주배경 골격 생성: [${bgResult.labelKo}]에서 경간·층수와 '풍부/고밀도' 디테일을 선택해 ${bgResult.subAssemblyCount}개 파츠 파사드를 배치`,
        `근경 실루엣 보강: 복합 블록아웃 또는 Blender 킷배시 V9 카탈로그에서 전신주·버스정류장·포장마차·실외기 랙을 전경 가장자리에 추가`,
        `인체 비례 기준 고정: [${charResult.effectiveHeadRatio}등신 캐릭터 조형]으로 전고 ${charResult.totalHeightMeters}m 아나토미·의상 실루엣(${charResult.primitives.length}파츠)을 세워 카메라 눈높이 점검`,
        `선화·투시 마감: 2점 투시(shift_y) 보정 후 Freestyle/LT 선화 미리보기를 켜서 창틀·몰딩·의상 주름 외곽선 밀도 최종 확인`,
      ],
    },
    {
      id: "what-they-missed",
      badgeKo: "5. 🎯 WHAT THEY MISSED",
      lensTitle: "배경 모델링과 캐릭터 모델링을 따로 고도화하면, 정작 컷에 합쳤을 때 '스케일 불일치와 선 굵기 이질감'이 발생합니다.",
      pitchKo: "배경 오브젝트 치수(문 높이 2.1m·카운터 1.0m)와 웹툰 등신대(4.5~8.5등신) 조형을 한 공간에서 맞물려야 하는 이유",
      angleKo: `배경 에셋만 정교하게 만들어도 6등신 학원물 캐릭터와 8등신 판타지 히어로의 눈높이·어깨너비가 다르면 계단 단차나 창문 높이가 어색해집니다. 배경 킷배시 모듈과 ${charResult.effectiveHeadRatio}등신 캐릭터 아나토미 블록아웃을 동일한 미터(m) 좌표계·바닥 접지 규칙으로 통합해 모델링 단계부터 인물-배경 일체감을 보장했습니다.`,
    },
  ]);

  return { headerKo, remixes };
}
