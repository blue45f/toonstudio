/**
 * studio-shaper-webtoon-customizer.ts
 *
 * 3D 캐릭터 셰이퍼(3D Shaper)의 웹툰 세계관 프리셋 & 25축 연속 커스터마이징 엔진.
 * - 8대 웹툰 세계관 캐릭터 아키타입(학원 로맨스, 로판 귀족, 무협 검객, 현대 느와르, 헌터 각성자, 사이버펑크 러너, 메디컬 외과의, SD 일상)
 * - 안면 성형(Face Morph) 8축 · 체형 비례(Body Proportion) 8축 · 헤어 흐름(Hair Flow) 5축 · 웹툰 셀 셰이더(Cel Shader) 4축 = 총 25축 연속 슬라이더
 * - 두 세계관 프로필 사이의 연속 보간(blendShaperWebtoonUniverseProfiles) 및 Studio 마네킹 슬라이더(ShaperBodySliderValues) 즉시 변환
 * - VARCO 3D 생성 파츠(.glb) 슬롯 바인딩 계약(bindVarco3dPartToShaperProfile)
 */

import {
  type ShaperAppearanceCategory,
  type ShaperAppearanceState,
  type ShaperBodySliderValues,
  type ShaperPresetSelection,
} from "./studio-shaper-model";
import {
  CHARACTER_STYLE_PACK_VERSION,
  parseCharacterStylePack,
  type CharacterStylePack,
} from "./studio-shaper-style-pack";

export const SHAPER_WEBTOON_UNIVERSE_IDS = [
  "school-romance",
  "romance-fantasy-noble",
  "murim-swordsman",
  "modern-noir-detective",
  "hunter-awakener",
  "cyberpunk-runner",
  "medical-surgeon",
  "chibi-daily-mascot",
] as const;

export type ShaperWebtoonUniverseId = (typeof SHAPER_WEBTOON_UNIVERSE_IDS)[number];

export interface ShaperFaceMorphSliders {
  readonly jawSharpness: number;
  readonly cheekFullness: number;
  readonly eyeScale: number;
  readonly eyeTilt: number;
  readonly eyeSpacing: number;
  readonly irisScale: number;
  readonly noseBridge: number;
  readonly lipFullness: number;
}

export interface ShaperExtendedBodySliders extends ShaperBodySliderValues {
  readonly legRatio: number;
  readonly armRatio: number;
  readonly neckLength: number;
}

export interface ShaperHairFlowSliders {
  readonly length: number;
  readonly volume: number;
  readonly curl: number;
  readonly bangDensity: number;
  readonly tipGradientMix: number;
}

export interface ShaperCelShaderSliders {
  readonly rampSteps: 2 | 3 | 4;
  readonly shadowSoftness: number;
  readonly outlineWidthMm: number;
  readonly rimIntensity: number;
}

export interface ShaperWebtoonCustomizerSliders {
  readonly faceMorph: ShaperFaceMorphSliders;
  readonly bodyProportion: ShaperExtendedBodySliders;
  readonly hairFlow: ShaperHairFlowSliders;
  readonly celShader: ShaperCelShaderSliders;
}

export interface ShaperVarco3dPartBinding {
  readonly slot: ShaperAppearanceCategory;
  readonly varcoAssetId: string;
  readonly labelKo: string;
  readonly glbUri: string;
  readonly anchorBone: "head" | "neck" | "chest" | "hips" | "rightHand" | "leftHand" | "feet";
  readonly scaleMultiplier: number;
  readonly tintColorHex: string;
}

export interface ShaperWebtoonUniverseProfile {
  readonly id: ShaperWebtoonUniverseId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly genreTagKo: string;
  readonly descriptionKo: string;
  readonly selection: ShaperPresetSelection;
  readonly stylePack: CharacterStylePack;
  readonly sliders: ShaperWebtoonCustomizerSliders;
  readonly varcoPartBindings: Readonly<Partial<Record<ShaperAppearanceCategory, ShaperVarco3dPartBinding>>>;
}

