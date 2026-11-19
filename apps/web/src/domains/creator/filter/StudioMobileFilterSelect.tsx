import { useId } from "react";

import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { useStudioFilterDialogIntent } from "../studio-filter-dialog-intent";
import { frozenStatus4Text } from "../studio-frozen4-status-i18n";
import { localizeStudioText } from "../studio-localize-text";
import { STUDIO_EASE } from "../studio-panel-ui";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { STUDIO_FILTER_DIALOG_CATALOG, studioFilterGroupLabel, type StudioFilterCatalogGroup } from "./studio-filter-catalog";
import type { StudioFilterTargetLabel } from "./studio-filter-target-presentation";
import type { StudioFilterKind } from "./studio-filter-menu";
import { STUDIO_FILTER_DIALOG_GROUP_ORDER } from "./studio-filter-menu-groups";

const GROUP_NAMES_EN: Record<StudioFilterCatalogGroup, string> = {
  tone: "Brightness and contrast", color: "Color correction", blur: "Blur and focus",
  detail: "Sharpen", repair: "Line art and repair", light: "Light and lens",
  stylize: "Style", texture: "Texture and noise", transform: "Transform and distort",
};

const groups = STUDIO_FILTER_DIALOG_GROUP_ORDER.map((id) => ({
  id, entries: STUDIO_FILTER_DIALOG_CATALOG.filter((entry) => entry.group === id),
}));

interface StudioMobileFilterSelectProps {
  filterMutationLocked: boolean;
  filterPreparationBusy: boolean;
  filterTargetLabel: StudioFilterTargetLabel;
  filterUnavailableReason: string | null;
  onSelect: (kind: StudioFilterKind) => void;
  placement: "primary" | "context" | "workspace";
}

/** 도크·선택 항목·작업 공간 모두 정본 필터 목록과 같은 편집 명령을 사용한다. */
export function StudioMobileFilterSelect({
  filterMutationLocked, filterPreparationBusy, filterTargetLabel, filterUnavailableReason, onSelect, placement,
}: StudioMobileFilterSelectProps) {
  const t = useT();
  const bt = useBilingual("studio.mobileDock");
  const preload = useStudioFilterDialogIntent();
  const guidanceId = useId();
  const target = bt(filterTargetLabel, { "선택 이미지": "Selected image", "선택 레이어": "Selected layer", "현재 페이지 합성본": "Current page composite" }[filterTargetLabel]);
  const reason = filterUnavailableReason ?? (filterMutationLocked
    ? frozenStatus4Text("studio.frozenStatus4.dock.filterLocked", "편집 잠금을 해제한 뒤 필터를 적용하세요.") : null);
  const disabled = reason !== null || filterPreparationBusy;
  const guidance = filterPreparationBusy
    ? frozenStatus4Text("studio.frozenStatus4.dock.filterPreparing", { target }, "{target}: 필터 미리보기를 준비하는 중입니다.")
    : reason ? `${target}: ${reason}`
      : frozenStatus4Text("studio.frozenStatus4.dock.filterSelect", { target }, "{target}: 적용할 필터를 선택하세요.");
  const shared = {
    "data-studio-mobile-filter-select": placement,
    "data-studio-mobile-filter-target": filterTargetLabel,
    "aria-describedby": guidanceId,
    title: guidance,
    className: cn(
      "relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-semibold leading-none text-fg-2",
      placement === "primary" ? "min-w-[44px]" : "min-w-14 shrink-0 px-2",
      STUDIO_EASE, "focus-within:outline-2 focus-within:outline-accent focus-visible:outline-2 focus-visible:outline-accent",
      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-raised",
    ),
  };
  const caption = <><StudioToolArtwork tool="lightDark" /><span>{bt("필터", "Filters")}</span><span className="sr-only" id={guidanceId}>{guidance}</span></>;
  if (disabled) {
    return <button type="button" {...shared} aria-busy={filterPreparationBusy} aria-disabled="true"
      aria-label={bt(`${target} 필터를 사용할 수 없음`, `Filters unavailable for ${target}`)}>{caption}</button>;
  }
  return <label {...shared}>
    {caption}
    <select defaultValue="" aria-label={bt(`${target} 필터 선택`, `Choose a filter for ${target}`)}
      aria-describedby={guidanceId} title={guidance} className="absolute inset-0 size-full cursor-pointer opacity-0"
      onFocus={preload} onPointerDown={preload} onPointerEnter={preload}
      onChange={(event) => {
        const value = event.currentTarget.value;
        event.currentTarget.value = "";
        if (value === "filter-gallery") onSelect(value);
        else {
          const entry = STUDIO_FILTER_DIALOG_CATALOG.find(({ kind }) => kind === value);
          if (entry) onSelect(entry.kind);
        }
      }}>
      <option value="" disabled>{bt("필터 선택", "Choose a filter")}</option>
      <option value="filter-gallery">{bt("필터 갤러리 · 효과 쌓기", "Filter gallery · Stack effects")}</option>
      {groups.map(({ id, entries }) => <optgroup key={id} label={bt(studioFilterGroupLabel(id), GROUP_NAMES_EN[id])}>
        {entries.map(({ kind, title }) => <option key={kind} value={kind}>
          {localizeStudioText(t, title, `studio.mainMenu.item.filter.${kind}`)}
        </option>)}
      </optgroup>)}
    </select>
  </label>;
}
