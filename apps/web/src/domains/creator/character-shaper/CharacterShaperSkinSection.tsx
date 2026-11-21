/**
 * Character Shaper — 피부색(A-11).
 *
 * 레시피 색 `skin` 은 예전부터 binding(`commitColor("skin")` → 사용자 색 `body`)에 있었지만 이를
 * 부르는 화면이 없어 요약 막대에 "피부 색 없음" 만 떴다. 얼굴형·체형 인스펙터 맨 위에서 고른다.
 * 얼굴 피부와 몸 피부는 같은 색으로 함께 물든다(`vrm/studio-vrm-custom-color-target.ts`). 비우면 모델 원본 피부.
 */
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { SHAPER_GEN3D_VISUAL_PROFILES } from "./character-shaper-gen3d-bridge";
import {
  applyShaperMtoonUniformsToVrm,
  DEFAULT_SHAPER_MTOON_SETTINGS,
  resetShaperMtoonUniformsOnVrm,
  type ShaperShaderDisplayMode,
} from "./character-shaper-mtoon-uniforms";
import { useCharacterShaperMaterialSettings } from "./character-shaper-session-settings";
import { CharacterColorControl } from "./CharacterShaperControls";
import { InspectorSection } from "./CharacterShaperInspectorParts";

import type { CharacterColorSwatch } from "./CharacterShaperControls";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

import { cn } from "@/shared/lib/utils";

const SHADE_TINT_SWATCHES: readonly CharacterColorSwatch[] = Object.freeze([
  { color: "#d6a59e", label: "따뜻한 피부 음영" },
  { color: "#9da8c4", label: "시원한 블루 음영" },
  { color: "#b6a2c4", label: "로판 라벤더 음영" },
  { color: "#6c656e", label: "느와르 잉크 음영" },
]);

const RIM_TINT_SWATCHES: readonly CharacterColorSwatch[] = Object.freeze([
  { color: "#fff6e8", label: "따뜻한 햇빛 림" },
  { color: "#d9ecff", label: "푸른 하늘 림" },
  { color: "#ffd8e8", label: "로맨스 핑크 림" },
  { color: "#e5e7eb", label: "중립 스튜디오 림" },
]);