export const DEFAULT_SHAPER_WEBTOON_SLIDERS: Readonly<ShaperWebtoonCustomizerSliders> =
  Object.freeze({
    faceMorph: Object.freeze({
      jawSharpness: 0.15,
      cheekFullness: 0,
      eyeScale: 0.25,
      eyeTilt: 0.05,
      eyeSpacing: 0,
      irisScale: 0.2,
      noseBridge: 0.1,
      lipFullness: 0.1,
    }),
    bodyProportion: Object.freeze({
      heightCm: 170,
      headCount: 7.5,
      build: 1.0,
      shoulderWidth: 1.0,
      hipWidth: 1.0,
      legRatio: 0.5,
      armRatio: 0.44,
      neckLength: 1.0,
    }),
    hairFlow: Object.freeze({
      length: 0.5,
      volume: 0.5,
      curl: 0.2,
      bangDensity: 0.65,
      tipGradientMix: 0,
    }),
    celShader: Object.freeze({
      rampSteps: 2,
      shadowSoftness: 0.2,
      outlineWidthMm: 3.5,
      rimIntensity: 0.35,
    }),
  });

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Number(value.toFixed(4))))
    : fallback;
}

function clampRampSteps(value: unknown, fallback: 2 | 3 | 4): 2 | 3 | 4 {
  if (value === 2 || value === 3 || value === 4) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded <= 2) return 2;
    if (rounded >= 4) return 4;
    return 3;
  }
  return fallback;
}

export function clampShaperWebtoonCustomizerSliders(
  raw:
    | {
        readonly faceMorph?: Partial<ShaperFaceMorphSliders>;
        readonly bodyProportion?: Partial<ShaperExtendedBodySliders>;
        readonly hairFlow?: Partial<ShaperHairFlowSliders>;
        readonly celShader?: Partial<ShaperCelShaderSliders>;
      }
    | null
    | undefined,
): ShaperWebtoonCustomizerSliders {
  const def = DEFAULT_SHAPER_WEBTOON_SLIDERS;
  const f = raw?.faceMorph ?? {};
  const b = raw?.bodyProportion ?? {};
  const h = raw?.hairFlow ?? {};
  const c = raw?.celShader ?? {};

  return {
    faceMorph: {
      jawSharpness: clampNum(f.jawSharpness, def.faceMorph.jawSharpness, -1, 1),
      cheekFullness: clampNum(f.cheekFullness, def.faceMorph.cheekFullness, -1, 1),
      eyeScale: clampNum(f.eyeScale, def.faceMorph.eyeScale, -1, 1),
      eyeTilt: clampNum(f.eyeTilt, def.faceMorph.eyeTilt, -1, 1),
      eyeSpacing: clampNum(f.eyeSpacing, def.faceMorph.eyeSpacing, -1, 1),
      irisScale: clampNum(f.irisScale, def.faceMorph.irisScale, -1, 1),
      noseBridge: clampNum(f.noseBridge, def.faceMorph.noseBridge, -1, 1),
      lipFullness: clampNum(f.lipFullness, def.faceMorph.lipFullness, -1, 1),
    },
    bodyProportion: {
      heightCm: clampNum(b.heightCm, def.bodyProportion.heightCm, 110, 205),
      headCount: clampNum(b.headCount, def.bodyProportion.headCount, 2.8, 9.2),
      build: clampNum(b.build, def.bodyProportion.build, 0.4, 2.5),
      shoulderWidth: clampNum(b.shoulderWidth, def.bodyProportion.shoulderWidth, 0.7, 1.45),
      hipWidth: clampNum(b.hipWidth, def.bodyProportion.hipWidth, 0.7, 1.35),
      legRatio: clampNum(b.legRatio, def.bodyProportion.legRatio, 0.3, 0.58),
      armRatio: clampNum(b.armRatio, def.bodyProportion.armRatio, 0.32, 0.48),
      neckLength: clampNum(b.neckLength, def.bodyProportion.neckLength, 0.6, 1.35),
    },
    hairFlow: {
      length: clampNum(h.length, def.hairFlow.length, 0, 1),
      volume: clampNum(h.volume, def.hairFlow.volume, 0, 1),
      curl: clampNum(h.curl, def.hairFlow.curl, 0, 1),
      bangDensity: clampNum(h.bangDensity, def.hairFlow.bangDensity, 0, 1),
      tipGradientMix: clampNum(h.tipGradientMix, def.hairFlow.tipGradientMix, 0, 1),
    },
    celShader: {
      rampSteps: clampRampSteps(c.rampSteps, def.celShader.rampSteps),
      shadowSoftness: clampNum(c.shadowSoftness, def.celShader.shadowSoftness, 0, 1),
      outlineWidthMm: clampNum(c.outlineWidthMm, def.celShader.outlineWidthMm, 0.5, 8.0),
      rimIntensity: clampNum(c.rimIntensity, def.celShader.rimIntensity, 0, 1.5),
    },
  };
}

