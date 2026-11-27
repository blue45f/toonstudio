/**
 * Wave 57: 작화 리듬(창작 운동학 텔레메트리) 및 컷 서사 긴장도 분석기.
 *
 * - 이 모듈은 의료·진단 목적의 생체 신호를 다루지 않는다.
 * - 작가의 펜 획 속도(px/s), 필압 변동(0..1), 획과 획 사이의 휴지/호흡 리듬(ms),
 *   획 곡률 흔들림 같은 **비의료 창작 운동학 텔레메트리**와 컷의 서사 메타데이터
 *   (장면 의도·액션 강도·대사 밀도·정서 온도)를 결합해 동적 3점 조명과 무드 LUT가
 *   참고할 정규화 지표(`tensionIndex`, `cadenceSmoothness`, `mood`)를 결정론적으로 산출한다.
 */

/** 동적 3점 조명 및 무드 색보정이 사용하는 5종 장면 무드. */
export type SceneLightingMood =
  | "calm-ambient"
  | "warm-intimate"
  | "dramatic-duel"
  | "noir-suspense"
  | "radiant-climax";

/** 컷 서사 의도 분류. */
export type CutNarrativeIntent =
  | "establishing"
  | "dialogue"
  | "emotional-beat"
  | "mystery"
  | "action"
  | "confrontation"
  | "climax";

/** 대사 연출 톤 분류. */
export type CutDialogueTone =
  | "calm"
  | "warm"
  | "tense"
  | "whisper"
  | "shout"
  | "triumphant";

/** 창작 운동학 텔레메트리 단일 펜 획 표본(비의료 작화 입력 데이터). */
export interface CreativeStrokeTelemetrySample {
  /** 획 평균 이동 속도(px/s, `>= 0`). */
  readonly speedPxPerSec: number;
  /** 정규화 필압(`0..1`). */
  readonly pressure: number;
  /** 획 지속 시간(ms, `>= 0`). */
  readonly durationMs: number;
  /** 현재 획 종료 후 다음 획 시작까지의 창작 휴지/호흡 간격(ms, `>= 0`). */
  readonly pauseAfterMs?: number;
  /** 획 방향 급변·떨림 정도(`0..1`, 높을수록 거칠고 격앙된 터치). */
  readonly curvatureJitter?: number;
}

/** 컷의 대사·액션·정서 서사 메타데이터. */
export interface CutNarrativeMetadata {
  readonly cutIntent?: CutNarrativeIntent;
  /** 컷 내 동작·충돌·카메라 역동성(`0..1`). */
  readonly actionIntensity?: number;
  /** 말풍선 밀도 및 빠른 대사 교차 정도(`0..1`). */
  readonly dialogueDensity?: number;
  readonly dialogueTone?: CutDialogueTone;
  /** 서사적 중대성·위기감(`0..1`). */
  readonly narrativeStakes?: number;
  /** 정서적 색온도 성향(`-1`=서늘·긴장·미스터리, `0`=중립, `+1`=따뜻·친밀·찬란). */
  readonly emotionalWarmth?: number;
  /** 집중선·해칭·화면 밀집도(`0..1`). */
  readonly panelClutterRatio?: number;
}

/** 분석기 보정 옵션. */
export interface CreativeCadenceAnalysisOptions {
  /** 작화 운동학 텔레메트리의 반영 비중(`0..1`, 기본 `0.45`). */
  readonly kinematicWeight?: number;
  /** 고속 액션 획 기준 속도(px/s, 기본 `1400`). */
  readonly referencePeakSpeedPxPerSec?: number;
  /** 여유로운 작화 휴지 간격 기준(ms, 기본 `1200`). */
  readonly referencePauseCalmMs?: number;
  /** 직전 컷/프레임의 무드(미세한 변동에서 깜빡임 방지를 위한 히스테리시스용). */
  readonly previousMood?: SceneLightingMood;
  /** 직전 무드 유지 마진(`0..0.25`, 기본 `0.06`). */
  readonly moodHysteresisMargin?: number;
  /** 사용자 접근성 설정(`prefers-reduced-motion`). 활성화 시 저자극 조명 힌트를 전달한다. */
  readonly prefersReducedMotion?: boolean;
}

