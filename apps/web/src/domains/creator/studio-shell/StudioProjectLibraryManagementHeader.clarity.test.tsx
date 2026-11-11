// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { createStudioProject } from "../studio-project-library-store";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

function HeaderHarness() {
  const controller = useStudioProjectLibraryManagementController();
  return <StudioProjectLibraryManagementHeader controller={controller} />;
}

function showHeader() {
  return render(<MemoryRouter initialEntries={["/studio"]}><HeaderHarness /></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

describe("작업 홈의 첫 행동과 상태 안내", () => {
  it("빈 목록에서도 방향·시간 약속 없이 시작과 불러오기를 안내한다", () => {
    const { container } = showHeader();
    expect(screen.getByText("만들고 싶은 작업을 선택하세요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "새 작업" }).getAttribute("href")).toBe("/create");
    expect(screen.getByRole("link", { name: "파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
    expect(screen.getByRole("link", { name: "작업 복구" }).getAttribute("href")).toBe("/studio/recovery");
    const alternatives = container.querySelector<HTMLDetailsElement>('[data-studio-other-starts="true"]');
    expect(alternatives?.open).toBe(false);
    expect(alternatives?.querySelector("summary")?.textContent).toBe("다른 작업 시작");
    expect(Array.from(alternatives?.querySelectorAll("a") ?? [], (link) => link.getAttribute("href"))).toEqual([
      "/studio/new?kind=webtoon&template=webtoon-vertical", "/studio/new?kind=four-cut&template=four-cut-classic", "/studio/bg3d", "/studio/import",
    ]);
    expect(screen.getByRole("link", { name: "새 작업" }).getAttribute("data-studio-library-primary-action")).toBe("new");
    expect(container.textContent).not.toMatch(/OPFS|SQLite|1초|오른쪽 규격/u);
  });

  it.each([false, true])("저장 프로필 유무(%s)로 저장 완료 배지를 만들지 않는다", (configured) => {
    const project = createStudioProject(window.localStorage, {
      id: "clarity-recent",
      title: "이어서 작업할 작품",
      kind: "webtoon",
      createdAt: "2026-11-11T00:00:00.000Z",
    });
    if (configured) {
      ensureStudioSaveProfile(window.localStorage, project.id, { provider: "local-file", now: "2026-11-11T00:00:00.000Z" });
    }
    const { container } = showHeader();
    const recent = screen.getByRole("region", { name: "최근 작업 빠른 이어하기" });
    const badge = recent.querySelector('[data-studio-recent-save-badge="true"]');
    expect(badge).toBeNull();
    expect(recent.textContent).not.toMatch(/자동저장됨|정식 저장 연결됨|저장 위치 지정됨/u);
    expect(within(recent).queryByRole("list", { name: "5단계 제작 공정 흐름" })).toBeNull();
    expect(within(recent).getByRole("link", { name: "최근 작업 열기" }).getAttribute("href")).toContain(`/studio/p/${project.id}/`);
    expect(within(recent).getByRole("link", { name: "작품 단계" }).getAttribute("href")).toBe(`/studio/p/${project.id}/overview`);
    expect(container.querySelector<HTMLDetailsElement>('[data-studio-other-starts="true"]')?.open).toBe(false);
    expect(within(recent).getByRole("link", { name: "최근 작업 열기" }).getAttribute("data-studio-library-primary-action")).toBe("resume");
  });
});