export function toMannequinBodySliderValues(
  sliders: ShaperWebtoonCustomizerSliders,
): ShaperBodySliderValues {
  const { heightCm, headCount, build, shoulderWidth, hipWidth } = sliders.bodyProportion;
  return { heightCm, headCount, build, shoulderWidth, hipWidth };
}

const PACK_EPOCH = "2026-10-24T00:00:00.000Z";

function createUniverseStylePack(
  id: string,
  name: string,
  description: string,
  tags: readonly string[],
  selection: Record<ShaperAppearanceCategory, string>,
  colors: Record<string, string>,
): CharacterStylePack {
  const parsed = parseCharacterStylePack({
    version: CHARACTER_STYLE_PACK_VERSION,
    id,
    name,
    description,
    tags,
    source: "builtin",
    appearance: { selection, colors },
    createdAt: PACK_EPOCH,
    updatedAt: PACK_EPOCH,
  });
  if (!parsed.ok) throw new Error(`Invalid webtoon universe style pack (${id}): ${parsed.code}`);
  return parsed.value;
}

export const SHAPER_WEBTOON_UNIVERSE_PROFILES: readonly ShaperWebtoonUniverseProfile[] =
  Object.freeze([
    {
      id: "school-romance",
      labelKo: "학원 로맨스 주인공",
      labelEn: "School Romance Lead",
      genreTagKo: "학원·로맨스",
      descriptionKo: "맑은 눈망울과 시스루 뱅, 7.8등신 슬림 교복 핏의 학원물 주인공",
      selection: {
        face: "face-oval", eye: "eye-romance", pupil: "pupil-star", nose: "nose-dot",
        lip: "lip-smile", ear: "ear-human", hair: "hair-bob", body: "body-slim-female",
        top: "top-school", bottom: "bottom-skirt", shoes: "shoes-sneakers",
        accessories: "acc-none", bodypose: "pose-hip", handpose: "hand-peace",
      },
      stylePack: createUniverseStylePack(
        "universe-school-romance",
        "학원 로맨스 코디",
        "시스루 단발과 네이비 교복, 포인트 스니커즈",
        ["학원", "로맨스", "웹툰"],
        { hair: "hair-bob", accessories: "acc-none", top: "top-school", bottom: "bottom-skirt", shoes: "shoes-sneakers" },
        { "hair-bob": "#5b4636", "top-school": "#4f6fb3", "bottom-skirt": "#374151", "shoes-sneakers": "#ef4444" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.25, cheekFullness: 0.1, eyeScale: 0.45, eyeTilt: 0.1, eyeSpacing: 0, irisScale: 0.35, noseBridge: 0.05, lipFullness: 0.2 },
        bodyProportion: { heightCm: 166, headCount: 7.8, build: 0.65, shoulderWidth: 0.88, hipWidth: 1.04, legRatio: 0.52, armRatio: 0.44, neckLength: 1.08 },
        hairFlow: { length: 0.42, volume: 0.55, curl: 0.25, bangDensity: 0.6, tipGradientMix: 0.15 },
        celShader: { rampSteps: 2, shadowSoftness: 0.28, outlineWidthMm: 3.2, rimIntensity: 0.45 },
      }),
      varcoPartBindings: {},
    },
    {
      id: "romance-fantasy-noble",
      labelKo: "로판 황실 귀족",
      labelEn: "Romance Fantasy Noble",
      genreTagKo: "로맨스 판타지",
      descriptionKo: "우아한 웨이브 장발과 보석 눈동자, 황실 루비 티아라가 결합된 로판 여주인공",
      selection: {
        face: "face-oval", eye: "eye-romance", pupil: "pupil-star", nose: "nose-straight",
        lip: "lip-smile", ear: "ear-human", hair: "hair-wavy", body: "body-slim-female",
        top: "top-suit", bottom: "bottom-skirt", shoes: "shoes-loafer",
        accessories: "acc-earring", bodypose: "pose-stand", handpose: "hand-open",
      },
      stylePack: createUniverseStylePack(
        "universe-rofan-noble",
        "로판 황실 드레스업",
        "금빛 웨이브 장발과 로얄 퍼플 정장 자켓, 루비 귀걸이",
        ["로판", "황실", "판타지"],
        { hair: "hair-wavy", accessories: "acc-earring", top: "top-suit", bottom: "bottom-skirt", shoes: "shoes-loafer" },
        { "hair-wavy": "#eab308", "acc-earring": "#ef4444", "top-suit": "#8b5cf6", "bottom-skirt": "#f3f4f6", "shoes-loafer": "#eab308" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.45, cheekFullness: -0.05, eyeScale: 0.55, eyeTilt: 0.18, eyeSpacing: 0.04, irisScale: 0.48, noseBridge: 0.3, lipFullness: 0.28 },
        bodyProportion: { heightCm: 171, headCount: 8.2, build: 0.62, shoulderWidth: 0.86, hipWidth: 1.06, legRatio: 0.54, armRatio: 0.45, neckLength: 1.15 },
        hairFlow: { length: 0.92, volume: 0.85, curl: 0.72, bangDensity: 0.45, tipGradientMix: 0.4 },
        celShader: { rampSteps: 3, shadowSoftness: 0.42, outlineWidthMm: 2.4, rimIntensity: 0.85 },
      }),
      varcoPartBindings: {
        accessories: {
          slot: "accessories",
          varcoAssetId: "shaper-rofan-tiara",
          labelKo: "VARCO 로판 황녀 루비 티아라",
          glbUri: ".cache/varco3d-worldbuild/shaper-rofan-tiara.glb",
          anchorBone: "head",
          scaleMultiplier: 1.0,
          tintColorHex: "#eab308",
        },
      },
    },
    {
      id: "murim-swordsman",
      labelKo: "무협 문파 소협·검객",
      labelEn: "Murim Martial Swordsman",
      genreTagKo: "무협·액션",
      descriptionKo: "날카로운 검미(劍眉)와 하이 포니테일, 수련 도복과 청옥 장검을 패용한 검객",
      selection: {
        face: "face-sharp", eye: "eye-action", pupil: "pupil-basic", nose: "nose-bridge",
        lip: "lip-closed", ear: "ear-human", hair: "hair-ponytail", body: "body-muscular",
        top: "top-martial", bottom: "bottom-martial", shoes: "shoes-boots",
        accessories: "acc-earring", bodypose: "pose-sword", handpose: "hand-fist",
      },
      stylePack: createUniverseStylePack(
        "universe-murim-swordsman",
        "무협 청옥 검객",
        "흑발 포니테일과 청록 수련 도복, 워커 부츠",
        ["무협", "검객", "액션"],
        { hair: "hair-ponytail", accessories: "acc-earring", top: "top-martial", bottom: "bottom-martial", shoes: "shoes-boots" },
        { "hair-ponytail": "#1f2937", "acc-earring": "#14b8a6", "top-martial": "#14b8a6", "bottom-martial": "#1f2937", "shoes-boots": "#1f2937" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.65, cheekFullness: -0.2, eyeScale: -0.1, eyeTilt: 0.55, eyeSpacing: -0.05, irisScale: -0.1, noseBridge: 0.55, lipFullness: -0.15 },
        bodyProportion: { heightCm: 185, headCount: 8.5, build: 1.85, shoulderWidth: 1.24, hipWidth: 0.96, legRatio: 0.51, armRatio: 0.45, neckLength: 1.05 },
        hairFlow: { length: 0.78, volume: 0.65, curl: 0.15, bangDensity: 0.35, tipGradientMix: 0.1 },
        celShader: { rampSteps: 2, shadowSoftness: 0.12, outlineWidthMm: 5.2, rimIntensity: 0.6 },
      }),
      varcoPartBindings: {
        accessories: {
          slot: "accessories",
          varcoAssetId: "shaper-murim-jade-sword",
          labelKo: "VARCO 무협 청옥 검패 & 장검",
          glbUri: ".cache/varco3d-worldbuild/shaper-murim-jade-sword.glb",
          anchorBone: "rightHand",
          scaleMultiplier: 1.05,
          tintColorHex: "#10b981",
        },
      },
    },
    {
      id: "modern-noir-detective",
      labelKo: "현대 느와르 전문가",
      labelEn: "Modern Noir Specialist",
      genreTagKo: "현대·느와르",
      descriptionKo: "투블럭 댄디컷과 차콜 정장 수트, 8.6등신 장신 비율의 냉철한 전문가",
      selection: {
        face: "face-square", eye: "eye-cat", pupil: "pupil-basic", nose: "nose-bridge",
        lip: "lip-closed", ear: "ear-human", hair: "hair-dandy", body: "body-tall",
        top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-loafer",
        accessories: "acc-glasses", bodypose: "pose-stand", handpose: "hand-chin",
      },
      stylePack: createUniverseStylePack(
        "universe-modern-noir",
        "현대 느와르 수트",
        "투블럭 댄디컷과 차콜 수트, 블랙 뿔테 안경",
        ["현대", "느와르", "오피스"],
        { hair: "hair-dandy", accessories: "acc-glasses", top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-loafer" },
        { "hair-dandy": "#1f2937", "acc-glasses": "#1f2937", "top-suit": "#1f2937", "bottom-slacks": "#374151", "shoes-loafer": "#7c2d12" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.55, cheekFullness: -0.25, eyeScale: -0.15, eyeTilt: 0.38, eyeSpacing: -0.04, irisScale: -0.05, noseBridge: 0.6, lipFullness: -0.1 },
        bodyProportion: { heightCm: 187, headCount: 8.6, build: 1.25, shoulderWidth: 1.18, hipWidth: 0.94, legRatio: 0.53, armRatio: 0.45, neckLength: 1.06 },
        hairFlow: { length: 0.25, volume: 0.45, curl: 0.1, bangDensity: 0.5, tipGradientMix: 0 },
        celShader: { rampSteps: 3, shadowSoftness: 0.15, outlineWidthMm: 4.0, rimIntensity: 0.55 },
      }),
      varcoPartBindings: {},
    },
    {
      id: "hunter-awakener",
      labelKo: "헌터 S급 각성자",
      labelEn: "S-Rank Hunter Awakener",
      genreTagKo: "헌터·판타지",
      descriptionKo: "세로 마력 동공과 역동적인 전투 체형, VARCO 마나 건틀릿을 장착한 레이드 헌터",
      selection: {
        face: "face-sharp", eye: "eye-action", pupil: "pupil-vertical", nose: "nose-straight",
        lip: "lip-open", ear: "ear-elf", hair: "hair-short", body: "body-muscular",
        top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-boots",
        accessories: "acc-earring", bodypose: "pose-run", handpose: "hand-fist",
      },
      stylePack: createUniverseStylePack(
        "universe-hunter-awakener",
        "헌터 S급 레이드 기어",
        "블루 마력 하이라이트 숏컷과 다크 택티컬 수트, 워커 부츠",
        ["헌터", "레이드", "각성자"],
        { hair: "hair-short", accessories: "acc-earring", top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-boots" },
        { "hair-short": "#1f2937", "acc-earring": "#3b82f6", "top-suit": "#1f2937", "bottom-slacks": "#1f2937", "shoes-boots": "#3b82f6" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.7, cheekFullness: -0.2, eyeScale: 0.05, eyeTilt: 0.48, eyeSpacing: 0, irisScale: 0.15, noseBridge: 0.45, lipFullness: 0 },
        bodyProportion: { heightCm: 188, headCount: 8.6, build: 2.0, shoulderWidth: 1.28, hipWidth: 0.96, legRatio: 0.52, armRatio: 0.45, neckLength: 1.04 },
        hairFlow: { length: 0.32, volume: 0.6, curl: 0.2, bangDensity: 0.55, tipGradientMix: 0.5 },
        celShader: { rampSteps: 3, shadowSoftness: 0.48, outlineWidthMm: 3.8, rimIntensity: 1.15 },
      }),
      varcoPartBindings: {
        accessories: {
          slot: "accessories",
          varcoAssetId: "shaper-hunter-mana-gauntlet",
          labelKo: "VARCO S급 마나 건틀릿",
          glbUri: ".cache/varco3d-worldbuild/shaper-hunter-mana-gauntlet.glb",
          anchorBone: "rightHand",
          scaleMultiplier: 1.0,
          tintColorHex: "#3b82f6",
        },
      },
    },
    {
      id: "cyberpunk-runner",
      labelKo: "사이버펑크 네온 러너",
      labelEn: "Cyberpunk Neon Runner",
      genreTagKo: "SF·사이버펑크",
      descriptionKo: "투톤 네온 그라데이션 헤어와 오버핏 스트리트 후드, AR 홀로 바이저 러너",
      selection: {
        face: "face-sharp", eye: "eye-cat", pupil: "pupil-star", nose: "nose-straight",
        lip: "lip-smile", ear: "ear-human", hair: "hair-bob", body: "body-slim-female",
        top: "top-hoodie", bottom: "bottom-jeans", shoes: "shoes-boots",
        accessories: "acc-headphones", bodypose: "pose-hip", handpose: "hand-point",
      },
      stylePack: createUniverseStylePack(
        "universe-cyberpunk-runner",
        "사이버펑크 네온 스트리트",
        "핑크·시안 네온 헤어와 테크웨어 후드, 부츠",
        ["사이버펑크", "SF", "스트리트"],
        { hair: "hair-bob", accessories: "acc-headphones", top: "top-hoodie", bottom: "bottom-jeans", shoes: "shoes-boots" },
        { "hair-bob": "#ec4899", "acc-headphones": "#14b8a6", "top-hoodie": "#1f2937", "bottom-jeans": "#374151", "shoes-boots": "#ec4899" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.4, cheekFullness: -0.1, eyeScale: 0.3, eyeTilt: 0.42, eyeSpacing: 0.02, irisScale: 0.25, noseBridge: 0.25, lipFullness: 0.15 },
        bodyProportion: { heightCm: 169, headCount: 7.9, build: 0.72, shoulderWidth: 0.94, hipWidth: 1.02, legRatio: 0.53, armRatio: 0.44, neckLength: 1.06 },
        hairFlow: { length: 0.45, volume: 0.7, curl: 0.1, bangDensity: 0.75, tipGradientMix: 0.85 },
        celShader: { rampSteps: 3, shadowSoftness: 0.25, outlineWidthMm: 3.4, rimIntensity: 1.25 },
      }),
      varcoPartBindings: {
        accessories: {
          slot: "accessories",
          varcoAssetId: "shaper-cyber-visor",
          labelKo: "VARCO 네온 AR 바이저",
          glbUri: ".cache/varco3d-worldbuild/shaper-cyber-visor.glb",
          anchorBone: "head",
          scaleMultiplier: 1.0,
          tintColorHex: "#06b6d4",
        },
      },
    },
    {
      id: "medical-surgeon",
      labelKo: "메디컬 드라마 외과의",
      labelEn: "Medical Drama Surgeon",
      genreTagKo: "메디컬·오피스",
      descriptionKo: "단정한 긴 생머리와 안경, 화이트 가운 톤의 대학병원 흉부외과 전문의",
      selection: {
        face: "face-oval", eye: "eye-gentle", pupil: "pupil-basic", nose: "nose-straight",
        lip: "lip-closed", ear: "ear-human", hair: "hair-long-straight", body: "body-standard",
        top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-sneakers",
        accessories: "acc-glasses", bodypose: "pose-stand", handpose: "hand-open",
      },
      stylePack: createUniverseStylePack(
        "universe-medical-surgeon",
        "대학병원 전문의 가운",
        "단정한 생머리와 화이트 가운 자켓, 민트 스크럽 슬랙스",
        ["메디컬", "전문직", "드라마"],
        { hair: "hair-long-straight", accessories: "acc-glasses", top: "top-suit", bottom: "bottom-slacks", shoes: "shoes-sneakers" },
        { "hair-long-straight": "#1f2937", "acc-glasses": "#374151", "top-suit": "#f3f4f6", "bottom-slacks": "#14b8a6", "shoes-sneakers": "#f3f4f6" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: 0.2, cheekFullness: 0, eyeScale: 0.15, eyeTilt: 0, eyeSpacing: 0, irisScale: 0.1, noseBridge: 0.35, lipFullness: 0.05 },
        bodyProportion: { heightCm: 172, headCount: 7.8, build: 0.85, shoulderWidth: 0.96, hipWidth: 0.98, legRatio: 0.5, armRatio: 0.44, neckLength: 1.02 },
        hairFlow: { length: 0.8, volume: 0.45, curl: 0.05, bangDensity: 0.4, tipGradientMix: 0 },
        celShader: { rampSteps: 2, shadowSoftness: 0.22, outlineWidthMm: 3.0, rimIntensity: 0.3 },
      }),
      varcoPartBindings: {},
    },
    {
      id: "chibi-daily-mascot",
      labelKo: "일상 개그 SD 마스코트",
      labelEn: "Chibi Daily Mascot",
      genreTagKo: "일상·개그·SD",
      descriptionKo: "3등신 통통한 볼살과 왕방울 반짝눈, 동물귀와 오버핏 후드티 SD 캐릭터",
      selection: {
        face: "face-chibi", eye: "eye-gentle", pupil: "pupil-star", nose: "nose-dot",
        lip: "lip-smile", ear: "ear-animal", hair: "hair-wavy", body: "body-chibi",
        top: "top-hoodie", bottom: "bottom-jeans", shoes: "shoes-sneakers",
        accessories: "acc-beanie", bodypose: "pose-run", handpose: "hand-peace",
      },
      stylePack: createUniverseStylePack(
        "universe-chibi-mascot",
        "SD 일상 개그 코디",
        "니트 비니와 오렌지 후드티, 귀여운 3등신 비율",
        ["일상", "개그", "SD"],
        { hair: "hair-wavy", accessories: "acc-beanie", top: "top-hoodie", bottom: "bottom-jeans", shoes: "shoes-sneakers" },
        { "hair-wavy": "#b45309", "acc-beanie": "#eab308", "top-hoodie": "#f97316", "bottom-jeans": "#3b82f6", "shoes-sneakers": "#f3f4f6" },
      ),
      sliders: clampShaperWebtoonCustomizerSliders({
        faceMorph: { jawSharpness: -0.85, cheekFullness: 0.9, eyeScale: 0.95, eyeTilt: -0.1, eyeSpacing: 0.25, irisScale: 0.85, noseBridge: -0.6, lipFullness: 0.3 },
        bodyProportion: { heightCm: 120, headCount: 3.0, build: 1.4, shoulderWidth: 1.15, hipWidth: 1.15, legRatio: 0.32, armRatio: 0.34, neckLength: 0.68 },
        hairFlow: { length: 0.55, volume: 0.9, curl: 0.65, bangDensity: 0.85, tipGradientMix: 0.2 },
        celShader: { rampSteps: 2, shadowSoftness: 0.1, outlineWidthMm: 3.5, rimIntensity: 0.25 },
      }),
      varcoPartBindings: {},
    },
  ]);

