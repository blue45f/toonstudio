/**
 * 이동 게임필 연출 런타임(main Track B 캔버스 연결 이식).
 *
 * 발밑 먼지·발걸음 조각·급정지 퍼프·미끄럼 먼지·달리기 잔상·이모트 파티클을 그린다.
 * - 개수와 시점은 footsteps·movement-particles 순수 모듈의 규칙 함수를 그대로 쓴다.
 * - 발걸음 이벤트는 사운드 엔진 버스에도 그대로 흘려 합성 발소리를 재생한다(엔진 미등록·꺼짐이면 무음).
 * - 파티클 이미터 하나와 잔상 스프라이트 4개 풀을 재사용해 매 프레임 객체를 만들지 않는다.
 * - 모션 줄이기(또는 게임필 설정의 OS 연동)에서는 규칙 함수가 0을 돌려줘 아무것도 내지 않는다.
 * - 색은 바닥 재질의 픽셀 아트 팔레트다(UI 색이 아니므로 CSS 토큰을 쓰지 않는다).
 */
import type * as Phaser from "phaser";

import { CAMPUS_TERRAIN, type StudioCampusTerrain } from "./studio-virtual-space-campus-blueprint";
import {
  createStudioFootstepState,
  stepStudioFootsteps,
  studioDustSpawnCount,
  studioFootstepSurfaceSpec,
  type StudioFootstepState,
  type StudioFootstepSurface,
} from "./studio-virtual-space-footsteps";
import { playStudioFootstepSound, playStudioSfxSound } from "./studio-virtual-space-sound-engine";
import type { StudioFloorMaterialKind } from "./studio-virtual-space-dramatic-vfx-catalog";
import {
  planStudioDustPuffs,
  studioDustSurfacePalette,
  type StudioDustPuffMode,
} from "./studio-virtual-space-jump-motion";
import type { StudioVirtualTerrainKind } from "./studio-virtual-space-living-world";
import { skidIntensity } from "./studio-virtual-space-locomotion-feel";
import {
  STUDIO_AFTERIMAGE_INTERVAL_MS,
  STUDIO_AFTERIMAGE_LIFETIME_MS,
  studioAfterimageFastEnough,
  studioLandingPuffCount,
  studioSkidDustAmount,
} from "./studio-virtual-space-movement-particles";
import { STUDIO_DISPLAY_MAX_DELTA_SECONDS } from "./studio-virtual-space-sprite-smoothing";
import type { StudioWorldTilemap } from "@toonstudio/studio-project-model/world-publication";

/** 규칙 함수가 맞춰진 기준 달리기 속도(main 기본 걷기 205px/s × 달리기 1.35). 아바타별 속도를 이 기준으로 정규화한다. */
export const STUDIO_MOTION_FEEL_REFERENCE_SPRINT = 205 * 1.35;

export interface StudioMotionFeelSurface {
  readonly surface: StudioFootstepSurface;
  /** 바닥 재질 분류(wood·carpet·stone·grass·tile·terrace 등 먼지 색조 자동 매칭용). */
  readonly material: StudioFloorMaterialKind;
  /** 먼지 색(0xRRGGBB). */
  readonly color: number;
}

function surface(kind: StudioFootstepSurface, color: number, material: StudioFloorMaterialKind = kind): StudioMotionFeelSurface {
  return Object.freeze({ surface: kind, material, color });
}

/** 캠퍼스 바닥 재질 → 발소리 표면과 먼지 색. 모래·조약돌은 먼지가 많고 카펫·잔디는 보풀이 적다. */
const CAMPUS_SURFACES: Readonly<Record<StudioCampusTerrain, StudioMotionFeelSurface>> = Object.freeze({
  [CAMPUS_TERRAIN.grass]: surface("carpet", 0x9cc47c, "grass"),
  [CAMPUS_TERRAIN.slate]: surface("tile", 0xc9ced6, "stone"),
  [CAMPUS_TERRAIN.plank]: surface("wood", 0xc9a06a, "wood"),
  [CAMPUS_TERRAIN.water]: surface("tile", 0xbfeeff, "tile"),
  [CAMPUS_TERRAIN.cobble]: surface("tile", 0xdcd4c6, "stone"),
  [CAMPUS_TERRAIN.marble]: surface("tile", 0xece7df, "marble"),
  [CAMPUS_TERRAIN.walnut]: surface("wood", 0xb08458, "wood"),
  [CAMPUS_TERRAIN.sand]: surface("tile", 0xe8cf9a, "terrace"),
  [CAMPUS_TERRAIN.oak]: surface("wood", 0xc9a06a, "wood"),
  [CAMPUS_TERRAIN.lightWood]: surface("wood", 0xd8b98a, "wood"),
  [CAMPUS_TERRAIN.redWood]: surface("wood", 0xb3754f, "wood"),
  [CAMPUS_TERRAIN.stage]: surface("wood", 0xa59ad8, "wood"),
  [CAMPUS_TERRAIN.shellSand]: surface("tile", 0xefdcb2, "terrace"),
  [CAMPUS_TERRAIN.lavender]: surface("carpet", 0xc7b6ee, "carpet"),
  [CAMPUS_TERRAIN.carpet]: surface("carpet", 0xd8a3a0, "carpet"),
  [CAMPUS_TERRAIN.mosaic]: surface("tile", 0xd9d0c0, "tile"),
});

