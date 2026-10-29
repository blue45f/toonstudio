import { describe, expect, it } from "vitest";

import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { withAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import { buildStudioVrmExpressionPreviews } from "./studio-vrm-generate-expression-preview";
import { addStudioVrmCustomExpression } from "./studio-vrm-generate-expressions";
import { studioVrmThumbnailFit } from "./studio-vrm-generate-thumbnail";

/** path 데이터의 모든 Y 좌표 범위. SVG 좌표라 위가 작은 값이다. */
function verticalSpan(path: string): number {
  const ys = [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/gu)].map((match) => Number(match[2]));
  return Math.max(...ys) - Math.min(...ys);
}

describe("buildStudioVrmExpressionPreviews", () => {
  const state = createAvatarForgeState("soft-bob");

  it("flattens the eyes for blink and leaves the neutral face open", () => {
    const [neutral, blink] = buildStudioVrmExpressionPreviews(state, [null, "blink"]);
    expect(neutral.hasExpression).toBe(false);
    expect(blink.hasExpression).toBe(true);
    // 흰자 색 묶음은 기본 얼굴에서 가장 큰 세로 폭을 가진 눈 패치다.
    const eyeWhite = (shapes: typeof neutral.shapes) => shapes.find((shape) => shape.color === "#ffffff") ?? shapes[0];
    expect(verticalSpan(eyeWhite(blink.shapes).path)).toBeLessThan(verticalSpan(eyeWhite(neutral.shapes).path));
  });

  it("previews a custom expression baked from the authoring state", () => {
    const { authoring } = addStudioVrmCustomExpression(undefined, "shock");
    const shocked = withAvatarForgeVrmAuthoring(state, { expressions: authoring });
    const [neutral, shock] = buildStudioVrmExpressionPreviews(shocked, [null, "shock"]);
    expect(shock.hasExpression).toBe(true);
    expect(shock.shapes.map((shape) => shape.path).join("")).not.toBe(
      neutral.shapes.map((shape) => shape.path).join(""),
    );
    // 모르는 표정은 무표정으로 그린다.
    expect(buildStudioVrmExpressionPreviews(state, ["shock"])[0].hasExpression).toBe(false);
  });

  it("frames the head with a margin in millimetres", () => {
    const [preview] = buildStudioVrmExpressionPreviews(state, [null]);
    const [x, y, width, height] = preview.viewBox.split(" ").map(Number);
    expect(x).toBeLessThan(-preview.head.rx);
    expect(y).toBeLessThan(-preview.head.ry);
    expect(width).toBeGreaterThan(preview.head.rx * 2);
    expect(height).toBeGreaterThan(preview.head.ry * 2);
    expect(preview.shapes.length).toBeGreaterThan(3);
  });
});

describe("studioVrmThumbnailFit", () => {
  it("letterboxes the portrait preview into a square", () => {
    const fit = studioVrmThumbnailFit(160, 200, 1024, "contain");
    const expected = { sx: 0, sy: 0, sw: 160, sh: 200, dx: 102.4, dy: 0, dw: 819.2, dh: 1024 };
    for (const [key, value] of Object.entries(expected)) {
      expect(fit[key as keyof typeof fit], key).toBeCloseTo(value, 9);
    }
  });

  it("centre-crops a landscape image to fill the square", () => {
    expect(studioVrmThumbnailFit(800, 600, 600, "cover")).toEqual({
      sx: 100, sy: 0, sw: 600, sh: 600, dx: 0, dy: 0, dw: 600, dh: 600,
    });
  });
});
