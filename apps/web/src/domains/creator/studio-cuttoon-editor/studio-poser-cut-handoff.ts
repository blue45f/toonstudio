import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import { readStudioLocalDraftOriginRoom, studioLocalDraftOwnerScope } from "../live/studio-live-local-draft-owner";
import { readStudioLiveRoomQuery, resolveStudioLiveInstantWorkIdForTab, STUDIO_LIVE_ROOM_SEARCH_PARAM, withStudioLiveJamRoom } from "../live/studio-live-jam-session";
import type { StudioDocumentLayoutRuntime } from "../studio-router/studio-document-layout-context";
import { parseStudioWorkspaceRoute, POSER_CUT_QUERY, studioWorkspaceDocumentIdentity, type StudioWorkspaceLocationInput } from "../studio-workspace-route";

export { POSER_CUT_QUERY } from "../studio-workspace-route";
export const LEGACY_POSER_CUT_KEY = "toonstudio:poser:pending-cut-layer";
const POSER_CUT_TTL_MS = 5 * 60 * 1_000;
const keyFor = (id: string) => `toonstudio:poser:cut:v1:${id}`;
const validId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id);

export interface PoserCutRaster { readonly pngDataUrl: string; readonly width: number; readonly height: number; readonly displayWidth?: number; readonly displayHeight?: number }
interface PoserCutScope { readonly document: string; readonly roomId: string | null }
interface PoserCut extends PoserCutRaster {
  readonly owner: string | null;
  readonly scope: PoserCutScope;
  readonly expiresAt: number;
}
type PoserCutRoom = Pick<StudioDocumentLayoutRuntime, "instantWorkId" | "liveRoomParam" | "workId" | "remixId">;

function isRaster(value: unknown): value is PoserCutRaster {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PoserCutRaster>;
  const validSize = (size: unknown): size is number => typeof size === "number" && Number.isSafeInteger(size) && size > 0;
  const displayValid = (display: unknown, original: number) => display === undefined || (validSize(display) && display <= original);
  return typeof row.pngDataUrl === "string" && /^data:image\/png;base64,[a-z\d+/]+=*$/iu.test(row.pngDataUrl)
    && validSize(row.width) && validSize(row.height) && displayValid(row.displayWidth, row.width) && displayValid(row.displayHeight, row.height);
}

function destinationScope(location: StudioWorkspaceLocationInput): PoserCutScope | null {
  const route = parseStudioWorkspaceRoute(location);
  const params = new URLSearchParams(location.search);
  if (!route.valid || route.presentation !== "editor" || (route.surface !== "canvas" && route.surface !== "comic")
    || route.remixSourceWorkId || params.has("version") || params.getAll(STUDIO_LIVE_ROOM_SEARCH_PARAM).length > 1) return null;
  return { document: studioWorkspaceDocumentIdentity(route), roomId: readStudioLiveRoomQuery(params) };
}

function anonymousDraftRoom(ownerId: string | null, sessionStorage: Storage): string {
  const scope = studioLocalDraftOwnerScope({ ownerId, projectId: null, documentId: null, draftId: null });
  const previousRoom = readStudioLocalDraftOriginRoom(window.localStorage, scope);
  return previousRoom ?? resolveStudioLiveInstantWorkIdForTab({
    workId: null, remixId: null, roomId: null, storage: sessionStorage,
  });
}

function isOwnedRoom(roomId: string | null, room: PoserCutRoom | null): boolean {
  return roomId !== null && room !== null && !room.workId && !room.remixId
    && room.liveRoomParam === roomId && room.instantWorkId === roomId;
}

export function readLegacyPoserCut(storage: Storage): PoserCutRaster | null {
  const raw = storage.getItem(LEGACY_POSER_CUT_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRaster(value) ? value : null;
  } catch { return null; }
}

export function stagePoserCut(target: string, owner: string | null, raster: PoserCutRaster): string {
  if (!isRaster(raster)) throw new Error("포즈 PNG를 읽지 못했습니다. 다시 캡처해 주세요.");
  const url = new URL(target, window.location.origin);
  const destination = destinationScope(url);
  if (url.origin !== window.location.origin || !destination) throw new Error("포즈를 보낼 원고 주소를 확인해 주세요.");
  const storage = window.sessionStorage;
  const roomId = destination.document === "draft"
    ? destination.roomId ?? anonymousDraftRoom(owner, storage)
    : destination.roomId;
  if (roomId !== null) url.search = withStudioLiveJamRoom(url.searchParams, roomId).toString();
  const id = createSecureRandomUuid("포즈 컷 전달 ID를 만들 수 없습니다.");
  const cut: PoserCut = { pngDataUrl: raster.pngDataUrl, width: raster.width, height: raster.height,
    displayWidth: raster.displayWidth, displayHeight: raster.displayHeight, owner,
    scope: { document: destination.document, roomId }, expiresAt: Date.now() + POSER_CUT_TTL_MS };
  storage.setItem(keyFor(id), JSON.stringify(cut));
  url.searchParams.set(POSER_CUT_QUERY, id);
  return url.pathname + url.search + url.hash;
}

export function readPoserCut(
  storage: Storage,
  id: string,
  owner: string | null,
  location: StudioWorkspaceLocationInput,
  room: PoserCutRoom | null = null,
): PoserCutRaster | null {
  if (!validId(id)) return null;
  const destination = destinationScope(location);
  if (!destination || (room && room.liveRoomParam !== destination.roomId)) return null;
  const raw = storage.getItem(keyFor(id));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRaster(value) || !("owner" in value) || value.owner !== owner) return null;
  const ownedRoom = isOwnedRoom(destination.roomId, room);
  if (!("scope" in value)) {
    // 주소에 원고 ID가 있던 이전 대기열만 복구한다. 익명 주소는 대상 초안이나 룸을 증명할 수 없다.
    const previous = "path" in value && typeof value.path === "string" ? destinationScope({ pathname: value.path }) : null;
    return previous && previous.document !== "draft" && previous.document === destination.document
      && (destination.roomId === null || ownedRoom) ? value : null;
  }
  const pinned = value.scope;
  if (!pinned || typeof pinned !== "object" || !("document" in pinned) || pinned.document !== destination.document
    || !("roomId" in pinned)) return null;
  if (destination.document === "draft") {
    if (!ownedRoom || pinned.roomId !== destination.roomId) return null;
  } else if (pinned.roomId === null) {
    if (destination.roomId !== null && !ownedRoom) return null;
  } else if (pinned.roomId !== destination.roomId || !room) {
    return null;
  }
  if (!("expiresAt" in value) || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)) return null;
  if (Date.now() >= value.expiresAt) {
    storage.removeItem(keyFor(id));
    return null;
  }
  return value;
}

export function finishPoserCut(storage: Storage, id: string) {
  if (validId(id)) storage.removeItem(keyFor(id));
}