/** 분석기 입력 페이로드. */
export interface CreativeCadenceTelemetryInput {
  readonly strokes: readonly CreativeStrokeTelemetrySample[];
  readonly narrative: CutNarrativeMetadata;
  readonly options?: CreativeCadenceAnalysisOptions;
}

/** 작화 운동학 세부 지표(비의료). */
export interface KinematicCadenceMetrics {
  readonly sampleCount: number;
  readonly meanSpeedPxPerSec: number;
  readonly normalizedSpeed: number;
  readonly meanPressure: number;
  readonly pressureStdDev: number;
  readonly pressureVarianceNormalized: number;
  readonly meanPauseMs: number;
  readonly pauseTempoEnergy: number;
  readonly pauseRegularity: number;
  readonly meanCurvatureJitter: number;
  readonly kinematicArousal: number;
}

/** 컷 서사 메타데이터 세부 지표. */
export interface NarrativeTensionMetrics {
  readonly narrativeTension: number;
  readonly warmthIndex: number;
  readonly suspenseFactor: number;
  readonly climaxFactor: number;
}

/** 5종 무드별 적합도 점수(`0..1`). */
export type SceneMoodScoreMap = Readonly<Record<SceneLightingMood, number>>;

/** 작화 리듬·서사 긴장도 최종 분석 결과. */
export interface CreativeCadenceAnalysisResult {
  /** 정규화 장면 긴장도(`0..1`). */
  readonly tensionIndex: number;
  /** 작화 몰입·리듬 안정도(`0..1`, 높을수록 고르고 매끄러운 호흡). */
  readonly cadenceSmoothness: number;
  /** 정서적 온기 성향(`-1..1`). */
  readonly warmthIndex: number;
  /** 최종 선택된 조명 무드. */
  readonly mood: SceneLightingMood;
  /** 한국어 UI 표시용 장면 무드 이름. */
  readonly moodLabelKo: string;
  /** 1위 무드와 2위 무드 간 확신도 격차(`0..1`). */
  readonly moodConfidence: number;
  readonly moodScores: SceneMoodScoreMap;
  readonly hysteresisApplied: boolean;
  readonly effectiveKinematicWeight: number;
  readonly telemetrySourceMode: "hybrid" | "narrative-only" | "kinematic-dominant";
  /** 비의료 창작 텔레메트리임을 명시하는 불변 계약 표식. */
  readonly telemetryDomain: "non-medical-creative-kinematics";
  readonly reducedMotionHint: boolean;
  readonly kinematic: KinematicCadenceMetrics;
  readonly narrativeMetrics: NarrativeTensionMetrics;
}

/** 기본 작화 운동학 반영 비중. */
export const DEFAULT_KINEMATIC_WEIGHT = 0.45 as const;
/** 고속 펜 획 기준 속도(px/s). */
export const DEFAULT_REFERENCE_PEAK_SPEED_PX_PER_SEC = 1_400 as const;
/** 차분한 작화 휴지 기준 간격(ms). */
export const DEFAULT_REFERENCE_PAUSE_CALM_MS = 1_200 as const;
/** 무드 히스테리시스 기본 여유 폭. */
export const DEFAULT_MOOD_HYSTERESIS_MARGIN = 0.06 as const;

/** 모든 장면 무드 열거 순서(결정론적 동점 해소 기준). */
export const SCENE_LIGHTING_MOODS: readonly SceneLightingMood[] = [
  "calm-ambient",
  "warm-intimate",
  "dramatic-duel",
  "noir-suspense",
  "radiant-climax",
];

/** 장면 무드별 한국어 레이블(창작자 화면용). */
export const SCENE_MOOD_LABELS_KO: Readonly<Record<SceneLightingMood, string>> = {
  "calm-ambient": "잔잔한 일상광",
  "warm-intimate": "따스한 감정광",
  "dramatic-duel": "긴박한 대결광",
  "noir-suspense": "느와르 서스펜스",
  "radiant-climax": "찬란한 절정광",
};

const INTENT_TENSION_PRIOR: Readonly<Record<CutNarrativeIntent, number>> = {
  establishing: 0.14,
  dialogue: 0.26,
  "emotional-beat": 0.4,
  mystery: 0.58,
  action: 0.78,
  confrontation: 0.84,
  climax: 0.94,
};

