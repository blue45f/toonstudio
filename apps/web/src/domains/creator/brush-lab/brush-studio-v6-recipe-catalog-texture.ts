/**
 * 텍스처 활용 기본 프리셋 세트 (brush texture wave).
 *
 * 근거: brush-textures ANALYSIS §1 — PhotoCraft 내장 프리셋은 에셋이 아니라
 * "패턴 스타일 × 텍스처 섹션(결합 모드·깊이·레벨)"의 파라미터 조합이다.
 * 이 파일은 같은 방식을 우리 파라미터로 옮긴 기본 프리셋 6종이다. 질감의 실체는
 * 전부 기존 배선을 탄다:
 *
 * - 패턴: `studio-brush-pattern-r8-grain-assets`가 구운 R8 타일(내용 주소 해시).
 * - 결합: `studio-brush-texture-combine-v1`의 모드·레벨·dab 깊이 지터.
 * - 획 경로: `studio-brush-material-dynamics` 그레인 정규화 → R8 합성
 *   (`composeStudioBrushR8TipPaperAlphaMap`)이 실제 획과 같은 함수다.
 *
 * 프리셋별 질감 미리보기(`composeBrushStudioV6TextureRecipePreviewV1`)는 장식용
 * 근사가 아니라 실제 획 합성과 **같은 compose 함수·같은 타일 바이트·같은 정규화
 * 설정**으로 균일 커버리지 dab을 합성한 결과라, 미리보기와 실제 획의 질감이
 * 구조적으로 일치한다.
 *
 * v6 시드(슬롯·튜닝)는 셸프/검색 표면용이고, 질감 파라미터의 정본은
 * `BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS`다. 두 목록은 recipeId로 1:1 대응한다.
 */

import {
  bakeStudioBrushPatternR8GrainTileV1,
  type StudioBrushPatternR8GrainBakeV1,
  type StudioBrushPatternStyleIdV1,
} from "../brush/studio-brush-pattern-r8-grain-assets";
import {
  normalizeStudioBrushGrainSettings,
  type NormalizedStudioBrushGrainSettings,
  type StudioBrushGrainSpace,
} from "../brush/studio-brush-material-dynamics";
import {
  StudioBrushR8GrainRegistry,
  composeStudioBrushR8TipPaperAlphaMap,
} from "../brush/studio-brush-r8-grain-runtime";

import type { StudioBrushTextureSettingsV1 } from "../brush/studio-brush-texture-combine-v1";
import type { StudioBrushTipAlphaMap } from "../brush/studio-brush-tip-stamp";

import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

export const BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP = "텍스처" as const;

// ---------------------------------------------------------------------------
// v6 시드 — 셸프·검색에 노출되는 표면. 슬롯 ID는 엔진 노드 카탈로그에 실재하는
// 것만 쓴다(무효 ID는 normalize가 조용히 기본값으로 대체하므로 테스트로 고정).
// ---------------------------------------------------------------------------

