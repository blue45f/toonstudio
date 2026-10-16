import { describe, expect, it } from "vitest";

import { STUDIO_CHARM_POPOVER_MARGIN, planStudioCharmPopover } from "./studio-charm-popover-layout";

const trigger = { left: 20, top: 300, right: 64, bottom: 344 };

describe("참 바 팝오버 위치", () => {
  it("넓은 화면에서는 트리거 오른쪽에 놓고 화면 안에 맞춘다", () => {
    const plan = planStudioCharmPopover(trigger, { width: 1280, height: 800 });
    expect(plan.placement).toBe("right");
    expect(plan.left).toBe(trigger.right + 6);
    expect(plan.width).toBe(336);
    expect(plan.top).toBeGreaterThanOrEqual(STUDIO_CHARM_POPOVER_MARGIN);
    expect(plan.top + plan.maxHeight).toBeLessThanOrEqual(800 - STUDIO_CHARM_POPOVER_MARGIN);
  });

  it("오른쪽이 모자라면 왼쪽으로 옮기고 그래도 모자라면 가장자리에 붙인다", () => {
    const rightEdge = { left: 1200, top: 100, right: 1250, bottom: 144 };
    const plan = planStudioCharmPopover(rightEdge, { width: 1280, height: 800 });
    expect(plan.placement).toBe("left");
    expect(plan.left + plan.width).toBeLessThanOrEqual(1280 - STUDIO_CHARM_POPOVER_MARGIN);
    const tiny = planStudioCharmPopover(rightEdge, { width: 700, height: 800 }, { width: 680 });
    expect(tiny.left).toBeGreaterThanOrEqual(STUDIO_CHARM_POPOVER_MARGIN);
    expect(tiny.left + tiny.width).toBeLessThanOrEqual(700 - STUDIO_CHARM_POPOVER_MARGIN);
  });

  it("좁은 화면에서는 아래에서 올라오는 시트로 폭을 꽉 채운다", () => {
    const plan = planStudioCharmPopover(trigger, { width: 390, height: 780 });
    expect(plan.placement).toBe("sheet");
    expect(plan.left).toBe(STUDIO_CHARM_POPOVER_MARGIN);
    expect(plan.width).toBe(390 - STUDIO_CHARM_POPOVER_MARGIN * 2);
    expect(plan.top + plan.maxHeight).toBe(780 - STUDIO_CHARM_POPOVER_MARGIN);
  });

  it("낮은 화면에서도 최대 높이가 화면을 넘지 않는다", () => {
    const plan = planStudioCharmPopover({ left: 10, top: 5, right: 50, bottom: 40 }, { width: 1280, height: 300 });
    expect(plan.top).toBeGreaterThanOrEqual(STUDIO_CHARM_POPOVER_MARGIN);
    expect(plan.maxHeight).toBeLessThanOrEqual(300 - STUDIO_CHARM_POPOVER_MARGIN * 2);
  });
});
