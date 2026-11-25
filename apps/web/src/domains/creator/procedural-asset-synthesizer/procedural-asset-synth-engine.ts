/**
 * Wave 55D — 절차적 SVG 생성·재질 설계·권리 미검토 이력 엔진.
 *
 * - 6종 절차적 SVG 생성기: 고딕 첨두 아치 창틀, 전통 한옥 기와 처마, 서울 골목 상가 파사드,
 *   판타지 마법진·가문 문장, 만화 소품 수풀·화분 덩굴, 심리스 한지·석재 PBR 타일
 * - 결정론적 Mulberry32 PRNG(32비트 정수 연산, BigInt 미사용)와 6단계 설계 DAG의 순서 검사
 * - 탈-바이올렛(270~320° 배제) OKLCH 5종 안료 팔레트와 통합·LT 선화·PBR 법선/거칠기 SVG 출력
 * - 실제 생성물은 SVG다. 3D·PBR 수치는 설계 가정이며 권리 정보는 미검토 로컬 생성 이력이다.
 */

import { assertSynthesizedResult } from "./synth-export-contract";

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const SYNTH_SVG_WIDTH = 360;
export const SYNTH_SVG_HEIGHT = 260;

export type ProceduralAssetRecipeId =
  | "gothic-window-arch"
  | "hanok-tile-roof"
  | "seoul-alley-facade"
  | "fantasy-magic-crest"
  | "comic-prop-foliage"
  | "seamless-paper-stone-pbr";

export type PigmentHarmonyId =
  | "atelier-ink-ochre"
  | "celadon-mineral"
  | "vermilion-dancheong"
  | "cobalt-blueprint"
  | "crimson-lacquer";

export type PreviewChannelId = "composite" | "lt-lineart" | "pbr-normal-roughness";
export type ComplexityLod = 1 | 2 | 3 | 4;
export type DagStageKind = "seed" | "geometry" | "lineart" | "material" | "manifold" | "rights-bom";
export type SvgLayerKind = "base" | "detail" | "lineart" | "weathering" | "pbr-normal" | "pbr-roughness";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Vec2 { readonly x: number; readonly y: number; }

export interface PigmentHarmonySpec {
  readonly id: PigmentHarmonyId; readonly nameKo: string; readonly nameEn: string; readonly moodKo: string; readonly moodEn: string;
  readonly paperBg: OklchColor; readonly primaryFill: OklchColor; readonly secondaryFill: OklchColor; readonly accentFill: OklchColor;
  readonly shadowFill: OklchColor; readonly inkStroke: OklchColor;
  readonly normalSlopeHigh: OklchColor; readonly normalSlopeLow: OklchColor; readonly roughnessCue: OklchColor;
}

export interface ProceduralAssetRecipe {
  readonly id: ProceduralAssetRecipeId; readonly nameKo: string; readonly nameEn: string;
  readonly categoryKo: string; readonly categoryEn: string; readonly taglineKo: string; readonly taglineEn: string;
  readonly webtoonUsageKo: string; readonly webtoonUsageEn: string;
  readonly defaultSeed: number; readonly defaultLod: ComplexityLod; readonly defaultWeathering01: number;
  readonly defaultLineWeightPx: number; readonly defaultHarmonyId: PigmentHarmonyId;
  readonly baseFootprintMeters: { readonly widthM: number; readonly heightM: number; readonly depthM: number };
  readonly pbrProfile: { readonly baseRoughness: number; readonly baseMetallic: number; readonly normalStrength: number; readonly aoStrength: number; readonly tileableSeamless: boolean };
}

export interface ProceduralAssetSynthInput {
  readonly recipeId: ProceduralAssetRecipeId; readonly seed?: number; readonly complexityLod?: ComplexityLod;
  readonly weathering01?: number; readonly lineWeightPx?: number; readonly pigmentHarmony?: PigmentHarmonyId; readonly previewChannel?: PreviewChannelId;
}

export interface NormalizedSynthParams {
  readonly recipeId: ProceduralAssetRecipeId; readonly seed: number; readonly complexityLod: ComplexityLod;
  readonly weathering01: number; readonly lineWeightPx: number; readonly pigmentHarmony: PigmentHarmonyId; readonly previewChannel: PreviewChannelId;
}

export interface DagPipelineNode {
  readonly id: string; readonly order: number; readonly stageKind: DagStageKind;
  readonly labelKo: string; readonly labelEn: string; readonly dependsOn: readonly string[];
  readonly primitiveCount: number; readonly estimatedCostMs: number; readonly deterministicHash: string; readonly status: "illustrative";
}

export interface DagGraphIntegrity {
  readonly isAcyclic: boolean; readonly stageCount: number; readonly edgeCount: number;
  readonly topologicalOrder: readonly string[]; readonly totalEstimatedCostMs: number; readonly graphDigest: string;
}

export type SvgPrimitiveElement =
  | { readonly kind: "rect"; readonly id: string; readonly layer: SvgLayerKind; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx?: number; readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number; readonly dashArray?: string }
  | { readonly kind: "circle"; readonly id: string; readonly layer: SvgLayerKind; readonly cx: number; readonly cy: number; readonly r: number; readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number; readonly dashArray?: string }
  | { readonly kind: "polygon"; readonly id: string; readonly layer: SvgLayerKind; readonly points: readonly Vec2[]; readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number }
  | { readonly kind: "line"; readonly id: string; readonly layer: SvgLayerKind; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number; readonly dashArray?: string }
  | { readonly kind: "path"; readonly id: string; readonly layer: SvgLayerKind; readonly d: string; readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity?: number; readonly dashArray?: string };

export interface SynthesizedSvgScene {
  readonly width: number; readonly height: number; readonly backgroundOklch: string;
  readonly elements: readonly SvgPrimitiveElement[];
  readonly lineartElementCount: number; readonly detailElementCount: number; readonly weatheringElementCount: number;
}

export interface WatertightMesh3dSummary {
  readonly vertexCount: number; readonly edgeCount: number; readonly triangleCount: number;
  readonly nonManifoldEdges: null; readonly looseVertices: null; readonly floorGroundedY0: false; readonly minYMeters: null;
  readonly metricScaleMetersPerUnit: 1;
  readonly dimensionsMeters: { readonly widthM: number; readonly heightM: number; readonly depthM: number };
  readonly uvCoveragePercent: number; readonly glbForgeReady: false; readonly validationState: "not-generated";
}

export interface PbrMaterialStats {
  readonly resolutionPx: 512 | 1024 | 2048 | 4096; readonly seamlessTileable: boolean;
  readonly metallicMean01: number; readonly estimatedVramKb: number;
  readonly channels: {
    readonly albedo: { readonly meanLuminance01: number; readonly chromaRange01: number; readonly primaryOklch: string; readonly secondaryOklch: string };
    readonly normal: { readonly meanSlopeDeg: number; readonly peakReliefMm: number; readonly tangentSpaceValid: false; readonly previewPaletteMode: "non-violet-oklch-slope" };
    readonly roughness: { readonly min01: number; readonly mean01: number; readonly max01: number; readonly weatheringDelta01: number };
    readonly ao: { readonly cavityDepth01: number; readonly meanOcclusion01: number; readonly creviceCoveragePercent: number };
  };
}

export interface RightsBomCleanCertificate {
  readonly schemaVersion: "toonstudio.procedural-provenance-note.v1"; readonly certificateId: string;
  readonly licenseClass: "unknown"; readonly externalCopyrightContamination: "not-assessed";
  readonly commercialWebtoonRedistributionAllowed: false; readonly aiTrainingDatasetDependency: "not-assessed";
  readonly thirdPartyAssetDependencies: readonly [];
  readonly generatorProvenance: {
    readonly engine: "ToonStudio Procedural Asset Synthesizer"; readonly prng: "mulberry32-u32";
    readonly recipeId: ProceduralAssetRecipeId; readonly seed: number; readonly complexityLod: ComplexityLod;
    readonly graphDigest: string; readonly reproducible: true;
  };
  readonly externalRedistributionWarningKo: string; readonly externalRedistributionWarningEn: string;
  readonly auditChecklist: { readonly zeroExternalStockScan: "not-run"; readonly deterministicSeedReproducible: true; readonly manifoldWatertightVerified: false; readonly commercialWebtoonCleared: false };
  readonly authority: { readonly rightsRegistryChecked: false; readonly exportGateGranted: false; readonly signatureVerified: false };
}

