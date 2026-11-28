/**
 * Wave 152 — 스타일러스 하드웨어 프로파일·필압 전송 곡선·기울기·배럴 롤·One-Euro 필터 공유 계약 타입 및 정본 상수.
 */

export type StylusHardwareId =
  | "wacom-pro-pen-3"
  | "apple-pencil-pro"
  | "samsung-s-pen"
  | "huion-pw550";

export type PressureCurvePresetId =
  | "linear"
  | "soft-light-hand"
  | "firm-heavy-hand"
  | "g-pen-ink-snap"
  | "pencil-shading-s-curve";

export type NibRotationSource =
  | "hardware-barrel-roll"
  | "tilt-azimuth-fallback"
  | "stroke-tangent-fallback"
  | "fixed-angle-fallback";

export type BarrelRollFallbackPolicy =
  | "azimuth-then-tangent"
  | "tangent-then-azimuth"
  | "fixed";

export type ChiselNibStyle =
  | "flat-chisel"
  | "g-pen"
  | "graphite-shading"
  | "calligraphy-broad";

export interface StylusHardwareProfile {
  readonly id: StylusHardwareId;
  readonly displayName: string;
  readonly displayNameKo: string;
  readonly manufacturer: string;
  /** 펜촉이 필압 신호를 처음 감지하는 최소 물리 하중(gram-force). */
  readonly initialActivationForceGf: number;
  /** 정규화 필압 1.0에 도달하는 최대 정격 하중(gram-force). */
  readonly maxForceGf: number;
  /** 하드웨어 필압 양자화 단계 수(예: 4096, 8192). */
  readonly pressureLevels: number;
  /** 물리 하중과 하드웨어 정규화 필압 간 고유 응답 감마 지수. */
  readonly nativeForceGamma: number;
  /** 수직(90도) 기준으로 인식 가능한 최대 기울기 각도(도). */
  readonly maxTiltDeg: number;
  /** 하드웨어 배럴 롤(자이로/축 회전) 지원 여부. */
  readonly supportsBarrelRoll: boolean;
  /** 배럴 스퀴즈 제스처 지원 여부. */
  readonly supportsSqueeze: boolean;
  /** 스타일러스 좌표·필압 보고 주파수(Hz). */
  readonly pollingHz: number;
  /** 호버 프리뷰 감지 높이(mm). */
  readonly typicalHoverHeightMm: number;
  /** 스튜디오 운용 참고 설명(한국어). */
  readonly studioNotesKo: string;
}

export interface PressureCurvePoint {
  readonly x: number;
  readonly y: number;
}

export interface BuildMonotonePressureCurveOptions {
  readonly name?: string;
  readonly ensureUnitEndpoints?: boolean;
}

export interface MonotonePressureCurve {
  readonly name: string;
  readonly knots: readonly PressureCurvePoint[];
  readonly tangents: readonly number[];
  readonly segmentWidths: readonly number[];
  readonly secantSlopes: readonly number[];
  readonly sanitizedInputCount: number;
  readonly enforcedMonotonicityCount: number;
}

export interface PressureCurveMonotonicityAudit {
  readonly sampleCount: number;
  readonly isGloballyMonotoneNonDecreasing: boolean;
  readonly violationCount: number;
  readonly overshootCount: number;
  readonly minOutput: number;
  readonly maxOutput: number;
  readonly maxNegativeStep: number;
}

export interface TranslateStylusPressureOptions {
  readonly sourceDevice: StylusHardwareId | StylusHardwareProfile;
  readonly targetDevice: StylusHardwareId | StylusHardwareProfile;
  readonly sourcePressure: number;
  readonly artistCurve?: MonotonePressureCurve;
}

