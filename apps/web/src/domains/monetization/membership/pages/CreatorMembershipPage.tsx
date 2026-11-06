/**
 * CreatorMembershipPage.tsx
 *
 * 창작자용 멤버십 관리 페이지 (`/creator/membership`).
 * 티어 생성·수정, 멤버 수, 월 recurring 수익 추정치를 보여준다.
 */
// 수익화 i18n 네임스페이스는 셸 번들에서 분리됨 — 페이지 평가 시점에 동기 등록한다.
import "../../monetization-i18n";
import { Crown, Eye, Pencil, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useI18n, useT } from "@/shared/lib/i18n";
import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { LoadingState } from "@/shared/components/LoadingState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import {
  formatMembershipKrw,
  sumMonthlyRecurring,
  type MembershipTier,
} from "../models/membership-model";
import {
  listTiersByCreator,
  subscribeMembershipStore,
} from "../models/membership-store";
import { MembershipTierEditor } from "../components/MembershipTierEditor";
import { MembershipTierCard } from "../components/MembershipTierCard";
import { CreatorMonetizationNav } from "../../components/CreatorMonetizationNav";

const REVENUE_CTA = defineBilingualText(
  "creatorMembershipPage",
  "revenueCta",
  "수익 대시보드",
  "Revenue dashboard",
);

type TierPerkId = "early-access-3ep" | "psd-layer-vault" | "director-cut-commentary";
type RetentionGuardId = "annual-16pct-discount" | "pause-grace-30d" | "anniversary-badge-drop";

const TIER_PERK_OPTIONS: readonly {
  readonly id: TierPerkId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "early-access-3ep",
    ko: "3화 선공개 패스",
    en: "3-Episode Early Access",
    detailKo: "정식 연재 전 최대 3화 분량의 선공개 원고를 후원 등급별로 잠금 해제합니다.",
    detailEn: "Unlocks up to 3 preview episodes ahead of public release for active tier patrons.",
  },
  {
    id: "psd-layer-vault",
    ko: "원본 PSD·클립 금고",
    en: "PSD & CLIP Layer Vault",
    detailKo: "선화·채색·조명 레이어가 분리된 고해상도 PSD/CLIP 작업 파일 금고를 제공합니다.",
    detailEn: "Grants access to high-resolution layered PSD and CLIP source files with lighting passes.",
  },
  {
    id: "director-cut-commentary",
    ko: "디렉터스 컷 코멘터리",
    en: "Director's Cut Commentary",
    detailKo: "삭제 컷·연출 의도·콘티 메모가 담긴 작가 코멘터리 보드를 전용 공개합니다.",
    detailEn: "Shares exclusive creator commentary boards with deleted panels and storyboard notes.",
  },
];

const RETENTION_GUARD_OPTIONS: readonly {
  readonly id: RetentionGuardId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "annual-16pct-discount",
    ko: "연간 구독 16% 할인",
    en: "Annual 16% Discount",
    detailKo: "12개월 선결제 시 2개월분(약 16%) 할인 혜택으로 장기 구독 전환을 유도합니다.",
    detailEn: "Applies a 16% annual billing discount (2 months free) to boost long-term patron retention.",
  },
  {
    id: "pause-grace-30d",
    ko: "결제 유예·일시정지 30일",
    en: "30-Day Pause & Grace",
    detailKo: "휴재·결제 실패 시 누적 후원 개월 수를 잃지 않도록 30일 유예 기간을 보장합니다.",
    detailEn: "Preserves patron streak tenure for 30 days during creator hiatus or payment retry.",
  },
  {
    id: "anniversary-badge-drop",
    ko: "구독 기념 배지 드롭",
    en: "Anniversary Badge Drop",
    detailKo: "3·6·12개월 누적 후원 달성 시 펜카페·댓글 전용 한정판 엠블럼을 지급합니다.",
    detailEn: "Drops milestone supporter badges at 3, 6, and 12 months for Pencafe and comment profiles.",
  },
];