const INTENT_WARMTH_PRIOR: Readonly<Record<CutNarrativeIntent, number>> = {
  establishing: 0.05,
  dialogue: 0.16,
  "emotional-beat": 0.62,
  mystery: -0.68,
  action: -0.14,
  confrontation: -0.26,
  climax: 0.54,
};

const TONE_TENSION_PRIOR: Readonly<Record<CutDialogueTone, number>> = {
  calm: 0.12,
  warm: 0.24,
  whisper: 0.56,
  tense: 0.72,
  shout: 0.88,
  triumphant: 0.86,
};

const TONE_WARMTH_PRIOR: Readonly<Record<CutDialogueTone, number>> = {
  calm: 0.12,
  warm: 0.74,
  whisper: -0.52,
  tense: -0.34,
  shout: -0.05,
  triumphant: 0.68,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function computeMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i] ?? 0;
  }
  return sum / values.length;
}

function computePopulationStdDev(values: readonly number[], mean: number): number {
  if (values.length <= 1) return 0;
  let sqDiffSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const diff = (values[i] ?? 0) - mean;
    sqDiffSum += diff * diff;
  }
  return Math.sqrt(sqDiffSum / values.length);
}

function gaussianAffinity(value: number, center: number, sigma: number): number {
  const safeSigma = Math.max(1e-4, sigma);
  const delta = (value - center) / safeSigma;
  return Math.exp(-0.5 * delta * delta);
}

function analyzeKinematicSamples(
  strokes: readonly CreativeStrokeTelemetrySample[],
  referencePeakSpeedPxPerSec: number,
  referencePauseCalmMs: number,
): {
  readonly metrics: KinematicCadenceMetrics;
  readonly cadenceSmoothness: number;
} {
  const speeds: number[] = [];
  const pressures: number[] = [];
  const pauses: number[] = [];
  const jitters: number[] = [];

  for (let i = 0; i < strokes.length; i += 1) {
    const sample = strokes[i];
    if (!sample) continue;
    const speed = clamp(safeFinite(sample.speedPxPerSec, 0), 0, 20_000);
    const pressure = clamp(safeFinite(sample.pressure, 0.5), 0, 1);
    const duration = clamp(safeFinite(sample.durationMs, 160), 0, 60_000);
    if (duration === 0 && speed === 0 && sample.pauseAfterMs === undefined) {
      continue;
    }
    speeds.push(speed);
    pressures.push(pressure);
    if (sample.pauseAfterMs !== undefined && Number.isFinite(sample.pauseAfterMs)) {
      pauses.push(clamp(sample.pauseAfterMs, 0, 30_000));
    }
    jitters.push(clamp(safeFinite(sample.curvatureJitter, 0.15), 0, 1));
  }

  const sampleCount = speeds.length;
  if (sampleCount === 0) {
    return {
      metrics: {
        sampleCount: 0,
        meanSpeedPxPerSec: 0,
        normalizedSpeed: 0,
        meanPressure: 0,
        pressureStdDev: 0,
        pressureVarianceNormalized: 0,
        meanPauseMs: referencePauseCalmMs,
        pauseTempoEnergy: 0,
        pauseRegularity: 1,
        meanCurvatureJitter: 0,
        kinematicArousal: 0,
      },
      cadenceSmoothness: 0.78,
    };
  }

  const meanSpeedPxPerSec = computeMean(speeds);
  const speedStdDev = computePopulationStdDev(speeds, meanSpeedPxPerSec);
  const normalizedSpeed = clamp(
    1 - Math.exp(-meanSpeedPxPerSec / (0.62 * referencePeakSpeedPxPerSec)),
    0,
    1,
  );

  const meanPressure = computeMean(pressures);
  const pressureStdDev = computePopulationStdDev(pressures, meanPressure);
  const pressureVarianceNormalized = clamp(pressureStdDev / 0.26, 0, 1);

  const meanPauseMs = pauses.length > 0 ? computeMean(pauses) : referencePauseCalmMs * 0.65;
  const pauseStdDev = pauses.length > 1 ? computePopulationStdDev(pauses, meanPauseMs) : 0;
  const pauseTempoEnergy = clamp(
    Math.exp(-meanPauseMs / (0.4 * referencePauseCalmMs)),
    0,
    1,
  );
  const pauseCv = pauseStdDev / Math.max(meanPauseMs, 45);
  const pauseRegularity = pauses.length <= 1 ? 0.85 : clamp(1 - pauseCv / 1.25, 0, 1);

  const meanCurvatureJitter = computeMean(jitters);

  const pressureEffort = Math.max(
    pressureVarianceNormalized,
    clamp((meanPressure - 0.45) / 0.48, 0, 1) * 0.85,
  );
  const kinematicArousal = clamp(
    normalizedSpeed * 0.38 +
      pressureEffort * 0.24 +
      pauseTempoEnergy * 0.24 +
      meanCurvatureJitter * 0.08 +
      clamp((meanPressure - 0.35) / 0.65, 0, 1) * 0.06,
    0,
    1,
  );

  const speedCv = speedStdDev / Math.max(meanSpeedPxPerSec, 35);
  const speedConsistency = sampleCount <= 1 ? 0.85 : clamp(1 - speedCv / 1.15, 0, 1);
  const pressureConsistency = clamp(1 - pressureStdDev / 0.34, 0, 1);
  const strokeSteadiness = clamp(1 - meanCurvatureJitter, 0, 1);

  const cadenceSmoothness = clamp(
    speedConsistency * 0.3 +
      pressureConsistency * 0.25 +
      pauseRegularity * 0.25 +
      strokeSteadiness * 0.2,
    0,
    1,
  );

  return {
    metrics: {
      sampleCount,
      meanSpeedPxPerSec,
      normalizedSpeed,
      meanPressure,
      pressureStdDev,
      pressureVarianceNormalized,
      meanPauseMs,
      pauseTempoEnergy,
      pauseRegularity,
      meanCurvatureJitter,
      kinematicArousal,
    },
    cadenceSmoothness,
  };
}

