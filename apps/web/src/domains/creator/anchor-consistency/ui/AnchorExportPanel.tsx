/**
 * 내려받기 패널 — 샷 포즈·구도 이미지, ZIP 만들기(진행·취소·오류), 참조 팩 미리보기.
 *
 * 참조 팩 미리보기는 내려받을 ZIP 과 같은 계획에서 나온다. 컴포저에 바로 가져오는 연결은 아직 없다는 사실을 문구로 알린다.
 */
import { useT } from "@/shared/lib/i18n";

import { buttonClass } from "@/shared/components/ui/button-utils";

import { ANCHOR_REFERENCE_PACK_LIMITS } from "../anchor-reference-pack";
import {
  ANGLE_NAME_KEYS,
  packWarningCopy,
  resolveCopy,
  skipReasonCopy,
} from "../anchor-lab-copy";
import { AnchorShotPanel } from "./AnchorShotPanel";
import type { AnchorExportController } from "./use-anchor-export";
import type { AnchorShots } from "./use-anchor-shots";
import type { AnchorSetBuilder } from "./use-anchor-set-builder";

export interface AnchorExportPanelProps {
  readonly builder: AnchorSetBuilder;
  readonly shots: AnchorShots;
  readonly exporter: AnchorExportController;
}

export function AnchorExportPanel({ builder, shots, exporter }: AnchorExportPanelProps) {
  const t = useT();
  const { state, plan } = exporter;
  const building = state.status === "building";
  const blocker = !builder.anchorIdValid || !builder.characterIdValid
    ? t("anchorLab.export.needIdentity")
    : !builder.rightsConfirmed
      ? t("anchorLab.export.needRights")
      : builder.frames.length === 0
        ? t("anchorLab.export.needImages")
        : null;
  const pack = plan?.referencePack ?? null;
  const limits = ANCHOR_REFERENCE_PACK_LIMITS;

  return (
    <section aria-labelledby="anchor-lab-export-title" className="space-y-4 rounded-3xl border border-line bg-panel p-4 sm:p-6">
      <header className="space-y-1">
        <h2 id="anchor-lab-export-title" className="text-xl font-bold text-fg">{t("anchorLab.export.title")}</h2>
        <p className="text-sm leading-relaxed text-fg-2">{t("anchorLab.export.lead")}</p>
      </header>

      <AnchorShotPanel shots={shots} rightsConfirmed={builder.rightsConfirmed} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!exporter.canExport}
            aria-describedby={blocker ? "anchor-lab-export-blocker" : undefined}
            onClick={exporter.start}
            className={buttonClass({ variant: "solid", size: "md" })}
          >
            {building
              ? t("anchorLab.export.zipBusy", { done: state.completedFiles, total: Math.max(state.totalFiles, state.completedFiles) })
              : t("anchorLab.export.zip")}
          </button>
          {building ? (
            <button type="button" onClick={exporter.cancel} className={buttonClass({ variant: "outline", size: "md" })}>
              {t("anchorLab.export.cancel")}
            </button>
          ) : null}
        </div>
        {blocker ? <p id="anchor-lab-export-blocker" className="text-sm text-fg-2">{blocker}</p> : null}
        <p role="status" className="min-h-5 text-sm text-fg-2">
          {state.status === "done" ? t("anchorLab.export.done", { count: state.fileCount }) : null}
          {state.status === "cancelled" ? t("anchorLab.export.cancelled") : null}
        </p>
        {state.status === "error" ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">{t("anchorLab.export.error")}</p>
        ) : null}
        <p className="text-xs text-fg-3">{t("anchorLab.export.contents")}</p>
      </div>

      <section aria-labelledby="anchor-lab-pack-title" className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h3 id="anchor-lab-pack-title" className="font-semibold text-fg">{t("anchorLab.pack.title")}</h3>
        <p className="text-sm text-fg-2">{t("anchorLab.pack.lead")}</p>
        {pack ? (
          <>
            <p className="text-sm font-medium text-fg">
              {t("anchorLab.pack.usage", {
                character: pack.usage.character,
                method: pack.usage.method,
                total: pack.usage.total,
                max: limits.maxTotal,
              })}
            </p>
            {pack.warnings.map((warning) => {
              const copy = packWarningCopy(warning, t);
              return copy ? (
                <p key={`${warning.code}:${warning.angleId ?? ""}`} className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
                  {resolveCopy(t, copy)}
                </p>
              ) : null;
            })}
            {pack.skipped.length > 0 ? (
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-fg">{t("anchorLab.pack.skipped.title")}</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2">
                  {pack.skipped.map((item) => (
                    <li key={item.referenceId}>
                      {t("anchorLab.pack.skipped.item", {
                        label: item.angleId ? t(ANGLE_NAME_KEYS[item.angleId]) : (item.shotId ?? item.referenceId),
                        reason: resolveCopy(t, skipReasonCopy(item.reason, limits.maxPerRole, limits.maxTotal)),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-fg-3">{t("anchorLab.pack.empty")}</p>
        )}
      </section>
    </section>
  );
}
