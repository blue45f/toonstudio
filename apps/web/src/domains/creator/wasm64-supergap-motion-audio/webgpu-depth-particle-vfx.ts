/**
 * #23 3D 뎁스 충돌 WebGPU 절차적 파티클 VFX 노드 엔진 (₩0 로컬 · 0 AI 토큰).
 *
 * 비(rain)·벚꽃잎(cherry-petals)·불티(embers)·충격파 파편(shockwave-debris)·마법진(magic-circle)
 * 프리셋 파티클이 정규화 2D/3D 뎁스맵 표면과 법선 충돌해 바운스·스플래시·안착 상태로 전이한다.
 */

export type VfxParticlePreset =
  | "rain"
  | "cherry-petals"
  | "embers"
  | "shockwave-debris"
  | "magic-circle";

export const PARTICLE_STATE_AIRBORNE = 0;
export const PARTICLE_STATE_BOUNCED = 1;
export const PARTICLE_STATE_SPLASHED = 2;
export const PARTICLE_STATE_SETTLED = 3;

export type ParticleCollisionState = 0 | 1 | 2 | 3;

export const WGSL_DEPTH_PARTICLE_SIM = /* wgsl */ `
struct SimUniforms {
  dt: f32,
  timeSec: f32,
  gravity: f32,
  windX: f32,
  windY: f32,
  restitution: f32,
  drag: f32,
  collisionThickness: f32,
  depthWidth: u32,
  depthHeight: u32,
  particleCount: u32,
  presetMode: u32,
};

struct Particle {
  posX: f32,
  posY: f32,
  posZ: f32,
  life: f32,
  velX: f32,
  velY: f32,
  velZ: f32,
  size: f32,
  maxLife: f32,
  rotation: f32,
  state: f32,
  bounceCount: f32,
};

@group(0) @binding(0) var<uniform> params: SimUniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> depthMap: array<f32>;

fn sampleDepth(u: f32, v: f32) -> f32 {
  let w = max(params.depthWidth, 1u);
  let h = max(params.depthHeight, 1u);
  let ix = u32(clamp(u, 0.0, 0.9999) * f32(w));
  let iy = u32(clamp(v, 0.0, 0.9999) * f32(h));
  return depthMap[iy * w + ix];
}

fn estimateDepthNormal(u: f32, v: f32) -> vec3<f32> {
  let du = 1.0 / max(f32(params.depthWidth), 1.0);
  let dv = 1.0 / max(f32(params.depthHeight), 1.0);
  let gx = (sampleDepth(u + du, v) - sampleDepth(u - du, v)) * 0.5;
  let gy = (sampleDepth(u, v + dv) - sampleDepth(u, v - dv)) * 0.5;
  return normalize(vec3<f32>(-gx * 2.4, -gy * 2.4, -1.0));
}

@compute @workgroup_size(64)
fn simulateDepthParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.particleCount) {
    return;
  }
  var p = particles[idx];
  let dt = params.dt;
  p.life = p.life - dt;

  // 프리셋별 절차적 외력: 0=rain, 1=cherry-petals, 2=embers, 3=shockwave-debris, 4=magic-circle
  var ax = params.windX;
  var ay = params.gravity + params.windY;
  var az = 0.0;

  if (params.presetMode == 1u) {
    ax = ax + sin(params.timeSec * 2.8 + f32(idx) * 0.37) * 0.22;
    p.rotation = p.rotation + dt * 2.1;
  } else if (params.presetMode == 2u) {
    ax = ax + cos(params.timeSec * 3.5 + f32(idx) * 0.51) * 0.18;
    ay = -abs(params.gravity) * 0.55;
  } else if (params.presetMode == 4u) {
    let dx = p.posX - 0.5;
    let dy = p.posY - 0.5;
    let dist = max(sqrt(dx * dx + dy * dy), 0.02);
    ax = -dy / dist * 0.85 - dx * 0.45;
    ay = dx / dist * 0.85 - dy * 0.45;
  }

  let damp = max(0.0, 1.0 - params.drag * dt);
  p.velX = (p.velX + ax * dt) * damp;
  p.velY = (p.velY + ay * dt) * damp;
  p.velZ = (p.velZ + az * dt) * damp;

  p.posX = p.posX + p.velX * dt;
  p.posY = p.posY + p.velY * dt;
  p.posZ = p.posZ + p.velZ * dt;

  let surfaceDepth = sampleDepth(p.posX, p.posY);
  if (p.posZ >= surfaceDepth - params.collisionThickness && p.posZ <= surfaceDepth + params.collisionThickness * 2.5) {
    let n = estimateDepthNormal(p.posX, p.posY);
    let vel = vec3<f32>(p.velX, p.velY, p.velZ);
    let vn = dot(vel, n);
    if (vn < 0.0) {
      let refl = vel - (1.0 + params.restitution) * vn * n;
      p.velX = refl.x * 0.82;
      p.velY = refl.y * 0.82;
      p.velZ = refl.z;
      p.posZ = surfaceDepth - params.collisionThickness;
      p.bounceCount = p.bounceCount + 1.0;
      if (params.presetMode == 0u) {
        p.state = 2.0;
      } else if (params.presetMode == 1u) {
        p.state = 3.0;
        p.velX = p.velX * 0.25;
        p.velY = p.velY * 0.25;
      } else {
        p.state = 1.0;
      }
    }
  }

  particles[idx] = p;
}
`;