export interface ProceduralAssetSynthResult {
  readonly recipe: ProceduralAssetRecipe; readonly harmony: PigmentHarmonySpec; readonly params: NormalizedSynthParams;
  readonly dagPipeline: readonly DagPipelineNode[]; readonly dagIntegrity: DagGraphIntegrity;
  readonly svgScene: SynthesizedSvgScene; readonly mesh3dSummary: WatertightMesh3dSummary;
  readonly pbrMaterialStats: PbrMaterialStats; readonly rightsBomCertificate: RightsBomCleanCertificate;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number): number => typeof v !== "number" || Number.isNaN(v) ? lo : Math.min(hi, Math.max(lo, v));
const ok = (l: number, c: number, h: number): OklchColor => ({ l, c, h });

export function isVioletSlopHue(hueDeg: number): boolean {
  const norm = ((hueDeg % 360) + 360) % 360;
  return norm >= VIOLET_SLOP_MIN_HUE && norm <= VIOLET_SLOP_MAX_HUE;
}

export function sanitizeNonVioletHue(hueDeg: number): number {
  const norm = Number.isFinite(hueDeg) ? ((hueDeg % 360) + 360) % 360 : 240;
  if (!isVioletSlopHue(norm)) return r2(norm);
  return norm < 295 ? 252 : 342;
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = r3(clamp(color.l, 0, 1));
  const c = r3(clamp(color.c, 0, 0.37));
  const h = sanitizeNonVioletHue(color.h);
  return alpha === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`;
}

export function normalizeSeed(seed: number | undefined, fallback = 40219): number {
  let source = Number.isFinite(fallback) ? fallback : 40219;
  if (typeof seed === "number" && Number.isFinite(seed)) source = seed;
  const floored = Math.abs(Math.trunc(source));
  return floored === 0 ? 1 : ((floored - 1) % 999999) + 1;
}

export function nextDeterministicSeed(currentSeed: number): number {
  const base = normalizeSeed(currentSeed);
  const mixed = (Math.imul(base ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  const candidate = (mixed % 999999) + 1;
  return candidate === base ? (base % 999999) + 1 : candidate;
}

/** 32비트 정수 연산 기반 결정론적 Mulberry32 PRNG (0 <= x < 1). */
export function createMulberry32(seed: number): () => number {
  let state = normalizeSeed(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2레인 FNV-1a 32비트 결정론적 해시(16자리 소문자 16진수, BigInt 미사용). */
export function computeDeterministicDigest(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i * 17), 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export const PIGMENT_HARMONIES: readonly PigmentHarmonySpec[] = [
  {
    id: "atelier-ink-ochre", nameKo: "아틀리에 먹·황토", nameEn: "Atelier Ink & Ochre",
    moodKo: "따뜻한 미색 종이와 석회·황토 원고 톤", moodEn: "Warm parchment with mineral ochre and slate ink",
    paperBg: ok(0.965, 0.012, 84), primaryFill: ok(0.78, 0.055, 72), secondaryFill: ok(0.67, 0.048, 158),
    accentFill: ok(0.62, 0.135, 36), shadowFill: ok(0.42, 0.035, 52), inkStroke: ok(0.22, 0.022, 235),
    normalSlopeHigh: ok(0.68, 0.115, 196), normalSlopeLow: ok(0.56, 0.095, 224), roughnessCue: ok(0.72, 0.095, 74),
  },
  {
    id: "celadon-mineral", nameKo: "고려 청자·화강암", nameEn: "Celadon & Granite",
    moodKo: "비색 청자와 서늘한 화강석 배경 팔레트", moodEn: "Jade celadon glaze paired with granite stone",
    paperBg: ok(0.96, 0.01, 162), primaryFill: ok(0.74, 0.068, 168), secondaryFill: ok(0.68, 0.024, 222),
    accentFill: ok(0.6, 0.105, 186), shadowFill: ok(0.41, 0.032, 218), inkStroke: ok(0.21, 0.02, 242),
    normalSlopeHigh: ok(0.7, 0.11, 188), normalSlopeLow: ok(0.54, 0.09, 228), roughnessCue: ok(0.71, 0.088, 88),
  },
  {
    id: "vermilion-dancheong", nameKo: "단청 주홍·송록", nameEn: "Dancheong Vermilion & Pine",
    moodKo: "전통 목조건축 단청과 소나무 청록 대비", moodEn: "Heritage vermilion cinnabar balanced with pine green",
    paperBg: ok(0.962, 0.014, 78), primaryFill: ok(0.62, 0.148, 28), secondaryFill: ok(0.64, 0.092, 148),
    accentFill: ok(0.76, 0.125, 84), shadowFill: ok(0.39, 0.048, 42), inkStroke: ok(0.2, 0.018, 240),
    normalSlopeHigh: ok(0.67, 0.12, 200), normalSlopeLow: ok(0.55, 0.098, 222), roughnessCue: ok(0.74, 0.11, 68),
  },
  {
    id: "cobalt-blueprint", nameKo: "코발트 청사진·백묵", nameEn: "Cobalt Blueprint & Chalk",
    moodKo: "건축 투시도 청사진과 황동 포인트 라인", moodEn: "Architectural blueprint cobalt with brass highlights",
    paperBg: ok(0.958, 0.012, 212), primaryFill: ok(0.65, 0.092, 236), secondaryFill: ok(0.75, 0.064, 205),
    accentFill: ok(0.74, 0.118, 78), shadowFill: ok(0.38, 0.056, 244), inkStroke: ok(0.2, 0.028, 248),
    normalSlopeHigh: ok(0.7, 0.115, 194), normalSlopeLow: ok(0.52, 0.102, 232), roughnessCue: ok(0.75, 0.092, 80),
  },
  {
    id: "crimson-lacquer", nameKo: "주칠 적갈·금박", nameEn: "Crimson Lacquer & Gold",
    moodKo: "로맨스 판타지 문장·성채용 깊은 적갈과 금박", moodEn: "Deep cinnabar lacquer with antique gold accents",
    paperBg: ok(0.96, 0.013, 66), primaryFill: ok(0.56, 0.132, 18), secondaryFill: ok(0.64, 0.088, 346),
    accentFill: ok(0.79, 0.132, 86), shadowFill: ok(0.36, 0.044, 22), inkStroke: ok(0.19, 0.016, 236),
    normalSlopeHigh: ok(0.68, 0.112, 198), normalSlopeLow: ok(0.54, 0.094, 226), roughnessCue: ok(0.73, 0.105, 72),
  },
];

export const PROCEDURAL_ASSET_RECIPES: readonly ProceduralAssetRecipe[] = [
  {
    id: "gothic-window-arch", nameKo: "고딕 첨두 아치 창틀", nameEn: "Gothic Pointed Window Arch", categoryKo: "건축 배경", categoryEn: "Architectural",
    taglineKo: "첨두 아치 석재 부수아르·장미창 트레이서리·납선 격자 자동 합성", taglineEn: "Pointed lancet arch, stone voussoirs, rose tracery, and leaded mullions",
    webtoonUsageKo: "로판 대성당·저택 복도 배경 LT 선화 도해", webtoonUsageEn: "Cathedral and manor corridor LT lineart illustrations",
    defaultSeed: 14820, defaultLod: 3, defaultWeathering01: 0.28, defaultLineWeightPx: 1.5, defaultHarmonyId: "atelier-ink-ochre",
    baseFootprintMeters: { widthM: 1.8, heightM: 3.2, depthM: 0.42 }, pbrProfile: { baseRoughness: 0.68, baseMetallic: 0.06, normalStrength: 0.78, aoStrength: 0.62, tileableSeamless: false },
  },
  {
    id: "hanok-tile-roof", nameKo: "전통 한옥 기와 처마", nameEn: "Hanok Curved Tile Roof", categoryKo: "한옥·사극", categoryEn: "Heritage Roof",
    taglineKo: "처마 안허리곡·암키와/수키와 열·연화문 수막새·서까래 파라메트릭 합성", taglineEn: "Curved eaves, pan/ridge tiles, lotus end-caps, and timber rafters",
    webtoonUsageKo: "사극·무협·현대 한옥마을 지붕 배경과 처마 밑 음영 레이어", webtoonUsageEn: "Historical drama roofs, eave perspective linework, and ambient shading",
    defaultSeed: 29104, defaultLod: 3, defaultWeathering01: 0.34, defaultLineWeightPx: 1.6, defaultHarmonyId: "vermilion-dancheong",
    baseFootprintMeters: { widthM: 3.6, heightM: 1.45, depthM: 1.9 }, pbrProfile: { baseRoughness: 0.62, baseMetallic: 0.04, normalStrength: 0.86, aoStrength: 0.72, tileableSeamless: true },
  },
  {
    id: "seoul-alley-facade", nameKo: "서울 골목 상가 파사드", nameEn: "Seoul Alley Shop Facade", categoryKo: "현대 일상", categoryEn: "Urban Facade",
    taglineKo: "적벽돌 입면·셔터·기하 간판틀 SVG·실외기·배수관 절차 배치", taglineEn: "Brick elevation, rolling shutter, geometric sign-frame SVG, AC unit, and pipes",
    webtoonUsageKo: "현대 로맨스·액션 골목길 상가 컷 배경의 SVG 배치 도해", webtoonUsageEn: "Modern urban alley panels and SVG street-facade layout references",
    defaultSeed: 53091, defaultLod: 3, defaultWeathering01: 0.42, defaultLineWeightPx: 1.4, defaultHarmonyId: "cobalt-blueprint",
    baseFootprintMeters: { widthM: 4.2, heightM: 3.4, depthM: 0.85 }, pbrProfile: { baseRoughness: 0.58, baseMetallic: 0.24, normalStrength: 0.72, aoStrength: 0.66, tileableSeamless: false },
  },
  {
    id: "fantasy-magic-crest", nameKo: "판타지 마법진·가문 문장", nameEn: "Fantasy Magic Circle & Crest", categoryKo: "판타지 이펙트", categoryEn: "Arcane Emblem",
    taglineKo: "동심원 다각성·절차 룬 눈금 띠·방패 문장을 시드별 변주", taglineEn: "Concentric star polygons, procedural rune ticks, and heraldic shield crests",
    webtoonUsageKo: "스킬 발동 이펙트·마법서 표지·귀족 가문 인장 SVG 스탬프", webtoonUsageEn: "Spellcasting overlays, grimoire emblems, and noble house stamps",
    defaultSeed: 77412, defaultLod: 4, defaultWeathering01: 0.16, defaultLineWeightPx: 1.3, defaultHarmonyId: "crimson-lacquer",
    baseFootprintMeters: { widthM: 2.2, heightM: 0.08, depthM: 2.2 }, pbrProfile: { baseRoughness: 0.34, baseMetallic: 0.52, normalStrength: 0.64, aoStrength: 0.48, tileableSeamless: false },
  },
  {
    id: "comic-prop-foliage", nameKo: "만화 소품 수풀·화분 덩굴", nameEn: "Comic Foliage & Potted Vine", categoryKo: "자연·소품", categoryEn: "Organic Prop",
    taglineKo: "곡선 줄기 분기·쌍잎 실루엣·잎맥 선화·화분 받침대 자동 조립", taglineEn: "Branching stems, paired leaf silhouettes, center veins, and ceramic planter",
    webtoonUsageKo: "카페·거실·정원 컷 전경 소품과 식물 군집 배치 참고", webtoonUsageEn: "Cafe, interior, and garden foreground props layout references",
    defaultSeed: 61805, defaultLod: 3, defaultWeathering01: 0.22, defaultLineWeightPx: 1.4, defaultHarmonyId: "celadon-mineral",
    baseFootprintMeters: { widthM: 0.72, heightM: 1.15, depthM: 0.72 }, pbrProfile: { baseRoughness: 0.54, baseMetallic: 0.02, normalStrength: 0.68, aoStrength: 0.58, tileableSeamless: false },
  },
  {
    id: "seamless-paper-stone-pbr", nameKo: "한지·석재 배색 타일", nameEn: "Paper-Stone Color Tile", categoryKo: "타일 재질 도해", categoryEn: "Tile Material Illustration",
    taglineKo: "석재 줄눈·한지 섬유·마모의 SVG 도해와 재질 가정값", taglineEn: "SVG stone courses, paper fibers, wear cues, and material assumptions",
    webtoonUsageKo: "웹툰 원고 종이 질감 오버레이·성벽·보도블록 타일 배색 참고", webtoonUsageEn: "Webtoon paper grain overlays and wall and pavement color references",
    defaultSeed: 88513, defaultLod: 3, defaultWeathering01: 0.38, defaultLineWeightPx: 1.1, defaultHarmonyId: "atelier-ink-ochre",
    baseFootprintMeters: { widthM: 2.0, heightM: 0.05, depthM: 2.0 }, pbrProfile: { baseRoughness: 0.76, baseMetallic: 0.03, normalStrength: 0.91, aoStrength: 0.74, tileableSeamless: true },
  },
];

export const getProceduralAssetRecipe = (id: ProceduralAssetRecipeId): ProceduralAssetRecipe =>
  structuredClone(PROCEDURAL_ASSET_RECIPES.find((item) => item.id === id) ?? PROCEDURAL_ASSET_RECIPES[0]);

export const getPigmentHarmony = (id: PigmentHarmonyId): PigmentHarmonySpec =>
  structuredClone(PIGMENT_HARMONIES.find((item) => item.id === id) ?? PIGMENT_HARMONIES[0]);

function clampLod(lod: number | undefined, fallback: ComplexityLod): ComplexityLod {
  if (typeof lod !== "number" || !Number.isFinite(lod)) return fallback;
  const n = Math.round(lod);
  return n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4;
}

function addWeatheringMarks(
  els: SvgPrimitiveElement[], rand: () => number, w01: number, harmony: PigmentHarmonySpec,
  b: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, lw: number,
): void {
  const count = Math.round(w01 * 22);
  const stroke = formatOklch(harmony.shadowFill, 0.58);
  const speck = formatOklch(harmony.roughnessCue, 0.48);
  for (let i = 0; i < count; i += 1) {
    const x = r2(b.x0 + rand() * (b.x1 - b.x0));
    const y = r2(b.y0 + rand() * (b.y1 - b.y0));
    if (i % 2 === 0) {
      const dx = r2((rand() - 0.5) * (12 + w01 * 18));
      const dy = r2(4 + rand() * (10 + w01 * 14));
      els.push({ kind: "path", id: `wear-crack-${i}`, layer: "weathering", d: `M ${x} ${y} L ${r2(x + dx * 0.45)} ${r2(y + dy * 0.55)} L ${r2(x + dx)} ${r2(y + dy)}`, fill: "none", stroke, strokeWidth: r2(Math.max(0.6, lw * 0.58)), opacity: 0.72 });
    } else {
      els.push({ kind: "circle", id: `wear-pit-${i}`, layer: "weathering", cx: x, cy: y, r: r2(1.2 + rand() * (2.6 + w01 * 2.4)), fill: speck, stroke, strokeWidth: 0.55, opacity: 0.64 });
    }
  }
}

function buildGothicWindowArch(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const cx = 180; const baseY = 232; const springY = 122;
  const halfW = 74 + Math.round((rand() - 0.5) * 10);
  const apexY = 30 + Math.round((rand() - 0.5) * 8);
  const ink = formatOklch(h.inkStroke);
  const stone = formatOklch(h.primaryFill, 0.78);
  els.push({ kind: "path", id: "gothic-outer-frame", layer: "base", d: `M ${cx - halfW - 14} ${baseY} L ${cx - halfW - 14} ${springY} Q ${cx - halfW - 10} ${apexY + 26} ${cx} ${apexY - 10} Q ${cx + halfW + 10} ${apexY + 26} ${cx + halfW + 14} ${springY} L ${cx + halfW + 14} ${baseY} Z`, fill: stone, stroke: ink, strokeWidth: r2(lw * 1.15) });
  els.push({ kind: "path", id: "gothic-inner-bay", layer: "base", d: `M ${cx - halfW} ${baseY - 12} L ${cx - halfW} ${springY} Q ${cx - halfW + 4} ${apexY + 34} ${cx} ${apexY + 6} Q ${cx + halfW - 4} ${apexY + 34} ${cx + halfW} ${springY} L ${cx + halfW} ${baseY - 12} Z`, fill: formatOklch(h.secondaryFill, 0.34), stroke: ink, strokeWidth: lw });

  const voussoirs = 6 + lod * 2;
  const yScale = (springY - apexY) / halfW;
  for (let i = 0; i < voussoirs; i += 1) {
    const a0 = Math.PI + (i / voussoirs) * Math.PI;
    const a1 = Math.PI + ((i + 1) / voussoirs) * Math.PI;
    els.push({
      kind: "polygon", id: `gothic-voussoir-${i}`, layer: "detail",
      points: [{ x: r2(cx + Math.cos(a0) * halfW), y: r2(springY + Math.sin(a0) * halfW * yScale) }, { x: r2(cx + Math.cos(a0) * (halfW + 13)), y: r2(springY + Math.sin(a0) * (halfW + 13) * yScale) }, { x: r2(cx + Math.cos(a1) * (halfW + 13)), y: r2(springY + Math.sin(a1) * (halfW + 13) * yScale) }, { x: r2(cx + Math.cos(a1) * halfW), y: r2(springY + Math.sin(a1) * halfW * yScale) }],
      fill: i % 2 === 0 ? stone : formatOklch(h.primaryFill, 0.54), stroke: ink, strokeWidth: r2(lw * 0.78),
    });
  }
  const roseY = Math.round((springY + apexY) * 0.56);
  const roseR = 20 + lod * 2;
  els.push({ kind: "circle", id: "gothic-rose-outer", layer: "lineart", cx, cy: roseY, r: roseR, fill: formatOklch(h.accentFill, 0.72), stroke: ink, strokeWidth: lw });
  const petals = 4 + lod * 2;
  for (let p = 0; p < petals; p += 1) {
    const a = (p / petals) * Math.PI * 2;
    els.push({ kind: "circle", id: `gothic-rose-petal-${p}`, layer: "detail", cx: r2(cx + Math.cos(a) * roseR * 0.54), cy: r2(roseY + Math.sin(a) * roseR * 0.54), r: r2(roseR * 0.28), fill: formatOklch(h.paperBg, 0.85), stroke: ink, strokeWidth: r2(lw * 0.72) });
  }
  for (let m = 1; m < lod + 1; m += 1) {
    const mx = r2(cx - halfW + (halfW * 2 * m) / (lod + 1));
    els.push({ kind: "line", id: `gothic-mullion-${m}`, layer: "lineart", x1: mx, y1: springY - 6, x2: mx, y2: baseY - 12, stroke: ink, strokeWidth: r2(lw * 0.95) });
  }
  for (let r = 0; r < 2 + lod; r += 1) {
    const ry = r2(springY + 12 + ((baseY - springY - 26) * r) / (2 + lod));
    els.push({ kind: "line", id: `gothic-transom-${r}`, layer: "lineart", x1: cx - halfW + 2, y1: ry, x2: cx + halfW - 2, y2: ry, stroke: ink, strokeWidth: r2(lw * 0.65), opacity: 0.75 });
  }
  els.push({ kind: "rect", id: "gothic-sill", layer: "base", x: cx - halfW - 24, y: baseY - 10, width: (halfW + 24) * 2, height: 16, rx: 2, fill: formatOklch(h.shadowFill, 0.28), stroke: ink, strokeWidth: r2(lw * 1.1) });
  els.push({ kind: "rect", id: "gothic-pbr-slope", layer: "pbr-normal", x: cx - halfW, y: springY, width: halfW * 2, height: baseY - springY - 12, fill: formatOklch(h.normalSlopeHigh, 0.42), stroke: formatOklch(h.normalSlopeLow), strokeWidth: 0.9 });
  addWeatheringMarks(els, rand, w01, h, { x0: cx - halfW - 10, y0: apexY + 18, x1: cx + halfW + 10, y1: baseY - 8 }, lw);
  return els;
}

function buildHanokTileRoof(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const ink = formatOklch(h.inkStroke);
  const timber = formatOklch(h.accentFill, 0.76);
  const lift = 18 + Math.round(rand() * 10);
  const roofD = `M 36 ${176 - lift} Q 180 198 324 ${176 - lift} L 296 72 Q 180 86 64 72 Z`;
  els.push({ kind: "path", id: "hanok-roof-body", layer: "base", d: roofD, fill: formatOklch(h.shadowFill, 0.78), stroke: ink, strokeWidth: r2(lw * 1.2) });
  els.push({ kind: "path", id: "hanok-ridge-beam", layer: "lineart", d: "M 54 66 Q 180 80 306 66 L 302 78 Q 180 92 58 78 Z", fill: formatOklch(h.primaryFill, 0.82), stroke: ink, strokeWidth: lw });

  const tiers = 2 + lod;
  for (let t = 1; t < tiers; t += 1) {
    const ty = r2(82 + (t * 88) / tiers); const padX = r2(58 - t * 5);
    els.push({ kind: "path", id: `hanok-tier-${t}`, layer: "lineart", d: `M ${padX} ${ty} Q 180 ${r2(ty + 14)} ${360 - padX} ${ty}`, fill: "none", stroke: ink, strokeWidth: r2(lw * 0.72), opacity: 0.78 });
  }
  const cols = 6 + lod * 3;
  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols; const topX = r2(66 + u * 228); const botX = r2(42 + u * 276); const botY = r2(176 - lift + Math.sin(u * Math.PI) * 20);
    els.push({ kind: "line", id: `hanok-sukiwa-${c}`, layer: "lineart", x1: topX, y1: 78, x2: botX, y2: botY, stroke: ink, strokeWidth: r2(lw * 0.92) });
    els.push({ kind: "circle", id: `hanok-sumaksae-${c}`, layer: "detail", cx: botX, cy: r2(botY + 5), r: r2(5.2 - lod * 0.35), fill: formatOklch(h.secondaryFill, 0.75), stroke: ink, strokeWidth: r2(lw * 0.78) });
  }
  els.push({ kind: "rect", id: "hanok-eave-beam", layer: "base", x: 64, y: 192, width: 232, height: 18, rx: 2, fill: timber, stroke: ink, strokeWidth: lw });
  const rafters = 5 + lod * 2;
  for (let r = 0; r < rafters; r += 1) {
    els.push({ kind: "circle", id: `hanok-rafter-${r}`, layer: "detail", cx: r2(76 + (r * 208) / Math.max(1, rafters - 1)), cy: 201, r: 4.5, fill: formatOklch(h.paperBg, 0.9), stroke: ink, strokeWidth: r2(lw * 0.75) });
  }
  els.push({ kind: "rect", id: "hanok-pillar-l", layer: "base", x: 76, y: 210, width: 18, height: 34, fill: timber, stroke: ink, strokeWidth: lw });
  els.push({ kind: "rect", id: "hanok-pillar-r", layer: "base", x: 266, y: 210, width: 18, height: 34, fill: timber, stroke: ink, strokeWidth: lw });
  els.push({ kind: "path", id: "hanok-pbr-slope", layer: "pbr-normal", d: roofD, fill: formatOklch(h.normalSlopeHigh, 0.44), stroke: formatOklch(h.normalSlopeLow), strokeWidth: 0.95 });
  addWeatheringMarks(els, rand, w01, h, { x0: 56, y0: 84, x1: 304, y1: 184 }, lw);
  return els;
}

function buildSeoulAlleyFacade(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const ink = formatOklch(h.inkStroke);
  const concrete = formatOklch(h.secondaryFill, 0.56);
  els.push({ kind: "rect", id: "alley-building", layer: "base", x: 62, y: 34, width: 236, height: 204, fill: formatOklch(h.primaryFill, 0.8), stroke: ink, strokeWidth: r2(lw * 1.15) });
  els.push({ kind: "rect", id: "alley-lintel", layer: "base", x: 56, y: 120, width: 248, height: 14, rx: 1, fill: concrete, stroke: ink, strokeWidth: lw });
  els.push({ kind: "line", id: "alley-ground", layer: "lineart", x1: 24, y1: 238, x2: 336, y2: 238, stroke: ink, strokeWidth: r2(lw * 1.25) });
  for (let r = 1; r < 3 + lod * 2; r += 1) {
    const by = r2(36 + (r * 82) / (3 + lod * 2));
    els.push({ kind: "line", id: `alley-brick-row-${r}`, layer: "detail", x1: 64, y1: by, x2: 296, y2: by, stroke: ink, strokeWidth: 0.55, opacity: 0.42 });
  }
  els.push({ kind: "rect", id: "alley-window-l", layer: "detail", x: 84, y: 54, width: 64, height: 48, fill: formatOklch(h.paperBg, 0.88), stroke: ink, strokeWidth: lw });
  els.push({ kind: "line", id: "alley-window-l-mid", layer: "lineart", x1: 116, y1: 54, x2: 116, y2: 102, stroke: ink, strokeWidth: r2(lw * 0.85) });
  els.push({ kind: "rect", id: "alley-window-r", layer: "detail", x: 170, y: 54, width: 64, height: 48, fill: formatOklch(h.paperBg, 0.88), stroke: ink, strokeWidth: lw });
  els.push({ kind: "line", id: "alley-window-r-mid", layer: "lineart", x1: 202, y1: 54, x2: 202, y2: 102, stroke: ink, strokeWidth: r2(lw * 0.85) });
  els.push({ kind: "rect", id: "alley-shutter", layer: "base", x: 78, y: 146, width: 114, height: 92, fill: concrete, stroke: ink, strokeWidth: lw });
  for (let s = 1; s < 4 + lod * 2; s += 1) {
    const sy = r2(146 + (s * 92) / (4 + lod * 2));
    els.push({ kind: "line", id: `alley-slat-${s}`, layer: "lineart", x1: 80, y1: sy, x2: 190, y2: sy, stroke: ink, strokeWidth: r2(lw * 0.65), opacity: 0.72 });
  }
  els.push({ kind: "rect", id: "alley-door", layer: "detail", x: 206, y: 148, width: 52, height: 90, fill: formatOklch(h.paperBg, 0.84), stroke: ink, strokeWidth: lw });
  els.push({ kind: "rect", id: "alley-sign-vertical", layer: "detail", x: 304, y: 60, width: 22, height: 54 + Math.round(rand() * 20), rx: 3, fill: formatOklch(h.accentFill, 0.86), stroke: ink, strokeWidth: lw });
  els.push({ kind: "line", id: "alley-sign-bar-1", layer: "lineart", x1: 310, y1: 74, x2: 320, y2: 74, stroke: formatOklch(h.paperBg), strokeWidth: 2 });
  els.push({ kind: "line", id: "alley-sign-bar-2", layer: "lineart", x1: 310, y1: 88, x2: 320, y2: 88, stroke: formatOklch(h.paperBg), strokeWidth: 2 });
  els.push({ kind: "rect", id: "alley-ac-box", layer: "detail", x: 248, y: 80, width: 38, height: 28, rx: 2, fill: formatOklch(h.shadowFill, 0.65), stroke: ink, strokeWidth: r2(lw * 0.85) });
  els.push({ kind: "circle", id: "alley-ac-fan", layer: "lineart", cx: 262, cy: 94, r: 8.5, fill: formatOklch(h.paperBg, 0.7), stroke: ink, strokeWidth: 0.8 });
  els.push({ kind: "line", id: "alley-pipe", layer: "lineart", x1: 290, y1: 36, x2: 290, y2: 238, stroke: ink, strokeWidth: r2(lw * 1.15) });
  els.push({ kind: "rect", id: "alley-pbr-slope", layer: "pbr-normal", x: 64, y: 36, width: 232, height: 200, fill: formatOklch(h.normalSlopeHigh, 0.36), stroke: formatOklch(h.normalSlopeLow), strokeWidth: 0.9 });
  addWeatheringMarks(els, rand, w01, h, { x0: 66, y0: 42, x1: 292, y1: 230 }, lw);
  return els;
}

function buildFantasyMagicCrest(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const cx = 180; const cy = 130; const ink = formatOklch(h.inkStroke); const gold = formatOklch(h.accentFill, 0.8);
  [104, 92, 74, 46].forEach((r, idx) => {
    els.push({ kind: "circle", id: `crest-ring-${idx}`, layer: idx % 2 === 0 ? "lineart" : "detail", cx, cy, r, fill: idx === 0 ? formatOklch(h.primaryFill, 0.34) : "none", stroke: idx === 1 ? gold : ink, strokeWidth: r2(idx === 0 ? lw * 1.2 : lw * 0.9), dashArray: idx === 2 ? "5 3" : undefined });
  });
  const ptsN = 6 + Math.floor(rand() * 3) * 2;
  const starA: Vec2[] = []; const starB: Vec2[] = [];
  for (let i = 0; i < ptsN; i += 1) {
    const a = (i / ptsN) * Math.PI * 2 - Math.PI / 2; const b = a + Math.PI / ptsN;
    starA.push({ x: r2(cx + Math.cos(a) * 90), y: r2(cy + Math.sin(a) * 90) });
    starB.push({ x: r2(cx + Math.cos(b) * 72), y: r2(cy + Math.sin(b) * 72) });
  }
  els.push({ kind: "polygon", id: "crest-star-outer", layer: "lineart", points: starA, fill: "none", stroke: ink, strokeWidth: lw });
  els.push({ kind: "polygon", id: "crest-star-inner", layer: "detail", points: starB, fill: formatOklch(h.accentFill, 0.2), stroke: formatOklch(h.secondaryFill, 0.6), strokeWidth: r2(lw * 0.85) });
  const ticks = 12 + lod * 8;
  for (let t = 0; t < ticks; t += 1) {
    const a = (t / ticks) * Math.PI * 2; const r0 = t % 2 === 0 ? 94 : 96;
    els.push({ kind: "line", id: `crest-rune-tick-${t}`, layer: "lineart", x1: r2(cx + Math.cos(a) * r0), y1: r2(cy + Math.sin(a) * r0), x2: r2(cx + Math.cos(a) * 102), y2: r2(cy + Math.sin(a) * 102), stroke: ink, strokeWidth: r2(lw * 0.72) });
  }
  els.push({ kind: "path", id: "crest-shield", layer: "base", d: `M ${cx - 24} ${cy - 22} L ${cx + 24} ${cy - 22} L ${cx + 20} ${cy + 8} Q ${cx} ${cy + 30} ${cx} ${cy + 30} Q ${cx} ${cy + 30} ${cx - 20} ${cy + 8} Z`, fill: gold, stroke: ink, strokeWidth: r2(lw * 1.1) });
  els.push({ kind: "circle", id: "crest-pbr-slope", layer: "pbr-normal", cx, cy, r: 104, fill: formatOklch(h.normalSlopeHigh, 0.38), stroke: formatOklch(h.normalSlopeLow), strokeWidth: 0.9 });
  addWeatheringMarks(els, rand, w01, h, { x0: cx - 96, y0: cy - 96, x1: cx + 96, y1: cy + 96 }, lw);
  return els;
}

function buildComicPropFoliage(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const ink = formatOklch(h.inkStroke); const leafA = formatOklch(h.primaryFill, 0.82); const leafB = formatOklch(h.secondaryFill, 0.8); const pot = formatOklch(h.accentFill, 0.78);
  els.push({ kind: "circle", id: "foliage-shadow", layer: "base", cx: 180, cy: 230, r: 54, fill: formatOklch(h.shadowFill, 0.16), stroke: "none", strokeWidth: 0 });
  els.push({ kind: "polygon", id: "foliage-pot-body", layer: "base", points: [{ x: 138, y: 176 }, { x: 222, y: 176 }, { x: 208, y: 232 }, { x: 152, y: 232 }], fill: pot, stroke: ink, strokeWidth: r2(lw * 1.15) });
  els.push({ kind: "rect", id: "foliage-pot-rim", layer: "base", x: 130, y: 164, width: 100, height: 14, rx: 3, fill: pot, stroke: ink, strokeWidth: lw });

  const branches = 3 + lod;
  for (let b = 0; b < branches; b += 1) {
    const spread = (b - (branches - 1) / 2) * (24 + rand() * 8);
    const tipX = r2(180 + spread * 1.6); const tipY = r2(52 + Math.abs(spread) * 0.65 + rand() * 14);
    const ctrlX = r2(180 + spread * 0.55); const ctrlY = r2(124 - rand() * 16);
    els.push({ kind: "path", id: `foliage-stem-${b}`, layer: "lineart", d: `M 180 166 Q ${ctrlX} ${ctrlY} ${tipX} ${tipY}`, fill: "none", stroke: ink, strokeWidth: r2(lw * 1.05) });
    const leaves = 2 + lod;
    for (let l = 1; l <= leaves; l += 1) {
      const t = l / (leaves + 0.3);
      const bx = (1 - t) * (1 - t) * 180 + 2 * (1 - t) * t * ctrlX + t * t * tipX;
      const by = (1 - t) * (1 - t) * 166 + 2 * (1 - t) * t * ctrlY + t * t * tipY;
      const side = l % 2 === 0 ? 1 : -1; const len = 18 + (1 - t) * 12;
      const lx = r2(bx + side * len); const ly = r2(by - 8 - rand() * 6);
      els.push({ kind: "polygon", id: `foliage-leaf-${b}-${l}`, layer: "detail", points: [{ x: r2(bx), y: r2(by) }, { x: r2(bx + side * len * 0.55), y: r2(by - 10) }, { x: lx, y: ly }, { x: r2(bx + side * len * 0.45), y: r2(by + 5) }], fill: (b + l) % 2 === 0 ? leafA : leafB, stroke: ink, strokeWidth: r2(lw * 0.82) });
      els.push({ kind: "line", id: `foliage-vein-${b}-${l}`, layer: "lineart", x1: r2(bx), y1: r2(by), x2: lx, y2: ly, stroke: ink, strokeWidth: r2(lw * 0.55), opacity: 0.72 });
    }
  }
  els.push({ kind: "circle", id: "foliage-pbr-slope", layer: "pbr-normal", cx: 180, cy: 118, r: 78, fill: formatOklch(h.normalSlopeHigh, 0.36), stroke: formatOklch(h.normalSlopeLow), strokeWidth: 0.9 });
  addWeatheringMarks(els, rand, w01, h, { x0: 108, y0: 56, x1: 252, y1: 224 }, lw);
  return els;
}

function buildSeamlessPaperStonePbr(rand: () => number, lod: ComplexityLod, w01: number, lw: number, h: PigmentHarmonySpec): SvgPrimitiveElement[] {
  const els: SvgPrimitiveElement[] = [];
  const ink = formatOklch(h.inkStroke);
  const rows = 3 + lod; const cols = 4 + lod; const cellW = SYNTH_SVG_WIDTH / cols; const cellH = SYNTH_SVG_HEIGHT / rows;
  for (let r = 0; r < rows; r += 1) {
    const stagger = r % 2 === 1 ? cellW * 0.5 : 0;
    for (let c = -1; c <= cols; c += 1) {
      const x = r2(c * cellW + stagger); const y = r2(r * cellH);
      if (x + cellW <= 0 || x >= SYNTH_SVG_WIDTH) continue;
      const shade = (r + c + Math.floor(rand() * 2)) % 3;
      const fill = shade === 0 ? formatOklch(h.primaryFill, 0.72) : shade === 1 ? formatOklch(h.secondaryFill, 0.55) : formatOklch(h.paperBg, 0.92);
      els.push({ kind: "rect", id: `pbr-stone-${r}-${c + 1}`, layer: "base", x: r2(x + 2), y: r2(y + 2), width: r2(cellW - 4), height: r2(cellH - 4), rx: 3, fill, stroke: ink, strokeWidth: r2(lw * 0.85) });
      els.push({ kind: "rect", id: `pbr-normal-bevel-${r}-${c + 1}`, layer: "pbr-normal", x: r2(x + 4), y: r2(y + 4), width: r2(cellW - 8), height: r2(cellH - 8), rx: 2, fill: shade % 2 === 0 ? formatOklch(h.normalSlopeHigh, 0.52) : formatOklch(h.normalSlopeLow, 0.48), stroke: formatOklch(h.roughnessCue, 0.7), strokeWidth: 0.7 });
    }
  }
  for (let f = 0; f < 10 + lod * 6; f += 1) {
    const x1 = r2(rand() * SYNTH_SVG_WIDTH); const y1 = r2(rand() * SYNTH_SVG_HEIGHT); const ang = rand() * Math.PI; const len = 14 + rand() * 22;
    els.push({ kind: "line", id: `pbr-fiber-${f}`, layer: "detail", x1, y1, x2: r2(x1 + Math.cos(ang) * len), y2: r2(y1 + Math.sin(ang) * len), stroke: formatOklch(h.shadowFill, 0.36), strokeWidth: r2(Math.max(0.5, lw * 0.52)) });
  }
  addWeatheringMarks(els, rand, w01, h, { x0: 10, y0: 10, x1: SYNTH_SVG_WIDTH - 10, y1: SYNTH_SVG_HEIGHT - 10 }, lw);
  return els;
}

function verifyDagAcyclicity(nodes: readonly DagPipelineNode[]): DagGraphIntegrity {
  const inDegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};
  let edgeCount = 0;
  for (const n of nodes) { inDegree[n.id] = n.dependsOn.length; dependents[n.id] = []; }
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (dependents[dep]) { dependents[dep].push(n.id); edgeCount += 1; }
    }
  }
  const queue = nodes.filter((n) => (inDegree[n.id] ?? 0) === 0).map((n) => n.id);
  const topo: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    topo.push(cur);
    for (const nxt of dependents[cur] ?? []) {
      const deg = (inDegree[nxt] ?? 1) - 1;
      inDegree[nxt] = deg;
      if (deg === 0) queue.push(nxt);
    }
  }
  return {
    isAcyclic: topo.length === nodes.length, stageCount: nodes.length, edgeCount, topologicalOrder: topo,
    totalEstimatedCostMs: r2(nodes.reduce((sum, n) => sum + n.estimatedCostMs, 0)),
    graphDigest: computeDeterministicDigest(nodes.map((n) => `${n.id}:${n.deterministicHash}`).join("|")),
  };
}

/** 고정 시드 산식으로 SVG를 생성하고 설계 DAG 요약을 계산한다. */
export function synthesizeProceduralAsset(input: ProceduralAssetSynthInput): ProceduralAssetSynthResult {
  const recipe = getProceduralAssetRecipe(input.recipeId);
  const previewChannel = input.previewChannel ?? "composite";
  if (!["composite", "lt-lineart", "pbr-normal-roughness"].includes(previewChannel)) throw new RangeError("지원하지 않는 SVG 채널입니다.");
  const params: NormalizedSynthParams = {
    recipeId: recipe.id,
    seed: normalizeSeed(input.seed, recipe.defaultSeed),
    complexityLod: clampLod(input.complexityLod, recipe.defaultLod),
    weathering01: r2(clamp(input.weathering01 ?? recipe.defaultWeathering01, 0, 1)),
    lineWeightPx: r2(clamp(input.lineWeightPx ?? recipe.defaultLineWeightPx, 0.5, 4.0)),
    pigmentHarmony: getPigmentHarmony(input.pigmentHarmony ?? recipe.defaultHarmonyId).id,
    previewChannel,
  };
  const harmony = getPigmentHarmony(params.pigmentHarmony);
  const rand = createMulberry32(params.seed ^ (params.complexityLod * 7919));

  const builders: Readonly<Record<ProceduralAssetRecipeId, () => SvgPrimitiveElement[]>> = {
    "gothic-window-arch": () => buildGothicWindowArch(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
    "hanok-tile-roof": () => buildHanokTileRoof(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
    "seoul-alley-facade": () => buildSeoulAlleyFacade(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
    "fantasy-magic-crest": () => buildFantasyMagicCrest(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
    "comic-prop-foliage": () => buildComicPropFoliage(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
    "seamless-paper-stone-pbr": () => buildSeamlessPaperStonePbr(rand, params.complexityLod, params.weathering01, params.lineWeightPx, harmony),
  };
  const elements = builders[recipe.id]();

  const lineartElementCount = elements.filter((e) => e.layer === "lineart").length;
  const detailElementCount = elements.filter((e) => e.layer === "detail").length;
  const weatheringElementCount = elements.filter((e) => e.layer === "weathering").length;
  const baseElementCount = elements.filter((e) => e.layer === "base").length;

  const lodScale = [1, 2.2, 4.4, 8.2][params.complexityLod - 1] ?? 4.4;
  const baseQuads = recipe.id === "seamless-paper-stone-pbr" ? 48 : recipe.id === "fantasy-magic-crest" ? 64 : 88;
  const triangleCount = Math.round(baseQuads * lodScale) * 2;
  const edgeCount = Math.round((triangleCount * 3) / 2);
  const mesh3dSummary: WatertightMesh3dSummary = {
    vertexCount: edgeCount - triangleCount + 2, edgeCount, triangleCount, nonManifoldEdges: null, looseVertices: null,
    floorGroundedY0: false, minYMeters: null, metricScaleMetersPerUnit: 1, dimensionsMeters: recipe.baseFootprintMeters,
    uvCoveragePercent: r2(clamp(85 + params.complexityLod * 2.4 + (params.seed % 17) * 0.12, 82, 97.5)), glbForgeReady: false, validationState: "not-generated",
  };

  const resolutionPx = ([512, 1024, 2048, 4096] as const)[params.complexityLod - 1] ?? 2048;
  const weatheringDelta = r3(params.weathering01 * 0.22);
  const roughMean = r3(clamp(recipe.pbrProfile.baseRoughness + weatheringDelta, 0.08, 0.96));
  const pbrMaterialStats: PbrMaterialStats = {
    resolutionPx, seamlessTileable: false,
    metallicMean01: r3(clamp(recipe.pbrProfile.baseMetallic * (1 - params.weathering01 * 0.3), 0, 1)),
    estimatedVramKb: Math.round((resolutionPx * resolutionPx * 4 * 1.33) / 1024),
    channels: {
      albedo: { meanLuminance01: r3((harmony.primaryFill.l + harmony.secondaryFill.l) * 0.5), chromaRange01: r3(Math.max(harmony.primaryFill.c, harmony.accentFill.c)), primaryOklch: formatOklch(harmony.primaryFill), secondaryOklch: formatOklch(harmony.secondaryFill) },
      normal: { meanSlopeDeg: r2(12 + recipe.pbrProfile.normalStrength * 24 + params.weathering01 * 11), peakReliefMm: r2(2.4 + recipe.pbrProfile.normalStrength * 6.5 + params.weathering01 * 4.2), tangentSpaceValid: false, previewPaletteMode: "non-violet-oklch-slope" },
      roughness: { min01: r3(clamp(roughMean - 0.14, 0.05, roughMean)), mean01: roughMean, max01: r3(clamp(roughMean + 0.15, roughMean, 0.99)), weatheringDelta01: weatheringDelta },
      ao: { cavityDepth01: r3(clamp(recipe.pbrProfile.aoStrength + params.weathering01 * 0.12, 0.2, 0.95)), meanOcclusion01: r3(clamp(1 - recipe.pbrProfile.aoStrength * 0.32 - params.weathering01 * 0.08, 0.45, 0.96)), creviceCoveragePercent: r2(clamp(16 + params.complexityLod * 6 + params.weathering01 * 28, 12, 74)) },
    },
  };

  const sig = `${params.recipeId}:${params.seed}:${params.complexityLod}:${params.weathering01}:${params.lineWeightPx}:${params.pigmentHarmony}`;
  const dagPipeline: readonly DagPipelineNode[] = [
    { id: "seed-field", order: 1, stageKind: "seed", labelKo: "Mulberry32 시드·격자장", labelEn: "Mulberry32 Seed Field", dependsOn: [], primitiveCount: 1, estimatedCostMs: r2(0.3 + params.complexityLod * 0.1), deterministicHash: computeDeterministicDigest(`seed|${sig}`).slice(0, 10), status: "illustrative" },
    { id: "primitive-topology", order: 2, stageKind: "geometry", labelKo: "2D SVG 형상", labelEn: "2D SVG Geometry", dependsOn: ["seed-field"], primitiveCount: baseElementCount + detailElementCount, estimatedCostMs: r2(1.4 + params.complexityLod * 0.85), deterministicHash: computeDeterministicDigest(`geo|${sig}|${baseElementCount}`).slice(0, 10), status: "illustrative" },
    { id: "lt-ink-extract", order: 3, stageKind: "lineart", labelKo: "웹툰 LT 선화·실루엣 추출", labelEn: "Webtoon LT Lineart Extract", dependsOn: ["primitive-topology"], primitiveCount: lineartElementCount, estimatedCostMs: r2(0.9 + params.lineWeightPx * 0.35), deterministicHash: computeDeterministicDigest(`lt|${sig}|${lineartElementCount}`).slice(0, 10), status: "illustrative" },
    { id: "pbr-weathering", order: 4, stageKind: "material", labelKo: "PBR 배색 도해·가정값", labelEn: "PBR Color Cues & Assumptions", dependsOn: ["seed-field", "primitive-topology"], primitiveCount: weatheringElementCount + 4, estimatedCostMs: r2(1.8 + params.complexityLod * 1.1 + params.weathering01 * 0.8), deterministicHash: computeDeterministicDigest(`pbr|${sig}|${roughMean}`).slice(0, 10), status: "illustrative" },
    { id: "manifold-grounding", order: 5, stageKind: "manifold", labelKo: "3D 검증 대기", labelEn: "3D Validation Pending", dependsOn: ["primitive-topology", "pbr-weathering"], primitiveCount: triangleCount, estimatedCostMs: r2(1.1 + params.complexityLod * 0.6), deterministicHash: computeDeterministicDigest(`mesh|${sig}|${triangleCount}`).slice(0, 10), status: "illustrative" },
    { id: "rights-bom-seal", order: 6, stageKind: "rights-bom", labelKo: "로컬 생성 이력·권리 미검토", labelEn: "Local Provenance · Rights Unreviewed", dependsOn: ["lt-ink-extract", "pbr-weathering", "manifold-grounding"], primitiveCount: 4, estimatedCostMs: 0.4, deterministicHash: computeDeterministicDigest(`bom|${sig}|${elements.length}`).slice(0, 10), status: "illustrative" },
  ];

  const dagIntegrity = verifyDagAcyclicity(dagPipeline);
  const certShort = computeDeterministicDigest(`cert|${dagIntegrity.graphDigest}|${params.seed}`).slice(0, 12).toUpperCase();
  const rightsBomCertificate: RightsBomCleanCertificate = {
    schemaVersion: "toonstudio.procedural-provenance-note.v1",
    certificateId: `TS-PROC-NOTE-${certShort}`,
    licenseClass: "unknown",
    externalCopyrightContamination: "not-assessed",
    commercialWebtoonRedistributionAllowed: false,
    aiTrainingDatasetDependency: "not-assessed",
    thirdPartyAssetDependencies: [],
    generatorProvenance: { engine: "ToonStudio Procedural Asset Synthesizer", prng: "mulberry32-u32", recipeId: recipe.id, seed: params.seed, complexityLod: params.complexityLod, graphDigest: dagIntegrity.graphDigest, reproducible: true },
    externalRedistributionWarningKo:
      "이 기록은 로컬 SVG 생성 이력이며 CC0 지정·상업 재배포 허가·서명 검증이 아니다. 권리 상태는 미확인이다. Fab·Quixel Megascans 등 외부 에셋은 개별 사용 조건과 기존 Rights BOM 납품 검사를 별도로 확인해야 한다.",
    externalRedistributionWarningEn:
      "This is local SVG provenance, not a CC0 dedication, commercial clearance, or verified signature. Rights remain unknown. Check individual terms for external assets such as Fab or Quixel Megascans and use the existing Rights BOM delivery gate separately.",
    auditChecklist: { zeroExternalStockScan: "not-run", deterministicSeedReproducible: true, manifoldWatertightVerified: false, commercialWebtoonCleared: false },
    authority: { rightsRegistryChecked: false, exportGateGranted: false, signatureVerified: false },
  };

  return {
    recipe, harmony, params, dagPipeline, dagIntegrity,
    svgScene: { width: SYNTH_SVG_WIDTH, height: SYNTH_SVG_HEIGHT, backgroundOklch: formatOklch(harmony.paperBg), elements, lineartElementCount, detailElementCount, weatheringElementCount },
    mesh3dSummary, pbrMaterialStats, rightsBomCertificate,
  };
}

const escapeXml = (s: string): string => s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const pointsToString = (pts: readonly Vec2[]): string => pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(" ");

/** 채널(통합/LT 선화/PBR 법선·거칠기)에 맞춰 SVG 요소 표시 속성을 계산. */
export function resolveChannelElementStyle(
  el: SvgPrimitiveElement, channel: PreviewChannelId, harmony: PigmentHarmonySpec, lineWeightPx: number,
): { readonly visible: boolean; readonly fill: string; readonly stroke: string; readonly strokeWidth: number; readonly opacity: number } {
  if (channel === "composite") {
    if (el.layer === "pbr-normal" || el.layer === "pbr-roughness") return { visible: false, fill: "none", stroke: "none", strokeWidth: 0, opacity: 0 };
    return { visible: true, fill: el.kind === "line" ? "none" : el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, opacity: el.opacity ?? 1 };
  }
  if (channel === "lt-lineart") {
    if (el.layer === "pbr-normal" || el.layer === "pbr-roughness") return { visible: false, fill: "none", stroke: "none", strokeWidth: 0, opacity: 0 };
    return { visible: true, fill: "none", stroke: formatOklch(harmony.inkStroke), strokeWidth: el.layer === "weathering" ? r2(Math.max(0.55, lineWeightPx * 0.55)) : r2(Math.max(0.75, el.strokeWidth)), opacity: el.layer === "weathering" ? 0.55 : 0.95 };
  }
  const fill = el.layer === "pbr-normal" ? formatOklch(harmony.normalSlopeHigh, 0.54) : el.layer === "weathering" ? formatOklch(harmony.roughnessCue, 0.78) : el.layer === "base" ? formatOklch(harmony.normalSlopeLow, 0.34) : "none";
  const stroke = el.layer === "weathering" ? formatOklch(harmony.roughnessCue) : formatOklch(harmony.normalSlopeHigh);
  return { visible: true, fill: el.kind === "line" ? "none" : fill, stroke, strokeWidth: r2(Math.max(0.75, el.strokeWidth * 0.9)), opacity: el.opacity ?? 0.92 };
}

/** 독립 인쇄·웹툰 임포트용 순수 벡터 SVG 마크업 직렬화(탈-바이올렛 OKLCH 전용). */
export function exportSynthesizedAssetSvg(result: ProceduralAssetSynthResult, channelOverride?: PreviewChannelId): string {
  assertSynthesizedResult(result, synthesizeProceduralAsset);
  const ch = channelOverride ?? result.params.previewChannel;
  if (!["composite", "lt-lineart", "pbr-normal-roughness"].includes(ch)) throw new RangeError("지원하지 않는 SVG 채널입니다.");
  const bg = ch === "lt-lineart" ? formatOklch(ok(0.985, 0.004, 86)) : ch === "pbr-normal-roughness" ? formatOklch(ok(0.22, 0.025, 222)) : result.svgScene.backgroundOklch;
  const rows: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.svgScene.width} ${result.svgScene.height}" width="${result.svgScene.width}" height="${result.svgScene.height}" data-schema="toonstudio.procedural-asset-svg.v1" data-recipe-id="${result.recipe.id}" data-seed="${result.params.seed}" data-lod="${result.params.complexityLod}" data-channel="${ch}" data-license-class="${result.rightsBomCertificate.licenseClass}" data-certificate-id="${result.rightsBomCertificate.certificateId}" data-violet-free="true">`,
    `  <title>${escapeXml(`${result.recipe.nameEn} (Seed ${result.params.seed}, Procedural SVG · Rights Unreviewed)`)}</title>`,
    `  <desc>${escapeXml(`${result.rightsBomCertificate.certificateId} | ${result.rightsBomCertificate.externalRedistributionWarningEn}`)}</desc>`,
    `  <rect x="0" y="0" width="${result.svgScene.width}" height="${result.svgScene.height}" fill="${bg}" />`,
  ];
  for (const el of result.svgScene.elements) {
    const st = resolveChannelElementStyle(el, ch, result.harmony, result.params.lineWeightPx);
    if (!st.visible) continue;
    const op = st.opacity < 0.99 ? ` opacity="${st.opacity.toFixed(2)}"` : "";
    const dash = "dashArray" in el && el.dashArray ? ` stroke-dasharray="${el.dashArray}"` : "";
    if (el.kind === "rect") rows.push(`  <rect id="${el.id}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"${el.rx ? ` rx="${el.rx}"` : ""} fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${op}${dash} />`);
    else if (el.kind === "circle") rows.push(`  <circle id="${el.id}" cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${op}${dash} />`);
    else if (el.kind === "polygon") rows.push(`  <polygon id="${el.id}" points="${pointsToString(el.points)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${op} />`);
    else if (el.kind === "line") rows.push(`  <line id="${el.id}" x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${op}${dash} />`);
    else rows.push(`  <path id="${el.id}" d="${el.d}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${op}${dash} />`);
  }
  rows.push("</svg>");
  return rows.join("\n");
}

