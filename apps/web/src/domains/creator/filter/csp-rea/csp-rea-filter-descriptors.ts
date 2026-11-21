/**
 * Clip Studio Paint 5.1.5 전수 필터·색조 보정·레이어 변환 46종 선언 디스크립터(엔진 비의존).
 */

export type CspReaFilterCategory =
  | "blur"
  | "distort"
  | "sharpen"
  | "effect"
  | "noise-render"
  | "tonal-correction"
  | "layer-convert";

export type CspReaFilterId =
  | "gauss-blur"
  | "motion-blur"
  | "radial-blur"
  | "rotation-blur"
  | "blur-soft"
  | "blur-more"
  | "smoothing"
  | "fisheye"
  | "panorama"
  | "lens-distortion"
  | "pinch"
  | "sphere"
  | "spiral"
  | "simple-wave"
  | "waveform"
  | "zigzag"
  | "polar-coordinates"
  | "sharp"
  | "sharp-strong"
  | "unsharp-mask"
  | "flow-based-abstraction"
  | "pencil-art"
  | "mosaic"
  | "film-camera-style"
  | "chromatic-aberration"
  | "normal-map"
  | "line-width"
  | "border-effect"
  | "perlin-noise"
  | "add-noise"
  | "reduce-noise"
  | "remove-dust"
  | "brightness-contrast"
  | "hsv-tonal"
  | "posterize"
  | "reverse-gradient"
  | "level-correction"
  | "tone-curve"
  | "color-balance"
  | "binarization"
  | "gradient-map"
  | "color-transfer"
  | "brightness-to-opacity"
  | "change-line-color"
  | "lt-line-extract"
  | "raster-to-vector";

export interface CspReaFilterParameterSpec {
  readonly key: string;
  readonly labelKo: string;
  readonly kind: "number" | "boolean" | "enum";
  readonly defaultValue: number | boolean | string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
}

export interface CspReaFilterDescriptor {
  readonly id: CspReaFilterId;
  readonly category: CspReaFilterCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly sourceArtifact: string;
  readonly parameters: readonly CspReaFilterParameterSpec[];
}

export type CspReaFilterParamMap = Readonly<Record<string, unknown>>;

