/**
 * 가상 스튜디오 효과음 설정 (게임필 설정과 같은 브라우저 로컬 저장 패턴).
 *
 * 발소리·상호작용 SFX의 켜짐 여부와 음량만 다룬다. 환경음(빗소리 등)의
 * 켜짐·음량은 앰비언트 오디오 컨트롤러가 따로 소유한다.
 */

export interface StudioVirtualSoundPreference {
  readonly version: 1;
  /** 효과음(발소리·상호작용 SFX) on/off. */
  readonly effectsEnabled: boolean;
  /** 효과음 음량 0~1. */
  readonly effectsVolume: number;
}

export const STUDIO_VIRTUAL_SOUND_STORAGE_KEY = "toonspectrum:virtual-space-sound:v1";

export const DEFAULT_STUDIO_VIRTUAL_SOUND: StudioVirtualSoundPreference = Object.freeze({
  version: 1,
  effectsEnabled: true,
  effectsVolume: 0.7,
});

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function parseStudioVirtualSoundPreference(value: unknown): StudioVirtualSoundPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  return Object.freeze({
    version: 1,
    effectsEnabled: typeof candidate.effectsEnabled === "boolean" ? candidate.effectsEnabled : true,
    effectsVolume: clampUnit(candidate.effectsVolume, 0.7),
  });
}

export function readStudioVirtualSoundPreference(): StudioVirtualSoundPreference {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_SOUND;
  try {
    const raw = window.localStorage.getItem(STUDIO_VIRTUAL_SOUND_STORAGE_KEY);
    return raw
      ? parseStudioVirtualSoundPreference(JSON.parse(raw)) ?? DEFAULT_STUDIO_VIRTUAL_SOUND
      : DEFAULT_STUDIO_VIRTUAL_SOUND;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_SOUND;
  }
}

export function writeStudioVirtualSoundPreference(value: StudioVirtualSoundPreference): boolean {
  const parsed = parseStudioVirtualSoundPreference(value);
  if (!parsed || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_SOUND_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
