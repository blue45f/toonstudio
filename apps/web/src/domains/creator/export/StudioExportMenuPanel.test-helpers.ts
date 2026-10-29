import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

export function openStudioExportSection(title: string): void {
  const summary = screen.getByText(title, { exact: true }).closest("summary");
  const details = summary?.parentElement;
  if (!summary || !(details instanceof HTMLDetailsElement)) {
    throw new Error(`내보내기 섹션을 찾을 수 없습니다: ${title}`);
  }
  if (!details.open) fireEvent.click(summary);
}

/** 기존 형식별 회귀 시나리오는 사용자가 해당 설정을 연 뒤 이어서 실행한다. */
export function renderExpandedExportPanel(ui: ReactElement) {
  const result = render(ui);
  for (const title of ["페이지 범위", "인쇄·PDF", "다른 편집기용 파일", "게시 준비"]) {
    openStudioExportSection(title);
  }
  return result;
}
