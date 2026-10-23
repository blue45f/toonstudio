/**
 * 가상 스튜디오 테마·바닥 재질별 실제 물리 응답 및 소프트바디 탄성 반발 엔진.
 *
 * - 테마(모던 오피스, 웹툰 원고 아틀리에, 셀레스티얼 천문 공방, 시네마 컬러 스위트 등)와
 *   바닥 재질(carpet, wood, tile/marble/slate)의 물리적 마찰·관성·탄성·보폭·발소리 공명을 계산한다.
 * - 답답한 감속 없이 재질의 촉각적 차이(대리석의 매끄러운 활주, 원목의 탄력 있는 반발,
 *   카펫의 포근한 제동)를 실시간 이동 물리에 반영한다.
 * - 소품·데코·동료 근처를 스칠 때 딱딱하게 막히지 않고 부드럽게 미끄러져 비켜가는
 *   소프트바디 탄성 반발(Soft-body Repulsion) 임펄스를 제공한다.
 */
import type { StudioFootstepSurface } from "./studio-virtual-space-footsteps";
import type { StudioVirtualSpaceMotionConfig } from "./studio-virtual-space-motion";
import { isStudioSpaceThemeKey, type StudioSpaceThemeKey } from "./studio-virtual-space-theme";

export interface StudioThemeSurfacePhysics {
  readonly themeKey: StudioSpaceThemeKey;
  readonly surface: StudioFootstepSurface;
  /** 가속 배율 (0.92 ~ 1.08). */
  readonly accelerationScale: number;
  /** 감속(브레이킹 마찰) 배율 (0.9 ~ 1.12). */
  readonly brakingScale: number;
  /** 최고 속도 배율 (0.96 ~ 1.04). */
  readonly maxSpeedScale: number;
  /** 탄성 반발 계수 (0.25 ~ 0.52). */
  readonly restitution: number;
  /** 걸음 보폭 배율 (0.95 ~ 1.05). */
  readonly strideScale: number;
  /** 발걸음 음향 존재감 배율 (0.95 ~ 1.2). */
  readonly footstepVolumeScale: number;
}

interface ThemePhysicsModifier {
  readonly accel: number;
  readonly brake: number;
  readonly speed: number;
  readonly restitution: number;
  readonly footstepGain: number;
}

const THEME_MODIFIERS: Readonly<Record<StudioSpaceThemeKey, ThemePhysicsModifier>> = Object.freeze({
  "modern-office": { accel: 1.0, brake: 1.0, speed: 1.0, restitution: 0.36, footstepGain: 1.05 },
  "webtoon-atelier": { accel: 1.03, brake: 1.04, speed: 1.01, restitution: 0.38, footstepGain: 1.08 },
  "celestial-observatory": { accel: 0.98, brake: 0.93, speed: 1.02, restitution: 0.46, footstepGain: 1.12 },
  "cinema-screening": { accel: 1.0, brake: 1.06, speed: 0.99, restitution: 0.32, footstepGain: 1.04 },
  "cozy-wood": { accel: 1.01, brake: 1.03, speed: 1.0, restitution: 0.35, footstepGain: 1.1 },
  "neon-night": { accel: 1.05, brake: 0.95, speed: 1.03, restitution: 0.44, footstepGain: 1.14 },
  "garden-terrace": { accel: 0.99, brake: 1.05, speed: 1.0, restitution: 0.34, footstepGain: 1.06 },
  library: { accel: 0.97, brake: 1.08, speed: 0.98, restitution: 0.3, footstepGain: 1.02 },
  "sakura-campus": { accel: 1.02, brake: 1.01, speed: 1.02, restitution: 0.4, footstepGain: 1.08 },
  "sunset-harbor": { accel: 1.01, brake: 0.98, speed: 1.01, restitution: 0.39, footstepGain: 1.1 },
});

const SURFACE_MODIFIERS: Readonly<
  Record<StudioFootstepSurface, { readonly accel: number; readonly brake: number; readonly speed: number; readonly stride: number }>
