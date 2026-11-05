import { beforeEach, expect, it, vi } from "vitest";

import { materializeStudioBrushCatalogSelection, preloadStudioBrushCatalogSelection } from "./studio-brush-selection";

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn(() => Promise.resolve()) }));
vi.mock("./wet-paper/studio-dry-brush-live-host", () => ({ prewarmStudioDryBrushLiveHost: prepare }));

beforeEach(() => prepare.mockClear());

it("포인터·키보드 선택 의도에서 갈필의 지연 준비를 시작한다", async () => {
  await preloadStudioBrushCatalogSelection("ink-wash--dry-brush");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
});

it("직접 선택도 준비하되 완료를 기다리며 선택이나 입력을 막지 않는다", async () => {
  prepare.mockImplementationOnce(() => new Promise<void>(() => {}));
  const selection = await materializeStudioBrushCatalogSelection("ink-wash--dry-brush");
  expect(selection?.runtimeBrushId).toBe("ink-wash--dry-brush");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
});

it("다른 레인과 알 수 없는 선택에서는 갈필 런타임을 준비하지 않는다", async () => {
  await preloadStudioBrushCatalogSelection("pen");
  await materializeStudioBrushCatalogSelection("pen");
  await materializeStudioBrushCatalogSelection(null);
  expect(prepare).not.toHaveBeenCalled();
});
