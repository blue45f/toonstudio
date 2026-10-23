/**
 * 웹툰 세계관 3D 셰이퍼(Shaper) 프리셋 & 연속 슬라이더·보간 커스터마이저 (`apps/character-lab/src/presets/webtoon-universe-shaper.ts`).
 *
 * - 8대 웹툰 세계관 캐릭터 아키타입을 캐릭터 랩 v3 레시피(`CharacterRecipe`) 계약 위에 통합한다.
 * - 화풍 팩(`ArtStylePack`) + 코디 세트(`LookSet`) + 15개 슬롯 어휘 프리셋 + 얼굴 15축·체형 9축·파츠 형태 값·헤어 색 흐름·VARCO 3D 소품 바인딩을 하나로 묶는다.
 * - `applyShaperFineSlidersToRecipe`와 `blendWebtoonUniverseRecipes`로 3D 세이퍼 수준의 연속 슬라이더 조작과 실시간 블렌딩을 제공한다.
 */
import {
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  PROPORTION_KEYS,
  characterRecipeSchema,
  clampParam,
  clampProportion,
  cloneLook,
  describeRecipeIssues,
  failVisible,
  mergeLook,
  normalizeParamValues,
} from "../contracts";

import { ART_STYLE_PACK_REVISION, artStylePack } from "./art-style-packs";
import { composeLookSetLook, lookSetById } from "./look-sets";

import type {
  AccessoryAnchor,
  ArtStyleId,
  BodyParamKey,
  ChannelColors,
  CharacterRecipe,
  ExpressionWeights,
  FaceParamKey,
  HairColor,
  LabFailure,
  PartParams,
  PartShapeValues,
  Proportion,
  RecipeSlots,
  StyleFigure,
} from "../contracts";

export const WEBTOON_UNIVERSE_SHAPER_IDS = [
  "school-romance",
  "romance-fantasy-noble",
  "murim-swordsman",
  "modern-noir-specialist",
  "hunter-awakener",
  "cyberpunk-runner",
  "medical-drama-surgeon",
  "sd-daily-mascot",
] as const;

export type WebtoonUniverseShaperId = (typeof WEBTOON_UNIVERSE_SHAPER_IDS)[number];

export interface Varco3dLabAccessoryBinding {
  readonly varcoAssetId: string;
  readonly labelKo: string;
  readonly anchor: AccessoryAnchor;
  readonly glbArtifactName: string;
}

