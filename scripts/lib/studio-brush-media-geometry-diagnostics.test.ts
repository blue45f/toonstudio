// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBrushMediaGeometryDiagnostics, installStudioBrushMediaGeometryProbe, summarizeStudioBrushMediaDraws,
} from "./studio-brush-media-geometry-diagnostics";
import { readDurableStudioAutosaveDocument } from "./studio-verify-durable-autosave.mjs";

import type { StudioDurableAutosaveDocument } from "./studio-verify-durable-autosave.mjs";
import type { Page } from "playwright";

vi.mock("./studio-verify-durable-autosave.mjs", () => ({ readDurableStudioAutosaveDocument: vi.fn() }));

interface ObservedChrome {
  key: string; tag: string; className: string; rect: { y: number; height: number } | null;
  states: Record<string, string>; childElementCount: number;
  style: { display: string; lineHeight: string; fontSize: string; paddingTop: string; paddingBottom: string; whiteSpace: string } | null;
}
type Probe = NonNullable<(Window & { __studioBrushMediaGeometry?: {
  evidence: { frames: Array<{ label: string; stage: { y: number } | null; transform: number[] | null;
      chrome: ObservedChrome[]; chromeTruncated: boolean }>;
    pointers: Array<{ x: number; y: number; trusted: boolean }>; route: Array<{ x: number; y: number }>;
    truncated: boolean; stopped: boolean; frameReads: number };
  arm(points: Array<{ x: number; y: number }>): void; stop(): void;
} })["__studioBrushMediaGeometry"]>;
const currentProbe = () => (window as Window & { __studioBrushMediaGeometry?: Probe }).__studioBrushMediaGeometry!;

