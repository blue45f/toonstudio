// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creatorStoryDraftStorageKey } from "@/shared/lib/creator-workspace-persistence";
import { useI18n } from "@/shared/lib/i18n";

import { readStudioProjectLibrary } from "../studio-project-library-store";

import { AiQuickBlueprintComposer } from "./AiQuickBlueprintComposer";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe-url">{`${location.pathname}${location.search}`}</output>;
}

describe("AiQuickBlueprintComposer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    useI18n.setState({ lang: "ko" });
  });

  it("원탭 아이디어 스파크로 콘티를 생성하고 대사 리믹스 후 스튜디오 프로젝트로 연다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("ai-blueprint-result-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "던전 입구 심야 카페" }));

    const resultPanel = screen.getByTestId("ai-blueprint-result-panel");
    expect(resultPanel).toBeTruthy();
    const panels = within(resultPanel).getByRole("list", { name: "생성된 컷 콘티 목록" });
    expect(within(panels).getAllByRole("listitem")).toHaveLength(6);

    fireEvent.click(within(resultPanel).getAllByRole("button", { name: "극적으로" })[0] as HTMLElement);
    fireEvent.click(screen.getByTestId("ai-blueprint-open-studio-btn"));

    expect(screen.getByTestId("probe-url").textContent).toMatch(/^\/studio\/p\/[^/]+\/story\?view=script&uiMode=simple$/u);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });

  it("스토리 연구실 채우기 버튼이 8항목 초안을 세션 저장소에 기록하고 이동한다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer initialIdea="비 오는 날 헌책방에서 내일의 일기장을 주웠다" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ai-blueprint-open-storylab-btn"));
    expect(screen.getByTestId("probe-url").textContent).toContain("/story-lab?idea=");
    const saved = window.sessionStorage.getItem(creatorStoryDraftStorageKey("guest"));
    expect(saved).not.toBeNull();
    expect(saved).toContain("헌책방");
  });

  it("영어 로케일에서 열림·생성 상태 모두 한글이 한 글자도 노출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer />
      </MemoryRouter>,
    );

    const composer = screen.getByTestId("ai-quick-blueprint-composer");
    expect(composer.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(within(composer).getByRole("button", { name: "Midnight cafe at a dungeon gate" }));
    expect(composer.textContent).not.toMatch(/[가-힣]/u);
    for (const el of composer.querySelectorAll("[aria-label], [placeholder]")) {
      expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("placeholder") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });
});
