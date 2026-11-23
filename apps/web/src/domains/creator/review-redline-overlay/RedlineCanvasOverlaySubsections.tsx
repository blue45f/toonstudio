/**
 * 붉은펜 비출력 오버레이 패널의 검수 스레드 동기화 보드 및 출고 강제 제거 감사 하위 섹션.
 */

import {
  CheckCircle2,
  Crosshair,
  Mic,
  RotateCcw,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import type { ReactElement } from "react";

import {
  REDLINE_STAGE_SPECS,
  REDLINE_STATUS_SPECS,
  isPinUnresolved,
  type ExportFormatKind,
  type NonPrintExportAuditReport,
  type RedlinePinStatus,
  type RedlinePinThread,
  type RedlineProcessStage,
  type ReviewBoardMetricsSummary,
} from "./redline-canvas-overlay-engine";

const EXPORT_FORMAT_OPTIONS: readonly {
  readonly id: ExportFormatKind;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "webtoon-slice", ko: "웹툰 분할", en: "Webtoon Slice" },
  { id: "png", ko: "PNG", en: "PNG" },
  { id: "psd", ko: "PSD", en: "PSD" },
  { id: "pdf-print", ko: "PDF 인쇄", en: "Print PDF" },
];

function statusPillClass(status: RedlinePinStatus): string {
  if (status === "open") return "rlo-pill rlo-pill-open";
  if (status === "in-progress") return "rlo-pill rlo-pill-progress";
  return "rlo-pill rlo-pill-safe";
}

export interface RedlineReviewThreadsSectionProps {
  readonly isKo: boolean;
  readonly metrics: ReviewBoardMetricsSummary;
  readonly activeStageFilter: RedlineProcessStage | "all";
  readonly pins: readonly RedlinePinThread[];
  readonly selectedPinId: string | null;
  readonly activeVoicePinId: string | null;
  readonly onStageFilterChange: (stage: RedlineProcessStage | "all") => void;
  readonly onToggleVoicePin: (pinId: string) => void;
  readonly onJumpToPin: (pin: RedlinePinThread) => void;
  readonly onStatusSync: (pin: RedlinePinThread, nextStatus: RedlinePinStatus) => void;
}