function fixture() {
  document.body.innerHTML = '<div id="studio-workspace"><div data-studio-canvas-viewport><div id="container"><div class="konvajs-content"><canvas></canvas></div></div></div></div><button id="outside">선택</button>';
  const content = document.querySelector<HTMLElement>(".konvajs-content")!;
  const canvas = content.querySelector("canvas")!;
  let y = 100, nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const bounds = () => new DOMRect(200, y, 600, 800);
  vi.spyOn(content, "getBoundingClientRect").mockImplementation(bounds);
  vi.spyOn(content, "getClientRects").mockImplementation(() => [bounds()] as unknown as DOMRectList);
  Object.defineProperty(content, "clientWidth", { configurable: true, value: 600 });
  Object.defineProperty(content, "clientHeight", { configurable: true, value: 800 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  Object.defineProperty(window, "Konva", { configurable: true, value: { stages: [{
    container: () => document.getElementById("container"),
    getAbsoluteTransform: () => ({ getMatrix: () => [2, 0, 0, 2, 10, 20] }),
  }] } });
  const event = (kind: string, x: number, pointY: number, target: Element = canvas) => {
    const value = new Event(kind, { bubbles: true, cancelable: true });
    Object.defineProperties(value, { pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: pointY }, buttons: { value: kind === "pointerup" ? 0 : 1 } });
    target.dispatchEvent(value); return value;
  };
  return { content, event, moveStage: (value: number) => { y = value; }, frame: () => {
    const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(0);
  } };
}

afterEach(() => {
  currentProbe()?.stop();
  delete (window as Window & { __studioBrushMediaGeometry?: Probe }).__studioBrushMediaGeometry;
  document.documentElement.removeAttribute("data-service-capability-state");
  Reflect.deleteProperty(window, "Konva"); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();
});

describe("첫 획 좌표의 수동 관측", () => {
  it("catalog UI 클릭을 제외하고 첫 캔버스 입력과 실제 12px layout 이동을 기록한다", () => {
    const f = fixture(); installStudioBrushMediaGeometryProbe();
    const probe = currentProbe(), route = [{ x: 250, y: 300 }, { x: 500, y: 350 }];
    probe.arm(route);
    f.event("pointerdown", 20, 20, document.getElementById("outside")!);
    expect(probe.evidence.pointers).toEqual([]);
    const down = f.event("pointerdown", 250, 300);
    f.moveStage(112); f.frame(); f.event("pointermove", 400, 330); f.event("pointerup", 500, 350);
    probe.stop();
    expect(down.defaultPrevented).toBe(false);
    expect(probe.evidence.route).toEqual(route);
    expect(probe.evidence.pointers.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 250, y: 300 }, { x: 400, y: 330 }, { x: 500, y: 350 }]);
    expect(probe.evidence.frames.map(frame => frame.stage?.y)).toContain(100);
    expect(probe.evidence.frames.map(frame => frame.stage?.y)).toContain(112);
    expect(probe.evidence.frames.every(frame => frame.transform?.join() === "2,0,0,2,10,20")).toBe(true);
    const count = probe.evidence.pointers.length; f.event("pointerdown", 250, 300); f.event("pointerup", 500, 350);
    expect(probe.evidence.pointers).toHaveLength(count);
  });

  it("상단 상태 UI만 변해도 새 frame에 높이·줄 수 단서를 기록하고 문구·사용자 속성은 제외한다", () => {
    const f = fixture(), workspace = document.getElementById("studio-workspace")!;
    const shell = document.createElement("main");
    shell.setAttribute("data-studio-app-shell", "true"); shell.setAttribute("data-studio-drawing-clarity", "true");
    shell.innerHTML = '<header id="studio-menubar" class="studio-drawing-clarity-header" data-state="open"><div class="studio-drawing-clarity-title"><h1 title="private-title">private-title</h1><div data-studio-document-chrome-slot><div data-studio-save-status-chrome-mount><div data-studio-save-sync-status-center><button data-studio-drawing-save-summary="true" data-studio-local-save-state="saved" data-studio-save-matched-page-id="private-id" data-studio-save-matched-page-label="private-label" aria-label="private-label" style="display:inline-flex;line-height:12px;font-size:12px;padding-top:4px;padding-bottom:4px;white-space:normal"><span>private-save-text<span data-studio-connection-notice-summary></span></span></button></div></div></div></div></header>';
    document.body.insertBefore(shell, workspace); shell.append(workspace);
    const upstream = document.createElement("aside"); upstream.className = "upstream-notice";
    upstream.setAttribute("data-state", "private-state"); upstream.textContent = "private-upstream-text";
    document.body.insertBefore(upstream, shell);
    const header = document.getElementById("studio-menubar")!, button = shell.querySelector("button")!;
    const notice = shell.querySelector<HTMLElement>("[data-studio-connection-notice-summary]")!;
    let headerHeight = 48, summaryHeight = 32, noticeHeight = 0;
    vi.spyOn(header, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 1000, headerHeight));
    vi.spyOn(button, "getBoundingClientRect").mockImplementation(() => new DOMRect(20, 8, 200, summaryHeight));
    vi.spyOn(notice, "getBoundingClientRect").mockImplementation(() => new DOMRect(20, 28, 200, noticeHeight));
    document.documentElement.setAttribute("data-service-capability-state", "unknown");
    const originalDom = document.body.innerHTML;
    installStudioBrushMediaGeometryProbe(); const probe = currentProbe();
    probe.arm([{ x: 250, y: 300 }]); f.event("pointerdown", 250, 300);
    expect(document.body.innerHTML).toBe(originalDom);
    const baselineCount = probe.evidence.frames.length; f.frame();
    expect(probe.evidence.frames).toHaveLength(baselineCount);
    headerHeight = 60; summaryHeight = 44; noticeHeight = 12;
    button.setAttribute("data-studio-local-save-state", "pending");
    notice.innerHTML = '<span data-service-status-placement="editor-summary" data-service-degraded-banner="degraded">private-notice-text</span>';
    document.documentElement.setAttribute("data-service-capability-state", "degraded");
    const changedDom = document.body.innerHTML; f.frame();
    expect(probe.evidence.frames).toHaveLength(baselineCount + 1);
    const changed = probe.evidence.frames.at(-1)!;
    expect(changed.stage?.y).toBe(100);
    expect(changed.chrome.find(node => node.key === "menubar:0")).toMatchObject({ tag: "header", rect: { height: 60 }, states: { "data-state": "open" } });
    expect(changed.chrome.find(node => node.key === "save-summary:0")).toMatchObject({ rect: { height: 44 }, states: { "data-studio-local-save-state": "pending" },
      style: { display: "inline-flex", lineHeight: "12px", fontSize: "12px", paddingTop: "4px", paddingBottom: "4px", whiteSpace: "normal" } });
    expect(changed.chrome.find(node => node.key === "notice-summary:0")).toMatchObject({ rect: { height: 12 }, childElementCount: 1 });
    expect(changed.chrome.find(node => node.key === "document:0")?.states).toEqual({ "data-service-capability-state": "degraded" });
    expect(changed.chrome.find(node => node.key === "workspace-preceding:1:0")).toMatchObject({ tag: "aside", className: "upstream-notice", states: {} });
    f.moveStage(112); f.frame(); probe.stop();
    expect(probe.evidence.frames.at(-1)?.stage?.y).toBe(112);
    expect(document.body.innerHTML).toBe(changedDom);
    expect(JSON.stringify(probe.evidence)).not.toMatch(/private-|matched-page|aria-label/);
  });

  it("크기가 같아도 알림 자식 추가를 기록하고 조상·형제가 많아도 chrome 관측을 제한한다", () => {
    const f = fixture(), workspace = document.getElementById("studio-workspace")!;
    const notice = document.createElement("span"); notice.setAttribute("data-studio-connection-notice-summary", "true");
    document.body.insertBefore(notice, workspace);
    let branch: Element = workspace;
    for (let depth = 0; depth < 8; depth += 1) {
      const wrapper = document.createElement("div"); branch.before(wrapper);
      for (let index = 0; index < 20; index += 1) wrapper.append(document.createElement("aside"));
      wrapper.append(branch); branch = wrapper;
    }
    installStudioBrushMediaGeometryProbe(); const probe = currentProbe();
    probe.arm([{ x: 250, y: 300 }]); f.event("pointerdown", 250, 300);
    const count = probe.evidence.frames.length; notice.append(document.createElement("span")); f.frame();
    expect(probe.evidence.frames).toHaveLength(count + 1);
    expect(probe.evidence.frames.at(-1)?.chrome.find(node => node.key === "notice-summary:0")?.childElementCount).toBe(1);
    expect(probe.evidence.frames.every(frame => frame.chrome.length <= 40 && frame.chromeTruncated)).toBe(true);
    expect(probe.evidence.truncated).toBe(true);
  });

  it("입력이 과도해도 관측은 상한에 멈추고 truncation을 숨기지 않는다", () => {
    const f = fixture(); installStudioBrushMediaGeometryProbe(); const probe = currentProbe();
    probe.arm([{ x: 250, y: 300 }]); f.event("pointerdown", 250, 300);
    for (let index = 0; index < 700; index += 1) { f.moveStage(100 + index); f.frame(); f.event("pointermove", 250 + index, 300); }
    expect(probe.evidence.frames.length).toBeLessThanOrEqual(240);
    expect(probe.evidence.pointers.length).toBeLessThanOrEqual(256);
    expect(probe.evidence.truncated).toBe(true);
    expect(probe.evidence.stopped).toBe(true);
  });

  it("동일 페이지에서 재설치하면 이전 관측기를 제거한다", () => {
    const f = fixture(); installStudioBrushMediaGeometryProbe(); const old = currentProbe(); old.arm([]);
    installStudioBrushMediaGeometryProbe(); const next = currentProbe(); next.arm([]);
    f.event("pointerdown", 250, 300); f.event("pointerup", 300, 310);
    expect(old.evidence.stopped).toBe(true); expect(old.evidence.pointers).toEqual([]);
    expect(next.evidence.pointers).toHaveLength(2);
  });
});

