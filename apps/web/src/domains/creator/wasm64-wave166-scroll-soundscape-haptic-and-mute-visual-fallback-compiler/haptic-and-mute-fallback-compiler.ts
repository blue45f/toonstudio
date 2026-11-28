/**
 * Wave 166 — 햅틱 안전 거버너(120ms 쿨다운 · 25% 듀티 상한 · 모션 축소 해제) 및
 * 독자 음소거·청각 접근성 시각 대체 컴파일러(WCAG 2.3.1 <= 3.0 Hz).
 */

import type {
  CompiledHapticEvent,
  HapticCompilationReport,
  HapticGovernorPolicy,
  MoodAtmosphereTone,
  MultitrackScrollCue,
  MuteVisualFallbackTrackReport,
  ReaderPlaybackContext,
  VisualFallbackCueKind,
  VisualFallbackDirective,
} from './soundscape-haptic-types'

export const WCAG_MAX_FLASH_HZ = 3.0
export const HAPTIC_HARD_MIN_COOLDOWN_MS = 120
export const HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO = 0.25

export const DEFAULT_HAPTIC_POLICY: HapticGovernorPolicy = {
  minCooldownMs: 120,
  maxDutyCycleRatio: 0.25,
  evaluationWindowMs: 2000,
  assumedScrollVelocityPxPerSec: 600,
}

export const DEFAULT_READER_CONTEXT: ReaderPlaybackContext = {
  mode: 'full-audio-haptic',
  prefersReducedMotion: false,
  deviceHapticsSupported: true,
  scrollVelocityPxPerSec: 600,
}

const MOOD_OKLCH_PALETTE: Record<MoodAtmosphereTone, string> = {
  calm: 'oklch(0.62 0.08 165)',
  tense: 'oklch(0.64 0.14 55)',
  dramatic: 'oklch(0.56 0.17 28)',
  melancholic: 'oklch(0.54 0.09 245)',
  triumphant: 'oklch(0.72 0.14 85)',
  eerie: 'oklch(0.50 0.12 300)',
}

const MOOD_CAPTION_PREFIX_KO: Record<MoodAtmosphereTone, string> = {
  calm: '고요한 여운',
  tense: '긴장감 고조',
  dramatic: '격정적 전환',
  melancholic: '서늘한 쓸쓸함',
  triumphant: '벅찬 클라이맥스',
  eerie: '서늘한 정적',
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

export function resolveHapticPolicy(
  partial?: Partial<HapticGovernorPolicy>,
): HapticGovernorPolicy {
  return {
    minCooldownMs: Math.max(
      HAPTIC_HARD_MIN_COOLDOWN_MS,
      partial?.minCooldownMs ?? DEFAULT_HAPTIC_POLICY.minCooldownMs,
    ),
    maxDutyCycleRatio: clampNumber(
      partial?.maxDutyCycleRatio ?? DEFAULT_HAPTIC_POLICY.maxDutyCycleRatio,
      0.05,
      HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO,
    ),
    evaluationWindowMs: Math.max(
      400,
      Math.floor(partial?.evaluationWindowMs ?? DEFAULT_HAPTIC_POLICY.evaluationWindowMs),
    ),
    assumedScrollVelocityPxPerSec: Math.max(
      100,
      partial?.assumedScrollVelocityPxPerSec ?? DEFAULT_HAPTIC_POLICY.assumedScrollVelocityPxPerSec,
    ),
  }
}

export function resolveReaderContext(
  partial?: Partial<ReaderPlaybackContext>,
  hapticPolicy?: HapticGovernorPolicy,
): ReaderPlaybackContext {
  const mode = partial?.mode ?? DEFAULT_READER_CONTEXT.mode
  const prefersReducedMotion =
    Boolean(partial?.prefersReducedMotion) || mode === 'reduced-motion'
  const fallbackVelocity =
    hapticPolicy?.assumedScrollVelocityPxPerSec ?? DEFAULT_READER_CONTEXT.scrollVelocityPxPerSec

  return {
    mode,
    prefersReducedMotion,
    deviceHapticsSupported: partial?.deviceHapticsSupported ?? true,
    scrollVelocityPxPerSec: Math.max(100, partial?.scrollVelocityPxPerSec ?? fallbackVelocity),
  }
}

interface RawHapticCandidate {
  readonly cueId: string
  readonly labelKo: string
  readonly priority: number
  readonly triggerYpx: number
  readonly triggerTimeMs: number
  readonly durationMs: number
  readonly intensity: number
  readonly sharpness: number
  readonly minCooldownMs: number
}

function computePeakSlidingDutyCycle(
  intervals: ReadonlyArray<{ startMs: number; endMs: number }>,
  windowMs: number,
): number {
  if (intervals.length === 0 || windowMs <= 0) {
    return 0
  }
  const sorted = [...intervals]
    .filter((iv) => iv.endMs > iv.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  if (sorted.length === 0) {
    return 0
  }

  const merged: Array<{ startMs: number; endMs: number }> = [
    { startMs: sorted[0].startMs, endMs: sorted[0].endMs },
  ]
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]
    if (curr.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, curr.endMs)
    } else {
      merged.push({ startMs: curr.startMs, endMs: curr.endMs })
    }
  }

  const windowStarts: number[] = []
  for (const iv of merged) {
    windowStarts.push(iv.startMs, Math.max(0, iv.endMs - windowMs))
  }

  let peakRatio = 0
  for (const winStart of windowStarts) {
    const winEnd = winStart + windowMs
    let activeMs = 0
    for (const iv of merged) {
      const overlapStart = Math.max(winStart, iv.startMs)
      const overlapEnd = Math.min(winEnd, iv.endMs)
      if (overlapEnd > overlapStart) {
        activeMs += overlapEnd - overlapStart
      }
    }
    const ratio = activeMs / windowMs
    if (ratio > peakRatio) {
      peakRatio = ratio
    }
  }

  return clampNumber(peakRatio, 0, 1)
}

