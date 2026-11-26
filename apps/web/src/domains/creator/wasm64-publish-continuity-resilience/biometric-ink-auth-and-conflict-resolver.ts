/**
 * 온디바이스 스타일러스 생체 필압·운동학 진위 판별기 및 로컬-클라우드 3-Way 문서 충돌 해결기.
 *
 * - `StylusBiometricInkProfiler`: 외부 하드웨어/EEG 없이 스타일러스 필압 곡선, 속도 백분위수,
 *   가속도 저크(jerk), 기울기(tilt), 곡률 케이던스 12차원 운동학 특징 벡터를 로컬 추출해
 *   코사인 유사도와 마할라노비스 거리로 작가 본인 필적 검증 및 사칭 탐지를 수행한다.
 * - `resolveStudioDocumentConflict` / `applyDocumentConflictResolutions`:
 *   `./studio-document-conflict-resolver`에서 3-Way 구조 병합 엔진을 재공개한다.
 */

import {
  applyDocumentConflictResolutions,
  resolveStudioDocumentConflict,
  type AutoMergedChangeRecord,
  type CameraRailKeyframe,
  type ConflictKind,
  type ConflictResolutionChoice,
  type ConflictResolverOptions,
  type DocumentFieldConflict,
  type DocumentSectionName,
  type StudioBalloonNode,
  type StudioCameraRailNode,
  type StudioDocumentMergeReport,
  type StudioDocumentMetadata,
  type StudioDocumentSnapshot,
  type StudioLayerNode,
} from "./studio-document-conflict-resolver";

export {
  applyDocumentConflictResolutions,
  resolveStudioDocumentConflict,
  type AutoMergedChangeRecord,
  type CameraRailKeyframe,
  type ConflictKind,
  type ConflictResolutionChoice,
  type ConflictResolverOptions,
  type DocumentFieldConflict,
  type DocumentSectionName,
  type StudioBalloonNode,
  type StudioCameraRailNode,
  type StudioDocumentMergeReport,
  type StudioDocumentMetadata,
  type StudioDocumentSnapshot,
  type StudioLayerNode,
};

export interface StylusPointSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly tiltXDeg: number;
  readonly tiltYDeg: number;
}

export interface StylusStrokeSample {
  readonly strokeId: string;
  readonly points: readonly StylusPointSample[];
}

export type KinematicTraitGroup =
  | "pressure-profile"
  | "velocity-cadence"
  | "acceleration-jerk"
  | "tilt-posture"
  | "curvature-rhythm";

export interface StylusKinematicBreakdown {
  readonly pressureMean: number;
  readonly pressureStd: number;
  readonly pressureAttackSlope: number;
  readonly pressureReleaseSlope: number;
  readonly velocityP25: number;
  readonly velocityP50: number;
  readonly velocityP90: number;
  readonly velocitySkewRatio: number;
  readonly jerkRmsLog: number;
  readonly tiltAltitudeMeanDeg: number;
  readonly tiltAzimuthCircularStd: number;
  readonly curvatureCadenceRadPer100Px: number;
}

export interface StylusKinematicFeatureVector {
  readonly dimensions: readonly number[];
  readonly breakdown: StylusKinematicBreakdown;
  readonly strokeCount: number;
  readonly pointCount: number;
}

export interface BiometricInkTemplate {
  readonly schema: "toonstudio.stylus-kinematic-template.v1";
  readonly creatorId: string;
  readonly enrolledStrokeCount: number;
  readonly enrolledAtIso: string;
  readonly centroid: readonly number[];
  readonly stdVector: readonly number[];
  readonly templateFnv1aHex: string;
  readonly privacyMode: "local-only-statistical-template";
}

export type InkAuthVerdict = "authentic" | "uncertain" | "imposter-suspected";

export interface DeviatingTraitSummary {
  readonly trait: KinematicTraitGroup;
  readonly zScore: number;
  readonly summaryKo: string;
}

export interface InkAuthVerificationResult {
  readonly creatorId: string;
  readonly verdict: InkAuthVerdict;
  readonly verified: boolean;
  readonly authorshipScore: number;
  readonly cosineSimilarity: number;
  readonly mahalanobisDistance: number;
  readonly evaluatedStrokeCount: number;
  readonly deviatingTraits: readonly DeviatingTraitSummary[];
  readonly privacyMode: "local-only-statistical-template";
}

