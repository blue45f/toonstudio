/**
 * Blender 파이 메뉴(`Tab`/`Z`/`Shift+S`) & 퀵 즐겨찾기(`Q`) 코어 엔진.
 *
 * - 8방위 방사형 제스처 섹터(`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`) 각도 해석 + 중앙 데드존 취소
 * - `Tab`(모드), `Z`(셰이딩), `Shift+S`(스냅·접지), `Q`(퀵 즐겨찾기) 단축키 해석(입력창 보호)
 * - 퀵 즐겨찾기 고정·해제·순서 변경 및 안전 JSON 직렬화/복원
 */

export const PIE_DIRECTIONS_8 = Object.freeze([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const);

export type PieDirection8 = (typeof PIE_DIRECTIONS_8)[number];

export type RadialPieMenuId = "mode" | "shading" | "snap" | "favorites";

export interface RadialPieActionItem {
  readonly id: string;
  readonly direction: PieDirection8;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly shortcutLabel?: string;
}

export interface RadialPieMenuSpec {
  readonly id: RadialPieMenuId;
  readonly titleKo: string;
  readonly triggerShortcutLabel: string;
  readonly items: readonly RadialPieActionItem[];
}

export interface PieShortcutEventLike {
  readonly code?: string;
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly repeat?: boolean;
  readonly target?: {
    readonly tagName?: string;
    readonly isContentEditable?: boolean;
  } | null;
}

export interface RadialPieDirectionOffset {
  readonly direction: PieDirection8;
  /** 중심에서 단위 반경 기준 X 오프셋 (`-1..1`). */
  readonly unitX: number;
  /** 중심에서 단위 반경 기준 Y 오프셋 (`-1..1`, 화면 아래가 +Y). */
  readonly unitY: number;
  readonly angleDeg: number;
}

export const PIE_DIRECTION_OFFSETS: Readonly<Record<PieDirection8, RadialPieDirectionOffset>> = Object.freeze({
  N: { direction: "N", unitX: 0, unitY: -1, angleDeg: -90 },
  NE: { direction: "NE", unitX: Math.SQRT1_2, unitY: -Math.SQRT1_2, angleDeg: -45 },
  E: { direction: "E", unitX: 1, unitY: 0, angleDeg: 0 },
  SE: { direction: "SE", unitX: Math.SQRT1_2, unitY: Math.SQRT1_2, angleDeg: 45 },
  S: { direction: "S", unitX: 0, unitY: 1, angleDeg: 90 },
  SW: { direction: "SW", unitX: -Math.SQRT1_2, unitY: Math.SQRT1_2, angleDeg: 135 },
  W: { direction: "W", unitX: -1, unitY: 0, angleDeg: 180 },
  NW: { direction: "NW", unitX: -Math.SQRT1_2, unitY: -Math.SQRT1_2, angleDeg: -135 },
});

const MODE_PIE_ITEMS: readonly RadialPieActionItem[] = Object.freeze([
  { id: "mode:pose", direction: "N", labelKo: "포즈 편집", hintKo: "관절 IK 및 손 포즈 조작", shortcutLabel: "1" },
  { id: "mode:object", direction: "NE", labelKo: "오브젝트 배치", hintKo: "캐릭터·소품 위치와 회전", shortcutLabel: "2" },
  { id: "mode:surface-stroke", direction: "E", labelKo: "표면 직드로잉", hintKo: "메시 표면에 선을 직접 고정", shortcutLabel: "3" },
  { id: "mode:cutaway", direction: "SE", labelKo: "앞벽 컷어웨이", hintKo: "시야 가림 벽면 자동 투명화", shortcutLabel: "4" },
  { id: "mode:shaper", direction: "S", labelKo: "체형·두상", hintKo: "두상 믹서와 21체형 슬라이더", shortcutLabel: "5" },
  { id: "mode:camera", direction: "SW", labelKo: "카메라 연출", hintKo: "180도 축 잠금과 리버스 샷", shortcutLabel: "6" },
  { id: "mode:lt-extract", direction: "W", labelKo: "LT 선화 추출", hintKo: "크롭 비율 보정 벡터 선화", shortcutLabel: "7" },
  { id: "mode:lighting", direction: "NW", labelKo: "조명·그림자", hintKo: "3점 조명과 채광 그림자", shortcutLabel: "8" },
]);

export const MODE_PIE_MENU: RadialPieMenuSpec = Object.freeze({
  id: "mode",
  titleKo: "작업 모드 전환",
  triggerShortcutLabel: "Tab",
  items: MODE_PIE_ITEMS,
});

const SHADING_PIE_ITEMS: readonly RadialPieActionItem[] = Object.freeze([
  { id: "shading:toon-cel", direction: "N", labelKo: "툰 셀 셰이딩", hintKo: "웹툰 원고용 2~3단 명암", shortcutLabel: "1" },
  { id: "shading:wireframe", direction: "NE", labelKo: "와이어프레임", hintKo: "폴리곤 흐름과 토폴로지 확인", shortcutLabel: "2" },
  { id: "shading:clay", direction: "E", labelKo: "점토 클레이", hintKo: "순수 양감과 실루엣 검토", shortcutLabel: "3" },
  { id: "shading:matcap", direction: "SE", labelKo: "매트캡", hintKo: "곡면 반사와 주름 가독성", shortcutLabel: "4" },
  { id: "shading:silhouette", direction: "S", labelKo: "실루엣 검사", hintKo: "포즈 가독성 단색 외곽 확인", shortcutLabel: "5" },
  { id: "shading:shadow-only", direction: "SW", labelKo: "그림자 패스", hintKo: "별도 그림자 레이어 확인", shortcutLabel: "6" },
  { id: "shading:depth-normal", direction: "W", labelKo: "깊이·노멀", hintKo: "LT 선화 경계 검출 기준맵", shortcutLabel: "7" },
  { id: "shading:rendered", direction: "NW", labelKo: "최종 렌더", hintKo: "재질·배경·후처리 통합 미리보기", shortcutLabel: "8" },
]);

export const SHADING_PIE_MENU: RadialPieMenuSpec = Object.freeze({
  id: "shading",
  titleKo: "뷰포트 셰이딩",
  triggerShortcutLabel: "Z",
  items: SHADING_PIE_ITEMS,
});

const SNAP_PIE_ITEMS: readonly RadialPieActionItem[] = Object.freeze([
  { id: "snap:ground-x", direction: "N", labelKo: "바닥 접지", hintKo: "발바닥을 바닥면에 즉시 밀착", shortcutLabel: "X" },
  { id: "snap:work-to-cut-s", direction: "NE", labelKo: "작업→컷 카메라", hintKo: "현재 작업 시점을 컷 카메라에 적용", shortcutLabel: "S" },
  { id: "snap:selection-to-cursor", direction: "E", labelKo: "선택을 커서로", hintKo: "선택 개체를 3D 기준점으로 이동", shortcutLabel: "3" },
  { id: "snap:cursor-to-selection", direction: "SE", labelKo: "커서를 선택으로", hintKo: "3D 기준점을 선택 중심으로 정렬", shortcutLabel: "4" },
  { id: "snap:grid", direction: "S", labelKo: "그리드 스냅", hintKo: "10cm 건축 격자에 맞춤", shortcutLabel: "5" },
  { id: "snap:axis-180", direction: "SW", labelKo: "180도 축 잠금", hintKo: "인물 시선선 침범 방지 잠금", shortcutLabel: "6" },
  { id: "snap:surface", direction: "W", labelKo: "표면 밀착", hintKo: "소품을 테이블·벽 표면에 부착", shortcutLabel: "7" },
  { id: "snap:world-origin", direction: "NW", labelKo: "원점 정렬", hintKo: "선택 개체를 무대 원점(0,0,0)으로", shortcutLabel: "8" },
]);

export const SNAP_PIE_MENU: RadialPieMenuSpec = Object.freeze({
  id: "snap",
  titleKo: "스냅 · 접지 정렬",
  triggerShortcutLabel: "Shift+S",
  items: SNAP_PIE_ITEMS,
});

export const ALL_RADIAL_ACTION_ITEMS: readonly RadialPieActionItem[] = Object.freeze([
  ...MODE_PIE_MENU.items,
  ...SHADING_PIE_MENU.items,
  ...SNAP_PIE_MENU.items,
]);

export const DEFAULT_QUICK_FAVORITE_IDS: readonly string[] = Object.freeze([
  "snap:ground-x",
  "snap:work-to-cut-s",
  "mode:cutaway",
  "mode:surface-stroke",
  "shading:toon-cel",
  "mode:lt-extract",
]);

const ACTION_BY_ID: ReadonlyMap<string, RadialPieActionItem> = new Map(
  ALL_RADIAL_ACTION_ITEMS.map((item) => [item.id, item]),
);

/**
 * 키보드 입력에서 4종 파이 메뉴(`Tab`, `Z`, `Shift+S`, `Q`) 트리거를 해석한다.
 */
export function resolvePieMenuShortcut(event: PieShortcutEventLike): RadialPieMenuId | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const tag = event.target?.tagName?.toUpperCase() ?? "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) {
    return null;
  }
  const keyLower = (event.key ?? "").toLowerCase();
  if ((event.code === "Tab" || keyLower === "tab") && !event.shiftKey) {
    return "mode";
  }
  if ((event.code === "KeyZ" || keyLower === "z") && !event.shiftKey) {
    return "shading";
  }
  if ((event.code === "KeyS" || keyLower === "s") && Boolean(event.shiftKey)) {
    return "snap";
  }
  if ((event.code === "KeyQ" || keyLower === "q") && !event.shiftKey) {
    return "favorites";
  }
  return null;
}

