// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { creatorStoryDraftStorageKey } from "@/shared/lib/creator-workspace-persistence";
import type { StoryDraft } from "@/shared/lib/creator-workspace-persistence";
import { STORY_FIELDS } from "@/shared/lib/creator-resources";
import { useI18n } from "@/shared/lib/i18n";

import { StoryLabPage } from "./StoryLabPage";
// 훅 모의가 소유자를 게스트로 고정하므로 초안도 게스트 파티션 키에 보관된다(소유자 스코프).
const GUEST_DRAFT_KEY = creatorStoryDraftStorageKey("guest");
const originalNavigationEntries = Object.getOwnPropertyDescriptor(window.performance, "getEntriesByType");

function nativeNavigationType(type: "navigate" | "reload" | "back_forward") {
  Object.defineProperty(window.performance, "getEntriesByType", {
    configurable: true,
    value: (entryType: string) => entryType === "navigation" ? [{ entryType, type }] : [],
  });
}

async function showNativePage(persisted: boolean) {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  await act(async () => {
    window.dispatchEvent(event);
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
  });
}
const workspaceMock = vi.hoisted(() => {
  const story: Record<string, string> = {};
  return {
    workspace: { story }, saveStory: vi.fn<(draft: StoryDraft) => Promise<boolean>>(async () => true), clearError: vi.fn(),
    error: null, ready: true, saving: false, writable: true, ownerKey: "guest",
  };
});

vi.mock("./workspace", () => ({
  downloadText: vi.fn(),
  useCreatorWorkspace: () => workspaceMock,
}));

beforeEach(() => {
  nativeNavigationType("navigate");
  useI18n.setState({ lang: "ko" });
  workspaceMock.workspace.story = {};
  workspaceMock.saveStory.mockReset().mockResolvedValue(true);
  workspaceMock.writable = true; workspaceMock.saving = false; workspaceMock.ownerKey = "guest";
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  useI18n.setState({ lang: "ko" });
  if (originalNavigationEntries) Object.defineProperty(window.performance, "getEntriesByType", originalNavigationEntries);
  else Reflect.deleteProperty(window.performance, "getEntriesByType");
});

function RoutingHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="story-route">{`${location.pathname}${location.search}${location.hash}`}</output>
    {location.pathname === "/story-lab" ? <><button type="button" onClick={() => navigate("/next-tool")}>다른 도구 보기</button><StoryLabPage /></>
      : <button type="button" onClick={() => navigate(-1)}>기획으로 돌아가기</button>}
  </>;
}

describe("스토리 연구실 홈 아이디어 시딩", () => {
  it("기획 작성과 저장을 먼저 제공하고 관련 제작 도구는 기본 접힘으로 둔다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const worksheet = screen.getByRole("form", { name: "기획 워크시트" });
    const save = screen.getByRole("button", { name: "기획서 저장" });
    const summary = screen.getByText("다음 작업·제작 도구", { selector: "summary" });
    const details = summary.closest("details");
    expect(worksheet.closest("details")).toBeNull();
    expect(save.closest("details")).toBeNull();
    expect(details?.open).toBe(false);
    expect(worksheet.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "스토리 연구실 화면 보기 모드 전환" })).toBeNull();
  });

  it("보조 메뉴를 열면 실제 도착 화면 이름과 기존 목적지를 유지한다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const summary = screen.getByText("다음 작업·제작 도구", { selector: "summary" });
    const details = summary.closest("details");
    if (!details) throw new Error("제작 도구 disclosure 누락");
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    for (const [name, href] of [
      ["기획 워크시트 열기", "/story-lab"],
      ["새 작업 설정 열기", "/studio/new"],
      ["웹툰 편집기 열기", "/studio/comic"],
      ["게시 준비 열기", "/studio/publish"],
    ] as const) {
      const link = screen.getByRole("link", { name: new RegExp(name, "u") });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.closest("details")).toBe(details);
    }
    expect(screen.queryByRole("link", { name: /신작 대본 생성/u })).toBeNull();
    fireEvent.click(summary);
    expect(details.open).toBe(false);
  });

  it("?idea= 문장을 빈 가제에 채우고 임시 초안으로 보관한다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab?idea=비 오는 날의 첫사랑"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("비 오는 날의 첫사랑");
    expect(screen.getByText(/홈에서 입력한 아이디어를 작품 가제로 가져왔습니다/u)).toBeTruthy();
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain("비 오는 날의 첫사랑");
  });

  it("이미 가제가 있으면 아이디어로 덮지 않는다", () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ version: 1, base: {}, story: { title: "기존 가제" } }));
    render(<MemoryRouter initialEntries={["/story-lab?idea=새 아이디어"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("기존 가제");
  });

  it("아이디어 파라미터가 없으면 아무것도 채우지 않는다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("");
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  });
});

