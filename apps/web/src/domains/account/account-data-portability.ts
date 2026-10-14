/**
 * 계정 데이터 이동성 모델 (G4) — 순수 함수만 둔다.
 *
 * 배경: 작품 내보내기는 작품 1개 단위(.toonstudio 패키지)만 있었고, 설정의
 * "내 데이터" 내보내기는 서재 활동(별점·컬렉션)뿐이라 작품 일괄 다운로드는
 * 없었다. 탈퇴 동선도 작품이 어떻게 되는지 안내 없이 바로 삭제됐다.
 *
 * 이 모델이 정하는 것:
 * - 이 기기 작품 라이브러리 원본(JSON)에서 읽은 작품 목록(인벤토리) —
 *   내보내기 가능(active·archived) / 제외(trashed) / 읽지 못함을 정직히 구분.
 * - 일괄 다운로드 계획(결정적 순서)과 결과 요약(부분 실패를 성공으로 위장 금지).
 * - 탈퇴 전 점검표: 내보낼 작품이 남았으면 "최신 일괄 다운로드 완료" 또는
 *   "내보내지 않고 탈퇴" 명시 확인 중 하나가 있어야 탈퇴를 진행할 수 있다.
 * - 일괄 다운로드 완료 표식(marker): 내보낸 뒤 작품이 바뀌면 stale로 판정한다.
 *
 * 저장소 접근·다운로드 실행은 account-bulk-export.ts가 맡고, 이 파일은
 * 어떤 입력에도 같은 판정을 내는 순수 판정만 담당한다.
 */

export const STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY =
  "toonspectrum:studio-project-library:v1";
export const ACCOUNT_BULK_EXPORT_MARKER_KEY = "toonstudio:account-bulk-export:v1";

export type AccountProjectStatus = "active" | "archived" | "trashed";

export interface AccountPortabilityProject {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly status: AccountProjectStatus;
  readonly updatedAt: string;
}

export interface AccountProjectInventory {
  /** 내보내기 대상 (active·archived), 계획 순서와 같은 최신 수정순. */
  readonly exportable: readonly AccountPortabilityProject[];
  /** 휴지통 작품 — 일괄 다운로드에서 제외된다. */
  readonly trashed: readonly AccountPortabilityProject[];
  /** 형식이 깨져 분류하지 못한 기록 수. 조용히 버리지 않고 개수로 드러낸다. */
  readonly unreadableCount: number;
  readonly totalCount: number;
}

const PROJECT_STATUSES: ReadonlySet<string> = new Set(["active", "archived", "trashed"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function timestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function byUpdatedDescThenTitle(
  left: AccountPortabilityProject,
  right: AccountPortabilityProject,
): number {
  return (
    timestampMs(right.updatedAt) - timestampMs(left.updatedAt)
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id)
  );
}

function parseProject(value: unknown): AccountPortabilityProject | null {
  const item = record(value);
  if (!item) return null;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.status !== "string" || !PROJECT_STATUSES.has(item.status)) return null;
  return Object.freeze({
    id: item.id,
    title: item.title,
    kind: typeof item.kind === "string" && item.kind ? item.kind : "webtoon",
    status: item.status as AccountProjectStatus,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
  });
}

/**
 * 작품 라이브러리 원본 문자열을 인벤토리로 읽는다.
 * 원본이 없으면 빈 인벤토리, JSON이 깨졌으면 전체를 unreadable 1건으로 센다 —
 * "작품이 없다"고 거짓말하지 않기 위해서다.
 */