function hexColor(value: string): number {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0xe8e4da;
}

const TERRAIN_SURFACES: Readonly<Record<StudioVirtualTerrainKind, StudioMotionFeelSurface>> = Object.freeze({
  grass: surface("carpet", 0x9cc47c, "grass"),
  path: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor), "wood"),
  stone: surface("tile", hexColor(studioFootstepSurfaceSpec("tile").particleColor), "stone"),
  bridge: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor), "wood"),
  boardwalk: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor), "wood"),
  "shallow-water": surface("tile", 0xbfeeff, "tile"),
});

/** 일반 월드의 지형 종류 → 표면(main 캔버스의 footstepSurfaceForTerrain과 같은 분류). */
export function studioMotionFeelTerrainSurface(kind: StudioVirtualTerrainKind): StudioMotionFeelSurface {
  return TERRAIN_SURFACES[kind];
}

const TILE_FLAGS = 0xe0000000;

/**
 * 캠퍼스 타일맵에서 발밑 재질을 읽는다. 위 레이어(구역 바닥)가 비었으면 아래 레이어(섬 잔디)를 본다.
 * 캠퍼스 아틀라스(firstGid 1)가 아니거나 범위 밖이면 null.
 */
export function studioCampusFloorSurface(tilemap: StudioWorldTilemap, x: number, y: number): StudioMotionFeelSurface | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const column = Math.floor(x / tilemap.tileWidth);
  const row = Math.floor(y / tilemap.tileHeight);
  if (column < 0 || row < 0 || column >= tilemap.width || row >= tilemap.height) return null;
  const index = row * tilemap.width + column;
  for (let layer = tilemap.layers.length - 1; layer >= 0; layer -= 1) {
    const gid = ((tilemap.layers[layer]!.data[index] ?? 0) & ~TILE_FLAGS) >>> 0;
    if (gid <= 0) continue;
    return CAMPUS_SURFACES[(gid - 1) as StudioCampusTerrain] ?? null;
  }
  return null;
}

/** 캔버스가 한 번 만들어 매 프레임 값만 바꿔 넣는 입력. */
export interface StudioMotionFeelFrame {
  time: number;
  deltaSeconds: number;
  /** 발밑(화면 투영) 좌표와 그 깊이. */
  x: number;
  y: number;
  depth: number;
  speed: number;
  /** 이 아바타의 달리기 최고 속도(지형 배율 포함). */
  sprintSpeed: number;
  /** 지금 입력이 요구하는 속도. 입력을 놓아 0이면 급정지 미끄럼으로 본다. */
  inputSpeed: number;
  surface: StudioMotionFeelSurface;
  /**
   * 시각 접지 간격(px, 그 배우의 유효 보폭/2). 0 이하이면 표면 기본 보폭을 쓴다.
   * Phaser 캔버스가 매 프레임 같은 값(걷기 프레임·몸 bob·그림자와 공유하는 보폭)으로 채워
   * 발소리와 발 디딤의 위상을 맞춘다.
   */
  stepPx: number;
  /** 0~1. 게임필 설정 × 품질 단계 배율. */
  particleDensity: number;
  reducedMotion: boolean;
  /** 이동 속도 벡터(px/s). 달리기·스키드 먼지를 이동 반대 방향으로 날리는 데 쓴다. */
  vx?: number;
  vy?: number;
  /** 달리기/대시 상태 여부. */
  sprinting?: boolean;
  /** 점프 체공 중 여부(체공 중에는 발소리·지상 먼지를 억제). */
  airborne?: boolean;
}

