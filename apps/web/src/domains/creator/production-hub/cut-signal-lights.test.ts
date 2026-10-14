import { describe, expect, it } from "vitest";

import {
  CUT_SIGNAL_RULES,
  DEFAULT_CUT_SIGNAL_SETTINGS,
  evaluateCutSignals,
  isCutSignalRuleEnabled,
  parseCutSignalSettings,
  serializeCutSignalSettings,
  summarizeCutSignals,
  toggleCutSignalRule,
  type CutSignalCutInput,
  type CutSignalLayerMeta,
} from "./cut-signal-lights";

function layer(partial: Partial<CutSignalLayerMeta> & { id: string }): CutSignalLayerMeta {
  return { visible: true, ...partial };
}

function cut(partial: Partial<CutSignalCutInput> & { cutId: string }): CutSignalCutInput {
  return { label: partial.cutId, layers: [], ...partial };
}

describe("cut-signal-lights 규칙 판정", () => {
  it("레이어가 하나도 없으면 no-layers block으로 빨간불이 켜진다", () => {
    const result = evaluateCutSignals(cut({ cutId: "c1", layers: [] }));
    expect(result.light).toBe("red");
    expect(result.signals.map((signal) => signal.ruleId)).toEqual(["no-layers"]);
  });

  it("빈 레이어가 있으면 empty-layer 신호와 함께 노란불이 켜지고 이름이 detail에 들어간다", () => {
    const result = evaluateCutSignals(cut({
      cutId: "c2",
      layers: [
        layer({ id: "l1", name: "선화", contentCount: 12 }),
        layer({ id: "l2", name: "메모", contentCount: 0 }),
      ],
    }));
    expect(result.light).toBe("yellow");
    const signal = result.signals.find((candidate) => candidate.ruleId === "empty-layer");
    expect(signal?.detail.ko).toContain("메모");
  });

  it("contentCount를 아는 레이어가 없으면 empty-layer를 평가하지 않는다(지어내지 않음)", () => {
    const result = evaluateCutSignals(cut({
      cutId: "c3",
      layers: [layer({ id: "l1", name: "선화" })],
    }));
    expect(result.evaluatedRuleIds).not.toContain("empty-layer");
    expect(result.signals.some((signal) => signal.ruleId === "empty-layer")).toBe(false);
  });

  it("스케치 레이어가 보이면 sketch-visible, 숨겨져 있으면 신호가 없다", () => {
    const visible = evaluateCutSignals(cut({
      cutId: "c4",
      layers: [layer({ id: "l1", name: "밑그림", role: "sketch", visible: true, contentCount: 3 })],
    }));
    expect(visible.signals.map((signal) => signal.ruleId)).toContain("sketch-visible");

    const hidden = evaluateCutSignals(cut({
      cutId: "c5",
      layers: [layer({ id: "l1", name: "밑그림", role: "sketch", visible: false, contentCount: 3 })],
    }));
    expect(hidden.signals).toHaveLength(0);
    expect(hidden.light).toBe("green");
  });

  it("채색이 시작됐는데 톤 재료가 없으면 tone-missing, 톤 레이어나 hasTone이 있으면 통과", () => {
    const missing = evaluateCutSignals(cut({
      cutId: "c6",
      coloringStarted: true,
      layers: [layer({ id: "l1", role: "color", contentCount: 5 })],
    }));
    expect(missing.signals.map((signal) => signal.ruleId)).toContain("tone-missing");

    const byRole = evaluateCutSignals(cut({
      cutId: "c7",
      coloringStarted: true,
      layers: [layer({ id: "l1", role: "tone", contentCount: 5 })],
    }));
    expect(byRole.signals.some((signal) => signal.ruleId === "tone-missing")).toBe(false);

    const byFlag = evaluateCutSignals(cut({
      cutId: "c8",
      coloringStarted: true,
      layers: [layer({ id: "l1", role: "color", hasTone: true, contentCount: 5 })],
    }));
    expect(byFlag.signals.some((signal) => signal.ruleId === "tone-missing")).toBe(false);
  });

  it("채색 시작 여부를 모르면 tone-missing을 평가하지 않고, 시작 전이면 신호가 없다", () => {
    const unknown = evaluateCutSignals(cut({
      cutId: "c9",
      layers: [layer({ id: "l1", role: "line", contentCount: 5 })],
    }));
    expect(unknown.evaluatedRuleIds).not.toContain("tone-missing");

    const beforeColoring = evaluateCutSignals(cut({
      cutId: "c10",
      coloringStarted: false,
      layers: [layer({ id: "l1", role: "line", contentCount: 5 })],
    }));
    expect(beforeColoring.evaluatedRuleIds).toContain("tone-missing");
    expect(beforeColoring.signals).toHaveLength(0);
    expect(beforeColoring.light).toBe("green");
  });

  it("평가할 재료가 전혀 없으면 green이 아니라 none이다", () => {
    // layers가 비어 있지 않지만 contentCount·role·coloringStarted가 전부 미상인 경우:
    // no-layers만 평가되고 통과하므로 green이 맞다. 반대로 전 규칙을 끄면 none이 된다.
    const allOff = CUT_SIGNAL_RULES.reduce(
      (settings, rule) => toggleCutSignalRule(settings, rule.id, false),
      DEFAULT_CUT_SIGNAL_SETTINGS,
    );
    const result = evaluateCutSignals(cut({
      cutId: "c11",
      layers: [layer({ id: "l1" })],
    }), allOff);
    expect(result.evaluatedRuleIds).toHaveLength(0);
    expect(result.light).toBe("none");
  });
});

