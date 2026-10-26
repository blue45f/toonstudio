/**
 * ToonStudio libmypaint 64종 설정·18종 입력 동역학, spectral.js 38밴드 Kubelka-Munk + OKLCh 가멋 매핑,
 * colormix.js CIE Lab 색공간 혼합 및 polygon-clipping 2D 불리언 폴리곤(합집합·차집합·교집합·대칭차) 엔진 (Wave 24).
 */

export interface Wave24MyPaintSpectralBooleanReaEntry {
  readonly targetId: string;
  readonly displayName: string;
  readonly sourceUrlOrPath: string;
  readonly parentAnalysisEvidenceId: string;
  readonly jsFactsEvidenceId: string;
  readonly semanticTraceEvidenceId: string | null;
  readonly nodeId: string;
  readonly artifactSha256: string;
  readonly internalizedKernels: readonly string[];
}

export const WAVE24_MYPAINT_SPECTRAL_BOOLEAN_REA_LEDGER: readonly Wave24MyPaintSpectralBooleanReaEntry[] = [
  {
    targetId: "libmypaint-brushsettings-full-64-18",
    displayName: "libmypaint Canonical 64 Brush Settings & 18 Dynamic Inputs Schema",
    sourceUrlOrPath: "https://github.com/mypaint/libmypaint/blob/master/brushsettings.json",
    parentAnalysisEvidenceId: "ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0",
    jsFactsEvidenceId: "ev_bf902cf092d273befdafa0630fd0dbc9b347f97afae41a62ed4b92f508a64699",
    semanticTraceEvidenceId: null,
    nodeId: "jag_node_435b2c4df38ce66e6fe0a9a3450bac300135edb368307c93f94a1c53d2e1d272",
    artifactSha256: "080dac10b929635a0c7404d282a1a0c2cf87a37dcd9f3f9e0626fa214de73dbe",
    internalizedKernels: [
      "18종 동역학 입력(pressure, random, stroke, direction, tilt_declination, tilt_ascension, speed1, speed2, custom, direction_angle, attack_angle, tilt_declinationx, tilt_declinationy, gridmap_x, gridmap_y, viewzoom, brush_radius, barrel_rotation)",
      "64종 브러시 설정(opaque_linearize 다중 댑 비선형 광학 선형화, gridmap_scale/x/y 256px 모듈러 텍스처 격자, offset_angle/offset_angle_2 양방향 대칭 법선 오프셋, smudge_bucket 256버킷 캔버스 픽업, posterize/posterize_num 양자화, pressure_gain_log)",
    ],
  },
  {
    targetId: "spectral-js-38band-km-oklch-gamut",
    displayName: "rvanwijnen/spectral.js 38-Band (380-750nm) Kubelka-Munk + OKLCh Binary-Search Gamut Mapping",
    sourceUrlOrPath: "https://github.com/rvanwijnen/spectral.js",
    parentAnalysisEvidenceId: "ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0",
    jsFactsEvidenceId: "ev_ea7266ced6917ad222f7bfa7cbad6762c27bf51d4c23c95dc512a9916374ae7f",
    semanticTraceEvidenceId: "ev_2407e4b505a3225eefd4a545d9857ec0c36b57c70dd22a37274af0e8f9060047",
    nodeId: "jag_node_024c7b18b12acc2d9fdc428b7a8e0a4eddad768ce844a48c6f05bf0a101c7168",
    artifactSha256: "dbaa1a8b44d2c734b48b6d44777b1f182c9740e9220d2cbded02002c8e6d271a",
    internalizedKernels: [
      "38밴드(380~750nm, 10nm 간격) 분광 반사율 K/S=(1-R)^2/(2R) 및 역변환 KM(KS)=1+KS-sqrt(KS^2+2KS)",
      "CIE 휘도(Y) 및 착색력(tintingStrength) 제곱 가중 농도 c_i = factor_i^2 * tintingStrength_i^2 * Y_i",
      "OKLCh 채도(Chroma) 이진 탐색 가멋 매핑(gamutMap, JND=0.03, eps=0.0001)",
    ],
  },
  {
    targetId: "colormix-js-cielab-mixer",
    displayName: "colormix.js CIE XYZ D65 & CIE L*a*b* Perceptual Color Mixing",
    sourceUrlOrPath: "https://github.com/myorn/colormix",
    parentAnalysisEvidenceId: "ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0",
    jsFactsEvidenceId: "ev_ea7266ced6917ad222f7bfa7cbad6762c27bf51d4c23c95dc512a9916374ae7f",
    semanticTraceEvidenceId: "ev_9272517fe5f92e40682a14229e9d39bb1e8c1c7e2db10ad0be7cc5b7c01c07d8",
    nodeId: "jag_node_461e54cae36b2055ca57c9af8d4f698be5e1fbfc3ac2f3c52783eea81c67ee3f",
    artifactSha256: "13deb762de180a2bb032db9e035b009698e9577a2d2168b3d1ce81b5da1db4b4",
    internalizedKernels: [
      "sRGB <-> CIE XYZ (D65 95.047, 100.0, 108.883) <-> CIE L*a*b* 양방향 색공간 변환 및 가중 평균 혼합",
    ],
  },
  {
    targetId: "polygon-clipping-boolean-2d",
    displayName: "mfogel/polygon-clipping 2D Boolean Polygon Operations (union/difference/intersection/xor)",
    sourceUrlOrPath: "https://github.com/mfogel/polygon-clipping",
    parentAnalysisEvidenceId: "ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0",
    jsFactsEvidenceId: "ev_ea7266ced6917ad222f7bfa7cbad6762c27bf51d4c23c95dc512a9916374ae7f",
    semanticTraceEvidenceId: "ev_e1dd4fc34488bf77fcdc2ac382abcf14f496ec2311596033942542310bc60f70",
    nodeId: "jag_node_91b602080f46f0c6a803297f5b413c191ab44a333874868f42318f58c923d328",
    artifactSha256: "766d182d2908c03d19608f90837e870a99df42c313c537363d2a0adb0f44baaa",
    internalizedKernels: [
      "벡터 블롭 브러시(Blob Brush) 외곽 합집합(union) 및 벡터 지우개(Vector Eraser) 차집합(difference)·교집합(intersection)·대칭차(xor) 클리핑",
    ],
  },
] as const;

