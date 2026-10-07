/**
 * CreatorMembershipPage.tsx
 *
 * 창작자용 멤버십 관리 페이지 (`/creator/membership`).
 * 티어 생성·수정, 멤버 수, 월 recurring 수익 추정치를 보여준다.
 */
import { Crown, Eye, Pencil, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
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

export function CreatorMembershipPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [tiers, setTiers] = useState<readonly MembershipTier[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);

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
      <Container className="py-16 text-center">
        <Crown className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("membership.creatorPage.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("membership.creatorPage.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-membership", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4")}
        >
          {t("membership.creatorPage.login")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <Crown className="h-6 w-6 text-accent" aria-hidden />
            {t("membership.creatorPage.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("membership.creatorPage.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingTier(null); setShowEditor((v) => !v); }}
          className={cn(buttonClass({ variant: "solid" }), "gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("membership.creatorPage.newTier")}
        </button>
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
            <p className="text-xs text-muted">{t("membership.creatorPage.statTiers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{tiers.length}</p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-muted">{t("membership.creatorPage.statMembers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {tiers.reduce((sum, tier) => sum + tier.memberCount, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-muted">{t("membership.creatorPage.statMonthly")}</p>
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
            <Users className="mx-auto h-8 w-8 text-muted/50" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fg">{t("membership.creatorPage.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
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
                      <span className="flex items-center gap-1 text-xs tabular-nums text-muted">
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
          <p className="mt-1 text-sm text-muted">{t("membership.creatorPage.previewBody")}</p>
          {tiers.some((tier) => tier.isActive) ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tiers
                .filter((tier) => tier.isActive)
                .map((tier, index) => (
                  <MembershipTierCard key={tier.id} tier={tier} index={index} />
                ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t("membership.creatorPage.previewEmpty")}
            </p>
          )}
        </section>
      )}
    </Container>
  );
}
