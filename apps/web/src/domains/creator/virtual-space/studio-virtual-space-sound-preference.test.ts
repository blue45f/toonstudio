// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STUDIO_VIRTUAL_SOUND,
  STUDIO_VIRTUAL_SOUND_STORAGE_KEY,
  parseStudioVirtualSoundPreference,
  readStudioVirtualSoundPreference,
  writeStudioVirtualSoundPreference,
} from "./studio-virtual-space-sound-preference";

afterEach(() => window.localStorage.clear());

describe("studio virtual sound preference", () => {
  it("기본값은 효과음 켜짐·음량 0.7이다", () => {
    expect(DEFAULT_STUDIO_VIRTUAL_SOUND).toEqual({ version: 1, effectsEnabled: true, effectsVolume: 0.7 });
    expect(readStudioVirtualSoundPreference()).toEqual(DEFAULT_STUDIO_VIRTUAL_SOUND);
  });

  it("localStorage 왕복으로 저장값을 읽어온다", () => {
    expect(writeStudioVirtualSoundPreference({ version: 1, effectsEnabled: false, effectsVolume: 0.25 })).toBe(true);
    expect(window.localStorage.getItem(STUDIO_VIRTUAL_SOUND_STORAGE_KEY)).toContain("0.25");
    expect(readStudioVirtualSoundPreference()).toEqual({ version: 1, effectsEnabled: false, effectsVolume: 0.25 });
  });

  it("깨진 저장값·버전 불일치는 기본값으로 떨어진다", () => {
    window.localStorage.setItem(STUDIO_VIRTUAL_SOUND_STORAGE_KEY, "{broken");
    expect(readStudioVirtualSoundPreference()).toEqual(DEFAULT_STUDIO_VIRTUAL_SOUND);
    expect(parseStudioVirtualSoundPreference({ version: 2, effectsEnabled: false, effectsVolume: 0.5 })).toBeNull();
    expect(parseStudioVirtualSoundPreference(null)).toBeNull();
  });

  it("음량은 0~1로 제한하고 필드가 없으면 기본값으로 채운다", () => {
    expect(parseStudioVirtualSoundPreference({ version: 1, effectsVolume: 4 })?.effectsVolume).toBe(1);
    expect(parseStudioVirtualSoundPreference({ version: 1, effectsVolume: -1 })?.effectsVolume).toBe(0);
    expect(parseStudioVirtualSoundPreference({ version: 1 })).toEqual(DEFAULT_STUDIO_VIRTUAL_SOUND);
  });
});
