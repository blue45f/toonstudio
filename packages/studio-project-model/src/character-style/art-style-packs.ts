/**
 * 화풍 팩 T1 8종 데이터 — `@toonstudio/studio-project-model` 정식 승격 단위.
 *
 * `apps/character-lab/src/presets/art-style-packs.ts`의 8종 장르 화풍 팩(일본 애니 셀 · 소년 잉크 ·
 * 소녀 반짝 · 청년·극화 · 웹툰 로맨스 · 웹툰 액션 · SD · 수묵)을 공용 패키지로 승격해
 * ToonStudio 본 서비스 3D 캐릭터 셰이퍼에서 직접 선택·적용할 수 있게 한다.
 */
import {
  ART_STYLE_IDS,
  ART_STYLE_LABELS_KO,
  type ArtStyleId,
  type ArtStylePack,
  type Look,
  type Proportion,
  type ShadeTint,
} from "./art-style";

export const ART_STYLE_PACK_REVISION = 1;

type Rgb = readonly [number, number, number];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function oklab(dL: number, dHueDeg: number, chroma: number): ShadeTint {
  return { kind: "oklab", dL, dHueDeg, chroma };
}

function multiply(rgb: Rgb): ShadeTint {
  return { kind: "multiply", rgb: [rgb[0], rgb[1], rgb[2]] };
}

function shadeAll(tint: () => ShadeTint): Look["shade"] {
  return { skin: tint(), hair: tint(), other: tint() };
}

function figure(
  headsTall: number,
  legRatio: number,
  armRatio: number,
  shoulderHeads: number,
  headWidthRatio: number,
  handScale: number,
): Proportion {
  return { headsTall, legRatio, armRatio, shoulderHeads, headWidthRatio, handScale };
}

function identityRim(): Look["rim"] {
  return { edge0: 0.55, edge1: 0.65, strength: 1, color: [0.35, 0.35, 0.4] };
}
function noSpecular(): Look["specular"] {
  return { size: 0, strength: 0, hairBand: "none", center: 0.5, width: 0 };
}
function noInnerLine(): Look["line"]["inner"] {
  return { enabled: false, creaseDeg: 30, partBoundary: false, widthPx: 1 };
}
function noTone(): Look["tone"] {
  return { kind: "none", cellPerHead: 40, angleDeg: 45, bands: [0, 0.5, 0.8], strength: 0, ink: "shade" };
}
function noPaper(): Look["paper"] {
  return { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 };
}

const V2_SKIN_SHADE: Rgb = [0.86, 0.6, 0.58];
const V2_HAIR_SHADE: Rgb = [0.62, 0.58, 0.72];
const V2_OTHER_SHADE: Rgb = [0.68, 0.68, 0.78];

const JP_ANIME_CEL: ArtStylePack = {
  id: "jp-anime-cel",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-anime-cel"],
  labelEn: "Anime cel",
  proportion: {
    feminine: figure(7.0, 0.48, 0.43, 1.6, 0.8, 1),
    masculine: figure(7.5, 0.48, 0.44, 2, 0.76, 1.05),
  },
  face: {
    eyeFamily: "anime-round",
    eyeWidthToFace: 0.25,
    eyeOpenRatio: 0.75,
    irisToEye: 0.6,
    eyeLine: 0.55,
    lash: "liner",
  },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.05, secondShade: null },
    shade: shadeAll(() => oklab(-0.22, -20, 1)),
    rim: identityRim(),
    specular: { size: 0.3, strength: 0.6, hairBand: "band", center: 0.35, width: 0.12 },
    line: {
      method: "style-hull",
      widthMm: 3,
      depthGain: 0,
      curvatureGain: 0,
      color: { mode: "darken-albedo", dL: 0.55, chroma: 0.6 },
      inner: noInnerLine(),
    },
    tone: noTone(),
    paper: noPaper(),
    grade: { saturation: 1.05, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#ffe6d8", "#f8d6c2", "#ecc0a2", "#d9a07c", "#b07656", "#7a5038"],
    hair: ["#2b1d16", "#5a3a2a", "#c98f4f", "#f0d9a0", "#4a5fa8", "#e07a8f"],
    saturation: 1.05,
  },
};

