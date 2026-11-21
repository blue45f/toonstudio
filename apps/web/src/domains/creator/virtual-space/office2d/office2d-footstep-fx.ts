/**
 * ToonOffice 2D 발소리 효과음(Web Audio) · 바닥 재질별 먼지/파문 VFX · 점프 물리 ·
 * 코너 슬라이딩 충돌 보정(Gather/WorkAdventure REA) · 18종 캐릭터 모션(체조 3종·댄스 3종 포함) 및
 * 20종 드라마틱 연출 VFX 통합 컨트롤러.
 */
import {
  resolveDramaticVfxForEmoteOrAction,
  resolveDramaticVfxRenderPlan,
  resolveFloorMaterialFootstepVfx,
  type StudioDramaticVfxId,
  type StudioDramaticVfxRenderPlan,
  type StudioFloorMaterialKind,
  type StudioWellnessOrDanceActionId,
} from "../studio-virtual-space-dramatic-vfx-catalog";
import type { StudioExtendedFootstepSurface } from "../studio-virtual-space-footsteps";
import { studioFootstepSurfaceSpec } from "../studio-virtual-space-footsteps";
import { playStudioFootstepSound, playStudioSfxSound } from "../studio-virtual-space-sound-engine";
import { studioEmoteSfxKind } from "../studio-virtual-space-sound-synth";
import type { Office2dActor } from "./office2d-actors";
import type { Office2dParticles } from "./office2d-particles";
import type { Office2dPhysicsWorld, Office2dSurfaceMaterial } from "./office2d-physics";

export type Office2dCharacterMotionId =
  | "idle-breathe"
  | "blink"
  | "walk"
  | "sprint"
  | "jump"
  | "sit"
  | "desk-draw"
  | "wave"
  | "cheer"
  | "clap"
  | "think"
  | "coffee"
  | StudioWellnessOrDanceActionId;

export interface Office2dCharacterMotionSpec {
  readonly id: Office2dCharacterMotionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: "locomotion" | "work" | "expression" | "wellness" | "dance";
  readonly dramaticVfxId?: StudioDramaticVfxId;
}

/** 2D/3D 공통으로 지원하는 18종 핵심 캐릭터 모션 카탈로그 (기본 12종 + 작가 건강 체조 3종 + 신나는 댄스 3종). */
export const OFFICE2D_CHARACTER_MOTIONS: readonly Office2dCharacterMotionSpec[] = Object.freeze([
  { id: "idle-breathe", labelKo: "대기 호흡", labelEn: "Idle breathing", category: "locomotion" },
  { id: "blink", labelKo: "눈 깜빡임", labelEn: "Eye blink", category: "expression" },
  { id: "walk", labelKo: "4방향 걷기", labelEn: "4-way walk", category: "locomotion", dramaticVfxId: "wood-step-ripple" },
  { id: "sprint", labelKo: "전력 질주", labelEn: "Sprint", category: "locomotion", dramaticVfxId: "dash-speedlines" },
  { id: "jump", labelKo: "경쾌한 점프", labelEn: "Jump", category: "locomotion", dramaticVfxId: "highfive-shockwave" },
  { id: "sit", labelKo: "의자 착석", labelEn: "Chair sit", category: "work" },
  { id: "desk-draw", labelKo: "데스크 작화·타이핑", labelEn: "Desk drawing & typing", category: "work", dramaticVfxId: "ink-calligraphy-slash" },
  { id: "wave", labelKo: "손 흔들기", labelEn: "Wave", category: "expression", dramaticVfxId: "highfive-shockwave" },
  { id: "cheer", labelKo: "환호·만세", labelEn: "Cheer", category: "expression", dramaticVfxId: "deadline-confetti-fireworks" },
  { id: "clap", labelKo: "박수", labelEn: "Clap", category: "expression", dramaticVfxId: "highfive-shockwave" },
  { id: "think", labelKo: "생각 중", labelEn: "Thinking", category: "expression", dramaticVfxId: "eureka-spark-aura" },
  { id: "coffee", labelKo: "커피 휴식", labelEn: "Coffee break", category: "work", dramaticVfxId: "coffee-healing-steam" },
  { id: "neck-shoulder-stretch", labelKo: "목·어깨 체조", labelEn: "Neck & shoulder stretch", category: "wellness", dramaticVfxId: "mint-healing-spark" },
  { id: "wrist-roll-break", labelKo: "손목 풀기 체조", labelEn: "Wrist roll break", category: "wellness", dramaticVfxId: "mint-healing-spark" },
  { id: "standing-gymnastics", labelKo: "전신 스트레칭 체조", labelEn: "Standing gymnastics", category: "wellness", dramaticVfxId: "mint-healing-spark" },
  { id: "groove-dance", labelKo: "리듬 댄스", labelEn: "Groove dance", category: "dance", dramaticVfxId: "rhythm-note-wave" },
  { id: "deadline-victory-dance", labelKo: "마감 축하 댄스", labelEn: "Deadline victory dance", category: "dance", dramaticVfxId: "stage-spotlight-ring" },
  { id: "sync-group-dance", labelKo: "팀 동기화 댄스", labelEn: "Sync group dance", category: "dance", dramaticVfxId: "team-harmony-wave" },
]);

