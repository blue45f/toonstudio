import { describe, expect, it } from "vitest";

import {
	CSP_LIP_QUICKLOOK_PLUGIN_SPECS,
	CSP_SCAN_APP_SPEC,
	CSP_SKSHAPER_UNICODE_SPEC,
	CSP_SYSTEM_HELPER_APP_MANIFEST,
	CSP_TG_TOS_PLUGIN_SPEC,
	applyCspScanAppLineArtBinarization,
	convertCspTosLegacyToolToSutSpec,
	encodeCspLipQuickLookPreviewSqliteStub,
	extractCspLipQuickLookPreview,
	layoutCspSkShaperMangaVerticalText,
} from "../csp-lippreview-tos-scan-skshaper";

describe("csp-lippreview-tos-scan-skshaper", () => {
	it("extracts QuickLook CanvasPreview PNG from both .clip (CSFCHUNK -> CHNKSQLi) and .lip (SQLite 3.30.1)", () => {
		expect(CSP_LIP_QUICKLOOK_PLUGIN_SPECS).toHaveLength(3);

		const clipStub = encodeCspLipQuickLookPreviewSqliteStub({
			containerFormat: "clip_csfchunk",
			widthPx: 640,
			heightPx: 480,
		});
		const clipRes = extractCspLipQuickLookPreview(clipStub);
		expect(clipRes.containerFormat).toBe("clip_csfchunk");
		expect(clipRes.hasCanvasPreviewTable).toBe(true);
		expect(clipRes.previewWidthPx).toBe(640);
		expect(clipRes.previewHeightPx).toBe(480);
		expect(clipRes.bitDepth).toBe(8);
		expect(clipRes.colorType).toBe(6);

		const lipStub = encodeCspLipQuickLookPreviewSqliteStub({
			containerFormat: "lip_sqlite3",
			widthPx: 512,
			heightPx: 724,
		});
		const lipRes = extractCspLipQuickLookPreview(lipStub);
		expect(lipRes.containerFormat).toBe("lip_sqlite3");
		expect(lipRes.hasCanvasPreviewTable).toBe(true);
		expect(lipRes.previewWidthPx).toBe(512);
		expect(lipRes.previewHeightPx).toBe(724);
	});

	it("converts TGTosPlugIn.cfpi legacy .tos (toolset.mng / param.pld) tool and tone definitions to .sut", () => {
		expect(CSP_TG_TOS_PLUGIN_SPEC.builtInTonePatterns).toContain("Speckled 1");
		expect(CSP_TG_TOS_PLUGIN_SPEC.builtInTonePatterns).toContain("Vertical Scan Line");
		expect(CSP_SYSTEM_HELPER_APP_MANIFEST).toHaveLength(3);

		const sut = convertCspTosLegacyToolToSutSpec({
			kindName: "ComicStudio Pen",
			innerName: "Kabura",
			brushStyle: "ribbon",
			brushSizePx: 18,
			brushSizeMinimumPercent: 20,
			inOutDrawLine: true,
			vectorByTrace: true,
			vectorSmoothPower: 75,
			tonePattern: "Drawing Paper",
		});
		expect(sut.sutSubToolName).toBe("ComicStudio Pen:Kabura");
		expect(sut.sutBrushPatternMode).toBe(2);
		expect(sut.minSizeRatio01).toBeCloseTo(0.2, 4);
		expect(sut.stabilizerStrength01).toBeCloseTo(0.75, 4);
		expect(sut.mappedToneTextureId).toBe("Drawing Paper");
	});

	it("binarizes paper scans and converts white background to transparent alpha (scan.app)", () => {
		expect(CSP_SCAN_APP_SPEC.appName).toBe("scan.app");
		const rgba = new Uint8ClampedArray([
			250, 250, 250, 255, 15, 15, 15, 255, 248, 248, 248, 255,
			20, 20, 20, 255, 10, 10, 10, 255, 245, 245, 245, 255,
			252, 252, 252, 255, 12, 12, 12, 255, 249, 249, 249, 255,
		]);
		const res = applyCspScanAppLineArtBinarization(rgba, 3, 3, {
			threshold01: 0.5,
			despeckle3x3: true,
			convertPaperToTransparent: true,
		});
		expect(res.inkPixelCount).toBe(4);
		expect(res.transparentPaperPixelCount).toBe(5);
		expect(res.data[3]).toBe(0); // 첫 픽셀(종이 배경)은 투명 알파
		expect(res.data[7]).toBeGreaterThan(200); // 두 번째 픽셀(잉크 선화)은 불투명 알파
	});

	it("computes libskshaper + libskunicode vertical manga typography with Kinsoku Shori, Tate-Chu-Yoko, and Ruby", () => {
		expect(CSP_SKSHAPER_UNICODE_SPEC.libraries).toHaveLength(3);
		const layout = layoutCspSkShaperMangaVerticalText(
			"{만화|망가}15화!?（특집）。",
			{
				maxRowsPerColumn: 4,
				fontSizePx: 20,
				enableTateChuYoko: true,
				enableKinsokuShori: true,
			},
		);
		expect(layout.rubyAnnotationCount).toBe(1);
		expect(layout.tateChuYokoCount).toBe(2); // "15" 및 "!?"
		expect(layout.kinsokuAdjustmentCount).toBeGreaterThanOrEqual(1);
		expect(layout.clusters[0]?.rubyText).toBe("망가");
		expect(layout.clusters[0]?.rubyXPx).not.toBeNull();
	});
});
