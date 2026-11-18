import { describe, expect, it } from "vitest";

import { normalizeGradientMap } from "../studio-gradient-map";

import {
  applyLabColorTransferLut,
  buildLabColorTransferLutFromReference,
  buildMoodPresetColorTransferLut,
  COLOR_TRANSFER_MOOD_PRESET_IDS,
  extractGradientStopsFromColorTransferLut,
  LAB_LUT_GRID_SIZE,
  STUDIO_COLOR_TRANSFER_MOOD_PRESETS,
} from "./studio-lab-color-transfer-lut";

import type { StudioImageDataLike } from "../studio-filters";

function createSolidGradientImage(
  width: number,
  height: number,
  tint: readonly [number, number, number],
): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / Math.max(1, width + height - 2);
      const off = (y * width + x) * 4;
      data[off] = Math.round(tint[0] * (0.25 + 0.75 * t));
      data[off + 1] = Math.round(tint[1] * (0.25 + 0.75 * t));
      data[off + 2] = Math.round(tint[2] * (0.25 + 0.75 * t));
      data[off + 3] = x === 0 && y === 0 ? 142 : 255;
    }
  }
  return { width, height, data };
}

describe("studio-lab-color-transfer-lut", () => {
  it("8종 내장 무드 프리셋이 모두 16x16x16 3D LUT를 생성하고 유효한 5-스톱 GradientStop[]을 추출한다", () => {
    expect(STUDIO_COLOR_TRANSFER_MOOD_PRESETS).toHaveLength(8);
    expect(COLOR_TRANSFER_MOOD_PRESET_IDS).toEqual([
      "sunrise",
      "sepia",
      "old-paper",
      "night",
      "cafe",
      "monochrome",
      "pastel-pop",
      "traditional-ink",
    ]);

    for (const id of COLOR_TRANSFER_MOOD_PRESET_IDS) {
      const lut = buildMoodPresetColorTransferLut(id);
      expect(lut.size).toBe(LAB_LUT_GRID_SIZE);
      expect(lut.table.length).toBe(16 * 16 * 16 * 3);

      const stops = extractGradientStopsFromColorTransferLut(lut);
      expect(stops).toHaveLength(5);
      expect(stops.map((s) => s.pos)).toEqual([0, 0.25, 0.5, 0.75, 1]);

      const normalized = normalizeGradientMap({ stops });
      expect(normalized.stops).toHaveLength(5);
    }
  });

  it("참조 이미지 기반 Lab 색감 전이가 차가운 청색 이미지를 따뜻한 주황 참조 톤으로 이동시키며 알파를 보존한다", () => {
    const coolSource = createSolidGradientImage(8, 8, [70, 120, 240]);
    const warmRef = createSolidGradientImage(8, 8, [245, 150, 65]);

    const lut = buildLabColorTransferLutFromReference(coolSource, warmRef);
    const out = applyLabColorTransferLut(coolSource, lut, 1);

    // 알파 보존 검증 (반투명 픽셀 142 포함)
    expect(out.data[3]).toBe(142);
    const midOff = (4 * 8 + 4) * 4;
    expect(out.data[midOff]!).toBeGreaterThan(coolSource.data[midOff]!);
    expect(out.data[midOff + 2]!).toBeLessThan(coolSource.data[midOff + 2]!);

    // intensity = 0 은 원본 바이트를 그대로 반환한다.
    const untouched = applyLabColorTransferLut(coolSource, lut, 0);
    expect([...untouched.data]).toEqual([...coolSource.data]);
  });

  it("monochrome 프리셋은 유채색 픽셀을 무채색(R≈G≈B)으로 수렴시킨다", () => {
    const colorful = createSolidGradientImage(6, 6, [230, 80, 160]);
    const monoLut = buildMoodPresetColorTransferLut("monochrome", colorful);
    const monoOut = applyLabColorTransferLut(colorful, monoLut, 1);

    const sampleOff = (3 * 6 + 3) * 4;
    expect(Math.abs(monoOut.data[sampleOff]! - monoOut.data[sampleOff + 1]!)).toBeLessThanOrEqual(3);
    expect(Math.abs(monoOut.data[sampleOff + 1]! - monoOut.data[sampleOff + 2]!)).toBeLessThanOrEqual(3);
  });
});
