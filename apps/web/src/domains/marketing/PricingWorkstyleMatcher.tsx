/**
 * 요금제 3초 작업 스타일 맞춤 등급 진단기 컴포넌트.
 *
 * - 4개 작업 스타일 원클릭 프리셋 + 초경량 협업 인원(1~10명)·마켓 판매/고해상도 토글.
 * - 추정 가격·결제 CTA 없이 `MEMBERSHIP_PLAN_POLICIES` 실측 수치만 표시하며
 *   무료 시작(`/studio/new`) 또는 멤버십 정책(`/membership`)으로 연결한다.
 */

import { ArrowRight, Check, Minus, Plus, SlidersHorizontal, Sparkles, Users } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  clampCollaborators,
  formatPolicyNumber,
  getDefaultInputForWorkstyle,
  MAX_COLLABORATORS,
  MIN_COLLABORATORS,
  PRICING_WORKSTYLE_PRESETS,
  type PricingWorkstyleInput,
  type PricingWorkstyleMatch,
} from "./pricing-workstyle-matcher";
import "./pricing-workstyle-matcher.css";

export interface PricingWorkstyleMatcherProps {
  readonly input: PricingWorkstyleInput;
  readonly match: PricingWorkstyleMatch;
  readonly onChangeInput: (next: PricingWorkstyleInput) => void;
}

