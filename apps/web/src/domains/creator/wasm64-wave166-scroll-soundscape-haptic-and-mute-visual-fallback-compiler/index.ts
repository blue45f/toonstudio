/**
 * Wave 166 공개 배럴 진입점 (`wasm64-wave166-scroll-soundscape-haptic-and-mute-visual-fallback-compiler`).
 *
 * 웹툰 세로 스크롤 시네마틱 사운드스케이프·폴리(Foley)·진동 햅틱(Haptic) 멀티트랙 싱크 타임라인 및
 * 독자 음소거(Mute)·청각 접근성 시각 대체 컴파일러 오케스트레이터와 샘플 시나리오를 제공한다.
 */

import { compileMultitrackScrollSoundscape } from './multitrack-scroll-sync-compiler'
import {
  computeSoundscapeManifestFingerprint,
  renderScrollSoundscapeAuditSvg,
  summarizeScrollSoundscapeKo,
} from './soundscape-report-and-svg'
import type {
  CompiledScrollSoundscape,
  ScrollSoundscapeCompilerResult,
  ScrollSoundscapeScenarioInput,
  ScrollSoundscapeTelemetryMetrics,
  SoundscapeAuditVerdict,
} from './soundscape-haptic-types'

export type {
  ActiveHapticFrameState,
  ActiveTrackFrameGain,
  CompiledHapticEvent,
  CompiledHapticEventStatus,
  CompiledScrollSoundscape,
  CompiledTrackCue,
  EvaluatedScrollFrame,
  HapticCompilationReport,
  HapticGovernorPolicy,
  HapticHardwareEnvelope,
  LoudnessAndDuckingPolicy,
  MoodAtmosphereTone,
  MultitrackScrollCue,
  MuteVisualFallbackTrackReport,
  ReaderPlaybackContext,
  ReaderPlaybackMode,
  RequestedVisualFallbackHint,
  ScrollAnchorGeometry,
  ScrollDirection,
  ScrollSoundscapeCompilerResult,
  ScrollSoundscapeScenarioInput,
  ScrollSoundscapeTelemetryMetrics,
  SoundscapeAuditFinding,
  SoundscapeAuditVerdict,
  SoundscapeFindingSeverity,
  SoundscapeTrackKind,
  VisualFallbackCueKind,
  VisualFallbackDirective,
} from './soundscape-haptic-types'

export {
  DEFAULT_HAPTIC_POLICY,
  DEFAULT_LOUDNESS_POLICY,
  DEFAULT_READER_CONTEXT,
  HAPTIC_HARD_MAX_DUTY_CYCLE_RATIO,
  HAPTIC_HARD_MIN_COOLDOWN_MS,
  TRUE_PEAK_HARD_CEILING_DBTP,
  WCAG_MAX_FLASH_HZ,
  clampNumber,
  compileHapticGovernorSchedule,
  compileMultitrackScrollSoundscape,
  compileMuteVisualFallbackTracks,
  dbToLinear,
  evaluateEqualPowerEnvelope,
  evaluateScrollAudioHapticFrame,
  linearToDb,
  resolveHapticPolicy,
  resolveLoudnessPolicy,
  resolveReaderContext,
  type EvaluateFrameOptions,
} from './multitrack-scroll-sync-compiler'

export {
  computeSoundscapeManifestFingerprint,
  escapeXmlText,
  renderScrollSoundscapeAuditSvg,
  sha256SoundscapeHex,
  summarizeScrollSoundscapeKo,
} from './soundscape-report-and-svg'

/**
 * `/studio` 런타임 허브 셀프체크 및 기본 검증용 세로 스크롤 사운드스케이프 시나리오.
 * - `[2600px, 3400px]` 구간에서 두 BGM 트랙이 정밀 등전력(equal-power) 크로스페이드를 수행한다.
 * - 천둥·철문·칼날 폴리 피크에서 BGM 자동 덕킹과 트루 피크 보호(`<= -1.0 dBTP`)를 검증한다.
 */
