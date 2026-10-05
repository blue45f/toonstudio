import {
  ExternalLink,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, type AdminApiError } from "./admin-client";
import { AdminEmptyState, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

type ReviewStatus = "submitted" | "reviewing" | "approved" | "rejected" | "on_hold";
type PayoutStatus = "not_ready" | "contract_required" | "kyc_required" | "ready" | "blocked";

interface CreatorSupportAdminItem {
  id: string;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string | null;
  category: string;
  ageBand: string;
  applicantRole: string;
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: string[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  guardianConfirmed: boolean;
  status: ReviewStatus;
  reviewNote: string;
  payoutStatus: PayoutStatus;
  monetarySupportEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
interface CreatorSupportAdminResponse {
  items: CreatorSupportAdminItem[];
  payout: {
    ready: boolean;
    requested: boolean;
    disabledReason: string | null;
  };
}

const STATUS_FILTERS: Array<ReviewStatus | "all"> = [
  "all",
  "submitted",
  "reviewing",
  "approved",
  "on_hold",
  "rejected",
];

const PAYOUT_OPTIONS: PayoutStatus[] = [
  "not_ready",
  "contract_required",
  "kyc_required",
  "ready",
  "blocked",
];

const formatWon = (amount: number) => `₩${amount.toLocaleString(getCurrentUiLocale())}`;

export function AdminCreatorSupport({ uid }: { uid: string }) {
  const t = useT();
  const [filter, setFilter] = useState<ReviewStatus | "all">("submitted");
  const [data, setData] = useState<CreatorSupportAdminResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, {
    status: ReviewStatus;
    payoutStatus: PayoutStatus;
    monetarySupportEnabled: boolean;
    reviewNote: string;
  }>>({});
  const load = useCallback(() => {
    setError("");
    const query = filter === "all" ? "" : `?status=${filter}`;
    adminFetch<CreatorSupportAdminResponse>(
      `/creator-support/applications${query}`,
      uid,
    )
      .then((next) => {
        setData(next);
        setDrafts(Object.fromEntries(next.items.map((item) => [
          item.id,
          {
            status: item.status,
            payoutStatus: item.payoutStatus,
            monetarySupportEnabled: item.monetarySupportEnabled,
            reviewNote: item.reviewNote ?? "",
          },
        ])));
      })
      .catch((requestError: AdminApiError) => setError(requestError.message));
  }, [filter, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const patchDraft = (
    id: string,
    patch: Partial<(typeof drafts)[string]>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          status: "submitted",
          payoutStatus: "not_ready",
          monetarySupportEnabled: false,
          reviewNote: "",
        }),
        ...patch,
      },
    }));
  };
  const save = async (item: CreatorSupportAdminItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    setBusyId(item.id);
    setError("");
    try {
      await adminFetch(
        `/creator-support/applications/${encodeURIComponent(item.id)}/review`,
        uid,
        {
          method: "POST",
          body: JSON.stringify(draft),
        },
      );
      load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              CREATOR SUPPORT REVIEW
            </p>
            <h2 className="mt-1 text-xl font-bold text-fg">{t("admin.creatorSupport.title")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-3">
              {t("admin.creatorSupport.desc")}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
            data?.payout.ready
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-line bg-panel text-fg-3"
          }`}>
            {data?.payout.ready ? t("admin.creatorSupport.payoutReady") : t("admin.creatorSupport.payoutInactive")}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-3"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-bad">
            <span>{error}</span>
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={load}
            >
              {t("admin.creatorSupport.retry")}
            </button>
          </p>
        ) : null}
      </section>

      {!data ? (
        <AdminSpinner />
      ) : data.items.length === 0 ? (
        <AdminEmptyState title={t("admin.creatorSupport.empty")} />
      ) : (
        <div className="grid gap-4">
          {data.items.map((item) => {
            const draft = drafts[item.id];
            if (!draft) return null;
            return (
              <article key={item.id} className="rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-panel px-2.5 py-1 text-fg-2">{item.category}</span>
                      <span className="rounded-full bg-panel px-2.5 py-1 text-fg-2">{item.ageBand}</span>
                      <span className="rounded-full bg-panel px-2.5 py-1 text-fg-2">{item.applicantRole}</span>
                    </div>
                    <h2 className="mt-3 text-lg font-bold text-fg">{item.title}</h2>
                    <p className="mt-1 text-sm text-accent">
                      {item.creatorName ?? item.creatorId}
                      {item.creatorEmail ? ` · ${item.creatorEmail}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-fg-3">
                    <p>{formatWon(item.estimatedBudgetWon)}</p>
                    <p className="mt-1">{new Date(item.createdAt).toLocaleString(getCurrentUiLocale())}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-line bg-panel/60 p-4">
                      <p className="text-xs font-bold text-fg-3">{t("admin.creatorSupport.story")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg-2">
                        {item.story}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-panel/60 p-4">
                      <p className="text-xs font-bold text-fg-3">{t("admin.creatorSupport.helpNeeded")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg-2">
                        {item.intendedUse}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.supportNeeds.map((need) => (
                          <span key={need} className="rounded-full border border-line bg-card px-2.5 py-1 text-xs text-fg-3">
                            {need}
                          </span>
                        ))}
                      </div>
                    </div>
                    {item.portfolioUrl ? (
                      <a
                        href={item.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                      >
                        {t("admin.creatorSupport.portfolio")} <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-xl border border-line bg-panel/45 p-4">
                    <label className="block text-xs font-semibold text-fg-3">
                      {t("admin.creatorSupport.reviewStatus")}
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          patchDraft(item.id, { status: event.target.value as ReviewStatus })
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg"
                      >
                        {STATUS_FILTERS.filter((value) => value !== "all").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-fg-3">
                      {t("admin.creatorSupport.payoutStatus")}
                      <select
                        value={draft.payoutStatus}
                        onChange={(event) =>
                          patchDraft(item.id, { payoutStatus: event.target.value as PayoutStatus })
                        }
                        className="mt-1 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg"
                      >
                        {PAYOUT_OPTIONS.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-start gap-3 rounded-lg border border-line bg-card p-3 text-sm text-fg-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={draft.monetarySupportEnabled}
                        onChange={(event) =>
                          patchDraft(item.id, {
                            monetarySupportEnabled: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {t("admin.creatorSupport.monetaryEnable")}
                        <small className="mt-1 block text-fg-3">
                          {t("admin.creatorSupport.monetaryNote")}
                        </small>
                      </span>
                    </label>
                    <label className="block text-xs font-semibold text-fg-3">
                      {t("admin.creatorSupport.reviewNote")}
                      <textarea
                        rows={4}
                        maxLength={1000}
                        value={draft.reviewNote}
                        onChange={(event) =>
                          patchDraft(item.id, { reviewNote: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void save(item)}
                      className={adminButtonClass("accent")}
                    >
                      <Save size={14} aria-hidden="true" />
                      {t("admin.creatorSupport.saveReview")}
                    </button>
                  </div>
                </div>
                {item.ageBand !== "adult" ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs leading-5 text-fg-3">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    {t("admin.creatorSupport.guardianNote", { status: item.guardianConfirmed ? t("admin.creatorSupport.guardianConfirmed") : t("admin.creatorSupport.guardianUnconfirmed") })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
