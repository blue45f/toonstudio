import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIGH_SPEED_FLING_VELOCITY_PX_PER_SEC,
  DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
  auditEpisodeBgmCueSheet,
  canonicalizeBgmCueJson,
  computeCamelotHarmonicDistance,
  createBoundaryJitterScrollTrajectory,
  createConstantVelocityScrollTrajectory,
  escapeBgmSvgXml,
  evaluateScrollBgmMixAtPosition,
  isValidCamelotKey,
  parseCamelotKey,
  renderScrollSyncBgmCueSvg,
  sha256BgmCueHex,
  simulateReaderScrollAudioSession,
  summarizeScrollSyncBgmCueKo,
  validateBgmCueSheet,
  type BgmTrackCueSpec,
  type CamelotKey,
} from "./index";

function makeCue(
  overrides: Partial<BgmTrackCueSpec> & Pick<BgmTrackCueSpec, "cueId" | "startYPx" | "endYPx">,
): BgmTrackCueSpec {
  return {
    trackId: `trk-${overrides.cueId}`,
    titleKo: overrides.titleKo ?? `트랙 ${overrides.cueId}`,
    bpm: 96,
    musicalKeyCamelot: "8A",
    targetLufs: -16.0,
    fadeInPx: 200,
    fadeOutPx: 200,
    ...overrides,
  };
}

function makeHarmoniousEpisodeCues(): readonly BgmTrackCueSpec[] {
  return [
    makeCue({
      cueId: "cue-01-dawn",
      trackId: "trk-dawn-piano",
      titleKo: "새벽 안개 피아노",
      startYPx: 0,
      endYPx: 2400,
      bpm: 84,
      musicalKeyCamelot: "8A",
      targetLufs: -16.5,
      fadeInPx: 240,
      fadeOutPx: 400,
      duckingForDialogueDb: -6,
    }),
    makeCue({
      cueId: "cue-02-chase",
      trackId: "trk-alley-strings",
      titleKo: "골목 추격 스트링",
      startYPx: 2000,
      endYPx: 4800,
      bpm: 124,
      musicalKeyCamelot: "9A",
      targetLufs: -15.2,
      fadeInPx: 400,
      fadeOutPx: 360,
      duckingForDialogueDb: -4.5,
    }),
    makeCue({
      cueId: "cue-03-relief",
      trackId: "trk-sunrise-harp",
      titleKo: "해돋이 하프 회상",
      startYPx: 4440,
      endYPx: 7200,
      bpm: 92,
      musicalKeyCamelot: "9B",
      targetLufs: -16.8,
      fadeInPx: 360,
      fadeOutPx: 300,
      duckingForDialogueDb: -5,
    }),
  ];
}

function makeEpisodeWithDramaticSilence(): readonly BgmTrackCueSpec[] {
  return [
    makeCue({
      cueId: "cue-01-tension",
      titleKo: "긴장 첼로 드론",
      startYPx: 0,
      endYPx: 3200,
      fadeInPx: 200,
      fadeOutPx: 300,
    }),
    makeCue({
      cueId: "cut-silence-twist",
      titleKo: "반전 눈빛 정적 컷",
      startYPx: 1500,
      endYPx: 2300,
      bpm: 0,
      targetLufs: -72.0,
      fadeInPx: 120,
      fadeOutPx: 120,
      isDramaticSilenceCut: true,
    }),
  ];
}

