import { describe, expect, it } from "vitest";

import {
  buildDropHighlightSpec,
  buildStrokeRippleSpec,
  buildToolFlashSpec,
  isVisualFxDurationValid,
} from "./studio-interaction-visual-fx";

describe("studio-interaction-visual-fx", () => {
  it("스트로크 리플 스펙을 만든다", () => {
    const spec = buildStrokeRippleSpec(10, 20);
    expect(spec?.kind).toBe("ripple");
    expect(spec?.x).toBe(10);
    expect(spec?.y).toBe(20);
    expect(spec?.durationMs).toBe(300);
  });

  it("무효 좌표·빈 id는 null이다", () => {
    expect(buildStrokeRippleSpec(Number.NaN, 20)).toBeNull();
    expect(buildDropHighlightSpec("")).toBeNull();
    expect(buildToolFlashSpec("")).toBeNull();
  });

  it("드롭 하이라이트와 툴 플래시 스펙을 만든다", () => {
    expect(buildDropHighlightSpec("layer-1")).toEqual({
      kind: "highlight",
      targetId: "layer-1",
      durationMs: 400,
    });
    expect(buildToolFlashSpec("brush")).toEqual({
      kind: "flash",
      toolId: "brush",
      durationMs: 200,
    });
  });

  it("지속시간 상한은 1,000ms이다", () => {
    expect(isVisualFxDurationValid(1000)).toBe(true);
    expect(isVisualFxDurationValid(1001)).toBe(false);
    expect(isVisualFxDurationValid(0)).toBe(false);
  });
});
