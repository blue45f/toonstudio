/**
 * Studio Quick Actions — 모바일 롱프레스·펜 버튼에서 여는 6방향 퀵 메뉴의 순수 모델.
 *
 * UI와 DOM에 의존하지 않으며, 저장소도 주입받는다. 따라서 SSR·저장소 차단 환경에서도
 * 안전하고 포인터 방향 판정과 화면 경계 보정을 결정적으로 테스트할 수 있다.
 */

export const QUICK_ACTION_SLOTS = [
  "north",
  "northEast",
  "southEast",
  "south",
  "southWest",
  "northWest",
] as const;

export type StudioQuickActionSlot = (typeof QUICK_ACTION_SLOTS)[number];

export const QUICK_ACTION_IDS = [
  "undo",
  "redo",
  "select",
  "pen",
  "eraser",
  "eyedropper",
  "properties",
  "duplicate",
  "delete",
  "bring-front",
  "fit-width",
  "add-bubble",
  "advanced-fill",
  "quick-mask",
  "wet-mix",
  "dodge-burn",
] as const;

export type StudioQuickActionId = (typeof QUICK_ACTION_IDS)[number];

export const QUICK_ACTION_OCTANT_SLOTS = [
  "north",
  "northEast",
  "east",
  "southEast",
  "south",
  "southWest",
  "west",
  "northWest",
] as const;

export type StudioQuickActionOctantSlot = (typeof QUICK_ACTION_OCTANT_SLOTS)[number];

export interface StudioQuickActionsPreferences {
  version: 1;
  slots: Record<StudioQuickActionSlot, StudioQuickActionId>;
  /** 선택적 8방향(45° 섹터) 확장 슬롯 매핑. */
  octantSlots?: Record<StudioQuickActionOctantSlot, StudioQuickActionId>;
  /** 각 6방향 섹터 바깥 링에 배치되는 중첩 서브링 액션 목록(최대 3개). */
  subRings?: Partial<Record<StudioQuickActionSlot, readonly StudioQuickActionId[]>>;
}

export interface StudioQuickActionsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioQuickActionsPoint {
  x: number;
  y: number;
}

export interface StudioQuickActionsViewport {
  width: number;
  height: number;
}

export interface StudioQuickActionsClampOptions {
  /** 중심에서 메뉴 외곽까지 확보할 거리. */
  radius?: number;
  /** 뷰포트 가장자리와 메뉴 외곽 사이의 추가 여백. */
  margin?: number;
  /** 모바일 하단 도구막대·safe-area처럼 사용할 수 없는 아래쪽 높이. */
  bottomInset?: number;
}

export const STUDIO_QUICK_ACTIONS_STORAGE_KEY = "toonstudio-studio-quick-actions:v1";

export const DEFAULT_STUDIO_QUICK_ACTIONS: StudioQuickActionsPreferences = {
  version: 1,
  slots: {
    north: "undo",
    northEast: "redo",
    southEast: "select",
    south: "pen",
    southWest: "eraser",
    northWest: "eyedropper",
  },
};

const QUICK_ACTION_ID_SET = new Set<string>(QUICK_ACTION_IDS);

function copyDefaultPreferences(): StudioQuickActionsPreferences {
  return {
    version: 1,
    slots: { ...DEFAULT_STUDIO_QUICK_ACTIONS.slots },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuickActionId(value: unknown): value is StudioQuickActionId {
  return typeof value === "string" && QUICK_ACTION_ID_SET.has(value);
}

/**
 * JSON 문자열 또는 역직렬화 객체를 v1 환경설정으로 정규화한다.
 *
 * 버전이 다르거나 루트가 손상되면 전체 기본값을 사용한다. v1 슬롯 객체는 필드 단위로
 * 복구하므로 한 슬롯의 손상 때문에 나머지 사용자 지정을 잃지 않는다. 같은 액션을 여러
 * 슬롯에 배치하는 설정도 의도적으로 그대로 보존한다.
 */
export function normalizeStudioQuickActionsPreferences(raw: unknown): StudioQuickActionsPreferences {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return copyDefaultPreferences();
    }
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.slots)) {
    return copyDefaultPreferences();
  }

  const slots = { ...DEFAULT_STUDIO_QUICK_ACTIONS.slots };
  for (const slot of QUICK_ACTION_SLOTS) {
    const action = parsed.slots[slot];
    if (isQuickActionId(action)) slots[slot] = action;
  }

  let octantSlots: Record<StudioQuickActionOctantSlot, StudioQuickActionId> | undefined;
  if (isRecord(parsed.octantSlots)) {
    const fallbackOctants: Record<StudioQuickActionOctantSlot, StudioQuickActionId> = {
      north: slots.north, northEast: slots.northEast, east: "properties", southEast: slots.southEast,
      south: slots.south, southWest: slots.southWest, west: "add-bubble", northWest: slots.northWest,
    };
    for (const octant of QUICK_ACTION_OCTANT_SLOTS) {
      const candidate = parsed.octantSlots[octant];
      if (isQuickActionId(candidate)) fallbackOctants[octant] = candidate;
    }
    octantSlots = fallbackOctants;
  }

  let subRings: Partial<Record<StudioQuickActionSlot, readonly StudioQuickActionId[]>> | undefined;
  if (isRecord(parsed.subRings)) {
    const collected: Partial<Record<StudioQuickActionSlot, readonly StudioQuickActionId[]>> = {};
    for (const slot of QUICK_ACTION_SLOTS) {
      const candidate = parsed.subRings[slot];
      if (!Array.isArray(candidate)) continue;
      const valid = candidate.filter(isQuickActionId).slice(0, 3);
      if (valid.length > 0) collected[slot] = valid;
    }
    if (Object.keys(collected).length > 0) subRings = collected;
  }

  return { version: 1, slots, ...(octantSlots ? { octantSlots } : {}), ...(subRings ? { subRings } : {}) };
}

