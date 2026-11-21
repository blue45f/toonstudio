import { describe, expect, it } from "vitest";

import {
  evaluateAutoAnimatePose,
  RiveStateMachineRuntime,
  WebtoonReactiveRigBinder,
  type RiveStateMachineDefinition,
  type WebtoonSignalBinding,
} from "./studio-rive-state-machine-rig";

function buildHeroStateMachine(): RiveStateMachineDefinition {
  return {
    id: "sm-hero-cut",
    name: "주인공 리빙 컷 상태 머신",
    inputs: [
      { kind: "boolean", name: "isSpeaking", defaultValue: false },
      { kind: "number", name: "scrollProgress", defaultValue: 0, min: 0, max: 1 },
      { kind: "number", name: "voiceAmp", defaultValue: 0, min: 0, max: 1 },
      { kind: "trigger", name: "shockBurst" },
    ],
    clips: [
      {
        id: "clip-idle",
        name: "대기 호흡",
        durationSeconds: 1,
        loopMode: "loop",
        tracks: {
          "param.eyeOpen": [
            { timeSeconds: 0, value: 1 },
            { timeSeconds: 1, value: 1 },
          ],
          "param.bodyY": [
            { timeSeconds: 0, value: 0 },
            { timeSeconds: 1, value: 0 },
          ],
        },
      },
      {
        id: "clip-shock",
        name: "놀람 연출",
        durationSeconds: 0.5,
        loopMode: "one-shot",
        tracks: {
          "param.eyeOpen": [
            { timeSeconds: 0, value: 1.5 },
            { timeSeconds: 0.5, value: 1.5 },
          ],
          "param.bodyY": [
            { timeSeconds: 0, value: -20 },
            { timeSeconds: 0.5, value: -20 },
          ],
        },
      },
      {
        id: "clip-scroll-start",
        name: "스크롤 시작",
        durationSeconds: 1,
        loopMode: "loop",
        tracks: {
          "param.cameraPanX": [{ timeSeconds: 0, value: -10 }],
        },
      },
      {
        id: "clip-scroll-end",
        name: "스크롤 끝",
        durationSeconds: 1,
        loopMode: "loop",
        tracks: {
          "param.cameraPanX": [{ timeSeconds: 0, value: 10 }],
        },
      },
      {
        id: "clip-mouth-open",
        name: "입 벌림 가산",
        durationSeconds: 1,
        loopMode: "loop",
        tracks: {
          "param.mouthOpen": [{ timeSeconds: 0, value: 1 }],
        },
      },
    ],
    layers: [
      {
        id: "base-layer",
        name: "기본 표정",
        blendMode: "override",
        weight: 1,
        entryStateId: "entry",
        anyStateId: "global-wildcard",
        states: [
          { kind: "entry", id: "entry" },
          { kind: "wildcard", id: "global-wildcard" },
          { kind: "animation", id: "idle", name: "대기", clipId: "clip-idle" },
          { kind: "animation", id: "shock", name: "놀람", clipId: "clip-shock" },
        ],
        transitions: [
          {
            id: "tr-entry-idle",
            fromStateId: "entry",
            toStateId: "idle",
            conditions: [],
            blendDurationSeconds: 0,
          },
          {
            id: "tr-global-shock",
            fromStateId: "global-wildcard",
            toStateId: "shock",
            conditions: [{ kind: "trigger", inputName: "shockBurst" }],
            blendDurationSeconds: 0.2,
            easingPresetId: "linear",
          },
          {
            id: "tr-shock-return",
            fromStateId: "shock",
            toStateId: "idle",
            conditions: [{ kind: "boolean", inputName: "isSpeaking", expected: false }],
            exitTimeNormalized: 1.0,
            blendDurationSeconds: 0.1,
          },
        ],
      },
      {
        id: "scroll-layer",
        name: "스크롤 1D 블렌드",
        blendMode: "additive",
        weight: 1,
        entryStateId: "entry-scroll",
        states: [
          { kind: "entry", id: "entry-scroll" },
          {
            kind: "blend-1d",
            id: "scroll-blend",
            name: "스크롤 패닝",
            inputName: "scrollProgress",
            stops: [
              { threshold: 0, clipId: "clip-scroll-start" },
              { threshold: 1, clipId: "clip-scroll-end" },
            ],
          },
        ],
        transitions: [
          {
            id: "tr-scroll-start",
            fromStateId: "entry-scroll",
            toStateId: "scroll-blend",
            conditions: [],
            blendDurationSeconds: 0,
          },
        ],
      },
      {
        id: "voice-layer",
        name: "음성 립싱크 가산",
        blendMode: "additive",
        weight: 1,
        entryStateId: "entry-voice",
        states: [
          { kind: "entry", id: "entry-voice" },
          {
            kind: "blend-direct",
            id: "voice-direct",
            name: "음성 진폭 직결",
            entries: [{ inputName: "voiceAmp", clipId: "clip-mouth-open", weightScale: 1 }],
          },
        ],
        transitions: [
          {
            id: "tr-voice-start",
            fromStateId: "entry-voice",
            toStateId: "voice-direct",
            conditions: [],
            blendDurationSeconds: 0,
          },
        ],
      },
    ],
  };
}

