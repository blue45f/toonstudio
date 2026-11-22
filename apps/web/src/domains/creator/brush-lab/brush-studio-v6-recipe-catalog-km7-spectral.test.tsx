// @vitest-environment jsdom
/**
 * 7밴드 분광 KM 브러시 5종 프리셋 팩 · V6 카탈로그 통합 · 상용 권리 무차단 · UI 선택 테스트.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { materializeStudioBrushCatalogSelection } from "../brush/studio-brush-selection";
import { STUDIO_V6_BRUSH_CATALOG_ITEMS } from "../brush/studio-brush-v6-catalog";
import { studioV6BrushCatalogSelectionBlock } from "../brush/studio-brush-v6-catalog-runtime";
import { wetMixStroke } from "../brush/studio-wet-mix";
import { km7SrgbToOklch } from "../render/studio-webgpu-km7-spectral-core";

import {
  analyzeBrushStudioV6Program,
  createBrushStudioV6Program,
  type BrushStudioV6Capabilities,
} from "./brush-studio-v6-engine";
import {
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS,
  createBrushStudioV6PigmentPalette,
  mixBrushStudioV6PigmentColors,
} from "./brush-studio-v6-pigment-provider";
import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog";
import {
  BRUSH_STUDIO_V6_KM7_SPECTRAL_RECIPE_SEEDS,
  BRUSH_STUDIO_V6_KM7_SPECTRAL_SPECS,
  findBrushStudioKm7SpectralPresetSpec,
} from "./brush-studio-v6-recipe-catalog-km7-spectral";
import { StudioPigmentComparison } from "./pigment/StudioPigmentComparison";

afterEach(cleanup);

const EXPECTED_KM7_IDS = [
  "km7-oil-impasto-bristle",
  "km7-gouache-opaque-flat",
  "km7-watercolor-wet-edge-bloom",
  "km7-acrylic-soft-blend",
  "km7-dry-pastel-chalk",
] as const;

describe("7밴드 분광 안료 브러시 프리셋 5종 팩", () => {
  it("5종 브러시가 레시피 카탈로그와 스튜디오 V6 브러시 라이브러리에 모두 등록된다", () => {
    expect(BRUSH_STUDIO_V6_KM7_SPECTRAL_SPECS).toHaveLength(5);
    expect(BRUSH_STUDIO_V6_KM7_SPECTRAL_RECIPE_SEEDS.map((s) => s.id)).toEqual(EXPECTED_KM7_IDS);

    const allSeedIds = new Set(BRUSH_STUDIO_V6_RECIPE_SEEDS.map((s) => s.id));
    const libraryById = new Map(STUDIO_V6_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

    for (const id of EXPECTED_KM7_IDS) {
      expect(allSeedIds.has(id)).toBe(true);
      expect(libraryById.has(`v6:${id}`)).toBe(true);
      expect(findBrushStudioKm7SpectralPresetSpec(id)?.km7Optics.spectralBands).toBe(7);
      expect(findBrushStudioKm7SpectralPresetSpec(`v6:${id}`)?.id).toBe(id);
    }
    expect(findBrushStudioKm7SpectralPresetSpec("unknown-brush")).toBeNull();
  });

  it("5종 모두 상용 기본 권리 프로필(permissive-only)에서 차단 없이 실체화되며 commercial-safe다", async () => {
    const webgpuCapabilities: BrushStudioV6Capabilities = {
      webgpu: true,
      wasm: true,
      webgl2: true,
      sharedArrayBuffer: true,
      pointerRawUpdate: true,
      coalescedEvents: true,
      predictedEvents: true,
      pressure: true,
      tilt: true,
      twist: true,
      hover: true,
      maxTextureDimension2D: 8192,
      memoryBudgetMb: 512,
    };
    for (const id of EXPECTED_KM7_IDS) {
      const program = createBrushStudioV6Program(id);
      const analysis = analyzeBrushStudioV6Program(program, webgpuCapabilities);
      expect(analysis.issues.filter((i) => i.severity === "error"), id).toEqual([]);
      expect(analysis.valid, id).toBe(true);
      expect(analysis.rightsProfile, id).toBe("commercial-safe");
      expect(program.slots.pigment, id).toBe("pigment-km7-spectral");

      const catalogId = `v6:${id}`;
      expect(studioV6BrushCatalogSelectionBlock(catalogId), id).toBeNull();
      const materialized = await materializeStudioBrushCatalogSelection(catalogId);
      expect(materialized, id).not.toBeNull();
      expect(materialized?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");
      expect(
        materialized?.enginePrograms?.material?.runtime?.bindings.some(
          (binding) => binding.providerId === "toonstudio-km7-spectral-v1",
        ),
        id,
      ).toBe(true);
    }
  });

  it("toonstudio-km7-spectral-v1 안료 제공자가 파랑+노랑을 선명한 녹색 팔레트로 혼합하고 비교 UI에서 선택된다", () => {
    expect(
      BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.some(
        (entry) => entry.id === "toonstudio-km7-spectral-v1" && entry.rights === "internal",
      ),
    ).toBe(true);

    const palette = createBrushStudioV6PigmentPalette(
      "#002185",
      "#fcd200",
      "toonstudio-km7-spectral-v1",
      33,
    );
    expect(palette).toHaveLength(33);
    expect(palette[0]).toBe("#002185");
    expect(palette[32]).toBe("#fcd200");

    const midHex = mixBrushStudioV6PigmentColors("#002185", "#fcd200", 0.5, "toonstudio-km7-spectral-v1");
    expect(midHex).toBe(palette[16]);
    const r = Number.parseInt(midHex.slice(1, 3), 16) / 255;
    const g = Number.parseInt(midHex.slice(3, 5), 16) / 255;
    const b = Number.parseInt(midHex.slice(5, 7), 16) / 255;
    const lch = km7SrgbToOklch({ r, g, b });
    expect(lch.hDeg).toBeGreaterThan(125);
    expect(lch.hDeg).toBeLessThan(165);
    expect(lch.C).toBeGreaterThan(0.11);

    const onSelect = vi.fn();
    render(
      <StudioPigmentComparison
        primary="#002185"
        secondary="#fcd200"
        node="pigment-km7-spectral"
        secondaryActive
        onSelect={onSelect}
      />,
    );
    const button = screen.getByRole("button", { name: /7밴드 분광 KM\(자체\) 선택/u });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("pigment-km7-spectral");
  });

  it("wetMixStroke에서 spectralBands: 7 경로가 파랑 바탕 위 노랑 혼색 시 녹색 계열로 혼합한다", () => {
    const w = 24;
    const h = 24;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      data[i * 4] = 10;
      data[i * 4 + 1] = 48;
      data[i * 4 + 2] = 176;
      data[i * 4 + 3] = 255;
    }
    wetMixStroke(
      data,
      w,
      h,
      [
        { x: 6, y: 12 },
        { x: 18, y: 12 },
      ],
      {
        radiusPx: 7,
        hardness: 0.7,
        strength: 0.9,
        wetness: 0.55,
        pickup: 0.7,
        paintColor: { r: 252, g: 214, b: 12 },
        mixModel: "spectral-wgm",
        spectralBands: 7,
      },
    );
    const centerOff = (12 * w + 12) * 4;
    const r = (data[centerOff] ?? 0) / 255;
    const g = (data[centerOff + 1] ?? 0) / 255;
    const b = (data[centerOff + 2] ?? 0) / 255;
    const lch = km7SrgbToOklch({ r, g, b });
    expect(lch.hDeg).toBeGreaterThan(110);
    expect(lch.hDeg).toBeLessThan(175);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});
