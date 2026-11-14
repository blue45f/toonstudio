/**
 * Studio 3D Shaper Toon Maker Engine
 *
 * 웹툰 캐릭터 셰이퍼(Shaper) 동등성 엔진:
 * - 11종 한국 웹툰 캐릭터 아키타입 (기존 5종 하위 호환 + 로판 북부대공·로판 황실 영애·무협 검존·K-POP 아이돌·사이버 암살자·조선 왕실 세자)
 * - 연속 파라메트릭 커스터마이저 (등신비 4.0~9.0, 어깨·체형 밸런스, V라인 턱선, 눈 크기·눈매 각도, 헤어 볼륨·투톤 그라데이션)
 * - 헤어 실루엣 6종 · 웹툰 의상 코디 세트 6종 · 셀셰이딩/SDF/외곽선 프리셋 4종
 * - 3D 씬 배치용 비례 마네킹/리그 프리미티브(`BgPrimitive[]`) 생성기 및 바리센트릭 3D 표면 잉킹 평가기
 */

import type { BgPrimitive } from "../studio-background-3d-metadata";

export type CharacterArchetype =
  | "shonen-hero-8head"
  | "romance-lead-7head"
  | "teen-student-6head"
  | "sd-chibi-4head"
  | "muscular-heavy-8head"
  | "northern-duke-85head"
  | "rofan-princess-75head"
  | "murim-swordmaster-8head"
  | "kpop-idol-78head"
  | "cyber-assassin-8head"
  | "joseon-royal-75head";

export type ShaperGenreFilterId =
  | "all"
  | "romance-school"
  | "rofan-royal"
  | "hunter-action"
  | "murim-historical"
  | "sd-daily";

export type ShaperHairSilhouetteId =
  | "see-through-bob"
  | "rofan-long-wave"
  | "male-lead-wolf"
  | "murim-high-ponytail"
  | "hime-cut"
  | "idol-twintail";

export type ShaperOutfitSetId =
  | "navy-gold-uniform"
  | "northern-duke-cape"
  | "rofan-crimson-dress"
  | "hunter-raid-armor"
  | "mount-hua-dopo"
  | "modern-office-suit";

export type ShaperCelShadingPresetId =
  | "sdf-clean-face"
  | "cel-3step-ramp"
  | "backlight-rim"
  | "bold-pen-outline";

export interface ArchetypeProportions {
  readonly headScale: readonly [number, number, number];
  readonly torsoScale: readonly [number, number, number];
  readonly limbLengthFactor: number;
  readonly shoulderWidthFactor: number;
  readonly legLengthRatio: number;
}

export interface ShaperArchetypeSpec {
  readonly id: CharacterArchetype;
  readonly labelKo: string;
  readonly genre: Exclude<ShaperGenreFilterId, "all">;
  readonly defaultHeadRatio: number;
  readonly defaultShoulderBalance: number;
  readonly defaultJawVLine: number;
  readonly defaultEyeSizeTilt: number;
  readonly defaultHairSilhouetteId: ShaperHairSilhouetteId;
  readonly defaultOutfitSetId: ShaperOutfitSetId;
  readonly skinHex: string;
  readonly hairHex: string;
  readonly hairTipHex: string;
  readonly eyeHex: string;
}

export interface ShaperHairSilhouetteSpec {
  readonly id: ShaperHairSilhouetteId;
  readonly labelKo: string;
  readonly descKo: string;
}

export interface ShaperOutfitSetSpec {
  readonly id: ShaperOutfitSetId;
  readonly labelKo: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly isSkirtOrRobe: boolean;
  readonly hasCape: boolean;
}

export interface ShaperCelShadingPresetSpec {
  readonly id: ShaperCelShadingPresetId;
  readonly labelKo: string;
  readonly descKo: string;
  readonly rampSteps: 2 | 3;
  readonly rimStrength: number;
  readonly defaultOutlineMm: number;
}