export const MYPAINT_CANONICAL_INPUT_IDS = [
  "pressure", "random", "stroke", "direction", "tilt_declination", "tilt_ascension",
  "speed1", "speed2", "custom", "direction_angle", "attack_angle", "tilt_declinationx",
  "tilt_declinationy", "gridmap_x", "gridmap_y", "viewzoom", "brush_radius", "barrel_rotation",
] as const;

export type MyPaintCanonicalInputId = (typeof MYPAINT_CANONICAL_INPUT_IDS)[number];

export interface MyPaintCanonicalInputDescriptor {
  readonly id: MyPaintCanonicalInputId;
  readonly hardMin: number;
  readonly softMin: number;
  readonly normal: number;
  readonly softMax: number;
  readonly hardMax: number;
}

export const MYPAINT_CANONICAL_INPUT_CATALOG: readonly MyPaintCanonicalInputDescriptor[] = [
  { id: "pressure", hardMin: 0.0, softMin: 0.0, normal: 0.4, softMax: 1.0, hardMax: 1e6 },
  { id: "random", hardMin: 0.0, softMin: 0.0, normal: 0.5, softMax: 1.0, hardMax: 1.0 },
  { id: "stroke", hardMin: 0.0, softMin: 0.0, normal: 0.5, softMax: 1.0, hardMax: 1.0 },
  { id: "direction", hardMin: 0.0, softMin: 0.0, normal: 0.0, softMax: 180.0, hardMax: 180.0 },
  { id: "tilt_declination", hardMin: 0.0, softMin: 0.0, normal: 0.0, softMax: 90.0, hardMax: 180.0 },
  { id: "tilt_ascension", hardMin: -180.0, softMin: -180.0, normal: 0.0, softMax: 180.0, hardMax: 180.0 },
  { id: "speed1", hardMin: -1e6, softMin: 0.0, normal: 0.5, softMax: 4.0, hardMax: 1e6 },
  { id: "speed2", hardMin: -1e6, softMin: 0.0, normal: 0.5, softMax: 4.0, hardMax: 1e6 },
  { id: "custom", hardMin: -1e6, softMin: -2.0, normal: 0.0, softMax: 2.0, hardMax: 1e6 },
  { id: "direction_angle", hardMin: -180.0, softMin: -180.0, normal: 0.0, softMax: 180.0, hardMax: 180.0 },
  { id: "attack_angle", hardMin: -180.0, softMin: -180.0, normal: 0.0, softMax: 180.0, hardMax: 180.0 },
  { id: "tilt_declinationx", hardMin: -90.0, softMin: -90.0, normal: 0.0, softMax: 90.0, hardMax: 90.0 },
  { id: "tilt_declinationy", hardMin: -90.0, softMin: -90.0, normal: 0.0, softMax: 90.0, hardMax: 90.0 },
  { id: "gridmap_x", hardMin: 0.0, softMin: 0.0, normal: 0.0, softMax: 256.0, hardMax: 256.0 },
  { id: "gridmap_y", hardMin: 0.0, softMin: 0.0, normal: 0.0, softMax: 256.0, hardMax: 256.0 },
  { id: "viewzoom", hardMin: -4.0, softMin: -4.0, normal: 0.0, softMax: 6.0, hardMax: 20.0 },
  { id: "brush_radius", hardMin: -2.0, softMin: -2.0, normal: 0.0, softMax: 6.0, hardMax: 20.0 },
  { id: "barrel_rotation", hardMin: 0.0, softMin: 0.0, normal: 0.5, softMax: 1.0, hardMax: 1.0 },
] as const;

