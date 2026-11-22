/**
 * 커스텀 단축키 프로필 · 충돌 감지기 · JSON 직렬화/역직렬화 엔진.
 *
 * - Studio 단축키 맵(`STUDIO_SHORTCUT_ACTIONS`)과 5개 상황별 8방향 퀵 다이얼 슬롯 구성을
 *   단일 버전 관리 프로필(`schemaVersion: 1`)로 묶어 관리한다.
 * - 단축키 간 중복 충돌, 퀵 다이얼 호출키 충돌, 브라우저 예약 단축키 경고를 분리 감지하고
 *   원클릭 자동 정리와 안전한 JSON 내보내기/가져오기를 제공한다.
 */

import {
  STUDIO_SHORTCUT_ACTIONS,
  defaultStudioShortcuts,
  formatStudioShortcutChord,
  normalizeStudioShortcutChordKey,
  type StudioShortcutActionId,
} from "../studio-app-settings";
import {
  DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS,
  RADIAL_DIAL_CONTEXT_IDS,
  RADIAL_DIAL_DEFAULT_DEADZONE_PX,
  RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG,
  RADIAL_DIAL_SECTOR_COUNT,
  cloneDefaultRadialDialContextSlots,
  isRadialDialActionId,
  type RadialDialActionId,
  type RadialDialContextId,
} from "./studio-radial-quick-dial-engine";
import { autoResolveStudioShortcutConflicts } from "./studio-shortcut-conflict-guide";
import type { ShortcutCommandBinding } from "../workspace-layout/shortcut-bindings";

export const STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION = 1 as const;
export const STUDIO_SHORTCUT_PROFILE_MAX_BYTES = 100_000 as const;
export const DEFAULT_RADIAL_DIAL_TRIGGER_SHORTCUT = "Alt+Q" as const;
export const STUDIO_SHORTCUT_PROFILE_APPLIED_EVENT = "toonstudio:shortcut-profile-applied" as const;

export interface StudioShortcutAndDialProfile {
  readonly schemaVersion: typeof STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly descriptionKo: string;
  readonly updatedAtIso: string;
  readonly shortcuts: Readonly<Record<StudioShortcutActionId, string>>;
  readonly dialTriggerShortcut: string;
  readonly dialDeadzonePx: number;
  readonly dialHysteresisDeg: number;
  readonly dialContexts: Readonly<Record<RadialDialContextId, readonly RadialDialActionId[]>>;
}

export type ShortcutConflictScope = "shortcut" | "dial-trigger" | "browser-reserved";
export type ShortcutConflictSeverity = "error" | "warning";

export interface ShortcutConflictEntry {
  readonly scope: ShortcutConflictScope;
  readonly id: string;
  readonly labelKo: string;
}

export interface ShortcutProfileConflictItem {
  readonly chordKey: string;
  readonly displayChord: string;
  readonly severity: ShortcutConflictSeverity;
  readonly reasonKo: string;
  readonly entries: readonly ShortcutConflictEntry[];
}

export interface ShortcutProfileConflictReport {
  readonly items: readonly ShortcutProfileConflictItem[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly hasBlockingConflicts: boolean;
  readonly conflictedActionIds: ReadonlySet<string>;
}

export type ShortcutProfileImportErrorCode =
  | "empty-input"
  | "payload-too-large"
  | "invalid-json"
  | "invalid-root"
  | "unsupported-version";

export type ShortcutProfileImportResult =
  | {
      readonly ok: true;
      readonly profile: StudioShortcutAndDialProfile;
      readonly conflicts: ShortcutProfileConflictReport;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly errorCode: ShortcutProfileImportErrorCode;
      readonly errorMessageKo: string;
    };

export interface ShortcutProfileDiffSummary {
  readonly changedShortcutIds: readonly StudioShortcutActionId[];
  readonly dialTriggerChanged: boolean;
  readonly dialDeadzoneChanged: boolean;
  readonly dialHysteresisChanged: boolean;
  readonly changedDialSlots: readonly {
    readonly contextId: RadialDialContextId;
    readonly slotIndex: number;
    readonly before: RadialDialActionId;
    readonly after: RadialDialActionId;
  }[];
  readonly totalChanges: number;
}

const ACTION_LABEL_BY_ID: ReadonlyMap<StudioShortcutActionId, string> = new Map(
  STUDIO_SHORTCUT_ACTIONS.map((action) => [action.id, action.label] as const),
);

const STUDIO_SHORTCUT_ACTION_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_SHORTCUT_ACTIONS.map((action) => action.id),
);

