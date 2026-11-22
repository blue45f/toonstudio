// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessPlanPage } from "./BusinessPlanPage";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));

afterEach(cleanup);

describe("사업계획서 페이지 (/business-plan)", () => {
  it("PSST 문항·2026-11-22 실측 요약·라이브 위젯·상용 라이선스·5대 Q&A를 모두 렌더링한다", () => {
    render(<BusinessPlanPage />);

    expect(screen.getByText(/페이지 라이브 실측 기준일 2026-11-22/)).toBeTruthy();
    expect(screen.getByText("PostgreSQL 17 스키마 원장")).toBeTruthy();
    expect(screen.getByText("₩0 / 월")).toBeTruthy();
    expect(screen.getByText("590 통과 · 0 차단")).toBeTruthy();

    expect(screen.getByRole("button", { name: "PDF로 내려받기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "DOCX로 내려받기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "고대비 인쇄 (A4)" })).toBeTruthy();

    // 라이브 7밴드 KM 분광 슬라이더 + 단위경제성 시뮬레이터 동작 확인
    const spectralSlider = screen.getByRole("slider", { name: "안료 혼색 비율 조절" });
    fireEvent.change(spectralSlider, { target: { value: "70" } });
    expect(screen.getByText(/코발트 블루 30% : 카드뮴 옐로 70%/)).toBeTruthy();

    // 5대 심사위원 방어 Q&A 아코디언 및 라이선스 카드 확인
    expect(screen.getByText("1인 기업 상용 라이선스 무결성 & 크로스-LLM 배포 가드")).toBeTruthy();
    expect(
      screen.getByText(/1인 기업이 어떻게 이 규모\(133개 DB 마이그레이션 · 클린룸 8종 엔진\)를 유지하고 운영하나요/),
    ).toBeTruthy();
  });
});