export interface ShaperWebtoonCustomizerState {
  readonly archetype: CharacterArchetype;
  readonly headRatio: number;
  readonly shoulderBalance: number;
  readonly jawVLine: number;
  readonly eyeSizeTilt: number;
  readonly hairVolumeOmbre: number;
  readonly hairSilhouetteId: ShaperHairSilhouetteId;
  readonly outfitSetId: ShaperOutfitSetId;
  readonly celShadingPresetId: ShaperCelShadingPresetId;
  readonly outlineThicknessMm: number;
}

export const SHAPER_GENRE_FILTERS: readonly {
  readonly id: ShaperGenreFilterId;
  readonly labelKo: string;
}[] = [
  { id: "all", labelKo: "전체" },
  { id: "romance-school", labelKo: "로맨스·학원" },
  { id: "rofan-royal", labelKo: "로판·황실" },
  { id: "hunter-action", labelKo: "헌터·액션" },
  { id: "murim-historical", labelKo: "무협·사극" },
  { id: "sd-daily", labelKo: "SD·일상" },
];

export const SHAPER_ARCHETYPE_CATALOG: readonly ShaperArchetypeSpec[] = [
  {
    id: "shonen-hero-8head",
    labelKo: "8등신 소년만화 히어로",
    genre: "hunter-action",
    defaultHeadRatio: 8.0,
    defaultShoulderBalance: 0.25,
    defaultJawVLine: 0.15,
    defaultEyeSizeTilt: 0.2,
    defaultHairSilhouetteId: "male-lead-wolf",
    defaultOutfitSetId: "hunter-raid-armor",
    skinHex: "#f6dccb",
    hairHex: "#1c1f26",
    hairTipHex: "#3b82f6",
    eyeHex: "#2563eb",
  },
  {
    id: "romance-lead-7head",
    labelKo: "7.5등신 로맨스 남/여주",
    genre: "romance-school",
    defaultHeadRatio: 7.5,
    defaultShoulderBalance: 0.0,
    defaultJawVLine: 0.35,
    defaultEyeSizeTilt: 0.3,
    defaultHairSilhouetteId: "see-through-bob",
    defaultOutfitSetId: "navy-gold-uniform",
    skinHex: "#fce7da",
    hairHex: "#4a3226",
    hairTipHex: "#b88f6b",
    eyeHex: "#7b5a44",
  },
  {
    id: "teen-student-6head",
    labelKo: "6등신 학원물 학생",
    genre: "romance-school",
    defaultHeadRatio: 6.2,
    defaultShoulderBalance: -0.15,
    defaultJawVLine: 0.1,
    defaultEyeSizeTilt: 0.4,
    defaultHairSilhouetteId: "see-through-bob",
    defaultOutfitSetId: "navy-gold-uniform",
    skinHex: "#fbe5d6",
    hairHex: "#2c221e",
    hairTipHex: "#6b4f3f",
    eyeHex: "#5c4033",
  },
  {
    id: "sd-chibi-4head",
    labelKo: "4등신 SD 치비 캐릭터",
    genre: "sd-daily",
    defaultHeadRatio: 4.2,
    defaultShoulderBalance: -0.4,
    defaultJawVLine: -0.45,
    defaultEyeSizeTilt: 0.75,
    defaultHairSilhouetteId: "idol-twintail",
    defaultOutfitSetId: "navy-gold-uniform",
    skinHex: "#ffe9dc",
    hairHex: "#ff9eb7",
    hairTipHex: "#fff0f5",
    eyeHex: "#a0663c",
  },
  {
    id: "muscular-heavy-8head",
    labelKo: "8등신 거구 근육형",
    genre: "hunter-action",
    defaultHeadRatio: 8.2,
    defaultShoulderBalance: 0.75,
    defaultJawVLine: -0.2,
    defaultEyeSizeTilt: -0.15,
    defaultHairSilhouetteId: "male-lead-wolf",
    defaultOutfitSetId: "hunter-raid-armor",
    skinHex: "#dfb595",
    hairHex: "#18181b",
    hairTipHex: "#3f3f46",
    eyeHex: "#ca8a04",
  },
  {
    id: "northern-duke-85head",
    labelKo: "8.5등신 로판 북부대공",
    genre: "rofan-royal",
    defaultHeadRatio: 8.5,
    defaultShoulderBalance: 0.55,
    defaultJawVLine: 0.65,
    defaultEyeSizeTilt: -0.25,
    defaultHairSilhouetteId: "male-lead-wolf",
    defaultOutfitSetId: "northern-duke-cape",
    skinHex: "#f8eae2",
    hairHex: "#0f1117",
    hairTipHex: "#334155",
    eyeHex: "#dc2626",
  },
  {
    id: "rofan-princess-75head",
    labelKo: "7.5등신 로판 황실 영애",
    genre: "rofan-royal",
    defaultHeadRatio: 7.5,
    defaultShoulderBalance: -0.2,
    defaultJawVLine: 0.5,
    defaultEyeSizeTilt: 0.55,
    defaultHairSilhouetteId: "rofan-long-wave",
    defaultOutfitSetId: "rofan-crimson-dress",
    skinHex: "#fff1ea",
    hairHex: "#f3ddb6",
    hairTipHex: "#f4b8c8",
    eyeHex: "#4f46e5",
  },
  {
    id: "murim-swordmaster-8head",
    labelKo: "8등신 무협 화산 검존",
    genre: "murim-historical",
    defaultHeadRatio: 8.0,
    defaultShoulderBalance: 0.38,
    defaultJawVLine: 0.4,
    defaultEyeSizeTilt: -0.2,
    defaultHairSilhouetteId: "murim-high-ponytail",
    defaultOutfitSetId: "mount-hua-dopo",
    skinHex: "#efe2d4",
    hairHex: "#17171a",
    hairTipHex: "#475569",
    eyeHex: "#be123c",
  },
  {
    id: "kpop-idol-78head",
    labelKo: "7.8등신 K-POP 아이돌 센터",
    genre: "romance-school",
    defaultHeadRatio: 7.8,
    defaultShoulderBalance: -0.15,
    defaultJawVLine: 0.48,
    defaultEyeSizeTilt: 0.5,
    defaultHairSilhouetteId: "idol-twintail",
    defaultOutfitSetId: "navy-gold-uniform",
    skinHex: "#fff2ec",
    hairHex: "#f5d0fe",
    hairTipHex: "#93c5fd",
    eyeHex: "#9333ea",
  },
  {
    id: "cyber-assassin-8head",
    labelKo: "8등신 사이버 그림자 암살자",
    genre: "hunter-action",
    defaultHeadRatio: 8.1,
    defaultShoulderBalance: 0.15,
    defaultJawVLine: 0.55,
    defaultEyeSizeTilt: -0.35,
    defaultHairSilhouetteId: "hime-cut",
    defaultOutfitSetId: "hunter-raid-armor",
    skinHex: "#f2dcd0",
    hairHex: "#111827",
    hairTipHex: "#06b6d4",
    eyeHex: "#10b981",
  },
  {
    id: "joseon-royal-75head",
    labelKo: "7.8등신 조선 왕실 세자",
    genre: "murim-historical",
    defaultHeadRatio: 7.8,
    defaultShoulderBalance: 0.22,
    defaultJawVLine: 0.3,
    defaultEyeSizeTilt: 0.1,
    defaultHairSilhouetteId: "murim-high-ponytail",
    defaultOutfitSetId: "modern-office-suit",
    skinHex: "#f5e5d5",
    hairHex: "#141316",
    hairTipHex: "#27272a",
    eyeHex: "#29201b",
  },
];

