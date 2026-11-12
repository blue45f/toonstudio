// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { readStudioExactResumeContext, studioExactResumeStorageKey, writeStudioExactResumeContext } from "../studio-exact-resume-context";
import { ensureInitialStudioProjectDocument, setStudioProjectDocumentWorkspace, studioProjectDocumentStorageKey, trashStudioProjectDocument } from "../studio-project-document-store";
import { archiveStudioProject, createStudioProject, markStudioProjectOpened, readStudioProjectLibrary, trashStudioProject } from "../studio-project-library-store";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

const DATE = "2026-11-07T00:00:00.000Z";

beforeEach(() => { window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

function seedResume() {
  const project = createStudioProject(window.localStorage, { id: "resume-regression", title: "이어하기 회귀", kind: "webtoon", createdAt: DATE });
  const document = ensureInitialStudioProjectDocument(window.localStorage, { projectId: project.id, projectTitle: project.title, projectKind: project.kind, createdAt: DATE });
  markStudioProjectOpened(window.localStorage, project.id, document.id, { at: DATE });
  return { project, document };
}

function showLibrary(view = "active") {
  const rendered = render(<MemoryRouter initialEntries={[view === "active" ? "/studio" : `/studio?view=${view}`]}><StudioProjectLibraryPage /></MemoryRouter>);
  const search = screen.getByRole("textbox", { name: "프로젝트 검색" });
  fireEvent.change(search, { target: { value: "회귀" } });
  return { ...rendered, search };
}

function card() {
  const article = screen.getByRole("heading", { name: "이어하기 회귀" }).closest("article");
  if (!article) throw new Error("이어하기 카드가 없습니다.");
  return within(article);
}

describe("회수한 홈 후보의 이어하기 캐시", () => {
  it("목록을 다시 읽지 않아도 같은 탭 exact-resume 변경을 즉시 표시한다", async () => {
    const { project, document } = seedResume();
    showLibrary();
    const before = readStudioProjectLibrary(window.localStorage);
    const link = card().getByRole("link", { name: "이어서 작업" });
    expect(link.getAttribute("href")).not.toContain("focus=cut%3A9");
    await act(async () => {
      writeStudioExactResumeContext(window.localStorage, { projectId: project.id, documentId: document.id, workspace: "comic", pageId: "page-9", focus: "cut:9", zoom: 1.5, updatedAt: DATE }, window);
    });
    await waitFor(() => expect(link.getAttribute("href")).toContain("focus=cut%3A9"));
    expect(card().getByText("최근 페이지 · 확대 150%")).toBeTruthy();
    expect(readStudioProjectLibrary(window.localStorage)).toEqual(before);
  });

  it("문서 기본 workspace 변경과 마지막 문서 휴지통 이동을 반영한다", async () => {
    const { project, document } = seedResume();
    showLibrary();
    const workspace = document.defaultWorkspace === "comic" ? "draw" : "comic";
    act(() => { setStudioProjectDocumentWorkspace(window.localStorage, project.id, document.id, workspace, { target: window }); });
    await waitFor(() => expect(card().getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toContain(`workspace=${workspace}`));
    act(() => { trashStudioProjectDocument(window.localStorage, project.id, document.id, { target: window }); });
    await waitFor(() => expect(card().getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toBe(`/studio/p/${project.id}/overview`));
  });

  it.each(["exact", "documents", "clear"] as const)("다른 탭의 %s 저장소 변경도 다시 렌더링한다", async (kind) => {
    const { project, document } = seedResume();
    writeStudioExactResumeContext(window.localStorage, { projectId: project.id, documentId: document.id, workspace: "comic", pageId: "page-old", zoom: 1.25, updatedAt: DATE });
    showLibrary();
    expect(card().getByText("최근 페이지 · 확대 125%")).toBeTruthy();
    expect(readStudioExactResumeContext(window.localStorage, project.id, document.id)?.pageId).toBe("page-old");
    await act(async () => {
      let key: string | null = null;
      if (kind === "exact") {
        writeStudioExactResumeContext(window.localStorage, { projectId: project.id, documentId: document.id, workspace: "comic", pageId: "page-new", zoom: 1.5, updatedAt: DATE });
        key = studioExactResumeStorageKey(project.id, document.id);
      } else if (kind === "documents") {
        trashStudioProjectDocument(window.localStorage, project.id, document.id);
        key = studioProjectDocumentStorageKey(project.id);
      } else {
        window.localStorage.removeItem(studioExactResumeStorageKey(project.id, document.id));
      }
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: window.localStorage }));
    });
    await waitFor(() => expect(card().queryByText("최근 페이지 · 확대 125%")).toBeNull());
    if (kind === "exact") {
      expect(card().getByText("최근 페이지 · 확대 150%")).toBeTruthy();
      expect(readStudioExactResumeContext(window.localStorage, project.id, document.id)).toMatchObject({ pageId: "page-new", zoom: 1.5 });
    }
    if (kind === "documents") expect(card().getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toBe(`/studio/p/${project.id}/overview`);
    if (kind === "clear") expect(readStudioExactResumeContext(window.localStorage, project.id, document.id)).toBeNull();
  });
});

describe("더 보기의 키보드 위치", () => {
  for (const section of ["temporary", "saved", "recovery"] as const) {
    for (const last of [false, true]) {
      it(`${section} ${last ? "마지막" : "중간"} 확장에서 처음 추가한 작업으로 초점을 옮긴다`, async () => {
        const initial = 24;
        const count = initial + (last ? 2 : 30);
        for (let i = 0; i < count; i += 1) {
          const id = `focus-${i}`;
          createStudioProject(window.localStorage, { id, title: `회귀 작품 ${String(i).padStart(2, "0")}`, kind: "webtoon", createdAt: DATE });
          if (section === "saved") ensureStudioSaveProfile(window.localStorage, id, { provider: "local-file", now: DATE });
          if (section === "recovery") archiveStudioProject(window.localStorage, id, { at: DATE });
        }
        const { container } = showLibrary(section === "recovery" ? "archived" : "active");
        if (section !== "recovery") fireEvent.click(screen.getByRole("button", { name: "작품 선택" }));
        const grid = section === "recovery" ? "recovery" : "active";
        const list = container.querySelector(grid === "recovery" ? '[data-studio-recovery-list]' : '[data-studio-project-grid="active"]');
        const more = container.querySelector<HTMLButtonElement>(`[data-studio-load-more="${grid}"]`);
        if (!list || !more) throw new Error("점진 표시 목록과 더 보기 버튼이 필요합니다.");
        expect(list.querySelectorAll('[data-studio-selection-checkbox]')).toHaveLength(initial);
        more.focus();
        fireEvent.click(more, { detail: 0 });
        const added = list.querySelectorAll('[data-studio-selection-checkbox]')[initial];
        await waitFor(() => expect(document.activeElement).toBe(added));
        expect(document.activeElement?.isConnected).toBe(true);
        expect(container.querySelector(`[data-studio-load-more="${grid}"]`) === null).toBe(last);
      });
    }
  }
});

describe("간결한 목록의 키보드 더 보기", () => {
  it("선택 모드가 아니면 처음 추가한 원고의 이어하기로 이동한다", async () => {
    for (let i = 0; i < 26; i += 1) createStudioProject(window.localStorage, {
      id: `browse-${i}`, title: `회귀 목록 ${i}`, kind: "webtoon", createdAt: DATE,
    });
    const { container } = showLibrary();
    expect(container.querySelectorAll('[data-studio-selection-checkbox]')).toHaveLength(0);
    const more = container.querySelector<HTMLButtonElement>('[data-studio-load-more="active"]');
    if (!more) throw new Error("작업 더 보기 버튼이 없습니다.");
    more.focus();
    fireEvent.click(more, { detail: 0 });
    const added = container.querySelectorAll('[data-studio-project-grid="active"] [data-studio-card-continue]')[24];
    await waitFor(() => expect(document.activeElement).toBe(added));
    expect(container.querySelector('[data-studio-load-more="active"]')).toBeNull();
  });
});

describe("기존 검색·전체 선택 계약", () => {
  it("조합 중 Enter와 Escape는 검색·초점을 바꾸지 않고 조합 후 Enter만 결과로 이동한다", () => {
    seedResume();
    const { search } = showLibrary();
    search.focus();
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "Escape", isComposing: true });
    expect((search as HTMLInputElement).value).toBe("회귀");
    fireEvent.keyDown(search, { key: "Enter", isComposing: false });
    expect(document.activeElement).toBe(card().getByRole("link", { name: "이어서 작업" }));
    fireEvent.keyDown(search, { key: "Escape", isComposing: false });
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("휴지통 전체 선택은 접힌 항목까지 포함하고 확인 취소 후에는 데이터를 유지한다", async () => {
    for (let i = 0; i < 30; i += 1) {
      const id = `trash-${i}`;
      createStudioProject(window.localStorage, { id, title: `회귀 휴지통 ${i}`, kind: "webtoon", createdAt: DATE });
      trashStudioProject(window.localStorage, id, { at: DATE });
    }
    const { container } = showLibrary("trash");
    expect(container.querySelectorAll("[data-studio-selection-checkbox]")).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "전체 선택 (30)" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 완전 삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "선택 완전 삭제" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "완전 삭제" }));
    await waitFor(() => expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0));
  });
});
