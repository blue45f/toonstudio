// @vitest-environment jsdom
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioProject, readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { StudioQuickStart } from "./StudioQuickStart";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}
function mountQuickStart(locale: "ko" | "en" = "ko") {
  render(<StrictMode><MemoryRouter initialEntries={["/studio"]}>
    <StudioQuickStart locale={locale} /><LocationProbe />
  </MemoryRouter></StrictMode>);
}
beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("StudioQuickStart", () => {
  it("does not create a project from mounting, rendering or focus", () => {
    mountQuickStart();
    screen.getByRole("button", { name: "그림 시작하기" }).focus();
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });
  it("opens one recoverable drawing in a single click and ignores repeated clicks", () => {
    mountQuickStart();
    const button = screen.getByRole("button", { name: "그림 시작하기" });
    fireEvent.click(button);
    fireEvent.click(button);
    const projects = readStudioProjectLibrary(window.localStorage).projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: "illustration", templateId: "quick-sketch" });
    const document = readStudioProjectDocuments(window.localStorage, projects[0]!.id).documents[0]!;
    expect(document).toMatchObject({ width: 1600, height: 1200, defaultWorkspace: "draw" });
    expect(screen.getByLabelText("location").textContent)
      .toBe(`/studio/p/${projects[0]!.id}/d/${document.id}?workspace=draw&uiMode=focus&startTool=draw`);
  });
  it("creates a recoverable webtoon from the primary action", () => {
    mountQuickStart();
    fireEvent.click(screen.getByRole("button", { name: "웹툰 시작하기" }));
    const projects = readStudioProjectLibrary(window.localStorage).projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: "webtoon", templateId: "webtoon-vertical" });
    const document = readStudioProjectDocuments(window.localStorage, projects[0]!.id).documents[0]!;
    expect(document.defaultWorkspace).toBe("comic");
    expect(screen.getByLabelText("location").textContent)
      .toBe(`/studio/p/${projects[0]!.id}/d/${document.id}?workspace=comic&uiMode=basic&startTool=draw`);
  });
  it("shows a retryable error when storage is blocked without navigating", () => {
    mountQuickStart("en");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked test storage", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(screen.getByRole("alert").textContent).toContain("Existing work was not changed");
    expect(screen.getByLabelText("location").textContent).toBe("/studio");
    write.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });
});

it("시작 화면 카드도 한 번의 클릭으로 새 그림을 열고 기존 작품을 보존한다", () => {
  const existing = createStudioProject(window.localStorage, { id: "existing", title: "이어 그릴 작품", kind: "webtoon" });
  render(<StrictMode><MemoryRouter initialEntries={["/create"]}>
    <StudioQuickStart locale="ko" presentation="drawing-card" /><LocationProbe />
  </MemoryRouter></StrictMode>);
  const button = screen.getByRole("button", { name: "캔버스 열기" });
  button.focus();
  expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  fireEvent.click(button);
  fireEvent.click(button);
  const projects = readStudioProjectLibrary(window.localStorage).projects;
  expect(projects).toHaveLength(2);
  expect(projects.find((project) => project.id === existing.id)).toEqual(existing);
  const next = projects.find((project) => project.id !== existing.id);
  expect(next).toMatchObject({ kind: "illustration", templateId: "quick-sketch" });
  expect(screen.getByLabelText("location").textContent).toContain("uiMode=focus&startTool=draw");
});


it("시작 카드에서 선택한 언어를 새 프로젝트에 보존한다", () => {
  render(<StrictMode><MemoryRouter initialEntries={["/create"]}>
    <StudioQuickStart locale="ja" presentation="drawing-card" /><LocationProbe />
  </MemoryRouter></StrictMode>);
  fireEvent.click(screen.getByRole("button"));
  const projects = readStudioProjectLibrary(window.localStorage).projects;
  expect(projects).toHaveLength(1);
  expect(projects[0]?.primaryLocale).toBe("ja");
});


it("그리기 이미지 카드의 저장 실패는 기존 작업과 시작 위치를 유지하고 다시 시도할 수 있다", () => {
  const existing = createStudioProject(window.localStorage, { id: "kept", title: "보존할 원고", kind: "webtoon" });
  render(<StrictMode><MemoryRouter initialEntries={["/create"]}>
    <StudioQuickStart locale="ko" presentation="drawing-card" /><LocationProbe />
  </MemoryRouter></StrictMode>);
  const button = screen.getByRole("button", { name: "캔버스 열기" });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked test storage", "QuotaExceededError");
  });
  fireEvent.click(button);
  expect(screen.getByRole("alert").textContent).toContain("기존 작업은 변경하지 않았습니다");
  expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  expect(button.hasAttribute("disabled")).toBe(false);
  expect(screen.getByLabelText("location").textContent).toBe("/create");
  expect(readStudioProjectLibrary(window.localStorage).projects).toEqual([existing]);
  write.mockRestore();
  fireEvent.click(button);
  fireEvent.click(button);
  const projects = readStudioProjectLibrary(window.localStorage).projects;
  expect(projects).toHaveLength(2);
  expect(projects.find((project) => project.id === existing.id)).toEqual(existing);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("location").textContent).toContain("uiMode=focus&startTool=draw");
});
