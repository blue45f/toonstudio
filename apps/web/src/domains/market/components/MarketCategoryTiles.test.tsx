// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { MarketCategoryTiles } from "./MarketCategoryTiles";

afterEach(() => {
  cleanup();
});

describe("MarketCategoryTiles", () => {
  it("작업군 5장을 아트 타일로 보여 주고 각 타일이 첫 세부 카테고리로 이동한다", () => {
    render(
      <MemoryRouter>
        <MarketCategoryTiles />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "소재 카테고리" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);

    const expected: ReadonlyArray<{ label: string; href: string; image: string }> = [
      { label: "템플릿", href: "/market/browse?kind=template", image: "/brand/atelier-process.webp" },
      { label: "2D 에셋", href: "/market/browse?kind=asset&tag=%EB%B0%B0%EA%B2%BD", image: "/assets/studio/cc0-20260906/assets/polyhaven-background-wooden-lounge/background.webp" },
      { label: "3D", href: "/market/browse?kind=3d-asset", image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png" },
      { label: "브러시", href: "/market/browse?kind=brush", image: "/brand/atelier-materials.webp" },
      { label: "색·보정", href: "/market/browse?kind=palette", image: "/brand/atelier-world.webp" },
    ];

    for (const [index, item] of expected.entries()) {
      const link = links[index];
      expect(link.textContent).toContain(item.label);
      expect(link.getAttribute("href")).toBe(item.href);
      const image = link.querySelector("img");
      expect(image?.getAttribute("src")).toBe(item.image);
    }
  });
});
