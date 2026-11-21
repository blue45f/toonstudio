/**
 * TitleDetailQuickDecisionRibbon.tsx — /title/:slug 3초 작품 결정 & 페이스 리본.
 *
 * 실제 작품 메타(회차 수·장르·연재 상태·무료 감상처)만을 바탕으로 완독 예상 시간(회당 3분 추정),
 * 추천 읽기 페이스(출퇴근 10분 / 주말 정주행), 1클릭 1화 읽기·3컷 리믹스 브리지를 한눈에 제공한다.
 */

import { ArrowRight, ArrowUpRight, BookOpen, Clock, Layers, Sparkles } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ThreeCutRemixBlueprint } from "@/shared/lib/title-to-three-cut-remix-bridge";
import type { Title } from "@/shared/lib/types";
import Link from "@/shared/navigation/router-link";

import type { TitleEpisode } from "../title-episodes";
import "./catalog-wave4-fresh-ideas.css";
import {
  buildTitleQuickDecision,
  type TitleReadingPaceId,
} from "./title-detail-decision-model";

export interface TitleDetailQuickDecisionRibbonProps {
  readonly title: Pick<Title, "slug" | "genres" | "status" | "totalEpisodes" | "availability">;
  readonly episodes?: readonly TitleEpisode[];
  readonly showAvailability: boolean;
  readonly firstEpisodeHref: string | null;
  readonly remixBlueprint: ThreeCutRemixBlueprint;
}

export function TitleDetailQuickDecisionRibbon({
  title,
  episodes,
  showAvailability,
  firstEpisodeHref,
  remixBlueprint,
}: TitleDetailQuickDecisionRibbonProps) {
  const bt = useBilingual("TitleDetailQuickDecisionRibbon");
  const model = useMemo(
    () =>
      buildTitleQuickDecision({
        title,
        episodes,
        showAvailability,
        firstEpisodeHref,
        remixBlueprint,
      }),
    [title, episodes, showAvailability, firstEpisodeHref, remixBlueprint],
  );

  const [paceOverride, setPaceOverride] = useState<{
    readonly slug: string;
    readonly paceId: TitleReadingPaceId;
  } | null>(null);

  const activePaceId: TitleReadingPaceId =
    paceOverride?.slug === title.slug ? paceOverride.paceId : model.recommendedPaceId;
  const activePlan =
    model.pacePlans.find((plan) => plan.id === activePaceId) ?? model.pacePlans[0];

  const freeBadgeTone =
    model.freeEntryKind === "free"
      ? "border-good/45 bg-good-soft text-good"
      : model.freeEntryKind === "wait-free"
        ? "border-cool/45 bg-info-soft text-cool"
        : "border-line bg-card text-fg-2";

  return (
    <section
      aria-labelledby="title-quick-decision-heading"
      data-testid="title-quick-decision-ribbon"
      style={{ "--w4-spectrum": model.spectrumCss } as CSSProperties}
      className="catalog-w4-card mt-5 p-4 sm:p-5"
    >
      <span aria-hidden="true" className="catalog-w4-spectrum-strip" />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* 좌측: 3초 핵심 판단 정보 + 페이스 선택 */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="title-quick-decision-heading"
              className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]"
            >
              <Clock size={15} strokeWidth={1.6} className="shrink-0 text-accent" aria-hidden="true" />
              {bt("3초 작품 결정 · 읽기 페이스", "3-second read check & pace")}
            </h2>
            <span className="inline-flex items-center rounded-md border border-line bg-card px-2 py-0.5 text-xs font-medium text-fg-2">
              {bt(model.statusBadgeKo, model.statusBadgeEn)}
            </span>
            <span
              data-testid="title-decision-free-badge"
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${freeBadgeTone}`}
            >
              {bt(model.freeEntryLabelKo, model.freeEntryLabelEn)}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p
              data-testid="title-decision-duration"
              className="text-base font-semibold tabular-nums text-fg [word-break:keep-all]"
            >
              {bt(model.durationLabelKo, model.durationLabelEn)}
            </p>
            <p className="text-xs tabular-nums text-fg-3 [word-break:keep-all]">
              {bt(model.episodeMetaKo, model.episodeMetaEn)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div
              role="group"
              aria-label={bt("추천 읽기 페이스 선택", "Choose reading pace")}
              className="flex flex-wrap items-center gap-2"
            >
              {model.pacePlans.map((plan) => {
                const pressed = plan.id === activePaceId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    data-testid={`title-pace-option-${plan.id}`}
                    aria-pressed={pressed}
                    onClick={() => setPaceOverride({ slug: title.slug, paceId: plan.id })}
                    style={{
                      "--w4-tone": plan.id === "commute-10m" ? "var(--color-cool)" : "var(--color-accent)",
                    } as CSSProperties}
                    className="catalog-w4-chip inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold [word-break:keep-all]"
                  >
                    <span>{bt(plan.labelKo, plan.labelEn)}</span>
                    {plan.recommended ? (
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                        {bt("추천", "Pick")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p
              data-testid="title-decision-pace-summary"
              className="text-xs leading-relaxed tabular-nums text-fg-2 [word-break:keep-all]"
            >
              {bt(activePlan.summaryKo, activePlan.summaryEn)}
            </p>
          </div>
        </div>

        {/* 우측: 1클릭 1화 바로 읽기 + 3컷 리믹스 브리지 */}
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {model.readFirstAction.kind === "internal" ? (
            <Link
              href={model.readFirstAction.href}
              data-testid="title-decision-read-first"
              className="catalog-w4-action inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent hover:bg-accent-2 [word-break:keep-all]"
            >
              <BookOpen size={15} strokeWidth={1.6} aria-hidden="true" />
              {bt(model.readFirstAction.labelKo, model.readFirstAction.labelEn)}
              <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
            </Link>
          ) : model.readFirstAction.kind === "external" ? (
            <a
              href={model.readFirstAction.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="title-decision-read-first"
              aria-label={
                model.readFirstAction.platformName
                  ? `${bt(model.readFirstAction.labelKo, model.readFirstAction.labelEn)} (${model.readFirstAction.platformName})`
                  : bt(model.readFirstAction.labelKo, model.readFirstAction.labelEn)
              }
              className="catalog-w4-action inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent hover:bg-accent-2 [word-break:keep-all]"
            >
              <BookOpen size={15} strokeWidth={1.6} aria-hidden="true" />
              {bt(model.readFirstAction.labelKo, model.readFirstAction.labelEn)}
              <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
            </a>
          ) : (
            <a
              href={model.readFirstAction.href}
              data-testid="title-decision-read-first"
              className="catalog-w4-action inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent hover:bg-accent-2 [word-break:keep-all]"
            >
              <Layers size={15} strokeWidth={1.6} aria-hidden="true" />
              {bt(model.readFirstAction.labelKo, model.readFirstAction.labelEn)}
            </a>
          )}

          <Link
            href={model.remixHref}
            data-testid="title-decision-three-cut-remix"
            className="catalog-w4-action inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg hover:border-accent hover:text-accent [word-break:keep-all]"
          >
            <Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
            {bt(model.remixLabelKo, model.remixLabelEn)}
            <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
