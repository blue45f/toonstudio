import {
  STUDIO_RICH_MOTION_PROFILES,
  isStudioRichMotionId,
  sampleStudioRichMotion,
  type StudioRichMotionId,
} from "../studio-virtual-space-character-motion";
import {
  studioSpaceEmoteById,
  studioSpaceEmoteDurationMs,
} from "../studio-virtual-space-emote-catalog";
import { studioEmoteBodyMotion } from "../studio-virtual-space-emote-runtime";
import {
  createStudioPeerAntiJitterState,
  stepStudioPeerAntiJitter,
  type StudioPeerAntiJitterState,
} from "../studio-virtual-space-peer-motion";
import {
  STUDIO_DISPLAY_MAX_DELTA_SECONDS,
  createStudioFacingHysteresis,
  dampStudioDisplayPoint,
  stepStudioFacingHysteresis,
  type StudioFacingHysteresisState,
} from "../studio-virtual-space-sprite-smoothing";
import { office2dEmoteGlyph, type Office2dActor } from "./office2d-actors";
import { office2dGestureForEmote, type Office2dGesture } from "./office2d-sprite-catalog";

export interface Office2dEmoteTransform {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly tiltRad: number;
  readonly facingOverride: Office2dActor["facing"] | null;
  readonly scaleX?: number;
  readonly scaleY?: number;
}

const ZERO_EMOTE_TRANSFORM: Office2dEmoteTransform = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  tiltRad: 0,
  facingOverride: null,
  scaleX: 1,
  scaleY: 1,
});

