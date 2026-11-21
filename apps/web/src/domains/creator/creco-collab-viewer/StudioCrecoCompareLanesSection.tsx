import type { CSSProperties } from "react";

import {
  CRECO_STAGE_CATALOG,
  findStageAndVersion,
  getStageMeta,
  type CompareLayoutMode,
  type CompareSyncMode,
  type CrecoCollabWorkspaceState,
  type CrecoStageId,
  type VersionDiffSummary,
} from "./creco-version-compare-engine";
import type { CrecoImmutableVersion } from "./creco-version-compare-types";

export interface StudioCrecoCompareLanesSectionProps {
  readonly workspace: CrecoCollabWorkspaceState;
  readonly cutCount: number;
  readonly wipeBeforeVersion: CrecoImmutableVersion | null;
  readonly wipeAfterVersion: CrecoImmutableVersion | null;
  readonly versionDiff: VersionDiffSummary;
  readonly onLayoutChange: (mode: CompareLayoutMode) => void;
  readonly onSyncModeChange: (syncMode: CompareSyncMode) => void;
  readonly onMoveCut: (delta: number) => void;
  readonly onToggleCompareStage: (stageId: CrecoStageId) => void;
  readonly onSyncScrollSlider: (ratio: number, nextCut: number) => void;
  readonly onWipePercentChange: (percent: number) => void;
}

