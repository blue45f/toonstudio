import { describe, expect, it } from "vitest";

import {
  computeStudioTextDiff,
  studioTextDiffHasChanges,
  STUDIO_TEXT_DIFF_MAX_INPUT_CHARS,
} from "./studio-text-diff";

describe("computeStudioTextDiff", () => {
  it("reports identical texts with every line unchanged", () => {
    const result = computeStudioTextDiff("안녕\n잘 가", "안녕\n잘 가");
    expect(result.identical).toBe(true);
    expect(studioTextDiffHasChanges(result)).toBe(false);
    expect(result.summary.unchangedLines).toBe(2);
    expect(result.lines.map((line) => line.kind)).toEqual(["unchanged", "unchanged"]);
  });

  it("treats CRLF and LF versions of the same text as identical", () => {
    const result = computeStudioTextDiff("첫 줄\r\n둘째 줄", "첫 줄\n둘째 줄");
    expect(result.identical).toBe(true);
  });

  it("marks inserted and deleted lines with 1-based line numbers", () => {
    const inserted = computeStudioTextDiff("가\n나", "가\n중간\n나");
    const added = inserted.lines.filter((line) => line.kind === "added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ text: "중간", beforeLineNumber: null, afterLineNumber: 2 });
    expect(inserted.summary).toMatchObject({ addedLines: 1, removedLines: 0, modifiedLines: 0 });

    const deleted = computeStudioTextDiff("가\n중간\n나", "가\n나");
    const removed = deleted.lines.filter((line) => line.kind === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ text: "중간", beforeLineNumber: 2, afterLineNumber: null });
    expect(deleted.summary).toMatchObject({ addedLines: 0, removedLines: 1, modifiedLines: 0 });
  });

  it("pairs an edited line as modified and highlights only the changed characters", () => {
    const result = computeStudioTextDiff("오늘은 맑은 날이다", "오늘은 흐린 날이다");
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.kind).toBe("modified");
    expect(line.beforeLineNumber).toBe(1);
    expect(line.afterLineNumber).toBe(1);
    expect(line.beforeSegments?.filter((segment) => segment.kind === "removed").map((segment) => segment.value)).toEqual(["맑은"]);
    expect(line.afterSegments?.filter((segment) => segment.kind === "added").map((segment) => segment.value)).toEqual(["흐린"]);
    expect(result.summary.modifiedLines).toBe(1);
    expect(result.summary.removedChars).toBe(2);
    expect(result.summary.addedChars).toBe(2);
  });

  it("keeps surrounding unchanged lines around a modified block", () => {
    const result = computeStudioTextDiff("서막\n전개\n결말", "서막\n전개 수정\n결말");
    expect(result.lines.map((line) => line.kind)).toEqual(["unchanged", "modified", "unchanged"]);
    expect(result.lines[2]).toMatchObject({ beforeLineNumber: 3, afterLineNumber: 3 });
  });

  it("pairs only as many lines as both sides have and leaves the rest as add/remove", () => {
    const result = computeStudioTextDiff("하나\n둘", "하나\n둘-수정\n셋");
    expect(result.lines.map((line) => line.kind)).toEqual(["unchanged", "modified", "added"]);
    expect(result.summary).toMatchObject({ addedLines: 1, removedLines: 0, modifiedLines: 1 });
  });

  it("clips oversized inputs and flags truncation instead of diffing unbounded text", () => {
    const huge = "가".repeat(STUDIO_TEXT_DIFF_MAX_INPUT_CHARS + 10);
    const result = computeStudioTextDiff(huge, `${huge}나`);
    expect(result.truncated).toBe(true);
  });
});