const JP_SHOUNEN_INK: ArtStylePack = {
  id: "jp-shounen-ink",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-shounen-ink"],
  labelEn: "Shounen ink",
  proportion: {
    feminine: figure(7.5, 0.49, 0.44, 1.7, 0.78, 1),
    masculine: figure(8, 0.49, 0.45, 2.2, 0.75, 1.05),
  },
  face: {
    eyeFamily: "shounen-sharp",
    eyeWidthToFace: 0.2,
    eyeOpenRatio: 0.45,
    irisToEye: 0.45,
    eyeLine: 0.52,
    lash: "liner",
  },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.02, secondShade: null },
    shade: shadeAll(() => oklab(-0.3, 0, 0.6)),
    rim: identityRim(),
    specular: noSpecular(),
    line: {
      method: "style-hull",
      widthMm: 6.5,
      depthGain: 0.4,
      curvatureGain: 0.5,
      color: { mode: "fixed", rgb: [0, 0, 0] },
      inner: { enabled: true, creaseDeg: 30, partBoundary: true, widthPx: 2 },
    },
    tone: { kind: "halftone", cellPerHead: 22, angleDeg: 45, bands: [0, 0.55, 0.85], strength: 0.85, ink: "line" },
    paper: { kind: "print", strength: 0.15, grainPx1080: 1.5, bleedPx1080: 0, seed: 0 },
    grade: { saturation: 0.9, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#f6d8c0", "#ebc6a6", "#d8a882", "#c08a64", "#93603f", "#5e3c27"],
    hair: ["#151417", "#3a2a22", "#7a4a2a", "#d9c9a0", "#b0342e", "#2f4f9f"],
    saturation: 0.9,
  },
};