export interface CspReaImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export const CSP_REA_ALL_FILTER_SPECS: readonly CspReaFilterDescriptor[] = Object.freeze([
  // Blur (7)
  { id: "gauss-blur", category: "blur", labelKo: "가우시안 흐리기", labelEn: "Gaussian Blur", sourceArtifact: "GaussBlur.bundle", parameters: [{ key: "radiusPx", labelKo: "범위(px)", kind: "number", defaultValue: 3, min: 0, max: 64, step: 0.5 }] },
  { id: "motion-blur", category: "blur", labelKo: "이동 흐리기", labelEn: "Motion Blur", sourceArtifact: "MotionBlur.bundle", parameters: [{ key: "distancePx", labelKo: "강도(px)", kind: "number", defaultValue: 8, min: 1, max: 120, step: 1 }, { key: "angleDeg", labelKo: "각도(°)", kind: "number", defaultValue: 0, min: -180, max: 180, step: 1 }, { key: "direction", labelKo: "방향", kind: "enum", defaultValue: "both", options: ["both", "forward", "backward"] }] },
  { id: "radial-blur", category: "blur", labelKo: "방사형 흐리기", labelEn: "Radial Blur", sourceArtifact: "RadialBlur.bundle", parameters: [{ key: "strengthPx", labelKo: "거리(px)", kind: "number", defaultValue: 10, min: 1, max: 100, step: 1 }, { key: "direction", labelKo: "방향", kind: "enum", defaultValue: "outward", options: ["both", "outward", "inward"] }] },
  { id: "rotation-blur", category: "blur", labelKo: "회전 흐리기", labelEn: "Spin Blur", sourceArtifact: "TPPRotationBlur.bundle", parameters: [{ key: "amountDeg", labelKo: "회전량(°)", kind: "number", defaultValue: 12, min: 0, max: 180, step: 1 }, { key: "aspect", labelKo: "타원 비율", kind: "number", defaultValue: 1, min: 0.1, max: 1, step: 0.05 }, { key: "tiltDeg", labelKo: "기울기(°)", kind: "number", defaultValue: 0, min: -90, max: 90, step: 1 }] },
  { id: "blur-soft", category: "blur", labelKo: "흐리기", labelEn: "Blur", sourceArtifact: "SharpOff.bundle", parameters: [] },
  { id: "blur-more", category: "blur", labelKo: "강하게 흐리기", labelEn: "Blur (Strong)", sourceArtifact: "SharpOffStrong.bundle", parameters: [] },
  { id: "smoothing", category: "blur", labelKo: "스무딩 (계단 완만화)", labelEn: "Smoothing", sourceArtifact: "Smoothing.bundle", parameters: [] },
  // Distort (10)
  { id: "fisheye", category: "distort", labelKo: "어안 렌즈", labelEn: "Fisheye Lens", sourceArtifact: "GeometricDistortionFishEye.bundle", parameters: [{ key: "distortion", labelKo: "왜곡", kind: "number", defaultValue: 50, min: -100, max: 100, step: 1 }, { key: "radiusScale", labelKo: "반경 배율", kind: "number", defaultValue: 1, min: 0.1, max: 2, step: 0.05 }] },
  { id: "panorama", category: "distort", labelKo: "파노라마 변환", labelEn: "Curved Surface / Panorama", sourceArtifact: "GeometricDistortionPanorama.bundle", parameters: [{ key: "mode", labelKo: "투영 모드", kind: "enum", defaultValue: "equirectangular-to-perspective", options: ["equirectangular-to-perspective", "perspective-to-equirectangular"] }, { key: "fovScale", labelKo: "시야각 배율", kind: "number", defaultValue: 1, min: 0.3, max: 2.5, step: 0.05 }] },
  { id: "lens-distortion", category: "distort", labelKo: "렌즈 왜곡", labelEn: "Lens Distortion", sourceArtifact: "LensDistortion.bundle", parameters: [{ key: "distortion", labelKo: "왜곡도", kind: "number", defaultValue: -35, min: -100, max: 100, step: 1 }, { key: "oblateness", labelKo: "편평도", kind: "number", defaultValue: 0, min: -0.9, max: 0.9, step: 0.05 }] },
  { id: "pinch", category: "distort", labelKo: "핀치 (오므리기/부풀리기)", labelEn: "Pinch", sourceArtifact: "Pinch.bundle", parameters: [{ key: "strength", labelKo: "강도", kind: "number", defaultValue: 45, min: -100, max: 100, step: 1 }, { key: "radiusScale", labelKo: "반경 배율", kind: "number", defaultValue: 1, min: 0.1, max: 2, step: 0.05 }] },
  { id: "sphere", category: "distort", labelKo: "구면화", labelEn: "Spherize", sourceArtifact: "Sphere.bundle", parameters: [{ key: "strength", labelKo: "강도", kind: "number", defaultValue: 60, min: -100, max: 100, step: 1 }, { key: "cylindricalMode", labelKo: "원통 모드", kind: "boolean", defaultValue: false }] },
  { id: "spiral", category: "distort", labelKo: "소용돌이", labelEn: "Twirl / Spiral", sourceArtifact: "Spiral.bundle", parameters: [{ key: "twirlTurns", labelKo: "회전 수", kind: "number", defaultValue: 0.5, min: -4, max: 4, step: 0.1 }] },
  { id: "simple-wave", category: "distort", labelKo: "단순 파동", labelEn: "Simple Wave", sourceArtifact: "SimpleWave.bundle", parameters: [{ key: "amplitudeX", labelKo: "수평 진폭(px)", kind: "number", defaultValue: 4, min: 0, max: 40, step: 0.5 }, { key: "wavelengthX", labelKo: "수평 파장(px)", kind: "number", defaultValue: 16, min: 2, max: 120, step: 1 }] },
  { id: "waveform", category: "distort", labelKo: "파형 왜곡", labelEn: "Wave", sourceArtifact: "Waveform.bundle", parameters: [{ key: "shape", labelKo: "파형 종류", kind: "enum", defaultValue: "triangle", options: ["circle", "triangle", "square"] }, { key: "wavelengthPx", labelKo: "파장(px)", kind: "number", defaultValue: 12, min: 2, max: 120, step: 1 }, { key: "amplitudeX", labelKo: "진폭(px)", kind: "number", defaultValue: 4, min: 0, max: 40, step: 0.5 }] },
  { id: "zigzag", category: "distort", labelKo: "지그재그", labelEn: "ZigZag", sourceArtifact: "Zigzag.bundle", parameters: [{ key: "angleDeg", labelKo: "각도(°)", kind: "number", defaultValue: 45, min: -180, max: 180, step: 1 }, { key: "ridges", labelKo: "파문 횟수", kind: "number", defaultValue: 4, min: 1, max: 20, step: 1 }] },
  { id: "polar-coordinates", category: "distort", labelKo: "극좌표 변환", labelEn: "Polar Coordinates", sourceArtifact: "PolarCd.bundle", parameters: [{ key: "mode", labelKo: "변환 방향", kind: "enum", defaultValue: "rect-to-polar", options: ["rect-to-polar", "polar-to-rect"] }] },
  // Sharpen (3)
  { id: "sharp", category: "sharpen", labelKo: "선명하게", labelEn: "Sharpen", sourceArtifact: "Sharp.bundle", parameters: [] },
  { id: "sharp-strong", category: "sharpen", labelKo: "더욱 선명하게", labelEn: "Sharpen More", sourceArtifact: "SharpStrong.bundle", parameters: [] },
  { id: "unsharp-mask", category: "sharpen", labelKo: "언샵 마스크", labelEn: "Unsharp Mask", sourceArtifact: "UnSharpMask.bundle", parameters: [{ key: "radiusPx", labelKo: "반경(px)", kind: "number", defaultValue: 2, min: 0.2, max: 32, step: 0.2 }, { key: "amountPercent", labelKo: "강도(%)", kind: "number", defaultValue: 120, min: 0, max: 500, step: 5 }, { key: "threshold", labelKo: "임계값", kind: "number", defaultValue: 2, min: 0, max: 255, step: 1 }] },
  // Effect (8)
  { id: "flow-based-abstraction", category: "effect", labelKo: "일러스트풍 (ETF 추상화)", labelEn: "Artistic (Flow-Based Abstraction)", sourceArtifact: "FlowBasedAbstraction.bundle", parameters: [{ key: "numberOfGradations", labelKo: "색 계조 수", kind: "number", defaultValue: 6, min: 2, max: 24, step: 1 }, { key: "lineOpacity01", labelKo: "선 불투명도", kind: "number", defaultValue: 0.85, min: 0, max: 1, step: 0.05 }] },
  { id: "pencil-art", category: "effect", labelKo: "연필화", labelEn: "Pencil Drawing", sourceArtifact: "PencilArtFilter.bundle", parameters: [{ key: "showOutline", labelKo: "윤곽선 표시", kind: "boolean", defaultValue: true }, { key: "showHatchingBackground", labelKo: "빗금 해칭", kind: "boolean", defaultValue: true }, { key: "grayscaleOutput", labelKo: "흑백 출력", kind: "boolean", defaultValue: true }] },
  { id: "mosaic", category: "effect", labelKo: "모자이크", labelEn: "Mosaic", sourceArtifact: "Mosaic.bundle", parameters: [{ key: "tileSizePx", labelKo: "타일 크기(px)", kind: "number", defaultValue: 6, min: 2, max: 128, step: 1 }] },
  { id: "film-camera-style", category: "effect", labelKo: "레트로 필름 카메라", labelEn: "Retro Film", sourceArtifact: "TPPFilmCameraStyle.bundle", parameters: [{ key: "chromaticAberrationPx", labelKo: "색수차(px)", kind: "number", defaultValue: 1.5, min: 0, max: 12, step: 0.5 }, { key: "vintageSepiaEnabled", labelKo: "세피아 톤", kind: "boolean", defaultValue: true }, { key: "lightLeakMode", labelKo: "빛샘 방향", kind: "enum", defaultValue: "corner", options: ["none", "left", "right", "corner"] }] },
  { id: "chromatic-aberration", category: "effect", labelKo: "색수차 (RGB 어긋남)", labelEn: "Chromatic Aberration", sourceArtifact: "TPPChromaticAberration.bundle", parameters: [{ key: "mode", labelKo: "모드", kind: "enum", defaultValue: "radial", options: ["radial", "lateral"] }, { key: "intensity", labelKo: "강도", kind: "number", defaultValue: 35, min: -100, max: 100, step: 1 }, { key: "angleDeg", labelKo: "각도(°)", kind: "number", defaultValue: 0, min: -180, max: 180, step: 1 }] },
  { id: "normal-map", category: "effect", labelKo: "노멀 맵 생성", labelEn: "Normal Map", sourceArtifact: "TPPNormalMap.bundle", parameters: [{ key: "strength", labelKo: "기복 강도", kind: "number", defaultValue: 2.5, min: 0.1, max: 20, step: 0.1 }, { key: "yDirectionType", labelKo: "Y축 기준", kind: "enum", defaultValue: "opengl-y-plus", options: ["opengl-y-plus", "directx-y-minus"] }] },
  { id: "line-width", category: "effect", labelKo: "선폭 수정 (가늘게/굵게)", labelEn: "Adjust Line Width", sourceArtifact: "LineWidth.bundle", parameters: [{ key: "mode", labelKo: "동작", kind: "enum", defaultValue: "thicken", options: ["thicken", "thin"] }, { key: "radiusPx", labelKo: "반경(px)", kind: "number", defaultValue: 1, min: 1, max: 12, step: 1 }, { key: "remainOnePixelCore", labelKo: "1px 중심선 보존", kind: "boolean", defaultValue: true }] },
  { id: "border-effect", category: "effect", labelKo: "경계 효과 (테두리/수채 경계)", labelEn: "Border Effect", sourceArtifact: "CLIP STUDIO PAINT (Layer Property)", parameters: [{ key: "mode", labelKo: "경계 종류", kind: "enum", defaultValue: "edge", options: ["edge", "watercolor-edge"] }, { key: "thicknessPx", labelKo: "테두리 두께(px)", kind: "number", defaultValue: 2, min: 1, max: 20, step: 1 }, { key: "opacity01", labelKo: "불투명도", kind: "number", defaultValue: 1, min: 0, max: 1, step: 0.05 }] },
  // Noise & Render (4)
  { id: "perlin-noise", category: "noise-render", labelKo: "퍼린 노이즈", labelEn: "Perlin Noise", sourceArtifact: "PerlinNoise.bundle", parameters: [{ key: "scalePx", labelKo: "스케일(px)", kind: "number", defaultValue: 24, min: 2, max: 256, step: 1 }, { key: "octaves", labelKo: "옥타브", kind: "number", defaultValue: 4, min: 1, max: 8, step: 1 }, { key: "blendOpacity01", labelKo: "합성 불투명도", kind: "number", defaultValue: 0.85, min: 0, max: 1, step: 0.05 }] },
  { id: "add-noise", category: "noise-render", labelKo: "노이즈 추가", labelEn: "Noise", sourceArtifact: "TPPAddNoise.bundle", parameters: [{ key: "amount01", labelKo: "노이즈 강도", kind: "number", defaultValue: 0.18, min: 0, max: 1, step: 0.02 }, { key: "colorMode", labelKo: "색상 모드", kind: "enum", defaultValue: "monochrome", options: ["monochrome", "color"] }] },
  { id: "reduce-noise", category: "noise-render", labelKo: "노이즈 제거 (스마트 스무딩)", labelEn: "Remove Noise", sourceArtifact: "TPReduceNoiseFilter.bundle", parameters: [{ key: "strength01", labelKo: "강도", kind: "number", defaultValue: 0.6, min: 0, max: 1, step: 0.05 }, { key: "preserveDetail01", labelKo: "윤곽 보존", kind: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 }] },
  { id: "remove-dust", category: "noise-render", labelKo: "잡티 제거", labelEn: "Remove Dust", sourceArtifact: "Dust.bundle", parameters: [{ key: "radiusPx", labelKo: "잡티 크기(px)", kind: "number", defaultValue: 1, min: 1, max: 4, step: 1 }, { key: "mode", labelKo: "제거 모드", kind: "enum", defaultValue: "median", options: ["median", "remove-dark-dust", "remove-bright-scratches"] }] },
  // Tonal Correction (10)
  { id: "brightness-contrast", category: "tonal-correction", labelKo: "밝기 · 대비", labelEn: "Brightness / Contrast", sourceArtifact: "filterbrightnessandcontrast", parameters: [{ key: "brightness", labelKo: "밝기", kind: "number", defaultValue: 10, min: -100, max: 100, step: 1 }, { key: "contrast", labelKo: "대비", kind: "number", defaultValue: 15, min: -100, max: 100, step: 1 }, { key: "legacyMode", labelKo: "기존 방식", kind: "boolean", defaultValue: false }] },
  { id: "hsv-tonal", category: "tonal-correction", labelKo: "색조 · 채도 · 명도", labelEn: "Hue / Saturation / Luminosity", sourceArtifact: "filterhsv", parameters: [{ key: "hueDeg", labelKo: "색조(°)", kind: "number", defaultValue: 0, min: -180, max: 180, step: 1 }, { key: "saturation", labelKo: "채도", kind: "number", defaultValue: 15, min: -100, max: 100, step: 1 }, { key: "luminosity", labelKo: "명도", kind: "number", defaultValue: 0, min: -100, max: 100, step: 1 }] },
  { id: "posterize", category: "tonal-correction", labelKo: "계조화 (포스터화)", labelEn: "Posterization", sourceArtifact: "filterposterize", parameters: [{ key: "levels", labelKo: "계조 수", kind: "number", defaultValue: 6, min: 2, max: 20, step: 1 }] },
  { id: "reverse-gradient", category: "tonal-correction", labelKo: "역그라데이션 (색 반전)", labelEn: "Reverse Gradient", sourceArtifact: "filterinvert", parameters: [] },
  { id: "level-correction", category: "tonal-correction", labelKo: "레벨 보정", labelEn: "Level Correction", sourceArtifact: "filterlevel", parameters: [{ key: "inputBlack", labelKo: "입력 암부", kind: "number", defaultValue: 10, min: 0, max: 240, step: 1 }, { key: "gamma", labelKo: "감마", kind: "number", defaultValue: 1.0, min: 0.1, max: 5, step: 0.05 }, { key: "inputWhite", labelKo: "입력 명부", kind: "number", defaultValue: 245, min: 15, max: 255, step: 1 }] },
  { id: "tone-curve", category: "tonal-correction", labelKo: "톤 커브", labelEn: "Tone Curve", sourceArtifact: "filtertonecurve", parameters: [{ key: "midtoneLift", labelKo: "중간톤 보정", kind: "number", defaultValue: 18, min: -96, max: 96, step: 1 }, { key: "shadowLift", labelKo: "암부 보정", kind: "number", defaultValue: -8, min: -64, max: 64, step: 1 }] },
  { id: "color-balance", category: "tonal-correction", labelKo: "컬러 밸런스", labelEn: "Color Balance", sourceArtifact: "filtercolorbalance", parameters: [{ key: "cyanRed", labelKo: "시안-레드", kind: "number", defaultValue: 15, min: -100, max: 100, step: 1 }, { key: "magentaGreen", labelKo: "마젠타-그린", kind: "number", defaultValue: 0, min: -100, max: 100, step: 1 }, { key: "yellowBlue", labelKo: "옐로우-블루", kind: "number", defaultValue: -12, min: -100, max: 100, step: 1 }] },
  { id: "binarization", category: "tonal-correction", labelKo: "이진화", labelEn: "Binarization", sourceArtifact: "filterbinarization", parameters: [{ key: "threshold", labelKo: "임계값", kind: "number", defaultValue: 128, min: 0, max: 255, step: 1 }, { key: "preserveAlpha", labelKo: "투명 부분 유지", kind: "boolean", defaultValue: true }] },
  { id: "gradient-map", category: "tonal-correction", labelKo: "그라데이션 맵", labelEn: "Gradient Map", sourceArtifact: "filtergradientmap", parameters: [{ key: "mixRate01", labelKo: "혼합률", kind: "number", defaultValue: 1, min: 0, max: 1, step: 0.05 }, { key: "reverse", labelKo: "반전", kind: "boolean", defaultValue: false }] },
  { id: "color-transfer", category: "tonal-correction", labelKo: "색감 변환 (컬러 매치)", labelEn: "Color Match", sourceArtifact: "filtercolortransfer", parameters: [{ key: "presetId", labelKo: "참조 프리셋", kind: "enum", defaultValue: "01_sunrise", options: ["01_sunrise", "02_sepia", "03_oldpaper", "04_night", "05_cafe", "06_monochrome", "07_kawaii", "08_bingata"] }, { key: "strength", labelKo: "강도", kind: "number", defaultValue: 0.85, min: 0, max: 1, step: 0.05 }] },
  // Layer Convert & Extract (4)
  { id: "brightness-to-opacity", category: "layer-convert", labelKo: "휘도를 투명도로 변환", labelEn: "Convert Brightness to Opacity", sourceArtifact: "editbrightnesstoalpha", parameters: [] },
  { id: "change-line-color", category: "layer-convert", labelKo: "선 색을 그리기 색으로 변경", labelEn: "Change Color of Line to Drawing", sourceArtifact: "editchangelinecolor", parameters: [{ key: "r", labelKo: "R", kind: "number", defaultValue: 44, min: 0, max: 255, step: 1 }, { key: "g", labelKo: "G", kind: "number", defaultValue: 76, min: 0, max: 255, step: 1 }, { key: "b", labelKo: "B", kind: "number", defaultValue: 168, min: 0, max: 255, step: 1 }] },
  { id: "lt-line-extract", category: "layer-convert", labelKo: "레이어 LT 선 추출 · 톤 분리", labelEn: "Convert to Lines and Tones (LT)", sourceArtifact: "layerltconvert", parameters: [{ key: "edgeSensitivity", labelKo: "선 검출 감도", kind: "number", defaultValue: 60, min: 1, max: 100, step: 1 }, { key: "lineWidthPx", labelKo: "선 두께(px)", kind: "number", defaultValue: 1, min: 1, max: 4, step: 1 }, { key: "toneLevels", labelKo: "톤 계조 수", kind: "number", defaultValue: 4, min: 2, max: 8, step: 1 }] },
  { id: "raster-to-vector", category: "layer-convert", labelKo: "래스터 → 벡터 중심선 변환", labelEn: "Convert Raster to Vector", sourceArtifact: "CSVectorizeV4 / layerconvert", parameters: [{ key: "inkLuminanceThreshold", labelKo: "선화 명도 임계", kind: "number", defaultValue: 160, min: 1, max: 254, step: 1 }, { key: "simplifyTolerancePx", labelKo: "단순화 허용(px)", kind: "number", defaultValue: 1, min: 0.1, max: 10, step: 0.1 }] },
]);