/** 배우의 현재 상태에서 대표 모션 ID를 판별한다. */
export function resolveOffice2dCharacterMotion(
  actor: Pick<Office2dActor, "moving" | "speed" | "seat" | "emote" | "gesture" | "typing" | "jumpHeight">,
  nowMs: number,
): Office2dCharacterMotionId {
  if ((actor.jumpHeight ?? 0) > 0.5) return "jump";
  if (actor.seat) {
    if (actor.emote && actor.emote.until > nowMs) {
      if (actor.emote.kind === "coffee") return "coffee";
      if (actor.emote.kind === "wrist-roll-break") return "wrist-roll-break";
      if (actor.emote.kind === "neck-stretch" || actor.emote.kind === "neck-shoulder-stretch") return "neck-shoulder-stretch";
    }
    if (actor.seat.facing === "up" || actor.typing) return "desk-draw";
    return "sit";
  }
  if (actor.moving) {
    return actor.speed >= 245 ? "sprint" : "walk";
  }
  if (actor.emote && actor.emote.until > nowMs) {
    const kind = actor.emote.kind;
    if (kind === "neck-stretch" || kind === "neck-shoulder-stretch") return "neck-shoulder-stretch";
    if (kind === "wrist-roll-break") return "wrist-roll-break";
    if (kind === "calisthenics" || kind === "standing-gymnastics") return "standing-gymnastics";
    if (kind === "groove-dance" || kind === "shuffle" || kind === "moonwalk") return "groove-dance";
    if (kind === "deadline-victory-dance" || kind === "cheers") return "deadline-victory-dance";
    if (kind === "sync-group-dance" || kind === "kpop-dance") return "sync-group-dance";
    if (kind === "wave" || kind === "raise-hand") return "wave";
    if (kind === "clap") return "clap";
    if (kind === "cheer" || kind === "party" || kind === "dance" || kind === "fireworks") return "cheer";
    if (kind === "think" || kind === "idea" || kind === "question") return "think";
    if (kind === "coffee") return "coffee";
  }
  if (actor.gesture && actor.gesture.until > nowMs) {
    if (actor.gesture.kind === "wave") return "wave";
    if (actor.gesture.kind === "cheer") return "cheer";
    if (actor.gesture.kind === "think") return "think";
  }
  return "idle-breathe";
}

/** 2D 물리 바닥 재질 + 방 ID를 Web Audio/파티클 5종 발소리 표면으로 변환한다. */
export function resolveOffice2dFootstepSurface(
  material: Office2dSurfaceMaterial | undefined,
  roomId?: string | null,
): StudioExtendedFootstepSurface {
  if (roomId && /terrace|garden|courtyard|rooftop|balcony|plaza|park|outdoor/iu.test(roomId)) {
    return "terrace";
  }
  switch (material) {
    case "carpet-sage":
    case "carpet-navy":
      return "carpet";
    case "oak":
    case "walnut":
    case "herringbone":
    case "cork":
      return "wood";
    case "terrazzo":
    case "concrete":
      return "stone";
    case "tile-cream":
      return "tile";
    default:
      return "wood";
  }
}