function durable(elements: unknown[]): StudioDurableAutosaveDocument {
  return { key: "fixture", raw: "not exported", savedAt: "2026-11-17T00:00:00Z", currentPageId: "page", pagesList: [{ id: "page", elements }] };
}

describe("측정 후 저장 좌표 보존", () => {
  it("draw 좌표만 저장하며 텍스트·URL·전체 payload를 제외한다", () => {
    const result = summarizeStudioBrushMediaDraws(durable([
      { type: "text", text: "private fixture text" }, { type: "image", src: "fixture image URL" },
      { type: "draw", id: "stroke-1", x: 3, y: 4, scaleX: 2, scaleY: 2, points: [1, 2, 4, 5], name: "not exported", arbitrary: "not exported" },
    ]));
    expect(result).toMatchObject({ status: "available", drawCount: 1, draws: [{ id: "stroke-1", x: 3, y: 4, pointCount: 2, points: [1, 2, 4, 5] }] });
    expect(JSON.stringify(result)).not.toMatch(/private|fixture image|not exported|arbitrary/);
    expect(summarizeStudioBrushMediaDraws(null)).toMatchObject({ status: "unavailable" });
  });

  it("저장 좌표·draw 수도 제한하고 비정상 숫자는 원시 payload로 출력하지 않는다", () => {
    const result = summarizeStudioBrushMediaDraws(durable(Array.from({ length: 5 }, () => ({ type: "draw", x: Number.NaN, points: [...Array.from({ length: 600 }, (_, i) => i), Infinity] }))));
    expect(result).toMatchObject({ drawCount: 5, draws: [{ pointCount: 300, truncated: true }, {}, {}] });
    if (!result.draws) throw new Error("draw summary missing");
    expect(result.draws).toHaveLength(3); expect(result.draws[0]?.points).toHaveLength(512);
    expect(result.draws[0]).not.toHaveProperty("x");
  });

  it("실제 픽셀 측정 전에는 durable read를 하지 않고 save에서만 한 번 읽는다", async () => {
    fixture();
    const directory = mkdtempSync(join(tmpdir(), "studio-media-geometry-test-"));
    const page = { evaluate: async (callback: (arg?: unknown) => unknown, arg?: unknown) => callback(arg) } as unknown as Page;
    vi.mocked(readDurableStudioAutosaveDocument).mockResolvedValue(durable([{ type: "draw", id: "stroke", points: [1, 2] }]));
    try {
      const diagnostic = createStudioBrushMediaGeometryDiagnostics(page, "pencil-grain", directory);
      await diagnostic.install(); await diagnostic.arm([{ x: 250, y: 300 }]); await diagnostic.stop();
      expect(readDurableStudioAutosaveDocument).not.toHaveBeenCalled();
      await diagnostic.save();
      expect(readDurableStudioAutosaveDocument).toHaveBeenCalledTimes(1);
      const saved = JSON.parse(readFileSync(join(directory, "studio-brush-media-pencil-grain-geometry.json"), "utf8"));
      expect(saved).toMatchObject({ id: "pencil-grain", observation: { scope: "first-stroke-observation-only", stopped: true }, stored: { status: "available", drawCount: 1 } });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
