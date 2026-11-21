import "./studio-division-os.css";

import { Building2, ClipboardCheck, Inbox, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  addRedlineStroke,
  addVoicePin,
  createRedlineReviewSession,
  createSampleAdQaInput,
  resolveVoicePin,
  runAdRegulationQaSuite,
  setWipePercent,
  stepBlinkVersion,
  toggleCompareMode,
  type AdRedlineReviewSession,
  type AdRegulationQaInput,
  type CompareViewMode,
} from "./ad-regulation-qa-engine";
import {
  checkoutBinaryAssetLock,
  createInitialBinaryLockRegistry,
  createSampleManuscriptRgbaBuffer,
  embedForensicLsbWatermark,
  extractForensicLsbWatermark,
  forceReclaimBinaryAssetLock,
  issueOutsourceScopedLink,
  releaseBinaryAssetLock,
  verifyOutsourceScopedAccess,
  type BinaryLockRegistry,
  type ForensicWatermarkEmbedResult,
  type ForensicWatermarkExtractResult,
  type OutsourceScopedLink,
} from "./binary-lock-forensic-guard";
import {
  autoStitchEpisodeSlices,
  createSampleEpisodeCuts,
  issueCutSliceLease,
  partitionEpisodeIntoCutSlices,
  transitionCutSliceStatus,
  type CutSlicePacket,
  type MasterEpisodeStitchResult,
  type PartitionStrategy,
} from "./cut-slice-partition-stitch";
import {
  TEAM_DIVISION_PRESET_IDS,
  TEAM_DIVISION_PRESETS,
  evaluateLayerWriteGuard,
  resolveSeatRolesForPreset,
  type LayerFolderId,
  type TeamDivisionPresetId,
} from "./layer-authority-rbac";
import {
  applyReassignmentRecommendation,
  createDefaultFiveWeekMatrix,
  detectPipelineBottlenecksAndRecommendations,
  simulateStageDelayRipple,
  type MultiEpisodePipelineMatrix,
  type ReassignmentRecommendation,
} from "./multi-episode-pipeline-scheduler";
import {
  accrueApprovedG3Cuts,
  calculateRoyaltySettlement,
  createDefaultStudioRoyaltyContracts,
  exportSettlementLedgerToCsv,
  exportSettlementLedgerToJson,
  type ContributorRoyaltyContract,
  type SettlementModelMode,
} from "./studio-royalty-ledger";
import {
  AdQaRoomView,
  PdControlTowerView,
} from "./StudioDivisionOsRoleViews";
import {
  OutsourceRoyaltyDeskView,
  WorkerInboxView,
} from "./StudioDivisionOsOpsViews";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export type DivisionOsRoleTab = "pd" | "ad" | "worker" | "outsource";

export interface StudioDivisionOsHubProps {
  readonly aggregate: ProductionProjectAggregate;
}

const FIXED_SIM_NOW_ISO = "2026-11-21T12:00:00.000Z";
const TOTAL_EPISODE_CUTS = 80;

