/**
 * Studio Infinite Spatial Multiboard Viewport & Command Stream Timeline Scrubber
 *
 * Magma Multiboard + Drawpile 커맨드 스트림 아키텍처의 순수·결정적 TypeScript 구현:
 * - 60컷 무한 2D 공간 멀티보드 배치, 4단계 LOD 프록시 타일 전환 및 VRAM LRU 캐시 축출.
 * - 팀원 공간 미니맵 투영, 아바타 클러스터링, 미해결 스티키 핀 마커, 1클릭 Follow 추적.
 * - 단조 시퀀스 기반 커맨드 스트림 체크포인트 스크러버, 타임랩스 샘플링, 동시 편집 핫스팟 탐지.
 */

import type { StudioMagmaPointerDisplayMode } from "./studio-magma-collaboration";

// ---------------------------------------------------------------------------
// 1. 무한 2D 공간 멀티보드 모델 & 60컷 LOD 프록시 타일 전환
// ---------------------------------------------------------------------------

export type SpatialBoardRole = "cut" | "character-sheet" | "reference" | "color-script" | "cover";
export type BoardLodTier = "culled" | "proxy-256" | "proxy-512" | "live-full";

export interface SpatialBoardNode {
  readonly id: string;
  readonly label: string;
  readonly role: SpatialBoardRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly locked: boolean;
  readonly hidden?: boolean;
  readonly cutNumber?: number;
  readonly ownerUserId?: string;
  readonly strokeCount: number;
  readonly updatedAtMs: number;
}

export interface SpatialMultiboardScene {
  readonly sceneId: string;
  readonly boards: readonly SpatialBoardNode[];
}

export interface MultiboardCameraState {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export interface BoardLodAssignment {
  readonly boardId: string;
  readonly tier: BoardLodTier;
  readonly screenWidthPx: number;
  readonly screenHeightPx: number;
  readonly distanceToCenterPx: number;
  readonly estimatedVramBytes: number;
}

export interface MultiboardLodOptions {
  readonly overscanPx?: number;
  readonly proxy512MinScreenPx?: number;
  readonly liveFullMinScreenPx?: number;
  readonly maxSimultaneousLiveBoards?: number;
}

export interface MultiboardLodEvaluation {
  readonly assignments: readonly BoardLodAssignment[];
  readonly visibleCount: number;
  readonly culledCount: number;
  readonly proxy256Count: number;
  readonly proxy512Count: number;
  readonly liveFullCount: number;
  readonly totalEstimatedVramBytes: number;
}

export interface MultiboardTileCacheEntry {
  readonly boardId: string;
  readonly tier: Exclude<BoardLodTier, "culled">;
  readonly bytes: number;
  readonly lastUsedTick: number;
}

export interface MultiboardTileCacheState {
  readonly budgetBytes: number;
  readonly tick: number;
  readonly entries: Readonly<Record<string, MultiboardTileCacheEntry>>;
}

const BYTES_PROXY_256 = 256 * 256 * 4;
const BYTES_PROXY_512 = 512 * 512 * 4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function estimateTierBytes(board: SpatialBoardNode, tier: BoardLodTier): number {
  if (tier === "culled") return 0;
  if (tier === "proxy-256") return BYTES_PROXY_256;
  if (tier === "proxy-512") return BYTES_PROXY_512;
  return Math.max(BYTES_PROXY_512, Math.round(board.width * board.height * 4));
}

/** 에피소드 전 컷(예: 60컷)을 공간 멀티보드 그리드로 배치한다. */
export function createEpisodeMultiboardScene(
  sceneId: string,
  cutCount: number,
  options?: {
    readonly columns?: number;
    readonly cutWidth?: number;
    readonly cutHeight?: number;
    readonly gutterX?: number;
    readonly gutterY?: number;
    readonly includeReferenceSideboards?: boolean;
    readonly nowMs?: number;
  },
): SpatialMultiboardScene {
  const count = clamp(Math.floor(cutCount), 0, 200);
  const cols = clamp(Math.floor(options?.columns ?? 6), 1, 20);
  const cutW = Math.max(200, options?.cutWidth ?? 800);
  const cutH = Math.max(200, options?.cutHeight ?? 1280);
  const gapX = options?.gutterX ?? 160;
  const gapY = options?.gutterY ?? 200;
  const nowMs = options?.nowMs ?? 1700000000000;

  const boards: SpatialBoardNode[] = Array.from({ length: count }, (_, i) => ({
    id: `cut-${String(i + 1).padStart(2, "0")}`,
    label: `컷 ${i + 1}`,
    role: "cut",
    x: (i % cols) * (cutW + gapX),
    y: Math.floor(i / cols) * (cutH + gapY),
    width: cutW,
    height: cutH,
    locked: false,
    cutNumber: i + 1,
    strokeCount: 0,
    updatedAtMs: nowMs,
  }));

  if (options?.includeReferenceSideboards) {
    boards.push(
      { id: "side-character-sheet", label: "캐릭터 설정 시트", role: "character-sheet", x: -(cutW + gapX * 1.5), y: 0, width: cutW, height: cutH, locked: false, strokeCount: 0, updatedAtMs: nowMs },
      { id: "side-color-script", label: "컬러 스크립트", role: "color-script", x: -(cutW + gapX * 1.5), y: cutH + gapY, width: cutW, height: Math.round(cutH * 0.65), locked: false, strokeCount: 0, updatedAtMs: nowMs },
    );
  }
  return { sceneId, boards };
}

export function fitCameraToBoards(
  boards: readonly SpatialBoardNode[],
  viewportWidthPx: number,
  viewportHeightPx: number,
  paddingPx = 48,
): MultiboardCameraState {
  const active = boards.filter((b) => !b.hidden);
  if (active.length === 0) return { centerX: 0, centerY: 0, zoom: 1, viewportWidthPx, viewportHeightPx };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of active) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  const zoom = clamp(Math.min(Math.max(16, viewportWidthPx - paddingPx * 2) / Math.max(1, maxX - minX), Math.max(16, viewportHeightPx - paddingPx * 2) / Math.max(1, maxY - minY)), 0.02, 8);
  return { centerX: (minX + maxX) * 0.5, centerY: (minY + maxY) * 0.5, zoom, viewportWidthPx, viewportHeightPx };
}

