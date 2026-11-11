// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { DiscoverFacetTabStrip } from "./DiscoverFacetTabStrip";

afterEach(cleanup);

describe("DiscoverFacetTabStrip", () => {
  it("renders spectrum facet links and a direct creation bridge with 44px touch targets", () => {
    render(
      <MemoryRouter initialEntries={["/discover"]}>
        <DiscoverFacetTabStrip />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: /스펙트럼 빠른 이동|Spectrum quick facets/u });
    expect(nav.getAttribute("data-testid")).toBe("discover-facet-tab-strip");

    const homeLink = within(nav).getByRole("link", { name: /탐색 홈|Discover Home/u });
    expect(homeLink.getAttribute("aria-current")).toBe("page");
    expect(homeLink.className).toContain("min-h-11");

    expect(within(nav).getByRole("link", { name: /장르·필터|Genre & Filters/u }).getAttribute("href")).toBe("/explore");
    expect(within(nav).getByRole("link", { name: /인기 차트|Top Charts/u }).getAttribute("href")).toBe("/ranking");
    expect(within(nav).getByRole("link", { name: /이 감성으로 3컷 창작|Create 3-panel story/u }).getAttribute("href")).toBe("/create");
  });
});
