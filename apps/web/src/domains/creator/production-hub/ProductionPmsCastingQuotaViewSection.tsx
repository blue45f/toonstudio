import { useMemo, useState } from "react";
import {
  WEBTOON_ASSISTANT_ROLE_CATALOG,
  adjustCutAssetCasting,
  bulkCastAssetToCutRange,
  computeAssistantQuotasAndVariance,
  copyCutCastingToTargets,
  evaluateEpisodeAssetReadinessAndLicense,
  exportAssetBreakdownCsv,
  projectNotionProductionDatabase,
  type AssistantCutTaskItem,
  type AssistantQuotaTaskLog,
  type CutAssetCastingEntry,
  type NotionDatabaseViewKind,
  type StudioProductionAsset,
  type WebtoonAssistantRole,
} from "./production-pms-blueprint-model";

const INITIAL_STUDIO_ASSETS: readonly StudioProductionAsset[] = [
  {
    id: "asset-char-kael",
    name: "카엘 북부 대공 전신 컬러시트",
    category: "character-sheet",
    status: "approved",
    licenseTier: "studio-owned",
    formats: ["clip", "png"],
    aiTrainingRestricted: true,
    isGlobalLibraryAsset: true,
  },
  {
    id: "asset-bg-citadel",
    name: "북부 잿빛 성채 알현실 3D 세트",
    category: "background-3d",
    status: "approved",
    licenseTier: "pitch-50off",
    formats: ["skp", "cs3o"],
    aiTrainingRestricted: true,
    isGlobalLibraryAsset: false,
  },
  {
    id: "asset-prop-carriage",
    name: "황실 사절단 4두 마차 (.cs3o)",
    category: "prop",
    status: "wip",
    licenseTier: "commercial-serialization",
    formats: ["cs3o", "skp"],
    aiTrainingRestricted: true,
    isGlobalLibraryAsset: true,
  },
];

const INITIAL_CASTINGS: readonly CutAssetCastingEntry[] = [
  { cutId: "CUT001", assetId: "asset-char-kael", quantity: 1 },
  { cutId: "CUT001", assetId: "asset-bg-citadel", quantity: 1 },
  { cutId: "CUT002", assetId: "asset-prop-carriage", quantity: 2 },
];

const SAMPLE_QUOTA_LOGS: readonly AssistantQuotaTaskLog[] = [
  {
    taskId: "q-line-1",
    assigneeId: "asst-line-1",
    assigneeName: "김선화 어시",
    role: "lineart",
    cutCount: 30,
    bidHours: 16,
    firstWipDateIso: "2026-10-20",
    firstWfaDateIso: "2026-10-21",
    timesheetHoursByDate: { "2026-10-20": 8, "2026-10-21": 10 },
  },
  {
    taskId: "q-shade-1",
    assigneeId: "asst-shade-1",
    assigneeName: "최명암 어시",
    role: "shading",
    cutCount: 24,
    bidHours: 16,
    firstWipDateIso: "2026-10-20",
    firstWfaDateIso: "2026-10-22",
    timesheetHoursByDate: { "2026-10-20": 8, "2026-10-21": 9, "2026-10-22": 7 },
  },
];

export interface ProductionPmsCastingQuotaViewSectionProps {
  readonly tasks: readonly AssistantCutTaskItem[];
  readonly onShiftLineartDelay: () => void;
}