/**
 * 중심 좌표에서 포인터까지의 변위 `(dx, dy)`를 8방위 파이 섹터로 해석한다.
 * 중앙 `deadzonePx` 안쪽이면 `null`(취소/미선택)을 반환한다.
 */
export function resolveRadialPieDirection(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  deadzonePx = 18,
): PieDirection8 | null {
  const dx = pointerX - originX;
  const dy = pointerY - originY;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < Math.max(4, deadzonePx)) {
    return null;
  }
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const shifted = (angleDeg + 90 + 360 + 22.5) % 360;
  const sectorIndex = Math.floor(shifted / 45) % 8;
  return PIE_DIRECTIONS_8[sectorIndex];
}

/** 퀵 즐겨찾기 ID 목록으로부터 최대 8방위 파이 메뉴 명세를 조합한다. */
export function buildQuickFavoritesPieMenu(
  favoriteIds: readonly string[],
): RadialPieMenuSpec {
  const uniqueValid: RadialPieActionItem[] = [];
  const seen = new Set<string>();
  for (const id of favoriteIds) {
    if (seen.has(id) || uniqueValid.length >= 8) continue;
    const item = ACTION_BY_ID.get(id);
    if (!item) continue;
    seen.add(id);
    uniqueValid.push({
      ...item,
      direction: PIE_DIRECTIONS_8[uniqueValid.length],
      shortcutLabel: String(uniqueValid.length + 1),
    });
  }
  return {
    id: "favorites",
    titleKo: "퀵 즐겨찾기",
    triggerShortcutLabel: "Q",
    items: uniqueValid,
  };
}

