/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCspReaCompleteWorkbenchSection } from "../StudioCspReaCompleteWorkbenchSection";

afterEach(() => {
  cleanup();
});

describe("StudioCspReaCompleteWorkbenchSection (CSP 전수 내재화 UI & OKLCH 토큰 계약)", () => {
  it("4개 탭(브러시·필터·만화/애니·검증 원장) 전환과 실시간 엔진 실행 리드아웃을 렌더링한다", () => {
    const onSelectPresetId = vi.fn();
    const onApplyFilterId = vi.fn();

    render(
      <StudioCspReaCompleteWorkbenchSection
        onSelectPresetId={onSelectPresetId}
        onApplyFilterId={onApplyFilterId}
      />,
    );

    expect(screen.getByTestId("csp-rea-tab-brush")).toBeTruthy();
    expect(screen.getByTestId("csp-rea-brush-readout").textContent).toContain("변경 픽셀");

    fireEvent.change(screen.getByLabelText("서브툴 프리셋"), {
      target: { value: "wet-watercolor" },
    });
    expect(onSelectPresetId).toHaveBeenCalledWith("wet-watercolor");
    expect(screen.getByTestId("csp-rea-brush-readout").textContent).toContain("지각 LMS 습식 혼색");

    fireEvent.click(screen.getByRole("tab", { name: "필터 · 색조 (46종)" }));
    expect(screen.getByTestId("csp-rea-tab-filter")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/필터 · 색조 보정/u), {
      target: { value: "lt-line-extract" },
    });
    expect(onApplyFilterId).toHaveBeenCalledWith("lt-line-extract");
    expect(screen.getByTestId("csp-rea-filter-readout").textContent).toContain("변환 픽셀");

    fireEvent.click(screen.getByRole("tab", { name: "만화 · 애니 제작" }));
    expect(screen.getByTestId("csp-rea-core-readout").textContent).toContain("복제 경로");

    fireEvent.click(screen.getByRole("tab", { name: "검증 원장" }));
    expect(screen.getByTestId("csp-rea-tab-evidence").textContent).toContain("100%");
    expect(screen.getByTestId("csp-rea-tab-evidence").textContent).toContain("ghidra");
  });

  it("DOM UI 소스가 OKLCH 의미 토큰·44px 터치 타깃·모션 축소를 준수하고 금지 토큰/내부 용어가 0건이다", () => {
    const source = readFileSync(
      resolve(__dirname, "../StudioCspReaCompleteWorkbenchSection.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(source).not.toMatch(/\brgba?\(/u);
    expect(source).not.toMatch(/\bbg-white\b/u);
    expect(source).not.toMatch(/\banimate-spin\b/u);
    expect(source).not.toMatch(/\btransition-all\b/u);
    expect(source).not.toMatch(/\b(SQLite|OPFS|CRDT|leader tab)\b/u);
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).toContain("min-h-11");
  });
});
