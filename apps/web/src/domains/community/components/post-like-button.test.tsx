// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_MODAL_REQUEST_EVENT } from "@/domains/auth/public/session/auth-modal-intent";
import { api } from "@/platform/api";

import { PostLikeButton } from "./post-like-button";

vi.mock("@/platform/api", () => ({
  api: { post: vi.fn() },
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateCurrentStaticSourceText: (_domain: string, _lang: string, text: string) => text,
}));

const postMock = vi.mocked(api.post);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PostLikeButton", () => {
  it("회원 클릭 시 낙관적으로 바뀌고 서버 응답으로 확정된다", async () => {
    const pending = deferred<{ liked: boolean; likeCount: number }>();
    postMock.mockReturnValue(pending.promise);

    render(
      <PostLikeButton
        postId="post-1"
        userId="user-1"
        sessionToken="token-1"
        initialLiked={false}
        initialCount={3}
      />,
    );
    const button = screen.getByRole("button", { name: "좋아요" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toContain("3");

    fireEvent.click(button);
    // 서버 응답 전에도 낙관적 상태가 보인다.
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("4");
    expect(postMock).toHaveBeenCalledWith("/community/posts/post-1/like", {}, {
      headers: { "x-user-id": "token-1" },
    });

    // 진행 중 중복 클릭은 추가 요청을 만들지 않는다.
    fireEvent.click(button);
    expect(postMock).toHaveBeenCalledTimes(1);

    pending.resolve({ liked: true, likeCount: 4 });
    await waitFor(() => expect(button.textContent).toContain("4"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("요청이 실패하면 원래 상태로 롤백하고 오류를 알린다", async () => {
    postMock.mockRejectedValue(new Error("network"));

    render(
      <PostLikeButton
        postId="post-1"
        userId="user-1"
        sessionToken="token-1"
        initialLiked={true}
        initialCount={5}
      />,
    );
    const button = screen.getByRole("button", { name: "좋아요" });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("좋아요를 반영하지 못했습니다"),
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("5");
  });

  it("게스트 클릭은 요청 없이 인증 모달 유도를 발행한다", () => {
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    globalThis.addEventListener(AUTH_MODAL_REQUEST_EVENT, listener);
    try {
      render(
        <PostLikeButton
          postId="post-1"
          userId={null}
          sessionToken={null}
          initialLiked={false}
          initialCount={2}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "좋아요" }));
      expect(postMock).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      expect(events[0].detail).toMatchObject({ source: "community-post-like" });
    } finally {
      globalThis.removeEventListener(AUTH_MODAL_REQUEST_EVENT, listener);
    }
  });
});
