import type { StudioVirtualQualityPreset } from "./studio-virtual-space-experience-preference";

export type StudioVirtualQualityTier = Exclude<StudioVirtualQualityPreset, "auto">;

export interface StudioVirtualQualityEnvironment {
  readonly viewportWidth: number;
  readonly reducedMotion: boolean;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
}

export interface StudioVirtualQualityProfile {
  readonly tier: StudioVirtualQualityTier;
  readonly dprCap: number;
  readonly particleRatio: number;
  readonly maxActiveNpcs: number;
  readonly maxAnimatedDecorations: number;
  readonly interestRadius: number;
  readonly targetFps: number;
  readonly dynamicLights: boolean;
  readonly weather: boolean;
  readonly ambientActors: boolean;
}

const PROFILES: Readonly<Record<StudioVirtualQualityTier, StudioVirtualQualityProfile>> = Object.freeze({
  ultra: Object.freeze({ tier: "ultra", dprCap: 2, particleRatio: 1, maxActiveNpcs: 10, maxAnimatedDecorations: 36, interestRadius: 760, targetFps: 60, dynamicLights: true, weather: true, ambientActors: true }),
  high: Object.freeze({ tier: "high", dprCap: 2, particleRatio: .82, maxActiveNpcs: 8, maxAnimatedDecorations: 28, interestRadius: 650, targetFps: 55, dynamicLights: true, weather: true, ambientActors: true }),
  balanced: Object.freeze({ tier: "balanced", dprCap: 1.5, particleRatio: .58, maxActiveNpcs: 6, maxAnimatedDecorations: 20, interestRadius: 520, targetFps: 45, dynamicLights: true, weather: true, ambientActors: true }),
  battery: Object.freeze({ tier: "battery", dprCap: 1.15, particleRatio: .24, maxActiveNpcs: 4, maxAnimatedDecorations: 10, interestRadius: 390, targetFps: 30, dynamicLights: false, weather: false, ambientActors: false }),
  accessibility: Object.freeze({ tier: "accessibility", dprCap: 1, particleRatio: 0, maxActiveNpcs: 2, maxAnimatedDecorations: 0, interestRadius: 340, targetFps: 30, dynamicLights: false, weather: false, ambientActors: false }),
});

export function studioVirtualAutomaticQualityTier(environment: StudioVirtualQualityEnvironment): StudioVirtualQualityTier {
  if (environment.reducedMotion) return "accessibility";
  const mobile = environment.viewportWidth < 720;
  const memory = environment.deviceMemory ?? 8;
  const cores = environment.hardwareConcurrency ?? 8;
  if (memory <= 3 || cores <= 4) return "battery";
  if (mobile || memory <= 5 || cores <= 6) return "balanced";
  if (memory >= 12 && cores >= 10 && environment.viewportWidth >= 1200) return "ultra";
  return "high";
}

/**
 * 모션 줄이기용 프로필. 파티클·날씨·조명·분주한 NPC는 접근성 프로필 그대로 줄이되, 해상도 상한은 기기 성능으로 정한다.
 * (예전에는 모션 줄이기를 켠 사용자는 고해상도 화면에서도 1배 해상도로 그려져 월드가 흐릿했다. 모션 줄이기는
 * 움직임을 줄이는 설정이지 선명도를 낮추는 설정이 아니다.) 배터리급 기기는 그대로 낮은 상한을 쓴다.
 */
const REDUCED_MOTION_PROFILES: Readonly<Record<StudioVirtualQualityTier, StudioVirtualQualityProfile>> = Object.freeze(
  Object.fromEntries((Object.keys(PROFILES) as StudioVirtualQualityTier[]).map((tier) => [
    tier,
    Object.freeze({ ...PROFILES.accessibility, dprCap: PROFILES[tier].dprCap }),
  ])) as Record<StudioVirtualQualityTier, StudioVirtualQualityProfile>,
);

export function studioVirtualQualityProfile(
  preset: StudioVirtualQualityPreset,
  environment: StudioVirtualQualityEnvironment,
): StudioVirtualQualityProfile {
  if (environment.reducedMotion) {
    const hardware = studioVirtualAutomaticQualityTier({ ...environment, reducedMotion: false });
    return REDUCED_MOTION_PROFILES[hardware];
  }
  return PROFILES[preset === "auto" ? studioVirtualAutomaticQualityTier(environment) : preset];
}

const ORDER: readonly StudioVirtualQualityTier[] = ["accessibility", "battery", "balanced", "high", "ultra"];

export interface StudioVirtualQualitySample {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly tier: StudioVirtualQualityTier;
  readonly changed: boolean;
}

/** Hysteresis prevents a single slow frame from visibly toggling quality. */
export class StudioVirtualAdaptiveQualityController {
  private tier: StudioVirtualQualityTier;
  private elapsedLow = 0;
  private elapsedHigh = 0;
  private smoothedFrameMs = 16.67;

  constructor(initial: StudioVirtualQualityTier) {
    this.tier = initial;
  }

  reset(tier: StudioVirtualQualityTier): void {
    this.tier = tier;
    this.elapsedLow = 0;
    this.elapsedHigh = 0;
  }

  sample(deltaMs: number, automatic: boolean, ceiling: StudioVirtualQualityTier = "ultra"): StudioVirtualQualitySample {
    const bounded = Number.isFinite(deltaMs) ? Math.max(1, Math.min(250, deltaMs)) : 16.67;
    this.smoothedFrameMs += (bounded - this.smoothedFrameMs) * .08;
    const fps = 1_000 / this.smoothedFrameMs;
    let changed = false;
    if (automatic) {
      const ceilingIndex = ORDER.indexOf(ceiling);
      if (ORDER.indexOf(this.tier) > ceilingIndex) {
        this.reset(ceiling);
        changed = true;
      }
      const profile = PROFILES[this.tier];
      if (fps < profile.targetFps - 8) {
        this.elapsedLow += bounded;
        this.elapsedHigh = 0;
      } else if (fps > profile.targetFps + 5) {
        this.elapsedHigh += bounded;
        this.elapsedLow = 0;
      } else {
        this.elapsedLow = Math.max(0, this.elapsedLow - bounded * .5);
        this.elapsedHigh = Math.max(0, this.elapsedHigh - bounded * .25);
      }
      const index = ORDER.indexOf(this.tier);
      if (this.elapsedLow >= 3_000 && index > 0) {
        this.tier = ORDER[index - 1]!;
        this.elapsedLow = 0;
        changed = true;
      } else if (this.elapsedHigh >= 10_000 && index < ceilingIndex) {
        this.tier = ORDER[index + 1]!;
        this.elapsedHigh = 0;
        changed = true;
      }
    }
    return Object.freeze({ fps, frameTimeMs: this.smoothedFrameMs, tier: this.tier, changed });
  }
}
