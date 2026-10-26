import { useMemo, useState } from "react";
import { CheckCircle2, GitBranch, Inbox, ShieldAlert, Sparkles } from "lucide-react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  type CanvasStageBranch,
  DEFAULT_CANVAS_STAGE_BRANCHES,
  DEFAULT_DIVISION_HANDOFF_PACKETS,
  DEFAULT_DIVISION_TRIAGE_ASKS,
  type DivisionHandoffPacket,
  type DivisionTriageAskItem,
  evaluateHandoffPreflightGate,
  getDivisionStageSpec,
  type HandoffGateStatus,
  simulateStageBranchMerge,
  type TriageAskState,
  WEBTOON_DIVISION_STAGES,
} from "./production-division-handoff-triage-model";

export interface ProductionDivisionHandoffTriageSuiteProps {
  readonly episodeLabel: string;
}

function gatePillTone(status: HandoffGateStatus): "success" | "warning" | "danger" {
  if (status === "ready-for-handoff") return "success";
  if (status === "triage-required") return "warning";
  return "danger";
}

function gateStatusText(
  status: HandoffGateStatus,
  bt: (ko: string, en: string) => string,
): string {
  if (status === "ready-for-handoff") return bt("인계 준비 완료 (Ready)", "Ready for Handoff");
  if (status === "triage-required") return bt("트리아지 검토 필요", "Triage Required");
  return bt("규격·필수 게이트 차단", "Blocked by Spec Gate");
}

