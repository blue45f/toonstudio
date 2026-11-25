/**
 * Wave 48B — 시선 동선·180° 법칙·카메라 앵글 리프레이밍 어드바이저 순수 결정론 엔진.
 *
 * - 직전 컷 상태(피사체 위치·시선 방향·샷 스케일·카메라 방위각)와 현재 컷 의도(대사 긴장도·화자 수·대사)를 분석한다.
 * - 180° 법칙(Action Axis) 월선 감지 엔진(`auditCameraContinuity`)으로 반구 월선·중립축 접근·좌우 반전·시선 충돌을 판정한다.
 * - 6대 카메라 구도 중 180° 법칙을 유지하며 대사 긴장도에 가장 잘 맞는 Top-3 비파괴 고스트 가이드를 제안한다.
 * - 비파괴 미리보기·적용·되돌리기 상태 머신과 카메라 릭 JSON 내보내기를 제공한다.
 */

export type SubjectScreenSide = "left" | "center" | "right";
export type GazeDirection = "left-to-right" | "right-to-left" | "camera" | "down";
export type ShotScale = "wide" | "medium" | "closeup" | "extreme-closeup";
export type DialogueTension = "calm" | "confrontation" | "reveal" | "impact" | "intimacy";
export type SpeakerCount = 1 | 2;
export type ContinuityStatus = "safe" | "warning" | "axis-crossed";
export type ActionAxisHemisphere = "front" | "back" | "neutral";
export type CameraCoachSessionStatus = "idle" | "previewing" | "applied" | "reverted";
export type CameraFramingType =
  | "low-angle-closeup" | "over-the-shoulder" | "dutch-tilt"
  | "high-angle-wide" | "rule-of-thirds-eye" | "eyeline-insert";
export type CameraCoachScenePresetId =
  | "dialogue-standoff" | "shock-reveal" | "chase-corner" | "confession-closeup" | "crowd-wide";

export interface PreviousCutCameraState {
  readonly prevSubjectSide: SubjectScreenSide;
  readonly prevGazeDirection: GazeDirection;
  readonly prevShotScale: ShotScale;
  readonly prevCameraYawDeg: number;
}

export interface CurrentCutDialogueIntent {
  readonly dialogueTension: DialogueTension;
  readonly speakerCount: SpeakerCount;
  readonly dialogueText: string;
}

export interface CameraFramingCoachInput extends PreviousCutCameraState, CurrentCutDialogueIntent {}

export interface CameraContinuityAuditInput extends PreviousCutCameraState {
  readonly nextSubjectSide: SubjectScreenSide;
  readonly nextGazeDirection: GazeDirection;
  readonly nextShotScale?: ShotScale;
  readonly nextCameraYawDeg: number;
  readonly speakerCount?: SpeakerCount;
  readonly isSameSubjectFocus?: boolean;
}

export interface CameraContinuityAuditReport {
  readonly status: ContinuityStatus;
  readonly prevYawDeg: number; readonly nextYawDeg: number;
  readonly yawDeltaDeg: number; readonly absYawDeltaDeg: number;
  readonly prevHemisphere: ActionAxisHemisphere; readonly nextHemisphere: ActionAxisHemisphere;
  readonly hemisphereCrossed: boolean; readonly onNeutralAxis: boolean;
  readonly subjectSideFlipped: boolean; readonly eyelineMatched: boolean;
  readonly scaleJumpSteps: number; readonly recommendedSafeYawDeg: number;
  readonly reasonKo: string; readonly reasonEn: string;
  readonly correctionHintKo: string; readonly correctionHintEn: string;
}

export interface CameraRigPose {
  readonly focalLengthMm: number; readonly yawDeg: number;
  readonly pitchDeg: number; readonly rollDeg: number;
}

export interface SubjectAnchorPoint {
  readonly id: string;
  readonly role: "primary" | "secondary" | "foreground-shoulder";
  readonly x: number; readonly y: number;
  readonly headRadiusNorm: number; readonly silhouetteScale: number;
  readonly labelKo: string; readonly labelEn: string;
}

export interface GazeArrowVector {
  readonly fromX: number; readonly fromY: number;
  readonly toX: number; readonly toY: number;
  readonly angleDeg: number;
}

export interface ThirdsIntersectionPoint {
  readonly col: "left-third" | "right-third";
  readonly row: "upper-third" | "lower-third";
  readonly x: number; readonly y: number;
}

export interface CameraFramingProposal {
  readonly id: string; readonly framingType: CameraFramingType;
  readonly rank: 1 | 2 | 3; readonly score: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly badgeKo: string; readonly badgeEn: string;
  readonly rationaleKo: string; readonly rationaleEn: string;
  readonly shotScale: ShotScale; readonly focalLengthMm: number;
  readonly cameraRig: CameraRigPose;
  readonly subjectSide: SubjectScreenSide; readonly gazeDirection: GazeDirection;
  readonly subjectAnchors: readonly SubjectAnchorPoint[];
  readonly gazeVector: GazeArrowVector;
  readonly thirdsIntersection: ThirdsIntersectionPoint;
  readonly continuityAudit: CameraContinuityAuditReport;
}

export interface CameraCoachScenePreset {
  readonly id: CameraCoachScenePresetId;
  readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly input: CameraFramingCoachInput;
}

export interface CameraCutSnapshot {
  readonly labelKo: string; readonly labelEn: string;
  readonly framingType: CameraFramingType | "original";
  readonly shotScale: ShotScale;
  readonly subjectSide: SubjectScreenSide; readonly gazeDirection: GazeDirection;
  readonly rig: CameraRigPose; readonly appliedProposalId: string | null;
}

export interface CameraCoachSessionState {
  readonly status: CameraCoachSessionStatus;
  readonly original: CameraCutSnapshot; readonly current: CameraCutSnapshot;
  readonly previewingProposalId: string | null; readonly appliedProposalId: string | null;
  readonly rigOverrides: Partial<CameraRigPose>;
  readonly simulateAxisCross: boolean; readonly historyCount: number;
}

export interface ResolvedCameraCoachView {
  readonly source: "preview" | "applied" | "original" | "recommended";
  readonly labelKo: string; readonly labelEn: string;
  readonly framingType: CameraFramingType | "original"; readonly shotScale: ShotScale;
  readonly subjectSide: SubjectScreenSide; readonly gazeDirection: GazeDirection;
  readonly rig: CameraRigPose;
  readonly subjectAnchors: readonly SubjectAnchorPoint[];
  readonly gazeVector: GazeArrowVector;
  readonly thirdsIntersection: ThirdsIntersectionPoint;
  readonly continuityAudit: CameraContinuityAuditReport;
  readonly activeProposalId: string | null;
}

