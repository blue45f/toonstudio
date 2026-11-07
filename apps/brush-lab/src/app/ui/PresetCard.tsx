import { GALLERY_THUMBNAIL_SIZE } from "../state/lab-store";

import { ImageCanvas } from "./LaneCanvas";
import { formatMetric } from "./MetricsTable";

import type { BrushProgram } from "../../engine/presets/program-schema";
import type { GalleryEntry } from "../state/lab-store";

export interface PresetCardProps {
  preset: BrushProgram;
  entry: GalleryEntry | undefined;
  onOpen: (presetId: string) => void;
  onTryInDraw?: (presetId: string) => void;
  selectedRole?: "A" | "B" | "both" | null;
  onSelectCompareB?: (presetId: string) => void;
}

/** 프리셋 썸네일 카드: 결정성 해시·렌더 시간·dab 수·가족 지표 판정. Worker 실패는 오류 카드. */
export function PresetCard({
  preset,
  entry,
  onOpen,
  onTryInDraw,
  selectedRole = null,
  onSelectCompareB,
}: PresetCardProps) {
  const result = entry?.status === "done" ? entry.result : null;
  const headingId = `lab-card-${preset.id}`;
  const isSelected = selectedRole !== null;
  const isCompareB = selectedRole === "B" || selectedRole === "both";
  const roleLabel =
    selectedRole === "both"
      ? "선택됨 · 기준 A & 비교 B"
      : selectedRole === "A"
        ? "선택됨 · 기준 A"
        : selectedRole === "B"
          ? "비교 대상 B"
          : null;
  return (
    <article
      className={`lab-card${entry?.status === "error" ? " lab-card--error" : ""}${isSelected ? " lab-card--selected" : ""}`}
      aria-labelledby={headingId}
      data-testid={`lab-preset-card-${preset.id}`}
      data-status={entry?.status ?? "idle"}
      data-selected-role={selectedRole ?? undefined}
    >
      <div className="lab-canvas-stage lab-card-stage">
        <ImageCanvas image={result?.image ?? null} size={GALLERY_THUMBNAIL_SIZE} label={`${preset.name} 썸네일`} />
      </div>
      <div className="lab-card-header-row">
        <h3 id={headingId}>{preset.name}</h3>
        {roleLabel ? (
          <span
            className={selectedRole === "B" ? "lab-badge lab-badge--warn" : "lab-badge lab-badge--pass"}
            data-testid={`lab-preset-selected-badge-${preset.id}`}
          >
            {roleLabel}
          </span>
        ) : null}
      </div>
      <p className="lab-muted">
        <span className="lab-badge">{preset.family}</span> <span className="lab-mono">{preset.id}</span>
      </p>
      {entry === undefined || entry.status === "pending" ? (
        <p className="lab-muted">{entry === undefined ? "대기" : "렌더 중…"}</p>
      ) : null}
      {entry?.status === "error" ? (
        <p className="lab-error-list" role="alert">
          렌더 실패: {entry.error}
        </p>
      ) : null}
      {result ? (
        <details className="lab-draw-details lab-card-details" data-testid={`lab-preset-diag-${preset.id}`}>
          <summary>고급 진단 · 해시·지표 ({result.renderMs.toFixed(1)} ms)</summary>
          <p className="lab-card-hash">
            해시 <span className="lab-mono">{result.pixelHash}</span> · {result.renderMs.toFixed(1)} ms · dab{" "}
            {result.dabCount}
          </p>
          <ul className="lab-card-metrics">
            {result.family.map((f, i) => (
              <li key={`${f.key}-${i}`}>
                <span className="lab-mono">{f.key}</span> {formatMetric(f.value)} ({f.op} {f.threshold}){" "}
                <span className={`lab-verdict-${f.verdict}`}>{f.verdict}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="lab-card-actions">
        <button type="button" className="lab-button" onClick={() => onOpen(preset.id)}>
          A/B 비교에서 열기
        </button>
        {onSelectCompareB ? (
          <button
            type="button"
            className="lab-button lab-button--compact"
            aria-pressed={isCompareB}
            data-testid={`lab-preset-pin-b-${preset.id}`}
            onClick={() => onSelectCompareB(preset.id)}
          >
            {isCompareB ? "비교 B 선택됨" : "비교 B로 지정"}
          </button>
        ) : null}
        {onTryInDraw ? (
          <button
            type="button"
            className="lab-button lab-button--primary"
            data-testid={`lab-preset-draw-${preset.id}`}
            onClick={() => onTryInDraw(preset.id)}
          >
            그리기에서 시험
          </button>
        ) : null}
      </div>
    </article>
  );
}
