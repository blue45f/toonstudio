import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_BRUSH_SHAPE_BFPS_PRESETS,
  CSP_CATALOG_PATH_REPAIR_SAMPLES,
  CSP_PRMI_BIT_PERMUTATION,
  CSP_PRMI_INVERSE_BIT_PERMUTATION,
  applyCspBrushShapePresetToStroke,
  decodeCspPrmiToJpegBytes,
  encodeJpegBytesToCspPrmi,
  parseCspPromotionImageInfoXml,
  repairCspMaterialCatalogPath,
} from "../csp-bfps-cscr-prmi";

describe("csp-bfps-cscr-prmi", () => {
  it("provides all 14 BrushPreset.bfps brush shape presets and projects stroke geometry", () => {
    expect(CSP_BRUSH_SHAPE_BFPS_PRESETS.length).toBe(14);
    expect(CSP_BRUSH_SHAPE_BFPS_PRESETS.map((p) => p.nodeNameKo)).toEqual([
      "점선",
      "파선",
      "에어브러시",
      "수채",
      "거친 수채",
      "구아슈",
      "먹(마른붓질)",
      "초크",
      "연필 [Ver.3.1]",
      "평면 마커",
      "거친 펜",
      "리얼 G 펜",
      "펜",
      "거칠고 딱딱한 펜",
    ]);

    const dotted = applyCspBrushShapePresetToStroke({
      presetId: "dotted_line",
      preserveBrushSize: 20,
    });
    expect(dotted.effectiveBrushSize).toBe(20);
    expect(dotted.effectiveStepDistancePx).toBe(40);
    expect(dotted.aspectRatio).toBe(1.0);

    const flatMarker = applyCspBrushShapePresetToStroke({
      presetId: "flat_marker",
    });
    expect(flatMarker.aspectRatio).toBeCloseTo(0.3, 4);
    expect(flatMarker.preset.brushRotationDeg).toBe(90);
  });

  it("repairs legacy material catalog paths using catalogPathRepairTable.cscr mappings", () => {
    expect(CSP_CATALOG_PATH_REPAIR_SAMPLES.length).toBeGreaterThanOrEqual(8);
    const repaired = repairCspMaterialCatalogPath(
      ".:Paint001:004e7b2591-6f43-b1bc-cd4f-8b9d6efca2:data:material.layer",
    );
    expect(repaired.wasRepaired).toBe(true);
    expect(repaired.packageFolder).toBe("Paint003");
    expect(repaired.materialUuid).toBe("709a76dd84-7844-8398-2f07-8963e54ba0");

    const unchanged = repairCspMaterialCatalogPath(
      ".:Paint005:ffffffff00-1111-2222-3333-4444444444:data:material.layer",
    );
    expect(unchanged.wasRepaired).toBe(false);
    expect(unchanged.packageFolder).toBe("Paint005");
  });

  it("decodes and encodes .prmi 8-bit permutation scrambled JFIF images and ImageInfo.xml", () => {
    expect(CSP_PRMI_BIT_PERMUTATION.length).toBe(8);
    expect(CSP_PRMI_INVERSE_BIT_PERMUTATION.length).toBe(8);

    // Standard JPEG SOI + APP0 JFIF header + EOI
    const sampleJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
    ]);
    const prmi = encodeJpegBytesToCspPrmi(sampleJpeg);
    expect(Array.from(prmi.subarray(0, 12))).toEqual([
      0xff, 0x63, 0xff, 0x29, 0x00, 0x02, 0x64, 0x34, 0xe0, 0x34, 0x00, 0x80,
    ]);
    const restored = decodeCspPrmiToJpegBytes(prmi);
    expect(restored).toEqual(sampleJpeg);

    const realPrmiPath =
      "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Promotion/Illustration/Image/AKRU.prmi";
    if (existsSync(realPrmiPath)) {
      const realPrmi = new Uint8Array(readFileSync(realPrmiPath));
      const realJpeg = decodeCspPrmiToJpegBytes(realPrmi);
      // Verify SOI (0xFF 0xD8), APP0 (0xFF 0xE0), 'JFIF', and EOI (0xFF 0xD9)
      expect(realJpeg[0]).toBe(0xff);
      expect(realJpeg[1]).toBe(0xd8);
      expect(realJpeg[2]).toBe(0xff);
      expect(realJpeg[3]).toBe(0xe0);
      expect(String.fromCharCode(realJpeg[6]!, realJpeg[7]!, realJpeg[8]!, realJpeg[9]!)).toBe(
        "JFIF",
      );
      expect(realJpeg[realJpeg.byteLength - 2]).toBe(0xff);
      expect(realJpeg[realJpeg.byteLength - 1]).toBe(0xd9);
    }

    const realXmlPath =
      "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Promotion/Illustration/ko-kr/ImageInfo.xml";
    const xmlContent = existsSync(realXmlPath)
      ? readFileSync(realXmlPath, "utf-8")
      : `<?xml version="1.0" encoding="UTF-8"?><promotionimageroot version="1.0.0"><promotionimageinfo author = "chavoom" filepath = "../Image/chavoom_2.prmi"><productlogo color = "black"/></promotionimageinfo></promotionimageroot>`;
    const parsedXml = parseCspPromotionImageInfoXml(xmlContent);
    expect(parsedXml.version).toBe("1.0.0");
    expect(parsedXml.entries.length).toBeGreaterThanOrEqual(1);
    expect(parsedXml.entries[0]?.author).toBe("chavoom");
  });
});