export interface CameraRigExportPayload {
  readonly sceneId: CameraCoachScenePresetId | string;
  readonly input: CameraFramingCoachInput;
  readonly session: CameraCoachSessionState;
  readonly activeView: ResolvedCameraCoachView;
  readonly top3: readonly CameraFramingProposal[];
}

export const FOCAL_LENGTH_MIN_MM = 24;
export const FOCAL_LENGTH_MAX_MM = 135;
export const PITCH_MIN_DEG = -35;
export const PITCH_MAX_DEG = 35;
export const ROLL_MIN_DEG = -25;
export const ROLL_MAX_DEG = 25;
const NEUTRAL_AXIS_MARGIN_DEG = 12;

export const DIALOGUE_TENSION_OPTIONS: readonly { readonly id: DialogueTension; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "calm", labelKo: "차분", labelEn: "Calm" },
  { id: "confrontation", labelKo: "대립", labelEn: "Confrontation" },
  { id: "reveal", labelKo: "반전", labelEn: "Reveal" },
  { id: "impact", labelKo: "임팩트", labelEn: "Impact" },
  { id: "intimacy", labelKo: "친밀", labelEn: "Intimacy" },
];

export const SUBJECT_SIDE_OPTIONS: readonly { readonly id: SubjectScreenSide; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "left", labelKo: "화면 좌측", labelEn: "Screen Left" },
  { id: "center", labelKo: "중앙", labelEn: "Center" },
  { id: "right", labelKo: "화면 우측", labelEn: "Screen Right" },
];

export const GAZE_DIRECTION_OPTIONS: readonly { readonly id: GazeDirection; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "left-to-right", labelKo: "좌→우", labelEn: "Left to Right" },
  { id: "right-to-left", labelKo: "우→좌", labelEn: "Right to Left" },
  { id: "camera", labelKo: "정면 응시", labelEn: "To Camera" },
  { id: "down", labelKo: "아래 시선", labelEn: "Downward" },
];

export const SHOT_SCALE_OPTIONS: readonly { readonly id: ShotScale; readonly labelKo: string; readonly labelEn: string; readonly order: number }[] = [
  { id: "wide", labelKo: "원경(WS)", labelEn: "Wide", order: 0 },
  { id: "medium", labelKo: "미디엄(MS)", labelEn: "Medium", order: 1 },
  { id: "closeup", labelKo: "클로즈업(CU)", labelEn: "Close-Up", order: 2 },
  { id: "extreme-closeup", labelKo: "익스트림(ECU)", labelEn: "Extreme CU", order: 3 },
];

export const CAMERA_COACH_SCENE_PRESETS: readonly CameraCoachScenePreset[] = [
  {
    id: "dialogue-standoff", labelKo: "대화 맞대응", labelEn: "Dialogue Standoff",
    summaryKo: "두 인물이 180° 축선을 사이에 두고 팽팽히 맞서는 대면 컷",
    summaryEn: "Two characters facing off across a locked 180° action axis",
    input: {
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 52,
      dialogueTension: "confrontation", speakerCount: 2, dialogueText: "네가 먼저 약속을 깼잖아. 이제 와서 돌아오라고?",
    },
  },
  {
    id: "shock-reveal", labelKo: "충격 반전", labelEn: "Shock Reveal",
    summaryKo: "숨겨진 정체가 드러나는 순간, 시선과 지평선 기울기로 긴장을 증폭",
    summaryEn: "Sudden truth reveal amplified by Dutch roll and tight eyeline focus",
    input: {
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 68,
      dialogueTension: "reveal", speakerCount: 1, dialogueText: "설마?! 방금 지나간 사람이 사라진 형이었다고?!",
    },
  },
  {
    id: "chase-corner", labelKo: "추격 코너", labelEn: "Chase Corner",
    summaryKo: "우→좌 진행 방향을 유지하며 좁은 골목 추격의 압박감을 살리는 컷",
    summaryEn: "Preserving right-to-left screen momentum around a tight alley corner",
    input: {
      prevSubjectSide: "right", prevGazeDirection: "right-to-left", prevShotScale: "wide", prevCameraYawDeg: 118,
      dialogueTension: "impact", speakerCount: 1, dialogueText: "골목 끝 막다른 길이다! 지금 코너를 꺾어야 따돌릴 수 있어!!",
    },
  },
  {
    id: "confession-closeup", labelKo: "고백 클로즈업", labelEn: "Confession Close-Up",
    summaryKo: "시선 높이를 부드럽게 연결해 감정의 거리를 좁히는 친밀 컷",
    summaryEn: "Intimate eyeline bridge closing emotional distance between two speakers",
    input: {
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 44,
      dialogueTension: "intimacy", speakerCount: 2, dialogueText: "사실 오래전부터 말하고 싶었어... 네 눈을 보면 숨길 수가 없어.",
    },
  },
  {
    id: "crowd-wide", labelKo: "군중 원경", labelEn: "Crowd Wide",
    summaryKo: "클로즈업 직후 공간 좌표를 환기하는 하이앵글 군중 설정 컷",
    summaryEn: "High-angle establishing shot opening spatial geography after a tight cut",
    input: {
      prevSubjectSide: "center", prevGazeDirection: "camera", prevShotScale: "closeup", prevCameraYawDeg: 88,
      dialogueTension: "calm", speakerCount: 1, dialogueText: "광장을 가득 메운 인파 사이로 새벽 안개가 천천히 걷히고 있었다.",
    },
  },
];

interface FramingCatalogEntry {
  readonly framingType: CameraFramingType;
  readonly titleKo: string; readonly titleEn: string;
  readonly badgeKo: string; readonly badgeEn: string;
  readonly shotScale: ShotScale;
  readonly defaultFocalMm: number; readonly defaultPitchDeg: number;
  readonly defaultRollDeg: number; readonly targetYawOffsetDeg: number;
  readonly tensionWeights: Readonly<Record<DialogueTension, number>>;
  readonly prefersTwoSpeakers: number; readonly prefersSoloSpeaker: number;
  readonly rationaleBaseKo: string; readonly rationaleBaseEn: string;
}

