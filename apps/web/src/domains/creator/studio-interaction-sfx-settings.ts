/**
 * studio-interaction-sfx-settings.ts — 인터랙션 효과음 설정 스키마 (순수 모듈, fetch 없음).
 *
 * 마스터 키(ts_fx_sfx_enabled·ts_fx_volume)는 기존 core fx 계통을 그대로
 * 쓴다. 이 모듈이 새로 두는 키는 카테고리 토글 1개(ts_fx_interaction,
 * JSON)뿐이며, 마스터 OFF면 카테고리 설정과 무관하게 무음이다.
 * 기본 볼륨 0.25는 거슬리지 않는 수준의 권장 기본값으로, 별도 버스가
 * 아니라 기존 마스터 볼륨에 적용하는 값이다. 손상된 저장값은 기본값으로
 * 폴백한다. reduced-motion이면 기본 enabled는 false이다.
 */

export interface StudioInteractionSfxCategorySettings {
  readonly enabled: boolean;
  readonly volume: number;
  readonly click: boolean;
  readonly draw: boolean;
  readonly drag: boolean;
  readonly visual: boolean;
}

export const STUDIO_INTERACTION_SFX_MASTER_ENABLED_KEY = "ts_fx_sfx_enabled";
export const STUDIO_INTERACTION_SFX_MASTER_VOLUME_KEY = "ts_fx_volume";
export const STUDIO_INTERACTION_SFX_CATEGORY_KEY = "ts_fx_interaction";

/** 권장 기본 볼륨. 기존 BGM 기본값 0.6보다 낮게 둔다. */
export const STUDIO_INTERACTION_SFX_DEFAULT_VOLUME = 0.25;

export function defaultInteractionSfxSettings(reducedMotion: boolean): StudioInteractionSfxCategorySettings {
  return Object.freeze({
    enabled: !reducedMotion,
    volume: STUDIO_INTERACTION_SFX_DEFAULT_VOLUME,
    click: true,
    draw: true,
    drag: true,
    visual: true,
  });
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 저장된 JSON을 파싱한다. 손상됐거나 형식이 아니면 기본값을 돌려준다. */
export function parseInteractionSfxSettings(
  stored: string | null,
  reducedMotion: boolean,
): StudioInteractionSfxCategorySettings {
  const fallback = defaultInteractionSfxSettings(reducedMotion);
  if (stored === null || stored === "") return fallback;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    return Object.freeze({
      enabled: asBool(record.enabled, fallback.enabled),
      volume: asVolume(record.volume, fallback.volume),
      click: asBool(record.click, fallback.click),
      draw: asBool(record.draw, fallback.draw),
      drag: asBool(record.drag, fallback.drag),
      visual: asBool(record.visual, fallback.visual),
    });
  } catch {
    return fallback;
  }
}

/** 설정을 저장용 JSON으로 직렬화한다. */
export function serializeInteractionSfxSettings(
  settings: StudioInteractionSfxCategorySettings,
): string {
  return JSON.stringify({
    enabled: settings.enabled,
    volume: settings.volume,
    click: settings.click,
    draw: settings.draw,
    drag: settings.drag,
    visual: settings.visual,
  });
}
