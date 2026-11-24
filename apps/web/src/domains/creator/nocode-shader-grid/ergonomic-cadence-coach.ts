/**
 * 비의료 인체공학 작업 리듬 코치 (Wave 33 Track C).
 *
 * - 창작자의 로컬 입력 케이던스(분당 스트로크 밀도 · 연속 작업 시간 · 반복 실행취소 급증)만을
 *   인메모리에서 분석해 부드러운 휴식 타이밍과 가벼운 손목·어깨·시선 풀기 리듬을 제안한다.
 * - 외부 서버 전송 0바이트, 브라우저 영구 저장소(storage) 미사용, 일반 작업 리듬 가이드 전용이다.
 */

export type CadenceRhythmLevel = "steady" | "elevated" | "break-suggested" | "pause-now";
export type CadenceScenarioId = "calm-flow" | "focused-sprint" | "undo-surge-crunch";
export type StretchFocusArea = "wrist" | "fingers" | "shoulders" | "eyes";

export interface CadenceWindowSample {
  readonly minuteOffset: number;
  readonly strokesPerMinute: number;
  readonly undoCount: number;
}

export interface ErgonomicCadenceInput {
  readonly continuousWorkMinutes: number;
  readonly strokesPerMinute: number;
  readonly baselineStrokesPerMinute?: number;
  readonly recentUndoCount5Min: number;
  readonly baselineUndoCount5Min?: number;
  readonly lastBreakMinutesAgo?: number;
  readonly microPauseCountLastHour?: number;
  readonly preferredIntervalMinutes?: number;
  readonly sessionHistory?: readonly CadenceWindowSample[];
}

export interface GentleStretchRoutine {
  readonly id: string;
  readonly focusArea: StretchFocusArea;
  readonly durationSeconds: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly stepsKo: string;
  readonly stepsEn: string;
  readonly comfortNoteKo: string;
  readonly comfortNoteEn: string;
}

export interface CadenceSignalItem {
  readonly id: "stroke-density" | "continuous-session" | "undo-surge" | "cadence-trend";
  readonly intensity: "calm" | "notice" | "high";
  readonly valueLabelKo: string;
  readonly valueLabelEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
}

export interface CadencePrivacyGuarantee {
  readonly nonMedicalOnly: true;
  readonly diagnosticClaimsAllowed: false;
  readonly externalBytesTransmitted: 0;
  readonly networkRequestsMade: 0;
  readonly usesBrowserStorage: false;
  readonly processingScope: "local-memory-only";
}

export interface ErgonomicCadenceReport {
  readonly rhythmLevel: CadenceRhythmLevel;
  readonly overallPaceLoad: number;
  readonly strokeDensityIndex: number;
  readonly continuousSessionIndex: number;
  readonly undoSurgeIndex: number;
  readonly undoSurgeRatio: number;
  readonly undoSurgeDetected: boolean;
  readonly trendSlopePerWindow: number;
  readonly recommendedBreakMinutes: number;
  readonly nextSuggestedBreakInMinutes: number;
  readonly headlineKo: string;
  readonly headlineEn: string;
  readonly guidanceKo: string;
  readonly guidanceEn: string;
  readonly disclaimerKo: string;
  readonly disclaimerEn: string;
  readonly signals: readonly CadenceSignalItem[];
  readonly recommendedRoutines: readonly GentleStretchRoutine[];
  readonly privacy: CadencePrivacyGuarantee;
}

export const ERGONOMIC_COACH_CONTRACT: CadencePrivacyGuarantee = {
  nonMedicalOnly: true,
  diagnosticClaimsAllowed: false,
  externalBytesTransmitted: 0,
  networkRequestsMade: 0,
  usesBrowserStorage: false,
  processingScope: "local-memory-only",
} as const;

const WRIST_CIRCLE_ROUTINE: GentleStretchRoutine = {
  id: "wrist-circle-release",
  focusArea: "wrist",
  durationSeconds: 20,
  titleKo: "손목 천천히 원 그리기",
  titleEn: "Slow Wrist Circles",
  stepsKo: "펜을 내려놓고 양 손목을 바깥쪽·안쪽으로 각각 5바퀴씩 천천히 돌려 긴장을 풀어 주세요.",
  stepsEn: "Set your stylus down and slowly roll both wrists 5 times outward and 5 times inward.",
  comfortNoteKo: "편안한 범위에서만 부드럽게 움직이고 불편함이 느껴지면 바로 멈추세요.",
  comfortNoteEn: "Keep motion gentle within a comfortable range and stop immediately if anything feels off.",
};

