import { Palette, RotateCcw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";

import {
  formatByteSizeLabel,
  type SnapshotDiffSummary,
  type SnapshotTriggerKind,
  type TimeMachineSnapshot,
  type TimeMachineTimelineState,
} from "./delta-sync-offline-engine";
import {
  PALETTE_SLOT_LABELS_KO,
  PALETTE_SLOT_ORDER,
  ZERO_LEAK_ROLE_POLICIES,
  formatOklchCss,
  type ExternalCollabRole,
  type ForensicAuditLogEntry,
  type StyleLockAuditReport,
  type SubmittedCutStyleSample,
  type ZeroLeakAccessToken,
  type ZeroLeakEvaluationResult,
} from "./style-lock-bible-security-engine";

const TRIGGER_LABELS_KO: Readonly<Record<SnapshotTriggerKind, string>> = Object.freeze({
  "auto-60s-journal": "60초 자동 저널",
  "manual-release-tag": "릴리즈 태그",
  "emergency-memory-pressure": "메모리 비상 저장",
  "emergency-webgpu-lost": "WebGPU 비상 저장",
  "pre-rollback-safety": "복원 직전 안전 백업",
});

const ROLE_LIST: readonly ExternalCollabRole[] = Object.freeze([
  "outsource-line",
  "outsource-color",
  "translator",
  "editor-review",
]);

export interface TimeMachineSnapshotTabProps {
  readonly timeline: TimeMachineTimelineState;
  readonly activeSnapshot: TimeMachineSnapshot;
  readonly compareSnapshot: TimeMachineSnapshot;
  readonly snapshotDiff: SnapshotDiffSummary;
  readonly releaseTagInput: string;
  readonly onReleaseTagChange: (value: string) => void;
  readonly onSaveManualSnapshot: () => void;
  readonly onSaveJournalCheckpoint: () => void;
  readonly onTriggerEmergency: (kind: "memory-pressure" | "webgpu-context-lost") => void;
  readonly onSelectCompareSnapshot: (snapshotId: string) => void;
  readonly onRollbackSnapshot: (snapshotId: string) => void;
}

export function TimeMachineSnapshotTabSection({
  timeline,
  activeSnapshot,
  compareSnapshot,
  snapshotDiff,
  releaseTagInput,
  onReleaseTagChange,
  onSaveManualSnapshot,
  onSaveJournalCheckpoint,
  onTriggerEmergency,
  onSelectCompareSnapshot,
  onRollbackSnapshot,
}: TimeMachineSnapshotTabProps) {
  return (
    <div
      role="tabpanel"
      aria-label="타임머신 스냅샷 및 크래시 복구"
      data-testid="sync-tm-panel-timemachine"
      className="ts-sync-tm"
    >
      <div className="ts-sync-tm__card">
        <div className="ts-sync-tm__controls-row">
          <label className="ts-sync-tm__field" htmlFor="stm-release-tag-input">
            <span className="ts-sync-tm__field-label">수동 릴리즈 태그</span>
            <input
              id="stm-release-tag-input"
              type="text"
              className="ts-sync-tm__input"
              value={releaseTagInput}
              onChange={(event) => onReleaseTagChange(event.target.value)}
              placeholder="예: ep12-line-done"
            />
          </label>
          <button
            type="button"
            className="ts-sync-tm__btn ts-sync-tm__btn--primary"
            data-testid="sync-tm-btn-save-release"
            onClick={onSaveManualSnapshot}
          >
            릴리즈 스냅샷 저장
          </button>
          <button
            type="button"
            className="ts-sync-tm__btn"
            data-testid="sync-tm-btn-save-journal"
            onClick={onSaveJournalCheckpoint}
          >
            60초 자동 저널 기록
          </button>
          <button
            type="button"
            className="ts-sync-tm__btn ts-sync-tm__btn--danger"
            data-testid="sync-tm-btn-crash-memory"
            onClick={() => onTriggerEmergency("memory-pressure")}
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            메모리 압박 비상 저장
          </button>
          <button
            type="button"
            className="ts-sync-tm__btn ts-sync-tm__btn--danger"
            data-testid="sync-tm-btn-crash-webgpu"
            onClick={() => onTriggerEmergency("webgpu-context-lost")}
          >
            WebGPU 손실 비상 저장
          </button>
        </div>
      </div>

      <div className="ts-sync-tm__card" data-testid="sync-tm-diff-card">
        <h4 className="ts-sync-tm__section-title">
          스냅샷 비교 요약 ({compareSnapshot.releaseTag ?? compareSnapshot.snapshotId} →{" "}
          {activeSnapshot.releaseTag ?? activeSnapshot.snapshotId})
        </h4>
        <p className="ts-sync-tm__meta" data-testid="sync-tm-diff-summary">
          {snapshotDiff.summaryKo} · 바이트 델타 {formatByteSizeLabel(snapshotDiff.byteDelta)}
        </p>
      </div>

      <ul className="ts-sync-tm__list" data-testid="sync-tm-snapshot-list">
        {[...timeline.snapshots].reverse().map((snap) => {
          const isActive = snap.snapshotId === timeline.activeSnapshotId;
          const isEmergency =
            snap.trigger === "emergency-memory-pressure" || snap.trigger === "emergency-webgpu-lost";
          return (
            <li key={snap.snapshotId} className="ts-sync-tm__list-item ts-sync-tm__list-item--row">
              <div>
                <div className="ts-sync-tm__controls-row">
                  <strong>{snap.releaseTag ?? snap.snapshotId}</strong>
                  <span
                    className={`ts-sync-tm__badge ${
                      isEmergency
                        ? "ts-sync-tm__badge--danger"
                        : isActive
                          ? "ts-sync-tm__badge--ok"
                          : "ts-sync-tm__badge--info"
                    }`}
                  >
                    {TRIGGER_LABELS_KO[snap.trigger]}
                  </span>
                  {isActive ? <span className="ts-sync-tm__badge ts-sync-tm__badge--ok">현재 작업본</span> : null}
                </div>
                <div className="ts-sync-tm__meta">
                  {snap.noteKo} · 컷 {snap.cutCount}개 · 레이어 {snap.layerCount}개 ·{" "}
                  {formatByteSizeLabel(snap.totalBytes)}
                </div>
              </div>
              <div className="ts-sync-tm__controls-row">
                <button
                  type="button"
                  className="ts-sync-tm__btn"
                  onClick={() => onSelectCompareSnapshot(snap.snapshotId)}
                >
                  비교 기준 선택
                </button>
                <button
                  type="button"
                  className="ts-sync-tm__btn"
                  data-testid={`sync-tm-rollback-${snap.snapshotId}`}
                  onClick={() => onRollbackSnapshot(snap.snapshotId)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  원클릭 복원
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface StyleLockSecurityTabProps {
  readonly cutSamples: readonly SubmittedCutStyleSample[];
  readonly activeCutSample: SubmittedCutStyleSample;
  readonly styleReport: StyleLockAuditReport;
  readonly primaryPaletteDeltaE: number;
  readonly onSelectCutSample: (cutId: string) => void;
  readonly onApplyStyleCorrection: () => void;
  readonly tokenRole: ExternalCollabRole;
  readonly onTokenRoleChange: (role: ExternalCollabRole) => void;
  readonly recipientNameKo: string;
  readonly onRecipientNameChange: (value: string) => void;
  readonly cutStartInput: number;
  readonly onCutStartChange: (value: number) => void;
  readonly cutEndInput: number;
  readonly onCutEndChange: (value: number) => void;
  readonly ttlHoursInput: number;
  readonly onTtlHoursChange: (value: number) => void;
  readonly onIssueToken: () => void;
  readonly activeToken: ZeroLeakAccessToken | null;
  readonly probeCutNumber: number;
  readonly onProbeCutChange: (value: number) => void;
  readonly probeResolutionPx: number;
  readonly onProbeResolutionChange: (value: number) => void;
  readonly probeRawExport: boolean;
  readonly onProbeRawExportChange: (value: boolean) => void;
  readonly onRunAccessCheck: () => void;
  readonly onRevokeToken: (tokenId: string) => void;
  readonly lastAccessResult: ZeroLeakEvaluationResult | null;
  readonly auditLogs: readonly ForensicAuditLogEntry[];
}

export function StyleLockSecurityTabSection({
  cutSamples,
  activeCutSample,
  styleReport,
  primaryPaletteDeltaE,
  onSelectCutSample,
  onApplyStyleCorrection,
  tokenRole,
  onTokenRoleChange,
  recipientNameKo,
  onRecipientNameChange,
  cutStartInput,
  onCutStartChange,
  cutEndInput,
  onCutEndChange,
  ttlHoursInput,
  onTtlHoursChange,
  onIssueToken,
  activeToken,
  probeCutNumber,
  onProbeCutChange,
  probeResolutionPx,
  onProbeResolutionChange,
  probeRawExport,
  onProbeRawExportChange,
  onRunAccessCheck,
  onRevokeToken,
  lastAccessResult,
  auditLogs,
}: StyleLockSecurityTabProps) {
  return (
    <div
      role="tabpanel"
      aria-label="아트 바이블 화풍 락 및 Zero-Leak 외주 권한"
      data-testid="sync-tm-panel-style-security"
      className="ts-sync-tm__grid-two"
    >
      <div className="ts-sync-tm__card">
        <div className="ts-sync-tm__controls-row">
          <h4 className="ts-sync-tm__section-title">
            <Palette className="size-4" aria-hidden="true" />
            작가 아트 바이블 화풍 일관성 자동 검수
          </h4>
          <span
            className={`ts-sync-tm__badge ${
              styleReport.severity === "pass"
                ? "ts-sync-tm__badge--ok"
                : styleReport.severity === "warn"
                  ? "ts-sync-tm__badge--warn"
                  : "ts-sync-tm__badge--danger"
            }`}
            data-testid="sync-tm-style-severity"
          >
            {styleReport.passed ? "화풍 락 통과" : styleReport.severity === "block" ? "보정 필수 차단" : "편차 경고"}
          </span>
        </div>

        <label className="ts-sync-tm__field" htmlFor="stm-sample-cut-select">
          <span className="ts-sync-tm__field-label">외주·어시스턴트 제출 컷 선택</span>
          <select
            id="stm-sample-cut-select"
            className="ts-sync-tm__select"
            value={activeCutSample.cutId}
            onChange={(event) => onSelectCutSample(event.target.value)}
          >
            {cutSamples.map((sample) => (
              <option key={sample.cutId} value={sample.cutId}>
                {sample.cutId} ({sample.contributorNameKo})
              </option>
            ))}
          </select>
        </label>

        <p className="ts-sync-tm__meta" data-testid="sync-tm-style-summary">
          {styleReport.summaryKo} (피부 ΔE {primaryPaletteDeltaE.toFixed(1)} · 선폭 배율 ×
          {styleReport.autoCorrection.lineWidthScaleFactor})
        </p>

        <ul className="ts-sync-tm__list">
          {PALETTE_SLOT_ORDER.map((slotKey) => {
            const audit = styleReport.slotAudits.find((item) => item.slot === slotKey);
            if (!audit) return null;
            return (
              <li key={slotKey} className="ts-sync-tm__list-item ts-sync-tm__list-item--row">
                <div className="ts-sync-tm__swatch-pair">
                  <span
                    className="ts-sync-tm__swatch"
                    style={{ backgroundColor: formatOklchCss(audit.target) }}
                    title={`기준 ${formatOklchCss(audit.target)}`}
                  />
                  <span
                    className="ts-sync-tm__swatch"
                    style={{ backgroundColor: formatOklchCss(audit.sampled) }}
                    title={`제출 ${formatOklchCss(audit.sampled)}`}
                  />
                  <strong>{PALETTE_SLOT_LABELS_KO[slotKey]}</strong>
                </div>
                <span
                  className={`ts-sync-tm__badge ${
                    audit.withinLimit ? "ts-sync-tm__badge--ok" : "ts-sync-tm__badge--danger"
                  }`}
                >
                  ΔE {audit.deltaE.toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="ts-sync-tm__btn ts-sync-tm__btn--primary"
          data-testid="sync-tm-btn-autocorrect-style"
          onClick={onApplyStyleCorrection}
          disabled={styleReport.passed}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          1클릭 화풍 락 자동 보정 적용
        </button>
      </div>

      <div className="ts-sync-tm__card">
        <h4 className="ts-sync-tm__section-title">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Zero-Leak 부분 원고 열람 · 비가시 워터마크 발급기
        </h4>

        <div className="ts-sync-tm__controls-row">
          <label className="ts-sync-tm__field" htmlFor="stm-role-select">
            <span className="ts-sync-tm__field-label">외부 협업 역할</span>
            <select
              id="stm-role-select"
              className="ts-sync-tm__select"
              value={tokenRole}
              onChange={(event) => onTokenRoleChange(event.target.value as ExternalCollabRole)}
            >
              {ROLE_LIST.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {ZERO_LEAK_ROLE_POLICIES[roleKey].labelKo} (최대 {ZERO_LEAK_ROLE_POLICIES[roleKey].maxResolutionPx}px)
                </option>
              ))}
            </select>
          </label>
          <label className="ts-sync-tm__field" htmlFor="stm-recipient-input">
            <span className="ts-sync-tm__field-label">수신자 이름</span>
            <input
              id="stm-recipient-input"
              type="text"
              className="ts-sync-tm__input"
              value={recipientNameKo}
              onChange={(event) => onRecipientNameChange(event.target.value)}
            />
          </label>
        </div>

        <div className="ts-sync-tm__controls-row">
          <label className="ts-sync-tm__field" htmlFor="stm-cut-start">
            <span className="ts-sync-tm__field-label">시작 컷</span>
            <input
              id="stm-cut-start"
              type="number"
              min={1}
              className="ts-sync-tm__input"
              value={cutStartInput}
              onChange={(event) => onCutStartChange(Number(event.target.value) || 1)}
            />
          </label>
          <label className="ts-sync-tm__field" htmlFor="stm-cut-end">
            <span className="ts-sync-tm__field-label">종료 컷</span>
            <input
              id="stm-cut-end"
              type="number"
              min={1}
              className="ts-sync-tm__input"
              value={cutEndInput}
              onChange={(event) => onCutEndChange(Number(event.target.value) || 1)}
            />
          </label>
          <label className="ts-sync-tm__field" htmlFor="stm-ttl-hours">
            <span className="ts-sync-tm__field-label">만료(시간)</span>
            <input
              id="stm-ttl-hours"
              type="number"
              min={1}
              className="ts-sync-tm__input"
              value={ttlHoursInput}
              onChange={(event) => onTtlHoursChange(Number(event.target.value) || 1)}
            />
          </label>
          <button
            type="button"
            className="ts-sync-tm__btn ts-sync-tm__btn--primary"
            data-testid="sync-tm-btn-issue-token"
            onClick={onIssueToken}
          >
            부분 열람 토큰 발급
          </button>
        </div>

        {activeToken ? (
          <div className="ts-sync-tm__list-item" data-testid="sync-tm-active-token-box">
            <div className="ts-sync-tm__controls-row">
              <strong>
                {activeToken.recipientNameKo} ({activeToken.allowedCutStart}~{activeToken.allowedCutEnd}컷)
              </strong>
              <span
                className={`ts-sync-tm__badge ${
                  activeToken.revoked ? "ts-sync-tm__badge--danger" : "ts-sync-tm__badge--info"
                }`}
              >
                {activeToken.revoked ? "회수됨" : activeToken.watermarkId}
              </span>
            </div>
            <div className="ts-sync-tm__meta">
              최대 {activeToken.maxResolutionPx}px · 원본 레이어 내보내기{" "}
              {activeToken.allowRawLayerExport ? "허용" : "금지"} · 만료 {activeToken.expiresAtIso}
            </div>

            <div className="ts-sync-tm__controls-row">
              <label className="ts-sync-tm__field" htmlFor="stm-probe-cut">
                <span className="ts-sync-tm__field-label">검증 요청 컷</span>
                <input
                  id="stm-probe-cut"
                  type="number"
                  min={1}
                  className="ts-sync-tm__input"
                  value={probeCutNumber}
                  onChange={(event) => onProbeCutChange(Number(event.target.value) || 1)}
                />
              </label>
              <label className="ts-sync-tm__field" htmlFor="stm-probe-res">
                <span className="ts-sync-tm__field-label">요청 해상도(px)</span>
                <input
                  id="stm-probe-res"
                  type="number"
                  min={640}
                  step={160}
                  className="ts-sync-tm__input"
                  value={probeResolutionPx}
                  onChange={(event) => onProbeResolutionChange(Number(event.target.value) || 640)}
                />
              </label>
              <label className="ts-sync-tm__checkbox-label">
                <input
                  type="checkbox"
                  checked={probeRawExport}
                  onChange={(event) => onProbeRawExportChange(event.target.checked)}
                />
                원본 레이어 내보내기
              </label>
              <button
                type="button"
                className="ts-sync-tm__btn"
                data-testid="sync-tm-btn-verify-access"
                onClick={onRunAccessCheck}
              >
                접근 검증 실행
              </button>
              <button
                type="button"
                className="ts-sync-tm__btn ts-sync-tm__btn--danger"
                data-testid="sync-tm-btn-revoke-token"
                onClick={() => onRevokeToken(activeToken.tokenId)}
                disabled={activeToken.revoked}
              >
                권한 회수
              </button>
            </div>

            {lastAccessResult ? (
              <p className="ts-sync-tm__meta" data-testid="sync-tm-access-decision">
                판정: {lastAccessResult.allowed ? "허용" : "차단"} ({lastAccessResult.code}) —{" "}
                {lastAccessResult.reasonKo}
              </p>
            ) : null}
          </div>
        ) : null}

        {auditLogs.length > 0 ? (
          <ul className="ts-sync-tm__list" data-testid="sync-tm-audit-log-list">
            {auditLogs.slice(0, 4).map((entry) => (
              <li key={entry.auditId} className="ts-sync-tm__list-item">
                <span>{entry.summaryKo}</span>
                <span className="ts-sync-tm__meta">
                  워터마크 {entry.watermarkId} · {entry.timestampIso}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
