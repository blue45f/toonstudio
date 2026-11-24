// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  computeCiede2000,
  computeSsim,
  detectPremultipliedAlphaHalo,
  evaluate12MediaTextureIntegrityGate,
  evaluateCiede2000Tile,
  evaluateLiveVsCommittedParity,
  evaluatePsnrAndPixelError,
  injectVisualFaultScenario,
  MEDIA_12_PROFILES,
  srgbToLab,
  StudioVisualIntegrityOraclePanel,
  synthesizeMediumRgbaTile,
  type RgbaTileBuffer,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

function makeSolidTile(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
  alphaMode: "straight" | "premultiplied" = "straight",
): RgbaTileBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    data[off] = rgba[0];
    data[off + 1] = rgba[1];
    data[off + 2] = rgba[2];
    data[off + 3] = rgba[3];
  }
  return { width, height, data, alphaMode };
}

function makePatternTile(width: number, height: number, scale = 1, offset = 0, invert = false): RgbaTileBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 모든 8x8 로컬 윈도우에서 평균 128이 균일하게 유지되도록 2px 대칭 체커 패턴 사용
      const delta = ((x + y) & 1) === 0 ? 64 : -64;
      const centered = delta * (invert ? -scale : scale) + 128 + offset;
      const v = Math.max(0, Math.min(255, Math.round(centered)));
      const off = (y * width + x) * 4;
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return { width, height, data, alphaMode: "straight" };
}

function makeAntialiasedDiskTile(
  size: number,
  rgb: readonly [number, number, number],
  doublePremultiply: boolean,
): RgbaTileBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = (size - 1) * 0.5;
  const innerR = size * 0.24;
  const outerR = size * 0.42;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - center, y - center);
      let alpha01 = 0;
      if (d <= innerR) alpha01 = 1;
      else if (d < outerR) alpha01 = 1 - (d - innerR) / (outerR - innerR);
      const a = Math.round(alpha01 * 255);
      const off = (y * size + x) * 4;
      if (a > 0) {
        const factor = doublePremultiply && a < 255 ? a / 255 : 1;
        data[off] = Math.round(rgb[0] * factor);
        data[off + 1] = Math.round(rgb[1] * factor);
        data[off + 2] = Math.round(rgb[2] * factor);
        data[off + 3] = a;
      }
    }
  }
  return { width: size, height: size, data, alphaMode: "straight" };
}

describe("① SSIM (휘도·대비·구조 3항) 수학적 정밀성", () => {
  it("동일 RGBA 타일에서 SSIM 및 휘도·대비·구조 3항이 모두 정확히 1이다", () => {
    const ref = makePatternTile(32, 32);
    const same = { ...ref, data: new Uint8ClampedArray(ref.data) };
    const ssim = computeSsim(ref, same);
    expect(ssim.score).toBeCloseTo(1, 6);
    expect(ssim.luminance).toBeCloseTo(1, 6);
    expect(ssim.contrast).toBeCloseTo(1, 6);
    expect(ssim.structure).toBeCloseTo(1, 6);
    expect(ssim.minWindowSsim).toBeCloseTo(1, 6);
    expect(ssim.windowCount).toBeGreaterThan(0);
  });

  it("휘도 이동·대비 축소·구조 반전 시 해당하는 3항이 각각 독립적으로 반응한다", () => {
    const base = makePatternTile(32, 32, 1, 0, false);
    const lumaShifted = makePatternTile(32, 32, 1, 45, false);
    const contrastReduced = makePatternTile(32, 32, 0.3, 0, false);
    const inverted = makePatternTile(32, 32, 1, 0, true);

    const resLuma = computeSsim(base, lumaShifted);
    expect(resLuma.luminance).toBeLessThan(0.96);
    expect(resLuma.contrast).toBeGreaterThan(0.99);
    expect(resLuma.structure).toBeGreaterThan(0.99);

    const resContrast = computeSsim(base, contrastReduced);
    expect(resContrast.luminance).toBeGreaterThan(0.99);
    expect(resContrast.contrast).toBeLessThan(0.65);
    expect(resContrast.structure).toBeGreaterThan(0.99);

    const resStructure = computeSsim(base, inverted);
    expect(resStructure.luminance).toBeGreaterThan(0.99);
    expect(resStructure.contrast).toBeGreaterThan(0.99);
    expect(resStructure.structure).toBeLessThan(0);
    expect(resStructure.score).toBeLessThan(0.05);
  });

  it("완전 투명 픽셀의 숨은 RGB 쓰레기값은 배경 합성 후 동일 시각 결과(SSIM=1)로 판정하고 크기 불일치는 오류를 던진다", () => {
    const a = makeSolidTile(8, 8, [0, 0, 0, 0]);
    const b = makeSolidTile(8, 8, [255, 80, 120, 0]);
    expect(computeSsim(a, b).score).toBeCloseTo(1, 6);

    const wrongSize = makeSolidTile(16, 8, [0, 0, 0, 255]);
    expect(() => computeSsim(a, wrongSize)).toThrow(/dimensions mismatch/i);
  });
});

