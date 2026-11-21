import { describe, expect, it } from "vitest";

import {
  analyzeAudioVisemeTrack,
  AudioScrubPlayer,
  bindVisemesToMouthSubstitutions,
  extractAudioScrubGranule,
  flattenExposureCyclesToXdts,
  resolveExposureTrackWithCycles,
  type AudioScrubGranule,
  type ExposureCycleSpan,
} from "./studio-audio-scrub-lipsync-cycle";

function synthesizeToneSegments(
  sampleRate: number,
  segments: readonly { readonly durationSeconds: number; readonly hz: number; readonly amp: number }[],
): Float32Array {
  const totalSamples = segments.reduce((acc, s) => acc + Math.round(s.durationSeconds * sampleRate), 0);
  const out = new Float32Array(totalSamples);
  let cursor = 0;
  for (const seg of segments) {
    const len = Math.round(seg.durationSeconds * sampleRate);
    for (let i = 0; i < len && cursor + i < totalSamples; i += 1) {
      out[cursor + i] = seg.amp > 0 ? Math.sin((2 * Math.PI * seg.hz * i) / sampleRate) * seg.amp : 0;
    }
    cursor += len;
  }
  return out;
}

describe("studio-audio-scrub-lipsync-cycle", () => {
  it("마이크로 슬라이스 오디오 스크러버가 max(45ms, 1000/fps) Hann-windowed 그래뉼을 추출·중복 억제 재생한다", () => {
    const sr = 16000;
    const pcm = new Float32Array(sr);
    pcm.fill(0.8);

    // 24fps(41.67ms)에서는 최소 45ms 보장
    const gran24 = extractAudioScrubGranule(pcm, sr, 4, 24);
    expect(gran24.durationMs).toBeCloseTo(45, 3);
    expect(gran24.samples.length).toBe(Math.round(0.045 * sr));
    // Hann 윈도우 양 끝은 0, 중앙은 ~0.8
    expect(gran24.samples[0]).toBeCloseTo(0, 5);
    expect(gran24.samples[gran24.samples.length - 1]).toBeCloseTo(0, 5);
    expect(gran24.samples[Math.floor(gran24.samples.length / 2)]).toBeCloseTo(0.8, 2);

    // 12fps(83.33ms)에서는 1000/12 ms 사용
    const gran12 = extractAudioScrubGranule(pcm, sr, 2, 12);
    expect(gran12.durationMs).toBeCloseTo(1000 / 12, 2);

    const played: AudioScrubGranule[] = [];
    const player = new AudioScrubPlayer({
      pcmSamples: pcm,
      sampleRate: sr,
      fps: 24,
      sink: { playGranule: (g) => played.push(g) },
    });
    player.scrubToFrame(3);
    player.scrubToFrame(3); // 동일 프레임 중복 무시
    player.scrubToFrame(4);
    expect(played).toHaveLength(2);
    expect(played[0]?.frameIndex).toBe(3);
    expect(played[1]?.frameIndex).toBe(4);
  });

  it("로컬 DSP 립싱크 분석기가 무음·저주파 모음·강한 모음·고주파 치찰음을 Preston Blair 비젬으로 분류하고 입 치환 트랙에 바인딩한다", () => {
    const sr = 16000;
    const fps = 12;
    const pcm = synthesizeToneSegments(sr, [
      { durationSeconds: 0.25, hz: 0, amp: 0 }, // 3 frames silence -> rest
      { durationSeconds: 0.25, hz: 380, amp: 0.25 }, // 3 frames low vowel -> O or U
      { durationSeconds: 0.25, hz: 1000, amp: 0.6 }, // 3 frames loud mid vowel -> A
      { durationSeconds: 0.25, hz: 4200, amp: 0.2 }, // 3 frames high fricative -> FV
    ]);

    const analyzed = analyzeAudioVisemeTrack(pcm, { fps, sampleRate: sr, minHoldFrames: 2 });
    expect(analyzed.frameCount).toBe(12);
    expect(analyzed.frames[1]?.viseme).toBe("rest");
    expect(["O", "U"]).toContain(analyzed.frames[4]?.viseme);
    expect(analyzed.frames[7]?.viseme).toBe("A");
    expect(analyzed.frames[10]?.viseme).toBe("FV");
    expect(analyzed.keyframes.length).toBeGreaterThanOrEqual(4);

    const bound = bindVisemesToMouthSubstitutions(analyzed.keyframes, {
      rest: "mouth_closed",
      A: "mouth_wide_a",
      FV: "mouth_fv",
      O: "mouth_round_o",
      U: "mouth_round_u",
    });
    expect(bound.some((k) => k.substitutionId === "mouth_wide_a")).toBe(true);
    expect(bound.some((k) => k.substitutionId === "mouth_fv")).toBe(true);
  });

  it("비파괴 노출 사이클 루프가 원본 1장 수정 시 모든 반복 구간을 자동 갱신하고 XDTS v5로 평탄화한다", () => {
    const base = new Map<number, string | null>([
      [0, "walk_1"],
      [1, "walk_2"],
      [2, "walk_3"],
    ]);
    const cycles: readonly ExposureCycleSpan[] = [
      {
        id: "cycle-walk",
        sourceStartFrame: 0,
        sourceEndFrame: 2,
        mode: "repeat-count",
        repeatCount: 3,
        cycleKind: "loop",
      },
    ];

    const resolved1 = resolveExposureTrackWithCycles({
      totalFrames: 9,
      baseCelByFrame: base,
      cycles,
    });
    expect(resolved1.map((f) => f.celId)).toEqual([
      "walk_1",
      "walk_2",
      "walk_3",
      "walk_1",
      "walk_2",
      "walk_3",
      "walk_1",
      "walk_2",
      "walk_3",
    ]);
    expect(resolved1[3]?.projectedFromCycleId).toBe("cycle-walk");
    expect(resolved1[3]?.sourceFrameIndex).toBe(0);

    // 원본 1번 프레임만 수정하면 반복 투영된 4·7번 프레임이 즉시 반영된다.
    const edited = new Map(base);
    edited.set(1, "walk_2_clean");
    const resolved2 = resolveExposureTrackWithCycles({
      totalFrames: 9,
      baseCelByFrame: edited,
      cycles,
    });
    expect(resolved2[1]?.celId).toBe("walk_2_clean");
    expect(resolved2[4]?.celId).toBe("walk_2_clean");
    expect(resolved2[7]?.celId).toBe("walk_2_clean");

    // 핑퐁 사이클 확인
    const pingPong = resolveExposureTrackWithCycles({
      totalFrames: 7,
      baseCelByFrame: base,
      cycles: [
        {
          id: "cycle-pp",
          sourceStartFrame: 0,
          sourceEndFrame: 2,
          mode: "loop-until",
          loopUntilFrame: 6,
          cycleKind: "ping-pong",
        },
      ],
    });
    expect(pingPong.map((f) => f.celId)).toEqual([
      "walk_1",
      "walk_2",
      "walk_3",
      "walk_2",
      "walk_1",
      "walk_2",
      "walk_3",
    ]);

    // XDTS v5 평탄화 호환 검증
    const xdts = flattenExposureCyclesToXdts({
      trackName: "주인공_걷기",
      totalFrames: 9,
      baseCelByFrame: edited,
      cycles,
    });
    expect(xdts.version).toBe(5);
    expect(xdts.timeTables[0]?.resolvedCellExposures).toHaveLength(9);
    expect(xdts.timeTables[0]?.resolvedCellExposures[4]?.celLabel).toBe("walk_2_clean");
  });
});
