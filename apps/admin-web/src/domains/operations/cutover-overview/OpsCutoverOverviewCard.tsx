import { useMemo, useState } from "react";

import {
  OPS_CUTOVER_BASELINE_SUMMARY,
  exportOpsCutoverSummaryJson,
  parseOpsCutoverDashboardJson,
  summarizeOpsCutoverReadiness,
  type OpsCutoverSummary,
} from "./ops-cutover-model";

interface OpsCutoverOverviewCardProps {
  readonly compact?: boolean;
  readonly actorLabel?: string;
  readonly initialSummary?: OpsCutoverSummary;
}

interface SecurityAuditBanner {
  readonly strippedKeyCount: number;
  readonly redactedFieldCount: number;
  readonly blockedCategories: readonly string[];
}

export function OpsCutoverOverviewCard({
  compact = false,
  actorLabel,
  initialSummary = OPS_CUTOVER_BASELINE_SUMMARY,
}: OpsCutoverOverviewCardProps) {
  const [summary, setSummary] = useState<OpsCutoverSummary>(initialSummary);
  const [rawInput, setRawInput] = useState("");
  const [importError, setImportError] = useState("");
  const [notice, setNotice] = useState("");
  const [auditBanner, setAuditBanner] = useState<SecurityAuditBanner | null>(null);
  const [exportedPreview, setExportedPreview] = useState<string | null>(null);

  const readiness = useMemo(() => summarizeOpsCutoverReadiness(summary), [summary]);

  function applyImportedJson() {
    setImportError("");
    setNotice("");
    const result = parseOpsCutoverDashboardJson(rawInput);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setSummary(result.summary);
    // 원본 붙여넣기 입력에 민감 정보가 남지 않도록 반영 즉시 입력창을 비운다.
    setRawInput("");
    setAuditBanner({
      strippedKeyCount: result.strippedKeyCount,
      redactedFieldCount: result.redactedFieldCount,
      blockedCategories: result.blockedCategories,
    });
    setExportedPreview(null);
    setNotice("화이트리스트 검증을 통과한 ops-dashboard 스냅샷을 반영했습니다.");
  }

  function resetToBaseline() {
    setSummary(OPS_CUTOVER_BASELINE_SUMMARY);
    setRawInput("");
    setImportError("");
    setAuditBanner(null);
    setExportedPreview(null);
    setNotice("2026-11-23 정본 기준 스냅샷으로 되돌렸습니다.");
  }

  function previewWhitelistedExport() {
    try {
      const json = exportOpsCutoverSummaryJson(summary);
      setExportedPreview(json);
      setNotice("화이트리스트 직렬화 검증 완료 — .env 키·내부 호스트·자격증명 0건.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "안전 JSON 직렬화에 실패했습니다.");
    }
  }

  const sourceBadgeText = summary.sourceKind === "imported-ops-dashboard"
    ? `ops-dashboard 실측(${summary.mode})`
    : "정본 기준 스냅샷(2026-11-23)";

  return (
    <section
      className={compact ? "policy-card ops-cutover-card" : "operation-policy ops-cutover-card"}
      aria-labelledby="ops-cutover-overview-title"
    >
      <header className="ops-cutover-header">
        <div>
          <p className="admin-eyebrow">ToonStudio / 독립 관리자 컷오버 · 읽기 전용</p>
          <h2 id="ops-cutover-overview-title">운영·배포 원장 · DB 133/133 통합 조회</h2>
          <p>
            Cloudflare·서울 onpod 배포 원장, DB 마이그레이션 정합성, CodeQL 경보, 모바일 3D 감사 수치를
            화이트리스트 경계 안에서 한 번에 확인합니다.
            {actorLabel ? ` (확인 계정: ${actorLabel})` : ""}
          </p>
        </div>
        <span
          className="policy-review-pill"
          data-state={readiness.hasActionableAlert ? "blocked" : "approved"}
        >
          {sourceBadgeText}
        </span>
      </header>

      {importError && (
        <div role="alert" className="policy-alert">
          {importError}
        </div>
      )}
      {notice && (
        <p role="status" className="policy-notice">
          {notice}
        </p>
      )}
      {auditBanner && (
        <p role="status" className="ops-cutover-audit-strip">
          화이트리스트 차단 요약: 미등록·금지 키 {auditBanner.strippedKeyCount}건 제거 · 민감 문자열{" "}
          {auditBanner.redactedFieldCount}건 마스킹 · .env/내부 호스트 유출 0건
        </p>
      )}

      <div className="ops-cutover-metrics" aria-label="핵심 운영·배포 지표">
        <article className="ops-cutover-tile" data-ok={readiness.migrationAligned ? "true" : "false"}>
          <span className="ops-cutover-tile__label">DB 마이그레이션 원장</span>
          <strong className="ops-cutover-tile__value">{readiness.migrationBadge}</strong>
          <small>
            최신: <code>{summary.migrations.latestName ?? "미확인"}</code> · 드리프트{" "}
            {summary.migrations.missingFilesCount + summary.migrations.unregisteredFilesCount}건
          </small>
        </article>

        <article className="ops-cutover-tile" data-ok={summary.deploymentLedger.standingApprovalOk ? "true" : "false"}>
          <span className="ops-cutover-tile__label">배포 원장 · 승인 경계</span>
          <strong className="ops-cutover-tile__value">{readiness.deploymentApprovalLabel}</strong>
          <small>
            웹 {summary.deploymentLedger.webProvider} · API {summary.deploymentLedger.apiProvider}
          </small>
        </article>

        <article
          className="ops-cutover-tile"
          data-ok={(summary.codeScanning.openAlertsCount ?? 0) === 0 ? "true" : "false"}
        >
          <span className="ops-cutover-tile__label">Code Scanning (CodeQL)</span>
          <strong className="ops-cutover-tile__value">{readiness.codeScanningLabel}</strong>
          <small>라이브 헬스: {readiness.liveHealthLabel}</small>
        </article>

        <article
          className="ops-cutover-tile"
          data-ok={(summary.mobile3dAudit.actionableFailedRequests ?? 0) === 0 ? "true" : "false"}
        >
          <span className="ops-cutover-tile__label">모바일 3D 감사</span>
          <strong className="ops-cutover-tile__value">{readiness.mobile3dLabel}</strong>
          <small>
            ERR_ABORTED {summary.mobile3dAudit.abortedRequests ?? "—"} · HTTP 오류{" "}
            {summary.mobile3dAudit.httpErrorCount ?? "—"}
          </small>
        </article>
      </div>

      {summary.degradedReasons.length > 0 && (
        <div role="alert" className="policy-alert">
          <strong>확인 필요 사유</strong>
          <ul>
            {summary.degradedReasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="ops-cutover-ledger-grid" aria-label="현역 인프라 및 금지 명령 경계">
        <div>
          <dt>현역 웹 / API</dt>
          <dd>
            <code>{summary.deploymentLedger.webUrl}</code> ({summary.deploymentLedger.webResource}) ·{" "}
            <code>{summary.deploymentLedger.apiUrl}</code> ({summary.deploymentLedger.apiResource})
          </dd>
        </div>
        <div>
          <dt>현역 데이터베이스</dt>
          <dd>
            {summary.deploymentLedger.databaseResource} ({summary.deploymentLedger.databaseEngine} · 내부 호스트 비노출)
          </dd>
        </div>
        <div>
          <dt>퇴역 공급자 (재도입 금지)</dt>
          <dd>{summary.deploymentLedger.retiredProviders.join(" · ") || "없음"}</dd>
        </div>
        <div>
          <dt>절대 금지 명령</dt>
          <dd>{summary.deploymentLedger.forbiddenCommands.join(" | ") || "없음"}</dd>
        </div>
      </dl>

      <details className="ops-cutover-import" open={!compact}>
        <summary>ops-dashboard --json 스냅샷 검증·반영 및 화이트리스트 JSON 내보내기</summary>
        <div className="ops-cutover-import__body">
          <p>
            <code>node scripts/ops-dashboard.mjs --json</code> 결과를 붙여넣으면 화이트리스트 스키마로
            필터링해 카드에 반영합니다. 배포 실행이나 외부 자동 조회는 수행하지 않습니다.
          </p>
          <label>
            ops-dashboard JSON 입력
            <textarea
              rows={compact ? 4 : 6}
              value={rawInput}
              placeholder='{"schemaVersion":"1.0.0","migrations":{"ok":true,"totalCount":133,"diskCount":133,...}}'
              onChange={(event) => setRawInput(event.target.value)}
            />
          </label>
          <div className="policy-action-row">
            <button type="button" onClick={applyImportedJson}>
              화이트리스트 검증 후 반영
            </button>
            <button type="button" className="policy-btn--subtle" onClick={previewWhitelistedExport}>
              화이트리스트 JSON 생성
            </button>
            {summary.sourceKind === "imported-ops-dashboard" && (
              <button type="button" className="policy-btn--subtle" onClick={resetToBaseline}>
                기준 스냅샷으로 되돌리기
              </button>
            )}
          </div>
          {exportedPreview && (
            <pre className="ops-cutover-preview" aria-label="화이트리스트 검증 완료 JSON">
              {exportedPreview}
            </pre>
          )}
        </div>
      </details>
    </section>
  );
}
