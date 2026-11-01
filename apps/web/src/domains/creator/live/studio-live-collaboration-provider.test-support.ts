import { vi } from "vitest";

import { STUDIO_CRDT_PROTOCOL_VERSION } from "./studio-crdt-protocol";
import { StudioLiveCollaborationProvider } from "./StudioLiveCollaborationProvider";
import { StudioScopedWriteAuthorityContext } from "../studio-collab/studio-scoped-write-context";
import type { StudioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";

import type { StudioOfflineBranchConflictDetail, StudioOfflineBranchResolveInput } from "../offline-branch/studio-offline-branch-runtime";
import type { StudioCrdtRecoveryVaultEntry } from "./studio-crdt-recovery-vault";
import type { StudioLiveCollaborationContextValue } from "./studio-live-collaboration-context";
import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import type { StudioLiveRoomEvent } from "./studio-live-collaboration-room";
import type { StudioLiveTransportFactory } from "./studio-live-collaboration-transport";
import type { ReactNode } from "react";

type EffectCleanup = (() => void) | undefined;

type HookSlot =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "callback"; value: unknown; dependencies: readonly unknown[] }
  | {
      kind: "effect";
      dependencies: readonly unknown[] | undefined;
      cleanup: EffectCleanup;
    };

interface PendingEffect {
  index: number;
  effect: () => void | (() => void);
}

interface RoomRecord {
  options: {
    workId: string;
    participant: StudioLiveParticipant;
    dependencies?: { transportFactory?: StudioLiveTransportFactory };
  };
  ready: boolean;
  closeCount: number;
  startCount: number;
  unsubscribeCount: number;
  clearCursorCount: number;
  presenceUpdates: Array<Record<string, unknown>>;
  emit: (event: StudioLiveRoomEvent) => void;
}

interface MockBindingStatus {
  nonAuthoritativeDeliveryPending?: boolean;
  state: "idle" | "syncing" | "ready" | "retrying" | "repairing" | "error" | "recovery-required";
  message: string;
  durabilityAtRisk?: boolean;
  pendingCount?: number;
  persistenceDurability?: "checking" | "durable" | "degraded" | "unavailable";
  transportReady?: boolean;
  lastAckAt?: number | null;
  lastAckServerSequence?: string | null;
  code?: string;
  updateId?: string;
  recoveryUpdateCount?: number;
  collaborativeEditsBlocked?: true;
  retryable?: false;
  recoveryVaultId?: string;
  recoveryExportAvailable?: boolean;
}

/**
 * The repository intentionally runs Vitest in Node without jsdom. This tiny deterministic hook
 * driver exercises this provider's effect lifecycle directly; it is not a general React renderer.
 */
