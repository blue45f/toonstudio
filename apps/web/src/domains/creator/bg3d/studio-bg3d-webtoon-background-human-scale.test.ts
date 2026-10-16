import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M } from "./studio-bg3d-scale-guide";
import {
  buildStudioBg3dWebtoonBackground,
  STUDIO_BG3D_WEBTOON_BACKGROUNDS,
  type StudioBg3dWebtoonBackgroundEntry,
  type StudioBg3dWebtoonRoomEntry,
  type StudioBg3dWebtoonStreetEntry,
} from "./studio-bg3d-webtoon-background-templates";

import {
  buildStudioBg3dStreetParts,
  clampStudioBg3dStreetSpec,
  STUDIO_BG3D_STREET_DEFAULT_SPEC,
  type StudioBg3dStreetSpec,
} from "./studio-bg3d-street-builder";

import type { StudioBg3dRoomOpening, StudioBg3dRoomSpec } from "./studio-bg3d-room-builder";
import type { BgPrimitive } from "../studio-background-3d-metadata";

// 웹툰 배경(교실·복도·거리)이 "사람이 선 눈금"에 맞는지를 수치로 고정한다.
//
// 아래 허용 범위(RANGES)는 이 저장소가 정한 공학적 가정이다 — 건축 법규나 표준 문서에서 가져온 값이 아니다.
// 기준은 장면의 사람 눈금 STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M(1.6m)과 일상적인 치수대(문 약 2m, 책상 윗면 약 0.7m,
// 층고 약 3m)다. 근거와 한계는 docs/features/studio-bg3d-webtoon-backgrounds.md 에 적었다.
//
// 검사기가 정말 잡아내는지 보이려고 합성 결함(negative control)도 함께 둔다: 생성 결과를 장난감 비례로 일부러 망가뜨려
// 각 규칙이 반드시 위반을 보고하는지 확인한다.

const HUMAN = STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M;

type Range = readonly [min: number, max: number];

const RANGES = {
  ceiling: [2.4, 4.0],
  doorHeight: [1.9, 2.5],
  doorWidth: [0.8, 1.8],
  windowSill: [0.8, 1.2],
  windowHeight: [0.8, 2.0],
  desktop: [0.68, 0.78],
  seat: [0.4, 0.48],
  deskMinusSeat: [0.2, 0.32],
  podiumTop: [0.85, 1.1],
  boardBottom: [0.85, 1.05],
  boardHeight: [0.9, 1.3],
  boardWidth: [2.4, 4.5],
  lockerHeight: [1.6, 2.0],
  lockerDepth: [0.35, 0.6],
  // 거리
  laneWidth: [2.7, 3.75],
  sidewalkWidth: [1.8, 5],
  curb: [0.1, 0.2],
  lampHeight: [4, 9],
  lampPoleDiameter: [0.08, 0.3],
  carLength: [3.6, 5.2],
  carWidth: [1.6, 2.0],
  carHeight: [1.3, 1.7],
  wheelDiameter: [0.55, 0.8],
  floorToFloor: [2.7, 3.6],
  buildingDoorHeight: [1.9, 2.5],
  buildingDoorWidth: [0.8, 1.4],
  upperWindowSill: [0.7, 1.2],
  shopSill: [0.3, 1],
  benchSeat: [0.4, 0.5],
  stripeWidth: [0.35, 0.65],
  trunkDiameter: [0.15, 0.6],
} as const satisfies Record<string, Range>;

/** 사람 통행에 필요한 최소 여유(m). */
const MIN_AISLE = 0.45;
const MIN_CORRIDOR_CLEAR_WIDTH = 1.5;
/** 보도의 가로등·가로수·벤치 옆으로 사람이 지나갈 수 있는 최소 폭(연석 쪽과 건물 쪽 중 넓은 쪽). */
const MIN_SIDEWALK_PASSAGE = 1.2;
const MIN_CANOPY_CLEARANCE = 2;
const DOOR_APPROACH_DEPTH = 0.9;
const EPS = 1e-6;

interface Violation {
  readonly rule: string;
  readonly subject: string;
  readonly actual: number | string;
}

function range(rule: string, subject: string, actual: number, [min, max]: Range): Violation[] {
  return actual >= min - EPS && actual <= max + EPS ? [] : [{ rule, subject, actual: Number(actual.toFixed(3)) }];
}

function atLeast(rule: string, subject: string, actual: number, min: number): Violation[] {
  return actual >= min - EPS ? [] : [{ rule, subject, actual: Number(actual.toFixed(3)) }];
}

function within(rule: string, subject: string, actual: number, expected: number, tolerance: number): Violation[] {
  return Math.abs(actual - expected) <= tolerance + EPS ? [] : [{ rule, subject, actual: Number(actual.toFixed(3)) }];
}

// ── 도형 헬퍼 ───────────────────────────────────────────────────────────────

const named = (list: readonly BgPrimitive[], name: string): BgPrimitive[] => list.filter((item) => item.name === name);
const topOf = (item: BgPrimitive): number => item.position[1] + item.scale[1] / 2;
const bottomOf = (item: BgPrimitive): number => item.position[1] - item.scale[1] / 2;
/** 원기둥 지름: 단위 원기둥 반지름이 0.3m 라 지름은 0.6m x scale.x. */
const cylinderDiameter = (item: BgPrimitive): number => 0.6 * item.scale[0];

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** yaw 가 90° 배수인 가구 파츠의 바닥 면 사각형(축 정렬). */
function footprint(item: BgPrimitive): Rect {
  const swapped = Math.abs(Math.sin(item.rotation[1])) > 0.5;
  const halfX = (swapped ? item.scale[2] : item.scale[0]) / 2;
  const halfZ = (swapped ? item.scale[0] : item.scale[2]) / 2;
  return {
    minX: item.position[0] - halfX,
    maxX: item.position[0] + halfX,
    minZ: item.position[2] - halfZ,
    maxZ: item.position[2] + halfZ,
  };
}

