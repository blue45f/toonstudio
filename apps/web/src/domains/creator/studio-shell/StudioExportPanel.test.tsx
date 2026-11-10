// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import { StudioExportPanel } from "./StudioExportPanel";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioExportPanel", () => {
  it("필수 목적·형식 선택을 먼저 보여 주고 해상도·DPI 등 고급 설정은 기본으로 접어 둔다", () => {
    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-export-1" locale="ko" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "올릴 곳을 고르면 알맞은 규격을 자동으로 맞춰 드려요",
      }),
    ).toBeTruthy();

    expect(screen.getByTestId("studio-export-preset-summary").textContent).toContain("자동 맞춤 적용됨");

    const advanced = screen.getByTestId("studio-export-advanced-settings") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByRole("status").textContent).toContain("출고 전 점검을 마치고 결과를 저장했어요");

    const finalizeLink = screen.getByRole("link", { name: /편집기에서 최종 출력/u });
    expect(finalizeLink.getAttribute("href")).toBe("/studio/work/proj-export-1/publish");
  });

  it("로컬 원고가 있는 프로젝트는 실제 원고 크기로 규격 불일치를 잡아내고 비로그인 로컬 편집기와 공개 게시 동선을 분리한다", () => {
    createStudioProject(window.localStorage, {
      id: "proj-local-1",
      title: "내 첫 웹툰",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-local-1", {
      id: "doc-local-1",
      title: "1화 원고",
      kind: "webtoon",
      width: 1080,
      height: 8000,
    });

    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-local-1" locale="ko" />
      </MemoryRouter>,
    );

    // 실제 로컬 원고 크기(1080×8000)가 초기 점검 대상으로 반영된다.
    const summary = screen.getByTestId("studio-export-preset-summary");
    expect(summary.textContent).toContain("1080 × 8000 px");
    expect(summary.textContent).toContain("현재 원고 크기 기준");

    // 웹툰 플랫폼(800px 고정 폭) 점검 시 실제 원고 폭 차이를 잡아낸다.
    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByText(/꼭 고칠 항목 1건/u)).toBeTruthy();

    // 원클릭 권장값 복원 후 재검사하면 통과한다.
    fireEvent.click(screen.getByTestId("studio-export-reset-recommended"));
    expect(screen.getByTestId("studio-export-preset-summary").textContent).toContain("자동 맞춤 적용됨");
    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByText(/꼭 고칠 항목 0건/u)).toBeTruthy();

    // 비로그인 로컬 편집기 저장과 커뮤니티 공개 게시 링크가 명확히 분리된다.
    const finalizeLink = screen.getByTestId("studio-export-finalize-link");
    expect(finalizeLink.getAttribute("href")).toContain("/studio/p/proj-local-1/d/doc-local-1");
    const communityLink = screen.getByTestId("studio-export-community-publish");
    expect(communityLink.getAttribute("href")).toBe("/studio/publish");
  });
});
