/**
 * @file csp-lippreview-tos-scan-skshaper.ts
 * @description Clip Studio 1.5 (`CLIP STUDIO.app` + `CLIP STUDIO PAINT.app` v5.1.5)
 *              잔여 네이티브 바이너리·헬퍼 앱·프레임워크 역공학(Ghidra) 및 내재화 엔진:
 *              1. `LipPreview.qlgenerator` / `LipPreview.appex` / `LipThumbnail.appex`:
 *                 `.clip` (`CSFCHUNK` -> `CHNKSQLi`) 및 `.lip` (SQLite 3.30.1) `CanvasPreview` 추출·생성기
 *              2. `TGTosPlugIn.cfpi`: IllustStudio / ComicStudio 레거시 툴셋(`toolset.mng`, `param.pld`, `.tos`)
 *                 및 톤 패턴(`Speckled 1/2`, `Drawing Paper`, `Vertical/Horizontal Scan Line`, `Blind`) 변환 엔진
 *              3. `InitInfo.app` / `CLIP STUDIO UPDATER.app` / `macUninstallScript`:
 *                 IOKit 하드웨어 시리얼 진단 및 패키지 매니페스트 라이프사이클 검증기
 *              4. `scan.app`: 종이 원고 스캔 데이터(`TIFFScanlineSize64`) 적응형 선화 이진화·배경 투명화·잡티 제거 파이프라인
 *              5. `libskia.dylib` + `libskshaper.dylib` + `libskunicode.dylib`:
 *                 만화 세로쓰기(Tategaki) 금칙처리(Kinsoku Shori)·세로중가로(Tate-Chu-Yoko)·루비(Furigana) 조판 엔진
 */

// ---------------------------------------------------------------------------
// 1. LipPreview.qlgenerator / LipPreview.appex / LipThumbnail.appex (.clip / .lip QuickLook)
// ---------------------------------------------------------------------------

export interface CspLipQuickLookPluginSpec {
	readonly bundleName:
		| "LipPreview.qlgenerator"
		| "LipPreview.appex"
		| "LipThumbnail.appex";
	readonly relativePath: string;
	readonly byteSize: number;
	readonly sha256Prefix: string;
	readonly exportedSymbols: readonly string[];
	readonly sqliteEngineVersion: "3.30.1";
	readonly vfsClass: "Planeswalker::PWSQLiteVFS";
	readonly chunkReaderClass: "Planeswalker::PWDBSQLiteChunkRead";
}

export const CSP_LIP_QUICKLOOK_PLUGIN_SPECS: readonly CspLipQuickLookPluginSpec[] = [
	{
		bundleName: "LipPreview.qlgenerator",
		relativePath: "App/CLIP STUDIO PAINT.app/Contents/Library/QuickLook/LipPreview.qlgenerator/Contents/MacOS/LipPreview",
		byteSize: 3_327_152,
		sha256Prefix: "bae15d1b181541e3",
		exportedSymbols: ["_GeneratePreviewForURL", "_GenerateThumbnailForURL", "_CancelPreviewGeneration", "_CancelThumbnailGeneration", "_AllocQuickLookGeneratorPluginType", "_QuickLookGeneratorPluginFactory"],
		sqliteEngineVersion: "3.30.1",
		vfsClass: "Planeswalker::PWSQLiteVFS",
		chunkReaderClass: "Planeswalker::PWDBSQLiteChunkRead",
	},
	{
		bundleName: "LipPreview.appex",
		relativePath: "App/CLIP STUDIO PAINT.app/Contents/PlugIns/LipPreview.appex/Contents/MacOS/LipPreview",
		byteSize: 2_896_864,
		sha256Prefix: "8fc66694d6587f44",
		exportedSymbols: ["_OBJC_CLASS_$_PreviewProvider", "_OBJC_CLASS_$_PreviewViewController", "__ZN12Planeswalker10PWDBSQLite10ExecSelectE"],
		sqliteEngineVersion: "3.30.1",
		vfsClass: "Planeswalker::PWSQLiteVFS",
		chunkReaderClass: "Planeswalker::PWDBSQLiteChunkRead",
	},
	{
		bundleName: "LipThumbnail.appex",
		relativePath: "App/CLIP STUDIO PAINT.app/Contents/PlugIns/LipThumbnail.appex/Contents/MacOS/LipThumbnail",
		byteSize: 2_892_752,
		sha256Prefix: "8295626966a3e4c9",
		exportedSymbols: ["_OBJC_CLASS_$_ThumbnailProvider", "__ZN12Planeswalker10PWDBSQLite11CheckDBFileERKNS_8PWStringE"],
		sqliteEngineVersion: "3.30.1",
		vfsClass: "Planeswalker::PWSQLiteVFS",
		chunkReaderClass: "Planeswalker::PWDBSQLiteChunkRead",
	},
] as const;

