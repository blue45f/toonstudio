/**
 * 2D 탑다운 가상 스튜디오 공간 음향 스테이지 SVG 맵.
 *
 * - 12m × 9m 스튜디오 격자 위에 리스너 지향각 콘, 벽체 차음 경계선,
 *   동료별 직달/차음 음선 및 실시간 L/R 패닝·거리·차음(dB)을 표시한다.
 * - Calm Atelier 시맨틱 토큰 전용.
 */

import type { MouseEvent, ReactElement } from "react";

import {
  STUDIO_STAGE_BOUNDS,
  clampNumber,
  computeListenerBasis,
  formatStereoPanKo,
  type AcousticWallSegment,
  type HrtfSpatialEvaluation,
  type SpatialListenerState,
  type SpatialPeerAudioSource,
} from "./spatial-binaural-stage";

export interface SpatialAcousticMapSvgProps {
  readonly listener: SpatialListenerState;
  readonly peers: readonly SpatialPeerAudioSource[];
  readonly peerMixes: readonly HrtfSpatialEvaluation[];
  readonly walls: readonly AcousticWallSegment[];
  readonly onMoveListenerTo: (worldX: number, worldZ: number) => void;
}

const MAP_W = 480;
const MAP_H = 340;

function toSvgX(worldX: number): number {
  const ratio =
    (worldX - STUDIO_STAGE_BOUNDS.minX) /
    (STUDIO_STAGE_BOUNDS.maxX - STUDIO_STAGE_BOUNDS.minX);
  return Math.round(clampNumber(ratio, 0, 1) * MAP_W * 10) / 10;
}

function toSvgY(worldZ: number): number {
  const ratio =
    (worldZ - STUDIO_STAGE_BOUNDS.minZ) /
    (STUDIO_STAGE_BOUNDS.maxZ - STUDIO_STAGE_BOUNDS.minZ);
  return Math.round(clampNumber(ratio, 0, 1) * MAP_H * 10) / 10;
}

function buildListenerConePoints(listener: SpatialListenerState): string {
  const { forward, right } = computeListenerBasis(listener.yawDeg);
  const coneLen = 1.7;
  const coneHalfW = 0.95;
  const ox = listener.position.x;
  const oz = listener.position.z;

  const leftX = ox + forward.x * coneLen - right.x * coneHalfW;
  const leftZ = oz + forward.z * coneLen - right.z * coneHalfW;
  const rightX = ox + forward.x * coneLen + right.x * coneHalfW;
  const rightZ = oz + forward.z * coneLen + right.z * coneHalfW;

  return `${toSvgX(ox)},${toSvgY(oz)} ${toSvgX(leftX)},${toSvgY(leftZ)} ${toSvgX(rightX)},${toSvgY(rightZ)}`;
}

