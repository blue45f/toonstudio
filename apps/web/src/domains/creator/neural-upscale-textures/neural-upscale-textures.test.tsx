// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_WEBTOON_SCENE_PRESETS,
  PROCEDURAL_MATERIAL_PRESETS,
  StudioNeuralUpscaleTexturesPanel,
  WEBGPU_EDGE_UPSCALE_WGSL,
  bilinearUpscale,
  computePsnr,
  createDemoWebtoonSampleBuffer,
  detectUpscalerBackend,
  downsampleBox,
  measureEdgeSharpness,
  measureTileSeamContinuity,
  roughnessToRgbaBuffer,
  synthesizeProceduralTexture,
  upscaleWebtoonBuffer,
  validateUpscalerWgsl,
  type ProceduralMaterialId,
  type RgbaImageBuffer,
} from "./index";

afterEach(cleanup);

function createStepEdgeBuffer(width: number, height: number): RgbaImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isInk = x >= Math.floor(width * 0.42) && x <= Math.floor(width * 0.56);
      const val = isInk ? 22 : 244;
      const k = (y * width + x) * 4;
      data[k] = val;
      data[k + 1] = val;
      data[k + 2] = val;
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}

function createSolidBuffer(width: number, height: number, r: number, g: number, b: number): RgbaImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const k = i * 4;
    data[k] = r;
    data[k + 1] = g;
    data[k + 2] = b;
    data[k + 3] = 255;
  }
  return { width, height, data };
}

function measureNormalXyRelief(normalRgba: Uint8ClampedArray): number {
  const count = Math.floor(normalRgba.length / 4);
  if (count <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const k = i * 4;
    const nx = (normalRgba[k] ?? 128) / 127.5 - 1;
    const ny = (normalRgba[k + 1] ?? 128) / 127.5 - 1;
    sum += Math.hypot(nx, ny);
  }
  return sum / count;
}

