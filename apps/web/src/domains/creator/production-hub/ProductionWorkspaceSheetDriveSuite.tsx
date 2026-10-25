import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  FileSpreadsheet,
  FolderSync,
  HardDrive,
  RefreshCw,
} from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  CONDITIONAL_FORMAT_LABELS,
  DRIVE_SYNC_STATE_LABELS,
  SPREADSHEET_PROCESS_COLUMNS,
  computeSpreadsheetRowFormulaMetrics,
  exportChecklistToDelimitedText,
  filterSpreadsheetChecklistRows,
  provisionEpisodeDriveFolderTree,
  resolveDriveFolderConflict,
  toggleSpreadsheetChecklistCell,
  triggerDriveContinuousSyncPass,
  type ConditionalFormatTone,
  type DriveManuscriptSyncFolderNode,
  type SpreadsheetEpisodeChecklistRow,
  type SpreadsheetProcessCell,
  type SpreadsheetProcessColumnKey,
} from "./production-workspace-sheet-drive-model";

function buildCells(
  episodeId: string,
  checkedKeys: readonly SpreadsheetProcessColumnKey[],
  assignees: Readonly<Partial<Record<SpreadsheetProcessColumnKey, string>>>,
): Readonly<Record<SpreadsheetProcessColumnKey, SpreadsheetProcessCell>> {
  const checkedSet = new Set(checkedKeys);
  const record = {} as Record<SpreadsheetProcessColumnKey, SpreadsheetProcessCell>;
  for (const col of SPREADSHEET_PROCESS_COLUMNS) {
    record[col.key] = {
      processKey: col.key,
      checked: checkedSet.has(col.key),
      assigneeName: assignees[col.key] ?? "작가 직접",
      driveFolderId: `drive-${episodeId}-${col.key}`,
      updatedAtIso: "2026-10-26T09:00:00.000Z",
    };
  }
  return record;
}

const INITIAL_CHECKLIST_ROWS: readonly SpreadsheetEpisodeChecklistRow[] = [
  {
    episodeId: "ep-101",
    episodeNumber: 1,
    episodeTitle: "1화 · 잿빛 성채의 귀환자",
    deadlineDateIso: "2026-10-24",
    cells: buildCells(
      "ep-101",
      [
        "storyboard",
        "lineart",
        "flatColor",
        "shading",
        "background",
        "typesetting",
        "finalManuscript",
      ],
      {
        lineart: "김지현",
        flatColor: "박민수",
        shading: "박민수",
        background: "이서연",
        typesetting: "최유진",
      },
    ),
  },
  {
    episodeId: "ep-102",
    episodeNumber: 2,
    episodeTitle: "2화 · 심야의 검은 마탑",
    deadlineDateIso: "2026-10-27",
    cells: buildCells(
      "ep-102",
      ["storyboard", "lineart", "flatColor", "shading", "background"],
      {
        lineart: "김지현",
        flatColor: "박민수",
        shading: "박민수",
        background: "이서연",
        typesetting: "최유진",
      },
    ),
  },
  {
    episodeId: "ep-103",
    episodeNumber: 3,
    episodeTitle: "3화 · 황실 연회장의 암투",
    deadlineDateIso: "2026-10-25",
    cells: buildCells("ep-103", ["storyboard", "lineart"], {
      lineart: "김지현",
      flatColor: "박민수",
      shading: "박민수",
      background: "이서연",
      typesetting: "최유진",
    }),
  },
];

