import { ChevronDown, ListFilter } from "lucide-react";
import { useRef } from "react";

import { CHIP_BASE, CHIP_OFF, CHIP_ON, FOCUS_RING, NOTICE_TEXT, cx } from "./studio-bg3d-asset-panel-styles";
import {
  STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER,
  STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS,
  STUDIO_BG3D_ASSET_RIGHTS_FILTER_HELP,
  STUDIO_BG3D_ASSET_RIGHTS_LOAD_NOTICES,
  STUDIO_BG3D_ASSET_RIGHTS_PROJECT_SUMMARY_NOTICE,
  type StudioBg3dAssetRightsFilterKey,
} from "./studio-bg3d-asset-rights-copy";

import type { StudioBg3dAssetRightsCounts, StudioBg3dAssetRightsFilter } from "./studio-bg3d-asset-rights-view";
import type { StudioBg3dAssetRightsLoadState } from "./useStudioBg3dAssetRights";

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
  const summaryRef = useRef<HTMLElement>(null);
  const chosen = (key: StudioBg3dAssetRightsFilterKey): readonly string[] => filter[key] ?? [];
  const activeCount = STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS.reduce((sum, group) => sum + chosen(group.key).length, 0);

  return (
    <div className="mt-2">
      <details className="group rounded-xl border border-line bg-card/60 open:bg-card">
        <summary
          ref={summaryRef}
          className={cx(
            "flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-fg marker:content-none",
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
          <p className={NOTICE_TEXT}>{STUDIO_BG3D_ASSET_RIGHTS_FILTER_HELP}</p>
          {STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS.map((group) => (
            // 그룹 이름은 화면에 보이는 제목 하나에서 가져온다(aria-label 을 따로 달면 같은 이름이 두 번 읽힌다).
            <div key={group.key} role="group" aria-labelledby={`${controlsId}-rights-${group.key}`} className="mt-2.5">
              <span id={`${controlsId}-rights-${group.key}`} className="block text-[0.66rem] font-bold text-fg-2">{group.label}</span>
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
                      aria-label={`${option.label}, ${count}개`}
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
              onClick={() => {
                onClear();
                // 이 버튼은 필터가 풀리면 사라진다. 포커스가 문서 처음으로 날아가지 않게 같은 영역의 제목 줄에 둔다.
                summaryRef.current?.focus();
              }}
            >
              권리 필터 해제
            </button>
          ) : null}
          <p className={cx("mt-2.5", NOTICE_TEXT)}>
            {STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER} {STUDIO_BG3D_ASSET_RIGHTS_PROJECT_SUMMARY_NOTICE}
          </p>
        </div>
      </details>
      {loadState !== "ready" ? (
        <p
          className={cx("mt-1.5 rounded-lg border border-line bg-card/70 px-2.5 py-1.5", NOTICE_TEXT)}
          role="status"
        >
          {STUDIO_BG3D_ASSET_RIGHTS_LOAD_NOTICES[loadState]}
        </p>
      ) : null}
    </div>
  );
}
