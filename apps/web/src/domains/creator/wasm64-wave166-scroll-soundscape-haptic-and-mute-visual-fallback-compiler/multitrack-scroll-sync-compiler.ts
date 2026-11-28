/**
 * Wave 166 — 멀티트랙 세로 스크롤 싱크·등전력 크로스페이드·라우드니스/폴리포니 거버너 핵심 연산 모듈.
 *
 * - 정방향·역방향 스크롤 모두에서 `scrollYpx`의 순수 결정론 함수로 등전력(equal-power) 페이드를 계산한다.
 * - 폴리(Foley) 피크 구간에서 BGM·앰비언트 자동 덕킹을 적용하고 최악 위상 합산 트루 피크를 `<= -1.0 dBTP`로 제한한다.
 * - 햅틱 거버너 및 음소거 시각 대체 컴파일러는 `haptic-and-mute-fallback-compiler.ts`와 연동·재노출한다.
 */

import {
  DEFAULT_HAPTIC_POLICY,
  DEFAULT_READER_CONTEXT,
  HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO,
  HAPTIC_HARD_MIN_COOLDOWN_MS,
  WCAG_MAX_FLASH_HZ,
  clampNumber,
  compileHapticGovernorSchedule,
  compileMuteVisualFallbackTracks,
  resolveHapticPolicy,
  resolveReaderContext,
} from './haptic-and-mute-fallback-compiler'
import type {
  ActiveHapticFrameState,
  ActiveTrackFrameGain,
  CompiledHapticEvent,
  CompiledScrollSoundscape,
  CompiledTrackCue,
  EvaluatedScrollFrame,
  LoudnessAndDuckingPolicy,
  MultitrackScrollCue,
  ScrollAnchorGeometry,
  ScrollDirection,
  ScrollSoundscapeScenarioInput,
  SoundscapeAuditFinding,
  SoundscapeTrackKind,
  VisualFallbackDirective,
} from './soundscape-haptic-types'

export {
  DEFAULT_HAPTIC_POLICY,
  DEFAULT_READER_CONTEXT,
  HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO,
  HAPTIC_HARD_MIN_COOLDOWN_MS,
  WCAG_MAX_FLASH_HZ,
  clampNumber,
  compileHapticGovernorSchedule,
  compileMuteVisualFallbackTracks,
  resolveHapticPolicy,
  resolveReaderContext,
}

export const TRUE_PEAK_HARD_CEILING_DBTP = -1.0
const SILENCE_FLOOR_DB = -120
const PEAK_TRIM_SAFETY_MARGIN_DB = 0.01

export const DEFAULT_LOUDNESS_POLICY: LoudnessAndDuckingPolicy = {
  targetIntegratedLufs: -16.0,
  maxTruePeakDbtp: -1.0,
  maxPolyphony: 4,
  foleyDuckingDb: -6.0,
  foleyDuckingThresholdDbfs: -18.0,
  sampleStepPx: 50,
}

export function dbToLinear(db: number): number {
  if (!Number.isFinite(db) || db <= SILENCE_FLOOR_DB) {
    return 0
  }
  return Math.pow(10, db / 20)
}

export function linearToDb(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 1e-6) {
    return SILENCE_FLOOR_DB
  }
  return 20 * Math.log10(linear)
}

export function resolveLoudnessPolicy(
  partial?: Partial<LoudnessAndDuckingPolicy>,
): LoudnessAndDuckingPolicy {
  const maxTruePeakRaw = partial?.maxTruePeakDbtp ?? DEFAULT_LOUDNESS_POLICY.maxTruePeakDbtp
  const foleyDuckingRaw = partial?.foleyDuckingDb ?? DEFAULT_LOUDNESS_POLICY.foleyDuckingDb

  return {
    targetIntegratedLufs: Number.isFinite(partial?.targetIntegratedLufs ?? NaN)
      ? (partial?.targetIntegratedLufs as number)
      : DEFAULT_LOUDNESS_POLICY.targetIntegratedLufs,
    maxTruePeakDbtp: Math.min(TRUE_PEAK_HARD_CEILING_DBTP, maxTruePeakRaw),
    maxPolyphony: Math.max(
      1,
      Math.floor(partial?.maxPolyphony ?? DEFAULT_LOUDNESS_POLICY.maxPolyphony),
    ),
    foleyDuckingDb: -Math.abs(Number.isFinite(foleyDuckingRaw) ? foleyDuckingRaw : 6.0),
    foleyDuckingThresholdDbfs: Number.isFinite(partial?.foleyDuckingThresholdDbfs ?? NaN)
      ? (partial?.foleyDuckingThresholdDbfs as number)
      : DEFAULT_LOUDNESS_POLICY.foleyDuckingThresholdDbfs,
    sampleStepPx: Math.max(
      10,
      Math.floor(partial?.sampleStepPx ?? DEFAULT_LOUDNESS_POLICY.sampleStepPx),
    ),
  }
}