export const BRUSH_STUDIO_V6_TEXTURE_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] =
  Object.freeze([
    defineBrushStudioV6RecipeSeed(
      "texture-chalk",
      "분필 질감",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "노이즈 패턴을 height 결합으로 눌러 골에만 분필 가루가 앉는 질감. 가볍게 긋면 끊기고 세게 누르면 면이 찬다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-chalk)와 연동.",
      {
        slots: {
          carrier: "carrier-libmypaint-dabs",
          tip: "tip-grain-exemplar",
          surface: "surface-printmaking",
          deposition: "deposit-dry",
          physics: ["physics-dry-contact"],
          finish: ["finish-grain"],
          output: "output-contact-canvas-svg",
        },
        tuning: { size: 22, surfaceTooth: 0.7, friction: 0.55, granulation: 0.65 },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "texture-canvas-oil",
      "캔버스 유화",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "캔버스 직조 패턴을 overlay 결합으로 얹어 실의 올이 안료 위로 드러나는 유화. 두껍게 쌓을수록 직조가 또렷해진다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-canvas-oil)와 연동.",
      {
        slots: {
          motion: "motion-brush-inertia",
          carrier: "carrier-krita-hairy",
          tip: "tip-pigment-normal",
          surface: "surface-linen",
          deposition: "deposit-oil",
          pickup: "pickup-pigment-reservoir",
          pigment: "pigment-open-km",
          physics: ["physics-bristle", "physics-height"],
          finish: ["finish-relief"],
          output: "output-contact-canvas-svg",
        },
        tuning: {
          size: 46,
          viscosity: 0.7,
          plasticity: 0.55,
          relief: 0.5,
          gloss: 0.5,
          reservoir: 0.6,
          bristleStrands: 72,
        },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "texture-halftone-tone",
      "망점 톤",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "망점 도트 패턴을 height 결합으로 읽어 도트 중심(패턴 골)에만 잉크가 닿는 톤 브러시. 문서 좌표 고정이라 확대·이동에도 위상이 흔들리지 않는다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-halftone-tone)와 연동.",
      {
        slots: {
          motion: "motion-direct",
          carrier: "carrier-webgpu-centerline",
          tip: "tip-round-sdf",
          surface: "surface-kent",
          deposition: "deposit-ink",
          pattern: "pattern-dot-tone",
          output: "output-contact-canvas-svg",
        },
        tuning: { size: 40, patternDensity: 0.7, patternScale: 0.9, patternJitter: 0.02 },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "texture-rough-charcoal",
      "거친 목탄",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "낮은 깊이의 height 결합과 큰 깊이 흔들림으로 획마다 닿는 면이 달라지는 거친 목탄. 종이 골에만 가루가 남아 옆으로 문지르면 번진다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-rough-charcoal)와 연동.",
      {
        slots: {
          carrier: "carrier-libmypaint-dabs",
          tip: "tip-krita-dual",
          surface: "surface-printmaking",
          deposition: "deposit-dry",
          pickup: "pickup-krita-smudge",
          physics: ["physics-dry-contact"],
          finish: ["finish-grain"],
          output: "output-contact-canvas-svg",
        },
        tuning: { size: 30, surfaceTooth: 0.9, friction: 0.68, granulation: 0.85, pickup: 0.25 },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "texture-fibre-pencil",
      "종이 섬유 연필",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "종이 섬유 패턴을 linear-height 결합으로 읽어 섬유 결을 따라 흑연이 걸리는 연필. 가벼운 해칭에서 결이 가장 잘 드러난다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-fibre-pencil)와 연동.",
      {
        slots: {
          carrier: "carrier-webgpu-ribbon",
          tip: "tip-grain-exemplar",
          surface: "surface-coldpress",
          deposition: "deposit-dry",
          physics: ["physics-dry-contact"],
          finish: ["finish-grain"],
          output: "output-contact-canvas-svg",
        },
        tuning: { size: 13, surfaceTooth: 0.6, friction: 0.5, granulation: 0.55 },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "texture-granule-wash",
      "과립 워시",
      BRUSH_STUDIO_V6_TEXTURE_RECIPE_GROUP,
      "노이즈 패턴을 subtract 결합으로 덜어내 안료가 과립처럼 빠져나간 자리가 남는 워시. 물이 마른 뒤의 침전 질감을 가볍게 흉내 낸다. 텍스처 스펙은 BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS(texture-granule-wash)와 연동.",
      {
        slots: {
          carrier: "carrier-hokusai-dabs",
          surface: "surface-porous",
          deposition: "deposit-wet",
          pigment: "pigment-spectral",
          physics: ["physics-porous-paper"],
          finish: ["finish-edge-bloom", "finish-grain"],
          output: "output-contact-canvas-svg",
        },
        tuning: { size: 38, wetness: 0.55, absorbency: 0.6, granulation: 0.7, edgeDarkening: 0.3 },
      },
    ),
  ]);

// ---------------------------------------------------------------------------
// 텍스처 스펙 — 질감 파라미터의 정본. 값 규율:
// - texture.depth가 그레인 amount와 같은 값으로 정규화에 함께 들어간다
//   (텍스처 없는 소비자에게도 같은 세기의 그레인으로 읽힌다).
// - depth/minimumDepth/depthJitter는 결합 모듈 제한(0..1) 안, brightness·
//   contrast는 레벨 제한(-1..1) 안의 값만 쓴다 — 정규화가 값을 바꾸지 않음을
//   테스트로 고정한다.
// ---------------------------------------------------------------------------

export interface BrushStudioV6TextureRecipeSpec {
  readonly recipeId: string;
  /** R8 패턴 타일 스타일 — 베이커가 내용 주소 소스를 만든다. */
  readonly patternStyleId: StudioBrushPatternStyleIdV1;
  readonly grainSpace: StudioBrushGrainSpace;
  /** 문서 공간에서 패턴 타일 한 장이 차지하는 CSS px (R8 샘플러 scale). */
  readonly grainScale: number;
  /** 그레인 대비 0..1 — 결합 전에 패턴 필드를 미는 양. */
  readonly grainContrast: number;
  readonly grainSeed: number;
  /** 결합 모듈 텍스처 섹션. depth는 필수로 명시한다(amount 주입에 기대지 않음). */
  readonly texture: Readonly<StudioBrushTextureSettingsV1>;
}

function defineTextureRecipeSpec(
  spec: BrushStudioV6TextureRecipeSpec,
): BrushStudioV6TextureRecipeSpec {
  return Object.freeze({ ...spec, texture: Object.freeze({ ...spec.texture }) });
}

export const BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS: readonly BrushStudioV6TextureRecipeSpec[] =
  Object.freeze([
    defineTextureRecipeSpec({
      recipeId: "texture-chalk",
      patternStyleId: "noise",
      grainSpace: "canvas-fixed",
      grainScale: 96,
      grainContrast: 0.35,
      grainSeed: 2_026_101_401,
      texture: {
        mode: "height",
        depth: 0.06,
        depthJitter: 0.35,
        minimumDepth: 0.4,
        brightness: 0,
        contrast: 0.15,
        invert: false,
      },
    }),
    defineTextureRecipeSpec({
      recipeId: "texture-canvas-oil",
      patternStyleId: "canvas-weave",
      grainSpace: "canvas-fixed",
      grainScale: 128,
      grainContrast: 0.3,
      grainSeed: 2_026_101_402,
      texture: {
        mode: "overlay",
        depth: 0.45,
        depthJitter: 0.15,
        minimumDepth: 0.6,
        brightness: 0.05,
        contrast: 0.1,
        invert: false,
      },
    }),
    defineTextureRecipeSpec({
      recipeId: "texture-halftone-tone",
      patternStyleId: "halftone-dots",
      grainSpace: "canvas-fixed",
      grainScale: 64,
      grainContrast: 0.4,
      grainSeed: 2_026_101_403,
      // 도트 필드는 중심이 0(골)·배경이 1이다. height 결합은 골에만 잉크를
      // 남기므로 reach(12·depth ≈ 0.85) 미만의 배경은 전부 0이 되고
      // 도트 중심만 reach만큼 찍힌다 — 깊이 지터 0으로 톤을 안정시킨다.
      texture: {
        mode: "height",
        depth: 0.07,
        depthJitter: 0,
        minimumDepth: 1,
        brightness: 0,
        contrast: 0.1,
        invert: false,
      },
    }),
    defineTextureRecipeSpec({
      recipeId: "texture-rough-charcoal",
      patternStyleId: "noise",
      grainSpace: "canvas-fixed",
      grainScale: 72,
      grainContrast: 0.45,
      grainSeed: 2_026_101_404,
      texture: {
        mode: "height",
        depth: 0.045,
        depthJitter: 0.5,
        minimumDepth: 0.3,
        brightness: -0.05,
        contrast: -0.1,
        invert: false,
      },
    }),
    defineTextureRecipeSpec({
      recipeId: "texture-fibre-pencil",
      patternStyleId: "paper-fibre",
      grainSpace: "canvas-fixed",
      grainScale: 110,
      grainContrast: 0.3,
      grainSeed: 2_026_101_405,
      texture: {
        mode: "linear-height",
        depth: 0.07,
        depthJitter: 0.25,
        minimumDepth: 0.5,
        brightness: 0,
        contrast: 0.1,
        invert: false,
      },
    }),
    defineTextureRecipeSpec({
      recipeId: "texture-granule-wash",
      patternStyleId: "noise",
      grainSpace: "canvas-fixed",
      grainScale: 150,
      grainContrast: 0.4,
      grainSeed: 2_026_101_406,
      texture: {
        mode: "subtract",
        depth: 0.5,
        depthJitter: 0.3,
        minimumDepth: 0.5,
        brightness: 0.1,
        contrast: 0,
        invert: false,
      },
    }),
  ]);

const SPEC_BY_RECIPE_ID: ReadonlyMap<string, BrushStudioV6TextureRecipeSpec> = new Map(
  BRUSH_STUDIO_V6_TEXTURE_RECIPE_SPECS.map((spec) => [spec.recipeId, spec]),
);

export function brushStudioV6TextureRecipeSpec(
  recipeId: string,
): BrushStudioV6TextureRecipeSpec | null {
  return SPEC_BY_RECIPE_ID.get(recipeId) ?? null;
}

// ---------------------------------------------------------------------------
// 런타임 해석 — 스펙 → (베이크된 패턴 타일, 정규화 그레인 설정).
// 베이크는 스타일별 결정적이라 레시피 단위로 캐시한다.
// ---------------------------------------------------------------------------

interface BrushStudioV6TextureRecipeRuntime {
  readonly spec: BrushStudioV6TextureRecipeSpec;
  readonly bake: StudioBrushPatternR8GrainBakeV1;
  readonly grain: NormalizedStudioBrushGrainSettings;
}

const runtimeCache = new Map<string, BrushStudioV6TextureRecipeRuntime>();

function resolveTextureRecipeRuntime(
  recipeId: string,
): BrushStudioV6TextureRecipeRuntime | null {
  const cached = runtimeCache.get(recipeId);
  if (cached) return cached;
  const spec = brushStudioV6TextureRecipeSpec(recipeId);
  if (!spec) return null;
  const bake = bakeStudioBrushPatternR8GrainTileV1(spec.patternStyleId);
  const grain = normalizeStudioBrushGrainSettings({
    space: spec.grainSpace,
    amount: spec.texture.depth ?? 0,
    scale: spec.grainScale,
    contrast: spec.grainContrast,
    seed: spec.grainSeed,
    source: bake.source,
    texture: spec.texture,
  });
  const runtime: BrushStudioV6TextureRecipeRuntime = { spec, bake, grain };
  runtimeCache.set(recipeId, runtime);
  return runtime;
}

/**
 * 프리셋의 실제 획 그레인 설정. source는 패턴 타일의 내용 주소 참조이고
 * texture 섹션은 결합 모듈이 해석한다 — 에디터 획 경로는 이 값을 그대로
 * `composeStudioBrushR8TipPaperAlphaMap`/다이내믹스 해석기에 넘기면 된다.
 * 알 수 없는 recipeId는 null(폴백 없음 — 호출자가 기본 브러시를 고른다).
 */
export function brushStudioV6TextureRecipeGrainSettings(
  recipeId: string,
): NormalizedStudioBrushGrainSettings | null {
  return resolveTextureRecipeRuntime(recipeId)?.grain ?? null;
}

// ---------------------------------------------------------------------------
// 질감 미리보기 — 실제 획 합성과 같은 compose 함수를 그대로 쓴다.
// 전용 레지스트리를 써서 공유 레지스트리의 예산·항목을 건드리지 않는다.
// ---------------------------------------------------------------------------

const previewRegistry = new StudioBrushR8GrainRegistry();

export interface BrushStudioV6TextureRecipePreviewOptions {
  /** 미리보기 dab 한 변(px). 기본 48, 8..128로 클램프. */
  readonly size?: number;
  /** 균일 팁 커버리지 0..1. 기본 1. */
  readonly coverage?: number;
  /** dab 중심의 문서 좌표. 기본은 dab 한가운데(패턴 위상 0 지점). */
  readonly centerX?: number;
  readonly centerY?: number;
  /** 획 시드. 기본은 프리셋 grainSeed. */
  readonly strokeSeed?: number;
  /** dab 순번(깊이 지터용). 기본 0. */
  readonly dabIndex?: number;
}

function clampPreviewSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 48;
  return Math.min(128, Math.max(8, Math.trunc(value)));
}

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/**
 * 프리셋 질감 미리보기 dab 알파맵. 균일 커버리지 팁을 실제 획 합성 함수에
 * 통과시킨 결과라, 반환값의 텍셀 = 같은 위치에 실제 dab이 찍혔을 때의 알파다.
 * 알 수 없는 recipeId나 타일 하이드레이션 실패 시 null.
 */
export function composeBrushStudioV6TextureRecipePreviewV1(
  recipeId: string,
  options?: BrushStudioV6TextureRecipePreviewOptions,
): StudioBrushTipAlphaMap | null {
  const runtime = resolveTextureRecipeRuntime(recipeId);
  if (!runtime) return null;
  const hydration = previewRegistry.hydrate(runtime.bake.source, runtime.bake.decodedBytes);
  if (hydration.status !== "ready") return null;
  const sampler = previewRegistry.resolve(runtime.bake.source);
  if (!sampler) return null;
  const size = clampPreviewSize(options?.size);
  const coverage = clamp01(options?.coverage, 1);
  const tip: StudioBrushTipAlphaMap = {
    size,
    alphas: new Float32Array(size * size).fill(coverage),
    shape: "round",
    softness: 0,
    custom: true,
    revision: `texture-recipe-preview:${recipeId}:${size}:${coverage}`,
  };
  return composeStudioBrushR8TipPaperAlphaMap({
    tip,
    sampler,
    grain: runtime.grain,
    centerX: options?.centerX ?? size / 2,
    centerY: options?.centerY ?? size / 2,
    radiusX: size / 2,
    radiusY: size / 2,
    angleRadians: 0,
    strokeOriginX: 0,
    strokeOriginY: 0,
    strokeSeed: options?.strokeSeed ?? runtime.spec.grainSeed,
    dabIndex: options?.dabIndex ?? 0,
  });
}
