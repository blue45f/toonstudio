import { describe, expect, it } from "vitest";

import {
  appendToneDecision,
  applyToneCompletion,
  buildToneHandoffAttachment,
  createWorkToneSheet,
  evaluateToneStageCompletion,
  toneDirectionCheckId,
  workToneSheetCompleteness,
  type ToneDirectionCheck,
  type WorkToneSheet,
} from "./work-tone-sheet-model";

const AT = "2026-10-14T00:00:00.000Z";

function decidedSheet(): WorkToneSheet {
  const empty = createWorkToneSheet("project-1");
  const result = appendToneDecision(empty, {
    decidedById: "lead-1",
    decidedByName: "리드",
    decidedAt: AT,
    summary: "무게감은 묵직하게, 전개는 빠르게 간다.",
    reason: "장르 독자 기대에 맞춤",
    weight: "heavy",
    pacing: "fast",
    statement: "밝게 시작해 결말로 갈수록 묵직해진다.",
    forbiddenExpressions: ["개그성 말장난", "  ", "개그성 말장난"],
  });
  if (!result.ok) throw new Error("setup failed");
  return result.sheet;
}

function check(overrides: Partial<ToneDirectionCheck> = {}): ToneDirectionCheck {
  return {
    id: toneDirectionCheckId("episode-1", "plan", "checker-1", 1),
    episodeId: "episode-1",
    stageId: "plan",
    checkerId: "checker-1",
    checkerName: "검토자",
    toneRevision: 1,
    verdict: "fits",
    note: "",
    checkedAt: AT,
    ...overrides,
  };
}