const hooks = vi.hoisted(() => {
  const slots: HookSlot[] = [];
  let cursor = 0;
  let dirty = false;
  let pending: PendingEffect[] = [];

  function equalDependencies(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined
  ): boolean {
    if (previous === undefined || next === undefined || previous.length !== next.length) {
      return false;
    }
    return previous.every((value, index) => Object.is(value, next[index]));
  }

  function useState<T>(initialValue: T | (() => T)) {
    const index = cursor++;
    const existing = slots[index];
    const slot = existing ?? {
      kind: "state" as const,
      value: typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue,
    };
    if (slot.kind !== "state") throw new Error(`Hook ${index} changed kind.`);
    slots[index] = slot;

    const setValue = (nextValue: T | ((previousValue: T) => T)) => {
      const previousValue = slot.value as T;
      const resolvedValue = typeof nextValue === "function"
        ? (nextValue as (previousValue: T) => T)(previousValue)
        : nextValue;
      if (Object.is(previousValue, resolvedValue)) return;
      slot.value = resolvedValue;
      dirty = true;
    };
    return [slot.value as T, setValue] as const;
  }

  function useRef<T>(initialValue: T) {
    const index = cursor++;
    const existing = slots[index];
    const slot = existing ?? { kind: "ref" as const, value: { current: initialValue } };
    if (slot.kind !== "ref") throw new Error(`Hook ${index} changed kind.`);
    slots[index] = slot;
    return slot.value as { current: T };
  }

  function useCallback<T>(callback: T, dependencies: readonly unknown[]): T {
    const index = cursor++;
    const existing = slots[index];
    if (existing && existing.kind !== "callback") throw new Error(`Hook ${index} changed kind.`);
    if (existing && equalDependencies(existing.dependencies, dependencies)) return existing.value as T;
    slots[index] = { kind: "callback", value: callback, dependencies };
    return callback;
  }

  function useEffect(
    effect: () => void | (() => void),
    dependencies?: readonly unknown[]
  ): void {
    const index = cursor++;
    const existing = slots[index];
    if (existing && existing.kind !== "effect") {
      throw new Error(`Hook ${index} changed kind.`);
    }
    if (existing && equalDependencies(existing.dependencies, dependencies)) return;
    slots[index] = {
      kind: "effect",
      dependencies,
      cleanup: existing?.cleanup,
    };
    pending.push({ index, effect });
  }

  function flushEffects(): void {
    const effects = pending;
    pending = [];
    for (const { index, effect } of effects) {
      const slot = slots[index];
      if (!slot || slot.kind !== "effect") throw new Error(`Missing effect hook ${index}.`);
      slot.cleanup?.();
      const cleanup = effect();
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
  }

  function render(renderComponent: () => ReactNode): ReactNode {
    for (let pass = 1; pass <= 20; pass += 1) {
      dirty = false;
      cursor = 0;
      const output = renderComponent();
      flushEffects();
      if (!dirty && pending.length === 0) return output;
    }
    throw new Error("Provider did not reach a stable hook state.");
  }

  function unmount(): void {
    for (let index = slots.length - 1; index >= 0; index -= 1) {
      const slot = slots[index];
      if (slot?.kind === "effect") slot.cleanup?.();
    }
    slots.length = 0;
    pending = [];
    cursor = 0;
    dirty = false;
  }

  function reset(): void {
    unmount();
  }

  return { render, reset, unmount, useCallback, useEffect, useRef, useState };
});

const rooms = vi.hoisted(() => ({ instances: [] as RoomRecord[] }));
interface OfflineTestRuntime {
  status: { canonicalAuthority: boolean; pendingOperations: number };
  conflicts: StudioOfflineBranchConflictDetail[];
  resolutionBarrier: Promise<void> | null;
  resolveCalls: StudioOfflineBranchResolveInput[];
  promoteCalls: number;
  unsubscribeCount: number;
  emit(): void;
  subscribe(listener: (status: { canonicalAuthority: boolean; pendingOperations: number }) => void): () => void;
  conflictDetails(): readonly StudioOfflineBranchConflictDetail[];
  resolveConflict(input: StudioOfflineBranchResolveInput): Promise<void>;
  setCanonicalAuthority(value: boolean): void;
  promotePending(document?: unknown, protect?: () => Promise<unknown>): Promise<void>;
  close(): Promise<void>;
}
const offlineAuthority = vi.hoisted(() => ({
  enabled: false,
  mode: "server" as "server" | "local",
  fanout: undefined as "authoritative" | "mesh" | "none" | undefined,
  initialConflicts: [] as StudioOfflineBranchConflictDetail[],
  instances: [] as OfflineTestRuntime[],
}));

vi.mock("../offline-branch/studio-offline-branch-feature", () => ({
  studioAutomergeOfflineBranchEnabled: () => offlineAuthority.enabled,
}));

vi.mock("../offline-branch/studio-offline-branch-runtime", () => ({
  StudioOfflineBranchRuntime: {
    create: async ({ canonicalAuthority }: { canonicalAuthority: boolean }) => {
      const status = { canonicalAuthority, pendingOperations: offlineAuthority.initialConflicts.length };
      const listeners = new Set<(value: typeof status) => void>();
      const runtime: OfflineTestRuntime = {
        status,
        conflicts: [...offlineAuthority.initialConflicts],
        resolutionBarrier: null,
        resolveCalls: [], promoteCalls: 0, unsubscribeCount: 0,
        emit: () => { for (const listener of listeners) listener(status); },
        subscribe: (listener) => { listeners.add(listener); listener(status); return () => { listeners.delete(listener); runtime.unsubscribeCount += 1; }; },
        conflictDetails: () => runtime.conflicts,
        resolveConflict: async (input) => {
          runtime.resolveCalls.push(input);
          await runtime.resolutionBarrier;
          runtime.conflicts = runtime.conflicts.filter((detail) => detail.operationId !== input.operationId);
          if (input.action === "keep-canonical") status.pendingOperations = runtime.conflicts.length;
          runtime.emit();
        },
        setCanonicalAuthority: (value) => { if (status.canonicalAuthority !== value) { status.canonicalAuthority = value; runtime.emit(); } },
        promotePending: async (_document, protect) => { runtime.promoteCalls += 1; await protect?.(); },
        close: async () => undefined,
      };
      offlineAuthority.instances.push(runtime);
      return runtime;
    },
  },
}));

vi.mock("../offline-branch/studio-offline-branch-p2p", () => ({
  connectStudioOfflineBranchPeerSync: () => ({ announce: () => undefined, close: () => undefined }),
}));

const recoveryDownloads = vi.hoisted(() => ({ count: 0 }));
const recoveryVault = vi.hoisted(() => ({
  entries: [] as StudioCrdtRecoveryVaultEntry[],
  listCount: 0,
  emptyReadsBeforeVisible: 0,
}));
const lifecycle = vi.hoisted(() => ({
  roomStart: "pending" as "pending" | "resolve" | "reject",
  bindingStart: "resolve" as "pending" | "resolve" | "reject",
  bindingStartResolvers: [] as Array<() => void>,
  bindingStatusOnStart: null as MockBindingStatus | null,
  documents: [] as Array<{ destroyCount: number }>,
  bindings: [] as Array<{
    closeCount: number;
    closeGracefullyCount: number;
    authoritativeBarrierCount: number;
    draftProtectionTimeouts: Array<number | undefined>;
    acknowledgedDraftProtection: string[][];
    deliveryTimeouts: Array<number | undefined>;
    deliveryBarrier: Promise<void> | null;
    document: { destroyCount: number };
    onStatus?: (status: MockBindingStatus) => void;
  }>,
}));

vi.mock("./studio-crdt-recovery-vault", () => ({
  createStudioCrdtRecoveryVault: () => ({
    list: async (scope: string, workId: string) => {
      recoveryVault.listCount += 1;
      if (recoveryVault.listCount <= recoveryVault.emptyReadsBeforeVisible) return [];
      return recoveryVault.entries.filter((entry) =>
        entry.scope === scope && entry.workId === workId
      );
    },
  }),
  downloadStudioCrdtRecoveryBundle: async () => {
    recoveryDownloads.count += 1;
  },
}));

const scopedWriteAuthority = vi.hoisted<{ value: StudioScopedWriteAuthority | null }>(() => ({ value: null }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: hooks.useCallback,
    useContext: (context: unknown) => {
      if (context !== StudioScopedWriteAuthorityContext) throw new Error("수동 드라이버에 등록되지 않은 context입니다.");
      return scopedWriteAuthority.value;
    },
    useEffect: hooks.useEffect,
    useRef: hooks.useRef,
    useState: hooks.useState,
  };
});

