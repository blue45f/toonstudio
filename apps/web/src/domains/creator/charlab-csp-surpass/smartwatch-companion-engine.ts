/**
 * Wave 39E — 스마트워치 동반 리모컨 프로토콜 엔진.
 *
 * - 디지털 크라운 회전 델타 -> 브러시 크기 / 캔버스 줌 / 불투명도 / 회전 가변 감도 조절
 * - 4버튼 촉각 액션 패드 (실행취소 · 다시실행 · 스포이드 · 좌우반전)
 * - 누적 획 속도 · 작업시간 기반 손목 피로 휴식 코치 (로컬 온디바이스 계산)
 * - 3초 음성 대사 -> 말풍선 메모 큐(FIFO) 및 1탭 컷 배치
 */

export type DigitalCrownMode =
  | "brush-size"
  | "canvas-zoom"
  | "brush-opacity"
  | "canvas-rotate";

export type CrownSensitivityPreset = "precision" | "balanced" | "turbo";

export type WatchHapticPattern =
  | "none"
  | "tick-light"
  | "tick-firm"
  | "boundary-thump"
  | "crisp-tap"
  | "double-tap"
  | "soft-pulse"
  | "mirror-click"
  | "gentle-nudge"
  | "break-chime"
  | "urgent-double-tap";

export type TactilePadButtonId =
  | "undo"
  | "redo"
  | "eyedropper"
  | "flip-horizontal";

export interface TactilePadButtonSpec {
  readonly id: TactilePadButtonId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKey: string;
  readonly haptic: WatchHapticPattern;
}

export type FatigueRiskLevel = "fresh" | "moderate" | "elevated" | "critical";

export interface WristTelemetrySnapshot {
  readonly sessionDurationMinutes: number;
  readonly cumulativeStrokeMeters: number;
  readonly averageStrokeSpeedPxPerSec: number;
  readonly highPressureRatio: number;
  readonly minutesSinceLastBreak: number;
}

export interface WristFatigueCoachReport {
  readonly fatigueScore: number;
  readonly riskLevel: FatigueRiskLevel;
  readonly wristTorqueLoadIndex: number;
  readonly recommendedBreakMinutes: number;
  readonly watchHapticAlert: WatchHapticPattern;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly stretchRoutineKo: string;
  readonly stretchRoutineEn: string;
  readonly requiresImmediateRest: boolean;
}

export type VoiceBalloonStyle =
  | "normal"
  | "shout"
  | "thought"
  | "whisper"
  | "narration";

export interface VoiceDialogueCaptureInput {
  readonly transcript: string;
  readonly durationSec: number;
  readonly speakerName?: string;
  readonly capturedAtLabel?: string;
}

export interface BalloonVoiceMemoItem {
  readonly memoId: string;
  readonly rawTranscript: string;
  readonly cleanedDialogue: string;
  readonly speakerName: string;
  readonly durationSec: number;
  readonly withinThreeSecBudget: boolean;
  readonly inferredStyle: VoiceBalloonStyle;
  readonly estimatedLines: number;
  readonly capturedAtLabel: string;
}

export interface WatchProtocolPacket {
  readonly seq: number;
  readonly opcode: "CROWN_DELTA" | "PAD_ACTION" | "FATIGUE_ALERT" | "VOICE_MEMO";
  readonly hapticPattern: WatchHapticPattern;
  readonly payloadSummaryKo: string;
  readonly estimatedBleLatencyMs: number;
}

export interface SmartwatchCompanionState {
  readonly connectedDeviceName: string;
  readonly crownMode: DigitalCrownMode;
  readonly sensitivityPreset: CrownSensitivityPreset;
  readonly brushSizePx: number;
  readonly canvasZoomPct: number;
  readonly brushOpacityPct: number;
  readonly canvasRotationDeg: number;
  readonly undoStackDepth: number;
  readonly redoStackDepth: number;
  readonly eyedropperActive: boolean;
  readonly canvasFlippedHorizontal: boolean;
  readonly wristTelemetry: WristTelemetrySnapshot;
  readonly fatigueReport: WristFatigueCoachReport;
  readonly balloonMemoQueue: readonly BalloonVoiceMemoItem[];
  readonly placedMemoHistory: readonly BalloonVoiceMemoItem[];
  readonly protocolSeq: number;
  readonly lastPacket: WatchProtocolPacket | null;
}

