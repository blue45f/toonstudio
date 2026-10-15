// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioProjectLibrary } from "../studio-project-library-store";
import { storyDevelopmentStorageKey } from "../studio-story-adaptation";

import type { MyStoryTextCompleter } from "./my-story-ai";
import { createMemoryStorage, FIXTURE_AT, fullSession } from "./my-story-test-fixture";
import {
  MY_STORY_SESSION_STORAGE_KEY,
  readMyStorySession,
  writeMyStorySession,
} from "./my-story-session-store";
import { MyStoryStartFlow, type MyStoryFlowStorage } from "./MyStoryStartFlow";

import { useI18n } from "@/shared/lib/i18n";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderFlow(props: Partial<ComponentProps<typeof MyStoryStartFlow>> = {}) {
  return render(
    <MemoryRouter initialEntries={["/create?intent=my-story"]}>
      <MyStoryStartFlow now={() => FIXTURE_AT} {...props} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function memory(): MyStoryFlowStorage & { readonly entries: Map<string, string> } {
  return createMemoryStorage();
}

/** 글자 입력은 현재 질문의 입력칸에 한다. */
function type(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** 자동저장(짧은 지연 뒤 기록)을 기다리지 않고 시계를 앞으로 돌린다 — 이 테스트에서만 가짜 타이머를 쓴다. */
function flushAutosave() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

const SAFETY_ANSWERS = [
  "공사장 출입구",
  "신입 직원",
  "안전모 없이 들어가려 했다",
  "출입 전에 안전모를 확인한다",
  "선배가 막아 줘서 다치지 않았다",
  "들어가기 전, 안전모부터",
] as const;

/** 안전 수칙 주제의 질문 6개에 모두 답하고 초안 화면까지 간다(initialTemplateId="safety"로 이미 시작된 상태). */
function answerSafetyAll() {
  SAFETY_ANSWERS.forEach((answer, index) => {
    type(answer);
    click(index === SAFETY_ANSWERS.length - 1 ? "초안 보기" : "다음");
  });
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("내 이야기 시작 동선 — 주제 선택", () => {
  it("제목·개인정보 안내와 주제 6종, 시작 버튼을 보여 준다", () => {
    renderFlow({ storage: memory() });
    expect(screen.getByRole("heading", { level: 1, name: "내 이야기를 웹툰으로" })).toBeTruthy();
    // 이 기기에만 저장된다는 사실과 실명·가족 안내가 항상 보인다.
    expect(screen.getByRole("heading", { name: "이 기기에만 저장돼요" })).toBeTruthy();
    expect(screen.getByText(/실명·연락처·주소·계좌번호는 적지 않는 게 안전해요/u)).toBeTruthy();
    const topics = screen.getAllByRole("radio");
    expect(topics.map((radio) => radio.closest("label")?.textContent)).toEqual([
      expect.stringContaining("회고"),
      expect.stringContaining("가족"),
      expect.stringContaining("동네"),
      expect.stringContaining("경력"),
      expect.stringContaining("안전 수칙"),
      expect.stringContaining("금융 상식"),
    ]);
    expect((topics[0] as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "질문 시작하기" })).toBeTruthy();
  });

  it("주제를 바꾸면 그 주제의 질문 미리보기와(안전·금융) 주의 문구가 나온다", () => {
    renderFlow({ storage: memory() });
    fireEvent.click(screen.getByRole("radio", { name: /안전 수칙/u }));
    expect(screen.getByRole("heading", { name: "‘안전 수칙’ 주제의 질문" })).toBeTruthy();
    expect(screen.getByText(/이 도구는 안전 수칙의 내용을 만들어 주지 않아요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /회고/u }));
    expect(screen.queryByText(/이 도구는 안전 수칙의 내용을 만들어 주지 않아요/u)).toBeNull();
  });

  it("AI는 화면을 여는 것만으로는 호출되지 않는다", () => {
    const complete = vi.fn<MyStoryTextCompleter>();
    renderFlow({ storage: memory(), complete });
    click("질문 시작하기");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("내 이야기 시작 동선 — 질문형 인터뷰", () => {
  it("질문을 한 번에 하나씩 보여 주고 입력칸은 질문으로 이름 붙는다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    expect(screen.getByText("질문 1 / 8")).toBeTruthy();
    const heading = screen.getByRole("heading", { level: 2, name: /누구에 대한 이야기인가요/u });
    const input = screen.getByRole("textbox", { name: /누구에 대한 이야기인가요/u });
    expect(input).toBeTruthy();
    expect(heading).toBeTruthy();
    expect(screen.getByText(/예시: 엄마/u)).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "답한 질문" });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("8");
  });

  it("비어 있으면 ‘건너뛰기’, 쓰면 ‘다음’으로 바뀌고 글자 수가 보인다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    expect(screen.getByRole("button", { name: "건너뛰기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
    type("엄마");
    expect(screen.getByRole("button", { name: "다음" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
    expect(screen.getByText("2 / 300")).toBeTruthy();
  });

  it("다음·이전으로 오가도 답변이 유지되고, 처음 질문에서는 이전이 막혀 있다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    expect((screen.getByRole("button", { name: "이전" }) as HTMLButtonElement).disabled).toBe(true);
    type("엄마");
    click("다음");
    expect(screen.getByText("질문 2 / 8")).toBeTruthy();
    click("이전");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("엄마");
  });

  it("Ctrl+Enter로 다음 질문으로 넘어가고 초점이 새 입력칸으로 옮겨진다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("엄마");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    expect(screen.getByText("질문 2 / 8")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("일반 Enter는 줄바꿈을 위해 남겨 두고 질문을 넘기지 않는다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("엄마");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByText("질문 1 / 8")).toBeTruthy();
  });

  it("질문 목록 버튼으로 원하는 질문에 바로 가고 현재 질문은 aria-current=step이다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "질문 목록" })).getByRole("button", { name: /그분의 모습/u }));
    expect(screen.getByText("질문 5 / 8")).toBeTruthy();
    // 질문이 바뀌면 질문 단계가 다시 그려지므로 목록을 다시 찾는다.
    const list = screen.getByRole("navigation", { name: "질문 목록" });
    expect(within(list).getByRole("button", { name: /그분의 모습/u }).getAttribute("aria-current")).toBe("step");
    expect(within(list).getByRole("button", { name: /누가/u }).getAttribute("aria-current")).toBeNull();
  });

  it("답한 질문은 목록에서 ‘답함’으로 구분되고 진행 막대 값이 늘어난다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("엄마");
    const list = screen.getByRole("navigation", { name: "질문 목록" });
    expect(within(list).getByRole("button", { name: /누가 답함/u })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "답한 질문" }).getAttribute("aria-valuenow")).toBe("1");
  });

  it("‘여기까지로 초안 보기’는 답이 하나라도 있어야 열린다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    expect((screen.getByRole("button", { name: "여기까지로 초안 보기" }) as HTMLButtonElement).disabled).toBe(true);
    type("엄마");
    expect((screen.getByRole("button", { name: "여기까지로 초안 보기" }) as HTMLButtonElement).disabled).toBe(false);
    click("여기까지로 초안 보기");
    expect(screen.getByRole("heading", { name: "초안 미리보기" })).toBeTruthy();
  });

  it("연락처처럼 보이는 숫자가 있으면 입력을 막지 않고 안내만 한다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("엄마 010-1234-5678");
    const hint = screen.getByText(/개인 정보처럼 보이는 내용이 있어요/u);
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.textContent).toContain("전화번호");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("엄마 010-1234-5678");
    type("엄마");
    expect(screen.queryByText(/개인 정보처럼 보이는 내용이 있어요/u)).toBeNull();
  });

  it("주제 다시 고르기로 주제 선택 화면에 돌아가며, 쓰던 진행은 이어 쓰기로 안내한다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("엄마");
    click("주제 다시 고르기");
    expect(screen.getByRole("heading", { name: "어떤 이야기를 남기고 싶나요?" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "이어 쓸 수 있는 이야기" })).toBeTruthy();
    click("이어서 쓰기");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("엄마");
  });
});