const INITIAL_DRIVE_FOLDERS: readonly DriveManuscriptSyncFolderNode[] = [
  ...provisionEpisodeDriveFolderTree({
    workFolderName: "잿빛성채의귀환자_공유원고",
    episodeId: "ep-101",
    episodeNumber: 1,
  }),
  ...provisionEpisodeDriveFolderTree({
    workFolderName: "잿빛성채의귀환자_공유원고",
    episodeId: "ep-102",
    episodeNumber: 2,
  }).map((folder) => {
    if (folder.processKey === "shading") {
      return {
        ...folder,
        syncState: "uploading" as const,
        latestFileName: "EP02_04_명암_34~72컷_수정.clip",
        totalSizeMb: 88,
      };
    }
    if (folder.processKey === "typesetting") {
      return {
        ...folder,
        syncState: "conflict" as const,
        latestFileName: "EP02_06_식자_대사수정본.psd",
        conflictDetail:
          "작가 로컬 PC와 식자 어시스턴트(최유진) 드라이브 동기화본이 동시에 수정됨",
      };
    }
    return folder;
  }),
  ...provisionEpisodeDriveFolderTree({
    workFolderName: "잿빛성채의귀환자_공유원고",
    episodeId: "ep-103",
    episodeNumber: 3,
  }).map((folder) =>
    folder.processKey === "lineart"
      ? {
          ...folder,
          syncState: "offline-queued" as const,
          latestFileName: "EP03_02_선화_1~40컷.clip",
        }
      : folder,
  ),
];

