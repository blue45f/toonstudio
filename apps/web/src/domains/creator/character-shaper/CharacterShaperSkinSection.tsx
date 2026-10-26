/**
 * Character Shaper — 피부색(A-11).
 *
 * 레시피 색 `skin` 은 예전부터 binding(`commitColor("skin")` → 사용자 색 `body`)에 있었지만 이를
 * 부르는 화면이 없어 요약 막대에 "피부 색 없음" 만 떴다. 얼굴형·체형 인스펙터 맨 위에서 고른다.
 * 얼굴 피부와 몸 피부는 같은 색으로 함께 물든다(`vrm/studio-vrm-custom-color-target.ts`). 비우면 모델 원본 피부.
 */
import { useState } from "react";

import { computeShaperMaterialDataUniforms } from "./character-shaper-tripo-mcp";
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
  const [shadePos, setShadePos] = useState(0.5);
  const [shadeWidth, setShadeWidth] = useState(0.12);
  const [rLightWidth, setRLightWidth] = useState(0.25);
  const [outlinePressure, setOutlinePressure] = useState(true);
  const [disableHairInline, setDisableHairInline] = useState(true);

  const uniforms = computeShaperMaterialDataUniforms({
    shadePos,
    shadeWidth,
    rLightPos: 0.82,
    rLightWidth,
    outlinePressure,
    disableHairInline,
  });

  return (
    <>
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

      <InspectorSection
        title="SHAPER 3차 MatCap 음영 · 비등방 외곽선"
        hint="MaterialData::ApplyShadeLine (125·(1-w)³) 실시간 MatCap 램프와 필압 주선(1.5×0.3), 헤어 내부 주선 억제(hID*1)를 조절합니다."
      >
        <div
          data-testid="shaper-inspector-material-section"
          className="space-y-2 rounded-xl border border-line/70 bg-card/70 p-2.5 text-[0.7rem]"
        >
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>MatCap 음영 경계</span>
            <input
              type="range"
              aria-label="MatCap 음영 경계"
              min={0}
              max={1}
              step={0.02}
              value={shadePos}
              disabled={locked}
              onChange={(event) => setShadePos(Number(event.currentTarget.value))}
              className="w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] text-fg-3">
              {shadePos.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>MatCap 음영 폭</span>
            <input
              type="range"
              aria-label="MatCap 음영 폭"
              min={0}
              max={1}
              step={0.02}
              value={shadeWidth}
              disabled={locked}
              onChange={(event) => setShadeWidth(Number(event.currentTarget.value))}
              className="w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] text-fg-3">
              {shadeWidth.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>반사광 폭</span>
            <input
              type="range"
              aria-label="반사광 폭"
              min={0}
              max={1}
              step={0.02}
              value={rLightWidth}
              disabled={locked}
              onChange={(event) => setRLightWidth(Number(event.currentTarget.value))}
              className="w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] text-fg-3">
              {rLightWidth.toFixed(2)}
            </span>
          </label>
          <div className="flex flex-wrap gap-3 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-fg-2">
              <input
                type="checkbox"
                checked={outlinePressure}
                disabled={locked}
                onChange={(event) => setOutlinePressure(event.currentTarget.checked)}
                className="size-3.5 rounded border-line accent-accent"
              />
              <span>비등방 필압 외곽선 (1.5×0.3)</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-fg-2">
              <input
                type="checkbox"
                checked={disableHairInline}
                disabled={locked}
                onChange={(event) => setDisableHairInline(event.currentTarget.checked)}
                className="size-3.5 rounded border-line accent-accent"
              />
              <span>헤어 내부 주선 억제 (hID*1)</span>
            </label>
          </div>
          <p
            data-testid="shaper-inspector-material-readout"
            className="rounded-lg bg-raised/80 px-2 py-1 font-mono text-[0.64rem] text-fg-3"
          >
            {uniforms.summaryLabel} · MToon Toony {uniforms.mtoonShadingToonyFactor.toFixed(2)}
          </p>
        </div>
      </InspectorSection>
    </>
  );
}
