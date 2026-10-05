// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  browserNewsletterSessionStorage,
  loadNewsletterResendApiKey,
  saveNewsletterResendApiKey,
} from "@/domains/newsletter/public/newsletter-mail-key";

import { ResendKeyConnectCard } from "./ResendKeyConnectCard";

// 회귀 고정: 이 카드는 MaskedKeyField의 현행 StoredKeyRow API(label·masked·
// onCopy·onRemove)에 맞춰 동작해야 한다. 과거 병합본은 존재하지 않는 심볼을
// import해 허브 페이지 전체가 컴파일되지 않았다.
describe("ResendKeyConnectCard", () => {
  afterEach(cleanup);
  beforeEach(() => {
    globalThis.sessionStorage?.clear();
  });

  it("등록된 키가 있으면 연결됨과 마스킹 행을 보여주고 해제할 수 있다", () => {
    saveNewsletterResendApiKey(browserNewsletterSessionStorage(), "re_test_key_123456");
    render(<ResendKeyConnectCard />);
    expect(screen.getByText("연결됨")).toBeTruthy();
    expect(screen.queryByText("re_test_key_123456")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내 Resend 키 연결 해제" }));
    expect(loadNewsletterResendApiKey(browserNewsletterSessionStorage())).toBe("");
    expect(screen.getByText("미설정")).toBeTruthy();
  });

  it("키가 없으면 등록 폼이 보이고 등록하면 저장된다", () => {
    render(<ResendKeyConnectCard />);
    fireEvent.change(screen.getByLabelText("내 Resend API 키"), {
      target: { value: "re_new_key_abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));
    expect(loadNewsletterResendApiKey(browserNewsletterSessionStorage())).toBe("re_new_key_abcdef");
    expect(screen.getByText("연결됨")).toBeTruthy();
  });
});
