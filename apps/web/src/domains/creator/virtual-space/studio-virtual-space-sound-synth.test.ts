import { describe, expect, it } from "vitest";
import { STUDIO_FOOTSTEP_SURFACES } from "./studio-virtual-space-footsteps";
import { studioFootstepSynthSpec, studioSfxSpec, type StudioSfxKind } from "./studio-virtual-space-sound-synth";

describe("studioSfxSpec", () => {
  it.each(["activate", "peer-join", "peer-leave", "emote"] as const satisfies readonly StudioSfxKind[])(
    "%s: 절제된 톤 단계와 스로틀을 돌려준다",
    (kind) => {
      const spec = studioSfxSpec(kind);
      expect(spec.steps.length).toBeGreaterThanOrEqual(1);
      expect(spec.steps.length).toBeLessThanOrEqual(2);
      expect(spec.throttleMs).toBeGreaterThanOrEqual(100);
      for (const step of spec.steps) {
        expect(step.fromHz).toBeGreaterThan(100);
        expect(step.toHz).toBeGreaterThan(100);
        expect(step.durationMs).toBeLessThanOrEqual(120);
        expect(step.peak).toBeGreaterThan(0);
        expect(step.peak).toBeLessThanOrEqual(0.5);
      }
    },
  );

  it("입장은 상승, 퇴장은 하강 패턴이다", () => {
    const join = studioSfxSpec("peer-join");
    const leave = studioSfxSpec("peer-leave");
    expect(join.steps.at(-1)!.fromHz).toBeGreaterThan(join.steps[0]!.fromHz);
    expect(leave.steps.at(-1)!.fromHz).toBeLessThan(leave.steps[0]!.fromHz);
  });
});

describe("studioFootstepSynthSpec", () => {
  it.each(STUDIO_FOOTSTEP_SURFACES)("표면 %s: 유효한 합성 파라미터를 돌려준다", (surface) => {
    const spec = studioFootstepSynthSpec(surface, "left");
    expect(spec.durationMs).toBeGreaterThan(0);
    expect(spec.durationMs).toBeLessThanOrEqual(100);
    expect(spec.filterFrequency).toBeGreaterThan(100);
    expect(spec.filterFrequency).toBeLessThan(8000);
    expect(spec.noisePeak).toBeGreaterThan(0);
    expect(spec.noisePeak).toBeLessThanOrEqual(1);
  });

  it("표면마다 음색 축(필터 주파수)이 다르고 타일이 가장 밝다", () => {
    const carpet = studioFootstepSynthSpec("carpet", "left");
    const wood = studioFootstepSynthSpec("wood", "left");
    const tile = studioFootstepSynthSpec("tile", "left");
    expect(carpet.filterType).toBe("lowpass");
    expect(carpet.filterFrequency).toBeLessThan(wood.filterFrequency);
    expect(wood.filterFrequency).toBeLessThan(tile.filterFrequency);
    expect(carpet.tone).toBeNull();
    expect(wood.tone?.wave).toBe("triangle");
    expect(tile.tone?.wave).toBe("sine");
  });

  it("왼발과 오른발은 주파수가 미세하게 다르다", () => {
    const left = studioFootstepSynthSpec("wood", "left");
    const right = studioFootstepSynthSpec("wood", "right");
    expect(left.filterFrequency).toBeLessThan(right.filterFrequency);
    expect(left.tone!.frequency).toBeLessThan(right.tone!.frequency);
  });
});
