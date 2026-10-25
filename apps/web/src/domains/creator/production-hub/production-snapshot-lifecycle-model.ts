/**
 * 원고 버전(스냅샷) 라이프사이클·페이지 5종 변경 배지·컷 수/파일 인스펙터·2단계 마감·텍스트 블록 Diff 모델.
 *
 * - 3종 업로드 모드: 기본 일괄(`bulk`), 개별 페이지(`per-page`), 기존 페이지 조합(`compose-existing`) + PDF 자동 분할
 * - 페이지별 5종 변경 배지: `new`(신규 등록), `updated`(업데이트), `duplicate-skipped`(중복 생략), `unchanged`(변경 없음), `empty`(결과물 없음)
 * - 3단계 버전 공개 범위: `public`(공개), `restricted`(일부 공개 — 편집 허용 이상), `private`(비공개 — 작성자 전용) 및 공개 범위 좁히기 경고
 * - 활성(`active`) / 아카이브(`archived`) 분리 및 고유 결과물 동반 삭제 옵션
 * - 2단계 마감: 작업자 `작업 완료`(소요 시간 기록) → 관리자 `공정 마감`(미해결 공개 피드백 일괄 완료 여부 + 작업자 기여도 `시간 비율 배분` / `인원 균등 배분` 합계 100%)
 * - 텍스트 공정 11종 슬래시 블록, `블록 URL 복사` 딥링크, 고아 피드백 보존(`원본 컨텐츠 삭제됨`), 나란히 `Diff 비교`(`빈 자리 표시`)
 */

export type SnapshotUploadMode = "bulk" | "per-page" | "compose-existing";
export type SnapshotVisibilityScope = "public" | "restricted" | "private";
export type SnapshotPageDiffBadge = "new" | "updated" | "duplicate-skipped" | "unchanged" | "empty";
export type SnapshotCompletionStage = "in-progress" | "worker-completed" | "process-finalized";
export type OpenFeedbackFinalizeAction = "complete-all" | "keep-open";
export type WorkerContributionSplitMode = "time-proportional" | "equal";

export type TextProcessBlockKind =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "checkbox"
  | "quote"
  | "table"
  | "divider"
  | "image";

export const TEXT_PROCESS_BLOCK_KINDS: readonly TextProcessBlockKind[] = [
  "text",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "checkbox",
  "quote",
  "table",
  "divider",
  "image",
];

export interface SnapshotPageInspectorItem {
  readonly pageNumber: number;
  readonly fileName: string | null;
  readonly byteHash: string | null;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
  readonly cutCount: number;
  readonly diffBadge: SnapshotPageDiffBadge;
}

export interface SnapshotWorkerInput {
  readonly workerId: string;
  readonly workerName: string;
  readonly workHours: number;
}

export interface SnapshotWorkerAllocation extends SnapshotWorkerInput {
  readonly contributionPercent: number;
}

export interface SnapshotLifecycleEntry {
  readonly snapshotId: string;
  readonly versionName: string;
  readonly uploadMode: SnapshotUploadMode;
  readonly pdfAutoSplitUsed: boolean;
  readonly visibility: SnapshotVisibilityScope;
  readonly isArchived: boolean;
  readonly completionStage: SnapshotCompletionStage;
  readonly uploadedAtIso: string;
  readonly workDurationHours: number;
  readonly finalizedAtIso: string | null;
  readonly openFeedbackAction: OpenFeedbackFinalizeAction | null;
  readonly workerAllocations: readonly SnapshotWorkerAllocation[];
}

export interface TextProcessBlockItem {
  readonly blockId: string;
  readonly kind: TextProcessBlockKind;
  readonly content: string;
  readonly feedbackCount: number;
  readonly orphanedFeedbackCount?: number;
}

export interface TextBlockDiffRow {
  readonly rowIndex: number;
  readonly left: TextProcessBlockItem | null;
  readonly right: TextProcessBlockItem | null;
  readonly status: "same" | "modified" | "added" | "removed";
}

const VISIBILITY_RANK: Readonly<Record<SnapshotVisibilityScope, number>> = {
  private: 0,
  restricted: 1,
  public: 2,
};

/**
 * 이전 페이지와 새 업로드 파일의 해시·해상도를 비교해 5종 변경 배지를 판정한다.
 * - 새 파일이 없으면 `empty`(`결과물 없음`)
 * - 이전 페이지가 없으면 `new`(`신규 등록`)
 * - 동일 배치 또는 직전 페이지와 해시·해상도가 완전히 같고 중복 생략 대상이면 `duplicate-skipped`(`중복 생략`)
 * - 직전 버전의 같은 페이지와 해시·해상도가 같으면 `unchanged`(`변경 없음`)
 * - 그 외에는 `updated`(`업데이트`)
 */
export function classifySnapshotPageDiff(input: {
  readonly previousHash: string | null;
  readonly nextHash: string | null;
  readonly isDuplicateUpload?: boolean;
}): SnapshotPageDiffBadge {
  if (!input.nextHash) return "empty";
  if (input.isDuplicateUpload) return "duplicate-skipped";
  if (!input.previousHash) return "new";
  if (input.previousHash === input.nextHash) return "unchanged";
  return "updated";
}

/** 페이지별 컷 수를 합산하며, 수동 총합 오버라이드가 있으면 수동 값을 우선한다. */
export function computeEpisodeTotalCutCount(
  pages: readonly Pick<SnapshotPageInspectorItem, "cutCount">[],
  manualOverride: number | null = null,
): { readonly autoSum: number; readonly effectiveTotal: number; readonly isManual: boolean } {
  const autoSum = pages.reduce((sum, page) => sum + Math.max(0, Math.trunc(page.cutCount)), 0);
  if (manualOverride !== null && Number.isFinite(manualOverride) && manualOverride >= 0) {
    return { autoSum, effectiveTotal: Math.trunc(manualOverride), isManual: true };
  }
  return { autoSum, effectiveTotal: autoSum, isManual: false };
}