export interface CrossDevicePressureTranslation {
  readonly sourceDeviceId: StylusHardwareId;
  readonly targetDeviceId: StylusHardwareId;
  readonly sourcePressure: number;
  readonly physicalForceGf: number;
  readonly targetPressure: number;
  readonly targetPressureQuantized: number;
  readonly targetPressureStep: number;
  readonly effectiveBrushPressure: number;
  readonly inSharedForceRange: boolean;
  readonly clampedBelowIaf: boolean;
  readonly clampedAboveMaxForce: boolean;
  readonly deadZoneDeficitGf: number;
  readonly sharedForceMinGf: number;
  readonly sharedForceMaxGf: number;
  readonly roundTripSourcePressure: number;
  readonly roundTripError: number;
}

export interface DeviceRoundTripAccuracyReport {
  readonly sourceDeviceId: StylusHardwareId;
  readonly targetDeviceId: StylusHardwareId;
  readonly sharedForceMinGf: number;
  readonly sharedForceMaxGf: number;
  readonly testedSampleCount: number;
  readonly maxRoundTripError: number;
  readonly meanRoundTripError: number;
  readonly passesStrictThreshold: boolean;
}

export interface BarrelRollUnwrapResult {
  readonly unwrappedAnglesDeg: readonly number[];
  readonly stepDeltasDeg: readonly number[];
  readonly maxAbsStepDeg: number;
  readonly rawWrapJumpCount: number;
  readonly flipGlitchCount: number;
  readonly totalRotationDeg: number;
  readonly sanitizedSampleCount: number;
}

export interface EffectiveNibRotationInput {
  readonly device: StylusHardwareId | StylusHardwareProfile;
  readonly barrelRollDeg?: number;
  readonly tiltAzimuthDeg?: number;
  readonly altitudeDeg?: number;
  readonly strokeTangentDeg?: number;
  readonly fixedNibAngleDeg?: number;
  readonly fallbackPolicy?: BarrelRollFallbackPolicy;
}

export interface EffectiveNibRotationResult {
  readonly effectiveNibRotationDeg: number;
  readonly rotationSource: NibRotationSource;
  readonly usedFallback: boolean;
  readonly supportsBarrelRoll: boolean;
}

export interface TiltAltitudeAzimuthResult {
  readonly altitudeDeg: number;
  readonly azimuthDeg: number;
  readonly tiltFromVerticalDeg: number;
}

export interface ChiselNibStampInput {
  readonly baseBrushSizePx: number;
  readonly pressure: number;
  readonly altitudeDeg: number;
  readonly azimuthDeg: number;
  readonly barrelRollDeg?: number;
  readonly strokeTangentDeg?: number;
  readonly device?: StylusHardwareId | StylusHardwareProfile;
  readonly nibStyle?: ChiselNibStyle;
  readonly pressureSizeFloorRatio?: number;
  readonly fallbackPolicy?: BarrelRollFallbackPolicy;
}

export interface ChiselNibStampGeometry {
  readonly majorWidthPx: number;
  readonly minorWidthPx: number;
  readonly aspectRatio: number;
  readonly stampRotationDeg: number;
  readonly effectiveNibRotationDeg: number;
  readonly rotationSource: NibRotationSource;
  readonly tiltFactor: number;
  readonly clampedAltitudeDeg: number;
  readonly shadingCoverageFactor: number;
  readonly contactAreaPx2: number;
  readonly isNearCircular: boolean;
}

export interface StylusRawStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure?: number;
  readonly altitudeDeg?: number;
  readonly azimuthDeg?: number;
  readonly barrelRollDeg?: number;
}

export interface OneEuroFilterConfig {
  readonly minCutoffHz?: number;
  readonly beta?: number;
  readonly dCutoffHz?: number;
  readonly defaultPollingHz?: number;
  readonly slowSpeedThresholdPxPerSec?: number;
  readonly highSpeedThresholdPxPerSec?: number;
}

export interface ResolvedOneEuroFilterConfig {
  readonly minCutoffHz: number;
  readonly beta: number;
  readonly dCutoffHz: number;
  readonly defaultPollingHz: number;
  readonly slowSpeedThresholdPxPerSec: number;
  readonly highSpeedThresholdPxPerSec: number;
}

