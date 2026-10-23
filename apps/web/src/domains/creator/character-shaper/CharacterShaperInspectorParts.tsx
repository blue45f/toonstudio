/**
 * Character Shaper 인스펙터의 작은 표시 부품(구역·안내·스위치 줄).
 *
 * 인스펙터 본문과 구역별 하위 인스펙터(헤어·피부)가 같은 모양을 쓰도록 한곳에 둔다.
 */
import { ChevronRight, Info, TriangleAlert } from "lucide-react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import type { ReactNode } from "react";

import { SwitchIndicator } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

export function InspectorSection({
  title,
  hint,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  /** 자주 쓰지 않는 정밀 조절은 접어 둔다 — 인스펙터는 프리셋이 먼저 보여야 한다. */
  readonly collapsible?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const body = (
    <>
      {hint ? <p className="mt-0.5 text-[0.66rem] leading-relaxed text-fg-3">{hint}</p> : null}
      <div className="mt-2 space-y-2">{children}</div>
    </>
  );
  if (collapsible) {
    return (
      <details
        className="group border-t border-line/60 px-3 py-3 first:border-t-0"
        data-character-inspector-section={title}
        open={defaultOpen}
      >
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-1.5 text-[0.78rem] font-bold text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <ChevronRight
            size={13}
            aria-hidden
            className="shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          {title}
        </summary>
        {body}
      </details>
    );
  }
  return (
    <section className="border-t border-line/60 px-3 py-3 first:border-t-0" data-character-inspector-section={title}>
      <h3 className="text-[0.78rem] font-bold text-fg">{title}</h3>
      {body}
    </section>
  );
}

export function InspectorNote({ tone = "muted", children }: { readonly tone?: "muted" | "warn"; readonly children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[0.66rem] leading-relaxed",
        tone === "warn" ? "border-warn/45 bg-warn/10 text-warn" : "border-dashed border-line bg-card/50 text-fg-3",
      )}
    >
      {tone === "warn" ? (
        <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
      ) : (
        <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function InspectorToggleRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        STUDIO_FOCUS_RING,
        checked ? "border-accent/55 bg-accent-soft" : "border-line bg-card hover:bg-raised",
      )}
    >
      <span className="min-w-0">
        <span className={cn("block text-[0.72rem] font-bold", checked ? "text-accent" : "text-fg-2")}>{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.62rem] leading-relaxed text-fg-3">{hint}</span> : null}
      </span>
      <SwitchIndicator checked={checked} />
    </button>
  );
}
