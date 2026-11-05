// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey } from "../../studio-autosave";
import { studioDocumentPersistenceWorkId } from "../../studio-document-persistence-scope";
import { studioDocumentHref } from "../../studio-document-workspace";
import { isStudioSourceHydrationPending } from "../../studio-editor-scope";
import { createStudioProjectWithInitialDocument } from "../../studio-project-creation";
import { readStudioProjectLibrary } from "../../studio-project-library-store";
import { createInitialStudioProjectPlanning, writeStudioProjectPlanning } from "../../planning/studio-planning-store";
import { studioEpisodeDocumentHref } from "../../planning/studio-episode-document-handoff";
import { useStudioDocumentLayout } from "../studio-document-layout-context";
import { resolveStudioRoute } from "../studio-route-manifest";

import { StudioEditorRoute } from "./StudioEditorRoute";

import type { StudioWorkspaceRoute } from "../../studio-workspace-route";

const observed = vi.hoisted(() => ({ sources: [] as (string | null)[] }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: { user: { id: "owner" } }, ready: true }),
}));
vi.mock("../../studio-legacy-editor-adapter", () => ({
  LegacyStudioEditorAdapter: ({ studioRoute }: { studioRoute: StudioWorkspaceRoute }) => {
    const layout = useStudioDocumentLayout();
    const [ink, setInk] = useState(0);
    observed.sources.push(studioRoute.workId);
    const key = studioAutosaveKey({
      userId: "owner",
      workId: studioDocumentPersistenceWorkId(layout),
      remixId: layout.remixId,
    });
    return (
      <section
        data-testid="editor"
        data-source={studioRoute.workId ?? "local"}
        data-layout-source={layout.workId ?? "local"}
        data-recovery-key={key}
        data-pending={String(isStudioSourceHydrationPending(studioRoute.workId, studioRoute.remixSourceWorkId, false))}
      >
        <button type="button" onClick={() => setInk((value) => value + 1)}>draw</button>
        <output aria-label="ink">{ink}</output>
        <output aria-label="recovery">{localStorage.getItem(key)}</output>
      </section>
    );
  },
}));

function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolution = resolveStudioRoute({ pathname: location.pathname, search: location.search });
  if (resolution.kind !== "editor") throw new Error(resolution.kind);
  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => {
        const params = new URLSearchParams(location.search);
        params.set("workspace", "image");
        navigate(`${location.pathname}?${params}`);
      }}>change workspace</button>
      <StudioEditorRoute resolution={resolution} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  observed.sources.length = 0;
});
afterEach(cleanup);

function localFixture() {
  return createStudioProjectWithInitialDocument(localStorage, {
    title: "재현 원고", kind: "webtoon", createdAt: "2026-09-13T06:00:00.000Z",
  });
}

function open(href: string) {
  render(<MemoryRouter initialEntries={[href]}><Harness /></MemoryRouter>);
}

