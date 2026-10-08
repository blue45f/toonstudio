// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { ProductionProjectAccess } from "./production-dashboard-api";
import { createProductionDemoProject } from "./production-demo";
import { ProductionProjectHeader } from "./ProductionProjectHeader";

afterEach(() => cleanup());

const access: ProductionProjectAccess = {
  view: true,
  comment: true,
  edit: true,
  manage: true,
  owner: true,
  role: "owner",
};

function renderHeader(aggregate: ProductionProjectAggregate) {
  return render(
    <MemoryRouter>
      <ProductionProjectHeader
        aggregate={aggregate}
        access={access}
        roleLens="story"
        onRoleLensChange={vi.fn()}
        saveState="saved"
        isDemo={false}
      />
    </MemoryRouter>,
  );
}

describe("ProductionProjectHeader 표지 타일", () => {
  it("coverImageUrl이 있으면 실물 표지를 헤더 타일로 렌더한다", () => {
    const aggregate: ProductionProjectAggregate = {
      ...createProductionDemoProject(),
      coverImageUrl: "https://example.test/header-cover.png",
    };
    const { container } = renderHeader(aggregate);
    const img = container.querySelector('img[src="https://example.test/header-cover.png"]');
    expect(img).not.toBeNull();
    expect(screen.getByRole("heading", { name: aggregate.title })).toBeTruthy();
  });

  it("coverImageUrl이 없으면 이미지를 만들지 않고 제목 이니셜 폴백 타일을 유지한다", () => {
    const aggregate: ProductionProjectAggregate = {
      ...createProductionDemoProject(),
      coverImageUrl: null,
    };
    const { container } = renderHeader(aggregate);
    expect(container.querySelector("img")).toBeNull();
    const initial = aggregate.title.trim().charAt(0);
    const fallback = [...container.querySelectorAll("span")].find((span) => span.textContent === initial);
    expect(fallback).toBeTruthy();
  });
});
