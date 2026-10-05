/**
 * EarlyAccessReaderPreview.tsx
 *
 * 독자 뷰 미리보기 — 얼리 액세스 정책이 독자 화면에 어떻게 보이는지 보여준다.
 * 작품 페이지에 실제로 삽입되는 안내(TitleEarlyAccessNotice)를 그대로 재사용하고,
 * 회차 행은 실제 회차 목록이 아니라 정책 기준 시나리오다: 공개 시점을
 * 오늘·기간 중간·기간 경과로 잡아 실제 판정 함수(resolveEpisodeAccess)로
 * 일반 독자와 서포터 각각의 접근 상태를 계산해 보여준다.
 * 회차 제목·표지 같은 실재하지 않는 데이터는 만들지 않는다.
 */
import { Eye, Lock, Unlock, Zap } from "lucide-react";

import { getLang, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  NO_SUPPORTER_EVIDENCE,
  resolveEpisodeAccess,
  type EarlyAccessPolicy,
  type EpisodeAccessState,
} from "../models/paywall-model";
import { TitleEarlyAccessNotice } from "./TitleEarlyAccessNotice";

const SUPPORTER_EVIDENCE = { hasTipped: false, isMember: true } as const;
const DAY_MS = 86_400_000;

function formatDate(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

interface Scenario {
  readonly key: string;
  readonly labelKey: string;
  readonly labelValues?: { days: number };
  readonly publishedAt: string;
}

/** 정책 기간에서 시나리오 3종(오늘·기간 중간·기간 경과)의 공개 시점을 만든다. */
function buildScenarios(policy: EarlyAccessPolicy, now: Date): readonly Scenario[] {
  const days = policy.earlyAccessDays;
  const at = (offsetDays: number) => new Date(now.getTime() - offsetDays * DAY_MS).toISOString();
  const scenarios: Scenario[] = [
    { key: "today", labelKey: "paywall.preview.scenarioToday", publishedAt: at(0) },
  ];
  if (days >= 2) {
    const mid = Math.floor(days / 2);
    scenarios.push({
      key: "mid",
      labelKey: "paywall.preview.scenarioMid",
      labelValues: { days: mid },
      publishedAt: at(mid),
    });
  }
  scenarios.push({
    key: "open",
    labelKey: "paywall.preview.scenarioOpen",
    publishedAt: at(days + 1),
  });
  return scenarios;
}

function AccessChip({ access, audience }: { access: EpisodeAccessState; audience: "regular" | "supporter" }) {
  const t = useT();
  if (access.reason === "open") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-good/10 px-2.5 py-1 text-xs font-semibold text-good">
        <Unlock className="h-3.5 w-3.5" aria-hidden />
        {t("paywall.preview.open")}
      </span>
    );
  }
  if (audience === "supporter") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
        <Zap className="h-3.5 w-3.5" aria-hidden />
        {t("paywall.preview.supporterOpen")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn">
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {t("paywall.preview.locked", { days: access.daysUntilFree ?? 0 })}
    </span>
  );
}

export function EarlyAccessReaderPreview({
  policy,
  now = new Date(),
  className,
}: {
  readonly policy: EarlyAccessPolicy;
  readonly now?: Date;
  readonly className?: string;
}) {
  const t = useT();
  const lang = getLang();
  const scenarios = buildScenarios(policy, now);

  return (
    <section
      aria-label={t("paywall.preview.title")}
      className={cn("rounded-2xl border border-line bg-panel/50 p-4 sm:p-5", className)}
    >
      <h2 className="flex items-center gap-2 text-base font-bold text-fg">
        <Eye className="h-5 w-5 text-accent" aria-hidden />
        {t("paywall.preview.title")}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t("paywall.preview.subtitle")}</p>
      <p className="mt-3 text-sm font-semibold text-fg">{policy.titleName}</p>

      <div className="mt-3">
        <TitleEarlyAccessNotice titleId={policy.titleId} />
      </div>
      {!policy.enabled && (
        <p className="mt-3 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-muted">
          {t("paywall.preview.disabledNote")}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {scenarios.map((scenario) => {
          const regular = resolveEpisodeAccess({
            policy,
            publishedAt: scenario.publishedAt,
            evidence: NO_SUPPORTER_EVIDENCE,
            now,
          });
          const supporter = resolveEpisodeAccess({
            policy,
            publishedAt: scenario.publishedAt,
            evidence: SUPPORTER_EVIDENCE,
            now,
          });
          return (
            <li key={scenario.key} className="rounded-xl border border-line bg-bg p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-fg">
                  {t(scenario.labelKey, scenario.labelValues)}
                </p>
                <p className="text-xs tabular-nums text-muted">
                  {formatDate(scenario.publishedAt, lang)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">{t("paywall.preview.regularReader")}</span>
                  <AccessChip access={regular} audience="regular" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">{t("paywall.preview.supporter")}</span>
                  <AccessChip access={supporter} audience="supporter" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
