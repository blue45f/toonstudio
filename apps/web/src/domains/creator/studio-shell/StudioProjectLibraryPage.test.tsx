// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { serializeStudioAutosave, studioAutosaveKey } from "../studio-autosave";
import { EXAMPLE_PROJECT_ID, EXAMPLE_PROJECT_TITLE } from "../studio-example-project-content";
import {
  studioExactResumeStorageKey,
  writeStudioExactResumeContext,
} from "../studio-exact-resume-context";
import {
  ensureInitialStudioProjectDocument,
  studioProjectDocumentStorageKey,
} from "../studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
  trashStudioProject,
} from "../studio-project-library-store";
import {
  ensureStudioSaveProfile,
  readStudioSaveProfiles,
} from "../save-first/studio-save-profile";
import { SAMPLE_PROJECT_ID, SAMPLE_PROJECT_TITLE } from "../studio-sample-manuscript-content";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

function temporaryWorkRegion(): HTMLElement {
  return screen.getByRole("region", { name: /^임시 작업|^Temporary work/u });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectLibraryPage", () => {
  it("separates temporary autosaves and opens destination choice on the first explicit save", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "작품 A",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    ensureStudioSaveProfile(window.localStorage, "series-alpha", {
      provider: "browser",
      now: "2026-09-12T00:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /^임시 작업|^Temporary work/u })).toBeTruthy();
    // 로비의 최근 프로젝트에도 같은 제목이 보이므로 목록 영역 안에서 확인한다.
    expect(within(temporaryWorkRegion()).getByText("작품 A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^정식 저장$|^Save$/u }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/어디에 정식 저장할까요|Where should this be formally saved/u)).toBeTruthy();
    expect(within(dialog).getByText(/파일·동기화 폴더|File or synced folder/u)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /개인 드라이브|Personal drive/u })).toBeTruthy();
  });

  it("creates a usable temporary duplicate", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "작품 A",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /작품 A 복제|Duplicate 작품 A/u }));
    await waitFor(() => {
      // 라이브러리 첫 진입 때 예제·샘플 프로젝트가 함께 심기므로, 전체 개수가 아니라
      // 작품 A 계열(원본 + 복사본)만 센다.
      expect(
        readStudioProjectLibrary(window.localStorage).projects
          .filter((project) => project.title.startsWith("작품 A")),
      ).toHaveLength(2);
    });
    await waitFor(() => {
      expect(within(temporaryWorkRegion()).getByText("작품 A 복사본")).toBeTruthy();
    });
  });

  it("renders the latest autosaved page as the My work thumbnail", async () => {
    const project = createStudioProject(window.localStorage, {
      id: "series-preview",
      title: "썸네일 작품",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    const document = ensureInitialStudioProjectDocument(window.localStorage, {
      projectId: project.id,
      projectTitle: project.title,
      projectKind: project.kind,
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    markStudioProjectOpened(window.localStorage, project.id, document.id, {
      at: "2026-09-12T00:01:00.000Z",
    });
    window.localStorage.setItem(
      studioAutosaveKey({ workId: document.id }),
      serializeStudioAutosave({
        version: 2,
        savedAt: "2026-09-12T00:02:00.000Z",
        currentPageId: "page-1",
        pagesList: [{
          id: "page-1",
          canvasH: 1080,
          elements: [{
            id: "panel-1",
            type: "frame",
            x: 80,
            y: 90,
            width: 560,
            height: 720,
            bgColor: "#ffffff",
            stroke: "#111111",
          }],
        }],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    const preview = await screen.findByRole("img", {
      name: "썸네일 작품 최근 작업 미리보기",
    });
    expect(preview).toBeTruthy();
    // 시딩된 예제·샘플 카드에도 같은 캡션이 붙으므로 이 작품의 카드 안에서 확인한다.
    const card = preview.closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("최근 자동 저장")).toBeTruthy();
  });

  it("continues from the exact document page, selection and viewport context", async () => {
    const project = createStudioProject(window.localStorage, {
      id: "series-resume",
      title: "이어보기 작품",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    const document = ensureInitialStudioProjectDocument(window.localStorage, {
      projectId: project.id,
      projectTitle: project.title,
      projectKind: project.kind,
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    markStudioProjectOpened(window.localStorage, project.id, document.id, {
      at: "2026-09-17T09:00:00.000Z",
    });
    writeStudioExactResumeContext(window.localStorage, {
      projectId: project.id,
      documentId: document.id,
      workspace: "comic",
      pageId: "page-8",
      selectedElementIds: ["bubble-4"],
      zoom: 1.4,
      scrollLeft: 220,
      scrollTop: 1_620,
      tool: "select",
      drawMode: "pen",
      focus: "cut:44",
      language: "ko-KR",
      sourceVersion: "approved-9",
      updatedAt: "2026-09-17T09:01:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("최근 위치 기억됨")).toBeTruthy();
    expect(screen.getByText("page-8 · 확대 140% · 선택 1개")).toBeTruthy();
    // 시딩된 예제·샘플 카드에도 "이어서 작업" 링크가 있으므로 이 작품의 카드 안에서 확인한다.
    const card = screen.getByRole("heading", { name: "이어보기 작품" }).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toBe(
      `/studio/p/${project.id}/d/${document.id}?focus=cut%3A44&language=ko-KR&resume=latest&version=approved-9&workspace=comic`,
    );
  });

  it("seeds the example project and the sample manuscript on first entry and lists them as recent work in the lobby", async () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    // 빈 기기의 첫 진입: 예제 프로젝트와 샘플 원고가 한 번씩 심긴다(StudioCreatorLobby.test.tsx 는 이 시딩을 꺼서 로비 규칙만 본다).
    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects.map((project) => project.id).sort())
        .toEqual([EXAMPLE_PROJECT_ID, SAMPLE_PROJECT_ID].sort());
    });
    // 로비는 심긴 작품도 같은 규칙으로 "최근 프로젝트"에 올린다.
    const lobby = screen.getByRole("region", { name: /툰스튜디오 크리에이터 로비|ToonStudio creator lobby/u });
    const recent = await within(lobby).findByRole("region", { name: /최근 프로젝트|Recent projects/u });
    await waitFor(() => {
      const labels = within(recent).getAllByRole("link", { name: /이어서 작업$|^Continue /u })
        .map((link) => link.getAttribute("aria-label") ?? "");
      expect(labels.some((label) => label.includes(EXAMPLE_PROJECT_TITLE))).toBe(true);
      expect(labels.some((label) => label.includes(SAMPLE_PROJECT_TITLE))).toBe(true);
    });
  });

  it("restores every project from Trash in one action", async () => {
    for (const [id, title] of [["series-alpha", "복원할 작품 A"], ["series-beta", "복원할 작품 B"]] as const) {
      createStudioProject(window.localStorage, {
        id,
        title,
        kind: "illustration",
        createdAt: "2026-09-12T00:00:00.000Z",
      });
      trashStudioProject(window.localStorage, id, { at: "2026-09-12T00:01:00.000Z" });
    }

    render(
      <MemoryRouter initialEntries={["/studio?view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^전체 복원$|^Restore all$/u }));
    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects.every((project) => project.status === "active"))
        .toBe(true);
    });
  });

  it("selects multiple Trash projects and permanently deletes their related metadata after confirmation", async () => {
    const resumeKeys: string[] = [];
    for (const [id, title] of [["series-alpha", "삭제할 작품 A"], ["series-beta", "삭제할 작품 B"]] as const) {
      const project = createStudioProject(window.localStorage, {
        id,
        title,
        kind: "webtoon",
        createdAt: "2026-09-12T00:00:00.000Z",
      });
      const document = ensureInitialStudioProjectDocument(window.localStorage, {
        projectId: project.id,
        projectTitle: project.title,
        projectKind: project.kind,
        createdAt: "2026-09-12T00:00:00.000Z",
      });
      writeStudioExactResumeContext(window.localStorage, {
        projectId: project.id,
        documentId: document.id,
        workspace: document.defaultWorkspace,
        pageId: "page-1",
        updatedAt: "2026-09-12T00:00:30.000Z",
      });
      resumeKeys.push(studioExactResumeStorageKey(project.id, document.id));
      trashStudioProject(window.localStorage, id, { at: "2026-09-12T00:01:00.000Z" });
      ensureStudioSaveProfile(window.localStorage, id, { provider: "browser" });
    }

    render(
      <MemoryRouter initialEntries={["/studio?view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /전체 선택 \(2\)|Select all \(2\)/u }));
    fireEvent.click(screen.getByRole("button", { name: /선택 완전 삭제|Delete selected/u }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^완전 삭제$|^Delete permanently$/u }));

    await waitFor(() => {
      expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    });
    expect(Object.keys(readStudioSaveProfiles(window.localStorage).profiles)).toHaveLength(0);
    expect(window.localStorage.getItem(studioProjectDocumentStorageKey("series-alpha"))).toBeNull();
    expect(window.localStorage.getItem(studioProjectDocumentStorageKey("series-beta"))).toBeNull();
    expect(resumeKeys.every((key) => window.localStorage.getItem(key) === null)).toBe(true);
  });
});
