// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  anglesToDirectionVec3,
  applyTransferredDnaToMaterialLike,
  buildDepthRelightingForVrmDna,
  computeCiede2000Lab,
  createSyntheticMaterialTexture,
  DEFAULT_RAW_REPLACEMENT_PARTS,
  extractVrmMaterialDna,
  extractVrmMaterialDnaFromScene,
  generateDepthSlicesAndRelightingMap,
  oklchToSrgbGamutSafe,
  sampleDominantOklchFromTexture,
  srgbToOklch,
  StudioVrmAutoShaderTransferPanel,
  synthesizeVrmPortraitDepthScene,
  transferVrmShaderDnaToPart,
  transferVrmShaderDnaToParts,
  VRM_DNA_PRESET_SOURCES,
  type Rgb01,
  type ThreeColorLike,
  type VrmSceneMaterialLike,
  type VrmSceneObjectLike,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

function makeTrackableColor(initial: Rgb01): ThreeColorLike & { r: number; g: number; b: number } {
  const obj = {
    r: initial.r,
    g: initial.g,
    b: initial.b,
    setRGB(r: number, g: number, b: number) {
      obj.r = r;
      obj.g = g;
      obj.b = b;
      return obj;
    },
  };
  return obj;
}

describe("OKLCH · CIEDE2000 색과학 및 텍스처 주조색 샘플링 정밀도", () => {
  it("sRGB ↔ OKLCH 왕복 변환이 지각 오차 1e-3 이내로 일치하고 색역 초과 채도를 안전하게 클리핑한다", () => {
    const samples: readonly Rgb01[] = [
      { r: 0.95, g: 0.84, b: 0.78 },
      { r: 0.36, g: 0.35, b: 0.56 },
      { r: 0.76, g: 0.44, b: 0.34 },
      { r: 0.14, g: 0.62, b: 0.48 },
    ];
    for (const rgb of samples) {
      const lch = srgbToOklch(rgb);
      const back = oklchToSrgbGamutSafe(lch);
      expect(back.r).toBeCloseTo(rgb.r, 3);
      expect(back.g).toBeCloseTo(rgb.g, 3);
      expect(back.b).toBeCloseTo(rgb.b, 3);
    }

    const clipped = oklchToSrgbGamutSafe({ l: 0.72, c: 0.38, h: 145 });
    expect(clipped.r).toBeGreaterThanOrEqual(0);
    expect(clipped.r).toBeLessThanOrEqual(1);
    expect(clipped.g).toBeGreaterThanOrEqual(0);
    expect(clipped.g).toBeLessThanOrEqual(1);
    expect(clipped.b).toBeGreaterThanOrEqual(0);
    expect(clipped.b).toBeLessThanOrEqual(1);
  });

  it("Sharma et al. (2005) 공식 CIEDE2000 테스트 쌍을 표준값과 일치하게 산출한다", () => {
    expect(
      computeCiede2000Lab({ l: 50.0, a: 2.6772, b: -79.7751 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.0425, 3);
    expect(
      computeCiede2000Lab({ l: 50.0, a: 3.1571, b: -77.2803 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.8615, 3);
    expect(
      computeCiede2000Lab({ l: 50.0, a: 0.0, b: 0.0 }, { l: 50.0, a: 0.0, b: 0.0 }),
    ).toBeCloseTo(0, 6);
  });

  it("RGBA8 텍스처 주조색 샘플링이 완전 투명 픽셀을 배제하고 불투명 영역의 실제 OKLCH 색을 추출한다", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      const off = i * 4;
      if (i < 8) {
        // 투명 영역의 극단 녹색 쓰레기 데이터 -> 무시되어야 함
        data[off] = 0;
        data[off + 1] = 255;
        data[off + 2] = 0;
        data[off + 3] = 0;
      } else {
        // 불투명 영역: 따뜻한 피부 톤
        data[off] = 240;
        data[off + 1] = 204;
        data[off + 2] = 184;
        data[off + 3] = 255;
      }
    }
    const sample = sampleDominantOklchFromTexture({ width: 4, height: 4, data }, { r: 0, g: 0, b: 0 });
    expect(sample.sampledPixels).toBe(8);
    expect(sample.rgb.r).toBeCloseTo(240 / 255, 2);
    expect(sample.rgb.g).toBeCloseTo(204 / 255, 2);
    expect(sample.rgb.b).toBeCloseTo(184 / 255, 2);
  });
});

describe("원본 VRM 재질 DNA 추출 (`extractVrmMaterialDna` · `extractVrmMaterialDnaFromScene`)", () => {
  it("3종 프리셋 VRM의 텍스처 픽셀·그림자 색온도·셀 경계·외곽선·프레넬·엔젤링을 정확히 추출한다", () => {
    const pastel = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["pastel-atelier"]);
    const sunset = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["sunset-drama"]);
    const noir = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["cyber-noir"]);

    expect(pastel.hasMToonSource).toBe(true);
    expect(pastel.sampledMaterialCount).toBe(3);
    expect(pastel.sampledTexturePixelCount).toBe(16 * 16 * 3);
    expect(pastel.celShading.shadingToonyFactor).toBeCloseTo(0.88, 3);
    expect(pastel.celShading.shadingShiftFactor).toBeCloseTo(-0.06, 3);
    expect(pastel.outline.widthMode).toBe("worldCoordinates");
    expect(pastel.outline.widthFactor).toBeCloseTo(0.0022, 5);
    expect(pastel.rimLight.fresnelPower).toBeCloseTo(4.2, 2);
    expect(pastel.angelRing.intensity).toBeCloseTo(0.68, 2);
    expect(pastel.shadowTint.temperatureClass).toBe("cool");

    expect(sunset.shadowTint.temperatureClass).toBe("warm");
    expect(sunset.shadowTint.temperatureKelvin).toBeLessThan(5400);
    expect(noir.shadowTint.temperatureClass).toBe("cool");
    expect(noir.shadowTint.temperatureKelvin).toBeGreaterThan(7100);
    expect(noir.celShading.shadingToonyFactor).toBeCloseTo(0.95, 3);
    expect(noir.outline.widthFactor).toBeCloseTo(0.0036, 5);
  });

  it("Three.js/VRM 구조적 씬 순회 시 WebGL/WebGPU MToon을 모두 인식하고 커스텀 파생 메시를 제외한다", () => {
    const skinTex = createSyntheticMaterialTexture({ r: 0.94, g: 0.82, b: 0.75 }, 8, 0.01);
    const bodySkinNode: VrmSceneObjectLike = {
      name: "Face_Mesh",
      isMesh: true,
      visible: true,
      material: {
        name: "M_BodySkin",
        isMToonNodeMaterial: true,
        color: { r: 0.94, g: 0.82, b: 0.75 },
        shadeColorFactor: { r: 0.72, g: 0.64, b: 0.72 },
        shadingToonyFactor: 0.91,
        shadingShiftFactor: -0.09,
        outlineWidthMode: "worldCoordinates",
        outlineWidthFactor: 0.0025,
        outlineColorFactor: { r: 0.16, g: 0.12, b: 0.22 },
        parametricRimColorFactor: { r: 0.96, g: 0.94, b: 1 },
        parametricRimFresnelPowerFactor: 4.8,
        parametricRimLiftFactor: 0.1,
        map: { image: { width: skinTex.width, height: skinTex.height, data: skinTex.data } },
      },
    };
    const hairNode: VrmSceneObjectLike = {
      name: "Hair_Base",
      isMesh: true,
      visible: true,
      material: {
        name: "M_HairMain",
        isMToonMaterial: true,
        color: { r: 0.28, g: 0.3, b: 0.48 },
        shadeColorFactor: { r: 0.18, g: 0.19, b: 0.38 },
        shadingToonyFactor: 0.91,
        shadingShiftFactor: -0.09,
        outlineWidthMode: "worldCoordinates",
        outlineWidthFactor: 0.0025,
        matcapFactor: { r: 0.62, g: 0.6, b: 0.72 },
      },
    };
    // 커스텀 파생 오브젝트는 DNA 드리프트 방지를 위해 건너뛰어야 함
    const customDerivativeNode: VrmSceneObjectLike = {
      name: "wardrobe:hat",
      isMesh: true,
      visible: true,
      userData: { toonSpectrumAvatarForge: true },
      material: {
        name: "M_BadOverride",
        isMToonMaterial: true,
        shadingToonyFactor: 0.1,
        outlineWidthFactor: 0.009,
      },
    };

    const mockVrm = {
      scene: {
        traverse(visitor: (node: VrmSceneObjectLike) => void) {
          visitor(bodySkinNode);
          visitor(hairNode);
          visitor(customDerivativeNode);
        },
      },
    };

    const dna = extractVrmMaterialDnaFromScene(mockVrm, {
      profileId: "scene-test",
      primaryLightDirection: anglesToDirectionVec3(25, 48),
    });

    expect(dna.hasMToonSource).toBe(true);
    expect(dna.sampledMaterialCount).toBe(2);
    expect(dna.sampledTexturePixelCount).toBe(64);
    expect(dna.celShading.shadingToonyFactor).toBeCloseTo(0.91, 3);
    expect(dna.outline.widthFactor).toBeCloseTo(0.0025, 5);
    expect(dna.angelRing.intensity).toBeGreaterThan(0.5);
    expect(dna.lightAzimuthDeg).toBeCloseTo(25, 0);
  });
});

