/**
 * Web Audio API 절차적 마림바/셀레스타 어쿠스틱 이어콘 신시사이저.
 *
 * - 5종 감정 톤별 따뜻한 5음계·리디안·오픈 5도 어쿠스틱 화음 프리큐 합성
 * - 모든 `OscillatorNode`, `GainNode`, `BiquadFilterNode`를 `onended` 및 `stop()`에서
 *   자동 `.disconnect()`해 오디오 그래프 메모리 누수 0건 보장
 * - `suspended` AudioContext에서 보이스를 t=0에 쌓지 않고 1회만 안전하게 `resume()` 요청
 */

import type { VoiceCoachEmotionTone } from "./voice-coach-types";

export interface AcousticEarconNote {
  readonly frequencyHz: number;
  readonly onsetSec: number;
  readonly durationSec: number;
  readonly gain: number;
  readonly overtoneRatio: number;
  readonly overtoneMix: number;
}

export interface AcousticEarconRecipe {
  readonly tone: VoiceCoachEmotionTone;
  readonly instrument: "marimba" | "celesta" | "marimba-celesta";
  readonly lowpassHz: number;
  readonly notes: readonly AcousticEarconNote[];
}

export const EARCON_CHORD_PROFILES: Readonly<
  Record<VoiceCoachEmotionTone, AcousticEarconRecipe>
> = Object.freeze({
  "warm-guide": Object.freeze({
    tone: "warm-guide",
    instrument: "marimba",
    lowpassHz: 2800,
    notes: Object.freeze([
      { frequencyHz: 261.63, onsetSec: 0.0, durationSec: 0.24, gain: 0.26, overtoneRatio: 4.0, overtoneMix: 0.16 },
      { frequencyHz: 329.63, onsetSec: 0.07, durationSec: 0.26, gain: 0.24, overtoneRatio: 4.0, overtoneMix: 0.14 },
      { frequencyHz: 392.0, onsetSec: 0.14, durationSec: 0.28, gain: 0.22, overtoneRatio: 2.0, overtoneMix: 0.18 },
      { frequencyHz: 587.33, onsetSec: 0.22, durationSec: 0.36, gain: 0.18, overtoneRatio: 2.0, overtoneMix: 0.15 },
    ]),
  }),
  "calm-focus": Object.freeze({
    tone: "calm-focus",
    instrument: "celesta",
    lowpassHz: 2400,
    notes: Object.freeze([
      { frequencyHz: 293.66, onsetSec: 0.0, durationSec: 0.38, gain: 0.22, overtoneRatio: 2.0, overtoneMix: 0.14 },
      { frequencyHz: 440.0, onsetSec: 0.11, durationSec: 0.42, gain: 0.19, overtoneRatio: 2.0, overtoneMix: 0.12 },
      { frequencyHz: 659.25, onsetSec: 0.22, durationSec: 0.46, gain: 0.14, overtoneRatio: 3.0, overtoneMix: 0.08 },
    ]),
  }),
  celebrate: Object.freeze({
    tone: "celebrate",
    instrument: "marimba-celesta",
    lowpassHz: 3800,
    notes: Object.freeze([
      { frequencyHz: 523.25, onsetSec: 0.0, durationSec: 0.2, gain: 0.22, overtoneRatio: 2.0, overtoneMix: 0.2 },
      { frequencyHz: 659.25, onsetSec: 0.06, durationSec: 0.22, gain: 0.22, overtoneRatio: 2.0, overtoneMix: 0.2 },
      { frequencyHz: 783.99, onsetSec: 0.12, durationSec: 0.25, gain: 0.21, overtoneRatio: 2.0, overtoneMix: 0.18 },
      { frequencyHz: 987.77, onsetSec: 0.18, durationSec: 0.28, gain: 0.17, overtoneRatio: 2.0, overtoneMix: 0.16 },
      { frequencyHz: 1046.5, onsetSec: 0.25, durationSec: 0.38, gain: 0.2, overtoneRatio: 2.0, overtoneMix: 0.15 },
    ]),
  }),
  "gentle-alert": Object.freeze({
    tone: "gentle-alert",
    instrument: "marimba",
    lowpassHz: 2200,
    notes: Object.freeze([
      { frequencyHz: 440.0, onsetSec: 0.0, durationSec: 0.26, gain: 0.23, overtoneRatio: 4.0, overtoneMix: 0.12 },
      { frequencyHz: 349.23, onsetSec: 0.13, durationSec: 0.34, gain: 0.21, overtoneRatio: 4.0, overtoneMix: 0.1 },
    ]),
  }),
  "creative-spark": Object.freeze({
    tone: "creative-spark",
    instrument: "celesta",
    lowpassHz: 3500,
    notes: Object.freeze([
      { frequencyHz: 349.23, onsetSec: 0.0, durationSec: 0.22, gain: 0.22, overtoneRatio: 2.0, overtoneMix: 0.18 },
      { frequencyHz: 440.0, onsetSec: 0.07, durationSec: 0.24, gain: 0.21, overtoneRatio: 2.0, overtoneMix: 0.18 },
      { frequencyHz: 523.25, onsetSec: 0.14, durationSec: 0.28, gain: 0.2, overtoneRatio: 3.0, overtoneMix: 0.14 },
      { frequencyHz: 739.99, onsetSec: 0.21, durationSec: 0.36, gain: 0.17, overtoneRatio: 2.0, overtoneMix: 0.16 },
    ]),
  }),
});

