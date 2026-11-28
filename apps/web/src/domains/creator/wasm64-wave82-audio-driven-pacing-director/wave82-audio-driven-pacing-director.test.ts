import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_WHITESPACE_PX,
  DEFAULT_MIN_WHITESPACE_PX,
  analyzeAudioTrackForComicPacing,
  buildAudioScrollSyncManifest,
  choreographWebtoonPacingFromAudio,
  countSpeedlinesIntrudingClearZone,
  mapAudioTimeMsToScrollY,
  mapScrollYToAudioTimeMs,
  renderAudioDrivenSpeedlinesSvg,
  sampleDampedCameraShakeOffset,
  synthesizeTestAudioWaveform,
  validateAudioScrollSyncManifest,
  type WebtoonPacingCutInput,
} from "./index";

function createPureSinePcm(freqHz: number, durationMs: number, sampleRateHz = 44100, amp = 0.7): Float32Array {
  const count = Math.round((durationMs / 1000) * sampleRateHz);
  const samples = new Float32Array(count);
  const omega = (Math.PI * 2 * freqHz) / sampleRateHz;
  for (let i = 0; i < count; i += 1) samples[i] = Math.sin(omega * i) * amp;
  return samples;
}

const buildDropCuts = (): readonly WebtoonPacingCutInput[] => [
  { cutId: "cut-01-dialogue", title: "교실 대화 도입", role: "dialogue", audioAnchorTimeMs: 0, audioSpanMs: 1800, dialogueCharCount: 28, speechBalloonCount: 2, focalZone: { centerXRatio: 0.48, centerYRatio: 0.42, radiusXRatio: 0.25, radiusYRatio: 0.24 } },
  { cutId: "cut-02-hush", title: "숨 막히는 정적", role: "suspense", audioAnchorTimeMs: 2150, audioSpanMs: 800, dialogueCharCount: 8, focalZone: { centerXRatio: 0.52, centerYRatio: 0.46, radiusXRatio: 0.26, radiusYRatio: 0.25 } },
  { cutId: "cut-03-drop-climax", title: "충격 폭발 클라이맥스", role: "climax", audioAnchorTimeMs: 2950, audioSpanMs: 1350, sfxLabel: "쿠광!!", focalZone: { centerXRatio: 0.5, centerYRatio: 0.44, radiusXRatio: 0.26, radiusYRatio: 0.24 } },
  { cutId: "cut-04-aftermath", title: "먼지 가라앉는 여운", role: "aftermath", audioAnchorTimeMs: 4300, audioSpanMs: 1700, dialogueCharCount: 16 },
];