/**
 * 등전력(equal-power) 코사인/사인 스크롤 페이드 포락선 평가.
 * 겹침 구간에서 `gainA^2 + gainB^2 === 1.0`을 정방향·역방향 모두에서 결정론적으로 만족한다.
 */
export function evaluateEqualPowerEnvelope(
  anchor: ScrollAnchorGeometry,
  scrollYpx: number,
): number {
  const start = Math.min(anchor.startYpx, anchor.endYpx)
  const end = Math.max(anchor.startYpx, anchor.endYpx)
  const span = end - start

  if (!Number.isFinite(scrollYpx) || scrollYpx < start || scrollYpx > end) {
    return 0
  }
  if (span <= 0) {
    return scrollYpx === start ? 1 : 0
  }

  let fadeIn = Math.max(0, anchor.fadeInPx)
  let fadeOut = Math.max(0, anchor.fadeOutPx)
  if (fadeIn + fadeOut > span && fadeIn + fadeOut > 0) {
    const scale = span / (fadeIn + fadeOut)
    fadeIn *= scale
    fadeOut *= scale
  }

  let gainIn = 1
  if (fadeIn > 0 && scrollYpx < start + fadeIn) {
    const u = clampNumber((scrollYpx - start) / fadeIn, 0, 1)
    gainIn = u <= 0 ? 0 : u >= 1 ? 1 : Math.sin(u * (Math.PI / 2))
  }

  let gainOut = 1
  if (fadeOut > 0 && scrollYpx > end - fadeOut) {
    const v = clampNumber((scrollYpx - (end - fadeOut)) / fadeOut, 0, 1)
    gainOut = v >= 1 ? 0 : v <= 0 ? 1 : Math.cos(v * (Math.PI / 2))
  }

  return clampNumber(gainIn * gainOut, 0, 1)
}

function isAudioTrackKind(kind: SoundscapeTrackKind): boolean {
  return kind === 'ambient-bed' || kind === 'bgm-motif' || kind === 'foley-sfx'
}

export interface EvaluateFrameOptions {
  readonly scrollDirection?: ScrollDirection
  readonly masterGainTrimDb?: number
  readonly compiledHapticEvents?: readonly CompiledHapticEvent[]
  readonly visualDirectives?: readonly VisualFallbackDirective[]
}

/**
 * 임의 세로 스크롤 지점 `scrollYpx`에서의 멀티트랙 오디오·자동 덕킹·폴리포니·햅틱·시각 대체 프레임 평가.
 */