function analyzeNarrativeMetadata(narrative: CutNarrativeMetadata): NarrativeTensionMetrics {
  const intent = narrative.cutIntent;
  const tone = narrative.dialogueTone;

  const intentTension = intent ? INTENT_TENSION_PRIOR[intent] : 0.35;
  const toneTension = tone ? TONE_TENSION_PRIOR[tone] : intentTension;

  const actionIntensity = clamp(
    safeFinite(narrative.actionIntensity, intentTension),
    0,
    1,
  );
  const dialogueDensity = clamp(
    safeFinite(narrative.dialogueDensity, tone === "shout" ? 0.72 : 0.3),
    0,
    1,
  );
  const narrativeStakes = clamp(
    safeFinite(narrative.narrativeStakes, intentTension),
    0,
    1,
  );
  const panelClutterRatio = clamp(
    safeFinite(narrative.panelClutterRatio, actionIntensity * 0.65),
    0,
    1,
  );

  const narrativeTension = clamp(
    actionIntensity * 0.34 +
      narrativeStakes * 0.24 +
      intentTension * 0.2 +
      toneTension * 0.1 +
      dialogueDensity * 0.06 +
      panelClutterRatio * 0.06,
    0,
    1,
  );

  const intentWarmth = intent ? INTENT_WARMTH_PRIOR[intent] : 0;
  const toneWarmth = tone ? TONE_WARMTH_PRIOR[tone] : intentWarmth;
  const explicitWarmth =
    narrative.emotionalWarmth !== undefined && Number.isFinite(narrative.emotionalWarmth)
      ? clamp(narrative.emotionalWarmth, -1, 1)
      : undefined;

  const warmthIndex =
    explicitWarmth !== undefined
      ? clamp(explicitWarmth * 0.65 + intentWarmth * 0.2 + toneWarmth * 0.15, -1, 1)
      : clamp(intentWarmth * 0.55 + toneWarmth * 0.45, -1, 1);

  const mysteryBoost = intent === "mystery" ? 0.48 : 0;
  const whisperBoost = tone === "whisper" ? 0.3 : tone === "tense" ? 0.16 : 0;
  const coolSuspense = clamp((-warmthIndex - 0.08) / 0.92, 0, 1) * 0.45;
  const suspenseFactor = clamp(mysteryBoost + whisperBoost + coolSuspense, 0, 1);

  const climaxBoost = intent === "climax" ? 0.52 : 0;
  const triumphantBoost = tone === "triumphant" ? 0.32 : 0;
  const radiantWarmthBoost =
    clamp((warmthIndex - 0.12) / 0.88, 0, 1) * clamp((narrativeStakes - 0.5) / 0.5, 0, 1) * 0.45;
  const climaxFactor = clamp(climaxBoost + triumphantBoost + radiantWarmthBoost, 0, 1);

  return {
    narrativeTension,
    warmthIndex,
    suspenseFactor,
    climaxFactor,
  };
}

