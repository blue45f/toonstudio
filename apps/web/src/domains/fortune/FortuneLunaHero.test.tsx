// @vitest-environment jsdom
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FortuneLunaHero } from "./FortuneLunaHero";
import { useFortuneStore } from "./fortune-store";
import { drawFortuneTodayCards } from "./fortune-today-cards";
import { fortuneKstDate } from "@toonstudio/core/fortune";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="pathname">{location.pathname}</output>;
}

function HeroHarness({ onSaveTodayCards = () => undefined }: { onSaveTodayCards?: (text: string) => void }) {
  return (
    <MemoryRouter initialEntries={["/fortune"]}>
      <Routes>
        <Route path="/fortune" element={<FortuneLunaHero onSaveTodayCards={onSaveTodayCards} />} />
        <Route path="/fortune/:tab" element={<p>도구 화면</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  useFortuneStore.setState({ birthDate: "", birthTime: "", gender: "none", partnerBirthDate: "", partnerBirthTime: "" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FortuneLunaHero", () => {
  it("루나 패널과 오늘의 카드 4장을 첫 화면 구도로 렌더링한다", () => {
    render(<HeroHarness />);
    expect(screen.getByRole("heading", { name: "루나 · 오늘의 운세" })).not.toBeNull();
    expect(screen.getByText(/태어난 날을 알려주면, 사주와 별자리로 오늘의 컷을 읽어줄게요/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "오늘의 카드" })).not.toBeNull();
    const expected = drawFortuneTodayCards(fortuneKstDate());
    expected.forEach((card) => {
      expect(screen.getByRole("button", { name: `${card.name} 타로 리딩 열기` })).not.toBeNull();
    });
    expect(screen.getByText(/이 기기에만 저장돼요/)).not.toBeNull();
  });

  it("기본 종류는 사주이고, 생년월일을 기기 전용 프로필에 실어 도구로 이동한다", () => {
    render(<HeroHarness />);
    const saju = screen.getByRole("button", { name: "사주" });
    expect(saju.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "1995-04-12" } });
    fireEvent.click(screen.getByRole("button", { name: /오늘의 운세 보기/ }));
    expect(screen.getByTestId("pathname").textContent).toBe("/fortune/saju");
    expect(useFortuneStore.getState().birthDate).toBe("1995-04-12");
  });

  it("종류 칩을 바꾸면 이동할 도구도 바뀐다", () => {
    render(<HeroHarness />);
    fireEvent.click(screen.getByRole("button", { name: "별자리" }));
    expect(screen.getByRole("button", { name: "별자리" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /오늘의 운세 보기/ }));
    expect(screen.getByTestId("pathname").textContent).toBe("/fortune/zodiac");
  });

  it("오늘의 카드를 누르면 타로 리딩으로 이동한다", () => {
    render(<HeroHarness />);
    const [first] = drawFortuneTodayCards(fortuneKstDate());
    fireEvent.click(screen.getByRole("button", { name: `${first.name} 타로 리딩 열기` }));
    expect(screen.getByTestId("pathname").textContent).toBe("/fortune/tarot");
  });

  it("결과 저장은 오늘의 카드 요약을 콜백으로 넘긴다", () => {
    const onSaveTodayCards = vi.fn();
    render(<HeroHarness onSaveTodayCards={onSaveTodayCards} />);
    fireEvent.click(screen.getByRole("button", { name: /결과 저장/ }));
    expect(onSaveTodayCards).toHaveBeenCalledTimes(1);
    const text = onSaveTodayCards.mock.calls[0][0] as string;
    expect(text).toContain("오늘의 카드");
    drawFortuneTodayCards(fortuneKstDate()).forEach((card) => expect(text).toContain(card.name));
  });

  it("저장된 생년월일이 있으면 입력 초기값으로 채운다", () => {
    useFortuneStore.setState({ birthDate: "1990-01-02" });
    render(<HeroHarness />);
    expect((screen.getByLabelText("생년월일") as HTMLInputElement).value).toBe("1990-01-02");
  });
});