const FRAMING_CATALOG: readonly FramingCatalogEntry[] = [
  {
    framingType: "low-angle-closeup", titleKo: "로앵글 클로즈업", titleEn: "Low-Angle Close-Up",
    badgeKo: "압도·긴박", badgeEn: "Dominance", shotScale: "closeup",
    defaultFocalMm: 85, defaultPitchDeg: -16, defaultRollDeg: 0, targetYawOffsetDeg: 34,
    tensionWeights: { calm: 46, confrontation: 84, reveal: 76, impact: 92, intimacy: 58 },
    prefersTwoSpeakers: 2, prefersSoloSpeaker: 9,
    rationaleBaseKo: "낮은 앙각(-16°)과 85mm 망원 압축으로 인물의 위압감과 대사 타격감을 끌어올립니다.",
    rationaleBaseEn: "Low -16° upward tilt with 85mm compression magnifies authority and punch.",
  },
  {
    framingType: "over-the-shoulder", titleKo: "오버더숄더 (OTS)", titleEn: "Over-the-Shoulder",
    badgeKo: "2인 시선축", badgeEn: "2-Shot Axis", shotScale: "medium",
    defaultFocalMm: 65, defaultPitchDeg: -2, defaultRollDeg: 0, targetYawOffsetDeg: 48,
    tensionWeights: { calm: 68, confrontation: 91, reveal: 58, impact: 54, intimacy: 80 },
    prefersTwoSpeakers: 18, prefersSoloSpeaker: -22,
    rationaleBaseKo: "전경 어깨 실루엣을 축선 기준점으로 걸어 두 인물의 거리감과 180° 방향을 단단히 묶습니다.",
    rationaleBaseEn: "Anchors a foreground shoulder along the action axis to lock 2-speaker geography.",
  },
  {
    framingType: "dutch-tilt", titleKo: "더치 앵글", titleEn: "Dutch Tilt",
    badgeKo: "불안·반전", badgeEn: "Unrest", shotScale: "medium",
    defaultFocalMm: 35, defaultPitchDeg: -8, defaultRollDeg: 14, targetYawOffsetDeg: 40,
    tensionWeights: { calm: 32, confrontation: 75, reveal: 92, impact: 88, intimacy: 40 },
    prefersTwoSpeakers: -2, prefersSoloSpeaker: 7,
    rationaleBaseKo: "35mm 광각에 14° 롤 기울기를 더해 지평선을 흔들고 반전·추격의 불안감을 즉시 전달합니다.",
    rationaleBaseEn: "35mm wide glass paired with a 14° Dutch roll destabilizes the horizon on impact.",
  },
  {
    framingType: "high-angle-wide", titleKo: "하이앵글 원경", titleEn: "High-Angle Wide",
    badgeKo: "공간·환기", badgeEn: "Establishing", shotScale: "wide",
    defaultFocalMm: 28, defaultPitchDeg: 22, defaultRollDeg: 0, targetYawOffsetDeg: 32,
    tensionWeights: { calm: 83, confrontation: 52, reveal: 56, impact: 68, intimacy: 42 },
    prefersTwoSpeakers: 0, prefersSoloSpeaker: 6,
    rationaleBaseKo: "28mm 광각 부감(+22°)으로 인물과 주변 공간 배치를 한눈에 정리해 호흡을 환기합니다.",
    rationaleBaseEn: "28mm high-angle view (+22°) clarifies spatial context and opens visual breathing room.",
  },
  {
    framingType: "rule-of-thirds-eye", titleKo: "3분할 아이레벨", titleEn: "Rule-of-Thirds Eye-Level",
    badgeKo: "표준·균형", badgeEn: "Balanced", shotScale: "medium",
    defaultFocalMm: 50, defaultPitchDeg: 0, defaultRollDeg: 0, targetYawOffsetDeg: 36,
    tensionWeights: { calm: 90, confrontation: 66, reveal: 60, impact: 50, intimacy: 84 },
    prefersTwoSpeakers: 4, prefersSoloSpeaker: 6,
    rationaleBaseKo: "50mm 표준 화각과 눈높이 수평으로 시선 여백(Lead Room)을 확보해 자연스러운 대화를 이어갑니다.",
    rationaleBaseEn: "50mm eye-level framing reserves natural lead room along the rule-of-thirds line.",
  },
  {
    framingType: "eyeline-insert", titleKo: "인서트 시선 연결", titleEn: "Eyeline Insert",
    badgeKo: "시선 집중", badgeEn: "Eyeline Cut", shotScale: "extreme-closeup",
    defaultFocalMm: 105, defaultPitchDeg: 3, defaultRollDeg: 0, targetYawOffsetDeg: 28,
    tensionWeights: { calm: 60, confrontation: 72, reveal: 84, impact: 70, intimacy: 92 },
    prefersTwoSpeakers: 6, prefersSoloSpeaker: 5,
    rationaleBaseKo: "105mm 준망원으로 눈빛과 미세한 표정선을 당겨 직전 컷 시선 동선을 감정선으로 연결합니다.",
    rationaleBaseEn: "105mm telephoto tight framing bridges the prior gaze directly into emotional nuance.",
  },
];

export const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 임의의 각도를 (-180, 180] 범위로 정규화한다. */
export function normalizeYawDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let normalized = (((deg + 180) % 360) + 360) % 360 - 180;
  if (normalized <= -180) normalized += 360;
  return round1(Object.is(normalized, -0) ? 0 : normalized);
}

/** 두 방위각 사이의 최단 부호 각도차 (-180, 180]를 반환한다. */
export const shortestYawDeltaDeg = (fromDeg: number, toDeg: number): number =>
  normalizeYawDeg(normalizeYawDeg(toDeg) - normalizeYawDeg(fromDeg));

/** 0°–180° 액션 축선을 기준으로 카메라가 위치한 반구를 판정한다. */
export function classifyActionHemisphere(yawDeg: number): ActionAxisHemisphere {
  const norm = normalizeYawDeg(yawDeg);
  const abs = Math.abs(norm);
  if (abs <= NEUTRAL_AXIS_MARGIN_DEG || Math.abs(180 - abs) <= NEUTRAL_AXIS_MARGIN_DEG) return "neutral";
  return norm > 0 ? "front" : "back";
}

/** 180° 액션 축선 반대편 반구로 방위각을 대칭 반전한다(월선 시뮬레이션·자동 보정 겸용). */
export function mirrorYawAcrossActionAxis(yawDeg: number): number {
  const norm = normalizeYawDeg(yawDeg);
  const abs = Math.abs(norm);
  if (abs < 20) return norm >= 0 ? -55 : 55;
  if (abs > 160) return norm >= 0 ? -125 : 125;
  return normalizeYawDeg(-norm);
}

const getShotScaleOrder = (scale: ShotScale): number => SHOT_SCALE_OPTIONS.find((item) => item.id === scale)?.order ?? 1;
const isHorizontalGaze = (gaze: GazeDirection): boolean => gaze === "left-to-right" || gaze === "right-to-left";
const flipScreenSide = (side: SubjectScreenSide): SubjectScreenSide => (side === "left" ? "right" : side === "right" ? "left" : "center");
const flipHorizontalGaze = (gaze: GazeDirection): GazeDirection =>
  gaze === "left-to-right" ? "right-to-left" : gaze === "right-to-left" ? "left-to-right" : gaze;
