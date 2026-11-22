import {
  STUDIO_CHARACTER_BODY_SCALE_LOCK,
  computeVirtualSpaceDaylightAtHour,
  type StudioCharacterBodyScaleLock,
  type StudioDaylightPeriod,
  type StudioDaylightSample,
} from "./atmosphere/virtual-space-daylight-shadow";
import type { StudioLiveWorkState } from "./atmosphere/virtual-space-live-choreography";
import type { StudioAmbientTrackId } from "./studio-virtual-space-ambient-tracks";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";

export {
  VIRTUAL_SPACE_DEFAULT_MIN_GAP_PX,
  VIRTUAL_SPACE_FALLBACK_VIEWPORT_HEIGHT_PX,
  VIRTUAL_SPACE_FALLBACK_VIEWPORT_WIDTH_PX,
  VIRTUAL_SPACE_MOBILE_BREAKPOINT_PX,
  VIRTUAL_SPACE_NARROW_BREAKPOINT_PX,
  classifyVirtualSpaceViewport,
  computeVirtualSpaceHudSafeOffset,
  resolveVirtualSpaceViewportMetrics,
  type VirtualSpaceHudHandedness,
  type VirtualSpaceHudRect,
  type VirtualSpaceHudSafeOffsetInput,
  type VirtualSpaceHudSafeOffsetResult,
  type VirtualSpaceViewportClass,
} from "./virtual-space-hud-safe-offset";

/**
 * 가상 스튜디오(`/studio/space`) 포모도로 공동 마감실 · 24시간 자연광 연동 앰비언스 ·
 * 좌석별 2상태 토글 순수 도메인 계약.
 *
 * - 서버 타이머·WebSocket 브로드캐스트 없이 기기 로컬 시계(epoch % 60분)로
 *   전 참가자가 동일한 `50분 무음 작화 + 10분 자동 휴식 벨` 리듬을 ₩0으로 동기화한다.
 * - 마이크 연결을 강요하지 않는 무음 타블렛 작화 기본 모드를 유지한다.
 * - 자연광 연동 빗소리·연필 사각임 앰비언스는 기본 OFF(옵트인)이며
 *   출력 게인은 `clampAmbientAudioGain`으로 `0.25` 이하로 하드 클램프한다.
 * - 브라우저 로컬 저장소를 직접 호출하지 않는다.
 */

/** 기본 공간 모드 식별자(마이크 강요 없는 무음 포모도로 공동 마감실). */
export const VIRTUAL_SPACE_DEFAULT_ROOM_MODE = "silent-pomodoro-cowork" as const;

/** 무음 작화 구간 길이(분). */
export const POMODORO_FOCUS_MINUTES = 50;

/** 자동 휴식 벨 구간 길이(분). */
export const POMODORO_BREAK_MINUTES = 10;

/** 무음 작화 구간 길이(ms). */
export const POMODORO_FOCUS_DURATION_MS = POMODORO_FOCUS_MINUTES * 60_000;

/** 자동 휴식 벨 구간 길이(ms). */
export const POMODORO_BREAK_DURATION_MS = POMODORO_BREAK_MINUTES * 60_000;

/** 1사이클 전체 길이(60분 = 3,600,000ms). */
export const POMODORO_CYCLE_MS = POMODORO_FOCUS_DURATION_MS + POMODORO_BREAK_DURATION_MS;

/** 24시간 자연광 연동 앰비언스 게인 상한(하드 클램프, 0.25). */
export const STUDIO_AMBIENT_AUDIO_MAX_GAIN = 0.25;

/** 24시간 자연광 연동 앰비언스 초기 권장 게인(기본 OFF 상태에서 켜졌을 때의 부드러운 음량). */
export const STUDIO_AMBIENT_AUDIO_DEFAULT_GAIN = 0.16;

export type PomodoroRoomPhase = "silent-drawing" | "break-bell";

export type PomodoroRoomBellKind = "break-start" | "focus-resume";

