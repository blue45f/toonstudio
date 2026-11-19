import { beforeEach, describe, expect, it, vi } from "vitest";

import { waitForEditorSettled } from "../../e2e/helpers/studio-editor-a11y";
import { waitForPigmentEditorSettled } from "../../e2e/helpers/studio-pigment-editor-entry";

import type { Page } from "@playwright/test";

vi.mock("../../e2e/helpers/studio-editor-a11y", () => ({ waitForEditorSettled: vi.fn() }));

const manuscript = "http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1#page-two";

function pageAt(before: string, after = before) {
  const waitFor = vi.fn().mockResolvedValue(undefined);
  const page = {
    url: vi.fn().mockReturnValueOnce(before).mockReturnValue(after),
    locator: vi.fn((selector: string) => {
      expect(selector).toBe('[data-studio-canvas-viewport]:visible');
      return { waitFor };
    }),
  };
  return { page: page as unknown as Page, waitFor };
}

describe("현재 원고에서 안료 작업 준비", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it.each(["ko", "en"])("화면 폭과 무관하게 %s 원고의 현재 캔버스를 그대로 사용한다", async language => {
    const { page, waitFor } = pageAt(manuscript.replace("#", `&lang=${language}#`));
    await waitForPigmentEditorSettled(page);
    expect(waitForEditorSettled).toHaveBeenCalledExactlyOnceWith(page);
    expect(waitFor).toHaveBeenCalledExactlyOnceWith({ state: "visible", timeout: 60_000 });
  });

  it.each([
    manuscript.replace("4173", "5173"),
    manuscript.replace("work-1", "work-2"),
    manuscript.replace("page-two", "page-one"),
    manuscript.replace("brush-1", "brush-2"),
    manuscript.replace("workspace=draw&", ""),
  ])("다른 작품이나 안료 문맥을 조용히 수용하지 않는다", async after => {
    await expect(waitForPigmentEditorSettled(pageAt(manuscript, after).page)).rejects.toThrow("안료 원고");
  });

  it("제품이 부가 쿼리를 붙여도 요청한 브러시와 페이지를 보존한다", async () => {
    await waitForPigmentEditorSettled(pageAt(manuscript, manuscript.replace("#", "&layout=full#")).page);
  });

  it("공용 준비 실패와 실제 캔버스 준비 실패를 각각 전파한다", async () => {
    const { page, waitFor } = pageAt(manuscript);
    const offline = new Error("저장·연결 상태 준비 실패");
    vi.mocked(waitForEditorSettled).mockRejectedValueOnce(offline);
    await expect(waitForPigmentEditorSettled(page)).rejects.toBe(offline);
    expect(waitFor).not.toHaveBeenCalled();
    const missingCanvas = new Error("캔버스 없음");
    waitFor.mockRejectedValueOnce(missingCanvas);
    await expect(waitForPigmentEditorSettled(page)).rejects.toBe(missingCanvas);
  });
});
