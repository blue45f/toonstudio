import { ArrowLeft, Box, Layers, Lock, Search, Sparkles } from "lucide-react";
import { memo, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioAtelierPulseSnapshot } from "../studio-virtual-space-atelier-pulse";
import { studioVirtualCampusZoneMeta } from "../studio-virtual-space-campus-world";
import { SPACE_ZONE_FALLBACK_ICON, SPACE_ZONE_FALLBACK_TONE, SPACE_ZONE_ICONS, SPACE_ZONE_TONE_TOKENS } from "./space-zone-visuals";
import type { SpaceConnectionStatus } from "./use-space-connection-status";

export interface SpaceLocationZone {
  readonly roomId: string | null;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly privateZone: boolean;
}

/**
 * 좌상단 위치 칩: 나가기 · 공간명 · 현재 구역 · 프라이빗 배지 · (프로젝트) 연결 상태 · 아틀리에 펄스 공명 배지 · 3D/2D 엔진 전환 · 퀵 파인더.
 * 모바일에서는 같은 정보를 한 줄 알약으로 줄여 보여 준다.
 */
export const SpaceLocationChip = memo(function SpaceLocationChip({
  spaceName,
  zone,
  connection,
  pulse,
  engineMode,
  compact = false,
  onExit,
  onQuickAction,
  onToggleEngineMode,
  onOpenSearch,
}: {
  readonly spaceName: string;
  readonly zone: SpaceLocationZone;
  readonly connection?: SpaceConnectionStatus | null;
  readonly pulse?: StudioAtelierPulseSnapshot | null;
  readonly engineMode?: "2d" | "3d";
  readonly compact?: boolean;
  readonly onExit: () => void;
  readonly onQuickAction?: () => void;
  readonly onToggleEngineMode?: () => void;
  readonly onOpenSearch?: () => void;
}) {
  const bt = useBilingual("SpaceLocationChip");
  const meta = zone.roomId ? studioVirtualCampusZoneMeta(zone.roomId) : null;
  const Icon = meta ? SPACE_ZONE_ICONS[meta.icon] : SPACE_ZONE_FALLBACK_ICON;
  const tone = meta ? SPACE_ZONE_TONE_TOKENS[meta.tone] : SPACE_ZONE_FALLBACK_TONE;
  const zoneLabel = bt(zone.labelKo, zone.labelEn);
  return <div className="space-location" data-compact={compact || undefined} data-space-interactive="true"
    style={{ "--space-zone-tone": tone } as CSSProperties}>
    <button type="button" className="space-icon-button space-location__exit" onClick={onExit}
      aria-label={bt("가상 스튜디오 나가기", "Leave the virtual studio")} title={bt("나가기", "Leave")}>
      <ArrowLeft size={18} aria-hidden />
    </button>
    <div className="space-location__text">
      {compact ? null : <span className="space-location__space">{spaceName}</span>}
      <strong className="space-location__zone">
        <span className="space-location__zone-icon" aria-hidden><Icon size={14} /></span>
        <span className="sr-only">{bt("현재 위치", "Current location")}: </span>
        {meta?.signEn && !compact ? <span className="space-location__sign" aria-hidden>{meta.signEn}</span> : null}
        <span className="space-location__zone-name">{zoneLabel}</span>
      </strong>
    </div>
    {zone.privateZone ? <span className="space-location__private">
      <Lock size={13} aria-hidden />{bt("프라이빗", "Private")}
    </span> : null}
    {pulse && !compact ? (() => {
      const dims = pulse.dimensions;
      const dimSummary = dims
        ? ` [오피스 ${dims.officePresence}·딥워크 ${dims.deepWorkFlow}·협업 ${dims.reviewCollaboration}·웰니스 ${dims.wellnessVitality}·미학 ${dims.atelierAesthetics}·리듬 ${dims.autonomousRhythm}·추진 ${dims.creativeVelocity}]`
        : "";
      const dimData = dims
        ? `${dims.officePresence},${dims.deepWorkFlow},${dims.reviewCollaboration},${dims.wellnessVitality},${dims.atelierAesthetics},${dims.autonomousRhythm},${dims.creativeVelocity}`
        : undefined;
      const workBadge = bt(
        pulse.workStatusBadgeKo ?? pulse.quickActionLabelKo,
        pulse.workStatusBadgeEn ?? pulse.quickActionLabelEn,
      );
      const routineHint = pulse.recommendedRoutineKo ? ` · ${bt(pulse.recommendedRoutineKo, pulse.recommendedRoutineEn)}` : "";
      return onQuickAction && pulse.quickActionId ? (
        <button
          type="button"
          className="space-location__pulse"
          data-tempo={pulse.tempo}
          data-atelier-pulse-tempo={pulse.tempo}
          data-omni-tier={pulse.omniTier}
          data-omni-score={pulse.omniScore}
          data-quantum-score={pulse.quantumScore}
          data-hyper-dimensions={dimData}
          onClick={onQuickAction}
          title={`${bt(pulse.sublineKo, pulse.sublineEn)} · ${workBadge}${dimSummary}${routineHint} · ${bt(pulse.quickActionLabelKo, pulse.quickActionLabelEn)}`}
          aria-label={`${bt(pulse.headlineKo, pulse.headlineEn)} (${workBadge}) — ${bt(pulse.quickActionLabelKo, pulse.quickActionLabelEn)}`}
        >
          <Sparkles size={13} aria-hidden />
          <span className="space-location__pulse-label">{bt(pulse.headlineKo, pulse.headlineEn)}</span>
          <strong className="space-location__pulse-score">{workBadge}</strong>
        </button>
      ) : (
        <span
          className="space-location__pulse"
          data-tempo={pulse.tempo}
          data-atelier-pulse-tempo={pulse.tempo}
          data-omni-tier={pulse.omniTier}
          data-omni-score={pulse.omniScore}
          data-quantum-score={pulse.quantumScore}
          data-hyper-dimensions={dimData}
          title={`${bt(pulse.sublineKo, pulse.sublineEn)} · ${workBadge}${dimSummary}${routineHint}`}
        >
          <Sparkles size={13} aria-hidden />
          <span className="space-location__pulse-label">{bt(pulse.headlineKo, pulse.headlineEn)}</span>
          <strong className="space-location__pulse-score">{workBadge}</strong>
        </span>
      );
    })() : null}
    {onToggleEngineMode && engineMode ? (
      <button
        type="button"
        className="space-location__engine-toggle"
        data-engine-mode={engineMode}
        onClick={onToggleEngineMode}
        aria-pressed={engineMode === "3d"}
        aria-label={engineMode === "3d"
          ? bt("현재 3D 스튜디오 공간 · 클릭하여 2D 캠퍼스로 전환", "Currently 3D Studio Space · Click to switch to 2D Campus")
          : bt("현재 2D 캠퍼스 · 클릭하여 3D 스튜디오 공간으로 전환", "Currently 2D Campus · Click to switch to 3D Studio Space")}
        title={engineMode === "3d"
          ? bt("3D 스튜디오 (Three.js + GLB/VRM) 활성 · 2D 캠퍼스로 전환", "3D Studio (Three.js + GLB/VRM) active · Switch to 2D Campus")
          : bt("3D 스튜디오 (Three.js + GLB/VRM) 공간으로 전환", "Switch to 3D Studio (Three.js + GLB/VRM) Space")}
      >
        {engineMode === "3d" ? <Box size={13} aria-hidden /> : <Layers size={13} aria-hidden />}
        <span>{engineMode === "3d" ? bt("3D 공간", "3D Space") : bt("3D 전환", "3D View")}</span>
      </button>
    ) : null}
    {connection && !compact ? <span className="space-location__connection" data-tone={connection.tone}>
      <span className="space-location__dot" aria-hidden />{connection.label}
    </span> : null}
    {onOpenSearch && !compact ? (
      <button
        type="button"
        className="space-location__search"
        onClick={onOpenSearch}
        aria-label={bt("구역·팀원 빠른 찾기 (단축키 K)", "Quick find rooms & teammates (Shortcut K)")}
        title={bt("빠른 찾기 (K)", "Quick Find (K)")}
      >
        <Search size={13} aria-hidden />
        <kbd>K</kbd>
      </button>
    ) : null}
  </div>;
});

