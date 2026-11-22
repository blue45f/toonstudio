/**
 * ToonOffice 2D 배우(나·동료·NPC) 표현 상태와 생체역학 보행(gait)·관성 애니메이션 계산.
 *
 * - 캐릭터 시트는 9열(0열 정지 + 1~8열 연속 8위상 보행 주기) × 4행(down·left·right·up) 규격을 따른다.
 * - 이동 거리(stride) 적분으로 발 미끄러짐(foot sliding)을 원천 차단하고, 정지할 때는 가장 가까운 착지 위상(반주기)으로
 *   유연하게 수렴시켜 공중에서 발이 멈추거나 갑자기 튀는 현상을 막는다.
 * - 가감속 스쿼시 앤 스트레치(부피 보존 scaleX·scaleY), 주행·선회 기울기(leanAngle), 방향 전환 히스테리시스를 순수 함수로 계산한다.
 */
import { studioSpaceEmoteById } from "../studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceFacing } from "../studio-virtual-space-model";
import type { StudioSpacePose } from "../studio-virtual-space-pose-controller";
import type { Office2dCharacterKey, Office2dGesture } from "./office2d-sprite-catalog";
import { OFFICE2D_CHARACTER_ROWS, OFFICE2D_CHARACTER_WALK_FRAMES, office2dHashIndex } from "./office2d-sprite-catalog";
import type { Office2dSeatVisual } from "./office2d-scene";

/** self 나 · peer 팀원 · npc 대화형 NPC · ambient 상주 동료(빈 작업실을 채우는 착석 NPC, office2d-coworkers). */
export type Office2dActorKind = "self" | "peer" | "npc" | "ambient";

export interface Office2dActorAfterimage {
  readonly x: number;
  readonly y: number;
  readonly facing: StudioVirtualSpaceFacing;
  readonly stride: number;
  readonly alpha: number;
}

export interface Office2dActor {
  readonly id: string;
  readonly kind: Office2dActorKind;
  character: Office2dCharacterKey;
  accent: string;
  name: string;
  /** 이름표 아래 작은 상태 문구(회의 중·작업 중 등). */
  status: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  facing: StudioVirtualSpaceFacing;
  /** 대각선 이동 시 방향 깜빡임을 막는 유지 시간(초). */
  facingHold: number;
  moving: boolean;
  /** 이동 거리 누적(px). 8프레임 보행 위상 기준. */
  stride: number;
  /** 정지(0) ↔ 보행(1) 블렌딩 가중치. */
  gaitBlend: number;
  /** 이동 방향 가속·선회에 따른 상체 기울기(rad). */
  leanAngle: number;
  /** 가감속·충돌 시 부피 보존 탄성 변형(-0.12 ~ +0.12). */
  squash: number;
  /** 방향 전환 시 수평 피벗 쿠션(1 → 0 감쇠). */
  turnTransition: number;
  /** 착석·기립 전환 시 자세 안착 스쿼시(1 → 0 감쇠). */
  poseTransition: number;
  /** 직전 프레임 착석 여부(착석·기립 전이 감지용). */
  previousSeated: boolean;
  /** 이번 프레임에 보행 반주기(착지) 경계를 넘었는지 여부. */
  footstepTriggered: boolean;
  /** 착지한 발 좌우 부호(-1 왼발 · +1 오른발). */
  footstepSide: -1 | 1;
  /** 고속 이동 중 반대 방향으로 급전환해 마찰 먼지가 나는지 여부. */
  skidTriggered: boolean;
  /** 점프 도약 높이(px, 0이면 접지 상태). */
  jumpHeight: number;
  /** 전력 질주 잔상 샘플링 타이머(초). */
  afterimageTimer: number;
  /** 전력 질주 시 남는 반투명 스피드 잔상 버퍼(최대 3개). */
  afterimages: Office2dActorAfterimage[];
  /** 로컬 자세 요청의 표시 상태. 좌석 점유·문서 저장 권위와 구분한다. */
  pose: StudioSpacePose;
  seat: Office2dSeatVisual | null;
  alpha: number;
  bubble: string | null;
  typing: boolean;
  emote: { readonly glyph: string; readonly until: number; readonly kind: string; readonly startedAt?: number } | null;
  /** 이모트에 딸린 몸짓(손 흔들기·만세·엄지·생각). 서서 멈춰 있을 때만 작업 자세 시트 제스처 행으로 보인다. */
  gesture: { readonly kind: Office2dGesture; readonly until: number } | null;
  /** 대화 가능 NPC 강조. */
  highlighted: boolean;
  spawnedAt: number;
  leavingAt: number | null;
}

