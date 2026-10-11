// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionSurfaceHeader } from "./ProductionSurfaceHeader";
import { createProductionDemoProject, PRODUCTION_DEMO_COVER_IMAGE_URL } from "./production-demo";

afterEach(cleanup);

function renderHeader(aggregate: ReturnType<typeof createProductionDemoProject>, surface: "episodes" | "overview") {
  return render(
    <MemoryRouter>
      <ProductionSurfaceHeader aggregate={aggregate} surface={surface} />
    </MemoryRouter>,
  );
}

describe("제작 표면 헤더", () => {
  it("표지가 있는 비-개요 표면에서는 표지 장면 헤더가 된다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = renderHeader(aggregate, "episodes");
    const header = container.querySelector("[data-production-surface-header='episodes']");
    expect(header).toBeTruthy();
    expect(header?.getAttribute("data-production-surface-header-scene")).toBe("cover");
    // 장면 배경은 개요 무대와 같은 흐린 표지 이미지(장식용, 대체 텍스트 없음).
    const backdrop = header?.querySelector("img");
    expect(backdrop?.getAttribute("src")).toBe(PRODUCTION_DEMO_COVER_IMAGE_URL);
    expect(backdrop?.getAttribute("alt")).toBe("");
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");
  });

  it("표지가 없으면 기존 카드 띠로 폴백한다", () => {
    const aggregate = { ...createProductionDemoProject(), coverImageUrl: null };
    const { container } = renderHeader(aggregate, "episodes");
    const header = container.querySelector("[data-production-surface-header='episodes']");
    expect(header).toBeTruthy();
    expect(header?.getAttribute("data-production-surface-header-scene")).toBeNull();
    expect(header?.querySelector("img")).toBeNull();
  });

  it("개요 표면은 전용 표지 무대가 있어 표지가 있어도 장면 헤더를 겹치지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = renderHeader(aggregate, "overview");
    const header = container.querySelector("[data-production-surface-header='overview']");
    expect(header).toBeTruthy();
    expect(header?.getAttribute("data-production-surface-header-scene")).toBeNull();
    expect(header?.querySelector("img")).toBeNull();
  });
});
