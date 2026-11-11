// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { PersonalCloudConnectionStatus } from "../save-first/personal-cloud-client";
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
  updateStudioProjectThumbnailUrl,
} from "../studio-project-library-store";
import {
  ensureStudioSaveProfile,
  readStudioSaveProfiles,
} from "../save-first/studio-save-profile";
import { SAMPLE_PROJECT_ID, SAMPLE_PROJECT_TITLE } from "../studio-sample-manuscript-content";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";

const personalCloudClientMocks = vi.hoisted(() => ({
  listPersonalCloudConnections: vi.fn(),
  startPersonalCloudConnection: vi.fn(),
  getPersonalCloudAccessToken: vi.fn(),
  disconnectPersonalCloud: vi.fn(),
}));

vi.mock("../save-first/personal-cloud-client", () => ({
  PERSONAL_CLOUD_PROVIDER_IDS: ["google-drive", "dropbox", "onedrive"] as const,
  listPersonalCloudConnections: personalCloudClientMocks.listPersonalCloudConnections,
  startPersonalCloudConnection: personalCloudClientMocks.startPersonalCloudConnection,
  getPersonalCloudAccessToken: personalCloudClientMocks.getPersonalCloudAccessToken,
  disconnectPersonalCloud: personalCloudClientMocks.disconnectPersonalCloud,
}));

function temporaryWorkRegion(): HTMLElement {
  return screen.getByRole("region", { name: /^임시 작업|^Temporary work/u });
}

