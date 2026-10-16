import { describe, expect, it } from "vitest";

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { STUDIO_PROJECT_MAX_CANVAS_HEIGHT, STUDIO_PROJECT_MAX_PAGES } from "../studio-project-file";
import {
  PANEL_REFLOW_PAGE_TARGET_HEIGHT,
  PANEL_REFLOW_STANDARD_GAP,
  PANEL_REFLOW_STUDIO_LIMITS,
  PANEL_REFLOW_WIDTH_PRESETS,
  PanelReflowError,
  buildReflowLossReport,
  coveredShare,
  planPanelReflow,
  reflowLossNeedsConfirmation,
  type PanelReflowOptions,
  type ReflowSourcePanel,
} from "./panel-reflow-plan";

const panel = (id: string, x: number, y: number, width: number, height: number): ReflowSourcePanel => ({ id, x, y, width, height });
const options = (overrides: Partial<PanelReflowOptions> = {}): PanelReflowOptions => ({
  targetWidth: 720,
  gap: PANEL_REFLOW_STANDARD_GAP,
  scaleMode: "fit-width",
  ...overrides,
});

describe("재배열 계획 — 상수 정합", () => {
  it("복제한 Studio 한도와 문서 폭이 정본과 같다", () => {
    expect(PANEL_REFLOW_STUDIO_LIMITS.maxCanvasHeight).toBe(STUDIO_PROJECT_MAX_CANVAS_HEIGHT);
    expect(PANEL_REFLOW_STUDIO_LIMITS.maxPages).toBe(STUDIO_PROJECT_MAX_PAGES);
    expect(PANEL_REFLOW_WIDTH_PRESETS.map((preset) => preset.width)).toEqual([720, 690]);
    expect(STUDIO_CANVAS_WIDTH).toBe(720);
  });
});

