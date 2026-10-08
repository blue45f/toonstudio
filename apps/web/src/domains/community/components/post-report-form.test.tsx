// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { PostReportForm } from "./post-report-form";

vi.mock("@/platform/api", () => ({
  api: { post: vi.fn() },
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateCurrentStaticSourceText: (_domain: string, _lang: string, text: string) => text,
}));

const postMock = vi.mocked(api.post);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PostReportForm", () => {
  it("홍보 신고와 같은 길이 검증 속성을 갖고 제출하면 완료 문구를 보인다", async () => {
    postMock.mockResolvedValue({ reported: true });

    render(<PostReportForm postId="post-1" sessionToken="token-1" />);
    const textarea = screen.getByLabelText("신고 사유") as HTMLTextAreaElement;
    expect(textarea.required).toBe(true);
    expect(textarea.minLength).toBe(10);
    expect(textarea.maxLength).toBe(1000);

    fireEvent.change(textarea, {
      target: { value: "도용된 이미지가 올라와 있습니다. 출처를 확인해 주세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "신고 보내기" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("신고를 접수했어요"),
    );
    expect(postMock).toHaveBeenCalledWith(
      "/community/posts/post-1/reports",
      { reason: "도용된 이미지가 올라와 있습니다. 출처를 확인해 주세요." },
      { headers: { "x-user-id": "token-1" } },
    );
  });

  it("제출이 실패하면 오류를 알리고 폼을 유지해 다시 시도할 수 있다", async () => {
    postMock.mockRejectedValue(new Error("network"));

    render(<PostReportForm postId="post-1" sessionToken="token-1" />);
    const textarea = screen.getByLabelText("신고 사유") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "스팸 홍보가 반복되는 글입니다. 조치를 부탁드립니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "신고 보내기" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("신고를 접수하지 못했습니다"),
    );
    // 입력한 사유가 남아 있어 그대로 다시 보낼 수 있다.
    expect(textarea.value).toContain("스팸 홍보");
    expect(screen.getByRole("button", { name: "신고 보내기" })).toBeTruthy();
  });
});
