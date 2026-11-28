/**
 * Wave 126 — 독자 세로 스크롤 세션 시뮬레이터 & 히스테리시스 스래싱·클릭 방어 엔진.
 *
 * 일반 정독(`350 px/s`), 고속 플링 스와이프(`3600 px/s`), 큐 경계선 미세 왕복 지터(`±30px`)
 * 궤적을 대상으로 히스테리시스 데드밴드·최소 체류 시간(`minDwellMs`)·플링 보류·
 * 시간 영역 안티클릭 슬루 리미터(`>= 40ms`)의 효과를 단순 Naive 스위처와 비교 검증한다.
 */

import {
  DEFAULT_ABRUPT_CLICK_DELTA_THRESHOLD,
  DEFAULT_ANTICLICK_RAMP_MS,
  DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR,
  DEFAULT_FLING_HOLD_VELOCITY_PX_PER_SEC,
  DEFAULT_HYSTERESIS_DEADBAND_PX,
  DEFAULT_MIN_ANTICLICK_FADE_MS,
  DEFAULT_MIN_DWELL_MS,
  DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
  type BgmTrackCueSpec,
  type CueSwitchEvent,
  type ReaderScrollProfileKind,
  type ReaderScrollTrajectoryPoint,
  type ScrollAudioSessionResult,
  type ScrollAudioSimulationFrame,
  type ScrollBgmMixSnapshot,
  type ScrollEngineSessionMetrics,
  type ScrollSessionGuardOptions,
} from "./scroll-sync-bgm-types";
import {
  evaluateScrollBgmMixAtPosition,
  sortBgmCuesDeterministically,
  validateBgmCueSheet,
} from "./scroll-sync-bgm-cue-compiler";

const RETRIGGER_THRASH_WINDOW_MS = 1200;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round6(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function selectPrimaryCueFromSnapshot(snapshot: ScrollBgmMixSnapshot): string | null {
  if (snapshot.isDramaticSilenceCore || snapshot.activeTracks.length === 0) return null;
  if (snapshot.activeTracks.length === 1 && snapshot.activeTracks[0].phase === "fade-in") {
    return snapshot.activeTracks[0].cueId;
  }
  let bestId: string | null = null;
  let bestGain = -1;
  for (let i = 0; i < snapshot.activeTracks.length; i += 1) {
    const entry = snapshot.activeTracks[i];
    if (entry.linearGain > bestGain) {
      bestGain = entry.linearGain;
      bestId = entry.cueId;
    }
  }
  return bestGain > 0 ? bestId : null;
}

function detectBoundaryPosition(
  normalCues: readonly BgmTrackCueSpec[],
  fromId: string,
  toId: string,
): number | null {
  let fromCue: BgmTrackCueSpec | null = null;
  let toCue: BgmTrackCueSpec | null = null;
  for (let i = 0; i < normalCues.length; i += 1) {
    if (normalCues[i].cueId === fromId) fromCue = normalCues[i];
    if (normalCues[i].cueId === toId) toCue = normalCues[i];
  }
  if (!fromCue || !toCue) return null;
  const overlapStart = Math.max(fromCue.startYPx, toCue.startYPx);
  const overlapEnd = Math.min(fromCue.endYPx, toCue.endYPx);
  if (overlapEnd > overlapStart) return (overlapStart + overlapEnd) / 2;
  if (fromCue.endYPx <= toCue.startYPx) return (fromCue.endYPx + toCue.startYPx) / 2;
  return (toCue.endYPx + fromCue.startYPx) / 2;
}

function classifyScrollProfile(
  peakVelocity: number,
  directionReversals: number,
  netDisplacementPx: number,
  flingThreshold: number,
): ReaderScrollProfileKind {
  if (directionReversals >= 4 && Math.abs(netDisplacementPx) <= 220) {
    return "boundary-jitter";
  }
  if (peakVelocity >= flingThreshold) {
    return directionReversals >= 4 ? "mixed" : "high-speed-fling";
  }
  if (directionReversals >= 4) return "mixed";
  return "steady-reading";
}

function computeSnapshotGainsMap(snapshot: ScrollBgmMixSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < snapshot.activeTracks.length; i += 1) {
    out[snapshot.activeTracks[i].cueId] = snapshot.activeTracks[i].linearGain;
  }
  return out;
}

