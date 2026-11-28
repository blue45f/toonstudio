import { describe, expect, it } from 'vitest'

import {
  WCAG_MAX_FLASH_HZ,
  compileHapticGovernorSchedule,
  compileMultitrackScrollSoundscape,
  compileMuteVisualFallbackTracks,
  computeSoundscapeManifestFingerprint,
  createSampleScrollSoundscapeScenario,
  evaluateEqualPowerEnvelope,
  evaluateScrollAudioHapticFrame,
  renderScrollSoundscapeAuditSvg,
  resolveHapticPolicy,
  resolveLoudnessPolicy,
  resolveReaderContext,
  runScrollSoundscapeHapticCompiler,
  sha256SoundscapeHex,
  summarizeScrollSoundscapeKo,
  type MultitrackScrollCue,
  type ScrollSoundscapeScenarioInput,
} from './index'

function makeAudioCue(
  id: string,
  kind: 'ambient-bed' | 'bgm-motif' | 'foley-sfx',
  startYpx: number,
  endYpx: number,
  baseGainDb: number,
  priority: number,
  extra?: Partial<MultitrackScrollCue>,
): MultitrackScrollCue {
  return {
    id,
    labelKo: extra?.labelKo ?? id,
    kind,
    anchor: { startYpx, endYpx, fadeInPx: 0, fadeOutPx: 0, ...(extra?.anchor ?? {}) },
    baseGainDb,
    priority,
    ...extra,
  }
}

function makeHapticCue(
  id: string,
  startYpx: number,
  durationMs: number,
  intensity = 0.75,
  priority = 85,
  sharpness = 0.6,
): MultitrackScrollCue {
  return {
    id,
    labelKo: id,
    kind: 'haptic-pulse',
    anchor: { startYpx, endYpx: startYpx + 20, fadeInPx: 0, fadeOutPx: 0 },
    baseGainDb: -120,
    priority,
    haptic: { intensity, sharpness, durationMs },
  }
}

function buildCrossfadeScenario(): ScrollSoundscapeScenarioInput {
  return {
    episodeId: 'ep-crossfade-check',
    episodeTitleKo: '등전력 크로스페이드 검증 화',
    totalScrollHeightPx: 4000,
    cues: [
      makeAudioCue('bgm-a', 'bgm-motif', 0, 2000, -6, 80, {
        labelKo: '전반부 테마',
        anchor: { startYpx: 0, endYpx: 2000, fadeInPx: 200, fadeOutPx: 800 },
        mood: 'calm',
      }),
      makeAudioCue('bgm-b', 'bgm-motif', 1200, 4000, -6, 80, {
        labelKo: '후반부 테마',
        anchor: { startYpx: 1200, endYpx: 4000, fadeInPx: 800, fadeOutPx: 200 },
        mood: 'dramatic',
      }),
    ],
  }
}

