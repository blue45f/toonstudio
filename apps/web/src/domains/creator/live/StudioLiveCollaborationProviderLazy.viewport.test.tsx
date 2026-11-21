// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as viewportInput from "../canvas/studio-canvas-viewport-input";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { StudioScopedWriteAuthorityContext } from "../studio-collab/studio-scoped-write-context";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "./studio-live-collaboration-context";
import { projectStudioLiveSyncSnapshot } from "./studio-live-sync-safety";

import type { StudioZoomGestureStep } from "../canvas/studio-zoom-gesture-engine";
import type { StudioLiveCollaborationProviderProps } from "./StudioLiveCollaborationProvider";

const creatorDirectory = resolve(process.cwd(), "apps/web/src/domains/creator");
const lazySource = readFileSync(resolve(creatorDirectory, "live/StudioLiveCollaborationProviderLazy.tsx"), "utf8");
const hostSource = readFileSync(resolve(creatorDirectory, "StudioCuttoonEditorHost.tsx"), "utf8");
type Props = StudioLiveCollaborationProviderProps;

function transpile(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
}

function actualViewportEffects(): string {
  const tree = ts.createSourceFile("Host.tsx", hostSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(tree) === "useEffect") {
      const source = node.getText(tree);
      if (source.includes("ro.observe(el)") || source.includes("const onPointerDownCapture =")
        || source.startsWith("useEffect(() => installStudioCanvasWheelInput(")
        || source.startsWith("useEffect(() => installStudioCanvasTouchInput(")) effects.push(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (effects.length !== 4) throw new Error("실제 Host의 scale·scroll·wheel·touch 설치 경계가 달라졌습니다.");
  return effects.join("\n");
}

const viewportEffects = actualViewportEffects();

function isProvider(value: unknown): value is React.ComponentType<Props> {
  return typeof value === "function";
}

function isHost(value: unknown): value is React.ComponentType<{ active?: boolean }> {
  return typeof value === "function";
}

interface ViewState {
  readonly scale: number;
  readonly wrapRef: { readonly current: HTMLDivElement | null };
}

function createFixture() {
  const observations: ControlledResizeObserver[] = [];
  class ControlledResizeObserver implements ResizeObserver {
    readonly targets = new Set<Element>();
    disconnected = false;
    constructor(private readonly callback: ResizeObserverCallback) { observations.push(this); }
    observe(node: Element) { this.targets.add(node); }
    unobserve(node: Element) { this.targets.delete(node); }
    disconnect() { this.disconnected = true; this.targets.clear(); }
    deliver() { if (!this.disconnected) this.callback([], this); }
  }
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  let width = 412;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.isConnected ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);

  let resolveRuntime: (module: { default: React.ComponentType<Props> }) => void = () => { throw new Error("지연 초기화 전 호출"); };
  const gate = new Promise<{ default: React.ComponentType<Props> }>((resolve) => { resolveRuntime = resolve; });
  const imports: Readonly<Record<string, unknown>> = {
    react: React,
    "@/shared/lib/lazy-retry": { lazyRetry: () => React.lazy(() => gate) },
    "../studio-collab/studio-scoped-write-context": { StudioScopedWriteAuthorityContext },
    "./studio-live-collaboration-context": { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext },
    "./studio-live-sync-safety": { projectStudioLiveSyncSnapshot },
  };
  const exports: Record<string, unknown> = {};
  new Function("exports", "require", "React", transpile(lazySource))(exports, (name: string) => {
    if (!(name in imports)) throw new Error(`등록하지 않은 테스트 import: ${name}`);
    return imports[name];
  }, React);
  const Provider = exports.StudioLiveCollaborationProviderLazy;
  if (!isProvider(Provider)) throw new Error("실제 지연 공급자 export가 없습니다.");
  const counts = { pointerCapture: 0, scrollUpdates: 0, revoked: 0, zoomSteps: 0, settled: 0 };
  const stepZoom: StudioZoomGestureStep = () => { counts.zoomSteps += 1; };
  const refs = {
    appSettingsRef: { current: defaultStudioAppSettings() },
    canvasPointerGestureIsOwned: () => false,
    canvasEditingGestureIsOwned: () => false,
    viewTransformSuppressedRef: { current: false },
    zoomLockedRef: { current: false },
    zoomRef: { current: 2 },
    zoomGestureRef: { current: null },
    touchViewPanActiveRef: { current: false },
    stepZoomGestureRef: { current: stepZoom },
    settleZoomGestureRef: { current: () => { counts.settled += 1; } },
    currentBrushSnapshotRef: { current: null },
    setStrokeWidth: () => { throw new Error("사용하지 않는 브러시 폭 fixture 경로"); },
    updateScrollPosRef: { current: () => { counts.scrollUpdates += 1; } },
    revokeStudioRasterHandoffRef: { current: () => { counts.revoked += 1; } },
    flushScrollViewportCommitRef: { current: () => { counts.pointerCapture += 1; } },
    scrollRafRef: { current: null },
  };
  let latest: ViewState | null = null;
  // Host는 Provider 바깥에 남는다. 실제 네 effect와 실제 입력 설치기를 실행하고,
  // 문서 렌더·줌 수학 대신 DOM 연결과 callback 전달만 관측한다.
  const host = `const {useEffect,useRef,useState}=React;
    const {${Object.keys(refs).join(",")}}=refs;
    const {installStudioCanvasWheelInput,installStudioCanvasTouchInput}=input;
    return function HostFixture({active=true}) {
      const wrapRef=useRef(null), [scale,setScale]=useState(1), studioViewDocumentWidthRef=useRef(720);
      const CANVAS_W=720,isFullscreen=false,maximized=false,mobileImmersive=false,canvasOnlyMode=false;
      ${viewportEffects}
      publish({scale,wrapRef});
      return React.createElement(Provider, {
        workId:active?"instant-fixture":null,
        participant:active?{displayName:"익명 게스트",role:"editor"}:null,
        currentPageId:"page-a",currentTool:"draw"
      },React.createElement("div",{ref:wrapRef,"data-testid":"viewport"}));
    };`;
  const candidate: unknown = new Function("React", "refs", "input", "Provider", "publish", transpile(host))(
    React, refs, viewportInput, Provider, (value: ViewState) => { latest = value; },
  );
  if (!isHost(candidate)) throw new Error("실제 Host effect fixture를 만들지 못했습니다.");
  const runtimeValue = { ...EMPTY_STUDIO_LIVE_CONTEXT };
  function Runtime({ children }: Props) {
    return <StudioLiveCollaborationContext.Provider value={runtimeValue}>{children}</StudioLiveCollaborationContext.Provider>;
  }
  return {
    Host: candidate, counts, refs, observations,
    resolveRuntime: () => resolveRuntime({ default: Runtime }),
    setWidth: (next: number) => { width = next; },
    get scale() { if (!latest) throw new Error("Host 준비 전 관측"); return latest.scale; },
    get node() { const node = latest?.wrapRef.current; if (!node) throw new Error("viewport가 없습니다."); return node; },
  };
}

function dispatchInput(node: HTMLElement) {
  node.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  node.dispatchEvent(new Event("scroll"));
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 10 });
  node.dispatchEvent(wheel);
  const touch = (type: string, separation: number | null) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: separation === null ? [] : [
      { identifier: 1, clientX: 10, clientY: 10 }, { identifier: 2, clientX: 10 + separation, clientY: 10 },
    ] });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  };
  touch("touchstart", 20);
  const touchHandled = touch("touchmove", 40);
  touch("touchend", null);
  return { wheelHandled: wheel.defaultPrevented, touchHandled };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("지연 공급자와 실제 Host viewport 설치 수명", () => {
  it.each([false, true])("runtime 준비 뒤 같은 DOM의 scale·입력·cleanup을 유지한다 StrictMode=%s", async (strictMode) => {
    const f = createFixture();
    const view = render(<f.Host />, { reactStrictMode: strictMode });
    const initial = f.node;
    const initialScale = 412 / 720;
    expect(f.scale).toBe(initialScale);
    expect(dispatchInput(initial)).toEqual({ wheelHandled: true, touchHandled: true });
    expect(f.counts).toEqual({ pointerCapture: 1, scrollUpdates: 1, revoked: 1, zoomSteps: 2, settled: 1 });
    await act(async () => { f.resolveRuntime(); });
    expect(f.node).toBe(initial);
    expect(initial.isConnected).toBe(true);
    expect(f.observations.filter((observer) => observer.targets.has(f.node))).toHaveLength(2);
    expect(dispatchInput(f.node)).toEqual({ wheelHandled: true, touchHandled: true });
    expect(f.counts).toEqual({ pointerCapture: 2, scrollUpdates: 2, revoked: 2, zoomSteps: 4, settled: 2 });
    act(() => { f.observations.forEach((observer) => observer.deliver()); });
    expect(f.scale).toBe(initialScale);
    expect(f.refs.zoomRef.current).toBe(2);

    f.setWidth(360);
    act(() => { f.observations.forEach((observer) => observer.deliver()); });
    expect(f.scale).toBe(0.5);
    expect(f.refs.zoomRef.current).toBe(2);
    f.setWidth(576);
    act(() => { globalThis.dispatchEvent(new Event("resize")); });
    expect(f.scale).toBe(0.8);
    expect(f.refs.zoomRef.current).toBe(2);

    view.unmount();
    const afterUnmount = { ...f.counts };
    expect(f.observations.every((observer) => observer.disconnected)).toBe(true);
    expect(dispatchInput(initial)).toEqual({ wheelHandled: false, touchHandled: false });
    globalThis.dispatchEvent(new Event("resize"));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(f.counts).toEqual(afterUnmount);
    expect(f.refs.touchViewPanActiveRef.current).toBe(false);
  });

  it("idle 원고에 이미 설치한 DOM 소유권을 활성화 이후에도 유지한다", async () => {
    const f = createFixture();
    const view = render(<f.Host active={false} />);
    const initial = f.node;
    view.rerender(<f.Host active />);
    await act(async () => { f.resolveRuntime(); });
    expect(f.node).toBe(initial);
    expect(f.scale).toBe(412 / 720);
    expect(dispatchInput(f.node)).toEqual({ wheelHandled: true, touchHandled: true });
    expect(f.counts.pointerCapture).toBe(1);
    expect(f.counts.scrollUpdates).toBe(1);
    view.rerender(<f.Host active={false} />);
    expect(f.node).toBe(initial);
    expect(dispatchInput(f.node)).toEqual({ wheelHandled: true, touchHandled: true });
    expect(f.counts.pointerCapture).toBe(2);
    expect(f.counts.scrollUpdates).toBe(2);
  });
});
