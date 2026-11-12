// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioAutosave, studioAutosaveKey, type StudioAutosavePayload } from "../studio-autosave";
import { buildExampleProjectPage } from "../studio-example-project-content";
import { ensureInitialStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject, markStudioProjectOpened } from "../studio-project-library-store";
import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";

const ports = vi.hoisted(() => ({ opfs: vi.fn(), sqlite: vi.fn() }));
vi.mock("../studio-autosave-opfs-session", () => ({ createStudioAutosaveOpfsSession: ports.opfs }));
vi.mock("../studio-autosave-sqlite-store", () => ({ acquireStudioAutosaveSqliteStore: ports.sqlite }));

type Snapshot = { readonly state: "snapshot"; readonly savedAt: string; readonly payload: StudioAutosavePayload };
type Row = Snapshot | { readonly state: "cleared"; readonly savedAt: string } | null;
let sequence = 0;
const EARLY = "2026-11-12T10:00:00.000Z", LATE = "2026-11-12T11:00:00.000Z";

function fixture() {
  const project = createStudioProject(localStorage, { id: `thumbnail-${++sequence}`, title: "미리보기 원고", kind: "webtoon", createdAt: EARLY });
  const document = ensureInitialStudioProjectDocument(localStorage, {
    projectId: project.id, projectTitle: project.title, projectKind: project.kind, createdAt: EARLY,
  });
  return { project: markStudioProjectOpened(localStorage, project.id, document.id, { at: EARLY }), key: studioAutosaveKey({ workId: document.id }) };
}

function snapshot(fill: string, savedAt = EARLY): Snapshot {
  const page = buildExampleProjectPage();
  const elements = page.elements.map((element) => element.type === "frame" ? { ...element, bgColor: fill } : element);
  return { state: "snapshot", savedAt, payload: { version: 2, savedAt, currentPageId: page.id, pagesList: [{ ...page, elements }] } };
}

function session(read: () => Promise<Row>) {
  return { readLatest: vi.fn(read), dispose: vi.fn(async () => undefined), write: vi.fn(), clear: vi.fn() };
}

function useSources(key: string, opfs: Row, sqlite: Row) {
  const opened = session(async () => opfs);
  ports.opfs.mockImplementation(async (candidate: string) => candidate === key ? opened : null);
  ports.sqlite.mockResolvedValue({ read: vi.fn(async (candidate: string) => candidate === key ? sqlite : null) });
  return opened;
}

const expectFill = async (container: HTMLElement, fill: string) => waitFor(() => {
  expect(container.querySelector(`[data-project-preview-state="autosave"] svg rect[fill="${fill}"]`)).toBeTruthy();
  // 실제 원고 SVG 렌더러로 채색뿐 아니라 선화도 그린다. 로딩 아이콘/빈 이미지는 통과하지 않는다.
  expect(container.querySelectorAll('[data-project-preview-state="autosave"] svg polyline').length).toBeGreaterThan(0);
});

