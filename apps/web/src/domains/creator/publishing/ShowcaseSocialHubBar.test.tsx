// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ShowcaseSocialHubBar } from "./ShowcaseSocialHubBar";

afterEach(cleanup);

describe("ShowcaseSocialHubBar", () => {
  it("exposes the 4 social tabs and Canon Character Talk bridge with 44px touch targets", () => {
    render(
      <MemoryRouter initialEntries={["/showcase"]}>
        <ShowcaseSocialHubBar />
      </MemoryRouter>,
    );

    const nav = screen.getByTestId("showcase-social-hub-bar");
    expect(within(nav).getByRole("link", { name: /작품 갤러리/u }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: /팬카페 · 깊은 리뷰/u }).getAttribute("href")).toBe("/community");
    expect(within(nav).getByRole("link", { name: /작화 타임랩스/u }).getAttribute("href")).toBe("/community/timelapses");
    expect(within(nav).getByRole("link", { name: /팀원 구인 · 의뢰/u }).getAttribute("href")).toBe("/collaborate");
    expect(within(nav).getByRole("link", { name: /세계관 캐릭터 토크/u }).getAttribute("href")).toBe("/character-chat");
  });
});