const CYCLE_FACINGS: readonly Office2dActor["facing"][] = Object.freeze(["down", "left", "up", "right"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstepUnit(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function emoteSmoothEnvelope(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0) || elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  const attack = smoothstepUnit(elapsedMs / 140);
  const release = smoothstepUnit((durationMs - elapsedMs) / 180);
  return Math.min(attack, release);
}

function gestureForRichMotion(id: StudioRichMotionId): Office2dGesture | null {
  const category = STUDIO_RICH_MOTION_PROFILES[id].category;
  if (category === "dance" || id === "celebrate-spin" || id === "dramatic-entrance") return "cheer";
  if (id === "wave-greet" || id === "wrist-roll-break") return "wave";
  if (category === "gymnastics" || id === "stretch-break") return "cheer";
  if (id === "sit-draw" || id === "focus-typing") return "think";
  return null;
}

export function applyOffice2dActorEmote(
  actor: Office2dActor,
  kind: string,
  nowMs: number,
): { readonly glyph: string; readonly durationMs: number } | null {
  const catalogDef = studioSpaceEmoteById(kind);
  if (catalogDef) {
    const glyph = office2dEmoteGlyph(kind);
    if (!glyph) return null;
    const durationMs = studioSpaceEmoteDurationMs(kind);
    const until = nowMs + durationMs;
    actor.emote = { glyph, until, kind, startedAt: nowMs };
    const gesture = office2dGestureForEmote(kind);
    actor.gesture = gesture ? { kind: gesture, until } : null;
    return { glyph, durationMs };
  }
  if (isStudioRichMotionId(kind)) {
    const profile = STUDIO_RICH_MOTION_PROFILES[kind];
    const durationMs = profile.defaultDurationMs > 0 ? profile.defaultDurationMs : 3_200;
    const until = nowMs + durationMs;
    actor.emote = { glyph: profile.glyph, until, kind, startedAt: nowMs };
    const gesture = gestureForRichMotion(kind);
    actor.gesture = gesture ? { kind: gesture, until } : null;
    return { glyph: profile.glyph, durationMs };
  }
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
  const definition = studioSpaceEmoteById(kind);
  if (definition) {
    const glyph = office2dEmoteGlyph(kind);
    if (!glyph) return null;
    const label = language === "en" ? definition.labelEn : definition.labelKo;
    return `${glyph} ${label}`;
  }
  if (isStudioRichMotionId(kind)) {
    const profile = STUDIO_RICH_MOTION_PROFILES[kind];
    const label = language === "en" ? profile.labelEn : profile.labelKo;
    return `${profile.glyph} ${label}`;
  }
  const glyph = office2dEmoteGlyph(kind);
  if (!glyph) return null;
  return `${glyph} ${kind}`;
}

export function resolveOffice2dEmoteTransform(
  actor: Pick<Office2dActor, "emote" | "moving" | "seat">,
  nowMs: number,
  reducedMotion: boolean,
): Office2dEmoteTransform {
  if (reducedMotion || !actor.emote || actor.emote.until <= nowMs) {
    return ZERO_EMOTE_TRANSFORM;
  }
  if (isStudioRichMotionId(actor.emote.kind)) {
    const profile = STUDIO_RICH_MOTION_PROFILES[actor.emote.kind];
    const durationMs = Math.max(400, actor.emote.until - (actor.emote.startedAt ?? actor.emote.until - (profile.defaultDurationMs || 3_200)));
    const startedAt = actor.emote.startedAt ?? actor.emote.until - durationMs;
    const elapsedMs = Math.max(0, nowMs - startedAt);
    const pose = sampleStudioRichMotion(actor.emote.kind, {
      elapsedMs,
      nowMs,
      durationMs,
      reducedMotion,
    });
    const facingOverride = pose.facingCycleIndex !== null
      ? (CYCLE_FACINGS[pose.facingCycleIndex % CYCLE_FACINGS.length] ?? null)
      : null;
    if (actor.moving || actor.seat !== null) {
      return {
        offsetX: clamp(pose.offsetX * 0.25, -3, 3),
        offsetY: clamp(pose.offsetY * 0.35, -4, 3),
        tiltRad: clamp(pose.tiltRad * 0.25, -0.08, 0.08),
        facingOverride: null,
        scaleX: 1,
        scaleY: 1,
      };
    }
    return {
      offsetX: clamp(pose.offsetX, -8, 8),
      offsetY: clamp(pose.offsetY, -9, 8),
      tiltRad: clamp(pose.tiltRad, -0.22, 0.22),
      facingOverride,
      scaleX: 1,
      scaleY: 1,
    };
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
  // 모든 카탈로그 이모트에 C1 시작·종료 엔벨로프와 진폭 상한을 적용해 뚝 끊김·과도 흔들림을 차단한다.
  const envelope = emoteSmoothEnvelope(elapsed, durationMs);
  const offsetX = clamp(body.bodyX * envelope, -8, 8);
  const offsetY = clamp(body.bodyY * envelope, -9, 8);
  const tiltRad = clamp(((body.bodyAngle * Math.PI) / 180) * envelope, -0.22, 0.22);
  if (actor.moving || actor.seat !== null) {
    return {
      offsetX: offsetX * 0.25,
      offsetY: offsetY * 0.35,
      tiltRad: tiltRad * 0.25,
      facingOverride: null,
      scaleX: 1,
      scaleY: 1,
    };
  }
  return {
    offsetX,
    offsetY,
    tiltRad,
    facingOverride: envelope >= 0.35 ? body.facing : null,
    scaleX: 1,
    scaleY: 1,
  };
}

interface ActorRenderTrack {
  peer: StudioPeerAntiJitterState | null;
  facing: StudioFacingHysteresisState;
  x: number;
  y: number;
  lastTargetX: number;
  lastTargetY: number;
  lastTargetChangedAt: number;
  tilt: number;
  bobY: number;
  generation: number;
}

/**
 * Office2dRenderer 전용 프레임 독립 Anti-Jitter 표시 캐시.
 * - 그림자·자기 링·스프라이트가 프레임당 정확히 같은 스무딩 좌표와 히스테리시스 방향을 공유한다.
 * - 원격 피어는 속도 제한 임계감쇠·패킷 손실 감속 정지 필터를 거치고, 정지 시 데드존 스냅으로 0.1px 떨림을 차단한다.
 */
export class Office2dActorSmoothingCache {
  private readonly tracks = new Map<string, ActorRenderTrack>();
  private lastTime = Number.NaN;
  private dt = 0;
  private nowMs = 0;
  private reducedMotion = false;
  private generation = 0;

  beginFrame(timeSeconds: number, nowMs: number, reducedMotion: boolean): void {
    const safeTime = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    this.dt = Number.isFinite(this.lastTime) && safeTime >= this.lastTime
      ? Math.min(STUDIO_DISPLAY_MAX_DELTA_SECONDS, safeTime - this.lastTime)
      : 0;
    this.lastTime = safeTime;
    this.nowMs = Number.isFinite(nowMs) ? nowMs : 0;
    this.reducedMotion = reducedMotion;
    this.generation += 1;
  }

  resolveActor(
    actor: Office2dActor,
    isSelf: boolean,
  ): { readonly x: number; readonly y: number; readonly facing: Office2dActor["facing"] } {
    let track = this.tracks.get(actor.id);
    if (!track) {
      track = {
        peer: actor.kind === "peer"
          ? createStudioPeerAntiJitterState(actor.x, actor.y, actor.facing, this.nowMs)
          : null,
        facing: createStudioFacingHysteresis(actor.facing, this.nowMs),
        x: actor.x,
        y: actor.y,
        lastTargetX: actor.x,
        lastTargetY: actor.y,
        lastTargetChangedAt: this.nowMs,
        tilt: 0,
        bobY: 0,
        generation: this.generation,
      };
      this.tracks.set(actor.id, track);
      return { x: actor.x, y: actor.y, facing: actor.facing };
    }

    if (track.generation === this.generation) {
      return { x: track.x, y: track.y, facing: track.facing.facing };
    }
    track.generation = this.generation;

    if (Math.hypot(actor.x - track.lastTargetX, actor.y - track.lastTargetY) > 0.01) {
      track.lastTargetX = actor.x;
      track.lastTargetY = actor.y;
      track.lastTargetChangedAt = this.nowMs;
    }

    if (this.reducedMotion || this.dt <= 0 || actor.seat !== null) {
      track.x = actor.x;
      track.y = actor.y;
      track.facing = createStudioFacingHysteresis(actor.facing, this.nowMs);
      if (actor.kind === "peer") {
        track.peer = createStudioPeerAntiJitterState(actor.x, actor.y, actor.facing, this.nowMs);
      }
      return { x: track.x, y: track.y, facing: actor.facing };
    }

    if (actor.kind === "peer") {
      const nextPeer = stepStudioPeerAntiJitter(track.peer, {
        targetX: actor.x,
        targetY: actor.y,
        targetFacing: actor.facing,
        targetMoving: actor.moving,
        snapshotTimestampMs: track.lastTargetChangedAt,
        nowMs: this.nowMs,
        deltaSeconds: this.dt,
        reducedMotion: this.reducedMotion,
      });
      track.peer = nextPeer;
      track.x = nextPeer.x;
      track.y = nextPeer.y;
      track.facing = nextPeer.facingState;
      return { x: nextPeer.x, y: nextPeer.y, facing: nextPeer.facing };
    }

    const damped = dampStudioDisplayPoint({ x: track.x, y: track.y }, { x: actor.x, y: actor.y }, this.dt, {
      tauSeconds: isSelf ? 0.014 : 0.04,
      stopEpsilonPx: 0.08,
      enabled: !this.reducedMotion,
    });
    track.x = damped.x;
    track.y = damped.y;
    track.facing = actor.moving
      ? stepStudioFacingHysteresis(track.facing, actor.vx, actor.vy, this.nowMs)
      : createStudioFacingHysteresis(actor.facing, this.nowMs);
    return { x: track.x, y: track.y, facing: track.facing.facing };
  }

  smoothPose(
    actorId: string,
    targetTiltRad: number,
    targetBobOffsetY: number,
    immediate: boolean,
  ): { readonly tiltRad: number; readonly bobOffsetY: number } {
    const track = this.tracks.get(actorId);
    if (!track) return { tiltRad: targetTiltRad, bobOffsetY: targetBobOffsetY };
    if (immediate || this.reducedMotion || this.dt <= 0) {
      track.tilt = targetTiltRad;
      track.bobY = targetBobOffsetY;
      return { tiltRad: targetTiltRad, bobOffsetY: targetBobOffsetY };
    }
    const clampedTilt = clamp(targetTiltRad, -0.24, 0.24);
    const clampedBob = clamp(targetBobOffsetY, -14, 8);
    const alpha = 1 - Math.exp(-this.dt * 18);
    const nextTilt = track.tilt + (clampedTilt - track.tilt) * alpha;
    const nextBob = track.bobY + (clampedBob - track.bobY) * alpha;
    track.tilt = Math.abs(clampedTilt - nextTilt) < 1e-3 ? clampedTilt : nextTilt;
    track.bobY = Math.abs(clampedBob - nextBob) < 1e-2 ? clampedBob : nextBob;
    return { tiltRad: track.tilt, bobOffsetY: track.bobY };
  }

  endFrame(): void {
    for (const [id, track] of this.tracks) {
      if (track.generation !== this.generation) this.tracks.delete(id);
    }
  }
}