export interface FilteredStylusStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly speedPxPerSec: number;
  readonly effectiveCutoffHz: number;
  readonly alpha: number;
  readonly unwrappedBarrelRollDeg: number | null;
  readonly trackingDeltaPx: number;
}

export interface OneEuroFilterResult {
  readonly config: ResolvedOneEuroFilterConfig;
  readonly filteredSamples: readonly FilteredStylusStrokeSample[];
  readonly rawJitterRmsPx: number;
  readonly filteredJitterRmsPx: number;
  readonly jitterReductionPercent: number;
  readonly lowSpeedRawJitterRmsPx: number;
  readonly lowSpeedFilteredJitterRmsPx: number;
  readonly lowSpeedJitterReductionPercent: number;
  readonly highSpeedLagPx: number;
  readonly meanTrackingDeviationPx: number;
  readonly maxTrackingDeviationPx: number;
  readonly sanitizedFieldCount: number;
  readonly nonMonotonicTimestampCount: number;
}

export interface FixedEmaBaselineResult {
  readonly fixedAlpha: number;
  readonly filteredPoints: readonly { readonly x: number; readonly y: number }[];
  readonly rawJitterRmsPx: number;
  readonly filteredJitterRmsPx: number;
  readonly jitterReductionPercent: number;
  readonly lowSpeedFilteredJitterRmsPx: number;
  readonly highSpeedLagPx: number;
  readonly meanTrackingDeviationPx: number;
}

export interface FixedEmaVsOneEuroComparison {
  readonly oneEuro: OneEuroFilterResult;
  readonly fixedEma: FixedEmaBaselineResult;
  readonly highSpeedLagReductionPercent: number;
  readonly highSpeedLagRatio: number;
  readonly oneEuroOutperformsFixedEma: boolean;
}

export interface StylusCalibrationBundleInput {
  readonly sourceDevice: StylusHardwareId | StylusHardwareProfile;
  readonly targetDevice: StylusHardwareId | StylusHardwareProfile;
  readonly pressureCurvePoints?: readonly PressureCurvePoint[];
  readonly pressureCurveName?: string;
  readonly barrelRollSamplesDeg?: readonly number[];
  readonly sampleTiltAzimuthDeg?: number;
  readonly sampleStrokeTangentDeg?: number;
  readonly sampleBaseBrushSizePx?: number;
  readonly samplePressure?: number;
  readonly nibStyle?: ChiselNibStyle;
  readonly strokeSamples?: readonly StylusRawStrokeSample[];
  readonly oneEuroConfig?: OneEuroFilterConfig;
  readonly fixedEmaAlpha?: number;
}

export interface StylusCalibrationBundle {
  readonly sourceProfile: StylusHardwareProfile;
  readonly targetProfile: StylusHardwareProfile;
  readonly pressureCurve: MonotonePressureCurve;
  readonly monotonicityAudit: PressureCurveMonotonicityAudit;
  readonly roundTripReport: DeviceRoundTripAccuracyReport;
  readonly barrelRollUnwrap: BarrelRollUnwrapResult;
  readonly verticalStamp: ChiselNibStampGeometry;
  readonly midTiltStamp: ChiselNibStampGeometry;
  readonly lowTiltStamp: ChiselNibStampGeometry;
  readonly filterComparison: FixedEmaVsOneEuroComparison;
  readonly calibrationManifestSha256Hex: string;
}

export const STYLUS_HARDWARE_IDS: readonly StylusHardwareId[] = [
  "wacom-pro-pen-3",
  "apple-pencil-pro",
  "samsung-s-pen",
  "huion-pw550",
];

