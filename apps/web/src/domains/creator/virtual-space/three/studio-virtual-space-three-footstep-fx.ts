/**
 * 3D 가상 스튜디오 발소리 효과음(Web Audio) · 바닥 재질별 3D 파문/먼지/스파크 풀 ·
 * 3D 점프 물리 및 20종 드라마틱 연출 VFX(체조·댄스·마감 축하·장르 이펙트) 통합 엔진.
 *
 * - 바닥 구역(카펫·원목·대리석 홀·잔디/테라스·네온 3D 스테이지)별 색상과 파문 링을 적용한다.
 * - 저부하 3D 오브젝트 풀(먼지 18 · 파문 링 8 · 다이아몬드 스파크 16)을 재사용해 GC 부하를 없앤다.
 * - `prefers-reduced-motion`에서는 동적 3D 입자/파문을 생략하고 정적 배지·글로우 플랜만 반환한다.
 */
import * as THREE from "three";

import {
  resolveDramaticVfxForEmoteOrAction,
  resolveDramaticVfxRenderPlan,
  resolveFloorMaterialFootstepVfx,
  type StudioDramaticVfxId,
  type StudioDramaticVfxRenderPlan,
  type StudioFloorMaterialKind,
} from "../studio-virtual-space-dramatic-vfx-catalog";
import {
  createStudioFootstepState,
  stepStudioFootsteps,
  type StudioExtendedFootstepSurface,
  type StudioFootstepState,
} from "../studio-virtual-space-footsteps";
import { playStudioFootstepSound, playStudioSfxSound, unlockStudioSoundEngine } from "../studio-virtual-space-sound-engine";
import { studioEmoteSfxKind } from "../studio-virtual-space-sound-synth";
import { STUDIO_THREE_SCALE } from "./studio-virtual-space-three-scene";

interface DustPuff {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface RippleRing {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  maxOpacity: number;
  spinSpeed: number;
}

interface SparkShard {
  readonly mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  spinSpeed: number;
  baseScale: number;
}

const DUST_POOL_SIZE = 18;
const RING_POOL_SIZE = 8;
const SPARK_POOL_SIZE = 16;

const SURFACE_DUST_HEX: Readonly<Record<StudioExtendedFootstepSurface, number>> = Object.freeze({
  wood: 0xdec8a6,
  carpet: 0xe6dfd3,
  tile: 0xe8e4da,
  stone: 0xd4dce6,
  terrace: 0xd9c9ad,
});

/** 방 ID로 3D 바닥 발소리 재질을 추정한다. */
export function resolveStudioThreeFootstepSurface(roomId: string | null | undefined): StudioExtendedFootstepSurface {
  if (!roomId) return "wood";
  if (/terrace|garden|courtyard|rooftop|balcony|plaza|park|outdoor/iu.test(roomId)) return "terrace";
  if (/lounge|cafe|break|sofa|library|focus|booth|meeting/iu.test(roomId)) return "carpet";
  if (/lobby|hall|corridor|gallery|stage|archive/iu.test(roomId)) return "stone";
  return "wood";
}

/** 방 ID를 나무·대리석·잔디·네온타일 포함 8종 드라마틱 3D 바닥 VFX 재질로 변환한다. */
export function resolveStudioThreeFootstepMaterialKind(roomId: string | null | undefined): StudioFloorMaterialKind {
  if (!roomId) return "wood";
  if (/garden|park|meadow|grass/iu.test(roomId)) return "grass";
  if (/stage|bg3d|color|neon|cyber|sound/iu.test(roomId)) return "neon-tile";
  if (/lobby|hall|gallery|plaza/iu.test(roomId)) return "marble";
  if (/terrace|courtyard|rooftop|balcony|outdoor/iu.test(roomId)) return "terrace";
  if (/lounge|cafe|break|sofa|library|focus|booth|meeting/iu.test(roomId)) return "carpet";
  return "wood";
}

const THREE_JUMP_VELOCITY = 4.6;
const THREE_JUMP_GRAVITY = 15.5;

export class StudioThreeFootstepFx {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.SphereGeometry(0.11, 7, 6);
  private readonly ringGeometry = new THREE.RingGeometry(0.18, 0.28, 24);
  private readonly sparkGeometry = new THREE.OctahedronGeometry(0.085, 0);
  private readonly puffs: DustPuff[] = [];
  private readonly rings: RippleRing[] = [];
  private readonly sparks: SparkShard[] = [];
  private footstepState: StudioFootstepState = createStudioFootstepState();
  private lastPoint: { x: number; y: number } | null = null;
  private lastSeated = false;
  private lastEmoteId: string | null = null;
  private jumpY = 0;
  private jumpVy = 0;
  private cursor = 0;
  private ringCursor = 0;
  private sparkCursor = 0;

