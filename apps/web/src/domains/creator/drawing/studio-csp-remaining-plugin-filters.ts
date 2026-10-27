/**
 * @file studio-csp-remaining-plugin-filters.ts
 * @description Clip Studio Paint 5.1.5 `App/PlugIn/PAINT/*.bundle` 잔여 9종 네이티브 필터 플러그인
 *              REA Ghidra 디컴파일 역공학 및 픽셀 단위 알고리즘 내재화:
 *              1. `LineWidth.bundle` (`PILineWidth::ThinRaster`, `FatRaster`, `JudgeCorePixel`, `SearchNearestColorPixel`)
 *              2. `Sphere.bundle` (`PISphereFilter::Pre`, `PISphereFilter::Do`)
 *              3. `Waveform.bundle` (`PIWaveformFilter::DoWaveform`, `GetCircleWave`, `GetTriangleWave`, `GetSquareWave`)
 *              4. `Zigzag.bundle` (`PIZigzagFilter::Pre`, `PIZigzagFilter::Do`)
 *              5. `GeometricDistortionPanorama.bundle` (`PIGeometricDistortionPanoramaFilter::TransformationEquiRectangularToPerspective` / `TransformationPerspectiveToEquirectangular`)
 *              6. `TPPFilmCameraStyle.bundle` (`TPPFilmCameraStyle::Processor::ExecutePrivate` `0x16710..0x16760` 실측 상수)
 *              7. `PencilArtFilter.bundle` (`PencilArtFilterBlockProcessor::GenerateDirectionalOutlines`, `GeneratePenStrokes`)
 *              8. `FlowBasedAbstraction.bundle` (`FBImageAbstraction::EdgeTangentFlowFactory`, `LineExtractor`, `Posterizer`, `LineCompounder`)
 *              9. `Smoothing.bundle` (`ReadyLineData`, `SmoothingLineBlock`)
 */

