/**
 * ToonOffice 2D 장면 구성: manifest → 렌더·물리용 장면 데이터.
 *
 * 본사(toon-hq) manifest면 설계도의 바닥 재질·벽·벽 장식·조명·좌석 의자·물리 소품까지 쓰고,
 * 그 밖의 월드(캠퍼스·장소·게시 월드)는 manifest의 배경 이미지·방·소품만으로 같은 엔진에서 그린다.
 * 순수 함수라 브라우저 없이 테스트한다.
 */
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import {
  studioWorldCollisionRects,
  studioWorldInteractions,
  studioWorldPortals,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldRect,
} from "../studio-virtual-space-world-manifest";
import {
  TOON_HQ_FURNITURE,
  TOON_HQ_NORTH_WALL,
  TOON_HQ_PHYSICS_PROPS,
  TOON_HQ_ROOMS,
  TOON_HQ_WALL_DECOR,
  type ToonHqFloor,
  type ToonHqPhysicsProp,
} from "./hq/toon-hq-blueprint";
import { isToonHqManifest, toonHqFootprintRect, toonHqSeats, toonHqWallSegments, type ToonHqWallSegment } from "./hq/toon-hq-manifest";
import { isOffice2dSpriteKey, OFFICE2D_SPRITE_SPECS, type Office2dSpriteKey } from "./office2d-sprite-catalog";

export type Office2dFloorKind = ToonHqFloor | "generic";

export interface Office2dFloorRegion extends StudioWorldRect {
  readonly id: string;
  readonly floor: Office2dFloorKind;
  readonly seed: number;
}

export interface Office2dWallDecor {
  readonly id: string;
  readonly sprite: Office2dSpriteKey;
  readonly x: number;
  readonly width: number;
}

export interface Office2dWall extends ToonHqWallSegment {
  readonly tone: string;
  readonly decor: readonly Office2dWallDecor[];
  /** 북쪽 벽 명판에 쓸 방 이름. */
  readonly signKo?: string;
  readonly signEn?: string;
  readonly signX?: number;
}

export interface Office2dSceneObject {
  readonly id: string;
  readonly sprite: Office2dSpriteKey | null;
  /** 카탈로그 밖 이미지(게시 월드 소품). */
  readonly imageUrl?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** 원본 비율을 모를 때 쓸 높이(px). */
  readonly height?: number;
  readonly layer: "floor" | "y-sort";
  readonly footprint: StudioWorldRect | null;
  readonly interactionId: string | null;
  readonly glow: { readonly color: string; readonly radius: number; readonly offsetY: number } | null;
  readonly flip: boolean;
  readonly tone: string;
}

export interface Office2dSeatVisual {
  readonly id: string;
  readonly anchor: StudioVirtualSpacePoint;
  readonly attach: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly chair: "chair-back" | "chair-front" | null;
}

export interface Office2dLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly kind: "screen" | "lamp" | "window";
}

export interface Office2dRoomLabel {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rect: StudioWorldRect;
  readonly ambient: string;
  readonly pipelineStep: number | null;
}

