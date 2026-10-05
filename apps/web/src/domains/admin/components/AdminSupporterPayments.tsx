import {
  ExternalLink,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  adminFetch,
  type AdminApiError,
} from "./admin-client";
import { AdminCard, AdminEmptyState, AdminSpinner, AdminTableWrap, StatusBadge } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

interface SupporterPaymentItem {
  id: string;
  orderId: string;
  amount: number;
  balanceAmount: number;
  currency: string;
  status: string;
  mode: "test" | "live";
  supporterName: string;
  visibility: "anonymous" | "name";
  showAmount: boolean;
  showMessage: boolean;
  canResync: boolean;
  publicHidden: boolean;
  message: string;
  method: string;
  receiptUrl: string;
  cancelReason: string;
  approvedAt: string | null;
  canceledAt: string | null;
  webhookVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface SupporterPaymentListResponse {
  items: SupporterPaymentItem[];
  total: number;
  summary: {
    totalAmount: number;
    doneCount: number;
    waitingCount: number;
    canceledCount: number;
  };
}

interface SupporterFundingSettings {
  id: string;
  monthlyGoalAmount: number;
  publicWallEnabled: boolean;
  updatedAt: string | Date;
}

const FILTERS = [
  "all",
  "READY",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
] as const;

const formatWon = (amount: number) => `₩${amount.toLocaleString(getCurrentUiLocale())}`;

const SUPPORTER_STATUS_KEYS: Readonly<Record<string, string>> = {
  READY: "admin.supporters.statusReady",
  WAITING_FOR_DEPOSIT: "admin.supporters.statusWaitingForDeposit",
  DONE: "admin.supporters.statusDone",
  CANCELED: "admin.supporters.statusCanceled",
};

export function AdminSupporterPayments({ uid }: { uid: string }) {
  const t = useT();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [mode, setMode] = useState<"all" | "test" | "live">("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SupporterPaymentListResponse | null>(null);
  const [settings, setSettings] = useState<SupporterFundingSettings | null>(null);
  const [goalDraft, setGoalDraft] = useState(300_000);
  const [wallDraft, setWallDraft] = useState(true);
  const [error, setError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsErrorRetry, setSettingsErrorRetry] = useState<"load" | "save">("load");
  const [busyId, setBusyId] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const listSequence = useRef(0);

  const load = useCallback(() => {
    const sequence = ++listSequence.current;
    setError("");
    setListLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (mode !== "all") params.set("mode", mode);
    if (query) params.set("q", query);
    const suffix = params.size ? `?${params.toString()}` : "";
    adminFetch<SupporterPaymentListResponse>(`/supporter-payments${suffix}`, uid)
      .then((response) => {
        if (listSequence.current === sequence) setData(response);
      })
      .catch((requestError: AdminApiError) => {
        if (listSequence.current === sequence) setError(requestError.message);
      })
      .finally(() => {
        if (listSequence.current === sequence) setListLoading(false);
      });
  }, [filter, mode, query, uid]);

  const loadSettings = useCallback(() => {
    setSettingsError("");
    adminFetch<SupporterFundingSettings>("/supporter-payments/settings", uid)
      .then((next) => {
        setSettings(next);
        setGoalDraft(next.monthlyGoalAmount);
        setWallDraft(next.publicWallEnabled);
      })
      .catch((requestError: AdminApiError) => {
        setSettingsError(requestError.message);
        setSettingsErrorRetry("load");
      });
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  const act = async (
    item: SupporterPaymentItem,
    kind: "resync" | "cancel",
  ) => {
    let body: string | undefined;
    if (kind === "cancel") {
      const reason = window.prompt(
        t("admin.supporters.cancelReasonPrompt"),
        t("admin.supporters.cancelReasonDefault"),
      )?.trim();
      if (!reason) return;
      body = JSON.stringify({ reason });
    }
    setBusyId(item.id);
    setError("");
    try {
      await adminFetch(
        `/supporter-payments/${encodeURIComponent(item.id)}/${kind}`,
        uid,
        { method: "POST", body },
      );
      load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusyId("");
    }
  };

  const togglePublicVisibility = async (item: SupporterPaymentItem) => {
    setBusyId(item.id);
    setError("");
    try {
      await adminFetch(
        "/supporter-payments/" + encodeURIComponent(item.id) + "/public-visibility",
        uid,
        { method: "POST", body: JSON.stringify({ hidden: !item.publicHidden }) },
      );
      load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusyId("");
    }
  };

  const saveSettings = async () => {
    setBusyId("settings");
    setSettingsError("");
    try {
      const next = await adminFetch<SupporterFundingSettings>(
        "/supporter-payments/settings",
        uid,
        {
          method: "POST",
          body: JSON.stringify({
            monthlyGoalAmount: goalDraft,
            publicWallEnabled: wallDraft,
          }),
        },
      );
      setSettings(next);
      loadSettings();
    } catch (requestError) {
      setSettingsError((requestError as AdminApiError).message);
      setSettingsErrorRetry("save");
    } finally {
      setBusyId("");
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery(queryInput.trim());
  };

  return (
    <div className="flex flex-col gap-6">

      <AdminCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              OPERATING-COST SUPPORT
            </p>
            <h2 className="mt-1 text-xl font-bold text-fg">{t("admin.supporters.title")}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {t("admin.supporters.desc")}
            </p>
          </div>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-3">
            {data
              ? t("admin.supporters.resultCount", { total: data.total })
              : error
                ? t("admin.supporters.loadFailed")
                : t("admin.supporters.loading")}
          </span>
        </div>
        {listLoading && data ? (
          <p role="status" className="mt-2 text-xs text-fg-3">
            {t("admin.supporters.refetching")}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-panel/60 p-4">
            <p className="text-xs text-fg-3">{t("admin.supporters.summaryTotalAmount")}</p>
            <p className="mt-1 text-lg font-bold text-fg">{data ? formatWon(data.summary.totalAmount) : "—"}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel/60 p-4">
            <p className="text-xs text-fg-3">{t("admin.supporters.summaryApproved")}</p>
            <p className="mt-1 text-lg font-bold text-fg">{data ? t("admin.supporters.countUnit", { count: data.summary.doneCount }) : "—"}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel/60 p-4">
            <p className="text-xs text-fg-3">{t("admin.supporters.summaryWaiting")}</p>
            <p className="mt-1 text-lg font-bold text-fg">{data ? t("admin.supporters.countUnit", { count: data.summary.waitingCount }) : "—"}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel/60 p-4">
            <p className="text-xs text-fg-3">{t("admin.supporters.summaryCanceled")}</p>
            <p className="mt-1 text-lg font-bold text-fg">{data ? t("admin.supporters.countUnit", { count: data.summary.canceledCount }) : "—"}</p>
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-4 text-base font-bold text-fg">{t("admin.supporters.settingsTitle")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-semibold text-fg">
            {t("admin.supporters.monthlyGoal")}
            <input
              type="number"
              min={0}
              max={100_000_000}
              step={10_000}
              value={goalDraft}
              disabled={settings === null}
              onChange={(event) => setGoalDraft(Number(event.target.value))}
              className="mt-2 block min-h-10 w-48 rounded-xl border border-line bg-panel px-3 text-sm text-fg disabled:opacity-50"
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-fg-2">
            <input
              type="checkbox"
              checked={wallDraft}
              disabled={settings === null}
              onChange={(event) => setWallDraft(event.target.checked)}
            />
            {t("admin.supporters.publicWall")}
          </label>
          <button
            type="button"
            disabled={busyId === "settings" || settings === null}
            onClick={() => void saveSettings()}
            className={adminButtonClass("accent")}
          >
            <Save size={14} aria-hidden="true" />
            {t("admin.supporters.saveSettings")}
          </button>
          {settings ? (
            <span className="text-xs text-fg-3">
              {t("admin.supporters.currentGoal", { amount: formatWon(settings.monthlyGoalAmount) })}
            </span>
          ) : settingsError ? null : (
            <span role="status" className="text-xs text-fg-3">
              {t("admin.supporters.settingsLoading")}
            </span>
          )}
        </div>
        {settingsError ? (
          <p role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-bad">
            <span>{settingsError}</span>
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={
                settingsErrorRetry === "save"
                  ? () => void saveSettings()
                  : loadSettings
              }
            >
              {t("admin.supporters.retry")}
            </button>
          </p>
        ) : null}
      </AdminCard>

      <AdminCard>
        <h2 className="mb-4 text-base font-bold text-fg">{t("admin.supporters.listTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((value) => (
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
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          {(["all", "live", "test"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mode === value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-3"
              }`}
            >
              {value}
            </button>
          ))}
          <form onSubmit={submitSearch} className="ml-auto flex min-w-[260px] gap-2">
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder={t("admin.supporters.searchPlaceholder")}
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            />
            <button type="submit" className={adminButtonClass("ghost")}>
              <Search size={14} aria-hidden="true" />
              {t("admin.supporters.search")}
            </button>
          </form>
        </div>

        {error ? (
          <p role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-bad">
            <span>{error}</span>
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={load}
            >
              {t("admin.supporters.retry")}
            </button>
          </p>
        ) : null}
        {!data && !error ? <AdminSpinner /> : null}
        {data && data.items.length === 0 ? (
          <div className="mt-4">
            <AdminEmptyState title={t("admin.supporters.empty")} />
          </div>
        ) : null}
        {data && data.items.length > 0 ? (
          <AdminTableWrap className="mt-4">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-raised/50 text-left text-xs text-fg-3">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Supporter</th>
                  <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Method</th>
                  <th scope="col" className="px-3 py-2 font-medium">Order</th>
                  <th scope="col" className="px-3 py-2 font-medium">Created</th>
                  <th scope="col" className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const canCancel =
                    (item.status === "DONE" || item.status === "WAITING_FOR_DEPOSIT")
                    && !(item.status === "DONE" && item.method === "가상계좌");
                  return (
                    <tr key={item.id} className="border-t border-line align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium text-fg">
                          {item.visibility === "name" && item.supporterName ? item.supporterName : t("admin.supporters.anonymous")}
                        </div>
                        {item.message ? (
                          <div className="mt-1 max-w-64 truncate text-xs text-fg-3">
                            {item.message}
                          </div>
                        ) : null}
                        {item.visibility === "name" ? (
                          <div className="mt-1 text-[11px] text-fg-3">
                            {t("admin.supporters.publicSummary", { amount: item.showAmount ? "O" : "X", message: item.showMessage ? "O" : "X" })}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-semibold text-fg">
                        {formatWon(item.balanceAmount)}
                        {item.balanceAmount !== item.amount ? (
                          <div className="text-[11px] font-normal text-fg-3">
                            {t("admin.supporters.originalAmount", { amount: formatWon(item.amount) })}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          status={item.status}
                          label={`${SUPPORTER_STATUS_KEYS[item.status] ? t(SUPPORTER_STATUS_KEYS[item.status]) : item.status} · ${item.mode === "live" ? t("admin.supporters.modeLive") : item.mode === "test" ? t("admin.supporters.modeTest") : item.mode}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-fg-2">{item.method || "—"}</td>
                      <td className="px-3 py-3">
                        <code className="text-[11px] text-fg-3">{item.orderId}</code>
                        {item.receiptUrl ? (
                          <a
                            href={item.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent"
                          >
                            {t("admin.supporters.receipt")} <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs text-fg-3">
                        {new Date(item.createdAt).toLocaleString(getCurrentUiLocale())}
                        {item.webhookVerifiedAt ? (
                          <div className="mt-1">{t("admin.supporters.webhookVerified")}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {item.canResync ? (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void act(item, "resync")}
                              className={adminButtonClass("ghost")}
                            >
                              <RefreshCw size={13} aria-hidden="true" />
                              {t("admin.supporters.resync")}
                            </button>
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void act(item, "cancel")}
                              className={adminButtonClass("danger")}
                            >
                              {t("admin.supporters.cancelAll")}
                            </button>
                          ) : null}
                          {item.visibility === "name" ? (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void togglePublicVisibility(item)}
                              className={adminButtonClass("ghost")}
                            >
                              {item.publicHidden ? t("admin.supporters.restorePublic") : t("admin.supporters.hidePublic")}
                            </button>
                          ) : null}
                          {item.status === "DONE" && item.method === "가상계좌" ? (
                            <span className="max-w-48 text-[11px] leading-4 text-fg-3">
                              {t("admin.supporters.virtualAccountNote")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableWrap>
        ) : null}
      </AdminCard>
    </div>
  );
}