describe("Wave 82: waveform-energy-and-beat-analyzer", () => {
  it("120 BPM 킥 드럼 PCM(44100Hz)에서 estimatedBpm을 ±3 BPM 이내로 복원하고 주기적 비트를 검출한다", () => {
    const synth = synthesizeTestAudioWaveform({ preset: "kick-drum-steady", bpm: 120, durationMs: 6000, sampleRateHz: 44100, seed: 101 });
    const analysis = analyzeAudioTrackForComicPacing({ pcmSamples: synth.pcmSamples, sampleRateHz: synth.sampleRateHz, trackId: "kick-120" });

    expect(analysis.estimatedBpm).toBeGreaterThanOrEqual(117);
    expect(analysis.estimatedBpm).toBeLessThanOrEqual(123);
    expect(analysis.bpmConfidence).toBeGreaterThan(0.65);
    expect(analysis.beatTimestampsMs.length).toBeGreaterThanOrEqual(10);

    const intervals = analysis.beatTimestampsMs.slice(1).map((t, idx) => t - analysis.beatTimestampsMs[idx]);
    const avgInterval = intervals.reduce((acc, v) => acc + v, 0) / intervals.length;
    expect(Math.abs(avgInterval - 500)).toBeLessThan(20);
  });

  it("16000Hz와 48000Hz 샘플레이트에서도 96 BPM 및 140 BPM 템포를 정확히 추정한다", () => {
    const a96 = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "kick-drum-steady", bpm: 96, durationMs: 6500, sampleRateHz: 16000, seed: 202 } });
    const a140 = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "kick-drum-steady", bpm: 140, durationMs: 5500, sampleRateHz: 48000, seed: 203 } });
    expect(Math.abs(a96.estimatedBpm - 96)).toBeLessThanOrEqual(3);
    expect(Math.abs(a140.estimatedBpm - 140)).toBeLessThanOrEqual(3);
  });

  it("3대역 필터 뱅크가 초저역(60Hz)·중역(800Hz)·고역(5000Hz) 에너지를 정확히 분리한다", () => {
    const subA = analyzeAudioTrackForComicPacing({ pcmSamples: createPureSinePcm(60, 1200), sampleRateHz: 44100 });
    const midA = analyzeAudioTrackForComicPacing({ pcmSamples: createPureSinePcm(800, 1200), sampleRateHz: 44100 });
    const hiA = analyzeAudioTrackForComicPacing({ pcmSamples: createPureSinePcm(5000, 1200), sampleRateHz: 44100 });
    const midIdx = Math.floor(subA.frames.length * 0.5);

    expect(subA.frames[midIdx].bands.subBassRawRms).toBeGreaterThan(subA.frames[midIdx].bands.midRawRms * 4);
    expect(subA.frames[midIdx].bands.subBassRawRms).toBeGreaterThan(subA.frames[midIdx].bands.highTransientRawRms * 20);
    expect(midA.frames[midIdx].bands.midRawRms).toBeGreaterThan(midA.frames[midIdx].bands.subBassRawRms * 5);
    expect(midA.frames[midIdx].bands.midRawRms).toBeGreaterThan(midA.frames[midIdx].bands.highTransientRawRms * 5);
    expect(hiA.frames[midIdx].bands.highTransientRawRms).toBeGreaterThan(hiA.frames[midIdx].bands.midRawRms * 3);
    expect(hiA.frames[midIdx].bands.highTransientRawRms).toBeGreaterThan(hiA.frames[midIdx].bands.subBassRawRms * 20);
  });

  it("무음 후 드롭(silence-then-drop) PCM에서 직전 silenceHold와 직후 bass-drop climaxMoment를 모두 검출한다", () => {
    const analysis = analyzeAudioTrackForComicPacing({
      syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 800, sampleRateHz: 44100, seed: 303 },
    });
    const preDropSilence = analysis.silenceHolds.find((h) => h.precedesClimax);
    expect(preDropSilence).toBeDefined();
    expect(preDropSilence?.durationMs ?? 0).toBeGreaterThanOrEqual(550);
    expect(preDropSilence?.linkedClimaxIndex).not.toBeNull();

    const dropClimax = analysis.climaxMoments.find((c) => c.precededBySilenceMs > 0);
    expect(dropClimax).toBeDefined();
    expect(dropClimax?.kind).toBe("bass-drop");
    expect(dropClimax?.timeMs ?? 0).toBeGreaterThanOrEqual(2900);
    expect(dropClimax?.timeMs ?? 0).toBeLessThanOrEqual(3250);
    expect(dropClimax?.dramaticScore ?? 0).toBeGreaterThan(0.7);
  });

  it("크레셴도 현악 파형에서 점진적 RMS 상승과 후반부 클라이맥스 피크를 감지한다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "crescendo-strings", durationMs: 5000 } });
    const early = analysis.frames[Math.floor(analysis.frames.length * 0.15)];
    const late = analysis.frames[Math.floor(analysis.frames.length * 0.8)];
    expect(late.normalizedEnergy).toBeGreaterThan(early.normalizedEnergy * 4);
    expect(analysis.climaxMoments.length).toBeGreaterThanOrEqual(1);
    expect(analysis.climaxMoments[0].timeMs).toBeGreaterThan(3200);
  });

  it("잔잔한 앰비언트 패드 파형은 고역 트랜지언트가 낮고 폭발적 bass-drop이 발생하지 않는다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "ambient-calm-pad", durationMs: 4500 } });
    const maxHigh = Math.max(...analysis.frames.map((f) => f.bands.highTransient2500PlusHz));
    expect(maxHigh).toBeLessThan(0.15);
    expect(analysis.climaxMoments.filter((c) => c.kind === "bass-drop")).toHaveLength(0);
  });

  it("합성 디스크립터 직접 입력과 생성된 PCM 입력이 완전히 동일한 분석 결과를 반환한다", () => {
    const desc = { preset: "silence-then-drop" as const, bpm: 124, durationMs: 4800, sampleRateHz: 22050, seed: 777 };
    const synth = synthesizeTestAudioWaveform(desc);
    const a = analyzeAudioTrackForComicPacing({ syntheticDescriptor: desc, trackId: "same" });
    const b = analyzeAudioTrackForComicPacing({ pcmSamples: synth.pcmSamples, sampleRateHz: synth.sampleRateHz, trackId: "same" });
    expect(a.estimatedBpm).toBe(b.estimatedBpm);
    expect(a.beatTimestampsMs).toEqual(b.beatTimestampsMs);
    expect(a.climaxMoments).toEqual(b.climaxMoments);
    expect(a.silenceHolds).toEqual(b.silenceHolds);
  });

  it("완전 무음 PCM 및 빈 버퍼에서도 NaN 없이 안전한 영(0) 지표를 반환한다", () => {
    const silent = analyzeAudioTrackForComicPacing({ pcmSamples: new Float32Array(44100), sampleRateHz: 44100 });
    expect(silent.peakRms).toBe(0);
    expect(silent.estimatedBpm).toBe(0);
    expect(silent.beatTimestampsMs).toHaveLength(0);
    expect(silent.climaxMoments).toHaveLength(0);
    expect(silent.frames.every((f) => Number.isFinite(f.dbfs) && Number.isFinite(f.normalizedEnergy))).toBe(true);

    const empty = analyzeAudioTrackForComicPacing({ pcmSamples: new Float32Array(0), sampleRateHz: 44100 });
    expect(empty.durationMs).toBe(0);
    expect(empty.frames).toHaveLength(0);
  });

  it("고속 액션 타악기 파형이 잔잔한 패드보다 훨씬 높은 물리적 스펙트럼 플럭스와 비트 밀도를 보인다", () => {
    const action = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "staccato-action-percussion", bpm: 132, durationMs: 4000 } });
    const calm = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "ambient-calm-pad", durationMs: 4000 } });
    expect(action.beatTimestampsMs.length).toBeGreaterThan(calm.beatTimestampsMs.length + 5);
    expect(action.averageRawSpectralFlux).toBeGreaterThan(calm.averageRawSpectralFlux * 2);
    expect(action.peakRawSpectralFlux).toBeGreaterThan(calm.peakRawSpectralFlux * 5);
  });
});

