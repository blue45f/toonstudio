import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import type {
  StudioP2pBoardColor,
  StudioP2pBoardEntity,
  StudioP2pBoardNote,
  StudioP2pBoardPoint,
  StudioP2pBoardSnapshot,
  StudioP2pBoardStroke,
} from "../studio-virtual-space-p2p-board";
import {
  createStickyNote,
  editStickyNoteText,
  moveStickyNote,
  recolorStickyNote,
  resizeStickyNote,
  sortStickyNotesKanban,
  toggleStickyNoteDone,
  type StudioStickyNote,
  type StudioStickyNoteColor,
} from "../studio-virtual-space-sticky-notes";

export const VIRTUAL_SPACE_YJS_WIRE = "toonstudio-space-yjs-v1";
const STORAGE_PREFIX = "toonstudio:virtual-space-yjs:v1:";
const SOLO_STORAGE_PREFIX = "toonstudio:virtual-space-yjs-solo:v1:";
const BROADCAST_PREFIX = "toonstudio:virtual-space-yjs-bc:v1:";

export interface SpaceCutReviewPin {
  readonly id: string;
  readonly cutId: string;
  readonly x: number;
  readonly y: number;
  readonly comment: string;
  readonly status: "open" | "resolved";
  readonly authorSessionId: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export interface SpaceBulletinItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly pinned: boolean;
  readonly authorName: string;
  readonly createdAt: number;
}

export interface SpaceDeadlineWidget {
  readonly id: string;
  readonly episodeLabel: string;
  readonly title: string;
  readonly targetIso: string;
  readonly updatedAt: number;
}

export interface SpaceRoomPresetState {
  readonly themeId: string;
  readonly timeOfDayHours: number;
  readonly interiorDimmer: number;
}

export interface VirtualSpaceYjsSnapshot {
  readonly roomPreset: SpaceRoomPresetState | null;
  readonly boardEntities: readonly StudioP2pBoardEntity[];
  readonly stickyNotes: readonly StudioStickyNote[];
  readonly reviewPins: readonly SpaceCutReviewPin[];
  readonly bulletins: readonly SpaceBulletinItem[];
  readonly deadlines: readonly SpaceDeadlineWidget[];
  readonly synced: boolean;
}

export function encodeYjsUpdateBase64(update: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < update.length; i += 1) {
    binary += String.fromCharCode(update[i] ?? 0);
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(update).toString("base64");
}

