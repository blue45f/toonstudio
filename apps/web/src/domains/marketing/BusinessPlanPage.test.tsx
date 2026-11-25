// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("2026-11-25 웨이브 45~49 구현 마일스톤·보안 거버넌스와 /compare/studio 링크를 목표와 분리해 표시한다", () => {
    render(<BusinessPlanPage />);

    expect(screen.getByText(/웨이브 45~49 구현 동기화 2026-11-25/)).toBeTruthy();
    const milestones = document.getElementById("psst-wave-milestones");
    expect(milestones).not.toBeNull();
    if (!milestones) throw new Error("마일스톤 영역이 없습니다.");
    const scope = within(milestones);
    expect(scope.getByText("현재 구현 마일스톤 (2026-11-25 · 웨이브 45~49)")).toBeTruthy();
    expect(scope.getByText("운영 매출·고객 검증 목표와 별개")).toBeTruthy();
    expect(scope.getByText("에디토리얼 테마·홈 구성")).toBeTruthy();
    expect(scope.getByText(/180° 카메라 앵글 리프레이밍/)).toBeTruthy();
    expect(scope.getByText(/15관절 손 자동 그립/)).toBeTruthy();
    expect(scope.getByText(/120Hz 목표 프레임 예산 가드/)).toBeTruthy();
    expect(scope.getByText(/취약점 수와 권한 적용 범위는 최종 SHA에서 다시 확인/)).toBeTruthy();
    expect(scope.getByText(/실제 장면 적용·저장·권한 검증은 별도/)).toBeTruthy();

    const compareLinks = screen.getAllByRole("link", { name: /제작 도구 비교 자료/ });
    expect(compareLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of compareLinks) {
      expect(link.getAttribute("href")).toBe("/compare/studio");
    }
  });
  it("새 마일스톤은 계산 예제·합성 입력과 운영 검증의 경계를 밝힌다", () => {
    render(<BusinessPlanPage />);
    const scope = document.getElementById("psst-wave-milestones");
    expect(scope?.textContent).toContain("계산 예제");
    expect(scope?.textContent).toContain("합성 입력");
    expect(scope?.textContent).toContain("실기기·운영 GPU 성능 미검증");
    expect(scope?.textContent).not.toMatch(/106\/106|pnpm audit 취약점 0건|23개 파일 정비/);
  });

});