/** 줌 배율과 뷰포트 프러스텀을 기반으로 60컷 멀티보드의 LOD 프록시 타일을 자동 할당한다. */
export function evaluateMultiboardViewportLod(
  scene: SpatialMultiboardScene,
  camera: MultiboardCameraState,
  options: MultiboardLodOptions = {},
): MultiboardLodEvaluation {
  const safeZoom = Math.max(0.01, camera.zoom);
  const overscanWorld = (options.overscanPx ?? 120) / safeZoom;
  const halfW = camera.viewportWidthPx / (2 * safeZoom) + overscanWorld;
  const halfH = camera.viewportHeightPx / (2 * safeZoom) + overscanWorld;
  const viewMinX = camera.centerX - halfW;
  const viewMaxX = camera.centerX + halfW;
  const viewMinY = camera.centerY - halfH;
  const viewMaxY = camera.centerY + halfH;
  const proxy512Min = options.proxy512MinScreenPx ?? 220;
  const liveFullMin = options.liveFullMinScreenPx ?? 560;
  const maxLive = clamp(options.maxSimultaneousLiveBoards ?? 4, 1, 16);

  const drafts = scene.boards.map((board) => {
    if (board.hidden) {
      return { board, tier: "culled" as BoardLodTier, screenWidthPx: 0, screenHeightPx: 0, distanceToCenterPx: Infinity };
    }
    const intersects = board.x + board.width >= viewMinX && board.x <= viewMaxX && board.y + board.height >= viewMinY && board.y <= viewMaxY;
    const screenWidthPx = board.width * camera.zoom;
    const screenHeightPx = board.height * camera.zoom;
    const distanceToCenterPx = Math.hypot(board.x + board.width * 0.5 - camera.centerX, board.y + board.height * 0.5 - camera.centerY) * camera.zoom;
    const maxSpan = Math.max(screenWidthPx, screenHeightPx);
    const tier: BoardLodTier = !intersects ? "culled" : maxSpan >= liveFullMin ? "live-full" : maxSpan >= proxy512Min ? "proxy-512" : "proxy-256";
    return { board, tier, screenWidthPx, screenHeightPx, distanceToCenterPx };
  });

  const liveCandidates = drafts.filter((d) => d.tier === "live-full").sort((a, b) => a.distanceToCenterPx - b.distanceToCenterPx);
  for (let i = maxLive; i < liveCandidates.length; i += 1) liveCandidates[i]!.tier = "proxy-512";

  let visibleCount = 0;
  let culledCount = 0;
  let proxy256Count = 0;
  let proxy512Count = 0;
  let liveFullCount = 0;
  let totalEstimatedVramBytes = 0;

  const assignments: BoardLodAssignment[] = drafts.map((d) => {
    const bytes = estimateTierBytes(d.board, d.tier);
    totalEstimatedVramBytes += bytes;
    if (d.tier === "culled") culledCount += 1;
    else {
      visibleCount += 1;
      if (d.tier === "proxy-256") proxy256Count += 1;
      else if (d.tier === "proxy-512") proxy512Count += 1;
      else liveFullCount += 1;
    }
    return { boardId: d.board.id, tier: d.tier, screenWidthPx: d.screenWidthPx, screenHeightPx: d.screenHeightPx, distanceToCenterPx: d.distanceToCenterPx, estimatedVramBytes: bytes };
  });

  return { assignments, visibleCount, culledCount, proxy256Count, proxy512Count, liveFullCount, totalEstimatedVramBytes };
}

