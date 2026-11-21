import {
  assignQuickMenuSlot,
  DEFAULT_QUICK_MENU_SLOTS,
  QUICK_MENU_ACTION_LABELS_KO,
  type QuickMenuActionId,
  type QuickMenuSlot,
} from "./studio-quickmenu-and-quickshape";
import { hydrateStudioPreference } from "../studio-cuttoon-editor/runtime/studio-preference-hydration";

export const QUICK_MENU_STORAGE_KEY = "toonstudio.quick-menu-slots.v1";

export const ALL_QUICK_MENU_ACTION_IDS: readonly QuickMenuActionId[] = Object.freeze(
  Object.keys(QUICK_MENU_ACTION_LABELS_KO) as QuickMenuActionId[],
);

const VALID_ACTION_SET = new Set<string>(ALL_QUICK_MENU_ACTION_IDS);

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeQuickMenuSlots(raw: unknown): readonly QuickMenuSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_QUICK_MENU_SLOTS;
  }
  let next: readonly QuickMenuSlot[] = DEFAULT_QUICK_MENU_SLOTS;
  for (let idx = 0; idx < 6; idx += 1) {
    const candidate = raw[idx] as Partial<QuickMenuSlot> | undefined;
    if (candidate && typeof candidate.actionId === "string" && VALID_ACTION_SET.has(candidate.actionId)) {
      next = assignQuickMenuSlot(
        next,
        idx as QuickMenuSlot["index"],
        candidate.actionId as QuickMenuActionId,
      );
    }
  }
  return next;
}

export function loadQuickMenuSlots(storage: StorageLike | null = defaultStorage()): readonly QuickMenuSlot[] {
  if (!storage) return DEFAULT_QUICK_MENU_SLOTS;
  try {
    const raw = storage.getItem(QUICK_MENU_STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_MENU_SLOTS;
    return normalizeQuickMenuSlots(JSON.parse(raw));
  } catch {
    return DEFAULT_QUICK_MENU_SLOTS;
  }
}

export function saveQuickMenuSlots(
  slots: readonly QuickMenuSlot[],
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const normalized = normalizeQuickMenuSlots(slots);
    storage.setItem(
      QUICK_MENU_STORAGE_KEY,
      JSON.stringify(normalized.map((slot) => ({ index: slot.index, actionId: slot.actionId }))),
    );
    return true;
  } catch {
    return false;
  }
}

export async function hydrateQuickMenuSlots(options: {
  readonly storage?: StorageLike | null;
  readonly revisionUnchanged: () => boolean;
  readonly applySaved: (slots: readonly QuickMenuSlot[]) => void;
  readonly getCurrent: () => readonly QuickMenuSlot[];
}): Promise<boolean> {
  const storage = options.storage !== undefined ? options.storage : defaultStorage();
  const [result] = await Promise.allSettled([
    Promise.resolve().then(() => loadQuickMenuSlots(storage)),
  ]);
  return hydrateStudioPreference(
    result!,
    options.revisionUnchanged(),
    options.applySaved,
    async () => {
      saveQuickMenuSlots(options.getCurrent(), storage);
    },
  );
}
