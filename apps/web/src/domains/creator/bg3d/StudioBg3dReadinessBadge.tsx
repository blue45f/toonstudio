import { ArrowLeft, Cpu, Loader2, TriangleAlert, Zap } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";
import type { StudioBg3dReadinessSnapshot } from "./studio-bg3d-readiness-state";

export interface StudioBg3dReadinessBadgeProps {
  readonly readiness: StudioBg3dReadinessSnapshot;
  readonly lowQualityActive?: boolean;
  readonly exposeLegacyActiveBackendTestId?: boolean;
  readonly disableReturnTo2d?: boolean;
  readonly onReturnTo2d?: () => void;
}

export function StudioBg3dReadinessBadge({
  readiness,
  lowQualityActive = false,
  exposeLegacyActiveBackendTestId = false,
  disableReturnTo2d = false,
  onReturnTo2d,
}: StudioBg3dReadinessBadgeProps) {
  const bt = useBilingual("StudioBg3dReadinessBadge");
  const isReady = readiness.phase === "ready";
  const isError = readiness.phase === "error";
  const isWebGpu = readiness.selectedEngine === "webgpu";

  const toneClass = isError
    ? "border-danger/45 bg-danger/10 text-danger"
    : isReady
      ? isWebGpu
        ? "border-accent/45 bg-accent-soft text-accent"
        : "border-good/45 bg-good/10 text-good"
      : "border-line bg-card text-fg-2";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        role="status"
        aria-live="polite"
        data-testid="studio-bg3d-active-engine-badge"
        data-readiness={readiness.phase}
        data-readiness-stage={readiness.stage}
        data-selected-engine={readiness.selectedEngine}
        data-active-engine={readiness.activeEngine ?? "none"}
        title={bt(readiness.detailKo, readiness.detailEn)}
        className={studioBg3dClassNames(
          "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums",
          toneClass,
        )}
      >
        {isError ? (
          <TriangleAlert size={13} className="shrink-0" aria-hidden />
        ) : !isReady ? (
          <Loader2
            size={13}
            className="shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : isWebGpu ? (
          <Zap size={13} className="shrink-0" aria-hidden />
        ) : (
          <Cpu size={13} className="shrink-0" aria-hidden />
        )}
        <span
          data-testid={
            exposeLegacyActiveBackendTestId ? "studio-bg3d-engine-active-backend" : undefined
          }
        >
          {bt(readiness.badgeLabelKo, readiness.badgeLabelEn)}
        </span>
        {lowQualityActive && isReady ? (
          <span className="rounded bg-panel/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2">
            {bt("저화질", "Low")}
          </span>
        ) : null}
      </span>

      {onReturnTo2d ? (
        <button
          type="button"
          data-testid="studio-bg3d-header-return-2d"
          disabled={disableReturnTo2d}
          onClick={onReturnTo2d}
          className={studioBg3dClassNames(
            STUDIO_BG3D_CONTROL_BUTTON,
            "hidden min-h-11 border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg sm:inline-flex",
          )}
        >
          <ArrowLeft size={14} aria-hidden />
          <span>{bt("2D 원고로 복귀", "Return to 2D")}</span>
        </button>
      ) : null}
    </div>
  );
}
