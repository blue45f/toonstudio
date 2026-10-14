import { describe, expect, it } from "vitest";

import {
  STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS,
  describeStudioReferencePickedColor,
  registerStudioReferencePickedColor,
} from "./studio-reference-picked-color";

describe("describeStudioReferencePickedColor", () => {
  it("HEX/RGB/HSV 정보를 함께 만든다", () => {
    const info = describeStudioReferencePickedColor("#FF0000");
    expect(info?.hex).toBe("#ff0000");
    expect(info?.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(info?.rgbLabel).toBe("RGB 255 · 0 · 0");
    expect(info?.hsvLabel).toBe("HSV 0° · 100% · 100%");
  });

  it("3자리 HEX도 정규화한다", () => {
    expect(describeStudioReferencePickedColor("#0f8")?.hex).toBe("#00ff88");
  });

  it("유효하지 않은 색이면 null이다", () => {
    expect(describeStudioReferencePickedColor("red")).toBeNull();
    expect(describeStudioReferencePickedColor("#12")).toBeNull();
  });
});

describe("registerStudioReferencePickedColor", () => {
  it("찍은 색을 1회 호출로 맨 앞에 등록한다", () => {
    const result = registerStudioReferencePickedColor(["#0000ff"], "#FF0000");
    expect(result.colors).toEqual(["#ff0000", "#0000ff"]);
    expect(result.added).toBe(true);
  });

  it("이미 있는 색은 중복 없이 최신으로만 옮긴다", () => {
    const result = registerStudioReferencePickedColor(["#ff0000", "#0000ff"], "#0000FF");
    expect(result.colors).toEqual(["#0000ff", "#ff0000"]);
    expect(result.added).toBe(false);
  });

  it("입력 배열을 변형하지 않고 상한을 지킨다", () => {
    const current = Array.from({ length: STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS }, (_, i) =>
      `#${String(i).padStart(6, "0")}`,
    );
    const result = registerStudioReferencePickedColor(current, "#ffffff");
    expect(result.colors).toHaveLength(STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS);
    expect(result.colors[0]).toBe("#ffffff");
    expect(current).toHaveLength(STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS);
    expect(current[0]).toBe("#000000");
  });

  it("유효하지 않은 색은 목록을 바꾸지 않는다", () => {
    const result = registerStudioReferencePickedColor(["#ff0000"], "oops");
    expect(result.colors).toEqual(["#ff0000"]);
    expect(result.added).toBe(false);
  });
});
