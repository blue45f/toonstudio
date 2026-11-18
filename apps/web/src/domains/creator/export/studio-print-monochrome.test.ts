import { describe, expect, it } from "vitest";

import {
  describePdfPrintSpec,
  resolvePdfPrintOptions,
} from "./studio-export-print-spec";
import {
  buildPrintPdfFromPages,
  rgbaToMonochromePrintPdfPage,
} from "./studio-pdf-print-export";
import { rasterizePageForMonochromePrint } from "./studio-print-monochrome";

import type { PrintHalftoneSpotShape } from "./studio-print-monochrome";

describe("studio-print-monochrome", () => {
  it("BT.709 휘도 가중치와 흰 배경 알파 합성을 정확히 수행한다", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, // 순적: round(0.2126 * 255) = 54
      0, 255, 0, 255, // 순록: round(0.7152 * 255) = 182
      0, 0, 255, 255, // 순청: round(0.0722 * 255) = 18
      0, 0, 0, 0, // 완전 투명 -> 흰 종이(255)
    ]);

    const res = rasterizePageForMonochromePrint(rgba, 2, 2, { mode: "grayscale" });
    expect([...res.grayBytes]).toEqual([54, 182, 18, 255]);
    expect(res.rgbaBytes[3]).toBe(255);
    expect(res.packedDeviceGray1BitBytes).toHaveLength(0);
  });

  it("1비트 모노크롬 모드에서 진한 펜선을 깨짐 없이 순흑으로 보존하고 0/255 이진 화소만 배출한다", () => {
    const width = 24;
    const height = 24;
    const rgba = new Uint8Array(width * height * 4);
    rgba.fill(255);

    // 대각선 1px 진한 먹선(휘도 12 <= solidInkThreshold 45)을 그린다.
    for (let d = 0; d < width; d += 1) {
      const idx = (d * width + d) * 4;
      rgba[idx] = 12;
      rgba[idx + 1] = 12;
      rgba[idx + 2] = 12;
      rgba[idx + 3] = 255;
    }

    const mono = rasterizePageForMonochromePrint(rgba, width, height, {
      mode: "monochrome-1bit",
      lpi: 60,
      dpi: 600,
      angleDeg: 45,
      solidInkThreshold: 45,
    });

    // 모든 화소가 정확히 0(먹) 또는 255(종이) 이진값인지 검증
    for (const g of mono.grayBytes) {
      expect(g === 0 || g === 255).toBe(true);
    }
    // 1px 먹선 위의 모든 화소가 망점 구멍 없이 100% 순흑(0)으로 남는지 검증
    for (let d = 0; d < width; d += 1) {
      expect(mono.grayBytes[d * width + d]).toBe(0);
    }
    expect(mono.packedDeviceGray1BitBytes).toHaveLength(Math.ceil(width / 8) * height);
    // 첫 화소(0,0)는 먹선(비트 0)이므로 MSB가 0이어야 한다.
    expect((mono.packedDeviceGray1BitBytes[0]! & 0x80) === 0).toBe(true);
  });

  it("dot·line·cross 3종 망점 셀 형태 모두 회색 농도가 진해질수록 먹 커버리지가 단조 증가한다", () => {
    const shapes: readonly PrintHalftoneSpotShape[] = ["dot", "line", "cross"];
    const w = 40;
    const h = 40;

    const makeUniformGray = (gray: number): Uint8Array => {
      const buf = new Uint8Array(w * h * 4);
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = gray;
        buf[i + 1] = gray;
        buf[i + 2] = gray;
        buf[i + 3] = 255;
      }
      return buf;
    };

    for (const spotShape of shapes) {
      const light = rasterizePageForMonochromePrint(makeUniformGray(192), w, h, {
        mode: "monochrome-1bit",
        lpi: 60,
        dpi: 600,
        angleDeg: 45,
        spotShape,
      });
      const mid = rasterizePageForMonochromePrint(makeUniformGray(128), w, h, {
        mode: "monochrome-1bit",
        lpi: 60,
        dpi: 600,
        angleDeg: 45,
        spotShape,
      });
      const dark = rasterizePageForMonochromePrint(makeUniformGray(72), w, h, {
        mode: "monochrome-1bit",
        lpi: 60,
        dpi: 600,
        angleDeg: 45,
        spotShape,
      });

      expect(light.inkCoverageRatio).toBeGreaterThan(0.1);
      expect(mid.inkCoverageRatio).toBeGreaterThan(light.inkCoverageRatio);
      expect(dark.inkCoverageRatio).toBeGreaterThan(mid.inkCoverageRatio);
      expect(dark.inkCoverageRatio).toBeLessThan(0.95);
    }
  });

  it("studio-pdf-print-export 및 studio-export-print-spec과 1비트·그레이스케일 PDF로 연동된다", () => {
    const rgba = new Uint8Array(16 * 16 * 4);
    rgba.fill(140);

    const monoPage = rgbaToMonochromePrintPdfPage(rgba, 16, 16, {
      mode: "monochrome-1bit",
      lpi: 60,
      dpi: 600,
    });
    const monoPdf = buildPrintPdfFromPages([monoPage], {
      print: { colorMode: "monochrome-1bit", halftoneLpi: 60 },
    });
    const monoLatin = Array.from(monoPdf, (b) => String.fromCharCode(b)).join("");
    expect(monoLatin).toContain("/ColorSpace /DeviceGray /BitsPerComponent 1");

    const grayPage = rgbaToMonochromePrintPdfPage(rgba, 16, 16, {
      mode: "grayscale",
    });
    const grayPdf = buildPrintPdfFromPages([grayPage], {
      print: { colorMode: "grayscale" },
    });
    const grayLatin = Array.from(grayPdf, (b) => String.fromCharCode(b)).join("");
    expect(grayLatin).toContain("/ColorSpace /DeviceGray /BitsPerComponent 8");

    const resolved = resolvePdfPrintOptions({
      enabled: true,
      bleedMm: 3,
      cropMarks: true,
      colorMode: "monochrome-1bit",
      imposition: "booklet",
      bindingDirection: "rtl",
      creepMm: 1.5,
      halftoneLpi: 65,
    });
    expect(resolved).toEqual({
      bleedMm: 3,
      cropMarks: true,
      colorMode: "monochrome-1bit",
      imposition: "booklet",
      bindingDirection: "rtl",
      creepMm: 1.5,
      halftoneLpi: 65,
    });
    expect(
      describePdfPrintSpec({
        enabled: true,
        bleedMm: 3,
        cropMarks: false,
        colorMode: "monochrome-1bit",
        imposition: "booklet",
        bindingDirection: "rtl",
        creepMm: 1.5,
        halftoneLpi: 65,
      }),
    ).toBe("도련 3mm · 1비트 망점(65LPI) · 중철 스프레드 · 우철(RTL) · 중철 밀림 1.5mm");
  });
});
