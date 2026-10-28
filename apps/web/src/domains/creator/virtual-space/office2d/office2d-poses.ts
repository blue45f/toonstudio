/**
 * ToonOffice 2D 배우 자세 → 스프라이트 프레임 선택(순수 함수).
 *
 * - 보행 시트(walk): 4방향 × (정지 + 8프레임 보행). 서 있거나 걷는 기본 자세.
 * - 작업 자세 시트(work): 뒤에서 본 착석 작업 루프 · 앞에서 본 착석(기본·대화·웃음·커피) · 선 자세 제스처 4종.
 *
 * 규칙
 * 1. 위쪽(책상)을 보고 앉으면 작업 루프 [0,1,0,2,0,1,0,3]을 0.42초 간격으로 돈다. 배우마다 위상을 달리해 한 방의 작가들이
 *    같은 박자로 움직이지 않게 한다(줄 맞춘 군무처럼 보이는 문제 방지).
 * 2. 아래쪽(관람자)을 보고 앉으면 말하는 중(말풍선·입력 중)에는 대화·기본을 번갈아(입 모양), 웃음 이모트면 웃음,
 *    가만히 있으면 16초마다 3초 동안 커피를 마신다.
 * 3. 서서 멈춘 상태에서 제스처가 유효하면 제스처 프레임을 쓴다. 걷기 시작하면 제스처는 바로 끊는다.
 * 4. 옆으로 앉는 자리(소파 등)는 전용 프레임이 없어 보행 시트 정지 프레임을 쓴다.
 * 5. reduced motion이면 루프·입 모양·커피를 멈추고 각 행의 기본 프레임만 쓴다.
 */
import { office2dActorFrame, type Office2dActor } from "./office2d-actors";
import {
  OFFICE2D_GESTURE_FRAMES,
  OFFICE2D_SIT_FRONT_FRAMES,
  OFFICE2D_WORK_ROWS,
  office2dHashIndex,
} from "./office2d-sprite-catalog";

export interface Office2dSheetFrame {
  readonly sheet: "walk" | "work";
  readonly row: number;
  readonly col: number;
}

export const OFFICE2D_WORK_LOOP: readonly number[] = Object.freeze([0, 1, 0, 2, 0, 1, 0, 3]);
export const OFFICE2D_WORK_STEP_SECONDS = 0.42;
const TALK_FLAP_SECONDS = 0.28;
const COFFEE_PERIOD_SECONDS = 16;
const COFFEE_SECONDS = 3;

type PoseActor = Pick<Office2dActor, "id" | "facing" | "moving" | "stride" | "seat" | "gaitBlend" | "typing" | "bubble" | "emote" | "gesture">;

/** 배우별 고정 위상(초). 같은 사람은 어느 기기에서도 같은 박자다. */
export function office2dPosePhase(id: string): number {
  return (office2dHashIndex(id, 997) / 997) * 10;
}

export function office2dPoseFrame(actor: PoseActor, time: number, now: number, reducedMotion: boolean): Office2dSheetFrame {
  const seat = actor.seat;
  if (seat && seat.facing === "up") {
    if (reducedMotion) return { sheet: "work", row: OFFICE2D_WORK_ROWS.sitBack, col: 0 };
    const step = Math.floor((time + office2dPosePhase(actor.id)) / OFFICE2D_WORK_STEP_SECONDS);
    const col = OFFICE2D_WORK_LOOP[((step % OFFICE2D_WORK_LOOP.length) + OFFICE2D_WORK_LOOP.length) % OFFICE2D_WORK_LOOP.length] ?? 0;
    return { sheet: "work", row: OFFICE2D_WORK_ROWS.sitBack, col };
  }
  if (seat && seat.facing === "down") {
    const row = OFFICE2D_WORK_ROWS.sitFront;
    if (actor.emote && actor.emote.until > now && actor.emote.kind === "laugh") return { sheet: "work", row, col: OFFICE2D_SIT_FRONT_FRAMES.laugh };
    if (actor.bubble || actor.typing) {
      if (reducedMotion) return { sheet: "work", row, col: OFFICE2D_SIT_FRONT_FRAMES.talk };
      const flap = Math.floor(time / TALK_FLAP_SECONDS) % 2 === 0;
      return { sheet: "work", row, col: flap ? OFFICE2D_SIT_FRONT_FRAMES.talk : OFFICE2D_SIT_FRONT_FRAMES.idle };
    }
    if (!reducedMotion) {
      const cycle = (((time + office2dPosePhase(actor.id) * 1.7) % COFFEE_PERIOD_SECONDS) + COFFEE_PERIOD_SECONDS) % COFFEE_PERIOD_SECONDS;
      if (cycle >= COFFEE_PERIOD_SECONDS - COFFEE_SECONDS) return { sheet: "work", row, col: OFFICE2D_SIT_FRONT_FRAMES.coffee };
    }
    return { sheet: "work", row, col: OFFICE2D_SIT_FRONT_FRAMES.idle };
  }
  if (!seat && !actor.moving && actor.gesture && actor.gesture.until > now) {
    return { sheet: "work", row: OFFICE2D_WORK_ROWS.gesture, col: OFFICE2D_GESTURE_FRAMES[actor.gesture.kind] };
  }
  const walk = office2dActorFrame(actor);
  return { sheet: "walk", row: walk.row, col: walk.col };
}
