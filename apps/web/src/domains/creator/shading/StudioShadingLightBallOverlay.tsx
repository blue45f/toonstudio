/**
 * Studio Shading Light Ball Overlay — CSP 2.0+급 3D 구면 광원 볼 기즈모.
 *
 * 캔버스 위 플로팅 오버레이 또는 인스펙터 내장 위젯으로 동작하며, 포인터 드래그와
 * 키보드 화살표 조작으로 방위각·고도각·구면/방향광 모델·림라이트 강도를 실시간 바인딩한다.
 * 모든 시각 표현은 DESIGN.md 시맨틱 토큰과 OKLCH 색 공간만 사용한다.
 */
import { Compass, GripHorizontal, Move, Sparkles, Sun, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { shadingAssistLightVector, type ShadingAssistModel } from "../studio-shading-assist";

import type { KeyboardEvent, PointerEvent, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

/* eslint-disable react-refresh/only-export-components -- pure spherical light geometry and keyboard step helpers co-exported with overlay */

export const SHADING_LIGHT_BALL_ELEVATION_RANGE = {
  min: -45,
  max: 90,
  step: 1,
} as const;

export const SHADING_LIGHT_BALL_RIM_RANGE = {
  min: 0,
  max: 100,
  step: 1,
} as const;

export interface ShadingLightBallState {
  /** 화면 공간 방위각(0°=상단, 90°=우측, 180°=하단, 270°=좌측). */
  readonly azimuthDeg: number;
  /** 고도각(-45°=역광, 0°=측면광, 45°=표준 사광, 90°=정면 직광). */
  readonly elevationDeg: number;
  /** 음영 투영 모델: 구면 볼륨 또는 방향광 평면. */
  readonly shadingModel: ShadingAssistModel;
  /** 림라이트 강도(0..100%). */
  readonly rimLightStrength: number;
  /** 캔버스 오버레이 정규화 앵커 X(0.08..0.92). */
  readonly anchorX?: number;
  /** 캔버스 오버레이 정규화 앵커 Y(0.10..0.90). */
  readonly anchorY?: number;
}

export interface StudioShadingLightBallOverlayProps {
  readonly value: ShadingLightBallState;
  readonly onChange: (patch: Partial<ShadingLightBallState>) => void;
  readonly variant?: "embedded" | "canvas-overlay";
  readonly onClose?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const SPHERE_RADIUS = 54;
const SPHERE_CENTER = 72;
const BACKLIGHT_RING_EXTENT = 0.22;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeAzimuthDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 315;
  return Math.round(((deg % 360) + 360) % 360) % 360;
}

export function clampElevationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 45;
  return Math.round(clamp(deg, SHADING_LIGHT_BALL_ELEVATION_RANGE.min, SHADING_LIGHT_BALL_ELEVATION_RANGE.max));
}

/**
 * 광원 고도각(-45..90°)을 음영 경계 비율(coverage 15..90%)로 변환한다.
 * 정면광(90°)일수록 그림자가 좁고(25%), 측면광(0°)은 65%, 역광(-45°)은 85%까지 넓어진다.
 */
export function shadingElevationToCoverage(elevationDeg: number): number {
  const safeEl = clampElevationDeg(elevationDeg);
  return Math.round(clamp(65 - safeEl * 0.45, 15, 90));
}

/**
 * 구면 중심 기준 포인터 오프셋(dx, dy)을 화면 공간 방위각과 고도각으로 변환한다.
 */
export function shadingLightBallPointerToAngles(
  dx: number,
  dy: number,
  radiusPx: number,
): { readonly azimuthDeg: number; readonly elevationDeg: number } {
  const safeRadius = Math.max(1, radiusPx);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    return { azimuthDeg: 0, elevationDeg: 90 };
  }
  const rawAz = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const azimuthDeg = normalizeAzimuthDeg(rawAz);
  const normR = Math.min(1 + BACKLIGHT_RING_EXTENT, dist / safeRadius);
  const rawEl =
    normR <= 1
      ? 90 * (1 - normR)
      : -45 * ((normR - 1) / BACKLIGHT_RING_EXTENT);
  return {
    azimuthDeg,
    elevationDeg: clampElevationDeg(rawEl),
  };
}

/**
 * 방위각·고도각을 구면 기즈모 SVG 상의 광원 핸들 오프셋(x, y)으로 역변환한다.
 */
