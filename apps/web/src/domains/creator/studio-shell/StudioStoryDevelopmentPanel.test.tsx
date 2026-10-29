// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioStoryDevelopmentDocument, storyDevelopmentStorageKey } from "../studio-story-adaptation";
import { StudioStoryDevelopmentPanel } from "./StudioStoryDevelopmentPanel";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
const PROJECT = "focused-script-test";
const SOURCE = "비 오는 서점에서 학생이 고양이를 만난다. 학생은 고양이에게 담요를 덮어 준다.";

function seed() {
  const draft = createStudioStoryDevelopmentDocument();
  const chapter = draft.chapters[0];
  if (!chapter) throw new Error("초기 회차가 필요합니다.");
  const value = { ...draft, title: "서점 이야기", chapters: [{ ...chapter, body: SOURCE }] };
  window.localStorage.setItem(storyDevelopmentStorageKey(PROJECT), JSON.stringify(value));
  return value;
}

function openAnalysis() {
  fireEvent.click(screen.getByText("대본을 새 컷 계획으로 나누기 (선택)"));
}

beforeEach(() => { window.localStorage.clear(); seed(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("집중 대본 화면", () => {
  it("대본과 현재 컷 수를 먼저 보여 주고 재분석·작품 설정을 접어 둔다", () => {
    render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused currentPanelCount={8} onApplyBeats={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "내 대본" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "대본" }) as HTMLTextAreaElement).value).toBe(SOURCE);
    expect(screen.getByText(/현재 8컷 계획이 준비되어/u)).toBeTruthy();
    expect(screen.getByText("이 기기에 대본 저장됨")).toBeTruthy();
    expect(screen.getByRole("button", { name: "새 컷 계획으로 교체" }).closest("details")?.open).toBe(false);
    expect(screen.getByRole("textbox", { name: "작품명" }).closest("details")?.open).toBe(false);
    expect(screen.getByText("작품 정보·줄거리 수정").closest("details")?.open).toBe(false);
    expect(screen.getByText("대본을 새 컷 계획으로 나누기 (선택)").closest("details")?.open).toBe(false);
  });

  it("기존 컷 계획 교체는 확인 후 실행하고 취소·본문 편집 시 확인을 초기화한다", () => {
    const apply = vi.fn();
    render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused currentPanelCount={4} onApplyBeats={apply} />);
    openAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "새 컷 계획으로 교체" }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "컷 계획 교체 확인" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새 컷 계획으로 교체" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("group", { name: "컷 계획 교체 확인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "새 컷 계획으로 교체" }));
    fireEvent.change(screen.getByRole("textbox", { name: "대본" }), { target: { value: SOURCE + " 서점 주인이 문을 연다." } });
    expect(screen.queryByRole("group", { name: "컷 계획 교체 확인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "새 컷 계획으로 교체" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "확인하고 교체" }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0].length).toBeGreaterThan(0);
    expect(apply.mock.calls[0]?.[1]).toBe("replace");
    expect((screen.getByRole("textbox", { name: "대본" }) as HTMLTextAreaElement).value).toContain(SOURCE);
  });

  it("저장 실패를 알리고 본문을 유지하며 재시도로 실제 기기 저장을 복구한다", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const view = render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused currentPanelCount={4} onApplyBeats={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("대본을 저장하지 못했어요");
    expect(screen.queryByText("이 기기에 대본 저장됨")).toBeNull();
    const revised = SOURCE + " 고양이가 안심하고 눈을 감는다.";
    fireEvent.change(screen.getByRole("textbox", { name: "대본" }), { target: { value: revised } });
    expect((screen.getByRole("textbox", { name: "대본" }) as HTMLTextAreaElement).value).toBe(revised);
    writes.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "저장 다시 시도" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("이 기기에 대본 저장됨")).toBeTruthy();
    view.unmount();
    render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused onApplyBeats={vi.fn()} />);
    expect((screen.getByRole("textbox", { name: "대본" }) as HTMLTextAreaElement).value).toBe(revised);
  });

  it("프로젝트를 바꾸면 이전 프로젝트의 교체 확인과 내용을 전달하지 않는다", () => {
    const other = { ...seed(), title: "다른 이야기" };
    const chapter = other.chapters[0];
    if (!chapter) throw new Error("초기 회차가 필요합니다.");
    other.chapters = [{ ...chapter, body: "다른 프로젝트의 대본." }];
    window.localStorage.setItem(storyDevelopmentStorageKey("other"), JSON.stringify(other));
    const apply = vi.fn();
    const view = render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused currentPanelCount={4} onApplyBeats={apply} />);
    openAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "새 컷 계획으로 교체" }));
    view.rerender(<StudioStoryDevelopmentPanel projectId="other" focused currentPanelCount={8} onApplyBeats={apply} />);
    expect(screen.queryByRole("group", { name: "컷 계획 교체 확인" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "대본" }) as HTMLTextAreaElement).value).toBe("다른 프로젝트의 대본.");
    expect(apply).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(storyDevelopmentStorageKey(PROJECT))).toContain(SOURCE);
  });

  it("빈 컷 계획을 준비 완료로 표시하지 않는다", () => {
    render(<StudioStoryDevelopmentPanel projectId={PROJECT} focused currentPanelCount={0} onApplyBeats={vi.fn()} />);
    expect(screen.queryByText(/현재 0컷 계획이 준비되어/u)).toBeNull();
    expect(screen.getByText(/대본을 적고 아래에서 컷 계획을 만들어/u)).toBeTruthy();
  });

  it("전체 도구 화면의 기존 적용 동작과 추가 모드를 유지한다", () => {
    const apply = vi.fn();
    render(<StudioStoryDevelopmentPanel projectId={PROJECT} onApplyBeats={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "컷 계획으로 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "기존 계획 뒤에 추가" }));
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls.map((call) => call[1])).toEqual(["replace", "append"]);
  });
});
