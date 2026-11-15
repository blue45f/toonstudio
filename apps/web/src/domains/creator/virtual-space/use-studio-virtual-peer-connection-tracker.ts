import { useEffect, useRef, useState } from "react";

import type { StudioLiveAvailability } from "../live/studio-live-collaboration-context";
import type { StudioConnectivityMode } from "../offline/studio-connectivity";
import type {
  StudioVirtualSpacePeer,
  StudioVirtualSpacePresenceState,
} from "./studio-virtual-space-model";
import type { StudioSpaceUserSnapshot } from "./StudioVirtualSpaceUserList";

export type StudioParticipantConnectionState = "connected" | "reconnecting" | "disconnected";

/** 2.5초 하트비트를 1회 이상 놓치면 '재연결 중'으로 표시한다. */
export const STUDIO_PEER_RECONNECTING_AFTER_MS = 3_600;
/** 연결이 끊긴 참여자를 목록에 '연결 끊김'으로 남겨 두는 최대 유지 시간(30초). */
export const STUDIO_PEER_DISCONNECTED_RETENTION_MS = 30_000;
const TRACKER_TICK_MS = 1_000;

export interface StudioDisconnectedPeerGhost {
  readonly sessionId: string;
  readonly normalizedName: string;
  readonly snapshot: StudioSpaceUserSnapshot;
  readonly disconnectedAt: number;
}

function normalizeDisplayNameKey(name: string): string {
  return name.replace(/\s*·\s*이 탭$/u, "").trim().toLowerCase();
}

export function resolveSelfConnectionState(input: {
  readonly liveAvailability: StudioLiveAvailability;
  readonly connectivityMode: StudioConnectivityMode;
  readonly directReady: boolean;
}): StudioParticipantConnectionState {
  if (input.connectivityMode === "offline" || input.liveAvailability === "error") {
    return "disconnected";
  }
  if (input.connectivityMode === "reconnecting" || input.liveAvailability === "connecting") {
    return "reconnecting";
  }
  if (input.directReady && input.liveAvailability === "ready") {
    return "connected";
  }
  return "reconnecting";
}

export function deriveStudioVirtualPeerConnectionList(input: {
  readonly selfId: string;
  readonly selfName: string;
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly previousActivePeers: ReadonlyMap<string, StudioSpaceUserSnapshot>;
  readonly previousGhosts: ReadonlyMap<string, StudioDisconnectedPeerGhost>;
  readonly selfConnectionState: StudioParticipantConnectionState;
  readonly now: number;
}): {
  readonly users: readonly StudioSpaceUserSnapshot[];
  readonly nextActivePeers: Map<string, StudioSpaceUserSnapshot>;
  readonly nextGhosts: Map<string, StudioDisconnectedPeerGhost>;
} {
  const nextActivePeers = new Map<string, StudioSpaceUserSnapshot>();
  const activeNameKeys = new Set<string>([normalizeDisplayNameKey(input.selfName)]);

  for (const peer of input.peers) {
    const ageMs = Math.max(0, input.now - peer.lastSeen);
    const connectionState: StudioParticipantConnectionState =
      ageMs >= STUDIO_PEER_RECONNECTING_AFTER_MS ? "reconnecting" : "connected";
    const snapshot: StudioSpaceUserSnapshot = {
      id: peer.participant.sessionId,
      name: peer.participant.displayName,
      zoneId: peer.state.zoneId,
      activity: peer.state.activity,
      userStatus: peer.state.userStatus ?? null,
      connectionState,
    };
    nextActivePeers.set(peer.participant.sessionId, snapshot);
    activeNameKeys.add(normalizeDisplayNameKey(peer.participant.displayName));
  }

  const nextGhosts = new Map<string, StudioDisconnectedPeerGhost>();
  for (const [sessionId, ghost] of input.previousGhosts) {
    if (sessionId === input.selfId) continue;
    if (nextActivePeers.has(sessionId) || activeNameKeys.has(ghost.normalizedName)) {
      continue;
    }
    if (input.now - ghost.disconnectedAt <= STUDIO_PEER_DISCONNECTED_RETENTION_MS) {
      nextGhosts.set(sessionId, ghost);
    }
  }

  for (const [sessionId, prevSnapshot] of input.previousActivePeers) {
    if (sessionId === input.selfId) continue;
    const normalizedName = normalizeDisplayNameKey(prevSnapshot.name);
    if (nextActivePeers.has(sessionId) || activeNameKeys.has(normalizedName)) {
      continue;
    }
    nextGhosts.set(sessionId, {
      sessionId,
      normalizedName,
      disconnectedAt: input.now,
      snapshot: {
        ...prevSnapshot,
        connectionState: "disconnected",
      },
    });
  }

  const selfSnapshot: StudioSpaceUserSnapshot = {
    id: input.selfId,
    name: input.selfName,
    zoneId: input.self.zoneId,
    activity: input.self.activity,
    userStatus: input.self.userStatus ?? null,
    connectionState: input.selfConnectionState,
  };

  const users: StudioSpaceUserSnapshot[] = [
    selfSnapshot,
    ...nextActivePeers.values(),
    ...[...nextGhosts.values()].map((ghost) => ghost.snapshot),
  ];

  return { users, nextActivePeers, nextGhosts };
}

export function useStudioVirtualPeerConnectionTracker(input: {
  readonly selfId: string;
  readonly selfName: string;
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly liveAvailability: StudioLiveAvailability;
  readonly connectivityMode: StudioConnectivityMode;
  readonly directReady: boolean;
}): readonly StudioSpaceUserSnapshot[] {
  const activePeersRef = useRef<Map<string, StudioSpaceUserSnapshot>>(new Map());
  const ghostsRef = useRef<Map<string, StudioDisconnectedPeerGhost>>(new Map());
  const [nowTick, setNowTick] = useState(() => Date.now());

  const selfConnectionState = resolveSelfConnectionState({
    liveAvailability: input.liveAvailability,
    connectivityMode: input.connectivityMode,
    directReady: input.directReady,
  });

  const derived = deriveStudioVirtualPeerConnectionList({
    selfId: input.selfId,
    selfName: input.selfName,
    self: input.self,
    peers: input.peers,
    previousActivePeers: activePeersRef.current,
    previousGhosts: ghostsRef.current,
    selfConnectionState,
    now: Math.max(nowTick, ...input.peers.map((peer) => peer.lastSeen)),
  });

  useEffect(() => {
    activePeersRef.current = derived.nextActivePeers;
    ghostsRef.current = derived.nextGhosts;
  });

  const hasTrackedPeers = input.peers.length > 0 || derived.nextGhosts.size > 0;
  useEffect(() => {
    if (!hasTrackedPeers) return undefined;
    const handle = globalThis.setInterval(() => {
      setNowTick(Date.now());
    }, TRACKER_TICK_MS);
    return () => globalThis.clearInterval(handle);
  }, [hasTrackedPeers]);

  return derived.users;
}
