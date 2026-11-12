/**
 * 파라메트릭 3D 배경 오브젝트·생활감 소품 클러스터 조형 엔진 (`studio-bg3d-background-object-cluster.ts`).
 *
 * 배경 3D 전용 범위:
 * - 캐릭터·데생인형·브러시 모듈과 완전히 독립된 순수 배경 오브젝트 합성기다.
 * - 빈 벽면·골목길·교실·작업실·지하철역·병동·한옥 마당·판타지 서고의 단조로움을 해소하기 위해
 *   8종의 배경 오브젝트 클러스터 아키타입을 반복 모듈 수·생활감 밀도·배치 대형·배색 테마로 조합해
 *   바닥(y >= 0) 정렬된 다중 파츠 `BgPrimitive[]`를 결정론적으로 생성한다.
 */

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";

export type Bg3dObjectClusterArchetypeId =
  | "alley-wall-utility-clutter"
  | "classroom-front-locker-rig"
  | "office-creator-workstation"
  | "convenience-patio-street-furniture"
  | "subway-platform-gate-bay"
  | "hospital-ward-corridor-set"
  | "hanok-jangdokdae-stone-wall"
  | "fantasy-dungeon-alchemy-props";

export type Bg3dObjectClutterDensity = "essential" | "detailed" | "lived-in";
export type Bg3dObjectClusterArrangement = "linear-wall" | "l-corner" | "staggered-street";
export type Bg3dObjectSurfaceTheme =
  | "daylight-neutral"
  | "weathered-urban"
  | "night-glow"
  | "warm-wood";

export interface Bg3dObjectClusterArchetypeMeta {
  readonly id: Bg3dObjectClusterArchetypeId;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly descriptionKo: string;
  readonly v10GlbAssetId: string;
}

export interface Bg3dObjectClusterSpec {
  readonly archetype: Bg3dObjectClusterArchetypeId;
  readonly moduleCount: number;
  readonly clutterDensity: Bg3dObjectClutterDensity;
  readonly arrangement: Bg3dObjectClusterArrangement;
  readonly surfaceTheme: Bg3dObjectSurfaceTheme;
  readonly anchorOffsetXZ?: readonly [number, number];
}

export interface Bg3dObjectClusterBuildResult {
  readonly archetype: Bg3dObjectClusterArchetypeId;
  readonly labelKo: string;
  readonly primitives: readonly BgPrimitive[];
  readonly partCount: number;
  readonly estimatedLineArtEdges: number;
  readonly monotonyReliefScore: number;
  readonly footprintMeters: readonly [number, number, number];
  readonly summaryKo: string;
}