describe('Wave 166: 등전력 크로스페이드 및 정·역방향 스크롤 결정론', () => {
  it('겹치는 두 BGM의 중점(t=0.5)에서 gainA^2 + gainB^2 === 1.0을 정밀 만족한다', () => {
    const frame = evaluateScrollAudioHapticFrame(buildCrossfadeScenario(), 1600)
    const trackA = frame.activeTracks.find((t) => t.cueId === 'bgm-a')!
    const trackB = frame.activeTracks.find((t) => t.cueId === 'bgm-b')!
    const gainA = trackA.rawEnvelopeGain
    const gainB = trackB.rawEnvelopeGain

    expect(Math.abs(gainA - Math.SQRT1_2)).toBeLessThan(1e-6)
    expect(Math.abs(gainB - Math.SQRT1_2)).toBeLessThan(1e-6)
    expect(Math.abs(gainA * gainA + gainB * gainB - 1.0)).toBeLessThan(1e-6)
    expect(trackA.isCrossfading).toBe(true)
    expect(trackB.isCrossfading).toBe(true)
  })

  it('크로스페이드 사분위(t=0.25, 0.75) 및 전 구간에서 등전력 항등식을 유지한다', () => {
    const scenario = buildCrossfadeScenario()
    for (const t of [0.1, 0.25, 0.375, 0.5, 0.625, 0.75, 0.9]) {
      const frame = evaluateScrollAudioHapticFrame(scenario, 1200 + 800 * t)
      const gA = frame.activeTracks.find((item) => item.cueId === 'bgm-a')!.rawEnvelopeGain
      const gB = frame.activeTracks.find((item) => item.cueId === 'bgm-b')!.rawEnvelopeGain
      expect(Math.abs(gA * gA + gB * gB - 1.0)).toBeLessThan(1e-6)
    }
  })

  it('페이드인은 단조 증가, 페이드아웃은 단조 감소 곡선을 따른다', () => {
    const scenario = buildCrossfadeScenario()
    const ys = [1250, 1400, 1600, 1800, 1950]
    const gainsA = ys.map(
      (y) => evaluateScrollAudioHapticFrame(scenario, y).activeTracks.find((t) => t.cueId === 'bgm-a')!.rawEnvelopeGain,
    )
    const gainsB = ys.map(
      (y) => evaluateScrollAudioHapticFrame(scenario, y).activeTracks.find((t) => t.cueId === 'bgm-b')!.rawEnvelopeGain,
    )

    for (let i = 1; i < ys.length; i += 1) {
      expect(gainsA[i]).toBeLessThan(gainsA[i - 1])
      expect(gainsB[i]).toBeGreaterThan(gainsB[i - 1])
    }
  })

  it('정방향 스크롤과 역방향 스크롤에서 동일 scrollYpx의 게인과 피크가 완전히 일치한다', () => {
    const scenario = createSampleScrollSoundscapeScenario()
    for (const y of [450, 2800, 3000, 3100, 4600, 5600]) {
      const fwd = evaluateScrollAudioHapticFrame(scenario, y, {
        scrollDirection: 'forward',
        masterGainTrimDb: -1.5,
      })
      const rev = evaluateScrollAudioHapticFrame(scenario, y, {
        scrollDirection: 'reverse',
        masterGainTrimDb: -1.5,
      })
      expect(rev.scrollDirection).toBe('reverse')
      expect(rev.activeVoiceCount).toBe(fwd.activeVoiceCount)
      expect(rev.activeFoleyCueIds).toEqual(fwd.activeFoleyCueIds)
      expect(rev.bgmDuckingAppliedDb).toBe(fwd.bgmDuckingAppliedDb)
      expect(rev.predictedTruePeakDbtp).toBe(fwd.predictedTruePeakDbtp)
      expect(rev.activeTracks).toEqual(fwd.activeTracks)
    }
  })

  it('큐 범위 바깥에서는 0을, 페이드가 없는 즉시 큐는 범위 전체에서 1을 반환한다', () => {
    const instant = { startYpx: 500, endYpx: 900, fadeInPx: 0, fadeOutPx: 0 }
    expect(evaluateEqualPowerEnvelope(instant, 499)).toBe(0)
    expect(evaluateEqualPowerEnvelope(instant, 500)).toBe(1)
    expect(evaluateEqualPowerEnvelope(instant, 700)).toBe(1)
    expect(evaluateEqualPowerEnvelope(instant, 900)).toBe(1)
    expect(evaluateEqualPowerEnvelope(instant, 901)).toBe(0)
  })

  it('페이드 합이 큐 길이를 초과하는 짧은 큐도 비율 보정으로 NaN 없이 정확히 0으로 닫힌다', () => {
    const shortCue = { startYpx: 1000, endYpx: 1100, fadeInPx: 120, fadeOutPx: 120 }
    expect(evaluateEqualPowerEnvelope(shortCue, 1000)).toBe(0)
    expect(evaluateEqualPowerEnvelope(shortCue, 1100)).toBe(0)
    const gMid = evaluateEqualPowerEnvelope(shortCue, 1050)
    expect(gMid).toBeGreaterThan(0.95)
    expect(gMid).toBeLessThanOrEqual(1)
  })

  it('startYpx > endYpx로 뒤집힌 앵커도 안전하게 정규화해 평가한다', () => {
    const inverted = { startYpx: 1400, endYpx: 1000, fadeInPx: 100, fadeOutPx: 100 }
    expect(evaluateEqualPowerEnvelope(inverted, 1200)).toBe(1)
    expect(evaluateEqualPowerEnvelope(inverted, 950)).toBe(0)
  })

  it('길이가 0인 단일 포인트 큐는 정확히 해당 좌표에서만 1을 반환한다', () => {
    const point = { startYpx: 2000, endYpx: 2000, fadeInPx: 0, fadeOutPx: 0 }
    expect(evaluateEqualPowerEnvelope(point, 2000)).toBe(1)
    expect(evaluateEqualPowerEnvelope(point, 2001)).toBe(0)
  })
})