const formatSignedAngle = (deg: number): string => `${Math.round(deg) > 0 ? "+" : ""}${Math.round(deg)}°`;

function computeRecommendedSafeYaw(prevYaw: number, nextYaw: number, prevHemisphere: ActionAxisHemisphere): number {
  const preferredSign = prevHemisphere === "back" ? -1 : 1;
  const candidateAbs = clampNumber(Math.abs(nextYaw), 32, 148);
  const mirrored = normalizeYawDeg(preferredSign * candidateAbs);
  if (Math.abs(shortestYawDeltaDeg(prevYaw, mirrored)) < 18) {
    const nudgedAbs = candidateAbs <= 90 ? candidateAbs + 28 : candidateAbs - 28;
    return normalizeYawDeg(preferredSign * clampNumber(nudgedAbs, 28, 152));
  }
  return mirrored;
}

/** 180° 법칙(Action Axis) 월선 감지 엔진. 방위각 차이·반구 월선·좌우 반전·시선 정합성을 판정한다. */
export function auditCameraContinuity(input: CameraContinuityAuditInput): CameraContinuityAuditReport {
  const prevYawDeg = normalizeYawDeg(input.prevCameraYawDeg);
  const nextYawDeg = normalizeYawDeg(input.nextCameraYawDeg);
  const yawDeltaDeg = shortestYawDeltaDeg(prevYawDeg, nextYawDeg);
  const absYawDeltaDeg = round1(Math.abs(yawDeltaDeg));

  const prevHemisphere = classifyActionHemisphere(prevYawDeg);
  const nextHemisphere = classifyActionHemisphere(nextYawDeg);
  const hemisphereCrossed =
    (prevHemisphere === "front" && nextHemisphere === "back") ||
    (prevHemisphere === "back" && nextHemisphere === "front");
  const onNeutralAxis = nextHemisphere === "neutral";

  const speakerCount: SpeakerCount = input.speakerCount ?? 1;
  const sameSubject = input.isSameSubjectFocus ?? speakerCount === 1;
  const subjectSideFlipped =
    (input.prevSubjectSide === "left" && input.nextSubjectSide === "right") ||
    (input.prevSubjectSide === "right" && input.nextSubjectSide === "left");
  const sameHorizontalGaze = isHorizontalGaze(input.prevGazeDirection) && input.prevGazeDirection === input.nextGazeDirection;
  const oppositeHorizontalGaze =
    isHorizontalGaze(input.prevGazeDirection) &&
    isHorizontalGaze(input.nextGazeDirection) &&
    input.prevGazeDirection !== input.nextGazeDirection;

  const scaleJumpSteps = Math.abs(getShotScaleOrder(input.prevShotScale) - getShotScaleOrder(input.nextShotScale ?? input.prevShotScale));
  const twoSpeakerReverseMatched = !sameSubject && !hemisphereCrossed && subjectSideFlipped && oppositeHorizontalGaze;
  const eyelineMatched = hemisphereCrossed
    ? false
    : sameSubject
      ? !subjectSideFlipped && !oppositeHorizontalGaze
      : twoSpeakerReverseMatched || input.nextGazeDirection === "camera" || input.prevGazeDirection === "camera" ||
        input.nextGazeDirection === "down" || (!subjectSideFlipped && sameHorizontalGaze);

  const recommendedSafeYawDeg = computeRecommendedSafeYaw(prevYawDeg, nextYawDeg, prevHemisphere);
  const baseMetrics = {
    prevYawDeg, nextYawDeg, yawDeltaDeg, absYawDeltaDeg, prevHemisphere, nextHemisphere,
    hemisphereCrossed, onNeutralAxis, subjectSideFlipped, scaleJumpSteps, recommendedSafeYawDeg,
  };

  const singleSubjectHardFlip = sameSubject && subjectSideFlipped && (oppositeHorizontalGaze || absYawDeltaDeg >= 90);
  const twoSpeakerBrokenFlip = !sameSubject && subjectSideFlipped && sameHorizontalGaze;
  if (hemisphereCrossed || singleSubjectHardFlip || twoSpeakerBrokenFlip) {
    return {
      ...baseMetrics, status: "axis-crossed", eyelineMatched: false,
      reasonKo: hemisphereCrossed
        ? `카메라가 180° 액션 축선을 넘어 반대편 반구(${formatSignedAngle(nextYawDeg)})로 이동해 화면 좌우 방향이 뒤집혔습니다.`
        : singleSubjectHardFlip
          ? "단일 피사체의 화면 좌우 위치와 시선 축이 직전 컷과 반대로 뒤집혀 독자 방향 감각이 흔들립니다."
          : "2인 맞대응 컷에서 인물 위치만 바뀌고 시선 방향이 동일해 서로 마주 보는 축선이 깨졌습니다.",
      reasonEn: hemisphereCrossed
        ? `Camera crossed the 180° action axis into the opposite hemisphere (${formatSignedAngle(nextYawDeg)}), reversing screen geography.`
        : singleSubjectHardFlip
          ? "Primary subject flipped across screen sides and gaze axis compared to the previous cut."
          : "Two-speaker cut swapped screen sides without counter-matching eyelines.",
      correctionHintKo: hemisphereCrossed
        ? `카메라 방위각을 ${formatSignedAngle(recommendedSafeYawDeg)} 주 반구로 되돌리거나, 정면 중립 컷을 먼저 거쳐 축선을 전환하세요.`
        : `직전 컷 기준 반구(${formatSignedAngle(recommendedSafeYawDeg)}) 안에서 피사체 좌우 위치와 시선 여백을 다시 정렬하세요.`,
      correctionHintEn: hemisphereCrossed
        ? `Move camera yaw back to ${formatSignedAngle(recommendedSafeYawDeg)} in the active hemisphere, or insert a neutral axis bridge cut.`
        : `Re-align subject screen side and eyeline within the safe hemisphere (${formatSignedAngle(recommendedSafeYawDeg)}).`,
    };
  }

  const sameEdgeOppositeGaze =
    !sameSubject && !subjectSideFlipped && input.prevSubjectSide !== "center" &&
    input.prevSubjectSide === input.nextSubjectSide && oppositeHorizontalGaze;
  if (onNeutralAxis || absYawDeltaDeg >= 115 || (sameSubject && subjectSideFlipped) || sameEdgeOppositeGaze) {
    return {
      ...baseMetrics, status: "warning", eyelineMatched,
      reasonKo: onNeutralAxis
        ? `카메라(${formatSignedAngle(nextYawDeg)})가 180° 중립 축선(±12°) 위에 걸쳐 있어 다음 컷에서 월선 위험이 높습니다.`
        : absYawDeltaDeg >= 115
          ? `같은 반구지만 카메라 회전폭(${absYawDeltaDeg}°)이 커서 공간 연속성이 순간 흐려질 수 있습니다.`
          : sameSubject && subjectSideFlipped
            ? "카메라는 안전 반구지만 피사체 위치가 화면 좌우를 가로질러 시선 동선이 끊길 수 있습니다."
            : "두 화자가 같은 화면 가장자리에 겹쳐 배치되어 마주 보는 대화 구도가 약해졌습니다.",
      reasonEn: onNeutralAxis
        ? `Camera (${formatSignedAngle(nextYawDeg)}) sits inside the ±12° neutral axis band, risking an unintended crossing next cut.`
        : absYawDeltaDeg >= 115
          ? `Large ${absYawDeltaDeg}° camera sweep within the same hemisphere may momentarily blur spatial continuity.`
          : sameSubject && subjectSideFlipped
            ? "Subject shifted across screen sides despite staying in the safe hemisphere."
            : "Both speakers occupy the same screen edge with opposing gaze directions.",
      correctionHintKo: onNeutralAxis
        ? `방위각을 ${formatSignedAngle(recommendedSafeYawDeg)} 방향으로 15° 이상 안쪽으로 들여 안전 반구를 확보하세요.`
        : `회전폭을 90° 이내(${formatSignedAngle(recommendedSafeYawDeg)})로 줄이고 피사체 시선 여백을 맞추세요.`,
      correctionHintEn: onNeutralAxis
        ? `Offset camera yaw at least 15° off the axis toward ${formatSignedAngle(recommendedSafeYawDeg)}.`
        : `Keep yaw sweep under 90° (near ${formatSignedAngle(recommendedSafeYawDeg)}) and preserve lead room.`,
    };
  }

  return {
    ...baseMetrics, status: "safe", hemisphereCrossed: false, onNeutralAxis: false,
    eyelineMatched: true, recommendedSafeYawDeg: nextYawDeg,
    reasonKo: twoSpeakerReverseMatched
      ? `180° 주 반구(${formatSignedAngle(nextYawDeg)})를 유지하며 2인 대화 시선 교차(좌↔우)가 정확히 맞물립니다.`
      : `180° 액션 축선을 넘지 않고(${formatSignedAngle(nextYawDeg)}, Δ${absYawDeltaDeg}°) 직전 컷 시선 동선을 자연스럽게 잇습니다.`,
    reasonEn: twoSpeakerReverseMatched
      ? `Locked in the active 180° hemisphere (${formatSignedAngle(nextYawDeg)}) with matched two-speaker counter-eyelines.`
      : `Maintains the 180° action axis (${formatSignedAngle(nextYawDeg)}, Δ${absYawDeltaDeg}°) with smooth visual flow.`,
    correctionHintKo: "현재 카메라 반구와 시선 동선이 안정적입니다. 초점거리·틸트만 미세 조정해 연출 강도를 조절하세요.",
    correctionHintEn: "Hemisphere and eyeline continuity are solid. Fine-tune focal length or tilt for emotional emphasis.",
  };
}

