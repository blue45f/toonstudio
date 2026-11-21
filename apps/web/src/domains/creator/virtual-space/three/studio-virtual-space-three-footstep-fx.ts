/**
 * 3D 가상 스튜디오 발소리 효과음(Web Audio) · 3D 발밑 먼지 파티클 풀 · 3D 점프 물리.
 *
 * - 바닥 구역(카펫 라운지·원목 데스크·석재 홀·야외 테라스)을 판별해 표면별 Web Audio 발소리를 재생한다.
 * - 저부하 3D 먼지 퍼프 풀(18개 구형 퍼프)을 재사용해 GC 부하 없이 걷기·달리기·점프 착지 먼지를 그린다.
 * - `prefers-reduced-motion`에서는 3D 먼지 퍼프를 생략한다.
 */
import * as THREE from "three";

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

const DUST_POOL_SIZE = 18;
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

const THREE_JUMP_VELOCITY = 4.6;
const THREE_JUMP_GRAVITY = 15.5;

export class StudioThreeFootstepFx {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.SphereGeometry(0.11, 7, 6);
  private readonly puffs: DustPuff[] = [];
  private footstepState: StudioFootstepState = createStudioFootstepState();
  private lastPoint: { x: number; y: number } | null = null;
  private lastSeated = false;
  private lastEmoteId: string | null = null;
  private jumpY = 0;
  private jumpVy = 0;
  private cursor = 0;

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
    parent.add(this.group);
  }

  get jumpHeight(): number {
    return this.jumpY;
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
    if (!reducedMotion) {
      this.spawnBurst(worldPoint.x * STUDIO_THREE_SCALE, worldPoint.y * STUDIO_THREE_SCALE, surface, 4, 0.9);
    }
    playStudioSfxSound("jump", 0.9);
    return true;
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

    // 1) 착석·이모트 SFX 동기화
    if (seated && !this.lastSeated) {
      playStudioSfxSound("seat-settle", 0.9);
    }
    this.lastSeated = seated;
    const currentEmote = emoteId ?? null;
    if (currentEmote && currentEmote !== this.lastEmoteId) {
      playStudioSfxSound(studioEmoteSfxKind(currentEmote), 0.85);
    }
    this.lastEmoteId = currentEmote;

    // 2) 점프 물리 적분
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
          this.spawnBurst(point.x * STUDIO_THREE_SCALE, point.y * STUDIO_THREE_SCALE, surface, 6, 1.25);
        }
        playStudioSfxSound("land", 0.95);
      }
    }

    // 3) 이동 발소리 + 먼지 퍼프
    if (this.lastPoint && moving && !seated && this.jumpY <= 0.03) {
      const distPx = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y);
      const speedPx = dt > 1e-4 ? distPx / dt : 0;
      const stepped = stepStudioFootsteps(this.footstepState, distPx, surface, speedPx);
      this.footstepState = stepped.state;
      for (const event of stepped.events) {
        playStudioFootstepSound(event);
        if (!reducedMotion) {
          const offsetSide = event.foot === "left" ? -0.14 : 0.14;
          this.spawnBurst(
            point.x * STUDIO_THREE_SCALE + offsetSide,
            point.y * STUDIO_THREE_SCALE,
            surface,
            sprinting ? 3 : 2,
            sprinting ? 1.15 : 0.78,
          );
        }
      }
    }
    this.lastPoint = { x: point.x, y: point.y };

    // 4) 3D 먼지 파티클 풀 업데이트
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

    return this.jumpY;
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

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    for (const puff of this.puffs) puff.mesh.material.dispose();
  }
}