describe("Wave 82: scroll-whitespace-and-speedline-choreographer", () => {
  it("무음 후 드롭 클라이맥스 컷의 whitespaceBeforePx가 차분한 대화 컷보다 훨씬 크게 확장되며 40..920px 범위를 지킨다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 800 } });
    const res = choreographWebtoonPacingFromAudio({ episodeId: "ep-82-drop", analysis, cuts: buildDropCuts(), readerScrollSpeedPxPerSec: 620 });

    expect(res.cuts[2].pacingMode).toBe("climax-impact");
    expect(res.cuts[2].whitespaceBeforePx).toBeGreaterThan(res.cuts[0].whitespaceBeforePx * 2.5);
    for (const cut of res.cuts) {
      expect(cut.whitespaceBeforePx).toBeGreaterThanOrEqual(DEFAULT_MIN_WHITESPACE_PX);
      expect(cut.whitespaceBeforePx).toBeLessThanOrEqual(DEFAULT_MAX_WHITESPACE_PX);
    }
  });

  it("클라이맥스 컷은 전면 풀블리드 및 세로 확장 비율을 적용하고 고속 액션 컷은 스태카토·분할 리듬으로 압축한다", () => {
    const dropA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 780 } });
    const dropRes = choreographWebtoonPacingFromAudio({ episodeId: "ep-aspect", analysis: dropA, cuts: buildDropCuts(), viewportWidthPx: 800 });
    expect(dropRes.cuts[2].fullBleed).toBe(true);
    expect(dropRes.cuts[2].layoutStyle).toBe("full-bleed-impact");
    expect(dropRes.cuts[2].panelWidthPx).toBe(800);
    expect(dropRes.cuts[2].heightScaleRatio).toBeGreaterThan(1.25);

    const actA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "staccato-action-percussion", bpm: 145, durationMs: 4200 } });
    const actRes = choreographWebtoonPacingFromAudio({
      episodeId: "ep-staccato",
      analysis: actA,
      cuts: [
        { cutId: "act-1", role: "action", audioAnchorTimeMs: 100, audioSpanMs: 1200, baseHeightPx: 700 },
        { cutId: "act-2", role: "action", audioAnchorTimeMs: 1300, audioSpanMs: 1200, baseHeightPx: 700 },
      ],
    });
    const fast = actRes.cuts[0];
    expect(["staccato-action", "climax-impact"]).toContain(fast.pacingMode);
    if (fast.pacingMode === "staccato-action") {
      expect(["staccato-split", "diagonal-slash"]).toContain(fast.layoutStyle);
      expect(fast.splitColumns).toBeGreaterThanOrEqual(2);
      expect(fast.heightScaleRatio).toBeLessThan(0.9);
      expect(fast.whitespaceBeforePx).toBeLessThanOrEqual(80);
    }
  });

  it("강한 베이스 드롭은 잔잔한 앰비언트 패드보다 훨씬 조밀한 방사형 집중선(lineCount, speedlineDensity)을 생성한다", () => {
    const dropA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 780 } });
    const calmA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "ambient-calm-pad", durationMs: 6000 } });
    const dropRes = choreographWebtoonPacingFromAudio({ episodeId: "ep-drop-sl", analysis: dropA, cuts: buildDropCuts() });
    const calmRes = choreographWebtoonPacingFromAudio({
      episodeId: "ep-calm-sl",
      analysis: calmA,
      cuts: [
        { cutId: "calm-1", role: "dialogue", audioAnchorTimeMs: 1000, audioSpanMs: 2000 },
        { cutId: "calm-2", role: "dialogue", audioAnchorTimeMs: 3000, audioSpanMs: 2000 },
      ],
    });

    const dropSl = dropRes.cuts[2].speedlines;
    const calmSl = calmRes.cuts[0].speedlines;
    expect(dropSl.enabled).toBe(true);
    expect(dropSl.lineCount).toBeGreaterThan(45);
    expect(dropSl.speedlineDensity).toBeGreaterThan(0.65);
    expect(dropSl.lineCount).toBeGreaterThan(calmSl.lineCount);
    expect(dropSl.speedlineDensity).toBeGreaterThan(calmSl.speedlineDensity);
    expect(dropSl.linesIntrudingClearZone).toBe(0);
  });

  it("오프센터 얼굴·말풍선 보호 영역을 지정해도 방사형 집중선의 침범 개수가 0개를 엄격히 유지한다", () => {
    const dropA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 5000, silenceStartMs: 1600, silenceDurationMs: 700 } });
    const res = choreographWebtoonPacingFromAudio({
      episodeId: "ep-offcenter",
      analysis: dropA,
      cuts: [
        { cutId: "top-left", role: "climax", audioAnchorTimeMs: 2200, audioSpanMs: 1200, focalZone: { centerXRatio: 0.34, centerYRatio: 0.32, radiusXRatio: 0.24, radiusYRatio: 0.22 } },
        { cutId: "bottom-right", role: "climax", audioAnchorTimeMs: 2200, audioSpanMs: 1200, focalZone: { centerXRatio: 0.68, centerYRatio: 0.66, radiusXRatio: 0.22, radiusYRatio: 0.24 } },
      ],
    });
    for (const cut of res.cuts) {
      expect(cut.speedlines.lineCount).toBeGreaterThan(20);
      expect(cut.speedlines.linesIntrudingClearZone).toBe(0);
      expect(countSpeedlinesIntrudingClearZone(cut.speedlines.vectors, cut.speedlines.clearZoneEllipse)).toBe(0);
    }
  });

  it("감쇠 조화 카메라 쉐이크가 베이스 드롭에서 활성화되고 시간에 따라 진폭이 감쇠한다", () => {
    const dropA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 780 } });
    const res = choreographWebtoonPacingFromAudio({ episodeId: "ep-shake", analysis: dropA, cuts: buildDropCuts(), prefersReducedMotion: false });
    const cue = res.cuts[2].cameraShake;
    expect(cue.shakeAmplitudePx).toBeGreaterThan(8);
    expect(cue.durationMs).toBeGreaterThan(250);
    expect(cue.flashIntensity).toBeGreaterThan(0.3);

    const early = sampleDampedCameraShakeOffset(cue, 12);
    const late = sampleDampedCameraShakeOffset(cue, cue.durationMs - 15);
    expect(Math.hypot(early.dxPx, early.dyPx)).toBeGreaterThan(Math.hypot(late.dxPx, late.dyPx));
    expect(sampleDampedCameraShakeOffset(cue, cue.durationMs + 10)).toEqual({ dxPx: 0, dyPx: 0, rollDeg: 0 });
    expect(sampleDampedCameraShakeOffset(cue, -5)).toEqual({ dxPx: 0, dyPx: 0, rollDeg: 0 });
  });

  it("prefersReducedMotion: true는 모든 컷에서 shakeAmplitudePx === 0 및 flashIntensity === 0을 강제하고 정적 대비 강조로 대체한다", () => {
    const dropA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 800 } });
    const normal = choreographWebtoonPacingFromAudio({ episodeId: "ep-rm", analysis: dropA, cuts: buildDropCuts(), prefersReducedMotion: false });
    const reduced = choreographWebtoonPacingFromAudio({ episodeId: "ep-rm", analysis: dropA, cuts: buildDropCuts(), prefersReducedMotion: true });

    expect(normal.maxShakeAmplitudePx).toBeGreaterThan(0);
    expect(reduced.maxShakeAmplitudePx).toBe(0);
    for (const cut of reduced.cuts) {
      expect(cut.cameraShake.shakeAmplitudePx).toBe(0);
      expect(cut.cameraShake.durationMs).toBe(0);
      expect(cut.cameraShake.flashIntensity).toBe(0);
      expect(cut.diagonalTiltDeg).toBe(0);
      expect(sampleDampedCameraShakeOffset(cut.cameraShake, 20)).toEqual({ dxPx: 0, dyPx: 0, rollDeg: 0 });
    }
    expect(reduced.cuts[2].cameraShake.reducedMotionSubstituted).toBe(true);
    expect(reduced.cuts[2].cameraShake.calmVisualSubstitute).toBe("high-contrast-frame");
    expect(reduced.cuts[2].cameraShake.calmContrastBorderPx).toBeGreaterThan(0);
    expect(reduced.cuts[2].whitespaceBeforePx).toBeGreaterThan(reduced.cuts[0].whitespaceBeforePx * 2);
  });

  it("독자 스크롤 속도가 빠를수록 무음 직후 클라이맥스 여백이 비례 확장되되 상한 920px을 넘지 않는다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 700 } });
    const slow = choreographWebtoonPacingFromAudio({ episodeId: "ep-slow", analysis, cuts: buildDropCuts(), readerScrollSpeedPxPerSec: 360 });
    const fast = choreographWebtoonPacingFromAudio({ episodeId: "ep-fast", analysis, cuts: buildDropCuts(), readerScrollSpeedPxPerSec: 900 });
    expect(fast.cuts[2].whitespaceBeforePx).toBeGreaterThan(slow.cuts[2].whitespaceBeforePx);
    expect(fast.cuts[2].whitespaceBeforePx).toBeLessThanOrEqual(DEFAULT_MAX_WHITESPACE_PX);
  });

  it("동일 입력과 시드에서 연출 결과가 완전히 결정론적으로 재현된다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 5500, seed: 555 } });
    const a = choreographWebtoonPacingFromAudio({ episodeId: "ep-det", analysis, cuts: buildDropCuts(), seed: 999 });
    const b = choreographWebtoonPacingFromAudio({ episodeId: "ep-det", analysis, cuts: buildDropCuts(), seed: 999 });
    expect(a).toEqual(b);
  });
});

