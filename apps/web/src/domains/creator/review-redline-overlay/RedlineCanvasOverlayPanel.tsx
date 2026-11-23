/**
 * PD·강사 붉은펜 검수 ↔ 드로잉 캔버스 최상단 비출력(Non-Export) 오버레이 양방향 동기화 패널.
 *
 * - 최상단 비출력 레이어(`99_NONPRINT_REDLINE_OVERLAY`) 눈 토글 & 불투명도 슬라이더(10%~100%)
 * - 컷 미리보기 위 자유곡선 붉은펜(SVG Path) + 번호 핀 표시 및 직접 새 붉은펜 핀 추가
 * - 핀 클릭 시 해당 컷 좌표로 뷰포트 자동 점프 좌표 산출 & 호스트 콜백 전달
 * - 원클릭 "수정 완료" / "PD 확인" / "다시 열기" 양방향 검수 보드 동기화 및 출고 가능(`canShip`) 판정
 * - 출고 안전 검증 배지("출고 시 붉은펜 0% 포함 보장") 및 PNG/PSD/웹툰 분할/PDF 강제 제거 감사
 */

import "./redline-canvas-overlay.css";

import { Crosshair, Eye, EyeOff, Layers, PenTool, ShieldCheck } from "lucide-react";
import {
  useId,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactElement,
} from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  RedlineExportAuditSection,
  RedlineReviewThreadsSection,
} from "./RedlineCanvasOverlaySubsections";
import {
  REDLINE_STAGE_ORDER,
  REDLINE_STAGE_SPECS,
  addRedlinePinToOverlay,
  buildRedlineStrokeSvgPath,
  buildSampleCanvasLayerStack,
  clampCoordPct,
  computeReviewBoardMetrics,
  computeViewportJumpTarget,
  createInitialRedlineOverlayState,
  filterPinsByStageAndCut,
  isPinUnresolved,
  stripNonPrintOverlayForExport,
  syncRedlineResolutionToReviewBoard,
  updateNonPrintOverlayControls,
  type CanvasViewportMetrics,
  type ExportFormatKind,
  type NonPrintExportAuditReport,
  type NonPrintRedlineOverlayState,
  type RedlinePinStatus,
  type RedlinePinThread,
  type RedlineProcessStage,
  type RedlineStroke,
  type ReviewBoardSyncSnapshot,
  type ViewportJumpTarget,
} from "./redline-canvas-overlay-engine";

export interface RedlineCanvasOverlayPanelProps {
  readonly initialState?: NonPrintRedlineOverlayState;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly defaultZoom?: number;
  readonly onViewportJump?: (target: ViewportJumpTarget, pin: RedlinePinThread) => void;
  readonly onSyncStateChange?: (snapshot: ReviewBoardSyncSnapshot) => void;
  readonly onExportAudit?: (report: NonPrintExportAuditReport) => void;
  readonly className?: string;
}

const HANGUL_REGEX = /[가-힣]/u;
const STAGE_VIEWBOX_W = 400;
const STAGE_VIEWBOX_H = 300;

function strokeClassForPin(stroke: RedlineStroke, status: RedlinePinStatus): string {
  if (!isPinUnresolved(status)) return "rlo-stroke-path rlo-stroke-resolved";
  if (stroke.tone === "guide") return "rlo-stroke-path rlo-stroke-guide";
  if (stroke.tone === "callout") return "rlo-stroke-path rlo-stroke-callout";
  return "rlo-stroke-path rlo-stroke-critical";
}

