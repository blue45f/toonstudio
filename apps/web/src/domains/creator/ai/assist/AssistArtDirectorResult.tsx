import "@/shared/ai/assist/ai-assist-i18n";

import { Check, Copy } from "lucide-react";

import { ASSIST_BUTTON, ASSIST_CARD } from "@/shared/ai/assist/assist-ui";
import { useAssistUsageText } from "@/shared/ai/assist/use-assist-usage-text";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  artDirectorReviewToMarkdown,
  describeArtDirectorArea,
  type ArtDirectorCategory,
  type ArtDirectorConfidence,
  type ArtDirectorRegion,
  type ArtDirectorSeverity,
} from "./assist-art-director";
import type { ArtDirectorRunResult } from "./assist-art-director-run";
import { mapArtDirectorIssuesToProductionLayers } from "./ai-webtoon-storyboard-assist";
import { AssistCopyStatus } from "./AssistCopyStatus";
import { useCopyFeedback } from "./use-copy-feedback";

import type { ArtDirectorHighlight } from "./AssistArtDirectorPreview";

const CATEGORY_KEY: Readonly<Record<ArtDirectorCategory, string>> = {
  reading_flow: "aiAssist.art.categoryReadingFlow",
  composition: "aiAssist.art.categoryComposition",
  balloon: "aiAssist.art.categoryBalloon",
  lettering: "aiAssist.art.categoryLettering",
  contrast: "aiAssist.art.categoryContrast",
  color: "aiAssist.art.categoryColor",
  anatomy: "aiAssist.art.categoryAnatomy",
  perspective: "aiAssist.art.categoryPerspective",
  pacing: "aiAssist.art.categoryPacing",
  mobile_readability: "aiAssist.art.categoryMobileReadability",
  consistency: "aiAssist.art.categoryConsistency",
  other: "aiAssist.art.categoryOther",
};

const SEVERITY_KEY: Readonly<Record<ArtDirectorSeverity, string>> = {
  high: "aiAssist.art.severityHigh",
  medium: "aiAssist.art.severityMedium",
  low: "aiAssist.art.severityLow",
};

const SEVERITY_TONE: Readonly<Record<ArtDirectorSeverity, string>> = {
  high: "border-bad/40 bg-bad/10 text-bad",
  medium: "border-warn/40 bg-warn/10 text-warn",
  low: "border-line bg-raised text-fg-2",
};

const CONFIDENCE_KEY: Readonly<Record<ArtDirectorConfidence, string>> = {
  high: "aiAssist.art.confidenceHigh",
  medium: "aiAssist.art.confidenceMedium",
  low: "aiAssist.art.confidenceLow",
};

const VERTICAL_KEY = {
  top: "aiAssist.art.areaTop",
  middle: "aiAssist.art.areaMiddle",
  bottom: "aiAssist.art.areaBottom",
} as const;

const HORIZONTAL_KEY = {
  left: "aiAssist.art.areaLeft",
  center: "aiAssist.art.areaCenter",
  right: "aiAssist.art.areaRight",
} as const;

function sameHighlight(left: ArtDirectorHighlight | null, right: ArtDirectorHighlight): boolean {
  if (left?.kind === "issue" && right.kind === "issue") return left.id === right.id;
  if (left?.kind === "step" && right.kind === "step") return left.step === right.step;
  return false;
}

function useAreaText() {
  const t = useT();
  return (region: ArtDirectorRegion | null): string | null => {
    if (!region) return null;
    const area = describeArtDirectorArea(region);
    if (area.whole) return t("aiAssist.art.areaWhole");
    return t("aiAssist.art.areaLine", {
      vertical: t(VERTICAL_KEY[area.vertical]),
      horizontal: t(HORIZONTAL_KEY[area.horizontal]),
    });
  };
}

