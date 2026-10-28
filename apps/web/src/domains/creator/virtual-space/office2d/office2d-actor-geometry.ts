/**
 * ToonOffice 2D 배우 표시 기하: 발 위치·머리 위 기준점.
 *
 * 렌더러(스프라이트)와 오버레이(이름표·말풍선)가 같은 값을 써야 이름표가 머리에서 떨어지거나 파묻히지 않는다.
 * 착석 자세는 작업 자세 시트(발끝 y=188, 셀 192)의 엉덩이 높이에 맞춰 의자 좌석점(attach)에서 발까지의 거리를 정했다.
 */
import type { Office2dActor } from "./office2d-actors";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";

/** 서 있는 캐릭터의 월드 높이(px). 셀 192px이 이 높이로 그려진다. */
export const OFFICE2D_ACTOR_HEIGHT = 76;
/** 셀 안 발끝 기준선 비율(188 / 192). */
export const OFFICE2D_FOOT_RATIO = 188 / 192;

/** 좌석점(엉덩이)에서 발끝까지 월드 거리: 뒤 착석 · 앞 착석 · 옆(보행 시트 폴백). */
const SEAT_FOOT_OFFSET = Object.freeze({ up: 15, down: 19, side: 16 });
/** 발끝에서 머리 위까지(키 대비 비율): 서기 · 작업 자세 착석 · 옆 착석. */
const HEAD_RATIO = Object.freeze({ stand: 0.98, sitWork: 0.8, sitSide: 0.84 });

type GeometryActor = Pick<Office2dActor, "x" | "y" | "seat">;

export function office2dActorFoot(actor: GeometryActor): StudioVirtualSpacePoint {
  const seat = actor.seat;
  if (!seat) return { x: actor.x, y: actor.y };
  const offset = seat.facing === "up" ? SEAT_FOOT_OFFSET.up : seat.facing === "down" ? SEAT_FOOT_OFFSET.down : SEAT_FOOT_OFFSET.side;
  return { x: seat.attach.x, y: seat.attach.y + offset };
}

/** 이름표 아래쪽이 닿을 머리 위 월드 y. */
export function office2dActorHeadY(actor: GeometryActor): number {
  const foot = office2dActorFoot(actor);
  const seat = actor.seat;
  const ratio = !seat ? HEAD_RATIO.stand : seat.facing === "up" || seat.facing === "down" ? HEAD_RATIO.sitWork : HEAD_RATIO.sitSide;
  return foot.y - OFFICE2D_ACTOR_HEIGHT * ratio;
}