/** 2D 바닥 재질과 구역명을 나무·대리석·잔디·네온타일 포함 8종 드라마틱 발자국 VFX 재질로 변환한다. */
export function resolveOffice2dFootstepMaterialKind(
  material: Office2dSurfaceMaterial | undefined,
  roomId?: string | null,
): StudioFloorMaterialKind {
  if (roomId && /garden|park|meadow|grass/iu.test(roomId)) return "grass";
  if (roomId && /stage|neon|cyber|3d|bg3d|color/iu.test(roomId)) return "neon-tile";
  if (roomId && /lobby|gallery|hall|plaza/iu.test(roomId)) return "marble";
  if (roomId && /terrace|courtyard|rooftop|balcony|outdoor/iu.test(roomId)) return "terrace";
  switch (material) {
    case "terrazzo": return "marble";
    case "tile-cream": return "tile";
    case "concrete": return "stone";
    case "carpet-sage":
    case "carpet-navy": return "carpet";
    default: return "wood";
  }
}

const JUMP_VELOCITY = 235;
const JUMP_GRAVITY = 940;
const SPRINT_SPEED_THRESHOLD = 245;

/** 2D 캐릭터 점프·발소리·바닥 파문·먼지 퍼프·착석/이모트 드라마틱 VFX 통합 컨트롤러. */
export class Office2dFootstepFx {
  private jumpZ = 0;
  private jumpVz = 0;

  get jumpHeight(): number {
    return this.jumpZ;
  }

  /** 공중이 아니고 앉아 있지 않으면 경쾌한 점프를 시작한다. */
  triggerJump(
    actor: Office2dActor,
    particles: Office2dParticles,
    surface: StudioExtendedFootstepSurface,
    reducedMotion: boolean,
    muted: boolean,
  ): boolean {
    if (actor.seat || this.jumpZ > 0.5) return false;
    this.jumpVz = JUMP_VELOCITY;
    this.jumpZ = 0.6;
    actor.jumpHeight = this.jumpZ;
    actor.squash = 0.085;
    if (!reducedMotion) {
      particles.emitLandingDust(actor.x, actor.y, surface, true);
      particles.emit("ring", actor.x, actor.y, 1, 0.8);
    }
    if (!muted) {
      playStudioSfxSound("jump", 0.9);
    }
    return true;
  }

  /** 매 프레임 점프 중력을 적분하고 착지 시 먼지 링·바닥 재질 파문·착지음·스쿼시를 발동한다. */
  stepJump(
    actor: Office2dActor,
    dt: number,
    particles: Office2dParticles,
    surface: StudioExtendedFootstepSurface,
    reducedMotion: boolean,
    muted: boolean,
  ): boolean {
    if (actor.seat) {
      this.jumpZ = 0;
      this.jumpVz = 0;
      actor.jumpHeight = 0;
      return false;
    }
    if (this.jumpZ <= 0 && this.jumpVz <= 0) {
      actor.jumpHeight = 0;
      return false;
    }
    this.jumpVz -= JUMP_GRAVITY * dt;
    this.jumpZ += this.jumpVz * dt;
    if (this.jumpZ <= 0) {
      this.jumpZ = 0;
      this.jumpVz = 0;
      actor.jumpHeight = 0;
      actor.squash = -0.095;
      if (!reducedMotion) {
        particles.emitLandingDust(actor.x, actor.y, surface, false);
        const recipe = resolveFloorMaterialFootstepVfx(surface);
        particles.emit("ring", actor.x, actor.y, 1, recipe.ringRadiusScale);
        if (recipe.rippleKind === "petal-dew") {
          particles.emit("petal", actor.x, actor.y - 4, 3, 0.85);
        } else if (recipe.rippleKind === "starlight-wave" || recipe.rippleKind === "neon-pulse") {
          particles.emit("starburst", actor.x, actor.y - 6, 3, 0.9);
        }
      }
      if (!muted) {
        playStudioSfxSound("land", 0.95);
      }
      return true;
    }
    actor.jumpHeight = this.jumpZ;
    return false;
  }

