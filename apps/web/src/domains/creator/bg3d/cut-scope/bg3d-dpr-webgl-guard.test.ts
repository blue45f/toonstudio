import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BG3D_CANVAS_SAFE_DPR_MAX,
  clampBg3dCanvasDpr,
  compareBg3dThreeCutSnapshots,
  computeBg3dBytesSha256,
  computeBg3dRgbaSsim,
  evaluateBg3dHeapLeakGrowth,
  type Bg3dRgbaImageInput,
} from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));

function makePatternRgba(
  width: number,
  height: number,
  seed: number,
  alpha = 255,
): Bg3dRgbaImageInput {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      pixels[idx] = (x * 13 + y * 7 + seed * 37) % 256;
      pixels[idx + 1] = (x * 5 + y * 19 + seed * 53) % 256;
      pixels[idx + 2] = (x * 23 + y * 3 + seed * 71) % 256;
      pixels[idx + 3] = alpha;
    }
  }
  return { width, height, pixels };
}

function makeFakePngBytes(tag: string, rgba: Bg3dRgbaImageInput): Uint8Array {
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const tagBytes = new TextEncoder().encode(tag);
  const out = new Uint8Array(header.byteLength + tagBytes.byteLength + rgba.pixels.byteLength);
  out.set(header, 0);
  out.set(tagBytes, header.byteLength);
  out.set(rgba.pixels, header.byteLength + tagBytes.byteLength);
  return out;
}

describe("bg3d-dpr-webgl-guard — 모바일 DPR=3 WebGL 안전 클램프", () => {
  it("모바일 dpr=3 입력을 <= 2 안전 상한으로 캡하고 경고 코드·안내를 반환한다", () => {
    const mobile = clampBg3dCanvasDpr(3, 4096);
    expect(mobile.effectiveDpr).toBe(BG3D_CANVAS_SAFE_DPR_MAX);
    expect(mobile.effectiveDpr).toBeLessThanOrEqual(2);
    expect(mobile.wasClamped).toBe(true);
    expect(mobile.warningCodes).toContain("high-dpr-capped");
    expect(mobile.warningsKo[0]).toContain("3x");

    const mobileWithViewport = clampBg3dCanvasDpr(3, 2048, {
      cssWidth: 390,
      cssHeight: 844,
    });
    expect(mobileWithViewport.effectiveDpr).toBe(2);
    expect(mobileWithViewport.bitmapWidth).toBe(780);
    expect(mobileWithViewport.bitmapHeight).toBe(1688);
    expect(mobileWithViewport.exceedsMaxTextureSize).toBe(false);
  });

  it("WebGL MAX_TEXTURE_SIZE 또는 MAX_RENDERBUFFER_SIZE 초과 시 DPR을 추가 축소해 캔버스 폭발을 차단한다", () => {
    const tightGpu = clampBg3dCanvasDpr(3, 2048, {
      cssWidth: 1440,
      cssHeight: 1000,
    });
    expect(tightGpu.effectiveDpr).toBeLessThan(2);
    expect(tightGpu.bitmapWidth).not.toBeNull();
    expect(tightGpu.bitmapHeight).not.toBeNull();
    expect(tightGpu.bitmapWidth ?? 99999).toBeLessThanOrEqual(2048);
    expect(tightGpu.bitmapHeight ?? 99999).toBeLessThanOrEqual(2048);
    expect(tightGpu.exceedsMaxTextureSize).toBe(false);
    expect(tightGpu.warningCodes).toContain("high-dpr-capped");
    expect(tightGpu.warningCodes).toContain("webgl-max-texture-size-clamped");

    const tightRenderbuffer = clampBg3dCanvasDpr(2, 8192, {
      cssWidth: 1200,
      cssHeight: 800,
      maxRenderbufferSize: 1600,
    });
    expect(tightRenderbuffer.bitmapWidth ?? 99999).toBeLessThanOrEqual(1600);
    expect(tightRenderbuffer.exceedsMaxTextureSize).toBe(false);

    const lowTexNoDims = clampBg3dCanvasDpr(2, 1024);
    expect(lowTexNoDims.effectiveDpr).toBe(1);
    expect(lowTexNoDims.warningCodes).toContain("low-webgl-max-texture-size-clamped");
  });

  it("정상 범위 DPR(1x·1.5x·2x)은 경고 없이 통과하고 비정상 입력(NaN·0·음수·손상 maxTextureSize)은 안전 폴백한다", () => {
    for (const dpr of [1, 1.5, 2]) {
      const ok = clampBg3dCanvasDpr(dpr, 4096, { cssWidth: 800, cssHeight: 600 });
      expect(ok.effectiveDpr).toBe(dpr);
      expect(ok.wasClamped).toBe(false);
      expect(ok.warningCodes).toEqual([]);
    }

    const nanDpr = clampBg3dCanvasDpr(Number.NaN, 4096);
    expect(nanDpr.effectiveDpr).toBe(1);
    expect(nanDpr.warningCodes).toContain("invalid-dpr-fallback");

    const subOne = clampBg3dCanvasDpr(0.5, 0);
    expect(subOne.effectiveDpr).toBe(1);
    expect(subOne.warningCodes).toContain("dpr-below-minimum");
    expect(subOne.warningCodes).toContain("invalid-max-texture-size");
  });
});

