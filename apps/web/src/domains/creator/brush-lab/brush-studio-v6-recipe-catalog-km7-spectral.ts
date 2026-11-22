/**
 * 100% 클린룸 7밴드 분광 Kubelka-Munk 회화 브러시 프리셋 5종 팩.
 *
 * - 유화 임파스토 브리슬 · 과슈 불투명 플랫 · 수채화 웻-엣지 블룸 · 아크릴 소프트 혼색 · 건식 파스텔.
 * - 5종 모두 `internal` 또는 `permissive` 노드만 사용해 기본 상용 권리 프로필(`permissive-only`)에서
 *   차단 없이 즉시 실체화된다(`mixbox`·copyleft·private-grant 노드 0건).
 * - `brush-studio-v6-recipe-catalog.ts` → `STUDIO_V6_BRUSH_CATALOG_ITEMS` → `StudioBrushLibraryPanel`
 *   실제 스튜디오 브러시 라이브러리 및 전역 검색 진입점에 직결된다.
 */

import type {
  BrushStudioV6InputPolicy,
  BrushStudioV6QualityGoal,
  BrushStudioV6Slots,
  BrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import { defineBrushStudioV6RecipeSeed, type BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

export interface BrushStudioKm7OpticalProfile {
  readonly spectralBands: 7;
  readonly chromaPreserve: number;
  readonly glazeMode: boolean;
  readonly edgeRingStrength: number;
  readonly impastoRelief: number;
  readonly bristleFurrow: number;
  readonly paperGrainDepth: number;
  readonly wetPickup: number;
}

export interface BrushStudioKm7SpectralPresetSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly group: string;
  readonly descriptionKo: string;
  readonly qualityGoal: BrushStudioV6QualityGoal;
  readonly slots: Partial<BrushStudioV6Slots>;
  readonly input?: Partial<BrushStudioV6InputPolicy>;
  readonly tuning: Partial<BrushStudioV6Tuning>;
  readonly km7Optics: BrushStudioKm7OpticalProfile;
}

export const BRUSH_STUDIO_V6_KM7_SPECTRAL_SPECS: readonly BrushStudioKm7SpectralPresetSpec[] =
  Object.freeze([
    Object.freeze({
      id: "km7-oil-impasto-bristle",
      labelKo: "유화 임파스토 브리슬 · 7밴드 분광",
      labelEn: "Oil Impasto Bristle · 7-Band Spectral KM",
      group: "분광 안료 회화",
      descriptionKo:
        "7밴드 분광 Kubelka-Munk 감산 혼색, 리넨 캔버스 요철, 강모 다발과 임파스토 높이 부조 음영을 결합한 상용 안전 유화 브러시.",
      qualityGoal: "material",
      slots: {
        motion: "motion-brush-inertia",
        carrier: "carrier-webgpu-ribbon",
        tip: "tip-grain-exemplar",
        surface: "surface-linen",
        deposition: "deposit-oil",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-km7-spectral",
        physics: ["physics-bristle", "physics-bristle-split-merge", "physics-height"],
        pattern: "pattern-none",
        finish: ["finish-relief", "finish-directional-relief"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.03,
        pressureSaturation: 0.94,
        pressureGamma: 0.85,
        tiltEnabled: true,
        tiltSmoothing: 0.2,
      },
      tuning: {
        size: 52,
        opacity: 0.98,
        flow: 0.88,
        spacing: 0.08,
        pickup: 0.64,
        reservoir: 0.86,
        wetness: 0.56,
        viscosity: 0.86,
        plasticity: 0.74,
        surfaceTooth: 0.58,
        bristleStrands: 96,
        bristleIterations: 5,
        relief: 0.78,
        gloss: 0.54,
        primaryColor: "#003594",
        secondaryColor: "#ffd200",
      },
      km7Optics: Object.freeze({
        spectralBands: 7,
        chromaPreserve: 0.4,
        glazeMode: false,
        edgeRingStrength: 0,
        impastoRelief: 0.78,
        bristleFurrow: 0.72,
        paperGrainDepth: 0.45,
        wetPickup: 0.64,
      }),
    }),
    Object.freeze({
      id: "km7-gouache-opaque-flat",
      labelKo: "과슈 불투명 플랫 · 7밴드 분광",
      labelEn: "Gouache Opaque Flat · 7-Band Spectral KM",
      group: "분광 안료 회화",
      descriptionKo:
        "납작한 치즐 플랫 촉과 높은 은폐력, 무광 벨벳 질감과 7밴드 분광 감산 혼색으로 선명한 색면을 쌓는 불투명 과슈 브러시.",
      qualityGoal: "material",
      slots: {
        motion: "motion-adaptive-ema",
        carrier: "carrier-webgpu-ribbon",
        tip: "tip-chisel-sdf",
        surface: "surface-kent",
        deposition: "deposit-oil",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-km7-spectral",
        physics: ["physics-barrel-twist-chisel", "physics-porous-paper"],
        pattern: "pattern-none",
        finish: ["finish-grain"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.02,
        pressureSaturation: 0.92,
        pressureGamma: 0.9,
        tiltEnabled: true,
        tiltSmoothing: 0.16,
      },
      tuning: {
        size: 36,
        opacity: 0.97,
        flow: 0.94,
        spacing: 0.07,
        pickup: 0.34,
        reservoir: 0.72,
        wetness: 0.32,
        viscosity: 0.62,
        plasticity: 0.44,
        surfaceTooth: 0.36,
        absorbency: 0.28,
        granulation: 0.2,
        relief: 0.14,
        gloss: 0.08,
        primaryColor: "#d93829",
        secondaryColor: "#f7c948",
      },
      km7Optics: Object.freeze({
        spectralBands: 7,
        chromaPreserve: 0.45,
        glazeMode: false,
        edgeRingStrength: 0.12,
        impastoRelief: 0.14,
        bristleFurrow: 0.24,
        paperGrainDepth: 0.36,
        wetPickup: 0.34,
      }),
    }),
    Object.freeze({
      id: "km7-watercolor-wet-edge-bloom",
      labelKo: "수채화 웻-엣지 블룸 · 7밴드 분광",
      labelEn: "Watercolor Wet-Edge Bloom · 7-Band Spectral KM",
      group: "분광 안료 회화",
      descriptionKo:
        "7밴드 광학 글레이징 투과, 콜드프레스 수채지 모세관 백런과 가장자리 안료 농축(웻-엣지 블룸)을 구현한 클린룸 수채 브러시.",
      qualityGoal: "material",
      slots: {
        motion: "motion-brush-inertia",
        carrier: "carrier-hokusai-dabs",
        tip: "tip-grain-exemplar",
        surface: "surface-coldpress",
        deposition: "deposit-watercolor",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-km7-spectral",
        physics: [
          "physics-porous-paper",
          "physics-backrun-capillary",
          "physics-pigment-sedimentation",
        ],
        pattern: "pattern-none",
        finish: ["finish-edge-bloom", "finish-wet-sheen"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 48,
        opacity: 0.68,
        flow: 0.58,
        spacing: 0.1,
        pickup: 0.38,
        wetness: 0.88,
        absorbency: 0.78,
        diffusion: 0.82,
        advection: 0.54,
        evaporation: 0.62,
        granulation: 0.76,
        edgeDarkening: 0.74,
        gloss: 0.22,
        primaryColor: "#1d4ed8",
        secondaryColor: "#facc15",
      },
      km7Optics: Object.freeze({
        spectralBands: 7,
        chromaPreserve: 0.38,
        glazeMode: true,
        edgeRingStrength: 0.74,
        impastoRelief: 0,
        bristleFurrow: 0.1,
        paperGrainDepth: 0.68,
        wetPickup: 0.38,
      }),
    }),
    Object.freeze({
      id: "km7-acrylic-soft-blend",
      labelKo: "아크릴 소프트 혼색 · 7밴드 분광",
      labelEn: "Acrylic Soft Blend · 7-Band Spectral KM",
      group: "분광 안료 회화",
      descriptionKo:
        "부드러운 원형 SDF 에지와 매끄러운 습윤 픽업, Oklab 채도 보존 7밴드 혼색으로 탁함 없이 그라데이션을 블렌딩하는 아크릴 브러시.",
      qualityGoal: "balanced",
      slots: {
        motion: "motion-spring",
        carrier: "carrier-webgpu-ribbon",
        tip: "tip-round-sdf",
        surface: "surface-linen",
        deposition: "deposit-oil",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-km7-spectral",
        physics: ["physics-porous-paper", "physics-thin-film", "physics-height"],
        pattern: "pattern-none",
        finish: ["finish-wet-sheen", "finish-subpixel-sdf-aa"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 44,
        opacity: 0.86,
        flow: 0.74,
        spacing: 0.06,
        pickup: 0.74,
        reservoir: 0.78,
        wetness: 0.72,
        viscosity: 0.52,
        plasticity: 0.56,
        surfaceTooth: 0.22,
        relief: 0.22,
        gloss: 0.38,
        primaryColor: "#2563eb",
        secondaryColor: "#fde047",
      },
      km7Optics: Object.freeze({
        spectralBands: 7,
        chromaPreserve: 0.42,
        glazeMode: false,
        edgeRingStrength: 0,
        impastoRelief: 0.22,
        bristleFurrow: 0.18,
        paperGrainDepth: 0.22,
        wetPickup: 0.74,
      }),
    }),
    Object.freeze({
      id: "km7-dry-pastel-chalk",
      labelKo: "건식 파스텔 · 7밴드 분광",
      labelEn: "Dry Pastel Chalk · 7-Band Spectral KM",
      group: "분광 안료 회화",
      descriptionKo:
        "판화지 거친 입자와 건식 마찰 접촉, 7밴드 분광 가루 안료 중첩으로 파스텔 특유의 보송한 발색과 색 섞임을 구현한 브러시.",
      qualityGoal: "material",
      slots: {
        motion: "motion-adaptive-ema",
        carrier: "carrier-libmypaint-dabs",
        tip: "tip-grain-exemplar",
        surface: "surface-printmaking",
        deposition: "deposit-dry",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-km7-spectral",
        physics: ["physics-dry-contact"],
        pattern: "pattern-none",
        finish: ["finish-grain"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 32,
        opacity: 0.84,
        flow: 0.72,
        spacing: 0.09,
        pickup: 0.46,
        wetness: 0.14,
        surfaceTooth: 0.92,
        friction: 0.78,
        granulation: 0.88,
        gloss: 0.04,
        primaryColor: "#f59e0b",
        secondaryColor: "#3b82f6",
      },
      km7Optics: Object.freeze({
        spectralBands: 7,
        chromaPreserve: 0.32,
        glazeMode: false,
        edgeRingStrength: 0,
        impastoRelief: 0.06,
        bristleFurrow: 0.12,
        paperGrainDepth: 0.92,
        wetPickup: 0.46,
      }),
    }),
  ]);

const KM7_SPEC_BY_ID = new Map<string, BrushStudioKm7SpectralPresetSpec>(
  BRUSH_STUDIO_V6_KM7_SPECTRAL_SPECS.map((spec) => [spec.id, spec]),
);

export function findBrushStudioKm7SpectralPresetSpec(
  brushOrRecipeId: unknown,
): BrushStudioKm7SpectralPresetSpec | null {
  if (typeof brushOrRecipeId !== "string" || brushOrRecipeId.length === 0) return null;
  const normalized = brushOrRecipeId.startsWith("v6:")
    ? brushOrRecipeId.slice(3)
    : brushOrRecipeId;
  return KM7_SPEC_BY_ID.get(normalized) ?? null;
}

export const BRUSH_STUDIO_V6_KM7_SPECTRAL_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] =
  Object.freeze(
    BRUSH_STUDIO_V6_KM7_SPECTRAL_SPECS.map((spec) =>
      defineBrushStudioV6RecipeSeed(spec.id, spec.labelKo, spec.group, spec.descriptionKo, {
        qualityGoal: spec.qualityGoal,
        ...(spec.input ? { input: spec.input } : {}),
        slots: spec.slots,
        tuning: spec.tuning,
      }),
    ),
  );