function ScoreMeter({ label, score }: { readonly label: string; readonly score: number }) {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-bold text-fg-2">{label}</p>
      <div
        role="img"
        aria-label={t("aiAssist.art.scoreAria", { label, score })}
        className="mt-1 flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={cn("h-2 flex-1 rounded-full", step <= score ? "bg-accent" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

export interface AssistArtDirectorResultProps {
  readonly result: ArtDirectorRunResult;
  readonly highlight: ArtDirectorHighlight | null;
  readonly onHighlight: (next: ArtDirectorHighlight | null) => void;
}

export function AssistArtDirectorResult({ result, highlight, onHighlight }: AssistArtDirectorResultProps) {
  const t = useT();
  const areaText = useAreaText();
  const usageOf = useAssistUsageText();
  const { review } = result;
  const clipboard = useCopyFeedback<"review">();
  const copied = clipboard.copied === "review";
  const layerActions = mapArtDirectorIssuesToProductionLayers(review);
  const layerActionByIssueId = new Map(layerActions.map((item) => [item.issueId, item]));

  const toggle = (next: ArtDirectorHighlight) => {
    onHighlight(sameHighlight(highlight, next) ? null : next);
  };

  const usageText = usageOf(result);

  return (
    <section aria-label={t("aiAssist.art.resultTitle")} className={cn(ASSIST_CARD, "space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-fg">{t("aiAssist.art.resultTitle")}</h3>
        {clipboard.canCopy ? (
          <button type="button" className={ASSIST_BUTTON} onClick={() => clipboard.copy("review", artDirectorReviewToMarkdown(review))}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? t("aiAssist.art.copied") : t("aiAssist.art.copy")}
          </button>
        ) : null}
      </div>
      <AssistCopyStatus copied={copied} failed={clipboard.failed} />

      <div>
        <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.summary")}</h4>
        <p className="mt-1 whitespace-pre-line text-sm text-fg">{review.summary}</p>
      </div>

      <div>
        <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.scoresTitle")}</h4>
        <div className="mt-2 flex gap-3">
          <ScoreMeter label={t("aiAssist.art.scoreComposition")} score={review.scores.composition} />
          <ScoreMeter label={t("aiAssist.art.scoreReadability")} score={review.scores.readability} />
          <ScoreMeter label={t("aiAssist.art.scoreMood")} score={review.scores.mood} />
        </div>
      </div>

      {review.strengths.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.strengths")}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
            {review.strengths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {review.readingOrder.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.readingOrder")}</h4>
          <ol className="mt-1 space-y-1">
            {review.readingOrder.map((step) => {
              const selected = sameHighlight(highlight, { kind: "step", step: step.step });
              const area = areaText(step.region);
              return (
                <li key={step.step}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={!step.region}
                    onClick={() => toggle({ kind: "step", step: step.step })}
                    className={cn(
                      "flex min-h-11 w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default",
                      selected ? "border-accent bg-accent/10" : "border-line hover:bg-raised disabled:hover:bg-transparent",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">{step.step}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-fg">{step.label}</span>
                      {area ? <span className="block text-xs text-fg-3">{area}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <div>
        <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.issues")}</h4>
        {review.issues.length === 0 ? (
          <p className="mt-1 text-sm text-fg-2">{t("aiAssist.art.issuesNone")}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-fg-3">{t("aiAssist.art.overlayHint")}</p>
            <ol className="mt-2 space-y-2">
              {review.issues.map((issue, index) => {
                const selected = sameHighlight(highlight, { kind: "issue", id: issue.id });
                const area = areaText(issue.region);
                return (
                  <li
                    key={issue.id}
                    className={cn("rounded-xl border p-3", selected ? "border-accent bg-accent/5" : "border-line")}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={!issue.region}
                      onClick={() => toggle({ kind: "issue", id: issue.id })}
                      className="flex min-h-11 w-full flex-wrap items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-xs font-bold text-canvas">{index + 1}</span>
                      <span className="min-w-0 flex-1 text-sm font-bold text-fg">{issue.title}</span>
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[0.6875rem] font-semibold">
                      <span className={cn("rounded-full border px-2 py-0.5", SEVERITY_TONE[issue.severity])}>{t(SEVERITY_KEY[issue.severity])}</span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-fg-2">{t(CATEGORY_KEY[issue.category])}</span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{t(CONFIDENCE_KEY[issue.confidence])}</span>
                      {layerActionByIssueId.get(issue.id) ? (
                        <span
                          data-art-director-layer-badge={layerActionByIssueId.get(issue.id)?.targetLayerId}
                          className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-accent"
                        >
                          {layerActionByIssueId.get(issue.id)?.targetLayerLabelKo}
                        </span>
                      ) : null}
                    </div>
                    {issue.detail ? <p className="mt-2 text-sm text-fg">{issue.detail}</p> : null}
                    {issue.fix ? (
                      <p className="mt-1 text-sm text-fg-2">
                        <span className="font-bold text-fg">{t("aiAssist.art.fixLabel")}</span> {issue.fix}
                      </p>
                    ) : null}
                    {area ? <p className="mt-1 text-xs text-fg-3">{area}</p> : null}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {layerActions.length > 0 ? (
        <div
          data-art-director-layer-summary="true"
          className="space-y-1.5 rounded-xl border border-accent/25 bg-accent/5 p-3"
        >
          <h4 className="text-xs font-bold text-accent">
            리얼드로우 4레이어 프로덕션 공정별 수정 매핑
          </h4>
          <ul className="space-y-1 text-xs text-fg-2">
            {layerActions.map((action) => (
              <li key={action.issueId} className="flex flex-wrap items-baseline gap-1.5">
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.65rem] font-bold text-accent">
                  {action.targetLayerLabelKo}
                </span>
                <span className="text-fg">{action.actionSummaryKo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.nextActions.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("aiAssist.art.nextActions")}</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-fg">
            {review.nextActions.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      ) : null}

      <div className="space-y-1 border-t border-line pt-3 text-xs text-fg-3">
        {review.trimmed > 0 ? (
          <p className="font-semibold text-warn" data-claude-trimmed="true">{t("aiAssist.common.trimmedNotice", { count: review.trimmed })}</p>
        ) : null}
        <p>{usageText}</p>
        <p>{t("aiAssist.art.overlayNote")}</p>
      </div>
    </section>
  );
}