/** GPU 프록시 타일 캐시에 가시 보드를 반영하고 VRAM 예산 초과 시 LRU 축출을 수행한다. */
export function updateMultiboardTileCache(
  cache: MultiboardTileCacheState,
  lod: MultiboardLodEvaluation,
): { readonly nextCache: MultiboardTileCacheState; readonly evictedBoardIds: readonly string[]; readonly usedBytes: number } {
  const nextTick = cache.tick + 1;
  const nextEntries: Record<string, MultiboardTileCacheEntry> = { ...cache.entries };
  const activeIds = new Set<string>();
  for (const item of lod.assignments) {
    if (item.tier === "culled") continue;
    activeIds.add(item.boardId);
    nextEntries[item.boardId] = { boardId: item.boardId, tier: item.tier, bytes: item.estimatedVramBytes, lastUsedTick: nextTick };
  }
  let usedBytes = Object.values(nextEntries).reduce((sum, e) => sum + e.bytes, 0);
  const evictedBoardIds: string[] = [];
  if (usedBytes > cache.budgetBytes) {
    const candidates = Object.values(nextEntries).sort((a, b) => {
      const aAct = activeIds.has(a.boardId) ? 1 : 0;
      const bAct = activeIds.has(b.boardId) ? 1 : 0;
      if (aAct !== bAct) return aAct - bAct;
      if (a.lastUsedTick !== b.lastUsedTick) return a.lastUsedTick - b.lastUsedTick;
      return b.bytes - a.bytes;
    });
    for (const candidate of candidates) {
      if (usedBytes <= cache.budgetBytes) break;
      if (activeIds.has(candidate.boardId) && candidate.tier === "live-full") continue;
      delete nextEntries[candidate.boardId];
      usedBytes -= candidate.bytes;
      evictedBoardIds.push(candidate.boardId);
    }
  }
  return { nextCache: { budgetBytes: cache.budgetBytes, tick: nextTick, entries: nextEntries }, evictedBoardIds, usedBytes };
}

// ---------------------------------------------------------------------------
// 2. 팀원 공간 미니맵 · 아바타 클러스터 · 스티키 핀 · Follow 프레즌스
// ---------------------------------------------------------------------------

