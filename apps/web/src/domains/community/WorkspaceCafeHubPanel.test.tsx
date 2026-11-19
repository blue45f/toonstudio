// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceCafeHubPanel } from "./WorkspaceCafeHubPanel";

afterEach(cleanup);

describe("WorkspaceCafeHubPanel", () => {
  it("스튜디오별 카페로 전환하고 새 게시글을 등록한다", () => {
    const onPostCreated = vi.fn();
    render(<WorkspaceCafeHubPanel onPostCreated={onPostCreated} />);

    fireEvent.click(screen.getByRole("tab", { name: "스튜디오별 카페" }));
    fireEvent.change(screen.getByPlaceholderText("게시글 제목을 입력하세요"), {
      target: { value: "신규 3D 배경 에셋 공유" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("원고 피드백, 레퍼런스, 공지 내용을 작성하고 이미지를 첨부해 보세요"),
      { target: { value: "이번 주 마감용 실내 세트 업로드했습니다." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

    expect(onPostCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByText("신규 3D 배경 에셋 공유")).toBeTruthy();
  });
});
