/**
 * 웹툰 스튜디오 본사(toon-hq) 설계도 → StudioVirtualSpaceWorldManifest 조립.
 *
 * 기존 월드 계약(방·충돌체·상호작용·좌석·NPC·음향 구역·오피스 존)을 그대로 따르므로 프레즌스·좌석 점유·NPC 대화·사일런트 존·
 * 레거시 Phaser 렌더러가 같은 manifest로 동작한다. 신규 2D 엔진은 isToonHqManifest로 이 manifest를 알아보고
 * 설계도의 풍부한 연출 정보(조명·벽 장식·물리 소품)를 함께 쓴다.
 */
import type { StudioOfficeZone } from "../../studio-virtual-space-office-zones";
import type { StudioVirtualSpacePoint } from "../../studio-virtual-space-model";
import { registerStudioNpcRole } from "../../studio-virtual-space-npc-director";
import { registerStudioVirtualWorldPresentation } from "../../studio-virtual-space-world-presentation";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionSlotDefinition,
  StudioWorldNpcDefinition,
  StudioWorldPropDefinition,
  StudioWorldRect,
  StudioWorldRoomDefinition,
} from "../../studio-virtual-space-world-manifest";
import { OFFICE2D_ASSET_ROOT, OFFICE2D_DESK_SEAT_OFFSET, office2dObjectUrl } from "../office2d-sprite-catalog";
import {
  TOON_HQ_BORDER,
  TOON_HQ_CAMPUS_PORTAL,
  TOON_HQ_DOOR_WIDTH,
  TOON_HQ_FURNITURE,
  TOON_HQ_HEIGHT,
  TOON_HQ_NORTH_WALL,
  TOON_HQ_NPCS,
  TOON_HQ_ROOMS,
  TOON_HQ_SIDE_WALL,
  TOON_HQ_SOUTH_WALL,
  TOON_HQ_WIDTH,
  type ToonHqFurniture,
  type ToonHqRoom,
  type ToonHqSeat,
} from "./toon-hq-blueprint";

export const TOON_HQ_MANIFEST_ID = "toonstudio-place-toon-hq";

const point = (x: number, y: number): StudioVirtualSpacePoint => Object.freeze({ x, y });
const rect = (x: number, y: number, width: number, height: number): StudioWorldRect => Object.freeze({ x, y, width, height });

/** 벽 하나(정면 벽·옆벽·남쪽 낮은 벽). 렌더러가 같은 목록으로 벽을 그린다. */
export interface ToonHqWallSegment extends StudioWorldRect {
  readonly id: string;
  readonly roomId: string;
  readonly side: "north" | "south" | "west" | "east";
}

function splitByDoor(
  room: ToonHqRoom,
  side: "north" | "south",
  y: number,
  height: number,
  doorX: number | undefined,
): ToonHqWallSegment[] {
  const left = room.x;
  const right = room.x + room.width;
  if (doorX === undefined) return [{ id: `${room.id}-wall-${side}`, roomId: room.id, side, x: left, y, width: room.width, height }];
  const doorLeft = Math.round(doorX - TOON_HQ_DOOR_WIDTH / 2);
  const doorRight = doorLeft + TOON_HQ_DOOR_WIDTH;
  const segments: ToonHqWallSegment[] = [];
  if (doorLeft > left) segments.push({ id: `${room.id}-wall-${side}-a`, roomId: room.id, side, x: left, y, width: doorLeft - left, height });
  if (right > doorRight) segments.push({ id: `${room.id}-wall-${side}-b`, roomId: room.id, side, x: doorRight, y, width: right - doorRight, height });
  return segments;
}

/** 방마다 북쪽 정면 벽(문 틈 포함)·남쪽 낮은 벽·좌우 옆벽을 만든다. 복도는 벽이 없다. */
export function toonHqWallSegments(): readonly ToonHqWallSegment[] {
  const walls: ToonHqWallSegment[] = [];
  for (const room of TOON_HQ_ROOMS) {
    if (room.row === "corridor") continue;
    walls.push(...splitByDoor(room, "north", room.y, TOON_HQ_NORTH_WALL, room.doors.north));
    walls.push(...splitByDoor(room, "south", room.y + room.height - TOON_HQ_SOUTH_WALL, TOON_HQ_SOUTH_WALL, room.doors.south));
    const sideTop = room.y + TOON_HQ_NORTH_WALL;
    const sideHeight = room.height - TOON_HQ_NORTH_WALL - TOON_HQ_SOUTH_WALL;
    walls.push({ id: `${room.id}-wall-west`, roomId: room.id, side: "west", x: room.x, y: sideTop, width: TOON_HQ_SIDE_WALL, height: sideHeight });
    walls.push({ id: `${room.id}-wall-east`, roomId: room.id, side: "east", x: room.x + room.width - TOON_HQ_SIDE_WALL, y: sideTop, width: TOON_HQ_SIDE_WALL, height: sideHeight });
  }
  return Object.freeze(walls.map((wall) => Object.freeze(wall)));
}

