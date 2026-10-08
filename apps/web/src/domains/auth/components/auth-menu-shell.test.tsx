// @vitest-environment jsdom
/**
 * AuthMenuShell 인증 모달 청크 복구 테스트 (F-B11-1 후속) —
 * 인증 모달 청크의 일시적 로딩 실패가 로그인 게이트를 세션 내내 죽이지 않고
 * lazyRetry의 새로고침 복구로 이어지는지, 정상 로딩 시에는 인증 요청에
 * 모달이 열리는지를 검증한다.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ failImport: false }));

vi.mock("./auth-menu", () => {
  if (hoisted.failImport) {
    throw new Error("chunk load failed");
  }
  return {
    AuthMenu: ({ defaultOpen }: { defaultOpen?: boolean }) =>
      defaultOpen ? <div role="dialog" aria-label="로그인 모달 스텁" /> : null,
  };
});

async function importShell() {
  vi.resetModules();
  const shell = await import("./auth-menu-shell");
  const intent = await import("@/domains/auth/public/session/auth-modal-intent");
  return { AuthMenuShell: shell.AuthMenuShell, requestAuthModalOpen: intent.requestAuthModalOpen };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AuthMenuShell 청크 복구", () => {
  it("청크 로딩이 실패하면 새로고침 복구를 시도하고 셸이 깨지지 않는다", async () => {
    hoisted.failImport = true;
    const { AuthMenuShell, requestAuthModalOpen } = await importShell();

    render(<AuthMenuShell />);
    await act(async () => {
      requestAuthModalOpen({ reason: "protected-action", source: "shell-test" });
    });

    // 실패가 영구 거절로 굳지 않고, chunk-load-recovery의 새로고침 가드가
    // 세워진 채 복구 경로로 이어진다(jsdom의 reload는 실제 이동을 하지 않는다).
    await waitFor(() =>
      expect(sessionStorage.getItem("chunk-reload:AuthMenu")).not.toBeNull(),
    );
    // 복구 전까지 fallback 트리거가 남아 화면이 깨지지 않는다.
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("청크를 불러올 수 있으면 인증 요청에 모달이 열린다", async () => {
    hoisted.failImport = false;
    const { AuthMenuShell, requestAuthModalOpen } = await importShell();

    render(<AuthMenuShell />);
    await act(async () => {
      requestAuthModalOpen({ reason: "protected-action", source: "shell-test" });
    });

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