const BROWSER_RESERVED_CHORDS: ReadonlyMap<string, string> = new Map([
  ["Mod+W", "브라우저 탭 닫기와 겹쳐 작업 창이 닫힐 수 있습니다."],
  ["Mod+T", "브라우저 새 탭 열기와 겹칠 수 있습니다."],
  ["Mod+N", "브라우저 새 창 열기와 겹칠 수 있습니다."],
  ["Mod+R", "브라우저 새로고침과 겹칠 수 있습니다."],
  ["F5", "브라우저 새로고침과 겹칠 수 있습니다."],
]);

const DIAL_TRIGGER_FALLBACK_CANDIDATES: readonly string[] = Object.freeze([
  "Alt+Q",
  "Alt+Shift+D",
  "Alt+Shift+W",
  "Shift+Q",
  "Alt+D",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 프로필 내 단축키 화음을 표준형(`Mod+Shift+Alt+Key`)으로 정규화한다. 빈 입력은 `""`. */
export function normalizeProfileShortcutChord(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // "Ctrl++" 처럼 마지막 키가 "+" 자체인 단축키도 안전하게 보존한다.
  if (trimmed.endsWith("++")) {
    const prefix = trimmed.slice(0, -2);
    const prefixKey = prefix ? normalizeStudioShortcutChordKey(`${prefix}+A`) : null;
    if (prefixKey) {
      return `${prefixKey.slice(0, -1)}+`;
    }
    return "+";
  }
  const normalized = normalizeStudioShortcutChordKey(trimmed);
  return normalized ?? trimmed;
}

export function createDefaultShortcutAndDialProfile(
  overrides?: Partial<
    Pick<
      StudioShortcutAndDialProfile,
      | "id"
      | "name"
      | "descriptionKo"
      | "updatedAtIso"
      | "dialTriggerShortcut"
      | "dialDeadzonePx"
      | "dialHysteresisDeg"
    >
  > & {
    readonly shortcutOverrides?: Partial<Record<StudioShortcutActionId, string>>;
    readonly dialContexts?: Partial<Record<RadialDialContextId, readonly RadialDialActionId[]>>;
  },
): StudioShortcutAndDialProfile {
  const baseShortcuts = defaultStudioShortcuts();
  const mergedShortcuts: Record<StudioShortcutActionId, string> = { ...baseShortcuts };
  if (overrides?.shortcutOverrides) {
    for (const action of STUDIO_SHORTCUT_ACTIONS) {
      const candidate = overrides.shortcutOverrides[action.id];
      if (typeof candidate === "string") {
        mergedShortcuts[action.id] = normalizeProfileShortcutChord(candidate);
      }
    }
  }

  const baseContexts = cloneDefaultRadialDialContextSlots();
  if (overrides?.dialContexts) {
    for (const contextId of RADIAL_DIAL_CONTEXT_IDS) {
      const custom = overrides.dialContexts[contextId];
      if (Array.isArray(custom) && custom.length === RADIAL_DIAL_SECTOR_COUNT) {
        baseContexts[contextId] = Object.freeze(
          custom.map((item, idx) =>
            isRadialDialActionId(item)
              ? item
              : DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId][idx] ?? "undo",
          ),
        );
      }
    }
  }

  return Object.freeze({
    schemaVersion: STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION,
    id: overrides?.id?.trim() || "toonstudio-balanced",
    name: overrides?.name?.trim() || "툰스튜디오 표준",
    descriptionKo:
      overrides?.descriptionKo?.trim() ||
      "기본 단축키와 5개 작업 상황별 8방향 퀵 다이얼 표준 구성입니다.",
    updatedAtIso: overrides?.updatedAtIso ?? "2026-11-22T00:00:00.000Z",
    shortcuts: Object.freeze(mergedShortcuts),
    dialTriggerShortcut: normalizeProfileShortcutChord(
      overrides?.dialTriggerShortcut ?? DEFAULT_RADIAL_DIAL_TRIGGER_SHORTCUT,
    ),
    dialDeadzonePx: clampInt(overrides?.dialDeadzonePx, RADIAL_DIAL_DEFAULT_DEADZONE_PX, 12, 48),
    dialHysteresisDeg: clampInt(
      overrides?.dialHysteresisDeg,
      RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG,
      0,
      12,
    ),
    dialContexts: Object.freeze(baseContexts),
  });
}

export const BUILTIN_SHORTCUT_AND_DIAL_PROFILES: readonly StudioShortcutAndDialProfile[] =
  Object.freeze([
    createDefaultShortcutAndDialProfile(),
    createDefaultShortcutAndDialProfile({
      id: "webtoon-inking-speed",
      name: "선화 집중 속도형",
      descriptionKo: "펜·지우개·투명색·좌우 반전을 왼손 중심에 모으고 데드존 18px로 빠르게 선택합니다.",
      shortcutOverrides: {
        "tool-pen": "P",
        "tool-pixel": "B",
        "toggle-transparent-color": "C",
        "tool-crop": "Shift+C",
      },
      dialTriggerShortcut: "Alt+Q",
      dialDeadzonePx: 18,
      dialHysteresisDeg: 6,
      dialContexts: {
        inking: [
          "undo",
          "correct-current-stroke",
          "cycle-stabilizer",
          "toggle-transparent-color",
          "flip-canvas",
          "tool-eraser",
          "toggle-perspective-snap",
          "new-layer",
        ],
      },
    }),
    createDefaultShortcutAndDialProfile({
      id: "tablet-one-hand",
      name: "태블릿·한손 제스처",
      descriptionKo: "펜·터치 오작동을 줄이기 위해 데드존 22px와 넓은 경계 여유각을 적용합니다.",
      shortcutOverrides: {
        "flip-canvas": "H",
        "brush-smaller": "[",
        "brush-larger": "]",
      },
      dialTriggerShortcut: "Alt+Q",
      dialDeadzonePx: 22,
      dialHysteresisDeg: 7,
      dialContexts: {
        drawing: [
          "undo",
          "redo",
          "brush-larger",
          "brush-smaller",
          "flip-canvas",
          "tool-eyedropper",
          "tool-eraser",
          "tool-fill",
        ],
      },
    }),
  ]);

/**
 * 커스텀 단축키 프로필의 모든 충돌(중복 단축키·다이얼 트리거 충돌·브라우저 예약키 경고)을 감지한다.
 */
export function detectShortcutProfileConflicts(
  profile: Pick<StudioShortcutAndDialProfile, "shortcuts" | "dialTriggerShortcut">,
): ShortcutProfileConflictReport {
  const byChord = new Map<string, ShortcutConflictEntry[]>();

  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const raw = profile.shortcuts[action.id];
    if (typeof raw !== "string") continue;
    const normalized = normalizeProfileShortcutChord(raw);
    if (!normalized) continue;
    const bucket = byChord.get(normalized) ?? [];
    bucket.push({
      scope: "shortcut",
      id: action.id,
      labelKo: ACTION_LABEL_BY_ID.get(action.id) ?? action.id,
    });
    byChord.set(normalized, bucket);
  }

  const triggerChord = normalizeProfileShortcutChord(profile.dialTriggerShortcut);
  if (triggerChord) {
    const bucket = byChord.get(triggerChord) ?? [];
    bucket.push({
      scope: "dial-trigger",
      id: "radial-quick-dial",
      labelKo: "8방향 퀵 다이얼 열기",
    });
    byChord.set(triggerChord, bucket);
  }

  const items: ShortcutProfileConflictItem[] = [];
  const conflictedActionIds = new Set<string>();

  for (const [chordKey, entries] of byChord) {
    if (entries.length > 1) {
      const hasDialTrigger = entries.some((entry) => entry.scope === "dial-trigger");
      for (const entry of entries) {
        conflictedActionIds.add(entry.id);
      }
      items.push({
        chordKey,
        displayChord: formatStudioShortcutChord(chordKey),
        severity: "error",
        reasonKo: hasDialTrigger
          ? "8방향 퀵 다이얼 호출키가 기존 단축키와 겹칩니다."
          : `${entries.length}개 명령이 같은 단축키에 배정되어 뒤쪽 명령이 실행되지 않습니다.`,
        entries: Object.freeze([...entries]),
      });
    }

    const browserReason = BROWSER_RESERVED_CHORDS.get(chordKey);
    if (browserReason) {
      items.push({
        chordKey,
        displayChord: formatStudioShortcutChord(chordKey),
        severity: "warning",
        reasonKo: browserReason,
        entries: Object.freeze([
          ...entries,
          { scope: "browser-reserved", id: "browser", labelKo: "브라우저 기본 단축키" },
        ]),
      });
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const item of items) {
    if (item.severity === "error") errorCount += 1;
    else warningCount += 1;
  }

  return Object.freeze({
    items: Object.freeze(items),
    errorCount,
    warningCount,
    hasBlockingConflicts: errorCount > 0,
    conflictedActionIds,
  });
}

/**
 * 프로필의 단축키 중복과 퀵 다이얼 트리거 충돌을 결정적으로 자동 정리한다.
 */
export function autoResolveShortcutProfileConflicts(
  profile: StudioShortcutAndDialProfile,
): StudioShortcutAndDialProfile {
  const resolvedShortcuts = autoResolveStudioShortcutConflicts({
    ...defaultStudioShortcuts(),
    ...profile.shortcuts,
  });

  const occupied = new Set<string>();
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const normalized = normalizeProfileShortcutChord(resolvedShortcuts[action.id] ?? "");
    if (normalized) occupied.add(normalized);
  }

  let nextTrigger = normalizeProfileShortcutChord(profile.dialTriggerShortcut);
  if (nextTrigger && occupied.has(nextTrigger)) {
    const fallback = DIAL_TRIGGER_FALLBACK_CANDIDATES.find(
      (candidate) => !occupied.has(normalizeProfileShortcutChord(candidate)),
    );
    nextTrigger = fallback ? normalizeProfileShortcutChord(fallback) : "";
  }

  return Object.freeze({
    ...profile,
    shortcuts: Object.freeze(resolvedShortcuts),
    dialTriggerShortcut: nextTrigger,
  });
}