export interface CspLipQuickLookPreviewResult {
	readonly containerFormat: "clip_csfchunk" | "lip_sqlite3" | "unknown";
	readonly sqliteOffset: number;
	readonly hasCanvasPreviewTable: boolean;
	readonly extractedPngBytes: Uint8Array | null;
	readonly previewWidthPx: number;
	readonly previewHeightPx: number;
	readonly bitDepth: number;
	readonly colorType: number;
}

const ASCII_DECODER = new TextDecoder("ascii");
const UTF8_ENCODER = new TextEncoder();

function findSubarrayOffset(
	haystack: Uint8Array,
	needle: readonly number[],
	startOffset = 0,
): number {
	const limit = haystack.length - needle.length;
	for (let i = Math.max(0, startOffset); i <= limit; i += 1) {
		let matched = true;
		for (let j = 0; j < needle.length; j += 1) {
			if (haystack[i + j] !== needle[j]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			return i;
		}
	}
	return -1;
}

/**
 * `LipPreview.qlgenerator`의 `Planeswalker::PWDBSQLiteChunkRead` + `CanvasPreview` PNG 추출 로직을 재현한다.
 * `.clip` (`CSFCHUNK` -> `CHNKSQLi`) 및 `.lip` (`SQLite format 3\0`) 컨테이너 모두 지원한다.
 */
export function extractCspLipQuickLookPreview(
	fileBytes: Uint8Array,
): CspLipQuickLookPreviewResult {
	if (fileBytes.length < 24) {
		return {
			containerFormat: "unknown",
			sqliteOffset: -1,
			hasCanvasPreviewTable: false,
			extractedPngBytes: null,
			previewWidthPx: 0,
			previewHeightPx: 0,
			bitDepth: 0,
			colorType: 0,
		};
	}

	const header8 = ASCII_DECODER.decode(fileBytes.subarray(0, 8));
	const header15 = ASCII_DECODER.decode(fileBytes.subarray(0, 15));

	let containerFormat: "clip_csfchunk" | "lip_sqlite3" | "unknown" = "unknown";
	let sqliteOffset = -1;

	if (header8 === "CSFCHUNK") {
		containerFormat = "clip_csfchunk";
		// CHNKSQLi 시그니처 탐색: [0x43, 0x48, 0x4e, 0x4b, 0x53, 0x51, 0x4c, 0x69]
		const chnkSqliOffset = findSubarrayOffset(
			fileBytes,
			[0x43, 0x48, 0x4e, 0x4b, 0x53, 0x51, 0x4c, 0x69],
		);
		if (chnkSqliOffset >= 0 && chnkSqliOffset + 16 <= fileBytes.length) {
			sqliteOffset = chnkSqliOffset + 16;
		}
	} else if (header15 === "SQLite format 3") {
		containerFormat = "lip_sqlite3";
		sqliteOffset = 0;
	}

	// "CanvasPreview" ASCII 바이트 시퀀스 존재 여부 확인
	const canvasPreviewBytes = [
		0x43, 0x61, 0x6e, 0x76, 0x61, 0x73, 0x50, 0x72, 0x65, 0x76, 0x69, 0x65, 0x77,
	];
	const hasCanvasPreviewTable =
		findSubarrayOffset(fileBytes, canvasPreviewBytes, Math.max(0, sqliteOffset)) >= 0;

	// PNG 시그니처(89 50 4E 47 0D 0A 1A 0A) 및 IEND+CRC(49 45 4E 44 AE 42 60 82) 추출
	const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	const iendFooter = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
	const pngStart = findSubarrayOffset(
		fileBytes,
		pngMagic,
		Math.max(0, sqliteOffset),
	);

	if (pngStart < 0 || pngStart + 33 > fileBytes.length) {
		return {
			containerFormat,
			sqliteOffset,
			hasCanvasPreviewTable,
			extractedPngBytes: null,
			previewWidthPx: 0,
			previewHeightPx: 0,
			bitDepth: 0,
			colorType: 0,
		};
	}

	const iendPos = findSubarrayOffset(fileBytes, iendFooter, pngStart + 24);
	const pngEnd = iendPos >= 0 ? iendPos + iendFooter.length : fileBytes.length;
	const extractedPngBytes = fileBytes.slice(pngStart, pngEnd);

	const view = new DataView(
		extractedPngBytes.buffer,
		extractedPngBytes.byteOffset,
		extractedPngBytes.byteLength,
	);
	const previewWidthPx = view.getUint32(16, false);
	const previewHeightPx = view.getUint32(20, false);
	const bitDepth = extractedPngBytes[24] ?? 8;
	const colorType = extractedPngBytes[25] ?? 6;

	return {
		containerFormat,
		sqliteOffset,
		hasCanvasPreviewTable,
		extractedPngBytes,
		previewWidthPx,
		previewHeightPx,
		bitDepth,
		colorType,
	};
}

/**
 * 테스트 및 QuickLook 프리뷰 검증용 `.clip` (`CSFCHUNK` + `CHNKSQLi` + `CanvasPreview` PNG) 바이너리 스텁 생성기
 */
export function encodeCspLipQuickLookPreviewSqliteStub(options: {
	readonly containerFormat?: "clip_csfchunk" | "lip_sqlite3";
	readonly widthPx: number;
	readonly heightPx: number;
}): Uint8Array {
	const format = options.containerFormat ?? "clip_csfchunk";
	const pngStub = new Uint8Array(45);
	// PNG Magic (8B)
	pngStub.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	// IHDR Length (13) + "IHDR"
	pngStub.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
	const pngView = new DataView(pngStub.buffer);
	pngView.setUint32(16, Math.max(1, options.widthPx), false);
	pngView.setUint32(20, Math.max(1, options.heightPx), false);
	pngStub[24] = 8; // bitDepth = 8
	pngStub[25] = 6; // colorType = RGBA (6)
	// IEND + CRC (12B) at offset 33
	pngStub.set(
		[0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82],
		33,
	);

	const sqliteHeader = UTF8_ENCODER.encode(
		"SQLite format 3\0CanvasPreview ImageData ",
	);

	if (format === "lip_sqlite3") {
		const out = new Uint8Array(sqliteHeader.length + pngStub.length);
		out.set(sqliteHeader, 0);
		out.set(pngStub, sqliteHeader.length);
		return out;
	}

	const csfHeader = UTF8_ENCODER.encode("CSFCHUNK\0\0\0\0\0\0\0\0CHNKSQLi\0\0\0\0\0\0\0\0");
	const out = new Uint8Array(
		csfHeader.length + sqliteHeader.length + pngStub.length,
	);
	out.set(csfHeader, 0);
	out.set(sqliteHeader, csfHeader.length);
	out.set(pngStub, csfHeader.length + sqliteHeader.length);
	return out;
}

// ---------------------------------------------------------------------------
// 2. TGTosPlugIn.cfpi 레거시 IllustStudio / ComicStudio 툴셋(.tos / toolset.mng / param.pld) 엔진
// ---------------------------------------------------------------------------

export type CspTosLegacyTonePatternType =
	| "Speckled 1"
	| "Speckled 2"
	| "Drawing Paper"
	| "Vertical Scan Line"
	| "Horizontal Scan Line"
	| "Blind";

export type CspTosLegacyBrushStyle = "stamp" | "airbrush" | "ribbon";

export const CSP_TG_TOS_PLUGIN_SPEC = {
	bundleName: "TGTosPlugIn.cfpi",
	byteSize: 6_279_888,
	sha256Prefix: "7c94b2d0c35a41e8",
	supportedLegacyContainers: [
		"IllustStudio material",
		"ComicStudio tone",
		"IllustStudio brush pattern",
		"IllustStudio tool set",
	],
	manifestFiles: ["toolset.mng", "param.pld"],
	builtInTonePatterns: [
		"Speckled 1",
		"Speckled 2",
		"Drawing Paper",
		"Vertical Scan Line",
		"Horizontal Scan Line",
		"Blind",
	] as const satisfies readonly CspTosLegacyTonePatternType[],
	brushStyles: [
		"stamp",
		"airbrush",
		"ribbon",
	] as const satisfies readonly CspTosLegacyBrushStyle[],
	controlParameterCurves: [
		"ScaleControlParameters",
		"OpacityControlParameters",
		"HeadRateControlParameters",
		"IntervalControlParameters",
		"SprayControlParameters",
		"DensityControlParameters",
		"HeadOrientationControlParameters",
		"MixColorControlParameters",
		"MixAlphaControlParameters",
		"VectorUseSmooth",
		"VectorSmoothPower",
		"VectorMultiplyParam",
	] as const,
} as const;

export interface CspTosLegacyToolInput {
	readonly kindName: string;
	readonly innerName: string;
	readonly brushStyle: CspTosLegacyBrushStyle;
	readonly brushSizePx: number;
	readonly brushSizeMinimumPercent: number;
	readonly inOutDrawLine: boolean;
	readonly vectorByTrace: boolean;
	readonly vectorSmoothPower: number;
	readonly tonePattern?: CspTosLegacyTonePatternType;
}

export interface CspConvertedSutFromTos {
	readonly sutSubToolName: string;
	readonly sutBrushPatternMode: 0 | 1 | 2;
	readonly brushSizePx: number;
	readonly minSizeRatio01: number;
	readonly taperEnabled: boolean;
	readonly vectorCenterlineTrace: boolean;
	readonly stabilizerStrength01: number;
	readonly mappedToneTextureId: string | null;
}

/**
 * `TGTosPlugIn.cfpi`의 IllustStudio/ComicStudio 레거시 `.tos`(`toolset.mng` + `param.pld`) 파라미터를
 * Clip Studio Paint `.sut` (`VariantData`) 서브툴 속성으로 변환한다.
 */
export function convertCspTosLegacyToolToSutSpec(
	input: CspTosLegacyToolInput,
): CspConvertedSutFromTos {
	const sutBrushPatternMode: 0 | 1 | 2 =
		input.brushStyle === "stamp" ? 0 : input.brushStyle === "airbrush" ? 1 : 2;
	const brushSizePx = Math.max(0.1, Math.min(2000, input.brushSizePx));
	const minSizeRatio01 = Math.max(
		0,
		Math.min(1, input.brushSizeMinimumPercent / 100),
	);
	const stabilizerStrength01 = input.vectorByTrace
		? Math.max(0, Math.min(1, input.vectorSmoothPower / 100))
		: 0;

	return {
		sutSubToolName: `${input.kindName}:${input.innerName}`,
		sutBrushPatternMode,
		brushSizePx,
		minSizeRatio01,
		taperEnabled: input.inOutDrawLine,
		vectorCenterlineTrace: input.vectorByTrace,
		stabilizerStrength01,
		mappedToneTextureId: input.tonePattern ?? null,
	};
}

// ---------------------------------------------------------------------------
// 3. InitInfo.app / CLIP STUDIO UPDATER.app / macUninstallScript 헬퍼 바이너리 명세
// ---------------------------------------------------------------------------

export const CSP_SYSTEM_HELPER_APP_MANIFEST = [
	{
		appName: "InitInfo.app",
		relativePath: "CLIP STUDIO.app/Contents/Frameworks/InitInfo.app/Contents/MacOS/InitInfo",
		byteSize: 253_776,
		sha256Prefix: "10dcac53a3372864",
		ioKitRegistryKeys: ["IOPlatformExpertDevice", "IOPlatformSerialNumber", "AppleAHCIDiskDriver", "ATADeviceNub", "Model", "Serial Number"],
		licenseNamespaceUuids: ["B3F91AB7-4E51-41de-A595-0968096F4777", "2E709EF9-7475-45ee-8CCC-0C6212635299"],
	},
	{
		appName: "CLIP STUDIO UPDATER.app",
		relativePath: "App/CLIP STUDIO PAINT.app/Contents/MacOS/Updater/CLIP STUDIO UPDATER.app/Contents/MacOS/CLIP STUDIO UPDATER",
		byteSize: 13_138_176,
		sha256Prefix: "b6f175c923677ed3",
		bootParameterClass: "Planeswalker::PWApplicationBootArgumentEventParameter",
		pencilEventClass: "Planeswalker::PWApplePencilEventParameter",
	},
	{
		appName: "macUninstallScript",
		relativePath: "App/CLIP STUDIO PAINT.app/Contents/MacOS/Updater/CLIP STUDIO UPDATER.app/Contents/Script/macUninstallScript",
		byteSize: 169_552,
		sha256Prefix: "1862f65d3bdb4761",
		cliArgs: ["targetFolderPath", "plistFilePath"],
		logPhases: ["start uninstall", "end uninstall"],
	},
] as const;

// ---------------------------------------------------------------------------
// 4. scan.app 종이 원고 스캐너 선화 적응형 이진화(Sauvola/Otsu) 및 배경 투명화 파이프라인
// ---------------------------------------------------------------------------

export const CSP_SCAN_APP_SPEC = {
	appName: "scan.app",
	relativePath:
		"App/CLIP STUDIO PAINT.app/Contents/MacOS/Scan/scan.app/Contents/MacOS/scan",
	byteSize: 13_038_128,
	sha256Prefix: "08d53ab4b07e7ec5",
	parameterClass: "Planeswalker::PWImageFileParameter",
	tiffScanlineRoutines: [
		"TIFFScanlineSize64",
		"TIFFRasterScanlineSize64",
		"TIFFWriteScanline",
		"OJPEGDecodeScanlines",
	],
} as const;

export interface CspScanAppBinarizationOptions {
	readonly threshold01?: number;
	readonly localContrastSensitivity01?: number;
	readonly despeckle3x3?: boolean;
	readonly convertPaperToTransparent?: boolean;
}

/**
 * `scan.app`에서 스캔한 종이 원고 RGBA 이미지를 만화 선화 레이어로 변환한다.
 * - 3x3 미디언 기반 미세 먼지(Despeckle) 제거
 * - 국소 평균 대비 적응형 임계값(Sauvola 스타일) + 전역 임계값 결합 이진화
 * - 종이 배경 백색 영역을 투명 알파(`alpha = 0`)로 분리("밝기를 투명도로 변환")
 */
export function applyCspScanAppLineArtBinarization(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspScanAppBinarizationOptions = {},
): {
	readonly data: Uint8ClampedArray;
	readonly inkPixelCount: number;
	readonly transparentPaperPixelCount: number;
} {
	const threshold01 = Math.max(0.05, Math.min(0.95, options.threshold01 ?? 0.55));
	const sensitivity = Math.max(
		0,
		Math.min(0.5, options.localContrastSensitivity01 ?? 0.15),
	);
	const despeckle = options.despeckle3x3 ?? true;
	const convertPaperToTransparent = options.convertPaperToTransparent ?? true;

	const pixelCount = width * height;
	const lum = new Float32Array(pixelCount);

	for (let i = 0; i < pixelCount; i += 1) {
		const idx = i * 4;
		const r = (src[idx] ?? 255) / 255;
		const g = (src[idx + 1] ?? 255) / 255;
		const b = (src[idx + 2] ?? 255) / 255;
		lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
	}

	const binaryInk = new Uint8Array(pixelCount);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let sum = 0;
			let count = 0;
			for (let dy = -1; dy <= 1; dy += 1) {
				const ny = Math.max(0, Math.min(height - 1, y + dy));
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = Math.max(0, Math.min(width - 1, x + dx));
					sum += lum[ny * width + nx] ?? 1;
					count += 1;
				}
			}
			const localMean = sum / count;
			const effectiveThreshold =
				threshold01 * (1 - sensitivity) + localMean * sensitivity;
			const pLum = lum[y * width + x] ?? 1;
			binaryInk[y * width + x] = pLum <= effectiveThreshold ? 1 : 0;
		}
	}

	const cleanedInk = new Uint8Array(pixelCount);
	if (despeckle && width >= 3 && height >= 3) {
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const center = binaryInk[y * width + x] ?? 0;
				let neighborInkCount = 0;
				for (let dy = -1; dy <= 1; dy += 1) {
					const ny = Math.max(0, Math.min(height - 1, y + dy));
					for (let dx = -1; dx <= 1; dx += 1) {
						if (dx === 0 && dy === 0) continue;
						const nx = Math.max(0, Math.min(width - 1, x + dx));
						neighborInkCount += binaryInk[ny * width + nx] ?? 0;
					}
				}
				// 고립된 단일 점 노이즈(이웃 잉크 0개) 제거 및 사방이 둘러싸인 핀홀(이웃 7개 이상) 메움
				if (center === 1 && neighborInkCount === 0) {
					cleanedInk[y * width + x] = 0;
				} else if (center === 0 && neighborInkCount >= 7) {
					cleanedInk[y * width + x] = 1;
				} else {
					cleanedInk[y * width + x] = center;
				}
			}
		}
	} else {
		cleanedInk.set(binaryInk);
	}

	const out = new Uint8ClampedArray(pixelCount * 4);
	let inkPixelCount = 0;
	let transparentPaperPixelCount = 0;

	for (let i = 0; i < pixelCount; i += 1) {
		const idx = i * 4;
		if (cleanedInk[i] === 1) {
			inkPixelCount += 1;
			const darkness01 = Math.max(0.2, 1 - (lum[i] ?? 0));
			out[idx] = 0;
			out[idx + 1] = 0;
			out[idx + 2] = 0;
			out[idx + 3] = convertPaperToTransparent
				? Math.round(darkness01 * 255)
				: 255;
		} else {
			if (convertPaperToTransparent) {
				transparentPaperPixelCount += 1;
				out[idx] = 0;
				out[idx + 1] = 0;
				out[idx + 2] = 0;
				out[idx + 3] = 0;
			} else {
				out[idx] = 255;
				out[idx + 1] = 255;
				out[idx + 2] = 255;
				out[idx + 3] = 255;
			}
		}
	}

	return {
		data: out,
		inkPixelCount,
		transparentPaperPixelCount,
	};
}

