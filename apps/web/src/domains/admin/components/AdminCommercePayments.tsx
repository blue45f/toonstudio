import {
  CreditCard,
  ExternalLink,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  CommerceOrderPublicEntry,
  CommercePaymentMethod,
} from "@toonstudio/core/commerce";

import {
  adminFetch,
  type AdminApiError,
} from "./admin-client";
import { adminButtonClass } from "./admin-ui-utils";
import { AdminCard, AdminSpinner } from "./admin-ui";

import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

/** 결제 상태 코드(토스)를 운영자 언어로 바꾼다. 모르는 코드는 원본을 유지한다. */
const ORDER_STATUS_KEYS: Readonly<Record<string, string>> = {
  READY: "admin.commerce.statusReady",
  IN_PROGRESS: "admin.commerce.statusInProgress",
  WAITING_FOR_DEPOSIT: "admin.commerce.statusWaitingForDeposit",
  DONE: "admin.commerce.statusDone",
  CANCELED: "admin.commerce.statusCanceled",
  PARTIAL_CANCELED: "admin.commerce.statusPartialCanceled",
  ABORTED: "admin.commerce.statusAborted",
  EXPIRED: "admin.commerce.statusExpired",
};

interface CommerceAdminSettings {
  operationMode: "free" | "paid";
  provider: "toss" | "mock";
  defaultMarketPriceKrw: number;
  paymentMethods: CommercePaymentMethod[];
  freePolicyNotice: string;
  paidPolicyNotice: string;
  termsVersion: string;
  providerMode: "test" | "live" | "mock" | null;
  checkoutEnabled: boolean;
  disabledReason: string | null;
}

const METHODS: readonly [CommercePaymentMethod, string][] = [
  ["card", "admin.commerce.methodCard"],
  ["apple_pay", "admin.commerce.methodApplePay"],
  ["samsung_pay", "admin.commerce.methodSamsungPay"],
  ["naver_pay", "admin.commerce.methodNaverPay"],
  ["kakao_pay", "admin.commerce.methodKakaoPay"],
  ["toss_pay", "admin.commerce.methodTossPay"],
  ["bank_transfer", "admin.commerce.methodBankTransfer"],
  ["virtual_account", "admin.commerce.methodVirtualAccount"],
  ["mobile", "admin.commerce.methodMobile"],
];

const won = (value: number) => "₩" + value.toLocaleString(getCurrentUiLocale());

