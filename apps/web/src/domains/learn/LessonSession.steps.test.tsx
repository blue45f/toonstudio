// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LearnPage } from "./LearnPage";
import { LESSONS } from "./learning-content";

afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

function History() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="강좌 주소">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>뒤로 복귀</button></>;
}

function openLesson(url = "/learn/lessons/story-board") {
  return render(<MemoryRouter initialEntries={[url]}><History /><Routes><Route path="/learn/*" element={<LearnPage />} /></Routes></MemoryRouter>);
}

const address = () => new URL(screen.getByLabelText("강좌 주소").textContent ?? "", "http://localhost");
const stepButton = (name: string) => within(screen.getByRole("navigation", { name: "수업 단계" })).getByRole("button", { name });
const notesSummary = () => screen.getByText(/^실습 메모/u, { selector: "summary" });

describe("한 과제 중심 강좌 단계", () => {
  it("목표에 실제 결과·과제·관련 도식을 두고 확인 입력과 선택 자료를 분리한다", () => {
    openLesson();
    const lesson = LESSONS.find((candidate) => candidate.id === "story-board");
    if (!lesson) throw new Error("실제 강좌 데이터가 필요합니다.");
    expect(within(screen.getByRole("region", { name: "이번에 만들 결과" })).getByText(lesson.task)).toBeTruthy();
    expect(screen.getByRole("img", { name: /컷 사이의 호흡/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: "한 과제 시작 →" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "나의 실습 메모" })).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "수업 단계" })).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "개념·용어·출처 선택 자료" })).toBeTruthy();
    expect(stepButton("목표").getAttribute("aria-current")).toBe("step");
  });

  it("단계만 선택해도 완료 처리하지 않고, 맥락과 예제 입력을 유지한 채 Back으로 원래 조작에 복귀한다", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    openLesson("/learn/lessons/story-board?from=first-three-panels&project=retained&labValue=35&lesson-step=goal");
    const start = screen.getByRole("button", { name: "한 과제 시작 →" });
    fireEvent.click(start);
    expect(address().searchParams.get("from")).toBe("first-three-panels");
    expect(address().searchParams.get("project")).toBe("retained");
    expect(address().searchParams.get("labValue")).toBe("35");
    expect(address().searchParams.get("lesson-step")).toBe("practice");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "직접 만들어 보세요" }));
    const slider = screen.getByRole("slider", { name: /오른쪽 컷 간격/u });
    fireEvent.change(slider, { target: { value: "49" } });
    fireEvent.click(stepButton("자가 확인"));
    expect(screen.getAllByRole("checkbox").every((input) => input instanceof HTMLInputElement && !input.checked)).toBe(true);
    expect((screen.getByRole("button", { name: "이 강좌 학습 완료" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "뒤로 복귀" }));
    expect(address().searchParams.get("lesson-step")).toBe("practice");
    expect(screen.getByRole("slider", { name: /오른쪽 컷 간격/u })).toBe(slider);
    expect((slider as HTMLInputElement).value).toBe("49");
    expect(document.activeElement).toBe(stepButton("자가 확인"));
    fireEvent.click(screen.getByRole("button", { name: "뒤로 복귀" }));
    expect(address().searchParams.get("lesson-step")).toBe("goal");
    expect(document.activeElement).toBe(start);
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("메모 인스턴스와 입력을 단계·선택 자료 이동 및 재진입에서 보존한다", () => {
    const first = openLesson();
    fireEvent.click(notesSummary());
    const memo = screen.getByRole("textbox", { name: "나의 실습 메모" });
    fireEvent.change(memo, { target: { value: "변화 컷에서 반응을 분명하게" } });
    fireEvent.click(stepButton("한 과제"));
    expect(screen.getByRole("textbox", { name: "나의 실습 메모" })).toBe(memo);
    fireEvent.click(screen.getByRole("button", { name: "개념·용어·출처 선택 자료" }));
    expect(address().searchParams.get("lesson-step")).toBe("reference");
    expect(screen.getByRole("heading", { name: "공식 참고 자료" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "나의 실습 메모" })).toBe(memo);
    first.unmount();
    openLesson("/learn/lessons/story-board?lesson-step=check");
    fireEvent.click(notesSummary());
    expect((screen.getByRole("textbox", { name: "나의 실습 메모" }) as HTMLTextAreaElement).value).toBe("변화 컷에서 반응을 분명하게");
    expect(screen.queryByRole("button", { name: "학습 완료됨" })).toBeNull();
  });

  it.each([
    ["#story-board-practice", "한 과제", "직접 만들어 보세요"],
    ["#story-board-quiz", "자가 확인", "확인 퀴즈"],
    ["#story-board-concept-2", null, "개념·용어·출처"],
    ["#story-board-notes", "자가 확인", "나의 실습 메모"],
  ])("기존 앵커 %s를 숨긴 화면으로 잃어버리지 않는다", (hash, current, heading) => {
    openLesson(`/learn/lessons/story-board?from=first-three-panels${hash}`);
    if (current) expect(stepButton(current).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    if (hash.endsWith("notes")) expect(screen.getByRole("textbox", { name: "나의 실습 메모" })).toBeTruthy();
    fireEvent.click(stepButton("목표"));
    expect(address().hash).toBe("");
    expect(address().searchParams.get("from")).toBe("first-three-panels");
    expect(stepButton("목표").getAttribute("aria-current")).toBe("step");
  });

  it("공유한 예제 주소는 조작 화면으로 열고, 숫자 단축키는 체크 결과를 보이게 한다", () => {
    openLesson("/learn/lessons/story-board?labValue=45&labView=comparison#story-board-lab");
    expect(stepButton("한 과제").getAttribute("aria-current")).toBe("step");
    expect((screen.getByRole("slider", { name: /오른쪽 컷 간격/u }) as HTMLInputElement).value).toBe("45");
    fireEvent.keyDown(window, { key: "1" });
    expect(stepButton("자가 확인").getAttribute("aria-current")).toBe("step");
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("button", { name: "학습 완료됨" })).toBeNull();
  });

  it("저장 실패 시 메모를 유지하고 재시도로 같은 기록을 저장한다", () => {
    openLesson();
    fireEvent.click(notesSummary());
    const memo = screen.getByRole("textbox", { name: "나의 실습 메모" });
    const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.change(memo, { target: { value: "실패해도 보존할 실습 메모" } });
    expect(screen.getByText("저장되지 않은 변경 있음")).toBeTruthy();
    expect(screen.getByRole("button", { name: "기록 저장 다시 시도" })).toBeTruthy();
    expect((memo as HTMLTextAreaElement).value).toBe("실패해도 보존할 실습 메모");
    fail.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "기록 저장 다시 시도" }));
    expect(screen.queryByText("저장되지 않은 변경 있음")).toBeNull();
    expect(screen.queryByRole("button", { name: "기록 저장 다시 시도" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "나의 실습 메모" }) as HTMLTextAreaElement).value).toBe("실패해도 보존할 실습 메모");
  });
});
