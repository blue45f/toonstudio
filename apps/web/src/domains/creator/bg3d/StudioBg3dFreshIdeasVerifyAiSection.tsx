import { Sparkles } from "lucide-react";

import type {
  BlenderSceneVerifyAiReport,
  FreshIdeaLensId,
  FreshIdeaLensRemix,
} from "./studio-bg3d-fresh-ideas-verify-ai";

export interface StudioBg3dFreshIdeasVerifyAiSectionProps {
  readonly disabled?: boolean;
  readonly verifyAiReport: BlenderSceneVerifyAiReport;
  readonly activeLensRemix: FreshIdeaLensRemix;
  readonly onSelectLensId: (lensId: FreshIdeaLensId) => void;
  readonly onSelectFreshIdeaLens?: (lensId: FreshIdeaLensId, pitchKo: string) => void;
  readonly onVerifyAiGate?: (overallScore: number, passed: boolean) => void;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioBg3dFreshIdeasVerifyAiSection({
  disabled = false,
  verifyAiReport,
  activeLensRemix,
  onSelectLensId,
  onSelectFreshIdeaLens,
  onVerifyAiGate,
  onStatusChange,
}: StudioBg3dFreshIdeasVerifyAiSectionProps) {
  return (
    <section
      data-testid="bg3d-blender-fresh-ideas-verify-ai-section"
      className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-semibold text-fg">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          5B. 5-Lens 연출 아이디어 리믹스 & Verify AI 품질 게이트
        </span>
        <span
          data-testid="bg3d-blender-verify-ai-badge"
          className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.62rem] font-semibold text-accent"
        >
          {verifyAiReport.summaryBadgeKo}
        </span>
      </div>

      <p
        data-testid="bg3d-blender-remix-header"
        className="font-mono text-[0.62rem] text-fg-2"
      >
        {verifyAiReport.remixHeaderKo}
      </p>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
        {verifyAiReport.remixes.map((remix) => {
          const active = remix.id === activeLensRemix.id;
          return (
            <button
              key={remix.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-blender-fresh-lens-${remix.id}`}
              onClick={() => {
                onSelectLensId(remix.id);
                onSelectFreshIdeaLens?.(remix.id, remix.pitchKo);
                onStatusChange?.(`${remix.badgeKo}: ${remix.pitchKo}`);
              }}
              className={`flex min-h-11 flex-col items-start justify-center rounded border px-2 py-1.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent/15 font-bold text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              <span className="text-[0.58rem] text-fg-3">{remix.badgeKo}</span>
              <span className="line-clamp-1 text-[0.64rem]">{remix.pitchKo}</span>
            </button>
          );
        })}
      </div>

      <div
        data-testid="bg3d-blender-fresh-lens-detail"
        className="flex flex-col gap-1.5 rounded border border-line bg-card p-2.5 text-[0.65rem]"
      >
        <div className="font-bold text-fg">
          {activeLensRemix.badgeKo}: {activeLensRemix.lensTitle}
        </div>
        <p className="leading-relaxed text-fg-2">
          → <strong>Angle:</strong> {activeLensRemix.angleKo}
        </p>
        {activeLensRemix.actionableStepsKo && (
          <ol className="list-inside list-decimal space-y-0.5 text-[0.62rem] text-fg-2">
            {activeLensRemix.actionableStepsKo.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2.5 py-1.5 text-[0.62rem]">
        <span data-testid="bg3d-blender-verify-ai-dimensions" className="font-mono text-fg-2">
          캐릭터 정합성 {verifyAiReport.evaluation.dimensionScores.characterIdentity} · 스타일 일관성{" "}
          {verifyAiReport.evaluation.dimensionScores.styleConsistency} · 가독성{" "}
          {verifyAiReport.evaluation.dimensionScores.compositionReadability} · 편집성{" "}
          {verifyAiReport.evaluation.dimensionScores.editability} · 저작권·출처{" "}
          {verifyAiReport.evaluation.dimensionScores.rightsAndProvenance}
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-verify-ai-run-btn"
          onClick={() => {
            onVerifyAiGate?.(
              verifyAiReport.evaluation.overallScore,
              verifyAiReport.evaluation.passed,
            );
            onStatusChange?.(verifyAiReport.summaryBadgeKo);
          }}
          className="inline-flex min-h-11 items-center gap-1 rounded bg-accent px-3 py-1 text-[0.65rem] font-bold text-on-accent"
        >
          <Sparkles className="size-3" aria-hidden />
          <span>Verify AI 품질 게이트 검증 확정</span>
        </button>
      </div>
    </section>
  );
}