describe('Wave 166: 제로 디지털 클리핑, 자동 덕킹 및 라우드니스 거버너', () => {
  function buildHotOverlapScenario(): ScrollSoundscapeScenarioInput {
    return {
      episodeId: 'ep-hot-overlap',
      episodeTitleKo: '과입력 동시 재생 테스트',
      totalScrollHeightPx: 3000,
      loudnessPolicy: { targetIntegratedLufs: -16, maxTruePeakDbtp: -1, maxPolyphony: 4, foleyDuckingDb: -6 },
      cues: [
        makeAudioCue('amb-hot', 'ambient-bed', 0, 3000, -2, 50, {
          labelKo: '폭풍 환경음',
          anchor: { startYpx: 0, endYpx: 3000, fadeInPx: 50, fadeOutPx: 50 },
        }),
        makeAudioCue('bgm-hot', 'bgm-motif', 0, 3000, 0, 80, {
          labelKo: '격전 오케스트라',
          anchor: { startYpx: 0, endYpx: 3000, fadeInPx: 50, fadeOutPx: 50 },
        }),
        makeAudioCue('foley-boom', 'foley-sfx', 1200, 1600, 0, 95, {
          labelKo: '건물 붕괴 폭음',
          anchor: { startYpx: 1200, endYpx: 1600, fadeInPx: 40, fadeOutPx: 40 },
        }),
      ],
    }
  }

  it('큰 BGM·앰비언트·폴리가 겹칠 때 BGM과 앰비언트에만 자동 덕킹을 적용한다', () => {
    const frame = evaluateScrollAudioHapticFrame(buildHotOverlapScenario(), 1400)
    expect(frame.activeFoleyCueIds).toEqual(['foley-boom'])
    expect(frame.bgmDuckingAppliedDb).toBeCloseTo(-6.0, 5)

    const bgm = frame.activeTracks.find((t) => t.cueId === 'bgm-hot')!
    const amb = frame.activeTracks.find((t) => t.cueId === 'amb-hot')!
    const foley = frame.activeTracks.find((t) => t.cueId === 'foley-boom')!
    expect(bgm.isDucked).toBe(true)
    expect(amb.isDucked).toBe(true)
    expect(foley.isDucked).toBe(false)
    expect(bgm.duckingGainLinear).toBeLessThan(0.55)
    expect(foley.duckingGainLinear).toBe(1)
  })

  it('원시 합산 피크가 +6 dBTP를 넘더라도 컴파일 결과는 <= -1.0 dBTP와 클리핑 0건을 보장한다', () => {
    const compiled = compileMultitrackScrollSoundscape(buildHotOverlapScenario())
    expect(compiled.rawPeakDbtp).toBeGreaterThan(6.0)
    expect(compiled.compiledPeakDbtp).toBeLessThanOrEqual(-1.0)
    expect(compiled.clippingViolationCount).toBe(0)
    expect(compiled.masterGainTrimDb).toBeLessThan(0)
    expect(compiled.duckingTriggeredCount).toBeGreaterThan(0)
  })

  it('양수로 잘못 전달된 foleyDuckingDb 설정도 감쇄(음수 dB)로 안전 정규화한다', () => {
    expect(resolveLoudnessPolicy({ foleyDuckingDb: 9.0 }).foleyDuckingDb).toBe(-9.0)
  })

  it('덕킹 임계값 미만인 아주 미세한 폴리는 BGM을 덕킹하지 않는다', () => {
    const scenario: ScrollSoundscapeScenarioInput = {
      episodeId: 'ep-whisper-foley',
      episodeTitleKo: '미세 폴리 테스트',
      totalScrollHeightPx: 1000,
      cues: [
        makeAudioCue('bgm-calm', 'bgm-motif', 0, 1000, -8, 70),
        makeAudioCue('foley-whisper', 'foley-sfx', 300, 500, -26, 80),
      ],
    }
    const frame = evaluateScrollAudioHapticFrame(scenario, 400)
    expect(frame.activeFoleyCueIds).toEqual(['foley-whisper'])
    expect(frame.bgmDuckingAppliedDb).toBe(0)
    expect(frame.activeTracks.find((t) => t.cueId === 'bgm-calm')!.isDucked).toBe(false)
  })

  it('그리드 간격(sampleStepPx=200) 사이에 끼어 있는 좁은 20px 폴리 피크도 놓치지 않고 클리핑을 차단한다', () => {
    const scenario: ScrollSoundscapeScenarioInput = {
      episodeId: 'ep-narrow-spike',
      episodeTitleKo: '좁은 스파이크 검출 테스트',
      totalScrollHeightPx: 2000,
      loudnessPolicy: { sampleStepPx: 200, maxTruePeakDbtp: -1.0 },
      cues: [
        makeAudioCue('bgm-base', 'bgm-motif', 0, 2000, -2, 70),
        makeAudioCue('foley-spike', 'foley-sfx', 510, 530, 3, 99),
      ],
    }
    const compiled = compileMultitrackScrollSoundscape(scenario)
    expect(compiled.compiledPeakDbtp).toBeLessThanOrEqual(-1.0)
    expect(compiled.clippingViolationCount).toBe(0)

    const spikeFrame = evaluateScrollAudioHapticFrame(scenario, 520, {
      masterGainTrimDb: compiled.masterGainTrimDb,
    })
    expect(spikeFrame.predictedTruePeakDbtp).toBeLessThanOrEqual(-1.0)
  })

  it('마스터 트림이 -6 dB보다 깊게 들어가면 사운드 디렉터 확인용 WARN 진단을 기록한다', () => {
    const scenario = buildHotOverlapScenario()
    const result = runScrollSoundscapeHapticCompiler({
      ...scenario,
      cues: scenario.cues.map((c) => ({ ...c, baseGainDb: c.baseGainDb + 6 })),
    })
    expect(result.compiled.clippingViolationCount).toBe(0)
    expect(result.compiled.masterGainTrimDb).toBeLessThan(-6.0)
    expect(result.compiled.findings.some((f) => f.code === 'HEAVY_MASTER_TRIM_APPLIED')).toBe(true)
    expect(result.verdict).toBe('WARN')
  })

  it('maxTruePeakDbtp를 -1.0 초과 값으로 넘겨도 하드 상한 -1.0 dBTP로 고정한다', () => {
    expect(resolveLoudnessPolicy({ maxTruePeakDbtp: 0.5 }).maxTruePeakDbtp).toBe(-1.0)
  })
})