/** 한 보행 주기(좌·우 2걸음, 8프레임) 동안 이동하는 거리(px). */
export const OFFICE2D_GAIT_DISTANCE = 68;
const HALF_STRIDE = OFFICE2D_GAIT_DISTANCE / 2;
const MOVE_SPEED_ON = 14;
const MOVE_SPEED_OFF = 8;
const MAX_LEAN_RAD = 0.036;
const SPRINT_AFTERIMAGE_SPEED = 245;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createOffice2dActor(input: {
  readonly id: string;
  readonly kind: Office2dActorKind;
  readonly character: Office2dCharacterKey;
  readonly accent: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly now: number;
}): Office2dActor {
  return {
    id: input.id,
    kind: input.kind,
    character: input.character,
    accent: input.accent,
    name: input.name,
    status: null,
    x: input.x,
    y: input.y,
    vx: 0,
    vy: 0,
    speed: 0,
    facing: input.facing ?? "down",
    facingHold: 0,
    moving: false,
    stride: 0,
    gaitBlend: 0,
    leanAngle: 0,
    squash: 0,
    turnTransition: 0,
    poseTransition: 0,
    previousSeated: false,
    footstepTriggered: false,
    footstepSide: 1,
    skidTriggered: false,
    jumpHeight: 0,
    afterimageTimer: 0,
    afterimages: [],
    pose: "stand",
    seat: null,
    alpha: 1,
    bubble: null,
    typing: false,
    emote: null,
    gesture: null,
    highlighted: false,
    spawnedAt: input.now,
    leavingAt: null,
  };
}

export function office2dFacingFromVector(dx: number, dy: number, fallback: StudioVirtualSpaceFacing): StudioVirtualSpaceFacing {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 1e-3 && absY < 1e-3) return fallback;
  // 대각선 이동에서 이전 주 방향 성분이 충분하면 방향을 유지해 프레임 전환 떨림을 막는다(18% 히스테리시스).
  const dominant = Math.max(absX, absY);
  if (Math.abs(absX - absY) < 0.18 * dominant) {
    if ((fallback === "left" && dx < 0) || (fallback === "right" && dx > 0) || (fallback === "up" && dy < 0) || (fallback === "down" && dy > 0)) {
      return fallback;
    }
  }
  return absX >= absY ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
}

/**
 * 위치를 옮기고 보행 위상·방향·기울기·탄성 스쿼시를 갱신한다.
 * 실제 이동량으로 판단하므로 로컬 물리와 원격 보간 모두에 동일하게 작동한다.
 */
