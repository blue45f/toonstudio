/**
 * 가상 스튜디오 HD 스프라이트 파이프라인 — current.
 *
 * 목표: 같은 Phaser/아틀라스 자산을 유지하면서 화면에 보이는 스프라이트 품질을
 * 경쟁 제품(Gather 2.0 / WorkAdventure / Kumospace / ZEP) 대비 최고 수준으로 끌어올린다.
 *
 * - DPR·뷰포트·아트 스타일·이펙트 레벨을 보고 SD/HD/ULTRA 중 하나를 고른다.
 * - 픽셀 아트(retro)는 NEAREST를 강제하고, HD 일러스트는 LINEAR + 밉맵 + LOD를 쓴다.
 * - 그림자·외곽선·광원 변조 값을 수치로 고정해 렌더러(Phaser)와 CSS(마스터 월드)가 같은 값을 쓴다.
 *
 * 순수 함수만 둔다. DOM/Phaser를 직접 만지지 않아 단위 테스트로 계약을 고정한다.
 */

export type StudioHdSpriteTier = "sd" | "hd" | "ultra";

export interface StudioHdSpriteEnvironment {
  readonly dpr: number;
  readonly viewportWidth: number;
  readonly pixelated: boolean;
  readonly reducedMotion: boolean;
  /** low면 포스트 이펙트를 끈다. high/ultra가 아니다. */
  readonly effectLevel: "low" | "medium" | "high";
  readonly deviceMemoryGb?: number;
}

export interface StudioHdSpriteProfile {
  readonly tier: StudioHdSpriteTier;
  /** Phaser texture sampling. */
  readonly sampling: "nearest" | "linear";
  /** 밉맵·LOD 반감 텍스처를 올리는지. 픽셀 아트는 항상 false. */
  readonly useMipmap: boolean;
  /** 스프라이트가 화면에서 줄어 그려질 때 허용하는 최소 축소율. */
  readonly minScale: number;
  /** 접지 그림자 블러(px, CSS 기준). */
  readonly shadowBlurPx: number;
  /** 접지 그림자 불투명도 0~1. */
  readonly shadowOpacity: number;
  /** 발광형(neon) 아웃라인 강화 여부. */
  readonly outlineBoost: boolean;
  /** 주광 변조 강도 0~1. Phaser day-night와 CSS filter가 공유한다. */
  readonly lightModulation: number;
}

const HD_PROFILE: StudioHdSpriteProfile = Object.freeze({
  tier: "hd",
  sampling: "linear",
  useMipmap: true,
  minScale: 0.45,
  shadowBlurPx: 8,
  shadowOpacity: 0.34,
  outlineBoost: false,
  lightModulation: 0.65,
});

const ULTRA_PROFILE: StudioHdSpriteProfile = Object.freeze({
  tier: "ultra",
  sampling: "linear",
  useMipmap: true,
  minScale: 0.32,
  shadowBlurPx: 10,
  shadowOpacity: 0.38,
  outlineBoost: true,
  lightModulation: 0.85,
});

const SD_PROFILE: StudioHdSpriteProfile = Object.freeze({
  tier: "sd",
  sampling: "linear",
  useMipmap: false,
  minScale: 0.6,
  shadowBlurPx: 6,
  shadowOpacity: 0.28,
  outlineBoost: false,
  lightModulation: 0.45,
});

const PIXEL_PROFILE: StudioHdSpriteProfile = Object.freeze({
  tier: "sd",
  sampling: "nearest",
  useMipmap: false,
  minScale: 1,
  shadowBlurPx: 0,
  shadowOpacity: 0.3,
  outlineBoost: false,
  lightModulation: 0,
});

export function resolveStudioHdSpriteTier(env: StudioHdSpriteEnvironment): StudioHdSpriteTier {
  if (env.pixelated) return "sd";
  if (env.reducedMotion && env.effectLevel === "low") return "sd";
  const dpr = Number.isFinite(env.dpr) ? env.dpr : 1;
  const memory = Number.isFinite(env.deviceMemoryGb ?? 8) ? (env.deviceMemoryGb ?? 8) : 8;
  const width = Number.isFinite(env.viewportWidth) ? env.viewportWidth : 0;
  const wide = width >= 1280;
  const ultra = (dpr >= 2.5 || (dpr >= 2 && wide)) && memory >= 8 && env.effectLevel === "high";
  if (ultra) return env.reducedMotion ? "hd" : "ultra";
  if (dpr >= 1.5 || wide) return "hd";
  return "sd";
}

export function studioHdSpriteProfile(env: StudioHdSpriteEnvironment): StudioHdSpriteProfile {
  if (env.pixelated) return PIXEL_PROFILE;
  const tier = resolveStudioHdSpriteTier(env);
  if (tier === "ultra") {
    if (env.effectLevel === "low") return { ...ULTRA_PROFILE, shadowBlurPx: 6, outlineBoost: false, lightModulation: 0.45 };
    return ULTRA_PROFILE;
  }
  if (tier === "hd") {
    if (env.effectLevel === "low") return { ...HD_PROFILE, shadowBlurPx: 5, lightModulation: 0.4 };
    return HD_PROFILE;
  }
  if (env.effectLevel === "low") return { ...SD_PROFILE, shadowBlurPx: 4, lightModulation: 0.3 };
  return SD_PROFILE;
}

/**
 * Phaser 스프라이트가 화면에서 축소될 때 깨지는 것을 막는 스냅 값.
 * 픽셀 아트는 정수배 스냅, HD는 0.25 스냅으로 계단 현상과 흐릿함을 함께 줄인다.
 */
export function snapStudioHdDisplayScale(scale: number, pixelated: boolean): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  if (pixelated) return Math.min(4, Math.max(1, Math.round(scale)));
  return Math.min(4, Math.max(0.25, Math.round(scale * 4) / 4));
}

/** CSS filter 한 줄로 주광·외곽선 강화를 표현한다. 렌더러와 마스터 월드가 공유한다. */
export function studioHdSpriteCssFilter(profile: StudioHdSpriteProfile, facingAway: boolean): string {
  if (profile.sampling === "nearest") return "none";
  const parts: string[] = [];
  if (facingAway) parts.push("saturate(.92)", "brightness(.97)");
  if (profile.outlineBoost) parts.push("drop-shadow(0 0 6px rgb(120 200 255 / .55))");
  if (profile.lightModulation > 0.7) parts.push("contrast(1.04)");
  return parts.length > 0 ? parts.join(" ") : "none";
}

/** 마스터 월드 배경용 image-set. 2x가 있으면 DPR 2 이상에서 고해상도를 쓴다. */
export function studioHdBackdropImageSet(baseUrl: string, hdUrl?: string): string {
  if (typeof baseUrl !== "string" || baseUrl.length === 0 || baseUrl.includes('"')) return "none";
  if (!hdUrl || hdUrl === baseUrl || hdUrl.includes('"')) return `url("${baseUrl}")`;
  return `image-set(url("${baseUrl}") 1x, url("${hdUrl}") 2x)`;
}
