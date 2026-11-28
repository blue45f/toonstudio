/**
 * Wave 91 작가 손목·필압 운동학 디지털 트윈 타입 계약, 로컬 개인정보 계약, 내장 3종 프리셋.
 */

import { computeFnv1aHex64 } from "./kinematic-geometry-primitives";

export type StylusToolHint =
  | "gpen"
  | "marupen"
  | "brushpen"
  | "pencil"
  | "rough"
  | "unknown";

export type BuiltInArtistTwinPresetId =
  | "korean-webtoon-gpen"
  | "seinen-marupen-crisp"
  | "brushpen-calligraphy";

export interface StylusSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs: number;
}

export interface StylusKinematicStroke {
  readonly id: string;
  readonly points: readonly StylusSamplePoint[];
  readonly toolHint?: StylusToolHint;
  readonly baseWidthPx?: number;
}

export interface KinematicSampleDerived {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly normalizedArc: number;
  readonly speedPxPerSec: number;
  readonly tangentialAccelPxPerSec2: number;
  readonly signedCurvature: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly pressure: number;
  readonly tiltMagnitudeRad: number;
  readonly tiltAngleRad: number;
  readonly timestampMs: number;
}

export interface StrokeKinematicFeatureVector {
  readonly strokeId: string;
  readonly pointCount: number;
  readonly totalArcLengthPx: number;
  readonly durationMs: number;
  readonly meanSpeedPxPerSec: number;
  readonly maxSpeedPxPerSec: number;
  readonly meanPressure: number;
  readonly bodyPressure: number;
  readonly minPressure: number;
  readonly maxPressure: number;
  readonly meanAbsCurvature: number;
  readonly maxAbsCurvature: number;
  readonly tremorEnergyRatio: number;
  readonly tremorRmsPx: number;
  readonly entryRampFraction: number;
  readonly entryAttackSlope: number;
  readonly entryInitialPressure: number;
  readonly exitTaperFraction: number;
  readonly exitFlickVelocityRatio: number;
  readonly exitTaperExponent: number;
  readonly exitTerminalPressure: number;
  readonly meanTiltMagnitudeRad: number;
  readonly tiltAnisotropyRatio: number;
  readonly cornerCuspIndices: readonly number[];
  readonly samples: readonly KinematicSampleDerived[];
}

export interface KinematicPrivacyContract {
  readonly uploadsRawStrokes: false;
  readonly runsLocallyOnly: true;
  readonly usesExternalCloud: false;
}

export const LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT: KinematicPrivacyContract =
  Object.freeze({
    uploadsRawStrokes: false,
    runsLocallyOnly: true,
    usesExternalCloud: false,
  });

export interface PressureTransferModel {
  readonly b0: number;
  readonly b1LogSpeed: number;
  readonly b2AbsCurvature: number;
  readonly minPressure: number;
  readonly maxPressure: number;
  readonly ridgeLambda: number;
  readonly residualRmse: number;
}

export interface NominalWidthRangePx {
  readonly min: number;
  readonly typical: number;
  readonly max: number;
}

export interface ArtistPenDynamicsTwinProfile {
  readonly artistId: string;
  readonly profileName: string;
  readonly presetKind?: BuiltInArtistTwinPresetId;
  readonly sampleStrokeCount: number;
  readonly samplePointCount: number;
  readonly pressureModel: PressureTransferModel;
  readonly nominalWidthPx: NominalWidthRangePx;
  readonly entryRampFraction: number;
  readonly entryAttackSlope: number;
  readonly entryInitialPressure: number;
  readonly exitTaperFraction: number;
  readonly exitFlickVelocityRatio: number;
  readonly exitTaperExponent: number;
  readonly exitTerminalPressure: number;
  readonly cornerMicroDwellBoost: number;
  readonly tiltWidthAnisotropy: number;
  readonly tremorCutoffHz: number;
  readonly typicalMeanSpeedPxPerSec: number;
  readonly typicalAbsCurvature: number;
  readonly profileFingerprintHex: string;
  readonly privacyContract: KinematicPrivacyContract;
}