export interface PlayEarconOptions {
  readonly audioContext?: AudioContext | null;
  readonly volume?: number;
  readonly muted?: boolean;
}

export type EarconPlayReason =
  | "played"
  | "muted"
  | "no-audio-context"
  | "suspended"
  | "closed";

export interface EarconPlaybackHandle {
  readonly played: boolean;
  readonly reason: EarconPlayReason;
  readonly tone: VoiceCoachEmotionTone;
  readonly noteCount: number;
  readonly durationMs: number;
  readonly activeNodeCount: () => number;
  readonly stop: () => void;
}

const resumeInFlightContexts = new WeakSet<AudioContext>();
let sharedCoachAudioContext: AudioContext | null = null;

interface WebAudioWindowLike {
  readonly AudioContext?: new () => AudioContext;
  readonly webkitAudioContext?: new () => AudioContext;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolveDefaultAudioContext(): AudioContext | null {
  if (sharedCoachAudioContext && sharedCoachAudioContext.state !== "closed") {
    return sharedCoachAudioContext;
  }
  if (typeof globalThis === "undefined") return null;
  const win = globalThis as unknown as WebAudioWindowLike;
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCoachAudioContext = new Ctor();
    return sharedCoachAudioContext;
  } catch {
    return null;
  }
}

function computeRecipeDurationMs(recipe: AcousticEarconRecipe): number {
  let maxEndSec = 0;
  for (const note of recipe.notes) {
    const end = note.onsetSec + note.durationSec;
    if (end > maxEndSec) maxEndSec = end;
  }
  return Math.round(maxEndSec * 1000);
}

/**
 * 감정 톤별 따뜻한 5음계 마림바/셀레스타 어쿠스틱 이어콘을 합성한다.
 */