/** 프로필을 검증된 표준 JSON 문자열(`schemaVersion: 1`)로 직렬화한다. */
export function exportShortcutProfileToJson(
  profile: StudioShortcutAndDialProfile,
  options: { readonly pretty?: boolean } = {},
): string {
  const normalizedShortcuts: Record<string, string> = {};
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    normalizedShortcuts[action.id] = normalizeProfileShortcutChord(
      profile.shortcuts[action.id] ?? "",
    );
  }
  const normalizedContexts: Record<RadialDialContextId, readonly RadialDialActionId[]> = {
    drawing: profile.dialContexts.drawing.slice(0, RADIAL_DIAL_SECTOR_COUNT),
    inking: profile.dialContexts.inking.slice(0, RADIAL_DIAL_SECTOR_COUNT),
    bg3d: profile.dialContexts.bg3d.slice(0, RADIAL_DIAL_SECTOR_COUNT),
    lettering: profile.dialContexts.lettering.slice(0, RADIAL_DIAL_SECTOR_COUNT),
    review: profile.dialContexts.review.slice(0, RADIAL_DIAL_SECTOR_COUNT),
  };

  const payload = {
    schemaVersion: STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION,
    id: profile.id.trim() || "custom-profile",
    name: profile.name.trim() || "사용자 단축키 프로필",
    descriptionKo: profile.descriptionKo.trim(),
    updatedAtIso: profile.updatedAtIso,
    dialTriggerShortcut: normalizeProfileShortcutChord(profile.dialTriggerShortcut),
    dialDeadzonePx: clampInt(profile.dialDeadzonePx, RADIAL_DIAL_DEFAULT_DEADZONE_PX, 12, 48),
    dialHysteresisDeg: clampInt(
      profile.dialHysteresisDeg,
      RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG,
      0,
      12,
    ),
    shortcuts: normalizedShortcuts,
    dialContexts: normalizedContexts,
  };

  return JSON.stringify(payload, null, options.pretty === false ? undefined : 2);
}

