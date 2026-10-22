/**
 * 앵커와 나란히 보기 — 고른 후보와 견준 앵커를 나란히 놓고, 휴리스틱 참고 점수·특징별 유사도·무엇이 달랐나를 보여 준다.
 *
 * 점수 옆에는 항상 한계 안내가 붙는다(같은 캐릭터 판정이 아님, 구간 경계는 사람이 정한 값). 부위(머리·피부·의상)를 말하지 않고
 * 이미지 전체의 통계 차이만 말한다. 점수가 없는 후보는 이유(분석 중·실패·앵커 준비 중)와 다음 행동을 보여 준다.
 */
import { ChevronLeft, ChevronRight, ImageOff, RotateCw, Trash2 } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  ANCHOR_FEATURE_IDS,
  ANCHOR_SCORE_BANDS,
} from "../anchor-consistency-compare";
import {
  ANGLE_NAME_KEYS,
  BAND_KEYS,
  COMPARISON_LIMIT_KEYS,
  DIFFERENCE_SEVERITY_KEYS,
  FEATURE_KEYS,
  captureErrorCopy,
  differenceCopy,
  resolveCopy,
} from "../anchor-lab-copy";
import type { AnchorCapturedFrame } from "../anchor-capture-session";
import type { AnchorAngleId } from "../anchor-capture-spec";
import type { AnchorCandidates } from "./use-anchor-candidates";

export interface AnchorCompareViewProps {
  readonly candidates: AnchorCandidates;
  readonly frames: readonly AnchorCapturedFrame[];
  readonly anchorPreviewUrls: ReadonlyMap<string, string>;
  readonly candidatePreviewUrls: ReadonlyMap<string, string>;
}

function ImageFrame({ url, alt, caption }: { readonly url: string | undefined; readonly alt: string; readonly caption: string }) {
  return (
    <figure className="min-w-0 space-y-2">
      <div className="grid aspect-[2/3] place-items-center overflow-hidden rounded-xl bg-panel">
        {url ? (
          <img src={url} alt={alt} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <ImageOff size={28} aria-hidden="true" className="text-fg-3" />
        )}
      </div>
      <figcaption className="truncate text-sm font-medium text-fg" title={caption}>{caption}</figcaption>
    </figure>
  );
}

