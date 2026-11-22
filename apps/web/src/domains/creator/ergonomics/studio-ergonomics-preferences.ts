/**
 * 스튜디오 인체공학 환경설정·왼손잡이 미러 레이아웃 토큰 엔진.
 *
 * - 오른손(`right-handed`) / 왼손잡이(`left-handed`) 원터치 미러 전환 상태를 보관하고
 *   `data-studio-handedness` DOM 속성과 레이아웃 토큰을 일관되게 발행한다.
 * - 야간 색온도 아이-컴포트 가드와 60분 연속 드로잉 손목·눈 휴식 넛지 설정을
 *   SSR·테스트 안전한 저장소 추상화(`StudioErgonomicsStorage`)로 관리한다.
 * - 레이아웃 미러링은 기존 flex 레일의 시각 정렬만 반전하며 새 열/행을 추가하지 않아
 *   캔버스 82%+ 뷰포트 점유율을 침범하지 않는다.
 */
import { useSyncExternalStore } from "react";

export const STUDIO_ERGONOMICS_STORAGE_KEY = "toonstudio:studio:ergonomics:v1";
export const STUDIO_ERGONOMICS_MIN_CANVAS_OCCUPANCY_RATIO = 0.82;

export const STUDIO_HANDEDNESS_MODES = ["right-handed", "left-handed"] as const;
export type StudioHandedness = (typeof STUDIO_HANDEDNESS_MODES)[number];

export const STUDIO_NIGHT_COMFORT_PRESETS = ["off", "gentle", "amber"] as const;
export type StudioNightComfortPreset = (typeof STUDIO_NIGHT_COMFORT_PRESETS)[number];

export const STUDIO_REST_INTERVAL_PRESET_MINUTES = [45, 60, 90] as const;
export const DEFAULT_STUDIO_REST_INTERVAL_MINUTES = 60;
export const DEFAULT_STUDIO_REST_BREAK_SECONDS = 60;
export const DEFAULT_STUDIO_REST_SNOOZE_MINUTES = 15;

export interface StudioErgonomicsPreferences {
  readonly handedness: StudioHandedness;
  readonly nightComfortPreset: StudioNightComfortPreset;
  /** 채색·스포이드·색보정·내보내기 진입 시 색 왜곡을 막기 위해 자동으로 중립 복귀한다. */
  readonly autoPauseNightComfortForColorCritical: boolean;
  readonly restNudgeEnabled: boolean;
  /** 연속 드로잉 휴식 알림 주기(분). 기본 60분. */
  readonly restNudgeIntervalMinutes: number;
  /** "1분 쉬기" 휴식 길이(초). 기본 60초. */
  readonly restBreakDurationSeconds: number;
  /** "15분 뒤 다시" 연기 길이(분). 기본 15분. */
  readonly restSnoozeMinutes: number;
}

export type StudioErgonomicsPreferencesPatch = Partial<StudioErgonomicsPreferences>;

export interface StudioErgonomicsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StudioHandednessLayoutTokens {
  readonly handedness: StudioHandedness;
  readonly dataAttribute: StudioHandedness;
  readonly toolRailSide: "left" | "right";
  readonly inspectorDockSide: "right" | "left";
  readonly edgeQuickSliderSide: "left" | "right";
  readonly restNudgeAnchor: "bottom-left" | "bottom-right";
  /** 미러링 시 새 크롬 열/행을 추가하지 않아 보장되는 최소 캔버스 점유율. */
  readonly canvasMinOccupancyRatio: number;
  readonly summaryKo: string;
  readonly cssCustomProperties: Readonly<Record<string, string>>;
}

export interface StudioErgonomicsAttributeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style?: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
}

const DEFAULT_PREFERENCES: StudioErgonomicsPreferences = Object.freeze({
  handedness: "right-handed",
  nightComfortPreset: "off",
  autoPauseNightComfortForColorCritical: true,
  restNudgeEnabled: true,
  restNudgeIntervalMinutes: DEFAULT_STUDIO_REST_INTERVAL_MINUTES,
  restBreakDurationSeconds: DEFAULT_STUDIO_REST_BREAK_SECONDS,
  restSnoozeMinutes: DEFAULT_STUDIO_REST_SNOOZE_MINUTES,
});

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function defaultStudioErgonomicsPreferences(): StudioErgonomicsPreferences {
  return { ...DEFAULT_PREFERENCES };
}

export function normalizeStudioHandedness(value: unknown): StudioHandedness {
  return value === "left-handed" ? "left-handed" : "right-handed";
}

export function normalizeStudioNightComfortPreset(value: unknown): StudioNightComfortPreset {
  if (value === "gentle" || value === "amber") return value;
  return "off";
}