export function advanceOffice2dActor(actor: Office2dActor, nextX: number, nextY: number, deltaSeconds: number, motion?: { readonly x: number; readonly y: number }): void {
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const dx = motion?.x ?? nextX - actor.x;
  const dy = motion?.y ?? nextY - actor.y;
  const distance = Math.hypot(dx, dy);
  const instVx = dt > 1e-5 ? dx / dt : 0;
  const instVy = dt > 1e-5 ? dy / dt : 0;
  const prevSpeed = actor.speed;
  const smooth = dt > 0 ? 1 - Math.exp(-dt * 18) : 1;
  actor.vx += (instVx - actor.vx) * smooth;
  actor.vy += (instVy - actor.vy) * smooth;
  const speed = dt > 1e-5 ? distance / dt : 0;
  actor.speed = speed;

  // 시작·정지 임계값 히스테리시스
  const wasMoving = actor.moving;
  actor.moving = wasMoving ? speed > MOVE_SPEED_OFF : speed > MOVE_SPEED_ON;

  // 등신 비율 잠금: 가감속·회전 시 몸 크기를 찌그러뜨리지 않도록 squash는 0으로 유지한다.
  actor.squash = 0;

  actor.facingHold = Math.max(0, actor.facingHold - dt);
  actor.turnTransition = dt > 0 ? actor.turnTransition * Math.exp(-dt * 14) : 0;
  if (actor.turnTransition < 0.01) actor.turnTransition = 0;

  const currentlySeated = actor.seat !== null;
  if (currentlySeated !== actor.previousSeated) {
    actor.previousSeated = currentlySeated;
    actor.poseTransition = 1;
  } else {
    actor.poseTransition = dt > 0 ? actor.poseTransition * Math.exp(-dt * 9.5) : 0;
    if (actor.poseTransition < 0.01) actor.poseTransition = 0;
  }

  actor.footstepTriggered = false;
  actor.skidTriggered = false;
  if (actor.moving) {
    const candidate = office2dFacingFromVector(dx, dy, actor.facing);
    if (candidate !== actor.facing) {
      // 반대 방향 전환은 즉시 반영하고, 인접 축 전환은 최소 0.055초 유지 후 바꾼다.
      const opposite =
        (actor.facing === "left" && candidate === "right") ||
        (actor.facing === "right" && candidate === "left") ||
        (actor.facing === "up" && candidate === "down") ||
        (actor.facing === "down" && candidate === "up");
      if (opposite || actor.facingHold <= 0) {
        actor.facing = candidate;
        actor.facingHold = 0.065;
        actor.turnTransition = 1;
        if (opposite && prevSpeed >= 120 && !actor.seat) {
          actor.skidTriggered = true;
        }
      }
    }
    const prevStride = actor.stride;
    const isSprinting = speed >= SPRINT_AFTERIMAGE_SPEED;
    const strideGain = clamp(speed / 195, 0.55, isSprinting ? 1.52 : 1.25);
    actor.stride += distance * (0.85 + 0.15 * strideGain);
    if (!actor.seat) {
      const prevHalfStep = Math.floor(prevStride / HALF_STRIDE);
      const nextHalfStep = Math.floor(actor.stride / HALF_STRIDE);
      if (nextHalfStep > prevHalfStep) {
        actor.footstepTriggered = true;
        actor.footstepSide = nextHalfStep % 2 === 0 ? 1 : -1;
      }
    }
    const blendTarget = clamp(speed / 160, 0.28, 1);
    actor.gaitBlend += (blendTarget - actor.gaitBlend) * (dt > 0 ? 1 - Math.exp(-dt * 16) : 1);
  } else {
    // 고속 질주 직후 급정지하면 슬라이드 먼지 버스트 신호를 한 번 발화한다.
    if (prevSpeed >= 220 && speed < 60 && !actor.seat) {
      actor.skidTriggered = true;
    }
    // 멈추면 가장 가까운 반주기(양발 교차 착지 지점)로 부드럽게 수렴시켜 발이 공중에 멈추지 않게 한다.
    const nearestLanding = Math.round(actor.stride / HALF_STRIDE) * HALF_STRIDE;
    const settleRate = dt > 0 ? 1 - Math.exp(-dt * 14) : 1;
    actor.stride += (nearestLanding - actor.stride) * settleRate;
    actor.gaitBlend *= dt > 0 ? Math.exp(-dt * 14) : 0;
    if (actor.gaitBlend < 0.04) {
      actor.gaitBlend = 0;
      actor.stride = 0;
    }
  }

  // 전력 질주 잔상(Afterimage) 버퍼 감쇠 및 신규 샘플링
  if (actor.afterimages.length > 0) {
    const nextAfterimages: Office2dActorAfterimage[] = [];
    for (const ghost of actor.afterimages) {
      const nextAlpha = ghost.alpha - dt * 2.8;
      if (nextAlpha > 0.02) {
        nextAfterimages.push({ ...ghost, alpha: nextAlpha });
      }
    }
    actor.afterimages = nextAfterimages;
  }
  if (actor.moving && !actor.seat && speed >= SPRINT_AFTERIMAGE_SPEED) {
    actor.afterimageTimer += dt;
    if (actor.afterimageTimer >= 0.042) {
      actor.afterimageTimer = 0;
      actor.afterimages = [
        {
          x: actor.x,
          y: actor.y,
          facing: actor.facing,
          stride: actor.stride,
          alpha: clamp((speed - 210) / 280, 0.22, 0.42),
        },
        ...actor.afterimages.slice(0, 2),
      ];
    }
  } else {
    actor.afterimageTimer = 0;
  }

  // 속도에 비례하는 자연스러운 진행 기울기(lean)와 탄성 복원
  const targetLean = actor.moving && !actor.seat ? clamp((actor.vx / 240) * MAX_LEAN_RAD, -MAX_LEAN_RAD, MAX_LEAN_RAD) : 0;
  actor.leanAngle += (targetLean - actor.leanAngle) * (dt > 0 ? 1 - Math.exp(-dt * 14) : 1);
  actor.squash *= dt > 0 ? Math.exp(-dt * 12) : 0;

  actor.x = nextX;
  actor.y = nextY;
}

