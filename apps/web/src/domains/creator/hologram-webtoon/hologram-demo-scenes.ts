import {
  DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM,
  HOLOGRAM_MANIFEST_SCHEMA,
  type HologramLayerSpec,
  type HologramPlaneRole,
  type HologramWebtoonManifest,
} from "./hologram-spatial-projection";

export type HologramDemoSceneId =
  | "neon-rooftop-action"
  | "arcane-library-rofan"
  | "murim-bamboo-forest";

export interface HologramDemoScenePreset {
  readonly id: HologramDemoSceneId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly genreTagKo: string;
  readonly genreTagEn: string;
  readonly balloonTextKo: string;
  readonly balloonTextEn: string;
  readonly sfxTextKo: string;
  readonly sfxTextEn: string;
  readonly defaultHolofoilIntensity: number;
  readonly defaultDepthOfFieldStrength: number;
  readonly layers: readonly HologramLayerSpec[];
}

function buildFivePlanes(
  sceneId: HologramDemoSceneId,
  labels: Readonly<Record<HologramPlaneRole, { readonly ko: string; readonly en: string; readonly foilGain: number }>>,
): readonly HologramLayerSpec[] {
  const roles: readonly HologramPlaneRole[] = ["bg", "mid", "char", "fx", "balloon"];
  return roles.map((role) => ({
    id: `${sceneId}-${role}`,
    role,
    labelKo: labels[role].ko,
    labelEn: labels[role].en,
    zMm: DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM[role],
    opacity: 1,
    visible: true,
    foilGain: labels[role].foilGain,
  }));
}

export const HOLOGRAM_DEMO_SCENES: readonly HologramDemoScenePreset[] = [
  {
    id: "neon-rooftop-action",
    titleKo: "네온 루프탑 액션",
    titleEn: "Neon Rooftop Action",
    subtitleKo: "빗속 마천루 위로 도약하는 추격전 5-평면 컷",
    subtitleEn: "Five-plane rooftop pursuit leaping across rain-lit towers",
    genreTagKo: "액션 · 사이버",
    genreTagEn: "Action · Cyber",
    balloonTextKo: "지금이다— 옥상 끝에서 돌파한다!",
    balloonTextEn: "Now— break across the rooftop edge!",
    sfxTextKo: "파지직!",
    sfxTextEn: "KRAKOOM!",
    defaultHolofoilIntensity: 0.78,
    defaultDepthOfFieldStrength: 0.35,
    layers: buildFivePlanes("neon-rooftop-action", {
      bg: { ko: "배경 · 마천루 야경", en: "BG · Skyline Rain", foilGain: 0.55 },
      mid: { ko: "중경 · 옥상 난간·간판", en: "Mid · Parapet & Signs", foilGain: 0.85 },
      char: { ko: "캐릭터 · 도약 주인공", en: "Char · Leaping Hero", foilGain: 0.9 },
      fx: { ko: "이펙트 · 참격 스파크", en: "FX · Energy Slash", foilGain: 1.45 },
      balloon: { ko: "말풍선 · 돌입 대사", en: "Balloon · Action Call", foilGain: 0.4 },
    }),
  },
  {
    id: "arcane-library-rofan",
    titleKo: "로판 마법 도서관",
    titleEn: "Arcane Library Romance-Fantasy",
    subtitleKo: "부유하는 마도서와 룬 원진이 겹쳐지는 환상 컷",
    subtitleEn: "Floating grimoires and layered rune rings in a vaulted archive",
    genreTagKo: "로판 · 판타지",
    genreTagEn: "Rom-Fan · Arcane",
    balloonTextKo: "봉인된 서고가 마침내 눈을 떴군요.",
    balloonTextEn: "The sealed archive has finally awakened.",
    sfxTextKo: "반짝—",
    sfxTextEn: "SHIMMER—",
    defaultHolofoilIntensity: 0.72,
    defaultDepthOfFieldStrength: 0.42,
    layers: buildFivePlanes("arcane-library-rofan", {
      bg: { ko: "배경 · 아치 성당 서가", en: "BG · Vaulted Arches", foilGain: 0.6 },
      mid: { ko: "중경 · 부유 마도서", en: "Mid · Floating Tomes", foilGain: 0.95 },
      char: { ko: "캐릭터 · 영애 마도사", en: "Char · Noble Mage", foilGain: 0.9 },
      fx: { ko: "이펙트 · 황금 룬 원진", en: "FX · Arcane Sigil", foilGain: 1.5 },
      balloon: { ko: "말풍선 · 우아한 독백", en: "Balloon · Archive Vow", foilGain: 0.45 },
    }),
  },
  {
    id: "murim-bamboo-forest",
    titleKo: "무협 대나무 숲",
    titleEn: "Murim Bamboo Forest",
    subtitleKo: "수묵 원경과 대나무 잎·검기가 교차하는 절정 컷",
    subtitleEn: "Ink-wash peaks, swaying bamboo stalks, and sweeping sword qi",
    genreTagKo: "무협 · 수묵",
    genreTagEn: "Murim · Ink",
    balloonTextKo: "바람이 멈추는 찰나, 검기가 열린다.",
    balloonTextEn: "When the wind stills, sword qi parts the mist.",
    sfxTextKo: "서걱—",
    sfxTextEn: "WHOOSH—",
    defaultHolofoilIntensity: 0.48,
    defaultDepthOfFieldStrength: 0.45,
    layers: buildFivePlanes("murim-bamboo-forest", {
      bg: { ko: "배경 · 수묵 원산", en: "BG · Ink-Wash Peaks", foilGain: 0.45 },
      mid: { ko: "중경 · 흔들리는 대숲", en: "Mid · Bamboo Grove", foilGain: 0.75 },
      char: { ko: "캐릭터 · 삿갓 검객", en: "Char · Bamboo Swordsman", foilGain: 0.85 },
      fx: { ko: "이펙트 · 먹빛 검기·죽엽", en: "FX · Sword Qi & Leaves", foilGain: 1.3 },
      balloon: { ko: "말풍선 · 검객 일갈", en: "Balloon · Blade Oath", foilGain: 0.35 },
    }),
  },
] as const;

