// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";

import { studioAutosaveKey, writeStudioLifecycleAutosave } from "../studio-autosave";
import type { PageState } from "../studio-page-state";
import { createBlankPage } from "../studio-pages";
import { readStudioProjectDiagnosticSource, studioProjectDiagnosticSourceStorageKey } from "../studio-project-diagnostic-source-store";
import { ensureStudioProjectWorkspaceState, updateStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import * as facts from "./studio-manuscript-export-facts";
import { StudioExportPanel } from "./StudioExportPanel";

const project = "export-owner-project";
const doc = "export-owner-document";
function session(id: string | null, ready = true): SessionContextValue {
  const update = async () => null;
  return id === null
    ? { data: null, ready, status: "unauthenticated", update }
    : { data: { user: { id } }, ready, status: "authenticated", update };
}
function panel(id: string | null, ready = true) {
  return <SessionContext.Provider value={session(id, ready)}><MemoryRouter>
    <StudioExportPanel projectId={project} locale="ko" />
  </MemoryRouter></SessionContext.Provider>;
}
function seed(owner: string | null, label: string, date: string) {
  const { id, bg, bgGrad, canvasH } = createBlankPage(() => label, 1280);
  const page: PageState = {
    id, bg, bgGrad, canvasH, name: label,
    elements: [{ id: `cut-${label}`, type: "frame", x: 0, y: 0, width: 720, height: 640, stroke: "#111" }],
  };
  return writeStudioLifecycleAutosave(localStorage, studioAutosaveKey({ userId: owner, workId: doc }), {
    version: 6, savedAt: date, pagesList: [page],
  }, { preservePrimary: false });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function prepare() {
  useI18n.setState({ lang: "ko" });
  createStudioProject(localStorage, { id: project, title: "기기 프로젝트", kind: "webtoon" });
  createStudioProjectDocument(localStorage, project, { id: doc, title: "공유 문서 규격", kind: "webtoon", width: 1080, height: 8000 });
}

it("같은 문서의 계정·게스트 원고 및 저장된 점검을 구분하고 재진입 때 자신의 결과를 되찾는다", async () => {
  prepare();
  seed("alice", "A 전용 장면", "2026-10-01T00:00:00.000Z");
  seed(null, "게스트 전용 장면", "2026-11-01T00:00:00.000Z");
  const read = vi.spyOn(facts, "loadPersistedManuscriptExportFacts");
  async function loaded() { await act(async () => { await read.mock.results.at(-1)?.value; }); }
  const view = render(panel("alice", false));
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "현재 상태 검사" }).hasAttribute("disabled")).toBe(true);
  view.rerender(panel("alice")); await loaded();
  expect(screen.getByTestId("studio-export-scope-order").textContent).toContain("A 전용 장면");
  fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
  expect(readStudioProjectDiagnosticSource(localStorage, project, "alice")?.exportPreflights).toHaveLength(1);
  view.rerender(panel("bob"));
  expect(screen.queryByText(/A 전용 장면/u)).toBeNull();
  await loaded();
  expect(screen.getByTestId("studio-export-scope-summary").textContent).toContain("원고 문서 규격 연결됨");
  expect(screen.getByTestId("studio-export-scope-order").textContent).not.toContain("게스트 전용 장면");
  expect(readStudioProjectDiagnosticSource(localStorage, project, "bob")?.exportPreflights).toHaveLength(0);
  expect(screen.queryByTestId("studio-export-preflight-findings")).toBeNull();
  view.rerender(panel(null)); await loaded();
  expect(screen.getByTestId("studio-export-scope-order").textContent).toContain("게스트 전용 장면");
  expect(readStudioProjectDiagnosticSource(localStorage, project, null)?.exportPreflights).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
  view.unmount(); render(panel("alice")); await loaded();
  expect(screen.getByTestId("studio-export-scope-order").textContent).toContain("A 전용 장면");
  expect(screen.getByTestId("studio-export-preflight-findings")).toBeTruthy();
  expect(readStudioProjectDiagnosticSource(localStorage, project, null)?.exportPreflights).toHaveLength(1);
});

it("이전 계정의 늦은 판독이 새 계정 원고를 덮지 않는다", async () => {
  prepare(); seed("alice", "A 늦은 장면", "2026-10-01T00:00:00.000Z");
  seed("bob", "B 실제 장면", "2026-10-02T00:00:00.000Z");
  const original = facts.loadPersistedManuscriptExportFacts;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const read = vi.spyOn(facts, "loadPersistedManuscriptExportFacts").mockImplementation(async (...args) => {
    const result = await original(...args);
    if (args[3] === "alice") await pending;
    return result;
  });
  const view = render(panel("alice")); const old = read.mock.results[0]?.value;
  view.rerender(panel("bob"));
  await act(async () => { await read.mock.results.at(-1)?.value; });
  expect(screen.getByTestId("studio-export-scope-order").textContent).toContain("B 실제 장면");
  await act(async () => { release(); await old; });
  expect(screen.getByTestId("studio-export-scope-summary").textContent).not.toContain("A 늦은 장면");
  expect(screen.getByTestId("studio-export-scope-order").textContent).toContain("B 실제 장면");
});


it("손상된 프로젝트를 다시 열고 살릴 수 있는 A·B·게스트 출고 기록을 같은 프로젝트에만 복구한다", async () => {
  prepare();
  const key = studioProjectDiagnosticSourceStorageKey(project);
  localStorage.setItem(key, "{");
  expect(ensureStudioProjectWorkspaceState(localStorage, project).projectId).toBe(project);
  const view = render(panel("alice"));
  fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
  view.unmount();
  const alice = readStudioProjectDiagnosticSource(localStorage, project, "alice")!.exportPreflights;
  expect(alice).toHaveLength(1);
  for (const owner of ["bob", null]) {
    updateStudioProjectWorkspaceState(localStorage, project, current => ({
      ...current, exportPreflights: alice.map(result => ({ ...result, summaryKo: owner ?? "게스트" })),
    }), { exportOwner: owner });
  }
  const damaged = JSON.parse(localStorage.getItem(key)!);
  localStorage.setItem(key, JSON.stringify({ ...damaged, story: null }));
  expect(ensureStudioProjectWorkspaceState(localStorage, project, undefined, "alice").exportPreflights).toEqual(alice);
  expect(readStudioProjectDiagnosticSource(localStorage, project, "bob")?.exportPreflights[0]?.summaryKo).toBe("bob");
  expect(readStudioProjectDiagnosticSource(localStorage, project, null)?.exportPreflights[0]?.summaryKo).toBe("게스트");
  const other = "other-work";
  localStorage.setItem(studioProjectDiagnosticSourceStorageKey(other), JSON.stringify(damaged));
  expect(ensureStudioProjectWorkspaceState(localStorage, other, undefined, "alice").exportPreflights).toEqual([]);
});
