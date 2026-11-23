import { Compass } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioAtelierPulseSnapshot } from "../studio-virtual-space-atelier-pulse";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import {
  SPACE_ZONE_WORK_TITLES,
  type SpaceZoneWorkItem,
  type SpaceZoneWorkKind,
  type ZeroWalkShortcutItem,
} from "./space-zone-workflow";

/**
 * 협업 구역 바로 가기 줄. 회의실·작업실·갤러리에 들어가면 위치 칩 아래에 나타나고, 나가면 사라진다.
 * Zero-Walk 단축 동선(`zeroWalkShortcuts`)이 전달되면 구역 이동 없이 즉시 원고·검수·책상·강의실로 직행한다.
 */
export const SpaceZoneWorkbar = memo(function SpaceZoneWorkbar({
  kind,
  items,
  pulse,
  zeroWalkShortcuts,
  onPanel,
  onCowork,
  onShare,
  onPulseAction,
  onZeroWalkShortcut,
}: {
  readonly kind: SpaceZoneWorkKind | null;
  readonly items: readonly SpaceZoneWorkItem[];
  readonly pulse?: StudioAtelierPulseSnapshot | null;
  readonly zeroWalkShortcuts?: readonly ZeroWalkShortcutItem[];
  readonly onPanel: (panel: StudioVirtualWorkspacePanel) => void;
  readonly onCowork: () => void;
  readonly onShare: () => void;
  readonly onPulseAction?: () => void;
  readonly onZeroWalkShortcut?: (shortcut: ZeroWalkShortcutItem) => void;
}) {
  const bt = useBilingual("SpaceZoneWorkbar");
  const hasZoneItems = Boolean(kind && items.length);
  const hasZeroWalk = Boolean(zeroWalkShortcuts?.length);
  if (!hasZoneItems && !hasZeroWalk) return null;
  const title = kind ? SPACE_ZONE_WORK_TITLES[kind] : null;
  return <>
    {hasZeroWalk && zeroWalkShortcuts ? (
      <nav
        aria-label={bt("바로 작업 직행", "Zero-walk shortcuts")}
        data-testid="space-zero-walk-bar"
        data-space-interactive="true"
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-panel/95 p-1.5 shadow-sm"
      >
        {zeroWalkShortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          const badge = shortcut.badgeLabelKo && shortcut.badgeLabelEn
            ? bt(shortcut.badgeLabelKo, shortcut.badgeLabelEn)
            : null;
          const itemClass = `inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none ${
            shortcut.active
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg hover:border-accent hover:bg-accent-soft"
          }`;
          const inner = <>
            <Icon size={15} aria-hidden />
            <span>{bt(shortcut.labelKo, shortcut.labelEn)}</span>
            {badge ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent tabular-nums">
                {badge}
              </span>
            ) : null}
          </>;
          if (shortcut.targetKind === "href" || !onZeroWalkShortcut) {
            return (
              <Link
                key={shortcut.id}
                href={shortcut.href}
                className={itemClass}
                data-zero-walk-item={shortcut.id}
                aria-current={shortcut.active ? "location" : undefined}
              >
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={shortcut.id}
              type="button"
              className={itemClass}
              data-zero-walk-item={shortcut.id}
              aria-current={shortcut.active ? "location" : undefined}
              onClick={() => onZeroWalkShortcut(shortcut)}
            >
              {inner}
            </button>
          );
        })}
      </nav>
    ) : null}
    {hasZoneItems && kind && title ? (
      <nav className="space-zone-workbar" aria-label={bt(title.ko, title.en)} data-space-interactive="true" data-zone-work={kind}>
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
              data-pulse-tempo={pulse.tempo}
              title={pulse.recommendedRoutineKo ? `${bt(pulse.workStatusBadgeKo, pulse.workStatusBadgeEn)} · ${bt(pulse.recommendedRoutineKo, pulse.recommendedRoutineEn)}` : undefined}
              onClick={onPulseAction}
            >
              <Compass size={15} aria-hidden />
              <span>{bt(pulse.quickActionLabelKo, pulse.quickActionLabelEn)}</span>
            </button>
          ) : null}
        </div>
      </nav>
    ) : null}
  </>;
});