describe("Wave 82: pacing-timeline-and-speedline-svg-exporter", () => {
  const buildFixture = (prefersReducedMotion = false) => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 6000, silenceStartMs: 2200, silenceDurationMs: 800 } });
    return choreographWebtoonPacingFromAudio({
      episodeId: "ep-export-82",
      analysis,
      prefersReducedMotion,
      cuts: [
        { cutId: "c1", title: "도입 대화", role: "dialogue", audioAnchorTimeMs: 0, audioSpanMs: 2000 },
        { cutId: "c2", title: "정적 컷", role: "suspense", audioAnchorTimeMs: 2150, audioSpanMs: 800 },
        { cutId: "c3", title: "폭발 클라이맥스", role: "climax", audioAnchorTimeMs: 2950, audioSpanMs: 1450 },
        { cutId: "c4", title: "엔딩 여운", role: "aftermath", audioAnchorTimeMs: 4400, audioSpanMs: 1600 },
      ],
    });
  };

  it("renderAudioDrivenSpeedlinesSvg가 유효한 SVG·0개 보호영역 침범·0개 NaN 좌표를 보장한다", () => {
    const choreo = buildFixture(false);
    const exported = renderAudioDrivenSpeedlinesSvg(choreo.cuts[2], { includeClearZoneGuide: true });
    expect(exported.renderedLineCount).toBe(choreo.cuts[2].speedlines.lineCount);
    expect(exported.renderedLineCount).toBeGreaterThan(40);
    expect(exported.linesIntrudingClearZone).toBe(0);
    expect(exported.hasInvalidCoordinates).toBe(false);
    expect(exported.svgMarkup).toContain("<svg ");
    expect(exported.svgMarkup).toContain("</svg>");
    expect(exported.svgMarkup).toContain("<clipPath ");
    expect(exported.svgMarkup).toContain('data-role="focal-clear-zone"');
    expect(exported.svgMarkup).toContain('fill="currentColor"');
  });

  it("집중선이 비활성화된 잔잔한 컷도 오류 없이 빈 비파괴 SVG 레이어를 내보낸다", () => {
    const calmA = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "ambient-calm-pad", durationMs: 3000 } });
    const choreo = choreographWebtoonPacingFromAudio({ episodeId: "ep-calm-svg", analysis: calmA, cuts: [{ cutId: "quiet-1", title: "잔잔한 풍경", role: "dialogue" }] });
    const exported = renderAudioDrivenSpeedlinesSvg(choreo.cuts[0]);
    expect(exported.renderedLineCount).toBe(0);
    expect(exported.linesIntrudingClearZone).toBe(0);
    expect(exported.hasInvalidCoordinates).toBe(false);
  });

  it("XML 특수문자가 포함된 컷 ID·제목도 안전하게 이스케이프해 유효한 SVG를 생성한다", () => {
    const choreo = buildFixture(false);
    const exported = renderAudioDrivenSpeedlinesSvg({ ...choreo.cuts[2], cutId: 'cut-"special"&<1>', title: '클라이맥스 <"강타" & 충격>' });
    expect(exported.hasInvalidCoordinates).toBe(false);
    expect(exported.svgMarkup).toContain("&quot;");
    expect(exported.svgMarkup).toContain("&amp;");
    expect(exported.svgMarkup).not.toContain('<"강타"');
  });

  it("buildAudioScrollSyncManifest가 엄격 단조 증가 scrollY <-> audioTimeMs 일대일 대응을 보장한다", () => {
    const manifest = buildAudioScrollSyncManifest(buildFixture(false));
    const report = validateAudioScrollSyncManifest(manifest, 60);
    expect(manifest.manifestVersion).toBe("wave82.audio-scroll-sync.v1");
    expect(report.isStrictlyMonotonic).toBe(true);
    expect(report.keyframeCount).toBeGreaterThanOrEqual(8);
    expect(report.maxRoundTripErrorPx).toBeLessThan(1e-4);
    expect(report.maxRoundTripErrorMs).toBeLessThan(1e-4);

    let prevT = -1;
    let prevY = -1;
    for (let i = 0; i <= 50; i += 1) {
      const y = (manifest.totalScrollHeightPx * i) / 50;
      const t = mapScrollYToAudioTimeMs(manifest, y);
      const yBack = mapAudioTimeMsToScrollY(manifest, t);
      expect(t).toBeGreaterThan(prevT);
      expect(yBack).toBeGreaterThan(prevY);
      expect(Math.abs(yBack - y)).toBeLessThan(1e-4);
      prevT = t;
      prevY = yBack;
    }
  });

  it("경계 밖 스크롤/시각 및 NaN 쿼리를 안전하게 클램핑해 NaN을 반환하지 않는다", () => {
    const manifest = buildAudioScrollSyncManifest(buildFixture(false));
    expect(mapScrollYToAudioTimeMs(manifest, -500)).toBe(0);
    expect(mapScrollYToAudioTimeMs(manifest, manifest.totalScrollHeightPx + 9999)).toBe(manifest.audioDurationMs);
    expect(mapScrollYToAudioTimeMs(manifest, Number.NaN)).toBe(0);
    expect(mapAudioTimeMsToScrollY(manifest, -100)).toBe(0);
    expect(mapAudioTimeMsToScrollY(manifest, manifest.audioDurationMs + 9999)).toBe(manifest.totalScrollHeightPx);
    expect(mapAudioTimeMsToScrollY(manifest, Number.NaN)).toBe(0);
  });

  it("prefersReducedMotion: true 매니페스트는 camera-shake 큐를 제거하고 calm-contrast-frame 큐로 대체한다", () => {
    const normalM = buildAudioScrollSyncManifest(buildFixture(false));
    const reducedM = buildAudioScrollSyncManifest(buildFixture(true));
    expect(normalM.effectCues.some((c) => c.kind === "camera-shake")).toBe(true);
    expect(reducedM.effectCues.some((c) => c.kind === "camera-shake")).toBe(false);
    expect(reducedM.effectCues.some((c) => c.kind === "calm-contrast-frame")).toBe(true);
    expect(reducedM.effectCues.some((c) => c.kind === "climax-impact")).toBe(true);
    expect(reducedM.effectCues.some((c) => c.kind === "silence-hold")).toBe(true);
  });

  it("빈 에피소드 입력에서도 동기화 매니페스트가 안전하게 0초·0px 루트 키프레임을 반환한다", () => {
    const emptyA = analyzeAudioTrackForComicPacing({ pcmSamples: new Float32Array(0) });
    const manifest = buildAudioScrollSyncManifest(choreographWebtoonPacingFromAudio({ episodeId: "ep-empty", analysis: emptyA, cuts: [] }));
    expect(manifest.keyframes).toHaveLength(1);
    expect(manifest.totalScrollHeightPx).toBe(0);
    expect(mapScrollYToAudioTimeMs(manifest, 100)).toBe(0);
  });
});