function clampByte(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

function sampleRgbaBilinear(
	src: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
	fx: number,
	fy: number,
): readonly [number, number, number, number] {
	const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
	const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
	const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
	const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
	const tx = Math.max(0, Math.min(1, fx - Math.floor(fx)));
	const ty = Math.max(0, Math.min(1, fy - Math.floor(fy)));

	const i00 = (y0 * width + x0) * 4;
	const i10 = (y0 * width + x1) * 4;
	const i01 = (y1 * width + x0) * 4;
	const i11 = (y1 * width + x1) * 4;

	const bilerp = (ch: number): number =>
		(src[i00 + ch] ?? 0) * (1 - tx) * (1 - ty) +
		(src[i10 + ch] ?? 0) * tx * (1 - ty) +
		(src[i01 + ch] ?? 0) * (1 - tx) * ty +
		(src[i11 + ch] ?? 0) * tx * ty;

	return [bilerp(0), bilerp(1), bilerp(2), bilerp(3)];
}

// ---------------------------------------------------------------------------
// 1. LineWidth.bundle (선폭 수정: PILineWidth::ThinRaster / FatRaster / JudgeCorePixel)
// ---------------------------------------------------------------------------

export interface CspLineWidthFilterOptions {
	readonly mode: "thin" | "thicken";
	readonly radiusPx?: number;
	readonly remainOnePixelCore?: boolean;
}

/**
 * Ghidra 디컴파일 `PILineWidth::JudgeCorePixel(uchar centerAlpha, uchar neighbors8[8])`:
 * 8방향 시계방향 이웃 알파를 검사하여 선의 끝점(이웃 중 center 이상인 픽셀이 2개 미만)이거나
 * 제거 시 상하/좌우 연결성이 끊어지는 코어 골격 픽셀이면 `true`를 반환한다.
 */
export function judgeCspLineWidthCorePixel(
	centerAlpha: number,
	neighborsClockwise8: readonly number[],
): boolean {
	let geCount = 0;
	for (let i = 0; i < 8; i += 1) {
		if ((neighborsClockwise8[i] ?? 0) >= centerAlpha) {
			geCount += 1;
		}
	}
	if (geCount < 2) {
		return true;
	}
	// 시계방향 8이웃에서 0->1 전이 횟수(Crossing Number)가 2 이상이면 위상 골격 코어 픽셀
	let transitions = 0;
	for (let i = 0; i < 8; i += 1) {
		const curr = (neighborsClockwise8[i] ?? 0) >= centerAlpha ? 1 : 0;
		const next = (neighborsClockwise8[(i + 1) % 8] ?? 0) >= centerAlpha ? 1 : 0;
		if (curr === 0 && next === 1) {
			transitions += 1;
		}
	}
	return transitions >= 2;
}

/**
 * `LineWidth.bundle` (`PILineWidth`):
 * - `mode: "thin"`: `ThinRaster` + `remainOnePixelCore` 활성화 시 `JudgeCorePixel`로 1픽셀 중심선 보존
 * - `mode: "thicken"`: `FatRaster` + 투명 픽셀 확장 시 `SearchNearestColorPixel`로 인접 선화 색상 보전
 */
export function applyCspLineWidthFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspLineWidthFilterOptions,
): Uint8ClampedArray {
	const radius = Math.max(1, Math.min(16, Math.round(options.radiusPx ?? 1)));
	const remainCore = options.remainOnePixelCore ?? true;
	const out = new Uint8ClampedArray(src);

	const getAlpha = (x: number, y: number): number => {
		const cx = Math.max(0, Math.min(width - 1, x));
		const cy = Math.max(0, Math.min(height - 1, y));
		return src[(cy * width + cx) * 4 + 3] ?? 0;
	};

	const cwOffsets: readonly [number, number][] = [
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
	];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const dstIdx = (y * width + x) * 4;
			const centerAlpha = getAlpha(x, y);

			if (options.mode === "thin") {
				if (centerAlpha === 0) continue;
				if (remainCore) {
					const n8 = cwOffsets.map(([dx, dy]) => getAlpha(x + dx, y + dy));
					if (judgeCspLineWidthCorePixel(centerAlpha, n8)) {
						continue;
					}
				}
				let minAlpha = centerAlpha;
				for (let dy = -radius; dy <= radius; dy += 1) {
					for (let dx = -radius; dx <= radius; dx += 1) {
						const a = getAlpha(x + dx, y + dy);
						if (a < minAlpha) minAlpha = a;
					}
				}
				out[dstIdx + 3] = minAlpha;
			} else {
				let maxAlpha = centerAlpha;
				let bestColorIdx = dstIdx;
				for (let dy = -radius; dy <= radius; dy += 1) {
					for (let dx = -radius; dx <= radius; dx += 1) {
						const nx = Math.max(0, Math.min(width - 1, x + dx));
						const ny = Math.max(0, Math.min(height - 1, y + dy));
						const nIdx = (ny * width + nx) * 4;
						const a = src[nIdx + 3] ?? 0;
						if (a > maxAlpha) {
							maxAlpha = a;
							bestColorIdx = nIdx;
						}
					}
				}
				if (centerAlpha === 0 && maxAlpha > 0) {
					out[dstIdx] = src[bestColorIdx] ?? 0;
					out[dstIdx + 1] = src[bestColorIdx + 1] ?? 0;
					out[dstIdx + 2] = src[bestColorIdx + 2] ?? 0;
				}
				out[dstIdx + 3] = maxAlpha;
			}
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 2. Sphere.bundle (구면화 필터: PISphereFilter::Pre / PISphereFilter::Do)
// ---------------------------------------------------------------------------

export interface CspSphereFilterOptions {
	/** -100 (오목) ~ +100 (볼록) */
	readonly strength?: number;
	readonly oblateness?: number;
	readonly cylindricalMode?: boolean;
	readonly angleDeg?: number;
}

/**
 * Ghidra 디컴파일 `PISphereFilter::Pre` & `PISphereFilter::Do`:
 * - `strength >= 0`: `asin(r) / (pi/2)` 기반 구면 자오선 호 길이 매핑
 * - `strength < 0`: `r - strength01 * (sin(r * pi / 2) - r)` 오목 구면 매핑
 */
export function applyCspSphereFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspSphereFilterOptions = {},
): Uint8ClampedArray {
	const strength01 = Math.max(-1, Math.min(1, (options.strength ?? 60) / 100));
	const oblateness = Math.max(0.2, Math.min(5, 1 + (options.oblateness ?? 0) / 100));
	const cylindricalMode = options.cylindricalMode ?? false;
	const angleRad = ((options.angleDeg ?? 0) * Math.PI) / 180;
	const cosA = Math.cos(angleRad);
	const sinA = Math.sin(angleRad);

	const cx = width * 0.5;
	const cy = height * 0.5;
	const rx = Math.max(1, cx);
	const ry = Math.max(1, cy / oblateness);
	const out = new Uint8ClampedArray(src.length);

	const mapRadius = (rNorm: number): number => {
		if (rNorm <= 1e-5 || rNorm >= 1) return rNorm;
		if (strength01 >= 0) {
			const spherical = Math.asin(Math.min(1, rNorm)) / (Math.PI * 0.5);
			return rNorm * (1 - strength01) + spherical * strength01;
		}
		const concave = Math.sin(rNorm * Math.PI * 0.5);
		return rNorm + -strength01 * (concave - rNorm);
	};

	for (let y = 0; y < height; y += 1) {
		const ny = (y + 0.5 - cy) / ry;
		for (let x = 0; x < width; x += 1) {
			const nx = (x + 0.5 - cx) / rx;
			let sx = x;
			let sy = y;

			if (cylindricalMode) {
				const u = nx * cosA + ny * sinA;
				const v = -nx * sinA + ny * cosA;
				const absU = Math.abs(u);
				if (absU < 1) {
					const mappedU = Math.sign(u) * mapRadius(absU);
					const rxNorm = mappedU * cosA - v * sinA;
					const ryNorm = mappedU * sinA + v * cosA;
					sx = rxNorm * rx + cx - 0.5;
					sy = ryNorm * ry + cy - 0.5;
				}
			} else {
				const r = Math.hypot(nx, ny);
				if (r > 0 && r < 1) {
					const scale = mapRadius(r) / r;
					sx = nx * scale * rx + cx - 0.5;
					sy = ny * scale * ry + cy - 0.5;
				}
			}

			const [rCh, gCh, bCh, aCh] = sampleRgbaBilinear(src, width, height, sx, sy);
			const dstIdx = (y * width + x) * 4;
			out[dstIdx] = clampByte(rCh);
			out[dstIdx + 1] = clampByte(gCh);
			out[dstIdx + 2] = clampByte(bCh);
			out[dstIdx + 3] = clampByte(aCh);
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 3. Waveform.bundle (파형 왜곡: GetCircleWave / GetTriangleWave / GetSquareWave)
// ---------------------------------------------------------------------------

export type CspWaveformShape = "circle" | "triangle" | "square";

export interface CspWaveformFilterOptions {
	readonly shape?: CspWaveformShape;
	readonly wavelengthPx?: number;
	readonly amplitudeX?: number;
	readonly amplitudeY?: number;
}

/**
 * Ghidra 디컴파일 `GetCircleWave(double)`, `GetTriangleWave(double)`, `GetSquareWave(double)` 정확 재현
 */
export function evaluateCspNativeWaveFunction(
	phase01: number,
	shape: CspWaveformShape,
): number {
	const uVar1 = Math.floor(phase01 * 65536.0) & 0xffff;
	if (shape === "circle") {
		return Math.sin(phase01 * 2 * 3.141592);
	}
	if (shape === "square") {
		if (uVar1 > 0x4000 && uVar1 <= 0x8000) return -1.0;
		if (uVar1 > 0xc000) return -1.0;
		return 1.0;
	}
	// GetTriangleWave(double): 16-bit fixed-point (6.103515625e-05 = 1 / 16384.0)
	let dVar3: number;
	if (uVar1 < 0x4001) {
		dVar3 = uVar1;
	} else if (uVar1 < 0xc001) {
		dVar3 = 0x8000 - uVar1;
	} else {
		dVar3 = uVar1 - 0x10000;
	}
	return dVar3 * 6.103515625e-05;
}

export function applyCspWaveformFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspWaveformFilterOptions = {},
): Uint8ClampedArray {
	const shape = options.shape ?? "circle";
	const wavelengthPx = Math.max(2, options.wavelengthPx ?? 16);
	const ampX = options.amplitudeX ?? 4;
	const ampY = options.amplitudeY ?? 4;
	const out = new Uint8ClampedArray(src.length);

	for (let y = 0; y < height; y += 1) {
		const waveX =
			evaluateCspNativeWaveFunction((y / wavelengthPx) % 1, shape) * ampX;
		for (let x = 0; x < width; x += 1) {
			const waveY =
				evaluateCspNativeWaveFunction((x / wavelengthPx) % 1, shape) * ampY;
			const [r, g, b, a] = sampleRgbaBilinear(
				src,
				width,
				height,
				x + waveX,
				y + waveY,
			);
			const dstIdx = (y * width + x) * 4;
			out[dstIdx] = clampByte(r);
			out[dstIdx + 1] = clampByte(g);
			out[dstIdx + 2] = clampByte(b);
			out[dstIdx + 3] = clampByte(a);
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 4. Zigzag.bundle (지그재그 수면 파문 필터: PIZigzagFilter::Pre / PIZigzagFilter::Do)
// ---------------------------------------------------------------------------

export interface CspZigzagFilterOptions {
	readonly angleDeg?: number;
	readonly ridges?: number;
}

/**
 * Ghidra 디컴파일 `PIZigzagFilter::Pre` & `PIZigzagFilter::Do`:
 * 반경 `r`에 대해 `sin(rNorm * pi) * sin(rNorm * ridges * 2 * pi) * (angleDeg * pi / 180)` 회전 변위 적용
 */
export function applyCspZigzagFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspZigzagFilterOptions = {},
): Uint8ClampedArray {
	const maxAngleRad = ((options.angleDeg ?? 45) * Math.PI) / 180;
	const ridges = Math.max(1, options.ridges ?? 4);
	const cx = width * 0.5;
	const cy = height * 0.5;
	const maxRadius = Math.max(1, Math.min(cx, cy));
	const out = new Uint8ClampedArray(src.length);

	for (let y = 0; y < height; y += 1) {
		const dy = y + 0.5 - cy;
		for (let x = 0; x < width; x += 1) {
			const dx = x + 0.5 - cx;
			const r = Math.hypot(dx, dy);
			let sx = x;
			let sy = y;
			if (r < maxRadius) {
				const rNorm = r / maxRadius;
				const envelope = Math.sin(rNorm * Math.PI);
				const wave = Math.sin(rNorm * ridges * Math.PI * 2);
				const theta = maxAngleRad * envelope * wave;
				const cosT = Math.cos(theta);
				const sinT = Math.sin(theta);
				sx = dx * cosT - dy * sinT + cx - 0.5;
				sy = dx * sinT + dy * cosT + cy - 0.5;
			}
			const [rCh, gCh, bCh, aCh] = sampleRgbaBilinear(src, width, height, sx, sy);
			const dstIdx = (y * width + x) * 4;
			out[dstIdx] = clampByte(rCh);
			out[dstIdx + 1] = clampByte(gCh);
			out[dstIdx + 2] = clampByte(bCh);
			out[dstIdx + 3] = clampByte(aCh);
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 5. GeometricDistortionPanorama.bundle (파노라마 투영 변환: Equirectangular <-> Perspective)
// ---------------------------------------------------------------------------

export interface CspPanoramaDistortionOptions {
	readonly mode?: "equirectangular-to-perspective" | "perspective-to-equirectangular";
	readonly fovScale?: number;
}

/**
 * 디스어셈블리 `PIGeometricDistortionPanoramaFilter::TransformationEquiRectangularToPerspective` (`0x1ac4`) 및
 * `TransformationPerspectiveToEquirectangular` (`0x1b2c`) 수식 구현:
 * - Equi->Persp: `outX = tan(lon) * R`, `outY = tan(lat) * R / cos(lon)`
 * - Persp->Equi: `outLon = atan(x / R)`, `outLat = atan(y / hypot(R, x))`
 */
export function applyCspGeometricDistortionPanoramaFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspPanoramaDistortionOptions = {},
): Uint8ClampedArray {
	const mode = options.mode ?? "equirectangular-to-perspective";
	const cylinderRadius = Math.max(1, Math.min(width, height) * 0.5 * (options.fovScale ?? 1));
	const cx = width * 0.5;
	const cy = height * 0.5;
	const out = new Uint8ClampedArray(src.length);

	for (let y = 0; y < height; y += 1) {
		const dy = y + 0.5 - cy;
		for (let x = 0; x < width; x += 1) {
			const dx = x + 0.5 - cx;
			let sx: number;
			let sy: number;

			if (mode === "equirectangular-to-perspective") {
				const lon = Math.atan(dx / cylinderRadius);
				const lat = Math.atan(dy / Math.hypot(cylinderRadius, dx));
				sx = lon * cylinderRadius + cx - 0.5;
				sy = lat * cylinderRadius + cy - 0.5;
			} else {
				const lon = Math.max(-1.35, Math.min(1.35, dx / cylinderRadius));
				const lat = Math.max(-1.35, Math.min(1.35, dy / cylinderRadius));
				sx = Math.tan(lon) * cylinderRadius + cx - 0.5;
				sy = (Math.tan(lat) * cylinderRadius) / Math.max(0.1, Math.cos(lon)) + cy - 0.5;
			}

			const [rCh, gCh, bCh, aCh] = sampleRgbaBilinear(src, width, height, sx, sy);
			const dstIdx = (y * width + x) * 4;
			out[dstIdx] = clampByte(rCh);
			out[dstIdx + 1] = clampByte(gCh);
			out[dstIdx + 2] = clampByte(bCh);
			out[dstIdx + 3] = clampByte(aCh);
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 6. TPPFilmCameraStyle.bundle (토이/필름 카메라 효과: 0x16710..0x16760 IEEE-754 상수)
// ---------------------------------------------------------------------------

export const CSP_TPP_FILM_CAMERA_STYLE_CONSTANTS = {
	vintageSepiaBlendWeight: 0.4,
	sepiaMatrixRgb: [
		[0.393, 0.769, 0.189],
		[0.349, 0.686, 0.168],
		[0.272, 0.534, 0.131],
	] as const,
	lightLeakBoostRgb: [0.58, 0.21, 0.0] as const,
} as const;

export interface CspTppFilmCameraStyleOptions {
	readonly chromaticAberrationPx?: number;
	readonly vintageSepiaEnabled?: boolean;
	readonly lightLeakMode?: "none" | "left" | "right" | "corner";
	readonly noiseAmount01?: number;
}

/**
 * `TPPFilmCameraStyle.bundle` (`ExecutePrivate` `0x1e48..0x2350` + `0x16710..0x16760` 실측 상수):
 * 1. 방사형 R/B 색수차(Radial Chromatic Aberration)
 * 2. 40% 세피아 톤 매트릭스 (`[0.393, 0.769, 0.189; 0.349, 0.686, 0.168; 0.272, 0.534, 0.131]`)
 * 3. 빛샘(Light Leak: `+0.580 R`, `+0.210 G`, `+0.000 B`) 및 필름 그레인(`TPPNormalNoise<3>`)
 */
export function applyCspTppFilmCameraStyleFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspTppFilmCameraStyleOptions = {},
): Uint8ClampedArray {
	const aberrationPx = Math.max(0, options.chromaticAberrationPx ?? 1.5);
	const sepiaEnabled = options.vintageSepiaEnabled ?? true;
	const lightLeakMode = options.lightLeakMode ?? "corner";
	const noiseAmount = Math.max(0, Math.min(0.5, options.noiseAmount01 ?? 0.04));

	const cx = width * 0.5;
	const cy = height * 0.5;
	const maxDist = Math.max(1, Math.hypot(cx, cy));
	const s11 = sepiaEnabled
		? CSP_TPP_FILM_CAMERA_STYLE_CONSTANTS.vintageSepiaBlendWeight
		: 0;
	const s3 = 1 - s11;

	const out = new Uint8ClampedArray(src.length);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const dx = x - cx;
			const dy = y - cy;
			const distRatio = Math.hypot(dx, dy) / maxDist;
			const angle = Math.atan2(dy, dx);
			const shiftX = Math.cos(angle) * distRatio * aberrationPx;
			const shiftY = Math.sin(angle) * distRatio * aberrationPx;

			const [rSample] = sampleRgbaBilinear(src, width, height, x + shiftX, y + shiftY);
			const [, gSample, , aSample] = sampleRgbaBilinear(src, width, height, x, y);
			const [, , bSample] = sampleRgbaBilinear(
				src,
				width,
				height,
				x - shiftX,
				y - shiftY,
			);

			const r01 = rSample / 255;
			const g01 = gSample / 255;
			const b01 = bSample / 255;

			let s14 = 0;
			if (lightLeakMode === "left") {
				s14 = Math.max(0, 1 - x / Math.max(1, width * 0.6));
			} else if (lightLeakMode === "right") {
				s14 = Math.max(0, 1 - (width - 1 - x) / Math.max(1, width * 0.6));
			} else if (lightLeakMode === "corner") {
				const cornerDist = Math.hypot(x, y) / Math.max(1, Math.min(width, height));
				s14 = Math.max(0, 1 - cornerDist);
			}

			// 0x2234..0x22e8 실측 행렬 수식
			const outR01 =
				(0.393 + s3 * 0.607) * r01 +
				(0.769 + s3 * -0.769) * g01 +
				(0.189 + s3 * -0.189) * b01 +
				s14 * 0.58;
			const outG01 =
				(0.349 + s3 * -0.349) * r01 +
				(0.686 + s3 * 0.314) * g01 +
				(0.168 + s3 * -0.168) * b01 +
				s14 * 0.21;
			const outB01 =
				(0.272 + s3 * -0.272) * r01 +
				(0.534 + s3 * -0.534) * g01 +
				(0.131 + s3 * 0.869) * b01;

			// 결정론적 필름 그레인 노이즈 (TPPNormalNoise<3>)
			const hash = Math.sin((x * 12.9898 + y * 78.233) * 43758.5453);
			const grain = (hash - Math.floor(hash) - 0.5) * noiseAmount;

			const dstIdx = (y * width + x) * 4;
			out[dstIdx] = clampByte((outR01 + grain) * 255);
			out[dstIdx + 1] = clampByte((outG01 + grain) * 255);
			out[dstIdx + 2] = clampByte((outB01 + grain) * 255);
			out[dstIdx + 3] = clampByte(aSample);
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 7. PencilArtFilter.bundle (연필화 필터: 방향성 윤곽선 + 해칭 스트로크 합성)
// ---------------------------------------------------------------------------

export interface CspPencilArtFilterOptions {
	readonly showOutline?: boolean;
	readonly showHatchingBackground?: boolean;
	readonly grayscaleOutput?: boolean;
	readonly outlineStrength?: number;
}

/**
 * `PencilArtFilter.bundle` (`PencilArtFilterBlockProcessor`):
 * - `GenerateDirectionalOutlines`: Sobel 그래디언트 기반 방향성 연필 윤곽선 추출
 * - `GeneratePenStrokes`: 명암 단계에 따른 대각 크로스해칭(Hatching) 연필 빗금 합성
 */
export function applyCspPencilArtFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspPencilArtFilterOptions = {},
): Uint8ClampedArray {
	const showOutline = options.showOutline ?? true;
	const showHatching = options.showHatchingBackground ?? true;
	const grayscaleOutput = options.grayscaleOutput ?? true;
	const outlineStrength = Math.max(0.2, Math.min(3, options.outlineStrength ?? 1.2));

	const lum = new Float32Array(width * height);
	for (let i = 0; i < width * height; i += 1) {
		const idx = i * 4;
		lum[i] =
			(0.299 * (src[idx] ?? 0) +
				0.587 * (src[idx + 1] ?? 0) +
				0.114 * (src[idx + 2] ?? 0)) /
			255;
	}

	const getL = (x: number, y: number): number => {
		const cx = Math.max(0, Math.min(width - 1, x));
		const cy = Math.max(0, Math.min(height - 1, y));
		return lum[cy * width + cx] ?? 0;
	};

	const out = new Uint8ClampedArray(src.length);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const gx =
				-getL(x - 1, y - 1) -
				2 * getL(x - 1, y) -
				getL(x - 1, y + 1) +
				getL(x + 1, y - 1) +
				2 * getL(x + 1, y) +
				getL(x + 1, y + 1);
			const gy =
				-getL(x - 1, y - 1) -
				2 * getL(x, y - 1) -
				getL(x + 1, y - 1) +
				getL(x - 1, y + 1) +
				2 * getL(x, y + 1) +
				getL(x + 1, y + 1);
			const edgeMag = Math.min(1, Math.hypot(gx, gy) * outlineStrength);

			const baseLum = getL(x, y);
			let paperTone: number;

			if (showHatching) {
				const hatch1 = ((x + y) % 3 === 0 ? 0.18 : 0) * (1 - baseLum);
				const hatch2 =
					baseLum < 0.45 && (x - y + 1024) % 3 === 0 ? 0.22 * (1 - baseLum) : 0;
				paperTone = Math.max(0, baseLum * 0.85 + 0.15 - hatch1 - hatch2);
			} else {
				paperTone = baseLum;
			}

			const finalTone = showOutline
				? Math.max(0, paperTone * (1 - edgeMag * 0.85))
				: paperTone;

			const dstIdx = (y * width + x) * 4;
			if (grayscaleOutput) {
				const v = clampByte(finalTone * 255);
				out[dstIdx] = v;
				out[dstIdx + 1] = v;
				out[dstIdx + 2] = v;
			} else {
				const scale = finalTone / Math.max(0.05, baseLum);
				out[dstIdx] = clampByte((src[dstIdx] ?? 0) * scale);
				out[dstIdx + 1] = clampByte((src[dstIdx + 1] ?? 0) * scale);
				out[dstIdx + 2] = clampByte((src[dstIdx + 2] ?? 0) * scale);
			}
			out[dstIdx + 3] = src[dstIdx + 3] ?? 255;
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 8. FlowBasedAbstraction.bundle (일러스트풍 추상화: ETF + FDoG + Posterizer + LineCompounder)
// ---------------------------------------------------------------------------

export interface CspFlowBasedAbstractionOptions {
	readonly numberOfGradations?: number;
	readonly lineOpacity01?: number;
	readonly dogBinarizationThreshold?: number;
}

/**
 * `FlowBasedAbstraction.bundle` (`TriglavPlugIn::FBImageAbstraction`):
 * - `EdgeTangentFlowFactory` + `LineExtractor` (DoG 에지 검출 + 이진화)
 * - `ImageAbstractor` (양방향 스무딩) + `Posterizer` (`numberOfGradations` 계조 양자화)
 * - `LineCompounder` (추출된 선화를 포스터라이즈된 컬러 위에 합성)
 */
export function applyCspFlowBasedAbstractionFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
	options: CspFlowBasedAbstractionOptions = {},
): Uint8ClampedArray {
	const gradations = Math.max(2, Math.min(32, Math.round(options.numberOfGradations ?? 6)));
	const lineOpacity = Math.max(0, Math.min(1, options.lineOpacity01 ?? 0.85));
	const dogThreshold = options.dogBinarizationThreshold ?? 0.06;

	const out = new Uint8ClampedArray(src.length);
	const getChannel = (x: number, y: number, ch: number): number => {
		const cx = Math.max(0, Math.min(width - 1, x));
		const cy = Math.max(0, Math.min(height - 1, y));
		return src[(cy * width + cx) * 4 + ch] ?? 0;
	};

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const dstIdx = (y * width + x) * 4;
			const centerR = getChannel(x, y, 0);
			const centerG = getChannel(x, y, 1);
			const centerB = getChannel(x, y, 2);

			// 3x3 에지 보존 Bilateral 평균 (ImageAbstractor) 및 중심-주변 DoG 차이 계산
			let sumR = 0;
			let sumG = 0;
			let sumB = 0;
			let sumW = 0;
			let surroundLum = 0;

			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const nr = getChannel(x + dx, y + dy, 0);
					const ng = getChannel(x + dx, y + dy, 1);
					const nb = getChannel(x + dx, y + dy, 2);
					const colorDiff =
						Math.abs(nr - centerR) +
						Math.abs(ng - centerG) +
						Math.abs(nb - centerB);
					const w = Math.exp(-colorDiff / 90);
					sumR += nr * w;
					sumG += ng * w;
					sumB += nb * w;
					sumW += w;
					surroundLum += (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;
				}
			}

			const meanLum = surroundLum / 9;
			const centerLum =
				(0.299 * centerR + 0.587 * centerG + 0.114 * centerB) / 255;
			const dogDiff = meanLum - centerLum;
			const lineMask = dogDiff > dogThreshold ? lineOpacity : 0;

			// Posterizer::Execute (계조 양자화)
			const quantize = (val255: number): number => {
				const step = 255 / (gradations - 1);
				return Math.round(Math.round(val255 / step) * step);
			};

			const postR = quantize(sumR / sumW);
			const postG = quantize(sumG / sumW);
			const postB = quantize(sumB / sumW);

			// LineCompounder::Execute
			out[dstIdx] = clampByte(postR * (1 - lineMask));
			out[dstIdx + 1] = clampByte(postG * (1 - lineMask));
			out[dstIdx + 2] = clampByte(postB * (1 - lineMask));
			out[dstIdx + 3] = src[dstIdx + 3] ?? 255;
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// 9. Smoothing.bundle (스무딩 안티에일리어싱 필터: ReadyLineData / SmoothingLineBlock)
// ---------------------------------------------------------------------------

/**
 * `Smoothing.bundle` (`ReadyLineData`, `SmoothingLineBlock`):
 * 앨리어싱 계단 현상이 있는 경계 픽셀(L-코너 계단)을 검출하여 인접 픽셀과 서브픽셀 보간 스무딩을 수행한다.
 */
export function applyCspSmoothingFilter(
	src: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8ClampedArray {
	const out = new Uint8ClampedArray(src);
	if (width < 3 || height < 3) return out;

	const idxOf = (x: number, y: number): number =>
		(Math.max(0, Math.min(height - 1, y)) * width +
			Math.max(0, Math.min(width - 1, x))) *
		4;

	const colorDist = (i1: number, i2: number): number =>
		Math.abs((src[i1] ?? 0) - (src[i2] ?? 0)) +
		Math.abs((src[i1 + 1] ?? 0) - (src[i2 + 1] ?? 0)) +
		Math.abs((src[i1 + 2] ?? 0) - (src[i2 + 2] ?? 0)) +
		Math.abs((src[i1 + 3] ?? 0) - (src[i2 + 3] ?? 0));

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const c = idxOf(x, y);
			const n = idxOf(x, y - 1);
			const s = idxOf(x, y + 1);
			const w = idxOf(x - 1, y);
			const e = idxOf(x + 1, y);

			// 수직-수평 L-코너 계단 감지 (SmoothingLineBlock)
			const cornerNW = colorDist(n, w) < 24 && colorDist(c, n) > 32;
			const cornerNE = colorDist(n, e) < 24 && colorDist(c, n) > 32;
			const cornerSW = colorDist(s, w) < 24 && colorDist(c, s) > 32;
			const cornerSE = colorDist(s, e) < 24 && colorDist(c, s) > 32;

			if (cornerNW || cornerNE || cornerSW || cornerSE) {
				const refIdx = cornerNW || cornerNE ? n : s;
				for (let ch = 0; ch < 4; ch += 1) {
					out[c + ch] = clampByte(
						(src[c + ch] ?? 0) * 0.625 + (src[refIdx + ch] ?? 0) * 0.375,
					);
				}
			}
		}
	}

	return out;
}
