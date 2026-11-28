/**
 * Wave 166 — 웹툰 세로 스크롤 시네마틱 사운드스케이프·폴리(Foley)·진동 햅틱(Haptic)
 * 멀티트랙 싱크 타임라인 & 독자 음소거(Mute) 시각 대체 컴파일러 핵심 타입 정의.
 *
 * - ES2017 strict TypeScript (`verbatimModuleSyntax` 준수, `any` 금지)
 * - 모든 시각 토큰은 순수 `oklch(...)` 색 공간 계약만 허용한다.
 */

export type SoundscapeTrackKind =
  | 'ambient-bed'
  | 'bgm-motif'
  | 'foley-sfx'
  | 'haptic-pulse'

export type ReaderPlaybackMode =
  | 'full-audio-haptic'
  | 'muted-subway'
  | 'reduced-motion'
  | 'deaf-accessible'

export type ScrollDirection = 'forward' | 'reverse' | 'stationary'

export type SoundscapeAuditVerdict = 'PASS' | 'WARN' | 'FAIL'

export type SoundscapeFindingSeverity = 'info' | 'warn' | 'error'

export type VisualFallbackCueKind =
  | 'sound-caption-badge'
  | 'oklch-vignette-tint'
  | 'panel-rhythm-mark'

export type MoodAtmosphereTone =
  | 'calm'
  | 'tense'
  | 'dramatic'
  | 'melancholic'
  | 'triumphant'
  | 'eerie'

export type CompiledHapticEventStatus =
  | 'active'
  | 'merged'
  | 'throttled'
  | 'disabled-reduced-motion'
  | 'disabled-device'

/** 세로 스크롤 원고 좌표(px) 기준 오디오·햅틱 큐 배치 기하 */
export interface ScrollAnchorGeometry {
  readonly startYpx: number
  readonly endYpx: number
  readonly fadeInPx: number
  readonly fadeOutPx: number
}

/** 단말 햅틱 액추에이터(Taptic/Linear Resonant Actuator) 구동 포락선 */
export interface HapticHardwareEnvelope {
  /** 진동 세기 (0.0 ~ 1.0) */
  readonly intensity: number
  /** 진동 선명도/날카로움 (0.0 ~ 1.0) */
  readonly sharpness: number
  /** 단일 펄스 지속 시간 (ms) */
  readonly durationMs: number
  /** 개별 큐 최소 쿨다운 요청 (ms, 최소 120ms 하한 강제) */
  readonly minCooldownMs?: number
  /** 개별 큐 최대 듀티 사이클 상한 요청 (0~1, 최대 0.25 상한 강제) */
  readonly maxDutyCycleRatio?: number
}

/** 햅틱 과열·피로 방지 거버너 정책 */
export interface HapticGovernorPolicy {
  /** 연속 펄스 간 최소 휴지 간격 (ms, 기본 120ms, 하한 120ms) */
  readonly minCooldownMs: number
  /** 슬라이딩 윈도우 내 최대 진동 점유율 (기본 0.25 = 25%) */
  readonly maxDutyCycleRatio: number
  /** 듀티 사이클 평가 슬라이딩 윈도우 길이 (ms, 기본 2000ms) */
  readonly evaluationWindowMs: number
  /** 스크롤 px → 재생 시간 ms 변환 기준 속도 (px/sec, 기본 600) */
  readonly assumedScrollVelocityPxPerSec: number
}

/** 라우드니스·트루 피크·폴리포니·자동 덕킹 정책 */
export interface LoudnessAndDuckingPolicy {
  /** 목표 통합 음량 (LUFS, 모바일 웹툰 기본 -16.0) */
  readonly targetIntegratedLufs: number
  /** 허용 트루 피크 상한 (dBTP, 기본 -1.0 이하 강제) */
  readonly maxTruePeakDbtp: number
  /** 동시 활성 오디오 보이스 상한 (기본 4) */
  readonly maxPolyphony: number
  /** 폴리 피크 발생 시 BGM·앰비언트 자동 감쇄량 (dB, 기본 -6.0) */
  readonly foleyDuckingDb: number
  /** 자동 덕킹을 유발하는 폴리 최소 레벨 기준 (dBFS, 기본 -18.0) */
  readonly foleyDuckingThresholdDbfs: number
  /** 전체 스크롤 캔버스 샘플링 간격 (px, 기본 50) */
  readonly sampleStepPx: number
}

/** 작가가 큐에 지정할 수 있는 음소거·접근성 시각 대체 힌트 */
export interface RequestedVisualFallbackHint {
  readonly captionKo?: string
  readonly kind?: VisualFallbackCueKind
  /** 요청 점멸 주파수 (Hz). WCAG 2.3.1 기준으로 컴파일러가 <= 3.0 Hz로 강제 제한한다. */
  readonly requestedFlashHz?: number
  /** 순수 `oklch(...)` 색 문자열만 수용하며 비정상 색 표현은 무드 기본 토큰으로 대체된다. */
  readonly tintOklch?: string
  readonly mood?: MoodAtmosphereTone
}