export function shadingAnglesToHandleOffset(
  azimuthDeg: number,
  elevationDeg: number,
  radiusPx: number,
): { readonly x: number; readonly y: number; readonly normalizedRadius: number } {
  const safeEl = clampElevationDeg(elevationDeg);
  const normalizedRadius =
    safeEl >= 0
      ? (90 - safeEl) / 90
      : 1 + (Math.abs(safeEl) / 45) * BACKLIGHT_RING_EXTENT;
  const [vx, vy] = shadingAssistLightVector(azimuthDeg);
  return {
    x: vx * normalizedRadius * radiusPx,
    y: vy * normalizedRadius * radiusPx,
    normalizedRadius,
  };
}

/**
 * 키보드 입력을 광원 볼 상태 변경 패치로 계산한다.
 * 화살표: 방위각 ±15° / 고도각 ±10° (Shift 미세조절 ±5° / ±2°), Home: 기본 사광 복귀,
 * M: 구면/방향광 전환, [/]: 림라이트 강도 ±10%.
 */
export function stepLightBallByKey(
  current: ShadingLightBallState,
  key: string,
  shiftKey = false,
): Partial<ShadingLightBallState> | null {
  const azStep = shiftKey ? 5 : 15;
  const elStep = shiftKey ? 2 : 10;
  const rimStep = shiftKey ? 5 : 10;

  switch (key) {
    case "ArrowLeft":
      return { azimuthDeg: normalizeAzimuthDeg(current.azimuthDeg - azStep) };
    case "ArrowRight":
      return { azimuthDeg: normalizeAzimuthDeg(current.azimuthDeg + azStep) };
    case "ArrowUp":
      return { elevationDeg: clampElevationDeg(current.elevationDeg + elStep) };
    case "ArrowDown":
      return { elevationDeg: clampElevationDeg(current.elevationDeg - elStep) };
    case "Home":
      return { azimuthDeg: 315, elevationDeg: 45 };
    case "m":
    case "M":
      return {
        shadingModel:
          current.shadingModel === "spherical-volume" ? "linear" : "spherical-volume",
      };
    case "[":
      return {
        rimLightStrength: Math.round(clamp(current.rimLightStrength - rimStep, 0, 100)),
      };
    case "]":
      return {
        rimLightStrength: Math.round(clamp(current.rimLightStrength + rimStep, 0, 100)),
      };
    default:
      return null;
  }
}

export function describeLightDirectionKo(azimuthDeg: number, elevationDeg: number): string {
  const az = normalizeAzimuthDeg(azimuthDeg);
  const el = clampElevationDeg(elevationDeg);
  const octants = [
    "상단",
    "우상단",
    "우측",
    "우하단",
    "하단",
    "좌하단",
    "좌측",
    "좌상단",
  ] as const;
  const sector = octants[Math.round(az / 45) % 8] ?? "좌상단";
  const depthLabel = el >= 68 ? "정면광" : el >= 18 ? "사광" : el >= 0 ? "측면광" : "역광";
  return `${sector} · ${depthLabel}`;
}