export function CreatorMembershipPage() {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const { data: session, ready, status } = useSession();
  const [tiers, setTiers] = useState<readonly MembershipTier[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  const [tierPerks, setTierPerks] = useState<TierPerkId>("early-access-3ep");
  const [retentionGuard, setRetentionGuard] = useState<RetentionGuardId>("annual-16pct-discount");

  const activePerk = TIER_PERK_OPTIONS.find((item) => item.id === tierPerks) ?? TIER_PERK_OPTIONS[0];
  const activeGuard = RETENTION_GUARD_OPTIONS.find((item) => item.id === retentionGuard) ?? RETENTION_GUARD_OPTIONS[0];

  const reaChurnBar = (
    <section
      data-testid="creator-membership-rea-churn-bar"
      aria-label={pickLang("멤버십 리텐션·혜택 설계 워크벤치", "Membership retention and perk design workbench")}
      className="mb-5 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-accent">
          {pickLang("REA 멤버십 혜택 · 이탈 방지 시뮬레이터", "REA Membership Perks & Churn Guard Simulator")}
        </span>
        <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-3">
          Pixiv Fanbox · Patreon · Naver Preview · Kakao Wait-Free
        </span>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={pickLang("핵심 티어 혜택", "Core tier perks")}
      >
        <span className="text-xs font-semibold text-fg-2">
          {pickLang("티어 혜택", "Tier Perks")}
        </span>
        {TIER_PERK_OPTIONS.map((item) => {
          const active = item.id === tierPerks;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`membership-rea-perk-${item.id}`}
              aria-pressed={active}
              onClick={() => setTierPerks(item.id)}
              className={
                active
                  ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>
      <div
        className="mt-2 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={pickLang("구독 유지 가드", "Retention guard")}
      >
        <span className="text-xs font-semibold text-fg-2">
          {pickLang("이탈 방지", "Retention Guard")}
        </span>
        {RETENTION_GUARD_OPTIONS.map((item) => {
          const active = item.id === retentionGuard;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`membership-rea-guard-${item.id}`}
              aria-pressed={active}
              onClick={() => setRetentionGuard(item.id)}
              className={
                active
                  ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>
      <p
        data-testid="creator-membership-rea-status"
        aria-live="polite"
        className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg"
      >
        {pickLang(
          `${activePerk.ko} + ${activeGuard.ko} · ${activePerk.detailKo} (${activeGuard.detailKo})`,
          `${activePerk.en} + ${activeGuard.en} · ${activePerk.detailEn} (${activeGuard.detailEn})`,
        )}
      </p>
    </section>
  );

  const creatorId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(creatorId);

  const refresh = useCallback(() => {
    if (creatorId) setTiers(listTiersByCreator(creatorId));
  }, [creatorId]);

  useEffect(() => {
    refresh();
    return subscribeMembershipStore(refresh);
  }, [refresh]);

  useDocumentTitle(t("membership.creatorPage.documentTitle"));

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTier(null);
    refresh();
  };

  if (!ready) {
    return (
      <Container className="py-16">
        <LoadingState label={t("membership.creatorPage.loading")} />
      </Container>
    );
  }

  if (!authenticated) {
    return (
      <Container className="py-10">
        <CreatorMonetizationNav current="/creator/membership" />
        {reaChurnBar}
        <div className="py-8 text-center">
          <Crown className="mx-auto h-10 w-10 text-fg-3/50" aria-hidden />
          <h1 className="mt-3 text-xl font-bold text-fg">{t("membership.creatorPage.title")}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-3">
            {t("membership.creatorPage.loginRequired")}
          </p>
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-membership", mode: "login" })}
            className={cn(buttonClass({ variant: "solid" }), "mt-4")}
          >
            {t("membership.creatorPage.login")}
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <CreatorMonetizationNav current="/creator/membership" />
      {reaChurnBar}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <Crown className="h-6 w-6 text-accent" aria-hidden />
            {t("membership.creatorPage.title")}
          </h1>
          <p className="mt-1 text-sm text-fg-3">{t("membership.creatorPage.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/creator/revenue" className={buttonClass({ variant: "ghost" })}>
            {t(REVENUE_CTA)}
          </a>
          <button
            type="button"
            onClick={() => { setEditingTier(null); setShowEditor((v) => !v); }}
            className={cn(buttonClass({ variant: "solid" }), "gap-1.5")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("membership.creatorPage.newTier")}
          </button>
        </div>
      </header>

      {tiers.length > 0 && (
        <p role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
            {t("membership.creatorPage.statusActive", { count: tiers.filter((tier) => tier.isActive).length })}
          </span>
          <a href="#creator-membership-preview" className="font-semibold text-accent hover:underline">
            {t("membership.creatorPage.previewTitle")}
          </a>
        </p>
      )}

      {tiers.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-fg-3">{t("membership.creatorPage.statTiers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{tiers.length}</p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-fg-3">{t("membership.creatorPage.statMembers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {tiers.reduce((sum, tier) => sum + tier.memberCount, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-fg-3">{t("membership.creatorPage.statMonthly")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {formatMembershipKrw(sumMonthlyRecurring(tiers))}
            </p>
          </div>
        </div>
      )}

      {showEditor && creatorId && (
        <div className="mt-6">
          <MembershipTierEditor
            creatorId={creatorId}
            editingTier={editingTier}
            onSaved={handleSaved}
            onCancel={() => { setShowEditor(false); setEditingTier(null); }}
          />
        </div>
      )}

      <section aria-label={t("membership.creatorPage.tierList")} className="mt-6">
        {tiers.length === 0 && !showEditor ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-fg-3/50" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fg">{t("membership.creatorPage.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-fg-3">
              {t("membership.creatorPage.emptyBody")}
            </p>
            <button
              type="button"
              onClick={() => { setEditingTier(null); setShowEditor(true); }}
              className={cn(buttonClass({ variant: "solid", size: "sm" }), "mt-4 gap-1.5")}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("membership.creatorPage.newTier")}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiers.map((tier, index) => {
              const isEditing = showEditor && editingTier?.id === tier.id;
              return (
                <MembershipTierCard
                  key={tier.id}
                  tier={tier}
                  index={index}
                  highlighted={isEditing}
                  footer={
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="flex items-center gap-1 text-xs tabular-nums text-fg-3">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {t("membership.creatorPage.tierMembers", { count: tier.memberCount })}
                      </span>
                      {isEditing ? (
                        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                          {t("membership.creatorPage.editingNow")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingTier(tier); setShowEditor(true); }}
                          className={cn(buttonClass({ variant: "outline", size: "sm" }), "gap-1.5")}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          {t("membership.creatorPage.edit")}
                        </button>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {tiers.length > 0 && (
        <section id="creator-membership-preview" aria-label={t("membership.creatorPage.previewTitle")} className="mt-10 scroll-mt-24">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg">
            <Eye className="h-5 w-5 text-accent" aria-hidden />
            {t("membership.creatorPage.previewTitle")}
          </h2>
          <p className="mt-1 text-sm text-fg-3">{t("membership.creatorPage.previewBody")}</p>
          {tiers.some((tier) => tier.isActive) ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tiers
                .filter((tier) => tier.isActive)
                .map((tier, index) => (
                  <MembershipTierCard key={tier.id} tier={tier} index={index} />
                ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-3">
              {t("membership.creatorPage.previewEmpty")}
            </p>
          )}
        </section>
      )}
    </Container>
  );
}