export function createStudioMotionFeelFrame(): StudioMotionFeelFrame {
  return {
    time: 0, deltaSeconds: 0, x: 0, y: 0, depth: 0, speed: 0, sprintSpeed: STUDIO_MOTION_FEEL_REFERENCE_SPRINT,
    inputSpeed: 0, surface: TERRAIN_SURFACES.path, stepPx: 0, particleDensity: 1, reducedMotion: false,
    vx: 0, vy: 0, sprinting: false, airborne: false,
  };
}

type MotionFeelScene = Pick<Phaser.Scene, "add" | "make" | "textures">;

const DUST_TEXTURE = "studio-move-dust";
const GHOST_POOL_SIZE = 4;
const GHOST_ALPHA = 0.32;
const GHOST_TINT = 0xbfe3ff;
const LANDING_COLOR = 0xe8e4da;
/** 이동 중 보폭이 64px를 넘게 튀면(순간이동·보정) 발걸음으로 세지 않는다. */
const MAX_STEP_DELTA = 64;
/** 정지 직전 미세 떨림(0.15px 미만)으로 유령 발걸음·먼지가 발생하지 않도록 막는 데드존(px). */
const MIN_STEP_DELTA = 0.15;

interface Ghost {
  readonly sprite: Phaser.GameObjects.Sprite;
  bornAt: number;
  lifetime: number;
}

