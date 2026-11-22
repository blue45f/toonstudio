// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";
import { canParticipantEdit, StudioScopedWriteAuthorityContext } from "../studio-collab/studio-scoped-write-context";
import { StudioLiveRoom } from "./studio-live-collaboration-room";
import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
  type StudioLiveRecoveryState,
} from "./studio-live-collaboration-context";
import { projectStudioLiveSyncSnapshot } from "./studio-live-sync-safety";
import type { StudioLiveCollaborationProviderProps } from "./StudioLiveCollaborationProvider";

type Props = StudioLiveCollaborationProviderProps;
type ContextValue = StudioLiveCollaborationContextValue;
const sourceDirectory = resolve(process.cwd(), "apps/web/src/domains/creator/live");
const lazySource = readFileSync(resolve(sourceDirectory, "StudioLiveCollaborationProviderLazy.tsx"), "utf8");
const providerSource = readFileSync(resolve(sourceDirectory, "StudioLiveCollaborationProvider.tsx"), "utf8");

function executeModule(source: string, imports: Readonly<Record<string, unknown>>) {
  const exports: Record<string, unknown> = {};
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  new Function("exports", "require", "React", output)(exports, (name: string) => {
    if (!(name in imports)) throw new Error(`등록하지 않은 테스트 import: ${name}`);
    return imports[name];
  }, React);
  return exports;
}

function isProvider(value: unknown): value is React.ComponentType<Props> {
  return typeof value === "function";
}

function compileLazyProvider() {
  let resolve: (value: { default: React.ComponentType<Props> }) => void = () => { throw new Error("지연 초기화 전 호출"); };
  let reject: (reason: Error) => void = () => { throw new Error("지연 초기화 전 호출"); };
  const gate = new Promise<{ default: React.ComponentType<Props> }>((accept, fail) => { resolve = accept; reject = fail; });
  const loader = vi.fn(() => gate);
  const exports = executeModule(lazySource, {
    react: React,
    "@/shared/lib/lazy-retry": { lazyRetry: () => React.lazy(loader) },
    "../studio-collab/studio-scoped-write-context": { StudioScopedWriteAuthorityContext },
    "./studio-live-collaboration-context": { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext },
    "./studio-live-sync-safety": { projectStudioLiveSyncSnapshot },
  });
  const Provider = exports.StudioLiveCollaborationProviderLazy;
  if (!isProvider(Provider)) throw new Error("실제 지연 공급자 export가 없습니다.");
  return { Provider, resolve, reject, loader };
}

