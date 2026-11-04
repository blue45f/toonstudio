import { useCallback, useRef, useState } from "react";
import type { StudioOfflineBranchResolveInput, StudioOfflineBranchRuntime } from "../offline-branch/studio-offline-branch-runtime";
import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";
import type { StudioLiveRoom } from "./studio-live-collaboration-room";
import type { StudioLiveOfflineBranchState } from "./studio-live-collaboration-context";

interface ConflictGuard {
  readonly scopeKey: string | null;
  readonly workId: string | null;
  readonly canEdit: boolean;
  readonly terminal: "revoked" | "recovery-required" | null;
  readonly blocked: () => boolean;
}

export interface StudioLiveOfflineSession {
  readonly runtime: StudioOfflineBranchRuntime;
  announce(): void;
  close(): Promise<void>;
}

interface ConflictSession extends StudioLiveOfflineSession {
  readonly scopeKey: string | null;
  readonly generation: number;
  resolve(input: StudioOfflineBranchResolveInput): Promise<void>;
}

interface OpenOfflineSessionOptions {
  readonly room: StudioLiveRoom;
  readonly scope: string;
  readonly document: StudioCrdtDocument;
  readonly binding: StudioCrdtRoomBinding;
  readonly canonicalAuthority: () => boolean;
  readonly onRuntimeReady: (runtime: StudioOfflineBranchRuntime) => void;
  readonly isCurrent: () => boolean;
  readonly onError: (message: string) => void;
}

/** 현재 live-room 세대가 소유한 오프라인 보관함·해결 명령·피어 구독을 함께 정리한다. */
export function useStudioOfflineConflictSession(guard: ConflictGuard) {
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const currentRef = useRef<ConflictSession | null>(null);
  const generationRef = useRef(0);
  const [view, setView] = useState<{
    readonly session: ConflictSession;
    readonly snapshot: StudioLiveOfflineBranchState;
  } | null>(null);

  const openOfflineSession = useCallback(async (options: OpenOfflineSessionOptions): Promise<StudioLiveOfflineSession | null> => {
    const generation = ++generationRef.current;
    const scopeKey = guardRef.current.scopeKey;
    const belongsToCurrentRoom = () => {
      const currentGuard = guardRef.current;
      return options.isCurrent() && generationRef.current === generation
        && currentGuard.scopeKey === scopeKey && currentGuard.workId === options.room.workId
        && currentGuard.canEdit && currentGuard.terminal === null && !currentGuard.blocked();
    };
    if (!belongsToCurrentRoom()) return null;
    const [module, { offlineConflictText }] = await Promise.all([
      import("../offline-branch/studio-offline-branch-runtime"),
      import("../offline-branch/studio-offline-conflict-i18n"),
    ]);
    if (!belongsToCurrentRoom()) return null;
    const runtime = await module.StudioOfflineBranchRuntime.create({
      workId: options.room.workId,
      scope: options.scope,
      actorId: options.scope,
      canonicalAuthority: options.canonicalAuthority(),
      onError: options.onError,
    });
    let peerSync: { announce(): void; close(): void } | null = null;
    let unsubscribe: () => void = () => undefined;
    let closed = false;
    let closePromise: Promise<void> | null = null;
    const assertCurrent = () => {
      if (closed || currentRef.current !== session || !belongsToCurrentRoom()) {
        throw new Error(offlineConflictText("unavailable"));
      }
    };
    const session: ConflictSession = {
      runtime, scopeKey, generation,
      announce: () => peerSync?.announce(),
      close: () => {
        if (closePromise) return closePromise;
        closed = true;
        const closingPeer = peerSync;
        peerSync = null;
        if (currentRef.current === session) {
          currentRef.current = null;
          setView(null);
        }
        closePromise = (async () => {
          try {
            unsubscribe();
            closingPeer?.close();
          } finally {
            runtime.setCanonicalAuthority(false);
            await runtime.close();
          }
        })();
        return closePromise;
      },
      resolve: async (input) => {
        assertCurrent();
        await runtime.resolveConflict(input);
        assertCurrent();
        if (input.action === "reapply-local" && runtime.status.canonicalAuthority) {
          await runtime.promotePending(options.document, () => {
            assertCurrent();
            return options.binding.flushAndWaitForDraftProtection();
          });
          assertCurrent();
        }
      },
    };
    try {
      if (!belongsToCurrentRoom()) { await session.close(); return null; }
      options.onRuntimeReady(runtime);
      currentRef.current = session;
      runtime.setCanonicalAuthority(options.canonicalAuthority());
      unsubscribe = runtime.subscribe((status) => {
        if (closed || currentRef.current !== session || !belongsToCurrentRoom()) return;
        setView({ session, snapshot: {
          workId: options.room.workId, generation,
          pendingOperations: status.pendingOperations, conflicts: runtime.conflictDetails(),
        } });
      });
      const peerModule = await import("../offline-branch/studio-offline-branch-p2p");
      if (!belongsToCurrentRoom()) { await session.close(); return null; }
      peerSync = peerModule.connectStudioOfflineBranchPeerSync({
        runtime, room: options.room, workId: options.room.workId,
        scope: options.scope, onError: options.onError,
      });
      return session;
    } catch (cause) {
      await session.close();
      throw cause;
    }
  }, []);

  const visible = view && view.session === currentRef.current
    && view.session.scopeKey === guard.scopeKey && view.snapshot.workId === guard.workId
    && guard.canEdit && guard.terminal === null && !guard.blocked() ? view : null;
  const resolveOfflineConflict = useCallback(async (input: StudioOfflineBranchResolveInput) => {
    if (!visible || currentRef.current !== visible.session) {
      const { offlineConflictText } = await import("../offline-branch/studio-offline-conflict-i18n");
      throw new Error(offlineConflictText("unavailable"));
    }
    await visible.session.resolve(input);
  }, [visible]);
  return { offlineBranch: visible?.snapshot ?? null, resolveOfflineConflict, openOfflineSession };
}
