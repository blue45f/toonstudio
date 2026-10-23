/**
 * Character Shaper — 피부색(A-11).
 *
 * 레시피 색 `skin` 은 예전부터 binding(`commitColor("skin")` → 사용자 색 `body`)에 있었지만 이를
 * 부르는 화면이 없어 요약 막대에 "피부 색 없음" 만 떴다. 얼굴형·체형 인스펙터 맨 위에서 고른다.
 * 얼굴 피부와 몸 피부는 같은 색으로 함께 물든다(`vrm/studio-vrm-custom-color-target.ts`). 비우면 모델 원본 피부.
 */
import { CharacterColorControl } from "./CharacterShaperControls";
import { InspectorSection } from "./CharacterShaperInspectorParts";

import type { CharacterColorSwatch } from "./CharacterShaperControls";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";

/** 밝은 톤부터 깊은 톤까지 9가지 + 판타지 3가지. */
const CHARACTER_SKIN_TONE_SWATCHES: readonly CharacterColorSwatch[] = Object.freeze([
  { color: "#f9e4d6", label: "도자기" },
  { color: "#f3d3bd", label: "아이보리" },
  { color: "#ecc0a1", label: "라이트 피치" },
  { color: "#dca581", label: "웜 베이지" },
  { color: "#c68b5e", label: "허니" },
  { color: "#b0764b", label: "탠" },
  { color: "#93593a", label: "카라멜" },
  { color: "#7a4a2e", label: "브라운" },
  { color: "#5a3523", label: "딥 브라운" },
  { color: "#c8d7ef", label: "창백한 블루(판타지)" },
  { color: "#b7d9ae", label: "그린(판타지)" },
  { color: "#d6c1ea", label: "라일락(판타지)" },
]);

export function CharacterShaperSkinSection({
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "binding"> & { readonly locked: boolean }) {
  return (
    <InspectorSection
      title="피부색"
      hint="얼굴과 몸의 피부를 함께 물들입니다. 텍스처 명암은 그대로 두고, 그림자 색도 같은 톤으로 맞춥니다."
    >
      <CharacterColorControl
        label="피부색"
        value={binding.recipe.colors.skin}
        swatches={CHARACTER_SKIN_TONE_SWATCHES}
        allowClear
        disabled={locked}
        hint="비우면 모델 원본 피부색으로 돌아갑니다."
        onCommit={(color) => binding.commitColor("skin", color)}
      />
    </InspectorSection>
  );
}