function analyzeDialogueSignals(dialogueText: string) {
  const text = dialogueText.trim();
  const tagsKo: string[] = [];
  let shock = 0, chaseOrSpace = 0, intimate = 0, confront = 0;
  if (/\?!|!!\s*$|설마|거짓말|말도\s*안|정체|반전|믿을\s*수|충격/u.test(text)) { shock += 10; tagsKo.push("반전·충격 어휘"); }
  if (/골목|코너|추격|도망|광장|군중|인파|거리|도시|전경|막다른|새벽/u.test(text)) { chaseOrSpace += 10; tagsKo.push("공간·이동 단서"); }
  if (/좋아|고백|눈을|비밀|미안|속삭|기억|오래전|\.{2,}|…/u.test(text)) { intimate += 9; tagsKo.push("내면·시선 어휘"); }
  if (/약속|멈춰|비켜|돌아오|각오|대결|깨졌|깼|누구|당장/u.test(text)) { confront += 9; tagsKo.push("대립·압박 어휘"); }
  return { shock, chaseOrSpace, intimate, confront, tagsKo };
}

function computeSafeTargetYaw(prevYawDeg: number, offsetDeg: number, framingType: CameraFramingType): number {
  const prevNorm = normalizeYawDeg(prevYawDeg);
  const prevHemi = classifyActionHemisphere(prevNorm);
  const sign = prevHemi === "back" ? -1 : 1;
  const prevAbs = prevHemi === "neutral" ? (Math.abs(prevNorm) > 90 ? 142 : 38) : clampNumber(Math.abs(prevNorm), 24, 156);

  const desiredAbs =
    framingType === "high-angle-wide"
      ? (prevAbs > 105 ? 78 : 96)
      : framingType === "over-the-shoulder"
        ? (prevAbs <= 90 ? clampNumber(180 - prevAbs, 108, 146) : clampNumber(180 - prevAbs, 34, 72))
        : clampNumber(prevAbs + (prevAbs <= 90 ? 1 : -1) * offsetDeg, 26, 152);

  const boundedAbs = clampNumber(desiredAbs, Math.max(24, prevAbs - 88), Math.min(156, prevAbs + 88));
  return normalizeYawDeg(sign * boundedAbs);
}

function resolveTargetSideAndGaze(input: CameraFramingCoachInput, framingType: CameraFramingType) {
  if (framingType === "high-angle-wide") {
    return {
      subjectSide: (input.speakerCount === 2 ? "center" : input.prevSubjectSide) as SubjectScreenSide,
      gazeDirection: input.prevGazeDirection, isSameSubjectFocus: input.speakerCount === 1,
    };
  }
  if (input.speakerCount === 2) {
    if (input.prevSubjectSide === "left" && input.prevGazeDirection === "left-to-right") {
      return { subjectSide: "right" as SubjectScreenSide, gazeDirection: "right-to-left" as GazeDirection, isSameSubjectFocus: false };
    }
    if (input.prevSubjectSide === "right" && input.prevGazeDirection === "right-to-left") {
      return { subjectSide: "left" as SubjectScreenSide, gazeDirection: "left-to-right" as GazeDirection, isSameSubjectFocus: false };
    }
    const nextSide: SubjectScreenSide = input.prevSubjectSide === "right" ? "left" : "right";
    return {
      subjectSide: nextSide, gazeDirection: (nextSide === "left" ? "left-to-right" : "right-to-left") as GazeDirection,
      isSameSubjectFocus: false,
    };
  }
  const keptSide: SubjectScreenSide =
    input.prevSubjectSide !== "center"
      ? input.prevSubjectSide
      : input.prevGazeDirection === "left-to-right" ? "left"
        : input.prevGazeDirection === "right-to-left" ? "right"
          : framingType === "eyeline-insert" ? "center" : "left";
  return { subjectSide: keptSide, gazeDirection: input.prevGazeDirection, isSameSubjectFocus: true };
}