export function ProductionDivisionHandoffTriageSuite({
  episodeLabel,
}: ProductionDivisionHandoffTriageSuiteProps) {
  const bt = useBilingual("ProductionDivisionHandoffTriageSuite");
  const [packets, setPackets] = useState<readonly DivisionHandoffPacket[]>(DEFAULT_DIVISION_HANDOFF_PACKETS);
  const [selectedPacketId, setSelectedPacketId] = useState<string>(DEFAULT_DIVISION_HANDOFF_PACKETS[1]?.id ?? DEFAULT_DIVISION_HANDOFF_PACKETS[0].id);
  const [asks, setAsks] = useState<readonly DivisionTriageAskItem[]>(DEFAULT_DIVISION_TRIAGE_ASKS);
  const [branches, setBranches] = useState<readonly CanvasStageBranch[]>(DEFAULT_CANVAS_STAGE_BRANCHES);

  const evaluations = useMemo(
    () => packets.map((packet) => ({ packet, evaluation: evaluateHandoffPreflightGate(packet) })),
    [packets],
  );

  const selectedEntry = useMemo(
    () => evaluations.find((entry) => entry.packet.id === selectedPacketId) ?? evaluations[0],
    [evaluations, selectedPacketId],
  );

  const mergeSimulation = useMemo(
    () => simulateStageBranchMerge(branches),
    [branches],
  );

  const handleToggleChecklist = (packetId: string, checkId: string) => {
    setPackets((prev) =>
      prev.map((pkt) => {
        if (pkt.id !== packetId) return pkt;
        return {
          ...pkt,
          checklist: pkt.checklist.map((item) =>
            item.id === checkId ? { ...item, passed: !item.passed } : item,
          ),
        };
      }),
    );
  };

  const handleAutoFixPacketSpec = (packetId: string) => {
    setPackets((prev) =>
      prev.map((pkt) => {
        if (pkt.id !== packetId) return pkt;
        return {
          ...pkt,
          completedCuts: pkt.totalCuts,
          canvasWidthPx: Math.max(1440, pkt.canvasWidthPx),
          dpi: Math.max(350, pkt.dpi),
          layerConflictCount: 0,
          checklist: pkt.checklist.map((item) => ({ ...item, passed: true })),
        };
      }),
    );
  };

  const handleAdvanceAskState = (askId: string) => {
    const nextOrder: Record<TriageAskState, TriageAskState> = {
      "intake-triage": "accepted-in-cycle",
      "accepted-in-cycle": "resolved-merged",
      "resolved-merged": "intake-triage",
    };
    setAsks((prev) =>
      prev.map((ask) => (ask.id === askId ? { ...ask, state: nextOrder[ask.state] } : ask)),
    );
  };

  const handleResolveBranchConflicts = () => {
    setBranches((prev) =>
      prev.map((branch) => ({
        ...branch,
        conflictingLayers: [],
        readyForStage: true,
      })),
    );
  };

  const readyCount = evaluations.filter((entry) => entry.evaluation.gateStatus === "ready-for-handoff").length;
  const openTriageCount = asks.filter((ask) => ask.state !== "resolved-merged").length;

  return (
    <ProductionSectionCard
      title={bt(
        `8단계 분업 배턴 인계 게이트 · 트리아지 인박스 · 브랜치 병합 (${episodeLabel})`,
        `8-Stage Division Handoff Gate · Triage Inbox · Branch Merge (${episodeLabel})`,
      )}
      description={bt(
        "Linear(/intake · /asks · SLA)와 Figma(Ready for Next Stage · Branch & Merge) 아키텍처를 웹툰 8대 분업 공정에 결합한 프리플라이트 인계 워크벤치입니다.",
        "Preflight handoff workbench combining Linear (/intake, /asks, SLA) and Figma (Ready for Stage, Branch & Merge) across the 8 webtoon division-of-labor stages.",
      )}
      action={(
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductionPill tone={readyCount === evaluations.length ? "success" : "warning"}>
            {bt(`인계 패킷 ${readyCount}/${evaluations.length} 통과`, `${readyCount}/${evaluations.length} Packets Ready`)}
          </ProductionPill>
          <ProductionPill tone={openTriageCount === 0 ? "success" : "danger"}>
            {bt(`미해결 Asks ${openTriageCount}건`, `${openTriageCount} Open Asks`)}
          </ProductionPill>
        </div>
      )}
    >
      {/* 8-Stage Division Pipeline Ribbon */}
      <div className="rounded-xl border border-line bg-panel p-3">
        <p className="text-xs font-bold text-fg">
          {bt("웹툰 8대 분업 공정 표준 레이어 계약 (Stage-Gate Spec)", "Webtoon 8-Stage Division Pipeline & Required Layer Contract")}
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {WEBTOON_DIVISION_STAGES.map((stage) => (
            <div key={stage.key} className="rounded-lg border border-line bg-raised p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-fg">{bt(stage.labelKo, stage.labelEn)}</span>
                <span className="rounded bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-3">
                  SLA {stage.defaultSlaHours}h
                </span>
              </div>
              <p className="mt-0.5 text-[0.6875rem] text-fg-3">{bt(stage.ownerRoleKo, stage.ownerRoleEn)}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {stage.requiredLayers.map((layer) => (
                  <code key={layer} className="rounded bg-panel px-1.5 py-0.5 text-[0.625rem] text-fg-2">
                    {layer}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Handoff Packets Table + Active Packet Preflight Gate */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div
          role="region"
          aria-labelledby="division-handoff-packet-table-caption"
          className="overflow-x-auto rounded-xl border border-line bg-panel"
        >
          <table className="w-full border-collapse text-left text-xs">
            <caption id="division-handoff-packet-table-caption" className="sr-only">
              {bt("공정 간 인계 패킷 목록 및 프리플라이트 준비율", "Inter-stage handoff packets and preflight readiness")}
            </caption>
            <thead className="sticky top-0 z-10 border-b border-line bg-raised text-[0.6875rem] text-fg-3">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("배턴 구간", "Stage Handoff")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("컷 범위", "Cut Scope")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("캔버스 규격", "Canvas Spec")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("준비율", "Readiness")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("게이트 상태", "Gate Status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {evaluations.map(({ packet, evaluation }) => {
                const fromSpec = getDivisionStageSpec(packet.fromStage);
                const toSpec = getDivisionStageSpec(packet.toStage);
                const isSelected = packet.id === selectedEntry.packet.id;
                return (
                  <tr
                    key={packet.id}
                    onClick={() => setSelectedPacketId(packet.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-raised/70",
                      isSelected && "bg-accent/10",
                    )}
                  >
                    <th scope="row" className="px-3 py-2.5 font-bold text-fg">
                      <div>{bt(fromSpec.labelKo, fromSpec.labelEn)} → {bt(toSpec.labelKo, toSpec.labelEn)}</div>
                      <div className="mt-0.5 font-mono text-[0.65rem] font-normal text-fg-3">{packet.branchName}</div>
                    </th>
                    <td className="px-3 py-2.5 text-fg-2">
                      <div>{packet.cutRangeLabel}</div>
                      <div className="text-[0.6875rem] text-fg-3">
                        {packet.completedCuts}/{packet.totalCuts} ({evaluation.cutCompletionPct}%)
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">
                      {packet.canvasWidthPx}px · {packet.dpi}DPI
                    </td>
                    <td className="px-3 py-2.5 font-bold text-fg">{evaluation.readinessScore}%</td>
                    <td className="px-3 py-2.5">
                      <ProductionPill tone={gatePillTone(evaluation.gateStatus)}>
                        {gateStatusText(evaluation.gateStatus, bt)}
                      </ProductionPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Packet Inspector */}
        {selectedEntry ? (
          <div className="rounded-xl border border-line bg-panel p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-fg">
                  {bt("선택된 인계 패킷 프리플라이트 검수", "Selected Packet Preflight Inspector")}
                </p>
                <p className="mt-0.5 font-mono text-[0.6875rem] text-fg-3">
                  {selectedEntry.packet.branchName} · SLA {selectedEntry.packet.slaRemainingHours}h
                </p>
              </div>
              <button
                type="button"
                className={buttonClass({ size: "sm", variant: "secondary" })}
                onClick={() => handleAutoFixPacketSpec(selectedEntry.packet.id)}
              >
                <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
                {bt("규격·체크리스트 일괄 충족", "Satisfy All Preflight Checks")}
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {selectedEntry.packet.checklist.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-raised p-2 text-xs text-fg"
                >
                  <input
                    type="checkbox"
                    checked={item.passed}
                    onChange={() => handleToggleChecklist(selectedEntry.packet.id, item.id)}
                    className="mt-0.5 size-4 rounded border-line"
                  />
                  <span className="flex-1 leading-4">
                    {bt(item.labelKo, item.labelEn)}
                    {item.mandatory ? (
                      <span className="ml-1.5 rounded bg-bad/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-bad">
                        {bt("필수", "Mandatory")}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>

            {selectedEntry.evaluation.blockersKo.length > 0 ? (
              <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
                {selectedEntry.evaluation.blockersKo.map((blockerKo, idx) => (
                  <p
                    key={blockerKo}
                    className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-fg"
                  >
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden="true" />
                    <span>{bt(blockerKo, selectedEntry.evaluation.blockersEn[idx] ?? blockerKo)}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-good/30 bg-good/10 p-2.5 text-xs font-semibold text-fg">
                <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden="true" />
                {bt(
                  "모든 필수 레이어·해상도·폐곡선 검수를 통과하여 후속 공정으로 즉시 배턴을 넘길 수 있습니다.",
                  "All mandatory layer, resolution, and closed-gap checks passed; ready for immediate downstream handoff.",
                )}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Linear Triage (/intake, /asks) + Figma Stage Branch Merge */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-accent" aria-hidden="true" />
              <p className="text-xs font-bold text-fg">
                {bt("공정 간 역방향 수정 요청 인박스 (Linear /intake · /asks)", "Cross-Stage Triage & Asks Queue (Linear /intake · /asks)")}
              </p>
            </div>
            <ProductionPill tone="neutral">{bt(`총 ${asks.length}건`, `${asks.length} Total`)}</ProductionPill>
          </div>
          <div className="mt-2.5 space-y-2">
            {asks.map((ask) => {
              const fromSpec = getDivisionStageSpec(ask.fromStage);
              const toSpec = getDivisionStageSpec(ask.toStage);
              return (
                <div key={ask.id} className="rounded-lg border border-line bg-raised p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[0.6875rem] font-bold text-accent">{ask.code}</span>
                      <ProductionPill tone={ask.priority === "urgent" ? "danger" : ask.priority === "high" ? "warning" : "neutral"}>
                        {ask.priority.toUpperCase()}
                      </ProductionPill>
                      <span className="text-[0.6875rem] text-fg-3">
                        {bt(fromSpec.labelKo, fromSpec.labelEn)} → {bt(toSpec.labelKo, toSpec.labelEn)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={buttonClass({ size: "sm", variant: "secondary" })}
                      onClick={() => handleAdvanceAskState(ask.id)}
                    >
                      {ask.state === "intake-triage"
                        ? bt("사이클 수락", "Accept into Cycle")
                        : ask.state === "accepted-in-cycle"
                          ? bt("해결·병합 완료", "Mark Resolved")
                          : bt("완료됨 (재오픈)", "Resolved (Reopen)")}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-fg">{bt(ask.titleKo, ask.titleEn)}</p>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">
                    {bt("대상 컷", "Target cuts")}: {ask.cutNumbers.map((c) => `C${String(c).padStart(3, "0")}`).join(", ")} ·{" "}
                    {bt("담당", "Assignee")}: {ask.assigneeName} · SLA {ask.slaHoursLeft}h
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-accent" aria-hidden="true" />
              <p className="text-xs font-bold text-fg">
                {bt("캔버스 작업 브랜치 병합 시뮬레이터 (Figma Branch & Merge)", "Canvas Stage Branch & Merge Simulator")}
              </p>
            </div>
            <button
              type="button"
              className={buttonClass({ size: "sm", variant: "secondary" })}
              onClick={handleResolveBranchConflicts}
            >
              {bt("레이어 충돌 해소 및 Ready 전환", "Resolve Layer Conflicts & Mark Ready")}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-fg-2">
            {bt(mergeSimulation.summaryKo, mergeSimulation.summaryEn)}
          </p>
          <div className="mt-2.5 space-y-2">
            {branches.map((branch) => {
              const stageSpec = getDivisionStageSpec(branch.stageKey);
              return (
                <div key={branch.id} className="rounded-lg border border-line bg-raised p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-mono text-xs font-bold text-fg">{branch.branchName}</span>
                    <ProductionPill tone={branch.readyForStage && branch.conflictingLayers.length === 0 ? "success" : "warning"}>
                      {branch.readyForStage && branch.conflictingLayers.length === 0
                        ? bt("Ready for Stage (병합 가능)", "Ready for Stage")
                        : bt(`레이어 충돌 ${branch.conflictingLayers.length}건`, `${branch.conflictingLayers.length} Layer Conflict(s)`)}
                    </ProductionPill>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">
                    {bt(stageSpec.labelKo, stageSpec.labelEn)} · {branch.authorName} · {branch.baseRevision} → {branch.headRevision} ({branch.modifiedCuts} cuts)
                  </p>
                  {branch.conflictingLayers.length > 0 ? (
                    <p className="mt-1 text-[0.6875rem] font-semibold text-bad">
                      {bt("충돌 레이어", "Conflicting layers")}: {branch.conflictingLayers.join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ProductionSectionCard>
  );
}