describe("1. 실시간 엣지 보존 업스케일러 (edge-preserving-upscaler)", () => {
  it("2× 업스케일링이 정확한 2W×2H 해상도와 유효한 RGBA·불투명 알파를 출력한다", () => {
    const src = createDemoWebtoonSampleBuffer("ink-lineart", 32, 24);
    const res = upscaleWebtoonBuffer(src, { scaleFactor: 2 });

    expect(res.output.width).toBe(64);
    expect(res.output.height).toBe(48);
    expect(res.output.data).toHaveLength(64 * 48 * 4);
    expect(res.metrics.scaleFactor).toBe(2);
    expect(res.metrics.processingTimeMs).toBeGreaterThan(0);
    for (let i = 3; i < res.output.data.length; i += 4) {
      expect(res.output.data[i]).toBe(255);
    }
  });

  it("4× 업스케일링이 3종 웹툰 샘플 컷 모두에서 정확한 4W×4H 버퍼를 생성한다", () => {
    expect(DEMO_WEBTOON_SCENE_PRESETS).toHaveLength(3);
    for (const preset of DEMO_WEBTOON_SCENE_PRESETS) {
      const src = createDemoWebtoonSampleBuffer(preset.id, 24, 24);
      const res = upscaleWebtoonBuffer(src, { scaleFactor: 4 });
      expect(res.output.width).toBe(96);
      expect(res.output.height).toBe(96);
      expect(res.output.data).toHaveLength(96 * 96 * 4);
      expect(res.metrics.haloOvershootCount).toBe(0);
    }
  });

  it("Lanczos-3 + Sobel 직교 방향 선명화가 이중선형 기준 대비 엣지 선명도를 뚜렷하게 개선한다", () => {
    const src = createDemoWebtoonSampleBuffer("ink-lineart", 48, 48);
    const res = upscaleWebtoonBuffer(src, {
      scaleFactor: 2,
      edgeSharpenStrength: 0.9,
      lineThinnessStrength: 0.4,
      antiRingingStrength: 1.0,
    });

    const bilinearSharpness = measureEdgeSharpness(res.bilinearBaseline);
    expect(res.metrics.upscaledEdgeSharpness).toBeGreaterThan(bilinearSharpness);
    expect(res.metrics.edgeSharpnessGainPercent).toBeGreaterThan(8);
  });

  it("안티-링잉 로컬 클램프(1.0)는 고대비 스텝 엣지에서 할로 0%를 보장하고 해제(0.0) 시 링잉을 노출한다", () => {
    const step = createStepEdgeBuffer(32, 32);
    const clamped = upscaleWebtoonBuffer(step, {
      scaleFactor: 2,
      edgeSharpenStrength: 1.0,
      antiRingingStrength: 1.0,
    });
    const unclamped = upscaleWebtoonBuffer(step, {
      scaleFactor: 2,
      edgeSharpenStrength: 1.0,
      antiRingingStrength: 0.0,
    });

    expect(clamped.metrics.haloOvershootCount).toBe(0);
    expect(clamped.metrics.haloOvershootRate).toBe(0);
    expect(unclamped.metrics.haloOvershootCount).toBeGreaterThan(0);
  });

  it("선화 굵기 보존(lineThinnessStrength)이 어두운 잉크 번짐을 억제해 선화 면적 팽창을 줄인다", () => {
    const src = createDemoWebtoonSampleBuffer("ink-lineart", 48, 48);
    const noThin = upscaleWebtoonBuffer(src, {
      scaleFactor: 2,
      edgeSharpenStrength: 0.5,
      lineThinnessStrength: 0,
      antiRingingStrength: 1.0,
    });
    const withThin = upscaleWebtoonBuffer(src, {
      scaleFactor: 2,
      edgeSharpenStrength: 0.5,
      lineThinnessStrength: 0.9,
      antiRingingStrength: 1.0,
    });

    expect(withThin.metrics.lineWidthPreservationRatio).toBeLessThan(
      noThin.metrics.lineWidthPreservationRatio,
    );
    expect(withThin.metrics.lineWidthPreservationRatio).toBeGreaterThan(0.5);
  });

  it("고해상도 정답 기준(referenceHighRes) 대비 PSNR 산출에서 이중선형 기준을 상회한다", () => {
    const highRes = createDemoWebtoonSampleBuffer("cel-character", 96, 96);
    const lowRes = downsampleBox(highRes, 2);
    const res = upscaleWebtoonBuffer(lowRes, {
      scaleFactor: 2,
      edgeSharpenStrength: 0.72,
      lineThinnessStrength: 0.45,
      antiRingingStrength: 1.0,
      referenceHighRes: highRes,
    });

    expect(computePsnr(highRes, highRes)).toBe(99.99);
    expect(res.metrics.referencePsnrDb).not.toBeNull();
    expect(res.metrics.bilinearReferencePsnrDb).not.toBeNull();
    expect(res.metrics.referencePsnrDb!).toBeGreaterThan(res.metrics.bilinearReferencePsnrDb!);
    expect(res.metrics.roundTripPsnrDb).toBeGreaterThan(25);
  });

  it("단색 버퍼와 2×2 극소 해상도 버퍼에서도 NaN·할로 없이 정확히 보존된다", () => {
    const flat = createSolidBuffer(16, 16, 120, 145, 178);
    const flatRes = upscaleWebtoonBuffer(flat, { scaleFactor: 2 });
    expect(flatRes.metrics.upscaledEdgeSharpness).toBe(0);
    expect(flatRes.metrics.haloOvershootCount).toBe(0);
    expect(flatRes.output.data[0]).toBe(120);
    expect(flatRes.output.data[1]).toBe(145);
    expect(flatRes.output.data[2]).toBe(178);

    const tiny = createSolidBuffer(2, 2, 40, 80, 120);
    const tinyRes = upscaleWebtoonBuffer(tiny, { scaleFactor: 4 });
    expect(tinyRes.output.width).toBe(8);
    expect(tinyRes.output.height).toBe(8);
    expect(bilinearUpscale(tiny, 2).width).toBe(4);
  });

  it("WEBGPU_EDGE_UPSCALE_WGSL 텍스트 구조 검사와 jsdom CPU 실행 경계가 통과한다", () => {
    const report = validateUpscalerWgsl(WEBGPU_EDGE_UPSCALE_WGSL);
    expect(report.valid).toBe(true);
    expect(report).toMatchObject({ validationKind: "text-only", compiled: false });
    expect(report.balancedDelimiters).toBe(true);
    expect(report.workgroupSize).toBe("8, 8, 1");
    expect(report.bindingCount).toBeGreaterThanOrEqual(4);
    expect(report.entryPoints).toEqual([
      "lanczos3_anti_ring_pass",
      "sobel_edge_thin_sharpen_pass",
    ]);
    expect(detectUpscalerBackend()).toBe("cpu");
  });
});