export function evaluateScrollAudioHapticFrame(
  scenario: ScrollSoundscapeScenarioInput,
  scrollYpx: number,
  options?: EvaluateFrameOptions,
): EvaluatedScrollFrame {
  const loudnessPolicy = resolveLoudnessPolicy(scenario.loudnessPolicy)
  const hapticPolicy = resolveHapticPolicy(scenario.hapticPolicy)
  const readerContext = resolveReaderContext(scenario.readerContext, hapticPolicy)
  const scrollDirection: ScrollDirection = options?.scrollDirection ?? 'forward'
  const masterTrimLinear = dbToLinear(options?.masterGainTrimDb ?? 0)
  const audioMutedByMode =
    readerContext.mode === 'muted-subway' || readerContext.mode === 'deaf-accessible'

  const activeCandidates: Array<{
    cue: MultitrackScrollCue
    rawEnvelopeGain: number
    basePeakLinear: number
  }> = []

  for (const cue of scenario.cues) {
    if (!isAudioTrackKind(cue.kind)) {
      continue
    }
    const env = evaluateEqualPowerEnvelope(cue.anchor, scrollYpx)
    if (env <= 1e-9) {
      continue
    }
    activeCandidates.push({
      cue,
      rawEnvelopeGain: env,
      basePeakLinear: dbToLinear(cue.baseGainDb),
    })
  }

  let rawSummedPeakLinear = 0
  for (const item of activeCandidates) {
    rawSummedPeakLinear += item.basePeakLinear * item.rawEnvelopeGain
  }

  const sortedCandidates = [...activeCandidates].sort((a, b) => {
    if (b.cue.priority !== a.cue.priority) {
      return b.cue.priority - a.cue.priority
    }
    const levelDiff = b.basePeakLinear * b.rawEnvelopeGain - a.basePeakLinear * a.rawEnvelopeGain
    if (Math.abs(levelDiff) > 1e-9) {
      return levelDiff
    }
    return a.cue.id.localeCompare(b.cue.id)
  })

  const keptCandidates = sortedCandidates.slice(0, loudnessPolicy.maxPolyphony)
  const polyphonyPrunedCueIds = sortedCandidates
    .slice(loudnessPolicy.maxPolyphony)
    .map((entry) => entry.cue.id)

  const activeBgmCount = keptCandidates.filter((c) => c.cue.kind === 'bgm-motif').length
  const activeAmbientCount = keptCandidates.filter((c) => c.cue.kind === 'ambient-bed').length

  const foleyThresholdLinear = dbToLinear(loudnessPolicy.foleyDuckingThresholdDbfs)
  const activeFoleyCueIds: string[] = []
  let maxDuckTriggerEnvelope = 0

  for (const entry of keptCandidates) {
    if (entry.cue.kind === 'foley-sfx') {
      activeFoleyCueIds.push(entry.cue.id)
      if (entry.basePeakLinear * entry.rawEnvelopeGain >= foleyThresholdLinear) {
        maxDuckTriggerEnvelope = Math.max(maxDuckTriggerEnvelope, entry.rawEnvelopeGain)
      }
    }
  }

  const bgmDuckingAppliedDb =
    maxDuckTriggerEnvelope > 0 ? loudnessPolicy.foleyDuckingDb * maxDuckTriggerEnvelope : 0
  const duckingLinearForMusic = dbToLinear(bgmDuckingAppliedDb)

  const activeTracks: ActiveTrackFrameGain[] = []
  let predictedSummedPeakLinear = 0

  for (const entry of keptCandidates) {
    const isMusicOrBed = entry.cue.kind === 'bgm-motif' || entry.cue.kind === 'ambient-bed'
    const isDucked = isMusicOrBed && bgmDuckingAppliedDb < -1e-6
    const duckingGainLinear = isDucked ? duckingLinearForMusic : 1.0
    const effectiveLinearGain =
      entry.rawEnvelopeGain * duckingGainLinear * masterTrimLinear * (audioMutedByMode ? 0 : 1)
    const effectivePeakLinear = entry.basePeakLinear * effectiveLinearGain
    predictedSummedPeakLinear += effectivePeakLinear

    const isCrossfading =
      (entry.cue.kind === 'bgm-motif' && activeBgmCount >= 2 && entry.rawEnvelopeGain < 0.999999) ||
      (entry.cue.kind === 'ambient-bed' &&
        activeAmbientCount >= 2 &&
        entry.rawEnvelopeGain < 0.999999)

    activeTracks.push({
      cueId: entry.cue.id,
      labelKo: entry.cue.labelKo,
      kind: entry.cue.kind,
      rawEnvelopeGain: entry.rawEnvelopeGain,
      duckingGainLinear,
      masterTrimLinear,
      effectiveLinearGain,
      effectivePeakLinear,
      effectivePeakDbtp: linearToDb(effectivePeakLinear),
      isCrossfading,
      isDucked,
    })
  }

  const activeHaptics: ActiveHapticFrameState[] = []
  const velocity = readerContext.scrollVelocityPxPerSec
  if (options?.compiledHapticEvents) {
    for (const evt of options.compiledHapticEvents) {
      const durationPx = Math.max(12, (evt.durationMs / 1000) * velocity)
      if (scrollYpx >= evt.triggerYpx && scrollYpx <= evt.triggerYpx + durationPx) {
        activeHaptics.push({
          cueId: evt.cueId,
          intensity: evt.status === 'active' ? evt.intensity : 0,
          sharpness: evt.status === 'active' ? evt.sharpness : 0,
          durationMs: evt.durationMs,
          active: evt.status === 'active',
          suppressedReason: evt.status === 'active' ? null : evt.noteKo,
        })
      }
    }
  } else {
    for (const cue of scenario.cues) {
      if (cue.kind !== 'haptic-pulse' && !cue.haptic) {
        continue
      }
      if (
        scrollYpx >= cue.anchor.startYpx &&
        scrollYpx <= Math.max(cue.anchor.endYpx, cue.anchor.startYpx + 20)
      ) {
        const disabled = readerContext.prefersReducedMotion || !readerContext.deviceHapticsSupported
        activeHaptics.push({
          cueId: cue.id,
          intensity: disabled ? 0 : clampNumber(cue.haptic?.intensity ?? 0.65, 0, 1),
          sharpness: disabled ? 0 : clampNumber(cue.haptic?.sharpness ?? 0.5, 0, 1),
          durationMs: clampNumber(cue.haptic?.durationMs ?? 40, 8, 250),
          active: !disabled,
          suppressedReason: disabled ? '모션 축소 또는 단말 미지원으로 진동 해제' : null,
        })
      }
    }
  }

  const activeVisualCueIds: string[] = []
  if (options?.visualDirectives) {
    for (const directive of options.visualDirectives) {
      if (scrollYpx >= directive.startYpx && scrollYpx <= directive.endYpx) {
        activeVisualCueIds.push(directive.id)
      }
    }
  }

  return {
    scrollYpx,
    scrollDirection,
    activeTracks,
    activeFoleyCueIds,
    bgmDuckingAppliedDb,
    activeVoiceCount: activeTracks.length,
    polyphonyPrunedCueIds,
    rawSummedPeakLinear,
    rawSummedPeakDbtp: linearToDb(rawSummedPeakLinear),
    predictedSummedPeakLinear,
    predictedTruePeakDbtp: linearToDb(predictedSummedPeakLinear),
    activeHaptics,
    activeVisualCueIds,
  }
}