function scoreSceneMoods(params: {
  readonly tensionIndex: number;
  readonly cadenceSmoothness: number;
  readonly warmthIndex: number;
  readonly narrative: CutNarrativeMetadata;
  readonly narrativeMetrics: NarrativeTensionMetrics;
  readonly kinematic: KinematicCadenceMetrics;
}): SceneMoodScoreMap {
  const { tensionIndex, cadenceSmoothness, warmthIndex, narrative, narrativeMetrics, kinematic } =
    params;

  const calmBase =
    gaussianAffinity(tensionIndex, 0.16, 0.24) * 0.58 +
    cadenceSmoothness * 0.22 +
    gaussianAffinity(warmthIndex, 0.05, 0.48) * 0.2;
  const calmBonus =
    (narrative.cutIntent === "establishing" ? 0.16 : 0) +
    (narrative.dialogueTone === "calm" ? 0.12 : 0);

  const warmBase =
    gaussianAffinity(tensionIndex, 0.34, 0.26) * 0.36 +
    clamp((warmthIndex + 0.05) / 1.05, 0, 1) * 0.44 +
    cadenceSmoothness * 0.2;
  const warmBonus =
    (narrative.cutIntent === "emotional-beat" ? 0.22 : 0) +
    (narrative.dialogueTone === "warm" ? 0.16 : 0);

  const duelKinetic =
    kinematic.sampleCount > 0
      ? kinematic.normalizedSpeed * 0.55 + kinematic.pauseTempoEnergy * 0.45
      : clamp(safeFinite(narrative.actionIntensity, tensionIndex), 0, 1);
  const duelBase =
    gaussianAffinity(tensionIndex, 0.78, 0.24) * 0.44 +
    duelKinetic * 0.24 +
    gaussianAffinity(warmthIndex, -0.1, 0.45) * 0.18 +
    (1 - cadenceSmoothness) * 0.14;
  const duelBonus =
    (narrative.cutIntent === "action" ? 0.2 : narrative.cutIntent === "confrontation" ? 0.24 : 0) +
    (narrative.dialogueTone === "shout" ? 0.14 : narrative.dialogueTone === "tense" ? 0.1 : 0);

  const noirBase =
    gaussianAffinity(tensionIndex, 0.62, 0.26) * 0.32 +
    clamp((-warmthIndex + 0.05) / 1.05, 0, 1) * 0.34 +
    narrativeMetrics.suspenseFactor * 0.34;
  const noirBonus =
    (narrative.cutIntent === "mystery" ? 0.24 : 0) +
    (narrative.dialogueTone === "whisper" ? 0.16 : 0);

  const climaxBase =
    gaussianAffinity(tensionIndex, 0.88, 0.22) * 0.4 +
    clamp((warmthIndex + 0.08) / 1.08, 0, 1) * 0.28 +
    narrativeMetrics.climaxFactor * 0.32;
  const climaxBonus =
    (narrative.cutIntent === "climax" ? 0.26 : 0) +
    (narrative.dialogueTone === "triumphant" ? 0.18 : 0);

  return {
    "calm-ambient": clamp(calmBase + calmBonus, 0, 1),
    "warm-intimate": clamp(warmBase + warmBonus, 0, 1),
    "dramatic-duel": clamp(duelBase + duelBonus, 0, 1),
    "noir-suspense": clamp(noirBase + noirBonus, 0, 1),
    "radiant-climax": clamp(climaxBase + climaxBonus, 0, 1),
  };
}

/**
 * 작가의 펜 운동학 텔레메트리(속도·필압 분산·휴지 리듬)와 컷 서사 메타데이터를 종합해
 * 정규화된 긴장도(`0..1`), 몰입 흐름(`0..1`), 장면 조명 무드를 산출한다.
 */