export interface DigitalCrownDeltaInput {
  readonly deltaDeg: number;
  readonly angularVelocityDegPerSec: number;
}

export interface DigitalCrownTransitionResult {
  readonly state: SmartwatchCompanionState;
  readonly effectiveGain: number;
  readonly appliedDelta: number;
  readonly hitBoundary: boolean;
  readonly packet: WatchProtocolPacket;
}

export interface TactilePadTransitionResult {
  readonly state: SmartwatchCompanionState;
  readonly executed: boolean;
  readonly packet: WatchProtocolPacket;
}

export const TACTILE_PAD_BUTTONS: readonly [
  TactilePadButtonSpec,
  TactilePadButtonSpec,
  TactilePadButtonSpec,
  TactilePadButtonSpec,
] = [
  {
    id: "undo",
    labelKo: "실행취소",
    labelEn: "Undo",
    shortKey: "B1",
    haptic: "crisp-tap",
  },
  {
    id: "redo",
    labelKo: "다시실행",
    labelEn: "Redo",
    shortKey: "B2",
    haptic: "double-tap",
  },
  {
    id: "eyedropper",
    labelKo: "스포이드",
    labelEn: "Eyedropper",
    shortKey: "B3",
    haptic: "soft-pulse",
  },
  {
    id: "flip-horizontal",
    labelKo: "좌우반전",
    labelEn: "Flip Horizontal",
    shortKey: "B4",
    haptic: "mirror-click",
  },
];

export const DEMO_VOICE_MEMO_PRESETS: readonly VoiceDialogueCaptureInput[] = [
  {
    transcript: "잠깐! 옥상 문 닫지 마!",
    durationSec: 2.3,
    speakerName: "강서준",
    capturedAtLabel: "00:14",
  },
  {
    transcript: "(속마음) 지금 돌아서면 두 번 다시 못 만날 텐데...",
    durationSec: 2.9,
    speakerName: "한유나",
    capturedAtLabel: "00:42",
  },
  {
    transcript: "속삭이며, 열쇠는 화분 아래 숨겨뒀어...",
    durationSec: 2.6,
    speakerName: "한유나",
    capturedAtLabel: "01:08",
  },
  {
    transcript: "나레이션: 그날 밤 서울의 빗소리는 유난히 묵직했다.",
    durationSec: 3.0,
    speakerName: "내레이션",
    capturedAtLabel: "01:35",
  },
];