vi.mock("./studio-live-collaboration-room", () => {
  class StudioLiveRoom {
    get mode() { return offlineAuthority.mode; }
    get crdtFanout() { return offlineAuthority.fanout; }
    readonly workId: string;
    readonly record: RoomRecord;

    get ready(): boolean {
      return this.record.ready;
    }

    constructor(options: RoomRecord["options"]) {
      this.workId = options.workId;
      this.record = {
        options,
        ready: false,
        closeCount: 0,
        startCount: 0,
        unsubscribeCount: 0,
        clearCursorCount: 0,
        presenceUpdates: [],
        emit: () => undefined,
      };
      rooms.instances.push(this.record);
    }

    subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
      this.record.emit = listener;
      return () => {
        this.record.unsubscribeCount += 1;
        this.record.emit = () => undefined;
      };
    }

    get participant(): StudioLiveParticipant {
      return this.record.options.participant;
    }

    start(): Promise<void> {
      this.record.startCount += 1;
      if (lifecycle.roomStart === "reject") {
        return Promise.reject(new Error("room start failed"));
      }
      if (lifecycle.roomStart === "resolve") {
        this.record.ready = true;
        return Promise.resolve();
      }
      return new Promise(() => undefined);
    }

    getPeers(): [] {
      return [];
    }

    getLocks(): [] {
      return [];
    }

    updatePresence(patch: Record<string, unknown>): void {
      this.record.presenceUpdates.push(patch);
    }

    clearCursor(): boolean {
      this.record.clearCursorCount += 1;
      return true;
    }

    close(): void {
      this.record.closeCount += 1;
    }
  }

  return { StudioLiveRoom };
});

// The provider resolves the room and the adaptive cursor transport in one Promise.all. Leaving the
// transport module real adds a second module graph to that await, so the room is not constructed
// within the microtask budget renderProvider spends — every room assertion then reads undefined.
// The stub also records which base factory was wrapped, which is the observable this suite needs.
vi.mock("./studio-live-adaptive-cursor-transport", () => ({
  STUDIO_LIVE_CURSOR_CAPTURE_INTERVAL_MS: 16,
  createStudioAdaptiveCursorTransportFactory: (
    dependencies: { baseFactory?: unknown } = {},
  ) => {
    const factory = (): never => {
      throw new Error("The mocked room must not open a real transport.");
    };
    (factory as { wrappedBaseFactory?: unknown }).wrappedBaseFactory =
      dependencies.baseFactory ?? null;
    return factory;
  },
}));