/** 한 슬롯만 교체한 새 설정을 반환한다. 원본과 원본 slots 객체는 변경하지 않는다. */
export function updateStudioQuickActionSlot(
  preferences: StudioQuickActionsPreferences,
  slot: StudioQuickActionSlot,
  action: StudioQuickActionId
): StudioQuickActionsPreferences {
  return {
    version: 1,
    slots: {
      ...preferences.slots,
      [slot]: action,
    },
  };
}

/**
 * 중심점 기준 벡터를 북쪽부터 시계 방향인 6개의 60° 섹터로 변환한다.
 * 정확히 두 섹터 사이 경계에 놓이면 시계 방향 쪽 섹터를 선택한다.
 */
export function quickActionSlotFromVector(
  dx: number,
  dy: number,
  deadZonePx = 24
): StudioQuickActionSlot | null {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(deadZonePx) ||
    deadZonePx < 0
  ) {
    return null;
  }

  if (Math.hypot(dx, dy) <= deadZonePx) return null;

  // atan2(dx, -dy): 북쪽이 0°, 오른쪽으로 돌수록 각도가 증가한다.
  const clockwiseFromNorth = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const normalizedDegrees = (clockwiseFromNorth + 360) % 360;
  // 삼각함수로 만든 정확한 경계 벡터가 29.999999999999996°처럼 표현되는 오차만 보정한다.
  const sectorIndex = Math.floor((normalizedDegrees + 30 + 1e-12) / 60) % QUICK_ACTION_SLOTS.length;
  return QUICK_ACTION_SLOTS[sectorIndex] ?? null;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function clampToInterval(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampAxis(value: number, length: number, leadingExtent: number, trailingExtent: number): number {
  const minimum = leadingExtent;
  const maximum = length - trailingExtent;

  if (minimum <= maximum) {
    const fallback = (minimum + maximum) / 2;
    return clampToInterval(Number.isFinite(value) ? value : fallback, minimum, maximum);
  }

  // 작은 뷰포트에서는 모든 외곽 여백을 동시에 만족할 수 없다. 겹친 두 경계의 중간점을
  // 택하되 실제 뷰포트 안으로 다시 제한해 언제나 유한하고 화면 내부인 좌표를 반환한다.
  const overlapMidpoint = (minimum + maximum) / 2;
  return clampToInterval(overlapMidpoint, 0, length);
}

/**
 * 퀵 메뉴 중심을 뷰포트 안의 안전한 범위로 옮긴다.
 *
 * 기본 반경 104px와 여백 12px를 사용한다. 음수·NaN·Infinity 크기와 옵션은 안전한
 * 0 또는 기본값으로 보정하며, 메뉴보다 작은 뷰포트에서도 유한한 화면 내부 좌표를 반환한다.
 */
export function clampStudioQuickActionsCenter(
  anchor: StudioQuickActionsPoint,
  viewport: StudioQuickActionsViewport,
  options: StudioQuickActionsClampOptions = {}
): StudioQuickActionsPoint {
  const width = finiteNonNegative(viewport.width, 0);
  const height = finiteNonNegative(viewport.height, 0);
  const radius = finiteNonNegative(options.radius, 104);
  const margin = finiteNonNegative(options.margin, 12);
  const bottomInset = finiteNonNegative(options.bottomInset, 0);
  const edgeExtent = radius + margin;

  return {
    x: clampAxis(anchor.x, width, edgeExtent, edgeExtent),
    y: clampAxis(anchor.y, height, edgeExtent, edgeExtent + bottomInset),
  };
}

/** 저장소 부재·접근 차단·손상 값 모두 기본 환경설정으로 안전하게 폴백한다. */
export function loadStudioQuickActionsPreferences(
  storage: StudioQuickActionsStorage | null | undefined
): StudioQuickActionsPreferences {
  if (!storage) return copyDefaultPreferences();
  try {
    return normalizeStudioQuickActionsPreferences(storage.getItem(STUDIO_QUICK_ACTIONS_STORAGE_KEY));
  } catch {
    return copyDefaultPreferences();
  }
}

/** 정규화한 환경설정을 저장한다. 저장소가 차단돼도 예외를 노출하지 않는다. */
export function saveStudioQuickActionsPreferences(
  storage: StudioQuickActionsStorage | null | undefined,
  preferences: StudioQuickActionsPreferences
): void {
  if (!storage) return;
  try {
    storage.setItem(
      STUDIO_QUICK_ACTIONS_STORAGE_KEY,
      JSON.stringify(normalizeStudioQuickActionsPreferences(preferences))
    );
  } catch {
    // 사생활 보호 모드·용량 제한·SSR 저장소처럼 쓰기가 막힌 환경은 메모리 설정만 유지한다.
  }
}

// ── 8방향(Octant) 및 2단 중첩 서브링(Nested Radial Menu) 확장 (REA: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68) ──

export type StudioRadialMenuPresetId = "classic-6" | "pro-8-octant" | "nested-subring";

export interface StudioRadialMenuPreset {
  readonly id: StudioRadialMenuPresetId;
  readonly label: string;
  readonly sectorCount: 6 | 8;
  readonly preferences: StudioQuickActionsPreferences;
}

export const STUDIO_RADIAL_MENU_PRESETS: readonly StudioRadialMenuPreset[] = Object.freeze([
  { id: "classic-6", label: "기본 6방향 링", sectorCount: 6, preferences: DEFAULT_STUDIO_QUICK_ACTIONS },
  {
    id: "pro-8-octant",
    label: "프로 8방향 원형 메뉴",
    sectorCount: 8,
    preferences: {
      version: 1,
      slots: { ...DEFAULT_STUDIO_QUICK_ACTIONS.slots },
      octantSlots: {
        north: "undo", northEast: "redo", east: "advanced-fill", southEast: "select",
        south: "pen", southWest: "eraser", west: "quick-mask", northWest: "eyedropper",
      },
    },
  },
  {
    id: "nested-subring",
    label: "2단 중첩 서브링 프리셋",
    sectorCount: 6,
    preferences: {
      version: 1,
      slots: { ...DEFAULT_STUDIO_QUICK_ACTIONS.slots },
      subRings: {
        south: ["wet-mix", "dodge-burn", "advanced-fill"],
        southEast: ["duplicate", "bring-front", "delete"],
        northWest: ["quick-mask", "add-bubble"],
      },
    },
  },
]);

export function quickActionOctantFromVector(
  dx: number,
  dy: number,
  deadZonePx = 24,
): StudioQuickActionOctantSlot | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(deadZonePx) || deadZonePx < 0) return null;
  if (Math.hypot(dx, dy) <= deadZonePx) return null;
  const deg = (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
  return QUICK_ACTION_OCTANT_SLOTS[Math.floor((deg + 22.5 + 1e-12) / 45) % QUICK_ACTION_OCTANT_SLOTS.length] ?? null;
}

