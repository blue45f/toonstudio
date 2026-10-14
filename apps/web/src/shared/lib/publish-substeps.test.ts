import { describe, expect, it } from "vitest";

import {
  derivePublishSubsteps,
  publishSubstepPosition,
  publishSubstepProgress,
  PUBLISH_SUBSTEP_ORDER,
  PUBLISH_SUBSTEPS,
} from "./publish-substeps";

describe("publish substeps (S2-4 nested inside the Publish stage)", () => {
  it("keeps the command center's three procedures, in order", () => {
    expect(PUBLISH_SUBSTEP_ORDER).toEqual(["content", "distribution", "review"]);
    expect(PUBLISH_SUBSTEPS.map((step) => step.label.ko)).toEqual([
      "원고",
      "게시 설정",
      "최종 확인",
    ]);
  });

  it.each([
    ["content", ["current", "todo", "todo"], 1],
    ["distribution", ["done", "current", "todo"], 2],
    ["review", ["done", "done", "current"], 3],
  ] as const)("active %s derives statuses and reads as 게시 단계 안의 n/3", (active, expected, position) => {
    const states = derivePublishSubsteps(active);
    expect(states.map((state) => state.status)).toEqual(expected);
    const progress = publishSubstepProgress(states);
    expect(progress.position).toBe(position);
    expect(progress.total).toBe(3);
    expect(progress.label.ko).toBe(`게시 단계 안의 ${position}/3`);
  });

  it("published means every substep is done and the fraction is 3/3", () => {
    const states = derivePublishSubsteps("content", { published: true });
    expect(states.every((state) => state.status === "done")).toBe(true);
    expect(publishSubstepProgress(states).label.ko).toBe("게시 단계 안의 3/3");
  });

  it("never invents a position: unknown active step stays unknown", () => {
    const states = derivePublishSubsteps(undefined);
    expect(states.every((state) => state.status === "unknown")).toBe(true);
    expect(publishSubstepPosition(states)).toBeNull();
    expect(publishSubstepProgress(states).label.ko).toBe("게시 단계 안의 절차");
  });
});
