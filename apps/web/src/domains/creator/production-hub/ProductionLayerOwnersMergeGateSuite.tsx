import { CheckCircle2, GitMerge, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  approveAndPassLayerOwnerRule,
  DEFAULT_LAYER_OWNER_RULES,
  evaluateLayerOwnersMergeGate,
  isRuleMergeable,
  pushNewLayerRevisionWithStaleDismissal,
  type LayerOwnerRule,
} from "./production-layer-owners-merge-gate-model";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionLayerOwnersMergeGateSuite() {
  const bt = useBilingual("domains.creator.production.handoff.layerOwnersMergeGate");
  const tableCaptionId = useId();
  const revisionInputId = useId();
  const revisionHelpId = useId();

  const [rules, setRules] = useState<readonly LayerOwnerRule[]>(DEFAULT_LAYER_OWNER_RULES);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("owner-rule-color");
  const [revisionInput, setRevisionInput] = useState<string>("rev_99f1a04");

  const summary = useMemo(() => evaluateLayerOwnersMergeGate(rules), [rules]);

  function handlePushRevision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revisionInput.trim()) return;
    setRules((prev) => pushNewLayerRevisionWithStaleDismissal(prev, selectedRuleId, revisionInput));
    setRevisionInput("");
  }

  return (
    <ProductionSectionCard
      title={bt(
        "LAYEROWNERS 자동 리뷰 라우팅 & 보호 회차 병합 게이트 (GitHub Code Review + Airtable REA 내재화)",
        "LAYEROWNERS Auto-Review Routing & Protected Cut Merge Gate (GitHub + Airtable REA)",
      )}
      subtitle={bt(
        "레이어 경로 패턴별 필수 오너 그룹(@subteam) 서명, 신규 리비전 업로드 시 기존 승인 자동 무효화(Dismiss Stale Approvals), Airtable 양방향 에셋 롤업 및 필드 잠금을 통합합니다.",
        "Unifies LAYEROWNERS pattern sign-offs, stale approval dismissal on new layer revisions, and Airtable linked asset rollups with conditional field locking.",
      )}
      action={
        <ProductionPill tone={summary.protectedBranchReady ? "good" : "warn"}>
          {summary.protectedBranchReady
            ? bt("보호 브랜치 병합 가능 (Protected Merge Ready)", "Protected Merge Ready")
            : bt(
                `병합 차단 (${summary.blockedRuleCount}개 레이어 게이트 미충족)`,
                `Merge Blocked (${summary.blockedRuleCount} layer gates pending)`,
              )}
        </ProductionPill>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-3 text-xs">
          <p className="text-fg-3">{bt("LAYEROWNERS 규칙 충족", "Satisfied Owner Rules")}</p>
          <p className="mt-1 text-base font-bold text-fg tabular-nums">
            {summary.mergeableRuleCount} / {summary.totalRules}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3 text-xs">
          <p className="text-fg-3">{bt("연결된 3D·브러시 에셋 롤업", "Linked Asset Rollup")}</p>
          <p className="mt-1 text-base font-bold text-fg tabular-nums">
            {bt(
              `${summary.totalLinkedAssets}개 표준 소재`,
              `${summary.totalLinkedAssets} linked assets`,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3 text-xs">
          <p className="text-fg-3">
            {bt("Stale 승인 자동 무효화 누적", "Stale Approvals Dismissed")}
          </p>
          <p className="mt-1 text-base font-bold text-fg tabular-nums">
            {bt(`${summary.staleDismissedTotal}건`, `${summary.staleDismissedTotal} dismissed`)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3 text-xs">
          <p className="text-fg-3">{bt("마스터 원고 병합 게이트", "Master Episode Merge Gate")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-fg">
            {summary.protectedBranchReady ? (
              <>
                <GitMerge size={15} className="text-good" aria-hidden="true" />
                <span>{bt("즉시 병합 허용", "Merge Unlocked")}</span>
              </>
            ) : (
              <>
                <ShieldAlert size={15} className="text-warn" aria-hidden="true" />
                <span>{bt("Fail-Closed 보호 잠금", "Fail-Closed Protected")}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* 반응형 LAYEROWNERS & Airtable Rollup 테이블 (modern-web-guidance: responsive-table) */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Modern Web Guidance responsive-table keyboard scrollable region
        tabIndex={0}
        role="region"
        aria-labelledby={tableCaptionId}
        className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption id={tableCaptionId} className="sr-only">
            {bt(
              "LAYEROWNERS 패턴별 오너 그룹 승인, 상태 체크, 연결 에셋 롤업 및 병합 게이트 표",
              "LAYEROWNERS pattern approvals, status checks, linked asset rollups, and merge gate table",
            )}
          </caption>
          <thead className="sticky top-0 z-10 bg-raised text-fg-2">
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("공정 레이어 & 글롭 패턴", "Layer Stage & Glob Pattern")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("담당 오너 그룹", "Owner Group")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("오너 승인 쿼럼", "Approval Quorum")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("연결 에셋 롤업 (Airtable)", "Linked Assets (Airtable)")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("600dpi·sRGB·명명 체크", "Status Checks")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("필드 잠금 / 액션", "Field Lock / Action")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-panel">
            {rules.map((rule) => {
              const mergeable = isRuleMergeable(rule);
              return (
                <tr key={rule.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] bg-panel px-3 py-2.5 font-semibold text-fg"
                  >
                    <div>{bt(rule.stageLabelKo, rule.stageLabelEn)}</div>
                    <code className="mt-0.5 block font-mono text-[0.6875rem] text-fg-3">
                      {rule.pattern} ({rule.latestRevisionHash})
                    </code>
                  </th>
                  <td className="px-3 py-2.5 font-mono text-fg-2">{rule.ownerGroup}</td>
                  <td className="px-3 py-2.5 text-fg-2 tabular-nums">
                    <span className="font-bold text-fg">
                      {rule.currentApprovals} / {rule.requiredApprovals}
                    </span>
                    {rule.staleDismissedCount > 0 ? (
                      <span className="ml-1.5 text-[0.6875rem] text-warn">
                        (
                        {bt(
                          `Stale 무효화 ${rule.staleDismissedCount}건`,
                          `${rule.staleDismissedCount} stale dismissed`,
                        )}
                        )
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {rule.linkedAssetIds.map((assetId) => (
                        <span
                          key={assetId}
                          className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[0.6875rem] text-fg-2"
                        >
                          {assetId}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ProductionPill tone={mergeable ? "good" : "warn"}>
                      {mergeable
                        ? bt("3대 규격 통과", "All 3 Checks Passed")
                        : bt("검수·규격 대기", "Checks Pending")}
                    </ProductionPill>
                  </td>
                  <td className="px-3 py-2.5">
                    {mergeable ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-good">
                        <Lock size={13} aria-hidden="true" />
                        {bt("승인 잠금 완료", "Approved & Locked")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setRules((prev) => approveAndPassLayerOwnerRule(prev, rule.id))
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-fg hover:bg-accent/20"
                      >
                        <CheckCircle2 size={13} aria-hidden="true" />
                        {bt("오너 승인 및 규격 통과", "Approve & Pass Checks")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 신규 레이어 리비전 푸시 시 Stale 승인 자동 무효화 시뮬레이터 (modern-web-guidance: forms) */}
      <form
        onSubmit={handlePushRevision}
        className="mt-4 rounded-xl border border-line bg-panel p-3.5 text-xs"
      >
        <fieldset className="space-y-3">
          <legend className="font-bold text-fg">
            {bt(
              "신규 레이어 리비전 업로드 시 Stale 승인 자동 무효화 테스트 (Dismiss Stale Pull Request Approvals)",
              "Simulate Stale Approval Dismissal on New Layer Revision Push",
            )}
          </legend>
          <div className="flex flex-wrap gap-3">
            {rules.map((rule) => (
              <label
                key={rule.id}
                className="inline-flex cursor-pointer items-center gap-1.5 text-fg-2"
              >
                <input
                  type="radio"
                  name="target_layer_owner_rule"
                  value={rule.id}
                  checked={selectedRuleId === rule.id}
                  onChange={() => setSelectedRuleId(rule.id)}
                />
                <span>{bt(rule.stageLabelKo, rule.stageLabelEn)}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label htmlFor={revisionInputId} className="block font-semibold text-fg-2">
                {bt("새 레이어 리비전 해시 코드", "New Layer Revision Hash")}
              </label>
              <input
                id={revisionInputId}
                name="revision_hash"
                type="text"
                required
                value={revisionInput}
                onChange={(e) => setRevisionInput(e.target.value)}
                aria-describedby={revisionHelpId}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="rev_99f1a04"
                className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-xs text-fg"
              />
              <span id={revisionHelpId} className="mt-0.5 block text-[0.6875rem] text-fg-3">
                {bt(
                  "식별자 해시 입력 시 기존 오너 승인이 0건으로 초기화되고 필드 잠금이 해제됩니다.",
                  "Pushing a new revision resets existing approvals to 0 and unlocks the layer fields.",
                )}
              </span>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 font-semibold text-fg hover:bg-card"
            >
              <RefreshCw size={13} aria-hidden="true" />
              {bt("신규 리비전 푸시 (Stale 무효화)", "Push Revision (Dismiss Stale)")}
            </button>
          </div>
        </fieldset>
      </form>
    </ProductionSectionCard>
  );
}