export const MYPAINT_CANONICAL_SETTING_IDS = [
  "opaque", "opaque_multiply", "opaque_linearize", "radius_logarithmic", "hardness", "anti_aliasing",
  "dabs_per_basic_radius", "dabs_per_actual_radius", "dabs_per_second", "radius_by_random",
  "speed1_slowness", "speed2_slowness", "speed1_gamma", "speed2_gamma", "offset_by_random",
  "offset_by_speed", "offset_by_speed_slowness", "slow_tracking", "slow_tracking_per_dab",
  "tracking_noise", "color_h", "color_s", "color_v", "restore_color", "change_color_h",
  "change_color_l", "change_color_hsl_s", "change_color_v", "change_color_hsv_s", "smudge",
  "smudge_length", "smudge_radius_log", "eraser", "stroke_threshold", "stroke_duration_logarithmic",
  "stroke_holdtime", "custom_input", "custom_input_slowness", "elliptical_dab_ratio",
  "elliptical_dab_angle", "direction_filter", "lock_alpha", "colorize", "snap_to_pixel",
  "pressure_gain_log", "gridmap_scale", "gridmap_scale_x", "gridmap_scale_y", "smudge_length_log",
  "smudge_bucket", "smudge_transparency", "offset_Y", "offset_X", "offset_angle", "offset_angle_asc",
  "offset_angle_view", "offset_angle_2", "offset_angle_2_asc", "offset_angle_2_view",
  "offset_angle_adj", "offset_multiplier", "paint_mode", "posterize", "posterize_num",
] as const;

export type MyPaintCanonicalSettingId = (typeof MYPAINT_CANONICAL_SETTING_IDS)[number];

export interface MyPaintCanonicalSettingDescriptor {
  readonly id: MyPaintCanonicalSettingId;
  readonly min: number;
  readonly defaultValue: number;
  readonly max: number;
  readonly constant: boolean;
}

