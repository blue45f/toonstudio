import { describe, expect, it } from "vitest";

import { getGradientMapPreset } from "../drawing/studio-gradient-map";
import type { StudioAdjustmentLayerSpec } from "../layer/studio-adjustment-layer";

import {
  PSD_ADJUSTMENT_DESCRIPTOR_TAGS,
  convertStudioAdjustmentToPsd,
  encodeGradientStopsForPsdParameter,
  serializeAdjustmentLayerPsdDescriptor,
  serializeAdjustmentStackToPsdDescriptors,
} from "./studio-psd-adjustment-export";

describe("studio-psd-adjustment-export", () => {
  it("4대 핵심 조정 종류(curves/levels/hsl/gradient-map)를 PSD 비파괴 디스크립터로 직렬화한다", () => {
    const sunset = getGradientMapPreset("sunset")!;
    const specs: StudioAdjustmentLayerSpec[] = [
      {
        id: "adj-levels",
        name: "배경 레벨",
        adjustment: "levels",
        parameters: {
          rgbShadowInput: 12,
          rgbHighlightInput: 242,
          rgbMidtoneInput: 1.15,
          rgbShadowOutput: 0,
          rgbHighlightOutput: 255,
        },
        enabled: true,
        opacity: 0.8,
        blendMode: "source-over",
        clipToBelow: false,
      },
      {
        id: "adj-curves",
        name: "명암 S커브",
        adjustment: "curves",
        parameters: { rgbPoints: [0, 0, 64, 48, 192, 210, 255, 255] },
        enabled: true,
        opacity: 1,
        blendMode: "luminosity",
        clipToBelow: true,
      },
      {
        id: "adj-hsl",
        name: "채도 보정",
        adjustment: "hsl",
        parameters: { hue: -12, saturation: 24, lightness: 6 },
        enabled: false,
        opacity: 0.5,
        blendMode: "color",
        clipToBelow: true,
      },
      {
        id: "adj-gmap-oklab",
        name: "석양 OKLab 그라데이션 맵",
        adjustment: "gradient-map",
        parameters: {
          stops: encodeGradientStopsForPsdParameter(sunset.stops),
          interpolationSpace: "oklab",
          reverse: false,
          dither: true,
        },
        enabled: true,
        opacity: 0.65,
        blendMode: "soft-light",
        clipToBelow: false,
      },
    ];

    const bundle = serializeAdjustmentStackToPsdDescriptors(specs);
    expect(bundle.stats).toEqual({
      total: 4,
      exportedCount: 4,
      oklabResampledCount: 1,
      skippedCount: 0,
    });
    expect(bundle.skipped).toEqual([]);

    // PSD 패널 순서(위→아래)로 반전되어야 한다.
    expect(bundle.descriptors.map((d) => d.layerId)).toEqual([
      "adj-gmap-oklab",
      "adj-hsl",
      "adj-curves",
      "adj-levels",
    ]);

    const gmapDesc = bundle.descriptors[0]!;
    expect(gmapDesc.descriptorTag).toBe(PSD_ADJUSTMENT_DESCRIPTOR_TAGS["gradient-map"]);
    expect(gmapDesc.fidelity).toBe("oklab-resampled");
    expect(gmapDesc.notes[0]).toContain("OKLab");
    expect(gmapDesc.adjustment.type).toBe("gradient map");
    if (gmapDesc.adjustment.type === "gradient map") {
      expect(gmapDesc.adjustment.colorStops).toHaveLength(17);
      expect(gmapDesc.adjustment.dither).toBe(true);
    }

    const hslDesc = bundle.descriptors[1]!;
    expect(hslDesc.descriptorTag).toBe("hue2");
    expect(hslDesc.hidden).toBe(true);
    expect(hslDesc.clipping).toBe(true);
    expect(hslDesc.opacityByte).toBe(128);
  });

  it("sRGB 그라데이션 맵은 원본 스톱 개수를 그대로 유지한다", () => {
    const stops = encodeGradientStopsForPsdParameter([
      { position: 0, color: [10, 20, 30] },
      { position: 1, color: [240, 230, 210] },
    ]);
    const converted = convertStudioAdjustmentToPsd("gradient-map", {
      stops,
      interpolationSpace: "srgb",
    });
    expect(converted.status).toBe("converted");
    if (converted.status === "converted" && converted.adjustment.type === "gradient map") {
      expect(converted.adjustment.colorStops).toHaveLength(2);
      expect(converted.adjustment.colorStops?.[0]?.location).toBe(0);
      expect(converted.adjustment.colorStops?.[1]?.location).toBe(4096);
    }
  });

  it("PSD 미지원 조정(lab)은 예외를 던지지 않고 skipped 목록으로 정직하게 분리한다", () => {
    const labSpec: StudioAdjustmentLayerSpec = {
      id: "adj-lab",
      name: "Lab 보정",
      adjustment: "lab",
      parameters: { lightness: 12 },
      enabled: true,
      opacity: 1,
      blendMode: "source-over",
      clipToBelow: false,
    };
    const result = serializeAdjustmentLayerPsdDescriptor(labSpec);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.layerId).toBe("adj-lab");
      expect(result.reason).toContain("PSD 조정 레이어");
    }
  });
});
