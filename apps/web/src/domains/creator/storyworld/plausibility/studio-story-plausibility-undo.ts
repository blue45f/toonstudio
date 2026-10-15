/**
 * 점검 허브 안의 "방금 한 일 되돌리기".
 *
 * 이 되돌리기는 허브가 열려 있는 동안 허브 안에서 한 일(처리 기록, 질문지 답, 원고 초안 만들기)만
 * 되돌린다. 편집기의 작업 기록(History)과는 이어져 있지 않다. 스토리월드 문서는 편집기 문서와 따로
 * 저장되기 때문이다. 항목은 함수가 아니라 이전 값을 담은 자료라서 테스트할 수 있다.
 */
import type { StoryworldProject } from "../studio-storyworld-causality";
import type { StoryworldIssueDisposition } from "../studio-storyworld-issue-dispositions";

export const PLAUSIBILITY_UNDO_LIMIT = 20;

export type PlausibilityUndoEntry =
  | {
    readonly kind: "disposition";
    readonly label: string;
    readonly issueKey: string;
    /** 처리 전의 기록. 없었으면 null(되돌리면 기록을 지운다). */
    readonly previous: StoryworldIssueDisposition | null;
  }
  | {
    readonly kind: "project";
    readonly label: string;
    /** 바꾸기 전의 스토리월드 문서. */
    readonly previous: StoryworldProject;
  };

export function pushUndo(
  stack: readonly PlausibilityUndoEntry[],
  entry: PlausibilityUndoEntry,
  limit: number = PLAUSIBILITY_UNDO_LIMIT,
): readonly PlausibilityUndoEntry[] {
  return [...stack, entry].slice(-Math.max(1, limit));
}

export function popUndo(stack: readonly PlausibilityUndoEntry[]): {
  readonly entry: PlausibilityUndoEntry | null;
  readonly rest: readonly PlausibilityUndoEntry[];
} {
  const entry = stack.at(-1) ?? null;
  return { entry, rest: entry === null ? stack : stack.slice(0, -1) };
}