export function ProductionWorkspaceSheetDriveSuite() {
  const [rows, setRows] =
    useState<readonly SpreadsheetEpisodeChecklistRow[]>(INITIAL_CHECKLIST_ROWS);
  const [driveFolders, setDriveFolders] =
    useState<readonly DriveManuscriptSyncFolderNode[]>(INITIAL_DRIVE_FOLDERS);

  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [toneFilter, setToneFilter] = useState<ConditionalFormatTone | "all">("all");
  const [selectedEpisodeForDrive, setSelectedEpisodeForDrive] =
    useState<string>("ep-102");
  const [focusedFolderId, setFocusedFolderId] = useState<string>(
    "drive-ep-102-typesetting",
  );
  const [exportedSheetText, setExportedSheetText] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const visibleRows = useMemo(
    () =>
      filterSpreadsheetChecklistRows(rows, {
        assigneeFilter,
        toneFilter,
        referenceDateIso: "2026-10-26",
      }),
    [rows, assigneeFilter, toneFilter],
  );

  const episodeDriveFolders = useMemo(
    () =>
      driveFolders.filter((folder) => folder.episodeId === selectedEpisodeForDrive),
    [driveFolders, selectedEpisodeForDrive],
  );

  const syncSummary = useMemo(() => {
    const synced = driveFolders.filter((f) => f.syncState === "synced").length;
    const pending = driveFolders.filter(
      (f) => f.syncState === "uploading" || f.syncState === "offline-queued",
    ).length;
    const conflicts = driveFolders.filter((f) => f.syncState === "conflict").length;
    return { total: driveFolders.length, synced, pending, conflicts };
  }, [driveFolders]);

  const handleToggleCell = (
    episodeId: string,
    processKey: SpreadsheetProcessColumnKey,
  ) => {
    setRows((prev) => toggleSpreadsheetChecklistCell(prev, episodeId, processKey));
    setSelectedEpisodeForDrive(episodeId);
    setFocusedFolderId(`drive-${episodeId}-${processKey}`);
  };

  const handleExportSheet = (delimiter: "," | "\t") => {
    const text = exportChecklistToDelimitedText(rows, delimiter, "2026-10-26");
    setExportedSheetText(text);
    setStatusBanner(
      delimiter === ","
        ? "구글 스프레드시트/엑셀 호환 CSV 마감 체크리스트 데이터를 생성했습니다."
        : "구글 스프레드시트 붙여넣기용 TSV 데이터를 생성했습니다.",
    );
  };

  const handleRunContinuousSyncPass = () => {
    const result = triggerDriveContinuousSyncPass(driveFolders);
    setDriveFolders(result.folders);
    setStatusBanner(
      `구글 드라이브 상시 동기화 패스를 실행하여 대기 중이던 원고 폴더 ${result.newlySyncedCount}개를 최신 리비전으로 동기화했습니다.`,
    );
  };

  const handleResolveConflict = (
    folderId: string,
    strategy: "keep-latest-revision" | "keep-both-with-suffix",
  ) => {
    setDriveFolders((prev) => resolveDriveFolderConflict(prev, folderId, strategy));
    setStatusBanner(
      strategy === "keep-both-with-suffix"
        ? "버전 충돌 폴더를 양쪽 사본 보존 방식으로 안전하게 병합하고 상시 동기화를 재개했습니다."
        : "버전 충돌 폴더를 최신 리비전 우선 방식으로 통합하고 상시 동기화를 재개했습니다.",
    );
  };

  const handleProvisionNextEpisodeFolder = () => {
    const nextNum =
      rows.length > 0 ? Math.max(...rows.map((r) => r.episodeNumber)) + 1 : 1;
    const nextEpId = `ep-10${nextNum}`;
    const newRow: SpreadsheetEpisodeChecklistRow = {
      episodeId: nextEpId,
      episodeNumber: nextNum,
      episodeTitle: `${nextNum}화 · 신규 연재 준비 회차`,
      deadlineDateIso: "2026-11-03",
      cells: buildCells(nextEpId, ["storyboard"], {
        lineart: "김지현",
        flatColor: "박민수",
        shading: "박민수",
        background: "이서연",
        typesetting: "최유진",
      }),
    };
    const newFolders = provisionEpisodeDriveFolderTree({
      workFolderName: "잿빛성채의귀환자_공유원고",
      episodeId: nextEpId,
      episodeNumber: nextNum,
    });
    setRows((prev) => [...prev, newRow]);
    setDriveFolders((prev) => [...prev, ...newFolders]);
    setSelectedEpisodeForDrive(nextEpId);
    setStatusBanner(
      `${nextNum}화 시트 체크리스트 행과 구글 드라이브 7대 공정 공유 폴더 트리를 자동 생성해 상시 동기화에 연결했습니다.`,
    );
  };

  return (
    <section
      aria-label="구글 워크스페이스 스프레드시트 마감 체크리스트 및 드라이브 원고 공유 폴더 상시 동기화"
      className="rounded-3xl border border-line bg-card p-5 shadow-sm space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Google Workspace · Sheets Deadline Checklist &amp; Drive Continuous Sync
          </div>
          <h3 className="mt-1 text-xl font-black text-fg">
            스프레드시트 마감 체크리스트 &amp; 구글 드라이브 원고 공유 폴더 상시 동기화
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            복잡한 설정 없이 엑셀·스프레드시트 형태의 공유 표로 공정별 마감을 체크하고, 각 셀과 연결된 원고 공유 폴더를 상시 동기화 상태로 유지합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportSheet(",")}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <Download className="size-3.5" aria-hidden="true" />
            CSV 시트 내보내기
          </button>
          <button
            type="button"
            onClick={() => handleExportSheet("\t")}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            TSV 클립보드 포맷
          </button>
          <button
            type="button"
            onClick={handleProvisionNextEpisodeFolder}
            className={buttonClass({ size: "sm" })}
          >
            <FolderSync className="size-3.5" aria-hidden="true" />
            다음 회차 시트+공유폴더 자동 생성
          </button>
        </div>
      </header>

      {statusBanner ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-xs font-semibold text-fg"
        >
          <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>{statusBanner}</span>
        </div>
      ) : null}

      {/* 1. 구글 스프레드시트(Google Sheets) 스타일 마감 체크리스트 표 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 font-semibold text-fg-2">
              담당자 필터 뷰 (Filter View)
              <select
                aria-label="스프레드시트 담당자 필터"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="min-h-8 rounded-lg border border-line bg-card px-2 text-fg"
              >
                <option value="all">전체 작업자</option>
                <option value="작가 직접">작가 직접</option>
                <option value="김지현">김지현 (선화)</option>
                <option value="박민수">박민수 (밑색·명암)</option>
                <option value="이서연">이서연 (배경)</option>
                <option value="최유진">최유진 (식자)</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5 font-semibold text-fg-2">
              조건부 서식 필터
              <select
                aria-label="스프레드시트 조건부 서식 상태 필터"
                value={toneFilter}
                onChange={(e) =>
                  setToneFilter(e.target.value as ConditionalFormatTone | "all")
                }
                className="min-h-8 rounded-lg border border-line bg-card px-2 text-fg"
              >
                <option value="all">모든 행 표시</option>
                <option value="overdue">마감 기한 초과 (적색 강조)</option>
                <option value="due-soon">마감 임박 D-2 (황색 강조)</option>
                <option value="completed">100% 마감 완료 (녹색 강조)</option>
                <option value="in-progress">정상 진행 중</option>
              </select>
            </label>
          </div>

          <span className="font-mono text-[0.6875rem] text-fg-3">
            fx =ROUND(COUNTIF(B2:H2, TRUE)/7*100, 0)&amp;&quot;%&quot;
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line">
          <table
            aria-label="스프레드시트 회차별 공정 마감 체크리스트"
            className="w-full border-collapse text-left text-xs"
          >
            <thead className="border-b border-line bg-raised text-fg-2">
              <tr>
                <th className="border-r border-line p-2.5 font-bold">A · 회차 / 마감일</th>
                {SPREADSHEET_PROCESS_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="border-r border-line p-2.5 text-center font-bold"
                  >
                    {col.code} · {col.label}
                  </th>
                ))}
                <th className="border-r border-line p-2.5 text-right font-bold">
                  I · 진행률 수식
                </th>
                <th className="p-2.5 font-bold">J · 조건부 서식</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {visibleRows.map((row) => {
                const metrics = computeSpreadsheetRowFormulaMetrics(row, "2026-10-26");
                const rowToneClass =
                  metrics.conditionalTone === "completed"
                    ? "bg-good/5"
                    : metrics.conditionalTone === "overdue"
                      ? "bg-bad/5"
                      : metrics.conditionalTone === "due-soon"
                        ? "bg-warn/5"
                        : "";
                return (
                  <tr key={row.episodeId} className={rowToneClass}>
                    <td className="border-r border-line p-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedEpisodeForDrive(row.episodeId)}
                        className="text-left font-black text-fg hover:underline"
                      >
                        {row.episodeTitle}
                      </button>
                      <p className="text-[0.6875rem] text-fg-3">
                        마감: {row.deadlineDateIso}
                      </p>
                    </td>
                    {SPREADSHEET_PROCESS_COLUMNS.map((col) => {
                      const cell = row.cells[col.key];
                      const linkedFolder = driveFolders.find(
                        (f) => f.folderId === cell.driveFolderId,
                      );
                      return (
                        <td
                          key={col.key}
                          className="border-r border-line p-2 text-center align-middle"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              aria-label={`${row.episodeTitle} ${col.label} 마감 체크`}
                              checked={cell.checked}
                              onChange={() => handleToggleCell(row.episodeId, col.key)}
                              className="size-4 accent-accent cursor-pointer"
                            />
                            <span className="text-[0.625rem] font-semibold text-fg-2">
                              {cell.assigneeName}
                            </span>
                            {linkedFolder ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEpisodeForDrive(row.episodeId);
                                  setFocusedFolderId(linkedFolder.folderId);
                                }}
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[0.625rem] font-bold",
                                  linkedFolder.syncState === "conflict"
                                    ? "bg-bad/15 text-bad"
                                    : linkedFolder.syncState === "synced"
                                      ? "bg-good/15 text-good"
                                      : "bg-warn/15 text-warn",
                                )}
                              >
                                {linkedFolder.syncState === "conflict"
                                  ? "충돌"
                                  : linkedFolder.syncState === "synced"
                                    ? "동기화됨"
                                    : "동기화대기"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-r border-line p-2.5 text-right font-mono font-black text-fg">
                      <div>{metrics.completionPercent}%</div>
                      <div className="text-[0.625rem] font-normal text-fg-3">
                        ({metrics.completedCount}/{metrics.totalCount})
                      </div>
                    </td>
                    <td className="p-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
                          metrics.conditionalTone === "completed"
                            ? "border-good/40 bg-good/10 text-good"
                            : metrics.conditionalTone === "overdue"
                              ? "border-bad/40 bg-bad/10 text-bad"
                              : metrics.conditionalTone === "due-soon"
                                ? "border-warn/40 bg-warn/10 text-warn"
                                : "border-line bg-card text-fg-2",
                        )}
                      >
                        {CONDITIONAL_FORMAT_LABELS[metrics.conditionalTone]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {exportedSheetText ? (
          <div className="rounded-xl border border-line bg-panel p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-fg">
                내보낸 스프레드시트 원문 데이터 프리뷰
              </span>
              <button
                type="button"
                onClick={() => setExportedSheetText(null)}
                className="text-fg-3 underline"
              >
                닫기
              </button>
            </div>
            <pre
              data-testid="exported-sheet-preview"
              className="mt-2 overflow-x-auto rounded bg-card p-2.5 font-mono text-[0.6875rem] text-fg-2"
            >
              {exportedSheetText}
            </pre>
          </div>
        ) : null}
      </div>

      {/* 2. 구글 드라이브(Google Drive) 연동 원고 공유 폴더 상시 동기화 허브 */}
      <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <HardDrive className="size-4 text-accent" aria-hidden="true" />
              구글 드라이브 원고 공유 폴더 상시 동기화 모니터 (`DriveFS` 브리지)
            </h4>
            <p className="mt-0.5 text-xs text-fg-2">
              전체 폴더 {syncSummary.total}개 · 동기화 완료 {syncSummary.synced}개 ·
              업로드/오프라인 대기 {syncSummary.pending}개 · 충돌 감지{" "}
              <strong className={syncSummary.conflicts > 0 ? "text-bad" : "text-fg"}>
                {syncSummary.conflicts}개
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="드라이브 공유 폴더 회차 선택"
              value={selectedEpisodeForDrive}
              onChange={(e) => setSelectedEpisodeForDrive(e.target.value)}
              className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-bold text-fg"
            >
              {rows.map((r) => (
                <option key={r.episodeId} value={r.episodeId}>
                  {r.episodeTitle} 공유 폴더 트리
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRunContinuousSyncPass}
              className={buttonClass({ size: "sm" })}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              상시 동기화 즉시 실행 ({syncSummary.pending}건 대기)
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {episodeDriveFolders.map((folder) => {
            const isFocused = folder.folderId === focusedFolderId;
            return (
              <article
                key={folder.folderId}
                aria-label={`${folder.folderPath} 동기화 폴더`}
                className={cn(
                  "rounded-xl border bg-card p-3 text-xs space-y-2",
                  folder.syncState === "conflict"
                    ? "border-bad/50"
                    : isFocused
                      ? "border-accent"
                      : "border-line",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <code className="break-all font-bold text-fg">
                    {folder.folderPath}
                  </code>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold",
                      folder.syncState === "synced"
                        ? "border-good/40 bg-good/10 text-good"
                        : folder.syncState === "conflict"
                          ? "border-bad/40 bg-bad/10 text-bad"
                          : "border-warn/40 bg-warn/10 text-warn",
                    )}
                  >
                    {DRIVE_SYNC_STATE_LABELS[folder.syncState]}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[0.6875rem] text-fg-2">
                  <span className="truncate font-semibold">
                    <CloudUpload className="mr-1 inline size-3.5 text-accent" />
                    {folder.latestFileName}
                  </span>
                  <span className="shrink-0 font-mono">
                    {folder.totalSizeMb}MB · {folder.revisionTag}
                  </span>
                </div>

                {folder.conflictDetail ? (
                  <div className="rounded-lg border border-bad/35 bg-bad/10 p-2 space-y-2">
                    <p className="flex items-center gap-1 font-bold text-bad">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      {folder.conflictDetail}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleResolveConflict(
                            folder.folderId,
                            "keep-both-with-suffix",
                          )
                        }
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        양쪽 사본 보존 병합
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleResolveConflict(
                            folder.folderId,
                            "keep-latest-revision",
                          )
                        }
                        className={buttonClass({ size: "sm" })}
                      >
                        최신 리비전 우선 통합
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