const PRESET_MULTIPLIER: Record<CrownSensitivityPreset, number> = {
  precision: 0.6,
  balanced: 1.0,
  turbo: 1.65,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** 누적 획 속도 · 작업시간 기반 손목 피로 휴식 코치 평가. */
export function evaluateWristFatigueCoach(
  telemetry: WristTelemetrySnapshot,
): WristFatigueCoachReport {
  const durationTerm = clamp((telemetry.minutesSinceLastBreak / 90) * 42, 0, 45);
  const speedTerm = clamp(((telemetry.averageStrokeSpeedPxPerSec - 280) / 1400) * 26, 0, 26);
  const distanceTerm = clamp((telemetry.cumulativeStrokeMeters / 160) * 18, 0, 18);
  const pressureTerm = clamp(telemetry.highPressureRatio * 14, 0, 14);
  const sessionWearTerm = clamp((telemetry.sessionDurationMinutes / 240) * 10, 0, 10);

  const fatigueScore = Math.round(
    clamp(durationTerm + speedTerm + distanceTerm + pressureTerm + sessionWearTerm, 0, 100),
  );
  const wristTorqueLoadIndex = roundTo(
    clamp(
      (telemetry.averageStrokeSpeedPxPerSec / 1000) *
        (0.6 + telemetry.highPressureRatio * 0.9) *
        (1 + telemetry.minutesSinceLastBreak / 120),
      0.1,
      5.0,
    ),
    2,
  );

  if (fatigueScore >= 80) {
    return {
      fatigueScore,
      riskLevel: "critical",
      wristTorqueLoadIndex,
      recommendedBreakMinutes: 10,
      watchHapticAlert: "urgent-double-tap",
      summaryKo: "손목 건초염 경보 — 10분 즉시 휴식을 권장합니다.",
      summaryEn: "Critical wrist strain — take a 10-minute break now.",
      stretchRoutineKo: "손목 굴곡근·신전근 30초씩 이완 후 10분간 펜 내려놓기",
      stretchRoutineEn: "Stretch wrist flexors & extensors 30s each and rest 10 min.",
      requiresImmediateRest: true,
    };
  }
  if (fatigueScore >= 58) {
    return {
      fatigueScore,
      riskLevel: "elevated",
      wristTorqueLoadIndex,
      recommendedBreakMinutes: 5,
      watchHapticAlert: "break-chime",
      summaryKo: "누적 획 속도 상승 — 현재 컷 저장 후 5분 스트레칭하세요.",
      summaryEn: "Elevated stroke fatigue — stretch 5 minutes after this cut.",
      stretchRoutineKo: "손가락 깍지 펴기 20초 + 어깨 원 회전 10회 + 20-20-20 원거리 응시",
      stretchRoutineEn: "Interlace finger stretch 20s + 10 shoulder rolls + 20-20-20 gaze.",
      requiresImmediateRest: false,
    };
  }
  if (fatigueScore >= 32) {
    return {
      fatigueScore,
      riskLevel: "moderate",
      wristTorqueLoadIndex,
      recommendedBreakMinutes: 3,
      watchHapticAlert: "gentle-nudge",
      summaryKo: "안정 작업 구간 — 20분 이내 3분 짧은 손목 풀기를 예약하세요.",
      summaryEn: "Moderate workload — schedule a 3-minute wrist release soon.",
      stretchRoutineKo: "손목 가볍게 털기 15초 및 필압 곡선 약간 부드럽게 조정",
      stretchRoutineEn: "Gentle 15s wrist shake and soften stylus pressure curve.",
      requiresImmediateRest: false,
    };
  }
  return {
    fatigueScore,
    riskLevel: "fresh",
    wristTorqueLoadIndex,
    recommendedBreakMinutes: 0,
    watchHapticAlert: "none",
    summaryKo: "손목 컨디션 쾌적 — 선화·채색 집중 작업에 적합합니다.",
    summaryEn: "Wrist condition fresh — optimal for lineart and coloring.",
    stretchRoutineKo: "정상 작업 유지 (50분 주기 미세 휴식 권장)",
    stretchRoutineEn: "Continue normally (micro-break every 50 min).",
    requiresImmediateRest: false,
  };
}

/** 초기 스마트워치 동반 리모컨 상태 생성. */
export function createInitialSmartwatchState(): SmartwatchCompanionState {
  const wristTelemetry: WristTelemetrySnapshot = {
    sessionDurationMinutes: 46,
    cumulativeStrokeMeters: 38.4,
    averageStrokeSpeedPxPerSec: 640,
    highPressureRatio: 0.34,
    minutesSinceLastBreak: 36,
  };
  return {
    connectedDeviceName: "Atelier Watch Ultra · BLE 5.3",
    crownMode: "brush-size",
    sensitivityPreset: "balanced",
    brushSizePx: 14,
    canvasZoomPct: 100,
    brushOpacityPct: 100,
    canvasRotationDeg: 0,
    undoStackDepth: 12,
    redoStackDepth: 2,
    eyedropperActive: false,
    canvasFlippedHorizontal: false,
    wristTelemetry,
    fatigueReport: evaluateWristFatigueCoach(wristTelemetry),
    balloonMemoQueue: [
      {
        memoId: "voice-memo-1",
        rawTranscript: "잠깐! 옥상 문 닫지 마!",
        cleanedDialogue: "잠깐! 옥상 문 닫지 마!",
        speakerName: "강서준",
        durationSec: 2.3,
        withinThreeSecBudget: true,
        inferredStyle: "shout",
        estimatedLines: 2,
        capturedAtLabel: "00:14",
      },
    ],
    placedMemoHistory: [],
    protocolSeq: 1,
    lastPacket: null,
  };
}

/** 디지털 크라운 가변 감도 회전 델타 적용 (느린 회전 = 정밀, 빠른 스핀 = 가속). */
export function applyDigitalCrownDelta(
  state: SmartwatchCompanionState,
  input: DigitalCrownDeltaInput,
): DigitalCrownTransitionResult {
  const speed = Math.abs(input.angularVelocityDegPerSec);
  const velocityGain =
    speed < 45
      ? 0.45
      : speed <= 180
        ? 0.85 + ((speed - 45) / 135) * 0.55
        : clamp(1.4 + Math.log2(speed / 180) * 1.15, 1.4, 3.2);
  const effectiveGain = roundTo(velocityGain * PRESET_MULTIPLIER[state.sensitivityPreset], 3);
  const detents = input.deltaDeg / 15;

  let nextBrushSize = state.brushSizePx;
  let nextZoom = state.canvasZoomPct;
  let nextOpacity = state.brushOpacityPct;
  let nextRotation = state.canvasRotationDeg;
  let appliedDelta: number;
  let hitBoundary: boolean;
  let summary: string;

  if (state.crownMode === "brush-size") {
    const rawDelta = detents * 2.5 * effectiveGain;
    const unclamped = state.brushSizePx + rawDelta;
    nextBrushSize = roundTo(clamp(unclamped, 1, 300), 1);
    hitBoundary = unclamped < 1 || unclamped > 300;
    appliedDelta = roundTo(nextBrushSize - state.brushSizePx, 2);
    summary = `브러시 크기 ${nextBrushSize}px (${appliedDelta >= 0 ? "+" : ""}${appliedDelta}px)`;
  } else if (state.crownMode === "canvas-zoom") {
    const rawDelta = detents * 12 * effectiveGain;
    const unclamped = state.canvasZoomPct + rawDelta;
    nextZoom = Math.round(clamp(unclamped, 25, 800));
    hitBoundary = unclamped < 25 || unclamped > 800;
    appliedDelta = nextZoom - state.canvasZoomPct;
    summary = `캔버스 줌 ${nextZoom}% (${appliedDelta >= 0 ? "+" : ""}${appliedDelta}%)`;
  } else if (state.crownMode === "brush-opacity") {
    const rawDelta = detents * 4 * effectiveGain;
    const unclamped = state.brushOpacityPct + rawDelta;
    nextOpacity = Math.round(clamp(unclamped, 5, 100));
    hitBoundary = unclamped < 5 || unclamped > 100;
    appliedDelta = nextOpacity - state.brushOpacityPct;
    summary = `브러시 불투명도 ${nextOpacity}%`;
  } else {
    const rawDelta = detents * 5 * effectiveGain;
    const unclamped = state.canvasRotationDeg + rawDelta;
    nextRotation = Math.round(clamp(unclamped, -180, 180));
    hitBoundary = unclamped < -180 || unclamped > 180;
    appliedDelta = nextRotation - state.canvasRotationDeg;
    summary = `캔버스 회전 ${nextRotation}°`;
  }

  const nextSeq = state.protocolSeq + 1;
  const hapticPattern: WatchHapticPattern = hitBoundary
    ? "boundary-thump"
    : speed > 180
      ? "tick-firm"
      : "tick-light";

  const packet: WatchProtocolPacket = {
    seq: nextSeq,
    opcode: "CROWN_DELTA",
    hapticPattern,
    payloadSummaryKo: summary,
    estimatedBleLatencyMs: 6.4,
  };

  return {
    state: {
      ...state,
      brushSizePx: nextBrushSize,
      canvasZoomPct: nextZoom,
      brushOpacityPct: nextOpacity,
      canvasRotationDeg: nextRotation,
      protocolSeq: nextSeq,
      lastPacket: packet,
    },
    effectiveGain,
    appliedDelta,
    hitBoundary,
    packet,
  };
}

/** 4버튼 촉각 액션 패드 실행 (실행취소 · 다시실행 · 스포이드 · 좌우반전). */
export function triggerTactilePadButton(
  state: SmartwatchCompanionState,
  buttonId: TactilePadButtonId,
): TactilePadTransitionResult {
  const nextSeq = state.protocolSeq + 1;
  let nextUndo = state.undoStackDepth;
  let nextRedo = state.redoStackDepth;
  let nextEyedropper = state.eyedropperActive;
  let nextFlipped = state.canvasFlippedHorizontal;
  let executed = true;
  let summary: string;
  let haptic: WatchHapticPattern;

  if (buttonId === "undo") {
    if (nextUndo > 0) {
      nextUndo -= 1;
      nextRedo += 1;
      summary = `실행취소 완료 (남은 Undo ${nextUndo}단계)`;
      haptic = "crisp-tap";
    } else {
      executed = false;
      summary = "실행취소 기록 없음";
      haptic = "boundary-thump";
    }
  } else if (buttonId === "redo") {
    if (nextRedo > 0) {
      nextRedo -= 1;
      nextUndo += 1;
      summary = `다시실행 완료 (남은 Redo ${nextRedo}단계)`;
      haptic = "double-tap";
    } else {
      executed = false;
      summary = "다시실행 기록 없음";
      haptic = "boundary-thump";
    }
  } else if (buttonId === "eyedropper") {
    nextEyedropper = !state.eyedropperActive;
    summary = nextEyedropper ? "스포이드 샘플링 활성화" : "스포이드 해제 (직전 브러시 복귀)";
    haptic = "soft-pulse";
  } else {
    nextFlipped = !state.canvasFlippedHorizontal;
    summary = nextFlipped ? "캔버스 좌우반전 ON (비율 점검)" : "캔버스 좌우반전 OFF (정방향)";
    haptic = "mirror-click";
  }

  const packet: WatchProtocolPacket = {
    seq: nextSeq,
    opcode: "PAD_ACTION",
    hapticPattern: haptic,
    payloadSummaryKo: summary,
    estimatedBleLatencyMs: 5.2,
  };

  return {
    state: {
      ...state,
      undoStackDepth: nextUndo,
      redoStackDepth: nextRedo,
      eyedropperActive: nextEyedropper,
      canvasFlippedHorizontal: nextFlipped,
      protocolSeq: nextSeq,
      lastPacket: packet,
    },
    executed,
    packet,
  };
}

/** 작업 버스트(추가 작업시간·누적 획 거리·속도·고필압 비율)를 반영해 손목 피로 코치를 갱신한다. */
export function recordDrawingBurst(
  state: SmartwatchCompanionState,
  burst: {
    readonly addedMinutes: number;
    readonly addedStrokeMeters: number;
    readonly burstSpeedPxPerSec: number;
    readonly burstHighPressureRatio: number;
  },
): SmartwatchCompanionState {
  const prev = state.wristTelemetry;
  const nextTelemetry: WristTelemetrySnapshot = {
    sessionDurationMinutes: roundTo(prev.sessionDurationMinutes + Math.max(0, burst.addedMinutes), 1),
    cumulativeStrokeMeters: roundTo(prev.cumulativeStrokeMeters + Math.max(0, burst.addedStrokeMeters), 2),
    averageStrokeSpeedPxPerSec: Math.round(
      prev.averageStrokeSpeedPxPerSec * 0.45 + Math.max(0, burst.burstSpeedPxPerSec) * 0.55,
    ),
    highPressureRatio: roundTo(
      clamp(prev.highPressureRatio * 0.4 + clamp(burst.burstHighPressureRatio, 0, 1) * 0.6, 0, 1),
      3,
    ),
    minutesSinceLastBreak: roundTo(prev.minutesSinceLastBreak + Math.max(0, burst.addedMinutes), 1),
  };
  const fatigueReport = evaluateWristFatigueCoach(nextTelemetry);
  const nextSeq = state.protocolSeq + 1;
  return {
    ...state,
    wristTelemetry: nextTelemetry,
    fatigueReport,
    protocolSeq: nextSeq,
    lastPacket: {
      seq: nextSeq,
      opcode: "FATIGUE_ALERT",
      hapticPattern: fatigueReport.watchHapticAlert,
      payloadSummaryKo: `손목 피로 ${fatigueReport.fatigueScore}점 (${fatigueReport.riskLevel})`,
      estimatedBleLatencyMs: 7.1,
    },
  };
}

/** 휴식 완료 처리: 연속 작업 경과 분을 초기화하고 누적 속도를 안정 수준으로 회복한다. */
export function acknowledgeBreakCompleted(
  state: SmartwatchCompanionState,
  breakMinutes = 5,
): SmartwatchCompanionState {
  const recoveryFactor = clamp(1 - breakMinutes * 0.08, 0.35, 0.85);
  const nextTelemetry: WristTelemetrySnapshot = {
    ...state.wristTelemetry,
    minutesSinceLastBreak: 0,
    averageStrokeSpeedPxPerSec: Math.round(state.wristTelemetry.averageStrokeSpeedPxPerSec * recoveryFactor),
    highPressureRatio: roundTo(state.wristTelemetry.highPressureRatio * recoveryFactor, 3),
  };
  const fatigueReport = evaluateWristFatigueCoach(nextTelemetry);
  const nextSeq = state.protocolSeq + 1;
  return {
    ...state,
    wristTelemetry: nextTelemetry,
    fatigueReport,
    protocolSeq: nextSeq,
    lastPacket: {
      seq: nextSeq,
      opcode: "FATIGUE_ALERT",
      hapticPattern: "gentle-nudge",
      payloadSummaryKo: `${breakMinutes}분 휴식 완료 — 손목 피로 ${fatigueReport.fatigueScore}점으로 회복`,
      estimatedBleLatencyMs: 5.8,
    },
  };
}

function inferBalloonStyleFromKorean(text: string): VoiceBalloonStyle {
  const trimmed = text.trim();
  if (/^(?:나레이션|내레이션)\s*[:：]/u.test(trimmed)) return "narration";
  if (/^\(속마음\)|^속마음\s*[:：]/u.test(trimmed)) return "thought";
  if (/속삭|작게|소곤/u.test(trimmed)) return "whisper";
  if (/[!！]{1,}|[?？][!！]/u.test(trimmed)) return "shout";
  if (/\.\.\.|…/u.test(trimmed)) return "thought";
  return "normal";
}

function cleanDialogueText(text: string): string {
  return text
    .trim()
    .replace(/^(?:음\.\.\.|어\.\.\.|저기\s+|나레이션\s*[:：]\s*|내레이션\s*[:：]\s*|\(속마음\)\s*|속마음\s*[:：]\s*|속삭이며[,，]?\s*)/u, "")
    .trim();
}

/** 3초 음성 대사 캡처 -> 말풍선 스타일 자동 추론 후 메모 큐에 적재. */
export function enqueueVoiceDialogueMemo(
  state: SmartwatchCompanionState,
  capture: VoiceDialogueCaptureInput,
): SmartwatchCompanionState {
  const raw = capture.transcript.trim();
  if (raw.length === 0) return state;

  const inferredStyle = inferBalloonStyleFromKorean(raw);
  const cleanedDialogue = cleanDialogueText(raw) || raw;
  const clampedDuration = roundTo(clamp(capture.durationSec, 0.3, 12), 2);
  const withinThreeSecBudget = clampedDuration <= 3.5;
  const estimatedLines = Math.max(1, Math.ceil(cleanedDialogue.length / 11));
  const nextSeq = state.protocolSeq + 1;

  const memo: BalloonVoiceMemoItem = {
    memoId: `voice-memo-${nextSeq}`,
    rawTranscript: raw,
    cleanedDialogue,
    speakerName: capture.speakerName?.trim() || "화자 미지정",
    durationSec: clampedDuration,
    withinThreeSecBudget,
    inferredStyle,
    estimatedLines,
    capturedAtLabel: capture.capturedAtLabel ?? `00:${String((nextSeq * 7) % 60).padStart(2, "0")}`,
  };

  return {
    ...state,
    balloonMemoQueue: [...state.balloonMemoQueue, memo],
    protocolSeq: nextSeq,
    lastPacket: {
      seq: nextSeq,
      opcode: "VOICE_MEMO",
      hapticPattern: "crisp-tap",
      payloadSummaryKo: `3초 음성 대사 적재 (${memo.inferredStyle} · ${memo.durationSec}초)`,
      estimatedBleLatencyMs: 8.5,
    },
  };
}

/** 말풍선 메모 큐의 선두 항목을 꺼내 현재 컷 배치 이력으로 이동한다. */
export function consumeNextBalloonMemo(
  state: SmartwatchCompanionState,
): { readonly state: SmartwatchCompanionState; readonly consumed: BalloonVoiceMemoItem | null } {
  const head = state.balloonMemoQueue[0];
  if (!head) {
    return { state, consumed: null };
  }
  const nextSeq = state.protocolSeq + 1;
  return {
    consumed: head,
    state: {
      ...state,
      balloonMemoQueue: state.balloonMemoQueue.slice(1),
      placedMemoHistory: [head, ...state.placedMemoHistory].slice(0, 8),
      protocolSeq: nextSeq,
      lastPacket: {
        seq: nextSeq,
        opcode: "VOICE_MEMO",
        hapticPattern: "double-tap",
        payloadSummaryKo: `말풍선 배치 완료: "${head.cleanedDialogue.slice(0, 14)}"`,
        estimatedBleLatencyMs: 5.5,
      },
    },
  };
}
