/**
 * 가상 스튜디오 달리기·점프 모션 물리 & 바닥 재질별 먼지 퍼프(Dust Puff) 계획기.
 *
 * - 대기·걷기·달리기·점프 전 구간에서 캐릭터 등신 비율(scaleX=1, scaleY=1)을 유지하면서
 *   걷기 vs 달리기(더 빠른 발걸음 케이던스·경쾌한 리프트·미세 전진 기울기)와
 *   포물선 점프 아크(도약→최고점→착지 쿠션 정착)를 명확히 구분한다.
 * - 바닥 재질(`wood`, `carpet`, `stone`, `grass`, `tile`, `terrace` 등)별 색조와
 *   이동 반대 방향 벡터·공기 저항 감속·크기 확장을 반영한 먼지 뭉게구름 파티클 계획을 생성한다.
 * - `reducedMotion=true`에서는 모든 먼지 입자 계획을 빈 배열로 억제한다.
 */
import type { StudioFloorMaterialKind } from "./studio-virtual-space-dramatic-vfx-catalog";

export interface StudioJumpMotionState {
  /** 현재 지면으로부터의 높이(px, 0이면 착지 상태). */
  readonly heightPx: number;
  /** 수직 속도(px/s, 양수=상승). */
  readonly verticalVelocity: number;
  /** 착지 직후 부드러운 정착 오프셋 타이머(초, 0이면 완료). */
  readonly landingSettleRemaining: number;
}

export interface StudioJumpStepResult {
  readonly state: StudioJumpMotionState;
  /** 현재 공중 체공 여부. */
  readonly airborne: boolean;
  /** 이번 프레임에 지면에 착지했는지 여부. */
  readonly landed: boolean;
  /** 발바닥 기준 수직 변위(px, 공중=-heightPx, 착지 직후 미세 정착=+0~1.2px). */
  readonly offsetY: number;
  /** 높이에 반비례하는 접지 그림자 배율(0.54~1). */
  readonly shadowScale: number;
}

const JUMP_LAUNCH_VELOCITY = 265;
const JUMP_GRAVITY = 1_040;
const JUMP_LANDING_SETTLE_SECONDS = 0.14;
const MAX_JUMP_DT_SECONDS = 0.05;

export function createStudioJumpMotionState(): StudioJumpMotionState {
  return Object.freeze({ heightPx: 0, verticalVelocity: 0, landingSettleRemaining: 0 });
}

/** 공중이 아니고 착석·차단 상태가 아니면 포물선 점프를 시작한다. */
export function triggerStudioJump(
  state: StudioJumpMotionState,
  input: { readonly seated: boolean; readonly blocked: boolean },
): { readonly state: StudioJumpMotionState; readonly triggered: boolean } {
  if (input.seated || input.blocked || state.heightPx > 0.5 || state.verticalVelocity > 0) {
    return { state, triggered: false };
  }
  return {
    state: Object.freeze({
      heightPx: 0.6,
      verticalVelocity: JUMP_LAUNCH_VELOCITY,
      landingSettleRemaining: 0,
    }),
    triggered: true,
  };
}

/** 매 프레임 중력을 적분해 포물선 점프 궤적과 착지 정착(크기 요동 0)을 계산한다. */
export function stepStudioJump(
  state: StudioJumpMotionState,
  deltaSeconds: number,
  seated: boolean,
): StudioJumpStepResult {
  if (seated) {
    const reset = createStudioJumpMotionState();
    return { state: reset, airborne: false, landed: false, offsetY: 0, shadowScale: 1 };
  }
  const dt = Number.isFinite(deltaSeconds) ? Math.min(MAX_JUMP_DT_SECONDS, Math.max(0, deltaSeconds)) : 0;

  if (state.heightPx > 0 || state.verticalVelocity > 0) {
    const nextVz = state.verticalVelocity - JUMP_GRAVITY * dt;
    const nextHeight = state.heightPx + nextVz * dt;
    if (nextHeight <= 0) {
      const landedState = Object.freeze({
        heightPx: 0,
        verticalVelocity: 0,
        landingSettleRemaining: JUMP_LANDING_SETTLE_SECONDS,
      });
      return {
        state: landedState,
        airborne: false,
        landed: true,
        offsetY: 1.2,
        shadowScale: 1,
      };
    }
    const airState = Object.freeze({
      heightPx: nextHeight,
      verticalVelocity: nextVz,
      landingSettleRemaining: 0,
    });
    const shadowScale = Math.max(0.54, Math.min(1, 1 - nextHeight / 84));
    return {
      state: airState,
      airborne: true,
      landed: false,
      offsetY: -nextHeight,
      shadowScale,
    };
  }

  if (state.landingSettleRemaining > 0) {
    const remaining = Math.max(0, state.landingSettleRemaining - dt);
    const ratio = remaining / JUMP_LANDING_SETTLE_SECONDS;
    const settleOffsetY = Number((Math.sin(ratio * Math.PI) * 1.2).toFixed(3));
    return {
      state: Object.freeze({ heightPx: 0, verticalVelocity: 0, landingSettleRemaining: remaining }),
      airborne: false,
      landed: false,
      offsetY: settleOffsetY,
      shadowScale: 1,
    };
  }

  return { state, airborne: false, landed: false, offsetY: 0, shadowScale: 1 };
}