export function buildCompositionGeometry(params: {
  readonly framingType: CameraFramingType | "original"; readonly shotScale: ShotScale;
  readonly subjectSide: SubjectScreenSide; readonly gazeDirection: GazeDirection; readonly speakerCount: SpeakerCount;
}): { readonly subjectAnchors: readonly SubjectAnchorPoint[]; readonly gazeVector: GazeArrowVector; readonly thirdsIntersection: ThirdsIntersectionPoint } {
  const { framingType, shotScale, subjectSide, gazeDirection, speakerCount } = params;
  const primaryX = subjectSide === "left" ? 0.333 : subjectSide === "right" ? 0.667 : 0.5;
  const primaryY = shotScale === "wide" ? 0.56 : shotScale === "extreme-closeup" ? 0.36
    : framingType === "low-angle-closeup" ? 0.34 : framingType === "high-angle-wide" ? 0.62 : 0.38;
  const headRadiusNorm = shotScale === "extreme-closeup" ? 0.14 : shotScale === "closeup" ? 0.11 : shotScale === "medium" ? 0.08 : 0.05;
  const silhouetteScale = shotScale === "extreme-closeup" ? 1.35 : shotScale === "closeup" ? 1.12 : shotScale === "medium" ? 0.88 : 0.56;

  const anchors: SubjectAnchorPoint[] = [{
    id: "primary-subject", role: "primary", x: round1(primaryX * 100) / 100, y: round1(primaryY * 100) / 100,
    headRadiusNorm, silhouetteScale, labelKo: "주 인물", labelEn: "Primary",
  }];
  if (speakerCount === 2 || framingType === "over-the-shoulder") {
    const isOts = framingType === "over-the-shoulder";
    anchors.push({
      id: isOts ? "ots-shoulder" : "secondary-subject",
      role: isOts ? "foreground-shoulder" : "secondary",
      x: round1((subjectSide === "left" ? 0.8 : subjectSide === "right" ? 0.2 : 0.22) * 100) / 100,
      y: isOts ? 0.72 : round1(clampNumber(primaryY + 0.08, 0.34, 0.68) * 100) / 100,
      headRadiusNorm: isOts ? 0.12 : Math.max(0.045, round1(headRadiusNorm * 85) / 100),
      silhouetteScale: isOts ? 1.25 : round1(silhouetteScale * 82) / 100,
      labelKo: isOts ? "전경 어깨" : "상대 인물", labelEn: isOts ? "FG Shoulder" : "Counterpart",
    });
  }

  const toX = gazeDirection === "left-to-right" ? clampNumber(primaryX + 0.28, 0.14, 0.9)
    : gazeDirection === "right-to-left" ? clampNumber(primaryX - 0.28, 0.1, 0.86) : primaryX;
  const toY = gazeDirection === "left-to-right" || gazeDirection === "right-to-left"
    ? clampNumber(primaryY - 0.02, 0.18, 0.82)
    : clampNumber(primaryY + (gazeDirection === "down" ? 0.22 : 0.09), 0.2, 0.86);

  const col = subjectSide === "right" ? "right-third" : "left-third";
  const row = primaryY > 0.52 ? "lower-third" : "upper-third";
  return {
    subjectAnchors: anchors,
    gazeVector: {
      fromX: round1(primaryX * 100) / 100, fromY: round1(primaryY * 100) / 100,
      toX: round1(toX * 100) / 100, toY: round1(toY * 100) / 100,
      angleDeg: round1((Math.atan2(toY - primaryY, toX - primaryX) * 180) / Math.PI),
    },
    thirdsIntersection: { col, row, x: col === "left-third" ? 0.333 : 0.667, y: row === "upper-third" ? 0.333 : 0.667 },
  };
}

/** 180° 법칙을 유지하면서 현재 대사 긴장도·화자 수·직전 컷 흐름에 맞는 Top-3 비파괴 구도 가이드를 산출한다. */
export function proposeCameraFramingsTop3(input: CameraFramingCoachInput): readonly CameraFramingProposal[] {
  const signals = analyzeDialogueSignals(input.dialogueText);
  const prevScaleOrder = getShotScaleOrder(input.prevShotScale);

  const scored = FRAMING_CATALOG.map((entry) => {
    let score = entry.tensionWeights[input.dialogueTension] + (input.speakerCount === 2 ? entry.prefersTwoSpeakers : entry.prefersSoloSpeaker);
    if (entry.framingType === "dutch-tilt") score += signals.shock * 0.9 + signals.chaseOrSpace * 0.55;
    else if (entry.framingType === "high-angle-wide") score += signals.chaseOrSpace * 1.1 + (prevScaleOrder >= 2 ? 9 : 0);
    else if (entry.framingType === "eyeline-insert") score += signals.intimate * 0.9 + signals.shock * 0.45;
    else if (entry.framingType === "low-angle-closeup") score += signals.confront * 0.8 + signals.chaseOrSpace * 0.3;
    else if (entry.framingType === "over-the-shoulder") score += signals.confront * 0.65 + signals.intimate * 0.35;
    else if (entry.framingType === "rule-of-thirds-eye") score += signals.intimate * 0.4;

    const scaleDiff = Math.abs(getShotScaleOrder(entry.shotScale) - prevScaleOrder);
    if (scaleDiff === 1) score += 4;
    else if (scaleDiff === 3) score -= 7;

    const target = resolveTargetSideAndGaze(input, entry.framingType);
    const safeYaw = computeSafeTargetYaw(input.prevCameraYawDeg, entry.targetYawOffsetDeg, entry.framingType);
    const rollDeg = entry.framingType === "dutch-tilt" ? entry.defaultRollDeg * (input.prevGazeDirection === "right-to-left" ? -1 : 1) : entry.defaultRollDeg;
    const rig: CameraRigPose = { focalLengthMm: entry.defaultFocalMm, yawDeg: safeYaw, pitchDeg: entry.defaultPitchDeg, rollDeg };

    const continuityAudit = auditCameraContinuity({
      prevSubjectSide: input.prevSubjectSide, prevGazeDirection: input.prevGazeDirection,
      prevShotScale: input.prevShotScale, prevCameraYawDeg: input.prevCameraYawDeg,
      nextSubjectSide: target.subjectSide, nextGazeDirection: target.gazeDirection,
      nextShotScale: entry.shotScale, nextCameraYawDeg: safeYaw,
      speakerCount: input.speakerCount, isSameSubjectFocus: target.isSameSubjectFocus,
    });
    const geometry = buildCompositionGeometry({
      framingType: entry.framingType, shotScale: entry.shotScale,
      subjectSide: target.subjectSide, gazeDirection: target.gazeDirection, speakerCount: input.speakerCount,
    });
    const signalSuffixKo = signals.tagsKo.length > 0 ? ` (${signals.tagsKo.join("·")} 반영)` : "";
    return { entry, score: Math.round(clampNumber(score, 35, 99)), rig, target, continuityAudit, geometry, signalSuffixKo };
  });

  scored.sort((a, b) => b.score - a.score || a.entry.framingType.localeCompare(b.entry.framingType));
  return scored.slice(0, 3).map((item, idx) => {
    const rank = (idx + 1) as 1 | 2 | 3;
    return {
      id: `proposal-${item.entry.framingType}-r${rank}`, framingType: item.entry.framingType, rank, score: item.score,
      titleKo: item.entry.titleKo, titleEn: item.entry.titleEn, badgeKo: item.entry.badgeKo, badgeEn: item.entry.badgeEn,
      rationaleKo: `${item.entry.rationaleBaseKo}${item.signalSuffixKo}`, rationaleEn: item.entry.rationaleBaseEn,
      shotScale: item.entry.shotScale, focalLengthMm: item.rig.focalLengthMm, cameraRig: item.rig,
      subjectSide: item.target.subjectSide, gazeDirection: item.target.gazeDirection,
      subjectAnchors: item.geometry.subjectAnchors, gazeVector: item.geometry.gazeVector,
      thirdsIntersection: item.geometry.thirdsIntersection, continuityAudit: item.continuityAudit,
    };
  });
}