describe("재배열 계획 — 배치", () => {
  it("폭에 맞춤: 모든 컷이 규격 폭이 되고 컷 사이에 표준 여백이 들어간다", () => {
    const plan = planPanelReflow([panel("a", 0, 0, 1440, 1000), panel("b", 0, 1100, 360, 400)], options());
    expect(plan.placements.map((placement) => placement.dest)).toEqual([
      { x: 0, y: 0, width: 720, height: 500 },
      { x: 0, y: 580, width: 720, height: 800 },
    ]);
    expect(plan.placements.map((placement) => placement.scale)).toEqual([0.5, 2]);
    expect(plan.totalHeight).toBe(1380);
    expect(plan.pages).toHaveLength(1);
    expect(plan.minScale).toBe(0.5);
    expect(plan.maxScale).toBe(2);
    expect(plan.documentOffsetX).toBe(0);
  });

  it("원본 크기 유지: 큰 컷만 줄이고 작은 컷은 확대하지 않고 가운데 정렬한다", () => {
    const plan = planPanelReflow([panel("a", 0, 0, 1440, 1000), panel("b", 0, 1100, 400, 300)], options({ scaleMode: "keep-size", gap: 40 }));
    expect(plan.placements[0].dest).toEqual({ x: 0, y: 0, width: 720, height: 500 });
    expect(plan.placements[1].dest).toEqual({ x: 160, y: 540, width: 400, height: 300 });
    expect(plan.maxScale).toBe(1);
  });

  it("690 폭은 720 문서 안에서 15px 가운데 정렬 오프셋을 가진다", () => {
    const plan = planPanelReflow([panel("a", 0, 0, 690, 400)], options({ targetWidth: 690, gap: 0 }));
    expect(plan.documentOffsetX).toBe(15);
    expect(plan.placements[0].dest).toEqual({ x: 0, y: 0, width: 690, height: 400 });
  });

  it("높이가 기준을 넘기 전에 컷 경계에서만 페이지를 나누고, 페이지 맨 위에는 여백을 두지 않는다", () => {
    const panels = Array.from({ length: 5 }, (_, index) => panel(`p${index}`, 0, index * 2000, 720, 1500));
    const plan = planPanelReflow(panels, options({ pageHeight: 4000, gap: 100 }));
    expect(plan.pages.map((page) => page.placements.map((placement) => placement.panelId))).toEqual([
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4"],
    ]);
    expect(plan.pages.map((page) => page.height)).toEqual([3100, 3100, 1500]);
    expect(plan.pages.every((page) => page.placements[0].dest.y === 0)).toBe(true);
    expect(plan.placements.map((placement) => placement.page)).toEqual([0, 0, 1, 1, 2]);
    expect(plan.totalHeight).toBe(7700);
  });

  it("기준 높이보다 큰 컷은 혼자 한 페이지를 쓴다", () => {
    const plan = planPanelReflow([panel("a", 0, 0, 720, 500), panel("tall", 0, 600, 720, 9000), panel("b", 0, 9700, 720, 300)], options());
    expect(plan.pages.map((page) => page.placements.map((placement) => placement.panelId))).toEqual([["a"], ["tall"], ["b"]]);
    expect(PANEL_REFLOW_PAGE_TARGET_HEIGHT).toBeLessThan(9000);
  });

  it("배율을 적용한 컷 하나가 문서 최대 높이를 넘으면 거절한다", () => {
    expect(() => planPanelReflow([panel("huge", 0, 0, 100, 20_000)], options())).toThrowError(
      expect.objectContaining({ code: "panel-too-tall" }),
    );
  });

  it("컷이 없거나 옵션이 잘못되면 PanelReflowError 로 거절한다", () => {
    expect(() => planPanelReflow([], options())).toThrowError(expect.objectContaining({ code: "no-panels" }));
    const one = [panel("a", 0, 0, 100, 100)];
    expect(() => planPanelReflow(one, options({ targetWidth: 800 as never }))).toThrow(PanelReflowError);
    expect(() => planPanelReflow(one, options({ gap: -1 }))).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => planPanelReflow(one, options({ gap: 1.5 }))).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => planPanelReflow(one, options({ scaleMode: "stretch" as never }))).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => planPanelReflow(one, options({ pageHeight: 100 }))).toThrowError(expect.objectContaining({ code: "invalid-options" }));
  });

  it("컷 사각형이 NaN·Infinity·음수 좌표·0 이하 크기이면 계획을 만들지 않고 몇 번째 컷인지 알린다", () => {
    const ok = panel("ok", 0, 0, 100, 100);
    const bad = (rect: Partial<ReflowSourcePanel>): ReflowSourcePanel => ({ ...panel("bad", 0, 0, 100, 100), ...rect });
    const invalid: Array<readonly [string, ReflowSourcePanel]> = [
      ["NaN 너비", bad({ width: Number.NaN })],
      ["NaN 높이", bad({ height: Number.NaN })],
      ["NaN 좌표", bad({ x: Number.NaN })],
      ["무한 높이", bad({ height: Number.POSITIVE_INFINITY })],
      ["0 너비", bad({ width: 0 })],
      ["음수 높이", bad({ height: -5 })],
      ["음수 좌표", bad({ y: -1 })],
    ];
    for (const scaleMode of ["fit-width", "keep-size"] as const) {
      for (const [label, rect] of invalid) {
        expect(() => planPanelReflow([ok, rect], options({ scaleMode })), `${label}/${scaleMode}`).toThrowError(
          expect.objectContaining({ code: "invalid-panel", message: expect.stringContaining("2번 컷") }),
        );
      }
    }
    // 소수 좌표·크기는 유한하고 양수이므로 그대로 계획된다(편집 모델이 정수로 다듬지만 계획 함수가 요구하지는 않는다).
    expect(() => planPanelReflow([panel("frac", 0.5, 0.5, 99.5, 99.5)], options())).not.toThrow();
  });

  it("전체 출력 픽셀과 페이지 수 상한을 지킨다", () => {
    const many = Array.from({ length: 900 }, (_, index) => panel(`p${index}`, 0, 0, 720, 9_000));
    expect(() => planPanelReflow(many, options({ pageHeight: 9_000, gap: 0 }))).toThrowError(
      expect.objectContaining({ code: expect.stringMatching(/too-many-pages|output-too-large/u) }),
    );
  });
});