function union(rects: readonly Rect[]): Rect {
  return {
    minX: Math.min(...rects.map((rect) => rect.minX)),
    maxX: Math.max(...rects.map((rect) => rect.maxX)),
    minZ: Math.min(...rects.map((rect) => rect.minZ)),
    maxZ: Math.max(...rects.map((rect) => rect.maxZ)),
  };
}

function rectGap(a: Rect, b: Rect): number {
  const gapX = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const gapZ = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
  return Math.hypot(gapX, gapZ);
}

function intersects(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;
}

function distanceXZ(a: BgPrimitive, b: BgPrimitive): number {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}

function nearest(target: BgPrimitive, candidates: readonly BgPrimitive[]): BgPrimitive | null {
  let best: BgPrimitive | null = null;
  for (const candidate of candidates) {
    if (!best || distanceXZ(target, candidate) < distanceXZ(target, best)) best = candidate;
  }
  return best;
}

// ── 방 검사 ─────────────────────────────────────────────────────────────────

function checkRoomSpec(spec: StudioBg3dRoomSpec, label: string): Violation[] {
  const out: Violation[] = [];
  out.push(...range("room.ceiling", label, spec.wallHeight, RANGES.ceiling));
  // 문 높이는 사람 눈금보다 최소 20% 커야 머리를 숙이지 않는다.
  for (const [index, opening] of spec.openings.entries()) {
    const subject = `${label}/${opening.wall}-${opening.type}-${index}`;
    if (opening.type === "door") {
      out.push(...range("door.height", subject, opening.height, RANGES.doorHeight));
      out.push(...range("door.width", subject, opening.width, RANGES.doorWidth));
      out.push(...atLeast("door.human-headroom", subject, opening.height, HUMAN * 1.2));
    } else {
      out.push(...range("window.sill", subject, opening.sillHeight, RANGES.windowSill));
      out.push(...range("window.height", subject, opening.height, RANGES.windowHeight));
      out.push(...atLeast("window.headroom", subject, spec.wallHeight - (opening.sillHeight + opening.height), 0.2));
    }
  }
  return out;
}

/** 방 안쪽 면 사각형(벽 두께 반영). */
function innerRect(spec: StudioBg3dRoomSpec): Rect {
  const halfW = spec.width / 2 - spec.wallThickness / 2;
  const halfD = spec.depth / 2 - spec.wallThickness / 2;
  return { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
}

const FURNITURE_NAME = /^(책상|의자|교탁|칠판|사물함)/u;

/**
 * 문 바로 안쪽 접근 구역(문 폭 + 양옆 5cm, 안쪽 0.9m). 벽 좌표 계약은 룸 빌더 머리 주석을 따른다:
 * 북벽 +u=+x, 남벽 +u=-x, 서벽 +u=-z, 동벽 +u=+z.
 */
function doorApproachZone(spec: StudioBg3dRoomSpec, door: StudioBg3dRoomOpening): Rect {
  const inner = innerRect(spec);
  const half = door.width / 2 + 0.05;
  switch (door.wall) {
    case "north":
      return { minX: door.centerOffset - half, maxX: door.centerOffset + half, minZ: inner.minZ, maxZ: inner.minZ + DOOR_APPROACH_DEPTH };
    case "south":
      return { minX: -door.centerOffset - half, maxX: -door.centerOffset + half, minZ: inner.maxZ - DOOR_APPROACH_DEPTH, maxZ: inner.maxZ };
    case "west":
      return { minX: inner.minX, maxX: inner.minX + DOOR_APPROACH_DEPTH, minZ: -door.centerOffset - half, maxZ: -door.centerOffset + half };
    case "east":
      return { minX: inner.maxX - DOOR_APPROACH_DEPTH, maxX: inner.maxX, minZ: door.centerOffset - half, maxZ: door.centerOffset + half };
  }
}

function checkRoomPrimitives(
  primitives: readonly BgPrimitive[],
  spec: StudioBg3dRoomSpec,
  label: string,
): Violation[] {
  const out: Violation[] = [];
  const desks = named(primitives, "책상 상판");
  const seats = named(primitives, "의자 좌판");
  const backs = named(primitives, "의자 등받이");

  for (const [index, desk] of desks.entries()) out.push(...range("desk.top", `${label}/desk-${index}`, topOf(desk), RANGES.desktop));
  for (const [index, seat] of seats.entries()) {
    out.push(...range("seat.top", `${label}/seat-${index}`, topOf(seat), RANGES.seat));
    const desk = nearest(seat, desks);
    if (desk) {
      out.push(...range("desk-minus-seat", `${label}/seat-${index}`, topOf(desk) - topOf(seat), RANGES.deskMinusSeat));
      // 의자는 가장 가까운 책상을 향해야 한다: 앞면 방향(sin yaw, cos yaw)과 책상 방향이 이루는 각이 작아야 한다.
      const dx = desk.position[0] - seat.position[0];
      const dz = desk.position[2] - seat.position[2];
      const length = Math.hypot(dx, dz);
      const facing = (Math.sin(seat.rotation[1]) * dx + Math.cos(seat.rotation[1]) * dz) / (length || 1);
      out.push(...atLeast("seat.faces-desk", `${label}/seat-${index}`, facing, 0.8));
      out.push(...range("seat.near-desk", `${label}/seat-${index}`, length, [0.2, 0.6]));
    } else {
      out.push({ rule: "seat.has-desk", subject: `${label}/seat-${index}`, actual: "책상 없음" });
    }
  }

  for (const [index, podium] of named(primitives, "교탁 상판").entries()) {
    out.push(...range("podium.top", `${label}/podium-${index}`, topOf(podium), RANGES.podiumTop));
  }
  for (const [index, board] of named(primitives, "칠판 틀").entries()) {
    const subject = `${label}/board-${index}`;
    out.push(...range("board.bottom", subject, bottomOf(board), RANGES.boardBottom));
    out.push(...range("board.height", subject, board.scale[1], RANGES.boardHeight));
    out.push(...range("board.width", subject, board.scale[0], RANGES.boardWidth));
    // 칠판 윗단은 서 있는 사람(눈금)보다 높고 천장 아래에 있어야 한다.
    out.push(...atLeast("board.above-human", subject, topOf(board), HUMAN));
    out.push(...atLeast("board.below-ceiling", subject, spec.wallHeight - topOf(board), 0.3));
  }
  for (const [index, locker] of named(primitives, "사물함 몸통").entries()) {
    out.push(...range("locker.height", `${label}/locker-${index}`, locker.scale[1], RANGES.lockerHeight));
    out.push(...range("locker.depth", `${label}/locker-${index}`, locker.scale[2], RANGES.lockerDepth));
  }

  // 책걸상 세트(책상 + 가장 가까운 의자 파츠들)끼리 통로 폭.
  const chairParts = [...seats, ...backs, ...named(primitives, "의자 다리")];
  const sets = desks.map((desk) => ({
    desk,
    rect: union([
      footprint(desk),
      ...named(primitives, "책상 옆판").filter((side) => distanceXZ(side, desk) < 0.5).map(footprint),
      ...chairParts.filter((part) => nearest(part, desks) === desk).map(footprint),
    ]),
  }));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      out.push(...atLeast("aisle.between-desk-sets", `${label}/set-${i}-${j}`, rectGap(sets[i].rect, sets[j].rect), MIN_AISLE));
    }
  }

  // 가구는 방 안쪽에 들어가고, 문 앞 접근 구역을 막지 않는다.
  const inner = innerRect(spec);
  const furniture = primitives.filter((item) => FURNITURE_NAME.test(item.name ?? ""));
  for (const item of furniture) {
    const rect = footprint(item);
    const inside = rect.minX >= inner.minX - EPS && rect.maxX <= inner.maxX + EPS && rect.minZ >= inner.minZ - EPS && rect.maxZ <= inner.maxZ + EPS;
    if (!inside) out.push({ rule: "furniture.inside-room", subject: `${label}/${item.name}`, actual: "방 밖" });
  }
  for (const [index, door] of spec.openings.entries()) {
    if (door.type !== "door") continue;
    const zone = doorApproachZone(spec, door);
    const blocker = furniture.find((item) => intersects(footprint(item), zone));
    if (blocker) out.push({ rule: "door.approach-blocked", subject: `${label}/door-${index}`, actual: blocker.name ?? "" });
  }
  return out;
}