/** 멀티트랙 세로 스크롤 개별 큐 명세 */
export interface MultitrackScrollCue {
  readonly id: string
  readonly labelKo: string
  readonly kind: SoundscapeTrackKind
  readonly anchor: ScrollAnchorGeometry
  /** 기준 피크 음량 (dBFS). `haptic-pulse` 전용 큐는 -Infinity 또는 음수 무음값 사용 */
  readonly baseGainDb: number
  /** 크레스트 팩터 추정치 (dB, 통합 LUFS 근사 계산용) */
  readonly peakToRmsCrestDb?: number
  /** 폴리포니 상한 및 햅틱 병합 시 우선순위 (클수록 우선) */
  readonly priority: number
  /** 연출 비중 (0.0 ~ 1.0). 시각 대체 우선 추출 판단에 사용 */
  readonly dramaticWeight?: number
  readonly mood?: MoodAtmosphereTone
  readonly crossfadeGroup?: string
  readonly haptic?: HapticHardwareEnvelope
  readonly visualHint?: RequestedVisualFallbackHint
}

/** 독자 재생 환경 컨텍스트 */
export interface ReaderPlaybackContext {
  readonly mode: ReaderPlaybackMode
  readonly prefersReducedMotion: boolean
  readonly deviceHapticsSupported: boolean
  readonly scrollVelocityPxPerSec: number
}

/** Wave 166 컴파일러 입력 시나리오 */
export interface ScrollSoundscapeScenarioInput {
  readonly episodeId: string
  readonly episodeTitleKo: string
  readonly totalScrollHeightPx: number
  readonly cues: readonly MultitrackScrollCue[]
  readonly loudnessPolicy?: Partial<LoudnessAndDuckingPolicy>
  readonly hapticPolicy?: Partial<HapticGovernorPolicy>
  readonly readerContext?: Partial<ReaderPlaybackContext>
}

/** 특정 `scrollYpx`에서 평가된 개별 트랙 게인 상태 */
export interface ActiveTrackFrameGain {
  readonly cueId: string
  readonly labelKo: string
  readonly kind: SoundscapeTrackKind
  /** 등전력(equal-power) 페이드 포락선 계수 (0.0 ~ 1.0) */
  readonly rawEnvelopeGain: number
  /** 폴리 자동 덕킹 계수 (0.0 ~ 1.0) */
  readonly duckingGainLinear: number
  /** 마스터 클리핑 방지 트림 계수 (0.0 ~ 1.0) */
  readonly masterTrimLinear: number
  /** 최종 선형 게인 배율 (`rawEnvelopeGain * duckingGainLinear * masterTrimLinear`) */
  readonly effectiveLinearGain: number
  /** 최종 선형 피크 진폭 (`dbToLinear(baseGainDb) * effectiveLinearGain`) */
  readonly effectivePeakLinear: number
  /** 최종 피크 dBTP */
  readonly effectivePeakDbtp: number
  readonly isCrossfading: boolean
  readonly isDucked: boolean
}

/** 특정 `scrollYpx`에서 평가된 햅틱 상태 */
export interface ActiveHapticFrameState {
  readonly cueId: string
  readonly intensity: number
  readonly sharpness: number
  readonly durationMs: number
  readonly active: boolean
  readonly suppressedReason: string | null
}

/** 임의 세로 스크롤 지점(`scrollYpx`)의 오디오·햅틱·시각 대체 평가 결과 */
export interface EvaluatedScrollFrame {
  readonly scrollYpx: number
  readonly scrollDirection: ScrollDirection
  readonly activeTracks: readonly ActiveTrackFrameGain[]
  readonly activeFoleyCueIds: readonly string[]
  readonly bgmDuckingAppliedDb: number
  readonly activeVoiceCount: number
  readonly polyphonyPrunedCueIds: readonly string[]
  readonly rawSummedPeakLinear: number
  readonly rawSummedPeakDbtp: number
  readonly predictedSummedPeakLinear: number
  readonly predictedTruePeakDbtp: number
  readonly activeHaptics: readonly ActiveHapticFrameState[]
  readonly activeVisualCueIds: readonly string[]
}

/** 거버너를 거친 개별 햅틱 이벤트 */
export interface CompiledHapticEvent {
  readonly cueId: string
  readonly labelKo: string
  readonly triggerYpx: number
  readonly triggerTimeMs: number
  readonly durationMs: number
  readonly intensity: number
  readonly sharpness: number
  readonly status: CompiledHapticEventStatus
  readonly mergedCueIds: readonly string[]
  readonly noteKo: string
}

