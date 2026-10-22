import "./claude-assist-i18n";

import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { CLAUDE_PRICE_AS_OF, claudeModelInfo } from "./claude-models";
import { formatClaudeUsd } from "./claude-usage-meter";

import type { ClaudeBudgetGuard } from "./use-claude-budget-guard";

export interface ClaudePreflightRow {
  readonly label: string;
  readonly value: string;
}

export interface ClaudePreflightProps {
  /** 이번 요청에 실제로 쓸 모델 ID. */
  readonly model: string;
  /** 이번 요청의 비용 상한(USD). 단가를 모르는 모델이면 null, 보낼 이미지·글이 아직 없으면 undefined. */
  readonly capUsd: number | null | undefined;
  readonly guard: ClaudeBudgetGuard;
  /**
   * 무엇이 어디로 나가는지 한 문장. 자세한 줄을 펼치지 않아도 항상 보이는 곳에 둔다(외부 전송 고지는 접어 두지 않는다).
   * 보통 `rows`의 "외부 전송" 줄과 같은 문장을 넘긴다.
   */
  readonly summary?: string;
  /** 기능마다 다른 줄(외부 전송·예상 시간·결과·원본 보호). 호출자가 번역해 넘긴다. */
  readonly rows: readonly ClaudePreflightRow[];
  readonly className?: string;
}

/**
 * 실행 전 확인 — 스튜디오 AI 어시스트 허브의 "실행 전 확인"과 같은 어휘(처리 경로·외부 전송·비용·예상 시간·결과·실패 정책·
 * 원본 보호)로, 사용자 결제 키로 Anthropic에 직접 보내기 전에 무엇이 어디로 얼마까지 나가는지 한눈에 보여 준다.
 * 요약 줄(모델·비용 상한)과 "무엇이 어디로 나가는지" 한 문장은 항상 보이고, 자세한 줄은 펼쳐 본다. 세션 예산을 넘을 수 있으면 따로 알린다.
 */
export function ClaudePreflight({ model, capUsd, guard, rows, summary, className }: ClaudePreflightProps) {
  const t = useT();
  const detailsId = useId();
  const info = claudeModelInfo(model);
  const modelLabel = info?.label ?? model;
  const capText = capUsd === undefined
    ? t("claudeAssist.preflight.capPending")
    : capUsd === null
      ? t("claudeAssist.preflight.capUnknown")
      : t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(capUsd) });
  const attention = !guard.pending && (guard.verdict.kind === "exceeds" || guard.verdict.kind === "unknown-cost");
  const limit = guard.limitUsd === null ? "" : formatClaudeUsd(guard.limitUsd);

  return (
    <div className={cn("space-y-2", className)} data-claude-preflight="true">
      <details className="group overflow-hidden rounded-xl border border-line bg-card/75">
        <summary
          aria-controls={detailsId}
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
        >
          <ShieldCheck size={15} className="shrink-0 text-good" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-fg">{t("claudeAssist.preflight.title")}</span>
            <span className="block truncate text-[0.6875rem] text-fg-3">{modelLabel}</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
              capUsd === null ? "border-warn/35 bg-warn/10 text-warn" : capUsd === undefined ? "border-line bg-card text-fg-3" : "border-accent/30 bg-accent/10 text-accent",
            )}
            data-claude-cap-chip="true"
          >
            {capText}
          </span>
          <ChevronDown size={14} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <dl
          id={detailsId}
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-t border-line/70 px-3 py-2.5 text-[0.6875rem] leading-relaxed"
        >
          <dt className="font-semibold text-fg-3">{t("claudeAssist.preflight.route")}</dt>
          <dd className="min-w-0 text-fg-2">{t("claudeAssist.preflight.routeValue")}</dd>
          {rows.map((row) => (
            <PreflightRow key={row.label} label={row.label} value={row.value} />
          ))}
          <dt className="font-semibold text-fg-3">{t("claudeAssist.preflight.cost")}</dt>
          <dd className="min-w-0 text-fg-2">
            {capUsd === undefined
              ? t("claudeAssist.preflight.costPending")
              : capUsd === null
                ? t("claudeAssist.preflight.costUnknown")
                : t("claudeAssist.preflight.costValue", { cost: formatClaudeUsd(capUsd) })}
            {info ? (
              <span className="mt-0.5 block text-fg-3">
                {t("claudeAssist.card.priceLine", { input: `$${info.inputUsdPerMTok}`, output: `$${info.outputUsdPerMTok}` })}
                {" · "}
                {t("claudeAssist.common.estimateNote", { date: CLAUDE_PRICE_AS_OF })}
              </span>
            ) : null}
          </dd>
          <dt className="font-semibold text-fg-3">{t("claudeAssist.preflight.failure")}</dt>
          <dd className="min-w-0 text-fg-2">{t("claudeAssist.preflight.failureValue")}</dd>
        </dl>
      </details>

      {summary ? (
        <p className="px-1 text-[0.6875rem] leading-relaxed text-fg-2" data-claude-preflight-summary="true">
          <span className="font-semibold text-fg">{t("claudeAssist.preflight.transfer")}</span>
          {" · "}
          {summary}
          <span className="mt-0.5 block text-fg-3">{t("claudeAssist.preflight.failureShort")}</span>
        </p>
      ) : null}

      {attention ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2" data-claude-budget-alert="true">
          <p className="flex items-start gap-2">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <span>
              {guard.verdict.kind === "exceeds"
                ? t("claudeAssist.budget.exceeds", {
                  limit,
                  remaining: formatClaudeUsd(guard.verdict.remainingUsd),
                  cap: formatClaudeUsd(guard.verdict.capUsd),
                })
                : t("claudeAssist.budget.unknown", {
                  limit,
                  remaining: formatClaudeUsd(guard.verdict.remainingUsd),
                })}
            </span>
          </p>
          {guard.unconfirmedRequests > 0 ? (
            <p className="text-fg-3" data-claude-unconfirmed="true">
              {t("claudeAssist.budget.unconfirmed", { count: guard.unconfirmedRequests, cost: formatClaudeUsd(guard.unconfirmedUsd) })}
            </p>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-fg">
            <input type="checkbox" checked={guard.overridden} onChange={(event) => guard.setOverridden(event.target.checked)} />
            {t("claudeAssist.budget.override")}
          </label>
        </div>
      ) : null}
    </div>
  );
}

function PreflightRow({ label, value }: ClaudePreflightRow) {
  return (
    <>
      <dt className="font-semibold text-fg-3">{label}</dt>
      <dd className="min-w-0 text-fg-2">{value}</dd>
    </>
  );
}
