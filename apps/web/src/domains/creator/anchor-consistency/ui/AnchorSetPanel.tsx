/**
 * 앵커 세트 패널 — 여러 장 한꺼번에 놓기, 읽기 진행·취소·다시 시도, 여섯 각도 칸, 세트 점검.
 *
 * "한 번에 캡처" 경로: 지금은 3D 스테이지가 아니라 끌어다 놓은 파일을 각도별로 읽는다. 읽기는 한 번에 한 장씩 진행되고,
 * 진행·취소·실패한 칸 다시 시도는 캡처 세션이 같은 방식으로 맡는다(3D 스테이지 출처를 붙여도 이 패널은 그대로다).
 */
import { useMemo } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ANCHOR_ANGLE_IDS, ANCHOR_CAPTURE_CONVENTION, ANCHOR_LIMITS, type AnchorAngleId } from "../anchor-capture-spec";
import { anchorFrameDownload } from "../anchor-export";
import { startAnchorDownload } from "../anchor-image-io";
import {
  completenessIssueCopy,
  formatMegabytes,
  resolveCopy,
} from "../anchor-lab-copy";
import { AnchorDropZone } from "./AnchorDropZone";
import { AnchorSlotCard } from "./AnchorSlotCard";
import type { AnchorSetBuilder } from "./use-anchor-set-builder";

export interface AnchorSetPanelProps {
  readonly builder: AnchorSetBuilder;
  /** 이미지 해시 → 미리보기 URL. 후보 비교 패널과 같은 값을 쓰도록 페이지가 만든다. */
  readonly previewUrls: ReadonlyMap<string, string>;
}

