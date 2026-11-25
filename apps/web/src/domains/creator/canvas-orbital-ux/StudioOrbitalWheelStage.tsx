/**
 * Wave 38B — 데스크톱 8분할 SVG 오비탈 휠 및 기기별 인체공학 스테이지 라우터.
 *
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 44×44px 네이티브 접근성 버튼 · 자석 스냅 프리뷰).
 */

import {
  Eraser,
  FlipHorizontal2,
  Layers,
  Move,
  PenTool,
  Pipette,
  SplitSquareHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type PointerEvent, type ReactElement } from "react";

import {
  DEFAULT_ORBITAL_WHEEL_CONFIG,
  ORBITAL_WHEEL_SECTORS,
  buildOrbitalSectorSvgPath,
  getOrbitalSectorCentroid,
  polarBearingToCartesian,
  resolveOrbitalWheelPointer,
  type ErgonomicDeviceMode,
  type MobileThumbActionId,
  type OrbitalPointerResolution,
  type OrbitalSectorDefinition,
  type OrbitalSectorId,
  type TabletDualWheelState,
} from "./orbital-wheel-engine";
import {
  StudioMobileThumbDockView,
  StudioTabletDualWheelView,
} from "./StudioTabletMobileStage";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const ORBITAL_ICONS: Readonly<Record<OrbitalSectorId, LucideIcon>> = {
  brush: PenTool,
  eraser: Eraser,
  eyedropper: Pipette,
  transform: Move,
  symmetry: SplitSquareHorizontal,
  "flip-horizontal": FlipHorizontal2,
  undo: Undo2,
  "layer-peek": Layers,
};

const WHEEL_VIEWBOX = 304;
const WHEEL_CENTER = WHEEL_VIEWBOX / 2;
const WHEEL_INNER_R = 44;
const WHEEL_OUTER_R = 132;

export interface StudioOrbitalWheelStageProps {
  readonly deviceMode: ErgonomicDeviceMode;
  readonly activeSectorId: OrbitalSectorId;
  readonly flippedHorizontal: boolean;
  readonly tabletState: TabletDualWheelState;
  readonly onSelectSector: (sector: OrbitalSectorDefinition) => void;
  readonly onTabletStateChange: (next: TabletDualWheelState) => void;
  readonly onMobileAction: (actionId: MobileThumbActionId, labelKo: string) => void;
}