describe("Wave 126 — 세로 스크롤 동기화 BGM 정전력 크로스페이드 & 극적 무음 격리", () => {
  it("인접 2트랙 크로스페이드 전 구간에서 gainA^2 + gainB^2 === 1.0 ± 1e-6 을 보장한다", () => {
    const cues = makeHarmoniousEpisodeCues();
    for (let step = 0; step <= 20; step += 1) {
      const y = 2000 + (400 * step) / 20;
      const snap = evaluateScrollBgmMixAtPosition(cues, y);
      expect(snap.ok).toBe(true);
      expect(snap.isCrossfadeZone).toBe(true);
      const pair = snap.crossfadePair!;
      const t = step / 20;
      expect(pair.outgoingGain).toBeCloseTo(Math.cos((t * Math.PI) / 2), 6);
      expect(pair.incomingGain).toBeCloseTo(Math.sin((t * Math.PI) / 2), 6);
      const powerErr = Math.abs(
        pair.outgoingGain * pair.outgoingGain + pair.incomingGain * pair.incomingGain - 1,
      );
      expect(powerErr).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(snap.totalPowerSum - 1)).toBeLessThanOrEqual(1e-6);
    }
  });

  it("크로스페이드 정중앙(t=0.5)에서 양쪽 트랙 이득이 sqrt(0.5)≈0.707107 로 음량 꺼짐(dip)이 0건이다", () => {
    const mid = evaluateScrollBgmMixAtPosition(makeHarmoniousEpisodeCues(), 2200);
    expect(mid.crossfadePair?.progress).toBeCloseTo(0.5, 6);
    expect(mid.crossfadePair?.outgoingGain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(mid.crossfadePair?.incomingGain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(mid.totalPowerSum).toBeCloseTo(1.0, 6);
  });

  it("크로스페이드 진입(y=2000)과 종료(y=2400) 경계에서 이득이 연속적으로 이어진다", () => {
    const cues = makeHarmoniousEpisodeCues();
    const startSnap = evaluateScrollBgmMixAtPosition(cues, 2000);
    const endSnap = evaluateScrollBgmMixAtPosition(cues, 2400);
    expect(startSnap.crossfadePair?.outgoingGain).toBeCloseTo(1, 6);
    expect(startSnap.crossfadePair?.incomingGain).toBeCloseTo(0, 6);
    expect(endSnap.crossfadePair?.outgoingGain).toBeCloseTo(0, 6);
    expect(endSnap.crossfadePair?.incomingGain).toBeCloseTo(1, 6);
  });

  it("단독 재생 구간의 페이드인·서스테인·페이드아웃 포락선이 자연스럽게 동작한다", () => {
    const cues = makeHarmoniousEpisodeCues();
    const fadeIn = evaluateScrollBgmMixAtPosition(cues, 120);
    const sustain = evaluateScrollBgmMixAtPosition(cues, 1000);
    const fadeOut = evaluateScrollBgmMixAtPosition(cues, 7050);

    expect(fadeIn.activeTracks[0].phase).toBe("fade-in");
    expect(fadeIn.activeTracks[0].linearGain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sustain.activeTracks[0].phase).toBe("sustain");
    expect(sustain.activeTracks[0].linearGain).toBeCloseTo(1, 6);
    expect(fadeOut.activeTracks[0].phase).toBe("fade-out");
    expect(fadeOut.activeTracks[0].linearGain).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("대사 활성(dialogueActive) 시 duckingForDialogueDb 만큼 선형 이득을 정확히 감쇠한다", () => {
    const ducked = evaluateScrollBgmMixAtPosition(makeHarmoniousEpisodeCues(), 1000, {
      dialogueActive: true,
    });
    expect(ducked.activeTracks[0].linearGain).toBeCloseTo(Math.pow(10, -6 / 20), 5);
    expect(ducked.activeTracks[0].duckingAppliedDb).toBe(-6);
  });

  it("극적 무음 컷 코어 구간에서는 모든 배경 BGM 선형 이득이 <= 0.001(-60dB 이하)로 완전 격리된다", () => {
    const cues = makeEpisodeWithDramaticSilence();
    const corePoints = [1620, 1750, 1900, 2050, 2180];
    for (let i = 0; i < corePoints.length; i += 1) {
      const snap = evaluateScrollBgmMixAtPosition(cues, corePoints[i]);
      expect(snap.ok).toBe(true);
      expect(snap.isDramaticSilenceCore).toBe(true);
      expect(snap.activeSilenceCutId).toBe("cut-silence-twist");
      expect(snap.maxActiveGainLinear).toBeLessThanOrEqual(0.001);
      for (let t = 0; t < snap.activeTracks.length; t += 1) {
        expect(snap.activeTracks[t].linearGain).toBeLessThanOrEqual(0.001);
        expect(snap.activeTracks[t].gainDb).toBeLessThanOrEqual(-60);
        expect(snap.activeTracks[t].phase).toBe("silence-isolated");
      }
    }
  });

  it("크로스페이드 한가운데에 극적 무음 컷이 놓여도 두 트랙 모두 <= 0.001 로 완전 침묵한다", () => {
    const cues: readonly BgmTrackCueSpec[] = [
      ...makeHarmoniousEpisodeCues(),
      makeCue({
        cueId: "cut-silence-overlap",
        titleKo: "교차 정적 컷",
        startYPx: 2050,
        endYPx: 2350,
        bpm: 0,
        targetLufs: -75,
        fadeInPx: 40,
        fadeOutPx: 40,
        isDramaticSilenceCut: true,
      }),
    ];
    const snap = evaluateScrollBgmMixAtPosition(cues, 2200);
    expect(snap.isDramaticSilenceCore).toBe(true);
    expect(snap.maxActiveGainLinear).toBeLessThanOrEqual(0.001);
    expect(snap.activeTracks.length).toBe(2);
    expect(snap.activeTracks[0].linearGain).toBeLessThanOrEqual(0.001);
    expect(snap.activeTracks[1].linearGain).toBeLessThanOrEqual(0.001);
  });

  it("극적 무음 컷의 fadeInPx가 0이거나 고속 플링(3600 px/s)이어도 최소 안티클릭 페이드 >= 40ms를 보장한다", () => {
    const base = makeEpisodeWithDramaticSilence();
    const cues: readonly BgmTrackCueSpec[] = [
      base[0],
      { ...base[1], fadeInPx: 0, fadeOutPx: 5 },
    ];
    const snap = evaluateScrollBgmMixAtPosition(cues, 1900, {
      scrollVelocityPxPerSec: DEFAULT_HIGH_SPEED_FLING_VELOCITY_PX_PER_SEC,
    });
    expect(snap.effectiveAntiClickFadeMs).toBeGreaterThanOrEqual(40);
  });

  it("극적 무음 컷 종료 뒤 복귀 구간을 벗어나면 배경 BGM 이득이 1.0으로 정상 복구된다", () => {
    const cues = makeEpisodeWithDramaticSilence();
    const exitMid = evaluateScrollBgmMixAtPosition(cues, 2240);
    const recovered = evaluateScrollBgmMixAtPosition(cues, 2600);
    expect(exitMid.isDramaticSilenceCore).toBe(false);
    expect(exitMid.maxActiveGainLinear).toBeGreaterThan(0.1);
    expect(exitMid.maxActiveGainLinear).toBeLessThan(1.0);
    expect(recovered.maxActiveGainLinear).toBeCloseTo(1.0, 6);
  });
});

describe("Wave 126 — 독자 스크롤 세션 시뮬레이터 & 히스테리시스 스래싱 방어", () => {
  it("일반 정독(350 px/s) 궤적에서 3트랙 전환이 스래싱 0건·클릭 0건으로 매끄럽게 완료된다", () => {
    const cues = makeHarmoniousEpisodeCues();
    const trajectory = createConstantVelocityScrollTrajectory(
      0,
      7000,
      DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
      20,
    );
    const session = simulateReaderScrollAudioSession(cues, trajectory);
    expect(session.ok).toBe(true);
    expect(session.profileKind).toBe("steady-reading");
    expect(session.guarded.retriggerThrashCount).toBe(0);
    expect(session.guarded.abruptClickEventCount).toBe(0);
    expect(session.guarded.totalCueSwitches).toBe(2);
    expect(session.guarded.finalPrimaryCueId).toBe("cue-03-relief");
  });

  it("경계선 ±30px 왕복 지터에서 단순 Naive 스위처는 스래싱이 발생하지만 히스테리시스 가드는 0건을 증명한다", () => {
    const cues = makeHarmoniousEpisodeCues();
    const jitter = createBoundaryJitterScrollTrajectory(2200, 30, 10, 64, 16);
    const session = simulateReaderScrollAudioSession(cues, jitter, {
      hysteresisDeadbandPx: 48,
      minDwellMs: 320,
    });
    expect(session.ok).toBe(true);
    expect(session.profileKind).toBe("boundary-jitter");
    expect(session.naive.retriggerThrashCount).toBeGreaterThanOrEqual(8);
    expect(session.guarded.retriggerThrashCount).toBe(0);
    expect(session.guarded.abruptClickEventCount).toBe(0);
    expect(session.thrashPreventedCount).toBeGreaterThanOrEqual(8);
  });

  it("고속 플링 스와이프(3600 px/s)에서 급격한 1프레임 스텝 클릭 0건 및 중간 트랙 스래싱 0건을 보장한다", () => {
    const sharpCues: readonly BgmTrackCueSpec[] = [
      makeCue({ cueId: "cue-a", startYPx: 0, endYPx: 1200, fadeInPx: 40, fadeOutPx: 30 }),
      makeCue({
        cueId: "cue-b",
        startYPx: 1170,
        endYPx: 2400,
        musicalKeyCamelot: "9A",
        fadeInPx: 30,
        fadeOutPx: 30,
      }),
      makeCue({
        cueId: "cue-c",
        startYPx: 2370,
        endYPx: 3600,
        musicalKeyCamelot: "10A",
        fadeInPx: 30,
        fadeOutPx: 40,
      }),
    ];
    const fling = createConstantVelocityScrollTrajectory(
      0,
      3500,
      DEFAULT_HIGH_SPEED_FLING_VELOCITY_PX_PER_SEC,
      16,
    );
    const session = simulateReaderScrollAudioSession(sharpCues, fling);
    expect(session.ok).toBe(true);
    expect(session.profileKind).toBe("high-speed-fling");
    expect(session.peakScrollVelocityPxPerSec).toBeGreaterThanOrEqual(3400);
    expect(session.naive.abruptClickEventCount).toBeGreaterThan(0);
    expect(session.guarded.abruptClickEventCount).toBe(0);
    expect(session.guarded.retriggerThrashCount).toBe(0);
    expect(session.guarded.minObservedTransitionRampMs).toBeGreaterThanOrEqual(40);
    expect(session.clicksPreventedCount).toBeGreaterThan(0);
  });

  it("극적 무음 컷을 관통하는 정독 세션에서 클릭 0건으로 코어 잔류 이득 <= 0.001 에 도달한다", () => {
    const cues = makeEpisodeWithDramaticSilence();
    const trajectory = createConstantVelocityScrollTrajectory(1200, 2600, 350, 16);
    const session = simulateReaderScrollAudioSession(cues, trajectory);
    expect(session.ok).toBe(true);
    expect(session.guarded.dramaticSilenceCoreReached).toBe(true);
    expect(session.guarded.maxGainDuringSilenceCore).toBeLessThanOrEqual(0.001);
    expect(session.guarded.abruptClickEventCount).toBe(0);
    expect(session.guarded.minObservedTransitionRampMs).toBeGreaterThanOrEqual(40);
  });

  it("독자가 데드밴드와 최소 체류 시간 이후 의도적으로 되감기 스크롤하면 정상 전환한다", () => {
    const trajectory = [
      { timeMs: 0, yPx: 1200 },
      { timeMs: 500, yPx: 2600 },
      { timeMs: 1200, yPx: 2800 },
      { timeMs: 2800, yPx: 1400 },
      { timeMs: 3600, yPx: 1000 },
    ];
    const session = simulateReaderScrollAudioSession(makeHarmoniousEpisodeCues(), trajectory);
    expect(session.ok).toBe(true);
    expect(session.guarded.finalPrimaryCueId).toBe("cue-01-dawn");
    expect(session.guarded.retriggerThrashCount).toBe(0);
    expect(session.guarded.abruptClickEventCount).toBe(0);
  });

  it("빈 궤적 또는 잘못된 큐시트 입력 시 시뮬레이터가 fail-closed(ok=false)로 안전 반환한다", () => {
    const emptyTraj = simulateReaderScrollAudioSession(makeHarmoniousEpisodeCues(), []);
    const emptyCues = simulateReaderScrollAudioSession([], [{ timeMs: 0, yPx: 0 }]);
    expect(emptyTraj.ok).toBe(false);
    expect(emptyTraj.frameCount).toBe(0);
    expect(emptyCues.ok).toBe(false);
    expect(emptyCues.validationIssues[0].code).toBe("empty-cue-sheet");
  });
});

describe("Wave 126 — 카멜롯 휠(Camelot Wheel) 화성 조화 거리 산출", () => {
  it("동일 키(8A → 8A)는 거리 0, harmonic-compatible 로 판정한다", () => {
    const res = computeCamelotHarmonicDistance("8A", "8A");
    expect(res.distance).toBe(0);
    expect(res.hourDistance).toBe(0);
    expect(res.modeChanged).toBe(false);
    expect(res.compatibility).toBe("harmonic-compatible");
    expect(res.relationKind).toBe("identical");
    expect(res.recommendSilenceBridge).toBe(false);
  });

  it("12시↔1시 원형 래핑(12A ↔ 1A, 1B ↔ 12B)은 거리 1, adjacent-fifth 로 호환 판정한다", () => {
    const wrapMinor = computeCamelotHarmonicDistance("12A", "1A");
    const wrapMajor = computeCamelotHarmonicDistance("1B", "12B");
    expect(wrapMinor.distance).toBe(1);
    expect(wrapMinor.hourDistance).toBe(1);
    expect(wrapMinor.compatibility).toBe("harmonic-compatible");
    expect(wrapMinor.relationKind).toBe("adjacent-fifth");
    expect(wrapMajor.distance).toBe(1);
    expect(wrapMajor.compatibility).toBe("harmonic-compatible");
  });

  it("동일 번호 상대 장단조(8A ↔ 8B)는 거리 1, relative-major-minor 로 호환 판정한다", () => {
    const rel = computeCamelotHarmonicDistance("8A", "8B");
    expect(rel.distance).toBe(1);
    expect(rel.hourDistance).toBe(0);
    expect(rel.modeChanged).toBe(true);
    expect(rel.compatibility).toBe("harmonic-compatible");
    expect(rel.relationKind).toBe("relative-major-minor");
  });

  it("거리 2(에너지 +2 또는 대각 모드 전환)는 energy-shift-caution 으로 분류한다", () => {
    const boost = computeCamelotHarmonicDistance("5A", "7A");
    const diagonal = computeCamelotHarmonicDistance("5A", "6B");
    expect(boost.distance).toBe(2);
    expect(boost.compatibility).toBe("energy-shift-caution");
    expect(boost.relationKind).toBe("energy-boost-two-steps");
    expect(diagonal.distance).toBe(2);
    expect(diagonal.compatibility).toBe("energy-shift-caution");
    expect(diagonal.relationKind).toBe("diagonal-mode-shift");
  });

  it("거리 3 이상 불협화음(8A→11A d=3, 1A→7A d=6, 1A→7B d=7)은 harmonic-clash-warning 과 무음 브리지를 권고한다", () => {
    const d3 = computeCamelotHarmonicDistance("8A", "11A");
    const d6 = computeCamelotHarmonicDistance("1A", "7A");
    const d7 = computeCamelotHarmonicDistance("1A", "7B");
    expect(d3.distance).toBe(3);
    expect(d3.compatibility).toBe("harmonic-clash-warning");
    expect(d3.recommendSilenceBridge).toBe(true);
    expect(d6.distance).toBe(6);
    expect(d6.compatibility).toBe("harmonic-clash-warning");
    expect(d7.distance).toBe(7);
    expect(d7.recommendSilenceBridge).toBe(true);
  });

  it("잘못된 카멜롯 키 문자열(13A, 0B, 8C)은 파서에서 거부되고 거리 계산에서 RangeError를 던진다", () => {
    expect(isValidCamelotKey("12B")).toBe(true);
    expect(isValidCamelotKey("13A")).toBe(false);
    expect(isValidCamelotKey("0B")).toBe(false);
    expect(parseCamelotKey("8C")).toBeNull();
    expect(() => computeCamelotHarmonicDistance("13A" as CamelotKey, "8A")).toThrow(RangeError);
  });
});

describe("Wave 126 — 에피소드 BGM 큐시트 LUFS·3중 겹침·화성 감사 & SHA-256 결정론", () => {
  it("화성 조화·권장 LUFS·2트랙 크로스페이드 에피소드는 pass(releaseReady=true)로 통과한다", () => {
    const report = auditEpisodeBgmCueSheet(makeHarmoniousEpisodeCues());
    expect(report.inputValid).toBe(true);
    expect(report.releaseReady).toBe(true);
    expect(report.status).toBe("pass");
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.maxConcurrentBgmTracks).toBe(2);
    expect(report.transitions.length).toBe(2);
  });

  it("인접 트랙 간 |ΔLUFS| > 3.0 dB 급변을 정확히 검출하고 정확히 3.0 dB는 통과시킨다", () => {
    const base = makeHarmoniousEpisodeCues();
    const jumpReport = auditEpisodeBgmCueSheet([
      { ...base[0], targetLufs: -18.0 },
      { ...base[1], targetLufs: -14.4 },
    ]);
    const exactReport = auditEpisodeBgmCueSheet([
      { ...base[0], targetLufs: -18.0 },
      { ...base[1], targetLufs: -15.0 },
    ]);
    expect(jumpReport.findings.some((f) => f.code === "abrupt-loudness-jump")).toBe(true);
    expect(exactReport.findings.some((f) => f.code === "abrupt-loudness-jump")).toBe(false);
  });

  it("웹툰 BGM 권장 상한(-14.0 LUFS) 초과 시 excessive-loudness 오류를 검출하고 출고를 차단한다", () => {
    const report = auditEpisodeBgmCueSheet([
      { ...makeHarmoniousEpisodeCues()[0], targetLufs: -11.8 },
    ]);
    const finding = report.findings.find((f) => f.code === "excessive-loudness");
    expect(finding?.severity).toBe("error");
    expect(report.releaseReady).toBe(false);
    expect(report.status).toBe("fail");
  });

  it("동일 스크롤 구간에 3개 BGM이 동시 겹치면 muddy-triple-overlap 오류를 적발한다", () => {
    const muddyCues: readonly BgmTrackCueSpec[] = [
      makeCue({ cueId: "m1", startYPx: 0, endYPx: 2600, musicalKeyCamelot: "8A" }),
      makeCue({ cueId: "m2", startYPx: 1800, endYPx: 3400, musicalKeyCamelot: "9A" }),
      makeCue({ cueId: "m3", startYPx: 2200, endYPx: 4200, musicalKeyCamelot: "10A" }),
    ];
    const report = auditEpisodeBgmCueSheet(muddyCues);
    expect(report.maxConcurrentBgmTracks).toBe(3);
    expect(report.muddyOverlaps.length).toBe(1);
    expect(report.muddyOverlaps[0].startYPx).toBe(2200);
    expect(report.muddyOverlaps[0].endYPx).toBe(2600);
    expect(report.findings.some((f) => f.code === "muddy-triple-overlap")).toBe(true);
    expect(report.releaseReady).toBe(false);
  });

  it("정확히 맞닿은 큐([0,1000], [1000,2000], [2000,3000])는 겹침 혼탁으로 오탐하지 않는다", () => {
    const report = auditEpisodeBgmCueSheet([
      makeCue({ cueId: "t1", startYPx: 0, endYPx: 1000, musicalKeyCamelot: "8A" }),
      makeCue({ cueId: "t2", startYPx: 1000, endYPx: 2000, musicalKeyCamelot: "9A" }),
      makeCue({ cueId: "t3", startYPx: 2000, endYPx: 3000, musicalKeyCamelot: "10A" }),
    ]);
    expect(report.maxConcurrentBgmTracks).toBe(1);
    expect(report.muddyOverlaps.length).toBe(0);
    expect(report.status).toBe("pass");
  });

  it("불협화음(8A → 2A, d=6)은 harmonic-clash-warning 을 띄우고, 극적 무음 브리지 삽입 시 해소된다", () => {
    const c1 = makeCue({ cueId: "c1", startYPx: 0, endYPx: 2000, musicalKeyCamelot: "8A" });
    const c2 = makeCue({ cueId: "c2", startYPx: 1800, endYPx: 4000, musicalKeyCamelot: "2A" });
    const rawReport = auditEpisodeBgmCueSheet([c1, c2]);
    expect(rawReport.findings.some((f) => f.code === "harmonic-clash-warning")).toBe(true);
    expect(rawReport.releaseReady).toBe(false);

    const bridge = makeCue({
      cueId: "bridge-silence",
      titleKo: "정적 브리지",
      startYPx: 1750,
      endYPx: 2150,
      bpm: 0,
      targetLufs: -72,
      fadeInPx: 80,
      fadeOutPx: 80,
      isDramaticSilenceCut: true,
    });
    const bridgedReport = auditEpisodeBgmCueSheet([c1, bridge, c2]);
    expect(bridgedReport.findings.some((f) => f.code === "harmonic-clash-warning")).toBe(false);
    expect(bridgedReport.transitions[0].mitigatedBySilenceBridge).toBe(true);
    expect(bridgedReport.releaseReady).toBe(true);
  });

  it("빈 큐시트, 역전 구간(startYPx >= endYPx), 중복 cueId, 음수 페이드를 fail-closed 로 차단한다", () => {
    const empty = auditEpisodeBgmCueSheet([]);
    expect(empty.inputValid).toBe(false);
    expect(empty.status).toBe("invalid-input");
    expect(empty.validationIssues[0].code).toBe("empty-cue-sheet");

    const reversed = auditEpisodeBgmCueSheet([
      makeCue({ cueId: "rev", startYPx: 2000, endYPx: 1000 }),
    ]);
    expect(reversed.inputValid).toBe(false);
    expect(reversed.validationIssues.some((v) => v.code === "invalid-cue-range")).toBe(true);

    const dupAndNeg = validateBgmCueSheet([
      makeHarmoniousEpisodeCues()[0],
      { ...makeHarmoniousEpisodeCues()[0], fadeInPx: -10 },
    ]);
    expect(dupAndNeg.some((v) => v.code === "duplicate-cue-id")).toBe(true);
    expect(dupAndNeg.some((v) => v.code === "invalid-fade-px")).toBe(true);
  });

  it("순수 ES2017 동기 FIPS 180-4 SHA-256 구현이 NIST 표준 테스트 벡터 3종과 정확히 일치한다", () => {
    expect(sha256BgmCueHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256BgmCueHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256BgmCueHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("객체 속성 순서 및 배열 순서가 달라도 cueSheetSha256Hex 매니페스트 해시가 결정론적으로 일치한다", () => {
    const original = makeHarmoniousEpisodeCues();
    const reordered: readonly BgmTrackCueSpec[] = [
      {
        fadeOutPx: original[2].fadeOutPx,
        fadeInPx: original[2].fadeInPx,
        targetLufs: original[2].targetLufs,
        musicalKeyCamelot: original[2].musicalKeyCamelot,
        bpm: original[2].bpm,
        endYPx: original[2].endYPx,
        startYPx: original[2].startYPx,
        titleKo: original[2].titleKo,
        trackId: original[2].trackId,
        cueId: original[2].cueId,
        duckingForDialogueDb: original[2].duckingForDialogueDb,
      },
      original[0],
      original[1],
    ];
    const reportA = auditEpisodeBgmCueSheet(original);
    const reportB = auditEpisodeBgmCueSheet(reordered);
    expect(reportA.cueSheetSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(reportA.cueSheetSha256Hex).toBe(reportB.cueSheetSha256Hex);
    expect(canonicalizeBgmCueJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');

    const mutated = auditEpisodeBgmCueSheet([
      { ...original[0], targetLufs: -16.6 },
      original[1],
      original[2],
    ]);
    expect(mutated.cueSheetSha256Hex).not.toBe(reportA.cueSheetSha256Hex);
  });
});

describe("Wave 126 — 인쇄 안전 OKLCH SVG 포락선 & 한국어 음악 감독 브리프", () => {
  it("SVG 출력에 오직 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
    const cues: readonly BgmTrackCueSpec[] = [
      ...makeHarmoniousEpisodeCues(),
      makeCue({
        cueId: "cut-silence-mid",
        titleKo: "충격 정적",
        startYPx: 3400,
        endYPx: 3800,
        bpm: 0,
        musicalKeyCamelot: "9A",
        targetLufs: -72,
        fadeInPx: 80,
        fadeOutPx: 80,
        isDramaticSilenceCut: true,
      }),
    ];
    const svg = renderScrollSyncBgmCueSvg(cues, auditEpisodeBgmCueSheet(cues));

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("무음 격리");
    expect(svg).toContain("8A→9A");
    expect(svg).toContain("-14.0 LUFS");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\(/i);
    expect(svg).not.toMatch(/\bhsla?\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("제목·ID에 포함된 XML/XSS 특수문자(<, >, &, \", ')를 완전히 이스케이프한다", () => {
    const xssTitle = `<script>alert("x&y'z")</script>`;
    const cues: readonly BgmTrackCueSpec[] = [
      { ...makeHarmoniousEpisodeCues()[0], titleKo: xssTitle },
    ];
    const svg = renderScrollSyncBgmCueSvg(cues, auditEpisodeBgmCueSheet(cues), {
      titleOverride: xssTitle,
    });
    expect(escapeBgmSvgXml(xssTitle)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&apos;z&quot;)&lt;/script&gt;",
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("빈 큐시트/입력 오류 상태에서도 NaN·Infinity 없는 안전한 OKLCH SVG를 반환한다", () => {
    const svg = renderScrollSyncBgmCueSvg([], auditEpisodeBgmCueSheet([]));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("입력 오류");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("한국어 음악 감독 QA 브리프에 실측 수치·스래싱 비교를 담고 금지 번역투 문구가 0건이다", () => {
    const cues = makeHarmoniousEpisodeCues();
    const audit = auditEpisodeBgmCueSheet(cues);
    const session = simulateReaderScrollAudioSession(
      cues,
      createBoundaryJitterScrollTrajectory(2200, 30, 8, 64, 16),
    );
    const brief = summarizeScrollSyncBgmCueKo(audit, session, {
      episodeLabel: "EP.12 밤의 추적",
      auditDateIso: "2026-11-28",
    });

    expect(brief).toContain("웹툰 스크롤 BGM 큐시트 검수 브리프 (EP.12 밤의 추적)");
    expect(brief).toContain("2026-11-28");
    expect(brief).toContain(audit.cueSheetSha256Hex);
    expect(brief).toContain("히스테리시스 가드 재트리거 0건");
    expect(brief).toContain("가드 급변 클릭 0건");

    const banned = [
      "하는 것을 가능하게 합니다",
      "직관적인 경험을 제공합니다",
      "원활한 워크플로우를 보장합니다",
    ];
    for (let i = 0; i < banned.length; i += 1) {
      expect(brief).not.toContain(banned[i]);
    }
  });

  it("오류가 있는 큐시트 브리프는 각 위반 항목과 구체적인 한국어 조치 방안을 함께 제시한다", () => {
    const badCues: readonly BgmTrackCueSpec[] = [
      { ...makeHarmoniousEpisodeCues()[0], targetLufs: -12.0, musicalKeyCamelot: "1A" },
      { ...makeHarmoniousEpisodeCues()[1], targetLufs: -16.5, musicalKeyCamelot: "7A" },
    ];
    const brief = summarizeScrollSyncBgmCueKo(auditEpisodeBgmCueSheet(badCues));
    expect(brief).toContain("수정 필요");
    expect(brief).toContain("[오류]");
    expect(brief).toContain("조치:");
    expect(brief).toContain("극적 무음 컷");
  });
});
