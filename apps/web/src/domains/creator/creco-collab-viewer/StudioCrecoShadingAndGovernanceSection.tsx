import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

import {
  CRECO_STAGE_CATALOG,
  getStageMeta,
  type CrecoStageId,
} from "./creco-version-compare-engine";
import {
  SHADING_LIGHT_PRESETS,
  SHADING_TONE_PRESETS,
  STAGE_ACL_LABELS,
  aggregateWorkerLeadTimeMetrics,
  calculateSeatEconomics,
  generateFreeAssistantShadingPreview,
  validateSecurityShareLink,
  type CrecoGovernanceState,
  type ShadingApprovalStatus,
  type ShadingEdgeStyle,
  type ShadingLightDirection,
  type ShadingOutputMode,
  type ShadingResolution,
  type ShadingTonePresetId,
  type StageAclLevel,
  type StageAction,
} from "./creco-shading-acl-audit-engine";
import { StudioCrecoExportHandoffSection } from "./StudioCrecoExportHandoffSection";

export type SecondaryCrecoTab = "ai-shading" | "acl-audit" | "export-handoff";

export interface StudioCrecoShadingAndGovernanceSectionProps {
  readonly activeTab: SecondaryCrecoTab;
  readonly activeCutIndex: number;
  readonly activeStageId: CrecoStageId;
  readonly activeVersionLabel: string;
  readonly activeVersionDigest: string;
  readonly cutCount: number;
  readonly unresolvedPinCount: number;
  readonly projectAbbreviation: string;
  readonly episodeNumber: number;
  readonly governance: CrecoGovernanceState;
  readonly shadingEnabled: boolean;
  readonly onUpdateMemberAcl: (
    memberId: string,
    stageId: CrecoStageId,
    level: StageAclLevel,
  ) => void;
  readonly onEvaluateAclAction: (input: {
    readonly memberId: string;
    readonly stageId: CrecoStageId;
    readonly action: StageAction;
    readonly useShareLink: boolean;
    readonly providedPassword: string;
    readonly ndaAccepted: boolean;
    readonly nowIso: string;
  }) => void;
  readonly onUpdateSharePolicy: (patch: {
    readonly allowDownload?: boolean;
    readonly watermarkEnabled?: boolean;
    readonly active?: boolean;
    readonly expiresAtIso?: string;
  }) => void;
  readonly onAnnounce: (message: string) => void;
}

const ACL_LEVEL_ORDER: readonly StageAclLevel[] = [
  "admin",
  "edit",
  "limited-edit",
  "comment",
  "view",
  "none",
];

const STAGE_ACTION_OPTIONS: readonly { readonly id: StageAction; readonly label: string }[] = [
  { id: "view", label: "열람 (view)" },
  { id: "comment", label: "피드백 (comment)" },
  { id: "upload", label: "버전 업로드 (upload)" },
  { id: "approve", label: "공정 마감 승인 (approve)" },
  { id: "download", label: "원본 다운로드 (download)" },
];

