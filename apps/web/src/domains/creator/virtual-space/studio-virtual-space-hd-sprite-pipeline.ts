/**
 * 가상 스튜디오 HD 스프라이트 파이프라인 — current (Atelier Pulse 2.0 고도화).
 *
 * 목표: 같은 Phaser/아틀라스 자산을 유지하면서 화면에 보이는 스프라이트 품질을
 * 경쟁 제품(Gather 2.0 / WorkAdventure / Kumospace / ZEP) 대비 최고 수준으로 끌어올린다.
 *
 * - DPR·뷰포트·아트 스타일·이펙트 레벨을 보고 SD/HD/ULTRA 중 하나를 고른다.
 * - 픽셀 아트(retro)는 NEAREST를 강제하고, HD 일러스트는 LINEAR + 밉맵 + LOD를 쓴다.
 * - 그림자·외곽선·광원 변조 값을 수치로 고정해 렌더러(Phaser)와 CSS(마스터 월드)가 같은 값을 쓴다.
 * - 시간대(dawn/day/dusk/night)·아트 스타일·방향·활동 상태에 따른 환경광 틴트,
 *   이중 접지 그림자(Core AO + Penumbra), 공감각 활동 오라(Activity Aura)를 순수 수식으로 산출한다.
 *
 * 순수 함수만 둔다. DOM/Phaser를 직접 만지지 않아 단위 테스트로 계약을 고정한다.
 */

import { studioSpaceThemeCharacterHarmonyTint } from "./studio-virtual-space-theme";

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

export interface StudioHdActorTintInput {
  readonly dayPhase?: "dawn" | "day" | "dusk" | "night" | string;
  readonly phase?: "dawn" | "day" | "dusk" | "night" | string;
  readonly artStyle?: string;
  readonly style?: string;
  readonly spaceTheme?: string;
  readonly facing?: "up" | "down" | "left" | "right";
  readonly activity?: string;
  readonly userStatus?: string | null;
  readonly focused?: boolean;
  readonly away?: boolean;
  readonly ghost?: boolean;
}

export interface StudioHdGroundContactInput {
  readonly distance: number;
  readonly stride: number;
  readonly moving: boolean;
  readonly seated: boolean;
  readonly ghost: boolean;
  readonly reducedMotion: boolean;
  readonly tier?: StudioHdSpriteTier;
}

export interface StudioHdGroundContactSpec {
  readonly visible: boolean;
  readonly coreWidth: number;
  readonly coreHeight: number;
  readonly coreAlpha: number;
  readonly penumbraScaleX: number;
  readonly penumbraAlpha: number;
}

export interface StudioHdActivityAuraInput {
  readonly activity?: string;
  readonly userStatus?: string | null;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly seated?: boolean;
}

