import { describe, expect, it } from "vitest";

import { StudioAiStoryboardDirector } from "../ai/studio-ai-storyboard-director";

import {
  CUT_EMOTION_ORDER,
  CUT_SHOT_SCALE_ORDER,
} from "./webtoon-cut-vocabulary";
import { WebtoonScrollPacingSimulator } from "./webtoon-scroll-pacing-simulator";
import {
  TENSION_EMOTION_WEIGHT,
  TENSION_MAP_CONFIG,
  TENSION_MAP_PARAMETERS,
  TENSION_SHOT_WEIGHT,
  analyzeTensionMap,
  computeDwellSeconds,
  tensionCutsFromPanels,
  tensionCutsFromStoryboardPlan,
  tensionTempoScore,
  type TensionCutInput,
} from "./webtoon-tension-map";

const { dwell, segments: rules, weights } = TENSION_MAP_CONFIG;

/** 체류 시간이 정확히 `seconds` 가 되는 컷 높이(px). 여백·말풍선은 0. */
function heightForDwell(seconds: number): number {
  return Math.round(seconds * dwell.speedPxPerSec);
}

/** 감정·샷만 있는 컷 — 체류 시간(템포) 근거가 없어 긴장도가 감정·샷 비중만으로 정해진다. */
function emotionCut(id: string, emotion: TensionCutInput["emotion"]): TensionCutInput {
  return { id, emotion };
}

/** 체류 시간만 있는 컷(문서 컷과 같은 형태). */
function dwellCut(id: string, seconds: number, gutterBeforePx?: number): TensionCutInput {
  return { id, heightPx: heightForDwell(seconds), gutterBeforePx };
}