const PROFILE_BY_ID: ReadonlyMap<ShaperWebtoonUniverseId, ShaperWebtoonUniverseProfile> = new Map(
  SHAPER_WEBTOON_UNIVERSE_PROFILES.map((p) => [p.id, p]),
);

export function getShaperWebtoonUniverseProfile(
  id: ShaperWebtoonUniverseId,
): ShaperWebtoonUniverseProfile {
  return PROFILE_BY_ID.get(id) ?? SHAPER_WEBTOON_UNIVERSE_PROFILES[0]!;
}

export function blendShaperWebtoonUniverseProfiles(
  fromId: ShaperWebtoonUniverseId,
  toId: ShaperWebtoonUniverseId,
  t: number,
): {
  readonly dominantUniverseId: ShaperWebtoonUniverseId;
  readonly selection: ShaperPresetSelection;
  readonly appearance: ShaperAppearanceState;
  readonly sliders: ShaperWebtoonCustomizerSliders;
  readonly mannequinBodySliders: ShaperBodySliderValues;
  readonly varcoPartBindings: Readonly<Partial<Record<ShaperAppearanceCategory, ShaperVarco3dPartBinding>>>;
} {
  const from = getShaperWebtoonUniverseProfile(fromId);
  const to = getShaperWebtoonUniverseProfile(toId);
  const alpha = clampNum(t, 0.5, 0, 1);
  const dominant = alpha < 0.5 ? from : to;
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const fmA = from.sliders.faceMorph;
  const fmB = to.sliders.faceMorph;
  const bpA = from.sliders.bodyProportion;
  const bpB = to.sliders.bodyProportion;
  const hfA = from.sliders.hairFlow;
  const hfB = to.sliders.hairFlow;
  const csA = from.sliders.celShader;
  const csB = to.sliders.celShader;

  const sliders = clampShaperWebtoonCustomizerSliders({
    faceMorph: {
      jawSharpness: lerp(fmA.jawSharpness, fmB.jawSharpness),
      cheekFullness: lerp(fmA.cheekFullness, fmB.cheekFullness),
      eyeScale: lerp(fmA.eyeScale, fmB.eyeScale),
      eyeTilt: lerp(fmA.eyeTilt, fmB.eyeTilt),
      eyeSpacing: lerp(fmA.eyeSpacing, fmB.eyeSpacing),
      irisScale: lerp(fmA.irisScale, fmB.irisScale),
      noseBridge: lerp(fmA.noseBridge, fmB.noseBridge),
      lipFullness: lerp(fmA.lipFullness, fmB.lipFullness),
    },
    bodyProportion: {
      heightCm: lerp(bpA.heightCm, bpB.heightCm),
      headCount: lerp(bpA.headCount, bpB.headCount),
      build: lerp(bpA.build, bpB.build),
      shoulderWidth: lerp(bpA.shoulderWidth, bpB.shoulderWidth),
      hipWidth: lerp(bpA.hipWidth, bpB.hipWidth),
      legRatio: lerp(bpA.legRatio, bpB.legRatio),
      armRatio: lerp(bpA.armRatio, bpB.armRatio),
      neckLength: lerp(bpA.neckLength, bpB.neckLength),
    },
    hairFlow: {
      length: lerp(hfA.length, hfB.length),
      volume: lerp(hfA.volume, hfB.volume),
      curl: lerp(hfA.curl, hfB.curl),
      bangDensity: lerp(hfA.bangDensity, hfB.bangDensity),
      tipGradientMix: lerp(hfA.tipGradientMix, hfB.tipGradientMix),
    },
    celShader: {
      rampSteps: dominant.sliders.celShader.rampSteps,
      shadowSoftness: lerp(csA.shadowSoftness, csB.shadowSoftness),
      outlineWidthMm: lerp(csA.outlineWidthMm, csB.outlineWidthMm),
      rimIntensity: lerp(csA.rimIntensity, csB.rimIntensity),
    },
  });

  return {
    dominantUniverseId: dominant.id,
    selection: { ...dominant.selection },
    appearance: {
      selection: { ...dominant.stylePack.appearance.selection },
      colors: { ...dominant.stylePack.appearance.colors },
    },
    sliders,
    mannequinBodySliders: toMannequinBodySliderValues(sliders),
    varcoPartBindings: { ...from.varcoPartBindings, ...to.varcoPartBindings },
  };
}

export function bindVarco3dPartToShaperProfile(
  profile: ShaperWebtoonUniverseProfile,
  binding: ShaperVarco3dPartBinding,
): ShaperWebtoonUniverseProfile {
  return {
    ...profile,
    varcoPartBindings: {
      ...profile.varcoPartBindings,
      [binding.slot]: {
        ...binding,
        scaleMultiplier: clampNum(binding.scaleMultiplier, 1, 0.5, 2.0),
      },
    },
  };
}
