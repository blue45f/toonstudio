import { afterEach, describe, expect, it, vi } from "vitest";

// 다른 화면의 선행 등록 없이 첫 렌더·복구 안내와 지연 패널의 등록 순서를 확인한다.
afterEach(() => vi.resetModules());

describe("브러시·캔버스 사전 첫 로드", () => {
  it("본문을 받기 전에도 영어 복구 안내와 보간을 동기로 해석한다", async () => {
    vi.resetModules();
    const { DICT, useI18n } = await import("@/shared/lib/i18n");
    const { brushCanvasStatusText } = await import("./studio-brush-canvas-status-i18n-core");
    useI18n.setState({ lang: "en" });
    expect(brushCanvasStatusText("studio.brushCanvasStatus.canvas.gpuRetry", "한국어 폴백"))
      .toBe("Reopen canvas");
    const key = "studio.brushCanvasStatus.canvas.gpuKeptFrame";
    expect(brushCanvasStatusText(key, "한국어 폴백")).toBe(DICT.en[key]);
    expect(brushCanvasStatusText(key, "한국어 폴백")).not.toMatch(/[가-힣]/u);
    expect(DICT.en["studio.brushCanvasStatus.brushLab.connecting"]).toBeUndefined();
    expect(brushCanvasStatusText("studio.unknown", { count: 3 }, "항목 {count}개")).toBe("항목 3개");
    useI18n.setState({ lang: "ko" });
    expect(brushCanvasStatusText("studio.brushCanvasStatus.canvas.gpuRetry", "폴백"))
      .toBe("작업 화면 다시 열기");
  });

  it("패널 본문을 불러오면 나머지 영어 키도 등록하고 코어 안내를 보존한다", async () => {
    vi.resetModules();
    const { DICT, useI18n } = await import("@/shared/lib/i18n");
    const core = await import("./studio-brush-canvas-status-i18n-core");
    const before = DICT.en["studio.brushCanvasStatus.canvas.gpuKeptFrame"];
    const body = await import("../studio-brush-canvas-status-i18n");
    expect(body.brushCanvasStatusText).toBe(core.brushCanvasStatusText);
    expect(DICT.en["studio.brushCanvasStatus.canvas.gpuKeptFrame"]).toBe(before);
    useI18n.setState({ lang: "en" });
    const key = "studio.brushCanvasStatus.brushLab.connecting";
    expect(body.brushCanvasStatusText(key, "폴백")).toBe(DICT.en[key]);
    expect(body.brushCanvasStatusText(key, "폴백")).not.toMatch(/[가-힣]/u);
    expect(Object.keys(DICT.en).filter((key) => key.startsWith("studio.brushCanvasStatus.")))
      .toHaveLength(111);
  });
});
