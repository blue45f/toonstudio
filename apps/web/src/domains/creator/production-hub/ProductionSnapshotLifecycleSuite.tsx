import { useState } from "react";
import {
  buildTextBlockDeepLink,
  checkVisibilityScopeNarrowing,
  classifySnapshotPageDiff,
  computeEpisodeTotalCutCount,
  computeTextBlockSideBySideDiff,
  computeWorkerContributionSplit,
  deriveProcessStartedAtIso,
  type OpenFeedbackFinalizeAction,
  type SnapshotCompletionStage,
  type SnapshotPageDiffBadge,
  type SnapshotPageInspectorItem,
  type SnapshotUploadMode,
  type SnapshotVisibilityScope,
  type SnapshotWorkerInput,
  type TextProcessBlockItem,
  type WorkerContributionSplitMode,
} from "./production-snapshot-lifecycle-model";

const DIFF_BADGE_LABELS: Readonly<Record<SnapshotPageDiffBadge, { readonly label: string; readonly bg: string; readonly color: string }>> = {
  new: { label: "신규 등록", bg: "#dcfce7", color: "#166534" },
  updated: { label: "업데이트", bg: "#dbeafe", color: "#1e40af" },
  "duplicate-skipped": { label: "중복 생략", bg: "#fef3c7", color: "#92400e" },
  unchanged: { label: "변경 없음", bg: "#f1f5f9", color: "#475569" },
  empty: { label: "결과물 없음", bg: "#fee2e2", color: "#991b1b" },
};

const INITIAL_PAGES: readonly SnapshotPageInspectorItem[] = [
  {
    pageNumber: 1,
    fileName: "ep12_p01_v3.png",
    byteHash: "sha256-a11f",
    widthPx: 1440,
    heightPx: 10800,
    byteSize: 4_820_000,
    cutCount: 16,
    diffBadge: classifySnapshotPageDiff({ previousHash: "sha256-a10e", nextHash: "sha256-a11f" }),
  },
  {
    pageNumber: 2,
    fileName: "ep12_p02_v3.png",
    byteHash: "sha256-b22c",
    widthPx: 1440,
    heightPx: 9600,
    byteSize: 4_110_000,
    cutCount: 14,
    diffBadge: classifySnapshotPageDiff({ previousHash: "sha256-b22c", nextHash: "sha256-b22c" }),
  },
  {
    pageNumber: 3,
    fileName: "ep12_p03_v3.png",
    byteHash: "sha256-b22c",
    widthPx: 1440,
    heightPx: 9600,
    byteSize: 4_110_000,
    cutCount: 15,
    diffBadge: classifySnapshotPageDiff({
      previousHash: "sha256-b22c",
      nextHash: "sha256-b22c",
      isDuplicateUpload: true,
    }),
  },
  {
    pageNumber: 4,
    fileName: "ep12_p04_v3.png",
    byteHash: "sha256-d44a",
    widthPx: 1440,
    heightPx: 11200,
    byteSize: 5_240_000,
    cutCount: 18,
    diffBadge: classifySnapshotPageDiff({ previousHash: null, nextHash: "sha256-d44a" }),
  },
  {
    pageNumber: 5,
    fileName: null,
    byteHash: null,
    widthPx: 0,
    heightPx: 0,
    byteSize: 0,
    cutCount: 0,
    diffBadge: classifySnapshotPageDiff({ previousHash: "sha256-e55b", nextHash: null }),
  },
];

const INITIAL_WORKERS: readonly SnapshotWorkerInput[] = [
  { workerId: "worker-1", workerName: "메인 선화 작가", workHours: 9 },
  { workerId: "worker-2", workerName: "배경 어시스턴트", workHours: 5 },
  { workerId: "worker-3", workerName: "식자·보정 담당", workHours: 2 },
];