describe("cut-signal-lights 설정(작가가 규칙을 끌 수 있음)", () => {
  it("끈 규칙은 신호를 만들지 않고 평가 목록에서도 빠진다", () => {
    const settings = toggleCutSignalRule(DEFAULT_CUT_SIGNAL_SETTINGS, "empty-layer", false);
    expect(isCutSignalRuleEnabled(settings, "empty-layer")).toBe(false);
    const result = evaluateCutSignals(cut({
      cutId: "c12",
      layers: [layer({ id: "l1", name: "빈것", contentCount: 0 })],
    }), settings);
    expect(result.signals).toHaveLength(0);
    expect(result.evaluatedRuleIds).not.toContain("empty-layer");
    expect(result.light).toBe("green");
  });

  it("toggle은 입력을 바꾸지 않고, 다시 켜면 기본 상태로 돌아온다", () => {
    const off = toggleCutSignalRule(DEFAULT_CUT_SIGNAL_SETTINGS, "tone-missing", false);
    expect(DEFAULT_CUT_SIGNAL_SETTINGS.disabledRuleIds).toHaveLength(0);
    const on = toggleCutSignalRule(off, "tone-missing", true);
    expect(on.disabledRuleIds).toHaveLength(0);
  });

  it("직렬화→파싱 왕복이 유지되고, 깨진 값·모르는 규칙은 버려진다", () => {
    const settings = toggleCutSignalRule(
      toggleCutSignalRule(DEFAULT_CUT_SIGNAL_SETTINGS, "sketch-visible", false),
      "tone-missing",
      false,
    );
    expect(parseCutSignalSettings(serializeCutSignalSettings(settings))).toEqual(settings);
    expect(parseCutSignalSettings(null)).toEqual(DEFAULT_CUT_SIGNAL_SETTINGS);
    expect(parseCutSignalSettings("{not json")).toEqual(DEFAULT_CUT_SIGNAL_SETTINGS);
    expect(parseCutSignalSettings(JSON.stringify({ disabledRuleIds: ["nope", "empty-layer"] })).disabledRuleIds)
      .toEqual(["empty-layer"]);
  });
});

describe("summarizeCutSignals 회차 집계", () => {
  it("신호등 색상별 개수와 규칙별 컷 수를 세고 입력 순서를 유지한다", () => {
    const summary = summarizeCutSignals([
      cut({ cutId: "a", label: "1컷", layers: [] }),
      cut({ cutId: "b", label: "2컷", layers: [layer({ id: "l1", contentCount: 0 })] }),
      cut({ cutId: "c", label: "3컷", layers: [layer({ id: "l1", role: "line", contentCount: 4 })] }),
    ]);
    expect(summary.results.map((result) => result.cutId)).toEqual(["a", "b", "c"]);
    expect(summary.totalCuts).toBe(3);
    expect(summary.redCount).toBe(1);
    expect(summary.yellowCount).toBe(1);
    expect(summary.greenCount).toBe(1);
    expect(summary.unevaluatedCount).toBe(0);
    expect(summary.signalCountByRule["no-layers"]).toBe(1);
    expect(summary.signalCountByRule["empty-layer"]).toBe(1);
    expect(summary.signalCountByRule["sketch-visible"]).toBe(0);
  });
});
