// @vitest-environment jsdom

import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FortunePage } from "./FortunePage";
import { useFortuneStore } from "./fortune-store";

// 운세 도구 라우트(/fortune/monthly·/fortune/yearly) 전체 흐름 회귀 테스트 (F-B10-2).
// 캐릭터 선택 → 생년월일 게이트 입력 → 결과 패널(FortunePeriodPanel) 렌더까지를 고정한다.
// 게이트는 입력 즉시 해제되지만, 패널이 결과 컨테이너(fortuneResult) 안에 갇혀 있으면
// 월간/연간은 결과를 채우는 제출 경로가 없어 빈 패널이 영구히 지속됐다.

// 관측소 셸은 이 흐름과 무관하다 — 캐릭터 콘텐츠를 그대로 통과시키는 래퍼로 대체한다.
vi.mock("./FortuneObservatory", () => ({
  FortuneObservatory: ({ characterContent }: { characterContent?: React.ReactNode }) => <div>{characterContent}</div>,
}));

// 기간 흐름과 무관한 무거운 표면(공유 모달·웹툰 스트립·타로·글로벌 운세·모션·재생)은
// 테스트 더블로 대체한다. 검증 대상인 FortunePage 상태 전이·FortuneBirthGate·
// FortunePeriodPanel·fortune-store·@toonstudio/core 계산은 전부 실물을 쓴다.
vi.mock("motion/react", async () => {
  const React = await import("react");
  const stripMotionProps = (props: Record<string, unknown>) => {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      whileInView: _whileInView,
      viewport: _viewport,
      layout: _layout,
      layoutId: _layoutId,
      ...rest
    } = props;
    return rest;
  };
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        function MotionStub(props: Record<string, unknown> & { children?: React.ReactNode }) {
          return React.createElement(tag, stripMotionProps(props), props.children);
        },
    }
  );
  return {
    motion,
    MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/platform/api", () => ({
  apiFetch: () => Promise.reject(new Error("테스트 환경 — API 없음")),
}));
vi.mock("@/shared/catalog/catalog-static", () => ({
  resolveAssetUrl: (url: string) => url,
}));
vi.mock("@/shared/components/title-card", () => ({
  TitleCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./fortune-fx", () => ({
  CountUp: ({ value }: { value: number }) => <span>{value}</span>,
  ConfettiBurst: () => null,
}));
vi.mock("./FortuneShareModal", () => ({ FortuneShareModal: () => null }));
vi.mock("./WebtoonStrip", () => ({ WebtoonStrip: () => null }));
vi.mock("./TarotCardFace", () => ({ TarotCardFace: () => null }));
vi.mock("./FortuneGlobalHoroscope", () => ({ FortuneGlobalHoroscope: () => null }));
vi.mock("./TarotSpreadPicker", () => ({ TarotSpreadPicker: () => null }));
vi.mock("./FortuneLoading", () => ({ FortuneLoading: () => null }));
vi.mock("./useFortunePlayback", () => ({
  useFortunePlayback: () => ({
    status: "idle",
    supported: false,
    steps: [],
    activeStep: 0,
    play: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    stop: () => undefined,
    next: () => undefined,
    prev: () => undefined,
  }),
}));

// 리빌 연출·음성 합성은 이 테스트 범위 밖 — 패널 본문만 검증한다.
vi.mock("./FortuneReveal", () => ({
  FortuneReveal: ({ score, label, children }: { score: number; label: string; children: React.ReactNode }) => (
    <div data-testid="fortune-reveal" data-score={score} aria-label={label}>
      {children}
    </div>
  ),
}));
vi.mock("./FortuneVoiceNarration", () => ({
  FortuneVoiceNarration: () => null,
}));

function renderFortuneTool(tool: "monthly" | "yearly") {
  return render(
    <MemoryRouter initialEntries={[`/fortune/${tool}`]}>
      <FortunePage tool={tool} />
    </MemoryRouter>
  );
}