const LEFT_TEXT_BLOCKS: readonly TextProcessBlockItem[] = [
  {
    blockId: "blk-scene-1",
    kind: "h1",
    content: "# 씬 1. 북부 성벽 야간 경비초소",
    feedbackCount: 2,
  },
  {
    blockId: "blk-dialogue-1",
    kind: "quote",
    content: "카엘: \"오늘 밤 안개가 유난히 짙군. 횃불 간격을 좁혀라.\"",
    feedbackCount: 1,
    orphanedFeedbackCount: 1,
  },
  {
    blockId: "blk-Legacy-note",
    kind: "text",
    content: "(초고 메모: 성문 수비대 교대 장면 — v3에서 생략 예정)",
    feedbackCount: 1,
  },
];

const RIGHT_TEXT_BLOCKS: readonly TextProcessBlockItem[] = [
  {
    blockId: "blk-scene-1",
    kind: "h1",
    content: "# 씬 1. 북부 성벽 야간 경비초소 (폭풍 전야)",
    feedbackCount: 2,
  },
  {
    blockId: "blk-dialogue-1",
    kind: "quote",
    content: "카엘: \"오늘 밤 안개가 유난히 짙군. 횃불 간격을 좁혀라.\"",
    feedbackCount: 1,
  },
  {
    blockId: "blk-sfx-added",
    kind: "bullet",
    content: "- 효과음: 쿠구구궁 (성벽 아래 지진 진동 연출 추가)",
    feedbackCount: 0,
  },
];

