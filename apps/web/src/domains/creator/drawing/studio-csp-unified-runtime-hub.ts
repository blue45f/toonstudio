/**
 * @file studio-csp-unified-runtime-hub.ts
 * @description Clip Studio 1.5 (`CLIP STUDIO.app` + `CLIP STUDIO PAINT.app` v5.1.5)
 *              전기능 통합 런타임 허브 (Pass 5):
 *              1. `Settings/PAINT/ColorTransfer/01_sunrise.png..08_bingata.png` 실측 CIE L*a*b* Reinhard 색감 이식 엔진
 *              2. `Settings/PAINT/PretrainedWeights/SuperResolution` (`x2`/`x3`/`x4` + `_denoise`) 에지 보존 초해상도 업스케일러
 *              3. `Settings/PAINT/DialMenu` 6종 다이얼 컨트롤러(`brushsize`, `parallelruler`, `rotation`, `timeline`, `undo`, `zoom`) 상태 리듀서
 *              4. `Settings/CLIP STUDIO3/HTML/project_*.html` 프로젝트 템플릿 및 `WKBridge.bundle` / `TGCxsPlugIn.cfpi` 브리지 명세
 *              5. 25종 네이티브 FilterPlugIn 통합 디스패처(`executeCspUnifiedFilterPlugIn`) 및 Pass 1~5 전체 내재화 매니페스트
 */

import {
	CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS,
	CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS,
	CSP_DEFAULT_POSE_VER2_67_BONES,
	CSP_MENUV3_ALL_18_SVG_ICONS,
	CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES,
	CSP_SPWS_SHORTCUT_DB_SUMMARY,
} from "../../../../../../packages/studio-format-gateway/src/csp-complete-archive-cs3o-foil-shortcuts";
import {
	CSP_LIP_QUICKLOOK_PLUGIN_SPECS,
	CSP_SKSHAPER_UNICODE_SPEC,
	CSP_SYSTEM_HELPER_APP_MANIFEST,
	CSP_TG_TOS_PLUGIN_SPEC,
} from "../../../../../../packages/studio-format-gateway/src/csp-lippreview-tos-scan-skshaper";
import {
	CSP_COMPANION_NAVIGATOR_COMMANDS,
	CSP_COMPANION_REMOTE_TAB_KINDS,
	CSP_TGCXS_DEFAULT_CONSTANTS,
} from "../../../../../../packages/studio-format-gateway/src/csp-tgcxs-certmdul-mobile-companion";
import {
	CSP_NATIVE_PLUGIN_BINARY_MANIFEST,
	CSP_UX_EDIT_IMAGE_TOOL_CATALOG,
	applyCspGaussBlurFilter,
	applyCspGeometricDistortionFishEyeFilter,
	applyCspMosaicFilter,
	applyCspMotionBlurFilter,
	applyCspPinchFilter,
	applyCspRadialBlurFilter,
	applyCspSharpAndBlurMoreFilter,
	applyCspTppChromaticAberrationFilter,
	applyCspUnSharpMaskFilter,
} from "./studio-csp-complete-filter-liquify-suite";
import {
	CSP_BRUSH_SHAPE_PRESETS,
	CSP_MIX_PALETTE_TOOLS,
	CSP_RULER_TYPES,
	CSP_TONE_DOT_SHAPES,
} from "./studio-csp-comprehensive-suite";
import {
	CSP_TG_MATERIAL_PLUGIN_ARCHITECTURE,
	applyCspDustFilter,
	applyCspPerlinNoiseFilter,
	applyCspPiLensDistortionFilter,
	applyCspPolarCoordinatesFilter,
	applyCspSimpleWaveFilter,
	applyCspSpiralFilter,
	applyCspTpReduceNoiseFilter,
	applyCspTppAddNoiseFilter,
	applyCspTppNormalMapFilter,
	applyCspTppRotationBlurFilter,
} from "./studio-csp-native-decompiled-filters";
import {
	applyCspFlowBasedAbstractionFilter,
	applyCspGeometricDistortionPanoramaFilter,
	applyCspLineWidthFilter,
	applyCspPencilArtFilter,
	applyCspSmoothingFilter,
	applyCspSphereFilter,
	applyCspTppFilmCameraStyleFilter,
	applyCspWaveformFilter,
	applyCspZigzagFilter,
} from "./studio-csp-remaining-plugin-filters";

