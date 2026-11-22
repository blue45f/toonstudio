// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COLOR_VISION_DEFICIENCY_TYPES,
  auditPaletteLuminanceContrast,
  computeWcagContrastRatio,
  simulateColorVisionHex,
  simulateColorVisionRgb,
  softProofRgbaForColorVision,
} from "./oklch-colorblind-softproof";
import {
  SCENE_TEMPERATURE_KELVIN_RANGE,
  SCENE_TEMPERATURE_PRESETS,
  generateOklchThreeTonePalette,
  hexToOklch,
  kelvinToSceneLightProfile,
  oklchToHex,
  shortestHueDeltaDeg,
} from "./oklch-scene-temperature-palette";
import { StudioColorSwatches } from "./StudioColorSwatches";
import {
  ambientLightingTemperatureToKelvin,
  computeOklchTemperatureShading,
  kelvinToAmbientLightingTemperature,
} from "../shading/oklch-temperature-shading-bridge";

afterEach(cleanup);

describe("축 04 · 장면 색온도(2700K~8500K) OKLCH 3-톤 자동 스와치 생성기 (#016–#017)", () => {
  it("sRGB ↔ OKLCH 왕복 변환과 색역 매핑이 정확하게 동작한다", () => {
    const samples = ["#f2b89b", "#3a7bd5", "#d94e4e", "#2b9348", "#808080", "#111827", "#f8fafc"];
    for (const hex of samples) {
      const oklch = hexToOklch(hex);
      const back = oklchToHex(oklch);
      expect(back).toMatch(/^#[0-9a-f]{6}$/u);
      // 8비트 양자화 오차(±1 채널 이내) 검증
      const origR = Number.parseInt(hex.slice(1, 3), 16);
      const origG = Number.parseInt(hex.slice(3, 5), 16);
      const origB = Number.parseInt(hex.slice(5, 7), 16);
      const backR = Number.parseInt(back.slice(1, 3), 16);
      const backG = Number.parseInt(back.slice(3, 5), 16);
      const backB = Number.parseInt(back.slice(5, 7), 16);
      expect(Math.abs(origR - backR)).toBeLessThanOrEqual(1);
      expect(Math.abs(origG - backG)).toBeLessThanOrEqual(1);
      expect(Math.abs(origB - backB)).toBeLessThanOrEqual(1);
    }
  });

  it("2700K~8500K 범위를 안전하게 클램핑하고 난색(2700K) → 중립(5500K) → 한색(8500K) 프로파일을 산출한다", () => {
    expect(SCENE_TEMPERATURE_PRESETS.length).toBeGreaterThanOrEqual(5);
    const lowClamped = kelvinToSceneLightProfile(1200);
    const highClamped = kelvinToSceneLightProfile(14000);
    expect(lowClamped.kelvin).toBe(SCENE_TEMPERATURE_KELVIN_RANGE.min);
    expect(highClamped.kelvin).toBe(SCENE_TEMPERATURE_KELVIN_RANGE.max);

    const warm = kelvinToSceneLightProfile(2700);
    const daylight = kelvinToSceneLightProfile(5500);
    const cool = kelvinToSceneLightProfile(8500);

    expect(warm.warmth).toBeGreaterThan(0.95);
    expect(Math.abs(daylight.warmth)).toBeLessThan(0.1);
    expect(cool.warmth).toBeLessThan(-0.95);
    // 2700K은 적색 채널 우세, 8500K은 청색 채널 우세
    expect(warm.lightRgb[0]).toBeGreaterThan(warm.lightRgb[2]);
    expect(cool.lightRgb[2]).toBeGreaterThan(cool.lightRgb[0]);
  });

  it("난색 조명(3200K)에서 한색 그림자·난색 하이라이트로 자동 이동해 탁한 회색 Multiply를 방지한다", () => {
    const skinBase = "#eab69f";
    const palette = generateOklchThreeTonePalette(skinBase, { kelvin: 3200 });

    expect(palette.swatches).toHaveLength(3);
    expect(palette.swatches.map((s) => s.role)).toEqual(["light", "midtone", "bounce"]);
    expect(palette.swatches.map((s) => s.labelKo)).toEqual(["광원", "중간", "반사광"]);

    // 명도 계층: 광원 > 중간 > 반사광 > 핵심 그림자
    expect(palette.lightTone.oklch.l).toBeGreaterThan(palette.midTone.oklch.l);
    expect(palette.midTone.oklch.l).toBeGreaterThan(palette.coreShadow.oklch.l);
    expect(palette.bounceTone.oklch.l).toBeGreaterThan(palette.coreShadow.oklch.l);

    // 탁한 회색 Multiply 대비 채도 보존 + 한색 색상각 이동 검증
    expect(palette.multiplyMudAudit.preventsMuddyMultiply).toBe(true);
    expect(palette.multiplyMudAudit.oklchShadowChroma).toBeGreaterThan(
      palette.multiplyMudAudit.naiveMultiplyChroma,
    );
    expect(palette.multiplyMudAudit.shadowHueShiftDeg).toBeGreaterThan(5);

    // 그림자 색상각이 기준 살구색보다 남보라/인디고(268°~282°) 방향으로 이동했는지 확인
    const baseHue = palette.midTone.oklch.h;
    const shadowHue = palette.coreShadow.oklch.h;
    const distBefore = Math.abs(shortestHueDeltaDeg(baseHue, palette.lightProfile.shadowTargetHueDeg));
    const distAfter = Math.abs(shortestHueDeltaDeg(shadowHue, palette.lightProfile.shadowTargetHueDeg));
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("한색 야경 조명(8500K)과 무채색(#808080) 입력에서도 깨짐 없이 3-톤 조화 팔레트를 생성한다", () => {
    const coolPalette = generateOklchThreeTonePalette("#d97757", { kelvin: 8500 });
    expect(coolPalette.kelvin).toBe(8500);
    expect(coolPalette.lightTone.oklch.l).toBeGreaterThan(coolPalette.midTone.oklch.l);
    expect(coolPalette.multiplyMudAudit.preventsMuddyMultiply).toBe(true);

    const grayPalette = generateOklchThreeTonePalette("#808080", { kelvin: 3000 });
    expect(grayPalette.coreShadow.oklch.c).toBeGreaterThan(0.03);
    expect(grayPalette.lightTone.oklch.c).toBeGreaterThan(0.02);
    expect(grayPalette.multiplyMudAudit.preventsMuddyMultiply).toBe(true);
  });

  it("자동 명암 브리지(shading/)가 4종 분위기와 2700~8500K 켈빈을 일관되게 연동한다", () => {
    expect(ambientLightingTemperatureToKelvin("sunset-golden")).toBe(3200);
    expect(ambientLightingTemperatureToKelvin("cool-moon")).toBe(8200);
    expect(kelvinToAmbientLightingTemperature(3100)).toBe("sunset-golden");
    expect(kelvinToAmbientLightingTemperature(8400)).toBe("cool-moon");

    const bridge = computeOklchTemperatureShading({
      baseHex: "#e8b498",
      kelvin: 3200,
      intensityPercent: 80,
    });
    expect(bridge.shadow1ColorHex).toBe(bridge.palette.coreShadow.hex);
    expect(bridge.shadow2ColorHex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(bridge.contrastAudit.colors).toHaveLength(4);
  });
});

describe("축 04 · 색약 3종 실시간 소프트프루프 변환 행렬 & 명도 대비 검증 (#018)", () => {
  it("protanopia · deuteranopia · tritanopia 3종 linearRGB 행렬이 색각이상을 정확히 시뮬레이션한다", () => {
    expect(COLOR_VISION_DEFICIENCY_TYPES).toEqual(["protanopia", "deuteranopia", "tritanopia"]);

    // 순수 백색/흑색은 3종 행렬 모두 불변(행 합계 = 1.0)
    for (const mode of COLOR_VISION_DEFICIENCY_TYPES) {
      expect(simulateColorVisionRgb([255, 255, 255], mode)).toEqual([255, 255, 255]);
      expect(simulateColorVisionRgb([0, 0, 0], mode)).toEqual([0, 0, 0]);
    }

    // 적색(#ff0000)은 protanopia에서 크게 어두워지고 R≈G로 수렴한다
    const redProtan = simulateColorVisionRgb([255, 0, 0], "protanopia");
    expect(redProtan[0]).toBe(redProtan[1]);
    expect(redProtan[0]).toBeLessThan(120);

    // 녹색(#00ff00)과 적색(#ff0000)은 deuteranopia에서 R=G 황갈색 계열로 수렴한다
    const redDeutan = simulateColorVisionRgb([255, 0, 0], "deuteranopia");
    expect(redDeutan[0]).toBe(redDeutan[1]);

    // 청황색약(tritanopia)에서는 G≈B로 수렴한다
    const blueTritan = simulateColorVisionRgb([0, 0, 255], "tritanopia");
    expect(blueTritan[1]).toBe(blueTritan[2]);
    expect(blueTritan[0]).toBe(0);
  });

  it("softProofRgbaForColorVision은 원본 버퍼를 변경하지 않고 알파 채널을 완벽히 보존한다", () => {
    const input = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 128,
      20, 40, 240, 0,
    ]);
    const snapshot = Uint8ClampedArray.from(input);
    const proofed = softProofRgbaForColorVision(input, "deuteranopia");

    expect(input).toEqual(snapshot);
    expect(proofed[3]).toBe(255);
    expect(proofed[7]).toBe(128);
    expect(proofed[11]).toBe(0);
    // 알파 0 투명 픽셀은 RGB 0으로 안전하게 유지
    expect([...proofed.slice(8, 12)]).toEqual([0, 0, 0, 0]);
    // 불투명 빨강은 원본과 다른 소프트프루프 RGB로 변환
    expect(proofed[0]).not.toBe(255);
  });

  it("명도 대비 검증기가 등휘도 적록 쌍의 색약 변별력 붕괴를 경고하고 고대비 팔레트는 통과시킨다", () => {
    expect(computeWcagContrastRatio("#ffffff", "#000000")).toBe(21);

    // 명도가 비슷한 적색·녹색 쌍은 적록색약에서 거의 같은 색으로 붕괴한다
    const muddyRedGreen = auditPaletteLuminanceContrast(["#b45a3c", "#6f823c"]);
    expect(muddyRedGreen.passesAllCvdReadability).toBe(false);
    expect(muddyRedGreen.warningKo).toBeTruthy();

    // 명도 차가 뚜렷한 3-톤 팔레트는 색약 3종 모두 변별력을 유지한다
    const highContrast = auditPaletteLuminanceContrast(["#fef3c7", "#c26d3a", "#2b2147"]);
    expect(highContrast.passesValueHierarchy).toBe(true);
    expect(highContrast.passesAllCvdReadability).toBe(true);
    expect(highContrast.maxWcagRatio).toBeGreaterThan(10);
  });

  it("StudioColorSwatches가 색약 소프트프루프 표시 중에도 클릭 시 원본 지정 HEX를 적용하고 대비 요약을 표시한다", () => {
    const onChoose = vi.fn();
    const colors = ["#ff2222", "#1e3a5f", "#fef3c7"];
    render(
      <StudioColorSwatches
        title="OKLCH 3-톤"
        colors={colors}
        value={colors[0]!}
        onChoose={onChoose}
        softProofMode="protanopia"
        showContrastAudit
      />,
    );

    const redButton = screen.getByRole("button", { name: "OKLCH 3-톤 #ff2222 적용" });
    const simulatedHex = simulateColorVisionHex("#ff2222", "protanopia");
    expect(simulatedHex).not.toBe("#ff2222");
    // jsdom은 style.background를 rgb(...)로 직렬화하므로 클릭 시 원본 HEX 전달을 검증
    fireEvent.click(redButton);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("#ff2222");
    expect(screen.getByRole("status").textContent).toContain("명도 대비 최소");
  });
});