describe("Wave 82: end-to-end audio-to-webtoon pacing pipeline", () => {
  it("120 BPM 무음-드롭 BGM 생성 -> 분석 -> 5컷 연출 -> 집중선 SVG & 동기화 매니페스트까지 전 구간 무결하게 연동된다", () => {
    const wf = synthesizeTestAudioWaveform({ preset: "silence-then-drop", bpm: 120, durationMs: 7200, silenceStartMs: 2600, silenceDurationMs: 820, sampleRateHz: 44100, seed: 8282 });
    const analysis = analyzeAudioTrackForComicPacing({ pcmSamples: wf.pcmSamples, sampleRateHz: wf.sampleRateHz, trackId: "bgm-ep82" });
    expect(analysis.silenceHolds.some((h) => h.precedesClimax)).toBe(true);
    expect(analysis.climaxMoments.length).toBeGreaterThanOrEqual(1);

    const choreo = choreographWebtoonPacingFromAudio({
      episodeId: "webtoon-ep-82",
      analysis,
      viewportWidthPx: 800,
      readerScrollSpeedPxPerSec: 620,
      cuts: [
        { cutId: "ep82-1", title: "오프닝", role: "establishing", audioAnchorTimeMs: 0, audioSpanMs: 1300 },
        { cutId: "ep82-2", title: "긴장 대화", role: "dialogue", audioAnchorTimeMs: 1300, audioSpanMs: 1250 },
        { cutId: "ep82-3", title: "정적 클로즈업", role: "suspense", audioAnchorTimeMs: 2550, audioSpanMs: 850 },
        { cutId: "ep82-4", title: "필살기 발동", role: "climax", audioAnchorTimeMs: 3400, audioSpanMs: 1800, sfxLabel: "콰아앙!!", focalZone: { centerXRatio: 0.5, centerYRatio: 0.42, radiusXRatio: 0.25, radiusYRatio: 0.24 } },
        { cutId: "ep82-5", title: "잔향 엔딩", role: "aftermath", audioAnchorTimeMs: 5200, audioSpanMs: 2000 },
      ],
    });
    expect(choreo.cuts).toHaveLength(5);
    expect(choreo.climaxCutIds).toContain("ep82-4");

    const svgRes = renderAudioDrivenSpeedlinesSvg(choreo.cuts[3], { includeClearZoneGuide: true });
    expect(svgRes.renderedLineCount).toBeGreaterThan(40);
    expect(svgRes.linesIntrudingClearZone).toBe(0);
    expect(svgRes.hasInvalidCoordinates).toBe(false);

    const report = validateAudioScrollSyncManifest(buildAudioScrollSyncManifest(choreo), 80);
    expect(report.isStrictlyMonotonic).toBe(true);
    expect(report.maxRoundTripErrorPx).toBeLessThan(1e-4);
    expect(report.maxRoundTripErrorMs).toBeLessThan(1e-4);
  });

  it("합성 120 BPM 트랙에 대해 모든 컷의 세로 좌표가 겹침 없이 연속 누적된다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "kick-drum-steady", bpm: 120, durationMs: 5000 } });
    const choreo = choreographWebtoonPacingFromAudio({
      episodeId: "ep-contiguous",
      analysis,
      cuts: [{ cutId: "s1", role: "dialogue" }, { cutId: "s2", role: "action" }, { cutId: "s3", role: "action" }, { cutId: "s4", role: "aftermath" }],
    });
    expect(choreo.cuts[0].scrollStartY).toBe(0);
    for (let i = 0; i < choreo.cuts.length; i += 1) {
      const c = choreo.cuts[i];
      expect(c.panelTopY).toBe(c.scrollStartY + c.whitespaceBeforePx);
      expect(c.panelBottomY).toBe(c.panelTopY + c.panelHeightPx);
      expect(c.scrollEndY).toBe(c.panelBottomY + c.whitespaceAfterPx);
      if (i > 0) expect(c.scrollStartY).toBe(choreo.cuts[i - 1].scrollEndY);
    }
    expect(choreo.cuts[choreo.cuts.length - 1].scrollEndY).toBe(choreo.totalScrollHeightPx);
  });

  it("집중선 내보내기 시 손상된 NaN 벡터가 유입돼도 자동 필터링하여 0개 NaN SVG를 유지한다", () => {
    const analysis = analyzeAudioTrackForComicPacing({ syntheticDescriptor: { preset: "silence-then-drop", bpm: 120, durationMs: 4500 } });
    const choreo = choreographWebtoonPacingFromAudio({ episodeId: "ep-nan-guard", analysis, cuts: [{ cutId: "c-nan", role: "climax", audioAnchorTimeMs: 1800, audioSpanMs: 1800 }] });
    const cut = choreo.cuts[0];
    const poisoned = {
      ...cut,
      speedlines: {
        ...cut.speedlines,
        vectors: [
          ...cut.speedlines.vectors,
          { index: 999, angleRad: Number.NaN, innerX: Number.NaN, innerY: 100, outerX: 400, outerY: 400, baseLeftX: 398, baseLeftY: 400, baseRightX: 402, baseRightY: 400, taperWidthPx: 4, opacity: 0.8, lengthPx: 300 },
        ],
      },
    };
    const exported = renderAudioDrivenSpeedlinesSvg(poisoned);
    expect(exported.hasInvalidCoordinates).toBe(false);
    expect(exported.renderedLineCount).toBe(cut.speedlines.vectors.length);
    expect(exported.linesIntrudingClearZone).toBe(0);
  });
});