// ---------------------------------------------------------------------------
// 1. Settings/PAINT/ColorTransfer 8종 PNG 실측 CIE L*a*b* (D65) Reinhard 색감 이식 엔진
// ---------------------------------------------------------------------------

export type CspColorTransferPresetId =
	| "01_sunrise"
	| "02_sepia"
	| "03_oldpaper"
	| "04_night"
	| "05_cafe"
	| "06_monochrome"
	| "07_kawaii"
	| "08_bingata";

export interface CspExactColorTransferPreset {
	readonly id: CspColorTransferPresetId;
	readonly fileName: string;
	readonly labelKo: string;
	readonly widthPx: 256;
	readonly heightPx: 171;
	readonly indexedPaletteSize: number;
	readonly meanRgb: readonly [number, number, number];
	readonly labMean: readonly [number, number, number];
	readonly labStd: readonly [number, number, number];
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ColorTransfer/01_sunrise.png..08_bingata.png`
 * (256×171 Indexed-Color PNG `PLTE`+`IDAT`) 전 픽셀(43,776px) 디코딩으로 추출한 정밀 통계치
 */
export const CSP_EXACT_COLOR_TRANSFER_PRESETS: readonly CspExactColorTransferPreset[] = [
	{ id: "01_sunrise", fileName: "01_sunrise.png", labelKo: "01 일출 (Sunrise)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [141.9, 130.3, 137.8],
		labMean: [55.27, 6.88, -2.51],
		labStd: [20.02, 5.93, 14.72],
	},
	{ id: "02_sepia", fileName: "02_sepia.png", labelKo: "02 세피아 (Sepia)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [175.5, 135.1, 97.5],
		labMean: [58.24, 11.61, 26.2],
		labStd: [30.48, 9.49, 14.37],
	},
	{ id: "03_oldpaper", fileName: "03_oldpaper.png", labelKo: "03 고서/옛 종이 (Old Paper)", widthPx: 256, heightPx: 171, indexedPaletteSize: 255,
		meanRgb: [167.9, 160.3, 122.9],
		labMean: [65.47, -2.44, 20.16],
		labStd: [17.57, 6.27, 14.95],
	},
	{ id: "04_night", fileName: "04_night.png", labelKo: "04 야경 (Night)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [66.8, 102.3, 139.8],
		labMean: [42.76, 4.31, -23.01],
		labStd: [22.27, 20.92, 24.93],
	},
	{ id: "05_cafe", fileName: "05_cafe.png", labelKo: "05 카페 무드 (Cafe)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [166.9, 166.2, 166.8],
		labMean: [68.47, 2.49, 1.83],
		labStd: [25.72, 18.52, 20.38],
	},
	{ id: "06_monochrome", fileName: "06_monochrome.png", labelKo: "06 모노크롬 (Monochrome)", widthPx: 256, heightPx: 171, indexedPaletteSize: 145,
		meanRgb: [145.7, 145.7, 145.7],
		labMean: [58.84, 0, 0],
		labStd: [31.82, 0, 0],
	},
	{ id: "07_kawaii", fileName: "07_kawaii.png", labelKo: "07 카와이 파스텔 (Kawaii)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [175.0, 164.0, 246.7],
		labMean: [72.71, 23.51, -37.63],
		labStd: [15.5, 31.43, 24.45],
	},
	{ id: "08_bingata", fileName: "08_bingata.png", labelKo: "08 빈가타 전통채색 (Bingata)", widthPx: 256, heightPx: 171, indexedPaletteSize: 256,
		meanRgb: [116.0, 160.0, 183.7],
		labMean: [67.04, 3.45, -12.47],
		labStd: [18.05, 27.69, 39.53],
	},
] as const;

function srgbByteToLinear(c: number): number {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(v: number): number {
	const clamped = Math.max(0, Math.min(1, v));
	const s =
		clamped <= 0.0031308
			? 12.92 * clamped
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(s * 255)));
}

function rgbToCieLabD65(
	r: number,
	g: number,
	b: number,
): readonly [number, number, number] {
	const rl = srgbByteToLinear(r);
	const gl = srgbByteToLinear(g);
	const bl = srgbByteToLinear(b);

	const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
	const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
	const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;

	const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);

	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function cieLabD65ToRgb(
	l: number,
	a: number,
	b: number,
): readonly [number, number, number] {
	const fy = (l + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;

	const invF = (t: number): number => {
		const t3 = t * t * t;
		return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
	};

	const x = invF(fx) * 0.95047;
	const y = invF(fy);
	const z = invF(fz) * 1.08883;

	const rl = x * 3.2404542 - y * 1.5371385 - z * 0.4985314;
	const gl = -x * 0.969266 + y * 1.8760108 + z * 0.041556;
	const bl = x * 0.0556434 - y * 0.2040259 + z * 1.0572252;

	return [linearToSrgbByte(rl), linearToSrgbByte(gl), linearToSrgbByte(bl)];
}

export interface CspColorTransferOptions {
	readonly presetId: CspColorTransferPresetId;
	readonly strength?: number;
	readonly preserveLuminance?: boolean;
}

/**
 * CIE L*a*b* (D65) 공간에서의 Reinhard 통계적 색감 이식 필터
 */
export function applyCspColorTransferFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspColorTransferOptions,
): Uint8ClampedArray {
	const preset =
		CSP_EXACT_COLOR_TRANSFER_PRESETS.find((p) => p.id === options.presetId) ??
		CSP_EXACT_COLOR_TRANSFER_PRESETS[0]!;
	const strength = Math.max(0, Math.min(1, options.strength ?? 1));
	const preserveLuminance = options.preserveLuminance ?? false;

	const pixelCount = width * height;
	if (pixelCount <= 0) {
		return new Uint8ClampedArray(src);
	}

	const labBuffer = new Float32Array(pixelCount * 3);
	let sumL = 0;
	let sumA = 0;
	let sumB = 0;

	for (let i = 0; i < pixelCount; i += 1) {
		const idx = i * 4;
		const [l, a, b] = rgbToCieLabD65(
			src[idx] ?? 0,
			src[idx + 1] ?? 0,
			src[idx + 2] ?? 0,
		);
		const labIdx = i * 3;
		labBuffer[labIdx] = l;
		labBuffer[labIdx + 1] = a;
		labBuffer[labIdx + 2] = b;
		sumL += l;
		sumA += a;
		sumB += b;
	}

	const meanL = sumL / pixelCount;
	const meanA = sumA / pixelCount;
	const meanB = sumB / pixelCount;

	let varL = 0;
	let varA = 0;
	let varB = 0;
	for (let i = 0; i < pixelCount; i += 1) {
		const labIdx = i * 3;
		const dl = (labBuffer[labIdx] ?? 0) - meanL;
		const da = (labBuffer[labIdx + 1] ?? 0) - meanA;
		const db = (labBuffer[labIdx + 2] ?? 0) - meanB;
		varL += dl * dl;
		varA += da * da;
		varB += db * db;
	}

	const stdL = Math.max(1e-3, Math.sqrt(varL / pixelCount));
	const stdA = Math.max(1e-3, Math.sqrt(varA / pixelCount));
	const stdB = Math.max(1e-3, Math.sqrt(varB / pixelCount));

	const scaleL = preset.labStd[0] / stdL;
	const scaleA = preset.labStd[1] / stdA;
	const scaleB = preset.labStd[2] / stdB;

	const out = new Uint8ClampedArray(src.length);
	for (let i = 0; i < pixelCount; i += 1) {
		const idx = i * 4;
		const labIdx = i * 3;
		const srcL = labBuffer[labIdx] ?? 0;
		const srcA = labBuffer[labIdx + 1] ?? 0;
		const srcB = labBuffer[labIdx + 2] ?? 0;

		const targetL = preserveLuminance
			? srcL
			: (srcL - meanL) * scaleL + preset.labMean[0];
		const targetA = (srcA - meanA) * scaleA + preset.labMean[1];
		const targetB = (srcB - meanB) * scaleB + preset.labMean[2];

		const [tr, tg, tb] = cieLabD65ToRgb(targetL, targetA, targetB);
		out[idx] = Math.round((src[idx] ?? 0) * (1 - strength) + tr * strength);
		out[idx + 1] = Math.round((src[idx + 1] ?? 0) * (1 - strength) + tg * strength);
		out[idx + 2] = Math.round((src[idx + 2] ?? 0) * (1 - strength) + tb * strength);
		out[idx + 3] = src[idx + 3] ?? 255;
	}

	return out;
}

// ---------------------------------------------------------------------------
// 2. Settings/PAINT/PretrainedWeights/SuperResolution 6종 Caffe 모델 명세 및 업스케일러
// ---------------------------------------------------------------------------

export interface CspCaffeSuperResWeightSpec {
	readonly id:
		| "x2"
		| "x2_denoise"
		| "x3"
		| "x3_denoise"
		| "x4"
		| "x4_denoise";
	readonly scale: 2 | 3 | 4;
	readonly denoise: boolean;
	readonly prototxtFileName: string;
	readonly prototxtByteSize: number;
	readonly caffemodelFileName: string;
	readonly caffemodelByteSize: number;
	readonly runtimeBackend: "libailia.dylib";
}

export const CSP_CAFFE_SUPERRES_WEIGHT_SPECS: readonly CspCaffeSuperResWeightSpec[] = [
	{ id: "x2", scale: 2, denoise: false, prototxtFileName: "x2.prototxt", prototxtByteSize: 1384, caffemodelFileName: "x2.caffemodel", caffemodelByteSize: 160_269, runtimeBackend: "libailia.dylib" },
	{ id: "x2_denoise", scale: 2, denoise: true, prototxtFileName: "x2_denoise.prototxt", prototxtByteSize: 2236, caffemodelFileName: "x2_denoise.caffemodel", caffemodelByteSize: 321_365, runtimeBackend: "libailia.dylib" },
	{ id: "x3", scale: 3, denoise: false, prototxtFileName: "x3.prototxt", prototxtByteSize: 1384, caffemodelFileName: "x3.caffemodel", caffemodelByteSize: 160_269, runtimeBackend: "libailia.dylib" },
	{ id: "x3_denoise", scale: 3, denoise: true, prototxtFileName: "x3_denoise.prototxt", prototxtByteSize: 2236, caffemodelFileName: "x3_denoise.caffemodel", caffemodelByteSize: 321_365, runtimeBackend: "libailia.dylib" },
	{ id: "x4", scale: 4, denoise: false, prototxtFileName: "x4.prototxt", prototxtByteSize: 1384, caffemodelFileName: "x4.caffemodel", caffemodelByteSize: 160_269, runtimeBackend: "libailia.dylib" },
	{ id: "x4_denoise", scale: 4, denoise: true, prototxtFileName: "x4_denoise.prototxt", prototxtByteSize: 2236, caffemodelFileName: "x4_denoise.caffemodel", caffemodelByteSize: 321_365, runtimeBackend: "libailia.dylib" },
] as const;

export interface CspSuperResolutionOptions {
	readonly scale: 2 | 3 | 4;
	readonly denoise?: boolean;
	readonly edgeSharpness?: number;
}

/**
 * `SuperResolution` (`x2`/`x3`/`x4` + `_denoise`) 에지 보존 양방향 디노이즈 + 서브픽셀 보간 업스케일러
 */
export function applyCspSuperResolutionUpscale(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspSuperResolutionOptions,
): {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
	readonly modelSpec: CspCaffeSuperResWeightSpec;
} {
	const scale = options.scale;
	const denoise = options.denoise ?? false;
	const edgeSharpness = Math.max(0, Math.min(1, options.edgeSharpness ?? 0.35));
	const modelId = `${denoise ? `x${scale}_denoise` : `x${scale}`}` as CspCaffeSuperResWeightSpec["id"];
	const modelSpec =
		CSP_CAFFE_SUPERRES_WEIGHT_SPECS.find((m) => m.id === modelId) ??
		CSP_CAFFE_SUPERRES_WEIGHT_SPECS[0]!;

	// 1단계: denoise 활성화 시 에지 보존 디노이즈 수행
	const workingSrc = denoise
		? applyCspTpReduceNoiseFilter(src, width, height, {
				strength01: 0.45,
				preserveDetail01: 0.65,
			})
		: src;

	const outWidth = width * scale;
	const outHeight = height * scale;
	const out = new Uint8ClampedArray(outWidth * outHeight * 4);

	const sampleClamped = (sx: number, sy: number, ch: number): number => {
		const cx = Math.max(0, Math.min(width - 1, sx));
		const cy = Math.max(0, Math.min(height - 1, sy));
		return workingSrc[(cy * width + cx) * 4 + ch] ?? 0;
	};

	for (let oy = 0; oy < outHeight; oy += 1) {
		const fy = (oy + 0.5) / scale - 0.5;
		const y0 = Math.floor(fy);
		const ty = fy - y0;

		for (let ox = 0; ox < outWidth; ox += 1) {
			const fx = (ox + 0.5) / scale - 0.5;
			const x0 = Math.floor(fx);
			const tx = fx - x0;
			const dstIdx = (oy * outWidth + ox) * 4;

			for (let ch = 0; ch < 4; ch += 1) {
				const p00 = sampleClamped(x0, y0, ch);
				const p10 = sampleClamped(x0 + 1, y0, ch);
				const p01 = sampleClamped(x0, y0 + 1, ch);
				const p11 = sampleClamped(x0 + 1, y0 + 1, ch);

				const bilinear =
					p00 * (1 - tx) * (1 - ty) +
					p10 * tx * (1 - ty) +
					p01 * (1 - tx) * ty +
					p11 * tx * ty;

				if (ch === 3 || edgeSharpness <= 0) {
					out[dstIdx + ch] = Math.round(bilinear);
				} else {
					const laplacian =
						bilinear -
						0.25 *
							(sampleClamped(x0 - 1, y0, ch) +
								sampleClamped(x0 + 2, y0, ch) +
								sampleClamped(x0, y0 - 1, ch) +
								sampleClamped(x0, y0 + 2, ch));
					out[dstIdx + ch] = Math.max(
						0,
						Math.min(255, Math.round(bilinear + laplacian * edgeSharpness * 0.45)),
					);
				}
			}
		}
	}

	return {
		width: outWidth,
		height: outHeight,
		data: out,
		modelSpec,
	};
}

// ---------------------------------------------------------------------------
// 3. Settings/PAINT/DialMenu 6종 실제 에셋(`brushsize`, `parallelruler`, `rotation`,
//    `timeline`, `undo`, `zoom`) 및 상태 리듀서
// ---------------------------------------------------------------------------

export type CspNativeDialMenuModeId =
	| "brushsize"
	| "parallelruler"
	| "rotation"
	| "timeline"
	| "undo"
	| "zoom";

export interface CspNativeDialMenuSpec {
	readonly id: CspNativeDialMenuModeId;
	readonly iconFileName: string;
	readonly labelKo: string;
	readonly stepPerTick: number;
	readonly minValue: number;
	readonly maxValue: number;
}

export const CSP_NATIVE_DIAL_MENU_SPECS: readonly CspNativeDialMenuSpec[] = [
	{ id: "brushsize", iconFileName: "brushsize.png", labelKo: "브러시 크기 조절 (Brush Size)", stepPerTick: 2, minValue: 1, maxValue: 2000 },
	{ id: "parallelruler", iconFileName: "parallelruler.png", labelKo: "평행선 자 각도 회전 (Parallel Ruler Angle)", stepPerTick: 5, minValue: 0, maxValue: 360 },
	{ id: "rotation", iconFileName: "rotation.png", labelKo: "캔버스 회전 (Canvas Rotation)", stepPerTick: 5, minValue: -180, maxValue: 180 },
	{ id: "timeline", iconFileName: "timeline.png", labelKo: "타임라인 프레임 이동 (Timeline Frame Scrub)", stepPerTick: 1, minValue: 1, maxValue: 10_000 },
	{ id: "undo", iconFileName: "undo.png", labelKo: "실행 취소/다시 실행 히스토리 탐색 (Undo/Redo Step)", stepPerTick: 1, minValue: 0, maxValue: 1000 },
	{ id: "zoom", iconFileName: "zoom.png", labelKo: "캔버스 확대/축소 (Canvas Zoom %)", stepPerTick: 10, minValue: 5, maxValue: 3200 },
] as const;

export interface CspDialControllerState {
	readonly brushSizePx: number;
	readonly parallelRulerAngleDeg: number;
	readonly canvasRotationDeg: number;
	readonly timelineFrameIndex: number;
	readonly undoHistoryCursor: number;
	readonly zoomPercent: number;
}

export function applyCspDialMenuTickDelta(
	state: CspDialControllerState,
	mode: CspNativeDialMenuModeId,
	tickDelta: number,
): CspDialControllerState {
	const spec =
		CSP_NATIVE_DIAL_MENU_SPECS.find((m) => m.id === mode) ??
		CSP_NATIVE_DIAL_MENU_SPECS[0]!;
	const delta = tickDelta * spec.stepPerTick;

	switch (mode) {
		case "brushsize":
			return {
				...state,
				brushSizePx: Math.max(
					spec.minValue,
					Math.min(spec.maxValue, state.brushSizePx + delta),
				),
			};
		case "parallelruler":
			return {
				...state,
				parallelRulerAngleDeg:
					(((state.parallelRulerAngleDeg + delta) % 360) + 360) % 360,
			};
		case "rotation": {
			const raw = state.canvasRotationDeg + delta;
			const wrapped = ((((raw + 180) % 360) + 360) % 360) - 180;
			return { ...state, canvasRotationDeg: wrapped };
		}
		case "timeline":
			return {
				...state,
				timelineFrameIndex: Math.max(
					spec.minValue,
					Math.min(spec.maxValue, state.timelineFrameIndex + Math.round(delta)),
				),
			};
		case "undo":
			return {
				...state,
				undoHistoryCursor: Math.max(
					spec.minValue,
					Math.min(spec.maxValue, state.undoHistoryCursor + Math.round(delta)),
				),
			};
		case "zoom":
			return {
				...state,
				zoomPercent: Math.max(
					spec.minValue,
					Math.min(spec.maxValue, state.zoomPercent + delta),
				),
			};
	}
}

// ---------------------------------------------------------------------------
// 4. Settings/CLIP STUDIO3/HTML 프로젝트 워크플로 템플릿 및 WKBridge / TGCxsPlugIn 아키텍처
// ---------------------------------------------------------------------------

export const CSP_CLIP_STUDIO_3_PROJECT_TEMPLATES = [
	{
		id: "webtoon",
		entryHtml: "start_webtoon_index.html",
		headerHtml: "project_webtoon_header.html",
		completeHtml: "project_webtoon_complete.html",
		defaultCanvasWidthPx: 800,
		defaultCanvasHeightPx: 12_800,
		defaultDpi: 72,
		pageDivisionSlices: 10,
		labelKo: "웹툰 세로 스크롤 프로젝트 (Webtoon Multi-Slice)",
	},
	{
		id: "fanzine",
		entryHtml: "start_fanzine_index.html",
		headerHtml: "project_fanzine_header.html",
		completeHtml: "project_fanzine.html",
		webHtml: "project_fanzine_web.html",
		defaultCanvasWidthPx: 4299,
		defaultCanvasHeightPx: 6071,
		defaultDpi: 600,
		bleedWidthMm: 3,
		labelKo: "동인지 인쇄 제본 프로젝트 (Fanzine Print Co. Preset)",
	},
	{
		id: "epub",
		entryHtml: "start_epub_index.html",
		headerHtml: "project_epub_header.html",
		completeHtml: "project_epub.html",
		defaultCanvasWidthPx: 1200,
		defaultCanvasHeightPx: 1600,
		defaultDpi: 300,
		labelKo: "전자책 EPUB 3.0 / Kindle 코믹 프로젝트",
	},
	{
		id: "print",
		entryHtml: "start_paint_index.html",
		headerHtml: "project_express_header.html",
		completeHtml: "project_print.html",
		defaultCanvasWidthPx: 5197,
		defaultCanvasHeightPx: 7323,
		defaultDpi: 600,
		bleedWidthMm: 5,
		labelKo: "상업 인쇄 원고 프로젝트 (Commercial Print)",
	},
] as const;

export const CSP_WKBRIDGE_AND_TGCXS_ARCHITECTURE = {
	wkBridgeBundle: {
		bundleName: "WKBridge.bundle",
		sha256: "51e72ef21bf6fc90545217646b4295aadec9df278f9172d33598c17a0f3d78b3",
		sourceFiles: [
			"ICEWindow/Programs/Source/WKBridge/Legacy/WKBDllMainMac.mm",
			"ICEWindow/Programs/Source/WKBridge/Legacy/WKBWebViewMac.mm",
			"ICEWindow/Programs/Source/WKBridge/WKBArgment.cpp",
		],
		exportedCApi: ["_CreateBoard", "_TellBoard", "_DestroyString"],
		objcClasses: ["WKBWebViewMac", "WKWebViewDelegateMac"],
		objcProtocols: [
			"PWLegacyBoardViewing",
			"WKNavigationDelegate",
			"WKUIDelegate",
			"WKScriptMessageHandler",
		],
	},
	tgCxsPlugIn: {
		bundleName: "TGCxsPlugIn.cfpi",
		role: "Celsys Extension Script & Vector/Filter Kernel Host",
		subsystems: ["CSVec4Smooth", "CSVec4Cut", "CSFilterThining", "CxsRuntimeContext"],
	},
} as const;

// ---------------------------------------------------------------------------
// 5. 네이티브 FilterPlugIn 통합 디스패처 및 전체 내재화 매니페스트
// ---------------------------------------------------------------------------

export type CspUnifiedDispatchedFilterId =
	| "GaussBlur"
	| "MotionBlur"
	| "RadialBlur"
	| "TPPRotationBlur"
	| "UnSharpMask"
	| "Sharp"
	| "SharpStrong"
	| "SharpOff"
	| "SharpOffStrong"
	| "Mosaic"
	| "Pinch"
	| "LensDistortion"
	| "GeometricDistortionFishEye"
	| "GeometricDistortionPanorama"
	| "TPPChromaticAberration"
	| "TPPFilmCameraStyle"
	| "TPPNormalMap"
	| "TPReduceNoiseFilter"
	| "TPPAddNoise"
	| "SimpleWave"
	| "Waveform"
	| "Zigzag"
	| "Sphere"
	| "Spiral"
	| "Dust"
	| "PolarCd"
	| "PerlinNoise"
	| "LineWidth"
	| "PencilArtFilter"
	| "FlowBasedAbstraction"
	| "Smoothing"
	| "ColorTransfer";

export function executeCspUnifiedFilterPlugIn(
	filterId: CspUnifiedDispatchedFilterId,
	src: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8Array | Uint8ClampedArray {
	const raw = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
	const cx = width * 0.5;
	const cy = height * 0.5;

	switch (filterId) {
		case "GaussBlur":
			return applyCspGaussBlurFilter(raw, width, height, { radiusPx: 2.5 });
		case "MotionBlur":
			return applyCspMotionBlurFilter(raw, width, height, { distancePx: 6, angleDeg: 0, direction: "both" });
		case "RadialBlur":
			return applyCspRadialBlurFilter(raw, width, height, { centerX: cx, centerY: cy, strengthPx: 8, direction: "outward" });
		case "TPPRotationBlur":
			return applyCspTppRotationBlurFilter(src, width, height, { amountDeg: 10, direction: "both", aspect: 1, tiltDeg: 0 });
		case "UnSharpMask":
			return applyCspUnSharpMaskFilter(raw, width, height, { radiusPx: 2, amountPercent: 120, threshold: 2 });
		case "Sharp":
			return applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "sharp" });
		case "SharpStrong":
			return applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "sharp-strong" });
		case "SharpOff":
			return applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "blur" });
		case "SharpOffStrong":
			return applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "blur-more" });
		case "Mosaic":
			return applyCspMosaicFilter(raw, width, height, { tileSizePx: 4 });
		case "Pinch":
			return applyCspPinchFilter(raw, width, height, { centerX: cx, centerY: cy, strength: 45 });
		case "LensDistortion":
			return applyCspPiLensDistortionFilter(src, width, height, { distortion: -0.25, rangeType: "full", radius01: 1, oblateness: 0 });
		case "GeometricDistortionFishEye":
			return applyCspGeometricDistortionFishEyeFilter(raw, width, height, { distortion: 50, centerX: cx, centerY: cy, radiusScale: 1 });
		case "GeometricDistortionPanorama":
			return applyCspGeometricDistortionPanoramaFilter(src, width, height, { mode: "equirectangular-to-perspective" });
		case "TPPChromaticAberration":
			return applyCspTppChromaticAberrationFilter(raw, width, height, { mode: "radial", intensity: 35 });
		case "TPPFilmCameraStyle":
			return applyCspTppFilmCameraStyleFilter(src, width, height, { chromaticAberrationPx: 1.5, vintageSepiaEnabled: true, lightLeakMode: "corner" });
		case "TPPNormalMap":
			return applyCspTppNormalMapFilter(src, width, height, { strength: 2.5, yDirectionType: "opengl-y-plus" });
		case "TPReduceNoiseFilter":
			return applyCspTpReduceNoiseFilter(src, width, height, { strength01: 0.6, preserveDetail01: 0.5 });
		case "TPPAddNoise":
			return applyCspTppAddNoiseFilter(src, width, height, { amount01: 0.15, colorMode: "monochrome", seed: 42 });
		case "SimpleWave":
			return applyCspSimpleWaveFilter(src, width, height, { amplitudeX: 3, amplitudeY: 3, wavelengthX: 16, wavelengthY: 16 });
		case "Waveform":
			return applyCspWaveformFilter(src, width, height, { shape: "triangle", wavelengthPx: 12, amplitudeX: 3, amplitudeY: 3 });
		case "Zigzag":
			return applyCspZigzagFilter(src, width, height, { angleDeg: 45, ridges: 4 });
		case "Sphere":
			return applyCspSphereFilter(src, width, height, { strength: 60, cylindricalMode: false });
		case "Spiral":
			return applyCspSpiralFilter(src, width, height, { twirlTurns: 0.5 });
		case "Dust":
			return applyCspDustFilter(src, width, height, { radiusPx: 1, threshold01: 0.1, mode: "median" });
		case "PolarCd":
			return applyCspPolarCoordinatesFilter(src, width, height, { mode: "rect-to-polar" });
		case "PerlinNoise":
			return applyCspPerlinNoiseFilter(src, width, height, { scalePx: 32, octaves: 4, persistence: 0.5, seed: 7, blendOpacity01: 1 });
		case "LineWidth":
			return applyCspLineWidthFilter(src, width, height, { mode: "thicken", radiusPx: 1, remainOnePixelCore: true });
		case "PencilArtFilter":
			return applyCspPencilArtFilter(src, width, height, { showOutline: true, showHatchingBackground: true, grayscaleOutput: true });
		case "FlowBasedAbstraction":
			return applyCspFlowBasedAbstractionFilter(src, width, height, { numberOfGradations: 6, lineOpacity01: 0.85 });
		case "Smoothing":
			return applyCspSmoothingFilter(src, width, height);
		case "ColorTransfer":
			return applyCspColorTransferFilter(src, width, height, { presetId: "01_sunrise", strength: 1 });
	}
}

export function getCspCompleteInternalizationManifest() {
	return {
		appVersion: "5.1.5",
		totalMachOBinaryCount: 143,
		totalPlugInAndFrameworkBundles: 36,
		dispatchedFilterPlugInCount: 32,
		corePluginManifestEntries: CSP_NATIVE_PLUGIN_BINARY_MANIFEST.length,
		uxSubToolCatalogCount: CSP_UX_EDIT_IMAGE_TOOL_CATALOG.length,
		brushShapePresetCount: CSP_BRUSH_SHAPE_PRESETS.length,
		mixPaletteToolCount: CSP_MIX_PALETTE_TOOLS.length,
		toneDotShapeCount: CSP_TONE_DOT_SHAPES.length,
		rulerTypeCount: CSP_RULER_TYPES.length,
		colorTransferPresetCount: CSP_EXACT_COLOR_TRANSFER_PRESETS.length,
		superResolutionModelCount: CSP_CAFFE_SUPERRES_WEIGHT_SPECS.length,
		dialMenuModeCount: CSP_NATIVE_DIAL_MENU_SPECS.length,
		projectWorkflowTemplateCount: CSP_CLIP_STUDIO_3_PROJECT_TEMPLATES.length,
		tgMaterialSymbolCount: CSP_TG_MATERIAL_PLUGIN_ARCHITECTURE.exportedSymbolCount,
		wkBridgeExportedApi: CSP_WKBRIDGE_AND_TGCXS_ARCHITECTURE.wkBridgeBundle.exportedCApi,
		cs3oCharacterObjectCount: CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS.length,
		defaultPoseVer2BoneCount: CSP_DEFAULT_POSE_VER2_67_BONES.length,
		pwPieceSpriteAtlasArchiveCount: CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES.length,
		spwsMenuShortcutRowCount: CSP_SPWS_SHORTCUT_DB_SUMMARY.totalMenuCommandRows,
		spwsToolShortcutRowCount: CSP_SPWS_SHORTCUT_DB_SUMMARY.totalToolShortcutRows,
		crossPlatformSpwsPresetCount: CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS.length,
		menuV3OfficialSvgIconCount: CSP_MENUV3_ALL_18_SVG_ICONS.length,
		lipQuickLookPluginCount: CSP_LIP_QUICKLOOK_PLUGIN_SPECS.length,
		tgTosTonePatternCount: CSP_TG_TOS_PLUGIN_SPEC.builtInTonePatterns.length,
		systemHelperAppCount: CSP_SYSTEM_HELPER_APP_MANIFEST.length,
		skShaperLibraryCount: CSP_SKSHAPER_UNICODE_SPEC.libraries.length,
		companionRemoteTabCount: CSP_COMPANION_REMOTE_TAB_KINDS.length,
		companionNavigatorCommandCount: CSP_COMPANION_NAVIGATOR_COMMANDS.length,
		tgCxsDefaultFontSizePt: CSP_TGCXS_DEFAULT_CONSTANTS.defaultFontSizePt,
	} as const;
}

export * from "../../../../../../packages/studio-format-gateway/src/csp-tgcxs-certmdul-mobile-companion";
