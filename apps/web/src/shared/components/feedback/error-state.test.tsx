// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorState, GuidedErrorState } from "./error-state";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

afterEach(cleanup);

describe("ErrorState 문형 슬롯", () => {
  it("기존 용법(title·message·onRetry)은 그대로 동작한다", () => {
    render(<ErrorState title="불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.getByText("common.retry.short")).toBeTruthy();
  });

  it("원인·데이터 안전·다음 행동을 구분해 보여 준다", () => {
    render(
      <GuidedErrorState
        title="저장하지 못했어요"
        copy={{
          cause: "연결이 끊겨 저장하지 못했어요.",
          dataSafety: "입력한 내용은 그대로 남아 있어요.",
          action: "연결을 확인한 뒤 다시 저장해 주세요.",
        }}
      />,
    );
    expect(screen.getByText("연결이 끊겨 저장하지 못했어요.")).toBeTruthy();
    expect(screen.getByText("입력한 내용은 그대로 남아 있어요.")).toBeTruthy();
    expect(screen.getByText("연결을 확인한 뒤 다시 저장해 주세요.")).toBeTruthy();
  });

  it("cause가 있으면 message 폴백보다 우선한다", () => {
    render(<ErrorState title="제목" message="예전 문구" cause="원인 문구" />);
    expect(screen.getByText("원인 문구")).toBeTruthy();
    expect(screen.queryByText("예전 문구")).toBeNull();
  });
});
