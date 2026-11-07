// @vitest-environment jsdom

import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacters } from "@toonstudio/core/fortune";
import { FortuneCharacterPickerSection } from "./FortuneCharacterPickerSection";
import { FortuneCharacterSidebar } from "./FortuneCharacterSidebar";
import { FortunePage } from "./FortunePage";
import { FortuneResultPanel } from "./FortuneResultPanel";
import { FortuneToolInputForms } from "./FortuneToolInputForms";
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

describe("FortunePage 화면별 표현 컴포넌트 분리 경계 (Round 6)", () => {
  const identityTx = (s: string) => s;
  const sampleChar = getCharacters()[0];

  it("FortuneCharacterPickerSection: 캐릭터 그리드·히스토리·에러 배너를 독립 렌더링하고 선택/삭제 콜백을 전달한다", () => {
    const onSelect = vi.fn();
    const onRemoveFromHistory = vi.fn();
    const onRetryLoad = vi.fn();
    const { rerender } = render(
      <FortuneCharacterPickerSection
        characters={[sampleChar]}
        charLoadFailed={false}
        history={[
          {
            id: "hist-1",
            tab: "today",
            characterId: sampleChar.id,
            characterName: sampleChar.name,
            characterAvatar: sampleChar.avatarUrl,
            dateLabel: "11월 7일",
            summary: "행운 가득한 하루",
            result: {
              interpretation: "해석 본문",
              recommendations: [],
            },
          },
        ]}
        onContinueQuickToday={() => undefined}
        onRestoreFortune={() => undefined}
        onClearHistory={() => undefined}
        onRemoveFromHistory={onRemoveFromHistory}
        onRetryLoadCharacters={onRetryLoad}
        onSelectCharacter={onSelect}
        tx={identityTx}
      />
    );

    expect(document.getElementById("fortune-character-picker")?.textContent).toContain(
      "당신의 운세를 해석해줄 캐릭터 에이전트를 고르세요"
    );
    expect(screen.getByText("행운 가득한 하루")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "이 운세 기록 삭제" }));
    expect(onRemoveFromHistory).toHaveBeenCalledWith("hist-1");

    const charButtons = screen.getAllByRole("button");
    const selectCharBtn = charButtons.find((btn) => btn.textContent?.includes("선택하기"));
    if (!selectCharBtn) throw new Error("캐릭터 카드 버튼을 찾지 못했어요");
    fireEvent.click(selectCharBtn);
    expect(onSelect).toHaveBeenCalledWith(sampleChar);

    rerender(
      <FortuneCharacterPickerSection
        characters={[]}
        charLoadFailed={true}
        history={[]}
        onContinueQuickToday={() => undefined}
        onRestoreFortune={() => undefined}
        onClearHistory={() => undefined}
        onRemoveFromHistory={onRemoveFromHistory}
        onRetryLoadCharacters={onRetryLoad}
        onSelectCharacter={onSelect}
        tx={identityTx}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("캐릭터를 불러오지 못했어요");
  });

  it("FortuneCharacterSidebar: 선택된 캐릭터 프로필·연속 출석 배지·음성 상태·캐릭터 변경 액션을 독립 렌더링한다", () => {
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    render(
      <FortuneCharacterSidebar
        selectedChar={sampleChar}
        streak={3}
        hasPanels={true}
        playback={{
          supported: true,
          status: "playing",
          activeStep: 1,
          steps: [
            { panel: 0, line: 0, text: "1컷", characterId: null },
            { panel: 1, line: 0, text: "2컷", characterId: null },
          ],
        }}
        onTogglePlay={onTogglePlay}
        onResetCharacter={onReset}
        tx={identityTx}
      />
    );

    expect(screen.getByText(sampleChar.name)).toBeTruthy();
    expect(screen.getByText(/3일 연속 출석/)).toBeTruthy();
    expect(screen.getByText(/2 \/ 2 컷 상영 중/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /다른 캐릭터 선택/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("FortuneToolInputForms: 사주 성별 토글 그룹과 처방전 사연 입력 폼을 독립 렌더링한다", () => {
    const onGenderChange = vi.fn();
    const onPrescriptionQueryChange = vi.fn();
    const noop = () => undefined;

    const { rerender } = render(
      <FortuneToolInputForms
        activeTab="saju"
        selectedChar={sampleChar}
        birthDate="1995-03-21"
        birthTime="09:30"
        gender="female"
        onBirthDateChange={noop}
        onBirthTimeChange={noop}
        onGenderChange={onGenderChange}
        hasSavedBirthProfile={true}
        onClearBirthProfile={noop}
        partnerBirthDate=""
        partnerBirthTime=""
        onPartnerBirthDateChange={noop}
        onPartnerBirthTimeChange={noop}
        prescriptionQuery=""
        onPrescriptionQueryChange={onPrescriptionQueryChange}
        tarotStep="idle"
        tarotSpread="one"
        onTarotSpreadChange={noop}
        onStartTarotShuffle={noop}
        onSelectTarotCard={noop}
        onAnalyzeToday={noop}
        onAnalyzeZodiac={noop}
        onAnalyzePrescription={noop}
        onAnalyzeCompatibility={noop}
        onAnalyzeSaju={noop}
        onNavigateObservatorySaju={noop}
        tx={identityTx}
      />
    );

    const group = screen.getByRole("group", { name: /성별/ });
    expect(group).toBeTruthy();
    expect(screen.getByRole("button", { name: "여성" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "남성" }));
    expect(onGenderChange).toHaveBeenCalledWith("male");

    rerender(
      <FortuneToolInputForms
        activeTab="prescription"
        selectedChar={sampleChar}
        birthDate=""
        birthTime=""
        gender="none"
        onBirthDateChange={noop}
        onBirthTimeChange={noop}
        onGenderChange={onGenderChange}
        hasSavedBirthProfile={false}
        onClearBirthProfile={noop}
        partnerBirthDate=""
        partnerBirthTime=""
        onPartnerBirthDateChange={noop}
        onPartnerBirthTimeChange={noop}
        prescriptionQuery=""
        onPrescriptionQueryChange={onPrescriptionQueryChange}
        tarotStep="idle"
        tarotSpread="one"
        onTarotSpreadChange={noop}
        onStartTarotShuffle={noop}
        onSelectTarotCard={noop}
        onAnalyzeToday={noop}
        onAnalyzeZodiac={noop}
        onAnalyzePrescription={noop}
        onAnalyzeCompatibility={noop}
        onAnalyzeSaju={noop}
        onNavigateObservatorySaju={noop}
        tx={identityTx}
      />
    );

    const textarea = document.getElementById("prescription-query");
    if (!textarea) throw new Error("처방전 입력란을 찾지 못했어요");
    fireEvent.change(textarea, { target: { value: "퇴근 후 위로가 필요해요" } });
    expect(onPrescriptionQueryChange).toHaveBeenCalledWith("퇴근 후 위로가 필요해요");
  });

  it("FortuneResultPanel: 결과 헤더 ref·공유/다시뽑기 액션 및 처방전 결과를 독립 렌더링한다", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const shareRef = createRef<HTMLButtonElement>();
    const onOpenShare = vi.fn();
    const onReset = vi.fn();

    render(
      <MemoryRouter>
        <FortuneResultPanel
          activeTab="prescription"
          selectedChar={sampleChar}
          characters={[sampleChar]}
          fortuneResult={{
            interpretation: "마음을 다독이는 메인 처방",
            query: "불안과 조급함",
            recommendations: [],
          }}
          playback={{
            status: "idle",
            supported: false,
            steps: [],
            activeStep: 0,
            activePanel: 0,
            typed: 0,
            speed: 1,
            setSpeed: () => undefined,
            play: () => undefined,
            pause: () => undefined,
            resume: () => undefined,
            stop: () => undefined,
            next: () => undefined,
            prev: () => undefined,
          }}
          onTogglePlay={() => undefined}
          onOpenShare={onOpenShare}
          onReset={onReset}
          resultHeadingRef={headingRef}
          shareTriggerRef={shareRef}
          tx={identityTx}
        />
      </MemoryRouter>
    );

    expect(headingRef.current?.textContent).toContain("READING PRESCRIPTION");
    expect(screen.getByText(/불안과 조급함/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /공유·저장/ }));
    expect(onOpenShare).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /다시 보기/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