export interface SpatialPeerPresence {
  readonly userId: string;
  readonly displayName: string;
  readonly badgeToken: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly cameraCenterX: number;
  readonly cameraCenterY: number;
  readonly cameraZoom: number;
  readonly activeBoardId?: string;
  readonly pointerMode?: StudioMagmaPointerDisplayMode;
  readonly isDrawing?: boolean;
  readonly lastActiveAtMs: number;
}

export interface SpatialStickyPin {
  readonly id: string;
  readonly boardId?: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly authorUserId: string;
  readonly text: string;
  readonly resolved: boolean;
  readonly createdAtMs: number;
}

export interface MinimapBoardRect {
  readonly boardId: string;
  readonly role: SpatialBoardRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MinimapAvatarCluster {
  readonly clusterId: string;
  readonly x: number;
  readonly y: number;
  readonly memberUserIds: readonly string[];
  readonly activeBoardId?: string;
  readonly leadDisplayName: string;
}

export interface SpatialMinimapProjection {
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly scale: number;
  readonly boards: readonly MinimapBoardRect[];
  readonly viewportRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly peerClusters: readonly MinimapAvatarCluster[];
  readonly unresolvedPinMarkers: readonly { readonly pinId: string; readonly x: number; readonly y: number }[];
}

export interface FollowPresenceState {
  readonly followingUserId: string | null;
  readonly smoothFactor01: number;
}

/** 무한 멀티보드·카메라·팀원·스티키 핀을 미니맵 좌표계로 투영하고 인접 팀원을 클러스터링한다. */
export function projectSpatialMinimap(
  scene: SpatialMultiboardScene,
  camera: MultiboardCameraState,
  peers: readonly SpatialPeerPresence[],
  pins: readonly SpatialStickyPin[],
  minimapWidthPx: number,
  minimapHeightPx: number,
  options?: { readonly paddingPx?: number; readonly clusterRadiusPx?: number },
): SpatialMinimapProjection {
  const padding = options?.paddingPx ?? 8;
  const clusterRadius = options?.clusterRadiusPx ?? 14;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const b of scene.boards) {
    if (b.hidden) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const p of peers) {
    minX = Math.min(minX, p.worldX);
    minY = Math.min(minY, p.worldY);
    maxX = Math.max(maxX, p.worldX);
    maxY = Math.max(maxY, p.worldY);
  }
  if (!Number.isFinite(minX)) {
    minX = -500;
    minY = -500;
    maxX = 500;
    maxY = 500;
  }

  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const scale = Math.min(Math.max(1, minimapWidthPx - padding * 2) / worldW, Math.max(1, minimapHeightPx - padding * 2) / worldH);
  const offsetX = padding + (minimapWidthPx - padding * 2 - worldW * scale) * 0.5;
  const offsetY = padding + (minimapHeightPx - padding * 2 - worldH * scale) * 0.5;
  const toMiniX = (wx: number): number => offsetX + (wx - minX) * scale;
  const toMiniY = (wy: number): number => offsetY + (wy - minY) * scale;

  const boards: MinimapBoardRect[] = scene.boards
    .filter((b) => !b.hidden)
    .map((b) => ({ boardId: b.id, role: b.role, x: toMiniX(b.x), y: toMiniY(b.y), width: Math.max(2, b.width * scale), height: Math.max(2, b.height * scale) }));

  const halfViewW = camera.viewportWidthPx / (2 * Math.max(0.01, camera.zoom));
  const halfViewH = camera.viewportHeightPx / (2 * Math.max(0.01, camera.zoom));
  const viewportRect = { x: toMiniX(camera.centerX - halfViewW), y: toMiniY(camera.centerY - halfViewH), width: halfViewW * 2 * scale, height: halfViewH * 2 * scale };