/**
 * 걷기 vs 달리기 보행 리듬 계산(등신 비율 1.0 고정).
 * - 걷기: 차분한 접지 리프트(최대 -2px), 기울기 0°
 * - 달리기: 경쾌하고 빠른 전진 리듬(최대 -4.2px), 수평 속도 방향 미세 전진 기울기(최대 ±2.2°)
 */
export function studioRunGaitOffset(
  distance: number,
  stride: number,
  input: {
    readonly moving: boolean;
    readonly sprinting: boolean;
    readonly airborne: boolean;
    readonly velocityX: number;
    readonly reducedMotion: boolean;
  },
): { readonly offsetY: number; readonly leanDegrees: number; readonly cadenceMultiplier: number } {
  if (!input.moving || input.airborne || input.reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) {
    return { offsetY: 0, leanDegrees: 0, cadenceMultiplier: 1 };
  }
  const cadenceMultiplier = input.sprinting ? 1.38 : 1;
  const phase = (distance / stride) * Math.PI * 4 * (input.sprinting ? 1.15 : 1);
  const lift = input.sprinting ? 2.1 : 1.0;
  const offsetY = (Math.cos(phase) - 1) * lift;
  const vx = Number.isFinite(input.velocityX) ? input.velocityX : 0;
  const leanDegrees = input.sprinting ? Math.max(-2.2, Math.min(2.2, (vx / 240) * 2.2)) : 0;
  return { offsetY, leanDegrees, cadenceMultiplier };
}

export type StudioDustPuffMode = "walk" | "run" | "skid" | "jump-takeoff" | "jump-land";

export interface StudioDustSurfaceTone {
  readonly primaryHex: number;
  readonly secondaryHex: number;
  readonly primaryRgba: string;
  readonly secondaryRgba: string;
}

const DUST_SURFACE_PALETTES: Readonly<Record<StudioFloorMaterialKind, StudioDustSurfaceTone>> = Object.freeze({
  wood: { primaryHex: 0xdcc098, secondaryHex: 0xf1e1c8, primaryRgba: "rgba(220, 192, 152, 0.78)", secondaryRgba: "rgba(241, 225, 200, 0.60)" },
  carpet: { primaryHex: 0xe2dcd2, secondaryHex: 0xf2eee8, primaryRgba: "rgba(226, 220, 210, 0.66)", secondaryRgba: "rgba(242, 238, 232, 0.50)" },
  stone: { primaryHex: 0xd0d9e4, secondaryHex: 0xe8eef5, primaryRgba: "rgba(208, 217, 228, 0.78)", secondaryRgba: "rgba(232, 238, 245, 0.60)" },
  marble: { primaryHex: 0xd9e3f0, secondaryHex: 0xf1f5fa, primaryRgba: "rgba(217, 227, 240, 0.76)", secondaryRgba: "rgba(241, 245, 250, 0.58)" },
  grass: { primaryHex: 0xa2c882, secondaryHex: 0xd0e4b4, primaryRgba: "rgba(162, 200, 130, 0.78)", secondaryRgba: "rgba(208, 228, 180, 0.60)" },
  tile: { primaryHex: 0xe6e2d8, secondaryHex: 0xf6f4ee, primaryRgba: "rgba(230, 226, 216, 0.76)", secondaryRgba: "rgba(246, 244, 238, 0.58)" },
  "neon-tile": { primaryHex: 0xcbd5f5, secondaryHex: 0xe0f2fe, primaryRgba: "rgba(203, 213, 245, 0.78)", secondaryRgba: "rgba(224, 242, 254, 0.60)" },
  terrace: { primaryHex: 0xd8c6a6, secondaryHex: 0xefe3cb, primaryRgba: "rgba(216, 198, 166, 0.82)", secondaryRgba: "rgba(239, 227, 203, 0.64)" },
});

/** 바닥 재질에 맞는 먼지 뭉게구름 색조를 돌려준다. */
export function studioDustSurfacePalette(material: StudioFloorMaterialKind): StudioDustSurfaceTone {
  return DUST_SURFACE_PALETTES[material] ?? DUST_SURFACE_PALETTES.wood;
}

export interface StudioDustPuffSpec {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly vx: number;
  readonly vy: number;
  readonly startSize: number;
  readonly endSize: number;
  readonly dragPerSecond: number;
  readonly lifetimeMs: number;
  readonly alpha: number;
  readonly colorHex: number;
  readonly colorRgba: string;
}

