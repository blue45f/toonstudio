// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAllToolsCatalog } from "../StudioAllToolsCatalog";
import {
  installStudioCommandExecutionBindings,
  resetStudioCommandExecutionBindingsForTests,
} from "../studio-command-execution-registry";
import { searchStudio } from "../studio-command-search";
import { subscribeStudioCommandSearchRequests } from "../studio-help-center-channel";
import { StudioCommandSearchDialog } from "../StudioCommandSearchDialog";
import {
  StudioProjectCenterSearch,
  StudioProjectCenterSection,
} from "../StudioProjectCenterSearch";

import {
  searchUnavailableStudioFeaturesForDocument,
  studioDiscoverableSearchIndex,
} from "./studio-command-search-unavailability";

afterEach(() => {
  cleanup();
  resetStudioCommandExecutionBindingsForTests();
  window.localStorage.clear();
});

describe("Item 13 — 현 문서 불가 검색 항목의 이유·필요 모드·접근 가능한 대안 안내", () => {
  it("선택·비드로잉 상태에서도 맥락 전용 속성(자간·글자색·브러시 엔진)이 0건으로 사라지지 않는다", () => {
    const index = studioDiscoverableSearchIndex();
    for (const query of ["자간", "글자색", "브러시 엔진", "그리기 도구 설정"]) {
      const outcome = searchStudio(query, {}, index);
      expect(outcome.totalMatched, `${query} 누락`).toBeGreaterThan(0);
    }
  });

  it("빈 캔버스·선택 도구 상태에서 '자간' 검색 시 이유·필요 모드·문자 도구 전환 대안이 작동한다", () => {
    const switchLettering = vi.fn();
    const onNavigateInspector = vi.fn();
    const onClose = vi.fn();
    installStudioCommandExecutionBindings([
      {
        commandId: "tool.lettering",
        label: "문자·말풍선",
        execute: switchLettering,
        disabled: false,
      },
    ]);

    render(
      <StudioCommandSearchDialog
        open
        onClose={onClose}
        onNavigateInspector={onNavigateInspector}
        inspectorContext={{
          hasSelection: false,
          selectedType: null,
          drawing: false,
          imageToolsAvailable: false,
        }}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "자간" } });

    const option = screen.getByRole("option", { name: /문단 · 정렬과 자간·행간/u });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.querySelector("[data-search-unavailable-reason]")?.textContent).toContain("글자·말풍선");
    expect(option.querySelector("[data-search-required-mode]")?.textContent).toContain("필요 모드");
    expect(option.textContent).not.toContain("실행");

    const altButton = screen.getByRole("button", { name: /문자·말풍선 도구 켜기/u });
    fireEvent.click(altButton);
    expect(switchLettering).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("Alt+Enter 로도 첫 번째 접근 가능한 대안을 바로 실행할 수 있다", () => {
    const onNavigateInspector = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioCommandSearchDialog
        open
        onClose={onClose}
        onNavigateInspector={onNavigateInspector}
        inspectorContext={{
          hasSelection: false,
          selectedType: null,
          drawing: false,
          imageToolsAvailable: true,
        }}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "자유 변형" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", altKey: true });

    expect(onNavigateInspector).toHaveBeenCalledWith({ primary: "layers" });
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("좌측 전체 도구 검색에서 메뉴·인스펙터 전용 항목('가우시안 블러') 검색 시 통합 검색으로 검색어를 넘긴다", () => {
    const received: { scope?: string; query?: string }[] = [];
    const unsub = subscribeStudioCommandSearchRequests((req) => received.push(req));
    const onUsed = vi.fn();

    try {
      render(
        <StudioAllToolsCatalog
          definitions={{} as Parameters<typeof StudioAllToolsCatalog>[0]["definitions"]}
          pinned={["select"]}
          query="가우시안 블러"
          onQuery={vi.fn()}
          onPin={vi.fn()}
          onUsed={onUsed}
        />,
      );

      expect(screen.queryByText(/일치하는 도구가 없습니다/u)).toBeNull();
      const region = screen.getByRole("region", { name: /다른 메뉴·인스펙터에 있는 관련 기능 안내/u });
      expect(within(region).getByText(/필요 모드:/u)).toBeTruthy();

      fireEvent.click(within(region).getByRole("button", { name: /통합 기능·설정 검색에서 “가우시안 블러” 열기/u }));
      expect(onUsed).toHaveBeenCalledOnce();
      expect(received).toEqual([{ scope: "all", query: "가우시안 블러" }]);
    } finally {
      unsub();
    }
  });

  it("프로젝트 센터 검색에서 비활성 항목 검색 시 이유·필요 모드와 구획 이동 대안을 제공한다", async () => {
    render(
      <div data-studio-project-actions-menu="true">
        <StudioProjectCenterSearch />
        <StudioProjectCenterSection
          title="내보내기 · 백업"
          description="프로젝트 사본과 장기 보관 파일을 관리합니다."
        />
        <button type="button" title="프로젝트를 안전하게 보관" disabled>
          아카이브 백업
        </button>
      </div>,
    );

    const search = screen.getByRole("searchbox", { name: "프로젝트 센터 도구 검색" });
    fireEvent.change(search, { target: { value: "아카이브" } });

    const guidance = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('[data-project-center-disabled-guidance="true"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(guidance.textContent).toContain("이유:");
    expect(guidance.textContent).toContain("필요 모드:");

    const sectionJump = within(guidance).getByRole("button", { name: /내보내기 · 백업 구획에서 조건 확인/u });
    fireEvent.click(sectionJump);
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("스토리·기획 비캔버스 문서에서 스튜디오 전용 기능 검색 시 이유·필요 모드·작품 편집기 경로를 반환한다", () => {
    const storyMatches = searchUnavailableStudioFeaturesForDocument(
      "가우시안 블러",
      "/studio/p/project-demo-42/story",
    );
    expect(storyMatches.length).toBeGreaterThan(0);
    expect(storyMatches[0]?.reason).toContain("스토리·기획 문서");
    expect(storyMatches[0]?.requiredMode).toContain("원고 편집기");
    expect(storyMatches[0]?.primaryHref).toBe("/studio/work/project-demo-42/canvas");
    expect(storyMatches[0]?.primaryActionLabel).toBe("이 작품 원고 편집기 열기");
  });
});