  const clusters: { x: number; y: number; members: SpatialPeerPresence[] }[] = [];
  for (const peer of peers) {
    if (peer.pointerMode === "none") continue;
    const mx = toMiniX(peer.worldX);
    const my = toMiniY(peer.worldY);
    const existing = clusters.find((c) => Math.hypot(c.x - mx, c.y - my) <= clusterRadius);
    if (existing) {
      const n = existing.members.length;
      existing.x = (existing.x * n + mx) / (n + 1);
      existing.y = (existing.y * n + my) / (n + 1);
      existing.members.push(peer);
    } else {
      clusters.push({ x: mx, y: my, members: [peer] });
    }
  }

  return {
    worldBounds: { minX, minY, maxX, maxY },
    scale,
    boards,
    viewportRect,
    peerClusters: clusters.map((c, idx) => ({
      clusterId: `cluster-${idx}`,
      x: c.x,
      y: c.y,
      memberUserIds: c.members.map((m) => m.userId),
      activeBoardId: c.members[0]?.activeBoardId,
      leadDisplayName: c.members[0]?.displayName ?? "익명",
    })),
    unresolvedPinMarkers: pins.filter((pin) => !pin.resolved).map((pin) => ({ pinId: pin.id, x: toMiniX(pin.worldX), y: toMiniY(pin.worldY) })),
  };
}

/** 1클릭 Follow 대상 팀원의 시점으로 카메라를 부드럽게 추적한다. */
export function stepFollowPeerCamera(
  camera: MultiboardCameraState,
  follow: FollowPresenceState,
  peers: readonly SpatialPeerPresence[],
  manualCameraInputDetected = false,
): { readonly nextCamera: MultiboardCameraState; readonly nextFollow: FollowPresenceState; readonly detachedByManualInput: boolean } {
  if (!follow.followingUserId) return { nextCamera: camera, nextFollow: follow, detachedByManualInput: false };
  if (manualCameraInputDetected) return { nextCamera: camera, nextFollow: { ...follow, followingUserId: null }, detachedByManualInput: true };
  const target = peers.find((p) => p.userId === follow.followingUserId);
  if (!target) return { nextCamera: camera, nextFollow: follow, detachedByManualInput: false };
  const alpha = clamp(follow.smoothFactor01, 0.05, 1);
  return {
    nextCamera: {
      ...camera,
      centerX: camera.centerX + (target.cameraCenterX - camera.centerX) * alpha,
      centerY: camera.centerY + (target.cameraCenterY - camera.centerY) * alpha,
      zoom: clamp(camera.zoom + (target.cameraZoom - camera.zoom) * alpha, 0.02, 8),
    },
    nextFollow: follow,
    detachedByManualInput: false,
  };
}

// ---------------------------------------------------------------------------
// 3. Drawpile식 커맨드 스트림 타임라인 스크러버 & 체크포인트 복원
// ---------------------------------------------------------------------------

export type MultiboardCommandAction =
  | { readonly kind: "board-add"; readonly board: SpatialBoardNode }
  | { readonly kind: "board-move"; readonly boardId: string; readonly x: number; readonly y: number }
  | { readonly kind: "board-resize"; readonly boardId: string; readonly width: number; readonly height: number }
  | { readonly kind: "board-lock"; readonly boardId: string; readonly locked: boolean }
  | { readonly kind: "stroke-commit"; readonly boardId: string; readonly strokeId: string }
  | { readonly kind: "pin-add"; readonly pin: SpatialStickyPin }
  | { readonly kind: "pin-resolve"; readonly pinId: string; readonly resolved: boolean };

export interface MultiboardCommandEntry {
  readonly seq: number;
  readonly timestampMs: number;
  readonly actorUserId: string;
  readonly action: MultiboardCommandAction;
}

export interface MultiboardStreamSnapshot {
  readonly seq: number;
  readonly boards: readonly SpatialBoardNode[];
  readonly pins: readonly SpatialStickyPin[];
  readonly strokeIdsByBoard: Readonly<Record<string, readonly string[]>>;
}

export interface MultiboardCommandStream {
  readonly sceneId: string;
  readonly checkpointInterval: number;
  readonly baseSnapshot: MultiboardStreamSnapshot;
  readonly checkpoints: readonly MultiboardStreamSnapshot[];
  readonly entries: readonly MultiboardCommandEntry[];
}