export interface InkDnaSimilarityBreakdown {
  readonly overallScore: number;
  readonly entryAttackScore: number;
  readonly exitTaperScore: number;
  readonly velocityPressureScore: number;
  readonly curvatureWeightScore: number;
  readonly evaluatedStrokeCount: number;
  readonly profileFingerprintHex: string;
}

export interface ExtractKinematicsOptions {
  readonly cornerAngleDegThreshold?: number;
  readonly minCornerChordPx?: number;
}

export interface CalibrateTwinOptions {
  readonly profileName?: string;
  readonly ridgeLambda?: number;
  readonly nominalBaseWidthPx?: number;
  readonly cornerAngleDegThreshold?: number;
}

export const DEFAULT_RIDGE_LAMBDA = 0.015;

export function buildArtistTwinProfileFingerprint(
  artistId: string,
  model: PressureTransferModel,
  width: NominalWidthRangePx,
  entryRamp: number,
  exitTaper: number,
  exitExponent: number,
  tiltAniso: number,
): string {
  return computeFnv1aHex64(
    [
      artistId.trim().toLowerCase(),
      model.b0.toFixed(4),
      model.b1LogSpeed.toFixed(4),
      model.b2AbsCurvature.toFixed(4),
      model.minPressure.toFixed(3),
      model.maxPressure.toFixed(3),
      width.min.toFixed(2),
      width.typical.toFixed(2),
      width.max.toFixed(2),
      entryRamp.toFixed(3),
      exitTaper.toFixed(3),
      exitExponent.toFixed(3),
      tiltAniso.toFixed(3),
    ].join("|"),
  );
}

interface BuiltInPresetSpec {
  readonly defaultArtistId: string;
  readonly profileName: string;
  readonly samplePointCount: number;
  readonly pressureModel: PressureTransferModel;
  readonly nominalWidthPx: NominalWidthRangePx;
  readonly entryRampFraction: number;
  readonly entryAttackSlope: number;
  readonly entryInitialPressure: number;
  readonly exitTaperFraction: number;
  readonly exitFlickVelocityRatio: number;
  readonly exitTaperExponent: number;
  readonly exitTerminalPressure: number;
  readonly cornerMicroDwellBoost: number;
  readonly tiltWidthAnisotropy: number;
  readonly tremorCutoffHz: number;
  readonly typicalMeanSpeedPxPerSec: number;
  readonly typicalAbsCurvature: number;
}