export interface InkProfilerThresholds {
  readonly authenticMinScore?: number;
  readonly authenticMaxMahalanobis?: number;
  readonly authenticMinCosine?: number;
  readonly uncertainMinScore?: number;
}

const FEATURE_DIM = 12;
const CANONICAL_FEATURE_SCALES: readonly number[] = [
  0.5, 0.2, 2.0, 2.0, 300, 500, 900, 0.8, 6.0, 30.0, 0.8, 1.5,
];
const MIN_FEATURE_STD: readonly number[] = [
  0.045, 0.03, 0.35, 0.35, 35, 55, 95, 0.12, 0.45, 3.2, 0.08, 0.16,
];

const DIMENSION_TRAIT_MAP: readonly KinematicTraitGroup[] = [
  "pressure-profile",
  "pressure-profile",
  "pressure-profile",
  "pressure-profile",
  "velocity-cadence",
  "velocity-cadence",
  "velocity-cadence",
  "velocity-cadence",
  "acceleration-jerk",
  "tilt-posture",
  "tilt-posture",
  "curvature-rhythm",
];

const TRAIT_LABEL_KO: Readonly<Record<KinematicTraitGroup, string>> = {
  "pressure-profile": "필압 곡선(평균·도입/이탈 기울기) 편차",
  "velocity-cadence": "스트로크 속도 분포(P25/P50/P90) 편차",
  "acceleration-jerk": "가속도 변화율(저크) 역학 편차",
  "tilt-posture": "펜 기울기 각도 및 방위 자세 편차",
  "curvature-rhythm": "곡률 회전 리듬(호 길이 대비 꺾임) 편차",
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

function stdOf(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = values[i] - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

function fnv1aStringHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractSingleStrokeVector(stroke: StylusStrokeSample): readonly number[] | null {
  const pts = stroke.points;
  if (pts.length < 4) return null;

  const pressures: number[] = [];
  const speeds: number[] = [];
  const speedTsSec: number[] = [];
  const accelerations: number[] = [];
  const accelTsSec: number[] = [];
  const jerks: number[] = [];
  const tiltAlts: number[] = [];
  let sumCosAz = 0;
  let sumSinAz = 0;
  let totalArcLen = 0;
  let totalTurnRad = 0;

  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    pressures.push(clamp01(p.pressure));
    tiltAlts.push(Math.sqrt(p.tiltXDeg * p.tiltXDeg + p.tiltYDeg * p.tiltYDeg));
    const az = Math.atan2(p.tiltYDeg, p.tiltXDeg);
    sumCosAz += Math.cos(az);
    sumSinAz += Math.sin(az);

    if (i > 0) {
      const prev = pts[i - 1];
      const dtSec = Math.max(0.001, (p.timestampMs - prev.timestampMs) / 1000);
      const dist = Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
      totalArcLen += dist;
      speeds.push(dist / dtSec);
      speedTsSec.push(p.timestampMs / 1000);
    }

    if (i >= 2) {
      const p0 = pts[i - 2];
      const p1 = pts[i - 1];
      const v1x = p1.x - p0.x;
      const v1y = p1.y - p0.y;
      const v2x = p.x - p1.x;
      const v2y = p.y - p1.y;
      const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (len1 > 1e-4 && len2 > 1e-4) {
        totalTurnRad += Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (len1 * len2))));
      }
    }
  }

  for (let i = 1; i < speeds.length; i += 1) {
    accelerations.push((speeds[i] - speeds[i - 1]) / Math.max(0.001, speedTsSec[i] - speedTsSec[i - 1]));
    accelTsSec.push(speedTsSec[i]);
  }
  for (let i = 1; i < accelerations.length; i += 1) {
    jerks.push((accelerations[i] - accelerations[i - 1]) / Math.max(0.001, accelTsSec[i] - accelTsSec[i - 1]));
  }

  const pressureMean = meanOf(pressures);
  const pressureStd = stdOf(pressures, pressureMean);
  const attackIdx = Math.max(1, Math.floor((pts.length - 1) * 0.2));
  const pressureAttackSlope = (pressures[attackIdx] - pressures[0]) / Math.max(0.004, (pts[attackIdx].timestampMs - pts[0].timestampMs) / 1000);
  const releaseStart = Math.min(pts.length - 2, Math.floor((pts.length - 1) * 0.8));
  const pressureReleaseSlope = (pressures[pts.length - 1] - pressures[releaseStart]) / Math.max(0.004, (pts[pts.length - 1].timestampMs - pts[releaseStart].timestampMs) / 1000);

  const sortedSpeeds = speeds.slice().sort((a, b) => a - b);
  const velocityP25 = percentileSorted(sortedSpeeds, 0.25);
  const velocityP50 = percentileSorted(sortedSpeeds, 0.5);
  const velocityP90 = percentileSorted(sortedSpeeds, 0.9);
  const velocitySkewRatio = (velocityP90 - velocityP50) / Math.max(1, velocityP50);

  let jerkSqSum = 0;
  for (let i = 0; i < jerks.length; i += 1) jerkSqSum += jerks[i] * jerks[i];
  const jerkRmsLog = Math.log(1 + (jerks.length > 0 ? Math.sqrt(jerkSqSum / jerks.length) : 0));

  const meanResultant = Math.min(1, Math.sqrt(sumCosAz * sumCosAz + sumSinAz * sumSinAz) / pts.length);
  const tiltAzimuthCircularStd = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(1e-6, meanResultant))));

  return [
    round4(pressureMean),
    round4(pressureStd),
    round4(pressureAttackSlope),
    round4(pressureReleaseSlope),
    round4(velocityP25),
    round4(velocityP50),
    round4(velocityP90),
    round4(velocitySkewRatio),
    round4(jerkRmsLog),
    round4(meanOf(tiltAlts)),
    round4(tiltAzimuthCircularStd),
    round4((totalTurnRad / Math.max(10, totalArcLen)) * 100),
  ];
}

