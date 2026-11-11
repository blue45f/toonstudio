// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioProjectLibraryFastStartStrip } from "./StudioProjectLibraryFastStartStrip";

afterEach(cleanup);

describe("StudioProjectLibraryFastStartStrip", () => {
  it("exposes 4 one-click format launch cards with 44px touch targets", () => {
    render(
      <MemoryRouter>
        <StudioProjectLibraryFastStartStrip />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", {
      name: /1초 포맷 빠른 시작|1-second format fast start/u,
    });
    expect(nav.getAttribute("data-studio-fast-start-strip")).toBe("true");

    const expectedRoutes = [
      ["세로 웹툰 바로 시작", "/studio/new?kind=webtoon&template=webtoon-vertical"],
      ["4컷 만화 바로 시작", "/studio/new?kind=four-cut&template=four-cut-classic"],
      ["3D 배경·캐릭터 열기", "/studio/bg3d"],
      ["PSD·CLIP 원고 변환", "/studio/import"],
    ] as const;

    for (const [label, href] of expectedRoutes) {
      const link = screen.getByRole("link", { name: new RegExp(label, "u") });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.className).toContain("min-h-11");
    }
  });
});
