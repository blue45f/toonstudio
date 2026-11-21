/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCspReaCompleteWorkbenchSection } from "../StudioCspReaCompleteWorkbenchSection";

afterEach(() => {
  cleanup();
});

describe("StudioCspReaCompleteWorkbenchSection (창작자 중심 UX · OKLCH 스펙트럼 · 촉각 모션 계약)", () => {
  it("창작자 중심 3개 주 탭, 동사형 Primary CTA, 안심 피드백, 기본 접힘 호환 기능 요약을 렌더링한다", () => {
    const onSelectPresetId = vi.fn();
    const onApplyFilterId = vi.fn();
    const onRunCoreFeature = vi.fn();

    render(
      <StudioCspReaCompleteWorkbenchSection
        onSelectPresetId={onSelectPresetId}
        onApplyFilterId={onApplyFilterId}
        onRunCoreFeature={onRunCoreFeature}
      />,
    );

    // 상단 주 탭은 창작자 중심 3개로 단순화 (검증 원장 탭 노출 금지)
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((el) => el.textContent)).toEqual([
      "브러시 고르기",
      "필터·색조 보정",
      "만화·애니 도구",
    ]);
    expect(screen.getByTestId("csp-rea-spectrum-ribbon")).toBeTruthy();

    // 1. 브러시 탭 선택 및 Primary CTA 실행 -> 안심 피드백 확인
    expect(screen.getByTestId("csp-rea-tab-brush")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("브러시 선택"), {
      target: { value: "wet-watercolor" },
    });
    expect(onSelectPresetId).toHaveBeenCalledWith("wet-watercolor");
    expect(screen.getByTestId("csp-rea-brush-readout").textContent).toContain("자연 수채 혼색");

    fireEvent.click(screen.getByTestId("csp-rea-brush-primary-cta"));
    expect(screen.getByTestId("csp-rea-applied-feedback").textContent).toContain(
      "적용됨 · 언제든 되돌리기 가능",
    );

    // 2. 필터·색조 보정 탭 전환 및 Primary CTA 실행
    fireEvent.click(screen.getByRole("tab", { name: "필터·색조 보정" }));
    expect(screen.getByTestId("csp-rea-tab-filter")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/필터·색조 선택/u), {
      target: { value: "lt-line-extract" },
    });
    expect(onApplyFilterId).toHaveBeenCalledWith("lt-line-extract");
    fireEvent.click(screen.getByTestId("csp-rea-filter-primary-cta"));
    expect(screen.getByTestId("csp-rea-applied-feedback").textContent).toContain(
      "필터 적용됨 · 언제든 되돌리기 가능",
    );
    expect(screen.getByTestId("csp-rea-filter-readout").textContent).toContain("변환 픽셀");

    // 3. 만화·애니 도구 탭 전환 및 Primary CTA 실행
    fireEvent.click(screen.getByRole("tab", { name: "만화·애니 도구" }));
    expect(screen.getByTestId("csp-rea-core-readout").textContent).toContain("대칭선");
    fireEvent.click(screen.getByTestId("csp-rea-core-primary-cta"));
    expect(onRunCoreFeature).toHaveBeenCalledWith(expect.stringMatching(/^auto-action:/u));
    expect(screen.getByTestId("csp-rea-applied-feedback").textContent).toContain(
      "도구 적용됨 · 언제든 되돌리기 가능",
    );

    // 4. 하단 호환 기능 요약은 기본 접힘 <details>이며 내부 개발 용어가 노출되지 않는다
    const summaryDetails = screen.getByTestId(
      "csp-rea-compatibility-summary",
    ) as HTMLDetailsElement;
    expect(summaryDetails.open).toBe(false);
    expect(summaryDetails.textContent).toContain("지원 호환 기능 한눈에 보기");

    const renderedText = screen.getByTestId("csp-rea-complete-workbench").textContent ?? "";
    expect(renderedText).not.toMatch(
      /OBL-|ghidra|EditImageTool\.todb|CSVectorizeV4|default\.laf/iu,
    );
  });

  it("DOM UI 소스가 OKLCH 스펙트럼·촉각 모션·44px 터치 타깃·모션 축소를 준수하고 금지 토큰/내부 용어가 0건이다", () => {
    const source = readFileSync(
      resolve(__dirname, "../StudioCspReaCompleteWorkbenchSection.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(source).not.toMatch(/\brgba?\(/u);
    expect(source).not.toMatch(/\bbg-white\b/u);
    expect(source).not.toMatch(/\banimate-spin\b/u);
    expect(source).not.toMatch(/\btransition-all\b/u);
    expect(source).not.toMatch(
      /\b(SQLite|OPFS|CRDT|leader tab|ghidra|EditImageTool\.todb|CSVectorizeV4|default\.laf)\b|OBL-/iu,
    );
    expect(source).toContain("color-mix(in oklch");
    expect(source).toContain("active:scale-[0.97]");
    expect(source).toContain("cubic-bezier(0.22,1,0.36,1)");
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).toContain("motion-reduce:transform-none");
    expect(source).toContain("min-h-11");
  });
});
