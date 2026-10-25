/**
 * REA 역공학 기반 구글 워크스페이스(Google Sheets 마감 체크리스트 & Google Drive 원고 공유 폴더 상시 동기화) 도메인 모델
 * - Evidence: ev_8afb274c1900cbede7493e03a665af35daa06b1820566d8f320ada7ba3e5972d,
 *   ev_33b259bba45d9eef6e4676cd76422ce74bb077ee65ebffe2ba605323fa99386d,
 *   ev_4836b46c114e6f543e9ec032b308b6554bf7a0189ba555c69868787ff73e7767,
 *   ev_0560c4ddb37293e05f5e8effaa0547b733fd526191a80a0c66ed31a32249b7e9
 * - 클린룸 구현: 엑셀/스프레드시트 형태의 회차×공정 체크박스 그리드, COUNTIF 진행률 수식,
 *   조건부 서식(마감초과/임박/완료), CSV/TSV 내보내기, 구글 드라이브 원고 공유 폴더 상시 동기화 상태 머신
 */

export type SpreadsheetProcessColumnKey =
  | "storyboard"
  | "lineart"
  | "flatColor"
  | "shading"
  | "background"
  | "typesetting"
  | "finalManuscript";

export interface SpreadsheetProcessColumnSpec {
  readonly key: SpreadsheetProcessColumnKey;
  readonly code: string;
  readonly label: string;
  readonly folderPrefix: string;
}

export const SPREADSHEET_PROCESS_COLUMNS: readonly SpreadsheetProcessColumnSpec[] = [
  { key: "storyboard", code: "B", label: "콘티", folderPrefix: "01_콘티" },
  { key: "lineart", code: "C", label: "선화", folderPrefix: "02_선화" },
  { key: "flatColor", code: "D", label: "밑색", folderPrefix: "03_밑색" },
  { key: "shading", code: "E", label: "명암", folderPrefix: "04_명암" },
  { key: "background", code: "F", label: "배경·3D", folderPrefix: "05_배경" },
  { key: "typesetting", code: "G", label: "식자·말풍선", folderPrefix: "06_식자" },
  { key: "finalManuscript", code: "H", label: "최종원고", folderPrefix: "07_최종원고" },
];

export interface SpreadsheetProcessCell {
  readonly processKey: SpreadsheetProcessColumnKey;
  readonly checked: boolean;
  readonly assigneeName: string;
  readonly driveFolderId: string;
  readonly updatedAtIso: string;
}

export interface SpreadsheetEpisodeChecklistRow {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly deadlineDateIso: string;
  readonly cells: Readonly<Record<SpreadsheetProcessColumnKey, SpreadsheetProcessCell>>;
}

export type ConditionalFormatTone =
  | "completed"
  | "overdue"
  | "due-soon"
  | "in-progress";

export interface SpreadsheetRowFormulaMetrics {
  readonly episodeId: string;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly completionPercent: number;
  readonly formulaExpression: string;
  readonly conditionalTone: ConditionalFormatTone;
  readonly daysUntilDeadline: number;
}

export type DriveContinuousSyncState =
  | "synced"
  | "uploading"
  | "offline-queued"
  | "conflict";

export type DriveConflictResolutionStrategy =
  | "keep-latest-revision"
  | "keep-both-with-suffix";

export interface DriveManuscriptSyncFolderNode {
  readonly folderId: string;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly processKey: SpreadsheetProcessColumnKey;
  readonly folderPath: string;
  readonly latestFileName: string;
  readonly fileCount: number;
  readonly totalSizeMb: number;
  readonly syncState: DriveContinuousSyncState;
  readonly revisionTag: string;
  readonly lastSyncedAtIso: string;
  readonly conflictDetail: string | null;
}

export const DRIVE_SYNC_STATE_LABELS: Readonly<
  Record<DriveContinuousSyncState, string>
> = {
  synced: "상시 동기화 완료",
  uploading: "원고 변경분 업로드 중",
  "offline-queued": "오프라인 큐 대기",
  conflict: "버전 충돌 감지",
};

export const CONDITIONAL_FORMAT_LABELS: Readonly<
  Record<ConditionalFormatTone, string>
> = {
  completed: "100% 마감 완료",
  overdue: "마감 기한 초과",
  "due-soon": "마감 임박 (D-2)",
  "in-progress": "정상 진행 중",
};

