import { afterEach, describe, expect, it, vi } from "vitest";

import { expectedDrawingPersistence, hasOpfsEntryPoint } from "./studio-drawing-storage-capability.mjs";

// 페이지 컨텍스트에서 돌 함수를 그대로 호출하는 가짜 페이지. 전역 navigator 를 바꿔 브라우저 빌드별 능력을 흉내 낸다.
const page = { evaluate: async <T>(read: () => T): Promise<T> => read() };

afterEach(() => { vi.unstubAllGlobals(); });

describe("그리기 검증기의 저장 능력 판정", () => {
  it("navigator.storage 가 없는 빌드(Linux Playwright WebKit)는 OPFS 진입점이 없다고 본다", async () => {
    vi.stubGlobal("navigator", {});
    expect(await hasOpfsEntryPoint(page)).toBe(false);
  });

  it("storage 객체만 있고 getDirectory 가 없으면 진입점이 없다고 본다", async () => {
    vi.stubGlobal("navigator", { storage: {} });
    expect(await hasOpfsEntryPoint(page)).toBe(false);
  });

  it("getDirectory 함수가 있으면 진입점이 있다고 본다", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({}) } });
    expect(await hasOpfsEntryPoint(page)).toBe(true);
  });

  it("진입점이 없는 WebKit 만 세션 전용 계약으로 내린다", () => {
    expect(expectedDrawingPersistence("webkit", false)).toBe("session-only");
  });

  it("진입점이 있는 WebKit 은 saved 를 요구한다(진입점이 있는데 저장이 안 되면 결함이다)", () => {
    expect(expectedDrawingPersistence("webkit", true)).toBe("saved");
  });

  it.each(["chromium", "firefox"])("%s 는 진입점 측정값과 무관하게 항상 saved 를 요구한다", (engine) => {
    expect(expectedDrawingPersistence(engine, true)).toBe("saved");
    expect(expectedDrawingPersistence(engine, false)).toBe("saved");
  });
});
