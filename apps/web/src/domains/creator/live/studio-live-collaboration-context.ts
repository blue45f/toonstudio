import { createContext, useContext } from "react";
import type { StudioOfflineBranchConflictDetail, StudioOfflineBranchResolveInput } from "../offline-branch/studio-offline-branch-runtime";

import {
  INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
  type StudioLiveSyncSnapshot,
} from "./studio-live-sync-safety";

import type {
  StudioLiveChatMessage,
  StudioLiveLock,
  StudioLivePeer,
  StudioLiveRoom,
} from "./studio-live-collaboration-room";
import type { StudioLiveTransportMode } from "./studio-live-collaboration-transport";

export type StudioLiveAvailability = "idle" | "connecting" | "ready" | "unsupported" | "error";

export interface StudioLiveRecoveryState {
  vaultId: string | null;
  updateCount: number;
  exportAvailable: boolean;
  exported: boolean;
  message: string;
}

export interface StudioLiveOfflineBranchState {
  readonly workId: string;
  readonly generation: number;
  readonly pendingOperations: number;
  readonly conflicts: readonly StudioOfflineBranchConflictDetail[];
}

export interface StudioLiveCollaborationContextValue {
  room: StudioLiveRoom | null;
  availability: StudioLiveAvailability;
  mode: StudioLiveTransportMode | null;
  peers: StudioLivePeer[];
  locks: StudioLiveLock[];
  chatMessages: StudioLiveChatMessage[];
  /** UX gate only. The server rejects chat from roles without comment/edit capability anyway. */
  canChat: boolean;
  error: string | null;
  serverAvailable: boolean;
  localFallbackAllowed: boolean;
  usingLocalFallback: boolean;
  sendChatMessage: (text: string) => boolean;
  /** Structured, fail-closed durability state for always-visible editor chrome. */
  sync: StudioLiveSyncSnapshot;
  recovery: StudioLiveRecoveryState | null;
  offlineBranch: StudioLiveOfflineBranchState | null;
  resolveOfflineConflict: (input: StudioOfflineBranchResolveInput) => Promise<void>;
  exportRecovery: () => Promise<void>;
  reloadAuthoritative: () => void;
  retryServer: () => void;
  connectionRecovery?: "idle" | "waiting" | "retrying" | "paused";
  useLocalFallback: () => void;
}

export const EMPTY_STUDIO_LIVE_CONTEXT: StudioLiveCollaborationContextValue = {
  room: null,
  availability: "idle",
  mode: null,
  peers: [],
  locks: [],
  chatMessages: [],
  canChat: false,
  error: null,
  serverAvailable: false,
  localFallbackAllowed: false,
  usingLocalFallback: false,
  sendChatMessage: () => false,
  sync: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
  recovery: null,
  offlineBranch: null,
  resolveOfflineConflict: async () => { throw new Error("현재 오프라인 변경 보관함이 없습니다."); },
  exportRecovery: async () => undefined,
  reloadAuthoritative: () => undefined,
  retryServer: () => undefined,
  useLocalFallback: () => undefined,
};

export const StudioLiveCollaborationContext =
  createContext<StudioLiveCollaborationContextValue>(EMPTY_STUDIO_LIVE_CONTEXT);

export function useStudioLiveCollaboration(): StudioLiveCollaborationContextValue {
  return useContext(StudioLiveCollaborationContext);
}
