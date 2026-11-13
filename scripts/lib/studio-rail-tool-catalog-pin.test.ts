import { describe, expect, it, vi } from "vitest";

import { pinStudioRailToolFromCatalog } from "./studio-rail-tool-catalog-pin";

import type { Page } from "playwright";

function fixture(label: string, { searchError, pinError }: { searchError?: Error; pinError?: Error } = {}) {
  const state = { open: false, query: "", pinned: false, used: false };
  const calls: string[] = [];
  const catalog = {
    getByRole: (role: string, options: { name: string; exact: boolean }) => {
      expect(options.exact).toBe(true); expect(state.open).toBe(true);
      if (role === "searchbox" && options.name === "전체 도구 검색") return { fill: vi.fn(async (query: string) => {
        if (searchError) throw searchError;
        state.query = query; calls.push("search");
      }) };
      if (role === "button" && options.name === `${label} 고정`) return { click: vi.fn(async () => {
        if (state.query !== label) throw new Error("분류 정문에는 도구 행이 없습니다. 실제 검색이 먼저 필요합니다.");
        if (pinError) throw pinError;
        state.pinned = true; calls.push("pin");
      }) };
      if (role === "button" && options.name === "전체 도구 닫기") return { click: vi.fn(async () => {
        state.open = false; calls.push("close");
      }) };
      throw new Error("도구 실행이나 다른 목적의 버튼을 누를 수 없습니다: " + options.name);
    },
    waitFor: vi.fn(async (options: { state: string; timeout: number }) => {
      expect(options).toEqual({ state: "hidden", timeout: 5_000 }); expect(state.open).toBe(false);
      calls.push("hidden");
    }),
  };
  const page = {
    getByRole: (role: string, options: { name: string; exact: boolean }) => {
      expect(options).toEqual({ name: "전체 도구", exact: true });
      if (role === "dialog") return catalog;
      expect(role).toBe("button");
      return { click: vi.fn(async () => { state.open = true; calls.push("open"); }) };
    },
  } as unknown as Page;
  return { page, state, calls };
}

describe("전체 도구 분류 정문에서 실제 검색으로 고정하기", () => {
  it.each(["색 가져오기", "말풍선", "사각형 도형", "타원 도형", "참고 이미지"])("%s를 검색한 뒤 같은 도구의 핀만 바꾼다", async (label) => {
    const f = fixture(label);
    await pinStudioRailToolFromCatalog(f.page, label);
    expect(f.state).toEqual({ open: false, query: label, pinned: true, used: false });
    expect(f.calls).toEqual(["open", "search", "pin", "close", "hidden"]);
  });
  it("검색 실패를 핀 성공으로 숨기지 않는다", async () => {
    const failure = new Error("실제 검색 실패"), f = fixture("말풍선", { searchError: failure });
    await expect(pinStudioRailToolFromCatalog(f.page, "말풍선")).rejects.toBe(failure);
    expect(f.state.pinned).toBe(false); expect(f.state.used).toBe(false);
  });
  it("실제 핀 실패도 호출자의 누적 도구 검증에 그대로 전달한다", async () => {
    const failure = new Error("실제 고정 실패"), f = fixture("참고 이미지", { pinError: failure });
    await expect(pinStudioRailToolFromCatalog(f.page, "참고 이미지")).rejects.toBe(failure);
    expect(f.state.pinned).toBe(false); expect(f.calls).toEqual(["open", "search"]);
  });
});