export const getCameraCoachScenePreset = (presetId?: CameraCoachScenePresetId): CameraCoachScenePreset =>
  CAMERA_COACH_SCENE_PRESETS.find((p) => p.id === presetId) ?? CAMERA_COACH_SCENE_PRESETS[0];

export function clampCameraRigPose(rig: CameraRigPose): CameraRigPose {
  return {
    focalLengthMm: Math.round(clampNumber(rig.focalLengthMm, FOCAL_LENGTH_MIN_MM, FOCAL_LENGTH_MAX_MM)),
    yawDeg: normalizeYawDeg(rig.yawDeg),
    pitchDeg: Math.round(clampNumber(rig.pitchDeg, PITCH_MIN_DEG, PITCH_MAX_DEG)),
    rollDeg: Math.round(clampNumber(rig.rollDeg, ROLL_MIN_DEG, ROLL_MAX_DEG)),
  };
}

/** 비파괴 세션 초기 상태를 생성한다. */
export function createCameraCoachSession(initialCut?: Partial<CameraCutSnapshot>): CameraCoachSessionState {
  const original: CameraCutSnapshot = {
    labelKo: initialCut?.labelKo ?? "원본 컷 (미적용)", labelEn: initialCut?.labelEn ?? "Original Cut (Unmodified)",
    framingType: initialCut?.framingType ?? "original", shotScale: initialCut?.shotScale ?? "medium",
    subjectSide: initialCut?.subjectSide ?? "left", gazeDirection: initialCut?.gazeDirection ?? "left-to-right",
    rig: clampCameraRigPose(initialCut?.rig ?? { focalLengthMm: 50, yawDeg: 52, pitchDeg: 0, rollDeg: 0 }),
    appliedProposalId: null,
  };
  return {
    status: "idle", original, current: original, previewingProposalId: null, appliedProposalId: null,
    rigOverrides: {}, simulateAxisCross: false, historyCount: 0,
  };
}

/** 제안안을 원본 변경 없이 미리보기 상태로 토글한다. */
export function previewCameraProposal(session: CameraCoachSessionState, proposalId: string | null): CameraCoachSessionState {
  const nextId = proposalId && session.previewingProposalId === proposalId ? null : proposalId;
  const status: CameraCoachSessionStatus = nextId
    ? "previewing" : session.appliedProposalId ? "applied" : session.historyCount > 0 ? "reverted" : "idle";
  return { ...session, status, previewingProposalId: nextId };
}

/** 선택한 제안안(및 미세 조정값)을 현재 컷에 비파괴 적용한다(원본 보존). */
export function applyCameraProposal(
  session: CameraCoachSessionState,
  proposal: CameraFramingProposal,
  overrides?: Partial<CameraRigPose>,
): CameraCoachSessionState {
  const merged = overrides ?? session.rigOverrides;
  const rig = clampCameraRigPose({
    focalLengthMm: merged.focalLengthMm ?? proposal.cameraRig.focalLengthMm,
    yawDeg: merged.yawDeg ?? proposal.cameraRig.yawDeg,
    pitchDeg: merged.pitchDeg ?? proposal.cameraRig.pitchDeg,
    rollDeg: merged.rollDeg ?? proposal.cameraRig.rollDeg,
  });
  return {
    ...session, status: "applied",
    current: {
      labelKo: `적용됨 · ${proposal.titleKo}`, labelEn: `Applied · ${proposal.titleEn}`,
      framingType: proposal.framingType, shotScale: proposal.shotScale,
      subjectSide: proposal.subjectSide, gazeDirection: proposal.gazeDirection, rig, appliedProposalId: proposal.id,
    },
    previewingProposalId: null, appliedProposalId: proposal.id,
    rigOverrides: {}, simulateAxisCross: false, historyCount: session.historyCount + 1,
  };
}

/** 적용된 구도를 원본 컷 상태로 완전 원복한다. */
export function revertCameraProposal(session: CameraCoachSessionState): CameraCoachSessionState {
  return {
    ...session, status: "reverted", current: session.original,
    previewingProposalId: null, appliedProposalId: null, rigOverrides: {}, simulateAxisCross: false,
  };
}