export const SHAPER_HAIR_SILHOUETTES: readonly ShaperHairSilhouetteSpec[] = [
  { id: "see-through-bob", labelKo: "시스루 단발", descKo: "가벼운 앞머리와 턱선 볼륨 단발" },
  { id: "rofan-long-wave", labelKo: "로판 롱웨이브", descKo: "풍성한 여신 웨이브 장발" },
  { id: "male-lead-wolf", labelKo: "남주 울프컷", descKo: "샤프한 목선 레이어드 울프컷" },
  { id: "murim-high-ponytail", labelKo: "무협 하이포니테일", descKo: "역동적인 장발 하이포니테일" },
  { id: "hime-cut", labelKo: "히메컷", descKo: "옆머리 직선 단차 히메 장발" },
  { id: "idol-twintail", labelKo: "아이돌 트윈테일", descKo: "양갈래 하이 트윈테일 실루엣" },
];

export const SHAPER_OUTFIT_SETS: readonly ShaperOutfitSetSpec[] = [
  {
    id: "navy-gold-uniform",
    labelKo: "네이비 금장 교복",
    primaryHex: "#1e293b",
    secondaryHex: "#f8fafc",
    accentHex: "#d4af37",
    isSkirtOrRobe: false,
    hasCape: false,
  },
  {
    id: "northern-duke-cape",
    labelKo: "북부대공 하프케이프",
    primaryHex: "#111827",
    secondaryHex: "#1f2937",
    accentHex: "#dc2626",
    isSkirtOrRobe: false,
    hasCape: true,
  },
  {
    id: "rofan-crimson-dress",
    labelKo: "로판 크림슨 드레스",
    primaryHex: "#7f1d1d",
    secondaryHex: "#fde68a",
    accentHex: "#fb7185",
    isSkirtOrRobe: true,
    hasCape: false,
  },
  {
    id: "hunter-raid-armor",
    labelKo: "S급 헌터 레이드 아머",
    primaryHex: "#1e2433",
    secondaryHex: "#334155",
    accentHex: "#38bdf8",
    isSkirtOrRobe: false,
    hasCape: true,
  },
  {
    id: "mount-hua-dopo",
    labelKo: "화산파 도포",
    primaryHex: "#f8fafc",
    secondaryHex: "#1e293b",
    accentHex: "#fb7185",
    isSkirtOrRobe: true,
    hasCape: false,
  },
  {
    id: "modern-office-suit",
    labelKo: "현대 오피스 수트",
    primaryHex: "#27272a",
    secondaryHex: "#f4f4f5",
    accentHex: "#a1a1aa",
    isSkirtOrRobe: false,
    hasCape: false,
  },
];