/** 시트의 행·열. 정지·착석 시 0열, 보행 중에는 1~8열(8프레임 연속 보행 주기)을 반환한다. */
export function office2dActorFrame(
  actor: Pick<Office2dActor, "facing" | "moving" | "stride" | "seat"> & { readonly gaitBlend?: number },
): { readonly row: number; readonly col: number } {
  const facing = actor.seat ? actor.seat.facing : actor.facing;
  const row = OFFICE2D_CHARACTER_ROWS[facing];
  const blend = actor.gaitBlend ?? (actor.moving ? 1 : 0);
  if (actor.seat || (!actor.moving && blend < 0.12)) return { row, col: 0 };
  const normalized = ((actor.stride % OFFICE2D_GAIT_DISTANCE) + OFFICE2D_GAIT_DISTANCE) % OFFICE2D_GAIT_DISTANCE;
  const stepIndex = Math.floor((normalized / OFFICE2D_GAIT_DISTANCE) * OFFICE2D_CHARACTER_WALK_FRAMES) % OFFICE2D_CHARACTER_WALK_FRAMES;
  return { row, col: 1 + stepIndex };
}

export interface Office2dActorMotionPose {
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly tiltRad: number;
  readonly shadowScale: number;
}

/**
 * 보행·달리기·점프 포즈 계산(등신 비율 1.0 고정).
 * - 대기·걷기·달리기·점프 전 구간에서 `scaleX = 1, scaleY = 1`로 고정해 캐릭터 키·폭 요동을 차단한다.
 * - 걷기는 발을 바닥에 밀착(`offsetY = 0`)하고, 달리기는 경쾌한 전진 리듬 리프트, 점프는 매끄러운 포물선 아크(`-jumpHeight`)를 적용한다.
 * - reducedMotion이면 정적 기본값을 돌려준다.
 */