function countSpacingViolations(
  events: ReadonlyArray<{ triggerTimeMs: number; durationMs: number; minCooldownMs: number }>,
  policyMinCooldownMs: number,
): number {
  let violations = 0
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1]
    const curr = events[i]
    const requiredCooldown = Math.max(
      HAPTIC_HARD_MIN_COOLDOWN_MS,
      policyMinCooldownMs,
      prev.minCooldownMs,
      curr.minCooldownMs,
    )
    const startDelta = curr.triggerTimeMs - prev.triggerTimeMs
    const gapAfterEnd = curr.triggerTimeMs - (prev.triggerTimeMs + prev.durationMs)
    if (startDelta < requiredCooldown || gapAfterEnd < requiredCooldown) {
      violations += 1
    }
  }
  return violations
}

/**
 * 햅틱 안전 조율기:
 * - `prefersReducedMotion` 또는 `reduced-motion` 모드 시 진동을 0회로 완전 차단한다.
 * - `minCooldownMs >= 120ms` 미만 연속 버스트를 병합/쓰로틀해 간격 위반을 0건으로 만든다.
 * - 슬라이딩 윈도우 기준 듀티 사이클을 `<= 25%` 이하로 강제한다.
 */
export function compileHapticGovernorSchedule(
  cues: readonly MultitrackScrollCue[],
  hapticPolicy: HapticGovernorPolicy,
  readerContext: ReaderPlaybackContext,
): HapticCompilationReport {
  const velocity = readerContext.scrollVelocityPxPerSec
  const rawCandidates: RawHapticCandidate[] = []

  for (const cue of cues) {
    if (cue.kind !== 'haptic-pulse' && !cue.haptic) {
      continue
    }
    const triggerYpx = Math.max(0, cue.anchor.startYpx)
    rawCandidates.push({
      cueId: cue.id,
      labelKo: cue.labelKo,
      priority: cue.priority,
      triggerYpx,
      triggerTimeMs: (triggerYpx / velocity) * 1000,
      durationMs: clampNumber(cue.haptic?.durationMs ?? 40, 10, 800),
      intensity: clampNumber(cue.haptic?.intensity ?? 0.7, 0, 1),
      sharpness: clampNumber(cue.haptic?.sharpness ?? 0.55, 0, 1),
      minCooldownMs: Math.max(
        HAPTIC_HARD_MIN_COOLDOWN_MS,
        hapticPolicy.minCooldownMs,
        cue.haptic?.minCooldownMs ?? 0,
      ),
    })
  }

  rawCandidates.sort((a, b) => {
    if (Math.abs(a.triggerTimeMs - b.triggerTimeMs) > 1e-6) {
      return a.triggerTimeMs - b.triggerTimeMs
    }
    if (b.priority !== a.priority) {
      return b.priority - a.priority
    }
    return a.cueId.localeCompare(b.cueId)
  })

  const minSpacingViolationsBefore = countSpacingViolations(
    rawCandidates,
    hapticPolicy.minCooldownMs,
  )
  const peakDutyCycleRatioBefore = computePeakSlidingDutyCycle(
    rawCandidates.map((c) => ({ startMs: c.triggerTimeMs, endMs: c.triggerTimeMs + c.durationMs })),
    hapticPolicy.evaluationWindowMs,
  )

  const reducedMotionDisabled = readerContext.prefersReducedMotion
  if (reducedMotionDisabled || !readerContext.deviceHapticsSupported) {
    const status = reducedMotionDisabled ? 'disabled-reduced-motion' : 'disabled-device'
    const noteKo = reducedMotionDisabled
      ? '모션 축소(prefers-reduced-motion) 설정으로 진동 출력 해제'
      : '단말 햅틱 액추에이터 미지원으로 진동 출력 해제'
    return {
      events: rawCandidates.map((c) => ({
        cueId: c.cueId,
        labelKo: c.labelKo,
        triggerYpx: c.triggerYpx,
        triggerTimeMs: Number(c.triggerTimeMs.toFixed(2)),
        durationMs: c.durationMs,
        intensity: 0,
        sharpness: 0,
        status,
        mergedCueIds: [],
        noteKo,
      })),
      activePulseCount: 0,
      throttledOrMergedCount: 0,
      minSpacingViolationsBefore,
      minSpacingViolationsAfter: 0,
      peakDutyCycleRatioBefore,
      peakDutyCycleRatioAfter: 0,
      reducedMotionDisabled,
      hapticSafe: true,
    }
  }

  const maxDuty = Math.min(HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO, hapticPolicy.maxDutyCycleRatio)
  const maxSinglePulseMs = Math.max(10, Math.floor(hapticPolicy.evaluationWindowMs * maxDuty))
  const compiledEvents: CompiledHapticEvent[] = []
  const acceptedIndices: number[] = []
  const acceptedIntervals: Array<{ startMs: number; endMs: number }> = []
  const acceptedSpacing: Array<{
    triggerTimeMs: number
    durationMs: number
    minCooldownMs: number
  }> = []

  for (const cand of rawCandidates) {
    const boundedDurationMs = Math.min(cand.durationMs, maxSinglePulseMs)

    if (acceptedIndices.length > 0) {
      const lastIdx = acceptedIndices[acceptedIndices.length - 1]
      const lastEvent = compiledEvents[lastIdx]
      const lastCheck = acceptedSpacing[acceptedSpacing.length - 1]
      const requiredCooldown = Math.max(
        HAPTIC_HARD_MIN_COOLDOWN_MS,
        hapticPolicy.minCooldownMs,
        lastCheck.minCooldownMs,
        cand.minCooldownMs,
      )
      const startDelta = cand.triggerTimeMs - lastEvent.triggerTimeMs
      const gapAfterEnd = cand.triggerTimeMs - (lastEvent.triggerTimeMs + lastEvent.durationMs)

      if (startDelta < requiredCooldown || gapAfterEnd < requiredCooldown) {
        if (startDelta <= requiredCooldown * 0.6) {
          compiledEvents[lastIdx] = {
            ...lastEvent,
            intensity: clampNumber(Math.max(lastEvent.intensity, cand.intensity), 0, 1),
            sharpness: clampNumber(Math.max(lastEvent.sharpness, cand.sharpness), 0, 1),
            mergedCueIds: [...lastEvent.mergedCueIds, cand.cueId],
            noteKo: `근접 버스트 병합(${lastEvent.mergedCueIds.length + 1}건 흡수, 최소 간격 ${requiredCooldown}ms 준수)`,
          }
          compiledEvents.push({
            cueId: cand.cueId,
            labelKo: cand.labelKo,
            triggerYpx: cand.triggerYpx,
            triggerTimeMs: Number(cand.triggerTimeMs.toFixed(2)),
            durationMs: boundedDurationMs,
            intensity: 0,
            sharpness: 0,
            status: 'merged',
            mergedCueIds: [lastEvent.cueId],
            noteKo: `선행 펄스(${lastEvent.cueId})에 병합되어 과밀 진동 방지`,
          })
        } else {
          compiledEvents.push({
            cueId: cand.cueId,
            labelKo: cand.labelKo,
            triggerYpx: cand.triggerYpx,
            triggerTimeMs: Number(cand.triggerTimeMs.toFixed(2)),
            durationMs: boundedDurationMs,
            intensity: 0,
            sharpness: 0,
            status: 'throttled',
            mergedCueIds: [],
            noteKo: `최소 쿨다운(${requiredCooldown}ms) 미만 간격으로 쓰로틀 제외`,
          })
        }
        continue
      }
    }

    const trialIntervals = [
      ...acceptedIntervals,
      { startMs: cand.triggerTimeMs, endMs: cand.triggerTimeMs + boundedDurationMs },
    ]
    if (computePeakSlidingDutyCycle(trialIntervals, hapticPolicy.evaluationWindowMs) > maxDuty + 1e-9) {
      compiledEvents.push({
        cueId: cand.cueId,
        labelKo: cand.labelKo,
        triggerYpx: cand.triggerYpx,
        triggerTimeMs: Number(cand.triggerTimeMs.toFixed(2)),
        durationMs: boundedDurationMs,
        intensity: 0,
        sharpness: 0,
        status: 'throttled',
        mergedCueIds: [],
        noteKo: `슬라이딩 듀티 사이클 상한(${Math.round(maxDuty * 100)}%) 초과로 쓰로틀 제외`,
      })
      continue
    }

    acceptedIndices.push(compiledEvents.length)
    compiledEvents.push({
      cueId: cand.cueId,
      labelKo: cand.labelKo,
      triggerYpx: cand.triggerYpx,
      triggerTimeMs: Number(cand.triggerTimeMs.toFixed(2)),
      durationMs: boundedDurationMs,
      intensity: cand.intensity,
      sharpness: cand.sharpness,
      status: 'active',
      mergedCueIds: [],
      noteKo:
        boundedDurationMs < cand.durationMs
          ? `듀티 사이클 안전 한계에 맞춰 지속 시간을 ${boundedDurationMs}ms로 제한`
          : '정상 출력',
    })
    acceptedIntervals.push({
      startMs: cand.triggerTimeMs,
      endMs: cand.triggerTimeMs + boundedDurationMs,
    })
    acceptedSpacing.push({
      triggerTimeMs: cand.triggerTimeMs,
      durationMs: boundedDurationMs,
      minCooldownMs: cand.minCooldownMs,
    })
  }

  const minSpacingViolationsAfter = countSpacingViolations(
    acceptedSpacing,
    hapticPolicy.minCooldownMs,
  )
  const peakDutyCycleRatioAfter = computePeakSlidingDutyCycle(
    acceptedIntervals,
    hapticPolicy.evaluationWindowMs,
  )
  const throttledOrMergedCount = compiledEvents.filter(
    (e) => e.status === 'merged' || e.status === 'throttled',
  ).length

  return {
    events: compiledEvents,
    activePulseCount: acceptedIndices.length,
    throttledOrMergedCount,
    minSpacingViolationsBefore,
    minSpacingViolationsAfter,
    peakDutyCycleRatioBefore,
    peakDutyCycleRatioAfter,
    reducedMotionDisabled: false,
    hapticSafe:
      minSpacingViolationsAfter === 0 &&
      peakDutyCycleRatioAfter <= HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO + 1e-9,
  }
}

