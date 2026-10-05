import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type {
  CreatorMarketplaceResourceModerationAction,
  CreatorMarketplaceResourceModerationQueueItem,
  CreatorMarketplaceResourceModerationQueuePage,
  CreatorMarketplaceResourceReportReason,
} from "@/shared/lib/creator-marketplace-resource-contract";

import { CREATOR_MARKETPLACE_RESOURCE_MODERATION_NOTE_MAX_CHARACTERS } from "@/shared/lib/creator-marketplace-resource-contract";
import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  dismissOrphanedReport,
  listCreatorMarketplaceModerationQueue,
  moderateCreatorMarketplaceResource,
} from "@/platform/creator-marketplace-client";

type Translate = ReturnType<typeof useT>;

const PAGE_SIZE = 10;

const REASON_KEYS: Record<CreatorMarketplaceResourceReportReason, string> = {
  copyright: "admin.moderation.reasonCopyright",
  unsafe: "admin.moderation.reasonUnsafe",
  spam: "admin.moderation.reasonSpam",
  misleading: "admin.moderation.reasonMisleading",
  other: "admin.moderation.reasonOther",
};

const ACTION_KEYS: Record<CreatorMarketplaceResourceModerationAction, string> = {
  hide: "admin.moderation.actionHide",
  restore: "admin.moderation.actionRestore",
  dismiss: "admin.moderation.actionDismiss",
};

interface ModerationFocusRestoreRequest {
  readonly origin: HTMLButtonElement;
  readonly target: "action" | "status";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(1)} KB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getCurrentUiLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function currentState(t: Translate, item: CreatorMarketplaceResourceModerationQueueItem): {
  readonly label: string;
  readonly description: string;
  readonly tone: "bad" | "good" | "warn";
} {
  if (!item.currentResource) {
    return {
      label: t("admin.moderation.stateNoResourceLabel"),
      description: t("admin.moderation.stateNoResourceDesc"),
      tone: "warn",
    };
  }
  const currentPackage = item.currentPackage;
  if (!currentPackage) {
    return {
      label: t("admin.moderation.stateNoPackageLabel"),
      description: t("admin.moderation.stateNoPackageDesc"),
      tone: "warn",
    };
  }
  if (currentPackage.availability.state === "available") {
    return {
      label: t("admin.moderation.stateAvailableLabel"),
      description: t("admin.moderation.stateAvailableDesc"),
      tone: "good",
    };
  }
  if (currentPackage.availability.reason === "moderated") {
    return {
      label: t("admin.moderation.stateModeratedLabel"),
      description: t("admin.moderation.stateModeratedDesc"),
      tone: "bad",
    };
  }
  if (currentPackage.availability.reason === "owner-delisted") {
    return {
      label: t("admin.moderation.stateDelistedLabel"),
      description: t("admin.moderation.stateDelistedDesc"),
      tone: "warn",
    };
  }
  return {
    label: t("admin.moderation.statePublisherUnavailableLabel"),
    description: t("admin.moderation.statePublisherUnavailableDesc"),
    tone: "warn",
  };
}

function actionResultMessage(
  t: Translate,
  action: CreatorMarketplaceResourceModerationAction,
  item: CreatorMarketplaceResourceModerationQueueItem,
  result: {
    readonly hidden: boolean;
    readonly delisted: boolean;
    readonly reviewedReportCount: number;
  },
): string {
  const state = result.hidden && result.delisted
    ? t("admin.moderation.resultHiddenDelisted")
    : result.hidden
      ? t("admin.moderation.resultHidden")
    : result.delisted
      ? t("admin.moderation.resultDelisted")
      : t("admin.moderation.resultPublic");
  return t("admin.moderation.resultSummary", {
    name: item.evidence.name,
    action: t(ACTION_KEYS[action]),
    count: result.reviewedReportCount,
    state,
  });
}

