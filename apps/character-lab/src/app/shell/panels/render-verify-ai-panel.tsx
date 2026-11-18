/** 렌더 설정의 연출 리믹스 선택과 Verify AI 보정 제안 표시를 맡는다. */
import { useMemo, useState } from "react";

import { evaluateCharacterLabVerifyAiGate, type CharacterLabFreshLensId } from "../../../render/style/character-verify-ai-fresh-ideas";

import type { ShadingProfile } from "../../../contracts";
import type { LabShaperGen3dLookId } from "../../../render/shaper-gen3d-bridge";

interface RenderVerifyAiPanelProps {
  readonly shading: ShadingProfile;
  readonly lookId: LabShaperGen3dLookId;
  readonly delight: boolean;
  readonly disableHairInline: boolean;
  readonly onApplyShading: (profile: Partial<ShadingProfile>) => void;
}

export function RenderVerifyAiPanel({ shading, lookId, delight, disableHairInline, onApplyShading }: RenderVerifyAiPanelProps) {
  const [selectedLensId, setSelectedLensId] = useState<CharacterLabFreshLensId>("contrarian-take");
  const verifyAiReport = useMemo(
    () => evaluateCharacterLabVerifyAiGate({ shading, lookId, delight, disableHairInline }),
    [shading, lookId, delight, disableHairInline],
  );
  const activeLensRemix = useMemo(
    () => verifyAiReport.remixes.find((remix) => remix.id === selectedLensId) ?? verifyAiReport.remixes[0]!,
    [verifyAiReport.remixes, selectedLensId],
  );

  return (
    <fieldset className="cl-render-group" data-testid="character-lab-verify-ai-panel">
      <legend>Character Labs × 5-Lens 연출 리믹스 & Verify AI 턴어라운드 품질 게이트</legend>
      <p className="cl-render-status" data-testid="character-lab-verify-ai-badge">
        {verifyAiReport.summaryBadgeKo}
      </p>
      <p className="cl-render-hint" data-testid="character-lab-remix-header">
        {verifyAiReport.remixHeaderKo}
      </p>
      <div className="cl-render-row" role="group" aria-label="캐릭터 5-Lens 크리에이티브 리믹스">
        {verifyAiReport.remixes.map((remix) => (
          <button
            key={remix.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`character-lab-fresh-lens-${remix.id}`}
            aria-pressed={remix.id === activeLensRemix.id}
            onClick={() => setSelectedLensId(remix.id)}
          >
            {remix.badgeKo}
          </button>
        ))}
      </div>
      <div data-testid="character-lab-fresh-lens-detail">
        <p className="cl-render-hint">
          <strong>{activeLensRemix.badgeKo}: {activeLensRemix.titleKo}</strong>
        </p>
        <p className="cl-render-hint">
          → <strong>Angle:</strong> {activeLensRemix.angleKo}
        </p>
        {activeLensRemix.actionableStepsKo ? (
          <ol className="cl-render-hint" data-testid="character-lab-fresh-lens-steps">
            {activeLensRemix.actionableStepsKo.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className="cl-render-row">
        <span className="cl-render-hint" data-testid="character-lab-remediation-readout">
          {verifyAiReport.remediationKo}
        </span>
        <button
          type="button"
          data-testid="character-lab-apply-verify-ai-patch-btn"
          onClick={() => onApplyShading(verifyAiReport.recommendedShadingPatch)}
        >
          Verify AI 캐릭터 툰 최적 보정 적용
        </button>
      </div>
    </fieldset>
  );
}