function isRetriggerSwitch(
  switchHistory: readonly CueSwitchEvent[],
  nextCueId: string | null,
  timeMs: number,
): boolean {
  if (nextCueId === null || switchHistory.length < 1) return false;
  for (let i = switchHistory.length - 1; i >= 0; i -= 1) {
    const prev = switchHistory[i];
    if (timeMs - prev.timeMs > RETRIGGER_THRASH_WINDOW_MS) break;
    if (prev.fromCueId === nextCueId) return true;
  }
  return false;
}

/**
 * 독자 스크롤 세션(정독 `350 px/s`, 고속 플링 `3600 px/s`, 경계선 `±30px` 왕복 지터)을
 * 시뮬레이션하여 히스테리시스 데드밴드 + 최소 체류 시간(`minDwellMs`) + 시간 영역 안티클릭
 * 슬루 리미터의 스래싱·클릭 방어 성능을 단순 Naive 스위처와 정량 비교한다.
 */
export function simulateReaderScrollAudioSession(
  cues: readonly BgmTrackCueSpec[],
  trajectory: readonly ReaderScrollTrajectoryPoint[],
  options: ScrollSessionGuardOptions = {},
): ScrollAudioSessionResult {
  const validationIssues = validateBgmCueSheet(cues);
  const emptyMetrics: ScrollEngineSessionMetrics = {
    totalCueSwitches: 0,
    retriggerThrashCount: 0,
    abruptClickEventCount: 0,
    maxSingleFrameGainDelta: 0,
    minObservedTransitionRampMs: DEFAULT_MIN_ANTICLICK_FADE_MS,
    dramaticSilenceCoreReached: false,
    maxGainDuringSilenceCore: 0,
    finalPrimaryCueId: null,
    switchEvents: [],
  };

  if (validationIssues.length > 0 || !Array.isArray(trajectory) || trajectory.length === 0) {
    return {
      ok: false,
      profileKind: "steady-reading",
      frameCount: 0,
      totalDurationMs: 0,
      peakScrollVelocityPxPerSec: 0,
      meanScrollVelocityPxPerSec: 0,
      guarded: emptyMetrics,
      naive: emptyMetrics,
      thrashPreventedCount: 0,
      clicksPreventedCount: 0,
      frames: [],
      validationIssues,
    };
  }

  const hysteresisDeadbandPx = Math.max(
    0,
    Number.isFinite(options.hysteresisDeadbandPx ?? NaN)
      ? (options.hysteresisDeadbandPx as number)
      : DEFAULT_HYSTERESIS_DEADBAND_PX,
  );
  const minDwellMs = Math.max(
    0,
    Number.isFinite(options.minDwellMs ?? NaN)
      ? (options.minDwellMs as number)
      : DEFAULT_MIN_DWELL_MS,
  );
  const minAntiClickFadeMs = Math.max(
    DEFAULT_MIN_ANTICLICK_FADE_MS,
    Number.isFinite(options.minAntiClickFadeMs ?? NaN)
      ? (options.minAntiClickFadeMs as number)
      : DEFAULT_MIN_ANTICLICK_FADE_MS,
  );
  const antiClickRampMs = Math.max(
    minAntiClickFadeMs,
    Number.isFinite(options.antiClickRampMs ?? NaN)
      ? (options.antiClickRampMs as number)
      : DEFAULT_ANTICLICK_RAMP_MS,
  );
  const flingThreshold = Math.max(
    400,
    Number.isFinite(options.flingVelocityThresholdPxPerSec ?? NaN)
      ? (options.flingVelocityThresholdPxPerSec as number)
      : DEFAULT_FLING_HOLD_VELOCITY_PX_PER_SEC,
  );
  const clickDeltaThreshold = Math.max(
    0.05,
    Number.isFinite(options.abruptClickDeltaThreshold ?? NaN)
      ? (options.abruptClickDeltaThreshold as number)
      : DEFAULT_ABRUPT_CLICK_DELTA_THRESHOLD,
  );
  const silenceFloor =
    Number.isFinite(options.dramaticSilenceFloorLinear ?? NaN) &&
    (options.dramaticSilenceFloorLinear as number) > 0
      ? Math.min(DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR, options.dramaticSilenceFloorLinear as number)
      : DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR;

  const sortedCues = sortBgmCuesDeterministically(cues);
  const normalCues: BgmTrackCueSpec[] = [];
  const allNormalIds: string[] = [];
  for (let i = 0; i < sortedCues.length; i += 1) {
    if (!sortedCues[i].isDramaticSilenceCut) {
      normalCues.push(sortedCues[i]);
      allNormalIds.push(sortedCues[i].cueId);
    }
  }

  let naivePrimary: string | null = null;
  let naivePrevGains: Record<string, number> = {};
  const naiveSwitches: CueSwitchEvent[] = [];
  let naiveThrash = 0;
  let naiveClicks = 0;
  let naiveMaxDelta = 0;
  let naiveMinRampMs = Number.POSITIVE_INFINITY;
  let naiveSilenceReached = false;
  let naiveMaxSilenceGain = 0;

  let guardedPrimary: string | null = null;
  let guardedLastSwitchMs = trajectory[0].timeMs;
  let guardedGains: Record<string, number> = {};
  const guardedSwitches: CueSwitchEvent[] = [];
  let guardedThrash = 0;
  let guardedClicks = 0;
  let guardedMaxDelta = 0;
  let guardedMinRampMs = Number.POSITIVE_INFINITY;
  let guardedSilenceReached = false;
  let guardedMaxSilenceGain = 0;
  let silenceDwellMs = 0;

  let peakVelocity = 0;
  let velocitySum = 0;
  let prevSign = 0;
  let directionReversals = 0;
  const frames: ScrollAudioSimulationFrame[] = [];

  for (let i = 0; i < trajectory.length; i += 1) {
    const pt = trajectory[i];
    const dtMs = i === 0 ? 16 : Math.max(1, pt.timeMs - trajectory[i - 1].timeMs);
    const dyPx = i === 0 ? 0 : pt.yPx - trajectory[i - 1].yPx;
    const velocity =
      i === 0 ? DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC : (Math.abs(dyPx) / dtMs) * 1000;

    if (i > 0) {
      if (velocity > peakVelocity) peakVelocity = velocity;
      velocitySum += velocity;
      if (Math.abs(dyPx) > 1e-6) {
        const sign = dyPx > 0 ? 1 : -1;
        if (prevSign !== 0 && sign !== prevSign) directionReversals += 1;
        prevSign = sign;
      }
    }

    const snap = evaluateScrollBgmMixAtPosition(sortedCues, pt.yPx, {
      dialogueActive: Boolean(pt.dialogueActive),
      scrollVelocityPxPerSec: velocity,
      minAntiClickFadeMs,
      dramaticSilenceFloorLinear: silenceFloor,
    });
    const rawPrimary = selectPrimaryCueFromSnapshot(snap);
    const rawGains = computeSnapshotGainsMap(snap);

    // 1. Naive 스위처 업데이트 (즉시 절환, 데드밴드·최소체류·슬루리미트 없음)
    if (i === 0) {
      naivePrimary = rawPrimary;
      naivePrevGains = rawGains;
    } else {
      if (rawPrimary !== naivePrimary && rawPrimary !== null) {
        const isThrash = isRetriggerSwitch(naiveSwitches, rawPrimary, pt.timeMs);
        if (isThrash) naiveThrash += 1;
        naiveSwitches.push({
          timeMs: pt.timeMs,
          yPx: pt.yPx,
          fromCueId: naivePrimary,
          toCueId: rawPrimary,
          isRetriggerThrash: isThrash,
        });
        naivePrimary = rawPrimary;
      }
      let frameMaxDeltaNaive = 0;
      for (let k = 0; k < allNormalIds.length; k += 1) {
        const cid = allNormalIds[k];
        const delta = Math.abs((rawGains[cid] ?? 0) - (naivePrevGains[cid] ?? 0));
        if (delta > frameMaxDeltaNaive) frameMaxDeltaNaive = delta;
      }
      if (frameMaxDeltaNaive > naiveMaxDelta) naiveMaxDelta = frameMaxDeltaNaive;
      if (frameMaxDeltaNaive > 1e-4) {
        const impliedMs = dtMs / frameMaxDeltaNaive;
        if (impliedMs < naiveMinRampMs) naiveMinRampMs = impliedMs;
      }
      if (frameMaxDeltaNaive > clickDeltaThreshold) naiveClicks += 1;
      naivePrevGains = rawGains;
    }

    if (snap.isDramaticSilenceCore) {
      naiveSilenceReached = true;
      if (snap.maxActiveGainLinear > naiveMaxSilenceGain) {
        naiveMaxSilenceGain = snap.maxActiveGainLinear;
      }
    }

    // 2. Guarded 엔진 업데이트 (히스테리시스 데드밴드 + 최소 체류 + 플링 보류 + 시간 영역 안티클릭)
    const flingHoldActive = i > 0 && velocity >= flingThreshold && !snap.isDramaticSilenceCore;
    let frameMaxDeltaGuarded = 0;
    let silenceSettleMs = antiClickRampMs;

    if (i === 0) {
      guardedPrimary = rawPrimary;
      guardedLastSwitchMs = pt.timeMs;
      guardedGains = { ...rawGains };
    } else {
      let allowSwitch = false;
      if (rawPrimary !== null && rawPrimary !== guardedPrimary && !flingHoldActive) {
        if (guardedPrimary === null) {
          allowSwitch = true;
        } else {
          const dwellElapsed = pt.timeMs - guardedLastSwitchMs;
          const boundaryY = detectBoundaryPosition(normalCues, guardedPrimary, rawPrimary);
          const beyondDeadband =
            boundaryY === null || Math.abs(pt.yPx - boundaryY) >= hysteresisDeadbandPx;
          if (dwellElapsed >= minDwellMs && beyondDeadband) {
            allowSwitch = true;
          }
        }
      }

      if (allowSwitch) {
        const isThrash = isRetriggerSwitch(guardedSwitches, rawPrimary, pt.timeMs);
        if (isThrash) guardedThrash += 1;
        guardedSwitches.push({
          timeMs: pt.timeMs,
          yPx: pt.yPx,
          fromCueId: guardedPrimary,
          toCueId: rawPrimary,
          isRetriggerThrash: isThrash,
        });
        guardedPrimary = rawPrimary;
        guardedLastSwitchMs = pt.timeMs;
      }

      const targetGains: Record<string, number> = {};
      if (snap.isDramaticSilenceCore) {
        silenceDwellMs += dtMs;
      } else {
        silenceDwellMs = 0;
        const holdPrimary =
          (flingHoldActive && guardedPrimary !== null) ||
          (rawPrimary !== null && guardedPrimary !== null && rawPrimary !== guardedPrimary && !allowSwitch);
        if (holdPrimary && guardedPrimary !== null) {
          targetGains[guardedPrimary] = 1;
        } else {
          for (let k = 0; k < allNormalIds.length; k += 1) {
            const cid = allNormalIds[k];
            if (rawGains[cid] !== undefined) targetGains[cid] = rawGains[cid];
          }
        }
      }

      const maxSafeStep = Math.min(dtMs / antiClickRampMs, clickDeltaThreshold * 0.85);
      silenceSettleMs = Math.max(antiClickRampMs, Math.ceil(1 / Math.max(1e-6, maxSafeStep)) * dtMs);
      const nextGuardedGains: Record<string, number> = {};

      for (let k = 0; k < allNormalIds.length; k += 1) {
        const cid = allNormalIds[k];
        const prevG = guardedGains[cid] ?? 0;
        const tgtG = targetGains[cid] ?? 0;
        const diff = tgtG - prevG;
        const stepped =
          Math.abs(diff) <= maxSafeStep
            ? tgtG
            : prevG + (diff > 0 ? maxSafeStep : -maxSafeStep);
        const clamped = clamp(stepped, 0, 1);
        const nextG = clamped < 1e-6 && tgtG === 0 ? 0 : clamped;
        const actualDelta = Math.abs(nextG - prevG);
        if (actualDelta > frameMaxDeltaGuarded) frameMaxDeltaGuarded = actualDelta;
        if (nextG > 0) nextGuardedGains[cid] = round6(nextG);
      }

      guardedGains = nextGuardedGains;
      if (frameMaxDeltaGuarded > guardedMaxDelta) guardedMaxDelta = frameMaxDeltaGuarded;
      if (frameMaxDeltaGuarded > 1e-4) {
        const impliedMs = dtMs / frameMaxDeltaGuarded;
        if (impliedMs < guardedMinRampMs) guardedMinRampMs = impliedMs;
      }
      if (frameMaxDeltaGuarded > clickDeltaThreshold) guardedClicks += 1;
    }

    if (snap.isDramaticSilenceCore) {
      guardedSilenceReached = true;
      if (silenceDwellMs >= silenceSettleMs) {
        let maxNow = 0;
        for (let k = 0; k < allNormalIds.length; k += 1) {
          const g = guardedGains[allNormalIds[k]] ?? 0;
          if (g > maxNow) maxNow = g;
        }
        if (maxNow > guardedMaxSilenceGain) guardedMaxSilenceGain = maxNow;
      }
    }

    frames.push({
      timeMs: pt.timeMs,
      yPx: pt.yPx,
      velocityPxPerSec: Math.round(velocity * 100) / 100,
      primaryCueId: guardedPrimary,
      gainsByCueId: { ...guardedGains },
      maxFrameGainDelta: round6(frameMaxDeltaGuarded),
      isDramaticSilenceCore: snap.isDramaticSilenceCore,
      flingHoldActive,
    });
  }

  const totalDurationMs = Math.max(0, trajectory[trajectory.length - 1].timeMs - trajectory[0].timeMs);
  const meanVelocity =
    trajectory.length > 1
      ? velocitySum / (trajectory.length - 1)
      : DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC;
  const profileKind = classifyScrollProfile(
    peakVelocity,
    directionReversals,
    trajectory[trajectory.length - 1].yPx - trajectory[0].yPx,
    flingThreshold,
  );

  return {
    ok: true,
    profileKind,
    frameCount: frames.length,
    totalDurationMs,
    peakScrollVelocityPxPerSec: Math.round(peakVelocity * 100) / 100,
    meanScrollVelocityPxPerSec: Math.round(meanVelocity * 100) / 100,
    guarded: {
      totalCueSwitches: guardedSwitches.length,
      retriggerThrashCount: guardedThrash,
      abruptClickEventCount: guardedClicks,
      maxSingleFrameGainDelta: round6(guardedMaxDelta),
      minObservedTransitionRampMs: Number.isFinite(guardedMinRampMs)
        ? Math.round(guardedMinRampMs * 100) / 100
        : antiClickRampMs,
      dramaticSilenceCoreReached: guardedSilenceReached,
      maxGainDuringSilenceCore: round6(guardedMaxSilenceGain),
      finalPrimaryCueId: guardedPrimary,
      switchEvents: guardedSwitches,
    },
    naive: {
      totalCueSwitches: naiveSwitches.length,
      retriggerThrashCount: naiveThrash,
      abruptClickEventCount: naiveClicks,
      maxSingleFrameGainDelta: round6(naiveMaxDelta),
      minObservedTransitionRampMs: Number.isFinite(naiveMinRampMs)
        ? Math.round(naiveMinRampMs * 100) / 100
        : antiClickRampMs,
      dramaticSilenceCoreReached: naiveSilenceReached,
      maxGainDuringSilenceCore: round6(naiveMaxSilenceGain),
      finalPrimaryCueId: naivePrimary,
      switchEvents: naiveSwitches,
    },
    thrashPreventedCount: Math.max(0, naiveThrash - guardedThrash),
    clicksPreventedCount: Math.max(0, naiveClicks - guardedClicks),
    frames,
    validationIssues: [],
  };
}