export function StudioCrecoShadingAndGovernanceSection({
  activeTab,
  activeCutIndex,
  activeStageId,
  activeVersionLabel,
  activeVersionDigest,
  cutCount,
  unresolvedPinCount,
  projectAbbreviation,
  episodeNumber,
  governance,
  shadingEnabled,
  onUpdateMemberAcl,
  onEvaluateAclAction,
  onUpdateSharePolicy,
  onAnnounce,
}: StudioCrecoShadingAndGovernanceSectionProps) {
  const [lightDirection, setLightDirection] = useState<ShadingLightDirection>("top-left");
  const [edgeStyle, setEdgeStyle] = useState<ShadingEdgeStyle>("cel-hard");
  const [shadowDensityPct, setShadowDensityPct] = useState<number>(62);
  const [rimLightPct, setRimLightPct] = useState<number>(48);
  const [tonePresetId, setTonePresetId] = useState<ShadingTonePresetId>("indigo-dusk");
  const [resolution, setResolution] = useState<ShadingResolution>("4K");
  const [outputMode, setOutputMode] = useState<ShadingOutputMode>("separate-alpha");
  const [shadingWipePct, setShadingWipePct] = useState<number>(55);
  const [shadingApproval, setShadingApproval] = useState<ShadingApprovalStatus>("preview");

  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    governance.members[2]?.memberId ?? "mem-color-sub",
  );
  const [selectedAclStageId, setSelectedAclStageId] = useState<CrecoStageId>(activeStageId);
  const [selectedAction, setSelectedAction] = useState<StageAction>("download");
  const [useShareLinkCheck, setUseShareLinkCheck] = useState<boolean>(false);
  const [testPassword, setTestPassword] = useState<string>(governance.sharePolicy.password);
  const [testNdaAccepted, setTestNdaAccepted] = useState<boolean>(true);
  const [testNowIso, setTestNowIso] = useState<string>("2026-11-21T18:30:00Z");

  const shadingPreview = useMemo(
    () =>
      generateFreeAssistantShadingPreview({
        cutIndex: activeCutIndex,
        lightDirection,
        edgeStyle,
        shadowDensityPct,
        rimLightPct,
        tonePresetId,
        resolution,
        outputMode,
        wipePercent: shadingWipePct,
        approvalStatus: shadingApproval,
      }),
    [
      activeCutIndex,
      edgeStyle,
      lightDirection,
      outputMode,
      resolution,
      rimLightPct,
      shadingApproval,
      shadingWipePct,
      shadowDensityPct,
      tonePresetId,
    ],
  );

  const seatEconomics = useMemo(
    () => calculateSeatEconomics(governance.members),
    [governance.members],
  );
  const leadTimeMetrics = useMemo(
    () => aggregateWorkerLeadTimeMetrics(governance.auditLogs),
    [governance.auditLogs],
  );
  const shareCheckPreview = useMemo(
    () =>
      validateSecurityShareLink(governance.sharePolicy, {
        nowIso: testNowIso,
        providedPassword: testPassword,
        ndaAccepted: testNdaAccepted,
        wantsDownload: selectedAction === "download",
      }),
    [governance.sharePolicy, selectedAction, testNdaAccepted, testNowIso, testPassword],
  );

  if (activeTab === "export-handoff") {
    return (
      <StudioCrecoExportHandoffSection
        projectAbbreviation={projectAbbreviation}
        episodeNumber={episodeNumber}
        activeVersionLabel={activeVersionLabel}
        activeVersionDigest={activeVersionDigest}
        cutCount={cutCount}
        unresolvedPinCount={unresolvedPinCount}
        onAnnounce={onAnnounce}
      />
    );
  }

  if (activeTab === "ai-shading") {
    const wipeStyle = {
      "--ccv-wipe-pct": `${shadingEnabled ? shadingPreview.wipePercent : 0}%`,
    } as CSSProperties;

    return (
      <section className="ccv-card" aria-label="무료 AI 어시스턴트 음영 비교 스튜디오">
        <div className="ccv-card-head">
          <h3 className="ccv-card-title">
            무료 AI 어시스턴트 음영 스튜디오 · 가운데 핸들 전/후 비교
          </h3>
          <div className="ccv-badge-row">
            <span className="ccv-pill ccv-pill-ok ccv-num" data-testid="ccv-shading-cost-pill">
              ₩0 무과금 · 0토큰 (외부 {shadingPreview.crecoEquivalentTokens}토큰 절감)
            </span>
            <span className="ccv-pill ccv-pill-accent">
              상태: {shadingPreview.approvalStatus === "approved" ? "승인 완료" : "실시간 미리보기"}
            </span>
          </div>
        </div>

        <div className="ccv-shading-grid">
          <div
            className="ccv-shading-preview"
            style={wipeStyle}
            data-testid="ccv-shading-preview-stage"
          >
            <div className="ccv-wipe-layer">
              <div className="ccv-badge-row">
                <span className="ccv-pill">원본 선화·밑색 (컷 {activeCutIndex + 1})</span>
                <span className="ccv-pill ccv-pill-ok">
                  AI 음영 레이어 ({shadingPreview.lightLabel})
                </span>
              </div>
              <p className="ccv-subtitle" data-testid="ccv-shading-summary">
                {shadingPreview.summaryText}
              </p>
            </div>
            {shadingEnabled ? (
              <>
                <div
                  className="ccv-shading-overlay"
                  style={{
                    backgroundImage: shadingPreview.gradientCss,
                    opacity: shadingPreview.shadowOpacity,
                  }}
                />
                <div
                  className="ccv-shading-rim"
                  style={{
                    borderColor: shadingPreview.rimStrokeOklch,
                    opacity: shadingPreview.rimOpacity,
                  }}
                />
              </>
            ) : null}
            <div className="ccv-wipe-divider" />
            <div className="ccv-wipe-knob ccv-num">{shadingPreview.wipePercent}%</div>
          </div>

          <div className="ccv-card">
            <label className="ccv-subtitle" htmlFor="ccv-shading-wipe-slider">
              가운데 와이프 핸들 비교:{" "}
              <strong className="ccv-num">{shadingPreview.wipePercent}%</strong>
            </label>
            <input
              id="ccv-shading-wipe-slider"
              data-testid="ccv-shading-wipe-slider"
              type="range"
              min={0}
              max={100}
              value={shadingPreview.wipePercent}
              onChange={(event) => setShadingWipePct(Number(event.target.value))}
              className="ccv-range"
            />

            <div className="ccv-stage-chips">
              <label htmlFor="ccv-light-select" className="ccv-subtitle">
                광원 방향
              </label>
              <select
                id="ccv-light-select"
                data-testid="ccv-light-select"
                className="ccv-select"
                value={lightDirection}
                onChange={(event) => {
                  setLightDirection(event.target.value as ShadingLightDirection);
                  setShadingApproval("preview");
                }}
              >
                {SHADING_LIGHT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({preset.angleDeg}°)
                  </option>
                ))}
              </select>

              <select
                aria-label="음영 스타일"
                className="ccv-select"
                value={edgeStyle}
                onChange={(event) => setEdgeStyle(event.target.value as ShadingEdgeStyle)}
              >
                <option value="cel-hard">셀 하드 엣지</option>
                <option value="soft-gradient">소프트 그라데이션</option>
              </select>

              <select
                aria-label="음영 톤 프리셋"
                className="ccv-select"
                value={tonePresetId}
                onChange={(event) => setTonePresetId(event.target.value as ShadingTonePresetId)}
              >
                {SHADING_TONE_PRESETS.map((tone) => (
                  <option key={tone.id} value={tone.id}>
                    {tone.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ccv-stage-chips">
              <label className="ccv-subtitle" htmlFor="ccv-shadow-density">
                그림자 농도 <span className="ccv-num">{shadowDensityPct}%</span>
              </label>
              <input
                id="ccv-shadow-density"
                type="range"
                min={0}
                max={100}
                value={shadowDensityPct}
                onChange={(event) => setShadowDensityPct(Number(event.target.value))}
                className="ccv-range"
              />
              <label className="ccv-subtitle" htmlFor="ccv-rim-light">
                림라이트 강도 <span className="ccv-num">{rimLightPct}%</span>
              </label>
              <input
                id="ccv-rim-light"
                type="range"
                min={0}
                max={100}
                value={rimLightPct}
                onChange={(event) => setRimLightPct(Number(event.target.value))}
                className="ccv-range"
              />
            </div>

            <div className="ccv-badge-row">
              <button
                type="button"
                className="ccv-btn"
                aria-pressed={resolution === "2K"}
                onClick={() => setResolution("2K")}
              >
                2K (₩0)
              </button>
              <button
                type="button"
                className="ccv-btn"
                aria-pressed={resolution === "4K"}
                onClick={() => setResolution("4K")}
              >
                4K 고해상도 (₩0)
              </button>
              <button
                type="button"
                className="ccv-btn"
                aria-pressed={outputMode === "separate-alpha"}
                onClick={() =>
                  setOutputMode((prev) =>
                    prev === "separate-alpha" ? "merged" : "separate-alpha",
                  )
                }
              >
                {outputMode === "separate-alpha" ? "분리 투명 레이어" : "합쳐진 결과물"}
              </button>
              <button
                type="button"
                data-testid="ccv-approve-shading-btn"
                className="ccv-btn ccv-btn-primary"
                onClick={() => {
                  setShadingApproval("approved");
                  onAnnounce(
                    `컷 ${activeCutIndex + 1} 무료 AI 음영(${shadingPreview.lightLabel}, ${resolution})을 ₩0으로 승인하고 캔버스 레이어에 대기시켰습니다.`,
                  );
                }}
              >
                음영 레이어 즉시 승인 (₩0)
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ccv-card" aria-label="세부 공정 권한 제어·보안 링크·실시간 활동 로그">
      <div className="ccv-card-head">
        <h3 className="ccv-card-title">
          세부 공정 ACL · 보안 공유 링크 · 해시 체인 활동 로그 & 리드타임 성과
        </h3>
        <span className="ccv-pill ccv-pill-ok" data-testid="ccv-seat-economics-pill">
          {seatEconomics.summaryText}
        </span>
      </div>

      <div className="ccv-table-wrap">
        <table className="ccv-table">
          <thead>
            <tr>
              <th>작업자</th>
              <th>역할</th>
              <th>선화</th>
              <th>채색</th>
              <th>식자</th>
              <th>일본어</th>
            </tr>
          </thead>
          <tbody>
            {governance.members.map((member) => (
              <tr key={member.memberId}>
                <td>
                  <strong>{member.name}</strong>
                  <div className="ccv-subtitle">{member.title}</div>
                </td>
                <td>{member.role}</td>
                {(["lineart", "coloring", "lettering", "loc-ja"] as const).map((stageId) => (
                  <td key={stageId}>
                    <select
                      aria-label={`${member.name} ${getStageMeta(stageId).shortLabel} 권한`}
                      className="ccv-select"
                      value={member.stagePermissions[stageId] ?? "none"}
                      onChange={(event) =>
                        onUpdateMemberAcl(
                          member.memberId,
                          stageId,
                          event.target.value as StageAclLevel,
                        )
                      }
                    >
                      {ACL_LEVEL_ORDER.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {STAGE_ACL_LABELS[lvl]}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ccv-card">
        <div className="ccv-card-head">
          <h4 className="ccv-card-title">권한·보안 공유 링크 실시간 검증 및 활동 로그 기록</h4>
          <div className="ccv-badge-row">
            <button
              type="button"
              className="ccv-btn"
              aria-pressed={!governance.sharePolicy.allowDownload}
              onClick={() =>
                onUpdateSharePolicy({ allowDownload: !governance.sharePolicy.allowDownload })
              }
            >
              다운로드 {governance.sharePolicy.allowDownload ? "허용" : "차단됨"}
            </button>
            <button
              type="button"
              className="ccv-btn"
              aria-pressed={governance.sharePolicy.watermarkEnabled}
              onClick={() =>
                onUpdateSharePolicy({
                  watermarkEnabled: !governance.sharePolicy.watermarkEnabled,
                })
              }
            >
              동적 워터마크 {governance.sharePolicy.watermarkEnabled ? "켜짐" : "꺼짐"}
            </button>
            <button
              type="button"
              className="ccv-btn"
              aria-pressed={governance.sharePolicy.active}
              onClick={() =>
                onUpdateSharePolicy({ active: !governance.sharePolicy.active })
              }
            >
              공유 링크 {governance.sharePolicy.active ? "활성" : "비활성"}
            </button>
          </div>
        </div>

        <div className="ccv-badge-row">
          <select
            aria-label="검증 대상 작업자"
            data-testid="ccv-acl-member-select"
            className="ccv-select"
            value={selectedMemberId}
            onChange={(event) => setSelectedMemberId(event.target.value)}
          >
            {governance.members.map((member) => (
              <option key={member.memberId} value={member.memberId}>
                {member.name}
              </option>
            ))}
          </select>

          <select
            aria-label="검증 대상 공정"
            data-testid="ccv-acl-stage-select"
            className="ccv-select"
            value={selectedAclStageId}
            onChange={(event) => setSelectedAclStageId(event.target.value as CrecoStageId)}
          >
            {CRECO_STAGE_CATALOG.map((stage) => (
              <option key={stage.stageId} value={stage.stageId}>
                {stage.label}
              </option>
            ))}
          </select>

          <select
            aria-label="검증 대상 작업"
            data-testid="ccv-acl-action-select"
            className="ccv-select"
            value={selectedAction}
            onChange={(event) => setSelectedAction(event.target.value as StageAction)}
          >
            {STAGE_ACTION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className="ccv-pill">
            <input
              type="checkbox"
              checked={useShareLinkCheck}
              onChange={(event) => setUseShareLinkCheck(event.target.checked)}
            />
            외부 보안 링크 경유
          </label>

          {useShareLinkCheck ? (
            <>
              <input
                aria-label="공유 링크 비밀번호"
                className="ccv-input"
                value={testPassword}
                onChange={(event) => setTestPassword(event.target.value)}
              />
              <input
                aria-label="접속 시점 ISO"
                className="ccv-input"
                value={testNowIso}
                onChange={(event) => setTestNowIso(event.target.value)}
              />
              <label className="ccv-pill">
                <input
                  type="checkbox"
                  checked={testNdaAccepted}
                  onChange={(event) => setTestNdaAccepted(event.target.checked)}
                />
                NDA 동의
              </label>
            </>
          ) : null}

          <button
            type="button"
            data-testid="ccv-run-acl-check-btn"
            className="ccv-btn ccv-btn-primary"
            onClick={() =>
              onEvaluateAclAction({
                memberId: selectedMemberId,
                stageId: selectedAclStageId,
                action: selectedAction,
                useShareLink: useShareLinkCheck,
                providedPassword: testPassword,
                ndaAccepted: testNdaAccepted,
                nowIso: testNowIso,
              })
            }
          >
            ACL 판정 및 감사 로그 기록
          </button>
        </div>

        {useShareLinkCheck ? (
          <p className="ccv-subtitle" data-testid="ccv-share-link-preview">
            보안 링크 사전 판정: {shareCheckPreview.allowed ? "허용" : "차단"} —{" "}
            {shareCheckPreview.reason}
            {shareCheckPreview.watermarkText
              ? ` · 워터마크: ${shareCheckPreview.watermarkText}`
              : ""}
          </p>
        ) : null}
      </div>

      <div className="ccv-metrics-grid" data-testid="ccv-leadtime-metrics">
        {leadTimeMetrics.map((metric) => (
          <div key={metric.actorName} className="ccv-metric-card">
            <strong>{metric.actorName}</strong>
            <span className="ccv-num">
              평균 리드타임: {metric.avgLeadTimeMinutes}분 ({metric.slaStatus})
            </span>
            <span className="ccv-subtitle ccv-num">
              허용 {metric.allowedCount}건 · 차단 {metric.deniedCount}건 · 업로드{" "}
              {metric.uploadsCount} · 승인 {metric.approvalsCount}
            </span>
          </div>
        ))}
      </div>

      <div className="ccv-table-wrap">
        <table className="ccv-table" data-testid="ccv-audit-log-table">
          <thead>
            <tr>
              <th>#</th>
              <th>작업자</th>
              <th>공정</th>
              <th>작업</th>
              <th>결과</th>
              <th>사유</th>
              <th>해시 체인</th>
            </tr>
          </thead>
          <tbody>
            {[...governance.auditLogs].reverse().map((log) => (
              <tr key={log.seq}>
                <td className="ccv-num">{log.seq}</td>
                <td>{log.actorName}</td>
                <td>{getStageMeta(log.stageId).shortLabel}</td>
                <td>{log.action}</td>
                <td>
                  <span
                    className={`ccv-pill ${
                      log.outcome === "allowed" ? "ccv-pill-ok" : "ccv-pill-danger"
                    }`}
                  >
                    {log.outcome === "allowed" ? "허용" : "차단"}
                  </span>
                </td>
                <td>{log.reason}</td>
                <td className="ccv-num">{log.entryHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
