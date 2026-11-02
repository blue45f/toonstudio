import type { CommerceOrderPublicEntry, CommerceOrderStatus } from "@toonstudio/core/commerce";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Library,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getCommerceConfig, listMyCommerceOrders, type CommerceConfigResponse } from "../commerce-api";
import { MarketNavHeader } from "../components/MarketNavHeader";
import { formatMarketDateTime } from "../models/market-kind";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

type OrderFilterGroup = "all" | "completed" | "pending" | "canceled";

const PAYMENT_METHOD_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  card: ["신용·체크카드", "Card"],
  apple_pay: ["애플페이", "Apple Pay"],
  samsung_pay: ["삼성페이", "Samsung Pay"],
  naver_pay: ["네이버페이", "Naver Pay"],
  kakao_pay: ["카카오페이", "Kakao Pay"],
  toss_pay: ["토스페이", "Toss Pay"],
  bank_transfer: ["계좌이체", "Bank transfer"],
  virtual_account: ["가상계좌", "Virtual account"],
  mobile: ["휴대폰 결제", "Mobile"],
};

function classifyOrderGroup(status: CommerceOrderStatus): Exclude<OrderFilterGroup, "all"> {
  if (status === "DONE") return "completed";
  if (status === "READY" || status === "IN_PROGRESS" || status === "WAITING_FOR_DEPOSIT") {
    return "pending";
  }
  return "canceled";
}

function formatKrw(amount: number): string {
  return `₩${new Intl.NumberFormat("ko-KR").format(amount)}`;
}

