import type { Office2dActor } from "./office2d-actors";
import type { Office2dSheetFrame } from "./office2d-poses";
import { office2dHashIndex } from "./office2d-sprite-catalog";

type ExpressionActor = Pick<Office2dActor, "id" | "character" | "facing" | "moving" | "gaitBlend" | "seat" | "bubble" | "typing" | "emote" | "gesture">;

const TALK_SEQUENCE: readonly number[] = [0, 1, 2, 1, 3, 0];
const LAUGH_SEQUENCE: readonly number[] = [4, 5, 6, 5, 7];

/** 완전히 멈춘 정면 중립 자세에서 사용할 전신 대화·웃음 프레임만 선택한다. */
export function office2dExpressionFrame(
  actor: ExpressionActor,
  pose: Office2dSheetFrame,
  time: number,
  now: number,
  reducedMotion: boolean,
): number | null {
  if (actor.seat || actor.facing !== "down" || actor.moving || actor.gaitBlend !== 0
    || pose.sheet !== "walk" || pose.row !== 0 || pose.col !== 0
    || (actor.gesture && actor.gesture.until > now)) return null;
  const laughing = actor.emote?.kind === "laugh" && actor.emote.until > now;
  if (!laughing && !actor.bubble && !actor.typing) return null;
  if (reducedMotion) return laughing ? 5 : 1;
  const sequence = laughing ? LAUGH_SEQUENCE : TALK_SEQUENCE;
  const phase = office2dHashIndex(actor.id, 997) / 997;
  const step = Math.floor(((Number.isFinite(time) ? time : 0) + phase) / (laughing ? 0.16 : 0.14));
  return sequence[((step % sequence.length) + sequence.length) % sequence.length] ?? null;
}
