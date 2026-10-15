// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionProjectNav } from "./ProductionProjectNav";
import type { EpisodeStageId, ProductionProjectSurface } from "./production-project-surfaces";

afterEach(cleanup);

const STAGE_GROUP_LABELS = ["기획", "콘티", "작화", "식자·연출", "검수", "게시", "운영"] as const;
const ALL_GROUP_LABELS = [...STAGE_GROUP_LABELS, "관리"] as const;

function renderNav(
  props: { readonly surface: ProductionProjectSurface | null; readonly currentStageId?: EpisodeStageId | null; readonly projectId?: string },
): HTMLElement {
  render(
    <MemoryRouter>
      <ProductionProjectNav projectId={props.projectId ?? "p-1"} surface={props.surface} currentStageId={props.currentStageId} />
    </MemoryRouter>,
  );
  return screen.getByRole("navigation", { name: "프로젝트 메뉴" });
}

function group(nav: HTMLElement, label: string): HTMLDetailsElement {
  const element = within(nav).getByRole("group", { name: label });
  if (!(element instanceof HTMLDetailsElement)) throw new Error(`${label} 그룹이 details가 아닙니다.`);
  return element;
}

function openGroupLabels(nav: HTMLElement): string[] {
  return ALL_GROUP_LABELS.filter((label) => group(nav, label).open);
}

describe("ProductionProjectNav (단계 그룹 내비)", () => {
  it("개요를 그룹 밖에 고정하고 일곱 단계 + 관리 그룹을 흐름 순서로 둔다", () => {
    const nav = renderNav({ surface: "overview" });
    const groups = Array.from(nav.querySelectorAll("details")).map((element) => element.getAttribute("aria-label"));
    expect(groups).toEqual([...ALL_GROUP_LABELS]);
    // 개요 링크는 어떤 그룹 안에도 들어 있지 않다.
    const overview = within(nav).getAllByRole("link")[0];
    expect(overview?.getAttribute("href")).toBe("/production/projects/p-1/overview");
    expect(overview?.closest("details")).toBeNull();
    expect(within(nav).queryByText("더보기")).toBeNull();
  });

  it("시작 상태에서는 지금 단계가 없으면 기획 그룹 하나만 펼친다", () => {
    const nav = renderNav({ surface: "overview" });
    expect(openGroupLabels(nav)).toEqual(["기획"]);
  });

  it("지금 단계가 있으면 그 단계 그룹을 펼치고 '지금 단계'를 표시한다", () => {
    const nav = renderNav({ surface: "overview", currentStageId: "review" });
    expect(openGroupLabels(nav)).toEqual(["검수"]);
    const marked = within(nav).getAllByText("지금 단계");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.closest("details")).toBe(group(nav, "검수"));
  });

  it("현재 화면이 속한 그룹은 지금 단계 그룹과 함께 펼쳐진 채 유지된다", () => {
    const nav = renderNav({ surface: "rights", currentStageId: "art" });
    expect(openGroupLabels(nav)).toEqual(["작화", "관리"]);
    const rights = within(group(nav, "관리")).getByRole("link", { name: /계약·정산/u });
    expect(rights.getAttribute("aria-current")).toBe("page");
  });

  it("aria-current는 현재 화면 링크에만 붙고, 전용 화면이 없는 단계의 바로가기에는 붙지 않는다", () => {
    const nav = renderNav({ surface: "manuscripts" });
    const current = within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]?.closest("details")).toBe(group(nav, "작화"));
    // 식자·연출의 바로가기도 원고 화면으로 가지만 현재 위치 표시는 작화의 전용 링크가 맡는다.
    const lettering = within(group(nav, "식자·연출")).getByRole("link");
    expect(lettering.getAttribute("href")).toBe("/production/projects/p-1/manuscripts");
    expect(lettering.getAttribute("aria-current")).toBeNull();
  });

  it("전용 화면이 없는 단계는 단계 정의의 첫 행동으로 이어지는 링크 하나를 둔다", () => {
    const nav = renderNav({ surface: "overview" });
    const lettering = within(group(nav, "식자·연출")).getAllByRole("link");
    expect(lettering).toHaveLength(1);
    expect(lettering[0]?.textContent).toContain("원고 확인하기");
    const publish = within(group(nav, "게시")).getAllByRole("link");
    expect(publish).toHaveLength(1);
    expect(publish[0]?.textContent).toContain("게시 명령 센터 열기");
    // 프로젝트 밖 경로는 그대로 쓴다.
    expect(publish[0]?.getAttribute("href")).toBe("/studio/publish");
  });

  it("프로젝트 id는 경로에 안전하게 인코딩된다", () => {
    const nav = renderNav({ surface: "overview", projectId: "작품 1/ep" });
    const planning = within(group(nav, "기획")).getByRole("link");
    expect(planning.getAttribute("href")).toBe(`/production/projects/${encodeURIComponent("작품 1/ep")}/planning`);
  });

  it("그룹은 요약 버튼으로 열고 닫을 수 있고 서로 독립적이다", () => {
    const nav = renderNav({ surface: "overview" });
    const operate = group(nav, "운영");
    expect(operate.open).toBe(false);
    const summary = operate.querySelector("summary");
    if (!summary) throw new Error("운영 그룹에 summary가 없습니다.");
    fireEvent.click(summary);
    expect(operate.open).toBe(true);
    // 다른 그룹(기획)은 그대로 열려 있다.
    expect(group(nav, "기획").open).toBe(true);
    fireEvent.click(summary);
    expect(operate.open).toBe(false);
  });

  it("각 그룹의 접근 가능한 이름은 단계 이름 그대로다", () => {
    const nav = renderNav({ surface: "overview", currentStageId: "art" });
    for (const label of ALL_GROUP_LABELS) {
      // 지금 단계 표시가 붙어도 그룹 이름(aria-label)은 바뀌지 않는다.
      expect(within(nav).getAllByRole("group", { name: label })).toHaveLength(1);
    }
  });
});