describe("재배열 계획 — 손실·변경 보고", () => {
  const sourceWidth = 1440;
  const sourceHeight = 2000;

  function report(panels: readonly ReflowSourcePanel[], overrides: Partial<PanelReflowOptions> = {}, extra: { undetectable?: number; ignored?: number; low?: number; format?: "png" | "webp"; transparent?: boolean } = {}) {
    return buildReflowLossReport({
      plan: planPanelReflow(panels, options(overrides)),
      sourceWidth,
      sourceHeight,
      format: extra.format ?? "png",
      undetectableCount: extra.undetectable ?? 0,
      ignoredCount: extra.ignored ?? 0,
      lowConfidenceCount: extra.low ?? 0,
      ...(extra.transparent === undefined ? {} : { transparentSource: extra.transparent }),
    });
  }
  const codes = (items: ReturnType<typeof report>): string[] => items.map((item) => item.code);

  it("항상 원본 무변경을 알리고, 무손실 재저장은 확인 불필요로 본다", () => {
    const items = report([panel("a", 0, 0, 1440, 2000)], { targetWidth: 720 });
    expect(codes(items)).toEqual(["source-untouched", "downscaled", "recompressed-lossless"]);
    expect(reflowLossNeedsConfirmation(items)).toBe(false);
  });

  it("확대·컷 밖 영역·손실 압축·겹침·검출 불가·낮은 신뢰도는 모두 확인이 필요한 경고다", () => {
    const items = report(
      [panel("a", 0, 0, 360, 500), panel("b", 300, 400, 360, 500)],
      {},
      { undetectable: 2, ignored: 1, low: 1, format: "webp" },
    );
    expect(codes(items)).toEqual([
      "source-untouched",
      "outside-cuts-dropped",
      "upscaled",
      "recompressed-lossy",
      "cuts-overlap",
      "undetectable-excluded",
      "ignored-excluded",
      "low-confidence-cuts",
    ]);
    expect(items.find((item) => item.code === "upscaled")?.values).toEqual({ count: 2, maxScale: 2 });
    expect(items.find((item) => item.code === "undetectable-excluded")?.severity).toBe("warning");
    expect(items.find((item) => item.code === "ignored-excluded")?.severity).toBe("info");
    expect(reflowLossNeedsConfirmation(items)).toBe(true);
  });

  it("투명한 여백이 있는 원고는 결과가 투명하지 않고 바탕색으로 채워진다고 알리며, 확인이 필요한 경고다", () => {
    const whole = [panel("a", 0, 0, 1440, 2000)];
    const plain = report(whole, { targetWidth: 720 });
    expect(codes(plain)).not.toContain("transparency-flattened");
    expect(codes(report(whole, { targetWidth: 720 }, { transparent: false }))).not.toContain("transparency-flattened");
    const items = report(whole, { targetWidth: 720 }, { transparent: true });
    // 무손실 재저장 바로 뒤에 놓이고, 이것 하나만으로도 삽입·내려받기 전에 확인을 요구한다.
    expect(codes(items)).toEqual(["source-untouched", "downscaled", "recompressed-lossless", "transparency-flattened"]);
    expect(items.find((item) => item.code === "transparency-flattened")).toEqual({ code: "transparency-flattened", severity: "warning", values: {} });
    expect(reflowLossNeedsConfirmation(plain)).toBe(false);
    expect(reflowLossNeedsConfirmation(items)).toBe(true);
  });

  it("컷 밖 영역 비율은 겹침을 한 번만 세어 계산한다", () => {
    const covered = coveredShare([panel("a", 0, 0, 100, 100), panel("b", 50, 50, 100, 100)], 200, 200);
    expect(covered).toBeCloseTo((10_000 + 10_000 - 2_500) / 40_000, 6);
    expect(coveredShare([], 100, 100)).toBe(0);
    expect(coveredShare([panel("all", 0, 0, 100, 100)], 100, 100)).toBe(1);
  });

  it("페이지를 나누거나 690 폭이면 알리고, 컷이 원본을 모두 덮으면 컷 밖 경고는 없다", () => {
    const items = report(
      [panel("a", 0, 0, 1440, 1000), panel("b", 0, 1000, 1440, 1000)],
      { targetWidth: 690, pageHeight: 500, gap: 10 },
    );
    expect(codes(items)).toContain("split-into-pages");
    expect(codes(items)).toContain("centered-in-document");
    expect(codes(items)).not.toContain("outside-cuts-dropped");
  });
});