const OUTLINE_INK_SWATCHES: readonly CharacterColorSwatch[] = Object.freeze([
  { color: "#1c1917", label: "먹선 블랙" },
  { color: "#443632", label: "따뜻한 브라운" },
  { color: "#2b3048", label: "네이비 잉크" },
  { color: "#09090b", label: "하드 딥블랙" },
]);

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
  h,
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "binding"> & {
  readonly h?: StudioVrmPoserHost;
  readonly locked: boolean;
}) {
  const { shaperMaterial, setShaperMaterial } = useCharacterShaperMaterialSettings();
  const [appliedCount, setAppliedCount] = useState(0);
  const {
    shadePos,
    shadeWidth,
    rLightPos,
    rLightWidth,
    outlinePressure,
    disableHairInline,
    shaderMode = "toon",
    shadeColorHex = null,
    rimColorHex = null,
    outlineScale = 1.0,
    outlineColorHex = null,
  } = shaperMaterial;

  const applied = applyShaperMtoonUniformsToVrm(null, shaperMaterial);
  const uniforms = applied.uniforms;

  useEffect(() => {
    const result = applyShaperMtoonUniformsToVrm(h?.vrm, shaperMaterial);
    setAppliedCount(result.updatedMaterials);
    if (typeof h?.invalidateViewport === "function") h.invalidateViewport();
  }, [h, h?.vrm, shaperMaterial]);

  const patchMaterial = (patch: Partial<typeof shaperMaterial>) => {
    setShaperMaterial((prev) => ({ ...prev, ...patch }));
  };

  const switchShaderMode = (mode: ShaperShaderDisplayMode) => {
    patchMaterial({ shaderMode: mode });
  };

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
        title="웹툰 음영 · 외곽선 스타일"
        hint="버튼 한 번으로 만화 셀 음영과 입체 모델링 보기를 전환하고(Space), 필요하면 아래에서 세부 값을 조절합니다."
      >
        <div
          data-testid="shaper-inspector-material-section"
          className="space-y-2.5 rounded-xl border border-line/70 bg-card/70 p-2.5 text-[0.7rem]"
        >
          <div role="group" aria-label="셰이더 보기 전환" className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="shaper-shader-mode-toon"
              aria-pressed={shaderMode === "toon"}
              aria-label="웹툰 툰 음영으로 보기"
              disabled={locked}
              onClick={() => switchShaderMode("toon")}
              className={cn(
                "min-h-11 rounded-xl border px-2.5 text-xs font-semibold [word-break:keep-all]",
                "transition-[transform,border-color,background-color] duration-150 enabled:active:scale-[0.98] disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none",
                STUDIO_FOCUS_RING,
                shaderMode === "toon"
                  ? "shaper-spectrum-active border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              웹툰 툰 보기
            </button>
            <button
              type="button"
              data-testid="shaper-shader-mode-modeling"
              aria-pressed={shaderMode === "modeling"}
              aria-label="모델링 입체 셰이더로 보기"
              disabled={locked}
              onClick={() => switchShaderMode("modeling")}
              className={cn(
                "min-h-11 rounded-xl border px-2.5 text-xs font-semibold [word-break:keep-all]",
                "transition-[transform,border-color,background-color] duration-150 enabled:active:scale-[0.98] disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none",
                STUDIO_FOCUS_RING,
                shaderMode === "modeling"
                  ? "shaper-spectrum-active border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              입체 모델링 보기
            </button>
          </div>

          <div role="group" aria-label="원클릭 웹툰 음영 프리셋" className="grid grid-cols-2 gap-1.5">
            {SHAPER_GEN3D_VISUAL_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                aria-label={`${profile.label} 음영 스타일 적용`}
                disabled={locked}
                onClick={() =>
                  patchMaterial({
                    shaderMode: "toon",
                    shadeWidth: Number(Math.max(0.02, Math.min(1, (1 - profile.shadeToonyFactor) / 0.85)).toFixed(2)),
                    shadePos: Number(Math.max(0, Math.min(1, 0.5 - profile.shadeShiftFactor / 0.6)).toFixed(2)),
                    rLightWidth: Number(Math.max(0.05, Math.min(1, profile.rimLightingMix)).toFixed(2)),
                    outlinePressure: profile.outlineWidthWorld >= 0.002,
                    outlineScale: Number(Math.max(0.5, Math.min(2.0, profile.outlineWidthWorld / 0.0022)).toFixed(2)),
                    outlineColorHex: profile.outlineColorHex,
                  })
                }
                className={cn(
                  "flex min-h-11 flex-col items-start justify-center rounded-xl border border-line bg-panel px-2.5 py-1 text-left [word-break:keep-all]",
                  "transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-raised disabled:opacity-45 motion-reduce:transition-none",
                  STUDIO_FOCUS_RING,
                )}
              >
                <span className="truncate text-[0.7rem] font-semibold text-fg">{profile.label}</span>
                <span className="truncate text-[0.6rem] text-fg-3">{profile.badge}</span>
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>음영 경계</span>
            <input
              type="range"
              aria-label="MatCap 음영 경계"
              min={0}
              max={1}
              step={0.02}
              value={shadePos}
              disabled={locked}
              onChange={(event) => patchMaterial({ shadePos: Number(event.currentTarget.value) })}
              className="h-11 w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] tabular-nums text-fg-3">
              {shadePos.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>음영 부드러움</span>
            <input
              type="range"
              aria-label="MatCap 음영 폭"
              min={0}
              max={1}
              step={0.02}
              value={shadeWidth}
              disabled={locked}
              onChange={(event) => patchMaterial({ shadeWidth: Number(event.currentTarget.value) })}
              className="h-11 w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] tabular-nums text-fg-3">
              {shadeWidth.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>반사광 위치</span>
            <input
              type="range"
              aria-label="반사광 경계 위치"
              min={0}
              max={1}
              step={0.02}
              value={rLightPos}
              disabled={locked}
              onChange={(event) => patchMaterial({ rLightPos: Number(event.currentTarget.value) })}
              className="h-11 w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] tabular-nums text-fg-3">
              {rLightPos.toFixed(2)}
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
              onChange={(event) => patchMaterial({ rLightWidth: Number(event.currentTarget.value) })}
              className="h-11 w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] tabular-nums text-fg-3">
              {rLightWidth.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-fg-2">
            <span>외곽선 굵기</span>
            <input
              type="range"
              aria-label="외곽선 굵기 배율"
              min={0.4}
              max={2.2}
              step={0.05}
              value={outlineScale}
              disabled={locked || shaderMode === "modeling"}
              onChange={(event) => patchMaterial({ outlineScale: Number(event.currentTarget.value) })}
              className="h-11 w-28 accent-accent"
            />
            <span className="w-9 text-right font-mono text-[0.66rem] tabular-nums text-fg-3">
              {outlineScale.toFixed(1)}×
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2">
                <input
                  type="checkbox"
                  aria-label="비등방 필압 외곽선 (1.5×0.3)"
                  checked={outlinePressure}
                  disabled={locked}
                  onChange={(event) => patchMaterial({ outlinePressure: event.currentTarget.checked })}
                  className="size-4 rounded border-line accent-accent"
                />
                <span>필압 외곽선</span>
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2">
                <input
                  type="checkbox"
                  aria-label="헤어 내부 주선 억제 (hID*1)"
                  checked={disableHairInline}
                  disabled={locked}
                  onChange={(event) => patchMaterial({ disableHairInline: event.currentTarget.checked })}
                  className="size-4 rounded border-line accent-accent"
                />
                <span>헤어 내선 정리</span>
              </label>
            </div>
            <button
              type="button"
              disabled={locked}
              aria-label="MatCap 재질 초기화"
              onClick={() => {
                setShaperMaterial(DEFAULT_SHAPER_MTOON_SETTINGS);
                resetShaperMtoonUniformsOnVrm(h?.vrm);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 hover:bg-raised disabled:opacity-45",
                STUDIO_FOCUS_RING,
              )}
            >
              <RotateCcw size={13} aria-hidden />
              초기화
            </button>
          </div>
          <p
            data-testid="shaper-inspector-material-readout"
            className="rounded-lg bg-raised/80 px-2 py-1 font-mono text-[0.64rem] text-fg-3"
          >
            {shaderMode === "modeling" ? "모델링 입체 보기" : uniforms.summaryLabel} · MToon Toony {uniforms.mtoonShadingToonyFactor.toFixed(2)}
            {appliedCount > 0 ? ` · 실시간 MToon ${appliedCount}재질 적용` : ""}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection
        title="음영·림·주선 색조 (전문가 설정)"
        hint="그림자 색조(_ShadeColor)·반사광(_RLightColor)·외곽선 잉크 색을 직접 지정합니다."
        collapsible
        defaultOpen={false}
      >
        <CharacterColorControl
          label="음영 색조"
          value={shadeColorHex}
          swatches={SHADE_TINT_SWATCHES}
          allowClear
          disabled={locked || shaderMode === "modeling"}
          onCommit={(color) => patchMaterial({ shadeColorHex: color })}
        />
        <CharacterColorControl
          label="림 반사광 색"
          value={rimColorHex}
          swatches={RIM_TINT_SWATCHES}
          allowClear
          disabled={locked || shaderMode === "modeling"}
          onCommit={(color) => patchMaterial({ rimColorHex: color })}
        />
        <CharacterColorControl
          label="외곽선 잉크 색"
          value={outlineColorHex}
          swatches={OUTLINE_INK_SWATCHES}
          allowClear
          disabled={locked || shaderMode === "modeling"}
          onCommit={(color) => patchMaterial({ outlineColorHex: color })}
        />
      </InspectorSection>
    </>
  );
}
