import "./creco-collab-viewer.css";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CRECO_STAGE_CATALOG,
  addPinRedlineFeedback,
  approveAndCloseStageVersion,
  buildCanvasJumpPayload,
  commitImmutableVersion,
  createInitialCrecoWorkspaceState,
  findStageAndVersion,
  getStageMeta,
  publishPrivateFeedbackDrafts,
  resolveCanonicalShareTarget,
  setCanonicalShareMode,
  setCompareLayoutMode,
  setCompareSlots,
  setCompareSyncMode,
  setCompareWipePercent,
  summarizeVersionDiff,
  syncCompareScroll,
  updateFeedbackStatus,
  type CompareLayoutMode,
  type CompareSyncMode,
  type CrecoCollabWorkspaceState,
  type CrecoStageId,
  type FeedbackImportance,
  type FeedbackStatus,
  type RedlinePoint,
  type RedlineTone,
  type ToonStudioCanvasJumpPayload,
} from "./creco-version-compare-engine";
import {
  CRECO_SHORTCUT_DEFINITIONS,
  calculateSeatEconomics,
  createInitialGovernanceState,
  evaluateStageAclAndLog,
  mapCrecoViewerShortcut,
  updateMemberStageAcl,
  type CrecoGovernanceState,
  type StageAclLevel,
  type StageAction,
} from "./creco-shading-acl-audit-engine";
import { StudioCrecoCompareLanesSection } from "./StudioCrecoCompareLanesSection";
import { StudioCrecoPinFeedbackSection } from "./StudioCrecoPinFeedbackSection";
import {
  StudioCrecoShadingAndGovernanceSection,
  type SecondaryCrecoTab,
} from "./StudioCrecoShadingAndGovernanceSection";

type CrecoMainTab = "compare-pins" | SecondaryCrecoTab;

export interface StudioCrecoCollabViewerPanelProps {
  readonly onCanvasJump?: (payload: ToonStudioCanvasJumpPayload) => void;
}

/**
 * CRECO++ 클린룸 내재화 웹툰 협업 비교 뷰어:
 * - 5계층 불변 버전 트리 & 1클릭 불변 버전 생성 & 단일 공유 링크 자동 포인팅
 * - 탭 전환 없는 최대 4열 다중 공정 동시 동기 스크롤 비교 · 가로 오버뷰 · 0~100% 와이프 핸들
 * - 세로 스크롤 뷰어 핀 + 벡터 드로잉 레드라인 피드백 + 0.1초 캔버스 레이어 직결 점프
 * - ₩0 무료 AI 어시스턴트 음영 비교 · 세부 공정 ACL/보안 링크/해시 체인 활동 로그 · 6대 플랫폼 & 대타 인수인계
 */