export function StudioCrecoCompareLanesSection({
  workspace,
  cutCount,
  wipeBeforeVersion,
  wipeAfterVersion,
  versionDiff,
  onLayoutChange,
  onSyncModeChange,
  onMoveCut,
  onToggleCompareStage,
  onSyncScrollSlider,
  onWipePercentChange,
}: StudioCrecoCompareLanesSectionProps) {
  const wipeContainerStyle = {
    "--ccv-wipe-pct": `${workspace.compare.wipePercent}%`,
  } as CSSProperties;

  return (
    <section className="ccv-card" aria-label="4열 다중 공정 동시 비교 뷰어">
      <div className="ccv-card-head">
        <h3 className="ccv-card-title">
          4열 공정 동시 동기 비교 · 가로 한눈에 오버뷰 · 0~100% 와이프 핸들
        </h3>
        <div className="ccv-badge-row">
          <button
            type="button"
            data-testid="ccv-layout-vertical"
            className="ccv-btn"
            aria-pressed={workspace.compare.layoutMode === "vertical-sync"}
            onClick={() => onLayoutChange("vertical-sync")}
          >
            세로 4열 동기 비교
          </button>
          <button
            type="button"
            data-testid="ccv-layout-horizontal"
            className="ccv-btn"
            aria-pressed={workspace.compare.layoutMode === "horizontal-overview"}
            onClick={() => onLayoutChange("horizontal-overview")}
          >
            가로 한눈에 오버뷰 (H)
          </button>
          <button
            type="button"
            data-testid="ccv-layout-wipe"
            className="ccv-btn"
            aria-pressed={workspace.compare.layoutMode === "wipe-compare"}
            onClick={() => onLayoutChange("wipe-compare")}
          >
            와이프 핸들 비교 (C)
          </button>
        </div>
      </div>

      <div className="ccv-badge-row">
        <button
          type="button"
          className="ccv-btn"
          aria-pressed={workspace.compare.syncMode === "all-lock"}
          onClick={() => onSyncModeChange("all-lock")}
        >
          A 전체 동기화
        </button>
        <button
          type="button"
          className="ccv-btn"
          aria-pressed={workspace.compare.syncMode === "offset-keep"}
          onClick={() => onSyncModeChange("offset-keep")}
        >
          S 오프셋 유지
        </button>
        <button
          type="button"
          className="ccv-btn"
          aria-pressed={workspace.compare.syncMode === "height-ratio"}
          onClick={() => onSyncModeChange("height-ratio")}
        >
          P 높이 비례 동기화
        </button>
        <button
          type="button"
          data-testid="ccv-prev-cut-btn"
          className="ccv-btn"
          onClick={() => onMoveCut(-1)}
        >
          이전 컷 (K)
        </button>
        <span className="ccv-pill ccv-num" data-testid="ccv-active-cut-indicator">
          컷 {workspace.compare.activeCutIndex + 1} / {cutCount}
        </span>
        <button
          type="button"
          data-testid="ccv-next-cut-btn"
          className="ccv-btn"
          onClick={() => onMoveCut(1)}
        >
          다음 컷 (J)
        </button>
      </div>

      <div className="ccv-stage-chips" aria-label="동시 비교 슬롯 선택(최대 4열)">
        {CRECO_STAGE_CATALOG.filter((item) => item.kind === "image").map((stage) => {
          const inCompare = workspace.compare.slots.some((slot) => slot.stageId === stage.stageId);
          return (
            <button
              key={stage.stageId}
              type="button"
              className="ccv-btn"
              aria-pressed={inCompare}
              onClick={() => onToggleCompareStage(stage.stageId)}
            >
              {inCompare ? "✓ " : "+ "}
              {stage.shortLabel}
            </button>
          );
        })}
      </div>

      <label className="ccv-subtitle" htmlFor="ccv-sync-scroll-slider">
        전체 4열 동기 스크롤 진행률:{" "}
        <strong className="ccv-num">{Math.round(workspace.compare.masterScrollRatio * 100)}%</strong>
      </label>
      <input
        id="ccv-sync-scroll-slider"
        data-testid="ccv-sync-scroll-slider"
        type="range"
        min={0}
        max={100}
        value={Math.round(workspace.compare.masterScrollRatio * 100)}
        onChange={(event) => {
          const ratio = Number(event.target.value) / 100;
          const nextCut = Math.min(cutCount - 1, Math.round(ratio * (cutCount - 1)));
          onSyncScrollSlider(ratio, nextCut);
        }}
        className="ccv-range"
      />

      {workspace.compare.layoutMode === "wipe-compare" ? (
        <div className="ccv-stack" style={{ padding: 0 }}>
          <div
            className="ccv-wipe-stage"
            style={wipeContainerStyle}
            data-testid="ccv-wipe-compare-stage"
          >
            <div
              className="ccv-wipe-layer"
              style={{
                backgroundColor:
                  wipeBeforeVersion?.artifacts[workspace.compare.activeCutIndex]
                    ?.moodSurfaceOklch ?? "oklch(0.92 0.02 250)",
              }}
            >
              <span className="ccv-pill">수정 전: {wipeBeforeVersion?.label ?? "기준 버전"}</span>
              <p className="ccv-subtitle">
                {wipeBeforeVersion?.artifacts[workspace.compare.activeCutIndex]?.title ??
                  "컷 미리보기"}
              </p>
            </div>
            <div
              className="ccv-wipe-layer ccv-wipe-after"
              style={{
                backgroundColor:
                  wipeAfterVersion?.artifacts[workspace.compare.activeCutIndex]?.moodSurfaceOklch ??
                  "oklch(0.91 0.03 160)",
              }}
            >
              <span className="ccv-pill ccv-pill-accent">
                수정 후: {wipeAfterVersion?.label ?? "비교 버전"}
              </span>
              <p className="ccv-subtitle">
                {wipeAfterVersion?.artifacts[workspace.compare.activeCutIndex]?.dialogueSummary ??
                  "업데이트 완료"}
              </p>
            </div>
            <div className="ccv-wipe-divider" />
            <div className="ccv-wipe-knob ccv-num">{workspace.compare.wipePercent}%</div>
          </div>

          <label className="ccv-subtitle" htmlFor="ccv-compare-wipe-slider">
            가운데 와이프 핸들 위치:{" "}
            <strong className="ccv-num">{workspace.compare.wipePercent}%</strong>
          </label>
          <input
            id="ccv-compare-wipe-slider"
            data-testid="ccv-compare-wipe-slider"
            type="range"
            min={0}
            max={100}
            value={workspace.compare.wipePercent}
            onChange={(event) => onWipePercentChange(Number(event.target.value))}
            className="ccv-range"
          />
          <div className="ccv-status-banner" data-testid="ccv-version-diff-summary">
            {versionDiff.summaryLines.join(" · ")}
          </div>
        </div>
      ) : (
        <div
          className={
            workspace.compare.layoutMode === "horizontal-overview"
              ? "ccv-horizontal-strip"
              : "ccv-lanes-grid"
          }
          data-testid="ccv-compare-lanes"
          data-layout={workspace.compare.layoutMode}
        >
          {workspace.compare.slots.map((slot) => {
            const { version } = findStageAndVersion(workspace.tree, slot.stageId, slot.versionId);
            const cut =
              version?.artifacts[workspace.compare.activeCutIndex] ?? version?.artifacts[0];
            const ratioPct = Math.round(
              (workspace.compare.slotScrollRatios[slot.slotId] ?? 0) * 100,
            );
            return (
              <article
                key={slot.slotId}
                className="ccv-lane"
                data-testid={`ccv-lane-${slot.stageId}`}
              >
                <div className="ccv-lane-head">
                  <span>{version?.label ?? getStageMeta(slot.stageId).label}</span>
                  <span className="ccv-pill ccv-num">스크롤 {ratioPct}%</span>
                </div>
                <div
                  className="ccv-cut-frame"
                  style={{
                    backgroundColor: cut?.moodSurfaceOklch ?? "oklch(0.93 0.02 250)",
                    borderColor: cut?.keyFocalOklch ?? "var(--ccv-border)",
                  }}
                >
                  <strong>{cut?.title ?? "컷 정보"}</strong>
                  <p className="ccv-subtitle">{cut?.dialogueSummary ?? ""}</p>
                  <div className="ccv-badge-row">
                    <span className="ccv-pill ccv-num">
                      {cut?.widthPx ?? 800}×{cut?.heightPx ?? 1400}px
                    </span>
                    <span className="ccv-pill ccv-pill-accent">{cut?.layerName}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
