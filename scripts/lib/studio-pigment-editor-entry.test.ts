import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForEditorSettled } from "../../e2e/helpers/studio-editor-a11y";
import { waitForPigmentEditorSettled } from "../../e2e/helpers/studio-pigment-editor-entry";

import type { Page } from "@playwright/test";

vi.mock("../../e2e/helpers/studio-editor-a11y", () => ({ waitForEditorSettled: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); });

function entry() {
  const state = { url: "http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1&tag=a&tag=b#canvas" };
  const rejectUiMutation = vi.fn(() => { throw new Error("준비 대기가 현재 원고 셸을 조작했습니다."); });
  const page = {
    url: () => state.url,
    locator: rejectUiMutation,
    addLocatorHandler: rejectUiMutation,
    removeLocatorHandler: rejectUiMutation,
    goto: rejectUiMutation,
    evaluate: rejectUiMutation,
  } as unknown as Page;
  return { page, state, rejectUiMutation };
}

describe("현재 Clarity 셸에서 안료 원고 준비", () => {
  it("실제 공통 준비가 끝날 때까지 기다리고 상시 셸을 제거하는 handler나 배치 전환을 등록하지 않는다", async () => {
    const f = entry();
    const settled = Promise.withResolvers<void>();
    vi.mocked(waitForEditorSettled).mockReturnValue(settled.promise);
    const completed = vi.fn();
    const pending = waitForPigmentEditorSettled(f.page).then(completed);
    await Promise.resolve();
    expect(waitForEditorSettled).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(completed).not.toHaveBeenCalled();
    settled.resolve();
    await pending;
    expect(completed).toHaveBeenCalledOnce();
    expect(f.rejectUiMutation).not.toHaveBeenCalled();
  });

  it.each(["앱 셸", "명령", "aria-busy", "오프라인 상태", "레이아웃"])("%s 준비 실패를 원문으로 전달하며 복구로 성공을 만들지 않는다", async (stage) => {
    const f = entry(), error = new Error(`${stage} 준비 실패`);
    vi.mocked(waitForEditorSettled).mockRejectedValue(error);
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(waitForEditorSettled).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(f.rejectUiMutation).not.toHaveBeenCalled();
  });

  it("재열기마다 원래 준비 조건을 다시 확인하고 URL·중복 query·브러시 연결을 그대로 보존한다", async () => {
    const f = entry(), original = f.state.url;
    await waitForPigmentEditorSettled(f.page);
    await waitForPigmentEditorSettled(f.page);
    expect(waitForEditorSettled).toHaveBeenCalledTimes(2);
    expect(f.state.url).toBe(original);
    expect(f.rejectUiMutation).not.toHaveBeenCalled();
  });

  it.each([
    ["https://example.invalid/studio/draft/work-1?workspace=draw&materialBrush=brush-1&tag=a&tag=b#canvas", "원고의 주소"],
    ["http://127.0.0.1:4173/studio/draft/another?workspace=draw&materialBrush=brush-1&tag=a&tag=b#canvas", "원고의 주소"],
    ["http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1&tag=a&tag=b#other", "원고의 주소"],
    ["http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=another&tag=a&tag=b#canvas", "기존 연결 문맥을 변경했습니다: materialBrush"],
    ["http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1&tag=a#canvas", "기존 연결 문맥을 변경했습니다: tag"],
    ["http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1&tag=b&tag=a#canvas", "기존 연결 문맥을 변경했습니다: tag"],
  ])("준비 중 원고 identity 변경을 성공으로 판정하지 않는다: %s", async (changedUrl, message) => {
    const f = entry();
    vi.mocked(waitForEditorSettled).mockImplementation(async () => { f.state.url = changedUrl; });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toThrow(message);
    expect(f.rejectUiMutation).not.toHaveBeenCalled();
  });
});
