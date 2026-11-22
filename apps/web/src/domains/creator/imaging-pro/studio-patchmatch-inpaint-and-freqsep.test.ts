import { describe, expect, it } from "vitest";

import {
  applyContentAwareFill,
  applyPatchMatchContentAwareFill,
  recombineFrequencies,
  separateFrequencies,
} from "../photoshop-pro/photoshop-retouch-frequency";

import {
  buildSeparableGaussianKernel,
  recombineImageFrequencies,
  runCleanroomPatchMatchInpaint,
  separateImageFrequencies,
  type PatchMatchImageDataLike,
} from "./studio-patchmatch-inpaint-and-freqsep";

function makeStripedTexture(width: number, height: number): PatchMatchImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const band = y % 4 < 2 ? 190 : 110;
      data[off] = band;
      data[off + 1] = band + 15;
      data[off + 2] = 215;
      data[off + 3] = 255;
    }
  }
  return { width, height, data };
}

function makeRichTestImage(width: number, height: number): PatchMatchImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const checker = (x + y) % 2 === 0 ? 28 : -28;
      const gradX = Math.round((x / Math.max(1, width - 1)) * 180);
      const gradY = Math.round((y / Math.max(1, height - 1)) * 160);
      data[off] = Math.max(0, Math.min(255, 45 + gradX + checker));
      data[off + 1] = Math.max(0, Math.min(255, 60 + gradY - Math.round(checker * 0.5)));
      data[off + 2] = Math.max(0, Math.min(255, 220 - Math.round((gradX + gradY) * 0.4) + checker));
      data[off + 3] = (x + y) % 5 === 0 ? 200 : 255;
    }
  }
  return { width, height, data };
}