describe("교체 파츠 DNA 자동 이식 (`transferVrmShaderDnaToPart` · `applyTransferredDnaToMaterialLike`)", () => {
  it("헤어·모자·안경·의상 4종 모두 이식 후 ΔE00이 대폭 감소하고 셀 경계·외곽선 두께·광원 방향이 100% 일치한다", () => {
    for (const presetId of ["pastel-atelier", "sunset-drama", "cyber-noir"] as const) {
      const dna = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES[presetId]);
      const report = transferVrmShaderDnaToParts(dna, DEFAULT_RAW_REPLACEMENT_PARTS, {
        toneHarmonyStrength: 0.85,
        inheritHairAngelRing: true,
        lockLightDirection: true,
      });

      expect(report.partResults).toHaveLength(4);
      expect(report.allHarmonized).toBe(true);
      expect(report.meanAfterDeltaE00).toBeLessThan(report.meanBeforeDeltaE00);
      expect(report.meanImprovementPercent).toBeGreaterThanOrEqual(75);
      expect(report.maxCelBoundaryErrorAfter).toBe(0);
      expect(report.maxOutlineWidthDeltaAfter).toBe(0);
      expect(report.minLightAlignmentAfter).toBe(1);

      for (const part of report.partResults) {
        expect(part.afterDeltaE00.compositeDeltaE00).toBeLessThan(part.beforeDeltaE00.compositeDeltaE00);
        expect(part.afterDeltaE00.compositeDeltaE00).toBeLessThanOrEqual(4.0);
        expect(part.transferred.shadingToonyFactor).toBe(dna.celShading.shadingToonyFactor);
        expect(part.transferred.shadingShiftFactor).toBe(dna.celShading.shadingShiftFactor);
        expect(part.transferred.outlineWidthMode).toBe(dna.outline.widthMode);
        expect(part.transferred.outlineWidthFactor).toBe(dna.outline.widthFactor);
        expect(part.transferred.rimFresnelPower).toBe(dna.rimLight.fresnelPower);
        expect(part.afterLightAlignmentCosine).toBe(1);
      }

      const hairPart = report.partResults.find((p) => p.kind === "hair");
      const hatPart = report.partResults.find((p) => p.kind === "hat");
      expect(hairPart?.transferred.angelRingIntensity).toBeCloseTo(dna.angelRing.intensity, 3);
      expect(hatPart?.transferred.angelRingIntensity).toBeLessThan(dna.angelRing.intensity * 0.35);
    }
  });

  it("톤 조화 강도·엔젤링 상속·광원 잠금 옵션이 실측 결과에 단조·결정적으로 반영된다", () => {
    const dna = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["pastel-atelier"]);
    const rawHair = DEFAULT_RAW_REPLACEMENT_PARTS[0]!;

    const zeroHarmony = transferVrmShaderDnaToPart(dna, rawHair, { toneHarmonyStrength: 0 });
    const midHarmony = transferVrmShaderDnaToPart(dna, rawHair, { toneHarmonyStrength: 0.5 });
    const fullHarmony = transferVrmShaderDnaToPart(dna, rawHair, { toneHarmonyStrength: 1.0 });

    expect(fullHarmony.afterDeltaE00.compositeDeltaE00).toBe(0);
    expect(fullHarmony.afterDeltaE00.compositeDeltaE00).toBeLessThan(midHarmony.afterDeltaE00.compositeDeltaE00);
    expect(midHarmony.afterDeltaE00.compositeDeltaE00).toBeLessThan(zeroHarmony.afterDeltaE00.compositeDeltaE00);

    const noRingUnlocked = transferVrmShaderDnaToPart(dna, rawHair, {
      inheritHairAngelRing: false,
      lockLightDirection: false,
    });
    expect(noRingUnlocked.transferred.angelRingIntensity).toBe(0);
    expect(noRingUnlocked.afterLightAlignmentCosine).toBe(noRingUnlocked.beforeLightAlignmentCosine);
    expect(noRingUnlocked.afterLightAlignmentCosine).toBeLessThan(0.9);
  });

  it("applyTransferredDnaToMaterialLike가 런타임 MToon 호환 재질에 모든 유니폼과 색상을 적용한다", () => {
    const dna = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["cyber-noir"]);
    const result = transferVrmShaderDnaToPart(dna, DEFAULT_RAW_REPLACEMENT_PARTS[0]!);
    const targetMat: VrmSceneMaterialLike = {
      color: makeTrackableColor({ r: 1, g: 1, b: 1 }),
      shadeColorFactor: makeTrackableColor({ r: 0, g: 0, b: 0 }),
      outlineColorFactor: makeTrackableColor({ r: 0, g: 0, b: 0 }),
      parametricRimColorFactor: makeTrackableColor({ r: 0, g: 0, b: 0 }),
      matcapFactor: makeTrackableColor({ r: 0, g: 0, b: 0 }),
    };

    applyTransferredDnaToMaterialLike(targetMat, result.transferred);

    expect(targetMat.shadingToonyFactor).toBe(dna.celShading.shadingToonyFactor);
    expect(targetMat.shadingShiftFactor).toBe(dna.celShading.shadingShiftFactor);
    expect(targetMat.outlineWidthMode).toBe(dna.outline.widthMode);
    expect(targetMat.outlineWidthFactor).toBe(dna.outline.widthFactor);
    expect(targetMat.parametricRimFresnelPowerFactor).toBe(dna.rimLight.fresnelPower);
    expect(targetMat.color?.r).toBeCloseTo(result.transferred.baseColorRgb.r, 4);
    expect(targetMat.shadeColorFactor?.b).toBeCloseTo(result.transferred.shadeColorRgb.b, 4);
  });
});

