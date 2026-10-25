// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KaistoryLearningPlatformSection } from "./KaistoryLearningPlatformSection";

afterEach(() => {
  cleanup();
});

describe("KaistoryLearningPlatformSection", () => {
  it("KAION 6단계 교육과정·문제 등록, KAITOON 문제 풀이·오답노트·포인트 열람권, STEM 15선을 모두 동작시킨다", () => {
    render(<KaistoryLearningPlatformSection />);

    // 1. KAION 탭 기본 렌더링 확인
    expect(
      screen.getByRole("heading", {
        name: /KAION 6단계 교육과정·문제은행 & KAITOON 만화\+교육 학습관/u,
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/중학교 > 중학교 1학년 > 물리 > 여러 가지 힘과 운동/u).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/하위 항목을 먼저 삭제해야 합니다/u)).toBeTruthy();

    // 2. KAITOON 탭으로 전환 후 오답노트·문항 채점·1주일 열람권 확인
    fireEvent.click(screen.getByRole("tab", { name: /2\. KAITOON · 만화\+교육 학습·오답노트/u }));
    expect(screen.getByText(/반복 오답 · 복습 필수/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "답안 제출 및 채점" }));
    expect(screen.getByRole("status").textContent).toContain("정답입니다!");

    fireEvent.click(screen.getByRole("button", { name: "100P로 유료 에피소드 1주일 열람" }));
    expect(screen.getByText(/1주일 동안 볼 수 있습니다/u)).toBeTruthy();

    // 3. 외부 STEM 실험·백과 15선 탭 확인
    fireEvent.click(screen.getByRole("tab", { name: /3\. 외부 STEM 실험·백과 15선/u }));
    expect(screen.getByText("PhET 시뮬레이션")).toBeTruthy();
    expect(screen.getByText("Ptable 동적 주기율표")).toBeTruthy();
    expect(screen.getByText("Desmos 그래프 계산기")).toBeTruthy();
  });
});
