// @vitest-environment jsdom

import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("html-to-image", () => ({ toPng: vi.fn().mockResolvedValue("data:image/png;base64,AAA") }));
vi.mock("./FortuneShareCard", async () => {
  const React = await import("react");
  return {
    FortuneShareCard: React.forwardRef<HTMLDivElement>(function MockShareCard(_props, ref) {
      return <div ref={ref} data-testid="fortune-share-card" />;
    }),
  };
});
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

function renderFortuneTool(tool: "today" | "monthly" | "yearly" | "saju") {
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

describe("FortunePage / FortuneShareModal 접근성 회귀 (GAP-R4-02)", () => {
  it("운세 tablist는 화살표 키·Home·End 이동과 role=tabpanel 연결 및 선택 상태를 유지한다", () => {
    renderFortuneTool("today");
    selectFirstCharacter();

    const tablist = screen.getByRole("tablist", { name: "운세 종류" });
    expect(tablist).toBeTruthy();

    const todayTab = screen.getByRole("tab", { name: "오늘의 운세" });
    const monthlyTab = screen.getByRole("tab", { name: "월간 운세" });
    const tarotTab = screen.getByRole("tab", { name: "타로 리딩" });

    expect(todayTab.getAttribute("aria-selected")).toBe("true");
    expect(todayTab.getAttribute("tabindex")).toBe("0");
    expect(todayTab.getAttribute("aria-controls")).toBe("fortune-tabpanel-today");
    expect(monthlyTab.getAttribute("aria-selected")).toBe("false");
    expect(monthlyTab.getAttribute("tabindex")).toBe("-1");

    const tabpanel = screen.getByRole("tabpanel");
    expect(tabpanel.getAttribute("id")).toBe("fortune-tabpanel-today");
    expect(tabpanel.getAttribute("aria-labelledby")).toBe("fortune-tab-today");

    todayTab.focus();
    fireEvent.keyDown(todayTab, { key: "ArrowRight" });
    expect(monthlyTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(monthlyTab);
    expect(screen.getByRole("tabpanel").getAttribute("id")).toBe("fortune-tabpanel-monthly");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("fortune-tab-monthly");

    fireEvent.keyDown(monthlyTab, { key: "End" });
    expect(tarotTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tarotTab);
    expect(screen.getByRole("tabpanel").getAttribute("id")).toBe("fortune-tabpanel-tarot");

    fireEvent.keyDown(tarotTab, { key: "ArrowRight" });
    expect(todayTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(todayTab);

    fireEvent.keyDown(todayTab, { key: "ArrowLeft" });
    expect(tarotTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tarotTab);

    fireEvent.keyDown(tarotTab, { key: "Home" });
    expect(todayTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(todayTab);
  });

  it("사주 성별 토글은 role=group과 aria-pressed 상태를 제공한다", () => {
    renderFortuneTool("saju");
    selectFirstCharacter();

    const group = screen.getByRole("group", { name: /성별/ });
    expect(group).toBeTruthy();

    const noneBtn = screen.getByRole("button", { name: "선택 안 함" });
    const maleBtn = screen.getByRole("button", { name: "남성" });
    const femaleBtn = screen.getByRole("button", { name: "여성" });

    expect(noneBtn.getAttribute("aria-pressed")).toBe("true");
    expect(maleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(femaleBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(femaleBtn);
    expect(noneBtn.getAttribute("aria-pressed")).toBe("false");
    expect(maleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(femaleBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(maleBtn);
    expect(noneBtn.getAttribute("aria-pressed")).toBe("false");
    expect(maleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(femaleBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("공유 모달은 열릴 때 초기 초점을 이동하고 Tab/Shift+Tab 순환과 Escape 닫기 후 트리거 복귀를 수행한다", async () => {
    renderFortuneTool("today");
    selectFirstCharacter();

    const drawBtn = screen.getByRole("button", { name: /오늘의 운세 확인하기/ });
    fireEvent.click(drawBtn);

    const shareTrigger = await waitFor(() => screen.getByRole("button", { name: /공유·저장/ }));
    shareTrigger.focus();
    expect(document.activeElement).toBe(shareTrigger);

    fireEvent.click(shareTrigger);

    const dialog = screen.getByRole("dialog", { name: "운세 결과 공유" });
    expect(dialog).toBeTruthy();

    const closeBtn = screen.getByRole("button", { name: "닫기" });
    const copyLinkBtn = screen.getByRole("button", { name: /링크 복사/ });
    expect(document.activeElement).toBe(closeBtn);

    // 첫 요소에서 Shift+Tab 시 마지막 포커스 가능 요소로 순환
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(copyLinkBtn);

    // 마지막 요소에서 Tab 시 첫 포커스 가능 요소로 순환
    fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);

    // Escape 입력 시 모달이 닫히고 트리거 버튼으로 포커스 복귀
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "운세 결과 공유" })).toBeNull();
    expect(document.activeElement).toBe(shareTrigger);
  });
});