export function analyzeCreativeCadenceAndMood(
  input: CreativeCadenceTelemetryInput,
): CreativeCadenceAnalysisResult {
  const options = input.options ?? {};
  const requestedKinematicWeight = clamp(
    safeFinite(options.kinematicWeight, DEFAULT_KINEMATIC_WEIGHT),
    0,
    1,
  );
  const referencePeakSpeedPxPerSec = Math.max(
    120,
    safeFinite(options.referencePeakSpeedPxPerSec, DEFAULT_REFERENCE_PEAK_SPEED_PX_PER_SEC),
  );
  const referencePauseCalmMs = Math.max(
    150,
    safeFinite(options.referencePauseCalmMs, DEFAULT_REFERENCE_PAUSE_CALM_MS),
  );
  const moodHysteresisMargin = clamp(
    safeFinite(options.moodHysteresisMargin, DEFAULT_MOOD_HYSTERESIS_MARGIN),
    0,
    0.25,
  );
  const reducedMotionHint = Boolean(options.prefersReducedMotion);

  const { metrics: kinematic, cadenceSmoothness } = analyzeKinematicSamples(
    input.strokes,
    referencePeakSpeedPxPerSec,
    referencePauseCalmMs,
  );
  const narrativeMetrics = analyzeNarrativeMetadata(input.narrative);

  const sampleConfidence =
    kinematic.sampleCount === 0 ? 0 : clamp(kinematic.sampleCount / 3, 0.35, 1);
  const effectiveKinematicWeight = clamp(requestedKinematicWeight * sampleConfidence, 0, 1);
  const tensionIndex = clamp(
    kinematic.kinematicArousal * effectiveKinematicWeight +
      narrativeMetrics.narrativeTension * (1 - effectiveKinematicWeight),
    0,
    1,
  );

  const moodScores = scoreSceneMoods({
    tensionIndex,
    cadenceSmoothness,
    warmthIndex: narrativeMetrics.warmthIndex,
    narrative: input.narrative,
    narrativeMetrics,
    kinematic,
  });

  let rawBestMood: SceneLightingMood = SCENE_LIGHTING_MOODS[0] ?? "calm-ambient";
  let rawBestScore = -1;
  for (const candidate of SCENE_LIGHTING_MOODS) {
    const score = moodScores[candidate];
    if (score > rawBestScore) {
      rawBestScore = score;
      rawBestMood = candidate;
    }
  }

  let selectedMood: SceneLightingMood = rawBestMood;
  let selectedAdjustedScore = -1;
  let secondBestScore = -1;

  for (const candidate of SCENE_LIGHTING_MOODS) {
    const baseScore = moodScores[candidate];
    const adjusted =
      options.previousMood === candidate ? baseScore + moodHysteresisMargin : baseScore;
    if (adjusted > selectedAdjustedScore) {
      secondBestScore = selectedAdjustedScore;
      selectedAdjustedScore = adjusted;
      selectedMood = candidate;
    } else if (adjusted > secondBestScore) {
      secondBestScore = adjusted;
    }
  }

  const hysteresisApplied =
    options.previousMood !== undefined &&
    selectedMood === options.previousMood &&
    selectedMood !== rawBestMood;
  const moodConfidence = clamp(
    (selectedAdjustedScore - Math.max(0, secondBestScore)) / 0.35,
    0,
    1,
  );

  const telemetrySourceMode: CreativeCadenceAnalysisResult["telemetrySourceMode"] =
    effectiveKinematicWeight <= 0
      ? "narrative-only"
      : effectiveKinematicWeight >= 0.65
        ? "kinematic-dominant"
        : "hybrid";

  return {
    tensionIndex,
    cadenceSmoothness,
    warmthIndex: narrativeMetrics.warmthIndex,
    mood: selectedMood,
    moodLabelKo: SCENE_MOOD_LABELS_KO[selectedMood],
    moodConfidence,
    moodScores,
    hysteresisApplied,
    effectiveKinematicWeight,
    telemetrySourceMode,
    telemetryDomain: "non-medical-creative-kinematics",
    reducedMotionHint,
    kinematic,
    narrativeMetrics,
  };
}