export interface PomodoroRoomClockOptions {
  /** 로컬 시계 동기화 기준 오프셋(ms). 기본 0(매시 정각 :00 시작, :50 휴식 벨). */
  readonly anchorOffsetMs?: number;
  /** 무음 작화 길이(ms). 기본 50분. */
  readonly focusDurationMs?: number;
  /** 휴식 벨 길이(ms). 기본 10분. */
  readonly breakDurationMs?: number;
}

export interface PomodoroRoomClockSnapshot {
  readonly roomMode: typeof VIRTUAL_SPACE_DEFAULT_ROOM_MODE;
  readonly phase: PomodoroRoomPhase;
  /** 동기화된 로컬 시계 사이클 순번. */
  readonly cycleIndex: number;
  /** 현재 사이클 시작 시각(ms epoch). */
  readonly cycleStartAtMs: number;
  /** 현재 구간 경과 시간(ms). */
  readonly elapsedMs: number;
  /** 현재 구간 남은 시간(ms). */
  readonly remainingMs: number;
  /** 현재 구간 전체 길이(ms). */
  readonly durationMs: number;
  /** 현재 구간 진행률(0~1). */
  readonly progress: number;
  /** 남은 시간 표시 문자열("MM:SS"). */
  readonly clockLabel: string;
  readonly phaseLabelKo: string;
  readonly phaseLabelEn: string;
  /** 다음 자동 휴식/재개 벨 예정 시각(ms epoch). */
  readonly nextBellAtMs: number;
  /** 기본 공간 모드에서 마이크가 필수인지 여부 — 항상 false. */
  readonly micRequired: false;
}