// ---------------------------------------------------------------------------
// 5. libskia.dylib + libskshaper.dylib + libskunicode.dylib 만화 세로쓰기(금칙처리·TCY·루비) 엔진
// ---------------------------------------------------------------------------

export const CSP_SKSHAPER_UNICODE_SPEC = {
	libraries: [
		{
			fileName: "libskia.dylib",
			byteSize: 12_340_368,
		},
		{
			fileName: "libskshaper.dylib",
			byteSize: 1_763_904,
			sha256Prefix: "a96a5dace6688520",
			sourcePath: "../../../skia/modules/skshaper/src/SkShaper_harfbuzz.cpp",
			exportedSymbols: [
				"SkShaper::MakeCoreText()",
				"SkShaper::MakePrimitive()",
				"SkShaper::MakeShapeThenWrap(sk_sp<SkFontMgr>)",
				"SkShaper::MakeBiDiRunIterator(char const*, unsigned long, unsigned char)",
				"SkShaper::MakeScriptRunIterator(char const*, unsigned long, unsigned int)",
				"SkShaper::MakeFontMgrRunIterator(char const*, unsigned long, SkFont const&, sk_sp<SkFontMgr>)",
				"SkTextBlobBuilderRunHandler::beginLine()",
				"SkTextBlobBuilderRunHandler::commitRunBuffer(SkShaper::RunHandler::RunInfo const&)",
				"SkTextBlobBuilderRunHandler::commitLine()",
				"SkTextBlobBuilderRunHandler::makeBlob()",
			],
		},
		{
			fileName: "libskunicode.dylib",
			byteSize: 209_728,
			sha256Prefix: "f8fbf8e9d8c3b657",
			exportedSymbols: [
				"SkUnicode::Make()",
				"SkBidiIterator::ReorderVisual(unsigned char const*, int, int*)",
			],
		},
	],
	/** 행두 금칙 문자 (줄의 첫 칸에 올 수 없는 문장부호·닫는 괄호·장음) */
	kinsokuLineStartForbiddenChars:
		"、。，．・：；？！ー）」』】〉》〕］｝!?%),.:;]}",
	/** 행말 금칙 문자 (줄의 마지막 칸에 올 수 없는 여는 괄호) */
	kinsokuLineEndForbiddenChars: "（「『【〈《〔［｛([{#",
} as const;

