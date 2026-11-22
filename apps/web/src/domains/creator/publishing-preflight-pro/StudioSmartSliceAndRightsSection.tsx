import { CheckCircle2, Scissors, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  applyCc0AssetSubstitutions,
  createDefaultPreflightRightsBom,
  FIVE_PLATFORM_PREFLIGHT_PRESETS,
  planSmartCutSafeSlices,
  runUnifiedFivePlatformPreflight,
  SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
  type EpisodeCutInput,
  type PreflightRightsBomAsset,
  type RightsBomSubstitutionRecord,
  type UnifiedPreflightPresetId,
} from "./platform-preflight-reflow-engine";

export interface StudioSmartSliceAndRightsSectionProps {
  readonly cuts: readonly EpisodeCutInput[];
  readonly initialRightsBomAssets?: readonly PreflightRightsBomAsset[];
}

function presetBadgeClass(status: "READY" | "NEEDS_FIX" | "BLOCKED"): string {
  if (status === "READY") return "ppf-badge ppf-badge-good";
  if (status === "NEEDS_FIX") return "ppf-badge ppf-badge-warn";
  return "ppf-badge ppf-badge-bad";
}

/**
 * 5대 통합 출판 프리플라이트 프리셋 · Rights BOM 비상업/미확인 차단 및 CC0 1클릭 대체 ·
 * 1,280px 스마트 컷-세이프 슬라이서 관제 섹션.
 */