function collectCriticalSamplePoints(
  totalScrollHeightPx: number,
  cues: readonly MultitrackScrollCue[],
  stepPx: number,
): number[] {
  const pointSet = new Set<number>([0, Math.max(0, totalScrollHeightPx)])
  const height = Math.max(0, totalScrollHeightPx)

  for (let y = 0; y <= height; y += stepPx) {
    pointSet.add(y)
  }

  for (const cue of cues) {
    const start = clampNumber(Math.min(cue.anchor.startYpx, cue.anchor.endYpx), 0, height)
    const end = clampNumber(Math.max(cue.anchor.startYpx, cue.anchor.endYpx), 0, height)
    const span = end - start
    const fadeIn = Math.min(Math.max(0, cue.anchor.fadeInPx), span)
    const fadeOut = Math.min(Math.max(0, cue.anchor.fadeOutPx), span)

    pointSet.add(start)
    pointSet.add(end)
    pointSet.add(Number(((start + end) / 2).toFixed(2)))
    if (fadeIn > 0) {
      pointSet.add(Number((start + fadeIn * 0.25).toFixed(2)))
      pointSet.add(Number((start + fadeIn * 0.5).toFixed(2)))
      pointSet.add(Number((start + fadeIn * 0.75).toFixed(2)))
      pointSet.add(Number((start + fadeIn).toFixed(2)))
    }
    if (fadeOut > 0) {
      pointSet.add(Number((end - fadeOut).toFixed(2)))
      pointSet.add(Number((end - fadeOut * 0.5).toFixed(2)))
    }
  }

  return Array.from(pointSet).sort((a, b) => a - b)
}

