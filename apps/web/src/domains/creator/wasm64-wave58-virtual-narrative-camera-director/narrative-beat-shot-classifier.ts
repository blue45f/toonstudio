/**
 * Wave-58: 서사 비트 기반 만화·영화 샷 문법 분류기 (`narrative-beat-shot-classifier`).
 *
 * 컷의 서사 맥락(대사 감정·강도, 화자·청자 3D 공간 배치, 액션 속도 벡터, 컷 중요도,
 * 직전 컷 샷 문법 및 말풍선 분량)을 해석해 7종 샷 문법 중 최적안을 선택하고,
 * 추천 초점거리(mm)·수직/수평/대각 화각(FOV)·말풍선 배치용 네거티브 스페이스 계획을 산출한다.
 */

/** 3차원 직교 좌표/벡터 (미터 단위, 오른손 Y-Up 좌표계). */
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/** 2차원 정규화 화면 좌표 (`[0, 1]`, 좌상단 원점). */
export interface Vec2 { readonly x: number; readonly y: number }

/** 정규화 화면 사각형 (`x, y, width, height ∈ [0, 1]`, 좌상단 원점). */
export interface NormalizedRect2D { readonly height: number; readonly width: number; readonly x: number; readonly y: number }

/** 만화·영화 표준 7종 서사 샷 문법 식별자. */
export type NarrativeShotGrammar =
  | "birds-eye-reveal"
  | "dramatic-low-angle"
  | "dutch-tension"
  | "establishing-wide"
  | "extreme-closeup"
  | "medium-two-shot"
  | "over-the-shoulder";

/** 연속성 감사용 샷 크기 계급 (광각 전경 → 익스트림 클로즈업). */
export type ShotScaleTier = "closeup" | "extreme-closeup" | "extreme-wide" | "medium" | "medium-closeup" | "wide";

/** 서사 컷의 감정 상태 분류. */
export type NarrativeEmotion =
  | "action" | "anger" | "calm" | "curious" | "despair" | "determined"
  | "fear" | "mystery" | "shock" | "tender" | "tense" | "triumph";

/** 말풍선 배치용 네거티브 스페이스 선호 영역. */
export type NegativeSpaceZone = "left-margin" | "right-margin" | "top-left" | "top-right" | "upper-band";

/** 네거티브 스페이스와 조화를 이루는 주 피사체 배치 힌트. */
export type SubjectAnchorHint = "center" | "center-lower" | "left-third" | "right-third";

/** 지원하는 7종 샷 문법 정적 순서 목록. */
export const NARRATIVE_SHOT_GRAMMARS: readonly NarrativeShotGrammar[] = [
  "establishing-wide", "medium-two-shot", "over-the-shoulder", "dramatic-low-angle",
  "dutch-tension", "extreme-closeup", "birds-eye-reveal",
] as const;

/** 샷 문법별 기본 광학·프레이밍 프리셋. */
export interface ShotGrammarPreset {
  readonly baseSubjectScreenHeightRatio: number;
  readonly defaultApertureFStop: number;
  readonly defaultDutchRollDeg: number;
  readonly defaultElevationDeg: number;
  readonly defaultFocalLengthMm: number;
  readonly grammar: NarrativeShotGrammar;
  readonly labelKo: string;
  readonly maxFocalLengthMm: number;
  readonly minFocalLengthMm: number;
  readonly shotScale: ShotScaleTier;
  /** `0`(최광각) ~ `5`(익스트림 클로즈업) 연속 크기 등급. */
  readonly shotScaleRank: number;
}

/** 35mm 풀프레임 표준 센서 높이(mm). */
export const DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM = 24;

/** 더치 틸트 안전 상한(±22도). */
export const CLASSIFIER_MAX_DUTCH_ROLL_DEG = 22;