export function normalizeStudioErgonomicsPreferences(
  value: unknown,
): StudioErgonomicsPreferences {
  if (!value || typeof value !== "object") {
    return defaultStudioErgonomicsPreferences();
  }
  const record = value as Record<string, unknown>;
  return {
    handedness: normalizeStudioHandedness(record.handedness),
    nightComfortPreset: normalizeStudioNightComfortPreset(record.nightComfortPreset),
    autoPauseNightComfortForColorCritical:
      typeof record.autoPauseNightComfortForColorCritical === "boolean"
        ? record.autoPauseNightComfortForColorCritical
        : DEFAULT_PREFERENCES.autoPauseNightComfortForColorCritical,
    restNudgeEnabled:
      typeof record.restNudgeEnabled === "boolean"
        ? record.restNudgeEnabled
        : DEFAULT_PREFERENCES.restNudgeEnabled,
    restNudgeIntervalMinutes: clampInteger(
      record.restNudgeIntervalMinutes,
      DEFAULT_PREFERENCES.restNudgeIntervalMinutes,
      15,
      180,
    ),
    restBreakDurationSeconds: clampInteger(
      record.restBreakDurationSeconds,
      DEFAULT_PREFERENCES.restBreakDurationSeconds,
      30,
      300,
    ),
    restSnoozeMinutes: clampInteger(
      record.restSnoozeMinutes,
      DEFAULT_PREFERENCES.restSnoozeMinutes,
      5,
      60,
    ),
  };
}

export function toggleStudioHandedness(current: StudioHandedness): StudioHandedness {
  return current === "left-handed" ? "right-handed" : "left-handed";
}

export function resolveStudioHandednessLayoutTokens(
  handedness: StudioHandedness,
): StudioHandednessLayoutTokens {
  const normalized = normalizeStudioHandedness(handedness);
  const isLeftHanded = normalized === "left-handed";
  return {
    handedness: normalized,
    dataAttribute: normalized,
    toolRailSide: isLeftHanded ? "right" : "left",
    inspectorDockSide: isLeftHanded ? "left" : "right",
    edgeQuickSliderSide: isLeftHanded ? "right" : "left",
    // 그리는 손목 반대쪽 하단에 휴식 넛지를 두어 스트로크 동선을 방해하지 않는다.
    restNudgeAnchor: isLeftHanded ? "bottom-right" : "bottom-left",
    canvasMinOccupancyRatio: STUDIO_ERGONOMICS_MIN_CANVAS_OCCUPANCY_RATIO,
    summaryKo: isLeftHanded
      ? "도구 막대 오른쪽 · 속성 패널 왼쪽 · 캔버스 82%+ 유지"
      : "도구 막대 왼쪽 · 속성 패널 오른쪽 · 캔버스 82%+ 유지",
    cssCustomProperties: Object.freeze({
      "--studio-ergonomics-tool-rail-side": isLeftHanded ? "right" : "left",
      "--studio-ergonomics-inspector-side": isLeftHanded ? "left" : "right",
      "--studio-ergonomics-active-rail-inset": isLeftHanded ? "-2px" : "2px",
    }),
  };
}

export function applyStudioHandednessToElement(
  element: StudioErgonomicsAttributeTarget | null | undefined,
  handedness: StudioHandedness,
): StudioHandednessLayoutTokens {
  const tokens = resolveStudioHandednessLayoutTokens(handedness);
  if (!element) return tokens;
  element.setAttribute("data-studio-handedness", tokens.dataAttribute);
  if (element.style) {
    for (const [name, value] of Object.entries(tokens.cssCustomProperties)) {
      element.style.setProperty(name, value);
    }
  }
  return tokens;
}

export function clearStudioHandednessFromElement(
  element: StudioErgonomicsAttributeTarget | null | undefined,
): void {
  if (!element) return;
  element.removeAttribute("data-studio-handedness");
  if (element.style) {
    element.style.removeProperty("--studio-ergonomics-tool-rail-side");
    element.style.removeProperty("--studio-ergonomics-inspector-side");
    element.style.removeProperty("--studio-ergonomics-active-rail-inset");
  }
}

export function loadStudioErgonomicsPreferences(
  storage: StudioErgonomicsStorage | null | undefined,
): StudioErgonomicsPreferences {
  if (!storage) return defaultStudioErgonomicsPreferences();
  try {
    const raw = storage.getItem(STUDIO_ERGONOMICS_STORAGE_KEY);
    if (!raw) return defaultStudioErgonomicsPreferences();
    return normalizeStudioErgonomicsPreferences(JSON.parse(raw));
  } catch {
    return defaultStudioErgonomicsPreferences();
  }
}

