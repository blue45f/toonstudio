// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WALKTHROUGH_PINS,
  evaluateAsyncWalkthroughButler,
} from "./production-async-walkthrough-butler-model";
import { ProductionAsyncWalkthroughButlerSuite } from "./ProductionAsyncWalkthroughButlerSuite";

afterEach(() => {
  cleanup();
});

describe("evaluateAsyncWalkthroughButler", () => {
  it("blocks automatic stage card movement while blocker pins remain unresolved", () => {
    const result = evaluateAsyncWalkthroughButler({
      clipCode: "LOOM-EP12-REV3",
      fromStageKo: "04 선화·펜선 검수",
      toStageKo: "06 명암·렌더링 인계",
      butlerMode: "auto-advance-on-zero-blocker",
      autoNotifyNextAssignee: true,
      autoUnlockMilestoneHold: true,
      pins: DEFAULT_WALKTHROUGH_PINS,
    });

    expect(result.unresolvedBlockerCount).toBe(1);
    expect(result.butlerTriggerState).toBe("waiting_on_blockers");
    expect(result.cardMovedToNextStage).toBe(false);
  });

  it("triggers Butler card movement, pings next assignee, and unlocks escrow when blockers are resolved", () => {
    const pinsWithBlockerResolved = DEFAULT_WALKTHROUGH_PINS.map((pin) =>
      pin.severity === "blocker" ? { ...pin, resolved: true } : pin,
    );

    const result = evaluateAsyncWalkthroughButler({
      clipCode: "LOOM-EP12-REV3",
      fromStageKo: "04 선화·펜선 검수",
      toStageKo: "06 명암·렌더링 인계",
      butlerMode: "auto-advance-on-zero-blocker",
      autoNotifyNextAssignee: true,
      autoUnlockMilestoneHold: true,
      pins: pinsWithBlockerResolved,
    });

    expect(result.unresolvedBlockerCount).toBe(0);
    expect(result.butlerTriggerState).toBe("triggered_card_moved");
    expect(result.cardMovedToNextStage).toBe(true);
    expect(result.assigneePinged).toBe(true);
    expect(result.milestoneTrancheUnlocked).toBe(true);
  });
});

describe("ProductionAsyncWalkthroughButlerSuite", () => {
  it("renders Loom walkthrough pins and executes Trello Butler transition when pins are resolved", () => {
    render(<ProductionAsyncWalkthroughButlerSuite />);

    expect(screen.getByTestId("production-async-walkthrough-butler-suite")).toBeDefined();
    expect(screen.getByTestId("walkthrough-butler-status-banner").textContent).toContain(
      "Trello Butler 대기",
    );

    fireEvent.click(screen.getByTestId("walkthrough-resolve-all-btn"));
    expect(screen.getByTestId("walkthrough-completion-badge").textContent).toContain("3/3 (100%)");
    expect(screen.getByTestId("walkthrough-butler-status-banner").textContent).toContain(
      "Trello Butler 자동 실행 완료",
    );
  });
});