function vectorToBreakdown(vec: readonly number[]): StylusKinematicBreakdown {
  return {
    pressureMean: vec[0],
    pressureStd: vec[1],
    pressureAttackSlope: vec[2],
    pressureReleaseSlope: vec[3],
    velocityP25: vec[4],
    velocityP50: vec[5],
    velocityP90: vec[6],
    velocitySkewRatio: vec[7],
    jerkRmsLog: vec[8],
    tiltAltitudeMeanDeg: vec[9],
    tiltAzimuthCircularStd: vec[10],
    curvatureCadenceRadPer100Px: vec[11],
  };
}

/** 스타일러스 필압·속도·저크·기울기·곡률 운동학 서명을 온디바이스로 학습하고 진위를 판별한다. */
export class StylusBiometricInkProfiler {
  private readonly thresholds: Required<InkProfilerThresholds>;

  constructor(thresholds?: InkProfilerThresholds) {
    this.thresholds = {
      authenticMinScore: thresholds?.authenticMinScore ?? 0.72,
      authenticMaxMahalanobis: thresholds?.authenticMaxMahalanobis ?? 2.35,
      authenticMinCosine: thresholds?.authenticMinCosine ?? 0.9,
      uncertainMinScore: thresholds?.uncertainMinScore ?? 0.52,
    };
  }

  public extractFeatureVector(strokes: readonly StylusStrokeSample[]): StylusKinematicFeatureVector {
    const strokeVectors: (readonly number[])[] = [];
    let pointCount = 0;
    for (let i = 0; i < strokes.length; i += 1) {
      const vec = extractSingleStrokeVector(strokes[i]);
      if (vec) {
        strokeVectors.push(vec);
        pointCount += strokes[i].points.length;
      }
    }
    if (strokeVectors.length === 0) {
      throw new Error("유효한 스타일러스 스트로크(점 4개 이상)가 최소 1개 필요합니다.");
    }

    const averaged: number[] = [];
    for (let d = 0; d < FEATURE_DIM; d += 1) {
      let sum = 0;
      for (let s = 0; s < strokeVectors.length; s += 1) sum += strokeVectors[s][d];
      averaged.push(round4(sum / strokeVectors.length));
    }
    return { dimensions: averaged, breakdown: vectorToBreakdown(averaged), strokeCount: strokeVectors.length, pointCount };
  }