export function getRadialPieMenuSpec(
  menuId: RadialPieMenuId,
  favoriteIds: readonly string[] = DEFAULT_QUICK_FAVORITE_IDS,
): RadialPieMenuSpec {
  if (menuId === "mode") return MODE_PIE_MENU;
  if (menuId === "shading") return SHADING_PIE_MENU;
  if (menuId === "snap") return SNAP_PIE_MENU;
  return buildQuickFavoritesPieMenu(favoriteIds);
}

/** 퀵 즐겨찾기에 항목을 토글(추가 또는 제거, 최대 8개 유지)한다. */
export function toggleQuickFavoriteItem(
  favoriteIds: readonly string[],
  actionId: string,
): readonly string[] {
  if (!ACTION_BY_ID.has(actionId)) return favoriteIds;
  if (favoriteIds.includes(actionId)) {
    return favoriteIds.filter((id) => id !== actionId);
  }
  return [...favoriteIds, actionId].slice(0, 8);
}

export function serializeQuickFavorites(favoriteIds: readonly string[]): string {
  const clean = favoriteIds.filter((id) => ACTION_BY_ID.has(id)).slice(0, 8);
  return JSON.stringify({ version: 1, favoriteIds: clean });
}

export function deserializeQuickFavorites(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw) as { readonly favoriteIds?: unknown };
    if (!Array.isArray(parsed.favoriteIds)) return DEFAULT_QUICK_FAVORITE_IDS;
    const clean = parsed.favoriteIds.filter(
      (value): value is string => typeof value === "string" && ACTION_BY_ID.has(value),
    );
    return clean.length > 0 ? [...new Set(clean)].slice(0, 8) : DEFAULT_QUICK_FAVORITE_IDS;
  } catch {
    return DEFAULT_QUICK_FAVORITE_IDS;
  }
}