export const STYLUS_HARDWARE_PROFILES: Readonly<Record<StylusHardwareId, StylusHardwareProfile>> = {
  "wacom-pro-pen-3": {
    id: "wacom-pro-pen-3",
    displayName: "Wacom Pro Pen 3",
    displayNameKo: "와콤 프로 펜 3",
    manufacturer: "Wacom",
    initialActivationForceGf: 1,
    maxForceGf: 500,
    pressureLevels: 8192,
    nativeForceGamma: 1.0,
    maxTiltDeg: 60,
    supportsBarrelRoll: false,
    supportsSqueeze: false,
    pollingHz: 240,
    typicalHoverHeightMm: 10,
    studioNotesKo: "1gf 초저초기활성하중과 8192단계 선형 필압을 기준으로 삼는 데스크톱 원고용 펜.",
  },
  "apple-pencil-pro": {
    id: "apple-pencil-pro",
    displayName: "Apple Pencil Pro",
    displayNameKo: "애플 펜슬 프로",
    manufacturer: "Apple",
    initialActivationForceGf: 8,
    maxForceGf: 420,
    pressureLevels: 4096,
    nativeForceGamma: 1.18,
    maxTiltDeg: 65,
    supportsBarrelRoll: true,
    supportsSqueeze: true,
    pollingHz: 240,
    typicalHoverHeightMm: 12,
    studioNotesKo: "자이로 배럴 롤과 스퀴즈를 지원하며 유리 패널 특성상 초기 활성 하중이 8gf로 다소 높음.",
  },
  "samsung-s-pen": {
    id: "samsung-s-pen",
    displayName: "Samsung S-Pen",
    displayNameKo: "삼성 S펜",
    manufacturer: "Samsung",
    initialActivationForceGf: 3,
    maxForceGf: 380,
    pressureLevels: 4096,
    nativeForceGamma: 0.92,
    maxTiltDeg: 60,
    supportsBarrelRoll: false,
    supportsSqueeze: false,
    pollingHz: 240,
    typicalHoverHeightMm: 9,
    studioNotesKo: "EMR 무전원 방식으로 가벼운 필압 구간 반응이 부드럽고 최대 하중은 380gf 수준.",
  },
  "huion-pw550": {
    id: "huion-pw550",
    displayName: "Huion PW550",
    displayNameKo: "휴이온 PW550",
    manufacturer: "Huion",
    initialActivationForceGf: 2,
    maxForceGf: 500,
    pressureLevels: 8192,
    nativeForceGamma: 1.08,
    maxTiltDeg: 60,
    supportsBarrelRoll: false,
    supportsSqueeze: false,
    pollingHz: 300,
    typicalHoverHeightMm: 10,
    studioNotesKo: "2gf 저활성하중과 300Hz 고속 보고율을 갖추며 중간 필압대가 약간 단단한 감마 특성.",
  },
};

export const STYLUS_PRESSURE_CURVE_PRESETS: Readonly<
  Record<PressureCurvePresetId, readonly PressureCurvePoint[]>
> = {
  linear: [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ],
  "soft-light-hand": [
    { x: 0, y: 0 },
    { x: 0.2, y: 0.36 },
    { x: 0.5, y: 0.68 },
    { x: 0.8, y: 0.9 },
    { x: 1, y: 1 },
  ],
  "firm-heavy-hand": [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.1 },
    { x: 0.55, y: 0.34 },
    { x: 0.82, y: 0.72 },
    { x: 1, y: 1 },
  ],
  "g-pen-ink-snap": [
    { x: 0, y: 0 },
    { x: 0.15, y: 0.08 },
    { x: 0.38, y: 0.28 },
    { x: 0.62, y: 0.76 },
    { x: 0.85, y: 0.95 },
    { x: 1, y: 1 },
  ],
  "pencil-shading-s-curve": [
    { x: 0, y: 0 },
    { x: 0.2, y: 0.22 },
    { x: 0.5, y: 0.5 },
    { x: 0.78, y: 0.68 },
    { x: 1, y: 1 },
  ],
};

export const DEFAULT_ONE_EURO_CONFIG: ResolvedOneEuroFilterConfig = {
  minCutoffHz: 1.0,
  beta: 0.035,
  dCutoffHz: 1.5,
  defaultPollingHz: 240,
  slowSpeedThresholdPxPerSec: 180,
  highSpeedThresholdPxPerSec: 500,
};