/** 복도: 사물함을 놓고도 남는 통로 폭. */
function checkCorridorClearWidth(spec: StudioBg3dRoomSpec, primitives: readonly BgPrimitive[], label: string): Violation[] {
  const lockerDepth = Math.max(0, ...named(primitives, "사물함 몸통").map((locker) => locker.scale[2]));
  const clear = spec.depth - spec.wallThickness - lockerDepth;
  return [
    ...atLeast("corridor.clear-width", label, clear, MIN_CORRIDOR_CLEAR_WIDTH),
    ...range("corridor.width", label, spec.depth, [1.8, 3.6]),
  ];
}

// ── 거리 검사 ───────────────────────────────────────────────────────────────

/** 보도 위 물체 옆으로 지나갈 수 있는 폭: 연석 쪽과 건물 쪽 여유 중 넓은 쪽. */
function sidewalkPassage(sidewalk: BgPrimitive, centerX: number, halfWidth: number): number {
  const curbEdge = sidewalk.position[0] - Math.sign(sidewalk.position[0]) * sidewalk.scale[0] / 2;
  const buildingEdge = sidewalk.position[0] + Math.sign(sidewalk.position[0]) * sidewalk.scale[0] / 2;
  // 부호 있는 거리: 물체가 연석·건물 쪽 가장자리를 넘어서면 음수가 된다.
  const nearCurb = Math.abs(centerX) - halfWidth - Math.abs(curbEdge);
  const nearBuilding = Math.abs(buildingEdge) - (Math.abs(centerX) + halfWidth);
  return Math.max(nearCurb, nearBuilding);
}

interface StreetCheckOptions {
  /** 이 거리를 만든 스펙의 층고(m). 건물 높이는 이 값의 정수 배(+연석)여야 한다. */
  readonly floorHeight: number;
}