export function AdminCommercePayments({ uid }: { uid: string }) {
  const t = useT();
  const [settings, setSettings] = useState<CommerceAdminSettings | null>(null);
  const [draft, setDraft] = useState<CommerceAdminSettings | null>(null);
  const [orders, setOrders] = useState<CommerceOrderPublicEntry[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [resourcePrice, setResourcePrice] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextSettings, nextOrders] = await Promise.all([
        adminFetch<CommerceAdminSettings>("/commerce/settings", uid),
        adminFetch<{ items: CommerceOrderPublicEntry[] }>("/commerce/orders", uid),
      ]);
      setSettings(nextSettings);
      setDraft(nextSettings);
      setOrders(nextOrders.items);
      setOrdersLoaded(true);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy("settings");
    setError("");
    try {
      const next = await adminFetch<CommerceAdminSettings>(
        "/commerce/settings",
        uid,
        {
          method: "POST",
          body: JSON.stringify({
            operationMode: draft.operationMode,
            provider: draft.provider,
            defaultMarketPriceKrw: draft.defaultMarketPriceKrw,
            paymentMethods: draft.paymentMethods,
            freePolicyNotice: draft.freePolicyNotice,
            paidPolicyNotice: draft.paidPolicyNotice,
            termsVersion: draft.termsVersion,
          }),
        },
      );
      setSettings(next);
      setDraft(next);
      window.dispatchEvent(new Event("toonspectrum:commerce-config-changed"));
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  const toggleMethod = (method: CommercePaymentMethod) => {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.paymentMethods.includes(method);
      return {
        ...current,
        paymentMethods: selected
          ? current.paymentMethods.filter((entry) => entry !== method)
          : [...current.paymentMethods, method],
      };
    });
  };

  const saveResourcePrice = async () => {
    const normalizedId = resourceId.trim();
    if (!normalizedId) return;
    setBusy("price");
    setError("");
    try {
      await adminFetch(
        "/commerce/market/" + encodeURIComponent(normalizedId) + "/price",
        uid,
        {
          method: "POST",
          body: JSON.stringify({ amount: resourcePrice }),
        },
      );
      setResourceId("");
      setResourcePrice(0);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  const cancelOrder = async (order: CommerceOrderPublicEntry) => {
    const reason = window.prompt(
      t("admin.commerce.cancelReasonPrompt"),
      t("admin.commerce.cancelReasonDefault"),
    )?.trim();
    if (!reason) return;
    setBusy(order.orderId);
    setError("");
    try {
      await adminFetch(
        "/commerce/orders/" + encodeURIComponent(order.orderId) + "/cancel",
        uid,
        { method: "POST", body: JSON.stringify({ reason }) },
      );
      await load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <AdminCard className="border-accent/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              SITE COMMERCE POLICY
            </p>
            <h2 className="mt-1 text-xl font-bold text-fg">{t("admin.commerce.title")}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-3">
              {t("admin.commerce.desc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={
              "rounded-full border px-3 py-1 text-xs font-bold "
              + (draft?.operationMode === "paid"
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-good/40 bg-good/10 text-good")
            }>
              {draft?.operationMode === "paid" ? "PAID" : "FREE"}
            </span>
            <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-3">
              PG {settings?.providerMode ?? "not-ready"}
            </span>
          </div>
        </div>

        {!draft ? (
          error ? (
            <div className="mt-5" role="alert">
              <p className="text-sm text-bad">{error}</p>
              <button
                type="button"
                className={`${adminButtonClass("ghost")} mt-3`}
                onClick={() => void load()}
              >
                {t("admin.commerce.retry")}
              </button>
            </div>
          ) : (
            <AdminSpinner />
          )
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-line bg-panel/60 p-4">
                <p className="text-xs font-semibold text-fg">{t("admin.commerce.operationMode")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["free", "paid"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft((current) => current ? { ...current, operationMode: mode } : current)}
                      className={
                        "min-h-10 rounded-xl border text-sm font-bold "
                        + (draft.operationMode === mode
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2")
                      }
                    >
                      {mode === "free" ? t("admin.commerce.modeFree") : t("admin.commerce.modePaid")}
                    </button>
                  ))}
                </div>
              </div>

              <label className="rounded-xl border border-line bg-panel/60 p-4 text-xs font-semibold text-fg">
                {t("admin.commerce.provider")}
                <select
                  value={draft.provider}
                  onChange={(event) => setDraft({
                    ...draft,
                    provider: event.target.value as "toss" | "mock",
                  })}
                  className="mt-2 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm"
                >
                  <option value="toss">Toss Payments</option>
                  <option value="mock">{t("admin.commerce.providerMock")}</option>
                </select>
              </label>

              <label className="rounded-xl border border-line bg-panel/60 p-4 text-xs font-semibold text-fg">
                {t("admin.commerce.defaultPrice")}
                <input
                  type="number"
                  min={0}
                  max={10_000_000}
                  step={100}
                  value={draft.defaultMarketPriceKrw}
                  onChange={(event) => setDraft({
                    ...draft,
                    defaultMarketPriceKrw: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                  })}
                  className="mt-2 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-fg">{t("admin.commerce.methodsTitle")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {METHODS.map(([method, labelKey]) => (
                  <label
                    key={method}
                    className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2"
                  >
                    <input
                      type="checkbox"
                      checked={draft.paymentMethods.includes(method)}
                      onChange={() => toggleMethod(method)}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-fg-3">
                {t("admin.commerce.methodsNote")}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-xs font-semibold text-fg">
                {t("admin.commerce.freePolicyNotice")}
                <textarea
                  rows={4}
                  value={draft.freePolicyNotice}
                  onChange={(event) => setDraft({ ...draft, freePolicyNotice: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-line bg-panel p-3 text-xs leading-5"
                />
              </label>
              <label className="text-xs font-semibold text-fg">
                {t("admin.commerce.paidPolicyNotice")}
                <textarea
                  rows={4}
                  value={draft.paidPolicyNotice}
                  onChange={(event) => setDraft({ ...draft, paidPolicyNotice: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-line bg-panel p-3 text-xs leading-5"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <label className="text-xs font-semibold text-fg">
                {t("admin.commerce.termsVersion")}
                <input
                  value={draft.termsVersion}
                  onChange={(event) => setDraft({ ...draft, termsVersion: event.target.value })}
                  className="mt-2 block min-h-10 w-56 rounded-xl border border-line bg-panel px-3 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy === "settings"}
                onClick={() => void save()}
                className={adminButtonClass("accent")}
              >
                <Save size={14} aria-hidden="true" />
                {t("admin.commerce.saveSettings")}
              </button>
              <span className="text-xs text-fg-3">
                {settings?.checkoutEnabled ? t("admin.commerce.checkoutReady") : t("admin.commerce.checkoutDisabled")}
                {settings?.disabledReason ? " · " + settings.disabledReason : ""}
              </span>
            </div>
          </div>
        )}
        {draft && error ? <p role="alert" className="mt-3 text-xs text-bad">{error}</p> : null}
      </AdminCard>

      <AdminCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">MARKET PRICE OVERRIDE</p>
            <h2 className="mt-1 text-lg font-bold text-fg">{t("admin.commerce.priceTitle")}</h2>
            <p className="mt-1 text-xs text-fg-3">{t("admin.commerce.priceDesc")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-fg">
              {t("admin.commerce.resourceId")}
              <input
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
                className="mt-1 block min-h-10 w-72 rounded-xl border border-line bg-panel px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-fg">
              {t("admin.commerce.price")}
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={resourcePrice}
                onChange={(event) => setResourcePrice(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="mt-1 block min-h-10 w-32 rounded-xl border border-line bg-panel px-3 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy === "price" || !resourceId.trim()}
              onClick={() => void saveResourcePrice()}
              className={adminButtonClass("ghost")}
            >
              {t("admin.commerce.savePrice")}
            </button>
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">MARKET PAYMENT LEDGER</p>
            <h2 className="mt-1 text-lg font-bold text-fg">{t("admin.commerce.ledgerTitle")}</h2>
          </div>
          <button type="button" onClick={() => void load()} className={adminButtonClass("ghost")}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("admin.commerce.refresh")}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-raised/50 text-left text-xs text-fg-3">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colProduct")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colAmount")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colStatus")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colPayment")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colOrder")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("admin.commerce.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-fg-3">
                    {!ordersLoaded ? (
                      error ? (
                        <span role="alert" className="text-bad">
                          {t("admin.commerce.ordersLoadError")}{" "}
                          <button
                            type="button"
                            className="font-semibold underline"
                            onClick={() => void load()}
                          >
                            {t("admin.commerce.retry")}
                          </button>
                        </span>
                      ) : (
                        t("admin.commerce.ordersLoading")
                      )
                    ) : (
                      t("admin.commerce.ordersEmpty")
                    )}
                  </td>
                </tr>
              ) : null}
              {orders.map((order) => (
                <tr key={order.orderId} className="border-t border-line">
                  <td className="px-3 py-3">
                    <div className="font-medium text-fg">{order.productName}</div>
                    <code className="text-[10px] text-fg-3">{order.productId}</code>
                  </td>
                  <td className="px-3 py-3 font-semibold text-fg">
                    {won(order.balanceAmount)}
                    {order.balanceAmount !== order.amount ? (
                      <div className="text-[10px] font-normal text-fg-3">{t("admin.commerce.originalAmount", { amount: won(order.amount) })}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                      {ORDER_STATUS_KEYS[order.status] ? t(ORDER_STATUS_KEYS[order.status]) : order.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-2">
                    {order.provider} · {order.providerMode}
                    <div>{order.method || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <code className="text-[10px] text-fg-3">{order.orderId}</code>
                    {order.receiptUrl ? (
                      <a
                        href={order.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent"
                      >
                        {t("admin.commerce.receipt")} <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {(order.status === "DONE" || order.status === "PARTIAL_CANCELED") ? (
                      <button
                        type="button"
                        disabled={busy === order.orderId}
                        onClick={() => void cancelOrder(order)}
                        className={adminButtonClass("danger")}
                      >
                        {t("admin.commerce.cancelAll")}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">
                        <ShieldCheck size={12} aria-hidden="true" /> {t("admin.commerce.noAction")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-fg-3">
          <CreditCard size={12} aria-hidden="true" />
          {t("admin.commerce.footerNote")}
        </p>
      </AdminCard>
    </>
  );
}