const FINGER_FAN_ROUTINE: GentleStretchRoutine = {
  id: "finger-fan-stretch",
  focusArea: "fingers",
  durationSeconds: 20,
  titleKo: "손가락 활짝 펴기 · 오므리기",
  titleEn: "Gentle Finger Fan",
  stepsKo: "양손을 가볍게 쥐었다가 손가락 끝까지 천천히 활짝 펼치는 동작을 4회 반복해 주세요.",
  stepsEn: "Lightly close both hands and slowly spread all fingers wide for 4 calm repetitions.",
  comfortNoteKo: "힘을 과하게 주지 말고 물기를 털어내듯 가볍게 풀어 주세요.",
  comfortNoteEn: "Avoid forcing tension; keep fingers loose and relaxed.",
};

const SHOULDER_DROP_ROUTINE: GentleStretchRoutine = {
  id: "shoulder-drop-breath",
  focusArea: "shoulders",
  durationSeconds: 30,
  titleKo: "어깨 힘 빼기 · 깊은 호흡",
  titleEn: "Shoulder Drop & Breath",
  stepsKo: "숨을 들이마시며 어깨를 살짝 올렸다가, 길게 내쉬며 툭 떨어뜨리는 호흡을 3회 이어가세요.",
  stepsEn: "Inhale while gently lifting your shoulders, then drop them completely on a slow exhale, 3 times.",
  comfortNoteKo: "등받이에 편안히 기대어 목과 어깨 긴장을 내려놓으세요.",
  comfortNoteEn: "Rest comfortably against your chair back and let upper-body tension settle.",
};

const FAR_GAZE_ROUTINE: GentleStretchRoutine = {
  id: "far-gaze-reset",
  focusArea: "eyes",
  durationSeconds: 20,
  titleKo: "먼 곳 바라보기 시선 리셋",
  titleEn: "Distant Gaze Reset",
  stepsKo: "20초 동안 화면에서 시선을 떼고 창밖이나 6m 이상 먼 지점을 편안하게 바라보세요.",
  stepsEn: "Look away from the canvas for 20 seconds and rest your gaze on a spot at least 6 meters away.",
  comfortNoteKo: "눈을 두세 번 천천히 깜박이며 화면 초점을 잠시 비워 두세요.",
  comfortNoteEn: "Blink slowly a few times to give your focus a quiet reset.",
};

export const GENTLE_STRETCH_ROUTINES: readonly GentleStretchRoutine[] = [
  WRIST_CIRCLE_ROUTINE,
  FINGER_FAN_ROUTINE,
  SHOULDER_DROP_ROUTINE,
  FAR_GAZE_ROUTINE,
];

const DISCLAIMER_KO = "이 코치는 창작 작업 리듬과 휴식 간격을 돕는 일반 생활 가이드이며, 모든 계산은 기기 메모리에서만 처리되고 외부로 전송되지 않습니다.";
const DISCLAIMER_EN = "This coach offers general creative pacing and break-timing prompts. All calculations stay strictly in local memory with zero bytes sent externally.";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function computeHistoryTrendSlope(history: readonly CadenceWindowSample[] | undefined): number {
  if (!history || history.length < 2) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return 0;
  const span = Math.max(1, history.length - 1);
  const strokeDelta = (last.strokesPerMinute - first.strokesPerMinute) / span;
  const undoDelta = (last.undoCount - first.undoCount) * 2.5 / span;
  return roundTo(strokeDelta + undoDelta, 2);
}

/**
 * 로컬 입력 케이던스(스트로크 밀도 · 연속 작업 시간 · 반복 실행취소 급증)를 분석해
 * 부드러운 휴식·손목 스트레칭 안내 리듬을 계산한다.
 */