/**
 * 버전 또는 피드백의 공개 범위를 좁힐 때(`공개` → `일부 공개`/`비공개` 등)
 * 상위 범위 열람자에게 더 이상 보이지 않는다는 확인 안내가 필요한지 검사한다.
 */
export function checkVisibilityScopeNarrowing(
  previous: SnapshotVisibilityScope,
  next: SnapshotVisibilityScope,
): { readonly narrowed: boolean; readonly warningKo: string | null } {
  if (VISIBILITY_RANK[next] < VISIBILITY_RANK[previous]) {
    return {
      narrowed: true,
      warningKo:
        "공개 범위를 좁히면 기존에 열람 가능했던 하위 권한 참여자에게 이 버전과 연결된 피드백이 숨겨집니다.",
    };
  }
  return { narrowed: false, warningKo: null };
}

/**
 * 첫 공개 버전 업로드 시각에서 작업자의 소요 작업 시간을 빼서 공정 시작 시각을 역산한다.
 */
export function deriveProcessStartedAtIso(
  firstPublicUploadAtIso: string,
  workDurationHours: number,
): string {
  const uploadedMs = new Date(firstPublicUploadAtIso).getTime();
  if (!Number.isFinite(uploadedMs)) return firstPublicUploadAtIso;
  const durationMs = Math.max(0, workDurationHours) * 3_600_000;
  return new Date(uploadedMs - durationMs).toISOString();
}

/**
 * 작업자별 기여도(%) 자동 배분:
 * - `time-proportional`(`시간 비율 배분`): 기록된 작업 시간 비율에 따라 정수 %로 배분하고 합계를 정확히 100%로 맞춘다.
 * - `equal`(`인원 균등 배분`): 참여 작업자 수로 균등 배분하고 나머지를 앞 순서부터 1%씩 배분해 합계를 100%로 맞춘다.
 */
export function computeWorkerContributionSplit(
  workers: readonly SnapshotWorkerInput[],
  mode: WorkerContributionSplitMode,
): readonly SnapshotWorkerAllocation[] {
  if (workers.length === 0) return [];
  if (workers.length === 1) {
    return [{ ...workers[0]!, contributionPercent: 100 }];
  }

  const totalHours = workers.reduce((sum, worker) => sum + Math.max(0, worker.workHours), 0);
  if (mode === "equal" || totalHours <= 0) {
    const base = Math.floor(100 / workers.length);
    const remainder = 100 - base * workers.length;
    return workers.map((worker, index) => ({
      ...worker,
      contributionPercent: base + (index < remainder ? 1 : 0),
    }));
  }

  const rawShares = workers.map((worker) => (Math.max(0, worker.workHours) / totalHours) * 100);
  const floored = rawShares.map((share) => Math.floor(share));
  let remainder = 100 - floored.reduce((sum, val) => sum + val, 0);
  const order = rawShares
    .map((share, index) => ({ index, frac: share - Math.floor(share) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (const item of order) {
    if (remainder <= 0) break;
    floored[item.index] = (floored[item.index] ?? 0) + 1;
    remainder -= 1;
  }

  return workers.map((worker, index) => ({
    ...worker,
    contributionPercent: floored[index] ?? 0,
  }));
}

/** 텍스트 공정 블록의 고유 딥링크(`블록 URL 복사`)를 생성한다. */
export function buildTextBlockDeepLink(baseUrl: string, blockId: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("blockId", blockId);
    url.hash = `block-${encodeURIComponent(blockId)}`;
    return url.toString();
  } catch {
    return `${baseUrl}#block-${encodeURIComponent(blockId)}`;
  }
}

/**
 * 텍스트 공정 두 버전의 블록을 나란히 비교(`Diff 비교`)한다.
 * `showBlankPlaceholders`가 `true`이면 추가·삭제된 반대편 칸에 빈 자리(`null`)를 맞춰 행 정렬을 유지한다.
 */
export function computeTextBlockSideBySideDiff(
  leftBlocks: readonly TextProcessBlockItem[],
  rightBlocks: readonly TextProcessBlockItem[],
  options: { readonly showBlankPlaceholders: boolean } = { showBlankPlaceholders: true },
): readonly TextBlockDiffRow[] {
  const rightById = new Map(rightBlocks.map((block) => [block.blockId, block]));
  const leftById = new Map(leftBlocks.map((block) => [block.blockId, block]));
  const rows: TextBlockDiffRow[] = [];
  const handledRightIds = new Set<string>();

  for (const left of leftBlocks) {
    const right = rightById.get(left.blockId) ?? null;
    if (right) {
      handledRightIds.add(right.blockId);
      const same = left.kind === right.kind && left.content.trim() === right.content.trim();
      rows.push({
        rowIndex: rows.length,
        left,
        right,
        status: same ? "same" : "modified",
      });
    } else if (options.showBlankPlaceholders) {
      rows.push({
        rowIndex: rows.length,
        left,
        right: null,
        status: "removed",
      });
    }
  }

  for (const right of rightBlocks) {
    if (handledRightIds.has(right.blockId)) continue;
    if (!leftById.has(right.blockId) && options.showBlankPlaceholders) {
      rows.push({
        rowIndex: rows.length,
        left: null,
        right,
        status: "added",
      });
    }
  }

  return rows;
}
