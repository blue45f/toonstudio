// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("샘플 프로젝트는 별도 지정 없이도 실물 표지 타일로 렌더한다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = renderHeader(aggregate);
    const img = container.querySelector(`img[src="${aggregate.coverImageUrl}"]`);
    expect(img).not.toBeNull();
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

describe("ProductionProjectHeader 공정 렌즈", () => {
  beforeEach(() => window.localStorage.clear());

  function processSelect(container: HTMLElement): HTMLSelectElement {
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(2);
    return selects[1] as HTMLSelectElement;
  }

  it("내 공정 선택지에 전체와 콘티/선화/채색/배경/식자가 공정 단위로 들어 있다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = renderHeader(aggregate);
    const select = processSelect(container);
    expect([...select.options].map((option) => option.value)).toEqual([
      "all",
      "storyboard",
      "line-art",
      "color",
      "background",
      "lettering",
    ]);
    expect(select.value).toBe("all");
  });

  it("공정을 고르면 프로젝트 단위로 저장되고 그 공정의 현황이 헤더에 표시된다", () => {
    const aggregate = createProductionDemoProject();
    const { container } = renderHeader(aggregate);
    fireEvent.change(processSelect(container), { target: { value: "storyboard" } });
    expect(window.localStorage.getItem(`toonstudio.production.process-lens.${aggregate.projectId}`)).toBe("storyboard");
    expect(screen.getByText("콘티 작업 1건 · 검수 대기 1")).toBeTruthy();
  });

  it("저장된 공정이 있으면 다음 렌더에서 그대로 복원된다", () => {
    const aggregate = createProductionDemoProject();
    window.localStorage.setItem(`toonstudio.production.process-lens.${aggregate.projectId}`, "line-art");
    const { container } = renderHeader(aggregate);
    expect(processSelect(container).value).toBe("line-art");
    expect(screen.getByText("선화 작업 1건 · 진행 중 1")).toBeTruthy();
  });

  it("다른 프로젝트에 저장된 공정은 이 프로젝트로 새지 않는다", () => {
    const aggregate = createProductionDemoProject();
    window.localStorage.setItem("toonstudio.production.process-lens.some-other-project", "color");
    const { container } = renderHeader(aggregate);
    expect(processSelect(container).value).toBe("all");
  });
});