export const SHAPER_CEL_SHADING_PRESETS: readonly ShaperCelShadingPresetSpec[] = [
  {
    id: "sdf-clean-face",
    labelKo: "얼굴 SDF 깔끔 그림자",
    descKo: "코·볼 얼룩 없는 순정·로판 표준 SDF 음영",
    rampSteps: 2,
    rimStrength: 0.35,
    defaultOutlineMm: 2.2,
  },
  {
    id: "cel-3step-ramp",
    labelKo: "3단 셀 램프",
    descKo: "명암 대비가 또렷한 정통 웹툰 3단 셀 셰이딩",
    rampSteps: 3,
    rimStrength: 0.55,
    defaultOutlineMm: 3.4,
  },
  {
    id: "backlight-rim",
    labelKo: "역광 림라이트",
    descKo: "하이라이트 실루엣을 살리는 드라마틱 역광",
    rampSteps: 3,
    rimStrength: 0.9,
    defaultOutlineMm: 2.8,
  },
  {
    id: "bold-pen-outline",
    labelKo: "펜선 외곽선 두께 강조",
    descKo: "액션·무협 타격감을 살리는 굵은 먹선 외곽선",
    rampSteps: 3,
    rimStrength: 0.45,
    defaultOutlineMm: 5.2,
  },
];

export function findShaperArchetypeSpec(id: CharacterArchetype): ShaperArchetypeSpec {
  return SHAPER_ARCHETYPE_CATALOG.find((item) => item.id === id) ?? SHAPER_ARCHETYPE_CATALOG[0]!;
}

export function createDefaultShaperCustomizerState(
  archetype: CharacterArchetype = "shonen-hero-8head",
): ShaperWebtoonCustomizerState {
  const spec = findShaperArchetypeSpec(archetype);
  return {
    archetype,
    headRatio: spec.defaultHeadRatio,
    shoulderBalance: spec.defaultShoulderBalance,
    jawVLine: spec.defaultJawVLine,
    eyeSizeTilt: spec.defaultEyeSizeTilt,
    hairVolumeOmbre: 0.45,
    hairSilhouetteId: spec.defaultHairSilhouetteId,
    outfitSetId: spec.defaultOutfitSetId,
    celShadingPresetId: "sdf-clean-face",
    outlineThicknessMm: 2.6,
  };
}

