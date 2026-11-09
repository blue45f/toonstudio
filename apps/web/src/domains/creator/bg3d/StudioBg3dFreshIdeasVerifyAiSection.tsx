import { CheckCircle2, Layers, Link2, Sparkles, Wand2 } from "lucide-react";

import type {
  BlenderSceneVerifyAiReport,
  FreshIdeaLensId,
  FreshIdeaLensRemix,
} from "./studio-bg3d-fresh-ideas-verify-ai";
import type {
  VerifyAiPreflightGateReport,
  WebtoonCutArchetypeId,
} from "./studio-bg3d-shot-continuity-linked-ink";

const CUT_ARCHETYPE_OPTIONS: readonly {
  readonly id: WebtoonCutArchetypeId;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "dialogue-medium", labelKo: "일상 대화·미디엄" },
  { id: "emotion-closeup", labelKo: "감정 클로즈업·회상" },
  { id: "action-impact", labelKo: "액션 타격·클라이맥스" },
  { id: "horror-pressure", labelKo: "호러·심리적 압박" },
]);

export interface StudioBg3dFreshIdeasVerifyAiSectionProps {
  readonly disabled?: boolean;
  readonly verifyAiReport: BlenderSceneVerifyAiReport;
  readonly activeLensRemix: FreshIdeaLensRemix;
  readonly preflightReport: VerifyAiPreflightGateReport;
  readonly selectedArchetypeId: WebtoonCutArchetypeId;
  readonly artisticOverride: boolean;
  readonly onSelectLensId: (lensId: FreshIdeaLensId) => void;
  readonly onSelectArchetypeId: (archetypeId: WebtoonCutArchetypeId) => void;
  readonly onToggleArtisticOverride: (enabled: boolean) => void;
  readonly onApplyArchetypePreset?: (archetypeId: WebtoonCutArchetypeId) => void;
  readonly onSelectFreshIdeaLens?: (lensId: FreshIdeaLensId, pitchKo: string) => void;
  readonly onVerifyAiGate?: (overallScore: number, passed: boolean) => void;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioBg3dFreshIdeasVerifyAiSection({
  disabled = false,
  verifyAiReport,
  activeLensRemix,
  preflightReport,
  selectedArchetypeId,
  artisticOverride,
  onSelectLensId,
  onSelectArchetypeId,
  onToggleArtisticOverride,
  onApplyArchetypePreset,
  onSelectFreshIdeaLens,
  onVerifyAiGate,
  onStatusChange,
}: StudioBg3dFreshIdeasVerifyAiSectionProps) {
  return (
    <section
      data-testid="bg3d-blender-fresh-ideas-verify-ai-section"
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel/50 p-2.5"
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

      {/* Phase 2: 3D Shot 연속성(S_CD) · Live 2D↔3D Linked Ink(BRI) · 컷 아키타입 추천(PRS) · V01~V10 하드 게이트 */}
      <div
        data-testid="bg3d-blender-phase2-preflight-panel"
        className="flex flex-col gap-2 rounded border border-line bg-card p-2.5 text-[0.63rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Layers className="size-3.5 text-accent" aria-hidden />
            샷 오버라이드 연속성(S_CD) · Linked Ink 브리지(BRI) · 컷 아키타입 추천(PRS)
          </span>
          <span
            data-testid="bg3d-blender-preflight-summary-badge"
            className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.6rem] font-semibold text-accent"
          >
            {preflightReport.summaryBadgeKo}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-semibold text-fg-2">콘티 아키타입:</span>
            {CUT_ARCHETYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-archetype-${opt.id}`}
                onClick={() => {
                  onSelectArchetypeId(opt.id);
                  onApplyArchetypePreset?.(opt.id);
                }}
                className={`min-h-11 rounded border px-2.5 py-1 text-[0.61rem] ${
                  selectedArchetypeId === opt.id
                    ? "border-accent bg-accent/20 font-bold text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                }`}
              >
                {opt.labelKo}
              </button>
            ))}
          </div>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1 text-[0.61rem]">
            <input
              type="checkbox"
              disabled={disabled}
              data-testid="bg3d-blender-artistic-override-checkbox"
              checked={artisticOverride}
              onChange={(e) => onToggleArtisticOverride(e.target.checked)}
              className="accent-accent"
            />
            <Wand2 className="size-3 text-accent" aria-hidden />
            <span>예술적 허용(과장 구도) 오버라이드</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <div
            data-testid="bg3d-blender-scd-readout"
            className="rounded border border-line bg-panel/60 px-2 py-1.5"
          >
            <div className="font-semibold text-fg">
              1. Shot 연속성 (S_CD = {preflightReport.shotContinuity.continuityDriftScore})
            </div>
            <p className="mt-0.5 text-[0.59rem] text-fg-2">
              {preflightReport.shotContinuity.remediationKo}
            </p>
          </div>

          <div
            data-testid="bg3d-blender-bri-readout"
            className="rounded border border-line bg-panel/60 px-2 py-1.5"
          >
            <div className="flex items-center gap-1 font-semibold text-fg">
              <Link2 className="size-3 text-accent" aria-hidden />
              <span>
                2. Linked Ink (BRI = {preflightReport.linkedInkBridge.bridgeReliabilityIndex})
              </span>
            </div>
            <p className="mt-0.5 text-[0.59rem] text-fg-2">
              {preflightReport.linkedInkBridge.remediationKo}
            </p>
          </div>

          <div
            data-testid="bg3d-blender-prs-readout"
            className="rounded border border-line bg-panel/60 px-2 py-1.5"
          >
            <div className="flex items-center gap-1 font-semibold text-fg">
              <CheckCircle2 className="size-3 text-accent" aria-hidden />
              <span>
                3. 추천 매칭 (PRS = {preflightReport.archetypeRecommendation.presetRecommendationScore}점)
              </span>
            </div>
            <p className="mt-0.5 text-[0.59rem] text-fg-2">
              {preflightReport.archetypeRecommendation.rationaleKo}
            </p>
          </div>
        </div>
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
              verifyAiReport.evaluation.passed && preflightReport.hardGatePassed,
            );
            onStatusChange?.(
              `${verifyAiReport.summaryBadgeKo} · ${preflightReport.summaryBadgeKo}`,
            );
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
