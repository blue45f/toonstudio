import { describe, expect, it } from "vitest";

import {
	CSP_TPP_FILM_CAMERA_STYLE_CONSTANTS,
	applyCspFlowBasedAbstractionFilter,
	applyCspGeometricDistortionPanoramaFilter,
	applyCspLineWidthFilter,
	applyCspPencilArtFilter,
	applyCspSmoothingFilter,
	applyCspSphereFilter,
	applyCspTppFilmCameraStyleFilter,
	applyCspWaveformFilter,
	applyCspZigzagFilter,
	evaluateCspNativeWaveFunction,
	judgeCspLineWidthCorePixel,
} from "../studio-csp-remaining-plugin-filters";
import {
	executeCspUnifiedFilterPlugIn,
	getCspCompleteInternalizationManifest,
} from "../studio-csp-unified-runtime-hub";

describe("studio-csp-remaining-plugin-filters (Ghidra-decompiled 9 remaining PlugIn/PAINT bundles)", () => {
	const sample4x4 = new Uint8ClampedArray([
		0, 0, 0, 0, 20, 30, 40, 255, 0, 0, 0, 0, 0, 0, 0, 0,
		20, 30, 40, 255, 25, 35, 45, 255, 20, 30, 40, 255, 0, 0, 0, 0,
		0, 0, 0, 0, 20, 30, 40, 255, 220, 120, 80, 255, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250, 200, 100, 255,
	]);

	it("verifies PILineWidth::JudgeCorePixel, ThinRaster, and FatRaster with nearest color propagation", () => {
		// 선 끝점(이웃 중 center 이상이 1개뿐인 경우)은 코어 픽셀로 판정
		expect(
			judgeCspLineWidthCorePixel(255, [255, 0, 0, 0, 0, 0, 0, 0]),
		).toBe(true);

		const thickened = applyCspLineWidthFilter(sample4x4, 4, 4, {
			mode: "thicken",
			radiusPx: 1,
		});
		// 원래 투명(alpha=0)이던 (0,0) 픽셀이 인접 (1,0)/(0,1) 선화 색상과 알파(255)를 상속받음
		expect(thickened[3]).toBe(255);
		expect(thickened[0]).toBeGreaterThan(0);

		const thinned = applyCspLineWidthFilter(sample4x4, 4, 4, {
			mode: "thin",
			radiusPx: 1,
			remainOnePixelCore: true,
		});
		expect(thinned.length).toBe(sample4x4.length);
	});

	it("verifies PISphereFilter, PIWaveformFilter (GetCircleWave/GetTriangleWave/GetSquareWave), PIZigzagFilter, and Panorama projection", () => {
		expect(evaluateCspNativeWaveFunction(0.1, "square")).toBe(1);
		expect(evaluateCspNativeWaveFunction(0.35, "square")).toBe(-1);
		expect(evaluateCspNativeWaveFunction(0.25, "triangle")).toBeCloseTo(1, 2);

		const sphereConvex = applyCspSphereFilter(sample4x4, 4, 4, { strength: 70 });
		const sphereConcave = applyCspSphereFilter(sample4x4, 4, 4, {
			strength: -60,
			cylindricalMode: true,
			angleDeg: 30,
		});
		const waveOut = applyCspWaveformFilter(sample4x4, 4, 4, { shape: "triangle" });
		const zigzagOut = applyCspZigzagFilter(sample4x4, 4, 4, {
			angleDeg: 60,
			ridges: 3,
		});
		const panoOut = applyCspGeometricDistortionPanoramaFilter(sample4x4, 4, 4, {
			mode: "equirectangular-to-perspective",
		});

		expect(sphereConvex).toHaveLength(64);
		expect(sphereConcave).toHaveLength(64);
		expect(waveOut).toHaveLength(64);
		expect(zigzagOut).toHaveLength(64);
		expect(panoOut).toHaveLength(64);
	});

	it("verifies TPPFilmCameraStyle IEEE-754 constants (0x16710..0x16760), PencilArtFilter, FlowBasedAbstraction, Smoothing, and 32-filter hub dispatch", () => {
		expect(CSP_TPP_FILM_CAMERA_STYLE_CONSTANTS.vintageSepiaBlendWeight).toBeCloseTo(
			0.4,
			5,
		);
		expect(CSP_TPP_FILM_CAMERA_STYLE_CONSTANTS.lightLeakBoostRgb).toEqual([
			0.58, 0.21, 0.0,
		]);

		const filmOut = applyCspTppFilmCameraStyleFilter(sample4x4, 4, 4);
		const pencilOut = applyCspPencilArtFilter(sample4x4, 4, 4);
		const flowOut = applyCspFlowBasedAbstractionFilter(sample4x4, 4, 4);
		const smoothOut = applyCspSmoothingFilter(sample4x4, 4, 4);

		expect(filmOut).toHaveLength(64);
		expect(pencilOut).toHaveLength(64);
		expect(flowOut).toHaveLength(64);
		expect(smoothOut).toHaveLength(64);

		for (const id of [
			"TPPFilmCameraStyle",
			"LineWidth",
			"Sphere",
			"Waveform",
			"Zigzag",
			"GeometricDistortionPanorama",
			"PencilArtFilter",
			"FlowBasedAbstraction",
			"Smoothing",
		] as const) {
			const res = executeCspUnifiedFilterPlugIn(id, sample4x4, 4, 4);
			expect(res.byteLength).toBe(64);
		}

		const manifest = getCspCompleteInternalizationManifest();
		expect(manifest.totalMachOBinaryCount).toBe(143);
		expect(manifest.totalPlugInAndFrameworkBundles).toBe(36);
		expect(manifest.dispatchedFilterPlugInCount).toBe(32);
	});
});
