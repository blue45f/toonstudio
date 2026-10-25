/**
 * studio-ai-art-settings.ts — 작품 작화 설정 저장·신규 회차 자동 주입 (순수 모듈, fetch 없음).
 *
 * 화풍 DNA 적용·감사는 콘티 생성 시점에 배선돼 있으나 작품 단위 저장에서
 * 회차 간 자동 상속되는 경로는 확인되지 않았다. 이 모듈은 작품 작화
 * 설정(화풍 프로파일·팔레트·선 스타일)의 검증·저장 형태와 신규 회차
 * 기본값 주입만 담당한다. 저장은 호출부가 작품 저장 경로로 수행하고,
 * 실제 생성 일관성(IP-Adapter·LoRA급)은 다루지 않는다.
 */

export interface StudioAiArtSettings {
  readonly styleDnaProfileId: string | null;
  readonly palette: readonly string[];
  readonly lineStyle: string | null;
}

export interface StudioAiEpisodeArtDefaults {
  readonly styleDnaProfileId: string | null;
  readonly palette: readonly string[];
  readonly lineStyle: string | null;
  readonly inheritedFromWork: boolean;
}

const MAX_PALETTE_ITEMS = 32;
const MAX_LINE_STYLE_CHARS = 200;

/** 작화 설정을 정리한다. 팔레트는 중복 제거·상한 적용한다. */
export function sanitizeArtSettings(
  input: StudioAiArtSettings,
): StudioAiArtSettings {
  const seen = new Set<string>();
  const palette: string[] = [];
  for (const color of input.palette) {
    const trimmed = color.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    palette.push(trimmed);
    if (palette.length >= MAX_PALETTE_ITEMS) break;
  }
  return {
    styleDnaProfileId: input.styleDnaProfileId?.trim() || null,
    palette: Object.freeze(palette),
    lineStyle: input.lineStyle?.trim().slice(0, MAX_LINE_STYLE_CHARS) || null,
  };
}

/** 작품 작화 설정을 신규 회차 기본값으로 주입한다. */
export function applyArtSettingsToNewEpisode(
  settings: StudioAiArtSettings,
): StudioAiEpisodeArtDefaults {
  const cleaned = sanitizeArtSettings(settings);
  return {
    styleDnaProfileId: cleaned.styleDnaProfileId,
    palette: cleaned.palette,
    lineStyle: cleaned.lineStyle,
    inheritedFromWork:
      cleaned.styleDnaProfileId !== null ||
      cleaned.palette.length > 0 ||
      cleaned.lineStyle !== null,
  };
}