export function analyzeErgonomicCadence(input: ErgonomicCadenceInput): ErgonomicCadenceReport {
  const continuousMinutes = clamp(input.continuousWorkMinutes, 0, 480);
  const strokesPerMinute = clamp(input.strokesPerMinute, 0, 220);
  const baselineSpm = clamp(input.baselineStrokesPerMinute ?? 28, 8, 100);
  const recentUndo5m = clamp(input.recentUndoCount5Min, 0, 200);
  const baselineUndo5m = clamp(input.baselineUndoCount5Min ?? 4, 1, 40);
  const lastBreakAgo = clamp(input.lastBreakMinutesAgo ?? continuousMinutes, 0, 480);
  const microPauses = clamp(input.microPauseCountLastHour ?? 1, 0, 30);
  const preferredInterval = clamp(input.preferredIntervalMinutes ?? 45, 20, 90);

  // 1) 분당 스트로크 밀도 지수 (0..100)
  const spmRatio = strokesPerMinute / baselineSpm;
  const strokeDensityIndex = Math.round(
    clamp((spmRatio - 0.55) * 44 + Math.max(0, strokesPerMinute - 42) * 0.95, 0, 100),
  );

  // 2) 연속 작업 시간 지수 (0..100), 짧은 숨 고르기(microPause)가 있으면 완만하게 감쇠
  const effectiveMinutes = Math.max(continuousMinutes, lastBreakAgo * 0.85);
  const intervalRatio = effectiveMinutes / preferredInterval;
  const pauseRelief = Math.min(14, microPauses * 3.5);
  const continuousSessionIndex = Math.round(clamp(intervalRatio * 56 - pauseRelief, 0, 100));

  // 3) 반복 실행취소 급증 지수 (0..100)
  const undoSurgeRatio = roundTo(recentUndo5m / baselineUndo5m, 2);
  const undoSurgeDetected = undoSurgeRatio >= 2.2 || recentUndo5m >= 12;
  const undoSurgeIndex = Math.round(
    clamp((undoSurgeRatio - 0.9) * 28 + Math.max(0, recentUndo5m - 8) * 2.6, 0, 100),
  );

  // 4) 시간 창 추세 기울기 보너스
  const trendSlopePerWindow = computeHistoryTrendSlope(input.sessionHistory);
  const trendAdjustment = trendSlopePerWindow > 4 ? Math.min(10, Math.round(trendSlopePerWindow * 0.6)) : 0;

  const overallPaceLoad = Math.round(
    clamp(
      strokeDensityIndex * 0.36
        + continuousSessionIndex * 0.38
        + undoSurgeIndex * 0.26
        + trendAdjustment,
      0,
      100,
    ),
  );

  let rhythmLevel: CadenceRhythmLevel = "steady";
  if (overallPaceLoad >= 78 || (continuousMinutes >= preferredInterval * 1.65 && undoSurgeDetected)) {
    rhythmLevel = "pause-now";
  } else if (overallPaceLoad >= 56 || continuousMinutes >= preferredInterval * 1.15) {
    rhythmLevel = "break-suggested";
  } else if (overallPaceLoad >= 34 || undoSurgeDetected) {
    rhythmLevel = "elevated";
  }

  const recommendedBreakMinutes =
    rhythmLevel === "pause-now" ? 5 : rhythmLevel === "break-suggested" ? 3 : rhythmLevel === "elevated" ? 1 : 0;

  const nextSuggestedBreakInMinutes =
    rhythmLevel === "pause-now" || rhythmLevel === "break-suggested"
      ? 0
      : Math.max(1, Math.round(preferredInterval - continuousMinutes));

  const signals: CadenceSignalItem[] = [
    {
      id: "stroke-density",
      intensity: strokeDensityIndex >= 70 ? "high" : strokeDensityIndex >= 40 ? "notice" : "calm",
      valueLabelKo: `분당 ${Math.round(strokesPerMinute)}획 (평소 대비 ${roundTo(spmRatio, 2)}배)`,
      valueLabelEn: `${Math.round(strokesPerMinute)} strokes/min (${roundTo(spmRatio, 2)}x baseline)`,
      noteKo: strokeDensityIndex >= 70
        ? "빠른 템포의 연속 획이 이어지고 있어요. 잠깐 펜을 내려놓으면 손목 리듬이 부드러워집니다."
        : strokeDensityIndex >= 40
          ? "활발한 작업 템포를 유지 중입니다. 짧은 숨 고르기가 잘 어울리는 구간이에요."
          : "안정적이고 편안한 드로잉 속도를 유지하고 있어요.",
      noteEn: strokeDensityIndex >= 70
        ? "Rapid strokes have been sustained. Setting the stylus down briefly helps reset your hand rhythm."
        : strokeDensityIndex >= 40
          ? "Active drawing tempo detected — a brief micro-pause fits nicely here."
          : "Drawing pace is steady and comfortable.",
    },
    {
      id: "continuous-session",
      intensity: continuousSessionIndex >= 70 ? "high" : continuousSessionIndex >= 42 ? "notice" : "calm",
      valueLabelKo: `연속 ${Math.round(continuousMinutes)}분 (권장 간격 ${Math.round(preferredInterval)}분)`,
      valueLabelEn: `${Math.round(continuousMinutes)}m continuous (${Math.round(preferredInterval)}m target)`,
      noteKo: continuousSessionIndex >= 70
        ? "설정한 집중 구간을 훌쩍 지났어요. 자리에서 일어나 3~5분 환기하면 다음 컷이 훨씬 또렷해집니다."
        : continuousSessionIndex >= 42
          ? "곧 휴식 타이밍이 다가오고 있어요. 현재 컷 마무리 후 가볍게 쉬어 가세요."
          : `다음 권장 휴식까지 약 ${nextSuggestedBreakInMinutes}분 여유가 있습니다.`,
      noteEn: continuousSessionIndex >= 70
        ? "You have passed your target focus interval. A 3-5 minute stand-up break refreshes visual clarity."
        : continuousSessionIndex >= 42
          ? "Approaching your preferred break window — wrap up the current stroke and pause."
          : `About ${nextSuggestedBreakInMinutes} minutes until your next suggested break.`,
    },
    {
      id: "undo-surge",
      intensity: undoSurgeDetected ? "high" : undoSurgeIndex >= 35 ? "notice" : "calm",
      valueLabelKo: `최근 5분 실행취소 ${Math.round(recentUndo5m)}회 (${undoSurgeRatio}배)`,
      valueLabelEn: `${Math.round(recentUndo5m)} undos in 5m (${undoSurgeRatio}x baseline)`,
      noteKo: undoSurgeDetected
        ? "같은 선을 여러 번 되돌리는 구간이 감지되었어요. 2분만 화면에서 시선을 떼고 전체 비율을 다시 보세요."
        : "실행취소 빈도가 평소 흐름 안에 머물러 있어요.",
      noteEn: undoSurgeDetected
        ? "Repeated undo bursts detected. Stepping back from the screen for two minutes often unlocks fresh perspective."
        : "Undo frequency is within your normal creative flow.",
    },
  ];

  if (input.sessionHistory && input.sessionHistory.length >= 2) {
    signals.push({
      id: "cadence-trend",
      intensity: trendSlopePerWindow >= 6 ? "high" : trendSlopePerWindow >= 2.5 ? "notice" : "calm",
      valueLabelKo: `구간 상승 추세 ${trendSlopePerWindow >= 0 ? "+" : ""}${trendSlopePerWindow}`,
      valueLabelEn: `Window trend ${trendSlopePerWindow >= 0 ? "+" : ""}${trendSlopePerWindow}`,
      noteKo: trendSlopePerWindow >= 6
        ? "작업 속도와 되돌림 빈도가 빠르게 올라가고 있어요. 한 박자 쉬어가는 타이밍입니다."
        : "최근 작업 구간 리듬 변화가 완만합니다.",
      noteEn: trendSlopePerWindow >= 6
        ? "Stroke tempo and undo frequency are climbing quickly — a short pause will steady the pace."
        : "Recent cadence trend remains smooth.",
    });
  }

  let headlineKo: string;
  let headlineEn: string;
  let guidanceKo: string;
  let guidanceEn: string;
  let recommendedRoutines: readonly GentleStretchRoutine[];

  if (rhythmLevel === "pause-now") {
    headlineKo = "잠시 펜을 내려두고 5분 쉬어갈 타이밍이에요";
    headlineEn = "Great moment to set the stylus down for a 5-minute reset";
    guidanceKo = undoSurgeDetected
      ? "긴 연속 작업과 반복 실행취소가 겹쳤습니다. 손목 원 그리기와 먼 곳 바라보기로 리듬을 비워 보세요."
      : "집중 시간이 길어졌어요. 가벼운 손목·어깨 풀기와 물 한 잔으로 다음 작업 감각을 되살려 보세요.";
    guidanceEn = undoSurgeDetected
      ? "Long continuous focus and repeated undos overlapped. Try gentle wrist circles and a distant gaze to reset."
      : "Your focus stretch has run long. A quick wrist/shoulder stretch and a sip of water will refresh your rhythm.";
    recommendedRoutines = GENTLE_STRETCH_ROUTINES;
  } else if (rhythmLevel === "break-suggested") {
    headlineKo = "부드러운 3분 휴식과 손목 스트레칭을 제안해요";
    headlineEn = "Suggesting a gentle 3-minute break and wrist stretch";
    guidanceKo = "지금 작업 중인 획을 정리한 뒤 손목과 손가락을 가볍게 풀어 주면 선 감각이 한결 편안해집니다.";
    guidanceEn = "After finishing this stroke, a brief wrist and finger release will keep your linework smooth.";
    recommendedRoutines = [WRIST_CIRCLE_ROUTINE, FINGER_FAN_ROUTINE, FAR_GAZE_ROUTINE];
  } else if (rhythmLevel === "elevated") {
    headlineKo = "집중 템포 구간 — 1분 숨 고르기 추천";
    headlineEn = "High-focus tempo — 1-minute breather recommended";
    guidanceKo = "작업 밀도가 올라가고 있어요. 20초 정도 먼 곳을 바라보고 어깨 힘을 살짝 빼 보세요.";
    guidanceEn = "Tempo is picking up. Rest your eyes on a distant point for 20 seconds and drop your shoulders.";
    recommendedRoutines = [FAR_GAZE_ROUTINE, SHOULDER_DROP_ROUTINE];
  } else {
    headlineKo = "여유롭고 안정적인 작업 리듬이에요";
    headlineEn = "Steady, comfortable creative rhythm";
    guidanceKo = `지금 페이스가 아주 좋습니다. 약 ${nextSuggestedBreakInMinutes}분 뒤에 가벼운 휴식 안내를 띄워 드릴게요.`;
    guidanceEn = `Your current flow looks balanced. Next gentle break reminder in about ${nextSuggestedBreakInMinutes} minutes.`;
    recommendedRoutines = [WRIST_CIRCLE_ROUTINE];
  }

  return {
    rhythmLevel,
    overallPaceLoad,
    strokeDensityIndex,
    continuousSessionIndex,
    undoSurgeIndex,
    undoSurgeRatio,
    undoSurgeDetected,
    trendSlopePerWindow,
    recommendedBreakMinutes,
    nextSuggestedBreakInMinutes,
    headlineKo,
    headlineEn,
    guidanceKo,
    guidanceEn,
    disclaimerKo: DISCLAIMER_KO,
    disclaimerEn: DISCLAIMER_EN,
    signals,
    recommendedRoutines,
    privacy: ERGONOMIC_COACH_CONTRACT,
  };
}

