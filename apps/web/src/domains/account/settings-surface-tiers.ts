/**
 * Settings surface tiers — which settings a person touches every day, and which
 * ones are rare or destructive enough to start folded behind one disclosure.
 *
 * Daily settings render immediately. Advanced groups render only after the user
 * opens their disclosure (or arrives through search / a deep link that targets
 * them). Folding never removes a setting: every advanced group stays reachable
 * from its tab, from settings search, and from its existing anchors.
 */

export type SettingsSurfaceTier = "daily" | "advanced";

export interface SettingsAdvancedGroup {
  readonly id: string;
  /** Settings tab that owns the group. */
  readonly tab: "display" | "data" | "account";
  /** In-page anchors whose targets live inside this group. */
  readonly anchors: readonly string[];
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
}

export const SETTINGS_ADVANCED_GROUPS: readonly SettingsAdvancedGroup[] = [
  {
    id: "display-advanced",
    tab: "display",
    anchors: ["#settings-ambient", "#settings-nextgen"],
    title: ["고급 설정", "Advanced settings"],
    description: [
      "앰비언트·실험 기능처럼 가끔만 바꾸는 설정이에요.",
      "Settings you rarely change, like ambient effects and experiments.",
    ],
  },
  {
    id: "data-advanced",
    tab: "data",
    anchors: ["#settings-data"],
    title: ["기록 정리와 초기화", "History cleanup & reset"],
    description: [
      "지우기처럼 가끔만 필요하고, 누르기 전에 한 번 더 확인하는 설정이에요.",
      "Rare, destructive actions that ask once more before they run.",
    ],
  },
  {
    id: "account-advanced",
    tab: "account",
    anchors: ["#account-security"],
    title: ["연동 계정·계정 병합", "Linked accounts & merge"],
    description: [
      "다른 로그인 연결과 계정 병합처럼 드물게 쓰는 설정이에요.",
      "Linking other sign-ins and merging accounts — rarely used.",
    ],
  },
];

const GROUP_BY_ID = new Map(SETTINGS_ADVANCED_GROUPS.map((group) => [group.id, group]));

/**
 * Tier of a single in-page settings section anchor; unlisted anchors are daily.
 * Only the ambient / next-gen sections are advanced as a whole — the data and
 * account sections are daily sections that merely contain an advanced group,
 * so their anchors stay daily and reveal goes through the search mapping below.
 */
export function settingsSectionTier(anchor: string): SettingsSurfaceTier {
  return SETTINGS_ADVANCED_DEEP_LINK_ANCHORS.includes(anchor) ? "advanced" : "daily";
}

/** The advanced group a search entry must reveal before navigating, if any. */
export function settingsRevealGroupForEntry(entryKey: string): string | null {
  switch (entryKey) {
    case "ambient":
    case "nextgen":
      return "display-advanced";
    case "data":
      return "data-advanced";
    case "account":
      return "account-advanced";
    default:
      return null;
  }
}

export function settingsAdvancedGroup(id: string): SettingsAdvancedGroup | null {
  return GROUP_BY_ID.get(id) ?? null;
}

/** Anchors that live inside an advanced group and therefore start open on deep link. */
export const SETTINGS_ADVANCED_DEEP_LINK_ANCHORS: readonly string[] = [
  "#settings-ambient",
  "#settings-nextgen",
];

export const SETTINGS_ADVANCED_OPEN_STORAGE_KEY = "toonstudio-settings-advanced-open:v1";

export interface SettingsKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeSettingsAdvancedOpen(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && GROUP_BY_ID.has(id)))];
}

export function loadSettingsAdvancedOpen(
  storage: SettingsKeyValueStorage | null | undefined,
): readonly string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SETTINGS_ADVANCED_OPEN_STORAGE_KEY);
    return raw ? normalizeSettingsAdvancedOpen(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveSettingsAdvancedOpen(
  storage: SettingsKeyValueStorage | null | undefined,
  open: readonly string[],
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      SETTINGS_ADVANCED_OPEN_STORAGE_KEY,
      JSON.stringify(normalizeSettingsAdvancedOpen(open)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Initial open set: what the user left open, plus the group that owns a deep-link
 * anchor when the page is opened directly at an advanced section.
 */
export function initialSettingsAdvancedOpen(
  storage: SettingsKeyValueStorage | null | undefined,
  locationHash: string,
): readonly string[] {
  const open = new Set(loadSettingsAdvancedOpen(storage));
  if (SETTINGS_ADVANCED_DEEP_LINK_ANCHORS.includes(locationHash)) {
    open.add("display-advanced");
  }
  return [...open];
}

export function toggleSettingsAdvancedGroup(
  open: readonly string[],
  groupId: string,
): readonly string[] {
  if (!GROUP_BY_ID.has(groupId)) return open;
  return open.includes(groupId)
    ? open.filter((id) => id !== groupId)
    : [...open, groupId];
}
