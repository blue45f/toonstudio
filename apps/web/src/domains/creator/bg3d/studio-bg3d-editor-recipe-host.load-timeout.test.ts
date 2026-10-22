import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioBg3dEditorRecipeHost } from "./studio-bg3d-editor-recipe-run";

// 본문 모듈의 불러오기가 끝나지 않거나 늦게 끝나는 상황(멈춘 네트워크)을 만든다. 시험마다 새 모듈 레지스트리로 시작한다.
const gate = vi.hoisted(() => ({ load: new Promise<object>(() => {}), place: vi.fn() }));
vi.mock("./studio-bg3d-editor-recipe-run", () => gate.load);

async function setup() {
  vi.resetModules();
  let release!: () => void;
  gate.load = new Promise<object>((resolve) => {
    release = () => resolve({ placeStudioBg3dModelWithRecipe: gate.place });
  });
  const host = await import("./studio-bg3d-editor-recipe-host");
  const status = vi.fn();
  const target = { setSurfaceSnapStatus: status } as unknown as StudioBg3dEditorRecipeHost;
  host.attachStudioBg3dEditorRecipeHost(target);
  const press = () => target.placeCustomModelWithRecipe("model-1", "floor");
  return { host, status, press, release };
}

beforeEach(() => {
  gate.place.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("본문 불러오기가 끝나지 않을 때", () => {
  it("제한 시간(10초) 직전까지는 진행 중이고, 시간이 되면 못 불러온 것으로 보고 안내한 뒤 진행 중 표시를 푼다", async () => {
    const { host, status, press } = await setup();
    expect(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS).toBe(10_000);

    const first = press();
    // 불러오는 동안 또 누르면 두 번 시작하지 않고 진행 중이라고만 알린다.
    await expect(press()).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "info", message: host.STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE });

    await vi.advanceTimersByTimeAsync(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS - 1);
    await expect(press()).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "info", message: host.STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE });
    expect(status.mock.calls.some(([value]) => (value as { tone: string }).tone === "error")).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: host.STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE });
    expect(gate.place).not.toHaveBeenCalled();
    // 제한 시간 타이머는 남지 않는다.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("제한 시간이 지난 뒤에는 다시 누를 수 있고, 연달아 실패하면 새로고침을 먼저 안내한다", async () => {
    const { host, status, press } = await setup();
    const first = press();
    await vi.advanceTimersByTimeAsync(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS);
    await expect(first).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: host.STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE });

    // 버튼이 "이미 배치하는 중"에 갇히지 않는다: 다시 누르면 불러오기를 다시 기다린다.
    const second = press();
    await vi.advanceTimersByTimeAsync(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS);
    await expect(second).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: host.STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE });
    expect(host.STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE).toContain("페이지를 새로고침한 뒤 다시 눌러 주세요");
    expect(status.mock.calls.filter(([value]) => (value as { tone: string }).tone === "info")).toEqual([]);
  });

  it("제한 시간이 지난 뒤에라도 불러와지면 다음 누름은 곧바로 배치한다", async () => {
    const { host, status, press, release } = await setup();
    const first = press();
    await vi.advanceTimersByTimeAsync(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS);
    await expect(first).resolves.toBe(false);

    release();
    gate.place.mockResolvedValue(true);
    await expect(press()).resolves.toBe(true);
    expect(gate.place).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("제한 시간 안에 불러와지면 타이머를 남기지 않고 정상으로 배치한다", async () => {
    const { host, status, press, release } = await setup();
    gate.place.mockResolvedValue(true);
    const pending = press();
    await vi.advanceTimersByTimeAsync(host.STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS - 1_000);
    release();
    await expect(pending).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    // 이후 시간이 흘러도 실패로 바뀌지 않는다.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(status).not.toHaveBeenCalled();
  });
});
