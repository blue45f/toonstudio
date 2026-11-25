// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  D65_WHITE_XYZ,
  DEMO_BALLOON_CONTRAST_PRESETS,
  DEMO_P3_WEBTOON_SWATCHES,
  DYNAMIC_LIGHTING_PRESETS,
  DYNAMIC_STUDIO_LIGHTING_WGSL,
  MAX_DYNAMIC_LIGHTS,
  PRINT_PROFILES,
  StudioP3ColorLightingPanel,
  createDemoCharacterSurfaceBuffers,
  displayP3ToOklch,
  displayP3ToSrgbRaw,
  displayP3ToXyzD65,
  evaluateBalloonContrast,
  evaluateCmykTac,
  evaluateSkinSubsurfaceScattering,
  evaluateVolumetricGodRay,
  findSrgbBoundaryChroma,
  getLightingPresetById,
  isInsideUnitGamut,
  kelvinToRgb,
  oklabToOklch,
  oklabToXyzD65,
  oklchToDisplayP3,
  oklchToOklab,
  oklchToSrgb,
  renderDynamicLitBuffer,
  softMapP3ToSrgb,
  softProofToCmyk,
  srgbToDisplayP3,
  srgbToOklch,
  srgbToXyzD65,
  validateWgslLightingContract,
  xyzD65ToDisplayP3,
  xyzD65ToOklab,
  xyzD65ToSrgb,
  type DynamicLightingSceneConfig,
  type RgbTuple,
} from "./index";

afterEach(cleanup);

function maxChannelDelta(a: RgbTuple, b: RgbTuple): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