export function findHologramDemoScene(sceneId: HologramDemoSceneId): HologramDemoScenePreset {
  return HOLOGRAM_DEMO_SCENES.find((scene) => scene.id === sceneId) ?? HOLOGRAM_DEMO_SCENES[0];
}

export function buildManifestFromScene(params: {
  readonly scene: HologramDemoScenePreset;
  readonly layers: readonly HologramLayerSpec[];
  readonly eyeZMm: number;
  readonly ipdMm: number;
  readonly maxComfortDisparityDeg: number;
  readonly holofoilIntensity: number;
  readonly depthOfFieldStrength: number;
  readonly quiltCols?: number;
  readonly quiltRows?: number;
  readonly quiltViewConeDeg?: number;
  readonly createdAtIso?: string;
}): HologramWebtoonManifest {
  return {
    schema: HOLOGRAM_MANIFEST_SCHEMA,
    sceneId: params.scene.id,
    title: {
      ko: params.scene.titleKo,
      en: params.scene.titleEn,
    },
    createdAtIso: params.createdAtIso ?? new Date().toISOString(),
    viewerDefaults: {
      eyeZMm: params.eyeZMm,
      ipdMm: params.ipdMm,
      maxComfortDisparityDeg: params.maxComfortDisparityDeg,
      holofoilIntensity: params.holofoilIntensity,
      depthOfFieldStrength: params.depthOfFieldStrength,
    },
    quilt: {
      cols: params.quiltCols ?? 4,
      rows: params.quiltRows ?? 8,
      viewConeDeg: params.quiltViewConeDeg ?? 40,
    },
    layers: params.layers.map((layer) => ({
      id: layer.id,
      role: layer.role,
      labelKo: layer.labelKo,
      labelEn: layer.labelEn,
      zMm: layer.zMm,
      opacity: layer.opacity ?? 1,
      visible: layer.visible ?? true,
    })),
  };
}