export interface DepthParticleWgslValidation {
  readonly valid: boolean;
  readonly workgroupSize: number;
  readonly hasDepthSampling: boolean;
  readonly hasCollisionResponse: boolean;
  readonly issues: readonly string[];
}

export function validateDepthParticleWgsl(
  source: string = WGSL_DEPTH_PARTICLE_SIM,
): DepthParticleWgslValidation {
  const issues: string[] = [];
  const wgMatch = /@workgroup_size\((\d+)\)/.exec(source);
  const workgroupSize = wgMatch ? Number(wgMatch[1]) : 0;
  if (!source.includes("@compute")) issues.push("missing @compute entry attribute");
  if (workgroupSize <= 0) issues.push("missing @workgroup_size declaration");
  if (!source.includes("struct Particle")) issues.push("missing Particle struct");
  if (!source.includes("struct SimUniforms")) issues.push("missing SimUniforms struct");
  const hasDepthSampling = source.includes("depthMap[") && source.includes("estimateDepthNormal");
  const hasCollisionResponse = source.includes("collisionThickness") && source.includes("restitution");
  if (!hasDepthSampling) issues.push("missing depthMap sampling / normal estimation");
  if (!hasCollisionResponse) issues.push("missing depth collision response");

  return {
    valid: issues.length === 0,
    workgroupSize,
    hasDepthSampling,
    hasCollisionResponse,
    issues,
  };
}

export interface NormalizedDepthMap {
  readonly width: number;
  readonly height: number;
  /** [0..1] 정규화 뎁스 (0 = 카메라에 가까운 전경 표면, 1 = 원경 배경) */
  readonly data: Float32Array;
}

export interface VfxEmitterConfig {
  readonly preset: VfxParticlePreset;
  readonly maxParticles?: number;
  readonly seed?: number;
  readonly windX?: number;
  readonly windY?: number;
  readonly gravity?: number;
  readonly restitution?: number;
  readonly collisionThickness?: number;
  readonly epicenterX?: number;
  readonly epicenterY?: number;
}

export interface VfxParticleSnapshot {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly life: number;
  readonly size: number;
  readonly rotation: number;
  readonly state: ParticleCollisionState;
  readonly bounceCount: number;
}

export interface VfxStepMetrics {
  readonly preset: VfxParticlePreset;
  readonly particleCount: number;
  readonly airborneCount: number;
  readonly bouncedCount: number;
  readonly splashedCount: number;
  readonly settledCount: number;
  readonly collisionsThisStep: number;
  readonly totalCollisions: number;
  readonly elapsedMs: number;
}

interface PresetPhysicsProfile {
  readonly modeIndex: number;
  readonly gravity: number;
  readonly drag: number;
  readonly restitution: number;
  readonly collisionThickness: number;
}

const VFX_PRESET_PROFILES: Readonly<Record<VfxParticlePreset, PresetPhysicsProfile>> = {
  rain: { modeIndex: 0, gravity: 1.45, drag: 0.08, restitution: 0.22, collisionThickness: 0.035 },
  "cherry-petals": { modeIndex: 1, gravity: 0.24, drag: 0.95, restitution: 0.14, collisionThickness: 0.04 },
  embers: { modeIndex: 2, gravity: -0.35, drag: 0.45, restitution: 0.55, collisionThickness: 0.035 },
  "shockwave-debris": { modeIndex: 3, gravity: 0.95, drag: 0.22, restitution: 0.64, collisionThickness: 0.045 },
  "magic-circle": { modeIndex: 4, gravity: 0.0, drag: 0.15, restitution: 0.42, collisionThickness: 0.04 },
};

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * #23 3D 뎁스맵과 실시간 충돌·바운스·스플래시·안착 상태를 시뮬레이션하는 절차적 VFX 파티클 엔진.
 */
