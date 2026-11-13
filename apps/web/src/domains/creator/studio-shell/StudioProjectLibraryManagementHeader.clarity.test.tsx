// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { EXAMPLE_PROJECT_ID } from "../studio-example-project-content";
import { archiveStudioProject, createStudioProject, STUDIO_PROJECT_LIBRARY_STORAGE_KEY, trashStudioProject } from "../studio-project-library-store";
import { SAMPLE_PROJECT_ID } from "../studio-sample-manuscript-content";
import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

function HeaderHarness({ content = false }: { content?: boolean }) {
  const controller = useStudioProjectLibraryManagementController();
  return <><StudioProjectLibraryManagementHeader controller={controller} />{content ? <StudioProjectLibraryManagementContent controller={controller} /> : null}</>;
}

function showHeader(route = "/studio", content = false) {
  return render(<MemoryRouter initialEntries={[route]}><HeaderHarness content={content} /></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

describe("작업 홈의 첫 행동과 상태 안내", () => {
  it.each(["archived", "trash"])("%s의 새 작업도 같은 시작 화면으로 이동한다", (view) => {
    showHeader(`/studio?view=${view}`, true);
    expect(screen.getByRole("link", { name: "새 작업" }).getAttribute("href")).toBe("/create");
  });

  it("저장소를 읽지 못해도 새 작업은 시작 화면으로, 파일 복구는 가져오기로 안내한다", () => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === STUDIO_PROJECT_LIBRARY_STORAGE_KEY) throw new DOMException("Storage unavailable", "SecurityError");
      return read.call(this, key);
    });
    showHeader();
    const recovery = screen.getByRole("alert");
    expect(within(recovery).getByRole("link", { name: "파일에서 열기" }).getAttribute("href")).toBe("/studio/import");
    expect(within(recovery).getByRole("link", { name: "새 작업 시작" }).getAttribute("href")).toBe("/create");
  });

  it("빈 목록에서도 방향·시간 약속 없이 시작과 불러오기를 안내한다", () => {
    const { container } = showHeader();
    expect(screen.getByText("새 작업을 시작하거나 원고 파일을 가져오세요.")).toBeTruthy();
    expect(container.querySelector(".studio-library-first-work")).toBeNull();
    expect(screen.getByRole("link", { name: "새 작업" }).getAttribute("href")).toBe("/create");
    expect(screen.getByRole("link", { name: "파일 가져오기" }).getAttribute("href")).toBe("/studio/import");
    expect(screen.queryByRole("link", { name: "작업 복구" })).toBeNull();
    expect(container.querySelector('[data-studio-other-starts="true"]')).toBeNull();
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
    const { container } = showHeader("/studio", true);
    const recent = screen.getByRole("region", { name: "최근 작업 빠른 이어하기" });
    const badge = recent.querySelector('[data-studio-recent-save-badge="true"]');
    expect(badge).toBeNull();
    expect(recent.textContent).not.toMatch(/자동저장됨|정식 저장 연결됨|저장 위치 지정됨/u);
    const newWork = screen.getByRole("link", { name: "새 작업" });
    expect(newWork.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(recent).queryByRole("list", { name: "5단계 제작 공정 흐름" })).toBeNull();
    expect(within(recent).getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toContain(`/studio/p/${project.id}/`);
    expect(within(recent).getByRole("link", { name: "작품 단계" }).getAttribute("href")).toBe(`/studio/p/${project.id}/overview`);
    expect(container.querySelector<HTMLDetailsElement>('[data-studio-other-starts="true"]')?.open).toBe(false);
    expect(within(recent).getByRole("link", { name: "이어서 작업" }).getAttribute("data-studio-library-primary-action")).toBe("resume");
  });

  it("기본 예제 두 개를 개인 작업과 구분하고 검색은 직접, 일괄 선택은 이름 있는 보조 도구로 제공한다", () => {
    for (const [id, title] of [[EXAMPLE_PROJECT_ID, "기본 예제"], [SAMPLE_PROJECT_ID, "기본 샘플"]]) {
      createStudioProject(window.localStorage, { id, title, kind: "webtoon", createdAt: "2026-11-11T00:00:00.000Z" });
    }
    const { container } = showHeader("/studio", true);
    expect(screen.getByText("개인 작업은 아직 없습니다. 아래 예제를 열어 체험할 수 있어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^내 작업\s*2$/u })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "최근 작업 빠른 이어하기" })).toBeNull();
    expect(container.querySelector(".studio-library-first-work")).toBeNull();
    const search = screen.getByRole("textbox", { name: "프로젝트 검색" });
    expect(search.closest("details")).toBeNull();
    const selectAll = screen.getByRole("button", { name: "전체 선택 (2)" });
    const selectionTools = selectAll.closest("details");
    expect(selectionTools?.open).toBe(false);
    expect(selectionTools?.querySelector("summary")?.textContent).toBe("정렬·선택");
    fireEvent.click(screen.getByText("정렬·선택", { exact: true }));
    expect(selectionTools?.open).toBe(true);
    fireEvent.click(selectAll);
    expect(screen.getByRole("region", { name: "선택 작업" }).textContent).toContain("2개 선택");
    fireEvent.click(screen.getByText("정렬·선택", { exact: true }));
    expect(selectionTools?.open).toBe(false);
    expect(screen.getByRole("region", { name: "선택 작업" }).textContent).toContain("2개 선택");
    fireEvent.change(search, { target: { value: "기본 예제" } });
    fireEvent.click(screen.getByText("정렬·선택", { exact: true }));
    expect((search as HTMLInputElement).value).toBe("기본 예제");
    expect(screen.getByRole("button", { name: "전체 선택 (1)" })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
  });

  it.each(["archived", "trash"])("%s에서는 복원에 필요한 선택을 접지 않는다", (view) => {
    const project = createStudioProject(window.localStorage, { id: "recover-work", title: "복원할 작품", kind: "webtoon" });
    if (view === "archived") archiveStudioProject(window.localStorage, project.id);
    else trashStudioProject(window.localStorage, project.id);
    showHeader(`/studio?view=${view}`);
    const selectAll = screen.getByRole("button", { name: "전체 선택 (1)" });
    expect(selectAll.closest("details")).toBeNull();
    fireEvent.click(selectAll);
    expect(screen.getByRole("region", { name: "선택 작업" }).textContent).toContain("1개 선택");
    expect(screen.getByRole("button", { name: "선택 복원" })).toBeTruthy();
  });

});
