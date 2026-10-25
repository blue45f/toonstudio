// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WebtoonAssistantOutsourcingSuite } from "./WebtoonAssistantOutsourcingSuite";

afterEach(() => {
  cleanup();
});

describe("WebtoonAssistantOutsourcingSuite UI", () => {
  it("17개 웹툰 파트 선택 시 표준 공정 범위와 필수 포트폴리오 검증 항목을 갱신하고 지원서 제목을 생성한다", () => {
    render(<WebtoonAssistantOutsourcingSuite />);

    expect(screen.getByTestId("generated-subject-line-preview").textContent).toContain(
      "[방사_단기외주_선화] 김툰어시 지원서",
    );

    fireEvent.change(screen.getByTestId("outsourcing-part-code-select"), {
      target: { value: "001.017" },
    });

    expect(screen.getByTestId("selected-part-default-scope").textContent).toContain(
      "식자 전까지의 후보정·원꾸",
    );
    expect(screen.getByTestId("generated-subject-line-preview").textContent).toContain(
      "[방사_단기외주_후보정·원꾸] 김툰어시 지원서",
    );
  });

  it("초과 컷수 변경 시 실시간 정산 금액을 재계산하고 만화인 헬프데스크 계약 안전 경고를 표시한다", () => {
    render(<WebtoonAssistantOutsourcingSuite />);

    const actualCutInput = screen.getByTestId("actual-cut-count-input");
    fireEvent.change(actualCutInput, { target: { value: "50" } });

    // 기본 30컷(450,000) + 초과 20컷(300,000) + 테스트비(50,000) = 800,000원
    expect(screen.getByTestId("episode-settlement-summary-banner").textContent).toContain(
      "초과 20컷(300,000원)",
    );
    expect(screen.getByTestId("episode-settlement-summary-banner").textContent).toContain(
      "세전 800,000원",
    );

    // 유급 샘플 테스트 체크 해제 시 경고 노출 확인
    fireEvent.click(screen.getByTestId("check-paid-sample-test"));
    expect(screen.getByTestId("contract-safety-warnings").textContent).toContain(
      "샘플 테스트가 무급으로 설정되어 있습니다",
    );
  });

  it("활동필명 입력란을 비우고 blur할 때만 aria-invalid와 오류 메시지를 동기화한다", () => {
    render(<WebtoonAssistantOutsourcingSuite />);

    const penNameInput = screen.getByTestId("applicant-pen-name-input");
    expect(penNameInput.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(penNameInput, { target: { value: "   " } });
    fireEvent.blur(penNameInput);

    expect(penNameInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("applicant-pen-name-error").textContent).toContain(
      "활동필명을 입력해 주세요",
    );
  });
});