export interface Office2dScene {
  readonly kind: "toon-hq" | "generic";
  readonly width: number;
  readonly height: number;
  readonly backgroundUrl: string | null;
  readonly floors: readonly Office2dFloorRegion[];
  readonly walls: readonly Office2dWall[];
  readonly objects: readonly Office2dSceneObject[];
  readonly seats: readonly Office2dSeatVisual[];
  readonly lights: readonly Office2dLight[];
  readonly rooms: readonly Office2dRoomLabel[];
  readonly physicsProps: readonly ToonHqPhysicsProp[];
  readonly staticColliders: readonly StudioWorldRect[];
  readonly portals: readonly { readonly id: string; readonly point: StudioVirtualSpacePoint; readonly radius: number }[];
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const sceneCache = new WeakMap<StudioVirtualSpaceWorldManifest, Office2dScene>();

/** manifest마다 한 번만 구성해 같은 객체를 돌려준다. */
export function office2dSceneFor(manifest: StudioVirtualSpaceWorldManifest): Office2dScene {
  const cached = sceneCache.get(manifest);
  if (cached) return cached;
  const scene = isToonHqManifest(manifest) ? buildToonHqScene(manifest) : buildGenericScene(manifest);
  sceneCache.set(manifest, scene);
  return scene;
}

function buildToonHqScene(manifest: StudioVirtualSpaceWorldManifest): Office2dScene {
  const roomById = new Map(TOON_HQ_ROOMS.map((room) => [room.id, room] as const));
  const walls: Office2dWall[] = toonHqWallSegments().map((wall) => {
    const room = roomById.get(wall.roomId);
    const decor = wall.side === "north"
      ? TOON_HQ_WALL_DECOR.filter((item) => item.wallRoomId === wall.roomId && item.x - item.width / 2 >= wall.x && item.x + item.width / 2 <= wall.x + wall.width)
      : [];
    const signSegment = wall.side === "north" && room && isSignSegment(wall, room.doors.north);
    return Object.freeze({
      ...wall,
      tone: room?.wallTone ?? "#e9dfcf",
      decor: Object.freeze(decor.map((item) => Object.freeze({ id: item.id, sprite: item.sprite, x: item.x, width: item.width }))),
      ...(signSegment && room ? { signKo: room.labelKo, signEn: room.labelEn, signX: signPosition(wall, room.doors.north) } : {}),
    });
  });
  const objects: Office2dSceneObject[] = TOON_HQ_FURNITURE.map((item) => Object.freeze({
    id: item.id,
    sprite: item.sprite,
    x: item.x,
    y: item.y,
    width: item.width,
    layer: item.depth === "floor" ? "floor" as const : "y-sort" as const,
    footprint: toonHqFootprintRect(item),
    interactionId: item.interaction ? item.id : null,
    glow: item.glow ?? null,
    flip: item.flip === true,
    tone: OFFICE2D_SPRITE_SPECS[item.sprite].tone,
  }));
  const seats: Office2dSeatVisual[] = toonHqSeats().map((seat) => {
    const furniture = TOON_HQ_FURNITURE.find((item) => item.id === seat.furnitureId);
    const chair = furniture?.sprite === "focus-booth" ? null : seat.facing === "up" ? "chair-back" as const : "chair-front" as const;
    return Object.freeze({ id: seat.id, anchor: seat.anchor, attach: seat.attach, facing: seat.facing, chair });
  });
  const lights: Office2dLight[] = [];
  for (const item of TOON_HQ_FURNITURE) {
    if (!item.glow) continue;
    const kind = item.sprite === "floor-lamp" || item.sprite === "coffee-machine" ? "lamp" as const : "screen" as const;
    lights.push(Object.freeze({ id: `${item.id}-glow`, x: item.x, y: item.y + item.glow.offsetY, radius: item.glow.radius, color: item.glow.color, kind }));
  }
  for (const decor of TOON_HQ_WALL_DECOR) {
    if (decor.sprite !== "window") continue;
    const room = roomById.get(decor.wallRoomId);
    if (!room) continue;
    lights.push(Object.freeze({ id: `${decor.id}-daylight`, x: decor.x, y: room.y + TOON_HQ_NORTH_WALL + 70, radius: 150, color: "#fff4d6", kind: "window" }));
  }
  return Object.freeze({
    kind: "toon-hq",
    width: manifest.width,
    height: manifest.height,
    backgroundUrl: null,
    floors: Object.freeze(TOON_HQ_ROOMS.map((room) => Object.freeze({
      id: room.id, x: room.x, y: room.y, width: room.width, height: room.height, floor: room.floor, seed: hashSeed(room.id),
    }))),
    walls: Object.freeze(walls),
    objects: Object.freeze(objects),
    seats: Object.freeze(seats),
    lights: Object.freeze(lights),
    rooms: Object.freeze(TOON_HQ_ROOMS.map((room) => Object.freeze({
      id: room.id, labelKo: room.labelKo, labelEn: room.labelEn,
      rect: Object.freeze({ x: room.x, y: room.y, width: room.width, height: room.height }),
      ambient: room.ambient, pipelineStep: room.pipelineStep,
    }))),
    physicsProps: TOON_HQ_PHYSICS_PROPS,
    staticColliders: studioWorldCollisionRects(manifest),
    portals: Object.freeze(studioWorldPortals(manifest).map((portal) => Object.freeze({ id: portal.id, point: portal.point, radius: portal.radius }))),
  });
}

/** 문이 있는 북쪽 벽은 문 왼쪽 조각, 문이 없으면 그 벽에 명판을 단다. */
function isSignSegment(wall: ToonHqWallSegment, doorX: number | undefined): boolean {
  if (doorX === undefined) return true;
  return wall.x + wall.width <= doorX;
}

function signPosition(wall: ToonHqWallSegment, doorX: number | undefined): number {
  if (doorX === undefined) return wall.x + Math.min(150, wall.width / 2);
  return Math.max(wall.x + 90, wall.x + wall.width - 96);
}

const GENERIC_ROOM_TONES = ["#efe4d0", "#e3ead9", "#e6e0ef", "#f2e3d6", "#dfe8ee", "#efe8cf"] as const;

function buildGenericScene(manifest: StudioVirtualSpaceWorldManifest): Office2dScene {
  const interactions = new Set(studioWorldInteractions(manifest).map((item) => item.id));
  const objects: Office2dSceneObject[] = manifest.props.map((prop) => {
    const sprite = prop.assetKey && isOffice2dSpriteKey(prop.assetKey) ? prop.assetKey : null;
    const width = prop.width ?? (prop.collider?.width ?? 64);
    return Object.freeze({
      id: prop.id,
      sprite,
      ...(sprite === null && prop.assetUrl ? { imageUrl: prop.assetUrl } : {}),
      x: prop.x,
      y: prop.y,
      width,
      ...(prop.height ? { height: prop.height } : {}),
      layer: prop.depth === "fixed" && (prop.fixedDepth ?? 500) < 100 ? "floor" as const : "y-sort" as const,
      footprint: prop.collider ?? null,
      interactionId: interactions.has(prop.id) ? prop.id : null,
      glow: null,
      flip: false,
      tone: sprite ? OFFICE2D_SPRITE_SPECS[sprite].tone : "#c9b79c",
    });
  });
  return Object.freeze({
    kind: "generic",
    width: manifest.width,
    height: manifest.height,
    backgroundUrl: manifest.backgroundUrl || null,
    floors: Object.freeze(manifest.rooms.map((room) => Object.freeze({
      id: room.id, x: room.x, y: room.y, width: room.width, height: room.height, floor: "generic" as const, seed: hashSeed(room.id),
    }))),
    walls: Object.freeze([]),
    objects: Object.freeze(objects),
    seats: Object.freeze((manifest.interactionSlots ?? []).map((slot) => Object.freeze({
      id: slot.id, anchor: slot.anchorPoint, attach: slot.seatAttachmentPoint ?? slot.anchorPoint, facing: slot.facing, chair: null,
    }))),
    lights: Object.freeze([]),
    rooms: Object.freeze(manifest.rooms.map((room, index) => Object.freeze({
      id: room.id, labelKo: room.labelKo, labelEn: room.labelEn,
      rect: Object.freeze({ x: room.x, y: room.y, width: room.width, height: room.height }),
      ambient: GENERIC_ROOM_TONES[index % GENERIC_ROOM_TONES.length] ?? "#efe4d0", pipelineStep: null,
    }))),
    physicsProps: Object.freeze([]),
    staticColliders: studioWorldCollisionRects(manifest),
    portals: Object.freeze(studioWorldPortals(manifest).map((portal) => Object.freeze({ id: portal.id, point: portal.point, radius: portal.radius }))),
  });
}

/** 장면에서 쓰는 모든 이미지 URL(로딩 화면 진행률·사전 로드). */
export function office2dSceneSpriteKeys(scene: Office2dScene): readonly Office2dSpriteKey[] {
  const keys = new Set<Office2dSpriteKey>();
  for (const object of scene.objects) if (object.sprite) keys.add(object.sprite);
  for (const wall of scene.walls) for (const decor of wall.decor) keys.add(decor.sprite);
  for (const seat of scene.seats) if (seat.chair) keys.add(seat.chair);
  for (const prop of scene.physicsProps) keys.add(prop.sprite);
  return [...keys];
}
