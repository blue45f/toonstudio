// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioSpecialistSuiteBar } from "./StudioSpecialistSuiteBar";

afterEach(cleanup);

describe("StudioSpecialistSuiteBar", () => {
  it("preserves optional project context across the canonical specialist creator tools", () => {
    render(
      <MemoryRouter>
        <StudioSpecialistSuiteBar projectId="project-12" />
      </MemoryRouter>,
    );

    const nav = screen.getByTestId("studio-specialist-suite-bar");
    expect(within(nav).getByRole("link", { name: /정밀 3D 모델러/u }).getAttribute("href"))
      .toBe("/studio/3d/dcc/model?project=project-12");
    expect(within(nav).getByRole("link", { name: /3D 배경 편집기/u }).getAttribute("href"))
      .toBe("/studio/bg3d?project=project-12");
    expect(within(nav).getByRole("link", { name: /3D 캐릭터 셰이퍼/u }).getAttribute("href"))
      .toBe("/studio/assets/characters/new?project=project-12");
    expect(within(nav).getByRole("link", { name: /3D 포즈 스튜디오/u }).getAttribute("href"))
      .toBe("/studio/poser?project=project-12");
    expect(within(nav).getByRole("link", { name: "가상 스튜디오" }).getAttribute("href")).toBe("/studio/p/project-12/space");
    expect(within(nav).getByRole("link", { name: "3D 포즈 스튜디오" }).querySelector('[data-studio-tool-art="mannequin"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(within(nav).getByRole("link", { name: /2D → 3D 리프트/u }).getAttribute("href"))
      .toBe("/studio/lift3d?project=project-12");
    expect(within(nav).getByRole("link", { name: /브러시 스튜디오 V6/u }).getAttribute("href"))
      .toBe("/studio/assets/brushes/new?project=project-12");
    expect(within(nav).getByRole("link", { name: /장면 BGM · 오디오/u }).getAttribute("href"))
      .toBe("/studio/assets/audio?project=project-12");
    expect(within(nav).getByRole("link", { name: /PDF 원고 워크벤치/u }).getAttribute("href"))
      .toBe("/studio/pdf-workbench?project=project-12");
  });
  it("모바일에서 작업 이름을 펼쳐도 같은 11개 링크와 작품 문맥을 유지한다", () => {
    render(<MemoryRouter><StudioSpecialistSuiteBar projectId="panel-a" /></MemoryRouter>);
    const menu = screen.getByRole("button", { name: "전문 도구 전체" });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(11);
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(menu.getAttribute("aria-controls")!)?.classList.contains("grid")).toBe(true);
    expect(screen.getAllByRole("link")).toEqual(links);
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });
  it("작품을 지정하지 않은 가상 스튜디오는 개인 공간 로비로 연결한다", () => {
    render(<MemoryRouter><StudioSpecialistSuiteBar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "가상 스튜디오" }).getAttribute("href")).toBe("/studio/space");
  });
});
