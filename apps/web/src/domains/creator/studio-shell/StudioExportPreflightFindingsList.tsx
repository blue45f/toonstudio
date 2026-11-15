import { ArrowUpRight } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { buildStudioExportFindingJumpHref } from "../export/studio-export-url-handoff";
import type { StudioExportPreflightFinding } from "../studio-export-preflight";

export function StudioExportPreflightFindingsList({
  findings,
  baseEditorHref,
  returnHref,
  onBeforeJump,
}: {
  readonly findings: readonly StudioExportPreflightFinding[];
  readonly baseEditorHref: string | null;
  readonly returnHref: string;
  readonly onBeforeJump?: () => void;
}) {
  const bt = useBilingual("StudioExportPanel");

  if (findings.length === 0) return null;

  return (
    <ul className="mt-4 space-y-2" data-testid="studio-export-preflight-findings">
      {findings.map((finding) => (
        <li
          key={finding.code}
          data-finding-code={finding.code}
          className="rounded-xl border border-line bg-card/70 p-3 text-xs leading-5 text-fg-2"
        >
          <b
            className={
              finding.severity === "error"
                ? "text-danger"
                : finding.severity === "warning"
                  ? "text-warning"
                  : "text-fg"
            }
          >
            {bt(finding.messageKo, finding.messageEn)}
          </b>
          <span className="mt-1 block text-fg-3">
            {bt(finding.suggestedActionKo, finding.suggestedActionEn)}
          </span>

          {baseEditorHref && finding.locations && finding.locations.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {finding.locations.map((loc, index) => {
                const jumpHref = buildStudioExportFindingJumpHref({
                  baseEditorHref,
                  location: loc,
                  findingCode: finding.code,
                  returnHref,
                });
                const locationTitle =
                  loc.cutNumber !== null
                    ? bt(
                        `${loc.pageNumber}페이지 · ${loc.cutNumber}컷으로 이동 (${loc.label})`,
                        `Go to P${loc.pageNumber} · Cut ${loc.cutNumber} (${loc.label})`,
                      )
                    : bt(
                        `${loc.pageNumber}페이지로 이동 (${loc.label})`,
                        `Go to Page ${loc.pageNumber} (${loc.label})`,
                      );
                return (
                  <Link
                    key={`${finding.code}:${loc.pageId}:${loc.elementId ?? index}`}
                    href={jumpHref}
                    onClick={onBeforeJump}
                    data-testid={`studio-export-finding-jump-${finding.code}-${index}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/45 bg-accent-soft/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <span>{locationTitle}</span>
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