export function StudioSmartSliceAndRightsSection({
  cuts,
  initialRightsBomAssets,
}: StudioSmartSliceAndRightsSectionProps) {
  const [presetId, setPresetId] = useState<UnifiedPreflightPresetId>("naver");
  const [cc0Replaced, setCc0Replaced] = useState(false);

  const baseRightsAssets = useMemo(
    () => initialRightsBomAssets ?? createDefaultPreflightRightsBom(),
    [initialRightsBomAssets],
  );

  const substitutionOutcome = useMemo(
    () => applyCc0AssetSubstitutions(baseRightsAssets),
    [baseRightsAssets],
  );

  const activeRightsAssets = cc0Replaced ? substitutionOutcome.updatedAssets : baseRightsAssets;
  const appliedSubstitutions: readonly RightsBomSubstitutionRecord[] = cc0Replaced
    ? substitutionOutcome.substitutions
    : [];

  const unifiedResult = useMemo(
    () =>
      runUnifiedFivePlatformPreflight({
        presetId,
        cuts,
        rightsBomAssets: activeRightsAssets,
      }),
    [activeRightsAssets, cuts, presetId],
  );

  const smartSliceSummary = useMemo(
    () =>
      unifiedResult.smartSlicePlan ??
      planSmartCutSafeSlices(cuts, {
        targetSliceHeightPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
        maxSliceHeightPx: SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
      }),
    [cuts, unifiedResult.smartSlicePlan],
  );

  return (
    <div className="ppf-section" data-testid="ppf-smart-slice-rights-section">
      {/* 5대 통합 출판 프리셋 */}
      <article className="ppf-card" data-testid="ppf-five-presets">
        <div className="ppf-header">
          <div>
            <h4 className="ppf-title">5대 플랫폼 통합 출판 프리플라이트</h4>
            <p className="ppf-subtitle" data-testid="ppf-five-preset-summary">
              {unifiedResult.preset.summaryKo}
            </p>
          </div>
          <span
            className={presetBadgeClass(unifiedResult.status)}
            data-testid="ppf-five-preset-status"
          >
            {unifiedResult.status === "READY"
              ? "출고 가능"
              : unifiedResult.status === "NEEDS_FIX"
                ? "규격 변환 필요"
                : "Rights BOM 차단"}
          </span>
        </div>

        <div className="ppf-chip-row" role="group" aria-label="5대 통합 출판 프리셋 선택">
          {FIVE_PLATFORM_PREFLIGHT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="ppf-chip"
              aria-pressed={presetId === preset.id}
              data-testid={`ppf-five-preset-${preset.id}`}
              onClick={() => setPresetId(preset.id)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>

        <ul className="ppf-list" aria-label="선택한 출판 프리셋 점검 결과">
          {unifiedResult.blockingReasonsKo.map((reason, idx) => (
            <li key={`block-${idx}`} className="ppf-list-item">
              <span>{reason}</span>
              <span className="ppf-badge ppf-badge-bad">출고 차단</span>
            </li>
          ))}
          {unifiedResult.checkMessagesKo.map((msg, idx) => (
            <li key={`chk-${idx}`} className="ppf-list-item">
              <span>{msg}</span>
              <span className="ppf-badge ppf-badge-info">{unifiedResult.preset.requiredColorSpace}</span>
            </li>
          ))}
        </ul>
      </article>

      {/* Rights BOM 비상업/미확인 차단 & CC0 대체 매핑 */}
      <article className="ppf-card" data-testid="ppf-rights-bom-section">
        <div className="ppf-header">
          <div>
            <h4 className="ppf-title">Rights BOM 라이선스 차단 &amp; 대체 CC0 추천</h4>
            <p className="ppf-subtitle" data-testid="ppf-rights-bom-summary">
              {unifiedResult.rightsBomAudit.summaryKo}
            </p>
          </div>
          <span
            className={
              unifiedResult.rightsBomAudit.exportBlocked
                ? "ppf-badge ppf-badge-bad"
                : "ppf-badge ppf-badge-good"
            }
            data-testid="ppf-rights-bom-status"
          >
            {unifiedResult.rightsBomAudit.exportBlocked ? (
              <>
                <ShieldAlert size={13} aria-hidden="true" />
                차단 {unifiedResult.rightsBomAudit.blockedCount}건
              </>
            ) : (
              <>
                <CheckCircle2 size={13} aria-hidden="true" />
                전체 통과
              </>
            )}
          </span>
        </div>

        <div className="ppf-chip-row">
          <button
            type="button"
            className={cc0Replaced ? "ppf-btn" : "ppf-btn ppf-btn-primary"}
            data-testid="ppf-rights-apply-cc0"
            onClick={() => setCc0Replaced((prev) => !prev)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {cc0Replaced
              ? "원본 Rights BOM 상태로 되돌리기"
              : `차단 에셋 ${substitutionOutcome.substitutions.length}건 검증 CC0로 일괄 대체`}
          </button>
        </div>

        <ul className="ppf-list" aria-label="Rights BOM 에셋 감사 목록">
          {unifiedResult.rightsBomAudit.items.map((item) => (
            <li key={item.asset.assetId} className="ppf-list-item">
              <span>
                <strong>{item.asset.name}</strong> ({item.asset.licenseCode})
                {item.recommendedCc0
                  ? ` → 추천 CC0: ${item.recommendedCc0.nameKo} (${item.matchReasonKo})`
                  : " · 상업 출판 승인됨"}
              </span>
              <span
                className={
                  item.status === "BLOCKED" ? "ppf-badge ppf-badge-bad" : "ppf-badge ppf-badge-good"
                }
              >
                {item.status === "BLOCKED" ? "출고 차단" : "통과"}
              </span>
            </li>
          ))}
        </ul>

        {appliedSubstitutions.length > 0 ? (
          <p className="ppf-kpi-meta" data-testid="ppf-rights-substitution-log">
            CC0 치환 완료: {appliedSubstitutions.map((s) => `${s.originalName} → ${s.replacedByNameKo}`).join(" / ")}
          </p>
        ) : null}
      </article>

      {/* 스마트 컷-세이프 슬라이서 (1,280px 거터 에너지 최소선) */}
      <article className="ppf-card" data-testid="ppf-smart-slicer-section">
        <div className="ppf-header">
          <div>
            <h4 className="ppf-title">스마트 컷-세이프 슬라이서 (1,280px 거터 에너지 최소선)</h4>
            <p className="ppf-subtitle">
              말풍선 영역과 인물 눈높이 보호 밴드를 피해 여백(거터) 에너지 최소선으로 세로 웹툰을 자동 분할합니다.
            </p>
          </div>
          <span className="ppf-badge ppf-badge-info" data-testid="ppf-smart-slicer-count">
            <Scissors size={13} aria-hidden="true" />
            {smartSliceSummary.totalSlices}장 분할
          </span>
        </div>

        <div className="ppf-kpi-grid">
          <div className="ppf-kpi-card">
            <span className="ppf-kpi-label">말풍선 절단 회피</span>
            <span className="ppf-kpi-value" data-testid="ppf-smart-balloon-avoid">
              {smartSliceSummary.balloonAvoidanceCount}건
            </span>
            <span className="ppf-kpi-meta">16px 안전 여백 확보</span>
          </div>
          <div className="ppf-kpi-card">
            <span className="ppf-kpi-label">인물 눈높이 보호</span>
            <span className="ppf-kpi-value" data-testid="ppf-smart-eye-avoid">
              {smartSliceSummary.eyeLevelAvoidanceCount}건
            </span>
            <span className="ppf-kpi-meta">20px 눈높이 보호 밴드</span>
          </div>
          <div className="ppf-kpi-card">
            <span className="ppf-kpi-label">거터 최소선 스냅</span>
            <span className="ppf-kpi-value" data-testid="ppf-smart-gutter-snap">
              {smartSliceSummary.gutterSnappedCount}건
            </span>
            <span className="ppf-kpi-meta">평균 경계 에너지 {smartSliceSummary.averageSeamEnergy}</span>
          </div>
          <div className="ppf-kpi-card">
            <span className="ppf-kpi-label">결정론 지문</span>
            <span className="ppf-kpi-value">{smartSliceSummary.fingerprint.slice(0, 12)}</span>
            <span className="ppf-kpi-meta">최대 높이 ≤ {smartSliceSummary.maxSliceHeightPx}px</span>
          </div>
        </div>
      </article>
    </div>
  );
}
