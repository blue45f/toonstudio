// @vitest-environment jsdom
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fortuneKstDate } from "@toonstudio/core/fortune";
import { FortuneObservatory } from "./FortuneObservatory";
import { FortuneToolHero } from "./FortuneToolHero";
import { useFortuneStore } from "./fortune-store";
import { FORTUNE_TAB_META, FORTUNE_TAB_ORDER, type FortuneTab } from "./fortune-page-data";
import { FORTUNE_TOOL_HERO } from "./fortune-tool-hero";
import { drawFortuneTodayCards } from "./fortune-today-cards";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null, ready: true }),
}));

beforeEach(() => {
  localStorage.clear();
  useFortuneStore.setState({ birthDate: "", birthTime: "", gender: "none", partnerBirthDate: "", partnerBirthTime: "" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FortuneToolHero", () => {
  it.each(FORTUNE_TAB_ORDER)(" %s 도구 첫 장면에 제목·말풍선·한 줄 설명·CTA가 도구별로 렌더링된다", (tab: FortuneTab) => {
    render(<FortuneToolHero tab={tab} />);
    const meta = FORTUNE_TAB_META[tab];
    expect(screen.getByRole("heading", { name: `루나 · ${meta.labelKo}` })).not.toBeNull();
    expect(screen.getByText(meta.heroEn)).not.toBeNull();
    expect(screen.getByText(FORTUNE_TOOL_HERO[tab].bubble)).not.toBeNull();
    expect(screen.getByText(meta.taglineKo)).not.toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(FORTUNE_TOOL_HERO[tab].ctaLabel) })).not.toBeNull();
  });

  it("사주 비주얼은 오행 다섯 원소를 모두 보여준다", () => {
    render(<FortuneToolHero tab="saju" />);
    for (const label of ["목(木)", "화(火)", "토(土)", "금(金)", "수(水)"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
  });

  it("별자리 비주얼은 12별자리를 모두 보여준다", () => {
    render(<FortuneToolHero tab="zodiac" />);
    for (const name of ["양", "황소", "쌍둥이", "게", "사자", "처녀", "천칭", "전갈", "사수", "염소", "물병", "물고기"]) {
      expect(screen.getByText(name)).not.toBeNull();
    }
  });

  it("타로 비주얼은 오늘의 카드 한 장을 보여준다", () => {
    render(<FortuneToolHero tab="tarot" />);
    const [card] = drawFortuneTodayCards(fortuneKstDate(), 1);
    expect(screen.getByText(`오늘의 카드 — ${card.name}`)).not.toBeNull();
    expect(screen.getByText(card.nameEn)).not.toBeNull();
  });

  it("연간 비주얼은 열두 달을 보여주고 올해 이번 달을 강조한다", () => {
    render(<FortuneToolHero tab="yearly" />);
    for (let month = 1; month <= 12; month += 1) {
      expect(screen.getByText(`${month}월`)).not.toBeNull();
    }
  });

  it("생년월일이 필요한 도구에는 로컬 전용 고지가, 아닌 도구에는 없다", () => {
    render(<FortuneToolHero tab="monthly" />);
    expect(screen.getByText(/이 기기에만 저장돼요/)).not.toBeNull();
    cleanup();
    render(<FortuneToolHero tab="tarot" />);
    expect(screen.queryByText(/이 기기에만 저장돼요/)).toBeNull();
  });

  it("저장된 생년월일이 있으면 시작 상태 칩을 보여준다", () => {
    useFortuneStore.setState({ birthDate: "1995-04-12" });
    render(<FortuneToolHero tab="saju" />);
    expect(screen.getByText(/저장된 생년월일이 있어요/)).not.toBeNull();
  });

  it("궁합은 두 사람 모두 저장됐을 때만 완결 칩을 보여준다", () => {
    useFortuneStore.setState({ birthDate: "1995-04-12" });
    const { unmount } = render(<FortuneToolHero tab="compatibility" />);
    expect(screen.getByText(/상대의 생년월일은 캐릭터를 고른 뒤 입력해요/)).not.toBeNull();
    unmount();
    useFortuneStore.setState({ partnerBirthDate: "1997-09-03" });
    render(<FortuneToolHero tab="compatibility" />);
    expect(screen.getByText(/두 사람의 생년월일이 저장돼 있어요/)).not.toBeNull();
  });

  it("관측소 연결: 도구 하위 경로에서는 본문 위에 도구 히어로가 먼저 온다", () => {
    render(
      <MemoryRouter initialEntries={["/fortune/saju"]}>
        <FortuneObservatory characterContent={<div>캐릭터 본문</div>} forceCharacter />
      </MemoryRouter>,
    );
    const heading = screen.getByRole("heading", { name: "루나 · 사주팔자" });
    const body = screen.getByText("캐릭터 본문");
    expect(heading.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("관측소 연결: 착지에서 캐릭터 운세를 열면 도구 히어로가 붙지 않는다", () => {
    render(
      <MemoryRouter initialEntries={["/fortune?content=character"]}>
        <FortuneObservatory characterContent={<div>캐릭터 본문</div>} />
      </MemoryRouter>,
    );
    expect(screen.getByText("캐릭터 본문")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /루나 · / })).toBeNull();
  });

  it("CTA를 누르면 다음 영역(캐릭터 선택)으로 스크롤한다", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
    render(
      <div>
        <FortuneToolHero tab="today" />
        <div data-testid="tool-body">캐릭터 선택 영역</div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /캐릭터 고르고 오늘 운세 보기/ }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("tool-body"));
  });
});