/**
 * 물리 기반 먼지 뭉게구름(Dust Puff) 파티클 배치 계획.
 * - walk: 발뒤꿈치 소형 먼지 1~2알
 * - run: 이동 속도 반대 방향으로 퍼지며 확장·감속·페이드아웃하는 다층 먼지 구름(4~5알)
 * - skid: 급회전·급정지 슬라이드 먼지 버스트(5~6알)
 * - jump-takeoff / jump-land: 발밑 원형 먼지 링 퍼프(4~8알)
 * - reducedMotion=true: 0알 반환
 */
export function planStudioDustPuffs(input: {
  readonly mode: StudioDustPuffMode;
  readonly material: StudioFloorMaterialKind;
  readonly vx?: number;
  readonly vy?: number;
  readonly reducedMotion: boolean;
  readonly density?: number;
  readonly seed?: number;
}): readonly StudioDustPuffSpec[] {
  if (input.reducedMotion) return Object.freeze([]);
  const density = input.density === undefined ? 1 : Math.max(0, Math.min(1, Number.isFinite(input.density) ? input.density : 0));
  if (density <= 0) return Object.freeze([]);

  const tone = studioDustSurfacePalette(input.material);
  const vx = Number.isFinite(input.vx) ? (input.vx ?? 0) : 0;
  const vy = Number.isFinite(input.vy) ? (input.vy ?? 0) : 0;
  const speed = Math.hypot(vx, vy);
  const backX = speed > 1 ? -vx / speed : 0;
  const backY = speed > 1 ? -vy / speed : 0;
  const baseSeed = Number.isFinite(input.seed) ? (input.seed ?? 0) : 0;

  const baseCount = input.mode === "walk"
    ? (input.material === "carpet" ? 1 : 2)
    : input.mode === "run"
      ? 4
      : input.mode === "skid"
        ? 5
        : input.mode === "jump-takeoff"
          ? 4
          : 7;
  const count = Math.max(1, Math.round(baseCount * density));
  const radial = input.mode === "jump-takeoff" || input.mode === "jump-land";

  const puffs: StudioDustPuffSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const hash = Math.abs(Math.sin((index + 1) * 12.9898 + baseSeed * 78.233)) % 1;
    const secondary = index % 2 === 1;
    const colorHex = secondary ? tone.secondaryHex : tone.primaryHex;
    const colorRgba = secondary ? tone.secondaryRgba : tone.primaryRgba;

    if (radial) {
      const angle = (index / count) * Math.PI * 2 + (hash - 0.5) * 0.35;
      const radialSpeed = (input.mode === "jump-land" ? 30 : 20) + hash * 16;
      const startSize = (input.mode === "jump-land" ? 3.2 : 2.5) + hash * 1.4;
      puffs.push(Object.freeze({
        offsetX: Math.cos(angle) * (input.mode === "jump-land" ? 7 : 5),
        offsetY: Math.sin(angle) * 2.5,
        vx: Math.cos(angle) * radialSpeed,
        vy: Math.sin(angle) * radialSpeed * 0.36 - (input.mode === "jump-land" ? 12 : 8),
        startSize,
        endSize: startSize * 2.1,
        dragPerSecond: 4.4,
        lifetimeMs: Math.round((input.mode === "jump-land" ? 540 : 400) + hash * 160),
        alpha: input.mode === "jump-land" ? 0.78 : 0.66,
        colorHex,
        colorRgba,
      }));
      continue;
    }

    const coneSpread = input.mode === "skid" ? 1.15 : input.mode === "run" ? 0.72 : 0.55;
    const fan = count > 1 ? ((index / (count - 1)) - 0.5) * 2 : 0;
    const jitterAngle = fan * coneSpread + (hash - 0.5) * 0.32;
    const cos = Math.cos(jitterAngle);
    const sin = Math.sin(jitterAngle);
    const dirX = speed > 1 ? backX * cos - backY * sin : Math.cos(index * 2.1 + baseSeed);
    const dirY = speed > 1 ? backX * sin + backY * cos : Math.sin(index * 2.1 + baseSeed) * 0.35;
    const pushSpeed = (input.mode === "skid" ? 38 : input.mode === "run" ? 32 : 16) * (0.65 + hash * 0.6);
    const startSize = (input.mode === "skid" ? 3.4 : input.mode === "run" ? 3.0 : 1.9) + hash * 1.1;
    puffs.push(Object.freeze({
      offsetX: dirX * (input.mode === "run" ? 5 : 3) + (hash - 0.5) * 6,
      offsetY: -1 + (hash - 0.5) * 3,
      vx: dirX * pushSpeed,
      vy: dirY * pushSpeed * 0.45 - (input.mode === "walk" ? 8 : 13 + hash * 8),
      startSize,
      endSize: startSize * (input.mode === "walk" ? 1.65 : 2.15),
      dragPerSecond: input.mode === "skid" ? 4.8 : 4.2,
      lifetimeMs: Math.round((input.mode === "skid" ? 520 : input.mode === "run" ? 460 : 340) + hash * 140),
      alpha: input.mode === "walk" ? 0.56 : 0.76,
      colorHex,
      colorRgba,
    }));
  }
  return Object.freeze(puffs);
}
