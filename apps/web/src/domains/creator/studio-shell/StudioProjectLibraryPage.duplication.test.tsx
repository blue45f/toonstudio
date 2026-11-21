// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";

import { studioAutosaveKey, type StudioAutosavePayload } from "../studio-autosave";
import * as sqliteModule from "../studio-autosave-sqlite-store";
import { ensureInitialStudioProjectDocument, readStudioProjectDocuments } from "../studio-project-document-store";
import { createStudioProject, markStudioProjectOpened, readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioProjectLibraryPage } from "./StudioProjectLibraryPage";
import { prepareStudioProjectLibraryCopyFixture } from "./studio-project-library-copy-test-fixture";

function workCard(title: string): HTMLElement {
  const card = screen.getByRole("heading", { name: title }).closest("article");
  if (!card) throw new Error("작업 카드가 없습니다.");
  return card;
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

it("게스트 원고를 내구 저장한 뒤에만 사용할 수 있는 복사본을 공개한다", async () => {
  const createdAt = "2026-11-21T00:00:00.000Z";
  const project = createStudioProject(window.localStorage, {
    id: "series-alpha", title: "작품 A", kind: "webtoon", createdAt,
  });
  const document = ensureInitialStudioProjectDocument(window.localStorage, {
    projectId: project.id, projectTitle: project.title, projectKind: project.kind, createdAt,
  });
  markStudioProjectOpened(window.localStorage, project.id, document.id, { at: createdAt });
  const sourceKey = studioAutosaveKey({ userId: null, workId: document.id });
  const payload: StudioAutosavePayload = {
    version: 2, savedAt: createdAt, currentPageId: "source-page",
    pagesList: [{ id: "source-page", canvasH: 1080, elements: [{
      id: "source-panel", type: "frame", x: 10, y: 20, width: 320, height: 480,
      bgColor: "#ffffff", stroke: "#111111",
    }] }],
  };
  const rows = new Map<string, string>();
  let releaseCopyWrite: () => void = () => { throw new Error("복사본 저장 대기 Promise가 초기화되지 않았습니다."); };
  const copyWrite = new Promise<void>((resolve) => { releaseCopyWrite = resolve; });
  let pendingCopyKey: string | null = null;
  // jsdom에 없는 기기 DB의 KV 포트만 대체한다. 원고 수집·복제·SQLite 직렬화·공개는 실제 제품 경로다.
  const sqlite = sqliteModule.createStudioAutosaveSqliteStore({
    kvGet: async (namespace, key) => rows.get(namespace + key) ?? null,
    kvSet: async (namespace, key, value) => {
      if (key.includes("copy-document-")) { pendingCopyKey = key; await copyWrite; }
      rows.set(namespace + key, value);
    },
  });
  await sqlite.write(sourceKey, payload);
  const original = await sqlite.read(sourceKey);
  vi.spyOn(sqliteModule, "acquireStudioAutosaveSqliteStore").mockResolvedValue(sqlite);
  const ownProjects = () => readStudioProjectLibrary(window.localStorage).projects
    .filter((entry) => entry.title.startsWith("작품 A"));

  const guest: SessionContextValue = { data: null, ready: true, status: "unauthenticated", update: async () => null };
  render(<SessionContext.Provider value={guest}>
    <MemoryRouter initialEntries={["/studio"]}><StudioProjectLibraryPage /></MemoryRouter>
  </SessionContext.Provider>);
  try {
    fireEvent.click(await screen.findByRole("button", { name: /작품 A 복제|Duplicate 작품 A/u }));
    await waitFor(() => { expect(pendingCopyKey).not.toBeNull(); });
    expect(ownProjects()).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "작품 A 복사본" })).toBeNull();
    expect(screen.queryByRole("link", { name: /복사본 열기|Open copy/u })).toBeNull();

    await act(async () => { releaseCopyWrite(); });
    const openCopy = await screen.findByRole("link", { name: /복사본 열기|Open copy/u });
    expect(ownProjects()).toHaveLength(2);
    expect(await screen.findByRole("heading", { name: "작품 A 복사본" })).toBeTruthy();
    const copy = ownProjects().find((entry) => entry.title === "작품 A 복사본");
    if (!copy) throw new Error("저장이 끝난 복사본 프로젝트가 없습니다.");
    const documents = readStudioProjectDocuments(window.localStorage, copy.id).documents;
    expect(documents).toHaveLength(1);
    const copiedDocument = documents[0];
    if (!copiedDocument) throw new Error("복사본 원고가 없습니다.");
    expect(copiedDocument.id).not.toBe(document.id);
    expect(copy.lastOpenedDocumentId).toBe(copiedDocument.id);
    expect(openCopy.getAttribute("href")).toContain(`/studio/p/${copy.id}/d/${copiedDocument.id}`);
    const copied = await sqlite.read(studioAutosaveKey({ userId: null, workId: copiedDocument.id }));
    if (copied?.state !== "snapshot") throw new Error("복사본 원고를 기기 저장소에서 다시 읽지 못했습니다.");
    expect(copied.payload.pagesList).toHaveLength(1);
    expect(copied.payload.pagesList[0]?.elements).toEqual(payload.pagesList[0]?.elements);
    expect(copied.payload.pagesList[0]?.id).not.toBe("source-page");
    expect(copied.payload.currentPageId).toBe(copied.payload.pagesList[0]?.id);
    expect(await sqlite.read(sourceKey)).toEqual(original);
  } finally { releaseCopyWrite(); }
});

it("creates a usable temporary duplicate", async () => {
  const fixture = await prepareStudioProjectLibraryCopyFixture(window.localStorage);
  render(
    <SessionContext.Provider value={{ status: "unauthenticated", ready: true, data: null, update: async () => null }}>
      <MemoryRouter initialEntries={["/studio"]}>
        <StudioProjectLibraryPage />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
  const original = await fixture.readOriginal();
  fireEvent.click(await screen.findByRole("button", { name: /작품 A 복제|Duplicate 작품 A/u }));
  const copy = await fixture.verifyCopy(original);
  await waitFor(() => {
    expect(within(workCard("작품 A 복사본")).getByText("작품 A 복사본")).toBeTruthy();
  });
  expect(screen.getByRole("link", { name: "복사본 열기" }).getAttribute("href")).toContain(copy.document.id);
});
