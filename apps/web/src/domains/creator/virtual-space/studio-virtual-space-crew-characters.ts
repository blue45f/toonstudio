import type { StudioCharacterAtlasClip, StudioCharacterFramePresentation, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

/** 직접 선택하는 제작진. 사무실과 Phaser에서 같은 발 기준점·보행·작업 원화를 쓴다. */
export const STUDIO_CREW_KEYS = ["nia", "junseo"] as const;
export type StudioCrewKey = typeof STUDIO_CREW_KEYS[number];

export function isStudioCrewKey(key: string): key is StudioCrewKey {
  return STUDIO_CREW_KEYS.some((candidate) => candidate === key);
}

const CELL = { frameWidth: 128, frameHeight: 192 } as const;
const WALK_ATLAS = { width: 1152, height: 768, slicing: "rounded-grid", columns: 9, rows: 4 } as const;
const WORK_ATLAS = { width: 512, height: 576, slicing: "rounded-grid", columns: 4, rows: 3 } as const;
const PRESENTATION: StudioCharacterFramePresentation = { originX: .5, originY: 188 / 192, displayHeightRatio: 1.04 };
const SEATED = { ...PRESENTATION, seatOriginY: .75 };
const ROW = { down: 0, left: 1, right: 2, up: 3 } as const;

function crewSkin(key: StudioCrewKey, labelKo: string, labelEn: string): StudioCharacterSkin {
  const root = "/assets/virtual-studio/toon-office-v1/characters";
  const walk = `${root}/${key}.webp`;
  const work = { textureUrl: `${root}/work/${key}.webp`, ...CELL, atlas: WORK_ATLAS };
  const clip = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
    const start = ROW[facing] * WALK_ATLAS.columns + 1;
    return { textureUrl: walk, ...CELL, atlas: WALK_ATLAS, start, end: start + 7,
      frameRate: 12, repeat: -1, distancePerCycle: 78, technique: "drawn", frames: Array(8).fill(PRESENTATION) };
  };
  return {
    key, labelKo, labelEn, selectionOnly: true, sharedMotionSheets: true,
    directional: { down: walk, left: walk, right: walk, up: walk },
    clips: { "walk-down": clip("down"), "walk-left": clip("left"), "walk-right": clip("right"), "walk-up": clip("up") },
    idleFrames: { down: 0, left: 9, right: 18, up: 27 }, idlePresentation: PRESENTATION,
    poses: {
      sit: { ...work, directionFrames: { down: 4, left: 4, right: 4, up: 0 }, frames: Array(12).fill(SEATED) },
      wave: { ...work, directionFrames: { down: 8, left: 8, right: 8, up: 8 }, frames: Array(12).fill(PRESENTATION) },
    },
  };
}

export const STUDIO_CREW_SKINS = [
  crewSkin("nia", "니아 · 사운드 디자이너", "Nia · Sound designer"),
  crewSkin("junseo", "준서 · 프로덕션 디자이너", "Junseo · Production designer"),
];