describe("실시간 3단 Z-슬라이스 깊이 분리 & 3점 조명 리라이팅 맵", () => {
  it("전경·캐릭터·배경 3단 마스크가 모든 픽셀에서 단위 분할(합 = 1.0)을 만족하고 3점 조명이 VRM 주광에 정렬된다", () => {
    const dna = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["pastel-atelier"]);
    const allOn = buildDepthRelightingForVrmDna(dna, { resolution: 32 });

    expect(allOn.partitionErrorMax).toBeLessThan(1e-5);
    expect(allOn.activeLayerCount).toBe(3);
    expect(allOn.activeCoverageRatio).toBeCloseTo(1, 3);
    expect(allOn.layers.foreground.coverageRatio).toBeGreaterThan(0.05);
    expect(allOn.layers.character.coverageRatio).toBeGreaterThan(0.15);
    expect(allOn.layers.background.coverageRatio).toBeGreaterThan(0.25);

    const sumCoverage =
      allOn.layers.foreground.coverageRatio +
      allOn.layers.character.coverageRatio +
      allOn.layers.background.coverageRatio;
    expect(sumCoverage).toBeCloseTo(1, 2);

    expect(allOn.relighting.metrics.lightDirectionAlignmentCosine).toBe(1);
    expect(allOn.relighting.metrics.keyFillContrastRatio).toBeGreaterThan(1.2);
    expect(allOn.relighting.metrics.rimCoverageRatio).toBeGreaterThan(0);

    // 캐릭터 단독 분리 토글 시 활성 레이어 1개, 커버리지 축소, 배경 픽셀 알파 0 확인
    const charOnly = buildDepthRelightingForVrmDna(dna, {
      resolution: 32,
      sliceConfig: { visibility: { foreground: false, character: true, background: false } },
    });
    expect(charOnly.activeLayerCount).toBe(1);
    expect(charOnly.activeCoverageRatio).toBeCloseTo(charOnly.layers.character.coverageRatio, 3);
    expect(charOnly.relighting.combinedRelitRgba[3]).toBe(0); // 모서리 배경 픽셀(0,0) 투명화

    // 림 강도 0 vs 1.4 단조 반응 확인
    const rimOff = buildDepthRelightingForVrmDna(dna, { resolution: 24, rimIntensity: 0 });
    const rimHigh = buildDepthRelightingForVrmDna(dna, { resolution: 24, rimIntensity: 1.4 });
    expect(rimOff.relighting.metrics.rimCoverageRatio).toBe(0);
    expect(rimHigh.relighting.metrics.rimCoverageRatio).toBeGreaterThan(0.05);
  });

  it("잘못된 깊이 버퍼 크기를 전달하면 명시적 오류를 던진다", () => {
    const valid = synthesizeVrmPortraitDepthScene({ width: 12, height: 12 });
    const dna = extractVrmMaterialDna(VRM_DNA_PRESET_SOURCES["pastel-atelier"]);
    expect(() =>
      generateDepthSlicesAndRelightingMap(
        { ...valid, depthBuffer: new Float32Array(10) },
        {
          keyIntensity: 1,
          fillIntensity: 0.4,
          rimIntensity: 0.6,
          keyLightDirection: dna.primaryLightDirection,
          keyColor: { r: 1, g: 1, b: 1 },
          fillColor: dna.shadowTint.tintRgb,
          rimColor: dna.rimLight.colorRgb,
          shadingToonyFactor: dna.celShading.shadingToonyFactor,
          shadingShiftFactor: dna.celShading.shadingShiftFactor,
          rimFresnelPower: dna.rimLight.fresnelPower,
          rimLift: dna.rimLight.lift,
        },
      ),
    ).toThrow(/buffers do not match/i);
  });
});