export function StudioDivisionOsHub({ aggregate }: StudioDivisionOsHubProps) {
  const bt = useBilingual("StudioDivisionOsHub");
  const primaryEpisodeId = aggregate.episodes[0]?.id ?? "ep-12";

  const [activeTab, setActiveTab] = useState<DivisionOsRoleTab>("pd");
  const [presetId, setPresetId] = useState<TeamDivisionPresetId>("studio-9-role");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // T-001: 컷 분할 · Lease · 합본
  const episodeCuts = useMemo(
    () => createSampleEpisodeCuts(primaryEpisodeId, TOTAL_EPISODE_CUTS),
    [primaryEpisodeId],
  );
  const [partitionStrategy, setPartitionStrategy] = useState<PartitionStrategy>("by-cut-count");
  const [slices, setSlices] = useState<readonly CutSlicePacket[]>(() =>
    partitionEpisodeIntoCutSlices({
      episodeId: primaryEpisodeId,
      cuts: createSampleEpisodeCuts(primaryEpisodeId, TOTAL_EPISODE_CUTS),
      strategy: "by-cut-count",
      targetSliceSize: 20,
      createdAtIso: FIXED_SIM_NOW_ISO,
    }),
  );
  const [stitchResult, setStitchResult] = useState<MasterEpisodeStitchResult | null>(null);

  // T-002, T-011: 팀 프리셋 좌석 & 8레이어 RBAC 가드
  const currentPreset = TEAM_DIVISION_PRESETS[presetId];
  const [activeSeatId, setActiveSeatId] = useState<string>(currentPreset.seats[5]?.seatId ?? currentPreset.seats[0]?.seatId ?? "");
  const [selectedFolder, setSelectedFolder] = useState<LayerFolderId>("20_LINE");

  // T-003: 5주 병렬 멀티 에피소드 매트릭스 & 지연 시뮬레이션
  const [matrix, setMatrix] = useState<MultiEpisodePipelineMatrix>(() =>
    createDefaultFiveWeekMatrix(aggregate.title, 12),
  );
  const [delayHours, setDelayHours] = useState<number>(0);

  // T-004, T-005: AD 5종 QA & 비동기 레드라인/음성 핀/v1↔v2 비교
  const [qaInput, setQaInput] = useState<AdRegulationQaInput>(() =>
    createSampleAdQaInput(primaryEpisodeId),
  );
  const [reviewSession, setReviewSession] = useState<AdRedlineReviewSession>(() =>
    createRedlineReviewSession(primaryEpisodeId),
  );

  // T-007: 듀얼 정산 원장 (Studio No.9 기본 + 한국 CP MG/RS)
  const [settlementMode, setSettlementMode] = useState<SettlementModelMode>("studio-no9-cut-plus-royalty");
  const [platformFeeRate, setPlatformFeeRate] = useState<number>(0.35);
  const [contracts, setContracts] = useState<readonly ContributorRoyaltyContract[]>(() =>
    createDefaultStudioRoyaltyContracts(),
  );
  const [exportedFormat, setExportedFormat] = useState<"csv" | "json" | null>(null);
  const [exportedPayload, setExportedPayload] = useState<string>("");

  // T-008, T-009: 바이너리 잠금 + 외주 스코프 링크 + RGBA LSB 포렌식 워터마크
  const [binaryRegistry, setBinaryRegistry] = useState<BinaryLockRegistry>(() =>
    createInitialBinaryLockRegistry(FIXED_SIM_NOW_ISO),
  );
  const [linkCounter, setLinkCounter] = useState<number>(1);
  const [scopedLink, setScopedLink] = useState<OutsourceScopedLink>(() =>
    issueOutsourceScopedLink({
      projectId: aggregate.projectId,
      episodeId: primaryEpisodeId,
      sliceId: `${primaryEpisodeId}-slice-02`,
      allowedFolders: ["10_BG_3D", "30_FLAT"],
      vendorId: "ext-vendor-01",
      vendorName: "문라이트 배경 외주팀",
      nowIso: FIXED_SIM_NOW_ISO,
      ttlHours: 48,
    }),
  );
  const [watermarkEmbed, setWatermarkEmbed] = useState<ForensicWatermarkEmbedResult | null>(null);
  const [watermarkExtract, setWatermarkExtract] = useState<ForensicWatermarkExtractResult | null>(null);

  // 파생 계산
  const resolvedSeatId = currentPreset.seats.some((seat) => seat.seatId === activeSeatId)
    ? activeSeatId
    : (currentPreset.seats[0]?.seatId ?? "");
  const activeRoles = useMemo(
    () => resolveSeatRolesForPreset(presetId, resolvedSeatId),
    [presetId, resolvedSeatId],
  );
  const guardDecision = useMemo(
    () =>
      evaluateLayerWriteGuard({
        roles: activeRoles,
        folder: selectedFolder,
        operation: "write",
        presetId,
      }),
    [activeRoles, selectedFolder, presetId],
  );
  const delayReport = useMemo(
    () =>
      delayHours > 0
        ? simulateStageDelayRipple(matrix, {
            episodeId: matrix.episodes[1]?.episodeId ?? "ep-13",
            stageId: "shade",
            delayHours,
          })
        : null,
    [matrix, delayHours],
  );
  const bottleneckReport = useMemo(
    () => detectPipelineBottlenecksAndRecommendations(matrix),
    [matrix],
  );
  const scopedLinkCheck = useMemo(
    () =>
      verifyOutsourceScopedAccess(scopedLink, {
        sliceId: scopedLink.sliceId,
        folder: "10_BG_3D",
        nowIso: FIXED_SIM_NOW_ISO,
      }),
    [scopedLink],
  );
  const qaReport = useMemo(() => runAdRegulationQaSuite(qaInput), [qaInput]);
  const statement = useMemo(
    () =>
      calculateRoyaltySettlement({
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        periodLabel: "2026-11",
        mode: settlementMode,
        grossPlatformRevenueKrw: 24_000_000,
        platformFeeRate,
        contributors: contracts,
        generatedAtIso: FIXED_SIM_NOW_ISO,
      }),
    [aggregate.projectId, aggregate.title, settlementMode, platformFeeRate, contracts],
  );

  // 핸들러
  const handleSelectPreset = (nextPreset: TeamDivisionPresetId) => {
    setPresetId(nextPreset);
    const nextSeat = TEAM_DIVISION_PRESETS[nextPreset].seats[0]?.seatId ?? "";
    setActiveSeatId(nextSeat);
    const meta = TEAM_DIVISION_PRESETS[nextPreset];
    setStatusMessage(bt(`${meta.labelKo} 프리셋 적용됨`, `Applied preset: ${meta.labelEn}`));
  };

  const handlePartition = (strategy: PartitionStrategy) => {
    setPartitionStrategy(strategy);
    const nextSlices = partitionEpisodeIntoCutSlices({
      episodeId: primaryEpisodeId,
      cuts: episodeCuts,
      strategy,
      targetSliceSize: 20,
      createdAtIso: FIXED_SIM_NOW_ISO,
    });
    setSlices(nextSlices);
    setStitchResult(null);
    setStatusMessage(
      bt(
        `${TOTAL_EPISODE_CUTS}컷을 ${nextSlices.length}개 Cut-Slice로 분할했습니다.`,
        `Partitioned ${TOTAL_EPISODE_CUTS} cuts into ${nextSlices.length} Cut-Slices.`,
      ),
    );
  };

  const handleApproveSlice = (sliceId: string) => {
    setSlices((prev) =>
      prev.map((slice) =>
        slice.sliceId === sliceId
          ? transitionCutSliceStatus(slice, { type: "approve", actorId: "m-pd-1", nowIso: FIXED_SIM_NOW_ISO })
          : slice,
      ),
    );
    setStatusMessage(bt(`${sliceId} 슬라이스 승인 완료`, `Approved ${sliceId}`));
  };

  const handleRetakeSlice = (sliceId: string) => {
    setSlices((prev) =>
      prev.map((slice) =>
        slice.sliceId === sliceId
          ? transitionCutSliceStatus(slice, {
              type: "retake",
              actorId: "m-ad-1",
              note: "선폭 및 명암 대비 보정 요청",
              nowIso: FIXED_SIM_NOW_ISO,
            })
          : slice,
      ),
    );
    setStatusMessage(bt(`${sliceId} 리테이크 요청 등록`, `Retake requested on ${sliceId}`));
  };

  const handleApproveAllAndStitch = () => {
    const approvedSlices = slices.map((slice) =>
      transitionCutSliceStatus(slice, { type: "approve", actorId: "m-pd-1", nowIso: FIXED_SIM_NOW_ISO }),
    );
    setSlices(approvedSlices);
    const result = autoStitchEpisodeSlices({
      episodeId: primaryEpisodeId,
      expectedTotalCuts: TOTAL_EPISODE_CUTS,
      slices: approvedSlices,
      stitchedAtIso: FIXED_SIM_NOW_ISO,
    });
    setStitchResult(result);
    setStatusMessage(bt(result.summaryKo, result.summaryEn));
  };

  const handleRunStitch = () => {
    const result = autoStitchEpisodeSlices({
      episodeId: primaryEpisodeId,
      expectedTotalCuts: TOTAL_EPISODE_CUTS,
      slices,
      stitchedAtIso: FIXED_SIM_NOW_ISO,
    });
    setStitchResult(result);
    setStatusMessage(bt(result.summaryKo, result.summaryEn));
  };

  const handleApplyReassignment = (recommendation: ReassignmentRecommendation) => {
    setMatrix((prev) => applyReassignmentRecommendation(prev, recommendation));
    setStatusMessage(bt(recommendation.rationaleKo, recommendation.rationaleEn));
  };

  const handleReplaceNcAsset = () => {
    setQaInput((prev) => ({
      ...prev,
      rightsBomAssets: prev.rightsBomAssets.map((asset) =>
        asset.assetId === "bom-brush-rain"
          ? {
              ...asset,
              nameKo: "사내 제작 빗줄기 브러시 (상업 승인)",
              nameEn: "In-House Rain FX Brush (Commercial)",
              licenseCode: "CC0-1.0",
            }
          : asset,
      ),
    }));
    setStatusMessage(
      bt("NC 라이선스 브러시를 상업 안전 CC0 에셋으로 교체했습니다.", "Swapped NC brush to CC0 commercial asset."),
    );
  };

  const handleAddRedlinePin = () => {
    const nextIndex = reviewSession.voicePins.length + 1;
    setReviewSession((prev) => {
      const withStroke = addRedlineStroke(prev, {
        id: `rl-stroke-${nextIndex}`,
        cutIndex: prev.activeCutIndex,
        authorId: "m-ad-1",
        colorToken: "warn",
        widthPx: 2.5,
        points: [
          { x: 0.48, y: 0.52 },
          { x: 0.58, y: 0.61 },
        ],
        createdAtIso: FIXED_SIM_NOW_ISO,
      });
      return addVoicePin(withStroke, {
        id: `vp-${nextIndex}`,
        cutIndex: prev.activeCutIndex,
        xPercent: 54,
        yPercent: 58,
        authorId: "m-ad-1",
        authorName: "김도영 AD",
        durationSec: 12,
        transcriptKo: "배경 원근 소실점과 캐릭터 발 접지선 높이를 맞춰 주세요.",
        transcriptEn: "Align character ground plane with background perspective vanishing line.",
        severity: "polish",
        status: "open",
        createdAtIso: FIXED_SIM_NOW_ISO,
      });
    });
    setStatusMessage(bt("비동기 레드라인 스트로크·음성 핀을 추가했습니다.", "Added async redline stroke & voice pin."));
  };

  const handleLeaseSlice = (sliceId: string) => {
    const primaryRole = activeRoles[0] ?? "line";
    const seatMeta = currentPreset.seats.find((seat) => seat.seatId === resolvedSeatId);
    const holderName = seatMeta ? bt(seatMeta.seatNameKo, seatMeta.seatNameEn) : "작업자";
    let feedback = "";
    setSlices((prev) =>
      prev.map((slice) => {
        if (slice.sliceId !== sliceId) return slice;
        const leased = issueCutSliceLease(slice, {
          holderId: resolvedSeatId || "worker-1",
          holderName,
          role: primaryRole,
          nowIso: FIXED_SIM_NOW_ISO,
          ttlMinutes: 120,
        });
        feedback = bt(leased.reasonKo, leased.reasonEn);
        return leased.slice;
      }),
    );
    if (feedback) setStatusMessage(feedback);
  };

  const handleSubmitSlice = (sliceId: string) => {
    setSlices((prev) =>
      prev.map((slice) =>
        slice.sliceId === sliceId
          ? transitionCutSliceStatus(slice, { type: "submit", actorId: resolvedSeatId || "worker-1", nowIso: FIXED_SIM_NOW_ISO })
          : slice,
      ),
    );
    setStatusMessage(bt(`${sliceId} 검수 제출 완료`, `Submitted ${sliceId} for QA`));
  };

  const handleCheckoutBinary = (assetPath: string) => {
    const res = checkoutBinaryAssetLock(binaryRegistry, {
      assetPath,
      holderId: resolvedSeatId || "worker-1",
      holderName: "현재 작업자",
      holderRole: activeRoles[0] ?? "line",
      nowIso: FIXED_SIM_NOW_ISO,
      ttlMinutes: 180,
    });
    setBinaryRegistry(res.registry);
    setStatusMessage(bt(res.reasonKo, res.reasonEn));
  };

  const handleReleaseBinary = (assetPath: string) => {
    const lock = binaryRegistry.locks[assetPath];
    if (!lock) return;
    const res = releaseBinaryAssetLock(binaryRegistry, {
      assetPath,
      actorId: lock.holderId,
      nowIso: FIXED_SIM_NOW_ISO,
    });
    setBinaryRegistry(res.registry);
    setStatusMessage(bt(res.reasonKo, res.reasonEn));
  };

  const handleForceReclaimBinary = (assetPath: string) => {
    const res = forceReclaimBinaryAssetLock(binaryRegistry, {
      assetPath,
      actorId: "m-pd-1",
      actorRole: "pd",
      reason: "마감 긴급 인계",
      nowIso: FIXED_SIM_NOW_ISO,
    });
    setBinaryRegistry(res.registry);
    setStatusMessage(bt(res.reasonKo, res.reasonEn));
  };

  const handleAccrueG3Cuts = () => {
    setContracts((prev) =>
      accrueApprovedG3Cuts(prev, { contributorId: "c-line-1", addedG3Cuts: 10 }),
    );
    setStatusMessage(bt("박서윤(선화) G3 승인 컷 +10컷 정산 원장 적립 완료", "Accrued +10 G3 approved cuts to Line Artist."));
  };

  const handleGenerateExport = (format: "csv" | "json") => {
    const payload =
      format === "csv"
        ? exportSettlementLedgerToCsv(statement)
        : exportSettlementLedgerToJson(statement);
    setExportedFormat(format);
    setExportedPayload(payload);
    setStatusMessage(
      bt(`${format.toUpperCase()} 정산서 생성 완료`, `Generated ${format.toUpperCase()} settlement statement.`),
    );
  };

  const handleIssueOutsourceLink = () => {
    const nextNum = linkCounter + 1;
    setLinkCounter(nextNum);
    const nextLink = issueOutsourceScopedLink({
      projectId: aggregate.projectId,
      episodeId: primaryEpisodeId,
      sliceId: `${primaryEpisodeId}-slice-02`,
      allowedFolders: ["10_BG_3D", "30_FLAT"],
      vendorId: `ext-vendor-0${nextNum}`,
      vendorName: `외주 파트너 #${nextNum}`,
      nowIso: FIXED_SIM_NOW_ISO,
      ttlHours: 48,
    });
    setScopedLink(nextLink);
    setStatusMessage(bt(`48시간 외주 스코프 링크 발급: ${nextLink.token}`, `Issued 48h scoped link: ${nextLink.token}`));
  };

  const handleRunForensicWatermark = () => {
    const rgba = createSampleManuscriptRgbaBuffer(64, 32);
    const embedded = embedForensicLsbWatermark(rgba, 64, 32, scopedLink.watermarkPayload);
    setWatermarkEmbed(embedded);
    if (embedded.watermarkedRgba) {
      const extracted = extractForensicLsbWatermark(embedded.watermarkedRgba);
      setWatermarkExtract(extracted);
      setStatusMessage(bt(extracted.reasonKo, extracted.reasonEn));
    }
  };

  const roleTabs: readonly {
    readonly id: DivisionOsRoleTab;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly icon: typeof Building2;
  }[] = [
    { id: "pd", labelKo: "PD 관제탑", labelEn: "PD Control Tower", icon: Building2 },
    { id: "ad", labelKo: "AD 검수실", labelEn: "AD QA Room", icon: ClipboardCheck },
    { id: "worker", labelKo: "작업자 인박스", labelEn: "Worker Inbox", icon: Inbox },
    { id: "outsource", labelKo: "외주·정산 데스크", labelEn: "Outsource & Royalty", icon: Wallet },
  ];

  return (
    <section
      className="divos-shell p-4 sm:p-5 space-y-4"
      data-testid="studio-division-os-hub"
      aria-label={bt("산업형 웹툰 완전 분업 OS 작업대", "Industrial Webtoon Division OS Workbench")}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-fg [word-break:keep-all]">
                {bt("산업형 웹툰 완전 분업 OS", "Industrial Webtoon Division OS")}
              </h2>
              <span className="divos-pill" data-tone="accent">
                {bt("시뮬레이션 워크벤치", "Simulation Workbench")}
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
              {bt(
                `${aggregate.title} · 컷 분할·RBAC·5주 매트릭스·AD 5종 QA·Studio No.9 인세·포렌식 워터마크 통합`,
                `${aggregate.title} · Cut-Slice, RBAC, 5-week matrix, AD 5-point QA, Studio No.9 royalty, forensic watermark`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("팀 규모 분업 프리셋", "Team scale division presets")}>
            {TEAM_DIVISION_PRESET_IDS.map((id) => {
              const preset = TEAM_DIVISION_PRESETS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="divos-preset-btn"
                  aria-pressed={presetId === id}
                  onClick={() => handleSelectPreset(id)}
                >
                  {bt(preset.labelKo, preset.labelEn)}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-fg-3 [word-break:keep-all]">
          {bt(currentPreset.summaryKo, currentPreset.summaryEn)}
        </p>

        {/* 4대 역할 스위처 */}
        <div
          role="tablist"
          aria-label={bt("분업 OS 4대 역할 작업대", "Division OS 4 role workbenches")}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {roleTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className="divos-tab-btn"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{bt(tab.labelKo, tab.labelEn)}</span>
              </button>
            );
          })}
        </div>

        {statusMessage ? (
          <div role="status" className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-medium text-fg">
            {statusMessage}
          </div>
        ) : null}
      </header>

      <div role="tabpanel">
        {activeTab === "pd" ? (
          <PdControlTowerView
            partitionStrategy={partitionStrategy}
            totalEpisodeCuts={TOTAL_EPISODE_CUTS}
            slices={slices}
            stitchResult={stitchResult}
            matrix={matrix}
            delayHours={delayHours}
            delayReport={delayReport}
            bottleneckReport={bottleneckReport}
            onPartition={handlePartition}
            onApproveSlice={handleApproveSlice}
            onRetakeSlice={handleRetakeSlice}
            onApproveAllAndStitch={handleApproveAllAndStitch}
            onRunStitch={handleRunStitch}
            onSimulateDelay={(hours) => {
              setDelayHours(hours);
              setStatusMessage(
                hours > 0
                  ? bt(`13화 명암 공정 +${hours}h 지연 파급 시뮬레이션 실행`, `Simulated +${hours}h delay ripple on Ep.13 Shade.`)
                  : bt("지연 시뮬레이션을 초기화했습니다.", "Reset delay simulation."),
              );
            }}
            onApplyReassignment={handleApplyReassignment}
          />
        ) : null}

        {activeTab === "ad" ? (
          <AdQaRoomView
            qaInput={qaInput}
            qaReport={qaReport}
            reviewSession={reviewSession}
            onRunQa={() =>
              setStatusMessage(
                bt(
                  `AD 5종 자동 검수 완료: 통과 ${qaReport.passCount} · 경고 ${qaReport.warnCount} · 차단 ${qaReport.failCount}`,
                  `AD 5-point QA complete: ${qaReport.passCount} pass, ${qaReport.warnCount} warn, ${qaReport.failCount} fail.`,
                ),
              )
            }
            onReplaceNcAsset={handleReplaceNcAsset}
            onAddRedlinePin={handleAddRedlinePin}
            onResolvePin={(pinId) => {
              setReviewSession((prev) => resolveVoicePin(prev, pinId));
              setStatusMessage(bt("AD 블로커 음성 핀을 해결 처리했습니다.", "Resolved AD blocker voice pin."));
            }}
            onSetCompareMode={(mode: CompareViewMode) =>
              setReviewSession((prev) => toggleCompareMode(prev, mode))
            }
            onSetWipePercent={(percent) =>
              setReviewSession((prev) => setWipePercent(prev, percent))
            }
            onStepBlink={() => setReviewSession((prev) => stepBlinkVersion(prev))}
          />
        ) : null}

        {activeTab === "worker" ? (
          <WorkerInboxView
            seats={currentPreset.seats}
            activeSeatId={resolvedSeatId}
            activeRoles={activeRoles}
            selectedFolder={selectedFolder}
            guardDecision={guardDecision}
            slices={slices}
            binaryRegistry={binaryRegistry}
            onSelectSeat={setActiveSeatId}
            onSelectFolder={setSelectedFolder}
            onLeaseSlice={handleLeaseSlice}
            onSubmitSlice={handleSubmitSlice}
            onCheckoutBinary={handleCheckoutBinary}
            onReleaseBinary={handleReleaseBinary}
            onForceReclaimBinary={handleForceReclaimBinary}
          />
        ) : null}

        {activeTab === "outsource" ? (
          <OutsourceRoyaltyDeskView
            settlementMode={settlementMode}
            platformFeeRate={platformFeeRate}
            statement={statement}
            exportedFormat={exportedFormat}
            exportedPayload={exportedPayload}
            scopedLink={scopedLink}
            scopedLinkStatusText={bt(scopedLinkCheck.reasonKo, scopedLinkCheck.reasonEn)}
            watermarkEmbed={watermarkEmbed}
            watermarkExtract={watermarkExtract}
            onChangeSettlementMode={setSettlementMode}
            onChangePlatformFee={setPlatformFeeRate}
            onAccrueG3Cuts={handleAccrueG3Cuts}
            onGenerateExport={handleGenerateExport}
            onIssueOutsourceLink={handleIssueOutsourceLink}
            onRunForensicWatermark={handleRunForensicWatermark}
          />
        ) : null}
      </div>
    </section>
  );
}