function sanitizeOklchColor(candidate: string | undefined, mood: MoodAtmosphereTone): string {
  if (
    candidate &&
    /^oklch\(\s*[0-9.]+%?\s+[0-9.]+\s+[0-9.]+(\s*\/\s*[0-9.]+%?)?\s*\)$/i.test(candidate.trim())
  ) {
    return candidate.trim()
  }
  return MOOD_OKLCH_PALETTE[mood]
}

function resolveDefaultDirectiveKind(cue: MultitrackScrollCue): VisualFallbackCueKind {
  if (cue.visualHint?.kind) {
    return cue.visualHint.kind
  }
  if (cue.kind === 'foley-sfx') {
    return 'sound-caption-badge'
  }
  if (cue.kind === 'bgm-motif' || cue.kind === 'ambient-bed') {
    return 'oklch-vignette-tint'
  }
  return 'panel-rhythm-mark'
}

function buildKoreanVisualCaption(cue: MultitrackScrollCue, mood: MoodAtmosphereTone): string {
  const custom = cue.visualHint?.captionKo?.trim()
  if (custom && custom.length > 0) {
    return custom
  }
  if (cue.kind === 'foley-sfx') {
    return `[효과음 · ${cue.labelKo}]`
  }
  if (cue.kind === 'bgm-motif') {
    return `[배경음 · ${MOOD_CAPTION_PREFIX_KO[mood]} · ${cue.labelKo}]`
  }
  if (cue.kind === 'ambient-bed') {
    return `[환경음 · ${cue.labelKo}]`
  }
  return `[진동 박자 · ${cue.labelKo}]`
}

