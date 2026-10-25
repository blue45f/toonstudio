import { useEffect, useRef, useState } from "react";
import {
  addSideViewerSlot,
  bulkUpdateFeedbackVisibility,
  computeAutoScrollStepPx,
  computeCompareSyncedScrollTop,
  createInitialViewerControlsState,
  cycleAutoScrollSpeed,
  cycleOptimalWidthLock,
  cycleViewerToolbarDock,
  filterVisibleFeedbacks,
  findFocusedFeedbackForScroll,
  HORIZONTAL_WIDTH_PRESETS,
  MAX_SIDE_VIEWERS,
  publishAllDraftFeedbacks,
  removeSideViewerSlot,
  toggleHorizontalPageFilter,
  toggleViewerDevicePreview,
  type CompareScrollSyncMode,
  type FeedbackImportanceLevel,
  type FeedbackVisibilityScope,
  type HorizontalWidthPreset,
  type ScopedFeedbackItem,
  type ViewerControlsState,
  type ViewerLayoutMode,
} from "./production-viewer-controls-model";

export interface ProductionViewerControlsBarProps {
  readonly episodeLabel?: string;
  readonly initialMode?: ViewerLayoutMode;
  readonly onLayoutModeChange?: (mode: ViewerLayoutMode) => void;
  readonly onCompareSyncModeChange?: (mode: CompareScrollSyncMode) => void;
}

const INITIAL_FEEDBACK_ITEMS: readonly ScopedFeedbackItem[] = [
  {
    id: "fb-draft-1",
    authorId: "me",
    authorName: "총괄 PD",
    body: "12컷 역광 대비를 조금 더 강하게 조정해 주세요.",
    pageNumber: 1,
    normalizedY: 0.22,
    visibility: "private",
    importance: "required",
    resolved: false,
    hasDrawing: true,
  },
  {
    id: "fb-restricted-2",
    authorId: "me",
    authorName: "총괄 PD",
    body: "말풍선 꼬리 방향을 좌측 캐릭터 쪽으로 이동 권장합니다.",
    pageNumber: 2,
    normalizedY: 0.54,
    visibility: "restricted",
    importance: "recommended",
    resolved: false,
    hasDrawing: false,
  },
  {
    id: "fb-public-3",
    authorId: "assistant-1",
    authorName: "배경 어시",
    body: "3페이지 복도 소실점 보정 완료했습니다.",
    pageNumber: 3,
    normalizedY: 0.85,
    visibility: "public",
    importance: "suggestion",
    resolved: false,
    hasDrawing: false,
  },
];

const CANDIDATE_SIDE_EPISODES = [
  { id: "side-ep-11", episodeId: "ep-11", episodeLabel: "11화 · 귀환의 전조", processLabel: "채색 v3" },
  { id: "side-ep-10", episodeId: "ep-10", episodeLabel: "10화 · 성벽 위의 결투", processLabel: "선화 v2" },
  { id: "side-ep-09", episodeId: "ep-09", episodeLabel: "9화 · 심연의 계약", processLabel: "배경 v1" },
] as const;

const VISIBILITY_LABELS: Readonly<Record<FeedbackVisibilityScope, string>> = {
  private: "비공개 (내 초안)",
  restricted: "일부 공개 (편집 이상)",
  public: "전체 공개",
};

const IMPORTANCE_LABELS: Readonly<Record<FeedbackImportanceLevel, string>> = {
  required: "필수 반영",
  recommended: "권장 검토",
  suggestion: "단순 제안",
};