/**
 * JSON 문자열에서 단축키·8방향 퀵 다이얼 프로필을 엄격히 역직렬화하고 충돌·경고를 함께 반환한다.
 */
export function importShortcutProfileFromJson(rawJson: string): ShortcutProfileImportResult {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return {
      ok: false,
      errorCode: "empty-input",
      errorMessageKo: "가져올 프로필 JSON 내용이 비어 있습니다.",
    };
  }
  if (trimmed.length > STUDIO_SHORTCUT_PROFILE_MAX_BYTES) {
    return {
      ok: false,
      errorCode: "payload-too-large",
      errorMessageKo: "프로필 JSON 크기가 허용 한도(100KB)를 넘었습니다.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      ok: false,
      errorCode: "invalid-json",
      errorMessageKo: "JSON 형식이 올바르지 않습니다. 쉼표와 괄호를 확인해 주세요.",
    };
  }

  if (!isPlainRecord(parsed)) {
    return {
      ok: false,
      errorCode: "invalid-root",
      errorMessageKo: "프로필 JSON 최상위 구조가 객체가 아닙니다.",
    };
  }

  if (parsed.schemaVersion !== STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      errorCode: "unsupported-version",
      errorMessageKo: `지원하지 않는 프로필 버전(${String(parsed.schemaVersion ?? "없음")})입니다. 버전 ${STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION} 형식만 가져올 수 있습니다.`,
    };
  }

  const warnings: string[] = [];
  const defaults = defaultStudioShortcuts();
  const shortcuts: Record<StudioShortcutActionId, string> = { ...defaults };

  if (isPlainRecord(parsed.shortcuts)) {
    for (const [key, value] of Object.entries(parsed.shortcuts)) {
      if (!STUDIO_SHORTCUT_ACTION_ID_SET.has(key)) {
        warnings.push(`알 수 없는 단축키 동작(${key})을 건너뛰었습니다.`);
        continue;
      }
      if (typeof value !== "string") {
        warnings.push(`단축키(${key}) 값이 문자열이 아니어서 기본값으로 복구했습니다.`);
        continue;
      }
      shortcuts[key as StudioShortcutActionId] = normalizeProfileShortcutChord(value);
    }
  } else if (parsed.shortcuts !== undefined) {
    warnings.push("단축키 목록 형식이 올바르지 않아 기본 단축키로 복구했습니다.");
  }

  const dialContexts = cloneDefaultRadialDialContextSlots();
  if (isPlainRecord(parsed.dialContexts)) {
    for (const contextId of RADIAL_DIAL_CONTEXT_IDS) {
      const rawSlots = parsed.dialContexts[contextId];
      if (rawSlots === undefined) continue;
      if (!Array.isArray(rawSlots)) {
        warnings.push(`${contextId} 퀵 다이얼 슬롯 형식이 손상되어 기본 프리셋을 사용했습니다.`);
        continue;
      }
      const nextSlots: RadialDialActionId[] = [];
      let repairedCount = 0;
      for (let i = 0; i < RADIAL_DIAL_SECTOR_COUNT; i += 1) {
        const candidate = rawSlots[i];
        if (isRadialDialActionId(candidate)) {
          nextSlots.push(candidate);
        } else {
          repairedCount += 1;
          nextSlots.push(DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId][i] ?? "undo");
        }
      }
      if (repairedCount > 0) {
        warnings.push(`${contextId} 퀵 다이얼의 비정상 슬롯 ${repairedCount}건을 기본 동작으로 채웠습니다.`);
      }
      dialContexts[contextId] = Object.freeze(nextSlots);
    }
  }

  const profile: StudioShortcutAndDialProfile = Object.freeze({
    schemaVersion: STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION,
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id.trim().slice(0, 64)
        : "imported-profile",
    name:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim().slice(0, 64)
        : "가져온 프로필",
    descriptionKo:
      typeof parsed.descriptionKo === "string"
        ? parsed.descriptionKo.trim().slice(0, 200)
        : "JSON에서 가져온 커스텀 단축키·8방향 다이얼 프로필입니다.",
    updatedAtIso:
      typeof parsed.updatedAtIso === "string" && parsed.updatedAtIso.trim().length > 0
        ? parsed.updatedAtIso.trim()
        : new Date().toISOString(),
    shortcuts: Object.freeze(shortcuts),
    dialTriggerShortcut:
      typeof parsed.dialTriggerShortcut === "string"
        ? normalizeProfileShortcutChord(parsed.dialTriggerShortcut)
        : DEFAULT_RADIAL_DIAL_TRIGGER_SHORTCUT,
    dialDeadzonePx: clampInt(parsed.dialDeadzonePx, RADIAL_DIAL_DEFAULT_DEADZONE_PX, 12, 48),
    dialHysteresisDeg: clampInt(
      parsed.dialHysteresisDeg,
      RADIAL_DIAL_DEFAULT_HYSTERESIS_DEG,
      0,
      12,
    ),
    dialContexts: Object.freeze(dialContexts),
  });

  const conflicts = detectShortcutProfileConflicts(profile);
  return {
    ok: true,
    profile,
    conflicts,
    warnings: Object.freeze(warnings),
  };
}

