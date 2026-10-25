import {
  Activity,
  BadgeDollarSign,
  CreditCard,
  Flag,
  Gauge,
  HandCoins,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Ticket,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { AdminRouteIconId } from "../router/admin-route-manifest";
import "../shell/admin-visual-v2.css";

import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { adminButtonClass } from "./admin-client";

const ADMIN_ROUTE_ICONS: Record<AdminRouteIconId, LucideIcon> = {
  activity: Activity,
  announcement: Megaphone,
  audit: History,
  community: MessagesSquare,
  funding: HandCoins,
  members: UsersRound,
  operations: Gauge,
  overview: LayoutDashboard,
  plans: CreditCard,
  promotions: Ticket,
  reports: Flag,
  revenue: BadgeDollarSign,
  security: ShieldCheck,
};

export function AdminRouteIcon({
  icon,
  className,
  size = 16,
}: {
  icon: AdminRouteIconId;
  className?: string;
  size?: number;
}) {
  const Icon = ADMIN_ROUTE_ICONS[icon] ?? Receipt;
  return <Icon aria-hidden className={className} size={size} />;
}

export const adminInputClass =
  "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-accent/60";

/**
 * 관리자 KPI 한 칸 (G-0): eyebrow 라벨 → 큰 숫자(numeral) → 증감·보조 설명 순서.
 * 증감(delta)은 비교 데이터가 실제로 있을 때만 넘긴다 — 없는 화면에서 가짜 증감을 만들지 않는다.
 */
export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: { direction: "up" | "down"; text: string; sentiment: "good" | "bad" | "neutral" };
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fg-3">{label}</dt>
      <dd className="numeral text-2xl text-fg">{value}</dd>
      {delta ? (
        <dd
          className={cn(
            "text-[0.7rem] font-semibold",
            delta.sentiment === "good"
              ? "text-good"
              : delta.sentiment === "bad"
                ? "text-bad"
                : "text-fg-3",
          )}
        >
          <span aria-hidden="true">{delta.direction === "up" ? "▲" : "▼"}</span> {delta.text}
        </dd>
      ) : null}
      {hint ? <dd className="text-[0.7rem] leading-4 text-fg-3">{hint}</dd> : null}
    </div>
  );
}

export function StatGroup({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5 text-fg-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="text-sm font-semibold">{label}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </dl>
    </section>
  );
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-xs font-medium text-fg-3">{label}</span>
      {children}
    </label>
  );
}