export interface MultiboardScrubResult {
  readonly appliedSeq: number;
  readonly usedCheckpointSeq: number;
  readonly replayedCommandCount: number;
  readonly snapshot: MultiboardStreamSnapshot;
  readonly stateHash: string;
}

export interface ConcurrentEditHotspot {
  readonly boardId: string;
  readonly startSeq: number;
  readonly endSeq: number;
  readonly actorUserIds: readonly string[];
  readonly commandCount: number;
}

function applySingleCommand(state: MultiboardStreamSnapshot, entry: MultiboardCommandEntry): MultiboardStreamSnapshot {
  const { action } = entry;
  if (action.kind === "board-add") {
    const exists = state.boards.some((b) => b.id === action.board.id);
    return { ...state, seq: entry.seq, boards: exists ? state.boards.map((b) => (b.id === action.board.id ? action.board : b)) : [...state.boards, action.board] };
  }
  if (action.kind === "board-move") {
    return { ...state, seq: entry.seq, boards: state.boards.map((b) => (b.id === action.boardId && !b.locked ? { ...b, x: action.x, y: action.y, updatedAtMs: entry.timestampMs } : b)) };
  }
  if (action.kind === "board-resize") {
    return { ...state, seq: entry.seq, boards: state.boards.map((b) => (b.id === action.boardId && !b.locked ? { ...b, width: Math.max(64, action.width), height: Math.max(64, action.height), updatedAtMs: entry.timestampMs } : b)) };
  }
  if (action.kind === "board-lock") {
    return { ...state, seq: entry.seq, boards: state.boards.map((b) => (b.id === action.boardId ? { ...b, locked: action.locked, updatedAtMs: entry.timestampMs } : b)) };
  }
  if (action.kind === "stroke-commit") {
    const target = state.boards.find((b) => b.id === action.boardId);
    if (!target || target.locked) return { ...state, seq: entry.seq };
    const nextIds = [...(state.strokeIdsByBoard[action.boardId] ?? []), action.strokeId];
    return {
      ...state,
      seq: entry.seq,
      boards: state.boards.map((b) => (b.id === action.boardId ? { ...b, strokeCount: nextIds.length, updatedAtMs: entry.timestampMs } : b)),
      strokeIdsByBoard: { ...state.strokeIdsByBoard, [action.boardId]: nextIds },
    };
  }
  if (action.kind === "pin-add") return { ...state, seq: entry.seq, pins: [...state.pins, action.pin] };
  return { ...state, seq: entry.seq, pins: state.pins.map((p) => (p.id === action.pinId ? { ...p, resolved: action.resolved } : p)) };
}

function hashStreamSnapshot(snapshot: MultiboardStreamSnapshot): string {
  const summary = `${snapshot.seq}|${snapshot.boards.map((b) => `${b.id}:${Math.round(b.x)},${Math.round(b.y)},${b.strokeCount},${b.locked ? 1 : 0}`).join(";")}|${snapshot.pins.map((p) => `${p.id}:${p.resolved ? 1 : 0}`).join(";")}`;
  let h = 2166136261;
  for (let i = 0; i < summary.length; i += 1) h = Math.imul(h ^ summary.charCodeAt(i), 16777619) >>> 0;
  return `mb-${h.toString(16).padStart(8, "0")}`;
}

export function createMultiboardCommandStream(initialScene: SpatialMultiboardScene, checkpointInterval = 25): MultiboardCommandStream {
  const baseSnapshot: MultiboardStreamSnapshot = { seq: 0, boards: [...initialScene.boards], pins: [], strokeIdsByBoard: {} };
  return { sceneId: initialScene.sceneId, checkpointInterval: Math.max(2, Math.floor(checkpointInterval)), baseSnapshot, checkpoints: [baseSnapshot], entries: [] };
}