export const STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES: readonly Bg3dObjectClusterArchetypeMeta[] =
  Object.freeze([
    {
      id: "alley-wall-utility-clutter",
      labelKo: "골목 2단 실외기·가스배관 세트",
      genreTagKo: "현대·스릴러",
      descriptionKo: "앵글 브래킷 2단 실외기·도시가스 계량기·동관/배수 파이프·차단 밸브를 벽면에 밀착 배치해요.",
      v10GlbAssetId: "kitbash-v10-alley-ac-meter-pipe-wall-v10",
    },
    {
      id: "classroom-front-locker-rig",
      labelKo: "교실 와이드 칠판·교탁·사물함",
      genreTagKo: "학원·청춘",
      descriptionKo: "웨인스코팅 벽체·녹색 칠판·분필받이·교탁·3×3 철제 사물함과 벽시계를 한 번에 구성해요.",
      v10GlbAssetId: "kitbash-v10-classroom-podium-locker-wall-v10",
    },
    {
      id: "office-creator-workstation",
      labelKo: "작업실 모션데스크·액정태블릿",
      genreTagKo: "오피스·일상",
      descriptionKo: "전동 데스크·기울임 펜 디스플레이·서브 모니터 암·타공판 선반·데스크 램프·스피커를 배치해요.",
      v10GlbAssetId: "kitbash-v10-creator-dual-monitor-desk-v10",
    },
    {
      id: "convenience-patio-street-furniture",
      labelKo: "도심 분리수거함·입간판·볼라드",
      genreTagKo: "일상·스트리트",
      descriptionKo: "캐노피 3색 분리수거 스테이션·원목 A보드 카페 입간판·반사띠 볼라드로 보도블록을 채워요.",
      v10GlbAssetId: "kitbash-v10-street-recycling-station-a-board-v10",
    },
    {
      id: "subway-platform-gate-bay",
      labelKo: "지하철 개찰구·플랩 게이트 베이",
      genreTagKo: "도시·액션",
      descriptionKo: "스테인리스 개찰구 하우징·교통카드 단말기·강화유리 플랩·점자 유도 타일 통로를 생성해요.",
      v10GlbAssetId: "kitbash-v10-subway-turnstile-gate-set-v10",
    },
    {
      id: "hospital-ward-corridor-set",
      labelKo: "병원 복도 대기석·수액 폴대 세트",
      genreTagKo: "메디컬·드라마",
      descriptionKo: "복도 범퍼레일 벽체·3인용 대기 벤치·5발 이동식 IV 수액 폴대·진료 호출 모니터를 조합해요.",
      v10GlbAssetId: "kitbash-v10-hospital-corridor-station-v10",
    },
    {
      id: "hanok-jangdokdae-stone-wall",
      labelKo: "한옥 기와담장·장독대·석등 마당",
      genreTagKo: "사극·무협·전통",
      descriptionKo: "암수키와 토담·2단 장대석 단상·배흘림 옹기 독 군락·사각 화강암 석등으로 전통 마당을 꾸며요.",
      v10GlbAssetId: "kitbash-v10-hanok-jangdokdae-courtyard-v10",
    },
    {
      id: "fantasy-dungeon-alchemy-props",
      labelKo: "마탑 고딕 아치 서가·포션·촛대",
      genreTagKo: "로판·판타지",
      descriptionKo: "황동 아치 고목 서가·마도서 묶음·발광 엘릭서 플라스크·3구 스탠드 촛대로 실내 밀도를 높여요.",
      v10GlbAssetId: "kitbash-v10-fantasy-alchemy-bookshelf-rack-v10",
    },
  ]);

interface ThemePalette {
  readonly base: string;
  readonly metal: string;
  readonly wood: string;
  readonly accent: string;
  readonly glow: string;
  readonly dark: string;
}

const SURFACE_THEMES: Readonly<Record<Bg3dObjectSurfaceTheme, ThemePalette>> = Object.freeze({
  "daylight-neutral": {
    base: "#e2e0d8",
    metal: "#94a3b8",
    wood: "#8b5a36",
    accent: "#0284c7",
    glow: "#38bdf8",
    dark: "#1e293b",
  },
  "weathered-urban": {
    base: "#cbd5e1",
    metal: "#64748b",
    wood: "#6b442a",
    accent: "#d97706",
    glow: "#fbbf24",
    dark: "#0f172a",
  },
  "night-glow": {
    base: "#334155",
    metal: "#475569",
    wood: "#452c1e",
    accent: "#06b6d4",
    glow: "#22d3ee",
    dark: "#090d16",
  },
  "warm-wood": {
    base: "#ede4d5",
    metal: "#a8a29e",
    wood: "#9a5b32",
    accent: "#2f6f5e",
    glow: "#fde68a",
    dark: "#292524",
  },
});

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rotateXZ(
  x: number,
  z: number,
  yawRad: number,
): readonly [number, number] {
  if (Math.abs(yawRad) < 1e-6) return [x, z];
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [x * c + z * s, -x * s + z * c];
}

interface LocalPart {
  readonly suffix: string;
  readonly name: string;
  readonly kind: BgPrimitiveKind;
  readonly pos: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
  readonly rot?: readonly [number, number, number];
}

