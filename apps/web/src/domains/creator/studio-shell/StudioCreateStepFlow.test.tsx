// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as creation from "../studio-project-creation";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioSaveProfiles } from "../save-first/studio-save-profile";
import { StudioNewIntegratedPage as CreateForm } from "./StudioProjectCreatePage";

function Location() { const location = useLocation(); return <output aria-label="location">{location.pathname + location.search}</output>; }
function show(entry = "/studio/new") { return render(<MemoryRouter initialEntries={[entry]}><CreateForm /><Location /></MemoryRouter>); }
function panel(container: HTMLElement, step: number) {
  const element = container.querySelector<HTMLDivElement>(`[data-studio-create-step-panel="${step}"]`);
  if (!element) throw new Error("생성 단계가 없습니다.");
  return element;
}
function go(container: HTMLElement, step: number) {
  const button = container.querySelector<HTMLButtonElement>(`[data-studio-create-step-link="${step}"]`);
  if (!button) throw new Error("단계 버튼이 없습니다.");
  fireEvent.click(button);
}
function name() { return screen.getByRole<HTMLInputElement>("textbox", { name: /프로젝트 이름|Project name/u }); }
function submit(container: HTMLElement) {
  const region = container.querySelector<HTMLElement>("[data-studio-create-submit]");
  if (!region) throw new Error("생성 확인이 없습니다.");
  return within(region).getByRole("button", { name: /시작$|만들기$|Start |Create project/u });
}
beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