function renderCutDraftArtwork(cutIndex: number): ReactElement {
  if (cutIndex === 2) {
    return (
      <g>
        <rect x="16" y="14" width="368" height="272" rx="6" className="rlo-artwork-frame" />
        <line x1="16" y1="108" x2="384" y2="108" className="rlo-artwork-guide" />
        <ellipse cx="204" cy="118" rx="64" ry="74" className="rlo-artwork-sketch" />
        <path d="M 118 280 Q 134 202 204 196 Q 274 202 290 280 Z" className="rlo-artwork-sketch" />
        <path d="M 150 96 Q 206 54 268 106" className="rlo-artwork-guide" />
      </g>
    );
  }
  if (cutIndex === 3) {
    return (
      <g>
        <rect x="16" y="14" width="368" height="272" rx="6" className="rlo-artwork-frame" />
        <line x1="200" y1="14" x2="200" y2="286" className="rlo-artwork-guide" />
        <circle cx="136" cy="128" r="34" className="rlo-artwork-sketch" />
        <path d="M 92 276 Q 100 176 136 168 Q 172 176 184 276 Z" className="rlo-artwork-sketch" />
        <circle cx="272" cy="144" r="28" className="rlo-artwork-sketch" />
        <path d="M 234 276 Q 242 186 272 178 Q 302 186 312 276 Z" className="rlo-artwork-sketch" />
        <rect x="234" y="48" width="94" height="52" rx="22" className="rlo-artwork-balloon" />
      </g>
    );
  }
  return (
    <g>
      <rect x="16" y="14" width="368" height="272" rx="6" className="rlo-artwork-frame" />
      <line x1="16" y1="208" x2="384" y2="180" className="rlo-artwork-guide" />
      <line x1="16" y1="236" x2="384" y2="210" className="rlo-artwork-guide" />
      <circle cx="144" cy="96" r="30" className="rlo-artwork-sketch" />
      <path d="M 96 274 Q 108 142 146 132 Q 186 142 198 274 Z" className="rlo-artwork-sketch" />
      <rect x="220" y="182" width="156" height="84" className="rlo-artwork-sketch" />
    </g>
  );
}

