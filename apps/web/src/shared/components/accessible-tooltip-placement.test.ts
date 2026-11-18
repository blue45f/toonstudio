import { describe, expect, it } from "vitest";

import { resolveTooltipPlacement, tooltipArrowStyle, tooltipSideStyle } from "./accessible-tooltip-placement";

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});
const viewport = { left: 0, top: 0, width: 1440, height: 900 };
const popup = { width: 200, height: 64 };

describe("도움말 배치와 인접 도구의 클릭 영역", () => {
  it("세로 레일의 다음 버튼 위가 아니라 레일 오른쪽에 표시한다", () => {
    const anchor = rect(16, 180, 48, 48), nextTool = rect(16, 232, 48, 48);
    const result = resolveTooltipPlacement({ anchor, popup, viewport, preferredSide: "right" });
    expect(result.side).toBe("right");
    expect(result.left).toBeGreaterThan(nextTool.right);
    expect(result.top).toBe(172);
    expect(result.arrowOffset).toBe(32);
  });

  it("오른쪽 공간이 없으면 컨트롤을 덮는 clamp 대신 왼쪽으로 옮긴다", () => {
    const anchor = rect(1360, 180, 48, 48);
    const result = resolveTooltipPlacement({ anchor, popup, viewport, preferredSide: "right" });
    expect(result.side).toBe("left");
    expect(result.left + popup.width).toBeLessThan(anchor.left);
    expect(result.left).toBeGreaterThanOrEqual(10);
  });

  it("왼쪽 선호도와 visual viewport의 이동·하단 경계를 함께 지킨다", () => {
    const anchor = rect(44, 650, 48, 48);
    const result = resolveTooltipPlacement({ anchor, popup,
      viewport: { left: 30, top: 40, width: 600, height: 660 }, preferredSide: "left" });
    expect(result.side).toBe("right");
    expect(result.top + popup.height).toBe(690);
    expect(result.left).toBeGreaterThan(anchor.right);
  });

  it("열린 팝업도 측면의 장애물로 계산한다", () => {
    const result = resolveTooltipPlacement({ anchor: rect(16, 180, 48, 48), popup, viewport,
      controlledPopup: rect(16, 150, 300, 300), preferredSide: "right" });
    expect(result.side).toBe("right");
    expect(result.left).toBe(326);
  });

  it("양쪽 공간이 없는 좁은 화면은 기존 위·아래 배치와 화면 여백을 유지한다", () => {
    const result = resolveTooltipPlacement({ anchor: rect(136, 180, 48, 48), popup,
      viewport: { left: 0, top: 0, width: 320, height: 592 }, preferredSide: "right" });
    expect(result.side).toBe("bottom");
    expect(result.left).toBeGreaterThanOrEqual(10);
    expect(result.left + popup.width).toBeLessThanOrEqual(310);
  });

  it("일반 컨트롤은 열린 아래 팝업을 피해 기존 상단 배치를 사용한다", () => {
    const result = resolveTooltipPlacement({ anchor: rect(100, 400, 48, 48), popup, viewport,
      controlledPopup: rect(100, 448, 240, 200) });
    expect(result.side).toBe("top");
    expect(result.top + popup.height).toBe(390);
  });

  it("측면의 화살표와 애니메이션만 맞추고 위·아래 CSS를 덮어쓰지 않는다", () => {
    expect(tooltipSideStyle("top")).toBeUndefined();
    expect(tooltipArrowStyle({ side: "bottom", top: 0, left: 0, arrowOffset: 25 })).toBeUndefined();
    expect(tooltipSideStyle("right")).toMatchObject({ transformOrigin: "left center" });
    expect(tooltipArrowStyle({ side: "left", top: 0, left: 0, arrowOffset: 25 }))
      .toMatchObject({ top: 20, left: "auto", right: -5, borderRightWidth: 1 });
  });
});
