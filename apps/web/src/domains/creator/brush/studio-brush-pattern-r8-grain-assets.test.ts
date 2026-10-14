import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_PATTERN_R8_TILE_SIZE_V1,
  STUDIO_BRUSH_PATTERN_STYLE_IDS_V1,
  bakeStudioBrushPatternR8GrainTileV1,
  registerStudioBrushPatternR8GrainTilesV1,
  sampleStudioBrushPatternFieldV1,
} from "./studio-brush-pattern-r8-grain-assets";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("sampleStudioBrushPatternFieldV1", () => {
  it("모든 스타일이 0..1 안에 있고 평탄하지 않다", () => {
    for (const styleId of STUDIO_BRUSH_PATTERN_STYLE_IDS_V1) {
      let min = 1;
      let max = 0;
      // 주기 8 패턴과 겹치지 않는 간격(5)으로 샘플링한다(16 간격은 도트 셀 모서리만 친다).
      for (let y = 0; y < 256; y += 5) {
        for (let x = 0; x < 256; x += 5) {
          const v = sampleStudioBrushPatternFieldV1(styleId, x + 0.5, y + 0.5);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      expect(max - min).toBeGreaterThan(0.1);
    }
  });

  it("halftone-dots는 셀 중심이 어둡고 모서리가 밝다", () => {
    expect(sampleStudioBrushPatternFieldV1("halftone-dots", 4, 4)).toBe(0);
    expect(sampleStudioBrushPatternFieldV1("halftone-dots", 0.5, 0.5)).toBe(1);
  });

  it("noise 필드는 타일 주기로 정확히 반복된다(경계 연속)", () => {
    const size = STUDIO_BRUSH_PATTERN_R8_TILE_SIZE_V1;
    for (const y of [0.5, 63.5, 200.5]) {
      expect(sampleStudioBrushPatternFieldV1("noise", 0.5, y)).toBeCloseTo(
        sampleStudioBrushPatternFieldV1("noise", size + 0.5, y),
      );
      expect(sampleStudioBrushPatternFieldV1("noise", y, 0.5)).toBeCloseTo(
        sampleStudioBrushPatternFieldV1("noise", y, size + 0.5),
      );
    }
  });
});

describe("bakeStudioBrushPatternR8GrainTileV1", () => {
  it("스타일마다 결정적 바이트와 계약 해시를 만든다", () => {
    for (const styleId of STUDIO_BRUSH_PATTERN_STYLE_IDS_V1) {
      const a = bakeStudioBrushPatternR8GrainTileV1(styleId);
      const b = bakeStudioBrushPatternR8GrainTileV1(styleId);
      expect(a.decodedBytes.length).toBe(256 * 256);
      expect(Array.from(a.decodedBytes)).toEqual(Array.from(b.decodedBytes));
      expect(a.source.asset.assetId).toBe(`studio-brush-pattern-v1.${styleId}.256`);
      expect(a.source.asset.encodedSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(a.source.asset.decodedSha256).toBe(b.source.asset.decodedSha256);
      expect(Array.from(a.encodedBytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
      expect(a.source.asset.byteLength).toBe(a.encodedBytes.length);
    }
  });

  it("스타일끼리는 서로 다른 타일이다", () => {
    const noise = bakeStudioBrushPatternR8GrainTileV1("noise");
    const dots = bakeStudioBrushPatternR8GrainTileV1("halftone-dots");
    expect(noise.source.asset.decodedSha256).not.toBe(dots.source.asset.decodedSha256);
  });
});

describe("registerStudioBrushPatternR8GrainTilesV1", () => {
  it("네 스타일 모두 공유 레지스트리 하이드레이션이 ready다", () => {
    const registrations = registerStudioBrushPatternR8GrainTilesV1();
    expect(registrations.map((r) => r.styleId)).toEqual([...STUDIO_BRUSH_PATTERN_STYLE_IDS_V1]);
    for (const registration of registrations) {
      expect(registration.result.status).toBe("ready");
    }
  });
});
