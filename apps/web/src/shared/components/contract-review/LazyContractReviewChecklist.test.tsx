// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LazyContractReviewChecklist } from "./LazyContractReviewChecklist";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("체크리스트 지연 불러오기", () => {
  it("불러오는 중 상태를 먼저 알리고 불러온 뒤 체크리스트를 그린다", async () => {
    render(<LazyContractReviewChecklist headingLevel={3} />);
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    expect(await screen.findByRole("note", {}, { timeout: 15_000 })).toBeTruthy();
    expect(screen.queryByText(/불러오는 중/u)).toBeNull();
    // 넘긴 제목 수준이 본문에 전달된다.
    expect(screen.getByRole("heading", { level: 3, name: "일정과 분량" })).toBeTruthy();
  });
});
