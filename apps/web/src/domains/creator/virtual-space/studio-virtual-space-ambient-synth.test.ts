import { describe, expect, it, vi } from "vitest";
import {
  createStudioAmbientSynthBuffer,
  generateStudioAmbientSamples,
  studioAmbientSynthSpec,
} from "./studio-virtual-space-ambient-synth";

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / samples.length);
}

describe("generateStudioAmbientSamples", () => {
  it("길이·스테레오·유한성을 보장하고 목표 RMS에 맞춘다", () => {
    const wind = generateStudioAmbientSamples("wind", 8000, 2);
    expect(wind.left).toHaveLength(16000);
    expect(wind.right).toHaveLength(16000);
    expect(wind.left.every((value) => Number.isFinite(value))).toBe(true);
    expect(rms(wind.left)).toBeCloseTo(studioAmbientSynthSpec("wind").targetRms, 2);
    const room = generateStudioAmbientSamples("room", 8000, 2);
    expect(rms(room.left)).toBeCloseTo(studioAmbientSynthSpec("room").targetRms, 3);
    expect(rms(room.left)).toBeLessThan(rms(wind.left));
  });

  it("결정적이다: 같은 입력은 같은 샘플을 만들고 좌우 채널은 다르다", () => {
    const a = generateStudioAmbientSamples("wind", 8000, 1);
    const b = generateStudioAmbientSamples("wind", 8000, 1);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.left)).not.toEqual(Array.from(a.right));
  });

  it("루프 경계가 이어진다: 마지막 샘플과 첫 샘플의 점프가 신호 크기에 비해 작다", () => {
    for (const kind of ["wind", "room"] as const) {
      const { left } = generateStudioAmbientSamples(kind, 8000, 4);
      const jump = Math.abs(left[0]! - left[left.length - 1]!);
      expect(jump).toBeLessThan(rms(left) * 1.5);
      const peak = Math.max(...Array.from(left, (value) => Math.abs(value)));
      expect(peak).toBeLessThanOrEqual(0.96);
    }
  });
});

describe("createStudioAmbientSynthBuffer", () => {
  it("2채널 버퍼에 생성 샘플을 복사한다", () => {
    const copied: Array<{ channel: number; length: number }> = [];
    const buffer = {
      copyToChannel: vi.fn((data: Float32Array, channel: number) => {
        copied.push({ channel, length: data.length });
      }),
    };
    const context = {
      sampleRate: 8000,
      createBuffer: vi.fn((_channels: number, _length: number, _rate: number) => buffer),
    };
    const result = createStudioAmbientSynthBuffer(context as unknown as AudioContext, "room", 2);
    expect(result).toBe(buffer);
    expect(context.createBuffer).toHaveBeenCalledWith(2, 16000, 8000);
    expect(copied).toEqual([
      { channel: 0, length: 16000 },
      { channel: 1, length: 16000 },
    ]);
  });
});