describe("TENSION_MAP_CONFIG", () => {
  it("keeps the three basis weights summing to 1 and the dwell band well formed", () => {
    expect(weights.emotion + weights.shot + weights.tempo).toBeCloseTo(1, 10);
    expect(dwell.fastSec).toBeLessThan(dwell.slowSec);
    expect(dwell.fastSec).toBeGreaterThan(0);
  });

  it("weights every emotion and shot scale of the storyboard vocabulary within 0..1", () => {
    expect(Object.keys(TENSION_EMOTION_WEIGHT).sort()).toEqual([...CUT_EMOTION_ORDER].sort());
    expect(Object.keys(TENSION_SHOT_WEIGHT).sort()).toEqual([...CUT_SHOT_SCALE_ORDER].sort());
    for (const value of [
      ...Object.values(TENSION_EMOTION_WEIGHT),
      ...Object.values(TENSION_SHOT_WEIGHT),
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("orders emotions so that conflict outranks calm", () => {
    expect(TENSION_EMOTION_WEIGHT.rage).toBeGreaterThan(TENSION_EMOTION_WEIGHT.sorrow);
    expect(TENSION_EMOTION_WEIGHT.sorrow).toBeGreaterThan(TENSION_EMOTION_WEIGHT.calm);
    expect(TENSION_SHOT_WEIGHT["extreme-close-up"]).toBeGreaterThan(TENSION_SHOT_WEIGHT["long-shot"]);
  });
});

describe("tensionTempoScore", () => {
  it("is 1 at and below the fast edge and 0 at and above the slow edge", () => {
    expect(tensionTempoScore(dwell.fastSec)).toBe(1);
    expect(tensionTempoScore(0)).toBe(1);
    expect(tensionTempoScore(dwell.slowSec)).toBe(0);
    expect(tensionTempoScore(dwell.slowSec + 100)).toBe(0);
  });

  it("interpolates linearly between the edges", () => {
    const middle = (dwell.fastSec + dwell.slowSec) / 2;
    expect(tensionTempoScore(middle)).toBeCloseTo(0.5, 10);
    expect(tensionTempoScore(dwell.fastSec + 0.5)).toBeGreaterThan(tensionTempoScore(dwell.fastSec + 1));
  });

  it("treats a non-finite dwell as the slowest score instead of throwing", () => {
    expect(tensionTempoScore(Number.NaN)).toBe(0);
    expect(tensionTempoScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("computeDwellSeconds", () => {
  it("adds the lead-in gutter and the per-bubble reading time to the scroll time", () => {
    // (400 + 700) / 350 = 3.142… → 3.1, 말풍선 2개 = 1.6초
    expect(computeDwellSeconds({ heightPx: 700, gutterBeforePx: 400 })).toBe(3.1);
    expect(computeDwellSeconds({ heightPx: 700, gutterBeforePx: 400, dialogueCount: 2 })).toBe(4.7);
  });

  it("cannot be computed without a usable height", () => {
    expect(computeDwellSeconds({ heightPx: null })).toBeNull();
    expect(computeDwellSeconds({ heightPx: 0 })).toBeNull();
    expect(computeDwellSeconds({ heightPx: -50 })).toBeNull();
    expect(computeDwellSeconds({ heightPx: Number.NaN })).toBeNull();
  });

  it("ignores unusable gutters and dialogue counts instead of poisoning the result", () => {
    expect(computeDwellSeconds({ heightPx: 700, gutterBeforePx: Number.NaN, dialogueCount: -3 })).toBe(2);
    expect(computeDwellSeconds({ heightPx: 700, gutterBeforePx: -10 })).toBe(2);
  });

  it("agrees with the scroll pacing simulator's standard-reader time for a single panel", () => {
    const simulator = new WebtoonScrollPacingSimulator();
    for (const [height, dialogues] of [
      [700, 1],
      [1050, 0],
      [1750, 2],
      [2800, 3],
    ] as const) {
      const simulated = simulator.analyze(
        [{ id: "p", topY: 0, bottomY: height, heightPx: height, dialogueCount: dialogues }],
        height,
      ).estimatedReadingSeconds.casual;
      expect(Math.round(computeDwellSeconds({ heightPx: height, dialogueCount: dialogues }) ?? -1)).toBe(
        simulated,
      );
    }
  });
});

describe("analyzeTensionMap — scoring", () => {
  it("returns an empty, well-formed result for no cuts", () => {
    const result = analyzeTensionMap([]);
    expect(result.cuts).toEqual([]);
    expect(result.segments).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(result.peakIndex).toBeNull();
    expect(result.averageTension).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("pins the formula: emotion 0.5 + shot 0.3 + tempo 0.2 over a known cut", () => {
    const [cut] = analyzeTensionMap([
      {
        id: "a",
        emotion: "rage",
        shotScale: "extreme-close-up",
        heightPx: 700,
        gutterBeforePx: 400,
      },
    ]).cuts;
    // dwell 3.1s → tempo 1 − (3.1 − 2) / 5 = 0.78
    expect(cut.dwellSec).toBe(3.1);
    expect(cut.components).toEqual({ emotion: 0.9, shot: 0.95, tempo: 0.78 });
    expect(cut.tension).toBe(0.891);
    expect(cut.basis).toEqual(["emotion", "shot", "dwell"]);
  });

  it("drops unknown bases from the sum and renormalises instead of inventing neutral values", () => {
    const [emotionOnly, shotOnly, dwellOnly] = analyzeTensionMap([
      { id: "e", emotion: "rage" },
      { id: "s", shotScale: "long-shot" },
      { id: "d", heightPx: heightForDwell(dwell.fastSec) },
    ]).cuts;
    expect(emotionOnly.tension).toBe(TENSION_EMOTION_WEIGHT.rage);
    expect(emotionOnly.basis).toEqual(["emotion"]);
    expect(emotionOnly.components.shot).toBeNull();
    expect(emotionOnly.dwellSec).toBeNull();
    expect(shotOnly.tension).toBe(TENSION_SHOT_WEIGHT["long-shot"]);
    expect(dwellOnly.tension).toBe(1);
    expect(dwellOnly.basis).toEqual(["dwell"]);
  });

  it("excludes cuts with no usable basis, duplicate ids and blank ids, and reports why", () => {
    const result = analyzeTensionMap([
      { id: "ok-1", emotion: "joy" },
      { id: "no-basis" },
      { id: "ok-2", emotion: "calm" },
      { id: "ok-1", emotion: "rage" },
      { id: "   ", emotion: "rage" },
      // 런타임에서 들어온 잘못된 어휘는 모르는 값으로 취급한다
      { id: "bad-vocab", emotion: "furious" as unknown as TensionCutInput["emotion"] },
    ]);
    expect(result.cuts.map((cut) => cut.id)).toEqual(["ok-1", "ok-2"]);
    expect(result.cuts.map((cut) => cut.index)).toEqual([0, 1]);
    expect(result.excluded).toEqual([
      { id: "no-basis", reason: "no-basis" },
      { id: "ok-1", reason: "duplicate-id" },
      { id: "", reason: "invalid-id" },
      { id: "bad-vocab", reason: "no-basis" },
    ]);
  });

  it("never throws or leaves 0..1 for hostile numbers", () => {
    const hostile: TensionCutInput[] = [
      { id: "nan", heightPx: Number.NaN, emotion: "rage" },
      { id: "inf", heightPx: Number.POSITIVE_INFINITY, gutterBeforePx: Number.POSITIVE_INFINITY },
      { id: "neg", heightPx: -500, gutterBeforePx: -5, dialogueCount: -1, shotScale: "close-up" },
      { id: "huge", heightPx: 9e30, gutterBeforePx: 9e30, dialogueCount: 9e9 },
    ];
    const result = analyzeTensionMap(hostile);
    expect(result.excluded).toEqual([
      { id: "inf", reason: "no-basis" },
    ]);
    for (const cut of result.cuts) {
      expect(cut.tension).toBeGreaterThanOrEqual(0);
      expect(cut.tension).toBeLessThanOrEqual(1);
      if (cut.dwellSec !== null) expect(Number.isFinite(cut.dwellSec)).toBe(true);
    }
    // 아주 큰 높이는 상한으로 잘려 가장 느린 템포(0)가 된다
    expect(result.cuts.find((cut) => cut.id === "huge")?.components.tempo).toBe(0);
  });

  it("keeps every emotion × shot × dwell combination inside 0..1", () => {
    let checked = 0;
    for (const emotion of CUT_EMOTION_ORDER) {
      const inputs: TensionCutInput[] = [];
      for (const shotScale of CUT_SHOT_SCALE_ORDER) {
        for (const seconds of [0.5, dwell.fastSec, 4.5, dwell.slowSec, 30]) {
          inputs.push({
            id: `${emotion}/${shotScale}/${seconds}`,
            emotion,
            shotScale,
            heightPx: heightForDwell(seconds),
          });
        }
      }
      for (const cut of analyzeTensionMap(inputs).cuts) {
        expect(cut.tension).toBeGreaterThanOrEqual(0);
        expect(cut.tension).toBeLessThanOrEqual(1);
        checked += 1;
      }
    }
    expect(checked).toBe(CUT_EMOTION_ORDER.length * CUT_SHOT_SCALE_ORDER.length * 5);
  });

  it("is monotone: a faster read never lowers tension and a stronger emotion never lowers it", () => {
    const [slow, fast] = analyzeTensionMap([
      { id: "slow", emotion: "joy", shotScale: "medium-shot", heightPx: heightForDwell(6) },
      { id: "fast", emotion: "joy", shotScale: "medium-shot", heightPx: heightForDwell(3) },
    ]).cuts;
    expect(fast.tension).toBeGreaterThan(slow.tension);

    const [calm, rage] = analyzeTensionMap([
      { id: "calm", emotion: "calm", shotScale: "medium-shot", heightPx: 700 },
      { id: "rage", emotion: "rage", shotScale: "medium-shot", heightPx: 700 },
    ]).cuts;
    expect(rage.tension).toBeGreaterThan(calm.tension);
  });

  it("is deterministic: identical input gives deep-equal output and the input is not mutated", () => {
    const input: TensionCutInput[] = [
      { id: "1", emotion: "calm", shotScale: "long-shot", heightPx: 800, gutterBeforePx: 0 },
      { id: "2", emotion: "rage", shotScale: "extreme-close-up", heightPx: 500, gutterBeforePx: 300 },
    ];
    const snapshot = JSON.stringify(input);
    expect(analyzeTensionMap(input)).toEqual(analyzeTensionMap(input));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("keeps the caller's order and reports the first cut among equal peaks", () => {
    const result = analyzeTensionMap([
      emotionCut("a", "joy"),
      emotionCut("b", "rage"),
      emotionCut("c", "rage"),
      emotionCut("d", "calm"),
    ]);
    expect(result.cuts.map((cut) => cut.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.peakIndex).toBe(1);
    expect(result.averageTension).toBe(
      Math.round(((0.25 + 0.9 + 0.9 + 0.1) / 4) * 1000) / 1000,
    );
  });

  it("analyses only the first maxCuts cuts and says it truncated", () => {
    const { maxCuts } = TENSION_MAP_CONFIG.limits;
    const many = Array.from({ length: maxCuts + 1 }, (_, index) => emotionCut(`c${index}`, "calm"));
    const result = analyzeTensionMap(many);
    expect(result.truncated).toBe(true);
    expect(result.cuts).toHaveLength(maxCuts);
    expect(analyzeTensionMap(many.slice(0, maxCuts)).truncated).toBe(false);
  });
});

describe("analyzeTensionMap — drag (늘어짐) candidates", () => {
  const low = (id: string) => emotionCut(id, "calm"); // 0.1 < 0.4

  it("needs dragMinRun consecutive low-tension cuts: two are not enough, three are", () => {
    const dragOf = (inputs: TensionCutInput[]) =>
      analyzeTensionMap(inputs).segments.filter((segment) => segment.kind === "drag");

    expect(dragOf([low("a"), low("b"), emotionCut("c", "rage")])).toEqual([]);

    // 네 번째 컷은 낮지 않고(0.45) 급상승도(+0.35) 아니라서 늘어짐 구간만 남는다
    const result = analyzeTensionMap([
      low("a"), low("b"), low("c"), { id: "d", shotScale: "medium-shot" },
    ]);
    expect(result.segments).toEqual([
      { kind: "drag", reason: "low-tension-run", startIndex: 0, endIndex: 2 },
    ]);
    expect(result.cuts.map((cut) => cut.flags)).toEqual([["drag"], ["drag"], ["drag"], []]);
  });

  it("treats the threshold itself as not low (strictly below dragMaxTension)", () => {
    // 체류 시간 5.0초 → 템포 0.4 → 긴장도 정확히 0.4
    const atThreshold = analyzeTensionMap([dwellCut("a", 5), dwellCut("b", 5), dwellCut("c", 5)]);
    expect(atThreshold.cuts.every((cut) => cut.tension === rules.dragMaxTension)).toBe(true);
    expect(atThreshold.segments.filter((segment) => segment.kind === "drag")).toEqual([]);

    const justBelow = analyzeTensionMap([dwellCut("a", 5.1), dwellCut("b", 5.1), dwellCut("c", 5.1)]);
    expect(justBelow.cuts.every((cut) => cut.tension < rules.dragMaxTension)).toBe(true);
    expect(justBelow.segments.filter((segment) => segment.kind === "drag")).toHaveLength(1);
  });

  it("splits runs at a cut that is not low", () => {
    const result = analyzeTensionMap([
      low("a"), low("b"), low("c"),
      emotionCut("hit", "rage"),
      low("d"), low("e"), low("f"), low("g"),
    ]);
    expect(
      result.segments.filter((segment) => segment.kind === "drag").map((s) => [s.startIndex, s.endIndex]),
    ).toEqual([[0, 2], [4, 7]]);
  });
});

describe("analyzeTensionMap — rush (급함) candidates", () => {
  it("flags rushMinRun consecutive cuts read in fastSec or less, boundary inclusive", () => {
    const quick = analyzeTensionMap([dwellCut("a", dwell.fastSec), dwellCut("b", dwell.fastSec), dwellCut("c", dwell.fastSec)]);
    expect(quick.segments).toEqual([
      { kind: "rush", reason: "fast-dwell-run", startIndex: 0, endIndex: 2 },
    ]);

    const twoOnly = analyzeTensionMap([dwellCut("a", 1), dwellCut("b", 1), dwellCut("c", 5)]);
    expect(twoOnly.segments.filter((segment) => segment.kind === "rush")).toEqual([]);

    const justSlower = analyzeTensionMap([
      dwellCut("a", dwell.fastSec + 0.1),
      dwellCut("b", dwell.fastSec + 0.1),
      dwellCut("c", dwell.fastSec + 0.1),
    ]);
    expect(justSlower.segments.filter((segment) => segment.reason === "fast-dwell-run")).toEqual([]);
  });

  it("flags a one-step rise of abruptRise or more, boundary inclusive", () => {
    // joy 0.25 → rage 0.9 : +0.65
    const rushOf = (inputs: TensionCutInput[]) =>
      analyzeTensionMap(inputs).segments.filter((segment) => segment.kind === "rush");
    expect(rushOf([emotionCut("a", "joy"), emotionCut("b", "rage")])).toEqual([
      { kind: "rush", reason: "abrupt-rise", startIndex: 0, endIndex: 1 },
    ]);

    // 감정만 있는 컷의 긴장도는 감정 가중치 그대로다: determination 0.7 → rage 0.9 = +0.2 (미만)
    expect(rushOf([emotionCut("a", "determination"), emotionCut("b", "rage")])).toEqual([]);

    // 정확히 +0.4 — 체류 시간만 있는 컷으로 맞춘다: 5.0초 → 템포 0.4, 3.0초 → 템포 0.8
    const exact = analyzeTensionMap([dwellCut("a", 5), dwellCut("b", 3)]);
    expect(exact.cuts.map((cut) => cut.tension)).toEqual([0.4, 0.8]);
    expect(exact.segments).toEqual([
      { kind: "rush", reason: "abrupt-rise", startIndex: 0, endIndex: 1 },
    ]);
    // 3.2초 → 템포 0.76 : +0.36 은 기준 미만
    expect(rushOf([dwellCut("a", 5), dwellCut("b", 3.2)])).toEqual([]);
  });

  it("does not count a rise that follows a scene-transition-sized gutter as rushing", () => {
    const exempt = rules.abruptRiseExemptGutterPx;
    const planned = analyzeTensionMap([
      { id: "a", emotion: "calm", heightPx: 700 },
      { id: "b", emotion: "rage", heightPx: 700, gutterBeforePx: exempt },
    ]);
    expect(planned.segments.filter((segment) => segment.kind === "rush")).toEqual([]);

    const cramped = analyzeTensionMap([
      { id: "a", emotion: "calm", heightPx: 700 },
      { id: "b", emotion: "rage", heightPx: 700, gutterBeforePx: exempt - 1 },
    ]);
    expect(cramped.segments.filter((segment) => segment.kind === "rush")).toHaveLength(1);
  });

  it("merges overlapping rises into one segment", () => {
    // 0.1 → 0.5 → 0.9 : 두 번 연속 +0.4
    const result = analyzeTensionMap([
      emotionCut("a", "calm"),
      emotionCut("b", "sorrow"),
      emotionCut("c", "rage"),
    ]);
    expect(result.segments.filter((segment) => segment.kind === "rush")).toEqual([
      { kind: "rush", reason: "abrupt-rise", startIndex: 0, endIndex: 2 },
    ]);
  });
});

describe("analyzeTensionMap — climax (절정) candidates", () => {
  it("marks local maxima at or above climaxMinTension, with the strict-left plateau rule", () => {
    const result = analyzeTensionMap([
      emotionCut("a", "calm"),
      emotionCut("b", "rage"),
      emotionCut("c", "rage"), // 고원 — 첫 컷만 후보
      emotionCut("d", "calm"),
    ]);
    expect(result.segments.filter((segment) => segment.kind === "climax")).toEqual([
      { kind: "climax", reason: "peak", startIndex: 1, endIndex: 1 },
    ]);
    expect(result.cuts[1].flags).toContain("climax");
    expect(result.cuts[2].flags).not.toContain("climax");
  });

  it("allows a climax on the first and on the last cut", () => {
    const first = analyzeTensionMap([emotionCut("a", "rage"), emotionCut("b", "calm")]);
    expect(first.segments.some((s) => s.kind === "climax" && s.startIndex === 0)).toBe(true);
    const last = analyzeTensionMap([emotionCut("a", "calm"), emotionCut("b", "shock")]);
    expect(last.segments.some((s) => s.kind === "climax" && s.startIndex === 1)).toBe(true);
  });

  it("requires the minimum tension, inclusive", () => {
    // determination 0.7 == climaxMinTension → 후보. sorrow 0.5 → 후보 아님
    const at = analyzeTensionMap([emotionCut("a", "calm"), emotionCut("b", "determination"), emotionCut("c", "calm")]);
    expect(at.segments.some((s) => s.kind === "climax")).toBe(true);
    const below = analyzeTensionMap([emotionCut("a", "calm"), emotionCut("b", "sorrow"), emotionCut("c", "calm")]);
    expect(below.segments.some((s) => s.kind === "climax")).toBe(false);
  });

  it("never calls a dwell-only cut a climax, because speed alone does not show story intensity", () => {
    const result = analyzeTensionMap([dwellCut("a", 6), dwellCut("b", 1), dwellCut("c", 6)]);
    expect(result.cuts[1].tension).toBe(1);
    expect(result.segments.some((segment) => segment.kind === "climax")).toBe(false);
  });

  it("keeps only the strongest climaxMaxCount peaks, listed in reading order", () => {
    const pattern: TensionCutInput[] = [];
    // 약한 봉우리(0.7)와 강한 봉우리(0.9)를 번갈아: calm 사이에 4개의 봉우리
    for (const [index, emotion] of (["determination", "rage", "determination", "shock"] as const).entries()) {
      pattern.push(emotionCut(`low-${index}`, "calm"), emotionCut(`peak-${index}`, emotion));
    }
    const result = analyzeTensionMap(pattern);
    const climaxes = result.segments.filter((segment) => segment.kind === "climax");
    expect(climaxes).toHaveLength(rules.climaxMaxCount);
    // 0.7 짜리 둘 중 앞쪽(동률은 앞쪽 우선)만 남고, 0.9·0.85 는 모두 남는다
    expect(climaxes.map((segment) => segment.startIndex)).toEqual([1, 3, 7]);
    expect(climaxes.map((segment) => result.cuts[segment.startIndex].id)).toEqual([
      "peak-0",
      "peak-1",
      "peak-3",
    ]);
  });

  it("orders segments by start position", () => {
    const result = analyzeTensionMap([
      emotionCut("a", "calm"), emotionCut("b", "calm"), emotionCut("c", "calm"),
      emotionCut("d", "rage"),
    ]);
    expect(result.segments.map((segment) => [segment.kind, segment.startIndex])).toEqual([
      ["drag", 0],
      ["rush", 2],
      ["climax", 3],
    ]);
  });

  it("puts climax before rush when two segments start at the same cut", () => {
    // 분노 컷 셋이 모두 1.0초에 지나가면: 첫 컷은 절정 후보이면서 빠른 구간의 시작이다
    const quickRage = (id: string): TensionCutInput => ({ id, emotion: "rage", heightPx: 350 });
    const result = analyzeTensionMap([quickRage("a"), quickRage("b"), quickRage("c")]);
    expect(result.segments.map((segment) => [segment.kind, segment.startIndex])).toEqual([
      ["climax", 0],
      ["rush", 0],
    ]);
  });
});

describe("tensionCutsFromStoryboardPlan", () => {
  const script = [
    "주인공이 창가에 앉아 책을 읽는다.",
    "눈빛이 마주치는 순간 숨결이 멎는다.",
    '주인공이 "내가 막겠어!"라고 외치며 대검을 뽑아든다.',
  ].join("\n");
  const plan = new StudioAiStoryboardDirector().direct(script).cuts;

  it("maps panelHeightRatio to px with the documented reference height and assumes a fixed gutter", () => {
    const inputs = tensionCutsFromStoryboardPlan(plan);
    const { referencePanelHeightPx, assumedGutterPx } = TENSION_MAP_CONFIG.plan;
    expect(inputs.map((input) => input.id)).toEqual(["plan-1", "plan-2", "plan-3"]);
    expect(inputs.map((input) => input.heightPx)).toEqual(
      plan.map((cut) => Math.round(cut.panelHeightRatio * referencePanelHeightPx)),
    );
    expect(inputs.map((input) => input.gutterBeforePx)).toEqual([0, assumedGutterPx, assumedGutterPx]);
    expect(inputs.map((input) => input.dialogueCount)).toEqual(plan.map((cut) => (cut.dialogue ? 1 : 0)));
  });

  it("carries the director's emotion, shot scale and angle through unchanged", () => {
    const inputs = tensionCutsFromStoryboardPlan(plan);
    expect(inputs.map((input) => input.emotion)).toEqual(plan.map((cut) => cut.emotion));
    expect(inputs.map((input) => input.shotScale)).toEqual(plan.map((cut) => cut.shotScale));
    expect(inputs.map((input) => input.cameraAngle)).toEqual(plan.map((cut) => cut.cameraAngle));
    expect(inputs[0].summary).toBe(plan[0].summary);
  });

  it("ranks a shock close-up and a rage action cut above a calm reading cut", () => {
    const { cuts } = analyzeTensionMap(tensionCutsFromStoryboardPlan(plan));
    expect(cuts).toHaveLength(3);
    expect(cuts[0].tension).toBeLessThan(cuts[1].tension);
    expect(cuts[0].tension).toBeLessThan(cuts[2].tension);
  });

  it("yields an empty list for an empty plan and tolerates a non-positive ratio", () => {
    expect(tensionCutsFromStoryboardPlan([])).toEqual([]);
    const [first] = plan;
    const [input] = tensionCutsFromStoryboardPlan([{ ...first, panelHeightRatio: 0 }]);
    expect(input.heightPx).toBeUndefined();
  });
});

describe("tensionCutsFromPanels", () => {
  it("sorts top to bottom and uses the empty height between panels as the gutter", () => {
    const inputs = tensionCutsFromPanels([
      { id: "second", topY: 1200, bottomY: 1700, heightPx: 500, dialogueCount: 2 },
      { id: "first", topY: 0, bottomY: 800, heightPx: 800, dialogueCount: 0 },
      { id: "third", topY: 2000, bottomY: 2400, heightPx: 400, dialogueCount: 1 },
    ]);
    expect(inputs.map((input) => input.id)).toEqual(["first", "second", "third"]);
    expect(inputs.map((input) => input.gutterBeforePx)).toEqual([0, 400, 300]);
    expect(inputs.map((input) => input.heightPx)).toEqual([800, 500, 400]);
    expect(inputs.map((input) => input.dialogueCount)).toEqual([0, 2, 1]);
  });

  it("clamps overlapping panels to a zero gutter and breaks equal tops by id for determinism", () => {
    const inputs = tensionCutsFromPanels([
      { id: "b", topY: 0, bottomY: 600, heightPx: 600 },
      { id: "a", topY: 0, bottomY: 500, heightPx: 500 },
      { id: "c", topY: 300, bottomY: 900, heightPx: 600 },
    ]);
    expect(inputs.map((input) => input.id)).toEqual(["a", "b", "c"]);
    expect(inputs.map((input) => input.gutterBeforePx)).toEqual([0, 0, 0]);
  });

  it("follows the pacing simulator's default of one bubble when the count is missing", () => {
    const [input] = tensionCutsFromPanels([{ id: "p", topY: 0, bottomY: 100, heightPx: 100 }]);
    expect(input.dialogueCount).toBe(1);
  });

  it("has only dwell as its basis, so it never produces climax candidates", () => {
    const result = analyzeTensionMap(
      tensionCutsFromPanels(
        Array.from({ length: 6 }, (_, index) => ({
          id: `p${index}`,
          topY: index * 600,
          bottomY: index * 600 + 300,
          heightPx: 300,
          dialogueCount: 0,
        })),
      ),
    );
    expect(result.cuts.every((cut) => cut.basis.length === 1 && cut.basis[0] === "dwell")).toBe(true);
    expect(result.segments.some((segment) => segment.kind === "climax")).toBe(false);
  });
});

describe("TENSION_MAP_PARAMETERS", () => {
  it("is derived from the live config, so the on-screen table cannot drift", () => {
    const byId = new Map(TENSION_MAP_PARAMETERS.map((row) => [row.id, row]));
    expect(byId.size).toBe(TENSION_MAP_PARAMETERS.length);
    expect(byId.get("weight.emotion")?.value).toBe(String(weights.emotion));
    expect(byId.get("dwell.fast")?.value).toBe(`${dwell.fastSec}s`);
    expect(byId.get("dwell.speed")?.value).toBe(`${dwell.speedPxPerSec}px/s`);
    expect(byId.get("climax.minTension")?.value).toBe(String(rules.climaxMinTension));
  });

  it("labels only the CANVAS gutter band as sourced, never a heuristic as a fact", () => {
    const sourced = TENSION_MAP_PARAMETERS.filter((row) => row.source === "canvas-guide");
    expect(sourced.map((row) => row.id)).toEqual(["rush.exemptGutter"]);
    expect(TENSION_MAP_PARAMETERS.filter((row) => row.source === "estimate").map((row) => row.id)).toEqual([
      "dwell.speed",
      "dwell.dialogue",
    ]);
    expect(TENSION_MAP_PARAMETERS.every((row) => row.source !== undefined)).toBe(true);
  });
});