export class ProceduralVfxParticleSimulator {
  public readonly preset: VfxParticlePreset;
  public readonly particleCount: number;
  private readonly profile: PresetPhysicsProfile;
  private readonly gravity: number;
  private readonly windX: number;
  private readonly windY: number;
  private readonly restitution: number;
  private readonly collisionThickness: number;
  private readonly epicenterX: number;
  private readonly epicenterY: number;
  private readonly nextRand: () => number;

  private readonly posX: Float32Array;
  private readonly posY: Float32Array;
  private readonly posZ: Float32Array;
  private readonly velX: Float32Array;
  private readonly velY: Float32Array;
  private readonly velZ: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly rotation: Float32Array;
  private readonly state: Uint8Array;
  private readonly bounceCount: Uint16Array;

  private timeSec = 0;
  private totalCollisions = 0;

  constructor(config: VfxEmitterConfig) {
    this.preset = config.preset;
    this.profile = VFX_PRESET_PROFILES[config.preset];
    this.particleCount = clamp(Math.floor(config.maxParticles ?? 256), 1, 16384);
    this.gravity = config.gravity ?? this.profile.gravity;
    this.windX = config.windX ?? 0;
    this.windY = config.windY ?? 0;
    this.restitution = clamp(config.restitution ?? this.profile.restitution, 0, 1);
    this.collisionThickness = clamp(config.collisionThickness ?? this.profile.collisionThickness, 0.005, 0.25);
    this.epicenterX = clamp(config.epicenterX ?? 0.5, 0, 1);
    this.epicenterY = clamp(config.epicenterY ?? 0.5, 0, 1);
    this.nextRand = createMulberry32(config.seed ?? 0x20261126);

    const n = this.particleCount;
    this.posX = new Float32Array(n);
    this.posY = new Float32Array(n);
    this.posZ = new Float32Array(n);
    this.velX = new Float32Array(n);
    this.velY = new Float32Array(n);
    this.velZ = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.rotation = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.bounceCount = new Uint16Array(n);

    for (let i = 0; i < n; i += 1) {
      this.spawnParticle(i);
    }
  }

  public step(dtSec: number, depthMap?: NormalizedDepthMap): VfxStepMetrics {
    const startMs = performance.now();
    const dt = clamp(dtSec, 0.001, 0.05);
    this.timeSec += dt;

    let airborneCount = 0;
    let bouncedCount = 0;
    let splashedCount = 0;
    let settledCount = 0;
    let collisionsThisStep = 0;
    const damp = Math.max(0, 1 - this.profile.drag * dt);

    for (let i = 0; i < this.particleCount; i += 1) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) this.spawnParticle(i);

      let ax = this.windX;
      let ay = this.gravity + this.windY;
      let az = 0;

      if (this.preset === "cherry-petals") {
        ax += Math.sin(this.timeSec * 2.8 + i * 0.37) * 0.26;
        az += Math.cos(this.timeSec * 1.9 + i * 0.23) * 0.08;
        this.rotation[i] += dt * (1.8 + (i % 5) * 0.25);
      } else if (this.preset === "embers") {
        ax += Math.cos(this.timeSec * 3.5 + i * 0.51) * 0.22;
        az += Math.sin(this.timeSec * 2.1 + i * 0.41) * 0.1;
      } else if (this.preset === "magic-circle") {
        const dx = this.posX[i] - this.epicenterX;
        const dy = this.posY[i] - this.epicenterY;
        const dist = Math.max(0.025, Math.hypot(dx, dy));
        ax += (-dy / dist) * 0.9 - dx * 0.55;
        ay += (dx / dist) * 0.9 - dy * 0.55;
        this.rotation[i] += dt * 3.0;
      } else if (this.preset === "shockwave-debris") {
        this.rotation[i] += dt * 5.2;
      }

      if (this.state[i] === PARTICLE_STATE_SETTLED) {
        this.velX[i] *= 0.85;
        this.velY[i] *= 0.85;
        this.velZ[i] = 0;
      } else {
        this.velX[i] = (this.velX[i] + ax * dt) * damp;
        this.velY[i] = (this.velY[i] + ay * dt) * damp;
        this.velZ[i] = (this.velZ[i] + az * dt) * damp;
      }

      const prevZ = this.posZ[i];
      this.posX[i] += this.velX[i] * dt;
      this.posY[i] += this.velY[i] * dt;
      this.posZ[i] += this.velZ[i] * dt;

