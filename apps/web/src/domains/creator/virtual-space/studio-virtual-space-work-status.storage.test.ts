// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_WEBTOON_WORK_STATUS_EVENT, STUDIO_WEBTOON_WORK_STATUS_IDS, STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY,
  readStudioWebtoonWorkStatus, writeStudioWebtoonWorkStatus } from "./studio-virtual-space-work-status";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("업무 상태의 닫힌 표시 설정", () => {
  it("다섯 배지만 왕복하고 명시적 해제는 배지 키만 제거한다", () => {
    localStorage.setItem("unrelated-project", "원본");
    for (const id of STUDIO_WEBTOON_WORK_STATUS_IDS) {
      expect(writeStudioWebtoonWorkStatus(id)).toBe(true);
      expect(readStudioWebtoonWorkStatus()).toBe(id);
    }
    expect(Reflect.apply(writeStudioWebtoonWorkStatus, undefined, ["unknown-status"])).toBe(false);
    expect(localStorage.getItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY)).toBe("short-break");
    expect(writeStudioWebtoonWorkStatus(null)).toBe(true);
    expect(readStudioWebtoonWorkStatus()).toBeNull();
    expect(localStorage.getItem("unrelated-project")).toBe("원본");
  });

  it("쓰기·삭제 거부 시 이전 배지를 유지하고 성공 이벤트를 내보내지 않는다", () => {
    writeStudioWebtoonWorkStatus("inking");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeStudioWebtoonWorkStatus("short-break")).toBe(false);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(writeStudioWebtoonWorkStatus(null)).toBe(false);
    expect(readStudioWebtoonWorkStatus()).toBe("inking");
    expect(dispatch.mock.calls.some(([event]) => event.type === STUDIO_WEBTOON_WORK_STATUS_EVENT)).toBe(false);
  });

  it("알 수 없는 기존 값과 읽기 거부는 배지 없음으로 복원하고 원본은 지우지 않는다", () => {
    localStorage.setItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY, "future-status");
    expect(readStudioWebtoonWorkStatus()).toBeNull();
    expect(localStorage.getItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY)).toBe("future-status");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(readStudioWebtoonWorkStatus()).toBeNull();
  });
});