export function decodeYjsUpdateBase64(encoded: string): Uint8Array | null {
  try {
    if (typeof atob === "function") {
      const binary = atob(encoded);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

export function createVirtualSpaceYjsDoc(initialBase64?: string | null): Y.Doc {
  const doc = new Y.Doc();
  if (initialBase64) {
    const bytes = decodeYjsUpdateBase64(initialBase64);
    if (bytes && bytes.byteLength > 0) {
      try {
        Y.applyUpdate(doc, bytes, "hydrate");
      } catch {
        // Ignore corrupted local cache and keep empty fresh Y.Doc.
      }
    }
  }
  return doc;
}

function readLocalBase64(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocalBase64(key: string, value: string): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    // 저장 실패 때도 실시간 편집은 유지하되 원본 삭제의 성공 조건으로 쓰지 않는다.
    return false;
  }
}

function removeLocalKey(key: string, expected: string): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage || storage.getItem(key) !== expected) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function mergeLocalSpaceDocIntoRemote(localDoc: Y.Doc, remoteDoc: Y.Doc): Uint8Array {
  const stateVector = Y.encodeStateVector(remoteDoc);
  const diff = Y.encodeStateAsUpdate(localDoc, stateVector);
  Y.applyUpdate(remoteDoc, diff, "solo-merge");
  return diff;
}

function readSnapshotFromDoc(doc: Y.Doc, synced: boolean): VirtualSpaceYjsSnapshot {
  const roomMap = doc.getMap<unknown>("roomPreset");
  const themeId = roomMap.get("themeId");
  const timeOfDayHours = roomMap.get("timeOfDayHours");
  const interiorDimmer = roomMap.get("interiorDimmer");
  const roomPreset: SpaceRoomPresetState | null =
    typeof themeId === "string"
      ? {
          themeId,
          timeOfDayHours: typeof timeOfDayHours === "number" ? timeOfDayHours : 11.5,
          interiorDimmer: typeof interiorDimmer === "number" ? interiorDimmer : 0.72,
        }
      : null;

  const boardMap = doc.getMap<StudioP2pBoardEntity>("whiteboardEntities");
  const boardEntities = [...boardMap.values()].sort((a, b) => a.revision - b.revision || a.id.localeCompare(b.id));

  const stickyMap = doc.getMap<StudioStickyNote>("stickyNotes");
  const stickyNotes = sortStickyNotesKanban([...stickyMap.values()]);

  const pinMap = doc.getMap<SpaceCutReviewPin>("reviewPins");
  const reviewPins = [...pinMap.values()].sort((a, b) => b.createdAt - a.createdAt);

  const bulletinMap = doc.getMap<SpaceBulletinItem>("bulletinBoard");
  const bulletins = [...bulletinMap.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);

  const deadlineMap = doc.getMap<SpaceDeadlineWidget>("deadlineWidgets");
  const deadlines = [...deadlineMap.values()].sort((a, b) => new Date(a.targetIso).getTime() - new Date(b.targetIso).getTime());

  return Object.freeze({
    roomPreset,
    boardEntities: Object.freeze(boardEntities),
    stickyNotes,
    reviewPins: Object.freeze(reviewPins),
    bulletins: Object.freeze(bulletins),
    deadlines: Object.freeze(deadlines),
    synced,
  });
}

function makeEntityId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function useVirtualSpaceYjsDoc(input: {
  readonly scopeId: string;
  readonly selfSessionId: string;
  readonly selfDisplayName: string;
  readonly personal: boolean;
  readonly signedIn: boolean;
  readonly directPort?: StudioLiveDirectPort | null;
  readonly canEdit: boolean;
}) {
  const storageKey = `${input.personal || !input.signedIn ? SOLO_STORAGE_PREFIX : STORAGE_PREFIX}${input.scopeId}`;
  const soloStorageKey = `${SOLO_STORAGE_PREFIX}${input.scopeId}`;
  const docRef = useRef<Y.Doc | null>(null);
  if (!docRef.current) {
    docRef.current = createVirtualSpaceYjsDoc(readLocalBase64(storageKey));
  }

  const [state, setState] = useState<VirtualSpaceYjsSnapshot>(() => readSnapshotFromDoc(docRef.current!, Boolean(input.directPort)));
  const [hasPendingSoloMerge, setHasPendingSoloMerge] = useState<boolean>(() =>
    !input.personal && input.signedIn && Boolean(readLocalBase64(soloStorageKey)),
  );

  // Re-create Y.Doc cleanly when scope changes.
  const scopeRef = useRef(storageKey);
  useEffect(() => {
    if (scopeRef.current === storageKey) return;
    scopeRef.current = storageKey;
    docRef.current?.destroy();
    const nextDoc = createVirtualSpaceYjsDoc(readLocalBase64(storageKey));
    docRef.current = nextDoc;
    setState(readSnapshotFromDoc(nextDoc, Boolean(input.directPort)));
    setHasPendingSoloMerge(!input.personal && input.signedIn && Boolean(readLocalBase64(soloStorageKey)));
  }, [input.directPort, input.personal, input.signedIn, soloStorageKey, storageKey]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return undefined;
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(`${BROADCAST_PREFIX}${input.scopeId}`)
      : null;

    const persistAndBroadcast = (update: Uint8Array, origin: unknown) => {
      setState(readSnapshotFromDoc(doc, Boolean(input.directPort)));
      const fullBase64 = encodeYjsUpdateBase64(Y.encodeStateAsUpdate(doc));
      writeLocalBase64(storageKey, fullBase64);
      if (origin === "remote" || origin === "broadcast" || origin === "hydrate") return;

      const encodedDelta = encodeYjsUpdateBase64(update);
      channel?.postMessage({ wire: VIRTUAL_SPACE_YJS_WIRE, update: encodedDelta });
      const port = input.directPort;
      if (port && encodedDelta.length <= 44_000) {
        const packet = JSON.stringify({ wire: VIRTUAL_SPACE_YJS_WIRE, scopeId: input.scopeId, update: encodedDelta });
        for (const peer of port.getPeers()) {
          if (peer.sessionId !== input.selfSessionId) port.send(peer.sessionId, packet);
        }
      }
    };

    doc.on("update", persistAndBroadcast);

    const onBroadcast = (event: MessageEvent<unknown>) => {
      const msg = event.data as { readonly wire?: unknown; readonly update?: unknown } | null;
      if (!msg || msg.wire !== VIRTUAL_SPACE_YJS_WIRE || typeof msg.update !== "string") return;
      const bytes = decodeYjsUpdateBase64(msg.update);
      if (bytes) Y.applyUpdate(doc, bytes, "broadcast");
    };
    channel?.addEventListener("message", onBroadcast);

    const unsubDirect = input.directPort?.subscribe((_sender, raw) => {
      try {
        const parsed = JSON.parse(raw) as { readonly wire?: unknown; readonly scopeId?: unknown; readonly update?: unknown };
        if (parsed.wire !== VIRTUAL_SPACE_YJS_WIRE || parsed.scopeId !== input.scopeId || typeof parsed.update !== "string") return;
        const bytes = decodeYjsUpdateBase64(parsed.update);
        if (bytes) Y.applyUpdate(doc, bytes, "remote");
      } catch {
        // Ignore non-Yjs direct packets.
      }
    });

    setState(readSnapshotFromDoc(doc, Boolean(input.directPort)));

    return () => {
      doc.off("update", persistAndBroadcast);
      channel?.removeEventListener("message", onBroadcast);
      channel?.close();
      unsubDirect?.();
    };
  }, [input.directPort, input.scopeId, input.selfSessionId, storageKey]);

  const addStroke = useCallback((
    points: readonly StudioP2pBoardPoint[],
    color: StudioP2pBoardColor,
    width = 4,
  ): string | null => {
    if (!input.canEdit || points.length < 2) return null;
    const doc = docRef.current;
    if (!doc) return null;
    const id = makeEntityId("stroke");
    const entity: StudioP2pBoardStroke = {
      id,
      kind: "stroke",
      ownerSessionId: input.selfSessionId,
      ownerEpoch: "yjs-space",
      revision: Date.now(),
      color,
      width,
      points: points.map((p) => ({ x: p.x, y: p.y })),
    };
    doc.transact(() => { doc.getMap<StudioP2pBoardEntity>("whiteboardEntities").set(id, entity); }, "local");
    return id;
  }, [input.canEdit, input.selfSessionId]);

  const addBoardNote = useCallback((
    x: number,
    y: number,
    text: string,
    color: StudioP2pBoardColor,
  ): string | null => {
    const trimmed = text.trim();
    if (!input.canEdit || !trimmed) return null;
    const doc = docRef.current;
    if (!doc) return null;
    const id = makeEntityId("note");
    const entity: StudioP2pBoardNote = {
      id,
      kind: "note",
      ownerSessionId: input.selfSessionId,
      ownerEpoch: "yjs-space",
      revision: Date.now(),
      color,
      x,
      y,
      text: trimmed,
    };
    doc.transact(() => { doc.getMap<StudioP2pBoardEntity>("whiteboardEntities").set(id, entity); }, "local");
    return id;
  }, [input.canEdit, input.selfSessionId]);

  const removeBoardEntity = useCallback((id: string): boolean => {
    if (!input.canEdit) return false;
    const doc = docRef.current;
    if (!doc) return false;
    const map = doc.getMap<StudioP2pBoardEntity>("whiteboardEntities");
    if (!map.has(id)) return false;
    doc.transact(() => { map.delete(id); }, "local");
    return true;
  }, [input.canEdit]);

  const clearOwnBoardEntities = useCallback(() => {
    if (!input.canEdit) return;
    const doc = docRef.current;
    if (!doc) return;
    const map = doc.getMap<StudioP2pBoardEntity>("whiteboardEntities");
    doc.transact(() => {
      for (const [key, entity] of map.entries()) {
        if (entity.ownerSessionId === input.selfSessionId) map.delete(key);
      }
    }, "local");
  }, [input.canEdit, input.selfSessionId]);

  const createSticky = useCallback((draft: {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly color: StudioStickyNoteColor;
  }) => {
    if (!input.canEdit) return;
    const doc = docRef.current;
    if (!doc) return;
    const note = createStickyNote({
      ...draft,
      authorSessionId: input.selfSessionId,
      authorName: input.selfDisplayName,
    });
    if (!note) return;
    doc.transact(() => { doc.getMap<StudioStickyNote>("stickyNotes").set(note.id, note); }, "local");
  }, [input.canEdit, input.selfDisplayName, input.selfSessionId]);

  const mutateSticky = useCallback((id: string, transform: (note: StudioStickyNote) => StudioStickyNote | null) => {
    if (!input.canEdit) return;
    const doc = docRef.current;
    if (!doc) return;
    const map = doc.getMap<StudioStickyNote>("stickyNotes");
    const existing = map.get(id);
    if (!existing) return;
    const next = transform(existing);
    doc.transact(() => {
      if (next === null) map.delete(id);
      else map.set(id, next);
    }, "local");
  }, [input.canEdit]);

  const addReviewPin = useCallback((pin: Omit<SpaceCutReviewPin, "id" | "authorSessionId" | "authorName" | "createdAt" | "status">) => {
    if (!input.canEdit || !pin.comment.trim()) return null;
    const doc = docRef.current;
    if (!doc) return null;
    const id = makeEntityId("rpin");
    const record: SpaceCutReviewPin = {
      id,
      cutId: pin.cutId,
      x: Math.max(0, Math.min(1, pin.x)),
      y: Math.max(0, Math.min(1, pin.y)),
      comment: pin.comment.trim().slice(0, 280),
      status: "open",
      authorSessionId: input.selfSessionId,
      authorName: input.selfDisplayName,
      createdAt: Date.now(),
    };
    doc.transact(() => { doc.getMap<SpaceCutReviewPin>("reviewPins").set(id, record); }, "local");
    return id;
  }, [input.canEdit, input.selfDisplayName, input.selfSessionId]);

  const toggleReviewPinResolved = useCallback((id: string) => {
    if (!input.canEdit) return;
    const doc = docRef.current;
    if (!doc) return;
    const map = doc.getMap<SpaceCutReviewPin>("reviewPins");
    const existing = map.get(id);
    if (!existing) return;
    doc.transact(() => {
      map.set(id, { ...existing, status: existing.status === "resolved" ? "open" : "resolved" });
    }, "local");
  }, [input.canEdit]);

  const addBulletin = useCallback((title: string, body: string) => {
    if (!input.canEdit || !title.trim()) return;
    const doc = docRef.current;
    if (!doc) return;
    const id = makeEntityId("bul");
    const item: SpaceBulletinItem = {
      id,
      title: title.trim().slice(0, 80),
      body: body.trim().slice(0, 240),
      pinned: false,
      authorName: input.selfDisplayName,
      createdAt: Date.now(),
    };
    doc.transact(() => { doc.getMap<SpaceBulletinItem>("bulletinBoard").set(id, item); }, "local");
  }, [input.canEdit, input.selfDisplayName]);

  const upsertDeadline = useCallback((deadline: { readonly id?: string; readonly episodeLabel: string; readonly title: string; readonly targetIso: string }) => {
    if (!input.canEdit || !deadline.title.trim()) return;
    const doc = docRef.current;
    if (!doc) return;
    const id = deadline.id ?? makeEntityId("dl");
    const item: SpaceDeadlineWidget = {
      id,
      episodeLabel: deadline.episodeLabel.trim().slice(0, 32) || "EP",
      title: deadline.title.trim().slice(0, 80),
      targetIso: deadline.targetIso,
      updatedAt: Date.now(),
    };
    doc.transact(() => { doc.getMap<SpaceDeadlineWidget>("deadlineWidgets").set(id, item); }, "local");
  }, [input.canEdit]);

  const updateRoomPreset = useCallback((preset: Partial<SpaceRoomPresetState>) => {
    if (!input.canEdit) return;
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => {
      const map = doc.getMap<unknown>("roomPreset");
      if (preset.themeId !== undefined) map.set("themeId", preset.themeId);
      if (preset.timeOfDayHours !== undefined) map.set("timeOfDayHours", preset.timeOfDayHours);
      if (preset.interiorDimmer !== undefined) map.set("interiorDimmer", preset.interiorDimmer);
    }, "local");
  }, [input.canEdit]);

  const mergeSoloToCloud = useCallback((): boolean => {
    if (!input.canEdit || input.personal || !input.signedIn || storageKey === soloStorageKey || scopeRef.current !== storageKey) return false;
    const rawSolo = readLocalBase64(soloStorageKey);
    const doc = docRef.current;
    if (!rawSolo || !doc) return false;
    const update = decodeYjsUpdateBase64(rawSolo);
    if (!update?.byteLength) return false;
    let rawTarget: string | null;
    try {
      const storage = globalThis.localStorage;
      if (!storage) return false;
      rawTarget = storage.getItem(storageKey);
    } catch { return false; }
    const mergeDoc = new Y.Doc();
    try {
      // 최초 읽기가 실패했거나 다른 탭이 저장했을 수 있으므로 현재 대상을 먼저 복원한다.
      // 양쪽 원본 검증이 끝나기 전에는 활성 문서의 저장·브로드캐스트를 유발하지 않는다.
      if (rawTarget !== null) {
        const targetUpdate = decodeYjsUpdateBase64(rawTarget);
        if (!targetUpdate?.byteLength) return false;
        Y.applyUpdate(mergeDoc, targetUpdate, "hydrate");
      }
      Y.applyUpdate(mergeDoc, update, "hydrate");
      mergeLocalSpaceDocIntoRemote(mergeDoc, doc);
    } catch {
      return false;
    } finally {
      mergeDoc.destroy();
    }
    // 다른 방이나 아직 저장하지 못한 대상에 병합한 뒤 개인 원본을 지우지 않는다.
    const merged = encodeYjsUpdateBase64(Y.encodeStateAsUpdate(doc));
    if (!writeLocalBase64(storageKey, merged) || !removeLocalKey(soloStorageKey, rawSolo)) return false;
    setHasPendingSoloMerge(false);
    return true;
  }, [input.canEdit, input.personal, input.signedIn, soloStorageKey, storageKey]);

  const boardSnapshot = useMemo<StudioP2pBoardSnapshot>(() => ({
    available: true,
    canEdit: input.canEdit,
    entities: state.boardEntities,
    readyPeerIds: input.directPort
      ? input.directPort.getPeers().map((peer) => peer.sessionId).filter((id) => id !== input.selfSessionId)
      : [],
  }), [input.canEdit, input.directPort, input.selfSessionId, state.boardEntities]);

  return {
    state,
    boardSnapshot,
    hasPendingSoloMerge,
    addStroke,
    addBoardNote,
    removeBoardEntity,
    clearOwnBoardEntities,
    createSticky,
    moveSticky: (id: string, x: number, y: number) => mutateSticky(id, (n) => moveStickyNote(n, x, y)),
    resizeSticky: (id: string, w: number, h: number) => mutateSticky(id, (n) => resizeStickyNote(n, w, h)),
    editSticky: (id: string, text: string) => mutateSticky(id, (n) => editStickyNoteText(n, text)),
    toggleStickyDone: (id: string) => mutateSticky(id, (n) => toggleStickyNoteDone(n)),
    recolorSticky: (id: string, color: StudioStickyNoteColor) => mutateSticky(id, (n) => recolorStickyNote(n, color)),
    removeSticky: (id: string) => mutateSticky(id, () => null),
    addReviewPin,
    toggleReviewPinResolved,
    addBulletin,
    upsertDeadline,
    updateRoomPreset,
    mergeSoloToCloud,
  };
}