/**
 * 스프레드시트 행의 체크박스 완료 개수(`COUNTIF`)와 진행률(%), 조건부 서식 상태를 계산한다.
 */
export function computeSpreadsheetRowFormulaMetrics(
  row: SpreadsheetEpisodeChecklistRow,
  referenceDateIso = "2026-10-26",
): SpreadsheetRowFormulaMetrics {
  const rowIndex = row.episodeNumber + 1;
  const totalCount = SPREADSHEET_PROCESS_COLUMNS.length;
  let completedCount = 0;

  for (const col of SPREADSHEET_PROCESS_COLUMNS) {
    if (row.cells[col.key]?.checked) {
      completedCount += 1;
    }
  }

  const completionPercent = Math.round((completedCount / totalCount) * 100);
  const formulaExpression = `=ROUND(COUNTIF(B${rowIndex}:H${rowIndex}, TRUE)/${totalCount}*100, 0)&"%"`;

  const refTime = new Date(`${referenceDateIso}T00:00:00.000Z`).getTime();
  const dueTime = new Date(`${row.deadlineDateIso}T00:00:00.000Z`).getTime();
  const daysUntilDeadline = Number.isFinite(dueTime - refTime)
    ? Math.round((dueTime - refTime) / 86_400_000)
    : 7;

  let conditionalTone: ConditionalFormatTone = "in-progress";
  if (completionPercent >= 100) {
    conditionalTone = "completed";
  } else if (daysUntilDeadline < 0) {
    conditionalTone = "overdue";
  } else if (daysUntilDeadline <= 2) {
    conditionalTone = "due-soon";
  }

  return {
    episodeId: row.episodeId,
    completedCount,
    totalCount,
    completionPercent,
    formulaExpression,
    conditionalTone,
    daysUntilDeadline,
  };
}

/**
 * 스프레드시트 특정 회차×공정 셀의 체크박스 값을 토글한다.
 */
export function toggleSpreadsheetChecklistCell(
  rows: readonly SpreadsheetEpisodeChecklistRow[],
  episodeId: string,
  processKey: SpreadsheetProcessColumnKey,
  updatedAtIso = "2026-10-26T10:30:00.000Z",
): readonly SpreadsheetEpisodeChecklistRow[] {
  return rows.map((row) => {
    if (row.episodeId !== episodeId) return row;
    const currentCell = row.cells[processKey];
    return {
      ...row,
      cells: {
        ...row.cells,
        [processKey]: {
          ...currentCell,
          checked: !currentCell.checked,
          updatedAtIso,
        },
      },
    };
  });
}

/**
 * 담당 어시스턴트 이름 또는 조건부 서식 상태로 체크리스트 행을 필터링한다 (Google Sheets Filter View).
 */
export function filterSpreadsheetChecklistRows(
  rows: readonly SpreadsheetEpisodeChecklistRow[],
  options: {
    readonly assigneeFilter?: string;
    readonly toneFilter?: ConditionalFormatTone | "all";
    readonly referenceDateIso?: string;
  },
): readonly SpreadsheetEpisodeChecklistRow[] {
  const normalizedAssignee = (options.assigneeFilter ?? "all").trim();
  const toneFilter = options.toneFilter ?? "all";
  const refDate = options.referenceDateIso ?? "2026-10-26";

  return rows.filter((row) => {
    if (normalizedAssignee !== "all" && normalizedAssignee !== "") {
      const hasAssignee = SPREADSHEET_PROCESS_COLUMNS.some(
        (col) => row.cells[col.key]?.assigneeName === normalizedAssignee,
      );
      if (!hasAssignee) return false;
    }
    if (toneFilter !== "all") {
      const metrics = computeSpreadsheetRowFormulaMetrics(row, refDate);
      if (metrics.conditionalTone !== toneFilter) return false;
    }
    return true;
  });
}

/**
 * 스프레드시트 마감 체크리스트를 엑셀·구글 시트 호환 CSV 또는 TSV 문자열로 직렬화한다.
 */