function buildSingleModuleParts(
  archetype: Bg3dObjectClusterArchetypeId,
  density: number,
  pal: ThemePalette,
): { readonly spanX: number; readonly parts: readonly LocalPart[] } {
  const parts: LocalPart[] = [];

  switch (archetype) {
    case "alley-wall-utility-clutter": {
      parts.push(
        { suffix: "rack-l", name: "Angle_Rack_Post_L", kind: "box", pos: [-0.48, 0.88, 0], scale: [0.05, 1.76, 0.48], color: pal.metal },
        { suffix: "rack-r", name: "Angle_Rack_Post_R", kind: "box", pos: [0.48, 0.88, 0], scale: [0.05, 1.76, 0.48], color: pal.metal },
        { suffix: "ac-low", name: "AC_Condenser_Lower", kind: "box", pos: [0, 0.45, 0.02], scale: [0.86, 0.56, 0.38], color: pal.base },
        { suffix: "fan-low", name: "AC_Fan_Shroud_Lower", kind: "torus", pos: [-0.14, 0.45, 0.22], scale: [0.38, 0.38, 0.14], color: pal.dark },
        { suffix: "ac-high", name: "AC_Condenser_Upper", kind: "box", pos: [0, 1.26, 0.02], scale: [0.86, 0.56, 0.38], color: pal.base },
        { suffix: "fan-high", name: "AC_Fan_Shroud_Upper", kind: "torus", pos: [-0.14, 1.26, 0.22], scale: [0.38, 0.38, 0.14], color: pal.dark },
        { suffix: "gas-meter", name: "CityGas_Meter_Box", kind: "box", pos: [0.74, 1.28, -0.04], scale: [0.28, 0.34, 0.18], color: pal.metal },
        { suffix: "gas-pipe", name: "Gas_Riser_Pipe", kind: "cylinder", pos: [0.68, 0.92, -0.06], scale: [0.05, 1.84, 0.05], color: "#eab308" },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "copper-pipe", name: "Coolant_Copper_Line", kind: "cylinder", pos: [0.55, 0.88, -0.08], scale: [0.04, 1.72, 0.04], color: "#b45309" },
          { suffix: "valve", name: "Gas_Shutoff_Valve", kind: "box", pos: [0.68, 0.98, 0.02], scale: [0.11, 0.04, 0.06], color: "#dc2626" },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "crate", name: "Alley_Utility_Crate", kind: "box", pos: [0.76, 0.22, 0.16], scale: [0.38, 0.44, 0.34], color: pal.accent },
          { suffix: "conduit-box", name: "Wall_Junction_Box", kind: "box", pos: [-0.72, 1.42, -0.05], scale: [0.24, 0.34, 0.14], color: pal.metal },
        );
      }
      return { spanX: 1.85, parts };
    }

    case "classroom-front-locker-rig": {
      parts.push(
        { suffix: "wall", name: "Classroom_Front_Wall", kind: "box", pos: [0, 1.28, -0.36], scale: [3.6, 2.56, 0.12], color: pal.base },
        { suffix: "wainscot", name: "Wood_Wainscot_Base", kind: "box", pos: [0, 0.40, -0.34], scale: [3.62, 0.80, 0.14], color: pal.wood },
        { suffix: "board", name: "Wide_Chalkboard", kind: "box", pos: [-0.52, 1.48, -0.28], scale: [2.28, 1.12, 0.05], color: "#1f4d3a" },
        { suffix: "tray", name: "Chalk_Ledge_Rail", kind: "box", pos: [-0.52, 0.90, -0.22], scale: [2.34, 0.04, 0.12], color: pal.metal },
        { suffix: "podium", name: "Teacher_Oak_Podium", kind: "box", pos: [-0.52, 0.52, 0.32], scale: [0.84, 1.04, 0.54], color: pal.wood },
        { suffix: "locker-body", name: "Student_Locker_Bank", kind: "box", pos: [1.24, 0.90, -0.10], scale: [1.08, 1.80, 0.44], color: pal.metal },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "clock", name: "Classroom_Wall_Clock", kind: "cylinder", pos: [-0.52, 2.26, -0.28], scale: [0.32, 0.05, 0.32], color: "#f8fafc", rot: [Math.PI / 2, 0, 0] },
          { suffix: "eraser", name: "Chalk_Eraser", kind: "box", pos: [-0.15, 0.94, -0.20], scale: [0.16, 0.05, 0.07], color: pal.accent },
          { suffix: "mic", name: "Podium_Gooseneck_Mic", kind: "cylinder", pos: [-0.34, 1.18, 0.42], scale: [0.03, 0.28, 0.03], color: pal.dark, rot: [-0.25, 0, 0] },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "broom-cabinet", name: "Cleaning_Tool_Locker", kind: "box", pos: [-1.88, 0.90, -0.12], scale: [0.44, 1.80, 0.42], color: pal.metal },
          { suffix: "top-plant", name: "Locker_Top_Planter", kind: "sphere", pos: [1.38, 1.98, -0.08], scale: [0.34, 0.28, 0.34], color: "#2f855a" },
        );
      }
      return { spanX: 3.85, parts };
    }

    case "office-creator-workstation": {
      parts.push(
        { suffix: "leg-l", name: "MotionDesk_Leg_L", kind: "box", pos: [-0.68, 0.37, 0], scale: [0.08, 0.74, 0.62], color: pal.dark },
        { suffix: "leg-r", name: "MotionDesk_Leg_R", kind: "box", pos: [0.68, 0.37, 0], scale: [0.08, 0.74, 0.62], color: pal.dark },
        { suffix: "top", name: "MotionDesk_Walnut_Slab", kind: "box", pos: [0, 0.76, 0], scale: [1.64, 0.04, 0.78], color: pal.wood },
        { suffix: "pen-disp", name: "Pen_Display_24in", kind: "box", pos: [-0.10, 0.92, 0.08], scale: [0.58, 0.34, 0.04], color: pal.glow, rot: [-0.62, 0, 0] },
        { suffix: "sub-arm", name: "Monitor_Arm_Post", kind: "cylinder", pos: [-0.54, 1.08, -0.28], scale: [0.05, 0.62, 0.05], color: pal.dark },
        { suffix: "sub-mon", name: "Reference_Monitor", kind: "box", pos: [-0.42, 1.28, -0.16], scale: [0.52, 0.32, 0.03], color: pal.dark, rot: [0, 0.26, 0] },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "pegboard", name: "Desk_Pegboard_Back", kind: "box", pos: [0.46, 1.06, -0.34], scale: [0.56, 0.54, 0.03], color: pal.base },
          { suffix: "lamp-bar", name: "Desk_LED_TaskBar", kind: "box", pos: [-0.08, 1.42, -0.02], scale: [0.44, 0.03, 0.04], color: pal.glow },
          { suffix: "spk-l", name: "Studio_Speaker_L", kind: "box", pos: [-0.70, 0.89, -0.18], scale: [0.13, 0.22, 0.16], color: pal.dark },
          { suffix: "spk-r", name: "Studio_Speaker_R", kind: "box", pos: [0.70, 0.89, -0.18], scale: [0.13, 0.22, 0.16], color: pal.dark },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "pc-tower", name: "Workstation_PC_Case", kind: "box", pos: [0.96, 0.24, -0.06], scale: [0.23, 0.48, 0.46], color: pal.dark },
          { suffix: "stylus-cup", name: "Brass_Stylus_Holder", kind: "cylinder", pos: [0.30, 0.83, 0.16], scale: [0.08, 0.10, 0.08], color: "#d97706" },
        );
      }
      return { spanX: 2.25, parts };
    }

    case "convenience-patio-street-furniture": {
      parts.push(
        { suffix: "pad", name: "Recycle_Shelter_Pad", kind: "box", pos: [-0.32, 0.03, 0], scale: [1.66, 0.06, 0.78], color: pal.dark },
        { suffix: "canopy", name: "Recycle_Sloped_Canopy", kind: "box", pos: [-0.32, 1.48, 0], scale: [1.64, 0.06, 0.82], color: pal.dark, rot: [0.18, 0, 0] },
        { suffix: "bin-1", name: "Recycle_Bin_Plastic", kind: "box", pos: [-0.82, 0.54, 0], scale: [0.42, 0.96, 0.48], color: "#2563eb" },
        { suffix: "bin-2", name: "Recycle_Bin_Glass", kind: "box", pos: [-0.32, 0.54, 0], scale: [0.42, 0.96, 0.48], color: "#16a34a" },
        { suffix: "bin-3", name: "Recycle_Bin_Can", kind: "box", pos: [0.18, 0.54, 0], scale: [0.42, 0.96, 0.48], color: "#d97706" },
        { suffix: "aboard", name: "Cafe_Wood_ABoard", kind: "box", pos: [0.84, 0.48, 0.10], scale: [0.52, 0.96, 0.36], color: pal.wood, rot: [0, -0.22, 0] },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "bollard-l", name: "Reflective_Bollard_L", kind: "cylinder", pos: [-1.10, 0.39, 0.42], scale: [0.14, 0.78, 0.14], color: pal.dark },
          { suffix: "bollard-r", name: "Reflective_Bollard_R", kind: "cylinder", pos: [1.28, 0.39, 0.42], scale: [0.14, 0.78, 0.14], color: pal.dark },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "patio-tbl", name: "Patio_Round_Table", kind: "cylinder", pos: [1.68, 0.74, -0.05], scale: [0.76, 0.05, 0.76], color: pal.base },
          { suffix: "patio-pole", name: "Patio_Parasol_Pole", kind: "cylinder", pos: [1.68, 1.05, -0.05], scale: [0.06, 2.10, 0.06], color: pal.metal },
          { suffix: "parasol", name: "Patio_Parasol_Canopy", kind: "cone", pos: [1.68, 2.12, -0.05], scale: [1.55, 0.42, 1.55], color: pal.accent },
        );
      }
      return { spanX: 2.95, parts };
    }

    case "subway-platform-gate-bay": {
      parts.push(
        { suffix: "deck", name: "Station_Floor_Base", kind: "box", pos: [0, 0.03, 0], scale: [1.68, 0.06, 1.56], color: pal.dark },
        { suffix: "gate-l", name: "Turnstile_Pedestal_L", kind: "box", pos: [-0.46, 0.52, 0], scale: [0.26, 0.94, 1.38], color: pal.metal },
        { suffix: "gate-r", name: "Turnstile_Pedestal_R", kind: "box", pos: [0.46, 0.52, 0], scale: [0.26, 0.94, 1.38], color: pal.metal },
        { suffix: "flap-l", name: "Barrier_Flap_L", kind: "box", pos: [-0.19, 0.54, 0.05], scale: [0.24, 0.66, 0.03], color: "#ef4444" },
        { suffix: "flap-r", name: "Barrier_Flap_R", kind: "box", pos: [0.19, 0.54, 0.05], scale: [0.24, 0.66, 0.03], color: "#ef4444" },
        { suffix: "reader-l", name: "NFC_Card_Pad_L", kind: "cylinder", pos: [-0.46, 1.02, 0.52], scale: [0.14, 0.04, 0.14], color: pal.glow },
        { suffix: "reader-r", name: "NFC_Card_Pad_R", kind: "cylinder", pos: [0.46, 1.02, 0.52], scale: [0.14, 0.04, 0.14], color: pal.glow },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "tactile", name: "Tactile_Guide_Strip", kind: "box", pos: [0, 0.065, 0.58], scale: [1.20, 0.015, 0.28], color: "#eab308" },
          { suffix: "sign", name: "Hanging_Station_Sign", kind: "box", pos: [0, 2.38, 0], scale: [1.48, 0.34, 0.08], color: pal.accent },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "fire-hydrant", name: "Station_Fire_Cabinet", kind: "box", pos: [1.05, 0.68, -0.45], scale: [0.42, 1.24, 0.22], color: "#dc2626" },
        );
      }
      return { spanX: 1.95, parts };
    }

    case "hospital-ward-corridor-set": {
      parts.push(
        { suffix: "wall", name: "Ward_Corridor_Wall", kind: "box", pos: [0, 1.04, -0.36], scale: [2.36, 2.08, 0.12], color: pal.base },
        { suffix: "bumper", name: "Ward_Handrail_Bumper", kind: "box", pos: [0, 0.88, -0.28], scale: [2.38, 0.14, 0.05], color: pal.accent },
        { suffix: "beam", name: "Waiting_Bench_Beam", kind: "box", pos: [-0.28, 0.38, 0.04], scale: [1.66, 0.12, 0.44], color: pal.dark },
        { suffix: "seat-1", name: "Ward_Seat_1", kind: "box", pos: [-0.84, 0.58, -0.02], scale: [0.48, 0.44, 0.44], color: "#4fd1c5" },
        { suffix: "seat-2", name: "Ward_Seat_2", kind: "box", pos: [-0.28, 0.58, -0.02], scale: [0.48, 0.44, 0.44], color: "#4fd1c5" },
        { suffix: "seat-3", name: "Ward_Seat_3", kind: "box", pos: [0.28, 0.58, -0.02], scale: [0.48, 0.44, 0.44], color: "#4fd1c5" },
        { suffix: "iv-pole", name: "Mobile_IV_Stand", kind: "cylinder", pos: [0.92, 0.88, 0.08], scale: [0.05, 1.76, 0.05], color: pal.metal },
        { suffix: "iv-base", name: "IV_Caster_Base", kind: "cylinder", pos: [0.92, 0.05, 0.08], scale: [0.46, 0.08, 0.46], color: pal.dark },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "iv-bag", name: "Saline_Fluid_Bag", kind: "box", pos: [0.84, 1.56, 0.08], scale: [0.11, 0.22, 0.05], color: pal.glow },
          { suffix: "monitor", name: "Queue_Display_Board", kind: "box", pos: [-0.28, 1.52, -0.27], scale: [0.94, 0.54, 0.05], color: pal.glow },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "sanitizer", name: "Hand_Sanitizer_Unit", kind: "box", pos: [0.48, 1.28, -0.26], scale: [0.14, 0.26, 0.10], color: "#f8fafc" },
        );
      }
      return { spanX: 2.45, parts };
    }

    case "hanok-jangdokdae-stone-wall": {
      parts.push(
        { suffix: "wall", name: "Hanok_Courtyard_Wall", kind: "box", pos: [0, 0.78, -0.68], scale: [2.84, 1.56, 0.28], color: pal.base },
        { suffix: "giwa-cap", name: "Giwa_Roof_Coping", kind: "triangularPrism", pos: [0, 1.66, -0.68], scale: [0.56, 2.96, 0.28], color: pal.dark, rot: [-Math.PI / 2, 0, Math.PI / 2] },
        { suffix: "tier-1", name: "Jangdok_Stone_Tier1", kind: "box", pos: [-0.26, 0.09, 0.04], scale: [2.08, 0.18, 1.20], color: pal.metal },
        { suffix: "tier-2", name: "Jangdok_Stone_Tier2", kind: "box", pos: [-0.26, 0.27, -0.20], scale: [1.84, 0.18, 0.58], color: pal.metal },
        { suffix: "jar-1", name: "Onggi_Large_Jar_1", kind: "sphere", pos: [-0.78, 0.64, -0.20], scale: [0.48, 0.62, 0.48], color: "#4a2511" },
        { suffix: "jar-2", name: "Onggi_Large_Jar_2", kind: "sphere", pos: [-0.26, 0.66, -0.20], scale: [0.52, 0.66, 0.52], color: "#5c2e14" },
        { suffix: "jar-3", name: "Onggi_Large_Jar_3", kind: "sphere", pos: [0.26, 0.62, -0.20], scale: [0.46, 0.58, 0.46], color: "#4a2511" },
        { suffix: "lantern", name: "Granite_Stone_Lantern", kind: "box", pos: [1.06, 0.52, 0.12], scale: [0.36, 1.04, 0.36], color: pal.metal },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "jar-sm-1", name: "Onggi_Medium_Jar_1", kind: "sphere", pos: [-0.56, 0.38, 0.32], scale: [0.36, 0.44, 0.36], color: "#5c2e14" },
          { suffix: "jar-sm-2", name: "Onggi_Medium_Jar_2", kind: "sphere", pos: [-0.04, 0.38, 0.32], scale: [0.36, 0.44, 0.36], color: "#4a2511" },
          { suffix: "lantern-glow", name: "Lantern_Light_Core", kind: "box", pos: [1.06, 0.84, 0.12], scale: [0.22, 0.18, 0.22], color: pal.glow },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "lantern-cap", name: "Lantern_Pyramid_Cap", kind: "pyramid", pos: [1.06, 1.12, 0.12], scale: [0.48, 0.22, 0.48], color: pal.dark },
        );
      }
      return { spanX: 3.05, parts };
    }

    case "fantasy-dungeon-alchemy-props": {
      parts.push(
        { suffix: "shelf-body", name: "Gothic_Bookshelf_Frame", kind: "box", pos: [-0.18, 1.06, 0], scale: [1.54, 2.12, 0.44], color: pal.wood },
        { suffix: "arch", name: "Ornate_Brass_Arch", kind: "torus", pos: [-0.18, 2.08, 0], scale: [1.36, 0.68, 0.18], color: "#d97706" },
        { suffix: "tomes-1", name: "Grimoire_Row_Lower", kind: "box", pos: [-0.32, 0.74, 0.04], scale: [1.12, 0.28, 0.28], color: "#7f1d1d" },
        { suffix: "tomes-2", name: "Grimoire_Row_Mid", kind: "box", pos: [-0.46, 1.24, 0.04], scale: [0.76, 0.28, 0.28], color: "#1e3a8a" },
        { suffix: "potion-1", name: "Mana_Potion_Flask", kind: "sphere", pos: [0.12, 1.18, 0.06], scale: [0.16, 0.18, 0.16], color: pal.glow },
        { suffix: "potion-2", name: "Vitality_Elixir_Flask", kind: "sphere", pos: [0.32, 1.18, 0.06], scale: [0.16, 0.18, 0.16], color: "#ec4899" },
        { suffix: "candelabra", name: "Brass_Stand_Candelabra", kind: "cylinder", pos: [0.86, 0.68, 0.08], scale: [0.08, 1.36, 0.08], color: "#d97706" },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "candelabra-base", name: "Candelabra_Disc_Base", kind: "cylinder", pos: [0.86, 0.03, 0.08], scale: [0.36, 0.06, 0.36], color: "#d97706" },
          { suffix: "flame", name: "Beeswax_Candle_Glow", kind: "cone", pos: [0.86, 1.46, 0.08], scale: [0.16, 0.18, 0.16], color: "#fbbf24" },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "chest", name: "Arcane_Relic_Chest", kind: "box", pos: [0.88, 0.22, -0.32], scale: [0.58, 0.44, 0.38], color: pal.wood },
        );
      }
      return { spanX: 2.15, parts };
    }
  }
}

