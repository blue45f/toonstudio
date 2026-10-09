// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionOverviewCoverStage } from "./ProductionOverviewCoverStage";
import { createProductionDemoProject, PRODUCTION_DEMO_COVER_IMAGE_URL } from "./production-demo";

afterEach(cleanup);

describe("제작 개요 표지 무대", () => {
  it("표지가 있으면 개요 첫 화면에 주인공급 표지와 로그라인을 세운다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = render(<ProductionOverviewCoverStage aggregate={aggregate} />);
    const stage = container.querySelector("section");
    expect(stage).toBeTruthy();
    const cover = screen.getByRole("img", { name: `${aggregate.title} 표지` });
    expect(cover.getAttribute("src")).toBe(PRODUCTION_DEMO_COVER_IMAGE_URL);
    expect(screen.getByRole("heading", { name: aggregate.title })).toBeTruthy();
    // 데모 브리프의 로그라인이 무대 소개 문장으로 함께 선다.
    const brief = [...aggregate.projectBriefs].sort((a, b) => b.revision - a.revision)[0];
    expect(brief?.logline.trim()).toBeTruthy();
    expect(screen.getByText(brief!.logline)).toBeTruthy();
  });

  it("표지가 없으면 무대를 세우지 않는다 — 빈 표지 폴백(헤더 이니셜 타일)이 유지된다", () => {
    const aggregate = { ...createProductionDemoProject(), coverImageUrl: null };
    const { container } = render(<ProductionOverviewCoverStage aggregate={aggregate} />);
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