export function resolveNestedRadialActionFromVector(
  dx: number,
  dy: number,
  preferences: StudioQuickActionsPreferences,
  options?: { readonly deadZonePx?: number; readonly outerRingThresholdPx?: number },
): { readonly ring: "inner" | "outer"; readonly action: StudioQuickActionId } | null {
  const deadZone = options?.deadZonePx ?? 24;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist <= deadZone) return null;
  if (preferences.octantSlots && !preferences.subRings) {
    const oct = quickActionOctantFromVector(dx, dy, deadZone);
    return oct ? { ring: "inner", action: preferences.octantSlots[oct] } : null;
  }
  const slot = quickActionSlotFromVector(dx, dy, deadZone);
  if (!slot) return null;
  const subList = preferences.subRings?.[slot];
  if (dist >= (options?.outerRingThresholdPx ?? 144) && subList && subList.length > 0) {
    const rawDeg = (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
    const rel = (((rawDeg - (QUICK_ACTION_SLOTS.indexOf(slot) * 60 - 30)) % 360) + 360) % 360;
    const subIdx = Math.min(subList.length - 1, Math.max(0, Math.floor((rel / 60) * subList.length)));
    return { ring: "outer", action: subList[subIdx]! };
  }
  return { ring: "inner", action: preferences.slots[slot] };
}
