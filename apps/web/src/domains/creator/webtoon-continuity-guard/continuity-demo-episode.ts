/**
 * 1~60컷 웹툰 에피소드 연속성 감시관 기본 데모 타임라인 생성기.
 *
 * 6개 씬(아침 옥상 · 화실 · 노을 복도 · 야간 골목 · 회상 · 최후 대치 옥상)에 걸쳐
 * 4대 연속성 오류(소품 증발/돌연 출현 · 좌우 반전 · 의상/헤어 OKLCH 색감 급변 · 조명 방향 급변)와
 * 야간/회상 씬 태그 예외 사례를 결정론적으로 포함한다.
 */

import type { OklchColor } from "./continuity-color-math";
import type {
  CharacterCutSnapshot,
  CharacterPropSnapshot,
  CutSceneTag,
  KeyLightSnapshot,
  WebtoonCutSnapshot,
  WebtoonEpisodeTimeline,
} from "./continuity-types";

interface SceneBlueprint {
  readonly sceneId: string;
  readonly startCut: number;
  readonly endCut: number;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly tags: readonly CutSceneTag[];
  readonly keyLight: KeyLightSnapshot;
}

const DEMO_SCENES: readonly SceneBlueprint[] = [
  {
    sceneId: "scene-1-rooftop",
    startCut: 1,
    endCut: 12,
    nameKo: "씬 1 · 아침 학교 옥상",
    nameEn: "Scene 1 · Morning Rooftop",
    tags: ["day"],
    keyLight: { azimuthDeg: 45, elevationDeg: 38 },
  },
  {
    sceneId: "scene-2-atelier",
    startCut: 13,
    endCut: 24,
    nameKo: "씬 2 · 오후 미술실",
    nameEn: "Scene 2 · Afternoon Atelier",
    tags: ["indoor"],
    keyLight: { azimuthDeg: 110, elevationDeg: 42 },
  },
  {
    sceneId: "scene-3-corridor",
    startCut: 25,
    endCut: 32,
    nameKo: "씬 3 · 해질녘 복도",
    nameEn: "Scene 3 · Sunset Corridor",
    tags: ["sunset"],
    keyLight: { azimuthDeg: 235, elevationDeg: 18 },
  },
  {
    sceneId: "scene-4-night-alley",
    startCut: 33,
    endCut: 42,
    nameKo: "씬 4 · 야간 뒷골목",
    nameEn: "Scene 4 · Night Alley",
    tags: ["night"],
    keyLight: { azimuthDeg: 290, elevationDeg: 52 },
  },
  {
    sceneId: "scene-5-flashback",
    startCut: 43,
    endCut: 50,
    nameKo: "씬 5 · 3년 전 여름 회상",
    nameEn: "Scene 5 · 3-Year Flashback",
    tags: ["flashback"],
    keyLight: { azimuthDeg: 65, elevationDeg: 48 },
  },
  {
    sceneId: "scene-6-climax-roof",
    startCut: 51,
    endCut: 60,
    nameKo: "씬 6 · 결전의 옥상",
    nameEn: "Scene 6 · Final Rooftop",
    tags: ["day"],
    keyLight: { azimuthDeg: 315, elevationDeg: 30 },
  },
];

// 기준 캐릭터 OKLCH 팔레트
const SEOJIN_OUTFIT_DAY: OklchColor = { l: 0.42, c: 0.09, h: 252 };
const SEOJIN_HAIR_DAY: OklchColor = { l: 0.24, c: 0.03, h: 265 };
const HAEIN_OUTFIT_DAY: OklchColor = { l: 0.72, c: 0.11, h: 42 };
const HAEIN_HAIR_DAY: OklchColor = { l: 0.34, c: 0.06, h: 55 };
const DOYUN_OUTFIT_DAY: OklchColor = { l: 0.36, c: 0.07, h: 155 };
const DOYUN_HAIR_DAY: OklchColor = { l: 0.28, c: 0.02, h: 220 };

// 야간·회상 색보정 팔레트 (씬 태그 예외로 오탐 0건 검증용)
const SEOJIN_OUTFIT_NIGHT: OklchColor = { l: 0.22, c: 0.07, h: 262 };
const SEOJIN_HAIR_NIGHT: OklchColor = { l: 0.14, c: 0.03, h: 270 };
const HAEIN_OUTFIT_NIGHT: OklchColor = { l: 0.44, c: 0.08, h: 245 };
const HAEIN_HAIR_NIGHT: OklchColor = { l: 0.2, c: 0.04, h: 255 };
const DOYUN_OUTFIT_NIGHT: OklchColor = { l: 0.2, c: 0.05, h: 215 };
const DOYUN_HAIR_NIGHT: OklchColor = { l: 0.16, c: 0.02, h: 240 };

