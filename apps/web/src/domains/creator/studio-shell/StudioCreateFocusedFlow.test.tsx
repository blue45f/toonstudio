// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}
function renderCreate(entry = "/studio/new") {
  return render(<MemoryRouter initialEntries={[entry]}><StudioProjectCreatePage /><LocationProbe /></MemoryRouter>);
}
function required<T extends Element>(container: HTMLElement, selector: string): T {
  const result = container.querySelector<T>(selector);
  if (!result) throw new Error(`필수 요소 누락: ${selector}`);
  return result;
}
function startButton(container: HTMLElement): HTMLButtonElement {
  const region = required<HTMLElement>(container, "[data-studio-create-submit]");
  return within(region).getByRole<HTMLButtonElement>("button", {
    name: /세로 연재 웹툰 시작|Start Vertical serial webtoon/u,
  });
}
function advanced(container: HTMLElement) {
  return required<HTMLDetailsElement>(container, "[data-studio-create-advanced]");
}
function widthInput(container: HTMLElement) {
  return required<HTMLInputElement>(container, '[data-studio-create-custom-size] input[type="number"]');
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("새 프로젝트의 필수 선택·주 행동·추가 설정 위계", () => {
  it("시작 버튼은 하나이며 추가 설정과 미리보기보다 먼저 배치된다", () => {
    const { container } = renderCreate();
    const submit = required<HTMLElement>(container, "[data-studio-create-submit]");
    const preview = required<HTMLDetailsElement>(container, "[data-studio-create-preview]");
    expect(startButton(container).disabled).toBe(false);
    expect(container.querySelectorAll("[data-studio-create-submit]")).toHaveLength(1);
    expect(submit.compareDocumentPosition(advanced(container)) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(submit.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(advanced(container).open).toBe(false);
    expect(preview.open).toBe(false);
    expect(container.querySelectorAll("[data-studio-create-format]")).toHaveLength(5);
    expect(container.querySelector('[data-studio-format-preview="vertical-webtoon"]')).not.toBeNull();
  });

  it("선택한 형식을 색상뿐 아니라 텍스트와 aria-pressed로 알려 준다", () => {
    const { container } = renderCreate();
    const illustration = required<HTMLButtonElement>(container, '[data-studio-create-format="illustration"]');
    fireEvent.click(illustration);
    expect(illustration.getAttribute("aria-pressed")).toBe("true");
    expect(illustration.textContent).toMatch(/선택됨|Selected/u);
    expect(container.querySelectorAll('[data-studio-create-format][aria-pressed="true"]')).toHaveLength(1);
  });

  it("고급 구역을 접어도 사용자 크기를 유지하고 그 크기로 문서를 만든다", async () => {
    const { container } = renderCreate("/studio/new?lane=blank");
    const details = advanced(container);
    details.open = true; // native disclosure의 키보드 동작은 별도 실제 브라우저 검증 대상이다.
    fireEvent.change(widthInput(container), { target: { value: "1440" } });
    details.open = false;
    expect(widthInput(container).value).toBe("1440");
    expect(startButton(container).disabled).toBe(false);
    fireEvent.click(startButton(container));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\//u));
    const project = readStudioProjectLibrary(window.localStorage).projects[0];
    if (!project) throw new Error("새 프로젝트가 저장되지 않았습니다.");
    expect(readStudioProjectDocuments(window.localStorage, project.id).documents[0]?.width).toBe(1440);
  });

  it("접힌 잘못된 크기에서 수정 동작이 입력란을 펼치고 너비로 포커스를 옮긴다", () => {
    const { container } = renderCreate();
    advanced(container).open = true;
    const width = widthInput(container);
    fireEvent.change(width, { target: { value: "0" } });
    advanced(container).open = false;
    expect(startButton(container).disabled).toBe(true);
    expect(width.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /크기 수정하기|Fix the size/u }));
    expect(advanced(container).open).toBe(true);
    expect(document.activeElement).toBe(width);
    const reason = width.getAttribute("aria-describedby");
    expect(reason).toBeTruthy();
    expect(document.getElementById(reason ?? "")?.textContent).toMatch(/1,000,000/u);
  });

  it("너비가 정상이면 오류 복구는 잘못된 높이로 이동한다", () => {
    const { container } = renderCreate();
    advanced(container).open = true;
    const inputs = container.querySelectorAll<HTMLInputElement>('[data-studio-create-custom-size] input[type="number"]');
    const height = inputs[1];
    if (!height) throw new Error("높이 입력란이 없습니다.");
    fireEvent.change(height, { target: { value: "0" } });
    advanced(container).open = false;
    fireEvent.click(screen.getByRole("button", { name: /크기 수정하기|Fix the size/u }));
    expect(document.activeElement).toBe(height);
    expect(startButton(container).disabled).toBe(true);
  });

  it("이름 오류를 입력란에 연결하고 바로 수정할 수 있게 한다", () => {
    const { container } = renderCreate();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: /프로젝트 이름|Project name/u });
    fireEvent.change(name, { target: { value: "   " } });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(startButton(container).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /이름 입력하기|Enter a name/u }));
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-describedby")).toBeTruthy();
  });

  it.each([
    ["/studio/new", /이야기 기획|story planning/u],
    ["/studio/new?lane=blank", /편집기|editor/u],
    ["/studio/new?lane=idea&start=files", /파일 가져오기|import files/u],
    ["/studio/new?lane=idea&start=script", /대본 작성|script writing/u],
    ["/studio/new?kind=webtoon&onboarding=production&start=script", /제작 계획에 맞춘 작업 화면|planned workspace/u],
  ])("%s의 다음 화면 안내를 실제 시작 의도와 맞춘다", (entry, expected) => {
    const { container } = renderCreate(entry);
    expect(required<HTMLElement>(container, "[data-studio-create-next-step]").textContent).toMatch(expected);
  });
  it("상세 설정을 마치면 생성하지 않고 하나뿐인 시작 버튼으로 초점을 돌린다", () => {
    const { container } = renderCreate();
    advanced(container).open = true;
    fireEvent.click(within(advanced(container)).getByRole("button", { name: /시작 설정으로 돌아가기|Back to start settings/u }));
    expect(document.activeElement).toBe(startButton(container));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("시작이 막혔을 때 복귀 동작은 오류를 고칠 수 있는 요약 구역으로 이동한다", () => {
    const { container } = renderCreate();
    advanced(container).open = true;
    fireEvent.change(widthInput(container), { target: { value: "0" } });
    fireEvent.click(within(advanced(container)).getByRole("button", { name: /시작 설정으로 돌아가기|Back to start settings/u }));
    expect(document.activeElement).toBe(required<HTMLElement>(container, "[data-studio-create-submit]"));
    expect(startButton(container).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /크기 수정하기|Fix the size/u })).toBeTruthy();
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("미리보기를 펼쳐 확인한 뒤 시작 버튼으로 돌아갈 수 있다", () => {
    const { container } = renderCreate();
    const preview = required<HTMLDetailsElement>(container, "[data-studio-create-preview]");
    preview.open = true;
    expect(within(preview).getByRole("heading", { name: /세로 연재 웹툰|Vertical serial webtoon/u })).toBeTruthy();
    fireEvent.click(within(preview).getByRole("button", { name: /시작 설정으로 돌아가기|Back to start settings/u }));
    expect(document.activeElement).toBe(startButton(container));
  });

  it("제작 계획과 파일 재료를 함께 고르면 버튼과 다음 화면 안내의 우선순위가 같다", () => {
    const { container } = renderCreate("/studio/new?onboarding=production&start=files");
    const submit = required<HTMLElement>(container, "[data-studio-create-submit]");
    expect(within(submit).getByRole("button", { name: /프로젝트와 제작 계획 만들기|Create project and production plan/u })).toBeTruthy();
    expect(required<HTMLElement>(container, "[data-studio-create-next-step]").textContent).toMatch(/제작 계획에 맞춘 작업 화면|planned workspace/u);
    expect(within(submit).queryByRole("button", { name: /프로젝트 만들고 파일 가져오기|Create project and import files/u })).toBeNull();
  });

  it("고급 크기를 템플릿으로 복구하면 요약과 저장될 초기 크기가 함께 복구된다", async () => {
    const { container } = renderCreate("/studio/new?lane=blank");
    advanced(container).open = true;
    fireEvent.change(widthInput(container), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /템플릿 크기로 되돌리기|Reset to template size/u }));
    expect(widthInput(container).value).toBe("1080");
    expect(widthInput(container).getAttribute("aria-invalid")).toBeNull();
    expect(startButton(container).disabled).toBe(false);
    fireEvent.click(startButton(container));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\//u));
    const project = readStudioProjectLibrary(window.localStorage).projects[0];
    if (!project) throw new Error("새 프로젝트가 없습니다.");
    expect(readStudioProjectDocuments(window.localStorage, project.id).documents[0]).toMatchObject({ width: 1080, height: 8000 });
  });

  it("제작 계획 상세 편집 뒤의 복귀도 새 프로젝트를 만들지 않는다", () => {
    const { container } = renderCreate("/studio/new?onboarding=production&start=script");
    const plan = required<HTMLElement>(container, "[data-studio-create-optional-settings]");
    fireEvent.click(within(plan).getByRole("button", { name: /시작 설정으로 돌아가기|Back to start settings/u }));
    expect(document.activeElement?.id).toBe("studio-create-primary-action");
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("프로젝트 이름 Enter로 저장과 기존 기획 화면 이동을 수행한다", async () => {
    const { container } = renderCreate();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: /프로젝트 이름|Project name/u });
    fireEvent.change(name, { target: { value: "키보드로 만든 이야기" } });
    fireEvent.keyDown(name, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toMatch(/^\/studio\/p\/[^/]+\/story$/u));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
    expect(readStudioProjectLibrary(window.localStorage).projects[0]?.title).toBe("키보드로 만든 이야기");
    expect(required<HTMLFormElement>(container, "[data-studio-create-form]").noValidate).toBe(true);
  });

  it("한글 조합의 Enter와 조합종료 경계229에서는 저장하지 않는다", () => {
    renderCreate();
    const name = screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u });
    fireEvent.compositionStart(name); fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.compositionEnd(name); fireEvent.keyDown(name, { key: "Enter", keyCode: 229 });
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("입력란 Enter도 접힌 크기 오류를 펼치고 잘못된 입력으로 복귀한다", () => {
    const { container } = renderCreate();
    advanced(container).open = true;
    const width = widthInput(container);
    fireEvent.change(width, { target: { value: "0" } }); advanced(container).open = false;
    fireEvent.keyDown(screen.getByRole("textbox", { name: /프로젝트 이름|Project name/u }), { key: "Enter" });
    expect(advanced(container).open).toBe(true); expect(document.activeElement).toBe(width);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
  });

  it("동기 submit이 연속으로 와도 프로젝트를 하나만 만든다", () => {
    const { container } = renderCreate();
    const form = required<HTMLFormElement>(container, "[data-studio-create-form]");
    fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });

});
