// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioProjectLibraryFastStartStrip } from "./StudioProjectLibraryFastStartStrip";

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("StudioProjectLibraryFastStartStrip", () => {
  it.each([
    ["ko", "작업 시작 방식", ["세로 웹툰 시작", "4컷 만화 시작", "3D 장면 만들기", "원고 파일 불러오기"]],
    ["en", "Ways to start creating", ["Start a webtoon", "Start a 4-panel comic", "Build a 3D scene", "Import a manuscript"]],
  ] as const)("%s 사용자가 결과를 보고 네 가지 시작 경로를 선택한다", (language, name, labels) => {
    useI18n.setState({ lang: language });
    render(
      <MemoryRouter>
        <StudioProjectLibraryFastStartStrip />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name });
    expect(nav.getAttribute("data-studio-fast-start-strip")).toBe("true");

    const expectedRoutes = [
      "/studio/new?kind=webtoon&template=webtoon-vertical",
      "/studio/new?kind=four-cut&template=four-cut-classic",
      "/studio/bg3d",
      "/studio/import",
    ] as const;

    expect(screen.getAllByRole("link")).toHaveLength(4);
    labels.forEach((label, index) => {
      const link = screen.getByRole("link", { name: new RegExp(label, "u") });
      const href = expectedRoutes[index];
      expect(link.getAttribute("href")).toBe(href);
      expect(link.className).toContain("min-h-11");
    });
    expect(nav.textContent).not.toMatch(/WEBGPU|무손실|lossless|1초|1-second|800×/iu);
  });
});