export function AdminNotice({
  title,
  body,
  onRetry,
  retryLabel,
}: {
  title: string;
  body: string;
  /** 불러오기 실패처럼 다시 시도할 수 있는 오류일 때만 넘긴다. */
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useBilingual("admin-ui");
  return (
    <section data-admin-notice="true" className="rounded-2xl border border-line bg-card p-6">
      <div className="admin-notice-visual" aria-hidden="true">
        <span className="admin-notice-emblem"><ShieldCheck size={24} strokeWidth={1.8} /></span>
        <span>ADMIN OPERATIONS</span>
      </div>
      <div className="admin-notice-copy">
        <p className="admin-notice-kicker">TOONSTUDIO CONTROL CENTER</p>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-3">{body}</p>
        {onRetry ? (
          <button type="button" className={cn(adminButtonClass("ghost"), "mt-4")} onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" />
            {retryLabel ?? t("다시 시도", "Retry")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 관리자 목록 빈 상태: 성공했지만 비어 있는 결과를 오류와 구분해 보여준다.
 * 아이콘·제목·설명·액션(자식) 순서로, 테이블 빈 셀 텍스트만 두는 패턴을 대체한다.
 */
export function AdminEmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card/40 px-5 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-raised text-fg-3" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm leading-relaxed text-fg-3">{description}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function AdminSpinner() {
  const t = useBilingual("admin-ui");
  return (
    <div className="flex min-h-[30vh] items-center justify-center" role="status" aria-label={t("불러오는 중", "Loading")}>
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

/**
 * 관리자 섹션 카드: 화면마다 반경·배경이 제각각이던 수제 섹션을 한 규격으로 통일한다.
 * (웨이브9 실사: Revenue 2xl, SupporterPayments xl 등 혼재 확인)
 * 랜드마크가 아니라 카드 컨테이너라 div로 둔다 — 제목 위계는 소비 화면이 소유한다.
 */
export function AdminCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("rounded-2xl border border-line bg-card p-5", className)}>{children}</div>;
}

/** 관리자 표 래퍼: 가로 스크롤·반경·테두리 규격 통일용. */
export function AdminTableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-2xl border border-line", className)}>{children}</div>;
}

/**
 * 상태 배지 (G-0): 테두리만 있는 고리가 아니라 톤 배경을 채운 칩으로 통일한다.
 * 상태 값의 의미 매핑은 기존과 동일하게 유지하고, 표현만 바꾼다.
 * 표시 문구는 호출부가 지역화한 label을 우선 쓰고, 없으면 원시 값을 그대로 보인다.
 */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone =
    status === "paid" || status === "DONE"
      ? "bg-good/15 text-good"
      : status === "approved" || status === "READY"
        ? "bg-cool/15 text-cool"
        : status === "pending" || status === "WAITING_FOR_DEPOSIT"
          ? "bg-warn/15 text-warn"
          : status === "rejected" || status === "revoked" || status === "CANCELED"
            ? "bg-bad/15 text-bad"
            : "bg-raised text-fg-2";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", tone)}>
      {label ?? status}
    </span>
  );
}

interface LiveAutoRefreshProps {
  onRefresh: () => void;
  loading?: boolean;
}

export function LiveAutoRefresh({ onRefresh, loading = false }: LiveAutoRefreshProps) {
  const [intervalSec, setIntervalSec] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const t = useT();

  useEffect(() => {
    if (intervalSec <= 0) {
      setCountdown(0);
      return;
    }

    setCountdown(intervalSec);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh();
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [intervalSec, onRefresh]);

  return (
    <div className="inline-flex items-center gap-2 bg-card/60 border border-line p-1.5 rounded-xl backdrop-blur-xl text-xs">
      <button
        onClick={onRefresh}
        disabled={loading}
        title={t("admin.refresh.now")}
        className="p-1.5 text-fg-3 hover:text-fg hover:bg-raised rounded-lg transition-colors flex items-center gap-1 font-medium"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent" : ""}`} />
        <span>{t("admin.refresh.now")}</span>
      </button>

      <span className="w-px h-4 bg-raised" />

      <div className="flex items-center gap-1">
        <span className="text-fg-3 font-medium pl-1">{t("admin.refresh.auto")}</span>
        {([0, 5, 15, 30] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => setIntervalSec(sec)}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
              intervalSec === sec
                ? "bg-accent text-fg shadow-sm"
                : "text-fg-3 hover:text-fg-2 hover:bg-raised"
            }`}
          >
            {sec === 0 ? "Off" : t("admin.refresh.seconds").replace("{sec}", String(sec))}
          </button>
        ))}
      </div>

      {intervalSec > 0 && (
        <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/40 px-1.5 py-0.5 rounded-md">
          {countdown}s
        </span>
      )}
    </div>
  );
}

interface AdminDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  busy?: boolean;
  closeLabel?: string;
}

const DIALOG_SIZE_CLASS: Record<NonNullable<AdminDialogProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  busy = false,
  closeLabel,
}: AdminDialogProps) {
  const t = useT();
  const resolvedCloseLabel = closeLabel ?? t("admin.ui.close");
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busy) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!busy && event.currentTarget === event.target) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-canvas/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={cn(
          "my-auto w-full overflow-hidden rounded-2xl border border-line bg-card shadow-2xl outline-none",
          DIALOG_SIZE_CLASS[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-relaxed text-fg-3"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={resolvedCloseLabel}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-fg-3 transition-colors hover:border-fg-3/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        {children ? (
          <div className="max-h-[min(70vh,760px)] overflow-y-auto px-5 py-5">
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel/50 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