describe("studio-rive-state-machine-rig", () => {
  it("Trigger 전이·원자적 소비·블렌드 시간 크로스페이드·ExitTime 복귀를 정확히 수행한다", () => {
    const runtime = new RiveStateMachineRuntime(buildHeroStateMachine());
    expect(runtime.getActiveStateId("base-layer")).toBe("idle");

    const pose0 = runtime.step(0.05);
    expect(pose0["param.bodyY"]).toBeCloseTo(0, 4);

    // Trigger 발화 → 0.2s 선형 크로스페이드 시작
    runtime.fireTrigger("shockBurst");
    const poseStart = runtime.step(0.0);
    expect(runtime.getActiveStateId("base-layer")).toBe("shock");
    expect(poseStart["param.bodyY"]).toBeCloseTo(0, 4);

    // 절반 시점(0.1s / 0.2s)에는 0과 -20의 중간값 -10이어야 한다.
    const poseMid = runtime.step(0.1);
    expect(poseMid["param.bodyY"]).toBeCloseTo(-10, 2);

    // 0.1s 추가 경과 시 블렌드 완료(-20)
    const poseFull = runtime.step(0.1);
    expect(poseFull["param.bodyY"]).toBeCloseTo(-20, 2);

    // 아직 exitTimeNormalized(1.0 = 0.5s) 미만이라 shock 상태 유지
    expect(runtime.getActiveStateId("base-layer")).toBe("shock");

    // 0.35s 추가 경과 → stateTime >= 0.5s → idle로 복귀(트리거는 이미 소비되어 재진입 없음)
    runtime.step(0.35);
    expect(runtime.getActiveStateId("base-layer")).toBe("idle");

    const events = runtime.drainEvents();
    expect(events.some((e) => e.kind === "transition-start" && e.transitionId === "tr-global-shock")).toBe(true);
    expect(events.some((e) => e.kind === "transition-complete" && e.transitionId === "tr-global-shock")).toBe(true);
  });

  it("WebtoonReactiveRigBinder가 스크롤 임계 트리거·1D 블렌드·음성 엔벨로프 스무딩을 상태 머신에 바인딩한다", () => {
    const runtime = new RiveStateMachineRuntime(buildHeroStateMachine());
    const bindings: readonly WebtoonSignalBinding[] = [
      { source: "scroll-progress", targetInput: "scrollProgress", minOut: 0, maxOut: 1 },
      { source: "scroll-threshold-trigger", targetInput: "shockBurst", threshold: 0.5 },
      { source: "voice-amplitude", targetInput: "voiceAmp", attackSeconds: 0.02, releaseSeconds: 0.15 },
      { source: "voice-speaking", targetInput: "isSpeaking" },
    ];
    const binder = new WebtoonReactiveRigBinder(bindings);

    binder.apply(runtime, { scrollProgress: 0.25, voiceAmplitude01: 0, voiceSpeaking: false }, 0.05);
    const poseEarly = runtime.step(0.05);
    expect(runtime.getActiveStateId("base-layer")).toBe("idle");
    // scrollProgress=0.25 → lerp(-10, 10, 0.25) = -5
    expect(poseEarly["param.cameraPanX"]).toBeCloseTo(-5, 3);

    // 스크롤이 0.5 임계 통과 + 음성 0.9 입력
    binder.apply(runtime, { scrollProgress: 0.75, voiceAmplitude01: 0.9, voiceSpeaking: true }, 0.05);
    const poseTriggered = runtime.step(0.05);
    expect(runtime.getActiveStateId("base-layer")).toBe("shock");
    expect(poseTriggered["param.cameraPanX"]).toBeCloseTo(5, 3);
    expect(poseTriggered["param.mouthOpen"]).toBeGreaterThan(0.5);

    // 음성이 끊기면 releaseSeconds에 따라 부드럽게 감쇠(즉시 0이 되지 않음)
    binder.apply(runtime, { scrollProgress: 0.75, voiceAmplitude01: 0, voiceSpeaking: false }, 0.03);
    const poseRelease = runtime.step(0.03);
    expect(poseRelease["param.mouthOpen"]).toBeGreaterThan(0.2);
    expect(poseRelease["param.mouthOpen"]).toBeLessThan(poseTriggered["param.mouthOpen"] ?? 1);
  });

  it("Auto Animate가 두 포즈 스냅샷 사이를 이징 곡선으로 보간한다", () => {
    const poseA = { x: 0, scale: 1 };
    const poseB = { x: 100, scale: 1.5 };
    const mid = evaluateAutoAnimatePose(poseA, poseB, 0.5, "linear");
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.scale).toBeCloseTo(1.25, 5);
  });
});