function selectFirstCharacter() {
  const cta = screen.getAllByText(/선택하기/)[0];
  const button = cta.closest("button");
  if (!button) throw new Error("캐릭터 선택 버튼을 찾지 못했어요");
  fireEvent.click(button);
}

function resetFortuneStore() {
  useFortuneStore.setState({
    lastCharacterId: null,
    birthDate: "",
    birthTime: "",
    gender: "none",
    partnerBirthDate: "",
    partnerBirthTime: "",
    viewedDates: [],
    history: [],
    bonusDates: [],
  });
}

beforeEach(() => {
  localStorage.clear();
  resetFortuneStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FortunePage 월간/연간 기간 패널 (F-B10-2)", () => {
  it("월간: 캐릭터 선택 후 게이트에 생년월일을 입력하면 결과 패널이 렌더된다", () => {
    renderFortuneTool("monthly");
    selectFirstCharacter();

    // 게이트가 먼저 보인다
    expect(screen.getByText("이번 달의 흐름을 읽어드릴게요")).toBeTruthy();
    const dateInput = document.querySelector('input[type="date"]');
    if (!dateInput) throw new Error("게이트 생년월일 입력란을 찾지 못했어요");

    fireEvent.change(dateInput, { target: { value: "1990-06-15" } });

    // 게이트가 사라지고 기간 결과 패널이 마운트돼야 한다
    expect(screen.queryByText("이번 달의 흐름을 읽어드릴게요")).toBeNull();
    const reveal = screen.getByTestId("fortune-reveal");
    expect(reveal.getAttribute("aria-label")).toContain("이달의 운세 지수");
    expect(screen.getByText(/애정운/)).toBeTruthy();
    expect(screen.getByText(/금전운/)).toBeTruthy();
  });

  it("연간: 캐릭터 선택 후 게이트에 생년월일을 입력하면 결과 패널이 렌더된다", () => {
    renderFortuneTool("yearly");
    selectFirstCharacter();

    expect(screen.getByText("올해의 큰 흐름을 보여드릴게요")).toBeTruthy();
    const dateInput = document.querySelector('input[type="date"]');
    if (!dateInput) throw new Error("게이트 생년월일 입력란을 찾지 못했어요");

    fireEvent.change(dateInput, { target: { value: "1990-06-15" } });

    expect(screen.queryByText("올해의 큰 흐름을 보여드릴게요")).toBeNull();
    const reveal = screen.getByTestId("fortune-reveal");
    expect(reveal.getAttribute("aria-label")).toContain("올해의 운세 지수");
    expect(screen.getByText(/월별 흐름/)).toBeTruthy();
    expect(screen.getByText(/최고의 달/)).toBeTruthy();
  });

  it("월간: 게이트에 입력한 생년월일은 이 기기에만 저장돼 재방문 시 패널이 바로 열린다", () => {
    const first = renderFortuneTool("monthly");
    selectFirstCharacter();
    const dateInput = document.querySelector('input[type="date"]');
    if (!dateInput) throw new Error("게이트 생년월일 입력란을 찾지 못했어요");
    fireEvent.change(dateInput, { target: { value: "1990-06-15" } });

    // 로컬 프로필 정책: 서버가 아니라 이 기기 localStorage에만 남는다
    expect(useFortuneStore.getState().birthDate).toBe("1990-06-15");
    expect(localStorage.getItem("toonstudio-fortune")).toContain("1990-06-15");
    first.unmount();

    // 재방문(리로드 상당): 캐릭터만 고르면 재입력 없이 패널이 열린다
    renderFortuneTool("monthly");
    selectFirstCharacter();
    expect(screen.queryByText("이번 달의 흐름을 읽어드릴게요")).toBeNull();
    expect(screen.getByTestId("fortune-reveal").getAttribute("aria-label")).toContain("이달의 운세 지수");
  });
});