describe("studio-patchmatch-inpaint-and-freqsep (Barnes PatchMatch & 무손실 주파수 분리)", () => {
  it("PatchMatch 인페인팅이 반복 줄무늬 배경의 마젠타 오염 구멍을 낮은 복원 오차로 재구성하고 외부는 비트 보존한다", () => {
    const width = 48;
    const height = 48;
    const truth = makeStripedTexture(width, height);
    const corrupted: PatchMatchImageDataLike = {
      width,
      height,
      data: new Uint8ClampedArray(truth.data),
    };
    const mask = new Uint8Array(width * height);

    // 중앙 8×8 구멍을 마젠타(255, 0, 255)로 오염
    for (let y = 20; y < 28; y += 1) {
      for (let x = 20; x < 28; x += 1) {
        const p = y * width + x;
        mask[p] = 1;
        const off = p * 4;
        corrupted.data[off] = 255;
        corrupted.data[off + 1] = 0;
        corrupted.data[off + 2] = 255;
      }
    }
    const inputSnapshot = new Uint8ClampedArray(corrupted.data);

    const res = runCleanroomPatchMatchInpaint(corrupted, mask, {
      patchRadius: 2,
      iterations: 6,
      emRounds: 3,
      pyramidLevels: 3,
      seed: 2026,
    });

    // 입력 버퍼 불변 + 마스크 외부 100% 비트 보존
    expect(Array.from(corrupted.data)).toEqual(Array.from(inputSnapshot));
    for (let p = 0; p < width * height; p += 1) {
      if (mask[p] === 0) {
        const off = p * 4;
        expect(res.imageData.data[off]).toBe(truth.data[off]);
        expect(res.imageData.data[off + 1]).toBe(truth.data[off + 1]);
        expect(res.imageData.data[off + 2]).toBe(truth.data[off + 2]);
        expect(res.imageData.data[off + 3]).toBe(truth.data[off + 3]);
      }
    }

    // 구멍 내부 평균 절대 복원 오차(MAE) 검증 (오염 전 MAE ~100+ -> 복원 후 < 14)
    let maeSum = 0;
    let count = 0;
    for (let p = 0; p < width * height; p += 1) {
      if (mask[p] !== 1) continue;
      const off = p * 4;
      maeSum +=
        Math.abs(res.imageData.data[off]! - truth.data[off]!) +
        Math.abs(res.imageData.data[off + 1]! - truth.data[off + 1]!) +
        Math.abs(res.imageData.data[off + 2]! - truth.data[off + 2]!);
      count += 3;
    }
    const mae = maeSum / count;
    expect(res.stats.fallbackUsed).toBe(false);
    expect(res.stats.holePixelCount).toBe(64);
    expect(res.stats.pyramidLevelsExecuted).toBe(3);
    expect(mae).toBeLessThan(14);

    // 동일 시드 결정성 확인
    const resAgain = runCleanroomPatchMatchInpaint(corrupted, mask, {
      patchRadius: 2,
      iterations: 6,
      emRounds: 3,
      pyramidLevels: 3,
      seed: 2026,
    });
    expect(Array.from(resAgain.imageData.data)).toEqual(Array.from(res.imageData.data));
  });

  it("제외 마스크(excludeMask)가 지정된 영역은 패치 소스 샘플링에서 완전히 배제한다", () => {
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8Array(width * height);
    const excludeMask = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        const off = p * 4;
        if (x < 16) {
          // 왼쪽 허용 영역: 선명한 초록(35, 190, 95)
          data[off] = 35;
          data[off + 1] = 190;
          data[off + 2] = 95;
        } else {
          // 오른쪽 제외 영역: 빨강(235, 30, 30)
          data[off] = 235;
          data[off + 1] = 30;
          data[off + 2] = 30;
          excludeMask[p] = 1;
        }
        data[off + 3] = 255;

        if (x >= 20 && x < 24 && y >= 14 && y < 18) {
          mask[p] = 1;
          data[off] = 0;
          data[off + 1] = 0;
          data[off + 2] = 0;
        }
      }
    }

    const res = runCleanroomPatchMatchInpaint({ width, height, data }, mask, {
      patchRadius: 1,
      iterations: 5,
      pyramidLevels: 2,
      excludeMask,
      seed: 99,
    });
    expect(res.stats.fallbackUsed).toBe(false);
    const cOff = (16 * width + 22) * 4;
    expect(res.imageData.data[cOff + 1]!).toBeGreaterThan(170);
    expect(res.imageData.data[cOff]!).toBeLessThan(60);
  });

  it("분리형 가우시안 커널이 대칭·정규화(합=1)를 만족하고 주파수 분리→재합성이 0오차 무손실 왕복 복원된다", () => {
    const kernel = buildSeparableGaussianKernel(2.5);
    expect(kernel.length % 2).toBe(1);
    let sum = 0;
    for (let i = 0; i < kernel.length; i += 1) {
      sum += kernel[i]!;
      expect(kernel[i]!).toBeCloseTo(kernel[kernel.length - 1 - i]!, 6);
    }
    expect(sum).toBeCloseTo(1, 5);

    const rich = makeRichTestImage(32, 28);
    for (const sigma of [0.8, 2.0, 4.5]) {
      const sep = separateImageFrequencies(rich, { sigma });
      const restored = recombineImageFrequencies(sep);
      let maxDiff = 0;
      for (let i = 0; i < rich.data.length; i += 1) {
        const diff = Math.abs(rich.data[i]! - restored.data[i]!);
        if (diff > maxDiff) maxDiff = diff;
      }
      expect(maxDiff, `sigma=${sigma} 무손실 왕복 오차`).toBe(0);
    }

    // highGain=0은 체커보드 고주파를 평탄화하고, highGain=1.6은 질감 대비를 강화한다
    const sep = separateImageFrequencies(rich, { sigma: 2.0 });
    const smooth = recombineImageFrequencies(sep, { highGain: 0 });
    const sharp = recombineImageFrequencies(sep, { highGain: 1.6 });
    const diffAt = (img: PatchMatchImageDataLike) =>
      Math.abs(img.data[(14 * 32 + 16) * 4]! - img.data[(14 * 32 + 17) * 4]!);
    expect(diffAt(smooth)).toBeLessThan(diffAt(rich) * 0.35);
    expect(diffAt(sharp)).toBeGreaterThan(diffAt(rich) * 1.15);

    // 8비트 Linear Light 모드도 ±2 오차 이내로 복원
    const linearLight = recombineImageFrequencies(sep, { mode: "8bit-linear-light" });
    let maxLlDiff = 0;
    for (let i = 0; i < rich.data.length; i += 1) {
      maxLlDiff = Math.max(maxLlDiff, Math.abs(rich.data[i]! - linearLight.data[i]!));
    }
    expect(maxLlDiff).toBeLessThanOrEqual(2);
  });

  it("기존 photoshop-retouch-frequency 진입점(PatchMatch & 무손실 주파수 분리)과 정상 연동된다", () => {
    const rich = makeRichTestImage(24, 24);
    const sep = separateFrequencies(rich, 3);
    const exactBack = recombineFrequencies(sep, { textureStrength: 1 });
    for (let i = 0; i < rich.data.length; i += 1) {
      expect(exactBack.data[i]).toBe(rich.data[i]);
    }

    const striped = makeStripedTexture(32, 32);
    const mask = new Uint8Array(32 * 32);
    for (let y = 12; y < 18; y += 1) {
      for (let x = 12; x < 18; x += 1) {
        const p = y * 32 + x;
        mask[p] = 255;
        striped.data[p * 4] = 255;
        striped.data[p * 4 + 1] = 0;
        striped.data[p * 4 + 2] = 255;
      }
    }
    const pmDirect = applyPatchMatchContentAwareFill(striped, mask, { patchRadius: 2, seed: 55 });
    expect(pmDirect.stats.holePixelCount).toBe(36);
    expect(pmDirect.imageData.data[(15 * 32 + 15) * 4 + 1]!).toBeGreaterThan(95);

    const viaUnified = applyContentAwareFill(striped, mask, {
      engine: "patchmatch",
      patchRadius: 2,
      patchMatchOptions: { seed: 55 },
    });
    expect(Array.from(viaUnified.data)).toEqual(Array.from(pmDirect.imageData.data));
  });
});