export function CreatorMarketplaceModerationBoard() {
  const t = useT();
  const headingId = useId();
  const requestGenerationRef = useRef(0);
  const busyTargetRef = useRef<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const focusRestoreRef = useRef<ModerationFocusRestoreRequest | null>(null);
  const [page, setPage] = useState<CreatorMarketplaceResourceModerationQueuePage | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<{
    readonly targetKey: string;
    readonly action: CreatorMarketplaceResourceModerationAction;
  } | null>(null);

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listCreatorMarketplaceModerationQueue(
      { status: "open", limit: PAGE_SIZE, offset },
      controller.signal,
    )
      .then((nextPage) => {
        if (requestGenerationRef.current !== generation) return;
        setPage(nextPage);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
        setError(errorMessage(caught, t("admin.moderation.loadError")));
      })
      .finally(() => {
        if (requestGenerationRef.current === generation) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, refreshToken, t]);

  useEffect(() => {
    const request = focusRestoreRef.current;
    if (!request || busyAction) return;
    const target = request.target === "status"
      ? statusRef.current
      : request.origin;
    if (!target?.isConnected) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;

    const active = document.activeElement;
    if (active !== target && (
      active === null
      || active === document.body
      || active === document.documentElement
      || active === request.origin
    )) {
      target.focus();
    }
    focusRestoreRef.current = null;
  }, [actionError, busyAction, page, statusMessage]);

  async function moderate(
    item: CreatorMarketplaceResourceModerationQueueItem,
    action: CreatorMarketplaceResourceModerationAction,
    trigger: HTMLButtonElement,
  ) {
    const resourceId = item.currentPackage?.moderationTargetId
      ?? item.currentResource?.id;
    const targetKey = resourceId ?? `report:${item.reportId}`;
    const note = (notes[item.reportId] ?? "").trim();
    if (!note || busyTargetRef.current || (!resourceId && action !== "dismiss")) return;

    focusRestoreRef.current = document.activeElement === trigger
      ? { origin: trigger, target: "action" }
      : null;

    busyTargetRef.current = targetKey;
    setBusyAction({ targetKey, action });
    setActionError(null);
    setStatusMessage(null);
    try {
      const resourceResult = resourceId
        ? await moderateCreatorMarketplaceResource(resourceId, {
            action,
            sourceReportId: item.reportId,
            note,
          })
        : null;
      const orphanResult = resourceId
        ? null
        : await dismissOrphanedReport(item.reportId, note);
      const pageBeforeMutation = page;
      const targetPackage = item.currentPackage;
      const resolvesCandidate = (
        candidate: CreatorMarketplaceResourceModerationQueueItem,
      ) => {
        if (!resourceId) return candidate.reportId === item.reportId;
        if (candidate.evidence.resourceId === item.evidence.resourceId) return true;
        if (!targetPackage) return false;
        const candidatePackage = candidate.currentPackage
          ?? (candidate.evidence.schemaVersion !== 1
            ? {
                publisherId: candidate.evidence.publisherId,
                packageId: candidate.evidence.packageId,
              }
            : null);
        return candidatePackage?.publisherId === targetPackage.publisherId
          && candidatePackage.packageId === targetPackage.packageId;
      };
      const relatedReportIds = new Set(
        pageBeforeMutation?.items
          .filter(resolvesCandidate)
          .map((candidate) => candidate.reportId) ?? [],
      );
      const remainingItems = pageBeforeMutation?.items.filter(
        (candidate) => !resolvesCandidate(candidate),
      ) ?? [];
      setPage((current) => current
        ? {
            ...current,
            items: current.items.filter((candidate) => !resolvesCandidate(candidate)),
          }
        : current);
      setNotes((current) => Object.fromEntries(
        Object.entries(current).filter(([reportId]) => !relatedReportIds.has(reportId)),
      ));
      setStatusMessage(resourceResult
        ? actionResultMessage(t, action, item, resourceResult)
        : t("admin.moderation.resultOrphan", { name: item.evidence.name, count: orphanResult?.dismissedReportCount ?? 0 }));
      if (focusRestoreRef.current) {
        focusRestoreRef.current = {
          ...focusRestoreRef.current,
          target: "status",
        };
      }

      if (remainingItems.length === 0) {
        if (pageBeforeMutation?.hasMore) {
          setRefreshToken((token) => token + 1);
        } else if (offset > 0) {
          setOffset(Math.max(0, offset - PAGE_SIZE));
        }
      }
    } catch (caught) {
      setActionError(errorMessage(
        caught,
        resourceId
          ? t("admin.moderation.actionFailed", { name: item.evidence.name })
          : t("admin.moderation.orphanFailed", { name: item.evidence.name }),
      ));
    } finally {
      busyTargetRef.current = null;
      setBusyAction(null);
    }
  }

  const visibleStart = page && page.items.length > 0 ? page.offset + 1 : 0;
  const visibleEnd = page ? page.offset + page.items.length : 0;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-bad">
            <Flag size={13} aria-hidden /> CREATOR MARKET REPORTS
          </p>
          <h2 id={headingId} className="mt-1 text-xl font-bold text-fg">
            {t("admin.moderation.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">
            {t("admin.moderation.desc")}
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => setRefreshToken((token) => token + 1)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait disabled:opacity-45"
        >
          <RefreshCw
            size={13}
            className={cn(loading && "animate-spin motion-reduce:animate-none")}
            aria-hidden
          />
          {t("admin.moderation.refresh")}
        </button>
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
            className="mt-2 min-h-11 rounded-lg border border-current/30 px-3 font-semibold hover:bg-bad/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/70"
          >
            {t("admin.moderation.reloadList")}
          </button>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">
          {actionError} {t("admin.moderation.noteKept")}
        </p>
      ) : null}
      {statusMessage ? (
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-good/35 bg-good/10 px-3 py-2 text-xs leading-relaxed text-good focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-good/70"
        >
          {statusMessage}
        </p>
      ) : null}

      {loading && !page ? (
        <div role="status" className="space-y-2.5" aria-label={t("admin.moderation.loadingLabel")}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton h-52 rounded-xl" />
          ))}
        </div>
      ) : !loading && !error && (page?.items.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-8 text-center">
          <ShieldCheck className="mx-auto text-good" size={24} aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fg">{t("admin.moderation.emptyTitle")}</p>
          <p className="mt-1 text-xs text-fg-3">{t("admin.moderation.emptyDesc")}</p>
        </div>
      ) : page && page.items.length > 0 ? (
        <ul className={cn("space-y-3", loading && "opacity-65")} aria-busy={loading}>
          {page.items.map((item) => {
            const state = currentState(t, item);
            const note = notes[item.reportId] ?? "";
            const noteValid = note.trim().length > 0;
            const targetMissing = item.currentResource === null;
            const targetKey = item.currentPackage?.moderationTargetId
              ?? item.currentResource?.id
              ?? `report:${item.reportId}`;
            const busy = busyAction?.targetKey === targetKey;
            return (
              <li key={item.reportId} className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
                      <span className="rounded-full bg-bad/10 px-2 py-0.5 font-semibold text-bad">
                        {t(REASON_KEYS[item.reason])}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5">{t("admin.moderation.openReport")}</span>
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    </div>
                    <h3 className="mt-2 break-words text-base font-bold text-fg">{item.evidence.name}</h3>
                    <p className="mt-1 break-all font-mono text-[0.68rem] text-fg-3">
                      {item.evidence.packageId} · v{item.evidence.resourceVersion}
                    </p>
                  </div>
                  <span className={cn(
                    "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold",
                    state.tone === "bad" && "bg-bad/10 text-bad",
                    state.tone === "warn" && "bg-warn/10 text-warn",
                    state.tone === "good" && "bg-good/10 text-good",
                  )}>
                    {state.tone === "bad" ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                    {state.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <section aria-label={t("admin.moderation.reportSection")} className="rounded-xl border border-line bg-panel p-3">
                    <h4 className="text-xs font-semibold text-fg">{t("admin.moderation.reportSection")}</h4>
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs leading-relaxed">
                      <dt className="text-fg-3">{t("admin.moderation.reporter")}</dt>
                      <dd className="min-w-0 break-all text-fg-2">
                        {item.reporter.id
                          ? t("admin.moderation.reporterLine", { name: item.reporter.name, id: item.reporter.id })
                          : t("admin.moderation.reporterLineWithdrawn", { name: item.reporter.name })}
                      </dd>
                      <dt className="text-fg-3">{t("admin.moderation.details")}</dt>
                      <dd className="whitespace-pre-wrap break-words text-fg-2">
                        {item.details || t("admin.moderation.noDetails")}
                      </dd>
                    </dl>
                  </section>

                  <section aria-label={t("admin.moderation.evidenceSection")} className="rounded-xl border border-line bg-panel p-3">
                    <h4 className="text-xs font-semibold text-fg">{t("admin.moderation.evidenceSection")}</h4>
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs leading-relaxed">
                      <dt className="text-fg-3">{t("admin.moderation.kindLicense")}</dt>
                      <dd className="text-fg-2">{item.evidence.kind} · {item.evidence.license}</dd>
                      <dt className="text-fg-3">{t("admin.moderation.size")}</dt>
                      <dd className="text-fg-2">{formatByteSize(item.evidence.manifestByteSize)}</dd>
                      <dt className="text-fg-3">{t("admin.moderation.releasedAt")}</dt>
                      <dd className="text-fg-2">
                        <time dateTime={item.evidence.releaseCreatedAt}>{formatDate(item.evidence.releaseCreatedAt)}</time>
                      </dd>
                      <dt className="text-fg-3">Manifest SHA-256</dt>
                      <dd className="break-all font-mono text-[0.68rem] text-fg-2">{item.evidence.manifestHash}</dd>
                    </dl>
                  </section>
                </div>

                <div className="mt-3 rounded-xl border border-line bg-raised/35 px-3 py-2.5 text-xs leading-relaxed">
                  <p className="font-semibold text-fg">{t("admin.moderation.currentState", { label: state.label })}</p>
                  <p className="mt-1 text-fg-3">{state.description}</p>
                  {item.currentPackage?.availability.state === "available" ? (
                    <Link
                      href={`/market/resource/${encodeURIComponent(item.currentPackage.availability.currentHead.id)}`}
                      className="mt-1.5 inline-flex min-h-8 items-center font-semibold text-accent underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      {t("admin.moderation.viewCurrentDetail")}
                    </Link>
                  ) : null}
                </div>

                <div className="mt-4">
                  <label htmlFor={`market-moderation-note-${item.reportId}`} className="text-xs font-semibold text-fg-2">
                    {t("admin.moderation.noteLabel")}
                  </label>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[0.68rem] text-fg-3">
                    <span>{t("admin.moderation.noteHint")}</span>
                    <span className="tabular-nums" aria-hidden>
                      {note.length}/{CREATOR_MARKETPLACE_RESOURCE_MODERATION_NOTE_MAX_CHARACTERS}
                    </span>
                  </div>
                  <textarea
                    id={`market-moderation-note-${item.reportId}`}
                    value={note}
                    rows={3}
                    required
                    maxLength={CREATOR_MARKETPLACE_RESOURCE_MODERATION_NOTE_MAX_CHARACTERS}
                    onChange={(event) => {
                      setNotes((current) => ({ ...current, [item.reportId]: event.target.value }));
                      setActionError(null);
                    }}
                    placeholder={t("admin.moderation.notePlaceholder")}
                    className="mt-1.5 w-full resize-y rounded-lg border border-line bg-canvas/50 px-3 py-2.5 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("admin.moderation.actionsLabel", { name: item.evidence.name })}>
                  <button
                    type="button"
                    disabled={targetMissing || Boolean(busyAction) || !noteValid || item.currentPackage?.moderation.state === "hidden"}
                    aria-busy={busy && busyAction?.action === "hide"}
                    onClick={(event) => void moderate(item, "hide", event.currentTarget)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/40 px-3 text-xs font-semibold text-bad hover:bg-bad/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy && busyAction?.action === "hide" ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <EyeOff size={13} aria-hidden />}
                    {busy && busyAction?.action === "hide" ? t("admin.moderation.hideBusy") : t("admin.moderation.hide")}
                  </button>
                  <button
                    type="button"
                    disabled={targetMissing || Boolean(busyAction) || !noteValid || item.currentPackage?.moderation.state !== "hidden"}
                    aria-busy={busy && busyAction?.action === "restore"}
                    onClick={(event) => void moderate(item, "restore", event.currentTarget)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-good/40 px-3 text-xs font-semibold text-good hover:bg-good/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-good/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy && busyAction?.action === "restore" ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCcw size={13} aria-hidden />}
                    {busy && busyAction?.action === "restore" ? t("admin.moderation.restoreBusy") : t("admin.moderation.restore")}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyAction) || !noteValid}
                    aria-busy={busy && busyAction?.action === "dismiss"}
                    onClick={(event) => void moderate(item, "dismiss", event.currentTarget)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy && busyAction?.action === "dismiss" ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <XCircle size={13} aria-hidden />}
                    {busy && busyAction?.action === "dismiss" ? t("admin.moderation.dismissBusy") : t("admin.moderation.dismiss")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {page ? (
        <nav aria-label={t("admin.moderation.navLabel")} className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-3">
            {visibleStart === 0 ? t("admin.moderation.rangeEmpty") : t("admin.moderation.range", { start: visibleStart, end: visibleEnd })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || Boolean(busyAction) || page.offset === 0}
              onClick={() => setOffset(Math.max(0, page.offset - PAGE_SIZE))}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden /> {t("admin.moderation.previous")}
            </button>
            <button
              type="button"
              disabled={loading || Boolean(busyAction) || !page.hasMore || page.nextOffset === null}
              onClick={() => {
                if (page.nextOffset !== null) setOffset(page.nextOffset);
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("admin.moderation.next")} <ChevronRight size={14} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