export function exportChecklistToDelimitedText(
  rows: readonly SpreadsheetEpisodeChecklistRow[],
  delimiter: "," | "\t" = ",",
  referenceDateIso = "2026-10-26",
): string {
  const headers = [
    "회차",
    "제목",
    "마감일",
    ...SPREADSHEET_PROCESS_COLUMNS.map((c) => c.label),
    "진행률(%)",
    "상태",
  ];

  const lines = [headers.join(delimiter)];
  for (const row of rows) {
    const metrics = computeSpreadsheetRowFormulaMetrics(row, referenceDateIso);
    const cellFlags = SPREADSHEET_PROCESS_COLUMNS.map((col) =>
      row.cells[col.key]?.checked ? "TRUE" : "FALSE",
    );
    const values = [
      `${row.episodeNumber}화`,
      row.episodeTitle,
      row.deadlineDateIso,
      ...cellFlags,
      `${metrics.completionPercent}%`,
      CONDITIONAL_FORMAT_LABELS[metrics.conditionalTone],
    ];
    lines.push(values.join(delimiter));
  }
  return lines.join("\n");
}

/**
 * 신규 회차를 위한 구글 드라이브 표준 원고 공유 폴더 트리(7개 공정 폴더)를 자동 프로비저닝한다.
 */
export function provisionEpisodeDriveFolderTree(params: {
  readonly workFolderName: string;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly syncedAtIso?: string;
}): readonly DriveManuscriptSyncFolderNode[] {
  const paddedEp = String(params.episodeNumber).padStart(2, "0");
  const syncedAtIso = params.syncedAtIso ?? "2026-10-26T09:00:00.000Z";

  return SPREADSHEET_PROCESS_COLUMNS.map((col, idx) => ({
    folderId: `drive-${params.episodeId}-${col.key}`,
    episodeId: params.episodeId,
    episodeNumber: params.episodeNumber,
    processKey: col.key,
    folderPath: `/${params.workFolderName}/EP${paddedEp}_${params.episodeNumber}화/${col.folderPrefix}`,
    latestFileName: `EP${paddedEp}_${col.folderPrefix}_v1.${idx === 0 ? "pdf" : "clip"}`,
    fileCount: 1,
    totalSizeMb: idx === 4 ? 145 : 42,
    syncState: "synced",
    revisionTag: "rev-1",
    lastSyncedAtIso: syncedAtIso,
    conflictDetail: null,
  }));
}

/**
 * 구글 드라이브 상시 동기화 패스를 실행하여 `uploading` 또는 `offline-queued` 상태의 원고 폴더를
 * 최신 리비전 `synced` 상태로 일괄 전이한다 (`conflict` 상태는 명시적 해결 전까지 보존).
 */
export function triggerDriveContinuousSyncPass(
  folders: readonly DriveManuscriptSyncFolderNode[],
  syncedAtIso = "2026-10-26T11:00:00.000Z",
): {
  readonly folders: readonly DriveManuscriptSyncFolderNode[];
  readonly newlySyncedCount: number;
} {
  let newlySyncedCount = 0;
  const updated = folders.map((folder) => {
    if (folder.syncState === "uploading" || folder.syncState === "offline-queued") {
      newlySyncedCount += 1;
      const nextRevNum =
        Number(folder.revisionTag.replace(/[^0-9]/g, "") || "1") + 1;
      return {
        ...folder,
        syncState: "synced" as const,
        revisionTag: `rev-${nextRevNum}`,
        lastSyncedAtIso: syncedAtIso,
      };
    }
    return folder;
  });

  return { folders: updated, newlySyncedCount };
}

/**
 * 구글 드라이브 원고 공유 폴더에서 발생한 동시 편집 충돌(`conflict`)을 해결하고 상시 동기화 상태로 복구한다.
 */
export function resolveDriveFolderConflict(
  folders: readonly DriveManuscriptSyncFolderNode[],
  folderId: string,
  strategy: DriveConflictResolutionStrategy,
  resolvedAtIso = "2026-10-26T11:15:00.000Z",
): readonly DriveManuscriptSyncFolderNode[] {
  return folders.map((folder) => {
    if (folder.folderId !== folderId) return folder;
    const baseName = folder.latestFileName.replace(/\.[^.]+$/, "");
    const ext = folder.latestFileName.includes(".")
      ? folder.latestFileName.slice(folder.latestFileName.lastIndexOf("."))
      : ".clip";

    return {
      ...folder,
      syncState: "synced",
      fileCount:
        strategy === "keep-both-with-suffix" ? folder.fileCount + 1 : folder.fileCount,
      latestFileName:
        strategy === "keep-both-with-suffix"
          ? `${baseName}_병합보존본${ext}`
          : `${baseName}_최신통합본${ext}`,
      revisionTag: `${folder.revisionTag}-resolved`,
      lastSyncedAtIso: resolvedAtIso,
      conflictDetail: null,
    };
  });
}
