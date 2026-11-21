/**
 * 한국 웹툰(K-Webtoon) 완성형 캐릭터 아키타입 10종 및 K-웹툰 조형·헤어·2단 셀 셰이딩 자동 검증 테스트.
 *
 * - 10종 아키타입 모두 실제 `buildHumanoidModel(..., { outfit: createOutfitBuilder() })`로 3D 메시를 생성해
 *   법선 단위성·바운딩·바닥 접지(Y=0)·매니폴드/수밀성·삼각형 예산·슬롯 어휘·셰이더 파라미터 정합성을 검증한다.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADING,
  LOOK_V2_IDENTITY,
  SLOT_PRESET_IDS,
  characterRecipeSchema,
  createDefaultRecipe,
  validateMeshPartData,
  type SlotKind,
} from "../contracts";
import { buildBodyCage } from "../domains/humanoid/geometry/cage";
import { buildHeadCage } from "../domains/humanoid/geometry/head-cage";
import { quadMeshEdgeStats } from "../domains/humanoid/geometry/quad-mesh";
import { triMeshBounds, triMeshIsWatertight } from "../domains/humanoid/geometry/tri-mesh";
import { TRIANGLE_BUDGET, buildHumanoidModel } from "../domains/humanoid/humanoid-model";
import { resolveProportions } from "../domains/humanoid/proportions";
import { createOutfitBuilder } from "../domains/outfit";
import {
  KWEBTOON_ARCHETYPE_IDS,
  KWEBTOON_ARCHETYPE_LIST,
  KWEBTOON_ARCHETYPE_PRESETS,
  composeKWebtoonArchetypeRecipe,
} from "../presets";
import {
  KWEBTOON_CELL_SHADING_PRESETS,
  isLookV2Identity,
  resolveKWebtoonFeatureParams,
  resolveKWebtoonOutlineColor,
  resolveLookRimColor,
  resolveLookShadeTint,
} from "../render/kwebtoon-shading";
import { toonShadeTint } from "../render/material-presets";
import { evaluateToon, type ToonFragmentInput, type ToonParams } from "../render/toon-reference";

const OUTFIT_BUILDER = createOutfitBuilder();

function isValidSlotPreset(slot: SlotKind, presetId: string): boolean {
  const prefix = `${slot}/`;
  if (!presetId.startsWith(prefix)) return false;
  const local = presetId.slice(prefix.length);
  const allowed = (SLOT_PRESET_IDS as Readonly<Record<string, readonly string[]>>)[slot];
  return Array.isArray(allowed) && allowed.includes(local);
}

describe("K-웹툰 완성형 캐릭터 아키타입 10종 · 3D 조형·법선·접지·매니폴드·셰이딩 통합 검증", () => {
  it("10종 아키타입 레시피가 모두 스키마 및 SLOT_PRESET_IDS 어휘를 통과한다", () => {
    expect(KWEBTOON_ARCHETYPE_IDS).toHaveLength(10);
    expect(KWEBTOON_ARCHETYPE_LIST).toHaveLength(10);
    const base = createDefaultRecipe();
    for (const preset of KWEBTOON_ARCHETYPE_LIST) {
      const recipe = composeKWebtoonArchetypeRecipe(preset.id, base);
      const parsed = characterRecipeSchema.safeParse(recipe);
      expect(parsed.success, `${preset.id} 스키마 검증`).toBe(true);
      for (const [slot, presetId] of Object.entries(preset.slots)) {
        if (!presetId) continue;
        expect(isValidSlotPreset(slot as SlotKind, presetId), `${preset.id} 슬롯 ${slot}=${presetId}`).toBe(true);
      }
      expect(recipe.shading.mode).toBe("toon");
      expect(recipe.shading.toon.rampSteps).toBe(2);
      expect(recipe.shading.toon.rim).toBe(true);
      expect(recipe.shading.toon.faceSdfShadow).toBe(true);
    }
  });

  it("10종 아키타입 전부 3D 빌드 시 단위 법선·유효 바운딩·Y=0 바닥 접지·매니폴드/수밀·예산 내를 만족한다", () => {
    const base = createDefaultRecipe();
    const heights = new Map<string, number>();

    for (const preset of KWEBTOON_ARCHETYPE_LIST) {
      const recipe = composeKWebtoonArchetypeRecipe(preset.id, base);
      const model = buildHumanoidModel(recipe, { subdivisionLevels: 1, seed: 42, outfit: OUTFIT_BUILDER });
      expect(model.parts.length, `${preset.id} 파츠 수`).toBeGreaterThanOrEqual(14);

      let totalTriangles = 0;
      let modelMinY = Number.POSITIVE_INFINITY;
      let modelMaxY = Number.NEGATIVE_INFINITY;

      for (const part of model.parts) {
        const failure = validateMeshPartData(part);
        expect(failure, `${preset.id}/${part.id}: ${failure?.reasonKo ?? ""}`).toBeNull();
        totalTriangles += part.indices.length / 3;

        // 모든 정점 법선이 유한하고 단위 길이(|n| ≈ 1)인지 검증
        for (let i = 0; i < part.normals.length; i += 3) {
          const nx = part.normals[i]!;
          const ny = part.normals[i + 1]!;
          const nz = part.normals[i + 2]!;
          expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
          expect(Math.abs(Math.hypot(nx, ny, nz) - 1), `${preset.id}/${part.id} normal@${i / 3}`).toBeLessThan(1e-3);
        }

        const bounds = triMeshBounds(part.positions);
        expect(Number.isFinite(bounds.min[1]) && Number.isFinite(bounds.max[1])).toBe(true);
        modelMinY = Math.min(modelMinY, bounds.min[1]);
        modelMaxY = Math.max(modelMaxY, bounds.max[1]);

        // 핵심 바디·머리·안구 메시의 수밀성(Watertight Manifold) 검증
        if (part.role === "skin" || part.role === "head" || part.role === "eyeball") {
          expect(triMeshIsWatertight(part.positions, part.indices), `${preset.id}/${part.id} watertight`).toBe(true);
        }
      }

      // 삼각형 예산 준수
      expect(totalTriangles, `${preset.id} triangles`).toBeLessThanOrEqual(TRIANGLE_BUDGET);

      // 베이스 케이지 매니폴드 검증(비다양체 간선 0, 불일치 간선 0, 고립 정점 0)
      const headStats = quadMeshEdgeStats(buildHeadCage(recipe.body, recipe.style.proportion).mesh);
      const bodyStats = quadMeshEdgeStats(buildBodyCage(recipe.body, recipe.style.proportion).mesh);
      expect(headStats.nonManifoldEdges, `${preset.id} head non-manifold`).toBe(0);
      expect(headStats.inconsistentEdges, `${preset.id} head inconsistent`).toBe(0);
      expect(bodyStats.nonManifoldEdges, `${preset.id} body non-manifold`).toBe(0);
      expect(bodyStats.inconsistentEdges, `${preset.id} body inconsistent`).toBe(0);

      // 바닥 접지(Y = 0): 맨발 피부 바닥이 Y=0에 접지하고, 신발 포함 모델도 바닥면 근방에 안정적으로 접지
      const skinPart = model.parts.find((part) => part.role === "skin");
      expect(skinPart).toBeDefined();
      const skinBounds = triMeshBounds(skinPart!.positions);
      expect(Math.abs(skinBounds.min[1]), `${preset.id} skin Y=0 grounding`).toBeLessThan(0.015);
      expect(modelMinY, `${preset.id} model minY`).toBeGreaterThan(-0.06);
      expect(modelMinY, `${preset.id} model minY <= 0.02`).toBeLessThanOrEqual(0.02);
      expect(modelMaxY - modelMinY, `${preset.id} height`).toBeGreaterThan(0.75);

      const prop = resolveProportions(recipe.body, recipe.style.proportion);
      heights.set(preset.id, prop.height);
    }

    // 등신 비례 확인: 귀염 SD 마스코트(3.5등신)가 북부 대공(8.8등신)·로판 황녀(7.8등신)보다 현저히 컴팩트하다
    expect(heights.get("kwebtoon-sd-mascot")!).toBeLessThan(heights.get("kwebtoon-rofan-princess")! * 0.88);
    expect(heights.get("kwebtoon-northern-duke")!).toBeGreaterThan(heights.get("kwebtoon-academy-heroine")!);
  }, 30_000);

  it("10종 아키타입의 2단 셀 음영(따뜻한 피부 그림자)·림·유색 선화·얼굴 블러셔/홍채 셰이더 파라미터가 정합적이다", () => {
    const base = createDefaultRecipe();
    expect(isLookV2Identity(LOOK_V2_IDENTITY)).toBe(true);
    expect(resolveLookShadeTint("head", "#f3d3bd", LOOK_V2_IDENTITY)).toEqual(toonShadeTint("head"));
    expect(resolveLookRimColor(LOOK_V2_IDENTITY)).toEqual([0.35, 0.35, 0.4]);
    expect(resolveKWebtoonFeatureParams("head", { ...DEFAULT_SHADING, mode: "toon" })).toEqual({
      faceMakeupIntensity: 0,
      irisGradientIntensity: 0,
      lipTintIntensity: 0,
      cheekBlushIntensity: 0,
    });

    for (const preset of KWEBTOON_ARCHETYPE_LIST) {
      const recipe = composeKWebtoonArchetypeRecipe(preset.id, base);
      const look = recipe.shading.look;
      expect(isLookV2Identity(look), `${preset.id} K-웹툰 확장 Look`).toBe(false);

      // 따뜻한 복숭아/장미 피부 그림자(r > g, r > b — 탁한 회색 그림자 금지)
      const skinShade = resolveLookShadeTint("head", recipe.colors.skin, look);
      expect(skinShade[0], `${preset.id} skinShade.r > g`).toBeGreaterThan(skinShade[1] + 0.15);
      expect(skinShade[0], `${preset.id} skinShade.r > b`).toBeGreaterThan(skinShade[2] + 0.15);

      // 유색 선화 자동 매칭(검정 단일 외곽선 탈피 + 피부 따뜻한 로즈-테라코타 잉크)
      expect(look.line.color.mode).toBe("darken-albedo");
      const skinInk = resolveKWebtoonOutlineColor("head", recipe.colors.skin, look);
      const hairInk = resolveKWebtoonOutlineColor("hair", recipe.colors.hair, look);
      expect(skinInk[0], `${preset.id} skin colored lineart warm`).toBeGreaterThan(skinInk[2] + 0.08);
      expect(skinInk[0] + skinInk[1] + skinInk[2]).toBeGreaterThan(0.4);
      for (const c of [...skinInk, ...hairInk]) {
        expect(Number.isFinite(c) && c >= 0 && c <= 1).toBe(true);
      }

      // 림 라이트 유한·비영
      const rim = resolveLookRimColor(look);
      expect(rim[0] + rim[1] + rim[2]).toBeGreaterThan(0.5);

      // 머리·홍채 K-웹툰 셰이더 기능 활성화
      const headFeat = resolveKWebtoonFeatureParams("head", recipe.shading);
      const irisFeat = resolveKWebtoonFeatureParams("iris", recipe.shading);
      expect(headFeat.faceMakeupIntensity).toBe(1);
      expect(headFeat.cheekBlushIntensity).toBeGreaterThan(0.25);
      expect(headFeat.lipTintIntensity).toBeGreaterThan(0.5);
      expect(irisFeat.irisGradientIntensity).toBe(1);
    }

    // 5종 K-웹툰 셀 프리셋 정합성 검증
    expect(Object.keys(KWEBTOON_CELL_SHADING_PRESETS)).toHaveLength(5);
  });

  it("CPU evaluateToon 기준식이 K-웹툰 블러셔·중앙 입술 그라데이션·홍채 그라데이션을 반영하고 0일 때 항등을 유지한다", () => {
    const baseParams: ToonParams = {
      baseColor: [0.98, 0.9, 0.84],
      shadeTint: [0.92, 0.67, 0.65],
      lightColor: [0.82, 0.8, 0.78],
      ambientColor: [0.18, 0.18, 0.18],
      toLight: [0.3, 0.6, 0.74],
      rimColor: [0.4, 0.36, 0.34],
      rampSteps: 2,
      rim: true,
      faceSdf: false,
      hasPaint: false,
      faceThreshold: 0.5,
      flipU: 0,
      sdfOffset: 0,
      hasAlbedo: false,
    };
    const makeFrag = (uv: readonly [number, number]): ToonFragmentInput => ({
      normalW: [0, 0.1, 0.995],
      positionW: [0, 1.5, 0.1],
      cameraPosition: [0, 1.5, 2.2],
      uv,
      albedoTex: [1, 1, 1, 1],
      paint: [0, 0, 0, 0],
      sampleSdf: () => 0.8,
      derivativeWidth: 0.01,
    });

    // 중앙 입술 UV (0.25, 0.543): 립 그라데이션 활성화 시 붉은 혈색이 올라간다
    const plainLip = evaluateToon(baseParams, makeFrag([0.25, 0.543]));
    const styledLip = evaluateToon(
      { ...baseParams, kwebtoonFaceMakeup: 1, kwebtoonLipTint: 0.65, kwebtoonCheekBlush: 0.5 },
      makeFrag([0.25, 0.543]),
    );
    expect(styledLip[0] - styledLip[1]).toBeGreaterThan(plainLip[0] - plainLip[1] + 0.1);

    // 뺨 블러셔 UV (0.306, 0.605): 복숭아-로즈 혈색 증가
    const plainCheek = evaluateToon(baseParams, makeFrag([0.306, 0.605]));
    const styledCheek = evaluateToon(
      { ...baseParams, kwebtoonFaceMakeup: 1, kwebtoonLipTint: 0.65, kwebtoonCheekBlush: 0.55 },
      makeFrag([0.306, 0.605]),
    );
    expect(styledCheek[0] - styledCheek[1]).toBeGreaterThan(plainCheek[0] - plainCheek[1] + 0.03);

    // 홍채 그라데이션: 상단(v=0.78)은 속눈썹 그림자로 깊어지고, 하단(v=0.25)은 보석처럼 밝아진다
    const irisBase: ToonParams = { ...baseParams, baseColor: [0.4, 0.55, 0.85], kwebtoonIrisGradient: 1 };
    const irisTop = evaluateToon(irisBase, makeFrag([0.5, 0.78]));
    const irisBottom = evaluateToon(irisBase, makeFrag([0.5, 0.25]));
    const luma = (rgb: readonly [number, number, number]): number => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    expect(luma(irisBottom)).toBeGreaterThan(luma(irisTop) + 0.15);

    // KWEBTOON_ARCHETYPE_PRESETS 10종 중 SD 마스코트는 3.5등신
    expect(KWEBTOON_ARCHETYPE_PRESETS["kwebtoon-sd-mascot"].proportion.headsTall).toBe(3.5);
  });
});