describe("내 이야기 시작 동선 — 임시저장·이어 쓰기", () => {
  it("쓰는 대로 이 기기에만 임시저장하고 저장됨을 알린다", () => {
    vi.useFakeTimers();
    const storage = memory();
    renderFlow({ storage, initialTemplateId: "family" });
    type("엄마");
    expect(storage.entries.has(MY_STORY_SESSION_STORAGE_KEY)).toBe(false);
    flushAutosave();
    expect(readMyStorySession(storage)?.answers.who).toBe("엄마");
    expect(screen.getByText("이 기기에 임시 저장됨")).toBeTruthy();
  });

  it("화면을 떠날 때는 기다리지 않고 마지막 상태를 바로 저장한다", () => {
    const storage = memory();
    const view = renderFlow({ storage, initialTemplateId: "family" });
    type("엄마");
    view.unmount();
    expect(readMyStorySession(storage)?.answers.who).toBe("엄마");
  });

  it("저장된 진행이 있으면 자동으로 덮어쓰지 않고 이어 쓸지 묻는다", () => {
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    renderFlow({ storage });
    expect(screen.getByRole("group", { name: "이어 쓸 수 있는 이야기" }).textContent).toContain("경력");
    expect(screen.getByRole("group", { name: "이어 쓸 수 있는 이야기" }).textContent).toContain("질문 8/8개 답함");
    click("이어서 쓰기");
    // 저장 당시가 검토 단계였으므로 초안 미리보기로 돌아온다.
    expect(screen.getByRole("heading", { name: "초안 미리보기" })).toBeTruthy();
  });

  it("주소의 주제로 열어도 이어 쓸 진행이 있으면 진행을 덮어쓰지 않는다", () => {
    vi.useFakeTimers();
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    renderFlow({ storage, initialTemplateId: "safety" });
    flushAutosave();
    expect(screen.getByRole("heading", { name: "어떤 이야기를 남기고 싶나요?" })).toBeTruthy();
    expect(readMyStorySession(storage)?.templateId).toBe("career");
    expect((screen.getByRole("radio", { name: /안전 수칙/u }) as HTMLInputElement).checked).toBe(true);
  });

  it("저장된 진행이 있을 때 다른 주제를 눌러 보기만 하면 저장본을 덮어쓰지 않고, 돌아와 이어 쓸 수 있다", () => {
    vi.useFakeTimers();
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    renderFlow({ storage });
    fireEvent.click(screen.getByRole("radio", { name: /안전 수칙/u }));
    click("질문 시작하기");
    flushAutosave();
    // 답을 하나도 적지 않았으므로 쓰던 경력 이야기가 그대로 남아 있다.
    expect(readMyStorySession(storage)?.templateId).toBe("career");
    click("주제 다시 고르기");
    expect(screen.getByRole("group", { name: "이어 쓸 수 있는 이야기" }).textContent).toContain("경력");
  });

  it("새 주제에 첫 답변을 적기 시작하면 저장본이 새 이야기로 대체되고 이어 쓰기 후보도 새 이야기가 된다", () => {
    vi.useFakeTimers();
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    renderFlow({ storage });
    fireEvent.click(screen.getByRole("radio", { name: /안전 수칙/u }));
    click("질문 시작하기");
    type("공사장 출입구");
    flushAutosave();
    expect(readMyStorySession(storage)?.templateId).toBe("safety");
    click("주제 다시 고르기");
    const banner = screen.getByRole("group", { name: "이어 쓸 수 있는 이야기" });
    expect(banner.textContent).toContain("안전 수칙");
    expect(banner.textContent).not.toContain("경력");
  });

  it("화면을 떠날 때도 이어 쓸지 정하지 않은 저장본은 답이 없는 새 세션으로 덮어쓰지 않는다", () => {
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    const view = renderFlow({ storage });
    fireEvent.click(screen.getByRole("radio", { name: /안전 수칙/u }));
    click("질문 시작하기");
    view.unmount();
    expect(readMyStorySession(storage)?.templateId).toBe("career");
  });

  it("지우고 새로 시작하면 저장본이 사라진다", () => {
    const storage = memory();
    writeMyStorySession(storage, fullSession("career"));
    renderFlow({ storage });
    click("지우고 새로 시작");
    expect(storage.entries.has(MY_STORY_SESSION_STORAGE_KEY)).toBe(false);
    expect(screen.queryByRole("group", { name: "이어 쓸 수 있는 이야기" })).toBeNull();
  });

  it("저장소가 막혀 있어도 흐름은 계속되고 저장 실패를 알린다", () => {
    vi.useFakeTimers();
    renderFlow({ storage: null, initialTemplateId: "family" });
    type("엄마");
    flushAutosave();
    expect(screen.getByText(/임시 저장에 실패했어요/u)).toBeTruthy();
    click("다음");
    expect(screen.getByText("질문 2 / 8")).toBeTruthy();
  });
});

