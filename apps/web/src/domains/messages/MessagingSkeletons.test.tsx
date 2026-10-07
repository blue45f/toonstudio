// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConversationSkeleton, ThreadListSkeleton } from "./MessagingSkeletons";

afterEach(cleanup);

describe("메시지군 로딩 실루엣", () => {
  it("대화 목록 실루엣은 상태 역할과 라벨을 제공한다", () => {
    render(<ThreadListSkeleton rows={3} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("대화 목록을 불러오는 중");
    // 실루엣 행은 스크린리더에 노출되지 않는다
    expect(status.querySelectorAll("[aria-hidden='true'] > div")).toHaveLength(3);
  });

  it("대화 실루엣은 상태 역할과 라벨을 제공한다", () => {
    render(<ConversationSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("대화를 불러오는 중");
  });
});
