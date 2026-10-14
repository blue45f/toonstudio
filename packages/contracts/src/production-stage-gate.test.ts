import { describe, expect, it } from "vitest";

import {
  normalizeStageGateConditions,
  stageGateRecordId,
  validateStageGateDecisionForStorage,
} from "./production-stage-gate";

describe("stage gate storage contract", () => {
  it("builds the same deterministic id as the client model", () => {
    expect(stageGateRecordId("ep-1", "plan")).toBe("stage-gate:ep-1:plan");
    expect(stageGateRecordId("ep-1", "art")).toBe("stage-gate:ep-1:art");
  });

  it("rejects a rejection without a reason, like the client validator", () => {
    expect(validateStageGateDecisionForStorage({ value: "request-changes", reason: "  ", conditions: [] }))
      .toEqual(["reason-required"]);
    expect(validateStageGateDecisionForStorage({ value: "veto", reason: "", conditions: [] }))
      .toEqual(["reason-required"]);
    expect(validateStageGateDecisionForStorage({ value: "request-changes", reason: "톤이 가벼워요", conditions: [] }))
      .toEqual([]);
  });

  it("rejects conditional approval without real conditions", () => {
    expect(validateStageGateDecisionForStorage({ value: "approve-with-conditions", reason: "", conditions: [] }))
      .toEqual(["conditions-required"]);
    expect(validateStageGateDecisionForStorage({ value: "approve-with-conditions", reason: "", conditions: [" ", ""] }))
      .toEqual(["conditions-required"]);
    expect(validateStageGateDecisionForStorage({ value: "approve-with-conditions", reason: "", conditions: ["말풍선 정리"] }))
      .toEqual([]);
  });

  it("does not require a reason for approval or abstention", () => {
    expect(validateStageGateDecisionForStorage({ value: "approve", reason: "", conditions: [] })).toEqual([]);
    expect(validateStageGateDecisionForStorage({ value: "abstain", reason: "", conditions: [] })).toEqual([]);
  });

  it("normalizes conditions by trimming and dropping blanks", () => {
    expect(normalizeStageGateConditions(["  앞부분 속도  ", "", "  ", "금지 표현 제거"]))
      .toEqual(["앞부분 속도", "금지 표현 제거"]);
  });
});