describe("2. 절차적 심리스 PBR·망점 텍스처 합성기 (procedural-texture-synth)", () => {
  const allMaterialIds: readonly ProceduralMaterialId[] = [
    "hanji-fiber",
    "linen-weave",
    "red-brick",
    "marble-vein",
    "oak-woodgrain",
    "vintage-halftone",
  ];

  it("6종 실전 재질 모두 Albedo RGBA · Sobel Normal RGBA · Roughness R 버퍼를 동시 출력한다", () => {
    expect(PROCEDURAL_MATERIAL_PRESETS.map((p) => p.id)).toEqual(allMaterialIds);
    for (const id of allMaterialIds) {
      const tex = synthesizeProceduralTexture(id, { width: 64, height: 64, seed: 42 });
      expect(tex.albedoRgba).toHaveLength(64 * 64 * 4);
      expect(tex.normalRgba).toHaveLength(64 * 64 * 4);
      expect(tex.roughnessR).toHaveLength(64 * 64);
      expect(tex.heightField).toHaveLength(64 * 64);
      expect(tex.metadata.materialId).toBe(id);
    }
  });

  it("토러스 매핑 주기 노이즈로 6종 재질 모두 경계 오차 0 및 Albedo·Normal 심리스 판정을 통과한다", () => {
    for (const id of allMaterialIds) {
      const tex = synthesizeProceduralTexture(id, { width: 64, height: 64, seed: 77 });
      expect(tex.metadata.periodicBoundaryError).toBe(0);
      expect(tex.seamReport.periodicBoundaryError).toBe(0);
      expect(tex.seamReport.isSeamless).toBe(true);
      expect(tex.seamReport.continuityScore).toBeGreaterThanOrEqual(85);
      expect(tex.normalSeamReport.isSeamless).toBe(true);
    }
  });

  it("Sobel 노멀 맵이 6종 모두 유효한 양의 Z 탄젠트 공간 단위 벡터와 실제 표면 기복을 갖는다", () => {
    for (const id of allMaterialIds) {
      const tex = synthesizeProceduralTexture(id, { width: 64, height: 64, seed: 19 });
      let minB = 255;
      let maxUnitErr = 0;
      for (let i = 0; i < 64 * 64; i += 1) {
        const k = i * 4;
        const nx = (tex.normalRgba[k] ?? 128) / 127.5 - 1;
        const ny = (tex.normalRgba[k + 1] ?? 128) / 127.5 - 1;
        const nz = (tex.normalRgba[k + 2] ?? 255) / 127.5 - 1;
        minB = Math.min(minB, tex.normalRgba[k + 2] ?? 0);
        maxUnitErr = Math.max(maxUnitErr, Math.abs(Math.hypot(nx, ny, nz) - 1));
        expect(tex.normalRgba[k + 3]).toBe(255);
      }
      expect(minB).toBeGreaterThanOrEqual(128);
      expect(maxUnitErr).toBeLessThan(0.05);
      expect(measureNormalXyRelief(tex.normalRgba)).toBeGreaterThan(0.02);
    }
  });

  it("거칠기 R 채널이 연마된 대리석(저거칠기)과 적벽돌·한지(고거칠기)의 물리 차이를 정확히 반영한다", () => {
    const marble = synthesizeProceduralTexture("marble-vein", { width: 64, height: 64 });
    const brick = synthesizeProceduralTexture("red-brick", { width: 64, height: 64 });
    const hanji = synthesizeProceduralTexture("hanji-fiber", { width: 64, height: 64 });

    expect(marble.metadata.meanRoughness).toBeLessThan(0.35);
    expect(brick.metadata.meanRoughness).toBeGreaterThan(0.75);
    expect(hanji.metadata.meanRoughness).toBeGreaterThan(0.75);

    const grayRgba = roughnessToRgbaBuffer(marble.roughnessR, marble.width, marble.height);
    expect(grayRgba).toHaveLength(64 * 64 * 4);
    expect(grayRgba[0]).toBe(marble.roughnessR[0]);
    expect(grayRgba[1]).toBe(marble.roughnessR[0]);
    expect(grayRgba[2]).toBe(marble.roughnessR[0]);
    expect(grayRgba[3]).toBe(255);
  });

  it("measureTileSeamContinuity는 비심리스 선형 그라데이션을 불연속으로 정확히 검출한다", () => {
    const w = 64;
    const h = 64;
    const broken = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const val = Math.round((x / (w - 1)) * 255);
        const k = (y * w + x) * 4;
        broken[k] = val;
        broken[k + 1] = val;
        broken[k + 2] = val;
        broken[k + 3] = 255;
      }
    }
    const report = measureTileSeamContinuity(broken, w, h);
    expect(report.isSeamless).toBe(false);
    expect(report.seamToInteriorRatio).toBeGreaterThan(10);
    expect(report.continuityScore).toBeLessThan(50);
  });

  it("동일 시드에서는 비트 단위로 동일하게 재현되고 시드 변경 시 서로 다른 패턴을 생성한다", () => {
    const a1 = synthesizeProceduralTexture("oak-woodgrain", { width: 48, height: 48, seed: 123, tileScale: 2 });
    const a2 = synthesizeProceduralTexture("oak-woodgrain", { width: 48, height: 48, seed: 123, tileScale: 2 });
    const b = synthesizeProceduralTexture("oak-woodgrain", { width: 48, height: 48, seed: 456, tileScale: 2 });

    expect(Array.from(a1.albedoRgba)).toEqual(Array.from(a2.albedoRgba));
    expect(Array.from(a1.normalRgba)).toEqual(Array.from(a2.normalRgba));
    expect(Array.from(a1.roughnessR)).toEqual(Array.from(a2.roughnessR));

    let diffCount = 0;
    for (let i = 0; i < a1.albedoRgba.length; i += 4) {
      if (a1.albedoRgba[i] !== b.albedoRgba[i]) diffCount += 1;
    }
    expect(diffCount).toBeGreaterThan(200);
  });

  it("normalStrength 증가 시 노멀 맵 XY 기복이 커지고 roughnessBias 조절이 평균 거칠기에 단조 반영된다", () => {
    const soft = synthesizeProceduralTexture("red-brick", { width: 64, height: 64, normalStrength: 0.8 });
    const strong = synthesizeProceduralTexture("red-brick", { width: 64, height: 64, normalStrength: 3.6 });
    expect(measureNormalXyRelief(strong.normalRgba)).toBeGreaterThan(measureNormalXyRelief(soft.normalRgba));

    const glossier = synthesizeProceduralTexture("linen-weave", { width: 48, height: 48, roughnessBias: -0.2 });
    const rougher = synthesizeProceduralTexture("linen-weave", { width: 48, height: 48, roughnessBias: 0.15 });
    expect(rougher.metadata.meanRoughness).toBeGreaterThan(glossier.metadata.meanRoughness + 0.15);
  });

  it("빈티지 망점 톤은 고대비 잉크 도트와 밝은 종이 배경을 이봉 분포로 합성하며 경계 오차 0을 유지한다", () => {
    const halftone = synthesizeProceduralTexture("vintage-halftone", { width: 64, height: 64, tileScale: 2 });
    let darkPixels = 0;
    let brightPixels = 0;
    for (let i = 0; i < halftone.albedoRgba.length; i += 4) {
      const r = halftone.albedoRgba[i] ?? 0;
      if (r < 90) darkPixels += 1;
      else if (r > 190) brightPixels += 1;
    }
    expect(darkPixels).toBeGreaterThan(300);
    expect(brightPixels).toBeGreaterThan(1000);
    expect(halftone.metadata.periodicBoundaryError).toBe(0);
    expect(halftone.seamReport.isSeamless).toBe(true);
  });
});

