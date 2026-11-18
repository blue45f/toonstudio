import { describe, expect, it, vi } from "vitest";

import { closeStudioInAppRouteModal } from "./studio-inapp-route-modal";

import type { Page } from "playwright";

function fixture(options: { count?: number; remainsOpen?: boolean; absent?: boolean } = {}) {
  let visible = !options.absent;
  const actions: string[] = [];
  const close = {
    filter: () => close,
    count: async () => 1,
    waitFor: async () => { if (!visible) throw new Error("닫기 버튼 없음"); },
    click: vi.fn(async () => { actions.push("close"); if (!options.remainsOpen) visible = false; }),
  };
  const dialog = {
    filter: () => dialog,
    count: async () => options.count ?? 1,
    getAttribute: async (attribute: string) => attribute === "aria-modal" ? "true" : null,
    waitFor: async ({ state }: { state: string }) => {
      actions.push(state);
      if ((state === "visible") !== visible) throw new Error(`대화상자가 ${state} 상태가 아님`);
    },
    getByRole: (role: string, query: unknown) => {
      expect([role, query]).toEqual(["button", { name: "닫기", exact: true }]);
      return close;
    },
  };
  const getByRole = vi.fn((role: string, query: unknown) => {
    expect([role, query]).toEqual(["dialog", { name: "스토리보드 컨트롤 룸", exact: true }]);
    return dialog;
  });
  return { page: { getByRole } as unknown as Page, actions, close, getByRole };
}

describe("인앱 만화 모달의 정상 닫기와 편집기 복귀 준비", () => {
  it("감사한 대화상자의 닫기를 한 번 누르고 사라진 결과까지 확인한다", async () => {
    const f = fixture();
    expect(await closeStudioInAppRouteModal(f.page, "comic")).toBe("스토리보드 컨트롤 룸");
    expect(f.actions).toEqual(["visible", "close", "hidden"]);
    expect(f.close.click).toHaveBeenCalledTimes(1);
  });
  it("다른 라우트의 예상하지 않은 대화상자는 자동으로 닫지 않는다", async () => {
    const f = fixture();
    expect(await closeStudioInAppRouteModal(f.page, "editor")).toBeNull();
    expect(f.getByRole).not.toHaveBeenCalled();
  });
  it.each([{ absent: true }, { count: 2 }, { remainsOpen: true }])(
    "%j 상태는 복귀 검증을 건너뛰거나 성공으로 표시하지 않는다", async (options) => {
      const f = fixture(options);
      await expect(closeStudioInAppRouteModal(f.page, "comic", 100)).rejects.toThrow();
    },
  );
});