export function saveStudioErgonomicsPreferences(
  storage: StudioErgonomicsStorage | null | undefined,
  preferences: StudioErgonomicsPreferences,
): boolean {
  if (!storage) return false;
  try {
    const normalized = normalizeStudioErgonomicsPreferences(preferences);
    storage.setItem(STUDIO_ERGONOMICS_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function browserErgonomicsStorage(): StudioErgonomicsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function preferencesEqual(
  left: StudioErgonomicsPreferences,
  right: StudioErgonomicsPreferences,
): boolean {
  return (
    left.handedness === right.handedness
    && left.nightComfortPreset === right.nightComfortPreset
    && left.autoPauseNightComfortForColorCritical === right.autoPauseNightComfortForColorCritical
    && left.restNudgeEnabled === right.restNudgeEnabled
    && left.restNudgeIntervalMinutes === right.restNudgeIntervalMinutes
    && left.restBreakDurationSeconds === right.restBreakDurationSeconds
    && left.restSnoozeMinutes === right.restSnoozeMinutes
  );
}

let browserSnapshot: StudioErgonomicsPreferences | null = null;
let storageListener: ((event: StorageEvent) => void) | null = null;
const preferenceListeners = new Set<() => void>();
const restNudgePreviewListeners = new Set<() => void>();

function emitPreferences(next: StudioErgonomicsPreferences): StudioErgonomicsPreferences {
  const current = browserSnapshot ?? DEFAULT_PREFERENCES;
  if (preferencesEqual(current, next) && browserSnapshot !== null) {
    return current;
  }
  browserSnapshot = Object.freeze({ ...next });
  for (const listener of preferenceListeners) listener();
  return browserSnapshot;
}

function installStorageListener(): void {
  if (storageListener !== null || typeof window === "undefined") return;
  storageListener = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STUDIO_ERGONOMICS_STORAGE_KEY) {
      return;
    }
    emitPreferences(loadStudioErgonomicsPreferences(browserErgonomicsStorage()));
  };
  window.addEventListener("storage", storageListener);
}

export function getStudioErgonomicsPreferences(): StudioErgonomicsPreferences {
  installStorageListener();
  browserSnapshot ??= Object.freeze(loadStudioErgonomicsPreferences(browserErgonomicsStorage()));
  return browserSnapshot;
}

export function getServerStudioErgonomicsPreferences(): StudioErgonomicsPreferences {
  return DEFAULT_PREFERENCES;
}

export function subscribeStudioErgonomicsPreferences(listener: () => void): () => void {
  installStorageListener();
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

export function updateStudioErgonomicsPreferences(
  patch: StudioErgonomicsPreferencesPatch,
): StudioErgonomicsPreferences {
  const current = getStudioErgonomicsPreferences();
  const next = normalizeStudioErgonomicsPreferences({ ...current, ...patch });
  if (preferencesEqual(current, next)) return current;
  saveStudioErgonomicsPreferences(browserErgonomicsStorage(), next);
  return emitPreferences(next);
}

export function setStudioHandednessPreference(
  handedness: StudioHandedness,
): StudioErgonomicsPreferences {
  return updateStudioErgonomicsPreferences({ handedness });
}

export function toggleStudioHandednessPreference(): StudioErgonomicsPreferences {
  const current = getStudioErgonomicsPreferences();
  return updateStudioErgonomicsPreferences({
    handedness: toggleStudioHandedness(current.handedness),
  });
}

export function resetStudioErgonomicsPreferences(): StudioErgonomicsPreferences {
  const storage = browserErgonomicsStorage();
  if (storage) {
    try {
      if (storage.removeItem) {
        storage.removeItem(STUDIO_ERGONOMICS_STORAGE_KEY);
      } else {
        storage.setItem(STUDIO_ERGONOMICS_STORAGE_KEY, JSON.stringify(DEFAULT_PREFERENCES));
      }
    } catch {
      // 저장소가 막혀도 메모리 상태는 안전하게 초기화한다.
    }
  }
  return emitPreferences(defaultStudioErgonomicsPreferences());
}

export function useStudioErgonomicsPreferences(): StudioErgonomicsPreferences {
  return useSyncExternalStore(
    subscribeStudioErgonomicsPreferences,
    getStudioErgonomicsPreferences,
    getServerStudioErgonomicsPreferences,
  );
}

/** 설정 패널에서 실시간 에디터 휴식 넛지 바 미리보기를 요청한다. */
export function requestStudioRestNudgePreview(): void {
  for (const listener of restNudgePreviewListeners) listener();
}

export function subscribeStudioRestNudgePreview(listener: () => void): () => void {
  restNudgePreviewListeners.add(listener);
  return () => {
    restNudgePreviewListeners.delete(listener);
  };
}

export function resetStudioErgonomicsStoreForTests(): void {
  browserSnapshot = null;
  preferenceListeners.clear();
  restNudgePreviewListeners.clear();
  if (storageListener !== null && typeof window !== "undefined") {
    window.removeEventListener("storage", storageListener);
  }
  storageListener = null;
}