describe("목적별 기획 입력", () => {
  it("단계 탐색은 입력 앞에, 외부 저장 버튼은 같은 워크시트 폼에 연결한다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const form = screen.getByRole("form", { name: "기획 워크시트" });
    const steps = screen.getByRole("navigation", { name: "기획 입력 단계" });
    const save = screen.getByRole("button", { name: "기획서 저장" });
    if (!(save instanceof HTMLButtonElement)) throw new Error("저장 버튼 누락");
    expect(steps.closest("form")).toBeNull();
    expect(steps.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.closest("form")).toBeNull();
    expect(save.form).toBe(form);
    expect(save.type).toBe("submit");
    expect(form.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("8개 입력을 보존하고 세 묶음 중 현재 목적만 보여 준다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const form = screen.getByRole("form", { name: "기획 워크시트" });
    expect(form.querySelectorAll("textarea")).toHaveLength(8);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    const steps = screen.getByRole("navigation", { name: "기획 입력 단계" });
    const buttons = within(steps).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: "이전 단계" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "기획서 저장" }).closest("details")).toBeNull();
    expect(screen.getByText("입력 내용 미리보기", { selector: "summary" }).closest("details")?.open).toBe(false);
    for (const field of STORY_FIELDS) expect(form.querySelectorAll(`#story-${field}`)).toHaveLength(1);
  });

  it("묶음 왕복과 저장 실패 후에도 모든 필드와 초안을 유지하고 같은 계약으로 재시도한다", async () => {
    workspaceMock.saveStory.mockResolvedValueOnce(false).mockImplementation(async (draft) => {
      workspaceMock.workspace.story = { ...draft.story }; return true;
    });
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const expected = Object.fromEntries(STORY_FIELDS.map((field) => [field, `직접 쓴 ${field}`]));
    for (const [index, fields] of [["title", "protagonist", "desire"], ["obstacle", "stakes", "world"], ["turn", "ending"]].entries()) {
      if (index) fireEvent.click(screen.getByRole("button", { name: index === 1 ? "다음: 갈등 정리" : "다음: 전환과 결말" }));
      for (const field of fields) {
        const input = document.querySelector<HTMLTextAreaElement>(`#story-${field}`);
        if (!input) throw new Error("기획 입력 누락");
        fireEvent.change(input, { target: { value: expected[field] } });
      }
    }
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /1\. 인물·목표/u }));
    expect(document.querySelector<HTMLTextAreaElement>("#story-title")?.value).toBe(expected.title);
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));
    await waitFor(() => expect(workspaceMock.saveStory).toHaveBeenCalledTimes(1));
    expect(workspaceMock.saveStory.mock.calls[0]?.[0]).toEqual({ version: 1, base: Object.fromEntries(STORY_FIELDS.map((field) => [field, ""])), story: expected });
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain(expected.ending);
    expect(screen.queryByText(/기획서를 저장했습니다/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));
    await waitFor(() => expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toBeNull());
    expect(workspaceMock.saveStory.mock.calls[1]?.[0]).toEqual(workspaceMock.saveStory.mock.calls[0]?.[0]);
    expect(screen.getByText(/기획서를 저장했습니다/u)).toBeTruthy();
  });

  it("숨긴 묶음의 유효성 오류를 제출하면 해당 입력을 열고 초점을 옮긴다", async () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    const world = document.querySelector<HTMLTextAreaElement>("#story-world");
    if (!title || !world) throw new Error("기획 입력 누락");
    fireEvent.change(title, { target: { value: "저장할 기획" } });
    world.setCustomValidity("세계관 규칙을 확인하세요.");
    expect(world.closest("fieldset")?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));
    await waitFor(() => expect(document.activeElement).toBe(world));
    expect(world.closest("fieldset")?.hidden).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("세계관 규칙을 확인하세요.");
    expect(world.getAttribute("aria-invalid")).toBe("true");
    expect(workspaceMock.saveStory).not.toHaveBeenCalled();
  });

  it("아이디어를 소비해도 다른 query·hash와 입력 단계 및 Back 초안 문맥은 보존한다", async () => {
    render(<MemoryRouter initialEntries={["/story-lab?idea=연결된 이야기&story-step=conflict&keep=1#resume"]}><RoutingHarness /></MemoryRouter>);
    expect(screen.getByTestId("story-route").textContent).toBe("/story-lab?story-step=conflict&keep=1#resume");
    expect(screen.getByRole("heading", { name: "무엇이 선택을 어렵게 하나요?" })).toBeTruthy();
    const world = document.querySelector<HTMLTextAreaElement>("#story-world");
    if (!world) throw new Error("기획 입력 누락");
    fireEvent.change(world, { target: { value: "보존할 세계 규칙" } });
    fireEvent.click(screen.getByRole("button", { name: /3\. 전환·결말/u }));
    expect(screen.getByTestId("story-route").textContent).toBe("/story-lab?story-step=ending&keep=1#resume");
    fireEvent.click(screen.getByRole("button", { name: "다른 도구 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "기획으로 돌아가기" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "처음과 끝은 어떻게 달라지나요?" })).toBeTruthy());
    expect(document.querySelector<HTMLTextAreaElement>("#story-world")?.value).toBe("보존할 세계 규칙");
    expect(document.querySelector<HTMLTextAreaElement>("#story-title")?.value).toBe("연결된 이야기");
    fireEvent.click(screen.getByRole("button", { name: "기획 검토하기" }));
    expect(screen.getByText("입력 내용 미리보기", { selector: "summary" }).closest("details")?.open).toBe(true);
    expect(document.activeElement?.id).toBe("story-preview-title");
  });

  it("소유자 변경과 쓰기 권한을 입력 단계와 독립적으로 유지한다", () => {
    workspaceMock.writable = false;
    const { rerender } = render(<MemoryRouter initialEntries={["/story-lab?story-step=ending"]}><StoryLabPage /></MemoryRouter>);
    const turn = document.querySelector<HTMLTextAreaElement>("#story-turn");
    if (!turn) throw new Error("기획 입력 누락");
    fireEvent.change(turn, { target: { value: "게스트 미저장 전환" } });
    expect(screen.getByRole("button", { name: "기획서 저장" }).hasAttribute("disabled")).toBe(true);
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain("게스트 미저장 전환");
    workspaceMock.ownerKey = "member-story";
    rerender(<MemoryRouter initialEntries={["/story-lab?story-step=ending"]}><StoryLabPage /></MemoryRouter>);
    expect(document.querySelector<HTMLTextAreaElement>("#story-turn")?.value).toBe("");
    expect(window.sessionStorage.getItem(creatorStoryDraftStorageKey("member-story"))).toBeNull();
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain("게스트 미저장 전환");
  });

  it("다른 탭과 충돌하면 미리보기를 열고 선택 뒤에도 작업 맥락과 초점을 유지한다", () => {
    workspaceMock.workspace.story = { title: "다른 탭의 제목" };
    window.sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ version: 1, base: { title: "처음 제목" }, story: { title: "내 초안 제목" } }));
    render(<MemoryRouter initialEntries={["/story-lab?story-step=ending"]}><StoryLabPage /></MemoryRouter>);
    const preview = screen.getByText("입력 내용 미리보기", { selector: "summary" }).closest("details");
    expect(preview?.open).toBe(true);
    expect(screen.getByRole("button", { name: "기획서 저장" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "내 초안 선택" }));
    expect(preview?.open).toBe(true);
    expect(document.activeElement?.id).toBe("story-preview-title");
    expect(document.querySelector<HTMLTextAreaElement>("#story-title")?.value).toBe("내 초안 제목");
    expect(screen.getByRole("button", { name: "기획서 저장" }).hasAttribute("disabled")).toBe(false);
    expect(workspaceMock.saveStory).not.toHaveBeenCalled();
  });

  it("영문에서도 같은 단계와 저장 행동을 찾을 수 있다", () => {
    useI18n.setState({ lang: "en" });
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "Story planning steps" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next: conflict" }));
    expect(screen.getByRole("heading", { name: "What makes the choice difficult?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Save story plan" })).toBeTruthy();
  });
});

