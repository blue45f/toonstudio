import { describe, expect, it } from "vitest";

import {
  defaultInteractionSfxSettings,
  parseInteractionSfxSettings,
  serializeInteractionSfxSettings,
  STUDIO_INTERACTION_SFX_DEFAULT_VOLUME,
} from "./studio-interaction-sfx-settings";

describe("studio-interaction-sfx-settings", () => {
  it("기본값은 켜짐·낮은 볼륨·전 카테고리 켜짐이다", () => {
    const settings = defaultInteractionSfxSettings(false);
    expect(settings.enabled).toBe(true);
    expect(settings.volume).toBe(STUDIO_INTERACTION_SFX_DEFAULT_VOLUME);
    expect(settings.volume).toBeLessThan(0.6);
    expect(settings.click).toBe(true);
    expect(settings.draw).toBe(true);
    expect(settings.drag).toBe(true);
    expect(settings.visual).toBe(true);
  });

  it("reduced-motion이면 기본 enabled는 false이다", () => {
    expect(defaultInteractionSfxSettings(true).enabled).toBe(false);
  });

  it("손상된 저장값은 기본값으로 폴백한다", () => {
    expect(parseInteractionSfxSettings("{broken", false)).toEqual(
      defaultInteractionSfxSettings(false),
    );
    expect(parseInteractionSfxSettings(null, false)).toEqual(
      defaultInteractionSfxSettings(false),
    );
  });

  it("부분 저장값은 나머지를 기본값으로 채우고 볼륨을 0~1로 고정한다", () => {
    const parsed = parseInteractionSfxSettings(
      JSON.stringify({ draw: false, volume: 2 }),
      false,
    );
    expect(parsed.draw).toBe(false);
    expect(parsed.click).toBe(true);
    expect(parsed.volume).toBe(1);
  });

  it("직렬화 후 파싱하면 동일하다", () => {
    const settings = { ...defaultInteractionSfxSettings(false), drag: false };
    expect(parseInteractionSfxSettings(serializeInteractionSfxSettings(settings), false)).toEqual(
      settings,
    );
  });
});
