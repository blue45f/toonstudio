import { Check, ImagePlus, Loader2, TriangleAlert } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioPublishingPersistenceStatusSnapshot } from "./studio-publishing-persistence-status";

export interface StudioPublishingPersistenceStatusViewProps {
  readonly status: StudioPublishingPersistenceStatusSnapshot;
  readonly savingLabel?: string;
}

function toneTextClass(tone: StudioPublishingPersistenceStatusSnapshot["tone"]): string {
  switch (tone) {
    case "success":
      return "text-good";
    case "warning":
      return "text-warn";
    case "danger":
      return "text-bad";
    case "neutral":
    default:
      return "text-fg-3";
  }
}

function StatusLeadingGlyph({ status }: { readonly status: StudioPublishingPersistenceStatusSnapshot }) {
  if (status.kind === "saving" || status.kind === "preparing") {
    return <Loader2 size={13} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />;
  }
  if (status.kind === "saved") {
    return <Check size={13} className="shrink-0" aria-hidden />;
  }
  if (status.kind === "save-failed" || status.kind === "load-failed") {
    return <TriangleAlert size={13} className="shrink-0" aria-hidden />;
  }
  if (status.tone === "warning") {
    return <span className="size-2 shrink-0 rounded-full bg-warn" aria-hidden />;
  }
  return <span className="size-2 shrink-0 rounded-full border border-fg-3/65" aria-hidden />;
}

export function StudioPublishingPersistenceSummaryStatus({
  status,
  savingLabel,
}: StudioPublishingPersistenceStatusViewProps) {
  const bt = useBilingual("StudioPublishingPersistenceStatus");
  const label =
    status.kind === "saving" && savingLabel
      ? savingLabel
      : bt(status.summaryKo, status.summaryEn);

  return (
    <span
      className="ml-auto"
      role="status"
      aria-live="polite"
      data-testid="studio-publish-persistence-summary"
      data-persistence-status={status.kind}
      data-persistence-tone={status.tone}
      data-server-persisted={String(status.hasConfirmedServerPersistence)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 [word-break:keep-all] tabular-nums",
          status.kind === "saving" || status.kind === "preparing"
            ? "text-fg-2"
            : toneTextClass(status.tone),
        )}
      >
        <StatusLeadingGlyph status={status} />
        <span>{label}</span>
      </span>
    </span>
  );
}

export function StudioPublishingPersistenceDockStatus({
  status,
  savingLabel,
}: StudioPublishingPersistenceStatusViewProps) {
  const bt = useBilingual("StudioPublishingPersistenceStatus");
  const label =
    status.kind === "saving" && savingLabel
      ? savingLabel
      : bt(status.dockKo, status.dockEn);

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="studio-publish-persistence-dock"
      data-persistence-status={status.kind}
      data-persistence-tone={status.tone}
      data-server-persisted={String(status.hasConfirmedServerPersistence)}
      className={cn(
        "inline-flex items-center gap-1.5 [word-break:keep-all] tabular-nums",
        status.kind === "saving" || status.kind === "preparing"
          ? "text-fg-2"
          : toneTextClass(status.tone),
      )}
    >
      <StatusLeadingGlyph status={status} />
      <span>{label}</span>
    </span>
  );
}

export function StudioPublishingHandoffDismissButton({
  onDismiss,
}: {
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("StudioPublishingPersistenceStatus");
  return (
    <button
      type="button"
      data-testid="studio-publish-dismiss-handoff-error"
      onClick={onDismiss}
      className={buttonClass({
        size: "sm",
        variant: "solid",
        className: "min-h-11 gap-1.5",
      })}
    >
      <ImagePlus size={14} aria-hidden />
      {bt("인계 안내 닫고 직접 올리기", "Dismiss notice and upload directly")}
    </button>
  );
}

export function StudioPublishingHandoffLocalBadge({
  loggedIn,
}: {
  readonly loggedIn: boolean;
}) {
  const bt = useBilingual("StudioPublishingPersistenceStatus");
  return (
    <span
      data-testid="studio-publish-handoff-local-badge"
      data-handoff-auth={loggedIn ? "authenticated" : "guest"}
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold [word-break:keep-all]",
        loggedIn
          ? "border-accent/35 bg-accent/10 text-accent"
          : "border-warn/40 bg-warn/10 text-warn",
      )}
    >
      {loggedIn
        ? bt("로컬 인계본 · 서버 저장 전", "Local handoff · Not saved to server yet")
        : bt("로컬 인계본 · 로그인 후 서버 저장 가능", "Local handoff · Sign in to save to server")}
    </span>
  );
}