/** 7종 샷 문법 표준 프리셋 테이블. */
export const SHOT_GRAMMAR_PRESETS: Readonly<Record<NarrativeShotGrammar, ShotGrammarPreset>> = {
  "establishing-wide": {
    baseSubjectScreenHeightRatio: 0.28, defaultApertureFStop: 8.0, defaultDutchRollDeg: 0,
    defaultElevationDeg: 8, defaultFocalLengthMm: 24, grammar: "establishing-wide",
    labelKo: "전경 확립 샷", maxFocalLengthMm: 28, minFocalLengthMm: 18, shotScale: "extreme-wide", shotScaleRank: 0,
  },
  "birds-eye-reveal": {
    baseSubjectScreenHeightRatio: 0.32, defaultApertureFStop: 5.6, defaultDutchRollDeg: 0,
    defaultElevationDeg: 66, defaultFocalLengthMm: 28, grammar: "birds-eye-reveal",
    labelKo: "버즈아이 조감 리빌", maxFocalLengthMm: 35, minFocalLengthMm: 20, shotScale: "wide", shotScaleRank: 1,
  },
  "medium-two-shot": {
    baseSubjectScreenHeightRatio: 0.52, defaultApertureFStop: 4.0, defaultDutchRollDeg: 0,
    defaultElevationDeg: 2, defaultFocalLengthMm: 38, grammar: "medium-two-shot",
    labelKo: "미디엄 투샷", maxFocalLengthMm: 50, minFocalLengthMm: 32, shotScale: "medium", shotScaleRank: 2,
  },
  "dramatic-low-angle": {
    baseSubjectScreenHeightRatio: 0.64, defaultApertureFStop: 2.8, defaultDutchRollDeg: 0,
    defaultElevationDeg: -24, defaultFocalLengthMm: 28, grammar: "dramatic-low-angle",
    labelKo: "드라마틱 로우 앵글", maxFocalLengthMm: 38, minFocalLengthMm: 22, shotScale: "medium", shotScaleRank: 2,
  },
  "dutch-tension": {
    baseSubjectScreenHeightRatio: 0.58, defaultApertureFStop: 2.8, defaultDutchRollDeg: 14,
    defaultElevationDeg: -6, defaultFocalLengthMm: 32, grammar: "dutch-tension",
    labelKo: "더치 틸트 긴장 샷", maxFocalLengthMm: 45, minFocalLengthMm: 24, shotScale: "medium-closeup", shotScaleRank: 3,
  },
  "over-the-shoulder": {
    baseSubjectScreenHeightRatio: 0.56, defaultApertureFStop: 2.2, defaultDutchRollDeg: 0,
    defaultElevationDeg: 4, defaultFocalLengthMm: 55, grammar: "over-the-shoulder",
    labelKo: "오버 더 숄더(OTS)", maxFocalLengthMm: 75, minFocalLengthMm: 48, shotScale: "medium-closeup", shotScaleRank: 3,
  },
  "extreme-closeup": {
    baseSubjectScreenHeightRatio: 0.72, defaultApertureFStop: 1.8, defaultDutchRollDeg: 0,
    defaultElevationDeg: 0, defaultFocalLengthMm: 90, grammar: "extreme-closeup",
    labelKo: "익스트림 클로즈업", maxFocalLengthMm: 135, minFocalLengthMm: 82, shotScale: "extreme-closeup", shotScaleRank: 5,
  },
};

/** 3D 씬 내 서사 참여 인물 명세. */
export interface NarrativeParticipant {
  readonly gazeDirection?: Vec3;
  readonly heightMeters?: number;
  readonly id: string;
  readonly position: Vec3;
}

/** 샷 추천 분류기 입력 서사 비트. */
export interface NarrativeBeatInput {
  readonly actionVelocity?: Vec3;
  readonly aspectRatio?: number;
  readonly consecutiveSameShotCount?: number;
  readonly cutId: string;
  readonly cutImportance: number;
  readonly dialogueCharCount?: number;
  readonly dialogueCount?: number;
  readonly emotion: NarrativeEmotion;
  readonly emotionIntensity?: number;
  readonly isSceneOpening?: boolean;
  readonly isSpatialReveal?: boolean;
  readonly listener?: NarrativeParticipant | null;
  readonly previousShotGrammar?: NarrativeShotGrammar | null;
  readonly readingDirection?: "ltr" | "rtl";
  readonly sensorHeightMm?: number;
  readonly speaker: NarrativeParticipant;
}