/**
 * 선택된 아키타입·모듈 수·밀도·배치 대형에 맞춰 배경 전용 다중 파츠 오브젝트 클러스터를 생성한다.
 */
export function buildBg3dObjectClusterPrimitives(
  rawSpec: Bg3dObjectClusterSpec,
): Bg3dObjectClusterBuildResult {
  const modules = clamp(Math.round(rawSpec.moduleCount), 1, 4);
  const densityNum =
    rawSpec.clutterDensity === "lived-in" ? 3 : rawSpec.clutterDensity === "detailed" ? 2 : 1;
  const pal = SURFACE_THEMES[rawSpec.surfaceTheme];
  const [anchorX, anchorZ] = rawSpec.anchorOffsetXZ ?? [0, 0];
  const meta =
    STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.find((item) => item.id === rawSpec.archetype) ??
    STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES[0]!;

  const { spanX, parts: baseParts } = buildSingleModuleParts(rawSpec.archetype, densityNum, pal);
  const primitives: BgPrimitive[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let m = 0; m < modules; m++) {
    let modOffsetX = (m - (modules - 1) * 0.5) * (spanX + 0.18);
    let modOffsetZ = 0;
    let yaw = 0;

    if (rawSpec.arrangement === "l-corner" && m >= Math.ceil(modules / 2)) {
      const idxInCorner = m - Math.ceil(modules / 2);
      modOffsetX = (Math.ceil(modules / 2) - 0.5) * (spanX * 0.65);
      modOffsetZ = (idxInCorner + 0.65) * (spanX + 0.18);
      yaw = -Math.PI / 2;
    } else if (rawSpec.arrangement === "staggered-street") {
      modOffsetZ = (m % 2 === 0 ? -1 : 1) * 0.45;
    }

    for (const part of baseParts) {
      const [rx, rz] = rotateXZ(part.pos[0], part.pos[2], yaw);
      const wx = round3(anchorX + modOffsetX + rx);
      const wy = round3(Math.max(part.scale[1] * 0.5, part.pos[1]));
      const wz = round3(anchorZ + modOffsetZ + rz);
      const baseRot = part.rot ?? [0, 0, 0];

      minX = Math.min(minX, wx - part.scale[0] * 0.5);
      maxX = Math.max(maxX, wx + part.scale[0] * 0.5);
      maxY = Math.max(maxY, wy + part.scale[1] * 0.5);
      minZ = Math.min(minZ, wz - part.scale[2] * 0.5);
      maxZ = Math.max(maxZ, wz + part.scale[2] * 0.5);

      primitives.push({
        id: `bgobj-v10-${rawSpec.archetype}-m${m + 1}-${part.suffix}`,
        name: `${part.name}_${m + 1}`,
        kind: part.kind,
        position: [wx, wy, wz],
        rotation: [round3(baseRot[0]), round3(baseRot[1] + yaw), round3(baseRot[2])],
        scale: [round3(part.scale[0]), round3(part.scale[1]), round3(part.scale[2])],
        color: part.color,
        componentRef: { id: meta.v10GlbAssetId, name: meta.labelKo },
        tags: ["BgObject_Cluster_V10", `BgCluster_${rawSpec.archetype}`],
      });
    }
  }

  const estimatedLineArtEdges = primitives.length * 14;
  const monotonyReliefScore = clamp(
    Math.round(78 + primitives.length * 0.55 + (densityNum - 1) * 4),
    80,
    99,
  );
  const footprintMeters: readonly [number, number, number] = [
    round3(Math.max(0.5, maxX - minX)),
    round3(Math.max(0.5, maxY)),
    round3(Math.max(0.5, maxZ - minZ)),
  ];

  return {
    archetype: rawSpec.archetype,
    labelKo: meta.labelKo,
    primitives,
    partCount: primitives.length,
    estimatedLineArtEdges,
    monotonyReliefScore,
    footprintMeters,
    summaryKo: `${meta.labelKo} (${modules}모듈 · ${primitives.length}파츠 · 선화 엣지 약 ${estimatedLineArtEdges}선)`,
  };
}