describe('Wave 166: 폴리포니(동시 발음) 상한 집행', () => {
  function buildDenseFoleyScenario(): ScrollSoundscapeScenarioInput {
    return {
      episodeId: 'ep-polyphony-cap',
      episodeTitleKo: '폴리포니 상한 테스트',
      totalScrollHeightPx: 2000,
      loudnessPolicy: { maxPolyphony: 4 },
      cues: Array.from({ length: 8 }, (_, idx) =>
        makeAudioCue(`foley-layer-${idx + 1}`, 'foley-sfx', 800, 1200, -6, (idx + 1) * 10, {
          labelKo: `동시 효과음 ${idx + 1}`,
          anchor: { startYpx: 800, endYpx: 1200, fadeInPx: 20, fadeOutPx: 20 },
        }),
      ),
    }
  }

  it('동시 활성 8개 폴리를 우선순위 상위 4개로 정확히 제한한다', () => {
    const frame = evaluateScrollAudioHapticFrame(buildDenseFoleyScenario(), 1000)
    expect(frame.activeVoiceCount).toBe(4)
    expect(frame.activeTracks.map((t) => t.cueId)).toEqual([
      'foley-layer-8',
      'foley-layer-7',
      'foley-layer-6',
      'foley-layer-5',
    ])
    expect(frame.polyphonyPrunedCueIds).toEqual([
      'foley-layer-4',
      'foley-layer-3',
      'foley-layer-2',
      'foley-layer-1',
    ])
  })

  it('컴파일 리포트가 전후 폴리포니 수와 정리된 큐 수를 기록하고 WARN 진단을 남긴다', () => {
    const compiled = compileMultitrackScrollSoundscape(buildDenseFoleyScenario())
    expect(compiled.maxObservedPolyphonyBefore).toBe(8)
    expect(compiled.maxObservedPolyphonyAfter).toBe(4)
    expect(compiled.polyphonyPrunedCount).toBe(4)
    expect(compiled.findings.some((f) => f.code === 'POLYPHONY_CAP_PRUNED')).toBe(true)
    expect(compiled.compiledCues.filter((c) => c.wasPolyphonyPruned).length).toBe(4)
  })

  it('우선순위가 동률일 때 음량이 큰 큐와 ID 사전순으로 결정론적 정렬한다', () => {
    const scenario: ScrollSoundscapeScenarioInput = {
      episodeId: 'ep-tie-break',
      episodeTitleKo: '동률 정렬 테스트',
      totalScrollHeightPx: 1000,
      loudnessPolicy: { maxPolyphony: 2 },
      cues: [
        makeAudioCue('cue-c', 'foley-sfx', 100, 500, -6, 50),
        makeAudioCue('cue-a', 'foley-sfx', 100, 500, -6, 50),
        makeAudioCue('cue-loud', 'foley-sfx', 100, 500, -2, 50),
      ],
    }
    const frame = evaluateScrollAudioHapticFrame(scenario, 300)
    expect(frame.activeTracks.map((t) => t.cueId)).toEqual(['cue-loud', 'cue-a'])
    expect(frame.polyphonyPrunedCueIds).toEqual(['cue-c'])
  })

  it('haptic-pulse 전용 큐는 오디오 폴리포니 슬롯을 차지하지 않는다', () => {
    const scenario: ScrollSoundscapeScenarioInput = {
      episodeId: 'ep-haptic-no-voice',
      episodeTitleKo: '햅틱 슬롯 분리 테스트',
      totalScrollHeightPx: 1000,
      loudnessPolicy: { maxPolyphony: 2 },
      cues: [
        makeAudioCue('bgm-1', 'bgm-motif', 0, 1000, -8, 70),
        makeAudioCue('foley-1', 'foley-sfx', 200, 500, -6, 80),
        makeHapticCue('hap-1', 300, 40, 0.8, 99, 0.8),
      ],
    }
    const frame = evaluateScrollAudioHapticFrame(scenario, 310)
    expect(frame.activeVoiceCount).toBe(2)
    expect(frame.polyphonyPrunedCueIds).toEqual([])
    expect(frame.activeHaptics.length).toBe(1)
  })
})

