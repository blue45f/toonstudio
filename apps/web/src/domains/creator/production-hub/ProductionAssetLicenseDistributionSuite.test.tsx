// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductionAssetLicenseDistributionSuite } from "./ProductionAssetLicenseDistributionSuite";

afterEach(() => {
  cleanup();
});

describe("ProductionAssetLicenseDistributionSuite UI", () => {
  it("개인 사용권 에셋을 외부 공개 전에 공동 사용권으로 전환하고 어시스턴트에게 원본 편집 시트를 배치 할당한다", () => {
    render(<ProductionAssetLicenseDistributionSuite />);

    // 초기 선택 에셋: ast-snaptoon-dungeon (개인 사용권 1/1석)
    expect(screen.getByTestId("selected-asset-tier-pill").textContent).toContain(
      "개인 사용권 (1인 원본 편집 전용)",
    );

    // 1인 시트가 이미 찼으므로 원본 편집 시트 추가 배정 시도 시 차단 메시지 확인
    fireEvent.click(screen.getByTestId("batch-assign-seat-btn"));
    expect(screen.getByTestId("batch-distribution-status-message").textContent).toContain(
      "배치 배포 차단 (/api/v1/resources/batch)",
    );

    // 외부 공개 전이므로 공동 사용권 1회권(5석)으로 업그레이드 실행
    fireEvent.click(screen.getByTestId("execute-license-upgrade-btn"));
    expect(screen.getByTestId("selected-asset-tier-pill").textContent).toContain(
      "공동 사용권 1회권 (팀 최대 5인 원본 편집)",
    );

    // 업그레이드 후 시트 배치 배정 재시도 -> 성공 (활성 시트 2/5석)
    fireEvent.click(screen.getByTestId("batch-assign-seat-btn"));
    expect(screen.getByTestId("batch-distribution-status-message").textContent).toContain(
      "배치 배포 성공 (/api/v1/resources/batch)",
    );
    expect(screen.getByTestId("selected-asset-tier-pill").textContent).toContain("2/5석");
  });

  it("외주 계약 만료자 시트 일괄 회수 및 3대 EULA 금지 행위(단순 추출 판매·2차 도구화) 감사를 수행한다", () => {
    render(<ProductionAssetLicenseDistributionSuite />);

    // 외주 계약 만료자 시트 회수 버튼 클릭 (ast-acon-palace의 2026-10-20 만료 시트 1건 회수)
    fireEvent.click(screen.getByTestId("revoke-expired-seats-btn"));
    expect(screen.getByTestId("batch-distribution-status-message").textContent).toContain(
      "외주 어시스턴트 시트 1건을 일괄 회수했습니다",
    );

    // 단순 이미지 추출 판매 및 2차 도구화 금지 시뮬레이션 토글 활성화
    fireEvent.click(screen.getByTestId("simulate-simple-render-resale-toggle"));
    fireEvent.click(screen.getByTestId("simulate-secondary-toolification-toggle"));

    expect(screen.getByTestId("eula-compliance-status-heading").textContent).toContain(
      "약관 위반 위험 2건 감지",
    );
    expect(screen.getByTestId("eula-violation-list").textContent).toContain("2차 도구화");
  });
});