  constructor(parent: THREE.Scene) {
    this.group.name = "studio-three-footstep-dust";
    for (let index = 0; index < DUST_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: SURFACE_DUST_HEX.wood,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({ mesh, active: false, life: 0, maxLife: 0.5, vx: 0, vy: 0, vz: 0, baseScale: 0.65 });
    }
    for (let index = 0; index < RING_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 0.6,
        startScale: 0.6,
        endScale: 2.2,
        maxOpacity: 0.6,
        spinSpeed: 1.5,
      });
    }
    for (let index = 0; index < SPARK_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.sparks.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 0.7,
        vx: 0,
        vy: 0,
        vz: 0,
        spinSpeed: 4,
        baseScale: 0.85,
      });
    }
    parent.add(this.group);
  }

  get jumpHeight(): number {
    return this.jumpY;
  }

  /** 현재 활성화된 3D VFX 오브젝트 수(먼지+파문링+스파크, 테스트·디버그 검증용). */
  get activeEffectCount(): number {
    let count = 0;
    for (const p of this.puffs) if (p.active) count += 1;
    for (const r of this.rings) if (r.active) count += 1;
    for (const s of this.sparks) if (s.active) count += 1;
    return count;
  }

  unlockAudio(): void {
    unlockStudioSoundEngine();
  }

  triggerJump(
    worldPoint: { readonly x: number; readonly y: number },
    roomId: string | null | undefined,
    seated: boolean,
    reducedMotion: boolean,
  ): boolean {
    if (seated || this.jumpY > 0.03) return false;
    this.jumpVy = THREE_JUMP_VELOCITY;
    this.jumpY = 0.04;
    const surface = resolveStudioThreeFootstepSurface(roomId);
    const materialKind = resolveStudioThreeFootstepMaterialKind(roomId);
    if (!reducedMotion) {
      const x = worldPoint.x * STUDIO_THREE_SCALE;
      const z = worldPoint.y * STUDIO_THREE_SCALE;
      const recipe = resolveFloorMaterialFootstepVfx(materialKind);
      this.spawnBurst(x, z, surface, 4, 0.9);
      this.spawnRing(x, z, recipe.threeTintHex, 0.55, 1.75 * recipe.ringRadiusScale, 0.45, 0.52);
    }
    playStudioSfxSound("jump", 0.9);
    return true;
  }

  /** 20종 드라마틱 연출 VFX를 3D 링 + 다이아몬드 스파크 풀로 분사한다. */
  triggerDramaticVfx(
    worldPoint: { readonly x: number; readonly y: number },
    vfxId: StudioDramaticVfxId,
    reducedMotion: boolean,
  ): StudioDramaticVfxRenderPlan {
    const plan = resolveDramaticVfxRenderPlan(vfxId, { reducedMotion });
    if (plan.reducedMotion) return plan;
    const x = worldPoint.x * STUDIO_THREE_SCALE;
    const z = worldPoint.y * STUDIO_THREE_SCALE;
    const spec = plan.spec;
    const ringsToSpawn = Math.min(3, Math.max(1, plan.effectiveRingCount));
    for (let i = 0; i < ringsToSpawn; i += 1) {
      this.spawnRing(
        x,
        z,
        i % 2 === 0 ? spec.threeColorHex : spec.threeSecondaryHex,
        0.55 + i * 0.22,
        2.35 + i * 0.8,
        0.65 + i * 0.2,
        0.7 - i * 0.14,
      );
    }
    const sparkCount = Math.min(10, Math.max(4, Math.round(plan.effectiveBurstCount * 0.45)));
    this.spawnSparks(x, z, spec.threeColorHex, spec.threeSecondaryHex, sparkCount, 1.15);
    return plan;
  }

  update(input: {
    readonly point: { readonly x: number; readonly y: number };
    readonly roomId: string | null | undefined;
    readonly moving: boolean;
    readonly sprinting: boolean;
    readonly seated: boolean;
    readonly emoteId: string | null | undefined;
    readonly dt: number;
    readonly reducedMotion: boolean;
  }): number {
    const { point, roomId, moving, sprinting, seated, emoteId, dt, reducedMotion } = input;
    const surface = resolveStudioThreeFootstepSurface(roomId);
    const materialKind = resolveStudioThreeFootstepMaterialKind(roomId);
    const floorRecipe = resolveFloorMaterialFootstepVfx(materialKind);

    // 1) 착석·이모트 SFX + 3D 드라마틱 VFX 동기화
    if (seated && !this.lastSeated) {
      playStudioSfxSound("seat-settle", 0.9);
    }
    this.lastSeated = seated;
    const currentEmote = emoteId ?? null;
    if (currentEmote && currentEmote !== this.lastEmoteId) {
      playStudioSfxSound(studioEmoteSfxKind(currentEmote), 0.85);
      if (!reducedMotion) {
        this.triggerDramaticVfx(point, resolveDramaticVfxForEmoteOrAction(currentEmote), false);
      }
    }
    this.lastEmoteId = currentEmote;

    // 2) 점프 물리 적분 + 착지 먼지 링/파문
    if (seated) {
      this.jumpY = 0;
      this.jumpVy = 0;
    } else if (this.jumpY > 0 || this.jumpVy > 0) {
      this.jumpVy -= THREE_JUMP_GRAVITY * dt;
      this.jumpY += this.jumpVy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVy = 0;
        if (!reducedMotion) {
          const x = point.x * STUDIO_THREE_SCALE;
          const z = point.y * STUDIO_THREE_SCALE;
          this.spawnBurst(x, z, surface, 6, 1.25);
          this.spawnRing(x, z, floorRecipe.threeTintHex, 0.7, 2.4 * floorRecipe.ringRadiusScale, 0.52, 0.68);
          if (floorRecipe.sparkCount > 0) {
            this.spawnSparks(x, z, floorRecipe.threeTintHex, 0xffffff, Math.min(5, floorRecipe.sparkCount + 1), 0.85);
          }
        }
        playStudioSfxSound("land", 0.95);
      }
    }

    // 3) 이동 발소리 + 바닥 재질별 먼지·파문·질주 스파크
    if (this.lastPoint && moving && !seated && this.jumpY <= 0.03) {
      const distPx = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y);
      const speedPx = dt > 1e-4 ? distPx / dt : 0;
      const stepped = stepStudioFootsteps(this.footstepState, distPx, surface, speedPx);
      this.footstepState = stepped.state;
      for (const event of stepped.events) {
        playStudioFootstepSound(event);
        if (!reducedMotion) {
          const offsetSide = event.foot === "left" ? -0.14 : 0.14;
          const fx = point.x * STUDIO_THREE_SCALE + offsetSide;
          const fz = point.y * STUDIO_THREE_SCALE;
          this.spawnBurst(fx, fz, surface, sprinting ? 3 : 2, sprinting ? 1.15 : 0.78);
          if (sprinting || floorRecipe.rippleKind === "starlight-wave" || floorRecipe.rippleKind === "neon-pulse") {
            this.spawnRing(fx, fz, floorRecipe.threeTintHex, 0.42, (sprinting ? 1.85 : 1.35) * floorRecipe.ringRadiusScale, 0.38, 0.5);
          }
          if (sprinting && floorRecipe.sparkCount > 0) {
            this.spawnSparks(fx, fz, floorRecipe.threeTintHex, 0xfde047, 2, 0.7);
          }
        }
      }
    }
    this.lastPoint = { x: point.x, y: point.y };

    // 4) 3D 먼지·파문 링·스파크 풀 업데이트
    this.stepPools(dt, reducedMotion);

    return this.jumpY;
  }

  private stepPools(dt: number, reducedMotion: boolean): void {
    for (const puff of this.puffs) {
      if (!puff.active) continue;
      puff.life += dt;
      if (puff.life >= puff.maxLife || reducedMotion) {
        puff.active = false;
        puff.mesh.visible = false;
        continue;
      }
      const t = puff.life / puff.maxLife;
      const easeOut = 1 - (1 - t) * (1 - t);
      puff.mesh.position.x += puff.vx * dt;
      puff.mesh.position.y += puff.vy * dt;
      puff.mesh.position.z += puff.vz * dt;
      puff.vx *= Math.exp(-3.5 * dt);
      puff.vz *= Math.exp(-3.5 * dt);
      const scale = puff.baseScale * (0.65 + easeOut * 1.45);
      puff.mesh.scale.set(scale, scale * 0.72, scale);
      puff.mesh.material.opacity = (1 - t) * (1 - t) * 0.58;
    }

    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.life += dt;
      if (ring.life >= ring.maxLife || reducedMotion) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      const t = ring.life / ring.maxLife;
      const easeOut = 1 - (1 - t) * (1 - t);
      const scale = ring.startScale + (ring.endScale - ring.startScale) * easeOut;
      ring.mesh.scale.set(scale, scale, 1);
      ring.mesh.rotation.z += ring.spinSpeed * dt;
      ring.mesh.material.opacity = (1 - t) * (1 - t) * ring.maxOpacity;
    }

    for (const spark of this.sparks) {
      if (!spark.active) continue;
      spark.life += dt;
      if (spark.life >= spark.maxLife || reducedMotion) {
        spark.active = false;
        spark.mesh.visible = false;
        continue;
      }
      const t = spark.life / spark.maxLife;
      spark.mesh.position.x += spark.vx * dt;
      spark.mesh.position.y += spark.vy * dt;
      spark.mesh.position.z += spark.vz * dt;
      spark.vy -= 1.8 * dt;
      spark.mesh.rotation.y += spark.spinSpeed * dt;
      spark.mesh.rotation.x += spark.spinSpeed * 0.6 * dt;
      const scale = spark.baseScale * (1 - t * 0.55);
      spark.mesh.scale.setScalar(Math.max(0.15, scale));
      spark.mesh.material.opacity = (1 - t) * 0.92;
    }
  }

  private spawnBurst(x: number, z: number, surface: StudioExtendedFootstepSurface, count: number, strength: number): void {
    const colorHex = SURFACE_DUST_HEX[surface] ?? SURFACE_DUST_HEX.wood;
    for (let index = 0; index < count; index += 1) {
      const puff = this.puffs[this.cursor % this.puffs.length];
      this.cursor += 1;
      if (!puff) continue;
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + (this.cursor % 7) * 0.45;
      const spread = (0.55 + ((this.cursor * 37) % 10) * 0.07) * strength;
      puff.active = true;
      puff.life = 0;
      puff.maxLife = 0.42 + ((this.cursor * 19) % 10) * 0.025;
      puff.baseScale = 0.55 + strength * 0.35;
      puff.vx = Math.cos(angle) * spread;
      puff.vy = 0.42 + strength * 0.28;
      puff.vz = Math.sin(angle) * spread;
      puff.mesh.position.set(x + Math.cos(angle) * 0.12, 0.08, z + Math.sin(angle) * 0.12);
      puff.mesh.scale.setScalar(puff.baseScale * 0.65);
      puff.mesh.material.color.setHex(colorHex);
      puff.mesh.material.opacity = 0.56;
      puff.mesh.visible = true;
    }
  }

  private spawnRing(
    x: number,
    z: number,
    colorHex: number,
    startScale: number,
    endScale: number,
    maxLife: number,
    maxOpacity: number,
  ): void {
    const ring = this.rings[this.ringCursor % this.rings.length];
    this.ringCursor += 1;
    if (!ring) return;
    ring.active = true;
    ring.life = 0;
    ring.maxLife = maxLife;
    ring.startScale = startScale;
    ring.endScale = endScale;
    ring.maxOpacity = maxOpacity;
    ring.spinSpeed = (this.ringCursor % 2 === 0 ? 1 : -1) * 1.8;
    ring.mesh.position.set(x, 0.04, z);
    ring.mesh.scale.set(startScale, startScale, 1);
    ring.mesh.material.color.setHex(colorHex);
    ring.mesh.material.opacity = maxOpacity;
    ring.mesh.visible = true;
  }

  private spawnSparks(
    x: number,
    z: number,
    primaryHex: number,
    secondaryHex: number,
    count: number,
    strength: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const spark = this.sparks[this.sparkCursor % this.sparks.length];
      this.sparkCursor += 1;
      if (!spark) continue;
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + (this.sparkCursor % 5) * 0.3;
      const spread = (0.7 + ((this.sparkCursor * 29) % 10) * 0.09) * strength;
      spark.active = true;
      spark.life = 0;
      spark.maxLife = 0.55 + ((this.sparkCursor * 17) % 10) * 0.04;
      spark.baseScale = 0.72 + strength * 0.28;
      spark.vx = Math.cos(angle) * spread;
      spark.vy = 1.25 + ((this.sparkCursor * 13) % 8) * 0.16;
      spark.vz = Math.sin(angle) * spread;
      spark.spinSpeed = 4.5 + (index % 3) * 1.8;
      spark.mesh.position.set(x + Math.cos(angle) * 0.16, 0.35, z + Math.sin(angle) * 0.16);
      spark.mesh.scale.setScalar(spark.baseScale);
      spark.mesh.material.color.setHex(index % 2 === 0 ? primaryHex : secondaryHex);
      spark.mesh.material.opacity = 0.92;
      spark.mesh.visible = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.ringGeometry.dispose();
    this.sparkGeometry.dispose();
    for (const puff of this.puffs) puff.mesh.material.dispose();
    for (const ring of this.rings) ring.mesh.material.dispose();
    for (const spark of this.sparks) spark.mesh.material.dispose();
  }
}