describe("내 이야기 시작 동선 — 초안 미리보기", () => {
  it("답변이 컷에 배치되고 빈칸은 빈칸으로 표시되며 지어낸 문장이 없다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "safety" });
    type("공사장 출입구");
    click("다음");
    click("건너뛰기"); // 누가 — 건너뜀
    type("안전모 없이 들어가려 했다");
    click("여기까지로 초안 보기");

    const cuts = screen.getByRole("list", { name: "컷 초안" });
    const items = within(cuts).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0] as HTMLElement).getAllByText("공사장 출입구").length).toBeGreaterThan(0);
    expect(within(items[1] as HTMLElement).getAllByText(/안전모 없이 들어가려 했다/u).length).toBeGreaterThan(0);
    // 답하지 않은 칸이 놓인 컷은 빈칸이다.
    expect(within(items[2] as HTMLElement).getByText("빈칸")).toBeTruthy();
    expect(items[2]?.textContent).toContain("(빈칸)");
    expect(screen.getByText(/빈칸으로 남은 컷이 2장 있어요/u)).toBeTruthy();
  });

  it("컷 수와 분위기를 바꾸면 초안 구조가 바뀐다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "retrospective" });
    type("열두 살 여름");
    click("여기까지로 초안 보기");
    expect(within(screen.getByRole("list", { name: "컷 초안" })).getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("radio", { name: "4컷" }));
    expect(within(screen.getByRole("list", { name: "컷 초안" })).getAllByRole("listitem")).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("분위기(톤)"), { target: { value: "steady-record" } });
    expect(screen.getByText(/사실을 차분히 적어 가는 분위기/u)).toBeTruthy();
  });

  it("컷의 답변 고치기 버튼은 해당 질문으로 돌아가고, 질문으로 돌아가기는 마지막 질문으로 간다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "safety" });
    type("공사장 출입구");
    click("여기까지로 초안 보기");
    fireEvent.click(screen.getByRole("button", { name: "컷 1 답변 고치기" }));
    expect(screen.getByText("질문 1 / 6")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("공사장 출입구");
    click("여기까지로 초안 보기");
    click("질문으로 돌아가기");
    expect(screen.getByText("질문 6 / 6")).toBeTruthy();
  });

  it("작품 제목은 입력할 수 있고 비우면 기본 제목을 쓴다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "safety" });
    type("공사장 출입구");
    click("여기까지로 초안 보기");
    expect(screen.getAllByText("안전 수칙 한 컷 교육").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("작품 제목"), { target: { value: "첫 출근 안전" } });
    expect(screen.getAllByText("첫 출근 안전").length).toBeGreaterThan(0);
  });

  it("처음부터 다시 시작은 확인을 거친 뒤에만 답변을 지운다", () => {
    const storage = memory();
    renderFlow({ storage, initialTemplateId: "safety" });
    type("공사장 출입구");
    click("여기까지로 초안 보기");
    click("처음부터 다시 시작");
    expect(screen.getByText("쓴 답변이 모두 지워져요.")).toBeTruthy();
    click("취소");
    expect(screen.getByRole("heading", { name: "초안 미리보기" })).toBeTruthy();
    click("처음부터 다시 시작");
    click("지우고 처음부터");
    expect(screen.getByRole("heading", { name: "어떤 이야기를 남기고 싶나요?" })).toBeTruthy();
    expect(storage.entries.has(MY_STORY_SESSION_STORAGE_KEY)).toBe(false);
  });
});