  public enrollCreator(
    creatorId: string,
    strokes: readonly StylusStrokeSample[],
    enrolledAtIso = new Date().toISOString(),
  ): BiometricInkTemplate {
    const strokeVectors: (readonly number[])[] = [];
    for (let i = 0; i < strokes.length; i += 1) {
      const vec = extractSingleStrokeVector(strokes[i]);
      if (vec) strokeVectors.push(vec);
    }
    if (strokeVectors.length < 3) {
      throw new Error("작가 필적 템플릿 등록에는 유효한 스트로크가 최소 3개 필요합니다.");
    }

    const centroid: number[] = [];
    const stdVector: number[] = [];
    for (let d = 0; d < FEATURE_DIM; d += 1) {
      const col = strokeVectors.map((v) => v[d]);
      const mu = meanOf(col);
      centroid.push(round4(mu));
      stdVector.push(round4(Math.max(MIN_FEATURE_STD[d], stdOf(col, mu))));
    }

    return {
      schema: "toonstudio.stylus-kinematic-template.v1",
      creatorId,
      enrolledStrokeCount: strokeVectors.length,
      enrolledAtIso,
      centroid,
      stdVector,
      templateFnv1aHex: fnv1aStringHex(`${creatorId}:${centroid.join(",")}:${stdVector.join(",")}`),
      privacyMode: "local-only-statistical-template",
    };
  }

  public verifyInkAuthorship(
    template: BiometricInkTemplate,
    candidateStrokes: readonly StylusStrokeSample[],
  ): InkAuthVerificationResult {
    const candidate = this.extractFeatureVector(candidateStrokes);
    const x = candidate.dimensions;
    const mu = template.centroid;
    const sd = template.stdVector;

    let mahaSqSum = 0;
    let dot = 0;
    let normX = 0;
    let normMu = 0;
    const traitMaxZ = new Map<KinematicTraitGroup, number>();

    for (let d = 0; d < FEATURE_DIM; d += 1) {
      const z = Math.abs(x[d] - mu[d]) / Math.max(MIN_FEATURE_STD[d], sd[d]);
      mahaSqSum += z * z;
      const trait = DIMENSION_TRAIT_MAP[d];
      if (z > (traitMaxZ.get(trait) ?? 0)) traitMaxZ.set(trait, z);

      const sx = x[d] / CANONICAL_FEATURE_SCALES[d];
      const smu = mu[d] / CANONICAL_FEATURE_SCALES[d];
      dot += sx * smu;
      normX += sx * sx;
      normMu += smu * smu;
    }

    const mahalanobisDistance = round4(Math.sqrt(mahaSqSum / FEATURE_DIM));
    const cosineDenom = Math.sqrt(normX) * Math.sqrt(normMu);
    const cosineSimilarity = round4(cosineDenom > 1e-9 ? Math.max(-1, Math.min(1, dot / cosineDenom)) : 0);
    const mahaScore = Math.exp(-0.5 * Math.pow(mahalanobisDistance / 2.1, 2));
    const authorshipScore = round4(clamp01(mahaScore * 0.65 + clamp01((cosineSimilarity + 1) / 2) * 0.35));

    const deviatingTraits: DeviatingTraitSummary[] = [];
    traitMaxZ.forEach((zScore, trait) => {
      if (zScore >= 2.1) {
        deviatingTraits.push({ trait, zScore: round4(zScore), summaryKo: `${TRAIT_LABEL_KO[trait]} (Z=${round4(zScore)})` });
      }
    });
    deviatingTraits.sort((a, b) => b.zScore - a.zScore);

    let verdict: InkAuthVerdict;
    if (
      authorshipScore >= this.thresholds.authenticMinScore &&
      mahalanobisDistance <= this.thresholds.authenticMaxMahalanobis &&
      cosineSimilarity >= this.thresholds.authenticMinCosine
    ) {
      verdict = "authentic";
    } else if (authorshipScore >= this.thresholds.uncertainMinScore) {
      verdict = "uncertain";
    } else {
      verdict = "imposter-suspected";
    }

    return {
      creatorId: template.creatorId,
      verdict,
      verified: verdict === "authentic",
      authorshipScore,
      cosineSimilarity,
      mahalanobisDistance,
      evaluatedStrokeCount: candidate.strokeCount,
      deviatingTraits,
      privacyMode: "local-only-statistical-template",
    };
  }
}