describe("기획의 native Back 복귀 초점", () => {
  it.each(["navigate", "reload"] as const)("일반 %s 진입에서는 입력 단계로 자동 초점을 옮기지 않는다", async (type) => {
    nativeNavigationType(type);
    render(<MemoryRouter initialEntries={["/story-lab?story-step=ending"]}><StoryLabPage /></MemoryRouter>);
    await showNativePage(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("새 문서의 native Back은 초안 복구 뒤 URL의 현재 입력 단계로 돌아온다", async () => {
    nativeNavigationType("back_forward");
    window.sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ version: 1, base: {}, story: { title: "보존한 기획", ending: "다시 확인할 결말" } }));
    render(<MemoryRouter initialEntries={["/story-lab?story-step=ending"]}><StoryLabPage /></MemoryRouter>);
    await waitFor(() => expect(document.activeElement?.id).toBe("story-step-heading-ending"));
    expect(document.querySelector<HTMLTextAreaElement>("#story-ending")?.value).toBe("다시 확인할 결말");
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain("보존한 기획");
  });

  it("BFCache pageshow 복귀도 현재 단계로 이동하고 새 저장 상태를 만들지 않는다", async () => {
    render(<MemoryRouter initialEntries={["/story-lab?story-step=conflict"]}><StoryLabPage /></MemoryRouter>);
    await showNativePage(true);
    expect(document.activeElement?.id).toBe("story-step-heading-conflict");
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
    expect(workspaceMock.saveStory).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "editable"] as const)("이미 복원된 %s 초점을 침범하지 않는다", async (kind) => {
    render(<MemoryRouter initialEntries={["/story-lab?story-step=conflict"]}><StoryLabPage /></MemoryRouter>);
    const restored = document.createElement(kind === "editable" ? "div" : kind);
    restored.tabIndex = 0;
    if (kind === "editable") restored.setAttribute("contenteditable", "true");
    document.body.append(restored);
    try {
      restored.focus();
      await showNativePage(true);
      expect(document.activeElement).toBe(restored);
    } finally { restored.remove(); }
  });

  it("유효한 hash 목적지의 복귀는 공통 탐색 소유자에게 맡긴다", async () => {
    nativeNavigationType("back_forward");
    render(<MemoryRouter initialEntries={["/story-lab?story-step=character#story-title"]}><StoryLabPage /></MemoryRouter>);
    await showNativePage(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("native Back과 동시에 생긴 숨긴 필드 오류의 입력 초점을 유지한다", async () => {
    nativeNavigationType("back_forward");
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    const world = document.querySelector<HTMLTextAreaElement>("#story-world");
    if (!title || !world) throw new Error("기획 입력 누락");
    fireEvent.change(title, { target: { value: "복귀한 기획" } });
    world.setCustomValidity("복귀한 세계 규칙을 확인하세요.");
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));
    await showNativePage(false);
    expect(document.activeElement).toBe(world);
    expect(world.closest("fieldset")?.hidden).toBe(false);
    expect(workspaceMock.saveStory).not.toHaveBeenCalled();
  });
});