> = Object.freeze({
  tile: { accel: 1.03, brake: 0.94, speed: 1.02, stride: 1.02 },
  wood: { accel: 1.0, brake: 1.0, speed: 1.0, stride: 1.0 },
  carpet: { accel: 0.96, brake: 1.08, speed: 0.98, stride: 0.97 },
});

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function resolveStudioThemeSurfacePhysics(
  themeKey: string | null | undefined,
  surface: StudioFootstepSurface = "wood",
): StudioThemeSurfacePhysics {
  const resolvedTheme: StudioSpaceThemeKey = isStudioSpaceThemeKey(themeKey) ? themeKey : "modern-office";
  const themeMod = THEME_MODIFIERS[resolvedTheme];
  const surfMod = SURFACE_MODIFIERS[surface] ?? SURFACE_MODIFIERS.wood;

  return Object.freeze({
    themeKey: resolvedTheme,
    surface,
    accelerationScale: round3(themeMod.accel * surfMod.accel),
    brakingScale: round3(themeMod.brake * surfMod.brake),
    maxSpeedScale: round3(themeMod.speed * surfMod.speed),
    restitution: round3(themeMod.restitution),
    strideScale: round3(surfMod.stride),
    footstepVolumeScale: round3(themeMod.footstepGain),
  });
}

/** 기본 StudioVirtualSpaceMotionConfig에 테마·표면 물리를 합성한다. */
export function applyStudioThemePhysicsToConfig(
  base: StudioVirtualSpaceMotionConfig,
  themeKey: string | null | undefined,
  surface: StudioFootstepSurface = "wood",
): StudioVirtualSpaceMotionConfig {
  const physics = resolveStudioThemeSurfacePhysics(themeKey, surface);
  return {
    ...base,
    maxSpeed: Math.round(base.maxSpeed * physics.maxSpeedScale),
    acceleration: Math.round(base.acceleration * physics.accelerationScale),
    deceleration: Math.round(base.deceleration * physics.brakingScale),
  };
}

export interface StudioSoftBodyObstacle {
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
}

/**
 * 캐릭터가 주변 가구·소품·동료의 물리 반경 안쪽으로 스칠 때,
 * 각진 벽에 끼이지 않고 자연스럽게 미끄러지듯 밀려나는 탄성 반발 속도를 계산한다.
 */
export function computeStudioSoftBodyRepulsion(
  selfPoint: { readonly x: number; readonly y: number },
  obstacles: readonly StudioSoftBodyObstacle[],
  options?: {
    readonly selfRadius?: number;
    readonly stiffness?: number;
    readonly maxImpulse?: number;
  },
): { readonly vx: number; readonly vy: number } {
  const selfRadius = options?.selfRadius ?? 18;
  const stiffness = options?.stiffness ?? 140;
  const maxImpulse = options?.maxImpulse ?? 42;

  let totalVx = 0;
  let totalVy = 0;

  for (const obs of obstacles) {
    if (!Number.isFinite(obs.x) || !Number.isFinite(obs.y)) continue;
    const obsRadius = obs.radius ?? 20;
    const combinedRadius = selfRadius + obsRadius;
    const dx = selfPoint.x - obs.x;
    const dy = selfPoint.y - obs.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 0.0001 || distSq >= combinedRadius * combinedRadius) continue;

    const dist = Math.sqrt(distSq);
    const overlapRatio = (combinedRadius - dist) / combinedRadius;
    const force = overlapRatio * overlapRatio * stiffness;
    totalVx += (dx / dist) * force;
    totalVy += (dy / dist) * force;
  }

  const mag = Math.hypot(totalVx, totalVy);
  if (mag > maxImpulse && mag > 0) {
    const scale = maxImpulse / mag;
    totalVx *= scale;
    totalVy *= scale;
  }

  return Object.freeze({
    vx: round3(totalVx),
    vy: round3(totalVy),
  });
}