export function StudioShadingLightBallOverlay({
  value,
  onChange,
  variant = "embedded",
  onClose,
  disabled = false,
  className,
}: StudioShadingLightBallOverlayProps): ReactElement {
  const gradId = useId().replace(/:/g, "");
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const draggingSphereRef = useRef(false);
  const draggingFrameRef = useRef<{
    startClientX: number;
    startClientY: number;
    startAnchorX: number;
    startAnchorY: number;
  } | null>(null);
  const [draggingSphere, setDraggingSphere] = useState(false);

  const azimuthDeg = normalizeAzimuthDeg(value.azimuthDeg);
  const elevationDeg = clampElevationDeg(value.elevationDeg);
  const rimLightStrength = Math.round(clamp(value.rimLightStrength, 0, 100));
  const isSpherical = value.shadingModel === "spherical-volume";
  const anchorX = clamp(value.anchorX ?? 0.5, 0.08, 0.92);
  const anchorY = clamp(value.anchorY ?? 0.42, 0.1, 0.9);

  const handleOffset = shadingAnglesToHandleOffset(azimuthDeg, elevationDeg, SPHERE_RADIUS);
  const handleX = SPHERE_CENTER + handleOffset.x;
  const handleY = SPHERE_CENTER + handleOffset.y;
  const [lightVx, lightVy] = shadingAssistLightVector(azimuthDeg);
  const highlightFocalX = clamp(50 + handleOffset.x * 0.62, 16, 84);
  const highlightFocalY = clamp(50 + handleOffset.y * 0.62, 16, 84);
  const rimOpacity = (rimLightStrength / 100) * 0.92;
  const directionLabel = describeLightDirectionKo(azimuthDeg, elevationDeg);
  const modeLabel = isSpherical ? "구면 광원" : "방향광";

  useEffect(() => {
    if (variant !== "canvas-overlay" || !onClose) return;
    const onWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [variant, onClose]);

  const updateAnglesFromClientPoint = (clientX: number, clientY: number): void => {
    const node = sphereRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = rect.width || SPHERE_CENTER * 2;
    const height = rect.height || SPHERE_CENTER * 2;
    const cx = rect.left + width / 2;
    const cy = rect.top + height / 2;
    const effectiveRadius = (Math.min(width, height) / 2) * (SPHERE_RADIUS / SPHERE_CENTER);
    const next = shadingLightBallPointerToAngles(clientX - cx, clientY - cy, effectiveRadius);
    onChange(next);
  };

  const handleSpherePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return;
    event.preventDefault();
    draggingSphereRef.current = true;
    setDraggingSphere(true);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 일부 합성 테스트 이벤트는 pointerId 캡처를 지원하지 않는다.
      }
    }
    event.currentTarget.focus();
    updateAnglesFromClientPoint(event.clientX, event.clientY);
  };

  const handleSpherePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || !draggingSphereRef.current) return;
    updateAnglesFromClientPoint(event.clientX, event.clientY);
  };

  const finishSphereDrag = (): void => {
    if (!draggingSphereRef.current) return;
    draggingSphereRef.current = false;
    setDraggingSphere(false);
  };

  const handleSphereKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    if (event.key === "Escape" && variant === "canvas-overlay" && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    const patch = stepLightBallByKey(
      {
        azimuthDeg,
        elevationDeg,
        shadingModel: value.shadingModel,
        rimLightStrength,
      },
      event.key,
      event.shiftKey,
    );
    if (!patch) return;
    event.preventDefault();
    onChange(patch);
  };

  const handleOverlayMovePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || variant !== "canvas-overlay") return;
    event.preventDefault();
    draggingFrameRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAnchorX: anchorX,
      startAnchorY: anchorY,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 합성 이벤트 환경 허용
      }
    }
  };

  const handleOverlayMovePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = draggingFrameRef.current;
    if (disabled || !drag) return;
    const viewportW = Math.max(320, typeof window !== "undefined" ? window.innerWidth : 1280);
    const viewportH = Math.max(320, typeof window !== "undefined" ? window.innerHeight : 800);
    const nextX = clamp(drag.startAnchorX + (event.clientX - drag.startClientX) / viewportW, 0.08, 0.92);
    const nextY = clamp(drag.startAnchorY + (event.clientY - drag.startClientY) / viewportH, 0.1, 0.9);
    onChange({ anchorX: nextX, anchorY: nextY });
  };

  const finishOverlayMoveDrag = (): void => {
    draggingFrameRef.current = null;
  };

  // 방향광 모드 화살표 3줄 좌표
  const rayOffsets = [-22, 0, 22] as const;
  const perpX = -lightVy;
  const perpY = lightVx;

  const isOverlay = variant === "canvas-overlay";

  return (
    <div
      data-testid={isOverlay ? "studio-shading-light-ball-canvas-overlay" : "studio-shading-light-ball-gizmo"}
      data-shading-model={value.shadingModel}
      style={
        isOverlay
          ? {
              left: `${Math.round(anchorX * 100)}%`,
              top: `${Math.round(anchorY * 100)}%`,
              transform: "translate(-50%, -50%)",
            }
          : undefined
      }
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl border border-line bg-panel/95 p-3 text-xs text-fg [word-break:keep-all]",
        isOverlay
          ? "fixed z-40 w-64 shadow-xl backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
          : "w-full bg-card/75",
        className,
      )}
    >
      {isOverlay ? (
        <div className="flex items-center justify-between gap-1 border-b border-line/70 pb-1.5">
          <div
            data-testid="shading-light-ball-drag-handle"
            role="presentation"
            onPointerDown={handleOverlayMovePointerDown}
            onPointerMove={handleOverlayMovePointerMove}
            onPointerUp={finishOverlayMoveDrag}
            onPointerCancel={finishOverlayMoveDrag}
            className="flex min-h-11 flex-1 cursor-grab items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-fg active:cursor-grabbing"
          >
            <GripHorizontal size={15} className="text-fg-3" aria-hidden />
            <Move size={13} className="text-accent" aria-hidden />
            <span>캔버스 광원 볼</span>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="광원 볼 닫기"
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                TRANSITION_CLASS,
                STUDIO_FOCUS_RING,
              )}
            >
              <X size={15} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 구면 / 방향광 모드 전환 — 44px 터치 타깃 */}
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="광원 형태 선택">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={isSpherical}
          onClick={() => onChange({ shadingModel: "spherical-volume" })}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
            TRANSITION_CLASS,
            STUDIO_FOCUS_RING,
            isSpherical
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <Sun size={14} aria-hidden />
          <span>구면 광원</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!isSpherical}
          onClick={() => onChange({ shadingModel: "linear" })}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
            TRANSITION_CLASS,
            STUDIO_FOCUS_RING,
            !isSpherical
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <Compass size={14} aria-hidden />
          <span>방향광</span>
        </button>
      </div>

      {/* 인터랙티브 3D 구면 광원 볼 트랙 */}
      <div className="flex flex-col items-center gap-2">
        <div
          ref={sphereRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="광원 볼 위치 조절"
          aria-disabled={disabled}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={azimuthDeg}
          aria-valuetext={`방위각 ${azimuthDeg}도, 고도각 ${elevationDeg}도, ${modeLabel}, 림라이트 ${rimLightStrength}%`}
          data-testid="shading-light-ball-track"
          data-dragging={draggingSphere ? "true" : "false"}
          onPointerDown={handleSpherePointerDown}
          onPointerMove={handleSpherePointerMove}
          onPointerUp={finishSphereDrag}
          onPointerCancel={finishSphereDrag}
          onKeyDown={handleSphereKeyDown}
          className={cn(
            "relative flex size-36 select-none touch-none items-center justify-center rounded-full border border-line/80 bg-panel/80 shadow-inner",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
            STUDIO_FOCUS_RING,
          )}
        >
          <svg
            viewBox="0 0 144 144"
            className="size-36 overflow-visible [forced-color-adjust:none]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient
                id={`sphere-grad-${gradId}`}
                cx={`${highlightFocalX}%`}
                cy={`${highlightFocalY}%`}
                r="76%"
              >
                <stop offset="0%" stopColor="var(--color-warn)" stopOpacity={0.92} />
                <stop offset="46%" stopColor="var(--color-cool)" stopOpacity={0.72} />
                <stop offset="100%" stopColor="var(--color-canvas)" stopOpacity={0.96} />
              </radialGradient>
              <linearGradient
                id={`dir-grad-${gradId}`}
                x1={`${50 + lightVx * 50}%`}
                y1={`${50 + lightVy * 50}%`}
                x2={`${50 - lightVx * 50}%`}
                y2={`${50 - lightVy * 50}%`}
              >
                <stop offset="0%" stopColor="var(--color-warn)" stopOpacity={0.88} />
                <stop offset="52%" stopColor="var(--color-cool)" stopOpacity={0.62} />
                <stop offset="100%" stopColor="var(--color-canvas)" stopOpacity={0.96} />
              </linearGradient>
              <clipPath id={`sphere-clip-${gradId}`}>
                <circle cx={SPHERE_CENTER} cy={SPHERE_CENTER} r={SPHERE_RADIUS} />
              </clipPath>
            </defs>

            {/* 역광 외곽 궤도 링 */}
            <circle
              cx={SPHERE_CENTER}
              cy={SPHERE_CENTER}
              r={SPHERE_RADIUS * (1 + BACKLIGHT_RING_EXTENT)}
              fill="none"
              stroke="var(--color-line-strong)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            {/* 구면 본체 */}
            <circle
              cx={SPHERE_CENTER}
              cy={SPHERE_CENTER}
              r={SPHERE_RADIUS}
              fill={isSpherical ? `url(#sphere-grad-${gradId})` : `url(#dir-grad-${gradId})`}
              stroke="var(--color-line-strong)"
              strokeWidth={1.25}
            />

            {/* 구면 모드 위도/경도 가이드 vs 방향광 모드 평행 화살표 */}
            <g clipPath={`url(#sphere-clip-${gradId})`}>
              {isSpherical ? (
                <>
                  <ellipse
                    cx={SPHERE_CENTER}
                    cy={SPHERE_CENTER}
                    rx={SPHERE_RADIUS}
                    ry={SPHERE_RADIUS * 0.38}
                    fill="none"
                    stroke="var(--color-fg)"
                    strokeOpacity={0.22}
                    strokeWidth={1}
                  />
                  <ellipse
                    cx={SPHERE_CENTER}
                    cy={SPHERE_CENTER}
                    rx={SPHERE_RADIUS * 0.38}
                    ry={SPHERE_RADIUS}
                    fill="none"
                    stroke="var(--color-fg)"
                    strokeOpacity={0.22}
                    strokeWidth={1}
                  />
                </>
              ) : (
                rayOffsets.map((offset) => {
                  const sx = SPHERE_CENTER + lightVx * 36 + perpX * offset;
                  const sy = SPHERE_CENTER + lightVy * 36 + perpY * offset;
                  const ex = SPHERE_CENTER - lightVx * 26 + perpX * offset;
                  const ey = SPHERE_CENTER - lightVy * 26 + perpY * offset;
                  return (
                    <line
                      key={offset}
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke="var(--color-warn)"
                      strokeOpacity={0.72}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  );
                })
              )}

              {/* 광원 방향 실루엣 림라이트 호 */}
              {rimLightStrength > 0 ? (
                <circle
                  cx={SPHERE_CENTER - lightVx * 4}
                  cy={SPHERE_CENTER - lightVy * 4}
                  r={SPHERE_RADIUS - 1.5}
                  fill="none"
                  stroke="var(--color-warn)"
                  strokeOpacity={rimOpacity}
                  strokeWidth={1.5 + (rimLightStrength / 100) * 3.5}
                />
              ) : null}
            </g>

            {/* 중심 → 광원 핸들 연결선 */}
            <line
              x1={SPHERE_CENTER}
              y1={SPHERE_CENTER}
              x2={handleX}
              y2={handleY}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          </svg>

          {/* 44px 터치 타깃 광원 핸들 표시자 */}
          <span
            data-testid="shading-light-ball-handle"
            aria-hidden="true"
            style={{
              left: `${(handleX / 144) * 100}%`,
              top: `${(handleY / 144) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="pointer-events-none absolute flex min-h-11 min-w-11 items-center justify-center"
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border-2 border-on-accent bg-accent shadow-md",
                draggingSphere && "scale-110",
                TRANSITION_CLASS,
              )}
            >
              <span className="size-1.5 rounded-full bg-on-accent" />
            </span>
          </span>
        </div>

        {/* 실시간 각도·방향 요약 */}
        <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel/70 px-2.5 py-1.5 text-[0.72rem]">
          <span className="font-semibold text-fg-2">{directionLabel}</span>
          <span className="tabular-nums text-fg-3">
            방위 {azimuthDeg}° · 고도 {elevationDeg}°
          </span>
        </div>
      </div>

      {/* 림라이트 강도 실시간 바인딩 슬라이더 (44px 터치 높이) */}
      <label className="flex flex-col gap-1 text-[0.72rem] text-fg-2">
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 font-medium">
            <Sparkles size={12} className="text-accent" aria-hidden />
            <span>림라이트 강도</span>
          </span>
          <span className="font-semibold tabular-nums text-fg">{rimLightStrength}%</span>
        </span>
        <input
          type="range"
          aria-label="광원 볼 림라이트 강도"
          min={SHADING_LIGHT_BALL_RIM_RANGE.min}
          max={SHADING_LIGHT_BALL_RIM_RANGE.max}
          step={SHADING_LIGHT_BALL_RIM_RANGE.step}
          disabled={disabled}
          value={rimLightStrength}
          onChange={(event) => onChange({ rimLightStrength: Number(event.target.value) })}
          className="min-h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-45"
        />
      </label>

      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        구를 드래그하거나 방향키(←→ 방위, ↑↓ 고도, M 전환, [/] 림라이트)로 광원을 바로 조절할 수 있어요.
      </p>
    </div>
  );
}