export function AnchorSetPanel({ builder, previewUrls }: AnchorSetPanelProps) {
  const t = useT();
  const { snapshot, summary, frames, completeness, running } = builder;
  const frameByAngle = useMemo(() => new Map(frames.map((frame) => [frame.angleId, frame] as const)), [frames]);
  const acceptsFiles = builder.canAcceptFiles;
  const failedAngles = summary.failedAngles.length + summary.cancelledAngles.length;

  const progressText = running
    ? t("anchorLab.capture.running", { done: summary.settled, total: summary.requested })
    : snapshot.phase === "finished" && summary.requested > 0
      ? summary.cancelledAngles.length > 0
        ? t("anchorLab.capture.cancelledNote", { done: summary.doneAngles.length })
        : summary.failedAngles.length > 0
          ? t("anchorLab.capture.finishedPartial", { done: summary.doneAngles.length, failed: summary.failedAngles.length })
          : t("anchorLab.capture.finishedOk", { count: summary.doneAngles.length })
      : "";

  const download = (angleId: AnchorAngleId): void => {
    const frame = frameByAngle.get(angleId);
    if (!frame) return;
    const file = anchorFrameDownload(builder.anchorIdValid ? builder.anchorId : "anchor", frame);
    startAnchorDownload(file.blob, file.fileName);
  };

  return (
    <section aria-labelledby="anchor-lab-set-title" className="space-y-4 rounded-3xl border border-line bg-panel p-4 sm:p-6">
      <header className="space-y-1">
        <h2 id="anchor-lab-set-title" className="text-xl font-bold text-fg">{t("anchorLab.set.title")}</h2>
        <p className="text-sm leading-relaxed text-fg-2">{t("anchorLab.set.lead")}</p>
        <p className="text-xs text-fg-3">
          {t("anchorLab.set.accept", { max: formatMegabytes(ANCHOR_LIMITS.maxImageBytes) })}
          {" · "}
          {t("anchorLab.set.recommend", { width: ANCHOR_CAPTURE_CONVENTION.frame.width, height: ANCHOR_CAPTURE_CONVENTION.frame.height })}
        </p>
      </header>

      <AnchorDropZone
        multiple
        disabled={!acceptsFiles}
        reason={builder.rightsConfirmed ? undefined : t("anchorLab.rights.locked")}
        zoneLabel={t("anchorLab.set.dropAll.zone")}
        hint={t("anchorLab.set.dropAll.hint")}
        chooseLabel={t("anchorLab.set.dropAll.choose")}
        inputLabel={t("anchorLab.set.dropAll.inputLabel")}
        onFiles={builder.assignMany}
      />

      {builder.intake && builder.intake.guessed > 0 ? (
        <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
          {t("anchorLab.set.guessed", { count: builder.intake.guessed })}
        </p>
      ) : null}
      {builder.intake && builder.intake.unassigned > 0 ? (
        <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
          {t("anchorLab.set.unassigned", { count: builder.intake.unassigned })}
        </p>
      ) : null}

      <div className="space-y-2">
        {running ? (
          <progress
            className="h-2 w-full overflow-hidden rounded-full accent-[var(--color-accent)]"
            aria-label={t("anchorLab.capture.progressLabel")}
            max={Math.max(1, summary.requested)}
            value={summary.settled}
          />
        ) : null}
        <p role="status" className="min-h-5 text-sm text-fg-2">{progressText}</p>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button type="button" onClick={builder.cancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              {t("anchorLab.capture.cancel")}
            </button>
          ) : null}
          {!running && failedAngles > 0 ? (
            <button
              type="button"
              onClick={() => { builder.retryAngles([...summary.failedAngles, ...summary.cancelledAngles]); }}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {t("anchorLab.capture.retryFailed")}
            </button>
          ) : null}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {ANCHOR_ANGLE_IDS.map((angleId) => {
          const frame = frameByAngle.get(angleId);
          return (
            <AnchorSlotCard
              key={angleId}
              angleId={angleId}
              slot={snapshot.slots[angleId]}
              frame={frame}
              previewUrl={frame ? previewUrls.get(frame.imageSha256) : undefined}
              acceptsFiles={acceptsFiles}
              onAssign={(file) => { builder.assignToAngle(angleId, file); }}
              onClear={() => { builder.clearAngle(angleId); }}
              onRetry={() => { builder.retryAngles([angleId]); }}
              onDownload={() => { download(angleId); }}
            />
          );
        })}
      </ul>

      <section aria-labelledby="anchor-lab-completeness-title" className="space-y-2 rounded-2xl border border-line bg-card p-4">
        <h3 id="anchor-lab-completeness-title" className="font-semibold text-fg">{t("anchorLab.completeness.title")}</h3>
        <p className="text-sm text-fg-2">
          {completeness.status === "empty"
            ? t("anchorLab.completeness.empty")
            : completeness.clean
              ? t("anchorLab.completeness.clean")
              : completeness.status === "complete"
                ? t("anchorLab.completeness.complete")
                : t("anchorLab.completeness.partial", { present: completeness.present.length, total: ANCHOR_ANGLE_IDS.length })}
        </p>
        {completeness.status !== "empty" ? (
          <p className="text-sm text-fg-2">
            {completeness.usableForReferencePack ? t("anchorLab.completeness.usable") : t("anchorLab.completeness.notUsable")}
          </p>
        ) : null}
        {completeness.issues.length > 0 ? (
          <ul className="space-y-1.5">
            {completeness.issues.map((issue) => (
              <li
                key={`${issue.code}:${issue.angleId}:${issue.relatedAngleId ?? ""}`}
                className="flex flex-wrap items-start gap-2 text-sm text-fg"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                    issue.severity === "warning" ? "border-warn/40 text-warn" : "border-line text-fg-3",
                  )}
                >
                  {issue.severity === "warning" ? t("anchorLab.completeness.severity.warning") : t("anchorLab.completeness.severity.info")}
                </span>
                <span className="min-w-0 flex-1">{resolveCopy(t, completenessIssueCopy(issue, t))}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {builder.set ? (
          <div className="border-t border-line pt-2">
            <p className="break-all font-mono text-xs text-fg-2">{t("anchorLab.set.hash", { hash: builder.set.setHash })}</p>
            <p className="text-xs text-fg-3">{t("anchorLab.set.hashNote")}</p>
          </div>
        ) : null}
        {builder.setIssues.some((issue) => issue.code === "set-too-large") ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
            {t("anchorLab.set.tooLarge", {
              size: formatMegabytes(builder.setIssues.find((issue) => issue.code === "set-too-large")?.params?.bytes ?? 0),
              max: formatMegabytes(ANCHOR_LIMITS.maxSetBytes),
            })}
          </p>
        ) : builder.setIssues.length > 0 ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
            {t("anchorLab.set.invalid")}
          </p>
        ) : null}
      </section>
    </section>
  );
}
