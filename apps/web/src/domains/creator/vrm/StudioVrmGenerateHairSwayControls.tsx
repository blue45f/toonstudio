import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import {
  avatarForgeAppearanceSignature,
  readAvatarForgeVrmAuthoring,
  withAvatarForgeVrmAuthoring,
} from "./studio-vrm-avatar-forge-authoring";
import {
  applyStudioVrmHairSwayPreset,
  matchStudioVrmHairSwayPreset,
  resetStudioVrmHairSwayScope,
  resolveStudioVrmHairSwayScope,
  setStudioVrmHairSwayParam,
  STUDIO_VRM_HAIR_SWAY_GROUPS,
  STUDIO_VRM_HAIR_SWAY_LIMITS,
  STUDIO_VRM_HAIR_SWAY_PARAM_KEYS,
  STUDIO_VRM_HAIR_SWAY_PRESETS,
  type StudioVrmHairSwayAuthoring,
  type StudioVrmHairSwayGroupId,
} from "./studio-vrm-generate-hair-sway";
import { listStudioVrmGenerateHairSwayGroups } from "./studio-vrm-generate-recipe";
import { StudioVrmForgeRangeControl } from "./StudioVrmForgeRangeControl";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";

type SwayScope = "global" | StudioVrmHairSwayGroupId;

function chipClass(selected: boolean): string {
  return `min-h-9 rounded-lg border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
    selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
  }`;
}

export interface StudioVrmGenerateHairSwayControlsProps {
  readonly state: AvatarForgeState;
  /**
   * 실제로 생성될 상태. 아무 스타일도 고르지 않았으면 기본 스타일 헤어가 대신 들어가므로, 어떤 묶음이
   * 있는지는 이 상태로 판단한다. 편집은 언제나 `state` 에 건다.
   */
  readonly previewState?: AvatarForgeState;
  readonly disabled?: boolean;
  readonly onChange: (state: AvatarForgeState) => void;
}

/**
 * 생성 VRM 헤어의 흔들림 조율. VRoid Studio 처럼 헤어 묶음별로 단단함·처짐을 정하되, 값은 가닥 길이로
 * 자동 조율된 스프링본 값에 곱하는 배율이다.
 */
export function StudioVrmGenerateHairSwayControls({
  state,
  previewState = state,
  disabled = false,
  onChange,
}: StudioVrmGenerateHairSwayControlsProps) {
  const [scope, setScope] = useState<SwayScope>("global");
  const authoring = readAvatarForgeVrmAuthoring(state)?.hairSway;
  const activePreset = matchStudioVrmHairSwayPreset(authoring);
  // 생성될 VRM 에서 스프링 체인이 실제로 달리는 묶음만 보여 준다. 정수리에 얹힌 번이나 짧은 덩어리는
  // 체인이 없어 배율을 바꿔도 그대로다. 표정·흔들림만 바꿀 때는 외형 서명이 같아 다시 세우지 않는다.
  const appearanceKey = avatarForgeAppearanceSignature(previewState);
  const presentGroups = useMemo(() => {
    const groups = new Set(listStudioVrmGenerateHairSwayGroups(JSON.parse(appearanceKey) as AvatarForgeState));
    return STUDIO_VRM_HAIR_SWAY_GROUPS.filter((group) => groups.has(group.id));
  }, [appearanceKey]);
  const resolvedScope: SwayScope = scope === "global" || presentGroups.some((group) => group.id === scope)
    ? scope
    : "global";
  const values = resolveStudioVrmHairSwayScope(authoring, resolvedScope);
  const scopeLabel = resolvedScope === "global"
    ? "전체"
    : STUDIO_VRM_HAIR_SWAY_GROUPS.find((group) => group.id === resolvedScope)?.label ?? "전체";
  const scopeEdited = resolvedScope === "global" ? Boolean(authoring?.global) : Boolean(authoring?.groups?.[resolvedScope]);

  const emit = (hairSway: StudioVrmHairSwayAuthoring | undefined) => {
    onChange(withAvatarForgeVrmAuthoring(state, { hairSway }));
  };

  if (presentGroups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-card/55 p-3 text-[0.62rem] text-fg-3" data-studio-vrm-hair-sway="empty">
        {previewState.hair.style === "none"
          ? vrmGenerateStatusText(
            "studio.vrmGenerateStatus.hairSwayNoHair",
            "흔들릴 헤어가 없어요. 헤어 탭에서 실루엣을 고르면 흔들림을 조율할 수 있습니다.",
          )
          : vrmGenerateStatusText(
            "studio.vrmGenerateStatus.hairSwayNoChains",
            "이 헤어에는 흔들리는 가닥이 없어요. 더 긴 실루엣을 고르면 흔들림을 조율할 수 있습니다.",
          )}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-studio-vrm-hair-sway="">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label="흔들림 프리셋">
        {STUDIO_VRM_HAIR_SWAY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            aria-pressed={activePreset === preset.id}
            title={preset.hint}
            data-studio-vrm-hair-sway-preset={preset.id}
            className={`${chipClass(activePreset === preset.id)} text-left`}
            onClick={() => emit(applyStudioVrmHairSwayPreset(authoring, preset.id))}
          >
            <span className="block">{preset.label}</span>
            <span className="block truncate text-[0.55rem] font-semibold text-fg-3">{preset.hint}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[0.6rem] font-bold text-fg-3">
          조율 범위 {activePreset === null ? "· 직접 조정 중" : ""}
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="흔들림 조율 범위">
          {[{ id: "global" as const, label: "전체" }, ...presentGroups].map((group) => (
            <button
              key={group.id}
              type="button"
              disabled={disabled}
              aria-pressed={resolvedScope === group.id}
              className={chipClass(resolvedScope === group.id)}
              onClick={() => setScope(group.id)}
            >
              {group.label}
              {group.id !== "global" && authoring?.groups?.[group.id] ? (
                <>
                  <span className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden />
                  <span className="sr-only">(조정됨)</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-3">
        {STUDIO_VRM_HAIR_SWAY_PARAM_KEYS.map((key) => {
          const limit = STUDIO_VRM_HAIR_SWAY_LIMITS[key];
          return (
            <StudioVrmForgeRangeControl
              key={key}
              label={`${scopeLabel} ${limit.label}`}
              hint={limit.hint}
              value={values[key]}
              minimum={limit.min}
              maximum={limit.max}
              step={limit.step}
              defaultValue={1}
              unit="×"
              disabled={disabled}
              onChange={(value) => emit(setStudioVrmHairSwayParam(authoring, resolvedScope, key, value))}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[0.58rem] leading-relaxed text-fg-3">
          {resolvedScope === "global"
            ? "전체 배율은 모든 헤어 가닥에 곱해집니다. 묶음을 고르면 그 묶음만 더 다듬을 수 있어요."
            : `${scopeLabel} 배율은 전체 배율 위에 한 번 더 곱해집니다.`}
          {" "}생성한 VRM 은 포저 물리에서 바로 흔들립니다.
        </p>
        <button
          type="button"
          disabled={disabled || !scopeEdited}
          className={`${chipClass(false)} inline-flex items-center gap-1`}
          onClick={() => emit(resetStudioVrmHairSwayScope(authoring, resolvedScope))}
        >
          <RotateCcw size={12} aria-hidden />
          {scopeLabel} 자동으로
        </button>
      </div>
    </div>
  );
}