  /** 보행 반주기 착지 및 방향 급전환 시 바닥 재질별 발소리(Web Audio)와 파문·먼지·대시 스피드라인을 낸다. */
  onMovementStep(
    actor: Office2dActor,
    particles: Office2dParticles,
    surface: StudioExtendedFootstepSurface,
    sprint: boolean,
    reducedMotion: boolean,
    muted: boolean,
  ): void {
    if (actor.seat || this.jumpZ > 0.5) return;
    if (actor.skidTriggered) {
      if (!reducedMotion) {
        particles.emitFootstepDust(actor.x, actor.y, {
          surface,
          vx: actor.vx,
          vy: actor.vy,
          sprint,
          skid: true,
        });
        particles.emit("shockwave", actor.x, actor.y, 1, 0.85);
      }
      if (!muted) {
        playStudioSfxSound("skid", 0.8);
      }
    }
    if (!actor.footstepTriggered) return;

    const footX = actor.x + actor.footstepSide * 5;
    const isSprinting = sprint || actor.speed >= SPRINT_SPEED_THRESHOLD;
    if (!reducedMotion) {
      particles.emitFootstepDust(footX, actor.y, {
        surface,
        vx: actor.vx,
        vy: actor.vy,
        sprint: isSprinting,
        skid: false,
      });
      const recipe = resolveFloorMaterialFootstepVfx(surface);
      if (recipe.rippleKind === "petal-dew") {
        particles.emit("petal", footX, actor.y - 4, isSprinting ? 2 : 1, 0.7);
      } else if (recipe.rippleKind === "starlight-wave" || recipe.rippleKind === "neon-pulse") {
        particles.emit("ring", footX, actor.y, 1, recipe.ringRadiusScale * 0.72);
        if (isSprinting) particles.emit("spark", footX, actor.y - 6, 2, 0.8);
      }
      if (isSprinting) {
        particles.emit("speedline", footX, actor.y - 14, 2, 0.95);
      }
    }
    if (!muted) {
      const spec = studioFootstepSurfaceSpec(surface);
      const speedFactor = Math.min(1, Math.max(0.25, actor.speed / 230));
      const foot = actor.footstepSide < 0 ? "left" : "right";
      const footFactor = foot === "left" ? 0.97 : 1.03;
      playStudioFootstepSound({
        foot,
        surface,
        volume: Math.min(1, spec.loudness * (0.48 + 0.52 * speedFactor) * footFactor),
      });
    }
  }

  /** 20종 드라마틱 연출 VFX를 2D 파티클 풀에 다층 분사한다 (reduced-motion에서는 동적 입자 0으로 감쇠). */
  emitDramaticVfx(
    particles: Office2dParticles,
    vfxId: StudioDramaticVfxId,
    x: number,
    y: number,
    reducedMotion: boolean,
  ): StudioDramaticVfxRenderPlan {
    const plan = resolveDramaticVfxRenderPlan(vfxId, { reducedMotion });
    if (plan.reducedMotion) return plan;
    const count = Math.max(3, Math.round(plan.effectiveBurstCount * 0.45));
    switch (vfxId) {
      case "deadline-confetti-fireworks":
        particles.emit("confetti", x, y - 16, count, 1.25);
        particles.emit("starburst", x, y - 20, Math.max(4, Math.round(count * 0.5)), 1.15);
        particles.emit("shockwave", x, y - 8, 1, 1.2);
        break;
      case "rhythm-note-wave":
        particles.emit("note", x, y - 22, count, 1.15);
        particles.emit("ring", x, y, 2, 1.1);
        break;
      case "stage-spotlight-ring":
        particles.emit("shockwave", x, y, 2, 1.35);
        particles.emit("confetti", x, y - 20, count, 1.15);
        particles.emit("starburst", x, y - 14, 5, 1.1);
        break;
      case "mint-healing-spark":
        particles.emit("spark", x, y - 14, count, 0.95);
        particles.emit("ring", x, y, 2, 1.05);
        particles.emit("petal", x, y - 18, 4, 0.8);
        break;
      case "team-harmony-wave":
        particles.emit("shockwave", x, y, 2, 1.3);
        particles.emit("note", x, y - 18, Math.max(4, Math.round(count * 0.7)), 1.1);
        particles.emit("starburst", x, y - 12, 4, 1.05);
        break;
      case "rofan-rose-petals":
      case "grass-petal-ripple":
        particles.emit("petal", x, y - 16, count, 1.1);
        particles.emit("starburst", x, y - 12, 3, 0.85);
        break;
      case "coffee-healing-steam":
        particles.emit("steam", x, y - 18, count, 1.0);
        particles.emit("spark", x, y - 22, 3, 0.7);
        break;
      case "focus-flame-aura":
      case "ink-calligraphy-slash":
        particles.emit("ink-splash", x, y - 14, count, 1.1);
        particles.emit("speedline", x, y - 12, 4, 1.1);
        particles.emit("spark", x, y - 10, 4, 1.0);
        break;
      case "dash-speedlines":
        particles.emit("speedline", x, y - 14, count, 1.2);
        particles.emit("ring", x, y, 1, 0.95);
        break;
      case "highfive-shockwave":
        particles.emit("shockwave", x, y - 10, 2, 1.25);
        particles.emit("spark", x, y - 16, count, 1.05);
        break;
      default:
        particles.emit("starburst", x, y - 16, count, 1.05);
        particles.emit("ring", x, y, plan.effectiveRingCount, 1.1);
        break;
    }
    return plan;
  }

