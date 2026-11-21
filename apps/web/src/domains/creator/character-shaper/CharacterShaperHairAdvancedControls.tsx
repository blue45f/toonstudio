/** 3분할 헤어 조합과 SpringBone 제어의 세션 상태를 소유한다. */
import { useState } from "react";

import { resolveHairCommitPatch } from "./character-shaper-custom-quality";
import { applyHairSpringBoneToVrm } from "./character-shaper-mtoon-uniforms";
import { CharacterRangeControl } from "./CharacterShaperControls";
import { InspectorSection, InspectorToggleRow } from "./CharacterShaperInspectorParts";
import {
  BACK_HAIR_PART_OPTIONS,
  FRONT_HAIR_PART_OPTIONS,
  SIDE_HAIR_PART_OPTIONS,
} from "./studio-webtoon-21-body-and-3part-hair";

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
  const [lockMainColor, setLockMainColor] = useState(true);
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
        title="3분할 헤어 파츠 & 메인 색 고정"
        hint="Tooning Plus처럼 앞·옆·뒷머리를 독립 조합하면서 메인 머리색을 유지합니다."
        collapsible
        defaultOpen={false}
      >
        <InspectorToggleRow
          label="메인 헤어 색 고정 (isKeepMainColor)"
          hint="파츠를 교체해도 현재 머리 기본색과 끝 색을 그대로 유지합니다."
          checked={lockMainColor}
          disabled={locked}
          onToggle={() => setLockMainColor((prev) => !prev)}
        />
        <div data-testid="shaper-hair-three-part-strip" className="grid grid-cols-3 gap-1.5 text-xs">
          <label className="flex flex-col gap-1 text-fg-2">
            <span>앞머리</span>
            <select
              aria-label="3분할 앞머리 파츠"
              disabled={locked}
              defaultValue={FRONT_HAIR_PART_OPTIONS[0]?.id}
              onChange={(event) =>
                binding.commitHairParams(
                  {
                    bangStyle: event.currentTarget.value.includes("split") || event.currentTarget.value.includes("center")
                      ? "split"
                      : event.currentTarget.value.includes("side")
                        ? "side-swept"
                        : event.currentTarget.value.includes("curtain")
                          ? "curtain"
                          : "full",
                    ...(lockMainColor ? { baseColor, tipColor } : {}),
                  },
                  "헤어: 3분할 앞머리",
                )
              }
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {FRONT_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-fg-2">
            <span>옆머리</span>
            <select
              aria-label="3분할 옆머리 파츠"
              disabled={locked}
              defaultValue={SIDE_HAIR_PART_OPTIONS[0]?.id}
              onChange={() =>
                binding.commitHairParams(
                  { volume: Number(Math.min(1.5, Math.max(0.6, hair.volume)).toFixed(2)), ...(lockMainColor ? { baseColor, tipColor } : {}) },
                  "헤어: 3분할 옆머리",
                )
              }
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {SIDE_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-fg-2">
            <span>뒷머리</span>
            <select
              aria-label="3분할 뒷머리 파츠"
              disabled={locked}
              defaultValue={BACK_HAIR_PART_OPTIONS[0]?.id}
              onChange={(event) => {
                const nextStyle = event.currentTarget.value.includes("ponytail")
                  ? "ponytail"
                  : event.currentTarget.value.includes("twintail")
                    ? "twintail"
                    : event.currentTarget.value.includes("bob")
                      ? "bob"
                      : event.currentTarget.value.includes("long")
                        ? "long"
                        : hair.style;
                const patch = resolveHairCommitPatch(
                  {
                    style: nextStyle,
                    ...(lockMainColor ? { baseColor, tipColor } : {}),
                  },
                  { style: usingOriginalHair ? "none" : hair.style, replaceOriginal: Boolean(replaceOriginal) },
                );
                binding.commitHairParams(patch, "헤어: 3분할 뒷머리");
              }}
              className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
            >
              {BACK_HAIR_PART_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.labelKo}</option>
              ))}
            </select>
          </label>
        </div>
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
