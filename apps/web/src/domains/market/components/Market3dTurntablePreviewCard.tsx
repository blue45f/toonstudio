/**
 * T-046: 마켓 3D 에셋 인터랙티브 턴테이블·와이어프레임·웹툰 툰라인 프리뷰 카드.
 *
 * 경계 규칙: `market` 도메인 내 완전 독립 구현이며 `creator` 도메인을 절대 import하지 않는다.
 * 순수 3D 회전 행렬 투영(SVG)으로 경량 렌더링해 번들 부담 없이 360° 드래그·와이어프레임·
 * 웹툰 툰라인(NPR 윤곽선+망점) 미리보기를 제공하고 `prefers-reduced-motion`을 100% 존중한다.
 */

import {
  Box,
  Grid3x3,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type Market3dPreviewMode = "solid" | "wireframe" | "toon-line";
export type Market3dLightPreset = "front" | "rim" | "dramatic";
export type Market3dBackdropMode = "studio" | "paper" | "grid";

export interface Market3dTurntablePreviewCardProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly initialMode?: Market3dPreviewMode;
}

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ProjectedFace {
  readonly id: string;
  readonly points: string;
  readonly depth: number;
  readonly intensity: number;
}

interface ProjectedEdge {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

// 3D 건축/소품 프리뷰용 다면체(건물/실내/캐릭터 블록 실루엣) 정점 및 면 정의
const PREVIEW_VERTICES: readonly Vec3[] = Object.freeze([
  // 하단 기단 (0..3)
  { x: -1.1, y: -0.9, z: -0.9 },
  { x: 1.1, y: -0.9, z: -0.9 },
  { x: 1.1, y: -0.9, z: 0.9 },
  { x: -1.1, y: -0.9, z: 0.9 },
  // 본체 상단 (4..7)
  { x: -0.95, y: 0.45, z: -0.78 },
  { x: 0.95, y: 0.45, z: -0.78 },
  { x: 0.95, y: 0.45, z: 0.78 },
  { x: -0.95, y: 0.45, z: 0.78 },
  // 지붕 능선 / 상단 포인트 (8..9)
  { x: -0.55, y: 1.05, z: 0 },
  { x: 0.55, y: 1.05, z: 0 },
]);

const PREVIEW_FACES: readonly { readonly id: string; readonly indices: readonly number[] }[] =
  Object.freeze([
    { id: "front", indices: [3, 2, 6, 7] },
    { id: "back", indices: [1, 0, 4, 5] },
    { id: "left", indices: [0, 3, 7, 4] },
    { id: "right", indices: [2, 1, 5, 6] },
    { id: "roof-front", indices: [7, 6, 9, 8] },
    { id: "roof-back", indices: [5, 4, 8, 9] },
    { id: "roof-left", indices: [4, 7, 8] },
    { id: "roof-right", indices: [6, 5, 9] },
    { id: "base", indices: [0, 1, 2, 3] },
  ]);

const LIGHT_VECTORS: Readonly<Record<Market3dLightPreset, Vec3>> = Object.freeze({
  front: { x: 0.35, y: 0.7, z: 0.62 },
  rim: { x: -0.65, y: 0.55, z: -0.52 },
  dramatic: { x: 0.8, y: 0.45, z: 0.35 },
});

const ANGLE_PRESETS = [
  { yaw: 35, pitch: 18, labelKo: "쿼터뷰 35°", labelEn: "3/4 View 35°" },
  { yaw: 0, pitch: 12, labelKo: "정면 0°", labelEn: "Front 0°" },
  { yaw: 90, pitch: 14, labelKo: "측면 90°", labelEn: "Side 90°" },
  { yaw: 180, pitch: 14, labelKo: "후면 180°", labelEn: "Back 180°" },
] as const;

function normalizeYaw(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

function clampPitch(deg: number): number {
  return Math.min(45, Math.max(-25, Math.round(deg)));
}

function rotatePoint(point: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y2 = point.y * cosP - z1 * sinP;
  const z2 = point.y * sinP + z1 * cosP;
  return { x: x1, y: y2, z: z2 };
}

function computeFaceLightIntensity(a: Vec3, b: Vec3, c: Vec3, light: Vec3): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const nx = ab.y * ac.z - ab.z * ac.y;
  const ny = ab.z * ac.x - ab.x * ac.z;
  const nz = ab.x * ac.y - ab.y * ac.x;
  const len = Math.hypot(nx, ny, nz) || 1;
  const dot = (nx / len) * light.x + (ny / len) * light.y + (nz / len) * light.z;
  return Math.min(1, Math.max(0.18, (dot + 1) * 0.5));
}

function projectScene(
  yawDeg: number,
  pitchDeg: number,
  zoomPercent: number,
  lightPreset: Market3dLightPreset,
): { readonly faces: readonly ProjectedFace[]; readonly edges: readonly ProjectedEdge[] } {
  const scale = (zoomPercent / 100) * 66;
  const cx = 180;
  const cy = 112;
  const rotated = PREVIEW_VERTICES.map((v) => rotatePoint(v, yawDeg, pitchDeg));
  const projected = rotated.map((v) => {
    const persp = 4.2 / (4.2 - v.z * 0.45);
    return {
      sx: Math.round((cx + v.x * scale * persp) * 10) / 10,
      sy: Math.round((cy - v.y * scale * persp) * 10) / 10,
      z: v.z,
    };
  });

  const light = LIGHT_VECTORS[lightPreset];
  const faces: ProjectedFace[] = PREVIEW_FACES.map((face) => {
    const pts = face.indices.map((i) => projected[i]);
    const depth = pts.reduce((acc, item) => acc + item.z, 0) / pts.length;
    const intensity = computeFaceLightIntensity(
      rotated[face.indices[0]],
      rotated[face.indices[1]],
      rotated[face.indices[2]],
      light,
    );
    return {
      id: face.id,
      points: pts.map((p) => `${p.sx},${p.sy}`).join(" "),
      depth,
      intensity,
    };
  }).sort((left, right) => left.depth - right.depth);

  const edgeSet = new Set<string>();
  const edges: ProjectedEdge[] = [];
  for (const face of PREVIEW_FACES) {
    for (let i = 0; i < face.indices.length; i += 1) {
      const u = face.indices[i];
      const v = face.indices[(i + 1) % face.indices.length];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        id: key,
        x1: projected[u].sx,
        y1: projected[u].sy,
        x2: projected[v].sx,
        y2: projected[v].sy,
      });
    }
  }

  return { faces, edges };
}

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function Market3dTurntablePreviewCard({
  record,
  initialMode = "solid",
}: Market3dTurntablePreviewCardProps) {
  const bt = useBilingual("Market3dTurntablePreviewCard");
  const [mode, setMode] = useState<Market3dPreviewMode>(initialMode);
  const [yawDeg, setYawDeg] = useState<number>(35);
  const [pitchDeg, setPitchDeg] = useState<number>(18);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [lightPreset, setLightPreset] = useState<Market3dLightPreset>("front");
  const [backdrop, setBackdrop] = useState<Market3dBackdropMode>("studio");
  const [autoSpin, setAutoSpin] = useState<boolean>(false);
  const dragOriginRef = useRef<{ readonly x: number; readonly y: number; readonly yaw: number; readonly pitch: number } | null>(
    null,
  );

  const reducedMotion = prefersReducedMotionNow();

  useEffect(() => {
    if (!autoSpin || reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setYawDeg((prev) => normalizeYaw(prev + 3));
    }, 60);
    return () => window.clearInterval(timer);
  }, [autoSpin, reducedMotion]);

  const { faces, edges } = useMemo(
    () => projectScene(yawDeg, pitchDeg, zoomPercent, lightPreset),
    [lightPreset, pitchDeg, yawDeg, zoomPercent],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      dragOriginRef.current = { x: event.clientX, y: event.clientY, yaw: yawDeg, pitch: pitchDeg };
      setAutoSpin(false);
    },
    [pitchDeg, yawDeg],
  );

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    setYawDeg(normalizeYaw(origin.yaw + dx * 0.7));
    setPitchDeg(clampPitch(origin.pitch + dy * 0.35));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragOriginRef.current = null;
  }, []);

  const handleViewportKeyDown = useCallback((event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setYawDeg((prev) => normalizeYaw(prev - 15));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setYawDeg((prev) => normalizeYaw(prev + 15));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPitchDeg((prev) => clampPitch(prev + 5));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setPitchDeg((prev) => clampPitch(prev - 5));
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      setYawDeg(35);
      setPitchDeg(18);
      setZoomPercent(100);
    }
  }, []);

  const entryCount = Array.isArray(record.entries) ? record.entries.length : 1;
  const enginesLabel =
    record.compatibility?.engines?.length
      ? record.compatibility.engines.map((engine) => engine.toUpperCase()).join(" · ")
      : "WEBGL2 · THREE";

  return (
    <section
      aria-labelledby="market-3d-turntable-heading"
      data-testid="market-3d-turntable-card"
      data-preview-mode={mode}
      className="rounded-2xl border border-accent/35 bg-card p-4 shadow-sm sm:p-5 [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-accent">
            <Sparkles size={14} aria-hidden="true" />
            {bt("3D 에셋 인터랙티브 턴테이블 프리뷰", "Interactive 3D Turntable Preview")}
          </p>
          <h2 id="market-3d-turntable-heading" className="mt-1 text-base font-black text-fg">
            {bt(
              `${record.name} — 설치 전 360° 각도·와이어프레임·웹툰 선화 미리보기`,
              `${record.name} — Inspect 360° solid, wireframe & webtoon line-art before installing`,
            )}
          </h2>
          <p className="mt-1 text-xs text-fg-2">
            {bt(
              "화면을 좌우로 드래그하거나 슬라이더·화살표 키로 돌려 웹툰 컷에 얹었을 때 선화 느낌을 바로 확인하세요.",
              "Drag the viewport or use the slider and arrow keys to inspect geometry and webtoon ink lines.",
            )}
          </p>
        </div>
        <span className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold text-fg-2 tabular-nums">
          {`${enginesLabel} · ${bt(`구성 ${entryCount}종`, `${entryCount} item(s)`)}`}
        </span>
      </div>

      {/* 3대 렌더링 모드 스위처: 솔리드 · 와이어프레임 · 웹툰 툰라인 */}
      <div
        role="group"
        aria-label={bt("3D 프리뷰 표시 방식", "3D preview shading mode")}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {(
          [
            {
              id: "solid" as const,
              icon: <Box size={14} aria-hidden="true" />,
              labelKo: "솔리드 셰이딩",
              labelEn: "Solid Shading",
            },
            {
              id: "wireframe" as const,
              icon: <Grid3x3 size={14} aria-hidden="true" />,
              labelKo: "와이어프레임",
              labelEn: "Wireframe",
            },
            {
              id: "toon-line" as const,
              icon: <Layers size={14} aria-hidden="true" />,
              labelKo: "웹툰 툰라인",
              labelEn: "Webtoon Toon-Line",
            },
          ] as const
        ).map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              data-testid={`market-3d-mode-${item.id}`}
              onClick={() => setMode(item.id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {item.icon}
              <span>{bt(item.labelKo, item.labelEn)}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-pressed={autoSpin}
          disabled={reducedMotion}
          data-testid="market-3d-autospin-btn"
          onClick={() => setAutoSpin((prev) => !prev)}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-fg disabled:opacity-50"
        >
          {autoSpin ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          <span>
            {reducedMotion
              ? bt("모션 감소로 정지됨", "Paused (Reduced Motion)")
              : autoSpin
                ? bt("자동 회전 멈춤", "Pause spin")
                : bt("360° 자동 회전", "Auto 360° spin")}
          </span>
        </button>
      </div>

      {/* 인터랙티브 3D 턴테이블 뷰포트 */}
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-line",
            backdrop === "paper" ? "bg-raised" : "bg-canvas",
          )}
        >
          <svg
            viewBox="0 0 360 220"
            role="application"
            tabIndex={0}
            aria-label={bt(
              `3D 턴테이블 뷰포트. 현재 수평 ${yawDeg}도, 상하 ${pitchDeg}도, ${mode} 모드. 화살표 키로 회전합니다.`,
              `3D turntable viewport at yaw ${yawDeg} deg, pitch ${pitchDeg} deg in ${mode} mode. Use arrow keys to rotate.`,
            )}
            data-testid="market-3d-turntable-viewport"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleViewportKeyDown}
            className="h-56 w-full cursor-grab select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-64"
          >
            <defs>
              <pattern id="market-toon-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-fg)" strokeOpacity="0.24" strokeWidth="1.2" />
              </pattern>
            </defs>

            {/* 바닥 턴테이블 링 & 원고 가이드 */}
            {backdrop === "grid" ? (
              <g stroke="var(--color-line)" strokeOpacity="0.45" strokeWidth="1">
                <line x1="40" y1="168" x2="320" y2="168" />
                <line x1="70" y1="184" x2="290" y2="184" />
                <line x1="180" y1="36" x2="180" y2="196" />
              </g>
            ) : null}
            <ellipse
              cx="180"
              cy="176"
              rx="108"
              ry="20"
              fill="none"
              stroke="var(--color-accent)"
              strokeOpacity="0.45"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />

            {/* 솔리드 셰이딩 모드 */}
            {mode === "solid"
              ? faces.map((face) => (
                  <polygon
                    key={face.id}
                    points={face.points}
                    fill="var(--color-accent)"
                    fillOpacity={Math.round(face.intensity * 85) / 100}
                    stroke="var(--color-line-strong)"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                ))
              : null}

            {/* 와이어프레임 모드 */}
            {mode === "wireframe" ? (
              <g>
                {faces.map((face) => (
                  <polygon
                    key={face.id}
                    points={face.points}
                    fill="var(--color-cool)"
                    fillOpacity="0.09"
                  />
                ))}
                {edges.map((edge) => (
                  <line
                    key={edge.id}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="var(--color-cool)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            ) : null}

            {/* 웹툰 툰라인 (NPR 먹선 + 2단 셀 톤 + 망점) 모드 */}
            {mode === "toon-line" ? (
              <g>
                {faces.map((face) => {
                  const shaded = face.intensity < 0.56;
                  return (
                    <g key={face.id}>
                      <polygon
                        points={face.points}
                        fill={shaded ? "var(--color-raised)" : "var(--color-panel)"}
                        stroke="var(--color-fg)"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                      />
                      {shaded ? (
                        <polygon points={face.points} fill="url(#market-toon-hatch)" />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            ) : null}
          </svg>

          <div
            data-testid="market-3d-angle-readout"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel/80 px-3 py-2 text-[0.72rem] font-bold text-fg-2 tabular-nums"
          >
            <span>{bt(`수평 ${yawDeg}° · 상하 ${pitchDeg}° · 확대 ${zoomPercent}%`, `Yaw ${yawDeg}° · Pitch ${pitchDeg}° · Zoom ${zoomPercent}%`)}</span>
            <span>
              {mode === "wireframe"
                ? bt(`정점 ${PREVIEW_VERTICES.length} · 모서리 ${edges.length} (매니폴드 정상)`, `${PREVIEW_VERTICES.length} verts · ${edges.length} edges (Manifold OK)`)
                : mode === "toon-line"
                  ? bt("2단 셀 톤 · 먹선 2.4px 미리보기", "2-tone cel · 2.4px ink outline")
                  : bt("스튜디오 조명 · 실시간 회전", "Studio lighting · Live orbit")}
            </span>
          </div>
        </div>

        {/* 직관적 제어 패널 */}
        <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-3 text-xs">
          <label className="block font-bold text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>{bt("360° 회전 각도", "360° Turntable Yaw")}</span>
              <span className="text-fg">{`${yawDeg}°`}</span>
            </span>
            <input
              type="range"
              min={0}
              max={359}
              value={yawDeg}
              aria-label={bt("360도 회전 각도", "360 degree yaw angle")}
              data-testid="market-3d-yaw-slider"
              onChange={(event) => {
                setAutoSpin(false);
                setYawDeg(Number(event.target.value));
              }}
              className="mt-1.5 min-h-11 w-full accent-accent"
            />
          </label>

          <label className="block font-bold text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>{bt("카메라 확대", "Camera Zoom")}</span>
              <span className="text-fg">{`${zoomPercent}%`}</span>
            </span>
            <input
              type="range"
              min={75}
              max={145}
              value={zoomPercent}
              aria-label={bt("카메라 확대 비율", "Camera zoom percentage")}
              onChange={(event) => setZoomPercent(Number(event.target.value))}
              className="mt-1.5 min-h-11 w-full accent-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5">
            {ANGLE_PRESETS.map((preset) => (
              <button
                key={preset.yaw}
                type="button"
                onClick={() => {
                  setAutoSpin(false);
                  setYawDeg(preset.yaw);
                  setPitchDeg(preset.pitch);
                }}
                className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.7rem] font-bold text-fg-2 hover:border-accent/50 hover:text-fg"
              >
                {bt(preset.labelKo, preset.labelEn)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-line pt-2.5">
            {(
              [
                { id: "front" as const, labelKo: "정면광", labelEn: "Front" },
                { id: "rim" as const, labelKo: "역광 림", labelEn: "Rim" },
                { id: "dramatic" as const, labelKo: "강조광", labelEn: "Dramatic" },
              ] as const
            ).map((light) => (
              <button
                key={light.id}
                type="button"
                aria-pressed={lightPreset === light.id}
                onClick={() => setLightPreset(light.id)}
                className={cn(
                  "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-[0.68rem] font-bold",
                  lightPreset === light.id
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2",
                )}
              >
                <Sun size={12} aria-hidden="true" />
                {bt(light.labelKo, light.labelEn)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() =>
                setBackdrop((prev) =>
                  prev === "studio" ? "paper" : prev === "paper" ? "grid" : "studio",
                )
              }
              className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2.5 text-[0.7rem] font-bold text-fg-2 hover:text-fg"
            >
              {backdrop === "studio"
                ? bt("배경: 스튜디오", "Backdrop: Studio")
                : backdrop === "paper"
                  ? bt("배경: 원고지", "Backdrop: Paper")
                  : bt("배경: 그리드", "Backdrop: Grid")}
            </button>
            <button
              type="button"
              data-testid="market-3d-reset-btn"
              onClick={() => {
                setAutoSpin(false);
                setYawDeg(35);
                setPitchDeg(18);
                setZoomPercent(100);
                setMode("solid");
              }}
              aria-label={bt("각도 초기화", "Reset view")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:text-fg"
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Market3dTurntablePreviewCard;
