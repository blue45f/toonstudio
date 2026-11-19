// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioP2pActivitiesPanel } from "./StudioP2pActivitiesPanel";

import type { StudioP2pCreativeHuddleController } from "./studio-p2p-creative-huddle-controller";

afterEach(() => {
  cleanup();
});

function createMockController(): StudioP2pCreativeHuddleController {
  return {
    snapshot: () => ({
      peers: [
        {
          participant: { sessionId: "peer-1", displayName: "지민", role: "editor" },
        },
      ],
      activities: [
        {
          owner: "self-1",
          self: true,
          challenge: {
            title: "크로키 5분",
            prompt: "동세 중심으로 빠르게 선을 잡아보세요.",
            running: true,
            remainingMs: 125_000,
          },
          poll: {
            question: "어떤 구도가 더 좋을까요?",
            options: ["A안", "B안"],
            counts: [2, 1],
            voters: 3,
            myChoice: 0,
          },
        },
      ],
    }),
    subscribe: () => () => undefined,
    startChallenge: vi.fn(),
    toggleChallenge: vi.fn(),
    clearChallenge: vi.fn(),
    createPoll: vi.fn(),
    vote: vi.fn(),
    clearPoll: vi.fn(),
  } as unknown as StudioP2pCreativeHuddleController;
}

describe("StudioP2pActivitiesPanel mobile UX & Korean typography", () => {
  it("renders responsive mobile poll grid, break-keep copy, and tabular-nums vote/timer counts", () => {
    const controller = createMockController();
    const { container } = render(<StudioP2pActivitiesPanel controller={controller} />);

    const details = container.querySelector('[data-studio-p2p-activities="true"]');
    expect(details?.className).toContain("break-keep");

    const summary = screen.getByText("함께 그리기·투표");
    fireEvent.click(summary);

    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("tabular-nums");
    expect(timer.textContent).toContain("2:05");

    const optionButton = screen.getByRole("button", { name: /A안 · 2표/u });
    expect(optionButton.className).toContain("tabular-nums");
    fireEvent.click(optionButton);
    expect(controller.vote).toHaveBeenCalledWith("self-1", 0);
  });
});