export function playCoachAcousticEarcon(
  tone: VoiceCoachEmotionTone,
  options: PlayEarconOptions = {},
): EarconPlaybackHandle {
  const recipe = EARCON_CHORD_PROFILES[tone];
  const durationMs = computeRecipeDurationMs(recipe);
  const volume = clampUnit(options.volume ?? 0.7);

  const noopHandle = (reason: EarconPlayReason): EarconPlaybackHandle => ({
    played: false,
    reason,
    tone,
    noteCount: 0,
    durationMs,
    activeNodeCount: () => 0,
    stop: () => undefined,
  });

  if (options.muted || volume <= 0.001) {
    return noopHandle("muted");
  }

  const ctx = options.audioContext !== undefined ? options.audioContext : resolveDefaultAudioContext();
  if (!ctx) {
    return noopHandle("no-audio-context");
  }
  if (ctx.state === "closed") {
    return noopHandle("closed");
  }
  if (ctx.state === "suspended") {
    // suspended 상태에서 오실레이터를 예약하면 resume 순간 t=0 동시 폭주가 일어나므로 복귀만 1회 요청한다.
    if (!resumeInFlightContexts.has(ctx) && typeof ctx.resume === "function") {
      resumeInFlightContexts.add(ctx);
      void Promise.resolve(ctx.resume())
        .catch(() => undefined)
        .finally(() => {
          resumeInFlightContexts.delete(ctx);
        });
    }
    return noopHandle("suspended");
  }

  const ownedNodes = new Set<AudioNode>();
  const activeOscillators = new Set<OscillatorNode>();
  let pendingOscillators = 0;
  let cleaned = false;

  const safeDisconnect = (node: AudioNode): void => {
    if (!ownedNodes.has(node)) return;
    ownedNodes.delete(node);
    try {
      node.disconnect();
    } catch {
      // 이미 해제됨
    }
  };

  const cleanupAll = (): void => {
    if (cleaned) return;
    cleaned = true;
    activeOscillators.clear();
    for (const node of [...ownedNodes]) {
      safeDisconnect(node);
    }
  };

  const baseTime = ctx.currentTime;
  const masterGain = ctx.createGain();
  const warmFilter = ctx.createBiquadFilter();
  warmFilter.type = "lowpass";
  warmFilter.frequency.setValueAtTime(recipe.lowpassHz, baseTime);
  warmFilter.Q.setValueAtTime(0.7, baseTime);
  masterGain.gain.setValueAtTime(volume * 0.42, baseTime);

  warmFilter.connect(masterGain);
  masterGain.connect(ctx.destination);
  ownedNodes.add(warmFilter);
  ownedNodes.add(masterGain);

  for (const note of recipe.notes) {
    const startAt = baseTime + note.onsetSec;
    const stopAt = startAt + note.durationSec;

    // 1) 마림바/셀레스타 기음 (Sine)
    const fundOsc = ctx.createOscillator();
    const fundGain = ctx.createGain();
    fundOsc.type = "sine";
    fundOsc.frequency.setValueAtTime(note.frequencyHz, startAt);
    fundGain.gain.setValueAtTime(0.0001, startAt);
    fundGain.gain.linearRampToValueAtTime(note.gain, startAt + 0.008);
    fundGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    fundOsc.connect(fundGain);
    fundGain.connect(warmFilter);

    ownedNodes.add(fundOsc);
    ownedNodes.add(fundGain);
    activeOscillators.add(fundOsc);
    pendingOscillators += 1;

    fundOsc.onended = () => {
      fundOsc.onended = null;
      activeOscillators.delete(fundOsc);
      safeDisconnect(fundOsc);
      safeDisconnect(fundGain);
      pendingOscillators = Math.max(0, pendingOscillators - 1);
      if (pendingOscillators === 0) {
        cleanupAll();
      }
    };

    fundOsc.start(startAt);
    fundOsc.stop(stopAt + 0.01);

    // 2) 목재 공명 / 셀레스타 배음 (Triangle · 빠른 감쇠)
    const overOsc = ctx.createOscillator();
    const overGain = ctx.createGain();
    const overStopAt = startAt + Math.min(note.durationSec * 0.55, 0.16);
    overOsc.type = "triangle";
    overOsc.frequency.setValueAtTime(note.frequencyHz * note.overtoneRatio, startAt);
    overGain.gain.setValueAtTime(0.0001, startAt);
    overGain.gain.linearRampToValueAtTime(note.gain * note.overtoneMix, startAt + 0.005);
    overGain.gain.exponentialRampToValueAtTime(0.0001, overStopAt);
    overOsc.connect(overGain);
    overGain.connect(warmFilter);

    ownedNodes.add(overOsc);
    ownedNodes.add(overGain);
    activeOscillators.add(overOsc);
    pendingOscillators += 1;

    overOsc.onended = () => {
      overOsc.onended = null;
      activeOscillators.delete(overOsc);
      safeDisconnect(overOsc);
      safeDisconnect(overGain);
      pendingOscillators = Math.max(0, pendingOscillators - 1);
      if (pendingOscillators === 0) {
        cleanupAll();
      }
    };

    overOsc.start(startAt);
    overOsc.stop(overStopAt + 0.01);
  }

  return {
    played: true,
    reason: "played",
    tone,
    noteCount: recipe.notes.length,
    durationMs,
    activeNodeCount: () => ownedNodes.size,
    stop: () => {
      for (const osc of [...activeOscillators]) {
        osc.onended = null;
        try {
          osc.stop();
        } catch {
          // 이미 정지됨
        }
      }
      cleanupAll();
    },
  };
}