describe("3. StudioNeuralUpscaleTexturesPanel 통합 UI 및 엄격 코드 위생 계약", () => {
  it("Props 없이 단독 렌더링되고 2개 탭(업스케일러 / 심리스 PBR·망점 텍스처)을 전환한다", () => {
    render(<StudioNeuralUpscaleTexturesPanel />);
    expect(screen.getByTestId("neural-upscale-textures-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-upscaler").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("upscale-resolution-readout").textContent).toBe("128×128");
    expect(screen.getByTestId("upscale-halo-readout").textContent).toBe("0.00%");

    fireEvent.click(screen.getByTestId("tab-textures"));
    expect(screen.getByTestId("tab-textures").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("texture-seam-status").textContent).toContain("심리스 통과");
    expect(screen.getByTestId("texture-periodic-error").textContent).toBe("0.000000");
  });

  it("Tab 1에서 4× 전환·샘플 변경·파라미터 조절·WGSL 토글이 지표와 콜백을 즉시 갱신한다", () => {
    const onUpscaleComplete = vi.fn();
    render(<StudioNeuralUpscaleTexturesPanel onUpscaleComplete={onUpscaleComplete} />);

    fireEvent.click(screen.getByTestId("scale-factor-4x"));
    expect(screen.getByTestId("upscale-resolution-readout").textContent).toBe("256×256");

    fireEvent.click(screen.getByTestId("scene-preset-cel-character"));
    fireEvent.click(screen.getByTestId("preview-mode-edge-preserving"));
    fireEvent.change(screen.getByTestId("edge-sharpen-slider"), { target: { value: "1.1" } });
    fireEvent.change(screen.getByTestId("anti-ringing-slider"), { target: { value: "0" } });
    expect(screen.getByTestId("upscale-halo-readout").textContent).not.toBe("0.00%");

    fireEvent.click(screen.getByTestId("toggle-wgsl-source-btn"));
    expect(screen.getByTestId("wgsl-source-preview").textContent).toContain("lanczos3_anti_ring_pass");
    expect(onUpscaleComplete).toHaveBeenCalled();
  });

  it("Tab 2에서 6종 재질 전환·채널 뷰 전환·시드 변경 시 심리스 지표와 콜백이 즉시 갱신한다", () => {
    const onTextureSynthesized = vi.fn();
    render(
      <StudioNeuralUpscaleTexturesPanel
        initialTab="textures"
        onTextureSynthesized={onTextureSynthesized}
      />,
    );

    fireEvent.click(screen.getByTestId("material-btn-marble-vein"));
    expect(screen.getByTestId("texture-seam-status").textContent).toContain("심리스 통과");
    const marbleRough = screen.getByTestId("texture-roughness-readout").textContent ?? "";

    fireEvent.click(screen.getByTestId("material-btn-red-brick"));
    const brickRough = screen.getByTestId("texture-roughness-readout").textContent ?? "";
    expect(brickRough).not.toBe(marbleRough);

    fireEvent.click(screen.getByTestId("channel-view-normal"));
    expect(screen.getByTestId("channel-view-normal").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("randomize-seed-btn"));
    expect(screen.getByTestId("texture-thumb-albedo")).toBeTruthy();
    expect(screen.getByTestId("texture-thumb-normal")).toBeTruthy();
    expect(screen.getByTestId("texture-thumb-roughness")).toBeTruthy();
    expect(onTextureSynthesized).toHaveBeenCalled();
  });

  it("영문 로케일(locale='en')에서 영문 라벨과 심리스 상태 문구를 정확히 렌더링한다", () => {
    render(<StudioNeuralUpscaleTexturesPanel locale="en" initialTab="textures" />);
    expect(screen.getByTestId("tab-upscaler").textContent).toBe("Upscale");
    expect(screen.getByRole("tab", { name: "Upscale: 2×/4× Edge Upscaler" })).toBe(screen.getByTestId("tab-upscaler"));
    expect(screen.getByTestId("texture-seam-status").textContent).toContain("Seamless");
  });

  it("Tab 1 분할 비교 슬라이더와 선화 굵기 슬라이더가 인터랙티브하게 동작한다", () => {
    render(<StudioNeuralUpscaleTexturesPanel />);
    const splitSlider = screen.getByTestId("upscaler-split-slider");
    fireEvent.change(splitSlider, { target: { value: "72" } });
    expect((splitSlider as HTMLInputElement).value).toBe("72");

    const beforeRatio = screen.getByTestId("line-width-ratio-readout").textContent;
    fireEvent.change(screen.getByTestId("line-thinness-slider"), { target: { value: "0" } });
    const afterRatio = screen.getByTestId("line-width-ratio-readout").textContent;
    expect(afterRatio).not.toBe(beforeRatio);
  });

  it("엄격 규칙(모든 파일 800줄 이하 · Storage/BigInt리터럴/private Map store/원시 색/props={} 0건)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "edge-preserving-upscaler.ts",
      "procedural-texture-synth.ts",
      "StudioNeuralUpscaleTexturesPanel.tsx",
      "index.ts",
      "neural-upscale-textures.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "neural-upscale-textures.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "neural-upscale-textures.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
