import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  StudioInsertHubCollection,
  StudioInsertHubPreferences,
} from "../studio-insert-hub-model";

export type AssetWorkspaceFacet =
  | "all"
  | "background"
  | "scene-template"
  | "story"
  | "character"
  | "prop"
  | "3d"
  | "mine";
export type AssetWorkspaceView = "discover" | "library";
export type AssetWorkspaceDensity = "visual" | "compact";
export type AssetWorkspaceStatus = {
  readonly tone: "success" | "error";
  readonly message: string;
};

export interface AssetWorkspaceState {
  readonly view: AssetWorkspaceView | null;
  readonly query: string;
  readonly facet: AssetWorkspaceFacet;
  readonly collection: StudioInsertHubCollection;
  readonly density: AssetWorkspaceDensity;
  readonly filtersOpen: boolean;
  readonly detailOpen: boolean;
  readonly selectedId: string | null;
  readonly pendingId: string | null;
  readonly status: AssetWorkspaceStatus | null;
  readonly acknowledgedCautionId: string | null;
  readonly preferences: StudioInsertHubPreferences | null;
}

type StateUpdate = (current: AssetWorkspaceState) => AssetWorkspaceState;

/** 원고와 분리된 메뉴 세션. 반응형 portal이 다시 마운트되어도 선택·진행 중 가드를 유지한다. */
export function createAssetWorkspaceSession() {
  let snapshot: AssetWorkspaceState = {
    view: null,
    query: "",
    facet: "all",
    collection: "all",
    density: "visual",
    filtersOpen: false,
    detailOpen: false,
    selectedId: null,
    pendingId: null,
    status: null,
    acknowledgedCautionId: null,
    preferences: null,
  };
  const subscribers = new Set<() => void>();
  const update = (updater: StateUpdate): void => {
    const next = updater(snapshot);
    if (next === snapshot) return;
    snapshot = next;
    for (const subscriber of subscribers) subscriber();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    update,
    claimPending: (id: string): boolean => {
      if (snapshot.pendingId !== null) return false;
      update((current) => ({ ...current, pendingId: id, status: null }));
      return true;
    },
  };
}

type AssetWorkspaceSession = ReturnType<typeof createAssetWorkspaceSession>;
export const AssetWorkspaceSessionContext =
  createContext<AssetWorkspaceSession | null>(null);

export function useAssetWorkspaceSession() {
  const inherited = useContext(AssetWorkspaceSessionContext);
  const [local] = useState(createAssetWorkspaceSession);
  const session = inherited ?? local;
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  return { session, state };
}
