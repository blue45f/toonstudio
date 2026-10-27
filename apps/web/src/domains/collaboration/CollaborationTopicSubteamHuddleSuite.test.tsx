// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  acknowledgeTopicReadAndTodos,
  DEFAULT_STUDIO_COLLABORATION_TOPICS,
  evaluateTopicSubteamHuddleSummary,
  toggleTopicLiveHuddle,
} from "./collaboration-topic-subteam-huddle-model";
import { CollaborationTopicSubteamHuddleSuite } from "./CollaborationTopicSubteamHuddleSuite";

afterEach(() => {
  cleanup();
});

describe("CollaborationTopicSubteamHuddleSuite (Slack + JANDI REA)", () => {
  it("computes unread read-receipts and todo completion rate across episode topic folders", () => {
    const initial = evaluateTopicSubteamHuddleSummary(DEFAULT_STUDIO_COLLABORATION_TOPICS);
    expect(initial.activeHuddleCount).toBe(2);
    expect(initial.totalUnreadReceipts).toBe(3);
    expect(initial.allReceiptsAcknowledged).toBe(false);

    const step1 = acknowledgeTopicReadAndTodos(
      DEFAULT_STUDIO_COLLABORATION_TOPICS,
      "topic-ep12-lineart-bg3d",
    );
    const step2 = acknowledgeTopicReadAndTodos(step1, "topic-ep12-color-fx");
    const afterAck = evaluateTopicSubteamHuddleSummary(step2);
    expect(afterAck.totalUnreadReceipts).toBe(0);
    expect(afterAck.allReceiptsAcknowledged).toBe(true);
    expect(afterAck.overallTodoCompletionRatePct).toBe(100);
  });

  it("toggles live huddle state and updates target cut code", () => {
    const toggled = toggleTopicLiveHuddle(
      DEFAULT_STUDIO_COLLABORATION_TOPICS,
      "topic-ep12-color-fx",
      "EP12-C050",
    );
    const topic = toggled.find((t) => t.id === "topic-ep12-color-fx")!;
    expect(topic.huddleActive).toBe(true);
    expect(topic.huddleCutCode).toBe("EP12-C050");
  });

  it("renders accessible table region and acknowledges unread receipts via UI", () => {
    render(<CollaborationTopicSubteamHuddleSuite />);

    const regions = screen.getAllByRole("region");
    expect(regions.some((region) => region.getAttribute("tabindex") === "0")).toBe(true);
    expect(screen.getByText(/미열람 지시사항 3명 대기/)).toBeTruthy();

    const ackButtons = screen.getAllByRole("button", { name: /읽음·할일 일괄 완료/ });
    expect(ackButtons.length).toBe(2);
    for (const btn of ackButtons) {
      fireEvent.click(btn);
    }

    expect(screen.getByText(/전 공정 읽음 확인 완료/)).toBeTruthy();
  });
});
