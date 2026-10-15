import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAiStoryboardDirector } from "../ai/studio-ai-storyboard-director";

import { TENSION_MAP_CONFIG } from "./webtoon-tension-map";
import {
  TENSION_MAP_SAMPLE_SCRIPT,
  TENSION_MAP_SCRIPT_MAX_CHARS,
  buildTensionMapView,
} from "./webtoon-tension-map-source";

import type { PanelVerticalSpan } from "./webtoon-scroll-pacing-simulator";

afterEach(() => {
  vi.restoreAllMocks();
});

const PANELS: readonly PanelVerticalSpan[] = [
  { id: "f1", topY: 0, bottomY: 700, heightPx: 700, dialogueCount: 1 },
  { id: "f2", topY: 1100, bottomY: 1500, heightPx: 400, dialogueCount: 0 },
  { id: "f3", topY: 1700, bottomY: 2300, heightPx: 600, dialogueCount: 2 },
];

describe("TENSION_MAP_SAMPLE_SCRIPT", () => {
  const plan = new StudioAiStoryboardDirector().direct(TENSION_MAP_SAMPLE_SCRIPT).cuts;

  it("is ten lines, so ten cuts, and fits the input limit", () => {
    expect(plan).toHaveLength(10);
    expect(TENSION_MAP_SAMPLE_SCRIPT.length).toBeLessThan(TENSION_MAP_SCRIPT_MAX_CHARS);
  });

  it("is read by the storyboard director as calm → shock → action → … so the demo has a shape", () => {
    expect(plan.map((cut) => cut.emotion)).toEqual([
      "calm", "calm", "calm", "calm", "shock", "calm", "rage", "calm", "rage", "determination",
    ]);
  });

  it("draws one drag run, two abrupt rises and three climax candidates", () => {
    const view = buildTensionMapView({ kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, panels: [] });
    if (view.status !== "ready") throw new Error(`expected ready, got ${view.status}`);
    const byKind = (kind: string) =>
      view.result.segments
        .filter((segment) => segment.kind === kind)
        .map((segment) => [segment.startIndex, segment.endIndex]);
    expect(byKind("drag")).toEqual([[0, 3]]);
    expect(byKind("rush")).toEqual([[3, 4], [7, 8]]);
    expect(byKind("climax")).toEqual([[4, 4], [6, 6], [8, 8]]);
    expect(view.result.peakIndex).toBe(4);
  });
});

describe("buildTensionMapView — script source", () => {
  it("is empty for a blank script, including whitespace and newlines only", () => {
    for (const script of ["", "   ", "\n\n \t\n"]) {
      expect(buildTensionMapView({ kind: "script", script, panels: PANELS })).toEqual({
        status: "empty",
        reason: "no-script",
      });
    }
  });

  it("turns one line into one cut and reports the script as the source", () => {
    const view = buildTensionMapView({
      kind: "script",
      script: "첫 장면입니다.\n\n둘째 장면입니다.",
      panels: [],
    });
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.kind).toBe("script");
    expect(view.result.cuts).toHaveLength(2);
    expect(view.result.cuts[0].summary).toBe("첫 장면입니다.");
  });

  it("never analyses more than the input limit: a huge script ends at the cut cap, flagged as truncated", () => {
    const line = "평범한 장면이 이어진다.\n";
    const huge = line.repeat(Math.ceil((TENSION_MAP_SCRIPT_MAX_CHARS * 2) / line.length));
    const view = buildTensionMapView({ kind: "script", script: huge, panels: [] });
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.result.cuts).toHaveLength(TENSION_MAP_CONFIG.limits.maxCuts);
    expect(view.result.truncated).toBe(true);
  });

  it("is deterministic for the same script", () => {
    const first = buildTensionMapView({ kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, panels: [] });
    const second = buildTensionMapView({ kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, panels: PANELS });
    expect(second).toEqual(first);
  });
});

describe("buildTensionMapView — document source", () => {
  it("is empty without real panels, whatever the script says", () => {
    expect(
      buildTensionMapView({ kind: "document", script: TENSION_MAP_SAMPLE_SCRIPT, panels: [] }),
    ).toEqual({ status: "empty", reason: "no-panels" });
  });

  it("scores real panels by dwell time only and says the source is the document", () => {
    const view = buildTensionMapView({ kind: "document", script: "무시되는 대본", panels: PANELS });
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.kind).toBe("document");
    expect(view.result.cuts.map((cut) => cut.id)).toEqual(["f1", "f2", "f3"]);
    expect(view.result.cuts.every((cut) => cut.basis.join() === "dwell")).toBe(true);
    // f2: 간격 400 + 높이 400 = 800px → 2.3초, 말풍선 0개
    expect(view.result.cuts[1].gutterBeforePx).toBe(400);
    expect(view.result.cuts[1].dwellSec).toBe(2.3);
  });
});

describe("buildTensionMapView — failure", () => {
  it("returns an error state instead of throwing when the analysis fails", () => {
    vi.spyOn(StudioAiStoryboardDirector.prototype, "direct").mockImplementation(() => {
      throw new Error("director exploded");
    });
    const view = buildTensionMapView({ kind: "script", script: "아무 대본", panels: [] });
    expect(view).toEqual({ status: "error", detail: "director exploded" });
  });

  it("stringifies a non-Error throw", () => {
    vi.spyOn(StudioAiStoryboardDirector.prototype, "direct").mockImplementation(() => {
      throw "plain string";
    });
    expect(buildTensionMapView({ kind: "script", script: "x", panels: [] })).toEqual({
      status: "error",
      detail: "plain string",
    });
  });
});