const JP_SHOUJO_SOFT: ArtStylePack = {
  id: "jp-shoujo-soft",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-shoujo-soft"],
  labelEn: "Shoujo sparkle",
  proportion: {
    feminine: figure(7.8, 0.51, 0.44, 1.55, 0.8, 0.9),
    masculine: figure(8.5, 0.51, 0.45, 2.05, 0.76, 0.95),
  },
  face: {
    eyeFamily: "shoujo-sparkle",
    eyeWidthToFace: 0.28,
    eyeOpenRatio: 0.85,
    irisToEye: 0.66,
    eyeLine: 0.56,
    lash: "strands",
  },
  toon: { rampSteps: 3, rim: true, outline: "hull" },
  look: {
    ramp: { softness: 0.35, secondShade: oklab(-0.24, 25, 0.85) },
    shade: shadeAll(() => oklab(-0.12, 25, 0.9)),
    rim: { edge0: 0.5, edge1: 0.7, strength: 0.8, color: [1, 0.94, 0.97] },
    specular: { size: 0.25, strength: 0.5, hairBand: "ring", center: 0.3, width: 0.1 },
    line: {
      method: "style-hull",
      widthMm: 1.2,
      depthGain: 0.2,
      curvatureGain: 0,
      color: { mode: "darken-albedo", dL: 0.35, chroma: 0.8 },
      inner: noInnerLine(),
    },
    tone: { kind: "dots", cellPerHead: 60, angleDeg: 45, bands: [0, 0.5, 0.8], strength: 0.25, ink: "shade" },
    paper: { kind: "print", strength: 0.1, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
    grade: { saturation: 0.65, lightness: 0.03, accentChannels: [] },
  },
  palette: {
    skin: ["#fff0e8", "#fbe3d6", "#f4d2c0", "#e6b9a0", "#c99478", "#9a6a52"],
    hair: ["#5a4036", "#b98a6a", "#f2dcb4", "#f2b8c6", "#c9b8e8", "#a8d0e6"],
    saturation: 0.65,
  },
};

const JP_SEINEN_REAL: ArtStylePack = {
  id: "jp-seinen-real",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["jp-seinen-real"],
  labelEn: "Seinen drama",
  proportion: {
    feminine: figure(7.2, 0.47, 0.44, 1.75, 0.72, 1.05),
    masculine: figure(7.6, 0.47, 0.45, 2.35, 0.7, 1.1),
  },
  face: {
    eyeFamily: "realistic",
    eyeWidthToFace: 0.18,
    eyeOpenRatio: 0.38,
    irisToEye: 0.42,
    eyeLine: 0.48,
    lash: "strands",
  },
  toon: { rampSteps: 4, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.1, secondShade: oklab(-0.5, 0, 0.7) },
    shade: shadeAll(() => oklab(-0.35, 0, 0.8)),
    rim: identityRim(),
    specular: { size: 0.15, strength: 0.3, hairBand: "none", center: 0.5, width: 0.1 },
    line: {
      method: "style-hull",
      widthMm: 3.5,
      depthGain: 0.6,
      curvatureGain: 0.8,
      color: { mode: "fixed", rgb: [0.03, 0.03, 0.03] },
      inner: { enabled: true, creaseDeg: 25, partBoundary: true, widthPx: 2 },
    },
    tone: { kind: "crosshatch", cellPerHead: 40, angleDeg: 30, bands: [0.35, 0.6, 0.85], strength: 0.7, ink: "line" },
    paper: { kind: "print", strength: 0.2, grainPx1080: 1.5, bleedPx1080: 0, seed: 0 },
    grade: { saturation: 0.75, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#efd2bb", "#ddb89a", "#c79a78", "#a97b5a", "#7f5940", "#55392a"],
    hair: ["#1b1a1c", "#3b2e27", "#5f4a3c", "#8a8580", "#c9c4bc"],
    saturation: 0.75,
  },
};

const KR_WEBTOON_ROMANCE: ArtStylePack = {
  id: "kr-webtoon-romance",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["kr-webtoon-romance"],
  labelEn: "Webtoon romance",
  proportion: {
    feminine: figure(7.8, 0.52, 0.44, 1.7, 0.75, 0.95),
    masculine: figure(9, 0.52, 0.45, 2.3, 0.72, 1),
  },
  face: {
    eyeFamily: "webtoon-almond",
    eyeWidthToFace: 0.22,
    eyeOpenRatio: 0.68,
    irisToEye: 0.58,
    eyeLine: 0.54,
    lash: "liner",
  },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.2, secondShade: null },
    shade: {
      skin: multiply(V2_SKIN_SHADE),
      hair: multiply(V2_HAIR_SHADE),
      other: multiply(V2_OTHER_SHADE),
    },
    rim: identityRim(),
    specular: { size: 0.25, strength: 0.35, hairBand: "band", center: 0.3, width: 0.15 },
    line: {
      method: "engine-hull",
      widthMm: 4,
      depthGain: 0,
      curvatureGain: 0,
      color: { mode: "fixed", rgb: [0.05, 0.04, 0.06] },
      inner: noInnerLine(),
    },
    tone: noTone(),
    paper: noPaper(),
    grade: { saturation: 0.9, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#fbe5d6", "#f3d3bd", "#e9c2a6", "#d7a585", "#b7825f", "#875b40"],
    hair: ["#2b1d16", "#4a3226", "#7b5a44", "#b88f6b", "#d8c3a5", "#1e2230"],
    saturation: 0.9,
  },
};