describe("내 이야기 시작 동선 — 스튜디오에서 열기", () => {
  it("작품을 만들고 기존 대본·콘티 경로로 이동하며 임시저장을 비운다", () => {
    const storage = memory();
    renderFlow({ storage, initialTemplateId: "safety" });
    answerSafetyAll();
    click("스튜디오에서 열기");

    const projects = readStudioProjectLibrary(storage).projects;
    expect(projects).toHaveLength(1);
    const project = projects[0];
    expect(project?.title).toBe("안전 수칙 한 컷 교육");
    expect(screen.getByTestId("location").textContent).toBe(
      `/studio/p/${encodeURIComponent(project?.id ?? "")}/story?view=script`,
    );
    const raw = storage.getItem(storyDevelopmentStorageKey(project?.id ?? ""));
    expect(raw).toContain("출입 전에 안전모를 확인한다");
    expect(storage.entries.has(MY_STORY_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("저장에 실패하면 오류를 알리고 다시 시도할 수 있으며 만들다 만 작품을 남기지 않는다", () => {
    const base = memory();
    let failStory = true;
    const storage: MyStoryFlowStorage = {
      getItem: (key) => base.getItem(key),
      setItem: (key, value) => {
        if (failStory && key.includes("story-development")) throw new Error("QuotaExceededError");
        base.setItem(key, value);
      },
      removeItem: (key) => base.removeItem(key),
    };
    renderFlow({ storage, initialTemplateId: "safety" });
    answerSafetyAll();
    click("스튜디오에서 열기");

    expect(screen.getByRole("alert").textContent).toContain("초안을 작품에 저장하지 못했어요");
    expect(readStudioProjectLibrary(base).projects.filter((project) => project.status !== "trashed")).toEqual([]);
    expect(screen.getByTestId("location").textContent).toBe("/create?intent=my-story");
    // 답변은 지워지지 않았다.
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();

    failStory = false;
    click("다시 시도");
    expect(screen.getByTestId("location").textContent).toMatch(/\/story\?view=script$/u);
  });

  it("저장소를 쓸 수 없으면 작품을 만들 수 없다고 알린다", () => {
    renderFlow({ storage: null, initialTemplateId: "safety" });
    answerSafetyAll();
    click("스튜디오에서 열기");
    expect(screen.getByRole("alert").textContent).toContain("저장 공간을 쓸 수 없어");
  });
});

describe("내 이야기 시작 동선 — 텍스트 AI 보강(사용자가 누를 때만)", () => {
  const reply = (cuts: readonly { index: number; narration: string }[]): MyStoryTextCompleter =>
    vi.fn(async () => ({ ok: true as const, data: { content: JSON.stringify({ cuts }) } }));

  async function openAiReady(complete: MyStoryTextCompleter) {
    renderFlow({ storage: memory(), initialTemplateId: "safety", complete });
    answerSafetyAll();
    return screen.getByRole("region", { name: /AI로 나레이션 다듬기/u });
  }

  it("버튼을 누르기 전에는 호출하지 않고, 보낼 내용을 미리 보여 준다", async () => {
    const complete = reply([]);
    const panel = await openAiReady(complete);
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByText("보낼 내용 미리 보기"));
    expect(within(panel).getByText(/공사장 출입구/u)).toBeTruthy();
    // 나레이션이 되지 않는 칸(누가)은 보내지 않는다.
    expect(within(panel).queryByText(/신입 직원/u)).toBeNull();
  });

  it("보낼 답변에 개인 정보처럼 보이는 숫자가 있으면 누르기 전에 알리되 보내는 것을 막지는 않는다", () => {
    const complete = reply([]);
    renderFlow({ storage: memory(), initialTemplateId: "safety", complete });
    type("공사장 출입구 010-1234-5678");
    click("여기까지로 초안 보기");
    const panel = screen.getByRole("region", { name: /AI로 나레이션 다듬기/u });
    expect(within(panel).getByText(/보낼 내용에 개인 정보처럼 보이는 것이 있어요 \(전화번호\)/u)).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "AI로 다듬기" }) as HTMLButtonElement).disabled).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it("개인 정보처럼 보이는 내용이 없으면 이 경고를 보이지 않는다", async () => {
    const panel = await openAiReady(reply([]));
    expect(within(panel).queryByText(/보낼 내용에 개인 정보처럼 보이는 것이/u)).toBeNull();
  });

  it("후보를 받아 컷별로 채택·되돌릴 수 있고, 채택 전에는 초안이 바뀌지 않는다", async () => {
    const complete = reply([{ index: 2, narration: "안전모 없이 안으로 들어가려 했다" }]);
    const panel = await openAiReady(complete);
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "AI로 다듬기" }));
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(within(panel).getByText(/AI 후보: 안전모 없이 안으로 들어가려 했다/u)).toBeTruthy();
    const cuts = screen.getByRole("list", { name: "컷 초안" });
    expect(within(cuts).queryByText("AI 문장")).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "이 문장 쓰기" }));
    expect(within(cuts).getByText("AI 문장")).toBeTruthy();
    expect(within(panel).getByText("AI 문장 사용 중")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "내 답변으로 되돌리기" }));
    expect(within(cuts).queryByText("AI 문장")).toBeNull();
  });

  it("실패하면 알림과 다시 시도를 보이고 초안은 그대로다", async () => {
    const complete: MyStoryTextCompleter = vi.fn(async () => ({
      ok: false as const,
      code: "network_error" as const,
      error: "엔드포인트에 연결할 수 없어요.",
    }));
    const panel = await openAiReady(complete);
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "AI로 다듬기" }));
    });
    expect(within(panel).getByText("엔드포인트에 연결할 수 없어요.")).toBeTruthy();
    expect(within(panel).getByText("지금 초안은 그대로예요.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: /다시 시도/u }));
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("list", { name: "컷 초안" })).queryByText("AI 문장")).toBeNull();
  });

  it("로그인이 필요하면 로그인 안내를 보여 준다", async () => {
    const complete: MyStoryTextCompleter = vi.fn(async () => ({
      ok: false as const,
      code: "login_required" as const,
      error: "로그인하면 자동 무료 AI를 바로 사용할 수 있어요.",
    }));
    const panel = await openAiReady(complete);
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "AI로 다듬기" }));
    });
    expect(within(panel).getByRole("button", { name: "로그인하고 계속" })).toBeTruthy();
  });

  it("쓸 만한 후보가 없으면 빈 상태를 알린다", async () => {
    const panel = await openAiReady(reply([{ index: 2, narration: "안전모 없이 2024년에 들어가려 했다" }]));
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "AI로 다듬기" }));
    });
    expect(within(panel).getByText(/쓸 만한 AI 문장이 나오지 않았어요/u)).toBeTruthy();
    expect(within(panel).getByText(/1개는 원문에 없는 숫자가 생기거나 길이를 넘어 제외했어요/u)).toBeTruthy();
  });

  it("진행 중에는 로딩 상태와 취소를 보이고, 취소하면 늦게 온 응답을 버린다", async () => {
    type Completion = Awaited<ReturnType<MyStoryTextCompleter>>;
    let resolve: ((value: Completion) => void) | undefined;
    const complete: MyStoryTextCompleter = vi.fn(() => new Promise<Completion>((done) => {
      resolve = done;
    }));
    const panel = await openAiReady(complete);
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "AI로 다듬기" }));
    });
    expect(within(panel).getByText("AI가 나레이션 문장을 다듬는 중이에요…")).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "AI로 다듬기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "취소" }));
    await act(async () => {
      resolve?.({ ok: true, data: { content: JSON.stringify({ cuts: [{ index: 2, narration: "안전모 없이 안으로 들어가려 했다" }] }) } });
      await Promise.resolve();
    });
    expect(within(panel).queryByText(/AI 후보/u)).toBeNull();
    expect((within(panel).getByRole("button", { name: "AI로 다듬기" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("내 이야기 시작 동선 — 영어 화면", () => {
  const HANGUL = /[ㄱ-ㆎ가-힣]/u;

  beforeEach(() => {
    useI18n.setState({ lang: "en" });
  });

  it("질문·빈칸 안내·나레이션 상자 안내가 영어로만 나오고 한글이 섞이지 않는다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "safety" });
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(screen.getByText(/Example: A construction-site entrance/u)).toBeTruthy();
    type("A construction-site entrance");
    fireEvent.click(screen.getByRole("button", { name: "See the draft so far" }));

    const cuts = screen.getByRole("list", { name: "Panel draft" });
    const items = within(cuts).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    // 답하지 않은 칸이 놓인 컷은 영어 빈칸 안내다.
    expect(items[1]?.textContent).toContain("(blank) It fills in once you answer: Risky moment.");
    // 나레이션·말풍선 상자 안내는 영어 위치·종류 이름을 쓴다.
    expect(items[0]?.textContent).toContain("Narration candidate (bottom · up to 28 characters)");
    expect(items[1]?.textContent).toContain("Balloon candidate (speech · up to 16 characters)");
    expect(HANGUL.test(cuts.textContent ?? "")).toBe(false);
  });

  it("개인 정보 안내도 영어 이름만 쓴다", () => {
    renderFlow({ storage: memory(), initialTemplateId: "family" });
    type("Mom 010-1234-5678");
    const hint = screen.getByText(/This looks like personal information/u);
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.textContent).toContain("(phone number)");
    expect(HANGUL.test(hint.textContent ?? "")).toBe(false);
  });
});
