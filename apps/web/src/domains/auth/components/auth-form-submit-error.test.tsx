// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthModal } from "./auth-modal";

const fetchMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  signIn: signInMock,
}));
vi.mock("./google-identity-button", () => ({ GoogleIdentityButton: () => null }));

const connectionError =
  "로그인 서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.";

function fillLogin() {
  for (const [name, value] of Object.entries({
    email: "user@example.com",
    password: "fixture-only-password",
  })) {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    if (!input) throw new Error(`로그인 입력 누락: ${name}`);
    fireEvent.change(input, { target: { value } });
  }
}

describe("AuthModal 이메일 로그인 제출 실패", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    signInMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // 제공자 조회는 빈 정상 응답으로 고정해 제출 흐름만 분리해서 본다.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("연결 실패 결과가 돌아오면 폼 안에 오류를 표시하고 제출 버튼이 복원된다", async () => {
    signInMock.mockResolvedValue({
      ok: false,
      error: connectionError,
      status: 0,
      url: null,
    });
    render(<AuthModal onClose={vi.fn()} />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(connectionError);
    const submit = screen.getByRole("button", {
      name: "로그인",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(screen.queryByText("처리 중…")).toBeNull();
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "user@example.com",
      password: "fixture-only-password",
      redirect: false,
    });
  });

  it("제출 중 예외가 발생해도 일반 오류를 표시하고 다시 시도할 수 있다", async () => {
    signInMock.mockRejectedValue(new TypeError("network unavailable"));
    render(<AuthModal onClose={vi.fn()} />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("문제가 발생했어요. 다시 시도해 주세요.");
    const submit = screen.getByRole("button", {
      name: "로그인",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("성공 경로는 그대로 모달을 닫는다", async () => {
    signInMock.mockResolvedValue({
      ok: true,
      error: null,
      status: 200,
      url: null,
    });
    const onClose = vi.fn();
    render(<AuthModal onClose={onClose} />);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
