import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_BONESCALE_3DP_PRESETS,
  CSP_BUILTIN_COLORSET_ARCHIVES,
  CSP_EPUB_DEVICE_PRESETS,
  CSP_ICC_COLOR_PROFILES,
  CSP_KINDLE_DEVICE_PRESETS,
  CSP_PRINT_COMPANY_PRESETS,
  computeCspBookSpineAndSpreadSpec,
  convertRgbToCspCmykSoftProof,
  encodeCspCs3oCatalogDataHeader,
  encodeCspIndexedResourceArchive,
  parseCspCs3oCatalogDataHeader,
  parseCspEpubAndKindleDeviceXml,
  parseCspIndexedResourceArchive,
  parseCspPrintCoInfoXml,
} from "../csp-print-epub-3d-archive";

describe("CSP 1.5 PrintCoInfo, EPUB/Kindle, CS3O 3D Data, Indexed Resource Archive & ICC Profiles", () => {
  it("contains all 25 printing companies and computes accurate 3D book spine & spread dimensions", () => {
    expect(CSP_PRINT_COMPANY_PRESETS).toHaveLength(25);
    const ryokuyou = CSP_PRINT_COMPANY_PRESETS.find((c) => c.name === "緑陽社");
    const sunrise = CSP_PRINT_COMPANY_PRESETS.find((c) => c.name === "サンライズ");
    expect(ryokuyou).toBeDefined();
    expect(sunrise).toBeDefined();

    // 緑陽社: spineWidthType = "main", mainPaper 0.125mm, 100 pages (50 sheets) -> 6.25mm spine
    const ryokuyouSpec = computeCspBookSpineAndSpreadSpec({
      company: ryokuyou!,
      bodyPageCount: 100,
      mainPaperId: 0,
      trimWidthMm: 182,
      trimHeightMm: 257,
      bleedMm: 3,
      dpi: 600,
    });
    expect(ryokuyouSpec.spineWidthMm).toBeCloseTo(6.25, 3);
    expect(ryokuyouSpec.ditchWidthMm).toBe(5);
    expect(ryokuyouSpec.spreadWidthMm).toBeCloseTo(182 * 2 + 6.25 + 6, 3);
    expect(ryokuyouSpec.spreadHeightMm).toBeCloseTo(257 + 6, 3);

    // サンライズ: spineWidthType = "cover", mainPaper 0.13mm, coverPaper 0.13mm, 100 pages -> 50*0.13 + 2*0.13 = 6.76mm
    const sunriseSpec = computeCspBookSpineAndSpreadSpec({
      company: sunrise!,
      bodyPageCount: 100,
      mainPaperId: 0,
      trimWidthMm: 182,
      trimHeightMm: 257,
      bleedMm: 3,
      dpi: 600,
    });
    expect(sunriseSpec.spineWidthMm).toBeCloseTo(6.76, 3);
  });

  it("parses PrintCoInfo.xml, EPUBDeviceInfo.xml, and KindleDeviceInfo.xml from real CSP 1.5 bundle when installed", () => {
    expect(CSP_EPUB_DEVICE_PRESETS).toHaveLength(9);
    expect(CSP_KINDLE_DEVICE_PRESETS).toHaveLength(8);

    const printXmlPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/PrintCoInfo/PrintCoInfo.xml";
    const epubXmlPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/KindleDeviceInfo/EPUBDeviceInfo.xml";
    const kindleXmlPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/KindleDeviceInfo/KindleDeviceInfo.xml";

    if (existsSync(printXmlPath)) {
      const parsedPrint = parseCspPrintCoInfoXml(readFileSync(printXmlPath, "utf8"));
      expect(parsedPrint.version).toBe(117);
      expect(parsedPrint.companies.length).toBeGreaterThanOrEqual(25);
      expect(parsedPrint.companies[0]?.name).toBe("緑陽社");
    }

    if (existsSync(epubXmlPath) && existsSync(kindleXmlPath)) {
      const parsedDevices = parseCspEpubAndKindleDeviceXml(
        readFileSync(epubXmlPath, "utf8"),
        readFileSync(kindleXmlPath, "utf8"),
      );
      expect(parsedDevices.epubDevices).toHaveLength(9);
      expect(parsedDevices.kindleDevices).toHaveLength(8);
      expect(parsedDevices.kindleDevices[1]?.countries).toContain("jp");
    }
  });

  it("round-trips CS3O CLIP_STUDIO_3D_DATA2 headers and exposes bonescale_preset01/02.3dp", () => {
    expect(CSP_BONESCALE_3DP_PRESETS).toHaveLength(2);
    expect(CSP_BONESCALE_3DP_PRESETS[0]?.boneScales.bone_leg).toEqual([0.21, 0, 0]);
    expect(CSP_BONESCALE_3DP_PRESETS[1]?.boneScales.bone_leg).toEqual([-0.5, -0.5, -0.5]);

    const dummyPayload = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55]);
    const encoded = encodeCspCs3oCatalogDataHeader("catalog_object", 1, 5, dummyPayload);
    const parsed = parseCspCs3oCatalogDataHeader(encoded);
    expect(parsed.formatMagic).toBe("CLIP_STUDIO_3D_DATA2");
    expect(parsed.chunkType).toBe("catalog_object");
    expect(parsed.payloadByteLength).toBe(5);
    expect(parsed.versionMajor).toBe(1);
    expect(parsed.versionMinor).toBe(5);
    expect(Array.from(encoded.subarray(parsed.payloadOffset))).toEqual([0x11, 0x22, 0x33, 0x44, 0x55]);
  });

  it("round-trips Celsys Indexed Resource Archive and parses real 742DEA58-ED6B-4402-BC11-20DFC6D08040", () => {
    const sampleArchive = encodeCspIndexedResourceArchive([
      {
        sectionId: 1,
        subEntries: [
          { entryId: 1, payload: new Uint8Array([1, 2, 3, 4]) },
          { entryId: 2, payload: new Uint8Array([5, 6, 7]) },
        ],
      },
      {
        sectionId: 2,
        rawPayload: new Uint8Array([9, 10, 11, 12]),
      },
    ]);

    const decoded = parseCspIndexedResourceArchive(sampleArchive);
    expect(decoded.sectionCount).toBe(2);
    expect(decoded.sections[0]?.subEntries).toHaveLength(2);
    expect(Array.from(decoded.sections[0]!.subEntries[1]!.payload)).toEqual([5, 6, 7]);
    expect(Array.from(decoded.sections[1]!.rawData)).toEqual([9, 10, 11, 12]);

    const realArchivePath =
      "/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Resources/korean/742DEA58-ED6B-4402-BC11-20DFC6D08040";
    if (existsSync(realArchivePath)) {
      const realBytes = new Uint8Array(readFileSync(realArchivePath));
      const realArchive = parseCspIndexedResourceArchive(realBytes);
      expect(realArchive.sectionCount).toBe(3);
      expect(realArchive.sections[0]?.subEntries).toHaveLength(507);
    }
  });

  it("provides all 15 ICC color profiles, CMYK TAC soft-proofing, and built-in ColorSet metadata", () => {
    expect(CSP_ICC_COLOR_PROFILES).toHaveLength(15);
    expect(CSP_BUILTIN_COLORSET_ARCHIVES).toHaveLength(2);

    const newspaperProof = convertRgbToCspCmykSoftProof([0, 0, 0], "japan-color-2002-newspaper");
    expect(newspaperProof.totalAreaCoveragePercent).toBeLessThanOrEqual(240.1);
    expect(newspaperProof.exceedsTacLimit).toBe(true);

    const coatedProof = convertRgbToCspCmykSoftProof([30, 120, 220], "japan-color-2001-coated");
    expect(coatedProof.cPercent).toBeGreaterThan(40);
    expect(coatedProof.totalAreaCoveragePercent).toBeLessThanOrEqual(350);
  });
});