const KR_WEBTOON_ACTION: ArtStylePack = {
  id: "kr-webtoon-action",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["kr-webtoon-action"],
  labelEn: "Webtoon action",
  proportion: {
    feminine: figure(7.8, 0.5, 0.44, 1.8, 0.74, 1),
    masculine: figure(8.6, 0.5, 0.45, 2.4, 0.72, 1.05),
  },
  face: {
    eyeFamily: "shounen-sharp",
    eyeWidthToFace: 0.2,
    eyeOpenRatio: 0.5,
    irisToEye: 0.48,
    eyeLine: 0.52,
    lash: "liner",
  },
  toon: { rampSteps: 3, rim: true, outline: "hull" },
  look: {
    ramp: { softness: 0.6, secondShade: oklab(-0.38, -8, 0.9) },
    shade: shadeAll(() => oklab(-0.24, -8, 0.95)),
    rim: { edge0: 0.6, edge1: 0.72, strength: 1.2, color: [0.55, 0.7, 1] },
    specular: { size: 0.2, strength: 0.5, hairBand: "band", center: 0.4, width: 0.1 },
    line: {
      method: "style-hull",
      widthMm: 3.5,
      depthGain: 0.5,
      curvatureGain: 0.2,
      color: { mode: "darken-albedo", dL: 0.6, chroma: 0.5 },
      inner: noInnerLine(),
    },
    tone: noTone(),
    paper: noPaper(),
    grade: { saturation: 1, lightness: 0, accentChannels: [] },
  },
  palette: {
    skin: ["#f0d0b6", "#e0b896", "#c99a74", "#ab7a55", "#82573a", "#573826"],
    hair: ["#121216", "#2a2a33", "#4d3a2f", "#c8c8d0", "#7a1f2a", "#25406f"],
    saturation: 1,
  },
};

const SD_CHIBI: ArtStylePack = {
  id: "sd-chibi",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["sd-chibi"],
  labelEn: "Super deformed",
  proportion: {
    feminine: figure(3, 0.3, 0.33, 1.15, 1, 0.8),
    masculine: figure(3.2, 0.3, 0.33, 1.25, 0.98, 0.8),
  },
  face: {
    eyeFamily: "sd-dot",
    eyeWidthToFace: 0.32,
    eyeOpenRatio: 0.9,
    irisToEye: 0.72,
    eyeLine: 0.6,
    lash: "none",
  },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.1, secondShade: null },
    shade: shadeAll(() => oklab(-0.18, -10, 1.1)),
    rim: identityRim(),
    specular: { size: 0.35, strength: 0.4, hairBand: "band", center: 0.35, width: 0.14 },
    line: {
      method: "style-hull",
      widthMm: 3,
      depthGain: 0,
      curvatureGain: 0,
      color: { mode: "darken-albedo", dL: 0.5, chroma: 0.7 },
      inner: noInnerLine(),
    },
    tone: noTone(),
    paper: noPaper(),
    grade: { saturation: 1.15, lightness: 0.02, accentChannels: [] },
  },
  palette: {
    skin: ["#ffe8da", "#fbd9c4", "#f2c4a6", "#e0a985", "#c08060", "#8c5a3e"],
    hair: ["#3a2a22", "#a0663c", "#f5d68a", "#ff9fb8", "#8fc8ff", "#b6f2c8"],
    saturation: 1.15,
  },
};