      if (depthMap && depthMap.width > 0 && depthMap.height > 0 && this.state[i] !== PARTICLE_STATE_SETTLED) {
        const u = clamp(this.posX[i], 0, 0.9999);
        const v = clamp(this.posY[i], 0, 0.9999);
        const surfaceDepth = this.sampleDepth(depthMap, u, v);
        const crossedSurface =
          (prevZ < surfaceDepth && this.posZ[i] >= surfaceDepth - this.collisionThickness) ||
          (this.posZ[i] >= surfaceDepth - this.collisionThickness &&
            this.posZ[i] <= surfaceDepth + this.collisionThickness * 2.5 &&
            this.velZ[i] > 0);

        if (crossedSurface) {
          const [nx, ny, nz] = this.estimateDepthNormal(depthMap, u, v);
          const vn = this.velX[i] * nx + this.velY[i] * ny + this.velZ[i] * nz;
          if (vn < 0) {
            const impulse = -(1 + this.restitution) * vn;
            this.velX[i] = (this.velX[i] + impulse * nx) * 0.82;
            this.velY[i] = (this.velY[i] + impulse * ny) * 0.82;
            this.velZ[i] = this.velZ[i] + impulse * nz;
            this.posZ[i] = Math.max(0, surfaceDepth - this.collisionThickness);
            this.bounceCount[i] += 1;
            collisionsThisStep += 1;
            this.totalCollisions += 1;

            if (this.preset === "rain") {
              this.state[i] = PARTICLE_STATE_SPLASHED;
              this.velX[i] += (this.nextRand() - 0.5) * 0.45;
              this.velY[i] = -Math.abs(this.velY[i]) * 0.35 - 0.08;
              this.life[i] = Math.min(this.life[i], 0.18);
            } else if (this.preset === "cherry-petals") {
              this.state[i] = PARTICLE_STATE_SETTLED;
              this.velX[i] *= 0.2;
              this.velY[i] *= 0.2;
              this.velZ[i] = 0;
            } else {
              this.state[i] = PARTICLE_STATE_BOUNCED;
            }
          }
        }
      }