beforeEach(() => {
  window.localStorage.clear();
  personalCloudClientMocks.listPersonalCloudConnections.mockReset();
  personalCloudClientMocks.listPersonalCloudConnections.mockResolvedValue([]);
  personalCloudClientMocks.startPersonalCloudConnection.mockReset();
  personalCloudClientMocks.getPersonalCloudAccessToken.mockReset();
  personalCloudClientMocks.disconnectPersonalCloud.mockReset();
  personalCloudClientMocks.disconnectPersonalCloud.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioProjectLibraryPage", () => {
  it("핵심 생성과 가져오기는 유지하고 부가 관리 도구만 접는다", () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );
    const title = screen.getByRole("heading", { level: 1, name: /내 작업|My work/u });
    const toolbar = title.closest("section");
    if (!toolbar) throw new Error("내 작업 도구 영역이 없습니다.");
    const tools = within(toolbar);
    const create = tools.getByRole("link", { name: /^새 작업$|^New work$/u });
    const importFiles = tools.getByRole("link", { name: /^파일 가져오기$|^Import files$/u });
    expect(create.closest("details")).toBeNull();
    expect(importFiles.closest("details")).toBeNull();
    expect(create.compareDocumentPosition(importFiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const summary = tools.getByText(/저장·내보내기·제작 관리|Save, export and production/u);
    const details = summary.closest("details");
    if (!details) throw new Error("부가 관리 도구 접기 영역이 없습니다.");
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByRole("link", { name: /저장·백업|Save & backup/u }).getAttribute("href")).toBe("/studio?view=storage");
    expect(within(details).getByRole("link", { name: /^제작 관리$|^Production management$/u }).getAttribute("href")).toBe("/production");
    fireEvent.click(summary);
    expect(details.open).toBe(false);
    expect(tools.getByRole("textbox", { name: /프로젝트 검색|Search projects/u }).closest("details")).toBeNull();
  });

  it("예제 시딩은 유지하면서 두 연습 안내보다 실제 작업을 먼저 보여 준다", async () => {
    createStudioProject(window.localStorage, {
      id: "work-before-guides",
      title: "안내보다 먼저 볼 작업",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );
    const work = await screen.findByRole("heading", { name: "안내보다 먼저 볼 작업" });
    const example = await screen.findByRole("heading", { name: /예제 프로젝트로 한 컷을 완주해 보세요|Finish one panel with the example project/u });
    const sample = await screen.findByRole("heading", { name: /완성 원고를 뜯어보고, 따라 그려 보세요|Take a finished manuscript apart, then trace it/u });
    expect(work.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(work.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "안내보다 먼저 볼 작업" })).toBe(work);
    expect(screen.getByRole("heading", { name: /예제 프로젝트로 한 컷을 완주해 보세요|Finish one panel with the example project/u })).toBe(example);
    expect(screen.getByRole("heading", { name: /완성 원고를 뜯어보고, 따라 그려 보세요|Take a finished manuscript apart, then trace it/u })).toBe(sample);
  });

  it("기본 접힌 시작 안내보다 작업과 핵심 동선을 먼저 보여 준다", () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    const title = screen.getByRole("heading", { level: 1, name: /내 작업|My work/u });
    const summary = screen.getByText(/시작 가이드와 추천 도구|Getting started and recommended tools/u);
    const guide = summary.closest("details");
    expect(guide?.open).toBe(false);
    expect(title.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const toolbar = title.closest("section");
    if (!toolbar) throw new Error("내 작업 제목을 포함한 도구 영역이 없습니다.");
    expect(within(toolbar).getByRole("link", { name: /^새 작업$|^New work$/u }).getAttribute("href")).toBe("/create");
    expect(within(toolbar).getByRole("link", { name: /^파일 가져오기$|^Import files$/u }).getAttribute("href")).toBe("/studio/import");

    fireEvent.click(summary);
    expect(guide?.open).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: /오늘은 어떤 이야기를 만들까요|What story will you create today/u })).toBeTruthy();
    fireEvent.click(summary);
    expect(guide?.open).toBe(false);
    fireEvent.click(summary);
    expect(guide?.open).toBe(true);
  });

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
    expect(screen.getByText("최근 페이지 · 확대 140% · 선택 1개")).toBeTruthy();
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
    fireEvent.click(screen.getByText(/시작 가이드와 추천 도구|Getting started and recommended tools/u));
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

  it("recovers from an empty search filter in one click and exposes start and reopen links", async () => {
    createStudioProject(window.localStorage, {
      id: "series-alpha",
      title: "검색 대상 작품",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "검색 대상 작품" })).toBeTruthy();

    const searchInput = screen.getByPlaceholderText(/제목·종류·설명 검색|Search title, type or description/u);
    fireEvent.change(searchInput, { target: { value: "일치하지않는검색어" } });

    expect(await screen.findByRole("heading", { name: /검색 결과가 없습니다|No matching projects/u })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /\.toonstudio 파일 열기|Open \.toonstudio file/u }).length).toBeGreaterThan(0);

    const clearButtons = screen.getAllByRole("button", { name: /검색어 지우기|Clear search/u });
    expect(clearButtons.length).toBeGreaterThan(0);
    fireEvent.click(clearButtons[0]!);

    expect(await screen.findByRole("heading", { name: "검색 대상 작품" })).toBeTruthy();
  });

  it("provides clear next actions when Archive or Trash is empty", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/studio?view=archived"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/보관한 프로젝트가 없습니다|There are no archived projects/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /내 작업으로 돌아가기|Back to My work/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("link", { name: /새 작업 시작|Start new work/u }).getAttribute("href")).toBe("/studio/new");
    unmount();

    render(
      <MemoryRouter initialEntries={["/studio?view=trash"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/휴지통이 비어 있습니다|Trash is empty/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /내 작업으로 돌아가기|Back to My work/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("link", { name: /백업 파일 열기|Open backup file/u }).getAttribute("href")).toBe("/studio/import");
  });

  it("preserves temporary autosaves and offers a retry action when saving a .toonstudio package fails", async () => {
    createStudioProject(window.localStorage, {
      id: "series-save-fail",
      title: "저장 실패 복구 작품",
      kind: "webtoon",
      createdAt: "2026-09-12T00:00:00.000Z",
    });
    ensureStudioSaveProfile(window.localStorage, "series-save-fail", {
      provider: "browser",
      now: "2026-09-12T00:00:00.000Z",
    });

    const targetWindow = window as Window & { showSaveFilePicker?: () => Promise<unknown> };
    const originalPicker = targetWindow.showSaveFilePicker;
    targetWindow.showSaveFilePicker = () => Promise.reject(new Error("Disk write failed"));

    try {
      render(
        <MemoryRouter initialEntries={["/studio"]}>
          <StudioProjectLibraryPage />
        </MemoryRouter>,
      );

      const card = (await screen.findByRole("heading", { name: "저장 실패 복구 작품" })).closest("article");
      expect(card).not.toBeNull();
      fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /^정식 저장$|^Save$/u }));

      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /파일·동기화 폴더|File or synced folder/u }));

      const status = await screen.findByRole("status");
      expect(within(status).getByText(/프로젝트 파일을 저장하지 못했습니다|The project file could not be saved/u)).toBeTruthy();
      expect(within(status).getByRole("button", { name: /다시 시도|Try again/u })).toBeTruthy();
      expect(within(temporaryWorkRegion()).getByText("저장 실패 복구 작품")).toBeTruthy();
    } finally {
      if (originalPicker) targetWindow.showSaveFilePicker = originalPicker;
      else delete targetWindow.showSaveFilePicker;
    }
  });

  it("shows empty-state guidance and next actions across storage, exports, and publications views", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const view of ["storage", "exports", "publications"] as const) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/studio?view=${view}`]}>
          <StudioProjectLibraryPage />
        </MemoryRouter>,
      );

      expect((await screen.findAllByRole("link", { name: /새 작품 만들기|Create new work/u })).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /파일 가져오기|\.toonstudio 파일 열기|Import files|Open \.toonstudio file/u }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /내 작업으로 이동|Go to My work/u }).length).toBeGreaterThan(0);
      unmount();
    }
    expect(personalCloudClientMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(3);
    const leakedPersonalCloudFetch = fetchSpy.mock.calls.some(([input]) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      return url.includes("/personal-cloud");
    });
    expect(leakedPersonalCloudFetch).toBe(false);
  });

  it("ignores delayed personal cloud status settlement after storage view unmounts and window tears down", async () => {
    const scheduleMacrotask = globalThis.setTimeout;
    for (const outcome of ["resolve", "reject"] as const) {
      let resolveConnections!: (value: readonly PersonalCloudConnectionStatus[]) => void;
      let rejectConnections!: (reason?: unknown) => void;
      const delayed = new Promise<readonly PersonalCloudConnectionStatus[]>((resolve, reject) => {
        resolveConnections = resolve;
        rejectConnections = reject;
      });
      personalCloudClientMocks.listPersonalCloudConnections.mockReturnValueOnce(delayed);

      const { unmount } = render(
        <MemoryRouter initialEntries={["/studio?view=storage"]}>
          <StudioProjectLibraryPage />
        </MemoryRouter>,
      );

      expect(await screen.findByRole("heading", { level: 1, name: /저장·백업|Save and backup/u })).toBeTruthy();
      unmount();

      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown) => {
        unhandledRejections.push(reason);
      };
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
      process.on("unhandledRejection", onUnhandledRejection);
      try {
        Reflect.deleteProperty(globalThis, "window");
        if (outcome === "resolve") {
          resolveConnections([]);
        } else {
          rejectConnections(new Error("late storage status failure"));
        }
        await delayed.catch(() => undefined);
        for (let turn = 0; turn < 3; turn += 1) {
          await Promise.resolve();
          await new Promise<void>((resolve) => {
            scheduleMacrotask(resolve, 0);
          });
        }
      } finally {
        if (windowDescriptor) {
          Object.defineProperty(globalThis, "window", windowDescriptor);
        }
        process.off("unhandledRejection", onUnhandledRejection);
      }
      expect(unhandledRejections).toEqual([]);
    }
  });

  it("exposes a top-level recent work quick-resume bar, highlights the newest card, clamps long titles, and falls back when cover image fails", async () => {
    const longTitle =
      "아주 긴 웹툰 연재 프로젝트 제목 — 시즌 1 제12화 비 오는 날의 네온사인 골목길과 끝없는 이야기 테스트 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    createStudioProject(window.localStorage, {
      id: "series-older",
      title: "이전 작업 작품",
      kind: "illustration",
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    createStudioProject(window.localStorage, {
      id: "series-recent",
      title: longTitle,
      kind: "webtoon",
      createdAt: "2026-09-15T00:00:00.000Z",
    });
    updateStudioProjectThumbnailUrl(
      window.localStorage,
      "series-recent",
      "data:image/png;base64,broken-thumbnail-payload",
    );

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    const recentBar = await screen.findByRole("region", { name: /최근 작업 빠른 이어하기|Quick resume recent work/u });
    expect(recentBar.getAttribute("data-studio-recent-work-bar")).toBe("true");
    expect(within(recentBar).getByText(longTitle).getAttribute("title")).toBe(longTitle);
    const openRecentLink = within(recentBar).getByRole("link", { name: /^최근 작업 열기$|^Open recent work$/u });
    expect(openRecentLink.getAttribute("href")).toContain("/studio/p/series-recent/");
    expect(within(recentBar).queryByRole("link", { name: /\.toonstudio 파일 열기|Open \.toonstudio file/u })).toBeNull();

    const recentHeading = await screen.findByRole("heading", { name: longTitle });
    expect(recentHeading.getAttribute("data-studio-project-title")).toBe("true");
    expect(recentHeading.getAttribute("title")).toBe(longTitle);
    expect(recentHeading.className).toContain("line-clamp-2");
    expect(recentHeading.className).toContain("break-words");
    const titleLink = within(recentHeading).getByRole("link", { name: longTitle });
    expect(titleLink.getAttribute("href")).toContain("/studio/p/series-recent/");

    const recentCard = recentHeading.closest("article") as HTMLElement | null;
    expect(recentCard).not.toBeNull();
    expect(recentCard?.getAttribute("data-recent-primary")).toBe("true");
    expect(recentCard?.querySelector('[data-studio-recent-badge="true"]')).not.toBeNull();

    const coverImg = recentCard?.querySelector('img[src^="data:image/png"]') as HTMLImageElement | null;
    expect(coverImg).not.toBeNull();
    fireEvent.error(coverImg!);

    await waitFor(() => {
      const fallback = recentCard?.querySelector('[data-thumbnail-fallback="true"]');
      expect(fallback).not.toBeNull();
      expect(fallback?.getAttribute("data-project-preview-state")).toBe("fallback");
    });
  });

  it("handles 200 synthetic projects with windowed initial render, Korean IME search, 0-result focus recovery, and keyboard selection", async () => {
    const baseMs = Date.parse("2026-11-07T12:00:00.000Z");
    const projects = [];
    const profiles: Record<string, unknown> = {};

    for (let i = 0; i < 200; i += 1) {
      const id = `proj-scale-${String(i + 1).padStart(3, "0")}`;
      const isTemporary = i % 2 === 0;
      const isLongKorean = i % 3 === 0;
      const updatedIso = new Date(baseMs - i * 60_000).toISOString();
      const createdIso = new Date(baseMs - (i + 500) * 60_000).toISOString();
      const title = isLongKorean
        ? `[합성${i + 1}] 초장문 한국어 웹툰 프로젝트 제목 — 왕립 마법학교 옥상에서 마주친 회귀자들과 계절학기 마감 직전의 야간 콘티 검수 기록 제${i + 1}화`
        : `합성${i + 1} 에피소드 작업본 (${isTemporary ? "임시" : "보관"})`;

      projects.push({
        id,
        title,
        kind: i % 5 === 0 ? "illustration" : "webtoon",
        status: "active",
        statusBeforeTrash: null,
        templateId: null,
        description: `합성픽스처 그룹${(i % 10) + 1}`,
        primaryLocale: "ko-KR",
        createdAt: createdIso,
        updatedAt: updatedIso,
        lastOpenedAt: updatedIso,
        lastOpenedDocumentId: null,
        thumbnailUrl: i % 4 === 0 ? "data:image/svg+xml;utf8,<svg broken" : null,
      });

      if (!isTemporary) {
        profiles[id] = {
          schemaVersion: 1,
          projectId: id,
          accessMode: "owner-only",
          storageMode: "hybrid",
          distributionState: "none",
          autoSave: true,
          createVersions: true,
          revision: 1,
          bindings: [
            {
              id: `bind-browser-${i + 1}`,
              provider: "browser",
              role: "working-copy",
              label: "브라우저 작업본",
              syncState: "synced",
              lastSyncedAt: updatedIso,
            },
            {
              id: `bind-file-${i + 1}`,
              provider: "local-file",
              role: "canonical",
              label: `synthetic-${i + 1}.toonstudio`,
              remotePath: `synthetic-${i + 1}.toonstudio`,
              syncState: "synced",
              lastSyncedAt: updatedIso,
            },
          ],
          lastManualSaveAt: updatedIso,
          lastExportAt: null,
          lastSubmissionAt: null,
          lastPublicationAt: null,
          updatedAt: updatedIso,
        };
      }
    }

    window.localStorage.setItem(
      "toonspectrum:studio-project-library:v1",
      JSON.stringify({
        schemaVersion: 1,
        projects,
        updatedAt: new Date(baseMs).toISOString(),
      }),
    );
    window.localStorage.setItem(
      "toonstudio.save-profiles.v1",
      JSON.stringify({
        schemaVersion: 1,
        profiles,
        updatedAt: new Date(baseMs).toISOString(),
      }),
    );

    const { container } = render(
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>,
    );

    const initialCards = container.querySelectorAll('[data-studio-project-card="true"]');
    expect(initialCards.length).toBe(24);

    const loadMoreTemporary = container.querySelector<HTMLButtonElement>('[data-studio-load-more="temporary"]');
    const loadMoreSaved = container.querySelector<HTMLButtonElement>('[data-studio-load-more="saved"]');
    expect(loadMoreTemporary).not.toBeNull();
    expect(loadMoreSaved).not.toBeNull();

    fireEvent.click(loadMoreTemporary!);
    expect(container.querySelectorAll('[data-studio-project-card="true"]').length).toBe(48);

    // Keyboard selection navigation (ArrowDown ->ArrowUp) and Escape to clear selection
    const checkboxes = container.querySelectorAll<HTMLButtonElement>('[data-studio-selection-checkbox="true"]');
    expect(checkboxes.length).toBe(48);
    checkboxes[0]!.focus();
    fireEvent.keyDown(checkboxes[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(checkboxes[1]);
    fireEvent.click(checkboxes[1]!);
    expect(checkboxes[1]!.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(checkboxes[1]!.getAttribute("aria-checked")).toBe("false");

    // Korean IME search composition and 0-result focus recovery
    const searchInput = screen.getByRole("textbox", { name: /프로젝트 검색|Search projects/u }) as HTMLInputElement;
    fireEvent.compositionStart(searchInput, { data: "합성199" });
    fireEvent.change(searchInput, { target: { value: "합성199" } });
    fireEvent.compositionEnd(searchInput, { data: "합성199" });

    expect(container.querySelector('[data-studio-recent-work-bar="true"]')).toBeNull();
    expect(container.querySelectorAll('[data-studio-project-card="true"]').length).toBe(1);
    expect(screen.getByRole("heading", { name: /합성199/u })).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "존재하지않는작품999" } });
    const emptySearchSection = container.querySelector('[data-studio-empty-state="search"]');
    expect(emptySearchSection).not.toBeNull();

    const clearButton = within(emptySearchSection as HTMLElement).getByRole("button", {
      name: /검색어 지우기|Clear search/u,
    });
    fireEvent.click(clearButton);
    expect(searchInput.value).toBe("");
    expect(document.activeElement).toBe(searchInput);
    expect(container.querySelectorAll('[data-studio-project-card="true"]').length).toBe(24);
  });
});
