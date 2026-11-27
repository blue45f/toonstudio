/** 3분할 헤어 조합과 SpringBone 제어의 세션 상태를 소유한다. */
import { useState } from "react";
import { HAIR_SECTIONS } from "../vrm/studio-vrm-hair-sections";
import { AVATAR_FORGE_HAIR_STYLE_RECIPES } from "../vrm/studio-vrm-avatar-forge";
import { useT } from "@/shared/lib/i18n";

import { resolveHairCommitPatch } from "./character-shaper-custom-quality";
import { applyHairSpringBoneToVrm } from "./character-shaper-mtoon-uniforms";
import { CharacterColorControl, CharacterRangeControl } from "./CharacterShaperControls";
import { InspectorSection, InspectorToggleRow } from "./CharacterShaperInspectorParts";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";
import type { AvatarForgeHairParams } from "../vrm/studio-vrm-avatar-forge";

type HairAdvancedControlsProps = Pick<CharacterShaperInspectorProps, "h" | "binding"> & {
  readonly locked: boolean;
  readonly hair: AvatarForgeHairParams;
  readonly baseColor: string;
  readonly tipColor: string;
  readonly usingOriginalHair: boolean;
  readonly replaceOriginal: boolean;
};

export function CharacterShaperHairAdvancedControls({
  h, binding, locked, hair, baseColor, tipColor, usingOriginalHair, replaceOriginal,
}: HairAdvancedControlsProps) {
  const t = useT();
  const partColors = HAIR_SECTIONS.some(({ id }) => hair[`${id}Tint`]);
  function commitPart(patch: Partial<AvatarForgeHairParams>, label: string) {
    const activation = usingOriginalHair || hair.style === "none"
      ? { ...AVATAR_FORGE_HAIR_STYLE_RECIPES.bob, style: "bob" as const,
          baseColor: binding.profile.originalHairColors?.baseColor ?? baseColor,
          tipColor: binding.profile.originalHairColors?.tipColor ?? tipColor }
      : {};
    binding.commitHairParams(resolveHairCommitPatch({ ...activation, ...patch }, {
      style: usingOriginalHair ? "none" : hair.style, replaceOriginal,
    }), label);
  }
  const [springStiffness, setSpringStiffness] = useState(1.0);
  const [springGravity, setSpringGravity] = useState(0.35);
  const [springDrag, setSpringDrag] = useState(0.4);
  const [springUpdatedCount, setSpringUpdatedCount] = useState(0);

  const applyHairSpringBone = (next: { stiffness: number; gravity: number; drag: number }) => {
    setSpringStiffness(next.stiffness);
    setSpringGravity(next.gravity);
    setSpringDrag(next.drag);
    const updated = applyHairSpringBoneToVrm(h.vrm, {
      stiffness: next.stiffness,
      gravityPower: next.gravity,
      dragForce: next.drag,
    });
    setSpringUpdatedCount(updated);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };


  return (
    <>
      <InspectorSection
        title={t("studio.character.hairParts.title", "앞·옆·뒷머리 조합")}
        hint={t("studio.character.hairParts.hint", "한 부위씩 커트를 바꾸거나 색을 다르게 칠할 수 있습니다.")}
        collapsible
        defaultOpen
      >
        <div data-testid="shaper-hair-three-part-strip" className="space-y-2">
          {HAIR_SECTIONS.map(({ id, name, options }) => {
            const partKey = `${id}Part` as const;
            const tintKey = `${id}Tint` as const;
            const label = t(`studio.character.hairParts.${id}`, name);
            return (
              <div key={id} className="space-y-1">
                <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
                  <span>{label}</span>
                  <select
                    aria-label={t(`studio.character.hairParts.${id}Select`, `3분할 ${name} 파츠`)}
                    disabled={locked}
                    value={hair[partKey] ?? ""}
                    onChange={(event) => commitPart({ [partKey]: event.currentTarget.value || undefined }, `헤어: ${label}`)}
                    className="min-h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  >
                    <option value="">{t("studio.character.hairParts.base", "기본 스타일")}</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>{t(`studio.character.hairParts.${option.id}`, option.labelKo)}</option>
                    ))}
                  </select>
                </label>
                {partColors && <CharacterColorControl label={t(`studio.character.hairParts.${id}Color`, `${name} 색`)}
                  value={hair[tintKey] ?? baseColor} disabled={locked}
                  onCommit={(color) => { if (color) commitPart({ [tintKey]: color }, `헤어: ${label} 색`); }} />}
              </div>
            );
          })}
        </div>
        <InspectorToggleRow
          label={t("studio.character.hairParts.tint", "부위별 색상")}
          hint={t("studio.character.hairParts.tintHint", "끄면 세 부위가 헤어 팔레트의 기본색을 따릅니다.")}
          checked={partColors}
          disabled={locked}
          onToggle={() => {
            const color = partColors ? undefined : usingOriginalHair
              ? binding.profile.originalHairColors?.baseColor ?? baseColor : baseColor;
            commitPart({ frontTint: color, sideTint: color, backTint: color }, "헤어: 부위별 색상");
          }}
        />
      </InspectorSection>
      <InspectorSection
        title="헤어 번들 SpringBone 탄성 · 중력"
        hint="VRoid처럼 머리카락 가닥의 흔들림 탄성·중력·저항을 실시간으로 조절합니다."
        collapsible
        defaultOpen={false}
      >
        <div data-testid="shaper-hair-springbone-controls" className="space-y-2">
          <CharacterRangeControl
            label="탄성 (Stiffness)"
            hint="값이 클수록 머리카락이 원래 형태로 빠르게 복원됩니다."
            value={springStiffness}
            min={0.1}
            max={4.0}
            step={0.05}
            defaultValue={1.0}
            disabled={locked}
            onCommit={(stiffness) => applyHairSpringBone({ stiffness, gravity: springGravity, drag: springDrag })}
          />
          <CharacterRangeControl
            label="중력 (Gravity)"
            hint="머리카락이 아래로 처지는 무게감입니다."
            value={springGravity}
            min={0}
            max={1.5}
            step={0.05}
            defaultValue={0.35}
            disabled={locked}
            onCommit={(gravity) => applyHairSpringBone({ stiffness: springStiffness, gravity, drag: springDrag })}
          />
          <CharacterRangeControl
            label="공기 저항 (Drag)"
            hint="흔들림이 잦아드는 감쇠 속도입니다."
            value={springDrag}
            min={0.05}
            max={1.0}
            step={0.05}
            defaultValue={0.4}
            disabled={locked}
            onCommit={(drag) => applyHairSpringBone({ stiffness: springStiffness, gravity: springGravity, drag })}
          />
          <p role="status" className="text-xs text-fg-3">
            {springUpdatedCount > 0
              ? `실시간 SpringBone 헤어 조인트 ${springUpdatedCount}개 반영됨`
              : "모델에 VRM SpringBone 헤어 조인트가 있으면 즉시 실시간 반영됩니다."}
          </p>
        </div>
      </InspectorSection>
    </>
  );
}
