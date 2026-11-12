// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnPage } from "./LearnPage";
import { LESSONS } from "./learning-content";
import { resolveLessonNavigation } from "./learning-lesson-navigation";
import { LEARNING_PATHS } from "./learning-paths";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 학습 주소">{location.pathname}{location.search}{location.hash}</output>;
}

function HistoryControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>학습 뒤로</button><button onClick={() => navigate(`${pathLesson("scroll-rhythm")}&q=채색`)}>학습 검색 변경</button></>;
}

function renderLearning(url: string) {
  render(<MemoryRouter initialEntries={[url]}><LocationProbe /><HistoryControls /><Routes>
    <Route path="/learn/*" element={<LearnPage />} />
  </Routes></MemoryRouter>);
}

function lessonNav() {
  return within(screen.getByRole("navigation", { name: "이전·다음 강좌" }));
}

const currentUrl = () => screen.getByLabelText("현재 학습 주소").textContent;
const pathLesson = (id: string) => `/learn/lessons/${id}?from=first-three-panels`;

describe("선택한 학습 경로의 연속성", () => {
  it("모든 경로가 전체 커리큘럼과 독립된 순서와 경계를 가진다", () => {
    for (const path of LEARNING_PATHS) {
      path.lessonIds.forEach((id, index) => {
        const result = resolveLessonNavigation(id, path.id);
        expect(result.path?.id).toBe(path.id);
        expect(result.previous?.id).toBe(path.lessonIds[index - 1]);
        expect(result.next?.id).toBe(path.lessonIds[index + 1]);
        expect(result.backUrl).toBe(`/learn/paths/${path.id}`);
        expect(result.previousUrl).toBe(index ? `/learn/lessons/${path.lessonIds[index - 1]}?from=${path.id}` : null);
        expect(result.nextUrl).toBe(index < path.lessonIds.length - 1 ? `/learn/lessons/${path.lessonIds[index + 1]}?from=${path.id}` : null);
      });
    }
  });

  it("경로를 시작해 끝까지 클릭하면 같은 경로와 현재 수업 번호를 유지한다", () => {
    renderLearning("/learn/paths/first-three-panels");
    fireEvent.click(screen.getByRole("link", { name: /경로 시작하기/ }));
    for (const [index, id] of ["story-board", "scroll-rhythm", "lettering", "studio-first-page"].entries()) {
      expect(currentUrl()).toBe(pathLesson(id));
      expect(screen.getByText(`첫 3컷 완성 · ${index + 1}/4 수업`)).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      if (index < 3) fireEvent.click(lessonNav().getByRole("link", { name: /다음 수업/ }));
    }
    expect(lessonNav().queryByRole("link", { name: /다음 수업/ })).toBeNull();
    fireEvent.click(lessonNav().getByRole("link", { name: /경로 학습 현황 보기/ }));
    expect(currentUrl()).toBe("/learn/paths/first-three-panels");
    expect(screen.getByRole("heading", { level: 1, name: "첫 3컷 완성" })).toBeTruthy();
    // 마지막 강좌를 열었다고 완료 기록을 만들지 않는다.
    expect(screen.getByText("완료 0/4")).toBeTruthy();
  });

  it("클릭과 키보드의 이전·다음 목적지가 같고 입력 중에는 이동하지 않는다", () => {
    renderLearning(pathLesson("scroll-rhythm"));
    expect(lessonNav().getByRole("link", { name: /다음 수업/ }).getAttribute("href")).toBe(pathLesson("lettering"));
    fireEvent.keyDown(window, { key: "]" });
    expect(currentUrl()).toBe(pathLesson("lettering"));
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    expect(currentUrl()).toBe(pathLesson("scroll-rhythm"));
    fireEvent.click(lessonNav().getByRole("link", { name: /이전 수업/ }));
    expect(currentUrl()).toBe(pathLesson("story-board"));
    fireEvent.keyDown(window, { key: "[" });
    expect(currentUrl()).toBe(pathLesson("story-board"));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "나의 실습 메모" }), { key: "]" });
    expect(currentUrl()).toBe(pathLesson("story-board"));
    fireEvent.click(screen.getByRole("link", { name: "← 첫 3컷 완성 경로로" }));
    expect(currentUrl()).toBe("/learn/paths/first-three-panels");
  });

  it("경로의 마지막 수업에서는 단축키가 관련 없는 전체 강좌로 넘어가지 않는다", () => {
    renderLearning(pathLesson("studio-first-page"));
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    expect(currentUrl()).toBe(pathLesson("studio-first-page"));
    expect(lessonNav().getByRole("link", { name: /이전 수업/ }).getAttribute("href")).toBe(pathLesson("lettering"));
  });

  it("강좌 완료 뒤의 실습 추천도 선택한 경로 밖으로 이탈하지 않는다", () => {
    renderLearning("/learn/lessons/character-silhouette?from=visual-finish");
    const lesson = LESSONS.find((item) => item.id === "character-silhouette");
    if (!lesson) throw new Error("그림 완성도 경로의 첫 수업이 필요합니다.");
    const checklist = within(screen.getByRole("group", { name: /실습 체크리스트/ }));
    for (const checkbox of checklist.getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("radio", { name: lesson.quiz.options[lesson.quiz.answer] }));
    fireEvent.click(screen.getByRole("button", { name: "실습 완료로 표시" }));
    fireEvent.click(screen.getByRole("button", { name: "이 강좌 학습 완료" }));
    expect(screen.getByRole("link", { name: /미션 강좌로 이동/ }).getAttribute("href"))
      .toBe("/learn/lessons/inking?from=visual-finish#inking-practice");
  });

  it.each([null, "not-a-path", "https://example.invalid", "visual-finish"])("경로 맥락 %s가 유효하지 않으면 전체 강좌 순서로 복구한다", (from) => {
    const result = resolveLessonNavigation("scroll-rhythm", from);
    expect(result.path).toBeNull();
    expect(result.next?.id).toBe("camera-perspective");
    expect(result.nextUrl).toBe("/learn/lessons/camera-perspective");
    expect(result.backUrl).toBe("/learn#learn-library");
  });

  it("유효하지 않은 from은 클릭과 키보드로 다음 강좌에 전파하지 않는다", () => {
    renderLearning("/learn/lessons/scroll-rhythm?from=visual-finish");
    expect(screen.getByRole("link", { name: "← 전체 강좌" }).getAttribute("href")).toBe("/learn#learn-library");
    expect(lessonNav().getByRole("link", { name: /다음 수업/ }).getAttribute("href")).toBe("/learn/lessons/camera-perspective");
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    expect(currentUrl()).toBe("/learn/lessons/camera-perspective");
    fireEvent.click(lessonNav().getByRole("link", { name: /이전 수업/ }));
    expect(currentUrl()).toBe("/learn/lessons/scroll-rhythm");
  });

  it("경로 없이 진입한 전체 커리큘럼의 마지막 수업은 목록으로 돌아간다", () => {
    const last = LESSONS[LESSONS.length - 1];
    renderLearning(`/learn/lessons/${last.id}`);
    expect(lessonNav().getByRole("link", { name: /전체 강좌 다시 보기/ }).getAttribute("href")).toBe("/learn");
  });
});


