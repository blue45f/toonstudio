import { describe, expect, it } from "vitest";

import {
  draftFeedbackChannelForStage,
  evaluatePinFeedbackPacket,
  pinFeedbackPacketFromGateDecision,
  type PinFeedbackPacket,
} from "./draft-pin-feedback-model";
import type { StageGateDecision } from "./stage-consensus-gate-model";

function packet(partial: Partial<PinFeedbackPacket> = {}): PinFeedbackPacket {
  return { body: "표정을 더 날카롭게", pinThreadId: "t-1", referenceAssetIds: ["ref-1"], ...partial };
}

describe("draft pin feedback", () => {
  it("routes drawing-stage feedback to pin-first and text-stage feedback to pin-or-text", () => {
    expect(draftFeedbackChannelForStage("storyboard")).toBe("pin-first");
    expect(draftFeedbackChannelForStage("art")).toBe("pin-first");
    expect(draftFeedbackChannelForStage("plan")).toBe("pin-or-text");
    expect(draftFeedbackChannelForStage("review")).toBe("pin-or-text");
  });

  it("blocks a pin-less packet at the storyboard stage but allows it (with guidance) at review", () => {
    const noPin = packet({ pinThreadId: null });
    const atStoryboard = evaluatePinFeedbackPacket(noPin, "storyboard");
    expect(atStoryboard.submittable).toBe(false);
    expect(atStoryboard.missing).toContain("pin");

    const atReview = evaluatePinFeedbackPacket(noPin, "review");
    expect(atReview.submittable).toBe(true);
    expect(atReview.guidance.length).toBeGreaterThan(0);
  });

  it("always requires a body, and only recommends a reference", () => {
    const noBody = evaluatePinFeedbackPacket(packet({ body: " " }), "storyboard");
    expect(noBody.submittable).toBe(false);
    expect(noBody.missing).toContain("body");

    const noReference = evaluatePinFeedbackPacket(packet({ referenceAssetIds: [] }), "storyboard");
    expect(noReference.submittable).toBe(true);
    expect(noReference.missing).toEqual(["reference"]);
  });

  it("reads a stage-gate rejection as the same packet (reason = what, first pin = where)", () => {
    const decision: StageGateDecision = {
      reviewerId: "lead-1",
      reviewerName: "리드",
      role: "lead",
      value: "request-changes",
      reason: "무게감이 부족해요",
      conditions: [],
      pinThreadIds: ["t-7", "t-8"],
      decidedAt: "2026-10-14T09:00:00.000Z",
    };
    const fromGate = pinFeedbackPacketFromGateDecision(decision);
    expect(fromGate).toEqual({ body: "무게감이 부족해요", pinThreadId: "t-7", referenceAssetIds: [] });
    expect(evaluatePinFeedbackPacket(fromGate, "art").submittable).toBe(true);
  });
});
