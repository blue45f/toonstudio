import { useMemo, useState } from "react";
import { CheckCircle2, Eye, Layers, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  type CutDrawOverAnnotationPin,
  DEFAULT_CUT_DRAW_OVER_PINS,
  DEFAULT_DEPARTMENT_CONSENSUS_VOTES,
  DEFAULT_VERSION_STACK_SNAPSHOTS,
  type DepartmentConsensusVote,
  evaluateCreativeReviewConsensus,
} from "./production-creative-review-consensus-model";

export function ProductionCreativeReviewConsensusSuite() {
  const bt = useBilingual("ProductionCreativeReviewConsensusSuite");
  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2" | "v3">("v3");
  const [pins, setPins] = useState<readonly CutDrawOverAnnotationPin[]>(DEFAULT_CUT_DRAW_OVER_PINS);
  const [votes, setVotes] = useState<readonly DepartmentConsensusVote[]>(DEFAULT_DEPARTMENT_CONSENSUS_VOTES);

  const summary = useMemo(
    () => evaluateCreativeReviewConsensus(pins, votes, DEFAULT_VERSION_STACK_SNAPSHOTS),
    [pins, votes],
  );

  const handleTogglePinResolved = (pinId: string) => {
    setPins((prev) =>
      prev.map((pin) => (pin.id === pinId ? { ...pin, resolved: !pin.resolved } : pin)),
    );
  };

  const handleToggleDepartmentApproval = (department: DepartmentConsensusVote["department"]) => {
    setVotes((prev) =>
      prev.map((vote) =>
        vote.department === department
          ? {
              ...vote,
              status: vote.status === "approved" ? "changes-requested" : "approved",
            }
          : vote,
      ),
    );
  };

  const handleApproveAllAndResolvePins = () => {
    setPins((prev) => prev.map((pin) => ({ ...pin, resolved: true })));
    setVotes((prev) => prev.map((vote) => ({ ...vote, status: "approved" })));
  };

  const activeVersionMeta =
    DEFAULT_VERSION_STACK_SNAPSHOTS.find((v) => v.versionTag === selectedVersion) ??
    DEFAULT_VERSION_STACK_SNAPSHOTS[2];

  return (
    <ProductionSectionCard
      title={bt(
        "컷 단위 드로오버(Draw-Over) 어노테이션 · 버전 스택 비교 · 5대 분업 데스크 합의 (Frame.io · SyncSketch)",
        "Cut Draw-Over Annotation Pins · Version Stack Compare · 5-Department Quorum Consensus",
      )}
      description={bt(
        "Frame.io의 버전 스택(v1→v2→v3)·C2PA 워터마크 검증과 SyncSketch/ftrack의 컷 좌표 드로오버 핀·부서별 승인 쿼럼을 통합한 크리에이티브 합평 스위트입니다.",
        "Creative review suite integrating Frame.io version stacks & C2PA watermark verification with SyncSketch/ftrack cut-coordinate draw-over pins and multi-department signoff quorum.",
      )}
      action={(
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductionPill tone={summary.quorumReached ? "success" : "warning"}>
            {bt(
              `반출 준비도 ${summary.publishReadinessScore}%`,
              `Release Readiness ${summary.publishReadinessScore}%`,
            )}
          </ProductionPill>
          <ProductionPill tone={summary.unresolvedMustFixPins === 0 ? "success" : "danger"}>
            {bt(
              `필수 수정 핀 ${summary.unresolvedMustFixPins}건`,
              `${summary.unresolvedMustFixPins} Must-Fix Pin(s)`,
            )}
          </ProductionPill>
        </div>
      )}
    >
      {/* Consensus Banner & One-Click Quorum Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5">
        <div className="flex items-start gap-2.5">
          {summary.quorumReached ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
          ) : (
            <Eye className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          )}
          <div>
            <p className="text-xs font-bold text-fg">
              {bt(summary.statusBannerKo, summary.statusBannerEn)}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-fg-3">
              {bt(
                `현재 기준 버전: ${activeVersionMeta.labelKo} · 평균 색차(ΔE): ${activeVersionMeta.avgDeltaEColorShift} · C2PA 보안 워터마크 검증됨`,
                `Active stack: ${activeVersionMeta.labelEn} · Avg Delta-E: ${activeVersionMeta.avgDeltaEColorShift} · C2PA watermark verified`,
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={buttonClass({ size: "sm", variant: "outline" })}
          onClick={handleApproveAllAndResolvePins}
        >
          <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
          {bt("필수 핀 일괄 해결 및 5대 데스크 전원 승인", "Resolve All Pins & Complete 5-Desk Quorum")}
        </button>
      </div>

      {/* Version Stack Selector (v1 / v2 / v3) */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3" role="tablist" aria-label={bt("버전 스택 선택", "Version stack selector")}>
        {DEFAULT_VERSION_STACK_SNAPSHOTS.map((ver) => {
          const isSelected = ver.versionTag === selectedVersion;
          return (
            <button
              key={ver.versionTag}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedVersion(ver.versionTag)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                isSelected ? "border-accent bg-accent/10" : "border-line bg-panel hover:bg-raised",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-fg">
                  <Layers className="size-3.5 text-accent" aria-hidden="true" />
                  {bt(ver.labelKo, ver.labelEn)}
                </span>
                {ver.c2paWatermarkVerified ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-good/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-good">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    C2PA
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[0.6875rem] text-fg-3">
                {bt(ver.authorRoleKo, ver.authorRoleEn)} · {ver.uploadedAt}
              </p>
              <p className="mt-1 text-[0.6875rem] font-semibold text-fg-2">
                {bt(`변경 ${ver.changedCutsCount}컷 · 색차 ΔE ${ver.avgDeltaEColorShift}`, `${ver.changedCutsCount} cuts changed · Delta-E ${ver.avgDeltaEColorShift}`)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Draw-Over Pins + 5-Department Signoff Quorum */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="size-4 text-accent" aria-hidden="true" />
              <p className="text-xs font-bold text-fg">
                {bt("컷 좌표 드로오버 어노테이션 핀 (Draw-Over Pins)", "Cut-Coordinate Draw-Over Annotation Pins")}
              </p>
            </div>
            <ProductionPill tone="neutral">{bt(`총 ${pins.length}개 핀`, `${pins.length} Pins`)}</ProductionPill>
          </div>

          <div className="mt-2.5 space-y-2">
            {pins.map((pin) => (
              <div
                key={pin.id}
                className={cn(
                  "rounded-lg border p-2.5 text-xs",
                  pin.resolved ? "border-line bg-raised/60 opacity-85" : "border-bad/30 bg-bad/5",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-bold text-accent">
                      C{String(pin.cutNumber).padStart(3, "0")} ({pin.xPct}%, {pin.yPct}%)
                    </span>
                    <ProductionPill
                      tone={
                        pin.resolved
                          ? "success"
                          : pin.severity === "must-fix"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {pin.resolved
                        ? bt("해결됨", "Resolved")
                        : pin.severity === "must-fix"
                          ? bt("필수 수정", "Must-Fix")
                          : bt("권장 제안", "Suggestion")}
                    </ProductionPill>
                    <code className="rounded bg-panel px-1.5 py-0.5 text-[0.625rem] text-fg-3">
                      {pin.tool}
                    </code>
                  </div>
                  <button
                    type="button"
                    className={buttonClass({ size: "sm", variant: "outline" })}
                    onClick={() => handleTogglePinResolved(pin.id)}
                  >
                    {pin.resolved ? bt("재오픈", "Reopen") : bt("수정 확인", "Mark Resolved")}
                  </button>
                </div>
                <p className="mt-1.5 leading-5 text-fg">{bt(pin.commentKo, pin.commentEn)}</p>
                <p className="mt-1 text-[0.6875rem] text-fg-3">
                  {pin.authorName} · {pin.versionTag}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          role="region"
          aria-labelledby="department-consensus-quorum-caption"
          className="overflow-x-auto rounded-xl border border-line bg-panel"
        >
          <table className="w-full border-collapse text-left text-xs">
            <caption id="department-consensus-quorum-caption" className="sr-only">
              {bt("5대 분업 데스크 승인 쿼럼 현황", "5-Department signoff quorum status")}
            </caption>
            <thead className="sticky top-0 z-10 border-b border-line bg-raised text-[0.6875rem] text-fg-3">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("분업 데스크", "Department Desk")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("검수 책임자", "Lead Reviewer")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("상태", "Status")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{bt("결재 전환", "Signoff")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {votes.map((vote) => (
                <tr key={vote.department} className="hover:bg-raised/60">
                  <th scope="row" className="px-3 py-2.5 font-bold text-fg">
                    <div>{bt(vote.departmentLabelKo, vote.departmentLabelEn)}</div>
                    <div className="mt-0.5 text-[0.6875rem] font-normal text-fg-3">
                      {bt(vote.noteKo, vote.noteEn)}
                    </div>
                  </th>
                  <td className="px-3 py-2.5 text-fg-2">
                    <div>{vote.reviewerName}</div>
                    <div className="text-[0.65rem] text-fg-3">SLA {vote.slaHoursRemaining}h</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ProductionPill tone={vote.status === "approved" ? "success" : "danger"}>
                      {vote.status === "approved" ? bt("승인 완료", "Approved") : bt("수정 후 승인", "Changes Req")}
                    </ProductionPill>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className={buttonClass({ size: "sm", variant: "outline" })}
                      onClick={() => handleToggleDepartmentApproval(vote.department)}
                    >
                      {vote.status === "approved" ? bt("승인 철회", "Revoke") : bt("데스크 승인", "Approve Desk")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProductionSectionCard>
  );
}