/** 로컬 생성 이력·DAG·미생성 3D/PBR 가정값을 포함한 JSON 매니페스트 직렬화. */
export function exportProceduralAssetManifestJson(result: ProceduralAssetSynthResult): string {
  assertSynthesizedResult(result, synthesizeProceduralAsset);
  return JSON.stringify(
    {
      schema: "toonstudio.procedural-asset-manifest.v1",
      evidence: { generatedOutputs: ["svg"], meshGenerated: false, pbrMapsGenerated: false, dagRuntimeExecuted: false, seamlessVerified: false, timingMeasured: false, vramMeasured: false, canvasApplied: false, persisted: false, numericMetadata: "illustrative-estimates" },
      recipe: { id: result.recipe.id, nameKo: result.recipe.nameKo, nameEn: result.recipe.nameEn, categoryEn: result.recipe.categoryEn },
      parameters: result.params,
      pigmentHarmony: { id: result.harmony.id, nameKo: result.harmony.nameKo, nameEn: result.harmony.nameEn, violetFree: true },
      dagIntegrity: result.dagIntegrity,
      dagPipeline: result.dagPipeline,
      mesh3dSummary: result.mesh3dSummary,
      pbrMaterialStats: result.pbrMaterialStats,
      svgStats: { width: result.svgScene.width, height: result.svgScene.height, totalElements: result.svgScene.elements.length, lineartElementCount: result.svgScene.lineartElementCount, detailElementCount: result.svgScene.detailElementCount, weatheringElementCount: result.svgScene.weatheringElementCount },
      rightsBomCertificate: result.rightsBomCertificate,
    },
    null,
    2,
  );
}