export function createSampleScrollSoundscapeScenario(
  overrides?: Partial<ScrollSoundscapeScenarioInput>,
): ScrollSoundscapeScenarioInput {
  const base: ScrollSoundscapeScenarioInput = {
    episodeId: 'ep-166-rainy-rooftop',
    episodeTitleKo: '제166화 · 빗속 옥상 대치',
    totalScrollHeightPx: 6400,
    loudnessPolicy: {
      targetIntegratedLufs: -16.0,
      maxTruePeakDbtp: -1.0,
      maxPolyphony: 4,
      foleyDuckingDb: -6.0,
      foleyDuckingThresholdDbfs: -18.0,
      sampleStepPx: 50,
    },
    hapticPolicy: {
      minCooldownMs: 120,
      maxDutyCycleRatio: 0.25,
      evaluationWindowMs: 2000,
      assumedScrollVelocityPxPerSec: 600,
    },
    readerContext: {
      mode: 'full-audio-haptic',
      prefersReducedMotion: false,
      deviceHapticsSupported: true,
      scrollVelocityPxPerSec: 600,
    },
    cues: [
      {
        id: 'amb-night-rain',
        labelKo: '밤비 빗소리 배경',
        kind: 'ambient-bed',
        anchor: { startYpx: 0, endYpx: 6400, fadeInPx: 200, fadeOutPx: 300 },
        baseGainDb: -14,
        priority: 40,
        dramaticWeight: 0.5,
        mood: 'melancholic',
      },
      {
        id: 'bgm-quiet-piano',
        labelKo: '옥상 진입 피아노 테마',
        kind: 'bgm-motif',
        anchor: { startYpx: 0, endYpx: 3400, fadeInPx: 300, fadeOutPx: 800 },
        baseGainDb: -7,
        priority: 75,
        dramaticWeight: 0.85,
        mood: 'melancholic',
        crossfadeGroup: 'main-score',
        visualHint: {
          captionKo: '잔잔한 피아노 선율',
          kind: 'oklch-vignette-tint',
          mood: 'melancholic',
          requestedFlashHz: 0,
        },
      },
      {
        id: 'bgm-rooftop-strings',
        labelKo: '대치 현악 클라이맥스',
        kind: 'bgm-motif',
        anchor: { startYpx: 2600, endYpx: 6400, fadeInPx: 800, fadeOutPx: 400 },
        baseGainDb: -6,
        priority: 80,
        dramaticWeight: 0.92,
        mood: 'dramatic',
        crossfadeGroup: 'main-score',
        visualHint: {
          captionKo: '긴박한 현악 고조',
          kind: 'oklch-vignette-tint',
          mood: 'dramatic',
          requestedFlashHz: 1.5,
        },
      },
      {
        id: 'foley-thunder-strike',
        labelKo: '낙뢰 천둥 굉음',
        kind: 'foley-sfx',
        anchor: { startYpx: 2950, endYpx: 3250, fadeInPx: 40, fadeOutPx: 110 },
        baseGainDb: -2,
        priority: 95,
        dramaticWeight: 1.0,
        mood: 'dramatic',
        visualHint: {
          captionKo: '[천둥 쾅!]',
          kind: 'sound-caption-badge',
          mood: 'dramatic',
          requestedFlashHz: 2.5,
        },
      },
      {
        id: 'foley-iron-door-slam',
        labelKo: '옥상 철문 닫힘',
        kind: 'foley-sfx',
        anchor: { startYpx: 4500, endYpx: 4720, fadeInPx: 20, fadeOutPx: 80 },
        baseGainDb: -3,
        priority: 90,
        dramaticWeight: 0.9,
        mood: 'tense',
        visualHint: {
          captionKo: '[철문 쾅]',
          kind: 'sound-caption-badge',
          mood: 'tense',
          requestedFlashHz: 0,
        },
      },
      {
        id: 'foley-blade-draw',
        labelKo: '칼날 뽑는 마찰음',
        kind: 'foley-sfx',
        anchor: { startYpx: 5500, endYpx: 5720, fadeInPx: 25, fadeOutPx: 75 },
        baseGainDb: -4,
        priority: 92,
        dramaticWeight: 0.95,
        mood: 'tense',
        visualHint: {
          captionKo: '[스윽 — 칼날]',
          kind: 'panel-rhythm-mark',
          mood: 'tense',
          requestedFlashHz: 2.0,
        },
      },
      {
        id: 'hap-thunder-jolt',
        labelKo: '낙뢰 저주파 진동',
        kind: 'haptic-pulse',
        anchor: { startYpx: 2960, endYpx: 3040, fadeInPx: 0, fadeOutPx: 0 },
        baseGainDb: -120,
        priority: 95,
        dramaticWeight: 0.9,
        haptic: {
          intensity: 0.85,
          sharpness: 0.7,
          durationMs: 65,
          minCooldownMs: 120,
          maxDutyCycleRatio: 0.25,
        },
      },
      {
        id: 'hap-door-thud',
        labelKo: '철문 충격 펄스',
        kind: 'haptic-pulse',
        anchor: { startYpx: 4510, endYpx: 4570, fadeInPx: 0, fadeOutPx: 0 },
        baseGainDb: -120,
        priority: 88,
        dramaticWeight: 0.8,
        haptic: {
          intensity: 0.72,
          sharpness: 0.5,
          durationMs: 45,
          minCooldownMs: 120,
          maxDutyCycleRatio: 0.25,
        },
      },
      {
        id: 'hap-blade-snap',
        labelKo: '칼날 섬광 틱',
        kind: 'haptic-pulse',
        anchor: { startYpx: 5510, endYpx: 5560, fadeInPx: 0, fadeOutPx: 0 },
        baseGainDb: -120,
        priority: 90,
        dramaticWeight: 0.85,
        haptic: {
          intensity: 0.65,
          sharpness: 0.92,
          durationMs: 35,
          minCooldownMs: 120,
          maxDutyCycleRatio: 0.25,
        },
      },
    ],
  }

  return {
    ...base,
    ...overrides,
    loudnessPolicy: {
      ...base.loudnessPolicy,
      ...(overrides?.loudnessPolicy ?? {}),
    },
    hapticPolicy: {
      ...base.hapticPolicy,
      ...(overrides?.hapticPolicy ?? {}),
    },
    readerContext: {
      ...base.readerContext,
      ...(overrides?.readerContext ?? {}),
    },
    cues: overrides?.cues ?? base.cues,
  }
}