export interface CspVerticalGlyphCluster {
	readonly text: string;
	readonly kind: "vertical_char" | "tate_chu_yoko" | "ruby_annotated";
	readonly rubyText: string | null;
	readonly columnIndex: number;
	readonly rowIndex: number;
	readonly xPx: number;
	readonly yPx: number;
	readonly rubyXPx: number | null;
	readonly rubyYPx: number | null;
	readonly kinsokuAdjusted: boolean;
}

export interface CspSkShaperMangaVerticalLayoutOptions {
	readonly maxRowsPerColumn: number;
	readonly fontSizePx?: number;
	readonly columnAdvancePx?: number;
	readonly enableTateChuYoko?: boolean;
	readonly enableKinsokuShori?: boolean;
}

export interface CspSkShaperMangaVerticalLayoutResult {
	readonly clusters: readonly CspVerticalGlyphCluster[];
	readonly columnCount: number;
	readonly tateChuYokoCount: number;
	readonly rubyAnnotationCount: number;
	readonly kinsokuAdjustmentCount: number;
}

function tokenizeMangaVerticalSource(
	sourceText: string,
	enableTateChuYoko: boolean,
): readonly {
	readonly text: string;
	readonly kind: "vertical_char" | "tate_chu_yoko" | "ruby_annotated";
	readonly rubyText: string | null;
}[] {
	const tokens: {
		readonly text: string;
		readonly kind: "vertical_char" | "tate_chu_yoko" | "ruby_annotated";
		readonly rubyText: string | null;
	}[] = [];

	let i = 0;
	while (i < sourceText.length) {
		// 1. {본문|루비} 형식의 루비 주석 파싱
		if (sourceText[i] === "{") {
			const closeIdx = sourceText.indexOf("}", i + 1);
			const pipeIdx = sourceText.indexOf("|", i + 1);
			if (closeIdx > i + 1 && pipeIdx > i + 1 && pipeIdx < closeIdx) {
				const baseText = sourceText.slice(i + 1, pipeIdx);
				const rubyText = sourceText.slice(pipeIdx + 1, closeIdx);
				tokens.push({
					text: baseText,
					kind: "ruby_annotated",
					rubyText,
				});
				i = closeIdx + 1;
				continue;
			}
		}

		// 2. 세로중가로(Tate-Chu-Yoko): 연속된 2자리 숫자 또는 `!?` / `!!` / `??`
		if (enableTateChuYoko && i + 1 < sourceText.length) {
			const pair = sourceText.slice(i, i + 2);
			const nextChar = sourceText[i + 2] ?? "";
			const isTwoDigitNumber =
				/^[0-9]{2}$/.test(pair) && !/^[0-9]$/.test(nextChar);
			const isDoubleExclamQuestion =
				pair === "!?" || pair === "?!" || pair === "!!" || pair === "??";
			if (isTwoDigitNumber || isDoubleExclamQuestion) {
				tokens.push({
					text: pair,
					kind: "tate_chu_yoko",
					rubyText: null,
				});
				i += 2;
				continue;
			}
		}

		tokens.push({
			text: sourceText[i]!,
			kind: "vertical_char",
			rubyText: null,
		});
		i += 1;
	}

	return tokens;
}

