import { ChevronDown, ListFilter } from "lucide-react";

import { CHIP_BASE, CHIP_OFF, CHIP_ON, FOCUS_RING, cx } from "./studio-bg3d-asset-panel-styles";
import {
  STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER,
  STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS,
  type StudioBg3dAssetRightsFilterKey,
} from "./studio-bg3d-asset-rights-copy";

import type { StudioBg3dAssetRightsCounts, StudioBg3dAssetRightsFilter } from "./studio-bg3d-asset-rights-view";
import type { StudioBg3dAssetRightsLoadState } from "./useStudioBg3dAssetRights";

const LOAD_NOTICE: Readonly<Record<Exclude<StudioBg3dAssetRightsLoadState, "ready">, string>> = {
  loading: "저장된 권리 기록을 읽는 중입니다. 읽는 동안에는 가져온 소재가 '미확인'으로 분류됩니다.",
  partial: "저장된 권리 기록 일부를 읽지 못했습니다. 읽지 못한 값은 '미확인'으로 표시하며, 목록은 그대로 쓸 수 있습니다.",
  error: "저장된 권리 기록을 읽지 못했습니다. 가져온 소재는 모두 '미확인'으로 표시하며, 목록은 그대로 쓸 수 있습니다.",
};

interface StudioBg3dAssetRightsFilterBarProps {
  readonly filter: StudioBg3dAssetRightsFilter;
  readonly counts: StudioBg3dAssetRightsCounts;
  readonly loadState: StudioBg3dAssetRightsLoadState;
  /** 필터가 걸러 내는 결과 영역의 id(aria-controls). */
  readonly controlsId: string;
  readonly onToggle: (key: StudioBg3dAssetRightsFilterKey, value: string) => void;
  readonly onClear: () => void;
}

/** 권리 패싯 칩. 칩은 모두 토글 버튼(aria-pressed)이고 그룹마다 이름을 가진다. */
export function StudioBg3dAssetRightsFilterBar({
  filter,
  counts,
  loadState,
  controlsId,
  onToggle,
  onClear,
}: StudioBg3dAssetRightsFilterBarProps) {
  const chosen = (key: StudioBg3dAssetRightsFilterKey): readonly string[] => filter[key] ?? [];
  const activeCount = STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS.reduce((sum, group) => sum + chosen(group.key).length, 0);

  return (
    <div className="mt-2">
      <details className="group rounded-xl border border-line bg-card/60 open:bg-card">
        <summary
          className={cx(
            "flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-fg marker:content-none sm:min-h-9",
            FOCUS_RING,
          )}
        >
          <ListFilter size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">권리 필터</span>
          <span className="shrink-0 text-[0.65rem] font-semibold text-fg-3">
            {activeCount > 0 ? `${activeCount}개 적용 중` : "전체 보기"}
          </span>
          <ChevronDown
            size={14}
            className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>

        <div className="border-t border-line px-3 pb-3 pt-2.5">
          <p className="text-[0.68rem] leading-relaxed text-fg-3">
            라이선스·출처·AI 표기로 소재를 걸러 봅니다. 기록이 없는 소재는 '미확인'으로 분류하며, 사용해도 된다는 뜻이 아닙니다.
          </p>
          {STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS.map((group) => (
            <div key={group.key} role="group" aria-label={group.label} className="mt-2.5">
              <span className="block text-[0.66rem] font-bold text-fg-2">{group.label}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {group.options.map((option) => {
                  const on = chosen(group.key).includes(option.value);
                  const count = (counts[group.key] as Readonly<Record<string, number>>)[option.value] ?? 0;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={on}
                      aria-controls={controlsId}
                      aria-label={`${group.label}: ${option.label}, ${count}개`}
                      className={cx(CHIP_BASE, on ? CHIP_ON : CHIP_OFF)}
                      onClick={() => onToggle(group.key, option.value)}
                    >
                      {option.label}
                      <span className="font-semibold text-fg-3" aria-hidden>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {activeCount > 0 ? (
            <button
              type="button"
              className={cx(CHIP_BASE, CHIP_OFF, "mt-3 w-full")}
              onClick={onClear}
            >
              권리 필터 해제
            </button>
          ) : null}
          <p className="mt-2.5 text-[0.62rem] leading-relaxed text-fg-3">{STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER}</p>
        </div>
      </details>
      {loadState !== "ready" ? (
        <p
          className="mt-1.5 rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-[0.66rem] leading-relaxed text-fg-3"
          role="status"
        >
          {LOAD_NOTICE[loadState]}
        </p>
      ) : null}
    </div>
  );
}