vi.mock("./studio-crdt-document", () => ({
  StudioCrdtDocument: class StudioCrdtDocument {
    readonly record = { destroyCount: 0 };

    constructor() {
      lifecycle.documents.push(this.record);
    }

    destroy(): void {
      this.record.destroyCount += 1;
    }
  },
}));

vi.mock("./studio-crdt-room-binding", () => ({
  StudioCrdtRoomBinding: class StudioCrdtRoomBinding {
    readonly record: (typeof lifecycle.bindings)[number];

    constructor(options: {
      document: { record: { destroyCount: number } };
      onStatus?: (status: MockBindingStatus) => void;
    }) {
      this.record = {
        closeCount: 0,
        closeGracefullyCount: 0,
        authoritativeBarrierCount: 0,
        draftProtectionTimeouts: [],
        acknowledgedDraftProtection: [],
        deliveryTimeouts: [],
        deliveryBarrier: null,
        document: options.document.record,
        onStatus: options.onStatus,
      };
      lifecycle.bindings.push(this.record);
    }

    start(): Promise<void> {
      if (lifecycle.bindingStatusOnStart) this.record.onStatus?.(lifecycle.bindingStatusOnStart);
      if (lifecycle.bindingStart === "reject") {
        return Promise.reject(new Error("binding start failed"));
      }
      if (lifecycle.bindingStart === "resolve") return Promise.resolve();
      return new Promise<void>((resolve) => {
        lifecycle.bindingStartResolvers.push(resolve);
      });
    }

    get recoveryRequired(): boolean {
      return lifecycle.bindingStatusOnStart?.state === "recovery-required";
    }

    close(): void {
      this.record.closeCount += 1;
    }

    async closeGracefully(): Promise<void> {
      this.record.closeGracefullyCount += 1;
    }

    async flushAndWaitForAuthoritativeAck(): Promise<{
      serverSequence: string;
      acknowledgedAt: number;
    }> {
      this.record.authoritativeBarrierCount += 1;
      return { serverSequence: "41", acknowledgedAt: 1_234 };
    }

    async flushAndWaitForDelivery(timeoutMs?: number): Promise<void> {
      this.record.deliveryTimeouts.push(timeoutMs);
      await this.record.deliveryBarrier;
    }

    async flushAndWaitForDraftProtection(timeoutMs?: number): Promise<{
      protection: "device";
      serverSequence: null;
      acknowledgedAt: null;
      protectedUpdateIds: readonly string[];
    }> {
      this.record.draftProtectionTimeouts.push(timeoutMs);
      await this.record.deliveryBarrier;
      return {
        protection: "device",
        serverSequence: null,
        acknowledgedAt: null,
        protectedUpdateIds: ["update-1"],
      };
    }

    async acknowledgeDraftProtection(protectedUpdateIds: readonly string[]): Promise<void> {
      this.record.acknowledgedDraftProtection.push([...protectedUpdateIds]);
    }
  },
}));

vi.mock("./studio-crdt-scene-publisher", () => ({
  publishStudioCrdtSceneGraphDiff: () => ({
    sceneElementMutations: 0,
    pageMutations: 0,
    elementMoves: 0,
    pageMoves: 0,
  }),
}));

vi.mock("./studio-crdt-history", () => ({
  reconcileStudioCrdtSceneGraphHistory: () => ({ history: [], changed: false }),
}));

vi.mock("./studio-crdt-page-bridge", () => ({
  reconcileStudioCrdtSceneGraphPages: () => ({ pages: [], changed: false }),
}));

vi.mock("./studio-crdt-raster-ui-bridge", () => ({
  nextStudioRasterLogicalClock: () => "1",
  planStudioRasterDrawPromotion: () => null,
  studioRasterDrawPromotionSourceMatches: () => false,
  publishStudioRasterHistoryTransition: () => ({
    undoOperationIds: [],
    acknowledgementIds: [],
  }),
  sha256StudioRasterSemanticParameters: async () => "0".repeat(64),
}));

const participant: Omit<StudioLiveParticipant, "sessionId"> = {
  displayName: "민지",
  role: "editor",
};

const transportFactory: StudioLiveTransportFactory = () => {
  throw new Error("The mocked room must not open a real transport.");
};

