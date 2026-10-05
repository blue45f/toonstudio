import { AlertTriangle, History, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

type PolicyChange = {
  revision: number | string;
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
  beforeActive: boolean | null;
  afterActive: boolean | null;
  changedBy: string | null;
  changedAt: string;
};

type PendingRecovery = {
  id: string;
  userId: string;
  activity: string;
  sourceRef: string;
  reason: string;
  requestedAmount: number | string;
  reversedAmount: number | string;
  pendingAmount: number | string;
  actorUserId: string | null;
  createdAt: string;
};

export function AdminMembershipOperations({ uid }: { uid: string }) {
  const t = useT();
  const [history, setHistory] = useState<PolicyChange[] | null>(null);
  const [recoveries, setRecoveries] = useState<PendingRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [policyHistory, pendingRecoveries] = await Promise.all([
        adminFetch<{ items: PolicyChange[] }>(
          "/membership/operations/policy-history?limit=30",
          uid,
        ),
        adminFetch<{ items: PendingRecovery[] }>(
          "/membership/operations/pending-recoveries?limit=30",
          uid,
        ),
      ]);
      setHistory(policyHistory.items);
      setRecoveries(pendingRecoveries.items);
    } catch (loadError) {
      setError((loadError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!history || !recoveries) {
    if (error) {
      return (
        <AdminNotice
          title={t("admin.membershipOps.errorTitle")}
          body={error}
        />
      );
    }
    return <AdminSpinner />;
  }

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <History size={16} /> {t("admin.membershipOps.historyTitle")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {t("admin.membershipOps.historyDesc")}
            </p>
          </div>
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void load()}
          >
            <RefreshCw size={13} /> {t("admin.membershipOps.refresh")}
          </button>
        </div>

        {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {history.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-fg-3">
              {t("admin.membershipOps.historyEmpty")}
            </p>
          ) : (
            history.map((item) => (
              <div
                key={String(item.revision)}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-semibold text-fg">{item.key}</code>
                  <span className="text-fg-3">rev {String(item.revision)}</span>
                </div>
                <p className="mt-2 break-all font-mono text-[0.68rem] leading-5 text-fg-3">
                  {JSON.stringify(item.beforeValue)} → {JSON.stringify(item.afterValue)}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {new Date(item.changedAt).toLocaleString(getCurrentUiLocale())}
                  {item.changedBy ? ` · ${item.changedBy}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-fg">
          <AlertTriangle size={16} /> {t("admin.membershipOps.recoveryTitle")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {t("admin.membershipOps.recoveryDesc")}
        </p>
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {recoveries.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-good">
              {t("admin.membershipOps.recoveryEmpty")}
            </p>
          ) : (
            recoveries.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{item.userId}</span>
                  <span className="font-black text-warn">
                    {Number(item.pendingAmount).toLocaleString(getCurrentUiLocale())} P
                  </span>
                </div>
                <p className="mt-1 text-fg-3">
                  {item.activity} · {item.reason}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {t("admin.membershipOps.recoveryAmounts", { requested: Number(item.requestedAmount).toLocaleString(getCurrentUiLocale()), reversed: Number(item.reversedAmount).toLocaleString(getCurrentUiLocale()) })} ·
                  {new Date(item.createdAt).toLocaleString(getCurrentUiLocale())}
                </p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