const BUILT_IN_PRESETS: Record<BuiltInArtistTwinPresetId, BuiltInPresetSpec> = {
  "korean-webtoon-gpen": {
    defaultArtistId: "preset-korean-webtoon-gpen",
    profileName: "한국 웹툰 G펜 표준선",
    samplePointCount: 1020,
    pressureModel: {
      b0: 0.94,
      b1LogSpeed: -0.056,
      b2AbsCurvature: 4.8,
      minPressure: 0.16,
      maxPressure: 0.9,
      ridgeLambda: DEFAULT_RIDGE_LAMBDA,
      residualRmse: 0.021,
    },
    nominalWidthPx: { min: 0.5, typical: 2.6, max: 4.8 },
    entryRampFraction: 0.09,
    entryAttackSlope: 6.2,
    entryInitialPressure: 0.14,
    exitTaperFraction: 0.2,
    exitFlickVelocityRatio: 1.55,
    exitTaperExponent: 1.55,
    exitTerminalPressure: 0.05,
    cornerMicroDwellBoost: 0.1,
    tiltWidthAnisotropy: 0.18,
    tremorCutoffHz: 10.0,
    typicalMeanSpeedPxPerSec: 320,
    typicalAbsCurvature: 0.014,
  },
  "seinen-marupen-crisp": {
    defaultArtistId: "preset-seinen-marupen",
    profileName: "청년만화 마루펜 정밀선",
    samplePointCount: 960,
    pressureModel: {
      b0: 0.58,
      b1LogSpeed: -0.018,
      b2AbsCurvature: 1.4,
      minPressure: 0.2,
      maxPressure: 0.68,
      ridgeLambda: DEFAULT_RIDGE_LAMBDA,
      residualRmse: 0.018,
    },
    nominalWidthPx: { min: 0.35, typical: 1.35, max: 2.25 },
    entryRampFraction: 0.04,
    entryAttackSlope: 4.0,
    entryInitialPressure: 0.34,
    exitTaperFraction: 0.09,
    exitFlickVelocityRatio: 1.12,
    exitTaperExponent: 0.78,
    exitTerminalPressure: 0.18,
    cornerMicroDwellBoost: 0.05,
    tiltWidthAnisotropy: 0.06,
    tremorCutoffHz: 11.5,
    typicalMeanSpeedPxPerSec: 260,
    typicalAbsCurvature: 0.01,
  },
  "brushpen-calligraphy": {
    defaultArtistId: "preset-brushpen-calligraphy",
    profileName: "붓펜 강약 캘리그래피",
    samplePointCount: 1080,
    pressureModel: {
      b0: 1.24,
      b1LogSpeed: -0.102,
      b2AbsCurvature: 9.8,
      minPressure: 0.14,
      maxPressure: 0.98,
      ridgeLambda: DEFAULT_RIDGE_LAMBDA,
      residualRmse: 0.026,
    },
    nominalWidthPx: { min: 0.55, typical: 4.8, max: 9.4 },
    entryRampFraction: 0.22,
    entryAttackSlope: 3.3,
    entryInitialPressure: 0.08,
    exitTaperFraction: 0.3,
    exitFlickVelocityRatio: 1.85,
    exitTaperExponent: 2.25,
    exitTerminalPressure: 0.03,
    cornerMicroDwellBoost: 0.18,
    tiltWidthAnisotropy: 0.52,
    tremorCutoffHz: 8.5,
    typicalMeanSpeedPxPerSec: 340,
    typicalAbsCurvature: 0.018,
  },
};

export function createBuiltInArtistTwinPreset(
  presetId: BuiltInArtistTwinPresetId,
  artistIdOverride?: string,
): ArtistPenDynamicsTwinProfile {
  const spec = BUILT_IN_PRESETS[presetId];
  const artistId = artistIdOverride ?? spec.defaultArtistId;
  return {
    artistId,
    profileName: spec.profileName,
    presetKind: presetId,
    sampleStrokeCount: 24,
    samplePointCount: spec.samplePointCount,
    pressureModel: spec.pressureModel,
    nominalWidthPx: spec.nominalWidthPx,
    entryRampFraction: spec.entryRampFraction,
    entryAttackSlope: spec.entryAttackSlope,
    entryInitialPressure: spec.entryInitialPressure,
    exitTaperFraction: spec.exitTaperFraction,
    exitFlickVelocityRatio: spec.exitFlickVelocityRatio,
    exitTaperExponent: spec.exitTaperExponent,
    exitTerminalPressure: spec.exitTerminalPressure,
    cornerMicroDwellBoost: spec.cornerMicroDwellBoost,
    tiltWidthAnisotropy: spec.tiltWidthAnisotropy,
    tremorCutoffHz: spec.tremorCutoffHz,
    typicalMeanSpeedPxPerSec: spec.typicalMeanSpeedPxPerSec,
    typicalAbsCurvature: spec.typicalAbsCurvature,
    profileFingerprintHex: buildArtistTwinProfileFingerprint(
      artistId,
      spec.pressureModel,
      spec.nominalWidthPx,
      spec.entryRampFraction,
      spec.exitTaperFraction,
      spec.exitTaperExponent,
      spec.tiltWidthAnisotropy,
    ),
    privacyContract: LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  };
}