export function ProductionViewerControlsBar({
  episodeLabel = "12화 · 심야의 추격전",
  initialMode = "vertical",
  onLayoutModeChange,
  onCompareSyncModeChange,
}: ProductionViewerControlsBarProps) {
  const [controls, setControls] = useState<ViewerControlsState>(() =>
    createInitialViewerControlsState({ layoutMode: initialMode }),
  );
  const [feedbacks, setFeedbacks] = useState<readonly ScopedFeedbackItem[]>(INITIAL_FEEDBACK_ITEMS);
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<ReadonlySet<string>>(
    () => new Set(["fb-draft-1", "fb-restricted-2"]),
  );
  const [scrollCenterRatio, setScrollCenterRatio] = useState<number>(0.25);
  const [viewerRoleCanEdit, setViewerRoleCanEdit] = useState<boolean>(true);
  const [manualScrollOffsetPx, setManualScrollOffsetPx] = useState<number>(140);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const shortcutDialogRef = useRef<HTMLDialogElement | null>(null);

  // `closedby="any"` 미지원 브라우저용 light-dismiss 폴백
  useEffect(() => {
    const dialog = shortcutDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleFallbackClick = (event: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientY < rect.top
        || event.clientY > rect.bottom
        || event.clientX < rect.left
        || event.clientX > rect.right;
      if (clickedOutside && dialog.open) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handleFallbackClick);
    return () => dialog.removeEventListener("click", handleFallbackClick);
  }, []);

  const updateLayoutMode = (mode: ViewerLayoutMode) => {
    setControls((prev) => ({ ...prev, layoutMode: mode }));
    onLayoutModeChange?.(mode);
  };

  const updateCompareSync = (mode: CompareScrollSyncMode) => {
    setControls((prev) => ({ ...prev, compareSyncMode: mode }));
    onCompareSyncModeChange?.(mode);
  };

  const visibleFeedbacks = filterVisibleFeedbacks(feedbacks, {
    viewerId: viewerRoleCanEdit ? "me" : "guest-viewer",
    canEdit: viewerRoleCanEdit,
  });

  const focusedFeedback = controls.feedbackFocusEnabled
    ? findFocusedFeedbackForScroll(visibleFeedbacks, scrollCenterRatio)
    : null;

  const syncedTargetScrollPx = computeCompareSyncedScrollTop({
    mode: controls.compareSyncMode,
    sourceScrollTop: Math.round(scrollCenterRatio * 2400),
    sourceMaxScroll: 2400,
    targetMaxScroll: 3000,
    manualOffsetPx: manualScrollOffsetPx,
  });

  const stepPxPer100ms = computeAutoScrollStepPx(controls.autoScrollSpeed, 100);
  const draftCount = feedbacks.filter((item) => item.authorId === "me" && item.visibility === "private").length;

  const handlePublishAllDrafts = () => {
    const result = publishAllDraftFeedbacks(feedbacks, "me", "public");
    setFeedbacks(result.items);
    setStatusNotice(
      result.publishedCount > 0
        ? `비공개 초안 피드백 ${result.publishedCount}건을 전체 공개로 일괄 발행했습니다.`
        : "발행할 비공개 초안 피드백이 없습니다.",
    );
  };

  const handleBulkVisibilityChange = (nextScope: FeedbackVisibilityScope) => {
    setFeedbacks((prev) => bulkUpdateFeedbackVisibility(prev, selectedFeedbackIds, nextScope));
    setStatusNotice(
      `선택된 피드백 ${selectedFeedbackIds.size}건의 공개 범위를 '${VISIBILITY_LABELS[nextScope]}'(으)로 일괄 변경했습니다.`,
    );
  };

  const handleAddSideViewer = (candidate: (typeof CANDIDATE_SIDE_EPISODES)[number]) => {
    const result = addSideViewerSlot(controls.sideViewers, candidate);
    if (!result.added) {
      setStatusNotice(`타 회차 사이드 뷰어는 최대 ${MAX_SIDE_VIEWERS}개까지 동시에 열 수 있습니다.`);
      return;
    }
    setControls((prev) => ({ ...prev, sideViewers: result.slots }));
    setStatusNotice(`${candidate.episodeLabel} (${candidate.processLabel}) 사이드 뷰어를 열었습니다.`);
  };

  const toggleFeedbackSelection = (id: string) => {
    setSelectedFeedbackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section
      aria-label="뷰어 단축키·비교 동기화·피드백 공개 범위 제어바"
      data-testid="production-viewer-controls-bar"
      data-toolbar-dock={controls.toolbarDock}
      style={{
        display: "grid",
        gap: "0.75rem",
        padding: "0.85rem 1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #f8fafc)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <strong style={{ fontSize: "0.92rem" }}>뷰어 제어 &amp; 3종 동기화 독 ({episodeLabel})</strong>
          <span style={{ marginLeft: "0.6rem", fontSize: "0.78rem", color: "#475569" }}>
            도킹 위치: {controls.toolbarDock === "left" ? "좌측" : controls.toolbarDock === "right" ? "우측" : "하단 중앙"} ·{" "}
            {controls.optimalWidthLock === "free"
              ? "자유 배율 줌"
              : `${controls.optimalWidthLock}px 최적 폭 고정 (줌 잠금)`}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          <button
            type="button"
            data-testid="viewer-dock-cycle-btn"
            onClick={() =>
              setControls((prev) => ({
                ...prev,
                toolbarDock: cycleViewerToolbarDock(prev.toolbarDock),
              }))
            }
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            툴바 위치 전환 (T: {controls.toolbarDock})
          </button>

          <button
            type="button"
            data-testid="viewer-device-toggle-btn"
            onClick={() =>
              setControls((prev) => ({
                ...prev,
                devicePreview: toggleViewerDevicePreview(prev.devicePreview),
              }))
            }
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            디바이스 미리보기 (M: {controls.devicePreview === "pc" ? "PC" : "모바일"})
          </button>

          <button
            type="button"
            data-testid="viewer-optimal-width-btn"
            onClick={() =>
              setControls((prev) => ({
                ...prev,
                optimalWidthLock: cycleOptimalWidthLock(prev.optimalWidthLock),
              }))
            }
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            최적 너비 고정 (V: {controls.optimalWidthLock === "free" ? "해제" : `${controls.optimalWidthLock}px`})
          </button>

          <button
            type="button"
            data-testid="viewer-autoscroll-btn"
            onClick={() =>
              setControls((prev) => ({
                ...prev,
                autoScrollSpeed: cycleAutoScrollSpeed(prev.autoScrollSpeed),
              }))
            }
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            자동 스크롤 (&gt;: {controls.autoScrollSpeed === 0 ? "정지" : `x${controls.autoScrollSpeed} (${stepPxPer100ms}px/0.1s)`})
          </button>

          <button
            type="button"
            data-testid="viewer-left-panel-toggle-btn"
            onClick={() => setControls((prev) => ({ ...prev, leftPanelOpen: !prev.leftPanelOpen }))}
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            좌측 패널 ([ : {controls.leftPanelOpen ? "열림" : "접힘"})
          </button>

          <button
            type="button"
            data-testid="viewer-right-panel-toggle-btn"
            onClick={() => setControls((prev) => ({ ...prev, rightPanelOpen: !prev.rightPanelOpen }))}
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            우측 패널 (] : {controls.rightPanelOpen ? "열림" : "접힘"})
          </button>

          <button
            type="button"
            data-testid="viewer-ui-hide-btn"
            onClick={() => setControls((prev) => ({ ...prev, uiHidden: !prev.uiHidden }))}
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
          >
            UI 숨김 (H: {controls.uiHidden ? "숨김 활성" : "표시 중"})
          </button>

          <button
            type="button"
            data-testid="viewer-shortcut-help-open-btn"
            onClick={() => shortcutDialogRef.current?.showModal()}
            style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #6366f1", color: "#3730a3" }}
          >
            단축키 안내 (?)
          </button>
        </div>
      </div>

      {!controls.uiHidden && (
        <>
          {/* 뷰어 3모드(D/C/G) 및 비교 3종 동기화(A/S/P) */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>뷰어 모드:</span>
            {(
              [
                { id: "vertical", label: "기본 세로 (D)" },
                { id: "compare", label: "비교 모드 (C)" },
                { id: "horizontal", label: "가로 스프레드 (G)" },
              ] as const
            ).map((modeItem) => (
              <button
                key={modeItem.id}
                type="button"
                data-testid={`viewer-mode-${modeItem.id}-btn`}
                aria-pressed={controls.layoutMode === modeItem.id}
                onClick={() => updateLayoutMode(modeItem.id)}
                style={{
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.76rem",
                  borderRadius: "999px",
                  border: "1px solid #64748b",
                  background: controls.layoutMode === modeItem.id ? "#1e293b" : "#ffffff",
                  color: controls.layoutMode === modeItem.id ? "#ffffff" : "#1e293b",
                }}
              >
                {modeItem.label}
              </button>
            ))}

            <span style={{ marginLeft: "0.5rem", fontSize: "0.78rem", fontWeight: 600 }}>비교 스크롤 동기화:</span>
            {(
              [
                { id: "all", label: "전체 동기화 (A)" },
                { id: "scroll-offset", label: "오프셋 유지 스크롤 (S)" },
                { id: "page-proportional", label: "페이지 높이 비례 (P)" },
              ] as const
            ).map((syncItem) => (
              <button
                key={syncItem.id}
                type="button"
                data-testid={`viewer-compare-sync-${syncItem.id}-btn`}
                aria-pressed={controls.compareSyncMode === syncItem.id}
                onClick={() => updateCompareSync(syncItem.id)}
                style={{
                  padding: "0.25rem 0.55rem",
                  fontSize: "0.75rem",
                  borderRadius: "6px",
                  border: "1px solid #94a3b8",
                  background: controls.compareSyncMode === syncItem.id ? "#0f766e" : "#ffffff",
                  color: controls.compareSyncMode === syncItem.id ? "#ffffff" : "#0f172a",
                }}
              >
                {syncItem.label}
              </button>
            ))}

            {controls.compareSyncMode === "scroll-offset" && (
              <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                수동 오프셋(px):
                <input
                  type="number"
                  aria-label="수동 스크롤 오프셋"
                  value={manualScrollOffsetPx}
                  onChange={(e) => setManualScrollOffsetPx(Number(e.target.value) || 0)}
                  style={{ width: "4.5rem", padding: "0.15rem 0.3rem", fontSize: "0.75rem" }}
                />
              </label>
            )}

            <span data-testid="viewer-synced-scroll-readout" style={{ fontSize: "0.75rem", color: "#334155" }}>
              동기화 대상 스크롤 위치: <strong>{syncedTargetScrollPx}px</strong>
            </span>
          </div>

          {/* 가로 스프레드 모드(G) 전용 페이지 번호 필터 및 가로 폭 프리셋 */}
          {controls.layoutMode === "horizontal" && (
            <div
              data-testid="viewer-horizontal-spread-bar"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.65rem",
                borderRadius: "8px",
                background: "#eef2ff",
              }}
            >
              <strong style={{ fontSize: "0.76rem" }}>가로 모드 페이지 필터:</strong>
              {[1, 2, 3, 4, 5, 6].map((pageNum) => {
                const selected = controls.selectedHorizontalPages.includes(pageNum);
                return (
                  <button
                    key={pageNum}
                    type="button"
                    data-testid={`horizontal-page-filter-${pageNum}`}
                    aria-pressed={selected}
                    onClick={() =>
                      setControls((prev) => ({
                        ...prev,
                        selectedHorizontalPages: toggleHorizontalPageFilter(prev.selectedHorizontalPages, pageNum),
                      }))
                    }
                    style={{
                      padding: "0.2rem 0.45rem",
                      fontSize: "0.74rem",
                      borderRadius: "4px",
                      border: "1px solid #6366f1",
                      background: selected ? "#4f46e5" : "#ffffff",
                      color: selected ? "#ffffff" : "#312e81",
                    }}
                  >
                    {pageNum}P
                  </button>
                );
              })}

              <span style={{ marginLeft: "0.5rem", fontSize: "0.76rem", fontWeight: 600 }}>페이지 폭 프리셋:</span>
              {HORIZONTAL_WIDTH_PRESETS.map((preset: HorizontalWidthPreset) => (
                <button
                  key={String(preset)}
                  type="button"
                  data-testid={`horizontal-width-preset-${preset}`}
                  aria-pressed={controls.horizontalWidthPreset === preset}
                  onClick={() => setControls((prev) => ({ ...prev, horizontalWidthPreset: preset }))}
                  style={{
                    padding: "0.2rem 0.45rem",
                    fontSize: "0.74rem",
                    borderRadius: "4px",
                    border: "1px solid #6366f1",
                    background: controls.horizontalWidthPreset === preset ? "#312e81" : "#ffffff",
                    color: controls.horizontalWidthPreset === preset ? "#ffffff" : "#1e1b4b",
                  }}
                >
                  {preset === "fit" ? "화면 맞춤" : `${preset}px`}
                </button>
              ))}
            </div>
          )}

          {/* 타 회차 사이드 뷰어 (최대 2개) */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem" }}>
            <strong style={{ fontSize: "0.76rem" }}>
              타 회차 사이드 뷰어 ({controls.sideViewers.length}/{MAX_SIDE_VIEWERS}):
            </strong>
            {CANDIDATE_SIDE_EPISODES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                data-testid={`add-side-viewer-${candidate.episodeId}`}
                onClick={() => handleAddSideViewer(candidate)}
                style={{ padding: "0.2rem 0.5rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
              >
                + {candidate.episodeLabel} ({candidate.processLabel})
              </button>
            ))}

            {controls.sideViewers.map((slot) => (
              <span
                key={slot.id}
                data-testid={`active-side-viewer-${slot.episodeId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "999px",
                  background: "#dbeafe",
                  fontSize: "0.74rem",
                }}
              >
                {slot.episodeLabel} · {slot.processLabel}
                <button
                  type="button"
                  aria-label={`${slot.episodeLabel} 사이드 뷰어 닫기`}
                  onClick={() =>
                    setControls((prev) => ({
                      ...prev,
                      sideViewers: removeSideViewerSlot(prev.sideViewers, slot.id),
                    }))
                  }
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* 피드백 3단계 공개 범위·중요도·초안 전체 발행·일괄 변경·피드백 포커스·새 창 팝아웃 */}
          <div
            style={{
              display: "grid",
              gap: "0.45rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.45rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem" }}>
                <strong style={{ fontSize: "0.78rem" }}>피드백 공개·중요도·포커스 제어</strong>
                <button
                  type="button"
                  data-testid="publish-all-draft-feedbacks-btn"
                  onClick={handlePublishAllDrafts}
                  style={{
                    padding: "0.22rem 0.55rem",
                    fontSize: "0.74rem",
                    borderRadius: "6px",
                    border: "1px solid #0284c7",
                    background: "#e0f2fe",
                    color: "#0369a1",
                  }}
                >
                  초안 전체 발행 ({draftCount}건)
                </button>

                <button
                  type="button"
                  data-testid="bulk-feedback-visibility-public-btn"
                  onClick={() => handleBulkVisibilityChange("public")}
                  style={{ padding: "0.22rem 0.5rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
                >
                  선택 공개 상태 일괄 변경 → 전체 공개
                </button>

                <button
                  type="button"
                  data-testid="bulk-feedback-visibility-restricted-btn"
                  onClick={() => handleBulkVisibilityChange("restricted")}
                  style={{ padding: "0.22rem 0.5rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
                >
                  일부 공개로 변경
                </button>

                <label style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="checkbox"
                    checked={controls.feedbackFocusEnabled}
                    onChange={(e) =>
                      setControls((prev) => ({ ...prev, feedbackFocusEnabled: e.target.checked }))
                    }
                  />
                  피드백 포커스 (스크롤 중심 자동 하이라이트)
                </label>

                <label style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  스크롤 위치(%):
                  <input
                    type="range"
                    aria-label="원고 스크롤 중심 위치"
                    min={0}
                    max={100}
                    value={Math.round(scrollCenterRatio * 100)}
                    onChange={(e) => setScrollCenterRatio(Number(e.target.value) / 100)}
                  />
                </label>

                <label style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="checkbox"
                    checked={viewerRoleCanEdit}
                    onChange={(e) => setViewerRoleCanEdit(e.target.checked)}
                  />
                  편집 허용 열람자 시점
                </label>
              </div>

              <button
                type="button"
                data-testid="feedback-popout-toggle-btn"
                onClick={() =>
                  setControls((prev) => ({
                    ...prev,
                    popoutFeedbackId: prev.popoutFeedbackId ? null : (focusedFeedback?.id ?? "fb-draft-1"),
                  }))
                }
                style={{ padding: "0.22rem 0.55rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #475569" }}
              >
                {controls.popoutFeedbackId ? "탭 안으로 복귀" : "피드백 새 창으로 열기"}
              </button>
            </div>

            {focusedFeedback && (
              <div
                data-testid="focused-feedback-banner"
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "6px",
                  background: "#fef3c7",
                  fontSize: "0.75rem",
                  color: "#92400e",
                }}
              >
                현재 스크롤 중심 포커스 피드백: <strong>[{IMPORTANCE_LABELS[focusedFeedback.importance]}]</strong>{" "}
                {focusedFeedback.body} ({VISIBILITY_LABELS[focusedFeedback.visibility]})
              </div>
            )}

            {controls.popoutFeedbackId && (
              <div
                data-testid="popout-feedback-window-indicator"
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "6px",
                  background: "#e0e7ff",
                  fontSize: "0.75rem",
                  color: "#1e3a8a",
                }}
              >
                독립 팝아웃 창 활성화됨 ({controls.popoutFeedbackId}) — 드로잉 오버레이 및 코멘트가 실시간 동기화됩니다.
              </div>
            )}

            <div style={{ display: "grid", gap: "0.3rem" }}>
              {visibleFeedbacks.map((item) => (
                <div
                  key={item.id}
                  data-testid={`scoped-feedback-row-${item.id}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.4rem",
                    padding: "0.3rem 0.5rem",
                    borderRadius: "6px",
                    border: focusedFeedback?.id === item.id ? "1px solid #f59e0b" : "1px solid #e2e8f0",
                    fontSize: "0.74rem",
                  }}
                >
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedFeedbackIds.has(item.id)}
                      onChange={() => toggleFeedbackSelection(item.id)}
                    />
                    <strong>{item.pageNumber}P</strong>
                    <span>[{IMPORTANCE_LABELS[item.importance]}]</span>
                    <span>{item.body}</span>
                  </label>
                  <span style={{ color: "#475569" }}>
                    {VISIBILITY_LABELS[item.visibility]} {item.hasDrawing ? "· 드로잉 포함" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {statusNotice && (
        <p data-testid="viewer-controls-status-notice" style={{ margin: 0, fontSize: "0.75rem", color: "#0f766e" }}>
          {statusNotice}
        </p>
      )}

      {/* 단축키 안내 모달 (`closedby="any"` + light-dismiss 폴백) */}
      <dialog
        ref={shortcutDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby="viewer-shortcut-dialog-title"
        data-testid="viewer-shortcut-help-dialog"
        style={{
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          padding: "1rem 1.25rem",
          maxWidth: "32rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 id="viewer-shortcut-dialog-title" style={{ margin: 0, fontSize: "0.95rem" }}>
              원고 뷰어 &amp; 비교 검수 단축키 안내
            </h3>
            <button
              type="button"
              onClick={() => shortcutDialogRef.current?.close()}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
            >
              닫기
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem", lineHeight: 1.6 }}>
            <li><strong>T</strong>: 플로팅 툴바 위치 전환 (좌측 / 하단 중앙 / 우측)</li>
            <li><strong>D / C / G</strong>: 기본 세로 뷰어 / 비교 모드 / 가로 스프레드 모드</li>
            <li><strong>M</strong>: PC / 모바일 디바이스 미리보기 전환</li>
            <li><strong>V</strong>: 최적 너비 고정 (720px / 1080px, 활성화 시 배율 줌 잠금)</li>
            <li><strong>&gt;</strong>: 자동 스크롤 배속 순환 (x1.0 / x1.5 / x2.0 / x3.0)</li>
            <li><strong>[ / ]</strong>: 좌측 / 우측 사이드 패널 접기·펼치기</li>
            <li><strong>H / Esc</strong>: 작업 집중을 위한 전체 UI 숨김·복귀</li>
            <li><strong>A / S / P</strong>: 비교 모드 전체 동기화 / 수동 오프셋 유지 / 페이지 높이 비례 동기화</li>
          </ul>
        </div>
      </dialog>
    </section>
  );
}