function checkStreetPrimitives(primitives: readonly BgPrimitive[], label: string, options: StreetCheckOptions): Violation[] {
  const out: Violation[] = [];
  const [road] = named(primitives, "도로");
  const sidewalks = named(primitives, "보도");
  const roadHalf = road.scale[0] / 2;
  out.push(...range("lane.width", label, roadHalf, RANGES.laneWidth));
  const curb = sidewalks[0].scale[1];
  out.push(...range("curb.height", label, curb, RANGES.curb));
  for (const sidewalk of sidewalks) {
    out.push(...range("sidewalk.width", label, sidewalk.scale[0], RANGES.sidewalkWidth));
    out.push(...within("sidewalk.top-matches-curb", label, topOf(sidewalk), curb, 0.001));
  }
  const sidewalkAt = (x: number): BgPrimitive => sidewalks.find((candidate) => Math.sign(candidate.position[0]) === Math.sign(x))!;

  for (const [index, pole] of named(primitives, "가로등 기둥").entries()) {
    const subject = `${label}/lamp-${index}`;
    out.push(...range("lamp.height", subject, pole.scale[1], RANGES.lampHeight));
    out.push(...range("lamp.pole-diameter", subject, cylinderDiameter(pole), RANGES.lampPoleDiameter));
    out.push(...atLeast("sidewalk.passage", subject, sidewalkPassage(sidewalkAt(pole.position[0]), pole.position[0], cylinderDiameter(pole) / 2), MIN_SIDEWALK_PASSAGE));
    out.push(...within("lamp.base-on-sidewalk", subject, bottomOf(pole), curb, 0.001));
  }

  for (const [index, trunk] of named(primitives, "가로수 줄기").entries()) {
    const subject = `${label}/tree-${index}`;
    out.push(...range("tree.trunk-diameter", subject, cylinderDiameter(trunk), RANGES.trunkDiameter));
    out.push(...atLeast("sidewalk.passage", subject, sidewalkPassage(sidewalkAt(trunk.position[0]), trunk.position[0], cylinderDiameter(trunk) / 2), MIN_SIDEWALK_PASSAGE));
  }
  for (const [index, canopy] of named(primitives, "가로수 잎").entries()) {
    out.push(...atLeast("tree.canopy-clearance", `${label}/tree-${index}`, bottomOf(canopy) - curb, MIN_CANOPY_CLEARANCE));
  }

  const bodies = named(primitives, "차량 몸체");
  const cabins = named(primitives, "차량 객실");
  for (const [index, body] of bodies.entries()) {
    const subject = `${label}/car-${index}`;
    out.push(...range("car.length", subject, body.scale[2], RANGES.carLength));
    out.push(...range("car.width", subject, body.scale[0], RANGES.carWidth));
    const cabin = nearest(body, cabins);
    out.push(...range("car.height", subject, cabin ? topOf(cabin) : topOf(body), RANGES.carHeight));
    // 차로 안에 들어온다: 몸체 양끝이 중앙선(x=0)과 연석 사이.
    const margins = [Math.abs(body.position[0]) - body.scale[0] / 2, roadHalf - (Math.abs(body.position[0]) + body.scale[0] / 2)];
    out.push(...atLeast("car.inside-lane", subject, Math.min(...margins), 0));
  }
  for (const [index, wheel] of named(primitives, "차량 바퀴").entries()) {
    out.push(...range("car.wheel-diameter", `${label}/wheel-${index}`, cylinderDiameter(wheel), RANGES.wheelDiameter));
    // 바퀴는 도로에 닿는다(바닥이 도로 윗면 y=0 에서 2cm 이내).
    out.push(...range("car.wheel-on-road", `${label}/wheel-${index}`, wheel.position[1] - cylinderDiameter(wheel) / 2, [-0.02, 0.02]));
  }

  // 건물: 높이는 층고의 정수 배(+연석)이고, 문·창은 층 기준으로 잰다.
  out.push(...range("building.floor-to-floor", label, options.floorHeight, RANGES.floorToFloor));
  for (const [index, body] of named(primitives, "건물 본체").entries()) {
    const subject = `${label}/building-${index}`;
    const floors = (body.scale[1] - curb) / options.floorHeight;
    out.push(...within("building.floor-multiple", subject, floors, Math.round(floors), 0.001));
    out.push(...atLeast("building.floors", subject, Math.round(floors), 2));
    const sideX = Math.sign(body.position[0]);
    const zMin = body.position[2] - body.scale[2] / 2;
    const zMax = body.position[2] + body.scale[2] / 2;
    const onThisBuilding = (item: BgPrimitive): boolean => Math.sign(item.position[0]) === sideX && item.position[2] > zMin && item.position[2] < zMax;
    const insideWidth = (item: BgPrimitive): Violation[] =>
      item.position[2] - item.scale[2] / 2 >= zMin - EPS && item.position[2] + item.scale[2] / 2 <= zMax + EPS
        ? []
        : [{ rule: "building.feature-inside", subject, actual: item.name ?? "" }];
    const doors = named(primitives, "건물 문").filter(onThisBuilding);
    const shops = named(primitives, "상가 유리").filter(onThisBuilding);
    for (const door of doors) {
      out.push(...range("building.door-height", subject, door.scale[1], RANGES.buildingDoorHeight));
      out.push(...range("building.door-width", subject, door.scale[2], RANGES.buildingDoorWidth));
      out.push(...within("building.door-on-sidewalk", subject, bottomOf(door), curb, 0.01));
      out.push(...insideWidth(door));
    }
    for (const shop of shops) {
      out.push(...range("building.shop-sill", subject, bottomOf(shop) - curb, RANGES.shopSill));
      out.push(...atLeast("building.shop-headroom", subject, options.floorHeight - (topOf(shop) - curb), 0.3));
      out.push(...insideWidth(shop));
      for (const door of doors) {
        out.push(...atLeast("building.door-clear-of-shop", subject, rectGap(footprint(door), footprint(shop)), 0.3));
      }
    }
    for (const win of named(primitives, "건물 창").filter(onThisBuilding)) {
      const above = bottomOf(win) - curb;
      const floorIndex = Math.floor(above / options.floorHeight + EPS);
      out.push(...range("building.window-sill", subject, above - floorIndex * options.floorHeight, RANGES.upperWindowSill));
      out.push(...atLeast("building.window-headroom", subject, (floorIndex + 1) * options.floorHeight - (topOf(win) - curb), 0.3));
      out.push(...insideWidth(win));
    }
  }

  for (const [index, seat] of named(primitives, "벤치 좌판").entries()) {
    const subject = `${label}/bench-${index}`;
    out.push(...range("bench.seat", subject, topOf(seat) - curb, RANGES.benchSeat));
    out.push(...atLeast("sidewalk.passage", subject, sidewalkPassage(sidewalkAt(seat.position[0]), seat.position[0], seat.scale[0] / 2), MIN_SIDEWALK_PASSAGE));
  }
  for (const [index, stripe] of named(primitives, "횡단보도 줄무늬").entries()) {
    out.push(...range("crosswalk.stripe-width", `${label}/stripe-${index}`, stripe.scale[0], RANGES.stripeWidth));
    out.push(...atLeast("crosswalk.inside-road", `${label}/stripe-${index}`, roadHalf - (Math.abs(stripe.position[0]) + stripe.scale[0] / 2), 0));
  }
  return out;
}

// ── 카탈로그 전체에 적용 ────────────────────────────────────────────────────

let counter = 0;
const idFactory = () => `human-scale-${counter++}`;

function build(entry: StudioBg3dWebtoonBackgroundEntry): BgPrimitive[] {
  return buildStudioBg3dWebtoonBackground(entry.id, 0, { idFactory })!.primitives;
}

function violationsFor(entry: StudioBg3dWebtoonBackgroundEntry, primitives: readonly BgPrimitive[] = build(entry)): Violation[] {
  if (entry.kind === "street") return checkStreetPrimitives(primitives, entry.id, { floorHeight: entry.spec.floorHeight });
  const out = [...checkRoomSpec(entry.spec, entry.id), ...checkRoomPrimitives(primitives, entry.spec, entry.id)];
  if (entry.id === "corridor") out.push(...checkCorridorClearWidth(entry.spec, primitives, entry.id));
  return out;
}