function countEqualPowerCrossfadePairs(cues: readonly MultitrackScrollCue[]): number {
  const musicCues = cues.filter((c) => c.kind === 'bgm-motif' || c.kind === 'ambient-bed')
  let count = 0
  for (let i = 0; i < musicCues.length; i += 1) {
    for (let j = i + 1; j < musicCues.length; j += 1) {
      const a = musicCues[i]
      const b = musicCues[j]
      if (a.kind !== b.kind) {
        continue
      }
      const overlapStart = Math.max(a.anchor.startYpx, b.anchor.startYpx)
      const overlapEnd = Math.min(a.anchor.endYpx, b.anchor.endYpx)
      if (overlapEnd > overlapStart && (a.anchor.fadeOutPx > 0 || b.anchor.fadeInPx > 0)) {
        count += 1
      }
    }
  }
  return count
}

function computeFrameRmsPower(
  frame: EvaluatedScrollFrame,
  cueById: ReadonlyMap<string, MultitrackScrollCue>,
): number {
  let framePower = 0
  for (const track of frame.activeTracks) {
    const srcCue = cueById.get(track.cueId)
    const crestDb = srcCue?.peakToRmsCrestDb ?? (track.kind === 'foley-sfx' ? 3.5 : 6.0)
    const rmsLinear = track.effectivePeakLinear / dbToLinear(crestDb)
    framePower += rmsLinear * rmsLinear
  }
  return framePower
}

/**
 * 멀티트랙 스크롤 사운드스케이프·라우드니스·폴리포니·햅틱·음소거 시각 대체 통합 컴파일러.
 */