function actualProviderEffects() {
  const tree = ts.createSourceFile("Provider.tsx", providerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const resets: ts.CallExpression[] = [];
  const policies: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") {
      const callback = node.arguments[0];
      if (callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)) {
        const source = callback.body.getText(tree);
        if (source.includes("const latchedRecoveryBoundary =")) resets.push(node);
        if (source.includes("const observed = observedTransportPolicyRef.current;")) policies.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (resets.length !== 1 || policies.length !== 1) throw new Error("실제 Provider 정책·세대 초기화가 모호합니다.");
  const reset = resets[0], policy = policies[0];
  const resetCallback = reset?.arguments[0], policyCallback = policy?.arguments[0];
  const resetDependencies = reset?.arguments[1], policyDependencies = policy?.arguments[1];
  if (!resetCallback || !ts.isArrowFunction(resetCallback) || !ts.isBlock(resetCallback.body)
    || !policyCallback || !ts.isArrowFunction(policyCallback) || !ts.isBlock(policyCallback.body)
    || !resetDependencies || !ts.isArrayLiteralExpression(resetDependencies)
    || !policyDependencies || !ts.isArrayLiteralExpression(policyDependencies)) {
    throw new Error("실제 Provider 정책·reset 본문과 의존성 배열이 필요합니다.");
  }
  const block = resetCallback.body;
  const end = block.statements.findIndex((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === "disposeSession"));
  if (end < 0) throw new Error("비동기 transport 시작 경계를 찾지 못했습니다.");
  // 실제 순서와 의존성 배열을 유지한다. 정책 state 갱신을 reset과 한 단계로 합치지 않는다.
  // 네트워크 앞의 reset·복구/철회 latch·지원 불가 분기까지만 그대로 실행한다.
  const prefix = block.statements.slice(0, end).map((statement) => statement.getText(tree)).join("\n");
  const names = ["recoveryBoundaryRef", "revocationBoundaryRef", "recoveryBoundaryScopeKey", "setRoom", "setPeers", "setLocks",
    "setChatMessages", "setError", "setLocalFallbackAllowed", "setSyncTelemetry", "setOperationSyncReady",
    "onAuthoritativeSaveBarrierChange", "onCrdtDocumentChange", "setAvailability", "setMode", "setTerminalTransportState",
    "setRecovery", "onRoomChange", "transportPreference", "outboxScope", "workId", "participantName", "participantRole",
    "transportFactory", "isStudioLocalLiveTransportSupported", "frozenStatus3Text",
    "observedTransportPolicyRef", "serverRequired", "setTransportPreference", "openOfflineSession",
    "participantCanEdit", "scopedWrite", "ephemeralOnly", "transportRetryKey"];
  const code = ts.transpileModule(`const {useEffect} = React;
    const {${names.join(",")}} = frame;
    useEffect(() => ${policyCallback.body.getText(tree)}, ${policyDependencies.getText(tree)});
    useEffect(() => {${prefix}}, ${resetDependencies.getText(tree)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const program = new Function("React", "frame", code);
  return (frame: Readonly<Record<string, unknown>>): void => { program(React, frame); };
}

const useEffectsFromActualProvider = actualProviderEffects();

function runtimeFixture() {
  const rendered = vi.fn();
  const transportCommits: { serverRequired: boolean; preference: "server" | "local" }[] = [];
  const control = {
    get renders() { return rendered.mock.calls.length; },
    mounts: 0, unmounts: 0,
    props: null as Props | null,
    value: null as ContextValue | null,
    transportCommits,
    update: (_patch: Partial<ContextValue>): void => { throw new Error("runtime 준비 전 갱신"); },
    latch: (_recovery: StudioLiveRecoveryState): void => { throw new Error("runtime 준비 전 latch"); },
  };
  function Runtime(props: Props) {
    rendered();
    const [snapshot, setSnapshot] = React.useState<ContextValue>(EMPTY_STUDIO_LIVE_CONTEXT);
    const [transportPreference, setTransportPreference] = React.useState<"server" | "local">(
      props.serverRequired ? "server" : "local",
    );
    const observedTransportPolicyRef = React.useRef({
      transportFactory: props.transportFactory, serverRequired: props.serverRequired === true,
    });
    const scopedWrite = React.useContext(StudioScopedWriteAuthorityContext);
    const openOfflineSession = React.useCallback(() => undefined, []);
    const recoveryBoundaryRef = React.useRef<{ scopeKey: string; recovery: StudioLiveRecoveryState } | null>(null);
    const revocationBoundaryRef = React.useRef(null);
    const scopeKey = props.workId ? JSON.stringify([props.outboxScope || null, props.workId]) : null;
    const field = React.useCallback(<K extends keyof ContextValue>(key: K) => (value: ContextValue[K]) => {
      setSnapshot((current) => ({ ...current, [key]: value }));
    }, []);
    React.useEffect(() => {
      control.mounts += 1;
      return () => { control.unmounts += 1; };
    }, []);
    useEffectsFromActualProvider({
      observedTransportPolicyRef, setTransportPreference,
      serverRequired: props.serverRequired === true, openOfflineSession, scopedWrite,
      participantCanEdit: canParticipantEdit(props.participant?.role ?? null),
      ephemeralOnly: props.ephemeralOnly === true, transportRetryKey: 0,
      recoveryBoundaryRef, revocationBoundaryRef, recoveryBoundaryScopeKey: scopeKey,
      setRoom: field("room"), setPeers: field("peers"), setLocks: field("locks"), setChatMessages: field("chatMessages"),
      setError: field("error"), setLocalFallbackAllowed: field("localFallbackAllowed"),
      setAvailability: field("availability"), setMode: field("mode"), setRecovery: field("recovery"),
      setSyncTelemetry: () => undefined, setOperationSyncReady: () => undefined, setTerminalTransportState: () => undefined,
      onAuthoritativeSaveBarrierChange: props.onAuthoritativeSaveBarrierChange,
      onCrdtDocumentChange: props.onCrdtDocumentChange, onRoomChange: props.onRoomChange,
      transportPreference,
      outboxScope: props.outboxScope ?? null, workId: props.workId,
      participantName: props.participant?.displayName ?? null, participantRole: props.participant?.role ?? null,
      transportFactory: props.transportFactory, isStudioLocalLiveTransportSupported: () => false,
      frozenStatus3Text: (_key: string, fallback: string) => fallback,
    });
    // 실제 Provider처럼 매 render 새 context object를 만든다. 잘못된 Relay는 여기서 반복된다.
    const value = { ...snapshot,
      serverAvailable: props.transportFactory !== undefined,
      usingLocalFallback: props.transportFactory !== undefined && transportPreference === "local",
    };
    React.useLayoutEffect(() => {
      control.props = props;
      control.value = value;
      transportCommits.push({ serverRequired: props.serverRequired === true, preference: transportPreference });
      control.update = (patch) => setSnapshot((current) => ({ ...current, ...patch }));
      control.latch = (recovery) => {
        if (!scopeKey) throw new Error("복구 scope가 없습니다.");
        recoveryBoundaryRef.current = { scopeKey, recovery };
        setSnapshot((current) => ({ ...current, recovery, availability: "error" }));
      };
    });
    return <StudioLiveCollaborationContext.Provider value={value}>
      {props.children}
      {props.showHuddleLauncher !== false && props.workId && props.participant ? <aside data-testid="huddle" /> : null}
    </StudioLiveCollaborationContext.Provider>;
  }
  return { Runtime, control };
}

function baseProps(): Omit<Props, "children"> {
  return { workId: "work-a", participant: { displayName: "익명 게스트", role: "editor" },
    currentPageId: "page-a", currentTool: "draw", outboxScope: "owner-a" };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("지연 협업 공급자의 안정적인 context 전달", () => {
  it("idle 최초 render와 SSR에서 기존 transport·scoped-write 값을 즉시 제공한다", () => {
    const { Provider, loader } = compileLazyProvider();
    const authority = createStudioScopedWriteFixture().authority;
    const transportFactory = () => { throw new Error("유휴 render가 transport를 열면 안 됩니다."); };
    const seen: ContextValue[] = [];
    function Read() {
      seen.push(React.useContext(StudioLiveCollaborationContext));
      return <span>원고</span>;
    }
    const result = renderToString(<StudioScopedWriteAuthorityContext.Provider value={authority}>
      <Provider {...baseProps()} workId={null} participant={null} transportFactory={transportFactory}><Read /></Provider>
    </StudioScopedWriteAuthorityContext.Provider>);
    expect(result).toContain("원고");
    expect(loader).not.toHaveBeenCalled();
    expect(seen[0]).toMatchObject({ availability: "idle", serverAvailable: true, localFallbackAllowed: true, usingLocalFallback: true });
    expect(seen[0]?.sync).toEqual(projectStudioLiveSyncSnapshot({
      availability: "idle", mode: null, canEdit: false, scopedWrite: true,
      telemetry: null, operationSyncReady: false, terminalTransportState: null, transportMessage: null,
    }));
  });

  it.each([false, true])("빠른 원고 DOM과 정확한 context를 유지하며 전달 루프를 만들지 않는다 StrictMode=%s", async (strictMode) => {
    const f = compileLazyProvider(), r = runtimeFixture();
    const seen: ContextValue[] = [];
    function Read() {
      const value = React.useContext(StudioLiveCollaborationContext);
      React.useLayoutEffect(() => { seen.push(value); });
      return <input data-testid="editor" defaultValue="작성 중" />;
    }
    const props = baseProps();
    const view = render(<f.Provider {...props}><Read /></f.Provider>, { reactStrictMode: strictMode });
    const editor = view.getByTestId("editor");
    editor.focus();
    expect(f.loader).toHaveBeenCalledTimes(1);
    await act(async () => { f.resolve({ default: r.Runtime }); });
    expect(view.getByTestId("editor")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(seen.at(-1)).toBe(r.control.value);
    expect(r.control.renders).toBeLessThan(10);
    expect(view.getByTestId("huddle")).toBeTruthy();
    const before = r.control.renders;
    await act(async () => { r.control.update({ error: "독립 runtime 갱신" }); });
    expect(r.control.renders - before).toBe(strictMode ? 2 : 1);
    expect(seen.at(-1)).toBe(r.control.value);
    expect(seen.at(-1)?.error).toBe("독립 runtime 갱신");
    view.rerender(<f.Provider {...props}><Read /></f.Provider>);
    expect(r.control.renders).toBe(before + (strictMode ? 2 : 1));
    view.unmount();
    expect(r.control.unmounts).toBe(r.control.mounts);
  });

  it("idle→active→참여자 없음에서도 원고 DOM과 이미 활성화된 runtime 인스턴스를 유지한다", async () => {
    const f = compileLazyProvider(), r = runtimeFixture();
    const props = baseProps();
    const view = render(<f.Provider {...props} workId={null} participant={null}><input data-testid="editor" /></f.Provider>);
    const editor = view.getByTestId("editor");
    expect(f.loader).not.toHaveBeenCalled();
    view.rerender(<f.Provider {...props}><input data-testid="editor" /></f.Provider>);
    await act(async () => { f.resolve({ default: r.Runtime }); });
    expect(view.getByTestId("editor")).toBe(editor);
    expect(r.control.mounts).toBe(1);
    view.rerender(<f.Provider {...props} workId={null} participant={null}><input data-testid="editor" /></f.Provider>);
    expect(view.getByTestId("editor")).toBe(editor);
    expect(r.control.mounts).toBe(1);
    expect(r.control.unmounts).toBe(0);
    expect(r.control.props).toMatchObject({ workId: null, participant: null });
  });

  it.each(["work", "outbox", "role"] as const)("실제 Provider reset 뒤에만 %s 변경의 context를 발행한다", async (change) => {
    const f = compileLazyProvider(), r = runtimeFixture(), order: string[] = [];
    const props = { ...baseProps(), onRoomChange: () => { order.push("room"); },
      onCrdtDocumentChange: () => { order.push("crdt"); },
      onAuthoritativeSaveBarrierChange: () => { order.push("barrier"); } };
    const commits: { label: string; value: ContextValue }[] = [];
    function Read({ label }: { label: string }) {
      const value = React.useContext(StudioLiveCollaborationContext);
      React.useLayoutEffect(() => { commits.push({ label, value }); });
      return <div data-testid="editor" />;
    }
    const view = render(<f.Provider {...props}><Read label="before" /></f.Provider>);
    await act(async () => { f.resolve({ default: r.Runtime }); });
    const room = new StudioLiveRoom({ workId: "work-a", participant: { sessionId: "fixture", displayName: "익명 게스트", role: "editor" } });
    const recovery = { vaultId: "vault-a", updateCount: 1, exportAvailable: true, exported: false, message: "복구 필요" };
    await act(async () => { r.control.update({ room }); r.control.latch(recovery); });
    expect(commits.at(-1)?.value).toMatchObject({ room, recovery });
    order.length = 0;
    const next: Omit<Props, "children"> = change === "work" ? { ...props, workId: "work-b" }
      : change === "outbox" ? { ...props, outboxScope: "owner-b" }
        : { ...props, participant: { displayName: "익명 게스트", role: "viewer" } };
    view.rerender(<f.Provider {...next}><Read label="after" /></f.Provider>);
    const after = commits.filter(({ label }) => label === "after");
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(({ value }) => value.room !== room)).toBe(true);
    if (change !== "role") expect(after.every(({ value }) => value.recovery !== recovery)).toBe(true);
    else expect(after.at(-1)?.value.recovery).toBe(recovery);
    expect(order).toEqual(["barrier", "crdt", "room"]);
    expect(after.at(-1)?.value).toBe(r.control.value);
    expect(r.control.mounts).toBe(1);
    expect(r.control.unmounts).toBe(0);
  });

  it.each([false, true])("같은 factory의 서버 필수 전환은 어느 consumer commit에도 이전 room을 노출하지 않는다 StrictMode=%s", async (strictMode) => {
    const f = compileLazyProvider(), r = runtimeFixture();
    const transportFactory = vi.fn(() => { throw new Error("정책 경계 검증에서 네트워크를 열면 안 됩니다."); });
    const props = { ...baseProps(), transportFactory, serverRequired: false };
    const commits: { label: string; value: ContextValue }[] = [];
    function Read({ label }: { label: string }) {
      const value = React.useContext(StudioLiveCollaborationContext);
      React.useLayoutEffect(() => { commits.push({ label, value }); });
      return <div data-testid="editor" />;
    }
    const view = render(<f.Provider {...props}><Read label="local" /></f.Provider>, { reactStrictMode: strictMode });
    await act(async () => { f.resolve({ default: r.Runtime }); });
    const room = new StudioLiveRoom({ workId: "work-a", participant: { sessionId: "local-fixture", displayName: "익명 게스트", role: "editor" } });
    await act(async () => { r.control.update({ room, mode: "local", error: "이전 로컬 연결" }); });
    const previous = r.control.value;
    expect(commits.at(-1)?.value).toBe(previous);
    expect(previous?.room).toBe(room);
    const beforeTransportCommits = r.control.transportCommits.length;

    view.rerender(<f.Provider {...props} serverRequired><Read label="server-required" /></f.Provider>);
    const after = commits.filter(({ label }) => label === "server-required");
    expect(after.length).toBeGreaterThan(0);
    expect(r.control.props?.transportFactory).toBe(transportFactory);
    expect(transportFactory).not.toHaveBeenCalled();
    // 실제 정책 effect는 먼저 이전 local preference로 commit한 뒤 server state를 반영한다.
    expect(r.control.transportCommits.slice(beforeTransportCommits)).toContainEqual({ serverRequired: true, preference: "local" });
    expect(r.control.transportCommits.at(-1)).toEqual({ serverRequired: true, preference: "server" });
    expect(after.at(-1)?.value.room).toBeNull();
    expect(after.at(-1)?.value).toBe(r.control.value);
    const observed = after.map(({ value }, index) => ({
      index, oldRoom: value.room === room, oldContext: value === previous,
      availability: value.availability, mode: value.mode, usingLocalFallback: value.usingLocalFallback,
    }));
    expect(observed.filter(({ oldRoom, oldContext }) => oldRoom || oldContext),
      `서버 필수 범위의 모든 consumer commit: ${JSON.stringify(observed)}`).toEqual([]);
  });

  it("같은 소유자의 transport 변경에서 기존 복구 latch와 callback·huddle props를 보존한다", async () => {
    const f = compileLazyProvider(), r = runtimeFixture();
    const props = { ...baseProps(), onRoomChange: vi.fn(), onCrdtDocumentChange: vi.fn(),
      onAuthoritativeSaveBarrierChange: vi.fn(), onEditSafetyChange: vi.fn() };
    const view = render(<f.Provider {...props}><div /></f.Provider>);
    await act(async () => { f.resolve({ default: r.Runtime }); });
    const recovery = { vaultId: "vault-a", updateCount: 1, exportAvailable: true, exported: false, message: "복구 필요" };
    await act(async () => { r.control.latch(recovery); });
    const transportFactory = () => { throw new Error("래치된 원고가 새 transport를 열면 안 됩니다."); };
    view.rerender(<f.Provider {...props} transportFactory={transportFactory} showHuddleLauncher={false}><div /></f.Provider>);
    expect(r.control.value?.recovery).toBe(recovery);
    expect(r.control.value?.localFallbackAllowed).toBe(false);
    expect(r.control.props).toMatchObject({ ...props, transportFactory, showHuddleLauncher: false });
    expect(view.queryByTestId("huddle")).toBeNull();
    expect(r.control.mounts).toBe(1);
    expect(r.control.unmounts).toBe(0);
  });

  it("늦은 모듈 완료는 이미 unmount한 원고를 다시 설치하지 않는다", async () => {
    const f = compileLazyProvider(), r = runtimeFixture();
    const callbacks = { onRoomChange: vi.fn(), onCrdtDocumentChange: vi.fn(), onAuthoritativeSaveBarrierChange: vi.fn() };
    const view = render(<f.Provider {...baseProps()} {...callbacks}><div /></f.Provider>);
    view.unmount();
    const before = Object.values(callbacks).map((callback) => callback.mock.calls.length);
    await act(async () => { f.resolve({ default: r.Runtime }); });
    expect(r.control.mounts).toBe(0);
    expect(Object.values(callbacks).map((callback) => callback.mock.calls.length)).toEqual(before);
  });

  it("모듈 실패를 idle 성공으로 바꾸지 않고 원래 오류를 boundary에 전달한다", async () => {
    const f = compileLazyProvider(), caught: Error[] = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error: Error) { caught.push(error); }
      render() { return this.state.failed ? <span data-testid="failed" /> : this.props.children; }
    }
    const view = render(<Boundary><f.Provider {...baseProps()}><div data-testid="editor" /></f.Provider></Boundary>);
    expect(view.getByTestId("editor")).toBeTruthy();
    const failure = new Error("fixture-runtime-load-failed");
    await act(async () => { f.reject(failure); });
    expect(caught).toContain(failure);
    expect(view.getByTestId("failed")).toBeTruthy();
  });
});
