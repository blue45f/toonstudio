import { Check, Loader2, TriangleAlert } from "lucide-react";

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