describe("bg3d-dpr-webgl-guard — SHA-256·SSIM·3컷 공유 배경 회귀 판정·힙 누수율", () => {
  it("computeBg3dBytesSha256은 node:crypto SHA-256과 100% 일치하고 RGBA SSIM은 동일·변형·알파 차이를 정밀 탐지한다", () => {
    const sample = new TextEncoder().encode("toonstudio-bg3d-3cut-regression-v1");
    const nodeDigest = createHash("sha256").update(sample).digest("hex");
    expect(computeBg3dBytesSha256(sample)).toBe(nodeDigest);

    const base = makePatternRgba(32, 32, 1);
    const same = makePatternRgba(32, 32, 1);
    const identical = computeBg3dRgbaSsim(base, same);
    expect(identical.sha256Match).toBe(true);
    expect(identical.exactPixelMatch).toBe(true);
    expect(identical.changedPixelCount).toBe(0);
    expect(identical.ssim).toBeCloseTo(1, 12);
    expect(identical.psnrDb).toBe(Number.POSITIVE_INFINITY);

    const shifted = makePatternRgba(32, 32, 4);
    const diff = computeBg3dRgbaSsim(base, shifted);
    expect(diff.sha256Match).toBe(false);
    expect(diff.exactPixelMatch).toBe(false);
    expect(diff.ssim).toBeLessThan(0.8);

    // RGB가 같고 알파 채널만 바뀐 회귀도 SSIM이 즉시 감지한다.
    const alphaDrift = makePatternRgba(32, 32, 1, 128);
    const alphaDiff = computeBg3dRgbaSsim(base, alphaDrift);
    expect(alphaDiff.lumaSsim).toBeCloseTo(1, 12);
    expect(alphaDiff.alphaSsim).toBeLessThan(0.95);
    expect(alphaDiff.ssim).toBeLessThan(0.95);
  });

  it("3컷 공유 배경에서 1컷만 변경 시 통과하고 2·3컷 변형, 1컷 미갱신, 기준선 중복 프레임을 각각 실패로 차단한다", () => {
    const cut1Base = makePatternRgba(32, 32, 1);
    const cut1Mutated = makePatternRgba(32, 32, 9);
    const cut2Base = makePatternRgba(32, 32, 2);
    const cut3Base = makePatternRgba(32, 32, 3);

    const passReport = compareBg3dThreeCutSnapshots({
      cuts: [
        {
          cutId: "cut-1",
          role: "mutated",
          baselinePngBytes: makeFakePngBytes("cut1-base", cut1Base),
          candidatePngBytes: makeFakePngBytes("cut1-mut", cut1Mutated),
          baselineRgba: cut1Base,
          candidateRgba: cut1Mutated,
        },
        {
          cutId: "cut-2",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("cut2", cut2Base),
          candidatePngBytes: makeFakePngBytes("cut2", cut2Base),
          baselineRgba: cut2Base,
          candidateRgba: cut2Base,
        },
        {
          cutId: "cut-3",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("cut3", cut3Base),
          candidatePngBytes: makeFakePngBytes("cut3", cut3Base),
          baselineRgba: cut3Base,
          candidateRgba: cut3Base,
        },
      ],
    });

    expect(passReport.passed).toBe(true);
    expect(passReport.mutatedCutsVerified).toBe(1);
    expect(passReport.unchangedCutsVerified).toBe(2);
    expect(passReport.distinctBaselineHashes).toBe(3);
    expect(passReport.failures).toEqual([]);

    // 2번 컷이 1번 컷 카메라에 오염된 회귀
    const leakedCut2 = compareBg3dThreeCutSnapshots({
      cuts: [
        {
          cutId: "cut-1",
          role: "mutated",
          baselinePngBytes: makeFakePngBytes("cut1-base", cut1Base),
          candidatePngBytes: makeFakePngBytes("cut1-mut", cut1Mutated),
          baselineRgba: cut1Base,
          candidateRgba: cut1Mutated,
        },
        {
          cutId: "cut-2",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("cut2", cut2Base),
          candidatePngBytes: makeFakePngBytes("cut1-mut", cut1Mutated),
          baselineRgba: cut2Base,
          candidateRgba: cut1Mutated,
        },
        {
          cutId: "cut-3",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("cut3", cut3Base),
          candidatePngBytes: makeFakePngBytes("cut3", cut3Base),
          baselineRgba: cut3Base,
          candidateRgba: cut3Base,
        },
      ],
    });
    expect(leakedCut2.passed).toBe(false);
    expect(leakedCut2.failures.some((msg) => msg.includes("cut-2"))).toBe(true);

    // 1번 컷 카메라 갱신 누락 + 기준선 중복 프레임 탐지
    const staleAndDuplicate = compareBg3dThreeCutSnapshots({
      cuts: [
        {
          cutId: "cut-1",
          role: "mutated",
          baselinePngBytes: makeFakePngBytes("dup", cut1Base),
          candidatePngBytes: makeFakePngBytes("dup", cut1Base),
          baselineRgba: cut1Base,
          candidateRgba: cut1Base,
        },
        {
          cutId: "cut-2",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("dup", cut1Base),
          candidatePngBytes: makeFakePngBytes("dup", cut1Base),
          baselineRgba: cut1Base,
          candidateRgba: cut1Base,
        },
        {
          cutId: "cut-3",
          role: "unchanged",
          baselinePngBytes: makeFakePngBytes("cut3", cut3Base),
          candidatePngBytes: makeFakePngBytes("cut3", cut3Base),
          baselineRgba: cut3Base,
          candidateRgba: cut3Base,
        },
      ],
    });
    expect(staleAndDuplicate.passed).toBe(false);
    expect(staleAndDuplicate.failures.some((msg) => msg.includes("cut-1"))).toBe(true);
    expect(staleAndDuplicate.failures.some((msg) => msg.includes("고유 해시"))).toBe(true);
  });

  it("evaluateBg3dHeapLeakGrowth는 <= 5% 통과·> 5% 실패를 정확히 판정하고 모듈에 browser-KV 호출이 0건이다", () => {
    const steady = evaluateBg3dHeapLeakGrowth([
      { cycle: 10, usedBytes: 40_000_000 },
      { cycle: 250, usedBytes: 42_500_000 },
      { cycle: 500, usedBytes: 41_600_000 },
    ]);
    expect(steady.withinThreshold).toBe(true);
    expect(steady.leakRatio).toBeCloseTo(0.04, 6);
    expect(steady.peakUsedBytes).toBe(42_500_000);

    const leaky = evaluateBg3dHeapLeakGrowth([
      { cycle: 10, usedBytes: 40_000_000 },
      { cycle: 500, usedBytes: 43_200_000 },
    ]);
    expect(leaky.withinThreshold).toBe(false);
    expect(leaky.leakRatio).toBeCloseTo(0.08, 6);

    const guardSource = readFileSync(resolve(HERE, "bg3d-dpr-webgl-guard.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    expect(guardSource).not.toMatch(
      /\b(?:localStorage|sessionStorage|indexedDB|IDBDatabase|IDBFactory|IDBObjectStore|Dexie|openDB)\b/u,
    );
  });
});
