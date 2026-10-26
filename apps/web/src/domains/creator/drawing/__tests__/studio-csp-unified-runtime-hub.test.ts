import { describe, expect, it } from "vitest";

import {
	CSP_CAFFE_SUPERRES_WEIGHT_SPECS,
	CSP_CLIP_STUDIO_3_PROJECT_TEMPLATES,
	CSP_EXACT_COLOR_TRANSFER_PRESETS,
	CSP_NATIVE_DIAL_MENU_SPECS,
	CSP_WKBRIDGE_AND_TGCXS_ARCHITECTURE,
	type CspUnifiedDispatchedFilterId,
	applyCspColorTransferFilter,
	applyCspDialMenuTickDelta,
	applyCspSuperResolutionUpscale,
	executeCspUnifiedFilterPlugIn,
	getCspCompleteInternalizationManifest,
} from "../studio-csp-unified-runtime-hub";

function createTestCanvasRgba(width: number, height: number): Uint8ClampedArray {
	const buf = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const idx = (y * width + x) * 4;
			buf[idx] = Math.round((x / Math.max(1, width - 1)) * 240);
			buf[idx + 1] = Math.round((y / Math.max(1, height - 1)) * 220);
			buf[idx + 2] = Math.round(((x + y) / Math.max(1, width + height - 2)) * 250);
			buf[idx + 3] = 255;
		}
	}
	return buf;
}

describe("CSP 1.5 Unified Runtime Hub (ColorTransfer, SuperResolution, DialMenu, WKBridge & Filter Dispatcher)", () => {
	it("applies CIE L*a*b* Reinhard Color Transfer across all 8 native PNG presets", () => {
		expect(CSP_EXACT_COLOR_TRANSFER_PRESETS.length).toBe(8);
		const src = createTestCanvasRgba(8, 8);

		for (const preset of CSP_EXACT_COLOR_TRANSFER_PRESETS) {
			const transferred = applyCspColorTransferFilter(src, 8, 8, {
				presetId: preset.id,
				strength: 1,
			});
			expect(transferred.length).toBe(src.length);
			if (preset.id === "06_monochrome") {
				// 06_monochrome.png has labMean a*=0, b*=0 and labStd a*=0, b*=0 -> neutral grayscale
				expect(Math.abs((transferred[0] ?? 0) - (transferred[1] ?? 0))).toBeLessThanOrEqual(2);
				expect(Math.abs((transferred[1] ?? 0) - (transferred[2] ?? 0))).toBeLessThanOrEqual(2);
			}
		}

		const zeroStrength = applyCspColorTransferFilter(src, 8, 8, {
			presetId: "02_sepia",
			strength: 0,
		});
		expect(Array.from(zeroStrength)).toEqual(Array.from(src));
	});

	it("upscales images with Caffe SuperResolution models (x2, x3, x4 + _denoise)", () => {
		expect(CSP_CAFFE_SUPERRES_WEIGHT_SPECS.length).toBe(6);
		const src = createTestCanvasRgba(6, 4);

		const resX2 = applyCspSuperResolutionUpscale(src, 6, 4, {
			scale: 2,
			denoise: false,
		});
		expect(resX2.width).toBe(12);
		expect(resX2.height).toBe(8);
		expect(resX2.data.length).toBe(12 * 8 * 4);
		expect(resX2.modelSpec.caffemodelFileName).toBe("x2.caffemodel");

		const resX3Denoise = applyCspSuperResolutionUpscale(src, 6, 4, {
			scale: 3,
			denoise: true,
		});
		expect(resX3Denoise.width).toBe(18);
		expect(resX3Denoise.height).toBe(12);
		expect(resX3Denoise.modelSpec.caffemodelFileName).toBe("x3_denoise.caffemodel");
		expect(resX3Denoise.modelSpec.caffemodelByteSize).toBe(321_365);

		const resX4 = applyCspSuperResolutionUpscale(src, 6, 4, {
			scale: 4,
			denoise: false,
		});
		expect(resX4.width).toBe(24);
		expect(resX4.height).toBe(16);
	});

	it("reduces DialMenu controller ticks across all 6 native modes", () => {
		expect(CSP_NATIVE_DIAL_MENU_SPECS.map((m) => m.id)).toEqual([
			"brushsize",
			"parallelruler",
			"rotation",
			"timeline",
			"undo",
			"zoom",
		]);

		let state = {
			brushSizePx: 20,
			parallelRulerAngleDeg: 355,
			canvasRotationDeg: 175,
			timelineFrameIndex: 1,
			undoHistoryCursor: 5,
			zoomPercent: 100,
		};

		state = applyCspDialMenuTickDelta(state, "brushsize", 5);
		expect(state.brushSizePx).toBe(30);

		state = applyCspDialMenuTickDelta(state, "parallelruler", 2);
		expect(state.parallelRulerAngleDeg).toBe(5);

		state = applyCspDialMenuTickDelta(state, "rotation", 2);
		expect(state.canvasRotationDeg).toBe(-175);

		state = applyCspDialMenuTickDelta(state, "timeline", 4);
		expect(state.timelineFrameIndex).toBe(5);

		state = applyCspDialMenuTickDelta(state, "undo", -2);
		expect(state.undoHistoryCursor).toBe(3);

		state = applyCspDialMenuTickDelta(state, "zoom", 5);
		expect(state.zoomPercent).toBe(150);
	});

	it("dispatches all 23 unified FilterPlugIn IDs and exposes complete Pass 1-5 manifest", () => {
		const src = createTestCanvasRgba(8, 8);
		const filterIds: readonly CspUnifiedDispatchedFilterId[] = [
			"GaussBlur",
			"MotionBlur",
			"RadialBlur",
			"TPPRotationBlur",
			"UnSharpMask",
			"Sharp",
			"SharpStrong",
			"SharpOff",
			"SharpOffStrong",
			"Mosaic",
			"Pinch",
			"LensDistortion",
			"GeometricDistortionFishEye",
			"TPPChromaticAberration",
			"TPPNormalMap",
			"TPReduceNoiseFilter",
			"TPPAddNoise",
			"SimpleWave",
			"Spiral",
			"Dust",
			"PolarCd",
			"PerlinNoise",
			"ColorTransfer",
		];

		for (const filterId of filterIds) {
			const out = executeCspUnifiedFilterPlugIn(filterId, src, 8, 8);
			expect(out.length).toBe(8 * 8 * 4);
		}

		expect(CSP_CLIP_STUDIO_3_PROJECT_TEMPLATES.length).toBe(4);
		expect(CSP_WKBRIDGE_AND_TGCXS_ARCHITECTURE.wkBridgeBundle.exportedCApi).toEqual([
			"_CreateBoard",
			"_TellBoard",
			"_DestroyString",
		]);

		const manifest = getCspCompleteInternalizationManifest();
		expect(manifest.appVersion).toBe("5.1.5");
		expect(manifest.totalPlugInAndFrameworkBundles).toBe(36);
		expect(manifest.corePluginManifestEntries).toBe(6);
		expect(manifest.colorTransferPresetCount).toBe(8);
		expect(manifest.superResolutionModelCount).toBe(6);
		expect(manifest.dialMenuModeCount).toBe(6);
		expect(manifest.projectWorkflowTemplateCount).toBe(4);
	});
});