export function AnchorCompareView({ candidates, frames, anchorPreviewUrls, candidatePreviewUrls }: AnchorCompareViewProps) {
  const t = useT();
  const { items, selection } = candidates;
  const current = items.find((item) => item.id === candidates.selectedId) ?? null;
  if (!current) {
    return (
      <section aria-labelledby="anchor-lab-compare-title" className="rounded-2xl border border-line bg-card p-4">
        <h3 id="anchor-lab-compare-title" className="font-semibold text-fg">{t("anchorLab.compare.title")}</h3>
        <p className="mt-1 text-sm text-fg-2">{t("anchorLab.compare.empty")}</p>
      </section>
    );
  }

  const index = items.indexOf(current);
  const anchorAngle: AnchorAngleId | null = selection?.anchorAngleId ?? (candidates.anchorChoice === "best" ? null : candidates.anchorChoice);
  const anchorFrame = anchorAngle ? frames.find((frame) => frame.angleId === anchorAngle) : undefined;
  const anchorName = anchorAngle ? t(ANGLE_NAME_KEYS[anchorAngle]) : t("anchorLab.candidates.anchorSelect.best");
  const comparison = selection?.comparison ?? null;
  const percent = comparison ? Math.round(comparison.score * 100) : null;
  const canRetry = current.status === "failed" || current.status === "cancelled";

  return (
    <section aria-labelledby="anchor-lab-compare-title" className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="anchor-lab-compare-title" className="font-semibold text-fg">{t("anchorLab.compare.title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-2">{t("anchorLab.compare.position", { index: index + 1, total: items.length })}</span>
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => { candidates.selectRelative(-1); }}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            {t("anchorLab.compare.prev")}
          </button>
          <button
            type="button"
            disabled={index >= items.length - 1}
            onClick={() => { candidates.selectRelative(1); }}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            {t("anchorLab.compare.next")}
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="text-xs text-fg-3">{t("anchorLab.compare.keys")}</p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-3xl">
        <ImageFrame
          url={anchorFrame ? anchorPreviewUrls.get(anchorFrame.imageSha256) : undefined}
          alt={t("anchorLab.compare.anchorAlt", { angle: anchorName })}
          caption={t("anchorLab.compare.anchor", { angle: anchorName })}
        />
        <ImageFrame
          url={candidatePreviewUrls.get(current.id)}
          alt={t("anchorLab.compare.candidateAlt", { name: current.name })}
          caption={t("anchorLab.compare.candidate", { name: current.name })}
        />
      </div>

      {comparison && percent !== null && selection ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-fg">{t("anchorLab.score.label")}</p>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tabular-nums text-fg">{t("anchorLab.score.value", { score: percent })}</span>
              <span className="text-sm font-medium text-fg-2">{t(BAND_KEYS[comparison.band])}</span>
              <span className="text-xs text-fg-3">{t("anchorLab.score.scale")}</span>
            </p>
            <div
              role="img"
              aria-label={t("anchorLab.score.meterLabel", { score: percent, band: t(BAND_KEYS[comparison.band]) })}
              className="h-2 w-full max-w-md overflow-hidden rounded-full bg-raised"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm text-fg-2">
              {candidates.anchorChoice === "best"
                ? t("anchorLab.score.bestAnchor", { angle: anchorName })
                : t("anchorLab.score.chosenAnchor", { angle: anchorName })}
            </p>
            <p className="text-xs leading-relaxed text-fg-3">
              {t("anchorLab.score.bandNote", {
                high: Math.round(ANCHOR_SCORE_BANDS.high * 100),
                medium: Math.round(ANCHOR_SCORE_BANDS.medium * 100),
              })}
            </p>
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-fg-2">{t("anchorLab.score.disclaimer")}</p>
          </div>

          {comparison.limits.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2">
              <p className="text-sm font-semibold text-fg">{t("anchorLab.score.reliability")}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
                {comparison.limits.map((limit) => <li key={limit}>{t(COMPARISON_LIMIT_KEYS[limit])}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-fg">{t("anchorLab.feature.title")}</h4>
            <ul className="space-y-2">
              {ANCHOR_FEATURE_IDS.map((id) => {
                const similarity = comparison.similarities[id];
                const weight = Math.round(comparison.weights[id] * 100);
                return (
                  <li key={id} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-3">
                    <span className="text-sm text-fg">{t(FEATURE_KEYS[id])}</span>
                    {similarity === null ? (
                      <span className="text-sm text-fg-3 sm:col-span-2">{t("anchorLab.feature.unavailable")}</span>
                    ) : (
                      <>
                        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-raised">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(similarity * 100)}%` }} />
                        </span>
                        <span className="text-sm tabular-nums text-fg-2">
                          {t("anchorLab.feature.value", { percent: Math.round(similarity * 100) })}
                          {" · "}
                          {t("anchorLab.feature.weight", { percent: weight })}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-fg-3">{t("anchorLab.feature.note")}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-fg">{t("anchorLab.diff.title")}</h4>
            <p className="text-xs text-fg-3">{t("anchorLab.diff.note")}</p>
            {selection.differences.length === 0 ? (
              <p className="text-sm text-fg-2">{t("anchorLab.diff.none")}</p>
            ) : (
              <ul className="space-y-1.5">
                {selection.differences.map((difference, position) => (
                  <li key={`${difference.id}:${difference.variant ?? ""}:${position}`} className="flex flex-wrap items-start gap-2 text-sm text-fg">
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                        difference.severity === "major" ? "border-bad/40 text-bad" : difference.severity === "notice" ? "border-warn/40 text-warn" : "border-line text-fg-3",
                      )}
                    >
                      {t(DIFFERENCE_SEVERITY_KEYS[difference.severity])}
                    </span>
                    <span className="min-w-0 flex-1">{resolveCopy(t, differenceCopy(difference))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : current.status === "failed" && current.errorCode ? (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
          {resolveCopy(t, captureErrorCopy(current.errorCode, current.errorParams))}
        </p>
      ) : current.status === "cancelled" ? (
        <p role="status" className="text-sm text-fg-2">{t("anchorLab.captureError.cancelled")}</p>
      ) : (
        <p role="status" className="text-sm text-fg-2">{t("anchorLab.compare.pending")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <button type="button" onClick={() => { candidates.retry([current.id]); }} className={buttonClass({ variant: "outline", size: "sm" })}>
            <RotateCw size={14} aria-hidden="true" />
            {t("anchorLab.compare.retry")}
          </button>
        ) : null}
        <button type="button" onClick={() => { candidates.remove(current.id); }} className={buttonClass({ variant: "ghost", size: "sm" })}>
          <Trash2 size={14} aria-hidden="true" />
          {t("anchorLab.compare.remove")}
        </button>
      </div>
    </section>
  );
}