export function PricingWorkstyleMatcher({
  input,
  match,
  onChangeInput,
}: PricingWorkstyleMatcherProps) {
  const t = useBilingual("pricingWorkstyleMatcher");

  const handleDecreaseCollaborators = () => {
    onChangeInput({
      ...input,
      collaborators: clampCollaborators(input.collaborators - 1),
    });
  };

  const handleIncreaseCollaborators = () => {
    onChangeInput({
      ...input,
      collaborators: clampCollaborators(input.collaborators + 1),
    });
  };

  const handleToggleMarketHiRes = () => {
    onChangeInput({
      ...input,
      needsMarketOrHiRes: !input.needsMarketOrHiRes,
    });
  };

  return (
    <section
      data-testid="pricing-workstyle-matcher"
      data-tone={match.tone}
      aria-label={t("3초 작업 스타일 맞춤 등급 진단기", "3-second workstyle tier matcher")}
      className="pricing-matcher mb-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-bold text-fg sm:text-base [word-break:keep-all]">
            {t("3초 작업 스타일 맞춤 등급 찾기", "Find your fit in 3 seconds")}
          </h2>
        </div>
        <span className="text-xs font-medium text-fg-3 [word-break:keep-all]">
          {t("실제 정책 한도 기준 · 결제 없이 비교", "Grounded in live policy limits · No billing")}
        </span>
      </div>

      {/* 1초 만에 이해되는 4개 작업 형태 원클릭 프리셋 */}
      <div
        role="group"
        aria-label={t("작업 형태 선택", "Choose your workstyle")}
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {PRICING_WORKSTYLE_PRESETS.map((preset) => {
          const pressed = input.workstyle === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`workstyle-preset-${preset.id}`}
              data-tone={preset.tone}
              aria-pressed={pressed}
              onClick={() => onChangeInput(getDefaultInputForWorkstyle(preset.id))}
              className="pricing-matcher-preset flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl px-3 py-2 text-left [word-break:keep-all]"
            >
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <span aria-hidden="true" className="pricing-matcher-dot" />
                <span>{t(preset.labelKo, preset.labelEn)}</span>
              </span>
              <span className="text-[0.7rem] leading-snug text-fg-3">
                {t(preset.summaryKo, preset.summaryEn)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 초경량 1행 세부 조절(320px에서는 자연 줄바꿈, 가로 넘침 0) */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2 [word-break:keep-all]">
            <Users size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
            {t("협업 인원", "Collaborators")}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              data-testid="workstyle-collab-decrease"
              aria-label={t("협업 인원 1명 줄이기", "Decrease collaborators by 1")}
              disabled={input.collaborators <= MIN_COLLABORATORS}
              onClick={handleDecreaseCollaborators}
              className="pricing-matcher-step-btn inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg"
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <span
              data-testid="workstyle-collab-value"
              className="min-w-12 text-center text-xs font-bold text-fg tabular-nums"
            >
              {t(`${match.collaborators}명`, `${match.collaborators}`)}
            </span>
            <button
              type="button"
              data-testid="workstyle-collab-increase"
              aria-label={t("협업 인원 1명 늘리기", "Increase collaborators by 1")}
              disabled={input.collaborators >= MAX_COLLABORATORS}
              onClick={handleIncreaseCollaborators}
              className="pricing-matcher-step-btn inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          data-testid="workstyle-market-hires-toggle"
          aria-pressed={input.needsMarketOrHiRes}
          onClick={handleToggleMarketHiRes}
          className="pricing-matcher-toggle inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold [word-break:keep-all]"
        >
          {input.needsMarketOrHiRes ? (
            <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
          ) : (
            <SlidersHorizontal size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
          )}
          <span>{t("마켓 판매·고해상도 내보내기 필요", "Need market selling & hi-res export")}</span>
        </button>
      </div>

      {/* 실시간 진단 결과 & 실제 MEMBERSHIP_PLAN_POLICIES 수치 */}
      <div
        data-testid="pricing-matcher-result"
        data-matched-plan-id={match.planId}
        aria-live="polite"
        className="pricing-matcher-result mt-3 rounded-xl p-3.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pricing-matcher-plan-pill inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold">
                {t(`맞춤 등급: ${match.planLabel}`, `Best fit: ${match.planLabel}`)}
              </span>
              <span className="text-[0.72rem] font-medium text-fg-3 [word-break:keep-all]">
                {match.planId === "free"
                  ? t("상시 무료", "Always free")
                  : t("베타 기간 무료 · 정식 요금 추후 안내", "Free during beta · Official pricing later")}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              {t(match.reasonKo, match.reasonEn)}
            </p>
          </div>

          <Link
            href={match.ctaHref}
            data-testid="pricing-matcher-cta"
            className="pricing-matcher-cta inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold [word-break:keep-all]"
          >
            <span>{t(match.ctaLabelKo, match.ctaLabelEn)}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="pricing-matcher-metric rounded-lg px-2.5 py-2">
            <dt className="text-[0.68rem] font-medium text-fg-3 [word-break:keep-all]">
              {t("저장공간", "Storage")}
            </dt>
            <dd className="mt-0.5 text-xs font-bold text-fg tabular-nums">
              {match.metrics.storageLabel}
            </dd>
          </div>
          <div className="pricing-matcher-metric rounded-lg px-2.5 py-2">
            <dt className="text-[0.68rem] font-medium text-fg-3 [word-break:keep-all]">
              {t("AI 월 토큰", "Monthly AI tokens")}
            </dt>
            <dd className="mt-0.5 text-xs font-bold text-fg tabular-nums">
              {formatPolicyNumber(match.metrics.aiMonthlyTokens)}
            </dd>
          </div>
          <div className="pricing-matcher-metric rounded-lg px-2.5 py-2">
            <dt className="text-[0.68rem] font-medium text-fg-3 [word-break:keep-all]">
              {t("월 크레딧", "Monthly credits")}
            </dt>
            <dd className="mt-0.5 text-xs font-bold text-fg tabular-nums">
              {formatPolicyNumber(match.metrics.creditMonthlyIncluded)}
            </dd>
          </div>
          <div className="pricing-matcher-metric rounded-lg px-2.5 py-2">
            <dt className="text-[0.68rem] font-medium text-fg-3 [word-break:keep-all]">
              {t("협업 한도 · 마켓", "Team limit · Market")}
            </dt>
            <dd className="mt-0.5 text-xs font-bold text-fg tabular-nums [word-break:keep-all]">
              {t(
                `${formatPolicyNumber(match.metrics.collaborationMembers)}명 · ${match.metrics.marketSell ? "지원" : "미지원"}`,
                `${formatPolicyNumber(match.metrics.collaborationMembers)} · ${match.metrics.marketSell ? "Yes" : "No"}`,
              )}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