/** 두 프로필 간 변경된 단축키와 8방향 다이얼 슬롯을 비교 요약한다. */
export function diffShortcutProfiles(
  baseProfile: StudioShortcutAndDialProfile,
  nextProfile: StudioShortcutAndDialProfile,
): ShortcutProfileDiffSummary {
  const changedShortcutIds: StudioShortcutActionId[] = [];
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const before = normalizeProfileShortcutChord(baseProfile.shortcuts[action.id] ?? "");
    const after = normalizeProfileShortcutChord(nextProfile.shortcuts[action.id] ?? "");
    if (before !== after) {
      changedShortcutIds.push(action.id);
    }
  }

  const dialTriggerChanged =
    normalizeProfileShortcutChord(baseProfile.dialTriggerShortcut) !==
    normalizeProfileShortcutChord(nextProfile.dialTriggerShortcut);
  const dialDeadzoneChanged = baseProfile.dialDeadzonePx !== nextProfile.dialDeadzonePx;
  const dialHysteresisChanged = baseProfile.dialHysteresisDeg !== nextProfile.dialHysteresisDeg;

  const changedDialSlots: {
    readonly contextId: RadialDialContextId;
    readonly slotIndex: number;
    readonly before: RadialDialActionId;
    readonly after: RadialDialActionId;
  }[] = [];

  for (const contextId of RADIAL_DIAL_CONTEXT_IDS) {
    const beforeSlots = baseProfile.dialContexts[contextId];
    const afterSlots = nextProfile.dialContexts[contextId];
    for (let i = 0; i < RADIAL_DIAL_SECTOR_COUNT; i += 1) {
      const before = beforeSlots[i] ?? DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId][i] ?? "undo";
      const after = afterSlots[i] ?? DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[contextId][i] ?? "undo";
      if (before !== after) {
        changedDialSlots.push({ contextId, slotIndex: i, before, after });
      }
    }
  }

  const totalChanges =
    changedShortcutIds.length +
    changedDialSlots.length +
    (dialTriggerChanged ? 1 : 0) +
    (dialDeadzoneChanged ? 1 : 0) +
    (dialHysteresisChanged ? 1 : 0);

  return Object.freeze({
    changedShortcutIds: Object.freeze(changedShortcutIds),
    dialTriggerChanged,
    dialDeadzoneChanged,
    dialHysteresisChanged,
    changedDialSlots: Object.freeze(changedDialSlots),
    totalChanges,
  });
}