describe("1. Display-P3 광색역 색공간 정밀 변환 (p3-color-gamut-engine)", () => {
  const sampleGrid: readonly RgbTuple[] = [
    { r: 0, g: 0, b: 0 },
    { r: 1, g: 1, b: 1 },
    { r: 1, g: 0, b: 0 },
    { r: 0, g: 1, b: 0 },
    { r: 0, g: 0, b: 1 },
    { r: 0.78, g: 0.34, b: 0.21 },
    { r: 0.12, g: 0.68, b: 0.89 },
    { r: 0.45, g: 0.45, b: 0.45 },
  ];

  it("sRGB <-> CIE XYZ(D65) <-> Display-P3 정밀 선형 변환 가역 오차가 1e-4 미만이다", () => {
    for (const c of sampleGrid) {
      const srgbRoundtrip = xyzD65ToSrgb(srgbToXyzD65(c));
      expect(maxChannelDelta(c, srgbRoundtrip)).toBeLessThan(1e-4);

      const p3Roundtrip = xyzD65ToDisplayP3(displayP3ToXyzD65(c));
      expect(maxChannelDelta(c, p3Roundtrip)).toBeLessThan(1e-4);

      const crossRoundtrip = displayP3ToSrgbRaw(srgbToDisplayP3(c));
      expect(maxChannelDelta(c, crossRoundtrip)).toBeLessThan(1e-4);
    }

    const whiteSrgbXyz = srgbToXyzD65({ r: 1, g: 1, b: 1 });
    const whiteP3Xyz = displayP3ToXyzD65({ r: 1, g: 1, b: 1 });
    expect(Math.abs(whiteSrgbXyz.x - D65_WHITE_XYZ.x)).toBeLessThan(1e-5);
    expect(Math.abs(whiteP3Xyz.y - 1)).toBeLessThan(1e-5);
    expect(Math.abs(whiteSrgbXyz.z - whiteP3Xyz.z)).toBeLessThan(1e-5);
  });

  it("CIE XYZ(D65) <-> OKLab <-> OKLCH 및 Display-P3 <-> OKLCH 가역 오차가 1e-4 미만이다", () => {
    for (const c of sampleGrid) {
      const xyz = displayP3ToXyzD65(c);
      const lab = xyzD65ToOklab(xyz);
      const xyzBack = oklabToXyzD65(lab);
      expect(Math.abs(xyz.x - xyzBack.x)).toBeLessThan(1e-4);
      expect(Math.abs(xyz.y - xyzBack.y)).toBeLessThan(1e-4);
      expect(Math.abs(xyz.z - xyzBack.z)).toBeLessThan(1e-4);

      const labBack = oklchToOklab(oklabToOklch(lab));
      expect(Math.hypot(lab.L - labBack.L, lab.a - labBack.a, lab.b - labBack.b)).toBeLessThan(1e-4);

      expect(maxChannelDelta(c, oklchToSrgb(srgbToOklch(c)))).toBeLessThan(1e-4);
      expect(maxChannelDelta(c, oklchToDisplayP3(displayP3ToOklch(c)))).toBeLessThan(1e-4);
    }

    const whiteLch = displayP3ToOklch({ r: 1, g: 1, b: 1 });
    expect(whiteLch.L).toBeCloseTo(1, 4);
    expect(whiteLch.C).toBeLessThan(1e-4);
  });

  it("softMapP3ToSrgb는 광색역 P3 입력을 색상(Hue) 틀어짐 없이 sRGB 단위 게멋 내부로 부드럽게 압축한다", () => {
    const outOfGamutP3: readonly RgbTuple[] = [
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0.98, g: 0.08, b: 0.64 },
      { r: 0.04, g: 0.94, b: 0.66 },
    ];

    for (const p3 of outOfGamutP3) {
      const res = softMapP3ToSrgb(p3);
      expect(res.inSrgbGamut).toBe(false);
      expect(res.chromaCompressed).toBe(true);
      expect(isInsideUnitGamut(res.mappedSrgb, 1e-6)).toBe(true);
      expect(res.hueShiftDeg).toBeLessThan(0.5);
      expect(res.mappedOklch.C).toBeLessThanOrEqual(res.originalOklch.C);
      expect(res.mappedOklch.C).toBeLessThanOrEqual(res.boundaryChroma + 1e-4);
      expect(res.p3Css).toContain("color(display-p3");
      expect(res.mappedSrgbOklchCss).toContain("oklch(");
    }
  });

  it("softMapP3ToSrgb는 채도 증가에 대해 단조성(monotonicity)을 유지하고 sRGB 내부 파스텔 색은 무손실 통과시킨다", () => {
    const cMax = findSrgbBoundaryChroma(0.65, 32);
    expect(cMax).toBeGreaterThan(0.15);

    const midP3 = oklchToDisplayP3({ L: 0.65, C: cMax * 0.92, h: 32 });
    const highP3 = oklchToDisplayP3({ L: 0.65, C: cMax * 1.15, h: 32 });
    const mappedMid = softMapP3ToSrgb(midP3);
    const mappedHigh = softMapP3ToSrgb(highP3);
    expect(mappedHigh.mappedOklch.C).toBeGreaterThan(mappedMid.mappedOklch.C);

    const pastelP3: RgbTuple = { r: 0.85, g: 0.78, b: 0.75 };
    const pastelRes = softMapP3ToSrgb(pastelP3);
    expect(pastelRes.inSrgbGamut).toBe(true);
    expect(pastelRes.chromaCompressed).toBe(false);
    expect(pastelRes.deltaEok).toBeLessThan(1e-4);
  });
});