describe('Wave 166: 햅틱 속도 제한, 듀티 사이클 및 모션 축소 존중', () => {
  it('120ms 미만 간격으로 몰린 급속 햅틱 버스트를 병합·억제해 위반을 0건으로 만든다', () => {
    const cues = [
      makeHapticCue('hap-burst-1', 600, 30, 0.6, 90, 0.5),
      makeHapticCue('hap-burst-2', 618, 30, 0.9, 85, 0.8),
      makeHapticCue('hap-burst-3', 660, 30, 0.7, 80, 0.6),
      makeHapticCue('hap-after-cooldown', 800, 35, 0.85, 95, 0.75),
    ]
    const policy = resolveHapticPolicy()
    const report = compileHapticGovernorSchedule(
      cues,
      policy,
      resolveReaderContext({ scrollVelocityPxPerSec: 600 }, policy),
    )

    expect(report.minSpacingViolationsBefore).toBeGreaterThanOrEqual(2)
    expect(report.minSpacingViolationsAfter).toBe(0)
    expect(report.activePulseCount).toBe(2)
    expect(report.throttledOrMergedCount).toBe(2)
    expect(report.hapticSafe).toBe(true)
  })

  it('초근접 버스트 병합 시 선행 펄스에 최대 강도와 병합 cueId를 기록한다', () => {
    const cues = [
      makeHapticCue('hap-lead', 600, 30, 0.5, 80, 0.4),
      makeHapticCue('hap-near', 618, 30, 0.95, 90, 0.85),
    ]
    const policy = resolveHapticPolicy()
    const report = compileHapticGovernorSchedule(
      cues,
      policy,
      resolveReaderContext({ scrollVelocityPxPerSec: 600 }, policy),
    )
    const lead = report.events.find((e) => e.cueId === 'hap-lead')!
    const near = report.events.find((e) => e.cueId === 'hap-near')!
    expect(lead.status).toBe('active')
    expect(lead.intensity).toBe(0.95)
    expect(lead.mergedCueIds).toEqual(['hap-near'])
    expect(near.status).toBe('merged')
  })

  it('연속 펄스의 슬라이딩 듀티 사이클이 25%를 넘으면 초과 펄스를 쓰로틀해 <= 25%로 유지한다', () => {
    const cues = Array.from({ length: 8 }, (_, idx) =>
      makeHapticCue(`hap-duty-${idx + 1}`, 600 + idx * 162, 120, 0.7, 80, 0.6),
    )
    const policy = resolveHapticPolicy({ evaluationWindowMs: 2000, maxDutyCycleRatio: 0.25 })
    const report = compileHapticGovernorSchedule(
      cues,
      policy,
      resolveReaderContext({ scrollVelocityPxPerSec: 600 }, policy),
    )

    expect(report.peakDutyCycleRatioBefore).toBeGreaterThan(0.25)
    expect(report.peakDutyCycleRatioAfter).toBeLessThanOrEqual(0.25)
    expect(report.minSpacingViolationsAfter).toBe(0)
    expect(report.throttledOrMergedCount).toBeGreaterThan(0)
    expect(report.hapticSafe).toBe(true)
  })

  it('단일 펄스가 25% 듀티 상한을 초과(700ms / 2000ms = 35%)하면 안전 지속 시간으로 절단한다', () => {
    const policy = resolveHapticPolicy({ evaluationWindowMs: 2000, maxDutyCycleRatio: 0.25 })
    const report = compileHapticGovernorSchedule(
      [makeHapticCue('hap-oversized', 600, 700, 0.8, 90, 0.3)],
      policy,
      resolveReaderContext({ scrollVelocityPxPerSec: 600 }, policy),
    )
    expect(report.peakDutyCycleRatioBefore).toBeCloseTo(0.35, 3)
    expect(report.peakDutyCycleRatioAfter).toBeLessThanOrEqual(0.25)
    expect(report.events[0].durationMs).toBeLessThanOrEqual(500)
    expect(report.hapticSafe).toBe(true)
  })

  it('prefersReducedMotion: true일 때 활성 진동 펄스를 0회로 완전 차단한다', () => {
    const compiled = compileMultitrackScrollSoundscape(
      createSampleScrollSoundscapeScenario({ readerContext: { prefersReducedMotion: true } }),
    )
    expect(compiled.hapticReport.reducedMotionDisabled).toBe(true)
    expect(compiled.hapticReport.activePulseCount).toBe(0)
    expect(compiled.hapticReport.peakDutyCycleRatioAfter).toBe(0)
    expect(compiled.hapticReport.hapticSafe).toBe(true)
    expect(compiled.hapticReport.events.every((e) => e.status === 'disabled-reduced-motion')).toBe(true)
  })

  it('readerContext.mode가 reduced-motion이면 prefersReducedMotion 미지정 시에도 진동을 끈다', () => {
    const compiled = compileMultitrackScrollSoundscape(
      createSampleScrollSoundscapeScenario({
        readerContext: { mode: 'reduced-motion', prefersReducedMotion: false },
      }),
    )
    expect(compiled.readerContext.prefersReducedMotion).toBe(true)
    expect(compiled.hapticReport.activePulseCount).toBe(0)
  })

  it('단말 햅틱 미지원(deviceHapticsSupported: false) 시 disabled-device 상태로 0회 출력한다', () => {
    const compiled = compileMultitrackScrollSoundscape(
      createSampleScrollSoundscapeScenario({ readerContext: { deviceHapticsSupported: false } }),
    )
    expect(compiled.hapticReport.activePulseCount).toBe(0)
    expect(compiled.hapticReport.events.every((e) => e.status === 'disabled-device')).toBe(true)
  })
})

