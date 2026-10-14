// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneQuickToday } from "./FortuneQuickToday";
import { buildQuickTodayFortune } from "./fortune-quick-today";

describe("FortuneQuickToday", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("진입 직후 로딩 스켈레톤을 먼저 보여준다", () => {
    render(<FortuneQuickToday date="2026-10-14" />);
    expect(screen.getByText(/오늘의 운세를 불러오는 중이에요/)).toBeTruthy();
  });

  it("캐릭터 선택 없이 날짜만으로 오늘의 운세 1단계 결과를 보여준다", async () => {
    const expected = buildQuickTodayFortune("2026-10-14");
    render(<FortuneQuickToday date="2026-10-14" />);
    await waitFor(() => {
      expect(screen.getByText(expected.headline)).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: /오늘의 운세/ })).toBeTruthy();
    expect(screen.getByText(String(expected.score))).toBeTruthy();
    expect(screen.getByText(expected.color)).toBeTruthy();
    expect(screen.getByText(expected.direction)).toBeTruthy();
    expect(screen.getByText(expected.time)).toBeTruthy();
    expect(screen.getByText(String(expected.luckyNumber))).toBeTruthy();
    if (expected.card) expect(screen.getByText(expected.card.name)).toBeTruthy();
    // 1단계가 공통 결과임을 밝히고 2단계로 이어짐을 안내한다.
    expect(screen.getByText(/날짜만으로 보는 모두의 오늘 기운/)).toBeTruthy();
  });

  it("계속 버튼을 누르면 캐릭터 단계로 이어지는 핸들러가 1회 호출된다", async () => {
    const onContinue = vi.fn();
    render(<FortuneQuickToday date="2026-10-14" onContinue={onContinue} />);
    const button = await screen.findByRole("button", { name: /캐릭터를 골라 내 운세 더 자세히 보기/ });
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("계속 핸들러가 없으면 계속 버튼을 렌더하지 않는다", async () => {
    render(<FortuneQuickToday date="2026-10-14" />);
    await waitFor(() => {
      expect(screen.getByTestId("fortune-quick-today")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /캐릭터를 골라/ })).toBeNull();
  });

  it("산출이 실패하면 에러와 재시도를 보여주고, 재시도하면 결과를 보여준다", async () => {
    let calls = 0;
    const compute = vi.fn((date: string) => {
      calls += 1;
      if (calls === 1) throw new Error("일시적인 산출 실패");
      return buildQuickTodayFortune(date);
    });
    render(<FortuneQuickToday date="2026-10-14" compute={compute} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/일시적인 산출 실패/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("산출 결과가 없으면 빈 상태를 보여준다", async () => {
    const compute = vi.fn(() => null);
    render(<FortuneQuickToday date="2026-10-14" compute={compute} />);
    await waitFor(() => {
      expect(screen.getByText(/아직 준비된 운세가 없어요/)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeTruthy();
  });

  it("날짜 형식이 잘못되면 실제 산출 경로에서도 에러 상태가 된다", async () => {
    render(<FortuneQuickToday date="2026/10/14" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/YYYY-MM-DD/)).toBeTruthy();
  });
});
