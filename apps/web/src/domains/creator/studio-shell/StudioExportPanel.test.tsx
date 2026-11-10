// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioExportPanel } from "./StudioExportPanel";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioExportPanel", () => {
  it("필수 목적·형식 선택을 먼저 보여 주고 해상도·DPI 등 고급 설정은 기본으로 접어 둔다", () => {
    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-export-1" locale="ko" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "올릴 곳을 고르면 알맞은 규격을 자동으로 맞춰 드려요",
      }),
    ).toBeTruthy();

    // 자동 맞춰진 권장 규격 요약이 바로 보인다.
    expect(screen.getByTestId("studio-export-preset-summary").textContent).toContain("자동 맞춤 적용됨");

    // 7개 기술 수치·체크박스 영역은 초보자가 부담을 느끼지 않도록 기본 접힘 상태다.
    const advanced = screen.getByTestId("studio-export-advanced-settings") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);

    // 출고 전 상태 검사를 실행하면 결과가 기기에 저장되고 상태 배너가 표시된다.
    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByRole("status").textContent).toContain("출고 전 점검을 마치고 결과를 저장했어요");

    // 편집기 최종 출력 링크가 올바른 경로를 가리킨다.
    const finalizeLink = screen.getByRole("link", { name: /편집기에서 최종 출력/u });
    expect(finalizeLink.getAttribute("href")).toBe("/studio/work/proj-export-1/publish");
  });
});