function borderColliders(): readonly StudioWorldRect[] {
  const b = TOON_HQ_BORDER;
  return [
    rect(0, 0, TOON_HQ_WIDTH, b),
    rect(0, TOON_HQ_HEIGHT - b, TOON_HQ_WIDTH, b),
    rect(0, b, b, TOON_HQ_HEIGHT - 2 * b),
    rect(TOON_HQ_WIDTH - b, b, b, TOON_HQ_HEIGHT - 2 * b),
  ];
}

export function toonHqFootprintRect(item: ToonHqFurniture): StudioWorldRect | null {
  if (!item.footprint) return null;
  return rect(Math.round(item.x - item.footprint.width / 2), Math.round(item.y - item.footprint.height), item.footprint.width, item.footprint.height);
}

/** 책상·부스 좌석과 회의 좌석. */
export function toonHqSeats(): readonly ToonHqSeat[] {
  const seats: ToonHqSeat[] = [];
  for (const item of TOON_HQ_FURNITURE) {
    if (!item.seat) continue;
    const booth = item.sprite === "focus-booth";
    const anchorY = item.y + OFFICE2D_DESK_SEAT_OFFSET.anchorY;
    seats.push(Object.freeze({
      id: `${item.id}-seat`,
      roomId: item.roomId,
      labelKo: item.seat.labelKo,
      labelEn: item.seat.labelEn,
      anchor: point(item.x, anchorY),
      approach: booth ? point(item.x, anchorY + 22) : point(item.x - OFFICE2D_DESK_SEAT_OFFSET.approachX, anchorY),
      exit: booth ? point(item.x + 14, anchorY + 22) : point(item.x + OFFICE2D_DESK_SEAT_OFFSET.approachX, anchorY),
      facing: "up",
      attach: booth ? point(item.x, item.y - 12) : point(item.x, item.y + OFFICE2D_DESK_SEAT_OFFSET.attachY),
      furnitureId: item.id,
    }));
  }
  const tableSeat = (id: string, roomId: string, labelKo: string, labelEn: string, x: number, y: number, facing: "up" | "down", furnitureId: string): ToonHqSeat => {
    const step = facing === "up" ? 24 : -22;
    return Object.freeze({ id, roomId, labelKo, labelEn, anchor: point(x, y), approach: point(x, y + step), exit: point(x + 18, y + step),
      facing, attach: point(x, y + (facing === "up" ? -6 : -4)), furnitureId });
  };
  [1590, 1660, 1730].forEach((x, index) => {
    seats.push(tableSeat(`hq-review-seat-${index + 1}`, "hq-review-room", `PD 리뷰 좌석 ${index + 1}`, `Review seat ${index + 1}`, x, 978, "up", "hq-review-table"));
  });
  [1580, 1660, 1740].forEach((x, index) => {
    seats.push(tableSeat(`hq-meeting-north-${index + 1}`, "hq-meeting-room", `회의석 북쪽 ${index + 1}`, `Meeting seat north ${index + 1}`, x, 1338, "down", "hq-meeting-table"));
    seats.push(tableSeat(`hq-meeting-south-${index + 1}`, "hq-meeting-room", `회의석 남쪽 ${index + 1}`, `Meeting seat south ${index + 1}`, x, 1428, "up", "hq-meeting-table"));
  });
  return Object.freeze(seats);
}

function furnitureProp(item: ToonHqFurniture): StudioWorldPropDefinition {
  const footprint = toonHqFootprintRect(item);
  const kind = item.interaction ? "interactive" : footprint ? "solid" : "decor";
  return Object.freeze({
    id: item.id,
    kind,
    assetKey: item.sprite,
    assetUrl: office2dObjectUrl(item.sprite),
    x: item.x,
    y: item.y,
    width: item.width,
    originX: 0.5,
    originY: 1,
    depth: item.depth === "floor" ? "fixed" : "y-sort",
    ...(item.depth === "floor" ? { fixedDepth: 2 } : {}),
    ...(footprint ? { collider: footprint } : {}),
    ...(item.interaction ? {
      action: item.interaction.action,
      interactionRadius: item.interaction.radius,
      labelKo: item.interaction.labelKo,
      labelEn: item.interaction.labelEn,
    } : {}),
  });
}

function roomDefinition(room: ToonHqRoom): StudioWorldRoomDefinition {
  return Object.freeze({
    id: room.id,
    labelKo: room.labelKo,
    labelEn: room.labelEn,
    descriptionKo: room.descriptionKo,
    descriptionEn: room.descriptionEn,
    ...(room.action ? { action: room.action } : {}),
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
  });
}

function officeZones(): readonly StudioOfficeZone[] {
  return Object.freeze(TOON_HQ_ROOMS.filter((room) => room.zoneType).map((room): StudioOfficeZone => Object.freeze({
    id: `${room.id}-zone`,
    type: room.zoneType ?? "studio",
    labelKo: room.labelKo,
    labelEn: room.labelEn,
    descriptionKo: room.descriptionKo,
    descriptionEn: room.descriptionEn,
    shape: Object.freeze({ kind: "rect" as const, x: room.x, y: room.y, width: room.width, height: room.height }),
    roomId: room.id,
    rules: Object.freeze([]),
    ...(room.workMode ? { workMode: room.workMode } : {}),
    ...(room.privacy === "silent" ? { silent: true, suggestMuteOnEnter: true } : {}),
    ...(room.privacy === "private" ? { privateAudio: true } : {}),
  })));
}