export interface StylingSlotSelection {
  readonly hairstyleId: string;
  readonly outfitId: string;
  readonly glassesId?: string;
  readonly eyeColorHex: string;
  readonly hairColorHex: string;
  readonly skinColorHex: string;
  readonly outfitPrimaryColorHex: string;
  readonly outfitSecondaryColorHex: string;
}

export interface SurfaceInkPoint {
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
  readonly pressure: number;
  readonly localOffset: number;
}

export interface SurfaceInkStroke {
  readonly id: string;
  readonly targetMeshId: string;
  readonly points: readonly SurfaceInkPoint[];
  readonly colorHex: string;
  readonly width: number;
  readonly opacity: number;
}

export class Studio3DShaperToonMaker {
  private archetype: CharacterArchetype;
  private styling: StylingSlotSelection;
  private surfaceStrokes: SurfaceInkStroke[] = [];

  constructor(
    initialArchetype: CharacterArchetype = "shonen-hero-8head",
    initialStyling?: Partial<StylingSlotSelection>,
  ) {
    this.archetype = initialArchetype;
    this.styling = {
      hairstyleId: initialStyling?.hairstyleId ?? "short-messy-hero",
      outfitId: initialStyling?.outfitId ?? "korean-school-uniform-v1",
      glassesId: initialStyling?.glassesId,
      eyeColorHex: initialStyling?.eyeColorHex ?? "#2b1e16",
      hairColorHex: initialStyling?.hairColorHex ?? "#1c1c1e",
      skinColorHex: initialStyling?.skinColorHex ?? "#fbe3d5",
      outfitPrimaryColorHex: initialStyling?.outfitPrimaryColorHex ?? "#1a2530",
      outfitSecondaryColorHex: initialStyling?.outfitSecondaryColorHex ?? "#f0f2f5",
    };
  }

  public getArchetype(): CharacterArchetype {
    return this.archetype;
  }

  public setArchetype(archetype: CharacterArchetype): void {
    this.archetype = archetype;
  }

  public getStyling(): StylingSlotSelection {
    return this.styling;
  }

  public updateStyling(patch: Partial<StylingSlotSelection>): void {
    this.styling = { ...this.styling, ...patch };
  }

  public getSurfaceStrokes(): readonly SurfaceInkStroke[] {
    return this.surfaceStrokes;
  }

  public addSurfaceStroke(stroke: SurfaceInkStroke): void {
    this.surfaceStrokes.push(stroke);
  }

  public clearSurfaceStrokes(): void {
    this.surfaceStrokes = [];
  }

  /**
   * 선택된 아키타입의 해부학적 비례 스케일 벡터를 계산한다.
   */
  public evaluateArchetypeProportions(): ArchetypeProportions {
    return ARCHETYPE_PROPORTIONS_MAP[this.archetype];
  }

  /**
   * 바리센트릭 좌표를 기반으로 3D 표면 잉크 스트로크의 월드 좌표를 계산한다.
   */
  public evaluateStrokeWorldPositions(
    stroke: SurfaceInkStroke,
    meshVertices: Float32Array,
    meshIndices: Uint32Array,
  ): readonly [number, number, number][] {
    const evaluated: [number, number, number][] = [];

    for (const pt of stroke.points) {
      const triIdx = pt.triangleIndex;
      const i0 = meshIndices[triIdx * 3];
      const i1 = meshIndices[triIdx * 3 + 1];
      const i2 = meshIndices[triIdx * 3 + 2];

      if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

      const v0x = meshVertices[i0 * 3]!;
      const v0y = meshVertices[i0 * 3 + 1]!;
      const v0z = meshVertices[i0 * 3 + 2]!;

      const v1x = meshVertices[i1 * 3]!;
      const v1y = meshVertices[i1 * 3 + 1]!;
      const v1z = meshVertices[i1 * 3 + 2]!;

      const v2x = meshVertices[i2 * 3]!;
      const v2y = meshVertices[i2 * 3 + 1]!;
      const v2z = meshVertices[i2 * 3 + 2]!;

      const [u, v, w] = pt.barycentric;
      evaluated.push([
        u * v0x + v * v1x + w * v2x,
        u * v0y + v * v1y + w * v2y,
        u * v0z + v * v1z + w * v2z,
      ]);
    }

    return evaluated;
  }
}

