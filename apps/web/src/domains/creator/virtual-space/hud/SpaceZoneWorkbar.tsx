import { Sparkles } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioAtelierPulseSnapshot } from "../studio-virtual-space-atelier-pulse";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import { SPACE_ZONE_WORK_TITLES, type SpaceZoneWorkItem, type SpaceZoneWorkKind } from "./space-zone-workflow";

/**
 * 협업 구역 바로 가기 줄. 회의실·작업실·갤러리에 들어가면 위치 칩 아래에 나타나고, 나가면 사라진다.
 * 링크는 제작 관리·스튜디오 화면으로, 패널·같이 작업하기·화면 공유·아틀리에 펄스 액션은 HUD 안에서 바로 연다.
 */
export const SpaceZoneWorkbar = memo(function SpaceZoneWorkbar({
  kind,
  items,
  pulse,
  onPanel,
  onCowork,
  onShare,
  onPulseAction,
}: {
  readonly kind: SpaceZoneWorkKind | null;
  readonly items: readonly SpaceZoneWorkItem[];
  readonly pulse?: StudioAtelierPulseSnapshot | null;
  readonly onPanel: (panel: StudioVirtualWorkspacePanel) => void;
  readonly onCowork: () => void;
  readonly onShare: () => void;
  readonly onPulseAction?: () => void;
}) {
  const bt = useBilingual("SpaceZoneWorkbar");
  if (!kind || !items.length) return null;
  const title = SPACE_ZONE_WORK_TITLES[kind];
  return <nav className="space-zone-workbar" aria-label={bt(title.ko, title.en)} data-space-interactive="true" data-zone-work={kind}>
    <span className="space-zone-workbar__title">{bt(title.ko, title.en)}</span>
    <div className="space-zone-workbar__items">
      {items.map((item) => {
        const Icon = item.icon;
        const content = <><Icon size={15} aria-hidden /><span>{bt(item.labelKo, item.labelEn)}</span></>;
        if (item.kind === "href") return <Link key={item.id} href={item.href} className="space-zone-workbar__item" data-zone-work-item={item.id}>{content}</Link>;
        const onClick = item.kind === "panel" ? () => onPanel(item.panel) : item.kind === "cowork" ? onCowork : onShare;
        return <button key={item.id} type="button" className="space-zone-workbar__item" data-zone-work-item={item.id} onClick={onClick}>{content}</button>;
      })}
      {pulse?.quickActionId && onPulseAction ? (
        <button
          type="button"
          className="space-zone-workbar__item space-zone-workbar__item--pulse"
          data-zone-work-item="atelier-pulse"
          onClick={onPulseAction}
        >
          <Sparkles size={15} aria-hidden />
          <span>{bt(pulse.quickActionLabelKo, pulse.quickActionLabelEn)}</span>
        </button>
      ) : null}
    </div>
  </nav>;
});

