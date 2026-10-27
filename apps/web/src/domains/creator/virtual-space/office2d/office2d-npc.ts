/**
 * ToonOffice 2D NPC 일과: 순찰 지점 사이를 걷고, 도착하면 잠시 머물고, 가까이 온 사람을 돌아본다.
 * 순수 상태 기계라 시간과 위치만으로 결정적으로 움직인다.
 */
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioWorldNpcDefinition } from "../studio-virtual-space-world-manifest";
import { office2dFacingFromVector } from "./office2d-actors";
import { office2dRandom } from "./office2d-procedural-art";

export interface Office2dNpcState {
  readonly definition: StudioWorldNpcDefinition;
  x: number;
  y: number;
  facing: StudioVirtualSpaceFacing;
  moving: boolean;
  target: number;
  waitUntil: number;
  /** 길을 비켜 주는 중(플레이어가 바로 앞). */
  yielding: boolean;
  readonly random: () => number;
}

const LOOK_DISTANCE = 120;
const YIELD_DISTANCE = 34;

export function createOffice2dNpc(definition: StudioWorldNpcDefinition, seed: number): Office2dNpcState {
  return {
    definition,
    x: definition.point.x,
    y: definition.point.y,
    facing: definition.facing ?? "down",
    moving: false,
    target: 0,
    waitUntil: 0,
    yielding: false,
    random: office2dRandom(seed),
  };
}

/** 한 프레임 진행. 플레이어 위치는 돌아보기·길 비키기에만 쓴다. */
export function stepOffice2dNpc(npc: Office2dNpcState, player: StudioVirtualSpacePoint, deltaSeconds: number, nowMs: number): void {
  const patrol = npc.definition.patrol ?? [];
  const playerDistance = Math.hypot(player.x - npc.x, player.y - npc.y);
  npc.moving = false;
  if (patrol.length === 0 || npc.definition.behavior !== "patrol") {
    npc.facing = playerDistance < LOOK_DISTANCE
      ? office2dFacingFromVector(player.x - npc.x, player.y - npc.y, npc.facing)
      : npc.definition.facing ?? "down";
    return;
  }
  if (nowMs < npc.waitUntil) {
    if (playerDistance < LOOK_DISTANCE) npc.facing = office2dFacingFromVector(player.x - npc.x, player.y - npc.y, npc.facing);
    return;
  }
  const goal = patrol[npc.target % patrol.length] ?? npc.definition.point;
  const dx = goal.x - npc.x;
  const dy = goal.y - npc.y;
  const distance = Math.hypot(dx, dy);
  const speed = npc.definition.speed ?? 52;
  // 플레이어가 진행 방향 바로 앞에 있으면 멈춰서 길을 비켜 준다.
  const ahead = distance > 0 && playerDistance < YIELD_DISTANCE && ((player.x - npc.x) * dx + (player.y - npc.y) * dy) > 0;
  npc.yielding = ahead;
  if (ahead) {
    npc.facing = office2dFacingFromVector(player.x - npc.x, player.y - npc.y, npc.facing);
    return;
  }
  if (distance <= Math.max(2, speed * deltaSeconds)) {
    npc.x = goal.x;
    npc.y = goal.y;
    npc.target = (npc.target + 1) % patrol.length;
    npc.waitUntil = nowMs + 1500 + npc.random() * 3500;
    return;
  }
  npc.x += (dx / distance) * speed * deltaSeconds;
  npc.y += (dy / distance) * speed * deltaSeconds;
  npc.facing = office2dFacingFromVector(dx, dy, npc.facing);
  npc.moving = true;
}
