import {
  studioSpaceEmoteById,
  studioSpaceEmoteDurationMs,
} from "../studio-virtual-space-emote-catalog";
import { studioEmoteBodyMotion } from "../studio-virtual-space-emote-runtime";
import { office2dEmoteGlyph, type Office2dActor } from "./office2d-actors";
import { office2dGestureForEmote } from "./office2d-sprite-catalog";

export interface Office2dEmoteTransform {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly tiltRad: number;
  readonly facingOverride: Office2dActor["facing"] | null;
}

const ZERO_EMOTE_TRANSFORM: Office2dEmoteTransform = {
  offsetX: 0,
  offsetY: 0,
  tiltRad: 0,
  facingOverride: null,
};

export function applyOffice2dActorEmote(
  actor: Office2dActor,
  kind: string,
  nowMs: number,
): { readonly glyph: string; readonly durationMs: number } | null {
  const glyph = office2dEmoteGlyph(kind);
  if (!glyph) return null;
  const durationMs = studioSpaceEmoteDurationMs(kind);
  const until = nowMs + durationMs;
  actor.emote = { glyph, until, kind, startedAt: nowMs };
  const gesture = office2dGestureForEmote(kind);
  actor.gesture = gesture ? { kind: gesture, until } : null;
  return { glyph, durationMs };
}

export function office2dEmoteBurstLabel(
  kind: string,
  language: "ko" | "en",
): string | null {
  const glyph = office2dEmoteGlyph(kind);
  if (!glyph) return null;
  const definition = studioSpaceEmoteById(kind);
  const label = definition
    ? language === "en"
      ? definition.labelEn
      : definition.labelKo
    : kind;
  return `${glyph} ${label}`;
}

export function resolveOffice2dEmoteTransform(
  actor: Pick<Office2dActor, "emote" | "moving" | "seat">,
  nowMs: number,
  reducedMotion: boolean,
): Office2dEmoteTransform {
  if (reducedMotion || !actor.emote || actor.emote.until <= nowMs) {
    return ZERO_EMOTE_TRANSFORM;
  }
  const definition = studioSpaceEmoteById(actor.emote.kind);
  if (!definition) return ZERO_EMOTE_TRANSFORM;
  const durationMs = studioSpaceEmoteDurationMs(actor.emote.kind);
  const startedAt = actor.emote.startedAt ?? actor.emote.until - durationMs;
  const elapsed = Math.max(0, nowMs - startedAt);
  const body = studioEmoteBodyMotion(
    definition.motion,
    elapsed,
    durationMs,
    reducedMotion,
  );
  const tiltRad = (body.bodyAngle * Math.PI) / 180;
  if (actor.moving || actor.seat !== null) {
    return {
      offsetX: body.bodyX * 0.25,
      offsetY: body.bodyY * 0.35,
      tiltRad: tiltRad * 0.25,
      facingOverride: null,
    };
  }
  return {
    offsetX: body.bodyX,
    offsetY: body.bodyY,
    tiltRad,
    facingOverride: body.facing,
  };
}