const COMMAND_ID_TO_STUDIO_ACTION: Readonly<Record<string, StudioShortcutActionId>> = {
  undo: "undo",
  redo: "redo",
  brush: "tool-pen",
  eraser: "tool-eraser",
  fill: "tool-fill",
};

/** `ShortcutCustomizer`의 간이 바인딩 배열을 통합 단축키 프로필로 반영한다. */
export function bridgeBindingsToShortcutProfile(
  bindings: readonly ShortcutCommandBinding[],
  baseProfile: StudioShortcutAndDialProfile,
): StudioShortcutAndDialProfile {
  const nextShortcuts: Record<StudioShortcutActionId, string> = {
    ...baseProfile.shortcuts,
  };
  for (const binding of bindings) {
    const actionId = COMMAND_ID_TO_STUDIO_ACTION[binding.commandId];
    if (!actionId) continue;
    nextShortcuts[actionId] = normalizeProfileShortcutChord(binding.keys);
  }
  return Object.freeze({
    ...baseProfile,
    shortcuts: Object.freeze(nextShortcuts),
  });
}

/** 통합 단축키 프로필에서 `ShortcutCustomizer` 테이블 바인딩 배열을 갱신한다. */
export function extractShortcutBindingsFromProfile(
  profile: StudioShortcutAndDialProfile,
  baseBindings: readonly ShortcutCommandBinding[],
): ShortcutCommandBinding[] {
  return baseBindings.map((binding) => {
    const actionId = COMMAND_ID_TO_STUDIO_ACTION[binding.commandId];
    if (!actionId) return { ...binding };
    const chord = profile.shortcuts[actionId] ?? "";
    const displayForTable = chord.replace(/^Mod\+/u, "Ctrl+");
    return {
      ...binding,
      keys: displayForTable,
    };
  });
}

/** 변경된 프로필을 동일 탭의 8방향 퀵 다이얼 호스트로 전파한다. */
export function dispatchShortcutProfileApplied(profile: StudioShortcutAndDialProfile): void {
  try {
    if (typeof CustomEvent === "function" && typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(
        new CustomEvent(STUDIO_SHORTCUT_PROFILE_APPLIED_EVENT, { detail: profile }),
      );
    }
  } catch {
    // SSR 또는 최소 테스트 환경에서는 이벤트 전파를 건너뛴다.
  }
}