export function compileMultitrackScrollSoundscape(
  scenario: ScrollSoundscapeScenarioInput,
): CompiledScrollSoundscape {
  const loudnessPolicy = resolveLoudnessPolicy(scenario.loudnessPolicy)
  const hapticPolicy = resolveHapticPolicy(scenario.hapticPolicy)
  const readerContext = resolveReaderContext(scenario.readerContext, hapticPolicy)
  const totalScrollHeightPx = Math.max(0, scenario.totalScrollHeightPx)

  const hapticReport = compileHapticGovernorSchedule(scenario.cues, hapticPolicy, readerContext)
  const muteVisualFallback = compileMuteVisualFallbackTracks(scenario.cues, readerContext)
  const samplePoints = collectCriticalSamplePoints(
    totalScrollHeightPx,
    scenario.cues,
    loudnessPolicy.sampleStepPx,
  )

  const audioEvalScenario: ScrollSoundscapeScenarioInput = {
    ...scenario,
    loudnessPolicy,
    hapticPolicy,
    readerContext: { ...readerContext, mode: 'full-audio-haptic' },
  }

  const cueById = new Map<string, MultitrackScrollCue>()
  for (const cue of scenario.cues) {
    cueById.set(cue.id, cue)
  }

  let rawPeakLinearMax = 0
  let postDuckPeakLinearMax = 0
  let maxObservedPolyphonyBefore = 0
  let rmsSumSqAccum = 0
  let activeRmsFrameCount = 0

  for (const y of samplePoints) {
    const frame = evaluateScrollAudioHapticFrame(audioEvalScenario, y, { masterGainTrimDb: 0 })
    if (frame.rawSummedPeakLinear > rawPeakLinearMax) {
      rawPeakLinearMax = frame.rawSummedPeakLinear
    }
    if (frame.predictedSummedPeakLinear > postDuckPeakLinearMax) {
      postDuckPeakLinearMax = frame.predictedSummedPeakLinear
    }
    const beforeCount = frame.activeVoiceCount + frame.polyphonyPrunedCueIds.length
    if (beforeCount > maxObservedPolyphonyBefore) {
      maxObservedPolyphonyBefore = beforeCount
    }
    if (frame.activeTracks.length > 0) {
      rmsSumSqAccum += computeFrameRmsPower(frame, cueById)
      activeRmsFrameCount += 1
    }
  }

  const maxAllowedPeakLinear = dbToLinear(loudnessPolicy.maxTruePeakDbtp)
  const peakTrimDb =
    postDuckPeakLinearMax > maxAllowedPeakLinear
      ? linearToDb(maxAllowedPeakLinear / postDuckPeakLinearMax) - PEAK_TRIM_SAFETY_MARGIN_DB
      : 0
  const rawIntegratedLufs =
    activeRmsFrameCount > 0
      ? 10 * Math.log10(Math.max(1e-12, rmsSumSqAccum / activeRmsFrameCount)) - 0.691
      : SILENCE_FLOOR_DB
  const loudnessExcessTrimDb =
    rawIntegratedLufs > loudnessPolicy.targetIntegratedLufs + 1.5
      ? loudnessPolicy.targetIntegratedLufs - rawIntegratedLufs
      : 0
  const masterGainTrimDb = Number(Math.min(0, peakTrimDb, loudnessExcessTrimDb).toFixed(3))

  const sampledFrames: EvaluatedScrollFrame[] = []
  let compiledPeakLinearMax = 0
  let clippingViolationCount = 0
  let maxObservedPolyphonyAfter = 0
  let duckingTriggeredCount = 0
  let compiledRmsSumSqAccum = 0
  let compiledRmsFrameCount = 0

  const maxEnvelopeByCue = new Map<string, number>()
  const prunedCueIdSet = new Set<string>()
  const isMutedReaderMode =
    readerContext.mode === 'muted-subway' || readerContext.mode === 'deaf-accessible'

  for (const y of samplePoints) {
    const frame = evaluateScrollAudioHapticFrame(
      { ...scenario, loudnessPolicy, hapticPolicy, readerContext },
      y,
      {
        masterGainTrimDb,
        compiledHapticEvents: hapticReport.events,
        visualDirectives: muteVisualFallback.directives,
      },
    )
    sampledFrames.push(frame)

    if (frame.activeVoiceCount > maxObservedPolyphonyAfter) {
      maxObservedPolyphonyAfter = frame.activeVoiceCount
    }
    if (frame.bgmDuckingAppliedDb < -1e-6) {
      duckingTriggeredCount += 1
    }
    for (const prunedId of frame.polyphonyPrunedCueIds) {
      prunedCueIdSet.add(prunedId)
    }
    for (const track of frame.activeTracks) {
      const prevMax = maxEnvelopeByCue.get(track.cueId) ?? 0
      if (track.rawEnvelopeGain > prevMax) {
        maxEnvelopeByCue.set(track.cueId, track.rawEnvelopeGain)
      }
    }

    const audioVerifyFrame = isMutedReaderMode
      ? evaluateScrollAudioHapticFrame(audioEvalScenario, y, { masterGainTrimDb })
      : frame
    if (audioVerifyFrame.predictedSummedPeakLinear > compiledPeakLinearMax) {
      compiledPeakLinearMax = audioVerifyFrame.predictedSummedPeakLinear
    }
    if (audioVerifyFrame.predictedTruePeakDbtp > loudnessPolicy.maxTruePeakDbtp + 1e-6) {
      clippingViolationCount += 1
    }
    if (audioVerifyFrame.activeTracks.length > 0) {
      compiledRmsSumSqAccum += computeFrameRmsPower(audioVerifyFrame, cueById)
      compiledRmsFrameCount += 1
    }
  }

  const compiledCues: CompiledTrackCue[] = scenario.cues.map((cue) => ({
    ...cue,
    compiledGainTrimDb: isAudioTrackKind(cue.kind) ? masterGainTrimDb : 0,
    maxObservedEnvelopeGain: Number((maxEnvelopeByCue.get(cue.id) ?? 0).toFixed(4)),
    wasPolyphonyPruned: prunedCueIdSet.has(cue.id),
  }))

  const estimatedIntegratedLufs =
    compiledRmsFrameCount > 0
      ? Number(
          (
            10 * Math.log10(Math.max(1e-12, compiledRmsSumSqAccum / compiledRmsFrameCount)) -
            0.691
          ).toFixed(2),
        )
      : SILENCE_FLOOR_DB

  const compiledPeakDbtp = Number(linearToDb(compiledPeakLinearMax).toFixed(2))
  const rawPeakDbtp = Number(linearToDb(rawPeakLinearMax).toFixed(2))
  const equalPowerCrossfadeCount = countEqualPowerCrossfadePairs(scenario.cues)
  const polyphonyPrunedCount = prunedCueIdSet.size

  const findings: SoundscapeAuditFinding[] = []
  if (totalScrollHeightPx <= 0) {
    findings.push({
      code: 'INVALID_SCROLL_HEIGHT',
      severity: 'error',
      messageKo: '원고 세로 스크롤 길이가 0px 이하라 사운드 타임라인을 배치할 수 없습니다.',
    })
  }
  if (clippingViolationCount > 0) {
    findings.push({
      code: 'TRUE_PEAK_CLIPPING_REMAINING',
      severity: 'error',
      messageKo: `트루 피크 상한(${loudnessPolicy.maxTruePeakDbtp} dBTP) 초과 구간이 ${clippingViolationCount}건 남아 있습니다.`,
    })
  } else if (masterGainTrimDb < -6.0) {
    findings.push({
      code: 'HEAVY_MASTER_TRIM_APPLIED',
      severity: 'warn',
      messageKo: `클리핑 방지를 위해 마스터 트림 ${masterGainTrimDb.toFixed(1)} dB를 크게 적용했습니다. 원본 트랙 레벨 정리를 권장합니다.`,
    })
  } else if (masterGainTrimDb < -0.05) {
    findings.push({
      code: 'AUTO_MASTER_TRIM_APPLIED',
      severity: 'info',
      messageKo: `피크 보호용 마스터 트림 ${masterGainTrimDb.toFixed(2)} dB를 자동 적용해 ${compiledPeakDbtp.toFixed(2)} dBTP로 맞췄습니다.`,
    })
  }
  if (polyphonyPrunedCount > 0) {
    findings.push({
      code: 'POLYPHONY_CAP_PRUNED',
      severity: 'warn',
      messageKo: `동시 발음 상한(${loudnessPolicy.maxPolyphony}트랙)을 넘어 하위 우선순위 큐 ${polyphonyPrunedCount}건을 정리했습니다.`,
    })
  }
  if (!hapticReport.hapticSafe) {
    findings.push({
      code: 'HAPTIC_SAFETY_BREACH',
      severity: 'error',
      messageKo: '햅틱 최소 간격 또는 듀티 사이클 안전 기준을 충족하지 못했습니다.',
    })
  } else if (hapticReport.throttledOrMergedCount > 0) {
    findings.push({
      code: 'HAPTIC_BURST_GOVERNED',
      severity: 'warn',
      messageKo: `과밀 햅틱 버스트 ${hapticReport.throttledOrMergedCount}건을 병합·억제해 120ms 간격과 25% 듀티 상한을 지켰습니다.`,
    })
  }
  if (!muteVisualFallback.wcagFlashSafe) {
    findings.push({
      code: 'WCAG_FLASH_RATE_UNSAFE',
      severity: 'error',
      messageKo: '시각 대체 점멸 주파수가 WCAG 2.3.1 상한(3.0 Hz)을 초과했습니다.',
    })
  } else if (muteVisualFallback.clampedFlashCount > 0) {
    findings.push({
      code: 'WCAG_FLASH_CLAMPED',
      severity: 'warn',
      messageKo: `과도한 점멸 요청 ${muteVisualFallback.clampedFlashCount}건을 WCAG 2.3.1 안전 한계(${readerContext.prefersReducedMotion ? '0 Hz 정적 표기' : '3.0 Hz 이하'})로 낮췄습니다.`,
    })
  }
  if (muteVisualFallback.fallbackCoverageRatio < 1.0) {
    findings.push({
      code: 'INCOMPLETE_MUTE_FALLBACK_COVERAGE',
      severity: 'error',
      messageKo: `음소거 시각 대체 누락 큐가 ${muteVisualFallback.uncoveredSourceCueIds.length}건 있습니다.`,
    })
  }

  return {
    episodeId: scenario.episodeId,
    episodeTitleKo: scenario.episodeTitleKo,
    totalScrollHeightPx,
    loudnessPolicy,
    hapticPolicy,
    readerContext,
    compiledCues,
    masterGainTrimDb,
    rawPeakDbtp,
    compiledPeakDbtp,
    estimatedIntegratedLufs,
    clippingViolationCount,
    maxObservedPolyphonyBefore,
    maxObservedPolyphonyAfter,
    polyphonyPrunedCount,
    duckingTriggeredCount,
    equalPowerCrossfadeCount,
    sampledFrames,
    hapticReport,
    muteVisualFallback,
    findings,
  }
}
