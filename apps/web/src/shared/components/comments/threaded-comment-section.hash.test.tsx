// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadedCommentSection } from "./threaded-comment-section";

import type { ThreadedCommentRecord } from "./threaded-comment-model";

/**
 * 댓글 영역은 주소 해시(`#comment-<id>`)로 특정 댓글에 스크롤한다. 해시는 누구나 만들어 보낼 수 있는 입력이므로
 * 짝이 맞지 않는 퍼센트 인코딩(`#%E0%A4%A`)이 URIError 를 던져 댓글이 달린 모든 화면을 오류 경계로 떨어뜨리면 안 된다.
 */
function comment(id: string, text: string): ThreadedCommentRecord {
  return {
    id,
    parentId: null,
    author: { id: "viewer-1", name: "작성자" },
    text,
    deleted: false,
    likes: 0,
    viewerLiked: false,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
}

function Harness({ initial }: { readonly initial: ThreadedCommentRecord[] }) {
  const [comments, setComments] = useState(initial);
  return (
    <ThreadedCommentSection
      comments={comments}
      setComments={setComments}
      viewerId="viewer-1"
      onCreate={async (text) => comment("created", text)}
      onUpdate={async (commentId, text) => comment(commentId, text)}
      onDelete={async (commentId) => ({ deleted: true, soft: false, removedIds: [commentId] })}
      onToggleLike={async () => ({ liked: true, likes: 1 })}
      placeholder="댓글 입력"
      draftStorageKey="threaded-comment-hash-test-draft"
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("댓글 영역의 주소 해시 처리", () => {
  it.each(["#%E0%A4%A", "#%", "#comment-%ZZ"])("깨진 퍼센트 인코딩 해시 %s 에도 화면이 무너지지 않는다", (hash) => {
    window.history.replaceState(null, "", `/${hash}`);
    expect(window.location.hash).toBe(hash);
    expect(() => render(<Harness initial={[comment("c1", "첫 댓글")]} />)).not.toThrow();
  });

  it("정상 해시는 해당 댓글로 스크롤한다", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    window.history.replaceState(null, "", "/#comment-c1");
    render(<Harness initial={[comment("c1", "첫 댓글")]} />);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});