export function appendMultiboardCommand(
  stream: MultiboardCommandStream,
  draft: { readonly actorUserId: string; readonly timestampMs: number; readonly action: MultiboardCommandAction },
): MultiboardCommandStream {
  const nextSeq = stream.entries.length + 1;
  const nextEntries = [...stream.entries, { seq: nextSeq, timestampMs: draft.timestampMs, actorUserId: draft.actorUserId, action: draft.action }];
  const nextCheckpoints =
    nextSeq % stream.checkpointInterval === 0
      ? [...stream.checkpoints, scrubMultiboardCommandStream({ ...stream, entries: nextEntries }, nextSeq).snapshot]
      : stream.checkpoints;
  return { ...stream, entries: nextEntries, checkpoints: nextCheckpoints };
}

/** 커맨드 스트림의 임의 시퀀스 `targetSeq`로 즉시 스크럽해 정확한 멀티보드 상태를 복원한다. */
export function scrubMultiboardCommandStream(stream: MultiboardCommandStream, targetSeq: number): MultiboardScrubResult {
  const clampedSeq = clamp(Math.floor(targetSeq), 0, stream.entries.length);
  let base = stream.baseSnapshot;
  for (const cp of stream.checkpoints) {
    if (cp.seq <= clampedSeq && cp.seq >= base.seq) base = cp;
  }
  let current = base;
  let replayed = 0;
  for (let i = base.seq; i < clampedSeq; i += 1) {
    const entry = stream.entries[i];
    if (!entry) break;
    current = applySingleCommand(current, entry);
    replayed += 1;
  }
  return { appliedSeq: clampedSeq, usedCheckpointSeq: base.seq, replayedCommandCount: replayed, snapshot: current, stateHash: hashStreamSnapshot(current) };
}

/** 타임랩스 생성을 위해 커맨드 스트림에서 균등 간격 프레임을 추출한다. */
export function sampleTimelapseKeyframes(stream: MultiboardCommandStream, frameCount: number): readonly MultiboardScrubResult[] {
  const count = clamp(Math.floor(frameCount), 1, 120);
  const maxSeq = stream.entries.length;
  if (maxSeq === 0) return [scrubMultiboardCommandStream(stream, 0)];
  return Array.from({ length: count }, (_, i) =>
    scrubMultiboardCommandStream(stream, count === 1 ? maxSeq : Math.round((i / (count - 1)) * maxSeq)),
  );
}

/** 동일 보드에서 여러 팀원이 짧은 시간 창 내에 동시 편집한 충돌 핫스팟 구간을 탐지한다. */
export function detectConcurrentBoardHotspots(stream: MultiboardCommandStream, windowMs = 5000): readonly ConcurrentEditHotspot[] {
  const byBoard = new Map<string, MultiboardCommandEntry[]>();
  for (const entry of stream.entries) {
    const boardId =
      entry.action.kind === "board-add"
        ? entry.action.board.id
        : entry.action.kind === "pin-add"
          ? entry.action.pin.boardId
          : entry.action.kind === "pin-resolve"
            ? undefined
            : entry.action.boardId;
    if (!boardId) continue;
    const list = byBoard.get(boardId) ?? [];
    list.push(entry);
    byBoard.set(boardId, list);
  }

  const hotspots: ConcurrentEditHotspot[] = [];
  for (const [boardId, list] of byBoard.entries()) {
    let startIdx = 0;
    while (startIdx < list.length) {
      let endIdx = startIdx;
      const actors = new Set<string>([list[startIdx]!.actorUserId]);
      while (endIdx + 1 < list.length && list[endIdx + 1]!.timestampMs - list[endIdx]!.timestampMs <= windowMs) {
        endIdx += 1;
        actors.add(list[endIdx]!.actorUserId);
      }
      if (actors.size >= 2) {
        hotspots.push({ boardId, startSeq: list[startIdx]!.seq, endSeq: list[endIdx]!.seq, actorUserIds: [...actors].sort(), commandCount: endIdx - startIdx + 1 });
      }
      startIdx = endIdx + 1;
    }
  }
  return hotspots.sort((a, b) => a.startSeq - b.startSeq);
}
