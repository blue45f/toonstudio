// @vitest-environment jsdom
/**
 * 리서치 데스크 한글 검색 공용 훅·안내 UI 계약 테스트.
 * - 영문 입력: 안내 없음, 검색어 그대로 (회귀 금지)
 * - 한글 입력: 사전 변환을 투명하게 표시하고 실제 검색어로 쓴다
 * - 변환어 직접 수정·되돌리기
 * - 모델 층은 목 로더로만 검증한다 (실모델 로드는 CI에서 돌리지 않는다)
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranslatedQueryNotice } from "./TranslatedQueryNotice";
import { useTranslatedResearchQuery } from "./use-translated-research-query";

import type { ResearchQueryTranslator } from "./research-query-translation";

function Harness({
  input,
  loadTranslator,
}: {
  input: string;
  loadTranslator?: () => Promise<ResearchQueryTranslator | null>;
}) {
  const state = useTranslatedResearchQuery(input, { loadTranslator });
  return (
    <div>
      <output data-testid="effective">{state.effectiveQuery}</output>
      <TranslatedQueryNotice state={state} />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useTranslatedResearchQuery + TranslatedQueryNotice", () => {
  it("영문 입력에서는 안내를 그리지 않고 검색어를 그대로 쓴다", () => {
    render(<Harness input="forest cabin" />);
    expect(screen.getByTestId("effective").textContent).toBe("forest cabin");
    expect(screen.queryByText(/검색 중입니다/)).toBeNull();
    expect(screen.queryByLabelText("실제로 검색할 영문 검색어")).toBeNull();
  });

  it("한글 입력은 사전 변환어를 투명하게 표시하고 그 검색어로 검색한다", () => {
    render(<Harness input="숲속 오두막" />);
    expect(screen.getByTestId("effective").textContent).toBe("forest cabin");
    expect(screen.getByText(/‘숲속 오두막’ →/)).toBeTruthy();
    expect(screen.getByText(/내장 용어 사전/)).toBeTruthy();
  });

  it("변환어를 직접 고치면 그 값이 우선하고, 되돌리면 자동 변환으로 돌아간다", () => {
    render(<Harness input="숲속 오두막" />);
    const field = screen.getByLabelText("실제로 검색할 영문 검색어") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "dark forest hut" } });
    fireEvent.click(screen.getByRole("button", { name: "이 검색어로 다시 검색" }));
    expect(screen.getByTestId("effective").textContent).toBe("dark forest hut");
    expect(screen.getByText(/직접 고친 검색어입니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "자동 변환으로 되돌리기" }));
    expect(screen.getByTestId("effective").textContent).toBe("forest cabin");
  });

  it("사전이 못 푸는 문장은 모델(목) 번역으로 보강하고 출처를 밝힌다", async () => {
    const loadTranslator = vi.fn(async () => (async () => "dense jungle") as ResearchQueryTranslator);
    render(<Harness input="울창한 밀림" loadTranslator={loadTranslator} />);
    await waitFor(() => expect(screen.getByTestId("effective").textContent).toBe("dense jungle"));
    expect(loadTranslator).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/브라우저 번역 모델/)).toBeTruthy();
    expect(screen.getByText(/opus-mt-ko-en/)).toBeTruthy();
  });

  it("모델 로드 실패 시 검색을 막지 않고 원문으로 진행하며 직접 입력을 안내한다", async () => {
    const loadTranslator = vi.fn(async () => null);
    render(<Harness input="울창한 밀림" loadTranslator={loadTranslator} />);
    await waitFor(() => expect(screen.getByText(/원문으로 검색합니다/)).toBeTruthy());
    expect(screen.getByTestId("effective").textContent).toBe("울창한 밀림");
    const field = screen.getByLabelText("실제로 검색할 영문 검색어") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "dense jungle" } });
    fireEvent.click(screen.getByRole("button", { name: "이 검색어로 다시 검색" }));
    expect(screen.getByTestId("effective").textContent).toBe("dense jungle");
  });

  it("부분 변환에서는 사전에 없는 표현을 그대로 함께 검색한다고 알린다", async () => {
    const loadTranslator = vi.fn(async () => null);
    render(<Harness input="안개 낀 등대" loadTranslator={loadTranslator} />);
    await waitFor(() => expect(screen.getByText(/사전에 없는 표현 ‘낀’/)).toBeTruthy());
    expect(screen.getByTestId("effective").textContent).toBe("fog 낀 lighthouse");
  });
});