/**
 * 음소거·청각 접근성 시각 대체 컴파일러:
 * - 모든 주요 폴리(Foley) 및 BGM 무드 전환 큐를 간결한 한국어 시각 단서로 변환한다.
 * - 점멸 주파수 요청이 `3.0 Hz`를 초과하면 WCAG 2.3.1 안전 상한(`3.0 Hz`)으로 즉시 제한한다.
 * - `prefersReducedMotion === true`일 때는 모든 점멸을 `0 Hz` 정적 표기로 전환한다.
 */
export function compileMuteVisualFallbackTracks(
  cues: readonly MultitrackScrollCue[],
  readerContext: ReaderPlaybackContext,
): MuteVisualFallbackTrackReport {
  const requiredCues = cues.filter((cue) => {
    const weight = cue.dramaticWeight ?? (cue.kind === 'ambient-bed' ? 0.4 : 0.85)
    return (
      cue.kind === 'foley-sfx' ||
      cue.kind === 'bgm-motif' ||
      Boolean(cue.visualHint) ||
      (cue.kind === 'ambient-bed' && weight >= 0.6) ||
      (cue.kind === 'haptic-pulse' && (cue.haptic?.intensity ?? 0) >= 0.7)
    )
  })

  const directives: VisualFallbackDirective[] = []
  let clampedFlashCount = 0
  let maxEffectiveFlashHz = 0

  for (const cue of requiredCues) {
    const mood: MoodAtmosphereTone =
      cue.visualHint?.mood ?? cue.mood ?? (cue.kind === 'foley-sfx' ? 'dramatic' : 'calm')
    const captionKo = buildKoreanVisualCaption(cue, mood)
    const requestedFlashHz = Math.max(
      0,
      Number.isFinite(cue.visualHint?.requestedFlashHz ?? NaN)
        ? (cue.visualHint?.requestedFlashHz as number)
        : 0,
    )

    let effectiveFlashHz = requestedFlashHz
    let wasFlashClamped = false

    if (readerContext.prefersReducedMotion) {
      if (requestedFlashHz > 0) {
        wasFlashClamped = true
        clampedFlashCount += 1
      }
      effectiveFlashHz = 0
    } else if (requestedFlashHz > WCAG_MAX_FLASH_HZ) {
      effectiveFlashHz = WCAG_MAX_FLASH_HZ
      wasFlashClamped = true
      clampedFlashCount += 1
    }

    if (effectiveFlashHz > maxEffectiveFlashHz) {
      maxEffectiveFlashHz = effectiveFlashHz
    }

    const startYpx = Math.min(cue.anchor.startYpx, cue.anchor.endYpx)
    const endYpx = Math.max(cue.anchor.startYpx, cue.anchor.endYpx, startYpx + 80)
    const staticFallbackOnly = readerContext.prefersReducedMotion || effectiveFlashHz === 0
    const modeNoteKo = staticFallbackOnly
      ? '정적 시각 표기'
      : `초당 ${effectiveFlashHz.toFixed(1)}회 완만 강조`

    directives.push({
      id: `vfb-${cue.id}`,
      sourceCueId: cue.id,
      sourceKind: cue.kind,
      kind: resolveDefaultDirectiveKind(cue),
      startYpx,
      endYpx,
      captionKo,
      accentOklch: sanitizeOklchColor(cue.visualHint?.tintOklch, mood),
      requestedFlashHz,
      effectiveFlashHz,
      wasFlashClamped,
      staticFallbackOnly,
      accessibilityAriaLabelKo: `${captionKo} (${modeNoteKo})`,
    })
  }

  const requiredSourceCueIds = requiredCues.map((c) => c.id)
  const coveredSet = new Set(directives.map((d) => d.sourceCueId))
  const coveredSourceCueIds = requiredSourceCueIds.filter((id) => coveredSet.has(id))
  const uncoveredSourceCueIds = requiredSourceCueIds.filter((id) => !coveredSet.has(id))
  const fallbackCoverageRatio =
    requiredSourceCueIds.length === 0 ? 1.0 : coveredSourceCueIds.length / requiredSourceCueIds.length

  return {
    directives,
    requiredSourceCueIds,
    coveredSourceCueIds,
    uncoveredSourceCueIds,
    fallbackCoverageRatio,
    clampedFlashCount,
    maxEffectiveFlashHz,
    wcagFlashSafe: maxEffectiveFlashHz <= WCAG_MAX_FLASH_HZ + 1e-9,
    staticReducedMotionReady:
      !readerContext.prefersReducedMotion ||
      directives.every((d) => d.effectiveFlashHz === 0 && d.staticFallbackOnly),
  }
}