describe("같은 생성 정본을 쓰는 세 단계", () => {
  it("처음에는 형식만 보여 주고 실제 5형식·5작업실을 보존한다", () => {
    const { container } = show();
    expect(panel(container, 1).hidden).toBe(false);
    expect(panel(container, 2).hidden).toBe(true);
    expect(panel(container, 3).hidden).toBe(true);
    expect(screen.queryByRole("textbox", { name: /프로젝트 이름|Project name/u })).toBeNull();
    expect(container.querySelectorAll("[data-studio-create-format]")).toHaveLength(5);
    expect(container.querySelectorAll("[data-studio-auxiliary-kind]")).toHaveLength(5);
    expect(container.querySelector<HTMLDetailsElement>("[data-studio-create-genres]")?.open).toBe(false);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("다음과 이전 단계가 제목·선택 템플릿을 유지하고 기존 payload로 만든다", async () => {
    const { container } = show();
    const format = container.querySelector<HTMLButtonElement>('[data-studio-create-format="cuttoon"]');
    if (!format) throw new Error("컷툰 형식이 없습니다.");
    fireEvent.click(format);
    fireEvent.click(screen.getByRole("button", { name: "다음: 작품 이름" }));
    expect(screen.getByRole("heading", { level: 1, name: "이름과 기본 크기" })).toBeTruthy();
    fireEvent.change(name(), { target: { value: "내가 정한 여덟 컷" } });
    fireEvent.change(screen.getByRole("combobox", { name: /시작 템플릿|Starting template/u }), { target: { value: "cuttoon-portrait-8" } });
    fireEvent.click(screen.getByRole("button", { name: "이전 단계" }));
    expect(panel(container, 1).hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "다음: 작품 이름" }));
    expect(name().value).toBe("내가 정한 여덟 컷");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: /시작 템플릿|Starting template/u }).value).toBe("cuttoon-portrait-8");
    fireEvent.click(screen.getByRole("button", { name: "다음: 시작 확인" }));
    const start = container.querySelector<HTMLButtonElement>('[data-studio-start-point="storyboard"]');
    if (!start) throw new Error("콘티 시작점이 없습니다.");
    fireEvent.click(start);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    fireEvent.click(submit(container));
    await waitFor(() => expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1));
    const work = readStudioProjectLibrary(window.localStorage).projects[0];
    if (!work) throw new Error("프로젝트가 생성되지 않았습니다.");
    expect(work).toMatchObject({ title: "내가 정한 여덟 컷", templateId: "cuttoon-portrait-8", definition: { format: "cuttoon", startPoint: "storyboard" } });
    expect(readStudioProjectDocuments(window.localStorage, work.id).documents[0]).toMatchObject({ width: 1080, height: 1350, pageCount: 8 });
    expect(readStudioSaveProfiles(window.localStorage).profiles[work.id]?.lastManualSaveAt).toBeNull();
  });

  it("추가 작업실을 고른 뒤 다음 행동으로 초점을 돌려 선택한 작업실 이름을 이어간다", () => {
    const { container } = show();
    const details = container.querySelector<HTMLDetailsElement>("[data-studio-auxiliary-workspaces]");
    const summary = details?.querySelector("summary");
    const choice = details?.querySelector<HTMLButtonElement>('[data-studio-auxiliary-kind="three-d"]');
    if (!details || !summary || !choice) throw new Error("추가 작업실 선택이 없습니다.");
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.click(choice);
    const next = screen.getByRole("button", { name: "다음: 작품 이름" });
    expect(document.activeElement).toBe(next);
    expect(choice.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(next);
    expect(name().value).toBe("새 3D 장면");
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("빈 제목은 이름 단계에서 이유를 알리고 입력·초점을 보존한다", () => {
    const { container } = show();go(container, 2);
    const input = name();fireEvent.change(input, { target: { value: "  " } });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "다음: 시작 확인" }).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/프로젝트 이름/u);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).toBe(input);
    expect(input.tabIndex).toBe(0);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("이름 Enter는 확인으로만 이동하고 최종 연속 제출도 하나만 만든다", () => {
    const { container } = show();go(container, 2);
    fireEvent.change(name(), { target: { value: "한 번만 만드는 작품" } });
    fireEvent.keyDown(name(), { key: "Enter" });
    expect(panel(container, 3).hidden).toBe(false);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    const form = container.querySelector("form");if (!form) throw new Error("폼이 없습니다.");
    fireEvent.submit(form);fireEvent.submit(form);fireEvent.submit(form);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });

  it("생성 실패 후 단계로 돌아가도 입력을 보존하고 다시 시도한다", async () => {
    vi.spyOn(creation, "createStudioProjectWithInitialDocument").mockImplementationOnce(() => { throw new Error("기기에 저장하지 못했어요"); });
    const { container } = show();go(container, 2);
    fireEvent.change(name(), { target: { value: "실패해도 남는 이름" } });go(container, 3);
    fireEvent.click(submit(container));
    expect((await screen.findByRole("alert")).textContent).toBe("기기에 저장하지 못했어요");
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "이전 단계" }));
    expect(name().value).toBe("실패해도 남는 이름");go(container, 3);
    fireEvent.click(submit(container));
    await waitFor(() => expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1));
    expect(readStudioProjectLibrary(window.localStorage).projects[0]?.title).toBe("실패해도 남는 이름");
  });

  it("단일 작업실에는 생성 결과에 영향을 주지 않는 시작점 선택을 요구하지 않는다", () => {
    const { container } = show("/studio/new?kind=slides&template=slides-pitch");
    go(container, 3);
    expect(screen.getByRole("heading", { name: "열릴 작업실을 확인하세요" })).toBeTruthy();
    expect(container.querySelectorAll("[data-studio-start-point]")).toHaveLength(0);
    expect(submit(container).textContent).toMatch(/발표 자료 시작|Start Presentation/u);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("이미 선택한 템플릿 진입은 이름부터 시작하고 단계 이동으로 URL을 바꾸지 않는다", () => {
    const entry = "/studio/new?lane=blank&template=webtoon-vertical-episode&title=My+draft";
    const { container } = show(entry);
    expect(panel(container, 2).hidden).toBe(false);
    expect(name().value).toBe("My draft");go(container, 1);go(container, 3);go(container, 2);
    expect(name().value).toBe("My draft");
    expect(screen.getByLabelText("location").textContent).toBe(entry);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });
});