export interface WebtoonUniverseShaperPreset {
  readonly id: WebtoonUniverseShaperId;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly descriptionKo: string;
  readonly artStyleId: ArtStyleId;
  readonly figure: StyleFigure;
  readonly lookSetId: string;
  readonly slots: Partial<RecipeSlots>;
  readonly face: Readonly<Partial<Record<FaceParamKey, number>>>;
  readonly body: Readonly<Partial<Record<BodyParamKey, number>>>;
  readonly partParams: PartParams;
  readonly hairColor: HairColor;
  readonly expression: ExpressionWeights;
  readonly baseColors: Partial<ChannelColors>;
  readonly varcoBinding: Varco3dLabAccessoryBinding;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const WEBTOON_UNIVERSE_SHAPER_PRESETS: readonly WebtoonUniverseShaperPreset[] = deepFreeze<readonly WebtoonUniverseShaperPreset[]>([
  {
    id: "school-romance",
    labelKo: "학원 로맨스 주인공",
    genreKo: "학원·청춘 로맨스",
    descriptionKo: "부드러운 단발과 타탄 블레이저 교복, 따뜻한 아몬드 눈매의 학원 로맨스 주인공",
    artStyleId: "kr-webtoon-romance",
    figure: "feminine",
    lookSetId: "school-blazer-plaid",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/almond", irises: "irises/soft-gradient",
      nose: "nose/button", mouth: "mouth/smile-corner", ears: "ears/standard",
      hair: "hair/soft-bob", body: "body/slim", expression: "expression/smile",
      pose: "pose/hands-on-hips", "hand-pose": "hand-pose/peace",
    },
    face: { faceShape: -0.2, jawWidth: -0.25, cheekVolume: 0.15, eyeSize: 0.35, eyeTilt: 0.12, noseHeight: 0.1, lipFullness: 0.2 },
    body: { height: 0.1, waist: -0.25, legLength: 0.25, neckLength: 0.15 },
    partParams: { hair: { length: -0.2, volume: 0.25, curl: 0.15 }, bottom: { flare: 0.3 } },
    hairColor: { gradient: [0.55, 1], tipMix: 0.2, accent: "none" },
    expression: { mouthSmile: 0.2 },
    baseColors: { skin: "#fbe5d6", iris: "#7b5a44", hair: "#4a3226", brow: "#3b261c", "hair-tip": "#b88f6b" },
    varcoBinding: { varcoAssetId: "classroom-podium-desk", labelKo: "VARCO 학원물 교탁 & 출석부 소품", anchor: "hand-r", glbArtifactName: "classroom-podium-desk.glb" },
  },
  {
    id: "romance-fantasy-noble",
    labelKo: "로판 황실 귀족 영애",
    genreKo: "로맨스 판타지",
    descriptionKo: "반짝이는 별빛 홍채와 로맨스 장발, 황실 실크 로브와 루비 티아라 코디",
    artStyleId: "jp-shoujo-soft",
    figure: "feminine",
    lookSetId: "fantasy-mage-robe",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/wide", irises: "irises/star-highlight",
      nose: "nose/high-bridge", mouth: "mouth/full", ears: "ears/standard",
      hair: "hair/romance-long", body: "body/slim", expression: "expression/smile",
      pose: "pose/idle", "hand-pose": "hand-pose/relaxed",
    },
    face: { jawWidth: -0.35, chinLength: -0.1, eyeSize: 0.65, eyeTilt: 0.18, noseHeight: 0.25, lipFullness: 0.3 },
    body: { height: 0.25, waist: -0.3, legLength: 0.35, neckLength: 0.25 },
    partParams: { hair: { length: 0.85, volume: 0.6, curl: 0.55 } },
    hairColor: { gradient: [0.45, 1], tipMix: 0.55, accent: "inner" },
    expression: { mouthSmile: 0.15 },
    baseColors: { skin: "#fff0e8", iris: "#4a5fa8", hair: "#f2dcb4", brow: "#b98a6a", "hair-tip": "#f2b8c6", "hair-accent": "#c9b8e8" },
    varcoBinding: { varcoAssetId: "shaper-rofan-tiara", labelKo: "VARCO 황녀 루비 티아라", anchor: "head-top", glbArtifactName: "shaper-rofan-tiara.glb" },
  },
  {
    id: "murim-swordsman",
    labelKo: "무협 문파 청옥 검객",
    genreKo: "무협·동양 액션",
    descriptionKo: "수묵풍 날카로운 눈매와 액션 포니테일, 전통풍 의복과 청옥 장검을 패용한 검객",
    artStyleId: "ink-wash",
    figure: "masculine",
    lookSetId: "traditional-jeogori",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small",
      nose: "nose/straight", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/action-pony", body: "body/athletic", expression: "expression/neutral",
      pose: "pose/point", "hand-pose": "hand-pose/fist",
    },
    face: { jawWidth: 0.15, eyeSize: -0.25, eyeTilt: 0.5, noseHeight: 0.4, noseDepth: 0.25, lipFullness: -0.2 },
    body: { height: 0.45, shoulderWidth: 0.4, chestDepth: 0.3, waist: -0.15, legLength: 0.3 },
    partParams: { hair: { length: 0.65, volume: 0.35 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: { browDown: 0.2 },
    baseColors: { skin: "#e6dfd2", iris: "#2b2b33", hair: "#1b1b1d", brow: "#1b1b1d" },
    varcoBinding: { varcoAssetId: "shaper-murim-jade-sword", labelKo: "VARCO 무협 청옥 검패 & 장검", anchor: "waist", glbArtifactName: "shaper-murim-jade-sword.glb" },
  },
  {
    id: "modern-noir-specialist",
    labelKo: "현대 느와르 전문가",
    genreKo: "현대·스릴러·오피스",
    descriptionKo: "9등신 장신 비율과 레이어드 숏컷, 차콜 핀스트라이프 수트를 입은 냉철한 전문가",
    artStyleId: "jp-seinen-real",
    figure: "masculine",
    lookSetId: "work-office-suit",
    slots: {
      "face-shape": "face-shape/square", eyes: "eyes/upturned", irises: "irises/round-small",
      nose: "nose/high-bridge", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/short-layered", body: "body/tall", expression: "expression/neutral",
      pose: "pose/arms-crossed", "hand-pose": "hand-pose/relaxed",
    },
    face: { jawWidth: 0.25, chinLength: 0.15, cheekVolume: -0.2, eyeSize: -0.2, eyeTilt: 0.35, noseHeight: 0.45 },
    body: { height: 0.6, shoulderWidth: 0.35, chestDepth: 0.25, legLength: 0.4, neckLength: 0.15 },
    partParams: { hair: { length: -0.35, volume: 0.15 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: {},
    baseColors: { skin: "#ddb89a", iris: "#3b2e27", hair: "#1b1a1c", brow: "#1b1a1c" },
    varcoBinding: { varcoAssetId: "noir-neon-streetlamp", labelKo: "VARCO 느와르 주철 가로등 프롭", anchor: "hand-l", glbArtifactName: "noir-neon-streetlamp.glb" },
  },
  {
    id: "hunter-awakener",
    labelKo: "헌터 S급 각성자",
    genreKo: "헌터·판타지 액션",
    descriptionKo: "세로 고양이 동공과 울프컷, 강철 기사풍 전투복과 마나 건틀릿을 착용한 각성자",
    artStyleId: "kr-webtoon-action",
    figure: "masculine",
    lookSetId: "fantasy-knight",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat",
      nose: "nose/straight", mouth: "mouth/small", ears: "ears/pointed",
      hair: "hair/wolf-layered", body: "body/athletic", expression: "expression/angry",
      pose: "pose/run", "hand-pose": "hand-pose/fist",
    },
    face: { jawWidth: 0.1, eyeSize: -0.1, eyeTilt: 0.48, noseHeight: 0.35, earAngle: 0.3 },
    body: { height: 0.55, shoulderWidth: 0.5, chestDepth: 0.35, waist: -0.2, legLength: 0.35 },
    partParams: { hair: { length: 0.25, volume: 0.45 } },
    hairColor: { gradient: [0.5, 1], tipMix: 0.45, accent: "streak" },
    expression: { browDown: 0.25 },
    baseColors: { skin: "#e0b896", iris: "#3b82f6", hair: "#121216", brow: "#121216", "hair-tip": "#25406f", "hair-accent": "#60a5fa" },
    varcoBinding: { varcoAssetId: "shaper-hunter-mana-gauntlet", labelKo: "VARCO S급 마나 건틀릿", anchor: "wrist-r", glbArtifactName: "shaper-hunter-mana-gauntlet.glb" },
  },
  {
    id: "cyberpunk-runner",
    labelKo: "사이버펑크 네온 러너",
    genreKo: "SF·사이버펑크",
    descriptionKo: "히메컷 투톤 네온 헤어와 스트리트 레이어드 재킷, AR 홀로그램 바이저 러너",
    artStyleId: "jp-anime-cel",
    figure: "feminine",
    lookSetId: "casual-street-layered",
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/upturned", irises: "irises/star-highlight",
      nose: "nose/small", mouth: "mouth/smile-corner", ears: "ears/standard",
      hair: "hair/hime-cut", body: "body/slim", expression: "expression/wink",
      pose: "pose/peace", "hand-pose": "hand-pose/rock",
    },
    face: { jawWidth: -0.3, eyeSize: 0.45, eyeTilt: 0.35, lipFullness: 0.15 },
    body: { height: 0.15, waist: -0.2, legLength: 0.3 },
    partParams: { hair: { length: 0.4, volume: 0.5 } },
    hairColor: { gradient: [0.4, 1], tipMix: 0.75, accent: "streak" },
    expression: { mouthSmile: 0.25 },
    baseColors: { skin: "#f8d6c2", iris: "#ec4899", hair: "#1e2430", brow: "#1e2430", "hair-tip": "#06b6d4", "hair-accent": "#ec4899" },
    varcoBinding: { varcoAssetId: "shaper-cyber-visor", labelKo: "VARCO 사이버펑크 네온 AR 바이저", anchor: "face", glbArtifactName: "shaper-cyber-visor.glb" },
  },
  {
    id: "medical-drama-surgeon",
    labelKo: "메디컬 드라마 전문의",
    genreKo: "메디컬·전문직 드라마",
    descriptionKo: "지적인 안경과 단정한 장발, 흰 가운과 셔츠 레이어드의 대학병원 전문의",
    artStyleId: "kr-webtoon-romance",
    figure: "feminine",
    lookSetId: "work-lab-coat",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/almond", irises: "irises/soft-gradient",
      nose: "nose/straight", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/romance-long", body: "body/standard", expression: "expression/neutral",
      pose: "pose/idle", "hand-pose": "hand-pose/open",
    },
    face: { jawWidth: -0.15, eyeSize: 0.2, eyeTilt: 0.05, noseHeight: 0.3 },
    body: { height: 0.2, waist: -0.15, legLength: 0.25 },
    partParams: { hair: { length: 0.55, volume: 0.2 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: { mouthSmile: 0.08 },
    baseColors: { skin: "#f3d3bd", iris: "#4a3226", hair: "#2b1d16", brow: "#2b1d16" },
    varcoBinding: { varcoAssetId: "medical-iv-monitor", labelKo: "VARCO 메디컬 바이탈 차트 소품", anchor: "hand-l", glbArtifactName: "medical-iv-monitor.glb" },
  },
  {
    id: "sd-daily-mascot",
    labelKo: "일상 개그 SD 마스코트",
    genreKo: "일상·개그·SD",
    descriptionKo: "3등신 귀여운 비례와 트윈테일, 테라코타 후드티와 반바지 차림의 SD 마스코트",
    artStyleId: "sd-chibi",
    figure: "feminine",
    lookSetId: "casual-hoodie-shorts",
    slots: {
      "face-shape": "face-shape/round", eyes: "eyes/round", irises: "irises/round-large",
      nose: "nose/small", mouth: "mouth/smile-corner", ears: "ears/small",
      hair: "hair/twin-tail", body: "body/petite", expression: "expression/joy",
      pose: "pose/wave", "hand-pose": "hand-pose/peace",
    },
    face: { faceShape: 0.65, jawWidth: 0.4, cheekVolume: 0.8, eyeSize: 0.9, eyeSpacing: 0.25, noseHeight: -0.5, lipFullness: 0.25 },
    body: { height: -0.8, headSize: 0.85, legLength: -0.65, armLength: -0.5, neckLength: -0.7 },
    partParams: { hair: { length: 0.35, volume: 0.75, curl: 0.4 } },
    hairColor: { gradient: [0.5, 1], tipMix: 0.35, accent: "none" },
    expression: { mouthSmile: 0.35 },
    baseColors: { skin: "#ffe8da", iris: "#a0663c", hair: "#ff9fb8", brow: "#a0663c", "hair-tip": "#ffe8da" },
    varcoBinding: { varcoAssetId: "cafe-espresso-bar", labelKo: "VARCO 카페 디저트 트레이 소품", anchor: "hand-r", glbArtifactName: "cafe-espresso-bar.glb" },
  },
]);

const PRESET_MAP: ReadonlyMap<WebtoonUniverseShaperId, WebtoonUniverseShaperPreset> = new Map(
  WEBTOON_UNIVERSE_SHAPER_PRESETS.map((p) => [p.id, p]),
);

export function webtoonUniverseShaperPreset(
  id: WebtoonUniverseShaperId,
): WebtoonUniverseShaperPreset {
  return PRESET_MAP.get(id) ?? WEBTOON_UNIVERSE_SHAPER_PRESETS[0]!;
}

function cleanPartParams(raw: PartParams): PartParams {
  const result: PartParams = {};
  for (const [scopeKey, shapeMap] of Object.entries(raw)) {
    if (!shapeMap) continue;
    const cleanedShapes: Record<string, number> = {};
    for (const [shapeName, weight] of Object.entries(shapeMap)) {
      const clamped = clampParam(weight);
      if (clamped !== 0) cleanedShapes[shapeName] = Number(clamped.toFixed(4));
    }
    if (Object.keys(cleanedShapes).length > 0) {
      result[scopeKey as keyof PartParams] = cleanedShapes as PartShapeValues;
    }
  }
  return result;
}

export type ComposeWebtoonUniverseRecipeResult =
  | { readonly ok: true; readonly recipe: CharacterRecipe; readonly preset: WebtoonUniverseShaperPreset }
  | { readonly ok: false; readonly failure: LabFailure };

export function composeWebtoonUniverseRecipe(
  presetId: WebtoonUniverseShaperId,
  baseRecipe: CharacterRecipe,
  now?: number,
): ComposeWebtoonUniverseRecipeResult {
  const preset = webtoonUniverseShaperPreset(presetId);
  const stylePack = artStylePack(preset.artStyleId);
  const lookSet = lookSetById(preset.lookSetId);
  if (!lookSet) {
    return {
      ok: false,
      failure: failVisible(
        "webtoon-universe-lookset-missing",
        `세계관 프리셋 "${preset.labelKo}"의 코디 세트(${preset.lookSetId})를 찾을 수 없습니다.`,
        undefined,
        now,
      ),
    };
  }

  const composedLook = composeLookSetLook(lookSet, baseRecipe, now);
  if (!composedLook.ok) return composedLook;

  const lookPayload = composedLook.look.payload;
  const mergedColors: ChannelColors = {
    ...baseRecipe.colors,
    ...(lookPayload.colors ?? {}),
    ...preset.baseColors,
  };

  const candidate: CharacterRecipe = {
    ...baseRecipe,
    slots: { ...baseRecipe.slots, ...preset.slots, ...(lookPayload.slots ?? {}) },
    face: normalizeParamValues(preset.face),
    body: normalizeParamValues(preset.body),
    colors: mergedColors,
    expression: { ...preset.expression },
    wardrobe: lookPayload.wardrobe ? structuredClone(lookPayload.wardrobe) : structuredClone(baseRecipe.wardrobe),
    partParams: cleanPartParams(preset.partParams),
    surfaces: lookPayload.surfaces ? structuredClone(lookPayload.surfaces) : structuredClone(baseRecipe.surfaces),
    hairColor: structuredClone(preset.hairColor),
    style: {
      packId: stylePack.id,
      packRevision: ART_STYLE_PACK_REVISION,
      proportion: structuredClone(stylePack.proportion[preset.figure]),
      neutralFacs: { ...preset.expression },
    },
    shading: {
      ...baseRecipe.shading,
      mode: "toon",
      toon: {
        ...baseRecipe.shading.toon,
        rampSteps: stylePack.toon.rampSteps,
        rim: stylePack.toon.rim,
        outline: stylePack.toon.outline,
      },
      look: cloneLook(stylePack.look),
    },
  };

  const checked = characterRecipeSchema.safeParse(candidate);
  if (!checked.success) {
    return {
      ok: false,
      failure: failVisible(
        "webtoon-universe-recipe-invalid",
        `세계관 프리셋 "${preset.labelKo}" 레시피 생성에 실패했습니다: ${describeRecipeIssues(checked.error.issues)}`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, recipe: checked.data, preset };
}

export interface ShaperFineSliderPatch {
  readonly face?: Readonly<Partial<Record<FaceParamKey, number>>>;
  readonly body?: Readonly<Partial<Record<BodyParamKey, number>>>;
  readonly proportion?: Readonly<Partial<Proportion>>;
  readonly partParams?: PartParams;
  readonly hairColor?: Readonly<Partial<HairColor>>;
  readonly outlineWidthMm?: number;
  readonly rampSoftness?: number;
  readonly rimStrength?: number;
}

export function applyShaperFineSlidersToRecipe(
  recipe: CharacterRecipe,
  patch: ShaperFineSliderPatch,
  now?: number,
): ComposeWebtoonUniverseRecipeResult {
  const nextFace = patch.face ? normalizeParamValues({ ...recipe.face, ...patch.face }) : recipe.face;
  const nextBody = patch.body ? normalizeParamValues({ ...recipe.body, ...patch.body }) : recipe.body;

  let nextProportion = recipe.style.proportion;
  if (patch.proportion) {
    const baseProp: Proportion = nextProportion ?? {
      headsTall: 7.5, legRatio: 0.48, armRatio: 0.44, shoulderHeads: 1.8, headWidthRatio: 0.78, handScale: 1,
    };
    const updated = { ...baseProp };
    for (const key of PROPORTION_KEYS) {
      const val = patch.proportion[key];
      if (val !== undefined) updated[key] = clampProportion(key, val);
    }
    nextProportion = updated;
  }

  const nextPartParams = patch.partParams ? cleanPartParams({ ...recipe.partParams, ...patch.partParams }) : recipe.partParams;
  const gStart = patch.hairColor?.gradient
    ? Math.max(0, Math.min(1, patch.hairColor.gradient[0]))
    : recipe.hairColor.gradient[0];
  const gEnd = patch.hairColor?.gradient
    ? Math.max(gStart, Math.min(1, patch.hairColor.gradient[1]))
    : recipe.hairColor.gradient[1];

  const nextHairColor: HairColor = patch.hairColor
    ? {
        gradient: [gStart, gEnd],
        tipMix: patch.hairColor.tipMix !== undefined ? Math.max(0, Math.min(1, patch.hairColor.tipMix)) : recipe.hairColor.tipMix,
        accent: patch.hairColor.accent ?? recipe.hairColor.accent,
      }
    : recipe.hairColor;

  const nextLook = mergeLook(recipe.shading.look, {
    ...(patch.outlineWidthMm !== undefined ? { line: { widthMm: Math.max(0, Math.min(20, patch.outlineWidthMm)) } } : {}),
    ...(patch.rampSoftness !== undefined ? { ramp: { softness: Math.max(0, Math.min(1, patch.rampSoftness)) } } : {}),
    ...(patch.rimStrength !== undefined ? { rim: { strength: Math.max(0, Math.min(2, patch.rimStrength)) } } : {}),
  });

  const candidate: CharacterRecipe = {
    ...recipe,
    face: nextFace,
    body: nextBody,
    partParams: nextPartParams,
    hairColor: nextHairColor,
    style: { ...recipe.style, proportion: nextProportion },
    shading: { ...recipe.shading, look: nextLook },
  };

  const checked = characterRecipeSchema.safeParse(candidate);
  if (!checked.success) {
    return {
      ok: false,
      failure: failVisible(
        "shaper-fine-slider-invalid",
        `3D 셰이퍼 슬라이더 적용 결과가 유효하지 않습니다: ${describeRecipeIssues(checked.error.issues)}`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, recipe: checked.data, preset: webtoonUniverseShaperPreset("school-romance") };
}

export function blendWebtoonUniverseRecipes(
  fromId: WebtoonUniverseShaperId,
  toId: WebtoonUniverseShaperId,
  t: number,
  baseRecipe: CharacterRecipe,
  now?: number,
): ComposeWebtoonUniverseRecipeResult {
  const alpha = Number.isNaN(t) ? 0.5 : Math.max(0, Math.min(1, t));
  const fromRes = composeWebtoonUniverseRecipe(fromId, baseRecipe, now);
  if (!fromRes.ok) return fromRes;
  const toRes = composeWebtoonUniverseRecipe(toId, baseRecipe, now);
  if (!toRes.ok) return toRes;

  const a = fromRes.recipe;
  const b = toRes.recipe;
  const dominant = alpha < 0.5 ? a : b;
  const dominantPreset = alpha < 0.5 ? fromRes.preset : toRes.preset;
  const lerp = (x: number, y: number) => Number((x + (y - x) * alpha).toFixed(4));

  const blendedFace: Partial<Record<FaceParamKey, number>> = {};
  for (const key of FACE_PARAM_KEYS) {
    const v = lerp(a.face[key] ?? 0, b.face[key] ?? 0);
    if (v !== 0) blendedFace[key] = v;
  }

  const blendedBody: Partial<Record<BodyParamKey, number>> = {};
  for (const key of BODY_PARAM_KEYS) {
    const v = lerp(a.body[key] ?? 0, b.body[key] ?? 0);
    if (v !== 0) blendedBody[key] = v;
  }

  let blendedProportion: Proportion | null = null;
  if (a.style.proportion && b.style.proportion) {
    blendedProportion = {
      headsTall: clampProportion("headsTall", lerp(a.style.proportion.headsTall, b.style.proportion.headsTall)),
      legRatio: clampProportion("legRatio", lerp(a.style.proportion.legRatio, b.style.proportion.legRatio)),
      armRatio: clampProportion("armRatio", lerp(a.style.proportion.armRatio, b.style.proportion.armRatio)),
      shoulderHeads: clampProportion("shoulderHeads", lerp(a.style.proportion.shoulderHeads, b.style.proportion.shoulderHeads)),
      headWidthRatio: clampProportion("headWidthRatio", lerp(a.style.proportion.headWidthRatio, b.style.proportion.headWidthRatio)),
      handScale: clampProportion("handScale", lerp(a.style.proportion.handScale, b.style.proportion.handScale)),
    };
  }

  const hairShapesA = a.partParams.hair ?? {};
  const hairShapesB = b.partParams.hair ?? {};
  const blendedHairShapes: Record<string, number> = {};
  for (const k of new Set([...Object.keys(hairShapesA), ...Object.keys(hairShapesB)])) {
    blendedHairShapes[k] = lerp(hairShapesA[k] ?? 0, hairShapesB[k] ?? 0);
  }

  const g0 = lerp(a.hairColor.gradient[0], b.hairColor.gradient[0]);
  const g1 = Math.max(g0, lerp(a.hairColor.gradient[1], b.hairColor.gradient[1]));

  const fineResult = applyShaperFineSlidersToRecipe(
    dominant,
    {
      face: blendedFace,
      body: blendedBody,
      ...(blendedProportion ? { proportion: blendedProportion } : {}),
      partParams: { ...dominant.partParams, hair: blendedHairShapes },
      hairColor: { gradient: [g0, g1], tipMix: lerp(a.hairColor.tipMix, b.hairColor.tipMix), accent: dominant.hairColor.accent },
      outlineWidthMm: lerp(a.shading.look.line.widthMm, b.shading.look.line.widthMm),
      rampSoftness: lerp(a.shading.look.ramp.softness, b.shading.look.ramp.softness),
      rimStrength: lerp(a.shading.look.rim.strength, b.shading.look.rim.strength),
    },
    now,
  );
  if (!fineResult.ok) return fineResult;
  return { ok: true, recipe: fineResult.recipe, preset: dominantPreset };
}

/** 캐릭터 랩용 VARCO 3D 4종 HDRI 환경 프리셋 ID. */
export type CharacterLabVarco3dEnvironmentId =
  | "lebombo"
  | "venice_sunset"
  | "studio_small"
  | "daylight";

/** 캐릭터 랩용 VARCO 3D PBR 맵 채널 인스펙터 모드. */
export type CharacterLabVarco3dMapChannel =
  | "baseColor"
  | "normal"
  | "roughness"
  | "metallic"
  | "occlusion";

export interface CharacterLabVarco3dPreviewSettings {
  readonly presetId: WebtoonUniverseShaperId;
  readonly environmentId: CharacterLabVarco3dEnvironmentId;
  readonly lightingRotationDeg: number;
  readonly isTextureOn: boolean;
  readonly isNormalMapOn: boolean;
  readonly isPbrOn: boolean;
  readonly isWireframeOn: boolean;
  readonly isUvSeamOn: boolean;
  readonly isBoneOn: boolean;
  readonly mapPreviewMode: CharacterLabVarco3dMapChannel | null;
  readonly pivotToBottom: boolean;
}

const UNIVERSE_DEFAULT_ENVIRONMENT: Readonly<
  Record<WebtoonUniverseShaperId, { readonly environmentId: CharacterLabVarco3dEnvironmentId; readonly lightingRotationDeg: number }>
> = Object.freeze({
  "school-romance": Object.freeze({ environmentId: "daylight", lightingRotationDeg: 35 }),
  "romance-fantasy-noble": Object.freeze({ environmentId: "lebombo", lightingRotationDeg: 45 }),
  "murim-swordsman": Object.freeze({ environmentId: "venice_sunset", lightingRotationDeg: 60 }),
  "modern-noir-specialist": Object.freeze({ environmentId: "studio_small", lightingRotationDeg: 300 }),
  "hunter-awakener": Object.freeze({ environmentId: "studio_small", lightingRotationDeg: 315 }),
  "cyberpunk-runner": Object.freeze({ environmentId: "studio_small", lightingRotationDeg: 285 }),
  "medical-drama-surgeon": Object.freeze({ environmentId: "lebombo", lightingRotationDeg: 25 }),
  "sd-daily-mascot": Object.freeze({ environmentId: "daylight", lightingRotationDeg: 15 }),
});


/**
 * 세계관 셰이퍼 프리셋에 최적화된 VARCO 3D 프리뷰·인스펙터 초기 설정을 반환합니다.
 */
export function resolveCharacterLabVarco3dPreviewSettings(
  id: WebtoonUniverseShaperId,
  overrides?: Partial<Omit<CharacterLabVarco3dPreviewSettings, "presetId">>,
): CharacterLabVarco3dPreviewSettings {
  const defaults = UNIVERSE_DEFAULT_ENVIRONMENT[id];
  const rawDeg = overrides?.lightingRotationDeg ?? defaults.lightingRotationDeg;
  const normalizedDeg = ((Math.round(rawDeg) % 360) + 360) % 360;
  return Object.freeze({
    presetId: id,
    environmentId: overrides?.environmentId ?? defaults.environmentId,
    lightingRotationDeg: normalizedDeg,
    isTextureOn: overrides?.isTextureOn ?? true,
    isNormalMapOn: overrides?.isNormalMapOn ?? true,
    isPbrOn: overrides?.isPbrOn ?? true,
    isWireframeOn: overrides?.isWireframeOn ?? false,
    isUvSeamOn: overrides?.isUvSeamOn ?? false,
    isBoneOn: overrides?.isBoneOn ?? false,
    mapPreviewMode: overrides?.mapPreviewMode ?? null,
    pivotToBottom: overrides?.pivotToBottom ?? true,
  });
}