const ARCHETYPE_PROPORTIONS_MAP: Readonly<Record<CharacterArchetype, ArchetypeProportions>> = {
  "shonen-hero-8head": { headScale: [0.95, 0.95, 0.95], torsoScale: [1.05, 1.0, 1.0], limbLengthFactor: 1.08, shoulderWidthFactor: 1.15, legLengthRatio: 0.58 },
  "romance-lead-7head": { headScale: [0.9, 0.9, 0.9], torsoScale: [0.95, 1.05, 0.95], limbLengthFactor: 1.12, shoulderWidthFactor: 1.0, legLengthRatio: 0.62 },
  "teen-student-6head": { headScale: [1.1, 1.1, 1.1], torsoScale: [0.9, 0.95, 0.9], limbLengthFactor: 0.95, shoulderWidthFactor: 0.92, legLengthRatio: 0.52 },
  "sd-chibi-4head": { headScale: [1.8, 1.8, 1.8], torsoScale: [0.75, 0.7, 0.75], limbLengthFactor: 0.65, shoulderWidthFactor: 0.75, legLengthRatio: 0.42 },
  "muscular-heavy-8head": { headScale: [0.92, 0.92, 0.92], torsoScale: [1.35, 1.15, 1.25], limbLengthFactor: 1.05, shoulderWidthFactor: 1.4, legLengthRatio: 0.55 },
  "northern-duke-85head": { headScale: [0.86, 0.88, 0.86], torsoScale: [1.14, 1.08, 1.04], limbLengthFactor: 1.18, shoulderWidthFactor: 1.32, legLengthRatio: 0.63 },
  "rofan-princess-75head": { headScale: [0.92, 0.92, 0.92], torsoScale: [0.88, 1.02, 0.9], limbLengthFactor: 1.1, shoulderWidthFactor: 0.92, legLengthRatio: 0.61 },
  "murim-swordmaster-8head": { headScale: [0.93, 0.94, 0.93], torsoScale: [1.08, 1.04, 1.0], limbLengthFactor: 1.12, shoulderWidthFactor: 1.22, legLengthRatio: 0.59 },
  "kpop-idol-78head": { headScale: [0.9, 0.9, 0.9], torsoScale: [0.86, 1.0, 0.88], limbLengthFactor: 1.14, shoulderWidthFactor: 0.94, legLengthRatio: 0.62 },
  "cyber-assassin-8head": { headScale: [0.91, 0.92, 0.91], torsoScale: [0.96, 1.04, 0.94], limbLengthFactor: 1.15, shoulderWidthFactor: 1.08, legLengthRatio: 0.61 },
  "joseon-royal-75head": { headScale: [0.94, 0.95, 0.94], torsoScale: [1.02, 1.04, 0.98], limbLengthFactor: 1.06, shoulderWidthFactor: 1.12, legLengthRatio: 0.57 },
};