export function SpatialAcousticMapSvg({
  listener,
  peers,
  peerMixes,
  walls,
  onMoveListenerTo,
}: SpatialAcousticMapSvgProps): ReactElement {
  const handleMapClick = (event: MouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normX = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    const normY = clampNumber((event.clientY - rect.top) / rect.height, 0, 1);
    const nextX =
      STUDIO_STAGE_BOUNDS.minX +
      normX * (STUDIO_STAGE_BOUNDS.maxX - STUDIO_STAGE_BOUNDS.minX);
    const nextZ =
      STUDIO_STAGE_BOUNDS.minZ +
      normY * (STUDIO_STAGE_BOUNDS.maxZ - STUDIO_STAGE_BOUNDS.minZ);
    onMoveListenerTo(
      Math.round(clampNumber(nextX, -5.6, 5.6) * 10) / 10,
      Math.round(clampNumber(nextZ, -4.1, 4.1) * 10) / 10,
    );
  };

  return (
    <svg
      role="img"
      aria-label="가상 스튜디오 2D 탑다운 공간 음향 스테이지 맵"
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      onClick={handleMapClick}
      className="block h-auto w-full cursor-crosshair rounded-lg border border-line bg-panel"
    >
      {/* 2m 메트릭 격자 */}
      {[-4, -2, 0, 2, 4].map((gx) => (
        <line
          key={`gx-${gx}`}
          x1={toSvgX(gx)}
          y1={0}
          x2={toSvgX(gx)}
          y2={MAP_H}
          className="stroke-line"
          strokeWidth={gx === 0 ? 1.2 : 0.7}
        />
      ))}
      {[-4, -2, 0, 2, 4].map((gz) => (
        <line
          key={`gz-${gz}`}
          x1={0}
          y1={toSvgY(gz)}
          x2={MAP_W}
          y2={toSvgY(gz)}
          className="stroke-line"
          strokeWidth={gz === 0 ? 1.2 : 0.7}
        />
      ))}

      {/* 리스너 전방 지향각 시야 콘 */}
      <polygon
        points={buildListenerConePoints(listener)}
        className="fill-accent/20 stroke-accent"
        strokeWidth={1.2}
      />

      {/* 벽체 차음 파티션 */}
      {walls.map((wall) => {
        const x1 = toSvgX(wall.start.x);
        const y1 = toSvgY(wall.start.z);
        const x2 = toSvgX(wall.end.x);
        const y2 = toSvgY(wall.end.z);
        return (
          <g key={wall.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={wall.active ? "stroke-warn" : "stroke-line"}
              strokeWidth={wall.active ? 5 : 2}
              strokeDasharray={wall.active ? undefined : "5 5"}
              strokeLinecap="round"
            />
            <text
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2 - 6}
              textAnchor="middle"
              className={wall.active ? "fill-warn text-[10px] font-bold" : "fill-fg-3 text-[10px]"}
            >
              {wall.active ? `-${wall.occlusionDb}dB` : "개방"}
            </text>
          </g>
        );
      })}

      {/* 리스너-동료 음향 전파선 및 동료 마커 */}
      {peers.map((peer, idx) => {
        const evalMix = peerMixes[idx];
        if (!evalMix) return null;
        const lx = toSvgX(listener.position.x);
        const ly = toSvgY(listener.position.z);
        const px = toSvgX(peer.position.x);
        const py = toSvgY(peer.position.z);
        const isOccluded = evalMix.occlusionDb > 0;

        return (
          <g key={peer.peerId}>
            <line
              x1={lx}
              y1={ly}
              x2={px}
              y2={py}
              className={
                peer.muted ? "stroke-line" : isOccluded ? "stroke-bad" : "stroke-good"
              }
              strokeWidth={peer.muted ? 1 : 1.8}
              strokeDasharray={isOccluded || peer.muted ? "5 4" : undefined}
            />
            <circle
              cx={px}
              cy={py}
              r={13}
              className={
                peer.muted
                  ? "fill-raised stroke-line"
                  : isOccluded
                    ? "fill-bad/20 stroke-bad"
                    : "fill-good/20 stroke-good"
              }
              strokeWidth={2}
            />
            <text x={px} y={py + 3} textAnchor="middle" className="fill-fg text-[10px] font-bold">
              {peer.displayNameKo}
            </text>
            <text
              x={px}
              y={py + 24}
              textAnchor="middle"
              className="fill-fg-2 text-[9px] font-semibold"
            >
              {formatStereoPanKo(evalMix.stereoPan)} · {evalMix.distanceM.toFixed(1)}m
              {isOccluded ? ` · -${evalMix.occlusionDb}dB` : ""}
            </text>
          </g>
        );
      })}

      {/* 리스너 아바타 */}
      <g>
        <circle
          cx={toSvgX(listener.position.x)}
          cy={toSvgY(listener.position.z)}
          r={14}
          className="fill-accent stroke-card"
          strokeWidth={2.5}
        />
        <text
          x={toSvgX(listener.position.x)}
          y={toSvgY(listener.position.z) + 4}
          textAnchor="middle"
          className="fill-on-accent text-[11px] font-bold"
        >
          나
        </text>
      </g>
    </svg>
  );
}