describe("② CIEDE2000 ΔE (sRGB → XYZ → CIELAB → ΔE00) 표준 일치성", () => {
  it("Sharma et al. (2005) 공식 CIEDE2000 벤치마크 테스트 쌍을 소수점 넷째 자리 수준으로 일치시킨다", () => {
    // Sharma, Wu, Dalal (2005) Table 1 Pairs #1, #2, #19
    expect(
      computeCiede2000({ l: 50.0, a: 2.6772, b: -79.7751 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.0425, 3);
    expect(
      computeCiede2000({ l: 50.0, a: 3.1571, b: -77.2803 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.8615, 3);
    expect(
      computeCiede2000({ l: 50.0, a: 0.0, b: 0.0 }, { l: 50.0, a: -1.0, b: 2.0 }),
    ).toBeCloseTo(2.3669, 3);

    // D65 백색/흑색 sRGB -> Lab 변환 및 대칭성 확인
    const whiteLab = srgbToLab(255, 255, 255);
    expect(whiteLab.l).toBeCloseTo(100, 2);
    expect(Math.abs(whiteLab.a)).toBeLessThan(0.02);
    expect(Math.abs(whiteLab.b)).toBeLessThan(0.02);

    const blackLab = srgbToLab(0, 0, 0);
    expect(blackLab.l).toBeCloseTo(0, 4);

    const coral = srgbToLab(232, 118, 92);
    const teal = srgbToLab(54, 168, 174);
    expect(computeCiede2000(coral, coral)).toBe(0);
    expect(computeCiede2000(coral, teal)).toBeCloseTo(computeCiede2000(teal, coral), 6);
  });

  it("타일 단위 ΔE00 평균·p95·최대 오차 및 최악 픽셀 좌표를 정확히 보고한다", () => {
    const ref = makeSolidTile(10, 10, [180, 140, 110, 255]);
    const candData = new Uint8ClampedArray(ref.data);
    // 상위 8개 픽셀만 강하게 변조 (95 백분위수에 잡히고 평균은 낮음)
    for (let x = 0; x < 8; x += 1) {
      const off = (3 * 10 + x) * 4;
      candData[off] = 60;
      candData[off + 1] = 200;
      candData[off + 2] = 220;
    }
    // (7, 3) 픽셀에 최대 색차 주입
    const worstOff = (3 * 10 + 7) * 4;
    candData[worstOff] = 20;
    candData[worstOff + 1] = 230;
    candData[worstOff + 2] = 245;

    const result = evaluateCiede2000Tile(ref, { width: 10, height: 10, data: candData });
    expect(result.meanDeltaE).toBeGreaterThan(1.5);
    expect(result.p95DeltaE).toBeGreaterThan(result.meanDeltaE * 4);
    expect(result.maxDeltaE).toBeGreaterThanOrEqual(result.p95DeltaE);
    expect(result.jndExceedCount).toBe(8);
    expect(result.worstPixel.x).toBe(7);
    expect(result.worstPixel.y).toBe(3);
  });
});

describe("③ PSNR (dB) 및 최대 절대 픽셀 오차(maxAbsDiff, RMSE)", () => {
  it("무손실 동일 버퍼는 PSNR=Infinity/RMSE=0, 균일 1 오차는 48.13 dB, 단일 픽셀 편차는 정확히 일치한다", () => {
    const ref = makeSolidTile(16, 16, [120, 140, 160, 255]);
    const exact = evaluatePsnrAndPixelError(ref, makeSolidTile(16, 16, [120, 140, 160, 255]));
    expect(exact.psnrDb).toBe(Number.POSITIVE_INFINITY);
    expect(exact.rmse).toBe(0);
    expect(exact.maxAbsDiff).toBe(0);
    expect(exact.isBitExact).toBe(true);

    const plusOne = makeSolidTile(16, 16, [121, 141, 161, 254]);
    const uniformRes = evaluatePsnrAndPixelError(ref, plusOne);
    expect(uniformRes.rmse).toBeCloseTo(1, 6);
    expect(uniformRes.psnrDb).toBeCloseTo(20 * Math.log10(255), 4);
    expect(uniformRes.maxAbsDiff).toBe(1);
    expect(uniformRes.isBitExact).toBe(false);

    const singleData = new Uint8ClampedArray(ref.data);
    singleData[0] = 132; // +12
    singleData[1] = 115; // -25
    singleData[2] = 167; // +7
    singleData[3] = 215; // -40
    const singleRes = evaluatePsnrAndPixelError(ref, { width: 16, height: 16, data: singleData });
    expect(singleRes.maxAbsDiff).toBe(40);
    expect(singleRes.alphaMaxAbsDiff).toBe(40);
    expect(singleRes.channelMaxAbsDiff).toEqual({ r: 12, g: 25, b: 7, a: 40 });
    expect(singleRes.changedPixelCount).toBe(1);
  });
});

describe("④ 프리멀티플라이 알파 헤일로(어두운 테두리 아티팩트) 탐지기", () => {
  it("정상 안티앨리어스 밝은 스트로크와 검정 잉크에서는 오탐 0건, 이중 프리멀티플라이와 RGB>A 오버플로는 즉시 FAIL 판정한다", () => {
    const cleanBright = makeAntialiasedDiskTile(32, [242, 206, 86], false);
    const cleanAudit = detectPremultipliedAlphaHalo(cleanBright);
    expect(cleanAudit.detected).toBe(false);
    expect(cleanAudit.severity).toBe("none");
    expect(cleanAudit.haloPixelCount).toBe(0);

    const cleanInk = makeAntialiasedDiskTile(32, [18, 20, 24], false);
    const inkAudit = detectPremultipliedAlphaHalo(cleanInk);
    expect(inkAudit.detected).toBe(false);

    const darkHalo = makeAntialiasedDiskTile(32, [242, 206, 86], true);
    const haloAudit = detectPremultipliedAlphaHalo(darkHalo);
    expect(haloAudit.detected).toBe(true);
    expect(haloAudit.severity).toBe("fail");
    expect(haloAudit.haloPixelCount).toBeGreaterThan(10);
    expect(haloAudit.maxLuminanceDip).toBeGreaterThan(15);
    expect(haloAudit.hotspotCoordinates.length).toBeGreaterThan(0);

    // premultiplied 모드에서 R > A 비정상 오버플로 탐지
    const overflowTile = makeSolidTile(8, 8, [220, 120, 120, 100], "premultiplied");
    const overflowAudit = detectPremultipliedAlphaHalo(overflowTile);
    expect(overflowAudit.overflowPixelCount).toBe(64);
    expect(overflowAudit.detected).toBe(true);
    expect(overflowAudit.severity).toBe("fail");
  });
});

describe("⑤ 라이브 프리뷰 vs 커밋 캔버스 패리티 + 12대 매체 텍스처 무결성 회귀 게이트", () => {
  it("정상 패리티는 12대 매체 전수 PASS(SSIM=1, ΔE=0, 헤일로=0)를 반환한다", () => {
    const report = evaluate12MediaTextureIntegrityGate({ tileSize: 32, faultScenario: "clean-parity" });
    expect(report.mediaResults).toHaveLength(12);
    expect(MEDIA_12_PROFILES).toHaveLength(12);
    expect(report.overallStatus).toBe("pass");
    expect(report.passCount).toBe(12);
    expect(report.warnCount).toBe(0);
    expect(report.failCount).toBe(0);
    expect(report.meanSsim).toBeCloseTo(1, 6);
    expect(report.meanDeltaE).toBeCloseTo(0, 6);
    expect(report.totalHaloPixels).toBe(0);
    expect(report.worstMedia).toEqual([]);
  });

  it("4종 변조 시나리오(헤일로·색역 드리프트·질감 블러·2px 오프셋) 모두 회귀 FAIL과 타일 핫스팟을 탐지한다", () => {
    const haloReport = evaluate12MediaTextureIntegrityGate({ tileSize: 32, faultScenario: "premultiplied-alpha-halo" });
    expect(haloReport.overallStatus).toBe("fail");
    expect(haloReport.totalHaloPixels).toBeGreaterThan(20);
    const crayonHalo = haloReport.mediaResults.find((m) => m.familyId === "crayon");
    expect(crayonHalo?.audit.alphaHalo.detected).toBe(true);

    const gamutReport = evaluate12MediaTextureIntegrityGate({ tileSize: 32, faultScenario: "color-gamut-shift" });
    expect(gamutReport.overallStatus).toBe("fail");
    expect(gamutReport.meanDeltaE).toBeGreaterThan(2.3);
    expect(gamutReport.maxP95DeltaE).toBeGreaterThan(4.5);

    const blurReport = evaluate12MediaTextureIntegrityGate({ tileSize: 32, faultScenario: "texture-grain-blur" });
    expect(blurReport.overallStatus).toBe("fail");
    const crayonBlur = blurReport.mediaResults.find((m) => m.familyId === "crayon");
    expect(crayonBlur?.audit.grainRetentionRatio).toBeLessThan(0.75);

    const offsetReport = evaluate12MediaTextureIntegrityGate({ tileSize: 32, faultScenario: "commit-tile-offset" });
    expect(offsetReport.overallStatus).toBe("fail");
    expect(offsetReport.failCount).toBeGreaterThan(6);
  });

  it("특정 타일(1,1)에만 국소 결함을 주입하면 해당 타일 좌표와 정확한 픽셀 좌표를 핫스팟으로 보고하고 WARN 판정도 동작한다", () => {
    const ref = synthesizeMediumRgbaTile("oil", { size: 32 });
    const candData = new Uint8ClampedArray(ref.data);
    // 우하단 타일 (tileX=1, tileY=1)의 (22, 24) 부근 2x2만 강하게 오염
    for (let y = 23; y <= 24; y += 1) {
      for (let x = 21; x <= 22; x += 1) {
        const off = (y * 32 + x) * 4;
        candData[off] = 10;
        candData[off + 1] = 240;
        candData[off + 2] = 240;
        candData[off + 3] = 255;
      }
    }
    const parity = evaluateLiveVsCommittedParity({
      livePreview: ref,
      committedCanvas: { width: 32, height: 32, data: candData },
      mediumId: "oil",
      tileGridSize: 16,
    });
    expect(parity.status).toBe("fail");
    expect(parity.flaggedHotspots.length).toBe(1);
    const spot = parity.flaggedHotspots[0];
    expect(spot?.tileX).toBe(1);
    expect(spot?.tileY).toBe(1);
    expect(spot?.peakErrorPixel.x).toBeGreaterThanOrEqual(21);
    expect(spot?.peakErrorPixel.y).toBeGreaterThanOrEqual(23);

    // 경미한 오차(±6)로 WARN 판정 검증
    const mildData = new Uint8ClampedArray(ref.data);
    const centerOff = (16 * 32 + 16) * 4;
    mildData[centerOff] = Math.max(0, (mildData[centerOff] ?? 0) - 6);
    const warnParity = evaluateLiveVsCommittedParity({
      livePreview: ref,
      committedCanvas: { width: 32, height: 32, data: mildData },
      mediumId: "oil",
      tileGridSize: 16,
    });
    expect(warnParity.status).toBe("warn");
  });

  it("injectVisualFaultScenario가 원본 버퍼를 변경하지 않고 불변 복사본을 반환한다", () => {
    const ref = synthesizeMediumRgbaTile("watercolor", { size: 24 });
    const snapshot = Array.from(ref.data);
    const mutated = injectVisualFaultScenario(ref, "premultiplied-alpha-halo");
    expect(Array.from(ref.data)).toEqual(snapshot);
    expect(mutated.data).not.toBe(ref.data);
  });
});

describe("StudioVisualIntegrityOraclePanel: 단독 렌더 · 시나리오 비교 · KO/EN · Calm Atelier 위생", () => {
  it("props 없이 단독 렌더링되며 정상↔변조 시나리오 전환, 매체 선택, 전체 감사 콜백이 실시간 동작한다", () => {
    const onAuditComplete = vi.fn();
    const { rerender } = render(<StudioVisualIntegrityOraclePanel />);

    expect(screen.getByTestId("visual-integrity-oracle-panel")).toBeTruthy();
    expect(screen.getByTestId("visual-oracle-status-badge").textContent).toContain("PASS");
    expect(screen.getByTestId("visual-oracle-ssim-value").textContent).toBe("1.0000");
    expect(screen.getByTestId("visual-oracle-psnr-value").textContent).toContain("∞ dB");
    expect(screen.getByTestId("visual-oracle-hotspots-empty")).toBeTruthy();

    // 알파 헤일로 변조 시나리오 전환 -> 실시간 FAIL 및 헤일로 픽셀 탐지 확인
    fireEvent.click(screen.getByTestId("visual-oracle-scenario-premultiplied-alpha-halo"));
    expect(screen.getByTestId("visual-oracle-status-badge").textContent).toContain("FAIL");
    expect(screen.getByTestId("visual-oracle-halo-value").textContent).toContain("탐지");
    expect(screen.getByTestId("visual-oracle-hotspots-list")).toBeTruthy();

    // 색역 드리프트 시나리오 전환 -> ΔE00 증가 확인
    fireEvent.click(screen.getByTestId("visual-oracle-scenario-color-gamut-shift"));
    expect(Number(screen.getByTestId("visual-oracle-deltae-value").textContent)).toBeGreaterThan(2);

    // 12대 매체 버튼 전환
    fireEvent.click(screen.getByTestId("visual-oracle-medium-watercolor"));
    expect(screen.getByTestId("visual-oracle-medium-watercolor").getAttribute("aria-pressed")).toBe("true");

    // 감사 재실행 콜백 검증
    rerender(<StudioVisualIntegrityOraclePanel onAuditComplete={onAuditComplete} />);
    fireEvent.click(screen.getByTestId("visual-oracle-run-audit-btn"));
    expect(onAuditComplete).toHaveBeenCalledTimes(1);
    expect(onAuditComplete.mock.calls[0]?.[0]?.mediaResults).toHaveLength(12);
  });

  it("영어 로케일(en) 전환 시 한글 없이 영어 지표·라벨만 정상 출력된다", () => {
    const { container } = render(
      <StudioVisualIntegrityOraclePanel locale="en" initialScenario="premultiplied-alpha-halo" />,
    );
    expect(screen.getByTestId("visual-oracle-status-badge").textContent).toContain("FAIL");
    expect(screen.getByTestId("visual-oracle-halo-value").textContent).toContain("Detected");
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("Calm Atelier 토큰 위생(원시 hex/rgb/hsl 금지 · localStorage/sessionStorage 금지 · 모든 파일 800줄 이하)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/visual-integrity-oracle");
    const files = [
      "visual-integrity-metrics.ts",
      "visual-integrity-oracle-engine.ts",
      "StudioVisualIntegrityOraclePanel.tsx",
      "index.ts",
      "visual-integrity-oracle.test.tsx",
    ];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "visual-integrity-oracle.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/);
        expect(src).not.toMatch(/\bsessionStorage\b/);
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioVisualIntegrityOraclePanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSrc).not.toMatch(/\brgba?\s*\(/i);
    expect(panelSrc).not.toMatch(/\bhsla?\s*\(/i);
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