/** 스튜디오 체험·테스트용 3종 대표 로컬 케이던스 시나리오 생성. */
export function createDemoCadenceScenario(scenario: CadenceScenarioId): ErgonomicCadenceInput {
  if (scenario === "undo-surge-crunch") {
    return {
      continuousWorkMinutes: 78,
      strokesPerMinute: 68,
      baselineStrokesPerMinute: 28,
      recentUndoCount5Min: 19,
      baselineUndoCount5Min: 4,
      lastBreakMinutesAgo: 82,
      microPauseCountLastHour: 0,
      preferredIntervalMinutes: 45,
      sessionHistory: [
        { minuteOffset: 0, strokesPerMinute: 30, undoCount: 3 },
        { minuteOffset: 25, strokesPerMinute: 46, undoCount: 7 },
        { minuteOffset: 50, strokesPerMinute: 58, undoCount: 12 },
        { minuteOffset: 75, strokesPerMinute: 68, undoCount: 19 },
      ],
    };
  }
  if (scenario === "focused-sprint") {
    return {
      continuousWorkMinutes: 48,
      strokesPerMinute: 45,
      baselineStrokesPerMinute: 28,
      recentUndoCount5Min: 8,
      baselineUndoCount5Min: 4,
      lastBreakMinutesAgo: 48,
      microPauseCountLastHour: 1,
      preferredIntervalMinutes: 45,
      sessionHistory: [
        { minuteOffset: 0, strokesPerMinute: 28, undoCount: 3 },
        { minuteOffset: 24, strokesPerMinute: 39, undoCount: 6 },
        { minuteOffset: 48, strokesPerMinute: 45, undoCount: 8 },
      ],
    };
  }
  return {
    continuousWorkMinutes: 20,
    strokesPerMinute: 24,
    baselineStrokesPerMinute: 28,
    recentUndoCount5Min: 3,
    baselineUndoCount5Min: 4,
    lastBreakMinutesAgo: 20,
    microPauseCountLastHour: 3,
    preferredIntervalMinutes: 45,
    sessionHistory: [
      { minuteOffset: 0, strokesPerMinute: 22, undoCount: 2 },
      { minuteOffset: 20, strokesPerMinute: 24, undoCount: 3 },
    ],
  };
}