  onSeatSettle(muted: boolean): void {
    if (!muted) playStudioSfxSound("seat-settle", 0.9);
  }

  onEmote(
    kind: string,
    muted: boolean,
    visual?: {
      readonly particles: Office2dParticles;
      readonly x: number;
      readonly y: number;
      readonly reducedMotion: boolean;
    },
  ): void {
    if (!muted) playStudioSfxSound(studioEmoteSfxKind(kind), 0.85);
    if (visual) {
      const dramaticVfxId = resolveDramaticVfxForEmoteOrAction(kind);
      this.emitDramaticVfx(visual.particles, dramaticVfxId, visual.x, visual.y, visual.reducedMotion);
    }
  }

  onInteract(muted: boolean): void {
    if (!muted) playStudioSfxSound("activate", 0.9);
  }
}

/**
 * Gather/WorkAdventure 스타일 코너 슬라이딩 충돌 보정:
 * 문틀이나 책상 모서리에 몇 픽셀 어긋나 막혔을 때 열린 통로 방향으로 부드럽게 미끄러져 통과한다.
 */
export function computeOffice2dCornerSlideVelocity(
  physics: Office2dPhysicsWorld,
  x: number,
  y: number,
  radius: number,
  desiredVx: number,
  desiredVy: number,
): { readonly vx: number; readonly vy: number } {
  const speed = Math.hypot(desiredVx, desiredVy);
  if (speed < 40) return { vx: desiredVx, vy: desiredVy };
  const nx = desiredVx / speed;
  const ny = desiredVy / speed;
  const lookAhead = 10;
  // 정면이 이미 열려 있으면 보정하지 않는다.
  if (physics.canOccupyCircle(x + nx * lookAhead, y + ny * lookAhead, radius)) {
    return { vx: desiredVx, vy: desiredVy };
  }
  // 수직(좌·우)으로 10px, 18px 오프셋을 탐색해 한쪽만 열려 있으면 그쪽으로 부드럽게 미끄러진다.
  const perpX = -ny;
  const perpY = nx;
  for (const offset of [10, 18]) {
    const posOpen = physics.canOccupyCircle(x + nx * lookAhead + perpX * offset, y + ny * lookAhead + perpY * offset, radius);
    const negOpen = physics.canOccupyCircle(x + nx * lookAhead - perpX * offset, y + ny * lookAhead - perpY * offset, radius);
    if (posOpen && !negOpen) {
      const nudge = speed * 0.72;
      return { vx: desiredVx * 0.65 + perpX * nudge, vy: desiredVy * 0.65 + perpY * nudge };
    }
    if (negOpen && !posOpen) {
      const nudge = speed * 0.72;
      return { vx: desiredVx * 0.65 - perpX * nudge, vy: desiredVy * 0.65 - perpY * nudge };
    }
  }
  return { vx: desiredVx, vy: desiredVy };
}