/** 초점거리(24~135mm)·틸트·롤·방위각 미세 조정값을 안전 범위로 갱신한다. */
export function updateCameraRigFineTune(session: CameraCoachSessionState, patch: Partial<CameraRigPose>): CameraCoachSessionState {
  return {
    ...session,
    rigOverrides: {
      ...session.rigOverrides,
      ...(patch.focalLengthMm !== undefined ? { focalLengthMm: Math.round(clampNumber(patch.focalLengthMm, FOCAL_LENGTH_MIN_MM, FOCAL_LENGTH_MAX_MM)) } : {}),
      ...(patch.pitchDeg !== undefined ? { pitchDeg: Math.round(clampNumber(patch.pitchDeg, PITCH_MIN_DEG, PITCH_MAX_DEG)) } : {}),
      ...(patch.rollDeg !== undefined ? { rollDeg: Math.round(clampNumber(patch.rollDeg, ROLL_MIN_DEG, ROLL_MAX_DEG)) } : {}),
      ...(patch.yawDeg !== undefined ? { yawDeg: normalizeYawDeg(patch.yawDeg) } : {}),
    },
  };
}

export const resetCameraRigFineTune = (session: CameraCoachSessionState): CameraCoachSessionState => ({ ...session, rigOverrides: {} });
export const toggleAxisCrossSimulation = (session: CameraCoachSessionState, enabled?: boolean): CameraCoachSessionState =>
  ({ ...session, simulateAxisCross: enabled ?? !session.simulateAxisCross });

function pickBaseView(top3: readonly CameraFramingProposal[], session: CameraCoachSessionState) {
  const previewMatch = session.previewingProposalId ? top3.find((p) => p.id === session.previewingProposalId) ?? null : null;
  if (previewMatch) {
    return {
      source: "preview" as const, activeProposalId: previewMatch.id,
      labelKo: `미리보기(미적용) · ${previewMatch.titleKo}`, labelEn: `Preview (Uncommitted) · ${previewMatch.titleEn}`,
      framingType: previewMatch.framingType as CameraFramingType | "original", shotScale: previewMatch.shotScale,
      subjectSide: previewMatch.subjectSide, gazeDirection: previewMatch.gazeDirection, rig: previewMatch.cameraRig,
    };
  }
  if (session.appliedProposalId) {
    return { ...session.current, source: "applied" as const, activeProposalId: session.appliedProposalId };
  }
  const lead = session.status !== "reverted" ? (top3[0] ?? null) : null;
  if (lead) {
    return {
      source: "recommended" as const, activeProposalId: lead.id,
      labelKo: `1순위 제안 가이드 · ${lead.titleKo}`, labelEn: `Top-1 Guide · ${lead.titleEn}`,
      framingType: lead.framingType as CameraFramingType | "original", shotScale: lead.shotScale,
      subjectSide: lead.subjectSide, gazeDirection: lead.gazeDirection, rig: lead.cameraRig,
    };
  }
  return { ...session.original, source: "original" as const, activeProposalId: null };
}

/** 현재 화면(탑뷰·9:16 고스트 프레임·연속성 감사)에 표시할 유효 카메라 상태를 계산한다. */
export function resolveEffectiveCameraView(
  input: CameraFramingCoachInput,
  top3: readonly CameraFramingProposal[],
  session: CameraCoachSessionState,
): ResolvedCameraCoachView {
  const base = pickBaseView(top3, session);

  const effectiveYaw = session.simulateAxisCross ? mirrorYawAcrossActionAxis(input.prevCameraYawDeg) : (session.rigOverrides.yawDeg ?? base.rig.yawDeg);
  const effectiveSide = session.simulateAxisCross ? flipScreenSide(base.subjectSide) : base.subjectSide;
  const effectiveGaze = session.simulateAxisCross ? flipHorizontalGaze(base.gazeDirection) : base.gazeDirection;
  const rig = clampCameraRigPose({
    focalLengthMm: session.rigOverrides.focalLengthMm ?? base.rig.focalLengthMm,
    yawDeg: effectiveYaw,
    pitchDeg: session.rigOverrides.pitchDeg ?? base.rig.pitchDeg,
    rollDeg: session.rigOverrides.rollDeg ?? base.rig.rollDeg,
  });

  const continuityAudit = auditCameraContinuity({
    prevSubjectSide: input.prevSubjectSide, prevGazeDirection: input.prevGazeDirection,
    prevShotScale: input.prevShotScale, prevCameraYawDeg: input.prevCameraYawDeg,
    nextSubjectSide: effectiveSide, nextGazeDirection: effectiveGaze, nextShotScale: base.shotScale,
    nextCameraYawDeg: rig.yawDeg, speakerCount: input.speakerCount, isSameSubjectFocus: input.speakerCount === 1,
  });
  const geometry = buildCompositionGeometry({
    framingType: base.framingType, shotScale: base.shotScale,
    subjectSide: effectiveSide, gazeDirection: effectiveGaze, speakerCount: input.speakerCount,
  });

  return {
    source: base.source, labelKo: base.labelKo, labelEn: base.labelEn,
    framingType: base.framingType, shotScale: base.shotScale,
    subjectSide: effectiveSide, gazeDirection: effectiveGaze, rig,
    subjectAnchors: geometry.subjectAnchors, gazeVector: geometry.gazeVector,
    thirdsIntersection: geometry.thirdsIntersection, continuityAudit, activeProposalId: base.activeProposalId,
  };
}

/** 카메라 릭·180° 연속성 감사·Top-3 제안을 스튜디오 연동용 JSON 문자열로 내보낸다. */
export function exportCameraRigJson({ sceneId, input, session, activeView, top3 }: CameraRigExportPayload): string {
  return JSON.stringify({
    schema: "toonstudio.camera-framing-continuity-coach.v1",
    sceneId, sessionStatus: session.status, simulateAxisCross: session.simulateAxisCross,
    previousCut: {
      subjectSide: input.prevSubjectSide, gazeDirection: input.prevGazeDirection,
      shotScale: input.prevShotScale, cameraYawDeg: normalizeYawDeg(input.prevCameraYawDeg),
    },
    dialogueIntent: { tension: input.dialogueTension, speakerCount: input.speakerCount, dialogueText: input.dialogueText },
    activeCameraRig: {
      framingType: activeView.framingType, shotScale: activeView.shotScale,
      subjectSide: activeView.subjectSide, gazeDirection: activeView.gazeDirection,
      ...activeView.rig, thirdsIntersection: activeView.thirdsIntersection,
      gazeVector: activeView.gazeVector, subjectAnchors: activeView.subjectAnchors,
    },
    continuityAudit: activeView.continuityAudit,
    top3Proposals: top3.map((p) => ({
      id: p.id, rank: p.rank, framingType: p.framingType, score: p.score, shotScale: p.shotScale,
      cameraRig: p.cameraRig, subjectSide: p.subjectSide, gazeDirection: p.gazeDirection,
      continuityStatus: p.continuityAudit.status,
    })),
  }, null, 2);
}