export function parseAccountProjectInventory(raw: string | null): AccountProjectInventory {
  if (!raw) {
    return Object.freeze({ exportable: Object.freeze([]), trashed: Object.freeze([]), unreadableCount: 0, totalCount: 0 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze({ exportable: Object.freeze([]), trashed: Object.freeze([]), unreadableCount: 1, totalCount: 0 });
  }
  const root = record(parsed);
  const list = root && Array.isArray(root.projects) ? root.projects : null;
  if (!list) {
    return Object.freeze({ exportable: Object.freeze([]), trashed: Object.freeze([]), unreadableCount: 1, totalCount: 0 });
  }
  const exportable: AccountPortabilityProject[] = [];
  const trashed: AccountPortabilityProject[] = [];
  let unreadableCount = 0;
  for (const entry of list) {
    const project = parseProject(entry);
    if (!project) {
      unreadableCount += 1;
      continue;
    }
    if (project.status === "trashed") trashed.push(project);
    else exportable.push(project);
  }
  exportable.sort(byUpdatedDescThenTitle);
  trashed.sort(byUpdatedDescThenTitle);
  return Object.freeze({
    exportable: Object.freeze(exportable),
    trashed: Object.freeze(trashed),
    unreadableCount,
    totalCount: exportable.length + trashed.length + unreadableCount,
  });
}

export interface BulkProjectExportPlan {
  readonly items: readonly AccountPortabilityProject[];
  readonly excludedTrashedCount: number;
  readonly unreadableCount: number;
}

/** 일괄 다운로드 계획. onlyIds가 있으면 그 작품만(실패분 재시도용), 순서는 인벤토리 순서를 유지한다. */
export function planBulkProjectExport(
  inventory: AccountProjectInventory,
  options: { readonly onlyIds?: readonly string[] } = {},
): BulkProjectExportPlan {
  const only = options.onlyIds ? new Set(options.onlyIds) : null;
  const items = only
    ? inventory.exportable.filter((project) => only.has(project.id))
    : inventory.exportable;
  return Object.freeze({
    items: Object.freeze([...items]),
    excludedTrashedCount: inventory.trashed.length,
    unreadableCount: inventory.unreadableCount,
  });
}

export interface AccountBulkExportMarker {
  readonly exportedAt: string;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successIds: readonly string[];
}

export function parseBulkExportMarker(raw: string | null): AccountBulkExportMarker | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const item = record(parsed);
  if (!item) return null;
  if (typeof item.exportedAt !== "string" || !Number.isFinite(Date.parse(item.exportedAt))) return null;
  if (typeof item.successCount !== "number" || typeof item.failureCount !== "number") return null;
  const successIds = Array.isArray(item.successIds)
    ? item.successIds.filter((id): id is string => typeof id === "string")
    : [];
  return Object.freeze({
    exportedAt: item.exportedAt,
    successCount: item.successCount,
    failureCount: item.failureCount,
    successIds: Object.freeze(successIds),
  });
}

export function serializeBulkExportMarker(marker: AccountBulkExportMarker): string {
  return JSON.stringify({
    exportedAt: marker.exportedAt,
    successCount: marker.successCount,
    failureCount: marker.failureCount,
    successIds: [...marker.successIds],
  });
}

/**
 * 완료 표식이 현재 작품들을 덮는가: 실패 0 + 내보낸 뒤 바뀐 작품 없음.
 * 표식이 있어도 그 뒤에 수정된 작품이 있으면 stale이다.
 */
export function bulkExportMarkerCovers(
  inventory: AccountProjectInventory,
  marker: AccountBulkExportMarker | null,
): boolean {
  if (!marker || marker.failureCount > 0) return false;
  if (inventory.exportable.length === 0) return true;
  const exportedMs = Date.parse(marker.exportedAt);
  const coveredIds = new Set(marker.successIds);
  return inventory.exportable.every(
    (project) => coveredIds.has(project.id) && timestampMs(project.updatedAt) <= exportedMs,
  );
}

export interface BulkExportOutcome {
  readonly projectId: string;
  readonly title: string;
  readonly ok: boolean;
  readonly fileName: string | null;
  readonly error: string | null;
}

export interface BulkExportSummary {
  readonly planned: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failedIds: readonly string[];
  /** 계획한 전부가 성공했을 때만 true. 부분 성공을 전체 성공으로 말하지 않는다. */
  readonly complete: boolean;
}

export function summarizeBulkExportOutcomes(
  outcomes: readonly BulkExportOutcome[],
  planned: number,
): BulkExportSummary {
  const failed = outcomes.filter((outcome) => !outcome.ok);
  const succeeded = outcomes.length - failed.length;
  return Object.freeze({
    planned,
    succeeded,
    failed: failed.length,
    failedIds: Object.freeze(failed.map((outcome) => outcome.projectId)),
    complete: planned > 0 && outcomes.length === planned && failed.length === 0,
  });
}

export type DeletionChecklistItemStatus = "pass" | "block" | "warn" | "info";
export type DeletionChecklistItemId =
  | "works-export"
  | "trashed-works"
  | "unreadable-works"
  | "retained-posts"
  | "library-data";

export interface DeletionChecklistItem {
  readonly id: DeletionChecklistItemId;
  readonly status: DeletionChecklistItemStatus;
  readonly count: number | null;
}

export interface AccountDeletionReadiness {
  readonly items: readonly DeletionChecklistItem[];
  /** block 항목이 남아 있으면 false. works-export block은 명시 확인으로 해소된다. */
  readonly canDelete: boolean;
  readonly exportableCount: number;
}

/**
 * 탈퇴 전 점검 판정.
 * - 내보낼 작품이 있고 최신 일괄 다운로드도, "내보내지 않고 탈퇴" 확인도
 *   없으면 works-export가 block이다(탈퇴 버튼 비활성 사유).
 * - 휴지통·읽지 못한 기록·남는 글·서재 데이터는 막지 않되 반드시 드러낸다.
 */
export function resolveAccountDeletionReadiness(input: {
  readonly inventory: AccountProjectInventory;
  readonly marker: AccountBulkExportMarker | null;
  readonly skipExportAcknowledged: boolean;
}): AccountDeletionReadiness {
  const { inventory, marker } = input;
  const exportableCount = inventory.exportable.length;
  const covered = bulkExportMarkerCovers(inventory, marker);
  const items: DeletionChecklistItem[] = [];

  if (exportableCount === 0) {
    items.push(Object.freeze({ id: "works-export" as const, status: "pass" as const, count: 0 }));
  } else if (covered) {
    items.push(Object.freeze({ id: "works-export" as const, status: "pass" as const, count: exportableCount }));
  } else if (marker && marker.successCount > 0) {
    // 일부만 받았거나 받은 뒤 작품이 바뀐 경우 — 받은 사실은 인정하되 block 유지.
    items.push(Object.freeze({ id: "works-export" as const, status: "block" as const, count: exportableCount }));
  } else {
    items.push(Object.freeze({ id: "works-export" as const, status: "block" as const, count: exportableCount }));
  }
  if (inventory.trashed.length > 0) {
    items.push(Object.freeze({
      id: "trashed-works" as const, status: "info" as const, count: inventory.trashed.length,
    }));
  }
  if (inventory.unreadableCount > 0) {
    items.push(Object.freeze({
      id: "unreadable-works" as const, status: "warn" as const, count: inventory.unreadableCount,
    }));
  }
  items.push(Object.freeze({ id: "retained-posts" as const, status: "info" as const, count: null }));
  items.push(Object.freeze({ id: "library-data" as const, status: "info" as const, count: null }));

  const blocked = items.some(
    (item) => item.status === "block"
      && !(item.id === "works-export" && input.skipExportAcknowledged),
  );
  return Object.freeze({
    items: Object.freeze(items),
    canDelete: !blocked,
    exportableCount,
  });
}