/** 햅틱 거버너 컴파일 요약 */
export interface HapticCompilationReport {
  readonly events: readonly CompiledHapticEvent[]
  readonly activePulseCount: number
  readonly throttledOrMergedCount: number
  readonly minSpacingViolationsBefore: number
  readonly minSpacingViolationsAfter: number
  readonly peakDutyCycleRatioBefore: number
  readonly peakDutyCycleRatioAfter: number
  readonly reducedMotionDisabled: boolean
  readonly hapticSafe: boolean
}

/** WCAG 2.3.1 점멸 안전 한계(<= 3.0 Hz)를 준수하는 음소거 시각 대체 지시자 */
export interface VisualFallbackDirective {
  readonly id: string
  readonly sourceCueId: string
  readonly sourceKind: SoundscapeTrackKind
  readonly kind: VisualFallbackCueKind
  readonly startYpx: number
  readonly endYpx: number
  readonly captionKo: string
  readonly accentOklch: string
  readonly requestedFlashHz: number
  readonly effectiveFlashHz: number
  readonly wasFlashClamped: boolean
  readonly staticFallbackOnly: boolean
  readonly accessibilityAriaLabelKo: string
}

/** 음소거·청각 접근성 시각 대체 트랙 컴파일 리포트 */
export interface MuteVisualFallbackTrackReport {
  readonly directives: readonly VisualFallbackDirective[]
  readonly requiredSourceCueIds: readonly string[]
  readonly coveredSourceCueIds: readonly string[]
  readonly uncoveredSourceCueIds: readonly string[]
  readonly fallbackCoverageRatio: number
  readonly clampedFlashCount: number
  readonly maxEffectiveFlashHz: number
  readonly wcagFlashSafe: boolean
  readonly staticReducedMotionReady: boolean
}

/** 컴파일러가 보정한 개별 트랙 큐 */
export interface CompiledTrackCue extends MultitrackScrollCue {
  readonly compiledGainTrimDb: number
  readonly maxObservedEnvelopeGain: number
  readonly wasPolyphonyPruned: boolean
}

/** 사운드·햅틱·접근성 감사 진단 항목 */
export interface SoundscapeAuditFinding {
  readonly code: string
  readonly severity: SoundscapeFindingSeverity
  readonly cueId?: string
  readonly scrollYpx?: number
  readonly messageKo: string
}

/** 멀티트랙 스크롤 사운드스케이프 컴파일 산출물 */
export interface CompiledScrollSoundscape {
  readonly episodeId: string
  readonly episodeTitleKo: string
  readonly totalScrollHeightPx: number
  readonly loudnessPolicy: LoudnessAndDuckingPolicy
  readonly hapticPolicy: HapticGovernorPolicy
  readonly readerContext: ReaderPlaybackContext
  readonly compiledCues: readonly CompiledTrackCue[]
  readonly masterGainTrimDb: number
  readonly rawPeakDbtp: number
  readonly compiledPeakDbtp: number
  readonly estimatedIntegratedLufs: number
  readonly clippingViolationCount: number
  readonly maxObservedPolyphonyBefore: number
  readonly maxObservedPolyphonyAfter: number
  readonly polyphonyPrunedCount: number
  readonly duckingTriggeredCount: number
  readonly equalPowerCrossfadeCount: number
  readonly sampledFrames: readonly EvaluatedScrollFrame[]
  readonly hapticReport: HapticCompilationReport
  readonly muteVisualFallback: MuteVisualFallbackTrackReport
  readonly findings: readonly SoundscapeAuditFinding[]
}

/** `/studio` 런타임 허브 셀프체크용 요약 지표 */
export interface ScrollSoundscapeTelemetryMetrics {
  readonly compiledPeakDbtp: number
  readonly rawPeakDbtp: number
  readonly masterGainTrimDb: number
  readonly estimatedIntegratedLufs: number
  readonly clippingViolationCount: number
  readonly maxObservedPolyphonyAfter: number
  readonly polyphonyPrunedCount: number
  readonly equalPowerCrossfadeCount: number
  readonly activeHapticPulseCount: number
  readonly minSpacingViolationsAfter: number
  readonly peakDutyCycleRatioAfter: number
  readonly hapticSafe: boolean
  readonly fallbackCoverageRatio: number
  readonly maxEffectiveFlashHz: number
  readonly wcagFlashSafe: boolean
}

/** Wave 166 최상위 오케스트레이터 결과 */
export interface ScrollSoundscapeCompilerResult {
  readonly verdict: SoundscapeAuditVerdict
  readonly manifestFingerprintSha256: string
  readonly compiled: CompiledScrollSoundscape
  readonly timelineSvg: string
  readonly directorSummaryKo: string
  readonly metrics: ScrollSoundscapeTelemetryMetrics
}
