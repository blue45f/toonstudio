// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ReturnContextBanner } from "./ReturnContextBanner";

function renderBanner(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ReturnContextBanner />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("ReturnContextBanner", () => {
  it("마켓 적용 맥락이면 배너 한 줄과 리소스 복귀 링크를 제공한다", async () => {
    renderBanner(
      "/studio/canvas?returnTo=%2Fmarket%2Fresource%2Fresource-1&intent=apply-market-resource&stageId=art",
    );

    expect(await screen.findByText(/마켓 소재 적용 중 · 작화 단계|Applying a market resource · Art stage/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /리소스로 돌아가기|Back to the resource/ });
    expect(link.getAttribute("href")).toBe("/market/resource/resource-1");
  });

  it("닫으면 배너가 사라진다", async () => {
    renderBanner("/studio/canvas?returnTo=%2Flearn%2Fstory-board&intent=lesson-practice");
    expect(await screen.findByText(/학습 실습 중|Lesson practice in progress/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /복귀 맥락 안내 닫기|Dismiss return context/ }));
    expect(screen.queryByText(/학습 실습 중|Lesson practice in progress/)).toBeNull();
  });

  it("학습 실습 진입에서는 미션 바에 자리를 양보한다", () => {
    const { container } = renderBanner(
      "/studio/canvas?practice=lesson&lesson=story-board&mission=mission-story-board&returnTo=%2Flearn%2Fstory-board&intent=lesson-practice",
    );
    expect(container.firstChild).toBeNull();
  });

  it.each([
    "/studio/canvas",
    "/studio/canvas?marketReturn=%2Fmarket%2Fresource%2Fresource-1",
    "/studio/canvas?returnTo=https%3A%2F%2Fevil.test%2F&intent=continue-work",
    "/studio/canvas?returnTo=%2Flearn&intent=teleport",
  ])("계약이 없거나 어긋나면 렌더하지 않는다: %s", (url) => {
    const { container } = renderBanner(url);
    expect(container.firstChild).toBeNull();
  });
});