function npcDefinitions(): readonly StudioWorldNpcDefinition[] {
  return Object.freeze(TOON_HQ_NPCS.map((npc): StudioWorldNpcDefinition => registerStudioNpcRole(Object.freeze({
    id: npc.id,
    skinKey: npc.skinKey,
    point: npc.point,
    roomId: npc.roomId,
    facing: npc.facing,
    scale: 0.92,
    behavior: npc.behavior,
    ...(npc.speed ? { speed: npc.speed } : {}),
    ...(npc.patrol ? { patrol: Object.freeze([...npc.patrol]) } : {}),
  }), npc.role)));
}

function slotDefinitions(seats: readonly ToonHqSeat[]): readonly StudioWorldInteractionSlotDefinition[] {
  return Object.freeze(seats.map((seat): StudioWorldInteractionSlotDefinition => Object.freeze({
    id: seat.id,
    roomId: seat.roomId,
    labelKo: seat.labelKo,
    labelEn: seat.labelEn,
    approachPoint: seat.approach,
    anchorPoint: seat.anchor,
    seatAttachmentPoint: seat.attach,
    exitPoint: seat.exit,
    facing: seat.facing,
    radius: 12,
  })));
}

const TOON_HQ_MANIFESTS = new WeakSet<StudioVirtualSpaceWorldManifest>();
const manifestCache = new Map<boolean, StudioVirtualSpaceWorldManifest>();

function buildToonHqManifest(personal: boolean): StudioVirtualSpaceWorldManifest {
  const walls = toonHqWallSegments();
  const seats = toonHqSeats();
  const manifest: StudioVirtualSpaceWorldManifest = Object.freeze({
    id: TOON_HQ_MANIFEST_ID,
    version: 1,
    width: TOON_HQ_WIDTH,
    height: TOON_HQ_HEIGHT,
    backgroundAssetKey: "toon-hq-preview-v1",
    backgroundUrl: `${OFFICE2D_ASSET_ROOT}/hq-preview.webp`,
    rooms: Object.freeze(TOON_HQ_ROOMS.map(roomDefinition)),
    props: Object.freeze(TOON_HQ_FURNITURE.map(furnitureProp)),
    colliders: Object.freeze([...borderColliders(), ...walls.map((wall) => rect(wall.x, wall.y, wall.width, wall.height))]),
    interactions: Object.freeze([]),
    portals: Object.freeze([Object.freeze({
      id: TOON_HQ_CAMPUS_PORTAL.id,
      point: TOON_HQ_CAMPUS_PORTAL.point,
      radius: TOON_HQ_CAMPUS_PORTAL.radius,
      href: TOON_HQ_CAMPUS_PORTAL.href,
    })]),
    spawns: Object.freeze([
      Object.freeze({ id: "main", point: TOON_HQ_ROOMS.find((room) => room.id === "hq-lobby")?.spawn ?? point(336, 1470), facing: "up" as const }),
      ...TOON_HQ_ROOMS.map((room) => Object.freeze({ id: room.id, point: room.spawn, facing: "up" as const })),
    ]),
    npcs: npcDefinitions(),
    interactionSlots: slotDefinitions(seats),
    occlusionLayers: Object.freeze([]),
    acousticZones: Object.freeze(TOON_HQ_ROOMS.filter((room) => room.row !== "corridor").map((room) => {
      const privateRoom = room.privacy === "private" && !personal;
      return Object.freeze({
        id: `${room.id}-audio`,
        roomId: room.id,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        policy: privateRoom ? "private" as const : "public" as const,
        ...(privateRoom ? { doorId: `${room.id}-door` } : {}),
      });
    })),
    zones: officeZones(),
  });
  TOON_HQ_MANIFESTS.add(manifest);
  return registerStudioVirtualWorldPresentation(manifest, {
    kind: "place",
    camera: "follow",
    actorScale: 0.72,
    locomotion: { walkSpeed: 210, sprintMultiplier: 1.55, gaitDistancePerCycle: 64 },
  });
}

/** 모드별로 같은 identity를 유지하는 본사 manifest. */
export function studioVirtualToonHqManifest(personal: boolean): StudioVirtualSpaceWorldManifest {
  const cached = manifestCache.get(personal);
  if (cached) return cached;
  const manifest = buildToonHqManifest(personal);
  manifestCache.set(personal, manifest);
  return manifest;
}

/** 이 manifest가 생성기가 만든 본사 월드인지(파일에서 불러온 같은 id의 사용자 월드는 false). */
export function isToonHqManifest(manifest: StudioVirtualSpaceWorldManifest): boolean {
  return TOON_HQ_MANIFESTS.has(manifest);
}
