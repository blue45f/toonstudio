import {
  readBrowserPreference,
  writeBrowserPreference,
  type StorageResolver,
} from "@/shared/lib/browser-preferences";

import { QUICK_MENU_ACTION_LABELS_KO, type QuickMenuSlot } from "../drawing/studio-quickmenu-and-quickshape";
import { ALL_QUICK_MENU_ACTION_IDS, loadQuickMenuSlots, normalizeQuickMenuSlots } from "../drawing/studio-quickmenu-preferences";
import { expandSlotsToJewelEight, type StudioRadialQuickWheelSlot } from "./studio-drawing-ergonomics-presets";

export const RADIAL_QUICK_MENU_EXTRA_STORAGE_KEY = "toonstudio.radial-quick-menu-extra-slots.v1";

const browserStorage: StorageResolver = () =>
  typeof window === "undefined" ? undefined : window.localStorage;

/** 앞 여섯 슬롯의 기존 정본에 방사형 메뉴 전용 두 슬롯만 결합한다. */
export function mergeRadialQuickMenuSlots(
  legacySlots: readonly QuickMenuSlot[],
  radialSlots: readonly StudioRadialQuickWheelSlot[],
): readonly StudioRadialQuickWheelSlot[] {
  return expandSlotsToJewelEight([...normalizeQuickMenuSlots(legacySlots), ...radialSlots.slice(6, 8)]);
}

/** UI 동작 식별자 두 개만 읽으며 원고·작품 데이터의 저장 권위를 만들지 않는다. */
export function loadRadialQuickMenuSlots(
  legacySlots: readonly QuickMenuSlot[] = loadQuickMenuSlots(),
  resolveStorage: StorageResolver = browserStorage,
): readonly StudioRadialQuickWheelSlot[] {
  const defaults = expandSlotsToJewelEight(normalizeQuickMenuSlots(legacySlots));
  const raw = readBrowserPreference(resolveStorage, RADIAL_QUICK_MENU_EXTRA_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 2) return defaults;
    return defaults.map((slot, index) => {
      if (index < 6) return slot;
      const candidate: unknown = parsed[index - 6];
      if (
        !candidate || typeof candidate !== "object"
        || !("index" in candidate) || candidate.index !== index
        || !("actionId" in candidate)
      ) return slot;
      const actionId = ALL_QUICK_MENU_ACTION_IDS.find((action) => action === candidate.actionId);
      return actionId ? { index, actionId, labelKo: QUICK_MENU_ACTION_LABELS_KO[actionId] } : slot;
    });
  } catch {
    return defaults;
  }
}

export function saveRadialQuickMenuExtraSlots(
  slots: readonly StudioRadialQuickWheelSlot[],
  resolveStorage: StorageResolver = browserStorage,
): boolean {
  if (slots.length !== 8) return false;
  const extraSlots = slots.slice(6, 8);
  if (extraSlots.some((slot) => !ALL_QUICK_MENU_ACTION_IDS.includes(slot.actionId))) return false;
  return writeBrowserPreference(
    resolveStorage,
    RADIAL_QUICK_MENU_EXTRA_STORAGE_KEY,
    JSON.stringify(extraSlots.map((slot, index) => ({ index: index + 6, actionId: slot.actionId }))),
  );
}