export function StudioOrbitalWheelStage({
  deviceMode,
  activeSectorId,
  flippedHorizontal,
  tabletState,
  onSelectSector,
  onTabletStateChange,
  onMobileAction,
}: StudioOrbitalWheelStageProps): ReactElement {
  const [hoveredPointer, setHoveredPointer] = useState<OrbitalPointerResolution | null>(null);

  const activeSector = useMemo(
    () =>
      ORBITAL_WHEEL_SECTORS.find((item) => item.id === activeSectorId) ?? ORBITAL_WHEEL_SECTORS[0],
    [activeSectorId],
  );

  const sectorPaths = useMemo(
    () =>
      ORBITAL_WHEEL_SECTORS.map((sector) => ({
        sector,
        path: buildOrbitalSectorSvgPath(
          WHEEL_CENTER,
          WHEEL_CENTER,
          WHEEL_INNER_R,
          WHEEL_OUTER_R,
          sector.index,
          2.8,
        ),
        centroid: getOrbitalSectorCentroid(
          WHEEL_CENTER,
          WHEEL_CENTER,
          WHEEL_INNER_R + 4,
          WHEEL_OUTER_R - 4,
          sector.index,
        ),
      })),
    [],
  );

  if (deviceMode === "tablet") {
    return (
      <StudioTabletDualWheelView
        flippedHorizontal={flippedHorizontal}
        tabletState={tabletState}
        onTabletStateChange={onTabletStateChange}
      />
    );
  }

  if (deviceMode === "mobile") {
    return <StudioMobileThumbDockView onMobileAction={onMobileAction} />;
  }

  const handleWheelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = ((event.clientX - rect.left) * WHEEL_VIEWBOX) / rect.width - WHEEL_CENTER;
    const dy = ((event.clientY - rect.top) * WHEEL_VIEWBOX) / rect.height - WHEEL_CENTER;
    setHoveredPointer(
      resolveOrbitalWheelPointer(dx, dy, {
        previousSectorIndex: hoveredPointer?.snappedSectorIndex ?? null,
      }),
    );
  };

  const displaySector = hoveredPointer?.snappedSector ?? activeSector;
  const snapRayEnd =
    hoveredPointer && !hoveredPointer.inDeadzone && hoveredPointer.visualPointerAngleDeg !== null
      ? polarBearingToCartesian(
          WHEEL_CENTER,
          WHEEL_CENTER,
          WHEEL_INNER_R + 14,
          hoveredPointer.visualPointerAngleDeg,
        )
      : null;

  return (
    <div data-testid="stage-desktop-orbital" className="space-y-4">
      <p className="text-xs text-fg-3 break-keep">
        휠의 선택·스냅 좌표를 보여 주는 예제예요. 표시된 도구와 단축키는 실제 편집기를 조작하지 않아요.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div
          data-testid="orbital-wheel-surface"
          onPointerMove={handleWheelPointerMove}
          onPointerLeave={() => setHoveredPointer(null)}
          className="relative mx-auto aspect-square w-full max-w-[304px] shrink-0 select-none"
        >
          <svg
            viewBox={`0 0 ${WHEEL_VIEWBOX} ${WHEEL_VIEWBOX}`}
            data-testid="orbital-wheel-svg"
            className="h-full w-full"
            aria-hidden="true"
          >
            <circle
              cx={WHEEL_CENTER}
              cy={WHEEL_CENTER}
              r={WHEEL_OUTER_R + 10}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="1"
              strokeDasharray="2 7"
            />

            {sectorPaths.map(({ sector, path }) => {
              const isSelected = sector.id === activeSectorId;
              const isSnappedHover =
                hoveredPointer !== null &&
                !hoveredPointer.inDeadzone &&
                hoveredPointer.snappedSectorIndex === sector.index;

              return (
                <path
                  key={sector.id}
                  d={path}
                  fill={
                    isSelected
                      ? "var(--color-accent)"
                      : isSnappedHover
                        ? "var(--color-accent-soft)"
                        : "var(--color-card)"
                  }
                  stroke={
                    isSelected || isSnappedHover ? "var(--color-accent)" : "var(--color-line)"
                  }
                  strokeWidth={isSelected || isSnappedHover ? "1.75" : "1"}
                  className="transition-colors duration-150 motion-reduce:transition-none"
                />
              );
            })}

            {snapRayEnd ? (
              <g>
                <line
                  x1={WHEEL_CENTER}
                  y1={WHEEL_CENTER}
                  x2={snapRayEnd.x}
                  y2={snapRayEnd.y}
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx={snapRayEnd.x} cy={snapRayEnd.y} r="4" fill="var(--color-accent)" />
              </g>
            ) : null}

            <circle
              cx={WHEEL_CENTER}
              cy={WHEEL_CENTER}
              r={DEFAULT_ORBITAL_WHEEL_CONFIG.deadzoneRadiusPx + 8}
              fill={hoveredPointer?.inDeadzone ? "var(--color-raised)" : "var(--color-panel)"}
              stroke={
                hoveredPointer?.inDeadzone ? "var(--color-line-strong)" : "var(--color-accent)"
              }
              strokeWidth="1.5"
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center text-center">
              <span data-testid="orbital-center-label" className="text-xs font-semibold text-fg break-keep">
                {hoveredPointer?.inDeadzone ? "데드존" : displaySector.shortLabelKo}
              </span>
              <span className="text-xs text-fg-3 tabular-nums">
                {hoveredPointer?.inDeadzone
                  ? `${Math.round(hoveredPointer.distancePx)}px`
                  : `${displaySector.centerAngleDeg}°`}
              </span>
            </div>
          </div>

          {sectorPaths.map(({ sector, centroid }) => {
            const Icon = ORBITAL_ICONS[sector.id];
            const isSelected = sector.id === activeSectorId;
            return (
              <button
                key={sector.id}
                type="button"
                data-testid={`orbital-sector-${sector.id}`}
                aria-pressed={isSelected}
                aria-label={`${sector.labelKo} (${sector.shortcut})`}
                onClick={() => onSelectSector(sector)}
                onFocus={() => {
                  const pt = polarBearingToCartesian(0, 0, 88, sector.centerAngleDeg);
                  setHoveredPointer(resolveOrbitalWheelPointer(pt.x, pt.y));
                }}
                style={{
                  left: `${((centroid.x / WHEEL_VIEWBOX) * 100).toFixed(2)}%`,
                  top: `${((centroid.y / WHEEL_VIEWBOX) * 100).toFixed(2)}%`,
                }}
                className={`absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none break-keep ${
                  isSelected ? "text-on-accent" : "text-fg hover:text-accent"
                } ${FOCUS_RING}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="leading-tight">{sector.shortLabelKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg break-keep">
                {displaySector.labelKo}
              </span>
              <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2 tabular-nums">
                {displaySector.shortcut}
              </span>
            </div>
            <p className="text-xs text-fg-2 break-keep">{displaySector.hintKo}</p>
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-line/60 pt-3 text-xs">
            <div className="rounded-lg bg-panel p-2.5">
              <dt className="text-fg-3">데드존 반경</dt>
              <dd className="mt-0.5 font-semibold text-fg tabular-nums">
                {DEFAULT_ORBITAL_WHEEL_CONFIG.deadzoneRadiusPx}px
              </dd>
            </div>
            <div className="rounded-lg bg-panel p-2.5">
              <dt className="text-fg-3">스냅 방위각</dt>
              <dd data-testid="orbital-snap-angle" className="mt-0.5 font-semibold text-fg tabular-nums">
                {hoveredPointer?.inDeadzone ? "잠금 대기" : `${displaySector.centerAngleDeg}°`}
              </dd>
            </div>
            <div className="rounded-lg bg-panel p-2.5">
              <dt className="text-fg-3">자석 흡착 강도</dt>
              <dd className="mt-0.5 font-semibold text-fg tabular-nums">
                {hoveredPointer && !hoveredPointer.inDeadzone
                  ? `${Math.round(hoveredPointer.magneticPullStrength * 100)}%`
                  : "100%"}
              </dd>
            </div>
            <div className="rounded-lg bg-panel p-2.5">
              <dt className="text-fg-3">미니맵 예제 좌우 상태</dt>
              <dd data-testid="orbital-flip-status" className="mt-0.5 font-semibold text-fg break-keep">
                {flippedHorizontal ? "좌우 반전 중" : "정방향"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
