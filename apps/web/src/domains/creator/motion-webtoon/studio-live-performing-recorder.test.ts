import { describe, expect, it } from "vitest";

import {
  StudioLivePerformingRecorder,
  overdubPerformingTrack,
  sampleHermitePerformingTrack,
  type RawPerformingSample,
} from "./studio-live-performing-recorder";

describe("studio-live-performing-recorder", () => {
  it("60Hz 라이브 퍼포밍 120개 샘플을 시공간 RDP + 큐빅 에르미트 키프레임으로 압축하고 궤적 정확도를 유지한다", () => {
    const recorder = new StudioLivePerformingRecorder({ trackId: "cut-01-hero", sampleRateHz: 60 });
    recorder.start(10.0, { x: 0, y: 0, scale: 1, rotationDeg: 0, opacity: 1 });

    // 2초간 60Hz로 직선 이동(0..1s: x 0→20%) 후 정지(1..2s: x=20%)
    for (let i = 1; i <= 120; i += 1) {
      const t = i / 60;
      const x = t <= 1 ? t * 20 : 20;
      const scale = t <= 1 ? 1 + t * 0.2 : 1.2;
      recorder.pushSample(10.0 + t, { x, y: 0, scale, rotationDeg: 0, opacity: 1 });
    }

    const track = recorder.stop({ epsilon: 0.8 });
    expect(track.rawSampleCount).toBeGreaterThan(100);
    // 2개 구간 직선+정지이므로 키프레임이 5개 이하로 대폭 압축되어야 한다.
    expect(track.hermiteNodes.length).toBeLessThanOrEqual(5);
    expect(track.motionKeyframes).toHaveLength(track.hermiteNodes.length);

    const mid = sampleHermitePerformingTrack(track.hermiteNodes, 0.5);
    expect(mid.x).toBeCloseTo(10, 0);
    expect(mid.scale).toBeCloseTo(1.1, 1);

    const hold = sampleHermitePerformingTrack(track.hermiteNodes, 1.6);
    expect(hold.x).toBeCloseTo(20, 0);
    expect(hold.scale).toBeCloseTo(1.2, 2);
  });

  it("비파괴 채널 오버더빙이 1차 패스의 x/y 이동을 보존한 채 rotationDeg만 덧입힌다", () => {
    const recorder = new StudioLivePerformingRecorder({ trackId: "cut-02-overdub", sampleRateHz: 60 });
    recorder.start(0, { x: 0, y: 0, scale: 1, rotationDeg: 0, opacity: 1 });
    for (let i = 1; i <= 60; i += 1) {
      const t = i / 60;
      recorder.pushSample(t, { x: t * 30, y: t * -10, scale: 1, rotationDeg: 0, opacity: 1 });
    }
    const baseTrack = recorder.stop({ epsilon: 0.5 });

    // 2차 패스: 0.2s~0.8s 구간에 rotationDeg 0 -> 45도 오버더빙(x/y는 전혀 다른 값이 들어와도 무시)
    const pass2: RawPerformingSample[] = [];
    for (let i = 0; i <= 36; i += 1) {
      const t = 0.2 + i / 60;
      const frac = (t - 0.2) / 0.6;
      pass2.push({
        timeSeconds: t,
        values: { x: 999, y: -999, scale: 5, rotationDeg: frac * 45, opacity: 0.2 },
      });
    }

    const overdubbed = overdubPerformingTrack(baseTrack, pass2, {
      channels: ["rotationDeg"],
      blendWindowSeconds: 0.05,
      tolerances: { epsilon: 0.5 },
    });

    const atMid = sampleHermitePerformingTrack(overdubbed.hermiteNodes, 0.5);
    // x/y/scale/opacity는 1차 패스 값 유지 (x≈15, y≈-5, scale=1, opacity=1)
    expect(atMid.x).toBeCloseTo(15, 0);
    expect(atMid.y).toBeCloseTo(-5, 0);
    expect(atMid.scale).toBeCloseTo(1, 2);
    expect(atMid.opacity).toBeCloseTo(1, 2);
    // rotationDeg는 2차 패스(~22.5도)가 반영되어야 한다.
    expect(atMid.rotationDeg).toBeGreaterThan(15);
    expect(atMid.rotationDeg).toBeLessThan(30);

    // 펀치 구간 밖(0.05s)은 회전 0도 유지
    const beforePunch = sampleHermitePerformingTrack(overdubbed.hermiteNodes, 0.05);
    expect(Math.abs(beforePunch.rotationDeg)).toBeLessThan(1);
  });
});