export function ProductionPmsCastingQuotaViewSection({
  tasks,
  onShiftLineartDelay,
}: ProductionPmsCastingQuotaViewSectionProps) {
  const [assets, setAssets] = useState<readonly StudioProductionAsset[]>(INITIAL_STUDIO_ASSETS);
  const [castings, setCastings] = useState<readonly CutAssetCastingEntry[]>(INITIAL_CASTINGS);
  const [publicationMode, setPublicationMode] = useState<"pitch" | "commercial-serialization">(
    "commercial-serialization",
  );
  const [csvExportPreview, setCsvExportPreview] = useState<string | null>(null);

  const [quotaMode, setQuotaMode] = useState<"timesheet-weighted" | "status-first-take">(
    "timesheet-weighted",
  );
  const [targetDailyCuts, setTargetDailyCuts] = useState<number>(12);

  const [dbView, setDbView] = useState<NotionDatabaseViewKind>("table");
  const [roleFilter, setRoleFilter] = useState<WebtoonAssistantRole | "all">("all");
  const [isLeadOrPd, setIsLeadOrPd] = useState<boolean>(true);

  const assetDiagnostic = useMemo(
    () =>
      evaluateEpisodeAssetReadinessAndLicense({
        castings,
        assets,
        episodePublicationMode: publicationMode,
      }),
    [assets, castings, publicationMode],
  );

  const quotaSummaries = useMemo(
    () =>
      computeAssistantQuotasAndVariance({
        logs: SAMPLE_QUOTA_LOGS,
        mode: quotaMode,
        targetDailyCuts,
      }),
    [quotaMode, targetDailyCuts],
  );

  const notionDb = useMemo(
    () =>
      projectNotionProductionDatabase({
        tasks,
        view: dbView,
        roleFilter,
        viewerId: "asst-line-1",
        isLeadOrPd,
      }),
    [dbView, isLeadOrPd, roleFilter, tasks],
  );

  const handleUpgradeAssetLicense = (assetId: string) => {
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? { ...asset, licenseTier: "commercial-serialization", status: "approved" }
          : asset,
      ),
    );
  };

  return (
    <>
      {/* 3. Kitsu + 툰메이트 에셋 캐스팅 & 상업 라이선스 가드 */}
      <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-xs font-bold text-fg">
              3. Kitsu형 에셋 브레이크다운 캐스팅 (+1/+10/-1 · 범위 일괄 · 컷 복사) &amp; 툰메이트 라이선스 가드
            </strong>
            <p className="text-[0.6875rem] text-fg-2">
              투고용 50% 할인권 에셋이 정식 연재 원고에 캐스팅되거나 미승인 에셋이 포함되면 해당 컷을 즉시 차단 경고합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="원고 발행 모드"
              data-testid="asset-publication-mode-select"
              value={publicationMode}
              onChange={(e) =>
                setPublicationMode(e.target.value as "pitch" | "commercial-serialization")
              }
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              <option value="commercial-serialization">정식 연재 모드 (상업 이용권 필수)</option>
              <option value="pitch">투고·공모전 모드 (투고용 50% 할인권 허용)</option>
            </select>
            <button
              type="button"
              data-testid="bulk-cast-cut-range-btn"
              onClick={() =>
                setCastings((prev) =>
                  bulkCastAssetToCutRange(
                    prev,
                    ["CUT001", "CUT002", "CUT003"],
                    "asset-char-kael",
                    1,
                  ),
                )
              }
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              Shift 범위 일괄 캐스팅 (CUT001~003)
            </button>
            <button
              type="button"
              data-testid="copy-cut1-to-cut3-btn"
              onClick={() =>
                setCastings((prev) => copyCutCastingToTargets(prev, "CUT001", ["CUT003"]))
              }
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              CUT001 캐스팅 → CUT003 복사
            </button>
            <button
              type="button"
              data-testid="export-asset-breakdown-csv-btn"
              onClick={() => setCsvExportPreview(exportAssetBreakdownCsv(castings, assets))}
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              브레이크다운 CSV 내보내기
            </button>
          </div>
        </div>

        {assetDiagnostic.warnings.length > 0 ? (
          <div
            data-testid="asset-license-warning-box"
            className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-[0.6875rem] text-warn"
          >
            <div className="font-bold">
              차단 주의 컷({assetDiagnostic.blockedCutIds.join(", ")}):
            </div>
            <ul className="list-disc pl-4">
              {assetDiagnostic.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {assetDiagnostic.licenseViolationAssetIds.includes("asset-bg-citadel") ? (
              <button
                type="button"
                data-testid="upgrade-citadel-license-btn"
                onClick={() => handleUpgradeAssetLicense("asset-bg-citadel")}
                className="mt-1.5 rounded bg-accent px-2 py-0.5 text-[0.6875rem] font-bold text-on-accent"
              >
                북부 잿빛 성채 3D 세트 → 정식 연재 추가 이용권 전환 완료 처리
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          {assets.map((asset) => {
            const cut1Qty =
              castings.find((c) => c.cutId === "CUT001" && c.assetId === asset.id)?.quantity ?? 0;
            return (
              <div
                key={asset.id}
                className="rounded-lg border border-line bg-card p-2 text-[0.6875rem]"
              >
                <div className="flex items-center justify-between gap-1 font-bold text-fg">
                  <span>{asset.name}</span>
                  {asset.isGlobalLibraryAsset ? (
                    <span className="rounded border border-warn/50 bg-warn/15 px-1 text-[0.625rem] text-warn">
                      Global Library
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-fg-3">
                  포맷: {asset.formats.join(", ")} · 라이선스: {asset.licenseTier} ·{" "}
                  {asset.aiTrainingRestricted ? "AI 학습 금지" : "AI 허용"}
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span data-testid={`cut1-qty-${asset.id}`} className="font-semibold text-fg">
                    CUT001 수량: {cut1Qty}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`cast-plus1-${asset.id}`}
                      onClick={() =>
                        setCastings((prev) =>
                          adjustCutAssetCasting(prev, "CUT001", asset.id, 1),
                        )
                      }
                      className="rounded border border-line px-1.5 py-0.5 font-bold"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      data-testid={`cast-plus10-${asset.id}`}
                      onClick={() =>
                        setCastings((prev) =>
                          adjustCutAssetCasting(prev, "CUT001", asset.id, 10),
                        )
                      }
                      className="rounded border border-line px-1.5 py-0.5 font-bold"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      data-testid={`cast-minus1-${asset.id}`}
                      onClick={() =>
                        setCastings((prev) =>
                          adjustCutAssetCasting(prev, "CUT001", asset.id, -1),
                        )
                      }
                      className="rounded border border-line px-1.5 py-0.5 font-bold"
                    >
                      -1
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {csvExportPreview ? (
          <pre
            data-testid="asset-breakdown-csv-preview"
            className="overflow-x-auto rounded-lg border border-line bg-card p-2 text-[0.6875rem] text-fg-2"
          >
            {csvExportPreview}
          </pre>
        ) : null}
      </div>

      {/* 4. Kitsu형 Quotas (Timesheet vs WIP→WFA First-Take) & Bid vs Actual 편차 */}
      <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-xs font-bold text-fg">
            4. Kitsu형 일일 생산량 쿼터(Quotas) &amp; 예상 공수 대비 실투입 공수(Bid vs Actual Days) 분석
          </strong>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="쿼터 산출 기준"
              data-testid="quota-mode-select"
              value={quotaMode}
              onChange={(e) =>
                setQuotaMode(e.target.value as "timesheet-weighted" | "status-first-take")
              }
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              <option value="timesheet-weighted">타임시트 투입시간 가중치 기준</option>
              <option value="status-first-take">상태 전이(WIP→WFA First-Take) 기준</option>
            </select>
            <label className="flex items-center gap-1">
              <span>일일 목표 컷:</span>
              <input
                type="number"
                aria-label="일일 목표 컷"
                data-testid="quota-target-cuts-input"
                min={1}
                max={60}
                value={targetDailyCuts}
                onChange={(e) => setTargetDailyCuts(Number(e.target.value) || 10)}
                className="w-14 rounded border border-line bg-card px-2 py-0.5 text-xs"
              />
            </label>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {quotaSummaries.map((summary) => (
            <div
              key={summary.assigneeId}
              data-testid={`quota-card-${summary.assigneeId}`}
              className="rounded-lg border border-line bg-card p-2.5 text-xs"
            >
              <div className="flex items-center justify-between font-bold text-fg">
                <span>
                  {summary.assigneeName} ({WEBTOON_ASSISTANT_ROLE_CATALOG[summary.role].labelKo})
                </span>
                <span>달성률 {summary.quotaAchievementPercent}%</span>
              </div>
              <p className="mt-1 text-[0.6875rem] text-fg-2">
                일평균 {summary.averageDailyCuts}컷 (목표 {summary.targetDailyCuts}컷) · 총{" "}
                {summary.totalCompletedCuts}컷 / {summary.activeDaysCount}일
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-fg-3">
                예상 공수(Bid): {summary.bidPersonDays}인일 · 실투입(Actual):{" "}
                {summary.actualPersonDays}인일 · 편차:{" "}
                {summary.variancePersonDays > 0
                  ? `+${summary.variancePersonDays}`
                  : summary.variancePersonDays}
                인일 ({summary.estimationHealth})
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 노션형 연결 데이터베이스 다중 뷰 & 종속성 연쇄 시프트 */}
      <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-xs font-bold text-fg">
              5. 노션(Notion)형 연결 데이터베이스 다중 뷰 &amp; 종속 작업 마감 자동 밀기
            </strong>
            <p data-testid="notion-rollup-summary" className="text-[0.6875rem] text-fg-2">
              롤업 완료율: {notionDb.rollup.cutCompletionPercent}% ({notionDb.rollup.completedCuts}/
              {notionDb.rollup.totalCuts}컷) · 진행/대기 {notionDb.rollup.readyOrWipCount}건
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["table", "kanban", "timeline", "assistant-matrix"] as const).map((v) => (
              <button
                key={v}
                type="button"
                data-testid={`notion-view-btn-${v}`}
                onClick={() => setDbView(v)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  dbView === v
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-card text-fg-2"
                }`}
              >
                {v === "table"
                  ? "테이블 뷰"
                  : v === "kanban"
                    ? "칸반 보드"
                    : v === "timeline"
                      ? "타임라인"
                      : "어시스턴트 매트릭스"}
              </button>
            ))}
            <select
              aria-label="노션 DB 역할 필터"
              data-testid="notion-role-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as WebtoonAssistantRole | "all")}
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-fg"
            >
              <option value="all">전체 공정</option>
              {Object.values(WEBTOON_ASSISTANT_ROLE_CATALOG).map((m) => (
                <option key={m.role} value={m.role}>
                  {m.labelKo}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                data-testid="notion-lead-permission-toggle"
                checked={isLeadOrPd}
                onChange={(e) => setIsLeadOrPd(e.target.checked)}
              />
              <span>메인작가/PD 전체 편집 권한</span>
            </label>
            <button
              type="button"
              data-testid="cascade-shift-dependent-tasks-btn"
              onClick={onShiftLineartDelay}
              className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg"
            >
              선화 지연 +2일 → 후속 공정 자동 밀기
            </button>
          </div>
        </div>

        <div
          data-testid="notion-db-active-view"
          data-view-mode={notionDb.view}
          className="grid gap-1.5"
        >
          {notionDb.filteredTasks.map((row) => (
            <div
              key={row.id}
              data-testid={`notion-row-${row.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-fg">
                  [{row.episodeNumber}화 {row.cutRangeLabel}]{" "}
                  {WEBTOON_ASSISTANT_ROLE_CATALOG[row.role].labelKo}
                </span>
                <span className="text-fg-2">{row.assigneeName}</span>
                <span
                  data-testid={`notion-row-status-${row.id}`}
                  className="rounded bg-panel px-1.5 py-0.5 text-[0.6875rem] font-bold text-fg"
                >
                  {row.status}
                </span>
                {row.inputFileName ? (
                  <span
                    data-testid={`notion-row-input-file-${row.id}`}
                    className="text-[0.6875rem] text-accent"
                  >
                    인계 입력: {row.inputFileName}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-[0.6875rem] text-fg-3">
                <span data-testid={`notion-row-due-${row.id}`}>마감: {row.dueDateIso}</span>
                <span data-testid={`notion-row-perm-${row.id}`}>
                  {row.canEditRow ? "편집 가능" : "읽기 전용(타 담당)"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