describe('Wave 166: 음소거·청각 접근성 시각 대체 컴파일러 & WCAG <= 3.0Hz 안전 제한', () => {
  it('모든 주요 폴리 및 BGM 무드 전환 큐에 한국어 시각 대체 지시자를 100% 생성한다', () => {
    const scenario = createSampleScrollSoundscapeScenario()
    const report = compileMuteVisualFallbackTracks(
      scenario.cues,
      resolveReaderContext(scenario.readerContext),
    )
    expect(report.fallbackCoverageRatio).toBe(1.0)
    expect(report.uncoveredSourceCueIds).toEqual([])
    expect(report.coveredSourceCueIds).toEqual(
      expect.arrayContaining([
        'bgm-quiet-piano',
        'bgm-rooftop-strings',
        'foley-thunder-strike',
        'foley-iron-door-slam',
        'foley-blade-draw',
      ]),
    )
    expect(report.directives.every((d) => d.captionKo.length > 0)).toBe(true)
  })

  it('8.0 Hz 번개 점멸 요청을 WCAG 2.3.1 상한(3.0 Hz) 이하로 강제 클램핑한다', () => {
    const scenario = createSampleScrollSoundscapeScenario({
      cues: [
        makeAudioCue('foley-lightning-strobe', 'foley-sfx', 1000, 1300, -3, 95, {
          labelKo: '연속 낙뢰 섬광',
          mood: 'dramatic',
          visualHint: { captionKo: '[번쩍! 낙뢰 연타]', kind: 'sound-caption-badge', requestedFlashHz: 8.0 },
        }),
      ],
    })
    const result = runScrollSoundscapeHapticCompiler(scenario)
    const fb = result.compiled.muteVisualFallback
    expect(fb.directives[0].requestedFlashHz).toBe(8.0)
    expect(fb.directives[0].effectiveFlashHz).toBe(WCAG_MAX_FLASH_HZ)
    expect(fb.directives[0].wasFlashClamped).toBe(true)
    expect(fb.clampedFlashCount).toBe(1)
    expect(fb.wcagFlashSafe).toBe(true)
    expect(result.compiled.findings.some((f) => f.code === 'WCAG_FLASH_CLAMPED')).toBe(true)
    expect(result.verdict).toBe('WARN')
  })

  it('prefersReducedMotion: true일 때 모든 시각 대체 점멸을 0 Hz 정적 표기로 전환한다', () => {
    const compiled = compileMultitrackScrollSoundscape(
      createSampleScrollSoundscapeScenario({ readerContext: { prefersReducedMotion: true } }),
    )
    const fb = compiled.muteVisualFallback
    expect(fb.maxEffectiveFlashHz).toBe(0)
    expect(fb.wcagFlashSafe).toBe(true)
    expect(fb.staticReducedMotionReady).toBe(true)
    expect(fb.directives.every((d) => d.effectiveFlashHz === 0 && d.staticFallbackOnly)).toBe(true)
  })

  it('muted-subway 및 deaf-accessible 모드에서 오디오 출력을 무음 처리하면서 시각 대체 큐를 활성화한다', () => {
    for (const mode of ['muted-subway', 'deaf-accessible'] as const) {
      const compiled = compileMultitrackScrollSoundscape(
        createSampleScrollSoundscapeScenario({ readerContext: { mode } }),
      )
      const thunderFrame = compiled.sampledFrames.find((f) => f.scrollYpx === 3000)!
      expect(thunderFrame.predictedSummedPeakLinear).toBe(0)
      expect(thunderFrame.activeVisualCueIds).toContain('vfb-foley-thunder-strike')
      expect(compiled.muteVisualFallback.fallbackCoverageRatio).toBe(1.0)
      expect(compiled.compiledPeakDbtp).toBeLessThanOrEqual(-1.0)
    }
  })

  it('비표준 색 문자열이 visualHint.tintOklch로 들어와도 순수 oklch(...) 토큰으로 정화한다', () => {
    const report = compileMuteVisualFallbackTracks(
      [
        makeAudioCue('foley-bad-color', 'foley-sfx', 400, 600, -4, 90, {
          mood: 'tense',
          visualHint: { tintOklch: 'not-a-valid-color-token' },
        }),
      ],
      resolveReaderContext(),
    )
    expect(report.directives[0].accentOklch).toMatch(/^oklch\(/i)
  })

  it('시각 힌트가 없는 큐도 자연스러운 한국어 자막 캡션과 접근성 aria 레이블을 자동 생성한다', () => {
    const report = compileMuteVisualFallbackTracks(
      [makeAudioCue('foley-footstep', 'foley-sfx', 200, 400, -6, 75, { labelKo: '빗물 밟는 발소리' })],
      resolveReaderContext(),
    )
    expect(report.directives[0].captionKo).toContain('빗물 밟는 발소리')
    expect(report.directives[0].accessibilityAriaLabelKo).toContain('정적 시각 표기')
  })
})

describe('Wave 166: FIPS 180-4 SHA-256 표준 벡터 및 매니페스트 지문 결정론', () => {
  it('빈 문자열("")의 SHA-256 해시가 FIPS 180-4 표준 벡터와 정확히 일치한다', () => {
    expect(sha256SoundscapeHex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('"abc"의 SHA-256 해시가 FIPS 180-4 표준 벡터와 정확히 일치한다', () => {
    expect(sha256SoundscapeHex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('다중 블록 표준 벡터와 한글 UTF-8 문자열을 결정론적으로 64자리 16진수로 해싱한다', () => {
    expect(
      sha256SoundscapeHex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    const koHash1 = sha256SoundscapeHex('빗속 옥상 대치 사운드스케이프')
    expect(koHash1).toBe(sha256SoundscapeHex('빗속 옥상 대치 사운드스케이프'))
    expect(koHash1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('동일 시나리오를 반복 컴파일하면 매니페스트 지문이 완전히 일치한다', () => {
    const first = computeSoundscapeManifestFingerprint(
      compileMultitrackScrollSoundscape(createSampleScrollSoundscapeScenario()),
    )
    const second = computeSoundscapeManifestFingerprint(
      compileMultitrackScrollSoundscape(createSampleScrollSoundscapeScenario()),
    )
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('임의 큐의 startYpx를 1px만 이동해도 매니페스트 지문이 즉시 바뀐다', () => {
    const base = createSampleScrollSoundscapeScenario()
    const shifted = {
      ...base,
      cues: base.cues.map((c) =>
        c.id === 'foley-thunder-strike'
          ? { ...c, anchor: { ...c.anchor, startYpx: c.anchor.startYpx + 1 } }
          : c,
      ),
    }
    const baseHash = computeSoundscapeManifestFingerprint(compileMultitrackScrollSoundscape(base))
    const shiftedHash = computeSoundscapeManifestFingerprint(compileMultitrackScrollSoundscape(shifted))
    expect(shiftedHash).not.toBe(baseHash)
  })
})

describe('Wave 166: 순수 OKLCH SVG 타임라인, 자연스러운 한국어 브리핑 및 통합 오케스트레이터', () => {
  const RAW_HEX_PATTERN = /#[0-9a-f]{3,8}\b/i
  const RAW_RGB_PATTERN = /\brgba?\s*\(/i
  const RAW_HSL_PATTERN = /\bhsla?\s*\(/i

  it('생성된 SVG가 순수 oklch(...) 색만 사용하고 raw hex/rgb/hsl 색을 전혀 포함하지 않는다', () => {
    const svg = runScrollSoundscapeHapticCompiler(createSampleScrollSoundscapeScenario()).timelineSvg
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('oklch(')
    expect(svg).toContain('트루 피크 헤드룸')
    expect(svg).toContain('음소거 시각 대체 100%')
    expect(RAW_HEX_PATTERN.test(svg)).toBe(false)
    expect(RAW_RGB_PATTERN.test(svg)).toBe(false)
    expect(RAW_HSL_PATTERN.test(svg)).toBe(false)
  })

  it('빈 큐 목록이나 극단적 스크롤 길이에서도 SVG에 NaN이나 Infinity가 나타나지 않는다', () => {
    const emptyCompiled = compileMultitrackScrollSoundscape({
      episodeId: 'ep-empty',
      episodeTitleKo: '무음 에필로그',
      totalScrollHeightPx: 0,
      cues: [],
    })
    const svg = renderScrollSoundscapeAuditSvg(
      emptyCompiled,
      'FAIL',
      computeSoundscapeManifestFingerprint(emptyCompiled),
    )
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('Infinity')
    expect(RAW_HEX_PATTERN.test(svg)).toBe(false)
  })

  it('제목과 큐 라벨의 XML 특수문자(<, >, &, ", \')를 안전하게 이스케이프한다', () => {
    const scenario = createSampleScrollSoundscapeScenario({
      episodeTitleKo: '제166화 <번개 & "폭풍"> \'대치\'',
      cues: [
        makeAudioCue('foley-xml', 'foley-sfx', 500, 800, -4, 90, {
          labelKo: '유리 <파편> & "충격"',
        }),
      ],
    })
    const svg = runScrollSoundscapeHapticCompiler(scenario).timelineSvg
    expect(svg).toContain('&lt;번개 &amp; &quot;폭풍&quot;&gt; &apos;대치&apos;')
    expect(svg).toContain('유리 &lt;파편&gt; &amp; &quot;충격&quot;')
  })

  it('한국어 사운드 디렉터 QA 브리핑이 PASS·WARN·FAIL 상태를 자연스러운 한국어로 보고한다', () => {
    const passSummary = runScrollSoundscapeHapticCompiler(
      createSampleScrollSoundscapeScenario(),
    ).directorSummaryKo
    expect(passSummary).toContain('[PASS]')
    expect(passSummary).toContain('클리핑 0건')
    expect(passSummary).toContain('100%')
    expect(passSummary).not.toContain('가능하게 합니다')
    expect(passSummary).not.toContain('원활한')

    const failCompiled = compileMultitrackScrollSoundscape({
      episodeId: 'ep-zero-height',
      episodeTitleKo: '스크롤 길이 오류 화',
      totalScrollHeightPx: 0,
      cues: [],
    })
    const failSummary = summarizeScrollSoundscapeKo(
      failCompiled,
      'FAIL',
      computeSoundscapeManifestFingerprint(failCompiled),
    )
    expect(failSummary).toContain('[FAIL]')
    expect(failSummary).toContain('점검 메모:')
  })

  it('최상위 오케스트레이터가 기본 샘플 시나리오를 제로 클리핑·햅틱 안전·100% 음소거 대체로 통과한다', () => {
    const result = runScrollSoundscapeHapticCompiler(createSampleScrollSoundscapeScenario())
    expect(result.verdict).toBe('PASS')
    expect(result.manifestFingerprintSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.metrics.compiledPeakDbtp).toBeLessThanOrEqual(-1.0)
    expect(result.metrics.clippingViolationCount).toBe(0)
    expect(result.metrics.maxObservedPolyphonyAfter).toBeLessThanOrEqual(4)
    expect(result.metrics.equalPowerCrossfadeCount).toBeGreaterThanOrEqual(1)
    expect(result.metrics.activeHapticPulseCount).toBe(3)
    expect(result.metrics.minSpacingViolationsAfter).toBe(0)
    expect(result.metrics.peakDutyCycleRatioAfter).toBeLessThanOrEqual(0.25)
    expect(result.metrics.hapticSafe).toBe(true)
    expect(result.metrics.fallbackCoverageRatio).toBe(1.0)
    expect(result.metrics.maxEffectiveFlashHz).toBeLessThanOrEqual(3.0)
    expect(result.metrics.wcagFlashSafe).toBe(true)
  })
})