beforeEach(() => {
  localStorage.clear();
  ports.opfs.mockReset(); ports.sqlite.mockReset();
  ports.opfs.mockResolvedValue(null);
  ports.sqlite.mockResolvedValue({ read: vi.fn(async () => null) });
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("StudioProjectCardThumbnail durable preview", () => {
  it("SQLite가 열리지 않아도 실제 OPFS 원고를 읽기 전용으로 표시하고 세션을 닫는다", async () => {
    const { project, key } = fixture();
    const opened = useSources(key, snapshot("#bcd9f2"), null);
    ports.sqlite.mockRejectedValue(new Error("SQLite unavailable"));
    const { container } = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await expectFill(container, "#bcd9f2");
    await waitFor(() => expect(opened.dispose).toHaveBeenCalledOnce());
    expect(ports.opfs.mock.calls.every(([, scope, options]) => scope === undefined && options.readOnly === true)).toBe(true);
    expect(opened.write).not.toHaveBeenCalled(); expect(opened.clear).not.toHaveBeenCalled();
  });

  it("SQLite 준비가 대기 중이어도 OPFS 원고의 표시를 기다리게 하지 않는다", async () => {
    const { project, key } = fixture();
    useSources(key, snapshot("#aabbcc"), null);
    let finish: (value: { read: () => Promise<Row> }) => void = () => { throw new Error("대기 전"); };
    const pending = new Promise<{ read: () => Promise<Row> }>((resolve) => { finish = resolve; });
    ports.sqlite.mockReturnValue(pending);
    const { container } = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await expectFill(container, "#aabbcc");
    await act(async () => { finish({ read: async () => null }); await pending; });
    await expectFill(container, "#aabbcc");
  });

  it.each([
    { opfsAt: LATE, sqliteAt: EARLY, fill: "#bbccdd" },
    { opfsAt: EARLY, sqliteAt: LATE, fill: "#ccddee" },
    { opfsAt: LATE, sqliteAt: LATE, fill: "#bbccdd" },
  ])("최신 내구 원고를 고르고 같은 시각이면 OPFS를 우선한다 ($opfsAt / $sqliteAt)", async ({ opfsAt, sqliteAt, fill }) => {
    const { project, key } = fixture();
    useSources(key, snapshot("#bbccdd", opfsAt), snapshot("#ccddee", sqliteAt));
    const { container } = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await expectFill(container, fill);
  });

  it.each(["opfs", "sqlite"] as const)("%s 삭제 표식이 같은 시각의 다른 저장본과 브라우저 호환 그림을 되살리지 않는다", async (authority) => {
    const { project, key } = fixture();
    const old = snapshot("#ddeeff", LATE), cleared = { state: "cleared", savedAt: LATE } as const;
    localStorage.setItem(key, serializeStudioAutosave(old.payload));
    const opened = useSources(key, authority === "opfs" ? cleared : old, authority === "sqlite" ? cleared : old);
    const { container } = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await waitFor(() => expect(opened.dispose).toHaveBeenCalledOnce());
    await waitFor(() => expect(container.querySelector('[data-project-preview-state="empty"]')).toBeTruthy());
    expect(container.querySelector('svg rect[fill="#ddeeff"]')).toBeNull();
  });

  it("같은 작품의 저장 갱신이 삭제 표식이면 기존 사진을 지운다", async () => {
    const { project, key } = fixture();
    useSources(key, snapshot("#bbdddd"), null);
    const view = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await expectFill(view.container, "#bbdddd");
    useSources(key, { state: "cleared", savedAt: LATE }, null);
    view.rerender(<StudioProjectCardThumbnail project={{ ...project, updatedAt: LATE }} authUserId={null} locale="ko" />);
    await waitFor(() => expect(view.container.querySelector('[data-project-preview-state="empty"]')).toBeTruthy());
    expect(view.container.querySelector('svg rect[fill="#bbdddd"]')).toBeNull();
  });

  it("작품을 바꾸면 첫 렌더에서 이전 그림을 지우고 이전 읽기 완료가 새 작품을 덮지 않는다", async () => {
    const first = fixture(), second = fixture();
    useSources(first.key, snapshot("#eeeeaa"), null);
    const view = render(<StudioProjectCardThumbnail project={first.project} authUserId={null} locale="ko" />);
    await expectFill(view.container, "#eeeeaa");
    let finish: (value: Row) => void = () => { throw new Error("대기 전"); };
    const pending = new Promise<Row>((resolve) => { finish = resolve; });
    const waiting = session(() => pending), firstAgain = session(async () => snapshot("#eeeeaa"));
    ports.opfs.mockImplementation(async (candidate: string) => candidate === second.key ? waiting : candidate === first.key ? firstAgain : null);
    view.rerender(<StudioProjectCardThumbnail project={second.project} authUserId={null} locale="ko" />);
    expect(view.container.querySelector('svg rect[fill="#eeeeaa"]')).toBeNull();
    await waitFor(() => expect(waiting.readLatest).toHaveBeenCalledOnce());
    view.rerender(<StudioProjectCardThumbnail project={first.project} authUserId={null} locale="ko" />);
    await expectFill(view.container, "#eeeeaa");
    await act(async () => { finish(snapshot("#aaaaff", LATE)); await pending; });
    await waitFor(() => expect(waiting.dispose).toHaveBeenCalledOnce());
    expect(view.container.querySelector('svg rect[fill="#aaaaff"]')).toBeNull();
  });

  it("언마운트 후 완료된 읽기도 정리하며 OPFS 읽기 실패 시 SQLite 원고를 유지한다", async () => {
    const { project, key } = fixture();
    const failed = session(async () => { throw new Error("손상된 journal"); });
    ports.opfs.mockImplementation(async (candidate: string) => candidate === key ? failed : null);
    ports.sqlite.mockResolvedValue({ read: vi.fn(async (candidate: string) => candidate === key ? snapshot("#aaccee") : null) });
    const view = render(<StudioProjectCardThumbnail project={project} authUserId={null} locale="ko" />);
    await expectFill(view.container, "#aaccee");
    expect(failed.dispose).toHaveBeenCalledOnce();
    const next = fixture();
    let finish: (value: Row) => void = () => { throw new Error("대기 전"); };
    const pending = new Promise<Row>((resolve) => { finish = resolve; }), waiting = session(() => pending);
    ports.opfs.mockImplementation(async (candidate: string) => candidate === next.key ? waiting : null);
    view.rerender(<StudioProjectCardThumbnail project={next.project} authUserId={null} locale="ko" />);
    await waitFor(() => expect(waiting.readLatest).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { finish(snapshot("#aaddff")); await pending; });
    await waitFor(() => expect(waiting.dispose).toHaveBeenCalledOnce());
    expect(view.container.childElementCount).toBe(0);
  });
});
