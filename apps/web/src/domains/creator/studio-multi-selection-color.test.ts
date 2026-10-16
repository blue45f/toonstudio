import { describe, expect, it } from "vitest";

import {
  applyStudioMultiSelectionStrokeColor,
  applyStudioMultiSelectionStrokeWidth,
  clampStudioMultiSelectionStrokeWidth,
  resolveStudioMultiSelectionStrokeColor,
  resolveStudioMultiSelectionStrokeWidth,
  STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX,
  STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN,
} from "./studio-multi-selection-color";

import type { DrawEl, El, FrameEl, ImageEl, TextEl } from "./studio-element-model";

function draw(id: string, stroke: string): DrawEl {
  return {
    id,
    type: "draw",
    points: [0, 0, 20, 20],
    mode: "pen",
    brush: "pen",
    stroke,
    strokeWidth: 3,
  } as DrawEl;
}

function text(id: string, stroke?: string): TextEl {
  return {
    id,
    type: "text",
    text: id,
    x: 0,
    y: 0,
    width: 120,
    fontSize: 24,
    fill: "#111111",
    rotation: 0,
    stroke,
  };
}

function frame(id: string, stroke?: string): FrameEl {
  return {
    id,
    type: "frame",
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    stroke,
  };
}

function image(id: string): ImageEl {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,AA==",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
  } as ImageEl;
}

describe("multi-selection stroke colors", () => {
  it("reports one shared color without a mixed state", () => {
    const state = resolveStudioMultiSelectionStrokeColor(
      [draw("a", "#ABCDEF"), text("b", "#abcdef")],
      ["a", "b"],
    );

    expect(state).toMatchObject({
      value: "#abcdef",
      mixed: false,
      includesNone: false,
    });
    expect(state.targets).toHaveLength(2);
  });

  it("exposes a representative color while marking mixed and none members", () => {
    const state = resolveStudioMultiSelectionStrokeColor(
      [draw("a", "transparent"), text("b", "#654321"), image("c")],
      ["a", "b", "c"],
    );

    expect(state).toMatchObject({
      value: "#654321",
      mixed: true,
      includesNone: true,
    });
    expect(state.targets.map((target) => target.id)).toEqual(["a", "b"]);
  });

  it("applies one color only to selected stroke-capable elements", () => {
    const outside = frame("outside", "#999999");
    const picture = image("picture");
    const elements: El[] = [draw("a", "#111111"), text("b"), picture, outside];
    const next = applyStudioMultiSelectionStrokeColor(elements, ["a", "b", "picture"], "#224466");

    expect(next[0]).toMatchObject({ stroke: "#224466", strokeWidth: 3 });
    expect(next[1]).toMatchObject({ stroke: "#224466", strokeWidth: 3 });
    expect(next[2]).toBe(picture);
    expect(next[3]).toBe(outside);
  });

  it("uses transparent for draw none and undefined for semantic outlines", () => {
    const elements: El[] = [
      draw("draw", "#111111"),
      text("text", "#222222"),
      frame("frame", "#333333"),
    ];
    const next = applyStudioMultiSelectionStrokeColor(
      elements,
      ["draw", "text", "frame"],
      null,
    );

    expect(next[0]).toMatchObject({ stroke: "transparent" });
    expect((next[1] as TextEl).stroke).toBeUndefined();
    expect((next[2] as FrameEl).stroke).toBeUndefined();
  });
});

describe("multi-selection stroke widths", () => {
  it("targets only elements whose stroke is visible, with 3px as the implicit width", () => {
    const withoutWidth = frame("frame", "#333333");
    const state = resolveStudioMultiSelectionStrokeWidth(
      [withoutWidth, text("none"), draw("transparent", "transparent"), image("picture")],
      ["frame", "none", "transparent", "picture"],
    );

    expect(state.targets.map((target) => target.id)).toEqual(["frame"]);
    expect(state).toMatchObject({ value: 3, mixed: false, max: STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX });
  });

  it("reports no value and no mix when nothing selected shows a stroke", () => {
    expect(resolveStudioMultiSelectionStrokeWidth([text("a"), image("b")], ["a", "b"])).toEqual({
      targets: [],
      value: null,
      mixed: false,
      max: STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX,
    });
  });

  it("marks mixed widths and uses the first as the representative value", () => {
    const thick = { ...draw("thick", "#111111"), strokeWidth: 5.5 } as El;
    const state = resolveStudioMultiSelectionStrokeWidth([draw("a", "#111111"), thick], ["a", "thick"]);

    expect(state).toMatchObject({ value: 3, mixed: true });
  });

  it("raises the slider ceiling to the thickest existing line so touching it never thins that line silently", () => {
    const brush = { ...draw("brush", "#111111"), strokeWidth: 40.2 } as El;
    const state = resolveStudioMultiSelectionStrokeWidth([brush, frame("f", "#222222")], ["brush", "f"]);

    expect(state.max).toBe(41);
    const next = applyStudioMultiSelectionStrokeWidth([brush], ["brush"], 40.5, state.max);
    expect((next[0] as DrawEl).strokeWidth).toBe(40.5);
  });

  it("applies one width to visible-stroke members only and keeps the others by reference", () => {
    const outside = frame("outside", "#999999");
    const picture = image("picture");
    const noStroke = text("no-stroke");
    const elements: El[] = [draw("a", "#111111"), frame("b", "#222222"), noStroke, picture, outside];
    const next = applyStudioMultiSelectionStrokeWidth(elements, ["a", "b", "no-stroke", "picture"], 7);

    expect(next[0]).toMatchObject({ strokeWidth: 7 });
    expect(next[1]).toMatchObject({ strokeWidth: 7 });
    expect(next[2]).toBe(noStroke);
    expect(next[3]).toBe(picture);
    expect(next[4]).toBe(outside);
  });

  it("snaps to half pixels and clamps to the slider range", () => {
    expect(clampStudioMultiSelectionStrokeWidth(2.74)).toBe(2.5);
    expect(clampStudioMultiSelectionStrokeWidth(2.76)).toBe(3);
    expect(clampStudioMultiSelectionStrokeWidth(0)).toBe(STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN);
    expect(clampStudioMultiSelectionStrokeWidth(-4)).toBe(STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN);
    expect(clampStudioMultiSelectionStrokeWidth(99)).toBe(STUDIO_MULTI_SELECTION_STROKE_WIDTH_MAX);
    expect(clampStudioMultiSelectionStrokeWidth(Number.NaN)).toBe(3);
    expect(clampStudioMultiSelectionStrokeWidth(99, 48)).toBe(48);
  });

  it("returns an unchanged copy when every target already has that width", () => {
    const elements: El[] = [{ ...draw("a", "#111111"), strokeWidth: 4 } as El, { ...frame("b", "#222222"), strokeWidth: 4 } as El];
    const next = applyStudioMultiSelectionStrokeWidth(elements, ["a", "b"], 4);

    expect(next).not.toBe(elements);
    expect(next.every((element, index) => element === elements[index])).toBe(true);
  });

  it("does not touch stroke colors", () => {
    const elements: El[] = [draw("a", "#abcdef")];
    const next = applyStudioMultiSelectionStrokeWidth(elements, ["a"], 9);

    expect(next[0]).toMatchObject({ stroke: "#abcdef", strokeWidth: 9 });
  });
});