/**
 * `libskshaper.dylib` (`SkShaper_harfbuzz.cpp`) + `libskunicode.dylib` 기반
 * 만화 대사 세로쓰기(우→좌 열 진행, 상→하 행 진행) 조판 및 금칙처리·TCY·루비 레이아웃 계산기
 */
export function layoutCspSkShaperMangaVerticalText(
	sourceText: string,
	options: CspSkShaperMangaVerticalLayoutOptions,
): CspSkShaperMangaVerticalLayoutResult {
	const maxRows = Math.max(2, options.maxRowsPerColumn);
	const fontSizePx = Math.max(8, options.fontSizePx ?? 20);
	const columnAdvancePx = Math.max(
		fontSizePx,
		options.columnAdvancePx ?? Math.round(fontSizePx * 1.65),
	);
	const enableTateChuYoko = options.enableTateChuYoko ?? true;
	const enableKinsokuShori = options.enableKinsokuShori ?? true;

	const rawTokens = tokenizeMangaVerticalSource(sourceText, enableTateChuYoko);
	const columns: {
		text: string;
		kind: "vertical_char" | "tate_chu_yoko" | "ruby_annotated";
		rubyText: string | null;
		kinsokuAdjusted: boolean;
	}[][] = [[]];

	let kinsokuAdjustmentCount = 0;

	for (let idx = 0; idx < rawTokens.length; idx += 1) {
		const tok = rawTokens[idx]!;
		if (tok.text === "\n") {
			columns.push([]);
			continue;
		}

		let currentCol = columns[columns.length - 1]!;
		if (currentCol.length >= maxRows) {
			// 행두 금칙문자(예: 。, 、, ）, ！）가 새 열의 첫 글자가 되려 할 때 이전 열 끝에 밀어넣기(Oikomi)
			if (
				enableKinsokuShori &&
				tok.text.length === 1 &&
				CSP_SKSHAPER_UNICODE_SPEC.kinsokuLineStartForbiddenChars.includes(
					tok.text,
				)
			) {
				currentCol.push({ ...tok, kinsokuAdjusted: true });
				kinsokuAdjustmentCount += 1;
				columns.push([]);
				continue;
			}
			columns.push([]);
			currentCol = columns[columns.length - 1]!;
		}

		// 행말 금칙문자(예: （, 「, 『)가 열의 마지막 칸(maxRows - 1)에 오려 할 때 다음 열 첫 칸으로 밀어내기(Oidashi)
		if (
			enableKinsokuShori &&
			currentCol.length === maxRows - 1 &&
			tok.text.length === 1 &&
			CSP_SKSHAPER_UNICODE_SPEC.kinsokuLineEndForbiddenChars.includes(tok.text)
		) {
			const nextCol: typeof currentCol = [{ ...tok, kinsokuAdjusted: true }];
			kinsokuAdjustmentCount += 1;
			columns.push(nextCol);
			continue;
		}

		currentCol.push({ ...tok, kinsokuAdjusted: false });
	}

	const nonEmptyColumns = columns.filter((c) => c.length > 0);
	const totalCols = Math.max(1, nonEmptyColumns.length);
	const clusters: CspVerticalGlyphCluster[] = [];
	let tateChuYokoCount = 0;
	let rubyAnnotationCount = 0;

	for (let colIdx = 0; colIdx < nonEmptyColumns.length; colIdx += 1) {
		const col = nonEmptyColumns[colIdx]!;
		// 세로쓰기는 우측 열(colIdx = 0)에서 좌측 열로 진행
		const xPx = (totalCols - 1 - colIdx) * columnAdvancePx;
		for (let rowIdx = 0; rowIdx < col.length; rowIdx += 1) {
			const item = col[rowIdx]!;
			const yPx = rowIdx * fontSizePx;
			if (item.kind === "tate_chu_yoko") {
				tateChuYokoCount += 1;
			}
			if (item.kind === "ruby_annotated" && item.rubyText) {
				rubyAnnotationCount += 1;
			}
			clusters.push({
				text: item.text,
				kind: item.kind,
				rubyText: item.rubyText,
				columnIndex: colIdx,
				rowIndex: rowIdx,
				xPx,
				yPx,
				rubyXPx:
					item.rubyText !== null ? xPx + Math.round(fontSizePx * 0.55) : null,
				rubyYPx: item.rubyText !== null ? yPx : null,
				kinsokuAdjusted: item.kinsokuAdjusted,
			});
		}
	}

	return {
		clusters,
		columnCount: nonEmptyColumns.length,
		tateChuYokoCount,
		rubyAnnotationCount,
		kinsokuAdjustmentCount,
	};
}
