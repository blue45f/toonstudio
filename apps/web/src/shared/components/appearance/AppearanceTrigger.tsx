import { Palette } from "lucide-react";
import { useEffect, useRef } from "react";

import { useAppearanceDialog } from "@/shared/lib/appearance-dialog-store";
import { useI18n } from "@/shared/lib/i18n";
import type { AppearanceScope } from "@/shared/lib/theme-presets";

export const APPEARANCE_DIALOG_ID = "appearance-settings-dialog";
const SENTINEL_ATTR = "data-appearance-dialog-sentinel";

function syncAppearanceDialogTarget(): void {
  if (typeof document === "undefined" || !document.body) return;
  const dialogNode = document.querySelector<HTMLElement>(".appearance-dialog");
  const sentinel = document.querySelector<HTMLElement>(`[${SENTINEL_ATTR}="true"]`);
  if (dialogNode) {
    sentinel?.remove();
    if (dialogNode.id !== APPEARANCE_DIALOG_ID) {
      dialogNode.id = APPEARANCE_DIALOG_ID;
    }
    return;
  }
  if (!sentinel && !document.getElementById(APPEARANCE_DIALOG_ID)) {
    const holder = document.createElement("div");
    holder.id = APPEARANCE_DIALOG_ID;
    holder.hidden = true;
    holder.setAttribute("aria-hidden", "true");
    holder.setAttribute(SENTINEL_ATTR, "true");
    document.body.appendChild(holder);
  }
}

syncAppearanceDialogTarget();

export function AppearanceTrigger({ scope = "site", className = "", showLabel = false }: {
  scope?: AppearanceScope;
  className?: string;
  showLabel?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = useAppearanceDialog((state) => state.open);
  const expanded = useAppearanceDialog(
    (state) =>
      state.scope === scope &&
      (state.returnFocusElement === null || state.returnFocusElement === buttonRef.current),
  );
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const label = korean ? "디자인 테마" : "Design themes";

  useEffect(() => {
    syncAppearanceDialogTarget();
    if (!expanded) return;
    const observer = new MutationObserver(syncAppearanceDialogTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      syncAppearanceDialogTarget();
    };
  }, [expanded]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`appearance-trigger ${className}`}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={APPEARANCE_DIALOG_ID}
      onClick={(event) => open(scope, event.currentTarget)}
    >
      <Palette size={17} aria-hidden />{showLabel && <span>{label}</span>}
    </button>
  );
}
