import { describe, expect, it } from "vitest";

import { evaluateStudioBrushPointerDispatchNativeCases } from "./studio-brush-pointer-dispatch-native-fixture";

type NativeCase = Parameters<typeof evaluateStudioBrushPointerDispatchNativeCases>[0][number];

/** 판정기의 입력 fixture이며 실제 native 브라우저 실행 증거로 쓰지 않는다. */
function completedCases(): NativeCase[] {
  const samples = [
    { sequence: 1, type: "pointerdown", startedAt: 10, endedAt: 11, durationMs: 1 },
    ...[100, 200, 300].map((start, index) => ({
      sequence: index + 2, type: "pointermove", startedAt: start, endedAt: start + 26, durationMs: 26,
    })),
    { sequence: 5, type: "pointerup", startedAt: 400, endedAt: 473, durationMs: 73 },
  ];
  const whole: NativeCase = {
    kind: "whole-dispatch", legacyMoveMs: [0.02, 0.02, 0.02], legacyUpMs: 0.045,
    work: samples.filter(sample => sample.type !== "pointerdown").flatMap(sample => (
      ["window-capture", "target", "target-microtask", "ancestor-bubble", "window-bubble"].map((phase, index) => ({
        type: sample.type, phase, trusted: true, start: sample.startedAt + index, end: sample.startedAt + index + 1,
      }))
    )),
    measurement: {
      boundary: { method: "init-capture-to-verified-window-bubble-v1", installedBeforePageScripts: true,
        complete: true, pageEpoch: 100, endPageEpoch: 100, expectedPointerMoves: 3, starts: 5, ends: 5,
        moveStarts: 3, moveEnds: 3, downCount: 1, upCount: 1, pendingEvents: 0, lateWindowChanges: 0, errors: [] },
      pointerAppendDurationsMs: [26, 26, 26], pointerUpMainThreadMs: 73, samples,
    },
  };
  return [{ ...whole, rearm: { ...whole } }, ...(["stop-propagation", "stop-immediate", "late-bubble", "late-object-capture", "late-setter", "untrusted"] as const)
    .map(kind => ({ ...whole, kind, measurement: { ...whole.measurement, boundary: {
      ...whole.measurement.boundary, complete: false,
      errors: [kind.startsWith("stop-") ? "missing-event-end" : kind === "untrusted" ? "untrusted-event" : "late-window-listener-change"],
    } } }))];
}

describe("native 포인터 경계 회귀의 결과 판정", () => {
  it("7개 완료·native/legacy 차이·모든 handler 구간·거절 사유를 함께 요구한다", () => {
    expect(evaluateStudioBrushPointerDispatchNativeCases(completedCases())).toEqual([]);
  });

  it("합성 또는 일부 handler만 포함한 빠른 측정은 실제 전체 경계 증거가 아니다", () => {
    const cases = completedCases(); const whole = cases[0];
    if (!whole) throw new Error("완료 fixture가 없습니다.");
    cases[0] = { ...whole, work: whole.work.map(work => ({ ...work, trusted: false })), measurement: {
      ...whole.measurement, samples: whole.measurement.samples.map(sample => ({ ...sample, durationMs: 0.02 })),
    } };
    const failures = evaluateStudioBrushPointerDispatchNativeCases(cases);
    expect(failures.some(message => message.includes("이전 microtask 측정의 누락"))).toBe(true);
    expect(failures.some(message => message.includes("50ms 초과"))).toBe(true);
    expect(failures.some(message => message.includes("작업 전체가 경계 안에 없습니다"))).toBe(true);
  });

  it("전체 window bubble 작업이 측정 끝 뒤면 거절한다", () => {
    const cases = completedCases(); const whole = cases[0];
    if (!whole) throw new Error("완료 fixture가 없습니다.");
    cases[0] = { ...whole, work: whole.work.map(work => (
      work.phase === "window-bubble" ? { ...work, end: work.end + 1_000 } : work
    )) };
    expect(evaluateStudioBrushPointerDispatchNativeCases(cases)).toHaveLength(4);
  });

  it("경계 표본은 맞아도 공개 duration에 legacy를 돌려주면 거절한다", () => {
    const cases = completedCases(); const whole = cases[0];
    if (!whole) throw new Error("완료 fixture가 없습니다.");
    cases[0] = { ...whole, measurement: { ...whole.measurement,
      pointerAppendDurationsMs: whole.legacyMoveMs, pointerUpMainThreadMs: whole.legacyUpMs,
    } };
    expect(evaluateStudioBrushPointerDispatchNativeCases(cases)).toEqual([
      "공개 판정 수치가 검증한 dispatch 경계 표본과 다릅니다.",
    ]);
  });

  it("첫 획이 맞아도 같은 document의 release 뒤 재arm 증거가 빠지면 거절한다", () => {
    const cases = completedCases(); const whole = cases[0];
    if (!whole) throw new Error("완료 fixture가 없습니다.");
    const { rearm: _rearm, ...withoutRearm } = whole;
    cases[0] = withoutRearm;
    expect(evaluateStudioBrushPointerDispatchNativeCases(cases)).toEqual([
      "같은 document에서 release 뒤 재arm한 실제 획의 증거가 없습니다.",
    ]);
  });

  it("누락된 negative case와 실패 receipt의 잘못된 수락은 각각 실패한다", () => {
    const cases = completedCases();
    expect(evaluateStudioBrushPointerDispatchNativeCases(cases.slice(1))).toHaveLength(2);
    const invalid = cases[1];
    if (!invalid) throw new Error("거절 fixture가 없습니다.");
    cases[1] = { ...invalid, measurement: { ...invalid.measurement, boundary: {
      ...invalid.measurement.boundary, complete: true, errors: [],
    } } };
    expect(evaluateStudioBrushPointerDispatchNativeCases(cases)).toEqual(["stop-propagation: 불완전한 native 경계를 수락했습니다."]);
  });
});