export class StudioMotionFeelRuntime {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 폭죽 불꽃. 먼지와 달리 매 프레임 깊이를 되돌리지 않아 월드 위에 머문다. */
  private readonly sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ghosts: Ghost[] = [];
  /** 마지막 step()이 계산한 파티클 밀도(0~1). 폭죽 불꽃이 발밑 먼지와 같은 설정·성능 등급·모션 줄이기를 따르게 한다. */
  private density = 1;
  private ghostCursor = 0;
  private nextGhostAt = 0;
  private previousSpeed = 0;
  private wasSprinting = false;
  private puffSequence = 0;
  private skidCarry = 0;
  private footstepState: StudioFootstepState = createStudioFootstepState();
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(scene: MotionFeelScene) {
    if (!scene.textures.exists(DUST_TEXTURE)) {
      const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff, 0.92).fillCircle(8, 8, 5.2);
      graphics.fillStyle(0xffffff, 0.52).fillCircle(5.5, 9, 4.2);
      graphics.fillStyle(0xffffff, 0.45).fillCircle(10.5, 7.5, 3.8);
      graphics.generateTexture(DUST_TEXTURE, 16, 16);
      graphics.destroy();
    }
    this.emitter = scene.add.particles(0, 0, DUST_TEXTURE, {
      speed: { min: 14, max: 52 },
      lifespan: { min: 320, max: 520 },
      scale: { start: 0.44, end: 1.38 },
      alpha: { start: 0.68, end: 0 },
      quantity: 0,
      emitting: false,
    });
    this.sparkEmitter = scene.add.particles(0, 0, DUST_TEXTURE, {
      speed: { min: 50, max: 130 },
      lifespan: { min: 700, max: 1_100 },
      gravityY: 70,
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 1, end: 0 },
      quantity: 0,
      emitting: false,
    });
    for (let index = 0; index < GHOST_POOL_SIZE; index += 1) {
      this.ghosts.push({ sprite: scene.add.sprite(0, 0, DUST_TEXTURE).setVisible(false).setTint(GHOST_TINT), bornAt: 0, lifetime: 1 });
    }
  }

  /** 발밑 효과를 한 프레임 진행한다. source는 잔상으로 복제할 내 캐릭터 스프라이트다. */
  step(frame: StudioMotionFeelFrame, source: Phaser.GameObjects.Sprite | null): void {
    const safeTime = Number.isFinite(frame.time) ? frame.time : 0;
    const safeDt = Number.isFinite(frame.deltaSeconds)
      ? Math.min(STUDIO_DISPLAY_MAX_DELTA_SECONDS, Math.max(0, frame.deltaSeconds))
      : 0;
    const safeX = Number.isFinite(frame.x) ? frame.x : (Number.isFinite(this.lastX) ? this.lastX : 0);
    const safeY = Number.isFinite(frame.y) ? frame.y : (Number.isFinite(this.lastY) ? this.lastY : 0);
    const rawSpeed = Number.isFinite(frame.speed) ? Math.max(0, frame.speed) : 0;
    const rawInputSpeed = Number.isFinite(frame.inputSpeed) ? Math.max(0, frame.inputSpeed) : 0;
    this.fadeGhosts(safeTime);
    const scale = STUDIO_MOTION_FEEL_REFERENCE_SPRINT / Math.max(1, Number.isFinite(frame.sprintSpeed) ? frame.sprintSpeed : 1);
    const speed = rawSpeed * scale;
    const density = frame.reducedMotion ? 0 : Math.min(1, Math.max(0, Number.isFinite(frame.particleDensity) ? frame.particleDensity : 0));
    this.density = density;
    const hadLast = Number.isFinite(this.lastX) && Number.isFinite(this.lastY);
    const moved = hadLast ? Math.hypot(safeX - this.lastX, safeY - this.lastY) : 0;
    this.lastX = safeX;
    this.lastY = safeY;
    this.emitter.setDepth(frame.depth - 2);
    const material = frame.surface.material ?? frame.surface.surface;
    const vx = Number.isFinite(frame.vx) ? (frame.vx ?? 0) : 0;
    const vy = Number.isFinite(frame.vy) ? (frame.vy ?? 0) : 0;
    const airborne = frame.airborne === true;
    const sprinting = !airborne && (frame.sprinting === true || studioAfterimageFastEnough(rawSpeed, frame.sprintSpeed)) && speed >= 80;
    // 달리기 진입 순간: 추진 스우시 효과음 + 초기 먼지 버스트
    if (sprinting && !this.wasSprinting && moved >= MIN_STEP_DELTA) {
      if (!frame.reducedMotion) playStudioSfxSound("sprint-start", 0.78);
      if (density > 0) this.emitPlannedPuffs("run", safeX, safeY + 3, material, vx, vy, density, frame.reducedMotion);
    }
    this.wasSprinting = sprinting;
    // 1) 이동 먼지: 속도·표면·밀도에 비례(규칙: studioDustSpawnRule). dt 스파이크 클램프 적용.
    const dust = !airborne && density > 0 ? studioDustSpawnCount(speed, frame.surface.surface, density, frame.reducedMotion, safeDt) : 0;
    if (dust > 0) this.emit(dust, safeX, safeY + 3, frame.surface.color);
    // 2) 발걸음 먼지 퍼프·발소리: 표면 보폭마다 한 걸음(규칙: stepStudioFootsteps).
    //    파티클 밀도가 0이어도(모션 줄이기가 아닌 한) 발소리는 정상 재생하되 미세 떨림은 무시한다.
    if (!airborne && !frame.reducedMotion && moved >= MIN_STEP_DELTA && moved < MAX_STEP_DELTA && speed >= 8) {
      const strideOverride = Number.isFinite(frame.stepPx) && frame.stepPx > 0 ? frame.stepPx : undefined;
      const stepped = stepStudioFootsteps(this.footstepState, moved, frame.surface.surface, speed, strideOverride, sprinting);
      this.footstepState = stepped.state;
      for (const event of stepped.events) {
        if (density > 0) {
          this.emitPlannedPuffs(sprinting ? "run" : "walk", safeX, safeY + 2, material, vx, vy, density, frame.reducedMotion);
        }
        playStudioFootstepSound(event);
      }
    }
    // 3) 미끄럼 먼지·스키드음: 입력을 놓아 급감속할 때(규칙: stepStudioSkidDust).
    const skid = airborne ? 0 : skidIntensity(rawSpeed, rawInputSpeed, frame.sprintSpeed);
    this.skidCarry += density > 0 ? studioSkidDustAmount(skid, speed, safeDt, frame.reducedMotion) * density : 0;
    if (density <= 0 || skid < 0.15) this.skidCarry = 0;
    const skidCount = Math.floor(this.skidCarry);
    if (skidCount > 0) {
      this.skidCarry -= skidCount;
      this.emitPlannedPuffs("skid", safeX, safeY + 4, material, vx, vy, density, frame.reducedMotion);
      if (!frame.reducedMotion) playStudioSfxSound("skid", 0.72);
    }
    // 4) 급정지 퍼프(규칙: stepStudioLandingPuff).
    const puff = !airborne && density > 0 ? studioLandingPuffCount(this.previousSpeed, speed, frame.reducedMotion) : 0;
    this.previousSpeed = speed;
    if (puff > 0) {
      this.emitPlannedPuffs("skid", safeX, safeY + 4, material, vx, vy, density, frame.reducedMotion);
      this.emit(Math.max(1, Math.round(puff * density * 0.5)), safeX, safeY + 4, LANDING_COLOR);
      if (!frame.reducedMotion) playStudioSfxSound("skid", 0.65);
    }
    // 5) 달리기 잔상: 달리기 최고속 80% 이상에서 90ms마다(규칙: stepStudioRunAfterimage).
    if (frame.reducedMotion || !studioAfterimageFastEnough(rawSpeed, frame.sprintSpeed)) {
      if (this.nextGhostAt > safeTime) this.nextGhostAt = safeTime;
    } else if (safeTime >= this.nextGhostAt && source && source.visible && (!hadLast || moved >= MIN_STEP_DELTA)) {
      this.nextGhostAt = safeTime + STUDIO_AFTERIMAGE_INTERVAL_MS;
      this.spawnGhost(source, safeTime);
    }
  }

  /** 점프 도약·착지 시 바닥 재질에 맞춘 원형 먼지 링 퍼프를 방출한다. */
  emitJumpDust(
    x: number,
    y: number,
    depth: number,
    material: StudioFloorMaterialKind,
    takeoff: boolean,
    reducedMotion: boolean,
  ): void {
    if (reducedMotion || this.density <= 0) return;
    this.emitter.setDepth(depth - 2);
    this.emitPlannedPuffs(takeoff ? "jump-takeoff" : "jump-land", x, y + 2, material, 0, 0, this.density, reducedMotion);
  }

  /** 머리 위 이모트·상호작용 연출용 짧은 파티클 터뜨림. 모션 줄이기에서는 호출하지 않는다. */
  burst(x: number, y: number, depth: number, count: number, color: number): void {
    if (count <= 0) return;
    this.emitter.setDepth(depth);
    this.emit(count, x, y, color);
  }

  /**
   * 폭죽 불꽃을 터뜨린다: 사방으로 퍼졌다 천천히 떨어지며 사라진다.
   * 개수는 발밑 먼지와 같은 파티클 밀도를 곱해 줄이고, 밀도가 0(모션 줄이기·효과 끔)이면 터뜨리지 않는다.
   */
  spark(x: number, y: number, depth: number, count: number, color: number): void {
    const scaled = Math.round(count * this.density);
    if (scaled <= 0) return;
    this.sparkEmitter.setDepth(depth).setParticleTint(color).explode(scaled, x, y);
  }

  destroy(): void {
    this.emitter.destroy();
    this.sparkEmitter.destroy();
    for (const ghost of this.ghosts) ghost.sprite.destroy();
    this.ghosts.length = 0;
  }

  private emitPlannedPuffs(
    mode: StudioDustPuffMode,
    x: number,
    y: number,
    material: StudioFloorMaterialKind,
    vx: number,
    vy: number,
    density: number,
    reducedMotion: boolean,
  ): void {
    this.puffSequence += 1;
    const puffs = planStudioDustPuffs({ mode, material, vx, vy, reducedMotion, density, seed: this.puffSequence });
    if (puffs.length === 0) return;
    const palette = studioDustSurfacePalette(material);
    for (const puff of puffs) {
      this.emit(1, x + puff.offsetX, y + puff.offsetY, puff.colorHex || palette.primaryHex);
    }
  }

  private emit(count: number, x: number, y: number, color: number): void {
    this.emitter.setParticleTint(color);
    this.emitter.explode(count, x, y);
  }

  private spawnGhost(source: Phaser.GameObjects.Sprite, time: number): void {
    const ghost = this.ghosts[this.ghostCursor];
    if (!ghost) return;
    this.ghostCursor = (this.ghostCursor + 1) % this.ghosts.length;
    ghost.bornAt = time;
    ghost.lifetime = STUDIO_AFTERIMAGE_LIFETIME_MS;
    ghost.sprite.setTexture(source.texture.key, source.frame.name)
      .setOrigin(source.originX, source.originY)
      .setDisplaySize(source.displayWidth, source.displayHeight)
      .setFlipX(source.flipX)
      .setPosition(source.x, source.y)
      .setDepth(source.depth - 1)
      .setAlpha(GHOST_ALPHA)
      .setVisible(true);
  }

  private fadeGhosts(time: number): void {
    for (const ghost of this.ghosts) {
      if (!ghost.sprite.visible) continue;
      if (!Number.isFinite(time) || !(ghost.lifetime > 0)) { ghost.sprite.setVisible(false); continue; }
      const progress = (time - ghost.bornAt) / ghost.lifetime;
      if (progress >= 1 || progress < 0) { ghost.sprite.setVisible(false); continue; }
      // Cubic ease-out으로 빠르게 옅어진다.
      ghost.sprite.setAlpha(GHOST_ALPHA * Math.pow(1 - progress, 3));
    }
  }
}