describe("강좌 제목 초점과 복귀한 조작의 협력", () => {
  it("POP 초기 진입은 이미 복원된 현재 작품 링크 초점을 덮지 않는다", () => {
    const region = document.createElement("aside"); region.dataset.activeProjectContext = "true";
    const link = document.createElement("a"); link.href = "/learn"; link.textContent = "돌아온 작품 실습";
    region.append(link); document.body.append(region); link.focus();
    try {
      renderLearning(pathLesson("scroll-rhythm"));
      expect(document.activeElement).toBe(link);
    } finally { region.remove(); }
  });

  it("실제 이전·다음 PUSH는 새 제목으로 이동하고 POP는 사용 중인 외부 입력을 보존한다", () => {
    const outside = document.createElement("input"); outside.setAttribute("aria-label", "다른 영역 입력"); document.body.append(outside);
    try {
      renderLearning(pathLesson("scroll-rhythm"));
      fireEvent.click(lessonNav().getByRole("link", { name: /다음 수업/ }));
      expect(currentUrl()).toBe(pathLesson("lettering"));
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      outside.focus(); fireEvent.click(screen.getByRole("button", { name: "학습 뒤로" }));
      expect(currentUrl()).toBe(pathLesson("scroll-rhythm"));
      expect(document.activeElement).toBe(outside);
    } finally { outside.remove(); }
  });

  it("검색 query PUSH로 바뀌어도 같은 강좌의 실습 메모 초점과 입력은 보존한다", () => {
    renderLearning(pathLesson("scroll-rhythm"));
    const memo = screen.getByRole("textbox", { name: "나의 실습 메모" });
    fireEvent.change(memo, { target: { value: "검색 뒤에도 이 메모를 계속 쓴다" } }); memo.focus();
    fireEvent.click(screen.getByRole("button", { name: "학습 검색 변경" }));
    expect(new URL(currentUrl() ?? "", "http://localhost").searchParams.get("q")).toBe("채색");
    expect(document.activeElement).toBe(memo);
    if (!(memo instanceof HTMLTextAreaElement)) throw new Error("실습 메모 입력 누락");
    expect(memo.value).toBe("검색 뒤에도 이 메모를 계속 쓴다");
  });
});


describe("늦게 준비된 강좌의 기존 입력 초점", () => {
  it.each(["input", "editable"] as const)("PUSH 진입 중 이미 쓰는 외부 %s의 초점을 유지한다", (kind) => {
    const outside = document.createElement(kind === "input" ? "input" : "div");
    if (kind === "editable") { outside.setAttribute("contenteditable", "true"); outside.tabIndex = 0; }
    document.body.append(outside);
    try {
      renderLearning("/learn/paths/first-three-panels"); outside.focus();
      fireEvent.click(screen.getByRole("link", { name: /경로 시작하기/ }));
      expect(currentUrl()).toBe(pathLesson("story-board"));
      expect(document.activeElement).toBe(outside);
    } finally { outside.remove(); }
  });
});