const SEOJIN_OUTFIT_FLASHBACK: OklchColor = { l: 0.64, c: 0.06, h: 78 };
const SEOJIN_HAIR_FLASHBACK: OklchColor = { l: 0.42, c: 0.05, h: 72 };
const HAEIN_OUTFIT_FLASHBACK: OklchColor = { l: 0.78, c: 0.05, h: 82 };
const HAEIN_HAIR_FLASHBACK: OklchColor = { l: 0.48, c: 0.05, h: 76 };

// 기본 소품 정의 (안경 · 베레모 · 귀걸이 · 시계 · 상처 · 가방 6종 전원 포함)
const PROP_GLASSES: CharacterPropSnapshot = {
  id: "seojin-glasses",
  kind: "glasses",
  labelKo: "은테 안경",
  labelEn: "Silver Glasses",
  side: "center",
};
const PROP_WATCH: CharacterPropSnapshot = {
  id: "seojin-watch",
  kind: "watch",
  labelKo: "가죽 손목시계",
  labelEn: "Leather Watch",
  side: "left",
};
const PROP_BAG: CharacterPropSnapshot = {
  id: "seojin-bag",
  kind: "bag",
  labelKo: "크로스백",
  labelEn: "Crossbody Bag",
  side: "right",
};
const PROP_BERET: CharacterPropSnapshot = {
  id: "haein-beret",
  kind: "beret",
  labelKo: "버건디 베레모",
  labelEn: "Burgundy Beret",
  side: "right",
};
const PROP_EARRINGS: CharacterPropSnapshot = {
  id: "haein-earrings",
  kind: "earrings",
  labelKo: "진주 귀걸이",
  labelEn: "Pearl Earrings",
  side: "both",
};
const PROP_SCAR: CharacterPropSnapshot = {
  id: "doyun-scar",
  kind: "scar",
  labelKo: "눈가 흉터",
  labelEn: "Eye Scar",
  side: "left",
};

function findSceneForCut(cutNumber: number): SceneBlueprint {
  const found = DEMO_SCENES.find((s) => cutNumber >= s.startCut && cutNumber <= s.endCut);
  return found ?? DEMO_SCENES[0];
}