/** 등속 세로 정독(기본 350 px/s) 또는 고속 플링(3600 px/s) 궤적을 생성한다. */
export function createConstantVelocityScrollTrajectory(
  startYPx: number,
  endYPx: number,
  velocityPxPerSec: number,
  frameStepMs = 16,
): readonly ReaderScrollTrajectoryPoint[] {
  const safeStep = Math.max(4, Math.round(frameStepMs));
  const safeVel = Math.max(1, Math.abs(velocityPxPerSec));
  const distance = Math.abs(endYPx - startYPx);
  const direction = endYPx >= startYPx ? 1 : -1;
  const totalMs = Math.max(safeStep, Math.ceil((distance / safeVel) * 1000));
  const points: ReaderScrollTrajectoryPoint[] = [];

  for (let t = 0; t <= totalMs; t += safeStep) {
    const frac = Math.min(1, t / totalMs);
    points.push({
      timeMs: t,
      yPx: Math.round((startYPx + direction * distance * frac) * 100) / 100,
    });
  }
  if (points[points.length - 1].yPx !== endYPx) {
    points.push({ timeMs: totalMs + safeStep, yPx: endYPx });
  }
  return points;
}

/** 큐 경계선 주변 `±amplitudePx`(기본 30px) 미세 왕복 흔들기 지터 궤적을 생성한다. */
export function createBoundaryJitterScrollTrajectory(
  boundaryYPx: number,
  amplitudePx = 30,
  cycles = 8,
  halfCycleMs = 80,
  frameStepMs = 16,
): readonly ReaderScrollTrajectoryPoint[] {
  const safeStep = Math.max(4, Math.round(frameStepMs));
  const safeAmp = Math.max(1, Math.abs(amplitudePx));
  const safeCycles = Math.max(1, Math.round(cycles));
  const totalMs = safeCycles * halfCycleMs * 2;
  const points: ReaderScrollTrajectoryPoint[] = [];

  for (let t = 0; t <= totalMs; t += safeStep) {
    const angle = (t / (halfCycleMs * 2)) * Math.PI * 2;
    const offset = -Math.cos(angle) * safeAmp;
    points.push({
      timeMs: t,
      yPx: Math.max(0, Math.round((boundaryYPx + offset) * 100) / 100),
    });
  }
  return points;
}