const roomEntry = (id: string): StudioBg3dWebtoonRoomEntry =>
  STUDIO_BG3D_WEBTOON_BACKGROUNDS.find((entry): entry is StudioBg3dWebtoonRoomEntry => entry.id === id && entry.kind === "room")!;
const streetEntry = (): StudioBg3dWebtoonStreetEntry =>
  STUDIO_BG3D_WEBTOON_BACKGROUNDS.find((entry): entry is StudioBg3dWebtoonStreetEntry => entry.kind === "street")!;

function edit(
  primitives: readonly BgPrimitive[],
  name: string,
  change: (item: BgPrimitive) => Partial<BgPrimitive>,
): BgPrimitive[] {
  return primitives.map((item) => (item.name === name ? { ...item, ...change(item) } : item));
}

const rules = (violations: readonly Violation[]): string[] => [...new Set(violations.map((violation) => violation.rule))].sort();

describe("웹툰 배경의 사람 크기", () => {
  it("기준이 되는 사람 눈금은 1.6m 다", () => {
    expect(HUMAN).toBe(1.6);
  });

  it.each(STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => [entry.id, entry] as const))(
    "%s 는 모든 사람 크기 규칙을 위반 없이 만족한다",
    (_id, entry) => {
      expect(violationsFor(entry)).toEqual([]);
    },
  );

  it("교실의 대표 치수: 문 2.1m, 책상 윗면 0.72m, 좌판 윗면 0.455m, 교탁 0.90m, 칠판 아래끝 0.95m", () => {
    const entry = roomEntry("classroom");
    const primitives = build(entry);
    expect(entry.spec.openings.filter((opening) => opening.type === "door").map((door) => door.height)).toEqual([2.1, 2.1]);
    expect(new Set(named(primitives, "책상 상판").map(topOf).map((value) => value.toFixed(3)))).toEqual(new Set(["0.720"]));
    expect(new Set(named(primitives, "의자 좌판").map(topOf).map((value) => value.toFixed(3)))).toEqual(new Set(["0.455"]));
    expect(topOf(named(primitives, "교탁 상판")[0])).toBeCloseTo(0.9, 10);
    expect(bottomOf(named(primitives, "칠판 틀")[0])).toBeCloseTo(0.95, 10);
    expect(entry.spec.wallHeight).toBe(3);
  });

  it("교실은 책걸상 12세트가 모두 칠판(북쪽) 쪽을 보고, 통로 폭이 0.45m 이상이다", () => {
    const entry = roomEntry("classroom");
    const primitives = build(entry);
    const seats = named(primitives, "의자 좌판");
    expect(seats).toHaveLength(12);
    for (const seat of seats) {
      // 앞면 방향 (sin yaw, cos yaw) 이 -Z(칠판)와 거의 같다.
      expect(Math.cos(seat.rotation[1])).toBeCloseTo(-1, 10);
    }
    const board = named(primitives, "칠판 틀")[0];
    expect(board.position[2]).toBeLessThan(Math.min(...seats.map((seat) => seat.position[2])));
  });

  it("거리의 대표 치수: 층고 3m, 문 2.2m, 연석 15cm, 가로등 5m, 차량 4.5 x 1.8m, 바퀴 지름 0.66m", () => {
    const primitives = build(streetEntry());
    const curb = named(primitives, "보도")[0].scale[1];
    expect(curb).toBeCloseTo(0.15, 10);
    expect(named(primitives, "건물 문")[0].scale[1]).toBe(2.2);
    expect(named(primitives, "가로등 기둥")[0].scale[1]).toBe(5);
    const car = named(primitives, "차량 몸체")[0];
    expect([car.scale[2], car.scale[0]]).toEqual([4.5, 1.8]);
    expect(cylinderDiameter(named(primitives, "차량 바퀴")[0])).toBeCloseTo(0.66, 10);
    const heights = named(primitives, "건물 본체").map((body) => (body.scale[1] - curb) / 3);
    expect(heights.every((floors) => Math.abs(floors - Math.round(floors)) < 1e-9)).toBe(true);
  });

  it("사람 눈금과 비교: 문은 사람보다 20% 이상 높고 천장은 사람 머리 위 80cm 이상이다", () => {
    for (const id of ["classroom", "corridor"]) {
      const { spec } = roomEntry(id);
      for (const opening of spec.openings.filter((item) => item.type === "door")) {
        expect(opening.height).toBeGreaterThanOrEqual(HUMAN * 1.2);
      }
      expect(spec.wallHeight - HUMAN).toBeGreaterThanOrEqual(0.8);
    }
    const street = build(streetEntry());
    // 가로수 잎 아래로 사람이 서서 지나간다.
    const curb = named(street, "보도")[0].scale[1];
    for (const canopy of named(street, "가로수 잎")) expect(bottomOf(canopy) - curb).toBeGreaterThanOrEqual(HUMAN + 0.4);
  });

  describe("합성 결함(negative control): 장난감 비례로 망가뜨리면 해당 규칙이 반드시 위반을 보고한다", () => {
    const classroom = roomEntry("classroom");
    const classroomPrimitives = build(classroom);

    function specWith(patch: Partial<StudioBg3dRoomSpec>): StudioBg3dRoomSpec {
      return { ...classroom.spec, ...patch };
    }

    it("천장이 사람보다 겨우 높다", () => {
      expect(rules(checkRoomSpec(specWith({ wallHeight: 1.8 }), "x"))).toContain("room.ceiling");
    });

    it("문이 낮거나 좁거나 사람 머리를 스친다", () => {
      const toyDoor = specWith({ openings: [{ wall: "west", type: "door", centerOffset: 0, width: 0.5, height: 1.2, sillHeight: 0 }] });
      expect(rules(checkRoomSpec(toyDoor, "x"))).toEqual(expect.arrayContaining(["door.height", "door.width", "door.human-headroom"]));
      const grazing = specWith({ openings: [{ wall: "west", type: "door", centerOffset: 0, width: 1, height: 1.8, sillHeight: 0 }] });
      expect(rules(checkRoomSpec(grazing, "x"))).toContain("door.human-headroom");
    });

    it("창턱이 바닥에 붙어 있거나 천장에 닿는다", () => {
      const low = specWith({ openings: [{ wall: "east", type: "window", centerOffset: 0, width: 1.8, height: 1.3, sillHeight: 0.2 }] });
      expect(rules(checkRoomSpec(low, "x"))).toContain("window.sill");
      const touchingCeiling = specWith({ openings: [{ wall: "east", type: "window", centerOffset: 0, width: 1.8, height: 1.9, sillHeight: 1.1 }] });
      expect(rules(checkRoomSpec(touchingCeiling, "x"))).toContain("window.headroom");
    });

    it("책상이 낮거나 높다", () => {
      const low = edit(classroomPrimitives, "책상 상판", (item) => ({ position: [item.position[0], 0.4, item.position[2]] }));
      expect(rules(checkRoomPrimitives(low, classroom.spec, "x"))).toContain("desk.top");
      const high = edit(classroomPrimitives, "책상 상판", (item) => ({ position: [item.position[0], 1.1, item.position[2]] }));
      expect(rules(checkRoomPrimitives(high, classroom.spec, "x"))).toEqual(expect.arrayContaining(["desk.top", "desk-minus-seat"]));
    });

    it("의자가 너무 높다", () => {
      const tall = edit(classroomPrimitives, "의자 좌판", (item) => ({ position: [item.position[0], 0.8, item.position[2]] }));
      expect(rules(checkRoomPrimitives(tall, classroom.spec, "x"))).toContain("seat.top");
    });

    it("의자가 책상을 등진다(기존 프리셋에서 실제로 있던 결함)", () => {
      const away = classroomPrimitives.map((item) =>
        item.name?.startsWith("의자") ? { ...item, rotation: [0, item.rotation[1] + Math.PI, 0] as [number, number, number] } : item,
      );
      expect(rules(checkRoomPrimitives(away, classroom.spec, "x"))).toContain("seat.faces-desk");
    });

    it("교탁·칠판·사물함이 사람 눈금에서 벗어난다", () => {
      const podium = edit(classroomPrimitives, "교탁 상판", (item) => ({ position: [item.position[0], 0.3, item.position[2]] }));
      expect(rules(checkRoomPrimitives(podium, classroom.spec, "x"))).toContain("podium.top");
      const lowBoard = edit(classroomPrimitives, "칠판 틀", (item) => ({ position: [item.position[0], 0.5, item.position[2]] }));
      expect(rules(checkRoomPrimitives(lowBoard, classroom.spec, "x"))).toEqual(expect.arrayContaining(["board.bottom", "board.above-human"]));
      const tinyBoard = edit(classroomPrimitives, "칠판 틀", (item) => ({ scale: [1, 0.3, item.scale[2]] }));
      expect(rules(checkRoomPrimitives(tinyBoard, classroom.spec, "x"))).toEqual(expect.arrayContaining(["board.height", "board.width"]));
      const shortLocker = edit(classroomPrimitives, "사물함 몸통", (item) => ({ scale: [item.scale[0], 0.9, item.scale[2]] }));
      expect(rules(checkRoomPrimitives(shortLocker, classroom.spec, "x"))).toContain("locker.height");
    });

    it("책걸상 줄 간격을 좁히면 통로 규칙이 걸린다", () => {
      const cramped = classroomPrimitives.map((item) => ({ ...item, position: [item.position[0], item.position[1], item.position[2] * 0.4] as [number, number, number] }));
      expect(rules(checkRoomPrimitives(cramped, classroom.spec, "x"))).toContain("aisle.between-desk-sets");
    });

    it("가구가 문 앞을 막거나 방 밖으로 나가면 걸린다", () => {
      const door = classroom.spec.openings.find((opening) => opening.type === "door")!;
      const zone = doorApproachZone(classroom.spec, door);
      const blocked = edit(classroomPrimitives, "교탁 몸통", (item) => ({
        position: [(zone.minX + zone.maxX) / 2, item.position[1], (zone.minZ + zone.maxZ) / 2],
      }));
      expect(rules(checkRoomPrimitives(blocked, classroom.spec, "x"))).toContain("door.approach-blocked");
      const outside = edit(classroomPrimitives, "교탁 몸통", (item) => ({ position: [item.position[0] + 20, item.position[1], item.position[2]] }));
      expect(rules(checkRoomPrimitives(outside, classroom.spec, "x"))).toContain("furniture.inside-room");
    });

    it("복도에 사물함을 깊게 놓아 통로가 좁아지면 걸린다", () => {
      const corridor = roomEntry("corridor");
      const primitives = build(corridor);
      expect(checkCorridorClearWidth(corridor.spec, primitives, "x")).toEqual([]);
      const deep = edit(primitives, "사물함 몸통", (item) => ({ scale: [item.scale[0], item.scale[1], 1.2] }));
      expect(rules(checkCorridorClearWidth(corridor.spec, deep, "x"))).toContain("corridor.clear-width");
      const narrow = { ...corridor.spec, depth: 1.2 };
      expect(rules(checkCorridorClearWidth(narrow, primitives, "x"))).toContain("corridor.width");
    });

    it("나머지 방 규칙도 각각 걸린다(창 높이, 의자-책상 거리, 책상 없는 의자, 칠판-천장 여유, 사물함 깊이)", () => {
      const room = (primitives: readonly BgPrimitive[], spec: StudioBg3dRoomSpec = classroom.spec) => rules(checkRoomPrimitives(primitives, spec, "x"));
      // 창이 너무 낮은 띠(0.5m)이거나 천장까지 닿는 통창(2.5m)이다.
      for (const height of [0.5, 2.5]) {
        const odd = specWith({ openings: [{ wall: "east", type: "window", centerOffset: 0, width: 1.8, height, sillHeight: 0.5 }] });
        expect(rules(checkRoomSpec(odd, "x")), `창 높이 ${height}m`).toContain("window.height");
      }
      // 의자가 책상에서 멀리 떨어져 있거나(30m) 책상 위에 올라가 있다.
      const farSeat = edit(classroomPrimitives, "의자 좌판", (item) => ({ position: [item.position[0] + 30, item.position[1], item.position[2]] }));
      expect(room(farSeat)).toContain("seat.near-desk");
      const deskTop = named(classroomPrimitives, "책상 상판")[0];
      const onDesk = edit(classroomPrimitives, "의자 좌판", (item) => ({ position: [deskTop.position[0], item.position[1], deskTop.position[2]] }));
      expect(room(onDesk)).toContain("seat.near-desk");
      // 의자만 있고 책상이 하나도 없다.
      expect(room(classroomPrimitives.filter((item) => item.name !== "책상 상판"))).toContain("seat.has-desk");
      // 천장을 2.3m 로 낮추면 윗단 2.15m 인 칠판이 천장에 붙는다.
      expect(room(classroomPrimitives, specWith({ wallHeight: 2.3 }))).toContain("board.below-ceiling");
      // 사물함이 1.2m 로 깊다(복도를 막는다).
      expect(room(edit(classroomPrimitives, "사물함 몸통", (item) => ({ scale: [item.scale[0], item.scale[1], 1.2] })))).toContain("locker.depth");
    });

    const street = streetEntry();
    const streetPrimitives = build(street);
    const STREET_OPTIONS = { floorHeight: street.spec.floorHeight };

    it("차로가 좁거나 연석이 높다", () => {
      const narrow = edit(streetPrimitives, "도로", (item) => ({ scale: [3, item.scale[1], item.scale[2]] }));
      expect(rules(checkStreetPrimitives(narrow, "x", STREET_OPTIONS))).toContain("lane.width");
      const tallCurb = edit(streetPrimitives, "보도", (item) => ({ scale: [item.scale[0], 0.5, item.scale[2]] }));
      expect(rules(checkStreetPrimitives(tallCurb, "x", STREET_OPTIONS))).toContain("curb.height");
    });

    it("가로등·가로수가 장난감 크기다", () => {
      const lowLamp = edit(streetPrimitives, "가로등 기둥", (item) => ({ scale: [item.scale[0], 2, item.scale[2]] }));
      expect(rules(checkStreetPrimitives(lowLamp, "x", STREET_OPTIONS))).toContain("lamp.height");
      const lowCanopy = edit(streetPrimitives, "가로수 잎", (item) => ({ position: [item.position[0], 0.9, item.position[2]] }));
      expect(rules(checkStreetPrimitives(lowCanopy, "x", STREET_OPTIONS))).toContain("tree.canopy-clearance");
    });

    it("차량이 장난감이거나 차로를 벗어난다", () => {
      const tiny = edit(streetPrimitives, "차량 몸체", (item) => ({ scale: [0.9, item.scale[1], 2] }));
      expect(rules(checkStreetPrimitives(tiny, "x", STREET_OPTIONS))).toEqual(expect.arrayContaining(["car.length", "car.width"]));
      const tinyWheels = edit(streetPrimitives, "차량 바퀴", (item) => ({ scale: [0.3, item.scale[1], 0.3] }));
      expect(rules(checkStreetPrimitives(tinyWheels, "x", STREET_OPTIONS))).toContain("car.wheel-diameter");
      const floating = edit(streetPrimitives, "차량 바퀴", (item) => ({ position: [item.position[0], 0.9, item.position[2]] }));
      expect(rules(checkStreetPrimitives(floating, "x", STREET_OPTIONS))).toContain("car.wheel-on-road");
      const offLane = edit(streetPrimitives, "차량 몸체", (item) => ({ position: [item.position[0] * 3, item.position[1], item.position[2]] }));
      expect(rules(checkStreetPrimitives(offLane, "x", STREET_OPTIONS))).toContain("car.inside-lane");
    });

    it("건물이 장난감 층고이거나 문·창이 낮다", () => {
      const flat = edit(streetPrimitives, "건물 본체", (item) => ({ scale: [item.scale[0], 2.2, item.scale[2]] }));
      expect(rules(checkStreetPrimitives(flat, "x", STREET_OPTIONS))).toEqual(expect.arrayContaining(["building.floor-multiple", "building.floors"]));
      // 스펙의 층고 자체가 장난감(1m)이면 층고 규칙이 걸린다.
      expect(rules(checkStreetPrimitives(streetPrimitives, "x", { floorHeight: 1 }))).toContain("building.floor-to-floor");
      const lowDoor = edit(streetPrimitives, "건물 문", (item) => ({ scale: [item.scale[0], 1.2, item.scale[2]] }));
      expect(rules(checkStreetPrimitives(lowDoor, "x", STREET_OPTIONS))).toContain("building.door-height");
      const lowWindow = edit(streetPrimitives, "건물 창", (item) => ({ position: [item.position[0], item.position[1] - 0.8, item.position[2]] }));
      expect(rules(checkStreetPrimitives(lowWindow, "x", STREET_OPTIONS))).toContain("building.window-sill");
    });

    it("출입문과 상가 유리가 겹치거나 건물 폭 밖으로 나가면 걸린다", () => {
      const overlapping = edit(streetPrimitives, "건물 문", (item) => ({ position: [item.position[0], item.position[1], item.position[2] - 3.4] }));
      expect(rules(checkStreetPrimitives(overlapping, "x", STREET_OPTIONS))).toContain("building.door-clear-of-shop");
      const wideGlass = edit(streetPrimitives, "상가 유리", (item) => ({ scale: [item.scale[0], item.scale[1], 30] }));
      expect(rules(checkStreetPrimitives(wideGlass, "x", STREET_OPTIONS))).toContain("building.feature-inside");
    });

    it("보도 물체 옆으로 사람이 지나갈 폭이 남지 않으면 걸린다", () => {
      const fatSidewalkItems = edit(streetPrimitives, "가로수 줄기", (item) => ({ scale: [3, item.scale[1], 3] }));
      expect(rules(checkStreetPrimitives(fatSidewalkItems, "x", STREET_OPTIONS))).toContain("sidewalk.passage");
    });

    it("벤치와 횡단보도가 눈금에서 벗어난다", () => {
      const highBench = edit(streetPrimitives, "벤치 좌판", (item) => ({ position: [item.position[0], 1.2, item.position[2]] }));
      expect(rules(checkStreetPrimitives(highBench, "x", STREET_OPTIONS))).toContain("bench.seat");
      const fatStripe = edit(streetPrimitives, "횡단보도 줄무늬", (item) => ({ scale: [1.5, item.scale[1], item.scale[2]] }));
      expect(rules(checkStreetPrimitives(fatStripe, "x", STREET_OPTIONS))).toContain("crosswalk.stripe-width");
    });

    it("나머지 거리 규칙도 각각 걸린다", () => {
      const ruleOf = (primitives: readonly BgPrimitive[]) => rules(checkStreetPrimitives(primitives, "x", STREET_OPTIONS));
      const shift = (dy: number) => (item: BgPrimitive) => ({ position: [item.position[0], item.position[1] + dy, item.position[2]] as [number, number, number] });
      expect(ruleOf(edit(streetPrimitives, "가로등 기둥", (item) => ({ scale: [2, item.scale[1], 2] })))).toContain("lamp.pole-diameter");
      expect(ruleOf(edit(streetPrimitives, "가로등 기둥", shift(1)))).toContain("lamp.base-on-sidewalk");
      expect(ruleOf(edit(streetPrimitives, "가로수 줄기", (item) => ({ scale: [0.1, item.scale[1], 0.1] })))).toContain("tree.trunk-diameter");
      expect(ruleOf(edit(streetPrimitives, "보도", (item) => ({ scale: [1, item.scale[1], item.scale[2]] })))).toContain("sidewalk.width");
      expect(ruleOf(edit(streetPrimitives, "보도", shift(0.4)))).toContain("sidewalk.top-matches-curb");
      expect(ruleOf(edit(streetPrimitives, "건물 문", shift(0.5)))).toContain("building.door-on-sidewalk");
      expect(ruleOf(edit(streetPrimitives, "건물 문", (item) => ({ scale: [item.scale[0], item.scale[1], 0.4] })))).toContain("building.door-width");
      expect(ruleOf(edit(streetPrimitives, "상가 유리", shift(1.4)))).toEqual(expect.arrayContaining(["building.shop-sill", "building.shop-headroom"]));
      expect(ruleOf(edit(streetPrimitives, "건물 창", shift(1.1)))).toEqual(expect.arrayContaining(["building.window-headroom"]));
      expect(ruleOf(edit(streetPrimitives, "차량 객실", (item) => ({ position: [item.position[0], 2.4, item.position[2]] })))).toContain("car.height");
      expect(ruleOf(edit(streetPrimitives, "횡단보도 줄무늬", (item) => ({ position: [item.position[0] + 9, item.position[1], item.position[2]] })))).toContain("crosswalk.inside-road");
    });

    it("정상 데이터에는 어떤 결함 규칙도 걸리지 않는다(통제군)", () => {
      expect(checkStreetPrimitives(streetPrimitives, "x", STREET_OPTIONS)).toEqual([]);
      expect(checkRoomPrimitives(classroomPrimitives, classroom.spec, "x")).toEqual([]);
    });

    // "규칙마다 합성 결함이 있다"는 주장이 새 규칙이 늘어도 지켜지게, 이 파일 자신의 소스에서 검사기가 내는 규칙 id 를
    // 뽑아 합성 결함 구역에 그 id 가 적혀 있는지 본다(규칙을 더하고 결함 시험을 빠뜨리면 여기서 걸린다).
    it("검사기가 내는 모든 규칙 id 에 합성 결함 시험이 있다", () => {
      const own = readFileSync(new URL(import.meta.url), "utf8");
      const checkers = own.slice(own.indexOf("// ── 방 검사"), own.indexOf("// ── 카탈로그 전체에 적용"));
      const controls = own.slice(own.indexOf('describe("합성 결함(negative control)'), own.indexOf('it("거리 스펙을 극단값으로'));
      const emitted = new Set([
        ...[...checkers.matchAll(/\b(?:range|atLeast|within)\("([a-z][a-z.-]*)"/gu)].map((match) => match[1]!),
        ...[...checkers.matchAll(/rule: "([a-z][a-z.-]*)"/gu)].map((match) => match[1]!),
      ]);
      expect(emitted.size).toBeGreaterThan(50);
      expect(emitted.has("window.height") && emitted.has("locker.depth") && emitted.has("desk-minus-seat")).toBe(true);
      const withoutControl = [...emitted].filter((rule) => !controls.includes(`"${rule}"`));
      expect(withoutControl, "합성 결함 시험이 없는 규칙").toEqual([]);
    });
  });

  it("거리 스펙을 극단값으로 눌러도 사람 크기 규칙을 유지한다", () => {
    const extremes: Array<Partial<StudioBg3dStreetSpec>> = [
      { laneWidth: 0.5, sidewalkWidth: 0.1, floorHeight: 0.5, length: 1, westFloors: [1], eastFloors: [99, 99, 99, 99, 99, 99, 99] },
      { laneWidth: 99, sidewalkWidth: 99, floorHeight: 99, length: 9999, westFloors: [], eastFloors: [6] },
      { length: Number.NaN, laneWidth: Number.NaN, westFloors: "x" as unknown as number[] },
      STUDIO_BG3D_STREET_DEFAULT_SPEC,
    ];
    for (const raw of extremes) {
      const spec = clampStudioBg3dStreetSpec(raw);
      const primitives = buildStudioBg3dStreetParts(spec).map(
        (part, index): BgPrimitive => ({ ...part, id: `x-${index}`, rotation: [...part.rotation], position: [...part.position], scale: [...part.scale] }),
      );
      expect(checkStreetPrimitives(primitives, "extreme", { floorHeight: spec.floorHeight }), JSON.stringify(spec)).toEqual([]);
    }
  });
});
