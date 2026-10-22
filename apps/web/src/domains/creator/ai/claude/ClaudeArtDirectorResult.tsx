import "@/shared/ai/claude/claude-assist-i18n";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CLAUDE_BUTTON, CLAUDE_CARD } from "@/shared/ai/claude/claude-ui";
import { useClaudeUsageText } from "@/shared/ai/claude/use-claude-usage-text";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  artDirectorReviewToMarkdown,
  describeArtDirectorArea,
  type ArtDirectorCategory,
  type ArtDirectorConfidence,
  type ArtDirectorRegion,
  type ArtDirectorSeverity,
} from "./claude-art-director";
import type { ArtDirectorRunResult } from "./claude-art-director-run";
import type { ArtDirectorHighlight } from "./ClaudeArtDirectorPreview";

const CATEGORY_KEY: Readonly<Record<ArtDirectorCategory, string>> = {
  reading_flow: "claudeAssist.art.categoryReadingFlow",
  composition: "claudeAssist.art.categoryComposition",
  balloon: "claudeAssist.art.categoryBalloon",
  lettering: "claudeAssist.art.categoryLettering",
  contrast: "claudeAssist.art.categoryContrast",
  color: "claudeAssist.art.categoryColor",
  anatomy: "claudeAssist.art.categoryAnatomy",
  perspective: "claudeAssist.art.categoryPerspective",
  pacing: "claudeAssist.art.categoryPacing",
  mobile_readability: "claudeAssist.art.categoryMobileReadability",
  consistency: "claudeAssist.art.categoryConsistency",
  other: "claudeAssist.art.categoryOther",
};

const SEVERITY_KEY: Readonly<Record<ArtDirectorSeverity, string>> = {
  high: "claudeAssist.art.severityHigh",
  medium: "claudeAssist.art.severityMedium",
  low: "claudeAssist.art.severityLow",
};

const SEVERITY_TONE: Readonly<Record<ArtDirectorSeverity, string>> = {
  high: "border-bad/40 bg-bad/10 text-bad",
  medium: "border-warn/40 bg-warn/10 text-warn",
  low: "border-line bg-raised text-fg-2",
};

const CONFIDENCE_KEY: Readonly<Record<ArtDirectorConfidence, string>> = {
  high: "claudeAssist.art.confidenceHigh",
  medium: "claudeAssist.art.confidenceMedium",
  low: "claudeAssist.art.confidenceLow",
};

const VERTICAL_KEY = {
  top: "claudeAssist.art.areaTop",
  middle: "claudeAssist.art.areaMiddle",
  bottom: "claudeAssist.art.areaBottom",
} as const;

const HORIZONTAL_KEY = {
  left: "claudeAssist.art.areaLeft",
  center: "claudeAssist.art.areaCenter",
  right: "claudeAssist.art.areaRight",
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
    if (area.whole) return t("claudeAssist.art.areaWhole");
    return t("claudeAssist.art.areaLine", {
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
        aria-label={t("claudeAssist.art.scoreAria", { label, score })}
        className="mt-1 flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={cn("h-2 flex-1 rounded-full", step <= score ? "bg-accent" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

export interface ClaudeArtDirectorResultProps {
  readonly result: ArtDirectorRunResult;
  readonly highlight: ArtDirectorHighlight | null;
  readonly onHighlight: (next: ArtDirectorHighlight | null) => void;
}

export function ClaudeArtDirectorResult({ result, highlight, onHighlight }: ClaudeArtDirectorResultProps) {
  const t = useT();
  const areaText = useAreaText();
  const usageOf = useClaudeUsageText();
  const { review } = result;
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copy = () => {
    void navigator.clipboard.writeText(artDirectorReviewToMarkdown(review)).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2_000);
    }, () => undefined);
  };

  const toggle = (next: ArtDirectorHighlight) => {
    onHighlight(sameHighlight(highlight, next) ? null : next);
  };

  const usageText = usageOf(result);

  return (
    <section aria-label={t("claudeAssist.art.resultTitle")} className={cn(CLAUDE_CARD, "space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-fg">{t("claudeAssist.art.resultTitle")}</h3>
        {canCopy ? (
          <button type="button" className={CLAUDE_BUTTON} onClick={copy}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? t("claudeAssist.art.copied") : t("claudeAssist.art.copy")}
          </button>
        ) : null}
      </div>

      <div>
        <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.summary")}</h4>
        <p className="mt-1 whitespace-pre-line text-sm text-fg">{review.summary}</p>
      </div>

      <div>
        <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.scoresTitle")}</h4>
        <div className="mt-2 flex gap-3">
          <ScoreMeter label={t("claudeAssist.art.scoreComposition")} score={review.scores.composition} />
          <ScoreMeter label={t("claudeAssist.art.scoreReadability")} score={review.scores.readability} />
          <ScoreMeter label={t("claudeAssist.art.scoreMood")} score={review.scores.mood} />
        </div>
      </div>

      {review.strengths.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.strengths")}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
            {review.strengths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {review.readingOrder.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.readingOrder")}</h4>
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
        <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.issues")}</h4>
        {review.issues.length === 0 ? (
          <p className="mt-1 text-sm text-fg-2">{t("claudeAssist.art.issuesNone")}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.art.overlayHint")}</p>
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
                    </div>
                    {issue.detail ? <p className="mt-2 text-sm text-fg">{issue.detail}</p> : null}
                    {issue.fix ? (
                      <p className="mt-1 text-sm text-fg-2">
                        <span className="font-bold text-fg">{t("claudeAssist.art.fixLabel")}</span> {issue.fix}
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

      {review.nextActions.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.art.nextActions")}</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-fg">
            {review.nextActions.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      ) : null}

      <div className="space-y-1 border-t border-line pt-3 text-xs text-fg-3">
        <p>{usageText}</p>
        <p>{t("claudeAssist.art.overlayNote")}</p>
      </div>
    </section>
  );
}