describe("createWorkToneSheet / appendToneDecision", () => {
  it("starts empty with revision 0 and no fabricated tone", () => {
    const sheet = createWorkToneSheet("project-1");
    expect(sheet.weight).toBeNull();
    expect(sheet.pacing).toBeNull();
    expect(sheet.revision).toBe(0);
    expect(workToneSheetCompleteness(sheet).ready).toBe(false);
    expect(buildToneHandoffAttachment(sheet)).toBeNull();
  });

  it("applies a decision immutably, dedupes forbidden expressions, and bumps revision", () => {
    const empty = createWorkToneSheet("project-1");
    const sheet = decidedSheet();
    expect(empty.revision).toBe(0);
    expect(sheet.weight).toBe("heavy");
    expect(sheet.pacing).toBe("fast");
    expect(sheet.forbiddenExpressions).toEqual(["개그성 말장난"]);
    expect(sheet.revision).toBe(1);
    expect(sheet.decisions).toHaveLength(1);
    expect(sheet.decisions[0]?.forbiddenAdded).toEqual(["개그성 말장난"]);
  });

  it("rejects a decision without a summary and a decision that changes nothing", () => {
    const sheet = decidedSheet();
    expect(
      appendToneDecision(sheet, { decidedById: "a", decidedByName: "A", decidedAt: AT, summary: "  ", weight: "dark" }),
    ).toEqual({ ok: false, code: "summary-required" });
    expect(
      appendToneDecision(sheet, { decidedById: "a", decidedByName: "A", decidedAt: AT, summary: "같은 톤 유지", weight: "heavy" }),
    ).toEqual({ ok: false, code: "no-change" });
  });

  it("records forbidden add/remove as a diff in the decision history", () => {
    const sheet = decidedSheet();
    const result = appendToneDecision(sheet, {
      decidedById: "lead-1",
      decidedByName: "리드",
      decidedAt: AT,
      summary: "금지 표현을 교체한다.",
      forbiddenExpressions: ["과장된 리액션"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.sheet.forbiddenExpressions).toEqual(["과장된 리액션"]);
    expect(result.decision.forbiddenAdded).toEqual(["과장된 리액션"]);
    expect(result.decision.forbiddenRemoved).toEqual(["개그성 말장난"]);
    expect(result.sheet.revision).toBe(2);
    // 이전 시트는 불변이다.
    expect(sheet.forbiddenExpressions).toEqual(["개그성 말장난"]);
  });
});

describe("buildToneHandoffAttachment", () => {
  it("builds lines with weight, pacing, statement, forbidden and the latest decision", () => {
    const attachment = buildToneHandoffAttachment(decidedSheet());
    expect(attachment?.revision).toBe(1);
    expect(attachment?.weightLabel?.ko).toBe("묵직하고 진지함");
    expect(attachment?.pacingLabel?.ko).toBe("빠른 전개");
    expect(attachment?.lines).toEqual([
      "무게감: 묵직하고 진지함",
      "전개 속도: 빠른 전개",
      "밝게 시작해 결말로 갈수록 묵직해진다.",
      "금지 표현: 개그성 말장난",
      "최근 결정: 무게감은 묵직하게, 전개는 빠르게 간다.",
    ]);
    expect(attachment?.latestDecision?.decidedByName).toBe("리드");
  });

  it("returns null for a missing sheet instead of inventing tone", () => {
    expect(buildToneHandoffAttachment(null)).toBeNull();
    expect(buildToneHandoffAttachment(undefined)).toBeNull();
  });
});

describe("evaluateToneStageCompletion", () => {
  it("does not apply to stages other than plan/storyboard", () => {
    const result = evaluateToneStageCompletion({ stageId: "art", sheet: null, checks: [] });
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it("blocks when the sheet is missing or incomplete", () => {
    expect(
      evaluateToneStageCompletion({ stageId: "plan", sheet: null, checks: [] }).blockers.map((b) => b.code),
    ).toEqual(["tone-sheet-missing"]);
    const partial = appendToneDecision(createWorkToneSheet("p"), {
      decidedById: "a",
      decidedByName: "A",
      decidedAt: AT,
      summary: "무게감만 정함",
      weight: "light",
    });
    if (!partial.ok) throw new Error("setup failed");
    const result = evaluateToneStageCompletion({ stageId: "plan", sheet: partial.sheet, checks: [check()] });
    // 리비전 1 체크가 있어도 시트 미완성이 먼저 막는다.
    expect(result.blockers.map((b) => b.code)).toContain("tone-sheet-incomplete");
    expect(result.satisfied).toBe(false);
  });

  it("is satisfied by a current, fitting check from a non-assignee", () => {
    const result = evaluateToneStageCompletion({
      stageId: "plan",
      sheet: decidedSheet(),
      checks: [check()],
      stageAssigneeId: "author-1",
    });
    expect(result.satisfied).toBe(true);
    expect(result.effectiveCheck?.checkerId).toBe("checker-1");
  });

  it("rejects the stage assignee's own check (separation)", () => {
    const result = evaluateToneStageCompletion({
      stageId: "storyboard",
      sheet: decidedSheet(),
      checks: [check({ stageId: "storyboard", checkerId: "author-1" })],
      stageAssigneeId: "author-1",
    });
    expect(result.satisfied).toBe(false);
    expect(result.blockers.map((b) => b.code)).toEqual(["tone-check-by-assignee"]);
  });

  it("treats a check against an older tone revision as stale", () => {
    const sheet = decidedSheet();
    const bumped = appendToneDecision(sheet, {
      decidedById: "lead-1",
      decidedByName: "리드",
      decidedAt: AT,
      summary: "전개를 더 빠르게",
      pacing: "relentless",
    });
    if (!bumped.ok) throw new Error("setup failed");
    const result = evaluateToneStageCompletion({
      stageId: "plan",
      sheet: bumped.sheet,
      checks: [check({ toneRevision: 1 })],
      stageAssigneeId: "author-1",
    });
    expect(result.blockers.map((b) => b.code)).toEqual(["tone-check-stale"]);
  });

  it("blocks when the latest external check is not 'fits'", () => {
    const result = evaluateToneStageCompletion({
      stageId: "plan",
      sheet: decidedSheet(),
      checks: [check({ verdict: "adjust" })],
      stageAssigneeId: "author-1",
    });
    expect(result.blockers.map((b) => b.code)).toEqual(["tone-check-not-fitting"]);
  });

  it("uses the latest external check when several exist", () => {
    const result = evaluateToneStageCompletion({
      stageId: "plan",
      sheet: decidedSheet(),
      checks: [
        check({ verdict: "off-tone", checkedAt: "2026-10-13T00:00:00.000Z" }),
        check({ verdict: "fits", checkedAt: AT }),
      ],
      stageAssigneeId: "author-1",
    });
    expect(result.satisfied).toBe(true);
  });
});

describe("applyToneCompletion", () => {
  it("ANDs tone satisfaction into plan/storyboard only and leaves other keys untouched", () => {
    const merged = applyToneCompletion(
      { plan: true, storyboard: true, art: true },
      {
        sheet: decidedSheet(),
        checksByStage: { plan: [check()], storyboard: [] },
        assigneeByStage: { plan: "author-1", storyboard: "author-1" },
      },
    );
    expect(merged).toEqual({ plan: true, storyboard: false, art: true });
  });

  it("does not invent keys for stages absent from the input map", () => {
    const merged = applyToneCompletion(
      { art: true },
      { sheet: decidedSheet(), checksByStage: {} },
    );
    expect(merged).toEqual({ art: true });
  });
});
