import { BadgeCheck, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, getApiErrorMessage } from "@/platform/api";

import { AdminEmptyState, AdminSpinner } from "./admin-ui";

import { useT } from "@/shared/lib/i18n";
import type { BusinessVerificationStatus } from "@/shared/lib/types";

interface BusinessVerificationItem {
  profile: {
    userId: string;
    organization: string;
    website: string;
    contactEmail: string;
    evidenceNote: string;
    verificationStatus: BusinessVerificationStatus;
    reviewNote: string;
    updatedAt: string;
  };
  userName: string | null;
  userEmail: string | null;
}

const STATUS_KEYS: Record<BusinessVerificationStatus, string> = {
  draft: "admin.verifications.statusDraft",
  pending: "admin.verifications.statusPending",
  verified: "admin.verifications.statusVerified",
  rejected: "admin.verifications.statusRejected",
};

export function AdminBusinessVerifications() {
  const t = useT();
  const [status, setStatus] = useState<BusinessVerificationStatus | "all">("pending");
  const [items, setItems] = useState<BusinessVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<{ items: BusinessVerificationItem[] }>(
        "/admin/creator-ecosystem/business-verifications",
        { params: { status: status === "all" ? undefined : status } },
      );
      setItems(result.items);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, t("admin.verifications.loadError")));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    userId: string,
    nextStatus: "verified" | "rejected",
  ) {
    const reviewNote = nextStatus === "rejected"
      ? window.prompt(t("admin.verifications.rejectReasonPrompt"), "") ?? ""
      : "";
    if (nextStatus === "rejected" && !reviewNote.trim()) return;
    setUpdating(userId);
    setError("");
    try {
      await api.patch(
        `/admin/creator-ecosystem/business-verifications/${encodeURIComponent(userId)}`,
        { status: nextStatus, reviewNote },
      );
      await load();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, t("admin.verifications.updateError")));
    } finally {
      setUpdating("");
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="business-verification-title">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Creator IP business verification</p>
          <h2 id="business-verification-title" className="mt-1 text-xl font-bold text-fg">{t("admin.verifications.title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {t("admin.verifications.desc")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-fg-3">
            {t("admin.verifications.statusLabel")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as BusinessVerificationStatus | "all")}
              className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg"
            >
              <option value="all">{t("admin.verifications.all")}</option>
              {Object.entries(STATUS_KEYS).map(([value, labelKey]) => (
                <option key={value} value={value}>{t(labelKey)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg-2 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            {t("admin.verifications.refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? <AdminSpinner /> : null}

      <div className="grid gap-4">
        {items.map(({ profile, userName, userEmail }) => (
          <article key={profile.userId} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
                    {t(STATUS_KEYS[profile.verificationStatus])}
                  </span>
                  <span className="text-xs text-fg-3">{userName || userEmail || profile.userId}</span>
                </div>
                <h3 className="mt-3 text-lg font-black text-fg">{profile.organization}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a className="font-semibold text-accent hover:underline" href={`mailto:${profile.contactEmail}`}>
                    {profile.contactEmail}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 text-fg-2 hover:text-accent"
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("admin.verifications.website")} <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-panel p-4 text-sm leading-6 text-fg-2">
              {profile.evidenceNote}
            </p>
            {profile.reviewNote ? (
              <p className="mt-3 text-xs text-fg-3">{t("admin.verifications.reviewNotePrefix", { note: profile.reviewNote })}</p>
            ) : null}
            {profile.verificationStatus === "pending" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={updating === profile.userId}
                  onClick={() => void review(profile.userId, "verified")}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-bold disabled:opacity-60"
                >
                  <BadgeCheck size={15} aria-hidden="true" /> {t("admin.verifications.approve")}
                </button>
                <button
                  type="button"
                  disabled={updating === profile.userId}
                  onClick={() => void review(profile.userId, "rejected")}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold disabled:opacity-60"
                >
                  <ShieldAlert size={15} aria-hidden="true" /> {t("admin.verifications.reject")}
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {!loading && !error && items.length === 0 ? (
          <AdminEmptyState icon={<BadgeCheck size={20} />} title={t("admin.verifications.empty")} />
        ) : null}
      </div>
    </section>
  );
}