describe("StudioVrmAutoShaderTransferPanel: 단독 렌더 · DNA 샘플링 · ΔE00 비교 · 깊이 토글 · KO/EN · Calm Atelier 위생", () => {
  it("props 없이 단독 렌더링되며 프리셋 전환, 재샘플링, 톤 조화 슬라이더, 깊이 레이어 토글이 실시간 동작한다", () => {
    const onTransferComplete = vi.fn();
    const onDepthRelightingChange = vi.fn();
    const { rerender } = render(<StudioVrmAutoShaderTransferPanel />);

    expect(screen.getByTestId("vrm-auto-shader-transfer-panel")).toBeTruthy();
    expect(screen.getByTestId("vrm-dna-swatch-skin")).toBeTruthy();
    expect(screen.getByTestId("vrm-dna-swatch-hair")).toBeTruthy();
    expect(screen.getByTestId("vrm-dna-swatch-outfit")).toBeTruthy();
    expect(screen.getByTestId("vrm-dna-shadow-card").textContent).toContain("한색 그림자");
    expect(screen.getByTestId("vrm-dna-active-layers-summary").textContent).toContain("3/3");

    // 석양 로맨스 프리셋 전환 -> 난색 그림자 색온도로 실시간 갱신
    fireEvent.click(screen.getByTestId("vrm-dna-preset-sunset-drama"));
    expect(screen.getByTestId("vrm-dna-shadow-card").textContent).toContain("난색 그림자");

    // 톤 조화 강도 100% -> 평균 ΔE00 0.00 도달
    fireEvent.change(screen.getByTestId("vrm-dna-harmony-slider"), { target: { value: "100" } });
    expect(screen.getByTestId("vrm-dna-aggregate-deltae").textContent).toContain("→ 0.00");

    // 모자 파츠 카드 클릭 선택
    fireEvent.click(screen.getByTestId("vrm-dna-part-card-hat-street-beret"));
    expect(screen.getByTestId("vrm-dna-part-card-hat-street-beret").getAttribute("aria-pressed")).toBe("true");

    // 콜백 연결 후 재샘플링 & 깊이 레이어 토글 검증
    rerender(
      <StudioVrmAutoShaderTransferPanel
        onTransferComplete={onTransferComplete}
        onDepthRelightingChange={onDepthRelightingChange}
      />,
    );
    fireEvent.click(screen.getByTestId("vrm-dna-resample-btn"));
    expect(onTransferComplete).toHaveBeenCalledTimes(1);
    expect(onTransferComplete.mock.calls[0]?.[0]?.partResults).toHaveLength(4);

    fireEvent.click(screen.getByTestId("vrm-dna-depth-toggle-background"));
    expect(screen.getByTestId("vrm-dna-depth-toggle-background").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("vrm-dna-active-layers-summary").textContent).toContain("2/3");
    expect(onDepthRelightingChange).toHaveBeenCalledTimes(1);
  });

  it("영어 로케일(en)에서는 한글 없이 영어 UI 라벨과 수치만 렌더링된다", () => {
    const { container } = render(<StudioVrmAutoShaderTransferPanel locale="en" />);
    expect(screen.getByTestId("vrm-dna-resample-btn").textContent).toContain("Resample VRM DNA");
    expect(screen.getByTestId("vrm-dna-active-layers-summary").textContent).toContain("Active Z-Layers 3/3");
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("Calm Atelier 토큰 위생(원시 hex/rgb/hsl 금지 · Web Storage 금지 · 모든 파일 800줄 이하)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/vrm-auto-shader-transfer");
    const files = [
      "color-science-oklch.ts",
      "depth-relighting-compositor.ts",
      "vrm-auto-shader-types.ts",
      "vrm-dna-presets.ts",
      "vrm-auto-shader-transfer.ts",
      "StudioVrmAutoShaderTransferPanel.tsx",
      "index.ts",
      "vrm-auto-shader-transfer.test.tsx",
    ];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "vrm-auto-shader-transfer.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/);
        expect(src).not.toMatch(/\bsessionStorage\b/);
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioVrmAutoShaderTransferPanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSrc).not.toMatch(/\brgba?\s*\(/i);
    expect(panelSrc).not.toMatch(/\bhsla?\s*\(/i);
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