export function StudioCrecoCollabViewerPanel({
  onCanvasJump,
}: StudioCrecoCollabViewerPanelProps = {}) {
  const [workspace, setWorkspace] = useState<CrecoCollabWorkspaceState>(
    createInitialCrecoWorkspaceState,
  );
  const [governance, setGovernance] = useState<CrecoGovernanceState>(
    createInitialGovernanceState,
  );
  const [activeTab, setActiveTab] = useState<CrecoMainTab>("compare-pins");
  const [selectedStageId, setSelectedStageId] = useState<CrecoStageId>("lineart");
  const [versionSummaryInput, setVersionSummaryInput] = useState<string>("");
  const [pinModeActive, setPinModeActive] = useState<boolean>(false);
  const [shadingEnabled, setShadingEnabled] = useState<boolean>(true);
  const [pinDraftBody, setPinDraftBody] = useState<string>("");
  const [pinImportance, setPinImportance] = useState<FeedbackImportance>("required");
  const [pinTone, setPinTone] = useState<RedlineTone>("crimson");
  const [pinCoords, setPinCoords] = useState<RedlinePoint>({ xPct: 48, yPct: 44 });
  const [draftRedlinePoints, setDraftRedlinePoints] = useState<readonly RedlinePoint[]>([]);
  const [lastCanvasJump, setLastCanvasJump] = useState<ToonStudioCanvasJumpPayload | null>(null);
  const [statusNotice, setStatusNotice] = useState<string>(
    "4열 동시 공정 비교 뷰어가 준비되었습니다. 단축키 J/K(컷 이동), C(비교), H(가로 오버뷰), F(핀 피드백), S(AI 음영), V(새 버전)를 바로 사용할 수 있습니다.",
  );

  const selectedStageResult = useMemo(
    () => findStageAndVersion(workspace.tree, selectedStageId),
    [selectedStageId, workspace.tree],
  );
  const activeStage = selectedStageResult.stage;
  const activeVersion = selectedStageResult.version;
  const cutCount = activeVersion?.artifacts.length ?? 4;

  const canonicalShare = useMemo(() => resolveCanonicalShareTarget(workspace), [workspace]);
  const seatEconomics = useMemo(
    () => calculateSeatEconomics(governance.members),
    [governance.members],
  );

  const wipeBeforeSlot = workspace.compare.slots[workspace.compare.wipeBeforeSlotIndex];
  const wipeAfterSlot = workspace.compare.slots[workspace.compare.wipeAfterSlotIndex];
  const wipeBeforeVersion = useMemo(
    () =>
      wipeBeforeSlot
        ? findStageAndVersion(workspace.tree, wipeBeforeSlot.stageId, wipeBeforeSlot.versionId)
            .version
        : null,
    [wipeBeforeSlot, workspace.tree],
  );
  const wipeAfterVersion = useMemo(
    () =>
      wipeAfterSlot
        ? findStageAndVersion(workspace.tree, wipeAfterSlot.stageId, wipeAfterSlot.versionId)
            .version
        : null,
    [wipeAfterSlot, workspace.tree],
  );
  const versionDiff = useMemo(
    () => summarizeVersionDiff(wipeBeforeVersion, wipeAfterVersion),
    [wipeAfterVersion, wipeBeforeVersion],
  );

  const unresolvedPinCount = useMemo(
    () => workspace.feedbacks.filter((fb) => fb.status !== "resolved").length,
    [workspace.feedbacks],
  );
  const privateDraftCount = useMemo(
    () => workspace.feedbacks.filter((fb) => fb.visibility === "private").length,
    [workspace.feedbacks],
  );

  const handleCommitImmutableVersion = useCallback(() => {
    const result = commitImmutableVersion(workspace, {
      stageId: selectedStageId,
      authorName: "박하린(선화)",
      summary: versionSummaryInput,
      workMinutes: 35,
      markApproved: false,
      updatedCutIndices: [workspace.compare.activeCutIndex],
    });
    setWorkspace(result.nextState);
    setVersionSummaryInput("");
    setStatusNotice(
      `1클릭 불변 버전 ${result.createdVersion.label}을 생성했습니다. 이전 버전 기록은 100% 보존됩니다.`,
    );
  }, [selectedStageId, versionSummaryInput, workspace]);

  const handleApproveAndCloseStage = useCallback(() => {
    if (!activeVersion) return;
    const result = approveAndCloseStageVersion(workspace, {
      stageId: selectedStageId,
      versionId: activeVersion.versionId,
      approverName: "오태훈(담당 PD)",
      resolveOpenPublicFeedbacks: true,
      contributors: [
        { name: activeVersion.authorName, sharePct: 70 },
        { name: "최지우(채색·외주)", sharePct: 30 },
      ],
    });
    setWorkspace(result.nextState);
    setStatusNotice(
      `${activeVersion.label} 공정을 마감 승인했습니다. 단일 공유 링크가 최신 승인본을 자동 가리키며 공개 피드백 ${result.autoResolvedCount}건을 일괄 해결했습니다.`,
    );
  }, [activeVersion, selectedStageId, workspace]);

  const handleMoveCut = useCallback(
    (delta: number) => {
      const nextCut = Math.max(0, Math.min(cutCount - 1, workspace.compare.activeCutIndex + delta));
      const ratio = cutCount > 1 ? nextCut / (cutCount - 1) : 0;
      const firstSlotId = workspace.compare.slots[0]?.slotId ?? "lane-1";
      setWorkspace((prev) => ({
        ...prev,
        compare: syncCompareScroll(prev.compare, firstSlotId, ratio, nextCut),
      }));
      setStatusNotice(`컷 ${nextCut + 1}/${cutCount}로 모든 비교 레인을 동기 이동했습니다.`);
    },
    [cutCount, workspace.compare.activeCutIndex, workspace.compare.slots],
  );

  const handleLayoutChange = useCallback((mode: CompareLayoutMode) => {
    setWorkspace((prev) => ({
      ...prev,
      compare: setCompareLayoutMode(prev.compare, mode),
    }));
  }, []);

  const handleSyncModeChange = useCallback((syncMode: CompareSyncMode) => {
    setWorkspace((prev) => ({
      ...prev,
      compare: setCompareSyncMode(prev.compare, syncMode),
    }));
  }, []);

  const handleToggleCompareStage = useCallback(
    (stageId: CrecoStageId) => {
      const existing = workspace.compare.slots.some((slot) => slot.stageId === stageId);
      if (existing) {
        const remaining = workspace.compare.slots.filter((slot) => slot.stageId !== stageId);
        if (remaining.length === 0) return;
        setWorkspace((prev) => setCompareSlots(prev, remaining));
      } else {
        const nextList = [...workspace.compare.slots, { stageId }].slice(-4);
        setWorkspace((prev) => setCompareSlots(prev, nextList));
      }
    },
    [workspace.compare.slots],
  );

  const handlePlacePinFeedback = useCallback(() => {
    if (!activeVersion) return;
    const strokePoints =
      draftRedlinePoints.length >= 2
        ? draftRedlinePoints
        : [
            { xPct: Math.max(4, pinCoords.xPct - 6), yPct: Math.max(4, pinCoords.yPct - 5) },
            pinCoords,
            { xPct: Math.min(96, pinCoords.xPct + 7), yPct: Math.min(96, pinCoords.yPct + 5) },
          ];

    const result = addPinRedlineFeedback(workspace, {
      stageId: selectedStageId,
      versionId: activeVersion.versionId,
      cutIndex: workspace.compare.activeCutIndex,
      xPct: pinCoords.xPct,
      yPct: pinCoords.yPct,
      authorName: "오태훈(담당 PD)",
      assigneeName: activeVersion.authorName,
      body:
        pinDraftBody.trim() ||
        `컷 ${workspace.compare.activeCutIndex + 1} (${pinCoords.xPct}%, ${pinCoords.yPct}%) 레드라인 수정 요청`,
      importance: pinImportance,
      visibility: "public",
      strokes: [
        {
          id: `stroke-${workspace.feedbacks.length + 201}`,
          widthPx: 3,
          tone: pinTone,
          points: strokePoints,
        },
      ],
    });
    setWorkspace(result.nextState);
    setPinDraftBody("");
    setDraftRedlinePoints([]);
    setStatusNotice(
      `${result.createdFeedback.id} 핀·레드라인 피드백을 등록했습니다 (${result.createdFeedback.layerName}).`,
    );
  }, [
    activeVersion,
    draftRedlinePoints,
    pinCoords,
    pinDraftBody,
    pinImportance,
    pinTone,
    selectedStageId,
    workspace,
  ]);

  const handleCanvasJump = useCallback(
    (feedbackId: string) => {
      const payload = buildCanvasJumpPayload(workspace, feedbackId);
      if (!payload) return;
      setLastCanvasJump(payload);
      onCanvasJump?.(payload);
      setStatusNotice(
        `0.1초 캔버스 직결 점프 준비 (${payload.schema}): ${payload.layerName} · 컷 ${payload.cutIndex + 1} (${payload.xPct}%, ${payload.yPct}%) — 외부 업로드 불필요`,
      );
    },
    [onCanvasJump, workspace],
  );

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const action = mapCrecoViewerShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTagName: target?.tagName,
        isContentEditable: target?.isContentEditable,
      });
      if (!action) return;
      event.preventDefault();

      if (action === "next-cut") {
        handleMoveCut(1);
      } else if (action === "prev-cut") {
        handleMoveCut(-1);
      } else if (action === "toggle-compare") {
        setActiveTab("compare-pins");
        const nextMode: CompareLayoutMode =
          workspace.compare.layoutMode === "wipe-compare" ? "vertical-sync" : "wipe-compare";
        handleLayoutChange(nextMode);
        setStatusNotice(
          nextMode === "wipe-compare"
            ? "단축키 C: 가운데 0~100% 와이프 핸들 비교 모드로 전환했습니다."
            : "단축키 C: 4열 세로 동시 비교 모드로 복귀했습니다.",
        );
      } else if (action === "toggle-horizontal-overview") {
        setActiveTab("compare-pins");
        const nextMode: CompareLayoutMode =
          workspace.compare.layoutMode === "horizontal-overview"
            ? "vertical-sync"
            : "horizontal-overview";
        handleLayoutChange(nextMode);
        setStatusNotice(
          nextMode === "horizontal-overview"
            ? "단축키 H: 가로 한눈에 오버뷰 모드로 전환했습니다."
            : "단축키 H: 세로 스크롤 동시 비교 모드로 복귀했습니다.",
        );
      } else if (action === "toggle-pin-feedback") {
        setActiveTab("compare-pins");
        setPinModeActive((prev) => {
          const next = !prev;
          setStatusNotice(
            next
              ? "단축키 F: 뷰어 핀·레드라인 작성 모드를 켰습니다."
              : "단축키 F: 뷰어 핀·레드라인 작성 모드를 껐습니다.",
          );
          return next;
        });
      } else if (action === "toggle-ai-shading") {
        setActiveTab("ai-shading");
        setShadingEnabled((prev) => !prev);
        setStatusNotice("단축키 S: 무료 AI 어시스턴트 음영 비교 스튜디오를 토글했습니다.");
      } else if (action === "create-version") {
        handleCommitImmutableVersion();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [
    handleCommitImmutableVersion,
    handleLayoutChange,
    handleMoveCut,
    workspace.compare.layoutMode,
  ]);

  const handleUpdateMemberAcl = (
    memberId: string,
    stageId: CrecoStageId,
    level: StageAclLevel,
  ) => {
    setGovernance((prev) => updateMemberStageAcl(prev, memberId, stageId, level));
    setStatusNotice(`${getStageMeta(stageId).label} 공정 권한을 갱신했습니다 (₩0 무제한 시트 유지).`);
  };

  const handleEvaluateAclAction = (input: {
    readonly memberId: string;
    readonly stageId: CrecoStageId;
    readonly action: StageAction;
    readonly useShareLink: boolean;
    readonly providedPassword: string;
    readonly ndaAccepted: boolean;
    readonly nowIso: string;
  }) => {
    const res = evaluateStageAclAndLog(governance, {
      memberId: input.memberId,
      stageId: input.stageId,
      action: input.action,
      leadTimeMinutes: 19,
      timestampIso: input.nowIso,
      shareAccess: input.useShareLink
        ? {
            nowIso: input.nowIso,
            providedPassword: input.providedPassword,
            ndaAccepted: input.ndaAccepted,
            wantsDownload: input.action === "download",
          }
        : undefined,
    });
    setGovernance(res.nextState);
    setStatusNotice(
      `ACL 감사 로그 #${res.logEntry.seq} 기록 (${res.allowed ? "허용" : "차단"}): ${res.reason}`,
    );
  };

  const handleUpdateSharePolicy = (patch: {
    readonly allowDownload?: boolean;
    readonly watermarkEnabled?: boolean;
    readonly active?: boolean;
    readonly expiresAtIso?: string;
  }) => {
    setGovernance((prev) => ({
      ...prev,
      sharePolicy: {
        ...prev.sharePolicy,
        ...patch,
      },
    }));
  };

  return (
    <div
      className="ccv-shell"
      data-testid="studio-creco-collab-viewer-panel"
      role="region"
      aria-label="CRECO++ 웹툰 공정 비교·핀 피드백·무료 AI 음영·ACL 협업 뷰어"
    >
      <div className="ccv-stack">
        <header className="ccv-header">
          <div className="ccv-header-row">
            <div>
              <p className="ccv-kicker">
                {workspace.tree.projectTitle} ({workspace.tree.abbreviation}) →{" "}
                {workspace.tree.episode.title}
              </p>
              <h2 className="ccv-title">
                CRECO++ 웹툰 공정 협업 뷰어 · 4열 동시 비교 · 무료 AI 음영 · 0.1초 캔버스 직결
              </h2>
              <p className="ccv-subtitle">{workspace.tree.episode.treatment}</p>
            </div>
            <div className="ccv-badge-row">
              <span className="ccv-pill ccv-pill-ok ccv-num" data-testid="ccv-unlimited-seat-badge">
                ₩0 무제한 시트 (타사 {seatEconomics.crecoRequiredPaidSeats}석 유료)
              </span>
              <span className="ccv-pill ccv-pill-accent ccv-num" data-testid="ccv-canonical-link-badge">
                단일 링크 자동 포인팅: {canonicalShare.resolvedVersion?.label ?? "승인 대기"} (파일명
                혼선 0%)
              </span>
            </div>
          </div>

          <div className="ccv-tablist" role="tablist" aria-label="CRECO++ 협업 기능 탭">
            {(
              [
                { id: "compare-pins", label: "4열 공정 비교 · 버전 · 핀/레드라인" },
                { id: "ai-shading", label: "무료 AI 음영 비교 (₩0)" },
                { id: "acl-audit", label: "공정 ACL · 보안 링크 · 활동 로그" },
                { id: "export-handoff", label: "6대 플랫폼 규격 · 대타 인수인계" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`ccv-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className="ccv-btn ccv-tab"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="ccv-shortcut-strip" aria-label="뷰어 단축키 안내">
            {CRECO_SHORTCUT_DEFINITIONS.map((shortcut) => (
              <span key={shortcut.key} className="ccv-pill">
                <kbd className="ccv-kbd">{shortcut.key}</kbd> {shortcut.label}
              </span>
            ))}
          </div>
        </header>

        <p className="ccv-status-banner" role="status" data-testid="ccv-status-notice">
          {statusNotice}
        </p>

        {activeTab === "compare-pins" ? (
          <>
            <section className="ccv-card" aria-label="5계층 불변 버전 트리 및 1클릭 버전 생성">
              <div className="ccv-card-head">
                <h3 className="ccv-card-title">
                  5계층 불변 버전 트리 ({activeStage?.label ?? "선화"} · 총{" "}
                  <span className="ccv-num" data-testid="ccv-active-version-count">
                    {activeStage?.versions.length ?? 0}
                  </span>
                  개 불변 버전 보존)
                </h3>
                <div className="ccv-badge-row">
                  <button
                    type="button"
                    className="ccv-btn"
                    aria-pressed={workspace.tree.canonicalShareLink.mode === "latest-approved"}
                    onClick={() =>
                      setWorkspace((prev) =>
                        setCanonicalShareMode(prev, "latest-approved", selectedStageId),
                      )
                    }
                  >
                    단일 링크: 최신 승인본 자동 추적
                  </button>
                  <button
                    type="button"
                    className="ccv-btn"
                    aria-pressed={workspace.tree.canonicalShareLink.mode === "pinned"}
                    onClick={() =>
                      setWorkspace((prev) =>
                        setCanonicalShareMode(
                          prev,
                          "pinned",
                          selectedStageId,
                          activeVersion?.versionId ?? null,
                        ),
                      )
                    }
                  >
                    지정 버전 고정
                  </button>
                </div>
              </div>

              <div className="ccv-stage-chips">
                {CRECO_STAGE_CATALOG.map((stage) => (
                  <button
                    key={stage.stageId}
                    type="button"
                    data-testid={`ccv-stage-btn-${stage.stageId}`}
                    className="ccv-btn"
                    aria-pressed={selectedStageId === stage.stageId}
                    onClick={() => setSelectedStageId(stage.stageId)}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>

              <div className="ccv-version-grid">
                <div className="ccv-card">
                  <div className="ccv-badge-row">
                    <input
                      aria-label="새 불변 버전 변경 메모"
                      data-testid="ccv-version-summary-input"
                      className="ccv-input"
                      placeholder="예: 주인공 외투 깃 6% 확장 및 컷1 보정"
                      value={versionSummaryInput}
                      onChange={(event) => setVersionSummaryInput(event.target.value)}
                    />
                    <button
                      type="button"
                      data-testid="ccv-commit-version-btn"
                      className="ccv-btn ccv-btn-primary"
                      onClick={handleCommitImmutableVersion}
                    >
                      1클릭 불변 새 버전 생성 (V)
                    </button>
                    <button
                      type="button"
                      data-testid="ccv-approve-stage-btn"
                      className="ccv-btn"
                      onClick={handleApproveAndCloseStage}
                    >
                      공정 마감 승인
                    </button>
                  </div>
                  <p className="ccv-subtitle">
                    공유 링크: <code>{canonicalShare.url}</code> → 현재 가리키는 버전:{" "}
                    <strong data-testid="ccv-canonical-resolved-label">
                      {canonicalShare.resolvedVersion?.label ?? "없음"}
                    </strong>
                  </p>
                </div>

                <ul className="ccv-version-list" data-testid="ccv-version-history-list">
                  {activeStage
                    ? [...activeStage.versions].reverse().map((ver) => (
                        <li key={ver.versionId} className="ccv-version-item">
                          <div>
                            <strong>{ver.label}</strong> · {ver.authorName} ({ver.workMinutes}분)
                            <div className="ccv-subtitle">{ver.summary}</div>
                          </div>
                          <span
                            className={`ccv-pill ${
                              ver.approved ? "ccv-pill-ok" : "ccv-pill-warn"
                            }`}
                          >
                            {ver.approved ? "승인·마감" : "검수 대기"}
                          </span>
                        </li>
                      ))
                    : null}
                </ul>
              </div>
            </section>

            <StudioCrecoCompareLanesSection
              workspace={workspace}
              cutCount={cutCount}
              wipeBeforeVersion={wipeBeforeVersion}
              wipeAfterVersion={wipeAfterVersion}
              versionDiff={versionDiff}
              onLayoutChange={handleLayoutChange}
              onSyncModeChange={handleSyncModeChange}
              onMoveCut={handleMoveCut}
              onToggleCompareStage={handleToggleCompareStage}
              onSyncScrollSlider={(ratio, nextCut) => {
                const firstSlotId = workspace.compare.slots[0]?.slotId ?? "lane-1";
                setWorkspace((prev) => ({
                  ...prev,
                  compare: syncCompareScroll(prev.compare, firstSlotId, ratio, nextCut),
                }));
              }}
              onWipePercentChange={(percent) =>
                setWorkspace((prev) => ({
                  ...prev,
                  compare: setCompareWipePercent(prev.compare, percent),
                }))
              }
            />

            <StudioCrecoPinFeedbackSection
              feedbacks={workspace.feedbacks}
              activeCutIndex={workspace.compare.activeCutIndex}
              pinModeActive={pinModeActive}
              privateDraftCount={privateDraftCount}
              pinImportance={pinImportance}
              pinTone={pinTone}
              pinDraftBody={pinDraftBody}
              pinCoords={pinCoords}
              draftRedlinePoints={draftRedlinePoints}
              lastCanvasJump={lastCanvasJump}
              onTogglePinMode={() => setPinModeActive((prev) => !prev)}
              onPublishDrafts={() => {
                const res = publishPrivateFeedbackDrafts(workspace, "");
                setWorkspace(res.nextState);
                setStatusNotice(
                  `비공개 피드백 초안 ${res.publishedCount}건을 팀 전체에 일괄 발행했습니다.`,
                );
              }}
              onChangeImportance={setPinImportance}
              onChangeTone={setPinTone}
              onChangeDraftBody={setPinDraftBody}
              onChangePinCoords={setPinCoords}
              onUpdateDraftStroke={setDraftRedlinePoints}
              onPlacePinFeedback={handlePlacePinFeedback}
              onCanvasJump={handleCanvasJump}
              onToggleResolve={(feedbackId, nextStatus: FeedbackStatus) =>
                setWorkspace((prev) =>
                  updateFeedbackStatus(prev, feedbackId, nextStatus, "박하린(선화)"),
                )
              }
            />
          </>
        ) : (
          <StudioCrecoShadingAndGovernanceSection
            activeTab={activeTab}
            activeCutIndex={workspace.compare.activeCutIndex}
            activeStageId={selectedStageId}
            activeVersionLabel={activeVersion?.label ?? "선화 1차"}
            activeVersionDigest={activeVersion?.digest ?? "vhash_00000000"}
            cutCount={cutCount}
            unresolvedPinCount={unresolvedPinCount}
            projectAbbreviation={workspace.tree.abbreviation}
            episodeNumber={workspace.tree.episode.episodeNumber}
            governance={governance}
            shadingEnabled={shadingEnabled}
            onUpdateMemberAcl={handleUpdateMemberAcl}
            onEvaluateAclAction={handleEvaluateAclAction}
            onUpdateSharePolicy={handleUpdateSharePolicy}
            onAnnounce={setStatusNotice}
          />
        )}
      </div>
    </div>
  );
}