function recoveryVaultEntry(options: {
  rejectedUpdateId: string;
  vaultId?: string;
  scope?: string;
  workId?: string;
  status?: "pending-export" | "exported";
}): StudioCrdtRecoveryVaultEntry {
  const scope = options.scope ?? "user-a";
  const workId = options.workId ?? "work-a";
  return {
    vaultId: options.vaultId ?? "private-vault-id",
    scope,
    workId,
    status: options.status ?? "pending-export",
    failureCode: "forbidden",
    failureMessage: "server rejected update",
    rejectedUpdateId: options.rejectedUpdateId,
    updates: [{
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId,
      updateId: options.rejectedUpdateId,
      clientSequence: 1,
      update: "AQ==",
    }],
    createdAt: 1,
    exportedAt: options.status === "exported" ? 2 : null,
  };
}

interface RenderProviderOptions {
  children?: ReactNode;
  workId?: string | null;
  participant?: Omit<StudioLiveParticipant, "sessionId"> | null;
  currentPageId?: string | null;
  currentTool?: string | null;
  outboxScope?: string | null;
  transportFactory?: StudioLiveTransportFactory | null;
  serverRequired?: boolean;
  onRoomChange?: (room: unknown) => void;
  onCrdtDocumentChange?: (document: unknown, runtime: unknown | null) => void;
  onEditSafetyChange?: (editsDurablyProtected: boolean) => void;
  onAuthoritativeSaveBarrierChange?: (barrier: (() => Promise<unknown>) | null) => void;
}

function renderProviderOnce(
  options: RenderProviderOptions = {}
): StudioLiveCollaborationContextValue {
  const output = hooks.render(() => StudioLiveCollaborationProvider({
    children: options.children ?? null,
    workId: options.workId === undefined ? "work-a" : options.workId,
    participant: options.participant === undefined ? participant : options.participant,
    currentPageId: options.currentPageId === undefined ? "page-a" : options.currentPageId,
    currentTool: options.currentTool === undefined ? "pen" : options.currentTool,
    outboxScope: options.outboxScope ?? null,
    transportFactory:
      options.transportFactory === null
        ? undefined
        : (options.transportFactory ?? transportFactory),
    serverRequired: options.serverRequired,
    onRoomChange: options.onRoomChange,
    onCrdtDocumentChange: options.onCrdtDocumentChange,
    onEditSafetyChange: options.onEditSafetyChange,
    onAuthoritativeSaveBarrierChange: options.onAuthoritativeSaveBarrierChange,
  }));
  return (output as { props: { value: StudioLiveCollaborationContextValue } }).props.value;
}

/**
 * The provider fetches studio-live-collaboration-room on demand, so a single render pass no
 * longer produces a room. Draining the microtask queue and rendering again is what React does
 * once the lazy chunk lands, so every assertion below observes the post-resolution state — which
 * is also what makes this suite a proof that the dynamic boundary resolves.
 */
async function renderProvider(
  options: RenderProviderOptions = {}
): Promise<StudioLiveCollaborationContextValue> {
  renderProviderOnce(options);
  // The gated effect now awaits two dynamic imports (room + adaptive cursor transport) before it
  // constructs anything, so the drain has to outlast that chain rather than a single import.
  for (let tick = 0; tick < 64; tick += 1) await Promise.resolve();
  return renderProviderOnce(options);
}

export function resetStudioLiveProviderFixture(): void {
  scopedWriteAuthority.value = null;
  offlineAuthority.enabled = false;
  offlineAuthority.mode = "server";
  offlineAuthority.fanout = undefined;
  offlineAuthority.instances.length = 0;
  offlineAuthority.initialConflicts = [];
  rooms.instances.length = 0;
  lifecycle.roomStart = "pending";
  lifecycle.bindingStart = "resolve";
  lifecycle.bindingStartResolvers.length = 0;
  lifecycle.bindingStatusOnStart = null;
  lifecycle.documents.length = 0;
  lifecycle.bindings.length = 0;
  recoveryDownloads.count = 0;
  recoveryVault.entries.length = 0;
  recoveryVault.listCount = 0;
  recoveryVault.emptyReadsBeforeVisible = 0;
}

export function cleanupStudioLiveProviderFixture(): void {
  hooks.reset();
  vi.unstubAllGlobals();
}

export {
  hooks, rooms, offlineAuthority, lifecycle, recoveryDownloads, recoveryVault,
  participant, transportFactory, recoveryVaultEntry, renderProviderOnce, renderProvider,
};
