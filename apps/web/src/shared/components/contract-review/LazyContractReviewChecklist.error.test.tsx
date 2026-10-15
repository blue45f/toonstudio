// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyContractReviewChecklist } from "./LazyContractReviewChecklist";

// 본문 묶음을 불러오지 못하는 상황(배포 직후 청크 만료·네트워크 끊김)을 흉내 낸다.
vi.mock("./ContractReviewChecklist", () => {
  throw new Error("chunk failed");
});

afterEach(() => {
  cleanup();
});

describe("체크리스트 불러오기 실패", () => {
  it("실패를 알리고 ‘다시 시도’로 다시 불러오기를 시작한다", async () => {
    render(<LazyContractReviewChecklist />);
    const alert = await screen.findByRole("alert", {}, { timeout: 15_000 });
    expect(alert.textContent).toContain("체크리스트를 불러오지 못했어요");
    expect(alert.textContent).toContain("이미 답한 내용은 이 브라우저에 그대로 남아 있어요");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    // 다시 시도하면 곧바로 불러오는 중 상태로 돌아가고, 여전히 실패하면 다시 오류를 알린다.
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    expect(await screen.findByRole("alert", {}, { timeout: 15_000 })).toBeTruthy();
  });
});
