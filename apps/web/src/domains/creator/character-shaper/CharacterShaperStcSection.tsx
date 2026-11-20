/**
 * Character Shaper — `StudioStcGuidedFlowPanel` 정식 마운트 래퍼.
 *
 * 사진 → 특징 확인 → 초안 생성 3단계 안내(STC)를 기존 셰이퍼 바인딩
 * (`commitFaceParams`, `commitSemanticMorphs`, `commitHairParams`, `commitColor`)에
 * 직접 연결해 1클릭으로 현재 3D 캐릭터에 반영한다.
 */
import { useState } from "react";

import { InspectorSection } from "./CharacterShaperInspectorParts";
import { StudioStcGuidedFlowPanel } from "./StudioStcGuidedFlowPanel";

import type { StcShaperDraft } from "./stc-guided-flow";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";

export function CharacterShaperStcSection({
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "binding"> & { readonly locked: boolean }) {
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const handleHandOff = (draft: StcShaperDraft) => {
    if (locked) return;
    binding.commitFaceParams(draft.face, "STC 사진 닮은꼴: 얼굴 비율");
    binding.commitSemanticMorphs(draft.semanticMorphs, "STC 사진 닮은꼴: 이목구비");
    binding.commitHairParams(draft.hair, "STC 사진 닮은꼴: 헤어");
    if (draft.colors.skin) binding.commitColor("skin", draft.colors.skin);
    if (draft.colors.iris) binding.commitColor("iris", draft.colors.iris);
    setAppliedMessage(`초안을 3D 캐릭터에 적용했습니다 (${draft.summary.slice(0, 2).join(" · ")}).`);
  };

  return (
    <InspectorSection
      title="사진 닮은꼴 3단계 안내 (STC)"
      hint="사진은 기기 안에서만 미리보기로 쓰며 서버로 전송하지 않습니다."
      collapsible
      defaultOpen={false}
    >
      <div data-testid="shaper-stc-guided-flow-mount" className="space-y-2">
        <StudioStcGuidedFlowPanel onHandOff={handleHandOff} />
        {appliedMessage ? (
          <p role="status" className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent">
            {appliedMessage}
          </p>
        ) : null}
      </div>
    </InspectorSection>
  );
}