describe("2. CMYK 소프트프루핑(FOGRA39 · JapanColor2001) · TAC 경고 · 말풍선 대비 검사", () => {
  it("FOGRA39와 JapanColor2001 프로파일은 서로 다른 한도·종이 백색점·인쇄 색역 압축을 반영한다", () => {
    expect(PRINT_PROFILES.FOGRA39.tacLimitPercent).toBe(330);
    expect(PRINT_PROFILES.JapanColor2001.tacLimitPercent).toBe(300);

    const neonCyan = DEMO_P3_WEBTOON_SWATCHES.find((s) => s.id === "arcane-emerald-cyan")!.p3;
    const fogra = softProofToCmyk(neonCyan, "display-p3", "FOGRA39");
    const japan = softProofToCmyk(neonCyan, "display-p3", "JapanColor2001");

    expect(fogra.gamutShiftedForPrint).toBe(true);
    expect(japan.gamutShiftedForPrint).toBe(true);
    expect(fogra.proofedOklch.C).toBeLessThan(displayP3ToOklch(neonCyan).C);
    expect(maxChannelDelta(fogra.proofedSrgb, japan.proofedSrgb)).toBeGreaterThan(0.002);
  });

  it("총잉크량(TAC) 경고 및 초과 경고를 정확히 판정하고 GCR 상향 시 총잉크량이 감소한다", () => {
    const safeTac = evaluateCmykTac({ c: 0.4, m: 0.5, y: 0.4, k: 0.2 }, "JapanColor2001");
    expect(safeTac.level).toBe("safe");

    const warnTac = evaluateCmykTac({ c: 0.75, m: 0.75, y: 0.75, k: 0.65 }, "JapanColor2001");
    expect(warnTac.level).toBe("warning");
    expect(warnTac.totalInkPercent).toBeCloseTo(290, 1);

    const exceededTac = evaluateCmykTac({ c: 0.9, m: 0.9, y: 0.85, k: 0.75 }, "FOGRA39");
    expect(exceededTac.level).toBe("exceeded");
    expect(exceededTac.totalInkPercent).toBeGreaterThan(330);

    const deepShadow: RgbTuple = { r: 0.04, g: 0.04, b: 0.05 };
    const lowGcr = softProofToCmyk(deepShadow, "display-p3", "JapanColor2001", { gcrStrength: 0.05 });
    const highGcr = softProofToCmyk(deepShadow, "display-p3", "JapanColor2001", { gcrStrength: 0.9 });
    expect(lowGcr.tac.totalInkPercent).toBeGreaterThan(highGcr.tac.totalInkPercent);
    expect(lowGcr.tac.level).toBe("exceeded");
    expect(highGcr.tac.level).toBe("safe");
  });

  it("말풍선 텍스트 WCAG 2.1 대비율(1:1~21:1)과 AA/AAA 통과 기준을 정확히 산출한다", () => {
    const blackOnWhite = evaluateBalloonContrast({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, "srgb");
    expect(blackOnWhite.wcagRatio).toBeCloseTo(21, 1);
    expect(blackOnWhite.wcagAALarge).toBe(true);
    expect(blackOnWhite.wcagAANormal).toBe(true);
    expect(blackOnWhite.wcagAAA).toBe(true);
    expect(blackOnWhite.balloonGrade).toBe("excellent-body");

    const sameColor = evaluateBalloonContrast({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 }, "srgb");
    expect(sameColor.wcagRatio).toBeCloseTo(1, 3);
    expect(sameColor.wcagAALarge).toBe(false);
    expect(sameColor.balloonGrade).toBe("fail");
  });

  it("APCA 대비율 검사기는 극성(밝은 배경 + 어두운 글자 양수 / 어두운 배경 + 밝은 글자 음수)을 구분한다", () => {
    const classic = DEMO_BALLOON_CONTRAST_PRESETS[0]!;
    const darkMono = DEMO_BALLOON_CONTRAST_PRESETS[1]!;
    const lowWarn = DEMO_BALLOON_CONTRAST_PRESETS[3]!;

    const resLight = evaluateBalloonContrast(classic.foregroundP3, classic.backgroundP3, "display-p3");
    const resDark = evaluateBalloonContrast(darkMono.foregroundP3, darkMono.backgroundP3, "display-p3");
    const resWarn = evaluateBalloonContrast(lowWarn.foregroundP3, lowWarn.backgroundP3, "display-p3");

    expect(resLight.polarity).toBe("dark-on-light");
    expect(resLight.apcaLc).toBeGreaterThan(80);
    expect(resDark.polarity).toBe("light-on-dark");
    expect(resDark.apcaLc).toBeLessThan(-75);
    expect(resWarn.balloonGrade).toBe("fail");
    expect(resWarn.apcaAbsLc).toBeLessThan(45);
  });
});

describe("3. 실시간 다중 동적 조명 엔진 & WebGPU WGSL (dynamic-studio-lighting-engine)", () => {
  it("2200K~10000K Planckian 색온도 변환이 촛불 주황→주광 백색→달빛 청색으로 단조 변화한다", () => {
    const candle = kelvinToRgb(2200);
    const sunset = kelvinToRgb(3500);
    const daylight = kelvinToRgb(6500);
    const moonlight = kelvinToRgb(10000);

    expect(candle.srgb.r).toBeGreaterThan(candle.srgb.g);
    expect(candle.srgb.g).toBeGreaterThan(candle.srgb.b);
    expect(Math.abs(daylight.srgb.r - daylight.srgb.b)).toBeLessThan(0.06);
    expect(moonlight.srgb.b).toBeGreaterThan(moonlight.srgb.g);
    expect(moonlight.srgb.g).toBeGreaterThan(moonlight.srgb.r);

    const ratio = (c: RgbTuple) => c.b / Math.max(1e-5, c.r);
    expect(ratio(candle.srgb)).toBeLessThan(ratio(sunset.srgb));
    expect(ratio(sunset.srgb)).toBeLessThan(ratio(daylight.srgb));
    expect(ratio(daylight.srgb)).toBeLessThan(ratio(moonlight.srgb));

    expect(kelvinToRgb(900).kelvin).toBe(2200);
    expect(kelvinToRgb(18000).kelvin).toBe(10000);
  });

  it("5종 시네마틱 웹툰 조명 프리셋(서울 황금 노을~마법 성채 횃불)이 정본 명칭과 4광원 슬롯을 갖춘다", () => {
    expect(DYNAMIC_LIGHTING_PRESETS).toHaveLength(5);
    expect(DYNAMIC_LIGHTING_PRESETS.map((p) => p.nameKo)).toEqual([
      "서울 황금 노을",
      "비 오는 네온 골목",
      "달빛 창가",
      "오후 교실 역광",
      "마법 성채 횃불",
    ]);

    for (const preset of DYNAMIC_LIGHTING_PRESETS) {
      expect(preset.config.lights.length).toBeLessThanOrEqual(MAX_DYNAMIC_LIGHTS);
      expect(preset.config.lights.length).toBeGreaterThanOrEqual(1);
      for (const light of preset.config.lights) {
        expect(light.kelvin).toBeGreaterThanOrEqual(2200);
        expect(light.kelvin).toBeLessThanOrEqual(10000);
      }
    }
  });

  it("볼류메트릭 빛줄기(God-Ray Cone Falloff)가 원뿔 축 내부에서 최대이고 각도 외부·깊이 차폐 시 감쇠한다", () => {
    const classroomLight = getLightingPresetById("afternoon-classroom-backlight").config.lights[0]!;
    const onAxis = evaluateVolumetricGodRay({ u: 0.42, v: 0.31, pixelDepth: 0.05, light: classroomLight });
    const offAxis = evaluateVolumetricGodRay({ u: 0.05, v: 0.85, pixelDepth: 0.05, light: classroomLight });
    expect(onAxis).toBeGreaterThan(0.1);
    expect(offAxis).toBe(0);

    // 깊이 버퍼에 전경 차폐물을 두면 투과율이 감소해야 한다
    const surface = createDemoCharacterSurfaceBuffers(32, 24);
    const unoccluded = evaluateVolumetricGodRay({ u: 0.72, v: 0.48, pixelDepth: 0.05, light: classroomLight });
    const occluded = evaluateVolumetricGodRay({
      u: 0.72,
      v: 0.48,
      pixelDepth: 0.05,
      light: classroomLight,
      depthBuffer: surface.depthBuffer,
      width: surface.width,
      height: surface.height,
    });
    expect(occluded).toBeLessThan(unoccluded);
  });

  it("피부 서브서피스 산란(SSS)이 마스크 0에서 0을 반환하고 볼/음영 경계에서 따뜻한 적주황 산란을 생성한다", () => {
    const whiteLin = { r: 1, g: 1, b: 1 };
    const noSkin = evaluateSkinSubsurfaceScattering({
      normalDotLight: 0.05,
      viewDotNormal: 0.5,
      skinMask: 0,
      lightLinearRgb: whiteLin,
      lightIntensity: 1.5,
      sssStrength: 1.0,
    });
    expect(noSkin).toEqual({ r: 0, g: 0, b: 0 });

    const warmCheek = evaluateSkinSubsurfaceScattering({
      normalDotLight: 0.02,
      viewDotNormal: 0.45,
      skinMask: 0.95,
      lightLinearRgb: whiteLin,
      lightIntensity: 1.5,
      sssStrength: 1.0,
    });
    expect(warmCheek.r).toBeGreaterThan(warmCheek.g * 2);
    expect(warmCheek.g).toBeGreaterThan(warmCheek.b);
    expect(warmCheek.r).toBeGreaterThan(0.2);
  });

  it("renderDynamicLitBuffer가 2D 노멀/깊이 기반 실시간 RGBA 버퍼를 생성하고 최대 4광원 상한을 강제한다", () => {
    const surface = createDemoCharacterSurfaceBuffers(32, 24);
    const sunset = getLightingPresetById("seoul-golden-sunset").config;
    const lit = renderDynamicLitBuffer(surface, sunset);

    expect(lit.rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(lit.rgba.length).toBe(32 * 24 * 4);
    expect(lit.metrics.averageLuminance).toBeGreaterThan(0.08);
    expect(lit.metrics.sssAffectedPixels).toBeGreaterThan(10);
    expect(lit.metrics.volumetricEnergy).toBeGreaterThan(0.01);
    expect(lit.previewMosaic.cells).toHaveLength(16 * 12);

    // 6개 광원을 주입해도 최대 4개까지만 활성 처리
    const sixLightConfig: DynamicLightingSceneConfig = {
      ...sunset,
      lights: [...sunset.lights.map((l) => ({ ...l, enabled: true })), ...sunset.lights.slice(0, 2)],
    };
    const capped = renderDynamicLitBuffer(surface, sixLightConfig);
    expect(capped.metrics.activeLightCount).toBe(MAX_DYNAMIC_LIGHTS);

    // 모든 광원 비활성 시 확연히 어두워짐
    const dark = renderDynamicLitBuffer(surface, {
      ...sunset,
      lights: sunset.lights.map((l) => ({ ...l, enabled: false })),
    });
    expect(dark.metrics.activeLightCount).toBe(0);
    expect(dark.metrics.averageLuminance).toBeLessThan(lit.metrics.averageLuminance * 0.25);
  });

  it("renderDynamicLitBuffer는 색온도(서울 노을 vs 달빛 창가)와 SSS·빛줄기 변화에 물리적으로 반응한다", () => {
    const surface = createDemoCharacterSurfaceBuffers(32, 24);
    const sunsetLit = renderDynamicLitBuffer(surface, getLightingPresetById("seoul-golden-sunset").config);
    const moonLit = renderDynamicLitBuffer(surface, getLightingPresetById("moonlit-window").config);

    expect(sunsetLit.metrics.warmToCoolRatio).toBeGreaterThan(moonLit.metrics.warmToCoolRatio);

    const classroom = getLightingPresetById("afternoon-classroom-backlight").config;
    const withSss = renderDynamicLitBuffer(surface, { ...classroom, sssStrength: 1.2 });
    const withoutSss = renderDynamicLitBuffer(surface, { ...classroom, sssStrength: 0 });
    expect(withSss.metrics.sssAffectedPixels).toBeGreaterThan(0);
    expect(withoutSss.metrics.sssAffectedPixels).toBe(0);
  });

  it("WebGPU WGSL 셰이더 소스가 4광원 구조체·컴퓨트 엔트리·빛줄기·피부 SSS·ACES 톤매핑 계약을 충족한다", () => {
    const check = validateWgslLightingContract(DYNAMIC_STUDIO_LIGHTING_WGSL);
    expect(check.valid).toBe(true);
    expect(check.hasFourLightArray).toBe(true);
    expect(check.hasComputeEntry).toBe(true);
    expect(check.hasVolumetricGodRay).toBe(true);
    expect(check.hasSkinSubsurface).toBe(true);
    expect(check.hasAcesToneMap).toBe(true);
    expect(check.lineCount).toBeGreaterThan(50);
  });
});

describe("4. StudioP3ColorLightingPanel 3탭 인터랙티브 UI 및 엄격 규칙 검증", () => {
  it("<StudioP3ColorLightingPanel />가 단독(zero-prop)으로 렌더링되고 3탭 접근성 역할이 정상 동작한다", () => {
    render(<StudioP3ColorLightingPanel />);

    expect(screen.getByTestId("p3-color-lighting-panel")).toBeTruthy();
    const gamutTab = screen.getByTestId("p3-tab-gamut");
    const proofTab = screen.getByTestId("p3-tab-softproof");
    const lightingTab = screen.getByTestId("p3-tab-lighting");

    expect(gamutTab.getAttribute("aria-selected")).toBe("true");
    expect(proofTab.getAttribute("aria-selected")).toBe("false");
    expect(lightingTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("p3-matrix-readout").textContent).toContain("CIE XYZ(D65)");
  });

  it("Tab 1(Display-P3)에서 광색역 스와치 전환과 채널 슬라이더 조작 시 게멋 판정과 행렬 수치가 실시간 갱신된다", () => {
    render(<StudioP3ColorLightingPanel />);

    expect(screen.getByTestId("gamut-status-badge").textContent).toContain("P3 광색역 채도 압축");
    fireEvent.click(screen.getByTestId("p3-swatch-sakura-silk-pink"));
    expect(screen.getByTestId("gamut-status-badge").textContent).toContain("sRGB 범위 내");

    fireEvent.change(screen.getByTestId("p3-slider-r"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("p3-slider-g"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("p3-slider-b"), { target: { value: "0" } });
    expect(screen.getByTestId("gamut-status-badge").textContent).toContain("P3 광색역 채도 압축");
  });

  it("Tab 2(CMYK 소프트프루핑 · 대비 검사)에서 프로파일 전환·GCR TAC 경고·말풍선 대비 검사가 즉시 갱신된다", () => {
    const onProfileChange = vi.fn();
    render(<StudioP3ColorLightingPanel onSoftProofProfileChange={onProfileChange} />);

    // 깊은 잉크 섀도우 선택 후 Tab 2 이동
    fireEvent.click(screen.getByTestId("p3-swatch-deep-ink-shadow"));
    fireEvent.click(screen.getByTestId("p3-tab-softproof"));

    fireEvent.click(screen.getByTestId("cmyk-profile-FOGRA39"));
    expect(onProfileChange).toHaveBeenCalledWith("FOGRA39");
    expect(screen.getByTestId("cmyk-tac-badge").textContent).toContain("/ 330%");

    fireEvent.click(screen.getByTestId("cmyk-profile-JapanColor2001"));
    fireEvent.change(screen.getByTestId("cmyk-gcr-slider"), { target: { value: "0.05" } });
    expect(screen.getByTestId("cmyk-tac-message").textContent).toContain("초과");

    fireEvent.click(screen.getByTestId("balloon-preset-neon-low-contrast-warn"));
    expect(screen.getByTestId("balloon-contrast-guidance").textContent).toContain("가독성 부족");
    fireEvent.click(screen.getByTestId("balloon-preset-dark-monologue-box"));
    expect(screen.getByTestId("balloon-contrast-grade").textContent).toContain("Lc -");
  });

  it("Tab 3(실시간 동적 조명)에서 5종 프리셋 전환·광원 토글·색온도 조절 시 프리뷰와 콜백이 갱신된다", () => {
    const onPresetChange = vi.fn();
    render(<StudioP3ColorLightingPanel initialTab="lighting" onLightingPresetChange={onPresetChange} />);

    expect(screen.getByTestId("lighting-preview-mosaic").children.length).toBe(192);
    expect(screen.getByTestId("wgsl-shader-preview").textContent).toContain("cs_relight_main");

    fireEvent.click(screen.getByTestId("lighting-preset-rainy-neon-alley"));
    expect(onPresetChange).toHaveBeenCalledWith("rainy-neon-alley");
    expect(screen.getByTestId("lighting-active-count").textContent).toContain("4/4");

    fireEvent.click(screen.getByTestId("light-toggle-neon-cyan-lamp"));
    expect(screen.getByTestId("lighting-active-count").textContent).toContain("3/4");

    fireEvent.change(screen.getByTestId("light-kelvin-slider"), { target: { value: "2400" } });
    expect(screen.getByTestId("active-light-kelvin-readout").textContent).toContain("2400K");
  });

  it("엄격 규칙(800줄 이하 · Storage/BigInt/private Map store/원시 색상/props={} 0건 · 시맨틱 토큰)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "p3-color-gamut-engine.ts",
      "dynamic-studio-lighting-engine.ts",
      "StudioP3ColorLightingPanel.tsx",
      "index.ts",
      "p3-color-dynamic-lighting.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "p3-color-dynamic-lighting.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "p3-color-dynamic-lighting.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