export function ProductionSnapshotLifecycleSuite() {
  const [uploadMode, setUploadMode] = useState<SnapshotUploadMode>("bulk");
  const [pdfAutoSplit, setPdfAutoSplit] = useState<boolean>(true);
  const [visibility, setVisibility] = useState<SnapshotVisibilityScope>("public");
  const [scopeWarning, setScopeWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [deleteUniqueAssetsToo, setDeleteUniqueAssetsToo] = useState<boolean>(false);

  const [completionStage, setCompletionStage] = useState<SnapshotCompletionStage>("in-progress");
  const [workDurationHours, setWorkDurationHours] = useState<number>(16);
  const [openFeedbackAction, setOpenFeedbackAction] = useState<OpenFeedbackFinalizeAction>("complete-all");
  const [splitMode, setSplitMode] = useState<WorkerContributionSplitMode>("time-proportional");

  const [pages, setPages] = useState<readonly SnapshotPageInspectorItem[]>(INITIAL_PAGES);
  const [manualTotalCuts, setManualTotalCuts] = useState<string>("");
  const [showBlankPlaceholders, setShowBlankPlaceholders] = useState<boolean>(true);
  const [copiedBlockLink, setCopiedBlockLink] = useState<string | null>(null);

  const firstUploadedIso = "2026-10-26T14:00:00.000Z";
  const derivedStartIso = deriveProcessStartedAtIso(firstUploadedIso, workDurationHours);
  const workerAllocations = computeWorkerContributionSplit(INITIAL_WORKERS, splitMode);
  const parsedManualOverride = manualTotalCuts.trim() === "" ? null : Number(manualTotalCuts);
  const cutSummary = computeEpisodeTotalCutCount(pages, parsedManualOverride);
  const textDiffRows = computeTextBlockSideBySideDiff(LEFT_TEXT_BLOCKS, RIGHT_TEXT_BLOCKS, {
    showBlankPlaceholders,
  });

  const handleVisibilityChange = (next: SnapshotVisibilityScope) => {
    const check = checkVisibilityScopeNarrowing(visibility, next);
    setVisibility(next);
    setScopeWarning(check.warningKo);
  };

  const handlePageCutChange = (pageNumber: number, nextCuts: number) => {
    setPages((prev) =>
      prev.map((page) =>
        page.pageNumber === pageNumber
          ? { ...page, cutCount: Math.max(0, Math.trunc(nextCuts)) }
          : page,
      ),
    );
  };

  const handleCopyBlockUrl = (blockId: string) => {
    const link = buildTextBlockDeepLink("https://app.toonstudio.io/projects/proj-1/episodes/12", blockId);
    setCopiedBlockLink(link);
  };

  return (
    <section
      aria-label="버전 라이프사이클·페이지 5종 배지 인스펙터·2단계 마감·텍스트 블록 Diff"
      data-testid="production-snapshot-lifecycle-suite"
      style={{
        display: "grid",
        gap: "0.9rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      {/* 1. 3종 업로드 모드 + 3단계 공개 범위 + 활성/아카이브 탭 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <strong style={{ fontSize: "0.95rem" }}>버전 업로드 모드 &amp; 3단계 공개 범위 · 아카이브 관리</strong>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            기본 일괄 업로드 · 개별 페이지 슬롯 업로드 · 기존 버전 페이지 조합 생성 및 PDF 페이지 자동 분할을 지원합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            data-testid="snapshot-tab-active-btn"
            aria-pressed={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            style={{
              padding: "0.25rem 0.65rem",
              fontSize: "0.76rem",
              borderRadius: "6px",
              border: "1px solid #64748b",
              background: activeTab === "active" ? "#0f172a" : "#ffffff",
              color: activeTab === "active" ? "#ffffff" : "#0f172a",
            }}
          >
            활성 버전 (3)
          </button>
          <button
            type="button"
            data-testid="snapshot-tab-archived-btn"
            aria-pressed={activeTab === "archived"}
            onClick={() => setActiveTab("archived")}
            style={{
              padding: "0.25rem 0.65rem",
              fontSize: "0.76rem",
              borderRadius: "6px",
              border: "1px solid #64748b",
              background: activeTab === "archived" ? "#0f172a" : "#ffffff",
              color: activeTab === "archived" ? "#ffffff" : "#0f172a",
            }}
          >
            아카이브됨 (1)
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>업로드 방식:</span>
        {(
          [
            { id: "bulk", label: "기본 일괄 업로드" },
            { id: "per-page", label: "개별 페이지 업로드" },
            { id: "compose-existing", label: "기존 페이지로 생성" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            data-testid={`snapshot-upload-mode-${mode.id}-btn`}
            aria-pressed={uploadMode === mode.id}
            onClick={() => setUploadMode(mode.id)}
            style={{
              padding: "0.25rem 0.6rem",
              fontSize: "0.76rem",
              borderRadius: "6px",
              border: "1px solid #94a3b8",
              background: uploadMode === mode.id ? "#1d4ed8" : "#ffffff",
              color: uploadMode === mode.id ? "#ffffff" : "#1e293b",
            }}
          >
            {mode.label}
          </button>
        ))}

        <label style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <input
            type="checkbox"
            checked={pdfAutoSplit}
            onChange={(e) => setPdfAutoSplit(e.target.checked)}
          />
          PDF 업로드 시 페이지 단위 자동 분할
        </label>

        <span style={{ marginLeft: "0.4rem", fontSize: "0.78rem", fontWeight: 600 }}>버전 공개 범위:</span>
        {(
          [
            { id: "public", label: "공개 (전체 열람)" },
            { id: "restricted", label: "일부 공개 (편집 이상)" },
            { id: "private", label: "비공개 (내 초안)" },
          ] as const
        ).map((scope) => (
          <button
            key={scope.id}
            type="button"
            data-testid={`snapshot-visibility-${scope.id}-btn`}
            aria-pressed={visibility === scope.id}
            onClick={() => handleVisibilityChange(scope.id)}
            style={{
              padding: "0.25rem 0.55rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #94a3b8",
              background: visibility === scope.id ? "#0f766e" : "#ffffff",
              color: visibility === scope.id ? "#ffffff" : "#0f172a",
            }}
          >
            {scope.label}
          </button>
        ))}

        <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <input
            type="checkbox"
            checked={deleteUniqueAssetsToo}
            onChange={(e) => setDeleteUniqueAssetsToo(e.target.checked)}
          />
          버전 삭제 시 이 버전에만 속한 고유 결과물 동반 삭제
        </label>
      </div>

      {scopeWarning && (
        <div
          role="alert"
          data-testid="snapshot-visibility-narrowing-warning"
          style={{
            padding: "0.45rem 0.7rem",
            borderRadius: "8px",
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            fontSize: "0.76rem",
            color: "#92400e",
          }}
        >
          {scopeWarning}
        </div>
      )}

      {/* 2. 2단계 완료 워크플로: 작업자 `작업 완료` → 관리자 `공정 마감` & 기여도 100% 배분 */}
      <div
        style={{
          display: "grid",
          gap: "0.55rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.84rem" }}>
            2단계 공정 완료 체계: 1단계 [작업 완료] → 2단계 [공정 마감]
          </strong>
          <span data-testid="snapshot-completion-stage-badge" style={{ fontSize: "0.76rem", fontWeight: 600, color: "#0369a1" }}>
            현재 상태:{" "}
            {completionStage === "in-progress"
              ? "작업 진행 중"
              : completionStage === "worker-completed"
                ? "1단계: 작업자 작업 완료"
                : "2단계: 관리자 공정 마감 완료"}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.65rem" }}>
          <label style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            소요 작업 시간(h):
            <input
              type="number"
              aria-label="소요 작업 시간"
              min={1}
              max={240}
              value={workDurationHours}
              onChange={(e) => setWorkDurationHours(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: "4rem", padding: "0.18rem 0.35rem", fontSize: "0.76rem" }}
            />
          </label>
          <span data-testid="derived-process-start-readout" style={{ fontSize: "0.75rem", color: "#475569" }}>
            역산된 공정 시작 시각: <code>{derivedStartIso.slice(0, 16).replace("T", " ")} UTC</code>
          </span>

          <button
            type="button"
            data-testid="step1-worker-complete-btn"
            onClick={() => setCompletionStage("worker-completed")}
            style={{
              padding: "0.25rem 0.6rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #0284c7",
              background: "#e0f2fe",
              color: "#0369a1",
            }}
          >
            1단계: 작업 완료 기록
          </button>

          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            마감 시 미해결 공개 피드백:
            <select
              aria-label="마감 시 미해결 공개 피드백 처리"
              value={openFeedbackAction}
              onChange={(e) => setOpenFeedbackAction(e.target.value as OpenFeedbackFinalizeAction)}
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="complete-all">미해결 피드백 일괄 완료 처리</option>
              <option value="keep-open">미해결 상태로 유지</option>
            </select>
          </label>

          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            기여도 배분 방식:
            <select
              aria-label="작업자 기여도 배분 방식"
              data-testid="worker-contribution-split-select"
              value={splitMode}
              onChange={(e) => setSplitMode(e.target.value as WorkerContributionSplitMode)}
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="time-proportional">시간 비율 배분 (합계 100%)</option>
              <option value="equal">인원 균등 배분 (합계 100%)</option>
            </select>
          </label>

          <button
            type="button"
            data-testid="step2-process-finalize-btn"
            onClick={() => setCompletionStage("process-finalized")}
            style={{
              padding: "0.25rem 0.65rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #15803d",
              background: "#dcfce7",
              color: "#166534",
            }}
          >
            2단계: 공정 마감 확정
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {workerAllocations.map((worker) => (
            <span
              key={worker.workerId}
              data-testid={`worker-allocation-${worker.workerId}`}
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: "999px",
                background: "#e2e8f0",
                fontSize: "0.74rem",
              }}
            >
              {worker.workerName} ({worker.workHours}h) → <strong>{worker.contributionPercent}%</strong>
            </span>
          ))}
        </div>
      </div>

      {/* 3. 페이지 인스펙터: 5종 변경 배지 & 페이지별 컷 수 합산·수동 총합 오버라이드 */}
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.84rem" }}>페이지 파일 인스펙터 (5종 변경 배지) &amp; 컷 수 계산기</strong>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", fontSize: "0.76rem" }}>
            <span data-testid="episode-cut-sum-readout">
              페이지 합산: <strong>{cutSummary.autoSum}컷</strong> / 최종 적용 총합:{" "}
              <strong>{cutSummary.effectiveTotal}컷</strong> {cutSummary.isManual ? "(수동 입력 우선)" : "(자동 합산)"}
            </span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              총 컷 수 직접 지정:
              <input
                type="number"
                aria-label="총 컷 수 수동 오버라이드"
                placeholder="자동 합산"
                value={manualTotalCuts}
                onChange={(e) => setManualTotalCuts(e.target.value)}
                style={{ width: "4.5rem", padding: "0.15rem 0.3rem", fontSize: "0.75rem" }}
              />
            </label>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.3rem" }}>
          {pages.map((page) => {
            const badge = DIFF_BADGE_LABELS[page.diffBadge];
            return (
              <div
                key={page.pageNumber}
                data-testid={`snapshot-page-row-${page.pageNumber}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  padding: "0.35rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  fontSize: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <strong>{page.pageNumber}페이지</strong>
                  <span
                    data-testid={`snapshot-page-badge-${page.pageNumber}`}
                    style={{
                      padding: "0.12rem 0.45rem",
                      borderRadius: "999px",
                      background: badge.bg,
                      color: badge.color,
                      fontWeight: 600,
                      fontSize: "0.72rem",
                    }}
                  >
                    {badge.label}
                  </span>
                  <span style={{ color: "#475569" }}>
                    {page.fileName ?? "미업로드 슬롯"} ·{" "}
                    {page.widthPx > 0 ? `${page.widthPx}×${page.heightPx}px` : "해상도 없음"}
                  </span>
                </div>

                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  컷 수:
                  <input
                    type="number"
                    aria-label={`${page.pageNumber}페이지 컷 수`}
                    min={0}
                    max={100}
                    value={page.cutCount}
                    onChange={(e) => handlePageCutChange(page.pageNumber, Number(e.target.value) || 0)}
                    style={{ width: "3.5rem", padding: "0.12rem 0.3rem", fontSize: "0.74rem" }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 텍스트 공정 슬래시 블록 딥링크(`블록 URL 복사`), 고아 피드백(`원본 컨텐츠 삭제됨`), 나란히 Diff 비교(`빈 자리 표시`) */}
      <div
        style={{
          display: "grid",
          gap: "0.45rem",
          padding: "0.7rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.84rem" }}>텍스트 공정 블록 딥링크 &amp; 버전 간 나란히 Diff 비교</strong>
          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <input
              type="checkbox"
              checked={showBlankPlaceholders}
              onChange={(e) => setShowBlankPlaceholders(e.target.checked)}
            />
            빈 자리 표시 (추가·삭제된 블록의 반대편 행 정렬 유지)
          </label>
        </div>

        {copiedBlockLink && (
          <p data-testid="copied-block-deeplink-readout" style={{ margin: 0, fontSize: "0.74rem", color: "#0369a1" }}>
            복사된 블록 URL: <code>{copiedBlockLink}</code>
          </p>
        )}

        <div style={{ display: "grid", gap: "0.35rem" }}>
          {textDiffRows.map((row) => (
            <div
              key={row.rowIndex}
              data-testid={`text-diff-row-${row.rowIndex}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.35rem 0.55rem",
                borderRadius: "6px",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                fontSize: "0.74rem",
              }}
            >
              <div>
                {row.left ? (
                  <>
                    <span>{row.left.content}</span>
                    {row.left.orphanedFeedbackCount ? (
                      <span
                        data-testid={`orphaned-feedback-badge-${row.left.blockId}`}
                        style={{
                          marginLeft: "0.35rem",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "4px",
                          background: "#fee2e2",
                          color: "#991b1b",
                          fontSize: "0.7rem",
                        }}
                      >
                        원본 컨텐츠 삭제됨 ({row.left.orphanedFeedbackCount})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <em style={{ color: "#94a3b8" }}>(빈 자리 — 이전 버전에 없음)</em>
                )}
              </div>

              <div>
                {row.right ? (
                  <span>{row.right.content}</span>
                ) : (
                  <em style={{ color: "#94a3b8" }}>(빈 자리 — 새 버전에서 삭제됨)</em>
                )}
              </div>

              <button
                type="button"
                data-testid={`copy-block-url-${row.right?.blockId ?? row.left?.blockId ?? row.rowIndex}`}
                onClick={() => handleCopyBlockUrl(row.right?.blockId ?? row.left?.blockId ?? `row-${row.rowIndex}`)}
                style={{ padding: "0.18rem 0.45rem", fontSize: "0.72rem", borderRadius: "4px", border: "1px solid #94a3b8" }}
              >
                블록 URL 복사
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