function resolveAuditVerdict(compiled: CompiledScrollSoundscape): SoundscapeAuditVerdict {
  const hasError =
    compiled.findings.some((f) => f.severity === 'error') ||
    compiled.clippingViolationCount > 0 ||
    !compiled.hapticReport.hapticSafe ||
    !compiled.muteVisualFallback.wcagFlashSafe ||
    compiled.muteVisualFallback.fallbackCoverageRatio < 1.0

  if (hasError) {
    return 'FAIL'
  }
  const hasWarn = compiled.findings.some((f) => f.severity === 'warn')
  if (hasWarn) {
    return 'WARN'
  }
  return 'PASS'
}

function extractTelemetryMetrics(
  compiled: CompiledScrollSoundscape,
): ScrollSoundscapeTelemetryMetrics {
  return {
    compiledPeakDbtp: compiled.compiledPeakDbtp,
    rawPeakDbtp: compiled.rawPeakDbtp,
    masterGainTrimDb: compiled.masterGainTrimDb,
    estimatedIntegratedLufs: compiled.estimatedIntegratedLufs,
    clippingViolationCount: compiled.clippingViolationCount,
    maxObservedPolyphonyAfter: compiled.maxObservedPolyphonyAfter,
    polyphonyPrunedCount: compiled.polyphonyPrunedCount,
    equalPowerCrossfadeCount: compiled.equalPowerCrossfadeCount,
    activeHapticPulseCount: compiled.hapticReport.activePulseCount,
    minSpacingViolationsAfter: compiled.hapticReport.minSpacingViolationsAfter,
    peakDutyCycleRatioAfter: compiled.hapticReport.peakDutyCycleRatioAfter,
    hapticSafe: compiled.hapticReport.hapticSafe,
    fallbackCoverageRatio: compiled.muteVisualFallback.fallbackCoverageRatio,
    maxEffectiveFlashHz: compiled.muteVisualFallback.maxEffectiveFlashHz,
    wcagFlashSafe: compiled.muteVisualFallback.wcagFlashSafe,
  }
}

/**
 * Wave 166 최상위 오케스트레이터 (`/studio` 런타임 허브 셀프체크 및 배포 프리플라이트 진입점).
 */
export function runScrollSoundscapeHapticCompiler(
  input: ScrollSoundscapeScenarioInput = createSampleScrollSoundscapeScenario(),
): ScrollSoundscapeCompilerResult {
  const compiled = compileMultitrackScrollSoundscape(input)
  const manifestFingerprintSha256 = computeSoundscapeManifestFingerprint(compiled)
  const verdict = resolveAuditVerdict(compiled)
  const timelineSvg = renderScrollSoundscapeAuditSvg(
    compiled,
    verdict,
    manifestFingerprintSha256,
  )
  const directorSummaryKo = summarizeScrollSoundscapeKo(
    compiled,
    verdict,
    manifestFingerprintSha256,
  )

  return {
    verdict,
    manifestFingerprintSha256,
    compiled,
    timelineSvg,
    directorSummaryKo,
    metrics: extractTelemetryMetrics(compiled),
  }
}
