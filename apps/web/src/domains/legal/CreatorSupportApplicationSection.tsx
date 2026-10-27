import { BriefcaseBusiness, LogIn, ShieldCheck } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";

import {
  CREATOR_SUPPORT_CATEGORIES,
  CREATOR_SUPPORT_NEEDS,
  type CreatorSupportAgeBand,
  type CreatorSupportCategory,
  type CreatorSupportNeed,
} from "@toonstudio/core/creator-support";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

export interface CreatorSupportApplicationForm {
  category: CreatorSupportCategory;
  ageBand: CreatorSupportAgeBand;
  applicantRole: "self" | "guardian";
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: CreatorSupportNeed[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  guardianConfirmed: boolean;
  consentAccepted: boolean;
}

export type CreatorSupportSubmitStatus = {
  kind: "success" | "error";
  message: string;
} | null;

const NEED_KEY = (need: CreatorSupportNeed) => `creatorSupport.needs.${need}`;

export function CreatorSupportApplicationSection({
  sessionStatus,
  application,
  setApplication,
  toggleNeed,
  submitApplication,
  applicationBusy,
  applicationStatus,
}: {
  readonly sessionStatus: string;
  readonly application: CreatorSupportApplicationForm;
  readonly setApplication: Dispatch<SetStateAction<CreatorSupportApplicationForm>>;
  readonly toggleNeed: (need: CreatorSupportNeed) => void;
  readonly submitApplication: (event: FormEvent) => Promise<void>;
  readonly applicationBusy: boolean;
  readonly applicationStatus: CreatorSupportSubmitStatus;
}) {
  const t = useT();

  return (
    <>
      <section
        id="creator-support-apply"
        className="ux-deferred-section mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8"
        aria-labelledby="creator-support-apply-title"
      >
        <p className="text-xs font-bold tracking-[0.14em] text-accent">APPLY FOR SUPPORT</p>
        <h2 id="creator-support-apply-title" className="mt-1 text-2xl font-bold text-fg">
          {t("creatorSupport.apply.title")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
          {t("creatorSupport.apply.description")}
        </p>

        {sessionStatus === "authenticated" ? (
          <form onSubmit={submitApplication} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.apply.category")}
              <select
                value={application.category}
                onChange={(event) =>
                  setApplication((current) => ({
                    ...current,
                    category: event.target.value as CreatorSupportCategory,
                  }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              >
                {CREATOR_SUPPORT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`creatorSupport.filters.${category}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.apply.ageBand")}
              <select
                value={application.ageBand}
                onChange={(event) => {
                  const ageBand = event.target.value as CreatorSupportAgeBand;
                  setApplication((current) => ({
                    ...current,
                    ageBand,
                    applicantRole: ageBand === "under14_guardian" ? "guardian" : current.applicantRole,
                    guardianConfirmed: ageBand === "adult" ? false : current.guardianConfirmed,
                  }));
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              >
                <option value="adult">{t("creatorSupport.apply.ageAdult")}</option>
                <option value="youth_14_18">{t("creatorSupport.apply.ageYouth")}</option>
                <option value="under14_guardian">{t("creatorSupport.apply.ageUnder14")}</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.apply.applicantRole")}
              <select
                value={application.applicantRole}
                disabled={application.ageBand === "under14_guardian"}
                onChange={(event) =>
                  setApplication((current) => ({
                    ...current,
                    applicantRole: event.target.value as "self" | "guardian",
                  }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 disabled:opacity-60"
              >
                <option value="self">{t("creatorSupport.apply.self")}</option>
                <option value="guardian">{t("creatorSupport.apply.guardian")}</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.apply.budget")}
              <input
                type="number"
                min={0}
                max={100000000}
                step={10000}
                value={application.estimatedBudgetWon}
                onChange={(event) =>
                  setApplication((current) => ({
                    ...current,
                    estimatedBudgetWon: Number(event.target.value),
                  }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.apply.projectTitle")}
              <input
                maxLength={120}
                value={application.title}
                onChange={(event) =>
                  setApplication((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.apply.story")}
              <textarea
                rows={5}
                maxLength={3000}
                value={application.story}
                onChange={(event) =>
                  setApplication((current) => ({ ...current, story: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.apply.intendedUse")}
              <textarea
                rows={4}
                maxLength={2000}
                value={application.intendedUse}
                onChange={(event) =>
                  setApplication((current) => ({ ...current, intendedUse: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.apply.portfolio")}
              <input
                type="url"
                maxLength={500}
                value={application.portfolioUrl}
                onChange={(event) =>
                  setApplication((current) => ({ ...current, portfolioUrl: event.target.value }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              />
            </label>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold text-fg">
                {t("creatorSupport.apply.needs")}
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {CREATOR_SUPPORT_NEEDS.map((need) => (
                  <label key={need} className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2 text-sm text-fg-2">
                    <input
                      type="checkbox"
                      checked={application.supportNeeds.includes(need)}
                      onChange={() => toggleNeed(need)}
                    />
                    {t(NEED_KEY(need))}
                  </label>
                ))}
              </div>
            </fieldset>
            {application.ageBand !== "adult" ? (
              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm leading-6 text-fg-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={application.guardianConfirmed}
                  onChange={(event) =>
                    setApplication((current) => ({
                      ...current,
                      guardianConfirmed: event.target.checked,
                    }))
                  }
                />
                <span>{t("creatorSupport.apply.guardianConfirm")}</span>
              </label>
            ) : null}
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm leading-6 text-fg-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={application.consentAccepted}
                onChange={(event) =>
                  setApplication((current) => ({
                    ...current,
                    consentAccepted: event.target.checked,
                  }))
                }
              />
              <span>{t("creatorSupport.apply.consent")}</span>
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={applicationBusy}
                className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-60"
              >
                {t("creatorSupport.apply.submit")}
              </button>
              {applicationStatus ? (
                <p
                  role={applicationStatus.kind === "error" ? "alert" : "status"}
                  className="text-sm text-fg-2"
                >
                  {applicationStatus.message}
                </p>
              ) : null}
            </div>
          </form>
        ) : sessionStatus === "unauthenticated" ? (
          <div className="mt-6 rounded-2xl border border-line bg-panel/60 p-6">
            <LogIn className="size-6 text-accent" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold text-fg">
              {t("creatorSupport.apply.guestTitle")}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
              {t("creatorSupport.apply.guestBody")}
            </p>
            <button
              type="button"
              onClick={() =>
                requestAuthModalOpen({
                  reason: "protected-action",
                  source: "creator-support-apply",
                })
              }
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent"
            >
              <LogIn size={16} aria-hidden="true" />
              {t("creatorSupport.apply.guestAction")}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-fg-3" role="status">
            {t("creatorSupport.apply.sessionChecking")}
          </p>
        )}
      </section>

      <section className="ux-deferred-section mt-6 rounded-3xl border border-line bg-panel/55 p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-fg">{t("creatorSupport.safety.title")}</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">{t("creatorSupport.safety.body")}</p>
            <p className="mt-3 text-sm leading-7 text-fg-3">{t("creatorSupport.safety.money")}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
              <Link href="/privacy" className="text-accent hover:underline">{t("creatorSupport.safety.privacy")}</Link>
              <Link href="/business?type=sponsorship" className="text-accent hover:underline">
                <BriefcaseBusiness size={14} className="mr-1 inline" aria-hidden="true" />
                {t("creatorSupport.safety.sponsorship")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