describe("StudioEditorRoute local-source integration", () => {
  it("실제 인계 UI가 같은 원고의 여섯 샷을 읽고 작화 전환·재진입에도 회차와 복구본을 유지한다", async () => {
    const { project, document } = localFixture();
    const planning = createInitialStudioProjectPlanning(project.id);
    const plan = planning.plans[0];
    if (!plan) throw new Error("회차 기획이 필요합니다.");
    writeStudioProjectPlanning(localStorage, { ...planning, plans: [{ ...plan, turningPoints: ["발견", "이름", "추적", "대면", "수선", "귀가"] }] });
    const href = studioEpisodeDocumentHref(document, plan.episodeId, "storyboard");
    if (!href) throw new Error("기존 원고 경로가 필요합니다.");
    const key = studioAutosaveKey({ userId: "owner", workId: document.id });
    localStorage.setItem(key, "기존 여섯 페이지");
    open(href);
    await screen.findByTestId("editor");
    const summary = await screen.findByText(`1화 컷 계획 · ${document.title}`);
    fireEvent.click(summary);
    expect(await screen.findByText("작화 샷 계획 — 저장된 회차 기준")).toBeTruthy();
    expect(screen.getByText(/페이지를 자동 생성하거나 교체하지 않습니다/u)).toBeTruthy();
    expect(screen.getByText(/샷 6개/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "draw" }));
    fireEvent.click(screen.getByRole("link", { name: "이 회차 작화 시작하기" }));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toContain("workspace=draw"));
    const currentHref = screen.getByLabelText("location").textContent;
    if (!currentHref) throw new Error("현재 경로가 필요합니다.");
    const route = new URL(currentHref, "https://example.test");
    expect(route.pathname).toBe(`/studio/p/${project.id}/d/${document.id}`);
    expect(route.searchParams.get("episode")).toBe(plan.episodeId);
    expect(screen.getByLabelText("ink").textContent).toBe("1");
    expect(localStorage.getItem(key)).toBe("기존 여섯 페이지");
    expect(readStudioProjectLibrary(localStorage).projects).toHaveLength(1);

    cleanup();
    open(currentHref);
    await screen.findByTestId("editor");
    fireEvent.click(await screen.findByText(`1화 컷 계획 · ${document.title}`));
    expect(await screen.findByRole("link", { name: "이 회차 작화 시작하기" })).toBeTruthy();
    expect(screen.getByText(/샷 6개/u)).toBeTruthy();
    expect(screen.getByLabelText("recovery").textContent).toBe("기존 여섯 페이지");
  });

  it("다른 프로젝트의 episode 쿼리는 원고를 바꾸거나 작화 인계 링크로 승인하지 않는다", async () => {
    const { project, document } = localFixture();
    const foreign = createInitialStudioProjectPlanning("다른-프로젝트");
    writeStudioProjectPlanning(localStorage, foreign);
    const foreignPlan = foreign.plans[0];
    if (!foreignPlan) throw new Error("다른 회차가 필요합니다.");
    const href = studioEpisodeDocumentHref(document, foreignPlan.episodeId, "storyboard");
    if (!href) throw new Error("기존 원고 경로가 필요합니다.");
    open(href);
    await screen.findByTestId("editor");
    fireEvent.click(await screen.findByText("회차 연결 확인 필요"));
    expect(await screen.findByText(/이 프로젝트의 회차와 기존 원고를 확인할 수 없습니다/u)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "이 회차 작화 시작하기" })).toBeNull();
    expect(screen.getByLabelText("location").textContent).toContain(`/studio/p/${project.id}/d/${document.id}?`);
    expect(readStudioProjectLibrary(localStorage).projects).toHaveLength(1);
  });

  it("passes a local source to both layout and editor while retaining the stored recovery key", async () => {
    const { href, document } = localFixture();
    const originalKey = studioAutosaveKey({ userId: "owner", workId: document.id });
    localStorage.setItem(originalKey, "previously saved ink");
    open(`${href}&room=existing-room`);
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("local");
    expect(editor.dataset.layoutSource).toBe("local");
    expect(editor.dataset.pending).toBe("false");
    expect(editor.dataset.recoveryKey).toBe(originalKey);
    expect(screen.getByLabelText("recovery").textContent).toBe("previously saved ink");
    expect(observed.sources.every((source) => source === null)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "draw" }));
    fireEvent.click(screen.getByRole("button", { name: "change workspace" }));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toContain("workspace=image"));
    expect(screen.getByLabelText("ink").textContent).toBe("1");
    expect(localStorage.getItem(originalKey)).toBe("previously saved ink");
  });

  it.each(["project", "document"])("redirects a legacy %s alias before any remote editor mounts", async (alias) => {
    const { project, document } = localFixture();
    open(`/studio/work/${alias === "project" ? project.id : document.id}/comic?room=existing-room`);
    const editor = await screen.findByTestId("editor");
    expect(screen.getByLabelText("location").textContent).toContain(`/studio/p/${project.id}/d/${document.id}`);
    expect(editor.dataset.source).toBe("local");
    expect(observed.sources).not.toHaveLength(0);
    expect(observed.sources.every((source) => source === null)).toBe(true);
  });

  it.each(["drawing-a", "drawing-b"])("keeps explicit draft %s in its isolated recovery slot", async (draftId) => {
    const key = studioAutosaveKey({ userId: "owner", workId: `draft:${draftId}` });
    localStorage.setItem(key, "draft-specific ink");
    open(studioDocumentHref({ draftId, workspace: "draw" }));
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("local");
    expect(editor.dataset.pending).toBe("false");
    expect(editor.dataset.recoveryKey).toBe(key);
    expect(screen.getByLabelText("recovery").textContent).toBe("draft-specific ink");
  });

  it("still requires remote hydration for a real server work", async () => {
    localFixture();
    open("/studio/work/real-server-work/canvas?room=existing-room");
    const editor = await screen.findByTestId("editor");
    expect(editor.dataset.source).toBe("real-server-work");
    expect(editor.dataset.layoutSource).toBe("real-server-work");
    expect(editor.dataset.pending).toBe("true");
  });
});