/** 말풍선 배치용 네거티브 스페이스 추천 계획. */
export interface NegativeSpacePlan {
  readonly balloonSafeRect: NormalizedRect2D;
  readonly preferredZone: NegativeSpaceZone;
  readonly recommendedAreaRatio: number;
  readonly subjectAnchorHint: SubjectAnchorHint;
}

/** 개별 샷 문법 후보 채점 상세. */
export interface ShotGrammarCandidateScore {
  readonly grammar: NarrativeShotGrammar;
  readonly labelKo: string;
  readonly reasons: readonly string[];
  readonly score: number;
}

/** 카메라 화각(FOV) 산출 결과. */
export interface CameraFovDegrees {
  readonly diagonalFovDeg: number;
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
}

/** 서사 비트 샷 추천 최종 결과. */
export interface NarrativeShotPlan {
  readonly apertureFStop: number;
  readonly aspectRatio: number;
  readonly candidates: readonly ShotGrammarCandidateScore[];
  readonly confidence: number;
  readonly cutId: string;
  readonly diagonalFovDeg: number;
  readonly focalLengthMm: number;
  readonly horizontalFovDeg: number;
  readonly labelKo: string;
  readonly negativeSpace: NegativeSpacePlan;
  readonly rationaleKo: string;
  readonly recommendedDutchRollDeg: number;
  readonly recommendedElevationDeg: number;
  readonly sensorHeightMm: number;
  readonly shotGrammar: NarrativeShotGrammar;
  readonly shotScale: ShotScaleTier;
  readonly shotScaleRank: number;
  readonly verticalFovDeg: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const roundTo = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/** 초점거리(mm), 센서 높이(mm), 화면비로부터 수직·수평·대각 화각(도)을 해석적으로 계산한다. */
export function computeCameraFovDegrees(
  focalLengthMm: number,
  aspectRatio = 16 / 9,
  sensorHeightMm = DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM,
): CameraFovDegrees {
  const safeFocal = clamp(focalLengthMm, 10, 300);
  const safeAspect = clamp(aspectRatio, 0.35, 3.5);
  const safeSensorH = clamp(sensorHeightMm, 6, 70);
  const halfTanV = safeSensorH / (2 * safeFocal);
  const halfTanH = halfTanV * safeAspect;
  const halfTanD = Math.hypot(halfTanH, halfTanV);
  const radToDeg = 180 / Math.PI;
  return {
    diagonalFovDeg: roundTo(2 * Math.atan(halfTanD) * radToDeg, 3),
    horizontalFovDeg: roundTo(2 * Math.atan(halfTanH) * radToDeg, 3),
    verticalFovDeg: roundTo(2 * Math.atan(halfTanV) * radToDeg, 3),
  };
}

interface ScoreBucket { readonly reasons: string[]; score: number }
type ScoreMap = Record<NarrativeShotGrammar, ScoreBucket>;

function buildScoreMap(): ScoreMap {
  return {
    "birds-eye-reveal": { reasons: [], score: 0.14 },
    "dramatic-low-angle": { reasons: [], score: 0.16 },
    "dutch-tension": { reasons: [], score: 0.15 },
    "establishing-wide": { reasons: [], score: 0.18 },
    "extreme-closeup": { reasons: [], score: 0.16 },
    "medium-two-shot": { reasons: [], score: 0.18 },
    "over-the-shoulder": { reasons: [], score: 0.18 },
  };
}

function addScore(scores: ScoreMap, grammar: NarrativeShotGrammar, delta: number, reason: string): void {
  scores[grammar].score += delta;
  if (reason.length > 0) scores[grammar].reasons.push(reason);
}

function applyEmotionWeights(scores: ScoreMap, emotion: NarrativeEmotion, intensity: number, importance: number): void {
  const hi = intensity >= 0.72;
  switch (emotion) {
    case "calm":
      addScore(scores, "establishing-wide", 0.32, "차분한 정서 확립");
      addScore(scores, "medium-two-shot", 0.34, "안정적 대화 구도");
      addScore(scores, "over-the-shoulder", 0.16, "자연스러운 시선 교환");
      break;
    case "curious":
      addScore(scores, "medium-two-shot", 0.28, "탐색적 상호작용");
      addScore(scores, "over-the-shoulder", 0.32, "시선 유도 OTS");
      addScore(scores, "establishing-wide", 0.22, "상황 단서 제시");
      break;
    case "tender":
      addScore(scores, "over-the-shoulder", 0.3, "친밀한 대화 거리");
      addScore(scores, "medium-two-shot", 0.28, "두 인물 감정 교류");
      if (importance >= 0.78 && hi) addScore(scores, "extreme-closeup", 0.44, "섬세한 눈빛·표정 강조");
      break;
    case "determined":
      addScore(scores, "dramatic-low-angle", 0.36 + 0.18 * intensity, "결연한 위엄·주도권 강조");
      addScore(scores, "over-the-shoulder", 0.24, "대립 시선 정렬");
      if (importance >= 0.85 && hi) addScore(scores, "extreme-closeup", 0.3, "결의의 클로즈업");
      break;
    case "triumph":
      addScore(scores, "dramatic-low-angle", 0.46 + 0.22 * intensity, "영웅적 상승감 로우 앵글");
      addScore(scores, "establishing-wide", 0.24, "승리 공간 개방감");
      break;
    case "anger":
      addScore(scores, "dramatic-low-angle", 0.34 + 0.16 * intensity, "위압적 분노 구도");
      addScore(scores, "dutch-tension", 0.26 + 0.12 * intensity, "격앙된 긴장 기울기");
      if (importance >= 0.8 && hi) addScore(scores, "extreme-closeup", 0.44, "폭발 직전 표정 클로즈업");
      break;
    case "tense":
      addScore(scores, "dutch-tension", 0.44 + 0.26 * intensity, "불안정 긴장감 더치 틸트");
      addScore(scores, "over-the-shoulder", 0.24, "대치 대화 긴장");
      if (importance >= 0.82 && hi) addScore(scores, "extreme-closeup", 0.32, "긴박한 반응 포착");
      break;
    case "fear":
      addScore(scores, "dutch-tension", 0.48 + 0.24 * intensity, "공포·균형 상실 더치 틸트");
      addScore(scores, "birds-eye-reveal", 0.24, "고립·취약성 부각 부감");
      if (importance >= 0.82 && hi) addScore(scores, "extreme-closeup", 0.36, "동공·공포 표정 밀착");
      break;
    case "shock":
      addScore(scores, "extreme-closeup", 0.46 + 0.32 * intensity, "충격 순간 표정 극대화");
      addScore(scores, "dutch-tension", 0.34 + 0.14 * intensity, "심리적 흔들림 기울기");
      break;
    case "despair":
      addScore(scores, "birds-eye-reveal", 0.4 + 0.22 * intensity, "압도적 고립감 조감 시점");
      if (importance >= 0.82 && hi) addScore(scores, "extreme-closeup", 0.46, "절망적 정서 밀착 클로즈업");
      break;
    case "mystery":
      addScore(scores, "birds-eye-reveal", 0.44 + 0.18 * intensity, "공간 단서 조감 리빌");
      addScore(scores, "establishing-wide", 0.3, "미스터리 공간 분위기 확립");
      addScore(scores, "dutch-tension", 0.22, "기묘한 불균형 암시");
      break;
    case "action":
      addScore(scores, "dramatic-low-angle", 0.42 + 0.2 * intensity, "역동적 도약·타격 로우 앵글");
      addScore(scores, "dutch-tension", 0.34 + 0.16 * intensity, "동적 속도감 기울기");
      break;
  }
}

function applySpatialAndKineticWeights(
  scores: ScoreMap,
  input: NarrativeBeatInput,
  importance: number,
  intensity: number,
): { readonly actionSpeedMps: number; readonly participantDistanceMeters: number | null } {
  const listener = input.listener ?? null;
  const sp = input.speaker.position;
  const participantDistanceMeters = listener
    ? Math.hypot(sp.x - listener.position.x, sp.y - listener.position.y, sp.z - listener.position.z)
    : null;
  const vel = input.actionVelocity ?? { x: 0, y: 0, z: 0 };
  const actionSpeedMps = Math.hypot(vel.x, vel.y, vel.z);
  const dialogueChars = Math.max(0, input.dialogueCharCount ?? 0);

  if (input.isSceneOpening) {
    addScore(scores, "establishing-wide", 0.68, "장면 도입 공간 확립");
    if (input.isSpatialReveal) addScore(scores, "birds-eye-reveal", 0.45, "도입부 조감 공간 전개");
  }
  if (input.isSpatialReveal) addScore(scores, "birds-eye-reveal", 0.72, "공간 배치·동선 조감 리빌");

  if (listener && participantDistanceMeters !== null) {
    if (participantDistanceMeters >= 7.0) {
      addScore(scores, "birds-eye-reveal", 0.32, "광범위 인물 거리 조감 파악");
      addScore(scores, "establishing-wide", 0.38, "원거리 대치 공간 확립");
    } else if (participantDistanceMeters >= 4.2) {
      addScore(scores, "establishing-wide", 0.24, "넓은 거리감 확보");
      addScore(scores, "medium-two-shot", 0.26, "중원거리 투샷 배치");
    } else if (participantDistanceMeters >= 0.75) {
      addScore(scores, "medium-two-shot", 0.3, "대화 가능 2인 거리");
      addScore(scores, "over-the-shoulder", 0.34, "대화 시선 교환 OTS 적정 거리");
      if (dialogueChars >= 12) addScore(scores, "over-the-shoulder", 0.18, "대사 중심 화자 포커스");
    } else {
      addScore(scores, "extreme-closeup", 0.26, "초근접 대면 밀착 구도");
      addScore(scores, "over-the-shoulder", 0.16, "근거리 어깨너머 구도");
    }
    const heightDiff = sp.y - listener.position.y;
    if (heightDiff >= 0.35) addScore(scores, "dramatic-low-angle", 0.28, "화자 고지대 우위 강조");
    else if (heightDiff <= -0.35) addScore(scores, "birds-eye-reveal", 0.22, "내려다보는 압박 시점");
  } else {
    addScore(scores, "medium-two-shot", -0.36, "");
    addScore(scores, "over-the-shoulder", -0.38, "");
    if (importance < 0.45 && actionSpeedMps < 1.2 && !input.isSpatialReveal) {
      addScore(scores, "establishing-wide", 0.28, "단독 저강도 환경 묘사");
    }
  }

  if (actionSpeedMps >= 3.0) {
    addScore(scores, "dramatic-low-angle", 0.32, "고속 액션 로우 앵글 역동성");
    addScore(scores, "dutch-tension", 0.26, "고속 이동 긴장 기울기");
    addScore(scores, "extreme-closeup", -0.22, "");
    if (vel.y <= -2.0) addScore(scores, "birds-eye-reveal", 0.34, "수직 낙하·강하 조감 강조");
  } else if (actionSpeedMps < 1.2 && importance >= 0.8 && intensity >= 0.75) {
    addScore(scores, "extreme-closeup", 0.34, "정지된 핵심 감정 비트 클로즈업");
  }

  if (importance >= 0.85) {
    addScore(scores, "extreme-closeup", 0.16, "클라이맥스 고중요도 집중");
    addScore(scores, "dramatic-low-angle", 0.14, "핵심 컷 극적 앵글");
    addScore(scores, "establishing-wide", -0.18, "");
  } else if (importance <= 0.3) {
    addScore(scores, "establishing-wide", 0.18, "전환·호흡 조절용 와이드");
    addScore(scores, "extreme-closeup", -0.24, "");
  }

  return { actionSpeedMps, participantDistanceMeters };
}

function applyContinuityRhythmWeights(scores: ScoreMap, input: NarrativeBeatInput, importance: number): void {
  const prev = input.previousShotGrammar ?? null;
  if (!prev) {
    if (importance <= 0.65 && !input.isSpatialReveal) addScore(scores, "establishing-wide", 0.18, "시퀀스 첫 컷 공간 도입");
    return;
  }
  const repeatCount = Math.max(1, input.consecutiveSameShotCount ?? 1);
  addScore(scores, prev, -(0.24 + 0.14 * Math.max(0, repeatCount - 1)), "");

  if (prev === "establishing-wide") {
    addScore(scores, "medium-two-shot", 0.16, "전경 확립 후 인물 관계 진입");
    addScore(scores, "over-the-shoulder", 0.1, "전경에서 대화 컷 전환");
  } else if (prev === "medium-two-shot") {
    addScore(scores, "over-the-shoulder", 0.18, "투샷에서 OTS 대화 심화");
    if (importance >= 0.75) addScore(scores, "extreme-closeup", 0.14, "투샷에서 핵심 표정 컷인");
  } else if (prev === "over-the-shoulder") {
    if (importance >= 0.75) addScore(scores, "extreme-closeup", 0.16, "OTS에서 감정 클라이맥스 컷인");
    else addScore(scores, "medium-two-shot", 0.12, "OTS 후 공간 관계 재확인");
  } else if (prev === "dutch-tension") {
    addScore(scores, "dramatic-low-angle", 0.1, "긴장 고조 후 극적 행동 전개");
    addScore(scores, "extreme-closeup", 0.1, "긴장 후 충격 반응 포착");
  } else if (prev === "extreme-closeup") {
    addScore(scores, "medium-two-shot", 0.14, "클로즈업 후 시야 호흡 완화");
    addScore(scores, "establishing-wide", 0.1, "클로즈업 후 공간 재배치");
  }
}

function computeNegativeSpacePlan(
  input: NarrativeBeatInput,
  grammar: NarrativeShotGrammar,
  aspectRatio: number,
): NegativeSpacePlan {
  const charCount = Math.max(0, input.dialogueCharCount ?? 0);
  const balloonCount = Math.max(0, input.dialogueCount ?? (charCount > 0 ? 1 : 0));
  const readingDir = input.readingDirection ?? "ltr";
  const baseRatio =
    grammar === "establishing-wide" || grammar === "birds-eye-reveal" ? 0.24 : grammar === "extreme-closeup" ? 0.15 : 0.2;
  const textPressure = clamp(charCount / 140, 0, 1) * 0.11 + clamp(balloonCount - 1, 0, 3) * 0.025;
  const recommendedAreaRatio = roundTo(clamp(baseRatio + textPressure, 0.12, 0.36), 3);
  const gazeX = input.speaker.gazeDirection?.x ?? (readingDir === "ltr" ? 1 : -1);

  if (aspectRatio < 0.92 || balloonCount >= 2) {
    const bandHeight = roundTo(clamp(recommendedAreaRatio * 1.15, 0.18, 0.34), 3);
    return {
      balloonSafeRect: { height: bandHeight, width: 0.84, x: 0.08, y: 0.05 },
      preferredZone: "upper-band",
      recommendedAreaRatio,
      subjectAnchorHint: "center-lower",
    };
  }
  const placeRight = gazeX >= 0.1 || (Math.abs(gazeX) < 0.1 && readingDir === "rtl");
  const width = roundTo(clamp(Math.sqrt(recommendedAreaRatio * 1.35), 0.28, 0.46), 3);
  const height = roundTo(clamp(recommendedAreaRatio / width, 0.22, 0.38), 3);
  return {
    balloonSafeRect: { height, width, x: placeRight ? roundTo(0.95 - width, 3) : 0.05, y: 0.06 },
    preferredZone: placeRight ? "top-right" : "top-left",
    recommendedAreaRatio,
    subjectAnchorHint: placeRight ? "left-third" : "right-third",
  };
}

/**
 * 서사 비트 입력을 해석해 최적의 샷 문법, 추천 초점거리·FOV, 더치/앙각 및
 * 말풍선 네거티브 스페이스 계획을 결정론적으로 산출한다.
 */
export function recommendNarrativeShotPlan(input: NarrativeBeatInput): NarrativeShotPlan {
  const importance = clamp(input.cutImportance, 0, 1);
  const intensity = clamp(input.emotionIntensity ?? 0.65, 0, 1);
  const aspectRatio = clamp(input.aspectRatio ?? 16 / 9, 0.35, 3.5);
  const sensorHeightMm = clamp(input.sensorHeightMm ?? DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM, 6, 70);

  const scores = buildScoreMap();
  applyEmotionWeights(scores, input.emotion, intensity, importance);
  const { actionSpeedMps, participantDistanceMeters } = applySpatialAndKineticWeights(
    scores, input, importance, intensity,
  );
  applyContinuityRhythmWeights(scores, input, importance);

  const candidates: ShotGrammarCandidateScore[] = NARRATIVE_SHOT_GRAMMARS.map((grammar) => ({
    grammar,
    labelKo: SHOT_GRAMMAR_PRESETS[grammar].labelKo,
    reasons: scores[grammar].reasons,
    score: roundTo(scores[grammar].score, 4),
  })).sort((a, b) =>
    b.score !== a.score ? b.score - a.score : NARRATIVE_SHOT_GRAMMARS.indexOf(a.grammar) - NARRATIVE_SHOT_GRAMMARS.indexOf(b.grammar),
  );

  const best = candidates[0];
  const preset = SHOT_GRAMMAR_PRESETS[best.grammar];
  let focalLengthMm =
    preset.defaultFocalLengthMm +
    (importance - 0.5) * (preset.maxFocalLengthMm - preset.minFocalLengthMm) * 0.28 +
    (intensity - 0.5) * (preset.maxFocalLengthMm - preset.minFocalLengthMm) * 0.16;
  if (actionSpeedMps >= 3.5 && best.grammar !== "extreme-closeup") focalLengthMm -= 4;
  if (participantDistanceMeters !== null && participantDistanceMeters > 5.5) focalLengthMm -= 3;
  focalLengthMm = roundTo(clamp(focalLengthMm, preset.minFocalLengthMm, preset.maxFocalLengthMm), 1);

  const fov = computeCameraFovDegrees(focalLengthMm, aspectRatio, sensorHeightMm);
  let recommendedDutchRollDeg = preset.defaultDutchRollDeg;
  if (best.grammar === "dutch-tension") {
    const dirSign = (input.actionVelocity?.x ?? input.speaker.gazeDirection?.x ?? 1) >= 0 ? 1 : -1;
    recommendedDutchRollDeg = roundTo(dirSign * clamp(8 + intensity * 12, 6, CLASSIFIER_MAX_DUTCH_ROLL_DEG), 2);
  }
  let recommendedElevationDeg = preset.defaultElevationDeg;
  if (best.grammar === "dramatic-low-angle") recommendedElevationDeg = roundTo(clamp(-16 - intensity * 14, -34, -12), 2);
  else if (best.grammar === "birds-eye-reveal") recommendedElevationDeg = roundTo(clamp(56 + importance * 18, 52, 78), 2);

  const margin = Math.max(0, best.score - candidates[1].score);
  const confidence = roundTo(clamp(0.5 + Math.tanh(margin * 2.2) * 0.48, 0.5, 0.98), 3);
  const negativeSpace = computeNegativeSpacePlan(input, best.grammar, aspectRatio);
  const primaryReasons = best.reasons.slice(0, 3);
  const rationaleKo =
    primaryReasons.length > 0
      ? `${preset.labelKo} 선택: ${primaryReasons.join(", ")} (초점거리 ${focalLengthMm}mm, 수직 화각 ${fov.verticalFovDeg}°).`
      : `${preset.labelKo} 기본 서사 구도 적용 (초점거리 ${focalLengthMm}mm, 수직 화각 ${fov.verticalFovDeg}°).`;

  return {
    apertureFStop: preset.defaultApertureFStop, aspectRatio: roundTo(aspectRatio, 4), candidates, confidence,
    cutId: input.cutId, diagonalFovDeg: fov.diagonalFovDeg, focalLengthMm, horizontalFovDeg: fov.horizontalFovDeg,
    labelKo: preset.labelKo, negativeSpace, rationaleKo, recommendedDutchRollDeg, recommendedElevationDeg,
    sensorHeightMm, shotGrammar: best.grammar, shotScale: preset.shotScale, shotScaleRank: preset.shotScaleRank,
    verticalFovDeg: fov.verticalFovDeg,
  };
}