export interface LocalCadenceSessionTracker {
  recordStrokes(count?: number): ErgonomicCadenceInput;
  recordUndo(count?: number): ErgonomicCadenceInput;
  advanceMinutes(minutes: number): ErgonomicCadenceInput;
  recordBreakCompleted(breakMinutes?: number): ErgonomicCadenceInput;
  getSnapshot(): ErgonomicCadenceInput;
  evaluate(): ErgonomicCadenceReport;
}

/**
 * 영구 저장소·네트워크를 전혀 사용하지 않는 순수 인메모리 로컬 케이던스 세션 추적기.
 */
export function createLocalCadenceTracker(initial?: Partial<ErgonomicCadenceInput>): LocalCadenceSessionTracker {
  let state: {
    continuousWorkMinutes: number;
    strokesPerMinute: number;
    baselineStrokesPerMinute: number;
    recentUndoCount5Min: number;
    baselineUndoCount5Min: number;
    lastBreakMinutesAgo: number;
    microPauseCountLastHour: number;
    preferredIntervalMinutes: number;
  } = {
    continuousWorkMinutes: clamp(initial?.continuousWorkMinutes ?? 18, 0, 480),
    strokesPerMinute: clamp(initial?.strokesPerMinute ?? 26, 0, 220),
    baselineStrokesPerMinute: clamp(initial?.baselineStrokesPerMinute ?? 28, 8, 100),
    recentUndoCount5Min: clamp(initial?.recentUndoCount5Min ?? 3, 0, 200),
    baselineUndoCount5Min: clamp(initial?.baselineUndoCount5Min ?? 4, 1, 40),
    lastBreakMinutesAgo: clamp(initial?.lastBreakMinutesAgo ?? initial?.continuousWorkMinutes ?? 18, 0, 480),
    microPauseCountLastHour: clamp(initial?.microPauseCountLastHour ?? 2, 0, 30),
    preferredIntervalMinutes: clamp(initial?.preferredIntervalMinutes ?? 45, 20, 90),
  };

  const getSnapshot = (): ErgonomicCadenceInput => ({ ...state });

  return {
    recordStrokes(count = 6): ErgonomicCadenceInput {
      state = {
        ...state,
        strokesPerMinute: clamp(state.strokesPerMinute + Math.max(1, count), 0, 220),
      };
      return getSnapshot();
    },
    recordUndo(count = 2): ErgonomicCadenceInput {
      state = {
        ...state,
        recentUndoCount5Min: clamp(state.recentUndoCount5Min + Math.max(1, count), 0, 200),
      };
      return getSnapshot();
    },
    advanceMinutes(minutes: number): ErgonomicCadenceInput {
      const delta = Math.max(0, minutes);
      state = {
        ...state,
        continuousWorkMinutes: clamp(state.continuousWorkMinutes + delta, 0, 480),
        lastBreakMinutesAgo: clamp(state.lastBreakMinutesAgo + delta, 0, 480),
      };
      return getSnapshot();
    },
    recordBreakCompleted(breakMinutes = 3): ErgonomicCadenceInput {
      const recovered = breakMinutes >= 3;
      state = {
        ...state,
        continuousWorkMinutes: recovered ? 0 : Math.max(0, state.continuousWorkMinutes - 15),
        lastBreakMinutesAgo: 0,
        recentUndoCount5Min: Math.max(0, Math.floor(state.recentUndoCount5Min * 0.25)),
        strokesPerMinute: Math.min(state.strokesPerMinute, state.baselineStrokesPerMinute),
        microPauseCountLastHour: clamp(state.microPauseCountLastHour + 1, 0, 30),
      };
      return getSnapshot();
    },
    getSnapshot,
    evaluate(): ErgonomicCadenceReport {
      return analyzeErgonomicCadence(getSnapshot());
    },
  };
}
