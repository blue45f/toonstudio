import "@/shared/ai/claude/claude-assist-i18n";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import type { ArtDirectorRegion, ArtDirectorReview, ArtDirectorSeverity } from "./claude-art-director";

/** 목록에서 고른 항목. 이미지에서는 이 항목의 영역만 강조한다. */
export type ArtDirectorHighlight =
  | { readonly kind: "issue"; readonly id: string }
  | { readonly kind: "step"; readonly step: number };

export interface ClaudeArtDirectorPreviewProps {
  /** 실제로 보낸 이미지와 같은 바이트를 가리키는 주소. 그래서 좌표가 어긋나지 않는다. */
  readonly url: string;
  readonly review: ArtDirectorReview | null;
  readonly showOverlay: boolean;
  readonly highlight: ArtDirectorHighlight | null;
}

const SEVERITY_BORDER: Readonly<Record<ArtDirectorSeverity, string>> = {
  high: "border-bad",
  medium: "border-warn",
  low: "border-accent",
};

function boxStyle(region: ArtDirectorRegion) {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  };
}

function Marker({ label, tone }: { readonly label: number; readonly tone: string }) {
  return (
    <span
      className={cn(
        "absolute -left-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-br px-1 text-[0.6875rem] font-bold leading-none text-white",
        tone,
      )}
    >
      {label}
    </span>
  );
}

/**
 * 보낸 이미지와 모델이 짚은 영역. 영역은 모델이 추정한 대략의 위치라 정확한 마스크가 아니며, 화면 읽기 도구에서는
 * 같은 정보가 목록의 "위치" 문장으로 전달되므로 오버레이 자체는 장식(aria-hidden)이다.
 */
export function ClaudeArtDirectorPreview({ url, review, showOverlay, highlight }: ClaudeArtDirectorPreviewProps) {
  const t = useT();
  const issues = review?.issues ?? [];
  const steps = review?.readingOrder ?? [];
  const activeIssue = highlight?.kind === "issue" ? highlight.id : null;
  const activeStep = highlight?.kind === "step" ? highlight.step : null;

  return (
    <div className="flex justify-center rounded-xl border border-line bg-raised p-2">
      <div className="relative inline-block max-w-full leading-[0]">
        <img
          src={url}
          alt={t("claudeAssist.art.previewAlt")}
          draggable={false}
          className="block h-auto max-h-[70dvh] w-auto max-w-full rounded-md bg-white"
        />
        {showOverlay && review ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-art-director-overlay="true">
            {activeStep === null
              ? issues.map((issue, index) => (issue.region ? (
                <span
                  key={issue.id}
                  data-overlay-issue={issue.id}
                  style={boxStyle(issue.region)}
                  className={cn(
                    "absolute rounded-sm border-2 transition-opacity",
                    SEVERITY_BORDER[issue.severity],
                    activeIssue === null ? "bg-white/0 opacity-80" : activeIssue === issue.id ? "bg-accent/15 opacity-100 ring-2 ring-white" : "opacity-25",
                  )}
                >
                  <Marker label={index + 1} tone="bg-black/75" />
                </span>
              ) : null))
              : steps.map((step) => (step.step === activeStep && step.region ? (
                <span
                  key={step.step}
                  data-overlay-step={step.step}
                  style={boxStyle(step.region)}
                  className="absolute rounded-sm border-2 border-accent bg-accent/15 ring-2 ring-white"
                >
                  <Marker label={step.step} tone="bg-accent" />
                </span>
              ) : null))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
