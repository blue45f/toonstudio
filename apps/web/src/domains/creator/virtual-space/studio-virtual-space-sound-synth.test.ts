import { describe, expect, it } from "vitest";
import { STUDIO_ALL_FOOTSTEP_SURFACES, STUDIO_FOOTSTEP_SURFACES } from "./studio-virtual-space-footsteps";
import {
  studioEmoteSfxKind,
  studioFootstepSynthSpec,
  studioSfxSpec,
  type StudioSfxKind,
} from "./studio-virtual-space-sound-synth";

describe("studioSfxSpec", () => {
  it.each([
    "activate",
    "peer-join",
    "peer-leave",
    "emote",
    "focus-start",
    "focus-break",
    "wellness-chime",
    "dance-beat",
    "seat-settle",
  ] as const satisfies readonly StudioSfxKind[])(
    "%s: 댐핑 로우패스가 포함된 절제된 어쿠스틱 톤·노이즈와 스로틀을 돌려준다",
    (kind) => {
      const spec = studioSfxSpec(kind);
      expect(spec.steps.length).toBeGreaterThanOrEqual(1);
      expect(spec.steps.length).toBeLessThanOrEqual(2);
      expect(spec.noiseSteps?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(spec.throttleMs).toBeGreaterThanOrEqual(100);
      for (const step of spec.steps) {
        expect(step.fromHz).toBeGreaterThan(100);
        expect(step.toHz).toBeGreaterThan(100);
        expect(step.durationMs).toBeLessThanOrEqual(120);
        expect(step.peak).toBeGreaterThan(0);
        expect(step.peak).toBeLessThanOrEqual(0.5);
        expect(step.lowpassHz).toBeGreaterThan(200);
        expect(step.lowpassHz).toBeLessThanOrEqual(3000);
      }
      for (const noiseStep of spec.noiseSteps ?? []) {
        expect(["pink", "brown", "grit"]).toContain(noiseStep.noiseColor);
      }
    },
  );

  it("입장은 상승, 퇴장은 하강 패턴이다", () => {
    const join = studioSfxSpec("peer-join");
    const leave = studioSfxSpec("peer-leave");
    expect(join.steps.at(-1)!.fromHz).toBeGreaterThan(join.steps[0]!.fromHz);
    expect(leave.steps.at(-1)!.fromHz).toBeLessThan(leave.steps[0]!.fromHz);
  });

  it("포모도로 시작은 상승 차임, 휴식 전환은 안정 하강 패턴이다", () => {
    const focusStart = studioSfxSpec("focus-start");
    const focusBreak = studioSfxSpec("focus-break");
    expect(focusStart.steps.at(-1)!.fromHz).toBeGreaterThan(focusStart.steps[0]!.fromHz);
    expect(focusBreak.steps.at(-1)!.toHz).toBeLessThan(focusBreak.steps[0]!.fromHz);
  });

  it("이모트 성격별로 웰니스 차임·댄스 비트·일반 팝 SFX를 매핑한다", () => {
    expect(studioEmoteSfxKind("yoga")).toBe("wellness-chime");
    expect(studioEmoteSfxKind("tai-chi")).toBe("wellness-chime");
    expect(studioEmoteSfxKind("dance")).toBe("dance-beat");
    expect(studioEmoteSfxKind("moonwalk")).toBe("dance-beat");
    expect(studioEmoteSfxKind("wave")).toBe("emote");
    expect(studioEmoteSfxKind(null)).toBe("emote");
  });
});

describe("studioFootstepSynthSpec", () => {
  it.each(STUDIO_FOOTSTEP_SURFACES)("표면 %s: 유효한 2~3단계 물리 합성 파라미터를 돌려준다", (surface) => {
    const spec = studioFootstepSynthSpec(surface, "left");
    expect(spec.durationMs).toBeGreaterThan(0);
    expect(spec.durationMs).toBeLessThanOrEqual(100);
    expect(spec.filterFrequency).toBeGreaterThan(100);
    expect(spec.filterFrequency).toBeLessThan(8000);
    expect(spec.heelToSoleHz).toBeLessThan(spec.filterFrequency);
    expect(spec.noisePeak).toBeGreaterThan(0);
    expect(spec.noisePeak).toBeLessThanOrEqual(1);
    expect(spec.soleRoll.delayMs).toBeGreaterThanOrEqual(12);
    expect(spec.soleRoll.peakRatio).toBeGreaterThan(0.3);
    expect(spec.scuffNoise).not.toBeNull();
  });

  it("6종 바닥 표면(carpet·wood·tile·stone·terrace·grass)이 재질별 성형 노이즈와 공명 특성을 구분한다", () => {
    const surfaces = [...STUDIO_ALL_FOOTSTEP_SURFACES, "grass" as const];
    for (const surface of surfaces) {
      const walk = studioFootstepSynthSpec(surface, "left", false);
      const sprint = studioFootstepSynthSpec(surface, "left", true);
      expect(["pink", "brown", "grit"], surface).toContain(walk.noiseColor);
      expect(walk.scuffNoise, surface).not.toBeNull();
      expect(sprint.scuffNoise, surface).toBeNull();
      expect(sprint.frictionNoise, surface).not.toBeNull();
      expect(sprint.secondaryTone, surface).not.toBeNull();
      expect(sprint.soleRoll.delayMs, surface).toBeLessThan(walk.soleRoll.delayMs);
    }

    const carpet = studioFootstepSynthSpec("carpet", "left");
    const wood = studioFootstepSynthSpec("wood", "left");
    const tile = studioFootstepSynthSpec("tile", "left");
    const terrace = studioFootstepSynthSpec("terrace", "left");
    const grass = studioFootstepSynthSpec("grass", "left");

    expect(carpet.noiseColor).toBe("brown");
    expect(wood.noiseColor).toBe("brown");
    expect(tile.noiseColor).toBe("grit");
    expect(terrace.noiseColor).toBe("grit");
    expect(grass.noiseColor).toBe("pink");

    expect(carpet.filterType).toBe("lowpass");
    expect(carpet.filterFrequency).toBeLessThan(wood.filterFrequency);
    expect(wood.filterFrequency).toBeLessThan(tile.filterFrequency);
    expect(carpet.tone).toBeNull();
    expect(wood.tone?.wave).toBe("triangle");
    expect(wood.tone?.lowpassHz).toBeLessThanOrEqual(450);
    expect(tile.tone?.wave).toBe("sine");
  });

  it("왼발과 오른발은 주파수가 미세하게 다르다", () => {
    const left = studioFootstepSynthSpec("wood", "left");
    const right = studioFootstepSynthSpec("wood", "right");
    expect(left.filterFrequency).toBeLessThan(right.filterFrequency);
    expect(left.tone!.frequency).toBeLessThan(right.tone!.frequency);
  });
});