export function RedlineCanvasOverlayPanel({
  initialState,
  viewportWidth = 960,
  viewportHeight = 680,
  defaultZoom = 1.5,
  onViewportJump,
  onSyncStateChange,
  onExportAudit,
  className,
}: RedlineCanvasOverlayPanelProps): ReactElement {
  const lang = useI18n((store) => store.lang);
  const isKo = lang.toLowerCase().startsWith("ko");
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const headingId = useId();
  const opacityInputId = useId();
  const stageSelectId = useId();
  const noteInputId = useId();
  const voiceInputId = useId();

  const [state, setState] = useState<NonPrintRedlineOverlayState>(
    () => initialState ?? createInitialRedlineOverlayState(),
  );
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [draftCoord, setDraftCoord] = useState<{ readonly xPct: number; readonly yPct: number }>({
    xPct: 48,
    yPct: 44,
  });
  const [draftStage, setDraftStage] = useState<RedlineProcessStage>("lineart");
  const [draftNote, setDraftNote] = useState("");
  const [draftVoice, setDraftVoice] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormatKind>("webtoon-slice");
  const [activeVoicePinId, setActiveVoicePinId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    readonly ko: string;
    readonly en: string;
  }>({
    ko: "비출력 붉은펜 오버레이가 최상단에 동기화되었습니다. 핀을 클릭하면 해당 컷 좌표로 자동 점프합니다.",
    en: "Non-print redline overlay is synced on top. Click any pin to jump directly to its cut coordinates.",
  });

  const viewportMetrics = useMemo<CanvasViewportMetrics>(() => {
    const canvasWidth = state.cuts.reduce((maxW, cut) => Math.max(maxW, cut.width), 800);
    const canvasTotalHeight = state.cuts.reduce(
      (maxH, cut) => Math.max(maxH, cut.offsetY + cut.height),
      1280,
    );
    return {
      viewportWidth,
      viewportHeight,
      canvasWidth,
      canvasTotalHeight,
      targetZoom: defaultZoom,
      cuts: state.cuts,
    };
  }, [defaultZoom, state.cuts, viewportHeight, viewportWidth]);

  const metrics = useMemo(() => computeReviewBoardMetrics(state), [state]);

  const activeCut = useMemo(
    () =>
      state.cuts.find((cut) => cut.cutIndex === state.activeCutIndex) ??
      state.cuts[0] ?? {
        cutId: "CUT-01",
        cutIndex: 1,
        labelKo: "1컷",
        labelEn: "Cut 01",
        offsetY: 0,
        width: 800,
        height: 1280,
      },
    [state.activeCutIndex, state.cuts],
  );

  const stageFilteredPins = useMemo(
    () => filterPinsByStageAndCut(state.pins, { stage: state.activeStageFilter, cutIndex: "all" }),
    [state.activeStageFilter, state.pins],
  );

  const visibleCutPins = useMemo(
    () =>
      filterPinsByStageAndCut(state.pins, {
        stage: state.activeStageFilter,
        cutIndex: activeCut.cutIndex,
      }),
    [activeCut.cutIndex, state.activeStageFilter, state.pins],
  );

  const selectedPin = useMemo(
    () =>
      state.pins.find((pin) => pin.id === state.selectedPinId) ??
      visibleCutPins[0] ??
      stageFilteredPins[0] ??
      null,
    [stageFilteredPins, state.pins, state.selectedPinId, visibleCutPins],
  );

  const jumpTarget = useMemo<ViewportJumpTarget | null>(
    () => (selectedPin ? computeViewportJumpTarget(selectedPin, viewportMetrics) : null),
    [selectedPin, viewportMetrics],
  );

  const layerStack = useMemo(() => buildSampleCanvasLayerStack(state), [state]);
  const exportAudit = useMemo(
    () => stripNonPrintOverlayForExport(layerStack, { format: exportFormat }),
    [exportFormat, layerStack],
  );

  function handleToggleVisibility(): void {
    const nextVisible = !state.visible;
    setState((prev) => updateNonPrintOverlayControls(prev, { visible: nextVisible }));
    setStatusMessage(
      nextVisible
        ? {
            ko: "비출력 붉은펜 레이어(99_NONPRINT_REDLINE_OVERLAY)를 표시했습니다.",
            en: "Shown non-print redline layer (99_NONPRINT_REDLINE_OVERLAY).",
          }
        : {
            ko: "비출력 붉은펜 레이어를 일시 숨김 처리했습니다. 작업 선화만 깔끔하게 확인하세요.",
            en: "Hidden non-print redline layer temporarily so you can inspect clean artwork.",
          },
    );
  }

  function handleOpacityChange(nextPercent: number): void {
    setState((prev) => updateNonPrintOverlayControls(prev, { opacity: nextPercent / 100 }));
  }

  function handleSelectCut(cutIndex: number): void {
    const firstPinInCut = state.pins.find((pin) => pin.cutIndex === cutIndex);
    setState((prev) =>
      updateNonPrintOverlayControls(prev, {
        activeCutIndex: cutIndex,
        selectedPinId: firstPinInCut?.id ?? prev.selectedPinId,
      }),
    );
  }

  function handleJumpToPin(pin: RedlinePinThread): void {
    const target = computeViewportJumpTarget(pin, viewportMetrics);
    setState((prev) =>
      updateNonPrintOverlayControls(prev, {
        activeCutIndex: pin.cutIndex,
        selectedPinId: pin.id,
      }),
    );
    onViewportJump?.(target, pin);
    setStatusMessage({
      ko: `#${pin.pinNumber} (${pin.cutId}) 좌표로 자동 점프했습니다 · X ${target.focusCanvasX}px, Y ${target.focusCanvasY}px · 스크롤 (${target.scrollLeft}, ${target.scrollTop}) · ${Math.round(target.zoom * 100)}%`,
      en: `Jumped to pin #${pin.pinNumber} (${pin.cutId}) · X ${target.focusCanvasX}px, Y ${target.focusCanvasY}px · scroll (${target.scrollLeft}, ${target.scrollTop}) · ${Math.round(target.zoom * 100)}%`,
    });
  }

  function handleStatusSync(pin: RedlinePinThread, nextStatus: RedlinePinStatus): void {
    const snapshot = syncRedlineResolutionToReviewBoard(state, pin.id, nextStatus, {
      actorKo: "작업 작가",
      actorEn: "Studio Artist",
    });
    setState(snapshot.nextState);
    onSyncStateChange?.(snapshot);
    setStatusMessage({ ko: snapshot.syncEventSummaryKo, en: snapshot.syncEventSummaryEn });
  }

  function handleStageClick(event: MouseEvent<HTMLButtonElement>): void {
    if (!isPlacingPin) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextCoord = {
      xPct: clampCoordPct(((event.clientX - rect.left) / rect.width) * 100),
      yPct: clampCoordPct(((event.clientY - rect.top) / rect.height) * 100),
    };
    setDraftCoord(nextCoord);
    setStatusMessage({
      ko: `${activeCut.cutId} 새 핀 위치 지정 (${nextCoord.xPct}%, ${nextCoord.yPct}%). 수정 지시를 입력해 등록하세요.`,
      en: `Draft pin placed on ${activeCut.cutId} (${nextCoord.xPct}%, ${nextCoord.yPct}%). Enter a note to save.`,
    });
  }

  function handleCreatePin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const cleanedNote = draftNote.trim();
    if (!cleanedNote) return;
    const cleanedVoice = draftVoice.trim();
    const stageSpec = REDLINE_STAGE_SPECS[draftStage];
    const hasHangulNote = HANGUL_REGEX.test(cleanedNote);
    const hasHangulVoice = HANGUL_REGEX.test(cleanedVoice);

    const nextState = addRedlinePinToOverlay(state, {
      cutIndex: activeCut.cutIndex,
      xPct: draftCoord.xPct,
      yPct: draftCoord.yPct,
      stage: draftStage,
      titleKo: cleanedNote.slice(0, 28),
      titleEn: hasHangulNote
        ? `${activeCut.cutId} ${stageSpec.labelEn} Redline`
        : cleanedNote.slice(0, 36),
      noteKo: cleanedNote,
      noteEn: hasHangulNote
        ? `Reviewer requested ${stageSpec.labelEn.toLowerCase()} adjustment at (${draftCoord.xPct}%, ${draftCoord.yPct}%).`
        : cleanedNote,
      voiceNote: cleanedVoice
        ? {
            id: `vn-custom-${state.syncRevision + 1}`,
            durationSec: Math.max(6, Math.min(90, Math.ceil(cleanedVoice.length * 0.5))),
            speakerKo: "담당 PD",
            speakerEn: "Lead PD",
            transcriptKo: cleanedVoice,
            transcriptEn: hasHangulVoice
              ? "Reviewer voice critique attached to this pin."
              : cleanedVoice,
            recordedAtIso: "2026-11-23T07:55:00Z",
          }
        : undefined,
    });

    const createdPin = nextState.pins[nextState.pins.length - 1];
    setState(nextState);
    setDraftNote("");
    setDraftVoice("");
    setIsPlacingPin(false);
    if (createdPin) {
      const target = computeViewportJumpTarget(createdPin, viewportMetrics);
      onViewportJump?.(target, createdPin);
      setStatusMessage({
        ko: `새 붉은펜 핀 #${createdPin.pinNumber} (${createdPin.cutId})가 비출력 레이어에 등록되었습니다.`,
        en: `Added redline pin #${createdPin.pinNumber} (${createdPin.cutId}) to the non-print layer.`,
      });
    }
  }

  function handleExportFormatChange(nextFormat: ExportFormatKind): void {
    setExportFormat(nextFormat);
    const report = stripNonPrintOverlayForExport(layerStack, { format: nextFormat });
    onExportAudit?.(report);
    setStatusMessage({ ko: report.summaryKo, en: report.summaryEn });
  }

  const rootClassName = className ? `rlo-shell ${className}` : "rlo-shell";
  const opacityPct = Math.round(state.opacity * 100);

  return (
    <section className={rootClassName} aria-labelledby={headingId}>
      <header className="rlo-header">
        <div className="rlo-header-copy">
          <span className="rlo-kicker">
            <PenTool size={14} aria-hidden="true" />
            <span>
              {pick(
                "PD·강사 붉은펜 검수 ↔ 캔버스 양방향 동기화",
                "PD & Instructor Redline ↔ Canvas Two-Way Sync",
              )}
            </span>
          </span>
          <h2 id={headingId} className="rlo-title">
            {pick(state.episodeTitleKo, state.episodeTitleEn)}
          </h2>
          <p className="rlo-subtitle">
            {pick(
              "검수 붉은펜과 음성 메모를 캔버스 최상단 비출력 레이어로 띄워 두고, 핀 클릭으로 컷 좌표에 자동 점프한 뒤 수정 완료를 검수 보드와 즉시 동기화합니다.",
              "Keep reviewer redline strokes and voice memos on a non-export topmost layer, jump straight to each cut coordinate, and sync completion back to the review board.",
            )}
          </p>
        </div>

        <div className="rlo-header-badges">
          <span
            className="rlo-pill rlo-pill-safe"
            data-testid="rlo-export-safety-badge"
            data-redline-leak={exportAudit.redlinePixelLeakCount}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            <span>
              {pick("출고 시 붉은펜 0% 포함 보장", "0% Redline in Export Guaranteed")}
            </span>
          </span>
          <span
            className={
              metrics.canShip ? "rlo-pill rlo-pill-safe rlo-num" : "rlo-pill rlo-pill-open rlo-num"
            }
            data-testid="rlo-ship-status-badge"
            data-can-ship={String(metrics.canShip)}
          >
            {metrics.canShip
              ? pick("출고 가능 · 미해결 0건", "Ready to Ship · 0 Open")
              : pick(
                  `출고 대기 · 미해결 ${metrics.openCount}건`,
                  `Hold Export · ${metrics.openCount} Open`,
                )}
          </span>
          <span className="rlo-pill rlo-layer-code" data-testid="rlo-layer-id-badge">
            <Layers size={13} aria-hidden="true" />
            <span>{state.layerId}</span>
          </span>
        </div>
      </header>

      <div
        className="rlo-toolbar"
        role="toolbar"
        aria-label={pick("비출력 오버레이 제어", "Non-print overlay controls")}
      >
        <div className="rlo-toolbar-group">
          <button
            type="button"
            className="rlo-btn"
            aria-pressed={state.visible}
            onClick={handleToggleVisibility}
            data-testid="rlo-visibility-toggle"
          >
            {state.visible ? (
              <Eye size={16} aria-hidden="true" />
            ) : (
              <EyeOff size={16} aria-hidden="true" />
            )}
            <span>
              {state.visible
                ? pick("비출력 레이어 표시 중", "Non-Print Layer Visible")
                : pick("비출력 레이어 숨김", "Non-Print Layer Hidden")}
            </span>
          </button>

          <div className="rlo-opacity-control">
            <label htmlFor={opacityInputId}>
              {pick("오버레이 불투명도", "Overlay Opacity")}
            </label>
            <input
              id={opacityInputId}
              className="rlo-slider"
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacityPct}
              onChange={(event) => handleOpacityChange(Number(event.target.value))}
              data-testid="rlo-opacity-slider"
            />
            <span className="rlo-num" data-testid="rlo-opacity-value">
              {opacityPct}%
            </span>
          </div>
        </div>

        <div className="rlo-toolbar-group">
          <button
            type="button"
            className="rlo-btn rlo-btn-redline"
            aria-pressed={isPlacingPin}
            onClick={() => setIsPlacingPin((prev) => !prev)}
            data-testid="rlo-place-pin-toggle"
          >
            <PenTool size={15} aria-hidden="true" />
            <span>
              {isPlacingPin
                ? pick("핀 찍기 모드 켜짐", "Pin Placement Active")
                : pick("직접 붉은펜 새 핀 찍기", "Add New Redline Pin")}
            </span>
          </button>
        </div>
      </div>

      <div className="rlo-workspace">
        <div className="rlo-column">
          <div className="rlo-card">
            <div className="rlo-card-head">
              <h3 className="rlo-card-title">
                <Crosshair size={15} aria-hidden="true" />
                <span>{pick(activeCut.labelKo, activeCut.labelEn)}</span>
              </h3>
              <span className="rlo-pill rlo-num">
                {pick(
                  `동기화 리비전 v${state.syncRevision} · 진행률 ${metrics.completionPct}%`,
                  `Sync Rev v${state.syncRevision} · ${metrics.completionPct}% Done`,
                )}
              </span>
            </div>

            <div className="rlo-cut-tabs" role="group" aria-label={pick("컷 선택", "Select cut")}>
              {state.cuts.map((cut) => {
                const openInCut = state.pins.filter(
                  (pin) => pin.cutIndex === cut.cutIndex && isPinUnresolved(pin.status),
                ).length;
                return (
                  <button
                    key={cut.cutId}
                    type="button"
                    className="rlo-btn rlo-num"
                    aria-pressed={cut.cutIndex === activeCut.cutIndex}
                    onClick={() => handleSelectCut(cut.cutIndex)}
                  >
                    <span>{cut.cutId}</span>
                    <span>{openInCut > 0 ? `(${openInCut})` : "✓"}</span>
                  </button>
                );
              })}
            </div>

            <div
              className="rlo-stage-frame"
              data-mode={isPlacingPin ? "place" : "browse"}
              data-testid="rlo-cut-stage"
            >
              <span className="rlo-stage-watermark">
                {pick(
                  `${state.layerId} · 비출력 전용 (${opacityPct}%)`,
                  `${state.layerId} · Non-Print Only (${opacityPct}%)`,
                )}
              </span>

              <svg
                className="rlo-artwork-layer"
                viewBox={`0 0 ${STAGE_VIEWBOX_W} ${STAGE_VIEWBOX_H}`}
                aria-hidden="true"
              >
                {renderCutDraftArtwork(activeCut.cutIndex)}
              </svg>

              <svg
                className="rlo-nonprint-layer"
                viewBox={`0 0 ${STAGE_VIEWBOX_W} ${STAGE_VIEWBOX_H}`}
                style={{ opacity: state.visible ? state.opacity : 0 }}
                data-layer-id={state.layerId}
                data-exportable="false"
                data-print-visible="false"
                data-visible={String(state.visible)}
                data-testid="rlo-nonprint-svg-layer"
                aria-hidden="true"
              >
                {visibleCutPins.flatMap((pin) =>
                  pin.strokes.map((stroke) => (
                    <path
                      key={stroke.id}
                      d={buildRedlineStrokeSvgPath(stroke.points, STAGE_VIEWBOX_W, STAGE_VIEWBOX_H)}
                      className={strokeClassForPin(stroke, pin.status)}
                      strokeWidth={stroke.strokeWidthPx}
                      strokeDasharray={stroke.style === "dashed" ? "6 4" : undefined}
                    />
                  )),
                )}
              </svg>

              <button
                type="button"
                className="rlo-stage-hit-surface"
                onClick={handleStageClick}
                aria-label={
                  isPlacingPin
                    ? pick(
                        `${activeCut.cutId} 컷 위 클릭하여 새 붉은펜 핀 위치 지정`,
                        `Click on ${activeCut.cutId} to place a new redline pin`,
                      )
                    : pick(
                        `${activeCut.cutId} 컷 미리보기 영역`,
                        `${activeCut.cutId} cut preview surface`,
                      )
                }
                data-testid="rlo-stage-hit-surface"
              />

              {selectedPin && selectedPin.cutIndex === activeCut.cutIndex && state.visible ? (
                <span
                  className="rlo-jump-reticle"
                  style={{ left: `${selectedPin.xPct}%`, top: `${selectedPin.yPct}%` }}
                  aria-hidden="true"
                />
              ) : null}

              {isPlacingPin ? (
                <span
                  className="rlo-draft-dot"
                  style={{ left: `${draftCoord.xPct}%`, top: `${draftCoord.yPct}%` }}
                  aria-hidden="true"
                />
              ) : null}

              {state.visible
                ? visibleCutPins.map((pin) => (
                    <button
                      key={pin.id}
                      type="button"
                      className="rlo-pin-marker"
                      style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
                      data-status={pin.status}
                      data-selected={String(selectedPin?.id === pin.id)}
                      onClick={() => handleJumpToPin(pin)}
                      aria-label={pick(
                        `핀 ${pin.pinNumber} (${pin.cutId}): ${pin.titleKo} 좌표로 이동`,
                        `Pin ${pin.pinNumber} (${pin.cutId}): Jump to ${pin.titleEn}`,
                      )}
                      data-testid={`rlo-canvas-pin-${pin.id}`}
                    >
                      <span className="rlo-pin-badge rlo-num">{pin.pinNumber}</span>
                    </button>
                  ))
                : null}
            </div>

            {jumpTarget && selectedPin ? (
              <div className="rlo-jump-readout" data-testid="rlo-jump-readout">
                <span>
                  {pick(
                    `자동 점프 대상: #${selectedPin.pinNumber} ${jumpTarget.cutId}`,
                    `Jump Target: #${selectedPin.pinNumber} ${jumpTarget.cutId}`,
                  )}
                </span>
                <span className="rlo-jump-coords rlo-num">
                  {`(${jumpTarget.focusCanvasX}px, ${jumpTarget.focusCanvasY}px) · scroll(${jumpTarget.scrollLeft}, ${jumpTarget.scrollTop}) · ${Math.round(jumpTarget.zoom * 100)}%`}
                </span>
              </div>
            ) : null}

            {isPlacingPin ? (
              <form
                className="rlo-composer"
                onSubmit={handleCreatePin}
                data-testid="rlo-new-pin-form"
              >
                <div className="rlo-card-head">
                  <strong className="rlo-card-title">
                    {pick("새 붉은펜 핀 등록", "Create New Redline Pin")}
                  </strong>
                  <span className="rlo-pill rlo-num">
                    {`${activeCut.cutId} · X ${draftCoord.xPct}%, Y ${draftCoord.yPct}%`}
                  </span>
                </div>

                <div className="rlo-form-row">
                  <div className="rlo-field">
                    <label htmlFor={stageSelectId}>{pick("담당 공정", "Target Stage")}</label>
                    <select
                      id={stageSelectId}
                      className="rlo-select"
                      value={draftStage}
                      onChange={(event) =>
                        setDraftStage(event.target.value as RedlineProcessStage)
                      }
                    >
                      {REDLINE_STAGE_ORDER.map((stageId) => (
                        <option key={stageId} value={stageId}>
                          {pick(
                            REDLINE_STAGE_SPECS[stageId].labelKo,
                            REDLINE_STAGE_SPECS[stageId].labelEn,
                          )}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rlo-field">
                    <label htmlFor={voiceInputId}>
                      {pick("음성 첨삭 메모 (선택)", "Voice Memo Transcript (Optional)")}
                    </label>
                    <input
                      id={voiceInputId}
                      className="rlo-input"
                      type="text"
                      value={draftVoice}
                      onChange={(event) => setDraftVoice(event.target.value)}
                      placeholder={pick(
                        "예: 턱선 음영을 한 톤 부드럽게",
                        "e.g., Soften jawline shadow by one step",
                      )}
                    />
                  </div>
                </div>

                <div className="rlo-field">
                  <label htmlFor={noteInputId}>
                    {pick("붉은펜 수정 요청 내용", "Redline Revision Instruction")}
                  </label>
                  <input
                    id={noteInputId}
                    className="rlo-input"
                    type="text"
                    required
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    placeholder={pick(
                      "예: 오른쪽 눈동자 하이라이트 위치 정렬",
                      "e.g., Align right iris catchlight with key light",
                    )}
                  />
                </div>

                <div className="rlo-thread-actions">
                  <button type="submit" className="rlo-btn rlo-btn-primary">
                    {pick("붉은펜 핀 추가", "Save Redline Pin")}
                  </button>
                  <button
                    type="button"
                    className="rlo-btn"
                    onClick={() => setIsPlacingPin(false)}
                  >
                    {pick("취소", "Cancel")}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        <div className="rlo-column">
          <RedlineReviewThreadsSection
            isKo={isKo}
            metrics={metrics}
            activeStageFilter={state.activeStageFilter}
            pins={stageFilteredPins}
            selectedPinId={selectedPin?.id ?? null}
            activeVoicePinId={activeVoicePinId}
            onStageFilterChange={(stage) =>
              setState((prev) => updateNonPrintOverlayControls(prev, { activeStageFilter: stage }))
            }
            onToggleVoicePin={(pinId) =>
              setActiveVoicePinId((current) => (current === pinId ? null : pinId))
            }
            onJumpToPin={handleJumpToPin}
            onStatusSync={handleStatusSync}
          />

          <RedlineExportAuditSection
            isKo={isKo}
            exportFormat={exportFormat}
            exportAudit={exportAudit}
            onExportFormatChange={handleExportFormatChange}
          />
        </div>
      </div>

      <div
        className="rlo-live-status"
        role="status"
        aria-live="polite"
        data-testid="rlo-live-status"
      >
        {pick(statusMessage.ko, statusMessage.en)}
      </div>
    </section>
  );
}