export interface ShaperCharacterSceneBuildResult {
  readonly primitives: readonly BgPrimitive[];
  readonly labelKo: string;
  readonly summaryKo: string;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function makePart(
  id: string,
  name: string,
  kind: BgPrimitive["kind"],
  position: [number, number, number],
  scale: [number, number, number],
  color: string,
  rotation: [number, number, number] = [0, 0, 0],
): BgPrimitive {
  return { id, name, kind, position, rotation, scale, color };
}

/**
 * 커스터마이저 상태를 기반으로 3D 배경/씬 뷰포트에 즉시 배치 가능한 웹툰 비례 캐릭터 마네킹 프리미티브 세트를 생성한다.
 */
export function buildShaperCharacterMannequinPrimitives(
  state: ShaperWebtoonCustomizerState,
): ShaperCharacterSceneBuildResult {
  const archetypeSpec = findShaperArchetypeSpec(state.archetype);
  const hairSpec = SHAPER_HAIR_SILHOUETTES.find((item) => item.id === state.hairSilhouetteId) ?? SHAPER_HAIR_SILHOUETTES[0]!;
  const outfitSpec = SHAPER_OUTFIT_SETS.find((item) => item.id === state.outfitSetId) ?? SHAPER_OUTFIT_SETS[0]!;
  const celSpec = SHAPER_CEL_SHADING_PRESETS.find((item) => item.id === state.celShadingPresetId) ?? SHAPER_CEL_SHADING_PRESETS[0]!;

  const clampedHeads = Math.min(9.0, Math.max(4.0, state.headRatio));
  const headHeight = 0.22;
  const totalHeight = round3(clampedHeads * headHeight);
  const legHeight = round3(totalHeight * (clampedHeads <= 5 ? 0.38 : 0.51));
  const torsoHeight = round3(Math.max(0.24, totalHeight - legHeight - headHeight * 1.25));
  const shoulderSpan = round3(0.36 + state.shoulderBalance * 0.11);
  const jawWidthScale = round3(Math.max(0.55, 0.92 - state.jawVLine * 0.24));
  const eyeScale = round3(Math.max(0.025, 0.042 + state.eyeSizeTilt * 0.012));
  const hairVol = round3(1 + state.hairVolumeOmbre * 0.28);

  const hipCenterY = round3(legHeight);
  const torsoCenterY = round3(legHeight + torsoHeight * 0.5);
  const neckCenterY = round3(legHeight + torsoHeight + headHeight * 0.14);
  const headCenterY = round3(legHeight + torsoHeight + headHeight * 0.68);

  const prefix = `shaper-${state.archetype}`;
  const legColor = outfitSpec.isSkirtOrRobe ? archetypeSpec.skinHex : outfitSpec.primaryHex;
  const lowerScale: [number, number, number] = outfitSpec.isSkirtOrRobe
    ? [round3(shoulderSpan * 1.15), round3(legHeight * 0.62), round3(shoulderSpan * 1.05)]
    : [round3(shoulderSpan * 0.78), 0.22, 0.22];

  const primitives: BgPrimitive[] = [
    makePart(`${prefix}-leg-l`, `${archetypeSpec.labelKo} 왼다리`, "capsule", [round3(-shoulderSpan * 0.26), round3(legHeight * 0.5), 0], [0.11, legHeight, 0.11], legColor),
    makePart(`${prefix}-leg-r`, `${archetypeSpec.labelKo} 오른다리`, "capsule", [round3(shoulderSpan * 0.26), round3(legHeight * 0.5), 0], [0.11, legHeight, 0.11], legColor),
    makePart(`${prefix}-lower-outfit`, `${outfitSpec.labelKo} 하의`, outfitSpec.isSkirtOrRobe ? "cone" : "cylinder", [0, round3(hipCenterY - (outfitSpec.isSkirtOrRobe ? 0.12 : 0)), 0], lowerScale, outfitSpec.primaryHex),
    makePart(`${prefix}-torso`, `${outfitSpec.labelKo} 상의`, "capsule", [0, torsoCenterY, 0], [shoulderSpan, torsoHeight, 0.22], outfitSpec.primaryHex),
    makePart(`${prefix}-collar`, `${outfitSpec.labelKo} 칼라·장식`, "torus", [0, round3(legHeight + torsoHeight * 0.9), 0.01], [round3(shoulderSpan * 0.52), round3(shoulderSpan * 0.42), 0.08], outfitSpec.accentHex, [Math.PI / 2, 0, 0]),
    makePart(`${prefix}-arm-l`, `${archetypeSpec.labelKo} 왼팔`, "capsule", [round3(-shoulderSpan * 0.66), round3(torsoCenterY + 0.02), 0], [0.09, round3(legHeight * 0.78), 0.09], outfitSpec.secondaryHex, [0, 0, 0.14]),
    makePart(`${prefix}-arm-r`, `${archetypeSpec.labelKo} 오른팔`, "capsule", [round3(shoulderSpan * 0.66), round3(torsoCenterY + 0.02), 0], [0.09, round3(legHeight * 0.78), 0.09], outfitSpec.secondaryHex, [0, 0, -0.14]),
    makePart(`${prefix}-neck`, "목", "cylinder", [0, neckCenterY, 0], [0.08, round3(headHeight * 0.35), 0.08], archetypeSpec.skinHex),
    makePart(`${prefix}-head`, "두상·V라인", "sphere", [0, headCenterY, 0], [round3(headHeight * jawWidthScale), headHeight, round3(headHeight * 0.94)], archetypeSpec.skinHex),
    makePart(`${prefix}-eye-l`, "왼눈 홍채", "sphere", [-0.045, round3(headCenterY - 0.01), round3(headHeight * 0.45)], [eyeScale, eyeScale, 0.02], archetypeSpec.eyeHex, [0, 0, round3(-state.eyeSizeTilt * 0.22)]),
    makePart(`${prefix}-eye-r`, "오른눈 홍채", "sphere", [0.045, round3(headCenterY - 0.01), round3(headHeight * 0.45)], [eyeScale, eyeScale, 0.02], archetypeSpec.eyeHex, [0, 0, round3(state.eyeSizeTilt * 0.22)]),
    makePart(`${prefix}-hair-crown`, `${hairSpec.labelKo} 크라운`, "hemisphere", [0, round3(headCenterY + headHeight * 0.12), -0.01], [round3(headHeight * 1.08 * hairVol), round3(headHeight * 0.95 * hairVol), round3(headHeight * 1.08 * hairVol)], archetypeSpec.hairHex),
  ];

  if (state.hairSilhouetteId === "rofan-long-wave" || state.hairSilhouetteId === "hime-cut" || state.hairSilhouetteId === "murim-high-ponytail") {
    primitives.push(
      makePart(
        `${prefix}-hair-back`,
        `${hairSpec.labelKo} 후면 장발`,
        state.hairSilhouetteId === "murim-high-ponytail" ? "cone" : "capsule",
        [0, round3(headCenterY - torsoHeight * 0.42), -0.11],
        [round3(headHeight * 0.95 * hairVol), round3(torsoHeight * 0.95), 0.1],
        state.hairVolumeOmbre >= 0.4 ? archetypeSpec.hairTipHex : archetypeSpec.hairHex,
        [0.12, 0, 0],
      ),
    );
  } else if (state.hairSilhouetteId === "idol-twintail") {
    for (const side of [-1, 1] as const) {
      primitives.push(
        makePart(
          `${prefix}-hair-twin-${side < 0 ? "l" : "r"}`,
          `${hairSpec.labelKo} ${side < 0 ? "좌" : "우"}`,
          "cone",
          [round3(side * headHeight * 0.72), round3(headCenterY - 0.12), -0.05],
          [0.1, round3(torsoHeight * 0.85 * hairVol), 0.1],
          archetypeSpec.hairTipHex,
          [0, 0, round3(side * -0.22)],
        ),
      );
    }
  }

  if (outfitSpec.hasCape) {
    primitives.push(
      makePart(
        `${prefix}-cape`,
        `${outfitSpec.labelKo} 망토`,
        "box",
        [0, round3(torsoCenterY - 0.08), -0.15],
        [round3(shoulderSpan * 1.18), round3(torsoHeight + legHeight * 0.45), 0.04],
        outfitSpec.secondaryHex,
        [0.1, 0, 0],
      ),
    );
  }

  const labelKo = `${archetypeSpec.labelKo} (${clampedHeads.toFixed(1)}등신 · ${hairSpec.labelKo} · ${outfitSpec.labelKo})`;
  const summaryKo = `3D 셰이퍼 캐릭터 배치 완료: ${labelKo} · ${celSpec.labelKo}(외곽선 ${state.outlineThicknessMm.toFixed(1)}mm) · 총 ${primitives.length}개 파츠`;

  return { primitives, labelKo, summaryKo };
}
