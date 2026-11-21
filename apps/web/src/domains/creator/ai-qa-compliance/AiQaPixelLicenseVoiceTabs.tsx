import { CheckCircle2, Globe2, Mic, Paintbrush2, ShieldCheck, ShieldX } from "lucide-react";

import {
  SAMPLE_VOICE_FEEDBACK_PRESETS,
  type CommercialRightsGateReport,
  type MultilingualBalloonAuditReport,
  type PixelArtifactScanReport,
  type PixelQaGridInput,
  type SupportedQaLocale,
  type VoiceQaFeedbackPinTicket,
} from "./webtoon-pixel-license-voice-qa-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ALL_LOCALES: readonly SupportedQaLocale[] = ["ko", "en", "ja", "vi", "th", "id", "es"];

/**
 * 탭 4: 채색 빈틈 · 선 밖 넘침 · 지우개 잔여물 픽셀 헌터
 */
export function PixelHunterTabView({
  grid,
  report,
  isCleaned,
  onRunCleanup,
  onResetSample,
}: {
  readonly grid: PixelQaGridInput;
  readonly report: PixelArtifactScanReport;
  readonly isCleaned: boolean;
  readonly onRunCleanup: () => void;
  readonly onResetSample: () => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const gapSet = new Set(
    report.artifacts.filter((a) => a.kind === "unfilled-gap").flatMap((a) => a.pixelIndices),
  );
  const bleedSet = new Set(
    report.artifacts.filter((a) => a.kind === "color-bleed").flatMap((a) => a.pixelIndices),
  );
  const dustSet = new Set(
    report.artifacts.filter((a) => a.kind === "eraser-dust").flatMap((a) => a.pixelIndices),
  );

  const cells = Array.from({ length: grid.width * grid.height }, (_, idx) => {
    if (grid.lineArtMask[idx] === 1) return "line";
    if (gapSet.has(idx)) return "gap";
    if (bleedSet.has(idx)) return "bleed";
    if (dustSet.has(idx)) return "dust";
    return grid.colorRgba[idx * 4 + 3] >= 16 ? "fill" : "empty";
  });

  return (
    <section className="qa-panel" data-testid="qa-panel-pixel">
      <div className={report.verdict === "CLEAN" ? "qa-card qa-card--pass" : "qa-card qa-card--blocked"}>
        <div className="qa-row-between">
          <div>
            <div className="qa-row">
              <Paintbrush2 size={16} aria-hidden />
              <strong>{bt("4. 채색 빈틈 · 선 밖 넘침 · 지우개 잔여물 픽셀 헌터", "4. Pixel Artifact Hunter & Batch Cleanup")}</strong>
              <span
                className="qa-badge"
                data-testid="qa-pixel-verdict"
                data-tone={report.verdict === "CLEAN" ? "good" : "bad"}
              >
                {report.verdict === "CLEAN" ? bt("클린 완료 (0건)", "CLEAN (0)") : `탐지 ${report.artifacts.length}건`}
              </span>
            </div>
            <p className="qa-item-meta qa-num">
              빈틈 {report.unfilledGapCount}건 · 선 밖 넘침 {report.colorBleedCount}건 · 지우개 잔여물 {report.eraserDustCount}건 (총 {report.totalAffectedPixels}px)
            </p>
          </div>
          <div className="qa-row">
            <button
              type="button"
              className="qa-btn qa-btn--primary"
              data-testid="qa-pixel-cleanup-btn"
              disabled={report.artifacts.length === 0}
              onClick={onRunCleanup}
            >
              {bt("1클릭 일괄 클린업", "1-Click Batch Cleanup")}
            </button>
            {isCleaned ? (
              <button type="button" className="qa-btn" onClick={onResetSample}>
                {bt("원본 복원", "Restore sample")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="qa-two-col">
        <div className="qa-card">
          <strong>{bt(`${grid.cutNumber}컷 래스터 핀 맵 (${grid.width}×${grid.height})`, `Cut ${grid.cutNumber} Raster Pin Map`)}</strong>
          <div className="qa-pixel-stage" style={{ marginTop: "0.625rem" }} aria-label="픽셀 결함 미리보기 격자">
            {cells.map((cellKind, idx) => (
              <span key={idx} className="qa-pixel-cell" data-cell={cellKind} />
            ))}
          </div>
        </div>

        <div className="qa-card">
          <strong>{bt("좌표 핀 목록", "Detected Pin Coordinates")}</strong>
          <ul className="qa-list" style={{ marginTop: "0.625rem" }} data-testid="qa-pixel-artifact-list">
            {report.artifacts.length === 0 ? (
              <li className="qa-item">{bt("모든 채색 빈틈·넘침·잔여물 픽셀이 정리되었습니다.", "All pixel artifacts are cleaned.")}</li>
            ) : (
              report.artifacts.map((pin) => (
                <li key={pin.id} className="qa-item">
                  <div className="qa-row-between">
                    <strong>{pin.labelKo}</strong>
                    <span className="qa-badge" data-tone={pin.kind === "unfilled-gap" ? "bad" : pin.kind === "color-bleed" ? "warn" : "cool"}>
                      ({pin.pinX}, {pin.pinY}) · {pin.pixelCount}px
                    </span>
                  </div>
                  <p className="qa-item-meta">{pin.cleanupActionKo}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * 탭 5: 7개국어 번역 말풍선 넘침 & 줄바꿈 자동 교정
 */
export function MultilingualBalloonTabView({
  selectedLocale,
  report,
  onSelectLocale,
}: {
  readonly selectedLocale: SupportedQaLocale | "all";
  readonly report: MultilingualBalloonAuditReport;
  readonly onSelectLocale: (next: SupportedQaLocale | "all") => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const visibleItems =
    selectedLocale === "all"
      ? report.items
      : report.items.filter((item) => item.locale === selectedLocale);

  return (
    <section className="qa-panel" data-testid="qa-panel-multilingual">
      <div className="qa-card">
        <div className="qa-row-between">
          <div className="qa-row">
            <Globe2 size={16} aria-hidden />
            <strong>{bt("5. 7개국어 번역 말풍선 넘침 & 안전 줄바꿈 교정", "5. 7-Language Balloon Overflow & Safe Wrap")}</strong>
          </div>
          <span className="qa-badge" data-tone="good" data-testid="qa-multilingual-summary">
            자동 교정 {report.autoFixedCount} · 정상 {report.fitCount} · 확장 필요 {report.expandRequiredCount}
          </span>
        </div>
        <div className="qa-row" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="qa-chip"
            aria-pressed={selectedLocale === "all"}
            data-testid="qa-locale-all"
            onClick={() => onSelectLocale("all")}
          >
            전체 7개국어
          </button>
          {ALL_LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              className="qa-chip"
              aria-pressed={selectedLocale === loc}
              data-testid={`qa-locale-${loc}`}
              onClick={() => onSelectLocale(loc)}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <ul className="qa-list" data-testid="qa-multilingual-list">
        {visibleItems.map((item) => (
          <li key={item.balloonId} className="qa-item">
            <div className="qa-row-between">
              <div className="qa-row">
                <strong>
                  {item.cutNumber}컷 · {item.localeLabelKo}
                </strong>
                <span
                  className="qa-badge"
                  data-tone={item.status === "EXPAND_BALLOON" ? "warn" : "good"}
                >
                  {item.status} · {item.originalFontSizePx}px → {item.recommendedFontSizePx}px
                </span>
              </div>
              <span className="qa-item-meta qa-num">
                여백 {item.originalPaddingPx}→{item.recommendedPaddingPx}px · 줄간격 {item.recommendedLineHeight}
              </span>
            </div>
            <p className="qa-item-meta">{item.localeNoteKo}</p>
            <div className="qa-balloon-preview" style={{ marginTop: "0.5rem" }}>
              {item.correctedLines.join("\n")}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 탭 6: 출판 전 폰트·3D·브러시 상업 라이선스 차단 게이트 (Fail-Closed)
 */
export function CommercialRightsGateTabView({
  report,
  onSwapAsset,
  onSwapAllSafe,
}: {
  readonly report: CommercialRightsGateReport;
  readonly onSwapAsset: (assetId: string, alternativeId: string) => void;
  readonly onSwapAllSafe: () => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");

  return (
    <section className="qa-panel" data-testid="qa-panel-rights">
      <div className={report.canPublish ? "qa-card qa-card--pass" : "qa-card qa-card--blocked"}>
        <div className="qa-row-between">
          <div>
            <div className="qa-row">
              {report.canPublish ? <ShieldCheck size={16} aria-hidden /> : <ShieldX size={16} aria-hidden />}
              <strong>{bt("6. 출판 전 폰트·3D·브러시 상업 라이선스 게이트", "6. Pre-Publish Commercial Rights Gate")}</strong>
              <span
                className="qa-badge"
                data-testid="qa-rights-verdict"
                data-tone={report.canPublish ? "good" : "bad"}
              >
                {report.verdict}
              </span>
            </div>
            <p className="qa-item-meta">
              {report.canPublish
                ? bt("모든 폰트·3D·브러시의 상업 라이선스가 검증되어 출판 가능합니다.", "All assets verified for commercial publishing.")
                : `차단 에셋 ${report.blockedCount}건(영향 컷: ${report.blockedCutNumbers.join(", ")}컷) — Fail-Closed 정책으로 출판이 잠겨 있습니다.`}
            </p>
          </div>
          {!report.canPublish ? (
            <button
              type="button"
              className="qa-btn qa-btn--primary"
              data-testid="qa-rights-swap-all-btn"
              onClick={onSwapAllSafe}
            >
              <CheckCircle2 size={15} aria-hidden />
              {bt("검증 CC0/상업 무료 소재 일괄 교체", "Swap all to verified CC0/free")}
            </button>
          ) : null}
        </div>
      </div>

      <ul className="qa-list" data-testid="qa-rights-violations">
        {report.violations.length === 0 ? (
          <li className="qa-item">{bt("출판 차단 에셋이 없습니다. 상업 연재 내보내기를 진행할 수 있습니다.", "No blocked assets remaining.")}</li>
        ) : (
          report.violations.map((v) => {
            const firstAlt = v.recommendedAlternatives[0];
            return (
              <li key={v.assetId} className="qa-item">
                <div className="qa-row-between">
                  <div className="qa-row">
                    <span className="qa-badge" data-tone="bad">
                      {v.failureReasonCode}
                    </span>
                    <strong>
                      {v.assetName} ({v.usedInCuts.join(", ")}컷)
                    </strong>
                  </div>
                  {firstAlt ? (
                    <button
                      type="button"
                      className="qa-btn qa-btn--good"
                      data-testid={`qa-rights-swap-${v.assetId}`}
                      onClick={() => onSwapAsset(v.assetId, firstAlt.alternativeId)}
                    >
                      {firstAlt.name} ({firstAlt.licenseBadge}) 교체
                    </button>
                  ) : null}
                </div>
                <p className="qa-item-meta">{v.reasonKo}</p>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

/**
 * 탭 7: PD/AD 음성 피드백 → 컷 자동 핀 + 수정 전/후 와이프 비교 승인
 */
export function VoicePinWipeTabView({
  transcriptInput,
  tickets,
  activeTicketId,
  onChangeTranscript,
  onCreatePinFromTranscript,
  onSelectTicket,
  onChangeWipe,
  onSubmitFix,
  onApproveTicket,
  onRequestRevision,
}: {
  readonly transcriptInput: string;
  readonly tickets: readonly VoiceQaFeedbackPinTicket[];
  readonly activeTicketId: string;
  readonly onChangeTranscript: (next: string) => void;
  readonly onCreatePinFromTranscript: (transcript: string, role?: "PD" | "AD") => void;
  readonly onSelectTicket: (ticketId: string) => void;
  readonly onChangeWipe: (ticketId: string, pct: number) => void;
  readonly onSubmitFix: (ticketId: string) => void;
  readonly onApproveTicket: (ticketId: string) => void;
  readonly onRequestRevision: (ticketId: string) => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const activeTicket = tickets.find((item) => item.ticketId === activeTicketId) ?? tickets[0];

  return (
    <section className="qa-panel" data-testid="qa-panel-voice">
      <div className="qa-card">
        <div className="qa-row">
          <Mic size={16} aria-hidden />
          <strong>{bt("7. PD/AD 음성 피드백 → 컷 자동 핀 · Before/After 와이프 승인", "7. Voice QA Feedback to Cut Pin & Wipe Approval")}</strong>
        </div>
        <div className="qa-row" style={{ marginTop: "0.75rem" }}>
          <label className="sr-only" htmlFor="qa-voice-transcript-input">
            {bt("PD/AD 음성 피드백 입력", "Voice QA feedback input")}
          </label>
          <input
            id="qa-voice-transcript-input"
            type="text"
            className="qa-input"
            data-testid="qa-voice-input"
            value={transcriptInput}
            placeholder="예: 14컷 주인공 눈빛 더 날카롭게"
            onChange={(event) => onChangeTranscript(event.target.value)}
          />
          <button
            type="button"
            className="qa-btn qa-btn--primary"
            data-testid="qa-voice-create-pin-btn"
            onClick={() => onCreatePinFromTranscript(transcriptInput, "PD")}
          >
            {bt("컷 자동 핀 생성", "Parse & Create Pin")}
          </button>
        </div>
        <div className="qa-row" style={{ marginTop: "0.5rem" }}>
          {SAMPLE_VOICE_FEEDBACK_PRESETS.map((preset) => (
            <button
              key={preset.labelKo}
              type="button"
              className="qa-chip"
              onClick={() => onCreatePinFromTranscript(preset.transcript, preset.role)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div className="qa-two-col">
        <div className="qa-card">
          <strong>{bt("자동 생성 핀 티켓 목록", "Generated Pin Tickets")}</strong>
          <ul className="qa-list" style={{ marginTop: "0.625rem" }} data-testid="qa-voice-ticket-list">
            {tickets.map((ticket) => (
              <li key={ticket.ticketId} className="qa-item">
                <div className="qa-row-between">
                  <button
                    type="button"
                    className="qa-chip"
                    aria-pressed={activeTicket?.ticketId === ticket.ticketId}
                    onClick={() => onSelectTicket(ticket.ticketId)}
                  >
                    {ticket.cutNumber}컷 · {ticket.regionLabelKo}
                  </button>
                  <span
                    className="qa-badge"
                    data-tone={
                      ticket.status === "approved"
                        ? "good"
                        : ticket.status === "revision-requested"
                          ? "bad"
                          : "warn"
                    }
                  >
                    {ticket.status}
                  </span>
                </div>
                <p className="qa-item-meta">
                  [{ticket.speakerRole}] {ticket.instructionKo} (좌표 {(ticket.pinXNorm * 100).toFixed(0)}%, {(ticket.pinYNorm * 100).toFixed(0)}%)
                </p>
              </li>
            ))}
          </ul>
        </div>

        {activeTicket ? (
          <div className="qa-card" data-testid="qa-voice-wipe-card">
            <div className="qa-row-between">
              <strong>
                {activeTicket.cutNumber}컷 Before / After 와이프 비교 ({activeTicket.wipePositionPct}%)
              </strong>
              <span className="qa-badge" data-testid="qa-voice-active-status" data-tone={activeTicket.status === "approved" ? "good" : "cool"}>
                {activeTicket.status}
              </span>
            </div>

            <div className="qa-wipe-stage" style={{ marginTop: "0.625rem" }}>
              <div className="qa-wipe-before">
                <strong>수정 전 (Before)</strong>
                <p className="qa-item-meta">{activeTicket.beforeSummaryKo}</p>
              </div>
              <div
                className="qa-wipe-after"
                style={{ clipPath: `inset(0 0 0 ${activeTicket.wipePositionPct}%)` }}
              >
                <strong>수정 후 (After)</strong>
                <p className="qa-item-meta">{activeTicket.afterSummaryKo}</p>
              </div>
              <span
                className="qa-pin-dot"
                aria-hidden="true"
                style={{
                  left: `${activeTicket.pinXNorm * 100}%`,
                  top: `${activeTicket.pinYNorm * 100}%`,
                }}
              />
            </div>

            <label className="qa-item-meta" htmlFor="qa-wipe-range" style={{ display: "block", marginTop: "0.5rem" }}>
              와이프 분할 위치 ({activeTicket.wipePositionPct}%)
            </label>
            <input
              id="qa-wipe-range"
              type="range"
              min={0}
              max={100}
              value={activeTicket.wipePositionPct}
              className="qa-range"
              data-testid="qa-voice-wipe-slider"
              onChange={(event) => onChangeWipe(activeTicket.ticketId, Number(event.target.value))}
            />

            <div className="qa-row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="qa-btn"
                data-testid="qa-voice-submit-fix-btn"
                onClick={() => onSubmitFix(activeTicket.ticketId)}
              >
                수정본 제출
              </button>
              <button
                type="button"
                className="qa-btn qa-btn--good"
                data-testid="qa-voice-approve-btn"
                onClick={() => onApproveTicket(activeTicket.ticketId)}
              >
                와이프 비교 승인
              </button>
              <button
                type="button"
                className="qa-btn qa-btn--bad"
                data-testid="qa-voice-revision-btn"
                onClick={() => onRequestRevision(activeTicket.ticketId)}
              >
                재수정 요청
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