export function office2dActorBob(
  actor: Pick<Office2dActor, "moving" | "stride" | "seat">
    & Partial<Pick<Office2dActor, "id" | "gaitBlend" | "leanAngle" | "squash" | "turnTransition" | "poseTransition" | "speed" | "jumpHeight">>,
  _time: number,
  reducedMotion: boolean,
): Office2dActorMotionPose {
  if (reducedMotion) return { offsetY: 0, scaleX: 1, scaleY: 1, tiltRad: 0, shadowScale: 1 };
  const blend = actor.gaitBlend ?? (actor.moving ? 1 : 0);
  const lean = actor.leanAngle ?? 0;
  const jumpHeight = Math.max(0, actor.jumpHeight ?? 0);
  const jumpShadowFactor = clamp(1 - jumpHeight / 76, 0.56, 1);

  if ((actor.moving || blend >= 0.08) && !actor.seat) {
    const phase = (actor.stride / OFFICE2D_GAIT_DISTANCE) * Math.PI * 2;
    const cadence = Math.abs(Math.sin(phase));
    const sprinting = (actor.speed ?? 0) >= SPRINT_AFTERIMAGE_SPEED;
    // 걷기는 발 접지를 바닥에 고정하고, 질주·점프 때만 경쾌한 수직 아크를 만든다.
    const sprintLift = sprinting ? cadence * 2.2 * blend : 0;
    const rawOffsetY = -sprintLift - jumpHeight;
    const offsetY = rawOffsetY === 0 ? 0 : rawOffsetY;
    const shadowScale = (1 - cadence * (sprinting ? 0.1 : 0.06) * blend) * jumpShadowFactor;
    return { offsetY, scaleX: 1, scaleY: 1, tiltRad: lean, shadowScale };
  }
  const idleOffsetY = jumpHeight > 0 ? -jumpHeight : 0;
  return { offsetY: idleOffsetY, scaleX: 1, scaleY: 1, tiltRad: lean, shadowScale: jumpShadowFactor };
}

/**
 * 배우마다 고유 위상으로 4.2초 주기의 자연스러운 눈 깜빡임(0 = 눈 뜸 ~ 1 = 눈 감음)을 계산한다.
 * 뒷모습(up)이나 reducedMotion에서는 0을 돌려준다.
 */
export function office2dActorBlink(
  actor: Pick<Office2dActor, "facing" | "seat"> & Partial<Pick<Office2dActor, "id">>,
  time: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || !Number.isFinite(time)) return 0;
  const facing = actor.seat ? actor.seat.facing : actor.facing;
  if (facing === "up") return 0;
  const seed = actor.id ? office2dHashIndex(actor.id, 1021) : 137;
  const period = 3.8 + (seed % 17) * 0.09;
  const offset = (seed % 97) * 0.043;
  const cyclePos = ((time + offset) % period + period) % period;
  const blinkDuration = 0.14;
  if (cyclePos <= blinkDuration) {
    return Math.sin((cyclePos / blinkDuration) * Math.PI);
  }
  // 가끔 2연속 깜빡임(Double Blink) 연출
  if (seed % 3 === 0 && cyclePos >= 0.24 && cyclePos <= 0.24 + blinkDuration * 0.85) {
    return Math.sin(((cyclePos - 0.24) / (blinkDuration * 0.85)) * Math.PI);
  }
  return 0;
}

/** 입장 페이드인(0.35초)과 퇴장 페이드아웃(0.45초)을 반영한 투명도. */
export function office2dActorOpacity(actor: Pick<Office2dActor, "spawnedAt" | "leavingAt" | "alpha">, now: number): number {
  const fadeIn = Math.min(1, Math.max(0, (now - actor.spawnedAt) / 350));
  const fadeOut = actor.leavingAt === null ? 1 : Math.max(0, 1 - (now - actor.leavingAt) / 450);
  return actor.alpha * fadeIn * fadeOut;
}

const EMOTE_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  wave: "👋", heart: "❤️", party: "🎉", "thumbs-up": "👍", laugh: "😂", clap: "👏", wow: "😮", think: "🤔",
  idea: "💡", dance: "💃", sparkles: "✨", question: "❓", exclaim: "❗", coffee: "☕", music: "🎵", sleep: "💤",
  fire: "🔥", check: "✅", eyes: "👀", pray: "🙏", "raise-hand": "✋", cheer: "🙌", cry: "😢", angry: "😤",
});

export function office2dEmoteGlyph(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return studioSpaceEmoteById(kind)?.glyph ?? EMOTE_GLYPHS[kind] ?? "✨";
}
