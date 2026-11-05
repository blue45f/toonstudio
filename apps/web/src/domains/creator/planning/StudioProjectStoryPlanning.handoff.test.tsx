// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey } from "../studio-autosave";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import { archiveStudioProjectDocument, createStudioProjectDocument, readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioProjectStoryPlanning } from "./StudioProjectStoryPlanning";
import { ensureStudioProjectPlanning, readStudioProjectPlanning, saveStudioEpisodePlan, studioPlanningStorageKey } from "./studio-planning-store";

vi.mock("@/platform/use-api-resource", () => ({ useApiResource: () => ({ data: null, loading: false, error: null }) }));

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fixture() {
  const result = createStudioProjectWithInitialDocument(localStorage, {
    title: "같은 원고로 잇는 단편", kind: "webtoon", createdAt: "2026-11-05T00:00:00.000Z",
  });
  const initial = ensureStudioProjectPlanning(localStorage, result.project.id);
  const plan = initial.plans[0];
  if (!plan) throw new Error("첫 회차 기획이 필요합니다.");
  saveStudioEpisodePlan(localStorage, result.project.id, {
    ...plan, synopsis: "저장된 줄거리", turningPoints: ["발견", "이름", "추적", "대면", "수선", "귀가"],
  });
  return { ...result, episodeId: plan.episodeId };
}

function Harness({ projectId }: { projectId: string }) {
  const location = useLocation();
  return <>
    <output aria-label="현재 경로">{location.pathname}{location.search}</output>
    <StudioProjectStoryPlanning projectId={projectId} view="episodes" />
  </>;
}

function open(projectId: string) {
  render(<MemoryRouter initialEntries={[`/studio/p/${projectId}/story?view=episodes`]}><Harness projectId={projectId} /></MemoryRouter>);
}

describe("회차 기획에서 기존 원고로 이어가기", () => {
  it("현재 입력을 저장하고 같은 작품·문서·회차를 열며 원고 복구본을 교체하지 않는다", async () => {
    const { project, document, episodeId } = fixture();
    const recoveryKey = studioAutosaveKey({ userId: "owner", workId: document.id });
    localStorage.setItem(recoveryKey, "기존 여섯 페이지의 복구 데이터");
    const documentsBefore = localStorage.getItem(`toonspectrum:studio-project-documents:v1:${encodeURIComponent(project.id)}`);
    open(project.id);
    await screen.findByRole("link", { name: "이 회차 콘티 시작하기" });
    fireEvent.change(screen.getByRole("textbox", { name: "줄거리" }), { target: { value: "이동 직전 수정한 줄거리" } });
    fireEvent.click(screen.getByRole("link", { name: "이 회차 콘티 시작하기" }));
    await waitFor(() => expect(screen.getByLabelText("현재 경로").textContent).toContain(`/studio/p/${project.id}/d/${document.id}?`));
    const href = new URL(screen.getByLabelText("현재 경로").textContent ?? "", "https://example.test");
    expect(href.searchParams.get("episode")).toBe(episodeId);
    expect(href.searchParams.get("workspace")).toBe("comic");
    expect(readStudioProjectPlanning(localStorage, project.id)?.plans[0]?.synopsis).toBe("이동 직전 수정한 줄거리");
    expect(readStudioProjectLibrary(localStorage).projects).toHaveLength(1);
    expect(readStudioProjectDocuments(localStorage, project.id).documents).toHaveLength(1);
    expect(localStorage.getItem(recoveryKey)).toBe("기존 여섯 페이지의 복구 데이터");
    expect(localStorage.getItem(`toonspectrum:studio-project-documents:v1:${encodeURIComponent(project.id)}`)).toBe(documentsBefore);
  });

  it("기획 저장이 실패하면 이동을 막고 입력과 이전 저장본을 남긴다", async () => {
    const { project } = fixture();
    open(project.id);
    await screen.findByRole("link", { name: "이 회차 콘티 시작하기" });
    fireEvent.change(screen.getByRole("textbox", { name: "줄거리" }), { target: { value: "아직 저장하지 못한 입력" } });
    const key = studioPlanningStorageKey(project.id);
    const before = localStorage.getItem(key);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, targetKey: string, value: string) {
      if (targetKey === key) throw new DOMException("가득 참", "QuotaExceededError");
      originalSetItem.call(this, targetKey, value);
    });
    fireEvent.click(screen.getByRole("link", { name: "이 회차 콘티 시작하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("저장하지 못해 원고를 열지 않았습니다");
    expect(screen.getByLabelText("현재 경로").textContent).toBe(`/studio/p/${project.id}/story?view=episodes`);
    expect(screen.getByDisplayValue("아직 저장하지 못한 입력")).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(before);
    expect(readStudioProjectLibrary(localStorage).projects).toHaveLength(1);
  });

  it("여러 문서는 유효한 최근 원고가 있어도 명시 선택을 요구하고 선택한 원고만 연다", async () => {
    const { project, document } = fixture();
    const second = createStudioProjectDocument(localStorage, project.id, { title: "두 번째 원고", kind: "webtoon" });
    open(project.id);
    await screen.findByRole("combobox", { name: "콘티·작화 대상 원고" });
    expect(screen.queryByRole("link", { name: "이 회차 콘티 시작하기" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "콘티·작화 대상 원고" }), { target: { value: second.id } });
    const link = await screen.findByRole("link", { name: "이 회차 콘티 시작하기" });
    expect(link.getAttribute("href")).toContain(`/studio/p/${project.id}/d/${second.id}?`);
    expect(link.getAttribute("href")).not.toContain(`/d/${document.id}?`);
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByLabelText("현재 경로").textContent).toContain(`/d/${second.id}?`));
    expect(readStudioProjectLibrary(localStorage).projects).toHaveLength(1);
  });

  it("선택한 원고가 보관되면 남은 단일 원고로 자동 전환하지 않는다", async () => {
    const { project, document } = fixture();
    const second = createStudioProjectDocument(localStorage, project.id, { title: "선택할 원고", kind: "webtoon" });
    open(project.id);
    const picker = await screen.findByRole("combobox", { name: "콘티·작화 대상 원고" });
    fireEvent.change(picker, { target: { value: second.id } });
    expect((await screen.findByRole("link", { name: "이 회차 콘티 시작하기" })).getAttribute("href")).toContain(`/d/${second.id}?`);
    act(() => { archiveStudioProjectDocument(localStorage, project.id, second.id, { target: window }); });
    await waitFor(() => expect(screen.queryByRole("link", { name: "이 회차 콘티 시작하기" })).toBeNull());
    expect(readStudioProjectDocuments(localStorage, project.id).documents.find((entry) => entry.id === document.id)?.status).toBe("active");
    expect(screen.getByLabelText("현재 경로").textContent).toBe(`/studio/p/${project.id}/story?view=episodes`);
  });
});