export function MarketOrdersPage() {
  const t = useBilingual("MarketOrdersPage");
  useDocumentTitle(t("주문·결제 내역 · 툰스튜디오 마켓", "Orders & Receipts · ToonStudio Market"));
  useMetaDescription(
    t(
      "툰스튜디오 소재 마켓에서 결제한 주문 내역, 영수증, 이용 권한 상태를 확인하세요.",
      "Review your ToonStudio Market orders, payment receipts, and entitlement status.",
    ),
  );

  const { data: session, ready, status: sessionStatus } = useSession();
  const userId = ready && sessionStatus === "authenticated" ? (session.user.id ?? null) : null;

  const [orders, setOrders] = useState<readonly CommerceOrderPublicEntry[]>([]);
  const [config, setConfig] = useState<CommerceConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<OrderFilterGroup>("all");
  const [search, setSearch] = useState("");

  const loadOrders = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, configRes] = await Promise.all([
        listMyCommerceOrders(),
        getCommerceConfig().catch(() => null),
      ]);
      setOrders(Array.isArray(ordersRes.items) ? ordersRes.items : []);
      setConfig(configRes);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : t("주문 내역을 불러오지 못했습니다.", "Could not load your orders."),
      );
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    if (ready && userId) {
      void loadOrders();
    }
  }, [loadOrders, ready, userId]);

  const summary = useMemo(() => {
    let completedCount = 0;
    let pendingCount = 0;
    let canceledCount = 0;
    let totalApprovedKrw = 0;
    for (const order of orders) {
      const group = classifyOrderGroup(order.status);
      if (group === "completed") {
        completedCount += 1;
        totalApprovedKrw += order.balanceAmount ?? order.amount;
      } else if (group === "pending") {
        pendingCount += 1;
      } else {
        canceledCount += 1;
      }
    }
    return {
      totalCount: orders.length,
      completedCount,
      pendingCount,
      canceledCount,
      totalApprovedKrw,
    };
  }, [orders]);

  const normalizedQuery = search.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (filterGroup !== "all" && classifyOrderGroup(order.status) !== filterGroup) {
          return false;
        }
        if (!normalizedQuery) return true;
        return (
          order.productName.toLowerCase().includes(normalizedQuery) ||
          order.orderId.toLowerCase().includes(normalizedQuery) ||
          order.productId.toLowerCase().includes(normalizedQuery)
        );
      }),
    [filterGroup, normalizedQuery, orders],
  );

  function statusBadge(status: CommerceOrderStatus) {
    switch (status) {
      case "DONE":
        return {
          label: t("결제 완료", "Paid"),
          className: "border-good/30 bg-good/10 text-good",
          icon: CheckCircle2,
        };
      case "WAITING_FOR_DEPOSIT":
        return {
          label: t("입금 대기", "Waiting for deposit"),
          className: "border-warn/30 bg-warn/10 text-warn",
          icon: Clock,
        };
      case "READY":
      case "IN_PROGRESS":
        return {
          label: t("결제 진행 중", "In progress"),
          className: "border-accent/30 bg-accent/10 text-accent",
          icon: Clock,
        };
      case "PARTIAL_CANCELED":
        return {
          label: t("부분 취소", "Partially refunded"),
          className: "border-warn/30 bg-warn/10 text-warn",
          icon: XCircle,
        };
      case "CANCELED":
        return {
          label: t("결제 취소", "Canceled"),
          className: "border-line bg-raised text-fg-3",
          icon: XCircle,
        };
      case "ABORTED":
      case "EXPIRED":
        return {
          label: t("실패·만료", "Aborted / Expired"),
          className: "border-bad/30 bg-bad/10 text-bad",
          icon: XCircle,
        };
    }
  }

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <MarketNavHeader />

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow text-accent">Orders & Entitlements</p>
          <div className="mt-1 flex items-center gap-2">
            <ReceiptText className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">
              {t("주문·결제 내역", "Orders & Receipts")}
            </h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-2">
            {t(
              "유료 소재 결제 영수증과 계정 이용 권한 부여 상태를 확인합니다. 결제가 완료된 소재는 내 에셋 보관함(/market/library)과 Studio에서 바로 사용할 수 있습니다.",
              "Check payment receipts and account entitlements for paid market packages. Completed purchases are immediately available in My Assets and Studio.",
            )}
          </p>
          {config?.policyNotice ? (
            <p className="mt-2 text-xs text-fg-3">{config.policyNotice}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/market/library"
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Library className="size-3.5" aria-hidden="true" />
            {t("내 에셋 보관함", "My Assets")}
          </Link>
          {userId ? (
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={loading}
              className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
                aria-hidden="true"
              />
              {t("새로고침", "Refresh")}
            </button>
          ) : null}
        </div>
      </header>

      {!ready ? (
        <div role="status" className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <LoaderCircle className="mx-auto size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm text-fg-2">
            {t("계정 정보를 확인하고 있습니다…", "Checking your session…")}
          </p>
        </div>
      ) : !userId ? (
        <section className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <ReceiptText className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-fg">
            {t("로그인 후 주문·결제 내역을 확인할 수 있어요", "Sign in to view your orders & receipts")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            {t(
              "주문 원장과 영수증은 계정 단위로 보호됩니다. 로그인하면 구매한 유료 소재와 영수증을 바로 조회할 수 있습니다.",
              "Order ledgers and receipts are protected per account. Sign in to view your purchases and receipts.",
            )}
          </p>
          <button
            type="button"
            onClick={() =>
              requestAuthModalOpen({
                reason: "protected-action",
                source: "market-orders",
                mode: "login",
              })
            }
            className={buttonClass({ variant: "solid", size: "md", className: "mt-5 min-h-11" })}
          >
            {t("로그인하기", "Sign in")}
          </button>
        </section>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-card p-4">
              <dt className="text-xs font-semibold text-fg-3">{t("전체 주문", "Total orders")}</dt>
              <dd className="numeral tnum mt-1 text-xl font-bold text-fg">{summary.totalCount}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <dt className="text-xs font-semibold text-fg-3">{t("결제 완료", "Completed")}</dt>
              <dd className="numeral tnum mt-1 text-xl font-bold text-good">{summary.completedCount}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <dt className="text-xs font-semibold text-fg-3">{t("진행·입금 대기", "Pending")}</dt>
              <dd className="numeral tnum mt-1 text-xl font-bold text-fg">{summary.pendingCount}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <dt className="text-xs font-semibold text-fg-3">{t("누적 승인 금액", "Approved total")}</dt>
              <dd className="numeral tnum mt-1 text-xl font-bold text-accent">
                {formatKrw(summary.totalApprovedKrw)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("주문 상태 필터", "Order status filter")}
            >
              {(
                [
                  ["all", t("전체", "All"), summary.totalCount],
                  ["completed", t("결제 완료", "Paid"), summary.completedCount],
                  ["pending", t("결제 대기", "Pending"), summary.pendingCount],
                  ["canceled", t("취소·실패", "Canceled"), summary.canceledCount],
                ] as const
              ).map(([id, label, count]) => {
                const active = filterGroup === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilterGroup(id)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-card text-fg-2 hover:text-fg",
                    )}
                  >
                    <span>{label}</span>
                    <span className="numeral tnum opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={t("주문번호 또는 에셋명 검색", "Search by order ID or asset name")}
                placeholder={t("주문번호·에셋명 검색…", "Search order ID or asset…")}
                className="h-9 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-5 flex items-center gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-fg"
            >
              <ShieldAlert className="size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {loading ? (
            <div aria-hidden="true" className="mt-6 space-y-3">
              {Array.from({ length: 3 }, (_, idx) => (
                <div
                  key={idx}
                  className="h-24 animate-pulse rounded-2xl border border-line bg-card"
                />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
              <ReceiptText className="mx-auto size-10 text-fg-3" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-fg">
                {orders.length === 0
                  ? t("아직 결제한 마켓 주문 내역이 없어요", "No market orders yet")
                  : t("선택한 조건에 맞는 주문이 없습니다", "No orders match your filter")}
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-fg-2 sm:text-sm">
                {orders.length === 0
                  ? t(
                    "무료 공개 소재는 결제 없이 내 에셋 보관함(/market/library)에 바로 담기며, 유료 소재를 결제하면 이곳에 주문번호와 영수증이 기록됩니다.",
                    "Free resources go straight to My Assets without checkout; paid package orders and receipts appear here.",
                  )
                  : t("상태 필터나 검색어를 초기화해 전체 주문을 확인해 보세요.", "Reset your status filter or search query.")}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href="/market/browse"
                  className={buttonClass({ variant: "solid", size: "sm" })}
                >
                  {t("소재 둘러보기", "Browse market")}
                </Link>
                <Link
                  href="/market/library"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  {t("내 에셋 보관함 확인", "Open My Assets")}
                </Link>
              </div>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {filteredOrders.map((order) => {
                const badge = statusBadge(order.status);
                const BadgeIcon = badge.icon;
                const methodTuple = PAYMENT_METHOD_LABELS[order.method];
                const methodLabel = methodTuple
                  ? t(methodTuple[0], methodTuple[1])
                  : order.method || t("결제 수단 미지정", "Unspecified");
                const timestamp = order.approvedAt ?? order.canceledAt;

                return (
                  <li
                    key={order.orderId}
                    className="rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold",
                              badge.className,
                            )}
                          >
                            <BadgeIcon className="size-3.5" aria-hidden="true" />
                            {badge.label}
                          </span>
                          <span className="font-mono text-xs text-fg-3">
                            #{order.orderId}
                          </span>
                          {order.providerMode !== "live" ? (
                            <span className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-fg-3">
                              {order.providerMode}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-1.5 truncate text-base font-bold text-fg">
                          {order.productName}
                        </h2>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
                          <span>{methodLabel}</span>
                          {timestamp ? (
                            <span>
                              {order.canceledAt
                                ? t("취소 시각", "Canceled")
                                : t("승인 시각", "Approved")}
                              : {formatMarketDateTime(timestamp)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                        <div className="numeral tnum text-lg font-extrabold text-fg">
                          {formatKrw(order.balanceAmount ?? order.amount)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {order.receiptUrl ? (
                            <a
                              href={order.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={buttonClass({
                                variant: "outline",
                                size: "sm",
                                className: "gap-1 text-xs",
                              })}
                            >
                              {t("영수증", "Receipt")}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : null}
                          <Link
                            href={`/market/resource/${encodeURIComponent(order.productId)}`}
                            className={buttonClass({
                              variant: "ghost",
                              size: "sm",
                              className: "gap-1 text-xs",
                            })}
                          >
                            {t("에셋 상세", "Asset details")}
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