      const st = this.state[i];
      if (st === PARTICLE_STATE_AIRBORNE) airborneCount += 1;
      else if (st === PARTICLE_STATE_BOUNCED) bouncedCount += 1;
      else if (st === PARTICLE_STATE_SPLASHED) splashedCount += 1;
      else settledCount += 1;
    }

    return {
      preset: this.preset,
      particleCount: this.particleCount,
      airborneCount,
      bouncedCount,
      splashedCount,
      settledCount,
      collisionsThisStep,
      totalCollisions: this.totalCollisions,
      elapsedMs: Number((performance.now() - startMs).toFixed(3)),
    };
  }

  public buildWebGpuUniformBuffer(dtSec: number, depthMap?: NormalizedDepthMap): ArrayBuffer {
    const buffer = new ArrayBuffer(48);
    const view = new DataView(buffer);
    view.setFloat32(0, clamp(dtSec, 0.001, 0.05), true);
    view.setFloat32(4, this.timeSec, true);
    view.setFloat32(8, this.gravity, true);
    view.setFloat32(12, this.windX, true);
    view.setFloat32(16, this.windY, true);
    view.setFloat32(20, this.restitution, true);
    view.setFloat32(24, this.profile.drag, true);
    view.setFloat32(28, this.collisionThickness, true);
    view.setUint32(32, depthMap?.width ?? 1, true);
    view.setUint32(36, depthMap?.height ?? 1, true);
    view.setUint32(40, this.particleCount, true);
    view.setUint32(44, this.profile.modeIndex, true);
    return buffer;
  }

  public exportGpuParticleBuffer(): Float32Array {
    const packed = new Float32Array(this.particleCount * 12);
    for (let i = 0; i < this.particleCount; i += 1) {
      const o = i * 12;
      packed[o] = this.posX[i];
      packed[o + 1] = this.posY[i];
      packed[o + 2] = this.posZ[i];
      packed[o + 3] = this.life[i];
      packed[o + 4] = this.velX[i];
      packed[o + 5] = this.velY[i];
      packed[o + 6] = this.velZ[i];
      packed[o + 7] = this.size[i];
      packed[o + 8] = this.maxLife[i];
      packed[o + 9] = this.rotation[i];
      packed[o + 10] = this.state[i];
      packed[o + 11] = this.bounceCount[i];
    }
    return packed;
  }

  public getSnapshots(limit = 64): readonly VfxParticleSnapshot[] {
    const count = Math.min(this.particleCount, Math.max(0, limit));
    const list: VfxParticleSnapshot[] = [];
    for (let i = 0; i < count; i += 1) {
      list.push({
        index: i,
        x: this.posX[i],
        y: this.posY[i],
        z: this.posZ[i],
        vx: this.velX[i],
        vy: this.velY[i],
        vz: this.velZ[i],
        life: this.life[i],
        size: this.size[i],
        rotation: this.rotation[i],
        state: this.state[i] as ParticleCollisionState,
        bounceCount: this.bounceCount[i],
      });
    }
    return list;
  }

  private spawnParticle(i: number): void {
    const r = this.nextRand;
    this.state[i] = PARTICLE_STATE_AIRBORNE;
    this.bounceCount[i] = 0;
    this.rotation[i] = r() * Math.PI * 2;

    if (this.preset === "rain") {
      this.posX[i] = r();
      this.posY[i] = r() * 0.25;
      this.posZ[i] = 0.08 + r() * 0.35;
      this.velX[i] = this.windX * 0.25 + (r() - 0.5) * 0.05;
      this.velY[i] = 0.85 + r() * 0.6;
      this.velZ[i] = 0.22 + r() * 0.32;
      this.size[i] = 1.2 + r() * 1.1;
      this.maxLife[i] = 0.9 + r() * 0.9;
    } else if (this.preset === "cherry-petals") {
      this.posX[i] = r();
      this.posY[i] = r() * 0.3;
      this.posZ[i] = 0.06 + r() * 0.32;
      this.velX[i] = (r() - 0.5) * 0.16;
      this.velY[i] = 0.12 + r() * 0.16;
      this.velZ[i] = 0.14 + r() * 0.2;
      this.size[i] = 4.5 + r() * 4.5;
      this.maxLife[i] = 2.6 + r() * 2.2;
    } else if (this.preset === "embers") {
      this.posX[i] = 0.15 + r() * 0.7;
      this.posY[i] = 0.72 + r() * 0.28;
      this.posZ[i] = 0.1 + r() * 0.28;
      this.velX[i] = (r() - 0.5) * 0.18;
      this.velY[i] = -(0.24 + r() * 0.35);
      this.velZ[i] = 0.18 + r() * 0.24;
      this.size[i] = 2.0 + r() * 2.8;
      this.maxLife[i] = 1.4 + r() * 1.6;
    } else if (this.preset === "shockwave-debris") {
      const angle = r() * Math.PI * 2;
      const speed = 0.45 + r() * 0.95;
      this.posX[i] = this.epicenterX + Math.cos(angle) * 0.02;
      this.posY[i] = this.epicenterY + Math.sin(angle) * 0.02;
      this.posZ[i] = 0.1 + r() * 0.16;
      this.velX[i] = Math.cos(angle) * speed;
      this.velY[i] = Math.sin(angle) * speed - 0.2;
      this.velZ[i] = 0.28 + r() * 0.45;
      this.size[i] = 3.0 + r() * 5.0;
      this.maxLife[i] = 1.1 + r() * 1.1;
    } else {
      const angle = (i / this.particleCount) * Math.PI * 2;
      const radius = 0.14 + (i % 3) * 0.075;
      this.posX[i] = this.epicenterX + Math.cos(angle) * radius;
      this.posY[i] = this.epicenterY + Math.sin(angle) * radius;
      this.posZ[i] = 0.12 + r() * 0.22;
      this.velX[i] = -Math.sin(angle) * 0.36;
      this.velY[i] = Math.cos(angle) * 0.36;
      this.velZ[i] = 0.15 + r() * 0.2;
      this.size[i] = 2.4 + r() * 3.0;
      this.maxLife[i] = 2.0 + r() * 1.5;
    }

    this.life[i] = this.maxLife[i];
  }

  private sampleDepth(map: NormalizedDepthMap, u: number, v: number): number {
    const ix = clamp(Math.floor(u * map.width), 0, map.width - 1);
    const iy = clamp(Math.floor(v * map.height), 0, map.height - 1);
    return map.data[iy * map.width + ix] ?? 1.0;
  }

  private estimateDepthNormal(
    map: NormalizedDepthMap,
    u: number,
    v: number,
  ): readonly [number, number, number] {
    const du = 1 / Math.max(1, map.width);
    const dv = 1 / Math.max(1, map.height);
    const gx = (this.sampleDepth(map, clamp(u + du, 0, 1), v) - this.sampleDepth(map, clamp(u - du, 0, 1), v)) * 0.5;
    const gy = (this.sampleDepth(map, u, clamp(v + dv, 0, 1)) - this.sampleDepth(map, u, clamp(v - dv, 0, 1))) * 0.5;
    const nx = -gx * 2.4;
    const ny = -gy * 2.4;
    const nz = -1.0;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }
}
