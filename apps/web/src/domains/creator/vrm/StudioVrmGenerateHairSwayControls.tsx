import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import { readAvatarForgeVrmAuthoring, withAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import {
  applyStudioVrmHairSwayPreset,
  keepStudioVrmHairSwayChains,
  matchStudioVrmHairSwayPreset,
  resetStudioVrmHairSwayScope,
  resolveStudioVrmHairSwayScope,
  setStudioVrmHairSwayParam,
  STUDIO_VRM_HAIR_SWAY_GROUPS,
  STUDIO_VRM_HAIR_SWAY_LIMITS,
  STUDIO_VRM_HAIR_SWAY_PARAM_KEYS,
  STUDIO_VRM_HAIR_SWAY_PRESETS,
  studioVrmHairSwayChainScope,
  type StudioVrmHairSwayAuthoring,
  type StudioVrmHairSwayGroupId,
  type StudioVrmHairSwayScope,
} from "./studio-vrm-generate-hair-sway";
import { StudioVrmForgeRangeControl } from "./StudioVrmForgeRangeControl";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";
import type { StudioVrmGenerateHairSwayChain } from "./studio-vrm-generate-recipe";

function groupLabel(id: StudioVrmHairSwayGroupId): string {
  return STUDIO_VRM_HAIR_SWAY_GROUPS.find((group) => group.id === id)?.label ?? id;
}

function chipClass(selected: boolean): string {
  return `min-h-9 rounded-lg border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
    selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
  }`;
}

export interface StudioVrmGenerateHairSwayControlsProps {
  readonly state: AvatarForgeState;
  /**
   * 실제로 생성될 상태. 아무 스타일도 고르지 않았으면 기본 스타일 헤어가 대신 들어가므로, 흔들릴 헤어가
   * 있는지는 이 상태로 판단한다. 편집은 언제나 `state` 에 건다.
   */
  readonly previewState?: AvatarForgeState;
  /**
   * `previewState` 로 생성될 VRM 에서 실제로 흔들리는 가닥(`listStudioVrmGenerateHairSwayChains`).
   * 생성 구역이 한 번 세워 요약 배지와 함께 쓴다.
   */
  readonly chains: readonly StudioVrmGenerateHairSwayChain[];
  readonly disabled?: boolean;
  readonly onChange: (state: AvatarForgeState) => void;
}

/**
 * 생성 VRM 헤어의 흔들림 조율. VRoid Studio 처럼 헤어 묶음과 가닥(덩어리)마다 단단함·처짐을 정하되,
 * 값은 가닥 길이로 자동 조율된 스프링본 값에 곱하는 배율이다(전체 → 묶음 → 가닥 순으로 곱한다).
 */
export function StudioVrmGenerateHairSwayControls({
  state,
  previewState = state,
  chains,
  disabled = false,
  onChange,
}: StudioVrmGenerateHairSwayControlsProps) {
  const [scope, setScope] = useState<StudioVrmHairSwayScope>("global");
  // 이전 헤어에만 있던 가닥의 조정은 걷어 낸 값에서 편집한다. 그래야 저장되는 가닥 조정이 지금 헤어의
  // 가닥 수를 넘지 않고, 쌓인 조정에 밀려 새 조정이 버려지지 않는다.
  const authoring = keepStudioVrmHairSwayChains(
    readAvatarForgeVrmAuthoring(state)?.hairSway,
    chains.map((chain) => chain.id),
  );
  const activePreset = matchStudioVrmHairSwayPreset(authoring);
  // 생성될 VRM 에서 스프링 체인이 실제로 달리는 가닥·묶음만 보여 준다. 정수리에 얹힌 번이나 짧은 덩어리는
  // 체인이 없어 배율을 바꿔도 그대로다.
  const presentGroups = STUDIO_VRM_HAIR_SWAY_GROUPS.filter((group) => chains.some((chain) => chain.group === group.id));
  const selectedChain = chains.find((chain) => studioVrmHairSwayChainScope(chain.id) === scope);
  const resolvedScope: StudioVrmHairSwayScope = scope === "global" || selectedChain || presentGroups.some((group) => group.id === scope)
    ? scope
    : "global";
  const activeGroup: StudioVrmHairSwayGroupId | null = selectedChain?.group
    ?? (resolvedScope === "global" ? null : (resolvedScope as StudioVrmHairSwayGroupId));
  const groupChains = activeGroup ? chains.filter((chain) => chain.group === activeGroup) : [];
  // 가닥이 하나뿐인 묶음은 묶음 배율이 곧 그 가닥 배율이라 가닥 번호 줄을 그리지 않는다. 안내 문구도 이 값을 따른다.
  const showStrandChips = groupChains.length > 1;
  const values = resolveStudioVrmHairSwayScope(authoring, resolvedScope);
  const scopeLabel = selectedChain
    ? `${groupLabel(selectedChain.group)} ${selectedChain.order}번 가닥`
    : activeGroup ? groupLabel(activeGroup) : "전체";
  const scopeEdited = selectedChain
    ? Boolean(authoring?.chains?.[selectedChain.id])
    : activeGroup ? Boolean(authoring?.groups?.[activeGroup]) : Boolean(authoring?.global);
  const groupEdited = (id: StudioVrmHairSwayGroupId) =>
    Boolean(authoring?.groups?.[id]) || chains.some((chain) => chain.group === id && authoring?.chains?.[chain.id]);

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
          {[{ id: "global" as const, label: "전체" }, ...presentGroups].map((group) => {
            const selected = group.id === "global" ? activeGroup === null : activeGroup === group.id;
            return (
              <button
                key={group.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                className={chipClass(selected)}
                onClick={() => setScope(group.id)}
              >
                {group.label}
                {group.id !== "global" && groupEdited(group.id) ? (
                  <>
                    <span className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden />
                    <span className="sr-only">(조정됨)</span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
        {activeGroup && showStrandChips ? (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={`${groupLabel(activeGroup)} 가닥별 조율`}
            data-studio-vrm-hair-sway-chains=""
          >
            <span className="text-[0.58rem] font-bold text-fg-3">가닥별(화면 왼쪽부터)</span>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={resolvedScope === activeGroup}
              className={chipClass(resolvedScope === activeGroup)}
              onClick={() => setScope(activeGroup)}
            >
              {groupLabel(activeGroup)} 전체
            </button>
            {groupChains.map((chain) => {
              const chainScope = studioVrmHairSwayChainScope(chain.id);
              return (
                <button
                  key={chain.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={resolvedScope === chainScope}
                  aria-label={`${groupLabel(chain.group)} ${chain.order}번 가닥${authoring?.chains?.[chain.id] ? " (조정됨)" : ""}`}
                  data-studio-vrm-hair-sway-chain={chain.id}
                  className={`${chipClass(resolvedScope === chainScope)} min-w-9`}
                  onClick={() => setScope(chainScope)}
                >
                  {chain.order}
                  {authoring?.chains?.[chain.id] ? (
                    <span className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
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
          {selectedChain
            ? `${scopeLabel} 배율은 전체·묶음 배율 위에 한 번 더 곱해집니다.`
            : activeGroup
              ? `${scopeLabel} 배율은 전체 배율 위에 한 번 더 곱해집니다.${showStrandChips ? " 가닥 번호를 고르면 그 가닥만 다듬을 수 있어요." : ""}`
              : "전체 배율은 모든 헤어 가닥에 곱해집니다. 묶음을 고르면 그 묶음만 더 다듬을 수 있어요."}
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
