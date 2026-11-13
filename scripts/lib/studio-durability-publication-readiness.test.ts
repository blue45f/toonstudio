// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readStudioDurabilityPublication,
  waitForStudioDurabilityPublication,
} from "./studio-durability-publication-readiness";

import type { Page } from "playwright";

function fixture({ now = 6_000, onWait, readCost = 0 }: {
  now?: number;
  onWait?: (count: number) => void;
  readCost?: number;
} = {}) {
  document.body.innerHTML = `<div data-studio-document-renderer="compatibility"
    data-studio-vello-hub-authority="starting" data-studio-konva-document-shadow="mounted">
    <div class="konvajs-content"><canvas data-studio-skia-document-surface="true"
      data-studio-skia-phase="rendering" data-studio-skia-cached-items="0"
      style="visibility:hidden;display:block;opacity:1"></canvas></div></div>`;
  const owner = document.querySelector<HTMLElement>("[data-studio-document-renderer]")!;
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const clock = { now };
  vi.spyOn(performance, "now").mockImplementation(() => clock.now);
  const evaluate = vi.fn(async (read: () => ReturnType<typeof readStudioDurabilityPublication>) => {
    const result = read(); clock.now += readCost; return result;
  });
  let waits = 0;
  const waitForTimeout = vi.fn(async (delay: number) => {
    clock.now += delay; onWait?.(++waits);
  });
  const page = { evaluate, waitForTimeout } as unknown as Page;
  const publish = () => {
    owner.dataset.studioVelloHubAuthority = "active";
    owner.dataset.studioDocumentRenderer = "skia-canvaskit-document-webgl2";
    owner.dataset.studioKonvaDocumentShadow = "unmounted";
    canvas.dataset.studioSkiaPhase = "presented";
    canvas.dataset.studioSkiaCachedItems = "2";
    canvas.style.visibility = "visible";
  };
  return { page, owner, canvas, clock, evaluate, waitForTimeout, publish };
}

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("원래 내구 복원 기한 안의 실제 문서 게시 준비", () => {
  it("초기 compatibility와 숨은 presented를 지나 실제 게시·노출까지 기다린다", async () => {
    const f = fixture({ onWait: (count) => {
      if (count === 1) { f.publish(); f.canvas.dataset.studioSkiaPhase = "rendering"; }
      if (count === 2) { f.canvas.dataset.studioSkiaPhase = "presented"; f.canvas.style.visibility = "hidden"; }
      if (count === 3) f.canvas.style.visibility = "visible";
    } });
    const result = await waitForStudioDurabilityPublication(f.page, 8_000);
    expect(result).toMatchObject({ authorityStatus: "active", documentRenderer: "skia-canvaskit-document-webgl2",
      skiaSurface: { visibility: "visible", phase: "presented", cachedItems: 2 } });
    expect(f.evaluate).toHaveBeenCalledTimes(4);
    expect(f.waitForTimeout.mock.calls).toEqual([[80], [80], [80]]);
    expect(f.clock.now).toBe(6_240);
  });

  it("terminal unavailable의 실제 compatibility shadow는 기존 정책대로 인정하고 DOM을 바꾸지 않는다", async () => {
    const f = fixture(); f.owner.dataset.studioVelloHubAuthority = "unavailable";
    const before = document.body.innerHTML;
    const result = await waitForStudioDurabilityPublication(f.page, 8_000);
    expect(result).toMatchObject({ authorityStatus: "unavailable", documentRenderer: "compatibility", konvaDocumentShadow: "mounted" });
    expect(f.waitForTimeout).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
  });

  it.each(["hidden", "rendering", "empty", "display-none", "opacity-zero", "missing-surface"])("%s 문서를 준비 완료로 받지 않는다", async (state) => {
    const f = fixture(); f.publish();
    if (state === "hidden") f.canvas.style.visibility = "hidden";
    if (state === "rendering") f.canvas.dataset.studioSkiaPhase = "rendering";
    if (state === "empty") f.canvas.dataset.studioSkiaCachedItems = "0";
    if (state === "display-none") f.canvas.style.display = "none";
    if (state === "opacity-zero") f.canvas.style.opacity = "0";
    if (state === "missing-surface") f.canvas.remove();
    await expect(waitForStudioDurabilityPublication(f.page, 6_160)).rejects.toThrow("원래 복원 기한");
    expect(f.clock.now).toBe(6_160);
  });

  it("초기 compatibility를 fallback으로 오인하거나 관측 때문에 renderer를 선택하지 않는다", async () => {
    const f = fixture(); const before = document.body.innerHTML;
    await expect(waitForStudioDurabilityPublication(f.page, 6_160)).rejects.toThrow('"authorityStatus":"starting"');
    expect(document.body.innerHTML).toBe(before);
  });

  it("기존 기한이 10ms 남았으면 10ms만 기다리고 새 8초를 시작하지 않는다", async () => {
    const f = fixture({ now: 7_990 });
    await expect(waitForStudioDurabilityPublication(f.page, 8_000)).rejects.toThrow("원래 복원 기한");
    expect(f.waitForTimeout.mock.calls).toEqual([[10]]); expect(f.evaluate).toHaveBeenCalledOnce();
    expect(f.clock.now).toBe(8_000);
  });

  it("이미 소진한 원래 기한에는 준비된 문서도 새로 관측하거나 받아들이지 않는다", async () => {
    const f = fixture({ now: 8_000 }); f.publish();
    await expect(waitForStudioDurabilityPublication(f.page, 8_000)).rejects.toThrow("원래 복원 기한");
    expect(f.evaluate).not.toHaveBeenCalled(); expect(f.waitForTimeout).not.toHaveBeenCalled();
  });

  it("관측 중 원기한을 넘긴 게시 결과도 실패한다", async () => {
    const f = fixture({ now: 7_990, readCost: 11 }); f.publish();
    await expect(waitForStudioDurabilityPublication(f.page, 8_000)).rejects.toThrow("원래 복원 기한");
    expect(f.evaluate).toHaveBeenCalledOnce(); expect(f.waitForTimeout).not.toHaveBeenCalled();
    expect(f.clock.now).toBe(8_001);
  });

  it("소유권·표면 관측 오류를 성공이나 fallback으로 숨기지 않는다", async () => {
    const f = fixture(), error = new Error("실제 페이지 연결 종료");
    f.evaluate.mockRejectedValueOnce(error);
    await expect(waitForStudioDurabilityPublication(f.page, 8_000)).rejects.toBe(error);
    expect(f.waitForTimeout).not.toHaveBeenCalled();
  });

  it.each([Infinity, NaN])("유한한 기존 기한 없이 기다리지 않는다: %s", async (deadline) => {
    const f = fixture();
    await expect(waitForStudioDurabilityPublication(f.page, deadline)).rejects.toThrow("기존 유한 기한");
    expect(f.evaluate).not.toHaveBeenCalled();
  });

  it("최종 촬영만 기존 절대 recoveryDeadline으로 준비시키고 동일성·두 획 비교를 유지한다", () => {
    const source = readFileSync(resolve(__dirname, "../verify-studio-brushes.mts"), "utf8");
    const start = source.indexOf("const recoveryDeadline = performance.now() + 8_000;");
    const ready = source.indexOf("waitForStudioDurabilityPublication(page, recoveryDeadline)", start);
    const capture = source.indexOf('viewportAudit.capture(inkRoi, "restored")', ready);
    expect(start).toBeGreaterThan(0); expect(ready).toBeGreaterThan(start); expect(capture).toBeGreaterThan(ready);
    expect(source.slice(ready, capture)).not.toContain("performance.now() +");
    expect(source.slice(capture)).toContain("!afterReceiptStroke.equals(restored)");
    const viewportSource = readFileSync(resolve(__dirname, "./studio-durability-viewport.ts"), "utf8");
    expect(viewportSource).toContain("JSON.stringify(before) !== JSON.stringify(after)");
    expect(viewportSource).toContain('if (deadline !== undefined) return null;');
    expect(viewportSource).toContain('throw new Error("내구 복원 촬영 중 실제 뷰포트가 바뀌었습니다.');
  });
});
