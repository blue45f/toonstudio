import { describe, expect, it } from "vitest";

import {
  STORYWORLD_ISSUE_DISPOSITION_LABELS,
  isStoryworldIssueDispositionStatus,
  parseStoryworldIssueDispositions,
  type StoryworldIssueDispositionStatus,
} from "./studio-storyworld-issue-dispositions";

const AT = "2026-10-15T00:00:00.000Z";

describe("처리 기록 상태 확장", () => {
  it("예전에 저장한 해결·무시 기록은 그대로 읽힌다", () => {
    const legacy = JSON.stringify({
      version: 1,
      dispositions: [
        { issueKey: "a", status: "resolved", updatedAtIso: AT },
        { issueKey: "b", status: "ignored", note: "의도된 연출", updatedAtIso: AT },
      ],
    });
    const document = parseStoryworldIssueDispositions(legacy, "scope");
    expect(document.dispositions.map((item) => item.status)).toEqual(["resolved", "ignored"]);
    expect(document.dispositions[1]?.note).toBe("의도된 연출");
  });

  it("의도된 설정과 나중에도 저장·불러오기 왕복이 된다", () => {
    const records = (["intended", "deferred"] as const).map((status, index) => ({
      issueKey: `k${index}`, status, note: `사유 ${index}`, updatedAtIso: AT,
    }));
    const restored = parseStoryworldIssueDispositions(JSON.stringify({ version: 1, dispositions: records }), "scope");
    expect(restored.dispositions).toEqual(records);
  });

  it("알 수 없는 상태나 모양이 틀린 항목은 거절한다", () => {
    const parse = (entry: unknown) => parseStoryworldIssueDispositions(JSON.stringify({ version: 1, dispositions: [entry] }), "s");
    expect(() => parse({ issueKey: "a", status: "snoozed", updatedAtIso: AT })).toThrow();
    expect(() => parse({ issueKey: 1, status: "resolved", updatedAtIso: AT })).toThrow();
    expect(() => parse({ issueKey: "a", status: "resolved", note: 3, updatedAtIso: AT })).toThrow();
    expect(() => parse("문자열")).toThrow();
  });

  it("상태마다 화면 문구가 있고 판별 함수가 네 가지만 받는다", () => {
    const statuses: readonly StoryworldIssueDispositionStatus[] = ["resolved", "ignored", "intended", "deferred"];
    for (const status of statuses) {
      expect(isStoryworldIssueDispositionStatus(status)).toBe(true);
      expect(STORYWORLD_ISSUE_DISPOSITION_LABELS[status].length).toBeGreaterThan(0);
    }
    expect(STORYWORLD_ISSUE_DISPOSITION_LABELS.intended).toBe("의도된 설정");
    expect(STORYWORLD_ISSUE_DISPOSITION_LABELS.deferred).toBe("나중에");
    expect(isStoryworldIssueDispositionStatus("done")).toBe(false);
    expect(isStoryworldIssueDispositionStatus(undefined)).toBe(false);
  });
});