export interface StudioHdActivityAuraSpec {
  readonly visible: boolean;
  readonly kind: "none" | "focus" | "review" | "meeting" | "break";
  readonly colorHex: number;
  readonly innerRadiusX: number;
  readonly innerRadiusY: number;
  readonly outerRadiusX: number;
  readonly outerRadiusY: number;
  readonly ringAlpha: number;
  readonly glowAlpha: number;
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

function mulChannel(channel: number, factor: number): number {
  return Math.max(0, Math.min(255, Math.round(channel * factor)));
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * 시간대·아트 스타일·방향·상태에 따라 캐릭터 스프라이트에 입힐 미세 환경광 틴트(0xRRGGBB).
 * 과도한 색 왜곡 없이 원화 피부톤을 보존하면서 공간 조명과 일체감을 부여한다.
 */
export function resolveStudioHdActorTint(input: StudioHdActorTintInput): number {
  if (input.ghost) return 0xc8e6ff;
  let r = 255;
  let g = 255;
  let b = 255;

  const dayPhase = input.dayPhase ?? input.phase;
  const artStyle = input.artStyle ?? input.style;

  switch (dayPhase) {
    case "dawn":
      r = 255;
      g = 246;
      b = 242;
      break;
    case "dusk":
      r = 255;
      g = 241;
      b = 230;
      break;
    case "night":
      r = 232;
      g = 240;
      b = 255;
      break;
    default:
      break;
  }

  if (artStyle === "neon") {
    r = mulChannel(r, 0.97);
    g = mulChannel(g, 0.98);
    b = 255;
  } else if (artStyle === "watercolor") {
    r = 255;
    g = mulChannel(g, 0.99);
    b = mulChannel(b, 0.97);
  }

  // 공간 테마별 색온도 하모니 블렌딩: 배경과 캐릭터가 어색하게 분리되지 않도록 30% 비율로 환경광을 섞는다.
  if (input.spaceTheme) {
    const harmony = studioSpaceThemeCharacterHarmonyTint(input.spaceTheme);
    const hr = (harmony >> 16) & 0xff;
    const hg = (harmony >> 8) & 0xff;
    const hb = harmony & 0xff;
    r = Math.round(r * (0.72 + (hr / 255) * 0.28));
    g = Math.round(g * (0.72 + (hg / 255) * 0.28));
    b = Math.round(b * (0.72 + (hb / 255) * 0.28));
  }

  // 뒤돌아선 자세(up)는 배경 공기원근에 자연스럽게 묻히도록 3% 차분하게 낮춘다.
  if (input.facing === "up") {
    r = mulChannel(r, 0.97);
    g = mulChannel(g, 0.97);
    b = mulChannel(b, 0.98);
  }

  if (input.away || input.activity === "away" || input.userStatus === "Stepped-away" || input.userStatus === "on-break") {
    r = mulChannel(r, 0.9);
    g = mulChannel(g, 0.92);
    b = mulChannel(b, 0.95);
  }

  return packRgb(r, g, b);
}

/**
 * 발 접지 순간의 이중 그림자(Core Ambient Occlusion + Soft Penumbra) 스펙을 계산한다.
 * 발이 지면에 닿을 때 코어 AO가 진해지고 공중에서 살짝 옅어져 무게감을 살린다.
 */
export function resolveStudioHdGroundContactSpec(
  input: StudioHdGroundContactInput,
): StudioHdGroundContactSpec {
  if (input.seated) {
    return Object.freeze({
      visible: false,
      coreWidth: 0,
      coreHeight: 0,
      coreAlpha: 0,
      penumbraScaleX: 1,
      penumbraAlpha: 0,
    });
  }
  const basePenumbra = input.tier === "ultra" ? 0.34 : input.tier === "hd" ? 0.3 : 0.28;
  if (input.ghost) {
    return Object.freeze({
      visible: true,
      coreWidth: 18,
      coreHeight: 6,
      coreAlpha: 0.08,
      penumbraScaleX: 0.92,
      penumbraAlpha: 0.1,
    });
  }
  const validGait =
    input.moving &&
    !input.reducedMotion &&
    Number.isFinite(input.distance) &&
    input.distance >= 0 &&
    Number.isFinite(input.stride) &&
    input.stride > 0;
  const contactWave = validGait ? Math.cos((input.distance / input.stride) * Math.PI * 4) : 0;
  const penumbraScaleX = validGait ? 0.96 + contactWave * 0.04 : 1;
  const penumbraAlpha = validGait ? basePenumbra + contactWave * 0.035 : basePenumbra;
  const coreAlpha = validGait ? 0.22 + contactWave * 0.04 : 0.2;
  const coreWidth = validGait ? 22 - contactWave * 1.5 : 22;
  const coreHeight = validGait ? 7.5 - contactWave * 0.4 : 7.5;

  return Object.freeze({
    visible: true,
    coreWidth,
    coreHeight,
    coreAlpha,
    penumbraScaleX,
    penumbraAlpha,
  });
}

const HIDDEN_AURA: StudioHdActivityAuraSpec = Object.freeze({
  visible: false,
  kind: "none",
  colorHex: 0x000000,
  innerRadiusX: 0,
  innerRadiusY: 0,
  outerRadiusX: 0,
  outerRadiusY: 0,
  ringAlpha: 0,
  glowAlpha: 0,
});

/**
 * 배우의 활동·상태(집중·검토·회의·휴식)를 바닥의 공감각 오라 링(Activity Aura)으로 변환한다.
 * 산만한 머리 위 아이콘 대신 발밑의 은은한 광학 링으로 공간의 창작 기류를 읽게 한다.
 */
export function resolveStudioHdActivityAura(
  input: StudioHdActivityAuraInput,
): StudioHdActivityAuraSpec {
  const status = input.userStatus ?? null;
  const activity = input.activity ?? "available";

  let kind: StudioHdActivityAuraSpec["kind"] = "none";
  let colorHex = 0x34d399;

  if (status === "in-meeting") {
    kind = "meeting";
    colorHex = 0xa78bfa;
  } else if (activity === "reviewing") {
    kind = "review";
    colorHex = 0xfbbf24;
  } else if (activity === "focused" || status === "focusing") {
    kind = "focus";
    colorHex = 0x34d399;
  } else if (status === "break" || activity === "break") {
    kind = "break";
    colorHex = 0x38bdf8;
  }

  if (kind === "none") return HIDDEN_AURA;

  const safeTime = Number.isFinite(input.timeMs) ? Math.max(0, input.timeMs) : 0;
  const pulse = input.reducedMotion ? 0 : (Math.sin((safeTime / 2_400) * Math.PI * 2) + 1) * 0.5;
  const seatScale = input.seated ? 1.12 : 1;
  const innerRadiusX = (19 + pulse * 1.6) * seatScale;
  const innerRadiusY = (8.5 + pulse * 0.7) * seatScale;
  const outerRadiusX = (25 + pulse * 2.8) * seatScale;
  const outerRadiusY = (11.2 + pulse * 1.2) * seatScale;
  const ringAlpha = input.reducedMotion ? 0.34 : 0.28 + pulse * 0.14;
  const glowAlpha = input.reducedMotion ? 0.11 : 0.08 + pulse * 0.06;

  return Object.freeze({
    visible: true,
    kind,
    colorHex,
    innerRadiusX,
    innerRadiusY,
    outerRadiusX,
    outerRadiusY,
    ringAlpha,
    glowAlpha,
  });
}