const INK_WASH: ArtStylePack = {
  id: "ink-wash",
  revision: ART_STYLE_PACK_REVISION,
  labelKo: ART_STYLE_LABELS_KO["ink-wash"],
  labelEn: "Ink wash",
  proportion: {
    feminine: figure(7.2, 0.47, 0.44, 1.7, 0.72, 0.95),
    masculine: figure(7.6, 0.47, 0.45, 2.1, 0.7, 1),
  },
  face: {
    eyeFamily: "ink-narrow",
    eyeWidthToFace: 0.17,
    eyeOpenRatio: 0.35,
    irisToEye: 0.4,
    eyeLine: 0.5,
    lash: "liner",
  },
  toon: { rampSteps: 2, rim: false, outline: "hull" },
  look: {
    ramp: { softness: 0.5, secondShade: null },
    shade: shadeAll(() => oklab(-0.25, 0, 0.2)),
    rim: identityRim(),
    specular: noSpecular(),
    line: {
      method: "style-hull",
      widthMm: 3,
      depthGain: 0.3,
      curvatureGain: 1,
      color: { mode: "fixed", rgb: [0.08, 0.08, 0.09] },
      inner: { enabled: true, creaseDeg: 35, partBoundary: false, widthPx: 2 },
    },
    tone: noTone(),
    paper: { kind: "ink-wash", strength: 0.6, grainPx1080: 2, bleedPx1080: 3, seed: 0 },
    grade: { saturation: 0.12, lightness: 0, accentChannels: ["accessory"] },
  },
  palette: {
    skin: ["#f2eee6", "#e6dfd2", "#d6cdbd", "#bfb5a4"],
    hair: ["#1b1b1d", "#3a3a3d", "#5c5b5e"],
    saturation: 0.12,
  },
};

const PACKS_BY_ID: Readonly<Record<ArtStyleId, ArtStylePack>> = deepFreeze({
  "jp-anime-cel": JP_ANIME_CEL,
  "jp-shounen-ink": JP_SHOUNEN_INK,
  "jp-shoujo-soft": JP_SHOUJO_SOFT,
  "jp-seinen-real": JP_SEINEN_REAL,
  "kr-webtoon-romance": KR_WEBTOON_ROMANCE,
  "kr-webtoon-action": KR_WEBTOON_ACTION,
  "sd-chibi": SD_CHIBI,
  "ink-wash": INK_WASH,
});

/** T1 화풍 팩 8종(계약 `ART_STYLE_IDS` 순서, 깊이 동결) */
export const ART_STYLE_PACKS: readonly ArtStylePack[] = Object.freeze(
  ART_STYLE_IDS.map((id) => PACKS_BY_ID[id]),
);

/** id로 화풍 팩을 조회한다. */
export function artStylePack(id: ArtStyleId): ArtStylePack {
  return PACKS_BY_ID[id];
}

export interface ArtStylePackProvenance {
  readonly measured: readonly string[];
  readonly references: readonly string[];
  readonly noteKo: string;
}

const PROPOSED_ONLY = "모든 수치가 [제안] 초기값입니다.";

export const ART_STYLE_PACK_PROVENANCE: Readonly<Record<ArtStyleId, ArtStylePackProvenance>> = deepFreeze({
  "jp-anime-cel": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "jp-shounen-ink": {
    measured: [],
    references: ["Studio MToon '굵은 잉크'(외곽선 0.0065 m · #000000)"],
    noteKo: `${PROPOSED_ONLY} 선 굵기·색은 Studio MToon 프리셋과 동일한 기준값입니다.`,
  },
  "jp-shoujo-soft": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "jp-seinen-real": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "kr-webtoon-romance": {
    measured: [
      "proportion.feminine.headsTall",
      "proportion.masculine.headsTall",
      "face.eyeWidthToFace",
      "face.eyeOpenRatio",
      "face.irisToEye",
      "face.eyeLine",
      "look.line.widthMm",
      "look.shade.skin",
    ],
    references: ["공개 웹툰 스타일 관찰·계측 기준(표본 N=1~4)"],
    noteKo: "두신 7.8/9.0 · 눈폭 0.22는 관찰값이며 선 굵기·피부 그림자도 관찰 범위 안의 값입니다.",
  },
  "kr-webtoon-action": { measured: [], references: [], noteKo: PROPOSED_ONLY },
  "sd-chibi": {
    measured: [],
    references: ["Studio 마네킹 SD chibi3(headCount 3.2)"],
    noteKo: `${PROPOSED_ONLY} 남성 두신은 Studio 마네킹 SD 3.2 기준과 맞췄습니다.`,
  },
  "ink-wash": { measured: [], references: [], noteKo: PROPOSED_ONLY },
});