export function RedlineReviewThreadsSection({
  isKo,
  metrics,
  activeStageFilter,
  pins,
  selectedPinId,
  activeVoicePinId,
  onStageFilterChange,
  onToggleVoicePin,
  onJumpToPin,
  onStatusSync,
}: RedlineReviewThreadsSectionProps): ReactElement {
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  return (
    <div className="rlo-card">
      <div className="rlo-card-head">
        <h3 className="rlo-card-title">
          {pick("공정별 검수 스레드 동기화", "Synced Stage Review Threads")}
        </h3>
        <span className="rlo-pill rlo-pill-accent rlo-num">
          {pick(
            `완료 ${metrics.completedCount}/${metrics.totalCount}`,
            `Done ${metrics.completedCount}/${metrics.totalCount}`,
          )}
        </span>
      </div>

      <div
        className="rlo-stage-grid"
        role="group"
        aria-label={pick("공정별 필터", "Filter by stage")}
      >
        <button
          type="button"
          className="rlo-stage-chip rlo-num"
          aria-pressed={activeStageFilter === "all"}
          onClick={() => onStageFilterChange("all")}
        >
          <span>{pick("전체", "All")}</span>
          <span>{`${metrics.completedCount}/${metrics.totalCount}`}</span>
        </button>

        {metrics.stageProgress.map((item) => {
          const spec = REDLINE_STAGE_SPECS[item.stage];
          return (
            <button
              key={item.stage}
              type="button"
              className="rlo-stage-chip rlo-num"
              aria-pressed={activeStageFilter === item.stage}
              onClick={() => onStageFilterChange(item.stage)}
              data-testid={`rlo-stage-filter-${item.stage}`}
            >
              <span>{pick(spec.shortKo, spec.shortEn)}</span>
              <span>{`${item.total - item.openCount}/${item.total}`}</span>
            </button>
          );
        })}
      </div>

      <ul className="rlo-thread-list" data-testid="rlo-thread-list">
        {pins.length === 0 ? (
          <li className="rlo-thread-item">
            <p className="rlo-thread-note">
              {pick(
                "선택한 공정에 등록된 붉은펜 검수 핀이 없습니다.",
                "No redline pins assigned to this stage.",
              )}
            </p>
          </li>
        ) : (
          pins.map((pin) => {
            const stageSpec = REDLINE_STAGE_SPECS[pin.stage];
            const statusSpec = REDLINE_STATUS_SPECS[pin.status];
            const unresolved = isPinUnresolved(pin.status);
            const voiceOpen = activeVoicePinId === pin.id;
            return (
              <li
                key={pin.id}
                className="rlo-thread-item"
                data-selected={String(selectedPinId === pin.id)}
                data-status={pin.status}
                data-testid={`rlo-thread-card-${pin.id}`}
              >
                <div className="rlo-thread-top">
                  <h4 className="rlo-thread-title rlo-num">
                    {`#${pin.pinNumber} · ${pick(pin.titleKo, pin.titleEn)}`}
                  </h4>
                  <span className={statusPillClass(pin.status)}>
                    {pick(statusSpec.labelKo, statusSpec.labelEn)}
                  </span>
                </div>

                <div className="rlo-thread-meta rlo-num">
                  <span>{pin.cutId}</span>
                  <span>{`(${pin.xPct}%, ${pin.yPct}%)`}</span>
                  <span>{pick(stageSpec.labelKo, stageSpec.labelEn)}</span>
                  <span>{pick(pin.reviewerKo, pin.reviewerEn)}</span>
                  <span>
                    {pick(`붉은펜 ${pin.strokes.length}획`, `${pin.strokes.length} stroke(s)`)}
                  </span>
                </div>

                <p className="rlo-thread-note">{pick(pin.noteKo, pin.noteEn)}</p>

                {pin.voiceNote ? (
                  <div className="rlo-voice-box">
                    <button
                      type="button"
                      className="rlo-btn"
                      aria-pressed={voiceOpen}
                      onClick={() => onToggleVoicePin(pin.id)}
                    >
                      {voiceOpen ? (
                        <Volume2 size={15} aria-hidden="true" />
                      ) : (
                        <Mic size={15} aria-hidden="true" />
                      )}
                      <span className="rlo-num">
                        {pick(
                          `음성 첨삭 ${pin.voiceNote.durationSec}초 (${pin.voiceNote.speakerKo})`,
                          `Voice Critique ${pin.voiceNote.durationSec}s (${pin.voiceNote.speakerEn})`,
                        )}
                      </span>
                    </button>
                    {voiceOpen ? (
                      <p className="rlo-thread-note">
                        {pick(pin.voiceNote.transcriptKo, pin.voiceNote.transcriptEn)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="rlo-thread-actions">
                  <button
                    type="button"
                    className="rlo-btn"
                    onClick={() => onJumpToPin(pin)}
                    data-testid={`rlo-jump-btn-${pin.id}`}
                  >
                    <Crosshair size={15} aria-hidden="true" />
                    <span>{pick("좌표 점프", "Jump to Pin")}</span>
                  </button>

                  {unresolved ? (
                    <button
                      type="button"
                      className="rlo-btn rlo-btn-resolve"
                      onClick={() => onStatusSync(pin, "resolved")}
                      data-testid={`rlo-resolve-btn-${pin.id}`}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                      <span>{pick("수정 완료", "Mark Resolved")}</span>
                    </button>
                  ) : (
                    <>
                      {pin.status === "resolved" ? (
                        <button
                          type="button"
                          className="rlo-btn rlo-btn-primary"
                          onClick={() => onStatusSync(pin, "verified")}
                          data-testid={`rlo-verify-btn-${pin.id}`}
                        >
                          <ShieldCheck size={15} aria-hidden="true" />
                          <span>{pick("PD 확인 완료", "Verify (PD)")}</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rlo-btn"
                        onClick={() => onStatusSync(pin, "open")}
                        data-testid={`rlo-reopen-btn-${pin.id}`}
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        <span>{pick("다시 열기", "Reopen")}</span>
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export interface RedlineExportAuditSectionProps {
  readonly isKo: boolean;
  readonly exportFormat: ExportFormatKind;
  readonly exportAudit: NonPrintExportAuditReport;
  readonly onExportFormatChange: (format: ExportFormatKind) => void;
}

export function RedlineExportAuditSection({
  isKo,
  exportFormat,
  exportAudit,
  onExportFormatChange,
}: RedlineExportAuditSectionProps): ReactElement {
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  return (
    <div className="rlo-card" data-testid="rlo-export-audit-card">
      <div className="rlo-card-head">
        <h3 className="rlo-card-title">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{pick("출고 비출력 강제 제거 감사", "Non-Print Export Strip Audit")}</span>
        </h3>
        <span className="rlo-pill rlo-pill-safe rlo-num">
          {pick(
            `출력 ${exportAudit.exportedLayerCount} · 제거 ${exportAudit.strippedCount}`,
            `Exported ${exportAudit.exportedLayerCount} · Stripped ${exportAudit.strippedCount}`,
          )}
        </span>
      </div>

      <div
        className="rlo-cut-tabs"
        role="group"
        aria-label={pick("출고 형식 선택", "Select export format")}
      >
        {EXPORT_FORMAT_OPTIONS.map((fmt) => (
          <button
            key={fmt.id}
            type="button"
            className="rlo-btn"
            aria-pressed={exportFormat === fmt.id}
            onClick={() => onExportFormatChange(fmt.id)}
          >
            {pick(fmt.ko, fmt.en)}
          </button>
        ))}
      </div>

      <p className="rlo-thread-note">{pick(exportAudit.summaryKo, exportAudit.summaryEn)}</p>

      <ul className="rlo-audit-layers">
        {exportAudit.exportedLayers.map((layer) => (
          <li key={layer.id} className="rlo-audit-row">
            <span className="rlo-layer-code">{layer.name}</span>
            <span className="rlo-pill rlo-pill-safe">{pick("출고 포함", "Included")}</span>
          </li>
        ))}
        {exportAudit.strippedLayers.map((layer) => (
          <li key={layer.id} className="rlo-audit-row" data-stripped="true">
            <span className="rlo-layer-code">{layer.name}</span>
            <span className="rlo-pill rlo-pill-open">
              {pick("출고 시 제거 (0px)", "Stripped on Export (0px)")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