export interface PomodoroRoomBellEvent {
  readonly kind: PomodoroRoomBellKind;
  readonly cycleIndex: number;
  readonly atMs: number;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface PomodoroProgressRingSpec {
  readonly radius: number;
  readonly strokeWidth: number;
  readonly size: number;
  readonly circumference: number;
  readonly strokeDasharray: string;
  readonly strokeDashoffset: number;
  readonly progress: number;
  readonly percent: number;
}

/** 좌석별 2상태 토글 값(방해 금지 / 피드백 환영). */
export type VirtualSpaceSeatStatus = "do-not-disturb" | "feedback-welcome";

export interface VirtualSpaceSeatStatusMeta {
  readonly id: VirtualSpaceSeatStatus;
  readonly labelKo: "방해 금지" | "피드백 환영";
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly allowsKnock: boolean;
  readonly allowsFeedbackPing: boolean;
}

export const VIRTUAL_SPACE_SEAT_STATUS_ORDER: readonly VirtualSpaceSeatStatus[] = Object.freeze([
  "do-not-disturb",
  "feedback-welcome",
]);

export const VIRTUAL_SPACE_SEAT_STATUS_META: Readonly<
  Record<VirtualSpaceSeatStatus, VirtualSpaceSeatStatusMeta>
> = Object.freeze({
  "do-not-disturb": Object.freeze({
    id: "do-not-disturb",
    labelKo: "방해 금지",
    labelEn: "Do not disturb",
    descriptionKo: "조용히 작화에 집중하고 있어요",
    descriptionEn: "Focused on silent drawing right now",
    allowsKnock: false,
    allowsFeedbackPing: false,
  }),
  "feedback-welcome": Object.freeze({
    id: "feedback-welcome",
    labelKo: "피드백 환영",
    labelEn: "Feedback welcome",
    descriptionKo: "가볍게 다가와 피드백을 나눠도 좋아요",
    descriptionEn: "Open for quick feedback or a brief check-in",
    allowsKnock: true,
    allowsFeedbackPing: true,
  }),
});

export type SilentTabletMotionKind = "silent-tablet-stroke" | "rest-stretch-idle";

export interface SilentTabletDrawingMotionInput {
  readonly phase: PomodoroRoomPhase;
  readonly seatStatus: VirtualSpaceSeatStatus;
  readonly elapsedMs: number;
  readonly reducedMotion?: boolean;
  /** 사용자가 휴식 중 직접 마이크를 켠 경우에만 true. 기본 false(음소거). */
  readonly userUnmutedMic?: boolean;
}

export interface SilentTabletDrawingMotionState {
  readonly roomMode: typeof VIRTUAL_SPACE_DEFAULT_ROOM_MODE;
  readonly motionKind: SilentTabletMotionKind;
  readonly choreographyWorkState: StudioLiveWorkState;
  readonly choreographyAction: "tablet-drawing" | "coffee-break";
  /** 마이크 강요 없음 — 항상 false. */
  readonly micRequired: false;
  /** 무음 작화 중이거나 방해 금지 좌석이면 기본 무음 유지. */
  readonly micAutoMuted: boolean;
  /** 캐릭터 본체 등신 스케일 불변 잠금(항상 1.0). */
  readonly bodyScale: StudioCharacterBodyScaleLock;
  /** 타블렛 펜촉 리듬 위상(0~1). reducedMotion이면 0 고정. */
  readonly stylusCyclePhase: number;
  /** 펜촉 미세 가로 오프셋(px). reducedMotion이면 0 고정. */
  readonly stylusOffsetX: number;
  /** 펜촉 미세 세로 오프셋(px). reducedMotion이면 0 고정. */
  readonly stylusOffsetY: number;
  /** 작업 집중 상태 표시 강도(0~1). */
  readonly penGlowOpacity: number;
  readonly statusBadgeKo: string;
  readonly statusBadgeEn: string;
  readonly solidarityCaptionKo: string;
  readonly solidarityCaptionEn: string;
}

export type DaylightAmbienceSourceMode = "auto" | "rain" | "pencil-scratch";

export interface DaylightAmbienceModeOption {
  readonly id: DaylightAmbienceSourceMode;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const DAYLIGHT_AMBIENCE_MODES: readonly DaylightAmbienceModeOption[] = Object.freeze([
  Object.freeze({ id: "auto", labelKo: "자연광 자동", labelEn: "Auto daylight" }),
  Object.freeze({ id: "rain", labelKo: "빗소리", labelEn: "Rain" }),
  Object.freeze({ id: "pencil-scratch", labelKo: "연필 사각임", labelEn: "Pencil scratch" }),
]);

export interface DaylightLinkedAmbienceInput {
  /** 현재 시각(0~24, 소수 허용). */
  readonly hour: number;
  /** 옵트인 활성화 여부. 기본 false(OFF). */
  readonly enabled?: boolean;
  /** 소리 선택 모드(자연광 자동 / 빗소리 / 연필 사각임). 기본 "auto". */
  readonly mode?: DaylightAmbienceSourceMode;
  /** 사용자 요청 볼륨(0~1). 내부에서 clampAmbientAudioGain으로 <= 0.25 클램프된다. */
  readonly requestedGain?: number;
  /** 근접 대화/허들 진행 중 덕킹 여부. 기본 false. */
  readonly ducked?: boolean;
  /** 외부 날씨 조건(비·천둥 시 자동 모드에서 빗소리 우선). */
  readonly weather?: StudioWeatherCondition | null;
}

export interface DaylightLinkedAmbienceSnapshot {
  readonly enabled: boolean;
  readonly mode: DaylightAmbienceSourceMode;
  readonly daylight: StudioDaylightSample;
  readonly recommendedTrackId: Extract<
    StudioAmbientTrackId,
    "synth-soft-rain" | "synth-pencil-scratch"
  >;
  readonly resolvedTrackId: Extract<
    StudioAmbientTrackId,
    "synth-soft-rain" | "synth-pencil-scratch"
  >;
  readonly maxGain: typeof STUDIO_AMBIENT_AUDIO_MAX_GAIN;
  /** 클램프된 사용자 설정 볼륨(0~0.25). */
  readonly clampedUserGain: number;
  /** 시간대 자연광 보정 배율(0.8~1.0). */
  readonly daylightGainFactor: number;
  /** 실제 WebAudio GainNode에 적용되는 최종 게인(비활성 시 0, 항상 <= 0.25). */
  readonly effectiveGain: number;
  /** 빗소리 질감 비중(0~1). */
  readonly rainWeight: number;
  /** 연필 사각임 질감 비중(0~1). */
  readonly pencilWeight: number;
  /** 시간대 색온도에 맞춘 저역 필터 차단 주파수(Hz). */
  readonly filterCutoffHz: number;
  readonly soundLabelKo: string;
  readonly soundLabelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface PomodoroBellChimeOptions {
  readonly kind?: PomodoroRoomBellKind;
  /** 옵트인 여부. 기본 false(명시적으로 켠 경우에만 벨 재생). */
  readonly enabled?: boolean;
  /** 요청 게인(내부에서 clampAmbientAudioGain으로 <= 0.25 클램프). */
  readonly gain?: number;
  readonly reducedMotion?: boolean;
  readonly createContext?: () => AudioContext;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cleanDurationMs(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/**
 * 앰비언스·휴식 벨 오디오 출력 게인을 `[0, 0.25]` 범위로 하드 클램프한다.
 * NaN·Infinity·음수는 `0`, `0.25` 초과는 정확히 `0.25`로 제한한다.
 */
export function clampAmbientAudioGain(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(STUDIO_AMBIENT_AUDIO_MAX_GAIN, Math.round(value * 10_000) / 10_000);
}

/** 남은 시간을 `MM:SS` 형식으로 포맷한다(초 단위 올림으로 00:00은 실제 전환 직전에만 노출). */
export function formatPomodoroClockMmSs(remainingMs: number): string {
  const safeMs = Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * ₩0 로컬 시계 동기화 포모도로 공동 마감실 상태를 계산한다.
 * 모든 기기가 동일한 `nowMs` 기준 `50분 무음 작화 + 10분 자동 휴식 벨` 리듬을 공유한다.
 */
export function evaluatePomodoroRoomClock(
  nowMs: number,
  options?: PomodoroRoomClockOptions,
): PomodoroRoomClockSnapshot {
  const safeNow = Number.isFinite(nowMs) ? Math.floor(nowMs) : 0;
  const anchorOffsetMs =
    options?.anchorOffsetMs !== undefined && Number.isFinite(options.anchorOffsetMs)
      ? Math.floor(options.anchorOffsetMs)
      : 0;
  const focusDurationMs = cleanDurationMs(options?.focusDurationMs, POMODORO_FOCUS_DURATION_MS);
  const breakDurationMs = cleanDurationMs(options?.breakDurationMs, POMODORO_BREAK_DURATION_MS);
  const cycleMs = focusDurationMs + breakDurationMs;

  const shifted = safeNow - anchorOffsetMs;
  const cycleIndex = Math.floor(shifted / cycleMs);
  const cycleStartAtMs = cycleIndex * cycleMs + anchorOffsetMs;
  const elapsedInCycleMs = safeNow - cycleStartAtMs;

  if (elapsedInCycleMs < focusDurationMs) {
    const remainingMs = focusDurationMs - elapsedInCycleMs;
    return Object.freeze({
      roomMode: VIRTUAL_SPACE_DEFAULT_ROOM_MODE,
      phase: "silent-drawing",
      cycleIndex,
      cycleStartAtMs,
      elapsedMs: elapsedInCycleMs,
      remainingMs,
      durationMs: focusDurationMs,
      progress: clamp01(elapsedInCycleMs / focusDurationMs),
      clockLabel: formatPomodoroClockMmSs(remainingMs),
      phaseLabelKo: "50분 무음 작화",
      phaseLabelEn: "50m silent drawing",
      nextBellAtMs: cycleStartAtMs + focusDurationMs,
      micRequired: false,
    });
  }

  const breakElapsedMs = elapsedInCycleMs - focusDurationMs;
  const remainingMs = Math.max(0, cycleMs - elapsedInCycleMs);
  return Object.freeze({
    roomMode: VIRTUAL_SPACE_DEFAULT_ROOM_MODE,
    phase: "break-bell",
    cycleIndex,
    cycleStartAtMs,
    elapsedMs: breakElapsedMs,
    remainingMs,
    durationMs: breakDurationMs,
    progress: clamp01(breakElapsedMs / breakDurationMs),
    clockLabel: formatPomodoroClockMmSs(remainingMs),
    phaseLabelKo: "10분 휴식 벨",
    phaseLabelEn: "10m break bell",
    nextBellAtMs: cycleStartAtMs + cycleMs,
    micRequired: false,
  });
}

/**
 * 두 시각 사이에 50분 무음 작화 ↔ 10분 자동 휴식 벨 경계를 넘었는지 판정한다.
 */
export function detectPomodoroRoomBellTransition(
  previousNowMs: number,
  currentNowMs: number,
  options?: PomodoroRoomClockOptions,
): PomodoroRoomBellEvent | null {
  if (!Number.isFinite(previousNowMs) || !Number.isFinite(currentNowMs)) return null;
  if (currentNowMs <= previousNowMs) return null;

  const prev = evaluatePomodoroRoomClock(previousNowMs, options);
  const curr = evaluatePomodoroRoomClock(currentNowMs, options);
  if (prev.phase === curr.phase && prev.cycleIndex === curr.cycleIndex) return null;

  if (curr.phase === "break-bell") {
    return Object.freeze({
      kind: "break-start",
      cycleIndex: curr.cycleIndex,
      atMs: Math.floor(currentNowMs),
      messageKo: "50분 무음 작화가 끝났어요. 10분 휴식 벨이 울렸어요.",
      messageEn: "50m silent drawing complete. The 10m break bell has rung.",
    });
  }

  return Object.freeze({
    kind: "focus-resume",
    cycleIndex: curr.cycleIndex,
    atMs: Math.floor(currentNowMs),
    messageKo: "10분 휴식이 끝났어요. 다시 50분 무음 작화를 시작해요.",
    messageEn: "Break finished. Starting the next 50m silent drawing session.",
  });
}

/** 포모도로 진행률 SVG 링 기하 수치를 계산한다. */
export function computePomodoroProgressRing(
  progress: number,
  options?: { readonly radius?: number; readonly strokeWidth?: number },
): PomodoroProgressRingSpec {
  const safeProgress = clamp01(progress);
  const radius =
    options?.radius !== undefined && Number.isFinite(options.radius) && options.radius >= 8
      ? options.radius
      : 20;
  const strokeWidth =
    options?.strokeWidth !== undefined &&
    Number.isFinite(options.strokeWidth) &&
    options.strokeWidth >= 1
      ? options.strokeWidth
      : 3.5;
  const circumference = Math.round(2 * Math.PI * radius * 100) / 100;
  const strokeDashoffset = Math.round(circumference * (1 - safeProgress) * 100) / 100;
  const size = Math.ceil((radius + strokeWidth) * 2);

  return Object.freeze({
    radius,
    strokeWidth,
    size,
    circumference,
    strokeDasharray: `${circumference} ${circumference}`,
    strokeDashoffset,
    progress: safeProgress,
    percent: Math.round(safeProgress * 100),
  });
}

/**
 * 10분 자동 휴식 벨 / 작화 재개 벨을 부드러운 로컬 합성음으로 재생한다.
 * 기본값은 `enabled: false`(옵트인)이며 출력 게인은 `clampAmbientAudioGain`(<= 0.25)로 제한한다.
 */
export function playPomodoroRoomBellChime(options?: PomodoroBellChimeOptions): boolean {
  if (options?.enabled !== true) return false;
  const peakGain = clampAmbientAudioGain(options.gain ?? 0.14);
  if (peakGain <= 0) return false;

  const createContext =
    options.createContext ??
    (() => {
      if (typeof window === "undefined") {
        throw new Error("AudioContext unavailable");
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error("AudioContext unavailable");
      return new AudioCtx();
    });

  const reduced = options.reducedMotion === true;
  const kind: PomodoroRoomBellKind = options.kind ?? "break-start";
  const notes: readonly number[] = reduced
    ? [kind === "break-start" ? 523.25 : 440]
    : kind === "break-start"
      ? [523.25, 659.25]
      : [440, 587.33];

  try {
    const context = createContext();
    const startBase = context.currentTime;
    const stepSec = reduced ? 0 : 0.12;
    const durationSec = reduced ? 0.18 : 0.3;

    notes.forEach((hz, idx) => {
      const startAt = startBase + idx * stepSec;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(startAt);
      osc.stop(startAt + durationSec + 0.02);
    });

    const closeDelayMs = Math.ceil((notes.length * stepSec + durationSec + 0.12) * 1000);
    globalThis.setTimeout(() => {
      void context.close().catch(() => undefined);
    }, closeDelayMs);
    return true;
  } catch {
    return false;
  }
}

/** 좌석별 2상태 초기 맵을 만든다. 기본 상태는 무음 공동 마감실에 맞는 "방해 금지". */
export function createVirtualSpaceSeatStatusMap(
  seatIds: readonly string[],
  defaultStatus: VirtualSpaceSeatStatus = "do-not-disturb",
): Readonly<Record<string, VirtualSpaceSeatStatus>> {
  const map: Record<string, VirtualSpaceSeatStatus> = {};
  for (const seatId of seatIds) {
    if (seatId.trim().length > 0) {
      map[seatId] = defaultStatus;
    }
  }
  return Object.freeze(map);
}

/** 좌석 2상태를 반대 상태로 전환한다("방해 금지" ↔ "피드백 환영"). */
export function toggleVirtualSpaceSeatStatus(
  status: VirtualSpaceSeatStatus,
): VirtualSpaceSeatStatus {
  return status === "do-not-disturb" ? "feedback-welcome" : "do-not-disturb";
}

/** 특정 좌석의 2상태를 불변으로 설정한다. */
export function setVirtualSpaceSeatStatus(
  statuses: Readonly<Record<string, VirtualSpaceSeatStatus>>,
  seatId: string,
  status: VirtualSpaceSeatStatus,
): Readonly<Record<string, VirtualSpaceSeatStatus>> {
  if (statuses[seatId] === status) return statuses;
  return Object.freeze({ ...statuses, [seatId]: status });
}

/** 특정 좌석의 2상태를 읽는다(미등록 좌석은 기본 "방해 금지"). */
export function getVirtualSpaceSeatStatus(
  statuses: Readonly<Record<string, VirtualSpaceSeatStatus>>,
  seatId: string,
): VirtualSpaceSeatStatus {
  return statuses[seatId] ?? "do-not-disturb";
}

/** 좌석 상태 메타데이터(한국어 평문 라벨 포함)를 돌려준다. */
export function getVirtualSpaceSeatStatusMeta(
  status: VirtualSpaceSeatStatus,
): VirtualSpaceSeatStatusMeta {
  return VIRTUAL_SPACE_SEAT_STATUS_META[status];
}

/**
 * 무음 타블렛 작화 모션 상태 계약을 계산한다.
 * - 마이크 연결을 강요하지 않으며(`micRequired: false`), 캐릭터 본체 스케일은 항상 `1.0` 고정이다.
 * - `reducedMotion: true`에서는 펜촉 움직임을 정지(0px)하고 정적 집중 표시만 유지한다.
 */
export function resolveSilentTabletDrawingMotion(
  input: SilentTabletDrawingMotionInput,
): SilentTabletDrawingMotionState {
  const isDrawing = input.phase === "silent-drawing";
  const reducedMotion = input.reducedMotion === true;
  const safeElapsedMs = Number.isFinite(input.elapsedMs) && input.elapsedMs >= 0 ? input.elapsedMs : 0;
  const seatMeta = getVirtualSpaceSeatStatusMeta(input.seatStatus);

  // 2.4초 주기의 잔잔한 타블렛 펜촉 리듬(reduced-motion이면 0 고정).
  const cyclePhase = isDrawing && !reducedMotion ? (safeElapsedMs % 2400) / 2400 : 0;
  const angle = cyclePhase * Math.PI * 2;
  const stylusOffsetX =
    isDrawing && !reducedMotion ? Math.round(Math.sin(angle) * 2.4 * 100) / 100 : 0;
  const stylusOffsetY =
    isDrawing && !reducedMotion ? Math.round(Math.sin(angle * 2) * 1.2 * 100) / 100 : 0;

  const micAutoMuted =
    isDrawing || input.seatStatus === "do-not-disturb" || input.userUnmutedMic !== true;

  return Object.freeze({
    roomMode: VIRTUAL_SPACE_DEFAULT_ROOM_MODE,
    motionKind: isDrawing ? "silent-tablet-stroke" : "rest-stretch-idle",
    choreographyWorkState: isDrawing ? "line-art" : "idle-break",
    choreographyAction: isDrawing ? "tablet-drawing" : "coffee-break",
    micRequired: false,
    micAutoMuted,
    bodyScale: STUDIO_CHARACTER_BODY_SCALE_LOCK,
    stylusCyclePhase: Math.round(cyclePhase * 1000) / 1000,
    stylusOffsetX,
    stylusOffsetY,
    penGlowOpacity: isDrawing ? (reducedMotion ? 0.65 : Math.round((0.55 + 0.25 * Math.sin(angle)) * 100) / 100) : 0,
    statusBadgeKo: seatMeta.labelKo,
    statusBadgeEn: seatMeta.labelEn,
    solidarityCaptionKo: isDrawing
      ? "마이크 없이 나란히 타블렛 작화 중"
      : "10분 휴식 벨 · 스트레칭하거나 가볍게 인사해요",
    solidarityCaptionEn: isDrawing
      ? "Drawing quietly side by side without mic pressure"
      : "10m break bell — stretch or share quick feedback",
  });
}

/** 공동 마감실의 마이크 없는 자연 연대감 요약 문구를 만든다. */
export function formatPomodoroSolidaritySummary(
  activeDrawerCount: number,
  phase: PomodoroRoomPhase,
): { readonly ko: string; readonly en: string } {
  const count = Number.isFinite(activeDrawerCount) ? Math.max(1, Math.floor(activeDrawerCount)) : 1;
  if (phase === "silent-drawing") {
    return Object.freeze({
      ko: `마이크 없이 ${count}명이 함께 50분 무음 작화 중`,
      en: `${count} creators drawing silently together (no mic needed)`,
    });
  }
  return Object.freeze({
    ko: `10분 휴식 벨 · ${count}명이 잠시 쉬어 가는 중`,
    en: `10m break bell · ${count} creators taking a short breather`,
  });
}

interface DaylightAmbienceProfile {
  readonly recommendedTrackId: Extract<
    StudioAmbientTrackId,
    "synth-soft-rain" | "synth-pencil-scratch"
  >;
  readonly daylightGainFactor: number;
  readonly rainWeight: number;
  readonly pencilWeight: number;
  readonly filterCutoffHz: number;
}

const DAYLIGHT_AMBIENCE_PROFILES: Readonly<Record<StudioDaylightPeriod, DaylightAmbienceProfile>> =
  Object.freeze({
    morning: Object.freeze({
      recommendedTrackId: "synth-pencil-scratch",
      daylightGainFactor: 0.88,
      rainWeight: 0.25,
      pencilWeight: 0.75,
      filterCutoffHz: 840,
    }),
    day: Object.freeze({
      recommendedTrackId: "synth-pencil-scratch",
      daylightGainFactor: 0.92,
      rainWeight: 0.2,
      pencilWeight: 0.8,
      filterCutoffHz: 920,
    }),
    sunset: Object.freeze({
      recommendedTrackId: "synth-soft-rain",
      daylightGainFactor: 0.96,
      rainWeight: 0.65,
      pencilWeight: 0.35,
      filterCutoffHz: 620,
    }),
    "night-lamp": Object.freeze({
      recommendedTrackId: "synth-soft-rain",
      daylightGainFactor: 0.82,
      rainWeight: 0.78,
      pencilWeight: 0.22,
      filterCutoffHz: 480,
    }),
  });

/**
 * 24시간 자연광(색온도·시간대)과 연동되는 빗소리/연필 사각임 옵트인 앰비언스 상태를 계산한다.
 * - 기본값은 `enabled: false`(OFF)이다.
 * - `clampedUserGain`과 `effectiveGain` 모두 `clampAmbientAudioGain`을 거쳐 `<= 0.25`를 엄격히 지킨다.
 */
export function resolveDaylightLinkedAmbience(
  input: DaylightLinkedAmbienceInput,
): DaylightLinkedAmbienceSnapshot {
  const enabled = input.enabled === true;
  const mode: DaylightAmbienceSourceMode = input.mode ?? "auto";
  const daylight = computeVirtualSpaceDaylightAtHour(input.hour, {
    weather: input.weather ?? null,
  });
  const baseProfile = DAYLIGHT_AMBIENCE_PROFILES[daylight.period];
  const rainyWeather = input.weather === "rain" || input.weather === "thunderstorm";

  const recommendedTrackId = rainyWeather
    ? "synth-soft-rain"
    : baseProfile.recommendedTrackId;

  const resolvedTrackId =
    mode === "rain"
      ? "synth-soft-rain"
      : mode === "pencil-scratch"
        ? "synth-pencil-scratch"
        : recommendedTrackId;

  const rainWeight =
    mode === "rain"
      ? 1
      : mode === "pencil-scratch"
        ? 0
        : rainyWeather
          ? Math.max(0.85, baseProfile.rainWeight)
          : baseProfile.rainWeight;
  const pencilWeight = Math.round((1 - rainWeight) * 100) / 100;

  const clampedUserGain = clampAmbientAudioGain(
    input.requestedGain ?? STUDIO_AMBIENT_AUDIO_DEFAULT_GAIN,
  );
  const duckingFactor = input.ducked === true ? 0.15 : 1;
  const effectiveGain = enabled
    ? clampAmbientAudioGain(clampedUserGain * baseProfile.daylightGainFactor * duckingFactor)
    : 0;

  const soundLabelKo = resolvedTrackId === "synth-soft-rain" ? "빗소리" : "연필 사각임";
  const soundLabelEn = resolvedTrackId === "synth-soft-rain" ? "Soft rain" : "Pencil scratch";
  const summaryKo = enabled
    ? `${daylight.labelKo}(${daylight.kelvin}K) · ${soundLabelKo} 재생 중 (${Math.round(effectiveGain * 100)}%)`
    : `${daylight.labelKo}(${daylight.kelvin}K) · ${soundLabelKo} 대기 중 (기본 꺼짐)`;
  const summaryEn = enabled
    ? `${daylight.labelEn} (${daylight.kelvin}K) · ${soundLabelEn} active (${Math.round(effectiveGain * 100)}%)`
    : `${daylight.labelEn} (${daylight.kelvin}K) · ${soundLabelEn} standby (off by default)`;

  return Object.freeze({
    enabled,
    mode,
    daylight,
    recommendedTrackId,
    resolvedTrackId,
    maxGain: STUDIO_AMBIENT_AUDIO_MAX_GAIN,
    clampedUserGain,
    daylightGainFactor: baseProfile.daylightGainFactor,
    effectiveGain,
    rainWeight: Math.round(rainWeight * 100) / 100,
    pencilWeight,
    filterCutoffHz: baseProfile.filterCutoffHz,
    soundLabelKo,
    soundLabelEn,
    summaryKo,
    summaryEn,
  });
}
