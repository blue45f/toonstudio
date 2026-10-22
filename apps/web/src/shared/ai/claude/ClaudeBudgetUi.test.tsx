// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { getClaudeBudget, resetClaudeBudgetForTests, setClaudeBudgetLimit } from "./claude-budget";
import { recordClaudeUsage, resetClaudeUsage } from "./claude-usage-meter";
import { ClaudeBudgetEditor } from "./ClaudeBudgetEditor";
import { ClaudeBudgetMeter } from "./ClaudeBudgetMeter";
import { ClaudeConnectionSteps, ANTHROPIC_KEYS_URL } from "./ClaudeConnectionSteps";
import { ClaudePreflight } from "./ClaudePreflight";
import { useClaudeBudgetGuard } from "./use-claude-budget-guard";

const INITIAL_LANGUAGE = useI18n.getState().lang;

describe("Claude 예산·실행 전 확인 UI", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    resetClaudeBudgetForTests();
    resetClaudeUsage();
  });

  afterEach(() => {
    cleanup();
    resetClaudeBudgetForTests();
    resetClaudeUsage();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  describe("ClaudeBudgetMeter", () => {
    it("한도가 없으면 사용량과 한도 없음 안내만 보여 준다", () => {
      recordClaudeUsage("claude-opus-5-5", { input_tokens: 1_000, output_tokens: 500 });
      render(<ClaudeBudgetMeter />);

      expect(screen.getByText(/이번 세션 추정 \$0\.01 · 요청 1회/)).toBeTruthy();
      expect(screen.getByText("예산 한도를 정하지 않았어요.")).toBeTruthy();
      expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("한도가 있으면 막대와 문장으로 진행률을 알리고 80%부터 경고색을 쓴다", () => {
      setClaudeBudgetLimit(0.01);
      recordClaudeUsage("claude-opus-5-5", { input_tokens: 1_000, output_tokens: 250 }); // $0.009
      render(<ClaudeBudgetMeter />);

      const bar = screen.getByRole("progressbar", { name: "세션 예산" });
      expect(bar.getAttribute("aria-valuenow")).toBe("90");
      expect(bar.getAttribute("aria-valuetext")).toBe("예산 $0.01 중 90% 사용 · 추정 $0.0090");
      expect(screen.getByText("예산 $0.01 중 90% 사용 · 추정 $0.0090").className).toContain("text-warn");
    });

    it("showUsage를 끄면 사용량 줄을 그리지 않는다", () => {
      recordClaudeUsage("claude-opus-5-5", { input_tokens: 10, output_tokens: 10 });
      render(<ClaudeBudgetMeter showUsage={false} />);
      expect(screen.queryByText(/이번 세션 추정/)).toBeNull();
    });
  });

  describe("ClaudeBudgetEditor", () => {
    it("정상 금액을 저장하면 한도가 바뀌고 안내한다", () => {
      render(<ClaudeBudgetEditor />);

      fireEvent.change(screen.getByLabelText("예산 한도 (USD)"), { target: { value: "2.5" } });
      fireEvent.click(screen.getByRole("button", { name: "한도 저장" }));

      expect(getClaudeBudget().limitUsd).toBe(2.5);
      expect(screen.getByRole("status").textContent).toBe("예산 한도를 $2.50로 저장했어요.");
    });

    it("비었거나 범위를 벗어난 금액은 저장하지 않고 이유를 알린다", () => {
      render(<ClaudeBudgetEditor />);
      const input = screen.getByLabelText("예산 한도 (USD)");

      for (const value of ["", "0", "-2", "1000.5", "abc"]) {
        fireEvent.change(input, { target: { value } });
        fireEvent.click(screen.getByRole("button", { name: "한도 저장" }));
        expect(screen.getByRole("alert").textContent).toBe("0.01에서 1000 사이의 금액을 입력해 주세요.");
      }
      expect(getClaudeBudget().limitUsd).toBeNull();
    });

    it("한도 없애기는 한도를 지우고 입력칸을 비운다", () => {
      setClaudeBudgetLimit(3);
      render(<ClaudeBudgetEditor />);
      expect((screen.getByLabelText("예산 한도 (USD)") as HTMLInputElement).value).toBe("3");

      fireEvent.click(screen.getByRole("button", { name: "한도 없애기" }));

      expect(getClaudeBudget().limitUsd).toBeNull();
      expect((screen.getByLabelText("예산 한도 (USD)") as HTMLInputElement).value).toBe("");
      expect(screen.getByRole("status").textContent).toBe("예산 한도를 없앴어요.");
    });
  });

  describe("useClaudeBudgetGuard", () => {
    it("한도가 없으면 언제나 보낼 수 있다", () => {
      const { result } = renderHook(() => useClaudeBudgetGuard(5));
      expect(result.current.verdict.kind).toBe("no-limit");
      expect(result.current.allowed).toBe(true);
    });

    it("넘을 수 있으면 확인하기 전까지 보낼 수 없고, 한 번 진행하면 동의가 거두어진다", () => {
      setClaudeBudgetLimit(0.1);
      const { result } = renderHook(() => useClaudeBudgetGuard(0.17));
      expect(result.current.verdict).toMatchObject({ kind: "exceeds", remainingUsd: 0.1 });
      expect(result.current.allowed).toBe(false);

      act(() => result.current.setOverridden(true));
      expect(result.current.allowed).toBe(true);

      act(() => result.current.consumeOverride());
      expect(result.current.allowed).toBe(false);
    });

    it("단가를 모르는 모델은 한도가 있을 때만 확인을 요구한다", () => {
      const { result, rerender } = renderHook(() => useClaudeBudgetGuard(null));
      expect(result.current.allowed).toBe(true);

      act(() => { setClaudeBudgetLimit(1); });
      rerender();
      expect(result.current.verdict.kind).toBe("unknown-cost");
      expect(result.current.allowed).toBe(false);
    });

    it("이번 세션에 이미 쓴 추정 비용을 반영한다", () => {
      setClaudeBudgetLimit(0.2);
      const { result } = renderHook(() => useClaudeBudgetGuard(0.1));
      expect(result.current.allowed).toBe(true);

      // $0.108 → 센트로 올려 11¢를 이미 썼고, 남은 9¢보다 이번 요청 상한(10¢)이 크다.
      act(() => { recordClaudeUsage("claude-opus-5-5", { input_tokens: 2_000, output_tokens: 5_000 }); });
      expect(result.current.verdict).toMatchObject({ kind: "exceeds", remainingUsd: 0.09 });
      expect(result.current.allowed).toBe(false);
    });
  });

  describe("ClaudePreflight", () => {
    function Harness({ cap, model = "claude-opus-5-5" }: { cap: number | null; model?: string }) {
      const guard = useClaudeBudgetGuard(cap);
      return (
        <ClaudePreflight
          model={model}
          capUsd={cap}
          guard={guard}
          rows={[
            { label: "외부 전송", value: "이미지 1장(800×1000px)" },
            { label: "예상 시간", value: "보통 10~40초" },
          ]}
        />
      );
    }

    it("접힌 요약에 모델과 비용 상한을 항상 보여 주고, 펼치면 모든 줄이 있다", () => {
      render(<Harness cap={0.17} />);

      const summary = screen.getByText("실행 전 확인").closest("summary") as HTMLElement;
      expect(within(summary).getByText("Claude Opus 5.5")).toBeTruthy();
      expect(within(summary).getByText("최대 약 $0.17")).toBeTruthy();
      for (const label of ["처리 경로", "외부 전송", "예상 시간", "비용", "문제가 생기면"]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
      expect(screen.getByText("자동으로 다시 보내거나 모델을 바꾸지 않아요. 문제가 생기면 이유를 알려 드리고, 다시 시도할지는 직접 정해 주세요.")).toBeTruthy();
      expect(screen.getByText(/이 브라우저 → Anthropic/)).toBeTruthy();
      expect(screen.getByText(/100만 토큰당 입력 \$4 · 출력 \$20/)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("단가를 모르는 모델이면 가격을 모른다고 말하고 숫자를 지어내지 않는다", () => {
      render(<Harness cap={null} model="claude-future-9" />);

      expect(screen.getByText("가격을 몰라요")).toBeTruthy();
      expect(screen.getByText(/이 모델의 단가를 몰라 미리 추정할 수 없어요/)).toBeTruthy();
      expect(screen.getByText("claude-future-9")).toBeTruthy();
    });

    it("예산을 넘을 수 있으면 경고하고 한 번만 진행하는 확인을 받는다", () => {
      setClaudeBudgetLimit(0.1);
      render(<Harness cap={0.17} />);

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("세션 예산 $0.10 중 $0.10만 남았어요. 이 요청은 최대 $0.17까지 들 수 있어 예산을 넘을 수 있어요.");
      const check = screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요") as HTMLInputElement;
      expect(check.checked).toBe(false);
      fireEvent.click(check);
      expect(check.checked).toBe(true);
    });

    it("한도 안이면 경고를 그리지 않는다", () => {
      setClaudeBudgetLimit(5);
      render(<Harness cap={0.17} />);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("ClaudeConnectionSteps", () => {
    it("키 만드는 곳을 새 탭으로 안전하게 열고 확인이 무료임을 연결 전에 알린다", () => {
      render(<ClaudeConnectionSteps />);

      const link = screen.getByRole("link", { name: /키 만들러 가기/ });
      expect(link.getAttribute("href")).toBe(ANTHROPIC_KEYS_URL);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(screen.getByText("키 확인은 무료예요. 요금은 AI 보조를 실제로 실행할 때만 생겨요.")).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });
  });
});
