// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n-core";
import { TracePracticePage } from "./TracePracticePage";
import { LearnPage } from "./LearnPage";

beforeEach(() => { useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });

function openSuggestions() {
  const summary = screen.getByText("연습 방법과 가이드 도구 알아보기");
  const details = summary.closest("details");
  expect(details?.open).toBe(false);
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
  return within(screen.getByRole("region", { name: "연습 방법 참고" }));
}

describe("따라 그리기 실습 안내", () => {
  it("실제 작업 시작과 3단계 흐름을 먼저 보여주고 추가 안내는 접어 둔다", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    const start = screen.getByRole("link", { name: /따라 그리기 시작/ });
    expect(start.getAttribute("href")).toBe("/studio/canvas?practice=trace");
    const summary = screen.getByText("연습 방법과 가이드 도구 알아보기");
    expect(summary.closest("details")?.open).toBe(false);
    expect(start.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "따라 그리기 흐름 한눈에 보기" })).toBeTruthy();
    // 권리와 화면 공유 확인은 추가 안내를 펼치지 않아도 읽을 수 있다.
    expect(screen.getByRole("heading", { name: "공개·권리 확인" }).closest("details")).toBeNull();
    expect(screen.getByText(/화면 공유 중이라면/).closest("details")).toBeNull();
    openSuggestions();
    expect(screen.getAllByText(/이 이미지로 따라 그리기/)).toHaveLength(3);
    expect(screen.getByText(/타임랩스에서 제외/)).toBeTruthy();
  });

  it("로컬 선택은 참고 설명을 바꾸고 실제 Studio 설정 적용이나 타이머 실행을 주장하지 않는다", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    const guide = openSuggestions();
    expect(guide.getByText(/참고 설명만 바꿉니다/).textContent).toContain("타이머도 실행되지 않습니다");
    const gesture = guide.getByRole("button", { name: "30초 동세 연습" });
    const anatomy = guide.getByRole("button", { name: "2분 형태 연습" });
    const balanced = guide.getByRole("button", { name: "반투명 가이드" });
    const light = guide.getByRole("button", { name: "옅은 가이드" });
    expect(gesture.getAttribute("aria-pressed")).toBe("true");
    expect(balanced.getAttribute("aria-pressed")).toBe("true");
    expect(guide.getByRole("status").textContent).toContain("큰 동작");
    fireEvent.click(anatomy);
    fireEvent.click(light);
    expect(gesture.getAttribute("aria-pressed")).toBe("false");
    expect(anatomy.getAttribute("aria-pressed")).toBe("true");
    expect(balanced.getAttribute("aria-pressed")).toBe("false");
    expect(light.getAttribute("aria-pressed")).toBe("true");
    expect(guide.getByRole("status").textContent).toContain("몸통과 팔다리");
    expect(guide.getByRole("status").textContent).toContain("Studio에서 불투명도를 낮춰");
    expect(guide.getByRole("status").textContent).not.toMatch(/활성|표준 적용|posemaniacs|pct-onion/);
    expect(screen.getByRole("link", { name: /따라 그리기 시작/ }).getAttribute("href"))
      .toBe("/studio/canvas?practice=trace");
    fireEvent.click(guide.getByRole("button", { name: "투시 확인" }));
    fireEvent.click(guide.getByRole("button", { name: "흑백·반전 비교" }));
    expect(guide.getByRole("status").textContent).toContain("직접 선을 그어 비교");
    expect(guide.getByRole("status").textContent).toContain("원래 보기로 돌아와");
    fireEvent.click(guide.getByRole("button", { name: "선 정리" }));
    expect(guide.getByRole("status").textContent).toContain("가이드를 숨겨");
  });

  it("기존 학습 진입점과 현재 위치 표시를 유지한다", async () => {
    render(<MemoryRouter initialEntries={["/learn/trace"]}><LearnPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/ })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "따라 그리기" })).getAttribute("aria-current")).toBe("page");
  });

  it("참고 선택은 44px 터치 영역과 명암·포커스·모션 토큰을 유지한다", () => {
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    const guide = openSuggestions();
    for (const button of guide.getAllByRole("button")) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("motion-reduce:transition-none");
      expect(button.className).toContain("focus-visible:outline-2");
      if (button.getAttribute("aria-pressed") === "true") {
        expect(button.className).toContain("text-on-accent");
        expect(button.className).not.toContain("text-white");
      }
    }
  });

  it("영어에서도 참고 선택의 범위와 수동 설정 안내를 번역해 보여준다", () => {
    useI18n.setState({ lang: "en" });
    render(<MemoryRouter><TracePracticePage /></MemoryRouter>);
    fireEvent.click(screen.getByText("Explore practice methods and guide tools"));
    const guide = within(screen.getByRole("region", { name: "Practice suggestions" }));
    expect(guide.getByText(/do not change Studio settings or start a timer/)).toBeTruthy();
    fireEvent.click(guide.getByRole("button", { name: "Faint guide" }));
    expect(guide.getByRole("status").textContent).toContain("Lower the guide opacity in Studio");
    expect(guide.getByRole("status").textContent).not.toContain("legacyUi.");
  });
});