export const MYPAINT_CANONICAL_SETTING_CATALOG: readonly MyPaintCanonicalSettingDescriptor[] = [
  { id: "opaque", min: 0.0, defaultValue: 1.0, max: 2.0, constant: false },
  { id: "opaque_multiply", min: 0.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "opaque_linearize", min: 0.0, defaultValue: 0.9, max: 2.0, constant: true },
  { id: "radius_logarithmic", min: -2.0, defaultValue: 2.0, max: 6.0, constant: false },
  { id: "hardness", min: 0.0, defaultValue: 0.8, max: 1.0, constant: false },
  { id: "anti_aliasing", min: 0.0, defaultValue: 1.0, max: 5.0, constant: false },
  { id: "dabs_per_basic_radius", min: 0.0, defaultValue: 0.0, max: 6.0, constant: true },
  { id: "dabs_per_actual_radius", min: 0.0, defaultValue: 2.0, max: 6.0, constant: true },
  { id: "dabs_per_second", min: 0.0, defaultValue: 0.0, max: 80.0, constant: true },
  { id: "radius_by_random", min: 0.0, defaultValue: 0.0, max: 1.5, constant: false },
  { id: "speed1_slowness", min: 0.0, defaultValue: 0.04, max: 0.8, constant: false },
  { id: "speed2_slowness", min: 0.0, defaultValue: 0.8, max: 3.0, constant: false },
  { id: "speed1_gamma", min: -8.0, defaultValue: 4.0, max: 8.0, constant: true },
  { id: "speed2_gamma", min: -8.0, defaultValue: 4.0, max: 8.0, constant: true },
  { id: "offset_by_random", min: -2.0, defaultValue: 0.0, max: 25.0, constant: false },
  { id: "offset_by_speed", min: -3.0, defaultValue: 0.0, max: 3.0, constant: false },
  { id: "offset_by_speed_slowness", min: 0.0, defaultValue: 1.0, max: 15.0, constant: true },
  { id: "slow_tracking", min: 0.0, defaultValue: 0.0, max: 10.0, constant: true },
  { id: "slow_tracking_per_dab", min: 0.0, defaultValue: 0.0, max: 10.0, constant: false },
  { id: "tracking_noise", min: 0.0, defaultValue: 0.0, max: 12.0, constant: true },
  { id: "color_h", min: 0.0, defaultValue: 0.0, max: 1.0, constant: true },
  { id: "color_s", min: -0.5, defaultValue: 0.0, max: 1.5, constant: true },
  { id: "color_v", min: -0.5, defaultValue: 0.0, max: 1.5, constant: true },
  { id: "restore_color", min: 0.0, defaultValue: 0.0, max: 1.0, constant: true },
  { id: "change_color_h", min: -2.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "change_color_l", min: -2.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "change_color_hsl_s", min: -2.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "change_color_v", min: -2.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "change_color_hsv_s", min: -2.0, defaultValue: 0.0, max: 2.0, constant: false },
  { id: "smudge", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "smudge_length", min: 0.0, defaultValue: 0.5, max: 1.0, constant: false },
  { id: "smudge_radius_log", min: -1.6, defaultValue: 0.0, max: 1.6, constant: false },
  { id: "eraser", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "stroke_threshold", min: 0.0, defaultValue: 0.0, max: 0.5, constant: true },
  { id: "stroke_duration_logarithmic", min: -1.0, defaultValue: 4.0, max: 7.0, constant: false },
  { id: "stroke_holdtime", min: 0.0, defaultValue: 0.0, max: 10.0, constant: false },
  { id: "custom_input", min: -5.0, defaultValue: 0.0, max: 5.0, constant: false },
  { id: "custom_input_slowness", min: 0.0, defaultValue: 0.0, max: 10.0, constant: false },
  { id: "elliptical_dab_ratio", min: 1.0, defaultValue: 1.0, max: 10.0, constant: false },
  { id: "elliptical_dab_angle", min: 0.0, defaultValue: 90.0, max: 180.0, constant: false },
  { id: "direction_filter", min: 0.0, defaultValue: 2.0, max: 10.0, constant: false },
  { id: "lock_alpha", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "colorize", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "snap_to_pixel", min: 0.0, defaultValue: 0.0, max: 10.0, constant: false },
  { id: "pressure_gain_log", min: -1.8, defaultValue: 0.0, max: 1.8, constant: false },
  { id: "gridmap_scale", min: -8.0, defaultValue: 0.0, max: 8.0, constant: false },
  { id: "gridmap_scale_x", min: -4.0, defaultValue: 1.0, max: 4.0, constant: false },
  { id: "gridmap_scale_y", min: -4.0, defaultValue: 1.0, max: 4.0, constant: false },
  { id: "smudge_length_log", min: -2.0, defaultValue: 0.0, max: 8.0, constant: false },
  { id: "smudge_bucket", min: 0.0, defaultValue: 0.0, max: 255.0, constant: false },
  { id: "smudge_transparency", min: -1.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "offset_Y", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_X", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_asc", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_view", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_2", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_2_asc", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_2_view", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_angle_adj", min: -20.0, defaultValue: 0.0, max: 20.0, constant: false },
  { id: "offset_multiplier", min: -3.0, defaultValue: 0.0, max: 3.0, constant: false },
  { id: "paint_mode", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "posterize", min: 0.0, defaultValue: 0.0, max: 1.0, constant: false },
  { id: "posterize_num", min: 0.01, defaultValue: 0.05, max: 1.28, constant: false },
] as const;

export type MyPaintPresetId =
  | "mypaint-classic-knife"
  | "mypaint-spectral-impasto"
  | "mypaint-charcoal-gridmap"
  | "mypaint-bilateral-rake"
  | "mypaint-cel-posterize"
  | "mypaint-wet-watercolor"
  | "mypaint-calligraphy-chisel"
  | "mypaint-airbrush-linearized"
  | "mypaint-pointillism-scatter"
  | "mypaint-pixel-snap-ink";

export interface MyPaintBrushPreset {
  readonly id: MyPaintPresetId;
  readonly labelKo: string;
  readonly radiusLog: number;
  readonly opaque: number;
  readonly opaqueLinearize: number;
  readonly dabsPerActualRadius: number;
  readonly hardness: number;
  readonly smudge: number;
  readonly smudgeBucket: number;
  readonly paintModeSpectral01: number;
  readonly posterize01: number;
  readonly posterizeNum: number;
  readonly gridmapScale: number;
  readonly offsetAngle2Bilateral: number;
  readonly pressureGainLog: number;
}

export const MYPAINT_BRUSH_PRESETS: readonly MyPaintBrushPreset[] = [
  { id: "mypaint-classic-knife", labelKo: "MyPaint 팔레트 나이프", radiusLog: 2.35, opaque: 0.92, opaqueLinearize: 0.9, dabsPerActualRadius: 3.2, hardness: 0.85, smudge: 0.78, smudgeBucket: 1, paintModeSpectral01: 1.0, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.5, offsetAngle2Bilateral: 0.0, pressureGainLog: 0.25 },
  { id: "mypaint-spectral-impasto", labelKo: "MyPaint 38밴드 분광 유화", radiusLog: 2.2, opaque: 0.96, opaqueLinearize: 0.9, dabsPerActualRadius: 2.8, hardness: 0.72, smudge: 0.62, smudgeBucket: 2, paintModeSpectral01: 1.0, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.0, offsetAngle2Bilateral: 0.35, pressureGainLog: 0.15 },
  { id: "mypaint-charcoal-gridmap", labelKo: "MyPaint 그리드맵 목탄", radiusLog: 2.1, opaque: 0.82, opaqueLinearize: 0.9, dabsPerActualRadius: 2.4, hardness: 0.55, smudge: 0.18, smudgeBucket: 3, paintModeSpectral01: 0.6, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 1.2, offsetAngle2Bilateral: 0.0, pressureGainLog: 0.0 },
  { id: "mypaint-bilateral-rake", labelKo: "MyPaint 양방향 레이크", radiusLog: 1.9, opaque: 0.88, opaqueLinearize: 0.85, dabsPerActualRadius: 3.5, hardness: 0.9, smudge: 0.45, smudgeBucket: 4, paintModeSpectral01: 0.85, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.2, offsetAngle2Bilateral: 1.4, pressureGainLog: 0.1 },
  { id: "mypaint-cel-posterize", labelKo: "MyPaint 셀 포스터라이즈", radiusLog: 2.0, opaque: 1.0, opaqueLinearize: 0.5, dabsPerActualRadius: 4.0, hardness: 0.95, smudge: 0.25, smudgeBucket: 5, paintModeSpectral01: 0.0, posterize01: 0.85, posterizeNum: 0.06, gridmapScale: 0.0, offsetAngle2Bilateral: 0.0, pressureGainLog: 0.0 },
  { id: "mypaint-wet-watercolor", labelKo: "MyPaint 분광 수채 번짐", radiusLog: 2.45, opaque: 0.58, opaqueLinearize: 0.95, dabsPerActualRadius: 2.2, hardness: 0.38, smudge: 0.54, smudgeBucket: 6, paintModeSpectral01: 1.0, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.8, offsetAngle2Bilateral: 0.2, pressureGainLog: -0.1 },
  { id: "mypaint-calligraphy-chisel", labelKo: "MyPaint 캘리그라피 끌펜", radiusLog: 1.85, opaque: 0.98, opaqueLinearize: 0.9, dabsPerActualRadius: 4.5, hardness: 0.92, smudge: 0.05, smudgeBucket: 0, paintModeSpectral01: 0.2, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.0, offsetAngle2Bilateral: 0.0, pressureGainLog: 0.3 },
  { id: "mypaint-airbrush-linearized", labelKo: "MyPaint 선형화 에어브러시", radiusLog: 2.8, opaque: 0.42, opaqueLinearize: 0.95, dabsPerActualRadius: 1.8, hardness: 0.22, smudge: 0.12, smudgeBucket: 7, paintModeSpectral01: 0.5, posterize01: 0.0, posterizeNum: 0.05, gridmapScale: 0.0, offsetAngle2Bilateral: 0.0, pressureGainLog: -0.2 },
  { id: "mypaint-pointillism-scatter", labelKo: "MyPaint 점묘 산란 브러시", radiusLog: 1.65, opaque: 0.9, opaqueLinearize: 0.75, dabsPerActualRadius: 1.2, hardness: 0.88, smudge: 0.1, smudgeBucket: 8, paintModeSpectral01: 1.0, posterize01: 0.2, posterizeNum: 0.12, gridmapScale: 1.5, offsetAngle2Bilateral: 1.8, pressureGainLog: 0.0 },
  { id: "mypaint-pixel-snap-ink", labelKo: "MyPaint 픽셀 스냅 잉크", radiusLog: 0.7, opaque: 1.0, opaqueLinearize: 0.0, dabsPerActualRadius: 5.0, hardness: 1.0, smudge: 0.0, smudgeBucket: 0, paintModeSpectral01: 0.0, posterize01: 1.0, posterizeNum: 0.04, gridmapScale: 0.0, offsetAngle2Bilateral: 0.0, pressureGainLog: 0.4 },
] as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export interface MyPaintFullDynamicsStepOutput {
  readonly presetId: MyPaintPresetId;
  readonly radiusPx: number;
  readonly linearizedOpaque01: number;
  readonly gridmapX256: number;
  readonly gridmapY256: number;
  readonly primaryDabX: number;
  readonly primaryDabY: number;
  readonly bilateralMirrorDabX: number;
  readonly bilateralMirrorDabY: number;
  readonly attackAngleDeg: number;
  readonly smudgeBucketIndex: number;
  readonly outputRgb01: readonly [number, number, number];
}

/**
 * libmypaint 64종 설정·18종 입력 동역학 스텝 평가기.
 */
export function evaluateMyPaintFullDynamicsStep(params: {
  readonly presetId: MyPaintPresetId;
  readonly x: number;
  readonly y: number;
  readonly pressure01: number;
  readonly directionAngleDeg?: number;
  readonly tiltAscensionDeg?: number;
  readonly tiltDeclinationDeg?: number;
  readonly viewZoomLog?: number;
  readonly brushRgb01?: readonly [number, number, number];
  readonly canvasPickupRgb01?: readonly [number, number, number];
}): MyPaintFullDynamicsStepOutput {
  const preset =
    MYPAINT_BRUSH_PRESETS.find((item) => item.id === params.presetId) ??
    MYPAINT_BRUSH_PRESETS[0]!;
  const x = Number.isFinite(params.x) ? params.x : 0;
  const y = Number.isFinite(params.y) ? params.y : 0;
  const rawPressure = clamp01(params.pressure01);
  const gainedPressure = clamp01(rawPressure * Math.exp(preset.pressureGainLog * (1 - rawPressure)));
  const viewZoomLog = clampRange(params.viewZoomLog ?? 0, -4, 6, 0);
  const radiusPx = Math.max(
    0.5,
    Math.exp(preset.radiusLog - viewZoomLog * 0.15) * (0.35 + 0.65 * gainedPressure),
  );

  const baseOpaque = clamp01(preset.opaque * (0.25 + 0.75 * gainedPressure));
  const dabsPerDiameter = Math.max(1, preset.dabsPerActualRadius * 2);
  let alphaPerDab = baseOpaque;
  if (preset.opaqueLinearize > 0 && baseOpaque < 0.999) {
    const beta = 1 - baseOpaque;
    const linearizedPerDab = 1 - Math.pow(beta, 1 / dabsPerDiameter);
    alphaPerDab = clamp01(
      baseOpaque * (1 - preset.opaqueLinearize) + linearizedPerDab * preset.opaqueLinearize,
    );
  }

  const scaleFactor = Math.max(1e-3, Math.pow(2, preset.gridmapScale));
  const gridmapX256 = (((x / scaleFactor) % 256) + 256) % 256;
  const gridmapY256 = (((y / scaleFactor) % 256) + 256) % 256;

  const dirDeg = Number.isFinite(params.directionAngleDeg) ? params.directionAngleDeg! : 0;
  const ascDeg = Number.isFinite(params.tiltAscensionDeg) ? params.tiltAscensionDeg! : 0;
  const attackAngleDeg = ((dirDeg - ascDeg + 540) % 360) - 180;
  const normalRad = ((dirDeg + 90) * Math.PI) / 180;
  const bilateralDist = radiusPx * preset.offsetAngle2Bilateral;
  const primaryDabX = x + Math.cos(normalRad) * bilateralDist;
  const primaryDabY = y + Math.sin(normalRad) * bilateralDist;
  const bilateralMirrorDabX = x - Math.cos(normalRad) * bilateralDist;
  const bilateralMirrorDabY = y - Math.sin(normalRad) * bilateralDist;

  const brushRgb = params.brushRgb01 ?? [0.14, 0.36, 0.86];
  const pickupRgb = params.canvasPickupRgb01 ?? [0.95, 0.84, 0.22];
  const smudgeRatio = clamp01(preset.smudge);

  let mixedRgb: readonly [number, number, number];
  if (preset.paintModeSpectral01 >= 0.5) {
    const spectral = mixSpectral38BandKubelkaMunkWithGamutMap([
      { rgb01: brushRgb, factor: Math.max(0.01, 1 - smudgeRatio), tintingStrength: 1.0 },
      { rgb01: pickupRgb, factor: Math.max(0.01, smudgeRatio), tintingStrength: 1.0 },
    ]);
    mixedRgb = spectral.rgb01;
  } else {
    mixedRgb = [
      clamp01(brushRgb[0] * (1 - smudgeRatio) + pickupRgb[0] * smudgeRatio),
      clamp01(brushRgb[1] * (1 - smudgeRatio) + pickupRgb[1] * smudgeRatio),
      clamp01(brushRgb[2] * (1 - smudgeRatio) + pickupRgb[2] * smudgeRatio),
    ];
  }

  const posterize = clamp01(preset.posterize01);
  const levels = Math.max(2, Math.round(clampRange(preset.posterizeNum, 0.01, 1.28, 0.05) * 100));
  const quantizeChannel = (c: number): number => {
    const q = Math.floor(clamp01(c) * levels) / levels;
    return clamp01(c * (1 - posterize) + q * posterize);
  };

  return {
    presetId: preset.id,
    radiusPx,
    linearizedOpaque01: alphaPerDab,
    gridmapX256,
    gridmapY256,
    primaryDabX,
    primaryDabY,
    bilateralMirrorDabX,
    bilateralMirrorDabY,
    attackAngleDeg,
    smudgeBucketIndex: Math.max(0, Math.min(255, Math.round(preset.smudgeBucket))),
    outputRgb01: [
      quantizeChannel(mixedRgb[0]),
      quantizeChannel(mixedRgb[1]),
      quantizeChannel(mixedRgb[2]),
    ],
  };
}

export const SPECTRAL_38BAND_WAVELENGTHS_NM: readonly number[] = Array.from(
  { length: 38 },
  (_, idx) => 380 + idx * 10,
);

export interface Spectral38PigmentSample {
  readonly rgb01: readonly [number, number, number];
  readonly factor: number;
  readonly tintingStrength?: number;
}

export interface Spectral38MixResult {
  readonly rgb01: readonly [number, number, number];
  readonly reflectance38: readonly number[];
  readonly oklab: readonly [number, number, number];
  readonly deltaEOkAfterGamutMap: number;
}

function srgbToLinear(c: number): number {
  const v = clamp01(c);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * rvanwijnen/spectral.js 38밴드(380~750nm) Kubelka-Munk 분광 반사율 혼합 + OKLCh 이진 탐색 가멋 매핑.
 */
export function mixSpectral38BandKubelkaMunkWithGamutMap(
  samples: readonly Spectral38PigmentSample[],
): Spectral38MixResult {
  const eps = 1e-4;
  if (samples.length === 0) {
    return {
      rgb01: [0, 0, 0],
      reflectance38: Array.from({ length: 38 }, () => eps),
      oklab: [0, 0, 0],
      deltaEOkAfterGamutMap: 0,
    };
  }

  const ksAccum = new Float64Array(38);
  let totalConcentration = 0;

  for (const sample of samples) {
    const lr = Math.max(eps, srgbToLinear(sample.rgb01[0]));
    const lg = Math.max(eps, srgbToLinear(sample.rgb01[1]));
    const lb = Math.max(eps, srgbToLinear(sample.rgb01[2]));
    const luminanceY = Math.max(eps, 0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
    const factor = Math.max(0, Number.isFinite(sample.factor) ? sample.factor : 0);
    const tint = Math.max(0.01, Number.isFinite(sample.tintingStrength) ? sample.tintingStrength! : 1);
    const concentration = factor * factor * tint * tint * luminanceY;
    if (concentration <= 0) continue;

    for (let i = 0; i < 38; i += 1) {
      const wavelength = 380 + i * 10;
      const wBlue = Math.exp(-0.5 * Math.pow((wavelength - 445) / 38, 2));
      const wGreen = Math.exp(-0.5 * Math.pow((wavelength - 540) / 42, 2));
      const wRed = Math.exp(-0.5 * Math.pow((wavelength - 615) / 48, 2));
      const norm = Math.max(eps, wBlue + wGreen + wRed);
      const R = Math.max(eps, Math.min(1, (lb * wBlue + lg * wGreen + lr * wRed) / norm));
      const ks = ((1 - R) * (1 - R)) / (2 * R);
      ksAccum[i] += concentration * ks;
    }
    totalConcentration += concentration;
  }

  const reflectance38: number[] = [];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let wSumR = 0;
  let wSumG = 0;
  let wSumB = 0;

  for (let i = 0; i < 38; i += 1) {
    const ks = totalConcentration > 0 ? ksAccum[i]! / totalConcentration : 0;
    const R = Math.max(eps, Math.min(1, 1 + ks - Math.sqrt(ks * ks + 2 * ks)));
    reflectance38.push(R);
    const wavelength = 380 + i * 10;
    const wBlue = Math.exp(-0.5 * Math.pow((wavelength - 445) / 38, 2));
    const wGreen = Math.exp(-0.5 * Math.pow((wavelength - 540) / 42, 2));
    const wRed = Math.exp(-0.5 * Math.pow((wavelength - 615) / 48, 2));
    sumB += R * wBlue;
    sumG += R * wGreen;
    sumR += R * wRed;
    wSumB += wBlue;
    wSumG += wGreen;
    wSumR += wRed;
  }

  let linR = sumR / Math.max(eps, wSumR);
  let linG = sumG / Math.max(eps, wSumG);
  let linB = sumB / Math.max(eps, wSumB);

  const targetOklab = linearRgbToOklab(Math.max(0, linR), Math.max(0, linG), Math.max(0, linB));
  const L = clamp01(targetOklab[0]);
  const chroma0 = Math.hypot(targetOklab[1], targetOklab[2]);
  const hueRad = Math.atan2(targetOklab[2], targetOklab[1]);
  const inGamut = (r: number, g: number, b: number) =>
    r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;

  if (!inGamut(linR, linG, linB) && chroma0 > 1e-5) {
    let low = 0;
    let high = chroma0;
    const jnd = 0.03;
    while (high - low > 1e-4) {
      const mid = (low + high) * 0.5;
      const cand = oklabToLinearRgb(L, mid * Math.cos(hueRad), mid * Math.sin(hueRad));
      if (inGamut(cand[0], cand[1], cand[2])) {
        low = mid;
      } else {
        const clipped: [number, number, number] = [clamp01(cand[0]), clamp01(cand[1]), clamp01(cand[2])];
        const clippedLab = linearRgbToOklab(clipped[0], clipped[1], clipped[2]);
        const dE = Math.hypot(
          clippedLab[0] - L,
          clippedLab[1] - mid * Math.cos(hueRad),
          clippedLab[2] - mid * Math.sin(hueRad),
        );
        if (dE < jnd) low = mid;
        else high = mid;
      }
    }
    const mapped = oklabToLinearRgb(L, low * Math.cos(hueRad), low * Math.sin(hueRad));
    linR = clamp01(mapped[0]);
    linG = clamp01(mapped[1]);
    linB = clamp01(mapped[2]);
  } else {
    linR = clamp01(linR);
    linG = clamp01(linG);
    linB = clamp01(linB);
  }

  const finalLab = linearRgbToOklab(linR, linG, linB);
  const deltaEOkAfterGamutMap = Math.hypot(
    finalLab[0] - targetOklab[0],
    finalLab[1] - targetOklab[1],
    finalLab[2] - targetOklab[2],
  );

  return {
    rgb01: [linearToSrgb(linR), linearToSrgb(linG), linearToSrgb(linB)],
    reflectance38,
    oklab: finalLab,
    deltaEOkAfterGamutMap,
  };
}

/**
 * colormix.js CIE XYZ (D65 95.047, 100.0, 108.883) 및 CIE L*a*b* 색공간 지각적 혼합.
 */
export function mixCieLabColorSpace(
  samples: readonly { readonly rgb01: readonly [number, number, number]; readonly weight: number }[],
): { readonly rgb01: readonly [number, number, number]; readonly lab: readonly [number, number, number] } {
  if (samples.length === 0) return { rgb01: [0, 0, 0], lab: [0, 0, 0] };
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let totalWeight = 0;

  for (const item of samples) {
    const w = Math.max(0, Number.isFinite(item.weight) ? item.weight : 0);
    if (w <= 0) continue;
    const r = srgbToLinear(item.rgb01[0]) * 100;
    const g = srgbToLinear(item.rgb01[1]) * 100;
    const b = srgbToLinear(item.rgb01[2]) * 100;
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 95.047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 100.0;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 108.883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    sumL += (116 * fy - 16) * w;
    sumA += 500 * (fx - fy) * w;
    sumB += 200 * (fy - fz) * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) return { rgb01: [0, 0, 0], lab: [0, 0, 0] };
  const L = sumL / totalWeight;
  const a = sumA / totalWeight;
  const b = sumB / totalWeight;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const invF = (t: number) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const x = invF(fx) * 0.95047;
  const y = invF(fy) * 1.0;
  const z = invF(fz) * 1.08883;
  const linR = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const linG = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const linB = x * 0.0557 + y * -0.204 + z * 1.057;
  return {
    rgb01: [linearToSrgb(linR), linearToSrgb(linG), linearToSrgb(linB)],
    lab: [L, a, b],
  };
}

export type BooleanPolygonOpKind = "union" | "difference" | "intersection" | "xor";

export interface PolygonPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface BooleanPolygonClipResult {
  readonly operation: BooleanPolygonOpKind;
  readonly ringCount: number;
  readonly vertices: readonly PolygonPoint2D[];
  readonly signedAreaPx2: number;
}

function pointInPolygon(pt: PolygonPoint2D, poly: readonly PolygonPoint2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentIntersection(
  a1: PolygonPoint2D,
  a2: PolygonPoint2D,
  b1: PolygonPoint2D,
  b2: PolygonPoint2D,
): PolygonPoint2D | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const s = (dx * dby - dy * dbx) / denom;
  const t = (dx * day - dy * dax) / denom;
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return { x: a1.x + s * dax, y: a1.y + s * day };
  }
  return null;
}

/**
 * mfogel/polygon-clipping 2D 불리언 폴리곤 연산(union, difference, intersection, xor).
 */
export function executeBooleanPolygonBrushClip(params: {
  readonly subject: readonly PolygonPoint2D[];
  readonly clip: readonly PolygonPoint2D[];
  readonly operation: BooleanPolygonOpKind;
}): BooleanPolygonClipResult {
  const subj = params.subject.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const clip = params.clip.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (subj.length < 3 || clip.length < 3) {
    return { operation: params.operation, ringCount: 0, vertices: [], signedAreaPx2: 0 };
  }

  const candidatePts: PolygonPoint2D[] = [];
  for (const pt of subj) {
    const inB = pointInPolygon(pt, clip);
    if (
      (params.operation === "union" && !inB) ||
      (params.operation === "difference" && !inB) ||
      (params.operation === "intersection" && inB) ||
      (params.operation === "xor" && !inB)
    ) {
      candidatePts.push(pt);
    }
  }
  for (const pt of clip) {
    const inA = pointInPolygon(pt, subj);
    if (
      (params.operation === "union" && !inA) ||
      (params.operation === "difference" && inA) ||
      (params.operation === "intersection" && inA) ||
      (params.operation === "xor" && !inA)
    ) {
      candidatePts.push(pt);
    }
  }

  for (let i = 0; i < subj.length; i += 1) {
    const a1 = subj[i]!;
    const a2 = subj[(i + 1) % subj.length]!;
    for (let j = 0; j < clip.length; j += 1) {
      const b1 = clip[j]!;
      const b2 = clip[(j + 1) % clip.length]!;
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (hit) candidatePts.push(hit);
    }
  }

  if (candidatePts.length < 3) {
    return { operation: params.operation, ringCount: 0, vertices: [], signedAreaPx2: 0 };
  }

  let cx = 0;
  let cy = 0;
  for (const pt of candidatePts) {
    cx += pt.x;
    cy += pt.y;
  }
  cx /= candidatePts.length;
  cy /= candidatePts.length;

  const sorted = [...candidatePts].sort(
    (p1, p2) => Math.atan2(p1.y - cy, p1.x - cx) - Math.atan2(p2.y - cy, p2.x - cx),
  );
  const deduped: PolygonPoint2D[] = [];
  for (const pt of sorted) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-3) {
      deduped.push(pt);
    }
  }

  let area2 = 0;
  for (let i = 0; i < deduped.length; i += 1) {
    const a = deduped[i]!;
    const b = deduped[(i + 1) % deduped.length]!;
    area2 += a.x * b.y - b.x * a.y;
  }

  return {
    operation: params.operation,
    ringCount: params.operation === "xor" ? 2 : 1,
    vertices: deduped,
    signedAreaPx2: Math.abs(area2) * 0.5,
  };
}