function buildCharactersForCut(
  cutNumber: number,
  scene: SceneBlueprint,
): readonly CharacterCutSnapshot[] {
  const isNight = scene.tags.includes("night");
  const isFlashback = scene.tags.includes("flashback");

  // 1) 서진 (안경 · 손목시계 · 가방[야외 씬])
  const seojinProps: CharacterPropSnapshot[] = [];
  // 오류 ①-A (Cut 8): 서진 안경 소품 증발
  if (cutNumber !== 8) {
    seojinProps.push({ ...PROP_GLASSES });
  }
  // 오류 ②-D (Cut 56): 서진 손목시계 좌↔우 반전
  seojinProps.push({
    ...PROP_WATCH,
    side: cutNumber === 56 ? "right" : "left",
  });
  // 야외(씬 1·3·4·6)에서는 가방 착용, 실내 씬 2에서는 벗어둠 -> Cut 17에서 돌연 출현 오류 주입
  const carriesBagNaturally =
    scene.sceneId === "scene-1-rooftop" ||
    scene.sceneId === "scene-3-corridor" ||
    scene.sceneId === "scene-4-night-alley";
  if (carriesBagNaturally || cutNumber === 17) {
    seojinProps.push({ ...PROP_BAG });
  }

  const seojinOutfit = isNight
    ? SEOJIN_OUTFIT_NIGHT
    : isFlashback
      ? SEOJIN_OUTFIT_FLASHBACK
      : SEOJIN_OUTFIT_DAY;
  let seojinHair = isNight
    ? SEOJIN_HAIR_NIGHT
    : isFlashback
      ? SEOJIN_HAIR_FLASHBACK
      : SEOJIN_HAIR_DAY;

  // 오류 ③-B (Cut 53): 서진 헤어 색감 급변 (짙은 흑청 -> 선홍 갈색)
  if (cutNumber === 53) {
    seojinHair = { l: 0.56, c: 0.18, h: 28 };
  }

  const seojin: CharacterCutSnapshot = {
    characterId: "seojin",
    nameKo: "서진",
    nameEn: "Seojin",
    outfitColor: { ...seojinOutfit },
    hairColor: { ...seojinHair },
    props: seojinProps,
    asymmetricTraits: { hairPartSide: "left" },
  };

  // 2) 해인 (베레모 · 귀걸이 · 좌측 가르마)
  const haeinProps: CharacterPropSnapshot[] = [{ ...PROP_EARRINGS }];
  // 오류 ①-B (Cut 21): 해인 베레모 증발 / 오류 ②-C (Cut 28): 베레모 기울기 우→좌 반전
  if (cutNumber !== 21) {
    haeinProps.push({
      ...PROP_BERET,
      side: cutNumber === 28 ? "left" : "right",
    });
  }

  let haeinOutfit = isNight
    ? HAEIN_OUTFIT_NIGHT
    : isFlashback
      ? HAEIN_OUTFIT_FLASHBACK
      : HAEIN_OUTFIT_DAY;
  const haeinHair = isNight
    ? HAEIN_HAIR_NIGHT
    : isFlashback
      ? HAEIN_HAIR_FLASHBACK
      : HAEIN_HAIR_DAY;

  // 오류 ③-A (Cut 19): 해인 의상 색감 급변 (따뜻한 살구색 -> 청록색)
  if (cutNumber === 19) {
    haeinOutfit = { l: 0.58, c: 0.16, h: 198 };
  }

  const haein: CharacterCutSnapshot = {
    characterId: "haein",
    nameKo: "해인",
    nameEn: "Haein",
    outfitColor: { ...haeinOutfit },
    hairColor: { ...haeinHair },
    props: haeinProps,
    // 오류 ②-B (Cut 23): 해인 가르마 좌→우 반전
    asymmetricTraits: { hairPartSide: cutNumber === 23 ? "right" : "left" },
  };

  const characters: CharacterCutSnapshot[] = [seojin, haein];

  // 3) 도윤 (씬 2·4·6 등장 — 눈가 흉터)
  if (
    scene.sceneId === "scene-2-atelier" ||
    scene.sceneId === "scene-4-night-alley" ||
    scene.sceneId === "scene-6-climax-roof"
  ) {
    const doyunProps: CharacterPropSnapshot[] = [];
    // 오류 ①-C (Cut 54): 도윤 상처(흉터) 소품 증발 / 오류 ②-A (Cut 14): 흉터 좌→우 반전
    if (cutNumber !== 54) {
      doyunProps.push({
        ...PROP_SCAR,
        side: cutNumber === 14 ? "right" : "left",
      });
    }

    characters.push({
      characterId: "doyun",
      nameKo: "도윤",
      nameEn: "Doyun",
      outfitColor: { ...(isNight ? DOYUN_OUTFIT_NIGHT : DOYUN_OUTFIT_DAY) },
      hairColor: { ...(isNight ? DOYUN_HAIR_NIGHT : DOYUN_HAIR_DAY) },
      props: doyunProps,
      asymmetricTraits: { hairPartSide: "right" },
    });
  }

  return characters;
}

/**
 * 1~60컷 전 에피소드 데모 타임라인을 생성한다.
 * - 4대 오류 총 12건 내장 (소품 4건 · 좌우 반전 4건 · 색감 급변 2건 · 조명 불일치 2건)
 * - 야간(33~42컷) 및 회상(43~50컷) 씬은 색감 예외 처리되어 오탐이 발생하지 않는다.
 */
export function createDemo60CutEpisode(): WebtoonEpisodeTimeline {
  const cuts: WebtoonCutSnapshot[] = [];

  for (let cutNumber = 1; cutNumber <= 60; cutNumber += 1) {
    const scene = findSceneForCut(cutNumber);
    let keyLight: KeyLightSnapshot = { ...scene.keyLight };

    // 오류 ④-A (Cut 10): 씬 1 주광원 방위각 45° -> 165° (Δ120°, critical)
    if (cutNumber === 10) {
      keyLight = { azimuthDeg: 165, elevationDeg: 40 };
    }
    // 오류 ④-B (Cut 57): 씬 6 주광원 방위각 315° -> 60° (360° 래핑 Δ105°, warning)
    if (cutNumber === 57) {
      keyLight = { azimuthDeg: 60, elevationDeg: 28 };
    }

    cuts.push({
      cutNumber,
      sceneId: scene.sceneId,
      sceneNameKo: scene.nameKo,
      sceneNameEn: scene.nameEn,
      sceneTags: [...scene.tags],
      keyLight,
      characters: buildCharactersForCut(cutNumber, scene),
    });
  }

  return {
    episodeId: "ep-14-rooftop-promise",
    titleKo: "14화 · 옥상 위의 약속 (60컷)",
    titleEn: "Ep. 14 · Rooftop Promise (60 Cuts)",
    cuts,
  };
}
