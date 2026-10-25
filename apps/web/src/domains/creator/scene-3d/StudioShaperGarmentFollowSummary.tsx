import { Info } from "lucide-react";

import { shaperBodySlidersToMannequinParams } from "./studio-body-morphs";
import type { ShaperAppearanceState, ShaperBodySliderValues } from "./studio-shaper-model";
import { resolveStudioShaperGarmentFollow } from "./studio-shaper-pose-pipeline";

type StudioShaperGarmentFollowSummaryProps = {
  readonly ko: boolean;
  readonly selection: ShaperAppearanceState["selection"];
  readonly bodySliders: ShaperBodySliderValues;
};

/**
 * 셰이퍼 코디 탭의 안내 문구 + 의복 따라가기 바인딩 요약 (표시 전용).
 * StudioShaperPanel의 래칫 기준선(1,814줄)을 넘지 않기 위해 분리했다.
 * 렌더 결과는 분리 전 패널 인라인 블록과 동일하다.
 */
export function StudioShaperGarmentFollowSummary({
  ko,
  selection,
  bodySliders,
}: StudioShaperGarmentFollowSummaryProps) {
  return (
    <>
      <p className="flex items-start gap-1.5 rounded-xl border border-line bg-panel/55 p-2.5 text-[0.6rem] leading-relaxed text-fg-2">
        <Info size={12} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
        {ko
          ? "이 탭의 코디는 데생 인형에 적용되지 않습니다. SVG 미리보기로 확인하고 저장하세요."
          : "Outfits are not applied to the mannequin. Preview them as SVG and save."}
      </p>
      <div className="rounded-xl border border-line bg-panel/55 p-2.5 text-[0.6rem] leading-relaxed text-fg-2">
        <p className="font-bold text-fg">
          {ko ? "의복 따라가기 바인딩 (현재 체형 기준)" : "Garment follow binding (current body)"}
        </p>
        <ul className="mt-1 space-y-1">
          {(["top", "bottom", "shoes"] as const).map((category) => {
            const garmentId = selection[category];
            if (!garmentId) return null;
            const binding = resolveStudioShaperGarmentFollow({
              params: shaperBodySlidersToMannequinParams(bodySliders),
              garmentCategory: category,
              garmentId,
            });
            if (!binding || binding.binding !== "skinned-follow") return null;
            const scales = Object.entries(binding.regionScales)
              .map(([region, scale]) => `${region} ×${scale}`)
              .join(" · ");
            return (
              <li key={category}>
                {garmentId}: {scales}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-fg-3">
          {ko
            ? "고정 오버레이가 아니라 체형 부위 반지름에서 유도한 배율로 변형합니다. 3D 메시 적용은 후속 과제입니다."
            : "Deformed by body-region scales, not a rigid overlay. 3D mesh application is a follow-up."}
        </p>
      </div>
    </>
  );
}
