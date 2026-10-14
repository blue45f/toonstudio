// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioPublishVerdictCard } from "./StudioPublishVerdictCard";

afterEach(cleanup);

describe("StudioPublishVerdictCard", () => {
  it("shows status, next feedback point, caps and portfolio note for a challenge entry", () => {
    render(
      <MemoryRouter>
        <StudioPublishVerdictCard
          verdict={{
            kind: "challenge",
            status: "in-review",
            submittedAt: "2026-10-14T01:00:00.000Z",
            caps: {
              maxEpisodes: 4,
              completedEpisodes: 1,
              periodStart: "2026-10-12T03:00:00.000Z",
              periodEnd: "2026-11-08T14:59:59.000Z",
            },
            portfolioHref: "/studio/portfolio",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("현재 상태: 검토 중")).toBeTruthy();
    expect(screen.getByText(/다음 피드백·판단 시점:/)).toBeTruthy();
    expect(screen.getByText(/총 4화까지 제출할 수 있어요/)).toBeTruthy();
    expect(screen.getByText(/포트폴리오에 그대로 남습니다/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "포트폴리오에서 보기" }).getAttribute("href")).toBe(
      "/studio/portfolio",
    );
  });

  it("shows the closing message instead of a next point once closed", () => {
    render(
      <StudioPublishVerdictCard
        verdict={{
          kind: "challenge",
          status: "closed",
          submittedAt: "2026-09-01T01:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("현재 상태: 종료")).toBeTruthy();
    expect(screen.queryByText(/다음 피드백·판단 시점:/)).toBeNull();
    expect(screen.getByText(/이번 회차는 종료됐습니다/)).toBeTruthy();
  });
});
